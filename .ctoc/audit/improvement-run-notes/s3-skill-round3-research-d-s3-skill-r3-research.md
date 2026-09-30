# Round 3 web research for skills/ai-quality/ai-code-quality-reviewer/SKILL.md (dispatch d-s3-skill-r3-research, citation-validator, installed plugin 6.14.65, 2026-09-30; angle: raw re-reads, remaining code facts, regulators)

# Round 3 web research: `skills/ai-quality/ai-code-quality-reviewer/SKILL.md` (dispatch d-s3-skill-r3-research, 2026-09-30)

I rechecked 31 quotes in the file and none turned out fabricated. Twenty-two now match the raw source, allowing for markup, and five match again but only through the summarising fetch. Three differ slightly from the source without changing the meaning. The C++ Core Guidelines rules R.23 and R.11 still could not be read on the canonical page, because the raw markdown fetch was cut off too.

All three code facts in Part 2 check out. The GCC manual adds one warning: braces do not protect commas inside a macro argument, though the skill's examples are safe because their braces sit inside a function call's parentheses.

The French and German report names seven concerns that neither the skill nor the agent carries (Part 3). I also found one misquote, in the agent file rather than the skill.

No page or file tried to give me instructions. I used 27 of the 30 tool calls and edited nothing.

**How the text reached me:**
- **Read directly as page images, with no summarising model:** both PDFs (the French and German report "AI Coding Assistants", and NIST SP 800-218).
- **Everything else went through the fetch tool's summarising model.** Every fetch does this.
- **What "confirmed raw" means below:** I fetched the raw source (Markdown, Texinfo, the CWE JSON interface, or the OpenJDK Java source), and the tool returned the line with its source markup intact. That markup (`*`condition`*`, `<strong>`, `{@code}`, `@code{}`) shows it quoted the source rather than paraphrasing a rendered page.

## 1. Research log

```json
{
  "research_log": {
    "queries": [
      { "text": "fetch raw CppCoreGuidelines.md for R.23 heading and R.11 Enforcement", "source_class": "publisher", "repeated_because": "round 2 read R.23/R.11 only on a mirror; canonical HTML truncated" },
      { "text": "\"Warn on any explicit use of new and delete\" \"Suggest using make_unique instead\" (isocpp.github.io, github.com)", "source_class": "broad web", "repeated_because": null },
      { "text": "fetch raw OWASP Secure_Code_Review_Cheat_Sheet.md for Business Logic Flaws / Logging security / Dependency management / any AI mention", "source_class": "publisher", "repeated_because": "round 2 quotes came through a summary of the HTML page" },
      { "text": "CWE REST API weakness 369,571,477,242,215,546 Description fields", "source_class": "standards body", "repeated_because": "round 2 quotes came through summaries of the HTML pages" },
      { "text": "CWE REST API weakness 242,546 sentences containing gets() / BUG, HACK / TODO", "source_class": "standards body", "repeated_because": "the CWE-242 description returned did not match the skill's quote; needed the field it comes from" },
      { "text": "fetch raw googletest docs/reference/assertions.md for three quotes", "source_class": "vendor documentation", "repeated_because": "earlier read via summary of the rendered page" },
      { "text": "fetch raw Unity docs/UnityAssertionsReference.md floating-point sentence", "source_class": "vendor documentation", "repeated_because": "earlier read via summary of the GitHub blob page" },
      { "text": "fetch raw libcheck doc/check.texi for ck_assert, ck_assert_double_eq_tol, framework self-description", "source_class": "vendor documentation", "repeated_because": "earlier read via summary of check_4.html" },
      { "text": "fetch check_4.html title and 'framework for C' wording", "source_class": "vendor documentation", "repeated_because": "raw Texinfo returned 'unit testing framework', differing from the skill" },
      { "text": "fetch survey.stackoverflow.co/2025/ai two sentences", "source_class": "publisher", "repeated_because": "no raw form exists; re-read for exact wording" },
      { "text": "fetch Aikido slopsquatting blog react-codeshift sentence", "source_class": "vendor documentation", "repeated_because": "no raw form exists; re-read for exact wording" },
      { "text": "fetch raw OpenJDK jdk21u HashMap.java class Javadoc", "source_class": "vendor documentation", "repeated_because": "Oracle HashMap quote earlier via summary" },
      { "text": "fetch raw OpenJDK jdk21u java/util/stream/package-info.java forEach/reduction sentence", "source_class": "vendor documentation", "repeated_because": "Oracle stream package quote earlier via summary" },
      { "text": "fetch Oracle ConcurrentHashMap merge description", "source_class": "vendor documentation", "repeated_because": "re-read for full paragraph; raw source too large for the fetch" },
      { "text": "fetch Oracle Collectors toConcurrentMap signatures", "source_class": "vendor documentation", "repeated_because": "Part 2: three-argument overload signature never read" },
      { "text": "fetch GCC manual Macro Arguments", "source_class": "vendor documentation", "repeated_because": null },
      { "text": "fetch docs.python.org sqlite3 paramstyle", "source_class": "vendor documentation", "repeated_because": null },
      { "text": "Read local PDF ANSSI/BSI 'AI Coding Assistants' pages 8-12", "source_class": "regulator", "repeated_because": "brief asks for pages 8-12; agent cites 9-12" },
      { "text": "fetch NIST SP 800-218 PDF, then Read saved PDF pages 26-31 and 22-24 for PW.7", "source_class": "standards body", "repeated_because": null }
    ],
    "sources": [
      { "url": "https://raw.githubusercontent.com/isocpp/CppCoreGuidelines/master/CppCoreGuidelines.md", "read_on": "2026-09-30", "bore_on": "skill line 207: R.23 and R.11", "outcome": "unreachable", "quote": null, "error": "neither R.23 nor R.11 are present in the markdown you supplied. The content ends mid-section in the \"F: Functions\" area. The last major section heading visible is: \"# <a name=\"s-functions\"></a>F: Functions\"" },
      { "url": "https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines", "read_on": "2026-09-30", "bore_on": "skill line 207: R.11 enforcement sentence (search hit only)", "outcome": "did-not-bear", "quote": null, "error": null },
      { "url": "https://raw.githubusercontent.com/OWASP/CheatSheetSeries/master/cheatsheets/Secure_Code_Review_Cheat_Sheet.md", "read_on": "2026-09-30", "bore_on": "skill lines 394, 398", "outcome": "supported", "quote": "- **Business Logic Flaws**: Complex workflows and state management issues that require domain understanding", "error": null },
      { "url": "https://cwe-api.mitre.org/api/v1/cwe/weakness/369,571,477,242,215,546", "read_on": "2026-09-30", "bore_on": "skill lines 158, 207, 252, 256, 394, 416", "outcome": "supported", "quote": "CWE-242 Description: \"The product calls a function that can never be guaranteed to work safely.\"", "error": null },
      { "url": "https://cwe-api.mitre.org/api/v1/cwe/weakness/242,546", "read_on": "2026-09-30", "bore_on": "skill lines 252, 416", "outcome": "supported", "quote": "DemonstrativeExamples DX-5: \"However, gets() is inherently unsafe, because it copies all input from STDIN to the buffer without checking size.\" / ExtendedDescription: \"Many suspicious comments, such as BUG, HACK, FIXME, LATER, LATER2, TODO, in the code indicate missing security functionality and checking.\"", "error": null },
      { "url": "https://raw.githubusercontent.com/google/googletest/main/docs/reference/assertions.md", "read_on": "2026-09-30", "bore_on": "skill lines 310, 312", "outcome": "supported", "quote": "Verifies that *`condition`* is true.", "error": null },
      { "url": "https://raw.githubusercontent.com/ThrowTheSwitch/Unity/master/docs/UnityAssertionsReference.md", "read_on": "2026-09-30", "bore_on": "skill line 312", "outcome": "supported", "quote": "So Unity doesn't do direct floating point comparisons for equality.", "error": null },
      { "url": "https://raw.githubusercontent.com/libcheck/check/master/doc/check.texi", "read_on": "2026-09-30", "bore_on": "skill lines 310, 312", "outcome": "supported", "quote": "Fails test if supplied condition evaluates to false. / Compares two double precision floating point values (@code{double}) with specified user tolerance set by the third parameter (@code{double})", "error": null },
      { "url": "https://libcheck.github.io/check/doc/check_html/check_4.html", "read_on": "2026-09-30", "bore_on": "skill line 310: Check's self-description", "outcome": "supported", "quote": "Check: a unit test framework for C", "error": null },
      { "url": "https://survey.stackoverflow.co/2025/ai", "read_on": "2026-09-30", "bore_on": "skill line 54", "outcome": "supported", "quote": "The biggest single frustration, cited by 66% of developers, is dealing with 'AI solutions that are almost right, but not quite,'", "error": null },
      { "url": "https://www.aikido.dev/blog/slopsquatting-ai-package-hallucination-attacks", "read_on": "2026-09-30", "bore_on": "skill line 175", "outcome": "supported", "quote": "In January 2026, Charlie claimed this npm package called `react-codeshift`. ... The package wasn't real, had no author, and definitely hadn't been registered before.", "error": null },
      { "url": "https://raw.githubusercontent.com/openjdk/jdk21u/master/src/java.base/share/classes/java/util/HashMap.java", "read_on": "2026-09-30", "bore_on": "skill line 335: HashMap", "outcome": "supported", "quote": "<p><strong>Note that this implementation is not synchronized.</strong> ... it <i>must</i> be synchronized externally.", "error": null },
      { "url": "https://raw.githubusercontent.com/openjdk/jdk21u/master/src/java.base/share/classes/java/util/stream/package-info.java", "read_on": "2026-09-30", "bore_on": "skill line 335: stream package", "outcome": "supported", "quote": "the {@code forEach()} can simply be replaced with a reduction * operation that is safer, more efficient, and more amenable to * parallelization:", "error": null },
      { "url": "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ConcurrentHashMap.html", "read_on": "2026-09-30", "bore_on": "skill line 335: merge", "outcome": "supported", "quote": "The entire method invocation is performed atomically.", "error": null },
      { "url": "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/Collectors.html", "read_on": "2026-09-30", "bore_on": "skill lines 332, 335: three-argument toConcurrentMap", "outcome": "supported", "quote": "public static <T, K, U> Collector<T,?,ConcurrentMap<K,U>> toConcurrentMap(Function<? super T,? extends K> keyMapper, Function<? super T,? extends U> valueMapper, BinaryOperator<U> mergeFunction)", "error": null },
      { "url": "https://gcc.gnu.org/onlinedocs/cpp/Macro-Arguments.html", "read_on": "2026-09-30", "bore_on": "skill lines 291-299: commas inside EXPECT_EQ arguments", "outcome": "supported", "quote": "Parentheses within each argument must balance; a comma within such parentheses does not end the argument. However, there is no requirement for square brackets or braces to balance, and they do not prevent a comma from separating arguments.", "error": null },
      { "url": "https://docs.python.org/3/library/sqlite3.html", "read_on": "2026-09-30", "bore_on": "skill lines 347-348, 359", "outcome": "supported", "quote": "String constant stating the type of parameter marker formatting expected by the sqlite3 module. Required by the DB-API. Hard-coded to \"qmark\". ... The named DB-API parameter style is also supported.", "error": null },
      { "url": "https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf", "read_on": "2026-09-30", "bore_on": "skill lines 53, 58; Part 3 (local copy, pages 8-12 read as page images)", "outcome": "supported", "quote": "Generated source code should generally be checked and reproduced by the developers. A critical review should be carried out particularly with regard to hallucinations and security risks.", "error": null },
      { "url": "https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf", "read_on": "2026-09-30", "bore_on": "Part 3: PW.7 code review", "outcome": "supported", "quote": "Human-readable code includes source code, scripts, and any other form of code that an organization deems human-readable.", "error": null }
    ]
  }
}
```

The fetch tool could not decode the NIST PDF: "The document appears to be a PDF file that has been encoded/compressed in a way that makes the text largely unreadable". It saved the file locally, though, and I read that copy directly (printed pages 13 to 22).

## 2. Part 1: provenance hardening

| Quote (skill line) | Earlier provenance | This pass |
|---|---|---|
| R.23 "Use make_unique() to make unique_ptrs" (207) | a mirror, through a summary; the canonical page was cut off | **unreachable.** The raw markdown was also cut off: "The content ends mid-section in the "F: Functions" area". A search for R.11's exact enforcement phrase lists the canonical page as a match, but no text came back with it. |
| R.11 "Warn on any explicit use of new and delete. Suggest using make_unique instead." (207) | a mirror, through a summary | **unreachable** (same error). The skill's "read on a mirror" caveat stays. |
| Stack Overflow survey, "The biggest single frustration, cited by 66% ..." (54) | summary | confirmed only via summary again (the page has no raw form) |
| Stack Overflow survey, 45.2% for "Debugging AI-generated code is more time-consuming" (54) | summary | confirmed only via summary again |
| Aikido, "Charlie claimed this npm package called `react-codeshift`. The package wasn't real, ..." (175) | summary | **differs, slightly.** The source sentence begins "In January 2026, Charlie claimed ...". The skill starts the quote partway through the sentence and does not mark the cut. The meaning is unchanged. It could open with "In January 2026," or begin the quote at "claimed". |
| Check, "a unit test framework for C" (310) | summary of check_4.html | confirmed only via summary again, on the cited HTML page ("Check: a unit test framework for C", in the page headers). The raw Texinfo fetch returned a different sentence, "Check is a unit testing framework for C." I did not find the source line that produces the HTML header, so I am reporting the two readings side by side rather than choosing one. |
| Check, `ck_assert`: "Fails test if supplied condition evaluates to false." (310) | summary | **confirmed raw** (Texinfo) |
| Check, `ck_assert_double_eq_tol`: "with specified user tolerance" (312) | summary | **confirmed raw**: "... with specified user tolerance set by the third parameter (@code{double})" |
| Unity, "Unity doesn't do direct floating point comparisons for equality." (312) | summary | **confirmed raw**. The source sentence begins "So"; the skill's quote is a clean substring. |
| GoogleTest, "Verifies that condition is true." (310) | summary | **confirmed raw**: `Verifies that *`condition`* is true.` |
| GoogleTest, "When comparing a pointer to NULL, use EXPECT_NE(ptr, nullptr) ..." (310) | summary | **confirmed raw** (the rendered form of the markup) |
| GoogleTest, "Due to rounding errors, ... so EXPECT_EQ is not suitable." (312) | summary | **confirmed raw** |
| OWASP, "Business Logic Flaws: Complex workflows ..." (398) | summary | **confirmed raw**: `- **Business Logic Flaws**: Complex workflows and state management issues that require domain understanding` |
| OWASP, "Logging security: Sensitive data not logged" (394) | summary | **confirmed raw**. The skill quotes the opening of `- [ ] **Logging security**: Sensitive data not logged, proper log protection (...)`. The raw file mentions artificial intelligence, large language models or coding assistants nowhere. |
| CWE-369 "The product divides a value by zero." (158) | summary | **confirmed raw** (the CWE JSON interface, Description field) |
| CWE-571 (256) | summary | **confirmed raw** |
| CWE-477 (207) | summary | **confirmed raw** |
| CWE-215 (394) | summary | **confirmed raw** |
| CWE-242, "gets() is inherently unsafe, because it copies all input ..." (252) | summary | **confirmed raw, but from a code example, not the description.** The sentence is the body text of Demonstrative Example DX-5. The Description field reads "The product calls a function that can never be guaranteed to work safely." The skill's "MITRE's CWE-242 says" is accurate as it stands; it must not be reworded to "describes". |
| CWE-546, "BUG, HACK, FIXME, LATER, LATER2, TODO" (416) | summary | **confirmed raw** (Extended Description) |
| Oracle, `HashMap` "is not synchronized. If multiple threads ..." (335) | summary | **confirmed raw**, from the OpenJDK 21 source that generates Oracle's page: `<strong>Note that this implementation is not synchronized.</strong>` ... `it <i>must</i> be synchronized externally.` Without the markup it matches. |
| Oracle, `ConcurrentHashMap.merge`, "The entire method invocation is performed atomically." (335) | summary | confirmed only via summary again (the raw source is too large to fetch). I also have the full paragraph. |
| Oracle, `Collectors.toConcurrentMap` "is a concurrent and unordered Collector" (335) | summary | confirmed only via summary again: "This is a concurrent and unordered Collector." |
| Oracle, stream package, "the forEach() can simply be replaced with a reduction ..." (335) | summary | **confirmed raw** (OpenJDK `package-info.java`, with `{@code forEach()}` markup) |
| French and German report, page 12 quote (53) | agent citation | **confirmed raw**: page image, printed page 12, word for word |
| French and German report, page 9 quote (58) | agent citation | **confirmed raw**: page image, printed page 9, word for word |
| Spracklen figures of 576,000 samples and 19.7% (55) | the arXiv paper | Page 10 of the report agrees ("576,000 code examples ... 2.23 million imported packages ... 19.7%"). It cites Spracklen, so it is not an independent second source. |

## 3. Part 2: the two unsourced code facts, and sqlite3

| Item | Source | Verbatim quote | Verdict |
|---|---|---|---|
| The three-argument `Collectors.toConcurrentMap(keyMapper, valueMapper, mergeFunction)` (line 332) | Oracle, Collectors (Java 21), read through a summary | `public static <T, K, U> Collector<T,?,ConcurrentMap<K,U>> toConcurrentMap(Function<? super T,? extends K> keyMapper, Function<? super T,? extends U> valueMapper, BinaryOperator<U> mergeFunction)` | **VALIDATED.** `Integer::sum` fits `BinaryOperator<Integer>`. `ConcurrentMap<K,Integer>` can be assigned to `Map<String, Integer>` when `key()` returns `String`. Action: keep. The Collectors page can be cited for the call. |
| Commas inside parentheses do not split a macro argument (lines 291-299, 305-307) | GCC manual, "Macro Arguments" | "Parentheses within each argument must balance; a comma within such parentheses does not end the argument. However, there is no requirement for square brackets or braces to balance, and they do not prevent a comma from separating arguments." | **VALIDATED.** In `EXPECT_EQ(ComputeTotalCents({{1000, true}, {500, false}}), 1000)`, every comma between braces sits inside the parentheses of `ComputeTotalCents(...)`, so the macro receives exactly two arguments. The same holds for the Check line. **Caution:** braces alone do not protect commas, so an edit such as `EXPECT_EQ(std::vector<int>{1, 2}, v)` would break. Keep the braces inside a call. Action: keep. |
| Which placeholder style `sqlite3` declares (lines 347-348) | docs.python.org, sqlite3 | "String constant stating the type of parameter marker formatting expected by the `sqlite3` module. Required by the DB-API. Hard-coded to `"qmark"`." Note: "The `named` DB-API parameter style is also supported." | **VALIDATED.** The `?` example is correct for sqlite3. Optional change: "`sqlite3` declares `qmark` (and also accepts `named`)". |

## 4. Part 3: regulator findings

From the French Cybersecurity Agency and German Federal Office for Information Security report, pages 8 to 12, read as page images. Each item below is carried by neither the skill nor the agent; I checked the agent's lines 45 and 62.

1. **A package allowlist** (page 10): "If there are guidelines in the company as to which packages can be used as part of a development and which cannot, a whitelisting of permitted packages could be carried out." The skill checks imports only against manifests and lockfiles (category A and its checklist). Where a project keeps an allowlist, an import outside it can be checked with Read and Grep. It is a real package that should not be there, which differs from an invented one. Adding the check is your scope decision.
2. **Software bill of materials** (page 10): "The creation of a Software Bill of Materials (SBOM) allows you to retrospectively understand whether vulnerable libraries were used and enables a targeted response if a vulnerability of certain components becomes known." Page 11 adds that "documentation of used AI coding assistants (asset management) and libraries (SBOM) might help to identifiy, whether one is affected or not." (the source's spelling). The skill's list of handed-on checks does not name sbom-cra-checker; this belongs there as a hand-on.
3. **Marking generated code** (page 9): "It might be beneficial to flag AI generated code blocks and to document the used AI tools. This might help security testing and it can also be a useful information for third-party auditors, e.g. in the context of a security certification process." This bears on the skill's commit-trailer row (line 532). The report recommends it hedged ("might be beneficial"), so it is not a defect class. It could be recorded as a provenance note under `self_assessment.unknowns`.
4. **Tests as a mitigation** (page 9): "Automatic function tests should be employed." Also: "Generated content, in particular source code, should generally be reviewed and understood by the developers." The first sentence is regulator support for round 2's open finding that nothing checks whether a change adds tests at all.
5. **Automation bias** (page 8), the source the last red line (line 554) lacks: "Studies show a cognitive bias when using AI coding assistants, as many developers perceive them as secure, although security vulnerabilities are regularly identified. Some developers even bypass security guidelines to use these assistants". Also: "even flawed solutions are well-worded". Citing it here would source "never fast-track it because the model is thought to be good" and the "Assume errors" rule on line 54.
6. **Extensions** (page 11): "Limit the use of extensions." and "Audit and anticipate impacts of the interactions of these extensions with development, production and CI/CD environments." The agent quotes only the page's opening description sentence. Category K could cite this mitigation for a change that adds an extension or tool-server entry.
7. **Markdown images used to leak data** (pages 10 and 11): "Displaying Markdown images is also a common way to exfiltrate sensitive information in a successful attack (Rehberger, 2024)." The mitigation: "restrict the display of images to trusted sources". An external image link added to a file the assistant reads (a rules file, a README, documentation) could be recorded for llm-security-tester under category K.
8. Items that support existing text and need no change:
   - Page 9: "It might be beneficial to "deconstruct" AI-generated code and the used prompts in public code reviews within the company." This supports category H's comparison with the request.
   - Page 9: "Automated vulnerability scanners or approaches like chatbots that critically question the generated source code ("source code critics") can reduce the risk." This supports the hand-on to sast-scanner.
   - The organisational items on pages 9 and 12, such as security teams scaling to handle the extra code, are outside the skill's scope.
9. **A misquote in the agent file, not the skill.** `/Users/account/Code/ctoc/agents/ai-quality/ai-code-quality-reviewer.md` line 62 quotes page 9 as "completetly hallucinated" and adds "(the source's spelling)". The page 9 image reads "incorrect or completly hallucinated, which might lead to security issues and reduce code maintenability." Recommended action: correct it to "completly". Confidence is medium-high, because it rests on one reading of a page image.

**NIST SP 800-218, Secure Software Development Framework version 1.1, practice PW.7** (printed page 14):
- **What bears on generated code:** "Review and/or Analyze Human-Readable Code to Identify Vulnerabilities and Verify Compliance with Security Requirements (PW.7): Help identify vulnerabilities so that they can be corrected before the software is released to prevent exploitation. ... Human-readable code includes source code, scripts, and any other form of code that an organization deems human-readable."
  - The scope is set by the form of the code, not by who wrote it. That supports line 49's decision to review assistant-written code in full rather than scan it.
  - The core framework says nothing specific about AI-generated code on pages 13 to 15.
- **Other relevant examples:**
  - PW.7.2 Example 2: "Use expert reviewers to check code for backdoors and other malicious content."
  - PW.7.2 Example 5: "Use review checklists to verify that the code complies with the requirements."
  - PW.5.1 Example 9 (page 13): "Have the developer review their own human-readable code to complement (not replace) code review performed by other people or tools."
- **Not read:** the publication date. I saw only the running header "SSDF Version 1.1".

**Not examined this pass:** R.23 and R.11 on the canonical page (unreachable). The Microsoft C26409 page came up in the search but I did not read it, and it would be a vendor's copy, not the canonical text.

## 5. What would change these verdicts

These verdicts would change if the canonical Core Guidelines text for R.23 or R.11 can be read and differs from the mirror, or if Check's Texinfo source turns out to contain no "a unit test framework for C" line.

Sources:
- [C++ Core Guidelines, raw markdown (cut off)](https://raw.githubusercontent.com/isocpp/CppCoreGuidelines/master/CppCoreGuidelines.md)
- [C++ Core Guidelines, canonical page](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines)
- [MicrosoftDocs c26409 (search hit, not read)](https://github.com/MicrosoftDocs/cpp-docs/blob/main/docs/code-quality/c26409.md)
- [OWASP Secure Code Review Cheat Sheet, raw](https://raw.githubusercontent.com/OWASP/CheatSheetSeries/master/cheatsheets/Secure_Code_Review_Cheat_Sheet.md)
- [CWE interface, six weaknesses](https://cwe-api.mitre.org/api/v1/cwe/weakness/369,571,477,242,215,546)
- [CWE interface, 242 and 546](https://cwe-api.mitre.org/api/v1/cwe/weakness/242,546)
- [GoogleTest assertions, raw](https://raw.githubusercontent.com/google/googletest/main/docs/reference/assertions.md)
- [Unity assertions reference, raw](https://raw.githubusercontent.com/ThrowTheSwitch/Unity/master/docs/UnityAssertionsReference.md)
- [Check Texinfo source, raw](https://raw.githubusercontent.com/libcheck/check/master/doc/check.texi)
- [Check manual, chapter 4](https://libcheck.github.io/check/doc/check_html/check_4.html)
- [Stack Overflow 2025 survey, AI section](https://survey.stackoverflow.co/2025/ai)
- [Aikido, slopsquatting](https://www.aikido.dev/blog/slopsquatting-ai-package-hallucination-attacks)
- [OpenJDK 21 HashMap.java](https://raw.githubusercontent.com/openjdk/jdk21u/master/src/java.base/share/classes/java/util/HashMap.java)
- [OpenJDK 21 stream package-info.java](https://raw.githubusercontent.com/openjdk/jdk21u/master/src/java.base/share/classes/java/util/stream/package-info.java)
- [Oracle ConcurrentHashMap](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ConcurrentHashMap.html)
- [Oracle Collectors](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/Collectors.html)
- [GCC, Macro Arguments](https://gcc.gnu.org/onlinedocs/cpp/Macro-Arguments.html)
- [Python sqlite3](https://docs.python.org/3/library/sqlite3.html)
- [French Cybersecurity Agency and German Federal Office for Information Security, AI Coding Assistants](https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf)
- [NIST SP 800-218](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf)

Files read:
- `/Users/account/Code/ctoc/skills/ai-quality/ai-code-quality-reviewer/SKILL.md`
- `/Users/account/Code/ctoc/.ctoc/audit/improvement-run-notes/s3-skill-round2-research-d-s3-skill-r2-research.md`
- `/Users/account/Code/ctoc/.ctoc/audit/improvement-run-notes/s3-skill-round1-research-d-s3-skill-r1-research.md` (searched, not read in full)
- `/Users/account/Code/ctoc/agents/ai-quality/ai-code-quality-reviewer.md` (searched, not read in full)
- `/Users/account/.claude/projects/-Users-account-Code-ctoc/26a2fcc0-aa46-4510-a665-3c2f0ee314f5/tool-results/webfetch-1790763462989-llcq7m.pdf` (the French and German report)
- `/Users/account/.claude/projects/-Users-account-Code-ctoc/26a2fcc0-aa46-4510-a665-3c2f0ee314f5/tool-results/webfetch-1790776007400-1vqh14.pdf` (NIST SP 800-218)