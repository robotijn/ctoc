# Re-validation reports for agents/ai-quality/ai-code-quality-reviewer.md after rounds 1, 2 and 3 (dispatches d-s3-agent-r1-revalidate, d-s3-agent-r2-revalidate, d-s3-agent-r3-revalidate; citation-validator from installed plugin 6.14.65; 2026-09-30)

# Re-validation of the edited agent file: dispatch d-s3-agent-r1-revalidate

File read in full: `/Users/account/Code/ctoc/agents/ai-quality/ai-code-quality-reviewer.md`, 130 lines. I could not confirm the fingerprint (sha256:07d69318…): Read and Grep cannot compute a hash. I found no text in the file aimed at the validator.

**Result:** 30 claims examined. 29 are validated and 1 names its source's scope wrongly (row 16). None is fabricated and none lacks a source. All three operating-lesson quotes match `/Users/account/Code/ctoc/CLAUDE.md` on disk.

"Reuse" means I read that source earlier this session, on 2026-09-30, and relied on that reading.

| # | Line | Claim | Verdict | Source and evidence | Correct-to |
|---|---|---|---|---|---|
| 1 | 25 | `docs/REFINEMENT_LOOP.md` says "the loop is **NOT RUNNING** today" | VALIDATED | `/Users/account/Code/ctoc/docs/REFINEMENT_LOOP.md`:8, "## Status: this is a design record — the loop is **NOT RUNNING** today" | — |
| 2 | 25 | The skill has "Refinement Loop — critic mode" and "Letter schema" sections, and a letter rule in "Severity" | VALIDATED | `/Users/account/Code/ctoc/skills/ai-quality/ai-code-quality-reviewer/SKILL.md` lines 427–486. Reuse: not re-read after any later edit. | — |
| 3 | 26 | The skill has a "Tool Integration (2026)" table | VALIDATED | Same skill file, line 412. Reuse. | — |
| 4 | 41 | code-reviewer blocks a test with no assertion, a swallowed error, or a silent skip | VALIDATED | `/Users/account/Code/ctoc/agents/quality/code-reviewer.md`:165–196: "**BLOCK** if you find", "Tests without assertions", "Fixtures that swallow errors", "Conditional skips without clear reason" | — |
| 5 | 34–45 | The 14 agents named in the table and handoff paragraph exist | VALIDATED | Each has a `name:` line under `/Users/account/Code/ctoc/agents/` | — |
| 6 | 45 | An async callback passed to forEach "does not wait for promises" (MDN) | VALIDATED | MDN, reuse: "`forEach()` expects a synchronous function — it does not wait for promises." | — |
| 7 | 49 | Five of the classes carry a measurement | VALIDATED | Lines 51–53 cover exactly five: misread request, incomplete output, missing edge cases, hallucinated imports, tests changed to pass. Caveat: Tambon's percentages are shares of 333 bugs, not of all code; line 51 states that. | — |
| 8 | 51 | Tambon et al. classified 333 bugs from CodeGen, PanGu-Coder and Codex | VALIDATED | arxiv.org/pdf/2403.08937, reuse (PDF read directly): "a random sample of 333 bugs" | — |
| 9 | 51 | Misinterpretation "20.77%", "The generated code deviates from the intention of the prompt." | VALIDATED | Same PDF, figure 2, verbatim | — |
| 10 | 51 | Unrelated statements "8.15%", "statements that are unrelated to the task specification." | VALIDATED | Same PDF, figure 2 ("Non-Prompted Consideration") | — |
| 11 | 51 | Incomplete generation "9.57%", "The model generates no code or produces an empty function such as a 'pass' statement." | VALIDATED | Same PDF, figure 2, verbatim | — |
| 12 | 51 | "Missing Corner Cases 15.27% ... The generated code operates correctly, except for overlooking certain corner cases." | VALIDATED | Same PDF, figure 2 | — |
| 13 | 51 | Abstract: "Similar to human-written code, LLM-generated code is prone to bugs" | VALIDATED | arxiv.org/abs/2403.08937, reuse | — |
| 14 | 52 | "at least 5.2% for commercial models and 21.7%" | VALIDATED | arxiv.org/abs/2406.10279, reuse | — |
| 15 | 52 | "43% of hallucinated packages were repeated in all 10 queries, while 39% did not repeat at all across the 10 queries" | VALIDATED | arxiv.org/html/2406.10279, reuse | — |
| 16 | 49 with 53 | ImpossibleBench is given as a measurement of how often tests are changed to pass in assistant-written code: "GPT-5, cheats 54.0% of the time on Conflicting-SWEbench" | MISATTRIBUTED | The quote is verbatim (arxiv.org/html/2510.20270, reuse). But the benchmark measures behaviour on tasks deliberately made impossible, where the specification conflicts with the tests. Its "cheating rate" is the pass rate on those tasks (arxiv.org/abs/2510.20270, reuse). That is a propensity under a forced conflict, not a frequency in ordinary assistant-written code. | "ImpossibleBench measures how often agents exploit tests when the task is made impossible by tests that conflict with the specification: 'GPT-5, cheats 54.0% of the time on Conflicting-SWEbench'. This is a propensity under that conflict, not a rate in ordinary assistant-written code." Line 49 would then count four measured classes. |
| 17 | 53 | GitHub: "Any change that weakens CI is a blocker. Full stop." | VALIDATED | GitHub blog, 7 May 2026, reuse. Presented as guidance, not a measurement. | — |
| 18 | 54 | Subagents: "Inherits every tool available to subagents if omitted." | VALIDATED | code.claude.com/docs/en/sub-agents.md, reuse | — |
| 19 | 54 | Hooks: "Hooks are user-defined shell commands, HTTP endpoints, MCP tool calls, LLM prompts, or subagents that execute automatically at specific points in Claude Code's lifecycle." | VALIDATED | code.claude.com/docs/en/hooks, reuse | — |
| 20 | 54 | Cursor: "Project rules live in `.cursor/rules` as `.mdc` files and are version-controlled." | VALIDATED | cursor.com/docs/context/rules, reuse | — |
| 21 | 55 | Cotroneo et al. quote ("AI-generated code is generally simpler and more repetitive, …") | VALIDATED | arxiv.org/html/2508.21634, reuse, verbatim from the abstract. "Found no measurement" reports this session's research, not an outside source. | — |
| 22 | 57 | GitClear: "4x more code cloning", a trend over time rather than code traced to an assistant | VALIDATED | gitclear.com/ai_assistant_code_quality_2025_research, reuse. The page frames the work as changes "between January 2020 and December 2024". | — |
| 23 | 57 | Sonar: "The models consistently introduced severe bugs like resource leaks and API contract violations, …" | VALIDATED | sonarsource.com blog, reuse | — |
| 24 | 57 | Sonar "compares models with each other and gives no human baseline" | VALIDATED | Report PDF, page 4, read now. The "Our approach" section lists six models and "over 4,442 distinct Java programming assignments", with no set of human-written code. Pages 6–21 not read. | — |
| 25 | 62 | "`false`: Claude Code adds no commit trailer" | VALIDATED | code.claude.com/docs/en/settings-reference.md, reuse | — |
| 26 | 74 | `docs/DISPATCH_PROTOCOL.md` has five severity levels | VALIDATED | `/Users/account/Code/ctoc/docs/DISPATCH_PROTOCOL.md`:97, "# critical \| high \| medium \| low \| info" | — |
| 27 | 74 | Lesson 9: "Deprecations, compiler/linter warnings, and vulnerabilities of any severity are critical" | VALIDATED | `/Users/account/Code/ctoc/CLAUDE.md`:921–922 (the sentence wraps across two lines) | — |
| 28 | 74 | Lesson 7: "Never leave stubs or TODOs." | VALIDATED | `/Users/account/Code/ctoc/CLAUDE.md`:918 | — |
| 29 | 74 | Lesson 14: "Weakening an assertion, widening a range, deleting a case, or whitelisting without a justified reason is green-washing, not fixing." | VALIDATED | `/Users/account/Code/ctoc/CLAUDE.md`:937 (heading of lesson 14), 942–943 (sentence) | — |
| 30 | 84 | The output follows the response schema of `docs/DISPATCH_PROTOCOL.md` | VALIDATED | That file, lines 88–155: `dispatch_id`, `protocol_version`, `agent`, `findings`, `confidence_rationale`, `self_assessment` (`coverage`, `confidence_overall`, `limitations`, `unknowns`), `metadata` (`tokens_used`, `tool_calls`). Not checked: whether the file's `tokens_used: null` is allowed; the protocol's example uses a number and line 149 lists the field as required. | — |

**Counts:** examined 30 · VALIDATED 29 · FABRICATED 0 · UNSOURCEABLE 0 · MISATTRIBUTED 1 (row 16).

**Facts about the outside world that the file states with no source:**
- **Line 35:** the unfinished-work markers `NotImplementedError`, `NotImplementedException`, `UnsupportedOperationException`, `todo!` and `unimplemented!`, and the languages they belong to. I believe these are correct; I did not verify them this pass.
- **Line 40:** the manifest file names (`package.json`, `*.csproj`, `pom.xml`, `build.gradle`, `pyproject.toml`). Believed correct; not verified.
- **Line 43:** that `.claude/`, `AGENTS.md`, `REVIEW.md`, `.github/copilot-instructions.md` and `*.instructions.md` configure a coding assistant. Only the `.cursor/rules` quote and the subagent quote on line 54 back this. Earlier this session I read vendor pages that do: GitHub's Copilot code review page for `copilot-instructions.md` and `*.instructions.md`, Claude Code's Code Review page for `REVIEW.md`, and Cursor's rules page for `AGENTS.md`. The file cites none of them.
- **Line 39:** that a name which resolves on a registry can be "a look-alike registered in advance". The file gives no source; the skill's `react-codeshift` case is the evidence, and it lives in the skill, not here.

**Not examined this pass:** whether each named agent's own definition claims the work this file hands it. I checked this only for code-reviewer (row 4); the other 13 were checked for existence only.

---

# Round 2 re-validation of `ai-code-quality-reviewer.md` (dispatch d-s3-agent-r2-revalidate)

**All 59 citation-shaped claims validated; none fabricated, unsourced or misattributed.** Rows 1–30 are the claims I validated in the two earlier passes. Rows 31–59 are new in round 2.

I read `/Users/account/Code/ctoc/agents/ai-quality/ai-code-quality-reviewer.md` in full. It is 132 lines, which matches the dispatch. I cannot confirm the fingerprint: Read and Grep do not compute a hash.

- **Reuse:** I read that source earlier this session and relied on that reading.
- **Round-2 reuse:** I relied on the round-2 researcher's reading in `/Users/account/Code/ctoc/.ctoc/audit/improvement-run-notes/s3-agent-round2-research-d-s3-agent-r2-research.md`.
- **"(Part 1/Part 2 text)":** the quote appears in that report's Part 1 or Part 2 prose, not in its research_log quote field.

| # | Line | Claim | Verdict | Source and basis |
|---|---|---|---|---|
| 1 | 25 | `docs/REFINEMENT_LOOP.md` says "the loop is **NOT RUNNING** today" | VALIDATED | That file, line 8. Reuse. |
| 2 | 25 | The skill has "Refinement Loop — critic mode", "Letter schema" and a letter rule in "Severity" | VALIDATED | SKILL.md lines 427–486. Reuse. |
| 3 | 26 | The skill has a "Tool Integration (2026)" table | VALIDATED | SKILL.md line 412. Reuse. |
| 4 | 41 | code-reviewer blocks a test with no assertion, a swallowed error, a silent skip | VALIDATED | `agents/quality/code-reviewer.md`:165–196. Reuse. |
| 5 | 34–45 | The 14 agents named in the first pass exist | VALIDATED | A `name:` line under `agents/` for each. Reuse. |
| 6 | 45 | forEach "does not wait for promises" | VALIDATED | MDN. Reuse. |
| 7 | 49 | Four classes are measured, and a fifth has a propensity under forced conflict | VALIDATED | Lines 51–53. Checked last pass. |
| 8 | 51 | Tambon et al.: 333 bugs from CodeGen, PanGu-Coder and Codex | VALIDATED | arxiv.org/pdf/2403.08937. Reuse (I read the PDF directly). |
| 9 | 51 | Misinterpretation "20.77%" and its definition | VALIDATED | Same PDF, figure 2. Reuse. |
| 10 | 51 | Unrelated statements "8.15%" and its definition | VALIDATED | Same PDF, figure 2. Reuse. |
| 11 | 51 | Incomplete generation "9.57%" and its definition | VALIDATED | Same PDF, figure 2. Reuse. |
| 12 | 51 | "Missing Corner Cases 15.27% ..." | VALIDATED | Same PDF, figure 2. Reuse. |
| 13 | 51 | Abstract: "Similar to human-written code, LLM-generated code is prone to bugs" | VALIDATED | arxiv.org/abs/2403.08937. Reuse. |
| 14 | 52 | "at least 5.2% for commercial models and 21.7%" | VALIDATED | arxiv.org/abs/2406.10279. Reuse. |
| 15 | 52 | "43% ... repeated in all 10 queries, while 39% did not repeat at all ..." | VALIDATED | arxiv.org/html/2406.10279. Reuse. |
| 16 | 53 | ImpossibleBench is a propensity under conflict; "GPT-5, cheats 54.0% of the time on Conflicting-SWEbench" | VALIDATED | arxiv.org/html/2510.20270 and its abstract page. Reuse. |
| 17 | 53 | GitHub: "Any change that weakens CI is a blocker. Full stop." | VALIDATED | GitHub blog, 7 May 2026. Reuse. |
| 18 | 54 | Subagents: "Inherits every tool available to subagents if omitted." | VALIDATED | code.claude.com/docs/en/sub-agents.md. Reuse. |
| 19 | 54 | Hooks: "Hooks are user-defined shell commands, ... that execute automatically ..." | VALIDATED | code.claude.com/docs/en/hooks. Reuse. |
| 20 | 54 | Cursor: "Project rules live in `.cursor/rules` as `.mdc` files ..." | VALIDATED | cursor.com/docs/context/rules. Reuse. |
| 21 | 55 | Cotroneo et al. quote | VALIDATED | arxiv.org/html/2508.21634. Reuse. |
| 22 | 57 | GitClear: "4x more code cloning", a trend over time | VALIDATED | gitclear.com. Reuse. |
| 23 | 57 | Sonar: "... resource leaks and API contract violations ..." | VALIDATED | Sonar blog. Reuse. |
| 24 | 57 | Sonar compares models with each other and gives no human baseline | VALIDATED | Report PDF, page 4, "Our approach". Reuse. Pages 6–21 not read. |
| 25 | 64 | "`false`: Claude Code adds no commit trailer" | VALIDATED | code.claude.com/docs/en/settings-reference.md. Reuse. |
| 26 | 76 | `docs/DISPATCH_PROTOCOL.md` has five severity levels | VALIDATED | That file, line 97. Reuse. |
| 27 | 76 | Lesson 9 quote | VALIDATED | `/Users/account/Code/ctoc/CLAUDE.md`:921–922. Reuse of this session's on-disk read. |
| 28 | 76 | Lesson 7 quote | VALIDATED | Same file, line 918. Reuse. |
| 29 | 76 | Lesson 14 quote | VALIDATED | Same file, lines 937 and 942–943. Reuse. |
| 30 | 86–123 | The output follows the `docs/DISPATCH_PROTOCOL.md` response schema | VALIDATED | That file, lines 88–155. Reuse. |
| 31 | 51 | Tambon's prompt-biased code definition: "This issue occurs when the LLM excessively relies on provided examples ..." | VALIDATED | Same PDF, pages 14–15. Round-2 reuse (the researcher read the PDF directly). |
| 32 | 56 | Google: "developers have made the code more generic than it needs to be, or added functionality that isn't presently needed" | VALIDATED | google.github.io/eng-practices/review/reviewer/looking-for.html. Round-2 reuse (Part 2 text). |
| 33 | 56 | Google: "Will the tests actually fail when the code is broken?" | VALIDATED | Same page. Round-2 reuse (Part 2 text). |
| 34 | 58 | Tambon's wrong input type: "We use this label when LLM uses an incorrect input type in a correct function call." | VALIDATED | Same PDF. Round-2 reuse (Part 2 text, read directly). |
| 35 | 58 | Google: "If a CL changes how users build, test, interact with, or release code, check to see that it also updates associated documentation, ..." | VALIDATED | Same Google page. Round-2 reuse (verbatim in the log). |
| 36 | 58 | Claude Code Code Review: "if your PR changes code in a way that makes a `CLAUDE.md` statement outdated, Claude flags that the docs need updating too." | VALIDATED | code.claude.com/docs/en/code-review.md. My own full-page read this session. |
| 37 | 59 | Python calls `pass` "useful as a placeholder" | VALIDATED | docs.python.org/3/reference/simple_stmts.html. Round-2 reuse. |
| 38 | 59 | Python: "In user defined base classes, abstract methods should raise this exception" | VALIDATED | docs.python.org/3/library/exceptions.html. Round-2 reuse. |
| 39 | 59 | .NET NotImplementedException: "when a member is still in development and will only be implemented later" | VALIDATED | learn.microsoft.com, system.notimplementedexception. Round-2 reuse. |
| 40 | 59 | Oracle describes UnsupportedOperationException "only as" "Thrown to indicate that the requested operation is not supported" | VALIDATED | docs.oracle.com, Java SE 21. Round-2 reuse. The page's only other sentence is its Collections Framework membership, so "only" holds. |
| 41 | 59 | Rust `todo!`: "Indicates unfinished code." | VALIDATED | doc.rust-lang.org/std/macro.todo.html. Round-2 reuse. |
| 42 | 59 | Rust `todo!` page: "unimplemented! makes no such claims" | VALIDATED | Same page. Round-2 reuse. The unimplemented page is cited alongside it. |
| 43 | 59 | CWE-546 "Suspicious Comment": "BUG, HACK, FIXME, LATER, LATER2, TODO" | VALIDATED | cwe.mitre.org/data/definitions/546.html. Round-2 reuse. |
| 44 | 59 | npm documents `package.json` | VALIDATED | docs.npmjs.com, package-json page. Round-2 reuse. |
| 45 | 59 | NuGet: ".NET Framework projects support PackageReference, but currently default to `packages.config`." | VALIDATED | learn.microsoft.com, package-references-in-project-files. Round-2 reuse (Part 2 text). |
| 46 | 59 | NuGet: "a `<PackageVersion />` item must not be defined in `Directory.Packages.props` for an implicitly defined package" | VALIDATED | Same page. Round-2 reuse (Part 2 text). |
| 47 | 59 | Maven names the manifest (`pom.xml`) | VALIDATED, medium confidence | maven.apache.org, introduction to the POM. Round-2 reuse. The verbatim quote does not show the literal file name. |
| 48 | 59 | Gradle names the manifest (`build.gradle`) | VALIDATED, medium confidence | docs.gradle.org, declaring dependencies. Round-2 reuse. The literal name came from the fetch tool's summary. |
| 49 | 59 | The Python Packaging User Guide names `pyproject.toml` | VALIDATED | packaging.python.org. Round-2 reuse. |
| 50 | 59 | GitHub: "Alternatively, you can use a single CLAUDE.md or GEMINI.md file stored in the root of the repository." | VALIDATED | docs.github.com, add-repository-instructions. Round-2 reuse. The same page names `copilot-instructions.md` and `*.instructions.md`. |
| 51 | 59 | Claude Code on `.claude/`: "Project-level configuration, rules, and extensions" | VALIDATED | code.claude.com/docs/en/claude-directory.md. Round-2 reuse (Part 1 text). |
| 52 | 59 | Claude Code on `.mcp.json`: "Project-scoped MCP servers, shared with your team" | VALIDATED | Same page. Round-2 reuse. |
| 53 | 59 | "REVIEW.md is a file at your repository root that tailors Code Review to your repo." | VALIDATED | code-review.md. My own read this session. |
| 54 | 59 | "Claude reads `CLAUDE.md` files at every level of your directory hierarchy" | VALIDATED | code-review.md. My own read this session. |
| 55 | 59 | Cursor: "AGENTS.md is a simple markdown file for defining agent instructions." | VALIDATED | cursor.com/docs/context/rules. My own round-1 read. |
| 56 | 59 | Cursor's help centre calls a root `.cursorrules` "legacy and will be deprecated" | VALIDATED | cursor.com/help/customization/rules. My own round-1 read. |
| 57 | 59 | OWASP Top 10 CI/CD Security Risks, typosquatting: "Publication of malicious packages with similar names to those of popular packages" | VALIDATED | owasp.github.io, CICD-SEC-03. Round-2 reuse. The owasp.org address redirects here (308). |
| 58 | 86 | The skill's type names are `vacuous_test_assertion`, `deprecated_api_pattern`, `framework_version_mismatch`, `missing_business_rule` and `unrelated_edit` | VALIDATED | SKILL.md lines 211, 245, 303, 336 and 450–452. Checked with Grep this pass. |
| 59 | 45, 58 | The newly routed agents type-checker and documentation-updater exist | VALIDATED | `agents/quality/type-checker.md` and `agents/documentation/documentation-updater.md`. Checked with Grep this pass. |

**Counts:** examined 59 · VALIDATED 59 (rows 47 and 48 at medium confidence) · FABRICATED 0 · UNSOURCEABLE 0 · MISATTRIBUTED 0.

**Claims about the outside world that still have no source:**
- **Line 35, "a read-only collection, for example".** The Oracle quote says only "not supported". Nothing cited ties the exception to read-only collections.
- **Line 35, "often by design".** This is a frequency word with no measurement behind it. The sources show these three uses are documented idioms, not how often they occur.
- **Line 40, "a lockfile".** Listed as a place to read the pinned version, but no lockfile is named or sourced.
- **Line 45, `docs/`.** Given as a place documentation lives. It is a convention; line 58's sources name READMEs and `CLAUDE.md` only.

Not examined this pass: whether each of the 16 handed-on agents' own definitions claims the work routed to it. Only code-reviewer was checked (row 4).

---

# Round 3 re-validation of `ai-code-quality-reviewer.md` (dispatch d-s3-agent-r3-revalidate)

**83 of 84 claims are validated. The commit-trailer quote (row 25) is still wrong, because the page's own wording keeps changing.** Rows 1–59 are the claims from the earlier passes, with their current line numbers. Rows 60–84 are new in round 3.

I read `/Users/account/Code/ctoc/agents/ai-quality/ai-code-quality-reviewer.md` in full. It is 133 lines, which matches the dispatch. I cannot confirm the fingerprint: Read and Grep do not compute a hash.

How each row was checked:
- **Reuse:** my own earlier reading this session.
- **Round-2 reuse / round-3 reuse:** that round's research report.
- **"PDF":** I read the saved ANSSI and BSI report pages myself this pass.

| # | Line | Claim | Verdict | Source and basis |
|---|---|---|---|---|
| 1 | 25 | `docs/REFINEMENT_LOOP.md` says "the loop is **NOT RUNNING** today" | VALIDATED | That file, line 8. Reuse. |
| 2 | 25 | The skill has the refinement-loop, letter-schema and severity-letter sections | VALIDATED | SKILL.md lines 427–486. Reuse. |
| 3 | 26 | The skill has a "Tool Integration (2026)" table | VALIDATED | SKILL.md line 412. Reuse. |
| 4 | 41 | code-reviewer blocks a test with no assertion, a swallowed error, a silent skip | VALIDATED | `agents/quality/code-reviewer.md`:165–196. Reuse. |
| 5 | 34–45 | The first 14 handed-on agents exist | VALIDATED | Checked with Grep. Reuse. |
| 6 | 45 | forEach "does not wait for promises" | VALIDATED | MDN. Reuse; round 3 also confirmed it from the raw markdown source. |
| 7 | 49 | Four classes are measured, and a fifth has a propensity under forced conflict | VALIDATED | Reuse. |
| 8 | 51 | Tambon et al.: 333 bugs from CodeGen, PanGu-Coder and Codex | VALIDATED | arxiv.org/pdf/2403.08937. Reuse (I read the PDF directly). |
| 9 | 51 | Misinterpretation "20.77%" and its definition | VALIDATED | Same PDF, figure 2. Reuse. |
| 10 | 51 | Unrelated statements "8.15%" and its definition | VALIDATED | Same PDF, figure 2. Reuse. |
| 11 | 51 | Incomplete generation "9.57%" and its definition | VALIDATED | Same PDF, figure 2. Reuse. |
| 12 | 51 | Missing corner cases "15.27%" and its definition | VALIDATED | Same PDF, figure 2. Reuse. |
| 13 | 51 | Tambon abstract quote | VALIDATED | arxiv.org/abs/2403.08937. Reuse. |
| 14 | 52 | Spracklen: 5.2% and 21.7% | VALIDATED | arxiv.org/abs/2406.10279. Reuse. |
| 15 | 52 | Spracklen: 43% and 39% | VALIDATED | arxiv.org/html/2406.10279. Reuse. |
| 16 | 53 | ImpossibleBench: 54.0%, framed as a propensity under forced conflict | VALIDATED | arxiv.org/html/2510.20270. Reuse. |
| 17 | 53 | GitHub: "Any change that weakens CI is a blocker. Full stop." | VALIDATED | GitHub blog. Reuse. |
| 18 | 54 | Claude Code subagents quote | VALIDATED | sub-agents.md. Reuse. |
| 19 | 54 | Claude Code hooks quote | VALIDATED | hooks. Reuse. |
| 20 | 54 | Cursor `.mdc` quote | VALIDATED | cursor.com/docs/context/rules. Reuse; round 3 re-confirmed. |
| 21 | 55 | Cotroneo et al. quote | VALIDATED | arxiv.org/html/2508.21634. Reuse. |
| 22 | 57 | GitClear: "4x more code cloning", a trend over time | VALIDATED | gitclear.com. Reuse. |
| 23 | 57 | Sonar quote | VALIDATED | Sonar blog. Reuse. |
| 24 | 57 | Sonar compares models with each other and gives no human baseline | VALIDATED | Report PDF, page 4. Reuse. Pages 6–21 not read. |
| 25 | 65 | Settings reference offers "`false` to omit the trailer from every commit Claude Code makes" | **MISATTRIBUTED** | I re-read code.claude.com/docs/en/settings-reference.md this pass. The `attribution.commit` section now reads "Set this key to a custom string to replace the trailer text, or to `false` to hide it." and "`false`: Claude Code hides the trailer". Neither the round-3 wording nor my round-1 wording is there. The default trailer text also differs between my two reads ("Co-authored-by: Claude <claude@anthropic.com>" earlier, "Co-Authored-By: Claude Code <claude-code@anthropic.com>" now). Either the live page changed during the day or the fetch tool's reading model reworded it. The fact is stable across all three readings; the verbatim quote is not. Confidence medium.<br>**Correct-to:** state it without quotation marks: "Claude Code's settings reference documents setting `attribution.commit` to `false` to hide the commit trailer (https://code.claude.com/docs/en/settings-reference.md, read 2026-09-30)". |
| 26 | 77 | `docs/DISPATCH_PROTOCOL.md` has five severity levels | VALIDATED | That file, line 97. Reuse. |
| 27 | 77 | Lesson 9 quote | VALIDATED | `/Users/account/Code/ctoc/CLAUDE.md`:921–922. Reuse. |
| 28 | 77 | Lesson 7 quote | VALIDATED | Same file, line 918. Reuse. |
| 29 | 77 | Lesson 14 quote | VALIDATED | Same file, lines 937 and 942–943. Reuse. |
| 30 | 87–124 | The output follows the `docs/DISPATCH_PROTOCOL.md` response schema | VALIDATED | That file, lines 88–155. Reuse. |
| 31 | 51 | Tambon's prompt-biased code definition | VALIDATED | Same PDF, pages 14–15. Round-2 reuse. |
| 32 | 56 | Google, completed: "…isn't presently needed by the system" | VALIDATED | Google review guide. Round-3 reuse (raw markdown source). |
| 33 | 56 | Google: "Will the tests actually fail when the code is broken?" | VALIDATED | Same guide. Round-2 and round-3 reuse. |
| 34 | 58 | Tambon's wrong input type definition | VALIDATED | Same PDF. Round-2 reuse. |
| 35 | 58 | Google documentation sentence | VALIDATED | Same guide. Round-2 and round-3 reuse. |
| 36 | 58 | Claude Code Code Review: outdated `CLAUDE.md` sentence | VALIDATED | code-review.md. Reuse; round 3 confirmed it raw. |
| 37 | 59 | Python `pass` is "useful as a placeholder" | VALIDATED | Python reference. Round-2 reuse. |
| 38 | 59 | Python: abstract methods "should raise this exception" | VALIDATED | Python exceptions page. Round-2 reuse. |
| 39 | 59 | .NET `NotImplementedException` quote | VALIDATED | Microsoft Learn. Round-2 reuse. |
| 40 | 59 | Oracle `Collection`: unmodifiable collections' mutators "are specified to throw `UnsupportedOperationException`" | VALIDATED | docs.oracle.com, java/util/Collection.html. Round-3 reuse. Replaces the "only as" wording. |
| 41 | 59 | Rust `todo!`: "Indicates unfinished code." | VALIDATED | doc.rust-lang.org. Round-2 reuse. |
| 42 | 59 | Rust `todo!` page: "unimplemented! makes no such claims" | VALIDATED | Same page. Round-2 reuse. |
| 43 | 59 | CWE-546 "Suspicious Comment" marker list | VALIDATED | cwe.mitre.org. Round-2 and round-3 reuse. |
| 44 | 59 | npm documents `package.json` | VALIDATED | docs.npmjs.com. Round-2 reuse. |
| 45 | 59 | NuGet: ".NET Framework projects … default to `packages.config`." | VALIDATED | Microsoft Learn NuGet page. Round-3 reuse (confirmed raw). |
| 46 | 59 | NuGet `Directory.Packages.props` sentence | VALIDATED | Same page. Round-3 reuse (confirmed raw). |
| 47 | 59 | Maven names `pom.xml` | VALIDATED | Maven POM introduction. Round-3 reuse: "the relative path from the module's `pom.xml` to the parent's `pom.xml`". |
| 48 | 59 | Gradle's samples are captioned `build.gradle` and `build.gradle.kts` | VALIDATED, medium confidence | docs.gradle.org, declaring dependencies. Round-3 reuse; the captions came from the reading model's summary. |
| 49 | 59 | The Python Packaging User Guide names `pyproject.toml` | VALIDATED | packaging.python.org. Round-2 reuse. |
| 50 | 59 | GitHub: "Alternatively, you can use a single CLAUDE.md or GEMINI.md file stored in the root of the repository." | VALIDATED | docs.github.com. Round-3 reuse (markdown body). |
| 51 | 59 | Claude Code `.claude/` quote | VALIDATED | claude-directory.md. Round-2 reuse. |
| 52 | 59 | Claude Code `.mcp.json` quote | VALIDATED | Same page. Round-2 reuse. |
| 53 | 59 | Claude Code `REVIEW.md` quote | VALIDATED | code-review.md. Reuse; round 3 confirmed it raw. |
| 54 | 59 | "Claude reads `CLAUDE.md` files at every level of your directory hierarchy" | VALIDATED | Same page. Reuse; round 3 confirmed it raw. |
| 55 | 59 | Cursor `AGENTS.md` quote | VALIDATED | cursor.com/docs/context/rules. Reuse; round 3 re-confirmed. |
| 56 | 59 | Cursor help centre: `.cursorrules` is "legacy and will be deprecated" | VALIDATED | cursor.com/help/customization/rules. Reuse; round 3 re-confirmed. |
| 57 | 59 | OWASP CICD-SEC-3 typosquatting definition | VALIDATED | Round-3 reuse (raw GitHub markdown source). |
| 58 | 87 | The skill's type names | VALIDATED | SKILL.md lines 211, 245, 303, 336 and 450–452. Reuse. |
| 59 | 45, 58 | type-checker and documentation-updater exist | VALIDATED | Checked with Grep again this pass. |
| 60 | 40, 59 | npm names `package-lock.json` | VALIDATED | docs.npmjs.com, package-lock-json. Round-3 reuse. |
| 61 | 59 | Yarn: "Yarn uses a `yarn.lock` file in the root of your project." | VALIDATED | classic.yarnpkg.com. Round-3 reuse. |
| 62 | 59 | pnpm: "You should always commit the lockfile (`pnpm-lock.yaml`)." | VALIDATED | pnpm.io/git. Round-3 reuse. |
| 63 | 59 | NuGet: "opt-in to the lock file feature by setting the MSBuild property `RestorePackagesWithLockFile`" | VALIDATED | Microsoft Learn NuGet page. Round-3 reuse (confirmed raw). |
| 64 | 59 | NuGet: restore "will generate a lock file (`packages.lock.json`)" | VALIDATED | Same page. Round-3 reuse (confirmed raw). |
| 65 | 59 | Poetry: "You should commit the `poetry.lock` file to your project repo" | VALIDATED | python-poetry.org. Round-3 reuse. |
| 66 | 59 | uv: "uv creates a `uv.lock` file next to the `pyproject.toml`." | VALIDATED | docs.astral.sh. Round-3 reuse. |
| 67 | 59 | Gradle: "The lock state is preserved in a file named `gradle.lockfile`" | VALIDATED | Gradle dependency-locking page. Round-3 reuse. |
| 68 | 59 | Gradle: "Once enabled, you must create an initial lock state" | VALIDATED | Same page. Round-3 reuse. |
| 69 | 59 | Cargo: "`Cargo.toml` is a manifest file …" | VALIDATED | doc.rust-lang.org Cargo guide. Round-3 reuse. |
| 70 | 40, 59 | Cargo's page names `Cargo.lock` | VALIDATED | Same page. Round-3 reuse ("`Cargo.lock` contains exact information about your dependencies."). |
| 71 | 59 | Maven "lacks native support for a lockfile" (Schmid and colleagues, arXiv 2510.00730); no Apache Maven page on lockfiles found | VALIDATED | arxiv.org/abs/2510.00730. Round-3 reuse. The author name comes from round 3's prose, not its research log. |
| 72 | 40 | A missing lockfile is not a finding: NuGet's and Gradle's lockfiles must be switched on, and Maven has none | VALIDATED | Rows 63, 68 and 71. |
| 73 | 60 | ANSSI and BSI joint report "AI Coding Assistants", at the given address, "last updated September 2024" | VALIDATED | PDF pages 1–2: cover title "AI Coding Assistants", both agencies named as source, "Last updated: September 2024". |
| 74 | 60 | "Generated source code should generally be checked and reproduced by the developers. A critical review should be carried out particularly with regard to hallucinations and security risks." (page 12) | VALIDATED | PDF page 12, section 4.2, verbatim. |
| 75 | 60 | "One cause of these security flaws is the use of outdated programs in the training data …" (page 9) | VALIDATED | PDF page 9, section 3.3, verbatim. |
| 76 | 60 | "AI coding assistants can use autocompletion to suggest methods and classes … that do not exist for the package in question." (page 10) | VALIDATED | PDF page 10, section 3.4.1, verbatim. |
| 77 | 60 | "Unknown libraries should be checked for plausibility, …" (page 10) | VALIDATED | PDF page 10, mitigation bullet, verbatim. |
| 78 | 60 | "Modern coding assistants can often be augmented with extensions which can take actions on behalf of programmers." (page 11) | VALIDATED | PDF page 11, section 3.4.4, verbatim. |
| 79 | 60 | "attackers can write malicious instructions into the documentation of software packages." (page 10) | VALIDATED | PDF page 10, section 3.4.2, verbatim (the source sentence opens "For example,"). |
| 80 | 60 | "insecure libraries were suggested even when their documentation flagged security concerns" (page 9) | VALIDATED | PDF page 9, verbatim. |
| 81 | 60 | "insecure methods such as MD5 or a single iteration of SHA-256 are still often used" (page 9) | VALIDATED | PDF page 9, verbatim, in the context of password encryption. Consistent with line 45's "MD5 for passwords". |
| 82 | 60 | "… can be incorrect or completetly hallucinated", with the misspelling marked as the source's | VALIDATED | PDF page 9, verbatim. "completetly" is the source's own spelling. |
| 83 | 45 | dependency-checker, secrets-detector and sast-scanner exist | VALIDATED | Checked with Grep this pass. |
| 84 | 35 | Three markers can be by design: a base-class `NotImplementedError`, a read-only collection's `UnsupportedOperationException`, an `unimplemented!` meant to stay | VALIDATED | Rows 38, 40 and 42. Replaces round 2's unsourced "often by design" and "read-only collection" example. |

**Counts:** examined 84 · VALIDATED 83 (row 48 at medium confidence) · FABRICATED 0 · UNSOURCEABLE 0 · MISATTRIBUTED 1 (row 25).

**Claims about the outside world still without a source:** none. The four items I listed in round 2 are now sourced or softened:
- The read-only collection example is backed by Oracle's `Collection` documentation (row 40).
- "Often by design" now reads "can be by design" (row 84).
- The lockfiles are now named and sourced (rows 60–72).
- `docs/` now reads "any `docs/` directory".

Not examined this pass: whether the handed-on agents' own definitions claim the work routed to them, beyond code-reviewer (row 4).