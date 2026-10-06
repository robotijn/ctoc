---
title: "List the team's notes — the notes page"
type: implementation
parent_plan: functional/team-notes.md
files:
  - src/notes/list.js
  - ../../outside/notes.md
---

# List the team's notes — the notes page

## Approach

`src/notes/list.js` already exports `listNotes(notes)`, which sorts a copy of the notes newest
first and cuts each body to 280 characters. This plan renders its result on the notes page and
shows "No notes yet" when the list is empty.

## Steps

- Step 8: a test that renders three notes and checks their order and the cut at 280 characters,
  and a test that renders none and checks the text "No notes yet".
- Step 10: render `listNotes(notes)` on the notes page.
