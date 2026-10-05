# Round 3 critique of skills/ai-quality/ai-code-quality-reviewer/SKILL.md (dispatch d-s3-skill-r3-critic, agent-critic from installed plugin 6.14.65, 2026-09-30)

Round 3 makes 17 edits to the skill:
- **Quotes corrected.**
  - The Aikido quote gets its opening words back, and an ellipsis now marks the gap between its two sentences; neither cut was marked before.
  - Check's self-description now cites both readings: the HTML manual's header "a unit test framework for C" and the source's "Check is a unit testing framework for C."
  - CWE-242 keeps "says", now placed in its demonstrative example beside its description.
- **Code facts now sourced.** sqlite3 declares `qmark`, and also accepts the named style. The three-argument `toConcurrentMap` signature is cited from Oracle's page. A GCC-manual caution says braces do not protect commas inside a macro argument.
- **The Core Guidelines caveat** now says the canonical raw source was cut off too, not just the page.
- **Added from the regulator report.**
  - The automation-bias source, on the "assume errors" principle and on the last red line.
  - A check against a named list of permitted packages, as a skill-typed class: `package_not_allowlisted`, severity medium.
  - A software bill of materials hand-on to sbom-cra-checker, worded to match its "SBOM correctness" description; the skill is also added to `related_skills`.
  - Extension audits and Markdown-image leaks under category K, both routed to llm-security-tester.
  - A marking on a code block treated as a provenance hint, not proof.
- **NIST's code-review practice (PW.7)** now supports the rule to read assistant-written code line by line.
- **"Change adds no tests"** stays with the human (finding 19). The regulator's sentence is cited there, and no class is added.

On the disputed spelling: I read printed page 9 again. As I read the page image, it prints "completetly hallucinated", which is what the agent file has; the researcher read "completly". Both are readings of an image, so I propose no correction; extracting the PDF's text layer would settle it. One correction of my own: in the agent's round 3 I quoted the word as "completely", silently fixing the source's typo. The executor's re-validation undid that.

```json
{
  "queries": [
    { "text": "fetch raw CppCoreGuidelines.md for R.23 heading and R.11 Enforcement", "source_class": "publisher", "repeated_because": "round 2 read R.23/R.11 only on a mirror; canonical HTML truncated" },
    { "text": "CWE REST API weakness 369,571,477,242,215,546 Description fields", "source_class": "standards body", "repeated_because": "round 2 quotes came through summaries of the HTML pages" },
    { "text": "CWE REST API weakness 242,546 sentences containing gets() / BUG, HACK / TODO", "source_class": "standards body", "repeated_because": "the CWE-242 description returned did not match the skill's quote; needed the field it comes from" },
    { "text": "fetch raw libcheck doc/check.texi for ck_assert, ck_assert_double_eq_tol, framework self-description", "source_class": "vendor documentation", "repeated_because": "earlier read via summary of check_4.html" },
    { "text": "fetch check_4.html title and 'framework for C' wording", "source_class": "vendor documentation", "repeated_because": "raw Texinfo returned 'unit testing framework', differing from the skill" },
    { "text": "fetch Aikido slopsquatting blog react-codeshift sentence", "source_class": "vendor documentation", "repeated_because": "no raw form exists; re-read for exact wording" },
    { "text": "fetch Oracle Collectors toConcurrentMap signatures", "source_class": "vendor documentation", "repeated_because": "Part 2: three-argument overload signature never read" },
    { "text": "fetch GCC manual Macro Arguments", "source_class": "vendor documentation", "repeated_because": null },
    { "text": "fetch docs.python.org sqlite3 paramstyle", "source_class": "vendor documentation", "repeated_because": null },
    { "text": "Read local PDF ANSSI/BSI 'AI Coding Assistants' pages 8-12", "source_class": "regulator", "repeated_because": "brief asks for pages 8-12; agent cites 9-12" },
    { "text": "fetch NIST SP 800-218 PDF, then Read saved PDF pages 26-31 and 22-24 for PW.7", "source_class": "standards body", "repeated_because": null },
    { "text": "Read the saved ANSSI and BSI PDF, printed page 9, for the spelling of the word before 'hallucinated'", "source_class": "regulator", "repeated_because": "the round-3 researcher's reading ('completly') disagrees with the agent file ('completetly')" }
  ],
  "sources": [
    { "url": "https://raw.githubusercontent.com/isocpp/CppCoreGuidelines/master/CppCoreGuidelines.md", "read_on": "2026-09-30", "bore_on": "skill line 207: R.23 and R.11", "outcome": "unreachable", "quote": null, "error": "neither R.23 nor R.11 are present in the markdown you supplied. The content ends mid-section in the \"F: Functions\" area. The last major section heading visible is: \"# <a name=\"s-functions\"></a>F: Functions\"" },
    { "url": "https://cwe-api.mitre.org/api/v1/cwe/weakness/369,571,477,242,215,546", "read_on": "2026-09-30", "bore_on": "skill lines 158, 207, 252, 256, 394, 416", "outcome": "supported", "quote": "CWE-242 Description: \"The product calls a function that can never be guaranteed to work safely.\"", "error": null },
    { "url": "https://cwe-api.mitre.org/api/v1/cwe/weakness/242,546", "read_on": "2026-09-30", "bore_on": "skill lines 252, 416", "outcome": "supported", "quote": "DemonstrativeExamples DX-5: \"However, gets() is inherently unsafe, because it copies all input from STDIN to the buffer without checking size.\" / ExtendedDescription: \"Many suspicious comments, such as BUG, HACK, FIXME, LATER, LATER2, TODO, in the code indicate missing security functionality and checking.\"", "error": null },
    { "url": "https://raw.githubusercontent.com/libcheck/check/master/doc/check.texi", "read_on": "2026-09-30", "bore_on": "skill lines 310, 312", "outcome": "supported", "quote": "Fails test if supplied condition evaluates to false. / Compares two double precision floating point values (@code{double}) with specified user tolerance set by the third parameter (@code{double})", "error": null },
    { "url": "https://libcheck.github.io/check/doc/check_html/check_4.html", "read_on": "2026-09-30", "bore_on": "skill line 310: Check's self-description", "outcome": "supported", "quote": "Check: a unit test framework for C", "error": null },
    { "url": "https://www.aikido.dev/blog/slopsquatting-ai-package-hallucination-attacks", "read_on": "2026-09-30", "bore_on": "skill line 175", "outcome": "supported", "quote": "In January 2026, Charlie claimed this npm package called `react-codeshift`. ... The package wasn't real, had no author, and definitely hadn't been registered before.", "error": null },
    { "url": "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/Collectors.html", "read_on": "2026-09-30", "bore_on": "skill lines 332, 335: three-argument toConcurrentMap", "outcome": "supported", "quote": "public static <T, K, U> Collector<T,?,ConcurrentMap<K,U>> toConcurrentMap(Function<? super T,? extends K> keyMapper, Function<? super T,? extends U> valueMapper, BinaryOperator<U> mergeFunction)", "error": null },
    { "url": "https://gcc.gnu.org/onlinedocs/cpp/Macro-Arguments.html", "read_on": "2026-09-30", "bore_on": "skill lines 291-299: commas inside EXPECT_EQ arguments", "outcome": "supported", "quote": "Parentheses within each argument must balance; a comma within such parentheses does not end the argument. However, there is no requirement for square brackets or braces to balance, and they do not prevent a comma from separating arguments.", "error": null },
    { "url": "https://docs.python.org/3/library/sqlite3.html", "read_on": "2026-09-30", "bore_on": "skill lines 347-348, 359", "outcome": "supported", "quote": "String constant stating the type of parameter marker formatting expected by the sqlite3 module. Required by the DB-API. Hard-coded to \"qmark\". ... The named DB-API parameter style is also supported.", "error": null },
    { "url": "https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf", "read_on": "2026-09-30", "bore_on": "skill lines 53, 58; Part 3 (local copy, pages 8-12 read as page images)", "outcome": "supported", "quote": "Generated source code should generally be checked and reproduced by the developers. A critical review should be carried out particularly with regard to hallucinations and security risks.", "error": null },
    { "url": "https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf", "read_on": "2026-09-30", "bore_on": "Part 3: PW.7 code review", "outcome": "supported", "quote": "Human-readable code includes source code, scripts, and any other form of code that an organization deems human-readable.", "error": null },
    { "url": "https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf", "read_on": "2026-09-30", "bore_on": "printed page 9, read by the critic from the saved copy as a page image: the spelling in the agent file's quote, and the page-9 quotes proposed here", "outcome": "supported", "quote": "explanations, comments or documentation generated by an AI assistant can be incorrect or completetly hallucinated, which might lead to security issues and reduce code maintenability. ... Automatic function tests should be employed. ... It might be beneficial to flag AI generated code blocks and to document the used AI tools.", "error": null }
  ],
  "findings": [
    {
      "id": "f-s3-skill-r3-1",
      "kind": "correction-of-earlier-round",
      "text": "The Aikido quote (category A, first placed by f-s3-skill-r1-10) had two unmarked cuts. It starts partway through its sentence: the source opens 'In January 2026,'. And it joins two sentences with no ellipsis, where the source has text between them. Both cuts are now marked; the meaning is unchanged.",
      "evidence": "https://www.aikido.dev/blog/slopsquatting-ai-package-hallucination-attacks, read 2026-09-30: \"In January 2026, Charlie claimed this npm package called `react-codeshift`. ... The package wasn't real, had no author, and definitely hadn't been registered before.\"; round-3 report Part 1 Aikido row",
      "proposed_change": {
        "old": "a researcher at Aikido registered it first: \"Charlie claimed this npm package called `react-codeshift`. The package wasn't real, had no author, and definitely hadn't been registered before.\"",
        "new": "a researcher at Aikido registered it first: \"In January 2026, Charlie claimed this npm package called `react-codeshift`. ... The package wasn't real, had no author, and definitely hadn't been registered before.\""
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r3-2",
      "kind": "correction-of-earlier-round",
      "text": "Corrects f-s3-skill-r2-11. Check's self-description reads differently in its two forms. The HTML manual's page headers read 'Check: a unit test framework for C', confirmed only through a summary. The raw Texinfo source reads 'Check is a unit testing framework for C.' The report did not find the line that produces the header, so both readings are given side by side. The ck_assert quote is confirmed raw in the Texinfo source, which is now cited. 'On the same page' becomes 'in the HTML manual', so it still points at the right source.",
      "evidence": "https://libcheck.github.io/check/doc/check_html/check_4.html (\"Check: a unit test framework for C\") and https://raw.githubusercontent.com/libcheck/check/master/doc/check.texi (\"Fails test if supplied condition evaluates to false.\"), read 2026-09-30; round-3 report Part 1 Check rows: \"The raw Texinfo fetch returned a different sentence, \"Check is a unit testing framework for C.\"\"",
      "proposed_change": {
        "old": "Check calls itself \"a unit test framework for C\" and documents `ck_assert` as \"Fails test if supplied condition evaluates to false.\" (https://libcheck.github.io/check/doc/check_html/check_4.html, read 2026-09-30); `ck_assert_int_eq` and `ck_assert_ptr_nonnull` are listed on the same page.",
        "new": "Check's HTML manual is headed \"Check: a unit test framework for C\" (https://libcheck.github.io/check/doc/check_html/check_4.html, read 2026-09-30), while the manual's source reads \"Check is a unit testing framework for C.\" and documents `ck_assert` as \"Fails test if supplied condition evaluates to false.\" (https://raw.githubusercontent.com/libcheck/check/master/doc/check.texi, read 2026-09-30); `ck_assert_int_eq` and `ck_assert_ptr_nonnull` are listed in the HTML manual."
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r3-3",
      "kind": "new",
      "text": "CWE-242's quoted sentence comes from the entry's demonstrative example, not its description. The report says the skill's 'says' is accurate and must not become 'describes'. The sentence keeps 'says', places the quote in its example, and adds the description.",
      "evidence": "https://cwe-api.mitre.org/api/v1/cwe/weakness/369,571,477,242,215,546 and https://cwe-api.mitre.org/api/v1/cwe/weakness/242,546, read 2026-09-30: Description \"The product calls a function that can never be guaranteed to work safely.\"; DemonstrativeExamples DX-5 \"However, gets() is inherently unsafe, because it copies all input from STDIN to the buffer without checking size.\"",
      "proposed_change": {
        "old": "A `gets` call is also a security defect: MITRE's CWE-242 says \"gets() is inherently unsafe, because it copies all input from STDIN to the buffer without checking size.\" (https://cwe.mitre.org/data/definitions/242.html, read 2026-09-30).",
        "new": "A `gets` call is also a security defect: MITRE's CWE-242, \"The product calls a function that can never be guaranteed to work safely.\", says in a demonstrative example that \"gets() is inherently unsafe, because it copies all input from STDIN to the buffer without checking size.\" (https://cwe.mitre.org/data/definitions/242.html, read 2026-09-30)."
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r3-4",
      "kind": "new",
      "text": "The Core Guidelines caveat said only that the canonical page was cut off. The raw source of the guidelines was cut off too, so R.23 and R.11 remain readable only on the mirror. The caveat now says so; the mirror citation stays.",
      "evidence": "https://raw.githubusercontent.com/isocpp/CppCoreGuidelines/master/CppCoreGuidelines.md, read 2026-09-30, unreachable: \"The content ends mid-section in the \\\"F: Functions\\\" area\"",
      "proposed_change": {
        "old": "(read on a mirror, https://cpp-core-guidelines-docs.vercel.app/resource, because the canonical page https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines was cut off before that section)",
        "new": "(read on a mirror, https://cpp-core-guidelines-docs.vercel.app/resource, because both the canonical page https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines and its raw source https://raw.githubusercontent.com/isocpp/CppCoreGuidelines/master/CppCoreGuidelines.md were cut off before that section)"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r3-5",
      "kind": "new",
      "text": "The three-argument `toConcurrentMap` call in the Java example was never checked against its signature. Oracle's Collectors page gives the signature, and the sources sentence now cites it.",
      "evidence": "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/Collectors.html, read 2026-09-30: \"public static <T, K, U> Collector<T,?,ConcurrentMap<K,U>> toConcurrentMap(Function<? super T,? extends K> keyMapper, Function<? super T,? extends U> valueMapper, BinaryOperator<U> mergeFunction)\"; round-3 report Part 2 row 1",
      "proposed_change": {
        "old": "`Collectors.toConcurrentMap` \"is a concurrent and unordered Collector\" (https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/Collectors.html);",
        "new": "`Collectors.toConcurrentMap` \"is a concurrent and unordered Collector\", and the three-argument form used above is `toConcurrentMap(Function<? super T,? extends K> keyMapper, Function<? super T,? extends U> valueMapper, BinaryOperator<U> mergeFunction)` (https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/Collectors.html);"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r3-6",
      "kind": "new",
      "text": "The GoogleTest and Check lines are correct only because their braces sit inside a function call's parentheses; braces alone do not protect a comma from the preprocessor. A sentence citing the GCC manual now says so, so a later edit does not move a braced value out of the call and break the macro.",
      "evidence": "https://gcc.gnu.org/onlinedocs/cpp/Macro-Arguments.html, read 2026-09-30: \"Parentheses within each argument must balance; a comma within such parentheses does not end the argument. However, there is no requirement for square brackets or braces to balance, and they do not prevent a comma from separating arguments.\"; round-3 report Part 2 row 2 and its caution",
      "proposed_change": {
        "old": "Unity's reference agrees: \"Unity doesn't do direct floating point comparisons for equality.\" (https://github.com/ThrowTheSwitch/Unity/blob/master/docs/UnityAssertionsReference.md, read 2026-09-30).",
        "new": "Unity's reference agrees: \"Unity doesn't do direct floating point comparisons for equality.\" (https://github.com/ThrowTheSwitch/Unity/blob/master/docs/UnityAssertionsReference.md, read 2026-09-30).\n\nIn these macros, keep brace-initialised values inside a function call's parentheses, as the examples above do. The GCC manual: \"Parentheses within each argument must balance; a comma within such parentheses does not end the argument. However, there is no requirement for square brackets or braces to balance, and they do not prevent a comma from separating arguments.\" (https://gcc.gnu.org/onlinedocs/cpp/Macro-Arguments.html, read 2026-09-30)."
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r3-7",
      "kind": "correction-of-earlier-round",
      "text": "Corrects f-s3-skill-r2-13, which could not say which placeholder style sqlite3 declares. sqlite3 declares qmark, 'Hard-coded' so, and also accepts the named style. The comment in the example says so, and so does the sources sentence.",
      "evidence": "https://docs.python.org/3/library/sqlite3.html, read 2026-09-30: \"String constant stating the type of parameter marker formatting expected by the sqlite3 module. Required by the DB-API. Hard-coded to \\\"qmark\\\". ... The named DB-API parameter style is also supported.\"",
      "proposed_change": {
        "old": "# BETTER: pass the value as a parameter, never through string formatting. `?` is PEP 249's qmark style; check the paramstyle your driver's module declares",
        "new": "# BETTER: pass the value as a parameter, never through string formatting. `?` is PEP 249's qmark style, which sqlite3 declares (it also accepts the named style); for another driver, check the paramstyle its module declares"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r3-8",
      "kind": "new",
      "text": "The second half of f-s3-skill-r3-7: the sqlite3 source clause gains the paramstyle quotes that the comment now relies on.",
      "evidence": "https://docs.python.org/3/library/sqlite3.html, read 2026-09-30 (round-3 report Part 2 row 3: \"Hard-coded to `\"qmark\"`.\" and \"The `named` DB-API parameter style is also supported.\")",
      "proposed_change": {
        "old": "Python's `sqlite3` documentation, \"beware of using Python's string operations to assemble queries, as they are vulnerable to SQL injection attacks.\" (https://docs.python.org/3/library/sqlite3.html);",
        "new": "Python's `sqlite3` documentation, \"beware of using Python's string operations to assemble queries, as they are vulnerable to SQL injection attacks.\", and on its `paramstyle`, \"Hard-coded to `\"qmark\"`.\" and \"The named DB-API parameter style is also supported.\" (https://docs.python.org/3/library/sqlite3.html);"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r3-9",
      "kind": "new",
      "text": "The 'Assume errors' principle had only the Stack Overflow survey behind it. The regulator report's automation-bias passage on page 8 is the missing source, and is added.",
      "evidence": "https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf, read 2026-09-30, page 8 (round-3 report Part 3 item 5): \"Studies show a cognitive bias when using AI coding assistants, as many developers perceive them as secure, although security vulnerabilities are regularly identified.\"; \"even flawed solutions are well-worded\"",
      "proposed_change": {
        "old": "Review skeptically, line by line.",
        "new": "Review skeptically, line by line: the joint French and German report warns that \"even flawed solutions are well-worded\" and that \"Studies show a cognitive bias when using AI coding assistants, as many developers perceive them as secure, although security vulnerabilities are regularly identified.\" (page 8)."
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r3-10",
      "kind": "new",
      "text": "The last red line ('never fast-track it because the model is thought to be good') had no source. Round 1 removed the unsourced 'incident data' it once claimed (f-s3-skill-r1-24). The regulator's automation-bias sentence now sources it.",
      "evidence": "https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf, read 2026-09-30, page 8: \"many developers perceive them as secure, although security vulnerabilities are regularly identified\"",
      "proposed_change": {
        "old": "- NEVER skip the human review of assistant-written production code, and never fast-track it because the model is thought to be good.",
        "new": "- NEVER skip the human review of assistant-written production code, and never fast-track it because the model is thought to be good: \"many developers perceive them as secure, although security vulnerabilities are regularly identified\" (joint French and German report, page 8)."
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r3-11",
      "kind": "new",
      "text": "The rule to read assistant-written code line by line gains NIST's secure-development practice PW.7, which sets code-review scope by the form of the code, not by who wrote it. 'SP' is written out as Special Publication. The report did not read the publication date, so none is given.",
      "evidence": "https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf, read 2026-09-30, printed page 14 (round-3 report Part 3, PW.7): \"Human-readable code includes source code, scripts, and any other form of code that an organization deems human-readable.\"",
      "proposed_change": {
        "old": "this skill gives assistant-written code the full reading the guide requires for human-written code, not the scan it allows for generated code.",
        "new": "this skill gives assistant-written code the full reading the guide requires for human-written code, not the scan it allows for generated code. NIST Special Publication 800-218, the Secure Software Development Framework, sets the scope of code review by the form of the code, not by who wrote it: \"Human-readable code includes source code, scripts, and any other form of code that an organization deems human-readable.\" (practice PW.7, https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf, read 2026-09-30, page 14)."
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r3-12",
      "kind": "new",
      "text": "Category A adds two checks from the regulator report (page 10):\n1. A software bill of materials hand-on, where the project keeps one, to sbom-cra-checker. Its description begins 'SBOM correctness, signing, retention', so the hand-on is worded as a correctness check.\n2. A permitted-package check, where the dispatch or plan names a list. It carries the skill-typed class `package_not_allowlisted` at medium severity, because the agent's rule says a class named only in the skill is reported under the skill's type. It is not a hallucination: the package is real but should not be there.\nBoth checks need only Read and Grep: read the named list, compare the imports. The report called the permitted-package check a scope decision, and the brief directed that it be proposed.",
      "evidence": "https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf, read 2026-09-30, page 10 (round-3 report Part 3 items 1-2); agents/compliance/sbom-cra-checker.md:3; agents/ai-quality/ai-code-quality-reviewer.md:45 ('report it as a finding, typed as the skill types it')",
      "proposed_change": {
        "old": "Hand on: hallucination-detector checks whether a package exists on its registry and whether a name that resolves is a look-alike. This skill flags the import as unconfirmed.",
        "new": "Hand on: hallucination-detector checks whether a package exists on its registry and whether a name that resolves is a look-alike. This skill flags the import as unconfirmed. Where the project keeps a software bill of materials, whether a new dependency appears in it correctly is sbom-cra-checker's check: record the dependency under `self_assessment.unknowns` with that agent's name. The joint French and German report explains why the bill matters: \"The creation of a Software Bill of Materials (SBOM) allows you to retrospectively understand whether vulnerable libraries were used and enables a targeted response if a vulnerability of certain components becomes known.\" (https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf, read 2026-09-30, page 10).\n\nWhere the dispatch or the plan names a list of permitted packages, an import of a real package that is not on it is a finding too, type `package_not_allowlisted`, severity medium; it is not a hallucination, so it is not handed on. The same report: \"If there are guidelines in the company as to which packages can be used as part of a development and which cannot, a whitelisting of permitted packages could be carried out.\" (page 10)."
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r3-13",
      "kind": "new",
      "text": "Consistency for f-s3-skill-r3-12: the severity table's medium row gains `package_not_allowlisted`.",
      "evidence": "skills/ai-quality/ai-code-quality-reviewer/SKILL.md:542",
      "proposed_change": {
        "old": "| MEDIUM | `over_engineering`; `fabricated_pattern`; `missing_edge_case` |",
        "new": "| MEDIUM | `over_engineering`; `fabricated_pattern`; `missing_edge_case`; `package_not_allowlisted` |"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r3-14",
      "kind": "new",
      "text": "Consistency for f-s3-skill-r3-12: the checklist gains the permitted-package check. The software bill of materials line follows in f-s3-skill-r3-15, and sbom-cra-checker joins related_skills in f-s3-skill-r3-16.",
      "evidence": "skills/ai-quality/ai-code-quality-reviewer/SKILL.md:508",
      "proposed_change": {
        "old": "- [ ] Every new import is in a manifest or lockfile you read; any other goes to hallucination-detector, confidence LOW",
        "new": "- [ ] Every new import is in a manifest or lockfile you read; any other goes to hallucination-detector, confidence LOW\n- [ ] Where a list of permitted packages is named, every new import is on it"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r3-15",
      "kind": "new",
      "text": "Consistency for f-s3-skill-r3-12: the checklist's 'Handed on' list gains the software bill of materials line.",
      "evidence": "skills/ai-quality/ai-code-quality-reviewer/SKILL.md:505; agents/compliance/sbom-cra-checker.md:3",
      "proposed_change": {
        "old": "- [ ] Debug output: code-reviewer; a printed or written secret: secrets-detector",
        "new": "- [ ] Debug output: code-reviewer; a printed or written secret: secrets-detector\n- [ ] A new dependency, where the project keeps a software bill of materials: sbom-cra-checker"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r3-16",
      "kind": "new",
      "text": "related_skills gains compliance/sbom-cra-checker, the skill the new hand-on names. Its SKILL.md exists: it is one of the 96 skills that carry the pinned critic-mode block.",
      "evidence": "skills/compliance/sbom-cra-checker/SKILL.md; skills/ai-quality/ai-code-quality-reviewer/SKILL.md:30",
      "proposed_change": {
        "old": "  - ai-quality/llm-security-tester\neffort_level: high",
        "new": "  - ai-quality/llm-security-tester\n  - compliance/sbom-cra-checker\neffort_level: high"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r3-17",
      "kind": "new",
      "text": "Category K gains two concerns the regulator report names that neither the skill nor the agent carried. One is the audit of an added extension or tool-server entry (page 11). The other is a Markdown image link pointing outside the repository, added to a file the assistant reads, as a path for leaking data (page 10). The image link is found with Grep and recorded for llm-security-tester; it is not reported as a configuration change.",
      "evidence": "https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf, read 2026-09-30, pages 10-11 (round-3 report Part 3 items 6-7): \"Limit the use of extensions.\"; \"Audit and anticipate impacts of the interactions of these extensions with development, production and CI/CD environments.\"; \"Displaying Markdown images is also a common way to exfiltrate sensitive information in a successful attack (Rehberger, 2024).\"",
      "proposed_change": {
        "old": "Report the path and what the change adds or removes. Action: report type `assistant_configuration_change`, severity high; what the change lets the assistant do goes to llm-security-tester.",
        "new": "Report the path and what the change adds or removes. For a change that adds an extension or a tool-server entry, the joint French and German report advises \"Limit the use of extensions.\" and \"Audit and anticipate impacts of the interactions of these extensions with development, production and CI/CD environments.\" (https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf, read 2026-09-30, page 11). A Markdown image link that points outside the repository, added to a file the assistant reads — a rules file, a README, documentation — is a path for leaking data: \"Displaying Markdown images is also a common way to exfiltrate sensitive information in a successful attack\" (page 10). Grep the changed files for `![` and record each outside link for llm-security-tester. Action: report type `assistant_configuration_change`, severity high; what the change lets the assistant do goes to llm-security-tester."
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r3-18",
      "kind": "new",
      "text": "The regulator report suggests marking assistant-written code blocks (page 9), hedged as 'might be beneficial'. It is not a defect class. The commit-trailer row's meaning cell now treats a block marking the same way as a trailer: a provenance hint to note, not proof, with provenance still taken from the dispatch.",
      "evidence": "https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf, printed page 9, read by the critic and the round-3 researcher on 2026-09-30: \"It might be beneficial to flag AI generated code blocks and to document the used AI tools.\"; agents/ai-quality/ai-code-quality-reviewer.md:65",
      "proposed_change": {
        "old": "| A missing trailer proves nothing about who wrote the code; take provenance from the dispatch |",
        "new": "| A missing trailer proves nothing about who wrote the code; take provenance from the dispatch. A marking on a code block is the same: the joint French and German report suggests one (\"It might be beneficial to flag AI generated code blocks and to document the used AI tools.\", page 9), so where a block carries one, note it under `self_assessment.unknowns` as a provenance hint, not proof |"
      },
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r3-19",
      "kind": "new",
      "text": "For the human, no text change: round 2 left open that nothing checks whether a change adds tests at all (f-s3-skill-r2-15). The regulator report now supports that point as well: 'Automatic function tests should be employed.' (page 9). Adding the check is a scope decision. No class of the agent carries it, and coverage-enforcer's description ('diff coverage', 'patch coverage') would make it the natural owner.",
      "evidence": "https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf, printed page 9, read 2026-09-30: \"Automatic function tests should be employed.\"; agents/testing/coverage-enforcer.md:3",
      "proposed_change": null,
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r3-20",
      "kind": "new",
      "text": "Provenance record; no text change. Confirmed from raw sources in round 3: the GoogleTest quotes, Unity, OWASP (both lines; the raw file mentions artificial intelligence nowhere), CWE-369, 571, 477, 215 and 546, the HashMap and stream-package quotes (from OpenJDK source), and the regulator's page 12 and page 9 quotes. Confirmed only through a summary: Stack Overflow's two figures, ConcurrentHashMap.merge, toConcurrentMap's 'concurrent and unordered', and Check's HTML header. Two report items support existing text without an edit: page 9 on '\"deconstruct\" AI-generated code and the used prompts' (category H), and '\"source code critics\"' (the hand-on to sast-scanner).",
      "evidence": "round-3 report Part 1 table and Part 3 item 8",
      "proposed_change": null,
      "needs_human": false
    },
    {
      "id": "f-s3-skill-r3-21",
      "kind": "new",
      "text": "The disputed spelling on the regulator's page 9, which the agent file quotes. I read printed page 9 of the saved PDF as an image this round. As I read it, the page prints 'incorrect or completetly hallucinated, which might lead to security issues and reduce code maintenability', which is what the agent file quotes. The round-3 researcher read 'completly'. Both readings are of a page image; neither is a text extraction, and I have no tool that extracts the PDF's text layer. So I propose no change and rate my reading medium confidence. A correction on my own part: in the agent's round 3 (f-s3-agent-r3-8) I wrote 'completely', silently fixing the source's typo. The executor's re-validation replaced it with the source's spelling.",
      "evidence": "<home>/.claude/projects/-Users-account-Code-ctoc/26a2fcc0-aa46-4510-a665-3c2f0ee314f5/tool-results/webfetch-1790763462989-llcq7m.pdf, printed page 9, read 2026-09-30; agents/ai-quality/ai-code-quality-reviewer.md:62 ('completetly hallucinated'); round-3 report Part 3 item 9",
      "proposed_change": null,
      "needs_human": false
    }
  ],
  "seven_languages": {
    "applies": true,
    "reason": "The rule applies wherever a class is meaningful. This round changes no example code; it adds sources that bear on the C, C++, Java and Python examples, a caution about the C and C++ test-macro lines, and one comment change in the Python safe form.",
    "examples_checked": [
      { "language": "C# (.NET 9)", "how": "Unchanged this round: A, B, F, H, I as sourced in rounds 1 and 2. Still no safe SQL form, because no report quotes C# parameter code." },
      { "language": "Java 21+", "how": "D: the three-argument toConcurrentMap call is now checked against Oracle's Collectors signature; the HashMap and stream-package quotes are confirmed from OpenJDK 21 source. B, F, I unchanged." },
      { "language": "Python 3.12+", "how": "E: the placeholder is now stated as what sqlite3 declares ('Hard-coded to \"qmark\"', named style also supported), with PEP 249 kept. A, B, C, G, H, I, J unchanged." },
      { "language": "C (C17/23)", "how": "C: the Check pair keeps its wrapper caveat. Check's self-description now cites both its HTML header and its Texinfo source, and ck_assert is confirmed raw. The GCC macro-argument caution covers the Check line. B: CWE-242 is now placed in its demonstrative example. Section 6 and I unchanged." },
      { "language": "C++ (20/23)", "how": "C: the GoogleTest pair is confirmed against the raw assertions reference, and the GCC caution explains why its braced arguments are safe. B: R.23 and R.11 remain mirror-only, and the caveat now says the raw source was cut off too." },
      { "language": "JavaScript/TypeScript", "how": "Unchanged this round; the Aikido quote in A is re-cut, which changes prose, not code." },
      { "language": "SQL", "how": "Unchanged: E's sp_executesql form, validated in round 2." }
    ]
  },
  "sibling_boundary": {
    "sbom-cra-checker": "New hand-on: whether a new dependency appears correctly in a kept software bill of materials, matching its description 'SBOM correctness, signing, retention'.",
    "llm-security-tester": "Gains two recorded items under K: an added extension or tool-server entry (its body already watches for 'A capability provider or extension server is installed'), and an outside Markdown image link in a file the assistant reads.",
    "hallucination-detector": "Unchanged; the new permitted-package check covers real packages, which are this skill's finding, not a hallucination, so nothing moves to it.",
    "sast-scanner": "Unchanged; the gets() hand-on now cites CWE-242's description and demonstrative example.",
    "coverage-enforcer": "Still only named for the human in f-s3-skill-r3-19; not added.",
    "code-reviewer, concurrency-checker, secrets-detector, dependency-checker": "Unchanged this round."
  },
  "nothing_found": false
}
```

**For the agent** (late corrections for `agents/ai-quality/ai-code-quality-reviewer.md`; none is applied by this dispatch):
1. **The spelling on page 9: no correction proposed.** My reading of the page image matches the agent's "completetly"; the researcher's reads "completly". Extracting the text layer from `https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf` would settle it. If it prints "completly", the edit in the agent's line 62 is:
   - old: `"explanations, comments or documentation generated by an AI assistant can be incorrect or completetly hallucinated"`
   - new: the same sentence with "completly".
2. **Software bill of materials hand-on, for consistency with the skill.** In the agent's line 45 hand-on list:
   - old: `a credential written into the code (secrets-detector);`
   - new: `a credential written into the code (secrets-detector); a new dependency, where the project keeps a software bill of materials (sbom-cra-checker);`
3. **The new skill type `package_not_allowlisted`** needs no agent change. The agent's output list already allows "a type the skill names", and its rule reports classes named only in the skill under the skill's type.

Where this could go wrong:
- **The page-9 spelling.** It rests on two readings of a page image that disagree.
- **Check's two self-descriptions.** They are cited side by side because the line that produces the HTML header was not found.
- **R.23 and R.11 are still mirror-only.**
- **The permitted-package check is a small scope addition** the brief directed. It applies only where the dispatch or plan names a list.