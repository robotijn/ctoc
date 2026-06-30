---
iron_loop: true
approved_by: human
approved_at: 2026-06-30T05:49:03.771Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-06-29T15:39:40.928Z
gate_crossed: functional → implementation
---

---
title: "SP1 — Cheap stale-plan flag on menu open"
created: "2026-06-15T00:00:00Z"
priority: MEDIUM
type: feature
parent_vision: automated-stale-plan-detection
program: ctoc-pipeline-hygiene
order: 1
depends_on: []
files:
  - src/lib/stale-detector.js
  - tests/stale-detector-cheap.test.js
status: refined
acceptance_criteria_count: 7
risk_level: LOW
---

# SP1 — Cheap stale-plan flag on menu open

## 1. ASSESS — Problem Understanding

### Business Context

Plans rot in their stage after their work ships and nobody notices. On 2026-06-15 four `functional/` and ten `review/` plans were misreported as live backlog for approximately 31 days — every dashboard open counted them as work-in-flight when they had already shipped in v6.1.x–v6.3.x. The current `getInboxCounts()` in `src/lib/inbox.js` surfaces questions, decisions, and plans-at-gates, but has no concept of "has this plan's work already shipped?" It is blind to inactivity and to missing declared files — the two cheap, filesystem-only signals this slice adds. (An earlier draft also proposed a `marker-in-source-stage` signal, but the `approved_by` marker carries zero discriminating power at the gate-source stages — see §2 Signal Scope — so it is not used.)

### Current State

`src/lib/inbox.js` exports `getInboxCounts()`, which calls `listPlansAtGates()` to count every plan in `functional/`, `implementation/`, and `review/` directories (gate source stages per `HUMAN_GATE_SOURCE_STAGES`). No signal distinguishes a legitimately in-flight plan from a phantom plan whose work has long shipped. Detection today requires a manual cross-check of plan files against the git log and the file tree — the exact process that took hours on 2026-06-15.

### Impact

Phantom backlog erodes the dashboard's credibility as a single source of truth. When the overview shows "10 review plans pending," but 10 of them shipped months ago, users stop trusting the counts and stop using the dashboard to manage work. Trust, once lost to false positives, is hard to recover — hence the HYBRID detection decision (evidence-based drives action; age alone never does).

## 2. ALIGN — Business Alignment

### Business Goals

1. Surface stale plan candidates on every menu open using only filesystem reads (zero git calls, zero subprocess invocations) so the hot-path latency stays imperceptibly fast.
2. Create a standalone, independently-testable module `src/lib/stale-detector.js` that `inbox.js` consumes in SP2, keeping concerns separated.
3. Never act on age alone — advisory signals are surfaced but never upgrade a plan to actionable-eligible without a corroborating evidence signal.

### Signal Scope — Actionable vs. Advisory

The cheap pass emits exactly two signals:

- **`missing-files` (actionable, ALL three gate-source stages).** One or more paths
  in the plan's declared `files:` no longer exist on disk. A candidate is
  `actionable` if and only if its `signals` contains `missing-files`.
- **`advisory:age` (advisory-only, ALL three stages).** The plan file's mtime is
  older than the 14-day threshold. Advisory never makes a candidate actionable on
  its own (the HYBRID "age never acts alone" rule).

**No marker-based signal.** An earlier draft proposed a `marker-in-source-stage`
signal (`approved_by: human` found in a gate-source stage). It has been **dropped
entirely** from the cheap pass, because the marker carries **zero discriminating
power**, verified against `src/lib/actions.js`:

- `HUMAN_GATES` (lines 63-67) stamps `approved_by: human` (`addApprovalMarker`,
  lines 70-72) on exactly three crossings: `functional → implementation`,
  `implementation → todo`, `review → done`. **Every** plan that reaches
  `plans/review/` got there by crossing Gate 2 (`implementation → todo`), so
  `approved_by: human` is the **normal, expected pending-Gate-3 state of every
  review plan** — present on stranded and freshly-arrived plans alike. It cannot
  distinguish the two.
- `plans/functional/` plans carry **no** marker at all: `HUMAN_GATES` has **no**
  `vision → functional` entry, so the vision → functional transition stamps
  nothing. (Corrects the earlier prose that claimed a "Gate-0 marker.")
- `plans/implementation/` plans carry the Gate-1 marker (`functional →
  implementation`) by design — its presence is normal, not evidence of staleness.

Because the marker is present-by-design at review and absent-by-design at
functional, it is useless as a cheap staleness signal. **Review-stage stranding is
established by SP3's git-evidence** (the declared files were committed/shipped AND
the plan never advanced past `review/`) — not by the cheap pass. Shipped-but-stranded
plans at any stage are caught cheaply by `missing-files` (their declared files were
removed when the work shipped) and confirmed by SP3.

### Success Metrics

- **M1:** `scanCheapCandidates(root, { nowMs })` completes without invoking `child_process`, `execSync`, `spawnSync`, or any git binary — asserted by a spy/module-boundary test that fails loudly if the boundary is violated. The `nowMs` parameter (defaults to `Date.now()`) makes the age threshold deterministically testable without mtime manipulation.
- **M2:** The cheap pass flags NOTHING on `approved_by`/marker grounds. A healthy plan — all declared `files:` present and modified within the age threshold — is NOT returned as a candidate, regardless of whether it carries an `approved_by: human` marker and regardless of which frontmatter block that marker lives in, in ANY of the three gate-source stages. (Regression guard for the F1 fix: the dropped `marker-in-source-stage` signal must never reappear.)
- **M3:** A plan whose declared `files:` array lists one or more paths that no longer exist on disk is returned with a `missing-files` signal and is ACTIONABLE-eligible (`actionable === true`).
- **M4:** A plan that is only old (`nowMs - mtime > 14 days`, no other signals) is returned with only an `advisory:age` signal and is NOT marked actionable.
- **M5:** A plan that is fresh and has all declared files present yields an empty signals array and is not included as a candidate.
- **M6:** Both YAML `files:` syntaxes are parsed correctly: block-list syntax (`- path/to/file.js` on successive indented lines) and inline-array syntax (`files: [path/to/a.js, path/to/b.js]`). A test exists for each syntax. The `missing-files` signal must not silently fail on inline arrays.
- **M7:** All path construction in the module uses `path.join()` — no string concatenation — so the module is cross-platform on Windows, macOS, and Linux.

### Stakeholders

- CTOC user opening the dashboard (benefits from accurate counts)
- SP2 (consumes `scanCheapCandidates` output to render the Inbox stream)
- SP5 (regression suite asserts SP1's negative and positive invariants)

### Constraints

- No git calls on the hot path. `child_process` must not be imported or invoked in `stale-detector.js`.
- Age threshold: 14 days since plan-file mtime (locked decision; tunable later via `.ctoc/settings` without changing the module's public contract). Age is **advisory and best-effort only** — git checkout rewrites file mtimes, so mtime reflects the last checkout or write, not when the plan was created or last genuinely modified. This is documented in the module JSDoc; the age signal is never acted on alone.
- `scanCheapCandidates` signature: `scanCheapCandidates(root, { nowMs } = {})` where `nowMs` defaults to `Date.now()`. This seam is required for SP5 testability (pass a past timestamp to simulate old plans without `fs.utimesSync`).
- Module is new (`src/lib/stale-detector.js`); `inbox.js` is only extended in SP2. SP1 does not modify `inbox.js`.
- Does not modify any hook, gate logic, or existing plan files.

## 3. CAPTURE — Acceptance Criteria

### User Stories

**As a** CTOC user opening the dashboard,
**I want** the Inbox to know how many plans are possibly stale,
**so that** I can decide whether to drill in and verify — without the menu-open latency increasing noticeably.

**As a** CTOC maintainer writing tests,
**I want** `scanCheapCandidates` to be independently testable with a temp-dir fixture and an injectable `nowMs`,
**so that** the cheap-detection contract never regresses silently and age scenarios do not require filesystem clock manipulation.

### BDD Scenarios

- [ ] **Scenario 1: Plan with missing declared files is flagged actionable**
  Given a plan file in `plans/functional/` whose frontmatter `files:` array lists `src/lib/nonexistent.js`
  And that file does not exist on disk
  When `scanCheapCandidates(root)` runs
  Then the plan is included in `candidates` with a `missing-files` signal
  And its `actionable` field is `true`

- [ ] **Scenario 2: A plan is never flagged on `approved_by`/marker grounds (F1 regression guard)**
  Given a fresh plan file that contains `approved_by: human` in its frontmatter
  And all files listed in its `files:` frontmatter exist on disk
  When `scanCheapCandidates(root)` runs — for the same fixture written in EACH of `plans/functional/`, `plans/implementation/`, and `plans/review/`
  Then the plan is NOT included in `candidates`
  And no candidate anywhere carries a marker-based signal (the signal does not exist)

- [ ] **Scenario 3: Age-only plan is advisory, never actionable**
  Given a plan file in `plans/implementation/` whose declared `files:` all exist on disk
  When `scanCheapCandidates(root, { nowMs: mtime + 15 * 24 * 3600 * 1000 + 1 })` runs (simulating 15 days elapsed)
  Then the plan is included in `candidates` with only an `advisory:age` signal
  And its `actionable` field is `false`

- [ ] **Scenario 4: Healthy fresh plan yields no signals**
  Given a plan file in `plans/functional/` modified within the last 14 days (nowMs within threshold)
  And all its declared `files:` exist on disk
  When `scanCheapCandidates(root)` runs
  Then the plan is NOT included in `candidates`

- [ ] **Scenario 5: No git binary invoked during cheap scan**
  Given a `plans/` directory with multiple plan files across stages
  When `scanCheapCandidates(root)` runs with a spy on `child_process.exec`, `execSync`, and `spawnSync`
  Then none of those spy methods are called
  And the function returns a valid `{candidates, count}` object

- [ ] **Scenario 6: Block-list YAML files: syntax parsed correctly**
  Given a plan file whose frontmatter declares `files:` as a YAML block list (each entry on its own `  - path` line)
  And one of the listed files does not exist on disk
  When `scanCheapCandidates(root)` runs
  Then the plan is included in `candidates` with a `missing-files` signal
  And the signal fires — the block-list syntax is not silently ignored

- [ ] **Scenario 7: Inline-array YAML files: syntax parsed correctly**
  Given a plan file whose frontmatter declares `files: [src/lib/a.js, src/lib/b.js]` on a single line
  And `src/lib/b.js` does not exist on disk
  When `scanCheapCandidates(root)` runs
  Then the plan is included in `candidates` with a `missing-files` signal
  And the signal fires — the inline-array syntax is not silently ignored

- [ ] **Scenario 8: `files:` in the second frontmatter block is still found (multi-block extraction)**
  Given an approved plan whose FIRST `---…---` block is the prepended approval marker (no `files:` key)
  And whose SECOND `---…---` block is the metadata block carrying `files:` with one missing entry
  When `scanCheapCandidates(root)` runs
  Then the plan is included in `candidates` with a `missing-files` signal
  And the signal fires — `extractFrontmatterRegion` combined both blocks so `files:` was not missed

- [ ] **Scenario 9: `approved_by` merged into the metadata block does not hide `files:` (F3)**
  Given a plan whose single metadata block contains BOTH `approved_by: human` (merged in, as in `plans/done/A1-canvas-layer-impl.md:26-28`) AND `files:` with one missing entry
  When `scanCheapCandidates(root)` runs
  Then the plan is included in `candidates` with a `missing-files` signal
  And no marker-based signal is emitted

- [ ] **Scenario 10: A per-file IO fault mid-scan is skipped, not thrown (F2)**
  Given a `plans/` tree with several plan files, one of which becomes unreadable or vanishes between directory listing and read
  When `scanCheapCandidates(root)` runs
  Then the scan SKIPS the unreadable/vanished file and continues
  And returns a valid `{candidates, count}` object without throwing
  And a sibling plan with a `missing-files` signal is still flagged (the scan continued past the skip)
  And misuse (`root` not a non-empty string, or non-finite `nowMs`) still throws `TypeError`

### In Scope

- New module `src/lib/stale-detector.js` exporting `scanCheapCandidates(root, { nowMs } = {})`
- Cheap signal detection: `missing-files` (actionable, all gate source stages), `advisory:age` (advisory-only, all gate source stages)
- Return shape: `{ candidates: Array<{plan, stage, signals, actionable}>, count: number }`
- YAML `files:` parser supporting both block-list (`- item`) and inline-array (`[a, b, c]`) syntax
- Unit test file `tests/stale-detector-cheap.test.js` with fixtures in `os.tmpdir()` sandbox; injectable `nowMs` for age scenarios
- Cross-platform path handling throughout

### Out of Scope

- Git history lookup (SP3 — in-process verify layer)
- Rendering the stale count in the UI (SP2 — Inbox stream)
- Classification into shipped-but-early / approved-but-stranded / dead-on-arrival (SP3)
- Any cleanup execution (SP4)
- Modifying `inbox.js` — SP2 does that
- Modifying any hook, gate logic, or vision file
- Any `approved_by`/marker-based signal in the cheap pass — the marker carries zero discriminating power (every `review/` plan carries it from the Gate-2 `implementation → todo` crossing; `functional/` plans carry none). Review-stage stranding is established by SP3 git-evidence, not the cheap pass

## Risks

### Technical Risks

- **Risk:** Existing `parseFrontmatter` in `inbox.js` is scalar-only (simple `key: value` regex, confirmed by reading lines 123-137 of `src/lib/inbox.js`). It silently yields an empty string for block-list `files:` syntax and does not parse inline-array syntax at all. SP1 must implement its own sequence-aware parser for the `files:` key.
  - Likelihood: HIGH (confirmed by code review — the existing parser cannot handle either YAML list syntax)
  - Impact: HIGH (missing-files signal never fires if the list is not parsed as an array)
  - Mitigation: Implement a `parseFilesField(frontmatterText)` helper in `stale-detector.js` that handles both block-list and inline-array syntaxes. Cover both syntaxes with a dedicated test per syntax (M6). Do not reuse the scalar parser from `inbox.js`.

- **Risk:** `git checkout` rewrites file mtimes to the checkout timestamp, not the original commit time. An old plan checked out fresh will appear young; a long-running session where the plan was last written days ago may appear old even if the content is unchanged.
  - Likelihood: HIGH (inherent to how git manages the working tree)
  - Impact: LOW (age is advisory only; it is never acted on alone per the HYBRID decision; the caveat is documented)
  - Mitigation: Document in the module JSDoc that mtime is advisory and best-effort only. Inject `nowMs` parameter so tests control the "current time" reference without touching real clock or mtime.

### Business Risks

- **Risk:** 14-day advisory threshold produces false positives for legitimate long-lived plans (e.g. a plan in active use spanning a sprint boundary).
  - Likelihood: LOW (the HYBRID decision ensures age alone never triggers action — it is advisory only)
  - Impact: LOW (advisory flag adds noise to the drill-in list but triggers no action without SP3 verification)
  - Mitigation: Document in module JSDoc that age threshold is advisory, not actionable, and wire it to a `.ctoc/settings` key stub for future tuning without code change.

### Dependency Risks

- **Risk:** SP2 consumes this module before SP1 is fully validated; if the return shape changes, SP2 breaks.
  - Likelihood: LOW (return shape is declared in this plan and locked)
  - Impact: MEDIUM (requires SP2 test update)
  - Mitigation: Export the return-shape type as a JSDoc typedef at the top of `stale-detector.js` so SP2 has a single reference to check against.

## Priority

**Priority: MEDIUM** (Score: 6/9)
- Dependency: HIGH (3) — SP2, SP3, SP4, SP5 all depend on this; it is the foundation of the feature chain
- Business Impact: MEDIUM (2) — improves dashboard accuracy but the cleanup outcome depends on SP4
- Technical Risk: LOW (1) — filesystem reads are well-understood; the only subtle point is YAML sequence parsing

## 5. PLAN — Technical Approach (Iron Loop Step 5)

### 5.1 Module design

One new leaf module, `src/lib/stale-detector.js`, that depends on **only** the Node
built-ins `fs` and `path`. It does NOT `require('./inbox')`, does NOT
`require('child_process')`, and imports no project module. This keeps the cheap
scan a pure, deterministic, dependency-free leaf — the foundation SP2 consumes,
SP3 appends to, and SP5 imports for fixture validation.

The module is organized in four bands so SP3 can append `verifyStaleCandidate`
and `classifyStaleCandidate` below SP1's exports without touching SP1 code:

1. JSDoc typedefs (`StaleCandidate`, `CheapScanResult`) + constants.
2. Frontmatter helpers — `extractFrontmatterRegion` (multi-block) and
   `parseFilesField` (sequence-aware). No scalar `approved_by` parser — the cheap
   pass reads no marker (F1).
3. Signal detectors — pure helpers for each of the two signals.
4. Public `scanCheapCandidates` orchestrator + `module.exports`.

### 5.2 The critical integration subtlety — `files:` is not always in the first block

Confirmed by reading real approved plans (`plans/done/A1-canvas-layer-impl.md`,
the SP1 target itself): an approved plan has the approval marker **prepended as a
separate leading `---…---` block** (the `addApprovalMarker` pattern in
`actions.js:70-72`), so the file begins:

```
---
approved_by: human          ← BLOCK 1 (prepended at gate crossing — NO files: here)
approved_at: …
gate_crossed: …
---

---
title: …                    ← BLOCK 2 (original plan metadata — files: lives HERE)
files:
  - src/lib/stale-detector.js
status: refined
---
```

`inbox.js`'s `parseFrontmatter` (lines 123–137) matches **only the first**
`---…---` block with `/^---\n([\s\S]*?)\n---/`. On an approved plan that first
block contains the marker but **not** `files:` — so reusing it would (a) miss
`files:` entirely and never fire `missing-files` on approved plans, and (b) is
also scalar-only and cannot parse either YAML list syntax. This is the load-bearing
reason SP1 keeps its own multi-block extractor rather than importing `inbox.js`'s.

> **Note (F1):** SP1 no longer reads `approved_by` at all (the marker signal was
> dropped — §2). The SOLE remaining reason `extractFrontmatterRegion` exists is
> `files:` placement: because `files:` lives in the metadata block, which on an
> approved plan is the SECOND block, the cheap pass must combine blocks or it will
> be blind to `missing-files` on every approved plan. That is sufficient on its own
> to keep the multi-block extractor.

**Design response:** `extractFrontmatterRegion(content)` collects **every**
consecutive leading `---…---` block (skipping blank lines between blocks) and
concatenates their bodies into one combined frontmatter string. `parseFilesField`
operates on that combined string, so it finds `files:` regardless of which leading
block it lives in. The real shapes this must survive (both present in
`A1-canvas-layer-impl.md`):

- **Prepended marker block** — marker in BLOCK 1, `files:` in BLOCK 2 (lines 1-5 vs
  15-25 of `A1-canvas-layer-impl.md`).
- **Merged marker** — `approved_by` / `gate_crossed` merged INTO the metadata block
  alongside `files:` (lines 26-28 of `A1-canvas-layer-impl.md`).

In both shapes `extractFrontmatterRegion` yields a combined region containing
`files:`, so `parseFilesField` finds it and `missing-files` can fire. (A plan that
repeats `approved_by` across blocks is irrelevant now — no marker is read.)

### 5.3 Dependency graph

```
node:fs ─┐
node:path┤──▶ src/lib/stale-detector.js  (NEW, leaf — no project deps, no child_process)
                  │ exports: scanCheapCandidates, extractFrontmatterRegion,
                  │          parseFilesField, GATE_SOURCE_STAGES, AGE_THRESHOLD_MS
                  │
                  ├─ tested-by ▶ tests/stale-detector-cheap.test.js  (NEW)
                  ├─ consumed-by ▶ src/lib/inbox.js                  (SP2 — not this plan)
                  ├─ extended-by ▶ src/lib/stale-detector.js         (SP3 appends verify/classify)
                  └─ imported-by ▶ tests/stale-detection-regression.test.js (SP5)
```

No cycles. Dependencies flow inward (lib leaf depends only on built-ins). The
module is never imported by a hook or command in this slice.

### 5.4 Public API & return-shape typedef (JSDoc — the locked SP2/SP5 contract)

```js
/**
 * @typedef {('functional'|'implementation'|'review')} GateSourceStage
 *
 * @typedef {('missing-files'|'advisory:age')} StaleSignal
 *
 * @typedef {Object} StaleCandidate
 * @property {string}        plan        Plan slug = filename without `.md`
 *                                         (matches inbox.js listPlansAtGates).
 * @property {GateSourceStage} stage     The gate SOURCE stage it was found in.
 * @property {StaleSignal[]}  signals    Non-empty, deduped, canonical order:
 *                                         actionable (missing-files) first,
 *                                         advisory (advisory:age) last.
 * @property {boolean}        actionable true iff signals contains missing-files.
 *                                         advisory:age alone ⇒ false.
 *
 * @typedef {Object} CheapScanResult
 * @property {StaleCandidate[]} candidates  Plans (in gate source stages) that
 *                                           emitted ≥ 1 signal. Zero-signal plans
 *                                           are omitted entirely.
 * @property {number}          count       === candidates.length.
 */

/**
 * scanCheapCandidates(root, { nowMs } = {}) → CheapScanResult
 *
 * Filesystem-ONLY scan of plans/functional, plans/implementation, plans/review.
 * NEVER invokes git or any subprocess. mtime age is advisory & best-effort only
 * (git checkout rewrites mtimes); age never makes a candidate actionable alone.
 * Per-file IO faults (a plan file that vanishes or becomes unreadable mid-scan)
 * are skipped — the offending plan is omitted and the scan continues; the function
 * never throws on a structural or IO irregularity. Only misuse throws (see @throws).
 *
 * @param {string} root  Project root (directory containing `plans/`).
 * @param {{ nowMs?: number }} [options]  nowMs defaults to Date.now(); inject a
 *        timestamp to drive age scenarios deterministically (SP5 seam — no utimes).
 * @returns {CheapScanResult}
 * @throws {TypeError} if root is not a non-empty string, or nowMs is supplied and
 *         is not a finite number.
 */
```

The candidate object has **exactly these four keys** — `plan`, `stage`,
`signals`, `actionable`. No path, no parsed-files list, no mtime are added to the
shape (SP2 asserts on it, SP5 deep-checks it). SP3's `verifyStaleCandidate`
reconstructs the file path from `{plan, stage}` via
`path.join(root, 'plans', stage, plan + '.md')` and re-parses `files:` itself.

### 5.5 Signal-detection algorithm

For each `.md` file (excluding `.gitkeep`) in each of the three gate source
stages, build `signals` by pushing in this fixed evaluation order (which yields
the canonical order automatically):

1. **`missing-files` (actionable, ALL three stages).**
   `declared = parseFilesField(extractFrontmatterRegion(content))`. If
   `declared.length > 0` and **any** declared path is absent on disk, fire.
   Empty/absent `files:` ⇒ never fires. The cheap pass reads **no** `approved_by`
   marker (dropped in F1 — the marker has zero discriminating power; see §2).
2. **`advisory:age` (ADVISORY only, ALL three stages).**
   `if (nowMs - statSync(file).mtimeMs > AGE_THRESHOLD_MS)` where
   `AGE_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000`.

After building `signals`: if `signals.length === 0`, the plan is **not** a
candidate (M5). Otherwise push
`{ plan, stage, signals, actionable: signals.includes('missing-files') }`.
Finally `count = candidates.length`.

**Per-file IO containment (F2):** the per-file `readFileSync` (frontmatter) and
`statSync` (mtime) are each wrapped in a narrow `try/catch` scoped to that single
file, so a plan file that vanishes or becomes unreadable between `readdirSync` and
the read is **skipped** (omitted from `candidates`) and the scan continues. One bad
file never throws out of the scan. This is the IO-level counterpart of the
structural graceful-degradation rules (§6.1); it does NOT mask misuse — a bad
`root` or non-finite `nowMs` still throws `TypeError` before any per-file work.

**Determinism:** iterate stages in fixed gate order `[functional, implementation,
review]`; within a stage sort `readdirSync` results ascending (readdir order is
platform-dependent) so candidate ordering is stable for SP2 rendering and tests.

### 5.6 `parseFilesField(frontmatterText)` — sequence-aware parser

Returns `string[]` of declared file paths from the combined frontmatter region.
Handles both YAML syntaxes plus defensible edge cases:

- Locate the `files:` line via `/^files:[ \t]*(.*)$/m`; if absent → `[]`.
- Let `rest` = captured remainder after `files:` on that line, trimmed.
  - **Inline-array** — `rest` starts with `[`: take text between the first `[`
    and the last `]`, split on `,`, trim each, strip surrounding quotes, drop
    empties. `files: []` ⇒ `[]`.
  - **Scalar single value** — `rest` non-empty and not starting with `[`: treat
    as a one-element list (`files: src/lib/x.js`); strip quotes. (Documented
    tolerance; real plans use the two list forms.)
  - **Block-list** — `rest` empty: walk subsequent lines; each line matching
    `/^[ \t]*-[ \t]*(.+?)[ \t]*$/` is an item. From each captured item, first
    strip a trailing YAML line comment — a `#` preceded by whitespace through end
    of line (e.g. `  - src/lib/x.js  # note` ⇒ `src/lib/x.js`) — then trim, strip
    surrounding quotes, and drop empties. A `#` **not** preceded by whitespace is
    preserved as part of the path (so a hypothetical `a#b.js` is kept intact). Stop
    at the first line that is **not** a dash-item line (a new key such as
    `status:` or a blank line) — block sequences in plan frontmatter are
    contiguous. (F5: this makes `files:` robust to commented entries instead of
    treating the comment text as part of the filename and spuriously firing
    `missing-files`.)
- Each returned path is checked for existence cross-platform by splitting on
  `/[\\/]+/` and rejoining under `root` with `path.join(root, ...parts)`, so a
  POSIX-authored `src/lib/x.js` resolves on Windows. Leading separators are
  dropped (paths are treated as repo-root-relative).

### 5.7 Cross-platform & security notes

- **Cross-platform (M7):** `require('path')`; every path via `path.join(...)`;
  no string concatenation of separators; declared-file splitting on `/[\\/]+/`;
  tests use `os.tmpdir()`. No bash, no `execSync` for path work, no `~`.
- **Security:** the module is read-only — it `existsSync`/`statSync`/
  `readFileSync`s files under `root` and never writes, moves, or deletes. Declared
  paths come from developer-authored plan frontmatter (not external input) and are
  used only for existence checks under `root`, so path-traversal risk is nil (no
  read/write follows the join). No secrets, no `exec`, no untrusted object merge
  (results are plain objects/arrays with a fixed key set ⇒ no prototype-pollution
  surface).

## 6. DESIGN — File-by-File Implementation Blueprint (Iron Loop Step 6)

### 6.1 File: `src/lib/stale-detector.js` — **CREATE**

**Purpose:** Cheap, filesystem-only stale-plan candidate scan for the menu
hot-path. Leaf module; no project deps; no subprocess.

**Imports:** `const fs = require('fs');` · `const path = require('path');`
(nothing else).

**Constants:**
- `AGE_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000` — 14-day advisory threshold.
- `GATE_SOURCE_STAGES = Object.freeze(['functional', 'implementation', 'review'])`
  — SP1's own copy (inbox.js does **not** export `HUMAN_GATE_SOURCE_STAGES`;
  duplicating one frozen array keeps SP1 independent and avoids editing inbox.js,
  which is out of scope).

**Functions (with signatures):**
- `extractFrontmatterRegion(content: string) → string` — concatenate every
  consecutive leading `---…---` block body (§5.2 algorithm). No throw on a
  missing/unterminated block — returns `''`. Load-bearing: `files:` lives in the
  metadata block, which is NOT always the first `---…---` block (on an approved
  plan the first block is the prepended marker block), so multi-block extraction
  is required for `missing-files` to fire on approved plans.
- `parseFilesField(region: string) → string[]` — §5.6. No scalar `approved_by`
  parser exists in the module — the cheap pass reads no marker (F1).
- `scanCheapCandidates(root: string, { nowMs = Date.now() } = {}) → CheapScanResult`
  — §5.5 orchestrator; validates inputs and throws `TypeError` on misuse; skips and
  continues past per-file IO faults (F2).

**Graceful-degradation rules (explicit guards, NOT swallowing try/catch):**
- `root` missing/empty or non-string → `throw new TypeError(...)` (fail loud on misuse).
- `nowMs` supplied and not `Number.isFinite` → `throw new TypeError(...)`.
- `plans/` dir absent → return `{ candidates: [], count: 0 }`.
- A stage dir absent → skip that stage.
- A plan with no frontmatter / no `files:` / empty list → `declared = []` (no
  `missing-files`); age still computed. Never throws on structural irregularity.
- **Per-file IO fault containment (F2):** each per-file `readFileSync` (frontmatter)
  and `statSync` (mtime) is wrapped in a narrow `try/catch` scoped to that single
  file. If a plan file vanishes between `readdirSync` and the read, or is unreadable
  (permissions, a path that is now a directory, etc.), that one plan is **skipped**
  (omitted from `candidates`) and the scan continues — one bad file never throws out
  of the scan, so a single corrupt plan can never break the menu hot-path. This is
  the IO-level counterpart of the structural guards above and is consistent with the
  graceful-on-structure stance. It is **not** a blanket swallow: the `try` wraps only
  the two per-file syscalls, contains no control-flow that could hide a logic bug, and
  does NOT catch misuse (bad `root`/`nowMs` throw before any per-file work). Earlier
  this was wrongly deferred to SP2; SP1 now owns it (see Decisions).

**Exports:** `module.exports = { scanCheapCandidates, extractFrontmatterRegion, parseFilesField, GATE_SOURCE_STAGES, AGE_THRESHOLD_MS };`
(`extractFrontmatterRegion`/`parseFilesField` exported so SP5 can validate fixtures
through the real code path — compose as `parseFilesField(extractFrontmatterRegion(content))`;
constants exported so SP3 reuses them without re-declaring. `parseFrontmatter` is
gone — the cheap pass no longer reads any scalar marker, so a scalar parser would be
dead code, F1.)

### 6.2 File: `tests/stale-detector-cheap.test.js` — **CREATE**

**Framework:** `node:test` (`describe`/`it`) + `node:assert/strict`. Run via
`node --test tests/*.test.js`.

**Sandbox harness (fail-loud, hermetic, cross-platform):**
- `makeSandbox()` → `path.join(os.tmpdir(), 'ctoc-sp1-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2))`; `fs.mkdirSync(..., { recursive: true })`.
- `writePlan(sandbox, stage, slug, { markerStyle='none', filesSyntax='block'|'inline'|'none', files=[], comment=false })` — writes `plans/<stage>/<slug>.md`. `markerStyle` reproduces the real-world frontmatter shapes (verified against `plans/done/A1-canvas-layer-impl.md`):
  - `'none'` — single metadata block only, no `approved_by`.
  - `'prepended'` — a separate leading `---\napproved_by: human\napproved_at: …\ngate_crossed: … → …\n---\n` block, then the metadata block carrying `files:` (the `addApprovalMarker` two-block shape — exercises §5.2 / Scenario 8).
  - `'merged'` — a single metadata block containing BOTH `files:` and `approved_by: human` merged in (the A1:26-28 shape — exercises Scenario 9 / F3).
  When `comment=true` and `filesSyntax==='block'`, one block-list entry is written with a trailing `  # note` to exercise the F5 comment-stripping branch.
- `touchTarget(sandbox, relPath)` — `mkdir -p` + write an empty file at `path.join(sandbox, ...relPath.split('/'))` so declared files "exist".
- `breakPlanFile(sandbox, stage, slug)` — for the F2 IO-fault test: after `writePlan`, delete the plan file and create a directory at the same path, so `readFileSync` throws `EISDIR`. This is a portable, cross-platform way to force a per-file read fault without relying on chmod semantics (which differ across OSes and are a no-op for root). The test asserts the scan returns a valid `{candidates, count}`, does not throw, and omits the broken slug while still flagging a sibling `missing-files` plan.
- `afterEach` → `fs.rmSync(sandbox, { recursive: true, force: true })`.

**Every test asserts concretely and fails loudly** — no empty catches, no
assertion-free bodies, no early returns. The one malformed-frontmatter test
asserts the *graceful* outcome (valid shape, no throw) via positive assertions,
not by swallowing an error.

### 6.3 Acceptance-Criteria → Implementation → Test matrix

| AC / BDD | Implementation element | Test case in `stale-detector-cheap.test.js` |
|---|---|---|
| **M1 / Scenario 5** — no git/subprocess | module imports no `child_process`; pure fs | (a) **behavioral spy:** monkeypatch `child_process.{exec,execSync,spawn,spawnSync,execFile,execFileSync}` to throw, `delete require.cache` for the module, require fresh, run scan over a multi-stage fixture, assert valid `{candidates,count}` and **no spy fired**; restore in teardown. (b) **static:** read the source, assert no `require('child_process')` and no `execSync/spawnSync/exec(/spawn(` token. |
| **M2 / Scenario 2** — nothing flagged on marker grounds (F1 guard) | no marker detector exists; `signals ∈ {missing-files, advisory:age}` only | fresh plan carrying `approved_by: human` + all files present, written in EACH stage (`functional/`, `implementation/`, `review/`) ⇒ slug absent from `candidates`; assert no candidate's `signals` contains any marker token; **static:** assert the source contains no `'marker-in-source-stage'` and no `approved_by` token. |
| **M3 / Scenarios 1, 6, 7** — missing declared files ⇒ actionable | `missing-files` detector + `parseFilesField` | functional plan `files: [src/lib/nonexistent.js]`, file not created ⇒ candidate `signals.includes('missing-files')`, `actionable === true`. |
| **M4 / Scenario 3** — age-only advisory, never actionable | `advisory:age` via `nowMs` seam | implementation plan, files present; call with `{ nowMs: mtimeMs + 15*24*3600*1000 + 1 }` ⇒ candidate `signals` **deep-equals** `['advisory:age']`, `actionable === false`. |
| **M5 / Scenario 4** — fresh healthy ⇒ no candidate | zero-signal plans omitted | functional plan, files present, `nowMs` within 14d of mtime ⇒ slug absent from `candidates`. |
| **M6 / Scenarios 6, 7** — block-list & inline parsed | `parseFilesField` block + inline branches | block-list `files:` with one missing entry ⇒ `missing-files` fires; `files: [a.js, b.js]` with only `a.js` present ⇒ `missing-files` fires. + direct `parseFilesField` unit test per syntax. |
| **M7** — cross-platform `path.join` | `path.join` throughout; declared-path split `/[\\/]+/` | static: source uses `require('path')` + `path.join`, contains no `'/plans'`/`+ '/'` concat; behavioral coverage is implicit (all sandbox tests run on the host OS). |
| **Scenario 8** — `files:` in 2nd block found | `extractFrontmatterRegion` multi-block | approved plan w/ **prepended** marker block AND metadata-block block-list `files:` with a missing entry ⇒ `signals.includes('missing-files')` (proves §5.2 combined-region parsing). |
| **Scenario 9** — merged-block `approved_by` (F3) | `extractFrontmatterRegion` + `parseFilesField` | plan w/ a single metadata block containing BOTH `approved_by: human` (merged, A1:26-28 shape) AND `files:` w/ a missing entry ⇒ `missing-files` fires; assert NO marker signal emitted. |
| **Scenario 10** — per-file IO fault skipped (F2) | per-file `try/catch` around `readFileSync`/`statSync` | multi-plan fixture; `breakPlanFile` replaces one plan file with a directory (forces `EISDIR` on read) ⇒ scan returns valid `{candidates,count}`, does NOT throw, broken slug absent, and a sibling `missing-files` plan is still flagged (proves continue-after-skip). |

**Additional regression/edge tests (beyond the numbered ACs):**
- Combined signals & ordering: a plan with missing-files AND old mtime ⇒ `signals` deep-equals `['missing-files','advisory:age']`, `actionable === true`.
- `count === candidates.length` invariant on a mixed fixture.
- `plans/` absent ⇒ `{ candidates: [], count: 0 }`; one stage dir absent ⇒ no throw; `.gitkeep` ignored.
- `files: []` and absent `files:` ⇒ no `missing-files` signal.
- `parseFilesField` direct units: block, inline, `[]`, quoted entries (`- "a.js"`, `['a.js']`), scalar single value, **trailing block-list comment** (`- a.js  # note` ⇒ `a.js`), `#` not preceded by whitespace preserved as part of the path, absent key ⇒ `[]`.
- Input validation: `scanCheapCandidates(null)` and `scanCheapCandidates('')` throw `TypeError`; `scanCheapCandidates(sandbox, { nowMs: 'x' })` throws `TypeError`; misuse throws even when a per-file fault also exists (validation precedes per-file work).
- Malformed/empty frontmatter plan ⇒ graceful (age-only or no candidate), never throws.
- **F1 negative guard:** no fixture in any stage is ever flagged solely because it carries `approved_by: human`; the only ways into `candidates` are `missing-files` and `advisory:age`.

**Coverage target:** ≥ 80% line & branch on `stale-detector.js`; every signal
branch, both `parseFilesField` syntaxes, both throw paths exercised.

### 6.4 Implementation order (dependency-respecting; executor does TDD-red first)

1. `tests/stale-detector-cheap.test.js` — write failing tests first (Iron Loop Step 8 TEST).
2. `src/lib/stale-detector.js` — constants → `extractFrontmatterRegion` →
   `parseFilesField` → signal detectors (`missing-files`, `advisory:age`) →
   `scanCheapCandidates` (with per-file IO containment) → exports, until the suite
   is green (Step 10 IMPLEMENT).

## Decisions Taken Under Ambiguity

- **Age threshold:** 14 days since plan-file mtime. Long enough to exclude active in-flight work; short enough to catch the 31-day rot class observed. Tunable via `.ctoc/settings` in a future patch without changing the module contract.
- **"Inactivity" source:** plan-file mtime (single `fs.stat` per file), not per-step timestamps — keeps the cheap pass truly cheap. Mtime is advisory only due to git-checkout rewrite behavior (documented in JSDoc).
- **Module placement:** new `src/lib/stale-detector.js`, not an extension of `inbox.js`. `inbox.js` is extended in SP2 only. Keeps SP1 independently testable.
- **YAML `files:` parsing:** implement a `parseFilesField()` helper inside `stale-detector.js` that handles both block-list (`  - path`) and inline-array (`[a, b, c]`) syntaxes. Two tests, one per syntax. Do not reuse the scalar-only parser from `inbox.js` which silently fails on both list forms.
- **`marker-in-source-stage` DROPPED entirely (F1, Gate-2 kickback decision — human chose option (a) DROP):** the cheap pass emits no `approved_by`/marker-based signal at all. Rationale, verified against `src/lib/actions.js`: `HUMAN_GATES = { functional→implementation, implementation→todo, review→done }` (lines 63-67) and `addApprovalMarker` (lines 70-72) stamp `approved_by: human` on each of those three crossings only. Therefore (a) **every** plan in `plans/review/` carries `approved_by: human` from crossing Gate 2 (`implementation → todo`) — it is the NORMAL pending-Gate-3 state, present on stranded and freshly-arrived review plans alike, so the marker has **zero discriminating power** at review; and (b) `plans/functional/` plans carry **no** marker (there is no `vision → functional` entry in `HUMAN_GATES`). The marker is thus present-by-design where we'd want to flag and absent-by-design elsewhere — useless as a cheap signal. Real-world confirmation of the marker's normal presence: `plans/done/A1-canvas-layer-impl.md:26-28` carries `approved_by: human` / `gate_crossed: implementation → todo` merged into its metadata block as the ordinary record of a crossed gate. **Review-stage stranding is established by SP3's git-evidence** (declared files committed/shipped AND the plan never advanced past `review/`), not by the cheap pass. The human explicitly rejected demotion and `gate_crossed` discrimination in favour of dropping the signal.
- **`approved_by` parse dropped; `extractFrontmatterRegion` KEPT (F1 follow-through):** with no marker signal, the scalar `parseFrontmatter` helper that read `approved_by` would be dead code, so it is removed from the module and from the exports. `extractFrontmatterRegion` is **kept and remains load-bearing**: `files:` lives in the metadata block, which is NOT always the first `---…---` block — on an approved plan the first block is the prepended marker block (no `files:`). Reading only the first block (as `inbox.js`'s `parseFrontmatter` does, lines 123-137) would miss `files:` and `missing-files` would never fire on approved plans. Multi-block extraction is therefore still required for `missing-files`.
- **Per-file IO-fault containment owned by SP1 (F2, Gate-2 kickback decision):** an earlier draft deferred IO-fault containment to SP2 ("SP1 stays fail-loud"). That was wrong — a single unreadable/vanished plan file would throw out of the entire cheap scan and break the menu hot-path on every open. SP1 now wraps each per-file `readFileSync`/`statSync` in a narrow `try/catch` scoped to that one file: the offending plan is skipped and the scan continues, returning a valid `{candidates, count}`. This is consistent with the graceful-on-structure stance and does NOT weaken fail-loud-on-misuse — a bad `root` or non-finite `nowMs` still throws `TypeError` before any per-file work begins. The catch wraps only the two syscalls and hides no logic-bug control flow.
- **Trailing block-list comment handling (F5):** `parseFilesField` strips a trailing YAML line comment from each block-list entry — a `#` preceded by whitespace through end of line (`  - src/lib/x.js  # note` ⇒ `src/lib/x.js`). A `#` not preceded by whitespace is preserved as part of the path. This makes the parser robust to commented `files:` entries rather than treating the comment text as part of the filename (which would spuriously fire `missing-files`). Covered by a direct `parseFilesField` unit test.
- **`nowMs` injection:** `scanCheapCandidates(root, { nowMs } = {})` where `nowMs` defaults to `Date.now()`. Required testability seam for SP5; eliminates dependency on `fs.utimesSync` for age scenarios in tests.

### Decisions taken during technical planning (Steps 5–6)

- **Combined multi-block frontmatter region (the load-bearing parser decision):** approved plans carry the approval marker in a *separate prepended* `---…---` block (the `addApprovalMarker` pattern; confirmed in `plans/done/A1-canvas-layer-impl.md:1-5` and in the SP1 target's own header), OR merged into the metadata block (also shown in `A1-canvas-layer-impl.md:26-28`). Either way, `files:` is a **metadata-block** key, and on a prepended-marker plan that block is the SECOND `---…---` block. `inbox.js`'s `parseFrontmatter` reads only the FIRST block (lines 123-137), so on an approved plan it would miss `files:` entirely — `missing-files` would never fire on approved plans. SP1 therefore implements `extractFrontmatterRegion()` to concatenate **all** consecutive leading `---…---` blocks and runs `parseFilesField` over the combined string. After F1 dropped the `approved_by` reader, this is the SOLE remaining consumer of multi-block extraction — and it is independently sufficient to justify keeping it: without it, `missing-files` is blind to every approved plan. It also explains why `inbox.js`'s scalar, first-block-only parser cannot be reused.
- **Own `GATE_SOURCE_STAGES` constant, not an import:** `inbox.js` does not export `HUMAN_GATE_SOURCE_STAGES`, and editing `inbox.js` is out of scope (SP2 owns it). SP1 declares its own frozen `['functional','implementation','review']`. Minor duplication is accepted to keep SP1 an independent leaf and avoid an out-of-scope edit.
- **Candidate shape frozen to exactly four keys** — `{plan, stage, signals, actionable}`. No `path`, no parsed-`files`, no `mtime` added. SP2 asserts the shape and SP5 deep-checks it; SP3 reconstructs the file path from `{plan, stage}` and re-parses `files:` itself. `plan` is the slug (filename without `.md`), matching `inbox.js` `listPlansAtGates`.
- **`count = candidates.length`** (total candidates, including advisory-only ones) — consistent with SP2's "N possibly-stale plans" label, which is deliberately inclusive of advisory candidates. A zero-signal plan is never a candidate, so it never contributes to `count`.
- **Signal canonical order** `['missing-files','advisory:age']` — produced naturally by the fixed evaluation order; the actionable signal first, advisory last. Tests assert membership for most cases and deep-equality for the single-signal and combined (`missing-files` + `advisory:age`) cases.
- **`actionable` rule:** `true` iff `signals` contains `missing-files` (the only actionable signal after F1). `advisory:age` alone ⇒ `actionable: false`. This is the code-level enforcement of the HYBRID "age never acts alone" principle.
- **No `approved_by` value matching:** removed with the marker signal (F1). The module reads no marker value at all; there is no `human`-equality check anywhere in the cheap pass.
- **Determinism:** stages iterated in fixed gate order; `readdirSync` results sorted ascending within each stage (readdir order is platform-dependent) so candidate ordering is stable across platforms and runs.
- **`parseFilesField` edge tolerances:** empty inline array `files: []` ⇒ `[]`; absent `files:` ⇒ `[]` (so `missing-files` cannot fire on a plan that declares none); block-list collection stops at the first non-dash line (frontmatter sequences are contiguous); a bare scalar `files: x` is tolerated as a one-element list; surrounding quotes are stripped. Declared paths are split on `/[\\/]+/` and rejoined under `root` via `path.join` so POSIX-authored paths resolve on Windows; leading separators are dropped (paths are repo-root-relative).
- **Fail-loud on misuse, graceful on structure AND on per-file IO faults:** misuse (`root` not a non-empty string; non-finite `nowMs`) throws `TypeError` before any per-file work. Structural irregularity (missing `plans/`, missing stage dir, missing/empty/malformed frontmatter) is handled by explicit guards returning empty/zero — never a swallowing `try/catch`. Per-file IO faults (a plan file vanishing or becoming unreadable mid-scan) are caught with a narrow per-file `try/catch` scoped to the single `readFileSync`/`statSync` (F2): the offending plan is skipped and the scan continues. This was previously — wrongly — deferred to SP2; deferring it meant one corrupt plan file could throw out of the whole cheap scan and break the menu hot-path. SP1 now owns containment so the cheap pass is self-contained, while still avoiding masking real logic bugs (the catch wraps only the two syscalls, never control flow).
- **Exports widened for downstream reuse without contract risk:** `extractFrontmatterRegion` and `parseFilesField` are exported (SP5 validates fixtures through the real code path — `parseFilesField(extractFrontmatterRegion(content))` — per its risk-mitigation note), and `GATE_SOURCE_STAGES` + `AGE_THRESHOLD_MS` are exported so SP3 reuses them without re-declaring magic numbers. `parseFrontmatter` is NOT exported (it no longer exists — F1 removed the only `approved_by` reader). `scanCheapCandidates` remains the sole primary entry point.
- **M1 asserted two ways:** a behavioral spy (monkeypatch `child_process` methods to throw, require the module fresh, assert none fired) as the durable regression guard SP3/SP5 depend on, plus a static source assertion (no `child_process` require, no subprocess tokens) as defense-in-depth. Both must pass.
- **In-flight SP1 self-reference is by-design, not special-cased:** when run against the live tree, SP1's own implementation plan declares `src/lib/stale-detector.js`, which does not exist until this plan ships — so a live scan would emit `missing-files` for SP1 itself. That is correct cheap-signal behavior; the HYBRID gate means SP3 git-evidence (no commit yet ⇒ `inconclusive`) prevents any action. Adding a self-exclusion would violate the locked cheap-only contract, so none is added. Tests use hermetic `os.tmpdir()` fixtures and are unaffected.
- **Acceptance-criteria recomposition (F1 / F2):** the old `marker-in-source-stage` success metric (former M2) is removed and the remaining metrics renumbered, so `acceptance_criteria_count` drops 8 → 7. The new behavioral guarantees from this kickback are captured as BDD scenarios + tests + Decisions rather than as numbered success metrics: F1's "never flagged on marker grounds" folds into the reframed M2 regression guard; F2's per-file IO containment is Scenario 10 + a §6.1 rule + this decision; F3's merged-block shape is Scenario 9; F5's comment handling is a `parseFilesField` edge test.

## Required downstream changes (from F1)

> A note for the FUTURE planning of SP2, SP3 and SP5 — this is NOT an edit to those plans.
> The cheap pass no longer emits `marker-in-source-stage`; the `StaleSignal` union is
> now `('missing-files'|'advisory:age')`. Downstream plans must align when they are
> planned:

- **SP2 (`getInboxCounts` stale stream — the immediate consumer):** SP2 extends
  `getInboxCounts()` with `scanCheapCandidates()` output, but its current BDD
  scenarios/examples still reference the dropped signal — `SP2:86`
  (`signals: ['marker-in-source-stage'], actionable: true`) and `SP2:105`
  ("one actionable (marker-in-source-stage)"). When SP2 is implementation-planned,
  replace those with `missing-files` / `advisory:age`; the cheap pass emits no
  marker signal, so any SP2 example asserting one would encode a state that can
  never occur.
- **SP3 (`classifyStaleCandidate` / in-process verify layer):** must NOT consume or
  branch on a `marker-in-source-stage` signal — it will never be present in a
  candidate's `signals`. Review-stage stranding must be established by **git-evidence**
  (the declared files were committed/shipped AND the plan never advanced past
  `review/`), not by any `approved_by` marker. SP3's "approved-but-stranded"
  classification must therefore derive from git history + stage, never from the marker.
- **SP5 (regression suite):** the positive invariant must NOT assert that any plan is
  flagged on `marker-in-source-stage` (or any `approved_by`-based) grounds. SP5's
  positive cases assert `missing-files` (cheap) and SP3 git-evidence (verify); its
  negative invariant must include the F1 regression guard — a fresh plan carrying
  `approved_by: human` (in any frontmatter block, in any stage) with all declared
  files present is NOT a candidate.
- **`StaleSignal` contract:** any downstream typedef, switch, or assertion referencing
  the signal union must use `('missing-files'|'advisory:age')`. SP3 may ADD new
  verify-layer signals (e.g. a `shipped` signal), but the `marker-in-source-stage`
  member must never be reintroduced into the cheap pass.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation
- [ ] Test error conditions
- [ ] Run tests - expect RED (failing)

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements
- [ ] Add error handling
- [ ] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review
