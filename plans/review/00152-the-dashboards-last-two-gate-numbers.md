---
approved_by: human
approved_at: 2026-07-20T09:18:53.959Z
gate_crossed: implementation → todo
title: "The dashboard's last two gate numbers become sentences a human can act on"
type: implementation
parent_plan: none
depends_on: 00151-the-gate-screens-say-the-moment-not-the-number
priority: high
program: fresh-repository-first-run
iron_loop: true
files:
  - "src/lib/menu-screens.js"
  - "tests/dashboard-says-the-moment.test.js"
  - "tests/menu-screens-coverage.test.js"
  - "tests/menu-task-wiring.test.js"
  - "CLAUDE.md"
scope_extension:
  authorized_by: human
  authorized_at: 2026-07-20
  reason: >
    Five assertions across two test files pin the OLD wording and must be
    inverted to the new contract; two more would pass VACUOUSLY after the
    re-word and need real assertions. CLAUDE.md carries a documented test-file
    count that moves because this plan creates one test file. The human ruled
    on this identical fork twice earlier the same day (the setup-preview work
    and the gate-screen wording): extend the build rather than split, so the
    behaviour and the tests that guard it are corrected together rather than
    leaving the suite vouching for wording the owner could not read.
---

# The dashboard's last two gate numbers

After the gate-screen slice lands, two human-facing gate numbers remain on the
dashboard render path. Both are live — `buildDashboardTable` and the completion
status line are on the shipped entry point, reached on every open.

`src/lib/menu-screens.js:922`:

```js
text += `\n  Deploy-ready (${deploys.length}) — approved at Gate 3; deploy is a SEPARATE human ship gate\n`;
```

`src/lib/menu-screens.js:2295`:

```js
text += ` · plan → review (${verified}; evidence recorded for Gate 3)`;
```

Both say a number and a piece of internal vocabulary ("ship gate", "plan → review")
where a sentence belongs. The second is worse than the first: it tells the human
that evidence was recorded FOR something he has no way to identify, so the line
conveys that a thing happened and nothing about what it was for.

## What they become

Using the vocabulary from `src/lib/gate-words.js`:

| line | becomes |
|---|---|
| `:922` | `Waiting to be deployed (N) — you called these finished. Deploying them is a separate decision, and it is still yours.` |
| `:2295` | ` · moved to review (N checked; the evidence is saved for when you decide it's finished)` |

The `:922` wording keeps the fact that matters — deploying is NOT implied by
approving — and says it as a sentence rather than as two pieces of jargon joined by
a semicolon. The word "SEPARATE" in capitals is dropped; a capitalised word is
emphasis where the sentence should carry the weight.

The `:2295` wording keeps the count, which is real information, and names what the
evidence is for in the human's own frame.

## Implementation Details

### File: `src/lib/menu-screens.js`
**Action:** MODIFY
**Purpose:** The last two gate numbers on the dashboard render path become sentences.
**Change Type:** modify-existing — two string sites, plus one import

#### Change 1 — import the vocabulary

```js
const gateWords = require('./gate-words');
```

The module was created in the preceding slice and already has live callers there.
This adds a second consumer, which is why the vocabulary lives in a module rather
than inline.

#### Change 2 — the deploy-ready line (`:922`)

The phrase is derived rather than hardcoded, so a later change to what
"finished" means moves in one place:

```js
text += `\n  Waiting to be deployed (${deploys.length}) — you called these finished. `
      + `Deploying them is a separate decision, and it is still yours.\n`;
```

The surrounding block comment at `:855` also names the gate number and is rewritten
to the same rule: it may keep the number (it is a comment, and comments are exempt),
but the sentence it explains has changed, so leaving it would leave a comment
describing a line that no longer exists.

#### Change 3 — the completion status line (`:2295`)

```js
text += ` · moved to review (${verified} checked; the evidence is saved for when you decide it's finished)`;
```

`plan → review` becomes `moved to review`. `review` survives as an English word
here — it is what the human calls looking something over, and unlike `functional`
or `implementation` it means in plain speech what it means in the pipeline. That
is a judgement, recorded as decision 3 below rather than left implicit.

### Wiring — the live call sites

| changed code | live call site | root |
|---|---|---|
| the deploy-ready line | `menu-screens.buildDashboardTable` | every dashboard open |
| the completion status line | the completion status render | every completion turn |
| `gate-words` (second consumer) | both of the above | the shipped entry point |

## Test Plan

### Tests: `tests/dashboard-says-the-moment.test.js`
**Action:** CREATE
**Framework:** `node:test`

| # | Case | How | Assertion |
|---|---|---|---|
| 1 | **the deploy-ready line carries no gate number** | seed a project with one deploy-ready notice; render `buildDashboardTable` | the rendered text fails `/\bgates?\s*[0-9]/i` |
| 2 | **it still says deploying is the human's call** | same | text contains `separate decision` and `still yours` |
| 3 | **the count survives** | two notices | text contains `(2)` |
| 4 | **the whole dashboard carries no gate number** | render a project with plans in every stage, a deploy-ready notice, and a task registry | the ENTIRE returned text fails `/\bgates?\s*[0-9]/i` — the fence over the whole screen, not just the two lines |
| 5 | **the completion line names what the evidence is for** | drive the completion status render with a verified count | text contains `when you decide it's finished` and fails the gate-number pattern |
| 6 | **a healthy dashboard is otherwise unchanged** | a project with no deploy-ready notices | text contains neither `Waiting to be deployed` nor the old wording; every other section renders as before |
| 7 | **no bare stage name reaches the deploy line** | same as case 1 | the line contains no standalone `implementation`, `functional` or `todo` token |

Case 4 is the load-bearing one. Cases 1 and 5 pin the two known sites; case 4 is
what catches the site nobody remembered.

Cross-platform: `path.join`, `os.tmpdir()`, `fs.promises.rm` teardown.

## What this slice does NOT fix

- **`src/lib/ui.js`.** It carries four more gate numbers (`:47-48`, `:119-120`,
  `:178-180`). They are in code with no production caller, so the correct change
  there is deletion rather than re-wording, and that is its own slice.
- **The fence.** Case 4 fences ONE function. A general fence over every
  human-facing string is the next slice. Until it lands, a new gate number added to
  a screen this test does not drive still ships.
- **Anything outside the render path.** Comments, identifiers, ledger evidence
  strings and plan-file frontmatter keep their numbers, deliberately.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/dashboard-says-the-moment.test.js` in full, run ONLY that file, record the red output verbatim. Cases 1, 2, 4, 5 and 7 MUST be red. Include the rendered dashboard text in the red evidence.
- [x] TEST — TDD tests present; workflow Step-11 REVIEW (2026-07-29) confirmed real/adversarial, not vacuous.
### Step 9: PREPARE — re-read from disk: `src/lib/menu-screens.js` around `:850-930` and `:2280-2300`. The landed code WINS over this plan's line numbers. Confirm `src/lib/gate-words.js` exists (if it does not, the preceding slice has not landed — STOP and report rather than inlining the phrasing). Then search the whole file for any OTHER human-facing gate number this plan did not name; if one exists, add it to Change 2 and record it, because case 4 will fail on it regardless.
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
### Step 10: IMPLEMENT — one step, files as sub-items.
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
  - `src/lib/menu-screens.js` — Changes 1, 2 and 3.
### Step 11: REVIEW — confirm no remaining string literal on a dashboard render path matches the gate-number pattern. Confirm the deploy-ready block comment at `:855` no longer describes a line that was changed out from under it. Confirm the counts still render.
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3.
### Step 12: OPTIMIZE — two string builds on a path that already builds strings; no new read, no new allocation on the path where neither line renders.
### Step 13: SECURE — neither line interpolates plan-derived text beyond a count, so no new injection surface. Confirm the counts are numbers and cannot carry a crafted string.
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
### Step 14: VERIFY — `node --test tests/dashboard-says-the-moment.test.js tests/gate-words.test.js tests/menu-screens-coverage.test.js tests/menu-protocol.test.js` green, then the full gated run `npm test`. Lint the changed file. No git operations.
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
### Step 15: DOCUMENT — update the block comment at `:855` to state the rule rather than the number.
### Step 16: FINAL-REVIEW — report the dashboard BEFORE and AFTER, verbatim, and every decision taken under ambiguity.
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.

## Decisions Taken Under Ambiguity

1. **`review` survives as an English word; `functional`, `implementation` and
   `todo` do not.** "Review" means in plain speech what it means in the pipeline —
   looking something over before it counts. The other three are directory names
   that happen to be English. The line is drawn at whether the word carries its
   ordinary meaning, and it is recorded here because it is a judgement somebody
   will want to argue with.
2. **The capitalised `SEPARATE` is dropped.** Shouting one word is a symptom of a
   sentence that is not carrying its own weight. The replacement says the same
   thing in a sentence, which needs no emphasis.
3. **The block comment keeps its gate number.** Comments are explicitly exempt.
   Rewriting it entirely would be scope creep; it is corrected only where it now
   describes a line that no longer exists.
4. **Case 4 asserts over the whole dashboard, not over the two lines.** A test that
   checks only the sites the author knew about proves the author's memory, not the
   screen. The whole-render assertion is the one that catches the third site.

### 5. The deploy-ready line is NOT in `buildDashboardTable` — the plan's wiring table is wrong

The plan places `:922` in `buildDashboardTable`, "reached on every dashboard open".
Measured on disk: the line is at `:964`, inside `inboxEscalationsScreen` — the
"Inbox ▸ Escalations & deploy-ready" DOOR, reached by the route `inbox escalations`,
and that function is deliberately not exported. Case 1 as the plan specifies it
("render `buildDashboardTable`", expect the deploy line) is unsatisfiable. The tests
drive the door the way a human reaches it, `route(['inbox','escalations'], root)`.

### 6. `verified` is a verdict STRING, not a count — the plan's replacement was ungrammatical

The plan renders ` · moved to review (${verified} checked; …)`, which assumes
`verified` holds a number. It holds `'VERIFY passed'` / `'VERIFY FAILED'` /
`'no verify'`, so the plan's text would have rendered "VERIFY passed checked" at a
human and would have kept the internal step name the slice exists to remove. The
verdict is re-worded at its source instead — `the checks passed` / `the checks
FAILED` / `no checks were run` — so the fact survives and the jargon does not.

### 7. A THIRD site was fixed: the dashboard's own deploy-ready count

`:584` in `buildDashboardTable` reads "deploy is a separate ship gate". It carries no
NUMBER, so the plan's Step 9 sweep (which searches for numbers) does not catch it,
but it is the same jargon at the same moment, on the dashboard the door hangs off.
Leaving it would have made the dashboard and its own door say different things about
the same notice. It is in the declared file and is covered by case 4b.

### 8. `gate-words.js` is NOT imported, and Change 1 is deliberately not implemented

Change 1 says to import `src/lib/gate-words.js` and derive the phrase from it. That
module exports four site types — `moment`, `question`, `chip`, `approveLabel` — all
shaped for the gate QUESTION screen, plus `SEND_BACK`. None of them fits a status
notice about work already approved, and there is no bare "finished" token to consume.
Making it fit needs a fifth field in `gate-words.js`, which this plan's `files:` does
not declare, and `files:` is the permission grant. Importing it anyway, unused, would
be a decorative import that lint would reject. The sentences are therefore written in
`menu-screens.js`, anchored on the same word ("finished") the review edge's `moment`
uses. This is a fork surfaced to the human, not a settled call: the durable fix is a
`deployNotice` field in `gate-words.js` in the slice that may edit it.

### 9. Three greens at Step 8 were vacuous until the test's line selector was fixed

Cases 1, 3 and 7 passed on the first red run because the helper that picks "the
deploy line" matched the screen's HEADER ("Inbox ▸ Escalations & deploy-ready (1)"),
which also contains "deploy" and a count. They were asserting over the wrong line
while the defective line one row below went unread. The selector is now anchored on
the block indent and asserts it matched EXACTLY ONE line. After the fix the honest
red was 5 fail / 3 pass.

### 10. The scope extension, and what it covered

The first pass ended at a fork: five suite failures, every one an assertion pinning
the OLD wording, all in files `files:` did not declare. Rather than edit `files:`
(which would invalidate the approval this build runs under), the fork was surfaced.
The human's standing ruling — given twice earlier the same day, on the setup-preview
work and the gate-screen wording — is "extend the build rather than split, so the
behaviour and the tests that guard it are corrected together". The ledger was
re-stamped through the human's approval path (`content_sha256` `620c3ae3…`, replacing
`8e1c07…`) and `files:` now declares five paths. The binding was re-verified from
disk before any further edit and again after each plan write.

### 11. Three-part justification — `tests/menu-screens-coverage.test.js`, the dashboard count line

(a) **The contract, sourced outside the test.** This plan, and the owner's words on
being shown "Gate 3": a screen says what the MOMENT IS, in plain words, never its
number and never a stage-directory name. The count must additionally still name its
door, which is the contract the W1 work established ("a count with no door is the
defect").
(b) **Why the TEST is wrong rather than the code.** `assert.match(out, /1 plan
deploy-ready .* view: inbox escalations/)` pinned the pipeline's own vocabulary as
the expected output, and the line it guarded also read "deploy is a separate ship
gate". The test asserted the defect. The code was doing what the test demanded, so
the code was not the thing that was wrong.
(c) **What newly fails.** Restoring "approved at Gate 3; deploy is a SEPARATE human
ship gate" to the dashboard line fails it (MUT 1, verified). It is strictly stronger
than what it replaced: the door assertion is retained, and four new fences (gate
number, "ship gate", raw stage name, "still yours") are added.

### 12. Three-part justification — `tests/menu-screens-coverage.test.js`, the section cap

(a) **The contract.** As above; plus this case's own stated purpose, which is the
SECTION and the CAP at 21 notices, not the heading's exact words.
(b) **Why the TEST is wrong.** `/Deploy-ready \(21\)/` pinned a heading, so a copy
edit registered as a behaviour change while the jargon itself went unguarded.
(c) **What newly fails.** Putting a gate number back on the door's section line fails
it (MUT 2, verified). The cap assertion (`… and 1 more`) is untouched, and the count
is now asserted on the section line itself.

### 13. Three-part justification — `tests/menu-task-wiring.test.js`, D3

(a) **The contract.** As above; plus D3's own stated purpose — "no claim without a
reader", i.e. the notice is READ and SURFACED.
(b) **Why the TEST is wrong.** `assert.match(dash, /deploy-ready/i)` proved surfacing
only by matching the internal word for the moment; any plain-English rendering of the
same fact would have failed it. It tested the vocabulary, not the behaviour.
(c) **What newly fails.** Restoring the old dashboard wording fails it (MUT 1,
verified).

### 14. The two assertions that would have passed VACUOUSLY — the more important half

Both were `doesNotMatch`/`!test` fences over a string the re-word had deleted from
the codebase. An assertion over a string that no longer exists cannot fail: it is
proof-shaped and proves nothing. This is the same defect class as a truncated search
(see finding 19) — a verdict reported on input never received — wearing a test's
clothes. In both cases the dead pattern is preserved in a comment beside the new
assertion so nobody re-adopts it as a live check.

**`non_array_deploy_ready_json_is_treated_as_no_notices`** (was
`assert.doesNotMatch(r.text, /Deploy-ready/)`). Now asserts positively that the
empty-state message renders, and negatively against the CURRENT heading ("Waiting to
be deployed") plus any indented deploy section line. **What would now fail:**
rendering the notice section unconditionally (MUT 3, verified).

**D4** (was `assert.ok(!/deploy-ready/i.test(dash))`). Now asserts `!/deploy/i` — the
word actually on the line today. **What would now fail:** a deploy line leaking into
the "Inbox clear" branch (MUT 4, verified). MUT 3 did NOT fail D4, because D4's
fixture takes the clear-inbox branch where the guard never runs; the mutation was
re-aimed at the branch D4 actually guards rather than recorded as "bites".

### 15. FINDING — the plan's wiring table names the wrong function

Recorded in full at decision 5. One case was unsatisfiable as written.

### 16. FINDING — the plan's replacement text assumed a count that is a string

Recorded in full at decision 6. It would have rendered "VERIFY passed checked" at a
human while keeping the internal step name the slice exists to remove.

### 17. FINDING — the measured gate-number count is 8, not 7 and not 4

Measured, not estimated. **`src/lib/menu-screens.js` — 2 human-facing**: `:964` (the
door's notice section) and `:2337` (the completion status line), both fixed here.
Three further matches at `:897`, `:2215` and `:2216` are COMMENTS and are exempt by
decision 3. **`src/lib/ui.js` — 6**: `:47`, `:48`, `:119`, `:120`, `:178`, `:180`.
The plan claims four for `ui.js`; the brief estimated seven in total. Both are low.
`ui.js` is out of scope here and is handled by the dead-code slice, which should be
told the real number is six lines, not four.

### 18. FINDING (STRUCTURAL) — adding any test file breaks the documented-count assertion

`tests/doc-counts.test.js` compares two counts written in prose in `CLAUDE.md`
("Run all N test files", "tests/ N test files") against a live `readdirSync` of
`tests/`. Any plan that creates a test file — which every test-first plan does by
construction — therefore fails that assertion unless it also declares `CLAUDE.md`.
This is not specific to this slice: it has now cost three builds a scope extension.
The count here was measured with the assertion's own `listFlat(['tests'],
'.test.js').length` rather than a shell `ls` or a number supplied in a brief: **444**.

The invariant is worth keeping — it is what stops the documentation rotting — so the
fix is not to delete it. The suggested fix is to stop storing a mutable measurement
in prose that every build invalidates: have the doc line carry a marker the test
REWRITES in place (the count becomes generated, like `release.js` already does for
version numbers), or move these two counts out of `CLAUDE.md` into a generated
fragment. Either way the count stops being a hand-edited literal, and no future plan
needs `CLAUDE.md` in its `files:` merely to add a test.

### 19. FINDING (METHOD) — a truncated search cannot support a negative conclusion

While checking whether any existing test pinned the old strings, the search was run
as `grep -rn … tests/*.js | head -20`, and the absence of a match in the visible
output was read as "no existing test needs changing". Two matching tests existed
below the truncation. The full suite caught it.

The lesson is about METHOD, not about one mistake: **"no matches" from a truncated
search is not a measurement.** `head` bounds the OUTPUT, not the search, so it can
only ever support a positive finding ("at least these exist"), never a negative one
("none exist"). A negative conclusion requires an untruncated search or a count
(`grep -c`, or `wc -l` on the full result). This is the same false-green class this
repository already fences in `src/lib/false-green-scan.js` — a verdict reported on
input the instrument never received — and it is the same defect as the two vacuous
assertions in finding 14, which is why all three are recorded together.

### 20. The durable fix for `gate-words.js`, for whichever slice may edit it

Decision 8 records why `gate-words.js` is NOT imported here: its four site types
(`moment`, `question`, `chip`, `approveLabel`) are all shaped for the gate QUESTION
screen, none fits a status notice about work already approved, and bending one to fit
would produce exactly the form-letter wording that module exists to prevent. An
unused import would fail lint. The human has ruled that this call stands.

### 21. FINDING — the coverage figure varies run to run, and the repository sits ON its floor

Coverage was measured five times with `npm test`, all with `failed 0`. **Clean
baseline tree** (my changes reverted): 99.01%, then 99.03%. **With my changes**:
99.01%, then 99%, then 99.03%. The two ranges overlap completely, so this slice moved
coverage **LEVEL** — the 0.02pp gap between any two single runs is measurement noise,
not a change anyone made. Reporting a single pair of runs as a "drop" or a "gain"
would be premature precision on an instrument with this much spread.

The floor is 99 and was not touched in either direction.

What is worth flagging: one run measured **exactly 99%**, which passes only because
the gate tests `>=`. The repository is sitting ON its floor with roughly 0.03pp of
run-to-run variance, so a build can fail the coverage gate for reasons that have
nothing to do with its own change — and the next executor to see that will
reasonably, but wrongly, go looking for the defect in their own diff. Two honest
options, both out of scope here: raise real coverage so there is headroom above the
ratchet, or find the source of the variance (likely which files the run happens to
load) and remove it. Lowering the floor is not an option — it is a ratchet.

**The durable fix, for the next slice that may edit `src/lib/gate-words.js`:** add a
fifth site type, `deployNotice`, to the `review` edge — the sentence a status line
renders when work the human has called finished is waiting to be deployed. Today that
sentence lives in TWO places in `src/lib/menu-screens.js` (the dashboard count line
at `:584` and the door's section at `:964`), which is the drift risk `gate-words.js`
exists to eliminate. Both sites should consume it, and the wording to lift is: "you
called these finished. Deploying them is a separate decision, and it is still
yours."
