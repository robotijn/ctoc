---
approved_by: human
approved_at: 2026-07-20T09:18:53.959Z
gate_crossed: implementation → todo
---

---
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
### Step 9: PREPARE — re-read from disk: `src/lib/menu-screens.js` around `:850-930` and `:2280-2300`. The landed code WINS over this plan's line numbers. Confirm `src/lib/gate-words.js` exists (if it does not, the preceding slice has not landed — STOP and report rather than inlining the phrasing). Then search the whole file for any OTHER human-facing gate number this plan did not name; if one exists, add it to Change 2 and record it, because case 4 will fail on it regardless.
### Step 10: IMPLEMENT — one step, files as sub-items.
  - `src/lib/menu-screens.js` — Changes 1, 2 and 3.
### Step 11: REVIEW — confirm no remaining string literal on a dashboard render path matches the gate-number pattern. Confirm the deploy-ready block comment at `:855` no longer describes a line that was changed out from under it. Confirm the counts still render.
### Step 12: OPTIMIZE — two string builds on a path that already builds strings; no new read, no new allocation on the path where neither line renders.
### Step 13: SECURE — neither line interpolates plan-derived text beyond a count, so no new injection surface. Confirm the counts are numbers and cannot carry a crafted string.
### Step 14: VERIFY — `node --test tests/dashboard-says-the-moment.test.js tests/gate-words.test.js tests/menu-screens-coverage.test.js tests/menu-protocol.test.js` green, then the full gated run `npm test`. Lint the changed file. No git operations.
### Step 15: DOCUMENT — update the block comment at `:855` to state the rule rather than the number.
### Step 16: FINAL-REVIEW — report the dashboard BEFORE and AFTER, verbatim, and every decision taken under ambiguity.

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
