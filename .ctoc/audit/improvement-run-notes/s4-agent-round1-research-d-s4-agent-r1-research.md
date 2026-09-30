# Research note: round 1 of 3 for the hallucination-detector agent (`d-s4-agent-r1-research`)

The file cites no paper and no statistic. But its one example of an invented package is a real package. `email-validator-pro` (line 32, "does not exist on any registry") has been on npm since 2017. The file's pip reason is stale. Its npm recipe reports "found" for names npm took back from malware, and "not found" for any network error. Its export-check recipe runs the package it is checking.

**Limits on this note:**
- Every web page came through a fetch tool that summarises. Text in quotation marks below is what that tool returned as the source's wording. Anything not in quotation marks was paraphrased by the tool, and I name it as such where it matters.
- All reads are dated 2026-09-30.
- I stopped at the coordinator's limit. Everything I did not check is listed as not checked and has no verdict.
- **Injection check:** nothing in the file under review, the paired skill, or any fetched page addressed the reviewer with an instruction. The npm placeholder text "contact support@npmjs.com" is addressed to package adopters. It is not a directive to me.

## Queries and fetches, in order

**Local reads:**
- `agents/ai-quality/hallucination-detector.md`
- `skills/ai-quality/hallucination-detector/SKILL.md`
- A search of `docs/REFINEMENT_LOOP.md` for "not running"
- `agents/ai-quality/ai-code-quality-reviewer.md` (lines 1–60)
- `agents/security/dependency-auditor.md` (lines 1–40)
- `skills/agent-fragments/honest-status.md` (lines 1–5)

**Web searches and fetches, in order:**
1. Fetched arxiv.org/abs/2406.10279
2. Fetched arxiv.org/html/2406.10279 three times (rates; definition and extraction; why import statements were not used)
3. Fetched arxiv.org/abs/2501.19012
4. Fetched arxiv.org/html/2501.19012
5. Searched "arXiv library hallucinations LLMs developer queries misspelling fake library names time-related prompts"
6. Fetched arxiv.org/abs/2509.22202
7. Fetched arxiv.org/html/2509.22202v3 twice
8. Searched "Lasso Security Bar Lanyado AI package hallucinations huggingface-cli empty package downloads research"
9. Fetched lasso.security/blog/ai-package-hallucinations
10. Fetched docs.npmjs.com/cli/v11/commands/npm-view
11. Fetched github.com/npm/registry/blob/main/docs/REGISTRY-API.md
12. Fetched registry.npmjs.org/email-validator-pro
13. Fetched pypi.org/pypi/email-validator-pro/json
14. Fetched www.npmjs.com/package/email-validator-pro
15. Fetched registry.npmjs.org/email-validator-pro/latest
16. Fetched api.npmjs.org/downloads/point/last-week/email-validator-pro
17. Fetched docs.pypi.org/api/json/
18. Fetched docs.pypi.org/api/
19. Fetched docs.pypi.org/api/index-api/
20. Fetched pip.pypa.io/en/stable/cli/pip_index/
21. Searched `"pip index is currently an experimental command" pip source index.py`
22. Fetched github.com/pypa/pip/issues/13188
23. Fetched raw.githubusercontent.com/pypa/pip/main/src/pip/_internal/commands/index.py
24. Fetched pip.pypa.io/en/stable/news/
25. Fetched crates.io/data-access
26. Searched "crates.io data access policy crawlers "1 request per second" User-Agent sparse index"
27. Fetched rust-lang.github.io/rfcs/3463-crates-io-policy-update.html
28. Fetched rust-lang.github.io/rfcs/3660-crates-io-crate-deletions.html
29. Fetched doc.rust-lang.org/cargo/reference/registry-index.html
30. Fetched crates.io/api/v1/crates/tokio_advanced
31. Fetched index.crates.io/to/ki/tokio_advanced
32. Fetched central.sonatype.org/search/rest-api-guide/
33. Fetched central.sonatype.org/register/namespace/
34. Fetched repo1.maven.org/maven2/org/apache/commons/commons-security/maven-metadata.xml
35. Fetched learn.microsoft.com/en-us/nuget/api/package-base-address-resource
36. Fetched learn.microsoft.com/en-us/nuget/nuget-org/id-prefix-reservation
37. Fetched learn.microsoft.com/en-us/nuget/nuget-org/policies/deleting-packages
38. Fetched docs.npmjs.com/policies/unpublish
39. Fetched registry.npmjs.org/crossenv
40. Fetched docs.npmjs.com/package-name-guidelines
41. Fetched docs.npmjs.com/cli/v11/configuring-npm/package-json
42. Fetched docs.npmjs.com/threats-and-mitigations
43. Fetched peps.python.org/pep-0541/
44. Searched "blog.pypi.org project quarantine malware simple index hidden uninstallable"
45. Fetched blog.pypi.org/posts/2024-12-30-quarantine/
46. Searched "PyPI warehouse typosquatting check new project name creation blocked similar to popular project"
47. Fetched blog.pypi.org/posts/2025-12-31-pypi-2025-in-review/
48. Fetched packaging.python.org/en/latest/discussions/distribution-package-vs-import-package/
49. Fetched pypi.org/pypi/sklearn/json
50. Fetched registry.npmjs.org/fs/latest
51. Fetched registry.npmjs.org/react-query
52. Fetched tanstack.com/query/latest/docs/framework/react/guides/migrating-to-react-query-4
53. Fetched tanstack.com/query/latest/docs/framework/react/reference/useQuery
54. Fetched nodejs.org/api/modules.html
55. Fetched registry.npmjs.org/bcrypt/latest
56. Fetched axios-http.com/docs/req_config
57. Fetched nodejs.org/api/fs.html
58. Fetched docs.djangoproject.com/en/stable/ref/validators/

## Sources opened (all read 2026-09-30)

| Address | Bore on | Result |
|---|---|---|
| https://arxiv.org/abs/2406.10279 | Spracklen and colleagues: abstract, versions, venue | Supported the paired skill's 16 models and 576,000 samples. Supported the file's line 78 attack premise. |
| https://arxiv.org/html/2406.10279 | Rates, repeatability, definition, how names were extracted | Supported line 78. Bore on Part B.1 and B.5. |
| https://arxiv.org/abs/2501.19012 and https://arxiv.org/html/2501.19012 | Krishna and colleagues, "Importing Phantoms" | Supported line 81 (the age check). Part B.1. |
| https://arxiv.org/abs/2509.22202 and https://arxiv.org/html/2509.22202v3 | Twist and colleagues, library hallucinations | Supported line 3 (the term "slopsquatting"). Part B.1 and B.5. |
| https://www.lasso.security/blog/ai-package-hallucinations | Lanyado, vendor research | Supported line 78. Part B.1. |
| https://docs.npmjs.com/cli/v11/commands/npm-view | What `npm view` does | Did not bear on the missing-name case. It does not document it. |
| https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md | The package endpoint | Did not bear on the missing-name case. It does not document a 404 body. |
| https://registry.npmjs.org/email-validator-pro, same `/latest` | Line 32 | **Refuted line 32.** |
| https://pypi.org/pypi/email-validator-pro/json | Line 32, Python side | Returned HTTP 404. Supports "not on PyPI" only. |
| https://www.npmjs.com/package/email-validator-pro | Line 32, second route | HTTP 403. Not read. |
| https://api.npmjs.org/downloads/point/last-week/email-validator-pro | Line 81 (download volume) | Supported that npm has a download-count source. |
| https://docs.pypi.org/api/json/ | Lines 71–74 | Documents 200 only. Documents that `downloads` is always -1. |
| https://docs.pypi.org/api/ | Line 71, "stable" | Did not support the word "stable". Documents caching and no edge rate limit. |
| https://docs.pypi.org/api/index-api/ | Name normalisation | Part B.2 and B.5. |
| https://pip.pypa.io/en/stable/cli/pip_index/ | Line 72 | No experimental warning on the current page. |
| https://github.com/pypa/pip/issues/13188 | Line 72 | Closed issue asking to drop the experimental status. |
| https://raw.githubusercontent.com/pypa/pip/main/src/pip/_internal/commands/index.py | Line 72 | The word "experimental" is absent. **Line 72 is stale.** |
| https://pip.pypa.io/en/stable/news/ | Line 72 | **Line 72 is stale** as of pip 25.1. |
| https://crates.io/data-access | crates.io policy | Page is rendered in the browser; no content reached me. |
| https://rust-lang.github.io/rfcs/3463-crates-io-policy-update.html | crates.io policy | Part B.2 and B.3. |
| https://rust-lang.github.io/rfcs/3660-crates-io-crate-deletions.html | Crate deletion | Part B.3. |
| https://doc.rust-lang.org/cargo/reference/registry-index.html | Sparse index | Part B.2. |
| https://crates.io/api/v1/crates/tokio_advanced and https://index.crates.io/to/ki/tokio_advanced | A missing crate, live | Both HTTP 404. Part B.2. |
| https://central.sonatype.org/search/rest-api-guide/ and https://central.sonatype.org/register/namespace/ | Maven Central | Part B.2 and B.3. |
| https://repo1.maven.org/maven2/org/apache/commons/commons-security/maven-metadata.xml | A missing artifact, live | HTTP 404. Part B.2. |
| https://learn.microsoft.com/en-us/nuget/api/package-base-address-resource | NuGet flat container | Part B.2. |
| https://learn.microsoft.com/en-us/nuget/nuget-org/id-prefix-reservation and https://learn.microsoft.com/en-us/nuget/nuget-org/policies/deleting-packages | NuGet policy | Part B.3. |
| https://docs.npmjs.com/policies/unpublish, https://docs.npmjs.com/package-name-guidelines, https://docs.npmjs.com/cli/v11/configuring-npm/package-json, https://docs.npmjs.com/threats-and-mitigations | npm policy | Part B.3 and B.5. |
| https://registry.npmjs.org/crossenv and https://registry.npmjs.org/fs/latest | npm placeholder names | **Refuted line 69 as an existence check.** |
| https://peps.python.org/pep-0541/, https://blog.pypi.org/posts/2024-12-30-quarantine/, https://blog.pypi.org/posts/2025-12-31-pypi-2025-in-review/ | PyPI policy | Part B.3 and B.5. |
| https://packaging.python.org/en/latest/discussions/distribution-package-vs-import-package/ and https://pypi.org/pypi/sklearn/json | Import name versus distribution name | Part B.5. |
| https://registry.npmjs.org/react-query and https://tanstack.com/query/latest/docs/framework/react/guides/migrating-to-react-query-4 | Lines 24–25 and 125 | Supported. |
| https://tanstack.com/query/latest/docs/framework/react/reference/useQuery | Line 141 | Did not bear. The fetch was inconclusive. |
| https://nodejs.org/api/modules.html | Lines 88–92 | Supported. |
| https://registry.npmjs.org/bcrypt/latest | Lines 27–28 | Supported "native". Did not bear on "needs a compiler". |
| https://axios-http.com/docs/req_config | Lines 43, 102, 128 | HTTP 301 to axios.rest, not followed. Not read. |
| https://nodejs.org/api/fs.html | Line 49 | Content truncated before `readFileSync`. Not read. |
| https://docs.djangoproject.com/en/stable/ref/validators/ | Line 55 | Supported. |

## Part A — every citation-shaped claim in the agent file

| Line | Exact text | Verdict | Source | Supporting quote | Recommended action |
|---|---|---|---|---|---|
| 3 | "slopsquatting" (trigger term) | VALIDATED | arxiv.org/abs/2509.22202 | "expose systems to supply chain threats such as slopsquatting" | keep |
| 24 | "the name still installs" (`react-query`) | VALIDATED | registry.npmjs.org/react-query | dist-tags "latest: 3.39.3" | keep |
| 25, 125 | "Renamed to @tanstack/react-query at v4" | VALIDATED | tanstack.com migrating-to-react-query-4 | "react-query is now @tanstack/react-query" | keep |
| 27 | "hashSync exists" (bcrypt) | NOT CHECKED | — | — | — |
| 27–28 | "bcrypt is a native module that needs a compiler" | "Native" VALIDATED; "needs a compiler" UNSOURCEABLE | registry.npmjs.org/bcrypt/latest | version "6.0.0"; install script "node-gyp-build"; dependencies "node-addon-api", "node-gyp-build". The readme was not in the response, so there is nothing on prebuilt binaries either way. | Correct to: "bcrypt is a native add-on (its install step is node-gyp-build); use bcryptjs where a native add-on cannot be loaded." Strip "needs a compiler" until the README is read. |
| 28, 126 | "use bcryptjs where native builds aren't available" | NOT CHECKED | — | — | — |
| 31–32 | "`email-validator-pro`" — "Made-up package that does not exist on any registry" | **REFUTED** | registry.npmjs.org/email-validator-pro (and `/latest`); PyPI JSON returned 404 | "name": "email-validator-pro", latest "1.0.1", created "2017-05-18T04:34:21.018Z", description "Validate email address patterns that others don't." Last week's npm downloads: 5. | Replace it with a name checked as 404 on the named registry on the day of writing, and record the date and the response next to it. Or strip the claim "does not exist on any registry". This example is the file's own trap: a name that looks invented, and resolves. The paired skill repeats the error at its line 84 ("npm: not found"). |
| 43, 111, 128 | axios GET "doesn't have body, use params"; `axios.post` "use data, not body" | NOT CHECKED | The fetch redirected and was not followed | — | — |
| 46, 110, 133, 168 | "formatISO is date-fns, not moment"; "moment().toISOString()" | NOT CHECKED | — | — | — |
| 49, 141 | `fs.readFileSync(path, { throwOnError: true })` "No such option" | NOT CHECKED | nodejs.org/api/fs.html was truncated | — | — |
| 55, 113 | `django.core.validators.validate_strong_password` "Doesn't exist" | VALIDATED | docs.djangoproject.com/en/stable/ref/validators/ (Django 6.1) | The documented validators run from `RegexValidator` to `StepValueValidator`; `validate_strong_password` is absent. | keep |
| 58 | FastAPI `auto_validate=True` "No such parameter" | NOT CHECKED | — | — | — |
| 61, 112 | `useAutoFetch` "Not a standard hook" | NOT CHECKED | — | — | — |
| 68–69 | `npm view package-name version 2>/dev/null \|\| echo "NOT FOUND"` described as "Check if package exists" | **REFUTED as an existence check** | registry.npmjs.org/fs/latest; registry.npmjs.org/crossenv | `fs` gives version "0.0.1-security", described as: "This package name is not currently in use, but was formerly occupied by another package. To avoid malicious use, npm is hanging on to the package name". `crossenv` latest is "0.0.2-security", description "security holding package". The recipe prints a version for these, so it reports them as found. The `2>/dev/null \|\| echo` construction also turns every error into "NOT FOUND" (my reading of the command, not a fetched source). | Correct to: query `https://registry.npmjs.org/<name>`. Treat a `-security` version or the "security holding package" description as "held by npm", not "exists". Report an error that is not a 404 as "could not look", never as "not found". |
| 71 | "the stable PyPI JSON API" | UNSOURCEABLE (the word "stable") | docs.pypi.org/api/ | The page only marks XML-RPC: "No new integrations should use the XML-RPC APIs as they are planned for deprecation." It recommends "Query PyPI's Index API or JSON API to determine where to download files from." | Correct to "the documented PyPI JSON API". |
| 71, 74 | "200 = exists, 404 = does not" | VALIDATED as observed behaviour; the 404 is undocumented | pypi.org/pypi/email-validator-pro/json; docs.pypi.org/api/json/ | Live response "HTTP 404 Not Found". The documentation lists only "200 OK - no error". | Keep, and add: a 404 can also be a removed project whose name PyPI now prohibits ("removals are pretty much coupled with prohibiting the Project name from being reused", blog.pypi.org quarantine post). `curl -sf` also turns network failures into "NOT FOUND". |
| 72–73 | `pip index versions`, "which pip flags as experimental and may remove without warning" | **STALE** | pip.pypa.io/en/stable/news/; pip's `index.py` on main | pip 25.1 (2025-04-26): "Remove `experimental` warning from `pip index versions` command." and "Add a structured `--json` output to `pip index versions`". The source file contains no "experimental". | Correct to: "`pip index versions` has not been experimental since pip 25.1 and has `--json`; the JSON API is still preferred because it needs no local pip." |
| 78–80 | "an attacker may have pre-registered the exact name a model tends to invent" | VALIDATED | arxiv.org/html/2406.10279; lasso.security blog | "An adversary can exploit package hallucinations, especially if they are repeated, by publishing a package … with the same name as the hallucinated … package"; "43% of hallucinated packages were repeated in all 10 queries"; the empty huggingface-cli package got "more than 30k authentic downloads" | keep |
| 81–83 | "check the package's age, download volume, repository link, and maintainer" | Age VALIDATED as a criterion. Download volume cannot be read from PyPI's JSON API. | arxiv.org/html/2501.19012; docs.pypi.org/api/json/; api.npmjs.org | A package counts as hallucinated if it "was first registered after the model's knowledge cutoff date". PyPI's `downloads` "is always `-1` and should not be used". npm's downloads endpoint returned a count. | Keep the age check. Name the npm downloads endpoint. Say that PyPI offers no download count through its JSON API. |
| 88–90 | "Older Node (before 20.19 / 22.12) throws ERR_REQUIRE_ESM for any ESM-only package" | Version boundary VALIDATED; the error-code name NOT CHECKED | nodejs.org/api/modules.html | Require of ECMAScript modules is "no longer behind the `--experimental-require-module` CLI flag" as of "v23.0.0, v22.12.0, v20.19.0" | Keep the boundary. The error code was not quoted by the fetch. |
| 90–92 | require of an ECMAScript module "throws ERR_REQUIRE_ASYNC_MODULE when the module (or its import graph) uses top-level await" | VALIDATED | nodejs.org/api/modules.html | "If the module being `require()`'d contains top-level `await`, or the module graph it `import`s contains top-level `await`, `ERR_REQUIRE_ASYNC_MODULE` will be thrown" | keep |
| 92–93 | "Dynamic import() loads both CommonJS and ESM in every case" | NOT CHECKED ("in every case") | nodejs.org/api/modules.html only recommends `import()` for the top-level-await case | — | — |
| 94 | `const pkg = await import('package-name')` as the export check | Not a citation. **Recipe safety finding, see Part B.2.** | — | — | Make "read the package's `exports`/`types` entry" (already on line 93) the only method. Delete the executing recipe. |
| 102 | "AxiosRequestConfig has no `body` field for any method — the payload goes in `data`" | NOT CHECKED | — | — | — |
| 127 | `node-fetch` (modern Node) → global `fetch` | NOT CHECKED | — | — | — |
| 134 | `lodash.deepClone()` → `lodash.cloneDeep()` | NOT CHECKED | — | — | — |
| 135 | "`Array.flatMap()` polyfill — Built-in since ES2019" | NOT CHECKED | — | — | Unchecked wording note: the real method is on the array prototype, so "`Array.flatMap()`" names a static method. |
| 136 | `React.useAutoEffect()` "Doesn't exist" | NOT CHECKED | — | — | — |
| 141 | `{ throwOnError: true }` "Usually not a real option" | NOT CHECKED | The TanStack useQuery reference fetch was inconclusive | — | Open lead, believed and not verified: TanStack Query, which this file recommends, may have an option of that name. Check next round before keeping this row. |
| 142 | `{ autoValidate: true }` "Made up" | NOT CHECKED. As written, the claim cannot be sourced: it is a negative across every library. | — | — | Scope it to one named library, or strip it. |
| 186–189 | Report-template counts 45 / 3 / 128 / 5 | Not a claim (illustrative figures) | — | — | Unsourced advice: replace with placeholders so they are never copied into a real report as data. |
| 209 | `skills/agent-fragments/honest-status.md` | VALIDATED (local read) | Repository file | "# HONEST STATUS — assert only what you verified" | keep |

**Things in the file that are not citations but are wrong, recorded because I read them:**
- **Line 109:** the pattern `/from 'react-query'$/` does not match an import line ending in `;`.
- **Line 110:** `/\.formatISO\(/` also matches correct date-fns calls such as `dateFns.formatISO(`.
- **Line 61:** JavaScript with a `#` comment inside a block fenced as Python.

## Part B — fresh research

### B.1 The papers that measured invented package names

**Spracklen and colleagues**, "We Have a Package for You!" (arXiv 2406.10279, version 3 of 2 March 2025, "To appear in the 2025 USENIX Security Symposium").

What was measured:
- Scope: "16 popular LLMs … we generate 576,000 code samples in two programming languages" (Python and JavaScript).
- Rate by model type: "at least 5.2% for commercial models and 21.7% for open-source models".
- Overall rate: "19.7% of the generated packages" were invented.
- Lowest rate: "GPT-4 Turbo resulted in the lowest overall hallucination rate at 3.59%".
- Best open-source model: "DeepSeek 1B had the best hallucination rate among open-source models at 13.63%".
- By language: "Python code resulted in fewer hallucinations than JavaScript (15.8% on average compared to 21.3% for JavaScript)".
- Distinct names: "205,474 unique non-existent packages".

Repeatability:
- "43% of hallucinated packages were repeated in all 10 queries, while 39% did not repeat at all".
- "58% of the time, a hallucinated package is repeated more than once in 10 iterations."

Other findings:
- Cross-registry: "8.7% (6,705/76,489) of hallucinated Python packages are valid JavaScript packages."
- Deleted packages: "Only 133 (0.17%)" of invented names were previously deleted packages.
- Name similarity: "Only 13.4% … have a Levenshtein distance of 1 or 2"; "48.6% … scored 6 or higher". So most invented names are not typos of real ones.
- Recency: "higher hallucination rate when being prompted about questions or packages that were popular within the past year".

Method:
- Ground truth: master lists from PyPI and npm "as of 10 January, 2024". "If a package name is not on the master list, it is considered a hallucination."
- Extraction: names came from "'pip install' and 'npm install' commands", plus asking the model. They were **not** taken from import statements: "There is no way to definitively determine the required packages from a code snippet alone."

Mitigation: the fetch tool gave only fragments, for example fine-tuning "83%" for DeepSeek. Treat the mitigation figures as not verified.

**Krishna, Galinkin, Derczynski and Martin**, "Importing Phantoms" (arXiv 2501.19012, 31 January 2025):
- Scope: "JavaScript, Python, and Rust" against "PyPI for Python, NPM for JavaScript, and crates.io for Rust", as of 30 January 2025. Eleven models, orchestrated with the garak framework.
- JavaScript: "lowest hallucination rate overall (μ=14.73%)".
- Python: "μ=23.14%", worst model "46.15%".
- Rust: "μ=24.74%".
- Model size: "strong inverse correlation between model size and hallucination rates (ρ=−0.593, p=0.00028)". Coding benchmark: an inverse correlation with HumanEval (ρ=−0.7887).
- Specialisation: "Code-specialized models averaged an PHR of 30.22% compared to 14.64% for general-purpose models" (Python).
- Definition: a name counts as invented if it is not registered, **or** if it "was first registered after the model's knowledge cutoff date".

**Twist, Harman, Yannakoudakis and Zhang** (arXiv 2509.22202, version 4 of 21 August 2026, "Accepted to Proceedings of EMNLP 2026"):
- Seven models: "GPT-4o-mini, GPT-5-mini, Ministral-8B, Qwen2.5-Coder, Llama-3.3, DeepSeek-V3.1 and Claude-4.5-Haiku". Python only.
- Library names were checked against PyPI with "package name normalisation". Members (methods) were checked against "the official documentation for each ground-truth library", not by installing anything.
- With no user error in the prompt: library-name hallucination "0.00% to 0.10%"; member hallucination "1.97% to 6.02%".
- Prompt-induced: "one-character misspellings trigger hallucinations in up to 26% of tasks; fabricated library names are accepted in up to 99%; and time-based prompts induce hallucinations in up to 85%". A search-result snippet, apparently from an earlier version, said 84%. I did not fetch that version.

**Lanyado, Lasso Security** (vendor research blog, 28 March 2024):
- "47,803 of 'how to questions'" across Python, Node.js, Go, .NET and Ruby.
- "215 hallucinated packages" appeared across more than one model.
- The empty huggingface-cli package received "more than 30k authentic downloads". The fetch tool paraphrased the period as three months.
- The fetch tool also gave per-model rates (GPT-4 24.2%, GPT-3.5 22.2%, Gemini 64.5%, Cohere 29.1%) outside quotation marks. Treat those as not verified.

**Against the file:** the agent file cites none of these papers and states no statistic, so nothing to match.

**Against the paired skill** (consistency only):
- Its line 44, "576,000 code samples across 16 LLMs … about 5% … about 22%", matches Spracklen within rounding.
- Its "Attackers register the most-hallucinated names … within hours" is not in the paper, whose threat model says "can exploit". It is unsourced.

### B.2 How each registry answers for a missing name, and the safe way to ask

**npm**
- Endpoint: `GET https://registry.npmjs.org/<name>` (REGISTRY-API.md: "the package metadata document, sometimes informally called a 'packument'"). Neither that page nor the `npm view` page documents the missing-name response.
- Live: a name that exists returns metadata. A name npm has taken back returns a placeholder version (`0.0.1-security` for `fs`, `0.0.2-security` for `crossenv`) with the "security holding package" text.
- Download counts: `https://api.npmjs.org/downloads/point/last-week/<name>`.
- `npm view` only prints registry data. It installs nothing.
- How scoped names must be encoded in the URL is not in the fetched page. Not checked.

**PyPI**
- JSON API: `GET https://pypi.org/pypi/<project>/json`. The documentation lists only "200 OK - no error". A 404 was observed live.
- Index API: `GET /simple/<project>/` with `Accept: application/vnd.pypi.simple.v1+json`. "The project is matched case-insensitively with the `_`, `-` and `.` characters considered equal."
- "All API requests are cached", and "there is currently no rate limiting of PyPI APIs at the edge".
- `pip index versions <pkg>` installs nothing. It is not experimental since 25.1, has `--json`, and on a miss raises "No matching distribution found for {query}".

**crates.io**
- Sparse index: "For crates that do not exist, the registry should respond with a 404 "Not Found", 410 "Gone" or 451 "Unavailable For Legal Reasons" code". The path is computed from the lowercased name, for example `ca/rg/cargo`. Live: `index.crates.io/to/ki/tokio_advanced` returned 404.
- Web API: `https://crates.io/api/v1/crates/<name>` also returned 404 live.
- The web API requires "a maximum of 1 request per second" and "a user-agent header that allows us to uniquely identify your application" (policy RFC 3463).
- `cargo search`, which the skill uses: not checked.

**Maven Central**
- Repository path: `https://repo1.maven.org/maven2/<group-path>/<artifact>/maven-metadata.xml`. Live: 404 for `org.apache.commons:commons-security`.
- Search: `https://search.maven.org/solrsearch/select?q=g:<g>+AND+a:<a>&core=gav&rows=20&wt=json`; the hit count is `numFound`.

**NuGet**
- `GET {@id}/{LOWER_ID}/index.json`, where the base address must be read from the service index. "If the package source has no versions of the provided package ID, a 404 status code is returned."
- The version list "contains both listed and unlisted package versions".
- Not tested live.

**Recipes that install or execute the package being checked:**
- **Agent line 94** (`await import('package-name')`). Loading a module runs its top-level code. That is language semantics; no page was fetched on it this round. The recipe also needs the package installed first. The paired skill's own rule (skill line 395) names installing an unverified name "exactly the slopsquatting attack path".
- **Agent lines 69 and 74** neither install nor execute.
- **The paired skill** (consistency only, judged by how each command works, not by fetched sources):
  - Runs the package: line 119, `python -c "import …"`; line 246, `require('package-name')`; line 253, `importlib.import_module`.
  - Installs: line 138, `dotnet add package`; lines 280–281, `npm ci` and `pip install -r requirements.txt` in its gate.
  - Downloads but does not run: line 154, `mvn dependency:resolve`; line 175, `go mod download`.

### B.3 Registry policy on squatting, typosquatting and reserved names

**npm**
- Unpublish policy: "If you entirely unpublish all versions of a package, you may not publish any new versions of that package until 24 hours have passed." Whether another user may then take the name is not stated.
- Name guidelines: an unscoped name must be one that "Is not spelled in a similar way to another package name".
- Threats page: "npm is able to detect typosquat attacks and block the publishing of these packages". It also names the private-package variant: "A variant of this attack is when a public package is registered with the same name of a private package that an organization is using."
- Placeholder text on held names: "we'll probably give it to you if you want it". A held name can change hands.

**PyPI**
- PEP 541 lists as invalid a project that "is name squatting (package has no functionality or is empty)", and one that "is malware".
- Quarantine post: quarantined projects are "not installable (hidden from simple index)". "removals are pretty much coupled with prohibiting the Project name from being reused".
- 2025 review: "PyPI now automatically detects and flags potential typosquatting attempts during project creation."

**crates.io**
- RFC 3463: "crates.io has a first-come, first-serve policy on crate names". It prohibits a crate that "exists only to reserve a name for a prolonged period of time (often called 'name squatting')".
- RFC 3660 allows owners to delete a crate "published for less than 72 hours", or one downloaded "less than 100 times for each month" with a single owner and no dependents. Whether the name can then be reused is left unresolved.

**Maven Central**
- The namespace (groupId) is verified by a DNS TXT record or a temporary public repository on a code host. Established groupIds cannot be claimed by an attacker. The exposure is in invented groupIds that anyone could verify.

**NuGet**
- Under a reserved prefix, a package "is rejected unless it originates from the owner(s) that reserved the ID prefix".
- "nuget.org does not support permanent deletion of packages". Unlisted packages "can still be downloaded and installed by using an exact version number".
- Packages "used to squat on package identifiers, including packages that have zero productive content" are removed.

### B.4 Orders the tools cannot carry out, and claims that a mechanism runs

The tools line is `Read, Grep, Bash`.

- **Line 94** can run through Bash only if the package is already installed. Otherwise it needs an install, which is the attack path. It is not impossible; it must not be done.
- **Line 81, download volume:** cannot be done for PyPI through the documented JSON API, whose field is always -1.
- **Line 101, "Compare against actual type definitions":** works through Read only when the declaration files are present locally. The file does not say what to do when they are not.
- **Refinement loop:** the agent file (all 209 lines read) never mentions it, so it makes no false claim of its own. But:
  - The skill it wraps writes in the present tense: "When emitting a finding via the refinement loop … every finding becomes `severity: critical`", and has a "Refinement Loop — critic mode" section.
  - `docs/REFINEMENT_LOOP.md` line 8 says "the loop is **NOT RUNNING** today".
  - The sibling `ai-code-quality-reviewer.md` (its line 25) explicitly fences this. This file has no such fence. It also never tells the agent to read the skill, or which of the skill's orders it cannot perform.

### B.5 Failure classes the file does not cover

1. **The import name is not the distribution name.** PyPA: "PyPI and other package indices do not enforce any relationship between the name of a distribution package and the import packages it provides." Checking an import name gives a false "not found", or hits a placeholder.
2. **A placeholder held by the registry or the maintainers answers 200.**
   - npm security holding packages, quoted in Part A (line 69).
   - PyPI `sklearn` (version "0.0.post12", summary "deprecated sklearn package, use scikit-learn instead") "exists to prevent malicious actors from using the `sklearn` package".
3. **A 404 is not "never existed", and a 200 is not "the same owner the model learned".** PyPI prohibits the names of removed malware. npm reopens an unpublished name after 24 hours. crates.io leaves name reuse after deletion unresolved. NuGet never deletes; unlisted versions still resolve.
4. **The wrong registry.** Spracklen: "8.7% … of hallucinated Python packages are valid JavaScript packages". A check against the wrong ecosystem reports a false "found".
5. **Names spelled differently that are the same project.** PyPI treats `_`, `-` and `.` as equal and ignores case. The crates.io index path is lowercased. NuGet ids are lowercased. The file does no normalisation before comparing.
6. **Registered after the model's training cutoff.** Krishna counts these as invented. Spracklen measured higher rates for recently popular packages. Twist measured up to 85% invention with "time-based prompts". The file says "age" but gives no cutoff rule.
7. **A private package name.** npm names the private-name variant (B.3). A name absent from the public registry may be an internal package. Reporting it as invented, and letting someone register it publicly, is the dependency-confusion attack.
8. **"Could not look" reported as "not found".** Both recipes (lines 69 and 74) turn network failures, authentication errors and rate limiting into "NOT FOUND". crates.io requires a User-Agent header and one request per second, so a bare `curl` can fail without the crate being absent.
9. **Invented methods are more common than invented package names.** Twist measured 1.97–6.02% member hallucination against 0.00–0.10% name hallucination under neutral prompts. Misspelled or fabricated names in the prompt are accepted in up to 26% and up to 99% of tasks. The file's weight is on package names, and it gives the prompt no role.
10. **Untrusted names passed into Bash.** npm names must be at most 214 characters and "can't contain any non-URL-safe characters". PyPI and crates.io have similar rules, not fetched this round. The file never says to check a name against the registry's rules before putting it in a shell command. This follows from how the recipe works; no source was fetched on this attack.
11. **Cached answers.** PyPI: "All API requests are cached". A name registered minutes ago may still read as 404.

## Counts

| Category | Count | Rows |
|---|---|---|
| Claims given a verdict | 14 | — |
| Validated | 9 | Lines 3, 24, 25/125, 55, 71/74 (behaviour), 78–80, 81–83 (age), 88–90 (version boundary), 90–92, and 209 |
| Refuted | 2 | Line 32 (`email-validator-pro`); lines 68–69 (`npm view` as an existence check) |
| Unsourceable | 2 | Line 28 ("needs a compiler"); line 71 ("stable") |
| Stale | 1 | Lines 72–73 (pip experimental) |
| Misattributed | 0 | — |
| Not checked (no verdict) | 18 | Lines 27 (`hashSync`), 28/126 (`bcryptjs`), 43/111/128 (axios), 46/110/133/168 (moment and date-fns), 49/141 (`readFileSync`), 58 (FastAPI), 61/112 (`useAutoFetch`), 92–93 ("in every case"), 102 (axios types), 127 (`node-fetch` and global `fetch`), 134 (lodash), 135 (`flatMap`), 136 (`React.useAutoEffect`), 141 (`throwOnError`), 142 (`autoValidate`), and the `ERR_REQUIRE_ESM` code name on lines 88–90 |

Line 209 is the local-read validation included among the nine.

## What I could not fetch or verify

**Pages not read:**
- axios request configuration: 301 to axios.rest, not followed.
- Node `fs` documentation: truncated before `readFileSync`.
- npmjs.com package page: HTTP 403.
- crates.io data-access page: rendered in the browser, no content.
- The bcrypt README: only package.json came back, so nothing on prebuilt binaries.
- The TanStack useQuery reference: inconclusive on `throwOnError`.

**Not attempted:** moment, date-fns, lodash, React, FastAPI, MDN (for `flatMap` and global `fetch`), `cargo search` behaviour, npm's encoding for scoped names, Go's module proxy, and a live NuGet 404.

**Figures the fetch tool paraphrased rather than quoted**, all to verify next round:
- Spracklen's mitigation figures.
- Lasso's per-model rates and repetition rates.
- Whether PyPI's JSON API returns 404 for a removed and prohibited name. That is inferred from the quarantine post, not observed.