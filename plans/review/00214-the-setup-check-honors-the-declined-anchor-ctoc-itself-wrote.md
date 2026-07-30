---
approved_by: human
approved_at: 2026-07-21T14:00:00.000Z
gate_crossed: implementation → todo
---

---
iron_loop: true
title: "The setup-completeness check honors the declined anchor CTOC itself wrote, instead of calling a valid project unset"
type: implementation
parent_plan: none
depends_on: none
priority: CRITICAL
program: fresh-repository-first-run
files:
  - "src/commands/start.js"
  - "tests/setup-check-honors-declined-anchor.test.js"
  - "CLAUDE.md"
scope_extension:
  authorized_by: human
  authorized_at: 2026-07-21
  reason: >
    A live user opened CTOC on a project that had explicitly DECLINED a
    compliance regime — recorded by CTOC itself as `declined: true` — and the
    setup-completeness check reported "no usable regulatory_regime.active_profiles
    anchor", flagged the project "not fully set up", and ran the pipeline
    half-alive (no questions, no implementation). The owner's words: "how can it
    use the old settings after an update? that is soooo wrong." It is not an
    update/schema problem: the reader of record (regulatory-regime.loadActiveProfiles)
    treats `declined: true` as the first-class None marker, but
    complianceAnchorUsable in start.js imports that reader, calls it
    "readerOfRecord", then IGNORES it and demands a literal non-empty
    active_profiles: line — so CTOC rejects the exact value CTOC wrote. Two
    predicates for one fact, disagreeing. Fix: the completeness check honors
    what the reader honors.

# The setup check rejects the declined anchor CTOC itself wrote

`complianceAnchorUsable(root)` in `src/commands/start.js` decides whether a
project's `regulatory_regime` anchor is usable. It imports
`regulatory-regime.loadActiveProfiles` — the reader of record — and even names
the local binding `readerOfRecord`. Then, instead of honoring that reader's
verdict, it re-derives its own stricter one: it requires a literal
`active_profiles:` line with a non-empty INLINE value (`start.js:656-661`) and
returns `false` when that line is absent.

But `loadActiveProfiles` (`src/lib/regulatory-regime.js:228-239`) treats
`declined: true` as a **first-class, valid anchor** — its own comment: "the
durable None marker ... the human explicitly declined an EU compliance regime (a
DIFFERENT verb from an empty active_profiles list)". CTOC's own setup WRITES
`declined: true` when the human declines. So a project that correctly declined a
regime — the normal state for anything with no regulated data — has:

```
regulatory_regime:
  declined: true
```

no `active_profiles:` line, and `complianceAnchorUsable` returns `false`.
`verifySetup` (`:685-686`) then pushes `"<settings> (no usable
regulatory_regime.active_profiles anchor)"` into `missing`, `setup.ok` is
`false`, and the human reads "Nothing here will work properly until that is
fixed" while the pipeline runs and advances nothing.

## The contract

**A regulatory anchor is USABLE when the reader of record can determine the
regime from it.** The reader determines the regime when EITHER:
- `declined === true` (the human explicitly chose no regime), OR
- an `active_profiles` list is present (a non-empty inline list of regimes, OR
  an explicit empty list `[]` meaning "none selected").

`complianceAnchorUsable` must return `true` in all of those, and `false` only
when the block carries NEITHER an `active_profiles` line NOR `declined: true` —
i.e. a genuinely unconfigured anchor. It must not re-implement a predicate
stricter than the reader it imports; the reader is the one source of truth for
what a usable anchor is.

## Why this is the right fix, not a widening

This is not loosening a check to make a red project green. `declined: true` is a
COMPLETE, human-made choice that CTOC's own writer produces and CTOC's own reader
honors. The bug is that a second, stricter predicate was added downstream that
disagrees with the first. Closing the disagreement — one predicate, one fact —
is the fix. A project with an empty `regulatory_regime:` block and neither
marker is still correctly "not set up".

## Decisions Taken Under Ambiguity

### Drove the exported `verifySetup`, not `complianceAnchorUsable`
`complianceAnchorUsable` is not exported from `src/commands/start.js`; `verifySetup`
is. The plan permits "the exported surface", and `verifySetup` is the human-facing
verdict — it is what pushes the anchor reason into `missing`. Each fixture writes
only `.ctoc/settings.yaml`, and the tests assert on whether `missing` contains an
entry naming `regulatory_regime`. That isolates the anchor verdict from the
state/stage-dir artifacts `verifySetup` also checks, so no full `.ctoc/` scaffold is
needed per fixture.

### The reader's return shape cannot distinguish explicit-empty from absent, so inline-value presence is still detected directly
`loadActiveProfiles` collapses `active_profiles: []` and "no active_profiles line at
all" to the same `{ profiles: [], declined: false }`. Deferring to the reader for the
`declined` fact is enough for the declined anchor, but the explicit-empty case (`[]`,
usable) and the unconfigured case (no line, not usable) are indistinguishable from the
reader's return. So the fix still reads the settings file to detect an
`active_profiles:` line carrying an inline value. This is not a stricter predicate about
the `declined` fact — it is unchanged, pre-existing logic about the active_profiles
fact, now reached only when `declined` is not true.

### The MINIMAL fix — only the declined fact changed; block-style handling is untouched
An earlier draft of this fix widened the active_profiles branch to accept ANY
`active_profiles:` line (a presence regex), including a bare header and a block-style
list (`active_profiles:` with items on following `- ` lines). That was over-broad and
WRONG: `tests/menu-reports-what-init-did.test.js` case `5b` deliberately asserts a
block-style anchor "counts as missing — the writer refuses a block-style list", because
`compliance-regime.writeActiveProfiles` does a line-targeted INLINE replacement and can
never persist onto a block list. That is a real, tested contract, and the plan's
contract enumerates only inline forms (a non-empty inline list, OR an explicit empty
`[]`) — it never asked to change block-style handling. The final fix therefore restores
the exact old inline-value discrimination and adds ONLY the `declined: true` deferral in
front of it. My initial claim that "no test guarded block-style rejection" was made
before I ran the full suite; the full suite is the arbiter and it caught the overreach.

### Missing-message wording updated
The `missing` entry read `(no usable regulatory_regime.active_profiles anchor)`, which
named only `active_profiles` and would be wrong now that `declined: true` is also a
usable anchor. It now reads `(no usable regulatory_regime anchor: neither
active_profiles nor declined)`. Still project-relative, no settings content echoed.

### The plan slightly overstated the red count
The plan's Step 8 says "the three 'usable' cases where the code is still wrong must be
RED first". Only ONE case is RED pre-fix: `declined: true`. The `active_profiles:
[gdpr]` and `active_profiles: []` cases were ALREADY green under the old predicate
(the old inline-value check returned true for both — `[gdpr]` and `[]` are both
non-empty inline strings). The live user's `[]` workaround succeeded for exactly that
reason. The brief's framing (only the declined case is the RED defect; the other two
are regression guards) is the accurate one. Every green is accounted for by mutation:
mutating the fallthrough to `return true` reddens the two teeth cases (neither / no
block); mutating it to `return false` reddens the two usable regression guards while
the declined case stays green via its own path.

## Execution Plan (Steps 8-16)

### Step 8 — TEST (TDD, write first, run, see red)
- [x] Complete — evidence in this step's section and this plan's verification log; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).

Write `tests/setup-check-honors-declined-anchor.test.js` FIRST and see it RED.
Drive the REAL `verifySetup` / `complianceAnchorUsable` (or the exported surface)
against settings fixtures, asserting what a human's setup verdict IS:
- `regulatory_regime:` with `declined: true` and NO active_profiles line →
  anchor USABLE, `verifySetup` does NOT list the settings as missing for the
  anchor reason. THIS IS THE DEFECT — it must be RED before the fix.
- `active_profiles: [gdpr]` (inline non-empty) → usable (regression guard: still
  works).
- `active_profiles: []` (explicit empty list) → usable (the explicit-none case
  the live patch used).
- `regulatory_regime:` block with NEITHER active_profiles NOR declined → NOT
  usable (the check keeps its teeth for a genuinely unconfigured anchor).
- no `regulatory_regime:` block at all → NOT usable.
Account for every green individually. The three "usable" cases where the code is
still wrong must be RED first; the "not usable" cases may be green pre-fix —
prove each bites by mutating the fixed predicate to accept a truly-empty anchor
and showing it goes RED.

### Step 9 — PREPARE
- [x] Complete — evidence in this step's section and this plan's verification log; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
Re-read `complianceAnchorUsable` and `loadActiveProfiles` against the live files;
confirm the reader's return shape (`{ profiles, overrides, declined }`) and that
`declined` is exposed, so the check can defer to it rather than re-parse.

### Step 10 — IMPLEMENT
- [x] Complete — evidence in this step's section and this plan's verification log; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
Make `complianceAnchorUsable` honor `declined: true` (and an explicit empty
`active_profiles`) as usable, deferring to the reader-of-record's determination
rather than a stricter re-parse. Update the missing-message wording so it no
longer names only `active_profiles` if the fix changes what is required.

### Step 11 — REVIEW
- [x] Complete — evidence in this step's section and this plan's verification log; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
The completeness check and the reader now agree on what a usable anchor is; a
declined project reads as set up; a genuinely empty anchor still reads as not
set up.

### Step 12 — OPTIMIZE
None.

### Step 13 — SECURE
- [x] Complete — evidence in this step's section and this plan's verification log; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
The `missing` list still holds only project-relative display paths, never
absolute paths; no settings content is echoed into the message.

### Step 14 — VERIFY
- [x] Complete — evidence in this step's section and this plan's verification log; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
`npx eslint src/commands/start.js tests/setup-check-honors-declined-anchor.test.js
--max-warnings 0`; `node --test tests/*.test.js` fail 0; `npm test` (redirect,
read `$?`, no pipe) real gate PASS; floor 99 (a normal-dev-machine floor, thin
margin — cover what you add); false-green + both reachability + gate-words fences
pass; no baseline entry.

### Step 15 — DOCUMENT
The plan record and the corrected in-code comment on `complianceAnchorUsable`
(it now honors the reader, not a stricter re-parse) are the documentation.

### Step 16 — FINAL-REVIEW
- [x] Complete — evidence in this step's section and this plan's verification log; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
A project that declined a compliance regime opens CTOC and is treated as fully
set up — the pipeline runs, asks questions, and implements, instead of narrating
that nothing will work.
