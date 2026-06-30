---
iron_loop: true
step: 4
step_label: CAPTURE
files:
  - eslint.config.js
  - src/lib/safe-fs.js
  - docs/SECURITY_LINT.md
status: functional
created: 2026-06-30
---

# LH1 — Codebase-wide `detect-non-literal-fs-filename` warning hygiene

## 1. ASSESS — Problem Understanding

### Business Context

CTOC's binding doctrine (`principle_warnings_are_bugs`) treats every linter
warning as a critical-tier defect: "time is a vector; today's warning is
tomorrow's crash." The repo currently carries **990 `eslint-plugin-security`
`detect-non-literal-fs-filename` warnings across 114 files** — the entire
filesystem layer. The lint gate is configured to pass on warnings (fail only on
errors), so this baseline has accumulated silently and now contradicts the
warnings-are-bugs rule.

### Current State

`detect-non-literal-fs-filename` is a **heuristic** that fires on ANY `fs.*`
call whose path argument is not a string literal — i.e. every module whose job
is to compute a path and act on it. Top carriers:

| File | Warnings |
|---|---|
| `src/lib/hooks-installer.js` | 52 |
| `src/lib/init-project.js` | 40 |
| `src/lib/actions.js` | 36 |
| `src/lib/project-analyzer.js` | 33 |
| `src/lib/iron-loop-enforcer.js` | 33 |
| `src/lib/auto-fixer.js` | 32 |
| `src/lib/state.js` | 20 |
| `src/lib/quality-scorer.js` | 20 |
| … 106 more files | balance of 990 |

The warning's *real* concern is path traversal. For the highest-risk module
(`stale-cleanup.js`, which moves/deletes plan files), the dedicated
security-scanner already **proved the traversal surface closed** (frozen stage
set, byte-identical slug round-trip, `lstat` symlink rejection, basename-only
dest). So the 990 are overwhelmingly heuristic false-positives — but they are
indistinguishable, at the gate, from a real traversal hole that *would* matter.

### Impact

- The warnings-are-bugs rule is unenforceable while 990 advisory warnings are
  the accepted norm: a genuinely dangerous new `fs` call (real traversal) is
  camouflaged in the noise.
- New fs-touching modules (like SP4's `stale-cleanup.js`) inherit the baseline
  and can't be shipped "warning-clean" without a codebase-wide decision —
  forcing per-PR inconsistency.
- A single-file suppression diverges from how `actions.js`/`state.js` handle it,
  breaking the Consistency quality dimension.

## 2. ALIGN — Approach Options (resolve at Gate 1 / planning)

This plan deliberately does NOT pre-pick the approach. Candidate strategies, to
be decided in DESIGN:

- **(A) Centralized audited `safe-fs.js` helper** — route all computed-path fs
  ops through one module that validates/contains the path (assert resolved path
  stays under an allowed root), suppress the rule once at that boundary. Biggest
  refactor (990 call-sites), but converts a heuristic into a real, tested
  containment invariant — genuine defense-in-depth, not just silence.
- **(B) Inline `eslint-disable-next-line … -- <justification>`** at each of the
  990 sites. Lowest architectural change, highest churn; every suppression
  documents why that specific path is safe. No central enforcement.
- **(C) Scoped config rationale** — document the fs-layer as an audited zone in
  `docs/SECURITY_LINT.md` and downgrade/justify the rule for `src/lib/*` fs
  modules with a written wontfix rationale. Pragmatic, but leaves the heuristic
  off where a real hole could hide.
- **(D) Hybrid (likely recommendation)** — `safe-fs.js` for the
  mutation-capable surface (move/delete/write by computed path — the modules
  where traversal actually matters), inline-justify the read-only remainder.

## 3. CAPTURE — Acceptance Criteria

### User Story

**As a** CTOC maintainer who treats warnings as bugs,
**I want** the 990 `detect-non-literal-fs-filename` warnings resolved by a
single consistent, codebase-wide strategy,
**so that** a genuinely dangerous fs call can never hide in advisory noise, and
new fs-touching modules ship warning-clean by default.

### BDD Scenarios

- [ ] **Scenario: zero `detect-non-literal-fs-filename` warnings remain**
  Given the chosen strategy is applied across all 114 files
  When `npx eslint src/` runs
  Then it reports 0 `detect-non-literal-fs-filename` warnings
  And the full test suite remains green (no behavior change)

- [ ] **Scenario: the resolution is consistent, not per-file ad-hoc**
  Given a reviewer inspects any two fs-touching modules
  Then both apply the same documented strategy (helper, inline-justify, or the
  agreed hybrid boundary), with the rationale recorded in `docs/SECURITY_LINT.md`

- [ ] **Scenario: real traversal containment is tested (if strategy A/D)**
  Given `safe-fs.js` exists
  When a computed path resolves outside its allowed root
  Then the helper throws (fail-closed), proven by a unit test — converting the
  heuristic into an enforced invariant rather than a suppressed warning

### In Scope

- A single codebase-wide strategy for the 990 warnings (per Gate-1 decision)
- `docs/SECURITY_LINT.md` recording the rationale and the boundary
- If A/D: `src/lib/safe-fs.js` + tests proving fail-closed containment
- Full-suite green after the change (pure hygiene, no behavior change)

### Out of Scope

- Changing any runtime behavior of the fs layer (this is hygiene only)
- The four human gates / enforcement logic (untouched)
- Other `eslint-plugin-security` rules (separate plans if they have baselines)

## Notes

- Origin: surfaced at SP4 Gate 3 (2026-06-30) — `stale-cleanup.js` could not
  ship "warning-clean" without this codebase-wide decision. Queued by user.
- Real numbers captured `2026-06-30` via `npx eslint src/`; re-measure at
  implementation (the count drifts as fs code is added).
