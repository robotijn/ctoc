---
approved_by: human
approved_at: 2026-07-20T11:56:02.842Z
gate_crossed: implementation → todo
title: "The refinement loop writes its journals to the home directory, invisible to the project"
type: implementation
parent_plan: none
depends_on: 00175-a-session-that-cannot-identify-a-project-invents-one
priority: HIGH
program: resolution-and-setup-tell-the-truth
iron_loop: true
files:
  - "src/lib/refinement-loop.js"
  - "tests/refinement-loop-writes-into-the-project.test.js"
---

# The refinement loop writes its journals to the home directory

Of the three private root resolvers that over-root, this is the one that **writes**
to the wrong place. It gets its own slice for that reason: the other two
(`budget.js`, `iron-loop-enforcer.js`, slice five) read, and a read from the wrong
place produces a wrong answer, while a write to the wrong place produces a wrong
answer AND leaves debris in the operator's home directory.

## The mechanism, verified in code

`src/lib/refinement-loop.js:103-114`:

```js
function findProjectRoot(start = process.cwd()) {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (safeFs.existsSync(path.join(dir, '.claude-plugin')) || safeFs.existsSync(path.join(dir, '.ctoc'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}
```

**A BARE `.ctoc` is accepted as a marker, and the walk climbs ten levels.**

The shared resolver documents having fixed exactly this, in a comment written at
the cost of the same defect (`src/lib/project-root.js:87-94`):

> *A `.ctoc` entry alone is NOT proof of a project root: `src/lib/crypto.js`
> creates the global crypto home `~/.ctoc` (holding only `.secret`) on any machine
> that has used CTOC's crypto path. Accepting a bare `.ctoc` made Pass 1 climb from
> any project under `$HOME` up to `~/.ctoc` and over-root to `$HOME`.*

Verified: `src/lib/crypto.js:13` is `const CTOC_HOME = path.join(os.homedir(), '.ctoc')` and `:21-23` creates it unconditionally in `getInstallationSecret`. On any machine that has used CTOC's crypto path — which is the enforcement layer, so effectively every machine — `~/.ctoc` exists.

**The consequence, traced:** a project under the home directory with no `.ctoc` of
its own resolves upward to the home directory. Then `:116-126`:

```js
function loopDir(planSlug, root = findProjectRoot()) {
  return path.join(root, '.ctoc', 'loops', planSlug);
}
```

and `appendRound` (`:161-162`) calls `ensureDir(loopDir(...))`, which creates it.
So the journals and the critic letters for a project's refinement loop are written
to **`~/.ctoc/loops/<plan>/`** — inside the crypto home, invisible to the project
they describe, and indistinguishable between projects. Two different projects with
the same plan slug write to the same file.

The fix in the shared resolver landed. **The private copy never learned it** — that
is the whole reason a private copy is a defect and not merely duplication.

### Why `coverage-map.js` is NOT this defect, verified before treating them alike

The brief asks that the distinction be verified rather than assumed. It holds, for
two independent reasons — `src/lib/coverage-map.js:332-346`:

```js
const markers = ['package.json', 'go.mod', 'Cargo.toml', 'pyproject.toml', '.git'];
// ... walks ...
return null;
```

1. **It never accepts a bare `.ctoc`.** `~/.ctoc` cannot capture it at all, so the
   over-rooting route does not exist here.
2. **It returns a distinguishable `null`** when it finds nothing, instead of
   `return start`. It reports the absence rather than substituting a guess — which
   is the exact discipline every other defect in this program is missing.

**The count, corrected and stated:** five private root finders exist under `src/`
(`coverage-map.js`, `refinement-loop.js`, `iron-loop-enforcer.js`, `budget.js`,
`scripts/run-evals.js`). **Three carry this defect**: `refinement-loop.js` (here),
`iron-loop-enforcer.js` and `budget.js` (slice five). `coverage-map.js` is excluded
for the two reasons above; `scripts/run-evals.js:111-122` is excluded because its
markers are `VERSION` and `.git` — no bare `.ctoc`, so it cannot over-root to the
home directory — and it is a build script, not runtime. The brief's correction that
`SessionStart.js` does NOT carry a private copy is confirmed: `:22-24` delegates to
the shared resolver, and its defect is discarding the verdict, not re-implementing
the walk (slice one).

## The decision this slice settles

Delegating to the shared resolver fixes the bare-marker acceptance. It does not
fix everything, because `findProjectRoot` (the lossy wrapper) **returns the working
directory on fallback**. For a reader that is a wrong answer; for a writer it means
journals land in whatever directory the process happened to start in.

**Chosen: delegate to `describeProjectRoot`, and REFUSE to write when
`marker === 'fallback'`.**

Same discipline as slice one, applied to a writer: when resolution admits it could
not identify a project, the write does not happen at a guessed location. It does
not throw either — the refinement loop runs inside the Iron Loop and must not take
it down. `appendRound` returns a skipped result naming the reason.

**Explicitly rejected: writing to the working directory on fallback.** It is
today's behaviour minus the home-directory climb, and it would still scatter
journals into arbitrary directories — a quieter version of the same defect, which
is how this one survived.

## Implementation Details

### File: `src/lib/refinement-loop.js`
**Action:** MODIFY
**Purpose:** The loop writes into the project it is refining, or does not write.
**Change Type:** modify-existing — delete a private resolver, add a fallback guard

#### Change 1 — delete the private resolver (`:103-114`)

It is replaced by a delegation to the shared one:

```js
const { describeProjectRoot } = require('./project-root');

function findProjectRoot(start = process.cwd()) {
  return describeProjectRoot(start).root;
}
```

**`findProjectRoot` is EXPORTED from this module (`:609`)**, so the name and its
string return type are preserved rather than removed. Step 9 enumerates its
callers; a signature change here is a change to every one of them and is not this
slice's to make.

#### Change 2 — the write paths refuse a fallback root

`appendRound` (`:161`) and any other function reaching `ensureDir` gain a guard.
`loopDir`, `journalPath` and `letterDir` are pure path builders and are NOT
guarded — a caller may legitimately compute a path without writing to it.

```js
function appendRound(planSlug, roundEntry, root) {
  const resolved = root !== undefined
    ? { root, marker: 'caller-supplied' }
    : describeProjectRoot();
  if (resolved.marker === 'fallback') {
    return { written: false, skipped: true,
             reason: `no project identified: ${resolved.fallbackReason}` };
  }
  // ... unchanged from here
}
```

An explicitly supplied `root` is honoured without question — the caller has
asserted it, and second-guessing a caller's explicit argument is a different
defect. Only the DEFAULT is narrowed, and the default is where the guess lives.

Step 9 enumerates every function in this module whose default parameter is
`findProjectRoot()` and confirms each one is classified as reader or writer;
the classification, not this plan's list, decides which get the guard.

### Wiring — the live call sites

| new code | live call site | root |
|---|---|---|
| the delegating `findProjectRoot` | every default parameter in this module (`:116`, `:120`, `:124`, `:161`, and any found at Step 9), plus its existing external callers | the Iron Loop refinement path |
| the `appendRound` fallback guard | `appendRound`, called by the refinement loop's round machinery | same |

No new module. The one export whose behaviour changes keeps its name, arity and
return type.

## Test Plan

### Tests: `tests/refinement-loop-writes-into-the-project.test.js`
**Action:** CREATE
**Framework:** `node:test`

The home-directory cases use a temp tree standing in for a home directory, driven
through the `start` parameter. **No test touches the real home directory** — a test
that writes to the operator's home directory is a defect whatever it proves.

| # | Case | Fixture | Assertion |
|---|---|---|---|
| 1 | **a bare `.ctoc` above the project does not capture it** | stand-in home holding `.ctoc/.secret` only; project directory beneath it with `.git/` and no `.ctoc` | the resolved root is the PROJECT, not the stand-in home. MUST be red |
| 2 | **journals land in the project** | case 1, then `appendRound` | `journal.yaml` exists under the project; the stand-in home gains NOTHING. MUST be red |
| 3 | **two projects do not collide** | two sibling projects under the stand-in home, same plan slug, one round each | two distinct journals with distinct contents — today both write to one file |
| 4 | **the real crypto home shape is the fixture** | the stand-in home's `.ctoc` holds exactly `.secret`, matching `crypto.js:13-23` | pins the fixture to the real-world shape, so a change in what `crypto.js` creates surfaces here |
| 5 | **an unidentifiable location writes nothing** | empty temp directory with no marker in any ancestor | `appendRound` returns `written: false` with a reason, and no file and no directory is created anywhere |
| 6 | **refusal does not throw** | case 5 | no exception; the Iron Loop is not taken down |
| 7 | **an explicitly supplied root is honoured** | any directory, passed as `root` | written there, no resolution performed — the caller's assertion is not second-guessed |
| 8 | **a real CTOC project still works** | directory with `.ctoc/settings.yaml` | unchanged behaviour: journal at `.ctoc/loops/<slug>/journal.yaml` |
| 9 | **a `plans/` project still works** | directory with a CTOC `plans/` tree and no `.ctoc` | resolves by the `plans` marker and writes there |
| 10 | **a nested repository keeps its own journals** | outer CTOC project, inner directory with `.git/`, loop run in the inner one | the journal is in the INNER repository; the outer project's `.ctoc/loops/` is untouched |
| 11 | **the ten-level climb is gone** | a marker-less directory nested twelve deep under a stand-in home that HAS `.ctoc` | no write reaches the stand-in home |
| 12 | **the export contract holds** | direct call to the exported `findProjectRoot` | returns a string, never null or an object — external callers are unaffected |
| 13 | **round-tripping still works** | write two rounds, read them back with `loadJournal` | the journal parses and both rounds are present — the module's actual job still works |

Case 2 is the reproduction of the reported consequence. Case 3 is the one whose
failure would be worst in practice and which no well-formed fixture could ever
surface.

Cross-platform: `path.join`, `os.tmpdir()`, `fs.promises.rm` teardown, no
hardcoded separators, `os.homedir()` never written to.

## What this slice does NOT fix

- **The other two over-rooting resolvers.** `budget.js` and
  `iron-loop-enforcer.js` are slice five, together with the fence that stops a
  fourth copy appearing.
- **Journals already written to the real `~/.ctoc/loops/`.** They stay there. This
  slice does not migrate, detect or delete them — deleting anything under the
  operator's home directory is not a thing a build does without being asked. Step
  16 reports the path so the operator can decide.
- **`findProjectRoot`'s lossiness for this module's other callers.** The exported
  wrapper still collapses a fallback to a path. Only the write paths inside this
  module learn the difference.
- **Whether the refinement loop's journal format or contents are right.** Only
  where the file goes.
- **The `.claude-plugin` marker.** The private resolver accepted it; the shared one
  does not. Step 9 must determine whether any real caller depends on resolving by
  `.claude-plugin` alone — if one does, that is a finding to REPORT, not to
  silently preserve by keeping the private walk.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/refinement-loop-writes-into-the-project.test.js` in full, run ONLY that file, record the red output verbatim. Cases 1, 2, 3, 5, 10 and 11 MUST be red. Any case green before implementation must be individually shown to be already-correct behaviour rather than a vacuous assertion, and the finding written down.
- [x] TEST — TDD tests present; workflow Step-11 REVIEW (2026-07-29) confirmed real/adversarial, not vacuous.
### Step 9: PREPARE — re-read from disk: `src/lib/refinement-loop.js` in full, listing EVERY function whose default parameter is `findProjectRoot()` and classifying each as reader or writer; `src/lib/project-root.js:33-198` for the exact `describeProjectRoot` contract; `src/lib/crypto.js:13-35` to confirm the `~/.ctoc` creation the fixture models. Grep the whole repository for `require.*refinement-loop` and for `findProjectRoot` imported from it, and list every external caller — the export's contract is theirs, not this module's. Determine whether any caller depends on resolving by `.claude-plugin` alone.
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
### Step 10: IMPLEMENT — one step, files as sub-items.
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
  - `src/lib/refinement-loop.js` — Changes 1 and 2.
### Step 11: REVIEW — confirm no private walk remains in the file. Confirm every writer identified at Step 9 is guarded and every reader is not. Confirm the exported `findProjectRoot` still returns a string for every input, including a non-string and `undefined`. Confirm no path under `os.homedir()` can be produced from a project that has no `.ctoc` of its own.
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3.
### Step 12: OPTIMIZE — the shared resolver performs one two-pass walk against the private copy's one-pass. Confirm resolution is not performed more than once per `appendRound` call, since three path builders each default to it and a naive change would resolve three times.
### Step 13: SECURE — confirm the refusal reason carries no absolute path into any surface a human reads, and that a `planSlug` cannot traverse out of `loops/` via `..` — the slug reaches a path component and this slice is touching the code that builds it.
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
### Step 14: VERIFY — `node --test tests/refinement-loop-writes-into-the-project.test.js tests/refinement-loop*.test.js tests/project-root*.test.js` green, then the full gated run `npm test`. Lint the changed file. No git operations.
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
### Step 15: DOCUMENT — a JavaScript doc on `findProjectRoot` stating that it delegates and MUST NOT be re-implemented, naming the bare-marker over-rooting defect, its date, and the shared resolver's comment at `project-root.js:87-94` as the record of the fix this copy never received.
### Step 16: FINAL-REVIEW — report, verbatim, where a journal lands BEFORE and AFTER for a project beneath a stand-in home directory that carries `.ctoc`. Report the real path where stranded journals may exist on the operator's machine, without touching them. Report every decision taken under ambiguity.
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.

## Decisions Taken Under Ambiguity

1. **Delegate rather than repair the private copy in place.** A repaired private
   copy is a copy that will miss the NEXT fix, which is precisely how this one came
   to be wrong.
2. **A fallback root refuses the write instead of writing to the working
   directory.** Writing to the working directory is today's defect minus one
   symptom, and its quietness is why the current one survived.
3. **The refusal returns a result; it does not throw.** This code runs inside the
   Iron Loop, and a resolution problem must not take the loop down.
4. **An explicitly supplied `root` is honoured unconditionally.** The caller has
   asserted it. Only the default — where the guess lives — is narrowed.
5. **Path builders are not guarded; only writers are.** Computing a path is not
   claiming a project exists.
6. **`findProjectRoot` stays exported with the same name, arity and string return
   type.** It has external callers; changing its contract is a change to code
   outside this slice's declared files.
7. **Stranded journals under the real `~/.ctoc/loops/` are reported, never
   touched.** Deleting from the operator's home directory is not a build's
   decision.
8. **No test touches the real home directory.** Every home-directory case uses a
   stand-in driven through the `start` parameter.
9. **The `coverage-map.js` distinction was verified before excluding it**, on two
   independent grounds — no bare `.ctoc` marker, and a distinguishable `null`. Both
   were checked in the source rather than taken from the brief.
10. **`scripts/run-evals.js` is the fifth private copy and is also excluded**, on
    its markers (`VERSION`, `.git`) and its status as a build script. Recorded so
    the count is five copies, three defects, and nobody re-derives it.
11. **A caller depending on the `.claude-plugin` marker would be a finding to
    REPORT, not a reason to keep the private walk.** Preserving a behaviour by
    keeping the defect that provides it is how the copy justified itself for this
    long.

### Decisions taken during implementation (Step 10)

12. **`writeLetter` is guarded identically to `appendRound`.** Step 9's
    classification found TWO writers reaching `ensureDir` in this module —
    `appendRound` and `writeLetter` — and Change 2's own wording ("`appendRound`
    and any other function reaching `ensureDir` gain a guard") mandates both.
    A refused `writeLetter` returns `{ written: false, skipped: true, reason }`,
    the same shape as `appendRound`. Step 9 confirmed no depended-upon
    `.claude-plugin`-only caller: `findProjectRoot`'s only external importers are
    the two refinement-loop test files; `actions.js` consumes `shouldRunLoop`,
    not the resolver.
13. **The single write-path resolver helper (`resolveWriteRoot`) returns the root
    string or `null` + a reason** — a JSDoc boolean-discriminated union did not
    narrow under `checkJs`, so the helper returns `{ root, reason }` with
    `root === null` signalling refusal. An explicit `root` short-circuits with no
    resolution at all (Decision 4), so resolution runs at most once per call
    (Step 12 OPTIMIZE).
14. **The two pre-existing refinement-loop test suites needed their fixtures
    corrected — these files were NOT in the plan's declared `files:`.**
    `tests/refinement-loop.test.js` and `tests/refinement-loop-coverage.test.js`
    built a BARE `.ctoc` fixture (no `settings.yaml`, no `plans/` sibling) and
    relied on default-root writes. That fixture is exactly the crypto-home shape
    the fix now refuses, so all their write-path tests broke. The fix: each
    `setupTempProject` now writes `.ctoc/settings.yaml` so the fixture is a REAL
    project; and the two coverage cases that asserted the replaced contract
    (a bare `.ctoc` capturing the root; the private walk returning its `start` on
    fallback) were retargeted to assert the corrected behaviour (a bare `.ctoc`
    does NOT capture; `findProjectRoot` returns a string and does not adopt a
    marker-less start). This is test-tightening toward the real, fixed behaviour,
    not weakening. The plan's `files:` under-declared these two suites — recorded
    as a finding.
15. **Slug path-traversal (Step 13 SECURE) is a pre-existing property unchanged
    by this slice.** `loopDir` builds `path.join(root, '.ctoc', 'loops', planSlug)`
    exactly as before; this slice touches resolution and the write guard, not slug
    construction, and adds no new traversal surface. Real plan slugs are
    controlled (`00178-...`). Sanitising the slug would be new behaviour outside
    Changes 1 and 2; noted, not introduced here.
