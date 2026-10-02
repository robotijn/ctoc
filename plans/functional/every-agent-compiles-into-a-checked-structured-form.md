---
title: "Every agent compiles, once per update, into a checked structured form that a model can be handed at call time; the prose stays whole and stays the source"
type: functional
status: functional
created: 2026-10-01
priority: medium
effort: large
depends_on: none
files:
  - src/lib/agent-compiler.js
  - src/lib/compiled-agent-loader.js
  - src/lib/compiled-agent-scan.js
  - src/scripts/compile-agents.js
  - src/lib/step-machine.js
  - src/lib/agent-eval.js
  - src/lib/agent-eval-ledger.js
  - src/scripts/run-agent-evals.js
  - evals/lib/agent-graders.js
  - evals/agents/**
  - src/lib/actions.js
  - src/lib/plan-validator.js
  - src/lib/menu-screens.js
  - src/tabs/tools.js
  - src/commands/start.md
  - src/commands/update.js
  - src/commands/update.md
  - src/hooks/PreToolUse.*.js
  - agents/iron-loop/iron-loop-executor.md
  - .ctoc/operations-registry.yaml
  - .ctoc/compiled-agent-baseline.json
  - .ctoc/agent-eval-baseline.json
  - .ctoc/recipe-coverage.json
  - .ctoc/reachability-roots.json
  - tests/prose-kept-whole.test.js
  - tests/compiled-agent-compiler.test.js
  - tests/compiled-agent-fence.test.js
  - tests/step-machine.test.js
  - tests/agent-eval-harness.test.js
  - tests/agent-group-table.test.js
  - tests/fixtures/golden-corpus/**
  - docs/AGENT_COMPILATION.md
  - README.md
  - CLAUDE.md
---

# Every agent compiles, once per update, into a checked structured form that a model can be handed at call time; the prose stays whole and stays the source

This plan says what must be true. It does not schedule. The order in section 2 is a dependency order (what must exist before what), not a schedule: you alone choose what is built and when. Four forks that are yours to decide are at the end, under "Questions for the human", and nothing below decides them.

## 1. ASSESS — Problem Understanding

### What the human asked

Your request of 2026-10-01 was "yes i want this", about this paragraph, which you pasted from another session. It is quoted verbatim as the source of this plan:

> "The adaptation to local models, researched at depth: compressing agent prose (with measured accuracy retention at each ratio); compiling each agent once per update into a compact structured form with a fixed output schema, cached and signed; replacing prose with structure (grammar-constrained output, typed tools, the sixteen steps as a state machine the engine drives so the model never has to remember where it is, checklists iterated by the engine); the compiled prefix cached on disk per rung so the prose is read once per update, not per call; a table of all 24 agent groups with the rung each needs and which are deterministic code needing no model at all; distilled specialists per heavy agent shipped through the store; the online grant as the escape hatch; and the plugin's own evals run per agent per rung in the once-a-day tier, so "which rung may run which agent" is measured, with a verdict per machine shape."

### A ruling from you, settled, not on the questions list

The same day (16:52) you ruled, verbatim: "but think we should not delete the prose".

This is written in as a settled decision, in these words:

- The agent and skill prose files under `agents/**` and `skills/**` are never deleted, replaced or shortened by this plan. They remain the source of truth that people read and that the improvement rounds edit.
- "Replacing prose with structure" means only what a model is handed at call time: a derived, compiled form that carries the fingerprint of the prose it came from. It never means what the repository keeps.
- Any compression applies to the derived form only.
- No scenario in this plan measures success by prose removed. Scenarios 1 and 2 make that a check, not a promise.

### What is true on disk today

Everything below was read from the files named, with line numbers. Nothing was run: the agent that wrote this plan holds no way to execute programs, so every statement about behaviour is "by reading", not "observed". Where I have a belief I did not check, it is labelled.

**1. The corpus.** There are 124 agent definition files in 24 groups, counted from path listings: 115 at depth one and 9 at depth two (5 under `agents/testing/runners`, 4 under `agents/testing/writers`). The improvement run's starting inventory records the same totals: 124 agents, 24 agent categories, 101 skills, 225 files, and `wrapper_count: 92` (`.ctoc/audit/agent-and-skill-improvement/inventory.json:4-10`). A wrapper agent names the skill it wraps: `agents/testing/coverage-mapper.md:10-11` carries `type: wrapper` and `target_skill: testing/coverage-mapper`. So for 92 of the 124 agents, what a model reads is two files, the agent body and the skill body, not one.

**2. The machine-readable header is not uniform.** I read the headers of six agents. `agents/ai-quality/citation-validator.md:1-18`, `agents/testing/coverage-mapper.md:1-12`, `agents/testing/smart-test-runner.md:1-12` and `agents/security/security-scanner.md:1-12` carry `tools`, `model`, `effort`, `tier`, `reports_to` and `dispatch_protocol: v1`. `agents/iron-loop/iron-loop-executor.md:1-11` has no `dispatch_protocol` and adds `reads_ancestry` and `async_choice_protocol`. `agents/coordinator/cto-chief.md:1-37` has no `dispatch_protocol`, has `reports_to: user` and `tier: 0`, and a `dispatches:` list of 22 groups (lines 12-34); the two groups it does not list are coordinator (itself) and product, which is consistent with the Product Loop running outside the chief's chain. The security scanner uses `extends_skill` where the wrappers use `target_skill`. So a compiler cannot assume one set of fields; a field that is absent must stay recorded as absent, never defaulted.

**3. The "fixed headings" are weaker than the brief said.** The shape test requires five headings, not six (`tests/watcher-shape.test.js:78-85`: `# What I watch`, `## Trigger`, `## What I Report`, `## What I Borrow`, `## Anti-Scope`). Only 2 of the 124 agents are on its `conforming` list (`.ctoc/watcher-baseline.json:8-11`, `advocate-critic` and `citation-validator`); the other 122 are `legacy` (`maxLegacy: 122`, line 7). The wrapper agents use other headings (`coverage-mapper.md` has `## Role`, `## Trigger`, `## Process`). Heading-based extraction would therefore work on two agents out of 124.

**4. On the session runtime the prose is the prompt.** The shape test's own header records that "an agent's body IS its entire system prompt — a subagent receives only that plus basic environment details" (`tests/watcher-shape.test.js:8-11`), and records at lines 61-70 that the `skills:` preload was verified NOT to inject anything on 2026-07-18, so an agent's body is the only text it is guaranteed to receive. That is the repository's own statement; I did not observe a dispatch. Consequence, stated plainly: while the session model runs an agent, the harness loads that agent's markdown as the system prompt. A compiled form cannot replace it, because replacing it would mean shortening the prose file, which you have ruled out. On the session runtime a compiled form can be handed to the model only in the dispatch brief, in addition to the prose, so it saves no prompt there. A saving exists only where something other than the harness builds the prompt. That is a second runtime (see item 10).

**5. The output contract exists; checking it does not.** `.ctoc/architecture/dispatch-schema.yaml` defines schema `ctoc-dispatch-v1` (line 7): `dispatch_response` (lines 86-137, required fields at line 88), `finding` (lines 139-188, required at line 141, severity and confidence enumerations at lines 146-147 and 164-165) and an `outcome.grade` block of `accepted`, `false_positive`, `kickback` and `precision` (lines 207-215). Dispatch logging is an instruction-level protocol, not a hook (the project's `CLAUDE.md`, "Dispatch logging"). The only file under `.ctoc/audit/dispatches/` is `example/2026-05-14-example-dispatch.yaml` (directory listing), so no real graded dispatch exists to build golden tasks from. The one hook that fires when a subagent finishes, `src/hooks/SubagentStop.js`, says of itself "A SubagentStop hook has no allow/deny authority and this one claims none" (lines 26-27) and does not use the payload (lines 53-55). So no live code validates an agent's answer against the schema today. I did not read whether the harness passes the subagent's final message to that hook.

**6. The improvement run is rewriting the prose right now.** `plans/implementation/every-agent-and-specialist-skill-improved-three-times.md` (121 slices, line 23) rewrites every agent and skill over three web-researched rounds. Each file gets a record under `.ctoc/audit/agent-and-skill-improvement/<path>.json` with `rounds[]`, each round carrying `fingerprint_before` and `fingerprint_after` as `sha256:` values (read in the record for `agents/ai-quality/hallucination-detector.md`, lines 5-11). Eight record files exist today (directory listing): the agent critic, and the agent and skill of the code quality reviewer, the hallucination detector and the language-model security tester, plus the dependency analyzer's agent. That is eight of 225 files. I read round one of one record, so I cannot say how many of the eight have all three rounds. For roughly 217 of 225 files the prose is still moving. A compiled form made today from those files would be built from text already known to be partly wrong. I did not read how the record check computes a fingerprint (whole file bytes or a normalised form); the compiler must call the same function, never a second one.

**7. The engine owns part of the step state, and no more.**

- `startAgent` (`src/lib/actions.js:1817-1906`) claims a plan for the scheduler and sets the dashboard pointer once, hard-coded to step 8, phase `TEST` (lines 1881-1887). I found no other write of the pointer; I had no whole-repository search, so there may be one.
- The executor reads Steps 8 to 16 as prose (`agents/iron-loop/iron-loop-executor.md:215-287`): its definition says to read each step's checkbox items and mark them as it goes (lines 217-222). Nothing tells it which step it is on.
- At completion, `completeExecution` (`src/lib/actions.js:1017-1163`) calls `validateForReview` (line 1021). A refusal is recorded as a kickback against a specific step (`recordStepKickback`, line 1029; the counter lives in a sidecar under `.ctoc/state/kickbacks/`, lines 1480-1481). The step data it reads already has a per-step shape: `failingStepFrom` (lines 1455-1471) reads `validation.checklist.steps.step_N` with `required`, `present`, `completed` and `skipped`.
- The task registry is a real state machine for tasks (`src/lib/task-registry.js:1-130`: statuses, at most five running at once at line 122, compare-and-swap writes at lines 62-77). The approval ledger binds an approval to a hash of the specification, not the whole file, because the plan file doubles as the execution log (`src/lib/actions.js:347-355`).
- The wave barrier `enqueueWaveSync` (lines 2041-2059) only records a task.

So the engine owns the stage a plan is in, who is running, and the end-of-build check. It does not own "which of the nine build steps, which checklist item, next".

**8. The steps are numbered three different ways.** The executor's definition performs all of Steps 8 to 16 itself (its description and line 161; Step 12 is OPTIMIZE and Step 13 is SECURE in lines 256-262). The operations registry says the executor "Executes Iron Loop steps 7-15" and lists `steps: [8, 9, 10, 12, 14, 15]` (`.ctoc/operations-registry.yaml:82-83`), and lists `security-scanner` at `steps: [12]` (line 112). The summary table in the project's `CLAUDE.md` gives the executor 8, 9, 10, 12, 14, 15, the critic 11 and 16, and the security scanner 13. The security scanner's own description notes the registry's `steps: [12]` is "the pre-IDEATE numbering for the same gate" (`agents/security/security-scanner.md:3`): the disagreement is known and unfixed. A state machine needs exactly one encoding.

**9. The evaluation harness does not measure agents.**

- There are two harnesses. `evals/run.js` (`npm run eval`) evaluates one skill, the decision-question format, from three fixtures (`evals/fixtures/ask-me-questions/`). It runs the real model through the `claude` binary in print mode under your session's authentication, with no key, and prints a loud "EVALUATION SKIPPED — NOTHING WAS EVALUATED" banner when the binary is missing (`evals/run.js:3-21` and `84-106`; `evals/lib/runner.js:3-18`). Its default is three runs per scenario (`evals/run.js:38`).
- `src/scripts/run-evals.js` with `src/lib/eval-harness.js` and `src/lib/comparator-agent.js` is the case-file harness. Its comparator is a stub: "The actual model invocations are intentionally stubbed in this revision" (`src/lib/comparator-agent.js:23-30`). Case files exist for 2 skills, 3 cases in all (`evals/skills/security/threat-modeler/cases/` twice, `evals/skills/saas/stripe-subscriptions/cases/` once). None are for agents. Its contributor guide still describes a key (`evals/_README.md:206-211`), which contradicts the no-key stance in `evals/lib/runner.js:3-10`.
- The graders (`evals/lib/graders.js`) grade the format of a rendered decision (box-drawing characters, four columns, banned abbreviations, one question per turn), not the quality of an agent's findings. One of them has drifted from the current format: it demands exactly one cell marked Recommended (lines 185-198), while `.ctoc/ask-me-questions.md` now says an owner decision marks none.
- The guide's rule that "unsourced expected outputs are rejected at review" (`evals/_README.md:144-148`) is a rule of human review, not code.

So nothing today measures whether an agent finds the defect it exists to find. The harness is the first dependency.

**10. The runtime constraint (hard, from the brief and the project rules).** CTOC is a plugin inside the Claude command-line tool. It calls no model directly, holds no key, and the project's `CLAUDE.md` says it "must never spawn a second Claude (no `claude -p`, no online API calls)". A local-model "rung" is a second runtime outside CTOC's current shape. Two precedents sit at its edge, and I did not verify whether any test enforces the rule against either: `evals/run.js` launches the `claude` binary when you run it yourself, and `src/scripts/verify-claims.js` is the only network path in the repository, run on a schedule you choose. Everything in the pasted paragraph that names a rung, a per-rung prefix cache, distilled specialists, typed tools or grammar-constrained output depends on this. In the session runtime a plugin can check an answer against the schema after it is written. I believe, and did not verify, that it cannot constrain decoding while the answer is written.

**11. A compiled form is content that models obey.** The project's `CLAUDE.md` ("Mandatory Pipeline Use") treats the lint, test and command tables as a special case: their contents are OBEYED, so an agent that can write them makes CTOC run an arbitrary program, and they are therefore held to plan coverage rather than the blanket write allowance. A compiled agent form is the same shape: whatever it says becomes what a model is told to do. An agent that can write it controls other agents. The same document records a related privilege escalation closed once already. I did not read the hook that holds these lines.

**12. Hooks that exist.** `.claude-plugin/hooks.json` (read in full) registers SessionStart, PostToolUse, PreToolUse (Edit, Write, MultiEdit, NotebookEdit, Bash, Task, file guard, gate check), SubagentStop, Stop and UserPromptSubmit. It registers no start-of-subagent hook. So CTOC today cannot inject "your current step is N" into a subagent as it starts; that must come from a command the agent runs.

**13. Several agents are mostly code written as prose.** `agents/testing/coverage-mapper.md:34-46` is nine numbered steps (run tests with coverage, parse the report, record which tests executed which file, store the map). `agents/testing/smart-test-runner.md:29-56` is an algorithm (hash compare, map lookup, run the set) and `:58-67` a fallback table. `agents/security/security-scanner.md:54-72` is aggregation (read the analyzers' result files, normalise tags, deduplicate by fingerprint, diff against a baseline, apply policy, emit one verdict) and says the verdict "is deterministic". Deterministic fences already exist as code (`src/lib/false-green-scan.js`, `reachability.js`, `agent-honesty-scan.js`, `instruction-gate-words-scan.js`, `unexecutable-instruction-scan.js`). By contrast `agents/ai-quality/citation-validator.md:20-32` is judgment: whether a fetched source supports a claim.

**14. Licence.** The project is under PolyForm Shield 1.0.0, copyright Tijn van der Zant (`LICENSE:1,5`). It matters only where the pasted paragraph says "the store" and "distilled specialists": whether a distributed compiled form, or model weights distilled from a hosted model's outputs, fall under this licence and under the upstream model's terms is not something I read, and I have not decided it.

**15. Terms in the pasted paragraph that no file I read defines.** "The online grant", "the store" (for model artifacts), "the once-a-day tier" and "machine shape". Nothing in CTOC is scheduled against a clock today (the project's Operating Lesson 18). Where this plan uses these words it says what it took them to mean, and each such reading is listed under the questions as an idea for you to check.

### The problem in one paragraph

Every agent is a long prose file that a model reads in full on every call, and CTOC cannot tell whether a rewrite made an agent better or worse, because nothing measures agents. The executor must remember which of nine build steps it is on from prose it read at the start, and the engine knows only the start and the end. The pasted paragraph asks for a measured, checked, derived form of each agent, an engine that holds the step pointer, and a table of which agents need a model at all. The prose is the human-readable source and is not to be touched. The one runtime CTOC has today loads that prose itself, so most of the prompt-size saving in the paragraph exists only if a second runtime does, which is your decision.

## 2. ALIGN — Approach

### Principles that govern every move

**The prose is the source; everything else is derived, one-way, and carries its fingerprint.** Nothing reads a form back into the prose and no tool edits a prose file from a form. A derived form that does not match the current prose is refused, and the call falls back to the prose. Falling back is the safe direction, and every uncertainty ends there.

**Measure; never assert.** No sentence of the form "this rung can run this agent" exists without a ledger row behind it. No compression ratio ships without a measured result. A verdict states what ran and what was not tried.

**Evidence the instrument could not read is not a pass.** Every new check reports "not evaluated" or "not verified" distinctly from "passed", as the repository's other instruments do.

### Dependency order (technical, not a schedule)

| Step | What | Depends on |
|---|---|---|
| 1 | The agent evaluation harness: golden tasks per agent, deterministic grading, the ledger | nothing. Producing answers needs a runtime (the session model, or whichever runtime you choose in the first question); loading, grading and the ledger need none |
| 2 | The compiler, the loader and the fingerprint fence | the improvement run's record (for "final"); step 1 (to show a form behaves like its prose); the anchoring function is also used by step 3 |
| 3 | The sixteen-step state machine and the engine-iterated checklists | the anchoring function from step 2 (so checklist text cannot be invented); the affected-tests plan's record fields, once that plan lands, for the wording of Step 14 items |
| 4 | The table of the 24 groups: which agents need a model, which rung each needs | step 1 for every verdict; reading the agent bodies for the mechanical column |
| 5 | Anything that needs a second runtime: the per-rung prefix cache, compression ratios, distilled specialists, the online grant, the per-machine-shape verdicts | steps 1, 2 and 4, and your answer to the first question |

### Move 1 — Measure first: golden tasks per agent

A golden task is a data file under `evals/agents/<group>/<agent>/cases/<name>.yaml`, following the existing convention under `evals/skills/`. It carries:

- the agent path and the fingerprint of the prose it last passed at;
- an input taken byte-for-byte from a real artifact (a file, a diff or a plan from this repository, or a cited public source), never redacted or shortened, because redaction is the exact defect the golden-corpus fence exists against;
- the kind: a seeded defect, a real defect, or a clean control whose correct answer is "no findings";
- the expected findings, keyed by file, line range and type in the shape of schema `ctoc-dispatch-v1`, and a list of things the answer must not contain;
- a source for the expectation. The guide already says unsourced expectations are rejected; here the loader refuses them.

Grading is code, not a model: the answer is checked against the schema, each expected finding must be present at its file and line range, and nothing forbidden may appear. A clean control fails if the agent reports a defect. Agents whose answer is not a findings list (the planning and writing agents) are graded by deterministic structural checks plus the must and must-not lists; where only a judge model could grade, the task is marked judged, is never mixed into a deterministic verdict, and the existing comparator, being a stub, is not relied on. Each task runs at least three times (the existing default) and the result is a pass count out of the runs, never one run. There are no retries: a retry turns a flaky agent into a slow one.

The ledger records, per agent: the prose fingerprint, the runtime, the facts about the machine the measurement could read, the fingerprint of the set of tasks, the runs, the passes, and the date. It is read offline. `npm test` never calls a model. Because the ledger content is believed by the rung table, it lives where an agent cannot write it, like the verification ledger. A human sees it on the Doctor screen (`src/tabs/tools.js`) in three distinct states: never evaluated, unreadable, and evaluated (with how many are current and how many are stale).

### Move 2 — Compile each agent once per update, extractively and with anchors

**Input:** the agent prose; for a wrapper, also its target skill prose; the improvement record; the schema identifier.

**Only final prose is compiled.** If the record shows fewer than three rounds for a file, the compiler writes nothing for it and says "not final: N of 3 rounds recorded". When it does compile, the source fingerprint it records is the third round's `fingerprint_after`, and it must equal the file's current fingerprint, or the record itself is stale and the compile fails.

**The form is extractive and anchored.** Every statement in it (a rule, a procedure step, a trigger, a forbidden action) carries the prose path, the line range and the verbatim text. The compiler rereads the prose and proves each span is there. A statement with no anchor, or whose span is not found, fails the compile. Paraphrase (an abstractive form) cannot be proved faithful by code, so it is permitted only as a separate kind, is never handed to a model, and is blocked until the evaluation shows it scores the same as the prose on the golden tasks. The form also records: the declared header fields exactly as declared (absent stays absent), the output contract by schema identifier and the fields the agent fills (or `none`), the steps marked mechanical where a step names a program-performable action and, if one exists, the command, the kind, and the compiler version.

**One-way and deterministic.** The same prose and record give a byte-identical form. The compile, evaluation and step commands never write a prose file.

**A loader, not a cache.** `load(agent)` returns the form, or a refusal naming the file that moved, plus the prose path to use instead. A stale form is never handed to anything silently.

**When it runs.** At the end of `/ctoc:update`, in the background, as the project rules require for updates, for the files whose fingerprint changed; a failure is reported on one line and never fails the update. (If you choose to commit the forms, the build happens at release instead; see the second question.)

**A fence.** It fails when a form's recorded source fingerprint differs from the current prose fingerprint, following the sibling fences' shape: a baseline with two separate structures, debt that may only shrink and a permanent exemption list that starts empty. It is not allowed to pass vacuously: if the record shows final files and nothing compiled, it fails. It reports "compiled N, not final M, stale K".

**A protected location.** Because a form is obeyed content (item 11), the folder it lives in must refuse agent writes, as the verification and approval folders do. That is a change to hook behaviour, which the project rules say needs your explicit approval; it is shown exactly at its own approval moment and is not pre-approved here.

**An answer check.** The dispatcher (CTO Chief holds Bash) can run a command that checks an agent's answer against the schema and names the first failing path. This is a command the dispatcher runs, not a hook, because the stop hook has no authority (item 5).

**Honest sizes.** Per form the report prints the prose size, the form size and the ratio, and the kind. It never prints a count of prose removed.

### Move 3 — The sixteen steps become a state machine the engine owns

The engine cannot call the model. "The engine drives" therefore means: the engine owns the pointer, and the executor must ask it. Specifically:

- **One encoding** of the sixteen steps: number, label, owner, and the standing items for each of Steps 8 to 16. The executor's definition, the operations registry and the summary table in the project's `CLAUDE.md` are each tested against it, and the disagreement in item 8 is fixed by tightening the registry and the table to match, never by editing the executor's prose down.
- **A record per build** kept in a sidecar under `.ctoc/state/` (not in the plan's frontmatter, which the approval hash covers), written with the same compare-and-swap discipline as the task registry, so five concurrent builds never share a record.
- **Commands the executor runs**, as literal lines in its definition: ask for the current step and the next unticked item; tick an item with the evidence it names; kick back to a step with a reason. Each answer returns the step, the next item's text (taken from the plan's own checkbox lines and the standing items, anchored so it cannot be invented), what evidence closes it, and how many remain. A fresh executor with no memory gets the same answer as one that has been running.
- **Order is enforced:** ticking an item in Step 11 while Step 10 has open items is refused, naming the open item. A kickback clears the ticks of later steps and counts against the circuit breaker as today.
- **Evidence where it already exists:** items whose proof is a command's output (the fences named in the executor's Step 14 list, lines 273-274) refuse a tick without that output recorded.
- **The plan stays readable:** the machine mirrors ticks into the plan's checkboxes, which are what `validateForReview` and the human read. If the machine and the plan disagree at completion, completion is refused naming the step. That is a change to gate logic (the validator and completion), so it is shown exactly at its own approval moment and is not pre-approved. It only adds a refusal, never removes one.
- **A human can reset a pointer** through the menu with a recorded reason, so a machine fault cannot strand a build.
- **Steps 1 to 7** are collaborative with you present, and keep their stage-folder pointer. The machine carries their identity and owner but does not iterate items there. It touches no human gate and no approval record.

I did not verify that a hook can push a step into the executor's context at each step; the design does not rely on it.

### Move 4 — The table of the 24 groups

The table is data, tested against the disk. Its member counts below come from path listings. The "mechanical part seen" column is filled only from bodies I read, with the lines. Every other cell says "body not read". The rung column starts as "not evaluated" for every group.

| Group | Members | Mechanical part seen in a body I read | Rung verdict |
|---|---|---|---|
| ai-quality | 4 | citation-validator: none, it is judgment (`citation-validator.md:20-32`) | not evaluated |
| architecture | 2 | body not read | not evaluated |
| compliance | 6 | body not read | not evaluated |
| coordinator | 3 | cto-chief: dispatch list only, header read (`cto-chief.md:12-34`) | not evaluated |
| cost | 1 | body not read | not evaluated |
| data-ml | 3 | body not read | not evaluated |
| devex | 2 | body not read | not evaluated |
| documentation | 2 | body not read | not evaluated |
| frontend | 3 | body not read | not evaluated |
| infrastructure | 6 | body not read | not evaluated |
| iron-loop | 8 | iron-loop-executor: the nine-step list is a checklist the engine can iterate (`iron-loop-executor.md:215-287`) | not evaluated |
| legal | 2 | body not read | not evaluated |
| mobile | 3 | body not read | not evaluated |
| pipeline | 5 | body not read | not evaluated |
| planning | 7 | body not read | not evaluated |
| product | 2 | body not read | not evaluated |
| quality | 11 | body not read | not evaluated |
| realtime | 2 | body not read | not evaluated |
| saas | 11 | body not read | not evaluated |
| safety | 3 | body not read | not evaluated |
| security | 10 | security-scanner: steps 1 to 6 of the aggregation (`security-scanner.md:54-72`) | not evaluated |
| specialized | 11 | body not read | not evaluated |
| testing | 14 | coverage-mapper (`:34-46`) and smart-test-runner (`:29-56`) | not evaluated |
| versioning | 3 | body not read | not evaluated |

The members sum to 124, equal to the file listing. Two rules govern the table. "Needs no model" may be written for an agent only if a command exists that does its work, and that command scores equal or better than the agent's measured answer on the same golden tasks (scenario 36). "Rung X may run agent Y" may be written only with a ledger row behind it (scenario 37).

### Move 5 — What exists only if a second runtime exists

These parts need something other than the session model: the compiled prefix cached on disk per rung (keyed by agent fingerprint, rung and runtime version, read once per update instead of the prose per call), compression ratios with measured retention at each ratio, typed tool implementations, grammar-constrained output where the runtime supports it, distilled specialists, the online grant as the escape hatch, and a verdict per machine shape. They are specified at the level of scenarios 38 to 43 so that nothing in the pasted paragraph is hidden. How they are built depends on the first question, and which model is used is not decided anywhere in this plan.

If the first question is answered "no second runtime", this plan still delivers the harness, the compiler, the fence, the answer check, the step state machine and the table. I believe, without measuring, that these are valuable on their own: they make a rewrite measurable, they remove the executor's dependence on remembering its place, and they say which agents need no model.

### Move 6 — Reachable, and visible to a human

Each new module is reachable from a live entry point in the same unit of work: the compiler from the update command, the step machine from the executor's literal commands and `startAgent`, the evaluation from the menu's Tools screen, the loader from the answer check, the evaluation and the step machine. The Doctor screen shows the evaluation and compile state. Every printed verdict names the runtime and what was not tried.

## 3. CAPTURE — Acceptance Criteria

Each scenario is a runnable test or a recorded measurement. Tests that need a project use a fixture project in a temporary directory, never the real repository root, except where the scenario names the real corpus.

### The prose stays whole (settled)

1. GIVEN the listing and line count of every file this plan's build declares under `agents/**` or `skills/**`, recorded at the start of that build, WHEN the build completes, THEN every such file still exists, none has fewer lines, and the only differences are additions the plan names (the executor definition's command lines). Proof: a test over a fixture directory where a deletion, a replacement and a shortening each fail by name; the same check recorded in each build's execution record; and the compile, evaluation and step commands run in a fixture where every prose file is read-only and still succeed, which shows none of them writes prose.
2. GIVEN every report, ledger row, screen line and document line this plan produces about size, THEN each figure is the size of a derived form, the ratio of a derived form to its prose, or the size of a prose file as it stands, and none states a count of prose lines or words removed. Proof: a shape test of the report, and the Definition of Done's measurement list read against it.

### The evaluation harness

3. GIVEN a golden task file, WHEN it is loaded, THEN it is accepted only with an existing agent path, a kind (seeded defect, real defect, clean control), an input taken byte-for-byte from a named real artifact, expected findings by file, line range and type, a forbidden list, a source for the expectation and the fingerprint of the prose it last passed at; a missing field refuses the file and names the field.
4. GIVEN a recorded answer and a task, THEN the verdict is computed by code with no model call, lists every expected finding missed and every forbidden item present, and an answer that does not validate against `ctoc-dispatch-v1` fails with the first failing path named. Proof: fixtures including malformed answers.
5. GIVEN a clean-control task, THEN an answer reporting a defect fails.
6. GIVEN a task, THEN it runs at least three times and the result is the pass count out of the runs; a failed run is never retried into a pass.
7. GIVEN the 124 agents, THEN each has at least one task of each of the three kinds or is on an uncovered list with a written reason; the uncovered list may only shrink; the count is printed; a loader that reads zero tasks fails.
8. GIVEN a machine without the runtime the evaluation needs, THEN the command prints that nothing was evaluated, writes no ledger row, and exits non-zero under a require flag and zero otherwise; the ledger reads "never evaluated", not "passed".
9. GIVEN the ledger, THEN `npm test` reads it with no network and no model call, and a row whose agent fingerprint differs from the current prose reads "stale".
10. GIVEN the Doctor screen, THEN it shows never evaluated, unreadable and evaluated as three distinct strings, with the counts of current and stale, and an unreadable ledger never renders as "never evaluated".
11. GIVEN a real ledger row, THEN a byte-for-byte capture joins the golden corpus and is read by its canonical reader.

### The compiler

12. GIVEN a record with 0, 1, 2 and 3 rounds, THEN the compiler writes nothing and says "not final: N of 3" for the first three and compiles the fourth, recording the third round's `fingerprint_after`; GIVEN that value differs from the file's current fingerprint, THEN the compile fails and says the record is stale.
13. GIVEN the same prose and record, THEN two compiles are byte-identical.
14. GIVEN a form, THEN every statement carries a path, a line range and its verbatim text, the check rereads the prose and finds each span, and a statement with no anchor, or an anchor that is not found, fails the compile naming it.
15. GIVEN a prose file, THEN every sentence containing a word from its rule vocabulary (never, must, do not, always, forbidden; the list is data) appears in the form or the compile fails listing the omitted sentences. This check under-reports a rule phrased without those words; the evaluation is the backstop.
16. GIVEN a wrapper agent, THEN its form records the fingerprints of both the agent body and its target skill body, and a change to either makes the form stale.
17. GIVEN a header field absent from the prose file, THEN the form records it as absent, not defaulted. Proof: the executor, which has no `dispatch_protocol`, compiles with it absent.
18. GIVEN a form whose recorded fingerprint differs from the current prose, WHEN a caller asks for it, THEN the loader refuses, names the file that moved, and returns the prose path to use.
19. GIVEN a fixture where the prose changed and the form did not, THEN the fence fails naming the file; GIVEN the real corpus, THEN it reports "compiled N, not final M, stale K" and fails if the record shows final files and nothing is compiled.
20. GIVEN `/ctoc:update` finishing, THEN forms for changed files are rebuilt in the background with no foreground wait, a failure is one line, and the update still succeeds.
21. GIVEN the location of the forms, THEN an agent write is refused by the same hook family that refuses a write to a plan's verify record. Proof: a hook test on each write channel. This changes hook behaviour and is shown for your approval at its own moment.
22. GIVEN the size report, THEN each row has the prose size, the form size, the ratio and the kind, and an abstractive form is refused by the loader.
23. GIVEN a form and a runtime, THEN the form is never handed to a model in place of the prose unless the golden tasks for that agent score the same with the form as with the prose on that runtime; until then it is labelled unmeasured and the prose is used.
24. GIVEN an agent's answer, THEN the dispatcher can run a command that checks it against `ctoc-dispatch-v1`, names the first failing path, and an answer that fails is reported and not passed on. Proof: fixtures and a run of the real command from a fixture.

### The step state machine

25. GIVEN the one list of sixteen steps, THEN tests compare the executor's definition, the operations registry and the project summary table against it and fail naming each disagreement; today the registry's `steps: [12]` for the security scanner against the table's 13, and the registry's "steps 7-15" against the executor's 8 to 16, are failures until corrected.
26. GIVEN a started build, WHEN the executor asks for its current step, THEN the answer is the step and label, the next unticked item's text, what evidence closes it, and the count remaining, all from the machine's record.
27. GIVEN an executor that starts fresh with no memory partway through a build, THEN it gets the same answer. Proof: a scripted second process.
28. GIVEN an open item in Step 10, WHEN an item in Step 11 is ticked, THEN the tick is refused naming the open item.
29. GIVEN an item whose proof is a command's output, THEN a tick without that output recorded is refused.
30. GIVEN a kickback to Step 10, THEN ticks after it are cleared, the circuit breaker counts it as today, and a third kickback to the same step escalates as today.
31. GIVEN the machine and the plan's checkboxes disagree at completion, THEN completion is refused naming the step and a kickback is counted; GIVEN agreement, THEN completion proceeds as today. This is a change to gate logic and is shown for your approval at its own moment.
32. GIVEN five builds running at once, THEN each has its own record, no write is lost, and a stale write is retried, not overwritten.
33. GIVEN Steps 1 to 7, THEN the machine reports identity and owner only, and no human gate or approval record is touched. Proof: the approval ledger's bytes are identical before and after.
34. GIVEN a stuck pointer, WHEN you reset it through the menu with a reason, THEN the reason is recorded and the reset is shown on the build's record.

### The table of the 24 groups

35. GIVEN the table, THEN a test compares each group's member count with the directory listing and fails on any difference; the 24 rows sum to the number of agent files.
36. GIVEN an agent marked "needs no model", THEN a command exists that does its work, is reachable, and scores equal or better than the agent's measured answer on the same golden tasks; otherwise the mark is refused.
37. GIVEN a row saying a rung may run an agent, THEN it cites a ledger row with the agent fingerprint, runtime, machine facts, task-set fingerprint, passes out of runs and date; without one it reads "not evaluated" and the rung is not allowed.

### Only if the first question is answered b, c or d

These scenarios are written now so that no part of the pasted paragraph is hidden. They apply only to the option you choose.

38. GIVEN a form, a rung and a runtime version, THEN the prefix is rendered once and stored keyed by agent fingerprint, rung and runtime version; a call reads the prefix and not the prose; any key change rebuilds it.
39. GIVEN ratios from 1.0 (the control, the uncompressed derived form) downward, THEN the report shows passes out of runs per ratio per task, and a ratio ships only if it scores the same as the control on every task for that agent on that runtime, until you set a looser tolerance after seeing a measured curve. No ratio is assumed.
40. GIVEN an agent with no passing row for the machine's rung, WHEN the agent is needed, THEN CTOC says the agent is not cleared for this rung and either has your recorded grant to use the session model or waits as a question; it never routes silently.
41. GIVEN two machine shapes, THEN the same agent can be cleared on one and not the other, and each verdict names its shape.
42. GIVEN a distilled specialist, THEN it carries the fingerprint of the prose it was distilled from, the provenance of its training data, the ledger row that cleared it, and a recorded licence check (not performed here).
43. GIVEN a runtime that supports constraining output during writing, THEN the schema is enforced during writing; GIVEN one that does not, THEN it is checked after, as in scenario 24; the verdict says which.

### Wiring and honesty

44. GIVEN the reachability and export fences, THEN every new module and every export has a live caller reached from a command, a hook, the update path or a menu screen, in the same unit of work as the module.
45. GIVEN any verdict this plan prints, THEN it names the runtime that was used and says what was not tried; a screen never says "supported" or "cleared" without a ledger row.

## Definition of Done

- Every scenario passes as a committed test or a committed measurement, except scenarios 38 to 43, which apply only to the option chosen in the first question; the closing report names which block applied.
- The test for each part was written first, run, and seen failing.
- The prose-kept-whole check (scenario 1) is green for every build, and no report measures prose removed (scenario 2).
- The whole gate (`npm test`) passes with the coverage floor unchanged and no skipped test. The reachability, export, false-green, golden-corpus, recipe-execution and unexecutable-instruction fences are green: the persisted contracts this plan adds (a compiled form, the step record, a ledger row, a golden task) each have a byte-for-byte real capture.
- Recorded measurements, taken during the build and not targets: how many of the 225 files have a final record and how many forms exist; the size, form size and ratio of each form; the golden tasks per agent and the uncovered list; the pass counts out of runs per agent on each runtime tried; the count of agents marked mechanical; and the number of agents that reported a defect on their clean control.
- A human can see it: the Doctor screen row, the executor's answer to "what step am I on", and refusal texts that name the file or the step.
- The two changes to hook behaviour and gate logic (the protected folder, the validator reading the step record) are each shown exactly at their own approval moment.
- The record notes which plugin version ran. Agent definitions and the completion route run from the installed plugin, so the work is not reported as "the loop now does this" before the installed version contains it.
- `CLAUDE.md` and `README.md` counts are updated by tightening.

## Scope

### In Scope

- The agent evaluation harness, golden tasks, deterministic graders, the ledger and the Doctor row.
- The compiler, the loader, the fence, the answer check, the protected location, the update-time background build, and the size report.
- The one encoding of the sixteen steps, the per-build record, the executor's literal commands, the checklist iteration, and the completion check.
- The table of the 24 groups, tested against the disk.
- The specification of the second-runtime parts (scenarios 38 to 43), built only for the option chosen in the first question.
- Commands for the mechanical sections of named agents, if the fourth question's option b or c is chosen.

### Out of Scope

- Deleting, replacing or shortening any prose file: ruled out by you. The improvement run keeps editing prose in its own plan.
- The improvement run itself: `plans/implementation/every-agent-and-specialist-skill-improved-three-times.md`. This plan reads its record and never writes under its record directory.
- Selecting affected tests and the scoped completion record: `plans/functional/affected-tests-while-building-whole-suite-before-push.md`. This plan reads the fields it adds and duplicates none of its work. Both plans edit the executor's definition, `src/lib/actions.js` and `src/commands/start.md`; the scheduler serialises plans that declare the same file.
- The README rebuild chain: its own plans; this plan edits `README.md` only by count tightening and never at the same time as a rebuild slice.
- Choosing, naming or shipping any specific local model, quantisation or hardware: your decision after the first question; no model is named here.
- Training or distilling any specialist: a separate piece of work for the option chosen, with its provenance and licence check.
- Remote inference or any direct network call by the plugin: CTOC holds no key and makes none.
- Scheduling any run against a clock: left to the scheduler you choose, as the claims verifier does.
- Pricing, packaging or any business question about a store: the Product Loop, dispatched outside this chain by the founder or product manager.
- The human gates, the approval ledger and the scheduler: used, not changed (apart from the two hook and validator changes shown for your approval).

## Technical dependencies (stated as facts, not as a schedule)

- No compiled form is made for a file until the improvement run's record shows three rounds for it. Compiling earlier would compile text known to be partly wrong.
- The improvement record check reads every file in its own directory at any depth and fails on one not in the inventory (as the deepthink plan's reading of `tests/agent-and-skill-improvement-record.test.js` records; I did not re-read the test). Compiled forms must therefore live elsewhere, not under that directory.
- The compiled-form folder, the evaluation ledger and the step record are believed by gates or obeyed by models, so each lives where agents cannot write it; that is a hook change needing your approval.
- The validator reading the step record is a change to gate logic and needs your approval at its approval moment.
- Plans that create a counted artifact (a new test file, a new library module) must declare `CLAUDE.md`, because the validator for the implementation to todo crossing refuses otherwise; this plan does.
- The executor's definition, `src/lib/actions.js`, `src/lib/plan-validator.js` and `src/commands/start.md` are also declared by the affected-tests plan; the improvement run's queued slices edit the executor and the coordinator. The scheduler serialises plans that declare the same file, and the improvement record checks that each round of a file starts where the previous ended.
- The golden-corpus fence requires a byte-for-byte real capture for each persisted contract a module reads.
- Agents and the completion route run from the installed plugin, so publishing precedes any observed effect.
- Any evaluation that produces an answer needs a runtime; which one is the first question.

## Candidate files (not a declaration; the implementation planner fixes the exact list)

```
src/lib/agent-compiler.js, src/lib/compiled-agent-loader.js,
src/lib/compiled-agent-scan.js, src/scripts/compile-agents.js   the compiler, loader, fence and command
src/lib/step-machine.js                                         the one encoding and the per-build record
src/lib/agent-eval.js, src/lib/agent-eval-ledger.js,
src/scripts/run-agent-evals.js, evals/lib/agent-graders.js      the harness, ledger and graders
evals/agents/**                                                 golden tasks, one set per agent
src/lib/actions.js                                              startAgent and completion read the machine
src/lib/plan-validator.js                                       gate logic: the step record (needs approval)
src/hooks/PreToolUse.*.js                                       the protected folder (needs approval)
src/commands/start.md, src/lib/menu-screens.js                  step commands and recipes
src/commands/update.js, src/commands/update.md                  the background compile at update
src/tabs/tools.js                                               the Doctor row
agents/iron-loop/iron-loop-executor.md                          literal commands added; prose kept whole
.ctoc/operations-registry.yaml                                  steps corrected to the one encoding
.ctoc/compiled-agent-baseline.json, .ctoc/agent-eval-baseline.json,
.ctoc/recipe-coverage.json, .ctoc/reachability-roots.json
tests/ ... six new test files, tests/fixtures/golden-corpus/**
docs/AGENT_COMPILATION.md, README.md, CLAUDE.md
Only if committed forms are chosen (second question b or c):    .ctoc/compiled/**
Only if the fourth question chooses b or c:                     commands beside agents/testing/*.md and agents/security/security-scanner.md
NOT changed: any file under agents/** or skills/** other than the executor's definition (additions only)
```

## Risks and what this does not defend

- **On the session runtime, no prompt saving.** The harness loads the prose itself (item 4). If the first question is answered "no second runtime", the compiled form buys structure, checks and measurement, not a smaller prompt. Expecting more would be a false promise.
- **A compiled form is obeyed content.** If an agent can write it, it controls other agents; the protected folder closes this and needs your approval. Until it exists, forms must not be consumed.
- **Anchors prove nothing was invented, not that nothing was dropped.** The completeness check under-reports; golden tasks are the backstop, and they are only as good as their expectations. Expectations written by an agent can be wrong, which is why every task needs a source and why you should sample them.
- **A thin golden set gives a false green.** A rung "cleared" on three tasks is weak evidence. Every ledger verdict prints the task count next to it, and the clean control exists to catch an agent that reports defects everywhere.
- **Model drift.** A verdict ages even when the prose does not move; the periodic full pass in the third question is the only defence.
- **Cost.** At the plan's minimum of three tasks per agent and three runs per task, one full pass over 124 agents is 124 times 3 times 3, which is 1,116 model calls per runtime, before any compression-ratio sweep multiplies it. I have not measured the money or the time.
- **Coupling with the improvement run** if forms are committed: every one of its prose edits would need a rebuilt form in the same commit.
- **The state machine can wedge a build** if it refuses wrongly. It always names the item, and a human reset with a recorded reason exists.
- **Licence of distributed artifacts** is unread (item 14).

## What was not verified

- Nothing was executed. I hold no way to run a program in this session. Every behavioural statement is from reading.
- I read the opening of five agent definitions (the citation validator, coverage mapper, smart test runner, security scanner and CTO Chief) and the whole executor definition. For the other 118 agents I read nothing past the file name, so the mechanical column of the table is nearly empty by honesty, not by finding.
- How the record check computes a fingerprint, and how many rounds the eight existing records hold beyond round one of one.
- Whether the harness hands the subagent's final message to the stop hook; `src/hooks/SubagentStop.js` was read to line 60 only.
- Whether any other writer sets the build step pointer beyond `src/lib/actions.js:1881`; I had no whole-repository search. I read `src/lib/actions.js` to line 2100 of an unknown total and `src/lib/plan-validator.js` to line 160.
- What `validateForReview` checks beyond the step boxes. I read only the start of its file.
- `.ctoc/operations-registry.yaml` was read to line 120 only; whether it lists groups or tiers beyond the per-agent `category` field is not known to me.
- Whether a test enforces the rule against launching a second Claude, and how `evals/run.js` coexists with it.
- Everything about local runtimes (constrained decoding, prefix caching, quantisation, whether the command-line tool can be pointed at a local model) is believed from general knowledge, was not searched for, and is labelled `[unverified]` where it appears.
- Meanings of "the online grant", "the store", "the once-a-day tier" and "machine shape", which no file I read defines.
- Two corrections to the brief that I verified by reading: "six fixed headings" is five, and "every agent carries `dispatch_protocol`" is false for the executor and CTO Chief (items 2 and 3).
- The hook that holds the command-table and verification folders; I read only the project description of it.
- Licence terms of any model or of distilled weights.
- The number of tests in the six new test files, and whether any existing test asserts the executor's current wording.

## Decisions Taken Under Ambiguity

0. **Settled by you, not decided by me:** the prose is never deleted, replaced or shortened; derived forms carry its fingerprint; compression is of the derived form only; no scenario measures success by prose removed.
1. **Evaluation first.** Not chosen: compiling first and measuring afterwards. Reason: a form and a compression ratio are claims about behaviour, and nothing measures behaviour today. Cost: the compiler cannot be called finished until the harness exists.
2. **Extractive and anchored.** Not chosen: a model paraphrasing the prose into a form. Reason: paraphrase cannot be proved faithful by code. Cost: the form can be only as compact as its verbatim spans allow; paraphrase is a separate kind, never handed to a model until measured equal.
3. **Compile only final prose.** Not chosen: provisional forms with a flag. Cost: today almost no form can exist; the report states the counts.
4. **A stale or unmeasured form falls back to the prose.** Not chosen: refusing the call. Reason: the safe direction is to hand a model more, not less.
5. **Zero tolerated loss until you set a tolerance.** A compressed form ships only if it scores the same as the control on every golden task. Not chosen: a default tolerance. Reason: how much accuracy loss is acceptable is your risk to set, and you can set it after seeing a measured curve. Cost: fewer forms ship at first.
6. **At least three tasks per agent, one of each kind** (seeded defect, real defect, clean control), **and three runs per task** (the existing default). Chosen so every agent has a positive case, a negative control and a case from real use. Raise if the first measurements show variance.
7. **Step records live in a sidecar under `.ctoc/state/`**, as the kickback counter does, because the plan's frontmatter is under the approval hash.
8. **The machine mirrors its ticks into the plan's checkboxes.** Not chosen: replacing the checkboxes. Reason: the validator and the human read them.
9. **The executor's prose is kept whole and gains literal commands.** Not chosen: replacing its step list with a pointer to the machine; that would shorten a prose file. The step list is checked against the machine by a test.
10. **One encoding of the steps; the registry and the table are corrected to match** by tightening.
11. **Item-level iteration for Steps 8 to 16 only.** Steps 1 to 7 are collaborative with you present and keep their stage pointer.
12. **The answer check is a command the dispatcher runs.** Not chosen: the stop hook, which has no authority (`SubagentStop.js:26-27`).
13. **The ledger's staleness is shown, not enforced, until you say.** A stale ledger does not fail `npm test`. Not chosen: failing the build on staleness, because that would make model spending a condition of every build; you can tighten it. Cost: a stale ledger can sit unnoticed unless someone looks at the Doctor screen.
14. **Re-evaluate only agents whose prose fingerprint, task set or runtime changed, plus a periodic full pass** for model drift. The frequency of the full pass is the third question.
15. **Compile at the end of `/ctoc:update`, in the background**, or at release if forms are committed.
16. **The table's cells say "body not read" rather than a guess.**
17. **Verdict wording states the runtime and what was not tried;** "supported" is never printed without a ledger row.

## Questions for the human

Four forks are yours: the second runtime, where a compiled form lives and what vouches for it, who runs the evaluations, and what to build for the mechanical agents. In each, every Recommendation cell is empty on purpose. I have no best answer to assert; each turns on what you will own, spend or risk.

### Question 1 — Should CTOC ever run, measure or support a local model, and if so, in what shape?

Every part of the pasted paragraph that names a rung, a per-rung prefix cache, distilled specialists or the online grant needs a runtime other than the session model. Today CTOC calls no model, holds no key, and the project rules say it must never spawn a second Claude. The harness also loads an agent's prose as that agent's whole system prompt, so on the session runtime a compiled form saves no prompt; the saving exists only where something other than the harness builds the prompt. The nearest precedent is the evaluation command, which launches the `claude` binary only when you run it yourself.

```
┌──────────────────────┬──────────────────────────────────────────────┬──────────────────────────────────────────────┬────────────────┐
│ Option               │ Pros                                         │ Cons                                         │ Recommendation │
├──────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────┼────────────────┤
│ a) No second runtime │ Nothing outside the session ever runs.       │ The per-call prefix cache, compression       │                │
│                      │ Evaluation, compiled forms and the step      │ ratios, distilled specialists and the        │                │
│                      │ state machine are all still built.           │ online grant have nothing to act on and      │                │
│                      │ No rule about running models changes.        │ are not built.                               │                │
├──────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────┼────────────────┤
│ b) Measured only,    │ You launch one command in a terminal, as     │ Pipeline work still runs on the session      │                │
│ outside the plugin   │ npm run eval does today; the plugin          │ model; nothing is adapted, only measured.    │                │
│                      │ never starts a model.                        │ You must supply and run the local model.     │                │
│                      │ You learn which agents a local model could   │                                              │                │
│                      │ take, before deciding anything else.         │                                              │                │
├──────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────┼────────────────┤
│ c) Plugin starts a   │ The cleared agents can really run on the     │ Reverses the standing rule that the plugin   │                │
│ local model          │ local rung, with the compiled prefix.        │ calls no model and starts no second runtime. │                │
│                      │ Every part of the pasted paragraph has an    │ Adds a process, a local port, model files,   │                │
│                      │ object.                                      │ tool code and a way back into the pipeline.  │                │
├──────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────┼────────────────┤
│ d) Another session,  │ The plugin launches nothing; you run a       │ Whether the command-line tool can be pointed │                │
│ pointed at a local   │ second session against the same files.       │ at a local model is [unverified].            │                │
│ model, by you        │ The compiled forms and step state machine    │ CTOC cannot measure what it does not run;    │                │
│                      │ are what make a smaller model usable.        │ the ledger rows come from your runs.         │                │
└──────────────────────┴──────────────────────────────────────────────┴──────────────────────────────────────────────┴────────────────┘
```

Should CTOC ever run, measure or support a local model, and if so, in what shape?

New ideas in this question, for you to check:
- "The rung" as a ladder of runtimes from the session model downward: your word, with no definition in the files I read.
- "The online grant", which I read as your permission for an agent that no local rung is cleared to run to run on the session model instead: no such term appears in the files I read.
- "Machine shape", which I read as the facts about a machine that a measurement records: the list of facts is not fixed.

**a)** No second runtime; the plan delivers the harness, compiled forms, the step state machine and the table, and builds nothing that needs a local model.
**b)** A local model measured only, by a command you launch outside the plugin; pipeline work stays on the session model.
**c)** The plugin starts and talks to a local model; the standing rule against a second runtime is changed by you.
**d)** A second session pointed at a local model, run by you; the plugin launches nothing.

Reply with a letter.

### Question 2 — Where should a compiled agent form live, and what vouches that it matches its prose?

A compiled form is content that models obey, so whoever can write it controls what agents are told. The repository already keeps its approval records and verification evidence where agents cannot write, for the same reason. The three shapes differ in whether the forms are committed, which decides whether every prose edit in the improvement run drags a rebuilt form with it, and in whether anything, a hook or a key, stands behind them.

```
┌──────────────────────┬──────────────────────────────────────────────┬──────────────────────────────────────────────┬────────────────┐
│ Option               │ Pros                                         │ Cons                                         │ Recommendation │
├──────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────┼────────────────┤
│ a) Built on each     │ The improvement run's edits never need a     │ Nothing proves a machine's form equals what  │                │
│ machine, never       │ rebuilt form in the same commit.             │ you would have built.                        │                │
│ committed            │ There is no key to hold, rotate or lose.     │ Needs a hook change so agents cannot write   │                │
│                      │                                              │ the folder, and that needs your approval.    │                │
│                      │                                              │ Every machine pays the build at update.      │                │
├──────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────┼────────────────┤
│ b) Committed beside  │ Every install gets the same form; a change   │ Every prose edit, including all of the       │                │
│ the prose            │ shows as a reviewable difference.            │ improvement run's, must also commit a        │                │
│                      │ The fence can fail a commit where the        │ rebuilt form, which couples the two plans.   │                │
│                      │ prose moved and the form did not.            │ Each form is more content that models obey   │                │
│                      │                                              │ and that you must review.                    │                │
├──────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────┼────────────────┤
│ c) Committed and     │ Installs from the marketplace can verify the │ CTOC holds no key today; keeping, rotating   │                │
│ signed with a key    │ signature before a model is handed the form. │ and losing the key are yours.                │                │
│ that you hold        │ Same reviewable difference as committing.    │ A lost or expired key stops every install    │                │
│                      │                                              │ verifying until you sign again.              │                │
│                      │                                              │ Signing must run where no agent can reach.   │                │
└──────────────────────┴──────────────────────────────────────────────┴──────────────────────────────────────────────┴────────────────┘
```

Where should a compiled agent form live, and what vouches that it matches its prose?

New ideas in this question, for you to check:
- "Cached and signed" from the pasted paragraph: no signing scheme or key exists in the files I read, so a signature here is a new mechanism.
- "The store" for distilled specialists: the only distribution path I found is the marketplace install; a store for model artifacts would be new, and its licence position is unread.
- A protected folder for compiled forms: it extends the existing list of protected folders and is a change to hook behaviour.

**a)** Built on each machine and never committed; integrity is the fingerprint check at use, behind a protected folder.
**b)** Committed beside the prose, with the fence failing any commit where the prose moved and the form did not.
**c)** Committed and signed with a key you hold; installs verify before use.

Reply with a letter.

### Question 3 — Who runs the agent evaluations, and how often?

One full pass over the 124 agents at the plan's minimum of three tasks per agent and three runs per task is 1,116 model calls per runtime, before any compression-ratio sweep multiplies it. I have not measured the money or the time. The pasted paragraph says "once-a-day tier"; nothing in CTOC is scheduled against a clock today, and the claims verifier's schedule is left to you. In every option only agents whose prose, tasks or runtime changed need re-evaluating, and a periodic full pass catches model drift; how often that full pass runs is part of what you are choosing.

```
┌──────────────────────┬──────────────────────────────────────────────┬──────────────────────────────────────────────┬────────────────┐
│ Option               │ Pros                                         │ Cons                                         │ Recommendation │
├──────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────┼────────────────┤
│ a) You launch it,    │ You decide when any spending happens.        │ The ledger goes stale unless someone         │                │
│ on demand            │ No scheduler, no standing process, and no    │ remembers; a rewritten agent is measured     │                │
│                      │ change to the rule about running models.     │ only when you run it.                        │                │
├──────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────┼────────────────┤
│ b) The session runs  │ No spawned process and no key: the session   │ Measures the session model only, never       │                │
│ it on the session    │ dispatches subagents, as it does for         │ another runtime.                             │                │
│ model                │ question precompute today.                   │ Spends your session allowance, and only      │                │
│                      │                                              │ while a session is open.                     │                │
├──────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────┼────────────────┤
│ c) A scheduler you   │ Results stay fresh without a person          │ You choose and operate the scheduler; CTOC   │                │
│ choose runs your     │ remembering; the command already follows     │ schedules nothing against a clock.           │                │
│ command              │ the claims verifier's exit-code pattern.     │ A model process runs unattended and spends   │                │
│                      │                                              │ money unwatched [cost unmeasured].           │                │
└──────────────────────┴──────────────────────────────────────────────┴──────────────────────────────────────────────┴────────────────┘
```

Who runs the agent evaluations, and how often?

New ideas in this question, for you to check:
- "The once-a-day tier": no daily tier exists in any file I read.
- Re-evaluating only changed agents plus a periodic full pass: my proposal, not yours.
- The evaluation ledger shown on the Doctor screen but not failing `npm test` when stale (decision 13): my default, which you can tighten.

**a)** You launch it on demand, in a terminal, as the existing evaluation command is launched today.
**b)** The session runs it on the session model by dispatching subagents.
**c)** A scheduler you choose runs the command on a clock you set.

Reply with a letter.

### Question 4 — For agents that are mostly mechanical steps, what should CTOC build?

The coverage mapper (lines 34 to 46 of its definition), the smart test runner (lines 29 to 56) and the security scanner's aggregation (lines 54 to 72) spell out steps a program can run. The prose stays whole in every option, as you ruled. The affected-tests plan already puts test selection in a command, so options b and c would overlap it for the testing agents and must be reconciled with it.

```
┌──────────────────────┬──────────────────────────────────────────────┬──────────────────────────────────────────────┬────────────────┐
│ Option               │ Pros                                         │ Cons                                         │ Recommendation │
├──────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────┼────────────────┤
│ a) Record only       │ No new code and no change to how agents      │ A model keeps doing steps a program          │                │
│                      │ are dispatched.                              │ could do exactly, and can do them wrongly.   │                │
│                      │ The table still tells you which agents       │ The no-model column stays a claim.           │                │
│                      │ could be code.                               │                                              │                │
├──────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────┼────────────────┤
│ b) Companion         │ The mechanical steps become tested code.     │ Each command is new code to own, test        │                │
│ commands             │ The model's share shrinks; dispatch          │ and wire into a live entry point.            │                │
│                      │ behaviour is unchanged.                      │ The agent can still skip the command: it     │                │
│                      │                                              │ is an order, not a gate.                     │                │
├──────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────┼────────────────┤
│ c) Run the command   │ No model call at all for agents the table    │ Changes how CTO Chief dispatches, a core     │                │
│ and skip the         │ marks fully mechanical.                      │ path.                                        │                │
│ dispatch             │ The result is the same every time.           │ A wrong 'fully mechanical' label silently    │                │
│                      │                                              │ removes judgement; scenario 36 guards it.    │                │
└──────────────────────┴──────────────────────────────────────────────┴──────────────────────────────────────────────┴────────────────┘
```

For agents that are mostly mechanical steps, what should CTOC build?

New ideas in this question, for you to check:
- Skipping the dispatch for a fully mechanical agent (option c) is new dispatch behaviour that I proposed; nothing in the pasted paragraph asks for it beyond "deterministic code needing no model at all".

**a)** Record which agents are mechanical in the table and build nothing.
**b)** Build a companion command for each mechanical section; the agent prose stays whole and calls it.
**c)** Build the command and have the dispatcher run it instead of dispatching a model for agents the table marks fully mechanical.

Reply with a letter.
