# Handoff — CTOC: build the watcher layer; the gate is "enough information"

<!-- Maintained by the `handoff` skill. Left by the previous Claude instance so
     the next one (claude or claudex) can continue. Treat as last-known state —
     verify against the repo before acting. VERIFY EVERY CLAIM IN THIS FILE
     AGAINST DISK, INCLUDING THIS FILE. A previous version of it confidently
     named a bug that did not exist. -->

- Updated: 2026-07-17 11:30 by claude
- Branch: main
- Status: in progress

## ⛔ THE ARCHITECTURE (owner's words — this governs everything)

> **"i had 86 agents focussing on different topic like architecture, security etc. THEY ARE
> WATCHING THE BUILD. they have skills that they might reuse from others. SKILLS CANNOT WATCH A
> BUILD, THEY ARE USED BY AN AGENT. so what you created is a monster not a decent ctoc system"**
>
> **"AN AGENT USES SKILLS. IT IS A HIGHER LEVEL SKILL WITH MORE COMPLEX FEATURES, LIKE A FUNCTION
> (SKILL) IS PART OF A CLASS (AGENT) WHICH IS PART OF A PROGRAM (USER BUILDING SOMETHING)"**
>
> **"a good agent with good partially overlapping skills is a better agent"**
>
> **"the gate become: enough information, not human or whatever"**

Agent = class = **standing watcher with a domain**, watching the build, reusing skills (its own and
others'). Skill = function = passive, watches nothing. **Overlap between the skills an agent reuses
is COVERAGE, not duplication** — the same reason the adversarial fleet's three lenses work.

## ⚠️ THE FINDING THAT INVALIDATES THE OBVIOUS PLAN — measured, not guessed

**Of the 86 pre-B2 agents, only 11 were real watchers. 75 were skills living in the agents folder.**

```
REAL WATCHERS (had ## Trigger / ## Blocking Rules):   11
skills-in-agent-clothing (no watcher sections):        75
```
Verify: `for f in $(git ls-tree -r --name-only e7e4b62^ agents/ | grep '\.md$' | grep -v _shared); do git show e7e4b62^:"$f" | grep -qE "^## (Trigger|Blocking Rules|When to Block)" && echo W || echo S; done | sort | uniq -c`

`agents/quality/code-reviewer.md` @ `e7e4b62^` (232 lines) has NO Trigger, NO Blocking Rules. Its
skill (`skills/quality/code-reviewer/SKILL.md`, 753 lines) is a **strict superset**: same sections,
improved, plus six it never had (2026 Best Practices, Sub-Skill Categories, Tool Integration, Letter
schema, Special Considerations, Refinement Loop critic mode).

**Consequences (both hard):**
1. **B2 was RIGHT for 75 of them.** They were functions; moving them to `skills/` was correct. What
   B2 got wrong was leaving a redirect stub where a watcher should have been BUILT.
2. **The 86-watcher layer the owner remembers never existed — it was ~11.** There is nothing in git
   to "restore". Every attempt to restore the watchers produces duplicate skills. **The watcher
   layer must be BUILT**, using the 11 as the template and the 100 skills as the toolbox.

## Current status

**Done and verified on disk:**
- **128 agents · median 150 lines · 27,712 total · 0 without a description · 0 double frontmatter.**
- **All 128 dispatchable**: real `description` (the routing surface the Task tool picks on), `tools`,
  `model`, `effort`, `tier: 2`, `reports_to`, `dispatch_protocol` — propagated verbatim from each
  target skill, zero invented.
- **The emptiness fences are inverted** (this was the root cause of 97 unroutable agents): FOUR test
  files (`tests/cu5-s1..s4-*-wrappers.test.js`) asserted frontmatter must be EXACTLY
  `{name,type,target_skill}` and listed `tools`/`model` as FORBIDDEN. **A routable agent was a test
  failure.** The stubs were COMPLIANCE, not neglect. Now tightened: gate fields (`approved_by` etc.)
  stay banned; routing fields are REQUIRED (description >= 40 chars, non-empty tools).
- **`agent-critic`'s BOUNDARIES rubric fixed**: it docked **-3 for "overlap (same check in two
  agents)"** and required "zero overlaps" for a 10 — grading the corpus on *minimising* coverage.
  Now: overlap is never a defect; only **domain ambiguity** (two agents claiming one topic with no
  distinguishing trigger → dispatcher cannot route) is penalised, and a **1:1 alias costs -3**.
- `model_optimized_for` deleted corpus-wide (category error: provenance on 27 rows,
  execution-target on the 5 scouts) + fence test + resurrection vector in
  `.ctoc/architecture/tier-definitions.yaml` stripped.
- **26 forged `approved_by: human` markers removed** — proven by timestamp forensics: hand-typed
  round times, ZERO millisecond precision, 26/26 (`approvePlan` stamps `toISOString()`; `done/` is
  522 ms-precision vs 3 round). The ledger even confessed: *"Claude wrote approved_by:human into
  plan frontmatter directly instead of crossing Gate 2 via approvePlan — a forged marker."*
- Adversarial gate fleet hardened (185/216 agents, 4.4 → 9.5): spotlighting + instruction
  hierarchy, plan text treated as quoted data, a crashed lens classified **NOT RUN rather than a
  clean pass**, injection attempt is itself a critical finding.
- 5-subagent concurrency fence (`agent-slots.js` + `PreToolUse.Task.js` + `SubagentStop.js`),
  `MAX_CONCURRENT` imported from `task-registry.js`. Escape phrases deliberately CANNOT lift it.
- `hasEnoughInformation` / `planQuestionsStatus` predicate — mutation-proven (flip fail-closed → 6
  fails; drop `important` → 2; unreadable log → 1). Fails CLOSED on every uncertain state.
- `plan-coverage.js` real bug fixed: `readPlanFiles` read only the FIRST frontmatter block, so a
  Gate-2-stamped plan in `todo/` resolved `files: []` and the hook blocked the implementer from
  editing its own declared files.
- `00050` sweep plan deleted (untracked, no ledger entry — the enforcer was right).

**In progress:** a subagent is writing the 26 CU5-era stubs as real watchers (they never had a body
to restore), with the overlapping-skills ruling applied.

**Next:** see Resume here.

## Open questions / blockers

1. **THE 75 DUPLICATES ARE LIVE AND WRONG — the owner was asked and has not answered.** My restore
   pasted 75 pre-B2 skill-bodies into agents. Each is a **stale, worse copy of its own skill**
   (`code-reviewer` restored at 232 lines vs its 753-line skill). They must be reverted; leaving
   them means the corpus lies about itself again. **Ask before reverting — it is his corpus.**
2. **The gate can report a FALSE GREEN.** Under `FORCE_COLOR`, ANSI codes land between the pipe and
   the number (`all files | [32m 99.07`), the coverage regex reads `null`, and the gate
   reported **`failed 0` while node reported 13 real failures**. The thing that decides whether we
   may ship can lie. Not fixed — gate logic needs the owner's approval.
3. **Gate is at `fail 9`** (was 40): ESLint 10 errors incl. a REAL bug `ALLOWED_TOOLS is not
   defined` in `.ctoc/sweep-watchdog.js`; tsc baseline 3 errors in `src/lib/agent-slots.js`
   (baseline 0 — a ratchet, do NOT raise it); dead exports (`agent-slots#activeCount`,
   `streaming-precompute#hasEnoughInformation`); doc counts (CLAUDE.md says 404 test files, disk
   has 408).
4. **178 `approved_by` markers classified UNKNOWN** (ledger kind `backfilled`, ms-precision stamps).
   Not provably forged, not provably human. Untouched. His ruling.
5. **`entryKind` PRESUMES the human approved** — `approval-ledger.js:357`: anything it doesn't
   recognise returns `'human'`. **That is the mechanism behind every forged approval, still armed.**
   Fix order (do NOT reorder): migrate the 234 genuine `done/` entries to an explicit kind → flip
   the default to fail non-human → THEN wire sufficiency additively (proving `done/` 234→234, 0→0
   reverts by measurement; a replacement wiring reverts 235 plans).

## Gotchas

**This codebase's code and skills are strong; its claims about itself are not.** Every failure found
on 2026-07-17 was a document, count, or fence asserting completion a five-second read disproves.
**I was wrong nine times in one session by trusting a claim instead of reading the file.** Verify
everything against disk.

- **`332f121` "dead code ZERO — every source file reachable"** DELETED 69 files (incl.
  `agent-critic-loop.js`, the 10-round training loop) and their tests, so the suite stayed green.
- **`.ctoc/agents/grades.yaml`** claims "all 66 agents after the 10-round improvement loop":
  **20 at `score: 0`, 19 at `rounds: 0`**, one real score, stale since 2025-02-02. The agents were
  never trained.
- **My own lie:** a 30-round sweep reported `roundsRun: 30` while **719 of 721 agents errored**. It
  counted loop iterations. **Never count exit codes as work — verify the file hash on disk.**
- **`claude -p` spawned from node silently denies Edit** while exiting 0. Probing from a Bash shell
  gives the OPPOSITE result (the shell inherits a grant the spawn never gets) — test the REAL path.
- **`--allowedTools` is an auto-approve allowlist, not a restriction.** `--tools Read` still wrote
  via the desktop-commander MCP server. Only `--tools … --strict-mcp-config --mcp-config
  '{"mcpServers":{}}'` is a real boundary. `bypassPermissions` is BANNED (routes around CTOC's own
  hooks — the project's first law).
- **CTOC's PreToolUse hooks do NOT fire inside a nested `claude -p`.** A subprocess with no covering
  plan wrote anyway and left no enforcement-log entry. The enforcement fence does not reach
  subprocesses.
- **Not all 86 pre-B2 agents were gutted.** The Tier-1 ones (`cto-chief`, `implementation-planner`,
  `product-owner`, `vision-advisor`, `agent-critic`) stayed rich and kept evolving. A bulk restore
  reverted 27 of them to 2025, destroying 137 lines of `implementation-planner` and 110 of
  `cto-chief`. `tier1-no-peer-dispatch` caught it. **Check which files actually need a change.**
- Session limit resets ~04:50 Europe/Amsterdam.

## Key files

- `agents/quality/architecture-checker.md` — **a REAL watcher; the template.** Sections: `## Role`,
  `## Trigger`, `## Checks`, `## Output Format (MANDATORY)`, `## Blocking Rules`,
  `## Related Agents`, `## When to Block vs Warn`.
- `skills/**/SKILL.md` — the toolbox (100 skills, median 553 lines, real). **The best content in the
  repo.** 99/100 declare `related_skills` — the reuse graph, already written, never used.
- `agents/pipeline/agent-critic.md` — rubric; BOUNDARIES now rewards overlap.
- `src/lib/streaming-precompute.js` — `hasEnoughInformation`, `planQuestionsStatus`,
  `writePlanQuestions`. Option contract uses **`pros`/`cons` PLURAL** (singular is silently dropped).
- `src/hooks/human-gate-check.js` — reads the LEDGER, never the `approved_by:` marker.
- `src/lib/approval-ledger.js:357` — `entryKind` defaults to `'human'`. The forgery mechanism.
- `.ctoc/sweep-watchdog.js` — two-stage round (critic reports → writer edits), hash-verified,
  hourly probe, `--report` stats. **STOP flag is up.**

## Resume here

**FIRST: ask the owner about the 75 duplicates (Open question 1). Do not revert without his word.**

**THEN the real work: BUILD THE WATCHER LAYER.** It never existed; it must be written, not restored.

For each agent, using `agents/quality/architecture-checker.md` as the template:
- `## Role` — the domain it watches, and why that domain needs a standing observer.
- `## Trigger` — WHEN in the build it looks (name the real Iron Loop steps, e.g. Step 13 SECURE,
  Step 14 VERIFY). **This is what makes it a watcher rather than a function.**
- `## Checks` — **DELEGATE the deep method to the skill** (the skill is a 553-line superset; copying
  it guarantees drift). Reuse SEVERAL skills from the `related_skills` graph, **including
  overlapping ones — that is coverage**. Two skills reaching the same finding is CONFIRMATION.
- `## Blocking Rules` / `## When to Block vs Warn` — concrete thresholds, never "as appropriate".
- `## Related Agents` — real handoffs; `cto-chief` coordinates.

Breed each with the loop the owner specified: **websearch → harsh adversarial critique per section →
update → more websearch → critique the next section. NO FAKING.** The sweep
(`.ctoc/sweep-watchdog.js`) is built and proven for this — it now targets something real instead of
polishing redirects. Skills are already good; **the watchers are what need the rounds.**

**NEVER stamp `approved_by: human` anywhere, for any reason. Never cross a gate.**
