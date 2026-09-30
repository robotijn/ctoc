# Research note: citations in `skills/ai-quality/hallucination-detector/SKILL.md`, round 1 (research papers, registry and vendor documentation)

**Result.** I gave a verdict on 64 of the 102 claims I listed: 39 validated, 10 refuted, 6 unsourceable, 4 misattributed, 5 stale. Five more are supported only by search-result snippets, two are half-checked, and 31 were not checked. There are three errors that could mislead a reader:

- **Three packages the file calls non-existent do exist.**
  - `email-validator-pro` has been on the npm registry since 2017-05-18.
  - `serde_json_ext` has been on crates.io since 2026-01-28.
  - `commons-security` exists on Maven Central under three unrelated group ids.
- **The recommended pre-merge gate (lines 280–281) runs `npm ci` and `pip install` before the hallucinated-name check.** Both vendors document that this runs the package's own code.
- **Several signature checks can never fail.** nuget.org signs every package automatically, and Maven Central requires a signature file on every artifact. Checking only that a signature exists therefore tells you nothing about whether the name is legitimate.

**Limits of this note.**
- Web pages came back through the fetch tool's summariser, so their "verbatim" quotes are its rendering. The two paper PDFs (Spracklen; Churilov) I read directly as page images.
- Registry answers (200 / 404) are the raw HTTP status.
- I ran no code.
- No fetched page or file line addressed the reviewer with instructions, so there is no injection finding.
- All reads are dated 2026-09-30.

## Queries and fetches, in order

1. Fetch arxiv.org/abs/2406.10279
2. Search: "We Have a Package for You" Spracklen USENIX Security 2025 package hallucinations
3. Search: "Importing Phantoms" measuring LLM package hallucination vulnerabilities arXiv
4. Fetch usenix.org/system/files/usenixsecurity25-spracklen.pdf (read pages 1–15)
5. Fetch arxiv.org/abs/2501.19012
6. Fetch arxiv.org/abs/2605.17062
7. Fetch arxiv.org/abs/2509.22202
8. Fetch arxiv.org/html/2501.19012v1
9. Fetch arxiv.org/html/2605.17062 — 404
10. Fetch arxiv.org/html/2605.17062v3 — 404
11. Fetch arxiv.org/html/2509.22202v4
12. Fetch arxiv.org/pdf/2605.17062 (read pages 1–6)
13. Fetch docs.npmjs.com/cli/v10/commands/npm-view
14. Fetch docs.npmjs.com/cli/v11/commands/npm-view
15. Fetch pip.pypa.io/en/stable/cli/pip_index/
16. Fetch docs.pypi.org/api/json/
17. Fetch the same pip_index page again, to look for any warning box
18. Search: pip index versions experimental command "may be removed" pip changelog
19. Fetch docs.pypi.org/api/integrity/
20. Fetch pip.pypa.io/en/stable/news/
21. Search: npm CLI changelog "npm ERR!" replaced "npm error" log prefix version
22. Fetch docs.pypi.org/trusted-publishers/
23. Fetch docs.pypi.org/attestations/
24. Fetch github.com/npm/cli/blob/latest/CHANGELOG.md — truncated, no content
25. Search: "npm error code E404" "npm error 404 Not Found - GET https://registry.npmjs.org/"
26. Fetch the raw npm/cli changelogs/CHANGELOG-10.md — 404
27. Fetch github.com/npm/cli/issues/8736
28. Fetch github.com/npm/cli/releases/tag/v10.0.0
29. Fetch npm/registry docs/REGISTRY-API.md
30. Fetch docs.npmjs.com/verifying-registry-signatures
31. Fetch docs.npmjs.com/generating-provenance-statements
32. Fetch npm/registry docs/responses/package-metadata.md
33. Fetch docs.npmjs.com/cli/v11/commands/npm-install
34. Fetch docs.npmjs.com/cli/v11/commands/npm-ci
35. Fetch docs.npmjs.com/cli/v11/using-npm/scripts
36. Fetch pip.pypa.io/en/stable/topics/secure-installs/
37. Fetch learn.microsoft.com, the page for `dotnet package search`
38. Fetch the page for `dotnet nuget verify`
39. Fetch the page for error NU1101
40. Fetch the NuGet package-base-address (flat container) page
41. Fetch the NuGet signed-packages reference
42. Fetch the NuGet package id prefix reservation page
43. Fetch the `dotnet add package` page (it redirected to `dotnet package add`)
44. Fetch the `nuget search` reference (nuget.exe)
45. Fetch central.sonatype.org/publish/requirements/gpg/
46. Fetch central.sonatype.org/register/namespace/
47. Fetch central.sonatype.org/search/rest-api-guide/
48. Fetch the maven-dependency-plugin resolve page
49. Fetch go.dev/ref/mod — truncated
50. Fetch proxy.golang.org
51. Fetch go.dev/ref/mod#checksum-database — truncated
52. Fetch go.dev/blog/module-mirror-launch
53. Fetch the raw golang/website mod.md — truncated
54. Search: go.dev ref mod GOPROXY protocol "404 (Not Found) or 410 (Gone)" fall back
55. Fetch pkg.go.dev/about
56. Fetch the cargo-search page
57. Fetch the cargo-info page
58. Fetch crates.io/data-access — script shell only, no content
59. Search: crates.io data access policy "User-Agent" "1 request per second"
60. Fetch rust-lang.org/policies/crates-io/ — 404
61. Fetch Rust RFC 3463 (crates.io policy update)
62. Fetch docs.rs crates_io_api SyncClient
63. Fetch the Cargo book registry-index page
64. Fetch the Cargo book features page
65. Search: cargo info command stabilized Cargo 1.82 changelog
66. Fetch docs.rs, the tokio feature list
67. Fetch docs.rs/reqwest
68. Fetch the Rust 1.82.0 announcement
69. Fetch the PostgreSQL index types page
70. Fetch the pgcrypto page
71. Fetch the pg_available_extensions page
72. Fetch the pg_am page
73. Fetch github.com/pgvector/pgvector
74. Fetch the psql page
75. Fetch TanStack "migrating to React Query 4"
76. Fetch reactrouter.com, upgrading from v5
77. Fetch zod.dev/packages/zod
78. Fetch npmjs.com/package/react-query — 403
79. Fetch registry.npmjs.org/react-smart-cache — 404
80. Fetch registry.npmjs.org/email-validator-pro — 200
81. Fetch registry.npmjs.org/react-codeshift — 200
82. Fetch registry.npmjs.org/react-query/latest
83. Fetch pypi.org/pypi/huggingface-cli/json — 404
84. Fetch pypi.org/pypi/email-validator-pro/json — 404
85. Fetch pypi.org/pypi/django-security-audit/json — 404
86. Fetch pypi.org/pypi/huggingface_hub/json
87. Fetch huggingface.co/docs/huggingface_hub/guides/cli
88. Search: Lasso Security Bar Lanyado huggingface-cli empty package
89. Fetch lasso.security/blog/ai-package-hallucinations
90. Fetch theregister.com 2024/03/28 ai_bots_hallucinate_software_packages
91. Fetch api.nuget.org/v3-flatcontainer/newtonsoftex.advancedjson/index.json — 404
92. Fetch search.maven.org, query `a:commons-security`
93. Fetch search.maven.org, query `a:spring-boot-starter-security-advanced`
94. Fetch search.maven.org, query `fc:org.apache.commons.security.PasswordValidator`
95. Fetch proxy.golang.org/github.com/uber-go/cachepro/@v/list — 404
96. Fetch proxy.golang.org/github.com/aws/aws-sdk-go-v2/secrets/@v/list — 404
97. Fetch index.crates.io/to/ki/tokio_advanced — 404
98. Fetch index.crates.io/se/rd/serde_json_ext — 200
99. Search: Veracode 2025 GenAI Code Security Report 45% …
100. Search: REFIND SemEval-2025 … ; MetaRAG metamorphic testing …
101. Search: socket CLI "socket ci" alias "socket scan create --report"
102. Search: DepScope hallucinations dataset slopcheck …
103. Search: deterministic AST analysis detecting hallucinations LLM-generated code 100% precision arXiv

## Sources opened (all read 2026-09-30)

**Research papers**

| Address | Bore on | Result |
|---|---|---|
| usenix.org/system/files/usenixsecurity25-spracklen.pdf | Line 44 statistics; research question 1 | SUPPORTED the numbers. REFUTED "frontier" (the commercial models were GPT-3.5, GPT-4 and GPT-4 Turbo). Does NOT support "register … within hours". |
| arxiv.org/abs/2406.10279 | Authors, venue, versions | SUPPORTED |
| arxiv.org/abs/2501.19012 and html v1 | Research question 1 (Krishna et al.) | New fact, no file claim |
| arxiv.org/abs/2605.17062 and pdf | Whether the 5–22% range is still current | Makes line 44's 22% STALE for current open-weight models |
| arxiv.org/abs/2509.22202 and html v4 | Research question 1 (Twist et al.) | New fact |

**npm**

| Address | Bore on | Result |
|---|---|---|
| docs.npmjs.com/cli/v10/commands/npm-view | Line 421 reference | Live, but labelled "10.9.9 (Legacy)" — STALE |
| docs.npmjs.com/cli/v11/commands/npm-view | Lines 46, 95–98 | SUPPORTED the command; REFUTED the dist-tags→exports recipe |
| github.com/npm/cli/issues/8736 | Line 96 | Shows npm 11.6.2 printing `npm error code E404` — STALE |
| github.com/npm/cli/releases/tag/v10.0.0 | When the error prefix changed | Did not bear |
| npm/registry REGISTRY-API.md | "first published before cutoff" check | SUPPORTED: `time` holds created and modified |
| npm/registry package-metadata.md | Lines 227, 294 `.dist.attestations` | Not among the documented `dist` fields — UNSOURCEABLE |
| docs.npmjs.com/verifying-registry-signatures | Provenance recipe | New: `npm audit signatures` (npm 8.15.0 or later) |
| docs.npmjs.com/generating-provenance-statements | Line 53 | SUPPORTED: GitHub Actions and GitLab, Sigstore; verify with `npm audit signatures` |
| docs.npmjs.com npm-install, npm-ci, using-npm/scripts | Lines 280–281 | `npm ci` runs preinstall, install and postinstall — the gate is unsafe |

**Python Package Index and pip**

| Address | Bore on | Result |
|---|---|---|
| pip.pypa.io …/cli/pip_index/ and …/news/ | Lines 47, 118 | SUPPORTED. Version 25.1 (2025-04-26): "Remove `experimental` warning from `pip index versions` command" |
| pip.pypa.io …/topics/secure-installs/ | Line 281 | "involves running arbitrary code from distributions" |
| docs.pypi.org/api/json/ | Existence endpoint | Endpoint SUPPORTED; the page does not document the 404 |
| docs.pypi.org/api/integrity/ | Line 230 | SUPPORTED: path, 404 when there is no provenance |
| docs.pypi.org/trusted-publishers/ and /attestations/ | Lines 47, 53 | Trusted Publishing is short-lived upload tokens over OpenID Connect; attestations are PEP 740. The file conflates them — MISATTRIBUTED |
| pypi.org/pypi/{huggingface-cli, email-validator-pro, django-security-audit}/json | Lines 105–107 | All 404 |
| pypi.org/pypi/huggingface_hub/json | Line 311 | Version 2.0.0 has no `cli` extra — STALE |
| huggingface.co/docs/huggingface_hub/guides/cli | Line 311 | Install `huggingface_hub`; the command is `hf` |

**NuGet and .NET**

| Address | Bore on | Result |
|---|---|---|
| learn.microsoft.com, `dotnet package search` | Line 137 | SUPPORTED (.NET 8.0.2xx and later); `--exact-match` exists |
| learn.microsoft.com, `dotnet nuget verify` | Lines 140, 234 | SUPPORTED (.NET 6 and later) |
| learn.microsoft.com, NU1101 | Line 138 | SUPPORTED |
| learn.microsoft.com, `dotnet package add` | Line 138 | Adds the reference and runs restore, so it is an install; renamed in .NET 10 |
| learn.microsoft.com, `nuget search` | Line 67 | nuget.exe 5.8 and later; searches names, tags and descriptions |
| learn.microsoft.com, flat container | Existence endpoint | 404 when the package has no versions |
| learn.microsoft.com, signed packages | Line 49 | "all packages uploaded to nuget.org are automatically repository signed" |
| learn.microsoft.com, id prefix reservation | Registry policy | New fact |
| api.nuget.org …/newtonsoftex.advancedjson/index.json | Line 127 | 404 — SUPPORTED |

**Maven Central**

| Address | Bore on | Result |
|---|---|---|
| central.sonatype.org …/requirements/gpg/ | Lines 48, 156, 232 | Signing is required for all files, so `.asc` exists everywhere |
| central.sonatype.org …/register/namespace/ | Registry policy | DNS text record or code-host verification |
| central.sonatype.org …/rest-api-guide/ | Search recipes | `g:`, `a:`, `fc:` queries |
| maven-dependency-plugin resolve page | Line 154 | "Requires a Maven project"; version 3.11.0 |
| search.maven.org `a:commons-security` | Line 147 | numFound 3 — REFUTED as worded |
| search.maven.org `a:spring-boot-starter-security-advanced` | Line 148 | 0 — SUPPORTED |
| search.maven.org `fc:org.apache.commons.security.PasswordValidator` | Line 147 | 0 — the class is not found |

**Go**

| Address | Bore on | Result |
|---|---|---|
| go.dev/ref/mod (truncated) | Lines 174–175 | `go list -m` lists modules; `go mod download` without a version selects dependencies of the main module |
| proxy.golang.org | Line 53 | sum.golang.org is "an auditable checksum database … used by the go command to authenticate modules" |
| go.dev/blog/module-mirror-launch | Line 53 | The checksum database guarantees the same code for everyone, not that the code is safe |
| pkg.go.dev/about | Line 176; registry policy | Modules are added on request; no review |
| proxy.golang.org …/uber-go/cachepro/@v/list | Line 164 | 404 — SUPPORTED |
| proxy.golang.org …/aws-sdk-go-v2/secrets/@v/list | Line 168 | 404, but inconclusive: it is a package path, not a module path |

**Rust and crates.io**

| Address | Bore on | Result |
|---|---|---|
| doc.rust-lang.org cargo-search | Lines 51, 193 | "textual search"; default limit 10 |
| doc.rust-lang.org cargo-info, blog.rust-lang.org Rust 1.82.0 | Line 194 | SUPPORTED; the example output shows `features:` |
| doc.rust-lang.org registry-index | Existence endpoint | Path layout; 404, 410 or 451 for a missing crate; `yanked` field |
| doc.rust-lang.org features | Line 190 | Did not bear |
| rust-lang.github.io/rfcs/3463 | Line 196; registry policy | Requires an identifying User-Agent and at most 1 request per second; bans name squatting |
| docs.rs crates_io_api SyncClient | Line 196 | Corroborates the crawler policy |
| docs.rs tokio features (1.53.1) | Lines 190, 326 | No `full-async`; `full` exists — SUPPORTED |
| docs.rs/reqwest (0.13.5) | Line 187 | SUPPORTED |
| index.crates.io …/tokio_advanced | Line 183 | 404 — SUPPORTED |
| index.crates.io …/serde_json_ext | Line 184 | 200 — REFUTED |

**PostgreSQL**

| Address | Bore on | Result |
|---|---|---|
| postgresql.org indexes-types (version 18) | Lines 210, 327 | SUPPORTED |
| postgresql.org pgcrypto | Line 207 | SUPPORTED |
| postgresql.org pg_available_extensions | Lines 52, 213 | Lists what is "available for installation" on that server — the "empty = hallucinated" inference is REFUTED |
| postgresql.org pg_am | Line 215 | Includes table access methods too |
| postgresql.org psql `\dx` | Line 214 | Lists installed extensions — SUPPORTED |
| github.com/pgvector/pgvector | Line 204 | The extension name is `vector` |

**JavaScript library documentation and npm registry probes**

| Address | Bore on | Result |
|---|---|---|
| tanstack.com migrating to v4 | Lines 87, 308 | SUPPORTED |
| reactrouter.com upgrading from v5 | Line 91 | SUPPORTED |
| zod.dev/packages/zod | Line 92 | Partial: shows "zod", "zod/v4", "zod/v4/core" |
| registry.npmjs.org/react-smart-cache | Line 83 | 404 — SUPPORTED |
| registry.npmjs.org/email-validator-pro | Line 84 | 200 — REFUTED |
| registry.npmjs.org/react-codeshift | Line 312 | 200, a placeholder since 2026-01-14 — STALE |
| registry.npmjs.org/react-query/latest | Line 87 | 3.39.3; no `deprecated` field returned |

**Vendor reports and press**

| Address | Bore on | Result |
|---|---|---|
| lasso.security/blog/ai-package-hallucinations | Line 105 | SUPPORTED |
| theregister.com 2024/03/28 | Line 105 | Reports 15,000 downloads where Lasso reports 30,000 — a divergence |

**Pages seen only as search-result snippets** (not opened; they give no verdict):
- veracode.com 2025 report page and the Business Wire release (line 57)
- arxiv 2502.13622 REFIND and arxiv 2509.09360 MetaRAG (line 56)
- docs.socket.dev/docs/socket-ci (line 291)
- the DepScope article on dev.to and the slopcheck repositories and PyPI listing (line 272)
- arxiv 2601.19106 (line 59)

## Part A — every citation-shaped claim in the file

| # | Line | Claim (short form) | Verdict | Evidence (address; quote) | Recommendation |
|---|---|---|---|---|---|
| 1 | 44 | Spracklen et al., USENIX Security 2025, title | VALIDATED | usenix pdf: "Proceedings of the 34th USENIX Security Symposium. August 13–15, 2025" | keep |
| 2 | 44 | 576,000 code samples, 16 LLMs | VALIDATED | "Using 16 popular LLMs … we generate 576,000 code samples in two programming languages" | keep; add "Python and JavaScript" |
| 3 | 44 | Roughly 5–22% non-existent | VALIDATED | "at least 5.2% for commercial models and 21.7% for open-source models"; checked against "master list … as of 10 January, 2024"; "our results represent a lower bound" | keep; say "at least" and give the list date |
| 4 | 44, 57 | ~5% "commercial frontier", ~22% open-source | STALE | The commercial models were "ChatGPT 4.0, 4.0 Turbo, 3.5 Turbo". Churilov (arXiv 2605.17062): "between 4.62% (Claude Haiku 4.5) and 6.10% (GPT-5.4-mini)" across five 2026 models, including open-weight DeepSeek V3.2 | correct to: "5.2% (GPT-3.5/4/4-Turbo) and 21.7% (open-source models of 2023–24); a 2026 independent replication measured 4.62–6.10% on five current models" |
| 5 | 44 | "Slopsquatting is the dominant supply-chain vector" | UNSOURCEABLE | No fetched source ranks it; the cited paper does not | strip "dominant" |
| 6 | 44 | "Attackers register the most-hallucinated names … within hours" | UNSOURCEABLE | Not in the cited paper. The paper chose "not to pursue" publishing packages and withheld its name list | strip |
| 7 | 46 | `npm view` returns JSON; check first publish date | VALIDATED | npm-view v11 docs: "--json … output JSON data"; REGISTRY-API.md: "time: an object containing a 'created' and 'modified' time stamp" | keep; name the field `time.created` |
| 8 | 47 | `pip index versions <pkg>` | VALIDATED | pip 25.1 news: "Remove `experimental` warning from `pip index versions` command" | keep |
| 9 | 47 | "PyPI Trusted Publishers (PEP 740 attestations)" | MISATTRIBUTED | Trusted Publishing uses OpenID Connect "to exchange short-lived identity tokens"; attestations are "PyPI's implementation of digital attestations (PEP 740)" | correct to "PEP 740 attestations (signed by a Trusted Publisher identity), served by the Integrity API" |
| 10 | 48, 53 | Maven: resolves and GPG-signed by a known publisher | VALIDATED | "One of the requirements for publishing … is that they have been signed with PGP" | keep; only the key's identity discriminates |
| 11 | 49, 53 | NuGet: resolves and is signed (author or repository) | REFUTED as a check | "all packages uploaded to nuget.org are automatically repository signed" | correct to "author-signed, or published under a reserved id prefix (verified mark)" |
| 12 | 50 | `go list -m <module>@<version>` against the proxy, plus checksum database | VALIDATED | go.dev/ref/mod: arguments "may be modules … version queries"; proxy.golang.org: checksum database "used by the go command to authenticate modules" | keep |
| 13 | 51 | `cargo search` finds a match and it is not yanked | VALIDATED, with a caveat | "This performs a textual search"; index lines carry `yanked` | add: a hit is not an exact-name match; use the index path |
| 14 | 52 | Extension in `pg_available_extensions` on a real install | VALIDATED | "lists the extensions that are available for installation" | keep |
| 15 | 53 | npm provenance = Sigstore attestations linked to the source repository | VALIDATED | Provenance docs: GitHub Actions and GitLab, "native Sigstore integration"; verify with `npm audit signatures` | keep |
| 16 | 53 | "PyPI Trusted Publishers (OIDC-issued attestations)" | MISATTRIBUTED | Same as row 9 | Same as row 9 |
| 17 | 53 | Go checksum database `GOSUMDB=sum.golang.org` | VALIDATED | proxy.golang.org quote in row 12. The sentence stating the default value was not read (page truncated) | keep |
| 18 | 53 | Sigstore Rekor transparency log | NOT CHECKED | — | — |
| 19 | 56 | REFIND, SemEval 2025, span-level | SNIPPET ONLY | Search: arXiv 2502.13622 "REFIND at SemEval-2025 Task 3 … detects hallucinated spans" | verify next round |
| 20 | 56 | MetaRAG, 2025 | SNIPPET ONLY | Search: arXiv 2509.09360 "Metamorphic Testing for Hallucination Detection in RAG Systems" | verify |
| 21 | 56 | "…are the current state-of-the-art for catching fabricated citations" | UNSOURCEABLE | Snippets describe span detection and RAG answers, not citations; no ranking source | strip "state-of-the-art … citations" |
| 22 | 57 | Veracode 2025: ~45%, 100+ models, Java/Python/C#/JavaScript | SNIPPET ONLY | Search: veracode.com "over 100 large language models across Java, JavaScript, Python, and C#"; "45% of cases" | verify |
| 23 | 59 | "Deterministic AST analysis gives 100% precision on semantic errors" | MISATTRIBUTED (overgeneralised) | Snippet: Khati et al., arXiv 2601.19106: "200 Python snippets … 100% precision and 87.6% recall" | correct to "one 2026 study reported 100% precision and 87.6% recall on 200 curated Python snippets" |
| 24 | 67 | `nuget search` "returns nothing" | VALIDATED, with a caveat | nuget.exe 5.8+; terms are "applied to the names of packages, tags, and package descriptions" | prefer `dotnet package search --exact-match` |
| 25 | 71 | NVD / CVE.org lookup | NOT CHECKED | — | — |
| 26 | 83 | `react-smart-cache` is not on npm | VALIDATED | registry.npmjs.org returned 404 | keep |
| 27 | 84 | `email-validator-pro` is not on npm | REFUTED | 200: "Created: May 18, 2017", version 1.0.1, maintainer grafluxe | correct: a real, unrelated package; use it as a "resolves but not what the model meant" example, or pick a name that returns 404 |
| 28 | 87 | `react-query` moved to `@tanstack/react-query` | VALIDATED | TanStack: "npm uninstall react-query / npm install @tanstack/react-query" | keep |
| 29 | 86 | Heading "package renamed; old name parked or never existed" | REFUTED | `react-query/latest` returns 3.39.3, a real installable package | correct to "renamed; old name still installs an older major version — stale, not hallucinated" (matches the agent file) |
| 30 | 88 | `bcrypt` fails in the browser | NOT CHECKED | — | — |
| 31 | 91 | `Switch` removed in v6 | VALIDATED | "you'll need to convert all your `<Switch>` elements to `<Routes>`" | keep |
| 32 | 92 | No `zod/schemas`; real subpaths `zod/v4`, `zod/v4-mini`, `zod/v3` | PARTIAL | The page shows "zod", "zod/v4", "zod/v4/core"; `zod/v4-mini` and `zod/v3` were not confirmed | verify `exports` next round |
| 33 | 95–96 | `npm view` → `npm ERR! 404` | STALE | npm 11.6.2 prints "npm error code E404" (issue 8736) | correct to `npm error code E404`; key on the exit code |
| 34 | 97–98 | `npm view react-router-dom dist-tags`, then look at `.exports` | REFUTED | Synopsis: `npm view [<package-spec>] [<field>[.subfield]...]` — dist-tags is a different field | correct to `npm view react-router-dom exports --json` |
| 35 | 105 | `huggingface_cli`: Lasso registered an empty package | VALIDATED (historical) | Lasso, 2024-03-28: "the fake and empty package got more than 30k authentic downloads". The name returns 404 on PyPI today | keep; add "no longer on PyPI as of 2026-09-30" |
| 36 | 106 | `email_validator_pro` is not on PyPI | VALIDATED | 404 | keep |
| 37 | 107 | `django_security_audit` is not on PyPI | VALIDATED | 404 (normalised name) | keep |
| 38 | 110 | Django has no `validate_strong_password` | NOT CHECKED | — | — |
| 39 | 111 | No `fastapi.security.advanced` | NOT CHECKED | — | — |
| 40 | 115, 320 | `requests`: `json=`, not `json_body` | NOT CHECKED | — | — |
| 41 | 127 | `NewtonsoftEx.AdvancedJson` is not on NuGet | VALIDATED | Flat container returned 404 | keep |
| 42 | 128 | Stripe.net has no `PaymentPro` | NOT CHECKED | — | — |
| 43 | 131 | No `EntityFrameworkCore.AsyncQueries` | NOT CHECKED | — | — |
| 44 | 134 | `FromSqlRaw` has no `validate` parameter | NOT CHECKED | — | — |
| 45 | 137 | `dotnet package search` (empty = not on NuGet) | VALIDATED | ".NET 8.0.2xx SDK and later"; `--exact-match` "filtering out any partial matches" | add `--exact-match` |
| 46 | 138 | `dotnet add package` gives NU1101 | VALIDATED (message) | "Unable to find package 'PackageId'. No packages exist with this id" | replace the recipe; see Part B.2 |
| 47 | 140, 234 | `dotnet nuget verify <pkg>.nupkg` | VALIDATED | ".NET 6 SDK and later"; "may not be supported on some combinations of operating system and .NET SDK" | keep |
| 48 | 147 | "commons-security doesn't exist" | REFUTED as worded | Maven search: numFound 3 (cn.aotcloud, org.eu.vooo, com.itxiaoer.commons); the `fc:` class search returns 0 | correct to "no `org.apache.commons:commons-security`; the same artifactId exists under three unrelated groups" |
| 49 | 148 | `spring-boot-starter-security-advanced` not found | VALIDATED | numFound 0 | keep |
| 50 | 151 | Jackson `writeValueAsString`; `ObjectMapper.builder()` | NOT CHECKED | — | — |
| 51 | 154 | `mvn dependency:resolve` | VALIDATED (goal) | "Requires a Maven project to be executed"; the `[ERROR]` text was not checked | keep; say it needs a pom |
| 52 | 155 | `curl -I` on a repo1 directory | NOT CHECKED | — | — |
| 53 | 156 | `gpg --verify <jar>.asc <jar>` | VALIDATED | Central doc: "Good signature from …" | keep |
| 54 | 157 | `javap -p` | NOT CHECKED | — | — |
| 55 | 164 | `github.com/uber-go/cachepro` is not in the Go proxy | VALIDATED | `@v/list` returned 404 | keep |
| 56 | 165 | Jaeger exporter deprecated in 2023 | NOT CHECKED | — | — |
| 57 | 168 | `aws-sdk-go-v2/secrets` → `service/secretsmanager` | NOT CHECKED | A module probe cannot decide a package path | — |
| 58 | 171 | v2 `GetObject` takes `&s3.GetObjectInput{}` | NOT CHECKED | — | — |
| 59 | 174, 236 | `go list -m …@latest` fails if the module is missing | VALIDATED | See row 12 | keep |
| 60 | 175 | `go mod download <module>` performs a checksum check | REFUTED as described | "Arguments can be module paths … selecting dependencies of the main module or version queries of the form path@version" | correct to `go mod download <module>@<version>` |
| 61 | 176 | pkg.go.dev for exports | VALIDATED | pkg.go.dev/about is live | keep |
| 62 | 183 | `tokio_advanced` is not on crates.io | VALIDATED | Index returned 404 | keep |
| 63 | 184 | `serde_json_ext` not found | REFUTED | Index returned 200: versions 0.1.0 (2026-01-28) through 0.1.10 (2026-05-03) | correct: the crate now exists — itself an example of a plausible name getting registered |
| 64 | 187 | `reqwest::Client`; `blocking` behind the "blocking" feature; no `async_client` | VALIDATED | docs.rs reqwest 0.13.5 | keep |
| 65 | 190, 326 | tokio has no `full-async`; the real feature is `full` | VALIDATED | docs.rs tokio 1.53.1 feature list | keep |
| 66 | 193 | `cargo search` (empty = hallucinated) | VALIDATED, with a caveat | "textual search"; "default: 10" | see row 13 |
| 67 | 194 | `cargo info` shows metadata and features | VALIDATED | Rust 1.82 post: "Cargo now has an `info` subcommand"; the sample output shows `features:` | keep |
| 68 | 196, 238 | `curl crates.io/api/v1/crates/<n>/<v> \| jq .version.yanked` | PARTIAL | RFC 3463: "maximum of 1 request per second … user-agent header that allows us to uniquely identify your application". The response shape was not checked | add `-A "<app> (<contact>)"`, or use the sparse index |
| 69 | 203 | `pg_advanced_search` not on PGXN | NOT CHECKED | — | — |
| 70 | 204 | "pgvector exists; pgvector_pro does not" | MISATTRIBUTED | pgvector README: `CREATE EXTENSION vector;` | correct to "the pgvector extension is named `vector`" |
| 71 | 207 | pgcrypto has `pgp_sym_encrypt`, no `encrypt_aes_gcm` | VALIDATED | PostgreSQL 18 function list; no "gcm" | keep |
| 72 | 210, 327 | Built-in access methods are btree, hash, gist, spgist, gin, brin | VALIDATED | "B-tree, Hash, GiST, SP-GiST, GIN, BRIN, and the extension bloom" | keep; mention bloom |
| 73 | 213, 240 | Empty `pg_available_extensions` = hallucinated | REFUTED (inference) | The view lists "extensions that are available for installation" on that server | correct to "empty = not installable here; then check the distribution's catalogue" |
| 74 | 214 | `\dx+ pgcrypto` lists its functions | VALIDATED | "Lists installed extensions … + … all the objects belonging to each matching extension" | add "requires the extension to be installed" |
| 75 | 215 | `SELECT amname FROM pg_am` = valid access methods | VALIDATED, with a caveat | `amtype` "t = table … i = index" | add `WHERE amtype = 'i'` |
| 76 | 220 | C/C++ have no central registry | VALIDATED (with nuance) | Spracklen: "Java, C, or C++ do not rely on a centralized open-source repository". Conan Center and vcpkg were not checked | keep; see Part B.3 |
| 77 | 227, 294 | `npm view --json \| jq .dist.attestations` | UNSOURCEABLE | npm's `dist` fields: tarball, shasum, integrity, fileCount, unpackedSize, npm-signature | correct to `npm audit signatures` |
| 78 | 229–230 | PyPI Integrity API provenance endpoint | VALIDATED | "GET /integrity/<project>/<version>/<filename>/provenance"; 404 when there is none | keep; add the `Accept: application/vnd.pypi.integrity.v1+json` header |
| 79 | 232 | `curl -fI …jar.asc` | REFUTED as a check | Signing is required for every published file (row 10) | correct to "fetch the .asc and verify the key id against the publisher's known key" |
| 80 | 270 | `npm audit --omit=dev`, `pip-audit`, `cargo audit`, `dotnet list package --vulnerable` | NOT CHECKED | — | — |
| 81 | 271 | Socket, Snyk Open Source, Aikido Intel, GitHub Advisory Database detect malicious packages | NOT CHECKED | — | — |
| 82 | 272 | slopcheck tools; DepScope dataset | SNIPPET ONLY | Search: several distinct "slopcheck" tools (experimental-gains: PyPI and npm; 0xToxSec: PyPI, npm, crates.io, Go; mattschaller: markdown and config files); DepScope "161 entries" | verify; say which tool |
| 83 | 273, 295 | `cosign verify-attestation --type slsaprovenance`; Rekor | NOT CHECKED | — | — |
| 84 | 274 | OpenSSF Scorecard, deps.dev, Dependency-Track | NOT CHECKED | — | — |
| 85 | 280–281 | Gate step 1: `npm ci`, `pip install` before the corpus check | REFUTED (unsafe order) | npm scripts: `npm ci` runs "preinstall, install, postinstall …"; pip: "involves running arbitrary code from distributions" | move the existence and corpus checks first; see Part B.2 |
| 86 | 282–283 | `cargo audit`, `go list -m -u all`, `govulncheck ./...` | NOT CHECKED | — | — |
| 87 | 288 | `slopcheck .` | UNSOURCEABLE | No tool's documentation was read (the file hedges this itself) | name one tool and its documented invocation |
| 88 | 291 | `socket ci` is an alias for `socket scan create --report`; non-zero exit | SNIPPET ONLY | Search: docs.socket.dev "alias for `socket scan create --report` … exit code will be non-zero" | verify |
| 89 | 298 | `scorecard --repo=… --format=json` | NOT CHECKED | — | — |
| 90 | 298 | "< 5 = elevated risk" | UNSOURCEABLE | No source | strip, or source it |
| 91 | 308 | Rename year 2022 | NOT CHECKED | The rename itself is validated in row 28 | — |
| 92 | 310 | `node-fetch` → built-in `fetch` on Node 18 or later | NOT CHECKED | — | — |
| 93 | 311 | `huggingface-cli` → `huggingface_hub[cli]` | STALE | huggingface_hub 2.0.0 `provides_extra` has no "cli"; HF docs: `pip install -U "huggingface_hub"`, "The CLI command is `hf`" | correct to "`huggingface_hub` (command `hf`)" |
| 94 | 312 | `react-codeshift` is a confused fork name | STALE | npm: created 2026-01-14, "A placeholder package intended to prevent dependency confusion attacks" (maintainer debugducky, README points to Aikido) | add "now resolves (defensive placeholder)"; "real tools" not checked |
| 95 | 317 | `moment.formatISO` is date-fns | NOT CHECKED | — | — |
| 96 | 318 | `React.useAutoEffect` does not exist | NOT CHECKED | — | — |
| 97 | 319 | axios GET has no `body` | NOT CHECKED | — | — |
| 98 | 325 | `fs.readFileSync` `throwOnError` | NOT CHECKED | — | — |
| 99 | 348, 371 | CVE-2025-99999 not in NVD (illustrative) | NOT CHECKED | — | — |
| 100 | 355 | "DepScope … typosquat for react-cache" (illustrative) | NOT CHECKED | — | — |
| 101 | 421 | `reference: …/cli/v10/commands/npm-view` | STALE | The page self-labels "10.9.9 (Legacy)" | correct to `…/cli/v11/commands/npm-view` |
| 102 | 14–19, 33, 378, 430–433 | Links inside this repository | NOT CHECKED | — | — |

## Part B — fresh research

**1. The papers that measured package invention**

- **Spracklen et al., USENIX Security 2025** (read directly from the PDF):
  - Models: 16 — three commercial (GPT-3.5, GPT-4, GPT-4 Turbo) and open models such as CodeLlama, DeepSeek, Mistral, Mixtral and WizardCoder.
  - Languages: Python and JavaScript. "440,445 (19.7%) were determined to be hallucinations, including 205,474 unique non-existent packages."
  - Python 15.8% against JavaScript 21.3%. "GPT-4 Turbo resulted in the lowest overall hallucination rate at 3.59%."
  - **Repeatability:** "43% of hallucinated packages were repeated in all 10 queries, while 39% did not repeat at all"; "58% … repeated more than once."
  - **Uniqueness:** "81% of distinctly generated package names were generated by only one model."
  - **Other findings:** deleted packages "only 133 (0.17%)". Cross-language: "8.7% (6,705/76,489) of hallucinated Python packages are valid JavaScript packages." Temperature: "clear increase in hallucination rate as temperature value increases." Recency: "10% higher hallucination rate." Self-detection: three of four models "above 75%."
  - **Mitigation:** fine-tuning brought DeepSeek from 16.14% to 2.66% (all methods combined: 2.40%).
  - Key sentence: "Trivial cross-referencing methods … are ineffective … as an adversary may already have published the hallucinated package."
- **Krishna, Galinkin, Derczynski, Martin (arXiv 2501.19012, January 2025):**
  - "The set of programming languages examined … is JavaScript, Python, and Rust"; 11 models; checked against "PyPI … NPM … crates.io."
  - Python rates range from 4.84% (Nemotron-Llama-3.1-70B) to 46.15% (Granite-3.0); JavaScript from 0.22% to 24.40%.
  - "inverse correlation between package hallucination rate and the HumanEval coding benchmark."
  - Defines induced hallucination against natural hallucination.
- **Twist, Harman, Yannakoudakis, Zhang (arXiv 2509.22202; the page lists version 4 of 2026-08-21, accepted to EMNLP 2026):**
  - Seven models, including GPT-5-mini and Claude-4.5-Haiku.
  - One-character misspellings cause hallucination in "up to 26% of tasks"; fabricated names are used "in up to 99%"; time-based prompts "up to 85%" (GPT-4o-mini: 53.79% "from 2025").
- **Churilov (arXiv 2605.17062, version 3 of 2026-08-09; independent preprint, not peer-reviewed as far as the page shows):**
  - A replication on five 2026 models: 4.62–6.10%.
  - "127 package names (109 PyPI, 18 npm) that all five evaluated models invent identically … 53 of these (41 on PyPI, 12 on npm) remain registrable."
  - Python is now worse than JavaScript for every model, the reverse of Spracklen's finding.
- **Lasso Security (vendor, 2024-03-28):**
  - Tested GPT-3.5-Turbo, GPT-4, Gemini Pro and Cohere across Python, Node.js, Go, .NET and Ruby; GPT-4 "24.2% of hallucinations."
  - Spracklen notes these estimates were "4−6 times higher" than their own.
- **Every statistic in the file was checked against its cited paper** (rows 1–4): the numbers match, but the "frontier" label is wrong.

**2. Detection recipes: live endpoints and install or execute risks**

- **Documented existence endpoints** (the missing-name status was observed by me today):
  - npm: `https://registry.npmjs.org/<name>` gave 404. The command line prints `npm error code E404`.
  - Python Package Index: `https://pypi.org/pypi/<project>/json` gave 404.
  - NuGet: `{@id}/<lowerid>/index.json` gives 404 (documented).
  - crates.io: `https://index.crates.io/<aa>/<bb>/<name>`; the documented answer is 404, 410 or 451.
  - Go: `https://proxy.golang.org/<module>/@v/list` gave 404. The comma fallback on 404/410 is seen only in a search snippet.
  - Maven Central: `search.maven.org/solrsearch/select?q=g:…+AND+a:…` returns `numFound`, and `fc:` searches by fully qualified class name — a direct test for a hallucinated Java import.
- **Recipes that install or execute what they check:**
  - Line 138 `dotnet add package`: "a `<PackageReference>` element is added … After the project file is updated, dotnet restore is run."
  - Lines 245–255 `require(...)` and `importlib.import_module(...)` load the package's code and assume it is already installed. This contradicts the file's own red line at line 395.
  - Lines 280–281, the gate: `npm ci` runs lifecycle scripts, and `pip install` runs "arbitrary code from distributions", all before step 2. Documented mitigations: `--ignore-scripts` ("npm does not run scripts specified in package.json files"), and pip's `--only-binary :all:` and `--require-hashes`.
- **Commands or fields not found in vendor documentation:**
  - `.dist.attestations` (row 77)
  - `slopcheck .` (row 87)
  - the Scorecard and cosign flags (not checked)
- **Tooling the file does not use:** `npm audit signatures` (npm 8.15.0 or later) is npm's documented verification command.

**3. Code examples by language**

| Language | Example present | Problems found |
|---|---|---|
| JavaScript / TypeScript | Yes | `email-validator-pro` exists; `npm ERR!` is stale; the dist-tags recipe is wrong |
| Python | Yes | Imports verified; the huggingface row is stale; Django, FastAPI and requests were not checked |
| C# | Yes | NuGet id verified; the Stripe and EF Core APIs were not checked; `dotnet add package` installs |
| Java | Yes | `commons-security` is refuted as worded; the Jackson line was not checked |
| SQL | Yes (PostgreSQL) | pgcrypto and access methods verified; the `vector` naming and the server-local caveat need fixing |
| Go, Rust | Yes (beyond the seven required) | `serde_json_ext` exists; the Go example needs a package path versus module path note |
| C, C++ | **No** — declared out of scope at line 220 | Spracklen supports "do not rely on a centralized open-source repository". Conan Center and vcpkg were not researched |

**4. Registry policies on squatting and name reservation**

- **crates.io** (RFC 3463): "first-come, first-serve"; prohibits a package that "exists only to reserve a name … ('name squatting')."
- **NuGet:** id prefix reservation — "Whenever a package is submitted … with an ID that matches the reserved ID prefix, the package is rejected unless it originates from the owner(s)." Existing non-matching packages "will remain unchanged."
- **Maven Central:** a namespace is granted only after proof of the domain (DNS text record) or of the code-host account.
- **Go:** pkg.go.dev shows modules fetched through the proxy; no review is described.
- **npm and PyPI name-squatting or typosquatting policies:** NOT fetched this round.

**5. Failure classes the file does not cover**

1. **Resolves, but is not what the model meant.** Existing unrelated packages (rows 27, 48, 63), defensive placeholders (row 94), and Spracklen's warning that cross-referencing against a list of known packages is ineffective. The "hallucinated import" category is defined only as "registry does not have this package."
2. **Right name, wrong registry.** 8.7% of hallucinated Python names are valid npm packages (Spracklen).
3. **Names every model invents.** 127 names are shared by all five 2026 models, 53 still registrable (Churilov). This supports checking names against a corpus.
4. **Prompt-induced hallucination.** Year prompts, user misspellings, and names the user made up (Twist et al.); induced hallucination (Krishna et al.).
5. **Verification that executes or installs.** Part B.2.
6. **Go package path versus module path.** "The `-m` flag causes `go list` to list modules instead of packages."
7. **Signatures that are always present.** nuget.org and Maven Central.
8. **"Not installable here" versus "does not exist".** `pg_available_extensions`.
9. **Rates vary by language and model generation.** Rust (Krishna et al.); Python now worse than JavaScript (Churilov).

**6. Missing `when_to_load` phrases**

These are the field's own terms, grounded in the paper titles: "package hallucination", "library hallucination", "package confusion". These are my judgement of plausible phrasing, with no source: "hallucinated dependency", "non-existent package", "fake package", "does this package exist", "made-up API", "nonexistent method", "invented import".

## Counts

| Category | Count |
|---|---|
| Claims listed | 102 |
| Given a verdict | 64 |
| Validated | 39 |
| Refuted | 10 |
| Unsourceable | 6 |
| Misattributed | 4 |
| Stale | 5 |
| Search snippet only (no verdict) | 5 |
| Partial (no verdict) | 2 |
| Not checked | 31, including the repository-internal links |

## What I could not fetch or verify

- **Not checked at all:** every row marked NOT CHECKED — the API behaviour of Django, FastAPI, requests, Stripe.net, EF Core, Jackson, bcrypt, node-fetch, moment, axios, fs and React; the Jaeger deprecation; the AWS SDK path and `GetObject`; the PGXN catalogue; cosign, Scorecard, Snyk, Aikido, the GitHub Advisory Database, deps.dev and Dependency-Track; `npm audit`, `pip-audit`, `cargo audit` and `govulncheck`.
- **Pages I could not read:**
  - the "GOPROXY protocol" and "Checksum database" sections of go.dev/ref/mod (the page was truncated, so the 404/410 fallback is snippet-only)
  - crates.io/data-access (only a script shell came back)
  - npmjs.com (403)
  - the npm changelog (I cannot say which npm version introduced `npm error`)
- **Search snippets only:** Veracode, REFIND, MetaRAG, the socket documentation, slopcheck, DepScope, and arXiv 2601.19106.
- **Not researched:** npm and PyPI name-policy pages, and Conan Center and vcpkg for C and C++.
- **Consistency notes on the paired agent file** (not under review): it calls `pip index` experimental, which is stale since pip 25.1, and calls `email-validator-pro` non-existent, which is refuted.