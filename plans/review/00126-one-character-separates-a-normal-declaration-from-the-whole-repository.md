---
approved_by: human
approved_at: 2026-07-20T09:39:54.544Z
gate_crossed: implementation → todo
title: "One character separates a normal declaration from the whole repository — a declared pattern must be anchored somewhere, or say out loud that it is not"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00127-the-human-approving-a-plan-is-never-shown-the-files-it-grants
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/declared-breadth.js"
  - "tests/declared-breadth.test.js"
  - "src/lib/plan-coverage.js"
---

# One character separates a normal declaration from the whole repository

## The defect, and what is NOT wrong with it

The reporter ran it and it is exactly as described: a plan declaring
`files: ["**"]` matches `package.json`, `VERSION`, the enforcement hook and the
approval ledger — every path in the repository. Read from the source, this is not a
bug in the matcher. `tokenizeGlob` (`src/lib/plan-coverage.js:87-111`) turns `**`
into a single `globstar` token, and `matchTokens` (`:137-174`) lets a globstar
absorb every character **including `/`**. That is the documented, intended
semantics, and the sibling slice pinned an approved `**` as MATCHING precisely so
nobody would later discover it by accident.

So the machinery is behaving. The question is a **policy** question, and it is the
one the sibling slice explicitly refused to decide because it belongs to the human:

> Should a human be able to approve a blanket grant at all — and if so, should it be
> possible to do so **without noticing**?

The second half is what makes this worth building. A plan is approved by a human who
reads its subject and its file list. `**` is one character wider than `src/**` and
reads almost identically at a glance. Worse, and **verified by reading the code**:
the gate screen the human answers on (`src/lib/streaming-gate.js:856
planDecisionScreen`) renders the plan through `renderPlanBody` (`:213-223`), whose
FIRST action is `stripLeadingFrontmatter(content)`. **The `files:` list lives in the
frontmatter, so the human approving a plan is not shown the file list at all.**
Visibility today is not "poor". It is zero.

That measurement splits this into two independently approvable pieces:

| | what it does | where it lives | fails |
|---|---|---|---|
| `00127` (**builds first**) | SHOWS the human what a declaration grants, at the moment of choosing | the gate screen | soft |
| **this plan** | REFUSES an unanchored declaration unless the plan says out loud that it is unanchored | the coverage oracle, on the hook path | CLOSED |

## THE DEPENDENCY WAS INVERTED, AND WHY

This plan previously declared `depends_on: none` and `00127` depended on it. That
ordering shipped **consent before the ability to see what you are consenting to.**

The refusal this plan builds is answered by a human adding `unanchored_scope` to a
plan's frontmatter and re-approving it. The whole design rests on that being an
**informed** act. But the acknowledgement is a frontmatter key, and until `00127`
lands, the gate screen strips the frontmatter — so the human would be consenting to a
scope the screen never showed them, using a key the screen never displays. An
unforgeable acknowledgement to an invisible question is a signature on a blank page.

So the order is inverted: **`00127` builds first and creates
`src/lib/declared-breadth.js`** with `isAnchored` and `countMatching`; this plan then
ADDS the enforcement half to that same module. `00127`'s own text already anticipated
this exact rewrite and called it small ("If the human wants visibility WITHOUT the
refusal, this plan must be rewritten to create `declared-breadth.js` itself… and
`00126`'s dependency inverts"), so nothing is being invented here.

The inversion costs nothing in dead code: `00127` alone has a live consumer — the gate
screen calls both `isAnchored` (for the unanchored marker) and `countMatching`. It is
not a module waiting for a caller.

## THE DENIAL SLOT — one ranking rule, defined HERE and referenced by every writer

`scanForCoverage` keeps exactly ONE `denial` variable (declared at
`src/lib/plan-coverage.js:430`, written at `:487-489`, read live). Today it has one
writer: the unapproved-plan branch, ranked by glob `specificity` alone
(`if (!denial || score > denial.score)`).

This repair set adds two more writers to that single slot. Left unsettled, whichever
plan built second would inherit a three-way precedence no plan specifies. **The rule
is settled here, once, and the other writers reference it rather than restating it.**

| writer | reason token | introduced by |
|---|---|---|
| a plan whose approval is missing or stale | `approval.reason` (`unapproved`, `hash-mismatch`, …) | already shipped |
| a plan whose declaration is unanchored | `unanchored-declaration` | **this plan** |
| a plan that is approved but not building | `not-building` | `00129` |

`00142` is **NOT a writer.** A whitelist miss falls through to the coverage scan
rather than recording a denial (its own Decision 1). It is named here so that nobody
building it adds one.

**THE RULE — canonical, and this is the only place it is defined:**

> Rank a denial candidate by **REASON SEVERITY first**, and by glob `specificity`
> **only as a tiebreak within the same reason.**
>
> Severity, strongest first:
> 1. `approval.reason` — the plan is not approved, or its approval no longer matches
>    its content
> 2. `unanchored-declaration` — the plan is approved, but this declaration was never
>    bounded
> 3. `not-building` — the plan is approved and bounded, but nothing is building it
>
> A stronger reason NEVER loses to a more specific glob carrying a weaker one.

Why severity and not specificity alone: **the slot exists to tell the human what to
do.** The three reasons have three different remedies, and they are ordered by how
deep the blocker sits. Reporting "not building" for a plan nobody approved would teach
the human to start a plan that still grants nothing — a remedy that cannot work is
worse than no remedy at all.

**Implementation shape** — one comparator, one place, so a fourth reason cannot be
added without confronting the order:

```
SEVERITY = { <approval reasons>: 3, 'unanchored-declaration': 2, 'not-building': 1 }
// replaces the bare  if (!denial || score > denial.score)
// with a compare on (severity, score) in that order
```

This plan builds the comparator, because it is the first of the two new writers to
land. `00129` adds `not-building` to the severity table and adds nothing else to the
ranking. Any plan that wants to change the ORDER changes it here and nowhere else.

## The ruling this plan proposes, and the two designs it rejects

**A declared pattern must be ANCHORED: its first `/`-separated segment must contain
no wildcard.** `src/**`, `tests/*.test.js`, `docs/**/*.md` and every literal path are
anchored. `**`, `**/*.js`, `*`, `*.md` are not — they are rooted at the repository
itself and grant across every top-level directory.

An unanchored pattern is not forbidden. It is refused **unless the plan's own
frontmatter carries an explicit acknowledgement**:

```yaml
unanchored_scope: "this plan's file list is rooted at the repository"
```

### Why the acknowledgement is not a formality an agent can add for itself

This is the part that makes the design work, and it is **verified by reading
`approval-ledger.computeSpecHash` (`src/lib/approval-ledger.js:364-425`)**: the
digest is taken over `blocks.join('\n')` — the FULL leading frontmatter, every
block — length-prefixed and domain-separated from the body. So a frontmatter key
added AFTER approval changes the specification hash, `classifyResidency` returns
`hash-mismatch`, and the plan grants **nothing at all**. An agent cannot mint the
acknowledgement for itself. The human must have approved a plan whose frontmatter
visibly said it. The refusal is therefore not a wall; it is a **consent prompt with
an unforgeable answer**, reusing the exact binding the sibling slice established.

**And after `00127`, "visibly" is literally true** — the gate screen renders the
declared scope and marks an unanchored entry in words. That is the whole reason the
dependency was inverted.

### The two designs that were weighed and rejected for the ENFORCEMENT half

**Share-of-repository threshold** (refuse a pattern matching more than some fraction
of the repository). Rejected for enforcement, for two independent reasons:

1. **It has to walk the repository on the hook path.** This runs on every Edit,
   Write, MultiEdit and NotebookEdit call. The sibling slice set a 10-millisecond
   budget for the whole coverage decision and measured against it; a full tree walk
   does not fit inside that, and a permission check that makes every edit feel slow
   is a check someone disables.
2. **It is not deterministic.** The same plan would grant or refuse depending on how
   many files happen to exist that day. A permission whose verdict drifts with an
   unrelated `git pull` cannot be reasoned about, and its failures look like flakes.

The threshold idea is not wrong — it is a **display** idea, and `00127` is where it
lives.

**Pure refusal with no acknowledgement.** Rejected because the false-positive cost is
real and unanswerable: a plan that legitimately needs a repository-wide sweep (a
rename across every language file, a licence header) would have no route at all
except an escape phrase, which is a worse outcome — it turns a bounded, recorded,
approved grant into an unbounded session-wide one.

## What stops working, item by item

| # | What stops | Acceptable? |
|---|---|---|
| 1 | An approved plan declaring `**` (or `*`, `**/*.js`) stops granting anything, unless its approved frontmatter carries `unanchored_scope`. | **Yes — this IS the change.** |
| 2 | A plan whose acknowledgement is added after approval grants nothing, because the specification hash breaks. | **Yes** — that is the binding working, and it is what makes the acknowledgement meaningful. |
| 3 | Any existing test fixture declaring an unanchored pattern goes red. | **MEASURED at planning time; RE-CONFIRM at Step 9.** See the measurement below — the count is now known and named. |
| 4 | A plan mixing anchored and unanchored entries loses ONLY the unanchored ones. | **Yes, deliberately** — see Decision 3. Losing the whole plan would punish a typo with a total lockout. |

### The queue does not stop — measured, not estimated

**Every plan file in this repository was searched for a first-segment wildcard in its
`files:` declaration. There are NONE.** Not in `plans/todo/`, not in
`plans/implementation/`, not anywhere. **This refusal refuses zero queued plans.** The
false-positive class this plan was most at risk of does not exist here.

That measurement is recorded so nobody re-opens it, and it is re-confirmed at Step 9
because a plan added between planning and building would not have been in the search.

### The seven fixtures — named, and their exposure measured

The earlier draft said "two are known to exist by subject" and named none. They are
now named. **Seven unanchored fixtures exist across two test files:**

| file | lines | declaration |
|---|---|---|
| `tests/iron-loop-enforcer-coverage.test.js` | 301, 316, 333, 350 | `files: ["*"]` |
| `tests/iron-loop-enforcer.test.js` | 145, 159, 169 | `files: ["*"]` |

**Measured verdict: they do NOT traverse the guarded function.**
`src/lib/iron-loop-enforcer.js` was searched for `plan-coverage`, `readPlanFiles`,
`findCoveringPlan` and `scanForCoverage` — **it requires none of them and calls none
of them.** Those fixtures reach the enforcer's own plan reading, not the coverage
oracle, so this plan's guard never sees them and they are **not expected to go red.**

Separately, `tests/unapproved-plan-grants-nothing.test.js` DOES traverse the guarded
function and declares `['**']` at lines 201, 202 and 221. Its case 7 pins an approved
`**` as MATCHING and **is expected to go red.** That file is not declared here — see
"Ordering and file conflicts".

`tests/compliance-mode.test.js:47` carries `- "*.md"`, but it is an **enforcement
whitelist entry in a settings fixture, not a plan `files:` declaration.** It is not
affected and is named here only so a Step 9 grep does not re-raise it.

Step 9 re-runs all three searches live; the code and the tree win over this table.

## The fail-closed inversion, restated because it is the thing that gets tidied away

This is a **permission** check, not a report. Every fault path must GRANT LESS, and
— the trap the sibling slice recorded and this plan inherits — **fail-closed here
means RETURN, NEVER THROW.** `PreToolUse.Edit.js:468-472` catches everything and
fails OPEN, so a throw out of `plan-coverage.js` becomes an ALLOW. A new module on
this path must therefore be TOTAL:

- a non-string pattern → **not anchored** (refused), never a crash;
- unreadable or unparseable frontmatter → **no acknowledgement present** (refused);
- any unexpected error inside the predicate → caught at its own boundary and
  returned as "not anchored".

Do not "fix" this into consistency with the fail-open reporting checks next door. A
permission check that allows because it could not look is the defect the sibling
slice existed to close.

## Implementation Details

### Dependency graph

```
src/lib/declared-breadth.js  [CREATED BY 00127; this plan ADDS the enforcement half]
  └─the enforcement half requires→ nothing
    [pure string/shape predicates — no filesystem, no I/O on the hook path]

src/lib/plan-coverage.js ──requires→ src/lib/declared-breadth.js   [NEW edge]
src/hooks/PreToolUse.Edit.js ──already requires→ src/lib/plan-coverage.js
```

No cycle. No layer violation (the new edge points into `lib/`). **No filesystem
access is added to the hook path at all** — `countMatching`, which `00127` put in the
same module, is never called from here. Step 11 proves that by grep rather than by
assertion.

### File: `src/lib/declared-breadth.js`
**Action:** MODIFY — add the enforcement half to the module `00127` created
**Purpose:** The ONE encoding of "how wide is this declaration, and did the human say
so out loud". The halves this plan adds are pure, total, and perform no I/O.

Read the module **as `00127` actually built it, not as either plan described it.**
`isAnchored` should already exist there; if `00127` shipped it under a different name
or shape, **the code wins — adopt it and record the discrepancy. Do not write a second
anchoring predicate.**

Add:

- `hasUnanchoredAcknowledgement(content)` → `boolean`
  - `true` iff the plan's leading frontmatter region carries a `unanchored_scope`
    key with a non-empty value. Parse the region the way `parsePlanFiles` does —
    lazy-require `stale-detector.extractFrontmatterRegion`, falling back to
    `frontmatter.parseFrontmatter` — so the acknowledgement is read from the SAME
    multi-block union that `files:` is read from. A prepended approval marker block
    must not hide it, and a CRLF plan must read identically.
  - Any fault → `false` (absent acknowledgement is the refusing direction).
  - **Never throws.**
- `REFUSAL_REASON` — the fixed vocabulary token `'unanchored-declaration'`, exported
  so the denial path, the severity table and the tests share one spelling.

Confirm (and add only if `00127` did not):

- `isAnchored(glob)` → `boolean`
  - `true` iff `glob` is a non-empty string whose FIRST `/`-separated segment
    contains none of `*` or `?`. Evaluate on the same normalized form
    `scanForCoverage` already computes (backslashes to forward slashes, then
    `path.posix.normalize`) so a Windows-authored `src\**` is judged identically to
    `src/**`. A leading `./` is already collapsed by that normalization.
  - Non-string, empty string, or a leading empty segment (`/x`) → `false`.
  - **Never throws.**

Deliberately NOT added here: anything that counts files. `countMatching` is
`00127`'s, it performs I/O, and it must never be reachable from the hook path. The
module's I/O-free half and I/O half are documented in its header as a deliberate
asymmetry.

### File: `src/lib/plan-coverage.js`
**Action:** MODIFY — one guard inside the existing glob loop, plus the denial comparator

**LINE-NUMBER DRIFT, CORRECTED.** An earlier draft cited the `globEscapesRoot(glob)`
guard at `:454`. **It is at `:475`, verified by reading the file.** It moved because a
sibling inserted the real-path confinement block above it (`:410-428`). The approval
verdict is now consulted at `:479-481` and the denial recorded at `:484-491`. These
numbers are a navigation aid only — **read live at Step 9 and let the code win.**

In `scanForCoverage`, immediately after the existing `globEscapesRoot(glob)` guard
(`:475`) and BEFORE `globToRegex` (`:476`):

```
if (!declaredBreadth.isAnchored(glob) && !declaredBreadth.hasUnanchoredAcknowledgement(content)) {
  // record as a denial candidate through the shared comparator, then continue
}
```

Three properties this placement buys, all load-bearing:

1. **The `content` is already in hand.** The scan reads each plan exactly once
   (`:455`) and reuses the text for glob parsing and the approval hash; the
   acknowledgement is read from that same string. **No extra file read is
   introduced.**
2. **It runs BEFORE the match**, so a refused pattern never reaches the matcher and
   never contributes to specificity ranking — an anchored, less-specific glob cannot
   be beaten by a refused broad one.
3. **It is skipped for every anchored pattern**, which is all of them in this
   repository today, so the common path costs one segment scan of a short string.

The refused pattern is recorded into the existing `denial` slot with
`reason: declaredBreadth.REFUSAL_REASON`, so `explainDenial` — and therefore the
block banner the sibling slice built (`PreToolUse.Edit.js:348-364`) — names the plan,
says the declaration is unanchored, and the human can read why. **A refusal nobody
can read is a refusal that gets reverted.**

**The ranking is the shared rule above, not bare specificity.** The earlier draft said
the existing `if (!denial || score > denial.score)` gave the right behaviour and that
it should not be special-cased. **That instruction is superseded and must not be
followed**: it was written when this plan was the only new writer. Replace the bare
comparison with the (severity, score) comparator defined in "THE DENIAL SLOT" above,
seeded with the approval reasons at severity 3 and `unanchored-declaration` at 2.
Leave a `not-building` entry commented in the table naming `00129` as its owner, so
the next writer edits a table rather than inventing a rule.

Note on the lowest score: `specificity('**')` is `-5`. A refused `**` must still be
able to explain itself when it is the ONLY candidate — the comparator preserves that,
because a slot holding nothing accepts any candidate regardless of severity or score.

### File: `tests/declared-breadth.test.js`
**Action:** CREATE
**Framework:** `node:test`, real `os.tmpdir()` fixtures, `path.join` throughout,
recursive-force cleanup in `finally`, no shell.

Approval fixtures are minted with the **real `approval-ledger`** over the fixture's
own bytes — never a hand-written digest, which drifts the moment the hash changes.

| # | Case | Assertion |
|---|---|---|
| 1 | `isAnchored` on `src/**`, `tests/*.test.js`, `docs/**/*.md`, `a/b/c.js` | all `true` |
| 2 | `isAnchored` on `**`, `*`, `*.md`, `**/*.js`, `?rc`, `` (empty), `null`, `42` | all `false`, **no throw** |
| 3 | `isAnchored` on a Windows-authored `src\**` | `true` — judged on the normalized form |
| 4 | **the reporter's case, end to end** — an APPROVED plan in `todo/` declaring `files: ["**"]` | `findCoveringPlan` returns `null` for `package.json`, `VERSION`, `src/hooks/PreToolUse.Edit.js` and `.ctoc/approvals/x.json` — the four paths the reporter named |
| 5 | **the acknowledged case** — the same plan, approved WITH `unanchored_scope` in its frontmatter | **matches.** Documented consent still works, or this is a blanket denial passing half its tests |
| 6 | **the acknowledgement is not forgeable** — approve WITHOUT it, then append it to the plan file afterwards | `null`, and `explainDenial` reports a hash reason, not `unanchored-declaration` — the specification binding fires first |
| 7 | **mixed list** — approved plan declaring `["src/**", "**"]` | covers `src/lib/x.js`; does NOT cover `package.json` |
| 8 | **anchored plans are untouched** — approved plan declaring `["src/lib/**"]` | covers `src/lib/x.js`, does not cover `tests/x.js` (unchanged behaviour) |
| 9 | **the denial explains itself** — case 4's fixture | `explainDenial` returns `reason === 'unanchored-declaration'` and names the plan |
| 10 | **acknowledgement survives a prepended approval marker** — a plan carrying a marker block first and its own frontmatter second | the acknowledgement is still found (the multi-block union, the same defect class as finding M19) |
| 11 | **acknowledgement survives CRLF** — the same fixture with `\r\n` endings | still found (finding H1's defect class) |
| 12 | **the fence is not vacuous** — the identical fixture with an anchored `src/**` and no acknowledgement | matches, proving cases 4 and 7 fail for the anchoring reason and not because the harness never matched anything |
| 13 | **SEVERITY BEATS SPECIFICITY** — one UNAPPROVED plan declaring a highly specific `src/lib/x.js`, and one APPROVED plan declaring an unanchored `**`, both matching the same target | `explainDenial` reports the **approval** reason, not `unanchored-declaration` — the shared ranking rule, pinned |
| 14 | **specificity still breaks ties WITHIN a reason** — two unanchored approved plans, one declaring `**` and one declaring `**/*.js`, both matching `a/b.js` | the more specific `**/*.js` is reported — the tiebreak survives the severity layer |

Cases 12, 13 and 14 are not optional. Case 12 guards against a file full of `null`
assertions from a scan that never matched anything — this repository's central defect
class rebuilt inside its own fix. Cases 13 and 14 are the **only** executable
statement of the shared denial rule; without them the precedence is prose.

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `declaredBreadth.isAnchored` | `plan-coverage.scanForCoverage` | `PreToolUse.Edit.js:438`, on every Edit/Write/MultiEdit/NotebookEdit call |
| `declaredBreadth.hasUnanchoredAcknowledgement` | the same guard | the same |
| `declaredBreadth.REFUSAL_REASON` | the `denial` record → `explainDenial` → `buildBlockMessage` | the human's terminal, on every denial |
| the severity comparator | `scanForCoverage`'s denial slot | the same |
| `tests/declared-breadth.test.js` | the suite | `npm test` |

Nothing here is reachable only from a test.

## THE BLOCK MESSAGE — this plan introduces a reason the message answers WRONGLY

`buildBlockMessage` (`src/hooks/PreToolUse.Edit.js:348-364`, read live) interpolates
the denial reason but **hardcodes the remedy sentence**:

```
Only an APPROVED plan grants write access. Approve or re-approve it via /ctoc:menu.
```

For today's only reason — an unapproved or stale-hash plan — that sentence is
correct. **For `unanchored-declaration` it is wrong.** The plan IS approved; the
remedy is a TWO-step act the sentence never states: add `unanchored_scope` to the
plan's frontmatter, AND re-approve it (the key changes the specification hash, which
is the whole point of the design). A human told to "re-approve it" will re-approve an
unchanged plan and be blocked again, with no idea why.

**A lockout a human cannot act on is what gets a guard reverted within a week.**

`src/hooks/PreToolUse.Edit.js` is **NOT declared by this plan.** The correct handling
is the one this set already established (the sibling slice's Decision 18): **STOP AND
ASK.** Concretely, at Step 9, before Step 10 proceeds, present the human with exactly
this:

> This plan adds the denial reason `unanchored-declaration`, whose remedy the block
> message states wrongly. Fixing it needs `src/hooks/PreToolUse.Edit.js` added to this
> plan's `files:` — which changes the frontmatter, breaks the specification hash, and
> therefore needs re-approval. The alternatives are (a) add the file and re-approve,
> (b) ship the reason with a wrong remedy until `00129` fixes the message, or
> (c) hold this plan until `00129` lands its reason-keyed remedy table.

Do not self-grant the scope: adding the file to `files:` without re-approval
invalidates the very approval being acted under, which is the exact shape this whole
set exists to close, one level up.

`00129` declares that hook file and owns the **general** repair — a reason-keyed
remedy table replacing the hardcoded sentence for all three reasons. If the human
schedules `00129` before this plan, option (c) costs nothing.

## What this does NOT fix

1. **It does not show the human anything at approval time.** That is `00127`, which
   now builds FIRST — see the inversion above.
2. **An acknowledged `**` still grants the whole repository.** That is the point: the
   human's informed consent is preserved, only the silent version is removed.
3. **It says nothing about how MANY files an anchored pattern grants.** `src/**` here
   is 105-plus modules and is not refused. Breadth is bounded by ANCHORING, not by
   count. Counting is `00127`.
4. **It does not know which plan is building.** An approved, anchored plan still
   grants its files to any executor. That is `00129` — and `00129` has a measured
   blocker of its own; read it before assuming that gap closes.
5. **It does not resolve real paths.** An anchored pattern through an in-repository
   symbolic link still reaches outside. That is `00128` (shipped) and `00142`.
6. **Escape phrases are unchanged.** A human who types one can still edit anything.
   That is consent, deliberately preserved by the sibling slice and not narrowed here.
7. **No existing plan is amended.** If a queued plan declares an unanchored pattern,
   it is reported at Step 9 and re-approval is a human action through the menu. This
   plan does not edit, re-hash, or backfill any other plan.
8. **It does not fix the block message's remedy sentence** — that scope is not
   declared here, and the handling is the STOP AND ASK above.

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [x] TEST — TDD tests present; workflow Step-11 REVIEW (2026-07-29) confirmed real/adversarial, not vacuous.
Write `tests/declared-breadth.test.js` in full and run **only that file, before
touching `src/`**. Record the starting state verbatim.

- **Case 4 must be RED** — today an approved `**` DOES cover `package.json`,
  `VERSION`, the hook and the ledger path. This is the reporter's run reproduced
  inside the suite. **If it is not red, STOP**: the premise is wrong and so is this
  plan.
- **Cases 7, 9, 13 and 14 RED.** Case 6 will be red for the wrong reason before the
  fix (the hash breaks anyway); record what reason it actually reports, and confirm at
  Step 14 that the reason is a hash reason, not an anchoring one.
- **Cases 5, 8 and 12 must be GREEN already** and must stay green. They are the proof
  the change is not a blanket denial.
- Cases 1, 2, 3, 10 and 11 exercise the module `00127` created — they pass or fail on
  what `00127` actually shipped. Record which, and **if `isAnchored` is absent or
  differently shaped, STOP: `00127` has not landed and this plan's dependency is
  unmet.**

### Step 9: PREPARE
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
Read from disk, in full, before changing anything: `src/lib/plan-coverage.js` (all of
it); **`src/lib/declared-breadth.js` as `00127` actually built it** — the code wins
over both plans; `src/lib/approval-ledger.js:364-425` (`computeSpecHash`) to CONFIRM
by reading that the full frontmatter is hashed — the acknowledgement design rests on
it, and if it is false this plan is wrong and must stop; `src/lib/approval-residency.js`;
and `src/hooks/PreToolUse.Edit.js:340-473`.

Then MEASURE:

1. **Re-confirm the zero-refusal finding.** Walk every plan file in `plans/todo/`,
   `plans/in-progress/` and `plans/implementation/`, parse each `files:` list with the
   real `readPlanFiles`, and report every entry whose first segment carries a
   wildcard. **Planning measured ZERO across the whole tree.** A plan added since then
   would not have been in that search. If any queued plan would lose coverage, name it
   to the human BEFORE Step 10 proceeds.
2. **Re-confirm the seven fixtures and their exposure.** The seven are
   `tests/iron-loop-enforcer-coverage.test.js:301,316,333,350` and
   `tests/iron-loop-enforcer.test.js:145,159,169`, all `files: ["*"]`. Planning
   measured that `src/lib/iron-loop-enforcer.js` requires and calls **none** of
   `plan-coverage`, `readPlanFiles`, `findCoveringPlan`, `scanForCoverage` — so they
   do not traverse the guarded function and are not expected to go red. **Re-run that
   search live and report the verdict.** If the enforcer now reaches the coverage
   oracle, these seven ARE in scope, that file is not declared here, and the answer is
   STOP AND ASK.
3. **`tests/unapproved-plan-grants-nothing.test.js` DOES traverse it** and declares
   `['**']` at `:201`, `:202`, `:221`; its case 7 pins an approved `**` as matching and
   **is expected to go red.** That file is not declared here. See "Ordering and file
   conflicts".
4. **Timing.** `findCoveringPlan` over the real repository, before and after, for a
   covered target and an uncovered one. **Above roughly 10 milliseconds per call, stop
   and report** — the budget the sibling slice set and measured against.
5. **The block-message question above** — present it to the human and get an answer
   before Step 10.

Where the code disagrees with this plan, **the code wins and the discrepancy is
recorded.**

### Step 10: IMPLEMENT
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
One step, files as sub-items.
- `src/lib/declared-breadth.js` — `hasUnanchoredAcknowledgement`, `REFUSAL_REASON`,
  and `isAnchored` only if `00127` did not ship it; total, no I/O, never throws.
- `src/lib/plan-coverage.js` — the one guard after `globEscapesRoot` (`:475` live);
  the (severity, score) denial comparator with its reason table; the module header
  gains the anchoring rule, the reason it is not a count, and a pointer to the
  canonical denial rule in this plan.
- `tests/declared-breadth.test.js` — the fourteen cases.

### Step 11: REVIEW
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3.
Confirm there is exactly ONE encoding of anchoring in the repository, and that
`plan-coverage.js` contains no second copy of the rule. **Confirm by grep that nothing
on the hook path calls `countMatching`** — a filesystem walk on every Edit call is the
thing the threshold design was rejected for, and `00127` put such a walk in this same
module. Confirm the guard sits AFTER `globEscapesRoot` and BEFORE `globToRegex`, so a
refused pattern is never matched and never ranked. Confirm the denial comparator is in
ONE place and that the severity table names all three reasons, `not-building`
included as a commented entry owned by `00129`. Confirm the plan file is still read
exactly once per scan. Confirm `globToRegex`, `touchesOverlap` and `readPlanFiles`'
exported signatures are unchanged — `task-registry.js`, `task-reconcile.js` and
`plan-index/conflict-detect.js` depend on them.

### Step 12: OPTIMIZE
Confirm the anchored path — every declaration in this repository today — costs one
scan of the first path segment and nothing else: no frontmatter parse, no allocation
per glob beyond what exists today. Confirm the acknowledgement parse runs at most once
per plan per scan and only when an unanchored pattern is actually present. Confirm the
severity lookup is a constant-time map read, not a scan. Record the after-timing
against the Step 9 before-number.

### Step 13: SECURE
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
Adversarially, on a permission path.
- Confirm every fault returns rather than throws: non-string glob, unreadable
  frontmatter, unparseable frontmatter, a `unanchored_scope` key with an empty or
  non-string value, a frontmatter region that is absent entirely, and an unknown
  reason token reaching the severity table. Each must be a REFUSAL or the safest
  ranking, never a throw — a throw reaches the hook's fail-open catch and becomes an
  allow.
- **Attempt to forge the acknowledgement by hand** against the built code: approve a
  plan without it, append it afterwards, and confirm the plan grants nothing.
- Attempt to evade anchoring with `./**`, `src/../**`, `.//**`, `**/../**`, a
  backslash form, and a pattern with a leading empty segment. Record each verdict.
  Any that reaches the whole repository is a defect in this fix and must be closed
  before Step 14.
- Confirm the denial message leaks no file contents, no absolute paths, no stack
  traces — a fixed-vocabulary reason and a repository-relative plan reference only.

### Step 14: VERIFY
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
Targeted run first: `tests/declared-breadth.test.js`,
`tests/unapproved-plan-grants-nothing.test.js`,
`tests/plan-coverage-coverage.test.js`, `tests/enforcement-hook.test.js`,
`tests/iron-loop-enforcer.test.js`, `tests/iron-loop-enforcer-coverage.test.js`,
`tests/false-green-fence.test.js`, `tests/architecture-invariants.test.js`,
`tests/export-reachability.test.js`, `tests/doc-counts.test.js`,
`tests/readme-numbers.test.js`.

The two enforcer test files are in that list **because planning predicted they will
NOT break** — running them is how that prediction is falsified rather than assumed.

Then the full gated run `npm test`; record `tests`, `suites`, `pass`, `fail`, the
zero-skipped counter and the coverage line **verbatim**. The coverage floor must not
be lowered. Lint every changed JavaScript file at `--max-warnings 0`.

Then prove the pipeline still runs: every plan in `todo/` and `in-progress/`
identified at Step 9 as coverage-holding must still resolve through
`findCoveringPlan` for its own declared files. If one that should be buildable is
not, **stop and report** — do not relax the predicate to make it pass. **Read the
block message that comes out of a refused declaration** and confirm a person could act
on it; if the remedy sentence is the wrong one, that is the Step 9 question landing,
not a surprise. **No git operations.**

### Step 15: DOCUMENT
A file header addition on `declared-breadth.js` stating: what anchoring means and why
it is the enforcement rule rather than a count; why the enforcement half performs no
I/O while `countMatching` next door does, and that the split is deliberate; why the
acknowledgement is unforgeable (the specification hash covers the whole frontmatter);
that the acknowledgement is only meaningful because `00127` renders scope at the gate
— the reason this plan depends on it; and the fail-closed inversion in the form "this
module must never throw, because the hook's catch fails open". An inline comment at
the `plan-coverage.js` guard naming why it sits between `globEscapesRoot` and
`globToRegex`. A comment at the denial comparator pointing to the canonical rule in
this plan and stating that a fourth reason must be added to the table, never ranked
ad hoc. If `CLAUDE.md` or `README.md` carry a module count that this change moves,
that is **scope growth** — see below.

### Step 16: FINAL-REVIEW
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.
Report: the paths; the Step 8 verbatim red for case 4 and which of the reporter's four
paths an approved `**` matched before the fix; the Step 9 measurements (the live
re-confirmation of zero unanchored declarations in the tree, the seven fixtures'
measured exposure verdict, both timing numbers); the human's answer to the
block-message question and what was done with it; the Step 13 forge attempt and every
evasion verdict; the verbatim green from Step 14 including whether the two enforcer
test files stayed green as predicted; what the block message actually said when read;
an explicit restatement of the eight things this does NOT fix; and every decision
taken under ambiguity.

## Ordering and file conflicts

**Builds AFTER `00127`**, which creates `src/lib/declared-breadth.js` and makes the
declared scope visible at the gate. Building this first would ship an unforgeable
acknowledgement to a question the human is never shown — see "THE DEPENDENCY WAS
INVERTED".

**A concurrent executor is editing `src/lib/iron-loop.js`, `src/lib/actions.js` and
several test files.** This plan declares NONE of those. It declares
`src/lib/plan-coverage.js`, which that executor is not named as touching — the
executor of this plan must confirm that at Step 9 and **stop and ask** if it has
changed.

`src/lib/plan-coverage.js` is also declared by `00129` in this same set, and `00129`
writes the same denial slot. **The ranking rule they share is defined in this plan and
referenced by that one** — see "THE DENIAL SLOT". Plans build **sequentially**, so
there is no concurrent-edit hazard; each executor reads the file live at Step 9 and
never takes its content from a plan.

`tests/unapproved-plan-grants-nothing.test.js` is **expected to go red** at case 7
(it pins an approved `**` as matching) and is **deliberately NOT declared here.**
That case is not wrong — it correctly pinned the behaviour of the day, and this plan
changes that behaviour. Amending it is a **tightening**, but it is still a file the
human's approval does not cover. The sibling slice's Decision 18 settled what to do:
**stop, name the file and the exact change, and ask.** Self-granting the scope would
invalidate the very approval being acted under, which is the shape this whole set
exists to close, one level up.

`src/hooks/PreToolUse.Edit.js` is likewise **not declared here** — see "THE BLOCK
MESSAGE" for the question that must be answered before Step 10.

## Decisions Taken Under Ambiguity

1. **Anchoring, not a count, is the enforcement rule.** A share-of-repository
   threshold has to walk the tree on a path that runs on every tool call, and its
   verdict drifts as unrelated files appear. Anchoring is a string scan, deterministic
   and cross-platform, and it targets exactly the shape the reporter demonstrated: a
   pattern rooted at the repository itself.
2. **The acknowledgement is a frontmatter key rather than a settings flag or a menu
   toggle.** Only a frontmatter key is inside the hashed specification, and that is the
   entire reason it cannot be self-granted. A settings file under `.ctoc/` is
   agent-writable; a menu toggle is not attached to the plan it authorises.
3. **A mixed list loses only its unanchored entries, not the whole plan.** Refusing
   the whole plan would turn one careless entry into a total mid-build lockout, and a
   lockout with a disproportionate cause is what gets a permission check reverted. The
   anchored entries were legitimately approved and keep granting exactly what they say.
4. **`**/*.js` is treated as unanchored.** It is rooted at the repository and reaches
   every directory, which is the property being bounded; that its tail is specific does
   not narrow where it reaches. A plan that genuinely needs it acknowledges it, and the
   acknowledgement is one line the human reads.
5. **Refusal is recorded as a denial with a reason, not silently skipped.** The
   sibling slice built the explanation path for exactly this; a refusal the human
   cannot read is indistinguishable from a bug in the matcher.
6. **THE DEPENDENCY IS INVERTED: this plan now builds AFTER `00127`.** An unforgeable
   acknowledgement to an invisible question is a signature on a blank page. The
   consent this design depends on is only informed once the gate screen shows the
   declared scope. `00127`'s own text pre-authorised this rewrite and called it small.
7. **The denial slot is ranked by REASON SEVERITY first, specificity second, and the
   rule is defined in this plan alone.** Three writers were about to share one slot
   under two incompatible instructions; whichever built second would have inherited an
   unspecified three-way precedence. The order follows remedy depth, because the slot
   exists to tell the human what to do, and a remedy that cannot work is worse than
   none. **This supersedes the earlier instruction in this same plan not to
   special-case the ranking.**
8. **The block message's wrong remedy is surfaced as a scope QUESTION, not fixed
   here.** `src/hooks/PreToolUse.Edit.js` is not declared by this plan, and adding it
   would change the frontmatter, break the specification hash, and invalidate the
   approval being acted under — the exact self-granting shape this set closes. Three
   named options go to the human at Step 9.
9. **Nothing is asserted that planning could not verify — and what planning COULD
   verify is now measured rather than deferred.** The tree was searched: **zero**
   unanchored declarations in any plan file. The fixtures were found and named:
   **seven**, across two files, and `iron-loop-enforcer.js` was searched and calls
   none of the guarded functions, so they do not traverse it. The earlier draft's
   claim that a grep was "polluted by markdown emphasis" is superseded — the search
   was re-run correctly. Timing remains MEASURE AT STEP 9. An estimate written as a
   fact is the defect class this repository fences; so is a measurement deferred that
   could have been taken.
