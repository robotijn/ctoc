---
title: "PQ2 — Wire the producer to a live root (never-wait), reconcile counts, and prove the whole human loop end to end"
type: implementation
parent_plan: none
depends_on: 00062-pq1-the-producer-pipe
priority: CRITICAL
program: streaming-human-loop
iron_loop: true
files:
  - "src/scripts/produce-questions.js"
  - "src/lib/streaming-gate.js"
  - ".ctoc/reachability-roots.json"
  - "CLAUDE.md"
  - "tests/produce-questions.test.js"
  - "tests/streaming-human-loop-e2e.test.js"
  - "tests/streaming-gate.test.js"
---

# PQ2 — wired is done, and the loop is proven

## Why this exists

PQ1 built `src/lib/streaming-producer.js` — the pipe from a CTOC agent's questions
to the streaming store — and deferred its wiring to "a next plan" (PQ1 Decision 4).
**That was wrong, and CTOC's own dead-code fence caught it.** Operating Lesson 16
([[principle_wired_is_done]]): *a module is done when a human can REACH it, wiring
in the SAME slice, never a follow-up.* `streaming-producer.js` is currently
unreachable from any live root, so `npm test`'s reachability fence fails — correctly.
The PQ1 executor refused to green-wash it (declare a fake root / lower the baseline).
This plan wires it honestly.

**The loop was already proven by hand** this session: a real product-owner emitted
8 real questions about a magic-link feature → the human answered them in the real
screen → sufficiency flipped true only on the last → the plan crossed itself
functional→implementation with `advanced_by: sufficiency` and no `approved_by`. That
hand-run is not repeatable and left live pollution (since cleaned up). This plan makes
it a permanent, sandboxed test.

## The reachability model (measured, from `src/lib/reachability.js`)

A file is live iff require-reachable from: hook commands; the three slash commands
(`menu.js`/`push.js`/`update.js`); sanctioned scripts; roots declared in
`.ctoc/reachability-roots.json`; or instruction-surface roots. **A test is never a
root.** Current declared roots: `run-self-check.js`, `build-coverage-map.js`,
`evidence-pack.js`, `continuation.js`.

## The wiring — the generation half of "precompute, never wait"

Per [[feedback_precompute_questions_never_wait]]: generation is DECOUPLED from
answering and runs in the BACKGROUND; the human NEVER waits for it.

1. **`src/scripts/produce-questions.js`** — a background entry point. When run
   (`node src/scripts/produce-questions.js [root]`), it calls
   `streaming-producer.produceAllNeeded(root, defaultDispatch)` — generating questions
   for every plan that needs them, each via a real CTOC agent (`claude -p`). Guarded by
   `require.main === module`. Declared in `.ctoc/reachability-roots.json` — it is a
   GENUINE background root, exactly like the three scripts already there. This makes
   `streaming-producer.js` reachable (the script requires it).

2. **`streaming-gate.js` fires it, fire-and-forget.** A new `maybeKickProduction(root)`:
   when the streaming gate screen renders and `plansNeedingQuestions(root)` is non-empty,
   spawn `produce-questions.js` **detached** (`spawn(..., {detached:true, stdio:'ignore'}).unref()`)
   and return IMMEDIATELY. The menu renders now; questions generate behind the human;
   next open, they are there. This is the useful wiring: opening the menu is what makes
   a human's plans get their questions. `streamingGateScreen` calls it once per render,
   guarded so it never blocks and never throws into the render path.

## The hard constraints

1. **NEVER-WAIT is absolute.** `maybeKickProduction` must return in milliseconds. It
   spawns detached and unrefs; it does NOT await production, does NOT read the model,
   does NOT block the screen. A failure to spawn is swallowed (logged) — the menu must
   render even if generation cannot start. Test that the render path returns without
   waiting.
2. **No duplicate stampede.** Opening the menu repeatedly must not spawn N overlapping
   producers for the same plans. Guard with a simple on-disk lock/marker
   (`.ctoc/streaming/.producing`) with a staleness timeout, OR skip the kick when a
   producer is already running. Pick the simpler correct one and document it. A plan
   whose questions are already fresh is skipped by `plansNeedingQuestions` anyway.
3. **The e2e test uses the REAL producer + REAL downstream, in a SANDBOX.** No live
   `.ctoc/` or `plans/` pollution — everything under `os.tmpdir()`. The dispatch is
   injected (returns product-owner-shaped questions); everything else is real:
   `produceForPlan` → `writePlanQuestions` → `hasEnoughInformation` → the real
   sufficiency-cross path. Assert the plan ends in `implementation/` with a
   `sufficiency` ledger entry carrying evidence and NO `approved_by`.
4. **Counts are reconciled to the TRUTH, re-measured from disk.** Do not restate a
   number from memory — the doc counts already drifted once this session because
   someone did.

## Decisions Taken Under Ambiguity

1. **The trigger is menu-open (gate-screen render), not a SessionStart hook.** The
   streaming precompute principle is "precompute AHEAD of time"; the menu is where a
   human engages the gate, so kicking generation there means their plans get questions
   as a direct result of the thing they did. A SessionStart hook would also work and is
   not excluded later — but menu-open is the minimal live root that makes the producer
   reach a human, and it is already a root. If the owner wants session-start generation
   too, that is an additive follow-up, not a competitor.
2. **`produce-questions.js` is a DECLARED root, not smuggled reachability.** It is a
   real background entry point in the same class as the three scripts already in
   `reachability-roots.json`. Declaring it is honest (the baseline's own rule: declare a
   genuine root OR wire OR delete — this is a genuine root AND it is wired, spawned by
   the menu path). It is NOT a baseline-lowering to hide dead code.
3. **The producer is fire-and-forget; its OUTPUT is not awaited by the menu.** The human
   opening the menu does not block for `claude -p` calls. They see whatever questions
   already exist; new ones appear on a later open. This is the never-wait contract, not
   a limitation to apologise for.
4. **Count reconciliation is in THIS slice.** Adding two `src/` files trips the
   documented-count ratchets. Lesson 16 says wire in the same slice; the counts are part
   of wiring. Re-measure `src/lib/*.js`, `src/scripts/*.js`, and test-file counts from
   disk and update every assertion + `CLAUDE.md` figure the PQ1 executor named:
   JS-module count, `src/lib` module count, the two test-file-count checks, the CLAUDE.md
   self-verify, the ground-truth project counts, the thorough self-check, and the
   iron-loop-enforcer live-repo-state check.

## Test Plan (TDD-Red first)

Write FIRST, observe RED:

1. **`produce-questions.js runs produceAllNeeded when invoked as main`** — spawn it in a
   sandbox with a stubbed dispatch (via an env-injected fake, OR assert it loads and
   calls produceAllNeeded through a required-module seam); assert it does not throw and
   drains the queue. Do NOT spawn a real model.
2. **`produce-questions.js is a declared reachability root`** — assert its path is in
   `.ctoc/reachability-roots.json`, and (the real point) run the REAL reachability
   analyzer and assert `streaming-producer.js` is now reachable (0 unreachable).
3. **`maybeKickProduction returns immediately and never blocks the render`** — stub the
   spawn boundary; assert `streamingGateScreen` returns without awaiting production and
   without throwing even when spawn fails.
4. **`maybeKickProduction does not stampede`** — call it twice rapidly; assert the second
   call does not spawn a second producer while one is marked running.
5. **`maybeKickProduction skips when no plan needs questions`** — empty queue → no spawn.
6. **THE END-TO-END PROOF (sandboxed):** `founder idea → questions → answers → the gate
   crosses itself`. In an `os.tmpdir()` sandbox: create a valid functional plan (with
   acceptance criteria); `produceForPlan(root, ref, fakeDispatch)` where fakeDispatch
   returns product-owner-shaped questions; answer every question via the real
   `streamAnswer`; drive the real `pendingGateDecisions`; assert the plan moved to
   `implementation/`, the ledger entry is `entryKind === 'sufficiency'`, it carries
   non-empty evidence, and `approved_by` is absent. This is the permanent form of the
   hand-run proof — the measure is the human.
7. **`the e2e proof fails closed`** — same sandbox, leave ONE question unanswered; assert
   the plan does NOT cross and stays in `functional/`. The no-false-YES guard.
8. **`the counts reconcile`** — the existing count assertions pass with the two new files
   present (this is the reconciliation landing).

## Execution Plan (Steps 8-16)

### Step 8: TEST — write cases 1–8. Run. Cases 1–7 fail (wiring absent); the count checks fail (files present, numbers stale). Quote the literal red. Touch no source first.

### Step 9: PREPARE — read `src/lib/streaming-producer.js` (PQ1's real surface: `produceForPlan`, `produceAllNeeded`, `defaultDispatch`, `STAGE_AGENTS`). Read `src/lib/reachability.js` for the exact root rules and `.ctoc/reachability-roots.json`. Read `streaming-gate.js`'s `streamingGateScreen` render path. Find the count assertions with node (NOT grep — the shell grep here silently skips gitignored files). Re-derive every count from disk.

### Step 10: IMPLEMENT — the script, the `maybeKickProduction` wiring, the root declaration, the count reconciliation, and the two test files. Detached spawn, argv-safe (Step 13), never-wait.

### Step 11: REVIEW — confirm: `streaming-producer` reachable (run the analyzer); the render path returns without awaiting; no stampede; counts match disk.

### Step 12: OPTIMIZE — n/a.

### Step 13: SECURE — the detached spawn passes `root` and the script path as argv elements (execFile-style, no shell string), so a crafted path cannot inject a command. Cross-platform: `node` and the script path via `path.join`/`process.execPath`, never a hardcoded POSIX path. The producer runs `claude -p` unattended — confirm it cannot be steered by plan content into running anything but the declared agent (PQ1 already argv-guards this; verify the spawn chain end to end).

### Step 14: VERIFY — `npm test` with `FORCE_COLOR=0`, say you did. Target **fail 0**. The PQ1 files plus this wiring must together be green: reachability at 0 unreachable, counts reconciled, e2e green. The pre-demo committed baseline was fail 0 (9766); the demo pollution is cleaned; so the only deltas are PQ1+PQ2. Any residual failure is named individually with its cause.

### Step 15: DOCUMENT — update `CLAUDE.md` counts to the re-measured truth, and add one line under the streaming/Product-Loop area noting that opening the menu kicks background question generation (never-wait). Keep it to a sentence.

### Step 16: FINAL-REVIEW — report literally: the Step 8 red; all eight results; the reachability analyzer output (0 unreachable, streaming-producer alive); `npm test` totals; and — quoting the e2e test's assertions — confirm the sandboxed loop crosses a plan by sufficiency with no `approved_by`. State plainly whether `npm test` reached fail 0.

## Executor Verification (Steps 8-16)

- [x] Step 8 RED observed before source (MODULE_NOT_FOUND for produce-questions.js; `maybeKickProduction` undefined; count assertions 101≠102)
- [x] `streaming-producer.js` reachable — real analyzer reports 0 unreachable (file fence) + 0 new dead exports (export fence)
- [x] `maybeKickProduction` returns immediately, detached, never throws into render (case 3)
- [x] No producer stampede on repeated menu opens (case 4; fixed a negative-age marker flake)
- [x] e2e test: sandboxed, real producer + real downstream, asserts sufficiency cross + no approved_by (case 6)
- [x] e2e fail-closed test: one unanswered fork ⇒ no cross (case 7)
- [x] counts re-measured from disk and every ratchet reconciled (src/lib 101→102, tests 414→417 in CLAUDE.md + README + readme-numbers)
- [x] `npm test` = fail 0 (9791 pass / 0 fail / 0 skipped, coverage 99%)
