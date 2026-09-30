# Round 1 web research and claim validation for skills/ai-quality/ai-code-quality-reviewer/SKILL.md (dispatch d-s3-skill-r1-research, citation-validator, installed plugin 6.14.65, 2026-09-30)

# Round 1 research and claim check: `skills/ai-quality/ai-code-quality-reviewer/SKILL.md` (dispatch d-s3-skill-r1-research, 2026-09-30)

I examined 54 attributed claims in the skill: 24 hold up, 5 are fabricated, 19 have no source I could find, and 6 name the wrong version, product name or source.

- **Newly fabricated (2):**
  - Line 419, the "Claude Code self-critique" row. Your own `docs/REFINEMENT_LOOP.md` line 8 says "the loop is **NOT RUNNING** today".
  - Line 422, "Veracode AI Audit". Neither a general search nor a search limited to veracode.com found a product by that name.
- **Wrong version or name (3 new):**
  - Line 195: `asyncio.get_event_loop()`. The Python documentation says `get_running_loop()` is "preferred", not required, and the hard error only arrives in Python 3.14.
  - Line 289: record patterns. They are final only from Java 21; the file says Java 16.
  - Line 421: Aikido's own name for the product is "Aikido Code Quality".
- **No source (new):** line 474 names no "2026 incident data", and line 51 names no study.
- **New sources the agent file does not have yet.** Stale framework idioms and vacuous tests now each have an original paper behind them (Wang and colleagues, ICSE 2025; Konstantinou and colleagues). The agent's evidence section currently says neither class has a measurement.

I spent 30 of the 30 tool calls. No file and no fetched page tried to give me instructions.

## 1. Research log

```json
{
  "research_log": {
    "queries": [
      { "text": "\"reading 'ReactCurrentDispatcher'\" React 19 react-dom 18 mismatch github issue", "source_class": "broad web", "repeated_because": null },
      { "text": "Aikido Security \"AI Code Review\" product pull request", "source_class": "broad web", "repeated_because": null },
      { "text": "Veracode \"AI Audit\" product", "source_class": "broad web", "repeated_because": null },
      { "text": "Veracode AI-generated code product audit compliance (restricted to veracode.com)", "source_class": "vendor documentation", "repeated_because": null },
      { "text": "CVE-2025-53773 GitHub Copilot \".vscode/settings.json\" \"chat.tools.autoApprove\" prompt injection", "source_class": "broad web", "repeated_because": null }
    ],
    "sources": [
      { "url": "https://docs.python.org/3.12/library/asyncio-eventloop.html", "read_on": "2026-09-30", "bore_on": "skill line 195 (3.12 deprecation)", "outcome": "supported", "quote": "Deprecated since version 3.12: Deprecation warning is emitted if there is no current event loop. In some future Python release this will become an error.", "error": null },
      { "url": "https://docs.python.org/3/library/asyncio-eventloop.html", "read_on": "2026-09-30", "bore_on": "skill line 195 ('get_running_loop() is required')", "outcome": "refuted", "quote": "using the get_running_loop() function is preferred to get_event_loop() in coroutines and callbacks. ... Changed in version 3.14: Raises a RuntimeError if there is no current event loop.", "error": null },
      { "url": "https://react.dev/blog/2024/04/25/react-19-upgrade-guide", "read_on": "2026-09-30", "bore_on": "skill line 289 (ReactCurrentDispatcher mechanism)", "outcome": "supported", "quote": "we have renamed the `SECRET_INTERNALS` suffix to: `_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE`", "error": null },
      { "url": "https://react.dev/blog/2024/04/25/react-19-upgrade-guide", "read_on": "2026-09-30", "bore_on": "skill lines 187-188 (legacy lifecycles as a React 18-to-19 idiom)", "outcome": "did-not-bear", "quote": null, "error": null },
      { "url": "https://github.com/vercel/ai/issues/8518", "read_on": "2026-09-30", "bore_on": "skill line 289 symptom (title seen in search results only; page not fetched)", "outcome": "supported", "quote": "React test suite fails: React 19 RC + react-dom 18.3.1 mismatch", "error": null },
      { "url": "https://github.com/metabase/metabase/issues/51435", "read_on": "2026-09-30", "bore_on": "skill line 289 symptom (title seen in search results only; page not fetched)", "outcome": "supported", "quote": "`Cannot read properties of undefined (reading 'ReactCurrentDis...", "error": null },
      { "url": "https://openjdk.org/jeps/440", "read_on": "2026-09-30", "bore_on": "skill line 289 (Java 16 as the record-pattern boundary)", "outcome": "refuted", "quote": "Release: 21 ... Record patterns were initially proposed as a preview feature by JEP 405 and delivered in JDK 19. They received a second preview through JEP 432, which was delivered in JDK 20.", "error": null },
      { "url": "https://openjdk.org/jeps/444", "read_on": "2026-09-30", "bore_on": "skill lines 207 and 289 (Thread.ofVirtual, Java 17)", "outcome": "supported", "quote": "Release: 21 ... Thread thread = Thread.ofVirtual().name(\"duke\").unstarted(runnable);", "error": null },
      { "url": "https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/csharp-version-history", "read_on": "2026-09-30", "bore_on": "skill line 289 (using declarations, C# 7)", "outcome": "supported", "quote": "C# version 8.0 / Released September 2019 ... [Using declarations](../language-reference/statements/using)", "error": null },
      { "url": "https://www.aikido.dev/code/code-quality", "read_on": "2026-09-30", "bore_on": "skill line 421 (product name and role)", "outcome": "refuted", "quote": "While security is important, Aikido primarily focuses on code quality to improve overall software health.", "error": null },
      { "url": "https://arxiv.org/abs/2406.09834", "read_on": "2026-09-30", "bore_on": "skill line 49 (models emit deprecated interfaces); Part 2 finding 5", "outcome": "supported", "quote": "seven advanced LLMs, 145 API mappings from eight popular Python libraries, and 28,125 completion prompts", "error": null },
      { "url": "https://arxiv.org/html/2406.09834", "read_on": "2026-09-30", "bore_on": "skill line 49; Part 2 finding 5", "outcome": "supported", "quote": "The DUR of the LLMs for the overall dataset ranges from 25% to 38%", "error": null },
      { "url": "https://arxiv.org/abs/2410.21136", "read_on": "2026-09-30", "bore_on": "skill line 48 (tests encode the implementation); Part 2 finding 6", "outcome": "supported", "quote": "LLM-based test generation approaches are also prone on generating oracles that capture the actual program behaviour rather than the expected one.", "error": null },
      { "url": "https://en.cppreference.com/w/c/io/gets", "read_on": "2026-09-30", "bore_on": "Part 2 finding 1 (C stale idiom)", "outcome": "supported", "quote": "the function has been deprecated in the third corrigendum to the C99 standard and removed altogether in the C11 standard.", "error": null },
      { "url": "https://en.cppreference.com/w/cpp/memory/auto_ptr", "read_on": "2026-09-30", "bore_on": "Part 2 finding 1 (C++ stale idiom)", "outcome": "supported", "quote": "(deprecated in C++11) (removed in C++17) ... std::unique_ptr is preferred for this and other uses.", "error": null },
      { "url": "https://en.cppreference.com/w/c/language/operator_arithmetic", "read_on": "2026-09-30", "bore_on": "Part 2 finding 1 (C missing edge case)", "outcome": "supported", "quote": "If the quotient a/b is not representable in the result type, the behavior of both a/b and a%b is undefined (that means INT_MIN%-1 is undefined on 2's complement systems)", "error": null },
      { "url": "https://google.github.io/googletest/reference/assertions.html", "read_on": "2026-09-30", "bore_on": "Part 2 findings 1 and 7 (C++ vacuous test; float equality)", "outcome": "supported", "quote": "Due to rounding errors, it is very unlikely that two floating-point values will match exactly, so EXPECT_EQ is not suitable.", "error": null },
      { "url": "https://arxiv.org/abs/2503.11926", "read_on": "2026-09-30", "bore_on": "Part 2 finding 2 (tests changed to pass)", "outcome": "did-not-bear", "quote": "We show that we can monitor a frontier reasoning model, such as OpenAI o3-mini, for reward hacking in agentic coding environments", "error": null },
      { "url": "https://arxiv.org/html/2503.11926", "read_on": "2026-09-30", "bore_on": "Part 2 finding 2 (tests changed to pass)", "outcome": "supported", "quote": "edit the unit tests so they would pass", "error": null },
      { "url": "https://embracethered.com/blog/posts/2025/github-copilot-remote-code-execution-via-prompt-injection/", "read_on": "2026-09-30", "bore_on": "Part 2 finding 3 (coding-assistant configuration)", "outcome": "supported", "quote": "it can create and write to files in the workspace without user approval.", "error": null },
      { "url": "https://learn.microsoft.com/en-us/sql/relational-databases/security/sql-injection", "read_on": "2026-09-30", "bore_on": "skill lines 274 and 280; Part 2 finding 4", "outcome": "supported", "quote": "Never build Transact-SQL statements directly from user input.", "error": null },
      { "url": "https://learn.microsoft.com/en-us/sql/relational-databases/system-stored-procedures/sp-executesql-transact-sql", "read_on": "2026-09-30", "bore_on": "skill line 280; Part 2 finding 4", "outcome": "supported", "quote": "You should parameterize your queries when using `sp_executesql`.", "error": null },
      { "url": "https://docs.python.org/3/library/sqlite3.html", "read_on": "2026-09-30", "bore_on": "skill line 274; Part 2 finding 4", "outcome": "supported", "quote": "beware of using Python's string operations to assemble queries, as they are vulnerable to SQL injection attacks.", "error": null }
    ]
  }
}
```

Where the quotes come from:
- **Copied from the page as returned:** the three Microsoft Learn pages.
- **Seen as search-result titles only:** the two GitHub issue titles. Those pages were not fetched.
- **Through the fetch tool's summarising model:** every other quote.

The two Veracode searches returned no product page to read. The research log therefore lists no Veracode source.

## 2. Verdict for each claim

Severity follows the verdict: fabricated is critical, misattributed and unsourceable are high, validated is info.

**Rows reused from round 1** (`s3-agent-round1-research-d-s3-agent-r1-research.md`, rows 11–34):

| # | Skill line | Claim | Verdict | Evidence | Recommended action |
|---|---|---|---|---|---|
| 11 | 44 | 84% of agent pull requests got no human review, arXiv 2605.02273 | VALIDATED (reuse) | "84.0% (28246/33596) ... either receive no recorded review or are reviewed exclusively by agents" | keep; say "no recorded review" |
| 12 | 45 | 66% name "almost right, but not quite" as their top frustration | VALIDATED (reuse) | Stack Overflow 2025 survey | keep |
| 13 | 45 | 45.2% say debugging AI code takes more time | VALIDATED (reuse) | same survey | keep |
| 14 | 46 | Spracklen and colleagues, USENIX Security 2025 | VALIDATED (reuse) | USENIX presentation page | keep |
| 15 | 46 | 5.2% commercial, 21.7% open-source | VALIDATED (reuse) | abstract, word for word | keep |
| 16 | 46 | 576,000 samples | VALIDATED (reuse) | paper | keep |
| 17 | 46 | 440,445 of 2.23 million (19.7%) | VALIDATED (reuse) | paper | keep |
| 18 | 46, 150 | 43% of hallucinated names recur on all ten runs | VALIDATED (reuse) | paper; the file leaves out that "39% did not repeat at all" | keep |
| 19 | 47 | npm provenance and PEP 740 exist as described | VALIDATED (reuse) | npm docs; PEP 740 has status Final | keep |
| 20 | 47 | Attestations "are now table stakes" | UNSOURCEABLE (reuse) | no adoption measurement could be read | strip-the-specificity |
| 21 | 50 | Veracode 2025: 45% of samples introduced an OWASP Top 10 flaw | VALIDATED (reuse) | Veracode blog, 30 July 2025 | keep |
| 22 | 50 | "flat since 2024", credited to the 2025 report | MISATTRIBUTED (reuse) | the 2025 "flat" is across models, not over time | correct-to: "Veracode's 2025 report measured that 45% of code samples introduced an OWASP Top 10 flaw; its Spring 2026 Update found pass rates 'stuck at approximately 55%', and its 2026 report (28 July 2026) measured a 56% average pass rate." |
| 23 | hallucination-detector 57, compared with skill 50 | "tests" versus "samples" as the unit | VALIDATED (reuse) | Veracode's own wording is "code samples" | keep; use "code samples" |
| 24 | 150 | `react-codeshift` is a defensive placeholder from January 2026 | VALIDATED (reuse) | npm registry record and Aikido's blog | keep |
| 25 | 418 | "GitHub Copilot review filters" (AI-author flag, auto-tagging, pattern blocking) | FABRICATED (reuse) | none of these is documented; Copilot review excludes "Dependency management files, such as package.json" | correct-to the round-1 text: comment reviews by default, steered by `.github/copilot-instructions.md` and `*.instructions.md`, automatic runs through rulesets, manifests excluded |
| 26 | 420 | Cursor "no longer document[s]" `.cursorrules`, which "is deprecated" | FABRICATED (reuse) | "The `.cursorrules` file in your project root is legacy and will be deprecated." | correct-to: "Cursor project rules are `.mdc` files in `.cursor/rules/`; `AGENTS.md` is a documented alternative; Cursor's help centre says the root `.cursorrules` file 'is legacy and will be deprecated'." |
| 27 | 189 | `ReactDOM.render` removed in React 19 | VALIDATED (reuse) | React 19 upgrade guide | keep |
| 28 | 193 | `distutils` removed in Python 3.12 | VALIDATED (reuse) | "PEP 632: Remove the `distutils` package." Setuptools can still provide it. | keep |
| 29 | 201 | `BinaryFormatter` "disabled by default since .NET 5" | MISATTRIBUTED (reuse) | .NET 5 banned it for ASP.NET only; .NET 8 made it throw in most project types; .NET 9 always throws | correct-to: "obsolete since .NET 5; throws by default in most project types since .NET 8; the in-box implementation always throws PlatformNotSupportedException in .NET 9" |
| 30 | 202 | `WebRequest.Create` obsolete since .NET 6 | VALIDATED (reuse) | SYSLIB0014 | keep |
| 31 | 293 | React 19 renamed or replaced `useFormState` | VALIDATED (reuse) | "we've renamed it and deprecated `useFormState`" | keep |
| 32 | 292 | `useFormState` labelled a "React 18-only API" | MISATTRIBUTED (reuse) | it existed only in "the Canary releases" | correct-to: "Canary-era API, deprecated in React 19 in favour of `React.useActionState`" |
| 33 | 295 | `useFormStatus` exists only from React 19 | VALIDATED (reuse) | React v19 post | keep |
| 34 | 300 | `TimeProvider` needs .NET 8 or later | VALIDATED (reuse) | built in from .NET 8; also available earlier through the `Microsoft.Bcl.TimeProvider` package | keep; add the package caveat |

**Round-1 agent verdicts applied to the skill's matching claims** (rows 1–9 of the round-1 report; the agent-round-3 regulator source for row A9):

| # | Skill line | Claim | Verdict | Evidence | Recommended action |
|---|---|---|---|---|---|
| A1 | 40 | Quality issues "specific to AI generation patterns" | FABRICATED (reuse row 9) | Cotroneo: human code "exhibits greater structural complexity and a higher concentration of maintainability issues"; Tambon: "Similar to human-written code, LLM-generated code is prone to bugs" | strip-the-specificity |
| A2 | 55, section 1 | Over-engineering is a common AI issue | UNSOURCEABLE (reuse row 1) | no comparison with human code; Cotroneo finds AI code "generally simpler" | strip-the-specificity |
| A3 | 55, section 2 | Verbose naming is common | UNSOURCEABLE (reuse row 2) | no measurement | strip-the-specificity |
| A4 | 55, section 3 | Excessive comments are common | UNSOURCEABLE (reuse row 3) | Sonar gives comment density per model, with no human baseline | strip-the-specificity |
| A5 | 55, section 4 | Inconsistent style is common | UNSOURCEABLE (reuse row 4) | no measurement | strip-the-specificity |
| A6 | 55, section 5 | Unnecessary complexity is common | UNSOURCEABLE (reuse row 5) | Cotroneo contradicts it | strip-the-specificity |
| A7 | 55, section 6 | Missing edge cases are common | VALIDATED (reuse row 7) | Tambon: "Missing Corner Cases 15.27%" | keep; cite it |
| A8 | 55, section 7 | Incorrect async handling is common | UNSOURCEABLE (reuse row 8) | no measurement | strip-the-specificity |
| A9 | 44 | Every AI-generated pull request needs human review | VALIDATED (reuse from agent round 3) | French and German joint report, page 12: "Generated source code should generally be checked and reproduced by the developers." This is a recommendation; "no exception" is the project's own policy. | keep; cite it |

**New this pass:**

| # | Skill line | Claim | Verdict | Evidence | Recommended action |
|---|---|---|---|---|---|
| N1 | 48 | AI tests "routinely encode the *current implementation* rather than the *specification*" | VALIDATED | Konstantinou, Degiovanni and Papadakis (arXiv 2410.21136), 24 Java repositories: "prone on generating oracles that capture the actual program behaviour rather than the expected one". The same abstract finds these oracles have "higher fault detection potential than the Evosuite ones". | keep; say "prone to" rather than "routinely", and cite the paper |
| N2 | 49 | "Models trained mid-2024 still emit" React 18, .NET 7, Java 11 and Python 3.10 idioms | UNSOURCEABLE | Nothing supports the mid-2024 group of models or the four version pairs. The general effect is measured: Wang and colleagues (ICSE 2025, arXiv 2406.09834) found "The DUR of the LLMs for the overall dataset ranges from 25% to 38%" (DUR is the deprecated usage rate), 70–90% for prompts built from outdated functions. The joint report (page 9) names outdated training data as a cause. | strip-the-specificity; the sourced sentence above can replace it |
| N3 | 182 | "Mid-2024-trained models are still emitting these in 2026." | UNSOURCEABLE | as N2 | strip-the-specificity |
| N4 | 51 | Citation-grounded studies "report meaningful reductions" | UNSOURCEABLE | no study is named | strip-the-specificity |
| N5 | 52 | Later edits contradict earlier decisions because "the system prompt drops out of effective context" | UNSOURCEABLE | no source for the frequency or the cause | strip-the-specificity |
| N6 | 53 | "A common AI regression is unrelated edits that slip into a one-line change" | UNSOURCEABLE | The closest measured fact is Tambon's Non-Prompted Consideration, "8.15%": "statements that are unrelated to the task specification." That measures function generation, not edits to other files. | strip-the-specificity; the Tambon wording is sourced |
| N7 | 150 | Hallucinated imports are "the single highest-impact category" | UNSOURCEABLE | no ranking source | strip-the-specificity |
| N8 | 150 | "Similar conflations appear across ecosystems" | UNSOURCEABLE | no source names such conflations outside npm | strip-the-specificity |
| N9 | 187–188 | `componentWillMount` / `componentWillReceiveProps` as a "React 18 idiom in a React 19 project" | UNSOURCEABLE | React's 19 upgrade guide does not mention either method. React's legacy Component reference was not read this pass. | strip-the-specificity, or re-source it against that reference |
| N10 | 195 | `get_event_loop()` where `get_running_loop()` "is required (deprecation tightened in 3.12+)" | MISATTRIBUTED | 3.12: "Deprecation warning is emitted if there is no current event loop." 3.14: "Raises a RuntimeError if there is no current event loop." The docs say `get_running_loop()` is "preferred ... in coroutines and callbacks", not required. | correct-to: "`asyncio.get_event_loop()` with no current event loop emits a DeprecationWarning from Python 3.12 and raises RuntimeError from 3.14; in coroutines and callbacks the documentation prefers `get_running_loop()`, and `asyncio.run()` over managing the loop by hand." |
| N11 | 289 | `ReactCurrentDispatcher` undefined when React 19 and react-dom 18 are mixed | VALIDATED (medium confidence) | Two independent routes agree. React's guide: "we have renamed the `SECRET_INTERNALS` suffix to: `_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE`". Two GitHub issue titles describe the symptom, including "React 19 RC + react-dom 18.3.1 mismatch" (titles only, pages not fetched). | keep |
| N12 | 207, 289 | `Thread.ofVirtual()` is Java 21 and absent on Java 17 | VALIDATED | JEP 444: "Release: 21"; previewed in JDK 19 and 20 | keep |
| N13 | 289 | "`record` patterns rejected on Java 16" | MISATTRIBUTED | JEP 440: final in release 21; preview only in JDK 19 (JEP 405) and JDK 20 (JEP 432). The statement is true but names the wrong boundary, so Java 17 through 20 look safe when they are not. | correct-to: "record patterns rejected before Java 21 (JEP 440; preview only in JDK 19 and 20)" |
| N14 | 289 | `using` declarations rejected on C# 7 | VALIDATED | Microsoft Learn lists "Using declarations" under "C# version 8.0, Released September 2019" | keep |
| N15 | 419 | "Claude Code self-critique ... findings become letters" | FABRICATED | `docs/REFINEMENT_LOOP.md:8`: "the loop is **NOT RUNNING** today". Round 1 found that Claude Code's own Code Review product is separate and "don't approve or block your PR". | strip-the-specificity |
| N16 | 421 | "Aikido AI Code Reviewer ... Pairs with sast-scanner for security + quality ... PR + nightly" | MISATTRIBUTED | The vendor's page (titled "AI Code Reviews - Code Quality") names the product "Aikido Code Quality": "Instant PR feedback", "Set custom & predefined rules", and "Aikido primarily focuses on code quality". "Nightly" and the security pairing have no source. | correct-to: "Aikido Code Quality: automated pull-request review with custom and predefined rules" |
| N17 | 422 | "Veracode AI Audit ... Reuses the Veracode 45%-flaw study findings" | FABRICATED (medium confidence) | Two searches, one limited to veracode.com, found no product by that name. They surfaced Static Analysis, SCA, Package Firewall and Veracode Fix (AI fix suggestions, a different job). | strip-the-specificity |
| N18 | 423 | Git hooks that detect assistant signatures and key on a `Generated-by: ai` trailer | UNSOURCEABLE | No assistant documents a `Generated-by` trailer. Claude Code's default is "Co-authored-by: Claude <claude@anthropic.com>", and with `false` it "adds no commit trailer" (reused from round 1). A missing trailer proves nothing. | strip-the-specificity |
| N19 | 425 | "The combination catches the high-impact AI-specific failure modes ... before merge" | UNSOURCEABLE | no measurement of effectiveness | strip-the-specificity |
| N20 | 474 | "the 2026 incident data says otherwise" | UNSOURCEABLE | no data is named | strip-the-specificity |
| N21 | 279 | "AI agents frequently emit raw SQL strings in migration files / repo scripts" | UNSOURCEABLE | no frequency source | strip-the-specificity |

| Verdict | Reused (rows 11–34) | Applied from round 1 | New | Total |
|---|---|---|---|---|
| Validated | 18 | 2 | 4 | 24 |
| Fabricated | 2 | 1 | 2 | 5 |
| Unsourceable | 1 | 6 | 12 | 19 |
| Misattributed | 3 | 0 | 3 | 6 |
| **Examined** | 24 | 9 | 21 | **54** |

**Not examined this pass:**
- **Line 260.** The comment says "HashMap shared across virtual threads", but the code uses `parallelStream`. I did not read which threads a parallel stream uses.
- **Line 461.** The OWASP reference web address and the mention of "Lasso" were not fetched.
- **Lines 157, 162–163, 168–169 and 174–175: whether the example packages exist.** This belongs to hallucination-detector. One flag for it, from my memory only and not checked: `requests-async` may once have been a real PyPI package.
- **Lines 46, 152, 178, 361 and 464: what dependency-auditor does.** The skill says dependency-auditor runs the registry-existence and signature checks. I did not read dependency-auditor's file.

## 3. What the skill is missing

**1. C and C++ examples.** The four classes below now have sources. The C++ Core Guidelines and cppreference's C++ arithmetic page were not read.

- **Stale idiom, C.** Old: `gets(buf);`. cppreference: "(removed in C11)", "deprecated in the third corrigendum to the C99 standard and removed altogether in the C11 standard", and "fgets() and gets_s() are the recommended replacements." Replacement: `if (fgets(buf, sizeof buf, stdin) == NULL) { /* handle end-of-file or error */ }`. I did not read the `fgets` page.
- **Stale idiom, C++.** Old: `std::auto_ptr<T> p(new T);`. cppreference: "(deprecated in C++11) (removed in C++17)" and "std::unique_ptr is preferred for this and other uses." Replacement: `auto p = std::make_unique<T>();`. `make_unique` being C++14 is from my memory; its page was not read.
- **Missing edge case, C.** This is a stronger example than the skill's TypeScript `divide`. cppreference: "If the second operand is zero, the behavior is undefined" and "If the quotient a/b is not representable in the result type, the behavior of both a/b and a%b is undefined (that means INT_MIN%-1 is undefined on 2's complement systems)". Replacement: `if (b == 0 || (a == INT_MIN && b == -1)) return false; *out = a / b; return true;`.
- **Incomplete output, C and C++.** Neither language has a standard "not implemented" marker, so the CWE-546 comment markers already in the agent's evidence apply (for example `return 0; // TODO`). That quote came only through a summarising fetch.
- **Vacuous test, C++ (GoogleTest).** `EXPECT_TRUE` "Verifies that condition is true", so `EXPECT_TRUE(result)` alone is the C++ version of `toBeDefined()`. Replacement: `EXPECT_EQ(ComputeTotal(items), 10);`, and `EXPECT_DOUBLE_EQ` or `EXPECT_NEAR` for floating-point values. For C, I found no authoritative test-framework source this pass.

**2. Tests changed to pass.** The agent's sources (ImpossibleBench and GitHub's "Any change that weakens CI is a blocker") are enough. One more original paper strengthens them: Baker and colleagues (OpenAI, arXiv 2503.11926). It lists the hacks seen in agentic coding environments:
- "edit the unit tests so they would pass"
- "calling `sys.exit(0)` would cause tests to exit gracefully"
- "raised an exception from functions outside the testing framework in order to skip unit test evaluation"
- "writing stubs instead of real implementations when unit test coverage is poor"
- "parsing test files at test-time in order to extract expected values"

Each of these is a concrete thing a reviewer can Grep for. Two caveats: the paper studies a model during training and gives no frequency for ordinary assistant code, and the quotes came through a summarising fetch.

**3. Coding-assistant configuration.** The agent's sources describe how the mechanism works. One more original source shows it exploited: CVE-2025-53773, from the original disclosure by Embrace The Red. Copilot agent mode "can create and write to files in the workspace without user approval", and the resulting setting "disables all user confirmations".
- This exposes a gap: `.vscode/settings.json` is on neither the agent's nor the skill's list of configuration files.
- The exact key name, `chat.tools.autoApprove`, came only from search-result summaries, so it is medium confidence.

**4. SQL examples.** The skill shows only bad forms and no safe form.
- **Python, line 274.** The sqlite3 docs warn "beware of using Python's string operations to assemble queries". Safe form: `db.execute("SELECT * FROM users WHERE id = ?", (user_id,))`. The placeholder character depends on the database driver; that is from memory, since PEP 249 was not read.
- **Transact-SQL, line 280.** Microsoft: "Never build Transact-SQL statements directly from user input." Also: "String concatenation is the primary point of entry for script injection." The `sp_executesql` page says "You should parameterize your queries when using `sp_executesql`." Safe form, modelled on Microsoft's example A:
  ```sql
  EXECUTE sp_executesql N'SELECT * FROM users WHERE name = @name', N'@name NVARCHAR(100)', @name = @name;
  ```
- **Caveats from the same page.** Names of database objects need `QUOTENAME(@variable)`. The page also warns: "Even parameterized data can be manipulated by a skilled and determined attacker."
- **C#.** The same page provides a sourced safe form using the `SqlParameter` collection.

**5. Stale framework idioms now have a measurement.** Wang and colleagues (ICSE 2025) tested seven models on 145 interface mappings from eight Python libraries, with 28,125 prompts. The deprecated usage rate was 25–38% overall, 70–90% for prompts built from outdated functions, and 9–18% for up-to-date ones. The stated cause is training data drawn from repositories "without filtering for deprecated APIs". The agent's evidence section says this class has no measurement, so CTO Chief should pass this to the agent too. It covers Python only.

**6. Vacuous tests now have a source.** Konstantinou and colleagues (the row N1 paper) apply here. The agent's evidence section also says this class has no measurement. The paper gives a tendency, not a rate.

**7. The skill's safe test example conflicts with GoogleTest and with the agent.**
- Line 234 checks an exact floating-point value: `toBe(10 * 1.21)`. GoogleTest says: "Due to rounding errors, it is very unlikely that two floating-point values will match exactly". Jest's own advice for floats was not read.
- The skill's specification is "with tax". The agent's example is "sums active items only", with `toBe(10)`. That difference needs a decision, not a guess.

**8. Where the skill and the agent state different facts** (both files read this session; the agent wins under its rule 4):
- **Who checks that a package exists.** The skill hands it to dependency-auditor (lines 46, 152, 178, 361, 464). The agent hands it to hallucination-detector (line 39).
- **Letters and the critic mode.** Skill lines 419, 429, 440–464 and 478–486 describe the refinement loop as if it runs. `docs/REFINEMENT_LOOP.md:8` says it is "NOT RUNNING".
- **Debug prints, races and SQL injection.** The skill makes each its own critical finding (sections D, E and G, red line 470). The agent hands these to code-reviewer, concurrency-checker and sast-scanner.
- **Type names.** The skill still uses its old names; round 2 of the agent listed this for the skill's rounds.

**9. The asyncio example has no safe form.** The docs recommend `asyncio.run()` "instead of using these lower level functions to manually create and close an event loop".

**What would change these verdicts:**
- **Veracode (row N17):** a Veracode page naming "AI Audit".
- **Aikido (row N16):** Aikido naming a product "Aikido AI Code Reviewer".
- **React mismatch (row N11):** reading the two GitHub issues directly, which would confirm or overturn it.
- **Rows N2, N3, N6 and N21:** any paper measuring those specific version pairs or behaviours in assistant-written code.