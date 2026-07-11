---
title: "W06 — The Test Suite Tells the Truth"
created: "2026-07-11T00:00:00Z"
type: stub
parent_vision: "vision/ctoc-self-audit-remediation.md"
priority: HIGH
status: stub
depends_on: none
---

# W06 — The Test Suite Tells the Truth

## Problem

The suite is 5485-green and caught **none** of the audit defects, because it asserts
structure, not truth:

- **Match-anywhere frontmatter.** `architecture-invariants`'s `readFM` matches
  frontmatter *anywhere* in a file, so the 19 agent files that place a heading before
  their YAML — whose YAML the runtime therefore never parses — are certified green.
  The test confirms the inert-frontmatter bug is fine.
- **Skip-guards turn deletion into a pass.** The pattern
  `try { require(...) } catch { null }` → `t.skip(...)` means a **deleted** module
  produces `pass 0 / fail 0 / skip 1` — green under the `# fail 0` gate. This pattern
  is reproduced across 55 sites; any of those modules could vanish and the suite would
  stay green.
- **Coverage is never measured.** Tests run under `node --test` with no coverage
  instrumentation, so the documented "≥ 80%, 0 skipped" gate has no instrument behind
  it — the number is unenforced and unenforceable as wired.
- **Release test guards a duplicate.** `release.test.js` asserts against a
  hand-copied duplicate of the production config, not the real file, so the real
  config can drift (wrong version, wrong license) while the test stays green — which
  is exactly how `package.json` came to self-report the wrong version and license.

The deeper defect is the blind spot itself: nothing asserts that a pointer resolves,
that two sources of truth agree, or that a claimed count matches disk. This workstream
fixes the instrument so the other workstreams' fixes are actually witnessed.

## Scope

Make the suite capable of going red on the defect classes it currently sleeps through.

1. **Kill the skip-guards.** A module that is absent must **FAIL**, not skip. Replace
   the `try/require/catch→t.skip` pattern at its 55 sites so module-absent is a hard
   failure.
2. **Wire coverage instrumentation** and treat `# skipped > 0` as a suite failure, so
   the "≥ 80%, 0 skipped" gate has a real instrument and a real failure mode.
3. **Add cross-file invariant tests** that assert truth across files:
   - every `operations-registry.yaml` `path:` resolves to a real file;
   - every agent named in the CLAUDE.md Iron Loop step table resolves to a real
     dispatchable agent file;
   - `VERSION` == `package.json` == `plugin.json` == `marketplace.json` version;
   - `package.json.license` equals the actual `LICENSE` file's license;
   - every documented count (agents, skills, tests, modules) self-verifies against a
     live disk count;
   - every installer-written hook path actually exists on disk.

**Pairs with every other workstream.** Each fix ships with the test that catches its
defect class — W06 supplies the truth-asserting test harness and the shared invariant
patterns the other ten workstreams plug their paired tests into.

**Does NOT touch:** the production defects themselves (each lives in its own
workstream — enforcement in W01, gate logic in W05, frontmatter in W03, registry in
W04, release metadata in W09, etc.). W06 changes only tests, test infrastructure, and
the coverage/skip gating; it does not fix a production bug, it makes the suite able to
see one.

## Story Map

**Goal:** The suite goes red on every audit defect class — dead pointers, disagreeing
sources of truth, deleted modules, unmeasured coverage — and stays honest afterward.

- **Success metric:** Each new invariant test FAILS on the current tree (it catches a
  real, present defect) and PASSES after that defect's paired fix lands. No test is
  added that is green on today's broken tree.

### Activity 1 — Make absence loud
- `[MVP]` As the CTOC maintainer, I want a module that fails to `require` to FAIL its
  test rather than skip, so that deleting a module can never stay green.
  - INVEST: Independent, Valuable, Small, Testable.
- As the CTOC maintainer, I want the 55 skip-guard sites converted to hard-require, so
  that no corner of the suite hides a deletion.

### Activity 2 — Make coverage real
- `[MVP]` As the CTOC maintainer, I want coverage instrumentation wired into the test
  run, so that the "≥ 80%" gate has a number behind it.
  - INVEST: Independent, Valuable, Estimable, Small, Testable.
- As the CTOC maintainer, I want `# skipped > 0` treated as a suite failure, so that a
  skipped test can no longer masquerade as a pass under the `# fail 0` gate.

### Activity 3 — Assert truth across files
- `[MVP]` As the CTOC maintainer, I want a test that fails when any
  `operations-registry.yaml` `path:` or step-table agent does not resolve to a real
  file, so that dangling pointers go red.
  - INVEST: Independent, Valuable, Small, Testable.
- As the CTOC maintainer, I want a single-source-of-truth test that fails when
  VERSION, `package.json`, `plugin.json`, and `marketplace.json` versions disagree, or
  when `package.json.license` disagrees with the `LICENSE` file, so that metadata drift
  goes red.
- As the CTOC maintainer, I want a test that fails when a documented count (agents,
  skills, tests, modules) disagrees with a live disk count, so that stale docs go red.
- As the CTOC maintainer, I want a test that fails when any installer-written hook path
  does not exist on disk, so that a broken installer path goes red.

## Rough acceptance criteria (Given/When/Then)

- **Absence fails, not skips.** Given a required module is deleted (or unresolvable),
  When the suite runs, Then the corresponding test FAILS (non-zero `# fail`), not
  `skip 1`.
- **Skip is a failure.** Given any test is skipped, When the suite runs under the
  gate, Then the run is treated as failed (`# skipped > 0` ⇒ fail).
- **Coverage measured.** Given the suite runs, When coverage is computed, Then a real
  coverage figure is produced and a figure below 80% fails the gate.
- **Dangling registry path fails.** Given an `operations-registry.yaml` `path:` that
  points at no file, When the invariant test runs, Then it FAILS naming the dangling
  path.
- **Unresolvable step agent fails.** Given a CLAUDE.md step-table agent that resolves
  to no dispatchable file, When the invariant test runs, Then it FAILS.
- **Version disagreement fails.** Given VERSION, `package.json`, `plugin.json`,
  `marketplace.json` do not all match, When the SSOT test runs, Then it FAILS.
- **License disagreement fails.** Given `package.json.license` differs from the actual
  `LICENSE` file, When the SSOT test runs, Then it FAILS.
- **Stale count fails.** Given a documented count differs from a live disk count, When
  the count test runs, Then it FAILS.
- **Missing installer path fails.** Given an installer-written hook path that does not
  exist, When the test runs, Then it FAILS.
- **Paired-fix invariant.** For each new invariant test: Given today's tree, When it
  runs, Then it FAILS; and Given the paired fix has landed, When it runs, Then it
  PASSES.

## Findings addressed

- **C7** — match-anywhere frontmatter parser certifies the inert-frontmatter bug green.
- **A2** — skip-guard pattern turns a deleted module into `pass 0 / fail 0 / skip 1`
  (green under `# fail 0`), reproduced across 55 sites.
- **A4** — coverage is never measured; the "≥ 80%, 0 skipped" gate has no instrument.
- **B1–B6** — the cross-file invariant class: registry-path resolution, step-agent
  resolution, version/license single-source-of-truth, documented-count
  self-verification, installer-path existence (and `release.test.js` guarding a
  hand-copied duplicate rather than the real config).

## INVEST status (per story)

| Story | I | N | V | E | S | T |
|---|---|---|---|---|---|---|
| Module-absent must FAIL not skip `[MVP]` | Y | Y | Y | Y | Y | Y |
| Convert 55 skip-guard sites to hard-require | Y | Y | Y | Y | Y | Y |
| Wire coverage instrumentation `[MVP]` | Y | Y | Y | Y | Y | Y |
| `# skipped > 0` treated as failure | Y | Y | Y | Y | Y | Y |
| Registry-path + step-agent resolution test `[MVP]` | Y | Y | Y | Y | Y | Y |
| Version/license single-source-of-truth test | Y | Y | Y | Y | Y | Y |
| Documented-count self-verify test | Y | Y | Y | Y | Y | Y |
| Installer-path existence test | Y | Y | Y | Y | Y | Y |

All stories pass INVEST. The four Activity-3 stories share a "read two sources,
compare" harness but each fails on a distinct real defect and delivers value alone.

## Decisions Taken Under Ambiguity

- **No Business Model Canvas.** This is a technical remediation workstream; a BMC is
  N/A. Proceeded without kicking back per the vision decomposition brief.
- **W06 changes tests only.** Where an invariant test needs a production defect fixed
  to go green, the fix belongs to that defect's own workstream; W06 owns the test that
  witnesses it. This preserves the "pairs with every workstream" intent without W06
  editing production code the other agents own.
- **Coverage tool unspecified.** The vision requires coverage be "actually measured"
  but names no tool. `node --test --experimental-test-coverage` (built-in, no new dep)
  is the presumptive choice for the implementation planner; the acceptance criterion
  asserts a real figure and an <80% failure, not a specific tool.
- **55-site count taken from the audit.** The skip-guard site count is the audit's
  figure; the acceptance criterion drives on behavior (absence fails) rather than the
  exact number, so a small drift in count does not invalidate the tests.
