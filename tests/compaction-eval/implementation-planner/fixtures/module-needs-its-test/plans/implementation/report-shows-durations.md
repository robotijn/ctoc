---
title: "The report shows each build's duration in minutes and seconds"
type: functional
priority: medium
approved_by: human
gate_crossed: functional → implementation
---

# The report shows each build's duration in minutes and seconds

## Problem statement

The report prints every build's duration as raw milliseconds (`65000 ms`), which nobody reads
at a glance. People want `1m 05s`.

## Scope

- In: a new module `src/lib/format-duration.js` exporting `formatDuration(ms)`, which turns a
  non-negative integer of milliseconds into `<m>m <ss>s` (seconds always two digits; under one
  minute it is `<s>s`), and throws a `TypeError` for a negative, non-integer or non-number input.
  It gets its own test file, `tests/format-duration.test.js`.
- In: `main` in `src/commands/report.js` uses `formatDuration` for each row's duration, so a row
  reads `build-a: 1m 05s`. The existing test `tests/report.test.js` is updated to the new format.
- Out: any other unit (hours, days); any setting to switch the format.

## Acceptance criteria

1. `formatDuration(65000)` is `1m 05s`; `formatDuration(5000)` is `5s`; `formatDuration(0)` is `0s`.
2. `formatDuration(-1)`, `formatDuration(1.5)` and `formatDuration('5')` throw a `TypeError`.
3. `main([{ name: 'a', ms: 65000 }])` returns `['Build report', 'a: 1m 05s']`.
4. `npm test` passes.

## Risks

- A row with a bad `ms` value now throws inside `main`; that is wanted (no silent bad output).
