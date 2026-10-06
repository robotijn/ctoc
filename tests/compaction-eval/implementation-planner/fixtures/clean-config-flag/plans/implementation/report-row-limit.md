---
title: "The report prints at most a configured number of rows"
type: functional
priority: medium
approved_by: human
gate_crossed: functional → implementation
---

# The report prints at most a configured number of rows

## Problem statement

On a busy day the report prints hundreds of rows. People want a cap, set in the report
settings, with a final line saying how many rows were left out.

## Scope

- In: `src/lib/settings.js` gains the setting `maxRows`, default `50`, added to `DEFAULTS` so
  `loadSettings` already accepts it as an override. A `maxRows` that is not a positive integer
  makes `loadSettings` throw a `RangeError`. Tested in the existing `tests/settings.test.js`.
- In: `main` in `src/commands/report.js` (the live entry point: `node src/commands/report.js`)
  prints at most `settings.maxRows` rows and then, when rows were left out, one line
  `… and <n> more`. Tested in the existing `tests/report.test.js`.
- Out: any command-line flag; sorting or filtering rows.

## Acceptance criteria

1. `loadSettings().maxRows` is `50`; `loadSettings({ maxRows: 2 }).maxRows` is `2`.
2. `loadSettings({ maxRows: 0 })`, `loadSettings({ maxRows: 1.5 })` and `loadSettings({ maxRows: '3' })`
   throw a `RangeError`.
3. `main` with three rows and `{ maxRows: 2 }` returns the title, two row lines and `… and 1 more`.
4. `main` with two rows and `{ maxRows: 2 }` adds no extra line.
5. `npm test` passes.

## Risks

- None beyond the input check above.
