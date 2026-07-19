---
approved_by: human
approved_at: 2026-07-19T20:16:02.577Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-19T19:32:49.072Z
gate_crossed: implementation → todo
---

---
title: "A plan nobody approved grants no write access — an agent could author a plan file and thereby permit itself to edit the gate enforcement"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/approval-residency.js"
  - "src/lib/plan-coverage.js"
  - "src/hooks/human-gate-check.js"
  - "src/hooks/PreToolUse.Edit.js"
  - "tests/unapproved-plan-grants-nothing.test.js"
  - "tests/plan-coverage-coverage.test.js"
  - "tests/enforcement-hook.test.js"
  - "tests/stacked-frontmatter-plan-coverage.test.js"
  - "tests/w07-crlf-coverage-state.test.js"
  - "tests/human-gate-check-coverage.test.js"
  - "CLAUDE.md"
  - ".ctoc/false-green-baseline.json"
  - "tests/e2e-enforcement-and-gates.test.js"
  - "tests/gate3-verify-evidence-write-deny.test.js"
  - "tests/pretooluse-edit-coverage.test.js"
  - "tests/security-enforcement-evasion.test.js"
  - "tests/w01-edit-write-deny-protocol.test.js"
  - "tests/w01-multiedit-notebookedit-parity.test.js"
  - "tests/readme-numbers.test.js"
---

# A plan nobody approved grants no write access

## The defect

The permission that decides whether an agent may edit a file is derived from a
document that the same agent is free to write.

Three steps, every one of them something agents do many times a day:

1. `src/hooks/PreToolUse.Edit.js:422` decides whether an edit is permitted by
   calling `coverage.findCoveringPlan(targetFile, root)`. A match is an allow.
2. `src/lib/plan-coverage.js:32` scans
   `STAGE_PRIORITY = ['in-progress', 'todo', 'implementation']`. **`implementation`
   is PRE-approval** — Gate 2 is the `implementation → todo` edge
   (`src/lib/gate-order.js:24-28`), so a plan sitting in `plans/implementation/`
   has not been approved by anyone.
3. Plan files are freely writable: `PreToolUse.Edit.js:63` whitelists
   `/^plans\/.*\.md$/`, ahead of every coverage check.

So an agent writes `plans/implementation/anything.md` containing
`files: ["src/hooks/human-gate-check.js"]` and has just granted itself permission
to edit the hook that enforces the four human gates. No human is involved at any
point in that chain.

**The reporter reproduced exactly this**, writing a probe plan at
`plans/implementation/zz-probe.md` and observing `findCoveringPlan` return the probe
as the covering plan for `src/hooks/human-gate-check.js`, then deleting the probe.

### It is not hypothetical in this repository right now

`plans/implementation/` currently holds eight unapproved plans. Read from disk
during planning, **two of them already declare the enforcement hook itself**:

| unapproved plan | declares |
|---|---|
| `00069-e1-enforcement-mode-honored-with-a-gate-floor` | `src/hooks/PreToolUse.Edit.js`, `src/hooks/PreToolUse.Task.js` |
| `00072-r1-per-request-ctoc-routing-hook` | `src/hooks/PreToolUse.Edit.js` |

Both are legitimate plans awaiting Gate 2. That is the point: the mechanism does
not distinguish them from a probe, so the write surface is open today.

### Planning could not execute code

This plan was produced by an agent with read-only tools — no shell. Every claim
above was verified **by reading the code named beside it**, and the reporter's probe
was reproduced by them, not re-run here. Three things below are therefore marked
**MEASURE AT STEP 9** rather than asserted. Where this plan and the code disagree,
**the code wins and the executor records the discrepancy.**

## The ruling, and why the ruling alone is not enough

The human ruled, and it is not to be softened or widened:

> **ONLY APPROVED PLANS GRANT WRITE ACCESS.** Drop the pre-approval stage from the
> permission check. An agent may still WRITE a plan; the plan buys no permission
> until the human approves it.

Implementing only the literal half of that — deleting `'implementation'` from
`STAGE_PRIORITY` — **does not close the defect.** The identical three-step attack
survives, one directory over:

- the whitelist `/^plans\/.*\.md$/` matches `plans/todo/zz-probe.md` just as happily
  as `plans/implementation/zz-probe.md`;
- `findCoveringPlan` scans `plans/todo/` and would return the squatted probe;
- the compensating control does not fire **on this repository**. The gate sweep
  (`src/hooks/human-gate-check.js`, registered `PreToolUse` matcher `"*"`) would
  classify a plan with no ledger entry as `no-ledger-entry` — and
  `src/lib/gate-migration.js:90` makes `no-ledger-entry` **the one reason whose
  revert is WITHHELD on an unmigrated project.** The migration marker
  `.ctoc/approvals/.migration-complete.json` **does not exist here** (checked during
  planning). So a squatted `todo/` plan is reported and left in place.

This is the human's own second question answered by measurement: *being in a
post-approval stage directory is not proof of approval.* The stage drop is the
necessary half; the sufficient half is that **coverage must consult the approval
ledger**. Both ship here, because shipping only the first would let the reporter
re-run their probe against `plans/todo/` and get the same result — a fix that
files a ticket rather than closing a hole.

## What counts as approved

`.ctoc/approvals/` is the ledger, and it is genuinely unforgeable by an agent:
`PreToolUse.Edit.js:389` denies every editing-tool write beneath it *ahead of* the
`.ctoc/` whitelist, and `PreToolUse.Bash.js` denies the Bash channel including inline
evaluation referencing the module. **An agent cannot mint an entry.** That is what
makes the ledger a real predicate and the stage directory a fake one.

**There must be exactly ONE encoding of "approved."** One already exists:
`classifyResidency` in `src/hooks/human-gate-check.js:253`. It rejects
`ledger-unkeyable`, `ledger-corrupt`, `no-ledger-entry`, `wrong-edge`,
`hash-mismatch`, `hash-mismatch-legacy`, `unreadable`, `unknown-provenance`,
`pipeline-not-allowed` and the two no-evidence reasons — the exact set this
permission check needs. Writing a second predicate inside `plan-coverage.js` would
create two encodings of an approval predicate, which this codebase correctly names a
forgery surface (`human-gate-check.js:269-274`, `approval-ledger.js:442-448`).

So `classifyResidency` is **extracted, not copied**, into `src/lib/approval-residency.js`
and both consumers require it. `plan-coverage.js` may not require a hook —
dependencies flow hooks → commands → lib, never the reverse — which is the reason the
extraction is mandatory rather than a matter of taste.

### The build-phase mapping, which is load-bearing

`classifyResidency` requires `entry.stage_to === folderName`. Applied naively that
**blocks the entire build phase**, and this is the trap that would get the fix
reverted within a week:

- `actions.js:844 startExecution` physically moves a plan into `plans/in-progress/`;
- `in-progress` is **not** a gate destination — `gate-order.js` yields
  `GATE_DESTINATIONS = ['implementation', 'todo', 'done']`, and
  `crossesHumanGate('todo', 'in-progress')` is `false`;
- therefore **no ledger entry ever records `stage_to: 'in-progress'`**, and
  `classifyResidency(plan, 'in-progress', …)` returns `wrong-edge` for every
  actively-building plan in existence.

The approval that admits a plan into the build phase is the **Gate 2 `todo` entry**,
which it keeps for the whole build. So coverage classifies a plan residing in
`in-progress` **against the `'todo'` edge**. This is not a weakening: it asks
precisely "did a human cross Gate 2 with this plan?", which is the question.

## What stops working, item by item

| # | What stops | Acceptable? |
|---|---|---|
| 1 | The 8 unapproved plans in `plans/implementation/` stop granting write access — including the two that currently grant edits to `PreToolUse.Edit.js`. Work on them requires crossing Gate 2 first. | **Yes — this IS the fix.** Exactly the human's ruling. |
| 2 | A plan squatted directly into `plans/todo/` with no ledger entry grants nothing. | **Yes** — closes the hole the stage drop alone leaves open. |
| 3 | An **approved** plan whose `files:` list is later amended stops granting coverage, because the specification hash covers the frontmatter in full. | **Yes, and it is the same tension `00099` hit** (its Decision 10). An executor that needs one more file must ask, not self-grant. `00123` is the plan that gives it a way to ask. Until then the deny message must say so — see below. |
| 4 | A plan whose ledger entry is **legacy whole-file scope** loses coverage as soon as anything is written into the plan file. | **Needs handling — see below.** |
| 5 | Fixture plans in four existing test files have no ledger entries, so they stop matching. | **Yes** — the tests encode the defect and are corrected, tightening not loosening. |

### Item 4 is the real operational risk, and it is measured

Read from disk during planning: **18 of 293 ledger entries carry `hash_scope`**; the
other 275 are legacy `file` scope, which invalidates on any edit to the plan file.
Cross-referencing the 12 plans currently in `plans/todo/` against those 18:

- eleven — `00078`, `00082`, `00085`, `00090`, `00097`, `00101`, `00102`, `00103`,
  `00120`, `00121`, `00122` — carry `hash_scope: "specification"`, so their approvals
  survive their own execution logs and coverage holds throughout the build;
- **one — `00067-y1-ctoc-start-entry-point` — has a legacy entry with no
  `hash_scope`.** It verifies only while its file is byte-identical to approval time.
  The moment its executor writes a `- [x]`, it will stop verifying and its executor
  will be locked out of its own declared files, mid-build.

That single plan is the whole blast radius and it is named, not discovered later by an
irritated human. Three things make it survivable:

1. **MEASURE AT STEP 9** whether `00067` verifies right now. If it does not already,
   the condition is pre-existing, not caused here.
2. **The block is not silent.** A denial caused by an unapproved or invalidated plan
   must name the plan, the reason, and the remedy. A lockout the human can read is a
   correction; a lockout they cannot read is what gets reverted.
3. **The remedy is a human action through the menu** — re-approval — which is the
   correct owner. This plan does not re-hash, migrate, or backfill any entry.
   Scheduling that is the human's.

### Cost of consulting the ledger

Cheaper than it sounds, and plausibly **net negative**:

- `findCoveringPlan` **already reads every plan file in every scanned stage**
  (`readPlanFiles` → `readFileSync`). The expensive part is already paid.
- Dropping `implementation` **removes 8 file reads** per edit tool call here.
- The approval check runs **lazily, only on a plan whose glob actually matched** —
  normally zero or one. It adds one small JSON read plus one SHA-256 over content
  already in memory (plan files here are tens of kilobytes; SHA-256 runs at hundreds
  of megabytes per second).
- The content is read **once** and reused for glob parsing and hashing.

**MEASURE AT STEP 9.** Planning had no shell; this is an estimate from the code, not a
measurement. Step 9 times `findCoveringPlan` before and after over the real repository
and records both numbers. If the measured cost exceeds roughly 10 milliseconds per
call, **stop and report** rather than shipping a hook that makes every edit feel slow.

## Fail CLOSED — and note the inversion

This is a **permission** check. If it cannot read the plans, or cannot read the
ledger, it must **DENY**. That is the opposite of the fail-open default this codebase
uses for reporting checks, and it is written here so a future maintainer does not
"fix" it into consistency with its neighbours. *A permission check that allows because
it could not look is the whole defect, repeated.*

There is a sharp trap in how fail-closed must be **implemented**:

> `PreToolUse.Edit.js:445-449` catches everything and **fails OPEN**. So a THROW out of
> `plan-coverage.js` becomes an ALLOW. Fail-closed here therefore means
> **return `null`, never throw** — the module must be total.

Concretely:
- a plan file that cannot be read → that plan contributes no globs (already true;
  now load-bearing and documented as such);
- a stage directory that **exists but cannot be listed** → return `null` immediately
  (today `readdirSync` throws → hook catches → allow: this is a live fail-open path
  and it is closed here);
- a stage directory that does not exist → skip, not an error;
- ledger absent, corrupt, unkeyable, wrong edge, hash mismatch, unknown provenance →
  not approved → that plan grants nothing.

## The escape hatch — examined, and left alone

Escape phrases sit at `PreToolUse.Edit.js:431-439`, **after** coverage. So a human who
typed `hotfix` earlier in the session can edit `human-gate-check.js` even after this
fix. That is examined and **deliberately unchanged**:

`findEscapeInTranscript` matches only over `extractUserTypedText`, which keeps
`type:"user"` text blocks and **excludes `tool_result` blocks** — the role-scoping
that stopped CTOC's own block message and a `Read` of `CLAUDE.md` from unlocking the
next edit. An escape phrase therefore requires **the human to personally type it**.

The defect being fixed is an agent **self-granting**. A human typing a phrase is
consent, not self-granting. Narrowing the human's own escape would widen the ruling
beyond what was asked. **Not changed; recorded as a deliberate residual.**

## The worse variant: a glob grants everything

Reading `tokenizeGlob`/`matchTokens` (`plan-coverage.js:52-139`): `**` tokenizes to a
single `globstar`, which absorbs every character **including `/`**. So a plan
declaring `files: ["**"]` matches **every path in the repository**.

`specificity('**')` computes `2 − 5 − 2 = −5`, so it loses to any specific glob within
the same stage — but when it is the only match, **it wins, and it grants blanket
write access to the whole project.** Combined with the defect, an unapproved
seven-line plan file was a repository-wide write grant. That is materially worse than
the single-file probe and it is closed by the same fix: an unapproved `**` plan grants
nothing. An **approved** `**` plan still grants everything — that is the human's
consent, and whether to cap glob breadth is the human's to schedule. **Not capped here.**

Root confinement, read line by line, **holds**:

- `findCoveringPlan:324-333` rejects a target whose relative path is `..`, starts with
  `../` or `..\`, or is absolute (the Windows cross-drive case included);
- `globEscapesRoot:282-289` normalizes the glob and rejects one resolving to `..` or
  `../…`, so `files: ["../../**"]` is ignored;
- an absolute glob such as `/etc/passwd` survives `globEscapesRoot` but can never match,
  because the target side is always a root-relative path.

**One traversal question could NOT be verified and is stated as unverified:** the match
is pure path arithmetic with no `realpath`, so a **symbolic link inside the repository
pointing outside it** would present a clean repo-relative path and pass confinement.
Whether the editing tool follows such a link was not testable without a shell. Step 13
probes it and **reports**; it is not fixed here.

## Implementation Details

### Dependency graph

```
src/lib/approval-residency.js  (NEW)
  ├─requires→ src/lib/approval-ledger.js      [existing, unchanged]
  ├─requires→ src/lib/gate-order.js           [existing, unchanged, pure constants]
  └─requires→ src/lib/safe-fs.js              [existing, unchanged]

src/lib/plan-coverage.js  ──requires→ src/lib/approval-residency.js   [NEW edge]
src/hooks/human-gate-check.js ──requires→ src/lib/approval-residency.js [NEW edge,
                                          replacing its local definition]
src/hooks/PreToolUse.Edit.js ──already requires→ src/lib/plan-coverage.js
```

No cycle: `approval-ledger` requires neither `plan-coverage` nor `approval-residency`.
No layer violation: every new edge points into `lib/`.

### File: `src/lib/approval-residency.js`
**Action:** CREATE
**Purpose:** The ONE encoding of "is this resident plan genuinely approved" — moved
out of a hook so a library may consult it without a lib→hooks dependency.

Move, **byte-for-byte in behaviour**, from `src/hooks/human-gate-check.js`:
`HASH_SENSITIVE_FOLDERS`, `BUILD_PHASE_START`, `PRE_BUILD_GATES`, the local `readPlan`
helper, `classifyResidency` and `hasLedgerApproval`. Carry the surrounding block
comments across intact — they are the argument for why each rejection exists.

Add one new export, and nothing else that is new:

- `isApprovedForCoverage(planPath, stage, projectPath, content)` → `{ approved, reason, kind }`
  - Maps the **residency stage** to the **gate edge** to classify against:
    `'in-progress' → 'todo'` (Gate 2 admits a plan to the build phase and it holds that
    entry throughout), `'todo' → 'todo'`. Any other stage → `{ approved: false,
    reason: 'stage-not-coverable', kind: null }` — so a future stage added to the
    coverage list fails CLOSED instead of inheriting an accidental allow.
  - Delegates to `classifyResidency(planPath, edge, projectPath, content)`, passing the
    **already-read content** so the plan file is never read twice.
  - **Never throws.** Wrap the delegation; any unexpected error returns
    `{ approved: false, reason: 'classify-error', kind: null }`. A throw would reach
    the hook's fail-open catch and become an allow.

### File: `src/hooks/human-gate-check.js`
**Action:** MODIFY — delegation only
**Purpose:** Keep one definition, at its new home, with the hook's public surface and
observable behaviour unchanged.

- `require('../lib/approval-residency')` and delete the moved definitions.
- **Re-export `classifyResidency` and `hasLedgerApproval` from this module under their
  existing names.** Four test files and `revertAll` reference them; the re-export keeps
  every existing call site working.
- **Nothing else in this file changes** — not `WITHHELD_REASONS` handling, not the
  revert logic, not the fail-open-with-logging outer catch, not the migration
  interaction. Its existing tests are the proof and must pass **unmodified in
  assertion**.

### File: `src/lib/plan-coverage.js`
**Action:** MODIFY
**Purpose:** Only an approved plan grants coverage, and the module can never fail open.

1. `STAGE_PRIORITY` becomes `['in-progress', 'todo']`. Replace the header's stage-priority
   sentence with **why** `implementation` is absent: it is pre-approval, and a plan an
   agent can author must not confer permission.
2. Read each plan file **once**. Add an internal `readPlanFilesFrom(content)` holding the
   current parsing logic; `readPlanFiles(planPath)` stays exported and becomes the
   read-then-parse wrapper (`00123` consumes it, so the signature is preserved).
3. In the stage loop: parse globs → test them → **only on a match**, call
   `approvalResidency.isApprovedForCoverage(planPath, stage, root, content)` with the
   content already in hand. Unapproved candidates are excluded **before** specificity
   ranking, so an approved less-specific glob correctly wins over an unapproved
   more-specific one.
4. Wrap `readdirSync` in a try/catch: an existing-but-unlistable stage directory returns
   `null` for the whole call. `existsSync === false` still skips, silently.
5. Add `explainDenial(targetFile, root)` → `{ plan, stage, glob, reason } | null`, for
   the **block path only**. It re-runs the scan and reports the best-matching plan that
   was rejected together with its reason. Never throws; returns `null` on any fault.
6. Export `explainDenial`. `globToRegex` and `touchesOverlap` are **untouched** —
   `task-registry.js`, `task-reconcile.js` and `plan-index/conflict-detect.js` depend on
   them and no behaviour of theirs may move.

### File: `src/hooks/PreToolUse.Edit.js`
**Action:** MODIFY — the block message only
**Purpose:** A lockout the human can read is a correction; one they cannot read is what
gets reverted.

At step 5, before `block(...)`, call `coverage.explainDenial(targetFile, root)` inside a
try/catch defaulting to `null`. When it returns a rejected plan, extend the stderr banner
and the deny reason with one line naming the plan, the reason and the remedy — for
example: *"`plans/todo/00067-…` declares this file but its approval is not valid
(`hash-mismatch-legacy`). Re-approve it via `/ctoc:menu`."* When it returns `null`, the
message is **byte-identical to today's**.

Reasons are fixed vocabulary tokens and a repository-relative plan reference; **no file
contents, no absolute paths, no stack traces.** The decision itself does not change — this
touches wording, not the allow/deny outcome.

### File: `tests/unapproved-plan-grants-nothing.test.js`
**Action:** CREATE
**Purpose:** Reproduce the reporter's probe and pin every direction of the fix.

Fixtures are real `os.tmpdir()` directories. Approval fixtures are minted with the **real
`approval-ledger`** (`computeSpecHash` over the fixture's actual bytes) — never a
hand-written digest, which would drift the moment the hash changes.

| # | Case | Assertion |
|---|---|---|
| 1 | **the reporter's probe** — unapproved plan in `implementation/` declaring `src/hooks/human-gate-check.js` | `findCoveringPlan` returns `null` |
| 2 | **the same plan, approved** — in `todo/` with a real specification-scope entry, `stage_to: 'todo'`, `approved_by: 'human'` | returns that plan. **Both directions, or the fix could be a blanket denial passing half the tests** |
| 3 | **the squat** — unapproved plan written directly into `todo/` | `null` — the hole the stage drop alone leaves |
| 4 | **amendment after approval** — approved `todo` plan whose `files:` gains an entry afterwards | `null` for the added file; still covered for an unchanged declared file |
| 5 | **the build phase still works** — plan in `in-progress/` whose entry is `stage_to: 'todo'` | **covered.** Without this the whole build phase is dead |
| 6 | **`files: ["**"]` unapproved** | `null` for `src/hooks/human-gate-check.js`, `.ctoc/x`, `package.json` |
| 7 | **`files: ["**"]` approved** | matches — documented consent, so nobody "discovers" it later |
| 8 | **traversal** — `files: ["../../**"]`, and a target of `../outside.js` | `null` both ways |
| 9 | **legacy scope, content unchanged** | covered |
| 10 | **legacy scope, content changed** | `null`, and `explainDenial` reports `hash-mismatch-legacy` |
| 11 | **unknown provenance** — `advanced_by: 'bogus'` | `null` |
| 12 | **pipeline entry at `todo`** | `null` (`pipeline-not-allowed`) |
| 13 | **sufficiency entry with evidence at `todo`** | covered |
| 14 | **sufficiency entry with no evidence** | `null` |
| 15 | **fail closed on an unlistable stage directory** | `null`, **and no throw** — stub `safe-fs`'s `readdirSync` on its cached exports object to throw, restore in `finally`. This is the fail-open path being closed; asserting the absence of a throw is the whole point |
| 16 | **fail closed on a corrupt ledger entry** — invalid JSON | `null` |
| 17 | **the fence is not vacuous** | the identical fixture **with** a valid approval matches, proving cases 1/3/6 fail for the approval reason and not because the harness never matched anything |

Case 17 is not optional. Seventeen assertions of `null` from a scan that never matched
anything would be this repository's central defect class rebuilt inside its own fix.

Cross-platform: `path.join` throughout, `os.tmpdir()`, recursive-force cleanup in
`finally`, no shell.

### Files: the four existing coverage/enforcement test files
**Action:** MODIFY — fixtures gain approvals; assertions tighten

`tests/plan-coverage-coverage.test.js`, `tests/enforcement-hook.test.js`,
`tests/stacked-frontmatter-plan-coverage.test.js`, `tests/w07-crlf-coverage-state.test.js`
build plan fixtures with **no ledger entries**, so every positive case would go red.

- Extend each file's `writePlan` helper to **also mint a real ledger entry** by default
  (specification scope, `stage_to` mapped as the production code maps it), with an
  `{ approved: false }` option for negative cases. One helper change, not per-test edits.
- `plan-coverage-coverage.test.js` currently pins the defect and must be **inverted**:
  `falls_through_to_implementation_when_it_is_the_only_covering_stage` ("Pins that
  implementation IS considered (not dropped)") becomes a test that an
  implementation-stage plan is **NOT** covered, whatever its approval state.
  `todo_wins_over_implementation` loses its implementation arm; `makeRoot`'s default
  stage list drops `implementation`.
- This is Operating Lesson 14 in its permitted direction: the tests assert a bug, and
  the replacement asserts the real behaviour more strictly. **No assertion may be
  weakened, widened, or deleted to make red go green.** Any glob-semantics,
  most-specific-wins, CRLF or stacked-frontmatter case must survive **unchanged** apart
  from its fixture gaining an approval — those cases guard a different property and
  weakening one would trade this defect for another.

`tests/human-gate-check-coverage.test.js` is declared because the extraction may move a
`require` path. Its **assertions must not change**: the hook's behaviour is unchanged and
that file is the proof.

### Files: `CLAUDE.md` and `.ctoc/false-green-baseline.json`
**Action:** MODIFY — counts and ratchet only

- `CLAUDE.md`: this slice adds **one test file and one `src/lib` module**, and
  `tests/doc-counts.test.js` checks both against disk — the test-file count in **two**
  places and the `src/lib` module count in one. **Read the live counts from disk first**;
  a number written in a plan is a number someone will make reality match.
- `.ctoc/false-green-baseline.json` lists
  `src/lib/plan-coverage.js:parse-default:readPlanFiles` twice. Splitting `readPlanFiles`
  may shift those entries. `findings` may only **SHRINK**; if the refactor removes a
  finding, remove the entry. **Adding a `whitelist` entry is forbidden here** — silencing
  a fence inside a security fix is indefensible. If the fence goes red with a NEW finding,
  fix the code.

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `approval-residency.isApprovedForCoverage` | `plan-coverage.findCoveringPlan` | `PreToolUse.Edit.js:422`, on every Edit/Write/MultiEdit/NotebookEdit call |
| `approval-residency.classifyResidency` | `human-gate-check.revertAll` (re-exported) | `PreToolUse` matcher `"*"`, every tool call |
| `plan-coverage.explainDenial` | `PreToolUse.Edit.js` block path | the human's terminal, on every denial |
| the four amended test files | the suite | `npm test` |

Nothing here is reachable only from a test.

## What this does NOT fix

1. **The hook still does not know WHICH plan is being built.** An executor building
   plan A can edit any file declared by an approved plan B. That is a sibling hole and
   it stays **OPEN** — the human explicitly did not choose the larger fix, and
   **scheduling it is the human's, not this plan's**. `00123` (in `implementation/`,
   unapproved) lets an executor *ask* for one more file; it does not close this.
2. **An approved `files: ["**"]` still grants the whole repository.** Capping glob
   breadth is a separate decision for the human.
3. **No ledger entry is re-hashed, migrated, or backfilled.** `00067`'s legacy entry is
   reported, not repaired. Re-approval is a human action through the menu.
4. **Escape phrases are unchanged.** A human who types one can still edit gate-enforcing
   code. That is consent, deliberately preserved.
5. **The migration marker is not written.** `no-ledger-entry` reverts stay withheld on
   this unmigrated project; this fix does not depend on them.
6. **Symbolic-link escape is unverified and unfixed** — probed and reported at Step 13.
7. **`plans/**.md` stays whitelisted.** Agents may still author plans; a plan simply
   buys nothing until approved. Narrowing that whitelist was not asked for and would
   break the planner.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write `tests/unapproved-plan-grants-nothing.test.js` in full and run **only that file,
before touching `src/`**. Required starting state, recorded verbatim:

- **Case 1 RED** — today an unapproved `implementation/` plan DOES cover
  `src/hooks/human-gate-check.js`. This is the reporter's probe reproduced inside the
  suite. If it is not red, **stop**: the premise is wrong and the plan is wrong.
- **Case 3 RED** — the `todo/` squat is covered today.
- **Case 6 RED** — an unapproved `**` covers everything today. Record which probed
  paths it matched; that measurement is the blast radius of the glob variant.
- **Cases 2, 5, 9 GREEN** already — they must stay green, and are the proof the fix is
  not a blanket denial.
- **Case 15** — record whether an unlistable stage directory currently **throws**. A
  throw here is the live fail-open path; record it verbatim as the before-state.
- **Case 17** must be GREEN from the first run.

### Step 9: PREPARE
Read from disk, in full, before changing anything: `src/lib/plan-coverage.js`;
`src/hooks/human-gate-check.js:142-340`; `src/lib/approval-ledger.js` (`classifyResidency`'s
whole dependency surface — `readEntryResult`, `entryKind`, `contentMatches`,
`computeSpecHash`); `src/lib/gate-order.js`; `src/lib/gate-migration.js`;
`src/hooks/PreToolUse.Edit.js:378-450`; and the four test files whose fixtures change.

Then MEASURE the three items this plan could not:

1. **Does `00067-y1-ctoc-start-entry-point` verify right now?** Run
   `contentMatches(entry, content)` against its live file. Record the verdict. If it
   already fails, the condition is pre-existing; if it passes, record that this fix
   makes its eventual invalidation load-bearing.
2. **Every plan in `todo/` and `in-progress/`, classified.** For each, record slug,
   `hash_scope`, `stage_to`, `entryKind`, and whether `isApprovedForCoverage` would
   accept it. **Any plan that would lose coverage is reported to the human before
   Step 10 proceeds.**
3. **Timing.** `findCoveringPlan` over the real repository, before and after, for a
   covered target and an uncovered one. Record both. **Above roughly 10 ms per call,
   stop and report.**

Also confirm the live `CLAUDE.md` counts and re-read `tests/doc-counts.test.js` for
every count it enforces. Where the code disagrees with this plan, **the code wins** —
record the discrepancy.

### Step 10: IMPLEMENT
One step, files as sub-items.
- `src/lib/approval-residency.js` — the extraction plus `isApprovedForCoverage`, with the
  stage→edge map and the never-throw wrapper.
- `src/hooks/human-gate-check.js` — require and re-export; definitions deleted; nothing
  else touched.
- `src/lib/plan-coverage.js` — `STAGE_PRIORITY` drops `implementation`;
  `readPlanFilesFrom` split; lazy approval filter before specificity ranking;
  `readdirSync` guarded; `explainDenial` added and exported.
- `src/hooks/PreToolUse.Edit.js` — the block-path explanation only.
- `tests/unapproved-plan-grants-nothing.test.js` — the seventeen cases.
- the four existing test files — `writePlan` mints approvals; the implementation-stage
  assertions inverted.
- `CLAUDE.md` — both counts, from the live values read at Step 9.
- `.ctoc/false-green-baseline.json` — only if a finding genuinely disappeared.

### Step 11: REVIEW
Confirm: there is exactly **one** definition of `classifyResidency` in the repository, and
`src/lib/plan-coverage.js` contains **no** second approval predicate. Confirm no `require`
points from `lib/` into `hooks/`. Confirm `globToRegex`, `touchesOverlap` and
`readPlanFiles`' exported signature are unchanged, and that `task-registry`,
`task-reconcile` and `plan-index/conflict-detect` still pass untouched. Confirm the
approval check runs **only on a matched glob** and the plan file is read **once**. Confirm
`tests/human-gate-check-coverage.test.js` passes with **no assertion modified** — that is
the whole proof the hook did not move. Re-read the four amended test files and confirm no
assertion was weakened, widened or deleted; every change is a fixture gaining an approval
or a defect-pinning assertion being inverted.

### Step 12: OPTIMIZE
Confirm each plan file is read at most once per call and no plan is hashed unless its glob
matched. Confirm `explainDenial` runs **only** on the block path and never on an allow.
Confirm no regular expression is compiled per plan or per line beyond what exists today,
and that dropping a stage plus lazy hashing leaves the measured timing at or below the
Step 9 before-number. Record the after-number.

### Step 13: SECURE
This is the security step of a security fix; do it adversarially.
- Confirm **fail-closed on every fault path**: unlistable stage directory, unreadable plan,
  absent/corrupt/unkeyable ledger, unestablishable specification boundary, unexpected
  throw inside the classifier. Each yields `null`, **never a throw**, because a throw
  becomes an allow at `PreToolUse.Edit.js:445`.
- Re-run the reporter's probe **by hand** against the built code, in both the
  `implementation/` and `todo/` locations, and record both results.
- Confirm the deny message leaks no file contents, no absolute path and no stack trace.
- Confirm the ledger-directory and verify-evidence denials at `PreToolUse.Edit.js:389`
  and `:402` still fire ahead of the `.ctoc/` whitelist, unchanged.
- Confirm no new agent-writable input reaches an approval decision: the ledger stays
  agent-write-denied on both the Edit and the Bash channels.
- **Probe the symbolic-link question** — a link inside the repository pointing outside it —
  and **report** the finding. It is not fixed here.

### Step 14: VERIFY
Targeted run first: the new file, the four amended coverage/enforcement files,
`tests/human-gate-check-coverage.test.js`, `tests/ledger-forgery-closed.test.js`,
`tests/approval-hash-survives-execution.test.js`, `tests/gate-migration.test.js`,
`tests/stale-cleanup-human-gate.test.js`, `tests/task-registry.test.js`,
`tests/doc-counts.test.js`, `tests/false-green-fence.test.js`,
`tests/architecture-invariants.test.js`.

Then the full gated run `npm test`; record `tests`, `suites`, `pass`, `fail`, the
zero-skipped counter and the coverage line **verbatim**. The coverage floor must not be
lowered. Lint every changed JavaScript file at `--max-warnings 0`.

Then prove the pipeline still runs: confirm every plan in `todo/` and `in-progress/`
identified at Step 9 as coverage-holding **still resolves through `findCoveringPlan` for
its own declared files**. If a plan that should be buildable is not, **stop and report** —
do not relax the predicate to make it pass. **No git operations.**

### Step 15: DOCUMENT
A file header on `approval-residency.js` stating that it is the ONE encoding of approved
residency, why it lives in `lib/` (a library may not require a hook), and why the
`in-progress → todo` edge mapping is correct rather than lenient. An inline comment at
`STAGE_PRIORITY` naming why `implementation` is absent and what happens if someone adds it
back. A comment at every fail-closed return stating the inversion — that this module must
never throw, because the hook's catch fails open. Update `CLAUDE.md`'s counts from the live
values; if its enforcement paragraph describes the three-stage priority, correct it to
match the code.

### Step 16: FINAL-REVIEW
Report: the paths; the Step 8 verbatim red for cases 1, 3 and 6 and which paths the
unapproved `**` matched; the Step 9 measurements (`00067`'s verdict, the full
todo/in-progress classification, both timing numbers); the Step 13 hand-run probe results
in both locations; the symbolic-link finding; the verbatim green from Step 14; the
before-and-after documented counts; an explicit restatement of the seven things this does
NOT fix — the active-plan hole first, named as the human's to schedule; and every decision
taken under ambiguity.

## Ordering and file conflicts

`src/hooks/PreToolUse.Edit.js` is also declared by `00069` and `00072`, both unapproved in
`implementation/`. `CLAUDE.md` is declared by `00069`, `00086`, `00089`, `00110` and
`00123`; `.ctoc/false-green-baseline.json` by `00086`. Plans build **sequentially**, so
there is no concurrent-edit hazard — but every count and baseline value is **read live at
Step 9**, never taken from any plan.

**This plan should land before the other implementation-stage plans**, because it changes
whether they grant write access at all. After it ships, each of those eight plans needs to
cross Gate 2 before its executor can edit anything — which is the intended new order of
operations and worth stating so it is not mistaken for breakage.

## Decisions Taken Under Ambiguity

1. **The ledger check ships WITH the stage drop, rather than being deferred.** The human
   ruled "drop the pre-approval stage" and separately asked whether coverage should
   require a ledger entry. Measurement answered it: the stage drop alone moves the probe
   from `plans/implementation/` to `plans/todo/` and changes nothing, because the whitelist
   covers all of `plans/` and this project is unmigrated, so `no-ledger-entry` reverts are
   withheld. Shipping only the literal half would close a hole the reporter could reopen in
   one Write call. This implements the ruling — *only approved plans grant write access* —
   rather than widening it.
2. **`classifyResidency` is extracted, not duplicated.** A second approval predicate inside
   `plan-coverage.js` would be a divergence surface, which this codebase names a forgery
   surface in the code being reused. The extraction is what makes one encoding possible
   without a `lib → hooks` dependency.
3. **A plan in `in-progress` is classified against the `todo` edge.** No ledger entry ever
   records `stage_to: 'in-progress'` (it is not a gate destination), so the alternative is
   blocking every actively-building plan. The Gate 2 approval is the one that admits a plan
   to the build phase, so this asks the right question rather than a lenient one.
4. **Content matching is REQUIRED, accepting that one queued plan may lose coverage.**
   Accepting an entry on existence alone would let an agent amend an approved plan's
   `files:` list and self-grant through a different door — the same defect wearing a
   different coat. The cost is `00067-y1-ctoc-start-entry-point`, named, measured at
   Step 9, and remedied by human re-approval.
5. **The denial explains itself.** A permission fix that locks someone out silently gets
   reverted, and reverting this one reopens a self-granting write surface on gate
   enforcement. The extra message costs nothing on the allow path and changes no decision.
6. **Fail-closed is implemented as return-`null`-never-throw.** The obvious reading — throw
   on fault — produces the exact opposite, because the hook's outer catch fails open. This
   is written into the code comments, not just here, because it is the kind of thing a
   future maintainer "fixes" into consistency with its neighbours.
7. **Escape phrases are examined and left in place.** They are role-scoped to text the
   human personally typed, so they express consent, not agent self-granting. Removing them
   would widen the ruling.
8. **An approved `**` is left able to grant everything.** The defect is that an
   *unapproved* plan granted anything; an approved plan granting what it declares is the
   system working. Capping glob breadth is a real question and it is the human's to
   schedule, not this plan's to decide.
9. **The four existing test files are amended rather than left red.** They assert the
   defect — one of them says so in a comment ("Pins that implementation IS considered").
   That is the narrow permitted case for changing a test, and every change either adds a
   fixture approval or tightens an assertion toward the real behaviour. Nothing is
   weakened, and the glob, CRLF and stacked-frontmatter cases survive untouched.
10. **Twelve files is larger than the usual slice.** Splitting it would ship a half-fix:
    the stage drop without the ledger check is a hole in a different directory, and the
    extraction without both consumers is two encodings of an approval predicate. The size
    is the cohesion of the change, and it is stated rather than hidden.
11. **Nothing is measured that planning could not measure.** Planning had no shell, so the
    timing estimate, `00067`'s current verdict, and the symbolic-link behaviour are marked
    MEASURE AT STEP 9 or reported at Step 13 instead of being asserted. An estimate written
    as a fact is the defect class this repository fences.

## Execution Record (Steps 8–16)

- [x] **Step 8 TEST (TDD-Red)** — `tests/unapproved-plan-grants-nothing.test.js` written and run
  BEFORE any `src/` change. 22 cases, 16 RED / 6 GREEN. Red: 1 (the reporter's probe),
  3 (the todo squat), 4, 5b, 6 (the globstar), 10, 11, 12, 14, 15, 15b, 16, 17, 18, 19, 20.
  Already green and required to stay green: 2, 5, 7, 8, 9, 13 — the proof the fix is not a
  blanket denial. Case 15 threw `EACCES` out of `findCoveringPlan` — the live fail-open path,
  recorded as the before-state.
- [x] **Step 9 PREPARE** — measured (see the report below): `00067`'s verdict, all 21 plans in
  todo/in-progress/implementation classified, timing before/after, live documented counts.
- [x] **Step 10 IMPLEMENT** — `src/lib/approval-residency.js` (new), `src/lib/plan-coverage.js`,
  `src/hooks/human-gate-check.js`, `src/hooks/PreToolUse.Edit.js`, the new test file, four
  amended test files, `CLAUDE.md` counts + enforcement paragraph.
- [x] **Step 11 REVIEW** — exactly one `classifyResidency` in the repository; no second approval
  predicate in `plan-coverage.js`; no `lib → hooks` require added; `globToRegex`/`touchesOverlap`
  untouched; `tests/human-gate-check-coverage.test.js` passes with zero assertions modified.
- [x] **Step 12 OPTIMIZE** — one read per plan per call; the approval hash is computed only
  after a glob matched, at most once per plan; `explainDenial` runs only on the block path.
- [x] **Step 13 SECURE** — both probes hand-run against the built code in all three stage
  folders: all `null`. Symbolic-link escape PROBED AND CONFIRMED (reported, not fixed).
  Approved-globstar residual confirmed (reported, not fixed).
- [x] **Step 14 VERIFY — PASSED after the human extended scope.** First pass was BLOCKED
  (recorded below); the human ruled EXTEND, re-approved through the real path, and the
  seven files were repaired. Full gate: `tests 10145, suites 1743, pass 10145, fail 0,
  skipped 0, todo 0`; `coverage 99.04% (threshold 99%), skipped 0, failed 0`; `PASS`.
  Lint clean at `--max-warnings 0` on every changed file. The floor was NOT moved.
- [~] **Step 14, FIRST PASS — BLOCKED ON SCOPE (kept for the record).** Everything this plan declares is green
  (175/175 across the declared test files plus both ratchet fences). The full suite is
  `fail 8`, in SEVEN files this plan does NOT declare. Reported as scope growth; not
  self-declared, not proceeded past. See the report.
- [x] **Step 15 DOCUMENT** — file header on `approval-residency.js` (why it is the ONE
  encoding, why it lives in `lib/`, why the `in-progress → todo` edge is correct rather than
  lenient); the `STAGE_PRIORITY` comment naming why `implementation` is absent and what
  happens if someone adds it back; a comment at every fail-closed return stating the
  inversion; `CLAUDE.md` counts and the corrected enforcement paragraph.
- [x] **Step 16 FINAL-REVIEW** — complete.

### The seven fixture repairs (second pass)

Every one was a SETUP repair, not an assertion change. Six hook end-to-end suites built
plan fixtures with NO ledger entry and asserted "a plan-covered edit is ALLOWED"; a covered
plan is by definition an APPROVED plan, so each fixture now mints the real approval it
always implied (real `approval-ledger` over the fixture's own bytes, `stage_to` mapped as
production maps it, `{ approved: false }` available for negative cases):
`w01-edit-write-deny-protocol`, `w01-multiedit-notebookedit-parity`, `pretooluse-edit-coverage`,
`security-enforcement-evasion`, `e2e-enforcement-and-gates` (its `writeCoveringPlan` only —
`writeStagePlan` is about gate RESIDENCY and is untouched), and `gate3-verify-evidence-write-deny`
(an inline fixture, approval minted beside it).

**NOTHING had to be inverted in this pass.** No case asserted that an unapproved plan's edit
is allowed; every one meant "approved" and merely failed to say so. The only inverted
assertion in this whole plan remains the first-pass one in `plan-coverage-coverage.test.js`.

The seventh, `readme-numbers.test.js`, is a hard-coded live-disk count raised 104 → 105
because a module was genuinely added. Its sibling assertion — that `README.md` contains the
string "104 JS modules" — was left ALONE and still passes, because `README.md` is declared by
plan `00067-y1-ctoc-start-entry-point`, not by this one. See the finding below.

## Decisions Taken Under Ambiguity

12. **`readPlanFiles` KEEPS its name and its export, and gained an optional pre-read
    `content` argument** (the plan specified an internal `readPlanFilesFrom(content)` with
    `readPlanFiles` as a read-then-parse wrapper). Implemented as specified, the wrapper had
    NO live caller — the scan used the internal helper — and `tests/export-reachability.test.js`
    correctly reported `src/lib/plan-coverage.js#readPlanFiles` as dead on arrival. The plan
    justified preserving it by "`00123` consumes it", but `00123` is unapproved in
    `implementation/` and ships nothing. The optional-content parameter mirrors
    `classifyResidency(filePath, folder, project, content)`, which is this codebase's existing
    idiom, makes the scan itself the live caller, preserves the one-argument signature exactly,
    and still reads each plan once. No baseline was touched to achieve this.
13. **A `typeof content !== 'string'` guard was written and then REMOVED.** It was a third
    `parse-default` site and `tests/false-green-fence.test.js` flagged it as NEW. Rather than
    whitelist it — indefensible inside a security fix — the guard was deleted and the parse
    moved inside the same try/catch that guards the read, so a fault skips that plan (granting
    nothing, the fail-closed direction) instead of escaping into the hook's fail-open catch.
    The two PRE-EXISTING baseline keys were RENAMED `readPlanFiles` → `parsePlanFiles` to track
    the same debt through the split; the count is unchanged at 2 and nothing was added.
14. **The plan's Step 8 expectation for case 17 was WRONG and the code won.** It required case
    17 GREEN from the first run. Its first half asserts that an unapproved probe grants nothing
    — which is the defect — so it was necessarily RED. Its second half (the same fixture,
    approved, matches) was green from the first run, which is the anti-vacuity property the case
    exists to establish. Recorded rather than adjusted.
15. **Case 4 asserts MORE than the plan specified.** The plan wanted "null for the added file;
    still covered for an unchanged declared file". Measured behaviour: an amendment invalidates
    the specification hash, so the plan stops granting BOTH. That is correct and stricter — the
    approval binds the whole frontmatter including `files:` — so the test pins the real
    behaviour, which is a tightening, not a loosening.
17. **`README.md` is now STALE by one module and was deliberately NOT touched.** Disk holds
    105 top-level `src/lib` modules; `README.md` still says "104 JS modules", and
    `readme-numbers.test.js` has a second assertion pinning that README string. Both
    assertions are TRUE statements today (disk is 105; README does say 104), so nothing is
    green-washed — but the README is stale. `README.md` is declared by
    `00067-y1-ctoc-start-entry-point`, which explicitly owns its numeric lines, so correcting
    it belongs to that plan and not to this one. Reported rather than quietly absorbed.
18. **THE SCOPE-GROWTH RULE FIRED, ON ITS FIRST REAL CASE, AND IT WORKED.** At the end of the
    first pass this executor found that finishing required editing seven files the human's
    approval did not cover. It did NOT add them to its own `files:` list — doing so would have
    invalidated the very approval it was acting under, which is the same self-granting shape
    this plan exists to close, one level up. It did NOT edit them anyway. It stopped, named
    every file and why, and asked. The human ruled EXTEND, re-approved through the real gate
    path so the approval bound the extended scope, and the build finished. **The next executor
    to hit this should do exactly the same thing: stop and name the files.** Refusing to
    self-grant scope costs one round trip; self-granting it costs the meaning of the approval.
16. **The plan under-counted the blast radius by seven files.** It named four existing test
    files; nine break. The five extra are hook end-to-end suites whose positive controls build
    unapproved plan fixtures, plus one hard-coded module count. Not self-declared — surfaced.
