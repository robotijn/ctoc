---
title: "An executor that discovers it needs one more file stops and asks, instead of silently working outside the scope the human approved"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/scope-growth.js"
  - "tests/scope-growth.test.js"
  - "src/lib/approval-ledger.js"
  - "tests/spec-hash-checkbox-runs.test.js"
  - "agents/iron-loop/iron-loop-executor.md"
  - "CLAUDE.md"
---

# An executor that needs one more file stops and asks

## The situation, and what is NOT wrong with it

An approval now binds to a plan's SPECIFICATION rather than its whole text, so an
executor's execution log no longer breaks it. That works and nothing here softens it.

The declared file list lives in the frontmatter, so it is bound — deliberately. The
file list IS the write permission: `src/lib/plan-coverage.js:findCoveringPlan` reads
`files:` and the PreToolUse hook allows or refuses every edit on that basis. An
executor that grows the list grows its own write permission. That is precisely what
the binding exists to prevent, and the human has ruled that it must keep breaking.

So an executor that discovers mid-build that it must touch ONE MORE FILE is in a
genuine bind, and the bind was hit for real. Faced with the choice, the executor that
built `00099-the-most-safety-critical-file-becomes-searchable-again` reverted its
declaration and recorded the extra file in its execution log — the work happened
outside the declared scope, approval technically intact and factually wrong. It
surfaced this rather than hiding it, which is the only reason this plan exists.

**What is missing is the third door: STOP AND ASK.** This plan builds it.

## Why the plan file must not be touched at all — measured, not assumed

The obvious designs are both actively dangerous, and the machinery says so:

| candidate design | what actually happens |
|---|---|
| executor amends `files:` in place | frontmatter is hashed in full → `contentMatches` fails → `human-gate-check.classifyResidency` returns `hash-mismatch` → a documented **live attack signature** that reverts on every project → the plan is thrown out of `todo/` **mid-build** |
| executor moves the plan back to `implementation/` to re-ask | the ledger entry records `stage_to: 'todo'`; `classifyResidency` line 264 is `if (entry.stage_to !== folderName) return {reason:'wrong-edge'}` → `wrong-edge` is also a live attack signature → the plan is reverted to `functional/` |

Both roads end in an auto-revert. Therefore:

**THE SCOPE-GROWTH REQUEST LIVES ENTIRELY OUTSIDE THE PLAN FILE.** The plan is not
moved, its frontmatter is not amended, its specification is not touched. The approval
stays valid, no revert is armed, and the in-scope work already on disk stays covered
by the declaration that already exists. The only plan write the executor makes is into
`## Execution Record`, which `EXECUTION_SECTIONS` already excludes from the hash.

## The mechanism is the one that already exists

`.ctoc/inbox/questions/` is CTOC's existing "an agent raised something the human must
decide" stream. `src/lib/inbox.js:createQuestion` is documented as agent-written; the
count feeds `getInboxCounts().questions`, which the dashboard prints as
`N morning questions · view: inbox questions`, and the route opens
`menu-screens.inboxQuestionsScreen`, which lists `source_plan`, `source_step`, age and
the file path. **Count, door, screen and reader all already exist.** Nothing new is
invented and no second "something needs the human" encoding is added.

The streaming question store was considered and REJECTED for this: `pendingGateDecisions`
iterates gate SOURCE stages only, and a plan being built sits in `todo/`, which is a
gate DESTINATION. Questions written there for a building plan would be read by nothing,
and making them readable would mean a new enumeration plus exposure to
`crossBySufficiency`, which auto-crosses on an answered question set. The inbox needs
neither.

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `requestScopeGrowth` | `inbox.createQuestion` → `getInboxCounts().questions` → dashboard INBOX line → `inboxQuestionsScreen` | `/ctoc:menu` |
| `requestScopeGrowth` | `continuation.registerFork` → `src/hooks/stop-continuation-gate.js` | every executor dispatch |
| `listScopeGrowthRequests` | `inboxQuestionsScreen` row detail | `/ctoc:menu` → `inbox questions` |
| the checkbox-run rule | `computeSpecHash` → `contentMatches` → `classifyResidency` | `src/hooks/human-gate-check.js` |
| the executor contract | `agents/iron-loop/iron-loop-executor.md` | every Iron Loop dispatch |

Nothing here is reachable only from a test.

**The continuation gate is not optional.** `src/lib/continuation.js` + the Stop hook
BLOCK a mid-batch stop unless a FORK is registered. An executor that stopped without
`registerFork` would be forced to keep going by the very gate that exists to stop it
drifting — so `requestScopeGrowth` registers the fork itself, in the same call, and a
caller cannot forget.

## How the growth is detected

**A refused write is the signal.** Verified by reading the hook rather than assuming:

- `PreToolUse.Edit.js:enforce` step 3 calls `findCoveringPlan`; on no match it falls to
  step 4 (escape phrase) and then step 5 (block with a real harness deny).
- The escape-phrase path CANNOT be self-triggered: `findEscapeInTranscript` matches only
  over `extractUserTypedText`, which keeps `type:"user"` text blocks and excludes
  `tool_result` entries. An executor cannot type its own way out.

So for an ordinary source or test file the refusal is reliable and loud. **Two holes are
named rather than papered over**, because a detector that claims coverage it does not
have is the defect class this repository fences:

1. **Whitelisted targets pass silently.** `.ctoc/*`, `plans/*.md`, `VERSION`,
   `.gitignore`, `.gitattributes` are allowed with no plan at all. Scope growth into
   those is invisible to this mechanism.
2. **A file declared by a DIFFERENT plan passes silently.** `findCoveringPlan` scans
   every plan in `in-progress`, `todo` and `implementation` and returns ANY match; the
   hook has no notion of *which* plan is currently being executed. An executor building
   plan A may write a file declared by plan B and never be refused.

Hole 2 is the larger one and it is NOT fixed here — closing it needs an "active plan"
concept on the hook path, which is its own slice and its own risk. This plan handles
the refused-write case, which is the case that was actually hit.

## Telling a real discovery from an executor wandering

The mechanism must not become a rubber stamp. A request is REFUSED AT WRITE TIME unless
every one of these is a non-empty string, so it cannot be filed as a shrug:

| field | what it must contain |
|---|---|
| `plan` | the plan being built |
| `step` | the Iron Loop step that hit the wall |
| `file` | the undeclared path the write was refused on |
| `blocked_write` | what the executor was about to write, in one line |
| `forced_by` | **a file THIS PLAN ALREADY DECLARES, and the symbol or line in it** whose change makes the new file's change unavoidable |
| `acceptance_criterion` | which acceptance criterion of this plan cannot be met without it |
| `if_refused` | what concretely breaks if the human says no |

**The reviewer's test is one sentence: does `forced_by` name a file this plan already
declares, and does the change to that declared file make the new file's change
unavoidable?**

A real discovery is always a CONSEQUENCE that propagates outward from declared work — a
caller whose signature moved, a fence that now fires, a documented count that shifted.
Its `forced_by` points inward at the plan's own declared files, and `if_refused` names a
broken build or a failing acceptance criterion. A wandering executor is proposing a NEW
CAPABILITY: it cannot name a declared file that forces the change, so `forced_by` comes
back as a restatement of the new file's own purpose, and `if_refused` reads as "the
improvement would not happen" — which is the correct answer to reject. The remedy for
wandering is a new plan, never a wider one.

`forced_by` naming a declared file is checked mechanically against the plan's own
`files:` via `plan-coverage.readPlanFiles`; a request whose `forced_by` names nothing the
plan declares is written anyway but flagged `forced_by_declared: false`, so the reviewer
sees the weakest requests marked rather than hidden. It is a flag, not a refusal — an
executor may be describing a real consequence in prose the matcher cannot parse, and
silently dropping a real discovery is worse than showing a weak one.

**A second request against the same plan is itself a finding**: the slice was mis-sized,
and the honest response is a kickback to planning rather than a second approval.
`listScopeGrowthRequests` reports the count per plan so a reviewer sees it without
counting by hand.

## What happens to work already done

**It is LEFT ON DISK, RECORDED, AND NOT REVERTED.**

The justification is structural, not a preference: **the blocked write never landed**, so
by construction there is nothing out-of-scope on disk to revert. Everything already
written sits inside the plan's declared `files:` — the exact write surface the human
approved. Reverting would destroy correct, approved-scope work; would itself be an
unreviewed bulk write; and would leave the tree in a state no human approved either. The
plan keeps its approval and stays in `todo/`, so a half-finished build is exactly what an
interrupted build has always looked like and the existing resume path already handles it.

The executor records what landed in `## Execution Record`, which is excluded from the
specification hash, so the record cannot itself break the approval.

## The whitespace ruling

### The defect

`computeSpecHash` drops checkbox lines but KEEPS blank lines. An executor writing its
step records as `- [x]` lines and leaving a blank line before the following prose
silently amends the approved specification — the hash moves on whitespace no human would
consider part of the scope. The `00099` executor caught and removed those blank lines by
hand. Relying on an agent's care for this is not a mechanism.

### The rule — NORMALISE, and exactly this much

> **In `computeSpecHash`, a maximal contiguous run of lines that contains AT LEAST ONE
> checkbox line and otherwise contains ONLY blank lines is excluded in full.**

Nothing else changes. Explicitly NOT done, because each would start dissolving the
binding:

- no trailing-whitespace stripping (two trailing spaces are a markdown hard break);
- no leading-whitespace normalisation (indentation is nesting, and nesting is meaning);
- no blank-line collapsing anywhere else in the body;
- no frontmatter normalisation whatsoever — the frontmatter, where `files:` lives, stays
  hashed byte-for-byte.

### The proof that a real scope change still breaks it

By construction an excluded run contains no line carrying a non-whitespace character
other than a checkbox marker line. Every scope-bearing element of a plan — the
frontmatter and its `files:`, the scope prose, the acceptance criteria, the
implementation specification, the test plan, the step headings — is a non-blank,
non-checkbox line. Such a line therefore can never fall inside an excluded run, and is
hashed verbatim exactly as today. Any edit that changes a scope-bearing character
changes `kept` and changes the digest.

The ONLY text the new rule can hide is a blank line adjacent to a checkbox, which grants
nothing and permits nothing. Every remaining drift still degrades toward NOISE (a false
mismatch, recoverable by re-approval) and never toward SILENCE (a forged approval, which
is not recoverable) — the direction the deny-list argument in `approval-ledger.js`
already commits to.

This is asserted as a proof in prose and then PROVEN as adversarial test cases at Step 8:
a `files:` entry, a scope line and an acceptance criterion are each planted inside a
checkbox run and each must still break the digest.

### The corpus is at real risk, and it is measured before anything is written

Measured during planning: **2179 occurrences of a checkbox line followed by a blank line,
across 222 plan files.** This change is NOT theoretically safe and must not be treated as
such.

The direction of effect differs by case, and both must be reported:

- A plan approved with NO checkbox lines, whose executor later added checkbox groups plus
  blank lines, **fails to verify today and starts verifying** — a REPAIR, and the
  original motivation.
- A plan whose APPROVED text already contained a checkbox adjacent to a blank line, and
  which verifies today, would compute a different digest and **stop verifying** — which
  arms `hash-mismatch`. That is real harm.

**STOP CONDITION.** Step 9 computes, for every ledger entry with
`hash_scope: 'specification'` and a live plan, the verdict under BOTH algorithms. If any
entry that verifies today would stop verifying, the executor **STOPS AND REPORTS** with
the list. It does not ship the change, does not re-hash any entry (re-hashing launders
post-approval amendments — the exact forgery the ledger exists to expose), and does not
weaken the rule to make the number come out. The human then decides: re-approve the named
plans, or drop the normalisation. That decision is the human's and is not taken here.

## The two smaller findings

**FOLDED IN — the module header claims a dependency set that is false.**
`src/lib/approval-ledger.js` line 57 states its "ONLY intra-project dependency is the
pure-constant `gate-order.js`", while line 122 requires `./safe-fs`. The same claim is
repeated inside `computeSpecHash`'s JSDoc as the stated reason for not reusing
`stale-detector.extractFrontmatterRegion`. A false invariant in the single source of
approval truth is the same class this repository fences, the file is already being edited
for the whitespace rule, and the fix is comment-only. Both places are corrected to name
both dependencies and to state the property that actually matters: no require cycle, and
no heavy load on the every-tool-call Bash-hook path.

**REJECTED — the last-mile check reports not-applicable for want of a declared entry
point.** Verified: `.ctoc/settings.json` has no `general.entry_point`, while `CLAUDE.md`
documents the declaration and even gives its exact value. The finding is real. It is
rejected from THIS plan for a reason, not for convenience: adding that key makes Step 14
actually drive `node src/commands/menu.js` and match a literal marker on every future
verification. If the menu does not exit cleanly or print its marker non-interactively,
every subsequent Step 14 fails. That is a behavioural change to the verification gate
itself and deserves its own slice with its own evidence, not a four-line ride-along in a
plan about scope growth. It is reported at Step 16 so the human can schedule it.

## Implementation Details

### Dependency graph

```
src/lib/scope-growth.js
  ├─requires→ src/lib/inbox.js         (createQuestion, listQuestions)   [existing]
  ├─requires→ src/lib/plan-coverage.js (readPlanFiles)                   [existing]
  ├─requires→ src/lib/continuation.js  (registerFork)                    [existing]
  └─tested-by→ tests/scope-growth.test.js

src/lib/approval-ledger.js  (computeSpecHash only)
  └─tested-by→ tests/spec-hash-checkbox-runs.test.js
  └─called-by→ contentMatches → human-gate-check.classifyResidency       [unchanged]

agents/iron-loop/iron-loop-executor.md → names scope-growth as the third door
CLAUDE.md → documented test-file count (+2)
```

No cycle: `scope-growth` is a new leaf; nothing existing requires it except the executor
contract (prose) and its test. `approval-ledger.js` gains NO new require — the checkbox-run
rule is computed inside the existing single linear pass.

### File: `src/lib/scope-growth.js`
**Action:** CREATE
**Purpose:** Turn a refused write into a structured question the human already has a
door to, and register the fork that makes stopping legitimate.

- `requestScopeGrowth(request, root)` → `{ok: true, id, path, forced_by_declared}` |
  `{ok: false, errors}`
  - Validates all seven fields as non-empty strings. A missing or blank field is a
    REFUSAL with a named error and NO file written — a request that cannot state its
    cause is not a request.
  - Resolves the plan's declared `files:` via `plan-coverage.readPlanFiles` across
    `in-progress`, `todo`, `implementation`; sets `forced_by_declared` true iff
    `forced_by` mentions one of them. **A plan whose declaration cannot be read yields
    `forced_by_declared: null`, never `false`** — "I could not look" is not "I found
    nothing", and the screen must be able to say which.
  - Refuses when `file` is ALREADY declared by this plan: there is no growth to request
    and the executor has misread its own refusal.
  - Writes via `inbox.createQuestion` with `source_plan` and `source_step`, and a body
    carrying every field under fixed headings so it is both human-readable and
    parseable.
  - Calls `continuation.registerFork(root, reason)` AFTER the successful write, so the
    Stop hook permits the halt. A failed write registers no fork — an executor whose
    request did not land must not be allowed to stop quietly.
  - Fail-soft on the fork registration only (a continuation module fault must not lose a
    request that already landed); the write itself reports its errors.
- `listScopeGrowthRequests(root)` → `{ok, requests, byPlan, unreadable}`
  - Filters `inbox.listQuestions` to scope-growth items. `unreadable` counts items that
    could not be parsed, so a caller can distinguish "no requests" from "I could not
    read some". `ok: false` when the inbox directory itself cannot be read.
- `isScopeGrowthRequest(item)` → boolean.

Cross-platform: `path.join` throughout, no shell, all I/O through the existing
`inbox`/`safe-fs` choke points.

### File: `src/lib/approval-ledger.js`
**Action:** MODIFY — `computeSpecHash`'s body filter, plus two comment corrections
**Purpose:** Stop insignificant whitespace around checkbox groups from amending the
specification; make the header's dependency claim true.

- Body filter: buffer a pending run of blank lines instead of emitting them immediately.
  A blank line is held; a checkbox line marks the held run as excluded; any other line
  flushes the held blanks to `kept` first. At end of body, held blanks flush unless the
  run was marked. **One linear pass, no regular expression per line, no new require** —
  the existing performance property on the Bash-hook path is preserved and asserted.
- Extend the block comment above the filter with the rule, the proof sketch, and the
  reason it stops exactly where it does.
- Correct line ~57 and the `computeSpecHash` JSDoc: name `safe-fs` alongside
  `gate-order.js` and state the real property (no require cycle; nothing heavy on the
  hook path).

**Nothing else in this file changes.** Not the frontmatter walk, not `EXECUTION_SECTIONS`,
not the deny-list argument, not the fail-closed rule, not the NUL-escape separators, not
`contentMatches`, not `resolveHash`, not any entry-kind guard.

### File: `agents/iron-loop/iron-loop-executor.md`
**Action:** MODIFY — add the third door
**Purpose:** The contract the executor reads mid-build.

Add a section stating: on a refused write to an undeclared file, do NOT revert a
declaration, do NOT proceed outside scope, and do NOT amend `files:` or move the plan
(both arm an auto-revert — name `hash-mismatch` and `wrong-edge` so the reason is
legible). Call `requestScopeGrowth` with all seven fields, record what landed under
`## Execution Record`, and end the turn. Read the file's current text before editing;
where it disagrees with this plan, the file wins.

### File: `CLAUDE.md`
**Action:** MODIFY — the documented test-file count only
This slice adds two test files. `tests/doc-counts.test.js` compares the documented count
against disk. **Read the live count from disk first** — a number written in a plan is a
number someone will make reality match. Both places move. Nothing else is touched.

### Test plan

`tests/scope-growth.test.js` (CREATE), `node:test`:

| # | case | assertion |
|---|---|---|
| 1 | a complete request is written | file lands under `.ctoc/inbox/questions/`, all seven fields present in the body |
| 2 | the count moves | `getInboxCounts(root).questions` increases by one — the dashboard reader, not an internal |
| 3 | the door lists it | `menu-screens.inboxQuestionsScreen(root)` output names the plan and the step |
| 4 | each missing field refuses | seven sub-cases; each refuses, names the field, and writes NO file |
| 5 | a blank-string field refuses | whitespace-only is not a stated cause |
| 6 | an already-declared file refuses | there is no growth to request |
| 7 | `forced_by` naming a declared file | `forced_by_declared === true` |
| 8 | `forced_by` naming nothing declared | `forced_by_declared === false`, and the request IS still written |
| 9 | **an unreadable plan declaration** | `forced_by_declared === null` — never `false`; "could not look" ≠ "found nothing" |
| 10 | the fork is registered | `continuation.registerFork` observed after a successful write |
| 11 | a failed write registers no fork | refusal path leaves the continuation state untouched |
| 12 | `listScopeGrowthRequests` round-trips | written requests are read back, grouped by plan |
| 13 | an unparseable inbox item | counted in `unreadable`, never silently dropped |
| 14 | an unreadable inbox directory | `ok: false` — loud, not an empty list |
| 15 | a second request on one plan | `byPlan` reports 2, so mis-sizing is visible |

`tests/spec-hash-checkbox-runs.test.js` (CREATE):

| # | case | assertion |
|---|---|---|
| 1 | **golden digests, recorded pre-change** | fixtures with NO checkbox-adjacent blanks hash IDENTICALLY before and after — the rule is inert where it should be |
| 2 | the defect is fixed | approved text + checkbox group + trailing blank → digest equals the approved text's digest |
| 3 | a blank BEFORE the group | same, for a blank between heading and first checkbox |
| 4 | a run of several blanks around checkboxes | excluded in full |
| 5 | a blank run with NO checkbox | UNCHANGED — still hashed, the rule does not fire |
| 6 | **adversarial: a `files:` line planted in a run** | frontmatter is unaffected by the rule; digest still breaks |
| 7 | **adversarial: a scope line planted in a run** | the run is no longer blank-only, so nothing is excluded; digest breaks |
| 8 | **adversarial: an acceptance criterion planted in a run** | digest breaks |
| 9 | domain separation still bites | two fixtures with identical bytes and a different frontmatter/body split hash differently |
| 10 | the fail-closed rule is untouched | unterminated frontmatter still yields `ok: false` |
| 11 | one linear pass | no per-line regular expression compiled (asserted structurally, as the existing comment claims) |
| 12 | **the corpus differential can read its input** | the differential counts entries examined, and an entry it cannot read is a LOUD failure, never a pass |

Case 12 is not optional. A differential that reports "zero verdicts changed" after
examining zero entries is this repository's central defect class wearing a new coat.

## What this plan does NOT fix

1. **It does not close the cross-plan hole.** An executor building plan A can still edit a
   file declared by plan B without any refusal, because `findCoveringPlan` matches any
   plan and the hook has no notion of the active plan. This is the larger hole and it
   needs its own slice.
2. **It does not cover whitelisted targets.** Growth into `.ctoc/*`, `plans/*.md`,
   `VERSION`, `.gitignore` or `.gitattributes` is invisible to this mechanism.
3. **It does not change the block message** in `PreToolUse.Edit.js`, which still advises
   only `/ctoc:menu` or an escape phrase. The third door is taught by the executor
   contract, not by the refusal text.
4. **It does not auto-apply an approved request.** When the human says yes, amending
   `files:` and re-crossing Gate 2 remains a human-driven action through the menu. No
   machine writes a declaration.
5. **It does not add an "active plan" concept**, a new store, a new dashboard count, or a
   new slash command.
6. **It does not re-hash or migrate any ledger entry.** If the corpus differential shows
   a live approval would break, the change STOPS rather than adjusting the ledger.
7. **It does not declare the entry point** in `.ctoc/settings.json`; the last-mile check
   still reports not-applicable, reported at Step 16 for scheduling.
8. **It does not normalise any whitespace except blank lines inside checkbox runs.**

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write `tests/scope-growth.test.js` and `tests/spec-hash-checkbox-runs.test.js` in full and
run ONLY those two files **before touching `src/`**. Record every output verbatim.

Case 1 of the hash test must be GREEN immediately — its golden constants are recorded
from the UNMODIFIED code and written verbatim into this plan's execution record. Cases
2–4 must be RED, and the red output must show the digest actually differing. Cases 6–8,
the adversarial ones, must be GREEN both before and after; a case that only passes
afterwards proves nothing about the rule.

Prove the corpus differential is not vacuous: point it at an empty ledger directory and
confirm case 12 FAILS LOUDLY rather than reporting a clean differential.

The whole `scope-growth` suite is RED (the module does not exist). Confirm it fails on
absence, not on a typo.

### Step 9: PREPARE
Read from disk, and where the code disagrees with this plan **the code wins** — record
every discrepancy:
- `src/lib/approval-ledger.js` `computeSpecHash` in full, plus the module header and
  `contentMatches`;
- `src/lib/inbox.js` `createQuestion` / `listQuestions` and the exact frontmatter template
  it writes;
- `src/lib/menu-screens.js` `inboxQuestionsScreen`, to confirm the row renders what the
  request needs to be legible;
- `src/lib/continuation.js` `registerFork`'s real signature;
- `src/lib/plan-coverage.js` `readPlanFiles`;
- `agents/iron-loop/iron-loop-executor.md` in full;
- the two documented test-file counts in `CLAUDE.md` against the live count on disk.

**Then run the corpus differential, BEFORE writing any implementation.** For every ledger
entry with `hash_scope: 'specification'` and a live plan, compute the verdict under the
current algorithm and under the checkbox-run rule. Record: entries examined, entries
verifying today, entries that would START verifying (repairs), entries that would STOP
verifying (harm). **If the harm count is greater than zero, STOP AND REPORT** — do not
implement, do not re-hash, do not weaken the rule. The human decides.

### Step 10: IMPLEMENT
One step, files as sub-items.
- `src/lib/scope-growth.js` — `requestScopeGrowth`, `listScopeGrowthRequests`,
  `isScopeGrowthRequest`; seven-field validation; the three-valued
  `forced_by_declared`; the fork registration after a successful write.
- `src/lib/approval-ledger.js` — the checkbox-run exclusion inside the existing single
  pass; the extended block comment; the two dependency-claim corrections.
- `agents/iron-loop/iron-loop-executor.md` — the third door, naming `hash-mismatch` and
  `wrong-edge` as the reasons the other two roads are closed.
- `CLAUDE.md` — the documented test-file count, both places, from the live count.

### Step 11: REVIEW
- The frontmatter walk, `EXECUTION_SECTIONS`, the deny-list, the fail-closed rule and the
  NUL-escape separators are byte-identical; only the body filter changed.
- No `require` was added to `approval-ledger.js`.
- Golden case 1 recorded BEFORE the edit still passes AFTER it — shown by a passing
  assertion, not asserted in prose.
- The corpus differential is re-run post-change and matches the Step 9 prediction exactly.
  A divergence between prediction and outcome means the rule is not understood — stop.
- `requestScopeGrowth` cannot write a file on any refusal path.
- `forced_by_declared` is never `false` on a read failure.

### Step 12: OPTIMIZE
`computeSpecHash` still performs ONE linear pass and compiles no regular expression per
line; the held-blank buffer is bounded by the length of a single blank run, not by the
file. `listScopeGrowthRequests` reads each inbox item once. No new module is loaded on
the Bash-hook path.

### Step 13: SECURE
- Every request field passes through the existing `stripCtl` treatment on render;
  request text is subagent-authored and therefore untrusted for display.
- `requestScopeGrowth` writes ONLY through `inbox.createQuestion`, so the path is composed
  by the existing choke point and can never escape `.ctoc/inbox/questions/`.
- `plan` and `file` are treated as data, never as paths to open, except through the
  existing `readPlanFiles` boundary.
- No request field is interpolated into a shell string; nothing here shells out.
- The change grants NO new write surface: a request is a question, and only a human
  crossing Gate 2 can widen `files:`.
- Confirm the hook's ledger and verify-evidence denials are untouched.

### Step 14: VERIFY
Run `node --test` on the two new files and on `tests/approval-hash-survives-execution.test.js`,
`tests/approval-ledger-*.test.js`, `tests/ledger-forgery-closed.test.js`,
`tests/source-stays-searchable.test.js`, `tests/gate-migration.test.js`,
`tests/human-gate-check-coverage.test.js`, `tests/menu-screens-coverage.test.js` and
`tests/doc-counts.test.js`.

Then the full gated run `npm test`; record `tests`, `suites`, `pass`, `fail`, the
zero-skipped counter and the coverage line VERBATIM. The coverage floor must not be
lowered.

**Then prove the corpus survived**: re-verify every plan in `review/` and `done/` against
its ledger entry. **If a single approval that verified before this change stops verifying,
STOP AND REPORT** — do not adjust the ledger, do not re-hash, do not proceed. Report the
repairs (entries that started verifying) as a separate number; they are the point.

Lint every changed JavaScript file at `--max-warnings 0`. No git operations.

### Step 15: DOCUMENT
A file header on `scope-growth.js` stating what it is for, why the request lives outside
the plan file (naming both auto-revert paths), and why the inbox rather than the
streaming store. A file header on each new test naming what it defends. The extended
block comment at the checkbox-run filter carrying the rule and its proof sketch. The
`CLAUDE.md` count correction, both places, from the live count.

### Step 16: FINAL-REVIEW
Report: the paths; the Step 8 verbatim red and the recorded golden digests; the Step 9
corpus differential in full (examined, verifying, repaired, harmed); the verbatim green
from Step 14; the before-and-after documented test-file count; the corrected dependency
claim quoted before and after; an explicit restatement of the eight things this plan does
NOT fix; the rejected entry-point finding restated so the human can schedule it; and every
decision taken under ambiguity.

## Decisions Taken Under Ambiguity

1. **The request lives outside the plan file, and the plan is never moved.** Not a style
   choice — both alternatives were traced to an auto-revert (`hash-mismatch` on a
   frontmatter amendment, `wrong-edge` on a stage move), and each would throw the plan out
   of `todo/` mid-build. Leaving the plan untouched is the only design under which the
   approval stays valid and the in-scope work stays covered.
2. **The inbox questions stream, not the streaming question store.** The streaming store
   is gate-scoped through `pendingGateDecisions`, which iterates gate SOURCE stages; a
   building plan sits in `todo/`, a DESTINATION. Questions written there would be read by
   nothing, and making them readable would expose the request to `crossBySufficiency`,
   which auto-crosses on an answered set. The inbox already has a writer, a count, a door
   and a screen, and is stage-agnostic.
3. **`requestScopeGrowth` registers the continuation fork itself.** A caller that forgot
   would be forced onward by the Stop hook — the gate would defeat the stop it exists to
   permit. Registering inside the one function makes forgetting impossible.
4. **Seven mandatory fields, refused when blank.** A free-text question would let "I need
   this file" through, and that is the rubber stamp the human explicitly warned against.
   The fields are chosen so a wandering executor cannot fill them truthfully.
5. **`forced_by_declared` is three-valued, and a read failure yields `null`.** Returning
   `false` when the declaration could not be read would report a verdict on input never
   received — the exact false-green shape this repository fences.
6. **A weak request is FLAGGED, not refused.** An executor may describe a real consequence
   in prose the matcher cannot parse. Silently dropping a real discovery is worse than
   showing a weak one to a reviewer who can judge it.
7. **Work already done is left, not reverted.** The blocked write never landed, so nothing
   out-of-scope exists on disk; everything written is inside the approved write surface. A
   revert would destroy correct work and would itself be an unreviewed bulk write.
8. **The whitespace rule fires only on runs that CONTAIN a checkbox.** A blank-line rule
   that fired anywhere would start dissolving the binding, and no other blank line in a
   plan is written by the executor. This is the narrowest rule that fixes the observed
   defect.
9. **Trailing and leading whitespace are NOT normalised.** Two trailing spaces are a
   markdown hard break and leading whitespace is nesting; normalising either would launder
   a change with meaning.
10. **The frontmatter is not normalised at all.** It carries `files:`, the actual write
    permission. Byte-for-byte is the correct strictness for the region that grants scope.
11. **The corpus differential runs at Step 9, BEFORE implementation, and a single harmed
    approval is a STOP.** 2179 checkbox-then-blank occurrences across 222 plan files were
    measured during planning, so the risk is real. Discovering the harm after the edit
    would mean discovering it with a broken ledger.
12. **A harmed entry is never repaired by re-hashing.** Re-hashing launders every
    post-approval amendment into an approved state — the forgery the ledger exists to
    expose. The escape is a human re-approval or dropping the rule, and that choice is the
    human's.
13. **The cross-plan hole is named, not fixed.** Closing it needs an active-plan concept on
    the every-tool-call hook path. Bolting it onto this slice would put an unproven notion
    of "current plan" into the enforcement path in a plan about something else.
14. **The block message in `PreToolUse.Edit.js` is left alone.** The executor contract is
    loaded for the whole dispatch, so the third door is taught where the executor already
    reads; editing a safety-critical hook for a wording change is not worth the risk here.
15. **The module header correction is folded in; the entry-point declaration is not.** The
    header is comment-only in a file already being edited, and a false invariant in the
    approval machinery is the class this repository fences. The entry-point key would
    change what Step 14 DOES on every future plan and needs its own evidence.
