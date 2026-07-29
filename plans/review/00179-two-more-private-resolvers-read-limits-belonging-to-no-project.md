---
approved_by: human
approved_at: 2026-07-20T11:56:02.868Z
gate_crossed: implementation → todo
---

---
title: "Two more private resolvers read limits belonging to no project, and nothing stops a sixth"
type: implementation
parent_plan: none
depends_on: 00178-the-refinement-loop-writes-its-journals-to-the-home-directory
priority: HIGH
program: resolution-and-setup-tell-the-truth
iron_loop: true
files:
  - "src/lib/budget.js"
  - "src/lib/iron-loop-enforcer.js"
  - "tests/no-private-root-resolver.test.js"
---

# Two more private resolvers read limits belonging to no project

The last two carriers of the over-rooting defect, plus the fence that stops a
sixth private copy appearing. They share a slice because the edit is **literally
identical** in both, they are both **readers** (unlike slice four's writer), and
splitting them would produce two slices too small to justify their own test file
— the merge rule, applied as written.

## The mechanism, verified in code

`src/lib/budget.js:37-48` — twelve levels:

```js
function findProjectRoot(start = process.cwd()) {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (safeFs.existsSync(path.join(dir, '.ctoc')) || safeFs.existsSync(path.join(dir, '.claude-plugin'))) {
      return dir;
    }
    // ...
  }
  return start;
}
```

`src/lib/iron-loop-enforcer.js:136-147` — ten levels, the two marker checks in the
opposite order, otherwise character-for-character the same as slice four's copy.

Both **accept a bare `.ctoc`**. Both therefore climb from any project beneath the
home directory to `~/.ctoc` — which `src/lib/crypto.js:13,22` creates on any
machine that has used CTOC's crypto path — and **over-root to the home
directory**. The shared resolver documents having fixed exactly this at
`src/lib/project-root.js:87-94`, and neither copy received the fix.

**The consequence, named by module:**

- **`budget.js`** — session limits, dispatch caps and Iron Loop iteration caps are
  read from `~/.ctoc/budget.yaml`, or defaulted because nothing is there. **The
  budget belongs to no project.** Two projects share one budget, or neither has
  one, and the module reports its limits with the same confidence either way.
- **`iron-loop-enforcer.js`** — scans and enforcement checks run against a root
  that is not the project's, so plans and agents are enumerated from the wrong
  tree, or from an empty one. **A gate that scans nothing reports clean** — the
  false-green shape this repository already fences elsewhere, arriving through the
  root rather than through the parser.

Both return `start` on failure — the working directory substituted for an answer,
with no way for a caller to tell the difference. That is the same discard as every
other defect in this program: a truth value about how well-formed the world is,
collapsed into a value that looks like a result.

## The decision this slice settles

**Delegate to the shared resolver; on `marker === 'fallback'`, report the absence
rather than substitute a guess.**

These are readers, so the shape differs from slice four's writer. A reader cannot
"refuse" — it must return something. The rule applied:

| module | on fallback |
|---|---|
| `budget.js` | return the documented DEFAULTS (`:54-64`), and mark the result as defaulted rather than read from a project — the caller learns that no project budget was found, instead of being handed defaults indistinguishable from a real configuration |
| `iron-loop-enforcer.js` | a check that could not identify a project returns a NOT-APPLICABLE result naming the reason — never `clean: true`. A check reporting a verdict on input it never received is the false-green shape this repository fences by name |

The second is the load-bearing half. `iron-loop-enforcer.js:128-130` already has a
`finding()` helper returning `{ clean: false, ...payload }`, so the vocabulary for
"not clean" exists; what is missing is a way to say "I could not look". Step 9
determines the module's existing result contract and whether a not-applicable
shape already exists — the landed code decides the exact shape, not this plan.

## The fence

Without one, this defect regrows. Three copies were fixed in the shared resolver
and stayed broken here precisely because nothing noticed they existed. The fence
is a test, in the same spirit as the reachability and false-green fences this
repository already runs:

**`tests/no-private-root-resolver.test.js`** scans `src/**` for a function that
walks ancestry looking for a bare `.ctoc` or `.claude-plugin` marker, and fails on
any occurrence outside `src/lib/project-root.js`. It carries an explicit,
justified allow-list — **not** a debt baseline that may shrink, but a permanent
exemption list that starts with exactly the two entries verified in slice four:

| allowed | justification |
|---|---|
| `src/lib/coverage-map.js` | markers are `package.json`/`go.mod`/`Cargo.toml`/`pyproject.toml`/`.git` — no bare `.ctoc`, so `~/.ctoc` cannot capture it — and it returns a distinguishable `null` rather than substituting `start` |
| `src/scripts/run-evals.js` | markers are `VERSION`/`.git` — no bare `.ctoc` — and it is a build script, not runtime |

The distinction between a shrink-only debt baseline and a permanent
justified exemption is deliberate and is the one this repository already learned:
conflating them is what kills a fence.

## Implementation Details

### File: `src/lib/budget.js`
**Action:** MODIFY
**Purpose:** Budget limits are read from the project they govern, or are reported
as defaulted.
**Change Type:** modify-existing — delete a private resolver, mark the fallback

#### Change 1 — delegate (`:37-48`)

```js
const { describeProjectRoot } = require('./project-root');

function findProjectRoot(start = process.cwd()) {
  return describeProjectRoot(start).root;
}
```

Name, arity and string return type preserved. Step 9 establishes whether it is
exported and who calls it.

#### Change 2 — a defaulted budget says so

The config loader distinguishes "read from this project" from "no project
identified, using defaults". The existing `DEFAULTS` object is unchanged; what
changes is that the result carries which of the two happened, so
`formatStatus` can say it and a caller can tell.

### File: `src/lib/iron-loop-enforcer.js`
**Action:** MODIFY
**Purpose:** A check that could not identify a project never reports clean.
**Change Type:** modify-existing — delete a private resolver, add a not-applicable
result

#### Change 3 — delegate (`:136-147`)

Identical to Change 1.

#### Change 4 — an unidentified project is not-applicable, never clean

Every check whose scan depends on the resolved root returns a not-applicable
result naming `fallbackReason` when `marker === 'fallback'`. **No path returns
`clean: true` on a scan that examined nothing.** Step 9 determines the module's
existing result contract; if a not-applicable shape already exists it is used
rather than a new one invented.

### Wiring — the live call sites

| new code | live call site | root |
|---|---|---|
| `budget.js`'s delegating resolver + defaulted marking | `checkBudget`, `resetSession`, `formatStatus` (`:25-27`) — this module's existing entry points | the Iron Loop budget path |
| `iron-loop-enforcer.js`'s delegating resolver + not-applicable result | the enforcer's check functions, called by the Iron Loop enforcement path | Iron Loop step enforcement |
| the fence test | `npm test` | the gated entry point |

No new module. The fence's live caller is the gated test run, which is the root a
test-shaped fence is legitimately reachable from — its job IS to run in the suite.

## Test Plan

### Tests: `tests/no-private-root-resolver.test.js`
**Action:** CREATE
**Framework:** `node:test`

One file covering both modules' behaviour and the fence, because the fence's whole
point is that these are one class of defect and not three unrelated bugs. No test
touches the real home directory; every home-directory case uses a stand-in tree.

| # | Case | Fixture | Assertion |
|---|---|---|---|
| 1 | **the fence catches a private bare-marker resolver** | scan `src/**` | zero occurrences outside `src/lib/project-root.js` and the two justified exemptions. MUST be red — it will name `budget.js` and `iron-loop-enforcer.js` today |
| 2 | **the fence would catch a NEW one** | a synthetic source string carrying the pattern, fed to the scanner directly | detected — proving the scanner detects rather than merely counting to zero, which is the failure mode of every fence |
| 3 | **the exemption list is permanent and justified, not a shrinking baseline** | the fence's own allow-list | every entry carries a non-empty written justification; the list is compared against the two expected entries so a silent addition fails |
| 4 | **budget does not over-root to a stand-in home** | stand-in home with `.ctoc/.secret`, project beneath it with `.git/` and no `.ctoc` | the resolved root is the project. MUST be red |
| 5 | **budget reports defaults AS defaults** | empty directory, no marker anywhere | limits equal `DEFAULTS` AND the result says no project budget was found — the two are distinguishable |
| 6 | **budget reads a real project budget** | project with `.ctoc/budget.yaml` | the file's values, marked as read from the project |
| 7 | **the enforcer does not over-root** | case 4's fixture | scans the project, not the stand-in home. MUST be red |
| 8 | **an unidentified project is never clean** | empty directory | every root-dependent check returns not-applicable with a reason; NO check returns `clean: true`. This is the false-green half and is the most important case in the file |
| 9 | **the enforcer still finds real findings** | a project containing a plan with a known violation | the finding is reported — the module's actual job still works and was not defanged by the guard |
| 10 | **a nested repository is scanned as itself** | outer CTOC project, inner directory with `.git/` | both modules resolve to the inner repository |
| 11 | **neither module can produce a path under the home directory** | a marker-less directory nested twelve deep beneath a stand-in home carrying `.ctoc` | no resolved path is inside the stand-in home — pins the twelve-level climb in `budget.js` specifically |
| 12 | **the export contracts hold** | direct calls | both `findProjectRoot` functions return a string for every input including `undefined` and a non-string |

Case 8 is the one that matters most: an enforcement gate that reports clean
because it scanned an empty wrong directory is worse than no gate, and it is the
defect class this repository names by hand in its own instructions.

Cross-platform: `path.join`, `os.tmpdir()`, `fs.promises.rm` teardown. The fence
scans with `path.sep`-agnostic matching and normalises line endings, so it behaves
identically on Windows.

## What this slice does NOT fix

- **`src/lib/coverage-map.js` and `src/scripts/run-evals.js`.** Deliberately
  exempt, verified in slice four on two independent grounds each, and pinned by
  case 3.
- **The lossy `findProjectRoot` wrapper.** It stays and stays exported; it is
  correct for the many callers that genuinely need only a path.
- **Budget or enforcement SEMANTICS.** Whether the limits are right, or the checks
  correct, is untouched. Only which project they belong to.
- **Any budget or enforcement decision already taken against a wrong root.** Not
  detectable after the fact and not retroactively corrected.
- **A private resolver written in a shape the fence does not match** — a different
  marker set, or resolution obtained some other way. The fence catches the shape
  that occurred five times, not every conceivable shape, and claiming otherwise
  would be the same overreach it exists to prevent.
- **Anything under `tests/`.** The fence scans `src/**` only; a test may build any
  root it likes.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/no-private-root-resolver.test.js` in full, run ONLY that file, record the red output verbatim. Cases 1, 4, 7, 8 and 11 MUST be red. Case 2 must be red-then-green for the RIGHT reason: it must detect a synthetic positive, so verify it fails when the scanner is stubbed to find nothing. A fence that only ever counts to zero is a fence that would pass if it scanned nothing at all.
- [x] TEST — TDD tests present; workflow Step-11 REVIEW (2026-07-29) confirmed real/adversarial, not vacuous.
### Step 9: PREPARE — re-read from disk: `src/lib/budget.js` in full (its config loader, its `DEFAULTS`, and every export); `src/lib/iron-loop-enforcer.js` in full, listing every check function, its result contract, and whether a not-applicable shape already exists; `src/lib/project-root.js:33-198`. Grep the repository for callers of both modules' `findProjectRoot` and for `require.*budget` / `require.*iron-loop-enforcer`, and list every external caller. Re-run the private-resolver scan by hand and confirm the count is five copies and three defects before implementing — if a sixth has appeared since this plan was written, report it.
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
### Step 10: IMPLEMENT — one step, files as sub-items.
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
  - `src/lib/budget.js` — Changes 1 and 2.
  - `src/lib/iron-loop-enforcer.js` — Changes 3 and 4.
### Step 11: REVIEW — confirm no private ancestry walk remains in either file. Confirm NO enforcer path returns `clean: true` when the root was a fallback, by tracing every check's return. Confirm the defaulted budget is distinguishable from a read one at every exit. Confirm both exported resolvers still return a string for every input. Confirm the fence's exemption list is an explicit permanent list with justifications, and NOT a shrink-only baseline.
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3.
### Step 12: OPTIMIZE — the shared resolver's two-pass walk replaces a one-pass walk in each module. Confirm neither module resolves more than once per entry-point call, and that the fence scans `src/**` once rather than per-case.
### Step 13: SECURE — confirm no reason string carries an absolute path into a human-read surface. Confirm the fence's file scan is bounded (no unbounded read of an arbitrarily large file) and cannot be steered outside `src/`.
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
### Step 14: VERIFY — `node --test tests/no-private-root-resolver.test.js tests/budget*.test.js tests/iron-loop-enforcer*.test.js tests/project-root*.test.js tests/refinement-loop-writes-into-the-project.test.js` green, then the full gated run `npm test`. Lint both changed files. No git operations.
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
### Step 15: DOCUMENT — a JavaScript doc on each delegating resolver stating that it delegates and MUST NOT be re-implemented, naming the bare-marker over-rooting defect and pointing at `project-root.js:87-94`. A header comment on the fence stating what it catches, what it deliberately does not catch, and why the exemption list is permanent rather than a shrinking baseline.
### Step 16: FINAL-REVIEW — report, verbatim, the resolved root BEFORE and AFTER for a project beneath a stand-in home directory carrying `.ctoc`, for both modules. Report the enforcer's verdict on an unidentifiable project BEFORE and AFTER, since "clean" becoming "not applicable" is the whole point. Report the final private-resolver count. Report every decision taken under ambiguity.
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.

## Decisions Taken Under Ambiguity

1. **Both modules share one slice.** The edit is identical, both are readers, and
   they share one test file. Two slices here would each be too small to carry a
   test, which the merge rule addresses directly.
2. **This slice is three files, above the one-to-three target's midpoint.** Taken
   deliberately: the third file is the shared test, and the two source edits are
   the same mechanical change. Splitting would produce a near-duplicate slice pair.
3. **A reader cannot refuse, so each reports the absence in its own vocabulary.**
   Budget returns defaults marked as defaults; the enforcer returns not-applicable.
   Both preserve the distinction the current code destroys.
4. **The enforcer NEVER returns clean on a fallback root.** A check reporting a
   verdict on input it never received is the false-green shape this repository
   fences by name, and it would arrive here through the root instead of the parser.
5. **A fence is included rather than left to a follow-up.** Three copies stayed
   broken after the shared fix precisely because nothing noticed them. Fixing the
   instances without the fence schedules the fourth occurrence.
6. **The fence's exemptions are a permanent justified list, not a shrink-only
   baseline.** The two are deliberately different structures; conflating them is
   what kills a fence, and this repository has already paid for that lesson once.
7. **The fence must prove it detects (case 2).** A scanner that only ever counts to
   zero passes identically whether it works or scans nothing — which is the exact
   defect class this whole program is about, and it would be inexcusable inside the
   fence built to prevent it.
8. **Existing result contracts win over this plan's shapes.** Step 9 reads them
   first; if a not-applicable shape exists, it is used rather than a new one added.
9. **The fence scans `src/**` only.** A test may build any root it likes, and
   scanning tests would produce false positives that erode the fence until someone
   disables it.
10. **No test touches the real home directory**, in any case, for any reason.
11. **Scope expanded to a THIRD carrier — `src/lib/four-eyes.js` (human-authorized,
    2026-07-27).** The plan claimed "the last two" over-rooting carriers, but a third
    live carrier existed: `four-eyes.js:inferProjectRoot` (a bare-`.ctoc` while-loop,
    called inside `verifyFourEyes`). It is GOVERNANCE-LOAD-BEARING — a wrong root reads
    the wrong `.ctoc/roles.yaml` and returns the wrong four-eyes verdict. The human
    chose to FIX ALL THREE in this slice. `inferProjectRoot(planPath)` now delegates:
    `describeProjectRoot(path.dirname(path.resolve(planPath))).root`. The contract is
    preserved EXACTLY — the walk starts from the plan file's directory, and
    `describeProjectRoot` returns `process.cwd()` on fallback, which is the same
    single-project-workspace fallback `inferProjectRoot` always used. WHAT four-eyes
    decides is unchanged; only WHERE it roots.
12. **Delegation-only, per the executing brief.** The brief scoped this build to the
    delegation + the fence, NOT the plan's Change 2 (budget "defaulted" marking) or
    Change 4 (enforcer "not-applicable" result). Those result-contract additions are
    NOT implemented here; the over-rooting defect itself is closed by the delegation.
13. **Two additional coverage tests corrected toward the fixed behaviour, justified.**
    `tests/budget-coverage.test.js` and `tests/iron-loop-enforcer-coverage.test.js`
    each had a `findProjectRoot` block that pinned the DELETED private resolver's
    contract (a standalone `.claude-plugin` marker, a bare `.ctoc` root, and
    `return start` on total fallback). Those assertions asserted the over-rooting bug.
    Each was rewritten to pin the delegated contract (a genuine `.ctoc`+settings or
    `.git` root; `process.cwd()` on fallback) — tightening toward real behaviour, never
    weakening. The four-eyes fixtures needed NO change: Cluster 2 already carries a
    `plans/` sibling (a real project shape the shared resolver recognises) and Cluster 3
    relies on the cwd fallback the shared resolver preserves.
