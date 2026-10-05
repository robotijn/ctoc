**Dispatch `d-s4-skill-r2-validate`, verdict:** no quotation in the round-2 text is fabricated or refuted. Every quoted string I fetched today appears in its source, with the page and section the text gives. Four framings around those quotations claim more than the source says: two misattributed and two unsourceable. Each has a one-line fix below. I changed no file.

## Fetches, in order (29 of 30 used, no searches)

| # | Address | How it was read |
|---|---|---|
| 1 | The European Union Agency for Cybersecurity's `…/2026-03/…Package_Managers_Final.pdf` | The summarising tool could not parse the binary. I read the saved copy (`…/tool-results/webfetch-1790798686019-qwmypr.pdf`) as page images, file pages 1–2, 17–20 and 26–27. Printed page = file page − 1. |
| 2 | `openssl/…/doc/man3/EVP_DigestInit.pod` | summary |
| 3 | `openssl/…/doc/man3/EVP_EncryptInit.pod` (prototypes, and whether "EVP_Q_" occurs) | summary |
| 4 | `eel.is/c++draft/vector.overview` | summary |
| 5 | `eel.is/c++draft/alg.contains` | summary |
| 6 | `en.cppreference.com/w/cpp/algorithm/ranges/contains` | summary |
| 7 | `usenix.org/…/usenixsecurity25-spracklen.pdf` | The summarising tool could not find the phrases. I read the saved copy (`…/webfetch-1790798726657-3vzlq7.pdf`) as page images, file pages 13–14; their footers read 3698 and 3699. |
| 8 | Java Language Specification, edition 21, chapter 7 (`docs.oracle.com/javase/specs/jls/se21/html/jls-7.html`) | summary |
| 9 | `javap` manual, Java 21 | summary |
| 10 | `jackson-databind/2.18/README.md` (raw) | summary |
| 11 | `typing.python.org/…/spec/distributing.html` | summary |
| 12 | `docs.rs/about` | summary |
| 13 | `go.dev/ref/mod` | summary |
| 14 | `ossf/scorecard/main/docs/checks.md` (raw) | summary |
| 15 | `ossf/scorecard/main/README.md` (raw) | summary |
| 16 | `veracode.com/blog/genai-code-security-report/` | summary |
| 17 | `veracode.com/resources/analyst-reports/2025-genai-code-security-report/` | summary |
| 18 | `reactjs/react-codemod/master/README.md` (raw) | summary |
| 19 | `postgresql.org/docs/current/contrib.html` | summary |
| 20 | `api.pgxn.org/dist/pg_advanced_search.json` | status only: 404 |
| 21 | `api.pgxn.org/dist/pair.json` | 200, body returned; summary |
| 22 | `github.com/stripe/stripe-dotnet/tree/master/src/Stripe.net/Services/Checkout` | summary |
| 23 | `learn.microsoft.com/en-us/ef/core/miscellaneous/async` | The full page came back, so this is effectively raw |
| 24 | `proxy.golang.org/…/exporters/jaeger-pro/@v/list` | status only: 404 |
| 25 | react-codemod readme again, asking for every `npx codemod` line | summary |
| 26 | `EVP_EncryptInit.pod` again, asking for the history section and the authentication-tag text | summary |
| 27 | `pkg.go.dev/go.opentelemetry.io/otel/exporters/jaeger` | summary |
| 28 | cppreference again, asking for the declaration table | summary |
| 29 | `checks.md` again, asking for every line with "json", "threshold", "aggregate score" or "overall score" | summary |

No fetched page contained instructions aimed at the reader.

## Claims

| Change | Exact text | Verdict | Source | Quote from the source | Corrected wording |
|---|---|---|---|---|---|
| 1 | The readme shows `ObjectMapper mapper = new ObjectMapper();` then `mapper.writeValueAsString(...)` | Validated | #10 | `ObjectMapper mapper = new ObjectMapper(); // create once, reuse` · `String jsonString = mapper.writeValueAsString(myResultObject);` | — |
| 2 | "a quick one-shot digest function" | Validated | #2 | "EVP_Q_digest() is a quick one-shot digest function." | — |
| 2 | "added in OpenSSL 3.0" | Validated | #2, history section | "The EVP_Q_digest(), EVP_DigestInit_ex2(), … functions were added in OpenSSL 3.0." | — |
| 2 | The three prototypes | Validated, allowing for whitespace | #3 | The source wraps `EVP_EncryptInit_ex2` and `EVP_EncryptUpdate` across lines. After normalising whitespace, every token is identical, including `const OSSL_PARAM params[]` and `int *outl`. | — |
| 2 | `EVP_EncryptInit.pod` has no function starting "EVP_Q_" | Validated, but only as a summary negative | #3 | "The literal string "EVP_Q_" does not appear anywhere in this document." (said by the summarising tool) | — |
| 2 | "C (OpenSSL 3.0 or later)", for the safe prototypes | Validated | #26 | "The EVP_EncryptInit_ex2(), EVP_DecryptInit_ex2(), EVP_CipherInit_ex2()… functions were added in 3.0." | — |
| 2 | [vector.overview] declares no member named `contains` | Validated | #4, plus the session's compile run | The tool listed every member under capacity, element access, data access and modifiers; none is `contains`. | — |
| 2 | [alg.contains] Returns: "ranges::find(std::move(first), last, value, proj) != last" | Validated | #5, section 26.6.4 | Identical, apart from escaping characters in the page's markup | — |
| 2 | The algorithm is "since C++23" and lives in header `<algorithm>` | Validated | #6, #28 | "Defined in header `<algorithm>`"; overload (1): "(since C++23) (until C++26)" | — |
| 3 | "Stub files are syntactically valid Python files with a `.pyi` suffix" | Validated | #11 | Word for word | — |
| 3 | "If a stub package distribution is partial it MUST include `partial\n` in a `py.typed` file" | Validated | #11 | Word for word | — |
| 3 | "All libraries published to crates.io are documented." | Validated | #12 | Word for word | — |
| 3 | "The `exports` directive specifies the name of a package to be exported by the current module" | Validated | #8, section 7.7.2 | Word for word | Name the source in the prose: "(the Java Language Specification, section 7.7.2, https://…)". The text currently gives only a section number and an address. |
| 4 | Report page: "45% of tests"; "generated by over 100 large language models across Java, JavaScript, Python, and C#" | Validated | #17 | "AI-generated code introduced risky security flaws in 45% of tests." · "…analyzes the security of code generated by over 100 large language models across Java, JavaScript, Python, and C#." | — |
| 4 | Blog post of July 2025: "45% of code samples failed security tests" | Validated | #16, dated 30 July 2025 | "45% of code samples failed security tests and introduced OWASP Top 10 security vulnerabilities into the code." | — |
| 5a | "where attackers publish packages matching hallucinated package names generated by AI tools", section 5.2, page 26; title, version 1.1, March 2026 | Validated | #1, page image of printed page 26 | "…new attack vectors like 'slopsquatting' (75), where attackers publish packages matching hallucinated package names generated by AI tools." The cover says "MARCH 2026"; the page header says "Version: 1.1". | — |
| 5b | "Verify package names carefully to avoid malicious imitations or naming collisions.", section 4.1.2, page 18 | Validated | #1, printed page 18, cheat-sheet table, "Trusted source" row | Word for word | — |
| 5c | The quotation "illustrative examples only and do not represent a recommendation of specific tools", page 16 | Validated | #1, printed page 16 | "NB: The tools and commands included in this section are illustrative examples only and do not represent a recommendation of specific tools." | — |
| 5c | The framing "of the tools in its own advisory" | Misattributed (scope) | #1, printed page 16 | The disclaimer covers "this section" (section 4) only. Section 5.1 names Syft, CycloneDX, Grype and OSV-Scanner with no such disclaimer. | "says of the tools and commands in its best-practice section (section 4) that they are …" |
| 5d | The quotation "Run scans prior to installation or during dependency review", section 4.1.2, page 18 | Validated | #1, printed page 18 | Word for word (the source ends it with a colon) | — |
| 5d | The framing "Check names before anything is installed, which is the order the … advisory gives:" | Misattributed (context) | #1, printed page 18 | The sentence sits in the "Existing known vulnerabilities" row. Its examples are `npm audit --json`, `osv-scanner` and `dependency-check`. So these are vulnerability scans, not name checks, and "or during dependency review" is an alternative, not an order. | "…which matches the advisory's order: package selection comes before integration, and its vulnerability scans run 'prior to installation or during dependency review' (section 4.1.2, page 18)" |
| 5d | "native package manager commands such as npm ci --ignore-scripts for dependency integrity and install-script control", section 5.1, page 25 | Validated | #1, printed page 25 | Word for word | — |
| 5d | "Disabling scripts may impact packages and functionality.", section 4.2.1, page 19 | Validated | #1, printed page 19, "Installation script prevention" row | "NB: Disabling scripts may impact packages and functionality." | — |
| 6 | "would be a more effective method" and "this is still considered a blunt and reactive approach that requires constant verification and updating", page 3698 | Validated | #7, page image with footer "3698 34th USENIX Security Symposium" | "Although using a curated list of "known good packages", using some metric such as package popularity, would be a more effective method, this is still considered a blunt and reactive approach that requires constant verification and updating." | Optional: name what it is more effective than, namely "a master list of valid package names", which the paper calls "ineffective as a defense strategy". |
| 7 | Maintained: "Risk: `High` (possibly unpatched vulnerabilities)" | Validated | #14 | Word for word | Change 7b's `checks.md` address has no "read 2026-09-30" date; add it for consistency with the other citations. |
| 7 | Signed-Releases: "Risk: `High` (possibility of installing malicious releases)" | Validated | #14 | Word for word | — |
| 7 | "you must authenticate your requests before running Scorecard" | Validated | #15 | "To avoid these limits, you must authenticate your requests before running Scorecard." | — |
| 7 | Neither document names a JavaScript Object Notation score field or a threshold | Validated, but only as a summary negative | #14, #15, #29 | See "How the negatives were checked" below. | — |
| 8 | `npx codemod react/<transform> --target <path>`; the React team's collection | Validated, but the pattern drops a segment | #18, #25 | The readme's general form is `npx codemod <framework>/<version>/<transform> --target <path> [...options]`. The version 19 transforms are `react/19/remove-forward-ref` and similar; the older ones are `react/create-element-to-jsx` and similar. "maintained by the React team in collaboration with the Codemod.com team." | "run as `npx codemod <framework>/<version>/<transform> --target <path>`, for example `npx codemod react/19/remove-forward-ref --target <path>`" |
| 9 | Not among PostgreSQL 18's supplied modules in Appendix F | Validated | #19 | Title: "Documentation: 18: Appendix F. Additional Supplied Modules and Extensions"; entries F.1 amcheck to F.50 xml2; none contains "advanced_search". | The text pins version 18 but links `/docs/current/`, which will move to version 19 (drift risk). Use `https://www.postgresql.org/docs/18/contrib.html`. |
| 9 | PGXN (the PostgreSQL Extension Network): `pg_advanced_search.json` 404; `pair.json` 200 | Validated | #20, #21 | 404; 200 with `"name": "pair"` | Spell out "PGXN" at first use in the prose (see the plain-words check below). |
| 10 | "Shows all classes and members"; `javap` is a disassembler | Validated | #9 | "javap - disassemble one or more class files" · "Shows all classes and members." · `-cp`: "Specifies the path that the `javap` command uses to find user class files." | — |
| 10 | "…and runs nothing" | Unsourceable on the cited page | #9 | The manual does not say this. | "javap disassembles class files already on disk ("disassemble one or more class files", same page)". Drop "runs nothing". |
| 11a | The Checkout folder holds only Sessions and SessionLineItems | Validated | #22 | The two folders listed are SessionLineItems and Sessions; nothing contains "PaymentPro". | — |
| 11b | "The EF Core async extension methods are defined in the `Microsoft.EntityFrameworkCore` namespace." | Validated | #23 | Word for word; the page continues "This namespace must be imported…" | — |
| 11b | "No such namespace" (for `EntityFrameworkCore.AsyncQueries`) | Unsourceable | #23 | The quotation shows where the async methods live. It does not show that the invented namespace is absent anywhere. | `// Wrong namespace: "The EF Core async extension methods are defined in the Microsoft.EntityFrameworkCore namespace." (…); whether any package declares EntityFrameworkCore.AsyncQueries was not checked` |
| 12a | `jaeger-pro/@v/list` answered 404 | Validated | #24 | 404 | — |
| 12a | "Jaeger exporter was deprecated in 2023" (kept from the old text, no source) | Validated | #27 | "OpenTelemetry dropped support for Jaeger exporter in July 2023."; the latest version is 1.17.0, published 28 August 2023. | Add "(https://pkg.go.dev/go.opentelemetry.io/otel/exporters/jaeger, read 2026-09-30)". |
| 12b | "downloads the named modules into the module cache" | Validated | #13 | "The `go mod download` command downloads the named modules into the module cache." | — |
| Late correction 3 (agent) | The partial-stub quotation | Validated | #11 | As in change 3 | — |

## Counts

- **Validated:** 37 rows.
- **Misattributed:** 2 (5c scope, 5d context).
- **Unsourceable:** 2 ("runs nothing" in change 10, "No such namespace" in 11b).
- **Refuted, fabricated or stale:** none.
- **Drift risks:** 2 (the PostgreSQL `/current/` link, and the C++ working-draft point under "Not checked").

Under my contract, the four non-validated items are high-severity findings: `citation-misattributed` for 5c and 5d, `citation-unsourceable` for 10 and 11b. Each suggestion is the corrected-wording cell above; the source address and the in-file occurrence are in the table. None is critical, and each fix makes the text claim less.

## Plain-words check of the new text

- **"AES-256-GCM"** is inside code (a string argument in the invented call). Fine.
- **"AES-GCM" and "GCM"** are unexpanded in prose, inside the C comment ("not a working AES-GCM program", "a GCM example without the authentication-tag step"). Suggest "an Advanced Encryption Standard, Galois/Counter Mode (AES-GCM) program" at first use.
- **"EVP"** appears only inside identifiers and file names. Fine.
- **"JLS"** does not appear in prose; it is only in the address path. The prose never names the specification either (see the change 3 row).
- **"EF Core"** appears only inside the quotation in 11b. Fine.
- **"OSS health"** (change 7a) and **"PGXN"** (change 9) are unexpanded in prose. Both are carried over from the old text but sit inside the new strings.
- **"GenAI"** is part of Veracode's report title. **"AI"** appears only inside quotations. **"JavaScript Object Notation"** and **"continuous integration"** are spelled out.
- **No gate numbers** appear anywhere a person reads.

## How the negatives were checked

All five are the summarising tool's word, not a byte search:
- **Scorecard `checks.md`:** asked twice. The second time for every line containing "json", "threshold", "aggregate score" or "overall score". It returned "none" for threshold and for aggregate or overall score. Its only "json" lines were about signature files (`*.sigstore.json`, `*.intoto.jsonl`), plus one packaging line it returned although the pasted line contains no "json" (a summariser quirk).
- **Scorecard README:** the only format sentence is "The currently supported formats are `default` (text) and `json`." It names no score field and no threshold.
- **`EVP_EncryptInit.pod` and "EVP_Q_":** the tool reported no occurrence.
- **[vector.overview] and `contains`:** the tool listed every member and none is `contains`. The session's compile run backs this up independently.
- **react-codemod and "jscodeshift":** the tool reported no occurrence.

## Not checked

- **Session runs, deliberately not redone:** the four catalogue probes, OpenSSL's `libcrypto.num`, Jackson's `ObjectMapper.java` and `JsonMapper.java` line 113, and the C++ compilation.
- **C++ version:** I read the working draft, not the published C++23 standard text. The compile at `-std=c++23` covers the vector claim for C++23. The Returns quotation matches the draft's non-policy overload; whether the published C++23 text is word-for-word the same was not fetched.
- **Stripe.net:** the namespace declarations inside the Stripe.net source were not read; the proposed text already says so.
- **Late correction 2 to the agent:** it cites nothing, so there was nothing to fetch.
- **The critic's "Carried to round 3" items:** out of scope for this dispatch.

Files relevant to this validation:
- `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s4-skill-round2-critic-d-s4-skill-r2-critic.md`
- `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s4-skill-round2-session-runs.md`
- `<home>/Code/ctoc/skills/ai-quality/hallucination-detector/SKILL.md`
- `<home>/.claude/projects/-Users-account-Code-ctoc/b1c5a29e-f445-4461-8294-b84832a0154b/tool-results/webfetch-1790798686019-qwmypr.pdf` (the European Union Agency for Cybersecurity's advisory, version 1.1, fetched today)
- `<home>/.claude/projects/-Users-account-Code-ctoc/b1c5a29e-f445-4461-8294-b84832a0154b/tool-results/webfetch-1790798726657-3vzlq7.pdf` (the USENIX paper, fetched today)