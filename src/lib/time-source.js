/**
 * Time Source — clock-provenance metadata for dispatch records (v6.9.x)
 *
 * Records the time-source posture required by the Markets in Financial
 * Instruments Directive II Regulatory Technical Standard 25, which mandates
 * a maximum clock divergence of one hundred microseconds from Coordinated
 * Universal Time for participants in markets where high-frequency algorithmic
 * trading occurs. Network Time Protocol is insufficient at that bound;
 * Precision Time Protocol per IEEE 1588 is the load-bearing technology.
 *
 * What this module does:
 *   - currentTimeSource() reads whatever the host can tell us about the local
 *     clock, returning a structured record { wall_clock_iso, monotonic_ns,
 *     source, last_known_drift_ms }. It interrogates chronyd on Linux when
 *     available, falls back to system metadata otherwise, never throws.
 *   - recordIntoDispatch(dispatch) mutates a dispatch record to include a
 *     `time_source` field; the audit-chain dispatch writer calls this before
 *     append so every audit entry carries clock provenance.
 *
 * Design notes:
 *   - Cross-platform: macOS, Linux, Windows. No native dependencies.
 *   - All external command invocations are wrapped in try/catch and fall back
 *     to a documented default. The library never throws to its caller.
 *   - When the `precision_time_protocol` control is active and this module
 *     cannot confirm a Precision-Time-Protocol-backed clock, the resulting
 *     dispatch carries source: 'unknown' which the integrator treats as a
 *     compliance gap.
 *   - The library does NOT itself enforce the one-hundred-microsecond bound;
 *     it records the posture so a separate compliance check can.
 *
 * References:
 *   - Markets in Financial Instruments Directive II Regulatory Technical
 *     Standard 25 clock synchronisation, Red Hat reference:
 *     https://www.redhat.com/en/blog/mifid-ii-rts-25-and-time-synchronisation-red-hat-enterprise-linux-and-red-hat-virtualization
 *   - Pico / Corvil ebook on MiFID II clock synchronisation best practices:
 *     https://www.pico.net/assets/resources/documents/ebook-mifid-ii-clock-synchronization-rts-25.pdf
 *   - Linux PTP project (the canonical user-space PTP daemon, ptp4l):
 *     https://linuxptp.sourceforge.net/
 *   - chrony (the recommended Network Time Protocol daemon on Red Hat
 *     Enterprise Linux derivatives, with hardware-timestamping support):
 *     https://chrony-project.org/
 *
 * Activated when the `precision_time_protocol` control is enabled by the
 * active regulatory regime (see src/lib/regulatory-regime.js). For non-
 * regulated projects, currentTimeSource() still works and reports
 * source: 'system' so dispatch records carry a uniform schema.
 */

'use strict';

const safeFs = require('./safe-fs');
const path = require('path');
const { execSync } = require('child_process');

const KNOWN_SOURCES = ['system', 'ntp', 'ptp', 'unknown'];

/**
 * Hard upper bound on time-source probe duration. The audit-chain writer
 * is on the hot path of every dispatch; we must not stall it.
 */
const PROBE_TIMEOUT_MS = 750;

/**
 * Run an external command with a tight timeout and return its trimmed
 * standard output, or null on any error. Never throws.
 *
 * @param {string} command
 * @param {Object} [opts]
 * @returns {string|null}
 */
function safeExec(command, opts) {
  try {
    const out = execSync(command, {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: (opts && opts.timeout) || PROBE_TIMEOUT_MS,
      encoding: 'utf8',
      maxBuffer: 256 * 1024,
    });
    return typeof out === 'string' ? out.trim() : null;
  } catch (_e) {
    return null;
  }
}

/**
 * Parse the output of `chronyc tracking` into a structured object.
 *
 * The output is a sequence of `Key : Value` lines. We extract the fields
 * the caller needs: leap status, reference identifier, stratum, and
 * (most importantly) the last-known offset.
 *
 * Example fragment:
 *   Reference ID    : 7F7F0101 (PHC0)
 *   Stratum         : 1
 *   Ref time (UTC)  : Mon May 19 09:30:00 2026
 *   System time     : 0.000004523 seconds slow of NTP time
 *   Last offset     : -0.000002104 seconds
 *   RMS offset      : 0.000003421 seconds
 *
 * @param {string} text
 * @returns {Object}
 */
function parseChronycTracking(text) {
  const fields = {};
  if (!text) return fields;
  for (const raw of text.split('\n')) {
    const m = raw.match(/^([^:]+?)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const value = m[2].trim();
    fields[key] = value;
  }
  return fields;
}

/**
 * Convert a `chronyc tracking` "Last offset" or "RMS offset" value to
 * milliseconds. The chronyc output formats the value as a decimal
 * number followed by " seconds" with an optional leading sign.
 *
 * Returns null when the input cannot be parsed.
 *
 * @param {string|undefined} value
 * @returns {number|null}
 */
function chronyOffsetToMs(value) {
  if (!value) return null;
  // Alternation (decimal first) matches the same numbers as `(-?\d+(?:\.\d+)?)`
  // without the nested quantifier that trips detect-unsafe-regex.
  const m = value.match(/(-?\d+\.\d+|-?\d+)\s*seconds?/);
  if (!m) return null;
  const seconds = parseFloat(m[1]);
  if (!Number.isFinite(seconds)) return null;
  return Math.abs(seconds) * 1000;
}

/**
 * Inspect whether chronyd is configured to discipline the local clock
 * against a Precision Time Protocol hardware reference. The signal we
 * look for is a `refclock PHC` line in the chrony configuration or a
 * reference identifier of the form `PHC*` in chronyc tracking output.
 *
 * @param {Object} fields - parsed `chronyc tracking` output
 * @param {string|null} chronyConf - contents of /etc/chrony.conf or null
 * @returns {boolean}
 */
function looksLikePtpBacked(fields, chronyConf) {
  const refId = fields['Reference ID'] || '';
  if (/\bPHC\d*\b/.test(refId)) return true;
  if (chronyConf && /^\s*refclock\s+PHC/m.test(chronyConf)) return true;
  return false;
}

/**
 * Read a file safely; return null on any error.
 * @param {string} filePath
 * @returns {string|null}
 */
function safeReadFile(filePath) {
  try {
    return safeFs.readFileSync(filePath, 'utf8');
  } catch (_e) {
    return null;
  }
}

/**
 * Linux probe: try chronyc tracking, then fall back to file-based hints.
 *
 * The chronyd daemon (the recommended Network Time Protocol implementation
 * on Red Hat Enterprise Linux and on Markets in Financial Instruments
 * Directive II compliant platforms documented in the Red Hat reference)
 * exposes its current discipline state through the `chronyc tracking`
 * command. We invoke it with a tight timeout and parse the result.
 *
 * @returns {Object} time source descriptor
 */
function probeLinux() {
  const trackingOut = safeExec('chronyc tracking');
  const sourcesOut = safeReadFile('/etc/chrony/sources') ||
                     safeReadFile('/etc/chrony.conf');

  if (trackingOut) {
    const fields = parseChronycTracking(trackingOut);
    const offsetMs = chronyOffsetToMs(fields['Last offset']) ||
                     chronyOffsetToMs(fields['RMS offset']);
    const ptpBacked = looksLikePtpBacked(fields, sourcesOut);
    return {
      source: ptpBacked ? 'ptp' : 'ntp',
      last_known_drift_ms: offsetMs,
      reference_identifier: fields['Reference ID'] || null,
      stratum: fields['Stratum'] ? Number(fields['Stratum']) : null,
      probe_method: 'chronyc tracking',
    };
  }

  // Fall back to ntpq -p if chrony is absent
  const ntpqOut = safeExec('ntpq -pn');
  if (ntpqOut) {
    return {
      source: 'ntp',
      last_known_drift_ms: null,
      reference_identifier: null,
      stratum: null,
      probe_method: 'ntpq -pn (chronyc not available)',
    };
  }

  // No daemon detected
  return {
    source: 'system',
    last_known_drift_ms: null,
    reference_identifier: null,
    stratum: null,
    probe_method: 'no time daemon detected',
  };
}

/**
 * macOS probe: macOS uses `timed` (system-managed) in modern releases.
 * `sntp` can be used to query an external server but doing so on the
 * hot path of every dispatch is unsafe — we read only the locally
 * recorded state via `systemsetup -getusingnetworktime` and
 * `systemsetup -getnetworktimeserver` when those are available.
 *
 * @returns {Object} time source descriptor
 */
function probeMacOs() {
  const usingNetworkTime = safeExec('systemsetup -getusingnetworktime');
  if (usingNetworkTime && /On$/i.test(usingNetworkTime.trim())) {
    const server = safeExec('systemsetup -getnetworktimeserver');
    return {
      source: 'ntp',
      last_known_drift_ms: null,
      reference_identifier: server ? server.replace(/^.*?:\s*/, '') : null,
      stratum: null,
      probe_method: 'systemsetup',
    };
  }
  // Reading state without elevated privileges may fail silently; treat as
  // system in that case rather than calling out to a remote server.
  return {
    source: 'system',
    last_known_drift_ms: null,
    reference_identifier: null,
    stratum: null,
    probe_method: 'macOS systemsetup unavailable or off',
  };
}

/**
 * Windows probe: w32tm /query /status reports whether the Windows Time
 * service is synchronised and the last successful sync time. PTP support
 * on Windows is limited; we report ntp when the service is active.
 *
 * @returns {Object} time source descriptor
 */
function probeWindows() {
  const status = safeExec('w32tm /query /status');
  if (status && /Leap Indicator/.test(status)) {
    // Look for a Last Successful Sync Time line; absence means no sync
    const synced = /Last Successful Sync Time:.*?\d/.test(status);
    return {
      source: synced ? 'ntp' : 'system',
      last_known_drift_ms: null,
      reference_identifier: extractFirstMatch(status, /Source:\s*(.+)/),
      stratum: extractFirstMatch(status, /Stratum:\s*(\d+)/) ?
        Number(extractFirstMatch(status, /Stratum:\s*(\d+)/)) : null,
      probe_method: 'w32tm /query /status',
    };
  }
  return {
    source: 'system',
    last_known_drift_ms: null,
    reference_identifier: null,
    stratum: null,
    probe_method: 'w32tm unavailable',
  };
}

/**
 * Extract the first capture group of the first match of a regular
 * expression, or null if no match.
 * @param {string} text
 * @param {RegExp} regex
 * @returns {string|null}
 */
function extractFirstMatch(text, regex) {
  if (!text) return null;
  const m = text.match(regex);
  return m && m[1] ? m[1].trim() : null;
}

/**
 * Public: return a structured description of the current time source.
 *
 * Always returns an object; never throws. The shape is:
 *   {
 *     wall_clock_iso: <string>,          // current wall clock in ISO 8601
 *     monotonic_ns:   <bigint as string>,// process.hrtime.bigint() value
 *     source:         <string>,          // one of KNOWN_SOURCES
 *     last_known_drift_ms: <number|null>,// best-effort drift estimate
 *     reference_identifier: <string|null>,
 *     stratum: <integer|null>,
 *     probe_method: <string>,            // explains how the probe was done
 *     platform: <string>,                // process.platform value
 *   }
 *
 * Callers in a Markets in Financial Instruments Directive II context
 * should additionally verify that source === 'ptp' and that
 * last_known_drift_ms is below their declared tolerance.
 *
 * @returns {Object}
 */
function currentTimeSource() {
  const platform = process.platform;
  let probe;

  try {
    if (platform === 'linux') {
      probe = probeLinux();
    } else if (platform === 'darwin') {
      probe = probeMacOs();
    } else if (platform === 'win32') {
      probe = probeWindows();
    } else {
      probe = {
        source: 'unknown',
        last_known_drift_ms: null,
        reference_identifier: null,
        stratum: null,
        probe_method: `unsupported platform: ${platform}`,
      };
    }
  } catch (_e) {
    // Belt-and-braces: any unexpected failure produces 'unknown', never
    // throws.
    probe = {
      source: 'unknown',
      last_known_drift_ms: null,
      reference_identifier: null,
      stratum: null,
      probe_method: 'probe threw and was caught',
    };
  }

  if (!KNOWN_SOURCES.includes(probe.source)) {
    probe.source = 'unknown';
  }

  // hrtime.bigint() returns a BigInt; serialise as a decimal string so the
  // record round-trips through JSON.
  let monotonicNs = '0';
  try {
    monotonicNs = process.hrtime.bigint().toString();
  } catch (_e) {
    monotonicNs = '0';
  }

  return {
    wall_clock_iso: new Date().toISOString(),
    monotonic_ns: monotonicNs,
    source: probe.source,
    last_known_drift_ms: probe.last_known_drift_ms,
    reference_identifier: probe.reference_identifier,
    stratum: probe.stratum,
    probe_method: probe.probe_method,
    platform,
  };
}

/**
 * Public: mutate a dispatch record to include the current time source.
 *
 * Audit-chain writers call this immediately before computing the dispatch
 * content hash so the recorded entry includes clock provenance. The
 * dispatch object is mutated in place and also returned for convenience.
 *
 * If the dispatch already has a `time_source` field (e.g. the caller
 * constructed it deliberately for a replay), this function does NOT
 * overwrite it — it preserves the caller's record.
 *
 * @param {Object} dispatch
 * @returns {Object} the same dispatch object, with time_source populated
 */
function recordIntoDispatch(dispatch) {
  if (!dispatch || typeof dispatch !== 'object') {
    return dispatch;
  }
  if (dispatch.time_source && typeof dispatch.time_source === 'object') {
    return dispatch; // caller-set, leave alone (supports deterministic replays)
  }
  dispatch.time_source = currentTimeSource();
  return dispatch;
}

/**
 * Read the project's declared clock-source posture from
 * .ctoc/audit/clock-source.yaml, if present. Returns null when the file
 * is absent or unreadable; never throws.
 *
 * The schema is documented at .ctoc/audit/clock-source.yaml and in
 * docs/REALTIME.md. The parser handles the minimal subset of YAML used
 * by that file (key: value, indented block scalars) without taking on a
 * YAML dependency.
 *
 * @param {string} projectRoot
 * @returns {Object|null}
 */
function readClockSourcePosture(projectRoot) {
  const filePath = path.join(projectRoot, '.ctoc', 'audit', 'clock-source.yaml');
  const content = safeReadFile(filePath);
  if (!content) return null;
  const posture = {};
  let inNotes = false;
  let notesBuffer = [];
  for (const raw of content.split('\n')) {
    if (inNotes) {
      // Inside a block-scalar: indented or blank lines belong to the
      // scalar; a line that starts at column zero with non-whitespace
      // ends the scalar.
      if (raw === '' || /^\s/.test(raw)) {
        notesBuffer.push(raw.replace(/^ {0,2}/, ''));
        continue;
      }
      posture.notes = notesBuffer.join('\n').trim();
      inNotes = false;
      notesBuffer = [];
    }
    const stripped = raw.replace(/#.*$/, '');
    if (!stripped.trim()) continue;
    const m = stripped.match(/^([a-z_]+):\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].trim();
    const value = m[2].trim();
    if (key === 'notes' && (value === '|' || value === '>' || value === '')) {
      inNotes = true;
      continue;
    }
    if (/^-?\d+$/.test(value)) {
      posture[key] = parseInt(value, 10);
    } else if (value === '') {
      posture[key] = null;
    } else {
      posture[key] = value.replace(/^["']|["']$/g, '');
    }
  }
  if (inNotes) {
    posture.notes = notesBuffer.join('\n').trim();
  }
  return posture;
}

/**
 * Best-effort compliance evaluation: compare the probed source and drift
 * against the declared posture. Returns a small structured verdict that
 * the integrator can use to emit a compliance finding. Never throws.
 *
 * Verdict shape:
 *   {
 *     ok: <boolean>,
 *     reason: <string|null>,
 *     observed_source: <string>,
 *     declared_profile: <string|null>,
 *     observed_drift_ms: <number|null>,
 *     tolerance_microseconds: <number|null>,
 *   }
 *
 * @param {string} projectRoot
 * @param {Object} [observed] - the output of currentTimeSource(); if not
 *                              supplied, a fresh probe is taken.
 * @returns {Object}
 */
function evaluateComplianceAgainstPosture(projectRoot, observed) {
  const posture = readClockSourcePosture(projectRoot);
  const probe = observed || currentTimeSource();
  if (!posture) {
    return {
      ok: probe.source !== 'unknown',
      reason: posture ? null : 'no .ctoc/audit/clock-source.yaml declared',
      observed_source: probe.source,
      declared_profile: null,
      observed_drift_ms: probe.last_known_drift_ms,
      tolerance_microseconds: null,
    };
  }
  const profile = posture.profile || 'best-effort';
  const tolerance = typeof posture.max_tolerated_drift_microseconds === 'number' ?
    posture.max_tolerated_drift_microseconds : null;

  let ok = true;
  let reason = null;

  if (profile === 'ptp' && probe.source !== 'ptp') {
    ok = false;
    reason = `declared profile 'ptp' but probe reports source='${probe.source}'`;
  } else if (profile === 'ntp' && !(probe.source === 'ntp' || probe.source === 'ptp')) {
    ok = false;
    reason = `declared profile 'ntp' but probe reports source='${probe.source}'`;
  }

  if (ok && tolerance !== null && typeof probe.last_known_drift_ms === 'number') {
    const observedMicros = probe.last_known_drift_ms * 1000;
    if (observedMicros > tolerance) {
      ok = false;
      reason = `observed drift ${observedMicros.toFixed(1)} microseconds exceeds declared tolerance ${tolerance}`;
    }
  }

  return {
    ok,
    reason,
    observed_source: probe.source,
    declared_profile: profile,
    observed_drift_ms: probe.last_known_drift_ms,
    tolerance_microseconds: tolerance,
  };
}

module.exports = {
  KNOWN_SOURCES,
  currentTimeSource,
  recordIntoDispatch,
  readClockSourcePosture,
  evaluateComplianceAgainstPosture,
  // exported for unit testability:
  parseChronycTracking,
  chronyOffsetToMs,
  looksLikePtpBacked,
};
