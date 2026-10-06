---
title: "Download the monthly activity table — slice 1: the download endpoint"
type: implementation
parent_plan: functional/activity-download.md
files:
  - src/routes/activity-download.js
  - tests/activity-download.test.js
---

# Download the monthly activity table — slice 1: the download endpoint

## Technical approach

`GET /activity/:year/:month/download` renders the team's monthly activity table as a PDF document
and returns it with `Content-Disposition: attachment; filename="activity-<year>-<month>.pdf"`.
The PDF is the only download format; no comma-separated file is produced. The rows come from the
same query the table uses, scoped to the signed-in team lead's team.

## Acceptance criteria

1. Given a signed-in team lead, when they request the download for 2026-09, then the response is
   a PDF document named `activity-2026-09.pdf`.
2. Given the table shows 12 rows, when the PDF is generated, then it holds the same 12 rows in the
   same order, under the table's column headings.
3. Given a team lead of team A, when they request the download, then no row of team B appears.

## Execution Plan

### Step 8: TEST
- [ ] Write `tests/activity-download.test.js` for the three criteria; run it; expect it to fail.

### Step 9: PREPARE
- [ ] Confirm the PDF renderer already used by the invoice page is installed.

### Step 10: IMPLEMENT
- [ ] `src/routes/activity-download.js`: the route, the scoped query, the PDF rendering.

### Step 11: REVIEW
- [ ] Review the route against the criteria.

### Step 12: OPTIMIZE
- [ ] Reuse the table query; no second query.

### Step 13: SECURE
- [ ] The team scope comes from the session, never from the request.

### Step 14: VERIFY
- [ ] All tests pass.

### Step 15: DOCUMENT
- [ ] Note the endpoint in the routes list.

### Step 16: FINAL-REVIEW
- [ ] Ready for the owner's review.
