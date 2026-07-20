---
approved_by: human
approved_at: 2026-07-20T11:56:02.738Z
gate_crossed: implementation → todo
---

---
title: "A session that cannot identify a project invents one, and its guess becomes tomorrow's fact"
type: implementation
parent_plan: none
depends_on: none
priority: CRITICAL
program: resolution-and-setup-tell-the-truth
iron_loop: true
files:
  - "src/hooks/SessionStart.js"
  - "tests/session-start-does-not-fabricate-a-project.test.js"
---

# A session that cannot identify a project invents one

This is the ANCHOR slice of five. It states the pattern the other four share, and
it goes first because it runs first: the session hook is the earliest CTOC code to
execute in any project, so every later correction is downstream of what it does.

## The pattern, stated once for all five slices

**Resolution and initialisation both PRODUCE a truth value about how well-formed
the world is** — a `marker`, a `fallbackReason`, an `attempted` flag, a `missing`
list. Every defect in this program is the same shape: **a caller discarding that
value and proceeding as if the answer were certain.**

`describeProjectRoot` exists specifically to expose that value
(`src/lib/project-root.js:24-31`). `findProjectRoot` is the lossy wrapper that
throws it away (`:197-199`). Both are correct; the defect is choosing the lossy one
where the value is load-bearing.

**Why 10,288 passing tests never saw any of it:** a fixture that is always
well-formed never exercises the discard, because in a correct world the discarded
value is always the same one. A test that builds a valid project and asserts a
valid root cannot distinguish "found the marker" from "guessed and got lucky" —
the two produce identical output. **Every fixture in these five slices therefore
includes a broken world**: an empty directory, a bare `.ctoc` holding nothing, a
nested repository, and a home directory that carries `~/.ctoc`.

## The mechanism, verified in code

`src/hooks/SessionStart.js:30`:

```js
const projectPath = findProjectRoot(process.cwd());
```

`marker` and `fallbackReason` are discarded at the call site. Then `:93-98`,
unconditionally:

```js
for (const subdir of directories) {
  const dir = path.join(projectPath, subdir);
  if (!safeFs.existsSync(dir)) {
    safeFs.mkdirSync(dir, { recursive: true });
  }
}
```

Eleven directories, including the whole plan tree (`:77-91`).

**The self-ratifying loop, traced end to end in a fresh empty directory:**

| when | what happens |
|---|---|
| session 1 | `describeProjectRoot` finds no marker and returns `marker: 'fallback'`, `fallbackReason: 'no project marker found in the examined ancestry'` (`project-root.js:181-186`) — an explicit admission of ignorance |
| session 1 | the hook discards that, and creates `plans/vision`, `plans/canvas`, … |
| session 2 | `project-root.js:103-111` finds a `plans/` directory whose subdirectories match `['vision','functional','implementation','todo','done','in-progress','review']` and returns `describe(dir, 'plans')` — a CONFIDENT identification |

The root is now identified by a marker CTOC fabricated from its own admission that
it could not identify a root. **The guess has become indistinguishable from a
fact, and it ratifies itself.** No later code can tell the difference, because by
construction there is no longer a difference to see.

### The banner names a different directory than the one in use

`src/hooks/SessionStart.js:365`:

```js
Project: ${path.basename(process.cwd())}
```

Every other line in `generateContext` renders from the resolved root; this one
renders from the working directory. Open a session in `repo/src/lib/` and the
banner says `lib` while CTOC operates on `repo`. In a nested repository the
mismatch is worse: the banner names the inner directory while resolution has
stopped at a repository boundary and bound CTOC to a different project entirely.

**This one-line defect is merged into this slice rather than given its own**, for
two reasons. It is the same file and the same function region, so a separate slice
would put two units of work on one file — forbidden. And it is the same discard:
a resolved root was available and the working directory was used instead.

## The decision this slice settles

**What should a session do when resolution admits it could not identify a
project?**

The brief is right that "create nothing" is the obvious answer and may be wrong —
the plan tree has to exist sometime. Working it out:

| option | what it costs |
|---|---|
| scaffold always (today) | the self-ratifying loop above; a guess becomes permanent |
| scaffold never | a REAL project (a git repository with no plan tree) loses its scaffolding on session start, which is a regression in every ordinary case |
| **scaffold only on an evidenced identification** | the fabrication route closes; every evidenced case behaves exactly as today |

**Chosen: scaffold when `marker !== 'fallback'`; scaffold nothing when
`marker === 'fallback'`.**

This is a precise cut, not a compromise. A `marker` of `ctoc`, `plans`, `git`, or
`project-file` means a real artifact was found on disk and the root is evidenced —
those cases keep today's behaviour byte for byte. Only the case where resolution
itself said "I could not identify a project" stops writing, and that is exactly
the case where writing manufactured the evidence.

**Ownership of the plan tree moves to the menu.** That is not a deferral — it is
where the tree already gets created, by `initProject`, and `menu.js:699-700`
already states the rule: *"Opening the menu is the signal that the user wants CTOC
in this project."* Opening a terminal in a directory is not that signal. The
session hook stops guessing at intent it was never given.

### What the session says meanwhile

Silence would repeat the dead-end mistake this program exists to fix. The injected
context gains one line naming the state and the action:

```
CTOC: no project identified here (no project marker found in the examined
ancestry). Nothing has been created. Run /ctoc:menu to set this directory up
as a CTOC project.
```

The `fallbackReason` is rendered verbatim — it is the resolver's own words about
why, and paraphrasing a diagnostic is how diagnostics stop being useful.

## Implementation Details

### File: `src/hooks/SessionStart.js`
**Action:** MODIFY
**Purpose:** The session acts on what resolution actually reported, and never
creates the evidence it will later read as proof.
**Change Type:** modify-existing — one call site, one guard, one banner line

#### Change 1 — keep the verdict (`:22-24`, `:30`)

The private `findProjectRoot` wrapper at `:22-24` delegates correctly and is
NOT a private root copy (verified; see slices four and five, which fix the three
that are). It is re-pointed at `describeProjectRoot` and the whole description is
kept:

```js
const rootInfo = describeProjectRoot(process.cwd());
const projectPath = rootInfo.root;
```

`rootInfo` carries `marker`, `fallbackReason`, `cwd`, `sameAsCwd`. Nothing else in
the function changes shape — `projectPath` is the same string it is today.

#### Change 2 — the scaffolding guard (`:76-98`)

The directory loop is wrapped:

```js
const identified = rootInfo.marker !== 'fallback';
if (identified) {
  for (const subdir of directories) { /* unchanged */ }
}
```

State creation at `:60-74` is examined in Step 9 and given the same guard if it
writes to disk under a fallback root — `saveState` writes `.ctoc/state/`, which
would manufacture a `.ctoc` directory and feed slice three's defect directly. The
plan's expectation is that it must be guarded; the landed code decides.

#### Change 3 — the banner names the resolved root (`:347`, `:365`)

`generateContext` takes the resolved root and renders `path.basename(root)`. When
`rootInfo.sameAsCwd` is false, a second clause names both, because a human who
opened a terminal in one place and got CTOC operating in another needs to be told:

```
Project: ctoc  (working directory: lib)
```

#### Change 4 — the unidentified-project line

When `marker === 'fallback'`, the context gains the sentence above, rendered from
`fallbackReason`. Fail-open is preserved throughout: an unidentified project still
gets a session, still gets its banner, and is simply not written to.

### Wiring — the live call sites

| new code | live call site | root |
|---|---|---|
| `rootInfo` (the kept verdict) | `SessionStart.js` `main()` — the same call site it has today | the registered `SessionStart` hook, every session |
| the scaffolding guard | `main()`, this slice | same |
| the banner + fallback line | `generateContext`, called by `main()` | same |

No new module and no new export. The hook that already runs on every session start
now acts on the value it was already being handed.

## Test Plan

### Tests: `tests/session-start-does-not-fabricate-a-project.test.js`
**Action:** CREATE
**Framework:** `node:test`

Every case builds a real directory on disk and drives the real hook. No case
builds a well-formed world only — that is the fixture shape that let this ship.

| # | Case | Fixture | Assertion |
|---|---|---|---|
| 1 | **an empty directory is not scaffolded** | empty temp directory | after the hook runs, `plans/` does NOT exist, and neither does `.ctoc/` |
| 2 | **the loop cannot close** | case 1's directory, hook run TWICE | the second run still reports `marker: 'fallback'` — today the second run reports `plans`, which is the whole defect |
| 3 | **the session says why, and what to do** | case 1 | the context contains the verbatim `fallbackReason` and the string `/ctoc:menu` |
| 4 | **a git repository IS scaffolded** | temp directory containing `.git/` | `plans/vision` … `plans/done` all exist — today's behaviour, unchanged, for every evidenced marker |
| 5 | **a project-file root IS scaffolded** | temp directory containing `package.json` | same as case 4 |
| 6 | **a real CTOC project IS scaffolded** | temp directory with `.ctoc/settings.yaml` | same as case 4 |
| 7 | **a bare `.ctoc` holding nothing is not a project** | temp directory containing only an empty `.ctoc/` | resolution does not return `marker: 'ctoc'` (`project-root.js:95-99` requires settings or a `plans/` sibling), and nothing is scaffolded |
| 8 | **a nested repository is not scaffolded from the outer one** | outer directory with `.ctoc/settings.yaml` + `plans/`, inner directory with `.git/`, hook started in the inner one | the resolved root is the INNER repository (the boundary rule, `project-root.js:128-131`), and the outer project's `plans/` gains nothing |
| 9 | **the banner names the resolved root, not the working directory** | case 8's fixture, started in a sub-directory of the inner repository | the banner contains the repository's name and NOT the sub-directory's name |
| 10 | **the banner discloses a mismatch** | same | the context names both the root and the working directory |
| 11 | **a home directory carrying `~/.ctoc` does not capture a project** | a temp tree standing in for a home directory, holding `.ctoc/.secret` only (what `crypto.js:13,22` creates), with a project directory beneath it | the resolved root is not the stand-in home directory |
| 12 | **the hook fails open on an unreadable root** | a root path that is a file, not a directory | the hook exits 0, emits a context, and does not throw |
| 13 | **end to end, as a session runs it** | spawn the hook as a real process with `cwd` set to a real empty directory, then read the directory | stdout and the filesystem AGREE: nothing claimed, nothing created |

Case 13 is the one that matters, and case 2 is the one that would have caught the
reported defect. Cases 4, 5 and 6 are the regression fence — they exist to prove
this slice narrows behaviour in exactly one case and nowhere else.

Cross-platform: `path.join`, `os.tmpdir()`, `fs.promises.rm` teardown. Case 11
uses a temp directory standing in for the home directory rather than touching the
real one — the home directory is the operator's, and a test that writes to it is a
defect regardless of what it proves. Case 12 uses a file-as-directory rather than a
permission fixture, because a permission fixture would have to be skipped on some
platform and a skip is a gate failure.

## What this slice does NOT fix

- **The menu's initialisation trigger and its dead-end message.** Slice two.
- **The two hooks that manufacture `.ctoc/` as a side effect.** Slice three. Until
  that lands, a Write in an un-identified directory still creates `.ctoc/logs/`,
  and this slice does not stop it.
- **The three private root resolvers that over-root to the home directory.**
  Slices four and five.
- **`findProjectRoot`'s lossiness.** The lossy wrapper stays and stays exported —
  it is correct for the many callers that genuinely only need a path. This slice
  changes one caller, not the shared resolver.
- **Whether the plan tree ought to exist at all in a directory the human never
  set up.** This slice answers only who creates it, not what it is for.
- **Any pre-existing fabricated root.** A directory that ALREADY holds a
  CTOC-created `plans/` tree from a previous session still resolves by the `plans`
  marker. This slice stops new fabrications; it does not detect old ones, and
  cannot — by construction, the evidence is gone.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/session-start-does-not-fabricate-a-project.test.js` in full, run ONLY that file, record the red output verbatim. Cases 1, 2, 3, 9, 10 and 13 MUST be red. Cases 4, 5, 6, 7, 8, 11 and 12 are expected GREEN before implementation — they are the regression fence, and each one must be examined individually against the rule that a case green before the code exists is either already-correct behaviour or a vacuous assertion. Record which of the two each one is, in writing. That examination is not optional: the sibling slice for the menu found a vacuous read-back exactly this way.
### Step 9: PREPARE — re-read from disk: `src/hooks/SessionStart.js` `main()` and `generateContext` in full; `src/lib/project-root.js:33-198` for the exact `describeProjectRoot` return shape and every `marker` value; `src/lib/state-manager.js` `saveState`/`createState` to determine whether state creation writes to disk under a fallback root and therefore needs Change 2's guard. The landed code WINS over this plan's line numbers.
### Step 10: IMPLEMENT — one step, files as sub-items.
  - `src/hooks/SessionStart.js` — Changes 1, 2, 3 and 4.
### Step 11: REVIEW — confirm NO write to disk occurs on any path where `marker === 'fallback'`, by tracing every `mkdirSync`, `writeFileSync` and `appendFileSync` reachable from `main()`, including inside `saveState`, `maybeInjectLessons` and the plan-index backfill kick. Each one is either guarded or listed with a justification for why it is safe. Confirm every evidenced marker value still scaffolds.
### Step 12: OPTIMIZE — `describeProjectRoot` performs the same single walk `findProjectRoot` already performed; this slice reads its result instead of discarding it, so the added cost is zero walks and one object. Confirm no second resolution call was introduced anywhere in the hook.
### Step 13: SECURE — the fallback message renders `fallbackReason`, which can carry a filesystem error message. Confirm no absolute path and no stack frame reaches the injected context; the reason is truncated to a bounded length so a pathological error cannot flood the session context.
### Step 14: VERIFY — `node --test tests/session-start-does-not-fabricate-a-project.test.js tests/session-start*.test.js tests/project-root*.test.js tests/fresh-repository-is-its-own-project.test.js` green, then the full gated run `npm test`. Lint the changed file. No git operations.
### Step 15: DOCUMENT — a JavaScript doc on `main()` stating the rule: a session never creates the evidence it will later read as proof of a project, and scaffolding requires an evidenced marker. Name the self-ratifying loop and its date so the reason survives the code.
### Step 16: FINAL-REVIEW — report, verbatim, what a session prints and what the directory contains, BEFORE and AFTER, on a genuinely empty directory run twice. Report every decision taken under ambiguity.

## Decisions Taken Under Ambiguity

1. **Scaffolding requires an evidenced marker; `fallback` scaffolds nothing.** The
   alternatives were "always" (today's fabrication) and "never" (a regression for
   every real project with no plan tree). The cut at `marker !== 'fallback'` is the
   only one that closes the loop without changing any evidenced case.
2. **The plan tree becomes the menu's to create, and this is not a deferral.**
   `initProject` already creates it and `menu.js` already documents opening the
   menu as the signal of intent. This slice removes a second, un-asked-for creator;
   it does not postpone anything to a future slice.
3. **The unidentified session speaks rather than falls silent.** A silent
   non-scaffold would be an honest state with no way out — the exact dead end the
   sibling slice exists to repair. The line names the state, the reason, and the
   one command that resolves it.
4. **`fallbackReason` is rendered verbatim, not paraphrased.** It distinguishes "no
   marker found" from "the walk could not run" — two states a paraphrase would
   merge, and the merge would cost a future reader the diagnosis.
5. **The banner's mismatch clause is added rather than the mismatch being
   silenced.** Naming the resolved root alone would be correct and still leave a
   human in a sub-directory unable to tell why CTOC is acting elsewhere.
6. **The one-line banner defect is merged into this slice.** A separate slice would
   put a second unit of work on the same file, and it is the same discard.
7. **Cases 4 through 12 are deliberately expected green at Step 8.** They fence a
   narrowing change. Their greenness is only acceptable after each has been
   individually shown to be already-correct behaviour rather than a vacuous
   assertion, and Step 8 requires that examination in writing.
8. **The home-directory fixture uses a stand-in, never the real one.** A test that
   writes to the operator's home directory is a defect whatever it proves.
