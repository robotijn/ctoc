---
approved_by: human
approved_at: 2026-07-20T09:18:54.015Z
gate_crossed: implementation → todo
---

---
title: "A fence that fails when a gate number reaches a human — and that says out loud what it cannot see"
type: implementation
parent_plan: none
depends_on: 00152-the-dashboards-last-two-gate-numbers, 00153-dead-code-printing-gate-numbers-is-deleted
priority: CRITICAL
program: fresh-repository-first-run
iron_loop: true
files:
  - "src/lib/human-facing-scan.js"
  - "src/lib/iron-loop-enforcer.js"
  - "tests/gate-numbers-fence.test.js"
  - "src/lib/menu-screens.js"
  - "src/lib/task-view.js"
  - "CLAUDE.md"
  - "tests/readme-numbers.test.js"
  - "src/areas/inbox.js"
  - "tests/menu-screens-coverage.test.js"
  - "tests/menu-inbox-routes.test.js"
  - "tests/menu-task-wiring.test.js"
scope_extension:
  authorized_by: human
  authorized_at: 2026-07-21
  reason: >
    The fence works and caught FIVE live gate numbers still rendering at a
    human that the preceding slices missed: menu-screens.js:1070 (the "Plans
    at gates" door renders "Gate ${gate}") and task-view.js:249,315,329,357
    (the task board renders "Gate ${n} ready"). task-view.js was in no
    preceding slice; menu-screens.js:1070 survived the dashboard slice. These
    are the point of the whole program — real leaks, not fence debt. The
    executor correctly REFUSED to baseline them, which would have preserved
    the exact numbers the owner raged at (green-washing). Creating the module
    the plan mandated also raises the src/lib count 108->109, breaking the
    count assertion in readme-numbers.test.js and the prose in CLAUDE.md — a
    plan omission. The human has ruled on this identical fork five times today:
    extend the grant so the behaviour and the tests that guard it are fixed
    together rather than leaving five gate numbers on screen.
---

# A fence that fails when a gate number reaches a human

The rule — never print a gate number at a human — has been stated to the assistant
twice and applied to its prose both times. Twenty-seven shipped string literals
went on saying the number. **A prose rule silently stops being true.** This
repository has established that lesson repeatedly, and its answer every time has
been a test that fails.

The preceding slices clean the sites. This one makes them stay clean.

## The hard part, confronted rather than assumed

The instruction was explicit: say exactly how the fence tells a human-facing string
from an identifier or a comment, and what it cannot see. Both halves are load-bearing.

### It parses. It does not grep.

A text search cannot do this job, and the proof is the actual defect. The line that
put `Gate 3` on the owner's screen was:

```js
gateName: `Gate ${meta.gate}`,
```

Its source text contains **no digit at all**. A search of the whole repository for
"Gate 3" never finds it. Meanwhile a text search DOES find dozens of comments and
identifiers that must be left alone. A grep-based fence would therefore miss the
real defect and fire on the legitimate cases — precisely inverted.

So the scan parses. `src/lib/human-facing-scan.js` builds a syntax tree with the
TypeScript compiler API (`ts.createSourceFile(..., ScriptKind.JS)`), already a
development dependency of this repository, and walks it.

| kind of text | how the walk treats it | why |
|---|---|---|
| **comments** | never visited | comments are TRIVIA in the syntax tree, not nodes. The walk visits nodes. This is not a heuristic that mostly works — a comment is structurally incapable of being reached. |
| **identifiers** — `gate3`, `GATE_META`, `validateGate2` | never visited | an identifier is an `Identifier` node; the walk inspects only `StringLiteral`, `NoSubstitutionTemplateLiteral`, `TemplateHead`, `TemplateMiddle` and `TemplateTail`. |
| **import paths and property keys** | visited, then excluded by rule | both are string literals. A literal that is the `moduleSpecifier` of an import, or the name half of a property assignment, is skipped — those are identifiers wearing quotes. |
| **object property VALUES, arguments, returns, template text** | inspected | this is where screen text lives. |

### Two patterns, because the defect has two shapes

1. **Written out.** Any inspected literal whose text matches `/\bgates?\s+[0-3]\b/i`.
   Narrow on purpose: `\b[0-3]\b` rather than `[0-9]`, because there are four gates
   and a wider class would fire on "gate 8080" in a URL.
2. **Composed.** A `TemplateHead` or `TemplateMiddle` whose text ENDS with
   `/\bgates?\s*$/i` — the `` `Gate ${n}` `` shape — and a `StringLiteral` that is an
   operand of a `+` whose text ends the same way, the `'Gate ' + n` shape. This is
   the pattern that catches the defect that actually shipped.

A finding carries the file, the line, the column, the matched text, and which of
the two patterns fired, so a failure is actionable without opening the scanner.

### What it CANNOT see

Stated plainly, because a fence whose limits are unstated is trusted past them.

1. **Text that reaches a screen from DATA rather than from source.** The scan reads
   JavaScript. A gate number living in a YAML profile, a JSON template or a Markdown
   agent file that is loaded at runtime and rendered is invisible to it.
2. **A number composed across a module boundary.** `const n = meta.gate` in one file
   and `'Gate ' + n` in another: the second half is caught only if that file is in
   scope. If both halves sit outside the registry, neither is seen.
3. **Runtime construction with no adjacent literal.** `['Gate', n].join(' ')`,
   `String.fromCharCode`, a formatter, a lookup table keyed by number. The scan
   matches text adjacency, and these have none.
4. **Whether a flagged string is ACTUALLY rendered.** The scan cannot prove
   reachability. A gate number in a registry file that only ever goes to a log file
   is a FALSE POSITIVE, and the fence deliberately prefers it: a loud false positive
   is a five-minute conversation, a silent miss is what shipped twenty-seven times.
5. **Wording quality.** It catches a NUMBER. It cannot catch a screen that says
   "Send back to functional for requirements rework" — internal vocabulary carrying
   no digit. The stage-name work in the earlier slices is fenced only by those
   slices' own render assertions, and that gap is real.
6. **Agent and skill Markdown, plan files, commit messages.** Out of scope by
   design: the owner's rule permits numbers in identifiers, comments and file
   formats.

Limits 1 and 3 are the ones most likely to bite. Neither is closed by this slice,
and neither is quietly hoped away.

### Scope: which files count as human-facing

Not every string in `src/` is read by a person — ledger evidence, log lines and
frontmatter keys must keep their numbers. So the scan runs over a REGISTRY of
screen-producing modules, declared in `human-facing-scan.js`.

A hand-maintained registry rots — a new screen file added next month simply is not
in it, and escapes silently. So the registry is defended by a second check:

> **Every module that produces the screen contract must be in the registry.**

A module "produces the screen contract" when its source returns an object literal
carrying all three of `text`, `ask` and `actions` — the shape every screen in this
codebase returns. That is itself a syntax-tree query, not a name convention. A new
screen module that is not registered fails the fence **by omission**, naming itself
in the failure message. The registry cannot rot silently; it can only fail loudly.

## Implementation Details

### File: `src/lib/human-facing-scan.js`
**Action:** CREATE
**Purpose:** Find gate numbers that reach a human, by parsing rather than guessing.
**Change Type:** new-module

#### Exports

- `SCREEN_MODULES` → frozen array of repository-relative paths: the registry.
- `scanFile(absPath)` → `{ available: true, findings: Finding[] } | { available: false, reason: string }`
  - `Finding` is `{ file, line, column, text, pattern: 'written'|'composed' }`.
  - Never throws. An unreadable or unparseable file yields
    `{ available: false, reason }` — **never an empty findings list**, because
    "I could not read it" and "I read it and it was clean" are different facts and
    a scanner that returns the success value for both is the exact false-green
    shape this repository fences.
- `scanRegistry(root)` → `{ available, reason?, findings, scanned: string[] }`
  - Runs `scanFile` over every registry entry. If ANY file is unavailable, the whole
    result is `available: false` with the reason naming the file.
- `findUnregisteredScreens(root)` → `{ available, reason?, modules: string[] }`
  - Every `src/**/*.js` that returns the `{ text, ask, actions }` contract and is not
    in `SCREEN_MODULES`.

#### The parser is loaded lazily and its absence is reported, never swallowed

```js
function loadParser() {
  try { return { ok: true, ts: require('typescript') }; }
  catch { return { ok: false, reason: 'the TypeScript parser is not installed; this scan cannot run' }; }
}
```

`typescript` is a DEVELOPMENT dependency and `src/` ships to user projects, so the
require must be lazy and must never be a load-time failure. When it is missing the
scan reports `available: false`. **In this repository's gated run that is a FAILURE**
(the parser is installed, so absence means something is broken). **In a user project
it is reported as not-run, never as passed.** Those two treatments are deliberately
different and are the whole reason the return type carries `available` rather than
just a findings array.

#### Dependencies
- `path`, `./safe-fs`, and a lazy `typescript`.
- Nothing from `hooks/` or `commands/` — dependencies point inward.

#### Called By
- `src/lib/iron-loop-enforcer.js` — a new check, this slice.
- `tests/gate-numbers-fence.test.js` — the ratchet, this slice.

---

### File: `src/lib/iron-loop-enforcer.js`
**Action:** MODIFY
**Purpose:** Give the scan a live call site, so it is reachable by a human on demand
and not only by its own test.
**Change Type:** modify-existing — one new check, registered beside `false-green-fence`

Add a `gate-words-fence` check following the established shape of the existing
`false-green-fence` check in the same file: it calls `scanRegistry` and
`findUnregisteredScreens`, and reports

- `available: false` → **the check FAILS**, with the reason. Not "skipped", not
  "passed". A check that could not run has no verdict to give.
- findings present → FAIL, listing file, line and matched text for each.
- unregistered screen modules present → FAIL, naming each.
- otherwise → pass.

This is the live call site required by the wiring rule. Without it the scanner
would be a module proved only by its own test, which is the failure mode this
repository names in its sixteenth operating lesson — and it would be a particularly
poor one to commit while building a fence against exactly that class of problem.

### Wiring — the live call sites

| new code | live call site | root |
|---|---|---|
| `human-facing-scan.scanRegistry` | `iron-loop-enforcer`'s `gate-words-fence` check | the enforcer, reachable from the shipped entry point |
| `human-facing-scan.findUnregisteredScreens` | same check | same |
| `SCREEN_MODULES` | both of the above, plus the ratchet test | same |
| `tests/gate-numbers-fence.test.js` | `npm test` | the gated suite |

Two roots, deliberately: the gated test run makes it a ratchet, the enforcer check
makes it answerable on demand.

## Test Plan

### Tests: `tests/gate-numbers-fence.test.js`
**Action:** CREATE
**Framework:** `node:test`

The scanner is tested against FIXTURE source written by the test, so each pattern
is proved on code the test controls. The repository-wide assertion is separate.

| # | Case | Fixture / action | Assertion |
|---|---|---|---|
| 1 | **a written-out gate number is found** | `const s = 'Approve across Gate 3?';` | one finding, `pattern: 'written'`, correct line |
| 2 | **the composed form is found** | ``const s = `Gate ${n}`;`` | one finding, `pattern: 'composed'` — **the regression test for the defect that actually shipped** |
| 3 | **concatenation is found** | `const s = 'Gate ' + n;` | one finding, `pattern: 'composed'` |
| 4 | **a comment is NOT a finding** | `// crosses Gate 3 here` and `/* Gate 2 */` | zero findings |
| 5 | **a JSDoc block is NOT a finding** | `/** Validate before Gate 3. */` | zero findings |
| 6 | **an identifier is NOT a finding** | `const gate3 = 1; validateGate2();` | zero findings |
| 7 | **an import path is NOT a finding** | `require('./gate-3-helper')` | zero findings |
| 8 | **a property KEY is not a finding, its VALUE is** | `{ 'gate 3': x, label: 'Gate 3' }` | exactly one finding, on the value |
| 9 | **a number outside the gate range does not fire** | `'Gate 8080 of the server'` | zero findings — the `[0-3]` bound, asserted |
| 10 | **case and plural are caught** | `'gate 3'`, `'Gates 1'` | both found |
| 11 | **an unparseable file is UNAVAILABLE, not clean** | fixture containing `function ( { ][` | `available === false`, and `findings` is NOT an empty passing list |
| 12 | **a missing file is UNAVAILABLE, not clean** | a path that does not exist | `available === false` with a reason naming the path |
| 13 | **an unavailable file poisons the whole registry result** | one good file, one missing | `scanRegistry` returns `available: false` |
| 14 | **the real registry is clean** | `scanRegistry(repoRoot)` | `available === true` and `findings` is empty — the ratchet over the shipped product |
| 15 | **every screen module is registered** | `findUnregisteredScreens(repoRoot)` | `modules` is empty; a failure names the unregistered file |
| 16 | **the registry names only files that exist** | each `SCREEN_MODULES` entry | `fs.existsSync` true for each — so a renamed file fails here rather than being silently dropped from the scan |
| 17 | **the enforcer check fails on a finding** | drive the `gate-words-fence` check against a fixture root containing a planted `'Gate 3'` | the check reports failure and names the file and line |
| 18 | **the enforcer check fails when the scan is unavailable** | force `loadParser` to fail through the require-cache seam | the check reports FAILURE, and its message contains neither "passed" nor "skipped" |

Case 18 is the one that keeps this fence honest about itself. Case 2 is the one that
proves it catches the defect that shipped. Case 16 is what keeps the registry from
silently emptying itself.

Cross-platform: `path.join`, `os.tmpdir()`, `fs.promises.rm` teardown. The registry
entries are stored repository-relative and joined with `path.join`, never
concatenated, so the scan works on Windows.

## What this slice does NOT fix

- **Blind spots 1 through 6 above**, none of which are closed.
- **Stage names.** The fence catches digits. `Send back to functional` carries no
  digit and passes. Only the earlier slices' render assertions cover that, and only
  for the screens they drive.
- **Whether the replacement wording is any good.** A fence can prove a number is
  absent. It cannot prove a sentence is clear. That remains a human judgement, and
  it should.
- **Other codebases' screens.** The registry covers this repository's modules.
- **Anything about the phantom plan or the empty-plan screen.** Different slices.

## Could this fence have caught the other two defects?

Asked directly, so answered directly.

**The empty-plan screen: no, but something could have.** The fence looks for gate
numbers. It would never notice that a plan with no body is offered four options.
What WOULD have caught it is a test that drives the real screen with a degenerate
artifact — an empty plan file — and there was none, because every existing screen
test seeds a well-formed plan. That is a fixture-realism gap, and it is closed in
the empty-plan slice rather than pretended away here.

**The phantom plan and the broken first run: no, and honestly, almost nothing
automated would have.** Every test in this suite builds its own fixture project
directory, which means every test runs against a correctly-initialised root. The
defect lives in what happens when initialisation does NOT happen, in a directory
nested under another project, on a real machine. **Only a human opening a fresh
repository was going to find that** — which is exactly what happened. The nearest
thing to a fence is an end-to-end first-run test that creates a genuinely empty
directory inside a CTOC project and drives the real entry point, and that test is
specified in the fresh-repository slice. It would have caught this one. It would
not have caught the class.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/gate-numbers-fence.test.js` in full, run ONLY that file, record the red output verbatim. Every case is red at the start (the module does not exist). Cases 14 and 15 are the ones to watch: if either is red AFTER the module works, a preceding slice has not fully landed and that is the finding.
### Step 9: PREPARE — re-read from disk: `src/lib/iron-loop-enforcer.js`'s `false-green-fence` check, to copy its registration shape exactly rather than inventing a second one; `src/lib/false-green-scan.js`, for this repository's established scanner conventions; and confirm `node_modules/typescript` is present. Confirm the preceding slices have landed by running their tests — if `src/lib/gate-words.js` is absent, STOP and report.
### Step 10: IMPLEMENT — one step, files as sub-items.
  - `src/lib/human-facing-scan.js` — the parser-based scanner, the registry, the contract query.
  - `src/lib/iron-loop-enforcer.js` — the `gate-words-fence` check.
### Step 11: REVIEW — confirm the walk visits no comment (prove it by case 4 and 5, not by reading the code). Confirm no code path returns an empty findings list when the file could not be read. Confirm the enforcer check treats unavailable as failure. Confirm `require('typescript')` is lazy and inside a `try`, so a user project without the development dependency does not crash the enforcer.
### Step 12: OPTIMIZE — the registry is a handful of files and the scan is one parse each; it runs on demand and in the gated suite, not on every render. Confirm the parse is not repeated per pattern.
### Step 13: SECURE — the scan reads source files under the project root only. Confirm every path is resolved and confined beneath `root` before it is read, so a crafted registry entry cannot read outside the project. Confirm findings echo the matched text through a control-character strip, since a finding is printed to a terminal.
### Step 14: VERIFY — `node --test tests/gate-numbers-fence.test.js tests/false-green-fence.test.js tests/iron-loop-enforcer-coverage.test.js tests/gate-words.test.js tests/dashboard-says-the-moment.test.js` green, then the full gated run `npm test`. Lint both changed JavaScript files. No git operations.
### Step 15: DOCUMENT — a header comment on `human-facing-scan.js` carrying the rule, the two patterns, and **the six blind spots verbatim**. A fence whose limits live only in a plan file is a fence somebody will trust past its edge. Add the fence to `CLAUDE.md`'s quality section beside the false-green fence; if that edit is required, add `CLAUDE.md` to this plan's `files:` rather than editing an undeclared file.
### Step 16: FINAL-REVIEW — report the fence's findings on the real repository, the verbatim red and green evidence, the six blind spots, and every decision taken under ambiguity.

## Decisions Taken Under Ambiguity

1. **Parse, do not grep.** The defect that shipped has no digit in its source text.
   A text search would have missed it while firing on every comment. This is not a
   preference for rigour; the cheap approach is measurably inverted on the real case.
2. **The TypeScript compiler API rather than a hand-rolled lexer.** Distinguishing a
   regular-expression literal from division in JavaScript requires real parsing;
   a hand-rolled scanner gets it wrong on some file and the failure is silent. The
   parser is already a development dependency of this repository.
3. **Lazy require, and absence is a FAILURE here and a NOT-RUN elsewhere.** `src/`
   ships to user projects that will not have the development dependency. A
   load-time require would crash the enforcer there. Reporting `available: false` and
   letting each caller decide is the only shape that is honest in both places.
4. **`available` is part of the return type, not an exception.** A scanner that
   returns an empty findings list when it could not read its input is the
   false-green shape this repository has fixed five times. The type makes that
   mistake unrepresentable.
5. **`[0-3]`, not `[0-9]`.** There are four gates. A wider bound fires on port
   numbers and version strings, and a fence that cries wolf gets whitelisted into
   uselessness.
6. **A registry, not all of `src/`.** Ledger evidence, log lines and file-format
   keys legitimately carry gate numbers. Scanning everything would produce a
   findings list long enough that the only way to ship would be a large whitelist —
   and a large whitelist is how a fence dies.
7. **The registry is defended by the screen-contract query.** A hand-maintained list
   rots silently. Making an unregistered screen module a FAILURE converts silent rot
   into a loud, self-naming failure. This is the part of the design most likely to
   need tuning, and case 15's failure message is written to make tuning obvious.
8. **False positives are accepted; misses are not.** A gate number in a registry
   file that only reaches a log will fire the fence. That is the correct trade at a
   ratio of one awkward conversation against twenty-seven silent shipments.
9. **The enforcer wiring is in THIS slice, not a follow-up.** Building a
   reachability-adjacent fence while leaving the fence itself reachable only from
   its own test would be the exact failure the fence exists to prevent.

### Finding A — the fence works and the shipped product is NOT clean

The scanner and the enforcer check are built, wired, linted, and `26` of `27`
own-fixture cases are green. The one red is the ratchet over the real repository
(the plan's case `14`), and it is red for the reason the plan itself named at Step 8:
a preceding slice did not fully land. The fence found `5` genuine composed
gate-number leaks that reach a human, all of the `` `Gate ${n}` `` shape whose source
carries no digit:

- `src/lib/menu-screens.js:1070` — the "Plans at gates" inbox door renders
  `` `${plan}  [${stage}]  Gate ${gate}  …` ``. Survived the dashboard slice.
- `src/lib/task-view.js:249` — the task board suffix `` ` → Gate ${t.result.gate} ready` ``.
- `src/lib/task-view.js:315` — the task-detail line `` `  gate:   Gate ${task.result.gate} ready\n` ``.
- `src/lib/task-view.js:329` — the next-action label `` `Gate ${gate} ready ▸` ``.
- `src/lib/task-view.js:357` — the tasks-inbox line `` `  ⊙ Gate ${t.result.gate} ready — …` ``.

`src/lib/task-view.js` was in NO preceding slice's `files:`. `src/lib/menu-screens.js:1070`
survived the slice that touched that file. Neither file is in THIS plan's `files:`
grant, so I did not edit them. This is a scope fork for the human.

### Finding B — a false positive found and closed inside my own grant

The composed pattern first matched `src/lib/menu-screens.js:590`
(`` `…plans at gates${flag}` ``) — the English plural noun "gates" in a count phrase,
not a number. The pattern was `/\bgates?\s*$/i`; it is now `/\bgates?\s+$/i`
(require the trailing whitespace that always precedes the interpolated number). The
real leaks keep firing; the prose no longer does. Locked by a dedicated
false-positive test, and the tightening is proved to bite by mutation.

### Finding C — creating the module bumps the module count, which the plan did not grant

Creating `src/lib/human-facing-scan.js` raises the `src/lib` top-level count from
`108` to `109`. `tests/readme-numbers.test.js` asserts that count with exact
equality, and `CLAUDE.md` states `108 JS modules`. Both must move to `109`. Neither
`CLAUDE.md` nor `tests/readme-numbers.test.js` is in this plan's `files:` grant. The
plan told me to create the module but did not grant the two files that pin its count
— an omission in the plan. This is the second half of the scope fork.

### Finding D — the live error-path leak at actions.js:988 is OUT of this fence's reach

`src/lib/actions.js:988` still holds a live `console.error` printing
`Gate 3 (review→done) will refuse it` on a Step 14 VERIFY failure. The fence does
NOT flag it, by design: `src/lib/actions.js` does not return the `{ text, ask, actions }`
screen contract, so it is neither in `SCREEN_MODULES` nor surfaced by
`findUnregisteredScreens`. This fence covers rendered SCREEN strings, not
`console.error` diagnostics in non-screen modules — blind spot `4` (reachability)
and the registry scope, stated plainly. `src/lib/actions.js` is not in this grant
regardless. Closing that leak is separate work and a separate scope decision.

### Decision taken — tighten, do not baseline

The five real leaks are trivially fixable (five lines, two files) and represent
exactly the number on the owner's screen he objected to. Seeding a debt baseline
that PERMITS them to stay would be green-washing the very defect the fence exists to
catch — unlike the false-green (`135`) and reachability (`26`) baselines, whose debt
is too large to clear in one slice. So I did NOT create a baseline file. The correct
resolution is to FIX the two screen modules, which requires the human to extend the
grant. I stopped rather than route around the grant.

### Finding E — the registry was hand-seeded and had the SAME blind spot as the leak

The first registry listed only `menu-screens.js`, `streaming-gate.js`, `task-view.js`
— seeded from the modules I remembered. It OMITTED the entire `src/areas/*` TUI
family, which is exactly the screen a live gate number had reached: `src/areas/inbox.js`
renders the inbox the human sees on opening the tool, and printed `` `Gate ${p.gate}` ``
at line `49`. A fence that scans a hand-picked subset lies about its coverage. Root
cause: `findUnregisteredScreens` only recognised the `{ text, ask, actions }` object
contract, so it could not SEE the `render(app) → string` area/tab modules and never
reported them as unregistered. Fixed: `moduleProducesScreen` now detects BOTH
contracts (object return AND a `render` export), and a regression test plants an
unregistered `render`-export module and asserts it is named.

### The registry-completeness audit — measured, all 14 screen modules

Detected screen modules (both contracts) and their leak state, scanned by the fence:

- object contract: `src/commands/menu.js` (clean), `src/lib/menu-screens.js` (LEAK,
  fixed), `src/lib/streaming-gate.js` (clean), `src/lib/streaming-render.js` (clean),
  `src/lib/task-view.js` (LEAK ×4, fixed).
- render-export areas/tabs: `src/areas/agent.js`, `src/areas/inbox.js` (LEAK, fixed),
  `src/areas/library.js`, `src/areas/pipeline.js`, `src/areas/system.js`,
  `src/tabs/overview.js`, `src/tabs/review.js`, `src/tabs/tools.js`,
  `src/tabs/vision.js` — all clean except inbox.

All `14` are now registered. The `3` that leaked were all in the extended grant and
are fixed; the `11` clean ones are registered read-only (scanning is not editing).
No screen module is outside the registry, and no registered module leaks.

### Gate-words decisions for each surface

- `src/lib/menu-screens.js:1070` (Plans-at-gates door) has the plan's STAGE, so it
  consumes `gate-words.chip(it.stage)` — the compact decision label (`Finished?`,
  `Build it?`). Number gone, decision named.
- `src/areas/inbox.js:49` (inbox area row) also has the stage → `gate-words.chip(p.stage)`.
- `src/lib/task-view.js` (`249`, `315`, `329`, `357`) has ONLY the integer
  `result.gate` — NO stage travels with a task, so `gate-words` (keyed by stage)
  cannot map it, and I did NOT bend a phrase or add a numeric field to `gate-words`
  (which is out of grant and deliberately number-free). The task board POINTS AT a
  decision; the decision screen itself words the moment. So the honest, number-free
  status is generic: `→ decision ready`, `a decision is waiting for you`,
  `Decision ready ▸`. The integer still SIGNALS "at a human decision"; it is never
  printed.

### Decision — the "Plans at gates" header and the raw stage names stay, for now

The section headers (`Plans at gates`) and the raw stage tokens (`[review]`,
`(functional)`) are the SAME class of internal vocabulary, but they carry no NUMBER,
so this fence has no teeth on them, and changing them cascades into out-of-grant
render tests. That is a wording slice of its own. Recorded as a finding, not bent in
here.

### Finding F — the state-manager gate-number error strings do not reach a human today

`src/lib/state-manager.js:178-195` (`verifyGateApproval`) returns
`` `Gate ${gateNumber} approval not found` `` and siblings as validation-error
strings. `verifyGateApproval` has NO live caller anywhere in `src/` (grepped), so
those strings reach no human today — a latent leak, not a live one. It is the same
class as `actions.js:988`: an error-RETURN shape, not a screen contract, so the
fence's registry does not cover it by design. Whether error-return shapes deserve
their own fence is a separate decision; recorded so a later slice picks it up.
`src/lib/state-manager.js` is not in this grant.

### Finding G — the suite was DEFENDING the old wording; three test files need inverting

After fixing the `6` leaks, `7` assertions in THREE out-of-grant test files fail
because they assert the OLD, numbered wording — the "the suite was not failing to
catch the defect, it was DEFENDING it" pattern this plan exists to end:

- `tests/menu-screens-coverage.test.js` — `1` failing test asserting the door rows
  read `` `[review]  Gate 3  plans/review/...` `` (lines `443`-`445`).
- `tests/menu-inbox-routes.test.js` — `1` failing test asserting the door lists each
  source stage with its gate number.
- `tests/menu-task-wiring.test.js` — `5` failing tests asserting the task board and
  detail read `Gate N ready` (S9, the board-suffix case, GS2, GS6, and the
  taskLabel/planName fallbacks case).

None is in the grant. Each must be INVERTED (assert the number is ABSENT and the new
wording is present), with the three-part justification, not softened. This is the
consolidated scope fork: I need those three test files added to `files:` to finish.
`tests/inbox-coverage.test.js` and `tests/menu-protocol.test.js` still PASS — the
inbox-area render tests accept the new wording, and `menu.md`'s `Gate N ready` is the
internal agent-completion protocol token (a machine contract, not a human screen), so
it is correctly left alone.

### The seven inversions — each with its three-part justification

The grant was extended to the three test files, and each of the seven assertions was
INVERTED (assert the number ABSENT and the new wording present), never softened. The
justification is the same contract for all seven and is stated once here, then
per-site:

- (a) The contract from OUTSIDE the test: the owner reads a gate number as an
  undecodable internal code and said "no numbers" three times; this program removes
  them from every human screen; `src/lib/gate-words.js` is the one encoding of what
  each moment IS in plain words.
- (b) Why the TEST was wrong, not the code: each assertion demanded the screen PRINT
  the exact string the owner objected to (`Gate 1/2/3`, `Gate N ready`). The human
  explicitly replaced that contract, so the test asserted a bug.
- (c) What newly fails: each site now carries a `doesNotMatch(/\bGate\s+[0-3]\b/)`, so
  a gate digit returning to that screen is a FAILING case, not a silent regression.

The seven, by site:

1. `menu-screens-coverage.test.js` — the door: `Gate 1/2/3` → the decision label
   (`Build this?` / `Build it?` / `Finished?`) via `chip(stage)`, plus the
   no-gate-digit guard.
2. `menu-inbox-routes.test.js` — the door list: asserted `includes('Gate 1')` /
   `includes('Gate 3')` → `includes('Build this?')` / `includes('Finished?')`, plus
   the guard.
3. `menu-task-wiring.test.js` S9 — inbox line `Gate 3 ready` → `Decision ready`;
   detail JSON `Gate 3 ready` → `a decision is waiting for you`, plus guards on both.
4. `menu-task-wiring.test.js` board-suffix — `Gate 2 ready` → `decision ready`, plus
   the guard.
5. `menu-task-wiring.test.js` taskLabel/planName fallback — inbox line
   `Gate 1 ready — gatelbl` → `Decision ready — gatelbl` (the fallback ladder itself
   is unchanged; only the number is gone), plus the guard.
6. `menu-task-wiring.test.js` GS2 — detail `Gate 3 ready` → `a decision is waiting for
   you`, plus the guard; the nav-only gate-safety assertions are untouched.
7. `menu-task-wiring.test.js` GS6 — detail `Gate 2 ready` → `a decision is waiting for
   you`, plus the guard.

`tests/inbox-coverage.test.js` and `tests/menu-protocol.test.js` were NOT touched:
the first already accepts the new inbox-area wording, and the second guards `menu.md`'s
`Gate N ready`, the machine agent-completion protocol token, which is correctly left
alone.

### Reconciliation to the real gate — the fork in Finding A is RESOLVED, not open

Finding A above records the point-in-time state during the build: five leaks found,
the grant not yet extended, "a scope fork for the human." Findings E–G and the seven
inversions record what happened next — the human extended the grant, the leaks were
fixed, and the defending tests were inverted. This note closes the tense so a reader
landing on Finding A does not misread the work as unfinished. Re-verified against the
shipped tree:

- **Full gate (`npm test`, whole suite via test-gate.js):** PASS — coverage 99.15%
  (threshold 99%), 0 failed, 0 skipped, 0 flaky. Not a narrowed one-file run.
- **`npx tsc --noEmit`:** clean.
- **The fence over the real repository (`scanRegistry`):** `available: true`, 14 screen
  modules scanned, **0 findings** — the plan's case 14 ratchet is now green, and every
  leak Finding A listed in `menu-screens.js`, `task-view.js` and `inbox.js` is gone from
  source (the only remaining `Gate 3` occurrences in those files are comments, which the
  parser never visits).
- **`findUnregisteredScreens`:** `available: true`, **0 unregistered** — every
  screen-producing module is in `SCREEN_MODULES`.
- **Enforcer wiring:** the `gate-words-fence` check is registered in
  `src/lib/iron-loop-enforcer.js` and calls both `scanRegistry` and
  `findUnregisteredScreens`, so the fence is reachable on demand and not only from its
  own test.

The record is faithful to the shipped code; this is the only reconciliation applied.

## Decisions Taken During Implementation

### Follow-up fix (v6.13.89) — the WRITTEN separator missed a HYPHEN, and two live `Gate-3` strings survived the fence

**The defect.** `WRITTEN` was `/\bgates?\s+[0-3]\b/i`. `\s` matches spaces, not a
hyphen, so `Gate-3` never matched. The scanner therefore reported the registry CLEAN
while two live human-facing strings in `src/lib/menu-screens.js` kept printing the
number — the exact false-green the fence exists to prevent, in the fence itself:

- `src/lib/menu-screens.js:1782` — the review list `done-all` bulk hint:
  `"done-all-<parent> = Gate-3 approve all of <parent>'s reviewed slices"`.
- `src/lib/menu-screens.js:2423` — the completion-failure diagnostic:
  `` `An implement task must produce Gate-3 evidence; the task is left unsettled` ``.

Both are `written`-shape literals with a literal hyphenated `Gate-3`; the widened
pattern flagged exactly these two and nothing else on the real registry (proven by a
scanRegistry run BEFORE the strings were fixed — 2 findings, both at the lines above).

**The fix (two parts).**
1. `WRITTEN` widened to `/\bgates?[\s_-]*[0-3]\b/i`. The separator class now spans
   space, underscore and hyphen (zero or more), so `Gate 3`, `Gate-3`, `Gate_2` and the
   unseparated `gate3` all match. `[0-3]` (not `[0-9]`) is unchanged — the narrowing is
   on the DIGIT, and it is what keeps the plural noun "gates" in prose silent: WRITTEN
   requires a gate digit immediately after the word, and prose "gates" carries none.
   The `\s+` guard that COMPOSED_END needs against the count-phrase plural is NOT needed
   by WRITTEN and was the copy-paste origin of the bug.
2. The two leaked strings now say the MOMENT, not the number:
   `"done-all-<parent> = approve all of <parent>'s reviewed slices"` and
   `"An implement task must produce completion evidence; …"`.

**Decision — reword, do not baseline.** As with the original slice's five leaks, these
two are trivially fixable and are precisely the number the owner objects to. Seeding a
debt baseline that permits them would green-wash the defect. No baseline file exists for
this fence and none was created; the tighter WRITTEN pattern only ever ADDS reach.

**Over-false-positive check.** The plural "gates" and a bare "gate" in prose, with no
adjacent gate digit, stay clean (locked by a dedicated test): `Gate 8080`, `Gate 42`,
`two plans at gates`, `all four gates`, `3 gates ago` all produce zero findings. The
composed count-phrase guard (`COMPOSED_END`) is untouched.

**Comments kept their numbers.** `menu-screens.js` lines 1758, 1803, 2338 still say
`Gate-3` in COMMENTS. Comments are trivia in the syntax tree and are never visited by
the walk; numbers in comments are legal by the rule. Left as-is, deliberately.

**Scope.** Only `src/lib/human-facing-scan.js` (the pattern + its header doc),
`src/lib/menu-screens.js` (the two strings) and `tests/gate-numbers-fence.test.js` (the
red-first hyphen/underscore case + the prose over-false-positive guard) were touched. No
module was added, so the src/lib count is unchanged and `readme-numbers.test.js`/CLAUDE.md
need no edit. No VERSION bump, no plan stage move.
