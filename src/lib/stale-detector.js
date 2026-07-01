'use strict';

/**
 * src/lib/stale-detector.js — SP1 cheap, filesystem-only stale-plan candidate scan.
 *
 * Leaf module: depends ONLY on the Node built-ins `fs` and `path`. It does not
 * require any project module and never invokes git or any subprocess. The cheap
 * pass is the foundation SP2 consumes, SP3 appends to, and SP5 imports for
 * fixture validation.
 *
 * The pass emits exactly two signals:
 *   - `missing-files` (actionable, all three gate-source stages) — a declared
 *     `files:` path no longer exists on disk.
 *   - `advisory:age`  (advisory-only, all three stages) — the plan file mtime is
 *     older than the 14-day threshold. mtime is ADVISORY and BEST-EFFORT ONLY:
 *     `git checkout` rewrites working-tree mtimes to the checkout time, so mtime
 *     reflects the last checkout/write, not when the plan was authored. Age never
 *     makes a candidate actionable on its own (the HYBRID "age never acts alone"
 *     rule).
 *
 * No marker-based signal exists: the human approval marker carries zero
 * discriminating power at the gate-source stages (every review plan has it from
 * crossing Gate 2; functional plans never have it), so it is not read at all (F1).
 *
 * @typedef {('functional'|'implementation'|'review')} GateSourceStage
 *
 * @typedef {('missing-files'|'advisory:age')} StaleSignal
 *
 * @typedef {Object} StaleCandidate
 * @property {string}          plan       Plan slug = filename without `.md`
 *                                          (matches inbox.js listPlansAtGates).
 * @property {GateSourceStage} stage      The gate SOURCE stage it was found in.
 * @property {StaleSignal[]}   signals    Non-empty, canonical order: actionable
 *                                          (missing-files) first, advisory
 *                                          (advisory:age) last.
 * @property {boolean}         actionable true iff signals contains missing-files;
 *                                          advisory:age alone ⇒ false.
 *
 * @typedef {Object} CheapScanResult
 * @property {StaleCandidate[]} candidates Plans (in gate-source stages) that
 *                                          emitted ≥ 1 signal. Zero-signal plans
 *                                          are omitted entirely.
 * @property {number}          count       === candidates.length.
 */

const safeFs = require('./safe-fs');
const path = require('path');

/** 14-day advisory age threshold, in milliseconds. */
const AGE_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Upper bound on a plan file we will read into memory on the menu hot path.
 * 1 MiB is generous for a markdown plan (the largest real plans are tens of KiB).
 * Any larger file is size-gated out BEFORE the read so a pathological or
 * accidental huge file cannot stall the hot path or balloon memory.
 */
const MAX_PLAN_BYTES = 1 << 20; // 1 MiB

/**
 * The three gate-SOURCE stages scanned by the cheap pass, in fixed gate order.
 * SP1's own frozen copy — inbox.js does not export its equivalent, and editing
 * inbox.js is out of scope (SP2 owns it).
 * @type {ReadonlyArray<GateSourceStage>}
 */
const GATE_SOURCE_STAGES = Object.freeze(['functional', 'implementation', 'review']);

/**
 * Concatenate the bodies of EVERY consecutive leading `---…---` frontmatter
 * block into one combined region string.
 *
 * Load-bearing: `files:` is a metadata-block key, but on an approved plan the
 * first `---…---` block is the prepended approval marker (no `files:` there) and
 * the metadata block is the SECOND block. Reading only the first block (as
 * inbox.js's scalar parseFrontmatter does) would miss `files:` entirely, so
 * `missing-files` would never fire on approved plans. Combining all leading
 * blocks makes `parseFilesField` find `files:` regardless of which leading block
 * it lives in.
 *
 * Returns `''` on missing or unterminated frontmatter — never throws on a
 * structural irregularity.
 *
 * @param {string} content Full file contents.
 * @returns {string} Combined frontmatter body (block contents joined by `\n`).
 */
function extractFrontmatterRegion(content) {
  if (typeof content !== 'string' || content.length === 0) return '';
  // Split on CRLF or LF so a Windows checkout (CRLF) does not leave a trailing
  // `\r` on every line — which would defeat the `---`/`files:`/dash regexes and
  // silently suppress `missing-files`.
  const lines = content.split(/\r?\n/);
  const bodies = [];
  let i = 0;
  // Skip leading blank lines before the first block.
  while (i < lines.length && lines[i].trim() === '') i++;
  while (i < lines.length && lines[i].trim() === '---') {
    // Found a block opener at line i; collect until the closing '---'.
    let j = i + 1;
    const body = [];
    let closed = false;
    while (j < lines.length) {
      if (lines[j].trim() === '---') {
        closed = true;
        break;
      }
      body.push(lines[j]);
      j++;
    }
    if (!closed) {
      // Unterminated block — ignore it and stop (no throw).
      break;
    }
    bodies.push(body.join('\n'));
    i = j + 1;
    // Skip blank lines between consecutive leading blocks.
    while (i < lines.length && lines[i].trim() === '') i++;
  }
  return bodies.join('\n');
}

/**
 * Strip a trailing YAML line comment (a `#` preceded by whitespace, through end
 * of line). A `#` NOT preceded by whitespace is preserved as part of the value
 * (so a hypothetical `a#b.js` survives intact). F5.
 * @param {string} s
 * @returns {string}
 */
function stripTrailingComment(s) {
  const m = s.match(/\s#.*$/);
  return m ? s.slice(0, m.index) : s;
}

/**
 * Strip a single pair of surrounding quotes (single or double) from a value.
 * @param {string} s
 * @returns {string}
 */
function stripQuotes(s) {
  return s.replace(/^["']|["']$/g, '');
}

/**
 * Strip C0/C1 control characters (incl. ESC) from a string. Local twin of
 * menu-screens.js `stripCtl`, kept here so the ANSI-injection invariant holds at
 * the point of CAPTURE, not just at render: any commit-message-derived string
 * stored in evidence (e.g. the slug-match commit subject) is sanitized BEFORE it
 * leaves this module, so a hostile commit subject can never carry escape
 * sequences into a future renderer (SP4) regardless of that renderer's own
 * hygiene. Pure string op — no import.
 * @param {string} s
 * @returns {string}
 */
function stripCtlChars(s) {
  return String(s).replace(/[\x00-\x1f\x7f-\x9f]/g, '');
}

/**
 * Parse a single block-list item value, resolving the ordering hazard between
 * quote-stripping and comment-stripping.
 *
 * A QUOTED value is taken literally between its matching quotes, so a
 * whitespace-preceded `#` INSIDE the quotes (`"src/weird #name.js"`) is part of
 * the path and is NOT treated as a comment — while a real trailing comment AFTER
 * the closing quote (`"src/q.js"  # note`) is still discarded. An UNQUOTED value
 * has any trailing ` #…` comment stripped (F5); a `#` not preceded by whitespace
 * (`a#b.js`) is preserved.
 *
 * This makes block-list parsing consistent with the inline-array form, which
 * never comment-strips a quoted entry.
 * @param {string} raw The captured dash-item text.
 * @returns {string}
 */
function parseListItem(raw) {
  const t = raw.trim();
  const q = t[0];
  if (q === '"' || q === "'") {
    const end = t.indexOf(q, 1);
    if (end > 0) return t.slice(1, end); // literal between quotes; ignore any trailing comment
    // Unterminated quote — fall through to the unquoted path.
  }
  return stripQuotes(stripTrailingComment(t).trim());
}

/**
 * Sequence-aware parser for the `files:` frontmatter key. Handles both YAML
 * syntaxes plus defensible edge cases. Returns the declared file paths.
 *
 * - Inline-array (`files: [a.js, b.js]`) — split on `,`, trim, strip quotes,
 *   drop empties. `files: []` ⇒ `[]`.
 * - Scalar single value (`files: src/lib/x.js`) — tolerated as a one-element
 *   list; quotes stripped.
 * - Block-list (`files:` then `  - path` lines) — each dash-item line is an
 *   entry; trailing line comments stripped (F5); collection stops at the first
 *   non-dash line (frontmatter sequences are contiguous).
 *
 * @param {string} region Combined frontmatter region from extractFrontmatterRegion.
 * @returns {string[]} Declared file paths (possibly empty).
 */
function parseFilesField(region) {
  if (typeof region !== 'string' || region.length === 0) return [];
  // CRLF-safe split (see extractFrontmatterRegion): a trailing `\r` would break
  // the `files:` and dash-item regexes on a Windows checkout.
  const lines = region.split(/\r?\n/);
  let idx = -1;
  let rest = '';
  for (let k = 0; k < lines.length; k++) {
    const m = lines[k].match(/^files:[ \t]*(.*)$/);
    if (m) {
      idx = k;
      rest = m[1].trim();
      break;
    }
  }
  if (idx === -1) return [];

  // Inline-array syntax.
  if (rest.startsWith('[')) {
    const close = rest.lastIndexOf(']');
    const inner = close > 0 ? rest.slice(1, close) : rest.slice(1);
    return inner
      .split(',')
      .map((p) => stripQuotes(p.trim()))
      .filter((p) => p.length > 0);
  }

  // Scalar single value on the same line.
  if (rest.length > 0) {
    const v = stripQuotes(stripTrailingComment(rest).trim());
    return v.length > 0 ? [v] : [];
  }

  // Block-list syntax: walk subsequent dash-item lines.
  const out = [];
  for (let k = idx + 1; k < lines.length; k++) {
    const dash = lines[k].match(/^[ \t]*-[ \t]*(.+?)[ \t]*$/);
    if (!dash) break; // stop at first non-dash line (new key or blank)
    const v = parseListItem(dash[1]);
    if (v.length > 0) out.push(v);
  }
  return out;
}

/**
 * Resolve a declared (repo-root-relative, possibly POSIX-authored) path under
 * `root` cross-platform: split on any separator run, drop empty/leading-separator
 * segments, rejoin with path.join. Read-only existence check only.
 * @param {string} root
 * @param {string} declared
 * @returns {boolean} true if the path exists under root.
 */
function declaredFileExists(root, declared) {
  // Drop empty/leading-separator segments AND `.`/`..` so a declared path can
  // never climb above `root` (e.g. `files: ['../../etc/passwd']` is neutralized
  // to a repo-root-relative `etc/passwd`). Declared paths are developer-authored
  // and used for existence checks only, but filtering keeps the "under root"
  // guarantee literal rather than incidental.
  const parts = declared.split(/[\\/]+/).filter((p) => p.length > 0 && p !== '.' && p !== '..');
  if (parts.length === 0) return true; // nothing meaningful to check
  return safeFs.existsSync(path.join(root, ...parts));
}

/**
 * Detect the `missing-files` signal: fires when ≥ 1 declared path is absent.
 * @param {string} root
 * @param {string[]} declared
 * @returns {boolean}
 */
function hasMissingFiles(root, declared) {
  if (!declared || declared.length === 0) return false;
  return declared.some((rel) => !declaredFileExists(root, rel));
}

/**
 * @typedef {Object} StaleEvidence
 * @property {boolean}  gitAvailable          false ⇒ git binary missing / not a repo / probe failed ⇒ classifier ⇒ inconclusive.
 * @property {?string}  error                 execFile error message when gitAvailable is false, else null.
 * @property {?string}  approvedBy            value of approved_by re-read from frontmatter (e.g. 'human'), else null.
 * @property {string[]} declaredFiles         files: parsed from the plan (POSIX-authored).
 * @property {boolean}  allFilesExist         every declared file exists under root (verify-confirmed; [] ⇒ true).
 * @property {boolean}  anyFileMissing        at least one declared file is absent under root.
 * @property {?number}  stageEntryEpoch       %ct of the OLDEST commit touching plans/<stage>/<slug>.md (current path), else null.
 * @property {?number}  filesLastModifiedEpoch MAX %ct across declared files' last-modifying commits, else null.
 * @property {boolean}  filesModifiedAfterEntry  filesLastModifiedEpoch > stageEntryEpoch (false if either null).
 * @property {Array<{shortHash:string, dateISO:string, subject:string}>} slugMatchCommits  commits whose message matches \bslug\b.
 * @property {boolean}  slugMatchAfterEntry   ≥1 slugMatch commit with %ct > stageEntryEpoch.
 * @property {boolean}  explicitlyRejected    positive death evidence; SP3 default false.
 *
 * @typedef {Object} StaleProposal
 * @property {string}  plan  candidate.plan (slug).
 * @property {('shipped-but-early'|'approved-but-stranded'|'dead-on-arrival'|'inconclusive')} category
 * @property {('archive-to-done'|'advance-via-reconciliation'|'revert'|'delete'|null)} proposedAction
 * @property {string[]} evidence  human-readable evidence lines derived from StaleEvidence.
 */

/**
 * Explicit-trigger git verification of a single cheap candidate. The ONLY
 * function in this module that may invoke a subprocess — and it is invoked ONLY
 * from the cold-path menu screen `inboxVerifyProposals`, never on the hot path.
 *
 * Degrades, never throws, on data faults: an unreadable plan ⇒ empty content;
 * git binary missing / not-a-repo / timeout ⇒ `gitAvailable:false`; a per-path
 * query failure ⇒ that datum is null. Only argument MISUSE throws (TypeError),
 * consistent with `scanCheapCandidates`.
 *
 * Subprocess is spawned via `execFileSync('git', [argv])` — NEVER a shell string;
 * no slug/path/message is interpolated into a command, so shell metacharacters
 * cannot inject. The `\bslug\b` (case-insensitive) match is applied in JS to git
 * stdout. Date comparisons use `%ct` (UNIX epoch integer).
 *
 * @param {{plan: string, stage: string, signals?: string[], actionable?: boolean}} candidate
 *        one item from scanCheapCandidates().candidates (StaleCandidate; typed
 *        structurally so the cheap-scan return widening stays assignable).
 * @param {string} root project root (directory containing plans/).
 * @param {{ slugHistoryCache?: {records?: Array<{ct:number, shortHash:string, message:string}>} }} [opts]
 *        when supplied, the full-history slug scan (`git log -n 2000`) is run at
 *        most once and shared across candidates via this cache object.
 * @returns {StaleEvidence}
 * @throws {TypeError} on misuse only.
 */
function verifyStaleCandidate(candidate, root, opts = {}) {
  if (
    !candidate ||
    typeof candidate !== 'object' ||
    typeof candidate.plan !== 'string' ||
    candidate.plan.length === 0 ||
    typeof candidate.stage !== 'string' ||
    candidate.stage.length === 0
  ) {
    throw new TypeError('verifyStaleCandidate: candidate must have non-empty string plan and stage');
  }
  if (typeof root !== 'string' || root.length === 0) {
    throw new TypeError('verifyStaleCandidate: root must be a non-empty string');
  }

  // Lazy require co-located with the sole subprocess user. Module load stays
  // side-effect-free and subprocess-free.
  const cp = require('child_process');
  const runGit = (args) =>
    cp
      .execFileSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'], // ignore git stderr
      })
      .trim();

  // 2. Re-read the plan file (verify-only; the cheap scan does NOT read approved_by).
  const planFsPath = path.join(root, 'plans', candidate.stage, candidate.plan + '.md');
  let content = '';
  try {
    content = safeFs.readFileSync(planFsPath, 'utf8');
  } catch {
    content = ''; // degrade; do not throw
  }
  const region = extractFrontmatterRegion(content);
  const declaredFiles = parseFilesField(region);
  const approvedMatch = region.match(/^approved_by:[ \t]*(.+?)[ \t]*$/m);
  const approvedBy = approvedMatch ? stripQuotes(approvedMatch[1].trim()) || null : null;

  // 3. File-tree truth (reuse the internal existence check).
  const allFilesExist = declaredFiles.every((f) => declaredFileExists(root, f));
  const anyFileMissing = declaredFiles.some((f) => !declaredFileExists(root, f));

  const degraded = (error) => ({
    gitAvailable: false,
    error,
    approvedBy,
    declaredFiles,
    allFilesExist,
    anyFileMissing,
    stageEntryEpoch: null,
    filesLastModifiedEpoch: null,
    filesModifiedAfterEntry: false,
    slugMatchCommits: [],
    slugMatchAfterEntry: false,
    explicitlyRejected: false,
  });

  // 4. Git availability probe (Risk R2). Any throw ⇒ degraded evidence, never rethrow.
  try {
    runGit(['rev-parse', '--is-inside-work-tree']);
  } catch (e) {
    return degraded(e && e.message ? e.message : String(e));
  }

  // 5. Stage-entry epoch = OLDEST (last) commit TOUCHING the plan at its current
  // path (no --follow). POSIX forward slashes for the git pathspec.
  let stageEntryEpoch = null;
  try {
    const planPosix = ['plans', candidate.stage, candidate.plan + '.md'].join('/');
    const out = runGit(['log', '--format=%ct', '--', planPosix]);
    const lines = out.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length > 0) {
      const n = Number(lines[lines.length - 1].trim());
      stageEntryEpoch = Number.isFinite(n) ? n : null;
    }
  } catch {
    stageEntryEpoch = null;
  }

  // 6. Files last-modified epoch = MAX %ct across declared files' last commits.
  let filesLastModifiedEpoch = null;
  for (const f of declaredFiles) {
    const decl = f.replace(/\\/g, '/');
    try {
      const out = runGit(['log', '-1', '--format=%ct', '--', decl]);
      const trimmed = out.trim();
      const n = Number(trimmed);
      if (trimmed.length > 0 && Number.isFinite(n)) {
        if (filesLastModifiedEpoch === null || n > filesLastModifiedEpoch) filesLastModifiedEpoch = n;
      }
    } catch {
      // per-path failure ⇒ skip this datum
    }
  }
  const filesModifiedAfterEntry =
    filesLastModifiedEpoch != null && stageEntryEpoch != null && filesLastModifiedEpoch > stageEntryEpoch;

  // 7. Slug-match commits. The full-history read is hoisted to ONE shared scan
  // across all candidates via opts.slugHistoryCache (cleanup #4): the git call
  // still lives ONLY inside this function (sole git site), but the cache
  // short-circuits repeated reads within one inboxVerifyProposals pass.
  let records;
  const cache = opts && opts.slugHistoryCache;
  if (cache && Array.isArray(cache.records)) {
    records = cache.records;
  } else {
    records = [];
    try {
      // \x1f unit-separator between fields, \x1e record-terminator; capped at -n 2000.
      const raw = runGit(['log', '--format=%ct%x1f%h%x1f%B%x1e', '-n', '2000']);
      for (const rec of raw.split('\x1e')) {
        if (!rec.trim()) continue;
        const i1 = rec.indexOf('\x1f');
        const i2 = rec.indexOf('\x1f', i1 + 1);
        if (i1 === -1 || i2 === -1) continue;
        const ct = Number(rec.slice(0, i1).trim());
        const shortHash = rec.slice(i1 + 1, i2).trim();
        const message = rec.slice(i2 + 1);
        records.push({ ct, shortHash, message });
      }
    } catch {
      records = [];
    }
    if (cache) cache.records = records;
  }

  const re = new RegExp('\\b' + candidate.plan.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
  const slugMatchCommits = [];
  let slugMatchAfterEntry = false;
  for (const r of records) {
    if (!Number.isFinite(r.ct)) continue;
    if (re.test(r.message)) {
      slugMatchCommits.push({
        shortHash: r.shortHash,
        dateISO: new Date(r.ct * 1000).toISOString().slice(0, 10),
        // Invariant: subject is stripped of C0/C1 control chars AT CAPTURE so a
        // hostile commit subject cannot inject ANSI/escape sequences downstream.
        subject: stripCtlChars((r.message.split(/\r?\n/)[0] || '').trim()),
      });
      if (stageEntryEpoch != null && r.ct > stageEntryEpoch) slugMatchAfterEntry = true;
    }
  }

  return {
    gitAvailable: true,
    error: null,
    approvedBy,
    declaredFiles,
    allFilesExist,
    anyFileMissing,
    stageEntryEpoch,
    filesLastModifiedEpoch,
    filesModifiedAfterEntry,
    slugMatchCommits,
    slugMatchAfterEntry,
    explicitlyRejected: false,
  };
}

/**
 * Build human-readable evidence lines from a StaleEvidence object. Pure string
 * formatting — no I/O, no mutation.
 * @param {StaleEvidence} evidence
 * @returns {string[]}
 */
function buildEvidenceLines(evidence) {
  const lines = [];
  if (evidence.approvedBy) lines.push('approved_by: ' + evidence.approvedBy);
  if (evidence.slugMatchCommits && evidence.slugMatchCommits.length > 0) {
    const c = evidence.slugMatchCommits[0];
    lines.push(
      'slug matched in ' +
        c.shortHash +
        ' (' +
        c.dateISO +
        ')' +
        (evidence.slugMatchAfterEntry ? ', after stage entry' : '')
    );
  }
  const n = evidence.declaredFiles ? evidence.declaredFiles.length : 0;
  if (n > 0) {
    if (evidence.anyFileMissing) {
      lines.push('at least one of ' + n + ' declared file(s) missing');
    } else if (evidence.allFilesExist) {
      lines.push(
        'all ' + n + ' declared files present' +
          (evidence.filesModifiedAfterEntry ? '; last change after stage entry' : '')
      );
    }
  }
  if (lines.length === 0) lines.push('age-only signal; no shipping evidence');
  return lines;
}

/**
 * Pure, deterministic classifier mapping verified evidence to a category and a
 * proposed action. No git, no fs, no I/O, no mutation of inputs. First match wins.
 *
 * @param {{plan: string, stage?: string, signals?: string[], actionable?: boolean}} candidate
 * @param {StaleEvidence} evidence
 * @returns {StaleProposal} exactly { plan, category, proposedAction, evidence }.
 */
function classifyStaleCandidate(candidate, evidence) {
  const plan = candidate.plan;

  // 0. Missing / git-unavailable evidence ⇒ inconclusive (degraded signal).
  // Default-guard a missing or partial evidence object: a `undefined` evidence or
  // one lacking gitAvailable degrades to inconclusive instead of throwing on a
  // property read. This keeps the pure classifier total over malformed input.
  if (!evidence || !evidence.gitAvailable) {
    return {
      plan,
      category: 'inconclusive',
      proposedAction: null,
      evidence: ['git unavailable — cannot verify (' + ((evidence && evidence.error) || '') + ')'],
    };
  }

  const slugMatchCount = (evidence.slugMatchCommits || []).length;

  // 1. DEAD-ON-ARRIVAL — files gone, nothing shipped, never approved.
  if (evidence.anyFileMissing && slugMatchCount === 0 && !evidence.approvedBy) {
    return {
      plan,
      category: 'dead-on-arrival',
      proposedAction: evidence.explicitlyRejected === true ? 'delete' : 'revert',
      evidence: buildEvidenceLines(evidence),
    };
  }

  // 2. APPROVED-BUT-STRANDED — carries approval AND work continued after entry.
  if (evidence.approvedBy && evidence.filesModifiedAfterEntry) {
    return {
      plan,
      category: 'approved-but-stranded',
      proposedAction: 'advance-via-reconciliation',
      evidence: buildEvidenceLines(evidence),
    };
  }

  // 3. SHIPPED-BUT-EARLY — slug-match AND files modified after entry, all present.
  if (evidence.slugMatchAfterEntry && evidence.filesModifiedAfterEntry && evidence.allFilesExist) {
    return {
      plan,
      category: 'shipped-but-early',
      proposedAction: 'archive-to-done',
      evidence: buildEvidenceLines(evidence),
    };
  }

  // 4. INCONCLUSIVE — everything else (incl. age-only, thin/partial evidence).
  return {
    plan,
    category: 'inconclusive',
    proposedAction: null,
    evidence: buildEvidenceLines(evidence),
  };
}

/**
 * Cheap, filesystem-only scan of plans/functional, plans/implementation,
 * plans/review for stale-plan candidates. NEVER invokes git or any subprocess.
 *
 * Per-file IO faults (a plan file that vanishes or becomes unreadable mid-scan)
 * are skipped — the offending plan is omitted and the scan continues; the
 * function never throws on a structural or IO irregularity. Only misuse throws.
 *
 * @param {string} root Project root (directory containing `plans/`).
 * @param {{ nowMs?: number }} [options] nowMs defaults to Date.now(); inject a
 *        timestamp to drive age scenarios deterministically (SP5 seam — no utimes).
 * @returns {CheapScanResult}
 * @throws {TypeError} if root is not a non-empty string, or nowMs is supplied and
 *         is not a finite number.
 */
function scanCheapCandidates(root, { nowMs = Date.now() } = {}) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new TypeError('scanCheapCandidates: root must be a non-empty string');
  }
  if (!Number.isFinite(nowMs)) {
    throw new TypeError('scanCheapCandidates: nowMs must be a finite number');
  }

  /** @type {StaleCandidate[]} */
  const candidates = [];
  const plansDir = path.join(root, 'plans');
  if (!safeFs.existsSync(plansDir)) {
    return { candidates, count: 0 };
  }

  for (const stage of GATE_SOURCE_STAGES) {
    const stageDir = path.join(plansDir, stage);
    if (!safeFs.existsSync(stageDir)) continue;

    let entries;
    try {
      entries = safeFs.readdirSync(stageDir);
    } catch {
      continue; // stage dir unreadable — skip the whole stage, keep going
    }
    entries = entries
      .filter((f) => f.endsWith('.md') && f !== '.gitkeep')
      .sort(); // ascending; readdir order is platform-dependent

    for (const file of entries) {
      const filePath = path.join(stageDir, file);
      const slug = file.slice(0, -3); // strip '.md'

      // Empty-slug skip (data fault, defense-in-depth layer A): a filename like
      // `.md` yields an empty slug. An empty-slug candidate would later make
      // verifyStaleCandidate throw its misuse TypeError, crashing the cold-path
      // verify screen. A filename is DATA, never misuse, so it must never become a
      // candidate. (The verify screen wraps verify per-row as layer B.)
      if (file === '.md' || slug.length === 0) continue;

      // Per-file IO containment (F2): each per-file syscall is wrapped in a narrow
      // try/catch scoped to this single file. A vanished/unreadable plan is skipped
      // and the scan continues. This never masks misuse (which already threw above)
      // and wraps no control-flow that could hide a bug.

      // STAT FIRST (lstat — do NOT follow symlinks). lstat lets us (a) skip any
      // non-regular file — a directory or a SYMLINK — so the scan only ever reads
      // real files UNDER root (a symlink could point outside root); this cleanly
      // subsumes the old EISDIR directory-skip. And (b) size-gate before reading,
      // so an oversized file is never pulled into memory on the hot path. The same
      // stat supplies the advisory mtime, so no second stat is needed.
      let st;
      try {
        st = safeFs.lstatSync(filePath);
      } catch {
        continue; // file vanished between readdir and stat — skip
      }
      if (!st.isFile()) continue; // directory or symlink — skip (reads stay under root)
      if (st.size > MAX_PLAN_BYTES) continue; // oversized — skip before read

      let content;
      try {
        content = safeFs.readFileSync(filePath, 'utf8');
      } catch {
        continue; // file vanished or became unreadable mid-scan — skip
      }

      const mtimeMs = st.mtimeMs;
      const declared = parseFilesField(extractFrontmatterRegion(content));

      /** @type {StaleSignal[]} */
      const signals = [];
      if (hasMissingFiles(root, declared)) signals.push('missing-files');
      if (nowMs - mtimeMs > AGE_THRESHOLD_MS) signals.push('advisory:age');

      if (signals.length === 0) continue;

      candidates.push({
        plan: slug,
        stage,
        signals,
        actionable: signals.includes('missing-files'),
      });
    }
  }

  return { candidates, count: candidates.length };
}

module.exports = {
  scanCheapCandidates,
  verifyStaleCandidate,
  classifyStaleCandidate,
  extractFrontmatterRegion,
  parseFilesField,
  GATE_SOURCE_STAGES,
  AGE_THRESHOLD_MS,
  MAX_PLAN_BYTES,
};
