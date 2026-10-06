---
iron_loop_verdict: true
iron_loop: true
title: "Tool grants for the specialized, safety, real-time, data, mobile and artificial-intelligence-quality agents"
type: implementation
parent_plan: agent-tool-grants
depends_on: agent-tool-grants-s1-the-test
priority: high
effort: medium
files:
  - agents/specialized/accessibility-checker.md
  - agents/specialized/api-contract-validator.md
  - agents/specialized/configuration-validator.md
  - agents/specialized/database-reviewer.md
  - agents/specialized/error-handler-checker.md
  - agents/specialized/health-check-validator.md
  - agents/specialized/memory-safety-checker.md
  - agents/specialized/observability-checker.md
  - agents/specialized/performance-profiler.md
  - agents/specialized/resilience-checker.md
  - agents/specialized/translation-checker.md
  - agents/safety/fault-tree-builder.md
  - agents/safety/fmeda-analyzer.md
  - agents/safety/redundancy-pattern-picker.md
  - agents/realtime/hil-harness.md
  - agents/realtime/wcet-budget.md
  - agents/data-ml/data-quality-checker.md
  - agents/data-ml/feature-store-validator.md
  - agents/data-ml/ml-model-validator.md
  - agents/mobile/android-checker.md
  - agents/mobile/ios-checker.md
  - agents/mobile/react-native-bridge-checker.md
  - agents/ai-quality/ai-code-quality-reviewer.md
  - agents/ai-quality/hallucination-detector.md
  - agents/ai-quality/llm-security-tester.md
  - tests/agent-tool-grants.test.js
  - tests/agent-tool-grants-maxima.test.js
  # The owner's word of 2026-10-06, "fix all agents and skills": each agent's method file
  # is corrected with it.
  - skills/specialized/accessibility-checker/SKILL.md
  - skills/specialized/api-contract-validator/SKILL.md
  - skills/specialized/configuration-validator/SKILL.md
  - skills/specialized/database-reviewer/SKILL.md
  - skills/specialized/error-handler-checker/SKILL.md
  - skills/specialized/health-check-validator/SKILL.md
  - skills/specialized/memory-safety-checker/SKILL.md
  - skills/specialized/observability-checker/SKILL.md
  - skills/specialized/performance-profiler/SKILL.md
  - skills/specialized/resilience-checker/SKILL.md
  - skills/specialized/translation-checker/SKILL.md
  - skills/safety/fault-tree-builder/SKILL.md
  - skills/safety/fmeda-analyzer/SKILL.md
  - skills/safety/redundancy-pattern-picker/SKILL.md
  - skills/realtime/hil-harness/SKILL.md
  - skills/realtime/wcet-budget/SKILL.md
  - skills/data-ml/data-quality-checker/SKILL.md
  - skills/data-ml/feature-store-validator/SKILL.md
  - skills/data-ml/ml-model-validator/SKILL.md
  - skills/mobile/android-checker/SKILL.md
  - skills/mobile/ios-checker/SKILL.md
  - skills/mobile/react-native-bridge-checker/SKILL.md
  - skills/ai-quality/ai-code-quality-reviewer/SKILL.md
  - skills/ai-quality/hallucination-detector/SKILL.md
  - skills/ai-quality/llm-security-tester/SKILL.md
  # Scope-growth request 1791250135059-zkxsbu: six slice 8 agents get the tightened
  # typed-text clause (a name after `--`, never one that begins with `-`).
  - agents/security/dependency-checker.md
  - agents/security/dependency-auditor.md
  - agents/security/sast-scanner.md
  - agents/security/secrets-detector.md
  - agents/security/concurrency-checker.md
  - agents/compliance/license-scanner.md
approved_by: human
approved_at: 2026-10-05T20:27:06.730Z
gate_crossed: implementation → todo
---

# Tool grants for the specialized, safety, real-time, data, mobile and artificial-intelligence-quality agents

**Scope (one line):** the readers that lack them gain Grep or Glob; `llm-security-tester` drops WebSearch (question 2), which takes it off the safety-floor list; two bodies that state their own grant in prose are corrected; six checklist reviewers keep the Bash their bodies never use until slice 11 measures it; all twenty-five gain the shared search section and leave the test's debt. `deepthink-researcher` (web only) is unchanged and not in this slice.

**The owner's answer of 2026-10-05:** "Approve the additions and the six safety fixes now; hold the removals until each is checked in a real run." `llm-security-tester`'s loss of WebSearch is one of the six safety fixes and goes ahead; the six Bash removals are least-privilege removals and are held (slice 11).

Read first: the index `plans/implementation/agent-tool-grants.md` (question 2, the audit table), slice 1 and slice 11.

## Implementation Details

### The changes, agent by agent

| Agent | Tools today | Tools after | Body evidence (read 2026-10-05) |
|---|---|---|---|
| `specialized/accessibility-checker` | `Bash, Read, Grep, Glob` | unchanged | `npx axe` |
| `specialized/api-contract-validator` | `Bash, Read, Grep, Glob` | unchanged | spectral, graphql-inspector, buf, pact-broker |
| `specialized/configuration-validator` | `Bash, Read` | `Bash, Read, Grep, Glob` (Bash held, slice 11) | "You validate that configuration is correct …" — a checklist; no command |
| `specialized/database-reviewer` | `Read, Grep, Bash` | `Read, Grep, Bash, Glob` (Bash held, slice 11) | "You review database changes …" — a checklist; no command |
| `specialized/error-handler-checker` | `Read, Grep` | `Read, Grep, Glob` | Reads error handling |
| `specialized/health-check-validator` | `Bash, Read, Grep, Glob` | unchanged (Bash held, slice 11) | A checklist with example code; no command |
| `specialized/memory-safety-checker` | `Bash, Read, Grep, Glob` | unchanged | Sanitizer builds, Miri |
| `specialized/observability-checker` | `Read, Grep` | `Read, Grep, Glob` | Reads instrumentation |
| `specialized/performance-profiler` | `Bash, Read, Grep` | `Bash, Read, Grep, Glob` | py-spy, `node --prof`, pprof |
| `specialized/resilience-checker` | `Read, Grep` | `Read, Grep, Glob` | Reads retry and timeout code |
| `specialized/translation-checker` | `Read, Grep, Glob` | unchanged | Reads locale files |
| `safety/fault-tree-builder` | `Read, Grep, Glob` | unchanged | Reads |
| `safety/fmeda-analyzer` | `Read, Grep, Glob` | unchanged | Reads |
| `safety/redundancy-pattern-picker` | `Read, Grep, Glob` | unchanged | Reads |
| `realtime/hil-harness` | `Read, Grep, Glob` | unchanged | Reads |
| `realtime/wcet-budget` | `Read, Grep, Glob` | unchanged | Reads |
| `data-ml/data-quality-checker` | `Bash, Read` | `Bash, Read, Grep, Glob` (Bash held, slice 11) | No command; the skill's first phase is `rg` (a search) |
| `data-ml/feature-store-validator` | `Bash, Read` | `Bash, Read, Grep, Glob` (Bash held, slice 11) | No command; the skill's `feast apply` and `feast materialize-incremental` change a registry and are not ordered of this agent |
| `data-ml/ml-model-validator` | `Read, Grep, Glob` | unchanged | "You have `Read`, `Grep`, and `Glob` only" |
| `mobile/android-checker` | `Bash, Read, Grep, Glob` | unchanged | gradlew lint, build, tests |
| `mobile/ios-checker` | `Bash, Read, Grep, Glob` | unchanged | swiftlint, xcodebuild |
| `mobile/react-native-bridge-checker` | `Bash, Read, Grep, Glob` | unchanged (Bash held, slice 11) | A checklist; no command |
| `ai-quality/ai-code-quality-reviewer` | `Read, Grep` | `Read, Grep, Glob` | Reads named files; orders Grep searches |
| `ai-quality/hallucination-detector` | `Read, Grep, Bash` | `Read, Grep, Bash, Glob` | Registry lookups by fixed Bash recipes |
| `ai-quality/llm-security-tester` | `Bash, Read, Grep, Glob, WebSearch` | `Bash, Read, Grep, Glob` | A fixed Bash lookup of MITRE's data file; "WebSearch … never settles an identifier or a count" (line 28) |

`llm-security-tester` breaks the safety floor today (WebSearch with Bash); without WebSearch it is off the list. Its Bash still fetches MITRE's data file from a fixed host (index, stated limit).

### Body edits, exactly

- `ai-code-quality-reviewer`, line 18: "Your tools are Read and Grep, and every order in this file is one those two tools can carry out." becomes "Your tools are Read, Grep and Glob, and every order in this file is one those three tools can carry out."
- `hallucination-detector`, line 18: "Your tools are Read, Grep and Bash. You read and search with Read and Grep." becomes "Your tools are Read, Grep, Glob and Bash. You read and search with Read, Grep and Glob."
- `llm-security-tester`, line 28: "**Looking an identifier up.** WebSearch returns a summary, not the source: it can tell you that a newer release or edition exists, but it never settles an identifier or a count. The only route your tools give to the source is Bash:" becomes "**Looking an identifier up.** The only route your tools give to the source is Bash:".

**The shared search section**, in all twenty-five, immediately before `## Honest status (shared rule)`:

```markdown
## Searching the repository (shared rule)

Build every list of call sites, readers, writers or occurrences with Grep over the whole repository, never only from the files you happened to open, and read each match before you count it. Under any claim that nothing else in the repository does something, cite the search that shows it: the pattern, the path searched and how many files matched. A match shows where a name is written, not that the code runs.
```

The owner answered question 2 on 2026-10-05 with the recommended option: `llm-security-tester` drops WebSearch and its line 28 is rewritten as above.

### The test edits — `tests/agent-tool-grants.test.js`

- Remove the twenty-five keys from `DEBT`; lower `MAX_DEBT` by 25 (to 0 if every earlier slice has landed).
- Remove `ai-quality/llm-security-tester` from `RULE6_EXCEPTIONS`; lower `MAX_RULE6_EXCEPTIONS` by 1.
- `HELD_REMOVALS` is unchanged: the six `['Bash']` entries for `configuration-validator`, `database-reviewer`, `health-check-validator`, `data-quality-checker`, `feature-store-validator` and `react-native-bridge-checker` stay until slice 11.
- Lower `MAX_DEBT` by 25 and `MAX_RULE6_EXCEPTIONS` by 1 in `tests/agent-tool-grants-maxima.test.js` (`CEILINGS`) as well, in the same change, because each maximum there must equal its ceiling. Also lower `CEILINGS.EXCUSED_TOOLS` by 1 in `tests/agent-tool-grants-maxima.test.js`: the safety-floor exception this slice removes excuses 1 tool (slice 1 decision 24).

### Wiring — the live call sites

No module is added. CTO Chief dispatches these agents on their triggers (`agents/coordinator/cto-chief.md`). This slice changes what they may do, not whether they are reached.

### Security review

- Six reviewers keep an unused shell until slice 11 measures it; until then `feature-store-validator` can still run the registry-changing `feast` commands its skill shows. None of the six holds a web tool, so the safety floor holds.
- `llm-security-tester` no longer combines web search with a shell.
- No agent here loses Bash, so `tests/unexecutable-instruction-fence.test.js` scans no new agent; that moves to slice 11.

### Neighbouring plans (technical facts; the order the owner chose)

The owner answered question 6 on 2026-10-05: these slices build before the "improved three times" run's rounds reach the affected files. `ai-code-quality-reviewer`, `hallucination-detector` and `llm-security-tester` already have rounds recorded by the "improved three times" run; this slice changes their files after their last recorded fingerprint (index, question 6). Step 9 reads how that run's final check treats such an edit first.

### Acceptance criteria

1. The eleven changed tools lines read as in the table; fourteen are unchanged (`health-check-validator`'s and `react-native-bridge-checker`'s among them, their Bash held).
2. The three body sentences read as above.
3. All twenty-five carry the shared search section and are out of `DEBT`; `llm-security-tester` is out of `RULE6_EXCEPTIONS`.
4. `npm run lint`, `npm run typecheck` and `npm test` pass, zero skipped.

## Decisions Taken Under Ambiguity

1. **A skill's shell example is not an order to a reviewer** (index, readings): `feast apply` and `rg` in the data skills do not justify Bash.
2. **`llm-security-tester`'s line 94 ("every search result") stays**: it names results of any search, Grep's included, as data.
3. **The owner's answer (1), 2026-10-05, option (a):** "Approve the additions and the six safety fixes now; hold the removals until each is checked in a real run." `llm-security-tester`'s loss of WebSearch is a safety fix and goes ahead; the six Bash removals are held (slice 11).
4. **CTO Chief decision, 2026-10-06, recorded by the executor from the brief: who widened the file list, twice.** On the owner's word of 2026-10-06, "fix all agents and skills", the CTO Chief added two groups of files to this plan's `files:` and recorded the approval again. The executor did not edit `files:` or the approval record; `isApprovedForCoverage` read the plan as approved (kind `backfilled`) in `todo/` and again in `in-progress/`.
    - **The twenty-five method files** of these agents (`skills/<category>/<name>/SKILL.md`). For each: its `tools:` line equals its agent's; an order its agent cannot carry out is reworded; every `npx <package>` is `npx --no -- <package>`; nothing else is changed (decision 9).
    - **Six slice 8 agent files**, the answer to scope-growth request `1791250135059-zkxsbu`: `agents/security/dependency-checker.md`, `dependency-auditor.md`, `sast-scanner.md`, `secrets-detector.md`, `concurrency-checker.md` and `agents/compliance/license-scanner.md`. In each, one clause changed and nothing else: "…in single quotes." became "…in single quotes after `--`, and never a name that begins with `-`." Their six pins in the test now name `TOOL_OUTPUT_IS_DATA_AFTER_DASHES`, so every agent that carries the sentence carries one form.
5. **CTO Chief decision, 2026-10-06, recorded by the executor from the brief: `architecture/dependency-analyzer` stays on the debt list.** Another plan in progress is editing it; neither its agent file nor its method file was read for editing or written. So `MAX_DEBT` falls 26 → 1, not to 0.
6. **(Executor, 2026-10-06.) How the task was started**, the way slices 8 and 9 were: the task spec built by `actions.taskSpecFromPlan` from this plan, recorded with `menu task add --b64 …` (task `t137`, decision "run"), started with `menu task start t137`, and the plan moved `todo/` → `in-progress/` by `actions.startExecution`. No plan file was moved by hand.
7. **(Executor.) Reading first.** Read in full, every line, before any change: this plan; the Decisions sections of slices 8 and 9; the main tool-grant test and the limits file; all twenty-five agent bodies; all twenty-five method files. Nothing was read by search only. The six slice 8 agent files were not read in full: only their one clause was located and replaced.
8. **(Executor, by the CTO Chief brief.) Sentences added after each Role section, each pinned whole in `AGENT_BODY_SENTENCES`.** Each was written against the agent's whole body and whole method file. The exact text of each is the constant named here in `tests/agent-tool-grants.test.js`. `ai-code-quality-reviewer` and `resilience-checker` gained no sentence beyond the search section.
    - **What Bash reaches the network for, for the fourteen that hold Bash.** Six run commands: `accessibility-checker` (`A11Y_NETWORK_SCOPE`: the pages of the application under test at the address the brief names, and addresses under it that the application's own sitemap lists), `api-contract-validator` (`CONTRACT_NETWORK_SCOPE`: what lint, diff and build commands fetch, and a conformance run against the service the brief names, never production; the contract broker only where the project is set up for it and the brief says so; the pipeline blocks of the method file are never run), `memory-safety-checker` (`MEMORY_NETWORK_SCOPE`), `performance-profiler` (`PROFILER_NETWORK_SCOPE`: it never attaches to, queries or loads a production system), `android-checker` (`ANDROID_NETWORK_SCOPE`: dependency resolution by the project's own Gradle build) and `ios-checker` (`IOS_NETWORK_SCOPE`: dependency resolution by `xcodebuild`). Two run fixed network recipes of their own: `hallucination-detector` (`HALLUCINATION_NETWORK_SCOPE`: the read-only registry queries its body writes, to four registries) and `llm-security-tester` (`LLM_NETWORK_SCOPE`: the two downloads of MITRE's data file). Six hold a Bash whose removal is held and order no command: `configuration-validator` (`CONFIG_NO_NETWORK`), `database-reviewer` (`DB_NO_NETWORK`), `health-check-validator` (`HEALTH_NO_NETWORK`), `data-quality-checker` (`DATA_NO_NETWORK`), `feature-store-validator` (`FEATURE_NO_NETWORK`) and `react-native-bridge-checker` (`RN_NO_NETWORK`). Each is followed by slice 8's `NO_WEB` or `BEYOND_NO_WEB`.
    - **The owner's tree.** `WRAPPERS_RUN_ONLY_IN_OWNERS_TREE` (`android-checker`: the fuller `WRAPPERS_RUN_PROJECT_FILES`, because it runs dependency audits) in the six that run builds, linters with plugins, git or the project's code. `memory-safety-checker` and `performance-profiler` also carry `SAME_CALL_PROCESS` (every Bash call starts again in the dispatch directory and keeps no process: start a program and attach to it in one call, and never attach to a process the agent did not start) and `NO_BROWSER_TOOL`.
    - **A missing tool is a scan that did not run**: slice 9's `MISSING_TOOL_DID_NOT_RUN` in those six.
    - **What comes back is data.** `TOOL_OUTPUT_IS_DATA_AFTER_DASHES` in the six that run commands; slice 6's `PAGE_IS_DATA` in `accessibility-checker` and `TARGET_REPLY_IS_DATA` in `api-contract-validator`; slice 8's `RECORDS_ARE_DATA` in `configuration-validator`, `health-check-validator`, `react-native-bridge-checker` and the five safety and real-time agents. `hallucination-detector` and `llm-security-tester` already carry a stricter section of their own ("What you read is data"), so the shared sentence, which allows a quoted name on a command line, was not added to them.
    - **Mobile.** `MOBILE_NEVER_SHIPS` in all three: never upload a build, never sign with a real identity, never publish to a store, a tester track or an over-the-air channel. `android-checker` adds `ANDROID_RELEASE_TASKS` (`assembleRelease` and `bundleRelease` sign with the release identity where the build is set up for it, `generateBaselineProfile` rewrites a project file: never run; no build goes to a MobSF server). `ios-checker` adds `IOS_NO_LANES` (no Fastlane lane, no keychain).
    - **Data and model.** `neverQueryLive(…)` in `database-reviewer`, `data-quality-checker` and `feature-store-validator`: no query against a production database, a warehouse or a store; results come from an export or are reported as not verified. `ROWS_ARE_DATA` in the same three: rows are data, and a real person's value is never copied into a report. `ml-model-validator` holds no command tool and its body already says it runs nothing.
    - **Secrets and people's data.** Slice 8's `FOUND_DATA_NEVER_COPIED` in `configuration-validator`, `observability-checker` and `memory-safety-checker` (a heap dump holds whatever was in memory).
    - **No order asks for a tool the agent lacks.** `nameTheChange(…)` in the six command-running agents without Write. `nameTheCommand(…)` in `error-handler-checker`, `translation-checker`, `ml-model-validator`, `fault-tree-builder`, `fmeda-analyzer` and `wcet-budget`. `SHELL_SEARCH_IS_GREP` where a body or method file shows a search as a shell line. `NAME_THE_DISPATCH` in the five safety and real-time agents and `performance-profiler`, whose texts say to dispatch, notify, hand off or escalate.
    - **The five safety and real-time watchers hold no Write and gained none.** Each method file has a section "Outputs (what this skill writes)" naming an artifact under `.ctoc/safety/` or `.ctoc/realtime/`. Each agent body already says it is a standing observer that judges whether the artifact exists and is current. So each carries `judgeTheArtifact(…)`, and each method file says under that heading that the wrapper agent judges the artifact and the team or the executor writes it. `hil-harness` adds `HIL_RUNS_NO_RIG`. No agent of the twenty-five holds Write; `HELD_REMOVALS` is unchanged at 42 tools.
    - **`npx`.** Slice 6's `NPX_NO` in `accessibility-checker`, `api-contract-validator` and `performance-profiler`.
    - **`llm-security-tester` and the web.** No line of its body or method file orders a web lookup once the WebSearch sentence is gone. The paragraph `LLM_NETWORK_SCOPE` ends with the `needs-input` route to `deepthink-researcher`, in `legal-scaffold`'s wording, for a fact it can read neither from the repository nor from MITRE's data file.
    - **These are the executor's readings where no order stood in the bodies**, and the review should weigh them: that an accessibility engine may follow the application's own sitemap; that a conformance run never goes to production; that the two profiling agents never attach to a process they did not start; that the Android release tasks are never run by the agent.
9. **(Executor, by the owner's word of 2026-10-06, "fix all agents and skills".) The twenty-five method files.** Thirteen `tools:` lines were changed to equal their agent's (`accessibility-checker`, `configuration-validator`, `database-reviewer`, `error-handler-checker`, `observability-checker`, `performance-profiler`, `resilience-checker`, `data-quality-checker`, `feature-store-validator`, `ml-model-validator`, `ai-code-quality-reviewer`, `hallucination-detector`, `llm-security-tester`); twelve already did. Three method files were not changed at all: `memory-safety-checker`, `ios-checker` and `react-native-bridge-checker`. Orders an agent cannot or must not carry out were reworded, and nothing else was changed:
    - `configuration-validator`, three places: "MUST verify referenced secret URIs resolve" became a well-formedness check, with resolution taken from a listing in the brief or reported as not verified; the same on the "Secret references resolve" bullet; and the running process's configuration comes "from an export or a log handed to you in your brief".
    - `health-check-validator`: "Curl each probe under failure conditions (mock dependency down). Inspect body for stack traces, hostnames, connection strings." became "Read each probe handler's failure path for what its body would hold: stack traces, hostnames, connection strings. Requesting each probe with a dependency mocked down is a live check for the team to run; name it in your report."
    - `performance-profiler`, two places: "You attach to running processes" became "You profile processes you start yourself in the owner's working tree and read the profiles others hand you (a production process is profiled by whoever holds access to it)"; and the comment "Attach to a running process" became "Attach to a process you started".
    - `translation-checker`: "Parse the pattern (use `@formatjs/icu-messageformat-parser` or `intl-messageformat-parser`)." became "Read the pattern's structure yourself; a parser run (…) is the executor's to make, because you hold no command tool."
    - `fault-tree-builder`, `fmeda-analyzer`, `redundancy-pattern-picker`, `hil-harness`, `wcet-budget`: one sentence added under the Outputs heading (decision 8). `hil-harness` also: "run the verification at that rung (or arrange for it to be run)" became "check that the verification was run at that rung (the wrapper agent runs no rig and no test; it names a rung that still has to run)".
    - `data-quality-checker`: "performing static and runtime validation of data pipelines, warehouses, and producer-consumer interfaces" became "performing static validation of data pipelines, warehouses, and producer-consumer interfaces, and reading the runtime check results handed to you (you run no query against a database or a warehouse yourself)".
    - `feature-store-validator`, two places: the owner cross-check reads an export of the organisation's directory, never the directory itself; and a comment over the `feast` and `tecton` block says they are the platform team's own commands and the agent runs none of them.
    - `ml-model-validator`: a comment over the `pip install` block says it is for the team's own pipeline and the wrapper agent runs none of it.
    - `android-checker`, five places: the comments on `assembleRelease`, `bundleRelease` and `generateBaselineProfile` and on the MobSF upload say the agent never runs them, and the report example's release row reads "not run: the release pipeline builds and signs it".
10. **(Executor.) Every `npx <package>` in the fifty files is `npx --no -- <package>`, but for two**: 17 commands, 6 in two agent files (`accessibility-checker` 1, `api-contract-validator` 5) and 11 in four method files (`accessibility-checker` 5, `api-contract-validator` 3, `database-reviewer` 2, in comments, `performance-profiler` 1). No `npx --no` command was run. **Left as they are:** the two `npx codemod …` forms in one table cell of `skills/ai-quality/hallucination-detector/SKILL.md`. That cell reports how a third party's readme says its tool is run and cites the readme; changing the form would make the citation untrue, and the agent's body forbids it to run any package named in the code under review.
11. **(Executor.) Changes inside agent bodies beyond the added paragraphs and the search section.**
    - The three sentences this plan names, in `ai-code-quality-reviewer`, `hallucination-detector` and `llm-security-tester`. Each stood once, on the line this plan gives.
    - `database-reviewer`: the comment "-- Run EXPLAIN" became "-- The plan to read: whoever holds access to the database runs EXPLAIN and hands you its output".
    - `android-checker`: the report example's row "| release | ✅ Success | 2m 45s |" became "| release | not run: the release pipeline builds and signs it | - |".
    - `health-check-validator` and `resilience-checker`: the inner block of the report example is fenced with `~~~`, as in slice 9. The text shown is the same.
    - The `npx` commands of decision 10.
12. **(Executor.) All fifty-six agent and method files parse as strict YAML** with `js-yaml` 4.2.0 (installed in `node_modules`, not a declared dependency), before and after; none needed a change. Each of the twenty-five method files' tools line equals its agent's. Under a strict reader (a closing fence carries no label) the search section reads as prose in all twenty-five agents.
13. **Corrections to approved text of this plan, recorded here and not made in place:**
    - "Lower `MAX_DEBT` by 25 (to 0 if every earlier slice has landed)": it fell by 25, from 26 to 1 (decision 5).
    - The table's "unchanged" for fourteen agents speaks of their tools lines; their bodies gained the sentences of decision 8.
    - "`health-check-validator` … A checklist with example code; no command": its method file ordered a `curl` of each probe; that line is reworded (decision 9).
    - "`llm-security-tester` … Its Bash still fetches MITRE's data file from a fixed host": it does; the use is now stated and scoped (decision 8).
    - The security review's "until then `feature-store-validator` can still run the registry-changing `feast` commands its skill shows": it still holds the shell; its body and its method file now say it never runs them.
    - "No agent here loses Bash" stands.
    - "Read first: the index `plans/implementation/agent-tool-grants.md`": the index is at `plans/todo/agent-tool-grants.md`.
    - Step 10's "every change by `Edit` after a `Read`": see the Execution Record.
    - The test edits do not name `CEILINGS.EXCUSED_TOOLS` in the main file: the main test holds no such constant; the count is read from `RULE6_EXCEPTIONS`, now empty.
14. **Carried, seen and not done:**
    - Six agents keep a shell their own text says they never use (held, slice 11): `configuration-validator`, `database-reviewer`, `health-check-validator`, `data-quality-checker`, `feature-store-validator`, `react-native-bridge-checker`. Their new sentences bind by instruction only.
    - `agents/security/dependency-checker.md` and `agents/security/concurrency-checker.md` have a report example with an inner block fenced by backticks, so a strict reader takes the rest of the file as code. Only the one clause was changed in those files, by the brief.
    - `skills/ai-quality/llm-security-tester/SKILL.md` names `/tmp/sandbox` as the one writable path of a sandbox for the application under review; it is not a path the agent uses.
    - `skills/specialized/database-reviewer/SKILL.md` shows `./migrate --connection "$(secret)"` in a comment: a connection string on a command line, in an example of a deployment the agent does not run.
    - The method files of `accessibility-checker`, `configuration-validator`, `health-check-validator`, `observability-checker` and `translation-checker` declare `model: sonnet`; their agents declare `opus`. Not changed.
    - Most of the twenty-five method files still speak of a letter "you write to CTO Chief" and of documenting a waiver in a plan's Decisions section; the first is the agent's reply, the second is the team's to write.
    - The safety and real-time agents' "Related Agents" tables still say "dispatch it"; the pinned sentence says what that means for an agent with no dispatch tool.
    - `memory-safety-checker` and `performance-profiler` write binaries and profiles into the directory they run in (`-o app`, `profile.svg`, `isolate-*.log`); no sentence sends those to a folder made with `mktemp -d`.
    - Plan 00266's inventory holds a `fingerprint_at_start` for these files; none of the fifty matches any more. That file is 00266's and was not touched. Its record test compares recorded rounds with each other, not with the files, and passes.
    - A contradicting sentence added beside an intact pinned sentence passes the test, and nothing fails on a bare `npx <tool>` turned back in a file (carried from slices 6 to 9).
15. **CTO Chief decision, 2026-10-06: one combined fix pass after the review and the security scan.** The review (`.ctoc/audit/tool-grant-run-notes/s10-step11-review-critic.md`) sent the work back on one sentence; the scan (`.ctoc/audit/tool-grant-run-notes/s10-step13-secure-scanner.md`) said warn. Both notes were read in full. Every change below was made test first: the pinned constant changed, `node --test tests/agent-tool-grants.test.js` failed on exactly the seven agents concerned, then the files were edited. The texts are the notes' own. The items below supersede decision 8 and decision 14 where they differ.
    - **The review's blocker, the start-and-attach sentence** (`SAME_CALL_PROCESS`, in `memory-safety-checker` and `performance-profiler`). It now reads: "Every Bash call starts again in the directory you were dispatched in and keeps no variable from the call before, so no later call can find a program an earlier call started, even while it keeps running: in one call, start the program, attach a tool to it (a profiler, `jcmd`, `dotnet-counters`, `perf`, `py-spy`), and stop the program if it is still running; never attach to a process you did not start." The old text said a call keeps no process, which is untrue for a program started in the background.
    - **Project code runs only in the owner's tree** (`PROJECT_CODE_IN_OWNERS_TREE`, after the owner's-tree sentence in `performance-profiler`, `memory-safety-checker` and `api-contract-validator`): "The same holds for every other command that runs the project's own files as code — the program you start under a profiler, a sanitizer or Valgrind, and a linter whose ruleset or configuration is code (a `.spectral.js` ruleset)." That a Spectral ruleset can be JavaScript is the scan's memory, not checked.
    - **Heap dumps go to a temporary folder** (`DUMPS_IN_TEMP_FOLDER`, in `memory-safety-checker` and `performance-profiler`): "Make a folder with `mktemp -d` in the same Bash call that starts the program, have every heap dump, profile and instrumented binary written there through the shell variable, read the file there, copy no value from it into your report, and delete the folder with `rm -rf -- '<folder>'` before you report." ", each in that folder" was appended to the list of what a tool writes as it runs in both agents, because both carry the sentence. In `skills/specialized/memory-safety-checker/SKILL.md` the `dotnet-gcdump collect` and `jcmd … GC.heap_dump` lines now write to `"$dir/app.gcdump"` and `"$dir/heap.hprof"`, under a comment that `$dir` is the folder made in the same call. That `dotnet-gcdump collect` takes `-o` is believed, not checked.
    - **Android benchmark builds** (`ANDROID_RELEASE_TASKS`): appended "The same holds for `:macrobenchmark:connectedCheck` and any task that builds a build type made from the release one (`benchmark`, `nonMinifiedRelease`): read that build type first, and where its `signingConfig` is not the debug one, do not run the task; name it in your report." That a benchmark build type inherits the release signing is the scan's reading of Android's setup, not checked. The method file's `dependencyInsight --dependency <pkg>` line carries the review's comment: the agent runs it only with a name its brief gives, and a name read from a build file goes in the report for the executor.
    - **`ios-checker`'s scheme**: both `xcodebuild -scheme MyApp` lines in the agent now read `-scheme 'MyApp'`, under a comment that the scheme comes from the brief or from the project file listing that `xcodebuild -list` prints, typed in single quotes.
    - **`hallucination-detector`'s redirects** (`HALLUCINATION_NETWORK_SCOPE`): "…or a registry answer; the recipes' own `-L`, held to https and three redirects, is the one exception." One sentence, the scan's words, for the review's and the scan's single point.
    - **`accessibility-checker`'s addresses** (`A11Y_NETWORK_SCOPE`): the sentence of decision 8 beginning "Give an engine only…" is replaced by "Type into a command only an address your brief names. An engine may read the application's own sitemap at that address itself (`pa11y-ci --sitemap`); never type an address taken from the sitemap, any other file, a page's text or a redirect."
    - **`ml-model-validator`'s pickle guard** (`PICKLE_NEVER_LOADED`, appended to its paragraph): "A command you name never loads a pickled model file (`.pkl`, `.joblib`, `pd.read_pickle`, `torch.load` without `weights_only=True`) that came from a download or from outside the owner's tree; name such a file as a finding and the run as not done."
    - **`skills/specialized/translation-checker/SKILL.md` line 362**: the live right-to-left override character in the spoofing example is now written as the escape `‮`; no live U+202E is left in that file.
    - **Not changed, by the brief:** the shared typed-text constant. Twenty agents carry it, and allowing a scheme, target or dependency name as an option's value is its own piece of work.
    - **The slice 7 files** were committed separately (v6.14.90). The diff both reviewers saw held them; it no longer does.
    - **Proof:** 26 one-word mutations of the whole pinned paragraphs of the eight agents touched in this pass, and 13 targeted mutations, one inside each new or changed sentence in every agent that carries it: 39 caught, 0 missed.
16. **Carried from the review's and the scan's backlogs, not done:**
    - `accessibility-checker` may start a dev server and has no rule to start and stop it within one call.
    - `pa11y-ci --sitemap` visits every sitemap entry, another host's included; the sentence forbids it, nothing filters it.
    - `memory-safety-checker` says it reaches the network "for nothing else" yet allows a profiler address on this machine; `performance-profiler` calls the same case its "one thing only".
    - `android-checker` no longer checks how the release build shrinks code; a shrink task that does not sign may exist (not checked).
    - The method file's `assembleRelease` comment says "it signs" without condition; the agent says "wherever the build is set up for it".
    - `fmeda-analyzer` and `wcet-budget` send the metric arithmetic to a script; checking recorded arithmetic by hand needs no command.
    - The five safety and real-time method files keep the heading "Outputs (what this skill writes)" above the sentence saying the wrapper writes nothing.
    - `llm-security-tester`'s `needs-input` return has no field in its response schema; its body sends the same thing to `self_assessment.unknowns`.
    - `database-reviewer` and `error-handler-checker` have tool tables of one shape and two rulings.
    - `api-contract-validator`'s "the blocks headed CI … you never run them" also reaches `buf lint`, `buf breaking` and `oasdiff breaking`, which its own Tools section runs.
    - `ios-checker` calls `match`, `build_app` and `upload_to_testflight` lanes; they are Fastlane actions.
    - The shared typed-text clause cannot be met by a name passed as an option's value (Gradle's `--dependency`, `xcodebuild -scheme`, `py-spy --pid`), and a Maven coordinate holds `:`; both fail safe.
    - Nothing fails on a bare `npx <tool>` put back, on a contradicting sentence beside an intact pin, or on a method file's tools line drifting from its agent's.
    - Six agents keep a shell bound by instruction only, until slice 11.
    - `skills/ai-quality/hallucination-detector/SKILL.md` keeps two bare `npx codemod …` inside a quotation.
    - `skills/specialized/performance-profiler/SKILL.md` still recommends profiling in production in three places; the agent body overrides them.
    - `skills/specialized/database-reviewer/SKILL.md` still shows `./migrate --connection "$(secret)"`.
    - The memory method file's other profiling lines (`jcmd … JFR.start … filename=mem.jfr`, `memray`, `heaptrack`, `node --heap-prof`, `valgrind`) still write into the directory they run in; the pinned sentence governs them.
    - `agents/ai-quality/llm-security-tester.md` records, dated 2026-10-01, that its search found a character line 362 of the translation method file labels U+202E; that line now holds the escape, so the record describes the file as it was.
    - Commit slice 10 by its own file list, never with `git add -A`.

## Execution Record

- **Read in full before any change:** this plan; the Decisions sections of slices 8 and 9; `tests/agent-tool-grants.test.js` and `tests/agent-tool-grants-maxima.test.js`; all twenty-five agent bodies; all twenty-five method files. The six slice 8 agent files: only the one clause.
- **Step 8, red:** with only the test files changed, `node --test tests/agent-tool-grants.test.js` failed checks 3 and 5, naming every agent of this slice by its missing tool or missing sentence, `llm-security-tester` by "holds WebSearch" and the six slice 8 agents by their sentence.
- **Step 9:** Node v24.14.1; js-yaml 4.2.0; the 58 declared files fingerprinted (sha256) before any change; every replacement was required to match exactly once or the run stopped. Plan 00266's record test compares recorded rounds with each other, not with these files (decision 14).
- **How the edits were made:** by two scripts, not by the Edit tool, kept in a new scratchpad subfolder (`s10/edit-tests.js`, `s10/apply.js`, one correction `s10/fix1.js`). Each reads this plan's `files:` and refuses any other path. `apply.js` takes every pinned sentence from the test itself, so file and pin cannot differ by a byte. This plan was edited with the Edit tool.
- **One correction to my own first draft, before review:** `A11Y_NETWORK_SCOPE` first said never to point an engine at an address taken from a file; the method file crawls the application's own sitemap. The sentence now allows an address under the brief's that the sitemap lists.
- **Mutation proof:** for each of the 31 changed agents, every pinned sentence and the search rule were mutated once in memory (one word replaced): 83 mutations, 83 caught, each by exactly one "lacks" failure.
- **Limits:** `MAX_DEBT` 26 → 1, `MAX_RULE6_EXCEPTIONS` 1 → 0, `EXCUSED_TOOLS` 1 → 0, in both files. `MAX_HELD_REMOVALS` 42, `MAX_WRITE_EDIT_DEBT` 0, `MAX_MATCH_IS_DATA_DEBT` 0: unchanged. No limit was raised.
- **Step 14, verify (2026-10-06, run after the one-minute load fell below 8):** the tool-grant, limits, model-floor, unexecutable-order and watcher-shape tests: 74 passed, 0 failed, 0 skipped. `npm run lint`: clean. `npm run typecheck`: 1 passed. `npm test`: 12,098 tests, 12,098 passed, 0 failed, 0 skipped; coverage 99.9% against a floor of 99%; the gate printed PASS. An earlier full run, under a load of about 21, failed one timing test (`tests/reachability-surface-scan-is-linear.test.js`, a 2 MiB scan against a 1 MiB one); run alone it passed, and the two later full runs passed. Neither that test nor its module was changed.
- **Review and security scan:** the review sent the work back on one sentence and the scan said warn; both were answered in one fix pass (decision 15), made by the scripts `s10/fix2-tests.js` and `s10/fix2-files.js` under the same `files:` guard. Red before the file edits: check 3 failed on the seven agents concerned.
- **Step 14 after the fix pass (2026-10-06, one-minute load 4.9):** the tool-grant, limits, model-floor, unexecutable-order and watcher-shape tests: 74 passed, 0 failed, 0 skipped. `npm run lint`: clean. `npm run typecheck`: 1 passed. `npm test`: 12,098 tests, 12,098 passed, 0 failed, 0 skipped; coverage 99.89% against a floor of 99%; the gate printed PASS.
- **Step 16:** the CTO Chief dispatched the review and the security scan; the final check of Steps 8 to 15 is this record, and the plan is completed through the menu's task completion (`t137`).

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation: the test edits above
- [x] Test error conditions: the failure messages name each agent and each wrong tool
- [x] Run tests - expect RED (failing): `node --test tests/agent-tool-grants.test.js`, recorded

### Step 9: PREPARE
- [x] Install dependencies if needed: none
- [x] Check prerequisites: fingerprint the twenty-five files; confirm each `old_string` occurs exactly once; read the improvement run's rule for an edit after recorded rounds
- [x] Verify dev environment ready: record the Node version
- [x] Create directories/config if needed: none

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements: the tools lines, the three sentences, the twenty-five search sections — every change by `Edit` after a `Read`
- [x] Add error handling: none
- [x] Wire up integration points: none new

### Step 11: REVIEW
- [x] Self-review all new code: through CTOC's review agent
- [x] Verify integration points work together: `tests/unexecutable-instruction-fence.test.js` and `tests/agent-and-skill-improvement-record.test.js` pass
- [x] Check error handling completeness: n/a

### Step 12: OPTIMIZE
- [x] Remove redundant operations: none
- [x] Optimize critical paths: none
- [x] Simplify complex code: none

### Step 13: SECURE
- [x] Validate inputs (no path traversal): through CTOC's security scan agent, the safety floor for `llm-security-tester`
- [x] Sanitize outputs: n/a
- [x] No secrets in code: none
- [x] Safe file operations: n/a

### Step 14: VERIFY
- [x] Run lint + type check: `npm run lint`, `npm run typecheck`
- [x] Run ALL tests (TDD Green): `npm test`
- [x] Check coverage >= 80%: at or above the floor in `.ctoc/coverage-baseline.json`
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation: the bodies themselves
- [x] Add JSDoc comments to new functions: none
- [x] Update CHANGELOG if needed: no changelog file exists

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly: through CTOC's final review agent
- [x] All quality checks passed: `npm test`
- [x] Manual verification if needed: none
- [x] Ready for human review: through the menu's task completion


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
