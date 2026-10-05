# Re-validation reports for skills/ai-quality/ai-code-quality-reviewer/SKILL.md after rounds 1, 2 and 3 (dispatches d-s3-skill-r1-revalidate, d-s3-skill-r2-revalidate, d-s3-skill-r3-revalidate; citation-validator from installed plugin 6.14.65; 2026-09-30)

# Re-validation of the edited `ai-code-quality-reviewer` skill body (dispatch d-s3-skill-r1-revalidate)

**All 87 citation-shaped claims validate. Both claims you asked me to check fresh are on the pages they cite.** Four rows are at medium confidence or carry a caveat (rows 15, 53, 75, 76); none is a wrong claim.

I read `<home>/Code/ctoc/skills/ai-quality/ai-code-quality-reviewer/SKILL.md` in full (550 lines). I cannot confirm the fingerprint: Read and Grep do not compute a hash. No file or fetched page tried to instruct me.

How each row was checked:
- **Fresh:** fetched or grepped this pass.
- **Reuse:** my own earlier reading this session.
- **Skill-r1 reuse:** the skill's round-1 research report, `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s3-skill-round1-research-d-s3-skill-r1-research.md`. "Log" means the quote is in its research log; "text" means it is only in the report's prose.
- **Agent-r2 / agent-r3 reuse:** the agent's round-2 or round-3 research report.
- **PDF:** my own reading of the saved French and German regulator report.

| # | Line | Claim | Verdict | Source and basis |
|---|---|---|---|---|
| 1 | 15–30 | All 15 `related_skills` paths exist | VALIDATED | Fresh Grep: every path has a `SKILL.md` under `skills/`. |
| 2 | 44 | The agent reads this file in full, and the agent wins where they disagree | VALIDATED | Agent file lines 22 and 27. Reuse. |
| 3 | 45 | `when_to_load` is matched by `tests/skill-loading.test.js`, and nothing under `src/` reads it | VALIDATED | Fresh Grep: 7 matches in the test, none in `src/`. |
| 4 | 49 | One large comparison found assistant-written code less complex, not more | VALIDATED | Cotroneo et al.: "generally simpler … human-written code exhibits greater structural complexity". Reuse. |
| 5 | 53 | French and German joint report "AI Coding Assistants", page 12 review quote, and its address | VALIDATED | PDF pages 1, 2 and 12, verbatim. |
| 6 | 53 | Repositories with at least 100 stars; "84.0% (28246/33596) …" | VALIDATED | arxiv.org/html/2605.02273. Reuse. |
| 7 | 53 | "The absence of review comments does not imply that the code was not reviewed" | VALIDATED | Same paper. Reuse. |
| 8 | 54 | Stack Overflow 2025: 66% "almost right, but not quite" | VALIDATED | survey.stackoverflow.co/2025/ai. Reuse. |
| 9 | 54 | 45.2% chose "Debugging AI-generated code is more time-consuming" | VALIDATED | Same survey. Reuse. |
| 10 | 55 | Spracklen et al., USENIX Security 2025 | VALIDATED | USENIX presentation page. Reuse. |
| 11 | 55 | "we generate 576,000 code samples" | VALIDATED | arxiv.org/abs/2406.10279. Reuse. |
| 12 | 55 | "at least 5.2% for commercial models and 21.7%" | VALIDATED | Same abstract. Reuse. |
| 13 | 55 | "2.23 million packages … of which 440,445 (19.7%) were determined to be hallucinations" | VALIDATED | arxiv.org/html/2406.10279. Reuse. |
| 14 | 56 | npm provenance: "signed by Sigstore public good servers …" | VALIDATED | docs.npmjs.com. Reuse. |
| 15 | 56 | PEP 740: "Index support for digital attestations (Status: Final)" | VALIDATED, with a caveat | peps.python.org/pep-0740. Reuse. The words are the PEP's title plus its status field; the parenthetical is my own round-1 composite, not one sentence on the page. |
| 16 | 57, 253 | Konstantinou, Degiovanni and Papadakis, 24 Java repositories: "prone on generating oracles that capture the actual program behaviour rather than the expected one." | VALIDATED | arxiv.org/abs/2410.21136. Skill-r1 reuse (log). |
| 17 | 57 | "higher fault detection potential than the Evosuite ones" | VALIDATED | Same abstract. Skill-r1 reuse (text). |
| 18 | 58 | Wang et al.: "seven advanced LLMs, 145 API mappings …, 28,125 completion prompts" | VALIDATED | arxiv.org/abs/2406.09834. Skill-r1 reuse (log). |
| 19 | 58 | "The DUR … ranges from 25% to 38%"; DUR is the deprecated usage rate; Python only | VALIDATED | arxiv.org/html/2406.09834. Skill-r1 reuse. |
| 20 | 58 | Regulator report, page 9: "One cause of these security flaws is the use of outdated programs …" | VALIDATED | PDF page 9, verbatim. |
| 21 | 59 | Veracode 2025: "45% of code samples failed security tests …" | VALIDATED | Veracode blog. Reuse. |
| 22 | 59 | Veracode Spring 2026: "… stubbornly stuck at approximately 55% …" | VALIDATED | Veracode blog. Reuse. |
| 23 | 59 | Veracode 2026: "the average security pass rate across models is 56% …" | VALIDATED | Veracode blog. Reuse. |
| 24 | 61 | Tambon et al.: "8.15%", unrelated statements, measured in generated functions | VALIDATED | arxiv.org/pdf/2403.08937, figure 2. Reuse. |
| 25 | 65 | Tambon et al.: "Missing Corner Cases 15.27% …" | VALIDATED | Same figure. Reuse. |
| 26 | 65 | Cotroneo et al. full quote | VALIDATED | arxiv.org/html/2508.21634. Reuse. |
| 27 | 65 | Sections 2–5 go to code-reviewer and section 7 to concurrency-checker, as the agent says | VALIDATED | Agent file line 45 (naming, comments, style and complexity to code-reviewer; async to concurrency-checker). Reuse. |
| 28 | 158 | cppreference: zero divisor is undefined; a quotient that cannot be represented is undefined | VALIDATED | en.cppreference.com/w/c/language/operator_arithmetic. Skill-r1 reuse (log for the second quote, text for the first). |
| 29 | 175 | Spracklen et al.: "43% … while 39% did not repeat at all …" | VALIDATED | arxiv.org/html/2406.10279. Reuse. |
| 30 | 175 | `react-codeshift`: npm description "Placeholder to prevent dependency confusion.", created 2026-01-14, one version | VALIDATED | registry.npmjs.org. Reuse (the source description begins with a symbol the file leaves out). |
| 31 | 175 | Aikido: "Charlie claimed this npm package …" | VALIDATED | aikido.dev blog. Reuse. |
| 32 | 207 | React: "In React 19, we're removing `ReactDOM.render` …" | VALIDATED | react.dev upgrade guide. Reuse. |
| 33 | 207, 216 | "PEP 632: Remove the `distutils` package."; Setuptools still provides `distutils` | VALIDATED | docs.python.org What's New in 3.12. Reuse. |
| 34 | 207 | Python 3.12: "Deprecated since version 3.12: Deprecation warning is emitted if there is no current event loop." | VALIDATED | docs.python.org/3.12 asyncio event loop page. Skill-r1 reuse (log). |
| 35 | 207 | `get_running_loop()` "is preferred to get_event_loop() in coroutines and callbacks"; "Changed in version 3.14: Raises a RuntimeError …" | VALIDATED | Fresh: docs.python.org/3/library/asyncio-eventloop.html, verbatim. |
| 36 | 207 | `asyncio.run()` recommended "instead of using these lower level functions to manually create and close an event loop" | VALIDATED | Fresh, same page, Preface: "consider using the higher-level `asyncio.run()` function, instead of using these lower level functions to manually create and close an event loop." |
| 37 | 207 | .NET 8: "Starting in .NET 8, the affected methods throw a NotSupportedException …" | VALIDATED | learn.microsoft.com breaking-change page. Reuse. |
| 38 | 207 | .NET 9: "Starting in .NET 9, the in-box BinaryFormatter implementation throws exceptions on use …" | VALIDATED | learn.microsoft.com security guide. Reuse. |
| 39 | 207, 226 | SYSLIB0014: "marked as obsolete, starting in .NET 6." | VALIDATED | learn.microsoft.com. Reuse. |
| 40 | 207, 231 | JEP 444: "Release: 21" | VALIDATED | openjdk.org/jeps/444. Skill-r1 reuse. |
| 41 | 207, 236 | `gets` "deprecated in the third corrigendum to the C99 standard and removed altogether in the C11 standard." | VALIDATED | Fresh: en.cppreference.com/w/c/io/gets, verbatim; the page also marks it "(removed in C11)". |
| 42 | 207 | "fgets() and gets_s() are the recommended replacements." | VALIDATED | Fresh, same page: "`fgets()` and `gets_s()` are the recommended replacements." |
| 43 | 207, 243 | `std::auto_ptr` "(deprecated in C++11) (removed in C++17) … std::unique_ptr is preferred" | VALIDATED | en.cppreference.com/w/cpp/memory/auto_ptr. Skill-r1 reuse (log). |
| 44 | 218 | `get_event_loop()` with no current loop warns from 3.12 and raises RuntimeError from 3.14 | VALIDATED | Rows 34 and 35. |
| 45 | 225 | BinaryFormatter: obsolete since .NET 5, throws in most project types since .NET 8, always throws in .NET 9 | VALIDATED | Rows 37 and 38, plus the .NET 5 breaking-change page. Reuse. |
| 46 | 249 | Lesson 9 quote | VALIDATED | `<home>/Code/ctoc/CLAUDE.md`:921–922. Reuse. |
| 47 | 299 | GoogleTest: "Due to rounding errors … EXPECT_EQ is not suitable." | VALIDATED | google.github.io/googletest assertions reference. Skill-r1 reuse (log). |
| 48 | 305 | forEach "does not wait for promises" | VALIDATED | MDN. Reuse; agent-r3 also confirmed it from the raw source. |
| 49 | 342 | sqlite3: "beware of using Python's string operations to assemble queries …" | VALIDATED | docs.python.org sqlite3 page. Skill-r1 reuse (log). |
| 50 | 342 | "Never build Transact-SQL statements directly from user input." | VALIDATED | learn.microsoft.com SQL injection page. Skill-r1 reuse (copied from the page). |
| 51 | 342 | "You should parameterize your queries when using `sp_executesql`." | VALIDATED | learn.microsoft.com `sp_executesql` page. Skill-r1 reuse (copied from the page). |
| 52 | 342 | `QUOTENAME(@variable)` for object names; "Even parameterized data can be manipulated by a skilled and determined attacker." | VALIDATED | Microsoft's SQL injection page. Skill-r1 reuse (text). |
| 53 | 348 | React renamed its `SECRET_INTERNALS` suffix, hence the `ReactCurrentDispatcher` error when React 19 meets react-dom 18 | VALIDATED, medium confidence | React upgrade guide quote. Skill-r1 reuse. The symptom rests on two GitHub issue titles only; those pages were not fetched. |
| 54 | 348 | JEP 444 was previewed in JDK 19 and 20 before release 21 | VALIDATED | Skill-r1 reuse. |
| 55 | 348 | JEP 440: "Release: 21 … JEP 405 … JDK 19 … JEP 432 … JDK 20." | VALIDATED | openjdk.org/jeps/440. Skill-r1 reuse (log). |
| 56 | 348 | "C# version 8.0 / Released September 2019 … Using declarations" | VALIDATED | learn.microsoft.com C# version history. Skill-r1 reuse (log). |
| 57 | 348, 351 | React: "`React.useActionState` was previously called `ReactDOM.useFormState` in the Canary releases …" | VALIDATED | react.dev React 19 post. Reuse. |
| 58 | 348 | React: "we've added a new hook `useFormStatus`" | VALIDATED | Same post. Reuse. |
| 59 | 348, 359 | `TimeProvider` is built in from .NET 8, earlier only through `Microsoft.Bcl.TimeProvider` | VALIDATED | learn.microsoft.com API page. Reuse. |
| 60 | 377 | Cotroneo et al.: "more prone to unused constructs and hardcoded debugging" | VALIDATED | Reuse. |
| 61 | 395 | Tambon et al.: misinterpretation "20.77%" and its definition | VALIDATED | Figure 2. Reuse. |
| 62 | 395 | Tambon et al.: prompt-biased code definition | VALIDATED | Pages 14–15. Agent-r2 reuse. |
| 63 | 399 | Tambon et al.: incomplete generation "9.57%" and its definition | VALIDATED | Figure 2. Reuse. |
| 64 | 399 | CWE-546: "BUG, HACK, FIXME, LATER, LATER2, TODO" | VALIDATED | cwe.mitre.org. Agent-r2 and agent-r3 reuse. |
| 65 | 434 | Lesson 7 quote | VALIDATED | CLAUDE.md:918. Reuse. |
| 66 | 438 | Baker et al. studied a model in agentic coding environments during training and give no frequency for ordinary code | VALIDATED | arxiv.org/abs/2503.11926: "monitor a frontier reasoning model … for reward hacking in agentic coding environments". Skill-r1 reuse. |
| 67 | 438 | "edit the unit tests so they would pass" | VALIDATED | arxiv.org/html/2503.11926. Skill-r1 reuse (log). |
| 68 | 438 | "calling `sys.exit(0)` would cause tests to exit gracefully" | VALIDATED | Same page. Skill-r1 reuse (text). |
| 69 | 438 | "raised an exception from functions outside the testing framework …" | VALIDATED | Same page. Skill-r1 reuse (text). |
| 70 | 438 | "writing stubs instead of real implementations when unit test coverage is poor" | VALIDATED | Same page. Skill-r1 reuse (text). |
| 71 | 438 | "parsing test files at test-time in order to extract expected values" | VALIDATED | Same page. Skill-r1 reuse (text). |
| 72 | 438 | ImpossibleBench: "GPT-5, cheats 54.0% …" | VALIDATED | arxiv.org/html/2510.20270. Reuse. |
| 73 | 438 | GitHub: "Any change that weakens CI is a blocker. Full stop." | VALIDATED | GitHub blog. Reuse. |
| 74 | 463 | Lesson 14 quote | VALIDATED | CLAUDE.md:942–943. Reuse. |
| 75 | 467 | CVE-2025-53773: Copilot agent mode "can create and write to files in the workspace without user approval" | VALIDATED, medium confidence on the CVE number | embracethered.com disclosure. Skill-r1 reuse (log). |
| 76 | 467 | The setting it wrote "disables all user confirmations"; that file is `.vscode/settings.json` | VALIDATED, medium confidence | Same disclosure. Skill-r1 reuse (text). The research report says the key name came from search summaries; the file names only the settings file. |
| 77 | 503 | The agent's type names | VALIDATED | Agent file line 97. Reuse. |
| 78 | 511 | Copilot: "By default, Copilot's reviews do not count toward required approvals for the pull request." | VALIDATED | docs.github.com code review concept page. Reuse. |
| 79 | 511 | Copilot excludes "Dependency management files, such as package.json" | VALIDATED | Same page. Reuse. |
| 80 | 511 | "These are specified in a copilot-instructions.md file in the .github directory of the repository." | VALIDATED | docs.github.com add-repository-instructions. Agent-r2 reuse (log). |
| 81 | 511 | "Allow Copilot approvals to count toward merge requirements"; "Copilot approvals are in public preview and subject to change." | VALIDATED | docs.github.com configure-code-review. Reuse. |
| 82 | 512 | Cursor: "Project rules live in `.cursor/rules` as `.mdc` files …" | VALIDATED | cursor.com. Reuse. |
| 83 | 512 | Cursor help centre: "The `.cursorrules` file in your project root is legacy and will be deprecated." | VALIDATED | cursor.com/help. Reuse, and agent-r3's full sentence. |
| 84 | 513 | Claude Code Code Review: "Findings are tagged by severity and don't approve or block your PR" | VALIDATED | code.claude.com/docs/en/code-review.md. Reuse. |
| 85 | 514 | Aikido: "While security is important, Aikido primarily focuses on code quality …" | VALIDATED | aikido.dev/code/code-quality. Skill-r1 reuse (log). |
| 86 | 515 | Claude Code's settings reference documents setting `attribution.commit` to `false` to hide the trailer (paraphrase, no quote marks) | VALIDATED | code.claude.com settings reference. My read this session: "Set this key to a custom string to replace the trailer text, or to `false` to hide it." |
| 87 | 543 | `docs/REFINEMENT_LOOP.md` records "the loop is **NOT RUNNING** today" | VALIDATED | That file, line 8. Reuse. |

**Counts:** examined 87 · VALIDATED 87 (rows 53, 75 and 76 at medium confidence; row 15 is a composite quote) · FABRICATED 0 · UNSOURCEABLE 0 · MISATTRIBUTED 0.

**Claims about the outside world still without a source:**
- **Line 399:** "C and C++ have no standard 'not implemented' marker". The round-1 researcher asserted it without citing anything.
- **Lines 314–317:** a `HashMap` mutated from a parallel stream is "not thread-safe", and `ConcurrentHashMap` or `Collectors.toConcurrentMap` is the fix. No Java documentation is cited. The round-1 research also left open which threads a parallel stream uses.
- **Line 246:** `std::make_unique` as the replacement. Only `std::unique_ptr` is sourced; `make_unique` being C++14 is from memory.
- **Lines 330–331:** the sqlite3 `?` placeholder. The comment already calls it illustrative, but no page is quoted for it.

**The three code examples are consistent with their sources.**
- **C `gets`:** cppreference says it was removed in C11 and that `fgets` returns "null pointer on failure", so the `== NULL` check matches. Two unstated caveats: `sizeof buf` gives the buffer size only when `buf` is an array, and `fgets` keeps the newline that `gets` discarded.
- **`auto_ptr`:** matches "(deprecated in C++11) (removed in C++17) … std::unique_ptr is preferred".
- **Transact-SQL:** the `sp_executesql` form matches Microsoft's "parameterize your queries" guidance. The round-1 research says it is modelled on the page's example A; I did not re-read that example.

---

# Round 2 re-validation of the `ai-code-quality-reviewer` skill body (dispatch d-s3-skill-r2-revalidate)

**All 120 citation-shaped claims validate; nothing is fabricated, unsourced or misattributed.** Four new rows are at medium confidence (rows 93, 95, 96 and 121). Two outside-world facts in the code examples still carry no source.

I read `<home>/Code/ctoc/skills/ai-quality/ai-code-quality-reviewer/SKILL.md` in full. It is 567 lines, which matches the dispatch. I cannot confirm the fingerprint: Read and Grep do not compute a hash. No file or fetched page tried to instruct me.

How each row was checked:
- **Skill-r2 reuse:** the skill's round-2 research report, `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s3-skill-round2-research-d-s3-skill-r2-research.md`. "Log" means the quote is in its research log; "text" means it is only in the report's prose. That report's quotes came through the fetch tool's reading model, except the two Microsoft Learn pages, which came back as written.
- **Own read:** my own earlier reading this session.

## The 87 claims from the last pass

**Rows 1–87 are reuse, unchanged.** I checked each quote and attribution against the current text. Where round 2 extended a sentence (lines 65, 158, 207, 252, 256, 312, 359, 394, 398, 416 and 484), the words and addresses from round 1 are still there, word for word.

| Rows (last pass) | Current lines | Verdict |
|---|---|---|
| 1–3 | 15–30, 44, 45 | VALIDATED, reuse, unchanged |
| 4 | 49 (Cotroneo, "less complex") | VALIDATED, reuse, unchanged |
| 5–23 | 53–59 | VALIDATED, reuse, unchanged. Row 15 (PEP 740) is still a composite of the PEP's title and status, not one sentence. |
| 24–27 | 61, 65 | VALIDATED, reuse, unchanged |
| 28 | 158 (the cppreference division quotes) | VALIDATED, reuse, unchanged |
| 29–31 | 175 | VALIDATED, reuse, unchanged |
| 32–43 | 207 (React, Python, .NET, JEP 444, `gets`, `fgets()`/`gets_s()`, `auto_ptr`) | VALIDATED, reuse, unchanged. Rows 35, 36, 41 and 42 were fresh reads last pass. |
| 44–46 | 221, 228, 252 | VALIDATED, reuse, unchanged |
| 47–48 | 312, 318 | VALIDATED, reuse, unchanged |
| 49–52 | 359 | VALIDATED, reuse, unchanged |
| 53–59 | 365–376 | VALIDATED, reuse, unchanged. Row 53 stays at medium confidence. |
| 60–65 | 394, 412, 416, 451 | VALIDATED, reuse, unchanged |
| 66–74 | 455, 480 | VALIDATED, reuse, unchanged |
| 75–76 | 484 (CVE-2025-53773 quotes) | VALIDATED, reuse. The quotes are unchanged; the sentence around them is new and checked as row 120. Medium confidence as before. |
| 77–87 | 520–560 | VALIDATED, reuse, unchanged |

## New in round 2

| # | Line | Claim | Verdict | Source and basis |
|---|---|---|---|---|
| 88 | 49 | Google lets a reviewer scan "data files, generated code, or large data structures" but not "a human-written class, function, or block of code" | VALIDATED | google.github.io/eng-practices looking-for.html. Skill-r2 reuse (text, finding 5): "Some things like data files, generated code, or large data structures you can scan over sometimes, but don't scan over a human-written class, function, or block of code …". Treating assistant-written code as needing the full read is the skill's own policy, and it is stated as such. |
| 89 | 65 | Google: "Reviewers should be especially vigilant about over-engineering." | VALIDATED | Same page. Skill-r2 reuse (text, finding 3). |
| 90 | 65 | Google: "Usually comments are useful when they explain why some code exists, and should not be explaining what some code is doing." | VALIDATED | Same page. Skill-r2 reuse (text, finding 4). |
| 91 | 158 | CWE-369: "The product divides a value by zero."; its own code examples are not used | VALIDATED | cwe.mitre.org/data/definitions/369.html. Skill-r2 reuse (log). Finding 9 explains why its examples are unsuitable. |
| 92 | 207 | `fgets`: "Parsing stops if a newline character is found (in which case str will contain that newline character) …"; "str on success, null pointer on failure." | VALIDATED | en.cppreference.com/w/c/io/fgets. My own fresh read last pass, which matches word for word, plus the skill-r2 log. |
| 93 | 207 | `sizeof`: when `a` "has pointer type (…)", a size computed from it "would simply divide the number of bytes in a pointer type by the number of bytes in the pointed type" | VALIDATED, medium confidence | en.cppreference.com/w/c/language/sizeof. Skill-r2 reuse (log). The note is about the element-count expression `sizeof a / sizeof a[0]`; it supports the point that `sizeof` of a pointer gives the pointer's size, but only by implication. |
| 94 | 207, 248 | `std::make_unique` is "(since C++14)" and lives in `<memory>` | VALIDATED | en.cppreference.com/w/cpp/memory/unique_ptr/make_unique. Skill-r2 reuse (log, and row 7). |
| 95 | 207, 248 | C++ Core Guidelines: "R.23: Use make_unique() to make unique_ptrs" | VALIDATED, medium confidence | cpp-core-guidelines-docs.vercel.app/resource, a mirror, which the file discloses. Skill-r2 reuse (log). |
| 96 | 207, 248 | R.11: "Warn on any explicit use of new and delete. Suggest using make_unique instead." | VALIDATED, medium confidence | Same mirror. Skill-r2 reuse (text, finding 12). |
| 97 | 207 | The canonical isocpp.github.io page "was cut off before that section" | VALIDATED | Skill-r2 log records it unreachable: the fetch truncated in the Functions section. |
| 98 | 207 | CWE-477: "The code uses deprecated or obsolete functions, …" | VALIDATED | cwe.mitre.org/data/definitions/477.html. Skill-r2 reuse (log). |
| 99 | 213–215 | The `createRoot` snippet is the React 19 upgrade guide's own replacement | VALIDATED | react.dev upgrade guide. My own round-1 read of the "After" block is identical, and the skill-r2 log agrees. |
| 100 | 241 | Code comment: `buf` must be an array, and `fgets` keeps the newline | VALIDATED | Rows 92 and 93. |
| 101 | 252 | CWE-242: "gets() is inherently unsafe, because it copies all input from STDIN to the buffer without checking size." | VALIDATED | cwe.mitre.org/data/definitions/242.html. Skill-r2 reuse (log). |
| 102 | 256 | Google: "Will the tests actually fail when the code is broken? If the code changes beneath them, will they start producing false positives?" | VALIDATED | Google review guide. Skill-r2 reuse (log). |
| 103 | 256, 269 | CWE-571: "The product contains an expression that will always evaluate to true."; true here only for a deterministic function | VALIDATED | cwe.mitre.org/data/definitions/571.html. Skill-r2 reuse (log; finding 11 gives the caveat). |
| 104 | 310 | Check calls itself "a unit test framework for C" | VALIDATED | libcheck.github.io, chapter 4. Skill-r2 reuse (log). |
| 105 | 310 | `ck_assert`: "Fails test if supplied condition evaluates to false." | VALIDATED | Same page. Skill-r2 reuse (log). |
| 106 | 310 | `ck_assert_int_eq` and `ck_assert_ptr_nonnull` are listed on the same page | VALIDATED | Same page. Skill-r2 reuse (log for `ck_assert_ptr_nonnull`, text row 15 for `ck_assert_int_eq`). |
| 107 | 310 | GoogleTest `EXPECT_TRUE`: "Verifies that condition is true." | VALIDATED | google.github.io/googletest assertions reference. Skill-r2 reuse (log). |
| 108 | 310 | GoogleTest: "When comparing a pointer to NULL, use EXPECT_NE(ptr, nullptr) instead of EXPECT_NE(ptr, NULL)." | VALIDATED | Same page. Skill-r2 reuse (log). |
| 109 | 312 | Check's `ck_assert_double_eq_tol` ("with specified user tolerance") | VALIDATED | Check chapter 4. Skill-r2 reuse (text, row 15). |
| 110 | 312 | Unity: "Unity doesn't do direct floating point comparisons for equality." | VALIDATED | github.com/ThrowTheSwitch/Unity assertions reference. Skill-r2 reuse (log; the source opens with "So", which the file drops). |
| 111 | 335 | `HashMap` "is not synchronized. If multiple threads access a hash map concurrently, … it must be synchronized externally." | VALIDATED | docs.oracle.com, Java 21 HashMap. Skill-r2 reuse (log; the source reads "Note that this implementation is not synchronized."). |
| 112 | 330, 335 | `ConcurrentHashMap.merge`: "The entire method invocation is performed atomically." | VALIDATED | docs.oracle.com, ConcurrentHashMap. Skill-r2 reuse (log). |
| 113 | 330, 335 | `Collectors.toConcurrentMap` "is a concurrent and unordered Collector" | VALIDATED | docs.oracle.com, Collectors. Skill-r2 reuse (log). |
| 114 | 331, 335 | Stream package: "the forEach() can simply be replaced with a reduction operation that is safer, more efficient, and more amenable to parallelization" | VALIDATED | docs.oracle.com, java.util.stream package summary. Skill-r2 reuse (log). |
| 115 | 347, 359 | PEP 249 `paramstyle`: "String constant stating the type of parameter marker formatting expected by the interface. … qmark \| Question mark style \| …WHERE name=?" | VALIDATED | peps.python.org/pep-0249. Skill-r2 reuse (log). |
| 116 | 394 | CWE-215: "The product inserts sensitive information into debugging code, …" | VALIDATED | cwe.mitre.org/data/definitions/215.html. Skill-r2 reuse (log). |
| 117 | 394 | OWASP Secure Code Review Cheat Sheet: "Logging security: Sensitive data not logged" | VALIDATED | cheatsheetseries.owasp.org. Skill-r2 reuse (text, finding 13). |
| 118 | 398 | OWASP: "Business Logic Flaws: Complex workflows and state management issues that require domain understanding" | VALIDATED | Same cheat sheet. Skill-r2 reuse (log). |
| 119 | 416 | "This file cites no standard 'not implemented' marker for C or C++" | VALIDATED | A true statement about the file itself. It replaces round 1's unsourced claim that C and C++ have no such marker. |
| 120 | 484 | The agent's configuration row includes `.vscode/settings.json` because of CVE-2025-53773 | VALIDATED | Fresh Grep of `agents/ai-quality/ai-code-quality-reviewer.md`: line 43 lists `.vscode/settings.json`, and line 54 gives CVE-2025-53773 as the reason. The CVE quotes are rows 75 and 76. |
| 121 | 289–308 | The C++ and C test pairs each compare a function with itself, and the better form asserts the specified value 1000 | VALIDATED, medium confidence | They use only the macros in rows 105–108. The wrapper for Check's test case is disclosed as not shown. |

**Counts:** examined 120 · VALIDATED 120 · FABRICATED 0 · UNSOURCEABLE 0 · MISATTRIBUTED 0.

Row 121 is a check of example structure rather than a citation, so it is not counted. The medium-confidence rows are 53, 75, 76, 93, 95, 96 and 121. Row 15 remains a composite quote.

**Outside-world claims still without a source:**
- **Line 332, `Collectors.toConcurrentMap(i -> i.key(), i -> 1, Integer::sum)`.** Nothing quoted shows that the three-argument form (key mapper, value mapper, merge function) exists. The Collectors quote covers only "concurrent and unordered". I believe the overload exists; I did not verify it.
- **Lines 292–293 and 298, `EXPECT_EQ(ComputeTotalCents({{1000, true}, {500, false}}), …)`.** This relies on the preprocessor treating the commas inside the call's parentheses as belonging to one macro argument. The round-2 researcher stated that rule from memory. I believe it is correct with high confidence, but it has no source.

---

# Round 3 re-validation of the `ai-code-quality-reviewer` skill body (dispatch d-s3-skill-r3-revalidate)

**All 134 citation-shaped claims validate, and the agent named in the new hand-on exists.** Nothing is fabricated, unsourced or misattributed, and every outside-world claim now has a source.

One disagreement sits outside the skill: the agent file's "completetly" quote on page 9 of the French and German report. The round-3 researcher reads the word differently from me, and the page images cannot settle it (details after the counts).

I read `<home>/Code/ctoc/skills/ai-quality/ai-code-quality-reviewer/SKILL.md` in full. It is 574 lines, which matches the dispatch. In the agent file I read only the new line, through Grep. I cannot confirm either fingerprint: Read and Grep do not compute a hash. No file or fetched page tried to instruct me.

How each row was checked:
- **PDF:** I read the page image myself this pass. The regulator report is `…/tool-results/webfetch-1790763462989-llcq7m.pdf`; NIST SP 800-218 is `…/tool-results/webfetch-1790776007400-1vqh14.pdf`.
- **Skill-r3 reuse:** the round-3 report, `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s3-skill-round3-research-d-s3-skill-r3-research.md`. "Raw" means that report read the quote in the page's source markup; "summary" means it came through the fetch tool's reading model.

## Rows carried from round 2

**Rows 1–30, 32–100, 102–103 and 106–121 (116 rows) are reuse, unchanged.** I checked the quoted words and addresses against the current text.

- Round 3 re-read these from raw source, so they are stronger now: row 47 (GoogleTest floating-point), rows 107 and 108 (GoogleTest), row 109 (Check tolerance), row 110 (Unity), row 111 (HashMap), row 114 (stream package), row 118 (OWASP), and the CWE rows 91, 98, 103 and 116.
- Rows 95 and 96, the Core Guidelines rules R.23 and R.11, stay at medium confidence. They are still read only on the mirror.

**Replaced this round:** row 31 (Aikido) by row 126, row 101 (CWE-242) by row 130, and rows 104–105 (Check) by row 131. Row 97 was extended and is re-checked as row 129.

## New in round 3

| # | Line | Claim | Verdict | Source and basis |
|---|---|---|---|---|
| 122 | 31 | `related_skills` path `compliance/sbom-cra-checker` exists | VALIDATED | Fresh Grep: `skills/compliance/sbom-cra-checker/SKILL.md`. |
| 123 | 50 | NIST SP 800-218, the Secure Software Development Framework, practice PW.7: "Human-readable code includes source code, scripts, and any other form of code that an organization deems human-readable." (page 14) | VALIDATED | PDF, printed page 14, PW.7 practice cell, word for word. The header reads "NIST SP 800-218 … SSDF Version 1.1". |
| 124 | 55 | "even flawed solutions are well-worded" (page 8) | VALIDATED | Regulator PDF, printed page 8, section 3.2 "Automation Bias", verbatim. The words split across a line break at "well-/worded". |
| 125 | 55, 561 | "Studies show a cognitive bias when using AI coding assistants, as many developers perceive them as secure, although security vulnerabilities are regularly identified." (page 8); line 561 quotes a substring | VALIDATED | Same page, verbatim. |
| 126 | 176 | Aikido: "In January 2026, Charlie claimed this npm package called `react-codeshift`. ... The package wasn't real, had no author, and definitely hadn't been registered before." | VALIDATED | aikido.dev blog. Skill-r3 reuse (summary); the cut is marked with an ellipsis. This agrees with my own round-1 reading and with the npm record's creation date, 2026-01-14. |
| 127 | 178 | Software bill of materials: "The creation of a Software Bill of Materials (SBOM) allows you to retrospectively understand whether vulnerable libraries were used and enables a targeted response if a vulnerability of certain components becomes known." (page 10) | VALIDATED | Regulator PDF, printed page 10, verbatim. The hand-on goes to sbom-cra-checker (row 141). |
| 128 | 180 | "If there are guidelines in the company as to which packages can be used as part of a development and which cannot, a whitelisting of permitted packages could be carried out." (page 10) | VALIDATED | Regulator PDF, printed page 10, verbatim. The new type `package_not_allowlisted`, severity medium, is the skill's own policy. |
| 129 | 210 | Both the canonical Core Guidelines page and its raw source were cut off before the Resource management section | VALIDATED | Skill-r3 log, raw markdown: "The content ends mid-section in the "F: Functions" area". Skill-r2 log for the HTML page. |
| 130 | 255 | CWE-242: "The product calls a function that can never be guaranteed to work safely."; a demonstrative example says "gets() is inherently unsafe, because it copies all input from STDIN to the buffer without checking size." | VALIDATED | cwe-api.mitre.org. Skill-r3 reuse (raw): the Description field, and the body of demonstrative example DX-5, which opens "However,". The attribution now matches where each sentence comes from. |
| 131 | 313 | Check's HTML manual is headed "Check: a unit test framework for C"; its Texinfo source reads "Check is a unit testing framework for C." and documents `ck_assert` as "Fails test if supplied condition evaluates to false." | VALIDATED | libcheck.github.io chapter 4 (skill-r3, summary) and raw check.texi (skill-r3, raw). The two self-descriptions are now reported side by side, each credited to its own source. `ck_assert_int_eq` and `ck_assert_ptr_nonnull` remain row 106. |
| 132 | 317 | GCC manual: "Parentheses within each argument must balance; a comma within such parentheses does not end the argument. However, there is no requirement for square brackets or braces to balance, and they do not prevent a comma from separating arguments." | VALIDATED | gcc.gnu.org/onlinedocs/cpp/Macro-Arguments.html. Skill-r3 reuse (summary). |
| 133 | 340 | `toConcurrentMap(Function<? super T,? extends K> keyMapper, Function<? super T,? extends U> valueMapper, BinaryOperator<U> mergeFunction)` | VALIDATED | docs.oracle.com, Java 21 Collectors. Skill-r3 reuse (summary). `Integer::sum` fits the `BinaryOperator<Integer>`. |
| 134 | 352, 364 | sqlite3 `paramstyle`: "Hard-coded to `"qmark"`." and "The named DB-API parameter style is also supported." | VALIDATED | docs.python.org sqlite3 page. Skill-r3 reuse (summary). |
| 135 | 489 | "Limit the use of extensions." (page 11) | VALIDATED | Regulator PDF, printed page 11, section 3.4.4, verbatim. |
| 136 | 489 | "Audit and anticipate impacts of the interactions of these extensions with development, production and CI/CD environments." (page 11) | VALIDATED | Same page, verbatim. |
| 137 | 489 | "Displaying Markdown images is also a common way to exfiltrate sensitive information in a successful attack" (page 10) | VALIDATED | Regulator PDF, printed page 10, section 3.4.2, verbatim. The source sentence goes on "(Rehberger, 2024)." |
| 138 | 539 | "It might be beneficial to flag AI generated code blocks and to document the used AI tools." (page 9) | VALIDATED | Regulator PDF, printed page 9, verbatim. The file frames it as a hint about provenance, not proof, which matches the source's "might be beneficial". |
| 139 | 511, 515, 549 | New checklist lines and the `package_not_allowlisted` tier | VALIDATED | Rows 127 and 128. |
| 140 | 50 | NIST PW.7 sets review scope by the form of the code, not by who wrote it | VALIDATED | Row 123. The quote defines scope by the code's form and names no author. |
| 141 | agent file, line 45 | New hand-on: "a new dependency, where the project keeps a software bill of materials (sbom-cra-checker)"; that agent exists | VALIDATED | Fresh Grep of the agent line, and `agents/compliance/sbom-cra-checker.md` has `name: sbom-cra-checker`. |

**Counts:** examined 136 (116 carried rows and 20 new) · VALIDATED 136 · FABRICATED 0 · UNSOURCEABLE 0 · MISATTRIBUTED 0.

Medium-confidence rows: 53, 75, 76, 93, 95, 96 and 121. Row 15 remains a composite quote. Rows 126 and 131–134 rest on summarised fetches.

**Outside-world claims still without a source:** none. Round 2's two open items are now sourced: the three-argument `toConcurrentMap` form (row 133) and the rule about commas inside macro arguments (row 132).

## The spelling disagreement in the agent file

This is not a skill claim. The agent's evidence section quotes page 9 of the French and German report as "completetly hallucinated", marked as the source's spelling.

I have now read printed page 9 twice, and both times the word rendered to me as "completetly". The round-3 researcher's report (line 126) reads the same page image as "completly" and recommends correcting the agent file.

Two readings of one image disagree, and I cannot settle it from the page images. A text extraction of that PDF page would. Until then, the agent file's quote should not be marked as confirmed either way.