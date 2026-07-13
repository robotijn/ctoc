---
title: "CTOC rebuild — the background engine: from gated menu to flowing pipeline"
type: vision
status: exploring
created: 2026-07-13
amended: 2026-07-14
---

# CTOC rebuild — the background engine

## The goal being served

CTOC's goal: the best implementation system on the planet, from vision to working
app. The governing objective function: **minimize the human's time while
maximizing steering — maximize intent transferred per human minute — and build
incrementally so steering always has something real to steer against.**

## Why a rebuild (five-critic verdict, 2026-07-13 — all five reached NO)

1. **Greenfield journey**: a human cannot ship through the machinery. Gate 3
   demands verify evidence no live code path writes; the only exit is "Approve
   anyway", training gate-override. `approvePlan` performs zero validation (it
   crossed Gate 1 against a failing validator in a live sandbox drive).
   `startAgent` hands executors a bare file path — no brief, no ancestry, no
   retrieval. The executor's own instructions contradict the validator's labels.
2. **Orchestration**: the scheduler's kind-based plan-serial rule forbids the
   file-disjoint parallel wave that demonstrably works; nothing maps plan
   `depends_on:` into the task graph; the integration barrier exists only as an
   unused task kind; a global lock forces one plan at a time. The wave
   intelligence lives in the human.
3. **Unwired machinery**: 94 of 191 source files (49%) unreachable from every live
   root. Verify-evidence writer, circuit breaker, post-commit quality agent,
   dispatch auditing, refinement-loop gate — built, tested, never called. A live
   gate with a dead producer, which actively trains evidence fabrication.
4. **Last mile**: nothing ever launches the built app. Production-readiness is a
   YAML nothing reads. Deployment is off-by-default and never verified. "Vision to
   working app" ships as "vision to merged code".
5. **Human experience**: the system persists state everywhere except the human's
   answers. Compliance is unanswerable in fresh projects; the stale detector
   proposes batch-reverting healthy pre-gate plans; reconcile falsely orphans
   tasks started per its own recipe; dead affordances; the menu lies about state.

The discipline layer shipped 2026-07-13 (real enforcement denies, unforgeable
approval ledger, durable logs, exclusive locks) is sound and retained in full.
What is missing is the engine: the connective tissue is prose where it must be
code, and a human expert is currently the orchestrator.

## The design

### Core inversion

Today the human waits for the menu and the pipeline waits for the human at four
blocking gates. In the rebuild, work flows in the background continuously and the
human's whole synchronous surface is a ranked question queue plus a feed of built
increments. Answering steers; stopping is always safe.

### Why the four stage-gates can dissolve

Blocking gates were priced for human labor, where building the wrong thing cost
weeks. Agent labor repriced that downside to a re-run. Two costs did NOT collapse:
**human attention** (reviewing wrongly-built work) and **irreversible actions**.
Therefore: everywhere reversible, gates become flow control; at irreversibility,
gates remain.

### The mechanisms

1. **Readiness-scored dataflow.** Artifacts advance when readiness crosses
   threshold — no clicks. CRITICAL AMENDMENT: flow control uses **evidence-backed,
   machine-checkable, fail-closed** checks (the `validateReviewToDone` pattern:
   marker + checked steps + fresh passing verify artifact), NOT advisory model
   scores. Advisory scores are Goodhart-exposed: the integrator's job is to make
   the critic score 5/5, so promoting that score to flow control optimizes the
   score, not the artifact. Where the machine genuinely cannot converge (the
   integrator+critic loop's `auto_approve_after_max` case), that emits a
   **blocking question** — never an auto-advance. The flow-gating check must be a
   different check from the rubric the generator optimizes against.
2. **One question surface, value-ranked.** All stages emit questions into one
   persistent queue ranked by expected value of information (impact × divergence ×
   urgency), rendered in the ask-me-questions matrix, with every answer mined into
   durable steering preferences — a question asked twice is a defect. AMENDMENT
   (anti-spam): the no-stub documented-choice rule STAYS the default. A question is
   emitted only above an EVI floor, and the asker still owns the documented default
   it proceeds on — asking never sheds responsibility. Answers are idempotent
   events that no-op against killed subtrees and tell the human when moot.
3. **Speculative execution with assumption provenance — ON BRANCHES.** Where a
   question is open, the pipeline proceeds on the documented default, tagging every
   downstream artifact with the assumption it rests on; a contradicting answer
   triggers an invalidation cascade. CRITICAL AMENDMENT: semantic relatedness has
   no recall guarantee, so the cascade WILL miss implicit dependents.
   **Speculative work therefore lives on branches and is unmergeable until
   question-free.** A kill is a branch-drop, never a revert of merged history.
   Integration onto the mainline happens only at a barrier no open assumption
   feeds. Worst case of a missed tag is dead work on a dropped branch — never a
   silently-shipped contradicted assumption. This also makes shared-file and
   merged-kill provenance clean by construction.
4. **Adaptive speculation control, cost-bounded.** Depth is bounded by assumption
   impact (high blast radius blocks its own subtree) AND by **spend budget**:
   depth = min(impact bound, remaining budget). AMENDMENTS: the feedback signal is
   **attributed mispredictions only** (kills whose root cause was a late
   contradicting answer) — not raw kill-rate, which conflates flaky tests,
   integration seams, and circuit-breaker trips. Hysteresis and a minimum sample
   prevent oscillation. Cold start is conservative (ask-biased) until N attributed
   samples exist. **Uninformed ⇒ speculate LESS, never more**: an unanswered
   high-value question tightens the global threshold. When nobody is awake to
   correct the riskiest assumptions, the engine builds less on them — the first
   draft had this exactly backwards.
5. **The irreversibility gates (plural — corrected).** Internal transitions are
   reversible. Irreversible boundaries are **git push** (public repo; forks pull,
   force-push does not recall) and **deploy/publish/spend/delete**. Both are
   human-gated. E6 MUST disable the existing `approvePlan` done→deploy
   auto-trigger (actions.js:344) unless ship-gate-stamped — today a plan reaching
   done auto-deploys when configured, which would bypass the ship gate entirely.
   The approval-ledger machinery transfers whole: it guards the ship gates and
   stamps every AUTOMATIC advance with its justification (`advanced_by: pipeline`
   + evidence) versus `approved_by: human` at a ship gate. Auditability rises: a
   click is just a click; an evidence-stamped crossing is a record.

### Runtime honesty (corrected — the first draft asserted a daemon that cannot exist)

There is no daemon in Claude Code. "The pipeline never waits" was FALSE and is
withdrawn. The honest guarantee: **maximal lossless progress whenever a session is
alive, and lossless resume.** Two hard constraints, both fixed before the engine:

- **Single-writer.** `task-registry.js` is explicitly single-writer with no lock.
  An interactive session plus a scheduled headless drain are two concurrent
  writers to the engine's own state — a data race. Resolve before E5: an
  engine-level session lock, or the token/heartbeat lock the plan-index store
  already implements. No engine mechanism ships on a racy substrate.
- **No cancel.** The task model cannot kill running work; a session dying mid-wave
  strands tasks. F1 adds a `cancel` transition so a contradicting answer stops
  running speculation instead of paying for it to finish.

## The program (dependency graph — the human alone schedules)

### Layer P — the thin engine proof (FIRST; de-risks the whole thesis)

- P1. One toy vision → one tagged assumption → one speculative slice on a branch →
  one contradicting answer → clean cascade → rebuild → human-openable increment.
  Proves mechanisms 2–5 end-to-end on rails without paying for all of Layer F.
  If this does not work, the thesis is wrong and the rebuild stops here.

### Layer F — foundations (the five critics' findings; valuable even if the engine never ships)

- F1. Wave orchestration: file-based serialization replacing kind-based
  plan-serial (touches mandatory for implement); atomic add-and-claim closing the
  record-vs-start window; plan `files:`/`depends_on:` → task touches/blockedBy;
  the dormant `sync` kind as integration barrier; retire the global agent lock;
  add the `cancel` transition.
- F2. Verify wiring: the executor calls runVerify + persistVerifyResult at Step 14
  so evidence is produced by machinery, never hand-written; executor/critic step
  numbering corrected to the canonical table.
- F3. Validation in the action layer: approvePlan and every transition consults the
  validators and gate-order — ONE gate-rule encoding, not three; "Approve anyway"
  leaves the recommended slot, then leaves entirely.
- F4. Brief assembly in code: plan content + full ancestry + retrieval (related
  plans via the hybrid index) + completion contract — replacing the prose recipe.
- F5. Run-the-app last mile: Step 14 gains a mandatory launch-and-drive check for
  app-shaped projects; the dead Playwright scaffolder resurrected into Step 8;
  production-readiness YAML gets a reader surfaced at the ship gate; deployment
  gains post-deploy smoke verification; one greenfield proof fixture (scaffold an
  app, drive a plan, assert the app responded) as the permanent regression net.
- F6. Dead-weight reckoning: the 94 unreachable files and 48 zero-caller exports
  are each wired, rewritten, or deleted — no third state. Documentation claims of
  enforcement corrected to shipped truth.
- F7. Answer persistence: every human answer persists and is never re-asked
  (compliance/environment/stale ride-alongs; init writes the regulatory block; a
  durable stop for every ride-along; the menu never confirms an unsaved choice).
- F8. Papercut closure: stale-detector stage polarity; reconcile carries the
  harness agent id; queued-but-built reconciliation; version-drift signal;
  Doctor/Update reachable or removed; Library reads the plugin; init stops
  scaffolding CTOC-internal dirs into user projects; update clones to temp before
  gutting the marketplace; search failures say "unavailable", never "no results".

### Layer E — the engine (depends on P + F)

- E1. Evidence-backed readiness as flow control (NOT advisory scores).
- E2. The question queue: persistent, deduplicated, EVI-ranked, matrix-rendered,
  answer-mining, idempotent-answer semantics.
- E3. Assumption tags + branch-isolated invalidation cascade.
- E4. The cost-bounded adaptive controller (attributed signal, hysteresis,
  conservative cold start).
- E5. The background driver: waves via the F1 scheduler, promotion on completion,
  questions surfacing as they arise, resumable across sessions (single-writer
  resolved first).
- E6. The ship gates: continuous increment review replaces Gate 3; push and deploy
  are human-gated; the done→deploy auto-trigger is disabled unless stamped.

### Layer S — the steering surface (depends on E)

- S1. Instant two-pane render from disk (questions + while-you-were-away). NOTE:
  independent of the whole thesis — a straight win, shippable immediately.
- S2. Increment previews; walking-skeleton-first decomposition ordering.
- S3. Decision ledger view with blast-radius ranking and revert handles.

## What survives unchanged

The iron loop's sixteen steps as the unit of work; SIP1 decomposition; the critic
fleet and brutal discuss; ask-me-questions; the approval ledger and enforcement
hooks; durable logs; the hybrid plan index; the evaluation harness; operating
lessons 1–14; and the no-stub documented-choice discipline (which the engine leans
on harder, not less).

## Open decisions for the human (Gate 0)

1. **Ship gates**: the human said "remove the human gates". This design keeps TWO
   (git push, deploy) on irreversibility grounds, and the critic proved the
   existing done→deploy auto-trigger would otherwise bypass them. Confirm or
   overrule.
2. **Sequencing**: P1 (thin engine proof) before Layer F, or F1–F5 first (they are
   bug-fixes with standalone value and de-risk the engine substrate)?
3. **Scope of F6**: reckoning 94 dead files is large. Delete-by-default, or wire?

## Success criteria

- A greenfield app vision reaches a launched, driven, human-openable increment
  with no human clicks other than answering ranked questions and the ship gates.
- The surface renders instantly from disk; the human never waits on computation.
- No question is asked twice; every ride-along has a durable stop.
- The pipeline runs waves without a human computing partitions, briefs, barriers,
  or evidence.
- Speculative work can never merge while an assumption it rests on is open.
- Zero unreachable source files; zero documentation claims of enforcement the code
  does not perform.
- The greenfield proof fixture passes on every release.

- Status: exploring
