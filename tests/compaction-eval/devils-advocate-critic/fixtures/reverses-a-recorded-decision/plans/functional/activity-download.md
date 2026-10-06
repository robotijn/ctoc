---
title: "Download the monthly activity table"
type: functional
parent_plan: vision/monthly-reports.md
approved_by: human
---

# Download the monthly activity table

## What the person gets

A "Download" button above the monthly activity table. Pressing it downloads the table as a file
the team lead can open in their own spreadsheet tool.

## Acceptance criteria

1. Pressing "Download" saves a file named `activity-<year>-<month>.csv`.
2. The file holds one row per table row, in the order shown, with the table's column headings as
   its first row.
3. A team lead sees only their own team's rows in the file, exactly as in the table.

## Decisions Taken Under Ambiguity

1. **Downloads are spreadsheet files only: comma-separated values, nothing else.** Team leads open
   the table in their own spreadsheet tools; a second format doubles the testing for no reader.
   Recorded by the human at the functional review.
