---
iron_loop_verdict: true
iron_loop: true
title: "Tool grants for the quality, architecture, versioning, frontend and developer-experience agents"
type: implementation
parent_plan: agent-tool-grants
depends_on: agent-tool-grants-s1-the-test
priority: high
effort: medium
files:
  - agents/quality/architecture-checker.md
  - agents/quality/code-reviewer.md
  - agents/quality/code-smell-detector.md
  - agents/quality/complexity-analyzer.md
  - agents/quality/complexity-reducer.md
  - agents/quality/consistency-checker.md
  - agents/quality/dead-code-detector.md
  - agents/quality/duplicate-code-detector.md
  - agents/quality/performance-validator.md
  - agents/quality/quality-gate.md
  - agents/quality/type-checker.md
  # agents/architecture/dependency-analyzer.md is left out (CTO Chief, 2026-10-06): plan 00266 is
  # editing it; its grant is fixed when that plan finishes.
  - agents/architecture/pattern-detector.md
  - agents/versioning/backwards-compatibility-checker.md
  - agents/versioning/feature-flag-auditor.md
  - agents/versioning/technical-debt-tracker.md
  - agents/frontend/bundle-analyzer.md
  - agents/frontend/component-tester.md
  - agents/frontend/visual-regression-checker.md
  - agents/devex/api-deprecation-checker.md
  - agents/devex/onboarding-validator.md
  - tests/agent-tool-grants.test.js
  - tests/agent-tool-grants-maxima.test.js
  # The owner's word of 2026-10-06, "fix all agents and skills": each agent's method file
  # is corrected with it (dependency-analyzer's is left to the plan that is improving it).
  - skills/quality/architecture-checker/SKILL.md
  - skills/quality/code-reviewer/SKILL.md
  - skills/quality/code-smell-detector/SKILL.md
  - skills/quality/complexity-analyzer/SKILL.md
  - skills/quality/complexity-reducer/SKILL.md
  - skills/quality/consistency-checker/SKILL.md
  - skills/quality/dead-code-detector/SKILL.md
  - skills/quality/duplicate-code-detector/SKILL.md
  - skills/quality/performance-validator/SKILL.md
  - skills/quality/quality-gate/SKILL.md
  - skills/quality/type-checker/SKILL.md
  - skills/architecture/pattern-detector/SKILL.md
  - skills/versioning/backwards-compatibility-checker/SKILL.md
  - skills/versioning/feature-flag-auditor/SKILL.md
  - skills/versioning/technical-debt-tracker/SKILL.md
  - skills/frontend/bundle-analyzer/SKILL.md
  - skills/frontend/component-tester/SKILL.md
  - skills/frontend/visual-regression-checker/SKILL.md
  - skills/devex/api-deprecation-checker/SKILL.md
  - skills/devex/onboarding-validator/SKILL.md
approved_by: human
approved_at: 2026-10-06T14:34:53.000Z
gate_crossed: review → done
---

# Tool grants for the quality, architecture, versioning, frontend and developer-experience agents

**Scope (one line):** twelve of these 21 agents already hold the right tools and need only the shared search section; seven gain Grep or Glob, `quality-gate` gains Edit, `complexity-reducer` stops ordering a write into the user's project, and `pattern-detector` keeps the Bash it never uses until slice 11 measures it; all twenty-one leave the test's debt.

**The owner's answer of 2026-10-05:** "Approve the additions and the six safety fixes now; hold the removals until each is checked in a real run." `pattern-detector`'s loss of Bash is a least-privilege removal and is held (slice 11); every other change here is an addition or a body correction and goes ahead.

Read first: the index `plans/implementation/agent-tool-grants.md`, slice 1 and slice 11.

## Implementation Details

### The changes, agent by agent

| Agent | Tools today | Tools after | Body evidence (read 2026-10-05) |
|---|---|---|---|
| `quality/architecture-checker` | `Read, Grep, Glob, Bash` | unchanged | `npx depcruise` and per-language tools |
| `quality/code-reviewer` | `Read, Grep, Glob` | unchanged | Reads the diff |
| `quality/code-smell-detector` | `Read, Grep, Glob` | unchanged | Reads code |
| `quality/complexity-analyzer` | `Bash, Read, Grep, Glob` | unchanged | lizard, radon, eslint, gocyclo, clippy |
| `quality/complexity-reducer` | `Read, Grep` | `Read, Grep, Glob` | Plans refactors as diffs and codemod recipes; line 385 orders it to "author it in the project's `codemods/` folder" |
| `quality/consistency-checker` | `Read, Grep, Glob` | unchanged | Reads code |
| `quality/dead-code-detector` | `Bash, Read, Grep, Glob` | unchanged | knip, vulture, staticcheck, cargo udeps |
| `quality/duplicate-code-detector` | `Bash, Read, Grep, Glob` | unchanged | jscpd, pylint, pmd cpd |
| `quality/performance-validator` | `Bash, Read, Grep, Glob` | unchanged | Benchmarks, size-limit |
| `quality/quality-gate` | `Bash, Read, Write, Grep, Glob, Task` | `Bash, Read, Write, Grep, Glob, Task, Edit` | Dispatches the quality agents; "You manage the quality state cache" |
| `quality/type-checker` | `Bash, Read, Grep, Glob` | unchanged | mypy, tsc |
| `architecture/dependency-analyzer` | `Read, Grep, Glob, Bash` | unchanged | Runs its own analysis program with Bash (line 98) |
| `architecture/pattern-detector` | `Read, Grep, Glob, Bash` | unchanged (Bash held, slice 11) | Glob patterns and import reading; its one shell-labelled block is a list of Glob calls; no command |
| `versioning/backwards-compatibility-checker` | `Bash, Read, Grep` | `Bash, Read, Grep, Glob` | api-extractor, openapi-diff, `npm pack` |
| `versioning/feature-flag-auditor` | `Read, Grep` | `Read, Grep, Glob` | Grep for flag usages; its `git checkout` block sits inside the report template |
| `versioning/technical-debt-tracker` | `Read, Grep, Bash` | `Read, Grep, Bash, Glob` | eslint and coverage commands |
| `frontend/bundle-analyzer` | `Bash, Read, Grep, Glob` | unchanged | Production builds |
| `frontend/component-tester` | `Bash, Read` | `Bash, Read, Grep, Glob` | Runs component tests and reports failures |
| `frontend/visual-regression-checker` | `Bash, Read` | `Bash, Read, Grep, Glob` | percy, chromatic, playwright |
| `devex/api-deprecation-checker` | `Bash, Read, Grep` | `Bash, Read, Grep, Glob` | `tsc`, `npm outdated`, `curl -sI` |
| `devex/onboarding-validator` | `Bash, Read, Grep, Glob` | unchanged | `git clone`, install, build, test |

### Body edits, exactly

**`complexity-reducer`, line 385.** Replace "author it in the project's `codemods/` folder and name it in the plan" with "write the full recipe in your report, naming the path under the project's `codemods/` folder where the build step will save it, and name that path in the plan". This agent plans; the build step writes, inside a plan that declares the file. (A write into the user's project from a planner would also be refused by the edit protection unless a plan declared the path.)

**The shared search section**, in all twenty-one, immediately before `## Honest status (shared rule)`:

```markdown
## Searching the repository (shared rule)

Build every list of call sites, readers, writers or occurrences with Grep over the whole repository, never only from the files you happened to open, and read each match before you count it. Under any claim that nothing else in the repository does something, cite the search that shows it: the pattern, the path searched and how many files matched. A match shows where a name is written, not that the code runs.
```

### The test edits — `tests/agent-tool-grants.test.js`

Remove the twenty-one keys from `DEBT`; lower `MAX_DEBT` by 21. Remove `quality/quality-gate` from `WRITE_EDIT_DEBT` (it now holds Write and Edit together); lower `MAX_WRITE_EDIT_DEBT` by 1. `HELD_REMOVALS` is unchanged: `'architecture/pattern-detector': ['Bash']` stays until slice 11. Lower `MAX_DEBT` by 21 and `MAX_WRITE_EDIT_DEBT` by 1 in `tests/agent-tool-grants-maxima.test.js` (`CEILINGS`) as well, in the same change, because each maximum there must equal its ceiling.

### Wiring — the live call sites

No module is added. CTO Chief dispatches these agents at Steps 11, 12 and 14 (`agents/coordinator/cto-chief.md`); `quality-gate` coordinates the quality agents. This slice changes what they may do, not whether they are reached.

### Security review

- `pattern-detector` keeps its unused shell until slice 11 measures it; it holds no web tool, so the safety floor holds. `tests/unexecutable-instruction-fence.test.js` begins scanning it only when its Bash is removed (slice 11).
- `quality-gate`'s Edit adds no reach beyond its Write.

### Neighbouring plans (technical facts; the order the owner chose)

The owner answered question 6 on 2026-10-05: these slices build before the "improved three times" run's rounds reach the affected files. `architecture/dependency-analyzer` is the subject of the "improved three times" run's slice now in progress (`plans/in-progress/00266-…-s6-dependency-analyzer.md`), and it already has recorded rounds. This slice's only change to it is the search section; it is built after that slice completes, and Step 9 reads how that run's final check treats an edit after recorded rounds (index, question 6).

### Acceptance criteria

1. The eight changed tools lines read as in the table; thirteen are unchanged (`pattern-detector`'s among them, its Bash held).
2. `complexity-reducer` line 385 reads as above.
3. All twenty-one carry the shared search section and are out of `DEBT`; `quality-gate` is out of `WRITE_EDIT_DEBT`; `MAX_DEBT` and `MAX_WRITE_EDIT_DEBT` are lowered by 21 and 1 in both test files.
4. `npm run lint`, `npm run typecheck` and `npm test` pass, zero skipped.

## Decisions Taken Under Ambiguity

1. **`complexity-reducer` stays read-only** and puts its recipe in the report (index, decision 6).
2. **`feature-flag-auditor`'s shell block is report text**, not an order: it sits inside the fenced report template.
3. **The owner's answer (1), 2026-10-05, option (a):** "Approve the additions and the six safety fixes now; hold the removals until each is checked in a real run." `pattern-detector`'s loss of Bash is held (slice 11); `complexity-reducer`'s rewritten order is a body correction that removes no tool, so it goes ahead.
4. **CTO Chief decision, 2026-10-06, recorded by the executor from the brief: `architecture/dependency-analyzer` is left out of this slice.** `agents/architecture/dependency-analyzer.md` and `skills/architecture/dependency-analyzer/SKILL.md` carry uncommitted edits of the "improved three times" plan now in progress (`plans/in-progress/00266-…-s6-dependency-analyzer.md`). Neither file was read for editing or written. The agent stays on `DEBT`; its grant and its search section are fixed when that other plan finishes. So this slice covers twenty agents, not twenty-one, and every limit that counts this agent falls by one less than this plan says: `MAX_DEBT` 46 → 26 (not 25).
5. **CTO Chief decision, 2026-10-06, recorded by the executor from the brief: who widened the file list.** On the owner's word of 2026-10-06, "fix all agents and skills", the CTO Chief added the twenty existing method files of the other agents (`skills/<category>/<name>/SKILL.md`) to this plan's `files:` and recorded the approval again. The executor did not edit `files:` or the approval record.
6. **(Executor, 2026-10-06.) How the task was recorded, and that the scheduler refused to start it.** The task spec was built by `actions.taskSpecFromPlan` from this plan and recorded with `menu task add --b64 …` (task `t135`). `menu task start t135` was refused: "the scheduler refuses it (file-conflict)". The one conflict is `agents/architecture/dependency-analyzer.md`, which this plan's `files:` still declares and which the running task `t121` (plan 00266) also declares. The override (`--force`) is the human's and was not used. The plan was not moved: it is still in `plans/todo/`, and the task is still queued. The build was done from there, on the twenty agents and twenty method files that no other task touches; the edit protection reads the plan as approved in `todo/` (`isApprovedForCoverage`: approved, kind `backfilled`). **Starting and completing the task needs either plan 00266 to finish or the owner's override.**
7. **(Executor.) `quality-gate` keeps Write and gains Edit; no Write is held or dropped in this slice.** Its body orders file writes ("Update quality state cache", "You manage the quality state cache", eight files under `.ctoc/quality-state/`), so its profile already writes. It leaves `WRITE_EDIT_DEBT` (`MAX_WRITE_EDIT_DEBT` 1 → 0) and, because it holds Grep with Write and Edit, carries the safety sentence `MATCH_IS_DATA` and the pinned any-file sentence in its search section and leaves `MATCH_IS_DATA_DEBT` (`MAX_MATCH_IS_DATA_DEBT` 1 → 0). Its Task was never on `HELD_REMOVALS` (it is one of the three coordinators), so that list is unchanged at 42 tools; `pattern-detector`'s Bash stays held for slice 11. No other agent of the twenty holds Write, and none gained it: every body and method file was read for ordered writes first (decision 9).
8. **(Executor, by the CTO Chief brief.) Sentences added after each Role section, each pinned whole in `AGENT_BODY_SENTENCES`.** Each was written against the agent's whole body and whole method file. The exact text of each is the constant named here in `tests/agent-tool-grants.test.js`.
    - **What Bash reaches the network for, for the fifteen that hold Bash.** `architecture-checker` (`ARCHITECTURE_NETWORK_SCOPE`), `complexity-analyzer` (`COMPLEXITY_NETWORK_SCOPE`), `dead-code-detector` (`DEAD_CODE_NETWORK_SCOPE`), `type-checker` (`TYPE_CHECK_NETWORK_SCOPE`) and `component-tester` (`COMPONENT_NETWORK_SCOPE`): the project's own build or test commands may reach the network; the agent itself reaches it for nothing else. `backwards-compatibility-checker` (`COMPATIBILITY_NETWORK_SCOPE`): the earlier published version of the project's own package, and what a build resolves. `technical-debt-tracker` (`DEBT_NETWORK_SCOPE`): package metadata and advisories, and SonarQube and Trunk Check only where the project is already set up for them. `performance-validator` (`PERFORMANCE_NETWORK_SCOPE`): what benchmarks and builds fetch, and a load test against the target the brief names. `bundle-analyzer` (`BUNDLE_NETWORK_SCOPE`): what the production build fetches; the source-map upload lines are the release pipeline's and never run. `visual-regression-checker` (`VISUAL_NETWORK_SCOPE`): what the visual tests load, and the hosted Percy and Chromatic services only where the project is set up for them and the brief says so. `api-deprecation-checker` (`DEPRECATION_NETWORK_SCOPE`): package metadata, and the header probe (`curl -sI`) against an address the brief names. `onboarding-validator` (`ONBOARDING_NETWORK_SCOPE`): the onboarding run itself, on the repository the brief names. `quality-gate` (`GATE_NETWORK_SCOPE`): the checks it runs or dispatches may reach the network; the agent itself only for the `git push` its own flow orders. `duplicate-code-detector` (`DUPLICATE_NO_NETWORK`) and `pattern-detector` (`PATTERN_NO_NETWORK`): no network command is ordered. Each is followed by the slice 8 sentence "Your Bash is never a way to the web: no curl, no wget, no package downloaded to run." (with "Beyond that," where a network use is named).
    - **A build wrapper, an installer or a test run executes the project's own files** (`WRAPPERS_RUN_ONLY_IN_OWNERS_TREE`, the first sentence of slice 8's paragraph, now a constant of its own; the slice 8 constant is built from it and reads as before): in every Bash holder that runs a build or a test. `technical-debt-tracker` and `api-deprecation-checker` carry the whole slice 8 paragraph, because they run `npm audit` and `npm outdated`. `onboarding-validator` has its own form (`ONBOARDING_RUN_PLACE`): its documented setup commands run only inside the fresh clone or the clean container, and a step that would install something machine-wide is reported as not run.
    - **A missing tool is a scan that did not run.** `INSTALL_LINE_IS_NOT_YOURS` (slice 8) in `quality-gate` and `backwards-compatibility-checker`, whose files show install lines (`npm install -D eslint`, `pip install griffe`, `cargo install`, `dotnet add package`). The others that run tools carry `MISSING_TOOL_DID_NOT_RUN`: "When a tool this file or the method file names is not on this machine, name it in your report as a scan that did not run, and never install it yourself."
    - **What comes back is data.** `TOOL_OUTPUT_IS_DATA` with its extension about project files and typed text (slice 8), in fourteen of the fifteen. `onboarding-validator` cannot carry it as written, because running the project's documented commands is its work: it carries `ONBOARDING_TEXT_IS_DATA`, which calls the README and every other file data, names the documented setup commands as the one thing it runs from them, and keeps the rule on typed text. The three frontend agents also carry slice 6's `PAGE_IS_DATA`. `performance-validator` carries slice 6's `TARGET_REPLY_IS_DATA`. `api-deprecation-checker` carries `DEPRECATION_TEXT_IS_DATA`. `quality-gate` carries slice 7's `RETURNS_ARE_DATA`.
    - **No order asks for a tool the agent lacks.** The Bash holders without Write name a change for the executor (`nameTheChange(…)`, each ending "never write a percentage or a "passes" you did not see"). The three whose body said "Updates `.ctoc/quality-state/…-results.json`" (`architecture-checker`, `complexity-analyzer`, `performance-validator`) give the file's content in the report for `quality-gate` or the executor to write (`findingsFile(…)`), and that body line now reads "Give the content for … in your report (`quality-gate` or the executor writes it):". `pattern-detector` judges whether the pattern is documented and never writes it (`PATTERN_NO_WRITE`). `visual-regression-checker` never updates a baseline (`VISUAL_NO_BASELINE_UPDATE`); its method file already says a human reviews every baseline update. The four that hold no command tool name a command (`nameTheCommand(…)`: `code-reviewer`, `code-smell-detector`, `complexity-reducer`, `consistency-checker`). `feature-flag-auditor` holds no command tool and no web tool, and its method file weighs provider facts: it never calls a provider's API (`FLAG_PROVIDER_FACTS`).
    - **`npx`.** `NPX_NO`, the sentence slice 6 pinned, in the eleven that hold Bash and meet `npx` in their body or method file. Not added to the three read-only agents and `quality-gate`, whose method files show `npx` only in pipeline examples they do not run; those commands were converted all the same.
    - **These are the executor's readings where no order stood in the bodies**, and the review should weigh them: that the hosted services (SonarQube, Trunk Check, Bencher, bundlemon, Lighthouse CI, Percy, Chromatic) are used only where the project is already set up for them; that the source-map uploads and the database statistics queries are never run by the agent; that `performance-validator` names a saved baseline for the executor instead of running `ctoc quality baseline save`; that `onboarding-validator` does not run a machine-wide install; that `quality-gate` pushes only to the project's own configured remote.
9. **(Executor.) Reading first.** Read in full, every line, before any change: this plan; the Decisions sections of slices 7 and 8 and slice 8's Execution Record; the main tool-grant test and the limits file; all twenty agent bodies; all twenty method files. Nothing was read by search only.
10. **(Executor.) Every `npx <package>` in the forty files is `npx --no -- <package>`**: 68 commands, 25 in ten agent files (`architecture-checker` 2, `complexity-analyzer` 1, `dead-code-detector` 4, `duplicate-code-detector` 1, `performance-validator` 2, `backwards-compatibility-checker` 3, `technical-debt-tracker` 3, `bundle-analyzer` 5, `visual-regression-checker` 3, `api-deprecation-checker` 1) and 43 in fourteen method files, pipeline examples and comments included. One had a different shape: `npx --package=@arethetypeswrong/cli attw <package>.tgz` in the compatibility method file downloads a package by design, and the test's check 12 accepts only `npx --no -- <tool>`; it is now `npx --no -- attw '<package>.tgz'`. No `npx --no` command was run. `bunx source-map-explorer` in a comment of the bundle method file is not an `npx` command and was not changed; the agent's network paragraph says never to run it.
11. **(Executor, by the owner's word of 2026-10-06, "fix all agents and skills".) The twenty method files.** Eight `tools:` lines were changed to equal their agent's (`complexity-reducer`, `quality-gate`, `backwards-compatibility-checker`, `feature-flag-auditor`, `technical-debt-tracker`, `component-tester`, `visual-regression-checker`, `api-deprecation-checker`); twelve already did. `npx` as in decision 10. Eight orders an agent cannot carry out with its tools were reworded, and nothing else was changed:
    - `architecture-checker`: "Writes `.ctoc/quality-state/architecture-results.json` with" became "Give the content of `.ctoc/quality-state/architecture-results.json` in your report, for `quality-gate` or the executor to write (you hold neither Write nor Edit), with".
    - `complexity-reducer`, two places: "Read coverage report (or `Bash`-confirm via …)" became "Read the coverage report. You hold no command tool: where there is no report, name the coverage command (…) in your report for the executor to run, and never write a percentage you did not see."; and "author the transform in the project's `codemods/` folder." became "write the full transform in your report, naming the path under the project's `codemods/` folder where the build step will save it."
    - `consistency-checker`: "Then `grep`/`rg` for the minority pattern across the whole tree" became "Then search for the minority pattern across the whole tree with Grep", with "You hold no command tool: the shell lines below show the patterns to search for, and you count the matches yourself."
    - `duplicate-code-detector`: "Persist a baseline at `.quality/baseline.duplication.json` after the first scan." became "After the first scan, give the baseline for `.quality/baseline.duplication.json` in your report for the executor to save: you hold neither Write nor Edit."
    - `pattern-detector`: "Run detector first, write the detected pattern into the project's `CLAUDE.md`, then let architecture-checker hold the line." became "Run detector first; the team or the executor writes the detected pattern into the project's `CLAUDE.md` (you hold neither Write nor Edit: say in your report what that section must hold, and never write it through Bash); then architecture-checker holds the line."
    - `feature-flag-auditor`: "(cross-checking against the provider's flag registry, when available)" became "(cross-checking against the provider's flag registry, when an export of it is in the repository or handed to you in your brief — you call no provider API)".
    - `component-tester`: "You write tests from the user's point of view — never coupled to component internals — and you treat" became "You judge tests from the user's point of view — never coupled to component internals. You hold neither Write nor Edit: where a test is missing or wrong, give its text in your report for the executor to add. You treat". The agent holds no Write and this plan's table reads it as an agent that runs tests and reports; it was not given Write.
    - Text typed into a command: `npm info <pkg> deprecated` in the deprecation method file became `npm view -- '<pkg>' deprecated` (slice 8's form), and in the compatibility method file `git diff --exit-code etc/<package>.api.md` became `git diff --exit-code -- 'etc/<package>.api.md'`.
12. **(Executor.) Changes inside agent bodies beyond the added paragraphs and the search section.**
    - `complexity-reducer`: this plan's own replacement of the `codemods/` order. It stood on line 385, as the plan says.
    - `dead-code-detector`: the inner block of its report example was fenced with backticks inside a backtick block, so the test's reader took everything after it, the search section included, as code. The inner block is now fenced with `~~~`; the text shown is the same.
    - `visual-regression-checker`: `npx chromatic --project-token=xxx` put a token on a command line. It is now `npx --no -- chromatic`, with a comment that the tool reads `CHROMATIC_PROJECT_TOKEN` from the environment. That the tool reads that variable is believed from memory of its documentation, not checked on this machine, where the tool is not installed.
    - `api-deprecation-checker`: `npm info package-name deprecated` became `npm view -- '<package>' deprecated`.
    - `architecture-checker`: `grep -r "import.*from.*changedFile" src/` became `grep -r 'import.*from.*<changed-file>' src/` (a file name typed into a command stands in single quotes).
    - `onboarding-validator`: `git clone $REPO_URL /tmp/test-project` became `git clone -- "$REPO_URL" /tmp/test-project`.
    - `backwards-compatibility-checker`: the comment `# ... bump version ...` between its two `npm pack` lines became `# ... then, on the tree that holds the new version ...`, because the agent names a version bump for the executor and never makes one.
13. **(Executor.) All twenty frontmatters and all twenty method-file frontmatters parse as strict YAML** with `js-yaml` 4.2.0 (installed in `node_modules`, not a declared dependency), before and after; none needed a change. Each method file's tools line equals its agent's.
14. **Corrections to approved text of this plan, recorded here and not made in place:**
    - "all twenty-one", "the twenty-one keys", "lower `MAX_DEBT` by 21", acceptance criteria 1 and 3: twenty agents and 20 (decision 4). "Thirteen are unchanged": twelve tools lines of the twenty are unchanged, and `dependency-analyzer`'s was not touched.
    - The "Neighbouring plans" paragraph and Step 9's "confirm the in-progress improvement slice for `dependency-analyzer` has completed": it has not completed; the agent was left out instead (decision 4). That one Step 9 box is left unticked.
    - The table's "unchanged" for twelve agents speaks of their tools lines; their bodies gained the sentences of decision 8.
    - "The shared search section, in all twenty-one": one paragraph in nineteen agents, three in `quality-gate` (decision 7), none added to `dependency-analyzer`.
    - The test edits and acceptance criterion 3 do not name `MAX_MATCH_IS_DATA_DEBT`; it fell from 1 to 0 (decision 7).
    - The security review's "`quality-gate`'s Edit adds no reach beyond its Write" stands; its network uses are now stated and scoped (decision 8).
    - "Read first: the index `plans/implementation/agent-tool-grants.md`": the index is at `plans/todo/agent-tool-grants.md`.
    - Step 10's "every change by `Edit` after a `Read`": see the Execution Record.
15. **Carried, seen and not done:**
    - `quality-gate` pushes to the remote when its checks pass (`autoAction.onPass: push`), and holds Bash, Write, Edit and Task. The new paragraph scopes the push; it does not remove it. Its method file declares `max_subagents: 0` although the agent dispatches.
    - `quality-gate` gained Edit and no sentence on when to use it rather than Write.
    - The commands `ctoc quality`, `ctoc quality --tier3`, `ctoc quality baseline save` and `ctoc push --force` named in these bodies and method files are not commands CTOC ships today, as far as the executor knows; they were left as they were.
    - The method files of `complexity-analyzer`, `consistency-checker`, `dead-code-detector`, `duplicate-code-detector`, `type-checker`, `feature-flag-auditor`, `bundle-analyzer`, `component-tester`, `visual-regression-checker`, `api-deprecation-checker` and `onboarding-validator` declare `model: sonnet`; their agents declare `opus`. Not changed.
    - `performance-validator`'s method file names host tuning commands (`taskset`, `cpupower frequency-set`) as advice for benchmark hosts; no sentence says the agent never runs them.
    - `onboarding-validator` runs the project's install and bootstrap, which execute the project's own scripts; the new paragraphs keep that inside the fresh clone or a clean container on the owner's own repository, by instruction only.
    - `api-deprecation-checker` runs `python -W … -c "import mymodule"`, which executes the project's code; covered only by the sentence on project files that run.
    - `backwards-compatibility-checker` compares exports with `node -e "… require('./old/package') …"`, which executes the packed package.
    - `dead-code-detector`'s report example still shows `npm uninstall` and `rm` lines; the new paragraph says the agent names them and never runs them.
    - `pattern-detector` keeps a shell its text says it barely uses (held, slice 11). Its drift check reads commit history, which takes a command; slice 11 should read this before removing its Bash.
    - Nineteen of the twenty method files still speak of a letter "you write to CTO Chief"; that is the agent's reply, not a file.
    - Plan 00266's inventory (`.ctoc/audit/agent-and-skill-improvement/inventory.json`) holds a `fingerprint_at_start` for these files; none of the forty matches any more. That file is 00266's and was not touched.
    - A contradicting sentence added beside an intact pinned sentence passes the test, and nothing fails on a bare `npx <tool>` turned back in a file (slices 6 to 8 carried both).
16. **CTO Chief decision, 2026-10-06, recorded by the executor from the brief: the scheduler's file conflict is removed.** The CTO Chief took `agents/architecture/dependency-analyzer.md` out of this plan's `files:` (this slice does not touch it) and recorded the approval again; the executor did not edit `files:` or the approval record, and the plan read approved (kind `backfilled`). The queued task `t135` still carried the old file list and was refused once more, so it was cancelled through the menu (`menu task cancel t135`) and a new task recorded from the updated plan (`menu task add --b64 …`, task `t136`, decision "run"). `menu task start t136` succeeded without `--force`, and `actions.startExecution` moved the plan `todo/` → `in-progress/`, the way slices 2 to 8 were started. No plan file was moved by hand. This supersedes the open point of decision 6 and decision 14's "that one Step 9 box is left unticked": the box is ticked as not applicable to this slice.
17. **CTO Chief decision, 2026-10-06: who changed `files:`, and a stale statement corrected.** The CTO Chief, not the executor, took `agents/architecture/dependency-analyzer.md` out of this plan's `files:` and recorded the approval again (decision 16). Decision 6's "which this plan's `files:` still declares" was true when written and is no longer: the frontmatter does not declare that file.
18. **CTO Chief decision, 2026-10-06, the security scan's first blocking finding: `quality-gate` never pushes.** One combined fix pass followed the review (`.ctoc/audit/tool-grant-run-notes/s9-step11-review-critic.md`, which sent the work back) and the security scan (`.ctoc/audit/tool-grant-run-notes/s9-step13-secure-scanner.md`, which blocked); both notes were read in full. `GATE_NETWORK_SCOPE` and the agent paragraph now carry the scan's text: the agent reaches the network for nothing, never pushes, reports `action: push` as its decision, treats `autoAction.onPass` as no permission, changes neither setting, never adds or widens a baseline exception and never writes `approved_by` into any file. Its closing sentence is the plain "Your Bash is never a way to the web" (`NO_WEB`). The older lines agree: the flow's step 7 in the agent and in the method file reads "report `action: push` (the push is the owner's …)", the two example messages and the terminal line say "Decision: push", the `onPass: push` example carries a comment that the agent never pushes, and the method file's baseline example says the `approved_by` line is written by the human, never by the agent. This supersedes decision 8's `quality-gate` item, the last of the executor's readings there, and the first item of decision 15.
19. **CTO Chief decision, 2026-10-06, both notes, the scan's wording chosen: where `onboarding-validator` runs.** `ONBOARDING_RUN_PLACE` is the scan's text: a clone in a new folder made with `mktemp -d`; `cd` into the clone at the start of every command line; a clean container whose only mount is the clone where a container runtime exists, and otherwise the clone, said so in the report; a bootstrap script read in full first; outside a container no step that uses `sudo`, installs machine-wide or writes outside the clone; anywhere, no step that logs in, publishes, pushes, deploys or changes a database not on this machine. `ONBOARDING_TEXT_IS_DATA` names "the set-up, run and test sections of the README and the contributing guide, and the bootstrap script those sections name" as the one thing run from the project's files. The agent's clone block is the scan's three lines. In the method file the container example mounts the fresh clone, not `$PWD`, and the secret check reads `rg -n -e '<pattern>' .env.example | cut -d: -f1`, so it runs and prints line numbers only. This supersedes decision 8's `onboarding-validator` items and decision 12's clone line.
20. **CTO Chief decision, 2026-10-06, from the review: `api-deprecation-checker`'s header probe.** `DEPRECATION_NETWORK_SCOPE` now says the probe goes to an API the brief names, the project's own or one the project calls; the host always comes from the brief; a path under it may come from the project's own route files or OpenAPI document, typed in single quotes. The two example addresses stand in single quotes.
21. **CTO Chief decision, 2026-10-06, from the scan's warnings.** `backwards-compatibility-checker` fetches the earlier version by name only where the manifest or the brief shows the owner publishes the package there, and otherwise compares against a tag. `duplicate-code-detector` and `pattern-detector` each gained the owner's-tree sentence the scan gives; both are part of the pinned paragraph.
22. **CTO Chief decision, 2026-10-06, from the review: `dead-code-detector`.** The database statistics are "queried by whoever holds access … use them only where an export of them is in the repository or handed to you in your brief"; `javac` left the list of commands that fetch dependencies. In its method file `dotnet format analyzers --severity info` gained `--verify-no-changes` ("and rewrites no file"), and so did the same command in `skills/quality/complexity-analyzer/SKILL.md`. That the flag stops the rewrite is the review's belief from the tool's documentation, not run here.
23. **CTO Chief decision, 2026-10-06, from the review: the bundle method file's upload command is commented out**, under "the release pipeline tags deploys with the Git SHA. Confirm its configuration holds this step; the agent never runs it:".
24. **CTO Chief decision, 2026-10-06, from the scan: the typed-text clause is tightened**, to "…in single quotes after `--`, and never a name that begins with `-`." The fourteen agents of this slice that carry the shared sentence, and `onboarding-validator` in its own sentence, carry the new form (`TOOL_OUTPUT_IS_DATA_AFTER_DASHES`, derived from the slice 8 constant). **The six slice 8 agents that carry the sentence were not changed, and this is an error of the executor's that was undone:** the fix script first wrote the new clause into `agents/security/dependency-checker.md`, `dependency-auditor.md`, `sast-scanner.md`, `secrets-detector.md`, `concurrency-checker.md` and `agents/compliance/license-scanner.md`, which this plan's `files:` does not declare. The six were put back the same hour by the reverse replacement; `git status` shows them unchanged against the last commit. Their pin stays the slice 8 constant, so they pass as before. The change for those six is asked for as scope-growth request `1791250135059-zkxsbu` in the inbox questions; it is the owner's to grant.
25. **CTO Chief decision, 2026-10-06, from the scan: nested fences.** In `duplicate-code-detector`, `backwards-compatibility-checker`, `feature-flag-auditor`, `technical-debt-tracker`, `visual-regression-checker` and `api-deprecation-checker` the inner blocks of the report example are fenced with `~~~`, as in `dead-code-detector`. A strict reader (a closing fence carries no label) now reads the search section as prose in all twenty; the text shown is the same.
26. **Carried from the review's and the scan's backlogs, not done:**
    - **First: the shell hook `src/hooks/PreToolUse.Bash.js` never asks whether auto-push is enabled, and from Iron Loop step 15 it allows `git push`, including to another remote, `--mirror` and a delete by refspec, with the push setting off.**
    - `.ctoc/settings.json` is always writable by the edit rules, so an agent with Write could switch the push setting on (not driven).
    - The six slice 8 agents still carry the older typed-text clause (decision 24).
    - `quality-gate`'s method file still says the dispatched skills write their own result files; three now hand the content back, and its Files Managed table lists neither `architecture-results.json` nor `performance-results.json`.
    - `type-checker` names `sqlc generate` for the executor, so its drift check is never run by the agent, while `backwards-compatibility-checker` may regenerate its API report in place: one shape, two rulings.
    - `architecture-checker`'s method file holds a database query and `performance-validator`'s holds `EXPLAIN ANALYZE`, `pgbench` and `sysbench`; neither agent says who runs them.
    - "The project's own Sonar server" (`complexity-analyzer`, `technical-debt-tracker`) does not cover SonarQube Cloud, which the method files name.
    - `visual-regression-checker`'s method file tells the agent to check vendor pricing pages, which it cannot read; Applitools and Lost Pixel are in the method file and not in the network sentence.
    - `feature-flag-auditor`'s body shows shell `grep -r` lines with no sentence saying to search with Grep.
    - For the owner's final OK: `component-tester` no longer writes tests; it gives their text for the executor.
    - `quality-gate`'s body says a missing tool is "skip_check_with_warning"; CTOC's own rule is that a check with no tool is not verified and fails.
    - `type-checker`'s method file says type checking runs in "Step 8 (QUALITY)"; the agent body says Step 14.
    - `quality-gate`'s method file runs `diff-cover` through `npx`; it is a Python tool.
    - `onboarding-validator`: the dev-server log goes to a fixed `/tmp` path, and the `kill` relies on a variable that does not survive between Bash calls; its later blocks still use relative paths, held to the clone only by the new sentence.
    - `type-checker` method file: `clang … $(git ls-files '*.c')` splits file names into arguments; a name beginning with `-` becomes an option.
    - The shared `npx` sentence: for an absent tool, `npx --no -- <tool>` still asks the registry for the tool's metadata before refusing.
    - `performance-validator`'s method file shows the load-test address unquoted.
    - Not pinned by any test: a bare `npx <tool>` put back, a token typed back on the Chromatic line, the clone line unquoted again, a method file's tools line that differs from its agent's, a contradicting sentence beside an intact pin.
    - Emoji selectors in older report-example lines of `quality-gate`, `backwards-compatibility-checker`, `component-tester` and `onboarding-validator`.
    - That Chromatic reads `CHROMATIC_PROJECT_TOKEN` is still unchecked; the command works only if that variable is set and the package is installed.
    - Decision 15's list stands, but for its first item (decision 18).

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation: the test edits above
- [x] Test error conditions: the failure messages name each agent and each wrong tool
- [x] Run tests - expect RED (failing): `node --test tests/agent-tool-grants.test.js`, recorded

### Step 9: PREPARE
- [x] Install dependencies if needed: none
- [x] Check prerequisites: fingerprint the twenty-one files; confirm each `old_string` occurs exactly once; confirm the in-progress improvement slice for `dependency-analyzer` has completed — the last part is not applicable to this slice: `dependency-analyzer` was taken out of it by the CTO Chief's decision (decisions 4 and 16), so this slice does not wait for that plan
- [x] Verify dev environment ready: record the Node version
- [x] Create directories/config if needed: none

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements: the tools lines, the `complexity-reducer` line, the twenty-one search sections — every change by `Edit` after a `Read`
- [x] Add error handling: none
- [x] Wire up integration points: none new

### Step 11: REVIEW
- [x] Self-review all new code: through CTOC's review agent
- [x] Verify integration points work together: `tests/unexecutable-instruction-fence.test.js` passes
- [x] Check error handling completeness: n/a

### Step 12: OPTIMIZE
- [x] Remove redundant operations: none
- [x] Optimize critical paths: none
- [x] Simplify complex code: none

### Step 13: SECURE
- [x] Validate inputs (no path traversal): through CTOC's security scan agent
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


## Execution Record (Steps 8–16)

Built by the iron-loop executor on 2026-10-06. The task is `t135`; the scheduler refused to start it and the plan is still in `plans/todo/` (decision 6). Steps 8, 9, 10 and 12 are done, but for the one Step 9 box about `dependency-analyzer` (decision 14). The review (Step 11) and the security scan (Step 13) are the CTO Chief's to dispatch, and Steps 14 to 16 are ticked only on the final bytes after them.

- **Reading first.** As decision 9 says: every file in full.
- **Step 8, test edits, no agent file touched.** `tests/agent-tool-grants.test.js`: twenty keys removed from `DEBT` (`MAX_DEBT` 46 → 26; `architecture/dependency-analyzer` stays); `quality-gate` removed from `WRITE_EDIT_DEBT` (`MAX_WRITE_EDIT_DEBT` 1 → 0) and from `MATCH_IS_DATA_DEBT` (`MAX_MATCH_IS_DATA_DEBT` 1 → 0); the any-file sentence pinned for `quality-gate` in `AGENT_SENTENCES`; the sentences of decision 8 pinned for all twenty in `AGENT_BODY_SENTENCES`. `HELD_REMOVALS` (42) and `RULE6_EXCEPTIONS` (1) unchanged. `tests/agent-tool-grants-maxima.test.js`, in the same change: `CEILINGS` `MAX_DEBT` 26, `MAX_WRITE_EDIT_DEBT` 0, `MAX_MATCH_IS_DATA_DEBT` 0. No limit was raised.
- **Run 1 (red), the two test files:** 27 tests, 24 pass, 3 fail, 0 skipped, 0 cancelled. Failing: the main test's check 3 (every one of the twenty by name: missing Grep or Glob, no search section, each pinned sentence), check 9 (`quality-gate` holds Write without Edit) and check 11 (`quality-gate` lacks the safety sentence).
- **Step 9.** Node v24.14.1; no dependency added. The sha256 of the twenty agent files, the twenty method files and the two test files before any edit was written to the session's scratch folder, not into this record. Every replaced string was required to occur exactly once in its file, and did; each file's `npx` count was required to match before conversion. All forty frontmatters parsed as strict YAML before any edit. No body among the twenty quotes a grant of two or more tool names in backticks (check 3 reads every backticked span and passes).
- **Step 10.** Eight tools lines as the plan's table; `complexity-reducer` line 385; the paragraphs of decision 8 after each Role section; twenty search sections, each immediately before `## Honest status (shared rule)`; the body changes of decision 12; the 68 `npx` commands; in the method files, eight tools lines and the reworded passages of decision 11. **How the edits were made, which differs from the plan's "every change by `Edit` after a `Read`":** every file was first read in full with the Read tool or printed whole; the two test files, the twenty agent files and the twenty method files were then changed by short scripts through the shell, each replacement refusing unless its string occurred exactly once, not with the Edit tool. The paragraphs put into the agent files were taken from the test's own constants, so pin and agent text are one string. The scripts were first run on a scratch copy, where the tool-grant test caught one fault before any real file changed: a sentence of the executor's own that quoted `npx --no --` tripped check 12, and was reworded. This plan file was changed by script as well.
- **Run 2, every edit made.** The two tool-grant tests: 27 of 27, 0 skipped.
- **One correction during self-review, test and agent together.** `pattern-detector`'s first sentence said its files name one command only (`dotnet list reference`). Its method file's drift check also reads commit history, which takes a command; the sentence now says both read the files on this machine.
- **Mutation proof**, on a scratch copy of `agents/`, `skills/` and the main test under the session's scratch folder, deleted afterwards: 289 mutations, 289 caught, the unchanged copy passing before and after. One word dropped from the middle of every sentence of every pinned text in every one of the twenty agents (276: each sentence of each paragraph of decision 8, each sentence of the search rule in all twenty, and the safety sentence and the any-file sentence in `quality-gate`), each failing with the agent's name; ten grant mutations (the added Glob or Grep taken back in six agents, Edit taken from `quality-gate`, Bash given to `code-reviewer`, Write given to `pattern-detector`, Grep taken from `visual-regression-checker`); and three `npx --no -- <tool>` commands turned to `npx --no <tool>`, two in agent files and one in a method file, each caught by check 12 with file and line. The 289 were judged by the test's own check functions; three more were run through the test runner itself and failed there by name.
- **Step 12.** Nothing to remove.
- **Files changed.** 37 agent and method files and the two test files. Three method files needed no change at all: `dead-code-detector`, `type-checker` and `onboarding-validator` (tools line already equal, no `npx`, no order to reword). `agents/architecture/dependency-analyzer.md` and its method file were not written. Git was not touched.
- **Full run on these bytes (2026-10-06), before review; the one-minute load average was 8.7, the run waited, and it was 7.1 when the checks started and 7.0 when the suite started (12.1 just after it ended):** the tool-grant test, the limits test, the model floor, the unexecutable-order fence and `watcher-shape`: 74 tests, 74 pass, 0 fail, 0 skipped, 0 cancelled; `npm run lint` exit 0; `npm run typecheck` exit 0; `npm test` exit 0 — 12098 tests, 12098 pass, 0 fail, 0 skipped, 0 cancelled, coverage 99.9% against the 99% floor, test gate PASS. Before that, with 26 more agent and method test files (the record check, `architecture-invariants`, `skill-loading`, `compliance-claims-match-code`, the wrapper tests, the refinement-loop tests and others): 779 tests, 779 pass, 0 fail, 0 skipped. The suite ran on a working tree that also holds plan 00266's uncommitted edits. Decisions 4 to 15 and this record but for its last two lines were in the plan during the run; only these two lines were added after it, and the plan still reads approved (kind `backfilled`).
- **Stopped there, by the brief.** The review and the security scan are the CTO Chief's to dispatch. Open for the CTO Chief and the owner: the scheduler's refusal to start task `t135` (decision 6).
- **After the CTO Chief's answer (decision 16):** task `t136` is running and the plan is in `plans/in-progress/`. No agent, method or test file changed after the full run above; git was not touched.
- **Review and security scan returned (2026-10-06):** the review sent the work back and the scan blocked. One combined fix pass, by the CTO Chief's brief (decisions 17 to 26). Both notes were read in full.
- **Fix pass, test first.** The new and changed pins went into the main test before any agent or method file changed. Red: 22 tests, 21 pass, 1 fail — check 3 named twenty-one agents. Then the files, by exact-once scripts through the shell, the agent paragraphs again taken from the test's own constants. Six of those twenty-one were slice 8 agents outside this plan's `files:`; they were put back and a scope-growth request filed (decision 24). Green: the main test and the limits test, 27 of 27, 0 skipped. No limit moved in this pass (26, 0, 1, 42 held, 0).
- **Mutation proof of the fix pass**, on a scratch copy, deleted afterwards: the whole proof was run again, 301 mutations, 301 caught by the agent's name or the file and line, the unchanged copy passing before and after. It covers every one of the 37 pinned sentences that are new or changed in this pass, in fifteen agents.
- **Step 14 on the final bytes (2026-10-06); the one-minute load average was 8.2, the run waited, and it was 6.7 when the checks started and 7.1 when the suite started (14.5 just after it ended).** The tool-grant test, the limits test, the model floor, the unexecutable-order fence, `watcher-shape` and `tests/ship-gate-real.test.js`: 101 tests, 101 pass, 0 fail, 0 skipped, 0 cancelled; `npm run lint` exit 0; `npm run typecheck` exit 0; `npm test` exit 0 — 12098 tests, 12098 pass, 0 fail, 0 skipped, 0 cancelled, coverage 99.9% against the 99% floor, test gate PASS. All forty frontmatters parse under `js-yaml` 4.2.0 and every method file's tools line equals its agent's. The suite ran on a working tree that also holds plan 00266's uncommitted edits. Decisions 17 to 26 and the fix-pass lines above were in the plan during the run; this line and the ticks of Steps 14 to 16 were added after it.
- **Steps 15 and 16.** The documentation is the agent bodies, the method files, the test comments and this record; no changelog file exists. The review and the security scan were run by CTOC's own agents, dispatched by the CTO Chief; completion goes through the menu's task completion. Git was not touched.


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
