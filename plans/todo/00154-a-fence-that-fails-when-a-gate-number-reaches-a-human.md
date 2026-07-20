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
