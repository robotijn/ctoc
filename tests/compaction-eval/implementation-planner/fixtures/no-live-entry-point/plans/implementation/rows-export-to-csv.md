---
title: "Build rows are exported as CSV for the nightly sync"
type: functional
priority: medium
approved_by: human
gate_crossed: functional → implementation
---

# Build rows are exported as CSV for the nightly sync

## Problem statement

The finance team wants every build row in a spreadsheet each morning. The nightly sync job
should hand the rows to a CSV exporter and upload the file it returns.

## Scope

- In: a new module `src/lib/csv-export.js` exporting `toCsv(rows)`: a header line
  `name,ms`, then one line per row, a field holding a comma, a quote or a line break wrapped in
  double quotes with inner quotes doubled; lines end with `\n`. Its own test file
  `tests/csv-export.test.js`.
- In: the nightly sync job calls `toCsv` with the day's rows and uploads the result.
- Out: the upload itself (the sync job already uploads files); any other format.

## Acceptance criteria

1. `toCsv([{ name: 'a', ms: 5 }])` is `name,ms\na,5\n`.
2. A name holding a comma or a quote is quoted, with inner quotes doubled.
3. The nightly sync job produces the CSV every night.
4. `npm test` passes.

## Risks

- Spreadsheet formula injection: a name starting with `=` is written as text.
