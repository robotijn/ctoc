---
title: "At most ten critiques start per open unless the human sets another number, and the rest are counted where he looks"
type: implementation
status: implementation
parent_plan: small-changes-take-a-small-path
depends_on: 00413-small-changes-take-a-small-path-s13-one-critique-per-group
priority: high
effort: medium
files:
  - src/lib/settings.js
  - src/lib/streaming-precompute.js
  - src/lib/loop-b-driver.js
  - tests/critique-cap.test.js
  # Ratchet file: a new test file moves a documented count, and CLAUDE.md states the default.
  - CLAUDE.md
---

# At most ten critiques start per open unless the human sets another number, and the rest are counted where he looks

Read the parent plan first: Part B item 5, decisions 10, 17 and 21, and criterion 25.

## The problem in plain words

Even after the earlier Part B slices, one open could start as many critiques as there are pre-build plans needing questions, all competing with builds for the same five agent places. Decision 21 sets a hard limit on critiques started per open, 10 by default, settable by the human in `.ctoc/settings.json`. Nothing is silently skipped: the rest are reported as "not yet critiqued" in the same unit of work that computes them, on the screens where the pending decisions are shown and in the session-start directive.

## What the code does today (read on 2026-09-30)

```js
// src/lib/settings.js
const SETTINGS_SCHEMA = { /* … */ workflow: { label: 'Workflow Settings', settings: [
  { key: 'enforcementMode', … }, { key: 'requireReviewGate', … }, { key: 'escapePhrases', … } ] } };
function readRawSettings(projectPath) { /* {} when absent OR unparseable */ }
```

```js
// src/lib/loop-b-driver.js — loopBDirective(root) is rendered by streamingGateScreen's
// on-open banner (/ctoc:start), by the overview tab (src/tabs/overview.js) and by
// src/hooks/SessionStart.js; it composes crossedLines, needQuestionLines, nextBuildLines.
```

After the critique-queue and grouping slices, `critiqueQueue` returns `cap: { value: null, source: 'none' }` and a `remainder` holding only held groups, and the session-start directive and the dashboard recipe already state `remainder` when it is above zero.

The site that renders the remainder was identified by reading the render chain (`streamingGateScreen` → `engineStatusBanner` → `loopBDirective`, and the overview tab's own banner), not by running the dashboard; the first step below runs it.

## First, establish (before any code)

Run the real `/ctoc:start` screen code and the overview tab in a scratch project with pending pre-build plans, and confirm the loop-b lines appear above the first decision on both. If the pending-decision count is rendered anywhere else the human looks, the remainder line goes there too (file the scope-growth question for that file if it is not listed here).

## Files and signatures

### Modify `src/lib/settings.js`

```js
{ key: 'critiquesPerOpen', label: 'Critiques started per open', type: 'number', default: 10 }
// added to SETTINGS_SCHEMA.workflow.settings
```

### Modify `src/lib/streaming-precompute.js`

```js
/** The cap, read from the RAW settings so "absent" and "unreadable" stay different facts.
 *  Absent → { value: 10, source: 'default' }; a whole number >= 0 → { value, source: 'setting' };
 *  anything else ("ten", -1, 2.5, null, true) → { value: 10, source: 'unreadable' }. Never throws.
 *  Module-private. */
function resolveCritiqueCap(root) { /* … */ }
```

`critiqueQueue` applies the cap after grouping: the first `cap.value` candidate units stay in `units`; every further unit moves to `remainder` alongside held groups; `remainder.critiques` counts units, `remainder.plans` counts their members, `remainder.refs` lists the members' references. Units already in flight are neither dispatched nor counted as dispatched. The count is computed on every call, never stored.

### Modify `src/lib/loop-b-driver.js`

`crossedLines` already hands on the decisions list (pre-build slice); `loopBDirective` passes it to `critiqueQueue(root, decisions)` — no extra call to `pendingGateDecisions` — and adds one plain-words line when `remainder.critiques` is above zero or the setting is unreadable:

- "Not yet critiqued: N (covering M plans). CTOC starts at most K critiques each time it opens; the number is `workflow.critiquesPerOpen` in .ctoc/settings.json."
- when unreadable: "The critiques-per-open setting could not be read, so the default of 10 applies."

The line carries no approval-moment number and no raw stage name (the language rule the module header records).

## Tests to write first (each run and seen failing before any code)

In `tests/critique-cap.test.js`, against a scratch pipeline with 12 candidate critiques (12 single plans in `implementation/` with no questions):

1. No setting → 10 units, `remainder.critiques` 2, `cap` `{ 10, 'default' }`; the loop-b banner and the session-start directive both say 2 are not yet critiqued. Red: 12 units and no line today.
2. Setting 3 → 3 units, 9 in the remainder.
3. Setting `"ten"`, -1, 2.5 → 10 units, `cap.source` `'unreadable'`, and the banner says the setting could not be read.
4. Setting 0 → no units and all 12 in the remainder; the session-start directive carries no dispatch instruction and states that 12 critiques were not started; the banner reports 12.
5. The count is computed: removing two candidates between calls changes the remainder accordingly.
6. Two candidates with non-terminal precompute tasks → neither dispatched nor counted as dispatched; with no setting the queue holds the other 10 and the remainder is 0.
7. `loadSettings` returns 10 for `workflow.critiquesPerOpen` in a fresh project; the menu's settings schema lists it under Workflow.
8. Criterion 25's references: `remainder.refs` names exactly the plans held back.

Before building, open `tests/settings.test.js` and `tests/settings-format-single-encoding.test.js`: if either pins the exact list of workflow settings, that assertion changes only by tightening toward the new schema, with the justification written at the change (the contract is decision 21 of the parent; the test asserts the replaced schema; what newly fails is the setting disappearing).

## Where the new code is reached from

`critiqueQueue` feeds the session-start directive, the stop-hook directive, the dashboard recipe and the loop-b banner; `loopBDirective` is rendered by `/ctoc:start`'s default screen, the overview tab and the session-start context. The schema entry is read by `loadSettings` and shown by the menu's settings screen.

## Acceptance scenarios

On this repository's pipeline as the parent lists it (at most 12 pre-build candidates, fewer once grouped), one open starts at most 10 critiques — at most 50 agent runs under the four-lens recipe, against the 540 to 600 computed for the recipe as it was — and the human sees how many were held back and how to change the number.

## Security review

The setting lives in `.ctoc/settings.json`, which is agent-writable under the `.ctoc/` whitelist (finding 1 in the parent); the cap is a noise limit, not a gate, and the parent says so. An unreadable value never reads as "no limit".

## Out of scope

Making the settings files agent-unwritable (finding 1). Any change to the slot limit in `src/hooks/PreToolUse.Task.js`.

## CLAUDE.md

In the streaming-questions section, state the default cap of 10 critiques per open, the setting's name, and that the remainder is shown on `/ctoc:start` and in the session-start context. Update the documented test-file count.

## Decisions Taken Under Ambiguity

1. **The setting lives under `workflow`** in the schema, beside the other pipeline behaviour settings, as `critiquesPerOpen`.
2. **The cap is resolved from the raw settings file**, because the merged settings would turn a missing value into the default and hide an unreadable one. A `.ctoc/settings.json` that fails to parse at all reads as absent (the existing `readRawSettings` behaviour) and therefore reports the default, not "unreadable" — a limit of this slice, stated here rather than hidden.
3. **Held groups and capped units share one remainder**, because both are "not yet critiqued" to the human.
