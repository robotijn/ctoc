# Round 3 critique of agents/ai-quality/ai-code-quality-reviewer.md (dispatch d-s3-agent-r3-critic, agent-critic from installed plugin 6.14.65, 2026-09-30; the critic read the ANSSI/BSI PDF itself)

Round 3 makes nine edits to the agent file and no frontmatter change:
- **Two misquotes corrected.** The commit-trailer quote now uses the settings page's own words. "Oracle describes it only as" is replaced by Oracle's documentation of unmodifiable collections, which also sources the read-only-collection example in the incomplete-output row.
- **Manifest and lockfile names sourced.** `Cargo.toml` and `build.gradle.kts` are added. Eight lockfiles are named, with a rule that a missing lockfile is not a finding.
- **Google's over-engineering quote completed** with "by the system".
- **Regulator source added.** I read the French and German joint report in full, all 16 pages, from the saved copy. It contradicts nothing in the file and supports five of its rules. It names three concerns the hand-on list missed: vulnerable or outdated dependencies (to dependency-checker), weak hashing such as MD5 for passwords (to sast-scanner), and generated comments or documentation that describe behaviour the code lacks (to documentation-updater). Separately, I added hardcoded credentials, which go to secrets-detector.

I read the file fresh from disk: 132 lines, including "can be by design". Every `old` string below is taken from those bytes.

```json
{
  "queries": [
    { "text": "Maven POM introduction: verbatim sentences containing pom.xml", "source_class": "vendor documentation", "repeated_because": "round 2 got no literal 'pom.xml' in a verbatim quote (medium confidence)" },
    { "text": "Gradle declaring dependencies: verbatim lines containing build.gradle / build.gradle.kts", "source_class": "vendor documentation", "repeated_because": "round 2's file names came from the reading model's summary (medium confidence)" },
    { "text": "Google eng-practices raw markdown source: looking-for.md three sentences", "source_class": "publisher", "repeated_because": "round 2 quotes came through a summarising fetch" },
    { "text": "Cargo guide: Cargo.toml versus Cargo.lock", "source_class": "vendor documentation", "repeated_because": null },
    { "text": "npm docs: package-lock.json description", "source_class": "vendor documentation", "repeated_because": null },
    { "text": "Yarn classic docs: yarn.lock", "source_class": "vendor documentation", "repeated_because": null },
    { "text": "pnpm docs: working with Git, pnpm-lock.yaml", "source_class": "vendor documentation", "repeated_because": null },
    { "text": "NuGet PackageReference page: packages.lock.json, plus the two quotes the file already uses", "source_class": "vendor documentation", "repeated_because": "file's two NuGet quotes came through a summarising fetch; page also carries the lockfile section" },
    { "text": "Poetry basic usage: poetry.lock", "source_class": "vendor documentation", "repeated_because": null },
    { "text": "uv project layout: uv.lock", "source_class": "vendor documentation", "repeated_because": null },
    { "text": "Gradle dependency locking: gradle.lockfile", "source_class": "vendor documentation", "repeated_because": null },
    { "text": "Oracle Java SE 21 Collection interface: UnsupportedOperationException and unmodifiable collections", "source_class": "vendor documentation", "repeated_because": null },
    { "text": "ANSSI/BSI joint report on AI coding assistants: landing page", "source_class": "regulator", "repeated_because": null },
    { "text": "NIST SP 800-218A page: title, date, abstract, scope regarding AI-generated code", "source_class": "regulator", "repeated_because": null },
    { "text": "CISA guidance AI-generated code review secure by design \"AI-generated code\" 2025 2026", "source_class": "broad web", "repeated_because": null },
    { "text": "Maven lock file dependency locking official \"maven.apache.org\" reproducible builds no lockfile", "source_class": "broad web", "repeated_because": null },
    { "text": "ANSSI/BSI report PDF (blob URL)", "source_class": "regulator", "repeated_because": null },
    { "text": "arXiv 2510.00730 Maven-Lockfile abstract", "source_class": "original paper", "repeated_because": null },
    { "text": "Claude Code settings reference, .md form: attribution / commit trailer", "source_class": "vendor documentation", "repeated_because": "round 1 quote came through a summarising fetch; round 2's raw read was settings.md, a different page" },
    { "text": "Read the saved ANSSI and BSI PDF in full, pages 1-16, for review concerns about assistant-written code and for anything the file contradicts", "source_class": "regulator", "repeated_because": "the round-3 validator could not extract the PDF's text; the critic read the saved copy with its Read tool" }
  ],
  "sources": [
    { "url": "https://maven.apache.org/guides/introduction/introduction-to-the-pom.html", "read_on": "2026-09-30", "bore_on": "line 40 pom.xml", "outcome": "supported", "quote": "As the name suggests, it's the relative path from the module's `pom.xml` to the parent's `pom.xml`.", "error": null },
    { "url": "https://docs.gradle.org/current/userguide/declaring_dependencies.html", "read_on": "2026-09-30", "bore_on": "line 40 build.gradle; gap build.gradle.kts", "outcome": "supported", "quote": "\"build.gradle\" / \"build.gradle.kts\" (code-sample captions, each shown several times)", "error": null },
    { "url": "https://raw.githubusercontent.com/google/eng-practices/master/review/reviewer/looking-for.md", "read_on": "2026-09-30", "bore_on": "lines 56, 58", "outcome": "supported", "quote": "where developers have made the code more generic than it needs to be, or added functionality that isn't presently needed by the system.", "error": null },
    { "url": "https://doc.rust-lang.org/cargo/guide/cargo-toml-vs-cargo-lock.html", "read_on": "2026-09-30", "bore_on": "gap: Rust manifest and lockfile", "outcome": "supported", "quote": "`Cargo.toml` is a manifest file in which you can specify a bunch of different metadata about your package.", "error": null },
    { "url": "https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json", "read_on": "2026-09-30", "bore_on": "gap: lockfile names", "outcome": "supported", "quote": "This file is intended to be committed into source repositories", "error": null },
    { "url": "https://classic.yarnpkg.com/lang/en/docs/yarn-lock/", "read_on": "2026-09-30", "bore_on": "gap: lockfile names", "outcome": "supported", "quote": "Yarn uses a `yarn.lock` file in the root of your project.", "error": null },
    { "url": "https://pnpm.io/git", "read_on": "2026-09-30", "bore_on": "gap: lockfile names", "outcome": "supported", "quote": "You should always commit the lockfile (`pnpm-lock.yaml`).", "error": null },
    { "url": "https://learn.microsoft.com/en-us/nuget/consume-packages/package-references-in-project-files", "read_on": "2026-09-30", "bore_on": "line 59 NuGet quotes; gap packages.lock.json", "outcome": "supported", "quote": "If this property is set, NuGet restore will generate a lock file (`packages.lock.json`) at the project root directory that lists all the package dependencies.", "error": null },
    { "url": "https://python-poetry.org/docs/basic-usage/", "read_on": "2026-09-30", "bore_on": "gap: lockfile names", "outcome": "supported", "quote": "You should commit the `poetry.lock` file to your project repo", "error": null },
    { "url": "https://docs.astral.sh/uv/concepts/projects/layout/", "read_on": "2026-09-30", "bore_on": "gap: lockfile names", "outcome": "supported", "quote": "uv creates a `uv.lock` file next to the `pyproject.toml`.", "error": null },
    { "url": "https://docs.gradle.org/current/userguide/dependency_locking.html", "read_on": "2026-09-30", "bore_on": "gap: lockfile names", "outcome": "supported", "quote": "The lock state is preserved in a file named `gradle.lockfile`, located at the root of each project or subproject directory.", "error": null },
    { "url": "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Collection.html", "read_on": "2026-09-30", "bore_on": "line 35 'a read-only collection, for example'; line 59 'only as'", "outcome": "supported", "quote": "An _unmodifiable collection_ is a collection, all of whose mutator methods (as defined above) are specified to throw `UnsupportedOperationException`.", "error": null },
    { "url": "https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf", "read_on": "2026-09-30", "bore_on": "Part 3", "outcome": "did-not-bear", "quote": "German-French recommendations for the use of AI programming assistants (04.10.2024)", "error": null },
    { "url": "https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf?__blob=publicationFile", "read_on": "2026-09-30", "bore_on": "Part 3", "outcome": "unreachable", "quote": null, "error": "I cannot extract readable text from the PDF content provided. The document appears to be a linearized PDF with compressed streams that require decompression to access the actual content." },
    { "url": "https://csrc.nist.gov/pubs/sp/800/218/a/final", "read_on": "2026-09-30", "bore_on": "Part 3", "outcome": "did-not-bear", "quote": "practices, tasks, recommendations, considerations, notes, and informative references that are specific to AI model development throughout the software development life cycle.", "error": null },
    { "url": "https://www.cisa.gov/securebydesign", "read_on": "2026-09-30", "bore_on": "Part 3 (search result only, not fetched)", "outcome": "did-not-bear", "quote": null, "error": null },
    { "url": "https://arxiv.org/abs/2510.00730", "read_on": "2026-09-30", "bore_on": "gap: Maven has no lockfile", "outcome": "supported", "quote": "Yet, Maven, one of the most important package managers in the Java ecosystem, lacks native support for a lockfile.", "error": null },
    { "url": "https://code.claude.com/docs/en/settings-reference.md", "read_on": "2026-09-30", "bore_on": "line 64 commit trailer", "outcome": "refuted", "quote": "`false` to omit the trailer from every commit Claude Code makes", "error": null },
    { "url": "https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf", "read_on": "2026-09-30", "bore_on": "regulator review concerns for assistant-written code; read by the critic from the saved copy, all 16 pages, page numbers as printed", "outcome": "supported", "quote": "Generated source code should generally be checked and reproduced by the developers. A critical review should be carried out particularly with regard to hallucinations and security risks. (page 12)", "error": null }
  ],
  "findings": [
    {
      "id": "f-s3-agent-r3-1",
      "kind": "correction-of-earlier-round",
      "text": "Corrects f-s3-agent-r1-18. The commit-trailer quote on line 64 is not on Claude Code's settings reference. The fact is real (the trailer can be turned off), but the page's wording is \"`false` to omit the trailer from every commit Claude Code makes\". The quote is replaced with the page's words. Confidence medium: the fetch returned only the attribution section, so the old phrase could still appear elsewhere on the page.",
      "evidence": "https://code.claude.com/docs/en/settings-reference.md, read 2026-09-30, outcome refuted: \"`false` to omit the trailer from every commit Claude Code makes\"; round-3 report part 1, last row",
      "proposed_change": {
        "old": "Claude Code's settings can turn its trailer off (\"`false`: Claude Code adds no commit trailer\", https://code.claude.com/docs/en/settings-reference.md, read 2026-09-30).",
        "new": "Claude Code's settings can turn its trailer off (its settings reference offers \"`false` to omit the trailer from every commit Claude Code makes\", https://code.claude.com/docs/en/settings-reference.md, read 2026-09-30)."
      },
      "needs_human": false
    },
    {
      "id": "f-s3-agent-r3-2",
      "kind": "correction-of-earlier-round",
      "text": "Corrects f-s3-agent-r2-1. 'Oracle describes UnsupportedOperationException only as ...' (line 59) overstates Oracle: its Collection documentation specifies the exception for every mutator method of an unmodifiable collection. The sentence now cites that documentation, which also sources line 35's 'a read-only collection, for example', so line 35 needs no edit.",
      "evidence": "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Collection.html, read 2026-09-30: \"An _unmodifiable collection_ is a collection, all of whose mutator methods (as defined above) are specified to throw `UnsupportedOperationException`.\"; round-3 report part 2, last row 'misattributed, high'",
      "proposed_change": {
        "old": "Oracle describes `UnsupportedOperationException` only as \"Thrown to indicate that the requested operation is not supported\";",
        "new": "Oracle's `Collection` documentation specifies it for read-only collections (https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Collection.html): \"An _unmodifiable collection_ is a collection, all of whose mutator methods (as defined above) are specified to throw `UnsupportedOperationException`.\";"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-agent-r3-3",
      "kind": "new",
      "text": "Closes the gaps f-s3-agent-r2-13 left open. Line 40 now names `Cargo.toml` and `build.gradle.kts`, and replaces 'a lockfile' with each ecosystem's lockfile name. It also adds that a missing lockfile is not a finding: NuGet's and Gradle's lockfiles must be switched on, and Maven has no native one. That keeps the agent from raising a false finding against a project that never enabled locking. The Maven statement rests on one paper, since no Apache Maven page was found. The wording follows that paper's 'native', and the source is named in the evidence section (f-s3-agent-r3-4).",
      "evidence": "https://doc.rust-lang.org/cargo/guide/cargo-toml-vs-cargo-lock.html, read 2026-09-30: \"`Cargo.toml` is a manifest file in which you can specify a bunch of different metadata about your package.\"; https://docs.gradle.org/current/userguide/declaring_dependencies.html: \"build.gradle\" / \"build.gradle.kts\" captions; round-3 report part 2: NuGet \"you can opt-in to the lock file feature by setting the MSBuild property `RestorePackagesWithLockFile`\", Gradle \"Once enabled, you must create an initial lock state\"; https://arxiv.org/abs/2510.00730: \"Yet, Maven, one of the most important package managers in the Java ecosystem, lacks native support for a lockfile.\"",
      "proposed_change": {
        "old": "Read the version from the manifest (`package.json`, a lockfile, `*.csproj`, `Directory.Packages.props`, `packages.config`, `pom.xml`, `build.gradle`, `pyproject.toml`).",
        "new": "Read the version from the manifest (`package.json`, `*.csproj`, `Directory.Packages.props`, `packages.config`, `pom.xml`, `build.gradle`, `build.gradle.kts`, `pyproject.toml`, `Cargo.toml`) or its lockfile (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `packages.lock.json`, `poetry.lock`, `uv.lock`, `gradle.lockfile`, `Cargo.lock`). A missing lockfile is not a finding: NuGet's and Gradle's lockfiles must be switched on, and Maven has no native one."
      },
      "needs_human": false
    },
    {
      "id": "f-s3-agent-r3-4",
      "kind": "new",
      "text": "Adds the sources for f-s3-agent-r3-3 to the detection-rules bullet (line 59), one reference per file, with a quote only where the address does not already name the file. The Yarn source is the classic documentation; the modern Yarn pages were not read. Maven's page now names `pom.xml` verbatim, which lifts round 2's medium-confidence Maven row to high confidence with no text change needed.",
      "evidence": "round-3 report part 1 (Maven row) and part 2 (lockfile table); sources above for Cargo, npm, Yarn, pnpm, NuGet, Poetry, uv, Gradle, arXiv 2510.00730",
      "proposed_change": {
        "old": "Gradle (https://docs.gradle.org/current/userguide/declaring_dependencies.html) and the Python Packaging User Guide (https://packaging.python.org/en/latest/specifications/pyproject-toml/).",
        "new": "Gradle (https://docs.gradle.org/current/userguide/declaring_dependencies.html, whose samples are captioned both `build.gradle` and `build.gradle.kts`), the Python Packaging User Guide (https://packaging.python.org/en/latest/specifications/pyproject-toml/) and Cargo (https://doc.rust-lang.org/cargo/guide/cargo-toml-vs-cargo-lock.html: \"`Cargo.toml` is a manifest file in which you can specify a bunch of different metadata about your package.\"). The lockfiles are those named by npm (https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json), Yarn (https://classic.yarnpkg.com/lang/en/docs/yarn-lock/: \"Yarn uses a `yarn.lock` file in the root of your project.\"), pnpm (https://pnpm.io/git: \"You should always commit the lockfile (`pnpm-lock.yaml`).\"), NuGet (the page above, where you \"opt-in to the lock file feature by setting the MSBuild property `RestorePackagesWithLockFile`\" and restore then \"will generate a lock file (`packages.lock.json`)\"), Poetry (https://python-poetry.org/docs/basic-usage/: \"You should commit the `poetry.lock` file to your project repo\"), uv (https://docs.astral.sh/uv/concepts/projects/layout/: \"uv creates a `uv.lock` file next to the `pyproject.toml`.\"), Gradle (https://docs.gradle.org/current/userguide/dependency_locking.html: \"The lock state is preserved in a file named `gradle.lockfile`\", and \"Once enabled, you must create an initial lock state\") and Cargo (the page above). No Apache Maven page on lockfiles was found; one paper states that Maven \"lacks native support for a lockfile\" (Schmid and colleagues, https://arxiv.org/abs/2510.00730)."
      },
      "needs_human": false
    },
    {
      "id": "f-s3-agent-r3-5",
      "kind": "new",
      "text": "Completes Google's over-engineering sentence (line 56) with its last three words, 'by the system', read from the raw source. The meaning does not change; the quote is now complete to the end of the sentence.",
      "evidence": "https://raw.githubusercontent.com/google/eng-practices/master/review/reviewer/looking-for.md, read 2026-09-30: \"where developers have made the code more generic than it needs to be, or added functionality that isn't presently needed by the system.\"",
      "proposed_change": {
        "old": "added functionality that isn't presently needed\", and",
        "new": "added functionality that isn't presently needed by the system\", and"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-agent-r3-6",
      "kind": "new",
      "text": "The regulator report names two concerns in assistant-written code that the hand-on list missed. First, insecure libraries 'suggested even when their documentation flagged security concerns' go to dependency-checker, whose description is 'Audits dependencies for vulnerabilities, outdated versions'. Second, weak hashing ('MD5 or a single iteration of SHA-256') goes to sast-scanner, whose body has a 'Weak Cryptography' section with MD5 patterns. Also added, from this fresh read: a credential written into the code goes to secrets-detector, whose description claims 'leaked credentials' and 'secret in repo'. Until now the list sent it nowhere, though the skill's debug-print example leaks a token. This adds no eleventh class.",
      "evidence": "https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf, read 2026-09-30, page 9: \"insecure libraries were suggested even when their documentation flagged security concerns\"; page 9: \"insecure methods such as MD5 or a single iteration of SHA-256 are still often used\"; agents/security/dependency-checker.md:3; agents/security/sast-scanner.md:404 '### 7. Weak Cryptography'; agents/security/secrets-detector.md:3",
      "proposed_change": {
        "old": "injection and unsafe data sinks (sast-scanner);",
        "new": "injection, unsafe data sinks and weak cryptography such as MD5 for passwords (sast-scanner); a real dependency that is vulnerable or outdated (dependency-checker); a credential written into the code (secrets-detector);"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-agent-r3-7",
      "kind": "new",
      "text": "Two changes to the documentation sentence on line 45. First, `docs/` was an unsourced convention. It is kept as a place to search, reworded to 'any `docs/` directory' so it no longer implies that every repository has one; README files and `CLAUDE.md` are already sourced (Google and Claude Code). Second, the regulator report names generated comments or documentation that is wrong or hallucinated, which no class and no hand-on covered. It is recorded the same way as out-of-date documentation, for documentation-updater, whose description includes updating 'code comments'.",
      "evidence": "https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf, read 2026-09-30, page 9: \"explanations, comments or documentation generated by an AI assistant can be incorrect or completely hallucinated\"; agents/documentation/documentation-updater.md:3 'Updates API docs, README, code comments, and changelog entries'",
      "proposed_change": {
        "old": "Grep the repository's README files, `docs/` and `CLAUDE.md` files for the old name or step, and record each hit that still states the old behaviour as documentation out of date (documentation-updater).",
        "new": "Grep the repository's README files, any `docs/` directory and `CLAUDE.md` files for the old name or step, and record each hit that still states the old behaviour as documentation out of date (documentation-updater). Record the same way a comment, docstring or documentation line the change adds that describes behaviour the code does not have."
      },
      "needs_human": false
    },
    {
      "id": "f-s3-agent-r3-8",
      "kind": "new",
      "text": "Adds the one relevant regulator source to the evidence section, read by me from the saved copy, with printed page numbers. It supports five existing rules: the review itself (page 12), stale framework idioms through outdated training data (page 9), hallucinated methods and the plausibility checks for unknown libraries (page 10), coding-assistant configuration through extensions that act for the programmer (page 11), and treating what is read as data, since package documentation can carry injected instructions (page 10). It also sources the three hand-ons from f-s3-agent-r3-6 and -7. The agencies are named in full, not by their short forms. The landing page dates the report 04.10.2024 and the PDF says 'Last updated: September 2024'; the bullet uses the PDF's date.",
      "evidence": "https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf (saved copy .claude/projects/-Users-account-Code-ctoc/26a2fcc0-aa46-4510-a665-3c2f0ee314f5/tool-results/webfetch-1790763462989-llcq7m.pdf), read 2026-09-30, pages 2, 3, 9, 10, 11, 12",
      "proposed_change": {
        "old": "defines typosquatting as \"Publication of malicious packages with similar names to those of popular packages\" (https://owasp.github.io/www-project-top-10-ci-cd-security-risks/CICD-SEC-03-Dependency-Chain-Abuse).",
        "new": "defines typosquatting as \"Publication of malicious packages with similar names to those of popular packages\" (https://owasp.github.io/www-project-top-10-ci-cd-security-risks/CICD-SEC-03-Dependency-Chain-Abuse).\n- **Regulator guidance.** The French Cybersecurity Agency and the German Federal Office for Information Security, in their joint report \"AI Coding Assistants\" (https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf, last updated September 2024), recommend this review: \"Generated source code should generally be checked and reproduced by the developers. A critical review should be carried out particularly with regard to hallucinations and security risks.\" (page 12). The report bears on four of the rules above: stale framework idioms, \"One cause of these security flaws is the use of outdated programs in the training data of the AI models, leading to the suggestion of outdated and insecure best practices.\" (page 9); hallucinated imports, \"AI coding assistants can use autocompletion to suggest methods and classes to developers that do not exist for the package in question.\" and \"Unknown libraries should be checked for plausibility, e.g. when they were created, how commonly they are used or how active a source code repository is.\" (page 10); coding-assistant configuration, \"Modern coding assistants can often be augmented with extensions which can take actions on behalf of programmers.\" (page 11); and reading what you review as data, \"attackers can write malicious instructions into the documentation of software packages.\" (page 10). It also names three concerns this file hands on: \"insecure libraries were suggested even when their documentation flagged security concerns\" (page 9); \"insecure methods such as MD5 or a single iteration of SHA-256 are still often used\" (page 9); and \"explanations, comments or documentation generated by an AI assistant can be incorrect or completely hallucinated\" (page 9)."
      },
      "needs_human": false
    },
    {
      "id": "f-s3-agent-r3-9",
      "kind": "new",
      "text": "What the regulators add beyond the edits above: nothing contradicts the file, and one gap is reported with no text change. The French and German report restates Spracklen's measurement consistently with line 52: 16 models, 576,000 code examples, 2.23 million packages, 19.7% hallucinated (page 10). Its automation-bias section ('even flawed solutions are well-worded', page 8) agrees with the file's 'report what the lines show'. The gap: the report names licensing violations from using AI-generated code as a risk it deliberately leaves out (page 8). No agent's description claims to detect reproduced licensed code, because license-scanner 'Scans dependencies for license compliance'. It is not added: the report gives no method, and routing it to license-scanner would be a hand-on its description does not claim. It is left for CTO Chief and the human to decide. Its recommendation to 'flag AI generated code blocks' (page 9) is not added: the file already takes provenance only from the dispatch. NIST SP 800-218A does not bear, because its scope is AI model development. CISA gave nothing quotable.",
      "evidence": "https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf, read 2026-09-30, page 8: \"There are further risks, such as potential licensing violations when using AI-generated code, which have no direct security connection and are not addressed in the following.\"; page 8: \"as even flawed solutions are well-worded\"; page 9: \"It might be beneficial to flag AI generated code blocks and to document the used AI tools.\"; page 10: \"They found that 19.7% of imported packages were hallucinated.\"; agents/compliance/license-scanner.md:3; https://csrc.nist.gov/pubs/sp/800/218/a/final did-not-bear",
      "proposed_change": null,
      "needs_human": false
    },
    {
      "id": "f-s3-agent-r3-10",
      "kind": "new",
      "text": "Consistency checks on this fresh read found nothing needing text. The Role lists ten classes, the table has ten rows, and the output type list names all ten plus reviewer_directed_instruction. Every class has a severity, stated explicitly or by the stated fallbacks. The type map covers every skill type this agent itself reports; the skill's race_condition, ai_sql_injection and debug_print_left are handed on, not reported, and prompt_drift falls to the 'typed as the skill types it' rule. In the text I proposed, the only abbreviations and codes are inside verbatim quotes or are proper names (MD5, CWE-546, MSBuild, npm, NuGet). No order goes beyond Read and Grep, and the text has no gate numbers.",
      "evidence": "agents/ai-quality/ai-code-quality-reviewer.md:18, :32-43, :76, :86, :96; skills/ai-quality/ai-code-quality-reviewer/SKILL.md:450-452",
      "proposed_change": null,
      "needs_human": false
    },
    {
      "id": "f-s3-agent-r3-11",
      "kind": "new",
      "text": "Quote provenance, for the record; no text change. Confirmed against the page's whole body or its raw source: both NuGet quotes, the three Claude Code Code Review quotes, GitHub's CLAUDE.md and GEMINI.md sentence (the source has backticks, the words are identical), OWASP's typosquatting definition, the Google sentences, and Mozilla's forEach sentence. Still confirmed only through a summarising fetch: Cursor's two quotes (the .md form of the page returned 404), CWE-546's marker list, and Gradle's captions. Not re-read in round 3: Tambon's abstract, Spracklen, ImpossibleBench, the GitHub blog, Claude Code's subagent and hooks pages, Cotroneo, GitClear, Sonar, and the Python, .NET, Oracle class-page and Rust quotes. The regulator quotes were read by me from the page images of the saved PDF.",
      "evidence": "round-3 report part 1 table and 'Not examined this pass'",
      "proposed_change": null,
      "needs_human": false
    }
  ],
  "seven_languages": {
    "applies": true,
    "reason": "The domain is code in any language the project uses, so the rule applies. The file still holds no pairs of defect-and-better examples; they belong to the skill body, and the file's only code is one TypeScript test in the output example. Its sourced search rules now cover manifests and lockfiles for JavaScript and TypeScript, .NET, Java (Maven and Gradle, both Groovy and Kotlin build scripts), Python and Rust. Unfinished-work markers are sourced for Python, .NET, Java and Rust, and the language-neutral comment markers also apply to C, C++ and SQL. No manifest is named for C, C++ or SQL, and none of the three research reports sourced one."
  },
  "sibling_boundary": {
    "hallucination-detector": "Defers: existence of packages, methods and options, look-alike names, and signatures or options the library lacks; the regulator's 'methods and classes ... that do not exist' (page 10) is its territory.",
    "code-reviewer": "Defers: naming, comments, style, read-level complexity, redundant conditions, swallowing or over-catching error handling, debug output, a TODO beside finished code, readability of intent and tests with no assertion.",
    "error-handler-checker": "Defers: an error path with no handling or fallback.",
    "type-checker": "Defers: a wrong-type argument to a real call.",
    "documentation-updater": "Defers: documentation left out of date and, new this round, generated comments or documentation that describe behaviour the code lacks; this agent finds them, documentation-updater fixes them.",
    "code-smell-detector": "Defers: the general smell catalogue.",
    "mutation-test-runner": "Defers: measuring whether the suite catches changed code.",
    "llm-security-tester": "Defers: what a configuration change lets the assistant do, and prompts or executed output; its body, not its description, claims the configuration work.",
    "duplicate-code-detector": "Defers: copy-pasted logic.",
    "dead-code-detector": "Defers: unused variables, functions, exports and imports.",
    "memory-safety-checker": "Defers: memory leaks and leaked listeners.",
    "api-contract-validator": "Defers: a service interface that departs from its published contract.",
    "performance-profiler": "Defers: a query issued once per row and other hot paths.",
    "concurrency-checker": "Defers: async and thread-safety races.",
    "sast-scanner": "Defers: injection, unsafe data sinks and, new this round, weak cryptography, which its body's 'Weak Cryptography' section claims.",
    "dependency-checker": "Defers (new this round): a real dependency that is vulnerable or outdated, matching its description.",
    "secrets-detector": "Defers (new this round): a credential written into the code, matching its description's 'leaked credentials' and 'secret in repo'.",
    "ci-pipeline-checker": "Defers: a workflow's permissions."
  },
  "nothing_found": false
}
```

**For the skill's rounds** (`skills/ai-quality/ai-code-quality-reviewer/SKILL.md`):
1. **Regulator source for review.** The French and German joint report (page 12) is a regulator source for the skill's "every assistant-written change needs human review" principle. Page 9 is a regulator source for its claim that models emit outdated idioms.
2. **Package plausibility checks.** The skill's hallucinated-import category can adopt the report's checks for unknown libraries: when created, how commonly used, how active the repository (page 10). It can also mention package allowlists and a software bill of materials (page 10).
3. **Leaked token.** The skill's debug-print example leaks a token. That concern belongs to secrets-detector, and the skill should cross-link it.
4. **Weak hashing** (MD5 or a single round of SHA-256 for passwords, page 9) belongs under the skill's unsafe-data-sink category, routed to sast-scanner.
5. **Wrong generated comments.** The skill has only an "excessive comments" example. It should add generated comments or documentation that are wrong (page 9), handed to documentation-updater.
6. **Extensions.** The report's section on extensions for coding assistants (page 11: "Limit the use of extensions", "Audit and anticipate impacts ...") argues that the skill's Tool Integration section should treat extensions and configuration as review targets, not as recommended tooling.
7. **Commit trailer wording.** The skill's git-hook row (line 423) relies on assistant commit trailers. The settings page's own wording is "`false` to omit the trailer from every commit Claude Code makes".
8. **`.cursorrules` quote.** The full sentence is now "The `.cursorrules` file in your project root is legacy and will be deprecated." Its provenance is still a summarising fetch; next time, read `https://cursor.com/docs/rules.md`.
9. **Lockfiles.** Wherever the skill names lockfiles or version files, use the per-ecosystem list and "Maven has no native lockfile" (paper only). `Cargo.toml` and `build.gradle.kts` are sourced.
10. **`UnsupportedOperationException`.** If the skill cites it, use Oracle's `Collection` sentence, not the class page's one-liner.
11. **Licensing gap (owner decision).** The report names licensing violations from AI-generated code as a risk it leaves out (page 8). No agent's description owns detecting reproduced licensed code. The human decides whether to schedule it; nothing is proposed.

Risks to watch:
- **The trailer correction is medium confidence.** The validator saw only the attribution section of the settings page.
- **Summary-only quotes remain.** Cursor, CWE-546 and Gradle quotes are still confirmed only through a summarising fetch.
- **Regulator quotes.** I read them from page images of the saved PDF, so a transcription slip is possible; the quotes are short and I checked each against its page.
- **Maven's lockfile statement** rests on a single paper.
- **This critic still ran without web tools** (installed plugin 6.14.65). All outside facts this round came from the validator's report or the PDF I read.