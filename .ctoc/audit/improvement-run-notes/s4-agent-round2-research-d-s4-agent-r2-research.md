**Round 2 report for `agents/ai-quality/hallucination-detector.md`, dispatch `d-s4-agent-r2-research`**

Nothing in the file is fabricated. Two statements are wrong against the specification that governs them:
1. **Python name comparison.** The file says to compare names "counting `_`, `-` and `.` as the same character". The packaging specification collapses a *run* of those characters into one `-`, so `friendly--bard` is the same name as `friendly-bard`. The file's rule treats them as different.
2. **Character ranges in the recipes.** All nine bracket expressions use ranges like `A-Za-z0-9`. POSIX leaves ranges unspecified outside the POSIX locale, and the file never sets one.

Four other results:
- **Method gap.** Nothing covers the dependency-confusion case where the *public* registry answers 200 for a name the organisation keeps private. The file only acts on a 404.
- **Rust names.** A crate name in a `use` line is not always the package name. The file has a mapping rule for Python only.
- **Peer-reviewed source.** Every Spracklen sentence the file quotes appears word for word in the peer-reviewed USENIX Security 2025 version. It can replace the arXiv preprint as the citation.
- **Carried from round 1, settled.** The static `moment.formatISO` form does not exist. The `readFileSync` helpers that were read have no `throwOnError`. Two items stay open: TanStack's own `throwOnError` reference entry could not be reached, and whether every Maven Central artifact has `maven-metadata.xml` is still unsettled.

## Source classes, and how they differ from round 1

Round 1 used arXiv preprints and each registry's or vendor's own documentation (npm, PyPI, crates.io, axios, Node.js, TanStack). This round used:
- **Specifications:** the POSIX Shell Command Language and its regular-expression chapter (The Open Group, 2024 edition), the Python Packaging Authority's name specification, YAML 1.2.2, and the Rust Reference. I tried ECMA-262 twice; both fetches were cut off before the regular-expression section.
- **Standards bodies and foundations:**
  - OWASP (the Open Worldwide Application Security Project): its GenAI Security Project Top 10 for large language model applications 2025, and its Top 10:2025;
  - the OpenSSF (Open Source Security Foundation) Best Practices working groups;
  - SLSA (Supply-chain Levels for Software Artifacts) version 1.1.
- **Security agencies:**
  - the European Union Agency for Cybersecurity (ENISA);
  - the National Institute of Standards and Technology's Secure Software Development Framework (NIST Special Publication 800-218, version 1.1);
  - the Cybersecurity and Infrastructure Security Agency (CISA), found by search only and never fetched.
- **Peer-reviewed publisher:** the proceedings of the 34th USENIX Security Symposium.

These sources state rules and threats that bind or advise everyone, not what one registry happens to answer today.

Part C needed a library's own files: moment's declaration file, Node.js source, Apache Maven's metadata page and Sonatype's publishing page. No standard governs a library's interface, so those are marked where used. One registry probe (crates.io, row A14) is round-1 class and is marked too.

## Queries and fetches, in order (35 of 35)

1. Fetched: POSIX shell chapter (`pubs.opengroup.org/…/utilities/V3_chap02.html`).
2. Fetched: POSIX regular-expression chapter (`…/basedefs/V1_chap09.html`).
3. Fetched: Python packaging name specification.
4. Fetched: `tc39.es/ecma262/multipage/text-processing.html`. Cut off at section 13; failed.
5. Fetched: `yaml.org/spec/1.2.2/`.
6. Fetched: OWASP LLM09:2025 Misinformation.
7. Searched: the ECMA-262 multipage address.
8. Fetched: `tc39.es/ecma262/2026/multipage/text-processing.html`. Cut off at section 13; failed.
9. Fetched: `owasp.org/Top10/2025/A03…`. Answered with a 308 redirect.
10. Searched: the OpenSSF guide for AI code assistant instructions.
11. Fetched: that OpenSSF guide.
12. Fetched: `top10.owasp.org/2025/A03_2025-Software_Supply_Chain_Failures`.
13. Fetched: OpenSSF Concise Guide for Evaluating Open Source Software.
14. Fetched: `slsa.dev/spec/v1.1/threats`.
15. Fetched: USENIX presentation page for Spracklen and colleagues.
16. Fetched: USENIX PDF of the paper. The tool's summary was unusable; the PDF was saved and I read pages 1–12 locally as rendered images.
17. Searched: NIST SP 800-218, practice PW.4.
18. Searched: CISA on typosquatting and dependency confusion.
19. Fetched: ENISA advisory PDF. Saved; read locally, pages 1–4 and 13–24.
20. Fetched: NIST SP 800-218 PDF. Saved; read locally, PDF pages 19–22 (document pages 10–13).
21. Fetched: `maven.apache.org/repositories/metadata.html`.
22. Fetched: moment's declaration file, `ts3.1-typings/moment.d.ts` on the `develop` branch.
23. Fetched: TanStack Query v5 `useQuery` reference page. Answered `{"isNotFound":true}`.
24. Fetched: Node.js `lib/fs.js` on `main`.
25. Fetched: Node.js `lib/internal/fs/utils.js` on `main`.
26. Fetched: TanStack's raw `useQuery.md` on GitHub. Answered 404.
27. Searched: Maven Central and `maven-metadata.xml`.
28. Fetched: TanStack `…/latest/…/useQuery`. Answered `{"isNotFound":true}`.
29. Fetched: `central.sonatype.org/publish/publish-portal-upload/`.
30. Searched: publication venue for Krishna and colleagues.
31. Fetched: Rust Reference, extern crate declarations.
32. Fetched: `crates.io/api/v1/crates/serde-json`.
33. Searched: publication venue for Twist and colleagues.
34. Fetched: `openreview.net/forum?id=nZVqGkUr1r`. Returned a browser-verification page.
35. Searched: `site:cisa.gov` on typosquatting and dependency confusion.

Every web quotation passed through the fetch tool's summarising model. The USENIX, ENISA and NIST quotations are my own transcriptions of rendered PDF pages. No fetched page contained text aimed at a reviewer or validator. The OpenSSF guide addresses AI code assistants because that is its subject; I read it as data.

## Part A — code and patterns checked against the specifications

**Addresses used below:**
- XCU = POSIX shell chapter, https://pubs.opengroup.org/onlinepubs/9799919799/utilities/V3_chap02.html
- XBD = POSIX regular-expression chapter, https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap09.html
- PyPA = https://packaging.python.org/en/latest/specifications/name-normalization/
- YAML = https://yaml.org/spec/1.2.2/

All were read 2026-09-30. Section numbers are given only where the tool returned them.

| # | Code or pattern | Clause and verbatim quote | Verdict | Corrected text |
|---|---|---|---|---|
| A1 | Character-check prose: "only letters, digits, `.`, `_` and `-`" | PyPA, valid names: "A valid name consists only of ASCII letters and numbers, period, underscore and hyphen." | **Imprecise.** "Letters" has no bound, and the recipes' ranges mean ASCII only in the POSIX locale (A2). | "it is not empty, it starts with an ASCII letter (A to Z or a to z) or a digit (0 to 9), and it contains only ASCII letters, digits, `.`, `_` and `-`." |
| A2 | Nine bracket expressions using `A-Za-z0-9`: three in npm line 1, one in npm line 2, two in the PyPI line, three in `bad()` | XBD 9.3.5, item 7: "In other locales, a range expression has unspecified behavior: strictly conforming applications shall not rely on whether the range expression is valid." | **Relies on unspecified behaviour** unless the shell runs in the POSIX locale; the file sets none. Reasoned, not sourced: the name reaches `curl` only inside double quotes after the single-quoted assignment. So the harm is a refusal that varies by locale, not a new injection path. | Write the set out with no range: `[ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789]`. For example, npm line 2 becomes `case "${name#@}" in (*[!ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._/-]*\|*/*/*) echo "NOT CHECKED: refused by the character check"; exit 0;; esac`. Make the same change in the other eight. Setting `LC_ALL=C` is the other option, but whether that changes pattern matching inside the running shell was not checked. |
| A3 | `!` as negation in `[!…]` | XCU, pattern matching: "If an exclamation-mark character ('!') appears as the first character of a bracket expression, the sense of the subsequent match shall be inverted…" | Correct | — |
| A4 | `-` placed last in `[!…._/-]` and `[!…._-]` | XBD 9.3.5, item 7: "The <hyphen-minus> character shall be treated as itself if it occurs first (after an initial '^', if any) or last in the list…" | Correct. The sentence saying shell brackets follow XBD 9.3.5 was not quoted. | — |
| A5 | Opening `(` before each `case` pattern | XCU, case construct, as the tool rendered it: "case word in [[(]pattern[ \| pattern] ... ) compound-list ;;]... esac" | Correct: the `(` is optional. | — |
| A6 | Empty item `(…) ;;` in npm line 1 | The format line above shows `compound-list` without brackets. The formal grammar was not fetched. | **Not settled** | `…\|[ABC…789]*) : ;; (*) …`. The colon command makes the item non-empty, so the question does not arise. This is reasoned; the specification's page for the colon command was not fetched. |
| A7 | `*/*/*` and `[!@]*/*` matching across `/` | XCU 2.14.3 (per the tool): the slash and leading-period rules are "Used for Filename Expansion"; case patterns do not have them. | Correct | — |
| A8 | `${name#@}` and `${name#*/}` | XCU parameter expansion: "${parameter#[word]} — Remove Smallest Prefix Pattern… with the smallest portion of the prefix matched by the pattern deleted." | Correct | — |
| A9 | `${name%%/*}` | XCU: "${parameter%%[word]} — Remove Largest Suffix Pattern… with the largest portion of the suffix matched by the pattern deleted." | Correct: `@scope/name` becomes `@scope%2fname` | — |
| A10 | `code="$(curl …)"; rc=$?`, and `dcode=…` followed by `[ $? -eq 0 ]` | XCU, simple commands: "…the command shall complete with the exit status of the command substitution whose exit status was the last to be obtained." | Correct. The condition that opens that sentence was not returned by the tool. | — |
| A11 | `''` as a pattern alternative (PyPI line, `bad()`) | XCU, quoting: "After quote removal the shell still remembers which characters were quoted. This is necessary for purposes such as matching patterns in a case conditional construct." | Consistent. No sentence about an empty quoted pattern was returned. | — |
| A12 | PyPI line accepts names that end in `.`, `_` or `-` | PyPA: "It must start and end with a letter or number." Regular expression: `^([A-Z0-9]\|[A-Z0-9][A-Z0-9._-]*[A-Z0-9])\Z` | Not wrong, since the file says the rule is its own. But such a name cannot be a valid distribution name. | Add `\|*[._-]` to the refused patterns, and record such a name as "not a valid distribution name under the packaging specification". |
| A13 | "Compare Python names ignoring case, counting `_`, `-` and `.` as the same character." | PyPA, normalisation: "The name should be lowercased with all runs of the characters `.`, `-`, or `_` replaced with a single `-` character." Its list of equivalent names includes `friendly--bard`. | **Wrong (incomplete).** A run of those characters counts as one. | "Compare Python names after normalising both as the packaging specification does: "The name should be lowercased with all runs of the characters `.`, `-`, or `_` replaced with a single `-` character." (https://packaging.python.org/en/latest/specifications/name-normalization/, read 2026-09-30). So `friendly_bard`, `Friendly.Bard` and `friendly--bard` are one name." |
| A14 | Rust `use tokio_advanced::…`, and the crates recipe querying the name from the `use` line | Rust Reference, https://doc.rust-lang.org/reference/items/extern-crates.html: "Cargo will transparently replace `-` with `_`" and "The `as` clause can be used to bind the imported crate to a different name." | The example's 404 holds for the name it queried. **Method gap:** the crate name in a `use` line is not always the package name. A registry probe (round-1 class) showed `https://crates.io/api/v1/crates/serde-json` answering 200 with name "serde_json", so the lookup treats `-` and `_` alike in that direction. The other direction was not tested. | Add a bullet under "Turning an import into a name to query": "Rust: a crate name in `use` is not always the package name (Cargo "will transparently replace `-` with `_`", https://doc.rust-lang.org/reference/items/extern-crates.html, read 2026-09-30). Take the package name from the `Cargo.toml` entry that provides the crate; when none does, query the `use` name and report the answer as being about that name only." |
| A15 | `/(from\|require\()\s*['"]react-query['"]/` | ECMA-262 not retrieved | Syntax looks valid; my reasoning only. Misses `import('react-query')`, `import 'react-query'` and subpaths such as `'react-query/devtools'`. | `/(\bfrom\|\brequire\(\|\bimport\(?)\s*['"]react-query(\/[^'"]*)?['"]/` (not run) |
| A16 | `/\bmoment(\([^)]*\))?\.formatISO\(/` | ECMA-262 not retrieved | Syntax looks valid; my reasoning only. `[^)]*` stops at the first `)`, so `moment(new Date()).formatISO(` and `moment.utc(x).formatISO(` are missed. | `/\bmoment\b[^;\n]*\.formatISO\(/` (a lead only; not run) |
| A17 | `/axios\.get\(.*body:/` | ECMA-262 not retrieved | My reasoning only: without the `s` flag, `.` does not cross a line break, so a configuration object spread over several lines — the usual layout — is missed. It also matches `somebody:`. | `/axios\.get\([^)]*\bbody\s*:/` (not run) |
| A18 | `node -e` regular expressions `/-security$/`, `/security holding package/i`, `/deprecated\|use \S+ instead/i` | ECMA-262 not retrieved | Syntax looks valid; my reasoning only. | — |
| A19 | The YAML response template | YAML 7.3.3: "plain scalars must never contain the ': ' and ' #' character combinations". YAML 5.3: "'@' and '`' are reserved for future use". YAML 6.6: "Comments must be separated from other tokens by white space characters." YAML 8.1.2 covers the indentation of literal `\|` blocks. | **Valid, checked by eye.** The only unquoted value with a colon, `https://arxiv.org/html/2406.10279`, has `/` after the colon. The value starting with `@` is inside double quotes. Every `#` comment has white space before it. Not machine-parsed. (`tokens_used: null` is the known schema conflict and is for the schema's owner to decide.) | — |
| A20 | Python `@app.get("/", auto_validate=True)` with no function after it | Python grammar not fetched | Not checked. As written it is not a complete statement. | — |
| A21 | `fs.readFileSync(path, { throwOnError: true }); // No such option` | See C4 | Holds, and now covers three of the helpers | — |
| A22 | `moment.formatISO(date); // formatISO is date-fns, not moment` | See C1 | Holds | — |
| A23 | `flatMap` row: built in since 2019 | ECMA-262 2019 edition not fetched | Not checked | — |

## Part B — what standards and agencies say, and what the file lacks

**B1. Guidance on checking that a dependency is the one intended (all read 2026-09-30)**

- **OpenSSF Concise Guide for Evaluating Open Source Software**, https://best.openssf.org/Concise-Guide-for-Evaluating-Open-Source-Software (the tool reported the date 2025-04-23):
  - "Check if a similar name is more popular - that could indicate a typosquatting attack."
  - "Check its creation time and popularity."
  - "Verify that the software being evaluated is the authentic version from the authorized source, not a personal fork nor an attacker-controlled fork."
  - "Check its name and the project website for the link."
- **ENISA Technical Advisory for Secure Use of Package Managers**, version 0.8, "Draft for public consultation", 15 December 2025, https://www.enisa.europa.eu/sites/default/files/2025-12/ENISA%20Technical%20Advisory%20-%20Package_Managers_v_0.8_draft.pdf. From the table in section 4.1.1:
  - "Typosquat / Name Check — Verify package names carefully to avoid malicious imitations or naming collisions."
  - "Trusted Source — Use only official and verifiable package registries, and prefer packages published through secure workflows such as Trusted Publishing, which provide provenance metadata to verify the publisher's identity."
  - "Maintainer Reputation — Select packages maintained by reputable or verified organisations/publishers with a consistent record."
  - "Popularity and Maintenance — Consider community adoption and recent update activity … Examples include project stars, downloads, and commits."

  From the section 4.1.2 cheat sheet:
  - "Be cautious of packages owned by newly created, single project accounts, with no additional contributors."
  - "Verify the package's provenance to confirm where and how it was published, and that it was released by a trusted and authorised publisher".
- **SLSA version 1.1 threats**, https://slsa.dev/spec/v1.1/threats, section (H) Package selection:
  - Dependency confusion: "Register a package name in a public registry that shadows a name used on the victim's internal registry". SLSA covers it; the tool paraphrased the mitigation as checking provenance expectations when installing.
  - Typosquatting: "Register a package name that is similar looking to a popular package". SLSA says: "This threat is not currently addressed by SLSA".
- **OWASP Top 10:2025, A03**, https://top10.owasp.org/2025/A03_2025-Software_Supply_Chain_Failures: "Only obtain components from official (trusted) sources over secure links. Prefer signed packages to reduce the chance of including a modified, malicious component". The tool reported no mention of typosquatting or dependency confusion on this page.
- **NIST SP 800-218, version 1.1**, https://nvlpubs.nist.gov/nistpubs/specialpublications/nist.sp.800-218.pdf, document pages 12–13:
  - PW.4.1: "Acquire and maintain well-secured software components (e.g., software libraries, modules, middleware, frameworks) from commercial, open-source, and other third-party developers for use by the organization's software."
  - PW.4.4: "Verify that acquired commercial, open-source, and all other third-party software components comply with the requirements, as defined by the organization, throughout their life cycles."
  - PW.4.4, Example 6: "Confirm the integrity of software components through digital signatures or other mechanisms."
  - PW.4 does not mention name verification or typosquatting.

**Checks these sources recommend that the file lacks:**

(a) **A dependency-confusion candidate that answers 200.** The file quotes npm's description of the attack, but acts only when the answer is 404 ("possible private package"). The dangerous case is a private-looking name that the *public* registry does hold. The recipe prints REGISTERED, and nothing flags it. ENISA section 3.2.4: "Attackers publish packages with the same names as private packages with a much higher version number, thus tricking package managers into fetching the malicious public version instead of the private package." Suggested addition:

> "**Status 200, for a name that may be private.** When the repository configures a registry other than the public one for that ecosystem, or the name carries the organisation's own scope or prefix, and the public registry answers 200, record it under `self_assessment.unknowns` as a possible dependency confusion — "Register a package name in a public registry that shadows a name used on the victim's internal registry" (https://slsa.dev/spec/v1.1/threats, read 2026-09-30) — with the words "no owning agent named here"."

(b) **Provenance, Trusted Publishing and signatures**, recommended by ENISA, OWASP A03, NIST PW.4.4 Example 6 and SLSA. Not in the file. The registry field that carries provenance was not checked.

(c) **Maintainer account and repository link**, recommended by ENISA and OpenSSF. Round 1 left these out on purpose, because the field names were not validated. ENISA's cheat sheet names `npm view <package> maintainers`, but that is the npm command's output, not a validated registry field.

(d) **The look-alike check has standards-body backing it does not cite.** OpenSSF's "Check its creation time and popularity" and "Check if a similar name is more popular" match what the file does.

(e) **None of these sources gives a numeric threshold** for "much later" or "far fewer" — neither OpenSSF nor ENISA in the pages read — so the unsourced threshold noted in round 1 remains, and no source read here can fill it.

**B2. Does any standard name slopsquatting or package hallucination?**

- **OpenSSF, "Security-Focused Guide for AI Code Assistant Instructions"**, dated 2025-08-01, from the OpenSSF Best Practices and AI/ML Working Groups, https://best.openssf.org/Security-Focused-Guide-for-AI-Code-Assistant-Instructions.html. It names both:
  - "Package hallucination occurs when an LLM generates code that recommends or contains a reference to a package that does not actually exist."
  - "A new class of supply chain attacks named 'slopsquatting' has emerged...threat actors could create malicious packages on indexes like PyPI and npm named after ones commonly made up by AI models."

  What it prescribes is aimed at the assistant writing the code, not at a reviewer: "Do not add dependencies that may be malicious or hallucinated." and "Use popular, community-trusted libraries for common tasks (and avoid adding obscure dependencies if a standard library or well-known package can do the same job)."
- **OWASP GenAI Security Project, LLM09:2025 Misinformation**, https://genai.owasp.org/llmrisk/llm092025-misinformation/. It describes the attack without using the word "slopsquatting":
  - "The model suggests insecure or non-existent code libraries, which can introduce vulnerabilities when integrated into software systems."
  - Attack Scenario #1: "Attackers experiment with popular coding assistants to find commonly hallucinated package names. Once they identify these frequently suggested but nonexistent libraries, they publish malicious packages with those names to widely used repositories."
  - Prescribes: "Implement tools and processes to automatically validate key outputs, especially output from high-stakes environments."
- **Not named in:** SLSA version 1.1 threats, OWASP A03:2025 (per the tool), NIST PW.4 (pages read), or ENISA (pages 1–4 and 13–24 read).
- **CISA:** not checked; only search-result titles were seen.
- **Suggestion:** cite OWASP LLM09:2025 Attack Scenario #1 next to Spracklen in the paragraph "Existence is necessary, not sufficient", and the OpenSSF guide as a source for the term "slopsquatting".

**B3. Failure classes the file does not cover**

- **Combosquatting and brandjacking.** USENIX version, page 3688: "Package confusion attacks can be broadly categorized into *typosquatting*, *combosquatting*, *brandjacking*, and *similarity* attacks". The look-alike check covers typosquatting and similarity. It does not name combosquatting — and the file's own example `email-validator-pro` has that shape — or brandjacking.
- **Dependency confusion that answers 200** (B1a).
- **Compromised legitimate packages** (ENISA section 3.2.2) and **newly inserted malicious packages** (ENISA 3.2.1). These fit dependency-auditor's remit or have no owner. The file should name them in its ownership list; the file currently names neither.
- **Deleted packages: supports what the file already does.** USENIX page 3697: "deleted packages are a negligible source of package hallucinations" (133 of 12,871). This backs the file's plain handling of a 404.

**B4. Peer-reviewed measurement to cite next to the preprints**

Joseph Spracklen, Raveen Wijewickrama, A H M Nazmus Sakib, Anindya Maiti, Bimal Viswanath and Murtuza Jadliwala, "We Have a Package for You! A Comprehensive Analysis of Package Hallucinations by Code Generating LLMs", Proceedings of the 34th USENIX Security Symposium, 13–15 August 2025, Seattle, ISBN 978-1-939133-52-6; https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen. Every sentence the file quotes from the arXiv version is in the published text:

| Published text | Page |
|---|---|
| "…There is no way to definitively determine the required packages from a code snippet alone." Preceded by "Simply parsing the code for "import" or "require" is not useful, as the arguments in those statements refer to modules and not packages." | 3692, section 4.3 |
| "we parse the generated Python and JavaScript code for "pip install" and "npm install" commands, respectively." | 3692 |
| "43% of hallucinated packages were repeated in all 10 queries, while 39% did not repeat at all across the 10 queries." The sample was 500 randomly chosen prompts. | 3695 |
| "Our results show that only 13.4% (10,263 of 76,489) have a Levenshtein distance of 1 or 2." Lower-case "only"; the file capitalises it. | 3697 |
| "…as 8.7% (6,705/76,489) of hallucinated Python packages are valid JavaScript packages." | 3697 |
| "An adversary can exploit package hallucinations, especially if they are repeated, by publishing a package to an open-source repository with the same name as the hallucinated or fictitious package…" The file's ellipses fit this sentence. | 3687–3688 |
| New and relevant: "Trivial cross-referencing methods (i.e., comparing a generated package name with a list of known packages) are ineffective for detecting a package hallucination attack, as an adversary may already have published the hallucinated package with malicious code." | 3688 |

This also settles round 1's open question about the denominator behind 13.4%: it is 76,489, the same set the 8.7% sentence calls "hallucinated Python packages".

- **Krishna and colleagues:** the search found only arXiv 2501.19012. No venue was established.
- **Twist and colleagues:** OpenReview returned a verification page, and the search summary contradicted itself ("submitted to" and "accepted to" ICLR 2026). No venue was established.

## Part C — items carried from round 1

- **C1. Static `moment.formatISO`: validated.** In moment's own declaration file (https://raw.githubusercontent.com/moment/moment/develop/ts3.1-typings/moment.d.ts, read 2026-09-30), asked whether "formatISO" appears at all, the tool answered "No." That file declares static functions — `export function utc(inp?: MomentInput, strict?: boolean): Moment;`, `export function unix(timestamp: number): Moment;`, `export function isMoment(m: any): m is Moment;` — and the instance method `toISOString(keepOffset?: boolean): string;`. Neither form has `formatISO`. This is the library's own file, not a round-2 source; no standard governs it. Still open: whether `toISOString()` output matches date-fns `formatISO` on time zones.
- **C2. `maven-metadata.xml` on every Central artifact: unsettled.** Apache Maven's metadata page (https://maven.apache.org/repositories/metadata.html, last published 2026-09-27) says: "The artifactId level metadata (found in directory of artifactId) serves purpose of version discovery. This metadata contains list of versions of given GA coordinates." According to the tool, it does not say the file is required or who writes it. Sonatype's upload page does not mention it. The repository layout page was not fetched. Keep confidence MEDIUM for a Maven Central 404.
- **C3. TanStack Query version 5 `throwOnError` reference entry: not checked.** Three addresses failed: `/query/v5/…` and `/query/latest/…` returned `{"isNotFound":true}`, and the raw GitHub path returned 404. The migration-guide citation stays.
- **C4. The helpers `readFileSync` hands its options to: holds for those read.** Per the tool, on Node.js `main` today:
  - `readFileSync` passes `options` to `getOptions` (reads `encoding` and `signal`), `validateReadFileBufferOptions` (reads `buffer`), `getReadFileBufferByteLengthName` (reads `buffer`) and `tryGetReadFileBuffer` (not read).
  - It passes `options.flag` to `stringToFlags`, which takes the flag value and reads no option property.
  - It now begins with `h.readFileSync(path, options)` when `vfsState.handlers` is set. Round 1 did not report this branch; it was not read.
  - `lib/internal/fs/utils.js` contains no "throwOnError" (the tool's yes-or-no answer).

  The file's sentence is limited to the function body, so it holds. Because it points at `main`, it will drift.

## Counts

- **Part A (23 rows):**
  - 7 correct: A3–A5, A7–A10;
  - 2 consistent or valid by eye: A11, A19;
  - 1 wrong: A13;
  - 1 imprecise: A1;
  - 1 relying on unspecified behaviour: A2;
  - 1 not settled: A6;
  - 2 improvements where nothing is wrong: A12, A14;
  - 4 reasoned only, because the ECMA-262 text was not retrieved: A15–A18;
  - 2 upheld by Part C: A21, A22;
  - 2 not checked: A20, A23.
- **Part B:** 7 sources quoted. 4 missing checks (B1a–B1d). 2 standards name the phenomenon. 2 uncovered attack classes (combosquatting, brandjacking). 1 peer-reviewed venue established.
- **Part C:** 2 validated or holding (C1, C4). 1 unsettled (C2). 1 not checked (C3).
- **Round-1 open items settled:** the 13.4% denominator.

## Everything not checked

- ECMA-262's regular-expression grammar and meaning (two cut-off fetches). Rows A15–A18 are my reasoning only.
- The formal POSIX shell grammar for an empty `case` item. The clause on how `case` patterns are expanded. Whether assigning `LC_ALL` inside a running shell changes its pattern matching. Which shell and locale the agent's Bash tool uses.
- No recipe or regular expression was run, and the YAML was not machine-parsed (this agent has no Bash).
- `node -e … "$body"` making `process.argv[1]` the file path.
- `tryGetReadFileBuffer`, the `vfsState` handler, and whether "throwOnError" appears anywhere in `lib/fs.js`.
- TanStack's `throwOnError` reference entry.
- Maven's repository layout page.
- Renaming through `package =` in `Cargo.toml` (the Cargo Book was not fetched). Whether crates.io matches an underscore query to a hyphenated crate.
- Everything from CISA: search titles only.
- ENISA pages 5–12, and NIST pages outside document pages 10–13.
- Publication venues for Krishna and Twist.
- The ECMA-262 2019 edition for `flatMap`.
- The Python grammar for decorators.
- The tool's negative answers — "not mentioned" on OWASP A03, Sonatype and the Maven page — are summaries, not byte-exact checks.
- Whether `moment().toISOString()` and date-fns `formatISO` handle time zones the same way.

```yaml
response:
  dispatch_id: "d-s4-agent-r2-research"
  protocol_version: 1
  agent: ai-quality/citation-validator
  agent_version: "not stated"
  completed_at: null   # no clock tool in this agent; never an invented time
  findings:
    - id: citation-validator/d-s4-agent-r2-research/001
      severity: medium
      type: citation-mismatch
      file: agents/ai-quality/hallucination-detector.md
      message: "Python name comparison says '_', '-' and '.' count as the same character; the packaging specification collapses runs of them into one '-'."
      suggestion: "correct-to the A13 text (packaging specification, name normalisation)."
      confidence: HIGH
      confidence_rationale: "Specification sentence and its example 'friendly--bard' fetched during this dispatch."
      citations:
        brief_url: https://packaging.python.org/en/latest/specifications/name-normalization/
        evidence: [{ file: agents/ai-quality/hallucination-detector.md, text: "Compare Python names ignoring case, counting `_`, `-` and `.` as the same character." }]
    - id: citation-validator/d-s4-agent-r2-research/002
      severity: medium
      type: citation-mismatch
      file: agents/ai-quality/hallucination-detector.md
      message: "Nine bracket expressions use ranges (A-Za-z0-9); POSIX leaves ranges unspecified outside the POSIX locale; the prose says 'letters' without 'ASCII'."
      suggestion: "correct-to the A1 and A2 texts (explicit character list; 'ASCII letters')."
      confidence: HIGH
      confidence_rationale: "XBD 9.3.5 item 7 quoted."
      citations:
        brief_url: https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap09.html
    - id: citation-validator/d-s4-agent-r2-research/003
      severity: info
      type: citation-validated
      message: "Every Spracklen sentence the file quotes appears in the peer-reviewed USENIX Security 2025 version (pages 3687-3697); 13.4% and 8.7% share the denominator 76,489 hallucinated Python packages."
      suggestion: "keep; add the USENIX citation with page numbers next to the arXiv one; lower-case 'only' in the 13.4% quote if citing USENIX."
      confidence: HIGH
      confidence_rationale: "PDF pages read as rendered images during this dispatch."
      citations:
        brief_url: https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen
    - id: citation-validator/d-s4-agent-r2-research/004
      severity: medium
      type: method-gap
      message: "The file acts on a private-looking name only when the public registry answers 404; dependency confusion is the case where it answers 200."
      suggestion: "add the B1a rule."
      confidence: MEDIUM
      citations:
        brief_url: https://slsa.dev/spec/v1.1/threats
    - id: citation-validator/d-s4-agent-r2-research/005
      severity: low
      type: method-gap
      message: "A Rust 'use' crate name is not always the package name (Cargo replaces '-' with '_'; dependencies can be renamed)."
      suggestion: "add the A14 bullet."
      confidence: MEDIUM
      citations:
        brief_url: https://doc.rust-lang.org/reference/items/extern-crates.html
    - id: citation-validator/d-s4-agent-r2-research/006
      severity: info
      type: citation-validated
      message: "Static moment.formatISO: absent from moment's declaration file; readFileSync helpers read so far use encoding, signal and buffer only."
      suggestion: keep
      confidence: MEDIUM
      confidence_rationale: "Read through the fetch tool's summarising model; tryGetReadFileBuffer and the vfsState branch were not read."
  self_assessment:
    coverage: 0.83
    confidence_overall: MEDIUM
    limitations:
      - "ECMA-262 regular-expression text was not retrieved; the regular-expression verdicts are reasoned only."
      - "Web quotations passed through the fetch tool's summarising model; PDF quotations are my transcriptions of rendered pages."
      - "No recipe, regular expression or YAML block was executed or parsed."
    unknowns:
      - "TanStack v5 throwOnError reference entry"
      - "maven-metadata.xml on every Central artifact"
      - "CISA guidance"
      - "Krishna and Twist publication venues"
  metadata:
    tokens_used: null
    tool_calls: 44
```

Files read: `/Users/account/Code/ctoc/agents/ai-quality/hallucination-detector.md`, `/Users/account/Code/ctoc/.ctoc/audit/improvement-run-notes/s4-agent-round1-critic-final-d-s4-agent-r1-critic.md`, `/Users/account/Code/ctoc/.ctoc/audit/improvement-run-notes/s4-agent-round1-revalidate-d-s4-agent-r1-revalidate.md`. PDFs kept by the fetch tool, in `/Users/account/.claude/projects/-Users-account-Code-ctoc/b1c5a29e-f445-4461-8294-b84832a0154b/tool-results/`: `webfetch-1790789115380-7jw4p5.pdf` (USENIX), `webfetch-1790789162543-80st8n.pdf` (ENISA), `webfetch-1790789165644-0nl284.pdf` (NIST).