# Round 1 web research and claim validation for agents/ai-quality/ai-code-quality-reviewer.md and its skill (dispatch d-s3-agent-r1-research, citation-validator, installed plugin 6.14.65, 2026-09-30)

# Citation validation report: dispatch d-s3-agent-r1-research

Files checked, read-only:
- `/Users/account/Code/ctoc/agents/ai-quality/ai-code-quality-reviewer.md`
- `/Users/account/Code/ctoc/skills/ai-quality/ai-code-quality-reviewer/SKILL.md`
- For comparison: `/Users/account/Code/ctoc/skills/ai-quality/hallucination-detector/SKILL.md`, line 57

**Result:** 34 claims examined. 21 are validated, 3 are fabricated, 7 have no source that could be found, and 3 name the wrong source or date.
- **The two tool-integration rows are fabricated.** The "GitHub Copilot review filters" row (line 418) describes features GitHub does not document. The Cursor row (line 420) is contradicted by Cursor's own help centre.
- **The agent's claim that its eight issue classes are specific to AI-written code is fabricated.** A study of over 500,000 samples found the opposite for over-engineering and complexity.
- **Three claims give the wrong source or date:** the Veracode "flat since 2024" statement, the ".NET 5" date for BinaryFormatter, and the "React 18-only" label on `useFormState`.

No file or fetched page tried to instruct the reviewer; I found no prompt-injection attempts.

## 1. Research log

```json
{
  "research_log": {
    "queries": [
      { "text": "\"We Have a Package for You\" Spracklen USENIX Security 2025 package hallucinations", "source_class": "broad web", "repeated_because": null },
      { "text": "Veracode 2025 GenAI Code Security Report 45% OWASP Top 10 security flaw 100 LLMs", "source_class": "broad web", "repeated_because": null },
      { "text": "Veracode GenAI code security update 2026 security pass rate 55% flat since 2024", "source_class": "broad web", "repeated_because": null },
      { "text": "Veracode July 2025 press release \"45 percent\" \"test cases\" OWASP Top 10 AI-generated code", "source_class": "broad web", "repeated_because": null },
      { "text": "react-codeshift hallucinated package Aikido Charlie Eriksen slopsquatting", "source_class": "broad web", "repeated_because": null },
      { "text": "\"Are we PEP 740 yet\" attestations adoption top PyPI packages", "source_class": "broad web", "repeated_because": null },
      { "text": "site:docs.github.com Copilot code review approving review required approvals setting", "source_class": "vendor documentation", "repeated_because": null },
      { "text": "GitHub Copilot \"review filters\" AI-generated pull request flag label", "source_class": "broad web", "repeated_because": null },
      { "text": "GitHub docs Copilot code review custom instructions \"4,000 characters\" code review reads", "source_class": "broad web", "repeated_because": null },
      { "text": "Cursor docs \".cursorrules\" legacy \"will be deprecated\" project rules", "source_class": "broad web", "repeated_because": null },
      { "text": "code.claude.com docs settings \"attribution\" commit \"Co-Authored-By\" includeCoAuthoredBy deprecated", "source_class": "broad web", "repeated_because": null },
      { "text": "Sonar \"coding personalities\" leading LLMs report code smells percentage of issues 2025", "source_class": "broad web", "repeated_because": null },
      { "text": "GitClear AI Copilot code quality 2025 research duplicated code blocks eightfold copy/paste moved code", "source_class": "broad web", "repeated_because": null }
    ],
    "sources": [
      { "url": "https://arxiv.org/abs/2605.02273", "read_on": "2026-09-30", "bore_on": "skill line 44 (84% statistic)", "outcome": "did-not-bear", "quote": "most AI-generated PRs receive no review and, when reviewed, are largely dominated by AI agents rather than humans", "error": null },
      { "url": "https://arxiv.org/html/2605.02273", "read_on": "2026-09-30", "bore_on": "skill line 44 (84% statistic)", "outcome": "supported", "quote": "84.0% (28246/33596) of agent-authored PRs either receive no recorded review or are reviewed exclusively by agents", "error": null },
      { "url": "https://arxiv.org/abs/2406.10279", "read_on": "2026-09-30", "bore_on": "skill line 46 (rates, 576,000 samples)", "outcome": "supported", "quote": "the average percentage of hallucinated packages is at least 5.2% for commercial models and 21.7%", "error": null },
      { "url": "https://arxiv.org/html/2406.10279", "read_on": "2026-09-30", "bore_on": "skill line 46 (440,445 of 2.23M; 43% repetition)", "outcome": "supported", "quote": "43% of hallucinated packages were repeated in all 10 queries, while 39% did not repeat at all across the 10 queries", "error": null },
      { "url": "https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen", "read_on": "2026-09-30", "bore_on": "skill line 46 (venue, authors)", "outcome": "supported", "quote": "USENIX Security '25", "error": null },
      { "url": "https://survey.stackoverflow.co/2025/ai", "read_on": "2026-09-30", "bore_on": "skill line 45 (66%, 45.2%)", "outcome": "supported", "quote": "The biggest single frustration, cited by 66% of developers, is dealing with 'AI solutions that are almost right, but not quite,'", "error": null },
      { "url": "https://www.veracode.com/blog/genai-code-security-report/", "read_on": "2026-09-30", "bore_on": "skill line 50; hallucination-detector line 57", "outcome": "supported", "quote": "45% of code samples failed security tests and introduced OWASP Top 10 security vulnerabilities into the code.", "error": null },
      { "url": "https://www.veracode.com/blog/spring-2026-genai-code-security/", "read_on": "2026-09-30", "bore_on": "skill line 50 ('flat since 2024')", "outcome": "supported", "quote": "security pass rates remain stubbornly stuck at approximately 55% – virtually identical to where they stood two years ago", "error": null },
      { "url": "https://www.veracode.com/blog/2026-genai-code-security-report-ai-risk/", "read_on": "2026-09-30", "bore_on": "skill line 50 (currency of the figure)", "outcome": "supported", "quote": "the average security pass rate across models is 56% – barely changed from 55%", "error": null },
      { "url": "https://www.businesswire.com/news/home/20250730694951/en/AI-Generated-Code-Poses-Major-Security-Risks-in-Nearly-Half-of-All-Development-Tasks-Veracode-Research-Reveals", "read_on": "2026-09-30", "bore_on": "unit of the 45% figure (test cases vs samples)", "outcome": "unreachable", "quote": null, "error": "The server returned HTTP 403 Forbidden." },
      { "url": "https://www.npmjs.com/package/react-codeshift", "read_on": "2026-09-30", "bore_on": "skill line 150", "outcome": "unreachable", "quote": null, "error": "The server returned HTTP 403 Forbidden." },
      { "url": "https://registry.npmjs.org/react-codeshift", "read_on": "2026-09-30", "bore_on": "skill line 150", "outcome": "supported", "quote": "Placeholder to prevent dependency confusion. (created 2026-01-14T21:02:51.762Z, only version 1.0.0)", "error": null },
      { "url": "https://www.aikido.dev/blog/slopsquatting-ai-package-hallucination-attacks", "read_on": "2026-09-30", "bore_on": "skill line 150 (who registered it, conflation)", "outcome": "supported", "quote": "Charlie claimed this npm package called `react-codeshift`. The package wasn't real, had no author, and definitely hadn't been registered before.", "error": null },
      { "url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/forEach", "read_on": "2026-09-30", "bore_on": "agent line 198", "outcome": "supported", "quote": "`forEach()` expects a synchronous function — it does not wait for promises.", "error": null },
      { "url": "https://docs.npmjs.com/generating-provenance-statements", "read_on": "2026-09-30", "bore_on": "skill line 47", "outcome": "supported", "quote": "When an npm package is published with provenance, it is signed by Sigstore public good servers and logged in a public transparency ledger.", "error": null },
      { "url": "https://peps.python.org/pep-0740/", "read_on": "2026-09-30", "bore_on": "skill line 47", "outcome": "supported", "quote": "PEP 740 – Index support for digital attestations (Status: Final)", "error": null },
      { "url": "https://trailofbits.github.io/are-we-pep740-yet/", "read_on": "2026-09-30", "bore_on": "skill line 47 ('table stakes' adoption)", "outcome": "did-not-bear", "quote": "Last updated . (Updated daily.)", "error": null },
      { "url": "https://docs.github.com/en/copilot/concepts/agents/code-review", "read_on": "2026-09-30", "bore_on": "skill line 418; Part 2", "outcome": "refuted", "quote": "By default, Copilot's reviews do not count toward required approvals for the pull request.", "error": null },
      { "url": "https://docs.github.com/en/copilot/how-tos/copilot-on-github/set-up-copilot/configure-code-review", "read_on": "2026-09-30", "bore_on": "Part 2 (Copilot approvals)", "outcome": "supported", "quote": "Copilot approvals are in public preview and subject to change.", "error": null },
      { "url": "https://docs.github.com/en/copilot/how-tos/use-copilot-agents/request-a-code-review/use-code-review", "read_on": "2026-09-30", "bore_on": "skill line 418", "outcome": "did-not-bear", "quote": null, "error": null },
      { "url": "https://github.blog/changelog/2026-06-12-copilot-code-review-new-configurations-and-controls/", "read_on": "2026-09-30", "bore_on": "Part 2 (Copilot instruction limit, content exclusion)", "outcome": "supported", "quote": "That limit has now been removed", "error": null },
      { "url": "https://github.blog/ai-and-ml/generative-ai/agent-pull-requests-are-everywhere-heres-how-to-review-them/", "read_on": "2026-09-30", "bore_on": "Part 2 (agent pull request defect classes)", "outcome": "supported", "quote": "Any change that weakens CI is a blocker. Full stop.", "error": null },
      { "url": "https://cursor.com/docs/context/rules", "read_on": "2026-09-30", "bore_on": "skill line 420; Part 2", "outcome": "supported", "quote": "Project rules live in `.cursor/rules` as `.mdc` files and are version-controlled.", "error": null },
      { "url": "https://cursor.com/help/customization/rules", "read_on": "2026-09-30", "bore_on": "skill line 420", "outcome": "refuted", "quote": ".cursorrules file in your project root is legacy and will be deprecated.", "error": null },
      { "url": "https://code.claude.com/docs/llms.txt", "read_on": "2026-09-30", "bore_on": "locating Claude Code pages", "outcome": "did-not-bear", "quote": null, "error": null },
      { "url": "https://code.claude.com/docs/en/settings", "read_on": "2026-09-30", "bore_on": "Part 2 (attribution)", "outcome": "did-not-bear", "quote": null, "error": null },
      { "url": "https://code.claude.com/docs/en/settings-reference.md", "read_on": "2026-09-30", "bore_on": "Part 2 (attribution trailer)", "outcome": "supported", "quote": "`false`: Claude Code adds no commit trailer", "error": null },
      { "url": "https://code.claude.com/docs/en/code-review.md", "read_on": "2026-09-30", "bore_on": "Part 2 (Claude Code Code Review)", "outcome": "supported", "quote": "Findings are tagged by severity and don't approve or block your PR", "error": null },
      { "url": "https://code.claude.com/docs/en/hooks", "read_on": "2026-09-30", "bore_on": "Part 2 (hooks)", "outcome": "supported", "quote": "Hooks are user-defined shell commands, HTTP endpoints, MCP tool calls, LLM prompts, or subagents that execute automatically at specific points in Claude Code's lifecycle.", "error": null },
      { "url": "https://code.claude.com/docs/en/sub-agents.md", "read_on": "2026-09-30", "bore_on": "Part 2 (subagent tools)", "outcome": "supported", "quote": "Inherits every tool available to subagents if omitted.", "error": null },
      { "url": "https://react.dev/blog/2024/04/25/react-19-upgrade-guide", "read_on": "2026-09-30", "bore_on": "skill line 189", "outcome": "supported", "quote": "In React 19, we're removing `ReactDOM.render` and you'll need to migrate to using `ReactDOM.createRoot`", "error": null },
      { "url": "https://react.dev/blog/2024/12/05/react-19", "read_on": "2026-09-30", "bore_on": "skill lines 292-295", "outcome": "supported", "quote": "`React.useActionState` was previously called `ReactDOM.useFormState` in the Canary releases, but we've renamed it and deprecated `useFormState`.", "error": null },
      { "url": "https://react.dev/reference/react-dom/hooks/useFormStatus", "read_on": "2026-09-30", "bore_on": "skill line 295", "outcome": "did-not-bear", "quote": null, "error": null },
      { "url": "https://react.dev/reference/react/useActionState", "read_on": "2026-09-30", "bore_on": "skill line 293", "outcome": "did-not-bear", "quote": null, "error": null },
      { "url": "https://docs.python.org/3/whatsnew/3.12.html", "read_on": "2026-09-30", "bore_on": "skill line 193", "outcome": "supported", "quote": "PEP 632: Remove the `distutils` package.", "error": null },
      { "url": "https://learn.microsoft.com/en-us/dotnet/standard/serialization/binaryformatter-security-guide", "read_on": "2026-09-30", "bore_on": "skill line 201", "outcome": "supported", "quote": "Starting in .NET 9, the in-box BinaryFormatter implementation throws exceptions on use, even with the settings that previously enabled its use.", "error": null },
      { "url": "https://learn.microsoft.com/en-us/dotnet/standard/serialization/binaryformatter-migration-guide/", "read_on": "2026-09-30", "bore_on": "skill line 201", "outcome": "supported", "quote": "their implementation always throws a PlatformNotSupportedException, regardless of project type", "error": null },
      { "url": "https://learn.microsoft.com/en-us/dotnet/core/compatibility/serialization/5.0/binaryformatter-serialization-obsolete", "read_on": "2026-09-30", "bore_on": "skill line 201 ('since .NET 5')", "outcome": "refuted", "quote": "BinaryFormatter serialization is prohibited by default for ASP.NET apps.", "error": null },
      { "url": "https://learn.microsoft.com/en-us/dotnet/core/compatibility/serialization/8.0/binaryformatter-disabled", "read_on": "2026-09-30", "bore_on": "skill line 201", "outcome": "refuted", "quote": "Starting in .NET 8, the affected methods throw a NotSupportedException at runtime across all project types except Windows Forms and WPF.", "error": null },
      { "url": "https://learn.microsoft.com/en-us/dotnet/fundamentals/syslib-diagnostics/syslib0014", "read_on": "2026-09-30", "bore_on": "skill line 202", "outcome": "supported", "quote": "The following APIs are marked as obsolete, starting in .NET 6.", "error": null },
      { "url": "https://learn.microsoft.com/en-us/dotnet/api/system.timeprovider", "read_on": "2026-09-30", "bore_on": "skill line 300", "outcome": "supported", "quote": "monikers: netstandard-2.0-pp, netframework-4.6.2-pp ... net-8.0, net-9.0; api_location: System.Runtime.dll, Microsoft.Bcl.TimeProvider.dll", "error": null },
      { "url": "https://arxiv.org/abs/2403.08937", "read_on": "2026-09-30", "bore_on": "agent lines 3/18/20; Part 2", "outcome": "supported", "quote": "Similar to human-written code, LLM-generated code is prone to bugs", "error": null },
      { "url": "https://arxiv.org/pdf/2403.08937", "read_on": "2026-09-30", "bore_on": "agent 'Missing Edge Cases'; Part 2", "outcome": "supported", "quote": "Missing Corner Cases 15.27% ... The generated code operates correctly, except for overlooking certain corner cases.", "error": null },
      { "url": "https://arxiv.org/abs/2407.06153", "read_on": "2026-09-30", "bore_on": "agent lines 3/18/20", "outcome": "did-not-bear", "quote": "three categories and ten sub-categories", "error": null },
      { "url": "https://arxiv.org/abs/2307.12596", "read_on": "2026-09-30", "bore_on": "agent maintainability/style classes", "outcome": "did-not-bear", "quote": "1,930 ChatGPT-generated code snippets suffer from maintainability issues", "error": null },
      { "url": "https://arxiv.org/html/2508.21634", "read_on": "2026-09-30", "bore_on": "agent lines 3/18/20 (over-engineering, complexity, duplication); Part 2", "outcome": "refuted", "quote": "AI-generated code is generally simpler and more repetitive, yet more prone to unused constructs and hardcoded debugging, while human-written code exhibits greater structural complexity and a higher concentration of maintainability issues.", "error": null },
      { "url": "https://arxiv.org/html/2510.20270", "read_on": "2026-09-30", "bore_on": "Part 2 (test exploitation)", "outcome": "supported", "quote": "GPT-5, cheats 54.0% of the time on Conflicting-SWEbench", "error": null },
      { "url": "https://www.sonarsource.com/blog/the-coding-personalities-of-leading-llms/", "read_on": "2026-09-30", "bore_on": "agent classes; Part 2", "outcome": "supported", "quote": "The models consistently introduced severe bugs like resource leaks and API contract violations, issues that require a holistic understanding of an application.", "error": null },
      { "url": "https://www.gitclear.com/ai_assistant_code_quality_2025_research", "read_on": "2026-09-30", "bore_on": "agent 'Duplicate Logic'", "outcome": "supported", "quote": "4x more code cloning", "error": null }
    ]
  }
}
```

## 2. Verdict for each claim

Severity follows the verdict. Fabricated claims are critical. Misattributed and unsourceable claims are high. Validated claims are info.

| # | File:line | Claim | Verdict | Evidence | Recommended action |
|---|---|---|---|---|---|
| 1 | agent:3/20 | Over-engineering is a common AI pitfall | UNSOURCEABLE | Nothing measures it against human code. The two sources that bear on it disagree. Cotroneo et al. (arXiv 2508.21634) find AI code "generally simpler". Sonar only compares models with each other (Claude Sonnet 4 wrote more than three times OpenCoder-8B's lines). | strip-the-specificity |
| 2 | agent:3/20 | Verbose naming is common | UNSOURCEABLE | No measurement found. | strip-the-specificity |
| 3 | agent:3/20 | Excessive comments are common | UNSOURCEABLE | Sonar gives comment density per model ("16.4%" for Claude 3.7 Sonnet, "4.4%" for GPT-4o) with no human baseline. This does not support a general claim. | strip-the-specificity |
| 4 | agent:3/20 | Inconsistent style (mixed async and `.then`) is common | UNSOURCEABLE | No measurement found. | strip-the-specificity |
| 5 | agent:3/20 | Unnecessary complexity is common | UNSOURCEABLE | Same disagreement as row 1. Cotroneo: human code "exhibits greater structural complexity". | strip-the-specificity |
| 6 | agent:3/20 | Duplicate logic is common | VALIDATED | Cotroneo (ISSRE 2025): AI code is "more repetitive". GitClear agrees ("4x more code cloning"), but its data is a trend over time, not code traced to an assistant. | keep |
| 7 | agent:3/20 | Missing edge cases are common | VALIDATED | Tambon et al. (arXiv 2403.08937, figure 2): "Missing Corner Cases 15.27%" of 333 buggy samples, the second-largest class. The models studied were CodeGen, PanGu-Coder and Codex, which are old. | keep |
| 8 | agent:3/20 | Incorrect async handling is common | UNSOURCEABLE | No measurement found. Sonar reports "Concurrency / Threading" bugs for one model only. | strip-the-specificity |
| 9 | agent:18 | The issues are "specific to AI generation patterns" | FABRICATED | For over-engineering and complexity this is contradicted: human code has "greater structural complexity and a higher concentration of maintainability issues" (Cotroneo). Tambon: "Similar to human-written code, LLM-generated code is prone to bugs". Only duplication is sourced as distinctively AI. Confidence medium: this rests on one large study. | strip-the-specificity |
| 10 | agent:198 | forEach doesn't await async callbacks | VALIDATED | MDN: "`forEach()` expects a synchronous function — it does not wait for promises." | keep |
| 11 | skill:44 | 84% of agent pull requests got no human review or only agent review; arXiv 2605.02273; 2026 | VALIDATED | "84.0% (28246/33596) ... either receive no recorded review or are reviewed exclusively by agents". The sample is repositories with at least 100 stars; submitted 4 May 2026. The paper warns: "The absence of review comments does not imply that the code was not reviewed". | keep, but say "no recorded review" |
| 12 | skill:45 | 66% "almost right, but not quite" is the top frustration | VALIDATED | "The biggest single frustration, cited by 66% of developers". Question base: 31,476 responses. | keep |
| 13 | skill:45 | 45.2% say debugging AI-generated code is more time-consuming | VALIDATED | The survey page lists "Debugging AI-generated code is more time-consuming": 45.2%. | keep |
| 14 | skill:46 | Spracklen et al., USENIX Security 2025 | VALIDATED | USENIX presentation page, Security '25 proceedings. | keep |
| 15 | skill:46 | At least 5.2% for commercial models and 21.7% for open-source | VALIDATED | Paper abstract, verbatim. | keep |
| 16 | skill:46 | 576,000 code samples | VALIDATED | "we generate 576,000 code samples". | keep |
| 17 | skill:46 | 440,445 of 2.23 million, 19.7% | VALIDATED | "2.23 million packages ... of which 440,445 (19.7%) were determined to be hallucinations". | keep |
| 18 | skill:46 | 43% recur on all ten identical runs | VALIDATED | "43% of hallucinated packages were repeated in all 10 queries, while 39% did not repeat at all". The file leaves out the 39%. | keep |
| 19 | skill:47 | npm provenance and PEP 740 exist as described | VALIDATED | npm docs: "signed by Sigstore public good servers". PEP 740, "Index support for digital attestations", status Final. | keep |
| 20 | skill:47 | Attestations "are now table stakes" | UNSOURCEABLE | No readable adoption measurement. The adoption tracker page's figures and date did not render. | strip-the-specificity |
| 21 | skill:50 | Veracode 2025: 45% of samples introduced an OWASP Top 10 flaw | VALIDATED | Veracode blog, 30 July 2025: "45% of code samples failed security tests and introduced OWASP Top 10 security vulnerabilities". | keep |
| 22 | skill:50 | "pass rate has stayed near 55%, flat since 2024", credited to the 2025 report | MISATTRIBUTED | The 2025 report's "flat" is across models, not over time: "Security performance remained flat, regardless of model size or training sophistication." The over-time statement is in the Spring 2026 Update (24 March 2026). The figure has since moved: the 2026 report (28 July 2026) gives "56% – barely changed from 55%". | correct-to: "Veracode's 2025 report measured that 45% of code samples introduced an OWASP Top 10 flaw; its Spring 2026 Update found pass rates 'stuck at approximately 55%', and its 2026 report (28 July 2026) measured a 56% average pass rate." |
| 23 | hallucination-detector:57, compared with skill:50 | "~45% of tests (100+ models across Java, Python, C#, and JavaScript)" | VALIDATED | Same figure; the models and languages match the Veracode blog. The two files use different units ("tests" versus "samples"); Veracode's own wording is "code samples". The press release, which reportedly says "test cases", returned 403. | keep; align the unit to "code samples" |
| 24 | skill:150 | `react-codeshift` is a defensive placeholder published January 2026 with the description "Placeholder to prevent dependency confusion" | VALIDATED | Confirmed two independent ways. The npm registry record gives that description, created 2026-01-14, only version 1.0.0. Aikido's blog (20 February 2026) says Charlie Eriksen registered the name and that it conflates `jscodeshift` and `react-codemod`. | keep |
| 25 | skill:418 | "GitHub Copilot review filters: per-PR AI-author flag, auto-tag of AI-generated diffs, configurable rules block patterns" | FABRICATED | Checked GitHub's Copilot code review concept page, its configuration page, the 12 June 2026 changelog, and a web search for "review filters". None describes an AI-author flag, auto-tagging, or pattern-blocking rules. The docs also say Copilot code review excludes "Dependency management files, such as package.json". | correct-to: "Copilot code review posts comment reviews by default, is steered by `.github/copilot-instructions.md` and `*.instructions.md`, can run automatically through rulesets, and excludes dependency manifests such as package.json." |
| 26 | skill:420 | Cursor docs define project rules solely as `.mdc` files and "no longer document the legacy single-file `.cursorrules`, which is deprecated" | FABRICATED | The `.mdc` part is right: "Project rules must use the `.mdc` extension". But Cursor's help centre still documents the file: ".cursorrules file in your project root is legacy and will be deprecated." That is future tense, not "is deprecated". The docs also offer `AGENTS.md` as "a simple alternative". | correct-to: "Cursor project rules are `.mdc` files in `.cursor/rules/` (a plain `.md` there is ignored); `AGENTS.md` is a documented alternative; Cursor's help centre says the root `.cursorrules` file 'is legacy and will be deprecated'." |
| 27 | skill:189 | `ReactDOM.render` removed in React 19 | VALIDATED | "In React 19, we're removing `ReactDOM.render`". | keep |
| 28 | skill:193 | `distutils` removed in Python 3.12 | VALIDATED | "PEP 632: Remove the `distutils` package." Same page: "Setuptools ... continues to provide `distutils`", so the import can still succeed when setuptools is installed. | keep |
| 29 | skill:201 | `BinaryFormatter` "disabled by default since .NET 5" | MISATTRIBUTED | .NET 5 made it obsolete as a warning and "prohibited by default for ASP.NET apps" only. .NET 8 made it throw "across all project types except Windows Forms and WPF". .NET 9 made it always throw "regardless of project type". | correct-to: "obsolete since .NET 5; throws by default in most project types since .NET 8; the in-box implementation always throws PlatformNotSupportedException in .NET 9" |
| 30 | skill:202 | `WebRequest.Create` obsolete since .NET 6 | VALIDATED | SYSLIB0014: "marked as obsolete, starting in .NET 6". | keep |
| 31 | skill:293 | React 19 renamed or replaced `useFormState` | VALIDATED | "we've renamed it and deprecated `useFormState`" (now `useActionState`). | keep |
| 32 | skill:292 | `useFormState` labelled a "React 18-only API" | MISATTRIBUTED | React says it was in "the Canary releases", not stable React 18. Confidence medium: I did not read React 18.3's export list. | correct-to: "Canary-era API, deprecated in React 19 in favour of `React.useActionState`" |
| 33 | skill:295 | `useFormStatus` is React 19+ only | VALIDATED | React v19 post: "we've added a new hook `useFormStatus`". In stable releases it is 19 onward. | keep |
| 34 | skill:300 | `TimeProvider` is .NET 8+ | VALIDATED | Built in from .NET 8 (System.Runtime.dll). Caveat: it is also available on .NET Standard 2.0 and .NET Framework 4.6.2+ through the Microsoft.Bcl.TimeProvider package, so the file's "not on .NET 7" is wrong whenever that package is referenced. | keep; add the package caveat |

**Counts:** examined 34 · VALIDATED 21 · FABRICATED 3 (rows 9, 25, 26) · UNSOURCEABLE 7 (rows 1–5, 8, 20) · MISATTRIBUTED 3 (rows 22, 29, 32).

**Not examined this pass** (attributed claims outside the brief's list):
- Skill line 49: "Models trained mid-2024 still emit…"
- Skill line 51: citation-grounded studies "report meaningful reductions"
- Skill line 195: the `asyncio.get_event_loop` deprecation. The 3.12 page was read and bears on it, but no verdict was assigned.
- Skill line 289: `ReactCurrentDispatcher`, Java 16 record patterns, C# 7 `using` declarations
- Skill lines 421–422: "Aikido AI Code Reviewer" and "Veracode AI Audit" as products
- Skill line 474: "the 2026 incident data says otherwise"

## 3. What the files are missing

1. **Defect classes measured but not covered (Tambon et al., arXiv 2403.08937, figure 2, read from the PDF).** Of 333 bugs:
   - Misinterpretation is the largest class: "20.77%", "The generated code deviates from the intention of the prompt."
   - Incomplete Generation "9.57%": "The model generates no code or produces an empty function such as a 'pass' statement."
   - Prompt-biased code "6.52%" and Wrong Input Type "5.91%".
   - Non-Prompted Consideration "8.15%": "statements that are unrelated to the task specification."
   - Silly Mistake "9.57%": "redundant conditions or unnecessary casting."

   The skill's missing-business-rule category overlaps misinterpretation only partly. Empty-stub output, prompt-biased code and wrong input type are not covered at all.

2. **Unused constructs (Cotroneo et al., ISSRE 2025, arXiv 2508.21634).** AI code is "more prone to unused constructs and hardcoded debugging" and "contains more high-risk security vulnerabilities". Hardcoded debugging is covered by skill category G. Unused constructs are not, and the skill's `related_skills` has no link to dead-code detection.

3. **Agents tampering with tests (ImpossibleBench, arXiv 2510.20270, 23 October 2025).** Measured behaviours: modifying tests, overloading comparison operators, recording extra state, and special-casing test inputs. "GPT-5, cheats 54.0% of the time on Conflicting-SWEbench"; Claude Opus 4.1's "primary cheating strategy involves modifying test cases". Skill category C covers tests that assert nothing, but not tests that were modified, special-cased, or defeated through operator overloading. GitHub's guidance on agent pull requests (7 May 2026) agrees: "Any change that weakens CI is a blocker. Full stop."

4. **Resource leaks and contract violations (Sonar, "The Coding Personalities of Leading LLMs", 13 August 2025).** This is a vendor report covering about 4,400 Java tasks. "The models consistently introduced severe bugs like resource leaks and API contract violations". Neither the agent nor the skill has a resource-leak class.

5. **Untrusted input in agent workflows (same GitHub blog post).** It lists as blockers user input interpolated into prompts, an over-permissioned `GITHUB_TOKEN`, and model output executed as shell commands. The files do not cover this.

6. **Copilot's approval can satisfy required reviews.** GitHub's configuration docs offer "Allow Copilot to approve pull requests" and "Allow Copilot approvals to count toward merge requirements" ("Copilot approvals are in public preview"). A repository with these switched on can meet its approval requirement with no human. That bears directly on the skill's "Every AI-generated PR needs human review" (line 44).

7. **Copilot does not review dependency manifests.** Copilot code review excludes "Dependency management files, such as package.json". It therefore cannot catch an invented package where it is declared. Also, as of 12 June 2026 the 4,000-character limit on instruction files "has now been removed", and content exclusions are respected.

8. **Claude Code's own review never blocks and skips test coverage by default.** From the Claude Code Code Review docs: findings "don't approve or block your PR"; the check run "always completes with a neutral conclusion so it never blocks merging"; and by default it "focuses on correctness ... not formatting preferences or missing test coverage". Weak tests are therefore not flagged unless `REVIEW.md` asks for it. The skill's "Claude Code self-critique" row describes CTOC's internal critic, not this product.

9. **The AI-author commit trailer is optional.** Claude Code's default trailer is "Co-authored-by: Claude <claude@anthropic.com>", and setting `false` means "Claude Code adds no commit trailer". A missing trailer does not prove human authorship, so the git-hook detection in skill line 423 is unreliable.

10. **Cursor rules do not reach Tab completions.** Cursor's docs: "Rules do not impact Cursor Tab or other AI features" and "User Rules are not applied to Inline Edit (Cmd/Ctrl+K)." This contradicts skill line 420's description of `.cursor/rules` as editor-time "pre-suggest filters".

11. **Tool configuration files in a diff change what the tools do.** Claude Code subagents: "Inherits every tool available to subagents if omitted." Hooks "execute automatically at specific points in Claude Code's lifecycle." The same applies to `.claude/settings.json` hooks, `.claude/agents/*.md`, `.cursor/rules/*.mdc`, `AGENTS.md`, `.github/copilot-instructions.md` and `REVIEW.md`. Neither file treats these as review targets.

12. **Statements the current literature contradicts.**
    - The over-engineering and complexity framing is contradicted by Cotroneo et al. (row 9).
    - The Veracode figure has been superseded by the 2026 report's 56% pass rate (row 22).
    - Copilot's manifest exclusion contradicts the claim that Copilot filters "block ... hallucinated imports" (row 25).
    - Cursor's Tab exclusion contradicts the "pre-suggest filter" description (item 10).

## 4. What would change these verdicts

- **Rows 1–5 and 8:** a paper that compares AI and human code for over-engineering, naming, comments, style or async misuse specifically.
- **Row 25:** a GitHub page documenting AI-author flags or pattern-blocking review rules.
- **Row 26:** Cursor removing the `.cursorrules` help page.
- **Row 23:** a readable copy of Veracode's 2025 press release.

Most quotes were pulled out by the fetch tool's reading model. The Tambon percentages and the npm registry record are the only ones I read directly.