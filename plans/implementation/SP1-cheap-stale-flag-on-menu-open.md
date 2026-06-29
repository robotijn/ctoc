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
acceptance_criteria_count: 8
risk_level: LOW
---

# SP1 — Cheap stale-plan flag on menu open

## 1. ASSESS — Problem Understanding

### Business Context

Plans rot in their stage after their work ships and nobody notices. On 2026-06-15 four `functional/` and ten `review/` plans were misreported as live backlog for approximately 31 days — every dashboard open counted them as work-in-flight when they had already shipped in v6.1.x–v6.3.x. The current `getInboxCounts()` in `src/lib/inbox.js` surfaces questions, decisions, and plans-at-gates, but has no concept of "has this plan's work already shipped?" It is blind to inactivity, missing declared files, and the marker-in-source-stage anomaly (`approved_by: human` present while the plan still sits in a gate source directory).

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

The `marker-in-source-stage` actionable signal fires for **REVIEW STAGE ONLY** — `approved_by: human` found in a plan file sitting in `plans/review/`. This is the terminal gate source, so a marker there is unambiguous evidence the Gate 3 crossing was never executed.

Implementation-stage plans (`plans/implementation/`) legitimately carry a Gate-1 approval marker (`approved_by: human` stamped when the plan crossed Gate 1). That marker does NOT indicate staleness at the implementation stage — it is the expected state for a plan that has legitimately advanced. A healthy `implementation/` plan with a Gate-1 marker MUST NOT be returned as an actionable candidate.

Plans in `plans/functional/` similarly carry a Gate-0 marker after crossing vision review. These are also not flagged by the `marker-in-source-stage` signal.

Shipped-but-stranded plans in `functional/` or `implementation/` may be caught by the `missing-files` signal (their declared files were removed when the work shipped without the plan being advanced), or by the git-evidence check that runs on SP3 drill-in — not by the marker signal.

### Success Metrics

- **M1:** `scanCheapCandidates(root, { nowMs })` completes without invoking `child_process`, `execSync`, `spawnSync`, or any git binary — asserted by a spy/module-boundary test that fails loudly if the boundary is violated. The `nowMs` parameter (defaults to `Date.now()`) makes the age threshold deterministically testable without mtime manipulation.
- **M2:** A plan file in `plans/review/` that contains `approved_by: human` in its YAML frontmatter is always returned as an ACTIONABLE-eligible candidate with signal `marker-in-source-stage`.
- **M3:** A healthy `plans/implementation/` plan that contains `approved_by: human` (normal Gate-1 marker) and has all declared `files:` present is NOT returned as a candidate.
- **M4:** A plan whose declared `files:` array lists one or more paths that no longer exist on disk is returned with a `missing-files` signal and is ACTIONABLE-eligible.
- **M5:** A plan that is only old (`nowMs - mtime > 14 days`, no other signals) is returned with only an `advisory:age` signal and is NOT marked actionable.
- **M6:** A plan that is fresh, has valid markers for its stage, and has all declared files present yields an empty signals array and is not included as a candidate.
- **M7:** Both YAML `files:` syntaxes are parsed correctly: block-list syntax (`- path/to/file.js` on successive indented lines) and inline-array syntax (`files: [path/to/a.js, path/to/b.js]`). A test exists for each syntax. The `missing-files` signal must not silently fail on inline arrays.
- **M8:** All path construction in the module uses `path.join()` — no string concatenation — so the module is cross-platform on Windows, macOS, and Linux.

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

- [ ] **Scenario: Marker-in-source-stage fires only for review-stage plans**
  Given a plan file in `plans/review/` that contains `approved_by: human` in its YAML frontmatter
  When `scanCheapCandidates(root)` runs
  Then the plan is included in `candidates` with a `marker-in-source-stage` signal
  And its `actionable` field is `true`
  And the returned `count` is at least 1

- [ ] **Scenario: Healthy implementation-stage plan with Gate-1 marker is NOT flagged**
  Given a plan file in `plans/implementation/` that contains `approved_by: human` in its YAML frontmatter (normal Gate-1 marker)
  And all files listed in its `files:` frontmatter exist on disk
  When `scanCheapCandidates(root)` runs
  Then the plan is NOT included in `candidates`
  And the returned `count` does not increase due to this plan

- [ ] **Scenario: Plan with missing declared files is flagged actionable**
  Given a plan file in `plans/functional/` whose frontmatter `files:` array lists `src/lib/nonexistent.js`
  And that file does not exist on disk
  When `scanCheapCandidates(root)` runs
  Then the plan is included in `candidates` with a `missing-files` signal
  And its `actionable` field is `true`

- [ ] **Scenario: Age-only plan is advisory, never actionable**
  Given a plan file in `plans/implementation/` that has no `approved_by: human` marker
  And all files listed in its `files:` frontmatter exist on disk
  When `scanCheapCandidates(root, { nowMs: mtime + 15 * 24 * 3600 * 1000 + 1 })` runs (simulating 15 days elapsed)
  Then the plan is included in `candidates` with only an `advisory:age` signal
  And its `actionable` field is `false`

- [ ] **Scenario: Healthy fresh plan yields no signals**
  Given a plan file in `plans/functional/` modified within the last 14 days (nowMs within threshold)
  And the plan has no `approved_by: human` marker
  And all its declared `files:` exist on disk
  When `scanCheapCandidates(root)` runs
  Then the plan is NOT included in `candidates`

- [ ] **Scenario: No git binary invoked during cheap scan**
  Given a `plans/` directory with multiple plan files across stages
  When `scanCheapCandidates(root)` runs with a spy on `child_process.exec`, `execSync`, and `spawnSync`
  Then none of those spy methods are called
  And the function returns a valid `{candidates, count}` object

- [ ] **Scenario: Block-list YAML files: syntax parsed correctly**
  Given a plan file whose frontmatter declares `files:` as a YAML block list (each entry on its own `  - path` line)
  And one of the listed files does not exist on disk
  When `scanCheapCandidates(root)` runs
  Then the plan is included in `candidates` with a `missing-files` signal
  And the signal fires — the block-list syntax is not silently ignored

- [ ] **Scenario: Inline-array YAML files: syntax parsed correctly**
  Given a plan file whose frontmatter declares `files: [src/lib/a.js, src/lib/b.js]` on a single line
  And `src/lib/b.js` does not exist on disk
  When `scanCheapCandidates(root)` runs
  Then the plan is included in `candidates` with a `missing-files` signal
  And the signal fires — the inline-array syntax is not silently ignored

### In Scope

- New module `src/lib/stale-detector.js` exporting `scanCheapCandidates(root, { nowMs } = {})`
- Cheap signal detection: `marker-in-source-stage` (review stage only), `missing-files` (all gate source stages), `advisory:age` (all gate source stages, advisory-only)
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
- `functional/` and `implementation/` `marker-in-source-stage` signal — those stages carry prior-gate markers by design; the marker signal is review-stage only

## Risks

### Technical Risks

- **Risk:** Existing `parseFrontmatter` in `inbox.js` is scalar-only (simple `key: value` regex, confirmed by reading lines 123-137 of `src/lib/inbox.js`). It silently yields an empty string for block-list `files:` syntax and does not parse inline-array syntax at all. SP1 must implement its own sequence-aware parser for the `files:` key.
  - Likelihood: HIGH (confirmed by code review — the existing parser cannot handle either YAML list syntax)
  - Impact: HIGH (missing-files signal never fires if the list is not parsed as an array)
  - Mitigation: Implement a `parseFilesField(frontmatterText)` helper in `stale-detector.js` that handles both block-list and inline-array syntaxes. Cover both syntaxes with a dedicated test per syntax (M7). Do not reuse the scalar parser from `inbox.js`.

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
2. Frontmatter helpers — `extractFrontmatterRegion`, `parseFrontmatter` (scalar),
   `parseFilesField` (sequence-aware).
3. Signal detectors — pure helpers for each of the three signals.
4. Public `scanCheapCandidates` orchestrator + `module.exports`.

### 5.2 The critical integration subtlety — two-block frontmatter

Confirmed by reading real approved plans (`plans/done/A1-canvas-layer-impl.md`,
the SP1 target itself): an approved plan has the approval marker **prepended as a
separate leading `---…---` block** (the `addApprovalMarker` pattern in
`actions.js`), so the file begins:

```
---
approved_by: human          ← BLOCK 1 (prepended at gate crossing)
approved_at: …
gate_crossed: …
---

---
title: …                    ← BLOCK 2 (original plan metadata)
files:
  - src/lib/stale-detector.js
status: refined
---
```

`inbox.js`'s `parseFrontmatter` (lines 123–137) matches **only the first**
`---…---` block with `/^---\n([\s\S]*?)\n---/`. On an approved plan that block
contains `approved_by` but **not** `files:` — so reusing it would (a) miss
`files:` entirely and never fire `missing-files`, and (b) is also scalar-only and
cannot parse either YAML list syntax. This is the load-bearing reason SP1
implements its own parser rather than importing `inbox.js`'s.

**Design response:** `extractFrontmatterRegion(content)` collects **every**
consecutive leading `---…---` block (skipping blank lines between blocks) and
concatenates their bodies into one combined frontmatter string. Both
`approved_by` detection and `parseFilesField` operate on that combined string, so
they see keys regardless of which leading block they live in. `A1-canvas-layer-impl.md`
even repeats `approved_by: human` in both blocks — the combined-region approach
handles that idempotently (presence is presence).

### 5.3 Dependency graph

```
node:fs ─┐
node:path┤──▶ src/lib/stale-detector.js  (NEW, leaf — no project deps, no child_process)
                  │ exports: scanCheapCandidates, parseFilesField,
                  │          parseFrontmatter, GATE_SOURCE_STAGES, AGE_THRESHOLD_MS
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
 * @typedef {('marker-in-source-stage'|'missing-files'|'advisory:age')} StaleSignal
 *
 * @typedef {Object} StaleCandidate
 * @property {string}        plan        Plan slug = filename without `.md`
 *                                         (matches inbox.js listPlansAtGates).
 * @property {GateSourceStage} stage     The gate SOURCE stage it was found in.
 * @property {StaleSignal[]}  signals    Non-empty, deduped, canonical order:
 *                                         actionable first (marker-in-source-stage,
 *                                         missing-files), advisory last (advisory:age).
 * @property {boolean}        actionable true iff signals contains an actionable
 *                                         signal (marker-in-source-stage OR
 *                                         missing-files). advisory:age alone ⇒ false.
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

1. **`marker-in-source-stage` (actionable, REVIEW STAGE ONLY).**
   `if (stage === 'review' && parseFrontmatter(region).approved_by === 'human')`.
   Functional and implementation plans legitimately carry prior-gate markers
   (Gate-0 / Gate-1) — the marker signal must NOT fire for them (M3). Match is on
   value `human` (case-insensitive, after unquote/trim).
2. **`missing-files` (actionable, ALL three stages).**
   `declared = parseFilesField(region)`. If `declared.length > 0` and **any**
   declared path is absent on disk, fire. Empty/absent `files:` ⇒ never fires.
3. **`advisory:age` (ADVISORY only, ALL three stages).**
   `if (nowMs - statSync(file).mtimeMs > AGE_THRESHOLD_MS)` where
   `AGE_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000`.

After building `signals`: if `signals.length === 0`, the plan is **not** a
candidate (M6). Otherwise push
`{ plan, stage, signals, actionable: signals.includes('marker-in-source-stage') || signals.includes('missing-files') }`.
Finally `count = candidates.length`.

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
    `/^[ \t]*-[ \t]*(.+?)[ \t]*$/` is an item (strip quotes, drop empties). Stop
    at the first line that is **not** a dash-item line (a new key such as
    `status:` or a blank line) — block sequences in plan frontmatter are
    contiguous.
- Each returned path is checked for existence cross-platform by splitting on
  `/[\\/]+/` and rejoining under `root` with `path.join(root, ...parts)`, so a
  POSIX-authored `src/lib/x.js` resolves on Windows. Leading separators are
  dropped (paths are treated as repo-root-relative).

### 5.7 Cross-platform & security notes

- **Cross-platform (M8):** `require('path')`; every path via `path.join(...)`;
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
  missing/unterminated block — returns `''`.
- `parseFrontmatter(region: string) → Object<string,string>` — scalar `key: value`
  map over the combined region (own implementation; unquotes values). Used to read
  `approved_by`. NOT reused from inbox.js.
- `parseFilesField(region: string) → string[]` — §5.6.
- `scanCheapCandidates(root: string, { nowMs = Date.now() } = {}) → CheapScanResult`
  — §5.5 orchestrator; validates inputs and throws `TypeError` on misuse.

**Graceful-degradation rules (explicit guards, NOT swallowing try/catch):**
- `root` missing/empty or non-string → `throw new TypeError(...)` (fail loud on misuse).
- `nowMs` supplied and not `Number.isFinite` → `throw new TypeError(...)`.
- `plans/` dir absent → return `{ candidates: [], count: 0 }`.
- A stage dir absent → skip that stage.
- A plan with no frontmatter / no `files:` / empty list → `declared = []` (no
  `missing-files`); marker absent ⇒ no marker signal; age still computed. Never
  throws on structural irregularity.
- True IO faults (file vanishes between `readdir` and `read`) are **not** wrapped
  here — SP1 stays fail-loud; hot-path containment is SP2's concern when it wraps
  `scanCheapCandidates` inside the memoized `getInboxCounts`. (Documented under
  Decisions.)

**Exports:** `module.exports = { scanCheapCandidates, parseFilesField, parseFrontmatter, GATE_SOURCE_STAGES, AGE_THRESHOLD_MS };`
(`parseFilesField`/`parseFrontmatter` exported so SP5 can validate fixtures with
the real code path; constants exported so SP3 reuses them without re-declaring.)

### 6.2 File: `tests/stale-detector-cheap.test.js` — **CREATE**

**Framework:** `node:test` (`describe`/`it`) + `node:assert/strict`. Run via
`node --test tests/*.test.js`.

**Sandbox harness (fail-loud, hermetic, cross-platform):**
- `makeSandbox()` → `path.join(os.tmpdir(), 'ctoc-sp1-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2))`; `fs.mkdirSync(..., { recursive: true })`.
- `writePlan(sandbox, stage, slug, { approved=false, filesSyntax='block'|'inline'|'none', files=[], twoBlock=approved })` — writes `plans/<stage>/<slug>.md`. When `approved`, prepend a separate `---\napproved_by: human\napproved_at: …\ngate_crossed: …\n---\n` block then the main metadata block (replicates the real `addApprovalMarker` two-block shape — exercises §5.2).
- `touchTarget(sandbox, relPath)` — `mkdir -p` + write an empty file at `path.join(sandbox, ...relPath.split('/'))` so declared files "exist".
- `afterEach` → `fs.rmSync(sandbox, { recursive: true, force: true })`.

**Every test asserts concretely and fails loudly** — no empty catches, no
assertion-free bodies, no early returns. The one malformed-frontmatter test
asserts the *graceful* outcome (valid shape, no throw) via positive assertions,
not by swallowing an error.

### 6.3 Acceptance-Criteria → Implementation → Test matrix

| AC / BDD | Implementation element | Test case in `stale-detector-cheap.test.js` |
|---|---|---|
| **M1 / Scenario 6** — no git/subprocess | module imports no `child_process`; pure fs | (a) **behavioral spy:** monkeypatch `child_process.{exec,execSync,spawn,spawnSync,execFile,execFileSync}` to throw, `delete require.cache` for the module, require fresh, run scan over a multi-stage fixture, assert valid `{candidates,count}` and **no spy fired**; restore in teardown. (b) **static:** read the source, assert no `require('child_process')` and no `execSync/spawnSync/exec(/spawn(` token. |
| **M2 / Scenario 1** — review + `approved_by: human` ⇒ actionable | `marker-in-source-stage` detector, review-only | review plan w/ two-block approval marker + files present ⇒ candidate has `signals.includes('marker-in-source-stage')`, `actionable === true`, `count >= 1`. |
| **M3 / Scenario 2** — healthy impl + Gate-1 marker NOT flagged | review-only guard on marker; files-present ⇒ no missing | implementation plan w/ `approved_by: human` + all files present + fresh ⇒ slug absent from `candidates`; `count === 0`; no `marker-in-source-stage` emitted. |
| **M4 / Scenario 3** — missing declared files ⇒ actionable | `missing-files` detector | functional plan `files: [src/lib/nonexistent.js]`, file not created ⇒ candidate `signals.includes('missing-files')`, `actionable === true`. |
| **M5 / Scenario 4** — age-only advisory, never actionable | `advisory:age` via `nowMs` seam | implementation plan, no marker, files present; call with `{ nowMs: mtimeMs + 15*24*3600*1000 + 1 }` ⇒ candidate `signals` **deep-equals** `['advisory:age']`, `actionable === false`. |
| **M6 / Scenario 5** — fresh healthy ⇒ no candidate | zero-signal plans omitted | functional plan, no marker, files present, `nowMs` within 14d of mtime ⇒ slug absent from `candidates`. |
| **M7 / Scenario 7** — block-list parsed | `parseFilesField` block branch | block-list `files:` with one missing entry ⇒ `missing-files` fires (not silently ignored). + direct `parseFilesField` unit test. |
| **M7 / Scenario 8** — inline-array parsed | `parseFilesField` inline branch | `files: [src/lib/a.js, src/lib/b.js]`, only `a.js` created ⇒ `missing-files` fires. + direct `parseFilesField` unit test. |
| **M8** — cross-platform `path.join` | `path.join` throughout; declared-path split `/[\\/]+/` | static: source uses `require('path')` + `path.join`, contains no `'/plans'`/`+ '/'` concat; behavioral coverage is implicit (all sandbox tests run on the host OS). |

**Additional regression/edge tests (beyond the 8 ACs):**
- Two-block frontmatter integration: review plan w/ **prepended** approval block AND block-list `files:` with a missing entry ⇒ signals contain BOTH `marker-in-source-stage` AND `missing-files` (proves §5.2 combined-region parsing).
- Combined signals & ordering: review plan approved + missing-files + old ⇒ `signals` deep-equals `['marker-in-source-stage','missing-files','advisory:age']`, `actionable === true`.
- `count === candidates.length` invariant on a mixed fixture.
- `plans/` absent ⇒ `{ candidates: [], count: 0 }`; one stage dir absent ⇒ no throw; `.gitkeep` ignored.
- `files: []` and absent `files:` ⇒ no `missing-files` signal.
- `parseFilesField` direct units: block, inline, `[]`, quoted entries (`- "a.js"`, `['a.js']`), scalar single value, absent key ⇒ `[]`.
- Input validation: `scanCheapCandidates(null)` and `scanCheapCandidates('')` throw `TypeError`; `scanCheapCandidates(sandbox, { nowMs: 'x' })` throws `TypeError`.
- Malformed/empty frontmatter plan ⇒ graceful (age-only or no candidate), never throws.

**Coverage target:** ≥ 80% line & branch on `stale-detector.js`; every signal
branch, both `parseFilesField` syntaxes, both throw paths exercised.

### 6.4 Implementation order (dependency-respecting; executor does TDD-red first)

1. `tests/stale-detector-cheap.test.js` — write failing tests first (Iron Loop Step 8 TEST).
2. `src/lib/stale-detector.js` — constants → `extractFrontmatterRegion` →
   `parseFrontmatter` → `parseFilesField` → signal detectors → `scanCheapCandidates`
   → exports, until the suite is green (Step 10 IMPLEMENT).

## Decisions Taken Under Ambiguity

- **Age threshold:** 14 days since plan-file mtime. Long enough to exclude active in-flight work; short enough to catch the 31-day rot class observed. Tunable via `.ctoc/settings` in a future patch without changing the module contract.
- **"Inactivity" source:** plan-file mtime (single `fs.stat` per file), not per-step timestamps — keeps the cheap pass truly cheap. Mtime is advisory only due to git-checkout rewrite behavior (documented in JSDoc).
- **Module placement:** new `src/lib/stale-detector.js`, not an extension of `inbox.js`. `inbox.js` is extended in SP2 only. Keeps SP1 independently testable.
- **YAML `files:` parsing:** implement a `parseFilesField()` helper inside `stale-detector.js` that handles both block-list (`  - path`) and inline-array (`[a, b, c]`) syntaxes. Two tests, one per syntax. Do not reuse the scalar-only parser from `inbox.js` which silently fails on both list forms.
- **`marker-in-source-stage` scope:** review stage only. Implementation and functional plans carry prior-gate markers by design — flagging them as stale on that basis alone would produce constant false positives. Shipped-but-stranded plans at earlier stages are identified by the `missing-files` signal or by SP3 git-evidence.
- **`nowMs` injection:** `scanCheapCandidates(root, { nowMs } = {})` where `nowMs` defaults to `Date.now()`. Required testability seam for SP5; eliminates dependency on `fs.utimesSync` for age scenarios in tests.

### Decisions taken during technical planning (Steps 5–6)

- **Combined multi-block frontmatter region (the load-bearing parser decision):** approved plans carry the approval marker in a *separate prepended* `---…---` block (the `addApprovalMarker` pattern; confirmed in `plans/done/A1-canvas-layer-impl.md`, which even repeats `approved_by: human` in both blocks, and in the SP1 target's own header). `inbox.js`'s `parseFrontmatter` reads only the first block, so on an approved plan it would find `approved_by` but miss `files:` (a second-block key) — `missing-files` would never fire on approved plans. SP1 therefore implements `extractFrontmatterRegion()` to concatenate **all** consecutive leading `---…---` blocks and runs both `approved_by` detection and `parseFilesField` over the combined string. This is a second, independent reason (beyond scalar-vs-sequence parsing) that the inbox parser cannot be reused.
- **Own `GATE_SOURCE_STAGES` constant, not an import:** `inbox.js` does not export `HUMAN_GATE_SOURCE_STAGES`, and editing `inbox.js` is out of scope (SP2 owns it). SP1 declares its own frozen `['functional','implementation','review']`. Minor duplication is accepted to keep SP1 an independent leaf and avoid an out-of-scope edit.
- **Candidate shape frozen to exactly four keys** — `{plan, stage, signals, actionable}`. No `path`, no parsed-`files`, no `mtime` added. SP2 asserts the shape and SP5 deep-checks it; SP3 reconstructs the file path from `{plan, stage}` and re-parses `files:` itself. `plan` is the slug (filename without `.md`), matching `inbox.js` `listPlansAtGates`.
- **`count = candidates.length`** (total candidates, including advisory-only ones) — consistent with SP2's "N possibly-stale plans" label, which is deliberately inclusive of advisory candidates. A zero-signal plan is never a candidate, so it never contributes to `count`.
- **Signal canonical order** `['marker-in-source-stage','missing-files','advisory:age']` — produced naturally by the fixed evaluation order; actionable signals first, advisory last. Tests assert membership for most cases and deep-equality for the single-signal and combined-signal cases.
- **`actionable` rule:** `true` iff `signals` contains `marker-in-source-stage` or `missing-files`. `advisory:age` alone ⇒ `actionable: false`. This is the code-level enforcement of the HYBRID "age never acts alone" principle.
- **`approved_by` match value:** the marker fires only when the parsed value equals `human` (case-insensitive, unquoted/trimmed), matching the canonical gate marker — not on mere presence of the key.
- **Determinism:** stages iterated in fixed gate order; `readdirSync` results sorted ascending within each stage (readdir order is platform-dependent) so candidate ordering is stable across platforms and runs.
- **`parseFilesField` edge tolerances:** empty inline array `files: []` ⇒ `[]`; absent `files:` ⇒ `[]` (so `missing-files` cannot fire on a plan that declares none); block-list collection stops at the first non-dash line (frontmatter sequences are contiguous); a bare scalar `files: x` is tolerated as a one-element list; surrounding quotes are stripped. Declared paths are split on `/[\\/]+/` and rejoined under `root` via `path.join` so POSIX-authored paths resolve on Windows; leading separators are dropped (paths are repo-root-relative).
- **Fail-loud on misuse, graceful on structure:** misuse (`root` not a non-empty string; non-finite `nowMs`) throws `TypeError`. Structural irregularity (missing `plans/`, missing stage dir, missing/empty/malformed frontmatter) is handled by explicit guards returning empty/zero — never a swallowing `try/catch`. True IO faults (a file vanishing mid-scan) are intentionally **not** caught in SP1; hot-path containment belongs to SP2 when it wraps `scanCheapCandidates` inside the memoized `getInboxCounts`. This keeps SP1 honest and avoids masking real bugs.
- **Exports widened for downstream reuse without contract risk:** `parseFilesField` and `parseFrontmatter` are exported (SP5 validates fixtures through the real code path per its risk-mitigation note), and `GATE_SOURCE_STAGES` + `AGE_THRESHOLD_MS` are exported so SP3 reuses them without re-declaring magic numbers. `scanCheapCandidates` remains the sole primary entry point.
- **M1 asserted two ways:** a behavioral spy (monkeypatch `child_process` methods to throw, require the module fresh, assert none fired) as the durable regression guard SP3/SP5 depend on, plus a static source assertion (no `child_process` require, no subprocess tokens) as defense-in-depth. Both must pass.
- **In-flight SP1 self-reference is by-design, not special-cased:** when run against the live tree, SP1's own implementation plan declares `src/lib/stale-detector.js`, which does not exist until this plan ships — so a live scan would emit `missing-files` for SP1 itself. That is correct cheap-signal behavior; the HYBRID gate means SP3 git-evidence (no commit yet ⇒ `inconclusive`) prevents any action. Adding a self-exclusion would violate the locked cheap-only contract, so none is added. Tests use hermetic `os.tmpdir()` fixtures and are unaffected.
