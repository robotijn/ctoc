---
title: "W04 · s2 — CLAUDE.md step table + cto-chief dispatch lines repointed to the trio"
type: feature
parent_plan: "ctoc-audit-w04-agents-resolve"
depends_on: ctoc-audit-w04-s1-registry-resolves
priority: HIGH
files:
  - CLAUDE.md
  - agents/coordinator/cto-chief.md
  - tests/agent-dispatch-resolution.test.js
---

# W04 · s2 — Step table + coordinator resolve

Strategy: **Option B**. This slice ships the human-facing half of the Option-B story:
repoint `CLAUDE.md`'s Iron Loop step table and `cto-chief.md`'s per-step dispatch
instructions from the 10 phantom step-agent names to the existing
`iron-loop-executor` / `iron-loop-critic` / `iron-loop-integrator` trio. It **extends**
the resolution test created by `s1` with the step-table and coordinator surfaces.

`depends_on: s1` because it reuses the shared helpers (`buildNameIndex`,
`resolvesName`, `RETIRED_PHANTOMS`, `TRIO`) that `s1` places at the top of
`tests/agent-dispatch-resolution.test.js`, and because the trio must already be
resolvable registry entries (`s1`) before the docs point at them.

## Implementation Details

### `CLAUDE.md` — Iron Loop step table (exact rows, verified)

The table lives at lines 272–284. Repoint the agent column for these rows; update the
model parenthetical to the trio's real model (`opus`). Leave the non-phantom rows
(1,2,3,5,6,13) untouched — `security-scanner` (row 13) resolves to
`agents/security/security-scanner.md`.

| Row | Current agent column | Repoint to |
|---|---|---|
| 4 CAPTURE | `functional-reviewer (opus)` | `iron-loop-critic (opus)` |
| 7 SPEC | `implementation-plan-reviewer (opus) then integrator+critic (10 rounds)` | `iron-loop-critic (opus) then iron-loop-integrator+iron-loop-critic (10 rounds)` |
| 8 TEST | `test-maker (opus)` | `iron-loop-executor (opus)` |
| 9 PREPARE | `quality-checker (sonnet)` | `iron-loop-executor (opus)` |
| 10 IMPLEMENT | `implementer (sonnet)` | `iron-loop-executor (opus)` |
| 11 REVIEW | `self-reviewer (opus)` | `iron-loop-critic (opus)` |
| 12 OPTIMIZE | `optimizer (sonnet)` | `iron-loop-executor (opus)` |
| 14 VERIFY | `verifier (sonnet)` | `iron-loop-executor (opus)` |
| 15 DOCUMENT | `documenter (sonnet)` | `iron-loop-executor (opus)` |
| 16 FINAL-REVIEW | `implementation-reviewer (opus)` | `iron-loop-critic (opus)` |

Scope note (decision under ambiguity): the resolution test's CLAUDE.md surface is the
**step table only** (parent Test Strategy point 1). Free-prose role-nouns elsewhere in
CLAUDE.md — "the implementer never guesses" (≈L111), "especially the implementer at
Step 10" (≈L115), the Product-Loop INSTRUMENT row "implementer (inside Iron Loop Step
10)" (≈L71) — are ordinary English, **not** dispatch references, and are left
unchanged. Rewriting generic nouns would degrade prose without improving dispatch
correctness. The test therefore scopes its phantom-scan to structured dispatch
references, never a blanket string search.

### `agents/coordinator/cto-chief.md` — per-step "Owner sub-orchestrator" lines (exact, verified)

Repoint these 10 dispatch lines (line numbers as of the current file). Trio model is
`opus`, so drop mismatched `(sonnet)` parentheticals to `(opus)`:

| Line | Step | Current | Repoint to |
|---|---|---|---|
| 212 | 4 CAPTURE | ``Owner sub-orchestrator: `functional-reviewer` (opus).`` | `iron-loop-critic` (opus) |
| 313 | 7 SPEC | ``Owner sub-orchestrators: `implementation-plan-reviewer` (opus), then `iron-loop-integrator` + `iron-loop-critic` …`` | `iron-loop-critic` (opus), then `iron-loop-integrator` + `iron-loop-critic` … |
| 323 | 8 TEST | ``Owner sub-orchestrator: `test-maker` (opus).`` | `iron-loop-executor` (opus) |
| 334 | 9 PREPARE | ``Owner sub-orchestrator: `quality-checker` (sonnet).`` | `iron-loop-executor` (opus) |
| 351 | 10 IMPLEMENT | ``Owner sub-orchestrator: `implementer` (sonnet).`` | `iron-loop-executor` (opus) |
| 389 | 11 REVIEW | ``Owner sub-orchestrator: `self-reviewer` (opus).`` | `iron-loop-critic` (opus) |
| 408 | 12 OPTIMIZE | ``Owner sub-orchestrator: `optimizer` (sonnet).`` | `iron-loop-executor` (opus) |
| 445 | 14 VERIFY | ``Owner sub-orchestrator: `verifier` (sonnet).`` | `iron-loop-executor` (opus) |
| 475 | 15 DOCUMENT | ``Owner sub-orchestrator: `documenter` (sonnet).`` | `iron-loop-executor` (opus) |
| 487 | 16 FINAL-REVIEW | ``Owner sub-orchestrator: `implementation-reviewer` (opus).`` | `iron-loop-critic` (opus) |

Leave lines 185/193/204/268/280/294 (Step 1/2/3/5/6/6.5 — `vision-advisor`,
`product-owner`, `implementation-planner`, `cto-chief`, all resolve) and line 421
(Step 13 `security-scanner`, resolves) untouched.

Scope note (decision under ambiguity): the cto-chief surface tested is the **"Owner
sub-orchestrator:" dispatch lines** (parent Test Strategy point 3 — "every agent name
it *dispatches*"). The two descriptive Tier-1 *enumerations* (≈L42 "orchestrator-
flavored agents …" and ≈L175 "Tier 1 sub-orchestrators (16): …") still list retired
reviewer names; pruning those touches the **tier model / the documented count of 16**,
which the parent puts **out of scope** ("no re-architecting … the tier model"). They
are left for the tier-model workstream and are explicitly not asserted by this slice's
test. Record this boundary in `## Decisions Taken Under Ambiguity`.

### Test: extend `tests/agent-dispatch-resolution.test.js` (step-table + coordinator surfaces)

Reuse `s1`'s shared helpers. Add:

**Step-table surface** (parse the CLAUDE.md Iron Loop table):
1. **Every agent token in the table resolves.** Match table rows in the step-table
   region; from each row's agent column extract candidate agent tokens
   (`/[a-z][a-z0-9]*(?:-[a-z0-9]+)+/g`), keep those present in the name-index, assert
   `resolvesName` for each.
2. **No retired phantom in the table.** Assert none of `RETIRED_PHANTOMS` appears as a
   token anywhere in the step-table agent columns.

**Coordinator surface** (parse cto-chief.md dispatch lines):
3. **Every dispatched name resolves.** Extract lines matching
   `/^Owner sub-orchestrators?:\s*(.+)$/m`; from each, pull backticked tokens
   `` `name` ``; keep agent-like tokens; assert `resolvesName` for each (skip the
   self-reference `cto-chief`, which resolves anyway).
4. **No retired phantom in any dispatch line.** Assert none of `RETIRED_PHANTOMS`
   appears in any "Owner sub-orchestrator" line.

**Regression protection** (parent AC "future additions"):
5. Construct a synthetic step-table row string `'| 99 | FOO | implementer (sonnet) |'`
   and assert the same extractor+`resolvesName` pipeline flags `implementer` as
   unresolved — proving a future step that names a phantom goes red in CI.

**Red-before-fix proof (self-contained):** assert `resolvesName(idx,'test-maker')`,
`resolvesName(idx,'functional-reviewer')`, and `resolvesName(idx,'implementer')` are
all `false` on the fixed tree (the phantoms still do not exist as files — only the
*pointers* moved to the trio), proving the surface genuinely required repointing and
the test detects a phantom pointer, not just a missing string.

## Execution Plan

### Step 8 — TEST
Extend `tests/agent-dispatch-resolution.test.js` with the step-table and coordinator
`describe` blocks (cases 1–5 + red-before proof) above, reusing `s1`'s helpers. Run
against the **current tree** (step table + cto-chief still name phantoms): confirm the
step-table and coordinator cases are **RED**. Capture the red output.

### Step 9 — PREPARE
Confirm `s1` has landed (registry resolves; trio are registry entries) so the docs
point at resolvable names. Re-read CLAUDE.md 272–284 and the 10 cto-chief line numbers
to confirm they still match (adjust if `s1`/rebase shifted lines — match on text, not
line number).

### Step 10 — IMPLEMENT
ONE step, sub-items:
- (a) Repoint the 10 CLAUDE.md step-table rows per the table.
- (b) Repoint the 10 cto-chief "Owner sub-orchestrator" lines per the table.
No other edits; leave the descriptive Tier-1 enumerations and all non-phantom rows/
lines untouched.

### Step 11 — REVIEW
Confirm the step table and every "Owner sub-orchestrator" line now name only
resolvable agents, models read `opus` for trio rows, and the SPEC row/line still names
the integrator+critic pair. Diff shows only the intended 20 line changes across the two
docs.

### Step 12 — OPTIMIZE
None (documentation repoint). Confirm no accidental table-column misalignment in the
Markdown.

### Step 13 — SECURE
No executable surface changed. Confirm the added test parses files read-only and adds
no shell-outs beyond `s1`'s guarded optional `git show`.

### Step 14 — VERIFY
`node --test tests/agent-dispatch-resolution.test.js` → green (all four surfaces).
`node --test tests/*.test.js` → `# fail 0`, 0 skipped. Confirm
`tests/architecture-invariants.test.js` still green (the descriptive Tier-1 list was
intentionally not touched).

### Step 15 — DOCUMENT
The step table IS user-facing documentation — its repoint is the doc update. Record in
Decisions the scope boundary (step table + dispatch lines repointed; descriptive
Tier-1 enumerations deferred to the tier-model workstream).

### Step 16 — FINAL-REVIEW
Verify parent Option-B AC: the 10 previously-phantom names in CLAUDE.md's step table
and cto-chief's dispatch lines are replaced by trio references and no retired phantom
name remains in those dispatch surfaces. Hand to CTO Chief. **Do not cross Gate 2.**
