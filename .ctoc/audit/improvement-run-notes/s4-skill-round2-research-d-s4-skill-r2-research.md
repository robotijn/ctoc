# Round 2 research for the hallucination-detector skill (dispatch `d-s4-skill-r2-research`)

I changed no file. I used all 35 of the allowed fetches and searches: 34 page fetches and 1 search. I also read two PDFs saved by earlier validators, as page images; those reads are not fetches.

- **Headline.** Both C and C++ now have a checked example of an invented name and its real counterpart, and both package catalogues answered as expected (200 for the real name, 404 for the invented one).
- **Code-example correctness.** Three code comments in the file are wrong or out of date:
  - The Jackson line has a second invented call that its comment does not name.
  - The line on where to check a method credits `module-info.java` with something it cannot do.
  - `jscodeshift` no longer appears in the React codemod README.
- **Fabrications.** None found.

## Source classes, and why they differ from round 1

Round 1 used research papers, plus the registries' and vendors' own documentation. This round's new classes are:

- **Specifications:**
  - the C++ working draft at eel.is;
  - the Java Language Specification;
  - the Python typing specification;
  - the Go Modules Reference.
- **A security agency:** the European Union Agency for Cybersecurity (ENISA), its final package-manager advisory, version 1.1. I read sections 4 and 5 as page images.
- **Standards and industry bodies:**
  - the OWASP Software Component Verification Standard, chapter 4;
  - the OWASP Dependency-Check project;
  - the OpenSSF Scorecard checks documentation.
- **A peer-reviewed publisher:** the USENIX Security 2025 proceedings, the mitigation section (printed pages 3697–3700), read as page images.

To check whether code examples are correct I also had to use each library's own reference (OpenSSL's manual sources, Jackson, Oracle, Microsoft Learn, Stripe.net, react-codemod) and the registries' own addresses (Conan, vcpkg, the Go proxy, crates.io, PGXN). That is the same class as round 1, used for different claims.

**Reused, not fetched again** (from the agent file's round-2 and round-3 notes):
- The ENISA final advisory's existence, its "Version: 1.1", "MARCH 2026", and section numbers 3.2.1 to 3.2.4 (`s4-agent-round3-session-runs.md`, item e).
- The OWASP LLM09:2025 and A03:2025 entries, the OpenSSF guides, SLSA, NIST SP 800-218, the joint ANSSI–BSI report, and the Cyber Resilience Act mirror. None was needed again.
- Settled by the skill's round 1 and not fetched again:
  - the Jaeger exporter's 2023 deprecation (research gaps, row 56);
  - the 2022 rename of react-query (re-validation, claim 125).

## Fetches in order

The mode shows how each answer reached me:
- **summary**: through the fetch tool's summarising model;
- **status**: the tool's own report of the response code;
- **raw**: the full page returned unsummarised.

| # | Address | Mode | Result |
|---|---|---|---|
| 1 | https://raw.githubusercontent.com/conan-io/conan-center-index/master/recipes/zlib/config.yml | summary | 200; `versions: "1.3.2": folder: all` |
| 2 | …/conan-center-index/master/recipes/libfastjson_pro/config.yml | status | 404 |
| 3 | https://raw.githubusercontent.com/microsoft/vcpkg/master/ports/fmt/vcpkg.json | summary | 200; `"name": "fmt"`, `"version": "12.2.0"` |
| 4 | …/microsoft/vcpkg/master/ports/libfastjson-pro/vcpkg.json | status | 404 |
| 5 | https://docs.openssl.org/master/man3/EVP_DigestInit/ | summary | Navigation only, no page body. Wasted. |
| 6 | https://raw.githubusercontent.com/openssl/openssl/master/doc/man3/EVP_DigestInit.pod | summary | See Part A |
| 7 | …/openssl/openssl/master/doc/man3/EVP_EncryptInit.pod | summary | See Part A |
| 8 | https://eel.is/c++draft/vector.overview | summary | See Part A |
| 9 | https://eel.is/c++draft/alg.contains | summary | See Part A |
| 10 | https://javadoc.io/static/com.fasterxml.jackson.core/jackson-databind/2.18.2/com/fasterxml/jackson/databind/ObjectMapper.html | summary | Truncated at "readerFo" |
| 11 | https://raw.githubusercontent.com/FasterXML/jackson-databind/2.18/src/main/java/com/fasterxml/jackson/databind/json/JsonMapper.java | summary | See Part B |
| 12 | https://javadoc.io/static/tools.jackson.core/jackson-databind/3.0.0/tools/jackson/databind/ObjectMapper.html | status | 404 |
| 13 | https://raw.githubusercontent.com/FasterXML/jackson/main/jackson3/MIGRATING_TO_JACKSON_3.md | summary | See Part B |
| 14 | https://raw.githubusercontent.com/FasterXML/jackson-databind/2.18/README.md | summary | See Part B |
| 15 | https://docs.oracle.com/en/java/javase/21/docs/specs/man/javap.html | summary | See Part B |
| 16 | https://github.com/stripe/stripe-dotnet/tree/master/src/Stripe.net/Services/Checkout | summary | See Part B |
| 17 | https://learn.microsoft.com/en-us/ef/core/miscellaneous/async | **raw** | See Part B |
| 18 | https://proxy.golang.org/go.opentelemetry.io/otel/exporters/jaeger-pro/@v/list | status | 404 |
| 19 | https://crates.io/api/v1/crates/serde/1.0.0 | summary | See Part B |
| 20 | https://api.pgxn.org/dist/pg_advanced_search.json | status | 404 |
| 21 | https://api.pgxn.org/dist/pair.json | summary | 200; the positive control for row 20 |
| 22 | https://docs.oracle.com/javase/specs/jls/se21/html/jls-7.html | summary | See Part B |
| 23 | https://typing.python.org/en/latest/spec/distributing.html | summary | See Part B |
| 24 | https://docs.rs/about | summary | See Part B |
| 25 | https://go.dev/ref/mod | summary | See Part B |
| 26 | https://raw.githubusercontent.com/reactjs/react-codemod/master/README.md | summary | See Part B |
| 27 | https://raw.githubusercontent.com/ossf/scorecard/main/docs/checks.md | summary | See Part C |
| 28 | https://api.securityscorecards.dev/projects/github.com/ossf/scorecard | summary | Contradicts itself; see Part C |
| 29 | Search: "OWASP Software Component Verification Standard package management typosquatting requirement" | search snippets | See Part C |
| 30 | https://github.com/OWASP/Software-Component-Verification-Standard/tree/master/en | summary | Chapter file list |
| 31 | …/Software-Component-Verification-Standard/master/en/0x13-V4-Package_Management.md | summary | See Part C |
| 32 | https://raw.githubusercontent.com/jeremylong/DependencyCheck/main/README.md | summary | A "moved" notice only |
| 33 | https://raw.githubusercontent.com/dependency-check/DependencyCheck/main/README.md | summary | See Part C |
| 34 | https://en.cppreference.com/w/cpp/algorithm/ranges/contains | summary | See Part A |
| 35 | https://www.postgresql.org/docs/current/contrib.html | summary | See Part B |

**Local page-image reads (not fetches):**
- The USENIX paper, `<home>/.claude/projects/-Users-account-Code-ctoc/b1c5a29e-f445-4461-8294-b84832a0154b/tool-results/webfetch-1790790330893-6989qo.pdf`, PDF pages 12–15 (printed 3697–3700).
- The ENISA final advisory, `…/tool-results/webfetch-1790792186381-c1nfvx.pdf`, printed pages 1–3, 16–21 and 25–26.

**Injection check.** No fetched page spoke to a reviewer or gave instructions.

## Part A — C and C++

### Catalogue probes

| Catalogue | Address | Status |
|---|---|---|
| ConanCenter, real | https://raw.githubusercontent.com/conan-io/conan-center-index/master/recipes/zlib/config.yml | 200 |
| ConanCenter, invented | https://raw.githubusercontent.com/conan-io/conan-center-index/master/recipes/libfastjson_pro/config.yml | 404 |
| vcpkg, real | https://raw.githubusercontent.com/microsoft/vcpkg/master/ports/fmt/vcpkg.json | 200; `"name": "fmt"`, `"version": "12.2.0"`, `"port-version": 1` (summary) |
| vcpkg, invented | https://raw.githubusercontent.com/microsoft/vcpkg/master/ports/libfastjson-pro/vcpkg.json | 404 |

- **What a 404 here means:** the name is not in that catalogue's main branch today. It does not mean the name exists nowhere. A private Conan remote or vcpkg registry can hold it, which is the dependency-confusion case the file already describes.
- **The wrapper has no Conan or vcpkg recipe.** So these addresses are observed facts, the same status the file gives its NuGet and Go addresses. Names from these catalogues stay "not checked" at the wrapper level.

### Checked example and real counterpart for C (OpenSSL)

- **The invented call:** `EVP_Q_encrypt`.
  - The manual page source for the cipher routines (fetch 7) was asked whether the text contains any function beginning "EVP_Q_". Answer: "No, the document contains no functions whose names begin with 'EVP_Q_'."
  - The digest page (fetch 6) contains neither "EVP_Q_encrypt" nor "EVP_Q_cipher".
- **What it is mistaken for:** `EVP_Q_digest`. The digest page says: "EVP_Q_digest() is a quick one-shot digest function." Its HISTORY section says "The EVP_Q_digest(), EVP_DigestInit_ex2(), … functions were added in OpenSSL 3.0."
- **The real cipher calls**, as that page's synopsis declares them:
  - `int EVP_EncryptInit_ex2(EVP_CIPHER_CTX *ctx, const EVP_CIPHER *type, const unsigned char *key, const unsigned char *iv, const OSSL_PARAM params[]);`
  - `int EVP_EncryptUpdate(EVP_CIPHER_CTX *ctx, unsigned char *out, int *outl, const unsigned char *in, int inl);`
  - `int EVP_EncryptFinal_ex(EVP_CIPHER_CTX *ctx, unsigned char *out, int *outl);`

### Checked example and real counterpart for C++

- **The invented member:** `std::vector::contains`. The working draft's class synopsis (fetch 8), "23.3.13.1 Overview [vector.overview]", declares no member named `contains`. Answer: "No."
- **The real function:** the algorithm `std::ranges::contains`.
  - In [alg.contains] (26.6.4, fetch 9): `constexpr bool ranges::contains(I first, S last, const T& value, Proj proj = {});`
  - Its "Returns" element: `ranges::find(std::move(first), last, value, proj) != last`. The summary showed `!\=`; I read that as an escaping artefact.
  - cppreference (fetch 34): "Defined in header `<algorithm>`", "(since C++23)", feature-test macro `__cpp_lib_ranges_contains` `202207L`.

### Proposed text

This replaces the C/C++ section's sentence "This file has no checked example of an invented C or C++ name yet. Until it has one, …":

```c
// C and C++ names in the two catalogues (read 2026-09-30):
//   https://raw.githubusercontent.com/conan-io/conan-center-index/master/recipes/zlib/config.yml            answered status 200
//   https://raw.githubusercontent.com/conan-io/conan-center-index/master/recipes/libfastjson_pro/config.yml answered status 404
//   https://raw.githubusercontent.com/microsoft/vcpkg/master/ports/fmt/vcpkg.json                            answered status 200
//   https://raw.githubusercontent.com/microsoft/vcpkg/master/ports/libfastjson-pro/vcpkg.json                answered status 404
//   A 404 means "not in that catalogue", not "exists nowhere": a private Conan remote or vcpkg registry can hold the name.

// HALLUCINATION — invented function on a real library (OpenSSL)
EVP_Q_encrypt(NULL, "AES-256-GCM", NULL, key, iv, in, inlen, out, &outlen);
// OpenSSL's manual page for the cipher routines has no function beginning "EVP_Q_"
// (https://raw.githubusercontent.com/openssl/openssl/master/doc/man3/EVP_EncryptInit.pod, read 2026-09-30);
// the name copies EVP_Q_digest(), "a quick one-shot digest function" added "in OpenSSL 3.0"
// (https://raw.githubusercontent.com/openssl/openssl/master/doc/man3/EVP_DigestInit.pod, read 2026-09-30)
// SAFE — the cipher routines that page declares:
//   int EVP_EncryptInit_ex2(EVP_CIPHER_CTX *ctx, const EVP_CIPHER *type, const unsigned char *key, const unsigned char *iv, const OSSL_PARAM params[]);
//   int EVP_EncryptUpdate(EVP_CIPHER_CTX *ctx, unsigned char *out, int *outl, const unsigned char *in, int inl);
//   int EVP_EncryptFinal_ex(EVP_CIPHER_CTX *ctx, unsigned char *out, int *outl);
```

```cpp
// HALLUCINATION — a member function std::vector does not have
if (v.contains(x)) { /* ... */ }   // the class synopsis in [vector.overview] declares no member named contains (https://eel.is/c++draft/vector.overview, read 2026-09-30)

// SAFE — the algorithm, since C++23, header <algorithm> (https://en.cppreference.com/w/cpp/algorithm/ranges/contains, read 2026-09-30)
if (std::ranges::contains(v.begin(), v.end(), x)) { /* ... */ }   // [alg.contains] returns "ranges::find(std::move(first), last, value, proj) != last" (https://eel.is/c++draft/alg.contains, read 2026-09-30)
```

**Deliberately left out of the C example:** a complete AES-GCM program. I did not check the handling of the authentication tag, `EVP_CIPHER_CTX_new`, or `EVP_aes_256_gcm`, and a GCM example without the tag step would teach broken cryptography. So the real counterpart is given as the three declared prototypes only.

## Part B — code-example correctness

| # | File text | Verdict | Source and quote | Corrected wording |
|---|---|---|---|---|
| 1 | `ObjectMapper.builder().build().writeValueAsJson(obj);  // Jackson is writeValueAsString` | **Needs correction:** the line has two inventions and the comment names one | Jackson 2.18.2's method summary (fetch 10): no method named "builder", no "writeValueAsJson". The summary was seen only up to "readerFo", which covers "builder" alphabetically. JsonMapper source (fetch 11): `public class JsonMapper extends ObjectMapper` and `public static JsonMapper.Builder builder()`. README (fetch 14): `ObjectMapper mapper = new ObjectMapper(); // create once, reuse` and `String jsonString = mapper.writeValueAsString(myResultObject);`. Jackson 3 migration guide (fetch 13): "both `ObjectMapper` and `JsonFactory` are fully immutable in 3.0: instances to be constructed using the *builder* pattern"; the guide's example is `JsonMapper.builder()`. | `String json = ObjectMapper.builder().build().writeValueAsJson(obj);  // two inventions: Jackson 2.18.2's ObjectMapper has neither builder() nor writeValueAsJson (https://javadoc.io/static/com.fasterxml.jackson.core/jackson-databind/2.18.2/com/fasterxml/jackson/databind/ObjectMapper.html, read 2026-09-30); the builder is JsonMapper.builder() and the method is writeValueAsString (https://github.com/FasterXML/jackson-databind, read 2026-09-30)`, plus a correct line: `String json = new ObjectMapper().writeValueAsString(obj);` |
| 2 | `javap -p <Class>   → list declared methods` | Validated, with a small refinement | "javap - disassemble one or more class files"; `-p`: "Shows all classes and members."; `-cp`: "Specifies the path that the `javap` command uses to find user class files." (fetch 15) | `javap -p -cp <jar> <fully.qualified.Class>   → "Shows all classes and members" of a class file already on disk; javap is a disassembler (https://docs.oracle.com/en/java/javase/21/docs/specs/man/javap.html, read 2026-09-30)` |
| 3 | `Stripe.net has no 'PaymentPro' namespace` | Validated in part | The `Services/Checkout` folder holds only `SessionLineItems` and `Sessions`; "PaymentPro": "No" (fetch 16). No namespace declaration was read. | `// Stripe.net's Services/Checkout folder holds only Sessions and SessionLineItems, no PaymentPro (https://github.com/stripe/stripe-dotnet/tree/master/src/Stripe.net/Services/Checkout, read 2026-09-30)` |
| 4 | `No such namespace; async is built into EF Core` | **Validated (raw)** | "The EF Core async extension methods are defined in the `Microsoft.EntityFrameworkCore` namespace. This namespace must be imported for the methods to be available." (fetch 17) | `// No such namespace; EF Core's async methods such as ToListAsync are in Microsoft.EntityFrameworkCore (https://learn.microsoft.com/en-us/ef/core/miscellaneous/async, read 2026-09-30)` |
| 5 | `Jaeger exporter was deprecated in 2023; never had a 'pro'` | Validated | https://proxy.golang.org/go.opentelemetry.io/otel/exporters/jaeger-pro/@v/list answered 404 (fetch 18). The deprecation year comes from round 1. | Append: `; https://proxy.golang.org/go.opentelemetry.io/otel/exporters/jaeger-pro/@v/list answered status 404 on 2026-09-30` |
| 6 | `curl -A '<application> (<contact>)' https://crates.io/api/v1/crates/<name>/<version> \| jq .version.yanked` | Validated (shape) | The top-level key is `version`. Under it: `yanked` (false), `yank_message`, `num` ("1.0.0"), `crate` ("serde") (fetch 19). I could not send an identifying user-agent, because the fetch tool has no header control. | Keep as is |
| 7 | `CREATE EXTENSION pg_advanced_search; -- not in core, not in contrib, not on PGXN`, under the heading "does not exist in any Postgres distribution" | Validated for contrib and PGXN; "core" and "any distribution" not checked | PGXN: https://api.pgxn.org/dist/pg_advanced_search.json answered 404, while the control https://api.pgxn.org/dist/pair.json answered 200 (`pair`, `0.1.8`). PostgreSQL 18, Appendix F, lists F.1 `amcheck` to F.50 `xml2`, and no name contains "advanced" or "search" (fetch 35). | Heading: `-- HALLUCINATION — extension found neither among PostgreSQL's supplied modules nor on PGXN`. Comment: `-- not in PostgreSQL 18's Appendix F (https://www.postgresql.org/docs/current/contrib.html) and not on PGXN (https://api.pgxn.org/dist/pg_advanced_search.json answered status 404, https://api.pgxn.org/dist/pair.json answered 200); both read 2026-09-30` |
| 8 | "Check the package's `package.json` exports / `.pyi` stubs / `module-info.java` / Cargo docs.rs / Go pkg.go.dev against the called method." | **Needs correction** for `module-info.java`; the rest validated, with one caution | Java Language Specification, section 7.7.2: "The `exports` directive specifies the name of a package to be exported by the current module." It names packages, not methods (fetch 22). Typing specification: "Stub files are syntactically valid Python files with a `.pyi` suffix."; "If a stub package distribution is partial it MUST include `partial\n` in a `py.typed` file" (fetch 23). docs.rs: "All libraries published to crates.io are documented." (fetch 24) | `Check the called member against the declarations of the resolved version: the package's package.json "exports" and its type declarations; Python .pyi stub files ("syntactically valid Python files with a .pyi suffix"; a stub package can be partial, https://typing.python.org/en/latest/spec/distributing.html); docs.rs for Rust ("All libraries published to crates.io are documented.", https://docs.rs/about); pkg.go.dev for Go. A Java module-info.java names packages, not members ("The exports directive specifies the name of a package to be exported by the current module", https://docs.oracle.com/javase/specs/jls/se21/html/jls-7.html, section 7.7.2), so it settles a wrong package, never a missing method; for a method use javap -p. All read 2026-09-30.` |
| 9 | `Never run go mod download to test a name: it downloads the module` | **Validated** | "The `go mod download` command downloads the named modules into the module cache." (fetch 25) | Append: `("downloads the named modules into the module cache", https://go.dev/ref/mod, read 2026-09-30)` |
| 10 | "the real tools are `jscodeshift` + `react-codemod`" | **Out of date in part** | The README says "This repository contains a collection of codemods to help update React apps."; its usage is `npx codemod react/19/remove-forward-ref --target <path>` and similar; "The scripts in this repository are maintained by the React team in collaboration with the Codemod.com team." No sentence mentions jscodeshift (fetch 26). | `the real codemods are the React team's react-codemod collection (https://github.com/reactjs/react-codemod, read 2026-09-30), run as npx codemod react/<transform> --target <path>` |
| 11 | The rename year 2022 | Skipped as instructed | Round 1 re-validation, claim 125 | — |

**A caution for row 8 and the wrapper's HIGH rule.** The typing specification's partial-stub rule is stated for modules ("modules not found in the stub package SHOULD be searched for…"). So a stub package can omit whole modules by design. I did not find what the specification says about a name missing inside a stub module that is present. Treat that as not checked.

## Part C — standards and agencies

### 1. OpenSSF Scorecard beyond the README

`docs/checks.md` (fetch 27, summary):
- **Each check carries its own risk level:**
  - Maintained: "Risk: `High` (possibly unpatched vulnerabilities)";
  - Code-Review: "Risk: `High` (unintentional vulnerabilities or possible injection of malicious code)";
  - Signed-Releases: "Risk: `High` (possibility of installing malicious releases)";
  - Dangerous-Workflow: "Risk: `Critical` (vulnerable to repository compromise)";
  - Binary-Artifacts: "Risk: `High` (non-reviewable code)".
- **No threshold score** is defined, and no JSON field for the score is named. The tool reported seeing the whole document, through its last heading, "Webhooks".

The public Scorecard service (fetch 28) returned a score of 8.7 for `github.com/ossf/scorecard`, dated 2026-09-29T20:35:39Z, and per-check keys `name, score, reason, details, documentation`. But the same summary listed the top-level keys as only `date, repo, scorecard`, which contradicts itself. The field name is therefore not settled, and this is the service's answer, not the command-line tool's output.

**Result:** the file's current claim ("names no JavaScript Object Notation field for the score and no risk threshold") also holds for `checks.md`. It can be widened from "the README" to "the README and the checks documentation". If triage uses Scorecard at all, it should read individual checks such as Maintained or Signed-Releases, never compare the overall score against a threshold.

### 2. ENISA final advisory, version 1.1, sections 4 and 5

Page images, printed page numbers:
- **Page 16, a caveat on every tool it names:** "NB: The tools and commands included in this section are illustrative examples only and do not represent a recommendation of specific tools. Their suitability, applicability, and impact depend on the specific environment and should be assessed, tailored, and managed by the implementor."
- **Page 18, section 4.1.2, "Trusted source":**
  - "Verify package names carefully to avoid malicious imitations or naming collisions."
  - Under "Existing known vulnerabilities": "Run scans prior to installation or during dependency review".
  - Under package signing: "Avoid packages that bypass registry verification, such as direct installs from GitHub or tarball URLs, which lack provenance and integrity checks."
  - Under maintainer reputation: "Be cautious of packages owned by newly created, single project accounts with no additional contributors".
- **Page 17, section 4.1.1:** "NB: Popularity metrics can be misleading or artificially inflated (36) and should not be relied upon in isolation."
- **Page 19, section 4.2.1:**
  - "Vulnerability checks | Enforce security policies in CI/CD pipelines to prevent builds from proceeding with known vulnerable components."
  - "Integrity enforcement | Enforce hash or lockfile verification to confirm that installed packages match approved versions."
  - "Installation script prevention | Inspect and disable or restrict scripts executed during installation to reduce attack surface. NB: Disabling scripts may impact packages and functionality."
- **Page 20, section 4.2.2:**
  - "Block build/install when vulnerabilities are found: npm audit --omit=dev --audit-level=high; grype sbom:./sbom.json --fail-on High."
  - "pip install --require-hashes -r requirements.txt"
  - "Enforce lockfile usage in CI/CD: npm ci."
- **Page 25, section 5.1:** "native package manager commands such as npm ci --ignore-scripts for dependency integrity and install-script control."
- **Page 26, section 5.2:**
  - "Moreover, this approach also introduces new attack vectors like 'slopsquatting' (75), where attackers publish packages matching hallucinated package names generated by AI tools."
  - One of its measures: "automate selection and integration controls, such as those presented in Sections 4.1 and 4.2, where possible (e.g. within CI/CD pipelines)."

**What this supports in the skill:**
- An agency source for the gate's order, names first and scans before installation.
- An agency source for step 2's `npm ci --ignore-scripts`.
- An agency source for the definition of slopsquatting.

**What I did not check:** the file's `npm audit --omit=dev` has no `--audit-level`, while ENISA's example blocks only at `high`. I did not check how `npm audit` exits when `--audit-level` is absent, so I recommend no change on that point.

### 3. OWASP

- **Software Component Verification Standard, chapter 4, "Package Management"** (main branch, fetch 31):
  - None of "typosquat", "typo", "confusion" or "namespace" appears, and no package-name check is required.
  - Requirement 4.1: "Binary components are retrieved from a package repository".
  - Requirement 4.2: "Package repository contents are congruent to an authoritative point of origin for open source components".
  - A search snippet (fetch 29) says issue 21 proposed adding "Anti-typosquatting measures are established when using public package repos by the project or repo" at level 3. That is a snippet only, and the chapter I read does not contain it.
  - The other chapters, including chapter 5, "Component Analysis", were not read.
- **Dependency-Check** (fetch 33):
  - "Dependency-Check is a Software Composition Analysis (SCA) tool that attempts to detect publicly disclosed vulnerabilities contained within a project's dependencies."
  - "It does this by determining if there is a Common Platform Enumeration (CPE) identifier for a given dependency."
  - Nothing about typosquatting, malicious packages or package names.
  - ENISA's footnote 40 adds: "OWASP Dependency-check supports Node.js but is primarily designed for Maven/Java projects."
  - **So it is a vulnerability scanner, not a name check,** and must not be added to the name-verification layer.

### 4. The USENIX paper: mitigation and detection statements the skill can cite

- **Page 3698, section 6.1:** "A straightforward approach to address package hallucinations could be to cross-reference a master list of valid packages with the model's output, thereby eliminating any incorrect package names. This type of filtering method is ineffective as a defense strategy, as an attacker could immediately publish a hallucinated package to the repository and be subsequently included in the "allow" list. Although using a curated list of "known good packages", using some metric such as package popularity, would be a more effective method, this is still considered a blunt and reactive approach that requires constant verification and updating."
  - This backs the file's "Existence is not enough" point from the paper's own mitigation section.
- **Page 3699, Table 4 (hallucination rates):**

  | Method | DeepSeek | CodeLlama |
  |---|---|---|
  | Baseline | 16.14% | 26.28% |
  | Retrieval-augmented generation | 12.24% | 13.40% |
  | Self-refinement | 13.04% | 25.51% |
  | Fine-tuning | 2.66% | 10.27% |
  | Ensemble | 2.40% | 9.32% |

  - The ensemble "reduc[ed] hallucination rates by 85% and 64% from their baseline levels for DeepSeek and CodeLlama, respectively".
  - The cost in code quality, first-attempt pass rate (pass@1): 51.4% → 25.3% (DeepSeek) and 19.6% → 16.4% (CodeLlama).
  - The agent's round-1 note had marked these figures "not verified"; they are now verified from page images.
- **Page 3697:**
  - "only 13.4% (10,263 of 76,489) have a Levenshtein distance of 1 or 2", and "the majority of hallucinations are not merely trivial typographical errors but are substantively different from existing package names".
    - This is the citation for why an edit-distance look-alike check alone misses most invented names.
  - "only JavaScript is a significant source of cross-language hallucinations, as 8.7% (6,705/76,489) of hallucinated Python packages are valid JavaScript packages".
    - This is the citation for the category table's "the registry of the code's own ecosystem".
- **Page 3700:** "we will not release our master list of hallucinated package names … will be shared responsibly by request to verified researchers."
  - The paper's own list is not public. This is useful context for the file's row on hallucination corpora.

## Counts

- **Fetches and searches:** 35 of 35 (34 page fetches, 1 search). One fetch returned no page content (row 5); one returned 404 on a documentation address (row 12).
- **Part A:** 4 catalogue probes (two 200, two 404) and 2 checked pairs (C and C++).
- **Part B:** 10 items checked.
  - Validated: 6 (rows 2, 3 in part, 4, 5, 6, 9).
  - Validated in part, with wording narrowed: 1 (row 7).
  - Needs correction: 2 (rows 1 and 8).
  - Out of date in part: 1 (row 10).
  - Fabricated: 0.
  - 1 skipped as instructed.
- **Part C:** 4 items answered; all rest on quotes, except Scorecard's service field names and the chapter-4 proposal, which stay unsettled.

## Not checked

- **OpenSSL's exported-symbol list** (`util/libcrypto.num`). The absence of `EVP_Q_encrypt` rests on two manual pages read through the summarising tool.
- **Jackson:**
  - whether Jackson 3's `ObjectMapper` declares a static `builder()` (the Jackson 3 documentation address answered 404);
  - Jackson 2.18.2's method summary beyond "readerFo";
  - the checked exception of `writeValueAsString`.
- **Stripe.net's namespace declarations.** Only a folder listing was read.
- **The crates.io user-agent.** The fetch tool cannot set one, so the request went with the tool's own agent string.
- **PostgreSQL "not in core"**, and third-party Postgres distributions.
- **The Cargo registry-index specification's `yanked` field.**
- **Go:** whether `go list -m …@latest` contacts the proxy. The summarised section did not say.
- **Whether jscodeshift still drives `react-codemod`.**
- **Scorecard's command-line JSON format.**
- **OWASP:** the Software Component Verification Standard's other chapters and the fate of issue 21.
- **Dependency-Track.**
- **`npm audit`'s exit rule** without `--audit-level`.
- **ENISA's printed pages 22–24** (section 4.4).
- **Carried unchanged from round 1:** Veracode, Socket, Snyk, Aikido and deps.dev.
- **How the web quotations reached me:** every one came through the summarising tool, except the Entity Framework Core page (raw) and the status-only 404s. The PDF quotations come from my own page-image reads.

```yaml
response:
  dispatch_id: "d-s4-skill-r2-research"
  protocol_version: 1
  agent: ai-quality/citation-validator
  completed_at: null
  findings:
    - {id: citation-validator/d-s4-skill-r2-research/001, severity: high, type: citation-misattributed, file: skills/ai-quality/hallucination-detector/SKILL.md, anchor: "ObjectMapper.builder().build().writeValueAsJson(obj);", message: "The example contains two invented calls and its comment names only writeValueAsJson; Jackson 2.18.2's ObjectMapper has no builder(); the builder is JsonMapper.builder()", suggestion: "correct-to Part B row 1 wording", confidence: MEDIUM, confidence_rationale: "Method summary truncated after 'reader', which covers 'builder' alphabetically; JsonMapper source and README agree; all through the summarising tool", citations: {brief_url: "https://raw.githubusercontent.com/FasterXML/jackson-databind/2.18/src/main/java/com/fasterxml/jackson/databind/json/JsonMapper.java"}}
    - {id: citation-validator/d-s4-skill-r2-research/002, severity: medium, type: citation-overstated, file: skills/ai-quality/hallucination-detector/SKILL.md, anchor: "`module-info.java`", message: "module-info.java exports packages, not members; it cannot settle whether a method exists", suggestion: "correct-to Part B row 8 wording", confidence: HIGH, confidence_rationale: "Java Language Specification section 7.7.2 sentence quoted; the tool confirmed the section was visible", citations: {brief_url: "https://docs.oracle.com/javase/specs/jls/se21/html/jls-7.html"}}
    - {id: citation-validator/d-s4-skill-r2-research/003, severity: medium, type: citation-stale, file: skills/ai-quality/hallucination-detector/SKILL.md, anchor: "the real tools are `jscodeshift` + `react-codemod`", message: "The react-codemod README no longer mentions jscodeshift; its usage is 'npx codemod react/<transform> --target <path>'", suggestion: "correct-to Part B row 10 wording", confidence: MEDIUM, citations: {brief_url: "https://raw.githubusercontent.com/reactjs/react-codemod/master/README.md"}}
    - {id: citation-validator/d-s4-skill-r2-research/004, severity: low, type: citation-overstated, file: skills/ai-quality/hallucination-detector/SKILL.md, anchor: "extension does not exist in any Postgres distribution", message: "Checked: absent from PostgreSQL 18's supplied modules and from PGXN (404, with a 200 control). Not checked: core and third-party distributions", suggestion: "correct-to Part B row 7 wording", confidence: MEDIUM, citations: {brief_url: "https://api.pgxn.org/dist/pg_advanced_search.json"}}
    - {id: citation-validator/d-s4-skill-r2-research/005, severity: info, type: citation-validated, file: skills/ai-quality/hallucination-detector/SKILL.md, anchor: "This file has no checked example of an invented C or C++ name yet.", message: "Checked material now exists: two Conan and two vcpkg probes, the OpenSSL EVP_Q_encrypt/EVP_Q_digest pair, and the std::vector::contains/std::ranges::contains pair", suggestion: "correct-to the Part A proposed text", confidence: MEDIUM, citations: {brief_url: "https://eel.is/c++draft/vector.overview"}}
    - {id: citation-validator/d-s4-skill-r2-research/006, severity: info, type: citation-validated, file: skills/ai-quality/hallucination-detector/SKILL.md, anchor: "EntityFrameworkCore.AsyncQueries; Jaeger 'pro'; .version.yanked; go mod download", message: "Validated: EF Core namespace (raw read), jaeger-pro 404, the crates.io yanked shape, go mod download", suggestion: keep, confidence: HIGH}
  self_assessment:
    coverage: "Parts A, B and C answered; see the not-checked list"
    confidence_overall: MEDIUM
    limitations: ["web quotations came through a summarising tool, except one raw page and the 404 statuses", "35 of 35 fetches and searches used", "no header control, so crates.io saw no identifying user-agent"]
  metadata: {tokens_used: null, tool_calls: 45}
```

Files:
- `<home>/Code/ctoc/skills/ai-quality/hallucination-detector/SKILL.md`
- `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s4-skill-round1-critic-final-d-s4-skill-r1-critic.md`
- `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s4-skill-round1-revalidate-d-s4-skill-r1-revalidate.md`
- `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s4-agent-round3-session-runs.md`
- `<home>/.claude/projects/-Users-account-Code-ctoc/b1c5a29e-f445-4461-8294-b84832a0154b/tool-results/webfetch-1790790330893-6989qo.pdf` (the USENIX paper)
- `<home>/.claude/projects/-Users-account-Code-ctoc/b1c5a29e-f445-4461-8294-b84832a0154b/tool-results/webfetch-1790792186381-c1nfvx.pdf` (ENISA's final advisory, version 1.1)

Sources:
- [ConanCenter zlib config](https://raw.githubusercontent.com/conan-io/conan-center-index/master/recipes/zlib/config.yml) · [vcpkg fmt port](https://raw.githubusercontent.com/microsoft/vcpkg/master/ports/fmt/vcpkg.json)
- [OpenSSL EVP_DigestInit.pod](https://raw.githubusercontent.com/openssl/openssl/master/doc/man3/EVP_DigestInit.pod) · [OpenSSL EVP_EncryptInit.pod](https://raw.githubusercontent.com/openssl/openssl/master/doc/man3/EVP_EncryptInit.pod)
- [C++ draft: vector overview](https://eel.is/c++draft/vector.overview) · [C++ draft: alg.contains](https://eel.is/c++draft/alg.contains) · [cppreference: ranges::contains](https://en.cppreference.com/w/cpp/algorithm/ranges/contains)
- [Jackson 2.18.2 ObjectMapper Javadoc](https://javadoc.io/static/com.fasterxml.jackson.core/jackson-databind/2.18.2/com/fasterxml/jackson/databind/ObjectMapper.html) · [JsonMapper source (2.18)](https://raw.githubusercontent.com/FasterXML/jackson-databind/2.18/src/main/java/com/fasterxml/jackson/databind/json/JsonMapper.java) · [Jackson 3 migration guide](https://raw.githubusercontent.com/FasterXML/jackson/main/jackson3/MIGRATING_TO_JACKSON_3.md) · [jackson-databind README](https://raw.githubusercontent.com/FasterXML/jackson-databind/2.18/README.md)
- [javap manual (Java 21)](https://docs.oracle.com/en/java/javase/21/docs/specs/man/javap.html) · [Java Language Specification, chapter 7](https://docs.oracle.com/javase/specs/jls/se21/html/jls-7.html)
- [Stripe.net Checkout services](https://github.com/stripe/stripe-dotnet/tree/master/src/Stripe.net/Services/Checkout) · [EF Core asynchronous programming](https://learn.microsoft.com/en-us/ef/core/miscellaneous/async)
- [Go proxy: jaeger-pro](https://proxy.golang.org/go.opentelemetry.io/otel/exporters/jaeger-pro/@v/list) · [Go Modules Reference](https://go.dev/ref/mod)
- [crates.io API: serde 1.0.0](https://crates.io/api/v1/crates/serde/1.0.0) · [docs.rs about](https://docs.rs/about)
- [PGXN: pg_advanced_search](https://api.pgxn.org/dist/pg_advanced_search.json) · [PGXN: pair](https://api.pgxn.org/dist/pair.json) · [PostgreSQL Appendix F](https://www.postgresql.org/docs/current/contrib.html)
- [Typing specification: distributing type information](https://typing.python.org/en/latest/spec/distributing.html) · [react-codemod README](https://raw.githubusercontent.com/reactjs/react-codemod/master/README.md)
- [Scorecard checks documentation](https://raw.githubusercontent.com/ossf/scorecard/main/docs/checks.md) · [Scorecard public service](https://api.securityscorecards.dev/projects/github.com/ossf/scorecard)
- [OWASP Software Component Verification Standard, chapter 4](https://raw.githubusercontent.com/OWASP/Software-Component-Verification-Standard/master/en/0x13-V4-Package_Management.md) · [its chapter list](https://github.com/OWASP/Software-Component-Verification-Standard/tree/master/en) · [issue 21 (search snippet only)](https://github.com/OWASP/Software-Component-Verification-Standard/issues/21)
- [Dependency-Check README](https://raw.githubusercontent.com/dependency-check/DependencyCheck/main/README.md)
- [USENIX Security 2025, Spracklen and colleagues](https://www.usenix.org/system/files/usenixsecurity25-spracklen.pdf) · [ENISA, Secure Use of Package Managers, version 1.1](https://www.enisa.europa.eu/sites/default/files/2026-03/ENISA%20Technical%20Advisory%20-%20Package_Managers_Final.pdf)