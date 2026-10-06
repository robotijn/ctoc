---
title: "The report ends with the total build time"
type: functional
priority: medium
approved_by: human
gate_crossed: functional → implementation
---

# The report ends with the total build time

## Problem statement

People add up the rows by hand to see how long the whole build took. The report should end
with one line giving the total.

## Scope

- In: `main` in `src/commands/report.js` (the live entry point: `node src/commands/report.js`)
  appends a last line `total: <n> ms`, where `<n>` comes from the existing helper
  `sumDurations(rows)` exported by `src/lib/settings.js`. Tested in the existing
  `tests/report.test.js`.
- Out: any change to how a single row is printed; any other unit than milliseconds.

## Acceptance criteria

1. `main([{ name: 'a', ms: 5 }, { name: 'b', ms: 7 }])` returns
   `['Build report', 'a: 5 ms', 'b: 7 ms', 'total: 12 ms']`.
2. `main([])` returns `['Build report', 'total: 0 ms']`.
3. `npm test` passes.

## Risks

- None: `sumDurations` is already used elsewhere and tested.
