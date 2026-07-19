---
title: "Five agents are ordered to run code they have no way to run — the orders are corrected and a fence stops the next one"
type: implementation
parent_plan: none
depends_on: none
priority: CRITICAL
iron_loop: true
files:
  - "agents/compliance/eu-ai-act-agent.md"
  - "agents/compliance/gdpr-agent.md"
  - "agents/compliance/eu-solution-recommender.md"
  - "agents/planning/vision-decomposer.md"
  - "agents/planning/product-owner.md"
  - "src/lib/unexecutable-instruction-scan.js"
  - "src/lib/iron-loop-enforcer.js"
  - "tests/unexecutable-instruction-fence.test.js"
  - ".ctoc/unexecutable-instruction-baseline.json"
  - "CLAUDE.md"
---

# Five agents are ordered to run code they have no way to run

An agent definition is a set of orders. The `tools:` line in its frontmatter is the
complete list of things it can actually do. When the body of the orders says *call this
JavaScript function* and the tool list contains no way to execute JavaScript, the order
is not hard, not slow, not flaky — it is **impossible**, and nothing anywhere reports
that. The agent does the parts it can, silently skips the part it cannot, and returns a
result that reads exactly like success.

This is not a platform limitation. **78 of the 124 agent definitions declare `Bash`**
(counted from the `tools:` frontmatter across `agents/**/*.md`). It is a per-agent
authoring defect, and it is the root cause underneath two dead subgraphs.

## Verified against disk, 2026-07-19

Everything below was re-read from the working tree. Where the brief that commissioned
this plan disagreed with the code, **the code won and the disagreement is recorded** in
"Discrepancies" at the end.

| Agent | `tools:` (frontmatter) | Told to call JavaScript? |
|---|---|---|
| `agents/compliance/eu-ai-act-agent.md` | `Read, Grep` (line 9) | yes — 6 functions |
| `agents/compliance/gdpr-agent.md` | `Read, Grep` (line 9) | yes — 4 functions |
| `agents/compliance/eu-solution-recommender.md` | `WebSearch, WebFetch` (line 9) | yes — 5 functions, and it holds no `Read` either |
| `agents/planning/vision-decomposer.md` | `Read, Write, AskUserQuestion` (line 4) | yes — 10 functions |
| `agents/planning/product-owner.md` | `Read, Write, WebSearch` (line 4) | yes — 5 functions |
| `agents/iron-loop/iron-loop-integrator.md` | `Read, Write, Edit` (line 4) | **NO — this agent is clean, see below** |

### What the impossible orders cost

Two subgraphs are dead because the instruction that was supposed to reach them cannot.

- **The compliance agent-runner chain.** `src/lib/compliance-integration.js` is the top of
  it and **no file in `src/` requires it** (verified by grep for
  `require('./compliance-integration')`). Below it sit `gdpr-agent-runner.js` and
  `eu-ai-act-agent-runner.js`, which are required only by that unreached top.
  **Precision matters here and the plan holds to it throughout:** what is dead is the
  *runner chain*, **not** the regime-gate predicates. `shouldRunGdpr` and
  `shouldRunEuAiAct` are **live**, called at `src/commands/menu.js:15,74` for the
  first-run compliance question. Saying "the compliance subsystem has no callers" is an
  overstatement, and this plan does not make it anywhere.
- **The refinement loop's decision layer.** `.ctoc/export-reachability-baseline.json`
  lines 66–75 list **exactly ten** dead exports from `src/lib/refinement-loop.js`:
  `appendRound`, `buildLetter`, `computeFingerprint`, `detectImplementerWall`,
  `detectOscillation`, `fingerprintsMatchFuzzy`, `phaseConverged`, `selectPanel`,
  `shouldEscalate`, `writeLetter`. Its gate, `shouldRunLoop`, is **live** at
  `src/lib/actions.js:683` and is correctly absent from that list.

**This plan does not wire either subgraph, and a reader must not take it for that.** It
corrects the orders and builds the fence. Making the compliance runner chain and the
refinement loop actually run is separate work; what it is, and when it happens, is the
human's to schedule. What this plan removes is the *illusion* that the orders already do it.

## SCOPE BOUNDARY — SETTLED BY THE HUMAN, DO NOT RE-OPEN

There was a scope conflict here. **The human ruled on it on 2026-07-19, and the ruling is
his** — not the planner's and not the coordinator's. It is recorded as settled so nobody
rediscovers the conflict and re-litigates it.

**The conflict.** A plan already existed, un-built and pre-Gate-2, titled *"A ratcheting
fence against an instruction that can never execute — something documented, registered, or
ordered where nothing on the other end can act on it"*
(`plans/implementation/00073-ui1-unexecutable-instruction-fence.md`). It specified **three**
detections in one scanner, and its middle detection was exactly this plan's defect.

**The ruling.** This plan builds the detection for *an order to an agent to run code its
own tool grant cannot execute*, with all three of its signatures. That older plan is
**narrowed** to the two detections this one does not cover, and has been amended to say so
and to name this plan in plain words.

**THE BOUNDARY RULE — this sentence appears in both plans, and it is the boundary:**

> **One fence per invariant, or the two drift and the human trusts neither.**

Concretely, and permanently:

| Invariant | Owner | The other plan must never grow a checker for it |
|---|---|---|
| an order to an agent to run code its `tools:` grant cannot execute | **this plan** | the older plan must not add this detection back |
| a document naming a task kind the accepted vocabulary rejects | **the older plan** | this plan must not add it |
| a configuration key written or documented that nothing reads | **the older plan** | this plan must not add it |

This plan therefore **takes over the file names** the older plan had reserved —
`src/lib/unexecutable-instruction-scan.js`, `.ctoc/unexecutable-instruction-baseline.json`,
`tests/unexecutable-instruction-fence.test.js`, and one `CHECKS` entry in
`src/lib/iron-loop-enforcer.js`. The older plan becomes "add the remaining two detections to
the scanner this plan ships". There is one scanner, one baseline, one test file, one
`CHECKS` entry.

**Ordering:** this plan lands first, because the older plan's two remaining detections
extend a module that does not exist until this plan ships it. The older plan's earlier
blocker — a build conflict with the false-green fence over `src/lib/iron-loop-enforcer.js` —
has cleared: that fence has landed (`.ctoc/false-green-baseline.json` is live and
`CLAUDE.md` documents it).

---

## Per-agent decisions

The brief asked for a per-agent answer, not a blanket one. A blanket "grant them all
`Bash`" would widen five tool grants to fix what is, in most cases, a documentation
defect — and `Bash` is the widest grant there is: an agent that holds it can do anything
the shell can. **No agent in this plan is granted `Bash`.** Two agents are granted `Glob`,
a read-only listing tool, for the one capability that genuinely cannot be reached
otherwise.

### 1. `agents/compliance/eu-ai-act-agent.md` — (b) and (c), no new grant

Six functions are named as calls. They split cleanly:

| Named function | Where | Decision | Evidence |
|---|---|---|---|
| `shouldRunEuAiAct(projectRoot)` | line 35 | **(c) the dispatcher**, plus a **(b)** self-check | the profile gate is a *dispatch* decision, and `src/commands/menu.js:15,74` already calls it for the menu ride-along |
| `filterToEuAiAct`, `normalizeSeverity`, `routeFinding` | lines 81–87 | **(c) the runner** | `src/lib/eu-ai-act-agent-runner.js:46` **already requires and calls exactly these three** — the agent's instruction is both impossible and redundant |
| `classifyFromPlanText(planText)` | line 56 | **(b) read the authority** | the agent holds `Read`; `src/lib/eu-ai-act-helpers.js` is the readable single authority and stays so |
| `readEnforcementDates('.ctoc/regulatory-regimes/eu-ai-act-high-risk.yaml')` | line 92 | **(b) read the file** | the helper's whole job is to read that YAML; an agent with `Read` opens it directly. No date literal enters the agent file, so the DRY rule at lines 114–129 is preserved. |

The gate instruction has a second defect worth naming, because it shows the order was
never checked against reality: lines 33–35 say *"before your very first tool call"* and
*"making NO tool calls"*. Even if the agent could somehow evaluate the gate, any way of
answering it — reading settings, running a helper — **is a tool call**. The order forbids
the only means of obeying it.

**Rewrite.** The Gate section states that the dispatcher must not dispatch this agent
unless `shouldRunEuAiAct(projectRoot)` returns true, **naming `shouldRunEuAiAct` as the
authority for the rule** — this is load-bearing, because `tests/eu-ai-act-agent.test.js`
and its sibling assert the body names the gate function, and that assertion is right: the
agent file must say where the rule lives. It then adds a defence-in-depth self-check the
agent can actually perform: *as your first action, `Read` `.ctoc/settings.yaml`; if
`regulatory_regime.active_profiles` does not contain `eu-ai-act-high-risk`, stop and
return "profile inactive, no-op".* The profile name is already in this agent's own
frontmatter (`regime_profile:`), so nothing new is duplicated.

### 2. `agents/compliance/gdpr-agent.md` — (b) and (c), no new grant

Identical shape, identical treatment.

| Named function | Where | Decision | Evidence |
|---|---|---|---|
| `shouldRunGdpr(projectRoot)` | line 31 | **(c) dispatcher + (b) self-check** | `src/commands/menu.js:15,74` calls it live |
| `validateFindingSchema`, `normalizeSeverity`, `routeFinding` | lines 72–79 | **(c) the runner** | `src/lib/gdpr-agent-runner.js:40` **already requires and calls exactly these three** |
| `mapPiiFieldToArticles(field)` | line 49 | **(b) read the authority** | the agent holds `Read`; `src/lib/gdpr-helpers.js` is the readable authority |

This file also carries a stale promise. Lines 81–83 say *"The wiring that performs the
actual Inbox / letter write lives in EC2-s4; this definition names the path, s4
implements the write."* **EC2-s4 has landed** — `plans/done/EC2-s4-wire-gate-and-routing.md`
— and it produced `src/lib/gdpr-agent-runner.js`. The sentence describes a future that is
already the past, and it must be replaced by a statement of what the runner does today.

**Why not `Bash` here.** `tests/gdpr-agent-definition.test.js:51` pins this agent to
`Read, Grep` with the comment *"NO Write, NO Bash, NO Edit (advisory, cannot write)"*.
That is a deliberate, tested decision: an advisory compliance agent that cannot write
cannot weaken a gate. Granting `Bash` would fail that test, and per Operating Lesson 14
the test is right and the code is what changes.

### 3. `agents/compliance/eu-solution-recommender.md` — (b), with a named gap

This one is not merely unexecutable, it is incoherent. Line 89 orders:

> You construct your fetcher exactly once, via `createFetcher(WebSearch, WebFetch)`

`WebSearch` and `WebFetch` are tools the model invokes, not values a JavaScript function
can receive. There is no grant — not even `Bash` — under which an agent can pass its own
tool handles into a function. The same holds for `validateOutputSchema`,
`validatePriceString`, `checkMonotonicity` and `applyFallback` (lines 65–111), and this
agent has **no `Read`**, so it cannot even open `src/lib/eu-recommender-helpers.js` to
follow the rules by hand.

**Decision (b): rewrite every order into something the agent can do with `WebSearch` and
`WebFetch`.** It returns the three buckets in the documented shape and obeys the content
rules as prose it can follow — EU-region-only `hosted` entries, price as a fact with
`source_url` and `retrieved_date`, a strictly increasing unique `quality_rank` per bucket,
no `selected` field, `unverified_this_run: true` on any field whose fetch failed.
Validation is a code-side concern and the agent is told so.

**The gap, stated rather than hidden:** `src/lib/eu-recommender-helpers.js` exists and
**nothing in `src/` requires it** (verified by grep). So the code that would validate this
agent's output does not run today. That is why the rewrite phrases the orders as *return
this shape* — a thing the agent can do unconditionally — rather than *the caller will
validate*, which would be a fresh order with no receiver, this plan's own defect
reintroduced. Wiring the validator is separate scheduled work.

A second defect in the same file: lines 31 and 148 cite
`plans/implementation/EC4-eu-solution-recommender.md` as a rule authority. **That path
does not exist** — the file is at `plans/done/EC4-eu-solution-recommender.md`. The
citation is corrected to the real path, with the honest note that this agent cannot read
it (no `Read`), so the rules it needs are the ones stated in its own body.

### 4. `agents/planning/vision-decomposer.md` — (b), (c), and one minimal grant

The largest instance: ten functions, across an edit-operations list (lines 456–459), a
handoff sequence (lines 467–469), and a "Tools Used" manifest (lines 590–607) that reads
as a claim of capability.

| Named function | Decision | Why |
|---|---|---|
| `createStub`, `decomposeVision`, `mergeStubs` | **(b) do it with `Write`** | all three ultimately write a stub file in `plans/functional/`, and this agent holds `Write`. The stub template is already in this file. |
| `writeStatus(stubPath, {...})` | **(b) do it with `Write`** | `src/lib/background.js:14,27-38` writes `<planPath>.status`, a plain JSON object with six fields. `Write` produces that file exactly. |
| `removeStub`, `completeVision` | **(c) the session model** | these delete and move files. `Write` cannot delete and cannot move; the dispatching session holds `Bash`. |
| `listStubs(visionSlug)` | **(a)-lite: grant `Glob`** | enumerating `plans/functional/<slug>-*.md` needs directory listing. `Read` on a directory errors and `AskUserQuestion` is irrelevant. `Glob` is read-only and cannot mutate anything — a far smaller widening than `Bash`, and it is the tool whose literal purpose this is. |
| `validateVisionReadiness(visionPath)` | **(b) read the authority** | the agent holds `Read`; `src/lib/vision-decomposer.js` is the readable authority |
| `slugify(str)` | **(b) state the rule inline** | lowercase, `[^a-z0-9]+` → `-`. A naming convention, not logic worth an order. |
| `initProductOwnerAgent(stubPath)` | **remove — the function does not exist**, see below |

The "Tools Used" section (lines 590–607) is rewritten into two honest lists: **tools this
agent holds**, and **authorities it reads**. A function name in a capability manifest is a
claim, and a claim about a capability the agent does not have is the same lie as an order
it cannot obey.

There is a shipped precedent for decision (c) here and it should be cited in the rewrite:
`src/commands/menu.md:323-333` already tells the **session** to dispatch this agent. The
session is the actor that holds `Bash`.

### 5. `agents/planning/product-owner.md` — (b) and one minimal grant

| Named function | Where | Decision | Why |
|---|---|---|---|
| `markNeedsInput`, `markComplete`, `writeStatus`, `readStatus` | lines 20, 22, 30, 51–53, 75, 119, 336, 342, 361, 365 | **(b) `Read` then `Write` the status file** | the artifact is `<stubPath>.status`, plain JSON, six fields (`src/lib/background.js:27-38`). `markComplete` and `markNeedsInput` *preserve* the existing `agent` and `started` values (`:117-140`), so the order is: `Read` the status file, then `Write` it back with `status` and `message` changed. Both tools are held. The agent is pointed at `src/lib/background.js` as the shape authority, which it can `Read`, so the shape is not duplicated into prose where it would drift. |
| `getVisionStubs(visionSlug)` | line 115 | **grant `Glob`** | same argument as `listStubs` above: sibling-stub enumeration needs directory listing, and `Glob` is read-only |
| `initProductOwnerAgent(stubPath)` | lines 42, 533 | **remove**, see below |

### 6. `agents/iron-loop/iron-loop-integrator.md` — **no defect; do not change this file**

The brief reported that this agent is told to drive the refinement loop "via the Task
tool" and holds no `Task`. **I read the whole file and that instruction is not there.** The
opposite is:

- line 19 — *"You do NOT dispatch sibling agents directly — you recommend dispatches; CTO Chief executes them."*
- line 44 — *"**What the integrator does NOT do:** it does not itself dispatch critics. CTO Chief executes the loop at runtime."*

The only reference to code is line 35: *"**When the loop runs** (gate from
`src/lib/refinement-loop.js#shouldRunLoop`)"* — a parenthetical citation, in the
`file#name` documentation form, with no imperative verb and **no call parenthesis**. It
tells the reader where the rule lives; it does not order the agent to evaluate it. That is
exactly the line the export-reachability baseline draws in its own comment: *a citation is
not an invocation.*

This file is therefore not edited, and it earns a better job: **it is the fence's live
negative control.** A fence that flags `iron-loop-integrator.md` is a fence that cannot
tell an order from a description, and test 6 below fails the build if it does.

(One real but unrelated defect found in it, reported not fixed: its MANDATORY step-label
table at lines 57–71 runs **Step 7 TEST … Step 15 FINAL-REVIEW**, while the canonical
skeleton in `CLAUDE.md` and every recent plan runs **Step 8 TEST … Step 16 FINAL-REVIEW**.
An off-by-one in the table an agent is told never to modify. Different file, different
defect class, not in this plan's scope.)

---

## The function that does not exist: `initProductOwnerAgent`

**Verified.** A repository-wide grep for `initProductOwnerAgent` returns hits in exactly
three kinds of place: plan files, `tests/actions-dead-exports-guard.test.js` (which names
it as a string literal to assert its *absence*), and the two agent bodies. **Nothing in
`src/` defines or exports it.**

**Decision: remove the instruction. Do not write the function.** The evidence is not a
judgement call:

1. It was **deliberately deleted** by a landed, human-gated plan —
   `plans/done/ctoc-audit-w11-s7-queue-order-and-dead-exports.md` — as one of five
   one-line "init an agent" wrappers with zero call sites anywhere in `src/` or `tests/`.
2. The real spawn path is `initBackgroundAgent()`, called directly by `approvePlan` and
   `completeExecution`. The wrapper added nothing.
3. `tests/actions-dead-exports-guard.test.js:22-28,50-70` is a permanent regression guard
   that **fails the build** if any of the five names reappears in `src/` or `tests/`.
   Writing the function back would fail a shipped test that encodes a human-approved
   decision — Operating Lesson 14 says the code changes, not the test.
4. What the surrounding instructions actually need is a *status file* and a *dispatch*.
   The status file is decision (b) above — `Write` it. The dispatch belongs to the
   session. Neither needs this wrapper.

There is a lesson inside the survival of this name that the fence must absorb: **that
guard sweeps `src/` and `tests/` only, never `agents/`.** The stale order survived for
that exact reason — the fence that would have caught it was not pointed at the agent
corpus. The new fence is.

`agents/planning/vision-decomposer.md:468` and `:605` and
`agents/planning/product-owner.md:42` and `:533` are corrected to name
`initBackgroundAgent()` as the live spawn, described in the third person as something the
dispatcher does — never as an order to these agents.

---

## The fence

A prose rule silently stops being true. The rule *"do not order an agent to run code it
cannot run"* has to become a test that fails inside `npm test`.

### Telling an order from a mention

This is the whole design problem. `agents/**/*.md` is dense with function names written in
backticks while the document explains how the system fits together, and a detector that
cannot tell those from orders gets whitelisted into uselessness inside a month.

The line this repository already draws is stated verbatim in
`.ctoc/export-reachability-baseline.json`: **a citation is not an invocation.**

**Read `src/lib/reachability.js` carefully before copying anything out of it, because that
module contains BOTH the exemplar and the counter-example, twenty lines apart, and landing
on the wrong function leads a reader to exactly the opposite conclusion.** Verified against
disk:

| Half | Declared at | Behaviour | Verdict |
|---|---|---|---|
| **`exportedNames`** — the export-level analysis | `:499` | calls `stripComments(source)` as its **first** statement (`:500`) before looking for any name. Its docblock explains why: the module's own header comment naming `completeExecution` was once enough to resurrect that dead export. *"A fence a comment can disarm is not a fence."* | **THE EXEMPLAR.** This is the function to copy. |
| **`edgesFrom`** — the file-level analysis | `:126` | no comment stripping, no call syntax required. At `:145` a literal pattern `/['"]([^'"]*\.js)['"]/g` treats **any** string ending in `.js` as a call edge; and at `:231` the pattern `/src\/[A-Za-z0-9_\-/.]+\.js/g` makes **any** `src/…` path merely *mentioned* in **any** markdown file a reachability root. | **THE COUNTER-EXAMPLE.** Here a citation *is* credited as an invocation. |

So the strict lexer is real and is applied to **exports**, while the **file** half twenty
lines away is loose. This plan follows `exportedNames`. The scanner's docblock must say
which half it follows and why, so the next maintainer does not "make it consistent" with
the wrong one.

The under-report bias this plan adopts is stated in the header comment governing the
export-level analysis, at `reachability.js:333-335`: the fence **under-reports, never
over-reports**, because that is the right bias for a gate that fails a build.

Five discriminators, each with a live case from this corpus:

| # | Rule | Live case it is calibrated against |
|---|---|---|
| 1 | **A call token requires a parenthesis.** `` `shouldRunLoop` `` is a citation; `` `shouldRunLoop(` `` is an invocation. | `iron-loop-integrator.md:35` cites `refinement-loop.js#shouldRunLoop` — no paren, never flagged. The `file#name` anchor form is documentation notation and is excluded outright. |
| 2 | **Fenced code is never an order.** Content inside ``` fences is example, template or transcript. | `vision-decomposer.md:487-518` is full of `AskUserQuestion({…})` examples. |
| 3 | **Only the first frontmatter block gives the grant.** | `agents/planning/implementation-planner.md` has a **second `tools:` line at line 160**, inside an embedded agent-definition example. Reading the last match reads an example as the grant. Verified live. |
| 4 | **A third-person subject makes it description.** Testing the ≤60 characters before the verb for a noun-phrase subject or a modal, plus the inflections `calls`/`runs`/`invokes`. | `vision-advisor.md:455` — *"The decomposer will call `validateVisionReadiness(…)`"*. `iron-loop-integrator.md:44` — *"CTO Chief executes the loop"*. |
| 5 | **Satisfied-by-tool.** If the callee's bare name is itself a granted tool, the order is executable. | `vision-advisor.md:26` orders `` Call `Read('.ctoc/learnings/vision.md')` `` and that agent holds `Read`. Without this rule the detector floods against exactly the agents that are correct. |

Three signatures fire, each requiring the ability to execute JavaScript — in practice
`Bash` — unless discriminator 5 excuses them:

| Signature | Shape | The live instance that forces it |
|---|---|---|
| **s1 — imperative call** | an imperative or second-person `call` / `invoke` verb immediately followed by a call token | `gdpr-agent.md:31` *"call `shouldRunGdpr(projectRoot)`"* |
| **s2 — second-person sentence** | a sentence whose subject is `You`/`you`, containing a call token, with any verb | `eu-solution-recommender.md:89` *"You construct your fetcher exactly once, via `createFetcher(WebSearch, WebFetch)`"* — **s1 misses this entirely**; there is no `call` verb, and it is the most incoherent order in the corpus |
| **s3 — capability manifest** | a list item under a heading matching `Tools Used` / `Tools` / `Capabilities` whose leading backticked token is a call token | `vision-decomposer.md:590-607` lists nine functions as things it uses — **s1 and s2 both miss this**, because a manifest entry has no verb and no subject. It is still a claim of a capability the agent does not have. |

Signatures deliberately **not** built, because a fence that cries wolf is worse than none:
a bare "write X" as a `Write`-grant check (English "write" almost always means the agent's
output prose); "search for X" as a `WebSearch` check (satisfied by `Grep` or `Glob`);
"read X" as a `Read` check (every agent holds `Read`; the check can never fire); any
backticked shell-looking token anywhere on a line.

**Volume stop-rule.** At Step 8 the seeded scan is counted. **If it exceeds 60 findings,
stop and report to the human** rather than whitelisting the residue — whitelisting a noisy
signature is precisely the failure this fence exists to prevent. A hand-run of the s1
signature over the corpus during the older plan's authoring returned 23 matches; s2 and s3
are narrower.

### Debt versus exemption

Two structures, two meanings. Conflating them is what kills a fence, so they are separate
keys in the baseline file.

| | Meaning | Justification | Direction | Ships at |
|---|---|---|---|---|
| **`debt`** | a real defect that exists today and is being paid down | none required per entry | may only **shrink** | seeded from a real scan at Step 8 |
| **`exemptions`** | not a defect — the detector is wrong about this one | **required, per entry, ≥ 20 characters** | grows only by deliberate review | **EMPTY** |

Anything in neither list **fails the build**. `maxDebt` is a ratchet: a drop below it fails
with *"you fixed N — now lower maxDebt and remove the fixed keys"*, so progress must be
claimed and cannot be silently banked.

Because this plan fixes five agents in the same slice that seeds the baseline, **the
seeded debt is what remains after the corrections**, not before them.

---

## Implementation Details

### Dependency graph

```
src/lib/unexecutable-instruction-scan.js
   ├── requires  src/lib/safe-fs.js        (audited fs choke point — never raw fs)
   └── reads     agents/**/*.md            (as data)

src/lib/iron-loop-enforcer.js
   └── requires  src/lib/unexecutable-instruction-scan.js   ← THE LIVE CALL SITE

tests/unexecutable-instruction-fence.test.js
   ├── requires  src/lib/unexecutable-instruction-scan.js
   └── reads     .ctoc/unexecutable-instruction-baseline.json
```

No cycle: the scanner requires only `safe-fs`. Dependency direction holds — the scanner is
a `lib` module and imports nothing from `hooks` or `commands`.

### Wiring — the live call sites (in THIS slice, never a follow-up)

| New code | Live call site | Root it is reachable from |
|---|---|---|
| `src/lib/unexecutable-instruction-scan.js` → `scan(root)` | `src/lib/iron-loop-enforcer.js`: a `CHECKS` entry `{ id: 'unexecutable-instruction-fence', scope: 'architecture', mode: 'thorough', fn: checkUnexecutableInstructionFence }`, with `checkUnexecutableInstructionFence(root)` defined beside `checkDeadExportFence` | `iron-loop-enforcer.checkAllInvariants` is reached from the shipped `src/commands/menu.js` self-check route |
| the five corrected agent bodies | dispatched by CTO Chief / the session model per `.ctoc/operations-registry.yaml` | `/ctoc:menu` |

Without the `CHECKS` entry the scanner is dead on arrival and
`tests/reachability.test.js` will say so.

### File: `src/lib/unexecutable-instruction-scan.js`

**Action:** CREATE
**Purpose:** Find every order that instructs an agent to execute JavaScript it has no
granted way to execute.
**Exports:** exactly one name — `scan`. Any second export would be flagged by the
dead-export fence, since only `scan` gains a live call site here.

```js
/**
 * @typedef {Object} Finding
 * @property {'instruction-tool'} detection
 * @property {string} key      stable baseline key — NEVER contains a line number
 * @property {string} file     repo-relative, path.posix-normalized
 * @property {number} line     1-based, for the human-readable message ONLY
 * @property {'s1'|'s2'|'s3'} signature  which signature fired
 * @property {string} callee   the function name that cannot be invoked
 * @property {string[]} grant  the agent's declared tools
 * @property {string} message  one sentence naming what cannot execute and why
 * @property {string} fix      the prescribed fix, naming the file and a safe shape
 */

/**
 * Scan an agent corpus for orders that can never execute.
 *
 * @param {string} root - absolute project root
 * @returns {{findings: Finding[], scanned: {agents: number, withGrant: number}}}
 *   `scanned` exists for the non-vacuity assertions: a scan that read zero agents
 *   must FAIL the fence, never pass it silently. A fence that reports a verdict on
 *   input it never received is the false-green class this repository fences.
 * @throws {TypeError} root is not a non-empty string
 */
function scan(root) { /* … */ }

module.exports = { scan };
```

Module-private helpers, none exported:

| Helper | Signature | Behaviour |
|---|---|---|
| `stripFences` | `(md) => string` | replace ``` fenced blocks with blank lines of **equal count**, so line numbers survive |
| `frontmatterTools` | `(md) => string[]` | tools from the **first** `---` block only; `[]` when absent (discriminator 3) |
| `callTokens` | `(line) => Array<{callee, col}>` | backticked tokens matching `` `name(` `` or `` `mod.name(` ``; the `file#name` anchor form is excluded (discriminator 1) |
| `isDescription` | `(line, col) => boolean` | discriminator 4 — a bounded ≤60-character look-back |
| `sectionHeading` | `(lines, i) => string` | nearest preceding `#`-heading, for signature s3 |

**Baseline key shape** — stable, and containing **no line number**, because a line number
in a key makes the baseline churn on every unrelated edit and turns the fence into noise:

```
agents/planning/vision-decomposer.md::instruction-tool::mergeStubs
```

**Failure-message contract** — every finding prescribes, naming the file and the safe
shape. Vague messages are how a fence gets ignored:

> `<agent>.md` orders this agent to call `<callee>(…)`, but its `tools:` grant is
> `<list>` — it has no way to execute JavaScript, so the order silently does nothing.
> Choose one: (a) grant a tool that can execute it and state what that widens; (b) rewrite
> the order as something the granted tools can do; (c) name the actor that really performs
> it — the session model, a hook, or a `Bash`-capable agent — in the third person.

**Cross-platform:** every path via `path.join`; every key and `file` field normalized with
`path.posix` so a Windows scan and a macOS scan produce byte-identical keys. All filesystem
access through `src/lib/safe-fs.js`. No `exec`, no `execSync`, no shell.

### File: `src/lib/iron-loop-enforcer.js`

**Action:** MODIFY

- **Add** `checkUnexecutableInstructionFence(root)` beside `checkDeadExportFence`,
  lazy-`require`ing the scanner inside the function body to match the established shape of
  `checkReachabilityFence` and `checkDeadExportFence`.
- **Add** one `CHECKS` entry, `mode: 'thorough'` — the scan walks 124 agent files and must
  not run on the fast path.
- Return `null` when `scanned.agents === 0` (not a CTOC source tree) and `null` when every
  finding is baselined; otherwise `{severity: 'block', message}` naming the first ten fresh
  findings, mirroring `checkDeadExportFence` exactly.
- **A malformed baseline excuses nothing** — every finding blocks. Same posture as
  `checkDeadExportFence`.
- **Leave room for the other plan.** The narrowed older plan appends its two detections to
  this same module and this same `CHECKS` entry. Do not structure `scan` so that a second
  detection kind cannot be added without rewriting it: `Finding.detection` is already a
  union type for exactly that reason.

### File: `.ctoc/unexecutable-instruction-baseline.json`

**Action:** CREATE, seeded from a **real scan at Step 8**, never hand-guessed.

```json
{
  "comment": "THE UNEXECUTABLE-ORDER FENCE baseline. A finding here is an agent body that ORDERS the agent to execute JavaScript its own tools: grant gives it no way to execute. A CITATION IS NOT AN INVOCATION: a bare backticked name, a file#name anchor, a third-person description, fenced example code, and a callee whose name is itself a granted tool are NOT findings. This follows exportedNames in src/lib/reachability.js (which strips comments first), NOT edgesFrom in the same module (which credits any mentioned .js path as an edge). RATCHET: maxDebt may only ever be LOWERED and debt entries only ever REMOVED (by correcting the order or granting the capability). EXEMPTIONS ARE NOT DEBT: an exemption asserts the detector is WRONG, requires a written justification of at least 20 characters, and the list SHIPS EMPTY.",
  "maxDebt": 0,
  "debt": [],
  "exemptions": []
}
```

### The five agent-file edits

Each is a body rewrite following the per-agent decision table above. In every case:

- Every order the agent cannot obey becomes either an order it **can** obey with its
  declared tools, or a third-person sentence naming the actor that really performs it.
- Every function that remains named stays named **as an authority**, without a call
  parenthesis where it is a citation — the shape the fence and the existing definition
  tests both require.
- The DRY rule each compliance agent states about itself is preserved: no rule table, no
  enumeration, no date and no price literal is copied into an agent file.
- `agents/planning/vision-decomposer.md` and `agents/planning/product-owner.md` gain
  `Glob` in their `tools:` line, and only `Glob`.

### File: `CLAUDE.md`

**Action:** MODIFY — the documented test-file count rises by one (this slice adds
`tests/unexecutable-instruction-fence.test.js`), which `tests/doc-counts.test.js` verifies
against disk. Declared here rather than edited as an undeclared file.

## Test Plan

### Tests: `tests/unexecutable-instruction-fence.test.js`

**Action:** CREATE
**Framework:** `node:test` (`describe` / `it` / `node:assert/strict`)

| # | Case | Assertion |
|---|---|---|
| 1 | **Non-vacuity** | `scanned.agents >= 100` and `scanned.withGrant >= 100`. A scan that read nothing must fail loudly, never pass silently. |
| 2 | **s1 fires on a real historical order** | a fixture reproducing `gdpr-agent.md:31` verbatim (*"call `shouldRunGdpr(projectRoot)`"*) against a `Read, Grep` grant yields exactly one finding, keyed `…::instruction-tool::shouldRunGdpr` |
| 3 | **s2 fires where s1 cannot** | a fixture reproducing `eu-solution-recommender.md:89` verbatim (*"You construct your fetcher exactly once, via `createFetcher(WebSearch, WebFetch)`"*) yields one finding with `signature === 's2'`, **and** the same text yields none under s1 alone |
| 4 | **s3 fires on a capability manifest** | a fixture reproducing `vision-decomposer.md`'s "## Tools Used" list yields findings for the listed callees with `signature === 's3'` |
| 5 | **CITATION IS NOT INVOCATION — no parenthesis** | a body containing `` `shouldRunLoop` `` and `src/lib/refinement-loop.js#shouldRunLoop` yields **zero** findings |
| 6 | **LIVE NEGATIVE CONTROL** | scanning the real `agents/iron-loop/iron-loop-integrator.md` yields **zero** findings. This is the whole design claim, driven against the real file. |
| 7 | **Third-person description is not flagged** | the real `agents/planning/vision-advisor.md:455` (*"The decomposer will call `validateVisionReadiness(…)`"*) yields zero findings |
| 8 | **Satisfied-by-tool is not flagged** | the real `vision-advisor.md:26` `` Call `Read(…)` `` and `:110` `` Call `Write(…)` `` yield zero findings, since that agent holds `Read` and `Write` |
| 9 | **Fenced code is not an order** | a body whose only call token sits inside a ``` fence yields zero findings, and reported line numbers for text after the fence are still correct |
| 10 | **First frontmatter block only** | the real `agents/planning/implementation-planner.md` resolves to `Read, Glob, Grep, Write`, never the example `tools:` at line 160 |
| 11 | **THE FIVE ARE FIXED** | scanning the five corrected agent files yields **zero** findings. This is the plan's acceptance criterion, asserted against the real files. |
| 12 | **`initProductOwnerAgent` is gone from the agent corpus** | no file under `agents/` contains the token, closing the gap that `tests/actions-dead-exports-guard.test.js` leaves by sweeping only `src/` and `tests/` |
| 13 | **NO NEW ENTRY** | every live finding is in `debt` or `exemptions`; anything else fails with the per-finding prescriptive `fix` text |
| 14 | **RATCHET ONLY TIGHTENS** | `findings.length <= maxDebt` |
| 15 | **CLAIM YOUR PROGRESS** | `findings.length === maxDebt` exactly; a drop fails with *"you fixed N — now lower maxDebt to X and remove the fixed keys"* |
| 16 | **BASELINE IS HONEST** | no `debt` key names a file that no longer exists; no key contains a line number (asserted by pattern) |
| 17 | **EXEMPTIONS ARE JUSTIFIED AND EMPTY** | every exemption carries a `reason` of ≥ 20 characters, and the shipped list is empty |
| 18 | **WIRED** | `src/lib/iron-loop-enforcer.js` contains the `unexecutable-instruction-fence` `CHECKS` entry, and `checkAllInvariants({mode:'thorough'})` runs it without throwing |
| 19 | **Error path** | `scan(null)` throws `TypeError`; a missing `agents/` directory yields `scanned.agents === 0` rather than a throw |

Cross-platform: `path.join`, `os.tmpdir()`, `fs.promises`; teardown with
`fs.promises.rm(dir, { recursive: true, force: true })`. No test may be skipped — a skip
fails the gate under the zero-skipped rule.

## Security Review

- **Path traversal** — every read path is built with `path.join(root, …)` from a
  caller-supplied root. No path segment is ever taken from scanned file *content*.
- **Regular-expression denial of service** — the signatures use bounded character classes
  and a bounded ≤60-character look-back, never a nested quantifier over unbounded input.
  Each scanned line is length-capped at 2000 characters before matching.
- **No secrets** — the scanner reads agent prose and function *names*, never a value. No
  finding message may contain file content beyond the matched token.
- **Prototype pollution** — findings are built from named fields, never spread from parsed
  content; the baseline is read into a `Set` of strings, never merged into an object.
- **Command injection** — no `exec`, no `execSync`, no shell anywhere in the scan.
- **Error messages** — repo-relative paths only, never an absolute path that would leak a
  developer's home directory into a build log.
- **Tool-grant surface** — this is the security-relevant change in the plan and it is
  deliberately minimal: **no agent is granted `Bash`**. Two agents gain `Glob`, which can
  list paths and cannot mutate, execute, or exfiltrate anything. The two advisory
  compliance agents keep `Read, Grep`, preserving the tested invariant that an advisory
  agent cannot write and therefore cannot weaken a human gate.
- **Fail direction** — the scanner **under-reports** by design, matching the bias the
  header comment for the export-level analysis states at `src/lib/reachability.js:333-335`.
  A malformed baseline excuses nothing.

## Execution Plan

### Step 8: TEST
Write `tests/unexecutable-instruction-fence.test.js` with all 19 cases. Run **only** that
file and record the red output verbatim — cases 2, 3, 4, 6, 11 and 12 must be red today
(the module does not exist, and the five agent bodies still carry the impossible orders).
Then run the scanner prototype once to **seed**
`.ctoc/unexecutable-instruction-baseline.json` from a real scan of the **uncorrected**
corpus, and record the per-signature counts in this plan. **If the total exceeds 60, STOP
and report to the human** — that is evidence the signature drifted noisy, and whitelisting
the residue would be the exact failure this fence exists to prevent.

### Step 9: PREPARE
Re-read from disk before writing anything, and let the disk win over this plan's line
numbers: the six agent bodies; `src/lib/gdpr-agent-runner.js` and
`src/lib/eu-ai-act-agent-runner.js` to confirm which helpers they already call;
`src/lib/background.js:27-40,117-140` for the exact status-object shape;
`src/lib/reachability.js:126-156` and `:499-501` to see both halves of the citation rule
with your own eyes before writing the discriminators; and `src/lib/iron-loop-enforcer.js`
for the current `CHECKS` array and the shape of `checkDeadExportFence`. Then enumerate
**every existing test that pins these six agent files** — at minimum
`tests/gdpr-agent-definition.test.js`, `tests/eu-ai-act-agent.test.js`,
`tests/eu-ai-act-agent-registry.test.js`, `tests/doc-counts.test.js` — and list what each
one requires. Two are already known and are **constraints, not obstacles**:
`gdpr-agent-definition.test.js:66` requires the body to name `shouldRunGdpr`, and `:51`
pins the grant to `Read, Grep`. The rewrite satisfies both. If any test would have to be
weakened to let a rewrite through, **STOP and report** — the code changes, not the test.

### Step 10: IMPLEMENT
One step, files as sub-items.
- `agents/compliance/eu-ai-act-agent.md` — gate → dispatcher plus a `Read`-based
  self-check; filter/normalize/route → named as the runner's work in the third person;
  `classifyFromPlanText` and `readEnforcementDates` → read the authority directly.
- `agents/compliance/gdpr-agent.md` — the same three moves, plus replacing the stale
  "EC2-s4 will implement the write" sentence with what the runner does today.
- `agents/compliance/eu-solution-recommender.md` — every order rewritten as *return this
  shape*; the missing validator named as unwired; the rule-authority path corrected to
  `plans/done/EC4-eu-solution-recommender.md`.
- `agents/planning/vision-decomposer.md` — `Glob` added to `tools:`; write/delete/move
  split per the decision table; "Tools Used" rewritten as tools held plus authorities read;
  `initProductOwnerAgent` removed.
- `agents/planning/product-owner.md` — `Glob` added to `tools:`; the status-file protocol
  rewritten as read-then-write against `src/lib/background.js` as the shape authority;
  `initProductOwnerAgent` removed from lines 42 and 533.
- `src/lib/unexecutable-instruction-scan.js` — `scan(root)` plus the five private helpers.
- `src/lib/iron-loop-enforcer.js` — `checkUnexecutableInstructionFence` and the `CHECKS` entry.
- `.ctoc/unexecutable-instruction-baseline.json` — re-seeded **after** the corrections, so
  the debt reflects what remains.
- `CLAUDE.md` — the test-file count.

### Step 11: REVIEW
Confirm, one by one: no agent gained `Bash`; exactly two gained `Glob` and nothing else;
every remaining function name in an agent body is either a citation without a call
parenthesis or an order the agent's granted tools can obey; no rewritten agent restates a
rule its DRY section forbids it to restate; the scanner is a `lib` module importing nothing
from `hooks` or `commands`; exactly one name is exported; no baseline key carries a line
number; every failure message prescribes a fix naming a file and a safe shape; and the
scanner's docblock says it follows `exportedNames`, not `edgesFrom`. Re-run the scan
against `agents/iron-loop/iron-loop-integrator.md` by hand and confirm zero.

### Step 12: OPTIMIZE
One pass per file: `stripFences` and the line split computed once per file, not once per
signature. The whole scan must stay under one second across the 124-agent corpus, since it
runs in `thorough` mode inside the self-check.

### Step 13: SECURE
Walk the Security Review list item by item. Confirm the 2000-character line cap and the
bounded ≤60-character look-back are present in the shipped regular expressions, that no
dynamic `RegExp` is built from scanned content, and that the diff of the five agent
frontmatter blocks contains no tool name other than the two added `Glob`s.

### Step 14: VERIFY
Run the targeted set first: the new fence test plus every suite that pins these agents
(`tests/gdpr-agent-definition.test.js`, `tests/eu-ai-act-agent.test.js`,
`tests/eu-ai-act-agent-registry.test.js`, `tests/actions-dead-exports-guard.test.js`,
`tests/reachability.test.js`, `tests/doc-counts.test.js`, `tests/architecture-invariants.test.js`).
Then the **full gate**, `npm test` — lint clean, all tests passing, coverage at or above
the enforced floor in `.ctoc/coverage-baseline.json` (**99** today), 0 skipped, 0 flaky.
`node --test tests/*.test.js` is **not** sufficient; it bypasses both the coverage floor
and the zero-skipped gate. Record every counter verbatim. No git operations.

### Step 15: DOCUMENT
JavaScript doc on `scan` and on each private helper, including the rationale for every
rejected signature so a future maintainer does not helpfully add them back, and an explicit
note that the citation rule follows `exportedNames` in `src/lib/reachability.js` and
deliberately **not** `edgesFrom` in the same module. A header comment on the test file
stating the debt-versus-exemption distinction. In `CLAUDE.md`, one short paragraph in the
fence family — beside the false-green fence — naming this defect class in plain words: *an
order to an agent to run code its tools give it no way to run*.

### Step 16: FINAL-REVIEW
Report: the files changed; verbatim red evidence from Step 8 with the per-signature seeded
counts; verbatim green evidence from Step 14; the final `maxDebt` and why it is what it is;
confirmation that `exemptions` shipped empty; and every decision taken under ambiguity.
State again, in the report, the two things this plan does **not** do: it does not wire the
compliance runner chain, and it does not wire the refinement loop's decision layer.

## Decisions Taken Under Ambiguity

1. **No agent is granted `Bash`.** A blanket grant would have been one edit instead of
   five rewrites, and would have widened five tool surfaces to fix what is, in four of the
   five cases, a documentation defect. `Bash` lets an agent do anything the shell can. For
   the two compliance agents it would additionally break a tested, deliberate invariant
   (`tests/gdpr-agent-definition.test.js:51`: *"NO Write, NO Bash, NO Edit — advisory,
   cannot write"*).
2. **`Glob` is granted to two agents, and only `Glob`.** Sibling-stub enumeration
   (`listStubs`, `getVisionStubs`) genuinely cannot be done with `Read`, `Write`,
   `WebSearch` or `AskUserQuestion` — `Read` on a directory errors. `Glob` is read-only:
   it lists paths and mutates nothing. This is the smallest grant that makes a real
   capability real, and it is recorded as a real (if small) widening rather than waved
   through.
3. **The compliance gate moves to the dispatcher and gains a self-check, rather than
   being deleted.** Deleting it would leave an advisory agent that runs on projects with no
   EU regime active. Moving it alone would trust every future dispatcher to remember. The
   agent keeps naming `shouldRunGdpr` / `shouldRunEuAiAct` as the rule's authority, which
   is also what the existing definition tests require.
4. **`classifyFromPlanText` and `mapPiiFieldToArticles` become "read the helper", not
   "restate the mapping".** Copying the mapping into the agent body would break the DRY
   rule each agent states about itself and would drift the moment the helper changes. The
   agents hold `Read`; the helper file stays the one authority and is read at run time.
5. **`initProductOwnerAgent` is removed, not written.** Four independent reasons in the
   section above; the deciding one is that writing it back would fail
   `tests/actions-dead-exports-guard.test.js`, a shipped guard encoding a human-gated
   deletion. Operating Lesson 14: the code changes, not the test.
6. **`iron-loop-integrator.md` is not edited.** The brief reported a defect there; the file
   does not contain one. It becomes the fence's live negative control instead, which is
   worth more than a needless edit.
7. **Signature s3 (the capability manifest) was added beyond what the older plan
   specified.** Without it the largest single instance — `vision-decomposer.md`'s
   nine-function "Tools Used" list — goes undetected, because a manifest entry has neither
   an imperative verb nor a subject. A manifest that claims a capability the agent lacks is
   the same lie as an order it cannot obey.
8. **Signature s2 was added for the same reason.** `eu-solution-recommender.md:89` is the
   most incoherent order in the corpus and contains no `call` verb at all. A fence that
   misses the worst instance is not a fence.
9. **Four candidate signatures were rejected as too noisy** (the "not built" list above).
   This is a deliberate under-report, matching the bias the export-level analysis's header
   comment at `src/lib/reachability.js:333-335` argues is correct for a gate that fails a
   build.
10. **The baseline is re-seeded after the corrections, not before.** Seeding first would
    record five entries that this same slice then fixes, forcing an immediate ratchet edit
    and making the first `maxDebt` a number that was never true.
11. **This plan takes over the older plan's four reserved file names, and the older plan is
    narrowed to its other two detections.** The alternative — a second scanner for the same
    invariant — is forbidden by the boundary rule both plans now repeat. **This was a
    scheduling decision and it was the human's; he ruled on 2026-07-19 and the ruling is
    recorded as settled in the SCOPE BOUNDARY section above.**

## Discrepancies between the commissioning brief and the code

Recorded because the brief asked for them and because each one changes what gets built.

1. **`iron-loop-integrator.md` has no defect.** The brief said it is told to drive the
   refinement loop "via the Task tool". That string does not appear in the file. Lines 19
   and 44 explicitly assign dispatch to CTO Chief, and line 35's reference to
   `refinement-loop.js#shouldRunLoop` is a citation with no call parenthesis. It is removed
   from the fix list and promoted to the fence's negative control.
2. **`src/lib/reachability.js` is BOTH the exemplar and the counter-example — the earlier
   audit and my first reading were each right about a different half.** Verified against
   disk: `exportedNames` (declared `:499`) calls `stripComments` as its first statement
   (`:500`) and is the model for "a citation is not an invocation". `edgesFrom` (declared
   `:126`) does the opposite twenty lines earlier — at `:145` any string literal ending in
   `.js` becomes a call edge, and at `:231` any `src/…` path merely mentioned in any
   markdown becomes a reachability root, with no comment stripping and no call syntax
   required. A reader who opens the file and lands on the wrong function concludes the
   opposite of the truth, which is why this plan cites `exportedNames` and its
   `stripComments` call by name everywhere it relies on the principle.
3. **The compliance subsystem is not entirely callerless — the brief's version of this was
   too broad and this plan does not repeat it.** `shouldRunGdpr` and `shouldRunEuAiAct` are
   **live**, called at `src/commands/menu.js:15,74` for the first-run regime question. What
   is dead is the **agent-runner chain** beneath `src/lib/compliance-integration.js`, which
   no file in `src/` requires. The distinction is load-bearing: because the resolver is
   reachable, the gate rule has a live home and only its *caller* needed reassigning.
4. **The refinement loop's `shouldRunLoop` is live**, called at `src/lib/actions.js:683`.
   The brief's count of ten dead exports is otherwise exactly right and is confirmed
   verbatim at `.ctoc/export-reachability-baseline.json:66-75` — `shouldRunLoop` is not
   among them.
5. **A plan for this fence already existed** — the ratcheting-fence plan at
   `plans/implementation/00073-ui1-unexecutable-instruction-fence.md`, un-built and
   pre-Gate-2 — and it already recorded two of the five instances this plan fixes. The
   brief did not mention it. This was the largest discrepancy; **the human has since ruled
   on the boundary**, and it is recorded as settled above.
6. **`initProductOwnerAgent` confirmed absent from `src/`** exactly as the brief said, and
   the reason it survived in prose is now known: the guard that forbids it
   (`tests/actions-dead-exports-guard.test.js`) sweeps `src/` and `tests/` and never
   `agents/`.
7. **Two further defects found in files this plan touches or reads, reported not fixed:**
   `agents/iron-loop/iron-loop-integrator.md:57-71` numbers its mandatory step labels
   **7–15** where the canonical skeleton is **8–16**; and
   `agents/compliance/eu-solution-recommender.md:31,148` cite
   `plans/implementation/EC4-eu-solution-recommender.md`, a path that does not exist (the
   file is in `plans/done/`). The second is inside this plan's declared files and **is**
   corrected; the first is not, and is handed to the human.
