---
title: "The workspace walk's broken-child fault runs on every machine — a case that tolerates its own fault not happening proves nothing where it did not"
type: implementation
parent_plan: 00210-the-coverage-floor-gets-margin-it-can-rely-on
depends_on: 00211-the-scan-fault-cases-run-on-every-machine
priority: MEDIUM
program: ctoc-repair-loop
iron_loop: true
files:
  - "tests/stack-detector-coverage.test.js"
---

# The workspace walk's broken-child fault runs on every machine

## The gap, read on disk

`tests/stack-detector-coverage.test.js:139–158`:

```js
let symlinkMade = false;
try {
  try {
    fs.symlinkSync(path.join(root, 'nonexistent-target'), path.join(root, 'packages', 'broken'), 'dir');
    symlinkMade = true;
  } catch (e) {
    // Platform without symlink privilege — the real-package assertion below still
    // holds (the walk simply has no broken child to skip on this platform).
  }

  const stack = detectStack(root);

  assert.ok(stack.frameworks.includes('express'),
    'nested packages/real resolved; broken symlink child did not abort the `**` walk');
  assert.ok(symlinkMade || process.platform === 'win32',
    'broken symlink was created on a POSIX platform (documents the branch under test)');
```

The case exists to drive the `statSync` catch inside the workspace `**` walk — the
branch that keeps a broken child from aborting the walk and silently dropping a real
dependency.

**When `fs.symlinkSync` throws, the case still passes.** The dangling child is never
created, so the `statSync` catch is never entered, and the express assertion at `:155`
succeeds for a reason that has nothing to do with the branch under test. The guard at
`:157` then explicitly permits that outcome on `win32`.

So on Windows the case is green while asserting nothing about its own subject. That is
not a coverage rounding error; it is a case whose fault did not occur reporting a
verdict as though it had.

## Why the current shape was reasonable, and what changes

The existing comment is honest — it says the express assertion "still holds" and that
the walk "simply has no broken child to skip on this platform". Nobody hid anything.
The fix is not a correction of intent but of mechanism: **Windows can create a dangling
directory link without elevation, using a junction.** `fs.symlinkSync(target, path,
'junction')` does not require the symlink privilege that `'dir'` does.

So the fault becomes inducible everywhere, and the case stops needing an escape hatch.

## The change

1. **Induce the fault portably.** Use `'junction'` on `win32` and `'dir'` elsewhere.
   The target remains a nonexistent path, so the child is dangling either way.

2. **Fail loudly if the fault cannot be induced.** Replace the permissive
   `symlinkMade || process.platform === 'win32'` at `:157` with an assertion that the
   broken child EXISTS as a link — checked with `fs.lstatSync(...).isSymbolicLink()`,
   which does not follow the link and therefore sees a dangling one.

   If a future platform cannot create it at all, the case must FAIL with a stated reason
   or announce a loud skip in the style of
   `tests/stale-scan-says-when-it-could-not-look.test.js:49–57` — **never pass quietly.**
   A case that tolerates its own fault not happening is the shape being removed; the fix
   must not reintroduce it in a new place.

3. **Assert the branch, not just the outcome.** Keep the express assertion — it is the
   behaviour a caller relies on — and add that `stack.frameworks` is non-empty and the
   walk returned normally, so a walk that aborted early is distinguishable from one that
   skipped the broken child correctly.

## What each case asserts a caller relies on

**The dangling child is real before the act.** `lstatSync(...).isSymbolicLink()` is
true. **Relied on by:** the test itself — this is the precondition that makes the
subsequent assertion mean anything. Without it the case is the one being fixed.

**A broken workspace child does not abort the `**` walk.** `detectStack(root)` still
resolves `packages/real` and reports `express`. **Relied on by:** every consumer of
`detectStack` — `init-project.js` generates a project's CLAUDE.md from it. A walk that
aborts on a broken child silently under-reports the stack, and the generated file is
wrong in a way nobody notices.

**The vacuity guard.** Assert that with the broken child ABSENT the express assertion
still passes — proving it does not discriminate on its own, and therefore that the
dangling-link precondition is what makes the case a real test of the catch. Record this
explicitly so a later reader does not mistake the express assertion for the fence.

## What this slice does NOT cover

- **Windows behaviour is not verified by this plan.** The junction claim is stated from
  knowledge of the platform, not measured here — no Windows machine was available. **The
  executor must treat it as unverified**: if `'junction'` fails, the correct outcome is
  the loud skip with a stated reason, NOT a silent pass and NOT deleting the case. Say so
  in Step 15 rather than papering over it.
- **Other symlink-dependent cases.** `tests/stack-detector.test.js:1373` uses a
  REGISTRATION gate rather than a body skip for a symlink-dependent case. That is a
  different file and a different mechanism; touching it here would put two slices on
  overlapping subjects. Left alone deliberately.
- **Hard links.** Not addressed, consistent with the residual stated in
  `src/lib/real-path-confinement.js:89–92`.

## Expected coverage effect, and the derivation

**On macOS and Linux: no change.** `fs.symlinkSync(..., 'dir')` already succeeds there,
so `symlinkMade` is true at `:143` and the catch is already driven.

**On Windows: one `statSync` catch branch in the workspace walk moves from unexercised
to exercised.** No percentage is quoted — the suite was not run when this was written,
and no Windows measurement exists to derive one from. Inventing a figure here would be
the defect this repository fences.

**The gain is portability of the number, not margin on the human's machine.** Stated
plainly in `00210` and repeated here so this slice is not mistaken for the margin that
plan concludes is unavailable.

## No test file is created — deliberately

This slice MODIFIES one existing test file and creates none, so it does not change the
top-level test-file count and does **not** require `CLAUDE.md` or
`tests/readme-numbers.test.js` in `files:`.

**If the executor finds it must create a file or edit anything outside the one declared
path, it must STOP and ask.** The `files:` list is the permission grant.

## Wiring — the live call sites

No new module. `detectStack` is already live, reached from `src/lib/init-project.js`
during project initialization. This slice adds a caller (a test) to reachable production
code.

## Execution Plan

### Step 8: TEST
Run `npm test` FIRST and record the per-file coverage line for
`src/lib/stack-detector.js` as the measured before-state. Then write the strengthened
case and prove it RED: temporarily remove the `statSync` catch in the workspace walk and
confirm the case fails (the walk aborts and express is dropped). Restore immediately.
**If the case is green with the catch removed, it is not testing the catch — report that
rather than banking it.**

### Step 9: PREPARE
Confirm `makeProject` and `removeTree` helpers already in the file are reused. Add no
dependency. Confirm nothing is written outside the temp root.

### Step 10: IMPLEMENT
Modify the case at `:139–158`. Sub-items: (a) platform-selected link type
(`'junction'` on `win32`, `'dir'` elsewhere); (b) replace the permissive assertion at
`:157` with a dangling-link precondition via `lstatSync(...).isSymbolicLink()`;
(c) a loud, stated skip if the link genuinely cannot be created; (d) the vacuity guard.
Touch no other case in the file.

### Step 11: REVIEW
Verify no path remains on which the case passes without the dangling child existing.
Verify the express assertion is retained and the new precondition is what carries the
branch claim. Verify no mocking of `fs` or `safe-fs`.

### Step 12: OPTIMIZE
Keep the case a single test. No sleeps, no retries — a retry turns a flaky check into a
slow check that lies.

### Step 13: SECURE
The link target stays inside the temp root. Assert `removeTree` cleans up the dangling
link (a `rm -rf` over a link must not follow it). No absolute path from the fixture
reaches an assertion message that could be logged.

### Step 14: VERIFY
`npm test` — lint, typecheck, ALL tests, coverage at or above the floor in
`.ctoc/coverage-baseline.json` (99), 0 skipped, 0 flaky. Record the AFTER per-file
coverage for `src/lib/stack-detector.js`. Run twice and record both values so the spread
is observed. **Do not change `minPct`.**

### Step 15: DOCUMENT
Record before/after coverage and both run values. **State explicitly whether the
junction claim was verified or remains unverified** — an unverified claim recorded as
verified is worse than the gap it closed.

### Step 16: FINAL-REVIEW
Confirm: no test file created; no source file modified; no path on which the case passes
without its fault occurring; `tests/stack-detector.test.js` untouched; `minPct`
untouched.
