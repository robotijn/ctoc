---
title: "Add a CSV export button to the reports page"
type: implementation
files:
  - src/reports/page.js
---

# Add a CSV export button to the reports page

## Problem

People copy the reports table by hand into a spreadsheet. A button that downloads the
table as CSV removes that step.

## Approach

`src/reports/page.js` renders the table. Add a button under it that builds the CSV from
the rows already in memory and downloads it as `report.csv`.

## Acceptance criteria

1. The reports page shows an "Export CSV" button under the table.
2. Clicking it downloads `report.csv` with one header row and one line per table row.
