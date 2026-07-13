# Handoff — CTOC rebuild: the background engine (foundations phase)

<!-- Maintained by the `handoff` skill. Left by the previous Claude instance so
     the next one (claude or claudex) can continue. Treat as last-known state —
     verify against the repo before acting. -->

- Updated: 2026-07-14 01:45 by claude
- Branch: main
- Status: in progress

## Goal

Reach CTOC's actual goal — the best implementation system on the planet, from
vision to WORKING app — under the human's objective function: minimize the
human's time, maximize steering (intent transferred per human minute), build
incrementally. The approved direction is the background-engine rebuild: dissolve
the four internal stage-gates into question-driven flow (ASK-FIRST — an
unanswered question is a red flag; real forks block their own subtree and ask),
keep exactly two human ship gates (git push, deploy), run everything else in the
background while the human answers a value-ranked question queue. Vision:
`plans/vision/ctoc-background-engine-rebuild.md` (amended after a nine-attack
brutal critique; ship gates + foundations-first sequencing DECIDED by the human).

## Current status

- Done (v6.12.1, pushed, `332f121`):
  - Five adversarial critics audited "is the goal reached" — all five returned
    NO with file:line evidence (greenfield journey, orchestration, unwired
    machinery, last mile, human papercuts). Verdicts summarized in the vision.
  - ROOT CAUSE fixed structurally: ~92 of 192 src files were unreachable from
    every live root because "module + its own test" counted as done (a test IS
    a caller). Now: **dead code ZERO (139/139 reachable)**, enforced by the
    ratcheting fence `src/lib/reachability.js` + `tests/reachability.test.js`
    (no file may EVER join the unreachable set; a test is never a root;
    instruction surfaces — command/agent/skill markdown, CI workflows — count
    as roots because the session model executes them).
  - THE LAST MILE: `src/lib/app-runner.js` wired into Step 14 — the pipeline
    LAUNCHES the built app (real dev-server boot, real HTTP response, teardown);
    broken app fails the gate; libraries honestly not-applicable.
  - THE SHIPPABLE PIPELINE: `completeExecution` machine-writes Gate 3 verify
    evidence (failing → `passed:false` → gate refuses); circuit breaker live in
    the kickback path, escalations surface on the dashboard inbox.
  - STEP 13 SECURE real: secrets-scanner + sast-runner + dependency-auditor
    wired into `/ctoc:push`; planted secret ⇒ CRITICAL ⇒ blocked; missing tools
    skip LOUDLY.
  - Generator fixed: executor/critic ladders renumbered to canonical 8–16;
    executor Step 10 = "WIRE IT", Step 14 runs the fence; critic REJECTS
    deferred wiring; implementation-plan template has a mandatory "Wiring — the
    live call sites" table; planner asks a QUESTION when it can't name the call
    site. Operating lessons 15 (ask before you build) + 16 (wired is done)
    propagate into every project's CLAUDE.md.
  - Suite 5431/0/0 (dropped from 5890 — deleted dead code took its exclusive
    tests), eslint clean, typecheck ratchet 85→64, reachability baseline at 0.
  - Earlier same arc (all pushed): v6.10.4 audit-remediation wave (41 slices:
    real enforcement denies, ledger-backed unforgeable gates, durable logs),
    v6.11.x ask-me-questions skill + live evaluation harness (claude-binary
    transport, first live scenario PASSED) + manifest hotfix (fragments at
    skills/agent-fragments/, no `agents` manifest field — the live validator
    rejects directory arrays).
- In progress: nothing mid-flight; clean checkpoint. All background agents
  landed and their work is committed.
- Next: Layer F foundations of the vision, in the human's decided order —
  see Resume here.

## Key decisions (human's, do not relitigate)

- **Ship gates**: push + deploy STAY as the two human gates; the four internal
  stage-gates dissolve into question-driven flow. (2026-07-14)
- **Ask-first beats speculation**: unanswered questions are red flags; the
  system asks BEFORE building; guessing is the defect. Real forks block their
  subtree. Speculation only below the question floor, on branches, unmergeable
  until question-free. (2026-07-14, overrules the vision's first draft)
- **Foundations first, then engine** (Layer F before Layer E). (2026-07-14)
- **No dead code, no unreachable code — rewire or delete, no third state.**
  Done; the fence keeps it. (2026-07-14)
- **Fix the failures, not the tests** (lesson 14); test changes only when the
  test is plain wrong, tightening only. (2026-07-13)
- CTOC's runtime is the Claude CLI — model-calling features spawn
  `claude -p --output-format json` on session auth; never a raw key. (2026-07-13)
- Patch version bumps by default; minor/major only when the human says so.

## Open questions / blockers

- None blocking. The remaining Layer F items are scheduled work, not questions.

## Gotchas

- The reachability fence counts INSTRUCTION SURFACES as roots (command specs,
  agents/**/*.md, skills/**/SKILL.md, .github/workflows) — full `src/...js`
  path mentions only, basenames don't count. If you add a src module, wire it
  to a live root in the SAME change or the suite fails (that is the point).
- `.ctoc/reachability-baseline.json` is a ratchet locked at zero — never add
  entries. Same for `.ctoc/typecheck-baseline.json` (64) and
  `.ctoc/coverage-baseline.json` (floor 40): move only in the tightening
  direction.
- The plugin cache the user RUNS is `~/.claude/plugins/cache/robotijn/ctoc/`,
  separate from this repo; `/ctoc:update` syncs it from GitHub. A session that
  loaded a broken manifest keeps its stale command registry until a FULL
  restart (not `/reload-plugins`).
- The plugin manifest `agents` field accepts ONLY an array of FILE paths —
  every directory form is "Invalid input" and an invalid manifest disables the
  ENTIRE plugin. CTOC ships NO agents field (default discovery of agents/);
  shared prompt fragments live at `skills/agent-fragments/`, never under
  agents/.
- `npm test` routes through `src/scripts/test-gate.js` (coverage-gated);
  `npm run test:raw` is the bare suite. `npm run typecheck` is the ratchet
  test, `typecheck:raw` the bare compiler (which exits non-zero by design
  while known inference artifacts remain).
- The task-registry scheduler still forbids parallel implement tasks
  (plan-serial rule) — overriding it manually was sanctioned by the human for
  the file-disjoint wave pattern; F1 makes the scheduler itself do this.
- Background subagents must be briefed: verify only their own tests, leave
  everything unstaged, no git ops; the caller runs the integrated suite at the
  wave boundary and reconciles baselines ONCE there.

## Key files

- `plans/vision/ctoc-background-engine-rebuild.md` — the rebuild vision: five-
  critic verdict, amended design, Layer P/F/E/S program with dependencies.
- `src/lib/reachability.js` + `tests/reachability.test.js` +
  `.ctoc/reachability-baseline.json` — the dead-code fence (ratchet at zero).
- `src/lib/app-runner.js` + `src/lib/step-13-verify.js` — the last mile
  (launch-and-drive at Step 14) and verify-evidence machinery.
- `src/lib/actions.js` — completeExecution (evidence + circuit breaker wired),
  approvePlan (STILL VALIDATES NOTHING — F3 fixes this), startAgent (still
  briefless — F4).
- `src/lib/task-registry.js` — the scheduler; F1's main change surface
  (plan-serial → file-based, atomic add-and-claim, `sync` barrier kind,
  `cancel` transition).
- `src/lib/quality-agent.js` — the live quality path (now with real security
  scanners).
- `agents/iron-loop/iron-loop-executor.md`, `iron-loop-critic.md`,
  `agents/planning/implementation-planner.md`,
  `.ctoc/templates/implementation-plan.md.template` — the fixed generator
  (wiring mandatory, ladder 8–16).
- `.ctoc/templates/operating-lessons.md` — lessons 1–16 (13 no-abbreviations,
  14 fix-failures-not-tests, 15 ask-first, 16 wired-is-done).
- `evals/` — the live evaluation harness (claude-binary transport).
- Memory: `~/.claude/projects/-Users-doctony-Code-ctoc/memory/` —
  `principle_wired_is_done.md`, `feedback_ask_before_build.md`,
  `feedback_fix_failures_not_tests.md`, `project_ctoc_runtime_is_claude_cli.md`.

## Resume here

Start Layer F of the vision (foundations, human-decided order), next items:

1. **F1 wave orchestration** in `src/lib/task-registry.js` + `src/lib/actions.js`:
   replace kind-based plan-serial with file-based serialization (make `touches`
   mandatory for implement tasks so Rule 4 file-conflict is the serializer);
   atomic add-and-claim (close the record-vs-start blind window); translate plan
   `files:`/`depends_on:` frontmatter into task `touches`/`blockedBy`
   automatically; wire the dormant `sync` task kind as the wave integration
   barrier; add a `cancel` status transition; retire `startAgent`'s global
   one-plan lock. The orchestration critic's minimal-change sketch is in the
   vision; invariants to keep: ≤5 concurrent, git-exclusive, human ship gates
   untouched.
2. **F3 validation in the action layer**: `approvePlan` and every transition
   consults the validators + gate-order (ONE gate-rule encoding — actions.js
   flowMap and gate-order.js currently disagree-capable); remove "Approve
   anyway" from the recommended slot.
3. **F4 brief assembly in code**: dispatching a plan builds the brief —
   plan content + full ancestry + related plans via the hybrid index
   (`src/lib/plan-index`) + completion contract — replacing menu.md's prose
   recipe.
4. Then F7 answer persistence + F8 papercuts (the papercut critic's ranked
   list is reproduced in the vision's Layer F section).

Work test-first through the iron loop, one-plan-per-agent background executors
with file-disjoint partitions, integrated suite + baseline reconcile + commit at
the wave boundary. Everything above is already committed and pushed — start
clean from `332f121`.
