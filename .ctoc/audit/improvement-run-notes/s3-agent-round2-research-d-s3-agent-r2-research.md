# Round 2 web research for agents/ai-quality/ai-code-quality-reviewer.md (dispatch d-s3-agent-r2-research, citation-validator, installed plugin 6.14.65, 2026-09-30; source classes: standards bodies and established publishers)

# Round 2 citation check: `agents/ai-quality/ai-code-quality-reviewer.md` (dispatch d-s3-agent-r2-research)

**Result.** All 18 unsourced detection rules in the brief (lines 35, 39, 40 and 43) are real. I found none that is fabricated, missing a source, or credited to the wrong source. Four carry caveats and two rest on a summary rather than a verbatim quote (Part 1).

Part 2 found four gaps worth fixing:
- **Configuration files (line 43).** The list misses a root `CLAUDE.md`, `GEMINI.md` and `.mcp.json`.
- **Version reading (line 40).** It misses .NET's `Directory.Packages.props` and `packages.config`.
- **Documentation.** No class covers documentation that was not updated. Google's review guide names it, and so does Claude Code's own Code Review.
- **Two Tambon categories.** Prompt-biased code and wrong input type now have definitions to place them by. Wrong input type may fall between hallucination-detector and type-checker.

No standards body or established publisher I read contradicts the file. No fetched page or file tried to instruct me.

**Two things I could not check:**
- **The round-1 counts disagree with your brief.** The round-1 report on disk records 34 claims across the agent and its skill: 21 validated, 3 fabricated, 7 unsourceable and 3 misattributed. Your brief says 30 claims with 29 validated and one misattribution. I did not reconcile the two.
- **The file's fingerprint is unconfirmed.** I have no tool that computes sha256. The line count, 130, matches.

## 1. Research log

I ran no search-engine queries. Every source was fetched directly by address, and each "query" below is the question put to that fetch.

```json
{
  "research_log": {
    "queries": [
      { "text": "docs.python.org reference: full text of the pass statement section", "source_class": "vendor documentation", "repeated_because": null },
      { "text": "docs.python.org library: full NotImplementedError entry", "source_class": "vendor documentation", "repeated_because": null },
      { "text": "Microsoft Learn: NotImplementedException definition and remarks, versus NotSupportedException", "source_class": "vendor documentation", "repeated_because": null },
      { "text": "Oracle Java SE 21: UnsupportedOperationException class description", "source_class": "vendor documentation", "repeated_because": null },
      { "text": "doc.rust-lang.org: todo! description and its comparison with unimplemented!", "source_class": "vendor documentation", "repeated_because": null },
      { "text": "doc.rust-lang.org: unimplemented! description and its panic message", "source_class": "vendor documentation", "repeated_because": null },
      { "text": "npm docs: package.json description and the dependencies field", "source_class": "vendor documentation", "repeated_because": null },
      { "text": "Microsoft Learn NuGet: PackageReference in project files; Central Package Management; Directory.Packages.props", "source_class": "vendor documentation", "repeated_because": null },
      { "text": "Maven: introduction to the POM, definition and dependencies", "source_class": "vendor documentation", "repeated_because": null },
      { "text": "Gradle user guide: where dependencies are declared (build.gradle / build.gradle.kts); version catalogs", "source_class": "vendor documentation", "repeated_because": null },
      { "text": "Python Packaging User Guide: pyproject.toml specification, dependencies key, PEP 621", "source_class": "standards body", "repeated_because": null },
      { "text": "GitHub docs: repository custom instructions (.github/copilot-instructions.md, *.instructions.md, AGENTS.md, CLAUDE.md, GEMINI.md) and their use by Copilot code review", "source_class": "vendor documentation", "repeated_because": null },
      { "text": "Claude Code Code Review docs: every sentence on REVIEW.md and CLAUDE.md", "source_class": "vendor documentation", "repeated_because": "round 1 read this page for the severity/no-block quote; this pass needed the REVIEW.md and CLAUDE.md sentences" },
      { "text": "Claude Code settings docs: project files under .claude/, CLAUDE.md, .mcp.json", "source_class": "vendor documentation", "repeated_because": null },
      { "text": "Claude Code .claude directory reference: project files Claude Code reads", "source_class": "vendor documentation", "repeated_because": null },
      { "text": "Cursor rules docs: every sentence on AGENTS.md and the legacy .cursorrules file", "source_class": "vendor documentation", "repeated_because": "round 1 read this page for the .mdc quote; this pass needed the AGENTS.md sentences" },
      { "text": "OWASP Top 10 CI/CD Security Risks, CICD-SEC-3: definitions of dependency confusion, typosquatting, brandjacking", "source_class": "standards body", "repeated_because": null },
      { "text": "Google engineering practices, 'What to look for in a code review': headings; over-engineering, tests, documentation, edge cases", "source_class": "publisher", "repeated_because": null },
      { "text": "MITRE CWE-546 Suspicious Comment: description and markers", "source_class": "standards body", "repeated_because": null },
      { "text": "Tambon et al. PDF: definitions of Prompt-biased code and Wrong Input Type", "source_class": "original paper", "repeated_because": "round 1 gave these two categories' percentages without definitions; the brief asked for the definitions" }
    ],
    "sources": [
      { "url": "https://docs.python.org/3/reference/simple_stmts.html", "read_on": "2026-09-30", "bore_on": "line 35: pass (Python)", "outcome": "supported", "quote": "It is useful as a placeholder when a statement is required syntactically, but no code needs to be executed ... def f(arg): pass    # a function that does nothing (yet)", "error": null },
      { "url": "https://docs.python.org/3/library/exceptions.html", "read_on": "2026-09-30", "bore_on": "line 35: NotImplementedError (Python)", "outcome": "supported", "quote": "In user defined base classes, abstract methods should raise this exception when they require derived classes to override the method, or while the class is being developed to indicate that the real implementation still needs to be added.", "error": null },
      { "url": "https://learn.microsoft.com/en-us/dotnet/api/system.notimplementedexception", "read_on": "2026-09-30", "bore_on": "line 35: NotImplementedException (.NET)", "outcome": "supported", "quote": "You might choose to throw a NotImplementedException exception in properties or methods in your own types when a member is still in development and will only be implemented later in production code.", "error": null },
      { "url": "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/UnsupportedOperationException.html", "read_on": "2026-09-30", "bore_on": "line 35: UnsupportedOperationException (Java)", "outcome": "supported", "quote": "Thrown to indicate that the requested operation is not supported. This class is a member of the Java Collections Framework.", "error": null },
      { "url": "https://doc.rust-lang.org/std/macro.todo.html", "read_on": "2026-09-30", "bore_on": "line 35: todo! (Rust)", "outcome": "supported", "quote": "Indicates unfinished code. ... while todo! conveys an intent of implementing the functionality later and the message is \"not yet implemented\", unimplemented! makes no such claims.", "error": null },
      { "url": "https://doc.rust-lang.org/std/macro.unimplemented.html", "read_on": "2026-09-30", "bore_on": "line 35: unimplemented! (Rust) and the words 'not implemented'", "outcome": "supported", "quote": "Indicates unimplemented code by panicking with a message of \"not implemented\".", "error": null },
      { "url": "https://docs.npmjs.com/cli/v11/configuring-npm/package-json", "read_on": "2026-09-30", "bore_on": "line 40: package.json", "outcome": "supported", "quote": "Dependencies are specified in a simple object that maps a package name to a version range.", "error": null },
      { "url": "https://learn.microsoft.com/en-us/nuget/consume-packages/package-references-in-project-files", "read_on": "2026-09-30", "bore_on": "line 40: *.csproj; Part 2 finding 3", "outcome": "supported", "quote": "Package references, using <PackageReference> MSBuild items, specify NuGet package dependencies directly within project files, as opposed to having a separate packages.config file.", "error": null },
      { "url": "https://maven.apache.org/guides/introduction/introduction-to-the-pom.html", "read_on": "2026-09-30", "bore_on": "line 40: pom.xml", "outcome": "supported", "quote": "A Project Object Model or POM is the fundamental unit of work in Maven. It is an XML file that contains information about the project and configuration details used by Maven to build the project.", "error": null },
      { "url": "https://docs.gradle.org/current/userguide/declaring_dependencies.html", "read_on": "2026-09-30", "bore_on": "line 40: build.gradle", "outcome": "supported", "quote": "To add a dependency in Gradle, you use the dependencies{} block in your build script.", "error": null },
      { "url": "https://packaging.python.org/en/latest/specifications/pyproject-toml/", "read_on": "2026-09-30", "bore_on": "line 40: pyproject.toml", "outcome": "supported", "quote": "dependencies lists the expected dependencies of the project as an array of strings. ... The specification of the [project] table was approved through PEP 621.", "error": null },
      { "url": "https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions", "read_on": "2026-09-30", "bore_on": "line 43: .github/copilot-instructions.md, *.instructions.md, AGENTS.md; Part 2 finding 2", "outcome": "supported", "quote": "These are specified in a copilot-instructions.md file in the .github directory of the repository. ... one or more NAME.instructions.md files within or below the .github/instructions directory ... Alternatively, you can use a single CLAUDE.md or GEMINI.md file stored in the root of the repository.", "error": null },
      { "url": "https://code.claude.com/docs/en/code-review.md", "read_on": "2026-09-30", "bore_on": "line 43: REVIEW.md; Part 2 findings 1 and 2", "outcome": "supported", "quote": "REVIEW.md is a file at your repository root that tailors Code Review to your repo.", "error": null },
      { "url": "https://code.claude.com/docs/en/settings.md", "read_on": "2026-09-30", "bore_on": "line 43: .claude/", "outcome": "supported", "quote": "name: 'Shared project', file: '.claude/settings.json', who: 'Everyone in the project'", "error": null },
      { "url": "https://code.claude.com/docs/en/claude-directory.md", "read_on": "2026-09-30", "bore_on": "line 43: .claude/; Part 2 finding 2 (CLAUDE.md, .mcp.json)", "outcome": "supported", "quote": "label: '.mcp.json' ... badge: 'committed', oneLiner: 'Project-scoped MCP servers, shared with your team'", "error": null },
      { "url": "https://cursor.com/docs/context/rules", "read_on": "2026-09-30", "bore_on": "line 43: AGENTS.md", "outcome": "supported", "quote": "AGENTS.md is a simple markdown file for defining agent instructions. ... Place it in your project root as an alternative to .cursor/rules", "error": null },
      { "url": "https://owasp.org/www-project-top-10-ci-cd-security-risks/CICD-SEC-03-Dependency-Chain-Abuse", "read_on": "2026-09-30", "bore_on": "line 39", "outcome": "unreachable", "quote": null, "error": "Status: 308 Permanent Redirect (to https://owasp.github.io/www-project-top-10-ci-cd-security-risks/CICD-SEC-03-Dependency-Chain-Abuse)" },
      { "url": "https://owasp.github.io/www-project-top-10-ci-cd-security-risks/CICD-SEC-03-Dependency-Chain-Abuse", "read_on": "2026-09-30", "bore_on": "line 39: a name that resolves can be a look-alike registered in advance", "outcome": "supported", "quote": "Typosquatting: Publication of malicious packages with similar names to those of popular packages in the hope that a developer will misspell a package name and unintentionally fetch the typosquatted package.", "error": null },
      { "url": "https://google.github.io/eng-practices/review/reviewer/looking-for.html", "read_on": "2026-09-30", "bore_on": "Part 2 findings 1 and 5", "outcome": "supported", "quote": "If a CL changes how users build, test, interact with, or release code, check to see that it also updates associated documentation, including READMEs, g3doc pages, and any generated reference docs.", "error": null },
      { "url": "https://cwe.mitre.org/data/definitions/546.html", "read_on": "2026-09-30", "bore_on": "line 35: TODO and FIXME (outside the brief's list); Part 2 finding 4", "outcome": "supported", "quote": "Many suspicious comments, such as BUG, HACK, FIXME, LATER, LATER2, TODO, in the code indicate missing security functionality and checking.", "error": null },
      { "url": "https://arxiv.org/pdf/2403.08937", "read_on": "2026-09-30", "bore_on": "Part 2 finding 6 (definitions, read directly from PDF pages 14-15)", "outcome": "supported", "quote": "This issue occurs when the LLM excessively relies on provided examples or particular terms in the prompt while implementing a function and it sometimes hinders the generalization or correctness of the generated code.", "error": null }
    ]
  }
}
```

**A note on reading the Tambon paper.** The fetch tool could not pull text out of the PDF. Its words were: "The document appears to be a PDF file containing compressed/encoded image and stream data rather than readable text". The tool had saved a copy, so I read pages 8–12 and 14–17 of that copy directly. The Tambon quotes below are my own reading of those pages. The other quotes were pulled out by the fetch tool's reading model; the settings-page and `.claude`-directory rows are verbatim from the page source I searched.

## 2. Part 1: a verdict for each rule

| # | Line | Rule | Verdict | Evidence | Caveat or recommended action |
|---|---|---|---|---|---|
| 1 | 35 | `pass` (Python) | VALIDATED | Python reference: "useful as a placeholder ... `def f(arg): pass # a function that does nothing (yet)`" | keep. `pass` is also used legitimately; "read each hit" is what keeps false reports out. |
| 2 | 35 | `NotImplementedError` (Python) | VALIDATED | "while the class is being developed to indicate that the real implementation still needs to be added" | keep. The same entry makes it the documented idiom for abstract methods in base classes, so a hit in a base class is not incomplete output. |
| 3 | 35 | `NotImplementedException` (.NET) | VALIDATED | "when a member is still in development and will only be implemented later" | keep |
| 4 | 35 | `UnsupportedOperationException` (Java) | VALIDATED (name and language) | Oracle: "Thrown to indicate that the requested operation is not supported. This class is a member of the Java Collections Framework." | Oracle does **not** describe it as a marker of unfinished work. It is often deliberate, for example in read-only collections. A clause saying so would stop a reader treating every hit as a stub. |
| 5 | 35 | `todo!` (Rust) | VALIDATED | "Indicates unfinished code." | keep |
| 6 | 35 | `unimplemented!` (Rust) | VALIDATED | "Indicates unimplemented code by panicking with a message of "not implemented"." | Per the `todo!` page, `unimplemented!` "makes no such claims" of later implementation, so it can be permanent by design. |
| 7 | 35 | the words "not implemented" | VALIDATED | They are `unimplemented!`'s panic message, verbatim. | `todo!`'s message is "not yet implemented", which this phrase does not match. The macro name itself still catches it. |
| 8 | 40 | `package.json` | VALIDATED | "Dependencies are specified in a simple object that maps a package name to a version range." | keep |
| 9 | 40 | `*.csproj` | VALIDATED | "specify NuGet package dependencies directly within project files" | Incomplete as a place to read versions from; see Part 2, finding 3. |
| 10 | 40 | `pom.xml` | VALIDATED, confidence medium | "It is an XML file that contains information about the project and configuration details" | The quote I got back defines the POM but does not show the literal file name `pom.xml`. |
| 11 | 40 | `build.gradle` | VALIDATED, confidence medium | "you use the `dependencies{}` block in your build script" | The literal file name, and the fact that the page shows `build.gradle.kts` examples too, come from the reading model's summary, not a verbatim quote. |
| 12 | 40 | `pyproject.toml` | VALIDATED | "`dependencies` lists the expected dependencies of the project as an array of strings." (PEP 621) | keep |
| 13 | 43 | `.github/copilot-instructions.md` | VALIDATED | "a `copilot-instructions.md` file in the `.github` directory"; "Custom instructions are enabled for Copilot code review by default" | keep |
| 14 | 43 | `*.instructions.md` | VALIDATED | "`NAME.instructions.md` files within or below the `.github/instructions` directory" | keep |
| 15 | 43 | `REVIEW.md` | VALIDATED | "`REVIEW.md` is a file at your repository root that tailors Code Review to your repo." | keep |
| 16 | 43 | `.claude/` | VALIDATED | `.claude/` directory reference: "Project-level configuration, rules, and extensions"; `settings.json`: "Permissions, hooks, and configuration" | keep. The list is incomplete; see Part 2, finding 2. |
| 17 | 43 | `AGENTS.md` | VALIDATED | Cursor: "`AGENTS.md` is a simple markdown file for defining agent instructions." GitHub, independently: "one or more `AGENTS.md` files, stored anywhere within the repository." | keep. Two unrelated vendors agree. |
| 18 | 39 | A name that resolves can be a look-alike registered in advance | VALIDATED | OWASP CICD-SEC-3, typosquatting: "Publication of malicious packages with similar names to those of popular packages ..." Brandjacking and dependency confusion are defined on the same page. | keep. OWASP covers look-alikes in general, not hallucinated names specifically; round 1's npm record and Aikido evidence cover those. |
| 19 | 35 | `TODO`, `FIXME` (not in the brief's list) | VALIDATED | CWE-546: "comments that suggest the presence of bugs, incomplete functionality, or weaknesses" | keep |

**Counts** (rows 1–18, the brief's list): VALIDATED 18, FABRICATED 0, UNSOURCEABLE 0, MISATTRIBUTED 0. Row 19 is an extra that was also validated. Rows 10 and 11 are medium confidence. Rows 2, 4, 6 and 9 have caveats a critic should weigh.

## 3. Part 2: findings

1. **No class covers documentation that was not updated. Two independent sources name it.**
   - Google's review guide has a "Documentation" section: "If a CL changes how users build, test, interact with, or release code, check to see that it also updates associated documentation".
   - Claude Code's Code Review does the same for instruction files: "if your PR changes code in a way that makes a `CLAUDE.md` statement outdated, Claude flags that the docs need updating too."
   - Neither the ten classes nor the handed-on list at line 45 names it.
   - Recommended action: add "documentation the change makes out of date" to line 45, with an owning agent or the words "no owning agent".
   - Confidence: medium on the finding, high on the sources.

2. **The configuration-file list at line 43 misses files the vendors document as instruction or configuration files.**
   - **`CLAUDE.md` at the repository root or any level.** Claude Code calls it "Project instructions Claude reads every session" and marks it committed. Its Code Review says "You can tune what Claude flags by adding a `CLAUDE.md` or `REVIEW.md` file" and "Claude reads `CLAUDE.md` files at every level of your directory hierarchy". GitHub Copilot also reads "a single `CLAUDE.md` or `GEMINI.md` file stored in the root of the repository".
   - **`GEMINI.md`**, from the same GitHub quote.
   - **`.mcp.json`**: "Project-scoped MCP servers, shared with your team", marked committed. It adds Model Context Protocol servers, meaning tools the assistant can call.
   - Only `.claude/CLAUDE.md` is caught today, through the `.claude/` rule.
   - Round 1 also found that Cursor's help centre still documents the root `.cursorrules` file as "legacy and will be deprecated". The list omits it. I did not re-fetch that page this pass.
   - Recommended action: add `CLAUDE.md`, `GEMINI.md`, `.mcp.json` and `.cursorrules`.
   - Confidence: high. Two vendors agree on `CLAUDE.md`.

3. **For .NET, line 40 can miss the pinned version.**
   - Under Central Package Management, versions live in `Directory.Packages.props`. The NuGet page: "a `<PackageVersion />` item must not be defined in `Directory.Packages.props` for an implicitly defined package".
   - ".NET Framework projects support PackageReference, but currently default to `packages.config`."
   - The NuGet lockfile is `packages.lock.json`.
   - Reading only `*.csproj` finds no version in either case. The file then falls back to confidence LOW, so this is a coverage gap, not a false finding.
   - Recommended action: add `Directory.Packages.props` and `packages.config`.
   - Two further gaps rest on belief, not a verbatim quote. The Gradle page shows `build.gradle.kts` examples according to the reading model's summary. The file greps for Rust markers but names no Rust manifest; this pass did not fetch Cargo's documentation, so I state that only as a gap inside the file itself.

4. **The unfinished-work grep lists fewer markers than the standard does.** CWE-546 lists "BUG, HACK, FIXME, LATER, LATER2, TODO". Line 35 has only `TODO` and `FIXME`. The gap is small, because every hit is read before it is reported anyway. I found no CWE severity for this weakness; I did not look.

5. **Google's guide agrees with three existing classes and contradicts none.**
   - Over-engineering: "developers have made the code more generic than it needs to be, or added functionality that isn't presently needed". This matches line 37.
   - Vacuous tests: "Will the tests actually fail when the code is broken?" This matches line 41.
   - Edge cases and concurrency: "thinking about edge cases, looking for concurrency problems". This matches line 36, and concurrency is handed to concurrency-checker.
   - Google sets no severities, so there is nothing to compare line 74 against.

6. **Tambon et al.'s definitions, read from PDF pages 14–15.**
   - **Prompt-biased code:** "This issue occurs when the LLM excessively relies on provided examples or particular terms in the prompt while implementing a function and it sometimes hinders the generalization or correctness of the generated code." In their example, the code "is accurate only for the specific example provided in the prompt ... and will fail in other cases". The paper calls it "less common across the models".
     - Where it fits: it is special-casing, but against the request's own examples rather than the tests.
     - Line 42 greps production code only for literals from the test expectations.
     - Recommended action: extend that check to literal values from the request's examples.
   - **Wrong Input Type:** "We use this label when LLM uses an incorrect input type in a correct function call." Their example: "the Python built-in function min is called on a List of ClassType inputs which raises an error." The paper calls it "the least frequent bug pattern".
     - Where it fits: line 45 hands "a library call with a wrong signature, option or argument" to hallucination-detector.
     - That agent's remit is things that do not exist. A wrong-type argument to a real built-in is not a hallucination.
     - This session's skill list includes a type-checker. The critic should decide whether that is where it belongs.
   - I did not re-read the percentages in Figure 2 this pass. Round 1's 6.52% and 5.91% are carried over, not re-checked.
   - The paper's other two categories, "Hallucinated Object" (an undefined name) and "Wrong Attribute", fit the existing hand-over to hallucination-detector.

7. **Nothing in the file is contradicted** by any standards body or established publisher read this pass: OWASP, MITRE CWE, Google, the Python Packaging User Guide. Two soft tensions exist, and the file's "read each hit before reporting it" already defuses both:
   - Oracle's meaning for `UnsupportedOperationException`.
   - Python's abstract-method use of `NotImplementedError`.

**Not examined this pass:**
- IEEE 1028 (not attempted; the standard is paywalled).
- The OWASP Code Review Guide.
- The SEI CERT coding standards.
- A second route for line 39 through NIST SP 800-204D, the OpenSSF or CISA.
- Tambon's Figure 2 percentages.
- Gradle version catalogs.
- Cargo's documentation.
- A re-check of `.cursorrules` against the current Cursor pages.
- The NuGet Central Package Management page itself.

Tool calls used: 27 of 30.

## 4. What would change these verdicts

- Rows 10 and 11 would move to high confidence with a verbatim quote of the literal names `pom.xml` and `build.gradle` from the Maven and Gradle pages.
- Row 4 would become MISATTRIBUTED if a reviewer reads line 35 as claiming Java's own documentation calls `UnsupportedOperationException` unfinished work. Oracle's documentation says "not supported".
- Finding 2 would weaken if GitHub or Anthropic stopped documenting `CLAUDE.md`, `GEMINI.md` or `.mcp.json`.