/**
 * Compliance-regime resolver (EC1-s2).
 *
 * One source of truth: `regulatory_regime.active_profiles` in
 * `.ctoc/settings.yaml`, read via `loadActiveProfiles()` in
 * `src/lib/regulatory-regime.js`. There is NO `compliance.mode` enum and NO
 * `settings.json` mirror — every answer is derived directly from the active
 * profile list, so the resolver and the regime system can never disagree.
 *
 * This module is the compliance-agent-facing API:
 *   - `shouldRunGdpr(projectRoot)`     — is the gdpr profile active?
 *   - `shouldRunEuAiAct(projectRoot)`  — is the EU AI Act high-risk profile active?
 *   - `writeActiveProfiles(projectRoot, profileNames)` — additively activate a
 *     profile by a TARGETED single-line replacement of `active_profiles:`,
 *     leaving every other block (crucially the hook-critical `enforcement` and
 *     `operations` blocks) byte-identical.
 *
 * Fail-open contract: reads never throw (missing/unknown/wrong-root ⇒ `false`);
 * writes never throw for expected inputs (they return `{ ok: false }`), so a
 * menu ride-along stays graceful.
 *
 * Dependency direction: lib → lib only. This module imports `regulatory-regime`
 * and `safe-fs` and NOTHING from hooks or commands. It deliberately exports no
 * function that can mutate a workflow gate key (the enforcement-mode or
 * review-gate settings): activating a compliance profile can never weaken a
 * human gate. (This invariant is asserted by tests/compliance-mode.test.js:
 * the module source names no such gate key.)
 *
 * Cross-platform: `path.join`, `safe-fs`, CRLF-tolerant regex.
 */

'use strict';

const path = require('path');
const safeFs = require('./safe-fs');
const { loadActiveProfiles } = require('./regulatory-regime');

const SETTINGS_REL = path.join('.ctoc', 'settings.yaml');

/** The gdpr profile name (matches .ctoc/regulatory-regimes/gdpr.yaml, EC1-s1). */
const GDPR_PROFILE = 'gdpr';

/** The EU AI Act high-risk profile name (the EXISTING shipped profile). */
const EU_AI_ACT_PROFILE = 'eu-ai-act-high-risk';

/**
 * The profile-name charset, CODE-ENFORCED (R3-A item 6). `writeActiveProfiles`
 * interpolates each name into a YAML line (`active_profiles: [a, b]`), so the
 * "closed enum, never free text" rule was a PROSE invariant enforced only by the
 * menu recipe's discipline. A caller that passed
 * `'x]\nenforcement:\n  mode: off'` would have injected a real YAML block and
 * disabled enforcement. The charset is now a runtime gate: a name that is not
 * lowercase-alphanumeric-plus-hyphen (starting alphanumeric) is REFUSED with
 * `{ok:false, error}` and NOTHING is written — settings.yaml stays byte-identical.
 * A newline, a bracket, a quote, or a colon can therefore never reach the file.
 */
const PROFILE_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Read the active profile list, never throwing.
 *
 * `loadActiveProfiles` already returns `{ profiles: [] }` for an absent
 * settings.yaml; this wrapper additionally swallows a non-string root (or any
 * unexpected error) so callers get `[]` rather than a crash.
 *
 * @param {*} projectRoot
 * @returns {string[]}
 */
function activeProfiles(projectRoot) {
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) return [];
  try {
    const { profiles } = loadActiveProfiles(projectRoot);
    return Array.isArray(profiles) ? profiles : [];
  } catch {
    return [];
  }
}

/**
 * Is the GDPR profile active for this project?
 *
 * Derived directly from `regulatory_regime.active_profiles`. Pass the CORRECT
 * `projectRoot`: a wrong or missing root silently returns `false` (documented
 * fail-open, not a crash — matching the regime system).
 *
 * @param {string} [projectRoot]
 * @returns {boolean}
 */
function shouldRunGdpr(projectRoot) {
  return activeProfiles(projectRoot).includes(GDPR_PROFILE);
}

/**
 * Is the EU AI Act high-risk profile active for this project?
 *
 * Same one-source-of-truth derivation and wrong-root ⇒ `false` contract as
 * {@link shouldRunGdpr}.
 *
 * @param {string} [projectRoot]
 * @returns {boolean}
 */
function shouldRunEuAiAct(projectRoot) {
  return activeProfiles(projectRoot).includes(EU_AI_ACT_PROFILE);
}

/**
 * Additively activate the given profile name(s) in `active_profiles` by a
 * TARGETED replacement of the single `active_profiles:` line in
 * `.ctoc/settings.yaml`. Never re-serializes the whole YAML, so every other
 * block — including the hook-critical `enforcement` and `operations` blocks —
 * stays byte-identical.
 *
 * Fail-open: missing file, no `active_profiles:` line, wrong root, or any fs
 * error returns `{ ok: false }` without corrupting the file.
 *
 * CHARSET GATE (R3-A item 6): every requested name must match
 * {@link PROFILE_NAME_RE}. A name that does not is REFUSED — `{ok:false, error}`,
 * no write at all — so the YAML-injection surface (`x]\nenforcement:\n  mode: off`)
 * is closed in code, not merely in prose. The check runs BEFORE any filesystem
 * write, so a rejected call leaves settings.yaml byte-identical.
 *
 * @param {string} projectRoot
 * @param {string[]} profileNames - profile name(s) to union into active_profiles
 * @returns {{ ok: boolean, profiles: string[], error?: string }}
 */
function writeActiveProfiles(projectRoot, profileNames) {
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) {
    return { ok: false, profiles: [] };
  }
  const requested = Array.isArray(profileNames)
    ? profileNames.filter(p => typeof p === 'string' && p.trim().length > 0).map(p => p.trim())
    : [];

  // Charset gate — BEFORE any read or write. One bad name refuses the WHOLE call:
  // a partial activation from a half-trusted list is never the safer outcome.
  const invalid = requested.filter(p => !PROFILE_NAME_RE.test(p));
  if (invalid.length > 0) {
    return {
      ok: false,
      profiles: [],
      error: `invalid profile name(s) ${JSON.stringify(invalid)} — a profile name must match ${PROFILE_NAME_RE} (closed enum, never free text). Nothing was written.`,
    };
  }

  const settingsPath = path.join(projectRoot, SETTINGS_REL);

  try {
    // 1. Missing file: never fabricate a hook-critical artifact.
    if (!safeFs.existsSync(settingsPath)) return { ok: false, profiles: [] };

    const existing = activeProfiles(projectRoot);

    // 2. Union existing + requested, preserving order (existing first), de-duped.
    const union = [...existing];
    for (const p of requested) if (!union.includes(p)) union.push(p);

    // Selecting `none` ⇒ requested is [] ⇒ nothing to add ⇒ no write.
    if (requested.length === 0) {
      return { ok: true, profiles: union };
    }

    const content = safeFs.readFileSync(settingsPath, 'utf8');

    // 3. Build the inline bracket list the regime parser round-trips.
    const inline = `active_profiles: [${union.join(', ')}]`;

    // 4. Replace ONLY the first active_profiles: line, preserving indentation.
    //    Static literal regex (no dynamic RegExp from untrusted input): the
    //    `m` flag + `.*$` is CRLF-tolerant.
    const lineRe = /^([ \t]*)active_profiles:.*$/m;
    const m = lineRe.exec(content);
    if (!m) return { ok: false, profiles: [] };

    // BLOCK-STYLE GUARD. If the matched `active_profiles:` line carries no inline
    // value (only whitespace and/or a trailing comment after the colon), the list
    // items live on following `- item` lines. A single-line inline replace would
    // leave those `- item` lines dangling under the new `[...]` value → invalid
    // YAML a real parser rejects, while CTOC's own regex reader tolerates the
    // garbage and this function would falsely report ok:true. Refuse rather than
    // corrupt: return the existing profiles and write NOTHING (byte-identical).
    // String-sliced (no dynamic/backtracking regex): take everything after the
    // first colon, drop a trailing `#` comment, and treat blank as block style.
    const afterColon = m[0].slice(m[0].indexOf(':') + 1);
    const inlineValue = afterColon.split('#')[0].trim();
    if (inlineValue === '') {
      return { ok: false, profiles: existing };
    }

    const updated = content.replace(lineRe, `$1${inline}`);

    // 5. Write back.
    safeFs.writeFileSync(settingsPath, updated);

    // 6. Round-trip verify through the real reader.
    const after = activeProfiles(projectRoot);
    const ok = requested.every(p => after.includes(p));
    return { ok, profiles: after };
  } catch {
    // fs / parse error ⇒ fail-open for the menu ride-along.
    return { ok: false, profiles: [] };
  }
}

/**
 * Locate the `regulatory_regime:` block's BODY inside a settings.yaml text (R3-A
 * item 6). The body runs from just after the header line to the next TOP-LEVEL key
 * (a line beginning with a non-space, non-`#` character) or end of file — the same
 * YAML shape the reader of record parses. Pure: no I/O, no dynamic RegExp.
 *
 * @param {string} content - the settings.yaml text
 * @returns {{start: number, end: number, body: string}|null} the body's character
 *   range within `content`, or `null` when the block is absent.
 */
function regulatoryRegimeRegion(content) {
  const headerRe = /^regulatory_regime:[ \t]*\r?\n/m;
  const m = headerRe.exec(content);
  if (!m) return null;
  const start = m.index + m[0].length;
  // The next top-level key ends the block. `[^\s#]` = a non-indented, non-comment
  // line start; anchored per-line with `m`, searched from `start` on the remainder.
  const rest = content.slice(start);
  const nextTop = /^[^\s#][^\n]*$/m.exec(rest);
  const end = nextTop ? start + nextTop.index : content.length;
  return { start, end, body: content.slice(start, end) };
}

/**
 * Persist a durable "None" decision (R2-C2 item 1 / R1). Answering "None" to the
 * compliance ride-along must STOP the menu re-asking — but `writeActiveProfiles([])`
 * is a deliberate no-op (an empty list is not the same as "the human declined"),
 * so "None" is a SEPARATE verb: it writes a fixed-literal `declined: true` marker
 * INSIDE the `regulatory_regime:` block. The reader of record
 * (regulatory-regime.js loadActiveProfiles) exposes it as `.declined`, which
 * `needsComplianceRegimePrompt` (menu.js) honors.
 *
 * Truth table (settings.yaml):
 *   missing file            → { ok:false }  (never fabricate a hook-critical file)
 *   block present, no marker → insert `  declined: true` after the header → ok
 *   block present, marker    → set it true (idempotent) → ok
 *   NO regulatory_regime block (legacy) → CREATE the block with the marker → ok
 *     (a decline must persist; it does NOT fail-open like writeActiveProfiles,
 *      whose refusal protects an ADDITIVE activation, not a human's explicit "no")
 *
 * SECURITY: the marker is a FIXED LITERAL (`declined: true`) — no caller value is
 * interpolated, so there is no yaml-injection surface. It touches ONLY the
 * regulatory_regime block, never a workflow-gate key, so it cannot weaken a human
 * gate. Fail-open for expected inputs (bad root / fs error ⇒ { ok:false }), never
 * throws.
 *
 * @param {string} projectRoot
 * @returns {{ ok: boolean, declined?: boolean }}
 */
function declineComplianceRegime(projectRoot) {
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) return { ok: false };
  const settingsPath = path.join(projectRoot, SETTINGS_REL);
  try {
    // Never fabricate the hook-critical settings.yaml (mirror writeActiveProfiles).
    if (!safeFs.existsSync(settingsPath)) return { ok: false };

    let content = safeFs.readFileSync(settingsPath, 'utf8');
    // Static literal regexes only (no dynamic RegExp from any input); `m` + `\r?\n`
    // are CRLF-tolerant for a Windows checkout.
    const declinedRe = /^([ \t]*)declined:[ \t]*.*$/m;
    const headerRe = /^(regulatory_regime:[ \t]*)\r?\n/m;

    // BLOCK-SCOPED marker (R3-A item 6). The `declined:` regex used to run over the
    // WHOLE file and rewrite the FIRST `declined:` line anywhere — so an unrelated
    // `declined:` key in another block (e.g. `operations:`) was silently flipped to
    // true and the compliance decline was recorded in the wrong block (where the
    // reader of record never looks). The search is now confined to the
    // `regulatory_regime:` block region: from its header line to the next TOP-LEVEL
    // key (a line starting with a non-space, non-comment character) or end of file.
    const region = regulatoryRegimeRegion(content);
    if (region && declinedRe.test(region.body)) {
      // Existing marker (or a false one) INSIDE the block → set it true. Idempotent.
      const newBody = region.body.replace(declinedRe, '$1declined: true');
      content = content.slice(0, region.start) + newBody + content.slice(region.end);
    } else if (headerRe.test(content)) {
      // Block present, no marker → insert an indented marker right after the header.
      content = content.replace(headerRe, (_m, header) => `${header}\n  declined: true\n`);
    } else {
      // Legacy project: no regulatory_regime block at all → create it. A decline is
      // an explicit human choice and MUST persist (not fail-open). PREPEND the block
      // (rather than append) so the reader-of-record's block regex — which needs a
      // following top-level key to anchor its non-greedy body — can always resolve
      // it, even when the file had no trailing block after regulatory_regime.
      const tail = content.length === 0 ? '' : (content.startsWith('\n') ? '' : '\n') + content;
      content = `regulatory_regime:\n  declined: true\n${tail}`;
    }

    safeFs.writeFileSync(settingsPath, content);

    // Round-trip verify through the reader of record.
    const { declined } = loadActiveProfiles(projectRoot);
    return { ok: declined === true, declined: declined === true };
  } catch {
    return { ok: false };
  }
}

module.exports = {
  shouldRunGdpr,
  shouldRunEuAiAct,
  writeActiveProfiles,
  declineComplianceRegime,
};
