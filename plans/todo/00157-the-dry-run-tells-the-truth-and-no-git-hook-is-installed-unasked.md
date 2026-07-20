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
### Step 9: PREPARE — re-read from disk: `src/lib/init-project.js:565-749` in full, every `created.push` / `skipped.push` site, `PLAN_DIRS` and `CTOC_DIRS`, and `src/lib/hooks-installer.js:614-665` for `installPostCommitHook`'s return shape. The landed code WINS over this plan's line numbers. Confirm `src/commands/menu.js`'s `ensureInitialized` reads the report (the preceding slice); if it still discards it, STOP and report — changing the report shape under a caller that ignores it would leave the defect intact while looking fixed.
### Step 10: IMPLEMENT — one step, files as sub-items.
  - `src/lib/init-project.js` — Changes 1, 2 and 3.
### Step 11: REVIEW — confirm no `created.push` remains on a preview path. Confirm no write remains outside `record`. Confirm the install path is byte-identical when `installGitHook: true`. Confirm every other caller of `initProject` in the repository still works with the new shape, and list each one. Confirm `success` cannot be true while `failed` is non-empty.
### Step 12: OPTIMIZE — `record` replaces four duplicated branches; the required-artifact check is a handful of existence calls at the end of a once-per-project operation.
### Step 13: SECURE — writing into `.git/hooks/` is the highest-privilege thing setup does, and this slice removes it from the default path. Confirm the install runs ONLY under the explicit option. Confirm `failed` entries carry the error MESSAGE and never a stack trace or an absolute path.
### Step 14: VERIFY — `node --test tests/init-tells-the-truth.test.js tests/init-project.test.js tests/menu-reports-what-init-did.test.js tests/hooks-installer.test.js tests/e2e-menu-lifecycle.test.js` green, then the full gated run `npm test`. Lint the changed file. No git operations.
### Step 15: DOCUMENT — a JavaScript doc on `initProject` stating the two rules: a preview reports what it WOULD do under a different key, and setup never installs anything into a git repository without being asked. Record the follow-up that would offer the install, so it is visible rather than forgotten.
### Step 16: FINAL-REVIEW — report the preview report and the real report side by side for the same fixture, verbatim, plus the filesystem listing proving the git hook was not installed. Report every decision taken under ambiguity.

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
