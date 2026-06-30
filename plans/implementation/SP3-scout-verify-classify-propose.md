---
approved_by: human
approved_at: 2026-06-30T14:16:32.284Z
gate_crossed: functional → implementation
---

---
title: "SP3 — In-process verify, classify & propose action"
created: "2026-06-15T00:00:00Z"
priority: MEDIUM
type: feature
parent_vision: automated-stale-plan-detection
program: ctoc-pipeline-hygiene
order: 3
depends_on: [SP2-stale-plans-inbox-stream]
files:
  - src/lib/stale-detector.js
  - src/lib/menu-screens.js
  - tests/stale-classifier.test.js
  - tests/stale-detector-cheap.test.js
status: refined
acceptance_criteria_count: 8
risk_level: MEDIUM
---

# SP3 — In-process verify, classify & propose action

## 1. ASSESS — Problem Understanding

### Business Context

The cheap candidates produced by SP1 and surfaced by SP2 are unverified — a plan may be old but not actually stale, or may lack an `approved_by` marker for good reason. False positives are the primary trust threat. The locked HYBRID decision demands expensive proof (git-history match and `files:` existence) before a plan is classified actionable. This expensive proof runs ONLY when the user explicitly drills in and triggers verification — never on menu open.

**There is no subagent scout in this implementation.** The menu system is a plain Node.js process; it cannot dispatch a Haiku subagent, and doing so would require context plumbing that does not exist. Verification runs as a plain in-process Node module that shells to git via `child_process` when explicitly triggered. The classifier is a pure, deterministic function that is unit-testable without any git invocation.

### Current State

No git-based staleness verification exists in the codebase. `src/lib/stale-detector.js` was created in SP1. There are no operations-registry entries or agent files to create — SP3 adds `verifyStaleCandidate` and `classifyStaleCandidate` to the existing `src/lib/stale-detector.js` module and creates its classifier test file. SP3 also modifies `src/lib/menu-screens.js` to wire the explicit user-triggered verify path (Decision F2).

### Impact

Without verification, any cleanup proposal is untrustworthy. Users need evidence — a specific commit hash, a file path that matches the plan slug — before they will confidently approve archiving or deleting a plan. The in-process verifier bridges the cheap scan (SP1) and the human decision (SP4) by turning soft signals into hard evidence, without requiring a separate process or subagent dispatch. The `'Verify'` option in the drill-in screen makes this evidence immediately accessible from the menu without blocking the hot-path.

## 2. ALIGN — Business Alignment

### Business Goals

1. Add a `verifyStaleCandidate(candidate, root)` function to `src/lib/stale-detector.js` that accepts a single candidate from SP1 and, by shelling to git via `child_process`, produces an evidence object describing what git history shows about the plan slug and its declared files. Re-reads the plan file to detect `approved_by` frontmatter (the candidate object carries only `{plan, stage, signals, actionable}` — this field is not in the cheap-scan shape).
2. Add `classifyStaleCandidate(candidate, evidence)` — a pure, deterministic function that maps verified evidence to one of four categories and a proposed action. No git calls, no filesystem access — all evidence is passed in by the caller. Unit-testable with deterministic fixtures.
3. Ensure age-only candidates never reach an actionable classification — the `inconclusive` category is the correct output when git and file evidence are absent.
4. Verification runs ONLY on explicit user action, never on menu open (hot-path constraint).
5. Wire the user-triggered verify path end-to-end in `src/lib/menu-screens.js` (Decision F2 — Option A): promote `'Verify'` from text-only affordance in `inboxStalePlansDrillIn` to a real selectable label mapped to `'inbox verify'`; add `inboxVerifyProposals(projectPath)` screen function that calls `verifyStaleCandidate` + `classifyStaleCandidate` per candidate and renders the grouped proposals read-only; add the `inbox verify` branch to `route()`.

### Success Metrics

- **M1:** `classifyStaleCandidate(candidate, evidence)` returns an object with `{ category, proposedAction, evidence[] }` for all four categories: `shipped-but-early`, `approved-but-stranded`, `dead-on-arrival`, `inconclusive`.
- **M2:** `shipped-but-early` maps to `proposedAction: 'archive-to-done'` (stamp `approved_by: human` + `gate_crossed`, move to `done/`).
- **M3:** `approved-but-stranded` maps to `proposedAction: 'advance-via-reconciliation'` — uses the dedicated reconciliation path in SP4's `stale-cleanup.js`, NOT `approvePlan()` (which would re-fire the deployment pipeline and pollute the Gate-3 audit trail).
- **M4:** `dead-on-arrival` default proposed action is `'revert'` (reversible) unless the caller supplies explicit positive death evidence (an `explicitlyRejected` flag in the evidence object). `'delete'` is only proposed when that flag is true. Never auto-execute either.
- **M5:** A candidate with age signal only and no git/file evidence is classified `inconclusive` with `proposedAction: null` and is NOT proposed for any action.
- **M6:** `verifyStaleCandidate(candidate, root)` invokes git via `child_process.execSync` and is isolated to `stale-detector.js`. It returns the evidence object consumed by `classifyStaleCandidate`. It is never called from the menu hot-path.
- **M7:** The verifier and classifier produce a structured proposals array (`Array<{plan, category, proposedAction, evidence}>`); neither function performs any file write, plan move, or gate crossing.
- **M8:** Selecting `'Verify'` in `inboxStalePlansDrillIn` routes to `inbox verify`, which calls `inboxVerifyProposals(projectPath)`. That screen calls `verifyStaleCandidate` and `classifyStaleCandidate` per candidate and renders proposals grouped by category in a read-only screen with `'◀ Back'` as the only selectable option (routes to `inbox stale`). No digit in `actions` maps to the `inbox verify` route (menu discipline Rule 1).

### Stakeholders

- CTOC user who triggered verification from the SP2 drill-in (receives the evidence-backed proposal list via `inboxVerifyProposals`)
- SP4 (consumes the proposals array to present the grouped review surface)
- SP5 (regression suite asserts the classification invariants with deterministic fixtures)

### Constraints

- `classifyStaleCandidate(candidate, evidence)` is a pure function — no side effects, no git calls, no filesystem access. All evidence is passed in by the caller.
- `verifyStaleCandidate(candidate, root)` may call git via `child_process.execSync` — this is the ONLY function in `stale-detector.js` that may invoke a subprocess, and it is only called when the user explicitly selects `'Verify'` in the drill-in, routing through `inboxVerifyProposals`.
- `scanCheapCandidates` must remain subprocess-free even though `stale-detector.js` now contains `verifyStaleCandidate` which uses `child_process.execSync`. SP1's shipped behavioral spy (no subprocess DURING `scanCheapCandidates`) is the primary behavioral guard and is unchanged. The FILE-LEVEL static assertion in `tests/stale-detector-cheap.test.js` (Scenario 5) is NARROWED to scope the subprocess-free guarantee to the `scanCheapCandidates` function body only — see Decision C and Risk R3.
- No agent file, no operations-registry entry, no scout registration. SP3's `stale-detector.js` additions are entirely in-process.
- Verification output is proposals only — no execution of any kind. Gate hooks must not be modified.
- `dead-on-arrival` default is `'revert'` (reversible-first). `'delete'` requires `evidence.explicitlyRejected === true`.
- Menu discipline: `'Verify'` and `'◀ Back'` are option labels in `inboxStalePlansDrillIn`; no digit maps to `inbox verify` (Rule 1).

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** CTOC user who has drilled into the stale stream and selected `'Verify'`,
**I want** each candidate verified against git history and my declared `files:`,
**so that** I receive an evidence-backed classification and proposal before I decide whether to clean up.

**As a** CTOC maintainer,
**I want** the classification logic in a pure function I can unit-test with deterministic fixtures,
**so that** the git integration is boundary-tested separately and the classifier never silently drifts.

### BDD Scenarios

- [ ] **Scenario: Shipped plan classified correctly**
  Given a candidate in `functional/` with a `missing-files` signal
  And evidence that the plan slug appears as a word-bounded token in a git commit message dated after the plan's stage entry
  And all declared `files:` exist in the tree (confirmed by `verifyStaleCandidate`)
  When `classifyStaleCandidate(candidate, evidence)` is called
  Then the result has `category: 'shipped-but-early'`
  And `proposedAction: 'archive-to-done'`
  And `evidence` array contains the matching commit reference

- [ ] **Scenario: Approved-but-stranded review plan classified correctly**
  Given a candidate in `review/` stage (candidate object carries only `{plan, stage, signals, actionable}`)
  And `verifyStaleCandidate` re-reads the plan file and discovers `approved_by: human` in its frontmatter, placing it in the evidence object (the cheap scan does not read nor carry this field)
  And evidence that the plan's declared files were last modified by a commit dated after the plan's stage entry
  When `classifyStaleCandidate(candidate, evidence)` is called
  Then the result has `category: 'approved-but-stranded'`
  And `proposedAction: 'advance-via-reconciliation'`

- [ ] **Scenario: Dead-on-arrival plan with no prior approval proposes revert by default**
  Given a candidate whose declared `files:` are absent from the tree
  And evidence shows no git commit references the plan slug
  And the candidate's frontmatter contains no `approved_by` field
  And the evidence object does NOT set `explicitlyRejected: true`
  When `classifyStaleCandidate(candidate, evidence)` is called
  Then the result has `category: 'dead-on-arrival'`
  And `proposedAction: 'revert'`

- [ ] **Scenario: Dead-on-arrival plan proposes delete only when explicitly rejected**
  Given a candidate whose declared `files:` are absent from the tree
  And the evidence object sets `explicitlyRejected: true`
  When `classifyStaleCandidate(candidate, evidence)` is called
  Then the result has `category: 'dead-on-arrival'`
  And `proposedAction: 'delete'`

- [ ] **Scenario: Age-only candidate classified inconclusive**
  Given a candidate whose only signal is `advisory:age` (mtime > 14 days)
  And evidence object has no git commits referencing the plan slug
  And all declared `files:` exist on disk
  When `classifyStaleCandidate(candidate, evidence)` is called
  Then the result has `category: 'inconclusive'`
  And `proposedAction` is `null`
  And the proposal is NOT included in any actionable proposal list

- [ ] **Scenario: Verifier and classifier produce proposals only — no side effects**
  Given a list of 3 candidates (one per actionable category)
  When `verifyStaleCandidate` and `classifyStaleCandidate` run for each
  Then they return proposal objects with category and proposedAction
  And no plan file has been moved, stamped, or deleted
  And no gate-revert hook has been triggered

- [ ] **Scenario: verifyStaleCandidate is never called on menu hot-path**
  Given the menu is opened and `scanCheapCandidates` runs
  When the Inbox renders the stale count
  Then `verifyStaleCandidate` is NOT called (asserted by spy on `child_process.execSync`)
  And `verifyStaleCandidate` is ONLY called when the user explicitly selects `'Verify'` in the drill-in, which routes `['inbox', 'verify']` through `route()` to `inboxVerifyProposals(projectPath)`

- [ ] **Scenario: Selecting 'Verify' in drill-in routes to `inbox verify` and renders proposals**
  Given `inboxStalePlansDrillIn` is rendered with 1 or more candidates
  When the user selects `'Verify'` (a label, never a digit)
  Then `route(['inbox', 'verify'], projectPath)` is invoked and calls `inboxVerifyProposals(projectPath)`
  And `inboxVerifyProposals` calls `verifyStaleCandidate` and `classifyStaleCandidate` per candidate
  And the rendered `text` shows proposals grouped by category (read-only; max 20 rows)
  And `'◀ Back'` is the only selectable option in `ask`, with `actions['◀ Back']` mapped to `'inbox stale'`
  And no key in `actions` is a digit (menu discipline — digits open plans only, Rule 1)

### In Scope

- `verifyStaleCandidate(candidate, root)` added to `src/lib/stale-detector.js` — shells to git via `child_process.execSync`; re-reads the plan file to detect `approved_by` frontmatter; returns an evidence object with git findings, file-tree results, and any `approved_by` value found
- `classifyStaleCandidate(candidate, evidence)` added to `src/lib/stale-detector.js` — pure function, no git calls, no fs access
- Four categories: `shipped-but-early`, `approved-but-stranded`, `dead-on-arrival`, `inconclusive`
- `approved-but-stranded` proposed action: `'advance-via-reconciliation'` (not `approvePlan()`)
- `dead-on-arrival` default proposed action: `'revert'`; `'delete'` only when `evidence.explicitlyRejected === true`
- Git-match heuristic: commit message references plan slug as a word-bounded token (`\bslug\b`, case-insensitive) AND plan's declared `files:` were last modified by a commit dated after the plan's stage-entry date (both required for `shipped-but-early`; either alone is insufficient)
- Unit test `tests/stale-classifier.test.js` with deterministic evidence fixtures (no real git calls in the classifier test; `verifyStaleCandidate` boundary-tested separately)
- `src/lib/menu-screens.js` modified:
  - `inboxStalePlansDrillIn`: the `'Verify with SP3 verification (coming soon)'` text line is removed; `'Verify'` is added as a real selectable option in `ask`; `actions['Verify'] = 'inbox verify'`; `'◀ Back'` remains (2 options total — within AskUserQuestion cap)
  - New `inboxVerifyProposals(projectPath)` screen function: calls `listStaleCandidates(root)`, runs `verifyStaleCandidate` + `classifyStaleCandidate` per candidate, renders proposals grouped by category with category header, plan slug, proposedAction, and evidence summary; max 20 rows (matching `inboxStalePlansDrillIn` S4 convention); `'◀ Back'` is the only selectable option with `actions['◀ Back'] = 'inbox stale'`
  - `route()` `'inbox'` case gains `if (args[1] === 'verify') return inboxVerifyProposals(projectPath)` before the existing `stale` branch
- `tests/stale-detector-cheap.test.js` modified: Scenario 5 static assertion narrowed from whole-source to `scanCheapCandidates` function body only (see Decision C)

### Out of Scope

- Executing any proposed action — proposals rendered by `inboxVerifyProposals` are display-only; all execution belongs to SP4
- Any agent file, scout agent definition, or operations-registry entry — SP3 is entirely in-process Node
- Modifying any hook, gate logic, or existing plan files
- Classifying plans in `done/` — `done/` plans are never candidates (the detector only scans gate source stages)

## Risks

### Technical Risks

- **Risk:** Git commit message matching by plan slug is fragile — slugs that appear as substrings of other commit messages could produce false positives in the git-match heuristic.
  - Likelihood: MEDIUM (commit messages are free-form; slug `sp1` could match "display")
  - Impact: MEDIUM (false positives cause the verifier to classify a plan as shipped when it is not, leading to incorrect archive proposals)
  - Mitigation: Require the slug to appear as a word-bounded token in the commit message (regex `\bslug\b`, case-insensitive) and also require the plan's stage-entry date to predate the matching commit — both conditions must be true for `shipped-but-early`.

- **Risk:** `child_process.execSync` in `verifyStaleCandidate` throws if the git binary is not on PATH, producing an unhandled exception that crashes the menu process.
  - Likelihood: LOW (git is present in all CTOC development environments)
  - Impact: HIGH (crash in the menu process is the worst user experience)
  - Mitigation: Wrap every `execSync` call in a try/catch; on failure return `{ gitAvailable: false, error: e.message }`. The classifier treats `gitAvailable: false` as `inconclusive` — degraded signal, no crash.

### Business Risks

- **Risk:** Users may not trust classification when the evidence array is thin (e.g. only a slug match in git log, no file tree confirmation).
  - Likelihood: MEDIUM (power users will scrutinize evidence)
  - Impact: LOW (the human still approves or overrides; a weak evidence array prompts a skip)
  - Mitigation: Require both git-slug match AND file-tree check to reach `shipped-but-early`; a single signal only is sufficient for `dead-on-arrival` since the risk of false deletion is mitigated by the `revert` default.

### Dependency Risks

- **Risk:** SP4 consumes the proposals array shape; if this plan changes the shape, SP4 breaks.
  - Likelihood: LOW (shape is locked in this plan: `{plan, category, proposedAction, evidence[]}`)
  - Impact: MEDIUM (SP4 tests would fail at integration time)
  - Mitigation: Export a JSDoc typedef for `StaleProposal` from `stale-detector.js` and reference it in `stale-cleanup.js` (SP4) via `@param {import('./stale-detector').StaleProposal[]}`.

- **Risk R3:** SP3 adds `require('child_process')` and `execSync` to `stale-detector.js`. SP1's FILE-LEVEL static test in `tests/stale-detector-cheap.test.js` (Scenario 5) currently asserts the WHOLE source has no such tokens — it WILL fail when SP3 lands unless the assertion is narrowed in the same commit.
  - Likelihood: HIGH (the assertion is exact string-match on the full source; any `execSync` in the file triggers it)
  - Impact: HIGH (CI breaks on every post-SP3 test run until fixed)
  - Mitigation: Narrow the static assertion atomically with the `stale-detector.js` source change (see Decision C); ship both files in one commit; verify locally with `node --test tests/stale-detector-cheap.test.js` before committing.

## Priority

**Priority: MEDIUM** (Score: 6/9)
- Dependency: MEDIUM (2) — depends on SP2; SP4 depends on this; serial chain
- Business Impact: MEDIUM (2) — produces the evidence-backed proposals that make cleanup trustworthy
- Technical Risk: MEDIUM (2) — git-match heuristic has fragility risks; `execSync` error handling is a real edge case

## Decisions Taken Under Ambiguity

- **No subagent scout:** The menu is a plain Node.js process with no subagent dispatch capability. The previous design assumed a Tier-3 Haiku scout; that assumption was wrong. Verification runs in-process via `child_process.execSync` in `verifyStaleCandidate`. No agent file, no operations-registry entry.
- **`approved-but-stranded` proposed action:** `'advance-via-reconciliation'` (not `'advance-via-approvePlan'`). Using `approvePlan()` re-fires the deployment pipeline and logs a fresh live Gate-3 crossing, polluting the audit trail for months-old work. SP4's dedicated reconciliation path handles this correctly.
- **`dead-on-arrival` default:** `'revert'` (reversible-first). `'delete'` is only proposed when `evidence.explicitlyRejected === true`. Reversible-first principle: never auto-propose irreversible destruction without positive death evidence.
- **Git-match heuristic:** commit message references plan slug as a word-bounded token AND plan's declared `files:` exist and were last modified by a commit dated after the plan's stage-entry date. Both conditions together are required for `shipped-but-early`; either alone is insufficient.
- **`execSync` error handling:** try/catch wrapper around every git shell call; on failure return `{ gitAvailable: false, error: e.message }`. Classifier treats `gitAvailable: false` as `inconclusive` — degraded signal, no crash.
- **`inconclusive` is a valid output category, not an error:** a candidate that cannot be proven stale through evidence is left alone and not proposed for action.
- **Files list:** Removed `agents/scouts/stale-plan-scout.md` and `.ctoc/operations-registry.yaml` from prior design (scout design superseded). SP3 touches `src/lib/stale-detector.js`, `src/lib/menu-screens.js`, `tests/stale-classifier.test.js`, and `tests/stale-detector-cheap.test.js`.
- **Decision F2 — SP3 owns verify wiring end-to-end (Option A chosen):** SP3 promotes `'Verify'` from a text-only affordance in `inboxStalePlansDrillIn` to a real selectable label mapped to `'inbox verify'` in `actions`. `route()` handles `args = ['inbox', 'verify']` by calling new `inboxVerifyProposals(projectPath)`. That screen: calls `listStaleCandidates(root)`, runs `verifyStaleCandidate` + `classifyStaleCandidate` per candidate, renders proposals grouped by category header (read-only, max 20 rows matching the S4 convention already used by `inboxStalePlansDrillIn`), `'◀ Back'` is the only option and routes to `'inbox stale'`. `inboxVerifyProposals` is the ONLY call site for `verifyStaleCandidate` in the codebase — it is never called from the hot-path (satisfies M6). No digit maps to `inbox verify` (menu discipline Rule 1). AskUserQuestion cap satisfied: `inboxStalePlansDrillIn` has exactly 2 options (`'Verify'` + `'◀ Back'`); `inboxVerifyProposals` has 1 option (`'◀ Back'`).
- **Decision C — narrowing the SP1 static assertion:** SP3 adds `require('child_process')` and `execSync` to `stale-detector.js` (inside `verifyStaleCandidate`). SP1's Scenario 5 static test in `tests/stale-detector-cheap.test.js` (lines ~280-289) currently asserts the WHOLE module source contains no subprocess tokens — it will fail once SP3 lands. The fix: rewrite that static `it(...)` to (a) locate the `scanCheapCandidates` function via `src.indexOf('function scanCheapCandidates(')`, (b) locate the exports boundary via `src.indexOf('\nmodule.exports')`, (c) extract `fnBody = src.slice(fnStart, exportsStart)`, (d) assert all subprocess-free tokens against `fnBody` only. If either marker is absent (renamed function, etc.), `fnBody` falls back to the full source so any regression still fails loudly. Since `verifyStaleCandidate` is defined above `scanCheapCandidates` in the file, it falls outside the extracted slice and its `execSync` does not trigger the narrowed assertions. The `it` description changes from `'static: source imports no child_process and uses no subprocess token'` to `'static: scanCheapCandidates function body is subprocess-free'`. The behavioral spy (no subprocess DURING `scanCheapCandidates` — lines ~251-278) is unchanged and remains the primary behavioral guard. Ship this test change atomically with the `stale-detector.js` source change (Risk R3).

## 5. PLAN — Implementation Context (Iron Loop Step 5)

> Verified against the SHIPPED SP1/SP2 surface: `src/lib/stale-detector.js`
> (`fs`/`path`-only, candidate shape `{plan, stage, signals, actionable}`,
> exports `scanCheapCandidates`, `extractFrontmatterRegion`, `parseFilesField`,
> `GATE_SOURCE_STAGES`, `AGE_THRESHOLD_MS`, `MAX_PLAN_BYTES`); `src/lib/inbox.js`
> (`listStaleCandidates` → `scanCheapCandidates(root).candidates`); and
> `src/lib/menu-screens.js` (module-scope `stripCtl`, `inboxStalePlansDrillIn`,
> `route()` inbox case, 20-row cap convention). No upstream behaviour is changed
> — SP3 only adds.

### 5.1 Architecture Decision Record

**Context.** SP1 produces cheap, unverified candidates; SP2 surfaces them
read-only. SP3 must turn soft signals into hard, git-backed evidence and a
proposed action — without a subagent, without touching the hot path, and without
executing anything. The menu is a plain Node process; the only available
verification engine is in-process `git` via `child_process`.

**Decision (load-bearing, beyond the locked decisions already recorded):**

1. **Function placement — verify/classify ABOVE `scanCheapCandidates`.** Decision C
   narrows the SP1 static guard to the slice `src.indexOf('function scanCheapCandidates(')`
   → `src.indexOf('\nmodule.exports')`. Both new functions MUST be defined ABOVE
   `function scanCheapCandidates(` (after the existing parse/fs helpers) so they
   fall OUTSIDE that slice and their `execFileSync` never trips the narrowed
   assertion. Placing them between `scanCheapCandidates` and `module.exports`
   would re-break the static guard — explicitly forbidden.

2. **Lazy `require('child_process')` inside `verifyStaleCandidate` only.** Module
   load stays side-effect-free and subprocess-free; the dependency is co-located
   with the sole function that uses it. The SP1 behavioral spy (re-require + run
   `scanCheapCandidates` with all `cp` methods throwing) stays green because the
   require executes no method and `scanCheapCandidates` never calls into `cp`.

3. **Subprocess via `execFileSync('git', [args])` — NEVER a shell string.** No
   slug, path, or commit text is ever interpolated into a shell command. Git
   receives an argv array; `child_process.execFileSync` spawns git directly with
   no shell, so shell metacharacters in a slug/path cannot inject. The
   `\bslug\b` (case-insensitive) match is applied in JS to git's stdout, never as
   a shell/`grep` argument. (Resolves Risk R1 + the injection class entirely.)

4. **Date comparison via `%ct` (UNIX epoch seconds), not ISO string compare.**
   `%cI` strings carry per-commit timezone offsets; lexicographic comparison of
   two differently-offset ISO strings is wrong. All "after stage entry"
   comparisons use the integer `%ct`. Evidence DISPLAY derives `YYYY-MM-DD` from
   the epoch in JS (`new Date(ct*1000).toISOString().slice(0,10)`).

5. **Stage-entry date = oldest commit TOUCHING the plan at its CURRENT path
   (no `--follow`).** See the appended Decision under §6.5. This is the entry
   into the current stage, not the plan's birth.

6. **Menu integration via a namespace require of `stale-detector`.**
   `const staleDetector = require('./stale-detector');` (mirrors the late-bound
   namespace import inbox.js already uses) so a test can rewire/spy
   `verifyStaleCandidate` and `child_process` at the require boundary.
   `inboxVerifyProposals` is the SOLE call site of `verifyStaleCandidate`.

**Consequences.** Verification is degraded-gracefully (git missing / not a repo /
timeout ⇒ `gitAvailable:false` ⇒ `inconclusive`, never a crash). The classifier
is a pure function unit-tested with deterministic fixtures and no git. The hot
path (`scanCheapCandidates`, `getInboxCounts`) is untouched and provably
subprocess-free. The proposals array shape `{plan, category, proposedAction,
evidence[]}` is locked for SP4.

### 5.2 Dependency Graph (no cycles)

```
tests/stale-classifier.test.js ──require──▶ src/lib/stale-detector.js  (verifyStaleCandidate, classifyStaleCandidate, StaleProposal)
                                └─require──▶ src/lib/menu-screens.js    (route, inboxVerifyProposals, inboxStalePlansDrillIn)
tests/stale-detector-cheap.test.js ─reads source of─▶ src/lib/stale-detector.js  (narrowed static guard; behavioral spy)

src/lib/menu-screens.js ──require──▶ src/lib/stale-detector.js  (NEW namespace import: verify + classify)
src/lib/menu-screens.js ──require──▶ src/lib/inbox.js           (existing: listStaleCandidates)
src/lib/inbox.js        ──require──▶ src/lib/stale-detector.js  (existing: scanCheapCandidates only)
src/lib/stale-detector.js ─lazy require─▶ child_process         (NEW; ONLY inside verifyStaleCandidate)
```

All edges point toward the `stale-detector.js` leaf (plus the Node built-in
`child_process`). `menu-screens → inbox → stale-detector` and
`menu-screens → stale-detector` form a diamond, NOT a cycle. The new functions
add no new project import beyond the built-in `child_process`.

### 5.3 Implementation Order (dependency order)

1. **`src/lib/stale-detector.js`** — add `verifyStaleCandidate`,
   `classifyStaleCandidate`, the `StaleProposal`/evidence typedefs, and the two
   new exports (functions placed ABOVE `scanCheapCandidates`). Nothing else can
   be wired until these exist.
2. **`tests/stale-detector-cheap.test.js`** — narrow the file-level static guard
   to the `scanCheapCandidates` body (Decision C). Ship ATOMICALLY with step 1
   (Risk R3): a commit containing step 1 without step 2 fails CI.
3. **`src/lib/menu-screens.js`** — add the namespace require; promote `'Verify'`
   to a real label in `inboxStalePlansDrillIn`; add `inboxVerifyProposals`; add
   the `inbox verify` branch to `route()`; export `inboxVerifyProposals`.
4. **`tests/stale-classifier.test.js`** — CREATE: pure-classifier fixtures, the
   `verifyStaleCandidate` boundary test (execFileSync spy), the menu
   routing/render tests, and the no-side-effects test.

### 5.4 Risk → Mitigation confirmation (Step 5)

| Risk (from §Risks) | Mitigation in this design | Where |
|---|---|---|
| R1 slug substring false positive | `\bslug\b` (escaped, case-insensitive) in JS AND `%ct` slug-match-after-stage-entry AND `filesModifiedAfterEntry` — all three required for `shipped-but-early` | `classifyStaleCandidate` (§6.1), `verifyStaleCandidate` slug query (§6.5) |
| R2 `git` missing ⇒ crash | `rev-parse --is-inside-work-tree` probe + try/catch on every call ⇒ `{gitAvailable:false}`; classifier maps to `inconclusive` | `verifyStaleCandidate` (§6.5), `classifyStaleCandidate` step 1 (§6.1) |
| Dep: SP4 proposal shape | `@typedef StaleProposal` exported + locked 4-key return | `stale-detector.js` typedef (§6.1) |
| R3 static guard breaks | narrow to `scanCheapCandidates` slice; verify/classify above it; ship atomically | `tests/stale-detector-cheap.test.js` (§6.4) |

## 6. DESIGN — File Specifications (Iron Loop Step 6)

### 6.1 File: `src/lib/stale-detector.js` — MODIFY (add 2 functions + typedefs)

**Action:** MODIFY. **Purpose:** add explicit-trigger git verification and a pure
classifier to the existing SP1 leaf module. **Placement constraint (load-bearing,
Decision C):** both new functions are inserted ABOVE `function
scanCheapCandidates(` — after `hasMissingFiles` (current line ~256) and before
`scanCheapCandidates` (current line ~273). Existing internal helpers
(`extractFrontmatterRegion`, `parseFilesField`, `declaredFileExists`) are reused
directly — they are in-module, no new export needed for them.

#### Typedefs to add (near the existing typedef block, top of file)

```js
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
 * @property {boolean}  explicitlyRejected    positive death evidence; SP3 default false (see §6.5 decision).
 *
 * @typedef {Object} StaleProposal
 * @property {string}                 plan          candidate.plan (slug).
 * @property {('shipped-but-early'|'approved-but-stranded'|'dead-on-arrival'|'inconclusive')} category
 * @property {(?'archive-to-done'|'advance-via-reconciliation'|'revert'|'delete'|null)}        proposedAction
 * @property {string[]}               evidence      human-readable evidence lines derived from StaleEvidence.
 */
```

#### `verifyStaleCandidate(candidate, root)` → `StaleEvidence`

The ONLY function in this module that may invoke a subprocess. Lazy
`const cp = require('child_process');` at the TOP of the function body.

```
@param {StaleCandidate} candidate  one item from scanCheapCandidates().candidates ({plan,stage,signals,actionable})
@param {string} root               project root (dir containing plans/)
@returns {StaleEvidence}
@throws {TypeError} if candidate is not an object with a string `plan`/`stage`, or root is not a non-empty string (fail-loud on misuse only)
```

Internal `runGit(args)` helper (closure over `cp`, `root`):

```
execFileSync('git', args, {
  cwd: root, encoding: 'utf8',
  timeout: 5000, maxBuffer: 16 * 1024 * 1024,
  windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],   // ignore git stderr
}).trim()
```

Step-by-step:

1. **Validate inputs** (TypeError on misuse — consistent with `scanCheapCandidates`).
2. **Re-read the plan file** (verify-only; the cheap scan does NOT read approved_by, per F1):
   - `planFsPath = path.join(root, 'plans', candidate.stage, candidate.plan + '.md')`.
   - try/read; on read failure → `content = ''` (degrade; do not throw).
   - `region = extractFrontmatterRegion(content)`;
     `declaredFiles = parseFilesField(region)`.
   - `approvedBy = (region.match(/^approved_by:[ \t]*(.+?)[ \t]*$/m) || [])[1] || null`
     (strip surrounding quotes; null when absent).
3. **File-tree truth** (reuse internal `declaredFileExists(root, rel)`):
   - `allFilesExist = declaredFiles.every((f) => declaredFileExists(root, f))`
     (`[]` ⇒ `true`); `anyFileMissing = declaredFiles.some((f) => !declaredFileExists(root, f))`.
4. **Git availability probe (Risk R2):** try `runGit(['rev-parse','--is-inside-work-tree'])`.
   On throw (ENOENT = no git binary; exit 128 = not a repo; ETIMEDOUT) →
   return the degraded evidence object: `gitAvailable:false`, `error: e.message`,
   the file-tree + approvedBy fields already computed, all git-derived fields
   null/empty/false. **Never rethrow.**
5. **Stage-entry epoch** — `planPosix = ['plans', candidate.stage, candidate.plan + '.md'].join('/')`
   (POSIX forward slashes for the git pathspec; NOT path.join):
   `out = runGit(['log','--format=%ct','--', planPosix])` in try/catch (null on failure).
   `stageEntryEpoch = lastNonEmptyLine(out) ? Number(...) : null`. The LAST line is
   the OLDEST commit touching the plan at its current path ⇒ entry into the current stage.
6. **Files last-modified epoch** — for each declared file
   `f` → `decl = f.replace(/\\/g,'/')` →
   `runGit(['log','-1','--format=%ct','--', decl])` in try/catch (skip on failure);
   `filesLastModifiedEpoch = MAX(parsed epochs)` or null if none.
   `filesModifiedAfterEntry = (filesLastModifiedEpoch != null && stageEntryEpoch != null && filesLastModifiedEpoch > stageEntryEpoch)`.
7. **Slug-match commits (shell-safe, JS-side regex):**
   - `raw = runGit(['log','--format=%ct%x1f%h%x1f%B%x1e','-n','2000'])` (cap to bound cost; `\x1f` unit-sep between fields, `\x1e` record-terminator) in try/catch (`raw=''` on failure).
   - `records = raw.split('\x1e')`; for each non-empty record:
     `const i1 = rec.indexOf('\x1f'), i2 = rec.indexOf('\x1f', i1+1);`
     `ct = Number(rec.slice(0,i1).trim()); message = rec.slice(i2+1);`
   - `const re = new RegExp('\\b' + candidate.plan.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\b', 'i');`
     **slug is regex-escaped and matched in JS against git output — never passed to a shell.**
   - if `re.test(message)` → push `{shortHash, dateISO: new Date(ct*1000).toISOString().slice(0,10), subject: firstLine(message)}` and track whether `ct > stageEntryEpoch`.
   - `slugMatchAfterEntry = (stageEntryEpoch != null) && commits.some(c => c.ct > stageEntryEpoch)`.
8. **`explicitlyRejected`** — SP3 default `false` (see §6.5 appended decision; no
   rejection marker exists in the pipeline today; reversible-first).
9. Return the fully-populated `StaleEvidence`. No write, no move, no gate. Read-only.

Cross-platform: git pathspecs use forward slashes; `windowsHide`; ENOENT (git not
on PATH, incl. Windows-without-git) → gitAvailable:false. fs paths use `path.join`.

#### `classifyStaleCandidate(candidate, evidence)` → `StaleProposal`

PURE — no git, no fs, no I/O, no mutation of inputs. Deterministic. Builds the
`evidence[]` strings from the `StaleEvidence` object.

```
Decision order (first match wins):

0. if (!evidence.gitAvailable)
     → { category:'inconclusive', proposedAction:null,
         evidence:['git unavailable — cannot verify (' + (evidence.error||'') + ')'] }      // M5/M6 degrade

1. DEAD-ON-ARRIVAL  — files gone, nothing shipped, never approved:
   if (evidence.anyFileMissing && evidence.slugMatchCommits.length === 0 && !evidence.approvedBy)
     → category = 'dead-on-arrival'
       proposedAction = (evidence.explicitlyRejected === true) ? 'delete' : 'revert'         // M4

2. APPROVED-BUT-STRANDED — carries approval AND work continued after it entered the stage:
   else if (evidence.approvedBy && evidence.filesModifiedAfterEntry)
     → category = 'approved-but-stranded'
       proposedAction = 'advance-via-reconciliation'                                          // M3 (NOT approvePlan)

3. SHIPPED-BUT-EARLY — BOTH slug-match-after-entry AND files-modified-after-entry, files all present, not approved at this gate:
   else if (evidence.slugMatchAfterEntry && evidence.filesModifiedAfterEntry && evidence.allFilesExist)
     → category = 'shipped-but-early'
       proposedAction = 'archive-to-done'                                                     // M2

4. INCONCLUSIVE — everything else (incl. age-only, thin/partial evidence):
   else → { category:'inconclusive', proposedAction:null }                                    // M5
```

Returns exactly `{ plan: candidate.plan, category, proposedAction, evidence }` —
the locked 4-key `StaleProposal` (M1, M7). `evidence[]` examples (pure string
formatting from the object): `"slug matched in 3a1f2bc (2026-06-20), after stage
entry 2026-06-01"`, `"all 4 declared files present; last change 2026-06-20 (after
stage entry)"`, `"approved_by: human"`, `"2 of 4 declared files missing"`,
`"age-only signal; no shipping evidence"`.

#### Exports

Append `verifyStaleCandidate` and `classifyStaleCandidate` to the existing
`module.exports` (after `scanCheapCandidates`). The `StaleProposal`/`StaleEvidence`
typedefs are JSDoc-only (consumed by SP4 via `import('./stale-detector').StaleProposal`).

### 6.2 File: `src/lib/menu-screens.js` — MODIFY (reachable verify trigger, Decision F2-A)

**Imports (top, near line 21):** add
`const staleDetector = require('./stale-detector');` (namespace import — keeps the
spy seam; `listStaleCandidates` continues to come from `./inbox`).

**`inboxStalePlansDrillIn(projectPath)` (lines ~356-399):**
- DELETE the affordance line (current line 384):
  `text += '\n  Verify with SP3 verification (coming soon) before any cleanup.\n';`
- When `candidates.length > 0`, REPLACE it with an invite line, e.g.
  `text += '\n  Select "Verify" to run git-backed verification (read-only).\n';`
- `ask.questions[0].options`: when `candidates.length > 0`, prepend
  `{ label: 'Verify', description: 'Run git-backed verification (read-only) and view proposals' }`
  BEFORE the existing `{ label: '◀ Back', ... }` (2 options total — within the
  AskUserQuestion 4-cap). When `candidates.length === 0`, keep ONLY `◀ Back`
  (Verify would be pointless).
- `actions`: `{ 'Verify': 'inbox verify', '◀ Back': '' }` when candidates exist,
  else `{ '◀ Back': '' }`. `'Verify'` is a LABEL, never a digit (Rule 1).

**`inboxVerifyProposals(projectPath)` — NEW screen function** (place after
`inboxStalePlansDrillIn`). Read-only; the ONLY call site of `verifyStaleCandidate`
(M6); never on the hot path.

```
const root = getProjectPath(projectPath);
const candidates = listStaleCandidates(root);                 // cold path, one fresh scan
const proposals = candidates.map((cand) => {
  const evidence = staleDetector.verifyStaleCandidate(cand, root);   // explicit-trigger git
  return staleDetector.classifyStaleCandidate(cand, evidence);       // pure
});

const ORDER = ['shipped-but-early','approved-but-stranded','dead-on-arrival','inconclusive'];
const MAX_ROWS = 20;                                          // matches inboxStalePlansDrillIn S4 cap
// group proposals by category; render in ORDER; count rows across ALL groups;
// once rows === MAX_ROWS stop and emit "  … and N more\n".
// per row, stripCtl EVERY attacker-influenceable field:
//   const plan = stripCtl(p.plan);
//   const action = stripCtl(p.proposedAction || 'none');
//   const ev = (p.evidence || []).map(stripCtl).join('; ');
//   text += `  • ${plan} → ${action}  (${ev})\n`;
// category headers: `\n${cat} (${groupCount})\n` (also stripCtl-safe — constant strings).
text += '\n\n\n';                                             // trailing newlines (screen convention)

return {
  text,
  ask: { questions: [{
    question: 'Verified proposals (read-only).',
    header: 'Stale plans',
    options: [{ label: '◀ Back', description: 'Return to the stale list' }],
  }]},
  actions: { '◀ Back': 'inbox stale' },                       // ONLY option; routes back to the drill-in
};
```

Header text: `Inbox ▸ Verified proposals (${proposals.length})` + `─` rule, then
the grouped body, then the empty-state `  No proposals.` when `proposals.length === 0`.
No `inputMode`, no digit key, no write/move/gate.

**`route()` inbox case (lines ~919-921):** add the `verify` branch BEFORE `stale`:
```
case 'inbox':
  if (args[1] === 'verify') return inboxVerifyProposals(projectPath);
  if (args[1] === 'stale')  return inboxStalePlansDrillIn(projectPath);
  return dashboardPipeline(projectPath);   // unknown inbox subcommand → safe default
```

**Exports (lines ~969-990):** add `inboxVerifyProposals` to the screen-renderers block.

### 6.3 File: `tests/stale-classifier.test.js` — CREATE

`node:test` (`describe`/`it`/`assert`). Imports both
`require('../src/lib/stale-detector.js')` and `require('../src/lib/menu-screens.js')`.
Covers ALL SP3 behaviour except the narrowed cheap-scan static guard (§6.4).
Uses a sandbox helper (mirror `stale-detector-cheap.test.js`’s `makeSandbox` +
`afterEach` cleanup) and an `execFileSync`/`execSync` spy on the `child_process`
singleton (replace + restore in try/finally).

| # | `describe` / `it` | Asserts |
|---|---|---|
| 1 | classifier — shipped-but-early | evidence{gitAvailable, slugMatchAfterEntry:true, filesModifiedAfterEntry:true, allFilesExist:true, approvedBy:null} ⇒ category `shipped-but-early`, action `archive-to-done` (M1,M2) |
| 2 | classifier — approved-but-stranded | evidence{approvedBy:'human', filesModifiedAfterEntry:true} ⇒ `approved-but-stranded`, `advance-via-reconciliation` (NOT approvePlan) (M1,M3) |
| 3 | classifier — dead-on-arrival default revert | evidence{anyFileMissing:true, slugMatchCommits:[], approvedBy:null, explicitlyRejected:false} ⇒ `dead-on-arrival`, `revert` (M1,M4) |
| 4 | classifier — dead-on-arrival delete only when explicitlyRejected | same as #3 + `explicitlyRejected:true` ⇒ `delete` (M4) |
| 5 | classifier — age-only inconclusive | candidate{signals:['advisory:age']}, evidence{allFilesExist:true, slugMatchCommits:[], filesModifiedAfterEntry:false, slugMatchAfterEntry:false} ⇒ `inconclusive`, `proposedAction === null` (M1,M5) |
| 6 | classifier — gitAvailable:false ⇒ inconclusive | evidence{gitAvailable:false} ⇒ `inconclusive`, null, evidence[] mentions git unavailable (M5/M6) |
| 7 | classifier — proposal shape | `Object.keys(p).sort()` === `['category','evidence','plan','proposedAction']`; `Array.isArray(p.evidence)`; `p.plan === candidate.plan` (M1,M7, typedef) |
| 8 | classifier — purity / no side effects | spy fs.writeFileSync + all `cp` methods; run classify ⇒ none fired; input objects unmutated (M7) |
| 9 | verify — git IS invoked on verify | spy `cp.execFileSync` returns canned stdout; `verifyStaleCandidate(cand, sandbox)` ⇒ execFileSync called ≥1; returns object with `gitAvailable:true` and the documented keys (M6) |
| 10 | verify — gitAvailable:false on missing git | spy `cp.execFileSync` throws `Object.assign(new Error('ENOENT'),{code:'ENOENT'})` ⇒ evidence.gitAvailable === false, no throw (Risk R2) |
| 11 | verify — NOT called during scan; ONLY via menu | spy `cp.execFileSync`/`execSync`; call `listStaleCandidates`/`scanCheapCandidates` ⇒ 0 git calls; then `route(['inbox','verify'], sandbox)` ⇒ ≥1 git call (M6, M8) |
| 12 | menu — 'Verify' routes to `inbox verify` | `inboxStalePlansDrillIn(sandbox)` with ≥1 candidate ⇒ `actions['Verify'] === 'inbox verify'`; NO key in `actions` is a digit (`/^\d/` test) (M8) |
| 13 | menu — inboxVerifyProposals renders grouped, Back→inbox stale | spy execFileSync (canned) ; `route(['inbox','verify'], sandbox)` ⇒ `{text,ask,actions}`; `actions['◀ Back'] === 'inbox stale'`; only 1 option; no digit key; text non-empty (M8) |
| 14 | no-side-effects across verify+classify+render | spy fs.writeFileSync/renameSync/rmSync (assert NOT called) while allowing read-only `cp.execFileSync`; run `route(['inbox','verify'], sandbox)` ⇒ no write/move/delete; no gate file touched (M7) |

Determinism: menu/routing tests stub `cp.execFileSync` (canned/empty stdout) so no
real git is required and classification is fixed; classifier tests pass evidence
fixtures directly (no git at all). Every test has ≥1 meaningful assertion; spies
restored in `finally`.

### 6.4 File: `tests/stale-detector-cheap.test.js` — MODIFY (narrow static guard, Decision C)

**Action:** MODIFY exactly ONE `it` (current lines ~280-289). Everything else in
the file is unchanged — in particular the behavioral spy (lines ~251-278) stays as
the primary behavioral guard, and the Scenario 2 `approved_by` static guard
(lines 201-205) is untouched (the cheap pass still reads no marker; the new
`approved_by` read lives in `verifyStaleCandidate`, which is OUTSIDE the slice).

Rewrite the body and rename the `it`:

```js
it('static: scanCheapCandidates function body is subprocess-free', () => {
  const src = fs.readFileSync(MODULE_PATH, 'utf8');
  const fnStart = src.indexOf('function scanCheapCandidates(');
  const exportsStart = src.indexOf('\nmodule.exports');
  // Narrow to the scanCheapCandidates body. If either marker is absent
  // (function renamed, exports moved), fall back to the FULL source so any
  // regression still fails loudly rather than silently passing.
  const fnBody = (fnStart !== -1 && exportsStart !== -1 && exportsStart > fnStart)
    ? src.slice(fnStart, exportsStart)
    : src;
  assert.ok(!fnBody.includes("require('child_process')"), 'scan must not require child_process');
  assert.ok(!fnBody.includes('require("child_process")'), 'scan must not require child_process');
  assert.ok(!fnBody.includes('execSync'),  'no execSync in scan body');
  assert.ok(!fnBody.includes('spawnSync'), 'no spawnSync in scan body');
  assert.ok(!fnBody.includes('execFile'),  'no execFile in scan body');
  assert.ok(!/\bexec\s*\(/.test(fnBody),   'no exec( call in scan body');
  assert.ok(!/\bspawn\s*\(/.test(fnBody),  'no spawn( call in scan body');
});
```

Because `verifyStaleCandidate`/`classifyStaleCandidate` are defined ABOVE
`function scanCheapCandidates(` (§6.1 placement constraint), their `execFileSync`
sits before `fnStart` and is excluded from `fnBody`. Ship this change in the SAME
commit as the `stale-detector.js` source change (Risk R3); verify locally with
`node --test tests/stale-detector-cheap.test.js`.

### 6.5 Decisions Taken Under Ambiguity (Step 5/6 — PLAN/DESIGN additions)

> The existing F2/C/F3 + locked decisions above are unchanged. These are the
> residual-ambiguity calls made at the PLAN/DESIGN stage; wrong calls are caught
> at review and kicked back (no-stub rule).

- **Stage-entry date = oldest commit TOUCHING `plans/<stage>/<slug>.md` at its
  CURRENT path, via `git log --format=%ct -- <planPosix>` taking the LAST line —
  NO `--follow`.** `--follow` would chase the rename chain back to the plan's
  birth in a prior stage directory, making "files modified after stage entry"
  trivially true and over-firing `shipped-but-early`. The touch-based oldest
  commit at the current path is robust to add-vs-rename detection ambiguity
  (unlike `--diff-filter=A`, which a rename-detected `git mv` can report as `R`
  and thus return empty). If the path is untracked/uncommitted ⇒ `stageEntryEpoch
  = null` ⇒ neither "after entry" predicate can be true ⇒ conservative
  `inconclusive` (never a false `shipped`). This is the safe failure direction.

- **Git shell-safety = `execFileSync('git', [argv])`, regex applied in JS.** No
  slug/path/message is ever interpolated into a shell string; git is spawned with
  no shell (argv array), so shell metacharacters cannot inject. The slug is
  additionally regex-escaped (`/[.*+?^${}()|[\]\\]/g`) before the `\bslug\b`
  case-insensitive JS match against git stdout. `timeout:5000`,
  `maxBuffer:16MiB`, `windowsHide:true`, `stdio:['ignore','pipe','ignore']` bound
  hangs/memory and suppress git stderr.

- **Date comparisons use `%ct` (UNIX epoch integer), not `%cI`/ISO strings.** ISO
  strings carry per-commit timezone offsets and do not compare correctly
  lexicographically; integer epochs do. Evidence DISPLAY derives `YYYY-MM-DD` from
  the epoch in JS.

- **`explicitlyRejected` defaults to `false` in SP3.** No "rejected" marker exists
  anywhere in the current pipeline, and inventing one that nothing writes would be
  speculative. The field is kept in the `StaleEvidence` shape and the pure
  classifier honours `=== true` (so `dead-on-arrival` ⇒ `delete` is unit-tested
  with a synthetic fixture), but `verifyStaleCandidate` always emits `false` for
  now ⇒ in practice every `dead-on-arrival` proposal is `revert` (reversible-first).
  Wiring a real rejection source is explicit future work (SP4+), out of SP3 scope.

- **Slug-match history is capped at `-n 2000` commits.** Bounds cost/memory of the
  read on large repos; 2000 commits comfortably covers any plan's relevant window.
  If a match sits beyond the cap it is simply not found ⇒ weaker evidence ⇒
  conservative classification, never a crash.

- **`verifyStaleCandidate` degrades, never throws, on data faults.** Unreadable
  plan file ⇒ empty content (no declared files, no approvedBy). Git-binary missing
  / not-a-repo / timeout ⇒ `gitAvailable:false`. Per-path query failure ⇒ that
  datum is null. Only genuine MISUSE (bad `candidate`/`root` argument types)
  throws `TypeError` — consistent with `scanCheapCandidates`.

- **`'Verify'` option is conditional on `candidates.length > 0`.** An empty stale
  list offers only `◀ Back` (verifying nothing is pointless); a non-empty list
  offers `Verify` + `◀ Back` (2 options, within the AskUserQuestion 4-cap).

### 6.6 Acceptance-Criteria → Implementation → Test Matrix

Every success metric (M1–M8; M8 is the verify-reachability metric) maps to an
implementation element AND ≥1 test.

| AC | Requirement | Implemented in | Test (file · #) |
|---|---|---|---|
| **M1** | classifier returns `{category, proposedAction, evidence[]}` for all 4 categories | `classifyStaleCandidate` decision ladder (§6.1) | `stale-classifier.test.js` #1,#2,#3,#5,#7 |
| **M2** | `shipped-but-early` ⇒ `archive-to-done` | classifier branch 3 (§6.1) | `stale-classifier.test.js` #1 |
| **M3** | `approved-but-stranded` ⇒ `advance-via-reconciliation` (NOT approvePlan) | classifier branch 2 (§6.1) | `stale-classifier.test.js` #2 |
| **M4** | `dead-on-arrival` default `revert`; `delete` only iff `explicitlyRejected===true` | classifier branch 1 (§6.1) | `stale-classifier.test.js` #3,#4 |
| **M5** | age-only / no evidence ⇒ `inconclusive`, `proposedAction:null`, not actionable | classifier branch 0 + 4 (§6.1) | `stale-classifier.test.js` #5,#6 |
| **M6** | `verifyStaleCandidate` uses `child_process`, isolated to `stale-detector.js`, never on hot path | `verifyStaleCandidate` (§6.1); sole call site `inboxVerifyProposals` (§6.2) | `stale-classifier.test.js` #9,#10,#11; `stale-detector-cheap.test.js` behavioral spy (unchanged) |
| **M7** | verifier+classifier produce proposals only — no write/move/gate; locked shape | pure `classifyStaleCandidate`; read-only `verifyStaleCandidate`; read-only `inboxVerifyProposals` (§6.1,§6.2) | `stale-classifier.test.js` #7,#8,#14 |
| **M8** | `'Verify'`→`inbox verify`→`inboxVerifyProposals`; grouped read-only; `◀ Back`→`inbox stale`; NO digit key | `inboxStalePlansDrillIn` Verify label + `route()` branch + `inboxVerifyProposals` (§6.2) | `stale-classifier.test.js` #11,#12,#13 |
| **R3** | SP1 static guard narrowed atomically | `scanCheapCandidates`-body slice (§6.4) | `stale-detector-cheap.test.js` narrowed `it` |
| **Dep** | `StaleProposal` typedef exported for SP4 | typedef block (§6.1) | type-only (consumed by SP4) |

### 6.7 Security Review

- **No shell injection:** `execFileSync('git', [argv])` only — no `exec`, no shell
  string, no slug/path interpolation. Slug regex-escaped; matched in JS. ✔
- **No path traversal:** plan fs path built from `candidate.stage`/`candidate.plan`
  (both originate from `scanCheapCandidates`, which derives slug from a
  `readdirSync` filename and stage from the frozen `GATE_SOURCE_STAGES`); declared
  files checked via the existing `declaredFileExists`, which already strips
  `.`/`..` segments and pins under `root`. ✔
- **Control-char / ANSI spoofing:** every attacker-influenceable field rendered by
  `inboxVerifyProposals` (plan slug, proposedAction, each evidence line) passes
  through the module-scope `stripCtl`. ✔
- **Resource bounds:** git `timeout:5000`, `maxBuffer:16MiB`, `-n 2000` log cap;
  hot path untouched (no git, memoized cheap scan). ✔
- **No crash surface:** every git call try/catch'd; binary-missing/not-a-repo/
  timeout ⇒ `gitAvailable:false` ⇒ `inconclusive`; only argument misuse throws. ✔
- **No secret exposure / no state mutation:** read-only throughout; no writes to
  plan files, no plan moves, no gate markers, no hook changes. ✔
