---
approved_by: human
approved_at: 2026-07-20T11:56:02.787Z
gate_crossed: implementation → todo
---

---
title: "An honest message with no way out is half a fix — setup retries instead of narrating"
type: implementation
parent_plan: none
depends_on: 00175-a-session-that-cannot-identify-a-project-invents-one
priority: CRITICAL
program: resolution-and-setup-tell-the-truth
iron_loop: true
files:
  - "src/commands/start.js"
  - "tests/menu-repairs-what-it-reports-missing.test.js"
  - "CLAUDE.md"
  - "tests/menu-reports-what-init-did.test.js"
  - "tests/menu-auto-init.test.js"
  - "tests/menu-coverage.test.js"
scope_extension:
  authorized_by: human
  authorized_at: 2026-07-21
  reason: >
    Filename correction + count bump. The plan declared src/commands/menu.js,
    which no longer exists: the command was renamed menu.js -> start.js this
    session (v6.13.7), and the whole setup body (ensureInitialized, verifySetup,
    setupMessage, the "Nothing here will work properly" message, the
    fails-open-to-a-message comment) lives in start.js. The executor verified the
    defect is real and present at start.js:744 (init attempted only when .ctoc/ is
    entirely absent), refused to touch a file outside its literal grant, and
    refused to alias a non-existent path. Corrected the target and added CLAUDE.md
    for the test-file-count bump (448 -> 449) that adding this plan's test file
    forces.
    CONTRACT-INVERSION AUTHORIZED (human, 2026-07-21, Design A): the repair makes
    a bare/partial .ctoc/ end up genuinely set up (real artifacts created), which
    inverts seven assertions across three sibling test files that a prior shipped
    fix set (a bare .ctoc/ reads "not set up"). The prior fix's PRINCIPLE survives
    — the marker no longer stands in for proof because real proof is now created —
    but its intermediate-state assertions flip. The human chose to invert them
    (each with the three-part justification) over narrowing the repair, which
    would reopen the setup dead end. Message wording unchanged ("CTOC is set up
    for this project") to touch the fewest tests. Grant extended to the three
    sibling files so the inversions are in-scope.
---

# An honest message with no way out is half a fix

This slice repairs a dead end that a slice landing hours earlier CREATED, and the
authorship is worth stating plainly because it is the lesson.

`plans/review/00156-the-menu-never-claims-it-set-up-a-project-it-did-not.md`
replaced a lie — "CTOC initialized for this project", printed regardless of what
happened — with a read-back. That was right, and it is not being undone. But the
read-back was wired to a REPORTING site and not to a REPAIR site. The menu now
correctly says the project is not set up and that nothing will work until it is
fixed, and then offers no way to fix it, on every open, forever.

**A lie was converted into a dead end.** The repair path was never checked to see
whether it could still fire. It cannot.

## The mechanism, verified in code

Two halves, both verified directly.

**Half one — the trigger is an existence check on the directory, not on the
setup.** `src/commands/menu.js:725`:

```js
if (!safeFs.existsSync(path.join(root, '.ctoc'))) {
  attempted = true;
  // ... initProject(root)
}
```

Initialisation is attempted only when the configuration directory is **entirely
absent**.

**Half two — that directory gets created by something else first.**
`src/hooks/PreToolUse.Write.js:131-142`, inside `appendLog`, on the advisory
duplicate-guard path:

```js
const logDir = path.join(projectPath, '.ctoc', 'logs');
safeFs.mkdirSync(logDir, { recursive: true });
```

`recursive: true` creates the parent. This runs on a Write — before the human has
ever opened the menu.

**The result:** one Write, `.ctoc/` exists, and `ensureInitialized` never attempts
initialisation again for the life of the project. The read-back at `:739` then
correctly reports every required artifact as missing, `setupMessage` at `:753-764`
correctly renders

> CTOC is not fully set up for this project. Missing: … Nothing here will work
> properly until that is fixed.

and there is no code path anywhere that would fix it. The project is
**permanently uninitialisable**.

## The decision this slice settles: what triggers initialisation

The obvious answer — attempt when the read-back says something is missing — has a
real cost the brief names: initialisation would then run on **every menu open** in
a broken project. That is only acceptable if it is idempotent and safe to re-run.
**The brief says verify rather than assume, so it was verified, function by
function, and the answer is a qualified yes.**

| write in `initProject` | guard | re-run safe? |
|---|---|---|
| `CLAUDE.md` (`:592`) | `!existsSync \|\| force` | yes — skipped when present |
| operating-lessons block (`:623-637`) | hash-compared by `ensureLessonsBlock` (`claude-md-lessons.js:241+`) | yes — no write when the hash matches |
| operating-manual block (`:639-660`) | `res.action !== 'unchanged'` | yes |
| `IRON_LOOP.md` (`:666`) | `!existsSync \|\| force` | yes |
| plan directories (`:682`) | `!existsSync` per directory | yes |
| `.ctoc/settings.yaml` (`:692`) | `!existsSync \|\| force` | yes |
| `.ctoc/state/iron-loop.yaml` (`:705`) | `!existsSync \|\| force` | yes |
| `.git/hooks/post-commit` (`:734-746`) | sentinel-checked by `installPostCommitHook` (`hooks-installer.js:639-646`) | yes — returns `skipped` when already installed |
| **`.gitignore` append (`:716-727`)** | `!includes('.ctoc/logs/') \|\| !includes('.ctoc/state/')` | **one wart, see below** |

`force` is never set from this call site, so nothing is ever overwritten.

**The one wart, named honestly:** the `.gitignore` guard is a disjunction. A file
containing `.ctoc/logs/` but not `.ctoc/state/` gets the whole block appended
again, duplicating the `.ctoc/logs/` line. It **converges** — after that one
append both strings are present and it never fires again — so re-running cannot
grow the file without bound. A duplicate line in `.gitignore` is inert to git.
This slice does not fix it (it is outside the declared files) and records it so it
is not re-discovered as a mystery.

**Chosen trigger: attempt initialisation whenever the read-back reports anything
missing.**

The existence of `.ctoc/` stops being the trigger entirely. It was never evidence
of anything — it is a directory any code can create, and slice three shows two
places that do. The read-back is already computed on both paths (a decision
recorded as number 10 in the sibling plan), so the trigger keys on the same value
the message already keys on. **One truth value, one decision, one message.**

**Explicitly rejected: an attempt-marker file.** A file recording "we already
tried" would avoid the repeated attempt, and it would be a new un-evidenced marker
gating setup — the precise defect class this whole program exists to delete. The
filesystem read-back stays the only state.

**Cost, stated rather than hidden:** on a broken project, every menu open performs
one `initProject` pass — roughly a dozen `existsSync` calls, plus a template
render only for artifacts genuinely absent. On a healthy project nothing is
attempted, because nothing is missing. The read-back that decides this already
runs on every open today.

## The decision this slice settles: what the human is told

The current message describes the problem correctly and gives no action. It gains
the missing half. Four states, four sentences:

| state | message |
|---|---|
| `ok`, nothing was attempted | *silence* — a healthy project says nothing, unchanged |
| `ok`, an attempt was made | `CTOC is set up for this project.` — unchanged |
| an attempt was made and it **repaired** what was missing | `CTOC finished setting up this project.` (with what was created) |
| an attempt was made and something is **still** missing | `CTOC tried to set up this project and could not finish. Still missing: <list>.` plus the reason when one exists, plus the one concrete action |

The fourth is the one that matters, because it is the only state a human must act
on. It now follows a genuine repair attempt, so it means something it could not
mean before: **CTOC tried, here is what remains, here is what to do.** A message
that reports a failure the code never attempted to avoid is narration.

The action named is a real one derived from `reason` — a permissions or ownership
failure on `.ctoc/` is the realistic cause once automatic repair is in place, and
that is a thing a human can fix. Where `reason` is null and artifacts are still
missing, the message says so rather than inventing a cause.

## Implementation Details

### File: `src/commands/menu.js`
**Action:** MODIFY
**Purpose:** The menu repairs what it reports missing, instead of reporting it
forever.
**Change Type:** modify-existing — one guard, one message function

#### Change 1 — the trigger becomes the read-back (`:718-741`)

`ensureInitialized` runs `verifySetup` FIRST, and attempts initialisation when
that pre-check reports anything missing — replacing the
`!existsSync(path.join(root, '.ctoc'))` guard at `:725` entirely. It then runs
`verifySetup` a second time to produce the verdict, exactly as it does today.

The returned shape gains one field and keeps every existing one, so the sibling
plan's contract and its tests hold:

```js
{ attempted, ok, created, skipped, missing, reason,
  missingBefore }   // NEW — what the pre-check found, so a repair is provable
```

`missingBefore` is what makes "it repaired something" a fact rather than an
inference: a non-empty `missingBefore` with an empty `missing` is a repair that
demonstrably happened, read back from disk on both sides.

#### Change 2 — the message gains its action (`:753-764`)

`setupMessage` gains the repaired branch and the action clause. It stays a pure
function of the verdict and stays the single source for both render sites (the
interactive screen and the non-interactive JSON screen), which is the anti-drift
measure the sibling slice established and this slice preserves.

Fail-open is preserved unchanged: a setup problem produces a MESSAGE, never a
refusal to render. `ensureInitialized` still catches, still records `reason`, and
still returns `attempted: true, ok: false`.

#### What is deliberately NOT changed

`verifySetup` and `complianceAnchorUsable` (`:650-693`) are correct and are left
alone. The sibling slice's execution record documents that its first read-back was
vacuous and was replaced with a two-part check against the reader of record AND
the writer's targetability precondition. That work stands.

### Wiring — the live call sites

| new code | live call site | root |
|---|---|---|
| the read-back trigger | `ensureInitialized`, called by `menu.js` `main()` — its existing call site | every open of the declared entry point |
| `missingBefore` | `setupMessage`, called from both render sites in `main()` | same |

No new module, no new export. Both functions already exist and already run on
every menu open.

## Test Plan

### Tests: `tests/menu-repairs-what-it-reports-missing.test.js`
**Action:** CREATE
**Framework:** `node:test`

The sibling slice's `tests/menu-reports-what-init-did.test.js` stays and must stay
green — it pins that the menu never claims an action it did not take, and nothing
here weakens that.

| # | Case | Fixture | Assertion |
|---|---|---|---|
| 1 | **the dead end is reachable, and is a dead end** | empty directory, then create ONLY `.ctoc/logs/` exactly as the Write hook does, then drive the menu TWICE | this case is written to be RED. Today: `ok` false on both opens and `.ctoc/settings.yaml` never appears. After: the first open repairs it |
| 2 | **a bare `.ctoc` directory is repaired, not narrated** | directory holding an empty `.ctoc/` | `attempted` true, `ok` true, and `.ctoc/settings.yaml` EXISTS on disk afterwards |
| 3 | **the repair is provable, not inferred** | case 2 | `missingBefore` is non-empty, `missing` is empty, and the message names the repair |
| 4 | **a genuinely empty directory still initialises** | empty temp directory | unchanged behaviour — `ok` true, artifacts on disk |
| 5 | **re-running is idempotent** | case 2's directory, menu driven THREE times | `settings.yaml` byte-identical after runs 2 and 3; `.gitignore` (seeded with `.ctoc/logs/` only) gains its CTOC block at most ONCE more — this pins the wart named above so it can never grow |
| 6 | **a healthy project attempts nothing** | fully initialised fixture | `attempted` false, `created` empty, message null |
| 7 | **an unrepairable failure names what remains AND an action** | a fixture where the settings write fails at its real source through the `safe-fs` seam | `ok` false, the message names `.ctoc/settings.yaml`, and contains a concrete action — not only a description |
| 8 | **a partial world is repaired partially and reported exactly** | initialised fixture with `plans/review/` deleted and `settings.yaml` intact | the directory is recreated; `settings.yaml` is NOT rewritten (compare bytes); the message reports success |
| 9 | **an anchorless settings file is still caught** | settings file with no usable `active_profiles:` anchor | `ok` false — the sibling slice's two-part check still governs, and this slice did not loosen it |
| 10 | **a throwing initialisation is attempted-and-failed** | force `initProject` to throw through the require-cache seam | `attempted` true, `ok` false, `reason` non-empty, and the screen still renders |
| 11 | **the dashboard renders in every broken fixture** | cases 1, 2, 7 and 10 | a non-empty screen containing its ordinary sections; nothing is bricked |
| 12 | **no absolute path and no stack frame reaches the screen** | case 7 and case 10 | the message contains neither the temp root nor the string `at ` from a stack frame |
| 13 | **a nested repository is set up as itself** | outer CTOC project, inner directory with `.git/`, menu driven in the inner one | the inner repository gets its own `.ctoc/settings.yaml`; the outer project's artifacts are untouched |
| 14 | **end to end, as a human runs it** | spawn `node src/commands/menu.js` with `cwd` set to a directory holding only `.ctoc/logs/`, then read the directory | stdout and the filesystem AGREE — the announcement and the artifacts match |

Case 1 is the reproduction of the reported defect and case 14 is the one that
measures what a person actually gets. Case 5 exists because this slice's whole
change is "run this repeatedly", and an idempotency claim asserted in prose and
not in a test is an assumption.

Cross-platform: `path.join`, `os.tmpdir()`, `fs.promises.rm` teardown. Case 7 uses
the `safe-fs` seam in-process; case 14 uses a broken world that survives a process
boundary (a directory holding only `.ctoc/logs/`), because an in-process
monkeypatch does not cross into a child — a correction the sibling slice recorded
after its own plan got this wrong.

## What this slice does NOT fix

- **The two hooks that create `.ctoc/` as a side effect.** Slice three. This slice
  makes their side effect harmless to setup; it does not stop them creating it,
  and a log directory manufacturing the marker that gates setup remains wrong on
  its own terms even once nothing keys on it.
- **The session hook's fabrication of the plan tree.** Slice one.
- **The three private root resolvers.** Slices four and five. Note the
  interaction: if the menu resolves to an over-rooted ancestor, this slice will
  cheerfully repair the WRONG project. It reads the root it is given.
- **The `.gitignore` duplicate-append wart.** Named above, converges, outside the
  declared files. Case 5 pins that it cannot grow.
- **`initProject`'s dry run reporting files as created that it did not write.**
  Still open, carried from the sibling plan.
- **The git post-commit hook installed without consent.** Still open, carried from
  the sibling plan — and this slice makes it fire on more occasions, since
  initialisation now runs whenever setup is incomplete. Recorded as a real
  consequence rather than discovered later; the sentinel check makes it a no-op
  after the first install.
- **Whether the generated settings are correct.** Only whether they exist, parse,
  and carry a writable anchor.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/menu-repairs-what-it-reports-missing.test.js` in full, run ONLY that file, record the red output verbatim. Cases 1, 2, 3 and 14 MUST be red. Any case green before implementation exists must be individually shown to be already-correct behaviour rather than a vacuous assertion, and the finding written down — the sibling slice found a vacuous read-back by exactly this means and it is the highest-value habit in this program.
### Step 9: PREPARE — re-read from disk: `src/commands/menu.js:595-765` in full (the landed code WINS over this plan's line numbers); `src/lib/init-project.js:572-749` to re-confirm every write is `!existsSync || force` guarded and that `force` is not set from this call site; `src/lib/hooks-installer.js:624-660` and `src/lib/claude-md-lessons.js:241+` for the two sentinel/hash idempotency claims made in the table above. If any claim in that table no longer holds, the trigger decision must be revisited before implementing — it is the load-bearing input.
### Step 10: IMPLEMENT — one step, files as sub-items.
  - `src/commands/menu.js` — Changes 1 and 2.
### Step 11: REVIEW — confirm no path renders a success sentence without `ok === true`. Confirm the failure message ALWAYS carries an action, with no branch producing a description alone. Confirm `verifySetup` and `complianceAnchorUsable` are unmodified. Confirm the sibling slice's test file still passes unchanged, since its contract is the fence around this one.
### Step 12: OPTIMIZE — the pre-check read-back is the same dozen `existsSync` calls plus one small parse that already run today; the second read-back runs only when an attempt was made. Confirm a healthy project performs exactly ONE read-back and no initialisation pass, and measure the added cost on a broken project.
### Step 13: SECURE — `missing` holds project-relative display paths only. Confirm `reason` is truncated and carries no absolute path and no stack frame into the message (case 12). Confirm the action clause names a path relative to the project.
### Step 14: VERIFY — `node --test tests/menu-repairs-what-it-reports-missing.test.js tests/menu-reports-what-init-did.test.js tests/menu-auto-init.test.js tests/menu-coverage.test.js tests/init-project.test.js tests/e2e-menu-lifecycle.test.js tests/fresh-repository-is-its-own-project.test.js` green, then the full gated run `npm test`. Lint the changed file. No git operations.
### Step 15: DOCUMENT — a JavaScript doc on `ensureInitialized` stating the rule: the trigger for setup is the read-back, never the existence of a directory any code can create; and a surface that reports a fixable problem must attempt the fix. Name the dead end, its date, and the slice that created it.
### Step 16: FINAL-REVIEW — report, verbatim, what the human reads on the exact reproduction fixture (a directory holding only `.ctoc/logs/`) BEFORE and AFTER, across two consecutive opens. Report every decision taken under ambiguity.

## Decisions Taken Under Ambiguity

1. **The trigger becomes the read-back; the `.ctoc` existence check is deleted
   outright.** A directory that any hook can create was never evidence of setup.
   The value the message already keys on is the value the decision keys on.
2. **Re-runnability was verified line by line, not assumed.** Every write in
   `initProject` is `!existsSync || force` guarded, the hook install is
   sentinel-guarded and the lessons block is hash-guarded. This is the input the
   whole decision rests on, so Step 9 re-verifies it against the landed code
   before implementation proceeds.
3. **The `.gitignore` disjunctive guard is a real wart, is recorded, and is not
   fixed here.** It converges after one duplicate line and is outside the declared
   files. Test case 5 pins that it cannot grow, so the decision to leave it is
   defended by a test rather than by a promise.
4. **No attempt-marker file.** It would fix the repeated attempt by introducing a
   new un-evidenced marker gating setup — the exact defect class under repair.
5. **The repeated-attempt cost is accepted and stated.** One `existsSync`-guarded
   pass per open, on broken projects only. Nothing is attempted on a healthy one.
6. **A repair is proved by `missingBefore` plus `missing`, both read from disk.**
   Reporting a repair from `initProject`'s `created` list would report an intention
   to write, which is the failure mode the sibling slice was built to kill.
7. **The failure message must always carry an action.** The dead end was not
   caused by inaccuracy — the message was accurate. It was caused by an accurate
   message with nothing to do about it, and accuracy without an action is the
   half-fix this slice exists to complete.
8. **The action is derived from `reason` where one exists, and the absence of a
   cause is stated rather than filled in.** Inventing a plausible cause would be
   the same class of untruth in a new place.
9. **`verifySetup` and `complianceAnchorUsable` are untouched.** Their two-part
   check against the reader of record and the writer's targetability precondition
   is correct and hard-won; this slice changes when setup runs, never what
   "set up" means.
10. **The git-hook install now fires on more occasions, and that is recorded
    up front rather than discovered later.** The sentinel makes it a no-op after
    the first install, and consent for it remains an open item from the sibling
    plan.

### Decisions taken during execution (Steps 8-16)

11. **The declared file was stale: the whole setup body lives in
    `src/commands/start.js`, not `src/commands/menu.js`.** The plan predated the
    `menu.js` → `start.js` rename (the `/ctoc:menu` → `/ctoc:start` command
    rename, `v6.13.7`). `menu.js` does not exist on disk; `ensureInitialized`,
    `verifySetup`, `setupMessage`, `complianceAnchorUsable` and the "Nothing here
    will work properly" message are all in `start.js`. The trigger the plan cites
    at `:725` was confirmed present in the landed code as the
    `!safeFs.existsSync(path.join(root, '.ctoc'))` guard. The grant was
    re-stamped by the human to point at `start.js` before any edit.

12. **Design A wording was chosen over the plan's "CTOC finished setting up"
    branch, by human decision.** Under the read-back trigger, `attempted` is true
    ONLY when something was missing, so every `ok && attempted` outcome is a
    repair — the plan's four-state message table collapses, and a distinct
    "finished setting up" sentence would additionally break two existing
    assertions that pin the success wording (`menu-coverage` line `819` and
    `menu-reports` case `12`). `ok && attempted` therefore keeps the single honest
    sentence `CTOC is set up for this project.` for first-time setup and repair
    alike, and those two assertions did NOT need inverting.

13. **The repair inverts a deliberately-established contract in three sibling test
    files, not the one the plan named — surfaced, authorized, then inverted with
    justification.** The sibling slice pinned "a bare `.ctoc/` is a marker, not a
    set-up project → `ok:false`, no re-init" as a hard contract. The repair makes
    that identical fixture repair to `ok:true`, so five cases across
    `tests/menu-reports-what-init-did.test.js` (`7`, `10`, `13`),
    `tests/menu-auto-init.test.js` (the no-op case) and `tests/menu-coverage.test.js`
    (the "kills init-always mutant" case) had to invert. Each carries the
    three-part justification inline: the contract from outside the test is the
    human-approved `00176` repair; the prior assertion pinned an intermediate
    un-repaired state `00176` eliminates while its PRINCIPLE (a marker must not
    stand in for proof) is preserved and strengthened by creating real proof; and
    the named cases newly fail. The two "no re-init" guards were RE-POINTED at a
    fully-seeded healthy project (which still yields `attempted:false`,
    `created:[]`) so their intent survives and the init-always mutant stays dead —
    they were not deleted. The plan's Step 11 claim that the sibling file "still
    passes unchanged" was wrong and is corrected here.

14. **`missingBefore` was added to the verdict shape; no other field changed.**
    It makes a repair provable from disk on both sides (non-empty `missingBefore`
    with empty `missing`), per decision `6`. Existing consumers read the same
    fields they always did.

15. **`reason` is sanitized at the render seam by `sanitizeReason`, not only at
    its source.** The `failed`-path reason is already scrubbed inside
    `init-project.js`, but the catch-path reason is raw. `sanitizeReason` strips
    absolute POSIX and Windows paths and any stack frame and bounds the result to
    `200` characters, while PRESERVING relative display paths like
    `.ctoc/settings.yaml` — they name WHAT is wrong without leaking WHERE.

16. **The fail-open failure message always carries an action.** With a recorded
    `reason` the action names the realistic unrepairable cause (CTOC cannot write
    to `.ctoc/` — a permission or ownership problem) and says to reopen CTOC; with
    no recorded cause it says to reopen CTOC to retry rather than inventing one.
    No `!ok` branch produces a description alone.
