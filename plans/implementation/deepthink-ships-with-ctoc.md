---
title: "Deepthink ships with CTOC, and the decision-question format carries the three rules that only the personal copy has"
type: functional
status: functional
created: 2026-09-30
priority: medium
effort: medium
files:
  - skills/deepthink/SKILL.md
  - skills/ask-me-questions/SKILL.md
  - .ctoc/ask-me-questions.md
  - .ctoc/audit/agent-and-skill-improvement/skills/deepthink/SKILL.md.json
  - README.md
  - CLAUDE.md
  - tests/deepthink-ships-with-ctoc.test.js
depends_on: none
approved_by: human
approved_at: 2026-09-30T10:09:57.907Z
gate_crossed: functional → implementation
---

# Deepthink ships with CTOC, and the decision-question format carries the three rules that only the personal copy has

**This file is an INDEX of its implementation slices, not a buildable plan.** It carries no `## Execution Plan`; build the slices below one at a time, in the order of the table — never this file. Everything below the line is the approved plan, unchanged, including its frontmatter.

## Slices (dependency-ordered)

The slice files carry the placeholder prefix `NNNNN-`, because allocating a plan number stakes a claim file under `.ctoc/state/plan-numbers/`, which needs running code and a write outside `plans/implementation/`. The route that fits `src/lib/plan-numbering.js`: for each slice in the order of the table, call `allocatePlanNumber` once and replace the leading `NNNNN` of that slice's file name with the number it returns; then rewrite every slice's `depends_on` from the old name to the new with `remapReferences` from the same module. `renumberImplementationPlans` must not be used for this: it reads `NNNNN-` as no number and would put a number in front of it. `parent_plan` does not change, because this file keeps its name.

| # | Slice file | Scope (one line) | Files it may write | depends_on |
|---|---|---|---|---|
| 1 | `00397-deepthink-ships-with-ctoc-s1-decision-format-fold-in.md` | The three rules only the personal copy has — the lettered menu last on screen, the new-ideas block, the wait-until-satisfied rule — folded into both mirror files at once with none of CTOC's rules removed; the fingerprints and the real comparison recorded before the first edit; the plan's test file begins with the fold-in's checks. | `skills/ask-me-questions/SKILL.md`, `.ctoc/ask-me-questions.md`, `tests/deepthink-ships-with-ctoc.test.js`, `CLAUDE.md` (count rule only) | none |
| 2 | `00398-deepthink-ships-with-ctoc-s2-deepthink-skill-and-counts.md` | `skills/deepthink/SKILL.md` adapted as the decisions say, its checks written first; every count the new file moves tightened in README.md and CLAUDE.md; deepthink added to the coverage gate's list of always-available top-level skills. | `skills/deepthink/SKILL.md`, `tests/deepthink-ships-with-ctoc.test.js`, `README.md`, `tests/cu5-wrapper-coverage-completeness.test.js`, `CLAUDE.md` | slice 1 |
| 5 | `00415-deepthink-ships-with-ctoc-s5-web-only-reading-agent.md` | All of the owner's answers of 2026-10-02: a reading agent for deepthink alone, `agents/ai-quality/deepthink-researcher.md`, holding `WebSearch` and `WebFetch` and no other tool, with the skill switched to it and every agent count moved from 124 to 125; the paper program shipped as the plugin file `skills/deepthink/fetch-papers.cjs` and run where it stands, nothing copied into a project (scope-growth request `1790877923785-g7rtsc` carried out); the paper library kept out of version control, the briefs not; and the two program defects slice 2's final review left — "already in the library" only when the file is there, and a rerun after a cut-off run indexing the papers that run kept. Built after slice 2 and before slice 3. | `agents/ai-quality/deepthink-researcher.md`, `skills/deepthink/SKILL.md`, `skills/deepthink/fetch-papers.cjs`, `tests/deepthink-ships-with-ctoc.test.js`, `tests/watcher-shape.test.js`, `.ctoc/watcher-baseline.json`, `tests/readme-numbers.test.js`, `README.md`, `tests/cu5-wrapper-coverage-completeness.test.js` (one comment), `.gitignore`, `eslint.config.js`, `CLAUDE.md` (count rule only) | slice 2 |
| 3 | `00399-deepthink-ships-with-ctoc-s3-three-improvement-rounds.md` | Deepthink's three rounds of research, critique and validated update, recorded in the improvement record's shape in a sibling directory, with the check for that record written first. | `skills/deepthink/SKILL.md`, `.ctoc/audit/deepthink-improvement/skills/deepthink/SKILL.md.json`, `.ctoc/audit/deepthink-improvement/for-the-human.json` (only when a finding cannot be applied), `tests/deepthink-ships-with-ctoc.test.js`, `CLAUDE.md` (count rule only) | slice 2 |
| 4 | `00400-deepthink-ships-with-ctoc-s4-real-run-and-closing-checks.md` | The finished skill followed for real in a disposable project on a decision question, a source and an open topic; the refused launch; the closing checks of the whole plan and the full gate. | nothing in the repository — its evidence goes into its own execution record | slice 3 |

Every slice ends with `npm test` and one commit carrying a patch version; no slice pushes. Each commit runs the release sync, which rewrites README.md's version lines — and, in slice 1, its test-file count — without README.md being declared, so no slice here is built at the same time as a README rebuild slice that writes README.md; the dispatcher holds that, as it does for the improvement run's slices.

### Who closes what

Each acceptance criterion is closed by exactly one slice — the slice that finishes its work and records its evidence; earlier slices feed it, and each slice names what it feeds.

| Scenario | Closed by slice | Scenario | Closed by slice |
|---|---|---|---|
| 1 | 2 | 12 | 4 |
| 2 | 2 | 13 | 2 |
| 3 | 4 | 14 | 1 |
| 4 | 4 | 15 | 2; the agent count 5 |
| 5 | 4 | 16 | 4 |
| 6 | 4 | 17 | 4 |
| 7 | 4 | 18 | 5, as replaced by the owner's decision of 2026-10-02 |
| 8 | 4 | 19 | 4 |
| 9 | 4 | 20 | 3 |
| 10 | 4 | 21 | 4 |
| 11 | 4 | 22 | 4 |

| Definition of Done item, in the parent's order | Closed by slice |
|---|---|
| The test written first, run, and seen failing | 4 (each slice records its own failing run) |
| `skills/deepthink/SKILL.md` complete, no stub, the five choices followed | 2 |
| Scenarios 1, 2, 13 to 18 and 21 pass as tests or recorded output | 4 |
| Scenarios 4 to 12, 19 and 22 recorded from a real run; scenario 7 as stated | 4 |
| The fold-in and the mirror byte-identical and changed together; the pre-change list intact | 1 |
| README and CLAUDE.md edited as the count table says, by tightening; not at the same time as a README rebuild slice | 2 |
| The comparison of the two copies repeated with a real `diff`, its output recorded | 1 |
| Deepthink's three rounds recorded; the improvement run's inventory, plan and check unchanged | 4 (fed by 3) |
| Scenario 3 observed after shipping, or said plainly not to be | 4 |
| `npm test` passes | 4 |
| Reachable from a live entry point in the same unit of work | 2 |

### Where the slicing departs from the suggested cut, and why

- **The skill and its counts are one slice (slice 2).** The moment `skills/deepthink/SKILL.md` exists, five pins in `tests/readme-numbers.test.js` that derive their number from the disk go red, and so does the coverage gate in `tests/cu5-wrapper-coverage-completeness.test.js`. A skill slice without the count edits would fail its own gate.
- **The test-file count moves in slice 1**, because the plan's test file begins there, with the fold-in's checks written first.
- **Two paths beyond the approved `files:` list:** `tests/cu5-wrapper-coverage-completeness.test.js` (slice 2) and the sibling record directory `.ctoc/audit/deepthink-improvement/` (slice 3). The approved path `.ctoc/audit/agent-and-skill-improvement/skills/deepthink/SKILL.md.json` is written by no slice. This file's frontmatter is left as it was approved.
- **The real run and the closing checks are one slice (slice 4)**, and it makes three runs, not one.
- **Slice 5 was added on the owner's decision of 2026-10-02, and it reverses this plan's decision to add no agent.** Slice 2's security scan (finding 1, high) found that `citation-validator` holds `Read` beside its web tools while deepthink feeds it arbitrary web content, and that CTOC's file guard lets `~/.netrc`, `~/.npmrc` and `~/.config/gh/hosts.yml` through. The owner chose a reading agent for deepthink alone, with web tools and no file-reading tool — in the owner's words, "an extra agent is not an issue". So "A new agent: none", "no file under `agents/` is changed by this plan", "the agent counts still read 124" and scenario 18's "the reading agent is the existing one" are replaced; slice 5 closes scenario 18 in its replaced form and the agent half of scenario 15. Slice 5 is built before slice 3; slice 3's approved `depends_on` still names slice 2, so the dispatcher holds that order. The file-guard change goes to a functional plan of its own. Slice 5 also carries the owner's two other answers of 2026-10-02 — the paper program shipped as the plugin file `skills/deepthink/fetch-papers.cjs` (scope-growth request `1790877923785-g7rtsc`) and `.ctoc/papers/` ignored in version control, the briefs not — and the two program defects slice 2's second final review left to it. Read with slice 5, slices 3 and 4 name the wrong reader: the agent the skill launches is `deepthink-researcher` and the program is the plugin file `skills/deepthink/fetch-papers.cjs`; slice 4's "the dispatching session launches `citation-validator`" is superseded and must not be followed. Both new files reach a session only from the installed plugin, so slice 4's real run can pass only after the owner pushes, updates CTOC from the marketplace and restarts. Slice 4 reads the skill from this repository, where its two commands carry `${CLAUDE_PLUGIN_ROOT}` unfilled, and the skill forbids running a command that still holds `${`; so before running each command, slice 4's build replaces `${CLAUDE_PLUGIN_ROOT}` with the installed plugin's root, never with this repository's path, so the run exercises the shipped program and its relative path to `src/lib/safe-fs.js`. Slice 3's rounds read `skills/deepthink/fetch-papers.cjs` beside the skill, read-only, so a reworded sentence about the program is checked against the code; a finding in the program goes to the owner's list as `out-of-scope-file`.

### What the disk contradicted in the approved text

Each was read on 2026-09-30; each slice that meets one says so and records its choice under its own Decisions Taken Under Ambiguity.

1. **The improvement record check reads every file in its own directory.** `checkRecordDir` in `tests/agent-and-skill-improvement-record.test.js` lists every file under `.ctoc/audit/agent-and-skill-improvement/` at any depth and fails with `record-not-in-inventory` for a record whose path is not inventoried; its own fixture case proves it. So a deepthink record at the approved path turns that check red, and scenarios 20 and 21 cannot both hold as written. "Never walks the disk" in the count table is true of `skills/`, not of the record directory. Slice 3 writes the record, in the same shape, at `.ctoc/audit/deepthink-improvement/skills/deepthink/SKILL.md.json`.
2. **The coverage gate turns red on the new skill.** `tests/cu5-wrapper-coverage-completeness.test.js` requires every skill body to be reached through an agent, a no-wrap verdict in the 2026-06-15 corpus audit, or its list of always-available top-level skills. The approved plan adds no agent; slice 2 adds deepthink to that list and tightens the list so it cannot name a skill that does not exist, with the justification written out.
3. **CTOC's work-dispatch rule is record first.** `src/commands/start.md` forbids launching a background agent before `menu task add` and the scheduler's decision; the approved order reads "launch, then … the task entry". Slice 2 records first, launches only when the scheduler says run, and marks the task running only once the launch was allowed — the approved rule that nothing says running before then still holds.
4. **A shell append of web-derived rows puts untrusted text into a command.** The approved plan appends the index rows "with a shell append", and also forbids assembling web-derived text into a shell string. Slice 2 keeps append-never-rewrite with one fixed program that reads a staging file and appends in append mode.
5. **An append-only index cannot hold one contiguous table** when several runs append; slice 2 makes the index a sequence of per-run blocks, each with its table and its "Web sources cited, not papers" list.
6. **Scenario 10's list of changed files omits CTOC's own bookkeeping** that every run writes: the dispatch record, the plan-index store and the logs. Slice 4 names each and counts them with the task record.
7. **The launch fence matches the name `Task`** in `.claude-plugin/hooks.json`, while the dashboard's recipes launch `Agent(run_in_background)`. Whether the fence sees the launch the session makes was not read; slice 4 observes it and returns a miss upstream as a finding.
8. **Scenario 8 cannot come from one run on a decision question**, which the Definition of Done asks for; slice 4 adds one run on a source and one on an open topic.
9. **The slash command cannot be typed before the human ships**, and a local install is forbidden; slice 4 follows the repository copy of the skill and says so.
10. **The improvement run's own closing checks will see this plan.** Its closing slice (`00381-every-agent-and-specialist-skill-improved-three-times-s121-record-check-requires-three-rounds`) checks "101 skill bodies" from a listing of the disk, which reads 102 after slice 2, and lists every path changed since its first slice, which will include this plan's paths. Nothing of that plan is edited here; this is a fact for the human at that plan's finished moment.
11. **A test that pinned the README sentences the rebuild rewrites would break the rebuild's builds**, which cannot edit this plan's test. Slice 2's checks hold the combined count sentences only where they appear, plus the two forms the rebuild keeps pinned and the fact that the Skills section names deepthink.
12. **Noted, not edited:** the assertion message in `tests/plugin-skill-discovery.test.js` still calls `ask-me-questions` "the only depth-1 skill"; the README sentence "Each lives at `skills/<category>/<name>/SKILL.md`" is false for both top-level skill bodies and belongs to the README rebuild's claim checks.

### Technical dependencies across plans (the order is the human's)

- **Slice 1 and the improvement run's slice for the decision-question format** (`00268-every-agent-and-specialist-skill-improved-three-times-s8-ask-me-questions`) both declare `skills/ask-me-questions/SKILL.md`, so they are never built at the same time. Either order works technically; slice 1 states what each order means for that slice's record.
- **Slice 2 and the README rebuild** (`00382-…-s1-…` to `00396-…-s15-…`, in the build queue as one chain). Slice 2 hand-edits README.md, which the rebuild's slices 7 to 15 also write, so they are never built at the same time. The rebuild's census and counting slices measure 429 skill files and 101 bodies; if slice 2 lands between that measuring and the rebuild's record totals, those counts are measured again after it lands. After slice 2, the plan's test holds two README facts every later README edit must keep true.
- **Slice 3 and the improvement run.** The critic's web tools come from that run's first slice (`00261-…-s1-agent-critic-gains-web-research`, built); its slices for `citation-validator`, the executor and `agent-critic` (`00375-…`, `00378-…`, `00379-…`) edit the instruments slice 3 uses, so every round records their fingerprints. The improvement run's inventory is untouched by every slice here.

---

## 1. ASSESS — Problem Understanding

### Problem statement

The human's request of 2026-09-30, verbatim: "add the ask-me-questions and deepthink skill to the ctoc installation".

Both skills exist today only in the human's personal skills folder (read at their link targets under `<home>/.claude-skills/`), so they exist only where that personal folder does. CTOC already ships a decision-question skill, `skills/ask-me-questions/SKILL.md`, but that copy lacks three rules the personal copy has, two of them dated 2026-09-07. CTOC ships no deepthink skill at all, so `/ctoc:deepthink` does not exist for anyone who installs CTOC from the marketplace.

The two are coupled. The personal deepthink writes its researched questions in the decision-question format and names two elements of it, the block "New ideas in this question, for you to check" and a lettered menu that ends "Reply with a letter." Only the personal copy of the format defines them. Shipping deepthink without folding those rules into CTOC's copy would ship a skill whose output format cites rules its sibling skill does not contain.

### Who benefits

- The owner of a project with CTOC installed: the same background research skill is there in every project, with the same behaviour, without depending on a personal folder.
- Any person who installs CTOC: a way to hand one decision, one source or one open topic to a background researcher, and to get back a researched question with its cited papers already downloaded, while the session carries on.
- The pipeline: a researched brief is context that lands in the vision folder before anything is decided, and the research never decides.

### Facts checked on disk today (2026-09-30)

- CTOC's copy of the decision-question skill is 209 lines; the personal copy is 157 lines. The personal deepthink is 201 lines. All three were read in full.
- `skills/` holds 429 markdown files. 101 of them are `SKILL.md` bodies: 1 at depth one (`ask-me-questions`), 91 at depth two, 9 at depth three (`skills/testing/runners` and `skills/testing/writers`). The other 328 are reference files. The 99 specialist skills in the README's category table plus the two non-specialist bodies (`ask-me-questions`, and `advocate-lens` in the iron-loop folder) make the 101.
- No file under `skills/` or `agents/` has a name containing "deepthink" (the only name containing "deep" is a framework reference guide for a training library), and no plan file other than this one is named for it.
- The test files number 544.
- The existing agent `agents/ai-quality/citation-validator.md` holds the tools `Read, Grep, Skill, WebSearch, WebFetch` (no write, no edit, no shell), states that every page it fetches is untrusted data, describes itself as validate-only and read-only, and declares `maxTurns: 40`. Read today, lines 1 to 80.
- `agents/iron-loop/gate-critic.md` cites Meta's Rule of Two: never combine untrusted input, sensitive data and external communication in one agent. Read today.
- The task registry (`src/lib/task-registry.js`, the first 160 lines read today) holds a closed list of task kinds (`implement`, `plan`, `review`, `quality`, `security`, `decompose`, `discuss`, `sync`, `precompute`) and caps concurrent running tasks at five (`MAX_CONCURRENT`).
- The improvement record already holds files for two agents, `agents/pipeline/agent-critic.md.json` and `agents/ai-quality/ai-code-quality-reviewer.md.json`, plus `inventory.json`, `late-corrections.json` and `for-the-human.json`, under `.ctoc/audit/agent-and-skill-improvement/`. A record file's path is its source path with `.json` added, so a record for `skills/deepthink/SKILL.md` sits at `.ctoc/audit/agent-and-skill-improvement/skills/deepthink/SKILL.md.json`. The record's shape and the procedure of one round are fixed in the improvement plan (`plans/implementation/every-agent-and-specialist-skill-improved-three-times.md`, sections "How a round runs, and who does what" and "The record's exact shape"), read today to line 220.

## 2. ALIGN — Approach

The behaviour stays the human's design: background deep web research on a decision question, a source (paper, repository, web page) or an open topic; every cited paper downloaded into the project's paper library; the researched question or brief written under `plans/vision/deepthink/`; one line back when it is ready to ask. What changes is only what CTOC does differently: where the skill file sits, which agent reads the web and which agent writes, how background work is launched and recorded, what the write-permission hook allows, plain words, and the rule that web content is data. Each such change is a documented choice under `## Decisions Taken Under Ambiguity`.

### The comparison of the two decision-question copies — the real result

Method: both files were read in full and compared by reading. The agent that wrote this plan holds no shell and ran no comparison program. The build repeats the comparison with a real `diff` and records its output.

The brief's premise was that the personal copy is older in substance. That holds where the two overlap, and is false in one respect: the personal copy carries three rules CTOC's lacks. Two are dated 2026-09-07 and the third carries no date, and 2026-09-07 is later than the newest dated rule in CTOC's copy (2026-07-29). The two copies diverged in both directions.

| Topic | Personal copy | CTOC copy | Result |
|---|---|---|---|
| A lettered menu, the last thing on screen, on every question in every mode including plain text; the human replies with a letter; the recommended option marked only on a quality decision (dated 2026-09-07) | present | absent | fold in |
| "New ideas in this question, for you to check": every element the human has not said is listed under the matrix, before the menu, and nothing unconfirmed is recorded as decided (dated 2026-09-07) | present | absent | fold in |
| Do not move to the next question until the human has answered and says satisfied; never answer for the human; after an explanation stop and offer "satisfied, next" or "more on this" (no date) | present | absent (CTOC says: wait for the answer, then ask the next) | fold in, with the reading recorded under decisions |
| Sequencing stated as absolute, with no exemption | present | replaced by later text with the settings ride-along exemption | keep CTOC's; do not fold |
| Recommendation rule: exactly one Recommended cell, always the highest quality | present | replaced by the split into quality decisions (one recommendation) and owner decisions (none) | keep CTOC's |
| The paramount principle: maximize information gain, minimize interactions | absent | present | keep |
| A foregone answer is not a question; no rigged binary; no manufactured recommendation on an owner decision (dated 2026-07-29) | absent | present | keep |
| Cost transparency and web verification rules | present, and the rule numbering repeats the number five | present, numbered correctly | keep CTOC's |
| Worked example | heading "Email delivery provider" (a topic label with no question mark) and no explanation paragraph; it would fail CTOC's own matrix grader | question heading, explanation paragraph; graded by a test on every run | keep CTOC's |
| A references section whose text says "single quality-only recommendation" | present | absent | do not fold: it contradicts CTOC's later rule |
| Frontmatter description | older wording | later wording | keep CTOC's |

The three folded rules must not remove any rule CTOC's copy carried before. The test that guards this holds a list of CTOC's own headings and key sentences captured from the file as it stands today, before the fold-in.

### The binding that makes the fold-in a two-file change

`skills/ask-me-questions/SKILL.md` is a verbatim mirror of `.ctoc/ask-me-questions.md`. Two tests hold them byte-identical (`tests/ask-me-questions-skill.test.js` and a check inside `tests/readme-numbers.test.js`). The architecture test exempts this one skill from the frontmatter rule (`type: skill`, no `allowed-tools:`) for that reason. So the fold-in changes BOTH files together, with identical bytes, in the same unit of work: the lettered menu last on screen ending "Reply with a letter.", the "New ideas in this question, for you to check" block, and the wait-until-satisfied rule. The same tests pin three strings that must survive: `the one exemption`, `single AskUserQuestion call` and `One question per turn`; and no `plan-serial` may appear in the pair. A separate test grades the worked example (`gradeMatrix` and `gradeNoAbbreviations`), so the example stays a question heading, an explanation paragraph and one four-column matrix with exactly one Recommended cell.

### How the plugin discovers skills, and what must change for deepthink

`.claude-plugin/plugin.json` carries an explicit `skills` list of 24 entries: `./skills/` first, then 21 category folders, then `./skills/testing/runners` and `./skills/testing/writers`. `.claude-plugin/marketplace.json` names the plugin's source as `./` and carries no skill list. Claude Code scans a listed folder for `<name>/SKILL.md` one level down, so `skills/ask-me-questions/SKILL.md` is reached through the first entry. `tests/plugin-skill-discovery.test.js` enforces three things: every folder that directly holds a `<name>/SKILL.md` child is declared; `./skills/` is declared and is the first entry (because declaring subfolders replaces the default scan); no two skills share a frontmatter `name`.

Therefore `skills/deepthink/SKILL.md` at depth one is reached through the existing `./skills/` entry. Neither manifest changes. A new category folder would need a new entry, and the discovery test fails until it is declared; that route is not taken (see the decision on placement).

### Counts and pins the new skill file moves

After the change: 430 skill files, 102 skill bodies, 328 reference files (unchanged), 99 specialist skills (unchanged, deepthink is not one), 124 agents (unchanged, no agent is added). The new test file also moves the test-file count from 544 to 545. What reading established:

| Where | Says today | Must say | How it is kept true |
|---|---|---|---|
| README badge for skills | 429 | 430 | hand edit; the derived pin `badge: skills-<count>` goes red until then |
| README Key Features sentence "429 skill files — 101 specialist skill bodies" | 429, 101 | 430, 102 | hand edit; pinned (the file total) |
| README Skills section intro "**429 skill files**" | 429 | 430 | hand edit; pinned |
| README Skills section "Tier-2 specialist skill bodies (101): 99 Tier-2 specialists plus the ambient `ask-me-questions` decision format and the preloaded gate-lens skill" | 101 | 102, and the sentence names deepthink as a further non-specialist body | hand edit; the number is pinned, the wording is checked by the new test |
| README project-structure block "429 skill files: 101 specialist bodies (SKILL.md) + 328 reference files" | 429, 101 | 430, 102, 328 | hand edit; pinned (the file total) |
| README opening paragraph "429-file skill library (101 specialist bodies + 328 reference files)" | 429, 101 | 430, 102, 328 | hand edit; no test that was read pins it, so the new test does |
| README "Knowledge skills (328)" and "328 reference files" | 328 | 328 | no edit; the derived pin `Knowledge skills (<total minus bodies>)` keeps passing |
| README project-structure block "544 test files" | 544 | 545 | the release script rewrites it; the derived pin goes red when the new test file lands until the script runs or the line is edited by hand |
| CLAUDE.md `skills/` line, the integer | 429 | 430 | the release script (`node src/scripts/release.js`) rewrites the integer only |
| CLAUDE.md, the same line's parenthesis "(101 SKILL.md bodies = 99 Tier-2 specialists + 1 ambient format skill + 1 preloaded lens skill; + 326 reference)" | | "(102 SKILL.md bodies = 99 Tier-2 specialists + 2 ambient skills, the decision format and deepthink, + 1 preloaded lens skill; + 328 reference)" | hand edit; no test pins it. The 326 is already false: 429 minus 101 is 328, measured today |
| CLAUDE.md test-file counts (two places) | | 545 | the release script |
| README and CLAUDE.md agent counts (124) | 124 | 124 | no edit: no agent is added, because the existing `citation-validator` does the reading |
| `tests/readme-numbers.test.js`: "at least 99 SKILL.md bodies" | floor of 99 | not moved | it stays true at 102; the README rebuild plan replaces it with a derived pin |
| `tests/agent-and-skill-improvement-record.test.js`: expected 101 skill bodies, 225 in total | | not moved | the check compares the inventory's own entries with those numbers and never walks the disk (as read for this plan's assessment), so a skill outside the inventory does not break it; the build runs the check to confirm |
| `.claude-plugin` description strings (60 agents, 265 skills) | | not moved | found already false against the disk (124 agents, 429 skill files); the release script syncs versions only; no test that was read pins the text; not touched here, reported to the human |
| README comparison table cell "99 SKILL.md bodies through critique loop" | | not moved | already differs from the true 101; it belongs to the README rebuild plan |

The list above is what reading established. It is not claimed complete: the sixteen documents under `docs/`, the project template `.ctoc/templates/CLAUDE.md.template` and the command bodies were not read for skill totals. The build's census is a real run: add the skill file, run the whole suite, and treat every red result that names a skill count as a pin to tighten to the new true number, never to loosen.

### Sequencing facts (technical dependencies; the order is the human's)

1. **The three-round improvement run and deepthink.** The run over the 101 skill bodies (parent plan `every-agent-and-specialist-skill-improved-three-times`) has its inventory fixed at 225 files. Deepthink is not added to that inventory, and neither the approved plan, `inventory.json` nor the record check's expected numbers (225, 101) are edited. Deepthink instead receives its own three rounds inside this plan, recorded at `.ctoc/audit/agent-and-skill-improvement/skills/deepthink/SKILL.md.json` in the record shape the improvement plan fixes. Two consequences: any description of the improvement run drawn from its inventory (the README rebuild's description is drawn only from the improvement record) covers 101 skill bodies, and deepthink's separate record is a fact that description may mention but must not fold into the inventory's totals; and the deepthink rounds edit `skills/deepthink/SKILL.md` after the count pins were tightened, which moves no count.
2. **The decision-question skill's slice in the improvement run.** That run's slice for `skills/ask-me-questions/SKILL.md` declares that file only, and its own text says `.ctoc/ask-me-questions.md` lies outside its permitted files, so any change it finds is recorded for the human and never applied. This plan's fold-in declares the same skill file and the mirror. Two builds must not edit the pair concurrently; the scheduler serializes plans whose declared files overlap. If the fold-in lands before that slice runs, the slice's first round starts from a file whose fingerprint differs from the inventory's starting one. The record already has a field for an unrecorded edit before a round (`resumed_after_unrecorded_edit`), and the record check compares rounds with each other, not the inventory's starting fingerprint with the disk. Also, the improvement run's slice for `agents/ai-quality/citation-validator.md` edits the reading agent's definition; deepthink relies on that definition staying read-only, which is why the test in scenario 18 guards its tool list.
3. **The README rebuild.** The README is being rebuilt by `the-readme-matches-the-product-today`: fifteen slices wait in the build queue as one chain. Its index states that the nine slices from the opening and quickstart through the record totals and full gate all write `README.md`, and that five of them (the opening and quickstart, the stage-by-stage part, the reference part, the comparison table and the three-round description) also write `tests/readme-numbers.test.js`. This plan's README count edits must not run concurrently with any of those slices' builds. There is a second, truth-related dependency: the rebuild's census slice and its "counted" claim rows measure 429 and 101. If the new skill lands between that measuring and the slices that pin numbers, the rebuild's record holds numbers the disk no longer has. So either order works technically only if the counts in the rebuild's record are measured after the new skill file exists, or re-measured after it lands.
4. **The subagent-launch fence.** The fence (`src/hooks/PreToolUse.Task.js`) enforces CTOC's standing limit of five concurrent background subagents, cannot be lifted by an escape phrase, and refuses the sixth launch; the task registry's own cap is the same five. A deepthink run takes one of the five slots (the reading agent). The skill therefore must not say "running", and must not record the task as running, until the launch was allowed.

### Scope

#### In scope

- A new `skills/deepthink/SKILL.md`, adapted as the decisions below say: the existing `citation-validator` does the web reading, the driving agent does every write, the paper library is `.ctoc/papers/` with its index file, the brief is under `plans/vision/deepthink/`, a run is recorded under the `discuss` task kind, and a researched question follows CTOC's recommendation rule.
- The fold-in of the three rules into `skills/ask-me-questions/SKILL.md` and `.ctoc/ask-me-questions.md`, changed together with identical bytes and none of CTOC's later rules removed.
- The count and wording edits listed in the table above, in `README.md` and `CLAUDE.md`.
- One new test file, `tests/deepthink-ships-with-ctoc.test.js`, written first and seen failing.
- Deepthink's own three improvement rounds (research and critique by `agent-critic`, validation by `citation-validator`, update by the build executor) and their record at `.ctoc/audit/agent-and-skill-improvement/skills/deepthink/SKILL.md.json`.
- A recorded real run of the finished skill (Definition of Done).
- Evidence that the human's personal files and the improvement run's inventory are untouched.

#### Out of scope (each states where it lives)

- Any change to `.claude-plugin/plugin.json` or `.claude-plugin/marketplace.json`: nothing is needed for discovery. The stale description strings are reported, not fixed here; the human decides whether to fix them.
- A new slash command specification in `src/commands/`: CTOC ships three, and the pin that counts them is not moved.
- Source changes to the task registry, the hooks or the dashboard screens: none. A deepthink run is recorded under the existing `discuss` kind, so no kind is added.
- A new agent: none. The existing `citation-validator` does the reading, and this plan does not edit any file under `agents/`.
- Adding deepthink to the improvement run's inventory, or editing the approved improvement plan or its record check: not done. Deepthink's three rounds live in this plan.
- Rebuilding the README: `the-readme-matches-the-product-today`. This plan edits only the count and wording lines listed.
- Changing the numbered replies of CTOC's dashboard screens: the fold-in changes instruction text only.
- Writing into the streaming question store: deepthink presents its researched question through the session as today. The store is denied to agents.
- Anything under `<home>/.claude/` or `<home>/.claude-skills/`: read only, never modified or deleted.
- Installing from anywhere but the marketplace, never from a local path. Pushing is the human's act; the push of this work follows the human's own instruction quoted under `## Decisions By The Human`, and this plan adds no push step of its own.

### What was not verified (said plainly)

- The live listing of `/ctoc:deepthink` in a Claude Code session. It can only be observed after the human ships and installs from the marketplace.
- Whether the shell classifier recognizes a download command such as `curl -o` or `wget -O` as a write. It no longer decides the outcome: the first 220 lines of `src/lib/shell-write-targets.js` were read, and redirects (`>`, `>>`) are recognized as writes, so appending a row to the index is a covered channel; but every destination the skill writes (`.ctoc/papers/` and `plans/vision/deepthink/`) is always allowed by the write-permission hook, so a recognized write is allowed as well. A real run confirms that no write is refused.
- Which download command each platform offers. The build names one that runs on macOS, Linux and Windows and records what it ran.
- Whether the reading agent's turn limit (`maxTurns: 40` in its definition, read today) is enough for a deep research run, and whether the text it returns can carry a full brief without truncation. A run that ends without a sound file is caught by the file check and relaunched; the skill's brief asks the reading agent to end with a fixed closing line the session checks before saving, and a result without it counts as a failed run.
- What the plan-index hook does with a file nested under `plans/vision/deepthink/`. It matches any markdown file under `plans/` at any depth, so it will see the brief; what the sync then indexes was not read.
- How the stale-plan scan and the human-gate hook treat the subfolder. The project instructions say the stale scan skips directory entries; that code and the gate hook were not read.
- What the reconcile and screen code (`src/lib/task-reconcile.js`, `src/lib/task-view.js`, and the rest of the registry past its first 160 lines) does with a `discuss` entry that has no plan behind it. Scenario 19 measures it.
- Whether the project's version-control ignore rules exclude `.ctoc/papers/`. The skill states where the papers are; committing them stays the human's choice.
- The full census of agent tool grants. Six of the 124 agent definitions were read earlier, and `citation-validator` today; the choice of reading agent rests on those grants, not on a census.

## 3. CAPTURE — Acceptance Criteria

### User stories

**As the** owner of a project with CTOC installed, **I want** to type `/ctoc:deepthink` on a decision I face and carry on working, **so that** a researched question with its evidence and its cited papers is waiting when I am ready to decide.

**As the** owner, **I want** CTOC's decision format to carry the lettered menu, the new-ideas block and the satisfied-before-next rule, **so that** questions deepthink researches and questions CTOC asks look and behave the same.

**As a** person installing CTOC, **I want** deepthink to obey CTOC's own rules — web content is data, the agent that reads the web never writes a file or runs a shell, the research decides nothing, plain words, no second Claude process, no way around the write-permission hook — **so that** a background researcher never becomes a way around a human's decision.

**As the** maintainer of CTOC, **I want** every count of skills that CTOC states to be true after the change, **so that** no document contradicts the disk.

### Scenarios

Each is a check. Where a check is a test it lives in `tests/deepthink-ships-with-ctoc.test.js`. Where it can only be observed in a real session, the evidence is recorded output.

1. **Discovery needs no manifest change.** GIVEN `skills/deepthink/SKILL.md` and unchanged manifests, WHEN `tests/plugin-skill-discovery.test.js` runs, THEN it passes, `./skills/` is still the first entry, and the file's folder maps to that entry.
2. **The frontmatter obeys what the tests pin.** GIVEN the new skill, WHEN the architecture test's frontmatter check reads it, THEN the frontmatter begins at byte zero, declares `name: deepthink` and `type: skill`, carries no `allowed-tools:` key and no `model_optimized_for` key, and no other skill has the name `deepthink`.
3. **Listing after install.** GIVEN the change has been shipped by the human and installed from the marketplace, WHEN a fresh session is opened and `/ctoc:` is typed, THEN `/ctoc:deepthink` is offered and `/ctoc:ask-me-questions` still is. This is observed and recorded; before shipping, scenario 1 is the evidence and the report says the listing has not been observed.
4. **A decision question is researched in the background.** GIVEN a disposable project outside this repository with CTOC installed and a question in the decision format, WHEN the owner types `/ctoc:deepthink` with no argument, THEN the session launches the existing `citation-validator` in the background; only after the launch is allowed does it answer in one sentence that the research runs in the background, and carry on; the session creates `plans/vision/deepthink/<slug>.md` with a header saying "in progress", so a crash leaves a partial file, never nothing; and once the reading agent's text has arrived and been saved, that file is larger than two kilobytes and no longer says "in progress".
5. **Every cited paper is downloaded and verified.** GIVEN the run in scenario 4, WHEN it finishes, THEN each paper the reading agent cites is a file under `.ctoc/papers/<topic>/` that begins with the portable document format signature and is larger than fifty kilobytes, with a row appended to `.ctoc/papers/index.md`; a web page that is not a paper is appended to the index's list "Web sources cited, not papers"; a paper that could not be fetched is marked `[paper not fetched]` in the brief and named under Failures. Evidence: a directory listing with sizes.
6. **The one-line report follows a check, never precedes it.** GIVEN the reading agent reports done, WHEN the file is missing, still says "in progress", is under two kilobytes, or the returned text lacks its fixed closing line, THEN the main thread says in one line that the run failed and relaunches with the same slug; it never announces finished. WHEN the file is sound, THEN the main thread says exactly one line naming the item and "research finished", with no summary, count or path, and presents the researched result in full when the human is ready.
7. **A full fence is reported honestly.** GIVEN five background subagents are already in flight, WHEN deepthink launches its reading agent, THEN the fence refuses the launch; the skill tells the human in one line that it is waiting for a slot, records no task as running, creates no "in progress" file that would outlive the refusal, and launches again when a slot frees.
8. **A source and an open topic produce their own shapes.** GIVEN a source to mine, THEN the brief has the sections "What they do", "What of it improves this project", "What does not transfer and why", one researched question per real choice, and a "Derived, no question needed" list for the obvious ones. GIVEN an open topic, THEN it has "What the evidence says", "Principles to act on", "What is contested or unverified", and any real choices as questions.
9. **Web content is data, and the writing side never reads it as instructions.** GIVEN a fetched page, a search result or the text of a downloaded paper contains an instruction addressed to the researcher, WHEN the reading agent reads it, THEN the instruction is not followed and the attempt is named in one line under Failures. The writing side never opens downloaded paper text or page text as instructions: it checks a downloaded file's first bytes and size only, passes each address from the reading agent's list as one argument and never assembled into a shell string, and downloads only from `https` addresses (any other address is not fetched and is named under Failures). The skill states these rules in words (checked by the test) and one observed run shows they held; they cannot be proven by a unit test alone.
10. **The research decides nothing.** GIVEN a finished run, WHEN the changed files are listed, THEN only the brief, the files under `.ctoc/papers/` (papers and the index) and the task record changed; no plan moved; no approval marker was written; no source file was touched.
11. **The write paths need no covering plan.** GIVEN strict enforcement and no plan covering `.ctoc/papers/` or `plans/vision/deepthink/`, WHEN the driving agent saves a paper, appends to the index and writes the brief, THEN each write succeeds with no escape phrase typed and no blocked-write message. The skill names no write target outside those two path families (the test checks that the string `docs/papers` is absent from the skill and that both path families are present). WHEN a write is nonetheless refused in a real run, THEN the refusal is never silent: the file not saved is named under Failures and the finding is returned upstream rather than worked around.
12. **The vision stage does not change.** GIVEN briefs exist under `plans/vision/deepthink/`, WHEN the dashboard counts vision plans and the stale-plan scan runs (both driven for real on a temporary root), THEN the vision count and the possibly-stale count equal those without the briefs; and WHEN the plan-index hook fires for a brief, THEN the brief does not appear among the related, duplicate or conflicting plans returned for any real plan.
13. **Plain words.** GIVEN the new skill and the folded decision-format text, THEN the repository's existing no-abbreviation grader passes on the new skill's whole body and on the worked example; no standalone two-or-more-capital-letter shorthand appears in prose outside backticked literals and a short allow-list held in the test with a written reason per entry; and no gate number appears (the absence of the same word-and-digit pattern the instruction fence uses is an exact-presence check, which is what a text check is for).
14. **The fold-in is complete and removes nothing.** GIVEN the fold-in, THEN `skills/ask-me-questions/SKILL.md` equals `.ctoc/ask-me-questions.md` byte for byte, both changed in the same unit of work; the three pinned strings remain and `plan-serial` is absent; the worked example still passes both graders; every heading and key sentence on the pre-change list is still present; and the three new rules are present: the lettered menu, last on screen, ending "Reply with a letter.", the "New ideas in this question, for you to check" block, and the rule that a further explanation the human asked for stops and offers "satisfied, next" or "more on this".
15. **Every count is true.** GIVEN the new skill and test file, WHEN the count table above is checked, THEN the README states 430 skill files, 102 specialist skill bodies and 328 reference files in every place the table lists, the five derived README pins pass, the README and CLAUDE.md state 545 test files after the release script runs, CLAUDE.md's parenthesis states 102, 2 ambient skills and 328, the agent counts still read 124, and no other test that names a skill count is red.
16. **The personal copies are untouched.** GIVEN the two personal files, WHEN the build ends, THEN their content hashes, recorded before the first edit, are unchanged, and no path under `<home>/.claude/` or `<home>/.claude-skills/` was written.
17. **The whole gate passes.** WHEN `npm test` runs, THEN it passes with zero failures, zero skipped, and at or above the coverage floor recorded in `.ctoc/coverage-baseline.json`.
18. **The reading agent is the existing one and it cannot write or run a shell.** GIVEN the skill's dispatch text and `agents/ai-quality/citation-validator.md`, THEN the skill names `citation-validator` as the reading agent, names no general-purpose agent, and starts no second Claude process (exact-presence checks); the definition's `tools:` line, read by the test, holds none of `Write`, `Edit` and `Bash`; and no file under `agents/` is changed by this plan. The tool-list check guards the premise of the choice: if that agent ever gains a write or shell tool, the test goes red by name.
19. **The run is recorded under the existing task kind.** GIVEN the run in scenario 4, THEN the task registry holds one entry of kind `discuss` whose label names the question (or, for a source or a topic, its subject in words); the entry is visible on the task board while the reading agent works; the skill closes it as done or failed when the run ends and never leaves it running after a refused launch; the registry accepts the kind (an unknown kind would throw); and no file under `src/` is changed by this plan. Evidence: the entry and the board screen's output, plus what the reconcile code did with it.
20. **Deepthink's own three rounds are recorded.** GIVEN the finished skill, WHEN the three rounds have run, THEN `.ctoc/audit/agent-and-skill-improvement/skills/deepthink/SKILL.md.json` exists in the improvement record's shape (`schema`, `path` equal to `skills/deepthink/SKILL.md`, `prerequisite`, `rounds`, `late_corrections`, `held`), holds three round entries numbered 1 to 3, each carrying its fingerprints, dispatches (the `agent-critic` for research and critique, the `citation-validator` for validate and re-validate), queries, sources with read dates, findings with a decision, and validator counts; a refuted claim is corrected or stripped and re-checked, and a round that cannot get there is held and put to the human, as the improvement plan says; each round is recorded only after its edits succeeded; and the last round's `fingerprint_after` equals the fingerprint of `skills/deepthink/SKILL.md` as it stands on disk at the end.
21. **The improvement run is untouched.** GIVEN the build ends, THEN `.ctoc/audit/agent-and-skill-improvement/inventory.json`, the approved improvement plan and `tests/agent-and-skill-improvement-record.test.js` have the content hashes recorded before this plan's first edit (builds run one at a time on the shared tree, so nothing else edits them meanwhile), and the improvement record check still passes with deepthink's record present.
22. **A researched question follows CTOC's recommendation rule.** GIVEN the skill's output rules, THEN they state that a matrix carries exactly one Recommended cell only on a decision with an objectively best answer (a quality decision), and none on an owner decision (what to build first, how much risk to accept, proceed or hold), which is presented flat; that the plain line "Best quality in the long run: <option>, because <one clause from the evidence>" appears only where the evidence separates the options and reads "no clear answer: <why>" where it cannot; and that the personal "safe and soonest to test" verdict is not carried as a recommendation or a line (checked by the test as exact-presence and exact-absence checks on the skill text). In the real run of scenario 4, the researched question shows the shape its kind of decision requires.

### Definition of Done

- [ ] `tests/deepthink-ships-with-ctoc.test.js` was written first, run, and seen failing for the right reasons (skill file absent, counts stale) before any other file changed.
- [ ] `skills/deepthink/SKILL.md` exists, complete, with no stub and no TODO. No open question remains in this plan: the five choices under `## Decisions Taken Under Ambiguity` are followed as written; if the build finds one of them cannot hold (for example a write the real run shows refused), it stops and returns the finding upstream, and does not pick another route.
- [ ] Scenarios 1, 2, 13 to 18 and 21 pass as tests or as recorded machine output.
- [ ] Scenarios 4, 5, 6, 8, 9, 10, 11, 12, 19 and 22 are recorded from one real run of the finished skill on a real decision question in a disposable project, with the directory listing, the sizes, the task entry, and the one-line notices as evidence. Scenario 7 is covered by the skill's stated handling of a refused launch, checked in the test, plus one observed refusal where the build can arrange five subagents in flight.
- [ ] The fold-in and the mirror are byte-identical and were changed together, and the pre-change list of CTOC headings and key sentences is intact.
- [ ] README and CLAUDE.md are edited as the count table says, by tightening to the new true numbers; no pin was loosened, no test was weakened; the README edits did not run concurrently with any README rebuild slice.
- [ ] The comparison of the two decision-question copies was repeated with a real `diff`, and its output is recorded.
- [ ] Deepthink's three rounds are recorded (scenario 20), and the improvement run's inventory, plan and record check are unchanged (scenario 21).
- [ ] Scenario 3 is either observed after shipping and recorded, or the closing report says in plain words that the listing has not been observed.
- [ ] `npm test` passes.
- [ ] The module is reachable from a live entry point in the same unit of work: the manifest's first `skills` entry reaches the skill, and nothing further is left to wire.

## Decisions By The Human

The authority for settling this plan's five open questions is two instructions the human gave for this session, quoted verbatim:

- "stop asking theswe stupid questions fix it"
- "keep going until everything is done then commit and push"

The plan's own authority for existing at all is the human's request of 2026-09-30 quoted under the problem statement: "add the ask-me-questions and deepthink skill to the ctoc installation".

Under those instructions the five forks the plan first carried as open questions are settled below, each as a documented choice with its reason and the options not chosen, so review can overturn any of them. These instructions settle the five forks only. They do not approve this plan at its gate, and no approval marker is written by this plan.

## Decisions Taken Under Ambiguity

### The five forks settled under the human's instructions

- **Which agent carries out the background research: the existing `citation-validator`, for reading only.**
  - Choice: the existing `citation-validator`, which already holds WebSearch and WebFetch and the rule that fetched content is data, does all the web reading, in the background, and returns text (the brief and a list of the papers it cites: title, authors, year, address, why it was read). The agent that is driving does every write and every shell command: the session when the human types the command, the build executor when a build step runs it. The reading agent is launched through the session's own subagent mechanism.
  - Reason: CTOC deliberately never combines untrusted web input, file writing and a shell in one agent (the discipline the gate-critic definition cites as Meta's Rule of Two); none of the agent definitions read holds web, write and shell together; no new agent is invented.
  - Not chosen: a new research agent holding web search, web fetch, file writing and a shell. It puts all three in one agent, adds an agent to the counts (124) and needs its own definition tests.
  - Not chosen: a general-purpose agent as the personal skill launches. It puts an ad-hoc agent into a shipped skill against CTOC's rule, and its tool grant is whatever the session gives it, not a reviewed definition.
  - Cost accepted: the definition of `citation-validator` is written for validating citation-shaped claims, not for open research. This plan does not edit it. The dispatch brief names the research task, and everything it returns is read as data.

- **Where the papers and the library index are written: `.ctoc/papers/`; the brief: `plans/vision/deepthink/`.**
  - Choice: the paper library lives under `.ctoc/papers/<topic>/` with an index file `.ctoc/papers/index.md` (one table with file, title, authors, year, link and why it was read, and a list "Web sources cited, not papers"; the name `index.md` is this plan's choice for the index file the instruction leaves unnamed); the brief lives at `plans/vision/deepthink/<slug>.md`. The skill no longer searches for or creates any `docs/` library layout, and rows are appended to the index with a shell append, never by rewriting it.
  - Reason: both paths are always writable in every CTOC project without a covering plan, so the skill works the first time it is invoked; `docs/` would be refused by the edit protection.
  - Not chosen: keeping the personal library paths under `docs/` covered by an approved plan. Every project would need that plan before its first run, and a run without one stops at the first download.
  - Not chosen: the human typing an escape phrase in the message that starts the run. It lifts plan coverage for everything that run writes, not only the library.
  - Cost accepted: a second layout for the library, and large downloaded files sit under `.ctoc/`; whether the project's ignore rules exclude them from version control was not verified.

- **Whether deepthink joins the three-round improvement run: it gets its own three rounds inside this plan.**
  - Choice: research, critique and validated update, three times, following the improvement plan's procedure for a round (read and fingerprint; research and critique by `agent-critic`; validate by `citation-validator`; update by the build executor; re-validate; prove; record last), recorded at `.ctoc/audit/agent-and-skill-improvement/skills/deepthink/SKILL.md.json` in the same record shape. The inventory of the running improvement plan, the approved plan and its record check are left untouched.
  - Reason: the human's two instructions together, every skill improved three times and deepthink added, mean the new skill gets its rounds; editing the approved improvement plan's fixed inventory is not done.
  - Not chosen: adding deepthink to the approved run's inventory. It edits a plan that carries the human's approval stamp and moves the inventory's counts and the record test's expected numbers.
  - Not chosen: leaving deepthink with no rounds. A skill that cites papers and web sources would get none of the research, critique and citation-validation rounds every other skill body gets.
  - Not chosen: a separate improvement run with its own inventory, record and check. It needs a second inventory and a new check for one file, and the README would have to describe two runs.

- **The recommendation format in a researched question: CTOC's rule.**
  - Choice: only a decision with an objectively best answer (a quality decision) carries exactly one Recommended cell; an owner decision (what to build first, how much risk to accept, proceed or hold) is presented flat with no Recommended cell. The plain labelled line "Best quality in the long run: <option>, because <one clause from the evidence>" may still be stated where it is a fact the evidence supports, and reads "no clear answer: <why>" where the evidence cannot separate the options. The personal "safe and soonest to test" verdict is not carried as a recommendation or as a line; a measured per-option fact about testing effort goes into that option's Pros or Cons as a stated number, like any cost.
  - Reason: the human's instruction in this session chose CTOC's rule over the personal copy's rule. The date is not the reason: CTOC's copy dates its rule 2026-07-29 and the personal copy dates its safe-and-soonest rule 11 September 2026, so this plan does not describe either as the later one; the authority is the instruction quoted under `## Decisions By The Human`.
  - Not chosen: the personal rule exactly (one Recommended cell always, defined as the safe option a user group can test soonest, plus the long-run line). On an owner decision it tilts a choice CTOC's rule says belongs to the human.
  - Not chosen: printing "safest to test soonest" and "best quality in the long run" as two plain lines on every question. "Safest to test soonest" is a scheduling and risk preference, an owner decision, not a fact.
  - Consequence recorded: an owner-decision matrix with no Recommended cell would fail the repository's matrix grader if that grader were applied to it. Today the grader is applied only to the decision-question skill's own worked example, and the new test does not apply it to deepthink's output.

- **The task kind for a deepthink run: the existing `discuss` kind.**
  - Choice: a run is recorded under `discuss` (a background, read-and-research task on a question), with a label naming the question; no new kind.
  - Reason: the kinds are a closed, tested list and a research run is the same plane as a discussion critique; adding a kind is a code change nobody asked for.
  - Not chosen: a new research kind. It is a source change to a scheduler module, its tests and every place that lists kinds, and it must be wired in the same unit of work.
  - Not chosen: no registry entry. The run would be invisible on the task board and outside the concurrency count, although the launch fence would still see it.
  - Cost accepted: the label calls a research run a discussion. What the reconcile and screen code does with a `discuss` entry that has no plan behind it was not read; scenario 19 measures it.

### The rest of the decisions

- **Placement: depth one, `skills/deepthink/SKILL.md`.** The architecture test requires every skill in the 20 specialist categories to declare `max_subagents: 0`. Deepthink launches a background run, so it cannot honestly sit in those folders. Depth one needs no manifest change and matches its sibling, `ask-me-questions`. A placement in the iron-loop folder would also be exempt from that test but names the wrong subject.
- **Frontmatter.** `name: deepthink`; a `description` adapted from the personal one; `type: skill`; `when_to_load` phrases (the personal triggers `/deepthink` and `/deep-research`, and saying to deepthink something, kept as phrases because a skill cannot register a second command name); a `tools:` line and never `allowed-tools:`. No `model:` key: the project's own lesson is that a model key on something invoked in the live session switches the session, and the skill body runs in the live session; the reading agent carries its own model. No `tier:` or `max_subagents` keys: those assert a leaf specialist, and deepthink is not one.
- **What is dropped from the personal text, and why.** The table of two named projects (Project and ABC) is dropped, because those are the human's private projects. The decisions-log discovery rule that follows it is kept and already finds both (`QUESTIONS.md`, `plans/vision/*decisions*.md` or `DECISIONS.md`), and the reading agent only reads that log. The personal paper-library discovery rule (`docs/research/papers-used/`, `docs/papers/`, `papers/`) is replaced by `.ctoc/papers/` under the decision above. The brief's opening line naming the founder and his profession is replaced by "the owner of this project". The owner's rulings of 12 September 2026 (choose the most obvious choice and record it as derived instead of asking; the person's waiting budget for algorithmic questions) are kept, attributed to the owner by name and date, as CTOC's own decision-question skill attributes its rulings. The ruling of 11 September 2026 is not carried, under the recommendation decision above. Also not carried: the personal rule that records the research's pick as the owner's answer when the owner has so ruled, because that ruling exists in the owner's own projects and a shipped skill cannot assume it; in CTOC the research decides nothing.
- **Plain words.** Every abbreviation is spelled in full in prose: the portable document format, the chief technology officer, artificial intelligence. File names, command names and byte signatures stay as literals in backticks.
- **Dispatch and the order of a run.** The skill launches its reading agent through the session's own subagent mechanism and never starts a second Claude process. It records each launch as CTOC records every dispatch (the instruction-level dispatch protocol), and records the run in the task registry under `discuss` so it is visible on the task board. It never says "running" and never records the task as running before the launch was allowed. Order: launch, then (only once allowed) the one-sentence answer, the task entry and the "in progress" file; when the reading agent returns, the driving agent checks the closing line, saves the brief, downloads and verifies the papers, appends the index rows, then runs the file check and closes the task entry.
- **Web content is data, never instruction.** The skill states this for search results, fetched pages, the researched source and the text of every downloaded paper, and states that a directive found in them is named in one line under Failures and ignored, as CTOC's other web-reading agents state it. The writing side never opens downloaded paper text or page text as instructions; it checks a file's first bytes and size only, passes each address as one argument and never assembled into a shell string, and downloads only from `https` addresses.
- **Honest status.** The skill points at `skills/agent-fragments/honest-status.md` and `skills/agent-fragments/plain-gate-words.md`. The one-line notices carry no time. The brief's header records the date, read from the system clock by a command, never composed from memory.
- **Matrix width.** The personal skill's width (129 characters, column widths 20, 38, 38 and 28) is kept as the human wrote it. It is narrower than the wide example in CTOC's own decision-question skill (180 characters), which agrees with the owner's standing wish, recorded in his project notes, for narrower matrices.
- **The fold-in, three readings.** (a) The lettered menu is the last thing on screen on every question. When the question widget is also in use, the menu still ends the text and the widget's options mirror the letters; the personal text makes the widget optional and the menu mandatory. (b) "After an explanation, stop and offer" applies to a further explanation the human asked for, not to the explanation paragraph every question carries; read the other way, every question would need an extra turn, which contradicts the paramount principle of fewer interactions. (c) CTOC's sequencing paragraph and its settings ride-along exemption stay as they are; only the satisfaction sentence is added to it.
- **One new test file, not edits to existing tests.** `tests/readme-numbers.test.js` is written by five slices of the README rebuild; editing it here would put two plans on one file. The cost is that the new file moves the test-file count, which the release script keeps true in the README and CLAUDE.md.
- **CLAUDE.md's "326 reference" is corrected to 328** in the same sentence this plan already edits, because leaving a number known to be false in a sentence being changed would fail scenario 15. It is a correction of a pre-existing error, not a consequence of the new skill.
- **`priority: medium` and `effort: medium`** are the house format's fields, filled in the way the neighbouring plans fill them; they schedule nothing.
- **The `files:` list is the intended write set.** The implementation planner slices it and may narrow it. It now includes deepthink's improvement record; the papers under `.ctoc/papers/` and the briefs are written by the skill in a user's project, not by this build, and the real run happens in a disposable project outside this repository.
- **The brief's location, `plans/vision/deepthink/`, is kept as the human's design.** Read from the code: the dashboard's plan reader lists only the top-level markdown files of a stage folder, so a subfolder is not counted as a vision plan. The plan-index hook matches deeper paths, so scenario 12 makes the build measure what it does; a failure there is a finding returned upstream, not a route the build picks for itself.
