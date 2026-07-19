---
approved_by: human
approved_at: 2026-07-19T21:31:41.193Z
gate_crossed: implementation → todo
---

---
title: "One character separates a normal declaration from the whole repository — a declared pattern must be anchored somewhere, or say out loud that it is not"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
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

That measurement splits this into two independently approvable pieces, and this plan
is the first of them:

| | what it does | where it lives | fails |
|---|---|---|---|
| **this plan** | REFUSES an unanchored declaration unless the plan says out loud that it is unanchored | the coverage oracle, on the hook path | CLOSED |
| the sibling (`00127`) | SHOWS the human what a declaration grants, at the moment of choosing | the gate screen | soft |

They are separated so the human can take either, both, or neither. Coupling a
permission change to a display change would force one decision where there are two.

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

The threshold idea is not wrong — it is a **display** idea, and it is where `00127`
puts it.

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
| 3 | Any existing test fixture declaring an unanchored pattern goes red. | **MEASURE AT STEP 9.** Two are known to exist by subject (the sibling slice's cases 6 and 7 pin `files: ["**"]` behaviour) but the file is not read here. See "Ordering and file conflicts". |
| 4 | A plan mixing anchored and unanchored entries loses ONLY the unanchored ones. | **Yes, deliberately** — see Decision 3. Losing the whole plan would punish a typo with a total lockout. |

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
src/lib/declared-breadth.js  (NEW)
  └─requires→ nothing        [a pure string/shape predicate — no filesystem, no I/O]

src/lib/plan-coverage.js ──requires→ src/lib/declared-breadth.js   [NEW edge]
src/hooks/PreToolUse.Edit.js ──already requires→ src/lib/plan-coverage.js
```

No cycle (the new module requires nothing). No layer violation (the new edge points
into `lib/`). No filesystem access is added to the hook path at all.

### File: `src/lib/declared-breadth.js`
**Action:** CREATE
**Purpose:** The ONE encoding of "how wide is this declaration, and did the human say
so out loud". Pure, total, no I/O.

Exports:

- `isAnchored(glob)` → `boolean`
  - `true` iff `glob` is a non-empty string whose FIRST `/`-separated segment
    contains none of `*` or `?`. Evaluate on the same normalized form
    `scanForCoverage` already computes (backslashes to forward slashes, then
    `path.posix.normalize`) so a Windows-authored `src\**` is judged identically to
    `src/**`. A leading `./` is already collapsed by that normalization.
  - Non-string, empty string, or a leading empty segment (`/x`) → `false`.
  - **Never throws.**
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
  so the denial path and the tests share one spelling.

Deliberately NOT exported and NOT written: anything that counts files. This module
performs no I/O; the counting half belongs to `00127` and is added there.

### File: `src/lib/plan-coverage.js`
**Action:** MODIFY — one guard inside the existing glob loop

In `scanForCoverage`, immediately after the existing `globEscapesRoot(glob)` guard
(`:454`) and BEFORE `globToRegex`:

```
if (!declaredBreadth.isAnchored(glob) && !declaredBreadth.hasUnanchoredAcknowledgement(content)) {
  // record as a denial candidate, then continue
}
```

Three properties this placement buys, all load-bearing:

1. **The `content` is already in hand.** The scan reads each plan exactly once
   (`:434`) and reuses the text for glob parsing and the approval hash; the
   acknowledgement is read from that same string. **No extra file read is
   introduced.**
2. **It runs BEFORE the match**, so a refused pattern never reaches the matcher and
   never contributes to specificity ranking — an anchored, less-specific glob cannot
   be beaten by a refused broad one.
3. **It is skipped for every anchored pattern**, which is nearly all of them, so the
   common path costs one segment scan of a short string.

The refused pattern is recorded into the existing `denial` slot with
`reason: declaredBreadth.REFUSAL_REASON`, so `explainDenial` — and therefore the
block banner the sibling slice built (`PreToolUse.Edit.js:323-339`) — names the plan,
says the declaration is unanchored, and the human can read why. **A refusal nobody
can read is a refusal that gets reverted.**

One subtlety to get right rather than discover: the denial slot is ranked by
`specificity`, and `specificity('**')` is `-5` — the lowest score anything can have.
A refused `**` must still be able to explain itself when it is the ONLY candidate, and
must still lose to a more informative denial when both exist. The existing
`if (!denial || score > denial.score)` gives exactly that behaviour unchanged; do not
special-case it.

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

Case 12 is not optional. A file full of `null` assertions from a scan that never
matched anything is this repository's central defect class rebuilt inside its own
fix.

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `declaredBreadth.isAnchored` | `plan-coverage.scanForCoverage` | `PreToolUse.Edit.js:438`, on every Edit/Write/MultiEdit/NotebookEdit call |
| `declaredBreadth.hasUnanchoredAcknowledgement` | the same guard | the same |
| `declaredBreadth.REFUSAL_REASON` | the `denial` record → `explainDenial` → `buildBlockMessage` | the human's terminal, on every denial |
| `tests/declared-breadth.test.js` | the suite | `npm test` |

Nothing here is reachable only from a test.

## What this does NOT fix

1. **It does not show the human anything at approval time.** The gate screen still
   strips the frontmatter, so a `files:` list — anchored or not — is still invisible
   at the moment of choosing. That is `00127`, and it is separately approvable.
2. **An acknowledged `**` still grants the whole repository.** That is the point: the
   human's informed consent is preserved, only the silent version is removed.
3. **It says nothing about how MANY files an anchored pattern grants.** `src/**` here
   is 105-plus modules and is not refused. Breadth is bounded by ANCHORING, not by
   count. Counting is `00127`.
4. **It does not know which plan is building.** An approved, anchored plan still
   grants its files to any executor. That is `00129`.
5. **It does not resolve real paths.** An anchored pattern through an in-repository
   symbolic link still reaches outside. That is `00128`.
6. **Escape phrases are unchanged.** A human who types one can still edit anything.
   That is consent, deliberately preserved by the sibling slice and not narrowed here.
7. **No existing plan is amended.** If a queued plan declares an unanchored pattern,
   it is reported at Step 9 and re-approval is a human action through the menu. This
   plan does not edit, re-hash, or backfill any other plan.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write `tests/declared-breadth.test.js` in full and run **only that file, before
touching `src/`**. Record the starting state verbatim.

- **Case 4 must be RED** — today an approved `**` DOES cover `package.json`,
  `VERSION`, the hook and the ledger path. This is the reporter's run reproduced
  inside the suite. **If it is not red, STOP**: the premise is wrong and so is this
  plan.
- **Cases 7 and 9 RED.** Case 6 will be red for the wrong reason before the fix (the
  hash breaks anyway); record what reason it actually reports, and confirm at Step 14
  that the reason is a hash reason, not an anchoring one.
- **Cases 5, 8 and 12 must be GREEN already** and must stay green. They are the proof
  the change is not a blanket denial.
- Cases 1, 2, 3, 10 and 11 exercise a module that does not exist yet — they fail on
  the require. Record that; it is not evidence of anything.

### Step 9: PREPARE
Read from disk, in full, before changing anything: `src/lib/plan-coverage.js` (all of
it); `src/lib/declared-breadth.js`'s neighbours for module-shape conventions;
`src/lib/approval-ledger.js:364-425` (`computeSpecHash`) to CONFIRM by reading that
the full frontmatter is hashed — the acknowledgement design rests on it, and if it is
false this plan is wrong and must stop; `src/lib/approval-residency.js`; and
`src/hooks/PreToolUse.Edit.js:394-473`.

Then MEASURE the three things planning could not:

1. **How many declarations in this repository are unanchored.** Walk every plan file
   in `plans/todo/`, `plans/in-progress/` and `plans/implementation/`, parse each
   `files:` list with the real `readPlanFiles`, and report every entry whose first
   segment carries a wildcard, with its plan. **This is the false-positive
   measurement.** If any plan that is queued to build would lose coverage, name it to
   the human BEFORE Step 10 proceeds.
2. **Which existing test files build unanchored fixtures.** Grep the suite for
   `files: ["**"]` and its relatives. The sibling slice's
   `tests/unapproved-plan-grants-nothing.test.js` is known by subject to pin an
   approved `**` as MATCHING (its case 7) and will go red. **That file is not
   declared by this plan.** See "Ordering and file conflicts" — the answer is to stop
   and ask, not to self-grant.
3. **Timing.** `findCoveringPlan` over the real repository, before and after, for a
   covered target and an uncovered one. The added work is a segment scan of a short
   string per glob plus, only for an unanchored one, a frontmatter parse of text
   already in memory. **Above roughly 10 milliseconds per call, stop and report** —
   the budget the sibling slice set and measured against.

Where the code disagrees with this plan, **the code wins and the discrepancy is
recorded.**

### Step 10: IMPLEMENT
One step, files as sub-items.
- `src/lib/declared-breadth.js` — `isAnchored`, `hasUnanchoredAcknowledgement`,
  `REFUSAL_REASON`; total, no I/O, never throws.
- `src/lib/plan-coverage.js` — the one guard after `globEscapesRoot`, recording the
  refusal into the existing `denial` slot; the module header gains the anchoring rule
  and the reason it is not a count.
- `tests/declared-breadth.test.js` — the twelve cases.

### Step 11: REVIEW
Confirm there is exactly ONE encoding of anchoring in the repository, and that
`plan-coverage.js` contains no second copy of the rule. Confirm `declared-breadth.js`
requires nothing and touches no filesystem — a permission predicate on the hook path
that reads disk is a latency defect waiting to happen. Confirm the guard sits AFTER
`globEscapesRoot` and BEFORE `globToRegex`, so a refused pattern is never matched and
never ranked. Confirm the plan file is still read exactly once per scan. Confirm
`globToRegex`, `touchesOverlap` and `readPlanFiles`' exported signatures are
unchanged — `task-registry.js`, `task-reconcile.js` and `plan-index/conflict-detect.js`
depend on them.

### Step 12: OPTIMIZE
Confirm the anchored path — the overwhelming majority — costs one scan of the first
path segment and nothing else: no frontmatter parse, no allocation per glob beyond
what exists today. Confirm the acknowledgement parse runs at most once per plan per
scan and only when an unanchored pattern is actually present. Record the after-timing
against the Step 9 before-number.

### Step 13: SECURE
Adversarially, on a permission path.
- Confirm every fault returns rather than throws: non-string glob, unreadable
  frontmatter, unparseable frontmatter, a `unanchored_scope` key with an empty or
  non-string value, a frontmatter region that is absent entirely. Each must be a
  REFUSAL, never a throw — a throw reaches the hook's fail-open catch and becomes an
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
Targeted run first: `tests/declared-breadth.test.js`,
`tests/unapproved-plan-grants-nothing.test.js`,
`tests/plan-coverage-coverage.test.js`, `tests/enforcement-hook.test.js`,
`tests/false-green-fence.test.js`, `tests/architecture-invariants.test.js`,
`tests/export-reachability.test.js`, `tests/doc-counts.test.js`,
`tests/readme-numbers.test.js`.

Then the full gated run `npm test`; record `tests`, `suites`, `pass`, `fail`, the
zero-skipped counter and the coverage line **verbatim**. The coverage floor must not
be lowered. Lint every changed JavaScript file at `--max-warnings 0`.

Then prove the pipeline still runs: every plan in `todo/` and `in-progress/`
identified at Step 9 as coverage-holding must still resolve through
`findCoveringPlan` for its own declared files. If one that should be buildable is
not, **stop and report** — do not relax the predicate to make it pass. **No git
operations.**

### Step 15: DOCUMENT
A file header on `declared-breadth.js` stating: what anchoring means and why it is
the enforcement rule rather than a count; why the module performs no I/O; why the
acknowledgement is unforgeable (the specification hash covers the whole frontmatter);
and the fail-closed inversion in the form "this module must never throw, because the
hook's catch fails open". An inline comment at the `plan-coverage.js` guard naming
why it sits between `globEscapesRoot` and `globToRegex`. If `CLAUDE.md` or `README.md`
carry a module count that this change moves, that is **scope growth** — see below.

### Step 16: FINAL-REVIEW
Report: the paths; the Step 8 verbatim red for case 4 and which of the reporter's four
paths an approved `**` matched before the fix; the Step 9 measurements (every
unanchored declaration in the repository with its plan, every test file that builds
one, both timing numbers); the Step 13 forge attempt and every evasion verdict; the
verbatim green from Step 14; an explicit restatement of the seven things this does NOT
fix; and every decision taken under ambiguity.

## Ordering and file conflicts

**A concurrent executor is editing `src/lib/iron-loop.js`, `src/lib/actions.js` and
several test files.** This plan declares NONE of those. It declares
`src/lib/plan-coverage.js`, which that executor is not named as touching — the
executor of this plan must confirm that at Step 9 and **stop and ask** if it has
changed.

`src/lib/plan-coverage.js` is also declared by `00128` and `00129` in this same set.
Plans build **sequentially**, so there is no concurrent-edit hazard; each executor
reads the file live at Step 9 and never takes its content from a plan.

`tests/unapproved-plan-grants-nothing.test.js` is **expected to go red** at case 7
(it pins an approved `**` as matching) and is **deliberately NOT declared here.**
That case is not wrong — it correctly pinned the behaviour of the day, and this plan
changes that behaviour. Amending it is a **tightening**, but it is still a file the
human's approval does not cover. The sibling slice's Decision 18 settled what to do:
**stop, name the file and the exact change, and ask.** Self-granting the scope would
invalidate the very approval being acted under, which is the shape this whole set
exists to close, one level up.

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
6. **This plan does not touch the gate screen.** Making breadth visible is a separate,
   separately approvable decision (`00127`) with a different failure mode — soft, not
   closed. Bundling them would force one decision where the human has two.
7. **Nothing is asserted that planning could not verify.** The count of unanchored
   declarations already in this repository, which existing test files break, and the
   timing are all marked MEASURE AT STEP 9. A grep run during planning was polluted by
   markdown emphasis (`**bold**` inside plan prose), so **no number is claimed here.**
   An estimate written as a fact is the defect class this repository fences.
