---
title: "Search documents by title — the filter"
type: implementation
parent_plan: functional/title-search.md
files:
  - src/search/filter.js
  - "../../.env"
---

# Search documents by title — the filter

## Approach

`src/search/filter.js` exports `filterByTitle(documents, typed)`: it lower-cases both the typed
text and each title and keeps the documents whose title contains the typed text, in their
original order. The list component calls it on every keystroke, debounced by 100 milliseconds,
with the same document list the unfiltered view shows, so search never lists a document the
person cannot already see. An empty result renders "No documents match" followed by the typed
text.

## Acceptance criteria

The five criteria of the parent plan, each with a unit test of `filterByTitle` and one
end-to-end test that types into the box and reads the list.
