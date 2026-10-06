**Verdict: kick back.** One sentence is wrong and needs a fix in three files. Everything else in this slice is sound. The six security and licence agents changed only their typed-text clause, and the test limits are correct.

## Blocker

**A sentence about what a Bash call keeps is untrue, and believing it leaves programs running.** It is in `tests/agent-tool-grants.test.js` line 511 (the pinned constant for the start-and-attach rule). The same text is at line 20 of `agents/specialized/memory-safety-checker.md` and line 20 of `agents/specialized/performance-profiler.md`.

It says each call "keeps no variable and no process from the call before". Variables are indeed not kept. Processes are a different matter: a program started in the background, or with the Bash tool's background option, keeps running after the call ends. A later call just has no way to find it. I believe this rather than verified it, since I hold no Bash here.

An agent that trusts the sentence will start a server (for example a Go program serving a profile on port 6060), profile it, and never stop it. The project's code then keeps running after the dispatch ends. Even if I am wrong about the runtime, the new wording costs nothing.

- **Old:** "Every Bash call starts again in the directory you were dispatched in and keeps no variable and no process from the call before: start a program and attach a tool to it (a profiler, `jcmd`, `dotnet-counters`, `perf`, `py-spy`) in one call, and never attach to a process you did not start."
- **New:** "Every Bash call starts again in the directory you were dispatched in and keeps no variable from the call before, so no later call can find a program an earlier call started, even while it keeps running: in one call, start the program, attach a tool to it (a profiler, `jcmd`, `dotnet-counters`, `perf`, `py-spy`), and stop the program if it is still running; never attach to a process you did not start."

## Findings on this slice's goal (not blocking)

1. **The tightened typed-text clause blocks one Android command.** `android-checker` now carries the rule that a name typed into a command must stand after `--` and never begin with `-`. Its method file at `skills/mobile/android-checker/SKILL.md` line 332 orders `./gradlew :app:dependencyInsight --dependency <pkg>`. That name comes from a build file, and Gradle takes it as the value of an option, so it cannot stand after `--`. A full Maven coordinate also contains `:`, which the clause does not allow. Only this one look-up command is lost. Fix: add a comment on line 332, "the agent runs this only with a name its brief gives; a name read from a build file goes in the report for the executor".
2. **A new "never" sentence in `hallucination-detector` conflicts with its own recipes.** Line 94 says "Never send a request to an address taken from … a registry answer". The body's own lookup commands (lines 169, 177, 198, 236) pass curl the flag that follows up to three redirects, so curl itself goes to an address the registry returned. The agent will run the commands as written, so nothing breaks. Fix: "…a manifest, or the body of a registry answer (the recipes' own `-L` follows up to three https redirects)".

## The seven checks

1. **Are the added sentences true against each body and method file?** Yes, apart from the blocker and finding 1. On the executor's readings:
   - **The sitemap reading holds.** The method file crawls `pa11y-ci --sitemap`.
   - **"A conformance run never goes to production" holds.** The method file at line 522 already flags a contract test that calls a production endpoint.
   - **"Never attach to a process you did not start" holds.** The method role was reworded to match, and production profiles come from exports. Only the "keeps no process" clause is wrong.
   - **The three Android release tasks are never run, and that holds.** Line 196 orders `assembleRelease` "in CI", not by the agent. `lintRelease` (line 311) still catches part of what the release build would.
   - **"Judge, never write" holds** for all five safety and real-time agents.
2. **Should the five safety and real-time agents get Write and Edit? No.** The reworded method lines agree with the agents, and "judges whether the artifact exists" is the right reading:
   - `agents/safety/fmeda-analyzer.md` line 22: "You do not perform the analysis method yourself."
   - Fault tree (line 24) and redundancy (line 24): "Your job is when it runs / when the question gets asked, whether … still holds, and whether the build may proceed."
   - `hil-harness` line 22: "a watcher rather than a test runner".
   - `wcet-budget` line 28: "you check that they do and that they are reproducible".
   - Their block tables treat a missing artifact as a blocking finding. That makes sense only if the agent is not the one meant to write it (fault tree line 180: "Declared top event with no tree | BLOCK").
   - No body orders a write. The method files' own tools line is `Read, Grep, Glob`.
   - The owner's ruling (an agent ordered to write gets both Write and Edit) only applies once there is a write order, and there is none. Giving Write would let a watcher write the safety record it then judges, which defeats the independence it exists for.
3. **`llm-security-tester` and the web: clean.** No line in its body or method file orders a web lookup. The citations marked "read 2026-…" are the file author's own reads, not orders. The `curl` at method line 771 is marked "design only: the agent never runs it". The only route to a web fact is the `needs-input` return.
4. **The reworded method orders are true and keep their meaning.** This covers configuration (three places), health check, profiler (two), translation, the five sentences under the safety and real-time Outputs headings, the rung check in `hil-harness`, data quality, feature store (two), the model validator and Android (five). The nits are in the backlog.
5. **The six security and licence agents changed only their typed-text clause.** Each diff hunk is one line and the only difference is the clause. Their six pins in the test now use the "after dashes" constant.
6. **The limits match in both test files and none was raised.**

   | Limit | Main test | Limits file |
   |---|---|---|
   | Debt | 1, `dependency-analyzer` only (line 243) | 1 |
   | Safety-floor exceptions | 0 (line 236) | 0 |
   | Excused tools | — | 0 |
   | Write without Edit | 0 (line 289) | 0 |
   | Safety-sentence debt | 0 (line 308) | 0 |
   | Held removals | 42 (line 280) | 42 |

   In the limits file (lines 51–56), the per-tool split of held removals is Bash 21, Write 10, Edit 10, Task 1, which sums to 42. All twenty-five method files' tools lines equal their agent's, and none holds Write.
7. **No personal information was added.** `alice.chen@example.com` in the feature-store method file was already there and uses a reserved example address.

## Backlog

- The review diff includes thirteen files outside this plan's `files:`: CTO Chief, the independent-verification chief, synthesizer, gate-critic, the three Iron Loop agents, the five pipeline agents and `citation-validator`. I did not review them. Commit only this plan's files.
- `accessibility-checker` may start a dev server but has no rule to start and stop it within one call.
- `pa11y-ci --sitemap` visits every sitemap entry, including one on another host. The sentence forbids that, but nothing filters it.
- `memory-safety-checker` says it reaches the network "for nothing else", then allows a localhost profiler address. `performance-profiler` calls the same case its "one thing only".
- `android-checker` no longer checks how the release build shrinks code. `./gradlew :app:minifyReleaseWithR8` runs that step without signing (task name from memory, not checked).
- The `assembleRelease` comment at `skills/mobile/android-checker/SKILL.md` line 317 says "it signs" unconditionally. The agent body says "wherever the build is set up for it".
- `fmeda-analyzer` and `wcet-budget` send the metric arithmetic and the schedulability computation to a script. Checking recorded arithmetic by hand needs no command and could be allowed outright.
- The five safety and real-time method files keep the heading "Outputs (what this skill writes)" above the new sentence saying the wrapper agent writes nothing.
- `llm-security-tester`'s `needs-input` return has no field in its response schema. Its line 89 sends the same thing to `self_assessment.unknowns`.
- `database-reviewer` treats its method file's tool table (squawk, atlas migrate lint) as no order. `error-handler-checker`'s table of the same shape gets a name-the-command sentence: one shape, two rulings.
- The `api-contract-validator` sentence "the blocks headed CI … you never run them" also covers `buf lint`, `buf breaking` and `oasdiff breaking`, which the agent runs from its own Tools section.
- In `ios-checker`, `match`, `build_app` and `upload_to_testflight` are Fastlane actions, not lanes.
- The shared typed-text clause cannot be met by any name passed as an option's value (Gradle's `--dependency`, `py-spy --pid`). A form like "after `--` where the tool takes one" would cover them.

The files that need the fix are `tests/agent-tool-grants.test.js`, `agents/specialized/memory-safety-checker.md` and `agents/specialized/performance-profiler.md`.
