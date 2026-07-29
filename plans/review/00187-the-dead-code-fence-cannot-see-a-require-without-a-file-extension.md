---
iron_loop_verdict: true
title: "The dead-code fence cannot see a require without a file extension — two live files were seeded into the deletion list, and the surface walk's other blind spots are named"
type: implementation
parent_plan: none
depends_on: 00185-every-stale-plan-cleanup-a-human-approves-does-nothing
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/reachability.js"
  - "tests/reachability.test.js"
  - ".ctoc/reachability-baseline.json"
approved_by: human
approved_at: 2026-07-28T20:33:08.565Z
gate_crossed: implementation → todo
---

# The dead-code fence cannot see a require without a file extension

## The defect, read on disk

`src/lib/reachability.js:339`:

```js
const SURFACE_REQUIRES_RE = /\brequire\s*\(\s*['"][^'"\n]{0,64}?(src\/[A-Za-z0-9_\-/.]+\.js)['"]\s*\)/g;
```

The pattern requires a literal `.js` immediately before the closing quote. Node does not:
`require('./x')` resolves `./x.js` and has since the module system existed. Two shipped
recipes in `src/commands/menu.md` use exactly that form:

- `:52` — `require('{{CTOC_ROOT}}/src/lib/plan-numbering')`
- `:54` — `require('{{CTOC_ROOT}}/src/lib/stale-cleanup')`

Both are genuine executable instructions the session model runs. Both files were
consequently seeded into `.ctoc/reachability-baseline.json` at `:28` and `:35` as
unreachable.

**The sanctioned exits from that list are wire-or-delete.** `.ctoc/reachability-baseline.json:3`:
"entries leave it by being WIRED to a live root or DELETED." So the fence placed two
correctly-wired, actively-used files under deletion pressure, and it did so at the moment
the baseline was re-seeded — which is when a list like this is trusted most.

This is the same class the re-seed comment at `:2` describes: an instrument that stopped
reporting a verdict on evidence it never had. The re-seed fixed over-crediting. This is
the under-crediting half, and it points at deletion, which is the irreversible direction.

## The fix

The extension becomes optional in the capture, and the resolution — not the text —
decides which file was named:

```js
const SURFACE_REQUIRES_RE = /\brequire\s*\(\s*['"][^'"\n]{0,64}?(src\/[A-Za-z0-9_\-/.]+?)(\.js)?['"]\s*\)/g;
```

A captured path without an extension is credited to `<path>.js` **only when that file
exists in the scanned set**. A path that resolves to nothing credits nothing — the fence
must never invent an edge to a file that is not there, which is the over-crediting failure
the re-seed just repaired.

Three shapes must be handled and each gets a test:

| Written | Credits |
|---|---|
| `require('…/src/lib/x.js')` | `src/lib/x.js` — unchanged behaviour |
| `require('…/src/lib/x')` | `src/lib/x.js` when it exists |
| `require('…/src/lib/x')` where only `src/lib/x/index.js` exists | **nothing**, and this is deliberate — see the decisions |

`SURFACE_NODE_RUNS_RE` at `:336` is **not** changed. `node <path>` genuinely requires the
extension to run, so anchoring on it there is correct.

## What else the surface walk cannot see — measured, not guessed

The brief asked for this list, and it is longer than the one known item.

### 1. `skills/agent-fragments/*.md` is entirely unscanned

`collectSurfaceFiles` at `:329`:

```js
walk(path.join(projectRoot, 'skills'), ['SKILL.md']);
```

Only files **named** `SKILL.md` are collected. Four instruction fragments exist and none
is named that:

```
skills/agent-fragments/no-stub-rule.md
skills/agent-fragments/async-choice-protocol.md
skills/agent-fragments/warnings-are-critical.md
skills/agent-fragments/ancestry-read.md
```

These are not incidental. `CLAUDE.md` and every v7 agent preamble link them as binding
operating instructions ("These are not stylistic suggestions; they are pre-conditions for
correct operation"). An entire shipped instruction surface is invisible to both fences.

**Fixed here:** the skills walk collects `.md`, not just `SKILL.md`.

### 2. A prose citation is not credited, and must not be — even after (1)

`skills/agent-fragments/async-choice-protocol.md:13`:

> Write the question to `.ctoc/inbox/questions/` via `createQuestion()` from `src/lib/inbox.js`.

`src/lib/inbox.js#createQuestion` is dead in
`.ctoc/export-reachability-baseline.json:30`, and this is its only citation outside tests
and the already-dead compliance runner chain. Scanning the fragment does **not** revive
it, because the sentence names the function in prose rather than calling it — and the
export fence's rule that a citation is not an invocation is correct and stays.

**So scanning agent-fragments is necessary and not sufficient.** The honest fix for
`createQuestion` is to make that fragment carry a real recipe or to accept the export as
dead; both are outside this slice and are named in "What this plan does NOT fix" so the
next reader does not mistake (1) for a fix of (2).

### 3. `docs/**` is not a surface at all, and that is correct

No walk covers `docs/`. A document describes; it does not execute. Adding it would
recreate the exact over-crediting the re-seed removed — "roughly a third of the library
was a root because an agent definition described it in a sentence." **This is stated so
nobody proposes it as a fix**, and it is why the false documentation claims found in this
repair set are documentation repairs rather than fence changes: the four-eyes claim in
`docs/INDEPENDENCE.md` belongs to `00089`, and the step-label hook, refinement-loop and
quality-gate claims belong to `00188`, `00189` and `00190` respectively.

### 4. A path built at runtime is invisible

`require(path.join(root, 'src', 'lib', 'x.js'))` or a path held in a variable matches
neither pattern. No fix is proposed: matching a computed path means executing the
instruction, which is `00186`'s mechanism, not this one's. Recorded as a known limit.

### 5. The eighty-character window on `SURFACE_NODE_RUNS_RE`

`node(?![:\w])[^\n]{0,80}?(src\/…\.js)` gives up after eighty characters. A recipe with a
long `${CLAUDE_PLUGIN_ROOT}` prefix plus flags before the path is not seen. Measured at
Step 9 against every `node` invocation in the shipped surfaces; widened only if a real
instance exists, and the finding recorded either way. **A limit nobody has hit is not
worth loosening a bounded pattern for.**

## Implementation Details

### File: `src/lib/reachability.js`
**Action:** MODIFY — `SURFACE_REQUIRES_RE` at `:339` and the skills walk at `:329`

Both changes are additive credit. Neither removes an existing edge, so no file can newly
become unreachable as a result — assert that at Step 14 rather than assuming it.

Update the docblock at `:337-338` to state that the extension is optional and that credit
depends on resolution against the scanned set. The comment at `:305-316` gains the
sentence that every `.md` under `skills/` is a surface, not only `SKILL.md`.

### File: `tests/reachability.test.js`
**Action:** MODIFY — add cases beside the existing synthetic-fixture cases at `:260-480`

| # | Case | Assertion |
|---|---|---|
| 1 | extensionless require credits the file | fixture surface with `require('./src/lib/x')` and `src/lib/x.js` present → `x.js` NOT unreachable |
| 2 | the `.js` form still credits | regression guard on the shape that works today |
| 3 | **an extensionless require to a nonexistent file credits nothing** | `require('./src/lib/ghost')` with no such file → no edge invented, and the fence's over-crediting failure is not reintroduced |
| 4 | a directory-style require credits nothing | `require('./src/lib/dir')` where only `src/lib/dir/index.js` exists → `index.js` stays unreachable, matching decision 2 |
| 5 | a non-`SKILL.md` file under `skills/` is a surface | fixture `skills/frag/x.md` naming a src file in a `node` run → that file is reachable |
| 6 | a prose mention in a fragment credits nothing | fixture fragment saying "call `doThing()` from `src/lib/y.js`" in a sentence → `y.js` NOT credited, because a citation is not an invocation |
| 7 | **the two real files leave the live unreachable set** | run `analyze()` against the real root; `src/lib/plan-numbering.js` and `src/lib/stale-cleanup.js` are absent from `result.unreachable` |
| 8 | a require inside a comment still credits nothing | the existing stripped-comment guarantee survives the pattern change |

### File: `.ctoc/reachability-baseline.json`
**Action:** MODIFY

**Measure, do not copy a number from this plan.** Run the analyzer, read the live count,
set `maxUnreachable` to it, and remove exactly the files that left.

The expectation depends on landing order and both orders are valid:

- with `00185` landed first (`stale-cleanup.js` already removed, count 25): **25 → 24**,
  removing `src/lib/plan-numbering.js`.
- with this plan landing first: **26 → 24**, removing both.

`tests/reachability.test.js:206-213` asserts the live count **equals** `maxUnreachable`, so
a stale baseline reds the suite in either direction. **A count that disagrees with both
expectations is a finding to report, not a number to overwrite** — it would mean the
skills-walk change credited something nobody predicted, and that deserves to be read
before it is committed.

Extend the `comment` field with one sentence recording why these two entries left: the
pattern could not see a require without an extension, and the files were always wired.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `SURFACE_REQUIRES_RE`, `collectSurfaceFiles` | `liveRoots` (`reachability.js:388`) → `analyze()` | `tests/reachability.test.js` under `npm test`, and `src/lib/iron-loop-enforcer.js`'s reachability check |

Both are internal to a module already called from a live root. Nothing new is created.

## Test Plan

Covered by the eight cases above. Case 3 is the guard that matters most: this slice
loosens a pattern, and the failure mode of loosening is inventing edges, which is the
defect the re-seed removed three days ago.

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [x] TEST — TDD red-first: failing tests written and seen RED before implementation; Step-11 review confirmed the tests are real and adversarial, not vacuous.
Write the cases FIRST. **Cases 1, 5 and 7 must be RED.** Record case 7's red verbatim —
two actively-used files listed as dead is the evidence. Cases 2, 3, 6 and 8 pass
immediately and are the over-correction guards; a change that reds any of them is wrong
regardless of what it fixes.

### Step 9: PREPARE
- [x] PREPARE — plan ancestry and target files read from disk; approach confirmed against the real code.
Read `src/lib/reachability.js:300-420` in full. Grep every shipped surface
(`src/commands/*.md`, `agents/**/*.md`, `skills/**/*.md`, `.github/workflows/*`) for
`require(` and for `node ` and **tabulate every form that appears**, so the pattern change
is measured against reality rather than against the two known instances. Measure blind
spot 5 (the eighty-character window) on that same tabulation and record the finding
whether or not it fires. Confirm whether `00185` has landed, since it determines the
expected baseline arithmetic.

### Step 10: IMPLEMENT
- [x] IMPLEMENT — the declared files were implemented; full gated `npm test` green.
- `src/lib/reachability.js` — optional extension with resolution-gated credit; skills walk
  collects `.md`.
- `tests/reachability.test.js` — the eight cases.
- `.ctoc/reachability-baseline.json` — measured count, measured removals, extended comment.

### Step 11: REVIEW
- [x] REVIEW — adversarial iron-loop-critic Step-11 review (2026-07-29): CLEARS Gate 3; any residuals are documented and non-blocking.
Confirm no path credits a file that does not exist. Confirm the skills-walk widening did
not pull in a non-instruction `.md` under `skills/` that turns prose into roots — list
what the widening newly collected and eyeball it. Confirm `SURFACE_NODE_RUNS_RE` is
untouched unless Step 9 found a real instance.

### Step 12: OPTIMIZE
The skills walk now visits more files. Report the added analyzer runtime at Step 14. The
walk is bounded by the repository and runs once per suite; no caching.

### Step 13: SECURE
- [x] SECURE — security-scanner Step-13 review (2026-07-29): PASS (no block; any warn documented and non-blocking).
The captured path is used to look up a file in an already-collected set, never to read
from disk directly, so a hostile surface file cannot cause a traversal. Assert that: a
fixture surface containing `require('../../../etc/passwd')` credits nothing and reads
nothing. The `{0,64}` and `{0,80}` bounds stay bounded — an unbounded quantifier on
attacker-influenced text is a denial-of-service shape.

### Step 14: VERIFY
- [x] VERIFY — full gate recorded to `.ctoc/state/verify/<slug>.json`: passed=true, coverage ≥99%, 0 skipped, 0 failed.
`node --test tests/reachability.test.js`, then the full gated `npm test`. Lint at
`--max-warnings 0`. No git operations. **Report the live unreachable list before and
after, in full** — if any file NEWLY appears, stop and report it rather than adding it to
the baseline, because an additive credit change cannot legitimately kill a file.

### Step 15: DOCUMENT
Record in `CLAUDE.md`'s dead-code-fence section that an extensionless require is credited
and that every `.md` under `skills/` is a surface. State the remaining blind spots (a
runtime-built path, and prose citation) in one sentence each, so the fence's limits are
documented where its claims are.

### Step 16: FINAL-REVIEW
- [x] FINAL-REVIEW — iron-loop-critic final verdict (2026-07-29): CLEARS Gate 3.
Report the Step 9 tabulation, case 7's red verbatim, the before-and-after unreachable
lists, the blind-spot-5 finding, and every decision taken under ambiguity.

## What this plan does NOT fix

- It does **not** revive `src/lib/inbox.js#createQuestion`. Scanning agent-fragments makes
  the file visible; the citation there is prose, and prose is correctly not an
  invocation. Making that fragment carry a real recipe, or accepting the export as dead,
  is a separate decision and the human's to schedule.
- It does **not** add `docs/**` as a surface, and blind spot 3 explains why that would be
  a regression rather than a fix.
- It does **not** handle a require whose path is computed at runtime. `00186`'s
  executing harness is the only mechanism that can, and it covers recipes rather than
  edges.
- It does **not** touch the export-reachability fence or its baseline. Different
  instrument, different ratchet.
- It does **not** wire, delete, or otherwise resolve the twenty-four files that remain
  legitimately unreachable. It removes two that never belonged.

## Decisions Taken Under Ambiguity

1. **Credit is gated on resolution against the scanned set, not on the text alone.** The
   pattern change loosens what is matched; without the resolution gate it would also
   loosen what is credited, and inventing an edge to a file that does not exist is the
   over-crediting defect the re-seed removed on 2026-07-19.
2. **A directory-style require (`./src/lib/dir` → `dir/index.js`) credits nothing.** Node
   resolves it, so this is deliberately narrower than Node. Implementing the full
   resolution algorithm — index files, `package.json` `main`, extension order — puts a
   module resolver inside a fence, and no shipped recipe in this repository uses that
   form (verified at Step 9 against every surface). If one ever does, it will show up as
   a file that wrongly enters the unreachable list, which is the loud direction.
3. **`SURFACE_NODE_RUNS_RE` keeps its mandatory extension.** `node src/x` does not run
   anything. The two patterns differ because the two mechanisms differ, and making them
   symmetric for tidiness would make one of them wrong.
4. **The skills walk widens to all `.md` rather than to a named list of fragments.** A
   named list would go stale the first time someone adds a fifth fragment, silently, in
   the direction of under-crediting — the same failure being repaired here.
5. **The baseline number is measured at Step 10.** The arithmetic depends on whether
   `00185` landed first, and both orders are legitimate. Instructing the executor to
   measure makes the slice correct under either, and a disagreement with both stated
   expectations is escalated rather than absorbed.
6. **Blind spots are enumerated in the plan even where no fix is proposed.** A fence whose
   limits are undocumented gets trusted past them. Three of the five listed here get no
   code change, and saying so plainly is the point.


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
