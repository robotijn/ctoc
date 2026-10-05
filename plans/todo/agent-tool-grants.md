---
iron_loop_verdict: true
iron_loop: true
title: "Every agent holds the tools its own orders need, and no more: a tool-grant audit of all 125 agent definitions"
type: implementation
depends_on: none
priority: high
effort: large
files:
  # INDEX. The work is in the slices listed below; this file declares nothing to build.
  - plans/implementation/agent-tool-grants.md
approved_by: human
approved_at: 2026-10-05T14:58:03.462Z
gate_crossed: implementation → todo
---

# Every agent holds the tools its own orders need, and no more — index

Dispatched by CTO Chief on 2026-10-05. The owner's words: "give the agents the edit tool" and "ultrathink all the tools that agents need to speed up the work". It widens the earlier plan for the four plan-writing agents (`plans/implementation/plan-writing-agents-can-edit-and-search.md`), which becomes slice 2 of this index and keeps its decided content.

The owner's rule for this plan: every question put to the owner names ONE recommended option, the best-quality one, with its reason. This plan follows that rule; it differs from the project's standing lesson 17 (flat options on owner decisions), and the owner's later instruction wins — noted once, here. **Approving a slice approves the recommended answers it builds on**; each question says what changes in which slice if the owner chooses otherwise.

## The owner's answers (2026-10-05)

**Answer (1), the tool grants — option (a):** "Approve the additions and the six safety fixes now; hold the removals until each is checked in a real run."

What it approves, each question below taking its recommended option:

| Question | Recommended option | The owner's answer |
|---|---|---|
| 1. `product-owner` reads the web and writes plans | Drop WebSearch; web lookups go to `deepthink-researcher` | Approved (a safety fix) — slice 2 |
| 2. `llm-security-tester` holds WebSearch and Bash | Drop WebSearch | Approved (a safety fix) — slice 10 |
| 3. Nine descriptions say "build" while the bodies say "review" | The body wins: descriptions reworded, every "Dispatch when" phrase word for word; tools follow the body | Descriptions approved — slices 3, 4, 8. The tool removals that follow from "tools follow the body" are least-privilege removals and are **held** (slice 11), except `legal-scaffold`'s Write and `product-reviewer`'s Write and Bash, which are part of their safety separation and approved |
| 4. The five gate critics read under a hard fence | Keep their grants exactly as they are | Approved — no slice changes them |
| 5. Two exact tool pins in the "improved three times" run's record check | Add Glob to both and update the expectations | Approved — slice 7 |
| 6. Order against the "improved three times" run | Build these slices before that run's rounds reach the affected files | Approved — the owner's order |
| 7. Model for `product-owner` and `vision-advisor` | Opus for both, effort unchanged | Approved — slice 2 |

The six safety fixes, all approved: `product-owner` and `llm-security-tester` lose WebSearch (`product-owner` sends web lookups to `deepthink-researcher`); `legal-scaffold`, `ci-runner-setup`, `deployment-setup` and `product-reviewer` get the separation each slice recommends. A safety fix that removes a web tool is approved work. **Only removals made for least privilege are held**: 44 tools on 26 agents, listed in full in slice 11 and in the test's `HELD_REMOVALS`, each to be measured in real runs and then approved by the owner before it lands.

**Answer (2), the waiting limit — option (a):** "Three seconds to the first visible result." It answers the deepthink plan's open question `h-deepthink-r2-waiting-budget-threshold` with its recommended option, `three-seconds`, and is built in `plans/implementation/deepthink-ships-with-ctoc-s8-reader-and-critic-wording.md`; it changes nothing in this plan.

## Why

An end user reported that `product-owner` "has the tools Read, Write, WebSearch and Glob, with no Edit and no text search … It must rewrite each whole file with Write. Several rewrite agents also reported that they could not search file contents." Of nine plans `product-owner` rewrote, three said so in their final message ("I had no text search or compiler, so the role call-site table (T4) comes from reading files … I did not read the other API routes"; "I also couldn't search file contents with the tools I had, so the plan makes no 'nothing else in the repo does X' claims"; "I had no codebase search tool, so the reader inventory for D8 may be incomplete"), and one plan file was 122 KB, rewritten whole to change one line. Reading every agent definition shows the same two gaps across the corpus — agents that write without Edit and agents that read without search — and the opposite fault as well: reviewers holding Write, Edit or Bash their bodies never use, and six agents that read the web while able to write or run commands.

## The grant policy (decided by the CTO Chief session on 2026-10-05)

1. **Write implies Edit.** Any agent that writes or revises a file holds Edit as well as Write. A partial change is made with Edit; Write is for a new file or a deliberate whole replacement.
2. **Reading implies searching.** Any agent that reads code or plans holds Read, Grep and Glob. Searching instead of opening files one by one is the main speed gain. A list of call sites, readers or occurrences comes from a search over the whole repository.
3. **Bash only where the body orders a command** (checkers, runners, analyzers and executors).
4. **Task only for coordinators:** the CTO Chief, the Independent Verification and Validation chief, and the quality gate.
5. **AskUserQuestion only for agents that talk to the human directly**; a background agent cannot wait for an answer.
6. **Safety floor, never relaxed for speed.** An agent that holds WebSearch or WebFetch reads untrusted input. It must not also hold Write, Edit or Bash unless a person reviews its actions.
7. **Read-only reviewers stay read-only** (no Write and no Edit), unless their body orders them to write a file.

### The readings this plan takes

- **How the orders were traced.** Every body was read for what it orders the agent itself to do. A text search was used only to find candidate passages (fenced shell blocks, write verbs, file paths, tool names); each candidate was then read in context before it counted. The unexecutable-order scanner (`src/lib/unexecutable-instruction-scan.js`) was the starting list: its baseline (`.ctoc/unexecutable-instruction-baseline.json`) holds no agent findings today (its 15 debt entries are task kinds and settings keys), and the scanner skips every agent that holds Bash and looks only for orders to call JavaScript, so it could not answer most of this audit.
- **"The body orders" includes the method file the body orders the agent to read in full and apply** (most agents are wrappers: "Read `skills/<category>/<name>/SKILL.md` in full and delegate the deep method to it"). A command in that method file counts only when it is a step the agent itself performs. An installation snippet for the user's project (`npm install @clerk/nextjs svix`) or an example of the user's pipeline (`cosign verify-blob …` in a continuous-integration step) is reference for the code under review, not an order to the reviewer. A shell line that only lists files or searches text (`ls`, `rg`, `grep -r`) is carried out with Glob or Grep and does not justify Bash.
- **Reviewer or builder is decided by the body**, where description and body disagree (question 3).
- **Rule 2 covers every agent except** the two web-only agents (`deepthink-researcher`, `eu-solution-recommender`), which read no file by design and are pinned that way by existing tests, and the five gate critics under a hard read fence (question 4).
- **Rule 2's last sentence is carried into every reading agent** as one shared section, `## Searching the repository (shared rule)`, with the same paragraph, checked by the new test:

  > Build every list of call sites, readers, writers or occurrences with Grep over the whole repository, never only from the files you happened to open, and read each match before you count it. Under any claim that nothing else in the repository does something, cite the search that shows it: the pattern, the path searched and how many files matched. A match shows where a name is written, not that the code runs.

  The last sentence keeps the order consistent with the owner's standing rule that a text search proves presence, never that code runs. `product-owner` carries two further sentences (slice 2).
- **Order of tools in a line.** New tools are appended and removed tools deleted; the order carries no meaning to the loader (believed, not checked against Claude Code's documentation this session). The new test compares sets. Only `agent-critic` and `citation-validator` are pinned to an exact line, so their lines end in `, Glob` exactly as slice 7 says; where the table below and a slice differ on order, the slice wins.

## The counts (on the owner's answers of 2026-10-05)

"Approved" is built in slices 2 to 10. "Held" waits in slice 11 for measured runs and the owner's approval. The audit's full proposal is the two added together.

| Change | Approved (slices 2-10) | Held (slice 11) | The audit's full proposal |
|---|---|---|---|
| Agent definitions read | 125 (24 categories) | — | 125 |
| Gain **Edit** | 15 | 0 | 15 |
| Gain **Grep** | 43 | 0 | 43 |
| Gain **Glob** | 69 | 0 | 69 |
| Gain **Write** | 1 (`changelog-generator`) | 0 | 1 |
| Gain **Bash** | 0 | 0 | 0 |
| Gain a web tool | 0 | 1 (WebFetch: `vercel-deploy`, which waits for its Write and Bash removals) | 1 |
| Lose a web tool (safety fixes) | 5 (WebSearch: `product-owner`, `llm-security-tester`; WebFetch: `ci-runner-setup`, `deployment-setup`, `product-reviewer`) | 0 | 5 |
| Lose **Write** | 2, safety separations (`legal-scaffold`, `product-reviewer`) | 14 | 16 |
| Lose **Bash** | 1, a safety separation (`product-reviewer`) | 20 | 21 |
| Lose **Edit** | 0 | 9 | 9 |
| Lose **Task** | 0 | 1 (`quality-gate-runner`) | 1 |
| **Break the safety floor today** | **6** — after slices 2-10, 0 | — | — |
| Grant changes | 76 agents; 49 keep their grant | 26 agents whose removals are held (10 of them change in slices 2-10 only by their held removals, so keep their grant until slice 11) | 86 agents; 39 keep their grant |
| Gain the shared search section | 118 (every reader except the 2 web-only and the 5 fenced critics) | 0 | 118 |

Held removals by tool: **Bash 20, Write 14, Edit 9, Task 1 — 44 tools on 26 agents.** Agents gaining each tool now: **Edit 15, Grep 43, Glob 69, Write 1, Bash 0, a web tool 0.**

The 15 that gain Edit: `ci-runner-setup`, `deployment-setup`, `changelog-generator`, `security-scanner`, `agent-publisher`, `vision-decomposer`, `vision-advisor`, `product-owner`, `kpi-planner`, `stack-chooser`, `implementation-planner`, `unit-economics-modeler`, `coverage-mapper`, `smart-test-runner`, `quality-gate`.

The 21 the audit found ordering no command: `clerk-auth`, `inngest-jobs`, `vercel-deploy`, `sentry-errors`, `supabase-data`, `resend-email`, `stripe-subscriptions`, `multi-tenancy-row-level`, `threat-modeler`, `incident-responder`, `dsar-handler`, `database-reviewer`, `health-check-validator`, `configuration-validator`, `pattern-detector`, `agent-tester`, `product-reviewer`, `sbom-cra-checker`, `data-quality-checker`, `feature-store-validator`, `react-native-bridge-checker`. `product-reviewer` loses Bash now, in its safety separation (slice 3); the other 20 keep Bash until slice 11 measures it.

The 10 agents whose only grant change was a held removal, so they keep their grant through slices 2-10: `pattern-detector`, `sbom-cra-checker`, `rate-limiting`, `threat-modeler`, `incident-responder`, `health-check-validator`, `react-native-bridge-checker`, `quality-gate-runner`, `clm-obligations`, `dsar-handler`.

## The safety floor today (rule 6)

Six agents hold a web tool together with Write, Edit or Bash. Meta's "Agents Rule of Two" (https://ai.meta.com/blog/practical-ai-agent-security/) names three properties — processing untrustworthy input, access to sensitive systems or private data, and changing state or communicating externally — and holds that an agent should combine at most two without a person in the loop. (Believed from the article as published in late 2025; this session had no web tool and could not re-read it. Step 9 of slice 1 has CTOC's citation-validator check the citation before it is quoted anywhere.)

| Agent | Grant today | What its body orders | Separation proposed | The owner's answer (2026-10-05) |
|---|---|---|---|---|
| `product-owner` | Read, Write, WebSearch, Glob | Writes plans; WebSearch only "unless the vision references external standards or APIs" | Drop WebSearch; a web lookup goes to `deepthink-researcher` (web-only), its result handed in as data | Approved (question 1) — slice 2 |
| `llm-security-tester` | Bash, Read, Grep, Glob, WebSearch | A fixed Bash lookup of MITRE's data file; "WebSearch returns a summary, not the source … it never settles an identifier or a count" | Drop WebSearch | Approved (question 2) — slice 10 |
| `legal-scaffold` | Read, Write, WebFetch | A reviewer ("a watcher and not a generator"); orders live checks of regulatory dates; orders no write | Drop Write (rule 7); keep WebFetch | Approved — slice 4 |
| `ci-runner-setup` | Bash, Read, Write, WebFetch | Installs a runner with Bash, updates workflow files; orders no fetch | Drop WebFetch (unused) | Approved — slice 5 |
| `deployment-setup` | Bash, Read, Write, WebFetch | Writes the `deployment` key of `.ctoc/settings.json`, dry-runs with Bash; orders no fetch | Drop WebFetch (unused) | Approved — slice 5 |
| `product-reviewer` | Read, Write, Bash, WebFetch | A reviewer ("Judge these"); orders no write, command or fetch | Drop Write, Bash and WebFetch | Approved — slice 3 |

`agent-critic` and `citation-validator` (Read, Grep, WebSearch, WebFetch) were checked and are within the floor: they write nothing and run nothing.

**A limit this plan does not close, stated plainly.** Rule 6 as decided covers the two web tools. A Bash command can also read the network and run what it reads, and these bodies order network commands through Bash: `llm-security-tester` (MITRE's data file, fixed host), `hallucination-detector` (package registries), `secrets-detector` (sends a found credential to its provider to verify it is live), `api-deprecation-checker` (`curl -sI` to an API), `ci-runner-setup` (downloads and installs the runner), `onboarding-validator` (`git clone` of a repository address), `cloud-cost-analyzer` (cloud billing commands). This list came from reading the fenced shell blocks and is not exhaustive. Under Meta's definition the repository itself is untrusted input too, so any agent holding Read and Bash holds all three properties; the person in the loop is the Bash permission prompt, when the session runs with prompts on. The test cannot see a network command inside Bash.

## Questions for the owner, each with one recommended option

**Answered on 2026-10-05**: the owner took the recommended option on all seven, with the least-privilege removals held (see "The owner's answers" above). The questions stay below as asked, so the reasons stay readable.

**1. `product-owner` reads the web and writes plans.** Giving it Edit and Grep adds to a grant that already breaks the floor.
- **Recommended: drop WebSearch.** When a vision names an external standard or API, `product-owner` records `needs-input` and CTO Chief dispatches `deepthink-researcher` (web-only, no file tool), whose result comes back in the brief, as data. Reason: the body uses WebSearch only for that rare case; the agent that writes the plan then never reads untrusted web content; the web-only pattern already exists and is tested.
- Otherwise: keep WebSearch and record `product-owner` as a standing exception in the test (slice 2 changes its profile and keeps its exception); or split it into a research agent and a writing agent (more machinery for the same result).

**2. `llm-security-tester` holds WebSearch and Bash.**
- **Recommended: drop WebSearch** and rewrite the sentence that mentions it (line 28). Reason: its own body says WebSearch "never settles an identifier or a count"; the Bash lookup is its source of truth; nothing is lost. (Slice 10.)
- Otherwise: keep it as a standing exception.

**3. Nine agents' descriptions say they build, while their bodies say they review.** `clerk-auth` ("Implement Clerk authentication"), `stripe-subscriptions` ("Implement Stripe Subscriptions"), `multi-tenancy-row-level` ("Implement multi-tenant data isolation"), `vercel-deploy` ("Deploy Next.js to Vercel"), `legal-scaffold` ("Generate Privacy Policy …"), `dsar-handler` ("Writes per-request evidence to .ctoc/dsar/<request-id>.yaml"), `clm-obligations` ("writes them to .ctoc/contracts/obligations.yaml"), `experiment-designer` ("Outputs a runnable experiment spec"), `product-reviewer` ("Reads KPI data from PostHog/Stripe"). Each body is a reviewer ("You are the standing observer …", "Judge these"; `legal-scaffold`: "you are a watcher and not a generator").
- **Recommended: the body wins.** Tools follow the body (rule 7); each description's opening clause is reworded to say what the agent checks, and every "Dispatch when …" phrase is kept word for word. Reason: the body is what the agent executes and is the newer, deliberate text; a description that promises building makes CTO Chief dispatch a reviewer for work it has no tool to do; building is the executor's work at the build step, which reads the same skill.
- Otherwise: turn them back into builders — rewrite their bodies, keep Write and Edit, and drop them from rule 7.

**4. The five gate critics read under a hard fence.** `premortem-critic`, `red-team-critic`, `devils-advocate-critic`, `advocate-critic` and `gate-critic` limit their reads to the plan, its ancestry and the paths it declares ("Read and Grep are not a licence to read anything", `red-team-critic` line 139), as a defence against a plan that tries to steer its reviewer.
- **Recommended: keep their grants exactly as they are** (Read and Grep; and Write for `gate-critic`, which only creates its quarantined pending files) and do not give them the whole-repository search order. Reason: the fence is a security control written against injected plans; Glob and a "search the whole repository" order would widen what a steered critic can enumerate; Edit would add nothing a create-only writer uses. The test lists them as fenced.
- Otherwise: give them Glob (and `gate-critic` Edit), and rewrite each fence and every sentence that names "Read and Grep" (some 20 lines across the five).

**5. Two exact tool pins in the "improved three times" run's record check.** `tests/agent-and-skill-improvement-record.test.js` requires `agent-critic`'s line to be exactly `tools: Read, Grep, WebSearch, WebFetch` and `citation-validator`'s to be its recorded starting line minus `Skill` (a ruling of 2026-09-30); its case at lines 724-733 rejects the validator line with Glob added. Rule 2 adds Glob to both.
- **Recommended: add Glob to both and update the expectations** (slice 7 lists every line). Reason: Glob is pure file-name enumeration, which `tests/watcher-shape.test.js` already permits every reviewer ("Glob is permitted because it is pure enumeration"); it adds no reach Read and Grep lack.
- Otherwise: exempt both from rule 2.

**6. Order against the "improved three times" run.** Its remaining slices (`plans/todo/00267` onward, one per agent or skill) also edit these agent files, and each forbids its rounds to widen a grant ("without widening the grant (standing rule 5)").
- **Recommended: build these slices before that run's rounds reach the affected files.** Reason: with the right grant in place, a round reviews an agent that can carry out its orders, instead of rewriting good orders into weaker ones to fit a grant that is about to change. Five agents already have improvement rounds recorded (`agent-critic`, `dependency-analyzer`, `ai-code-quality-reviewer`, `hallucination-detector`, `llm-security-tester`), and `dependency-analyzer`'s slice is in progress now; an edit here changes their files after their last recorded fingerprint. How that run's final check treats such an edit was not read for this plan; Step 9 of each slice that edits one of them reads it first.
- Otherwise: build after the run, and accept that its rounds see the old grants.

**7. Model for product-owner and vision-advisor — see the section below.**

## Model for product-owner and vision-advisor (answered 2026-10-05: Opus)

- Today: `product-owner` declares `model: sonnet`, `effort: xhigh`; `vision-advisor` declares `model: sonnet`, `effort: xhigh`. Both are allowed by name in `SONNET_EXEMPT` in `tests/agent-model-floor.test.js` (lines 172-175 as read), with the written reason "Asks the human questions to build context. Does not read code and emit findings. Raising it is a separate owner decision."
- **Recommended, and the owner's answer: Opus for both, effort unchanged.** Reason: the end user's report shows `product-owner` reading code — a call-site table built over 27 route and handler files — which its written exemption says it does not do; and `vision-advisor`'s output is the root every later plan inherits, so a weaker reading there propagates furthest. The cost is a higher price per run on two frequently used agents.
- Built in slice 2: each agent's `model:` line becomes `model: opus`, and both entries leave `SONNET_EXEMPT`. The new tool-grant test does not read `model:`.

## Slices (dependency-ordered)

| # | Slice file | Scope (one line) | depends_on |
|---|---|---|---|
| 1 | `agent-tool-grants-s1-the-test.md` | The test `tests/agent-tool-grants.test.js`, written first: the audit as data, exact grants, debt, safety-floor exceptions and held removals that only shrink; the test-file count lines | - |
| 2 | `plan-writing-agents-can-edit-and-search.md` | The four plan-writing agents (`product-owner`, `vision-advisor`, `vision-decomposer`, `implementation-planner`): Edit, Grep and Glob, the whole-file-rewrite passages, the search section; `product-owner` drops WebSearch (question 1); `product-owner` and `vision-advisor` move to Opus (question 7) | s1 |
| 3 | `agent-tool-grants-s3-planning-and-product.md` | `kpi-planner`, `stack-chooser`, `unit-economics-modeler`, `experiment-designer`, `product-reviewer`; `product-reviewer`'s safety separation; `experiment-designer`'s Write held | s1 |
| 4 | `agent-tool-grants-s4-saas.md` | The eleven `saas/*` reviewers: Grep and Glob; `legal-scaffold`'s safety separation; question 3's description edits; the other ten agents' Write, Edit and Bash held, and `vercel-deploy`'s WebFetch with them | s1 |
| 5 | `agent-tool-grants-s5-infrastructure-documentation-cost.md` | The six infrastructure agents, the two documentation agents, `cloud-cost-analyzer`; the two set-up agents drop WebFetch | s1 |
| 6 | `agent-tool-grants-s6-testing.md` | The fourteen testing agents; `quality-gate-runner`'s Task held | s1 |
| 7 | `agent-tool-grants-s7-iron-loop-pipeline-coordinator.md` | `iron-loop-critic`, `iron-loop-integrator`, `iron-loop-executor`, the five pipeline agents, the three coordinators, `citation-validator`; the two pins of question 5; `agent-tester`'s Bash held | s1 |
| 8 | `agent-tool-grants-s8-security-legal-compliance.md` | The ten security agents, the two legal agents, the five compliance agents that read files; seven removals held | s1 |
| 9 | `agent-tool-grants-s9-quality-architecture-versioning-frontend-devex.md` | Eleven quality, two architecture, three versioning, three frontend, two developer-experience agents; `pattern-detector`'s Bash held | s1 |
| 10 | `agent-tool-grants-s10-specialized-safety-realtime-data-mobile-ai.md` | Eleven specialized, three safety, two real-time, three data and machine-learning, three mobile, three artificial-intelligence-quality agents; `llm-security-tester` drops WebSearch (question 2); six Bash removals held | s1 |
| 11 | `agent-tool-grants-s11-removals-held.md` | **held: not approved; awaits measured runs and the owner's approval.** The 44 held removals on 26 agents, each measured in real runs with the tool still granted; only those never used, and then approved, land; `vercel-deploy`'s WebFetch and `quality-gate-runner`'s section replacement with them | s1, s3, s4, s6, s7, s8, s9, s10 |

Slices 2 to 10 depend only on slice 1 and touch disjoint agent files; each also edits `tests/agent-tool-grants.test.js` (it removes its agents from `DEBT` and lowers `MAX_DEBT`, and where it resolves a safety-floor exception, removes it and lowers `MAX_RULE6_EXCEPTIONS`; none changes `HELD_REMOVALS`), so they are built one at a time. Debt removed per slice: 4, 5, 11, 9, 14, 12, 17, 21, 25 — 118 in all. Grant changes per slice: 4, 5, 10, 8, 12, 10, 8, 8, 11 — 76 in all. Slice 11 edits files of slices 3, 4, 6, 7, 8, 9 and 10 and the test, so it comes after all of them; it is measured before it is approved, and it shrinks `HELD_REMOVALS`.

**The dependency order, with the owner's ordering:** slice 1 first; then slices 2 to 10, one at a time, in any order among themselves (the order among them is the owner's), all before the "improved three times" run's rounds reach the affected files (the owner's answer to question 6); then slice 11's measured runs, the owner's approval of its verdicts, and its build.

## The full audit table

Columns: the grant today; what the body orders the agent itself to do (read, with the evidence); the proposed grant; the rule or question behind the change; the safety-floor status. "Search" means the shared search section is added (rule 2). Line numbers are as read on 2026-10-05.

"Proposed" is the audit's full target. On the owner's answer of 2026-10-05, a removal made for least privilege in this column is held: the agent keeps that tool through slices 2 to 10, and slice 11 lists every one (44 tools on 26 agents) and measures it before it lands. `vercel-deploy`'s WebFetch is held with them.

### Artificial-intelligence quality (5)

| Agent | Today | Ordered by the body | Proposed | Why | Floor |
|---|---|---|---|---|---|
| ai-code-quality-reviewer | Read, Grep | Reads named files; Grep orders ("Grep the production files …") | Read, Grep, Glob | Rule 2; line 18 "Your tools are Read and Grep … those two tools" becomes "Read, Grep and Glob … those three tools"; search | — |
| citation-validator | Read, Grep, WebSearch, WebFetch | Reads, searches, fetches the cited sources | Read, Grep, WebSearch, WebFetch, Glob | Rule 2; line 142 "Read, Grep, and read-only web retrieval only" gains Glob; question 5; search | Within (no write, no command) |
| deepthink-researcher | WebSearch, WebFetch | Web research only; "I cannot read a local file" | unchanged | Web-only by design | Within |
| hallucination-detector | Read, Grep, Bash | Registry lookups by fixed Bash recipes (lines 152-216) | Read, Grep, Bash, Glob | Rule 2; line 18 "Your tools are Read, Grep and Bash. You read and search with Read and Grep." gains Glob in both sentences; search | Bash reaches registries |
| llm-security-tester | Bash, Read, Grep, Glob, WebSearch | Fixed Bash lookup of MITRE's data file (lines 28-50); WebSearch "never settles an identifier" | Bash, Read, Grep, Glob | Question 2; line 28 rewritten; search | **Breaks today** |

### Architecture (2)

| Agent | Today | Ordered by the body | Proposed | Why | Floor |
|---|---|---|---|---|---|
| dependency-analyzer | Read, Grep, Glob, Bash | Runs its own analysis program with Bash (line 98); its madge recipes are "for a human to adopt" | unchanged | Search only | — |
| pattern-detector | Read, Grep, Glob, Bash | Glob patterns and import reading; its one shell-labelled block is a list of Glob calls; no command | Read, Grep, Glob | Rule 3; search | — |

### Compliance (6)

| Agent | Today | Ordered by the body | Proposed | Why | Floor |
|---|---|---|---|---|---|
| audit-log-checker | Read, Grep | Reads logging code | Read, Grep, Glob | Rule 2; search | — |
| eu-ai-act-agent | Read, Grep | Reads the plan and the regime helper | Read, Grep, Glob | Rule 2; lines 36 and 92 quote `Read, Grep` (updated); search | — |
| eu-solution-recommender | WebSearch, WebFetch | Web only ("you do not scan the repository") | unchanged | Web-only by design | Within |
| gdpr-agent | Read, Grep | Reads the plan and the regime helper | Read, Grep, Glob | Rule 2; line 32 quotes `Read, Grep` (updated); search | — |
| license-scanner | Bash, Read | Runs license-checker, pip-licenses, go-licenses, fossa | Bash, Read, Grep, Glob | Rule 2; search | Bash reaches the network (fossa) |
| sbom-cra-checker | Bash, Read, Grep, Glob | Reviewer ("the standing observer"); the skill's shell blocks are examples of the user's pipeline | Read, Grep, Glob | Rule 3; search | — |

### Coordinators (3)

| Agent | Today | Ordered by the body | Proposed | Why | Floor |
|---|---|---|---|---|---|
| cto-chief | Read, Grep, Glob, Task, Bash | Dispatches; runs `node -e` recipes | unchanged | Pinned exactly by `tests/agent-contract-load.test.js`; search | — |
| ivv-chief | Read, Grep, Glob, Task, Bash | Re-dispatches; re-runs verification | unchanged | Search | — |
| synthesizer | Read, Grep | Reads the plan ancestry and the findings | Read, Grep, Glob | Rule 2; search | — |

### Cost (1)

| Agent | Today | Ordered by the body | Proposed | Why | Floor |
|---|---|---|---|---|---|
| cloud-cost-analyzer | Bash, Read, Grep, Glob | infracost, `aws ce`, `kubectl cost` | unchanged | Search | Bash reaches cloud billing |

### Data and machine learning (3)

| Agent | Today | Ordered by the body | Proposed | Why | Floor |
|---|---|---|---|---|---|
| data-quality-checker | Bash, Read | No command; the skill's first phase is `rg` (a search) | Read, Grep, Glob | Rules 2, 3; search | — |
| feature-store-validator | Bash, Read | No command; the skill's `feast apply` and `materialize` change a registry and are not ordered of this agent | Read, Grep, Glob | Rules 2, 3; search | — |
| ml-model-validator | Read, Grep, Glob | "You have `Read`, `Grep`, and `Glob` only" | unchanged | Search | — |

### Developer experience (2)

| Agent | Today | Ordered by the body | Proposed | Why | Floor |
|---|---|---|---|---|---|
| api-deprecation-checker | Bash, Read, Grep | `tsc`, `npm outdated`, `curl -sI` | Bash, Read, Grep, Glob | Rule 2; search | Bash reaches an API |
| onboarding-validator | Bash, Read, Grep, Glob | `git clone`, install, build, test | unchanged | Search | Bash reaches the network |

### Documentation (2)

| Agent | Today | Ordered by the body | Proposed | Why | Floor |
|---|---|---|---|---|---|
| changelog-generator | Bash, Read | `git log`; generates `CHANGELOG.md` and "rewrite it for humans" | Bash, Read, Write, Edit, Grep, Glob | Rules 1, 2 (an unexecutable order today); search | — |
| documentation-updater | Read, Write, Edit | Updates docs, README, comments | Read, Write, Edit, Grep, Glob | Rule 2; search | — |

### Frontend (3)

| Agent | Today | Ordered by the body | Proposed | Why | Floor |
|---|---|---|---|---|---|
| bundle-analyzer | Bash, Read, Grep, Glob | Production builds | unchanged | Search | — |
| component-tester | Bash, Read | Runs component tests and reports failures (the skill's `vitest run`) | Bash, Read, Grep, Glob | Rule 2; search | — |
| visual-regression-checker | Bash, Read | percy, chromatic, playwright | Bash, Read, Grep, Glob | Rule 2; search | — |

### Infrastructure (6)

| Agent | Today | Ordered by the body | Proposed | Why | Floor |
|---|---|---|---|---|---|
| ci-pipeline-checker | Read, Grep, Bash | actionlint, glab | Read, Grep, Bash, Glob | Rule 2; search | — |
| ci-runner-setup | Bash, Read, Write, WebFetch | Installs the runner with Bash; "update workflow files"; saves the preference; no fetch | Bash, Read, Write, Edit, Grep, Glob | Rules 1, 2; WebFetch dropped (unused); search | **Breaks today**; Bash downloads from GitHub |
| deployment-setup | Bash, Read, Write, WebFetch | Writes the `deployment` key of `.ctoc/settings.json` (line 488); dry run and git with Bash; no fetch | Bash, Read, Write, Edit, Grep, Glob | Rules 1, 2; WebFetch dropped (unused); search | **Breaks today** |
| docker-security-checker | Bash, Read | hadolint, trivy, syft | Bash, Read, Grep, Glob | Rule 2; search | — |
| kubernetes-checker | Bash, Read | `kubectl --dry-run`, kubeconform, kube-linter, kubesec, kyverno | Bash, Read, Grep, Glob | Rule 2; search | — |
| terraform-validator | Bash, Read | terraform validate, tflint, checkov, infracost | Bash, Read, Grep, Glob | Rule 2; search | — |

### Iron Loop (8)

| Agent | Today | Ordered by the body | Proposed | Why | Floor |
|---|---|---|---|---|---|
| advocate-critic | Read, Grep | Fenced reads | unchanged | Question 4 | — |
| devils-advocate-critic | Read, Grep | Fenced reads | unchanged | Question 4 | — |
| gate-critic | Read, Grep, Write | Fenced reads; creates one quarantined pending file per run | unchanged | Question 4 | — |
| iron-loop-critic | Read, Grep | Reads plans | Read, Grep, Glob | Rule 2; search | — |
| iron-loop-executor | Read, Write, Edit, Bash | Builds, runs tests and recipes | Read, Write, Edit, Bash, Grep, Glob | Rule 2; search | — |
| iron-loop-integrator | Read, Write, Edit | Writes the execution steps into plans | Read, Write, Edit, Grep, Glob | Rule 2; search | — |
| premortem-critic | Read, Grep | Fenced reads | unchanged | Question 4 | — |
| red-team-critic | Read, Grep | Fenced reads | unchanged | Question 4 | — |

### Legal (2)

| Agent | Today | Ordered by the body | Proposed | Why | Floor |
|---|---|---|---|---|---|
| clm-obligations | Read, Write, Grep, Glob | Reviewer ("Judge these"); no write ordered | Read, Grep, Glob | Rule 7; question 3; search | — |
| dsar-handler | Read, Write, Grep, Glob, Bash | Reviewer ("the standing observer"); no write, no command | Read, Grep, Glob | Rules 3, 7; question 3; search | — |

### Mobile (3)

| Agent | Today | Ordered by the body | Proposed | Why | Floor |
|---|---|---|---|---|---|
| android-checker | Bash, Read, Grep, Glob | gradlew lint, build, tests | unchanged | Search | — |
| ios-checker | Bash, Read, Grep, Glob | swiftlint, xcodebuild | unchanged | Search | — |
| react-native-bridge-checker | Bash, Read, Grep, Glob | A checklist; no command | Read, Grep, Glob | Rule 3; search | — |

### Pipeline (5)

| Agent | Today | Ordered by the body | Proposed | Why | Floor |
|---|---|---|---|---|---|
| agent-critic | Read, Grep, WebSearch, WebFetch | Reads, searches, fetches sources | Read, Grep, WebSearch, WebFetch, Glob | Rule 2; question 5; search | Within |
| agent-publisher | Read, Write, Bash | Writes the agent file; updates `grades.yaml` and `capability-index.yaml`; appends `audit.log`; `git commit` | Read, Write, Bash, Edit, Grep, Glob | Rules 1, 2; search | — |
| agent-qa | Read, Grep | Reads agent files | Read, Grep, Glob | Rule 2; search | — |
| agent-tester | Read, Bash, Grep | Reasons over test cases; no command | Read, Grep, Glob | Rule 3; search | — |
| agent-writer | Read, Edit, Write | Writes agent files | Read, Edit, Write, Grep, Glob | Rule 2; search | — |

### Planning (7)

| Agent | Today | Ordered by the body | Proposed | Why | Floor |
|---|---|---|---|---|---|
| implementation-planner | Read, Glob, Grep, Write | Writes slices; adds the index to the parent plan | Read, Glob, Grep, Write, Edit | Rule 1 (slice 2) | — |
| kpi-planner | Read, Write, AskUserQuestion | Asks the founder (Steps 3, 4); writes `plans/canvas/<slug>-kpis.yaml` | Read, Write, AskUserQuestion, Edit, Grep, Glob | Rules 1, 2; search | — |
| product-owner | Read, Write, WebSearch, Glob | Refines stubs in place; searches; WebSearch for an external standard only | Read, Write, Glob, Edit, Grep | Rules 1, 2; question 1 (slice 2) | **Breaks today** |
| stack-chooser | Read, Write, AskUserQuestion | Asks; writes a `tech_stack:` block into an existing implementation plan (line 81) | Read, Write, AskUserQuestion, Edit, Grep, Glob | Rules 1, 2; search | — |
| unit-economics-modeler | Read, Write, AskUserQuestion | Asks ("Asked via AskUserQuestion"); adds its output to the canvas plan (line 120) | Read, Write, AskUserQuestion, Edit, Grep, Glob | Rules 1, 2; search | — |
| vision-advisor | Read, AskUserQuestion, Write | Asks; updates the vision file after each answer | Read, AskUserQuestion, Write, Edit, Grep, Glob | Rules 1, 2 (slice 2) | — |
| vision-decomposer | Read, Write, AskUserQuestion | Asks; adds the decomposition into stubs | Read, Write, AskUserQuestion, Edit, Grep, Glob | Rules 1, 2 (slice 2) | — |

### Product (2)

| Agent | Today | Ordered by the body | Proposed | Why | Floor |
|---|---|---|---|---|---|
| experiment-designer | Read, Write | Reviewer ("Judge these"); no write ordered | Read, Grep, Glob | Rule 7; question 3; search | — |
| product-reviewer | Read, Write, Bash, WebFetch | Reviewer ("Judge these"); no write, command or fetch | Read, Grep, Glob | Rules 3, 7; question 3; search | **Breaks today** |

### Quality (11)

| Agent | Today | Ordered by the body | Proposed | Why | Floor |
|---|---|---|---|---|---|
| architecture-checker | Read, Grep, Glob, Bash | depcruise and per-language tools | unchanged | Search | — |
| code-reviewer | Read, Grep, Glob | Reads the diff | unchanged | Search | — |
| code-smell-detector | Read, Grep, Glob | Reads code | unchanged | Search | — |
| complexity-analyzer | Bash, Read, Grep, Glob | lizard, radon, eslint, gocyclo | unchanged | Search | — |
| complexity-reducer | Read, Grep | Plans refactors; line 385 orders it to "author it in the project's `codemods/` folder" | Read, Grep, Glob | Rule 2; that order rewritten to put the recipe in the report (decision 6); search | — |
| consistency-checker | Read, Grep, Glob | Reads code | unchanged | Search | — |
| dead-code-detector | Bash, Read, Grep, Glob | knip, vulture, staticcheck | unchanged | Search | — |
| duplicate-code-detector | Bash, Read, Grep, Glob | jscpd, pylint, pmd | unchanged | Search | — |
| performance-validator | Bash, Read, Grep, Glob | Benchmarks, size-limit | unchanged | Search | — |
| quality-gate | Bash, Read, Write, Grep, Glob, Task | Dispatches; manages the quality-state cache | Bash, Read, Write, Grep, Glob, Task, Edit | Rule 1; search | — |
| type-checker | Bash, Read, Grep, Glob | mypy, tsc | unchanged | Search | — |

### Real time (2)

| Agent | Today | Ordered by the body | Proposed | Why | Floor |
|---|---|---|---|---|---|
| hil-harness | Read, Grep, Glob | Reads | unchanged | Search | — |
| wcet-budget | Read, Grep, Glob | Reads | unchanged | Search | — |

### Software-as-a-service (11) — every body is a reviewer ("You are the standing observer …", "Judge these")

| Agent | Today | Ordered by the body | Proposed | Why | Floor |
|---|---|---|---|---|---|
| clerk-auth | Read, Write, Edit, Bash | Reviews; no write, no command | Read, Grep, Glob | Rules 2, 3, 7; question 3; search | — |
| inngest-jobs | Read, Write, Edit, Bash | Reviews | Read, Grep, Glob | Rules 2, 3, 7; search | — |
| legal-scaffold | Read, Write, WebFetch | Reviews; orders live checks of regulatory dates (lines 26, 214) | Read, Grep, Glob, WebFetch | Rules 2, 7; question 3; search | **Breaks today**; within after |
| multi-tenancy-row-level | Read, Write, Edit, Bash, Grep | Reviews | Read, Grep, Glob | Rules 2, 3, 7; question 3; search | — |
| posthog-analytics | Read, Write, Edit | Reviews; "verify maturity before pinning a major version" (answerable from the installed package) | Read, Grep, Glob | Rules 2, 7; search | — |
| rate-limiting | Read, Write, Edit, Grep, Glob | Reviews | Read, Grep, Glob | Rule 7; search | — |
| resend-email | Read, Write, Edit, Bash | Reviews ("your job is to notice it is missing") | Read, Grep, Glob | Rules 2, 3, 7; search | — |
| sentry-errors | Read, Write, Edit, Bash | Reviews | Read, Grep, Glob | Rules 2, 3, 7; search | — |
| stripe-subscriptions | Read, Write, Edit, Bash, Grep | Reviews | Read, Grep, Glob | Rules 2, 3, 7; question 3; search | — |
| supabase-data | Read, Write, Edit, Bash | Reviews | Read, Grep, Glob | Rules 2, 3, 7; search | — |
| vercel-deploy | Read, Write, Bash | Reviews; "current documentation should be checked before pinning one … never pin a key from memory" (line 30) — an unexecutable order today | Read, Grep, Glob, WebFetch | Rules 2, 3, 7; question 3; search | Within after (no write, no command) |

### Safety (3)

| Agent | Today | Ordered by the body | Proposed | Why | Floor |
|---|---|---|---|---|---|
| fault-tree-builder | Read, Grep, Glob | Reads | unchanged | Search | — |
| fmeda-analyzer | Read, Grep, Glob | Reads | unchanged | Search | — |
| redundancy-pattern-picker | Read, Grep, Glob | Reads | unchanged | Search | — |

### Security (10)

| Agent | Today | Ordered by the body | Proposed | Why | Floor |
|---|---|---|---|---|---|
| concurrency-checker | Bash, Read, Grep, Glob | `go test -race`, `go vet`, cargo, spotbugs | unchanged | Search | — |
| cra-incident-clocks | Read, Write, Grep | Reviewer; "Output is structured YAML findings"; no write | Read, Grep, Glob | Rules 2, 7; search | — |
| dependency-auditor | Bash, Read, Grep, Glob | npm audit, outdated, license and SBOM tools | unchanged | Search | Bash reaches registries |
| dependency-checker | Bash, Read | npm audit, pip-audit, govulncheck, cargo audit (its body also shows `npm audit fix`, which changes the lockfile — reported, not changed) | Bash, Read, Grep, Glob | Rule 2; search | Bash reaches registries |
| incident-responder | Bash, Read, Grep, Glob | Reviews runbooks; the skill's first phase is `ls` (a listing); no command | Read, Grep, Glob | Rule 3; search | — |
| input-validation-checker | Read, Grep | Reads | Read, Grep, Glob | Rule 2; search | — |
| sast-scanner | Bash, Read, Grep, Glob | semgrep, bandit, gosec | unchanged | Search | — |
| secrets-detector | Bash, Read, Grep, Glob | trufflehog, gitleaks; live verification with provider APIs | unchanged | Search | Bash sends found credentials to providers |
| security-scanner | Bash, Read, Write, Grep, Glob | Writes `.ctoc/quality-state/security-results.json` and a report; computes sha256 fingerprints | Bash, Read, Write, Grep, Glob, Edit | Rule 1; search | — |
| threat-modeler | Bash, Read, Grep, Glob | Reviewer; no command (named as a hole in `tests/watcher-shape.test.js` lines 95-98) | Read, Grep, Glob | Rule 3; search | — |

### Specialized (11)

| Agent | Today | Ordered by the body | Proposed | Why | Floor |
|---|---|---|---|---|---|
| accessibility-checker | Bash, Read, Grep, Glob | `npx axe` | unchanged | Search | — |
| api-contract-validator | Bash, Read, Grep, Glob | spectral, graphql-inspector, buf, pact-broker | unchanged | Search | — |
| configuration-validator | Bash, Read | A checklist; no command | Read, Grep, Glob | Rules 2, 3; search | — |
| database-reviewer | Read, Grep, Bash | A checklist; no command | Read, Grep, Glob | Rule 3; search | — |
| error-handler-checker | Read, Grep | Reads | Read, Grep, Glob | Rule 2; search | — |
| health-check-validator | Bash, Read, Grep, Glob | A checklist with example code; no command | Read, Grep, Glob | Rule 3; search | — |
| memory-safety-checker | Bash, Read, Grep, Glob | Sanitizer builds, Miri | unchanged | Search | — |
| observability-checker | Read, Grep | Reads | Read, Grep, Glob | Rule 2; search | — |
| performance-profiler | Bash, Read, Grep | py-spy, `node --prof`, pprof | Bash, Read, Grep, Glob | Rule 2; search | — |
| resilience-checker | Read, Grep | Reads | Read, Grep, Glob | Rule 2; search | — |
| translation-checker | Read, Grep, Glob | Reads | unchanged | Search | — |

### Testing (14)

| Agent | Today | Ordered by the body | Proposed | Why | Floor |
|---|---|---|---|---|---|
| coverage-enforcer | Bash, Read, Grep | Coverage parsers and thresholds | Bash, Read, Grep, Glob | Rule 2; search | — |
| coverage-mapper | Bash, Read, Write, Grep, Glob | "Update coverage-map.json" | Bash, Read, Write, Grep, Glob, Edit | Rule 1; search | — |
| playwright-qa | Bash, Read, Write, Edit, Grep, Glob | Writes and runs end-to-end tests | unchanged | Search | — |
| quality-gate-runner | Bash, Read, Grep, Glob, Task | Runs checks with `&` / `wait`; a section dispatches `general-purpose` agents with Task | Bash, Read, Grep, Glob | Rule 4; that section replaced; search | — |
| e2e-test-runner | Bash, Read | playwright, cypress, docker | Bash, Read, Grep, Glob | Rule 2; search | — |
| integration-test-runner | Bash, Read | pytest, npm, go test, docker compose | Bash, Read, Grep, Glob | Rule 2; search | — |
| mutation-test-runner | Bash, Read | mutmut, stryker, pitest, cargo mutants | Bash, Read, Grep, Glob | Rule 2; search | — |
| smoke-test-runner | Bash, Read | The smoke script | Bash, Read, Grep, Glob | Rule 2; search | — |
| unit-test-runner | Bash, Read | pytest, npm, go test, cargo | Bash, Read, Grep, Glob | Rule 2; search | — |
| smart-test-runner | Bash, Read, Write, Grep, Glob | "Update cache": `file-hashes.json`, `test-results.json` | Bash, Read, Write, Grep, Glob, Edit | Rule 1; search | — |
| e2e-test-writer | Read, Write, Edit, Bash | Writes tests; "Run Command: npx playwright test" | Read, Write, Edit, Bash, Grep, Glob | Rule 2; search | — |
| integration-test-writer | Read, Write, Edit, Bash | Writes tests; "Use `pytest -m integration` to run" | Read, Write, Edit, Bash, Grep, Glob | Rule 2; search | — |
| property-test-writer | Read, Write, Edit, Bash | Writes tests; no run order today | Read, Write, Edit, Bash, Grep, Glob | Rule 2; gains the order to run its tests red (decision 7); search | — |
| unit-test-writer | Read, Write, Edit, Bash | Writes tests; "Run tests and CONFIRM they fail" | Read, Write, Edit, Bash, Grep, Glob | Rule 2; search | — |

### Versioning (3)

| Agent | Today | Ordered by the body | Proposed | Why | Floor |
|---|---|---|---|---|---|
| backwards-compatibility-checker | Bash, Read, Grep | api-extractor, openapi-diff, npm pack | Bash, Read, Grep, Glob | Rule 2; search | — |
| feature-flag-auditor | Read, Grep | Grep for flag usages (its `git checkout` block sits inside the report template) | Read, Grep, Glob | Rule 2; search | — |
| technical-debt-tracker | Read, Grep, Bash | eslint, coverage commands | Read, Grep, Bash, Glob | Rule 2; search | — |

## Existing tests that pin a tools line

Read for this plan: every test that parses a `tools:` line or names one of these agents' tools.

| Test | What it pins | Effect |
|---|---|---|
| `tests/agent-and-skill-improvement-record.test.js` | `agent-critic` exactly `tools: Read, Grep, WebSearch, WebFetch`; `citation-validator` exactly its start line minus `Skill`; a case rejecting the validator line with Glob added | **Updated** in slice 7, on the owner's answer to question 5 (every changed line listed there) |
| `tests/agent-model-floor.test.js` | Not a tools line: `SONNET_EXEMPT` licenses `product-owner` and `vision-advisor` on Sonnet | **Updated** in slice 2: both entries deleted, on the owner's answer to question 7 |
| `tests/agent-contract-load.test.js` | `cto-chief` exactly Bash, Glob, Grep, Read, Task; no write tool | unchanged — `cto-chief` keeps its grant |
| `tests/watcher-shape.test.js` | Conforming reviewers (`advocate-critic`, `citation-validator`, `deepthink-researcher`): Read and Grep required, only Read, Grep, Glob (and web tools where allowed), no mutation tool | unchanged — Glob is allowed; `advocate-critic` keeps its grant |
| `tests/citation-validator.test.js` | Requires WebSearch, WebFetch, Read, Grep; forbids Write, Edit, MultiEdit, NotebookEdit, Bash, Task | unchanged — Glob is neither |
| `tests/gdpr-agent-definition.test.js`, `tests/eu-ai-act-agent.test.js` | Require Read and Grep; the first forbids Write, Bash, Edit | unchanged |
| `tests/eu-solution-recommender-agent.test.js`, `tests/deepthink-ships-with-ctoc.test.js` | Web-only grants | unchanged |
| `tests/refinement-loop-claims-match-code.test.js` case 6 | Whether `iron-loop-integrator` holds Task and Bash | unchanged — it gains neither |
| `tests/plugin-skill-discovery.test.js` | No agent holds `Skill` | unchanged |
| `tests/unexecutable-instruction-fence.test.js` | Cases 8 and 10 require zero findings on the real `vision-advisor` and `implementation-planner`; the scanner skips Bash holders | unchanged; after an agent loses Bash the scanner reads it for the first time, so each slice runs this fence at Step 14 and rewrites any order it finds |

## Decisions Taken Under Ambiguity

1. **Description against body: the body decides the tools** (question 3 asks the owner to confirm and covers the descriptions).
2. **A method-file command counts only when the agent itself performs it**, never an installation snippet or an example of the user's pipeline.
3. **The gate critics are left fenced** on question 4's recommendation; the test records them as `fenced`.
4. **`security-scanner` keeps Bash** although its body says "You do not run the engines yourself": its aggregation step orders a sha256 fingerprint per finding, which needs a command.
5. **`vercel-deploy` gains WebFetch** because its body orders a live check of current platform documentation; once it loses Write and Bash it is within the floor. `posthog-analytics` does not: its "verify maturity" order can be answered from the installed package.
6. **`complexity-reducer` stays read-only**: its order to "author it in the project's `codemods/` folder" is rewritten to put the full recipe in its report for the build step to save, because a planner writing into the user's project bypasses the plan's declared files, which the edit protection would refuse anyway.
7. **`property-test-writer` keeps Bash and gains a run order** ("Run the property tests you write and confirm they fail before the code they test exists"), matching `unit-test-writer`'s order, because a test writer that never sees red is not test-first.
8. **`cto-chief` and `ivv-chief` gain no Write**: their bodies describe their audit logs in the passive voice and order no file write of the agent itself; `cto-chief`'s grant is pinned.
9. **Unknown, to verify at slice 1's Step 9**: whether a dispatched agent can call AskUserQuestion at all. Rule 5 is applied to the five holders as written; `deployment-setup` and `ci-runner-setup` order the agent to ask the human but hold no AskUserQuestion, and this plan does not add it.
10. **One test, not two.** The earlier plan's own test file is folded into `tests/agent-tool-grants.test.js`, so the whole plan adds one test file and moves the documented test-file count once (slice 1).
11. **The owner's answer (1), 2026-10-05, option (a):** "Approve the additions and the six safety fixes now; hold the removals until each is checked in a real run." Slices 2 to 10 make every addition and the six safety fixes; every removal made for least privilege moves to slice 11, where it is measured in real runs before it lands. A safety fix that removes a web tool is approved work; only least-privilege removals are held.
12. **`vercel-deploy`'s WebFetch is held with its removals**, although it is an addition: beside its held Write and Bash it would break the safety floor, which the owner's answer leaves unrelaxed.
13. **`changelog-generator`'s new Write is kept**: it is an addition, not a removal, and its body orders a file rewrite no tool it holds can carry out.
14. **`quality-gate-runner`'s section replacement is held with its Task removal**: the new text says the agent holds no Task tool, which is false until the removal lands.
15. **The owner's answer (2), 2026-10-05, option (a):** "Three seconds to the first visible result." Recorded here because it was given with answer (1); it is built in the deepthink plan's slice 8 and changes nothing in this plan.
16. **The owner's ruling, 2026-10-05 — Write and Edit (rule 1), word for word:** "Every agent that can write a file can also edit one, so it never rewrites a whole file to change a part. Write and Edit are granted together and removed together. An agent whose instructions order a write gets both. An agent that holds Write but whose instructions order no write (a held removal) keeps Write, gains Edit, and loses both together only when measured runs show it never writes." It came with his addition of the same day, "make certain to have the edit tool in the agents otherwise they rewrite the entire file", and his instruction "consolidate this". Slice 1's test enforces it in one check over every agent ("Write and Edit go together"), with a debt list of the 22 agents that hold Write without Edit today; every held Write is held together with Edit (49 held tools, not 44).
17. **CTO Chief decisions, 2026-10-05, after slice 1's Steps 9, 11 and 13.** (a) `gate-critic` gains Edit under the owner's Write-and-Edit ruling (decision 16), which supersedes question 4's "keep their grants exactly as they are" for that one tool; slice 7 is to declare `agents/iron-loop/gate-critic.md`. (b) The five held-Write agents gain Edit inside the slices that own their files (`experiment-designer` in slice 3, `vercel-deploy` in slice 4, `clm-obligations`, `dsar-handler` and `cra-incident-clocks` in slice 8); the Write and Edit pair is held together for slice 11. (c) `product-reviewer`: the approved removal of its Write rested on a misreading, because its method file orders two file writes (its Step 8: the weekly review and its actions file). Slice 3 drops WebFetch only, which alone clears the safety floor; Write stays and Edit is added; Bash is held for slice 11. Slice 3 must reflect this before it is approved for build. **The counts move:** agents gaining Edit in slices 2 to 10, 15 → 22 (the brief said 21, which leaves out `product-reviewer`'s Edit); held removals 44 → 50 (Bash 20 → 21, Edit 9 → 14) on 26 → 27 agents; agents whose grant changes in slices 2 to 10, 76 → 79; approved Write removals 2 → 1 and approved Bash removals 1 → 0. The approval-protected count lines above (lines 39, 84 to 92, 167 and 177) are not edited; this decision supersedes them.
18. **A fact, verified at slice 1's Step 9 (2026-10-05): a dispatched agent cannot call AskUserQuestion.** Claude Code removes it from every dispatched subagent, foreground or background, "even when listed in the `tools` field" (https://code.claude.com/docs/en/sub-agents.md, "Available tools"); "a tool that isn't available to subagents is never granted, even when listed in `tools`" (https://code.claude.com/docs/en/tools-reference.md). Only a fork keeps it. The five `asks` agents (`kpi-planner`, `stack-chooser`, `unit-economics-modeler`, `vision-advisor`, `vision-decomposer`) can never use it when dispatched. Removing the tool and routing their questions back to the session is a separate plan; no slice of this plan changes those five profiles for it.
19. **Corrections after Step 9, to approval-protected text of this index, recorded here and not made in place** (the citation-validator's replacements 4 to 10, read 2026-10-05):
    - Line 102, old: "names three properties — processing untrustworthy input, access to sensitive systems or private data, and changing state or communicating externally — and holds that an agent should combine at most two without a person in the loop. (Believed from the article as published in late 2025; this session had no web tool and could not re-read it. Step 9 of slice 1 has CTOC's citation-validator check the citation before it is quoted anywhere.)"; new: "(published 31 October 2025, read 2026-10-05) states that "agents must satisfy no more than two of the following three properties within a session": "[A] An agent can process untrustworthy inputs", "[B] An agent can have access to sensitive systems or private data", "[C] An agent can change state or communicate externally"; if all three are needed "without starting a new session (i.e., with a fresh context window), then the agent should not be permitted to operate autonomously and at a minimum requires supervision — via human-in-the-loop approval or another reliable means of validation." A web tool together with Write, Edit or Bash is [A] with [C], which Meta's rule allows on its own; rule 6 is this plan's stricter floor, not a restatement of the Rule of Two."
    - Line 115, old: "Under Meta's definition the repository itself is untrusted input too, so any agent holding Read and Bash holds all three properties;"; new: "Meta's post does not call a repository untrustworthy input; its coding example ("High-Velocity Internal Coder [BC]") places "preventive controls around any sources of untrustworthy data [A]" by "Using author-lineage to filter all data sources processed within the agent's context window." This plan's own, stricter reading treats code the agent did not author as untrusted input, so an agent holding Read and Bash over such code can hold all three properties;"
    - Line 53 (rule 5), old: "; a background agent cannot wait for an answer."; new: ". Claude Code removes AskUserQuestion from every dispatched subagent, foreground or background, "even when listed in the `tools` field" (https://code.claude.com/docs/en/sub-agents.md, "Available tools", read 2026-10-05); a fork is the one documented exception ("Forks skip both filters and receive the main conversation's exact tool pool")."
    - Decision 9, old: "9. **Unknown, to verify at slice 1's Step 9**: whether a dispatched agent can call AskUserQuestion at all. Rule 5 is applied to the five holders as written;"; new: "9. **Verified at slice 1's Step 9 (2026-10-05): a dispatched agent cannot call AskUserQuestion.** The subagent documentation (https://code.claude.com/docs/en/sub-agents.md, "Available tools") says "The first filter removes these tools, even when listed in the `tools` field", and the list includes `AskUserQuestion`; the tools reference (https://code.claude.com/docs/en/tools-reference.md) adds "a tool that isn't available to subagents is never granted, even when listed in `tools`". Only a fork is exempt. Rule 5 is applied to the five holders as written, and their AskUserQuestion is unusable whenever they are dispatched as non-fork subagents;" (decision 9 sits in this section and could be edited in place; it is recorded here instead so the old and new text stay side by side.)
    - Decision 13, old: "its body orders a file rewrite no tool it holds can carry out."; new: "its body orders a file rewrite, and it holds neither Write nor Edit (its grant is `Bash, Read`)."
    - Lines 39 and 167, old: "44 tools on 26 agents" and "The 44 held removals on 26 agents"; new (Step 9): "49 tools on 26 agents" and "The 49 held removals on 26 agents"; after decision 17: 50 tools on 27 agents.
    - Line 92, old: "**Bash 20, Write 14, Edit 9, Task 1 — 44 tools on 26 agents.**"; new (Step 9): "**Bash 20, Write 14, Edit 14, Task 1 — 49 tools on 26 agents.**"; after decision 17: "**Bash 21, Write 14, Edit 14, Task 1 — 50 tools on 27 agents.**"
20. Superseded by slice 1 decision 22: the plan adds two test files, `tests/agent-tool-grants.test.js` and `tests/agent-tool-grants-maxima.test.js`, and moves the documented count twice inside slice 1 (545 → 547).


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation
- [ ] Test error conditions
- [ ] Run tests - expect RED (failing)

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements
- [ ] Add error handling
- [ ] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
