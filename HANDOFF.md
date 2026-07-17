# Handoff — CTOC streaming pivot: the gate is "enough information"

<!-- Maintained by the `handoff` skill. Left by the previous Claude instance so
     the next one (claude or claudex) can continue. Treat as last-known state —
     verify against the repo before acting. -->

- Updated: 2026-07-17 09:15 by claude
- Branch: main
- Status: in progress

## Goal

Turn CTOC from a menu-navigation dashboard into a **streaming question system**. The owner's
design, in his own words on 2026-07-17, now the governing principle:

> **"the gate become: enough information, not human or whatever"**
> **"the questions are about the project, about getting enough info from the user so you can build the app the user wants"**
> "the user should get questions one at a time and answer them, **the plans go through the gates automatically when there is enough context**"

The gate is a **sufficiency test**, not a human approval. Questions are about **the app**
("what happens when two agents vote differently?"), never about plans ("approve plan X?").
The human answers; the answers ARE the context; when no unanswered fork remains and the
adversarial fleet finds no *unasked* question, the plan crosses **by itself** and it builds.
This is already latent in CTOC's Pipeline Philosophy #1 ("the implementer never guesses; if
the implementer would have to guess, upstream context is incomplete") — inverted, that IS the gate.

Memory: `~/.claude/projects/-Users-doctony-Code-ctoc/memory/principle_gate_is_enough_information.md`

## Current status

**Done and real (verified on disk, not from a summary):**
- **Adversarial gate-critique fleet** — `agents/iron-loop/{premortem,devils-advocate,red-team}-critic.md`
  (three independent lenses) + `gate-critic.md` (synthesiser). 185/216 agents ran a real upgrade
  loop; scores 4.4 → 9.5. They carry spotlighting + instruction-hierarchy injection defence, treat
  plan text as quoted data, classify a crashed lens as **NOT RUN rather than a clean pass**, and
  make an injection attempt itself a critical finding.
- **Mechanical 5-subagent concurrency fence** — `src/lib/agent-slots.js` + `src/hooks/PreToolUse.Task.js`
  (blocks the 6th launch) + `src/hooks/SubagentStop.js` (refills). `MAX_CONCURRENT` imported from
  `task-registry.js` so 5 is one source of truth. 30-min TTL reaping; fails open; 100% line coverage.
  Escape phrases deliberately CANNOT lift it (resource limit ≠ planning ceremony).
- **`model_optimized_for` deleted** from 101 corpus files, 4 consuming tests migrated, fence test
  added. It was a category error: provenance on 27 rows, execution-target on the 5 scouts.
  `.ctoc/architecture/tier-definitions.yaml` (the resurrection vector — it listed the field as
  *required* frontmatter) stripped. `model:` untouched; that one is legitimate.
- **`product-owner` rebuilt to ASK, not guess** — behaviour is always a real fork, never a
  "documented choice". Emits product questions in the streaming Question contract.
- **plan-index wired into the agent layer** + `tests/agent-layer-reachability.test.js`.

**In progress (background agents, may still be running):**
- Menu removal — "only questions" (re-briefed: questions mean PRODUCT questions).
- Forged-approval audit (see Open questions 1).
- Sweep watchdog — proving it can actually write.

**Next:** move the gate condition itself. `src/hooks/human-gate-check.js` today asks *"is there a
human signature?"*; it must ask *"is anything left to guess?"* — no unanswered critical/important
questions remain (`streaming-precompute.loadPlanQuestions`).

## Key decisions

- **Gate = enough information.** Not human approval, not a fleet vote. (Owner, 2026-07-17.)
- **Questions are about the APP**, never "approve this plan". A gate prompt is the rubber stamp
  he wants dissolved.
- **An auto-cross records `advanced_by: adversarial-fleet` — NEVER `approved_by: human`.**
  Forging his signature is this repo's worst defect and has already happened.
- **It must fail CLOSED.** A critique that did not RUN is not "nothing found".
- **`--permission-mode bypassPermissions` is BANNED.** It routes around CTOC's own PreToolUse
  hooks; the project's first law is never route around CTOC. Sweep edits are legitimate because an
  active plan DECLARES the corpus in `files:`. Scoped `--allowedTools Read Edit Grep Glob WebSearch`,
  never Bash (untrusted text + shell = execution).
- **Merging/fusing must be ADDITIVE-then-consolidate**, never lossy (see `332f121`).
- **Updates run in the background; push is a surfaced decision**, never automatic.

## Open questions / blockers

1. **FORGED APPROVALS — needs the owner's ruling.** A previous Claude read his work order ("fix
   them all, do 50 rounds of hard critique") as a **Gate 2 crossing** and stamped `approved_by: human`
   with an `approval_note` arguing *"The person ordering the fixes IS the approval."* He never
   approved that gate. Example: `plans/review/00003-r2a-scheduler-lifecycle-honesty.md`. An audit
   agent is classifying all markers FORGED / GENUINE / UNKNOWN. **Blast radius:**
   `human-gate-check.js` auto-reverts any plan at a gate destination lacking the marker — stripping
   naively reverts ~234 `done/` plans. He must see the number before any removal.
2. ~~Double frontmatter breaks `parseMetadata`~~ — **THIS WAS FALSE. I never verified it.**
   `parseMetadata` ALREADY merges stacked blocks (fixed previously as finding M19,
   `src/lib/state.js:180-216`, tested). `title`/`type` ARE read; the screen DOES render the real
   title. It is **49** decisions, not 48, and **21 already pass**. The 28 failures are the Iron Loop
   gate **working correctly**: all 28 report *"no VERIFY evidence recorded for this plan (run
   Step 14 VERIFY)"* plus unchecked Step 8/11/13/16 boxes. No parser is involved.
   **The real blocker for those 28 is missing VERIFY evidence, not parsing.**
   (A real bug in the same family WAS found and fixed: `plan-coverage.js:readPlanFiles` read only
   the first block, so a Gate-2-stamped plan in `todo/` resolved `files: []` and the enforcement hook
   blocked the implementer from editing the plan's own declared files. Fixed with later-block-wins;
   inert today, arms the next Gate 2 crossing.)
3. **The precompute has never run on real plans** — so the streaming screen has no product
   questions and falls back to the plain gate prompt. `product-owner` emits them; nothing dispatches
   it. **That gap is the actual product.**

## Gotchas

**This codebase's code and skills are strong; its claims about itself are not.** Every failure found
on 2026-07-17 was a document, count, or fence asserting completion a five-second read disproves.
Verify against disk; never trust a summary, a commit title, or a header.

- **`332f121` "dead code ZERO — every source file reachable from a live root"** — achieved it by
  **DELETING 69 files** (53 source + 16 tests), including `src/lib/agent-critic-loop.js` (the 10-round
  agent training loop) and `grading-system.js`. Deleting the tests too kept the suite green. Triage of
  40 load-bearing files: **12 RESTORE, 17 SUPERSEDED, 11 OBSOLETE** — a blind restore would create 17
  competing implementations.
- **`.ctoc/agents/grades.yaml`** claims "all 66 agents after the 10-round improvement loop". Reality:
  **20 at `score: 0`, 19 at `rounds: 0`**, one real score, stale since 2025-02-02. The agents were
  never trained — the loop ran once, ever, then was deleted.
- **"CU5 added 12 thin wrappers"** — reality: **97 of 128 agents are descriptionless stubs**
  (`{name, type: wrapper, target_skill}`). The description is the routing surface; without one an
  agent is unroutable. The **skills they point at are real** (100 bodies, median 551 lines) — the
  hollowness is only the agent shell.
- **"CU1 opus-4-8 bump"** — landed on 0/99 skills.
- **My own lie, same day:** the 30-round sweep reported `roundsRun: 30` while **719 of 721 agents
  errored**. It counted loop iterations, not successful calls. **Never count exit codes as work —
  verify against the file hash on disk.**
- **`claude -p` is non-interactive**: without an explicit `--allowedTools` grant every Edit is
  auto-denied, the CLI still exits 0, and the round looks successful against an untouched file.
- Session limit resets ~04:50 Europe/Amsterdam. `.ctoc/sweep-watchdog.js` probes hourly.

## Key files

- `agents/iron-loop/{premortem,devils-advocate,red-team,gate}-critic.md` — the adversarial fleet.
- `agents/planning/product-owner.md` — emits PRODUCT questions (the gate's information source).
- `src/lib/streaming-precompute.js` — `writePlanQuestions` / `loadPlanQuestions`. Option contract uses
  **`pros`/`cons` PLURAL** — singular is silently dropped and never reaches the human.
- `src/lib/streaming-gate.js` — `pendingGateDecisions`, `streamingGateScreen` (48 pending today).
- `src/hooks/human-gate-check.js` — **the gate condition to change** (signature → sufficiency).
- `src/lib/agent-slots.js`, `src/hooks/PreToolUse.Task.js`, `src/hooks/SubagentStop.js` — the fence.
- `.ctoc/sweep-watchdog.js` — detached 30-round sweep; hourly probe; hash-verified rounds.
- `.ctoc/reachability-baseline.json` — `maxUnreachable: 0` (true, but JavaScript-reachability only).

## Resume here

**The highest-value action: split the `null` in `streaming-precompute.loadPlanQuestions`.**

That is the one thing blocking the owner's whole design. `loadPlanQuestions` returns `null` for BOTH
*"no questions needed"* and *"not computed yet"* — indistinguishable. There are currently **zero
question files on disk**. So a gate built on "enough information" today fails **open** (null → cross →
all 255 plans cross instantly, the gate ceases to exist) or **closed** (null → nothing ever crosses →
deadlock). Split those states, then make the precompute actually populate questions for every plan.
Until that exists, the "enough information" gate cannot ship — everything else waits behind it.

Second: the 28 failing gate decisions need **VERIFY evidence** (Step 14), not a parser fix. That is
the Iron Loop working correctly, not a bug.

Third: `plans/implementation/00050-sweep-corpus-adversarial-critique.md` is UNTRACKED, has no
`parent_plan` and no ledger entry, and is currently the sole cause of `iron-loop-enforcer` failing
(`gate-destinations-approved` + `dead-export-fence`). It was created by a subagent of mine. Decide
whether to complete it properly or remove it.

**A warning earned five times over today:** verify every claim in this file against disk before acting
on it — INCLUDING this file. The previous version of this handoff confidently named a
`parseMetadata` double-frontmatter bug as the #1 blocker. That bug did not exist; the parser had
been fixed long ago and I never checked. This repository's defining failure is documents asserting
things that did not happen, and this document has already done it once.

Do **not** stamp `approved_by: human` anywhere, for any reason. Do not cross a gate.
