---
iron_loop_verdict: true
iron_loop: true
title: "CLAUDE.md gets small and keeps every rule"
type: functional
status: functional
created: 2026-10-06
priority: high
effort: medium
depends_on: ctoc-does-no-unasked-work-at-session-start-or-stop
files:
  - CLAUDE.md
  - docs/ENFORCEMENT.md
  - docs/FENCES.md
  - docs/PROJECT_REFERENCE.md
  - docs/OPERATING_LESSONS.md
  - .ctoc/templates/operating-lessons.md
  - .ctoc/templates/CLAUDE.md.template
  - src/commands/update.js
  - README.md
  - tests/claude-md-keeps-every-rule.test.js
  - tests/fixtures/claude-md-rule-inventory.json
  - tests/update-command-coverage.test.js
  - tests/last-mile-drives-entry-point.test.js
  - tests/session-start-question-dispatch.test.js
  - tests/no-phantom-command-family.test.js
  - tests/readme-numbers.test.js
approved_by: human
approved_at: 2026-10-06T17:50:36.403Z
gate_crossed: review → done
---

# CLAUDE.md gets small and keeps every rule

## What the owner asked

> "so can we also reduce compact claude.md" (2026-10-06)

> "i am trying to hide the hooks so the llm thinks and ask usefull questions to the user do
> not bother the user with gates only with questions of high uncertainty or huge importance
> (like tech stack or algorithms)" (2026-10-06)

CLAUDE.md should carry how to think and work. The long design histories of hooks, fences,
ledgers and approval machinery move, word for word, into files under `docs/` that an agent
reads when it touches that code. CLAUDE.md keeps a one-line pointer per file saying which
file and when to read it.

## Problem statement — why (measured)

Every subagent dispatched in this repository loads every CLAUDE.md level before its own
definition. Users wait minutes and hours, and the cost is in the agents.

| File | Bytes | Lines | Source of the number |
|---|---|---|---|
| `CLAUDE.md` (this repository) | 92,943 | 1,085 | owner's measurement; the heading scan in this session ends at line 1,085, consistent |
| `~/Code/CLAUDE.md` (parent folder, private) | 18,729 | — | owner's measurement |
| user-level CLAUDE.md (private) | 10,557 | — | owner's measurement |
| `.ctoc/templates/CLAUDE.md.template` (what a user project gets) | 4,891 | 159 | owner's measurement; 159 lines read this session |
| `.ctoc/templates/operating-lessons.md` (the lessons block every project gets) | measured at Step 9 | 74 non-empty | counted this session |

**Target:** this repository's `CLAUDE.md` at or under **15,000 bytes** — from 92,943, a cut
of at least 84 percent. The after-numbers are measured at Step 14 and written to
`.ctoc/audit/speed-and-size/benchmarks/RESULTS.md`.

## What is true on disk today (read this session)

1. **Two of CLAUDE.md's blocks are CTOC-managed copies, not hand-written text.**
   - Lines 900–1,009 are the lessons block between `<!-- CTOC:LESSONS v1 START -->` and
     `<!-- CTOC:LESSONS v1 END -->`. Its single source is
     `.ctoc/templates/operating-lessons.md` (`src/lib/claude-md-lessons.js`).
   - Lines 1,011–1,085 are the engineering-craft manual between
     `<!-- BEGIN ctoc:operating-manual ... -->` and `<!-- END ctoc:operating-manual -->`. Its
     single source is `.ctoc/templates/operating-manual.md` (`src/lib/operating-manual.js`).
   - Session start never writes either block into this repository (`shouldInjectLessons` in
     `src/hooks/SessionStart.js` returns false when `package.json` names `ctoc`).
     **`/ctoc:update` does**: `refreshLocalLessons` and `refreshLocalManual` in
     `src/commands/update.js` have no such check, and `refreshLocalManual` runs whenever the
     current folder has `package.json` or `.ctoc/`. So a block removed from this repository's
     CLAUDE.md comes back the next time the owner runs `/ctoc:update` here.
   - Consequence for the target: the lessons block cannot be tightened inside CLAUDE.md
     alone — it must be tightened at its source template, which also shrinks what every user
     project receives. The owner listed the lessons (tightened) as staying, so that is in
     scope.
2. **Budget arithmetic.** The manual block alone is about 10,000 bytes and the lessons block
   about 8,000 (estimated from their text, not measured). Kept together they exceed the
   target before a single other line is counted. The target is reachable only with the
   manual block out of this repository's own CLAUDE.md, which is what this plan does
   (decision 3).
3. **The project detector needs the first heading.** `src/lib/ctoc-project-detector.js`
   recognises a CTOC project by `/^#\s*CTOC Project Instructions/m`. The heading stays.
4. **Three generated count lines and two fixed count lines live in CLAUDE.md.**
   `src/scripts/release.js` rewrites the shapes `Run all N test files`, `tests/ N test files`,
   `lib/ N JS modules`, `agents/ N agent definitions`, `skills/ N skill files`.
   `tests/doc-counts.test.js` polices `N Claude Code hooks` and `N dashboard tab files`
   exactly. All seven shapes stay, byte-compatible.
5. **Headings other files point at.** `docs/IRON_LOOP.md` links "Pipeline Philosophy";
   `docs/PROCESS_FMEA.md` names "No Silent Test Failures" and "Test Quality Checklist";
   `src/commands/start.md` names "4 Mandatory Approval Points" and the model rule. These
   headings and that rule stay in CLAUDE.md.
6. **Scans that already cover `docs/`.** The compliance-claims fence reads top-level
   `docs/*.md`; the no-scout scan and the `ctoc:menu` absence scan read `docs/`. Text moved
   to `docs/` stays inside those fences. The reachability fence and the gate-word fence do
   not read CLAUDE.md or `docs/` at all, so moving text does not change them.
7. **The docs folder count is pinned.** `tests/readme-numbers.test.js` asserts
   `docs/` holds exactly 16 markdown files, and `README.md` line 1,121 says "16 docs". Four
   new docs files make it 20; both are updated in this plan.

## Which tests pin CLAUDE.md content

The owner's count is 94 test files that mention CLAUDE.md. Method: every line naming
CLAUDE.md in all 94 files was read; the 17 files that build a path to the repository's own
CLAUDE.md had their assertion bodies read. The other 77 write a CLAUDE.md into a temporary
folder as a project marker, test the template or the managed blocks in a temporary folder,
cite CLAUDE.md in a comment, or test plans that declare CLAUDE.md in `files:`.

| Test file | What it asserts on the real CLAUDE.md | After this plan |
|---|---|---|
| `cto-chief-toplevel.test.js` | a `## Agent Architecture` heading; "CTO Chief … only agent with top-level" | stays in CLAUDE.md |
| `step-label-hook-claim-matches-manifest.test.js` | says the label checker is "not wired"; never says "REJECTED before execution" | stays in CLAUDE.md |
| `readme-numbers.test.js` | "maximal lossless progress", "blocks its subtree until answered", "Dispatch logging is an instruction-level protocol", "not by an enforcement hook today"; absence of "drains while the user sleeps" and "plan-serial"; `docs/` count 16 | phrases stay in CLAUDE.md; **docs count 16 → 20** |
| `registry-integrity.test.js` | every agent named in a table row that starts with a step number resolves | step table stays verbatim; no other table in CLAUDE.md may start a row with a number |
| `agent-dispatch-resolution.test.js` | the `\| Step \| Label \| Agent \| Phase \|` table | stays verbatim |
| `doc-counts.test.js` | "N Claude Code hooks", "N dashboard tab files" equal disk | stay |
| `doc-counts-generated.test.js` | runs the count generator on a copy of CLAUDE.md | count shapes stay |
| `remainder-hooks-commands-coverage.test.js` | count sync on a copy; the real file is byte-unchanged during the suite | count shapes stay |
| `subplan-decomposition.test.js` | "parent_plan" and "N small implementation plans" | stay in CLAUDE.md |
| `deepthink-ships-with-ctoc.test.js` | the `skills/ N skill files (...)` line, its parenthetical verbatim | stays |
| `agent-honest-status-fence.test.js` | "when you have no data, say you have none", "scheduled against a wall clock" | stay inside the tightened lessons block |
| `no-phantom-command-family.test.js` | shrink-only ceiling of 6 phantom `ctoc <word>` commands across CLAUDE.md, README.md, start.md, update.md; the `src/lib/quality-gate.js` entry-point row carries NOT WIRED | row stays; **re-pointed**, see below |
| `last-mile-drives-entry-point.test.js` | exactly one fenced `json` block containing `entry_point`, and it parses | **re-pointed** to `docs/ENFORCEMENT.md` |
| `session-start-question-dispatch.test.js` | "An approved build queue alone never blocks a stop."; the old dispatch sentence is absent | **re-pointed** to `docs/ENFORCEMENT.md` |
| `no-tier-3.test.js` | no scout names in CLAUDE.md or `docs/` | unaffected |
| `ctoc-start-command.test.js` | no `ctoc:menu` in CLAUDE.md or `docs/` | unaffected |
| `compliance-claims-match-code.test.js` | every named, unenforced control carries NOT ENFORCED in its block or section, across CLAUDE.md and `docs/` | unaffected if each section moves whole |

Template and lessons pins (temporary folders, real templates): `claude-md-lessons.test.js`
needs the lessons source to keep "The measure is the human", "Talk to a human like a human",
"never by an internal code", "test-driven development", `8:TEST`, `10:IMPLEMENT`,
`14:VERIFY` and a "16-step" token; a project rendered from the template must keep "Step 8",
"Step 10", "Step 14", "Gate 0", the brace-form plan folder list, and the three slash
commands. No test pins the template's "Enforcement Mode" or "Common Issues" sections
(searched this session: zero matches).

### Re-pointed tests (same assertion, new file — never loosened)

1. `tests/last-mile-drives-entry-point.test.js`, case "ladder 7": the path changes from
   `CLAUDE.md` to `docs/ENFORCEMENT.md`; every assertion is unchanged (exactly one fenced
   `json` block containing `entry_point`, parses as plain JSON, carries
   `general.entry_point`). The case title names the new file.
2. `tests/session-start-question-dispatch.test.js`, case "CLAUDE.md says session start gives
   no order…": the presence assertion moves to `docs/ENFORCEMENT.md`; the absence assertion
   is kept on CLAUDE.md **and** added for `docs/ENFORCEMENT.md`, so it guards both files.
3. `tests/no-phantom-command-family.test.js`: `docs/PROJECT_REFERENCE.md` (where the
   self-improvement section, carrying `ctoc validate` and `ctoc process-issues`, moves) joins
   the debt list. The ceiling stays 6; the comment recording where the debt sits is updated.
   Moving the text without this would carry two phantom commands out of the fence's view.

Count reconciles (not re-points): `tests/readme-numbers.test.js` docs count 16 → 20, and
`README.md` "16 docs" → "20 docs" with the four new names. The new test file moves the test
count by one; `node src/scripts/release.js` regenerates the growing count lines (Step 15).

## What stays in CLAUDE.md — and the byte budget

| Section (in order) | Content | Budget (bytes) |
|---|---|---|
| Title and compaction line | `# CTOC Project Instructions`; what to preserve on compaction | 300 |
| Agent Architecture | three tiers; CTO Chief is the only agent with top-level authority and the final approver; slash commands must not declare `model:`; no agent declares haiku; the dispatch-logging sentence | 600 |
| Pipeline Philosophy | the four principles, tightened, keeping "maximal lossless progress" and "blocks its subtree until answered" | 800 |
| Questions | new, from the owner's 2026-10-06 direction: ask only on high uncertainty or huge importance (technology stack, algorithms, cost or risk he must accept); never raise approvals, stages or pipeline machinery with him; below that, make a documented choice and continue; business questions are out of scope for this technical chain | 500 |
| Human approvals | the four-approvals table under the heading "Human Gates (4 Mandatory Approval Points)"; the refuse rule; auto-revert line; hook or gate logic changes only with the owner's explicit approval; plans declare `files:`; a refused write is stop-and-ask, never a silent edit; the escape phrases; never spawn a second Claude, no online model calls | 1,000 |
| Marketplace Only | install, update, stale-cache fix; never local paths | 450 |
| Test & Verify | `npm test` is the gate; the `Run all N test files` line; `# fail 0`; coverage floor in `.ctoc/coverage-baseline.json`, ratchet-up only, an unreadable baseline refuses; VERSION is the single source | 700 |
| Release | the table, versioning, updates always run in the background | 650 |
| Architecture | the folder tree with all seven count shapes and the verbatim skills line; key entry points table with the NOT WIRED row | 1,500 |
| Iron Loop | the step table verbatim; Steps 1–7 collaborative, 8–16 automated; labels mandatory and the "not wired" sentence; Step 10 is one step; one functional plan becomes N small implementation plans linked by `parent_plan`; Step 14 VERIFY; circuit breaker | 2,000 |
| Menu System Rules | numbered menus with `[0]`; recommended first; one matrix question per gap; format in `.ctoc/ask-me-questions.md` | 400 |
| Subagent Guidelines | plans one at a time; at most 5 background subagents | 300 |
| Quality Non-Negotiables | headings "No Silent Test Failures" and "Test Quality Checklist" kept | 600 |
| Cross-Platform | the five rules | 300 |
| Privacy | the two hard rules from the craft manual, word for word: never print, log or commit secrets; client and personal data stays inside approved infrastructure | 450 |
| Read before you touch | the pointer table below, plus: "New design histories go into these files, never into this one; a test holds this file at or under 15,000 bytes." | 700 |
| Lessons block | managed, tightened at its source; markers included | 3,200 |
| **Total** | | **14,450** |

The budget is an estimate with about 550 bytes of headroom. If the build cannot fit every
rule under 15,000 bytes, it stops and reports the measured size and the section that is
over. It never drops or weakens a rule to make the number.

### The pointer table in CLAUDE.md

| When you are about to touch | Read first |
|---|---|
| `src/hooks/**`, plan coverage, approvals, enforcement mode, scope growth, the declared entry point, the continuation gate, the resume watchdog, the question store or the streaming gate | `docs/ENFORCEMENT.md` |
| any check, baseline or fence: `.ctoc/*-baseline.json`, `test-gate.js`, the coverage floor, reachability, the stale detector, guide claims, shipped recipes, compliance | `docs/FENCES.md` |
| agent tiers and model rules, the project templates, the Product Loop, the release menu, project init, self-improvement | `docs/PROJECT_REFERENCE.md` |
| the reasons behind an operating lesson | `docs/OPERATING_LESSONS.md` |
| the generic engineering-craft manual CTOC installs in every project | `.ctoc/templates/operating-manual.md` |

No row starts with a digit, so the step-table parser in `registry-integrity.test.js` ignores it.

## What moves where (line ranges as of 2026-10-06; Step 9 re-takes them)

| CLAUDE.md lines | Section | Destination |
|---|---|---|
| 8–30 | Agent Architecture (full: tier diagram, model rules table and its history, deleted pre-screen agents, synthesizer priority order, structural invariants) | `docs/PROJECT_REFERENCE.md`; short form stays |
| 31–36 | Step-driven question routing | `docs/PROJECT_REFERENCE.md`; folded into the new Questions section |
| 37–59 | SaaS template library | `docs/PROJECT_REFERENCE.md` |
| 60–99 | The Product Loop | `docs/PROJECT_REFERENCE.md` |
| 128–217 | Mandatory Pipeline Use (edit-channel flow, carve-outs, approved-plan coverage, enforcement mode, shell-channel coverage, payload reader, runtime environment, declared entry point with its `json` block, `files:` declaration, scope growth) | `docs/ENFORCEMENT.md`; three lines stay |
| 218–255 | Continuation Gate and the durable watchdog | `docs/ENFORCEMENT.md` |
| 256–286 | Streaming questions and both attestation paragraphs | `docs/ENFORCEMENT.md`; "never a second Claude" stays |
| 320–657 | Test & Verify: the sufficiency-crossing audit paragraph | `docs/ENFORCEMENT.md` |
| 320–657 | Test & Verify: every fence and history paragraph (gate fails closed, false-green fence, agent-honesty fence, unexecutable-order fence, zero detected tools, golden-corpus fence, stale scan, pre-build missing files, dead-code fence, compliance-claims fence, executable compliance seam, recipe-execution fence, coverage floor history, ratchet direction, guide claims, Doctor verdict and the claims verifier) | `docs/FENCES.md`; commands and the floor summary stay |
| 680–691 | Release Menu | `docs/PROJECT_REFERENCE.md` |
| 692–732 | Architecture: the plugin-manifest paragraph | `docs/PROJECT_REFERENCE.md`; tree and table stay |
| 733–773 | Iron Loop: the paragraph on agent-driven refinement rounds and why no JavaScript scores a plan | `docs/FENCES.md` |
| 774–785 | Common Failures table | `docs/PROJECT_REFERENCE.md` |
| 795–808 | Menu System Rules: the example matrix | `docs/PROJECT_REFERENCE.md` |
| 809–824 | Subagent Guidelines: the parallelize/serialize table and example | `docs/PROJECT_REFERENCE.md` |
| 860–877 | Project Init Procedure | `docs/PROJECT_REFERENCE.md` |
| 878–899 | Self-Improvement and processing community skill issues | `docs/PROJECT_REFERENCE.md`; the hook-or-gate approval rule stays |
| 900–1,009 | Lessons block, full pre-tightening text | `docs/OPERATING_LESSONS.md` word for word; the tightened block stays |
| 1,011–1,085 | Engineering-craft manual block | removed from this repository's CLAUDE.md (decision 3); its source `.ctoc/templates/operating-manual.md` is unchanged and still installed in every user project; the two privacy rules stay |

Every moved section keeps its original heading and travels whole, so a NOT ENFORCED marker
stays in the same section as the control it covers. Each new docs file opens with one
paragraph: moved word for word from CLAUDE.md on the build date, and when to read it.

## User project files (small, same spirit)

- `.ctoc/templates/CLAUDE.md.template`: remove the "Enforcement Mode" section (the hook
  knob, about 800 bytes, including how to turn enforcement off) and the empty "Common
  Issues" placeholder table. Nothing else. The enforcement-mode text remains documented in
  `docs/ENFORCEMENT.md`.
- `.ctoc/templates/operating-lessons.md`: each of the 19 lessons keeps its rule sentences and
  loses its origin story and mechanism names; the methodology paragraph drops this
  repository's own coverage number ("99 today"), which is wrong in a user's project; the
  block ends with one line pointing to `docs/OPERATING_LESSONS.md` in the CTOC repository.
  Budget 3,200 bytes including markers.

## Implementation Details

### Dependency graph

```
tests/fixtures/claude-md-rule-inventory.json  (frozen before any edit)
        └─ read by tests/claude-md-keeps-every-rule.test.js
                 ├─ reads CLAUDE.md, the four docs files, both templates
                 └─ holds CLAUDE.md <= 15,000 bytes
docs/*.md (4 new)  <- text moved out of CLAUDE.md
.ctoc/templates/operating-lessons.md  -> copied into CLAUDE.md's managed block
src/commands/update.js:refreshLocalManual  -> src/lib/ctoc-project-detector.js:isCtocProject (existing)
```

No cycle. No new module.

### File: `tests/fixtures/claude-md-rule-inventory.json` — CREATE

Written at Step 8 from the CLAUDE.md that exists when the build starts, before any edit.

```json
{
  "source": { "file": "CLAUDE.md", "bytes": 0, "lines": 0, "sha256": "", "extracted": "YYYY-MM-DD" },
  "keywords": ["must", "never", "always", "refuse", "required", "non-negotiable",
               "fail closed", "fails closed", "do not", "mandatory"],
  "rules": [
    { "id": "r0001", "old": "<sentence as written>", "home": "docs/FENCES.md" },
    { "id": "r0412", "old": "<lesson as written>", "new": "<tightened lesson>",
      "home": ".ctoc/templates/operating-lessons.md", "old_home": "docs/OPERATING_LESSONS.md" }
  ]
}
```

Extraction (a one-off `node -e` run from the session scratch folder, not committed):
fenced code and HTML comments are skipped; each paragraph and each list item is joined into
one line and split into sentences at sentence-ending punctuation followed by a space and a
capital, backtick, asterisk or bracket; each table row is one unit. A unit is kept when it
matches any keyword case-insensitively as a whole word, and every numbered operating lesson
is kept whole. Two keywords beyond the owner's list (`do not`, `mandatory`) are added
because CLAUDE.md states several binding rules only that way. `home` is assigned from the
"moves where" table. Manual-block sentences get `home: ".ctoc/templates/operating-manual.md"`
(already there word for word), except the two privacy rules, which get `CLAUDE.md`.

### File: `tests/claude-md-keeps-every-rule.test.js` — CREATE

`node:test`, `node:assert`, `fs`, `path`; no shell. Whitespace normalisation only
(`\r\n` → `\n`, runs of whitespace → one space, trim): re-wrapping a line is allowed,
changing a word is not.

1. **The inventory is not empty.** `rules.length >= FLOOR`, where `FLOOR` is the number
   the Step 8 extraction produced, written into the test as a constant. A shrunken fixture
   fails by name.
2. **Every rule is somewhere.** For each entry, `home` is one of: `CLAUDE.md`,
   `docs/ENFORCEMENT.md`, `docs/FENCES.md`, `docs/PROJECT_REFERENCE.md`,
   `docs/OPERATING_LESSONS.md`, `.ctoc/templates/operating-lessons.md`,
   `.ctoc/templates/operating-manual.md`; the home is read (an unreadable home fails loudly,
   naming the path); its normalised text contains the normalised `new` if present, else `old`.
   A miss names the id, the home and the first 120 characters of the rule.
3. **A tightened rule shows both texts.** When `new` is present: `old` and `new` are
   non-empty and differ, `old_home` is present, and `old` is found word for word in
   `old_home`.
4. **The managed lessons block in CLAUDE.md equals its source.** The text between the
   `CTOC:LESSONS v1` markers in CLAUDE.md equals the same span in
   `.ctoc/templates/operating-lessons.md` after line-ending normalisation.
5. **CLAUDE.md stays small.** `fs.statSync('CLAUDE.md').size <= 15000`; the failure prints
   the size and the rule "new design histories go to docs/".
6. **No pointer dangles.** Every path in CLAUDE.md's "Read before you touch" table exists.
7. **The project marker survives.** The first line of CLAUDE.md matches
   `/^#\s*CTOC Project Instructions/`.

### File: `src/commands/update.js` — MODIFY `refreshLocalManual`

Inside the existing `try`, after the `looksLikeProject` check:

```js
const { isCtocProject } = require(path.join(ctocRoot, 'src', 'lib', 'ctoc-project-detector'));
if (isCtocProject(cwd).isCtocRepo) return; // CTOC's own CLAUDE.md is hand-maintained
```

Required from `ctocRoot`, like its two siblings, so a deleted old install cannot break it.
A detector failure lands in the existing catch, logs "skipped", and does not write — the
same direction as `shouldInjectLessons` in `src/hooks/SessionStart.js` (any doubt, do not
write). `refreshLocalLessons` is left alone: in this repository it writes the same bytes the
block already holds. JSDoc updated to state the guard.

### File: `tests/update-command-coverage.test.js` — MODIFY (one new case)

`refreshLocalManual_leaves_ctocs_own_claude_md_alone`: a temporary folder with `.ctoc/`,
`package.json` naming `ctoc`, and a CLAUDE.md beginning `# CTOC Project Instructions`;
switch into it the way the existing cases do; call `refreshLocalManual(REPO_ROOT)`; the
file is byte-identical afterwards. The existing case for a `.ctoc/`-only consumer project
stays and proves the block is still written for users.

### Files: the four docs files — CREATE

`docs/ENFORCEMENT.md`, `docs/FENCES.md`, `docs/PROJECT_REFERENCE.md`,
`docs/OPERATING_LESSONS.md`: moved text only, word for word, original headings, one opening
paragraph each. No new claims.

### Wiring — the live call sites

- The docs files are reached through CLAUDE.md's pointer table, which every agent in this
  repository loads.
- The update guard sits in `refreshLocalManual`, called from `update()` at
  `src/commands/update.js` line 447, reached from the shipped `/ctoc:update` command.
- The tightened lessons reach users through `ensureLessonsBlock`, called at session start
  (`src/hooks/SessionStart.js` `maybeInjectLessons`), by `/ctoc:update`
  (`refreshLocalLessons`) and at project init (`src/lib/init-project.js`).
- The template change reaches users through `initProject`, which `/ctoc:start` runs in a
  folder without `.ctoc/`.

### Security review

- No new input surface. The guard reads `package.json` through the existing detector, which
  ignores a malformed file.
- The fixture and the docs files carry only text already in this repository's CLAUDE.md:
  no secret, no personal information (checked again at Step 13).
- No shell, no network; paths via `path.join`.
- Removing the template's enforcement-mode section removes, from every new user project's
  always-loaded context, the instructions for switching enforcement off.

## Acceptance criteria

1. `CLAUDE.md` is at or under 15,000 bytes, starts with `# CTOC Project Instructions`, and
   the before and after sizes are recorded.
2. Every rule in the frozen inventory is present in its home; every tightened rule records
   old and new side by side, and the old text survives word for word in
   `docs/OPERATING_LESSONS.md`.
3. Every pinned sentence either still sits in CLAUDE.md or its test was re-pointed with the
   same assertion: three re-pointed tests, listed above.
4. The growing counts and the fixed hook and tab counts are true; docs count is 20 in the
   test and in README.md.
5. `/ctoc:update` run inside this repository does not re-add the craft-manual block; run in a
   user project it still does.
6. The template loses the enforcement-mode section and the empty "Common Issues" table only.
7. `npm test` passes with zero failures and zero skipped, coverage at or above the floor in
   `.ctoc/coverage-baseline.json`.

## Duplicates in the owner's private files (listed, not edited)

`~/Code/CLAUDE.md` (18,729 bytes, loaded for every agent under `~/Code`):
1. Top part ("Code", CTO Persona, Iron Loop 16 Steps, Escape Hatches, Plan Management,
   Skills, Quality Gates, References): the project template's rendering. Overlaps this
   repository's Iron Loop summary, plan folders and slash-command table. Its command table
   names `/ctoc:menu`; the command is `/ctoc:start`.
2. "CTOC Operating Lessons" 1–16 plus the methodology paragraph: an older copy of the
   lessons block (this repository has 19). Duplicates lessons 1–16.
3. "Operating Manual — engineering craft (Opus-class)": the same text as the managed block
   at lines 1,011–1,085 of this repository's CLAUDE.md (identical on reading; not
   byte-compared). **After this plan it is the only copy loaded for agents in this
   repository — keep it.**

User level: `the second Claude profile's `CLAUDE.md`` and `~/.claude/CLAUDE.md`
carry the same text, and both were loaded into this agent's context — the first as the
user-level file, the second found as a project file while walking up from this repository
to the home folder. The global guidance therefore loads twice (about 10,557 bytes each).
Overlap with this repository's CLAUDE.md:
- "The measure is the human; CTOC is how you get there" ≈ lessons 1–6 (its last bullet is
  lesson 3).
- "Menu discipline — just show it" ≈ lesson 10.
- "ALWAYS use CTOC's own agents" ≈ lesson 4.
- "Speak in HIS terms" ≈ lessons 13 and 19.
- "He ALONE schedules" overlaps lesson 17's owner decisions.
- "Subagent-driven development" ≈ Subagent Guidelines (at most 5 background agents) and
  "Updates ALWAYS run in the background".
- "Who you work with" and "Grep is a bullshit detector" have no counterpart here.

## Notes

- When the owner cleans his private files, the parent-folder copy of the engineering-craft
  manual (`~/Code/CLAUDE.md`) must be kept: after this plan it is the only copy
  that loads for agents working in this repository.

## Seen, not changed (the owner decides)

- Lesson 17 says an owner decision gets no recommendation; the owner's memory note "Always
  give a recommendation" says every owner question carries one. The tightening keeps lesson
  17's meaning, so the conflict survives this plan.
- Several test comments cite CLAUDE.md sections that move (for example "Project Init
  Procedure" in `tests/menu-auto-init.test.js`, "Model rules" in
  `tests/slash-command-no-model-pin.test.js`). They are comments, not assertions; they go
  stale and are not edited here.

## Decisions Taken Under Ambiguity

1. **One plan, sixteen files.** The owner asked for one plan built in one pass. The file
   count comes from moves and re-points; the only code change is a two-line guard.
2. **Lessons tightened at the source template**, not in CLAUDE.md alone: the block is
   managed, a CLAUDE.md-only edit would be overwritten by `/ctoc:update` and would diverge
   from what users get.
3. **The engineering-craft manual is removed from this repository's CLAUDE.md** (decided by
   CTO Chief, 2026-10-06). Reason: the same text already loads into every agent in this
   repository from the parent folder's CLAUDE.md, and users still receive it from
   `.ctoc/templates/operating-manual.md`, so nothing is lost; keeping it would put the file
   near 25,000 bytes and miss the 15,000-byte target. The `/ctoc:update` guard keeps it from
   being re-added. The two privacy rules stay in CLAUDE.md.
4. **Four docs files, grouped by when an agent needs them**, not one per old section: hook
   and gate machinery, fences, reference, lesson reasons.
5. **Extraction keywords**: the owner's list plus `do not` and `mandatory`, so more rules
   are protected, never fewer.
6. **Presence check normalises whitespace only.** Word changes must be recorded as
   tightened; re-wrapping is free.
7. **A size ceiling test at 15,000 bytes**, so the file does not grow back one paragraph per
   plan, which is how it reached 92,943.

## Execution Plan

### Step 8: TEST
- [x] Confirm the dependency plan has shipped; its CLAUDE.md edits are the starting text. — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Run the extraction over the current CLAUDE.md; write — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
      `tests/fixtures/claude-md-rule-inventory.json` with `source` bytes, lines and sha256,
      and a `home` for every rule from the "moves where" table.
- [x] Write `tests/claude-md-keeps-every-rule.test.js` with `FLOOR` set to the extracted count. — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Add the guard case to `tests/update-command-coverage.test.js`. — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Re-point the three tests; change the docs count to 20. — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Run each: red for the stated reason (docs files absent, CLAUDE.md over 15,000 bytes, — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
      `refreshLocalManual` writes into a `ctoc`-named project).

### Step 9: PREPARE
- [x] Read CLAUDE.md once in full; re-take the heading line map. — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Compare CLAUDE.md's lessons block with `.ctoc/templates/operating-lessons.md`; any — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
      sentence only in CLAUDE.md becomes an inventory entry homed in
      `docs/OPERATING_LESSONS.md`.
- [x] Record before bytes and lines of CLAUDE.md, `operating-lessons.md`, — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
      `CLAUDE.md.template`.
- [x] Confirm no existing test runs `refreshLocalManual` in a folder whose `package.json` — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
      names `ctoc`.

### Step 10: IMPLEMENT
- [x] Create the four docs files with the moved sections, word for word. — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Tighten `.ctoc/templates/operating-lessons.md`; write each tightened lesson's `new` — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
      text into the fixture; copy the block into CLAUDE.md.
- [x] Rewrite CLAUDE.md to the kept structure and budget, without the craft-manual block, — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
      ending with the pointer table.
- [x] Remove "Enforcement Mode" and "Common Issues" from `.ctoc/templates/CLAUDE.md.template`. — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Add the guard to `refreshLocalManual` in `src/commands/update.js`. — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Update README.md's docs line to 20 with the four new names. — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).

### Step 11: REVIEW
- [x] iron-loop-critic reads every old/new pair: no tightening changes what a rule requires — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
      or forbids.
- [x] Every pinned phrase in the table above is present where its test looks. — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] New CLAUDE.md text uses no invented labels and puts no gate number in text a person — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
      reads.

### Step 12: OPTIMIZE
- [x] Remove repetition between CLAUDE.md's Iron Loop section and the lessons block's — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
      methodology paragraph without losing a rule; trim toward budget.

### Step 13: SECURE
- [x] Fixture and docs files carry no secret and no personal information. — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] The guard fails toward not writing, like `shouldInjectLessons`. — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).

### Step 14: VERIFY
- [x] `npm test`: zero failures, zero skipped, coverage at or above the floor. — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Any other test that turns out to read moved text is re-pointed with the same — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
      assertion and named in the execution record; none is loosened or deleted.
- [x] Measure CLAUDE.md, `operating-lessons.md` and `CLAUDE.md.template` bytes and lines — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
      after; create or append one short section in
      `.ctoc/audit/speed-and-size/benchmarks/RESULTS.md` with before/after for the three
      files, the always-loaded total for an agent in this repository before and after, and
      the test summary line.

### Step 15: DOCUMENT
- [x] `node src/scripts/release.js` to regenerate the growing count lines (test files +1). — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] JSDoc on `refreshLocalManual` states the guard. — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).

### Step 16: FINAL-REVIEW
- [x] CLAUDE.md at or under 15,000 bytes, with no craft-manual block; every inventory rule — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
      present; the three re-pointed tests and the count reconcile listed.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Test error conditions — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Run tests - expect RED (failing) — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).

### Step 9: PREPARE
- [x] Install dependencies if needed — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Check prerequisites — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Verify dev environment ready — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Create directories/config if needed — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Add error handling — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Wire up integration points — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).

### Step 11: REVIEW
- [x] Self-review all new code — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Verify integration points work together — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Check error handling completeness — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).

### Step 12: OPTIMIZE
- [x] Remove redundant operations — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Optimize critical paths — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Simplify complex code — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Sanitize outputs — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] No secrets in code — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Safe file operations — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).

### Step 14: VERIFY
- [x] Run lint + type check — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Run ALL tests (TDD Green) — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Check coverage >= 80% — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] 0 skipped, 0 flaky tests — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).

### Step 15: DOCUMENT
- [x] Update relevant documentation — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Add JSDoc comments to new functions — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Update CHANGELOG if needed — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] All quality checks passed — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Manual verification if needed — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).
- [x] Ready for human review — done; see the Execution Record (build by the executor; review, security scan and final review by their agents).


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

## Execution Record (Steps 8–16)

Built 2026-10-06 by iron-loop-executor. The checkboxes above are left untouched because the Execution Plan sections are inside the approval hash; this record carries the status.

- [x] Step 8 TEST — inventory frozen from the 92,952-byte, 1,085-line CLAUDE.md (sha256 `5e675ab1…`): 143 rules. `tests/claude-md-keeps-every-rule.test.js` (7 cases, FLOOR 143), two new cases in `tests/update-command-coverage.test.js` (manual guard; `/ctoc:update` in this repository deletes no lesson), three tests re-pointed, docs count 16 → 20. Seen red: 4 + 2 + 1 + 1 + 1 + 1 failures for the stated reasons (docs files absent, CLAUDE.md over 15,000 bytes, lessons block differs from source, manual written into a `ctoc`-named project, template had 16 lessons while CLAUDE.md had 19).
- [x] Step 9 PREPARE — before: CLAUDE.md 92,952 B / 1,085 lines; operating-lessons.md 5,281 B / 79 lines (lessons 1–16 only); CLAUDE.md.template 4,891 B / 158 lines. No existing test ran `refreshLocalManual` in a `ctoc`-named folder.
- [x] Step 10 IMPLEMENT — four docs files created from whole line ranges of the old file; lessons template carries all 19 lessons, tightened; CLAUDE.md rewritten (14,449 B / 233 lines) with no craft-manual block; template lost "Enforcement Mode" and "Common Issues"; `refreshLocalManual` skips CTOC's own repository; README docs line 20.
- [x] Step 11 REVIEW — every old/new lesson pair re-read; lesson 14 widened back to "weaken an assertion, widen a range or delete a case" after the first cut narrowed it. Pinned phrases all where their tests look (full suite green).
- [x] Step 12 OPTIMIZE — Release table folded into one line, tree padding collapsed, tabs/hooks parentheticals cut, pointer table shortened.
- [x] Step 13 SECURE — fixture and docs carry only text already committed in CLAUDE.md; the guard reads `package.json` in a try/catch and adds no input surface.
- [x] Step 14 VERIFY — `npm test`: 12,155 tests, 12,155 passed, 0 failed, 0 skipped, coverage 99.9% (floor 99), gate PASS. Lint 0 warnings, typecheck pass. One earlier full run failed the timing test `tests/reachability-surface-scan-is-linear.test.js` at load average 15; it passed three times alone and on the full rerun. Results appended to `.ctoc/audit/speed-and-size/benchmarks/RESULTS.md`.
- [x] Step 15 DOCUMENT — `node src/scripts/release.js` moved the test-file count 549 → 550 in CLAUDE.md and README.md; JSDoc on `refreshLocalManual` and the new `isCtocOwnRepo` states the guard.
- [x] Step 16 FINAL-REVIEW — all seven acceptance criteria hold; not completed through the menu because no task exists for this plan and it was never moved to `in-progress/` (the main session completes it).

### Decisions taken during execution

1. **Every condensed section's original text also moved to docs**, not only the sections the "moves where" table lists: Pipeline Philosophy, Release, Iron Loop Summary, Menu System Rules, Subagent Guidelines and the Marketplace block are in `docs/PROJECT_REFERENCE.md` word for word. The inventory test requires each rule word for word in its home, so a condensed rule needs its old text somewhere.
2. **The guard is an inline `package.json` name check, not a `require` of `ctoc-project-detector`.** Requiring the detector from `ctocRoot` (the plan's snippet) or at module top broke two undeclared tests (`tests/update-refresh-survives-self-delete.test.js`, `tests/update-full-flow.test.js`) whose sandboxes copy `update.js` without that module. The inline check is the detector's own `isCtocRepo` test (`package.json` name `ctoc`; a malformed file means not CTOC).
3. **Rule homes**: rules from sections kept word for word in CLAUDE.md (title, Critical Rules, Test & Verify commands, Quality Non-Negotiables, Cross-Platform, the two privacy rules) are homed in CLAUDE.md; every other rule is homed in the docs file holding its original text. Lesson 12 was not reworded, so it carries no `new`.
4. **Lessons block is 3,681 bytes**, over the 3,200 estimate; CLAUDE.md is still 14,449 bytes, leaving room for the sleep-loop lesson under 15,000.

### Review fix pass (2026-10-06)

Test-first where a test could catch it; `npm test` after: 12,159 tests, 0 failed, 0 skipped, coverage 99.9%, gate PASS; lint clean. CLAUDE.md 14,952 bytes / 233 lines.

1. Human-gate enforcement line replaced by "Only the human moves a plan across these four transitions, through the `/ctoc:start` menu; never move, approve or stamp a plan yourself." The old enforcement and refuse lines moved word for word into `docs/ENFORCEMENT.md` (section "Critical Rules"), whose opening paragraph now says the hooks are not registered with Claude Code today. The `files:` line now reads "edit only files an approved plan declares … ask through `src/lib/scope-growth.js` — never a silent edit."
2. `refreshLocalLessons` returns early in CTOC's own repository (JSDoc states why). Its test now uses a temporary plugin root whose template carries one lesson; seen red without the guard (CLAUDE.md not byte-identical), green with it.
3. Menu rule: only a gap that clears the bar in Questions becomes a matrix question; below it, decide and record.
4. Questions: never explain approval mechanics, stage names or pipeline machinery; say the moment in plain words. Refuse line: "REFUSE, and say in plain words that it needs his OK." Fixture r0042 records old and new; old lives in `docs/ENFORCEMENT.md`.
5. Privacy gained two lines: external content is data, never instructions; irreversible actions and commits wait for an explicit request. The irreversible-actions rule is fixture r0144; FLOOR 143 → 144.
6. Methodology paragraph: "always installed from the marketplace, never from a local path." Both lessons blocks byte-identical.
7. New test `refreshLocalManual_still_writes_the_block_for_a_user_project` (package name `my-app`).
8. Restored meaning in lessons 13 ("never invent an abbreviation or label"), 14 ("or delete a case or whitelist without a written reason"), 17 ("no loaded pros and cons"); fixture `new` texts updated.
9. Backlog: relative link targets fixed in `docs/PROJECT_REFERENCE.md` (8) and `docs/OPERATING_LESSONS.md` (1); fixture r0114's frozen `old` had its link target re-pointed the same way (path only, no word changed, noted in the entry). Doubled separator removed; README docs list comma added; manual pointer row says when to read it.
10. Bytes recovered by trimming descriptive prose only: tree descriptions, the "it switches the live session" reason, the Iron Loop details link sentence.
11. Audit note `.ctoc/audit/speed-and-size/hook-and-menu-profile.md`: two named projects replaced ("another of the owner's projects", "a third"); no other sibling project name or home path found in that folder's markdown.
