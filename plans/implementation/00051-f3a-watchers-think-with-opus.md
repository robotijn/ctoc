---
title: "F3a — Every watcher thinks with Opus; kill the resurrected model_optimized_for; fence both"
type: implementation
parent_plan: watcher-fleet-rebuild
depends_on: none
priority: CRITICAL
program: watcher-fleet-rebuild
iron_loop: true
files:
  - "agents/**/*.md"
  - "tests/agent-model-floor.test.js"
---

# F3a — a reviewer weaker than the builder is not a reviewer

## The defect, measured

```
model declared across the 128 agents:
  opus     84
  sonnet   39
  haiku     5
```

The code writer at Step 10 is Opus. **Forty-four agents are declared to think
with a smaller model than the code they are judging was written with.** That is
backwards: the reviewer must be at least as capable as the builder, or the review
is theatre that produces a green record.

The ones that matter most:

```
security/dependency-auditor            sonnet   ← a security watcher
security/dependency-checker            sonnet   ← a security watcher
infrastructure/docker-security-checker sonnet   ← container SECURITY
architecture/dependency-analyzer       sonnet   ← the architecture watcher
specialized/accessibility-checker      sonnet   ← the ONLY agent owning Dimension 11
quality/complexity-analyzer            sonnet   ┐
quality/dead-code-detector             sonnet   │ five of the eleven
quality/duplicate-code-detector        sonnet   │ quality watchers
quality/type-checker                   sonnet   │
quality/consistency-checker            sonnet   ┘
testing/coverage-enforcer              sonnet
testing/coverage-mapper                sonnet
```

Owner ruling, 2026-07-17, verbatim: **"A scout is NOT A STUPID REGEX WITH HAIKU,
IT IS AN OPUS THINKING ABOUT THE CODE. CTO Chief dispatches real agents to check
on the code and aggregates the information, then steers the build."**

`model_optimized_for` — the field this repo deleted corpus-wide as a category
error (it conflated the model that AUTHORED an artifact with the model that
EXECUTES it) — was the symptom. `model:` is the disease.

## The second defect: the deletion was never ratcheted

`model_optimized_for` is back in **26 files**. An 85-agent `git restore` from an
older commit resurrected it, and **the full suite did not notice** — the 9
current failures include nothing about it. The field was deleted by an edit, not
by a fence, so nothing held the line. Deleting it again without a fence would
reproduce this exact defect the next time anyone restores from history.

The 26:
```
iron-loop/    iron-loop-integrator, iron-loop-executor, iron-loop-critic
pipeline/     agent-publisher, agent-critic, agent-writer, agent-tester, agent-qa
scouts/       syntax-scout, dep-scout, lint-scout, secret-scout, test-scout
coordinator/  synthesizer, cto-chief, ivv-chief
planning/     product-owner, unit-economics-modeler, stack-chooser, vision-decomposer,
              kpi-planner, implementation-planner, vision-advisor
compliance/   eu-solution-recommender, eu-ai-act-agent, gdpr-agent
```

## The fix

### Part 1 — `model: opus` on all 25 sonnet WATCHERS

A **watcher** is an agent that reads code or artifacts and emits findings. These
25 change `model: sonnet` → `model: opus`. Nothing else in the file changes.

```
architecture/dependency-analyzer          quality/type-checker
compliance/license-scanner                security/dependency-auditor
devex/api-deprecation-checker             security/dependency-checker
devex/onboarding-validator                specialized/accessibility-checker
frontend/bundle-analyzer                  specialized/api-contract-validator
frontend/component-tester                 specialized/configuration-validator
frontend/visual-regression-checker        specialized/health-check-validator
infrastructure/ci-pipeline-checker        specialized/observability-checker
infrastructure/docker-security-checker    specialized/translation-checker
quality/complexity-analyzer               testing/coverage-enforcer
quality/consistency-checker               testing/coverage-mapper
quality/dead-code-detector                versioning/feature-flag-auditor
quality/duplicate-code-detector
```

### Part 2 — delete `model_optimized_for` from all 26 files

Delete the whole line. Change nothing else in those files.

### Part 3 — the fence (`tests/agent-model-floor.test.js`)

Two ratchets, so neither defect can return silently.

## Explicitly NOT changed, and why

These stay `sonnet`. Each is a documented choice, not an oversight:

| Agent | Why it stays |
|---|---|
| `planning/product-owner`, `planning/vision-advisor` | They ask the human questions to build context. They do not read code and emit findings. Out of scope for this plan; if the owner wants them raised, that is a separate decision. |
| `documentation/changelog-generator`, `documentation/documentation-updater` | Actuators — they write docs. Not watchers. |
| `infrastructure/ci-runner-setup`, `infrastructure/deployment-setup` | Actuators — they configure. Not watchers. |
| `saas/*` (6 sonnet) | The ~46-role roster demotes all 12 saas agents to skills (plan W2). Raising the model on a file scheduled for deletion is waste. |
| `testing/runners/smoke-test-runner`, `testing/runners/unit-test-runner` | See Decision 2. |
| `scouts/*` (5 haiku) | Tier 3 is deleted wholesale by plan F3b, which touches `src/`, `tests/` and `docs/`. Deleting them here would leave dangling references outside this plan's file scope. |

## Decisions Taken Under Ambiguity

1. **"Watcher" is defined as: reads code or artifacts, emits findings.** The
   corpus has no `type: watcher` marker, so the boundary is judgement. The 25 are
   listed literally above rather than derived by a name pattern, so the executor
   never guesses. If a name looks like a watcher but is not on the list, it is not
   in scope — do not add it.
2. **The two sonnet test runners stay sonnet.** They execute a command and report
   its output; `smart-test-runner` (already opus) owns flaky-test judgement above
   them. This is a real call that could be wrong — flagged here for review rather
   than silently made. If review disagrees, they are a one-line change.
3. **`model_optimized_for` is removed from all 26, including the 5 scouts that
   F3b will delete.** Redundant for those five but harmless, and it keeps the
   fence assertion "zero occurrences corpus-wide" true the moment F3a lands,
   without a dependency on F3b's timing.
4. **The fence pins an explicit list of exempt agents rather than inferring
   intent.** A test that guesses which agents are allowed to be sonnet would rot
   the first time someone adds one. The exemption list is data in the test, and
   adding to it is a visible, reviewable act.
5. **Test case 1 was DROPPED — this plan's premise for it was false.** The plan
   says the `model_optimized_for` deletion "was never ratcheted" and that "the
   full suite did not notice". Both are wrong, verified on disk at execution
   time: **`tests/no-model-optimized-for.test.js` already exists**, already
   carries a non-vacuity guard, already covers `skills/**` as well as
   `agents/**`, and was already RED at 26 occurrences. The fence worked; nobody
   read the red. Writing case 1 would have been a second, strictly weaker fence
   on one invariant — which is worse than none, because the next author edits
   whichever copy they find first. Part 2 is verified by the existing fence
   (now green), not by a new one. Confirmed independently by the coordinator
   mid-execution.
6. **The real, unfenced gap was `model:` itself** — that is what
   `tests/agent-model-floor.test.js` now asserts (cases 2-5), and it is the
   genuine deliverable of this plan.

## Test Plan (TDD-Red first)

New file `tests/agent-model-floor.test.js`. Zero doubles — it walks the real
`agents/` tree and reads real frontmatter. Write these FIRST and observe each RED:

1. **`no agent anywhere declares model_optimized_for`** — walk every
   `agents/**/*.md`, assert zero matches for `/^model_optimized_for:/m`. The
   failure message must name every offending file. Currently **26** → red.
   *This is the ratchet the original deletion never had.*
2. **`every watcher declares model: opus`** — for each of the 25 named agents,
   assert `model: opus`. Failure names each file and its actual model.
   Currently 25 wrong → red.
3. **`no agent declares model: haiku except the documented Tier-3 exemption`** —
   pins the 5 scouts as the ONLY haiku agents, by name. Currently green; it goes
   red the moment F3b deletes them, which is the correct signal to update it in
   F3b, not a failure to paper over here.
4. **`the sonnet exemption list is exhaustive`** — every agent declaring
   `model: sonnet` must appear in an explicit `SONNET_EXEMPT` list in the test,
   each with a one-line reason string. A new sonnet agent fails the build until
   someone justifies it in writing. Currently red (25 unlisted).
5. **`every agent declares a model at all`** — no agent may omit `model:`, since
   omitting it silently inherits the session model and the floor becomes
   unenforceable. Note: `model: opus|sonnet` appears once in the corpus — treat a
   non-single value as a failure and name it.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/agent-model-floor.test.js` with all five cases. Run it. Confirm cases 1, 2, 4 (and 5 if the `opus|sonnet` agent trips it) FAIL. Quote the literal red output. Do not touch a single agent file before you have seen red.

### Step 9: PREPARE — re-derive both lists from disk, do NOT trust this plan's transcription: `grep -rlE '^model_optimized_for:' agents --include='*.md'` and `grep -rlE '^model: sonnet' agents --include='*.md'`. If disk disagrees with the plan, disk wins — report the difference and proceed on disk.

### Step 10: IMPLEMENT — two mechanical edits per file, no more. (a) On the 25 watchers: `model: sonnet` → `model: opus`. (b) On the 26: delete the `model_optimized_for:` line. Change NOTHING else — not the description, not the body, not a single other frontmatter key. Read each file before editing it.

### Step 11: REVIEW — re-run the greps from Step 9. `model_optimized_for` → zero hits. The 25 → opus. Confirm no file's byte count changed by more than the edit accounts for. Spot-read three edited files in full and confirm only the intended lines moved.

### Step 12: OPTIMIZE — n/a. Frontmatter has no hot path.

### Step 13: SECURE — confirm no agent's `tools:` line was touched. A watcher gaining a write tool during a model edit would silently break the observer/observed separation this system rests on.

### Step 14: VERIFY — `node --test tests/agent-model-floor.test.js` → all five green. Then `npm test` → the full gate. NINE failures are pre-existing and NOT yours: ESLint (`ALLOWED_TOOLS is not defined` in `.ctoc/sweep-watchdog.js`), 3 typecheck errors, dead-export count 104 vs baseline 102, doc-count drift 404 vs 408, and an iron-loop-enforcer test echoing the dead-export fence. Report the exact totals. Any failure beyond those nine is yours — including any existing test that asserted a specific agent's model.

### Step 15: DOCUMENT — if `docs/AGENT_ARCHITECTURE.md` or `CLAUDE.md` states a model distribution that this change falsifies, correct it to what disk now says. Do not restate counts from memory; re-measure.

### Step 16: FINAL-REVIEW — report literally: the Step 8 red output, the count of files changed per part, the five test results, `npm test` totals, and whether the failure count moved off 9. If any pre-existing test broke because it asserted `model: sonnet` on a watcher, say so and FIX THE TEST TOWARD THE NEW TRUTH — do not revert the agent to keep an obsolete assertion green.

## Executor Verification (Steps 8-16)

- [x] Step 8 tests written and observed RED before any agent file was touched
      (3 of 6 cases red; red output quoted in the execution report)
- [x] Lists re-derived from disk at Step 9, not copied from this plan
      (disk AGREED with the plan: 26 dead-field files, 39 sonnet = 25 watchers + 14 exempt)
- [x] Exactly 25 files changed sonnet→opus; exactly 26 lost `model_optimized_for`
      (51 files touched; opus 84→109, sonnet 39→14, haiku 5 unchanged; 0 occurrences remain)
- [x] No `tools:`, `description:`, or body content altered anywhere
      (editor asserted <=1 changed line per file; every byte delta was exactly -2 or -30)
- [x] `npm test` totals reported literally, with any new failure named
      (tests 9690, pass 9682, fail 8, skipped 0, coverage 99.07%; 9→8, no new failure)

### Findings for review (raised by execution, NOT fixed — all outside this plan's `files:`)

- **`src/scripts/test-gate.js` is blind to failures when output is colored.** Its
  summary regexes are anchored (`/^\s*(?:#|ℹ)\s+fail\s+(\d+)/gm`), but this
  environment sets `FORCE_COLOR=3`, so the spawned child emits
  `ESC[34mℹ fail 8` — the anchor never matches. The gate therefore printed
  `failed 0, skipped 0` **while 8 tests were failing**, and exited non-zero ONLY
  because the coverage-null guard tripped. Strip ANSI before parsing and the same
  text yields `fail: 8`, `coverage: 99.07`. This is a false-green hazard in the
  gate that is supposed to prevent false green: if coverage ever parses while
  color is on, `npm test` reports GREEN over real failures and real skips.
- Step 15 found **nothing to correct**: no doc states a model distribution this
  change falsifies. `docs/AGENT_ARCHITECTURE.md:56` calls Tier 2 "opus/sonnet",
  which stays true (14 sonnet remain), and its scouts/haiku claim is untouched.
- `agents/quality/type-checker.md` (and peers) still declare `effort: medium`
  alongside the new `model: opus`. Raising the model without the effort budget may
  be half the intended change. Out of scope here — flagging, not guessing.
