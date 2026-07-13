---
approved_by: human
approved_at: 2026-07-13T11:01:11.632Z
gate_crossed: functional → implementation
---

---
title: "W06 — The Test Suite Tells the Truth"
created: "2026-07-11T00:00:00Z"
type: feature
parent_vision: "vision/ctoc-self-audit-remediation.md"
priority: HIGH
depends_on: none
---

# W06 — The Test Suite Tells the Truth

> **This is a SIP1 INDEX.** Steps 5–7 decomposed this functional plan into **7
> dependency-ordered implementation slices** (below). Each slice is its own
> `parent_plan`-linked plan with its own Step 8–16 Execution Plan. Gates 2 & 3 batch
> across all 7 via `approveSubplans('ctoc-audit-w06-truthful-tests', <fromStage>)` — one
> human decision stamps every sibling `approved_by: human`. The ASSESS / ALIGN / CAPTURE
> sections below are retained as the shared context for all slices.

## Slices (dependency-ordered)

All 7 slices are **independent** (`depends_on: none`) — max dependency-chain depth 0, no
cycles, no shared files — so they may be built in any order the maintainer schedules and
their gates batch cleanly. **Every slice's Step 8 test is RED on today's tree** (proven
below); the "GREEN when" column names the paired workstream whose production fix flips it
(W06 owns only tests + test-infra and applies **no** sibling's production fix).

| # | Slice file | Scope (one line) | Stories | RED-now witness (verified 2026-07-13) | GREEN when | depends_on |
|---|------------|------------------|---------|----------------------------------------|-----------|------------|
| s1 | `ctoc-audit-w06-s1-skip-guard-integrity.md` | Guard test + convert the 8 `try{require}catch{null}→skip` files so an absent module FAILS, never skips | S1, S2 | 8 files carry the anti-pattern (62 `.skip(` guard sites) | **self-paired** (W06 does the conversions in-slice) | none |
| s2 | `ctoc-audit-w06-s2-coverage-instrumentation.md` | Coverage gate script + wire `--experimental-test-coverage` into `npm test`; `# skipped>0`, `<80%`, and unmeasured coverage all FAIL | S3, S4 | `scripts.test` is `node --test tests/*.test.js` (no coverage, no gate); gate module absent | **self-paired** (W06 owns the gate + wiring) | none |
| s3 | `ctoc-audit-w06-s3-frontmatter-anchoring.md` | Anchor `readFM` to byte-0 `^---` in `architecture-invariants.test.js` (drop match-anywhere) | C7 | `readFM` has the match-anywhere fallback; 19 H1-first agents' contracts parse-but-are-inert | **W03** (moves the 19 agents' YAML to line 1) | none |
| s4 | `ctoc-audit-w06-s4-registry-integrity.md` | New `registry-integrity.test.js`: every registry `path:` + every step-table agent resolves | S5 | 20 dangling registry `path:` entries; 10 unresolved step-table agents | **W04** (creates the agents / repoints table + registry) | none |
| s5 | `ctoc-audit-w06-s5-version-license-truth.md` | Shared real-artifact reader + `release.test.js` asserts VERSION/package/plugin/marketplace versions agree and license==LICENSE | S6, S9 | `package.json` 6.9.49≠6.10.3; license Apache-2.0≠PolyForm Shield 1.0.0 | **W09** (corrects `package.json`) | none |
| s6 | `ctoc-audit-w06-s6-doc-counts.md` | New `doc-counts.test.js`: every documented count self-verifies vs a live disk count | S7 | CLAUDE.md "109 test files"≠211; "114 JS modules"≠123 | **doc correction** (nearest owner W09; W04/workstream-11 also shift counts) | none |
| s7 | `ctoc-audit-w06-s7-installer-paths.md` | New `installer-paths.test.js`: every installer-written template/target path exists | S8 | RED anchor **pinned at build time** — Step 8 is an honesty gate: reproduce a real broken path or kick back | **workstream 11** ("fix or remove the broken hooks-installer path") | none |

**Re-scan note (per the parent's instruction to re-verify the audit's "55"):** the audit's
"55 sites" counted per-test `t.skip` guards; the 2026-07-13 re-scan finds the
`try{require}catch{null}` mechanism concentrated in **8 files / 62 guard sites** — s1 owns
the exact list. The behavior contract (absence must fail, not skip) is unchanged by the
count drift.

**Helper coordination:** per "one shared helper, don't duplicate assertion logic," the
version/license reader lives in `tests/helpers/source-of-truth.js` (s5, importable by W09).
The registry, doc-count, and installer parsers are kept **inline per slice** (short,
single-purpose) rather than forced through one generic harness — this avoids coupling the
independent slices through a shared file and keeps each paired-fix witness self-contained.

## 1. ASSESS

### Business Context

A green test suite is the CTOC maintainer's evidence that the four human gates hold —
it is the instrument the maintainer trusts instead of re-reading every line of
enforcement code by hand. The 2026-07-11 seven-agent audit found the suite is
5485-green and caught **none** of the ten other workstreams' defects, because it
asserts *structure* (a key is present, a function returned without throwing) rather
than *truth* (a pointer resolves, two sources of truth agree, a tool call was actually
stopped). This is the blind spot that let every other finding — exit-code enforcement,
the Bash stdin bug, forged `approved_by: human` markers, the inert-frontmatter parse
bug, ten dangling step agents, an unreachable Gate-3 failure path — accumulate behind a
suite that never turned red. A suite that asserts structure instead of truth is not a
weak witness; it is a false witness, and it is the single root cause that let the other
nine defect classes ship undetected.

### Current State (Verified)

- **Match-anywhere frontmatter parser certifies the inert-frontmatter bug green
  (finding C7).** `architecture-invariants`'s `readFM` matches YAML frontmatter
  *anywhere* in a file, not anchored to the top. The 19 agent files that place a `# H1`
  heading before their YAML block have frontmatter the runtime never parses (`cto-chief`
  runs with all tools instead of its declared read-only set; all 5 scouts run on the
  session model instead of `haiku`) — and the existing invariant test still passes,
  because it finds the frontmatter "somewhere" in the file and certifies it valid.
- **The skip-guard pattern turns deletion into a pass (finding A2).**
  `try { require(...) } catch { null }` followed by `t.skip(...)` means a module that
  fails to resolve — because it was deleted, renamed, or never built — produces
  `pass 0 / fail 0 / skip 1`. That result is green under the `# fail 0` gate. The audit
  found this exact pattern reproduced across **55 sites**; any of those 55 required
  modules could vanish today and the suite would report success.
- **Coverage is never measured (finding A4).** The suite runs under plain
  `node --test`, with no coverage instrumentation wired into the test command. The
  documented "≥ 80%, 0 skipped" gate in `docs/IRON_LOOP.md` and this project's own
  `CLAUDE.md` has no instrument behind it — the 80% figure is asserted in prose and
  enforced nowhere.
- **`release.test.js` tests a duplicate, not the artifact (part of findings B1–B6).**
  The release test asserts against a hand-copied literal object embedded in the test
  file, not against the real `package.json`/`plugin.json`/`marketplace.json`/`LICENSE`
  files on disk. This is exactly how `package.json` came to self-report the wrong
  version (`6.9.49` vs. the actual `6.10.3`) and the wrong license (`Apache-2.0` vs. the
  actual PolyForm Shield 1.0.0) with a fully green suite.
- **No cross-file invariant exists at all.** Nothing in the current suite asserts that
  an `operations-registry.yaml` `path:` entry resolves to a real file, that a
  CLAUDE.md step-table agent resolves to a dispatchable file, that `VERSION` agrees
  with the three JSON manifests, or that a documented count (agents, skills, tests)
  matches a live count on disk. Ten dangling step agents (finding C8) and 20 dangling
  registry paths shipped invisibly because no test class existed to catch them.

### Impact

Every one of the other ten remediation workstreams ships a production fix that, today,
has no test capable of proving it landed or of catching its regression. Until this
workstream lands, "the suite is green" carries zero evidential weight for any of the
audit's findings — the maintainer is flying blind on the exact defect classes the audit
just surfaced, and a future regression in any of them (a 56th skip-guard added
carelessly, a 21st dangling registry path, a re-introduced version drift) would again
go undetected. This is why the vision requires W06 to land *alongside* each other
workstream rather than as a standalone pass: a paired fix without its paired test is
unwitnessed and, per the no-stub rule, incomplete.

## 2. ALIGN

### Alignment

- **Goal:** Restore the test suite as truthful evidence that the four human gates hold
  and that the audit's defect classes are fixed and stay fixed (vision Success
  Criterion 5: "The test suite goes red on every defect class... and coverage is
  actually measured with `0 skipped` treated as failure").
- **Actor:** The CTOC maintainer (the human CTO), named explicitly in the vision's
  target audience as the party who "trusts the green suite as evidence the gates
  hold."
- **Impact:** The maintainer's `# fail 0, # skipped 0, coverage ≥ 80%` gate becomes an
  instrument that actually distinguishes a fixed defect from a live one — a behavior
  change from "green suite, defect present" to "suite is red exactly when, and only
  when, a defect class from this audit (or a future regression of it) is present."
- **Deliverable:** New and rewritten test files (`tests/architecture-invariants.test.js`
  anchoring, 55 skip-guard conversions, `tests/registry-integrity.test.js`,
  `tests/doc-counts.test.js`, a rewritten `tests/release.test.js`) plus coverage
  instrumentation wired into the `npm test` command and gate.

**Job to Be Done:** When I am relying on a green test suite as proof that a fix
landed and a defect class cannot silently return, I want every defect class this audit
found to have a test that fails on the broken state and passes on the fixed state, so I
can trust `# fail 0` again.

### Success Metrics

- Every invariant test this workstream adds or rewrites **FAILS when run against
  today's tree** (proves it catches a real, currently-present defect) — no test is
  added that is already green on the broken tree.
- Each of those tests **PASSES once its paired production fix has landed** in that
  fix's own workstream, with no other invariant test regressing.
- `# skipped > 0` anywhere in a suite run causes the gate to report FAIL, with zero
  exceptions carved out.
- A numeric coverage percentage is present in every `npm test` run's output, and a run
  below 80% causes the gate to report FAIL.
- Zero of the 55 identified skip-guard sites remain in `try/require/catch → t.skip`
  form after this workstream lands.

## 3. CAPTURE

### Acceptance Criteria (BDD)

- [ ] **Scenario: Deleted module fails loud, not quiet**
  Given a module a test file requires is deleted from disk or fails to resolve
  When the suite runs
  Then that test file reports at least 1 failing test (not `pass 0 / fail 0 / skip 1`)
  And the failure message names the unresolved module path

- [ ] **Scenario: Present module leaves the suite unaffected**
  Given every module a test file requires exists and its `require()` call succeeds
  When the suite runs
  Then that test file reports 0 failures and 0 skips

- [ ] **Scenario: Any skip fails the gate**
  Given a completed suite run reports one or more skipped tests (`# skipped > 0`)
  When the test gate evaluates the run summary
  Then the gate reports FAIL regardless of the `# fail` count

- [ ] **Scenario: Coverage is measured and reported as a real number**
  Given the suite runs under the wired coverage instrumentation
  When the run completes
  Then a numeric line-coverage percentage appears in the run output

- [ ] **Scenario: Coverage below 80% fails the gate**
  Given the measured line-coverage percentage is below 80
  When the coverage gate check runs
  Then it reports FAIL and prints the measured percentage next to the 80% threshold

- [ ] **Scenario: Dangling registry path fails, naming the path**
  Given `operations-registry.yaml` contains a `path:` entry that resolves to no file on
  disk
  When `tests/registry-integrity.test.js` runs
  Then it FAILS and the failure message contains the exact dangling `path:` value

- [ ] **Scenario: Unresolvable step-table agent fails, naming the step**
  Given CLAUDE.md's Iron Loop step table names an agent for a step, and that agent's
  path resolves to no dispatchable file on disk
  When `tests/registry-integrity.test.js` runs
  Then it FAILS and the failure message names both the step number and the unresolved
  agent path

- [ ] **Scenario: Version disagreement fails, naming every mismatched file**
  Given `VERSION`, `package.json.version`, `.claude-plugin/plugin.json`'s version, and
  `.claude-plugin/marketplace.json`'s ctoc entry version do not all match
  When the version/license single-source-of-truth test runs
  Then it FAILS and lists each file next to its version value

- [ ] **Scenario: License disagreement fails**
  Given `package.json.license` does not equal the license identifier read from the
  actual `LICENSE` file
  When the version/license single-source-of-truth test runs
  Then it FAILS and prints both the declared and the actual license strings

- [ ] **Scenario: Stale documented count fails**
  Given a documented count (agents, skills, tests, or modules) in a markdown doc file
  does not equal a live count taken from disk at test time
  When `tests/doc-counts.test.js` runs
  Then it FAILS and prints the documented value and the live disk value side by side

- [ ] **Scenario: Missing installer-written path fails**
  Given an installer script writes a hook to a documented filesystem path, and that
  path does not exist after installation runs
  When the installer-path invariant test runs
  Then it FAILS naming the missing path

- [ ] **Scenario: Release test guards the real artifact, not a duplicate**
  Given `tests/release.test.js` runs
  When it asserts a version or license value
  Then it reads that value from the actual `package.json` file on disk via
  `fs.readFileSync` + `JSON.parse` (not from a literal object hand-copied into the test
  file), so a real drift in `package.json` makes the assertion fail

- [ ] **Scenario: Paired-fix lifecycle holds for every invariant above**
  Given any invariant test added by this workstream is run against today's tree, before
  its paired production fix has landed in that fix's own workstream
  When the test executes
  Then it FAILS, naming a real, currently-present defect
  And Given the paired fix has since landed
  When the same test runs again
  Then it PASSES, with no other invariant test in the suite regressing to failing or
  skipped

### Scope

#### In Scope
- Converting all 55 identified `try { require(...) } catch { null } → t.skip(...)`
  sites to hard-require, so an absent module fails the test instead of skipping it
  (test-file edits only)
- Wiring coverage instrumentation into the `npm test` run and treating `# skipped > 0`
  as a suite failure
- `tests/architecture-invariants.test.js`: anchoring `readFM`'s frontmatter match to
  the top of the file (`^---`) instead of matching anywhere
- New `tests/registry-integrity.test.js`: every `operations-registry.yaml` `path:`
  entry resolves to a real file; every CLAUDE.md step-table agent resolves to a real
  dispatchable file
- New single-source-of-truth assertions: `VERSION` == `package.json` ==
  `plugin.json` == `marketplace.json` version; `package.json.license` == the actual
  `LICENSE` file
- New `tests/doc-counts.test.js`: every documented count (agents, skills, tests,
  modules) self-verifies against a live disk count
- An installer-path existence test: every installer-written hook path exists on disk
  after install
- Rewriting `tests/release.test.js` to read the real production config files instead
  of a hand-copied duplicate
- The shared "read two sources, compare" test harness the four cross-file invariant
  tests are built on

#### Out of Scope
- Fixing the `readFM` match-anywhere *root cause* by moving the 19 agents' YAML to
  line 1 — that production fix lives in **W03 (Agent contracts load at runtime)**;
  W06 only anchors the parser and adds the test that proves the fix landed
- Fixing the PreToolUse `exit(1)` vs. `exit(2)` enforcement bug — lives in
  **W01 (Enforcement actually blocks)**
- Creating the 10 missing Iron Loop step agents or regenerating
  `operations-registry.yaml`'s content from disk — lives in
  **W04 (Every dispatched agent resolves)**; W06 only adds the test that catches a
  dangling entry
- Correcting `package.json`'s actual wrong version and license values — lives in
  **W09 (Release and metadata truth)**; W06 only adds the test that fails while they
  are wrong and stays green once corrected
- Implementing the Gate-3 circuit breaker or making `validateReviewToDone` return
  `valid:false` — lives in **W05 (Gate 3 verifies real work)**
- CRLF-safe frontmatter parsing for Windows — lives in
  **W07 (Cross-platform correctness)**
- Any fix to the human-gate approval-provenance ledger — lives in
  **W02 (Human-gate integrity)**

### Story Breakdown (INVEST)

| Story | Actor | Story | I | N | V | E | S | T |
|---|---|---|---|---|---|---|---|---|
| S1 `[MVP]` | CTOC maintainer | As the maintainer, I want a module that fails to `require` to FAIL its test rather than skip, so that deleting a module can never stay green | Y | Y | Y | Y | Y | Y |
| S2 | CTOC maintainer | As the maintainer, I want all 55 skip-guard sites converted to hard-require, so that no corner of the suite hides a deletion | Y | Y | Y | Y | Y | Y |
| S3 `[MVP]` | CTOC maintainer | As the maintainer, I want coverage instrumentation wired into the test run, so that the "≥ 80%" gate has a real number behind it | Y | Y | Y | Y | Y | Y |
| S4 | CTOC maintainer | As the maintainer, I want `# skipped > 0` treated as a suite failure, so that a skipped test can never masquerade as a pass under `# fail 0` | Y | Y | Y | Y | Y | Y |
| S5 `[MVP]` | CTOC maintainer | As the maintainer, I want a test that fails when any registry `path:` or step-table agent does not resolve, so that dangling pointers go red | Y | Y | Y | Y | Y | Y |
| S6 | CTOC maintainer | As the maintainer, I want a test that fails when VERSION/package.json/plugin.json/marketplace.json versions disagree, or when the declared license disagrees with the actual LICENSE file, so that metadata drift goes red | Y | Y | Y | Y | Y | Y |
| S7 | CTOC maintainer | As the maintainer, I want a test that fails when a documented count disagrees with a live disk count, so that stale docs go red | Y | Y | Y | Y | Y | Y |
| S8 | CTOC maintainer | As the maintainer, I want a test that fails when an installer-written hook path does not exist on disk, so that a broken installer path goes red | Y | Y | Y | Y | Y | Y |
| S9 | CTOC maintainer | As the maintainer, I want `release.test.js` to assert against the real `package.json`/`plugin.json`/`marketplace.json`/`LICENSE` files instead of a hand-copied duplicate, so the test cannot stay green while the real artifact drifts | Y | Y | Y | Y | Y | Y |

All nine stories pass INVEST independently. S5–S8 share a "read two sources, compare"
harness but each fails on a distinct real defect and delivers standalone value; none
depends on another shipping first.

### Files Likely Touched

- `tests/architecture-invariants.test.js` — anchor `readFM`'s frontmatter match to
  `^---`
- The 55 skip-guard test files (exact list to be enumerated by a repo-wide scan for the
  `try { require(...) } catch { null }` → `t.skip` pattern at Step 5/6 planning; the
  audit's count is the starting figure, not a hard ceiling — see Decisions below)
- `package.json` — test script invocation and coverage configuration
- `tests/registry-integrity.test.js` (new) — registry-path and step-table agent
  resolution
- `tests/doc-counts.test.js` (new) — documented-count self-verification
- `tests/release.test.js` — rewritten to read the real production config files
- A new installer-path existence test (file location to be decided by the
  implementation planner; likely `tests/installer-paths.test.js` or folded into
  `tests/registry-integrity.test.js`)

### Test Strategy

This workstream's deliverable **is** its tests — there is no separate application
logic to build behind them. Every acceptance criterion above corresponds to a test (or
test conversion) that must be demonstrably RED against today's tree before it is
considered complete, and the story is not "done" until the paired production fix (in
its own workstream) turns it GREEN. Because this workstream's own Step 8 (TEST) *is*
its Step 10 (IMPLEMENT) — writing the invariant test is the implementation — the
implementation planner should treat "write the test, confirm it fails on the current
tree, document the specific failure output" as the acceptance evidence for each story,
not a separate manual verification pass. The 55 skip-guard conversions are verified in
aggregate: after conversion, temporarily deleting a sampled module (in a throwaway
branch, never committed) must produce a failing test, not a skip, for a rotating sample
of the converted sites.

## Decisions Taken Under Ambiguity

- **No Business Model Canvas.** This is a technical remediation workstream; a BMC is
  N/A. Proceeded without kicking back, per the vision decomposition brief and the
  CTO Chief technical-only scope (business/market questions are out of scope for this
  chain).
- **W06 changes tests and test infrastructure only.** Where an invariant test needs a
  production defect fixed to go green, the fix belongs to that defect's own workstream
  (W01–W05, W07–W11); W06 owns the test that witnesses it. This is stated explicitly in
  Scope above so the implementation planner does not fold another workstream's
  production fix into this plan's file list.
- **Coverage tool: `node --experimental-test-coverage`.** The vision requires coverage
  be "actually measured" but names no tool. Node's built-in
  `node --test --experimental-test-coverage` is the presumptive choice for the
  implementation planner: zero new dependency, already available in the project's
  supported Node range. The acceptance criteria assert a real reported figure and a
  below-80% failure, not a specific tool, so this choice does not narrow what the
  criteria require if a different instrumentation is later preferred.
- **Paired-fix acceptance is the operating contract with every other workstream.**
  Because W06's invariant tests are only meaningful in the RED-before / GREEN-after
  shape, this plan is explicitly designed to pair with W01, W03, W04, W05, and W09 (the
  workstreams whose defects W06's new tests target). Landing W06 without any paired
  fix having landed yet is expected and correct — the RED state on today's tree is
  itself the acceptance evidence per Scenario "Paired-fix lifecycle holds" above.
- **55-site count taken from the audit, not re-verified at functional-plan time.** The
  skip-guard site count is the audit's figure. The acceptance criteria drive on
  behavior (absence fails, not skips) rather than the exact count, so the implementation
  planner should re-scan the repo for the current, authoritative site list rather than
  treating 55 as a hard target; a small drift in count does not invalidate the plan.
