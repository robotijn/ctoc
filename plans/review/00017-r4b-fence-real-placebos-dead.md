---
title: "R4-B — Every placebo switch deleted (fence design superseded by R4-C)"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  # RECONCILED 2026-07-27 to the REAL, PERSISTING change surface. This plan's
  # placebo-deletion half shipped and remains in the tree (each site still carries
  # its `R4-B:` attribution comment). Its fence half — reachability.js, the export
  # baseline, and the two fence test files — was SUPERSEDED by successor R4-C
  # (call-syntax crediting replaced this plan's fenced-code-block rule, which had
  # buried approveSubplans, the done-all gate) and is therefore no longer this
  # plan's surface. The coverage-floor DOC correction (CLAUDE.md +
  # operating-lessons template) is owned by a separate review-stage plan and reads
  # correctly on disk (floor 99); it is dropped here to avoid two plans editing the
  # same managed block with conflicting figures. See "Decisions Taken Under
  # Ambiguity" D1–D5 and the Step-16 reconciliation report below.
  - "src/lib/init-project.js"
  - "src/lib/sync.js"
  - "src/lib/settings.js"
  - "src/commands/push.md"
  # Collateral of the moveToReviewAfterPush / autoMoveToReview deletion: these test
  # files bound directly to the deleted symbol / removed setting and were updated
  # for a green suite.
  - "tests/ctoc-audit-w05-sync-validated.test.js"
  - "tests/cache-freshness.test.js"
  - "tests/environment-mode.test.js"
---

# R4-B — Every placebo switch deleted (fence design superseded by R4-C)

> **RECORD RECONCILED 2026-07-27.** This plan sat in review with a done-record that
> certified a dead-code-fence design and two baseline/floor numbers that the tree
> had already moved past. Three review findings (three critical, one important) were
> each verified directly against the shipped source and every one held. The record
> below now states what ACTUALLY shipped. No source code was changed in the
> reconciliation — re-introducing this plan's original fence design would re-plant
> the exact bug the successor slice removed, so the correct action was to make the
> frozen record true, not to touch the correct code. The full reconciliation and the
> real-gate result are in the Step-16 report at the bottom.

Three verified defects, all of the same family: something LOOKS like a control and
isn't. **The placebo half of this list (defect 3) shipped and is correct in the tree
today. The fence half (defects 1 and 2) shipped first as this plan's fenced-code-block
design, was found to bury `approveSubplans` — the Gate-3 done-all gate — and was
REPLACED by call-syntax crediting in successor R4-C, which is what runs now.**

1. **The export fence is disarmed by markdown prose.** `reachability.js`: an export
   was credited live if its bare identifier token appeared anywhere in `agents/**`,
   `skills/**`, `src/commands/*.md`, or a CI workflow. `completeExecution` — the
   export the fence exists to catch — was classified live purely because two markdown
   files spelled its name; any ordinary-word export (`analyze`, `load`, `verify`,
   `report`) was auto-whitened by prose. **Shipped resolution (R4-C, not this plan's
   original form):** a surface mention counts as a caller only when it is a CALL —
   `name(` or `require('./x').name` — never a bare prose token or a fenced-block
   membership. This plan's first attempt credited any identifier inside a fenced code
   block; that rule buried 23 genuinely-reachable exports that CTOC recipes invoke
   with inline code, `approveSubplans` among them, so it was reverted. Call syntax is
   the live rule.
2. **A comment can still resurrect a dead export.** `stripComments` had no
   regex-literal state: a regex containing a quote (`/['"]\/\//g`) flipped the lexer
   into string state it never left, so every comment after it survived stripping.
   **Shipped resolution:** `stripComments` now carries a real regex-literal state
   machine (`regexAllowed` tracks whether the previous significant token permits a
   regex); a proving fixture pins it. An export named only in a comment after a
   quote-containing regex is DEAD.
3. **Placebo switches — THIS PLAN'S PERSISTING CONTRIBUTION.**
   `init-project.js` wrote `push:\n  auto_push: true` into every fresh project's
   settings.yaml — a key NOTHING read (the canonical one is `git.autoPushEnabled` in
   settings.json), and `push.md` documented it as the way to turn machine-push off.
   Same family: `workflow.autoMoveToReview` (settings default TRUE, set by the
   staging profile) drove `sync.moveToReviewAfterPush`, which raw-renamed a plan into
   `review/` with NO verify evidence — the exact evidence-less review resident this
   whole wave exists to abolish, harmless only because it had zero callers: a visible
   toggle wired to a dead landmine. **Shipped resolution (this plan):** the `push:`
   block is deleted from `generateSettings`; `push.md` renders the REAL key
   `git.autoPushEnabled` (default false); `moveToReviewAfterPush` is deleted from
   `sync.js`; `autoMoveToReview` is deleted from the settings schema and the staging
   profile. Each site carries an `R4-B:` attribution comment in the tree today.

## Implementation Details

1. **Executable references only (fence) — SUPERSEDED BY R4-C.** This plan shipped a
   fenced-code-block rule. It buried `approveSubplans` and other inline-recipe
   exports, so R4-C replaced it with CALL-SYNTAX crediting: a surface mention is a
   caller only when the name is invoked (`name(`) or required
   (`require('./x').name`). That is the rule in `reachability.js` today
   (`surfaceCalledNames`). Do NOT re-introduce fenced-block membership — it is the
   bug, not the fix.
2. **A real lexer (fence) — SHIPPED AND STILL LIVE.** `stripComments` tracks
   regex-literal state via `regexAllowed`; the proving fixture (a module with
   `const re = /['"]\/\//g;` followed by a comment naming an export → that export is
   DEAD) is in the fence tests.
3. **Non-vacuity guards that bite — SHIPPED AND STILL LIVE.** `export-reachability`
   carries a planted-dead-export guard in a fixture project, a "a test is NEVER a
   caller" guard, and a `completeExecution`-must-be-live guard.
4. **Delete the push placebo — SHIPPED (this plan).** The `push:` block
   (`auto_push`, `allow_warnings`, both zero-reader) is gone from init's
   `generateSettings`; `push.md` renders `git.autoPushEnabled: false` (default) and
   states plainly that CTOC never pushes unless the human opts in.
5. **Delete the autoMoveToReview landmine — SHIPPED (this plan).**
   `moveToReviewAfterPush` is gone from `sync.js`; `workflow.autoMoveToReview` is
   gone from the settings schema and the staging profile's explicit set. A rename
   into `review/` exists in exactly ONE place — the completion path that mints
   evidence.
6. **The coverage-floor doc — OWNED BY A SIBLING REVIEW-STAGE PLAN.** The doc lie
   (CLAUDE.md said ≥ 80 while the baseline enforced 40) was corrected elsewhere; on
   disk CLAUDE.md now reads the shipped truth (floor **99**, measured 99.33% scoped
   to `src/**`; `npm test` is the gated entry point, `node --test` bypasses the
   coverage and zero-skipped gates). This plan does NOT edit CLAUDE.md or the
   operating-lessons template — two plans editing the same managed block with
   conflicting figures is exactly the desync to avoid. The floor is a
   human-scheduled ratchet; not raised here.

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| init settings placebo removed | `initProject` (exists) | /ctoc:start |
| push.md real key | shipped instruction surface `src/commands/push.md` | /ctoc:push |
| sync landmine removed | `moveToReviewAfterPush` deleted — the review rename lives only in the completion path | completion path |
| fence (call-syntax) | `tests/export-reachability.test.js` ratchet + `iron-loop-enforcer` checkDeadExportFence | suite + /ctoc:start |

### Test Plan
Fence (owned by R4-C now, verified live here): prose-only mention → DEAD;
comment-after-quote-regex mention → DEAD; a real `require('x').foo` / `foo(` call →
LIVE; `completeExecution` → LIVE via a real code edge; `approveSubplans` → LIVE (an
inline-recipe export the fenced-block rule wrongly buried). Baseline `maxDead`
only ever LOWERS (68 on disk).
Init: a fresh project's settings.yaml contains NO `push:` block and no `auto_push`
key.
Sync: `moveToReviewAfterPush` is gone; no path renames a plan into `review/` except
the completion path.

## Execution Plan (Steps 8-16)
### Step 8: TEST — [x] The fence guards (prose→dead, comment-after-quote-regex→dead,
- [x] TEST — TDD tests present; workflow Step-11 REVIEW (2026-07-29) confirmed real/adversarial, not vacuous.
call-edge→live, planted-dead-export non-vacuity, `completeExecution`/`approveSubplans`
live) exist in `tests/export-reachability.test.js` and `tests/reachability.test.js`.
The placebo-absence assertions exist in the init/settings/sync test files. All were
seen RED before their respective fixes.
### Step 9: PREPARE — [x] Read `reachability.js`, `init-project.js`, `sync.js`,
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
`settings.js`, `push.md` in full from disk before editing.
### Step 10: IMPLEMENT — [x] Placebo half (this plan, persisting):
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
- push placebo block deleted from init `generateSettings`; `push.md` renders
  `git.autoPushEnabled`;
- `moveToReviewAfterPush` deleted from `sync.js` (+ its export, + now-unused imports);
- `autoMoveToReview` removed from the settings schema + the staging profile;
- collateral test files (`ctoc-audit-w05-sync-validated`, `cache-freshness`,
  `environment-mode`) updated to the deleted symbol / removed setting.
Fence half: shipped first as a fenced-code-block rule; SUPERSEDED by R4-C's
call-syntax rule (see the reconciliation report — the fenced-block rule buried
`approveSubplans` and had to be reverted). The coverage-floor doc is owned by a
sibling plan and is not touched here.
### Step 11: REVIEW — [x] Re-ran the analyzer against the shipped tree: the
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3.
call-syntax fence keeps `completeExecution` and `approveSubplans` LIVE via real code
edges and reports a true zero-caller export as dead. `maxDead` on disk is 68 (ratchet
history 102 → 71 → 69 → 68, never through 126).
### Step 12: OPTIMIZE — [x] Analyzer stays O(source chars); no AST, no new dependency.
### Step 13: SECURE — [x] Source-scan assertions only; reads via safe file access; no
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
path traversal, no secrets, no unsafe writes.
### Step 14: VERIFY — [x] `npm test` (the GATED entry point) run against the current
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
tree after `npm install` in this worktree: `# fail 0`, `# skipped 0`, coverage 99.03%
(threshold 99). Lint and typecheck gates green. See the Step-16 report for the tail.
### Step 15: DOCUMENT — [x] `reachability.js` header states exactly what counts as a
caller (call syntax / require) and what does NOT (prose, comments, tests). `push.md`
documents `git.autoPushEnabled`. This record reconciled to the shipped tree.
### Step 16: FINAL-REVIEW — [x] Reconciliation report delivered below: each finding's
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.
disposition, the fence-design supersession, the true baseline/floor numbers, and the
real-gate result.

## Decisions Taken Under Ambiguity

**D1 — The record is reconciled to the shipped tree, not the code to the record.**
The three review findings each hold against source: `reachability.js` credits by call
syntax (`surfaceCalledNames`), not fenced blocks; the export baseline is `maxDead: 68`
not 126; the coverage floor is `minPct: 99` not 40. The code is CORRECT. The only
false artifact was this plan's frozen record. Re-introducing the fenced-block design
to match the old record would re-bury `approveSubplans` — the exact bug R4-C removed.
So the record was made true; the correct code was left untouched.

**D2 — The fence half is attributed to its successor.** This plan's fenced-code-block
rule shipped, buried inline-recipe exports (`approveSubplans` among 23), and was
replaced by R4-C's call-syntax rule. `reachability.js`, the export baseline, and the
two fence test files are therefore R4-C's surface, not this plan's, and are removed
from `files:`. This plan's persisting, uniquely-owned contribution is the placebo
deletions.

**D3 — The coverage-floor doc is left to the sibling that owns it.** Finding 3 records
that a separate review-stage plan owns the coverage-floor doc correction, and CLAUDE.md
on disk already reads the shipped truth (floor 99). Editing it here would put two plans'
conflicting figures into the same managed `CTOC:LESSONS` block and risk a hash desync.
CLAUDE.md and the operating-lessons template are dropped from `files:`; item 6 is
marked owned-elsewhere.

**D4 — `files:` reconciled to the real, persisting surface.** Kept: the four
placebo-deletion sources/surfaces (`init-project.js`, `sync.js`, `settings.js`,
`push.md`) and the three collateral test files the deletion required. Removed:
`reachability.js`, `.ctoc/export-reachability-baseline.json`,
`tests/reachability.test.js`, `tests/export-reachability.test.js` (R4-C's surface),
`init-project.test.js`/`sync.test.js`/`settings*.test.js` (folded into the specific
files actually asserting placebo-absence), and `CLAUDE.md` +
`.ctoc/templates/operating-lessons.md` (sibling-owned coverage-floor doc).

**D5 — VERIFY re-run with the REAL gate.** The original record cited `node --test`
(345 pass), which by this plan's own item 6 bypasses the coverage floor and the
zero-skipped gate. `npm test` (`src/scripts/test-gate.js`) was run against the current
tree; it enforces both and passed (fail 0, skipped 0, coverage 99.03% ≥ 99).

## Step-16 Reconciliation Report (2026-07-27)

**Context.** This plan sat in `review/` with a done-record certifying a fence design
and two ratchet numbers that the tree had already superseded. Task: verify each review
finding against source, apply the highest-quality fix, and re-run the real gate. Every
finding was verified directly against the shipped files; none was refuted-as-stale.

**Finding dispositions.**

- **`fence-design-reverted-buries-ship-gate` (critical) — CONFIRMED; record fixed.**
  `reachability.js` defines and uses `surfaceCalledNames` (call-syntax crediting) at
  line 654; there is NO `surfaceExecutableTokens`/fenced-block function anywhere in the
  file. The export baseline's own provenance note records that this plan's (R4-B)
  fenced-block rule "buried 23 genuinely-reachable exports that CTOC recipes invoke
  with INLINE code — including approveSubplans (the Gate-3 done-all gate) ... call
  syntax replaced fenced-block membership." `approveSubplans` is LIVE in the tree
  (invoked as `approveSubplans(parentSlug, 'review')` per the recipe in `start.md`).
  Fix applied: the record now states the fenced-block design was reverted and
  call-syntax is the live rule; the fence half is attributed to R4-C and removed from
  `files:`. The correct code was NOT touched.

- **`verify-ran-non-gating-command` (critical) — CONFIRMED; real gate run.** The
  original VERIFY cited `node --test`, which bypasses the coverage floor and the
  zero-skipped gate. `npm test` was run against the current tree (after `npm install`
  restored the worktree's dev dependencies). Result: `# fail 0`, `# skipped 0`,
  coverage 99.03% (threshold 99), lint and typecheck gates green.

- **`stale-baseline-and-coverage-numbers` (important) — CONFIRMED; numbers corrected.**
  On disk the export baseline is `maxDead: 68` (history 102 → 71 → 69 → 68, never
  through 126) and the coverage floor is `minPct: 99` (40.85 was the old broken
  unscoped metric). The record's 126 and 40 are corrected to 68 and 99; the
  coverage-floor doc edit is dropped and left to its owning sibling.

- **`critique-coverage` / `gate-ruling` (informational) — acknowledged.** The lens
  verdict (REJECT-as-stale-record) is the correct read: this was a frozen snapshot of
  an earlier tree state. Reconciling the record — rather than crossing it as-is or
  re-introducing the reverted design — is the disposition applied.

**Real-gate tail (`npm test`, this worktree):**
```
[CTOC test-gate] coverage 99.03% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] PASS
```

**What shipped and remains (this plan):** the push-placebo deletion
(`init-project.js`, `push.md`), the evidence-less review-rename deletion (`sync.js`),
and the auto-move-to-review setting deletion (`settings.js` + staging profile), with
the three collateral test files updated. **What was superseded:** the fenced-block
fence design (replaced by R4-C's call-syntax rule). **What is owned elsewhere:** the
coverage-floor doc correction (a sibling review-stage plan; CLAUDE.md reads 99 on
disk). No fence was weakened; the live fence catches prose-only and
comment-after-regex dead exports and keeps inline-recipe exports live.
