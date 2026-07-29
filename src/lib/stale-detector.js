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
 * DURABLE DISMISSAL (R3): `scanCheapCandidates` filters out candidates the human
 * has dismissed via `dismissStale`, keyed by a content signature (plan path +
 * mtime) persisted in `.ctoc/state/stale-dismissals.json`. The store read is
 * FAIL-OPEN (a missing/corrupt store filters nothing), and a dismissed plan that
 * has since CHANGED (its mtime moved) no longer matches its signature and
 * re-surfaces — so a dismissal can never permanently mask a touched plan. This
 * makes the menu's "Don't ask again for these" durable across turns; the menu's
 * "Not now" remains a one-turn skip (no store write).
 *
 * STAGE POLARITY LIVES IN THE CLASSIFIER, BY DESIGN — NOT in this cheap pass. The
 * cheap pass is deliberately BROAD: it emits `missing-files` for a declared path
 * that is absent at ANY gate-source stage (including functional), acting as a wide
 * candidate GENERATOR. The not-started polarity — a pre-implementation plan whose
 * files are simply unbuilt is benign, not stale — is applied downstream in
 * `classifyStaleCandidate` via NOT_STARTED_STAGES, which downgrades such a
 * candidate to `inconclusive` with a null action so no cleanup path ever acts on
 * it ("cheap-actionable but classifier-benign", locked by the SP5 regression T3b).
 * This split is intentional and correct; the cheap pass is NOT the place to gate
 * on stage.
 *
 * THE SCAN SAYS WHEN IT COULD NOT LOOK. `scanCheapCandidates` drops a plan (or a
 * whole stage) at four points, each of them a defensible skip — a file that
 * vanishes mid-scan must never crash the menu. The DEFECT was that the return
 * value had nowhere to put them: `{ candidates: [], count: 0 }` from a scan that
 * read NOTHING was byte-identical to the same result from a scan that read every
 * plan and found the backlog clean, and `inbox.js` hands `.candidates` straight
 * to the dashboard nag count. An unreadable `plans/review/` therefore rendered as
 * "no stale plans" — a verdict reported on input never received, which is the
 * false-green defect class this repository fences.
 *
 * THE CONTRACT, and it is the only thing that licenses reading a zero:
 *   - `unreadCount === 0` means "I read every plan in every stage that exists".
 *     ONLY THEN does `count === 0` mean the backlog is clean.
 *   - `unreadCount > 0` means THIS RESULT IS PARTIAL. `count` is the number of
 *     candidates found among the plans I COULD read, and says nothing about the
 *     rest.
 * The skips remain skips (never throws) — the defect was never that the scan
 * continued, only that it continued silently. It continues, and says so. This
 * carries to the hot path the discipline the cold path already had:
 * `verifyStaleCandidate` returns `gitAvailable: false` and `classifyStaleCandidate`
 * maps it to `inconclusive`, distinguishing "I could not look" from "I looked and
 * found nothing".
 *
 * NOT WIRED TO THE DASHBOARD YET, AND THAT IS NAMED RATHER THAN GLOSSED. This
 * module produces `unreadCount`; no consumer renders it. Until a follow-up
 * surfaces it in `inbox.js` / `menu-screens.js`, the menu still renders a PARTIAL
 * scan as a clean one. The data now says otherwise; the display does not yet. An
 * undisplayed honest signal beats a displayed dishonest one, but it is not
 * finished.
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
 * @typedef {('stage-unreadable'|'stat-failed'|'oversized'|'read-failed')} UnreadReason
 *   Why an input could not be read. A CLOSED enum, deliberately: this value is
 *   rendered on a dashboard and a raw filesystem error string carries absolute
 *   paths and user names. Diagnostic detail belongs in a log, not in a return
 *   value bound for a screen.
 *   - `stage-unreadable` — `readdir` on a stage directory failed. THIS ONE ENTRY
 *     STANDS FOR THE WHOLE STAGE, not for one plan: the scan cannot know how many
 *     plans it failed to read, and inventing a count would itself be a number
 *     reported on input never received.
 *   - `stat-failed`      — `lstat` on one plan failed (it vanished between
 *                          readdir and stat, or its directory denies search).
 *   - `oversized`        — one plan exceeds MAX_PLAN_BYTES and is size-gated out
 *                          BEFORE the read. Still skipped, now skipped AUDIBLY.
 *   - `read-failed`      — `readFile` on one plan failed.
 *
 * @typedef {Object} UnreadInput
 * @property {string}       path   Repository-RELATIVE, POSIX-separated, never
 *                                   absolute. `plans/<stage>` for a whole stage,
 *                                   `plans/<stage>/<file>.md` for one plan.
 * @property {string}       stage  The gate-source stage it was found in.
 * @property {UnreadReason} reason Closed enum; never a raw error message.
 *
 * @typedef {Object} CheapScanResult
 * @property {StaleCandidate[]} candidates Plans (in gate-source stages) that
 *                                          emitted ≥ 1 signal. Zero-signal plans
 *                                          are omitted entirely.
 * @property {number}          count       === candidates.length. Read honestly:
 *                                          candidates found AMONG THE PLANS THIS
 *                                          SCAN COULD READ. Only meaningful as
 *                                          "the backlog is clean" when
 *                                          unreadCount === 0.
 * @property {UnreadInput[]}   unread      Inputs this scan could not read. Empty
 *                                          iff the walk completed in full.
 * @property {number}          unreadCount === unread.length. 0 ⇒ complete walk;
 *                                          > 0 ⇒ THIS RESULT IS PARTIAL.
 */

const safeFs = require('./safe-fs');
const { safeRegExp, escapeRegExp } = require('./regex-utils');
const { invalidate } = require('./cache');
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
 * Stages at which declared files are NOT yet expected to exist — a missing-files
 * signal here means the plan is UNBUILT (not started), never abandoned. DOA is
 * gated OUT of these stages. Any stage NOT in this set is treated as
 * "files should exist" so DOA keeps its teeth for todo/in-progress/review AND for
 * any unknown/malformed stage (fail-toward-keeping-teeth, since
 * `Set.has(undefined) === false`). The polarity is deliberately an allowlist of
 * BENIGN stages, not of files-expected stages.
 *
 * `implementation` BELONGS HERE, and its absence was the single mis-set membership
 * that produced the loudest false signal in the whole detector. An
 * implementation-stage plan sits BEFORE Gate 2 — it has never entered the todo
 * queue and has therefore NEVER BEEN EXECUTED. Its declared `files:` are the files
 * it INTENDS to create, so they are supposed to be missing. Yet `implementation`
 * is in GATE_SOURCE_STAGES and so was scanned, and every unbuilt implementation
 * plan with a CREATE target emitted `missing-files` and was classified
 * dead-on-arrival. Measured on this repository before the fix: 8 of 21 candidates
 * (38%) were unbuilt implementation plans reported as abandoned work.
 *
 * SCOPE CORRECTION, NOT DELETION. `missing-files` keeps its full teeth at REVIEW,
 * where a declared file that does not exist is a genuine signal. And the
 * not-started gate in `classifyStaleCandidate` exempts `explicitlyRejected`, so
 * POSITIVE death evidence still reaches DOA at every stage — a killed plan is
 * still dead, wherever it sits.
 *
 * The cheap pass's `actionable` field is deliberately NOT changed by this: the
 * module's broad-generator design puts stage polarity downstream in
 * `classifyStaleCandidate`, and the SP5 regression T3b locks "cheap scan is
 * actionable for a missing file at any gate-source stage". `implementation` now
 * behaves EXACTLY as `functional` already did — one rule for pre-build stages,
 * not two.
 * @type {ReadonlySet<string>}
 */
const NOT_STARTED_STAGES = Object.freeze(new Set(['vision', 'canvas', 'functional', 'implementation']));

/**
 * Upper bound on the two landing-evidence arrays (`landingCommits`,
 * `landingAttributedTo`). A plan whose declared files sit on a long history could
 * otherwise balloon the returned object; the cap makes the evidence a bounded
 * human-followable sample, never an unbounded dump. 20 mirrors the candidate/limit
 * ceilings used elsewhere.
 * @type {number}
 */
const LANDING_CAP = 20;

/**
 * A plan slug as it appears NAMED in a commit message: a numeric prefix (3–5
 * digits) then kebab words. Attribution runs on this SHAPE, accepting a known miss
 * (an unattributed commit, or an old non-numeric slug) rather than a fuzzy match —
 * the false accusation is the more expensive error, since it is what teaches a
 * human to ignore the output. This is the honest mechanical shadow of "who did
 * this?", never a verdict. The `g` flag is used ONLY with String.prototype.match
 * (never `.test`), so there is no shared-lastIndex hazard.
 * A single character class (`[a-z0-9-]+`) is used rather than a grouped repeat so
 * there is no nested quantifier and therefore no backtracking hazard.
 * @type {RegExp}
 */
const PLAN_SLUG_RE = /\b\d{3,5}-[a-z0-9-]+\b/g;

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
 *   entry; trailing line comments stripped (F5). Interspersed blank lines and
 *   full-line `#` comments are SKIPPED (YAML block-sequence semantics — the
 *   ratchet-files generator emits labelled comment blocks between the work
 *   surface and the ratchet files). Collection ends ONLY at a new non-indented
 *   top-level `key:` line or the `---` delimiter — never at a comment or blank,
 *   and a following top-level key is not captured as a file.
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

  // Block-list syntax: walk subsequent lines. A YAML block sequence may contain
  // interspersed blank lines and full-line `#` comments; those are skipped, not
  // terminators. The sequence ends ONLY at a new non-indented top-level `key:`
  // line or the `---` frontmatter delimiter — so a comment can never make later
  // entries invisible, and a trailing top-level key is never captured as a file.
  const out = [];
  for (let k = idx + 1; k < lines.length; k++) {
    const line = lines[k];
    const trimmed = line.trim();
    if (trimmed === '') continue; // blank line within the block
    if (trimmed === '---') break; // frontmatter delimiter ends the block
    if (trimmed.startsWith('#')) continue; // full-line YAML comment within the block
    const dash = line.match(/^[ \t]*-[ \t]*(.+?)[ \t]*$/);
    if (dash) {
      const v = parseListItem(dash[1]);
      if (v.length > 0) out.push(v);
      continue;
    }
    if (/^\S/.test(line)) break; // a new non-indented top-level key ends the sequence
    // An indented, non-dash, non-comment, non-blank line is not a valid sequence
    // entry and — per the ends-only-at-top-level-key rule — not a terminator
    // either; skip it and keep scanning.
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
 * @property {boolean}  landedBySelf          a commit NAMING this plan's slug touched its declared files AFTER stage entry — the plan's own work arrived. false whenever git could not be read.
 * @property {boolean}  landedByOther         declared files modified AFTER stage entry by commits naming a DIFFERENT plan slug and NONE naming this one — someone else's work covered this plan's ground (a supersession CANDIDATE, never a verdict). UNREACHABLE-as-true from a degraded state, and false there too — but the classifier reads gitAvailable first so a degraded false is read as "could not look", never "nothing landed".
 * @property {string[]} landingCommits        short hashes of the after-entry file-modifying commits, bounded by LANDING_CAP — the evidence a human follows.
 * @property {string[]} landingAttributedTo   the OTHER plan slugs named in those commits, bounded by LANDING_CAP.
 *
 * @typedef {Object} StaleProposal
 * @property {string}  plan  candidate.plan (slug).
 * @property {('shipped-but-early'|'approved-but-stranded'|'dead-on-arrival'|'landed-candidate'|'inconclusive')} category
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
    // "I could not look" ⇒ every landing field is false/empty. The classifier
    // reads gitAvailable FIRST and returns inconclusive, so this false is NEVER
    // read as a confident "nothing landed" — the load-bearing honesty invariant.
    landedBySelf: false,
    landedByOther: false,
    landingCommits: [],
    landingAttributedTo: [],
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

  // 6. Files last-modified epoch = MAX %ct across declared files' commits, AND the
  // after-entry file-modifying commits (deduped by short hash) that back the
  // landed-check. This is the SAME per-file `git log` invocation as before (one per
  // declared file) — only the `--format` widened (%ct+%h+%s) and the `-1` dropped so
  // every modifying commit is seen, not just the newest. No NEW git invocation is
  // added; the landed-check is one derivation away from evidence already gathered.
  let filesLastModifiedEpoch = null;
  /** @type {Map<string, {ct:number, subject:string}>} short hash → after-entry mod. */
  const afterEntryMods = new Map();
  for (const f of declaredFiles) {
    const decl = f.replace(/\\/g, '/');
    try {
      const out = runGit(['log', '--format=%ct%x1f%h%x1f%s', '--', decl]);
      for (const lineRec of out.split('\n')) {
        const rec = lineRec.replace(/\r$/, '');
        if (rec.trim().length === 0) continue;
        const i1 = rec.indexOf('\x1f');
        const i2 = rec.indexOf('\x1f', i1 + 1);
        if (i1 === -1 || i2 === -1) continue;
        const ct = Number(rec.slice(0, i1).trim());
        if (!Number.isFinite(ct)) continue;
        if (filesLastModifiedEpoch === null || ct > filesLastModifiedEpoch) filesLastModifiedEpoch = ct;
        if (stageEntryEpoch != null && ct > stageEntryEpoch) {
          const shortHash = rec.slice(i1 + 1, i2).trim();
          if (!afterEntryMods.has(shortHash)) {
            // Subject sanitized AT CAPTURE (twin of the slug-match capture below) so
            // a hostile commit subject cannot inject escape sequences downstream.
            afterEntryMods.set(shortHash, { ct, subject: stripCtlChars(rec.slice(i2 + 1)) });
          }
        }
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

  const re = safeRegExp('\\b' + escapeRegExp(candidate.plan) + '\\b', 'i');
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

  // 8. The landed-check — two derived questions, from the after-entry file
  // modifiers already collected (no new git). `re` (\bslug\b) is reused for the
  // self-name test; PLAN_SLUG_RE extracts OTHER named slugs for attribution.
  let landedBySelf = false;
  const landingCommits = [];
  const attributed = new Set();
  for (const [shortHash, mod] of afterEntryMods) {
    if (landingCommits.length < LANDING_CAP) landingCommits.push(shortHash);
    if (re.test(mod.subject)) landedBySelf = true;
    for (const m of mod.subject.match(PLAN_SLUG_RE) || []) {
      // `re.test(m)` excludes THIS plan's slug (self is landedBySelf, never
      // "other"); everything else is a distinct plan attributed the landing.
      if (!re.test(m) && attributed.size < LANDING_CAP) attributed.add(m);
    }
  }
  landedBySelf = landedBySelf && filesModifiedAfterEntry;
  const landingAttributedTo = [...attributed];
  // Decision D4: a plan whose OWN work landed (self-named) is an ordinary completed
  // plan, not a supersession candidate — so landedByOther REQUIRES the absence of a
  // self-naming file-modifying commit.
  const landedByOther = filesModifiedAfterEntry && !landedBySelf && landingAttributedTo.length > 0;

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
    landedBySelf,
    landedByOther,
    landingCommits,
    landingAttributedTo,
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
  // Entry totality: a null/non-object candidate degrades to inconclusive rather
  // than throwing on a property read (the classifier is degrade-never-throw).
  if (!candidate || typeof candidate !== 'object') {
    return { plan: null, category: 'inconclusive', proposedAction: null, evidence: ['invalid candidate'] };
  }
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

  // 0.5 LANDED-CANDIDATE — this plan's declared files were modified after its stage
  //     entry by commits naming a DIFFERENT plan, none naming this one: the work
  //     arrived under another name. This is the honest mechanical shadow of
  //     supersession, and it is a CANDIDATE for a human/model to judge, NEVER a
  //     verdict — so the action is null (the SAME null-action treatment as
  //     `inconclusive`, absent from menu-screens.js CLEANUP_ORDER, so no cleanup
  //     path ever acts on it). Placed first among the positive rules because it is
  //     the most specific, highest-value signal and must win over the generic
  //     approved-but-stranded / shipped-but-early categories. Only reachable when
  //     gitAvailable (degraded evidence sets landedByOther false), so the honesty
  //     contract holds: a plan whose git could not be read is inconclusive above,
  //     never landed-candidate.
  if (evidence.landedByOther === true) {
    const who = (evidence.landingAttributedTo || []).join(', ');
    return {
      plan,
      category: 'landed-candidate',
      proposedAction: null,
      evidence: [
        'declared files modified after stage entry by other plan(s): ' +
          (who || '(unattributed)') +
          ' — supersession CANDIDATE for judgment, not a verdict',
      ],
    };
  }

  // 1. NOT-STARTED (stage gate) — a pre-implementation-stage plan whose ONLY
  //    staleness signal is missing files has not begun work: benign, not stale.
  //    This gates the DOA rule so an UNBUILT vision/canvas/functional plan is
  //    never proposed for revert/delete. Reuses the `inconclusive` category with
  //    a null action so NO cleanup path (SP4) ever acts on it (`inconclusive` is
  //    absent from menu-screens.js CLEANUP_ORDER). Exempts `explicitlyRejected`:
  //    POSITIVE death evidence keeps its teeth at every stage (falls through to
  //    DOA/delete even at a not-started stage — missing files there is only benign
  //    ABSENT a rejection). A missing/unknown stage yields
  //    `Set.has(undefined) === false` ⇒ also falls through to DOA (the pre-fix default).
  if (
    evidence.anyFileMissing &&
    slugMatchCount === 0 &&
    !evidence.approvedBy &&
    !evidence.explicitlyRejected &&
    NOT_STARTED_STAGES.has(candidate.stage)
  ) {
    return {
      plan,
      category: 'inconclusive',
      proposedAction: null,
      evidence: [
        'not started: ' + candidate.stage +
          '-stage plan; declared files not yet built (benign, not stale)',
      ],
    };
  }

  // 2. DEAD-ON-ARRIVAL — files gone, nothing shipped, never approved. Now only
  //    reachable PAST the not-started stages (implementation/todo/in-progress/
  //    review and any unknown stage).
  if (evidence.anyFileMissing && slugMatchCount === 0 && !evidence.approvedBy) {
    return {
      plan,
      category: 'dead-on-arrival',
      proposedAction: evidence.explicitlyRejected === true ? 'delete' : 'revert',
      evidence: buildEvidenceLines(evidence),
    };
  }

  // 3. APPROVED-BUT-STRANDED — carries approval AND work continued after entry.
  if (evidence.approvedBy && evidence.filesModifiedAfterEntry) {
    return {
      plan,
      category: 'approved-but-stranded',
      proposedAction: 'advance-via-reconciliation',
      evidence: buildEvidenceLines(evidence),
    };
  }

  // 4. SHIPPED-BUT-EARLY — slug-match AND files modified after entry, all present.
  if (evidence.slugMatchAfterEntry && evidence.filesModifiedAfterEntry && evidence.allFilesExist) {
    return {
      plan,
      category: 'shipped-but-early',
      proposedAction: 'archive-to-done',
      evidence: buildEvidenceLines(evidence),
    };
  }

  // 5. INCONCLUSIVE — everything else (incl. age-only, thin/partial evidence).
  return {
    plan,
    category: 'inconclusive',
    proposedAction: null,
    evidence: buildEvidenceLines(evidence),
  };
}

/**
 * Path segments (under project root) of the durable stale-dismissal store.
 * A human's "Don't ask again for these" choice in the menu ride-along is
 * recorded here so it survives across menu turns — WITHOUT this store a
 * dismissal would last exactly one turn (the R3 defect). Lives under
 * .ctoc/state/ (already git-ignored by init) so it never pollutes a commit.
 * @type {ReadonlyArray<string>}
 */
const DISMISSAL_STORE = Object.freeze(['.ctoc', 'state', 'stale-dismissals.json']);

/**
 * Content signature for a dismissal: `<stage>/<slug>.md` → mtime (rounded ms).
 * Keying on plan PATH + mtime is deliberate — a dismissed plan that is later
 * CHANGED (rewritten, so its mtime moves) no longer matches its stored signature
 * and MAY re-surface, so a dismissal can never permanently mask a plan that has
 * since been touched. `Math.round` normalizes the sub-millisecond float that some
 * filesystems report so the scan-time and dismiss-time reads compare exactly.
 * @param {number} mtimeMs
 * @returns {number}
 */
function _sigMtime(mtimeMs) {
  return Math.round(mtimeMs);
}

/**
 * Size ceiling for the dismissal store (R3-A item 7). The store is read on the HOT
 * path — every cheap scan, i.e. every menu open — and it is a plain JSON file on
 * disk that nothing bounds. A pathological or corrupted store (a runaway writer, a
 * hostile blob) would be slurped whole into memory and JSON-parsed on every render.
 * The read now mirrors the plan-file guard (`MAX_PLAN_BYTES`): an oversized store is
 * SKIPPED, which fails open in the safe direction — no filtering, so CTOC keeps
 * nagging about genuinely stale plans rather than silently hiding them.
 * @type {number}
 */
const MAX_DISMISSAL_BYTES = MAX_PLAN_BYTES; // 1 MiB — same ceiling as a plan file

/**
 * Read the dismissal store, FAIL-OPEN: a missing, unreadable, corrupt, or OVERSIZED
 * store yields an empty map so a data fault can NEVER suppress a real candidate (the
 * safe direction is to under-filter, i.e. keep nagging, never to hide). Returns a
 * plain `{ '<stage>/<slug>.md': mtimeMs }` map. No subprocess, no throw.
 * @param {string} root
 * @returns {Object<string, number>}
 */
function _loadDismissals(root) {
  try {
    const p = path.join(root, ...DISMISSAL_STORE);
    if (!safeFs.existsSync(p)) return {};
    // Size-gate BEFORE the read: never pull an unbounded file into memory on the
    // hot path (R3-A item 7). lstat (not stat) so a symlinked store cannot mask its
    // real size behind a small link.
    const st = safeFs.lstatSync(p);
    if (!st.isFile() || st.size > MAX_DISMISSAL_BYTES) return {};
    const parsed = JSON.parse(safeFs.readFileSync(p, 'utf8'));
    const d = parsed && typeof parsed === 'object' ? parsed.dismissed : null;
    return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
  } catch {
    return {}; // fail-open: corrupt/unreadable store ⇒ no filtering
  }
}

/**
 * Record the given candidates as dismissed in the durable store. This is the
 * export the menu ride-along route (R2-C's file) calls when the human picks
 * "Don't ask again for these"; the filter it feeds is already live on the hot
 * path via inbox.js → scanCheapCandidates (both the nag count and the drill-in
 * list flow from the same scan). "Not now" remains a one-turn skip handled by the
 * menu (no store write).
 *
 * The signature is re-derived HERE from the plan file on disk (never trusted from
 * the caller) so the stored mtime is authoritative. Fail-open/degrade-never-throw
 * for expected inputs (bad root ⇒ `{ ok:false }`; a vanished plan file is simply
 * skipped). The write is atomic (temp + rename) so a crash mid-write cannot leave
 * a half-written store. Security: the store PATH is a fixed constant under root,
 * and each key is rebuilt from a FROZEN gate-source stage plus `path.basename` of
 * the slug — no caller-controlled path segment reaches the filesystem.
 *
 * @param {string} root project root (directory containing plans/).
 * @param {Array<{plan?: string, stage?: string}>} candidates cheap-scan candidates to dismiss.
 * @returns {{ ok: boolean, count: number }} count = signatures written this call.
 */
function dismissStale(root, candidates) {
  if (typeof root !== 'string' || root.length === 0) return { ok: false, count: 0 };
  const list = Array.isArray(candidates) ? candidates : [];
  try {
    const store = _loadDismissals(root); // union onto any existing dismissals
    let added = 0;
    for (const c of list) {
      if (!c || typeof c !== 'object') continue;
      const stage = c.stage;
      // Only the frozen gate-source stages are valid keys; a slug is reduced to a
      // basename so no `../` or nested segment can escape plans/<stage>/.
      const slug = typeof c.plan === 'string' ? path.basename(c.plan) : '';
      // `stage` is an UNVALIDATED string off a caller-supplied candidate — this
      // `includes` IS the validation, so the cast only lets the membership test
      // accept the untrusted value it exists to check.
      if (!GATE_SOURCE_STAGES.includes(/** @type {any} */ (stage)) || slug.length === 0) continue;
      const filePath = path.join(root, 'plans', stage, slug + '.md');
      let st;
      try {
        st = safeFs.lstatSync(filePath);
      } catch {
        continue; // plan vanished between scan and dismiss — skip
      }
      if (!st.isFile()) continue;
      store[stage + '/' + slug + '.md'] = _sigMtime(st.mtimeMs);
      added += 1;
    }
    const dir = path.join(root, ...DISMISSAL_STORE.slice(0, -1));
    safeFs.mkdirSync(dir, { recursive: true });
    const target = path.join(root, ...DISMISSAL_STORE);
    const tmp = target + '.tmp-' + Date.now() + '-' + process.pid;
    safeFs.writeFileSync(tmp, JSON.stringify({ dismissed: store }, null, 2));
    safeFs.renameSync(tmp, target); // atomic publish
    // R2-C2 item 5/6: the dismissal store feeds the memoized getInboxCounts stale
    // count (scanCheapCandidates filters dismissed candidates). Bust the read cache
    // AFTER the successful write so a live "Don't ask again for these" drops the
    // possibly-stale count immediately, not on the next 5 s TTL expiry — a menu that
    // dismisses but keeps nagging is "grinding with no feedback". (CF1 invariant.)
    invalidate();
    return { ok: true, count: added };
  } catch {
    return { ok: false, count: 0 };
  }
}

/**
 * Cheap, filesystem-only scan of plans/functional, plans/implementation,
 * plans/review for stale-plan candidates. NEVER invokes git or any subprocess.
 *
 * Per-file IO faults (a plan file that vanishes or becomes unreadable mid-scan)
 * are skipped — the offending plan is omitted and the scan continues; the
 * function never throws on a structural or IO irregularity. Only misuse throws.
 * EVERY SUCH SKIP IS REPORTED in `unread`, so the caller can tell "I read
 * everything and found nothing" (`unreadCount === 0`) from "I could not look"
 * (`unreadCount > 0`, the result is PARTIAL). See the module header contract.
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
  /**
   * Inputs this scan could not read. Every entry is built from information the
   * FAILING call already had — no extra syscall is made to describe a failure.
   * Bounded by the number of plans on disk; no unbounded accumulation.
   * @type {UnreadInput[]}
   */
  const unread = [];
  /**
   * Record an unreadable input. `rel` is assembled from the frozen stage name and
   * a readdir-supplied filename and joined with POSIX separators, so the returned
   * path is repository-relative on every platform and never leaks the absolute
   * root (which carries a user name).
   * @param {string} stage
   * @param {UnreadReason} reason
   * @param {string} [file] filename within the stage; omit for a whole-stage entry.
   */
  const markUnread = (stage, reason, file) => {
    const rel = file ? 'plans/' + stage + '/' + file : 'plans/' + stage;
    unread.push({ path: rel, stage, reason });
  };

  const plansDir = path.join(root, 'plans');
  if (!safeFs.existsSync(plansDir)) {
    // No plans/ directory is "there was nothing to read", NOT "I could not read".
    // The full shape is still returned so no caller sees a half-shaped result.
    return { candidates, count: 0, unread, unreadCount: 0 };
  }

  // R3: load the durable dismissal store ONCE per scan (O(1), fail-open ⇒ {}).
  // A candidate whose signature (path + unchanged mtime) is dismissed is omitted,
  // so a "Don't ask again" choice survives across menu turns and the nag count
  // drops accordingly. A dismissed plan that has since CHANGED (mtime moved) no
  // longer matches and re-surfaces.
  const dismissed = _loadDismissals(root);

  for (const stage of GATE_SOURCE_STAGES) {
    const stageDir = path.join(plansDir, stage);
    // An ABSENT stage has no plans to fail to read. Reporting it would be a false
    // partial — the mirror image of the defect being fixed.
    if (!safeFs.existsSync(stageDir)) continue;

    let entries;
    try {
      entries = safeFs.readdirSync(stageDir);
    } catch {
      // The SEVERE skip: one unreadable directory removes a whole stage — up to a
      // third of the backlog — from the scan. It is now audible. ONE entry stands
      // for the entire stage; the scan cannot know how many plans were in it.
      markUnread(stage, 'stage-unreadable');
      continue; // skip the whole stage, keep going
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
        markUnread(stage, 'stat-failed', file);
        continue; // file vanished between readdir and stat — skip, audibly
      }
      // NOT an unread fault: a directory or symlink is not a plan this scan was
      // ever going to read. The exclusion is a deliberate security boundary (a
      // symlink could point outside root), not a failure to look — reporting it
      // as unread would make every repo with a symlinked plan permanently
      // "partial" and devalue the signal to noise.
      if (!st.isFile()) continue;
      if (st.size > MAX_PLAN_BYTES) {
        // The size gate is PRESERVED exactly: audible must not mean read. The
        // file is still never pulled into memory on the hot path.
        markUnread(stage, 'oversized', file);
        continue; // oversized — skip before read
      }

      let content;
      try {
        content = safeFs.readFileSync(filePath, 'utf8');
      } catch {
        markUnread(stage, 'read-failed', file);
        continue; // file vanished or became unreadable mid-scan — skip, audibly
      }

      const mtimeMs = st.mtimeMs;
      const declared = parseFilesField(extractFrontmatterRegion(content));

      /** @type {StaleSignal[]} */
      const signals = [];
      if (hasMissingFiles(root, declared)) signals.push('missing-files');
      if (nowMs - mtimeMs > AGE_THRESHOLD_MS) signals.push('advisory:age');

      if (signals.length === 0) continue;

      // R3 durable-dismissal filter: skip a candidate the human dismissed whose
      // content signature is unchanged. Keyed by path + mtime so a changed plan
      // re-surfaces. Signature is computed from the SAME lstat used above (no
      // extra syscall); the candidate shape stays the 4 locked keys (no leak).
      const dismissKey = stage + '/' + slug + '.md';
      if (Object.prototype.hasOwnProperty.call(dismissed, dismissKey) &&
          dismissed[dismissKey] === _sigMtime(mtimeMs)) {
        continue;
      }

      candidates.push({
        plan: slug,
        stage,
        signals,
        actionable: signals.includes('missing-files'),
      });
    }
  }

  // The ONLY return that can report unreadCount 0 is this one, reached solely by
  // completing the walk over every stage that exists. That is the single
  // assertion the whole honesty contract rests on.
  return { candidates, count: candidates.length, unread, unreadCount: unread.length };
}

module.exports = {
  scanCheapCandidates,
  verifyStaleCandidate,
  classifyStaleCandidate,
  dismissStale,
  extractFrontmatterRegion,
  parseFilesField,
  GATE_SOURCE_STAGES,
  // R2-C2 item 6: exported (additive) so inbox.js can filter the dashboard stale
  // COUNT to the stages the classifier can act on — a candidate whose ONLY issue
  // is unbuilt files at a not-started stage is benign, so it must not inflate the
  // "possibly-stale" nag. Kept as the single source of truth; the classifier's
  // NOT-STARTED rule reads the same const.
  NOT_STARTED_STAGES,
  AGE_THRESHOLD_MS,
  MAX_PLAN_BYTES,
};
