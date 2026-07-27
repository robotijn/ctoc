---
approved_by: human
approved_at: 2026-07-20T10:48:43.095Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-20T09:18:53.812Z
gate_crossed: implementation → todo
---

---
title: "The menu never claims it set up a project it did not — the claim is read back, not assumed"
type: implementation
parent_plan: none
depends_on: none
priority: CRITICAL
program: fresh-repository-first-run
iron_loop: true
files:
  - "src/commands/start.js"
  - "tests/menu-reports-what-init-did.test.js"
  - "tests/menu-auto-init.test.js"
  - "tests/menu-coverage.test.js"
  - "tests/fresh-repository-is-its-own-project.test.js"
  - "CLAUDE.md"
---

# The menu never claims it set up a project it did not

The owner, from a genuinely fresh repository:

> "initProject never actually ran here despite the menu announcing it had."

**This is this codebase's central defect class — a surface reporting a completed
action it never performed — pointed at the first thing a new user ever sees.** It is
the same shape as the five broken instruments, as a parser whose no-match default
was the success value, as a coverage floor that printed a threshold it had not read.
The fix is therefore not "make initialization run". It is **the menu must never
claim an action it did not take.**

## The mechanism, verified in code

`src/commands/menu.js:603-613`:

```js
function ensureInitialized(projectPath) {
  const root = projectPath || process.cwd();
  if (safeFs.existsSync(path.join(root, '.ctoc'))) return false;
  try {
    const { initProject } = require('../lib/init-project');
    initProject(root);
    return true;
  } catch {
    return false;
  }
}
```

`initProject` returns `{ success, created, skipped, detected }` — a full report of
what it wrote and what it did not. **That return value is discarded.** The function
returns `true` for one reason only: nothing threw.

Then `menu.js:739-740`:

```js
if (justInitialized) {
  result.text = 'CTOC initialized for this project (automatic — no init command needed).\n\n' + result.text;
}
```

Every write inside `initProject` is individually guarded and records its outcome to
`created` or `skipped` (`init-project.js:680-746`). Any number of them can be
skipped, fail, or — in a dry run — be reported as created without a byte being
written, and the menu still announces initialization completed. **"Did not throw" is
being rendered as "did the thing".**

## What could NOT be established

Honesty about the limits of this investigation.

I could not determine from this repository WHY `.ctoc/settings.yaml` was absent on
the owner's machine after the announcement. Several routes are consistent with the
evidence and I cannot distinguish them without his directory:

- the report was produced by a dry run, whose `created` list is indistinguishable
  from a real run's (the subject of the following slice);
- a write failed and was recorded in `skipped`, which nobody reads;
- `findProjectRoot` resolved to an ancestor project, so the fresh repository was
  never a root at all (the subject of the fresh-repository slice).

That uncertainty is exactly the point. **In every one of those cases the human was
told the same sentence.** The defect is that the claim carries no information about
which happened — and the fix removes the uncertainty for all of them at once,
without needing to know which one it was.

## The fix: the claim is read back

A write is proved by reading it back through the code that consumes it, never by
trusting the writer's own success flag. That discipline is already present in this
codebase — `writeActiveProfiles` round-trips through the real reader before it
returns `ok` (`src/lib/compliance-regime.js:194-196`). The menu adopts it.

`ensureInitialized` returns a VERDICT built from a read-back:

```js
{
  attempted: boolean,     // did we call initProject at all?
  ok: boolean,            // did the read-back find everything required?
  created: string[],      // from the report
  skipped: string[],      // from the report — no longer discarded
  missing: string[],      // required artifacts absent AFTER the run
  reason: string|null,    // why we did not attempt, when attempted is false
}
```

`ok` is computed by checking the artifacts a working project actually needs, each
through its real reader where one exists:

| artifact | how it is proved |
|---|---|
| `.ctoc/settings.yaml` exists | `safeFs.existsSync` |
| the compliance anchor is usable | `regulatory-regime.loadActiveProfiles(root)` returns an array — the READER OF RECORD, so a file the writer cannot later target counts as missing now, not in six weeks |
| `.ctoc/state/iron-loop.yaml` exists | `safeFs.existsSync` |
| the eight stage directories exist | `safeFs.existsSync` per directory |

Anything absent lands in `missing` and `ok` is false.

### What the human reads

| state | message |
|---|---|
| `ok` | `CTOC is set up for this project.` |
| `attempted && !ok` | `CTOC could not finish setting up this project. Missing: <list>. Nothing here will work properly until that is fixed.` |
| `!attempted` (already set up) | nothing — silence is correct and is today's behaviour |
| `!attempted` because the root resolved elsewhere | `Working in <root>, not <cwd>.` — the fresh-repository slice owns the detection; this slice renders the reason it is given |

The failure message names what is missing. A person can act on "Missing:
`.ctoc/settings.yaml`". Nobody can act on "initialized".

## Implementation Details

### File: `src/commands/menu.js`
**Action:** MODIFY
**Purpose:** The initialization claim is derived from a read-back, not from the
absence of an exception.
**Change Type:** modify-existing — one function, one message site

#### Change 1 — `ensureInitialized` returns the verdict (`:603-613`)

The report is kept. `initProject`'s `created` and `skipped` arrays flow into the
verdict; the `catch` records the error message into `reason` rather than collapsing
it to `false`. A caught error means `attempted: true, ok: false` — an attempt that
failed is not the same fact as no attempt, and today they are the same value.

#### Change 2 — the read-back

A module-private `verifySetup(root)` performs the four checks in the table above and
returns `{ ok, missing }`. It is called AFTER `initProject` returns, and its result —
not `initProject`'s — decides what the human is told.

The compliance check calls `regulatory-regime.loadActiveProfiles`, lazily required
and wrapped: a throwing reader means the anchor is not usable, which is a `missing`
entry, not a crash.

#### Change 3 — the message (`:668`, `:710`, `:739-740`)

`justInitialized` becomes `setup` (the verdict). The three sites render from the
table above. The success sentence loses "(automatic — no init command needed)" —
that clause explains CTOC's design to somebody who has not asked, on a screen whose
job is to say what just happened.

Fail-open is preserved: a failed setup produces a MESSAGE, never a refusal to
render. The human still gets the screen, and now also gets the truth about it.

### Wiring — the live call sites

| new code | live call site | root |
|---|---|---|
| `ensureInitialized`'s verdict | `menu.js` `main()` — the same call site it has today | every open of the entry point |
| `verifySetup` | `ensureInitialized`, this slice | same |

No new module, no new export. The one function that already ran on every open now
returns the truth instead of a boolean, and its existing reader renders it.

## Test Plan

### Tests: `tests/menu-reports-what-init-did.test.js`
**Action:** CREATE
**Framework:** `node:test`

Every case builds a real directory and drives the real function.

| # | Case | Fixture | Assertion |
|---|---|---|---|
| 1 | **a real fresh directory reports success** | empty temp directory | `ok` true, `missing` empty, and `.ctoc/settings.yaml` EXISTS on disk afterwards |
| 2 | **the claim survives a read-back through the real reader** | same | `loadActiveProfiles(root)` returns an array — the artifact is not merely present but usable |
| 3 | **a settings write that fails is NOT reported as set up** | make the settings write fail at its real source through the `safe-fs` seam | `ok` false; `missing` names `.ctoc/settings.yaml`; the rendered message does NOT contain the word `set up` as a claim |
| 4 | **the message names what is missing** | same | the message contains `.ctoc/settings.yaml` |
| 5 | **an anchorless settings file counts as missing** | pre-seed `.ctoc/` with a settings file carrying no `active_profiles:` line, plus everything else valid | `ok` false — this is the exact state that made the compliance write fail silently, caught at setup instead |
| 6 | **a throwing initialization is attempted-and-failed, not not-attempted** | force `initProject` to throw through the require-cache seam | `attempted` true, `ok` false, `reason` carries the message |
| 7 | **the dashboard still renders on a failed setup** | case 3's fixture | the screen returns a non-empty string containing its ordinary sections; nothing is bricked |
| 8 | **an already-set-up project says nothing** | a fully initialised fixture | `attempted` false, and the rendered text contains no setup message |
| 9 | **`skipped` is no longer discarded** | a fixture where one artifact pre-exists | the verdict's `skipped` array is non-empty and names it |
| 10 | **missing stage directories are caught** | delete `plans/review/` after initialization | `ok` false; `missing` names the directory |
| 11 | **the success message makes no claim beyond what was verified** | case 1 | the message does not contain `no init command needed` and does not enumerate files it did not check |
| 12 | **end to end, as a human runs it** | spawn `node src/commands/menu.js` with `cwd` set to a real fresh directory, then assert on stdout AND on the directory contents | the announcement and the filesystem agree — the assertion that would have caught the reported defect |

Case 12 is the one that matters. Cases 1-11 test the function; case 12 tests what a
person gets, which is the only measure this project accepts.

Cross-platform: `path.join`, `os.tmpdir()`, `fs.promises.rm` teardown. Case 3 uses
the `safe-fs` seam rather than a read-only directory, because a permission fixture
would have to be skipped on some platform and a skip is a gate failure.

## What this slice does NOT fix

- **The dry run.** `initProject`'s dry run still reports files as created that it
  did not write. That is the next slice, and it is the same defect class one layer
  down.
- **The git hook installed without consent.** Also the next slice.
- **The project root resolving to an ancestor.** The fresh-repository slice. This
  slice renders a reason it is given; it does not detect that case.
- **Why the owner's settings file was absent.** Stated above: not determinable from
  this repository. This slice makes every route to that state announce itself.
- **Anything about initialization's CONTENT.** Whether the generated settings are
  right is not in scope; whether they exist and parse is.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/menu-reports-what-init-did.test.js` in full, run ONLY that file, record the red output verbatim. Cases 3, 4, 5, 6, 9, 10, 11 and 12 MUST be red. Case 12's red output MUST include the announcement alongside a listing of the directory, so the contradiction is on the record as the owner experienced it.
### Step 9: PREPARE — re-read from disk: `src/commands/menu.js:597-613` and `:660-745`; `src/lib/init-project.js:565-749` for the exact return shape and every `skipped.push` site; `src/lib/regulatory-regime.js` for `loadActiveProfiles`'s signature and failure behaviour. The landed code WINS over this plan's line numbers. Confirm `initProject`'s return still carries `created` and `skipped`.
### Step 10: IMPLEMENT — one step, files as sub-items.
  - `src/commands/menu.js` — Changes 1, 2 and 3.
### Step 11: REVIEW — confirm no path renders a success sentence without `ok === true`. Confirm every other `try/catch` in `menu.js` that swallows a failure is listed with a justification, since this slice's whole subject is a swallowed outcome. Confirm the dashboard renders in every failure fixture. Confirm the read-back uses the real reader for the compliance anchor and not a local regular expression.
### Step 12: OPTIMIZE — the read-back is four existence checks and one small parse, and it runs ONLY on the path where initialization was attempted, which is once per project lifetime. Confirm an already-set-up project performs no extra read.
### Step 13: SECURE — the failure message names paths. Confirm they are project-relative, not absolute, so the message does not leak the filesystem layout. Confirm no error stack reaches the screen — message text only.
### Step 14: VERIFY — `node --test tests/menu-reports-what-init-did.test.js tests/init-project.test.js tests/menu-environment.test.js tests/e2e-menu-lifecycle.test.js tests/compliance-mode.test.js` green, then the full gated run `npm test`. Lint the changed file. No git operations.
### Step 15: DOCUMENT — a JavaScript doc on `ensureInitialized` stating the rule: the menu never claims an action it did not take, and the claim is derived from a read-back through the reader of record. Name the discarded-report defect and its date so the reason survives the code.
### Step 16: FINAL-REVIEW — report the announcement BEFORE and AFTER on a fixture where setup genuinely fails, verbatim, and every decision taken under ambiguity.

## Decisions Taken Under Ambiguity

1. **The claim is verified by reading back, not by trusting the report.** Even a
   truthful `created` list only records an intention to write. The read-back is what
   makes the claim about the world rather than about the code's belief.
2. **The compliance anchor is checked through `loadActiveProfiles`, the reader of
   record.** A file that exists but that the writer can never target is a state the
   owner actually hit. Checking existence alone would have passed on it.
3. **A caught error is `attempted: true, ok: false`, not `false`.** Collapsing "we
   tried and failed" into "we did not try" is how the original defect was possible.
4. **Failure produces a MESSAGE, never a refusal to render.** The existing fail-open
   behaviour is correct — a setup problem must not lock the human out of the screen
   that would let them fix it. Only the silence changes.
5. **"(automatic — no init command needed)" is dropped.** It explains CTOC's design
   to somebody who did not ask, on a line whose job is to report what happened.
6. **The required-artifact list is fixed in code, not derived from the report.**
   Deriving it from `created` would make the check pass whenever initialization
   decided to write nothing — the check would agree with whatever happened, which is
   not a check.
7. **Case 12 spawns a real process.** Every in-process test in this suite builds its
   own correct fixture, which is precisely why none of them caught this. Driving the
   real entry point and then reading the real directory is the only assertion whose
   failure would have matched the owner's experience.

### Taken during execution (Steps 8–14)

8. **The plan's compliance read-back was materially wrong and was replaced.** The
   plan specifies `loadActiveProfiles(root)` "returns an array". It returns an
   OBJECT `{ profiles, overrides, declined }`, and it returns
   `{ profiles: [], … }` for a settings file with no `regulatory_regime:` block —
   and for NO settings file at all. As specified, the check would have passed on
   every broken world in this slice's own fixtures. Test case 5 pins that: it
   asserts the naive reader check passes on the broken file BEFORE asserting the
   real check fails on it. The implemented read-back is two-part: the reader of
   record must return a `profiles` array, AND the `active_profiles:` anchor must be
   TARGETABLE by `writeActiveProfiles` — a line with an INLINE value. That second
   half is the writer's one precondition and is what actually bit the owner.
9. **The anchor pattern is duplicated in `menu.js`, not borrowed.**
   `compliance-regime.js` exports no anchor predicate and
   `regulatoryRegimeRegion` is module-private. Adding an export there is an
   UNDECLARED file, forbidden by the scope rule, so the writer's `lineRe` and its
   block-style guard are mirrored in `complianceAnchorUsable` with the owning
   module named in the comment. Test 5b pins the block-style half, so a drift in
   either direction fails a test.
10. **The read-back runs on BOTH paths — including when initialization is not
    attempted.** The plan's table says a `!attempted` project is silent. That
    would have made two of the shapes the brief demands uncatchable: an empty
    `.ctoc/` directory and an anchorless settings file are both states where
    `.ctoc/` EXISTS, so no attempt happens and nothing would ever be read back.
    The bare presence of `.ctoc/` is precisely the un-evidenced marker this slice
    exists to delete. Cost: about twelve `existsSync` calls and one small file
    read per menu open, against the plan's Step 12 wish that a set-up project
    perform no extra read. A healthy project is still SILENT — case 8 pins it —
    so the human-visible contract in the plan's table is unchanged.
11. **`!attempted && !ok` gets its own sentence.** "CTOC is not fully set up for
    this project" rather than "could not finish setting up", because nothing was
    attempted and claiming an attempt would be the same class of untruth.
12. **`setupMessage` is a new export, against the plan's "no new export".** Two
    render sites (the interactive screen and the non-interactive JSON screen) must
    tell the same person the same story; a single pure function is the anti-drift
    measure. Its live caller is `main()`, so the export-reachability fence is
    satisfied by production code, not by its test.
13. **Test case 7 was redesigned.** The plan's fixture makes the settings write
    fail through the `safe-fs` seam and then asserts on a SPAWNED process. An
    in-process monkeypatch does not cross a process boundary, so that fixture
    would have proved nothing about the child. Replaced with a broken world that
    does survive the boundary — an empty `.ctoc/` directory — which still fails
    setup and still must render.
14. **Two extra cases added beyond the plan's twelve**: an empty `.ctoc/`
    directory (case 13) and a leak check on the failure message (case 14, Step 13
    SECURE — no absolute path, no stack frame).


## Execution Record

### The finding the next executor should read first — a vacuous read-back

**The plan's own read-back was vacuous, and the detection method was that it was
the ONE test case green before any implementation existed.**

The plan specified proving the settings file through the profile loader:
`regulatory-regime.loadActiveProfiles(root)` "returns an array". Read from disk,
that function returns an OBJECT `{ profiles, overrides, declined }`, and it
returns `{ profiles: [], … }` in three distinct worlds:

- a healthy settings file with an empty profile list — the intended pass;
- a settings file with NO `regulatory_regime:` block at all;
- **no settings file whatsoever** (`if (!existsSync(settingsPath)) return { profiles: [], … }`).

The check as specified therefore passes on every broken world in this slice's own
fixtures — including the exact one the owner hit. It is a check that agrees with
whatever happened, which is not a check. It is the same defect class the slice
exists to kill, reproduced inside the slice's own fix: a verdict rendered from
input that carries no verdict.

**How it was caught, and the rule to generalise: a test that passes before the
code is written is not testing the code.** Step 8 was run as true test-driven
development — all fifteen cases written and run BEFORE a line of implementation.
Fourteen were red. One was green. A green case against an unimplemented feature
has exactly two explanations: the behaviour already exists, or the assertion is
vacuous. Neither is ever acceptable to leave unexamined, and here it was the
second. Had Step 8 been written alongside the implementation — the common
shortcut — that case would have been green for the "right" reason and the vacuity
would have shipped inside the fix for vacuity.

The case is now retained deliberately as case 5's PRECONDITION: it asserts that
the naive reader check passes on the broken file, immediately before asserting
that the real check fails on it. The inadequate check is pinned in place as
evidence, so a future reader cannot re-adopt it.

The replacement is two-part, because the writer's precondition — not the
reader's — is what actually failed for the owner. `compliance-regime.js`
`writeActiveProfiles` does a line-targeted replacement of the `active_profiles:`
anchor (deliberately, so it cannot disturb the `enforcement`/`operations` blocks
the hooks parse without a YAML library), and it refuses a block-style list rather
than corrupt it. So the anchor must be PRESENT and INLINE for any compliance
answer to ever persist. `complianceAnchorUsable` checks the reader of record AND
that targetability; cases 5 and 5b pin both halves.

### Steps

- [x] Step 8 TEST — 15 cases, run first, RED 14/15. See the finding above for the
      fifteenth.
- [x] Step 9 PREPARE — re-read from disk: `menu.js` `ensureInitialized` + `main()`,
      `init-project.js` (`return { success: true, … }` is hardcoded; `created` and
      `skipped` still carried), `regulatory-regime.js`, `compliance-regime.js`.
- [x] Step 10 IMPLEMENT — `src/commands/menu.js`: `complianceAnchorUsable`,
      `verifySetup`, `ensureInitialized` returning a verdict, `setupMessage`, and
      the three render sites.
- [x] Step 11 REVIEW — no path renders a success sentence without `ok === true`.
- [x] Step 12 OPTIMIZE — twelve existence checks and one small read.
- [x] Step 13 SECURE — project-relative display paths only; no absolute path and
      no stack frame reaches the screen (case 14).
- [x] Step 14 VERIFY — full gated run GREEN, numbers below.
- [x] Step 15 DOCUMENT — JavaScript doc naming the discarded-report defect and its
      date; contract-change comments in each repaired test file.
- [x] Step 16 FINAL-REVIEW — before/after announcements below.

### The four repairs — assertions pinning a replaced contract

The contract that replaced them is derived from OUTSIDE these tests: the plan
itself, and the running code in `src/commands/menu.js`, where `ensureInitialized`
now returns `{ attempted, ok, created, skipped, missing, reason }`. In every case
the test is wrong rather than the code, because the value each asserted —
`true` — meant "nothing threw" and nothing more, which is precisely the defect
under repair. **Every repair TIGHTENS.**

| # | site | old assertion | new assertion | which implementation passes before and fails after |
|---|---|---|---|---|
| 1 | `menu-auto-init.test.js` "initializes a project" | `didInit === true` | `attempted === true` AND `ok === true` | an implementation that runs initialization and writes nothing passed before (it did not throw) and fails now |
| 2 | `menu-auto-init.test.js` "no-op when .ctoc exists" | `didInit === false` | `attempted === false`, `created` empty, AND `ok === false` on a bare `.ctoc/` | an implementation treating the bare marker directory as proof of setup passed before and fails now |
| 3 | `menu-coverage.test.js` "reports true" / "returning false" | `=== true` / `=== false` | `attempted`+`ok`; `attempted === false` plus empty `created` (the init-always mutant stays dead) | same as 1 and 2 |
| 4 | `menu-coverage.test.js` fail-open | `result === false` | `ok === false`, `attempted === true`, non-empty string `reason` | an implementation collapsing "we tried and failed" into "we did not try" passed before and fails now |
| 5 | `menu-coverage.test.js:791` | `match(/CTOC initialized for this project/)` | `match(/CTOC is set up for this project\./)` PLUS `settings.yaml` exists on disk | an implementation announcing setup without the artifact passed before and fails now |
| 6 | `fresh-repository-is-its-own-project.test.js` case 2 | `didInit === true` | `setup.attempted === true` | shape only |
| 7 | `CLAUDE.md` | documented 440 test files | 441, read live from `ls tests/*.test.js \| wc -l` | mechanical; this slice's own declared test file moved it |

**None turned out to be asserting something still correct.** Two deserve their
reasoning stated in full:

- `menu-coverage.test.js:791` is a REAL contract assertion, not a mechanical
  boolean: it pins that `main()` tells the human something about setup on first
  open. Only the WORDING moved. It was RE-POINTED, never deleted — dropping a
  contract assertion because its wording changed is how a contract quietly stops
  being checked — and it was tightened to require that the note and the
  filesystem AGREE, which is the pairing whose absence let this defect ship.
- `fresh-repository-is-its-own-project.test.js` belongs to a sibling slice that
  landed hours ago. **Its subject is unaffected**: root resolution reaching the
  fresh repository, and that repository owning a settings file afterwards, are
  asserted exactly as before and both still pass. Only the return SHAPE moved.
  Stated as such in the test's own comment.

### Verification Evidence — Step 14, verbatim

Full gated run, `npm test`:

    ℹ tests 10288
    ℹ pass 10288
    ℹ fail 0
    ℹ skipped 0
    [CTOC test-gate] coverage 99.03% (threshold 99%), skipped 0, failed 0
    [CTOC test-gate] PASS

Own suite: `tests 15, pass 15, fail 0, skipped 0`. Fences (`reachability`,
`export-reachability`, `false-green-fence`): `tests 54, pass 54, fail 0`. Lint
clean. The coverage floor was neither raised nor lowered and no whitelist entry
was added; measured coverage rose to 99.03% against the floor of 99.

Fail-open confirmed directly — with a root under a file, `ensureInitialized`
returns `{attempted:true, ok:false, …, reason:"ENOTDIR: …"}` and does not throw.

### What the human reads, before and after

BEFORE, on a genuinely fresh directory AND on a directory where setup fails —
the SAME sentence in both, which is the defect:

    CTOC initialized for this project (automatic — no init command needed).

AFTER, driving the real entry point in a real fresh directory:

    CTOC is set up for this project.
    (.ctoc/settings.yaml on disk: true)

AFTER, on a directory holding an empty `.ctoc/`:

    CTOC is not fully set up for this project. Missing: .ctoc/settings.yaml,
    .ctoc/state/iron-loop.yaml, plans/vision, plans/canvas, plans/functional,
    plans/implementation, plans/todo, plans/in-progress, plans/review,
    plans/done. Nothing here will work properly until that is fixed.
    (.ctoc/settings.yaml on disk: false)

A healthy, already-set-up project stays silent.
