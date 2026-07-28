'use strict';

/**
 * Content-hashed approval-provenance ledger (finding C4).
 *
 * This module is the SINGLE SOURCE OF APPROVAL TRUTH for CTOC's human gates.
 * Provenance for a plan lives in `.ctoc/approvals/<slug>.json`, keyed to the
 * plan's content hash and the exact gate edge it was approved for — NOT to the
 * `approved_by: human` marker text in the plan body, which any agent can write
 * with an ordinary tool call. The ledger closes that self-approval forgery at
 * its root:
 *
 *   - no ledger entry            ⇒ NOT approved (a self-authored marker alone
 *                                   never counts);
 *   - live content hash differs  ⇒ NOT approved (a post-approval change to the
 *                                   hashed region, including a re-stamped marker,
 *                                   invalidates the entry — see WHAT THE HASH
 *                                   COVERS below);
 *   - `stage_to` differs         ⇒ NOT approved (an entry recorded for one gate
 *                                   edge cannot be replayed to justify another).
 *
 * WHAT THE HASH COVERS, AND WHY IT IS NOT THE WHOLE FILE. A plan file is TWO
 * documents in one: the SPECIFICATION the human ruled on at a gate, and the
 * EXECUTION LOG the executor writes into that same file during Steps 8–16. Binding
 * an approval to the whole file therefore invalidated it on every ordinary build,
 * BY CONSTRUCTION — and because `hash-mismatch` is treated as a live attack
 * signature, ordinary building armed a revert of a plan out of the very destination
 * the human had just approved it into. An entry recording
 * `hash_scope: 'specification'` binds to the specification only
 * ({@link computeSpecHash}: the frontmatter in full, plus the body minus the
 * executor's named execution sections and its `- [x]` completion records). An entry
 * with no `hash_scope` — every entry written before this existed — keeps WHOLE-FILE
 * semantics and is verified under {@link computeContentHash}, exactly as written.
 * Nothing is ever re-hashed: re-hashing a legacy entry against current content would
 * launder every post-approval amendment into an approved state, which is precisely
 * the forgery the ledger exists to expose. Entries age into the specification scope
 * only as plans are genuinely re-approved.
 *
 * WHERE THE DENY ACTUALLY LIVES (R3-A — the previous version of this header made
 * a promise the code did not keep, so read this one literally):
 *   - EDIT CHANNEL: `PreToolUse.Edit.js` denies every Edit/Write/MultiEdit/
 *     NotebookEdit tool call targeting `.ctoc/approvals/` (`isProtectedLedgerPath`).
 *   - BASH CHANNEL: `PreToolUse.Bash.js` (`isLedgerForgery`) denies, as its FIRST
 *     layer, any command that writes the ledger directory (redirect/tee/cp/mv/…),
 *     any INLINE EVAL (`node -e`/`--eval`/`-p`/stdin) referencing this module, the
 *     ledger directory, or a gate/ledger verb, and any inline eval that cannot be
 *     statically cleared. Until R3-A this deny did NOT exist and the header's
 *     "agent writes are denied" claim was FALSE: `node -e "require('./src/lib/
 *     approval-ledger').writeEntry(…)"` minted a human-kind entry at will.
 *   - NOT COVERED (stated honestly, because a false guarantee is worse than none):
 *     a checked-in `.js` file executed with `node file.js` is not an inline eval and
 *     is not string-matchable — it is a REVIEWABLE artifact, which is the point.
 *     `src/scripts/ledger-backfill.js` is the ONE sanctioned writer of that shape.
 *
 * Entries are otherwise written only by the trusted, non-tool-call `approvePlan()`
 * code path (`stampAndLedger`), by `stale-cleanup.js` (pipeline kind), and by the
 * sanctioned backfill script. Its ONLY intra-project dependency is the pure-constant
 * `gate-order.js` (the ONE gate-edge encoding, R6-B), which requires nothing — so
 * there is no require cycle and this module stays side-effect-free and fast on the
 * Bash-hook path. `human-gate-check.js` and `actions.js` build on it.
 *
 * All filesystem I/O routes through `./safe-fs` (the audited choke point) and
 * every path is composed with `path.join`, so the module is cross-platform and
 * never writes outside `.ctoc/approvals/`.
 *
 * FIVE ENTRY KINDS (R2-F, extended by R3-A item 5; made honest by X5; the fifth,
 * SUFFICIENCY, added by X6). Every entry
 * declares its provenance POSITIVELY, and `entryKind(entry)` reports it honestly —
 * a claim this header made from R3-A onward while the code did the opposite, until
 * X5. Until X5 the classifier `return`ed `'human'` for ANYTHING it did not
 * recognise, so `'human'` was the ABSENCE of evidence and an entry stamped
 * `advanced_by: 'sufficiency-gate'` was waved through every gate as a human
 * approval. It now fails CLOSED to `'unknown'`, and the gate hook rejects
 * `'unknown'` on every path:
 *   - HUMAN kind (`writeEntry`, the default): a human crossed the gate via the
 *     menu (`approvePlan`/`stampAndLedger`). Classified `'human'` ONLY on a
 *     positive `approved_by: 'human'` marker — never as a fallthrough.
 *   - BACKFILLED kind (`backfillEntry`): a human-authorized MIGRATION of a plan that
 *     crossed a gate BEFORE the ledger existed — a human-kind record additionally
 *     stamped `backfilled: true` + `backfill_reason`, hashing the plan's CURRENT
 *     on-disk content. The gate ACCEPTS it (the human ordered the migration) but
 *     `entryKind` returns `'backfilled'`, never `'human'`, so an audit can always
 *     tell a migrated entry from a live human approval. Acceptance is not weakened;
 *     the classification is truthful.
 *   - PIPELINE kind (`writePipelineEntry`, `writeVisionArchiveEntry`): the automated
 *     pipeline advanced a plan (stale reconciliation; a decomposed vision archived to
 *     `done/`). It carries `advanced_by: 'pipeline'` and a MANDATORY non-empty
 *     `evidence` string; a write with no evidence is refused loudly.
 *     `human-gate-check.js` accepts a pipeline entry ONLY at `done/` (never at the
 *     pre-done gate `todo/`, which stays human-only).
 *   - SUFFICIENCY kind (`writeSufficiencyEntry`, X6): the plan carried ENOUGH
 *     INFORMATION to be built without guessing — every fork among its computed
 *     decision questions was answered — so the pipeline advanced it ITSELF and the
 *     human approved nothing. It carries `advanced_by: 'sufficiency'` and a
 *     MANDATORY non-empty `evidence` string, and `approved_by` is FORBIDDEN on it
 *     (refused loudly, never stripped — a sufficiency entry wearing the human's
 *     marker is the forgery shape X5 closed). `human-gate-check.js` accepts it ONLY
 *     at the PRE-BUILD gate destinations (implementation, todo) with evidence, and
 *     REJECTS it at `done/` — Gate 3 asks "was this built correctly?", answered by
 *     review and the 14 quality dimensions, not by an answered-question log.
 *   - UNKNOWN kind (X5): no recognised provenance — an unrecognised non-empty
 *     `advanced_by`, or an entry carrying no positive marker at all. It is REJECTED
 *     by `human-gate-check.js` at every gate (`unknown-provenance`). This kind is
 *     never WRITTEN by this module; it is what an unrecognised entry CLASSIFIES as.
 *     Adding a new provenance means adding it to `entryKind` deliberately, in the
 *     open, with its own guard in the hook — never inventing it at a call site.
 *
 * CANONICAL LOWERCASE SLUGS (R2-F). `slugFromPlanPath` lowercases and every
 * boundary (`ledgerPath`, and thus every read/write) canonicalizes its slug to
 * lowercase BEFORE the `SLUG_RE` path-safety test — so a legacy mixed-case plan
 * (e.g. `CU1-Foo.md`) keys to `cu1-foo.json` consistently on both the write side
 * (`stampAndLedger`/`backfillEntry`) and the residency-sweep read side. `SLUG_RE`
 * itself is UNCHANGED: lowercasing never loosens the traversal guard (a `/`, `..`,
 * drive letter, or any non-`[a-z0-9-]` character is still rejected). Two plans
 * whose basenames differ only by case would collide on the canonical key; the
 * write path detects an existing entry recorded for a DIFFERENT original basename
 * and fails loudly rather than silently overwriting.
 */

const crypto = require('crypto');
const path = require('path');
const safeFs = require('./safe-fs');
// The ONE gate-edge encoding (R6-B). `sourceOf(to)` returns the gate SOURCE stage for
// a destination — the destination→source inverse of gate-order's forward `GATE_EDGES`
// — so a backfilled entry's `stage_from` (see `backfillEntry`) derives from that single
// encoding and can never diverge. gate-order is a pure constant module (zero requires)
// — no require cycle, no cost, side-effect-free on the Bash-hook path.
const { sourceOf } = require('./gate-order');

/**
 * A plan slug is a lowercase-alphanumeric-plus-hyphen token that must start
 * with an alphanumeric. This mirrors the slug guard used by `createCanvas` in
 * `actions.js` and guarantees a slug can never contain a path separator, a
 * `..` segment, a drive letter, or any other character that would let a
 * crafted value escape `.ctoc/approvals/`.
 */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Fields a ledger entry MUST carry; a write missing any of them is rejected. */
const REQUIRED_FIELDS = ['content_sha256', 'stage_from', 'stage_to'];

/**
 * Absolute path to the ledger directory under a project root.
 *
 * @param {string} projectPath - the project root
 * @returns {string} `<projectPath>/.ctoc/approvals`
 */
function ledgerDir(projectPath) {
  return path.join(projectPath, '.ctoc', 'approvals');
}

/**
 * Absolute path to a single plan's ledger entry, with a hard slug guard so a
 * crafted slug (e.g. `../../etc/passwd`) can never escape `.ctoc/approvals/`.
 *
 * @param {string} slug - the plan slug (validated against {@link SLUG_RE})
 * @param {string} projectPath - the project root
 * @returns {string} `<projectPath>/.ctoc/approvals/<slug>.json`
 * @throws {Error} `Invalid slug` when `slug` is not a safe token
 */
function ledgerPath(slug, projectPath) {
  // Canonicalize to lowercase at the boundary BEFORE the path-safety test, so a
  // legacy mixed-case slug keys consistently. SLUG_RE is unchanged: lowercasing
  // cannot introduce a `/`, `..`, or any other traversal character, so the guard
  // stays exactly as tight (`../../etc/passwd` still fails).
  const key = typeof slug === 'string' ? slug.toLowerCase() : slug;
  if (typeof key !== 'string' || !SLUG_RE.test(key)) {
    throw new Error('Invalid slug');
  }
  return path.join(ledgerDir(projectPath), `${key}.json`);
}

/**
 * Derive a plan's slug from its file path. The slug is the basename with the
 * trailing `.md` removed — stable across a stage move, because `movePlan`
 * keeps the basename identical when it relocates a plan between stage folders.
 *
 * @param {string} planPath - a path ending in `<slug>.md`
 * @returns {string} the slug
 */
function slugFromPlanPath(planPath) {
  // Canonical lowercase (R2-F): the ledger key for a plan is ALWAYS lowercase, so
  // a legacy mixed-case basename (e.g. `CU1-Foo.md`) keys to `cu1-foo`. The
  // original-cased basename is recovered separately (via `path.basename`) where a
  // human-readable form or a collision check needs it.
  return path.basename(planPath).replace(/\.md$/i, '').toLowerCase();
}

/**
 * SHA-256 (hex) of a plan's FULL file content — frontmatter plus body, exactly
 * as written to disk. Hashing the whole file means ANY later edit (including a
 * re-stamped approval marker) changes the hash and invalidates the entry.
 *
 * KEPT, UNCHANGED, AND STILL EXPORTED. This is the `hash_scope: 'file'` semantics
 * that every entry written before the specification scope existed was written
 * with. Legacy entries are verified under the semantics they were written with,
 * and NOTHING is retroactively re-hashed — re-hashing would launder every
 * post-approval amendment into an approved state, which is the exact forgery the
 * specification scope exists to make visible. It is also the RIGHT scope for
 * `done/`, where no legitimate editor exists (see {@link computeSpecHash}).
 *
 * @param {string} content - the plan's full file content
 * @returns {string} the lowercase hex SHA-256 digest
 */
function computeContentHash(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/* ---------------------------------------------------------------------------
 * SPECIFICATION HASHING — the approval binds to what the human ruled on.
 *
 * THE DEFECT THIS CLOSES. A plan file is TWO documents in one: the SPECIFICATION
 * the human approved at a gate, and the EXECUTION LOG the executor writes into
 * that same file during Steps 8–16 (step completion records, an execution-record
 * section, decisions taken while building). Binding an approval to a hash of the
 * WHOLE file therefore invalidated that approval on every ordinary build, BY
 * CONSTRUCTION — not as an edge case. Measured on this repository before the fix:
 * every slice executed that day recorded `stage_to: "todo"` and failed `verify`
 * against its own current text. Because `hash-mismatch` is classified as a live
 * attack signature (it reverts on every project, migrated or not), an executor
 * building a plan that physically resides in `todo/` armed a MID-BUILD REVERT of
 * its own plan out of the gate destination the human had just approved it into.
 *
 * THE BOUNDARY IS A DENY-LIST, NEVER AN ALLOW-LIST. The hashed region is the whole
 * file MINUS explicitly excluded regions. An allow-list would silently exempt any
 * specification section nobody remembered to list — it fails OPEN, and quietly. A
 * deny-list hashes anything new by default, so a forgotten or newly invented
 * section is PROTECTED rather than exempted. Every runtime drift therefore degrades
 * toward NOISE (a false mismatch, which is recoverable by re-approval) and never
 * toward SILENCE (a forged approval, which is not recoverable at all):
 *
 *   | drift                                        | effect            | direction |
 *   |----------------------------------------------|-------------------|-----------|
 *   | executor invents an unlisted section         | hashed → mismatch | noisy     |
 *   | executor writes a record without a checkbox  | hashed → mismatch | noisy     |
 *   | executor edits a specification section       | mismatch          | CAUGHT    |
 *   | planner amends scope after approval          | mismatch          | CAUGHT    |
 *   | a heading is ADDED to EXECUTION_SECTIONS     | silently exempt   | a reviewed source change |
 *
 * The only silent-exemption route is a deliberate edit to a frozen constant in a
 * reviewed source file. Nothing an executor can do at runtime is silent.
 *
 * NARROW, NOT WIDENED — the ruling, stated so it can be attacked. Every widening
 * proposal (a marker, a delimiter convention, an executor-owned region) moves the
 * boundary from a frozen constant in reviewed source to a boundary CHOSEN AT RUNTIME by
 * the executor — the party whose writes the boundary exists to contain. That is not a
 * smaller version of today's disclosed loss; it deletes the whole safety argument (the
 * only silent exemption is a reviewed source diff). The narrow list keeps failing NOISY
 * (recoverable by re-approval); a runtime boundary fails SILENT (not recoverable). So
 * the list stays frozen, and the ONE reviewed way to exempt content is
 * {@link EXECUTION_SECTION_PRODUCERS} — a table that forces every exemption to name its
 * PRODUCER in the same diff, the only brake available inside a frozen-constant design.
 * When the hash still moves, {@link diagnoseSpecMismatch} makes the failure LEGIBLE (it
 * names the appended section instead of alleging a forged approval) WITHOUT moving the
 * boundary or granting acceptance.
 *
 * IT FAILS CLOSED. When the boundary cannot be established at all — no frontmatter
 * delimiters, an unterminated block, empty content — `computeSpecHash` returns
 * `ok: false` and EVERY caller must treat that as a FAILED verification. Not being
 * able to establish a binding is not a pass; a plan is never trusted INTO an
 * approval.
 *
 * THE DISCLOSED LOSS, stated rather than buried. `## Decisions Taken Under
 * Ambiguity` is excluded because the executor is REQUIRED to append to it, so
 * hashing it would reproduce the defect. The cost is real: an executor could
 * rewrite the planner's recorded decisions without breaking the approval. The
 * bound that makes it acceptable is that the section is a RECORD, not a GRANT — it
 * confers no write surface and no scope. Every grant-bearing part stays hashed: the
 * frontmatter (including `files:`, the actual write-surface grant), the scope prose,
 * the implementation specification, the test plan, and the step headings. The fix
 * that recovers the loss — splitting the planner's decisions from the executor's
 * into two sections — is a template and agent-contract change, and is the human's
 * to schedule.
 * ------------------------------------------------------------------------- */

/**
 * THE EXCLUSION LIST NAMES ITS PRODUCERS. Each excluded heading is paired with the
 * producer that writes that section — the executor step, the rule, or the agent
 * contract. `heading` is the normalised prefix (trimmed, lowercase, marker stripped)
 * exactly as {@link isExecutionHeading} matches; `producer` is a non-empty string.
 *
 * WHY A TABLE, NOT A BARE LIST. Adding an exemption is the one and only way to exempt
 * content silently (the deny-list's sanctioned, reviewed route — see the block comment
 * above). A bare list let the set grow by convenience with nobody able to tell who
 * writes each section. Forcing every row to name its producer makes an unjustifiable
 * addition visible in the SAME reviewed diff — the only brake available inside a
 * frozen-constant design. The rows are UNCHANGED in value and order from the six bare
 * strings this replaced, so {@link EXECUTION_SECTIONS} (derived below), every consumer,
 * and the pinned source digest are untouched.
 *
 * The scope-stop rule (plan 00123) records what landed under `## Execution Record`,
 * which is ALREADY the first row — so the sanctioned, enumerable producer needs NO new
 * exempting heading. A genuinely novel heading nobody has named still breaks the hash,
 * which is the deny-list failing NOISY (recoverable), the correct direction, unchanged.
 *
 * @type {ReadonlyArray<{heading: string, producer: string}>}
 */
const EXECUTION_SECTION_PRODUCERS = Object.freeze([
  Object.freeze({ heading: 'execution record', producer: 'iron-loop-executor — Steps 8–16 execution record; scope-stop rule (plan 00123)' }),
  Object.freeze({ heading: 'execution log', producer: 'iron-loop-executor — Steps 8–16 execution log' }),
  Object.freeze({ heading: 'step 16 final-review report', producer: 'iron-loop-executor — Step 16 FINAL-REVIEW report' }),
  Object.freeze({ heading: 'decisions taken during execution', producer: 'iron-loop-executor — decisions recorded while building' }),
  Object.freeze({ heading: 'verification evidence', producer: 'iron-loop-executor — Step 14 VERIFY evidence' }),
  Object.freeze({ heading: 'decisions taken under ambiguity', producer: 'implementation-planner / iron-loop-executor — documented choices under ambiguity' }),
]);

/**
 * Headings whose sections are EXCLUDED from the specification hash, normalised
 * (marker stripped, trimmed, lowercased). DERIVED from {@link EXECUTION_SECTION_PRODUCERS}
 * so the table is the single source of truth; identical in type, value and order to the
 * six bare strings it replaced. Matched by PREFIX, because the real headings on disk
 * carry suffixes: `## Execution Record (Steps 8–16)`, `## Execution Log (Steps 8–16)`.
 * An exact match would have recognised NONE of them.
 *
 * @type {ReadonlyArray<string>}
 */
const EXECUTION_SECTIONS = Object.freeze(EXECUTION_SECTION_PRODUCERS.map((e) => e.heading));

/**
 * Is a normalised heading title the start of an excluded execution section?
 * Prefix match — see {@link EXECUTION_SECTIONS}.
 *
 * @param {string} title - heading text, already trimmed and lowercased
 * @returns {boolean}
 */
function isExecutionHeading(title) {
  for (const name of EXECUTION_SECTIONS) {
    if (title.startsWith(name)) return true;
  }
  return false;
}

/**
 * Heading level of a trimmed line (`###` → 3), or 0 when the line is not an ATX
 * heading. A heading requires at least one `#` followed by whitespace, so a bare
 * `#` or a `#tag` is not a heading. Character-wise, so no regular expression is
 * compiled per line.
 *
 * @param {string} trimmed - the line, already trimmed
 * @returns {number} the heading level, or 0
 */
function headingLevel(trimmed) {
  let level = 0;
  while (level < trimmed.length && trimmed.charCodeAt(level) === 35 /* '#' */) level++;
  if (level === 0 || level >= trimmed.length) return 0;
  const next = trimmed.charCodeAt(level);
  return (next === 32 /* space */ || next === 9 /* tab */) ? level : 0;
}

/**
 * Is this line the executor's completion-record marker — `- [x]`, `- [X]` or
 * `- [ ]` at the start of the trimmed line?
 *
 * This convention is NOT invented here: `plan-validator.validateStepsComplete`
 * already treats `- [x]` as THE completion signal, so it is already load-bearing
 * in this codebase. Reusing it adds no second encoding of "this line is an
 * execution record". Plain bullets — the Step 10 `  - src/lib/x.js — …` sub-items,
 * which ARE specification — are untouched and stay hashed.
 *
 * Character-wise, so no regular expression is compiled per line.
 *
 * @param {string} trimmed - the line, already trimmed
 * @returns {boolean}
 */
function isCheckboxLine(trimmed) {
  if (trimmed.length < 5) return false;
  if (trimmed.charCodeAt(0) !== 45 /* '-' */) return false;
  if (trimmed.charCodeAt(1) !== 32 /* ' ' */) return false;
  if (trimmed.charCodeAt(2) !== 91 /* '[' */) return false;
  if (trimmed.charCodeAt(4) !== 93 /* ']' */) return false;
  const mark = trimmed.charCodeAt(3);
  return mark === 120 /* x */ || mark === 88 /* X */ || mark === 32 /* space */;
}

/**
 * SHA-256 (hex) of a plan's SPECIFICATION — the frontmatter plus the body with the
 * executor's execution log removed. See the block comment above for the boundary,
 * the deny-list argument, the fail-closed rule and the disclosed loss.
 *
 * ONE LINEAR PASS over the lines: the frontmatter walk and the body filter run in
 * the same traversal, and neither compiles a regular expression per line.
 *
 * THE FRONTMATTER SPLIT IS LOCAL, DELIBERATELY. `stale-detector.extractFrontmatterRegion`
 * is the codebase's canonical derivation and this walk mirrors it exactly
 * (consecutive leading `---…---` blocks, CRLF-safe, unterminated block stops the
 * walk). It is NOT required here because this module's documented invariant is that
 * its ONLY intra-project dependency is the pure-constant `gate-order.js` — it sits on
 * the every-tool-call Bash-hook path, and `stale-detector` pulls in `safe-fs`,
 * `regex-utils` and the cache. The anti-divergence mechanism is a test that asserts
 * the returned `frontmatter` equals `extractFrontmatterRegion`'s region across
 * stamped, unstamped, blank-led and CRLF fixtures.
 *
 * @param {string} content - the plan's full file content
 * @returns {{hash: (string|null), ok: boolean, reason: (string|null), frontmatter: (string|null)}}
 *   `ok: false` with a `reason` when the boundary cannot be established — which
 *   EVERY caller must treat as a FAILED verification, never as a pass.
 */
function computeSpecHash(content) {
  return computeSpecHashWith(content, null);
}

/**
 * {@link computeSpecHash} with an OPTIONAL set of additionally-excluded heading titles.
 * The two share ONE walk so their exclusion semantics can never diverge — the whole
 * point of {@link diagnoseSpecMismatch}'s proof (removing exactly those sections must
 * restore the approved specification byte-for-byte). With `extraExcluded === null` the
 * output is byte-identical to the pre-existing computeSpecHash and the pinned GOLDEN
 * digest is unmoved.
 *
 * @param {string} content - the plan's full file content
 * @param {(Set<string>|null)} extraExcluded - normalised titles to additionally exclude,
 *   or `null` for the plain specification hash
 * @returns {{hash: (string|null), ok: boolean, reason: (string|null), frontmatter: (string|null)}}
 */
function computeSpecHashWith(content, extraExcluded) {
  if (typeof content !== 'string' || content === '') {
    return { hash: null, ok: false, reason: 'empty-content', frontmatter: null };
  }
  // CRLF-safe split, so a Windows checkout of the same plan hashes identically.
  // Line endings are not part of the specification, and normalising them protects
  // nothing less: every hashed line is compared verbatim after the split.
  const lines = content.split(/\r?\n/);
  const blocks = [];
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  while (i < lines.length && lines[i].trim() === '---') {
    let j = i + 1;
    const block = [];
    let closed = false;
    while (j < lines.length) {
      if (lines[j].trim() === '---') { closed = true; break; }
      block.push(lines[j]);
      j++;
    }
    // An unterminated block means the boundary is not locatable: stop the walk and
    // let the emptiness test below fail CLOSED.
    if (!closed) break;
    blocks.push(block.join('\n'));
    i = j + 1;
    while (i < lines.length && lines[i].trim() === '') i++;
  }
  if (blocks.length === 0) {
    return { hash: null, ok: false, reason: 'no-frontmatter-delimiters', frontmatter: null };
  }
  const frontmatter = blocks.join('\n');

  const kept = [];
  let excluding = false;
  let excludeLevel = 0;
  for (; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const level = headingLevel(trimmed);
    if (level > 0) {
      // An excluded section runs to the next heading of the SAME OR HIGHER level;
      // a deeper heading inside it (e.g. `### Step 14 numbers`) stays excluded.
      if (excluding && level <= excludeLevel) excluding = false;
      const norm = trimmed.slice(level).trim().toLowerCase();
      if (!excluding && (isExecutionHeading(norm) || (extraExcluded !== null && extraExcluded.has(norm)))) {
        excluding = true;
        excludeLevel = level;
        continue;
      }
    }
    if (excluding) continue;
    if (isCheckboxLine(trimmed)) continue;
    kept.push(raw);
  }

  // Length-prefixed domain separation between the two derived regions, so no
  // shuffling of bytes across the frontmatter/body boundary can produce the same
  // digest from a different split.
  //
  // THE SEPARATOR IS WRITTEN AS THE `\x00` ESCAPE, NEVER AS AN EMBEDDED CONTROL
  // CHARACTER — do not "simplify" it back to a raw byte. A single raw NUL flips this
  // file to BINARY for every content-search tool. A single-FILE search at least
  // prints a `binary file matches` notice; a PROJECT-WIDE search drops the file
  // SILENTLY — no notice, no match, indistinguishable from a genuine miss. That made
  // the single source of approval truth in this product invisible to every reader,
  // reviewer and agent that searches the codebase (a search for `require(` across
  // `src/**` returned 139 files and omitted this one, though it requires `crypto`).
  // The escape and the literal byte produce an IDENTICAL string, so the digest is
  // unchanged — pinned against a golden constant in
  // `tests/source-stays-searchable.test.js`, because a moved digest would silently
  // invalidate every existing approval record in the repository.
  const h = crypto.createHash('sha256');
  h.update(`${frontmatter.length}\x00`, 'utf8');
  h.update(frontmatter, 'utf8');
  h.update('\x00', 'utf8');
  h.update(kept.join('\n'), 'utf8');
  return { hash: h.digest('hex'), ok: true, reason: null, frontmatter };
}

/**
 * Diagnose WHY a specification-scoped comparison failed — as a PROOF, never a guess.
 * Runs ONLY after a `contentMatches` mismatch and only ever returns a reason + section
 * titles; it NEVER changes acceptance and NEVER writes anything. Pure, and never throws.
 *
 * THREE DISTINCT ANSWERS, because a diagnostic that lies is worse than none:
 *   - `spec-boundary-unlocatable` — the specification boundary cannot be established at
 *     all (no frontmatter, unterminated block, empty/non-string content). "I could not
 *     look." Never folded into a mismatch, never a pass. A permission decision that
 *     cannot look must deny — the caller keeps `accepted: false`.
 *   - `hash-mismatch-new-section` — removing the named appended sections restores the
 *     recorded digest BYTE-FOR-BYTE, which is a demonstration (not an inference) that
 *     those sections are the entire difference. "I looked, and here is the proof."
 *   - `hash-mismatch` — either there were no candidate sections to remove ("I looked and
 *     found none"), or removing them did NOT restore the digest ("I looked, the
 *     specification genuinely changed"). No speculation beyond that.
 *
 * WHICH SECTIONS ARE CANDIDATES — line 126 of the plan, not line 228. The candidate set
 * is the non-execution top-level (`##`) sections positioned AFTER the last execution
 * section, i.e. where an executor APPENDS its invented sections (a scope-stop record, a
 * final-state record). Excluding ALL non-execution top-level sections would over-exclude
 * legitimate specification sections (`## Implementation Details`) that the recorded
 * digest INCLUDED, so the proof could never restore it on a real plan. Positional
 * selection identifies the appended block without a second read or a per-line regex.
 * SOUNDNESS DOES NOT DEPEND ON THE HEURISTIC: an exact match against the recorded digest
 * is a byte-for-byte demonstration regardless of how the candidates were chosen, so a
 * poor choice only lowers diagnostic RECALL (falls back to plain `hash-mismatch`), never
 * fails closed the wrong way.
 *
 * AT MOST ONE EXTRA HASH PASS. Beyond establishing the boundary, exactly one recompute
 * (`computeSpecHashWith`) — over content already in memory, independent of the number of
 * sections. No I/O, no second read, no regular expression compiled per line.
 *
 * @param {string} content - the plan's current full file content
 * @param {string} expectedHash - the recorded specification digest to prove against
 * @returns {{reason: ('spec-boundary-unlocatable'|'hash-mismatch'|'hash-mismatch-new-section'), sections: string[]}}
 */
function diagnoseSpecMismatch(content, expectedHash) {
  const base = computeSpecHash(content);
  if (!base.ok) return { reason: 'spec-boundary-unlocatable', sections: [] };

  // Enumerate top-level (##) headings in order, flagging the execution ones.
  const lines = content.split(/\r?\n/);
  const tops = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (headingLevel(trimmed) !== 2) continue;
    const title = trimmed.slice(2).trim();
    tops.push({ title, norm: title.toLowerCase(), isExec: isExecutionHeading(title.toLowerCase()) });
  }
  let lastExec = -1;
  for (let k = 0; k < tops.length; k++) if (tops[k].isExec) lastExec = k;

  const candidateNorms = new Set();
  const candidates = [];
  for (let k = lastExec + 1; k < tops.length; k++) {
    const h = tops[k];
    if (h.isExec || candidateNorms.has(h.norm)) continue;
    candidateNorms.add(h.norm);
    candidates.push(h.title);
  }
  // "I looked and found no candidate" — distinct from "I could not look".
  if (candidates.length === 0) return { reason: 'hash-mismatch', sections: [] };

  const retry = computeSpecHashWith(content, candidateNorms);
  if (retry.ok && retry.hash === expectedHash) {
    return {
      reason: 'hash-mismatch-new-section',
      sections: candidates.slice(0, 5).map((t) => (t.length > 80 ? t.slice(0, 80) : t)),
    };
  }
  // The specification genuinely changed; do not speculate further.
  return { reason: 'hash-mismatch', sections: [] };
}

/**
 * THE SINGLE ENCODING of "does this content match this entry", branching on the
 * entry's recorded `hash_scope` and failing CLOSED.
 *
 * There used to be TWO encodings — `verify` here and an inline comparison in
 * `human-gate-check.classifyResidency` — which could diverge, and a divergence in
 * an approval predicate is a forgery surface. Both now call this.
 *
 * VERSIONED SEMANTICS, NO MIGRATION. An entry with no `hash_scope` means `'file'`:
 * legacy whole-file semantics, verified exactly as it was written. Existing entries
 * are NEVER re-hashed — re-hashing against current content would launder every
 * post-approval amendment into an approved state. Entries age into the
 * specification scope only as plans are genuinely re-approved. This mirrors the
 * task registry's `generation` field (absent ⇒ 0), an established pattern here.
 *
 * @param {object|null} entry - a parsed ledger entry
 * @param {string} content - the plan's current full file content
 * @returns {{match: boolean, scope: ('specification'|'file'), reason: (string|null), sections?: string[]}}
 *   `scope` is the semantics the comparison was made UNDER, so a caller can report
 *   a legacy mismatch distinctly from a real specification change. On a specification
 *   mismatch, `reason` carries the proof-carrying diagnosis
 *   ({@link diagnoseSpecMismatch}: `hash-mismatch` | `hash-mismatch-new-section` |
 *   `spec-boundary-unlocatable`) and `sections` names the offending headings. `match`
 *   is computed EXACTLY as before and is never touched by the diagnosis — all reasons
 *   still reject.
 */
function contentMatches(entry, content) {
  const scope = entry && entry.hash_scope === 'specification' ? 'specification' : 'file';
  if (scope === 'specification') {
    const res = computeSpecHash(content);
    // The MATCH decision is unchanged: a locatable boundary whose digest equals the
    // recorded one, and nothing else. An unlocatable boundary is NOT a match — fail
    // closed, never trust a plan INTO an approval.
    if (res.ok && entry.content_sha256 === res.hash) {
      return { match: true, scope, reason: null, sections: [] };
    }
    // Mismatch only: attach the proof-carrying diagnosis so the message can be legible.
    // This runs strictly AFTER match === false and only ever produces strings.
    const diag = diagnoseSpecMismatch(content, entry && entry.content_sha256);
    return { match: false, scope, reason: diag.reason, sections: diag.sections };
  }
  return { match: entry.content_sha256 === computeContentHash(content), scope, reason: null };
}

/**
 * Resolve the `content_sha256` + `hash_scope` pair a write path should record.
 *
 * A caller that supplies `content` gets SPECIFICATION semantics, hashed here so the
 * scope stamp and the digest can never disagree — the failure mode that would arise
 * from stamping a scope over a hash computed elsewhere. A caller that supplies only
 * a precomputed `content_sha256` keeps whole-file semantics and is recorded HONESTLY
 * as `'file'`, because that is what its digest actually covers.
 *
 * A caller supplying `content` whose boundary cannot be established gets a THROW,
 * not a fallback: minting an entry whose binding could not be established is exactly
 * the unearned approval this module exists to prevent.
 *
 * @param {{content?: string, content_sha256?: string}} src
 * @returns {{content_sha256: (string|undefined), hash_scope: ('specification'|'file')}}
 * @throws {Error} when `content` is supplied but its specification boundary is
 *   unlocatable
 */
function resolveHash(src) {
  if (typeof src.content === 'string' && src.content !== '') {
    const res = computeSpecHash(src.content);
    if (!res.ok) {
      throw new Error(
        `approval-ledger: refusing to write an entry — the plan's specification boundary ` +
        `could not be established (${res.reason}). An unlocatable binding is not an approval.`,
      );
    }
    return { content_sha256: res.hash, hash_scope: 'specification' };
  }
  return { content_sha256: src.content_sha256, hash_scope: 'file' };
}

/**
 * The union of all fields either entry kind may carry. Every field is optional
 * at the type level because the required-field enforcement is a RUNTIME guard in
 * {@link persistEntry} (which validates against `REQUIRED_FIELDS` before any
 * write) — the type only describes the accepted shape, not the contract.
 *
 * @typedef {object} LedgerEntryInput
 * @property {string} [content] - the plan's full content. When supplied, the ledger
 *   hashes the SPECIFICATION itself and records `hash_scope: 'specification'`; the
 *   digest and the scope stamp are therefore derived together and cannot disagree.
 *   Preferred over a precomputed `content_sha256` on every gate edge a plan is later
 *   BUILT in (`implementation`, `todo`) — see {@link computeSpecHash}.
 * @property {string} [content_sha256] - a precomputed WHOLE-FILE digest. Recorded
 *   honestly as `hash_scope: 'file'`; correct for `done/`, where no legitimate
 *   editor exists and the stronger binding is the right one.
 * @property {('specification'|'file')} [hash_scope]
 * @property {string} [stage_from]
 * @property {string} [stage_to]
 * @property {string} [approved_at]
 * @property {string} [approved_by]
 * @property {string} [evidence]
 * @property {boolean} [backfilled]
 * @property {string} [backfill_reason]
 * @property {string} [plan_basename]
 */

/**
 * Record an approval entry for a plan. Creates the ledger directory if needed
 * and writes `{ content_sha256, stage_from, stage_to, approved_at, approved_by }`
 * as pretty-printed JSON to {@link ledgerPath}. `approved_at` defaults to the
 * current ISO timestamp when the caller omits it.
 *
 * @param {string} slug - the plan slug
 * @param {LedgerEntryInput} entry - the entry fields (required fields
 *   `content_sha256`, `stage_from`, `stage_to` are enforced at runtime); may
 *   also carry the optional R2-F provenance fields `backfilled`,
 *   `backfill_reason`, and `plan_basename`
 * @param {string} projectPath - the project root
 * @returns {object} the entry object as written
 * @throws {Error} `Invalid slug` for an unsafe slug; a descriptive error naming
 *   the first missing required field (`content_sha256`, `stage_from`, or
 *   `stage_to`). The guards run BEFORE any filesystem write, so a rejected
 *   write never leaves a partial file behind.
 */
function writeEntry(slug, entry, projectPath) {
  const src = /** @type {LedgerEntryInput} */ (entry || {});
  const { content_sha256, hash_scope } = resolveHash(src);
  const record = {
    content_sha256,
    hash_scope,
    stage_from: src.stage_from,
    stage_to: src.stage_to,
    approved_at: src.approved_at || new Date().toISOString(),
    approved_by: src.approved_by !== undefined ? src.approved_by : 'human',
  };
  // Optional legacy-migration provenance (R2-F): a backfilled human-kind entry.
  if (src.backfilled !== undefined) record.backfilled = src.backfilled;
  if (src.backfill_reason !== undefined) record.backfill_reason = src.backfill_reason;
  // Optional original-cased basename, used for the case-collision guard.
  if (src.plan_basename !== undefined) record.plan_basename = src.plan_basename;
  return persistEntry(slug, record, projectPath);
}

/**
 * Record a PIPELINE-kind entry: the automated pipeline (not a human) advanced the
 * plan. Requires the human-kind required fields PLUS a non-empty `evidence`
 * string (e.g. `'stale-reconciliation'` or a verify-artifact path). Stamps
 * `advanced_by: 'pipeline'` and does NOT set `approved_by: human` — so
 * `entryKind` classifies it as `pipeline` and `human-gate-check.js` accepts it
 * only at `done/`, never at the human-only `todo/` gate.
 *
 * @param {string} slug - the plan slug
 * @param {LedgerEntryInput} entry - the entry fields; required fields
 *   `content_sha256`, `stage_from`, `stage_to`, and a non-empty `evidence`
 *   string are enforced at runtime
 * @param {string} projectPath - the project root
 * @returns {object} the entry object as written
 * @throws {Error} `Invalid slug`; a missing-required-field error; or a
 *   `pipeline entry requires non-empty "evidence"` error — all BEFORE any write.
 */
function writePipelineEntry(slug, entry, projectPath) {
  const src = /** @type {LedgerEntryInput} */ (entry || {});
  if (typeof src.evidence !== 'string' || src.evidence.trim() === '') {
    throw new Error('approval-ledger: pipeline entry requires non-empty "evidence"');
  }
  const { content_sha256, hash_scope } = resolveHash(src);
  const record = {
    content_sha256,
    hash_scope,
    stage_from: src.stage_from,
    stage_to: src.stage_to,
    approved_at: src.approved_at || new Date().toISOString(),
    advanced_by: 'pipeline',
    evidence: src.evidence,
  };
  // R3-A: the case-collision guard is available on the pipeline path too — a vision
  // archive and a code plan whose basenames differ only by case must never silently
  // overwrite each other's provenance.
  if (src.plan_basename !== undefined) record.plan_basename = src.plan_basename;
  return persistEntry(slug, record, projectPath);
}

/**
 * Record a SUFFICIENCY-kind entry (X6): the plan carried ENOUGH INFORMATION to be
 * built WITHOUT GUESSING — its decision questions were computed against the current
 * plan text and every fork among them was answered — so the pipeline advanced it
 * ITSELF, and the human approved nothing. This mirrors {@link writePipelineEntry}
 * exactly, with ONE extra guard that is the whole point of the kind:
 *
 *   - `evidence` is MANDATORY and non-empty (names the plan ref, the count of
 *     answered questions, and their ids — so an auditor reconstructs the decision
 *     from the entry alone). A write with no evidence is refused LOUDLY.
 *   - `approved_by` is FORBIDDEN — not omitted, actively REFUSED. A sufficiency
 *     entry wearing the human's marker is the exact forgery shape X5 closed (a
 *     machine cross claiming a human clicked). Silent sanitisation would reopen the
 *     hole, so the KEY'S PRESENCE (mirroring `entryKind`'s presence-guard) throws.
 *
 * Stamps `advanced_by: 'sufficiency'` and NO `approved_by`, so `entryKind`
 * classifies it `'sufficiency'` and `human-gate-check.js` accepts it ONLY at the
 * PRE-BUILD gate destinations (implementation, todo) with evidence — never at
 * `done/`, where the question is "was this built correctly?", not "is there enough
 * information to build?".
 *
 * @param {string} slug - the plan slug
 * @param {LedgerEntryInput} entry - the entry fields; required fields
 *   `content_sha256`, `stage_from`, `stage_to`, and a non-empty `evidence` string
 *   are enforced at runtime, and a present `approved_by` KEY is refused
 * @param {string} projectPath - the project root
 * @returns {object} the entry object as written
 * @throws {Error} `Invalid slug`; a missing-required-field error; a
 *   `sufficiency entry requires non-empty "evidence"` error; or a
 *   `sufficiency entry must NOT carry "approved_by"` error — all BEFORE any write.
 */
function writeSufficiencyEntry(slug, entry, projectPath) {
  const src = /** @type {LedgerEntryInput} */ (entry || {});
  // THE FORGERY GUARD (Decision 2). Checked FIRST: a machine cross must never wear
  // the human's marker. The KEY'S PRESENCE decides — not its value — so even
  // `approved_by: undefined` is refused. This is REFUSAL, never silent stripping.
  if (Object.prototype.hasOwnProperty.call(src, 'approved_by')) {
    throw new Error(
      'approval-ledger: a sufficiency entry must NOT carry "approved_by" ' +
      '(a machine cross wearing the human marker is the exact forgery shape)',
    );
  }
  if (typeof src.evidence !== 'string' || src.evidence.trim() === '') {
    throw new Error('approval-ledger: sufficiency entry requires non-empty "evidence"');
  }
  const { content_sha256, hash_scope } = resolveHash(src);
  const record = {
    content_sha256,
    hash_scope,
    stage_from: src.stage_from,
    stage_to: src.stage_to,
    approved_at: src.approved_at || new Date().toISOString(),
    advanced_by: 'sufficiency',
    evidence: src.evidence,
  };
  // The case-collision guard is available on this path too (same rationale as the
  // pipeline path): two plans differing only by case must never silently overwrite
  // each other's provenance.
  if (src.plan_basename !== undefined) record.plan_basename = src.plan_basename;
  return persistEntry(slug, record, projectPath);
}

/**
 * Ledger a DECOMPOSED VISION archived to `plans/done/` as a PIPELINE-kind entry
 * (R3-A item 3). A vision crossed Gate 0 in `vision/`, never the review→done code
 * gate, and carries no approval marker — which is why `human-gate-check.js` used to
 * EXEMPT `type: vision` plans from the residency sweep. That exemption was a hole:
 * `plans/**.md` is Edit-whitelisted, so any agent could squat `done/` with a single
 * `type: vision` frontmatter line and no provenance at all. The exemption is gone;
 * `done/` residency is now UNIFORMLY ledger-driven, and a vision archive earns its
 * residency with this entry — `advanced_by: 'pipeline'`, `evidence:
 * 'vision-decomposed'`, `stage_from: 'vision'`, `stage_to: 'done'` — hashing the
 * archive's CURRENT on-disk bytes (so a later edit to the archived vision invalidates
 * it exactly as it does for any other done/ resident).
 *
 * Callers: `src/scripts/ledger-backfill.js --vision` (the migration for archives that
 * predate this slice, and the sanctioned writer the menu points at). The live archive
 * path, `vision-decomposer.completeVision`, must call this immediately BEFORE its
 * `movePlan(visionPath, 'done')` — see the R3-A report; that file was out of this
 * slice's file scope.
 *
 * @param {string} projectPath - the project root
 * @param {string} planPath - path to the vision file (in `plans/done/`, or the source
 *   path whose CONTENT is about to be moved there byte-identically)
 * @returns {object} the entry object as written
 * @throws {Error} when the plan cannot be read, the slug is un-keyable, or the
 *   canonical key collides with a different original basename (loud, never silent).
 */
function writeVisionArchiveEntry(projectPath, planPath) {
  const content = safeFs.readFileSync(planPath, 'utf8');
  const slug = slugFromPlanPath(planPath);
  return writePipelineEntry(slug, {
    content_sha256: computeContentHash(content),
    stage_from: 'vision',
    stage_to: 'done',
    evidence: 'vision-decomposed',
    plan_basename: path.basename(planPath).replace(/\.md$/i, ''),
  }, projectPath);
}

/**
 * Shared write path for both entry kinds: validates the slug (traversal guard),
 * validates the REQUIRED_FIELDS, runs the case-collision guard, then commits the
 * record ATOMICALLY (temp sibling + rename, as in task-registry.save) so a crash
 * mid-write can never truncate a committed approval. The guards all run BEFORE any
 * filesystem write, so a rejected write never leaves a partial file, and a failed
 * commit unlinks its temp and rethrows — the prior entry survives byte-identical.
 *
 * Case-collision guard: if an entry already exists at the canonical key AND both
 * the existing and incoming records carry a `plan_basename`, a DIFFERENCE means
 * two distinct original files (differing only by case) map to the same key — a
 * silent overwrite would erase one plan's provenance, so this throws loudly.
 * Re-writing the SAME original basename (idempotent re-approval) is allowed.
 *
 * @param {string} slug
 * @param {object} record - a fully-built record (required fields already set)
 * @param {string} projectPath
 * @returns {object} the record as written
 */
function persistEntry(slug, record, projectPath) {
  const target = ledgerPath(slug, projectPath); // validates + canonicalizes the slug
  for (const field of REQUIRED_FIELDS) {
    if (record[field] === undefined || record[field] === null || record[field] === '') {
      throw new Error(`approval-ledger: missing required field "${field}"`);
    }
  }
  if (record.plan_basename !== undefined) {
    const existing = readEntry(slug, projectPath);
    if (existing && existing.plan_basename !== undefined &&
        existing.plan_basename !== record.plan_basename) {
      throw new Error(
        `approval-ledger: slug collision on canonical key "${slug.toLowerCase()}" — ` +
        `existing plan_basename "${existing.plan_basename}" vs incoming "${record.plan_basename}"; ` +
        `two plans differ only by case. Refusing to overwrite provenance.`,
      );
    }
  }
  safeFs.mkdirSync(ledgerDir(projectPath), { recursive: true });
  // ATOMIC COMMIT (temp sibling + rename), mirroring task-registry.save. The
  // ledger is the single source of approval truth: a bare in-place writeFileSync
  // truncates a COMMITTED entry if a crash lands between open and full write, so
  // every re-write (re-approval, backfill, vision archive, idempotent re-write)
  // would be destructive-in-place. Writing a temp then renaming makes the commit
  // atomic — a reader sees either the whole old file or the whole new file, never
  // a truncation. On any failure the temp is unlinked and the error rethrown, so
  // a failed commit leaves the pre-existing entry byte-identical and no litter.
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    safeFs.writeFileSync(tmp, JSON.stringify(record, null, 2));
    safeFs.renameSync(tmp, target);
  } catch (err) {
    try { safeFs.unlinkSync(tmp); } catch { /* temp may not exist */ }
    throw err;
  }
  return record;
}

/**
 * Classify a ledger entry's provenance kind — HONESTLY (R3-A item 5, made real by X5).
 *
 * PROVENANCE IS A POSITIVE CLAIM, NEVER A FALLTHROUGH (X5). This function used to
 * `return 'human'` for anything it did not recognise — so `'human'`, the most
 * privileged kind, was the ABSENCE of evidence rather than an assertion of it. An
 * entry stamped `advanced_by: 'sufficiency-gate'` was reported as the human, skipped
 * `human-gate-check.js`'s pipeline-only guard, and was ACCEPTED at every gate
 * including `todo/`, with no evidence. That default is the mechanism behind the 26
 * forged approvals whose own backfill reason reads: "Claude wrote approved_by:human
 * into plan frontmatter directly instead of crossing Gate 2 via approvePlan — a
 * forged marker." An unrecognised provenance is now `'unknown'`, and the gate hook
 * REJECTS `'unknown'` on every path: the classifier fails CLOSED.
 *
 * ORDER IS LOAD-BEARING. `advanced_by` is tested BEFORE `approved_by`, because an
 * entry carrying BOTH `advanced_by: 'sufficiency-gate'` AND `approved_by: 'human'`
 * is precisely the forgery shape — a machine cross wearing the human's marker.
 * Testing `approved_by` first would launder it back into `'human'` and make this
 * whole change a no-op.
 *
 * An unrecognised `advanced_by` returns `'unknown'`, NOT its own value: returning it
 * verbatim would let a new provenance be invented at the CALL SITE, which is the same
 * defect one level up. A new kind must be added HERE, deliberately, with its own guard
 * in `human-gate-check.js` — that is how the sufficiency gate will be added.
 *
 * This classification reclassifies NOTHING that exists: measured across all 263 real
 * entries in this repo, 210 carry `backfilled: true` and the other 53 all carry
 * `approved_by: 'human'` explicitly. Zero carry nothing. There is no migration; the
 * classifier simply never looked at the evidence already on disk.
 *
 * @param {object|null} entry - a parsed ledger entry
 * @returns {('human'|'backfilled'|'pipeline'|'sufficiency'|'unknown'|null)}
 *   `pipeline` when `advanced_by === 'pipeline'`; `sufficiency` when
 *   `advanced_by === 'sufficiency'` (X6); `unknown` for any OTHER non-empty `advanced_by`;
 *   `backfilled` when the entry carries `backfilled: true`; `human` ONLY when the
 *   entry positively carries `approved_by === 'human'`; `unknown` for any other real
 *   entry (fail closed); `null` for no entry.
 */
function entryKind(entry) {
  if (!entry || typeof entry !== 'object') return null;
  // Provenance is a POSITIVE claim, never a fallthrough. An unrecognised
  // `advanced_by` is NOT the human — that default forged 26 approvals.
  //
  // The key's PRESENCE decides, not its type. An entry carrying `advanced_by` at
  // all is claiming a MACHINE crossed this gate; only the exact strings 'pipeline'
  // and 'sufficiency' (X6) name a provenance this system recognises, each added
  // HERE deliberately with its own guard in `human-gate-check.js`. Everything else —
  // 'sufficiency-gate', 'Sufficiency', ' sufficiency ', '', null, 123, an object —
  // is `unknown` and is rejected, EVEN WHEN the entry
  // also carries `approved_by: 'human'`. That pairing is not an edge case: a machine
  // cross wearing the human's marker is the exact shape of the 26 forgeries removed
  // from this repo on 2026-07-17. Type-guarding here instead of presence-guarding
  // would let a malformed `advanced_by` fall through to the `approved_by` check and
  // be accepted as a clicked approval.
  if (Object.prototype.hasOwnProperty.call(entry, 'advanced_by')) {
    if (entry.advanced_by === 'pipeline') return 'pipeline';
    if (entry.advanced_by === 'sufficiency') return 'sufficiency';
    return 'unknown';
  }
  if (entry.backfilled === true) return 'backfilled';
  if (entry.approved_by === 'human') return 'human';
  return 'unknown';
}

/**
 * Read a plan's ledger entry WITH a discriminated status, so a caller (the
 * residency sweep) can tell an un-keyable slug and a corrupt file apart from a
 * plain absence and flag each distinctly — instead of collapsing all three to
 * `null` the way `readEntry` does. NEVER throws.
 *
 * @param {string} slug - the plan slug
 * @param {string} projectPath - the project root
 * @returns {{status: ('unkeyable'|'absent'|'corrupt'|'ok'), entry: (object|null)}}
 */
function readEntryResult(slug, projectPath) {
  let target;
  try {
    target = ledgerPath(slug, projectPath);
  } catch {
    return { status: 'unkeyable', entry: null };
  }
  if (!safeFs.existsSync(target)) return { status: 'absent', entry: null };
  let raw;
  try {
    raw = safeFs.readFileSync(target, 'utf8');
  } catch {
    // The file exists (existsSync passed) but cannot be read: treat as corrupt,
    // never as absent — flagging is the fail-SAFE direction.
    return { status: 'corrupt', entry: null };
  }
  try {
    return { status: 'ok', entry: JSON.parse(raw) };
  } catch {
    return { status: 'corrupt', entry: null };
  }
}

/**
 * Ledger an EXISTING plan file (R2-F backfill helper). Hashes the plan's CURRENT
 * on-disk content and writes a human-kind entry stamped `backfilled: true` +
 * `backfill_reason`, keyed to the canonical lowercase slug and carrying the
 * original-cased basename for the collision guard. This is the ONLY sanctioned
 * way to ledger a plan that crossed a human gate before the ledger existed.
 *
 * R3-A CORRECTION: it is driven by the checked-in, argv-driven
 * `src/scripts/ledger-backfill.js` — NOT by `node -e`, which the Bash hook now
 * DENIES (an inline eval referencing this module is exactly the forgery the deny
 * closes; the old "integrator drives it via node -e" instruction was the hole).
 * The entry it writes classifies as `'backfilled'`, never `'human'`.
 *
 * @param {string} projectPath - the project root
 * @param {string} planPath - absolute path to the existing plan file
 * @param {{stage_to?: string, reason?: string}} [opts] - destination stage the
 *   plan resides in, and the human-readable backfill reason (`stage_to` is
 *   required and enforced at runtime)
 * @returns {object} the entry object as written
 * @throws {Error} if the plan file cannot be read, the slug is un-keyable, or the
 *   canonical key collides with a different original basename (loud, never silent).
 */
function backfillEntry(projectPath, planPath, opts = {}) {
  const { stage_to, reason } = opts;
  if (typeof stage_to !== 'string' || stage_to === '') {
    throw new Error('approval-ledger: backfillEntry requires opts.stage_to');
  }
  const content = safeFs.readFileSync(planPath, 'utf8');
  const slug = slugFromPlanPath(planPath);
  const originalBasename = path.basename(planPath).replace(/\.md$/i, '');
  return writeEntry(slug, {
    content_sha256: computeContentHash(content),
    // The gate SOURCE for this destination, from the ONE encoding (R6-B). A stage
    // that is not a gate destination has no source → fall back to the 'backfill'
    // marker so the required field is never left empty.
    stage_from: sourceOf(stage_to) || 'backfill',
    stage_to,
    approved_by: 'human',
    backfilled: true,
    backfill_reason: reason !== undefined ? reason : '',
    plan_basename: originalBasename,
  }, projectPath);
}

/**
 * Read a plan's ledger entry. Fail-soft: returns `null` when the entry file is
 * absent or its contents are unparseable — never throws on a corrupt ledger
 * file and never leaks a stack trace to the caller.
 *
 * @param {string} slug - the plan slug
 * @param {string} projectPath - the project root
 * @returns {object|null} the parsed entry, or `null` if absent/corrupt
 * @throws {Error} `Invalid slug` for an unsafe slug (the traversal guard still
 *   applies to reads)
 */
function readEntry(slug, projectPath) {
  const target = ledgerPath(slug, projectPath);
  if (!safeFs.existsSync(target)) return null;
  try {
    return JSON.parse(safeFs.readFileSync(target, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * The single predicate encoding C4. Returns `true` iff an entry exists AND its
 * `stage_to` equals `currentStage` AND its content matches under the semantics the
 * entry was WRITTEN with ({@link contentMatches}). Any of the three legs failing —
 * no entry, wrong edge, or a post-approval change to the hashed region — yields
 * `false`, as does a specification boundary that cannot be established at all.
 *
 * @param {string} slug - the plan slug
 * @param {string} content - the plan's current full file content
 * @param {string} currentStage - the stage the plan currently resides in
 * @param {string} projectPath - the project root
 * @returns {boolean} whether the plan is genuinely, currently ledger-approved
 */
function verify(slug, content, currentStage, projectPath) {
  const entry = readEntry(slug, projectPath);
  if (!entry) return false;
  if (entry.stage_to !== currentStage) return false;
  return contentMatches(entry, content).match;
}

/**
 * Best-effort removal of a plan's ledger entry. Used by s5's atomic-stamp
 * rollback. Never throws when the entry is already absent.
 *
 * @param {string} slug - the plan slug
 * @param {string} projectPath - the project root
 * @throws {Error} `Invalid slug` for an unsafe slug
 */
function removeEntry(slug, projectPath) {
  const target = ledgerPath(slug, projectPath);
  if (safeFs.existsSync(target)) {
    try {
      safeFs.unlinkSync(target);
    } catch {
      // Best-effort: a concurrent removal or a transient error must not throw
      // out of a rollback path. The absence of the file is the desired state.
    }
  }
}

module.exports = {
  ledgerDir,
  ledgerPath,
  slugFromPlanPath,
  computeContentHash,
  computeSpecHash,
  contentMatches,
  diagnoseSpecMismatch,
  EXECUTION_SECTIONS,
  EXECUTION_SECTION_PRODUCERS,
  writeEntry,
  writePipelineEntry,
  writeSufficiencyEntry,
  writeVisionArchiveEntry,
  entryKind,
  readEntry,
  readEntryResult,
  backfillEntry,
  verify,
  removeEntry,
};
