**Verdict: kick back.** Two added sentences forbid what the same agent's body or method file orders. Each fix is one pinned sentence, changed in the test constant and the agent file together. Everything else in the slice's goal holds.

I hold no shell, so I ran no test. The limits were checked by reading both test files; the test counts in the Execution Record are the executor's, not mine.

## (a) Blockers

### 1. `onboarding-validator`: where setup may run

`<home>/Code/ctoc/agents/devex/onboarding-validator.md` line 20, pinned as `ONBOARDING_RUN_PLACE` at `<home>/Code/ctoc/tests/agent-tool-grants.test.js` line 515.

- **The container case is forbidden as written.** The method file (`<home>/Code/ctoc/skills/devex/onboarding-validator/SKILL.md` lines 502-510) orders the bootstrap script run in a clean container. Its own model bootstrap holds `mise install` (line 129), `curl … | sh` (line 241) and `corepack enable` (line 337). The added sentence lists "a `curl` piped to a shell" as never to run and says nothing about the container. Read as written, the agent reports the bootstrap as not run, which is the check the method rates highest (line 640).
- **"never against this machine's own tools" contradicts the body.** The body's first test (lines 54-58) runs `npm install` in the fresh clone with this machine's npm.
- **The container command can write into the owner's tree.** It mounts `"$PWD"` (method line 506). If the shell starts in the dispatched working tree, the bootstrap writes `.env` and `node_modules` there. That the shell starts there is believed from this harness's behaviour, not tested.

Old:
> Those commands execute the project's own files and fetch from wherever they point: run them only inside the fresh clone or the clean container the Validation Tests name, never against this machine's own tools. Where a documented step would install something machine-wide (`brew install`, a `curl` piped to a shell, `npm i -g`), do not run it: report the step, and what it would install, as not run.

New:
> Those commands execute the project's own files and fetch from wherever they point: run them only inside the fresh clone, or inside the clean container the Validation Tests name with the fresh clone mounted into it — never the working tree you were dispatched in — and never let one install or change a tool on this machine itself. Where a documented step, or a script it runs, would install something on this machine outside the clone (`brew install`, a `curl` piped to a shell, `npm i -g`), run it only inside the clean container, where the install ends with the container; where there is no container, do not run it: report the step, and what it would install, as not run.

### 2. `api-deprecation-checker`: the header probe

`<home>/Code/ctoc/agents/devex/api-deprecation-checker.md` line 20, pinned as `DEPRECATION_NETWORK_SCOPE` at test line 512.

- **Per-endpoint probing is forbidden as written.** The endpoints to probe live in the project's route files and OpenAPI document (method file lines 262-269, "Validate Sunset header presence"). "Never probe an address taken from a file" rules out every such probe unless the brief lists each full address. The typed-text rule later in the paragraph also bars typing an endpoint path, because it allows only "a file path or a package name".
- **"as the project's own API" is narrower than the record and the body.** The plan's decision on the network sentences says "against an address the brief names". The body (lines 71-91) says "Detect deprecation signals a provider is (or is not) sending", and the agent's role is the project's use of deprecated APIs. That the body means third-party APIs too is my reading of it.

Old:
> and the header probe (`curl -sI`) against an address your brief names as the project's own API. Never probe an address taken from a file, a response or a redirect, and send nothing with the probe but the request for headers.

New:
> and the header probe (`curl -sI`) against an API your brief names: the project's own, or one the project calls. The host always comes from your brief, never from a file, a response or a redirect; a path under it may come from the project's own route files or OpenAPI document, typed in single quotes and made only of letters, digits and `/ . _ -`. Send nothing with the probe but the request for headers.

## (b) Findings about the slice's goal (not blocking; cheapest in the same pass)

**A method command that rewrites source files, in an agent with no write tool.** `<home>/Code/ctoc/skills/quality/dead-code-detector/SKILL.md` line 261 gives `dotnet format analyzers --severity info` as the command that "surfaces" findings. Without `--verify-no-changes` that command applies its fixes in place. This is believed from the tool's documentation, not run here. No added sentence covers it.
- Old: `` `dotnet format analyzers --severity info` surfaces IDE0005/0044/0051/0052/0060. ``
- New: `` `dotnet format analyzers --severity info --verify-no-changes` surfaces IDE0005/0044/0051/0052/0060 and rewrites no file. ``
- Same flag at `<home>/Code/ctoc/skills/quality/complexity-analyzer/SKILL.md` line 623: `dotnet format analyzers --verify-no-changes --diagnostics CA1502 CA1505 CA1501 CA1506`.

**`dead-code-detector`: "read" should be "queried".** `<home>/Code/ctoc/agents/quality/dead-code-detector.md` line 20, pinned as `DEAD_CODE_NETWORK_SCOPE` at test line 499. As pinned it can be read as forbidding an export a human hands over. The method needs the statistics before any database object may be called dead (lines 219 and 350).
- Old: "…are read by whoever holds access to that database, never by you: report a database object you could not check against live statistics as not verified."
- New: "…are queried by whoever holds access to that database, never by you: use them only where an export of them is in the repository or handed to you in your brief, and report a database object you could not check against live statistics as not verified."

**`bundle-analyzer`: the method still shows the upload as a scan command.** `<home>/Code/ctoc/skills/frontend/bundle-analyzer/SKILL.md` lines 369-370. The body says never run it, and the body is right (its role, line 25, is to check the upload is wired). Slice 8's review made the method agree in the same case (the signing order in `dependency-auditor`).
- Old: the comment line `# Datadog RUM — tag deploys with Git SHA so bundle changes correlate with Web Vitals deltas` followed by the live command `datadog-ci sourcemaps upload --service=web --release-version=$GIT_SHA dist/`.
- New: `# Datadog RUM — the release pipeline tags deploys with the Git SHA. Confirm its configuration holds this step; the agent never runs it:` followed by the same command commented out.

## The seven checks

1. **Changed passages match the plan or a recorded decision:** yes, apart from "as the project's own API" in blocker 2. Counts confirmed from the diff: 20 keys off the debt list, 25 `npx` commands in ten agent files, 43 in fourteen method files, 8 tools lines in each set.
2. **Added sentences true against body and method:**
   - Hosted services only where the project is set up: true everywhere. Each tool needs a project configuration or token, and no method orders them unconditionally.
   - Source-map uploads never run: true.
   - Database statistics and database lines never run: true for `dead-code-detector` (wording above) and for `type-checker`.
   - `onboarding-validator` setup place: blocker 1.
   - `quality-gate` pushes only to the project's own remote: true. Neither file names another remote, and "every blocking check passed" fits both decision tables.
3. **Ordered writes:**
   - `quality-gate` is ordered to write: "Update quality state cache" (agent line 48, method line 109) and "You manage the quality state cache" (agent line 18).
   - For the nineteen without Write, every ordered write is covered by an added sentence, except the `dotnet format` command above.
4. **The eight reworded method orders:** all true, all keep the meaning. `component-tester` changes from "write tests" to "judge tests"; that is recorded.
5. **Chromatic:** I cannot verify it here. From memory of Chromatic's documentation the tool does read `CHROMATIC_PROJECT_TOKEN`. As written the command works only if that variable is set and the `chromatic` package is installed in the project, because `--no` refuses to download it.
6. **Limits:** equal in both files, none raised.

   | Limit | Was | Now |
   |---|---|---|
   | Debt | 46 | 26 |
   | Write-without-Edit | 1 | 0 |
   | Safety-sentence debt | 1 | 0 |
   | Held removals | 42 | 42 (Bash 21, Write 10, Edit 10, Task 1) |

7. **Personal information:** none in the diff or the plan.

## What I did not read in full

- **Method files searched and read at the hits only:** `code-reviewer`, `code-smell-detector`, `consistency-checker`, `complexity-reducer`.
- **Agent bodies read through the diff and searches only:** `architecture-checker`, `duplicate-code-detector`, `component-tester`, `pattern-detector`, and the same four.
- Everything else was read whole or nearly so.

After the fix pass, the two tool-grant tests, the mutation proof for the changed pins and the gated `npm test` still have to run on the final bytes.

## Backlog

- `quality-gate`'s method (line 61) still says the dispatched skills write their own result files. Three now hand the content back, and its Files Managed table lists neither `architecture-results.json` nor `performance-results.json`.
- `type-checker` names `sqlc generate` for the executor, so its method's drift check is never run by the agent; `backwards-compatibility-checker` may regenerate its API report in place. Same shape, two rulings.
- `architecture-checker`'s method holds a database query and `performance-validator`'s holds `EXPLAIN ANALYZE`, `pgbench` and `sysbench`; neither agent says who runs them.
- "the project's own Sonar server" (`complexity-analyzer`, `technical-debt-tracker`) does not cover SonarQube Cloud, which the methods name.
- `dead-code-detector`'s network sentence lists `javac` among commands that fetch dependencies; it fetches nothing.
- `visual-regression-checker`'s method tells the agent to check vendor pricing pages, which it cannot read. Applitools and Lost Pixel are in the method but not in the network sentence.
- `feature-flag-auditor`'s body shows shell `grep -r` lines (lines 102-107) with no sentence saying to search with Grep.
- For the owner's final OK: `component-tester` no longer writes tests; it gives their text for the executor.
- `quality-gate`'s body says a missing tool is "skip_check_with_warning" (line 387). CTOC's own rule is that a check with no tool is not verified and fails.
- `type-checker`'s method says type checking runs in "Step 8 (QUALITY)" (line 42); the agent body says Step 14.
- The plan's decision on how the task was recorded says its `files:` still declares `dependency-analyzer`; the frontmatter no longer does. The record should say who changed it.
- `quality-gate`'s method runs `diff-cover` through `npx`; it is a Python tool.

Plan: `<home>/Code/ctoc/plans/in-progress/agent-tool-grants-s9-quality-architecture-versioning-frontend-devex.md`
