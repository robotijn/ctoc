---
title: "W02-s1 — Content-hashed approval ledger module"
type: feature
parent_plan: "ctoc-audit-w02-gate-integrity"
depends_on: none
files:
  - src/lib/approval-ledger.js
  - tests/ctoc-audit-w02-s1-approval-ledger.test.js
priority: HIGH
created: "2026-07-13T00:00:00Z"
---

# W02-s1 — Content-hashed approval ledger module

**Parent:** `ctoc-audit-w02-gate-integrity` (finding C4). **Slice scope:** the NEW
approval-provenance module that every other W02 slice reads/writes. Foundation of the
dependency graph (`s3` and `s5` depend on it). Closes the "approval is self-asserted
text in an agent-writable file" forgery at its root: provenance now lives in
`.ctoc/approvals/<slug>.json`, keyed to the plan's content hash and the exact gate
edge, written only by the trusted `approvePlan()` path (s5), never by a tool call.

## Implementation Details

### File Specification — `src/lib/approval-ledger.js` (CREATE)

New lib module. Standard CTOC module shape (imports → constants → JSDoc'd functions →
`module.exports`). Uses `crypto` (Node builtin) for SHA-256 and `./safe-fs` for all
filesystem I/O (matches every sibling in `src/lib/`). No dependency on any other W02
file — this is the leaf both `human-gate-check.js` (s3) and `actions.js` (s5) build on.

Exports:

- `ledgerDir(projectPath)` → absolute path to `.ctoc/approvals/` under the project
  root. `path.join(root, '.ctoc', 'approvals')`.
- `ledgerPath(slug, projectPath)` → `path.join(ledgerDir(root), \`${slug}.json\`)`.
  - Validate `slug` against `/^[a-z0-9][a-z0-9-]*$/` (mirror `createCanvas`'s slug
    guard in `actions.js:768`); throw `Error('Invalid slug')` otherwise so a crafted
    slug (`../../etc`) can never escape `.ctoc/approvals/`.
- `slugFromPlanPath(planPath)` → `path.basename(planPath).replace(/\.md$/, '')`.
  Matches `readPlans`' `name` derivation (`state.js:37`) so a slug is stable across
  stages (the filename never changes on a move — `movePlan` keeps the basename).
- `computeContentHash(content)` → `crypto.createHash('sha256').update(content,
  'utf8').digest('hex')`. Hash of the FULL file content (frontmatter + body) exactly
  as written to disk, so ANY later edit (including a re-stamped marker) changes it.
- `writeEntry(slug, entry, projectPath)` → creates `ledgerDir` (`recursive`), writes
  `JSON.stringify({ content_sha256, stage_from, stage_to, approved_at, approved_by },
  null, 2)` to `ledgerPath(slug)`. Returns the written entry object. `approved_at`
  defaults to `new Date().toISOString()` when absent. Throws on a missing required
  field (`content_sha256`, `stage_from`, `stage_to`).
- `readEntry(slug, projectPath)` → parsed JSON object, or `null` if the file is
  absent or unparseable (fail-soft read; never throws on a corrupt ledger file).
- `verify(slug, content, currentStage, projectPath)` → `boolean`. Returns `true` iff:
  an entry exists AND `entry.stage_to === currentStage` AND `entry.content_sha256 ===
  computeContentHash(content)`. This single predicate encodes C4: no entry → false
  (self-authored marker not accepted); stage mismatch → false (an entry recorded for
  `functional→implementation` cannot validate a `review→done` residency); hash
  mismatch → false (post-approval edit invalidates approval).
- `removeEntry(slug, projectPath)` → best-effort `unlinkSync` of `ledgerPath(slug)`
  (no throw if absent). Used by s5's atomic-stamp rollback.

### Test Plan — `tests/ctoc-audit-w02-s1-approval-ledger.test.js` (CREATE)

`node:test` (`describe`/`it`) + `node:assert/strict`. Sandbox each case in an
`os.tmpdir()` project dir (mirror `stale-cleanup-human-gate.test.js`); tear down in
`afterEach`. Assert BEHAVIOR — what `verify` accepts/rejects — never a bare return
shape.

1. **write→read round-trips the entry** — `writeEntry('p', {content_sha256:'abc',
   stage_from:'review', stage_to:'done'}, root)` then `readEntry('p', root)` returns
   an object with those three fields + an `approved_at`.
2. **verify accepts a matching entry** — write an entry whose `content_sha256 =
   computeContentHash(content)` and `stage_to='done'`; `verify('p', content, 'done',
   root)` is `true`.
3. **verify rejects a missing entry** — no `writeEntry`; `verify('p', content,
   'done', root)` is `false` (the self-authored-marker-with-no-ledger case).
4. **verify rejects a hash mismatch** — write an entry for `content`, then `verify('p',
   content + '\nedited', 'done', root)` is `false` (post-approval edit).
5. **verify rejects a stage_to mismatch** — entry `stage_to='implementation'`;
   `verify('p', content, 'done', root)` is `false` (no cross-edge replay).
6. **ledgerPath rejects a traversal slug** — `ledgerPath('../../etc/passwd', root)`
   throws; a valid slug resolves strictly under `.ctoc/approvals/`.
7. **readEntry fail-soft on a corrupt file** — write `"{ not json"` to the ledger
   path; `readEntry` returns `null`, does not throw.

## Execution Plan

### Step 8: TEST (TDD Red)
- [ ] Write `tests/ctoc-audit-w02-s1-approval-ledger.test.js` covering cases 1–7
      above. All BEHAVIOR-first: each asserts what `verify` accepts or rejects, or a
      thrown guard — never "returns an object". Cases 3, 4, 5 (no-entry, edited,
      cross-edge) are the C4 forgery/replay guarantees and MUST fail before the module
      exists.

### Step 9: PREPARE
- [ ] Confirm `crypto` (Node builtin) and `./safe-fs` are the only new dependencies;
      no package install. Confirm no `src/lib/approval-ledger.js` exists yet.

### Step 10: IMPLEMENT
- [ ] Create `src/lib/approval-ledger.js` exporting `ledgerDir`, `ledgerPath`,
      `slugFromPlanPath`, `computeContentHash`, `writeEntry`, `readEntry`, `verify`,
      `removeEntry` per the File Specification.
- [ ] `ledgerPath` validates the slug (`/^[a-z0-9][a-z0-9-]*$/`) before joining.
- [ ] `verify` enforces all three conditions (entry present, `stage_to` match, hash
      match); `readEntry` is fail-soft (`null` on absent/corrupt).

### Step 11: REVIEW
- [ ] Confirm all filesystem I/O routes through `safe-fs`, all paths via `path.join`,
      and no function writes outside `.ctoc/approvals/`.

### Step 12: OPTIMIZE
- [ ] Single hash computation per `verify` call; no redundant reads (one `readEntry`).

### Step 13: SECURE
- [ ] Slug validation blocks path traversal into/out of `.ctoc/approvals/`.
- [ ] `writeEntry` only ever targets `ledgerPath(slug)`; no caller-supplied path.
- [ ] `readEntry` never leaks a stack trace on a corrupt file (returns `null`).

### Step 14: VERIFY
- [ ] `node --test tests/ctoc-audit-w02-s1-approval-ledger.test.js` → `# fail 0`.
- [ ] Full suite `node --test tests/*.test.js` stays green (new module, no callers
      yet — additive).

### Step 15: DOCUMENT
- [ ] Module-level JSDoc stating the ledger is the single source of approval truth,
      is agent-write-denied (enforced in s2), and is written only by `approvePlan`
      (s5). Per-export JSDoc with `@param`/`@returns`/`@throws`.

### Step 16: FINAL-REVIEW
- [ ] Verify against C4: `verify` returns `false` for (a) no entry, (b) hash mismatch,
      (c) `stage_to` mismatch — the three legs of the forgery/replay guarantee.
