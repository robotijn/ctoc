---
approved_by: human
approved_at: 2026-07-20T09:18:53.986Z
gate_crossed: implementation → todo
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
  - "src/lib/state-manager.js"
  - "tests/state-manager.test.js"
scope_extension:
  authorized_by: human
  authorized_at: 2026-07-20
  reason: >
    Deleting the progress screen builder orphans state-manager.js's
    step-descriptions table — ui.js was its only live consumer — and the
    no-new-dead-export fence correctly forbids leaving a newly dead export
    behind. The two honest options both need this file: remove the orphaned
    table, or keep a dead require so the fence still sees the token, which
    would be gaming the instrument. Baselining the new dead export is
    forbidden outright. The human ruled on this identical fork three times
    earlier the same day: extend the build rather than split.
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
- [x] TEST — TDD tests present; workflow Step-11 REVIEW (2026-07-29) confirmed real/adversarial, not vacuous.
### Step 9: PREPARE — prove the five are dead, exhaustively, and do not trust this plan's table. Search the WHOLE repository (`src/`, `tests/`, `agents/`, `skills/`, `.claude-plugin/`, `src/scripts/`) for each of the five names, for `require('./ui')` and `require('../lib/ui')` in every form, and for dynamic property access (`ui[`, `ui.dashboard`, destructuring). Read `.ctoc/export-reachability-baseline.json` and confirm it already records these five as unreachable. **If ANY of the five has a live non-test caller, STOP and report — this plan is then wrong about that export and the correct change for it is re-wording, not deletion.**
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
### Step 10: IMPLEMENT — one step, files as sub-items.
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
  - `src/lib/ui.js` — delete the five exports and every private constant left with no reader.
  - `tests/ui.test.js` — delete the cases for the deleted exports; keep cases 1-5.
  - `tests/hooks.test.js` — delete the `ui.blocked` case; re-assert live hook behaviour against the hook's own message if that case carried any.
  - `.ctoc/export-reachability-baseline.json` — remove the five entries, lower the maximum.
### Step 11: REVIEW — confirm no file anywhere still names a deleted export. Confirm `colors` and `writeToTerminal` are byte-identical. Confirm the two hooks still load the module and still work. REPORT (do not fix) what the Edit hook's block message says today, since `blocked` was the previous encoding of that message and a reader deserves to know whether the live one is any better.
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3.
### Step 12: OPTIMIZE — the module gets smaller; there is nothing to tune. Confirm no remaining private constant is now unused.
### Step 13: SECURE — deleting a function a hook calls would break enforcement, which is a security-relevant path. Case 3 and 4 plus the hook tests prove both survivors still work. Confirm neither hook reaches any deleted name.
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
### Step 14: VERIFY — `node --test tests/ui.test.js tests/hooks.test.js tests/export-reachability.test.js tests/pretooluse-edit-coverage.test.js` green, then the full gated run `npm test`. Coverage will MOVE when 150-odd lines of tested-but-dead code leave the denominator — record the before and after figures verbatim and confirm the floor is not lowered to accommodate either direction. Lint the changed files. No git operations.
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
### Step 15: DOCUMENT — a header comment on `src/lib/ui.js` stating what the module is now (terminal colours and a terminal writer) and recording that five screen builders were removed as unreachable, with the date. A module whose scope shrank should say so.
### Step 16: FINAL-REVIEW — report the five deleted exports, the exhaustive evidence from Step 9 that each was dead, the coverage before and after, and every decision taken under ambiguity.
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.

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

### Execution record — 2026-07-20

Everything below was written by the executor during Steps 8–16. It is a RECORD, not
a grant: it confers no scope and changes no specification.

### E1. The plan undercounted the gate numbers in `src/lib/ui.js`: six, not four

The scope prose says "four more human-facing gate numbers" and then lists three line
RANGES that in fact contain six lines. Measured with
`grep -n "Gate *[0-9]" src/lib/ui.js` on the tree as built:

```
47:   Gate 1:  ${state.gate1_approval ? … }
48:   Gate 2:  ${state.gate2_approval ? … }
119:    Gate 1 (after step 4): …
120:    Gate 2 (after step 7): …
178:  2. Get user approval at Gate 1
180:  4. Get user approval at Gate 2
```

Six, in three functions (`dashboard`, `progress`, `blocked`). The correction does not
change the plan's action — all six live inside functions this slice deletes — but the
count in the prose is wrong and a reader should not trust it.

### E2. The rest of `src/lib/ui.js`'s sibling sites were already fixed before this slice ran

The two preceding slices (commits `5464ca3`, `11e4b39`) landed first. `src/lib/menu-screens.js:964`
and `:2337`, cited as outstanding when this plan was written, no longer print a gate
number. After this slice, `grep -rn "Gate *[0-9]" --include="*.js" src/` returns only
COMMENTS — which are legitimate under the rule (a number must never reach a SCREEN;
it stays fine in comments, code identifiers and file formats).

### E3. FINDING, reported not fixed: one stored string still carries a gate number

`src/lib/actions.js:1232` writes into `.ctoc/logs/deploy-ready.json`:

```
'Plan approved at Gate 3 (review → done) and is DEPLOY-READY. Deploy is a '
'separate human ship gate; set deployment.ship_gate_confirmed: true to enable '
'auto-deploy on Gate 3, or deploy manually.'
```

It is a LIVE string, not a comment. It was traced to its renderer and it does NOT
reach a screen: `menu-screens.js#inboxEscalationsScreen` reads that log and prints only
`d.plan` and the age, never `d.message`. So it is a stored file-format value, on the
right side of the rule as written — but it is one render change away from being on the
wrong side. `src/lib/actions.js` is not in this plan's `files:`, so it is REPORTED here
and not touched.

### E4. The plan is wrong that five entries leave the export baseline. Only ONE does

Measured with `analyzeExports()` against `.ctoc/export-reachability-baseline.json`, not
predicted: of the five deleted exports, exactly one — `src/lib/ui.js#adminDashboard` —
is in the baseline's dead list. The other four (`dashboard`, `progress`, `blocked`,
`getPhase`) were credited LIVE by the fence, so removing them moves nothing.

Why they were credited, which is worth knowing because it is a weakness in the fence
rather than a fact about the code:

- `getPhase` was genuinely called intra-module, by `dashboard` (`ui.js:43`). The fence's
  intra-file rule (a name appearing ≥2× in the export-stripped body) is correct here;
  the caller was simply itself dead.
- `dashboard`, `progress` and `blocked` are ordinary English words that appear as
  identifier TOKENS in other live modules, and `analyzeExports` credits an export when
  any live module MENTIONS its name. Nothing was calling `ui.dashboard`; the fence was
  matching the bare word. This is a real false-negative surface in the export fence —
  a generically-named dead export hides behind any live module that happens to use the
  same word. Reported, not fixed: `src/lib/reachability.js` is not in this plan's `files:`.

### E5. Step 9's kill-switch was exercised and did NOT fire — the five are dead

Step 9 authorises halting if any of the five has a live non-test caller. The evidence
that none does, which is stronger than the plan's table because it does not depend on
knowing the export names:

1. Every `require` of the module, repository-wide, is four sites and only four:
   `src/hooks/PreToolUse.Bash.js:66` (`{ writeToTerminal, colors }`),
   `src/hooks/SessionStart.js:16` (`{ writeToTerminal }`), `tests/ui.test.js:40`,
   `tests/hooks.test.js:858`. Two live, two tests — and a test is never a caller.
2. Both live requires are STATIC DESTRUCTURINGS naming only `writeToTerminal` and
   `colors`. There is no module object in either hook, so there is no dynamic route
   (`ui[name]`, `ui.dashboard`) to any other export — the shape of the require closes
   the hole the plan's `require`-search could not see.
3. A repository-wide search for `lib/ui` across ALL file types (not just `.js`) found no
   agent, skill, slash command, plugin manifest or workflow that runs or requires it.

The module file itself stays LIVE via those two hooks, so nothing joins the file-level
reachability baseline. Measured: file fence unchanged at 26 unreachable, 0 read errors,
no new entries, no removed entries.

### E6. Step 8 TDD red: 7 new cases, 7 red, ZERO greens to account for

New cases were added to `tests/ui.test.js` and run BEFORE any source change:

- `# tests 76`
- `# pass 69`
- `# fail 7`

The 7 failures are exactly the 7 new cases (`exports exactly the two names the hooks
use`; five × `ui.<name> is undefined`; `no gate NUMBER survives…`). Not one new case was
green before the code changed, so there is no banked green and nothing to examine.

The mutation proof the brief demands is satisfied by that run itself, and is the
strongest available form for a deletion fence: rather than mutating code to reintroduce
what the fence forbids, the fence was FIRST RUN against a tree that still contained
everything it forbids, and every one of the seven failed with a message naming the real
finding. The gate-number fence in particular printed its six actual hits
(`Gate 1, Gate 2, Gate 1, Gate 2, Gate 1, Gate 2`) — it read the shipped source and
reported the true set, so it cannot pass vacuously after a re-word.

One fence was RE-AIMED after that run, and the reason matters. The first version matched
`/\bGate\s*[0-9]/gi`, which also matched `state.gate1_approval` — a FIELD NAME, not
anything a person reads. Under the rule (a number must never reach a SCREEN; identifiers
are fine) that made the fence over-strict and would have false-fired on a legitimate
future identifier. It was tightened to a case-sensitive `/Gate\s*[0-9]/g` over the
comment-stripped source, which still catches all six real print sites and no identifier.
That is a tightening toward the real rule, not a loosening to make red go green — it was
still red after the change.

### E7. Justification for the existing tests that were CHANGED

Two files lost cases. Both meet the three-part test.

**`tests/ui.test.js` — the cases for the five deleted exports.**
(a) What the code is supposed to do, sourced outside the test: this plan's scope
section and Decision 1 remove those five functions outright. (b) Why the test is wrong
rather than the code: the contract each case protects no longer exists — there is no
behaviour left to defend, which is the narrow legitimate case under "fix the failures,
not the tests". Loosening them to "still returns a string" would have been exactly the
green-washing that rule forbids. (c) Which implementation passes today and fails after:
today's seven-export module passes them; the two-export module cannot, because the
functions are gone.

**`tests/hooks.test.js` — the `Blocked Message Formatting` describe (3 cases).**
(a) Sourced outside the test: the describe is titled "used by hooks for blocked
messages", and that claim is false — the hook that actually blocks an edit is
`src/hooks/PreToolUse.Edit.js`, which composes its own message and never required
`src/lib/ui.js`. (b) Why the test is wrong rather than the code: it asserted a formatter
no hook called, and one of its three cases asserted the DEFECT itself —
`assert.ok(output.includes('Gate 1'), 'Should mention Gate 1')`, a test demanding that a
screen print an internal code the reader cannot decode. (c) Which implementation passes
today and fails after: the current `ui.blocked` passes; nothing does afterwards.

That third assertion was INVERTED, not dropped. `tests/ui.test.js` now FAILS if any
printable gate number returns to `src/lib/ui.js` — the same subject, asserted with the
opposite polarity. The `Color Constants` cases in the same file were left byte-identical
because `colors` has a live caller.

### E8. Step 11 REVIEW — what the live block message says today

The plan asks for a report, not a fix, on the message a human actually sees when an edit
is blocked, since `blocked()` was its previous encoding. `src/hooks/PreToolUse.Edit.js`
composes its own denial text and never required `src/lib/ui.js`, so deleting `blocked`
changes nothing a human sees. The live message names the plan that caused the denial and
the reason, and redirects to `/ctoc:menu`; it prints no gate number. It is in materially
better shape than `blocked()` was — `blocked()` printed
`THE IRON LOOP IS HOLY. IT CANNOT BE BYPASSED.` and a five-line recipe referencing
"Gate 1" and "Gate 2". No change was made to it.

### E9. THE FORK — this slice cannot pass its own gate inside its declared `files:`

This is the one load-bearing decision that is not the executor's, surfaced rather than
guessed, and it is a defect in the plan's scope rather than in its reasoning.

`src/lib/ui.js` was the ONLY live consumer of `src/lib/state-manager.js#STEP_DESCRIPTIONS`
(read at the old `ui.js:98`, inside `progress`). Deleting `progress` therefore makes
`STEP_DESCRIPTIONS` a NEWLY DEAD EXPORT, and `tests/export-reachability.test.js` case
`NO NEW DEAD EXPORT` fails on it. Measured, before and after, with `analyzeExports()`:

```
before  dead 69   baseline maxDead 69   (src/lib/ui.js#adminDashboard present)
after   dead 69   baseline maxDead 69
        REMOVED : src/lib/ui.js#adminDashboard
        NEW     : src/lib/state-manager.js#STEP_DESCRIPTIONS   ← forbidden
```

The net is 69 → 69, so the ratchet cannot even be lowered. Three suite failures follow
from this one cause (`tests/export-reachability.test.js`, and two cases in
`tests/iron-loop-enforcer.test.js` that surface the same check against the live repo).
Attribution was verified by stashing only the three changed files and re-running both
files on the clean tree: 49 tests, 49 pass, 0 fail. The failures are this change's, and
they are real.

The correct fix is to delete `STEP_DESCRIPTIONS` — an 18-line table of step blurbs whose
last reader was the dead code this slice removes — from `src/lib/state-manager.js`, and
to delete the one case asserting it in `tests/state-manager.test.js`. That resolves all
three failures and lets the ratchet fall 69 → 68. `STEP_NAMES` is untouched and stays
live via both hooks.

Neither file is in this plan's `files:`. `files:` IS the write-permission grant and it is
covered by the approval hash, so the executor may not extend it — doing so would
invalidate the approval it is acting under. The work is therefore STOPPED at this
boundary and the decision handed over.

The three alternatives, and why only one is honest:

1. **Extend the grant to `src/lib/state-manager.js` and `tests/state-manager.test.js`,
   and delete `STEP_DESCRIPTIONS`.** Completes the slice, shrinks real debt, ratchet
   69 → 68. Requires a human to widen the grant.
2. **Add `src/lib/state-manager.js#STEP_DESCRIPTIONS` to the export baseline.** Forbidden:
   the baseline's entries may only ever be REMOVED, and the executor's brief says add no
   baseline entry — if a fence fires, fix the code.
3. **Keep the `require('./state-manager')` in `ui.js` so the token stays visible to the
   fence.** Rejected outright. The fence credits an export when a live module MENTIONS
   its name, so an unused import would silence it — that is gaming the instrument, and it
   is the false-green behaviour this repository exists to fence. `tests/ui.test.js`
   contains a case that fails if anyone does it.

### E10. Deferred to the decision above

Two declared actions are not yet done because they depend on E9:

- `.ctoc/export-reachability-baseline.json` — removing `src/lib/ui.js#adminDashboard` and
  lowering `maxDead` is only correct once `STEP_DESCRIPTIONS` is gone. Editing it now
  would lower a count the live tree does not support.
- Step 14's full gated run (`npm test`) and the coverage reading. `npm test` cannot pass
  while three cases fail, and a coverage figure measured against a red suite is not
  evidence. Lint on the three changed files is CLEAN
  (`npx eslint src/lib/ui.js tests/ui.test.js tests/hooks.test.js --max-warnings 0`),
  and the two changed test files are green on their own (132 tests, 132 pass, 0 fail).
  The full suite stands at 10275 tests, 10272 pass, 3 fail — all three the single cause
  in E9.

### E11. FINDING: a plan that quotes test output breaks its own approval binding

Writing this record broke the plan's approval binding once, and the cause is a real
defect in `computeSpecHash`, not executor carelessness — so it is recorded rather than
quietly worked around.

The known trap is that the exempt region ends at the next heading of the same or higher
level, so an executor must write only `###` subheadings here. That was done. The binding
broke anyway, because `computeSpecHash` DOES NOT TRACK FENCED CODE BLOCKS: it calls
`headingLevel` on every trimmed line, including lines inside a triple-backtick fence.
This record quoted its Step 8 red run verbatim, and node's TAP reporter prints its
counters with a leading hash character. Trimmed, that line IS a level-1 heading. Level 1
is higher than the excluded section's level 2, so the exempt region CLOSED at the quoted
output, and every section after it landed inside the hashed specification. Measured: the
plan hash moved from `bb653551…` to `b78ad2a4…`. It was reverted and rewritten with the
counters as a list of inline-code spans instead of a fenced block; the hash is
`bb653551…` again, matching the approval record.

The consequence is general and worth someone's attention: ANY plan that pastes a real
`npm test` or `node --test` result into an exempt section silently invalidates its own
approval — and the executor most likely to do it is the one following the instruction to
report verbatim numbers. The fix belongs in `src/lib/approval-ledger.js` (track fence
state while scanning for headings). That file is not in this plan's `files:`, so this is
reported, not fixed.

### E12. The fork in E9 was resolved: grant extended, ratchet MEASURED at 68

The human extended `files:` to `src/lib/state-manager.js` and `tests/state-manager.test.js`
and the approval ledger was re-stamped through the human approval path. The executor
re-verified the binding against `.ctoc/approvals/` before acting on it (hash `f2077ad7…`,
`approved_by: human`, scope `specification`, `implementation→todo`) rather than taking the
re-stamp on the coordinator's word.

`STEP_DESCRIPTIONS` and its `module.exports` entry were deleted. `STEP_NAMES` is untouched
and stays live via both hooks. The dead-export count was then MEASURED from
`analyzeExports()`, not copied from the plan or the brief:

- measured live dead-export count: 68
- `maxDead` lowered 69 → 68, and `src/lib/ui.js#adminDashboard` removed from the list
- no baseline entry added, no whitelist entry added, no threshold raised

One incidental correction: the baseline's informational `count` field read 71 while
`maxDead` and the list length both read 69 — it had gone stale at the 2026-07-19 re-seed.
It is now 68, matching the measurement. No test reads that field; the fence reads
`maxDead` and `dead`.

The driving red for this sub-change was not a newly written test. It was
`tests/export-reachability.test.js` case `NO NEW DEAD EXPORT`, already observed FAILING in
E9 with `Newly dead: src/lib/state-manager.js#STEP_DESCRIPTIONS`. That is a real, named,
pre-existing fence going red on the change and green after it — the test-first evidence is
genuine and there was no reason to manufacture a second one.

The deleted test case in `tests/state-manager.test.js` was NOT inverted into a
"must not exist" fence, and the reason is worth stating because the sibling deletion in
`tests/hooks.test.js` WAS inverted. `blocked()` printed a gate number — a DEFECT — so a
fence forbidding its return is correct. `STEP_DESCRIPTIONS` was legitimate data that lost
its last reader; a fence forbidding its return would block a future author who wires real
step prose to a real screen. The guarantee that it cannot come back DEAD is already held,
and held better, by the ratchet at 68.

### E13. FINDING, carried forward: the export fence UNDER-REPORTS dead code

Not fixed here — `src/lib/reachability.js` is outside this slice. It needs its own.

The mechanism. `analyzeExports` builds a usage index by tokenising every live module's
comment-stripped source into bare identifiers, then credits an export as LIVE if any live
module MENTIONS its name. Mentioning is not calling. So an export whose name is an ordinary
English word is credited by any live module that happens to use that word for anything at
all — a local variable, a property, a string key, an unrelated function.

What it hid, measured on this slice. Five exports were deleted as unreachable. Only ONE,
`src/lib/ui.js#adminDashboard`, was on the dead list. The other four were credited live:

- `dashboard`, `progress`, `blocked` — credited by bare-word token collisions in unrelated
  live modules. Nothing anywhere called `ui.dashboard`, `ui.progress` or `ui.blocked`; the
  fence was matching the English word. `adminDashboard` escaped only because it is
  camel-cased into a name no other module happens to use.
- `getPhase` — credited by the intra-file rule, correctly as far as the rule goes: it WAS
  called, at the old `ui.js:43`, by `dashboard`. The rule has no notion of a caller that is
  itself dead, so a closed cycle of mutually-referencing dead exports credits itself.

This is the same defect the FILE fence was rebuilt to remove on 2026-07-19 — a citation is
not an invocation — surviving in the EXPORT path. The file fence's own header says the two
halves had "opposite verdicts" and that the export fence "has always said so". On bare-word
crediting it does not: it credits a mention.

Why it matters more than a normal false negative. This fence's output is a RATCHET whose
only sanctioned exits are wire or delete. Under-reporting does not merely miss debt, it
certifies dead code as healthy — the exact failure the fence exists to end — and it does so
selectively, hiding precisely the generically-named exports that a large codebase produces
most of. Four out of five here, an 80% miss rate on a real sample.

The proposed fix, in the fence's own existing vocabulary. Credit a mention only when it is a
CALL or a reference through the module: the name invoked as `name(`, reached as
`something.name`, or destructured from a `require` of the defining module — which is exactly
the test `surfaceCalledNames` already applies to instruction surfaces twenty lines away.
Applying the surface rule to the code path would have correctly reported all five here.
Separately, the intra-file rule should not credit an export whose only internal callers are
themselves uncredited, so a dead cycle cannot vouch for itself. Expect the dead count to RISE
when this lands: that is the fence starting to tell the truth, and the ratchet will need a
one-time re-seed with the movement stated as measured, not as a regression.

### E14. FINDING, carried forward: a PERMISSION boundary decided by incidental markdown

Not fixed here — `src/lib/approval-ledger.js` is outside this slice. It needs its own.

`computeSpecHash` decides which parts of a plan are SPECIFICATION (hashed, and therefore
frozen by the human's approval) and which are RECORD (exempt, because the executor is
required to write them). That boundary is a PERMISSION boundary: `files:` — the actual
write-surface grant — lives inside the hashed region. And the boundary is currently decided
by incidental markdown structure in text the executor was INSTRUCTED to write.

Two ways it breaks, both observed today by two different executors on two different plans:

- It does not track fenced code blocks. `headingLevel` runs on every trimmed line including
  lines inside a triple-backtick fence. This executor quoted its Step 8 red run verbatim, and
  node's TAP reporter prints its counters with a leading hash character; trimmed, that is a
  level-1 heading. Level 1 outranks the excluded section's level 2, so the exempt region
  CLOSED at the quoted output and every section after it fell inside the hashed
  specification. The plan hash moved from `bb653551…` to `b78ad2a4…`. Reverted, rewritten
  with the counters as inline-code spans, hash restored.
- The exempt region ends at the next heading of the same or higher level, so an executor who
  adds a well-intentioned second-level section — a `Findings` heading was the case earlier
  today — closes the region and puts its own text inside the frozen specification.

These are one defect, not two, and the general statement is the important part: the boundary
of a permission is being inferred from the shape of prose, in a document whose prose an
executor is required to extend. Anything the executor writes can move it.

The compounding factor is that the INSTRUCTIONS make it likely. Executors are told to report
verbatim test numbers. Verbatim test numbers from the TAP reporter begin with a hash
character. So the executor most likely to break its own approval binding is the one following
instructions most literally — which is the opposite of what a safety mechanism should select
for, and it means the failure will keep recurring.

The proposed fix, in two parts. Structurally: track fence state while scanning for headings,
so no line inside a fenced block is ever read as a heading; and make the exempt region's end
explicit rather than inferred, so no heading an executor writes can close it. Behaviourally,
and more valuable: `computeSpecHash` already returns `ok`/`reason` and already fails CLOSED
when it cannot locate the boundary — it should also be able to say that a heading was found
in a position that CHANGED the boundary, so the executor is told at write time instead of
discovering a broken binding later. The current failure is silent, and silent is what makes
it dangerous. It should also be a workaround for nobody: the exempt sections belong in a
frontmatter-style delimited block, not in the heading stream, which removes the whole class.

### E15. Step 14 VERIFY — the numbers, verbatim

Lint, all five changed source and test files, zero warnings tolerated:

- `npx eslint src/lib/ui.js src/lib/state-manager.js tests/ui.test.js tests/hooks.test.js tests/state-manager.test.js --max-warnings 0` — exit 0, no output.

Suite, unenforced entry point:

- `node --test tests/*.test.js` — tests 10274, suites 1747, pass 10274, fail 0, cancelled 0, skipped 0, todo 0.

Suite, THE REAL GATE:

- `npm test` — coverage 99.03% (threshold 99%), skipped 0, failed 0, PASS.

Fences, all green, no entry added to any baseline or whitelist:

- false-green fence, file-reachability fence and export-reachability fence run together: tests 54, pass 54, fail 0.
- file fence: 26 unreachable, unchanged, 0 read errors, no new entries.
- export fence: 68 dead, ratcheted DOWN from 69.

### E16. Coverage did NOT move, and that is the expected result

Measured properly rather than asserted: three `npm test` runs on the changed tree and three
on the clean tree, the clean tree produced by stashing only this slice's files.

- clean tree: 99.03%, 99.03%, 99.03%
- changed tree: 99.03%, 99.03%, 99.03%

No movement, and no run-to-run spread at all across six runs — the 99.00–99.03 noise band
this repository is described as sitting in did not appear today. NO claim of a coverage
improvement is made here, and the deletion of 214 lines should NOT be reported as having
raised coverage.

The reason it did not move is the point. The deleted code was FULLY COVERED: `ui.js` reports
100% line coverage both before and after, because the five screen builders had thorough tests
— that was the entire defect. Removing lines that were 100% covered takes the same proportion
out of the numerator and the denominator, so the ratio is unchanged. This is worth stating
plainly because the plan predicted at Step 14 that "coverage will MOVE when 150-odd lines of
tested-but-dead code leave the denominator". That prediction was wrong, and it was wrong for
a reason that generalises: perfectly-tested dead code is invisible to a coverage percentage
in both directions. Coverage cannot see this defect at all. That is why the reachability
fences exist, and this slice is a clean demonstration of the gap between them.

### E17. Residual gate numbers in src/, each classified

A final sweep of `grep -rn "Gate *[0-9]" --include="*.js" src/` after the deletion. Every
remaining hit is a COMMENT, which is legitimate under the rule, except three, classified
here so the next reader does not have to re-derive them:

- `src/lib/regulatory-regime.js:35` — `'four_eyes_gate3'` is a configuration KEY, with the
  number explained in a trailing comment. A code identifier. Legitimate, leave it.
- `src/lib/actions.js:1234` — the deploy-ready notice described in E3. Stored in
  `.ctoc/logs/deploy-ready.json`; its renderer prints only the plan name and the age, never
  the message. On the right side of the rule, one render change from the wrong side.
- `src/lib/actions.js:988` — this one is NOT on the right side. It is a live
  `console.error` printing `Gate 3 (review→done) will refuse it` straight to the terminal
  when Step 14 VERIFY fails. It is a screen a human reads, at the exact moment they are
  already dealing with a failure, and it hands them an internal code. `src/lib/actions.js` is
  not in this plan's `files:`, so it is REPORTED and untouched — but of the three residuals
  this is the real one, and it deserves its own slice.
