# Round 2 critique and change list for `skills/ai-quality/hallucination-detector/SKILL.md`

**Dispatch:** `d-s4-skill-r2-critic`. This is one consolidated document.

**Verdict: REFINE. The file scores 6.9 of 10 as it stands after round 1.** The weakest dimension is completeness: the C and C++ section still has no example.

**What round 2 fixes**
- **C and C++ examples.** Both get a checked example of an invented name beside its real counterpart:
  - the C pair was checked against OpenSSL's manual pages and its exported-symbol list;
  - the C++ pair was compiled.
- **Three code comments that were wrong or out of date:**
  - the Jackson line hides a second invented call;
  - `module-info.java` is credited with checking methods, which it cannot do;
  - `jscodeshift` no longer appears in the react-codemod readme.
- **The agency and peer-reviewed sources the file lacked,** for the definition of slopsquatting, the gate's order, `npm ci --ignore-scripts`, and why a curated allow-list is not enough.
- **Scorecard.** Triage is told to read individual checks, not the overall score.
- **Veracode.** The two pages count their 45% differently; the file now says so and states less.

**Before applying**
- **Fingerprint.** Confirm `sha256:7176fa669d40e784777d9d8054bbc8d33f1dc07cfd8ac84b2367c85551f181dd`.
- **`old` strings.** Every `old` was copied from my read of the current file (the round-1 result, with the eleven leftover corrections applied). Each is verbatim and unique, and no two overlap.
- **What stays byte-identical:**
  - the frontmatter;
  - the triage table, the seven `kind` values, `registry_checked` and `registry_response`;
  - the five headings the wrapper quotes;
  - red line 347 ("NEVER auto-install…");
  - all five strings `tests/critic-warnings-are-critical.test.js` pins.

## Where this round's evidence comes from, and how it differs from round 1

**Round 1 used** research papers, plus each registry's and vendor's own documentation.

**Round 2 used:**
- **Specifications:**
  - the C++ working draft;
  - the Java Language Specification;
  - the Python typing specification;
  - the Go Modules Reference.
- **A security agency:** the European Union Agency for Cybersecurity's final package-manager advisory, version 1.1, sections 4 and 5, read as page images.
- **Standards and industry bodies:**
  - OWASP's Software Component Verification Standard, chapter 4;
  - OWASP Dependency-Check;
  - OpenSSF Scorecard's checks documentation.
- **The peer-reviewed paper's mitigation section:** USENIX pages 3697–3700, read as page images.
- **The session's executed checks:**
  - four catalogue probes (raw curl);
  - OpenSSL's exported-symbol list (raw);
  - Jackson 2.18's source (raw);
  - the two C++ calls, compiled with Apple clang 21 at `-std=c++23`.

**Why these classes are different.** Round 1 asked what a registry or vendor page says. Round 2 asks what the governing specification, the agency and the paper's own mitigation analysis say, and it proves the code examples by running them.

**Libraries' own references.** OpenSSL, Jackson, Oracle, Microsoft Learn, Stripe.net and react-codemod are round-1 class. They are used here only to judge whether examples are correct.

## Seven-language result after this round

- **All seven required languages now carry examples:** C#, Java, Python, C, C++, JavaScript and TypeScript, and SQL.
- **How each changed example was checked:**
  - **C++** (C++23): compiled with Apple clang 21. The invented call fails with "no member named 'contains' in 'std::vector<int>'"; the real one compiles and runs.
  - **C** (OpenSSL 3.0 or later): checked against the manual pages and `util/libcrypto.num`, not compiled.
  - **Java** (Jackson 2.18): checked against the raw library source.
  - **SQL:** checked against PGXN, with a real package as a control, and PostgreSQL 18's Appendix F.
  - **C#:** checked against the Entity Framework Core page (raw) and Stripe.net's source folder.
  - **Go:** checked against the module proxy.

---

## Findings, most severe first

### Finding 1 — high — new: the Jackson example hides a second invented call, and its comment names only one

**What is wrong.** `ObjectMapper.builder().build().writeValueAsJson(obj)` has two invented calls. The comment ("Jackson is writeValueAsString") names only one.

**Evidence** (session raw source, read 2026-09-30)
- Jackson 2.18's `ObjectMapper.java` has no static `builder()`, no `writeValueAsJson`, and one `public String writeValueAsString`.
- `JsonMapper.java` line 113 declares `public static JsonMapper.Builder builder() {`.
- The readme shows `ObjectMapper mapper = new ObjectMapper();` and `mapper.writeValueAsString(myResultObject)` (research Part B, row 1).

**Decision:** `change`. The example is Java with Jackson 2.18, checked against the library source and not compiled.

**Proposed change 1**

old:
~~~text
// HALLUCINATION — wrong method on a real class
String json = ObjectMapper.builder().build().writeValueAsJson(obj);  // Jackson is writeValueAsString
~~~

new:
~~~text
// HALLUCINATION — two invented calls on a real class (Java, Jackson 2.18; checked against the library source, not compiled)
String json = ObjectMapper.builder().build().writeValueAsJson(obj);  // Jackson 2.18's ObjectMapper declares neither a static builder() nor writeValueAsJson (https://raw.githubusercontent.com/FasterXML/jackson-databind/2.18/src/main/java/com/fasterxml/jackson/databind/ObjectMapper.java, read 2026-09-30); the builder is JsonMapper.builder() (https://raw.githubusercontent.com/FasterXML/jackson-databind/2.18/src/main/java/com/fasterxml/jackson/databind/json/JsonMapper.java, line 113, read 2026-09-30)
// SAFE — the form the jackson-databind readme shows: ObjectMapper mapper = new ObjectMapper(); then mapper.writeValueAsString(...) (https://raw.githubusercontent.com/FasterXML/jackson-databind/2.18/README.md, read 2026-09-30)
String json = new ObjectMapper().writeValueAsString(obj);
~~~

### Finding 2 — high — resolves round 1's carried item: C and C++ have no example

**What is wrong.** The file says it "has no checked example of an invented C or C++ name yet".

**Evidence**
- **Catalogue probes** (session raw curl): zlib on ConanCenter 200, `libfastjson_pro` 404; fmt on vcpkg 200, `libfastjson-pro` 404.
- **OpenSSL's export list** (raw) has exactly two symbols beginning `EVP_Q_`: `EVP_Q_digest` and `EVP_Q_mac`. There is no `EVP_Q_encrypt`.
- **OpenSSL's manual pages** (research Part A) give the digest sentence, the history note and the three cipher prototypes.
- **The C++ draft and cppreference** (research Part A).
- **The compilation** (session runs).

**Why the C "safe" side is only declarations.** It is the three declared prototypes, not a whole program. Tag handling, `EVP_CIPHER_CTX_new` and `EVP_aes_256_gcm` were not checked, and an AES-GCM example without the authentication-tag step would teach broken cryptography.

**Decision:** `change`

**Proposed change 2**

old:
~~~text
This file has no checked example of an invented C or C++ name yet. Until it has one, check a Conan or vcpkg dependency's name against those catalogues, record system and vendored libraries under unknowns as not checked, and use [[security/sast-scanner]] for the language itself.
~~~

new:
~~~text
Check a Conan or vcpkg dependency's name against those catalogues, record system and vendored libraries under unknowns as not checked, and use [[security/sast-scanner]] for the language itself. The wrapper has no Conan or vcpkg recipe, so the addresses below are observed facts, like those for NuGet and Go, not recipes to run.

```c
/* C (OpenSSL 3.0 or later). Checked against OpenSSL's manual pages and its exported-symbol list; not compiled. */

/* The two catalogues, read 2026-09-30:
     https://raw.githubusercontent.com/conan-io/conan-center-index/master/recipes/zlib/config.yml            answered status 200
     https://raw.githubusercontent.com/conan-io/conan-center-index/master/recipes/libfastjson_pro/config.yml answered status 404
     https://raw.githubusercontent.com/microsoft/vcpkg/master/ports/fmt/vcpkg.json                            answered status 200
     https://raw.githubusercontent.com/microsoft/vcpkg/master/ports/libfastjson-pro/vcpkg.json                answered status 404
   A 404 means "not in that catalogue", not "exists nowhere": a private Conan remote or vcpkg registry can hold the name. */

/* HALLUCINATION — an invented function on a real library */
EVP_Q_encrypt(NULL, "AES-256-GCM", NULL, key, iv, in, inlen, out, &outlen);
/* OpenSSL exports exactly two functions whose names begin EVP_Q_, EVP_Q_digest and EVP_Q_mac, and no EVP_Q_encrypt
   (https://raw.githubusercontent.com/openssl/openssl/master/util/libcrypto.num, read 2026-09-30); its manual page for the
   cipher routines has no function beginning "EVP_Q_" (https://raw.githubusercontent.com/openssl/openssl/master/doc/man3/EVP_EncryptInit.pod,
   read 2026-09-30). The name copies EVP_Q_digest(), "a quick one-shot digest function", one of the functions that were
   "added in OpenSSL 3.0" (https://raw.githubusercontent.com/openssl/openssl/master/doc/man3/EVP_DigestInit.pod, read 2026-09-30). */

/* SAFE — the cipher routines that manual page declares:
     int EVP_EncryptInit_ex2(EVP_CIPHER_CTX *ctx, const EVP_CIPHER *type, const unsigned char *key, const unsigned char *iv, const OSSL_PARAM params[]);
     int EVP_EncryptUpdate(EVP_CIPHER_CTX *ctx, unsigned char *out, int *outl, const unsigned char *in, int inl);
     int EVP_EncryptFinal_ex(EVP_CIPHER_CTX *ctx, unsigned char *out, int *outl);
   These are the declarations only, not a working AES-GCM program: tag handling, EVP_CIPHER_CTX_new and EVP_aes_256_gcm were
   not checked for this file, and a GCM example without the authentication-tag step would teach broken cryptography. */
```

```cpp
// C++23. The two calls below were compiled with Apple clang 21 (clang++ -std=c++23) on 2026-09-30
// (.ctoc/audit/improvement-run-notes/s4-skill-round2-session-runs.md).

// HALLUCINATION — a member function std::vector does not have
if (v.contains(x)) { /* ... */ }   // the class synopsis in [vector.overview] declares no member named contains (https://eel.is/c++draft/vector.overview, read 2026-09-30); on a std::vector<int> clang reports "no member named 'contains' in 'std::vector<int>'"

// SAFE — the algorithm, since C++23, header <algorithm> (https://en.cppreference.com/w/cpp/algorithm/ranges/contains, read 2026-09-30); it compiles and runs
if (std::ranges::contains(v.begin(), v.end(), x)) { /* ... */ }   // [alg.contains] returns "ranges::find(std::move(first), last, value, proj) != last" (https://eel.is/c++draft/alg.contains, read 2026-09-30)
```
~~~

### Finding 3 — medium — new: `module-info.java` is credited with checking methods

**What is wrong.** Line 53 lists `module-info.java` among the places to check a called method. The Java Language Specification, section 7.7.2, says "The `exports` directive specifies the name of a package to be exported by the current module". It names packages, not members.

**The same line gains two corrections:**
- **Python stubs** get a caution: a stub package can be partial by design.
- **Rust** gets the docs.rs sentence.

**Evidence.** Research Part B, row 8, and its caution below the table.

**Decision:** `change`

**Proposed change 3**

old:
~~~text
- **Verify API methods exist in the documented version**, not just "in the library." A function that was renamed, removed, or never existed is a hallucination. Check the package's `package.json` exports / `.pyi` stubs / `module-info.java` / Cargo docs.rs / Go pkg.go.dev against the called method.
~~~

new:
~~~text
- **Verify API methods exist in the documented version**, not just "in the library." A function that was renamed, removed, or never existed is a hallucination. Check the called member against the declarations of the resolved version: the package's `package.json` "exports" and its type declarations; Python `.pyi` stub files ("Stub files are syntactically valid Python files with a `.pyi` suffix", https://typing.python.org/en/latest/spec/distributing.html, read 2026-09-30), remembering that a stub package can be partial by design ("If a stub package distribution is partial it MUST include `partial\n` in a `py.typed` file", same page), so a module missing from a partial stub package proves nothing; docs.rs for Rust ("All libraries published to crates.io are documented.", https://docs.rs/about, read 2026-09-30); pkg.go.dev for Go. A Java `module-info.java` names packages, not members: "The `exports` directive specifies the name of a package to be exported by the current module" (https://docs.oracle.com/javase/specs/jls/se21/html/jls-7.html, section 7.7.2, read 2026-09-30). It settles a wrong package, never a missing method; for a method, read the class file with `javap -p`.
~~~

### Finding 4 — medium — correction of the round-1 re-validation's wording: the two Veracode pages count the 45% differently

**What is wrong.** The file quotes "45% of tests" from the report page. Veracode's July 2025 blog post says "45% of code samples failed security tests". The two sources disagree on what is counted.

**The wording that asserts less** gives the rate, names both units and settles neither.

**Evidence.** Round-1 re-validation note, line 179, and its sources line 350 (both addresses read 2026-09-30).

**Decision:** `change`

**Proposed change 4**

old:
~~~text
Veracode's 2025 GenAI Code Security Report says "AI-generated code introduced risky security flaws in 45% of tests", for code "generated by over 100 large language models across Java, JavaScript, Python, and C#" (https://www.veracode.com/resources/analyst-reports/2025-genai-code-security-report/, read 2026-09-30);
~~~

new:
~~~text
Veracode's 2025 GenAI Code Security Report gives a 45% rate of risky security flaws in code "generated by over 100 large language models across Java, JavaScript, Python, and C#", without a settled unit: its report page says "45% of tests" and its July 2025 blog post says "45% of code samples failed security tests" (https://www.veracode.com/resources/analyst-reports/2025-genai-code-security-report/ and https://www.veracode.com/blog/genai-code-security-report/, both read 2026-09-30);
~~~

### Finding 5 — medium — new: no agency source for the slopsquatting definition, the name check, the gate's order, or `npm ci --ignore-scripts`

**What is wrong.** The file makes these points on vendor and paper sources only. The European Union Agency for Cybersecurity's final advisory (version 1.1, March 2026) states each of them:
- **Section 5.2, page 26:** slopsquatting is where "attackers publish packages matching hallucinated package names generated by AI tools".
- **Section 4.1.2, page 18:** "Verify package names carefully to avoid malicious imitations or naming collisions." and "Run scans prior to installation or during dependency review".
- **Section 5.1, page 25:** "native package manager commands such as npm ci --ignore-scripts for dependency integrity and install-script control".
- **Section 4.2.1, page 19:** "Disabling scripts may impact packages and functionality."
- **Page 16:** its tools are "illustrative examples only and do not represent a recommendation of specific tools".

**Evidence.** Research Part C.2, read as page images.

**Decision:** `change`. Changes 5a–5d.

**Proposed change 5a** (the definition, beside the attack sentence in the opening section)

old:
~~~text
The attack: "An adversary can exploit package hallucinations, especially if they are repeated, by publishing a package … with the same name as the hallucinated … package" (USENIX version, pages 3687–3688).
~~~

new:
~~~text
The attack: "An adversary can exploit package hallucinations, especially if they are repeated, by publishing a package … with the same name as the hallucinated … package" (USENIX version, pages 3687–3688). The European Union Agency for Cybersecurity describes slopsquatting as the case "where attackers publish packages matching hallucinated package names generated by AI tools" (Technical Advisory for Secure Use of Package Managers, version 1.1, March 2026, section 5.2, page 26, https://www.enisa.europa.eu/sites/default/files/2026-03/ENISA%20Technical%20Advisory%20-%20Package_Managers_Final.pdf, read 2026-09-30).
~~~

**Proposed change 5b** (the name check)

old:
~~~text
**Verify every import against its registry, never by installing it.**
~~~

new:
~~~text
**Verify every import against its registry, never by installing it.** The same advisory says "Verify package names carefully to avoid malicious imitations or naming collisions." (section 4.1.2, page 18, https://www.enisa.europa.eu/sites/default/files/2026-03/ENISA%20Technical%20Advisory%20-%20Package_Managers_Final.pdf, read 2026-09-30).
~~~

**Proposed change 5c** (the tool list's standing)

old:
~~~text
The table groups the tools into five layers; the gate below runs them in order.
~~~

new:
~~~text
The table groups the tools into five layers; the gate below runs them in order. The European Union Agency for Cybersecurity says of the tools in its own advisory that they are "illustrative examples only and do not represent a recommendation of specific tools" (version 1.1, page 16, https://www.enisa.europa.eu/sites/default/files/2026-03/ENISA%20Technical%20Advisory%20-%20Package_Managers_Final.pdf, read 2026-09-30); the tools named here are meant the same way.
~~~

**Proposed change 5d** (the gate's order and `--ignore-scripts`)

old:
~~~text
Recommended pre-merge gate for continuous integration. Check names before anything is installed:
~~~

new:
~~~text
Recommended pre-merge gate for continuous integration. Check names before anything is installed, which is the order the European Union Agency for Cybersecurity's advisory gives: "Run scans prior to installation or during dependency review" (section 4.1.2, page 18), and "native package manager commands such as npm ci --ignore-scripts for dependency integrity and install-script control" (section 5.1, page 25), with the caution "Disabling scripts may impact packages and functionality." (section 4.2.1, page 19) (https://www.enisa.europa.eu/sites/default/files/2026-03/ENISA%20Technical%20Advisory%20-%20Package_Managers_Final.pdf, version 1.1, March 2026, read 2026-09-30). The reasons:
~~~

### Finding 6 — medium — new: "Existence is not enough" lacks the paper's own judgement on curated allow-lists; Table 4 is not carried

**What is wrong.** The mitigation section (page 3698) says a curated list judged by popularity "would be a more effective method", but "this is still considered a blunt and reactive approach that requires constant verification and updating".

**Decision on Table 4 (mitigation rates, page 3699): the file should not carry it.** The file states no mitigation rate. Table 4 measures fixes on the model's side (retrieval-augmented generation, self-refinement, fine-tuning, ensembles), which a reviewer of finished code cannot apply. Adding it would be a figure with no action behind it.

**Evidence.** Research Part C.4, read as page images.

**Decision:** `change` for the quotation; no change for Table 4.

**Proposed change 6**

old:
~~~text
The same paper, citing earlier work, groups package confusion into "typosquatting, combosquatting, brandjacking, and similarity attacks" (page 3688), and names that look invented can be registered (see the examples below).
~~~

new:
~~~text
Its mitigation section judges a curated allow-list, chosen by a metric such as package popularity, only a partial answer: it "would be a more effective method", but "this is still considered a blunt and reactive approach that requires constant verification and updating" (page 3698). The same paper, citing earlier work, groups package confusion into "typosquatting, combosquatting, brandjacking, and similarity attacks" (page 3688), and names that look invented can be registered (see the examples below).
~~~

### Finding 7 — medium — new: Scorecard is judged on its README alone, and triage is not told what to read

**What is wrong.**
- `docs/checks.md` also names no score field and no threshold, so the file can widen "the README" to both documents.
- Each check carries its own risk level: Maintained is "Risk: `High` (possibly unpatched vulnerabilities)" and Signed-Releases is "Risk: `High` (possibility of installing malicious releases)".
- So triage should read individual checks, never the overall score against a threshold.

**Evidence.** Research Part C.1.

**Decision:** `change`. Changes 7a and 7b.

**Proposed change 7a**

old:
~~~text
| OSS health | **OpenSSF Scorecard**, **deps.dev**, **Dependency-Track** | Maintenance signal |
~~~

new:
~~~text
| OSS health | **OpenSSF Scorecard**, **deps.dev**, **Dependency-Track** | Maintenance signal; with Scorecard, read individual checks and their risk levels, such as Maintained and Signed-Releases, never the overall score against a threshold |
~~~

**Proposed change 7b**

old:
~~~text
Scorecard's README says "you must authenticate your requests before running Scorecard" and names no JavaScript Object Notation field for the score and no risk threshold (https://github.com/ossf/scorecard).
~~~

new:
~~~text
Scorecard's README says "you must authenticate your requests before running Scorecard" (https://github.com/ossf/scorecard); neither the README nor the checks documentation names a JavaScript Object Notation field for the score or a risk threshold, and each check carries its own risk level instead, for example Maintained, "Risk: `High` (possibly unpatched vulnerabilities)", and Signed-Releases, "Risk: `High` (possibility of installing malicious releases)" (https://raw.githubusercontent.com/ossf/scorecard/main/docs/checks.md). Triage reads those individual checks, never the overall score against a threshold.
~~~

### Finding 8 — low — resolves round 1's carried item: the react-codemod readme no longer mentions jscodeshift

**What is wrong.** The readme's usage is `npx codemod react/19/remove-forward-ref --target <path>`, and "The scripts in this repository are maintained by the React team in collaboration with the Codemod.com team"; no sentence mentions jscodeshift.

**Evidence.** Research Part B, row 10.

**Decision:** `change`

**Proposed change 8**

old:
~~~text
the real tools are `jscodeshift` + `react-codemod`
~~~

new:
~~~text
the React team's codemods are the react-codemod collection, run as `npx codemod react/<transform> --target <path>` (https://raw.githubusercontent.com/reactjs/react-codemod/master/README.md, read 2026-09-30)
~~~

### Finding 9 — low — resolves round 1's carried item: the `pg_advanced_search` heading claims more than was checked

**What is wrong.** Two things were checked: PGXN answered 404 (with the control `pair.json` answering 200), and PostgreSQL 18's Appendix F lists no such module. "Not in core" and "any distribution" were not checked.

**Evidence.** Research Part B, row 7.

**Decision:** `change`

**Proposed change 9**

old:
~~~text
-- HALLUCINATION — extension does not exist in any Postgres distribution
CREATE EXTENSION pg_advanced_search;             -- not in core, not in contrib, not on PGXN
~~~

new:
~~~text
-- HALLUCINATION — invented extension names
CREATE EXTENSION pg_advanced_search;             -- not among PostgreSQL 18's supplied modules in Appendix F (https://www.postgresql.org/docs/current/contrib.html) and not on PGXN (https://api.pgxn.org/dist/pg_advanced_search.json answered status 404, while https://api.pgxn.org/dist/pair.json answered 200); all read 2026-09-30
~~~

### Finding 10 — low — resolves round 1's carried item: `javap` needs the class path, and is a disassembler that reads without running

**Evidence.** The manual (research Part B, row 2):
- "javap - disassemble one or more class files";
- `-p` "Shows all classes and members.";
- `-cp` "Specifies the path that the `javap` command uses to find user class files."

**Decision:** `change`

**Proposed change 10**

old:
~~~text
//   javap -p <Class>   → list declared methods
~~~

new:
~~~text
//   javap -p -cp <jar> <fully.qualified.Class>   → "Shows all classes and members" of a class file already on disk; javap is a disassembler and runs nothing (https://docs.oracle.com/en/java/javase/21/docs/specs/man/javap.html, read 2026-09-30)
~~~

### Finding 11 — low — resolves round 1's carried items: the Stripe.net and Entity Framework Core comments have no source

**Evidence** (research Part B, rows 3 and 4)
- **Stripe.net:** `Services/Checkout` holds only `Sessions` and `SessionLineItems`. The namespace declarations were not read.
- **Entity Framework Core** (raw): "The EF Core async extension methods are defined in the `Microsoft.EntityFrameworkCore` namespace."

**Decision:** `change`. Changes 11a and 11b.

**Proposed change 11a**

old:
~~~text
// Stripe.net has no 'PaymentPro' namespace
~~~

new:
~~~text
// Stripe.net's Services/Checkout folder holds only Sessions and SessionLineItems, no PaymentPro (https://github.com/stripe/stripe-dotnet/tree/master/src/Stripe.net/Services/Checkout, read 2026-09-30); its namespace declarations were not read
~~~

**Proposed change 11b**

old:
~~~text
// No such namespace; async is built into EF Core
~~~

new:
~~~text
// No such namespace: "The EF Core async extension methods are defined in the `Microsoft.EntityFrameworkCore` namespace." (https://learn.microsoft.com/en-us/ef/core/miscellaneous/async, read 2026-09-30)
~~~

### Finding 12 — low — resolves round 1's carried item: the Go comments lack their evidence

**Evidence**
- The proxy answered 404 for `…/exporters/jaeger-pro/@v/list`. This replaces the unchecked "never had a 'pro'".
- `go mod download` "downloads the named modules into the module cache" (research Part B, rows 5 and 9).

**Decision:** `change`. Changes 12a and 12b.

**Proposed change 12a**

old:
~~~text
// Jaeger exporter was deprecated in 2023; never had a 'pro'
~~~

new:
~~~text
// Jaeger exporter was deprecated in 2023; https://proxy.golang.org/go.opentelemetry.io/otel/exporters/jaeger-pro/@v/list answered status 404 on 2026-09-30
~~~

**Proposed change 12b**

old:
~~~text
//   Never run go mod download to test a name: it downloads the module
~~~

new:
~~~text
//   Never run go mod download to test a name: it "downloads the named modules into the module cache" (https://go.dev/ref/mod, read 2026-09-30)
~~~

### Finding 13 — checked, no change: OWASP Dependency-Check

**Why no change.** Dependency-Check "attempts to detect publicly disclosed vulnerabilities contained within a project's dependencies" (research Part C.3). It is a vulnerability scanner, not a name check. The file does not name it: its "OSS health" row names Dependency-Track, a different project, whose claim stays carried. Nothing to correct, and it must not be added to the name-checking layer.

**Decision:** no change.

---

## Statements that rest only on a page read through a summarising tool

These came through a fetch tool's summarising model, not as raw bytes or page images:
- **OpenSSL:** the manual-page quotations (the digest sentence, the history note, the three prototypes).
- **C++:** the C++ draft's two sections and cppreference.
- **Java:** the `javap` manual and the Java Language Specification sentence.
- **Other language references:** the typing specification, docs.rs and the Go Modules Reference.
- **Libraries:** the react-codemod readme and Stripe.net's folder listing.
- **PostgreSQL:** Appendix F, and PGXN's `pair.json` contents.
- **Scorecard:** its checks documentation.
- **Veracode:** both pages.

**Read directly:**
- The Entity Framework Core page, raw.
- The status-only 404s.
- The USENIX and ENISA pages, as page images.
- The session's raw runs: the four catalogue probes, OpenSSL's `libcrypto.num`, Jackson's `ObjectMapper.java` and `JsonMapper.java`, and the C++ compilation.

## Carried to round 3

- **`bcrypt` failing in the browser** (lines 93 and 302): not checked.
- **Tools in the table:**
  - how Socket, Snyk and Aikido detect malware (line 266);
  - deps.dev and Dependency-Track (line 269);
  - `cosign verify` itself;
  - Scorecard's command-line JSON format.
- **Registries and names:**
  - Stripe.net's namespace declarations;
  - PostgreSQL "core" and third-party distributions;
  - crates.io with an identifying user-agent (not sent);
  - whether `go list -m …@latest` contacts the proxy;
  - whether jscodeshift still drives react-codemod;
  - `npm view`'s own 404 output;
  - an npm command named slopcheck.
- **Standards and agencies:**
  - OWASP's Software Component Verification Standard beyond chapter 4, and the fate of its issue 21;
  - ENISA printed pages 22–24;
  - `npm audit`'s exit rule without `--audit-level`;
  - the National Vulnerability Database itself.
- **Libraries' own references:**
  - whether Jackson 3's `ObjectMapper` has a static `builder()`;
  - what the typing specification says about a name missing inside a stub module that is present.
- **Later Veracode updates:** only their titles were seen.
- **Deliberately excluded:** a complete AES-GCM program in C, for the reason given in finding 2.

## For the human

- **Whether the skill keeps a recommended gate for continuous integration at all.** The wrapper never runs it, and several of its tools remain unchecked. This is a scope decision. Standing.
- **The trigger phrase "AI code review"** is shared with ai-code-quality-reviewer. Standing.
- **Standing from the agent file:** private-registry credentials; a tool that verifies provenance; `tokens_used: null` versus the schema.

## Cross-file findings for the agent (`agents/ai-quality/hallucination-detector.md`)

1. **"the examples across seven languages" (wrapper line 22)** becomes true after this round. No change needed.
2. **Wrapper item 2 of "Read the method first"** names the skill's observed addresses for NuGet, the Go proxy and Postgres, but not the new Conan and vcpkg addresses. The wrapper's "No recipe here" already covers "every other registry", so it stays correct. An optional late correction for completeness:

   old:
   ~~~text
   The skill records observed addresses for NuGet and the Go module proxy, and a database query for Postgres extensions, that this file has not turned into recipes
   ~~~

   new:
   ~~~text
   The skill records observed addresses for NuGet, the Go module proxy, ConanCenter and vcpkg, and a database query for Postgres extensions, that this file has not turned into recipes
   ~~~

3. **Python partial stub packages (finding 3).** A stub package marked partial can omit whole modules by design, so the wrapper's HIGH rule for a member missing from declaration files should not apply to a module missing from a partial stub package. Proposed late correction to the wrapper's Export Verification bullet:

   old:
   ~~~text
   A member missing from the declaration files, after every re-export is followed, is a finding with confidence HIGH.
   ~~~

   new:
   ~~~text
   A member missing from the declaration files, after every re-export is followed, is a finding with confidence HIGH; a whole module missing from a Python stub package that declares itself partial is not ("If a stub package distribution is partial it MUST include `partial\n` in a `py.typed` file", https://typing.python.org/en/latest/spec/distributing.html, read 2026-09-30).
   ~~~

4. **Everything the wrapper depends on is byte-identical:**
   - the triage table;
   - the seven `kind` values;
   - `registry_checked` and `registry_response`;
   - the five quoted headings;
   - the "NEVER auto-install…" red line.

## Scores for the skill as it stands (round-1 result), weighted as a review agent

| Dimension | Score | Why |
|---|---|---|
| Specificity | 7 | Concrete, sourced commands and addresses. The "OSS health" row and a few comments are still vague. |
| Completeness | 6 | No C or C++ examples. |
| Boundaries | 7 | Defers to the wrapper and names related skills. |
| Actionability | 7 | — |
| Integration | 8 | The loop is fenced, and the output and confidence rules follow the wrapper. |
| Robustness | 7 | No unsafe recipes remain, but the Jackson "fix" still teaches a half-wrong correction. |
| Calibration | 7 | The Veracode unit is unsettled, and Scorecard triage is unguided. |
| Research grounding | 7 | The `module-info.java` claim is wrong, and the jscodeshift and Jackson comments are wrong or stale. |
| **Overall** | **6.9** | Weights: specificity 1.75, completeness 1.5, boundaries 1, actionability 1.25, integration 1, robustness 0.75, calibration 1.25, research grounding 1. Verdict: REFINE. |

**Weakest dimension: completeness (6).** Change 2 adds C and C++ examples that were compiled or checked against the library, which closes it.