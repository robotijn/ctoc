---
title: "The compliance seam is two call sites from being real — the coordinator names its functions in prose where the menu ships literal runnable recipes, and that difference is the whole reason one is reachable and the other is dead"
type: implementation
parent_plan: none
depends_on: 00089-the-product-stops-claiming-compliance-it-does-not-enforce
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "agents/coordinator/cto-chief.md"
  - "tests/compliance-seam-is-executable.test.js"
  - ".ctoc/reachability-baseline.json"
---

# The compliance seam is two call sites from being real

## Read this first: what this plan is, and what has to happen before it

**The honest order is to stop claiming first.** `00089` corrects every statement in this
repository that asserts a compliance control is enforced when nothing evaluates it. This
plan is `depends_on` that one and must not be built before it. Wiring a seam while the
surrounding pages still overclaim would make the overclaim *partly* true, which is harder
to reason about than a claim that is simply false.

This plan exists because the brief that commissioned it asked for the wiring to be
**recorded precisely, so the decision is the human's and the work is scoped**. The most
useful form of that record is a plan that is fully specified and ready to build rather
than an inert document — the scoping is the deliverable, and **when it is built is his
call**. Nothing here authorizes building it before `00089` lands.

Both plans edit `agents/coordinator/cto-chief.md`, so the scheduler will serialize them on
that file. The dependency and the file conflict point the same way, which is the intended
shape.

## The finding: prose against a literal recipe

`agents/coordinator/cto-chief.md:238-258` is a genuine, complete compliance dispatch
protocol. `00089` examined it and — correctly — declined to retract it, on the ground that
in this system **the session model executing an agent definition IS the runtime**. It has
a real caller in the sense that matters to a user.

And yet all seven files below it sit in `.ctoc/reachability-baseline.json` as dead. Both
things are true, and the reason is the form of the instruction.

The coordinator names its functions in a sentence:

> Read the compliance trigger via `src/lib/iron-loop-compliance-trigger.js` — call
> `evaluateComplianceTrigger(projectRoot)` … (`:240-242`)
>
> dispatch the compliance seam `src/lib/compliance-integration.js` — call
> `runComplianceForTransition(projectRoot, { gdprFindings, euAiActFindings })` (`:251-253`)

The menu ships something a session can execute verbatim, for example
`src/commands/menu.md:67`:

```js
node -e "const s=require('${CLAUDE_PLUGIN_ROOT}/src/lib/stale-detector');…console.log(JSON.stringify(s.dismissStale(process.cwd(), candidates)))"
```

**That difference is the entire gap.** A named function in a sentence is a thing a model
must reconstruct a call for; a literal program is a thing it runs. The reachability
analyzer encodes exactly that distinction — `SURFACE_REQUIRES_RE` and
`SURFACE_NODE_RUNS_RE` at `src/lib/reachability.js:336-339` credit an instruction that
RUNS a file and refuse to credit one that merely mentions it. The re-seed comment at
`.ctoc/reachability-baseline.json:2` states the rule: "a path is a root only when a
shipped instruction RUNS it".

So the fence is not wrong and `00089` is not wrong. The instruction is in the weaker of
two available forms, and converting it is a small, bounded change.

## Exactly what two call sites revive

Verified by reading each module's `require` block on 2026-07-20.

**Entry point one** — `cto-chief.md:240-242` → `src/lib/iron-loop-compliance-trigger.js`
(requires `./safe-fs` and `./compliance-regime`, both already live):

1. `src/lib/iron-loop-compliance-trigger.js`

**Entry point two** — `cto-chief.md:251-253` → `src/lib/compliance-integration.js`, whose
requires at `:69-72` pull the rest:

2. `src/lib/compliance-integration.js`
3. `src/lib/gdpr-agent-runner.js`
4. `src/lib/eu-ai-act-agent-runner.js`
5. `src/lib/compliance-dedup.js`
6. `src/lib/gdpr-helpers.js`
7. `src/lib/eu-ai-act-helpers.js` — reached via `eu-ai-act-agent-runner.js:46`

**Seven files, from two recipe conversions.** Every one is in the unreachable baseline
today (`:17,:18,:20,:21,:23,:24,:26` at the time of writing — re-read the file rather than
trusting those positions).

`cto-chief.md:4` declares `tools: Read, Grep, Glob, Task, Bash`. **It holds `Bash`**, so it
can execute the recipe once it is written in executable form. This is the crucial
difference from `00110`'s five agents, which are ordered to call JavaScript with no tool
that can run it — there, the order is impossible; here, the order is merely soft.

## What this builds

Two recipe conversions in `agents/coordinator/cto-chief.md`, in the menu's literal form,
plus a test that proves each one runs.

The conversions preserve every existing property of the protocol, and each is asserted:

- **Dispatch stays Tier 0.** `dispatcher` is always the literal `"cto-chief"` and never
  `"iron-loop"` — the machine-checkable proof that library code never dispatches (`:245-248`).
- **The seam is a provable no-op with no regime active.** With `runGdpr` and `runEuAiAct`
  both false, nothing is dispatched (`:256-258`).
- **Findings are advisory.** No plan moves, no gate is added, no `review_gate` or
  enforcement key is touched (`:260-264`).
- **The dispatch is logged** with `dispatcher: "cto-chief"` per `docs/DISPATCH_PROTOCOL.md`
  (`:266-267`).

The prose that explains WHY each step exists stays. What changes is that the two "call
this function" sentences each gain the program that calls it.

## Implementation Details

### File: `agents/coordinator/cto-chief.md`
**Action:** MODIFY — steps 1 and 2 of the compliance dispatch section only

Step 1 gains a literal program of the menu's form, naming the module **with its `.js`
extension** — without the extension the analyzer credits nothing and the conversion
achieves nothing, which is the defect `00187` repairs in general:

```js
node -e "const t=require('${CLAUDE_PLUGIN_ROOT}/src/lib/iron-loop-compliance-trigger.js');console.log(JSON.stringify(t.evaluateComplianceTrigger(process.cwd())))"
```

Step 2 gains the corresponding program for `runComplianceForTransition`, run **only** when
the trigger reports a regime on. The argument shape is taken from the function's actual
signature read at Step 9 — **not from the prose in the current agent body, and not from
this plan.** The prose is what has gone unverified for the life of this defect, and a
recipe transcribed from unverified prose is `00185` happening a second time.

The existing numbered structure, the `dispatcher` invariant, the advisory language and the
logging requirement all stay exactly as written.

### File: `tests/compliance-seam-is-executable.test.js`
**Action:** CREATE

| # | Case | Assertion |
|---|---|---|
| 1 | both recipes are extractable | the compliance dispatch section yields two `node -e` programs; a section yielding fewer FAILS naming which |
| 2 | each names its module with `.js` | a dropped extension re-kills seven files, silently, and this is the case that catches it |
| 3 | each named export exists | `typeof mod.evaluateComplianceTrigger === 'function'`, same for `runComplianceForTransition` |
| 4 | **the trigger recipe runs and returns the documented descriptor** | fixture project with no regime active; run the extracted program; stdout parses to an object carrying `runGdpr`, `runEuAiAct` and `dispatcher` |
| 5 | **`dispatcher` is the literal `cto-chief`** | never `iron-loop`. The invariant the agent body calls machine-checkable, finally checked by a machine |
| 6 | **no regime active ⇒ provable no-op** | `runGdpr` and `runEuAiAct` both false; the seam recipe is not run; nothing is written under `.ctoc/inbox/` |
| 7 | **a regime active ⇒ the seam recipe runs and attaches findings** | fixture with a written regime profile; run both programs in sequence; assert a finding reached the Inbox |
| 8 | the seam moves no plan and crosses no gate | before-and-after comparison of every file under the fixture's `plans/`: byte-identical. No `approved_by` marker is written anywhere |
| 9 | **the seven files leave the unreachable set** | run `analyze()` on the real root; none of the seven appears in `result.unreachable` |
| 10 | the recipes are not duplicated in the test | the test extracts from the agent file and holds no copy — asserted structurally by there being exactly one occurrence of each program text in the repository outside the agent body |

Fixtures under `os.tmpdir()`, `path.join` throughout, `fs.promises.rm` teardown, no shell,
`process.execPath` rather than `node`.

If `00186` has landed, cases 1-4 and 7 should be expressed through
`src/lib/recipe-harness.js` rather than reimplemented, and the two recipes added to
`.ctoc/recipe-coverage.json`'s `covered` list. **Check at Step 9 which is the case** — a
second extraction implementation is the drift the one-fence-per-invariant rule exists to
prevent.

### File: `.ctoc/reachability-baseline.json`
**Action:** MODIFY

Seven files become reachable, and `tests/reachability.test.js:206-213` asserts the live
count **equals** `maxUnreachable`, so the baseline must be tightened in this same change or
the suite reds.

**Measure, do not copy a number from this plan.** Run the analyzer, read the live count,
set `maxUnreachable` to it, and remove exactly the files that left. The expected drop is
seven; the starting point depends on whether `00185` and `00187` have landed. **A count
that removes anything other than these seven, or removes fewer than seven, is a finding to
report rather than a number to overwrite** — fewer than seven would mean a require edge
does not run the way this plan read it, and that is worth knowing before it is committed.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| the trigger recipe | `agents/coordinator/cto-chief.md` step 1, executed by CTO Chief at the Gate 1 crossing | a session dispatching CTO Chief, reached from `/ctoc:menu` |
| the seam recipe | the same section, step 2, conditional on the trigger | the same |
| all seven modules | the two recipes above | the same |

CTO Chief holds `Bash` (`:4`), so the recipes are executable by the agent that carries
them. This is the whole slice: seven modules that currently have no root acquire one.

## Test Plan

Covered by the ten cases. Case 9 is the measurement that proves the slice did what it
claims; cases 6 and 8 are the guards that the revived seam stays advisory and gate-safe,
which is the property that made it acceptable to have at all.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write the test file FIRST against the unmodified agent body. **Cases 1, 2, 4, 7 and 9 must
be RED.** Record case 9's red verbatim — seven files listed as dead beneath a protocol
that a coordinator is instructed to follow is the evidence for this slice.

### Step 9: PREPARE
**Confirm `00089` has landed** and read what it changed in `agents/coordinator/cto-chief.md`;
if it has not, STOP and report — the ordering is the human's ruling, not a preference.
Read the real signatures of `evaluateComplianceTrigger`, `writeComplianceTrigger` and
`runComplianceForTransition` from their modules, **and construct the recipes from those
signatures rather than from the agent body's prose or from this plan.** Read
`compliance-integration.js:60-90` and each runner's requires to re-verify the seven-file
closure. Check whether `src/lib/recipe-harness.js` exists. Read
`.ctoc/reachability-baseline.json` for the current count. **Where the code disagrees with
this plan, THE CODE WINS and the disagreement is reported.**

### Step 10: IMPLEMENT
- `agents/coordinator/cto-chief.md` — the two recipe conversions, extensions included.
- `tests/compliance-seam-is-executable.test.js` — the ten cases.
- `.ctoc/reachability-baseline.json` — measured count, measured removals.

### Step 11: REVIEW
Confirm each recipe's arguments match the signature read at Step 9, argument by argument —
this is the review step that would have caught `00185` years earlier. Confirm the
`dispatcher` invariant, the advisory language, the no-gate guarantee and the logging
requirement all survive the edit unchanged. Confirm no recipe can run the seam when both
regime flags are false.

### Step 12: OPTIMIZE
Two child processes at one transition, on a cold human-triggered path. The second runs only
when a regime is active. Nothing to optimize; do not cache the trigger verdict, because a
regime can change between transitions.

### Step 13: SECURE
The recipes pass `process.cwd()` and no interpolated user value, so there is no injection
surface — assert that, rather than assuming it, by checking no `<placeholder>` remains in
either program. The seam writes to the Inbox; case 8 asserts it writes nowhere near
`plans/`. Findings text originating from a regime profile must not be echoed unescaped into
any surface the test inspects.

### Step 14: VERIFY
`node --test tests/compliance-seam-is-executable.test.js`, then every existing compliance
and reachability test, then the full gated `npm test`. Lint at `--max-warnings 0`. No git
operations. **Report the live unreachable list before and after, in full**, and report
whether any real file under `plans/` or `.ctoc/inbox/` changed during the run.

### Step 15: DOCUMENT
Record in `CLAUDE.md`'s compliance section that the seam is dispatched by CTO Chief through
an executable recipe and that it remains advisory — **only if `00089` has not already
written that sentence.** Read the file first; a duplicated or conflicting statement in the
same section is the defect this whole set exists to remove.

### Step 16: FINAL-REVIEW
Report case 9's red verbatim, the before-and-after unreachable lists, every disagreement
between the signatures and the prose, and every decision taken under ambiguity.

## What this plan does NOT fix

These are recorded precisely, because the brief asked for the scope of the remaining
compliance wiring to be measured rather than waved at.

- **`src/lib/eu-recommender-helpers.js` has no runner at all.** Unlike the seven above, it
  is not reachable from any entry point this slice creates. Its only citations are
  `agents/compliance/eu-solution-recommender.md:32,68,151`, which reference it by name in
  prose — and that agent declares `tools: WebSearch, WebFetch`, holding neither `Read` nor
  `Bash`, so it could not run the file even if the reference were a recipe. `00110`
  corrects that agent's impossible orders; **correcting an impossible order is not wiring**,
  and neither plan makes this module reachable. What it would take: a runner module that
  calls the helpers, and a live dispatch path to that runner. That is unbuilt work and the
  human schedules it.
- **Eleven governance controls each gate on a function with zero callers, and need eleven
  separate call sites at different pipeline stages.** `src/lib/ai-provenance.js`,
  `audit-chain.js`, `budget.js`, `data-lineage.js`, `irac-schema.js`, `legal-hold.js`,
  `privilege-posture.js`, `proportionality.js`, `retention.js`, `spoliation-safe.js` and
  `traceability-matrix.js`. Each belongs at a different point — a destructive operation, a
  dispatch record, a plan transition, a gate crossing — so **no single change reaches
  them**, and a plan claiming to wire "the compliance subsystem" would be overstating by an
  order of magnitude. `src/lib/four-eyes.js` is a twelfth module in the same state; its
  false claim in `docs/INDEPENDENCE.md:83` belongs entirely to `00089` and is not touched
  here.
- It does **not** revive `src/lib/regulatory-regime.js`'s `isControlEnabled` for any control
  beyond the one that already consults it (`independent_verification_validation`, via
  `agents/coordinator/ivv-chief.md:35-36`). `00089` records that forty-one of forty-two
  controls have no evaluator; this slice changes that count by zero.
- It does **not** correct any compliance claim in any document. Every one of those is
  `00089`'s, and this slice must not edit `docs/INDEPENDENCE.md`,
  `docs/CRITICAL_CONTROL_POINTS.md` or `docs/PROCESS_FMEA.md`.
- It does **not** add a human gate, move a plan, or change enforcement. The seam is
  advisory, and cases 6 and 8 exist to keep it that way.

## Decisions Taken Under Ambiguity

1. **The record takes the form of a buildable plan rather than an inert document.** The
   brief asked for the wiring to be recorded so the decision stays the human's. A plan
   with exact call sites, an exact file closure, and a test that proves each recipe runs is
   a stronger record than prose, and it does not schedule itself — `depends_on 00089` and
   this section are what keep the timing his.
2. **Two recipes, not one combined program.** The protocol is conditional: the seam runs
   only when the trigger says a regime is on. Collapsing both into one program would put
   that condition inside a shell one-liner, where it cannot be read or reviewed, and would
   make the provable-no-op property (case 6) untestable.
3. **The recipes are constructed from the signatures at Step 9, never from the prose.**
   The prose is the artifact that went unverified; transcribing it into an executable form
   would encode any error it contains — which is precisely how `00185`'s defect was born.
4. **The `.js` extension is mandatory in both recipes.** Without it the analyzer credits
   nothing and the entire slice achieves nothing measurable, which is why case 2 exists as
   its own assertion rather than as a detail of case 1.
5. **No claim in any document is edited here.** `00089` owns every compliance claim. Two
   plans editing the same sentence is the collision that produces a third, incoherent
   variant.
6. **The remaining wiring is enumerated with its shape, not with a phase or an order.**
   Eleven controls at eleven stages, and one helper with no runner: that is a technical
   dependency statement. What gets built and when is the human's, and a plan that proposed
   a sequence would be making that decision quietly.
7. **If `00186` has landed, its harness is reused rather than reimplemented.** A second
   recipe-extraction implementation would drift from the first, and the two would disagree
   about which recipes are covered — the failure the one-fence-per-invariant rule names.
