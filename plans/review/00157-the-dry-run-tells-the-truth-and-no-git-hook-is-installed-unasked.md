---
approved_by: human
approved_at: 2026-07-20T09:18:53.841Z
gate_crossed: implementation → todo
---

---
title: "The setup preview stops listing files it did not write, and nothing installs a git hook without being asked"
type: implementation
parent_plan: none
depends_on: 00156-the-menu-never-claims-it-set-up-a-project-it-did-not
priority: CRITICAL
program: fresh-repository-first-run
iron_loop: true
files:
  - "src/lib/init-project.js"
  - "tests/init-tells-the-truth.test.js"
  - "tests/init-project.test.js"
  - "tests/init-project-coverage.test.js"
  - "tests/quality-fleet-wiring.test.js"
  - "tests/menu-coverage.test.js"
  - "src/commands/menu.js"
  - "CLAUDE.md"
scope_extension:
  authorized_by: human
  authorized_at: 2026-07-20
  reason: >
    Four existing tests assert the behaviour this plan replaces: one asserts a
    preview creates files, three assert setup installs a git hook by default.
    The menu must read the new failure field to keep its fail-open reason. The
    documented test-file count moves by one. Correcting the behaviour without
    correcting the tests that guard it leaves a second source of truth.
---

# The setup preview lies in both directions, and installs a git hook on the way out

`initProject` has a preview mode. In it, every write is skipped and every
announcement is made anyway.

`src/lib/init-project.js:680-746` — the pattern repeats four times:

```js
if (!safeFs.existsSync(dirPath)) {
  if (!dryRun) {
    ensureDir(dirPath);          // ← skipped in a preview
  }
  created.push(dir + '/');       // ← NOT skipped in a preview
}
```

Same shape at `:694-698` (`.ctoc/settings.yaml`), `:707-711`
(`.ctoc/state/iron-loop.yaml`) and `:721-725` (`.gitignore`). **A preview's report
is byte-identical to a real run's report.** Nothing in the returned value says which
one produced it. This is the same defect class as the menu announcing an
initialization it never performed, one layer down — and it is one of the routes by
which the owner could have been told his project was set up while `.ctoc/` stayed
empty.

## And the one item that is a consent decision is the one item the preview hides

`:729-746`, step 9:

```js
if (!dryRun && safeFs.existsSync(path.join(projectDir, '.git'))) {
  const res = installPostCommitHook(projectDir);
```

The whole block is inside `!dryRun`. So it **never appears in a preview**, and then
**installs on the real run**. Every harmless item is over-reported; the single item
that modifies the user's git repository and fires on every future commit is
under-reported to zero.

Installing something that runs on every commit is not a side effect. It is a
decision the human makes. Nobody asked.

## A third instance, in the same function

`:748`:

```js
return { success: true, created, skipped, detected };
```

`success` is a literal. It is `true` when every write succeeded, `true` when every
write was skipped, `true` in a preview that wrote nothing, and `true` when a
required artifact failed. A field whose value never depends on anything is not a
result; it is decoration that reads like a result. The menu's read-back (preceding
slice) exists partly because this field cannot be trusted — and it should also stop
being untrustworthy.

## The fix

### The preview is structurally distinguishable from a real run

A preview no longer pushes to `created`. It pushes to `wouldCreate`, and the return
carries `dryRun: true`. A caller that reads `created` from a preview gets an empty
array, which is the truth: nothing was created. A caller who wants the preview must
ask for `wouldCreate` by name, which is a deliberate act rather than an accident.

```js
{ success, dryRun, created, wouldCreate, skipped, failed, detected }
```

`failed` is new and carries every artifact whose write threw — today those throws
propagate out of `initProject` and reach `ensureInitialized`'s bare `catch`, which
discards them. A per-artifact failure is recorded and setup continues, so one bad
write no longer costs the whole project its `plans/` directories.

### `success` is computed

`success` is true when `failed` is empty and every REQUIRED artifact is present
after the run: the eight stage directories, `.ctoc/settings.yaml`,
`.ctoc/state/iron-loop.yaml`. In a preview `success` is `null` — a preview has no
success to report, and returning `true` would be the same lie in a new field.

### The git hook is never installed by setup

`installGitHook` becomes an explicit option, **defaulting to `false`**. Setup does
not install it. It records, in both real runs and previews:

```
.git/hooks/post-commit — NOT installed. It would run on every commit you make.
That is your decision, not setup's.
```

so the human knows the thing exists, knows what it does, and knows it did not
happen. When `installGitHook: true` is passed the existing behaviour runs unchanged.

The preview lists it too, so a preview and a real run now describe the same set of
actions — which is what a preview is for.

**This slice does NOT ask the question.** Asking means rendering an option, which
means `src/commands/menu.js`, which this plan does not declare and which the
preceding slice owns. Stopping the unasked install is a complete, shippable change
on its own: the hook is simply not installed, and the human is told so and told
what it would do. Wiring an offer is a follow-up that touches the menu, and it is
named here rather than smuggled in.

## Implementation Details

### File: `src/lib/init-project.js`
**Action:** MODIFY
**Purpose:** The report describes what happened; the preview describes what would
happen; neither installs anything into a git repository unasked.
**Change Type:** modify-existing — the report shape, four preview sites, step 9, the return

#### Change 1 — a recorder instead of four hand-written pairs

A module-private helper replaces the repeated `if (!dryRun) { write } push(...)`
shape:

```js
function record(state, label, write) {
  if (state.dryRun) { state.wouldCreate.push(label); return; }
  try { write(); state.created.push(label); }
  catch (err) { state.failed.push(`${label} (${err.message})`); }
}
```

One helper, so the preview branch cannot be got wrong at a fifth site. The four
existing sites (`:680-688`, `:690-701`, `:703-714`, `:716-727`) become calls to it.
The `skipped` path — an artifact that already exists — is unchanged and still pushes
to `skipped` in both modes, because "it was already there" is equally true in a
preview.

#### Change 2 — step 9 no longer installs, and appears in previews

```js
const hasGit = safeFs.existsSync(path.join(projectDir, '.git'));
if (hasGit && installGitHook) {
  // the existing install path, unchanged
} else if (hasGit) {
  state.skipped.push(
    '.git/hooks/post-commit — NOT installed. It would run on every commit you make. '
    + 'That is your decision, not setup\'s.'
  );
}
```

Reported in both modes. The install path itself is untouched — this changes WHEN it
runs, never WHAT it does.

#### Change 3 — `success` is computed (`:748`)

```js
const missing = REQUIRED_ARTIFACTS.filter((rel) => !safeFs.existsSync(path.join(projectDir, rel)));
return {
  success: dryRun ? null : (state.failed.length === 0 && missing.length === 0),
  dryRun,
  created: state.created,
  wouldCreate: state.wouldCreate,
  skipped: state.skipped,
  failed: state.failed,
  missing,
  detected,
};
```

`REQUIRED_ARTIFACTS` is a frozen list declared beside the directory constants. It is
the same set the menu's read-back checks, and the duplication is deliberate and
recorded as decision 6 below.

### Wiring — the live call sites

| changed code | live call site | root |
|---|---|---|
| the new report shape | `menu.js` `ensureInitialized` — the sole production caller, which reads `created`/`skipped` today and gains `failed`/`missing` | every first open of the entry point |
| `record` | the four setup steps in this file | same |
| the not-installed notice | `initProject`'s `skipped`, rendered by the menu's setup message | same |
| `installGitHook` | defaults false; the only true caller after this slice is a test | — |

`installGitHook: true` has no production caller after this slice, which is exactly
the point: nothing installs it without a human. The option exists so the follow-up
that asks can pass it, and its absence of a caller is honest rather than hidden.

## Test Plan

### Tests: `tests/init-tells-the-truth.test.js`
**Action:** CREATE
**Framework:** `node:test`

| # | Case | Fixture / action | Assertion |
|---|---|---|---|
| 1 | **a preview writes nothing** | fresh directory, `{ dryRun: true }` | after the call, `.ctoc/` does not exist and `plans/` does not exist |
| 2 | **a preview reports nothing as created** | same | `created` is empty; `wouldCreate` is non-empty; `dryRun` is true |
| 3 | **a preview and a real run describe the same actions** | run a preview, then a real run on a fresh copy | the preview's `wouldCreate` set equals the real run's `created` set |
| 4 | **the git hook appears in the preview** | preview inside a directory containing `.git` | the report mentions `post-commit` |
| 5 | **a real run does NOT install the git hook** | fresh directory containing `.git`, default options | `.git/hooks/post-commit` does NOT exist afterwards — the consent defect, asserted from the filesystem |
| 6 | **and says so** | same | the report mentions `post-commit` and `NOT installed` |
| 7 | **an explicit request DOES install it** | `{ installGitHook: true }` | the hook file exists and contains CTOC's sentinel |
| 8 | **`success` is false when a required write fails** | force the settings write to fail through the `safe-fs` seam | `success` is false; `failed` names the artifact; `missing` names it too |
| 9 | **one failed write does not cost the rest** | same fixture | the eight stage directories still exist — setup continued past the failure |
| 10 | **`success` is null in a preview** | case 1 | `success === null`, not `true` |
| 11 | **`success` is true only when everything required is present** | clean fresh run | `success` true, `failed` empty, `missing` empty, and all eight stage directories plus both `.ctoc` files exist on disk |
| 12 | **an already-set-up project reports skipped, not created** | run twice | the second run's `created` is empty and `skipped` names the pre-existing artifacts |
| 13 | **the menu's read-back agrees with the report** | drive `ensureInitialized` over case 8's fixture | its verdict is `ok: false` — the two layers do not contradict each other |
| 14 | **no report field is a hardcoded literal** | read `src/lib/init-project.js` | the returned `success` is not the literal `true`; asserted on the source, because this is the exact shape that shipped |

Case 5 is the consent defect. Case 3 is what a preview is for. Case 14 is a small
source assertion, and it earns its place: the defect being fixed is literally a
hardcoded `true`, and a behavioural test alone would pass on a re-introduction that
happens to be correct on the fixtures.

Cross-platform: `path.join`, `os.tmpdir()`, `fs.promises.rm` teardown. The `.git`
fixtures create a directory named `.git` containing a `hooks/` directory — no real
repository and no `git` binary is invoked, so the tests do not depend on git being
installed.

## What this slice does NOT fix

- **It does not ASK about the git hook.** It stops installing it unasked and says
  so. Offering the install is a menu change, in a file this plan does not declare.
  The result until then is that new projects do not get the background quality hook
  — a real behaviour change, stated plainly rather than buried.
- **It does not change what the hook does** when it is installed.
- **It does not fix the project root resolving to an ancestor.** Different slice.
- **It does not audit other previews in the codebase.** `deployment.js` also carries
  a dry-run concept; whether it has the same defect is not investigated here and is
  not claimed either way.
- **It does not determine why the owner's settings file was absent.** It removes one
  of the candidate routes and makes the rest announce themselves.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/init-tells-the-truth.test.js` in full, run ONLY that file, record the red output verbatim. Cases 1 through 6, 8, 9, 10 and 14 MUST be red. Case 5's red evidence MUST show the installed hook file's contents, because a git hook appearing in a user's repository unasked is the finding a reader most needs to see.
- [x] TEST — TDD tests present; workflow Step-11 REVIEW (2026-07-29) confirmed real/adversarial, not vacuous.
### Step 9: PREPARE — re-read from disk: `src/lib/init-project.js:565-749` in full, every `created.push` / `skipped.push` site, `PLAN_DIRS` and `CTOC_DIRS`, and `src/lib/hooks-installer.js:614-665` for `installPostCommitHook`'s return shape. The landed code WINS over this plan's line numbers. Confirm `src/commands/menu.js`'s `ensureInitialized` reads the report (the preceding slice); if it still discards it, STOP and report — changing the report shape under a caller that ignores it would leave the defect intact while looking fixed.
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
### Step 10: IMPLEMENT — one step, files as sub-items.
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
  - `src/lib/init-project.js` — Changes 1, 2 and 3.
### Step 11: REVIEW — confirm no `created.push` remains on a preview path. Confirm no write remains outside `record`. Confirm the install path is byte-identical when `installGitHook: true`. Confirm every other caller of `initProject` in the repository still works with the new shape, and list each one. Confirm `success` cannot be true while `failed` is non-empty.
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3.
### Step 12: OPTIMIZE — `record` replaces four duplicated branches; the required-artifact check is a handful of existence calls at the end of a once-per-project operation.
### Step 13: SECURE — writing into `.git/hooks/` is the highest-privilege thing setup does, and this slice removes it from the default path. Confirm the install runs ONLY under the explicit option. Confirm `failed` entries carry the error MESSAGE and never a stack trace or an absolute path.
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
### Step 14: VERIFY — `node --test tests/init-tells-the-truth.test.js tests/init-project.test.js tests/menu-reports-what-init-did.test.js tests/hooks-installer.test.js tests/e2e-menu-lifecycle.test.js` green, then the full gated run `npm test`. Lint the changed file. No git operations.
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
### Step 15: DOCUMENT — a JavaScript doc on `initProject` stating the two rules: a preview reports what it WOULD do under a different key, and setup never installs anything into a git repository without being asked. Record the follow-up that would offer the install, so it is visible rather than forgotten.
### Step 16: FINAL-REVIEW — report the preview report and the real report side by side for the same fixture, verbatim, plus the filesystem listing proving the git hook was not installed. Report every decision taken under ambiguity.
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.

## Decisions Taken Under Ambiguity

1. **A separate `wouldCreate` key rather than a `dryRun` flag on the same key.** A
   flag has to be read to be honoured, and the whole defect is a caller not reading
   something. A different key means a caller that ignores the distinction gets an
   empty `created` array — the truth — instead of a fabricated list.
2. **`success` is `null` in a preview, not `true` and not `false`.** A preview has no
   success. `true` repeats the lie in a new field; `false` reads as a failure that
   did not happen. `null` is the honest third value and forces a caller to think.
3. **The git hook is not installed, and this slice does not ask.** Asking requires
   the menu, which this plan does not declare. Two plans editing the same command
   surface is the contention this pipeline keeps tripping over. Stopping the unasked
   install is complete on its own, and the consequence — new projects lack the
   background quality hook until the follow-up lands — is stated rather than hidden.
4. **A failed write is recorded and setup continues.** Today a throw escapes into a
   bare `catch` and costs the whole run. One bad artifact should not cost a project
   its `plans/` directories, and a per-artifact record is what makes the failure
   nameable.
5. **`REQUIRED_ARTIFACTS` is duplicated between this module and the menu's
   read-back, deliberately.** They are two independent checks of the same claim, and
   sharing the list would let one mistake pass both. If they disagree, case 13 fails
   — which is the point. This is recorded because duplication normally deserves the
   opposite treatment.
6. **Case 14 asserts on source text.** Behavioural tests would pass on a
   re-introduced hardcoded `true` whenever the fixtures happen to succeed. The
   defect is a literal, so one assertion is aimed at the literal.
7. **The `.git` fixtures do not invoke git.** A test that shells out to a binary
   would be skipped where the binary is absent, and a skip is a gate failure.

8. **The plan undercounted the defect sites by two — `CLAUDE.md` and
   `IRON_LOOP.md` carry the same shape.** Change 1 named four sites (the
   directory loop, `.ctoc/settings.yaml`, `.ctoc/state/iron-loop.yaml`,
   `.gitignore`). Reading the landed code found SIX: steps 3 and 4 write
   `CLAUDE.md` and `IRON_LOOP.md` with the identical
   `if (!dryRun) { write } created.push(...)` pattern. Leaving them would have
   left a preview still over-reporting two artifacts, so all six became `record`
   calls. The landed code wins over the plan's line numbers, as Step 9 directs.

9. **A preview PREDICTS the two CLAUDE.md managed blocks (steps 3b/3c) rather
   than skipping them silently.** Those blocks sit inside `if (!dryRun)` and add
   `CLAUDE.md (operating-lessons block)` and `CLAUDE.md (operating-manual block)`
   to `created` on a real run. Skipping them in a preview would make the preview
   and the real run describe DIFFERENT sets of actions — the defect one layer
   over, and case 3 catches it. A preview that would write `CLAUDE.md` from the
   template would also fill that template's placeholders, so the preview records
   both labels. The prediction is conditioned on `CLAUDE.md` actually being in
   `wouldCreate`, so a project with a pre-existing `CLAUDE.md`, or one where the
   template is absent, predicts neither.

10. **`missing` is computed in a preview too, and is therefore long.** On a
    preview of a fresh directory every required artifact is absent, so `missing`
    lists all ten. That is factually correct — they do not exist — and `success:
    null` already tells a caller not to read a preview as a verdict. Inventing a
    hypothetical post-run `missing` for a run that never happened would be a new
    fabrication in the field added to stop one.

11. **Error messages in the report are scrubbed of filesystem layout.** Node's
    `fs` errors embed the absolute path they failed on, and a report is shown to
    a human and may be logged. `reportableError` replaces the project root with
    `<project>` and the home directory with `<home>`; the message survives, the
    layout does not, and a stack trace never enters a report. The two
    pre-existing fail-open `skipped` messages in steps 3b/3c were routed through
    it as well, since they had the same exposure.

12. **The home-directory scrub names the failure it absorbs instead of
    swallowing it.** `os.homedir()` throws on a host with no resolvable home. The
    first attempt used a bare `catch {}` — which the repository's own false-green
    fence correctly flagged as a NEW `silent-catch` site. It was fixed in the
    code, never baselined: the absorbed error is now appended to the returned
    text, so a partial scrub is visible rather than indistinguishable from a
    complete one.

13. **`tests/init-project.test.js` — `dry run does not create files`.**
    (a) *Supposed behaviour, from outside the test:* this plan's section "The
    preview is structurally distinguishable from a real run", and the human's
    complaint that a preview must not claim writes it did not perform.
    (b) *Why the TEST is wrong, not the code:* the assertion was
    `result.created.length > 0` on a run that writes nothing. It does not merely
    permit the defect, it REQUIRES it — the test would fail if the code told the
    truth. The default is that the code is wrong; this qualifies only because the
    human explicitly replaced the contract.
    (c) *Which implementation passes today and fails after the change:* the
    shipped `created.push` on the preview path passed before and fails now. The
    assertion was INVERTED to `deepStrictEqual(created, [])` plus `wouldCreate`
    non-empty, `dryRun === true` and `success === null`, so re-introducing the
    defect fails four ways. Nothing was loosened; the case gained assertions.

14. **`tests/init-project-coverage.test.js` —
    `should_install_post_commit_hook_when_git_dir_present_and_no_hook_yet`.**
    (a) *Supposed behaviour:* this plan's "The git hook is never installed by
    setup", and the owner's complaint — setting up a project installed a hook
    that fires on every commit, absent from the preview, never asked.
    (b) *Why the TEST is wrong:* it asserted the unasked install as a required
    contract. The human explicitly replaced that contract: something that fires
    on every commit is a decision the human makes, not a side effect of setup.
    (c) *Which implementation fails after the change:* the unconditional install
    passed before and fails now. The case was inverted to assert from the
    FILESYSTEM that no hook exists, plus that the notice is present and names
    what the hook would do. The install coverage it used to provide is not lost —
    it moved to a new sibling case, `should_install_post_commit_hook_when_
    EXPLICITLY_asked`, so the install path keeps its guard.

15. **`tests/init-project-coverage.test.js` —
    `should_skip_post_commit_hook_when_a_ctoc_hook_is_already_installed`.**
    (a) *Supposed behaviour:* the installer is idempotent — a second install over
    a CTOC hook is a skip, and the existing file is untouched. That contract is
    UNCHANGED by this plan, which changes only WHEN the install runs.
    (b) *Why the TEST is wrong:* it reached the install path through the default,
    which no longer goes there. Left alone it would have passed on the strength
    of the not-installed notice, which also contains `post-commit` — a verdict on
    a branch it never entered.
    (c) *Which implementation fails after the change:* it now passes
    `installGitHook: true`, so a regression in the installer's idempotency fails
    it again. Under the old form such a regression would have gone undetected.
    No assertion was weakened; only the route to the branch was restored.

16. **`tests/quality-fleet-wiring.test.js` — `POST-COMMIT LOOP: initProject wires
    the background quality hook`.**
    (a) *Supposed behaviour:* same source as decision 14.
    (b) *Why the TEST is wrong:* its entire premise — that setup wiring the hook
    is the desired end state — is the replaced contract. Its name asserted it too,
    so the name changed with it.
    (c) *Which implementation fails after the change:* inverted to assert the hook
    is absent and the notice present, with a second case proving the explicit
    opt-in still installs a hook that launches `src/hooks/post-commit.js`. Both
    the consent rule and the wiring it used to guard now have a test.

17. **`tests/menu-coverage.test.js` was NOT changed — the code was wrong.**
    Its assertion `typeof result.reason === 'string'` was correct all along: a
    human looking at a degraded menu must be able to read WHY. It failed because
    the failure text had moved from a thrown exception into `report.failed` and
    `ensureInitialized` did not read that field. Fixing `src/commands/menu.js` to
    read it made the test pass untouched. The file stays in the declared list
    because that could not be known before the fix was attempted, but no edit was
    needed and none was made.

18. **A fifth test was found green-but-vacuous and was tightened:
    `should_fail_open_and_report_skip_when_hook_install_throws`.** It was not in
    the four and it was passing, so it was nearly left alone. It claimed to
    exercise the installer's throw path, but under the new default the installer
    is never invoked — it passed because the not-installed notice also contains
    the string `post-commit`. That is a check reporting a verdict on input it
    never received, the exact class this repository fences. It now drives the real
    throw path with `installGitHook: true` and asserts the failure is recorded in
    `failed`, that setup did not throw, and that the plan directories survived.

19. **A hook-install failure makes `success` false.** Following this plan's
    formula literally (`failed.length === 0 && missing.length === 0`), a failed
    hook install — which only happens when the human ASKED for it — reports
    `success: false`, even though the hook is not a required artifact. That is
    the honest answer: the human asked for something and did not get it. The
    previously-passing assertion `assert.equal(result.success, true)` on that
    fixture was therefore changed to `false`, which is a tightening toward the
    computed value and away from the old hardcoded literal.

20. **The menu renders the reason, not just the missing list.** `setupMessage`
    reported WHAT was absent and never WHY. A permission error and an absent
    template produce an identical `missing` list and need completely different
    responses from the human, so the reason is appended when setup has one. It is
    omitted when absent, leaving the previous sentence byte-identical.

## Execution Record

**Steps 8–16 complete. The scope extension recorded in the frontmatter was
authorized, all eight declared files were reconciled under it, the full gated
suite is green, and the plan was human-approved into review. The two "scope
stop" sections below are preserved as the honest history of what execution hit
mid-flight; the "Verification Evidence" section records the resolved final
state — the real full gate, green.**

### Step 8 TEST — TDD RED, verbatim

`node --test tests/init-tells-the-truth.test.js` before any implementation
existed: **17 tests, 14 failed, 3 passed.** The 14 red:

```
✖ CASE 2 — a preview reports NOTHING as created, and says it is a preview
✖ CASE 10 — `success` is null in a preview, not true
✖ CASE 3 — a preview and a real run describe the SAME set of actions
✖ CASE 5 — a real run does NOT install the post-commit hook (the consent defect)
✖ CASE 6 — and the real run SAYS the hook was not installed, and what it would do
✖ CASE 4 — the hook notice appears in a PREVIEW too
✖ BROKEN WORLD A — a directory that is NOT a repository mentions no hook at all
✖ BROKEN WORLD B — an existing FOREIGN post-commit hook is left byte-identical
✖ BROKEN WORLD C — an unwritable hooks directory is RECORDED, never thrown
✖ CASE 11 — `success` is true only when everything required is present
✖ CASE 8 — `success` is FALSE when a required write fails, and the artifact is named
✖ CASE 9 — one failed write does not cost the run its plan directories
✖ CASE 14 — `success` is not a hardcoded literal in the source
```

Case 5's red evidence — the file setup wrote into a repository nobody asked:

```sh
#!/bin/sh
# >>> CTOC post-commit >>>
# CTOC post-commit hook - triggers background quality agent
# CTOC hook is NON-BLOCKING - commit always succeeds instantly.
node "/Users/doctony/Code/ctoc/src/hooks/post-commit.js" 2>/dev/null &
# <<< CTOC post-commit <<<
```

### Three cases were GREEN before implementation — each accounted for

- **CASE 1 (a preview writes nothing).** The behaviour already existed: every
  write WAS correctly skipped in a preview. Only the REPORTING lied. The case is
  not vacuous — it is the regression guard for the six-site `record` refactor,
  which is exactly the change that could start writing during a preview. Kept.
- **CASE 7 (an explicit request installs).** Already green because setup
  installed unconditionally, so it also installed with the option set. It is the
  guard that Change 2 changed WHEN the install runs and never WHAT it does. Kept.
- **CASE 12 (an already-set-up project reports skipped).** Already green: the
  `skipped` path was never inside the `!dryRun` guard. Kept as the guard that the
  refactor did not move it there.

Nothing green-before-implementation is banked as evidence of the fix.

### Step 10 IMPLEMENT — `src/lib/init-project.js`

- `REQUIRED_ARTIFACTS` (frozen: the eight stage directories plus the two `.ctoc`
  files), `HOOK_NOT_INSTALLED_NOTICE`, `reportableError`, and `record` added.
- Six recording sites converted to `record`: `CLAUDE.md`, `IRON_LOOP.md`, the
  directory loop, `.ctoc/settings.yaml`, `.ctoc/state/iron-loop.yaml`,
  `.gitignore`. Steps 3b/3c gained preview predictions.
- Step 9 no longer installs by default and reports in both modes.
- The return is computed; the hardcoded `return { success: true, ... }` is gone.

### What the preview shows versus what a real run does — same fixture, verbatim

Fresh empty directory containing a `.git/` directory. Preview `wouldCreate` and
real-run `created` are set-equal (case 3 asserts it); the hook line appears in
both reports' `skipped`:

```
wouldCreate / created (25 entries, identical sets — verified set-equal live):
  CLAUDE.md
  CLAUDE.md (operating-lessons block)
  CLAUDE.md (operating-manual block)
  IRON_LOOP.md
  plans/vision/ … plans/done/          (8 stage directories)
  .ctoc/ … .ctoc/learnings/rejected/   (11 CTOC directories)
  .ctoc/settings.yaml
  .ctoc/state/iron-loop.yaml

skipped (both modes):
  .git/hooks/post-commit — NOT installed. It would run on every commit you
  make. That is your decision, not setup's.

preview:  success: null,  dryRun: true,   created: []
real run: success: true,  dryRun: false,  wouldCreate: []
```

Filesystem after the real run: `.git/hooks/` is **empty**. No `post-commit`.

### Step 11 REVIEW

- No `created.push` remains on a preview path: every surviving `created.push` is
  inside the `else` of an `if (dryRun)`, audited line by line.
- No write remains outside `record` except the hook install, which is guarded by
  `installGitHook` and has its own preview branch.
- The install path is byte-identical under `installGitHook: true` — the
  `installPostCommitHook` call and its result handling are unchanged; only the
  `catch` target moved from `skipped` to `failed`.
- `success` cannot be true while `failed` is non-empty: it is
  `state.failed.length === 0 && missing.length === 0`.
- Callers of `initProject` in the repository: `src/commands/menu.js`
  (`ensureInitialized`, line 729) — the sole production caller. Test callers:
  `tests/init-project.test.js`, `tests/init-project-coverage.test.js`,
  `tests/greenfield-journey.test.js`, `tests/quality-fleet-wiring.test.js`.

### Step 13 SECURE

The install runs ONLY under the explicit option, verified by case 5 from the
filesystem. `failed` entries carry a scrubbed message and never a stack trace or
an absolute path. A new `silent-catch` false-green site introduced during
implementation was FIXED in the code, not whitelisted.

### Step 15 DOCUMENT

`initProject`'s JavaScript doc states both rules and names the follow-up (the
menu change that would OFFER the hook) so it is visible rather than forgotten.

## Verification Evidence

### The real full gate — GREEN

The gated entry point, run to completion in the review-stage worktree:

```
npm test   (src/scripts/test-gate.js — whole suite + coverage floor + zero-skipped)
  [CTOC test-gate] coverage 99.15% (threshold 99%), skipped 0, failed 0
  [CTOC test-gate] PASS        (exit 0)

npx tsc --noEmit
  clean (exit 0)
```

Coverage 99.15% clears the 99% ratchet; zero tests failed, zero skipped, zero
flaky. No baseline or whitelist entry was added anywhere, in either direction.

Declared-scope isolation checks, still green:

```
node --test tests/init-tells-the-truth.test.js
  tests 17 · pass 17 · fail 0 · skipped 0
node --test tests/iron-loop-enforcer.test.js
  tests 33 · pass 33 · fail 0 · skipped 0
npx eslint src/lib/init-project.js tests/init-tells-the-truth.test.js --max-warnings 0
  clean
```

### The two scope stops recorded mid-execution — both RESOLVED

The two sections below are the history execution hit while the plan was still in
the build queue. Both are resolved; they are kept because the record must not
erase what happened, only report the final state honestly.

**The first scope stop — RESOLVED.** Finishing Step 14 required editing five
files this plan did not originally declare, plus the initialization caller. The
human authorized the extension (the `scope_extension:` block in the frontmatter),
the `files:` list was widened, and all six edits were completed under that
authorization. The per-test justifications are decisions 13 through 20 above.
Note: the initialization caller the wiring narrative calls `src/commands/menu.js`
has since been renamed to `src/commands/start.js` (`ensureInitialized` lives
there now); the `files:` frontmatter still names the historical path because that
list is inside the Gate-2 approval hash and is left exactly as approved.

**The second scope stop — RESOLVED by the human's approval path.** During
execution the scope extension changed the `files:` list, which is part of the
Gate-2 approval hash, so `checkGateDestinationsApproved` correctly flagged this
plan while it sat in `todo/` with a stale ledger entry. The executor did NOT
self-resolve it — re-recording the agent-write-denied approval ledger would be
the forgery that check exists to catch. It was resolved the only correct way:
the human re-approved the widened plan through their own approval path and the
plan was promoted into `review/`. The ledger and the plan are now consistent —
`node --test tests/iron-loop-enforcer.test.js` reports `pass 33 · fail 0` with no
`gate-destinations-approved` block finding, which is the direct evidence that the
approval invalidation the record once described is gone.
