---
title: "A canonical Create React App project is detected — the dev-tool signal credits the dependency wherever it lives"
type: functional
status: functional
created: 2026-09-03
priority: high
effort: small
files:
  - src/lib/framework-detector.js
  - tests/framework-detector.test.js
  - tests/framework-detector-coverage.test.js
  - tests/remainder-security-tooling-coverage.test.js
approved_by: human
approved_at: 2026-09-03T12:03:05.134Z
gate_crossed: functional → implementation
---

# A canonical Create React App project is detected — the dev-tool signal credits the dependency wherever it lives

This plan is an INDEX of its implementation slices. The work is in the slice
file; the original functional plan is preserved in full below it.

## Slices (dependency-ordered)

| # | Slice file | Scope (one line) | depends_on |
|---|---|---|---|
| 1 | `00259-a-canonical-create-react-app-is-detected-s1-symmetric-credit.md` | `calculateConfidence`'s `packageDevDeps` loop credits through `hasDependency` (all four maps) instead of `hasDevDependency`, +10 weight unchanged, plus the five regression cases, the strengthened historical-layout guard and the corrected file header. | - |

### What the planner found that the functional plan did not know

Recorded here so a reader of the index sees it without opening the slice:

- **Five profiles carry `packageDevDeps`, not two:** `vue`
  (`@vue/cli-service`, `vite`), `svelte` (`@sveltejs/kit`), `react-vite`
  (`vite`, `@vitejs/plugin-react`), `react-cra` (`react-scripts`) and `remix`
  (`@remix-run/dev`). The other five profiles have no `packageDevDeps` and cannot
  change.
- **No existing test pins the defect.** No fixture in the suite places any of
  those six tool packages outside `devDependencies`, so every existing assertion
  stays green unchanged and nothing has to be weakened or replaced.
- **Scenario 3's rationale does not hold.** The `react-cra` disqualifier body
  (lines 297–300) is unreachable before AND after this change: `react-cra` has no
  config files, so it can only outrank `react-vite` by the `react-scripts` credit
  — which is the disqualifier's own predicate. The scenario's outcome (react
  without `react-scripts` and without a Vite signal → null) is still pinned, but
  through the `react-vite` disqualifier, and the slice says so rather than
  claiming coverage it does not have.
- **A sibling placement defect remains, reported and unpinned:**
  `hasViteSignal()` still reads `devDependencies` only, so a React + Vite app
  declaring `vite` in `dependencies` with no `vite.config.*` file is still
  detected as no framework after this fix. It is a second changed lookup, outside
  this plan's authorised scope, and needs its own plan.

## Original functional plan

## 1. ASSESS — Problem Understanding

Reproduced and recorded during the coverage wave (plan
`00251-…-remainder-security-tooling`, its Decisions section, and the header of
`tests/remainder-security-tooling-coverage.test.js`), verified on disk again
today:

A project with `react`, `react-dom` and `react-scripts` in **`dependencies`** —
exactly the layout Create React App's own generator writes — is detected as
**no framework at all** by `src/lib/framework-detector.js`, so the project's
whole security surface (the framework-specific checks keyed off the detection)
is silently skipped.

The cause is an asymmetry between two helpers in the same file:

- `calculateConfidence` credits the `packageDevDeps` signal through
  `hasDevDependency` (line ~201), which reads **only** `devDependencies` — so
  the canonical layout earns no credit for `react-scripts` and the `react-cra`
  profile under-scores.
- The disqualifier (line ~297) asks `hasDependency('react-scripts')`, which
  reads **all four** dependency maps — and the module's own FINDING 5(b)
  comment on `hasDependency` states the philosophy: read all four maps, because
  under-detecting a real web app silently skips its security surface.

A side effect: the `react-cra` disqualifier branch (lines ~297-300) is
unreachable under every shape the existing tests use (the wave measured this),
so the guard that should catch "react without react-scripts" has never executed.

## 2. ALIGN — Approach

**Make the credit symmetric with the disqualifier and with the module's own
philosophy:** `calculateConfidence`'s `packageDevDeps` loop credits a listed
dependency wherever it lives (the `hasDependency` lookup), keeping its lower
weight (+10). The field keeps its name — it means "typically declared as a dev
dependency", and the signal is presence, not placement. This is one changed
lookup, not a rescore: weights and thresholds stay as they are.

**Regression tests, red first:**
1. Canonical Create React App (`react` + `react-scripts` in `dependencies`, no
   config file) → detected as `react-cra` (RED today: currently null).
2. The historical shape (`react-scripts` in `devDependencies`) → still
   `react-cra` (guard, green today).
3. React with **no** `react-scripts` anywhere and no Vite signal → null via the
   `react-cra` disqualifier — making lines ~297-300 execute under a test for the
   first time.
4. A sweep across the other profiles carrying `packageDevDeps` (vite,
   `@vitejs/plugin-react`, and any siblings found at read time): assert that
   moving their dev-tool into `dependencies` now also detects (the intended
   direction — more real apps detected) and that no unrelated profile flips on
   the fixtures the existing suites already pin.
5. Correct the defect description in
   `tests/remainder-security-tooling-coverage.test.js`'s header (it documents
   the bug as live; after the fix it must say fixed and point at the regression
   case — a comment edit only, no assertion touched).

### Scope

**In scope:** the one-lookup change, the regression cases, the header
correction.
**Out of scope:** rescoring weights, adding profiles, the Remix FINDING 1
discussion in the same file, and any consumer change (`app-runner.js`,
`playwright-scaffolder.js` consume the verdict unchanged).

## 3. CAPTURE — Acceptance Criteria

```gherkin
Feature: A real app's security surface is never skipped by a placement detail

  Scenario: The generator's own layout is detected
    Given package.json with react and react-scripts in dependencies
    When detect() runs
    Then the verdict is react-cra

  Scenario: The historical layout still detects
    Given react in dependencies and react-scripts in devDependencies
    Then the verdict is react-cra

  Scenario: The disqualifier finally runs
    Given react with no react-scripts in any map and no Vite signal
    Then the verdict is null, through the react-cra disqualifier branch

  Scenario: No unrelated flip
    Given the fixtures the existing detector suites pin
    Then every existing assertion stays green unchanged

  Scenario: The gate holds
    When npm test runs
    Then fail 0, skipped 0, coverage at or above the floor
```

**Definition of Done:** the four scenarios green with case 1 seen red first;
the disqualifier branch covered; the stale header corrected; `npm test` green;
no assertion weakened.

## Notes for the implementation planner

One slice. Verify at read time: the exact line numbers, every profile carrying
`packageDevDeps` (enumerate them in the slice), and whether any existing test
asserts the OLD credit behaviour (a dev-tool in `dependencies` earning zero) —
if one does, it pins the defect and is tightened with a Lesson-14 justification
(the contract change is this human-ordered plan). Do NOT write an
`## Execution Plan` section of your own.

## Decisions Taken Under Ambiguity

1. **Symmetric lookup over adding `react-scripts` to `packageDeps`:** the
   per-profile patch would fix one framework and leave the same trap in every
   other `packageDevDeps` profile; the lookup change fixes the class, in the
   direction the module's own FINDING 5(b) already committed to.
2. **Weights unchanged:** the defect is placement-blindness, not scoring; a
   rescore would be unrequested scope.
