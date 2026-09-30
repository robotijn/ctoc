# Round 3 web research for agents/ai-quality/ai-code-quality-reviewer.md (dispatch d-s3-agent-r3-research, citation-validator, installed plugin 6.14.65, 2026-09-30; angle: raw re-reads, remaining gaps, regulators)

Round 3 report for `agents/ai-quality/ai-code-quality-reviewer.md` (dispatch d-s3-agent-r3-research). Nothing was edited, and all 30 tool calls are used.

**Result.**
- **One quote in the file is misworded.** The commit-trailer quote attributed to Claude Code's settings reference (line 64) is not on the page. The page's own text says "`false` to omit the trailer from every commit Claude Code makes".
- **One word overstates Oracle.** Line 59 says Oracle describes `UnsupportedOperationException` "only as" not supported. Oracle's own `Collection` documentation ties it directly to unmodifiable collections.
- **Four gaps are now sourced:** `Cargo.toml`, `build.gradle.kts`, the lockfile names for each package manager, and Maven having no lockfile (sourced from a paper, not from Maven's documentation).
- **No regulator source adds a defect class or contradicts the file.** The most relevant one, the joint French and German report on AI coding assistants, could not be read this pass.

**What "raw" means here.** WebFetch always passes the page through a reading model, so no read in this pass is byte-level. I mark a quote "confirmed raw" only where the tool returned the page's whole markdown body and I read the quote in it myself. That was the NuGet page and Claude Code's Code Review page.

## 1. Research log

```json
{
  "research_log": {
    "queries": [
      { "text": "Maven POM introduction: verbatim sentences containing pom.xml", "source_class": "vendor documentation", "repeated_because": "round 2 got no literal 'pom.xml' in a verbatim quote (medium confidence)" },
      { "text": "Gradle declaring dependencies: verbatim lines containing build.gradle / build.gradle.kts", "source_class": "vendor documentation", "repeated_because": "round 2's file names came from the reading model's summary (medium confidence)" },
      { "text": "GitHub Docs article API (markdown body): repository custom instructions, CLAUDE.md / GEMINI.md / AGENTS.md sentences", "source_class": "vendor documentation", "repeated_because": "round 2 quote came through a summarising fetch; tried the markdown body" },
      { "text": "Cursor rules docs, .md form", "source_class": "vendor documentation", "repeated_because": "round 1/2 quotes came through a summarising fetch" },
      { "text": "Cursor rules docs, HTML: .mdc / version-controlled / AGENTS.md sentences", "source_class": "vendor documentation", "repeated_because": ".md form returned 404" },
      { "text": "Cursor help centre rules page: .cursorrules legacy sentence", "source_class": "vendor documentation", "repeated_because": "round 1 quote came through a summarising fetch" },
      { "text": "OWASP CICD-SEC-3 raw markdown source on GitHub: typosquatting definition", "source_class": "standards body", "repeated_because": "round 2 quote came through a summarising fetch" },
      { "text": "MITRE CWE-546 page: description and marker list", "source_class": "standards body", "repeated_because": "round 2 quote came through a summarising fetch" },
      { "text": "Google eng-practices raw markdown source: looking-for.md three sentences", "source_class": "publisher", "repeated_because": "round 2 quotes came through a summarising fetch" },
      { "text": "MDN content raw markdown source: Array forEach promise sentence", "source_class": "vendor documentation", "repeated_because": "round 1 quote came through a summarising fetch" },
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
      { "text": "Claude Code Code Review page, .md form: REVIEW.md and CLAUDE.md sentences", "source_class": "vendor documentation", "repeated_because": "rounds 1/2 quotes came through a summarising fetch" },
      { "text": "Claude Code settings reference, .md form: attribution / commit trailer", "source_class": "vendor documentation", "repeated_because": "round 1 quote came through a summarising fetch; round 2's raw read was settings.md, a different page" }
    ],
    "sources": [
      { "url": "https://maven.apache.org/guides/introduction/introduction-to-the-pom.html", "read_on": "2026-09-30", "bore_on": "line 40 pom.xml", "outcome": "supported", "quote": "As the name suggests, it's the relative path from the module's `pom.xml` to the parent's `pom.xml`.", "error": null },
      { "url": "https://docs.gradle.org/current/userguide/declaring_dependencies.html", "read_on": "2026-09-30", "bore_on": "line 40 build.gradle; gap build.gradle.kts", "outcome": "supported", "quote": "\"build.gradle\" / \"build.gradle.kts\" (code-sample captions, each shown several times)", "error": null },
      { "url": "https://docs.github.com/api/article/body?pathname=/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions", "read_on": "2026-09-30", "bore_on": "lines 43, 59 CLAUDE.md / GEMINI.md", "outcome": "supported", "quote": "Alternatively, you can use a single `CLAUDE.md` or `GEMINI.md` file stored in the root of the repository.", "error": null },
      { "url": "https://cursor.com/docs/context/rules.md", "read_on": "2026-09-30", "bore_on": "line 54, 59 Cursor quotes", "outcome": "unreachable", "quote": null, "error": "The server returned HTTP 404 Not Found." },
      { "url": "https://cursor.com/docs/context/rules", "read_on": "2026-09-30", "bore_on": "lines 54, 59", "outcome": "supported", "quote": "Project rules live in `.cursor/rules` as `.mdc` files and are version-controlled.", "error": null },
      { "url": "https://cursor.com/help/customization/rules", "read_on": "2026-09-30", "bore_on": "line 59 .cursorrules", "outcome": "supported", "quote": "The `.cursorrules` file in your project root is legacy and will be deprecated.", "error": null },
      { "url": "https://raw.githubusercontent.com/OWASP/www-project-top-10-ci-cd-security-risks/main/CICD-SEC-03-Dependency-Chain-Abuse.md", "read_on": "2026-09-30", "bore_on": "line 59 typosquatting", "outcome": "supported", "quote": "Publication of malicious packages with similar names to those of popular packages in the hope that a developer will misspell a package name and unintentionally fetch the typosquatted package.", "error": null },
      { "url": "https://cwe.mitre.org/data/definitions/546.html", "read_on": "2026-09-30", "bore_on": "lines 35, 59 comment markers", "outcome": "supported", "quote": "Many suspicious comments, such as BUG, HACK, FIXME, LATER, LATER2, TODO, in the code indicate missing security functionality and checking.", "error": null },
      { "url": "https://raw.githubusercontent.com/google/eng-practices/master/review/reviewer/looking-for.md", "read_on": "2026-09-30", "bore_on": "lines 56, 58", "outcome": "supported", "quote": "where developers have made the code more generic than it needs to be, or added functionality that isn't presently needed by the system.", "error": null },
      { "url": "https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/javascript/reference/global_objects/array/foreach/index.md", "read_on": "2026-09-30", "bore_on": "line 45 forEach", "outcome": "supported", "quote": "`forEach()` expects a synchronous function — it does not wait for promises.", "error": null },
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
      { "url": "https://code.claude.com/docs/en/code-review.md", "read_on": "2026-09-30", "bore_on": "lines 43, 58, 59", "outcome": "supported", "quote": "if your PR changes code in a way that makes a `CLAUDE.md` statement outdated, Claude flags that the docs need updating too.", "error": null },
      { "url": "https://code.claude.com/docs/en/settings-reference.md", "read_on": "2026-09-30", "bore_on": "line 64 commit trailer", "outcome": "refuted", "quote": "`false` to omit the trailer from every commit Claude Code makes", "error": null }
    ]
  }
}
```

## 2. Part 1: re-reading the quotes

| Quote (file line) | Earlier reading | This pass |
|---|---|---|
| Maven's page names `pom.xml` (40, 59) | Round 2, medium confidence: no literal file name | **Confirmed only via summary again, but now verbatim.** The page contains: "As the name suggests, it's the relative path from the module's `pom.xml` to the parent's `pom.xml`." This is the literal name round 2 lacked. |
| Gradle's page names `build.gradle` and `build.gradle.kts` (40, 59) | Round 2, medium confidence: names came from the summary | **Confirmed only via summary again.** Both names appear repeatedly as code-sample captions. The file names only `build.gradle` (see Part 2). |
| GitHub Copilot: "Alternatively, you can use a single CLAUDE.md or GEMINI.md file stored in the root of the repository." (59) | Summary | **Confirmed from the markdown source, extracted by the reading model.** The source puts backticks around the two file names; the words are identical. |
| Cursor: "Project rules live in `.cursor/rules` as `.mdc` files and are version-controlled." (54) | Summary | **Confirmed only via summary again.** The `.md` form gave "HTTP 404 Not Found". The page links to `https://cursor.com/docs/rules.md`, which is probably the correct markdown address for next time. |
| Cursor: "AGENTS.md is a simple markdown file for defining agent instructions." (59) | Summary | **Confirmed only via summary again**, word for word. |
| Cursor help centre: "legacy and will be deprecated" (59) | Summary | **Confirmed only via summary again.** Full sentence: "The `.cursorrules` file in your project root is legacy and will be deprecated." |
| OWASP typosquatting definition (59) | Summary | **Confirmed from the raw markdown source on GitHub, extracted by the reading model.** The file's quote matches the start of the definition. |
| CWE-546: "BUG, HACK, FIXME, LATER, LATER2, TODO" (59) | Summary | **Confirmed only via summary again.** The list and its order match (CWE version 4.20). |
| Google review guide: the over-engineering, tests and documentation sentences (56, 58) | Summary | **Confirmed from the raw markdown source, extracted by the reading model.** The over-engineering sentence continues "…presently needed by the system."; the file stops before "by the system", which does not change the meaning. |
| MDN: "does not wait for promises" (45) | Summary | **Confirmed from the raw markdown source, extracted by the reading model.** "`forEach()` expects a synchronous function — it does not wait for promises." |
| NuGet: ".NET Framework projects support PackageReference, but currently default to `packages.config`." (59) | Summary | **Confirmed raw.** It appears exactly in the full page body. |
| NuGet: "a `<PackageVersion />` item must not be defined in `Directory.Packages.props` for an implicitly defined package" (59) | Summary | **Confirmed raw**, exactly. |
| Claude Code Code Review: "REVIEW.md is a file at your repository root that tailors Code Review to your repo." (59) | Summary | **Confirmed raw.** The source has backticks around `REVIEW.md`; the words are identical. |
| Claude Code Code Review: "Claude reads `CLAUDE.md` files at every level of your directory hierarchy" (59) | Summary | **Confirmed raw.** The sentence goes on: ", so rules in a subdirectory's `CLAUDE.md` apply only to files under that path." |
| Claude Code Code Review: the outdated-`CLAUDE.md` sentence (58) | Summary | **Confirmed raw**, exactly. |
| Claude Code settings reference: "`false`: Claude Code adds no commit trailer" (64) | Round 1, summary | **Differs.** The page's markdown says: "`false` to omit the trailer from every commit Claude Code makes". I asked for every sentence containing "commit trailer" and the round-1 wording did not come back. The fact is real; the quoted words are not on the page. Verdict: **misattributed, severity high.** Correct to the verbatim wording above. Confidence medium: the tool returned only the attribution section, so I cannot rule out the phrase appearing elsewhere on the page. |

**Not examined this pass**, carried over unchanged:
- Tambon's abstract sentence
- Spracklen's two quotes
- ImpossibleBench's "54.0%"
- GitHub's blog on agent pull requests
- Claude Code's subagent and hooks pages
- Cotroneo, GitClear and Sonar
- Python's `pass` and `NotImplementedError` pages
- .NET's `NotImplementedException` page
- Oracle's `UnsupportedOperationException` class page
- Rust's `todo!` and `unimplemented!` pages

## 3. Part 2: the remaining gaps

| Item | Source | Verbatim quote | Verdict |
|---|---|---|---|
| `Cargo.toml` as Rust's manifest | doc.rust-lang.org Cargo guide | "`Cargo.toml` is a manifest file in which you can specify a bunch of different metadata about your package." | Supported. The file greps for Rust markers but line 40 names no Rust manifest; add `Cargo.toml`. |
| `Cargo.lock` | same | "`Cargo.lock` contains exact information about your dependencies." / "When in doubt, check `Cargo.lock` into the version control system (e.g. Git)." | Supported |
| `package-lock.json` | docs.npmjs.com | "This file is intended to be committed into source repositories" | Supported |
| `yarn.lock` | classic.yarnpkg.com | "Yarn uses a `yarn.lock` file in the root of your project." | Supported. This is the classic Yarn documentation; I did not read the modern Yarn pages. |
| `pnpm-lock.yaml` | pnpm.io/git | "You should always commit the lockfile (`pnpm-lock.yaml`)." | Supported |
| `packages.lock.json` (NuGet) | Microsoft Learn, read raw | "NuGet restore will generate a lock file (`packages.lock.json`) at the project root directory"; the feature is opt-in: "you can opt-in to the lock file feature by setting the MSBuild property `RestorePackagesWithLockFile`" | Supported. Its absence is normal: it is opt-in, and a library project "**should not** check in the lock file". |
| `poetry.lock` | python-poetry.org | "You should commit the `poetry.lock` file to your project repo" | Supported |
| `uv.lock` | docs.astral.sh | "uv creates a `uv.lock` file next to the `pyproject.toml`." | Supported |
| `gradle.lockfile` | docs.gradle.org | "The lock state is preserved in a file named `gradle.lockfile`, located at the root of each project or subproject directory." | Supported. That locking is off by default is the reading model's inference; the only quote is "Once enabled, you must create an initial lock state". |
| Maven has no lockfile | No Apache Maven page found. Schmid and colleagues, arXiv 2510.00730 (1 October 2025) | "Yet, Maven, one of the most important package managers in the Java ecosystem, lacks native support for a lockfile." | **No official source found.** It is supported by an original paper only. |
| `build.gradle.kts` | Gradle declaring-dependencies page | appears as a caption beside each `build.gradle` sample | Supported. Add it to line 40: an agent reading the list literally would skip Kotlin-script builds. |
| `UnsupportedOperationException` and "a read-only collection, for example" (line 35) | Oracle Java SE 21 `Collection` interface documentation | "An _unmodifiable collection_ is a collection, all of whose mutator methods (as defined above) are specified to throw `UnsupportedOperationException`." Also: "If a collection implementation doesn't implement a particular operation, it should define the corresponding method to throw `UnsupportedOperationException`." | **Line 35's example is supported.** Line 59's "Oracle describes `UnsupportedOperationException` only as…" is contradicted by this page. Verdict: misattributed, high. Correct it by citing the `Collection` sentence above. I did not fetch the Java tutorials; the API documentation is the stronger source anyway. |

## 4. Part 3: regulators

1. **NIST SP 800-218A (July 2024) does not bear on the file.** Its scope is "specific to AI model development throughout the software development life cycle". On the reading model's report of the page, it says nothing about code written by AI assistants, so it adds no class and contradicts nothing. That the page is silent on this is itself the model's reading, not a byte scan.
2. **The joint French and German report could not be read.** The report is ANSSI and BSI's "German-French recommendations for the use of AI programming assistants" (04.10.2024), and it is the most relevant regulator source. Its landing page says "Concrete mitigation measures are outlined". The PDF would not yield text: "I cannot extract readable text from the PDF content provided…". A copy is saved at `/Users/account/.claude/projects/-Users-account-Code-ctoc/26a2fcc0-aa46-4510-a665-3c2f0ee314f5/tool-results/webfetch-1790763462989-llcq7m.pdf`. The next pass can open it with Read, the way round 2 read the Tambon paper. Whatever classes it names are **not examined this pass**.
3. **CISA gave nothing quotable.** The search returned only third-party summaries. The one claim about CISA's December 2025 guidance on AI in operational technology came from a search summary, not a CISA page, so I report nothing from it. CIS and SAFECode's Secure by Design v1.1 (July 2026) is not from a regulator and I did not read it.
4. **Not examined this pass:** the NIST SP 800-218 core practices, ENISA, and the EU Cyber Resilience Act's Annex I vulnerability-handling requirements.
5. **No prompt injection.** No fetched page tried to change a verdict. The Claude Code page opens with a routine note telling agents to fetch its documentation index; I treated it as page content and did not act on it.

## 5. What would change these verdicts

- A full byte-level scan of the settings reference that finds "`false`: Claude Code adds no commit trailer" anywhere on the page would reverse the misworded-quote verdict.
- Reading the saved ANSSI and BSI PDF could add a regulator-sourced defect class.
- An Apache Maven page stating that Maven has no lockfile would give that item an official source.

Sources: [Maven POM](https://maven.apache.org/guides/introduction/introduction-to-the-pom.html) · [Gradle dependencies](https://docs.gradle.org/current/userguide/declaring_dependencies.html) · [GitHub instructions](https://docs.github.com/api/article/body?pathname=/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions) · [Cursor rules](https://cursor.com/docs/context/rules) · [Cursor help](https://cursor.com/help/customization/rules) · [OWASP CICD-SEC-3](https://raw.githubusercontent.com/OWASP/www-project-top-10-ci-cd-security-risks/main/CICD-SEC-03-Dependency-Chain-Abuse.md) · [CWE-546](https://cwe.mitre.org/data/definitions/546.html) · [Google guide](https://raw.githubusercontent.com/google/eng-practices/master/review/reviewer/looking-for.md) · [MDN forEach](https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/javascript/reference/global_objects/array/foreach/index.md) · [Cargo](https://doc.rust-lang.org/cargo/guide/cargo-toml-vs-cargo-lock.html) · [npm lockfile](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json) · [yarn.lock](https://classic.yarnpkg.com/lang/en/docs/yarn-lock/) · [pnpm](https://pnpm.io/git) · [NuGet](https://learn.microsoft.com/en-us/nuget/consume-packages/package-references-in-project-files) · [Poetry](https://python-poetry.org/docs/basic-usage/) · [uv](https://docs.astral.sh/uv/concepts/projects/layout/) · [Gradle locking](https://docs.gradle.org/current/userguide/dependency_locking.html) · [Oracle Collection](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Collection.html) · [ANSSI/BSI](https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf) · [NIST SP 800-218A](https://csrc.nist.gov/pubs/sp/800/218/a/final) · [CISA Secure by Design](https://www.cisa.gov/securebydesign) · [Maven-Lockfile paper](https://arxiv.org/abs/2510.00730) · [Claude Code Code Review](https://code.claude.com/docs/en/code-review.md) · [Claude Code settings reference](https://code.claude.com/docs/en/settings-reference.md)