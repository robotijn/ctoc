**Verdict: warn.** Nothing blocks. Three medium and four low findings sit on the changed lines. The web-reading safety floor holds with no exceptions left, and no changed line contains a secret or a real person's data. Under the security-scanner's default policy (this repository has no `.ctoc/security-policy.yaml`), none of these findings reaches the block tier. No analyzer had written results for this run, so every finding below comes from reading the diff myself and from the test and mutation runs. I wrote neither `security-results.json` nor a report file, because your brief forbids project edits.

The diff you gave me (`s10.diff`) also contains 13 slice 7 files outside this plan's file list. I reviewed only the plan's 58 declared files, using my own diff at `<temporary folder>` (55 changed, 348 lines added).

## The ten checks

**1. Web tools.** No agent among the 31 holds any web tool. The grants:
- **Read, Grep, Glob:** `error-handler-checker`, `observability-checker`, `resilience-checker`, `translation-checker`, `fault-tree-builder`, `fmeda-analyzer`, `redundancy-pattern-picker`, `hil-harness`, `wcet-budget`, `ml-model-validator`, `ai-code-quality-reviewer`.
- **Bash, Read, Grep, Glob:** `accessibility-checker`, `api-contract-validator`, `configuration-validator`, `database-reviewer`, `health-check-validator`, `memory-safety-checker`, `performance-profiler`, `data-quality-checker`, `feature-store-validator`, `android-checker`, `ios-checker`, `react-native-bridge-checker`, `hallucination-detector`, `llm-security-tester`, and the six slice 8 agents.

Across the whole repository, only four agents hold a web tool (`citation-validator`, `deepthink-researcher`, `eu-solution-recommender`, `agent-critic`), and none of them holds Write, Edit or Bash. `MAX_RULE6_EXCEPTIONS` is 0 and `RULE6_EXCEPTIONS` is `{}` in the main test; the limits file's ceilings for it and `EXCUSED_TOOLS` are both 0. Check 5 (the safety floor) passes. Putting WebSearch back on `llm-security-tester` was caught by checks 3 and 5.

**2. Bash holders.**
- `hallucination-detector` is safe: a name reaches the shell only through a quoted here-document plus a character check in the shell itself (lines 162–166, 195, 229–234).
- `llm-security-tester` is safe: it fetches two fixed addresses, and the release number from the manifest must match four digits, a dot and two digits before it reaches the second address.
- The six agents whose Bash removal is held order no command, so untrusted text reaches no shell unless they disobey.
- The six slice 8 agents' clause is strictly narrower than before.
- Commands that put a value from a file onto the command line:
  - `xcodebuild -scheme MyApp` (`ios-checker.md` lines 33 and 40) and `./gradlew :app:dependencyInsight --dependency <pkg>` (Android method file line 332). Both fail safe; see "No lawful way to type a scheme or a dependency name" below.
  - `<pid>` in the profiler commands comes from the process the agent starts in the same call, not from a file.

**3. Mobile agents.** No changed line lets them upload a build, sign with a real identity, or publish. The Android statement is true as far as it goes: `assembleRelease` and `bundleRelease` sign wherever a release signing configuration is set, and `generateBaselineProfile` writes into the project's source tree. It is incomplete; see "The Android signing exclusion misses the benchmark build" below.

**4. Data and model agents.** None is ordered to query a production database or warehouse. Four hold a Bash that technically could (`database-reviewer`, `data-quality-checker`, `feature-store-validator`, `performance-profiler`), so this binds by instruction only. The rule against copying a real person's value is present in the three data agents. `ml-model-validator` holds only Read, Grep and Glob, so no order makes it load a pickled model. It does hand model-loading runs to the executor with no guard; see below.

**5. Profilers.** "Never attach to a process you did not start" is present in both, and cutting it was caught. "Only in the owner's tree" is not established by the wording; see the first finding.

**6. `npx`.** No `npx --no <tool>` without `--` remains. One bare form is left: the two `npx codemod …` in `skills/ai-quality/hallucination-detector/SKILL.md:374`, a quotation of a third party's readme kept on purpose (decision 10). `node --test tests/agent-tool-grants.test.js`: 22 passed, 0 failed.

**7. Mutations.** 13 mutations in a new subfolder of the scratchpad, since deleted. 10 were caught:
- a dropped tool;
- WebSearch put back;
- one word changed in the search section;
- three pinned sentences;
- the slice 8 clause reverted;
- `npx --no` without `--`;
- two limits raised.

Three were missed: a bare `npx` put back, a contradicting sentence next to an intact pinned one, and a method file's tools line drifting from its agent's.

**8. Frontmatter.** All 56 agent and method files parse with js-yaml 4.2.0, which rejects duplicate keys. Check 7.7 (lines Claude Code could read differently) and check 7.9 (frontmatter must equal its canonical form byte for byte) pass. The only non-ASCII character in the 348 added lines is the em dash. There are no invisible characters.

**9. Tests.**

| Test file | Passed | Failed | Skipped |
|---|---|---|---|
| `agent-tool-grants` | 22 | 0 | 0 |
| `agent-tool-grants-maxima` | 5 | 0 | 0 |
| `agent-model-floor` | 12 | 0 | 0 |

No limit was raised:
- `MAX_DEBT` 26 → 1
- `MAX_RULE6_EXCEPTIONS` 1 → 0
- `EXCUSED_TOOLS` 1 → 0
- every other limit unchanged

**10. Personal information and secrets.** None found. The added lines contain only `localhost` and `example.com` addresses. This was a pattern scan plus my own reading, because no secrets scanner (gitleaks, trufflehog) is installed.

## Findings on changed lines

**The owner's-tree rule does not cover the program a profiler runs** (medium). In `<home>/Code/ctoc/agents/specialized/performance-profiler.md:20` and `<home>/Code/ctoc/agents/specialized/memory-safety-checker.md:20`, the rule names only "a build wrapper, an installer or a test run". The main thing these agents run (`py-spy record -- python app.py`, `valgrind ./app`, an instrumented binary) is none of those. The same gap exists in `<home>/Code/ctoc/agents/specialized/api-contract-validator.md:20`, where a Spectral ruleset can be JavaScript (`.spectral.js`) that runs when linted; that last point is from memory, not checked here. Fix: add a pinned sentence right after the owner's-tree sentence in all three:
> "The same holds for every other command that runs the project's own files as code — the program you start under a profiler, a sanitizer or Valgrind, and a linter whose ruleset or configuration is code (a `.spectral.js` ruleset)."

**Heap dumps land in the owner's working tree** (medium). `memory-safety-checker.md:22` exempts "a heap profile or dump" as a tool's own output, while line 24 says a secret is never copied into a file. The method file's lines 595 and 598 (`dotnet-gcdump collect -p <pid>`, `jcmd <pid> GC.heap_dump heap.hprof`) write the whole process memory into the tree, where a later broad `git add` would commit it. Fix: pin this sentence in `memory-safety-checker` and `performance-profiler`:
> "Make a folder with `mktemp -d` in the same Bash call that starts the program, have every heap dump, profile and instrumented binary written there through the shell variable, read the file there, copy no value from it into your report, and delete the folder with `rm -rf -- '<folder>'` before you report."

Also append ", each in that folder" to that agent's list of what a tool writes as it runs.

**The Android signing exclusion misses the benchmark build** (medium; my reading of how Android builds work, not checked here). `<home>/Code/ctoc/skills/mobile/android-checker/SKILL.md:325` runs `./gradlew :macrobenchmark:connectedCheck`. That builds the app's `benchmark` build type, which Android's own setup creates with `initWith(release)`, so it inherits the release signing configuration unless the project overrides it. Fix: append to the release-tasks sentence in `android-checker.md:20`:
> "The same holds for `:macrobenchmark:connectedCheck` and any task that builds a build type made from the release one (`benchmark`, `nonMinifiedRelease`): read that build type first, and where its `signingConfig` is not the debug one, do not run the task; name it in your report."

**No lawful way to type a scheme or a dependency name** (low; it fails safe). The tightened typed-text clause (`ios-checker.md:20`, `android-checker.md:20`) allows only a path or package name from `@ / . _ -`, in single quotes, after `--`. But `xcodebuild -scheme` and Gradle `--dependency` take option values, and a Maven coordinate contains `:`. Fix: change the end of the shared sentence `TOOL_OUTPUT_IS_DATA_AFTER_DASHES` to:
> "…except a file path, a package name, or a scheme, target or dependency name, made only of letters, digits and `@ / . _ - :`, in single quotes — after `--` where the tool takes it as an argument, as the value of its own option where it does not — and never one that begins with `-`."

That sentence is shared by 20 agents, so this fix also touches slice 8 and 9 files.

**`hallucination-detector` forbids the redirects its own lookups follow** (low). Line 20 says never to send a request to an address taken from a registry answer, while the lookup commands at lines 169, 177, 198 and 236 use `curl -L`. Fix: append
> "; the recipes' own `-L`, held to https and three redirects, is the one exception."

**`accessibility-checker`'s sitemap allowance contradicts its typed-text clause** (low). At line 24, replace the sentence beginning "Give an engine only…" with:
> "Type into a command only an address your brief names. An engine may read the application's own sitemap at that address itself (`pa11y-ci --sitemap`); never type an address taken from the sitemap, any other file, a page's text or a redirect."

**`ml-model-validator` hands model-loading runs to the executor with no pickle guard** (low). Line 29 names "an evaluation run" and "a drift report" for the executor, and both load the model file. Fix: append
> "A command you name never loads a pickled model file (`.pkl`, `.joblib`, `pd.read_pickle`, `torch.load` without `weights_only=True`) that came from a download or from outside the owner's tree; name such a file as a finding and the run as not done."

## Backlog
- The slice 7 edits to 13 agents (iron-loop, pipeline, coordinator, `citation-validator`) are still uncommitted, though commit `9e9db2e8` (v6.14.87) describes them and contains only a version bump in three files. Commit slice 10 by its own file list, never with `git add -A`.
- A bare `npx <tool>` put back fails no test (mutation confirmed; carried from earlier slices).
- A contradicting sentence beside an intact pinned sentence fails no test (mutation confirmed; carried).
- Nothing fails when a method file's tools line drifts from its agent's (WebSearch put back in `llm-security-tester`'s method file passed). All 25 match today.
- Six agents keep a shell bound by instruction only, until slice 11.
- `skills/ai-quality/hallucination-detector/SKILL.md:374` keeps two bare `npx codemod …` inside a quotation.
- `skills/specialized/translation-checker/SKILL.md:362` contains a live right-to-left override character (U+202E) in its spoofing example. Write it as `\u202E`.
- `skills/specialized/performance-profiler/SKILL.md:55,100,146` still recommend profiling in production; the agent body now overrides them.
- `skills/specialized/database-reviewer/SKILL.md:270` still shows `./migrate --connection "$(secret)"` (carried).

**Risk:** the Android signing point and the Spectral point are from memory and were not checked against current documentation. The secrets check was a pattern scan, not a scanner. Findings 1–3 would become blockers only under a pre-release gate, which is not the gate here. My working files are in `<temporary folder>`.
