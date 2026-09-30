# Round 2 critique of agents/ai-quality/ai-code-quality-reviewer.md (dispatch d-s3-agent-r2-critic, agent-critic from installed plugin 6.14.65, 2026-09-30)

Round 2 changes eleven places in the agent file and makes no frontmatter change. The main additions:
- sources for all four detection rules, plus the three "used on purpose" caveats;
- four more coding-assistant configuration files (`CLAUDE.md`, `GEMINI.md`, `.mcp.json`, `.cursorrules`);
- two more .NET version files (`Directory.Packages.props`, `packages.config`);
- documentation the change makes out of date, handed to documentation-updater;
- prompt-biased code placed under a misread request, and wrong input type handed to type-checker.

Four corrections of round-1 work:
- **Wrong input type.** I had placed it provisionally with hallucination-detector; it moves to type-checker.
- **Prompt-biased code.** I had left it unplaced; it is now placed.
- **Two owners for error handling.** My own round-1 text gave it to both code-reviewer and error-handler-checker; it is now split to match each agent's own description.
- **Type names.** The skill and the agent used different names for the same classes, which would stop the two outputs being matched; the output section now maps the skill's names onto the agent's.

I read the file fresh from disk: 130 lines, with the round-1 edits and the re-validation's correction to the benchmark bullet. I cannot compute the hash, but the line count and content match the brief. Every `old` string below is taken from those bytes.

```json
{
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
  ],
  "findings": [
    {
      "id": "f-s3-agent-r2-1",
      "kind": "new",
      "text": "Adds sources for the four detection rules the file stated without one, all validated by the round-2 research (the unfinished-work markers and their languages, the manifest names, the configuration files, the look-alike registration). Each rule gets one sentence naming its references, with quotes only where a quote changes behaviour: the three caveats, and the entries that back new list items. The same insertion adds a 'Handed on, with a source' bullet for the wrong-input-type definition (f-s3-agent-r2-6) and the documentation evidence (f-s3-agent-r2-5). Confidence is medium that the Maven and Gradle pages name the literal files pom.xml and build.gradle (report rows 10 and 11); the rule's source is still sound. The .cursorrules quote comes from round 1's source (https://cursor.com/help/customization/rules, read 2026-09-30), which this pass did not re-fetch. Finding 2 of this round's report repeats it.",
      "evidence": "round-2 research report part 1, rows 1-19 'VALIDATED 18, FABRICATED 0'; part 2 findings 1, 2, 3, 6; agents/ai-quality/ai-code-quality-reviewer.md:35, :39, :40, :43, :57",
      "proposed_change": {
        "old": "issues that require a holistic understanding of an application.\"",
        "new": "issues that require a holistic understanding of an application.\"\n- **Handed on, with a source.** A real call given an argument of the wrong type is what Tambon and colleagues call wrong input type (https://arxiv.org/pdf/2403.08937): \"We use this label when LLM uses an incorrect input type in a correct function call.\" It is a type error in a call that exists, not an invented interface, so it goes to type-checker. Documentation left out of date is named by Google's review guide (https://google.github.io/eng-practices/review/reviewer/looking-for.html): \"If a CL changes how users build, test, interact with, or release code, check to see that it also updates associated documentation, including READMEs, g3doc pages, and any generated reference docs.\" Claude Code's Code Review names it too (https://code.claude.com/docs/en/code-review.md): \"if your PR changes code in a way that makes a `CLAUDE.md` statement outdated, Claude flags that the docs need updating too.\"\n- **Detection rules.** The unfinished-work markers come from each language's reference: Python (https://docs.python.org/3/reference/simple_stmts.html calls `pass` \"useful as a placeholder\"; https://docs.python.org/3/library/exceptions.html), .NET (https://learn.microsoft.com/en-us/dotnet/api/system.notimplementedexception: \"when a member is still in development and will only be implemented later\"), Java (https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/UnsupportedOperationException.html) and Rust (https://doc.rust-lang.org/std/macro.todo.html: \"Indicates unfinished code.\"; https://doc.rust-lang.org/std/macro.unimplemented.html); the comment markers come from MITRE's CWE-546, \"Suspicious Comment\" (https://cwe.mitre.org/data/definitions/546.html): \"BUG, HACK, FIXME, LATER, LATER2, TODO\". Three of those markers are also used on purpose: Python's reference says \"In user defined base classes, abstract methods should raise this exception\"; Oracle describes `UnsupportedOperationException` only as \"Thrown to indicate that the requested operation is not supported\"; and Rust's `todo!` page says that \"unimplemented! makes no such claims\" of a later implementation. The dependency manifests are those named by npm (https://docs.npmjs.com/cli/v11/configuring-npm/package-json), NuGet (https://learn.microsoft.com/en-us/nuget/consume-packages/package-references-in-project-files: \".NET Framework projects support PackageReference, but currently default to `packages.config`.\", and for central package management, \"a `<PackageVersion />` item must not be defined in `Directory.Packages.props` for an implicitly defined package\"), Maven (https://maven.apache.org/guides/introduction/introduction-to-the-pom.html), Gradle (https://docs.gradle.org/current/userguide/declaring_dependencies.html) and the Python Packaging User Guide (https://packaging.python.org/en/latest/specifications/pyproject-toml/). The coding-assistant configuration files are those named by GitHub (https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions: \"Alternatively, you can use a single CLAUDE.md or GEMINI.md file stored in the root of the repository.\"), Claude Code (https://code.claude.com/docs/en/claude-directory.md, on `.claude/`: \"Project-level configuration, rules, and extensions\", and on `.mcp.json`: \"Project-scoped MCP servers, shared with your team\"; https://code.claude.com/docs/en/code-review.md: \"REVIEW.md is a file at your repository root that tailors Code Review to your repo.\" and \"Claude reads `CLAUDE.md` files at every level of your directory hierarchy\"), Cursor (https://cursor.com/docs/context/rules: \"AGENTS.md is a simple markdown file for defining agent instructions.\") and Cursor's help centre, which calls a root `.cursorrules` file \"legacy and will be deprecated\" (https://cursor.com/help/customization/rules). A registry name that resolves can still be a look-alike: OWASP's Top 10 CI/CD Security Risks defines typosquatting as \"Publication of malicious packages with similar names to those of popular packages\" (https://owasp.github.io/www-project-top-10-ci-cd-security-risks/CICD-SEC-03-Dependency-Chain-Abuse)."
      },
      "needs_human": false
    },
    {
      "id": "f-s3-agent-r2-2",
      "kind": "new",
      "text": "The unfinished-work marker list (line 35) changes three ways. It is narrowed to a `pass` statement, since a bare `pass` also matches words such as 'password'. It gains CWE-546's comment markers BUG, HACK and LATER (LATER also matches LATER2). And it names the three hits the references show are often deliberate: NotImplementedError in an abstract method, UnsupportedOperationException ('not supported' in Oracle's words), and an unimplemented! meant to stay. Without that clause a reader would report every such hit as a stub. The read-only collection example is the report's own gloss (row 4), not Oracle's words. todo!'s message 'not yet implemented' does not match the phrase 'not implemented', but the macro name still catches it (row 7), so no change is needed there.",
      "evidence": "https://cwe.mitre.org/data/definitions/546.html, read 2026-09-30: \"BUG, HACK, FIXME, LATER, LATER2, TODO\"; https://docs.python.org/3/library/exceptions.html: \"In user defined base classes, abstract methods should raise this exception\"; https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/UnsupportedOperationException.html: \"Thrown to indicate that the requested operation is not supported.\"; https://doc.rust-lang.org/std/macro.todo.html: \"unimplemented! makes no such claims.\"",
      "proposed_change": {
        "old": "Grep the changed files for `pass`, `TODO`, `FIXME`, `NotImplementedError`, `NotImplementedException`, `UnsupportedOperationException`, `todo!`, `unimplemented!` and the words \"not implemented\", and read each hit before reporting it. | — |",
        "new": "Grep the changed files for a `pass` statement, the comment markers `TODO`, `FIXME`, `BUG`, `HACK` and `LATER`, `NotImplementedError`, `NotImplementedException`, `UnsupportedOperationException`, `todo!`, `unimplemented!` and the words \"not implemented\", and read each hit before reporting it. Three hits are often by design and are not incomplete output: `NotImplementedError` raised by a base class's abstract method, `UnsupportedOperationException` thrown by a type that deliberately does not support the operation (a read-only collection, for example), and an `unimplemented!` meant to stay. | — |"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-agent-r2-3",
      "kind": "new",
      "text": "The configuration list (line 43) gains four files: CLAUDE.md at any level (GitHub and Claude Code both document it; today only .claude/CLAUDE.md is caught), GEMINI.md, .mcp.json (it adds tool servers) and the root .cursorrules. The hand-on is also reworded into llm-security-tester's own terms. Its description names applications that call language models, not a coding assistant's configuration; the work is claimed only in its body, which lists 'A tool is added to an agent' and 'A capability provider or extension server is installed', each marked 'Always' (lines 35-36).",
      "evidence": "https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions, read 2026-09-30: \"Alternatively, you can use a single CLAUDE.md or GEMINI.md file stored in the root of the repository.\"; https://code.claude.com/docs/en/claude-directory.md: \"Project-scoped MCP servers, shared with your team\"; round-2 report part 2 finding 2: \"Claude reads `CLAUDE.md` files at every level of your directory hierarchy\", \"legacy and will be deprecated\"; agents/ai-quality/llm-security-tester.md:3, :35-36",
      "proposed_change": {
        "old": "a file under `.claude/` or `.cursor/rules/`, or one named `AGENTS.md`, `REVIEW.md`, `.github/copilot-instructions.md` or ending in `.instructions.md`. Report the path and what the change adds or removes, confidence HIGH. | What the change lets the assistant do: llm-security-tester |",
        "new": "a file under `.claude/` or `.cursor/rules/`, or one named `CLAUDE.md` (at any level), `GEMINI.md`, `AGENTS.md`, `REVIEW.md`, `.mcp.json`, `.cursorrules`, `.github/copilot-instructions.md` or ending in `.instructions.md`. Report the path and what the change adds or removes, confidence HIGH. | What the change lets the assistant do — a tool added to an agent, a capability server installed: llm-security-tester |"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-agent-r2-4",
      "kind": "new",
      "text": "For .NET the version list (line 40) misses the two files where versions are often pinned: Directory.Packages.props under central package management, and packages.config, the .NET Framework default. Reading only *.csproj finds no version in either case and drops to confidence LOW, so today this is a coverage gap rather than a false finding. The file also names no Rust manifest; see f-s3-agent-r2-13.",
      "evidence": "https://learn.microsoft.com/en-us/nuget/consume-packages/package-references-in-project-files, read 2026-09-30: \"as opposed to having a separate packages.config file.\"; round-2 report part 2 finding 3: \"a `<PackageVersion />` item must not be defined in `Directory.Packages.props` for an implicitly defined package\", \".NET Framework projects support PackageReference, but currently default to `packages.config`.\"",
      "proposed_change": {
        "old": "(`package.json`, a lockfile, `*.csproj`, `pom.xml`, `build.gradle`, `pyproject.toml`)",
        "new": "(`package.json`, a lockfile, `*.csproj`, `Directory.Packages.props`, `packages.config`, `pom.xml`, `build.gradle`, `pyproject.toml`)"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-agent-r2-5",
      "kind": "new",
      "text": "Documentation the change makes out of date is handed on to documentation-updater, whose description is 'Updates API docs, README, code comments, and changelog entries'. No agent's description claims to detect stale documentation, so the detection is written into this file as a Grep this agent can run: for a renamed or removed command, option, public function, configuration key or environment variable, or a changed build, test or run step, search README files, docs/ and CLAUDE.md files for the old name. Each hit is recorded as documentation out of date and handed to documentation-updater. It is not made an eleventh class: no measurement ties it to assistant-written code, and the fix belongs to the documentation writer.",
      "evidence": "https://google.github.io/eng-practices/review/reviewer/looking-for.html, read 2026-09-30: \"If a CL changes how users build, test, interact with, or release code, check to see that it also updates associated documentation, including READMEs, g3doc pages, and any generated reference docs.\"; round-2 report part 2 finding 1 (Claude Code Code Review): \"if your PR changes code in a way that makes a `CLAUDE.md` statement outdated, Claude flags that the docs need updating too.\"; agents/documentation/documentation-updater.md:3",
      "proposed_change": {
        "old": "For a file, socket or connection left open, this file names no owning agent:",
        "new": "When the change renames or removes a command, option, public function, configuration key or environment variable, or changes how the code is built, tested or run, Grep the repository's README files, `docs/` and `CLAUDE.md` files for the old name or step, and record each hit that still states the old behaviour as documentation out of date (documentation-updater). For a file, socket or connection left open, this file names no owning agent:"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-agent-r2-6",
      "kind": "correction-of-earlier-round",
      "text": "Corrects f-s3-agent-r1-10. Round 1 placed wrong input type provisionally with hallucination-detector, from the name alone. The paper's definition is a wrong-type argument to a real call. That is not a hallucination: hallucination-detector's remit is things that do not exist. It is a type error, and type-checker's own checks list 'Type Mismatches' under 'Function arguments'. Line 45 now sends a signature or option the library does not have to hallucination-detector, and a wrong-type argument to type-checker. The evidence is in the bullet f-s3-agent-r2-1 inserts.",
      "evidence": "https://arxiv.org/pdf/2403.08937 (round-2 report part 2 finding 6, read directly from the PDF), read 2026-09-30: \"We use this label when LLM uses an incorrect input type in a correct function call.\"; agents/quality/type-checker.md:3 'Static type analysis', :46-47 'Type Mismatches - Function arguments'; agents/ai-quality/hallucination-detector.md:3 'references non-existent packages, APIs, methods, or fabricated patterns'",
      "proposed_change": {
        "old": "a library call with a wrong signature, option or argument (hallucination-detector);",
        "new": "a library call with a signature or option the library does not have (hallucination-detector); a real call given an argument of the wrong type (type-checker);"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-agent-r2-7",
      "kind": "correction-of-earlier-round",
      "text": "Closes f-s3-agent-r1-9, which left prompt-biased code unplaced for lack of a definition. The paper defines it as code that relies on the prompt's examples and fails to generalise. That is a misread of the request's general intent, so it goes under 'Misread request' (line 34), detected by the same literal-value Grep as line 42 but aimed at the request's examples. The brief suggested extending line 42; I put it in the misread-request row instead, because line 42 is about tests and a match against the request's examples is not a test change. Both the class name and the severity (high) fit the misread-request row.",
      "evidence": "https://arxiv.org/pdf/2403.08937 (read directly from PDF pages 14-15), read 2026-09-30: \"This issue occurs when the LLM excessively relies on provided examples or particular terms in the prompt while implementing a function and it sometimes hinders the generalization or correctness of the generated code.\"",
      "proposed_change": {
        "old": "adds statements unrelated to it, or changes a file the plan's `files:` list does not name.",
        "new": "adds statements unrelated to it, is correct only for the examples the request gives (Grep the production files for the literal values in those examples, and read each hit), or changes a file the plan's `files:` list does not name."
      },
      "needs_human": false
    },
    {
      "id": "f-s3-agent-r2-8",
      "kind": "new",
      "text": "The evidence bullet for the misread request (line 51) gains the paper's definition of prompt-biased code, so the check added by f-s3-agent-r2-7 carries its source. No percentage is added: the report did not re-read the paper's percentage figure this pass.",
      "evidence": "https://arxiv.org/pdf/2403.08937, read 2026-09-30: \"This issue occurs when the LLM excessively relies on provided examples or particular terms in the prompt while implementing a function and it sometimes hinders the generalization or correctness of the generated code.\"; round-2 report part 2 finding 6: 'I did not re-read the percentages in Figure 2 this pass.'",
      "proposed_change": {
        "old": "The same paper's abstract (https://arxiv.org/abs/2403.08937):",
        "new": "Its definition of prompt-biased code, checked here under a misread request: \"This issue occurs when the LLM excessively relies on provided examples or particular terms in the prompt while implementing a function and it sometimes hinders the generalization or correctness of the generated code.\" The same paper's abstract (https://arxiv.org/abs/2403.08937):"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-agent-r2-9",
      "kind": "correction-of-earlier-round",
      "text": "Corrects my round-1 text, which gave error handling to two agents: 'Error paths as such: error-handler-checker' (line 36) and 'error handling' under code-reviewer (line 45). The split now follows each agent's own description. An error path with no handling or fallback goes to error-handler-checker ('Verifies all error paths are handled with proper fallbacks'). Handling that swallows or over-catches goes to code-reviewer ('error handling that swallows or over-catches'). error-handler-checker also lists 'swallowed errors' as a dispatch phrase, so the two siblings overlap each other. That overlap is theirs, not this file's.",
      "evidence": "agents/specialized/error-handler-checker.md:3; agents/quality/code-reviewer.md:3; agents/ai-quality/ai-code-quality-reviewer.md:36, :45",
      "proposed_change": {
        "old": "| Error paths as such: error-handler-checker |",
        "new": "| An error path with no handling or fallback: error-handler-checker |"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-agent-r2-10",
      "kind": "correction-of-earlier-round",
      "text": "The second half of f-s3-agent-r2-9: on line 45, the code-reviewer share of error handling is narrowed to the part code-reviewer's description claims.",
      "evidence": "agents/quality/code-reviewer.md:3 'error handling that swallows or over-catches'",
      "proposed_change": {
        "old": "complexity, redundant conditions, error handling, debug output left in,",
        "new": "complexity, redundant conditions, error handling that swallows or over-catches, debug output left in,"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-agent-r2-11",
      "kind": "new",
      "text": "The agent and its skill disagree on names. The agent types findings 'vacuous_test', 'stale_framework_idiom' and 'misread_request'. The skill names the same classes 'vacuous_test_assertion', 'deprecated_api_pattern' and 'framework_version_mismatch', and 'missing_business_rule' and 'unrelated_edit', and the agent's type list ends with 'a type the skill names'. So one defect could be typed two ways, and records of the same defect would not be matched as duplicates. The output section now maps the skill's names onto the agent's.",
      "evidence": "skills/ai-quality/ai-code-quality-reviewer/SKILL.md:450-452 'hallucinated_import | deprecated_api_pattern | vacuous_test_assertion | race_condition | ai_sql_injection | framework_version_mismatch | debug_print_left | missing_business_rule | prompt_drift | unrelated_edit'; agents/ai-quality/ai-code-quality-reviewer.md:94",
      "proposed_change": {
        "old": "Return the response schema of `docs/DISPATCH_PROTOCOL.md`, findings ordered critical first:",
        "new": "Return the response schema of `docs/DISPATCH_PROTOCOL.md`, findings ordered critical first. Where the skill names the same class differently, use this file's type: the skill's `vacuous_test_assertion` is `vacuous_test`, its `deprecated_api_pattern` and `framework_version_mismatch` are `stale_framework_idiom`, and its `missing_business_rule` and `unrelated_edit` are `misread_request`. The schema:"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-agent-r2-12",
      "kind": "new",
      "text": "Line 49 says the unmeasured classes are 'checked because they are defects', but nothing in the file supports that for over-engineering and vacuous tests. Google's review guide asks both questions. The bullet on unmeasured classes (line 56) now cites it, without adding any claim about how often they occur.",
      "evidence": "round-2 report part 2 finding 5, https://google.github.io/eng-practices/review/reviewer/looking-for.html, read 2026-09-30: \"developers have made the code more generic than it needs to be, or added functionality that isn't presently needed\"; \"Will the tests actually fail when the code is broken?\"",
      "proposed_change": {
        "old": "- **Fabricated patterns, stale framework idioms, vacuous tests.** This file cites no measurement of how often they occur.",
        "new": "- **Fabricated patterns, stale framework idioms, vacuous tests.** This file cites no measurement of how often they occur. Over-engineering and vacuous tests are still standard review questions in Google's review guide (https://google.github.io/eng-practices/review/reviewer/looking-for.html): whether \"developers have made the code more generic than it needs to be, or added functionality that isn't presently needed\", and \"Will the tests actually fail when the code is broken?\""
      },
      "needs_human": false
    },
    {
      "id": "f-s3-agent-r2-13",
      "kind": "new",
      "text": "Two gaps stay open, with no text change, because this round's report does not source them. First, line 35 searches for Rust markers but line 40 names no Rust manifest, so a Rust version falls back to confidence LOW; the Cargo documentation was not fetched. Second, Gradle's build.gradle.kts appears only in the fetch tool's summary, not in a verbatim quote. Both are for round 3, which uses another class of source.",
      "evidence": "round-2 report part 2 finding 3: 'The file greps for Rust markers but names no Rust manifest; this pass did not fetch Cargo's documentation'; part 1 row 11 'come from the reading model's summary, not a verbatim quote'",
      "proposed_change": null,
      "needs_human": false
    },
    {
      "id": "f-s3-agent-r2-14",
      "kind": "new",
      "text": "Checked the definition of every agent the file hands work to; no text change beyond the edits above. The re-validator had checked only that the agents exist. Fourteen of the sixteen claim the work in their own description: code-reviewer, error-handler-checker, code-smell-detector, hallucination-detector, type-checker, mutation-test-runner, duplicate-code-detector, dead-code-detector, memory-safety-checker, api-contract-validator, performance-profiler, concurrency-checker, sast-scanner, and documentation-updater (which updates documentation; it does not review it). ci-pipeline-checker's description claims 'pipeline security', and its body names the workflow token. llm-security-tester claims coding-assistant configuration only in its body; f-s3-agent-r2-3 rewords that row in its body's terms. The one hand-on that was not honest, wrong-type arguments sent to hallucination-detector, is corrected by f-s3-agent-r2-6.",
      "evidence": "agents/quality/code-reviewer.md:3, :158, :160; agents/specialized/error-handler-checker.md:3; agents/quality/code-smell-detector.md:3; agents/ai-quality/hallucination-detector.md:3, :40-50, :77-83; agents/quality/type-checker.md:3, :46-47; agents/testing/runners/mutation-test-runner.md:3; agents/quality/duplicate-code-detector.md:3; agents/quality/dead-code-detector.md:3; agents/specialized/memory-safety-checker.md:3; agents/specialized/api-contract-validator.md:3; agents/specialized/performance-profiler.md:3; agents/security/concurrency-checker.md:3; agents/security/sast-scanner.md:3; agents/infrastructure/ci-pipeline-checker.md:3, :127; agents/ai-quality/llm-security-tester.md:3, :35-36; agents/documentation/documentation-updater.md:3",
      "proposed_change": null,
      "needs_human": false
    }
  ],
  "seven_languages": {
    "applies": true,
    "reason": "The domain is code in any language the project uses, so the rule applies. The file still holds no pairs of defect-and-better examples, so the rule is met by deferring to the skill body. Its only code is one TypeScript test in the output example. Its search rules now carry sources for Python, .NET, Java and Rust markers, language-neutral comment markers that also cover C, C++ and SQL, and manifests for JavaScript and TypeScript, .NET, Java and Python. The skill body still has no C or C++ example."
  },
  "sibling_boundary": {
    "hallucination-detector": "Defers: existence of packages, methods and options, look-alike names and signatures or options the library lacks go to it, and after f-s3-agent-r2-6 it no longer receives wrong-type arguments to real calls.",
    "code-reviewer": "Defers: naming, comments, style, complexity read-level, redundant conditions, swallowing or over-catching error handling, debug output, a TODO beside finished code, readability of intent and tests with no assertion, all claimed in its description or body.",
    "error-handler-checker": "Defers: an error path with no handling or fallback, matching its description.",
    "type-checker": "Defers (new this round): a wrong-type argument to a real call, matching its 'Function arguments' check.",
    "documentation-updater": "Defers (new this round): documentation left out of date, which it updates; this agent only finds the stale lines.",
    "code-smell-detector": "Defers: the general smell catalogue; this agent keeps only the use-count evidence for over-engineering.",
    "mutation-test-runner": "Defers: measuring whether the suite catches changed code.",
    "llm-security-tester": "Defers: what a configuration change lets the assistant do, and prompts or executed output; its body, not its description, claims the configuration work.",
    "duplicate-code-detector": "Defers: copy-pasted logic.",
    "dead-code-detector": "Defers: unused variables, functions, exports and imports.",
    "memory-safety-checker": "Defers: memory leaks and leaked listeners.",
    "api-contract-validator": "Defers: a service interface that departs from its published contract.",
    "performance-profiler": "Defers: a query issued once per row and other hot paths.",
    "concurrency-checker": "Defers: async and thread-safety races.",
    "sast-scanner": "Defers: injection and unsafe data sinks.",
    "ci-pipeline-checker": "Defers: a workflow's permissions; its description claims pipeline security and its body names the workflow token."
  },
  "nothing_found": false
}
```

**For the skill's rounds** (what this report adds for `skills/ai-quality/ai-code-quality-reviewer/SKILL.md`):
1. **Type names.** Align them with the agent (`vacuous_test`, `stale_framework_idiom`, `misread_request`), or map them in the skill's output schema; the agent now maps them from its side.
2. **Deliberate uses of unfinished-work markers.** Add the three caveats wherever the skill treats these markers as stubs: `NotImplementedError` as the abstract-method idiom, `UnsupportedOperationException` as "not supported", and `unimplemented!` meant to stay.
3. **Version files.** The framework-version and .NET examples should name `Directory.Packages.props` and `packages.config`, since `*.csproj` alone can hold no version.
4. **Configuration files.** The skill mentions only `.cursor/rules`; the documented files are `CLAUDE.md` (any level), `GEMINI.md`, `.mcp.json`, `AGENTS.md`, `REVIEW.md`, `.github/copilot-instructions.md`, `*.instructions.md` and `.cursorrules` (legacy).
5. **Tambon definitions.** Prompt-biased code belongs under the skill's missing-business-rule and unrelated-edit area. Wrong input type is a type error, not a hallucination. "Hallucinated Object" and "Wrong Attribute" fit the skill's hallucinated-import category and hallucination-detector.
6. **Look-alike packages.** OWASP's CI/CD Top 10 typosquatting definition is a standards-body source for them in general. The skill's `react-codeshift` evidence stays the source for hallucinated names specifically.
7. **Google's review guide.** It is a publisher source for the skill's over-engineering, test-strength, edge-case and documentation checks.
8. **Documentation left out of date.** The skill has no such category; it should hand it to documentation-updater as the agent now does.
9. **Rust and Gradle.** Cargo's manifest documentation and a verbatim quote for `build.gradle.kts` are still unread. The next round of the agent or the skill should fetch both.

Risks to watch:
- **Quote provenance.** Most quotes in this round came through the fetch tool's reading model. Only the Tambon definitions (read by hand from the PDF) and the Claude Code settings and `.claude` directory pages are verbatim from source. Maven and Gradle file names are medium confidence.
- **The `.cursorrules` quote was not re-fetched this round.** It comes from round 1.
- **Claim counts.** The report notes that the round-1 claim counts in the coordinator's brief to the validator (30 claims) differ from the round-1 report on disk (34 claims). I did not reconcile the two.