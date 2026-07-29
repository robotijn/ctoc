---
approved_by: human
approved_at: 2026-07-22T12:10:26.367Z
gate_crossed: implementation → todo
---

---
title: "A contract test stops scaffolding the real repository root — the full suite leaks an unrendered IRON_LOOP.md into the working tree"
type: implementation
parent_plan: none
depends_on: none
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "tests/ctoc-start-command.test.js"
---

# A contract test stops scaffolding the real repository root

A full `npm test` run leaves an untracked `IRON_LOOP.md` in the repository root
whose first line is `# {{PROJECT_NAME}} — Iron Loop` — an UNRENDERED template. Git
was clean at session start; the file appears only after the suite runs. A test must
never write into the working tree, and this one does.

## The mechanism, verified on disk (every claim read, not recalled)

**The only writer of a root `IRON_LOOP.md` is `initProject`, and it writes the RAW
template.** `src/lib/init-project.js:795-804`:

```js
const ironLoopPath = path.join(projectDir, 'IRON_LOOP.md');
if (!safeFs.existsSync(ironLoopPath) || force) {
  if (safeFs.existsSync(ironLoopTemplatePath)) {
    const content = safeFs.readFileSync(ironLoopTemplatePath, 'utf8');  // raw, NOT rendered
    record(state, 'IRON_LOOP.md', () => safeFs.writeFileSync(ironLoopPath, content, 'utf8'));
  }
}
```

Unlike `CLAUDE.md` (rendered via `renderTemplate`, `:714`), `IRON_LOOP.md` is copied
verbatim, so the leaked file carries the literal `{{PROJECT_NAME}}` placeholder from
`.ctoc/templates/IRON_LOOP.md.template:1`. That template's first line is exactly
`# {{PROJECT_NAME}} — Iron Loop`, matching the leaked artifact. A grep of `src/`
confirms `init-project.js` is the ONLY writer of a root `IRON_LOOP.md`.

**The culprit test drives that writer against the REAL repository root.**
`tests/ctoc-start-command.test.js:107-125`, test 4 ("the renamed script still
WORKS"):

```js
const res = spawnSync(process.execPath, [script, 'dashboard'], {
  cwd: REPO,                       // REPO = path.join(__dirname, '..') — the repo root
  encoding: 'utf8',
  timeout: 90000,
});
```

`start.js` `main()` calls `ensureInitialized(app.projectPath)` on EVERY invocation,
before routing the `dashboard` argument (`src/commands/start.js:917`). With
`cwd: REPO`, `app.projectPath` resolves to the repository root, so this spawn runs
`ensureInitialized(REPO)`.

**Why it writes `IRON_LOOP.md` specifically, and why only `IRON_LOOP.md` shows up in
a "clean" tree.** Since plan 00176, `ensureInitialized` REPAIRS whenever
`verifySetup` reports any required artifact missing (`start.js:750-788`). The
required set includes `.ctoc/state/iron-loop.yaml` (`REQUIRED_STATE`, `:613`). That
path is **gitignored** — `.gitignore:6` lists `.ctoc/state/`. So on any tree where
`.ctoc/state/iron-loop.yaml` is absent (a fresh checkout, after `git clean`, or when
the suite's own transient state has not been written), `verifySetup(REPO).missing`
is non-empty and `ensureInitialized(REPO)` calls `initProject(REPO)`. `initProject`
then writes every missing artifact — `.ctoc/state/iron-loop.yaml` (gitignored →
invisible in `git status`) AND the root `IRON_LOOP.md` (tracked-namespace, NOT
gitignored → shows up as a new file in an otherwise clean tree). That asymmetry is
exactly why the observable symptom is a lone unrendered `IRON_LOOP.md`.

**The two other candidates are cleared, by reading them:**

- `tests/init-project-coverage.test.js` — every `initProject(tempDir)` call uses a
  `os.tmpdir()` fixture with `afterEach` cleanup (`:48-66`). Hermetic.
- `tests/e2e-menu-lifecycle.test.js` — spawns `start.js` with `cwd: tempProject`
  and pre-creates `.ctoc/` in the temp project (`:37-46`). Hermetic.
- `tests/streaming-gate.test.js:786-789` spawns `node -e` with `cwd:
  path.join(__dirname,'..')` but only `require`s two modules — it never runs
  `ensureInitialized`/`initProject`. Not a writer.
- `tests/session-start-hook.test.js:20` spawns with `cwd: REPO` but runs the
  SessionStart hook, which never calls `initProject`. Not a writer.

`ctoc-start-command.test.js` test 4 is the ONLY test that spawns `start.js` (the one
entry point that runs `ensureInitialized`) with its cwd on the real repository root.

## The decision this slice settles

The brief's hypothesis named `init-project-coverage.test.js` or
`e2e-menu-lifecycle.test.js`; both are hermetic on inspection. The real culprit is
`ctoc-start-command.test.js` test 4. Its INTENT is a pure contract check — "the
renamed script still WORKS: the dashboard route yields `{ text, ask, actions }`."
That contract needs only a valid project to render a dashboard; it does not need,
and must not use, the live repository as its fixture.

| option | what breaks |
|---|---|
| keep `cwd: REPO` | the real menu's auto-repair scaffolds the working tree — an unrendered `IRON_LOOP.md` (and a gitignored state file) on any checkout missing `.ctoc/state/iron-loop.yaml`. A test writes into the working tree |
| `cwd: REPO` + delete the stray file in teardown | masks a real leak; a future writer that touches the tree would be swept under the same rug. Teardown that deletes evidence is the false-green shape this repository fences |
| **spawn against a hermetic, already-complete tmp project (`cwd: tmpProject`)** | nothing — `ensureInitialized` is a pure no-op on a complete project, so nothing is written even to the temp dir, and the `{ text, ask, actions }` contract renders exactly as before |

**Chosen: spawn against a hermetic tmp project, seeded complete so
`ensureInitialized` attempts nothing.** This is the same discipline
`e2e-menu-lifecycle.test.js` already follows.

## Implementation Details

### File: `tests/ctoc-start-command.test.js`
**Action:** MODIFY
**Purpose:** Test 4 exercises the dashboard contract against a hermetic temp
project, never the live repository root.
**Change Type:** modify-existing — one test case, plus a small fixture helper and
teardown; the four other cases in the file are UNCHANGED.

#### Change 1 — a hermetic complete-project fixture

Add `os`, and a helper that builds a COMPLETE CTOC project in `os.tmpdir()` — one
that `verifySetup` reads as fully set up, so `ensureInitialized` is a no-op and
writes nothing:

```js
const os = require('os');

const STAGE_DIRS = [
  'vision', 'canvas', 'functional', 'implementation',
  'todo', 'in-progress', 'review', 'done',
];

/** A tmp project seeded complete so ensureInitialized() is a pure no-op. */
function makeCompleteTempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-start-cmd-'));
  fs.mkdirSync(path.join(dir, '.ctoc', 'state'), { recursive: true });
  for (const s of STAGE_DIRS) fs.mkdirSync(path.join(dir, 'plans', s), { recursive: true });
  // A usable regulatory anchor: an inline `active_profiles: []` (verifySetup /
  // complianceAnchorUsable accept an inline list or `declined: true`).
  fs.writeFileSync(path.join(dir, '.ctoc', 'settings.yaml'),
    'version: 1\n\nregulatory_regime:\n  active_profiles: []\n', 'utf8');
  fs.writeFileSync(path.join(dir, '.ctoc', 'state', 'iron-loop.yaml'), 'step: 1\n', 'utf8');
  return dir;
}
```

#### Change 2 — test 4 spawns against the temp project, not `REPO`

```js
it('4. the renamed script still WORKS — dashboard route yields { text, ask, actions }', () => {
  const script = path.join(COMMANDS, 'start.js');
  assert.ok(fs.existsSync(script), 'start.js must exist to be run');

  const tmpProject = makeCompleteTempProject();
  // Prove the spawn creates no root IRON_LOOP.md: a test must never write into the
  // working tree. Record the before-state so the guard cannot be fooled by a
  // pre-existing (developer-local) file.
  const rootIronLoop = path.join(REPO, 'IRON_LOOP.md');
  const ironLoopExistedBefore = fs.existsSync(rootIronLoop);
  try {
    const res = spawnSync(process.execPath, [script, 'dashboard'], {
      cwd: tmpProject,
      encoding: 'utf8',
      timeout: 90000,
    });
    assert.equal(res.status, 0, `start.js exited ${res.status}\nstderr: ${res.stderr}`);
    let json;
    try {
      json = JSON.parse(res.stdout);
    } catch (err) {
      assert.fail(`start.js stdout was not valid JSON: ${err.message}\n${res.stdout}`);
    }
    assert.equal(typeof json.text, 'string', 'contract requires a text string');
    assert.equal(typeof json.ask, 'object', 'contract requires an ask object');
    assert.equal(typeof json.actions, 'object', 'contract requires an actions object');

    // The regression guard: the spawn ran the real menu (which auto-repairs) but
    // against a hermetic project, so it created no IRON_LOOP.md in the working tree.
    assert.equal(fs.existsSync(rootIronLoop), ironLoopExistedBefore,
      'spawning start.js must not scaffold IRON_LOOP.md into the repository root');
  } finally {
    fs.rmSync(tmpProject, { recursive: true, force: true });
  }
});
```

- The three contract assertions (`text`/`ask`/`actions`) are unchanged — the case
  still proves the renamed script works.
- The new guard asserts the spawn created no root `IRON_LOOP.md`, comparing to the
  before-state rather than asserting absolute absence (a developer whose local tree
  already carries a stray copy from a pre-fix run is not falsely failed; the guard
  still catches a NEW creation).
- `finally` removes the temp project.

### Wiring — the live call site

This is a test-hygiene fix; the "live call site" is the test itself, run under
`npm test`. No production module changes, so there is no new module to wire — the
fix REMOVES an unwanted side effect of an existing test rather than adding code that
must be reached.

## Test Plan

The changed test IS the test. Its verification is behavioural:

| # | Property | How it is checked |
|---|---|---|
| 1 | the dashboard contract still holds | `res.status === 0` and `{ text, ask, actions }` are the right types (unchanged assertions) |
| 2 | the spawn writes nothing into the working tree | the new before/after `IRON_LOOP.md` guard |
| 3 | the temp project is cleaned up | `finally { fs.rmSync(..., { recursive: true, force: true }) }` |
| 4 | the fixture is genuinely complete (no-op repair) | `ensureInitialized` attempts nothing, so nothing is written even under the temp dir — confirmed at Step 14 by asserting no `IRON_LOOP.md` under `tmpProject` either (optional tightening) |

Cross-platform: `path.join`, `os.tmpdir()`, `fs.rmSync` teardown, no shell.

## Security Review

- **Working-tree integrity:** the whole point — the test no longer mutates the
  repository. No path outside `os.tmpdir()` is written by the spawn.
- **No secrets, no network, no new dependency.**
- **Teardown cannot mask a leak:** the guard asserts the absence of a NEW root
  `IRON_LOOP.md` BEFORE the temp project is removed; the removal only touches the
  temp dir, never the repository.

## Execution Plan (Steps 8-16)

### Step 8: TEST — first, PROVE the current leak: on a tree WITHOUT `.ctoc/state/iron-loop.yaml` (temporarily move it aside if present), run ONLY `node --test tests/ctoc-start-command.test.js` and show that a root `IRON_LOOP.md` appears (the red reproduction), then remove the stray file and restore the state file. Then apply the change and show test 4's new guard is GREEN and no root `IRON_LOOP.md` is created. Record both outputs verbatim. (The state file is gitignored, so moving it aside touches nothing tracked.)
- [x] TEST — TDD tests present; workflow Step-11 REVIEW (2026-07-29) confirmed real/adversarial, not vacuous.
### Step 9: PREPARE — re-read from disk: `tests/ctoc-start-command.test.js:22-145` (constants `REPO`/`COMMANDS`, the `describe`, and test 4 in full); `src/commands/start.js:750-788,905-960` to confirm `ensureInitialized` runs on every `main()` before routing and is a no-op on a complete project; `src/commands/start.js:612-617` for `REQUIRED_SETTINGS`/`REQUIRED_STATE`/`REQUIRED_STAGE_DIRS` and `:662-685` for `complianceAnchorUsable` (so the seeded `active_profiles: []` is accepted); `tests/e2e-menu-lifecycle.test.js:37-46` for the established hermetic-fixture shape to mirror.
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
### Step 10: IMPLEMENT — one step, sub-items in the one file.
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
  - add `require('os')` and the `makeCompleteTempProject` helper + `STAGE_DIRS`.
  - rewrite test 4 to spawn with `cwd: tmpProject`, add the before/after `IRON_LOOP.md` guard, and add the `finally` teardown.
### Step 11: REVIEW — confirm no path in the changed test resolves to `REPO` for the spawn cwd; confirm the three original contract assertions are intact; confirm the guard compares against the recorded before-state (not absolute absence); confirm teardown removes only the temp dir; confirm the other four cases in the file are untouched.
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3.
### Step 12: OPTIMIZE — the seeded complete project makes `ensureInitialized` a no-op, so the spawn does strictly less filesystem work than before (no repair) — faster, not slower.
### Step 13: SECURE — confirm the spawn writes only under `os.tmpdir()`; confirm nothing under `REPO` is created or modified by the test; confirm the guard reads, never deletes, the repository's `IRON_LOOP.md` slot.
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
### Step 14: VERIFY — `node --test tests/ctoc-start-command.test.js` green, and after the run confirm on disk that no `IRON_LOOP.md` exists at the repository root (and none under the temp dir). Then the full gated run `npm test` (`# fail 0`, coverage at or above the floor, 0 skipped) and confirm `git status` shows no stray `IRON_LOOP.md`. Lint the changed file. No git operations beyond `git status` inspection.
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
### Step 15: DOCUMENT — update the test file's header comment (or add a note on test 4) recording that it spawns against a hermetic temp project because the real menu auto-repairs, and that spawning against `REPO` scaffolded an unrendered `IRON_LOOP.md` into the working tree (the gitignored `.ctoc/state/iron-loop.yaml` being the missing artifact that triggered the repair).
### Step 16: FINAL-REVIEW — report `git status` BEFORE and AFTER a full `npm test`, verbatim, showing no `IRON_LOOP.md` at the repository root. Report every decision taken under ambiguity.
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.

## Decisions Taken Under Ambiguity

1. **The fixture is seeded COMPLETE (no-op repair), not merely marked with a bare
   `.ctoc/`.** A bare `.ctoc/` would make `ensureInitialized` repair into the temp
   dir — harmless (still cleaned up) but slower and noisier. A complete project
   makes the spawn write nothing anywhere, which is the tightest and clearest form
   of the fix.
2. **The regression guard compares against a recorded before-state, not absolute
   absence.** A developer whose local tree already has a stray `IRON_LOOP.md` from a
   pre-fix run must not be falsely failed; the guard still catches a NEW creation by
   the spawn, which is the actual regression.
3. **No teardown deletes a repository file.** Deleting a stray `IRON_LOOP.md` in
   teardown would mask any future writer that leaks into the tree — the false-green
   shape this repository fences. The guard ASSERTS the tree is unchanged instead.
4. **The brief's two named suspects are cleared in writing.**
   `init-project-coverage.test.js` and `e2e-menu-lifecycle.test.js` are both
   hermetic on inspection; the real culprit is `ctoc-start-command.test.js` test 4.
   Recorded so the next reader does not re-investigate the wrong files.
5. **No production code changes.** The defect is a test scaffolding the live tree;
   `initProject` writing the raw `IRON_LOOP.md` template into its `projectDir` is
   correct behaviour for a real init. A separate, out-of-scope observation (that
   `IRON_LOOP.md` is copied UNRENDERED while `CLAUDE.md` is rendered) is reported,
   not fixed here — changing init's rendering is a different decision for the
   operator to schedule.

## Decisions Taken During Execution

### The leak was reproduced exactly as the plan predicted
With the gitignored `.ctoc/state/iron-loop.yaml` moved aside (a fresh-checkout
condition), the UNCHANGED test 4 passed but left `?? IRON_LOOP.md` in the working
tree, first line the unrendered `# {{PROJECT_NAME}} — Iron Loop`. Every cited line
(`init-project.js:795-804`, `start.js:917` `ensureInitialized`, `:613`
`REQUIRED_STATE`, `.gitignore:6`) verified against current disk — nothing in the
plan was wrong.

### The new guard was proven non-vacuous by mutation
Holding the new before/after guard in place but flipping the spawn `cwd` back to
`REPO` with the state file absent made the guard FAIL with exactly `spawning
start.js must not scaffold IRON_LOOP.md into the repository root` (`pass 0` /
`fail 1`). Restoring `cwd: tmpProject` makes it green even with the state file
absent — the condition that caused the leak.

### Fixture-completeness is asserted directly
The plan's optional tightening (Test Plan row `4`) is included: the test also asserts
no `IRON_LOOP.md` under `tmpProject`, proving the seeded fixture is genuinely
complete so `ensureInitialized()` is a true no-op that writes nothing anywhere.

### Verify was clean at the enforced floor
`npm test` PASS: `tests 10401`, `pass 10401`, `fail 0`, `skipped 0`; coverage
`99.01%` at threshold `99%` (the thin margin untouched); `eslint --max-warnings 0`
exit `0`; false-green, both reachability, and gate-word fences green. After the full
suite `git status --porcelain` showed only the one modified test file — no stray
`IRON_LOOP.md`, no untracked artifact.
