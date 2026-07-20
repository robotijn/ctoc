---
approved_by: human
approved_at: 2026-07-20T09:18:53.986Z
gate_crossed: implementation → todo
---

---
title: "Five screen builders nobody calls are deleted — re-wording dead code would have been polish on a corpse"
type: implementation
parent_plan: none
depends_on: none
priority: high
program: fresh-repository-first-run
iron_loop: true
files:
  - "src/lib/ui.js"
  - "tests/ui.test.js"
  - "tests/hooks.test.js"
  - ".ctoc/export-reachability-baseline.json"
---

# Five screen builders nobody calls

`src/lib/ui.js` carries four more human-facing gate numbers:

```
:47-48    Gate 1:  ✓ Passed / ○ Pending      (in `dashboard`)
:119-120  Gate 1 (after step 4): …           (in `progress`)
:178-180  2. Get user approval at Gate 1     (in `blocked`)
```

The obvious move is to re-word them like every other screen. That would have been
wrong, and finding out why is the point of this slice.

## Verified: nothing in the product calls them

`src/lib/ui.js` exports seven names. Searching every `require` of the module:

| export | required by | live? |
|---|---|---|
| `colors` | `src/hooks/PreToolUse.Bash.js:66` | **yes** |
| `writeToTerminal` | `src/hooks/PreToolUse.Bash.js:66`, `src/hooks/SessionStart.js:16` | **yes** |
| `dashboard` | nothing outside `tests/ui.test.js` | no |
| `progress` | nothing outside `tests/ui.test.js` | no |
| `adminDashboard` | nothing outside `tests/ui.test.js` | no |
| `blocked` | `tests/hooks.test.js:858` and `tests/ui.test.js` | no |
| `getPhase` | nothing outside `tests/ui.test.js` | no |

Five of the seven exports have exactly one kind of caller: a test. **A test is a
caller, so a green test here proves the function runs — it proves nothing about a
human ever reaching it.** That is this repository's sixteenth operating lesson, and
these five are a live instance of it: screen builders, fully tested, that no screen
builds.

The content confirms it. `blocked` prints `Required Step: 8 (TEST)` and
`THE IRON LOOP IS HOLY. IT CANNOT BE BYPASSED.` — the enforcement path that
actually blocks an edit today is `src/hooks/PreToolUse.Edit.js`, which writes its
own message and never touches this function. `adminDashboard` renders a
seven-column kanban with columns (`BACKLOG`, `TECHNICAL`, `READY`) that are not the
pipeline's stages any more. `dashboard` and `progress` render a two-gate model when
the pipeline has four. These are not dormant utilities; they are a previous version
of the product, kept alive by its tests.

## Why deletion rather than re-wording

Re-wording them would produce five correctly-worded functions that no human can
reach, and it would make the gate-number fence green on code the fence has no
reason to care about. Worse, it would leave the impression the wording problem was
fully addressed while the thing a human actually reads is elsewhere.

Deleting them is also the only change that moves a ratchet in the right direction:
`.ctoc/export-reachability-baseline.json` tracks exports with no live caller, and
five entries leave it.

## Implementation Details

### File: `src/lib/ui.js`
**Action:** MODIFY
**Purpose:** Reduce the module to the two exports the product uses.
**Change Type:** deletion of dead code

Delete `dashboard`, `progress`, `adminDashboard`, `blocked` and `getPhase`, plus
any module-private constant (`STEP_NAMES` and any colour or phase table) left with
no remaining reader after those five are gone. Keep `colors` and `writeToTerminal`
byte-identical — both have live hook callers and neither is touched.

`module.exports` becomes:

```js
module.exports = { colors, writeToTerminal };
```

The module keeps its name and its file. It is now what its two live consumers
actually use: terminal colours and a terminal writer.

### File: `tests/ui.test.js`
**Action:** MODIFY
**Purpose:** Test what remains; stop testing what no longer exists.

Every case exercising a deleted export is DELETED, not weakened. Under this
project's rule that the code is fixed rather than the test, this is the narrow
legitimate case: the contract those cases assert has been explicitly removed, so
there is no behaviour left for them to protect. Loosening them instead — asserting
the functions "still return a string" — would be exactly the green-washing the rule
forbids.

Two cases are ADDED, so the deletion is defended rather than merely performed:

1. `module.exports` has exactly the keys `colors` and `writeToTerminal`.
2. The module source contains no string literal matching `/\bGate\s*[0-9]/i`.

### File: `tests/hooks.test.js`
**Action:** MODIFY
**Purpose:** Remove the one case that reaches into `ui.blocked`.

`tests/hooks.test.js:858` requires `{ blocked, colors }`. The case using `blocked`
is deleted; if the same case also exercises live hook behaviour, that behaviour is
retained and re-asserted against the hook's OWN message rather than against
`ui.blocked` — which is what the hook actually emits, and therefore the stronger
assertion.

### File: `.ctoc/export-reachability-baseline.json`
**Action:** MODIFY
**Purpose:** Record that the debt shrank.

Remove the five `src/lib/ui.js` entries and lower any associated maximum. **No
whitelist entry is added and no threshold is raised.** Debt shrinks; that is the
only direction this file may move.

### Wiring — the live call sites

This slice adds no module. It removes five unreachable ones. The two survivors keep
the call sites they already had:

| survivor | live call site | root |
|---|---|---|
| `colors` | `src/hooks/PreToolUse.Bash.js` | the edit-enforcement hook |
| `writeToTerminal` | `src/hooks/PreToolUse.Bash.js`, `src/hooks/SessionStart.js` | the enforcement hook and every session start |

## Test Plan

Covered by the modifications above. The full case list for `tests/ui.test.js`
after this slice:

| # | Case | Assertion |
|---|---|---|
| 1 | **exactly two exports** | `Object.keys(require('../src/lib/ui')).sort()` equals `['colors','writeToTerminal']` |
| 2 | **no gate number survives in the module** | the source file contains no literal matching `/\bGate\s*[0-9]/i` |
| 3 | **`colors` is unchanged** | the existing colour-code assertions, untouched |
| 4 | **`writeToTerminal` writes to standard error** | the existing assertion, untouched |
| 5 | **a deleted export is genuinely gone** | `require('../src/lib/ui').blocked` is `undefined` — so a re-introduction is caught here rather than by the reachability fence weeks later |

## What this slice does NOT fix

- It does not re-word anything. It removes code; the wording work lives in the two
  screen slices.
- It does not audit the rest of the repository for dead exports. The reachability
  baseline exists for that and this slice only shrinks it by the five entries it
  removes.
- It does not change the enforcement message a human actually sees when an edit is
  blocked. That message comes from `src/hooks/PreToolUse.Edit.js` and is untouched
  here — if it is badly worded, that is a separate finding and is not smuggled in.
- It does not verify that `blocked`'s replacement in the Edit hook says the right
  thing. Step 11 REPORTS on it; fixing it would be a different slice.

## Execution Plan (Steps 8-16)

### Step 8: TEST — add cases 1, 2 and 5 to `tests/ui.test.js` BEFORE deleting anything, run ONLY that file, record the red output verbatim. Cases 1, 2 and 5 MUST be red: all seven exports exist and the module is full of gate numbers today.
### Step 9: PREPARE — prove the five are dead, exhaustively, and do not trust this plan's table. Search the WHOLE repository (`src/`, `tests/`, `agents/`, `skills/`, `.claude-plugin/`, `src/scripts/`) for each of the five names, for `require('./ui')` and `require('../lib/ui')` in every form, and for dynamic property access (`ui[`, `ui.dashboard`, destructuring). Read `.ctoc/export-reachability-baseline.json` and confirm it already records these five as unreachable. **If ANY of the five has a live non-test caller, STOP and report — this plan is then wrong about that export and the correct change for it is re-wording, not deletion.**
### Step 10: IMPLEMENT — one step, files as sub-items.
  - `src/lib/ui.js` — delete the five exports and every private constant left with no reader.
  - `tests/ui.test.js` — delete the cases for the deleted exports; keep cases 1-5.
  - `tests/hooks.test.js` — delete the `ui.blocked` case; re-assert live hook behaviour against the hook's own message if that case carried any.
  - `.ctoc/export-reachability-baseline.json` — remove the five entries, lower the maximum.
### Step 11: REVIEW — confirm no file anywhere still names a deleted export. Confirm `colors` and `writeToTerminal` are byte-identical. Confirm the two hooks still load the module and still work. REPORT (do not fix) what the Edit hook's block message says today, since `blocked` was the previous encoding of that message and a reader deserves to know whether the live one is any better.
### Step 12: OPTIMIZE — the module gets smaller; there is nothing to tune. Confirm no remaining private constant is now unused.
### Step 13: SECURE — deleting a function a hook calls would break enforcement, which is a security-relevant path. Case 3 and 4 plus the hook tests prove both survivors still work. Confirm neither hook reaches any deleted name.
### Step 14: VERIFY — `node --test tests/ui.test.js tests/hooks.test.js tests/export-reachability.test.js tests/pretooluse-edit-coverage.test.js` green, then the full gated run `npm test`. Coverage will MOVE when 150-odd lines of tested-but-dead code leave the denominator — record the before and after figures verbatim and confirm the floor is not lowered to accommodate either direction. Lint the changed files. No git operations.
### Step 15: DOCUMENT — a header comment on `src/lib/ui.js` stating what the module is now (terminal colours and a terminal writer) and recording that five screen builders were removed as unreachable, with the date. A module whose scope shrank should say so.
### Step 16: FINAL-REVIEW — report the five deleted exports, the exhaustive evidence from Step 9 that each was dead, the coverage before and after, and every decision taken under ambiguity.

## Decisions Taken Under Ambiguity

1. **Delete rather than re-word.** Re-wording produces correctly-phrased code no
   human can reach and creates the false impression that the wording problem is
   solved. The measure is the human, and no human reaches these.
2. **The module file survives.** `colors` and `writeToTerminal` have live hook
   callers. Deleting the file would mean moving them, which touches two hooks for
   no gain.
3. **The `tests/ui.test.js` cases are DELETED, not loosened.** The contract they
   assert is explicitly removed. Loosening them to "still returns a string" would
   be green-washing; deleting them is the honest record that the behaviour is gone.
4. **The baseline is edited in the same slice.** The reachability fence fails
   loudly on unclaimed progress — the same behaviour the false-green baseline showed
   when debt shrank. Leaving it for a follow-up would make this slice fail its own
   gated run. No whitelist entry is added.
5. **Step 9 can STOP the slice.** The dead-export table is built from a `require`
   search, which cannot see dynamic property access. Rather than assume, Step 9
   proves it and is authorised to halt. An export that turns out to be live gets
   re-worded instead — a different change, correctly refused here.
6. **The Edit hook's message is reported, not fixed.** `blocked` was a previous
   encoding of that message, so a reader will reasonably ask whether the live one
   is any good. Answering is honest; fixing it in this slice would be scope creep
   into a file this plan does not declare.
