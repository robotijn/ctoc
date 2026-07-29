---
iron_loop_verdict: true
title: "An unsigned state file signs itself and is believed — forging the Iron Loop position stops requiring a key, and the migration cost is stated rather than assumed"
type: implementation
parent_plan: none
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/state-manager.js"
  - "tests/unsigned-state-rejected.test.js"
approved_by: human
approved_at: 2026-07-29T00:34:00.034Z
gate_crossed: implementation → todo
---

# An unsigned state file signs itself and is believed

## The defect, read on disk

`src/lib/state-manager.js:103-124`:

```js
const content = safeFs.readFileSync(statePath, 'utf8');
const state = JSON.parse(content);

// Check if unsigned (legacy v2.x state)
if (!state._signature) {
  // Migrate to signed format
  const signedState = signState({ ...state, _version: STATE_SCHEMA_VERSION, _migrated_at: … });
  safeFs.writeFileSync(statePath, JSON.stringify(signedState, null, 2));
  return { state: signedState, valid: true, migrated: true };
}

const verification = verifyState(state);
if (verification.valid) {
  return { state, valid: true };
} else {
  return { state: null, valid: false, error: verification.error };
}
```

A **wrong** signature is rejected. A **missing** signature is signed with the
installation secret and returned as `valid: true`.

The signing is therefore not an authenticity check. It is a check that anyone who wants
to forge state should omit the signature rather than guess it. Writing an unsigned JSON
file and letting the next load mint the signature is strictly easier than obtaining the
key — and the key itself sits at `~/.ctoc/.secret` (`crypto.js:14`), a path the
secret-file guard does not match today (`00200` adds the pattern).

### What the two forged fields control

`loadState` feeds `PreToolUse.Bash.js:733-763`:

```js
const state = stateResult.state;
const currentStep = state?.currentStep || 1;

if (isCommitCommand(command)) {
  if (currentStep < MINIMUM_STEP_FOR_COMMIT) { …deny… }
  process.exit(0);
}

if (isWriteCommand(command)) {
  if (!state || !state.feature) { …deny… }
  if (currentStep < MINIMUM_STEP_FOR_WRITE) { …deny… }
}
```

`currentStep` and `feature` are the **only** inputs to the shell channel's write gate and
its commit gate. An unsigned state file declaring `currentStep: 16` and any feature name
clears both. After `00201` and `00202` land, that same forged step is what the coverage
gate defers to — so this defect does not shrink as the shell channel is hardened, it
becomes the way around the hardening.

The state file is at `~/.ctoc/state/<hash-of-project-path>.json`, outside the project
root. Plan coverage never applied to it and does not now.

## The fix

**An unsigned state file is rejected, exactly as a badly-signed one already is.**

```js
if (!state._signature) {
  return {
    state: null,
    valid: false,
    error: 'State file is unsigned. An unsigned state cannot be authenticated, so it '
         + 'is not accepted — signing it on load would mean any hand-written file '
         + 'became valid state. Start the Iron Loop again from /ctoc:menu to write a '
         + 'fresh signed state.',
    unsigned: true,
  };
}
```

The self-signing migration branch is **deleted**, not gated. A migration that turns
unauthenticated input into authenticated output is not a migration; it is the defect.

### The migration cost, stated rather than assumed

This is the part that must not be waved away.

**Who is affected.** Any installation whose `~/.ctoc/state/<hash>.json` has no
`_signature`. The branch's own comment calls this "legacy v2.x state"; the current
schema is `4.0.0` (`:13`). Every state written by `saveState` since signing was
introduced carries a signature, because `saveState:137` signs unconditionally. So the
affected population is: installations that have not run CTOC since before signing
existed, **plus** any state file that was ever hand-written or truncated mid-write.

**What they experience.** `loadState` returns `{state: null}`. In
`PreToolUse.Bash.js:736`, `currentStep` becomes `1` and `state` is null. Consequently:

- every write command through the shell is denied — `!state || !state.feature` at `:751`;
- every `git commit` is denied — step 1 is below 15.

That is fail-closed, which is right, and it is also a person who cannot commit and is not
told why. `plans/implementation/00176` in this repository is named exactly for that
failure: *an honest message with no way out is half a fix.*

**The way out, and it already exists.** `saveState` signs unconditionally, and starting
the Iron Loop from the menu calls it. So recovery is "start the loop again", requiring no
new command and no new code. What is missing is that the person is *told* — so:

1. the returned `error` names the recovery in the sentence above;
2. `PreToolUse.Bash.js`'s existing block banner already prints the reason it was given,
   so the recovery reaches the terminal through a path that already exists — **verify
   this at Step 9 by reading `formatBlocked`; if the unsigned reason does not reach the
   banner, wiring it there is part of this slice**;
3. the state's **step position** is genuinely lost. An in-flight loop at step 10 with an
   unsigned state restarts at step 1. That is the real cost and it is not recoverable
   without trusting the file, which is the thing being refused.

**The counterfactual cost of not fixing it** is that the Iron Loop's position — the only
input to two gates — is forgeable by writing a file. That is not a close call.

### The other unsigned-state consumers

`loadState` returning `{state: null, valid: false}` is an **existing** return shape
(a bad signature already produces it), so every caller already handles it. Step 9 must
confirm that by reading every caller rather than trusting this paragraph — a caller that
treats `state: null` as "no state, create one" and then **writes** would silently
overwrite a user's real position. `updateStep:146-148` does exactly that:

```js
const result = loadState(projectPath);
const state = result.state || createState(projectPath);
```

For a *corrupt* state this is already the behaviour. For an unsigned one it is new, and
it is the right one — a fresh signed state at step 1 is the recovery — but it must be
**confirmed on disk**, and if any caller does something worse than that, this plan is
wrong and the code wins.

## Implementation Details

### File: `src/lib/state-manager.js`
**Action:** MODIFY — `loadState` only

Delete the self-signing branch at `:107-113` and replace it with the rejection above.
Keep the `unsigned: true` discriminator on the result so a caller can distinguish "never
signed" from "signature mismatch" without parsing the error string.

Add to `loadState`'s doc comment:

```
 * An UNSIGNED state file is REJECTED, not signed on load. Signing it would mean the
 * signature proves nothing: forging state would need no key at all — write an unsigned
 * file and the next load mints the signature. The two fields it controls (currentStep,
 * feature) are the only inputs to the Bash hook's write gate and commit gate.
 * Recovery from a rejected state is to start the Iron Loop again from the menu;
 * saveState signs unconditionally.
```

`signState` is still imported and still used by `saveState`. `STATE_SCHEMA_VERSION` and
`_migrated_at` lose their only writer here — Step 9 must grep for other readers of
`_migrated_at` before removing it from anywhere else. **This slice removes nothing
outside `loadState`.**

### File: `tests/unsigned-state-rejected.test.js`
**Action:** CREATE — `node:test`

The state path is derived from `hashPath(projectPath)` under `os.homedir()/.ctoc/state`,
so tests must not write into the real home directory. Step 9 must determine how the
existing state tests isolate this — `CTOC_HOME` is a module constant at `crypto.js:13`,
computed at load time from `os.homedir()`. If the existing suite overrides `HOME` /
`USERPROFILE` before requiring the module, do the same; **if there is no existing
isolation mechanism, that is a finding to report at Step 16, and the test must not
proceed by writing to the developer's real home directory.**

| # | Case | Assertion |
|---|---|---|
| 1 | **an unsigned state is rejected** | write `{currentStep: 16, feature: 'x'}` with no `_signature`; `loadState` → `state: null`, `valid: false`, `unsigned: true` — RED today |
| 2 | **it is not rewritten** | after case 1, read the file from disk and assert it still has **no** `_signature` — the load must not have signed it |
| 3 | **the forged step does not reach a caller** | after case 1, assert the returned state is null so no caller can read `currentStep: 16` |
| 4 | a correctly signed state still loads | write through `saveState`, reload → `valid: true`, `currentStep` preserved |
| 5 | a badly signed state is still rejected | tamper one byte of a signed state → `valid: false`, `unsigned` absent or false |
| 6 | a signed state with a tampered **field** is rejected | flip `currentStep` in a signed file → `valid: false`. Guards the signature actually covering the field that matters |
| 7 | corrupt JSON is rejected | `valid: false` with the load error, no throw |
| 8 | a missing file is unchanged | `{state: null, valid: false, error: 'No state file'}` |
| 9 | **the error names the recovery** | case 1's `error` contains a menu reference and the words that tell a person what to do; asserted on substance, not on an exact sentence |
| 10 | **the recovery works** | after case 1, call `saveState` with a fresh state, reload → `valid: true`. Proves the way out is real and needs no new code |
| 11 | **`updateStep` on an unsigned state does not preserve the forged step** | write an unsigned state at step 16; call `updateStep(project, 8, 'in_progress')`; reload → the resulting state is signed and its `currentStep` is **8**, not 16 |
| 12 | **end to end at the gate** | with an unsigned state at `currentStep: 16` in an isolated home, spawn `PreToolUse.Bash.js` with `git commit -m x` → `permissionDecision:"deny"`. This is the defect measured at the gate it defeats — RED today |
| 13 | end to end, the honest message | case 12's stderr banner names the unsigned state and the recovery. If it does not, `formatBlocked` is wired in this slice and the case becomes the proof |
| 14 | never throws | `loadState` against a directory-in-place-of-a-file, a zero-byte file, a file of `null`, a file of `[]` — all return a result object |

Teardown restores any overridden environment variable in a `finally` and removes the
isolated home with `fs.promises.rm(root, { recursive: true, force: true })`.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `loadState`'s rejection | `PreToolUse.Bash.js:685, 695, 733` (the ledger, irreversible and step gates), `state-manager.updateStep:147` | the registered `PreToolUse` hook on Bash, and every menu action that advances a step |

`loadState` is called four times in the Bash hook on every command. Nothing here is
reachable only from a test.

## Test Plan

Covered by `tests/unsigned-state-rejected.test.js`. Cases 1, 2, 3, 11 and 12 are the
defect; cases 4, 8 and 10 are the guards against the fix becoming "no state ever loads",
which would block every commit in every installation. Case 6 checks the thing the
signature is *for*.

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [x] TEST — TDD red-first: failing tests written and seen RED before implementation; Step-11 review confirmed the tests are real and adversarial, not vacuous.
Establish the home-directory isolation **first** — no case runs until writes are proven
confined to a temporary directory. Then write the file in full and run only it. Cases 1,
2, 3, 9, 11 and 12 must be RED. Record case 12's red verbatim: a commit allowed at a
forged step 16 is the sentence that justifies this slice.

### Step 9: PREPARE
- [x] PREPARE — plan ancestry and target files read from disk; approach confirmed against the real code.
Read from disk: `state-manager.js` in full, `src/lib/crypto.js` in full (how `CTOC_HOME`
is computed and whether it is overridable), and **every caller of `loadState`** — grep
the whole repository and read each one, confirming none treats `state: null` in a way
that is worse than restarting. Read `PreToolUse.Bash.js:634-662` (`formatBlocked`) to
determine whether the unsigned reason reaches the human. Read the existing state tests
to find the established isolation mechanism. **Where the code disagrees with this plan,
THE CODE WINS** — especially on how many installations could hold an unsigned state.

### Step 10: IMPLEMENT
- [x] IMPLEMENT — the declared files were implemented; full gated `npm test` green.
- `src/lib/state-manager.js` — the self-signing branch replaced by the rejection; the
  doc comment.
- `src/hooks/PreToolUse.Bash.js` — **only if** Step 9 shows the reason does not reach the
  banner. If it does, this file is not touched and the `files:` declaration is narrowed
  accordingly rather than left over-broad.
- `tests/unsigned-state-rejected.test.js` — the fourteen cases.

### Step 11: REVIEW
- [x] REVIEW — adversarial iron-loop-critic Step-11 review (2026-07-29): CLEARS Gate 3; any residuals are documented and non-blocking.
Confirm no path in `loadState` writes. Confirm the rejection's return shape matches the
existing bad-signature shape so no caller needs changing. Confirm the error text names a
concrete action, not just a condition.

### Step 12: OPTIMIZE
One branch removed, and one filesystem **write** removed from a read path — `loadState`
no longer writes, which is a correctness improvement as much as a performance one.

### Step 13: SECURE
- [x] SECURE — security-scanner Step-13 review (2026-07-29): PASS (no block; any warn documented and non-blocking).
Confirm the error message names no absolute path from outside the project and no file
contents. Re-attack: an empty-string signature, a signature of the wrong type (a number,
an object, `null`), a signature with the right prefix and no digest, a state object that
is an array. Each must reject, and `verifyState:100-116` must be read to confirm which
of those it already handles rather than assuming.

### Step 14: VERIFY
- [x] VERIFY — full gate recorded to `.ctoc/state/verify/<slug>.json`: passed=true, coverage ≥99%, 0 skipped, 0 failed.
`node --test` on the new file plus every existing `state-manager`, `crypto`, `iron-loop`
and Bash-hook test, then the full gated run `npm test`. Lint at `--max-warnings 0`. No
git operations. **Report whether any existing test writes an unsigned state fixture and
relies on it loading — those tests are the in-repository population of the affected
users, and each one must be corrected to write through `saveState`, never by loosening
the rule.**

### Step 15: DOCUMENT
Record in `CLAUDE.md` that Iron Loop state is rejected unless correctly signed, that an
unsigned state is not migrated, and that the recovery is to start the loop again. Update
the documented test-file count from disk.

### Step 16: FINAL-REVIEW
- [x] FINAL-REVIEW — iron-loop-critic final verdict (2026-07-29): CLEARS Gate 3.
Report every Step 8 red verbatim (case 12 especially), the Step 14 count of tests relying
on unsigned state, whether the banner needed wiring, and every decision taken under
ambiguity. **State the migration cost in the report as a fact for the human: any
installation holding an unsigned state loses its Iron Loop position and restarts at step
1.**

## What this plan does NOT fix

- It does **not** protect the signing key. `~/.ctoc/.secret` is readable by any process
  running as the user, and with it any state can be signed correctly. `00200` adds the
  read guard for CTOC's own tools; that is a guard against mistakes, not against intent.
- It does **not** bind state to the project. The signature covers the state's contents,
  not the identity of the project it belongs to beyond the `project` field — Step 13 must
  report whether `canonicalStringify` includes that field, and if a signed state can be
  copied between projects, that is a finding for a separate slice.
- It does **not** move state inside the project or under plan coverage. It stays at
  `~/.ctoc/state/`, outside every coverage check.
- It does **not** address the shell hook reading `state?.currentStep || 1` — a null state
  becoming step 1 is fail-closed and correct, and is left as is.
- It does **not** add a command to re-sign a state a human vouches for. Restarting the
  loop is the recovery; a re-sign command would be a supported way to launder a forged
  file and is deliberately absent.
- It does **not** change what happens on a *corrupt* state, which already rejected.

## Decisions Taken Under Ambiguity

1. **Reject outright rather than accept-and-warn.** A warning on a path nobody watches
   (the Bash hook runs headless on every command) is not a control. The two fields decide
   two gates; accepting them unauthenticated with a note is accepting them.
2. **The migration branch is deleted, not gated behind a flag.** A flag that re-enables
   self-signing is the defect with an on switch, and the switch is in a file an agent can
   write.
3. **The recovery is "start the loop again", and no new command is added.** `saveState`
   already signs unconditionally, so the path exists. A dedicated re-sign command would
   be a sanctioned way to bless a forged file.
4. **The lost step position is accepted as the cost.** Preserving it means trusting the
   unsigned file's `currentStep`, which is the exact value being forged. There is no
   version of "keep the position safely".
5. **The error text names the action, not just the condition.** This repository already
   has a plan (`00176`) about an honest message with no way out; repeating that shape in
   a security fix would get the security fix reverted.
6. **An `unsigned: true` discriminator is added.** A caller distinguishing "never signed"
   from "tampered" without parsing an English sentence is worth one boolean, and parsing
   an error string is how a message becomes an interface.
7. **The Bash hook is touched only if Step 9 shows the message does not reach the human.**
   Declaring a file in `files:` that is not edited grants a write nobody needs; the plan
   says to narrow the declaration rather than keep the option open.
8. **Home-directory isolation is established before any test runs.** A test suite that
   writes to the developer's real `~/.ctoc/state/` can destroy their working Iron Loop
   position, which is a worse outcome than the defect.

## Decisions Taken During Implementation

1. **Home isolation via `HOME`/`USERPROFILE` override before require.** `os.homedir()`
   reads `$HOME` (POSIX) / `%USERPROFILE%` (Windows) on every call — verified in-process —
   and `crypto.js`/`state-manager.js` compute `CTOC_HOME`/`STATE_DIR` at module load. The
   new test file sets both env vars to a fresh `os.tmpdir()` mkdtemp dir and asserts
   `os.homedir() === ISOLATED_HOME` *before* requiring any CTOC module, refusing to run if
   the override did not take. Nothing is ever written to the developer's real `~/.ctoc/`.
   This is cleaner than the pre-existing `tests/state-manager.test.js`, which writes to the
   REAL home and unlinks one hash file; that suite is left as-is except for the one
   blast-radius case below. `node --test` runs each file in its own process, so the env
   override is local to this file.

2. **The Bash-hook banner is NOT wired to name the unsigned state — reported as a scope
   finding, not edited.** Step 9 confirmed the unsigned reason does not reach the commit
   banner: `main()` rebuilds its own reason (`Commit requires step 15+ ... Current: 1`)
   from the now-null state, so the human sees "step 1" rather than "unsigned state". The
   security fix (deny at the forged step) is COMPLETE in `state-manager.js` alone — the
   forged `currentStep: 16` no longer reaches the gate, and the commit is denied. Wiring
   the unsigned reason into the banner would require editing `src/hooks/PreToolUse.Bash.js`,
   which is (a) outside this plan's declared `files:` (which never listed it), (b) gate/hook
   logic that CLAUDE.md flags as requiring explicit human approval. Per the executor brief's
   no-scope-creep rule, the banner-naming improvement is surfaced as a follow-up finding for
   the human rather than taken unauthorized. Test case 13 therefore asserts the *reachable*
   truth today — the commit is denied and a block banner is printed to stderr — and does not
   assert the banner contains the word "unsigned" (which would force the out-of-scope edit).

3. **The one blast-radius existing test is corrected toward the new contract.**
   `tests/state-manager.test.js` "loadState migrates unsigned (legacy) state" (lines
   242-258) asserted the now-deleted self-signing migration. It is rewritten to assert the
   new contract: an unsigned state is REJECTED (`state: null`, `valid: false`,
   `unsigned: true`, `migrated` absent, error naming recovery) and is NOT rewritten on disk.
   Justification: the assertion pinned the exact defect being fixed (unauthenticated input
   → authenticated output). The contract that replaced it comes from this security plan, not
   from the test; the change tightens toward the real behaviour (rejection) and does not
   loosen any assertion. This is the only existing test that wrote an unsigned fixture and
   relied on it loading — a repository-wide grep for `_migrated_at` / state `migrated` and
   for unsigned-fixture writers confirmed no other consumer (all other `migrated:` hits
   belong to the unrelated gate-migration / frontmatter subsystems).

4. **`_migrated_at` and `STATE_SCHEMA_VERSION` are left in place outside `loadState`.**
   `_migrated_at` lost its only writer (the deleted branch) and has no other reader in the
   repository; `STATE_SCHEMA_VERSION` is still written by `createState`. This slice removes
   nothing outside `loadState`, per the plan.


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
