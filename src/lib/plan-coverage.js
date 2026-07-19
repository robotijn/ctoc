/**
 * Plan Coverage (C1 / CTOC v7)
 *
 * Determines whether an edit target is covered by an active plan. Used by
 * the PreToolUse enforcement hook to allow edits that are part of declared
 * plan work, and block edits that aren't.
 *
 * Plans declare their files in YAML frontmatter:
 *   files:
 *     - "src/lib/foo.js"
 *     - "tests/foo.test.js"
 *     - "src/areas/**"
 *
 * Glob support (minimatch-style):
 *   *   matches any chars except /
 *   **  matches any chars including /
 *   ?   matches single char except /
 *   everything else is literal
 *
 * Stage priority (per I11): in-progress > todo. Within a stage, the most-specific
 * glob wins — among the plans that are APPROVED (see below).
 *
 * X1: pre-v7 plans (no `files:` declaration AND no `program: ctoc-v7`) are
 * treated warn-only — they never match, so the hook falls through to the
 * escape-phrase check.
 *
 * ONLY APPROVED PLANS GRANT WRITE ACCESS.
 *
 * This module's answer is a PERMISSION, and it used to be derived from a document
 * the requesting agent was free to write. `PreToolUse.Edit.js` whitelists
 * `/^plans\/.*\.md$/`, so an agent could author a seven-line plan file declaring
 * `files: ["src/hooks/human-gate-check.js"]` and thereby grant ITSELF permission to
 * edit the hook that enforces the four human gates. With `files: ["**"]` it granted
 * the entire repository. Both were reproduced on this repository.
 *
 * TWO HALVES CLOSE IT, and either alone leaves it open:
 *   1. `implementation` is gone from the scan. It is PRE-approval — Gate 2 is the
 *      `implementation → todo` edge — so a plan sitting there has been approved by
 *      nobody. If you are about to add it back, or add any other stage: a stage
 *      folder is not a permission, and `approval-residency.COVERAGE_STAGE_EDGE`
 *      must be told which gate vouches for the stage or it grants nothing.
 *   2. Every candidate is checked against the AGENT-WRITE-DENIED approval ledger
 *      (`approval-residency.isApprovedForCoverage`). Without this, the identical
 *      probe written one directory over — `plans/todo/zz-probe.md` — still worked,
 *      because the whitelist covers every stage folder. Residing in a post-approval
 *      folder is not proof of approval.
 *
 * IT FAILS CLOSED, AND FAIL-CLOSED MEANS RETURN `null`, NEVER THROW.
 * `PreToolUse.Edit.js` wraps the whole enforcement decision in a catch that fails
 * OPEN, so a THROW out of this module becomes an ALLOW — a permission check whose
 * failure mode is "permission granted". This module must therefore be TOTAL. That
 * is the opposite of the fail-open default used by this codebase's REPORTING
 * checks, and it is written here so it is not later "fixed" into consistency with
 * its neighbours.
 */

const safeFs = require('./safe-fs');
const { parseFrontmatter } = require('./frontmatter');
const approvalResidency = require('./approval-residency');
const realPathConfinement = require('./real-path-confinement');
const path = require('path');

// SCANNED STAGES, IN PRIORITY ORDER. `implementation` is deliberately ABSENT: it is
// the PRE-approval stage (Gate 2 is `implementation → todo`), and a plan an agent can
// author must never confer permission. Adding a stage here grants NOTHING unless
// `approval-residency.COVERAGE_STAGE_EDGE` also names the gate edge that vouches for
// it — that map fails closed on purpose.
const STAGE_PRIORITY = ['in-progress', 'todo'];

/**
 * @typedef {{ k: 'lit', c: string } | { k: 'one' } | { k: 'star' } | { k: 'globstar' }} GlobToken
 */

/**
 * Tokenize a glob into a flat token list, mirroring EXACTLY the segment
 * semantics the enforcement hook has always used:
 *   **  → globstar  (matches any run of chars, INCLUDING `/`); a `/` immediately
 *        following the `**` is CONSUMED, so a `**`-then-slash before `b` also
 *        matches with zero middle segments (`a/b`) and a leading globstar-slash
 *        matches a root-level file.
 *   *   → star      (matches a run of chars EXCEPT `/` — within one path segment)
 *   ?   → one       (matches exactly one char except `/`)
 *   c   → lit(c)    (matches the literal char c — no metacharacter meaning)
 *
 * @param {string} glob
 * @returns {GlobToken[]}
 */
function tokenizeGlob(glob) {
  const g = typeof glob === 'string' ? glob : '';
  const tokens = [];
  let i = 0;
  while (i < g.length) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        tokens.push({ k: 'globstar' });
        i += 2;
        if (g[i] === '/') i += 1; // consume trailing slash so "**/x" matches "x"
      } else {
        tokens.push({ k: 'star' });
        i += 1;
      }
    } else if (c === '?') {
      tokens.push({ k: 'one' });
      i += 1;
    } else {
      tokens.push({ k: 'lit', c });
      i += 1;
    }
  }
  return /** @type {GlobToken[]} */ (tokens);
}

/**
 * Linear-time glob match. Replaces the former glob→RegExp→`.test()` path, whose
 * emitted pattern (`[^/]*` / `.*` alternating with literals the wildcard could
 * ALSO match — e.g. `*a*a*a…` → `^([^/]*a)+$`) was a catastrophic-backtracking
 * ReDoS. That pattern is `.test()`-ed on EVERY file edit by the PreToolUse
 * enforcement hook against an author-controlled plan `files:` entry (an
 * in-model taint source), and a crafted glob took seconds-to-forever on a
 * pathological target — stalling every edit in the project (the hook fails OPEN
 * only on a THROWN error; a HANG is neither an error nor time-bounded).
 *
 * This is a bottom-up dynamic program with NO backtracking, so match cost is
 * bounded by O(tokens × chars) regardless of glob shape. Semantics are
 * byte-for-byte identical to the old regex:
 *   lit(c)   ↔ literal c         star     ↔ [^/]*
 *   one      ↔ [^/]              globstar ↔ .*
 * and the whole input must match (full `^…$` anchoring). A rolling single-star
 * backtrack pointer is INSUFFICIENT here — a segment-bounded `*` after a
 * `/`-crossing `**` needs the earlier `**` to be able to absorb a `/` — so the
 * full DP (not the O(1)-space greedy) is required for correctness.
 *
 * @param {GlobToken[]} tokens
 * @param {*} input - coerced to string, matching RegExp.prototype.test semantics
 * @returns {boolean}
 */
function matchTokens(tokens, input) {
  const s = typeof input === 'string' ? input : String(input);
  const n = s.length;
  const m = tokens.length;
  // prev[j] === true  ⇔  tokens[0..i-1] match the input prefix s[0..j-1].
  let prev = new Array(n + 1).fill(false);
  prev[0] = true; // empty token list matches the empty prefix
  for (let i = 1; i <= m; i += 1) {
    const tok = tokens[i - 1];
    const cur = new Array(n + 1).fill(false);
    if (tok.k === 'star' || tok.k === 'globstar') {
      const crossesSlash = tok.k === 'globstar';
      for (let j = 0; j <= n; j += 1) {
        // Star matches empty here (inherit prev[j]), OR absorbs one more input
        // char (extend cur[j-1]) provided the char is permitted by this star.
        let v = prev[j];
        if (!v && j > 0 && cur[j - 1]) {
          const ch = s[j - 1];
          if (crossesSlash || ch !== '/') v = true;
        }
        cur[j] = v;
      }
    } else {
      // lit / one consume EXACTLY one input char.
      for (let j = 1; j <= n; j += 1) {
        if (!prev[j - 1]) continue;
        const ch = s[j - 1];
        if (tok.k === 'one') {
          if (ch !== '/') cur[j] = true;
        } else if (ch === tok.c) {
          cur[j] = true;
        }
      }
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * Compile a glob into a linear-time matcher. Named `globToRegex` for backward
 * compatibility — every caller (this module's `touchesOverlap` and
 * `findCoveringPlan`, plus `plan-index/conflict-detect.js` and
 * `hooks/PreToolUse.Write.js`) uses ONLY the returned object's `.test(str)`,
 * which is contract-compatible with `RegExp.prototype.test` but backed by the
 * ReDoS-immune dynamic program above. Never throws for any input (tokenize and
 * match are total functions), so the safety-oracle catch in `touchesOverlap`
 * stays correct as documented-unreachable defense in depth.
 *
 * @param {string} glob
 * @returns {{ test: (input: *) => boolean, glob: string }}
 */
function globToRegex(glob) {
  const tokens = tokenizeGlob(glob);
  return {
    glob: typeof glob === 'string' ? glob : '',
    test(input) {
      return matchTokens(tokens, input);
    },
  };
}

/**
 * Whether two lists of path globs/literals OVERLAP — true iff some entry on one
 * side matches some entry on the other. For each pair `(a, b)` they overlap when
 * they are string-equal, OR a glob on EITHER side matches the other side treated
 * as a literal (`globToRegex(a).test(b) || globToRegex(b).test(a)`). This is the
 * same bidirectional predicate shipped in `src/lib/plan-index/conflict-detect.js`,
 * built on the SAME audited `globToRegex` the enforcement hook trusts — no new
 * copy of glob logic.
 *
 * Unlike conflict-detect's advisory `filesOverlap` (which fails open to "no
 * overlap"), this predicate backs the scheduler's file-conflict safety oracle, so
 * a `globToRegex` that throws on a pathological entry is treated CONSERVATIVELY as
 * an overlap (block), never silently as "safe to run concurrently".
 *
 * @param {string[]} aList - path globs or literal paths
 * @param {string[]} bList - path globs or literal paths
 * @returns {boolean} true iff any (a, b) pair overlaps
 */
function touchesOverlap(aList, bList) {
  if (!Array.isArray(aList) || !Array.isArray(bList)) return false;
  if (aList.length === 0 || bList.length === 0) return false;
  for (const a of aList) {
    if (typeof a !== 'string' || a.length === 0) continue;
    for (const b of bList) {
      if (typeof b !== 'string' || b.length === 0) continue;
      if (a === b) return true;
      try {
        if (globToRegex(a).test(b) || globToRegex(b).test(a)) return true;
      } catch {
        // A pathological glob must not false-safe a safety oracle → block.
        return true;
      }
    }
  }
  return false;
}

/**
 * Read a plan's `files:` declaration as an array of globs.
 * Returns [] for plans without a `files:` block.
 *
 * Behaviour is UNCHANGED for the one-argument call (an unreadable plan yields `[]`,
 * contributing no globs, which is itself a fail-closed outcome). The OPTIONAL
 * second argument takes content the caller has ALREADY read, mirroring
 * `approval-residency.classifyResidency`'s `content` parameter: the scan reads each
 * plan exactly ONCE and reuses that text for both glob parsing and the approval
 * hash, so consulting the ledger costs no extra read.
 *
 * @param {string} planPath
 * @param {string|null} [content] - pre-read file content, to avoid a re-read
 * @returns {string[]}
 */
function readPlanFiles(planPath, content = null) {
  let text = content;
  if (text == null) {
    try { text = safeFs.readFileSync(planPath, 'utf8'); } catch { return []; }
  }
  return parsePlanFiles(text);
}

/**
 * Parse a plan's `files:` declaration out of ALREADY-READ content.
 *
 * Every caller passes a string read from disk, and the ONE call site inside the
 * scan wraps this in the same try/catch that guards the read — so a parse fault
 * skips that plan (it grants nothing, which is the fail-CLOSED direction) instead
 * of escaping into the hook's fail-open catch. Deliberately no `typeof` guard
 * returning `[]`: a no-match branch that returns a VERDICT cannot distinguish "this
 * plan declares no files" from "I could not read my input", which is the false-green
 * shape this repository fences.
 *
 * @param {string} content - the plan file's full text
 * @returns {string[]}
 */
function parsePlanFiles(content) {
  // Read the UNION of every LEADING `---…---` block, not just the first.
  //
  // `addApprovalMarker` (actions.js) PREPENDS a marker block on each human-gate
  // crossing, so a plan that crossed Gate 2 arrives in `todo/` with the marker
  // FIRST and its own frontmatter — the block that carries `files:` — SECOND
  // (a multi-gate plan carries three or four blocks). The single-block reader
  // found no `files:` in the marker and resolved such a plan to EMPTY coverage,
  // which made the enforcement hook BLOCK the implementer from editing the very
  // files the plan declares. `state.parseMetadata` already merges leading blocks
  // for this exact reason (finding M19); the coverage oracle must agree with it,
  // or the hook and the parsed plan view disagree about the same file.
  //
  // Robustness mirrors parseMetadata: `extractFrontmatterRegion` is lazy-required
  // (no cycle today — stale-detector imports none of this — and the lazy require
  // keeps it that way) and ANY error or an empty region FALLS OPEN to the previous
  // CRLF-safe single-block reader, so a parser fault can never resolve to less
  // coverage than before. The region is \r-free on both readers (finding H1): do
  // NOT re-inline a bare /^---\n/ here — that LF-only pattern silently resolves a
  // CRLF plan to EMPTY coverage, locking the Windows user out of declared files.
  let fmBody = null;
  try {
    const { extractFrontmatterRegion } = require('./stale-detector');
    const region = extractFrontmatterRegion(content);
    if (typeof region === 'string' && region.length > 0) fmBody = region;
  } catch {
    fmBody = null; // fail-open to the single-block reader below
  }
  if (fmBody === null) {
    const { hasFrontmatter, raw } = parseFrontmatter(content);
    if (!hasFrontmatter) return [];
    fmBody = raw;
  }

  // Find the `files:` block, then collect `  - "..."` items until the next
  // top-level key or end. MERGE RULE — the LAST `files:` in the region wins,
  // matching `parseFrontmatterLines`' documented "a later duplicate key
  // OVERRIDES an earlier one": the plan's own block is physically later than any
  // prepended marker, so the plan's own declaration is authoritative. The winning
  // list REPLACES an earlier one rather than unioning with it — a plan's declared
  // coverage is exactly what its own block says, never an accumulation.
  const regionLines = fmBody.split('\n');
  let filesIdx = -1;
  for (let k = 0; k < regionLines.length; k++) {
    if (/^files:\s*$/.test(regionLines[k])) filesIdx = k;
  }
  if (filesIdx === -1) return [];
  const files = [];
  for (const line of regionLines.slice(filesIdx + 1)) {
    const m = line.match(/^\s*-\s*["']?([^"'\n]+?)["']?\s*$/);
    if (m) {
      files.push(m[1]);
    } else if (/^\S/.test(line)) {
      // hit next top-level key, stop
      break;
    }
  }
  return files;
}

/**
 * Whether a plan `files:` glob itself escapes the project root — i.e. it is
 * `..` or contains a `..` path segment (either separator). Defense in depth for
 * root confinement: such a glob is ignored so a plan can never declare
 * out-of-tree coverage in the first place. A literal `..` inside a filename
 * segment (never a real path) is not our concern; matching whole segments is
 * the correct, conservative test.
 *
 * @param {string} glob
 * @returns {boolean}
 */
function globEscapesRoot(glob) {
  if (typeof glob !== 'string') return false;
  // NORMALIZE before testing: a `..` SEGMENT is not the same as an ESCAPE. A glob
  // like `src/mod/../mod/**` normalizes back inside the tree and must keep covering;
  // only a glob that normalizes to `..` or `../…` actually escapes root.
  const n = path.posix.normalize(glob.replace(/\\/g, '/'));
  return n === '..' || n.startsWith('../');
}

/**
 * Score a glob's specificity (more specific = higher score).
 * Used to pick the most-specific match within a stage.
 *
 * @param {string} glob
 * @returns {number}
 */
function specificity(glob) {
  return glob.length - (glob.match(/\*\*/g) || []).length * 5 - (glob.match(/\*/g) || []).length;
}

/**
 * THE SCAN. Walks the coverage stages in priority order and returns BOTH the
 * best APPROVED match and, for the block path, the best REJECTED candidate.
 *
 * TOTAL BY CONSTRUCTION — every fault returns `{ ok: false }`, which both public
 * entry points turn into `null` (a DENY). It never throws, because a throw reaches
 * `PreToolUse.Edit.js`'s fail-OPEN catch and becomes an ALLOW.
 *
 * @param {string} targetFile - path relative to project root, or absolute
 * @param {string} root - project root
 * @returns {{ok: boolean, match: (object|null), denial: (object|null)}}
 */
function scanForCoverage(targetFile, root) {
  const FAILED = { ok: false, match: null, denial: null };
  // Normalize target relative to root for matching
  let relRaw;
  let relTarget;
  try {
    const absTarget = path.isAbsolute(targetFile) ? targetFile : path.join(root, targetFile);
    relRaw = path.relative(root, absTarget);
    relTarget = relRaw.replace(/\\/g, '/');
  } catch {
    // A path operation that cannot resolve the target is not permission to write it.
    return FAILED;
  }

  // ROOT CONFINEMENT (out-of-repo write prevention). The coverage oracle backs
  // the Edit hook's allow-decision, so it must NEVER vouch for a path outside
  // the project tree. A target whose relative path escapes root — '..', a
  // '../…' prefix (either separator), or an absolute path (path.relative can
  // return one for a different Windows drive) — is rejected outright. Without
  // this, a plan declaring `files: ["../../**"]` (plan files are edit-
  // whitelisted, so an agent can author one) would authorize an arbitrary
  // write anywhere on disk.
  if (
    relTarget === '..' ||
    relTarget.startsWith('../') ||
    relRaw === '..' ||
    relRaw.startsWith('..' + path.sep) ||
    path.isAbsolute(relRaw) ||
    path.isAbsolute(relTarget)
  ) {
    return { ok: true, match: null, denial: null };
  }

  // REAL-PATH CONFINEMENT. The block above is pure ARITHMETIC and cannot see a
  // symbolic link: with `link → /outside` in the tree, `/repo/link/x.js` yields the
  // clean relative path `link/x.js`, passes every test above, and writes outside the
  // repository. Ask the filesystem where the target REALLY leads.
  //
  // FAILING DIRECTION: `escapes === true` DENIES, and every fault inside
  // `escapesRoot` returns `true` — it never throws, because a throw reaches
  // `PreToolUse.Edit.js`'s fail-OPEN catch and becomes an ALLOW.
  //
  // PLACEMENT IS LOAD-BEARING. AFTER the arithmetic, so an obviously-escaping target
  // costs zero syscalls; BEFORE the stage loop, so the resolution is paid ONCE per
  // call rather than once per plan or once per glob.
  //
  // The verdict is `{ ok: true, match: null }` — not FAILED — matching exactly how
  // the arithmetic escape above is reported: an out-of-tree target is not a scan
  // fault, it is a target no plan may ever cover. No new message shape is introduced.
  if (realPathConfinement.escapesRoot(targetFile, root).escapes) {
    return { ok: true, match: null, denial: null };
  }

  let denial = null;
  for (const stage of STAGE_PRIORITY) {
    const stageDir = path.join(root, 'plans', stage);
    let files;
    try {
      // A stage directory that does not exist is SKIPPED — a project need not have
      // every stage, and that is not a fault.
      if (!safeFs.existsSync(stageDir)) continue;
      // FAIL CLOSED, NEVER BY THROWING. A directory that EXISTS but cannot be listed
      // is a fault in the permission check itself. It used to throw straight into
      // `PreToolUse.Edit.js`'s fail-OPEN catch, which turned an unreadable plans
      // directory into a blanket ALLOW. It now denies the whole call.
      files = safeFs.readdirSync(stageDir).filter(f => f.endsWith('.md') && f !== '.gitkeep');
    } catch {
      return FAILED;
    }

    let best = null;
    for (const f of files) {
      const planPath = path.join(stageDir, f);
      // Read each plan ONCE and reuse the content for glob parsing AND (only if a
      // glob actually matched) the approval hash.
      let content;
      let globs;
      try {
        content = safeFs.readFileSync(planPath, 'utf8');
        globs = readPlanFiles(planPath, content);
      } catch {
        // A plan that cannot be read or parsed contributes NO globs, so it grants
        // nothing — the fail-CLOSED direction. It must not throw out of here: that
        // reaches the hook's fail-open catch and becomes an ALLOW.
        continue;
      }
      // LAZY APPROVAL. Resolved at most once per plan, and only after one of its
      // globs matched — so the hash is never computed for a plan that was never a
      // candidate. `undefined` means "not yet asked".
      let approval;
      for (const rawGlob of globs) {
        // Normalize the glob ONCE (collapse `.`/`..`/`//` segments) so a non-escaping
        // `..` like `src/mod/../mod/**` both survives the escape check AND matches
        // `src/mod/thing.js`. Only a glob that normalizes to `..`/`../…` truly escapes.
        const glob = typeof rawGlob === 'string'
          ? path.posix.normalize(rawGlob.replace(/\\/g, '/'))
          : rawGlob;
        // Defense in depth: a plan may not declare out-of-tree coverage.
        if (globEscapesRoot(glob)) continue;
        const re = globToRegex(glob);
        if (!re.test(relTarget)) continue;

        if (approval === undefined) {
          approval = approvalResidency.isApprovedForCoverage(planPath, stage, root, content);
        }
        const score = specificity(glob);
        const ref = `${stage}/${f.replace(/\.md$/, '')}`;
        if (!approval.approved) {
          // EXCLUDED BEFORE RANKING, so an APPROVED less-specific glob correctly
          // beats an UNAPPROVED more-specific one. Kept only to explain the denial.
          if (!denial || score > denial.score) {
            denial = { plan: ref, stage, glob, reason: approval.reason, score };
          }
          continue;
        }
        if (!best || score > best.score) {
          best = { plan: ref, stage, glob, score };
        }
      }
    }
    if (best) return { ok: true, match: { plan: best.plan, stage: best.stage, glob: best.glob }, denial: null };
  }
  return { ok: true, match: null, denial };
}

/**
 * Find the plan that covers `targetFile` in the project at `root`.
 * Returns null if no APPROVED plan covers it — including when the scan could not
 * complete, because a permission check that allows because it could not look is
 * the whole defect this module exists to prevent.
 *
 * @param {string} targetFile - Path relative to project root (or absolute; both supported)
 * @param {string} root - Project root
 * @returns {{ plan: string, stage: string, glob: string } | null}
 */
function findCoveringPlan(targetFile, root) {
  const res = scanForCoverage(targetFile, root);
  return res.ok ? res.match : null;
}

/**
 * Explain a denial: the best-matching plan that DECLARED this target but was
 * REJECTED, and why. For the BLOCK PATH ONLY — it re-runs the scan, so it must
 * never be called on an allow.
 *
 * A lockout the human can read is a correction; one they cannot read is what gets
 * reverted — and reverting this check reopens a self-granting write surface on gate
 * enforcement. The result carries a fixed-vocabulary reason and a repository-relative
 * plan reference only: no file contents, no absolute paths, no stack traces.
 *
 * @param {string} targetFile - path relative to project root, or absolute
 * @param {string} root - project root
 * @returns {{plan: string, stage: string, glob: string, reason: (string|null)} | null}
 *   `null` when nothing matched, when a plan DID cover the target, or on any fault.
 */
function explainDenial(targetFile, root) {
  try {
    const res = scanForCoverage(targetFile, root);
    if (!res.ok || res.match || !res.denial) return null;
    const d = res.denial;
    return { plan: d.plan, stage: d.stage, glob: d.glob, reason: d.reason };
  } catch {
    // Explanatory only: a fault here must never change a decision, and must never
    // throw into the hook's fail-open catch.
    return null;
  }
}

module.exports = {
  findCoveringPlan,
  explainDenial,
  readPlanFiles,
  globToRegex,
  touchesOverlap,
};
