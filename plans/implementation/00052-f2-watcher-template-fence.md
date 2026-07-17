---
title: "F2 — The watcher template: one page, one lens, one shape, fenced by a ratchet"
type: implementation
parent_plan: watcher-fleet-rebuild
depends_on: none
priority: CRITICAL
program: watcher-fleet-rebuild
iron_loop: true
files:
  - ".ctoc/templates/watcher.md"
  - ".ctoc/watcher-baseline.json"
  - "tests/watcher-shape.test.js"
---

# F2 — sharp for the model and legible to a human are the same constraint

## Why this exists

Owner's question, 2026-07-17: *"how can we keep the watchers as sharp as
possible, and understandable for humans. that was the goal of the agents i
created. they pay attention to different aspects and me, as a human can
understand the role of the watcher."*

Those are not two goals in tension. They are one constraint:

- **The body IS the watcher's entire system prompt.** The Claude Code subagent
  reference: *"Subagents receive only this system prompt plus basic environment
  details... not the full Claude Code system prompt."* `dependency-analyzer`
  starts life with 1134 lines and nothing else.
- **Long prompts blunt the model.** Length degradation comes from attention
  dilution — a fixed attention budget spread across more tokens — compounded by
  position sensitivity, where models retrieve best from the beginning and end and
  degrade for anything buried in the middle.
- So the 753-line `code-reviewer` is unreadable by the owner AND blunt for the
  model, for one reason. One fix, both halves.

## The measured defect

```
agents with ## Trigger or ## Blocking Rules ……  21 / 128
agents with ## Role …………………………………………………… 104 / 128
```

107 of 128 have no stated trigger and no stated blocking rule. They describe;
they do not watch.

And the section vocabulary is fragmented, which is what actually defeats a human
eye at this count:

```
blocking:  ## Blocking Rules (12) · ## Red Lines (NEVER Compromise) (6) · ## When to Block vs Warn (11)
checks:    ## Checks (14) · ## What to Check (12) · ## What you check (3) · ## Metrics · ## Detection Methods (4)
output:    ## Output Format (72) · ## Output Format (MANDATORY) (15) · ## Output (6) · ## Output Contract (5)
```

Four names for one section. **At 46 sensors feeding one aggregator, the shape is
not cosmetics — it is the wire protocol.** The synthesizer normalizes findings to
a `(pillar, file, line)` coordinate; it cannot do that if each sensor emits a
different shape.

## The template

Written to `.ctoc/templates/watcher.md`. Roughly 40 lines. A human knows the
role in twenty seconds; the model's attention goes to the check that fired
instead of to four manuals it did not need.

```markdown
---
name: <role-a-department-would-hire>       # application-security-engineer, not secrets-detector
description: <routing rule — what it watches, when to dispatch it, what it does NOT do>
tools: Read, Grep                           # a watcher NEVER writes
model: opus                                 # the reviewer is never weaker than the builder
effort: high
skills:                                     # THE LENS — native preload, used every run
  - <the-one-skill-it-always-uses>
color: <pillar colour>
maxTurns: <bound>
---

# What I watch
<one paragraph — the lens, and nothing else>

## Trigger
- Dispatched by cto-chief when: <the situation>
- Standing: <the thing that fires when nobody asks>

## What I Report
- critical: <...>
- high: <...>
- medium: <...>
Findings go to cto-chief as a `dispatch_response` per
`.ctoc/architecture/dispatch-schema.yaml`. I do NOT decide consequence — the
aggregator does, because only it sees the other forty-five and only it can
resolve a cross-pillar conflict.

## What I Borrow
<skills invoked lazily through the Skill tool when a finding needs them — never preloaded>

## Anti-Scope
<what I do NOT do, and which watcher does>
I never edit code. Read and Grep only.
```

### The three rules the template encodes

1. **Depth lives in the skill, not the body** (owner decision, hybrid): the lens
   skill is preloaded via the native `skills:` field; borrowed skills are invoked
   lazily. This is why the body can be one page at all.
2. **A watcher reports; the aggregator decides** (owner ruling): *"the watchers
   tell the cto chief agent, the aggregator, what they see and the aggregator
   tells the code writer and the test writer what to focus on."* There is no
   `## Blocking Rules` section, because a watcher blocking unilaterally would be
   making a cross-pillar call it cannot see.
3. **The output schema is referenced, never restated.**
   `.ctoc/architecture/dispatch-schema.yaml` already defines `finding` with
   `severity · type · file · line_range · message · confidence · citations`.
   Forty-six copies of that schema is the duplication that rots. One source.

## The fence — a ratchet, not a cliff

`tests/watcher-shape.test.js` + `.ctoc/watcher-baseline.json`.

The corpus cannot conform today — 128 agents predate the template and the rewrite
is plan W1. A fence that demands conformance now would be red forever and get
disabled, which is worse than no fence. So it ratchets, exactly like the coverage
floor and the reachability baseline:

```json
{
  "conforming": ["<agents that match the template exactly>"],
  "legacy":     ["<agents not yet rewritten — this list may ONLY shrink>"],
  "note": "Every agent is in exactly one list. A NEW agent file must be conforming."
}
```

- Every agent in `conforming` matches the template exactly, or red.
- `legacy` may only shrink. Adding to it is red. **This is the ratchet.**
- A file in neither list is red — no agent may be silently uncatalogued.
- W1 moves names from `legacy` to `conforming` one at a time, and the fence
  proves each one landed.

## Decisions Taken Under Ambiguity

1. **`# What I watch` replaces `## Role`.** `## Role` appears on 104 agents and
   is where the sprawl starts — it invites a description of a job rather than a
   statement of a lens. Renaming it is a forcing function, and the fence checks
   the literal heading text so the old habit cannot creep back under the old name.
2. **No `## Blocking Rules` section at all**, rather than keeping it as advisory.
   Owner ruling: the watcher reports, the aggregator decides. A section named
   "Blocking Rules" would keep telling every future author that a watcher blocks.
3. **The body cap is 80 lines and it is a hard test assertion.** The number is a
   judgement, not a measurement — the honest justification is that the 26
   newly-written watchers land at 188–258 lines *with the depth inlined*, and
   moving depth to `skills:` removes roughly that much. 80 is one screen. If W1
   finds a watcher that genuinely cannot fit, that is a finding about the roster
   (the role is two roles), not a reason to raise the cap.
4. **`.ctoc/watcher-baseline.json` seeds with `conforming: []`.** No agent
   conforms yet, and seeding it with near-misses would make the fence lie on day
   one. An empty conforming list is honest and the ratchet still binds.
5. **The template is data under `.ctoc/`, not prose in a doc.** A template a test
   can read is a contract; a template in `docs/` is a suggestion.

### Added by the executor at Step 10 (2026-07-17) — decisions beyond the written spec

6. **The ratchet is a numeric `maxLegacy` ceiling, not a git diff.** The plan says
   "compare against the committed baseline", which implies reading git history. The
   executor was forbidden from running any git command (two agents held uncommitted
   work in the tree), and a fence that shells out to git is also slow and breaks in
   a shallow clone. So `legacy` may only shrink is enforced exactly as
   `reachability-baseline.json` does it: the baseline declares `maxLegacy: 128` and
   the fence asserts `legacy.length <= maxLegacy`. Adding a name makes 129 > 128 →
   red. Removing one passes, and the author lowers the ceiling to bank the progress.
   A second assertion pins `maxLegacy <= (agent files on disk)` so the ceiling
   cannot drift upward. Same ratchet, no git, self-contained.
7. **Bash and Task are banned alongside the four write tools.** The plan names only
   `Write, Edit, MultiEdit, NotebookEdit`. But `bash -c 'echo x > file'` mutates the
   observed exactly as `Edit` does, and `Task` dispatches an agent that can write —
   so a fence banning only the four would have let a watcher keep full mutation
   capability through Bash and still called it conforming. This is a strengthening,
   not a widening. It is not hypothetical: `agents/security/threat-modeler.md`
   declares `tools: Bash, Read, Grep, Glob` today.
8. **`Glob` and `Skill` are permitted beyond `Read, Grep`.** The template declares
   `tools: Read, Grep`, but a literal exact-match fence would reject `Glob`, which is
   pure read-only enumeration that three recently-written watchers
   (`fmeda-analyzer`, `threat-modeler`, `wcet-budget`) use deliberately, and would
   reject `Skill`, which the template's own `## What I Borrow` section REQUIRES to
   invoke a borrowed skill lazily. The fence therefore requires `Read` and `Grep`,
   bans anything mutation-capable, and allows only that read-only allowlist.
   **Open question for W1, not resolved here:** whether lazily invoking a borrowed
   skill needs `Skill` declared in `tools:` at all, or whether the native `skills:`
   preload plus the Skill tool is available implicitly. The executor could not verify
   this against the Claude Code reference and did not guess in the template — the
   template ships `tools: Read, Grep` exactly as the plan wrote it.

## Test Plan (TDD-Red first)

`tests/watcher-shape.test.js`. Zero doubles — walks the real `agents/` tree and
reads the real baseline. Write FIRST, observe RED:

1. **`.ctoc/templates/watcher.md` exists and itself matches the shape it defines** —
   the template is the first conforming artifact, or it is not a template.
   Currently ABSENT → red.
2. **`every agent is in exactly one baseline list`** — set equality between the
   real tree and `conforming ∪ legacy`; failure names every uncatalogued file.
   Currently red (no baseline).
3. **`legacy may only shrink`** — compare against the committed baseline; a name
   added to `legacy` is red. This is the ratchet.
4. **`every conforming agent matches the template exactly`** — the five headings,
   literal text, in order; body ≤ 80 lines; `tools:` contains no write tool
   (`Write`, `Edit`, `MultiEdit`, `NotebookEdit`); `model: opus`; a `skills:` key
   present. Vacuously green while conforming is empty — case 5 is what stops that
   being a hole.
5. **`the conforming list is not empty once W1 begins`** — a soft marker asserting
   the baseline records a `w1_started` boolean, and when true, conforming must be
   non-empty. Prevents the fence sitting green-and-vacuous forever.
6. **`no conforming agent restates the dispatch schema`** — assert the body does
   not inline `dispatch_response` field definitions; it must reference
   `.ctoc/architecture/dispatch-schema.yaml` by path. One source of truth.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/watcher-shape.test.js` with all six cases. Run it. Cases 1 and 2 MUST fail (no template, no baseline). Quote the literal red output. Do not create the template until you have seen red.

### Step 9: PREPARE — read `.ctoc/architecture/dispatch-schema.yaml` IN FULL so the template references real field names, not invented ones. Read three of the newly-written watchers (`agents/safety/fmeda-analyzer.md`, `agents/security/threat-modeler.md`, `agents/realtime/wcet-budget.md`) to see the seven-section shape the corpus converged on, and carry across what earns its place — especially the *standing trigger* concept ("the thing that fires when nobody asks").

### Step 10: IMPLEMENT — write the three files: `.ctoc/templates/watcher.md`, `.ctoc/watcher-baseline.json` (conforming: [], legacy: every agent currently on disk, w1_started: false), `tests/watcher-shape.test.js`.

### Step 11: REVIEW — re-read the template. Confirm it is ≤ 80 lines, references the dispatch schema by path rather than restating it, declares `tools: Read, Grep`, and carries no `## Blocking Rules`.

### Step 12: OPTIMIZE — n/a.

### Step 13: SECURE — confirm the template's `tools:` line grants no write capability, and that the fence asserts this for every conforming agent. A watcher that can edit the code it watches breaks the observer/observed separation the whole system rests on. This assertion is the load-bearing one in the file.

### Step 14: VERIFY — `node --test tests/watcher-shape.test.js` → all six green. Then `npm test`. NINE failures are pre-existing and NOT yours: ESLint (`ALLOWED_TOOLS is not defined` in `.ctoc/sweep-watchdog.js`), 3 typecheck errors, dead-export count 104 vs baseline 102, doc-count drift 404 vs 408, and an iron-loop-enforcer test echoing the dead-export fence. Report exact totals; anything beyond those nine is yours.

### Step 15: DOCUMENT — n/a for this plan. `docs/AGENT_ARCHITECTURE.md` describes a 4-tier architecture that plan F3b changes; do not touch it here or the two plans will collide.

### Step 16: FINAL-REVIEW — report literally: the Step 8 red output, the template in full, the baseline's legacy count, the six test results, and `npm test` totals. State plainly that `conforming` is empty and that case 4 is therefore vacuous today — that is by design and case 5 is the guard, but say it rather than let the green imply coverage that does not exist yet.

## Executor Verification (Steps 8-16)

- [x] Step 8 observed RED before the template existed — all six cases red; cases 1
      and 2 red on literal absence ("`.ctoc/templates/watcher.md` is ABSENT",
      "`.ctoc/watcher-baseline.json` is ABSENT"). Template written only after.
- [x] Template ≤ 80 lines and references the dispatch schema by path, not by copy —
      body is 47 lines; cites `.ctoc/architecture/dispatch-schema.yaml` and restates
      no field. Field names were read from the real schema at Step 9 before writing.
- [x] Template declares `tools: Read, Grep` — no write tool anywhere. Fence bans
      `Write, Edit, MultiEdit, NotebookEdit` plus `Bash` and `Task` (decision 7).
- [x] Baseline catalogues EVERY agent on disk (128 in `legacy`, `maxLegacy: 128`);
      `conforming` is empty and the baseline comment, the test header, and this
      report all say so out loud — case 4 is VACUOUS today by design.
- [x] `agents/` NOT touched by this plan — read only, never written. No git command
      was run at any point.
- [x] Fence proven to bite, not merely green: mutation-tested all four ratchet
      assertions (add to legacy → red; drop from legacy → red; `w1_started: true`
      with empty conforming → red; promote `threat-modeler` to conforming → red,
      naming Bash, the missing headings, `## Blocking Rules`, and the 193-line body).
