---
title: "F3c — Every watcher thinks at max effort; fence it; unblock `max` in the test that forbids it"
type: implementation
parent_plan: watcher-fleet-rebuild
depends_on: 00051-f3a-watchers-think-with-opus
priority: CRITICAL
program: watcher-fleet-rebuild
iron_loop: true
files:
  - "agents/**/*.md"
  - "tests/agent-model-floor.test.js"
  - "tests/agent-modernization.test.js"
---

# F3c — an Opus watcher on medium effort is half a watcher

## The ruling

Owner, 2026-07-17: **"effort MAX XHIGH"** — answering directly whether `effort`
should rise alongside `model: opus`. It should, and to the top of the scale.

This is the completion of F3a. F3a fixed *which model* thinks. Nothing fixed *how
hard it thinks*, and the corpus is mostly not thinking hard.

## The defect, measured

```
model × effort across all 128 agents        opus agents below the top of the scale
  opus   | high      61                       101 of 109
  opus   | medium    32
  sonnet | medium     8                       Only 8 agents are at max or xhigh —
  opus   | low         5                      and 4 of those are the adversarial
  haiku  | low         5                      critics the owner already had set
  opus   | xhigh       4                      to max.
  opus   | max         4
  sonnet | low         3
  opus   | NONE        3   ← declares no effort at all
  sonnet | xhigh       2
  sonnet | NONE        1
```

F3a raised 25 watchers to `model: opus`. **Twenty of them are on `medium` and
five on `low`.** `security/dependency-checker` is now an Opus security watcher
thinking at `low`. `specialized/health-check-validator`, `translation-checker`,
`configuration-validator`, `quality/consistency-checker` — all `low`.

Three agents declare **no `effort` at all**, which silently inherits the session
level. A watcher whose thinking depth depends on what the human happened to set
in their terminal is not a control.

## Why `max` and not `xhigh`

The Claude Code subagent reference, verbatim:

> `effort` — *"Effort level when this subagent is active. Overrides the session
> effort level. Default: inherits from session. Options: `low`, `medium`, `high`,
> `xhigh`, `max`; available levels depend on the model."*

`max` is the top, it is documented, and it is **already in use in this corpus** on
`iron-loop/{premortem,devils-advocate,red-team,gate-critic}-critic.md` — the four
agents the owner cared most about. Nothing has ever rejected it.

## The trap under this change

`tests/agent-modernization.test.js:88`:

```js
assert.match(content, /effort:\s*(xhigh|high|medium|low)/, `${agentPath} declares effort`);
```

**That regex forbids `max`.** It is green today only because it covers a subset
(`MODERNIZED_AGENTS_PHASE_1`) that happens to contain none of the four `max`
agents. The moment a covered agent gets `max`, it goes red — for a reason that is
wrong.

Widening it to include `max` is **correcting a test that contradicts the
platform**, not loosening a ratchet: `max` is a *higher* effort than every value
the set allows. The standing rule ("a test may only change by tightening toward
real behaviour") is satisfied — the real behaviour includes `max`, and the test
denies it.

Note also the regex is unanchored (`/effort:/` not `/^effort:/m`), so it matches
an `effort:` written anywhere in a body, including inside a fenced code block.
Anchor it while widening it. That IS a tightening.

## The fix

### Part 1 — `effort: max` on every WATCHER

A watcher reads code or artifacts and emits findings. The set is defined by
exclusion (see Part 3): everything that is not an actuator, a planner, or a
scheduled deletion.

### Part 2 — the three agents with no `effort:` get one

An undeclared effort inherits the session. Name it explicitly.

### Part 3 — the fence, extended in `tests/agent-model-floor.test.js`

F3a's fence already carries a `WATCHERS` list and `SONNET_EXEMPT` /
`HAIKU_EXEMPT` maps. Extend the same file — do NOT create a second fence; that
mistake was already caught once this session (`model_optimized_for` nearly got a
duplicate, strictly weaker fence).

**Define the rule by exclusion, not enumeration.** An `EFFORT_EXEMPT` map lists
every agent permitted to be below `max`, each with a written reason. Everything
else must be `max`. A new agent therefore defaults to being a watcher and must be
*justified* to be anything else — the ratchet points the right way.

### The exemptions (each a documented choice, not an oversight)

| Group | Agents | Why exempt |
|---|---|---|
| **Actuators — they write, they do not watch** | `iron-loop/iron-loop-executor`, `iron-loop/iron-loop-integrator`, `pipeline/agent-writer`, `pipeline/agent-publisher`, `quality/complexity-reducer`, `documentation/documentation-updater`, `documentation/changelog-generator`, `infrastructure/ci-runner-setup`, `infrastructure/deployment-setup`, `testing/writers/*` (4) | Effort on an actuator is a separate decision the owner has not made. Out of scope; do not touch. |
| **Planners — they ask, they do not check code** | `planning/*` (7) | They elicit context from the human. Their effort is a separate decision. |
| **Scheduled for deletion** | `scouts/*` (5) | Plan F3b deletes Tier 3. Do not touch — F3b owns those files. |
| **Scheduled for demotion** | `saas/*` (12) | Plan W2 demotes these to skills. Raising effort on a file scheduled for deletion is waste. |

**Coordinators are NOT exempt.** `coordinator/{cto-chief,ivv-chief,synthesizer}`
are on `xhigh` today and go to `max`. The synthesizer is the aggregator — it
resolves every cross-pillar conflict in the system. If anything thinks at the top
of the scale, it does.

## Decisions Taken Under Ambiguity

*(Entries 5–7 added by the executor during Steps 8–16.)*

5. **`infrastructure/deployment-setup` gets `effort: medium`, not `max`.** Disk
   contradicts this plan: **four** agents declare no effort, not three. The fourth is
   `infrastructure/deployment-setup` (sonnet) — an exempt ACTUATOR. Test case 2 ("every
   agent declares an effort at all") is corpus-wide, so it must declare something, but the
   actuator exemption forbids `max`. Chose `medium`, the value its sibling sonnet actuator
   `infrastructure/ci-runner-setup` already carries — this NAMES the group's status quo
   rather than making the effort decision on actuators that the exemption reserves for the
   owner. The alternative was leaving it inheriting the terminal, which is the exact defect
   Part 2 exists to close.
6. **`docs/AGENT_ARCHITECTURE.md` was edited although `files:` does not declare it.**
   Step 15 directs it and the doc stated two claims this plan falsifies
   (`cto-chief: effort: xhigh` at line 75; Tier-1 `effort: high` at line 101). No test
   enforced them, so this was a silent documentation lie, not a red test. The plan's own
   `files:` list is narrower than its own Step 15 — flagged as an internal inconsistency
   in the plan, not a decision to widen scope on a whim.
7. **`testing/runners/{smoke,unit}-test-runner` now declare `model: sonnet` + `effort: max`.**
   They are not in any exemption group, so the exclusion rule raises them. Verified valid:
   Sonnet 5 supports `max`, and an unsupported level falls back rather than erroring.

1. **`max`, not `xhigh`.** The owner wrote both words. `max` is the higher of the
   two, is documented, and is already in use on the four agents he set himself.
   If `max` turns out to be unavailable for a model at runtime, the docs say
   "available levels depend on the model" without specifying a fallback — flag
   that as a real risk in the report rather than pre-emptively downgrading. Do not
   silently choose `xhigh`; if you believe `max` is wrong, stop and say so.
2. **Rule by exclusion rather than a hand-written list of ~88 watchers.** A
   90-name list is where transcription errors live, and it rots the first time
   someone adds an agent. The exemption list is ~40 names and every addition to it
   is a visible, reviewable act.
3. **The owner's ruling is applied corpus-wide, not to the 25 from F3a.** He
   answered a question scoped to those 25, so this is an interpretation. The
   justification: he called the 25-only version "half the fix" in substance by
   ruling on the principle, and leaving 61 watchers on `high` while 25 sit at
   `max` would reproduce the exact defect one layer down. **This is scope
   expansion and it is flagged here as such** — if review disagrees, the exemption
   map is one edit.
4. **`tests/agent-modernization.test.js` is widened AND anchored in one change.**
   Widening alone would leave the unanchored match, which can be satisfied by an
   `effort:` inside a fenced code block. Anchoring is a tightening and belongs
   with it.

## Test Plan (TDD-Red first)

Extend `tests/agent-model-floor.test.js`. Zero doubles — real tree, real
frontmatter, parsed anchored at byte 0 (the existing fence already does this
correctly; reuse its loader, do not write a second one).

Write FIRST, observe RED:

1. **`every non-exempt agent declares effort: max`** — failure names each file and
   its actual effort. Currently ~85 wrong → red.
2. **`every agent declares an effort at all`** — 3 declare none → red.
3. **`the effort exemption map is exhaustive and accurate`** — every agent below
   `max` must appear in `EFFORT_EXEMPT` with a non-empty reason string; an agent
   in the map that is actually at `max` is also red (a stale exemption is a lie).
   Currently red.
4. **`max is an accepted effort value in agent-modernization`** — assert the regex
   in that file admits `max` and is line-anchored. Currently red on both counts.
5. **`no exempt agent is one the owner ruled on`** — assert `EFFORT_EXEMPT`
   contains none of the 25 WATCHERS from F3a. Guards against the exemption map
   being used to quietly undo this plan.

## Execution Plan (Steps 8-16)

### Step 8: TEST — add cases 1–5. Run. Cases 1–4 MUST fail. Quote the literal red. Touch no agent file before you have seen red.

### Step 9: PREPARE — re-derive the real picture from disk; do NOT trust this plan's table. For every agent, read `model:` and `effort:` from frontmatter anchored at byte 0 (`agent-model-floor.test.js` already has a loader that does this — reuse it; a naive `grep '^effort:'` reports values from inside fenced code blocks and WILL mislead you, as it misled the author of this plan on a related field). Report any disagreement with the plan; disk wins.

### Step 10: IMPLEMENT — (a) `effort: max` on every non-exempt agent; add the line where absent, placing it directly after `model:` to match corpus convention; (b) widen AND anchor the regex in `tests/agent-modernization.test.js`; (c) extend `tests/agent-model-floor.test.js` with `EFFORT_EXEMPT` and cases 1–5. Change NOTHING else in any agent file — not `model:`, not `tools:`, not `description:`, not the body.

### Step 11: REVIEW — re-derive the distribution. Every non-exempt agent at `max`; every exempt one in the map with a reason. Verify by byte-delta that only the effort line moved in each file.

### Step 12: OPTIMIZE — n/a.

### Step 13: SECURE — confirm no `tools:` line moved. This plan edits frontmatter adjacent to `tools:`; a watcher silently gaining a write tool during an effort edit would break the observer/observed separation. Also confirm `scouts/*` and `saas/*` were NOT touched — they belong to F3b and W2.

### Step 14: VERIFY — `node --test tests/agent-model-floor.test.js tests/agent-modernization.test.js` → green. Then `npm test`. **The gate is currently being repaired in a concurrent plan (X2) because it reports `fail 0` while 8 tests fail under `FORCE_COLOR`.** Run the suite with `FORCE_COLOR=0` explicitly so your numbers are real, and say that you did. The true baseline is 8: doc-count (2), dead-export (3), iron-loop-enforcer (1), ESLint (1), typecheck (1). None are yours.

### Step 15: DOCUMENT — if `docs/AGENT_ARCHITECTURE.md` states an effort distribution this falsifies, correct it. Re-measure; never restate a count from memory.

### Step 16: FINAL-REVIEW — report literally: the Step 8 red; how many agents changed and how many were exempt; the five test results; `npm test` totals with the FORCE_COLOR setting you used. State plainly whether you believe `max` is valid at runtime, and on what evidence — if you have doubt, say so rather than downgrade silently.

## Executor Verification (Steps 8-16)

- [x] Step 8 observed RED before any agent file was touched — cases 1–4 red (87, 4, 87, regex), case 5 green
- [x] Distribution re-derived from disk with an anchored frontmatter parser, not `grep` — disk disagreed: 4 agents undeclared, not 3
- [x] `scouts/*` and `saas/*` untouched (owned by F3b and W2) — verified 0 of 17 altered
- [x] No `model:`, `tools:`, `description:`, or body content altered — model drift 0/128; `architecture-invariants` + `cto-chief-toplevel` green
- [x] `EFFORT_EXEMPT` carries a written reason for every entry — 37 entries, ≥20 chars each, asserted
- [x] `agent-modernization.test.js` regex both WIDENED (admits `max`) and ANCHORED (`/^effort:...$/m`)
- [x] `npm test` run with FORCE_COLOR=0 and that stated explicitly — `# fail 8`, the predicted baseline, none mine

### Steps 8–16 status (executor)

- [x] Step 8 TEST — cases 1–5 written first, run, RED observed and quoted
- [x] Step 9 PREPARE — corpus re-derived from disk (128 agents, anchored parser)
- [x] Step 10 IMPLEMENT — 88 agent files (87 → `max`, 1 → `medium`); regex widened + anchored; fence extended
- [x] Step 11 REVIEW — distribution re-derived; 91 at `max`; model drift 0
- [x] Step 12 OPTIMIZE — n/a per plan
- [x] Step 13 SECURE — no `tools:` line moved; `scouts/*`/`saas/*` untouched; no `$` replacement-corruption risk
- [x] Step 14 VERIFY — fences 76/76 green; `npm test` at the 8-failure pre-existing baseline, none attributable
- [x] Step 15 DOCUMENT — `docs/AGENT_ARCHITECTURE.md` corrected (2 false claims) + effort-floor section added
- [x] Step 16 FINAL-REVIEW — **BLOCKED at a human gate, not by the work.**

**Gate 2 blocker (executor, do not remove):** this plan was dispatched from
`plans/implementation/`, which is pre-Gate-2. There is no registered task id, and
`plans/in-progress/` is empty. Reaching `review/` requires implementation → todo, which is
**Gate 2 — a human gate**. The executor refused to cross it and refused to hand-move the
plan (a hand-moved plan arrives with no VERIFY evidence and Gate 3 correctly refuses it).
The code work of Steps 8–16 is complete and verified; the plan needs a human Gate 2
decision before it can be executed through the menu and produce Gate-3 evidence.
