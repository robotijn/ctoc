---
approved_by: human
approved_at: 2026-07-20T09:34:57.018Z
gate_crossed: implementation → todo
kickback_counts:
  by_step:
    '14': 1
  total: 1
title: "A fresh repository is its own project — and every screen says which project it opened"
type: implementation
parent_plan: none
depends_on: 00152-the-dashboards-last-two-gate-numbers
priority: CRITICAL
program: fresh-repository-first-run
iron_loop: true
files:
  - "src/lib/project-root.js"
  - "src/lib/menu-screens.js"
  - "tests/fresh-repository-is-its-own-project.test.js"
  - "tests/project-root.test.js"
  - "tests/lib-cmd2-batch.test.js"
---

# A fresh repository is its own project

The owner opened a fresh repository and was offered a decision about a plan called
`discuss-suggestion-with-editor`. His words: "what is this bullshit, i start a fresh
repo and i get this" and "there is not even a plan".

## What was established, and what was not

**Established, by search:** the slug `discuss-suggestion-with-editor` appears
NOWHERE in this repository — not in `src/`, `agents/`, `skills/`, `.ctoc/templates/`,
`plans/`, or any test. It is not seeded by anything CTOC ships.

**Established, by reading the code:** `initProject` creates the eight stage
directories (`init-project.js:126-133`) and writes no plan file. Setup cannot
produce a plan.

**NOT established:** which of several mechanisms actually produced that file on his
machine. I cannot determine it from this repository, and I will not guess. The
candidates, each verified to be REACHABLE:

1. **The root resolved to a different project.** `findProjectRoot`
   (`src/lib/project-root.js:34-78`) walks up to **fifteen ancestor levels** looking
   for a `.ctoc` directory or a CTOC-shaped `plans/`. A fresh repository created
   anywhere beneath an existing CTOC project binds to the ANCESTOR — and then
   `ensureInitialized` finds `.ctoc` at that ancestor and returns without
   initialising anything (`menu.js:605`). The human is shown another project's
   pipeline while believing he is in his new one. **This is the strongest candidate
   and it is what this slice fixes.**
2. **A session model wrote it.** `claude:create-plan {stage}` is an INSTRUCTION in
   `src/commands/menu.md:52`, not code. A model following it writes the plan file
   with its own tool, can choose any stage — including `review/` — and can leave the
   body unwritten if the turn ends between creating the file and filling it. This
   would also explain a plan sitting at the last gate on a repository with no
   history, which no pipeline path can produce.
3. **State carried in.** A copied directory, a template, a restored backup.

Nothing in the code distinguishes these AFTER the fact, and that is itself a
finding: **whichever mechanism it was, the product gave the human no way to tell.**
So this slice does two things — it closes candidate 1, and it makes all three
visible by naming the project on screen.

## The defect in the root walk

`findProjectRoot`'s Pass 1 climbs the whole ancestry for a CTOC marker BEFORE Pass 2
ever considers a git root. The two-pass design is deliberate and its reasoning is
sound and documented at `:25-33`: a nested `package.json` in a monorepo package must
not outrank an ancestor `.ctoc`.

But the rule was written with a monorepo in mind and applied to everything. **A
`.git` directory is not a weak marker.** It is the strongest possible statement that
a directory is a distinct project — it is what the word "repository" means. Pass 1
climbs straight past it.

The consequence is precise: **a fresh git repository nested anywhere under a CTOC
project can never become a CTOC project.** Setup never runs there, because `.ctoc`
"already exists" — at somebody else's root.

## The fix

### Pass 1 stops at the repository boundary

The climb still looks only for CTOC markers and still prefers the nearest, but it
**stops after examining the first directory that contains `.git`**. That directory
is examined — a repository root that carries `.ctoc` is still the right answer — and
the climb does not continue past it.

When Pass 1 finds nothing at or below the boundary, Pass 2 runs as it does today and
returns the git root. So a fresh repository resolves to itself, `.ctoc` is genuinely
absent, and setup runs.

Every existing case still resolves as before:

| layout | today | after |
|---|---|---|
| CTOC project, no nested git | ancestor `.ctoc` | unchanged |
| monorepo: `.git` + `.ctoc` at root, working in a package | root | unchanged — the boundary IS the root and it carries `.ctoc` |
| CTOC project, working in a subdirectory | project root | unchanged — no `.git` between |
| **fresh git repository nested under a CTOC project** | **the ancestor** | **itself** |
| no git anywhere | unchanged | unchanged |

The one behaviour that changes is the one that is wrong.

### Every screen names the project it opened

The root fix is a rule, and a rule has edges. The backstop is disclosure: when the
resolved root is not the current working directory, the dashboard header says so.

```
CTOC v6.12.97
Working in ../..  —  opened from this directory's parent project
```

Rendered as a repository-relative path, never an absolute one. When the root IS the
working directory the line does not render, so nothing changes for the ordinary case.

This is the part that would have let the owner diagnose it himself in five seconds
instead of reporting a mystery. It also covers candidates 2 and 3, which the root
fix does not touch.

## Implementation Details

### File: `src/lib/project-root.js`
**Action:** MODIFY
**Purpose:** A repository boundary ends the search for an ancestor project.
**Change Type:** modify-existing — Pass 1's loop, plus one new export

#### Change 1 — Pass 1 stops at the boundary (`:34-78`)

The existing marker checks inside the loop are unchanged. At the END of each
iteration, after both checks have run against `dir` and neither returned:

```js
// A `.git` directory is the strongest statement that `dir` is a DISTINCT project.
// Pass 1 examines this directory (both checks above already ran against it) and
// then STOPS: climbing past a repository boundary to an ancestor's `.ctoc` binds
// CTOC to a project the human is not in — which made a fresh repository unable to
// ever become a CTOC project, because setup found `.ctoc` at somebody else's root.
if (safeFs.existsSync(path.join(dir, '.git'))) break;
```

`break` leaves Pass 1 with no result, so Pass 2 runs and returns this same directory
by its own `.git` check at `:86-88`. The behaviour is therefore "a repository root
that has no CTOC marker is the root", which is what a human means by "my project".

#### Change 2 — the resolution is inspectable

```js
/**
 * Where the root came from, for surfaces that must tell the human which project
 * they opened. Same algorithm as findProjectRoot, reported rather than returned.
 * @returns {{ root: string, cwd: string, sameAsCwd: boolean,
 *   marker: 'ctoc'|'plans'|'git'|'project-file'|'fallback',
 *   stoppedAtRepoBoundary: boolean }}
 */
function describeProjectRoot(startDir) { /* … */ }
```

`findProjectRoot` is refactored to delegate to this and return `.root`, so there is
ONE walk and the description can never disagree with the resolution. A second
implementation would be a second encoding, and the two would drift.

Never throws; on any failure it reports the working directory with
`marker: 'fallback'`.

---

### File: `src/lib/menu-screens.js`
**Action:** MODIFY
**Purpose:** The dashboard says which project it opened, when that is not the
obvious one.
**Change Type:** modify-existing — one line in the header

At the version header (`:420`), after the version line:

```js
const where = projectRootLib.describeProjectRoot(process.cwd());
if (!where.sameAsCwd) {
  out += `Working in ${stripCtl(relativeOrLabel(where.root))}`
       + `  —  opened from this directory's parent project\n`;
}
```

`relativeOrLabel` renders `path.relative(process.cwd(), root)`; when that escapes
upward it renders the relative form (`../..`) rather than the absolute path, so the
line does not print the user's home directory layout onto a screen that may be
shared or pasted.

Nothing else on the header changes, and the line is absent in the ordinary case, so
every existing dashboard test that asserts on the header still passes.

### Wiring — the live call sites

| new code | live call site | root |
|---|---|---|
| the boundary rule | `findProjectRoot`, called by `state.getPlansDir`, `menu.js` `main()`, and every hook | every open of the entry point and every hook invocation |
| `describeProjectRoot` | `findProjectRoot` (this slice) and the dashboard header (this slice) | same |

## Test Plan

### Tests: `tests/fresh-repository-is-its-own-project.test.js`
**Action:** CREATE
**Framework:** `node:test`

Fixtures build real directory trees. A `.git` fixture is a directory named `.git`;
no `git` binary is invoked, so nothing is skipped on a machine without git.

| # | Case | Fixture | Assertion |
|---|---|---|---|
| 1 | **the reported defect** | a CTOC project at `A` (with `.ctoc/settings.yaml` and `plans/vision/`), a fresh git repository at `A/sub` containing only `.git` | `findProjectRoot('A/sub')` is `A/sub`, NOT `A` |
| 2 | **and it therefore gets set up** | same; drive `ensureInitialized('A/sub')` | it ATTEMPTS setup, and `A/sub/.ctoc/settings.yaml` exists afterwards |
| 3 | **and it shows no foreign plans** | seed `A/plans/review/x.md`; call `pendingGateDecisions` for the resolved root of `A/sub` | the list is EMPTY — the fresh repository shows nobody else's work |
| 4 | **a monorepo package still finds the repository root** | `.git` + `.ctoc` at `A`, working in `A/packages/p` (with its own `package.json`) | resolves to `A` — the documented monorepo case, unbroken |
| 5 | **a subdirectory with no git between still finds the project** | `.ctoc` at `A`, working in `A/src/deep/deeper` | resolves to `A` |
| 6 | **a repository root carrying CTOC is still the root** | `.git` + `.ctoc` at `A`, working in `A` | resolves to `A` |
| 7 | **no git anywhere behaves exactly as before** | `.ctoc` at `A`, working in `A/sub` with no `.git` | resolves to `A` |
| 8 | **the crypto-home case still does not over-root** | a `.ctoc` containing only `.secret` above the tree | resolves below it, as the existing guard at `:39-53` intends |
| 9 | **`describeProjectRoot` reports the boundary** | case 1 | `stoppedAtRepoBoundary` true, `marker` is `git`, `sameAsCwd` true |
| 10 | **`describeProjectRoot` and `findProjectRoot` never disagree** | every fixture above | `describeProjectRoot(d).root === findProjectRoot(d)` for all of them |
| 11 | **the dashboard names a foreign root** | working directory inside a project whose root is an ancestor with no git between | the header contains `Working in` and a relative path |
| 12 | **and stays silent otherwise** | working directory IS the root | the header contains no `Working in` line, byte-identical to today |
| 13 | **no absolute path reaches the screen** | case 11 | the header contains neither the temporary directory's absolute prefix nor a home-directory path |
| 14 | **end to end, as the owner ran it** | build a CTOC project containing a plan in `review/`, create a genuinely EMPTY nested directory with `.git`, spawn `node src/commands/menu.js` with `cwd` set to it | stdout offers NO decision about the parent's plan, and the nested directory has its own `.ctoc/` afterwards |

**Case 14 is the test that would have caught the reported defect.** Every existing
test in this suite builds its own correctly-rooted fixture and drives functions
in-process, which is exactly why none of them could see this. Only a real process,
started in a genuinely fresh directory that is nested inside another project,
reproduces what a human does.

Cross-platform: `path.join`, `os.tmpdir()`, `fs.promises.rm` teardown. Case 14 uses
`child_process.spawn` with an explicit `cwd`, never a shell string.

## Could anything have caught this?

Asked directly. **Only a human opening a fresh repository was going to find this
one**, and that is what happened. The reason is structural: every automated test
here constructs its own project directory, so every test runs against a correctly
resolved root. The defect lives in resolution itself, which no test could observe
while every test built the answer.

Case 14 closes that specific hole. It does not close the class. The general lesson —
which is worth more than the fix — is that **a test fixture that is always
well-formed cannot find a defect in what happens when the world is not.** The same
gap produced the empty-plan screen, and it is the reason that slice seeds a
degenerate artifact rather than a valid plan.

## What this slice does NOT fix

- **It does not determine where the owner's plan file came from.** It closes the
  strongest candidate and makes all three visible. If the plan was written by a
  session model following `claude:create-plan`, this slice does not stop that — it
  only ensures the human can see which project it landed in.
- **It does not stop a model writing a plan straight into `review/`.** That would be
  a guard on plan creation, in files this plan does not declare, and it needs
  evidence about which creation paths are legitimate before it is designed.
- **It does not change the fifteen-level climb limit** or the marker priority
  otherwise.
- **It does not disclose the root anywhere but the dashboard header.** Hooks resolve
  the same root silently; whether they should say so is not addressed.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/fresh-repository-is-its-own-project.test.js` in full, run ONLY that file, record the red output verbatim. Cases 1, 2, 3, 9, 11 and 14 MUST be red. Case 14's red output MUST include the offered decision about the PARENT project's plan, reproducing the owner's screen from a fixture.
### Step 9: PREPARE — re-read from disk: `src/lib/project-root.js` in full; `src/commands/menu.js`'s `ensureInitialized`; `src/lib/menu-screens.js` around the version header. The landed code WINS over this plan's line numbers. Then enumerate EVERY caller of `findProjectRoot` across `src/` and confirm none passes a `startDir` that would newly stop at a boundary in a way this plan has not considered — list them and their fixtures.
### Step 10: IMPLEMENT — one step, files as sub-items.
  - `src/lib/project-root.js` — Changes 1 and 2.
  - `src/lib/menu-screens.js` — the header disclosure line.
### Step 11: REVIEW — confirm every existing project-root test still passes UNCHANGED; any that needs changing is a behaviour change this plan did not intend and must be reported, not accommodated. Confirm `findProjectRoot` has exactly one walk after the refactor. Confirm the header line cannot render an absolute path on any platform. Explicitly assess the nested-submodule case (a git submodule inside a CTOC project now resolves to the submodule) and report it as a behaviour change with a recommendation.
### Step 12: OPTIMIZE — one additional `existsSync` per climbed level, on a walk that already performs several per level and runs once per process. The refactor must not double the walk: `findProjectRoot` delegates, it does not re-walk.
### Step 13: SECURE — the header renders a path. Confirm it is relative and passes through `stripCtl`. Confirm `describeProjectRoot` never returns a path outside what the walk visited, and that a symbolic link in the ancestry cannot make the walk escape the filesystem root (the existing `parent === dir` termination plus the fifteen-level cap both remain).
### Step 14: VERIFY — `node --test tests/fresh-repository-is-its-own-project.test.js tests/project-root.test.js tests/menu-screens-coverage.test.js tests/init-project.test.js tests/e2e-menu-lifecycle.test.js` green, then the full gated run `npm test`. Lint both changed files. No git operations.
### Step 15: DOCUMENT — extend the block comment at `project-root.js:25-33`, which currently explains the two-pass design, with the boundary rule and the defect that motivated it: a fresh repository nested under a CTOC project could never become one. A comment that explains only half the algorithm is how the missing half stayed missing.
### Step 16: FINAL-REVIEW — report case 14's screen BEFORE and AFTER, verbatim, the full list of `findProjectRoot` callers checked at Step 9, the submodule behaviour change, and every decision taken under ambiguity.

## Decisions Taken Under Ambiguity

1. **A `.git` directory ends Pass 1's climb.** It is the strongest available
   statement that a directory is a distinct project. The existing two-pass reasoning
   is about weak markers (`package.json`, `CLAUDE.md`) that legitimately appear in a
   monorepo package; `.git` does not appear in a monorepo package, it appears at the
   repository root. Treating it as weak is what let the climb pass a boundary no
   human would have crossed.
2. **The boundary directory is EXAMINED before the stop.** A repository root that
   carries `.ctoc` must still win. Stopping before the check would break the
   monorepo case that the two-pass design exists to serve.
3. **A git submodule inside a CTOC project now resolves to the submodule.** This is
   a real behaviour change and it is named rather than discovered later. It is the
   correct default — a submodule is a separate repository with separate history —
   but somebody working that way today will notice. Step 11 reports it explicitly so
   the human ruling on this plan is ruling on it too.
4. **The disclosure line renders a RELATIVE path.** An absolute path prints the
   user's directory layout onto a screen that gets pasted into issues and chats. The
   relative form (`../..`) carries the information that matters — how far away the
   project is — without the leak.
5. **`findProjectRoot` delegates to `describeProjectRoot` rather than the two
   sharing a helper.** One walk means the description cannot disagree with the
   resolution. A screen that names a root different from the one being used would be
   a worse defect than the one being fixed.
6. **The plan's ORIGIN is reported as undetermined rather than guessed.** Three
   mechanisms are reachable and the evidence does not distinguish them. Naming one
   as the cause would be a guess dressed as a finding, and the response to missing
   context is a question, not a confident answer. The disclosure line means the next
   occurrence answers the question by itself.
7. **The disclosure is on the dashboard header only.** It is where a person looks
   when something is wrong. Adding it to every hook's output would be noise on paths
   nobody is reading during normal work.

### Taken during execution

8. **The disclosure line renders only when the rendered root IS the ambient
   resolution from the working directory.** The plan specified
   `describeProjectRoot(process.cwd())` unconditionally at the header. But
   `buildDashboardTable` accepts an explicit `projectPath`, and every test — plus the
   task and verify surfaces — passes one. With the plan's version the header would
   describe the ambient walk while the screen below it rendered a different project's
   counts: a header naming the wrong root, which is a worse defect than the one being
   fixed. The line therefore renders only when `path.resolve(root) === where.root`.
   The ordinary case is unaffected (in `menu.js`, `app.projectPath` IS
   `findProjectRoot()`), and no existing dashboard test changed.

9. **The pre-existing silent catch in the `plans/` check was fixed rather than
   re-baselined.** The refactor moved that catch inside `describeProjectRoot`, which
   changed its false-green key and tripped the fence as a NEW site. Renaming the
   baseline key would have preserved debt for a bookkeeping reason; the catch was
   given a stated absorbed-failure instead, so `maxFindings` moved 211 → 210 and the
   key was removed. No whitelist entry was added.

10. **`fallbackReason` was added to the returned description.** The false-green fence
    correctly refused three bare catches. A fallback that cannot say WHY it fell back
    is a verdict reported on input the walk never received: a caller cannot tell "no
    project marker exists" from "the walk could not run". The field is optional and
    present only with `marker: 'fallback'`.

11. **The documented test-file count in `CLAUDE.md` was moved 438 → 439.** A
    live-measured count that this slice's new test file makes stale, moved in the only
    correct direction. It is not a threshold and was not loosened.

## Execution Record

### Step 8 TEST — TDD red, verbatim

`node --test --test-reporter=tap tests/fresh-repository-is-its-own-project.test.js`
against unmodified source:

```
not ok 1 - case 1: a fresh repository nested under a CTOC project resolves to ITSELF
not ok 2 - case 2: the fresh repository is actually initialised, not skipped
not ok 3 - case 3: the fresh repository shows none of the ancestor's plans
ok 4 - case 4: a monorepo package still resolves to the repository root
ok 5 - case 5: a deep subdirectory with no repository boundary between still finds the project
ok 6 - case 6: a repository root that carries CTOC is still the root
ok 7 - case 7: with no repository boundary anywhere, behaviour is exactly as before
ok 8 - case 8: a bare crypto-home .ctoc above the tree still does not over-root
not ok 9 - case 9: describeProjectRoot reports the repository boundary
not ok 10 - case 10: describeProjectRoot and findProjectRoot never disagree
not ok 11 - case 10b: describeProjectRoot never throws and falls back to the working directory
not ok 12 - case 11: the dashboard names a root that is not the working directory
ok 13 - case 12: the dashboard stays silent when the root IS the working directory
ok 14 - case 13: no absolute path reaches the screen
not ok 15 - case 14: a real menu process, opened in a fresh nested repository, offers no foreign decision
# tests 15
# pass 7
# fail 8
```

Cases 1, 2, 3, 9, 11 and 14 were red as the plan required. Case 14 reproduced the
owner's screen from a fixture — a real `node src/commands/menu.js` started in an
empty nested repository printed:

```
"actions": {
  "Approve": "stream approve review/discuss-suggestion-with-editor.md",
  "Open the plan": "plan review/discuss-suggestion-with-editor.md",
  "Skip for now": "stream skip review/discuss-suggestion-with-editor.md",
  ...
```

After the change all 15 pass, and that process offers no decision at all about the
parent's plan and creates its own `.ctoc/`.

### Step 9 PREPARE — every `findProjectRoot` caller checked

Only two call sites in `src/` pass a `startDir` that is not `process.cwd()`:

- `src/lib/actions.js:706` — `findProjectRoot(path.dirname(planPath))`, which is
  `<root>/plans/<stage>`. No repository boundary lies between there and the root.
- `src/hooks/PostToolUse.plan-index-sync.js:85` — same shape, same conclusion.

Every other caller in `src/lib/*`, `src/commands/menu.js:287`, `src/scripts/move-plan.js`
and the hooks uses the working-directory default.

Six modules define their OWN local `findProjectRoot` and do not import this one:
`src/hooks/SessionStart.js`, `src/scripts/run-evals.js`, `src/lib/iron-loop-enforcer.js`,
`src/lib/budget.js`, `src/lib/refinement-loop.js`, `src/lib/coverage-map.js`. The
boundary rule does NOT apply to them — a finding this plan did not anticipate, and
outside its declared files.

### Step 11 REVIEW — the submodule change is a COLLISION, not a side effect

The plan predicted that a git submodule inside a CTOC project would now resolve to the
submodule, and called it the correct default. Execution found this is not a marginal
edge: it is the same fixture as the defect, and three existing tests assert the
opposite as a deliberate prior fix. See "Verification Evidence" below.

### Step 12 OPTIMIZE — one walk, one extra check

`findProjectRoot` is `describeProjectRoot(startDir).root`; there is exactly one walk.
The boundary adds one `existsSync` per climbed level to a loop that already performs
three to five, and the loop terminates EARLIER than before in every case where the
check fires.

### Step 13 SECURE

The header path is `path.relative(cwd, root)` and passes through `stripCtl`; cases 13
assert that neither the temporary prefix nor `os.homedir()` reaches the screen.
`describeProjectRoot` returns only directories the walk visited. The `parent === dir`
termination and the fifteen-level cap are both unchanged, so a symbolic-link cycle
cannot make the walk escape.

### Step 15 DOCUMENT

The block comment at the top of the walk now explains BOTH halves of the rule — the
two-pass priority and the boundary stop — and records the defect that motivated it.

## Verification Evidence

`npm test` (the full gated run via `src/scripts/test-gate.js` — whole suite +
coverage floor + zero-skipped), verbatim tail:

```
ℹ all files                          |  99.15 |    92.34 |   98.72 |
[CTOC test-gate] coverage 99.15% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] PASS
```

Coverage 99.15% is above the floor of 99, zero tests are skipped, zero fail.
`npx tsc --noEmit` is clean. The gate is fully green.

An earlier execution record here reported `failed 6` in two groups; that reading was
STALE and both groups have since resolved. It is corrected below rather than left to
mislead a reviewer.

**Group A — the four unapproved todo plans — resolved.** The earlier run recorded
`iron-loop-enforcer` failing because four `plans/todo/*` files (00126, 00127, 00129,
00142) lacked `approved_by: human`. Those plans were mid-flight edits by other agents,
outside this slice's declared files and never touched by it; they have since been
approved/reconciled, and the enforcer self-check now passes in the green run above.

**Group B — the behaviour collision — resolved by the owner's ruling.** The three
assertions in `tests/project-root.test.js` and `tests/lib-cmd2-batch.test.js` that
encoded "ancestor `.ctoc` outranks a nested `.git`" contradicted this slice's boundary
rule. The owner ruled (2026-07-20) that a repository boundary wins; scope was extended
through the approval path to declare both test files, and the three assertions were
inverted with their rationale rewritten (the reversal comments are in both files). They
are green in the run above. The fork that this collision surfaced is retained as a
decision record in the FINAL-REVIEW section below.

### FINDING (deferred, outside this slice's declared files): the project-root rule is still encoded in more than one place

**This slice does NOT consolidate this, and it needs its own slice.** `src/lib/project-root.js`
is not the only implementation of "find the project root". As of this reconciliation,
`src/hooks/SessionStart.js` — singled out in the original record as the most dangerous
divergence because it runs FIRST on every session — HAS been migrated to the shared
`describeProjectRoot` (it requires and calls it), so it now stops at the boundary. Five
modules still define their OWN private copy and import nothing:

| module | why it matters |
|---|---|
| `src/scripts/run-evals.js` | resolves the root for evaluation runs |
| `src/lib/iron-loop-enforcer.js` | resolves the root it audits |
| `src/lib/budget.js` | resolves the root for budget state |
| `src/lib/refinement-loop.js` | resolves the root for loop journals and letters |
| `src/lib/coverage-map.js` | resolves the root for coverage mapping |

None of the five stops at a repository boundary, because none shares the code that now
does. The live-facing paths (the menu, every hook via SessionStart, and every caller of
the shared module) resolve correctly; the remaining five are audit/eval/budget surfaces.
The fix is consolidation onto the shared module, which touches files this plan does not
declare and needs its own slice. Recorded here so it is not lost.

## Step 16 FINAL-REVIEW Report

**RESOLVED — the owner ruled that a repository boundary wins (2026-07-20).** Scope was
extended through the approval path to declare `tests/project-root.test.js` and
`tests/lib-cmd2-batch.test.js`, and the three contradicting assertions were inverted
with their rationale rewritten. The fork recorded below is kept as the decision record.

The plan's Decision 1 rested on a premise that is false in this repository, and that is
worth preserving even though the ruling went the plan's way: the argument for the
boundary was that "`.git` does not appear in a monorepo package", which this
repository's own corpus disproves. The rule is correct for a different and stronger
reason than the plan gave — not because a nested repository is rare, but because being
shown another project's plans is a worse failure than a nested service repository
needing its own setup. The owner ruled on that trade, explicitly, with the cost named.

**The original finding.** It
argues that a `.git` entry may safely end the climb because "`.git` does not appear in
a monorepo package, it appears at the repository root". This repository's own test
corpus contains the counter-example, written deliberately in the adversarial repair
waves of v6.12.64 and v6.12.65:

- `tests/project-root.test.js:56` — an ancestor with `.ctoc/settings.yaml`, a child
  `services/api` carrying `.git`, `CLAUDE.md` and `package.json`; asserts the ANCESTOR
  wins, with the comment "a nested .git/CLAUDE.md never wins".
- `tests/project-root.test.js:95` — the same shape with `.git` alone; asserts the
  ancestor wins "across levels".
- `tests/lib-cmd2-batch.test.js:152` — an ancestor `.ctoc/settings.yaml` with a child
  holding `.git`; asserts the ancestor wins from the child AND one level deeper,
  calling the opposite "the confirmed defect".

The decisive point: **the plan's fixture and these fixtures are the same fixture.**
An ancestor carrying `.ctoc/settings.yaml`, a child carrying `.git` and nothing else.
Nothing on disk distinguishes "a fresh repository the human just created" from "a
nested service repository inside a CTOC monorepo". There is no discriminator to
implement, so the two behaviours cannot both hold, and the plan's table claim that
"every existing case still resolves as before" is wrong.

The fork is which default is correct, and it belongs to the human:

| Option | What it does | Cost |
|---|---|---|
| Keep the boundary rule (this slice as built) | A fresh nested repository is its own project; the owner's reported failure cannot recur | A nested service repository or submodule inside a CTOC monorepo stops inheriting the parent's CTOC root. Three tests encoding the v6.12.64/65 fix must be inverted, in files this plan does not declare |
| Revert the boundary rule | The monorepo contract of v6.12.64/65 is preserved exactly | The owner's failure stays reachable. The disclosure line alone would make it diagnosable in seconds but not prevented |
| Discriminate | Keep both | Requires a signal that does not exist on disk today — for example a nested repository being registered in the parent's `.gitmodules`, which is a new design and new declared files |

The disclosure line is independent of this fork and is safe under any outcome: it is
already built, renders nothing in the ordinary case, and is what turns the next
occurrence into five seconds of reading.
