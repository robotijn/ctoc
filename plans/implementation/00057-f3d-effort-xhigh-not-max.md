---
title: "F3d — Owner ruling reversed on evidence: watchers think at xhigh, not max"
type: implementation
parent_plan: watcher-fleet-rebuild
depends_on: 00053-f3b-delete-tier-3
priority: CRITICAL
program: watcher-fleet-rebuild
iron_loop: true
files:
  - "agents/**/*.md"
  - "tests/agent-model-floor.test.js"
  - "docs/AGENT_ARCHITECTURE.md"
---

# F3d — `max` is prone to overthinking; the owner reversed on the evidence

## The ruling

Owner, 2026-07-17: **"ok let the agents have xhigh"** — reversing his earlier
"effort MAX XHIGH" after being shown Anthropic's own guidance on `max`.

This is a **reversal on evidence, not a compromise on cost.** The evidence he
acted on, from [model configuration](https://code.claude.com/docs/en/model-config),
verbatim:

> | `max` | Can improve performance on demanding tasks but **may show diminishing
> returns and is prone to overthinking. Test before adopting broadly** |

and:

> *"`max` provides the deepest reasoning with **no constraint on token spending**."*

F3c applied `max` to 91 agents — the definition of "adopting broadly" without
testing. `xhigh` is the highest level Anthropic does not caveat.

## The change

**91 agents: `effort: max` → `effort: xhigh`.** Nothing else.

The `EFFORT_EXEMPT` map from F3c stands unchanged — the same 37 agents stay
exempt for the same written reasons. Only the floor VALUE moves.

## The caveat that inverts — record it, do not act on it

`xhigh` is **not supported on every model**, and `max` is:

```
  Fable 5 · Sonnet 5 · Opus 4.8 · Opus 4.7   ->  low, medium, high, xhigh, max
  Opus 4.6 · Sonnet 4.6                      ->  low, medium, high,        max   <-- no xhigh
```

> *"If you set a level the active model does not support, Claude Code falls back
> to the highest supported level at or below the one you set. For example,
> `xhigh` runs as `high` on Opus 4.6."*

So on an older model **`xhigh` silently drops two steps to `high`, while `max`
would have held.** For older models, `xhigh` is strictly worse than `max`.

**It does not bite today**, and that is measured, not assumed: every agent
declares a model ALIAS (`opus`, `sonnet`, `haiku`) — zero pin a version. The
aliases resolve to Opus 4.8 and Sonnet 5, both of which support `xhigh`.

It becomes live the moment anyone pins `claude-opus-4-6` in an agent's `model:`.
Record this in the fence as a comment so the next author meets it before they
create it. Do NOT add a version-pin ban — that is a decision the owner has not
made, and this plan does not get to make it for him.

## Decisions Taken Under Ambiguity

1. **`max` stays in `tests/agent-modernization.test.js`'s accepted value set.**
   F3c widened that regex from `(xhigh|high|medium|low)` to admit `max`, because
   it was forbidding a value the platform documents. Nothing at `max` will remain
   after this plan, but narrowing the set back would **re-create the exact trap**
   F3c removed: the next person who legitimately sets `max` hits a red test for a
   wrong reason. A test must describe the platform's real contract, not the
   corpus's current contents.
2. **The four adversarial critics go to `xhigh` with everything else.**
   `iron-loop/{premortem,devils-advocate,red-team,gate-critic}-critic.md` were at
   `max` before F3c. Checked: they were set to `max` by an assistant in v6.12.77,
   not by the owner — so there is no prior owner ruling to preserve. "let the
   agents have xhigh" is corpus-wide and they are agents. If review disagrees,
   four one-line edits.
3. **`infrastructure/deployment-setup` keeps `effort: medium`.** F3c gave it
   `medium` (matching its sibling actuator `ci-runner-setup`) because it is an
   exempt actuator that nonetheless had to declare something. Untouched here —
   this plan moves the floor value, not the exemption set.
4. **This is a reversal, and the plan says so in the title.** F3c's file is not
   rewritten to pretend `max` never happened. The record of what was decided,
   when, and on what evidence is worth more than a tidy history. F3c stays as
   written; this plan supersedes it and cites why.

5. **Three planners LEFT `EFFORT_EXEMPT`, contradicting this plan's "the map
   stands unchanged" — taken by the executor, because disk said the plan was
   wrong.** This plan asserts 37 exemptions and 91 `xhigh` afterwards. Both
   numbers are stale. Measured with the fence's byte-0 loader: the map holds
   **32** entries (F3b removed the five scout exemptions with the scouts), and
   the corpus reaches **94** `xhigh`, not 91 — because
   `planning/implementation-planner`, `planning/product-owner` and
   `planning/vision-advisor` were ALREADY at `effort: xhigh` before F3c.

   That is invisible under a `max` floor and decisive under an `xhigh` one.
   `EFFORT_EXEMPT` is a licence to sit BELOW the floor. At `max`, xhigh was
   below it, so those three licences were live. At `xhigh` they are AT the
   floor, so the licences are dead — and the fence's own `stale` assertion
   (written by F3c, not by this plan) went red on exactly those three:
   *"EFFORT_EXEMPT justifies 3 agent(s) that already think at `xhigh`"*.

   The two ways out were to lower those three agents below `xhigh` to match
   their written reason, or to remove the three dead entries. Lowering them was
   rejected: it edits agent effort lines that are not `max`, outside this plan's
   authorized change ("91 agents: `max` → `xhigh`. Nothing else"), and it would
   demote three agents on no owner ruling. The entries were removed. **No agent
   file was touched beyond the 91.** The removal only tightens the ratchet —
   dropping one of those three below `xhigh` now requires arguing it back into
   the map in the open. The reason is recorded in the map itself so the next
   author meets it there.

## Test Plan (TDD-Red first)

Extend `tests/agent-model-floor.test.js` — the same fence F3a created and F3c
extended. Do **NOT** create a third fence file.

Write FIRST, observe RED:

1. **`every non-exempt agent declares effort: xhigh`** — flip the floor value from
   `max`. Currently 91 declare `max` → red. Failure must name each file and its
   actual value.
2. **`no agent declares effort: max`** — the corpus has no `max` after this plan.
   Currently 91 → red. **Scoped to agents only**: `max` remains a legal value in
   the platform and in `agent-modernization`'s accepted set (Decision 1); this
   asserts the corpus's current shape, not the platform's contract.
3. **`the effort exemption map still holds`** — F3c's 37 exemptions unchanged,
   each still with a written reason. Green before AND after; this plan must not
   disturb it.
4. **`every agent declares a model ALIAS, never a pinned version`** — the guard
   for the inversion above. If this ever goes red, `xhigh` may be silently running
   as `high` on that agent. Currently green (measured: `opus`, `sonnet`, `haiku`
   only). It is a **warning tripwire**, not a ban — its failure message must
   explain the two-step fallback rather than merely forbid.

## Execution Plan (Steps 8-16)

### Step 8: TEST — flip case 1's expected value to `xhigh`, add cases 2 and 4. Run. Cases 1 and 2 MUST fail (91 each). Quote the literal red. Touch no agent file before you have seen red.

### Step 9: PREPARE — re-derive from disk with the fence's byte-0 frontmatter loader, NOT `grep`. A naive `grep '^effort:'` reads values out of fenced code blocks in agent bodies and has already misled a plan author in this program once. Confirm the count is 91 and report any disagreement; disk wins.

### Step 10: IMPLEMENT — `effort: max` → `effort: xhigh` on every agent that declares `max`. One line per file. Change NOTHING else — not `model:`, not `tools:`, not `description:`, not the body.

### Step 11: REVIEW — re-derive the distribution. Zero `max`, 91 `xhigh`, exemptions untouched. Verify by byte-delta that only the effort line moved in each file: the delta must be exactly `+2` per file (`max` → `xhigh`). Any other delta means something else moved.

### Step 12: OPTIMIZE — n/a.

### Step 13: SECURE — confirm no `tools:` line moved. This edit sits adjacent to `tools:` in frontmatter; a watcher silently gaining a write tool would break the observer/observed separation the whole architecture rests on.

### Step 14: VERIFY — `node --test tests/agent-model-floor.test.js tests/agent-modernization.test.js` → green. Then `npm test` with `FORCE_COLOR=0` and say that you did. The gate was repaired this session (it had reported `fail 0` over 8 real failures); numbers are trustworthy for the first time, but only with colour off until every caller is fixed. Baseline after F3b lands: agent count drops 128 → 123, so doc-count and architecture-invariant tests move — reconcile to the new truth, re-measuring from disk.

### Step 15: DOCUMENT — `docs/AGENT_ARCHITECTURE.md` was edited by F3c to record `max` and its unbounded token spend. Correct it to `xhigh` and record BOTH the reason (Anthropic: prone to overthinking, test before adopting broadly) and the inversion caveat (xhigh is unsupported on Opus 4.6 and falls back to high, while max would hold). A future reader must not "improve" this back to `max` without meeting the evidence.

### Step 16: FINAL-REVIEW — report literally: the Step 8 red; the count changed; the four test results; `npm test` totals and the FORCE_COLOR setting. State whether any agent pins a model version (case 4) — if one does, `xhigh` is silently running as `high` there and the owner needs to know.

## Executor Verification (Steps 8-16)

- [x] Step 8 observed RED before any agent file was touched — **three** cases red at
      91 each, not the two this plan predicted: `every non-exempt agent declares
      effort: xhigh` (91), `no agent declares effort: max` (91), and `the effort
      exemption map is exhaustive and accurate` (91 unlisted). The third goes red
      because it reads `TOP_EFFORT`; it is green again after Step 10. Case 4 (model
      alias) was green at Step 8 and stayed green.
- [x] Count re-derived with the byte-0 frontmatter loader, not `grep`
- [x] Exactly 91 files changed; byte-delta histogram `{ +2: 91 }` — zero anomalies
- [ ] ~~`EFFORT_EXEMPT` untouched — 37 entries, same reasons~~ — **CORRECTED, see
      Decision 5.** The map held **32** entries, not 37 (F3b removed the five scout
      exemptions). Three planner entries were REMOVED because the fence's own stale
      assertion proved them dead once the floor moved to `xhigh`. Now 29 entries.
      No agent file was touched beyond the 91.
- [x] `max` still accepted by `agents-modernization`'s value set (Decision 1) — its
      fence case is green and non-vacuous
- [x] No third fence file created — `agent-model-floor.test.js` extended
- [x] Case 4 result stated: **no. Zero of 123 agents pin a model version** — all
      declare an alias (opus 109, sonnet 14). The `xhigh`-falls-back-to-`high`
      inversion is not live anywhere in this corpus today. The case is in place as a
      warning tripwire for the day it becomes live.
- [x] Corpus reaches **94** `xhigh`, not the 91 this plan predicted — the three
      planners of Decision 5 were already at `xhigh` before F3c. 94 + 29 = 123.
