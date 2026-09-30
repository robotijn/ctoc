I made 19 of the 20 allowed web fetches and changed no file. **Result: the skill is not ready to sign off as it stands, but it is close.** It makes 145 citation-shaped claims. 127 hold, 8 need a wording correction, and 10 were not checked. None of the 145 is fabricated.

- **Agent item 2 is consistent** with the skill and with the agent's own "No recipe here" paragraph.
- **Every protected part is unchanged:** the five strings the test pins, the trigger phrases, the frontmatter, the triage table, the seven `kind` values, the two registry fields, the five headings and the red line the agent quotes.
- **Two stale spots were missed in round 1:**
  - Line 56 still says "the 5–22% phantom-package rate". The research note marked this stale, and line 45 was corrected but this line was not.
  - Line 374 still cites npm version 10 documentation. The current page is "Version 12.2.0 (Latest)".
- **Two tool rows in "Tool Integration (2026)" credit tools with what they do not do** (lines 266 and 267).
- **One summary contradicts the wrapper:** line 57's rule on how confident a finding is.
- **One statement is now settled.** The Rekor sentence at line 52, which the file marks "not checked", is confirmed today.
- **I could not confirm either fingerprint.** I have no shell. Also, the pre-edit fingerprint written in the critic's final change list has 63 hexadecimal characters, one short of a real SHA-256 value.

What each basis refers to:
- **"skill validation"** is `s4-skill-round1-validate-d-s4-skill-r1-validate.md`.
- **"skill research"** is `s4-skill-round1-research-…` Part A.
- **"research gaps"** is `s4-skill-round1-research-gaps-…`.
- **"session probes"** is `s4-skill-round1-session-runs.md`.
- **"agent report A" or "agent report B"** is `s4-agent-round1-validate-a/-b`; "agent round 2" and "agent round 3" are the agent's round 2 and 3 validation and re-validation reports.
- **"repository read"** means I read the file myself today.
- **"fetched today"** means one of my 19 fetches.

## (A) Every claim, in file order

| # | Line | Claim | Verdict | Basis |
|---|---|---|---|---|
| 1 | 35 | test lines 9–13: trigger vocabulary only; nothing loads a specialist on a phrase match | VALIDATED | repository read |
| 2 | 43 | the landscape "has shifted" to "attackers register the wrong name as malware" | NOT CHECKED | no report; one search gave secondary snippets only |
| 3 | 45 | Spracklen and colleagues: title, USENIX Security 2025, presentation page, arXiv 2406.10279 | VALIDATED | skill research row 1; agent round 2 fetched the presentation page |
| 4 | 45 | 576,000 samples, Python and JavaScript, 16 models | VALIDATED | skill validation row 36 |
| 5 | 45 | "the average percentage … at least 5.2% … 21.7% …" (page 3687) | VALIDATED | skill validation row 34, word for word |
| 6 | 45 | "as of 10 January, 2024" (page 3693) | VALIDATED | row 37 (part of "(each list is as of 10 January, 2024)") |
| 7 | 45 | ChatGPT 4.0, ChatGPT 4.0 Turbo, ChatGPT 3.5 Turbo (Table 1, page 3692) | VALIDATED | row 35's corrected wording, word for word |
| 8 | 45 | Churilov: "five frontier code-capable LLMs released between October 2025 and March 2026" | VALIDATED | session probes (curl): part of the abstract sentence |
| 9 | 45 | Churilov: "between 4.62% (Claude Haiku 4.5) and 6.10% (GPT-5.4-mini)" | VALIDATED | row 38; session probes |
| 10 | 45 | "an independent preprint not shown as peer-reviewed" | VALIDATED | row 40 |
| 11 | 45 | the attack quotation, pages 3687–3688 | VALIDATED | row 41; agent round 2 validation row 18 (page image; the ellipses are faithful) |
| 12 | 45 | Krishna: "was first registered after the model's knowledge cutoff date" | VALIDATED | row 42; agent report A row 39, word for word |
| 13 | 46 | "Trivial cross-referencing methods (i.e., …) … malicious code." (page 3688) | VALIDATED | agent round 2 validation row 21, word for word |
| 14 | 46 | "typosquatting, combosquatting, brandjacking, and similarity attacks", citing earlier work | VALIDATED | agent round 2 validation row 12 (reference 28) |
| 15 | 46 | the dependency-confusion sentence from the Supply-chain Levels for Software Artifacts threats page | VALIDATED | agent round 2 validation row 3, word for word |
| 16 | 47 | all four wrapper recipes report not-found and could-not-look; npm and PyPI also report placeholders | VALIDATED | repository read, agent lines 157–215 |
| 17 | 47 | `fs` latest "0.0.1-security" | VALIDATED | agent report A row 8 |
| 18 | 47 | the wrapper has no recipe for NuGet, the Go proxy or Postgres | VALIDATED | repository read, agent line 219 |
| 19 | 48 | `dotnet package search … --exact-match`, .NET 8.0.2xx and later, "narrows the search …" | VALIDATED | row 11, word for word |
| 20 | 48 | NuGet's version list answered 404 for `newtonsoftex.advancedjson` | VALIDATED | row 12 |
| 21 | 49 | the Go proxy answered 404 for `uber-go/cachepro` | VALIDATED | row 13 |
| 22 | 49 | the Go proxy answered 404 for `…/aws-sdk-go-v2/secrets` | VALIDATED | session probes (curl) |
| 23 | 49 | `service/secretsmanager` is a separate module with its own version list | VALIDATED | row 14 |
| 24 | 50 | `cargo search` "performs a textual search for crates" | VALIDATED | row 23 (part of the sentence) |
| 25 | 51 | the `pg_available_extensions` sentence | VALIDATED | session probes, identical sentence |
| 26 | 52 | Maven Central: "One of the requirements … signed with PGP." | VALIDATED | row 16, word for word |
| 27 | 52 | NuGet: look for an author signature | VALIDATED | skill research: "all packages uploaded to nuget.org are automatically repository signed" |
| 28 | 52 | npm provenance comes from GitHub Actions or GitLab, signed through Sigstore | VALIDATED | row 17 |
| 29 | 52 | "You can verify the provenance attestations … `npm audit signatures`" | VALIDATED | row 18, word for word |
| 30 | 52 | "PyPI's implementation of digital attestations (PEP 740)" | VALIDATED | row 19 |
| 31 | 52 | OpenID Connect "to exchange short-lived identity tokens" | VALIDATED | row 20 |
| 32 | 52 | "an auditable checksum database which will be used by the go command to authenticate modules" | VALIDATED | row 21, word for word |
| 33 | 52 | the Go blog: "ensures that the `go` command always adds the same lines …"; the remark after it is outside quotation marks | VALIDATED | row 22's corrected wording |
| 34 | 52 | Sigstore Rekor transparency log, "named here but was not checked" | VALIDATED (fetched today); the note saying it was not checked is now out of date | docs.sigstore.dev: "Rekor fulfils the signature transparency role of Sigstore's software signing infrastructure." |
| 35 | 53 | where to check a member: `.pyi` stubs, `module-info.java`, docs.rs, pkg.go.dev | NOT CHECKED, apart from pkg.go.dev (skill research row 61) | a code-level claim; that check belongs to hallucination-detector |
| 36 | 55 | REFIND: Lee and Yu, arXiv 2502.13622, the quotation, SemEval@ACL 2025 | VALIDATED | row 46 |
| 37 | 55 | MetaRAG: Sok, Luz and Haddam, arXiv 2509.09360, the quotation | VALIDATED | row 47 |
| 38 | 55 | neither abstract mentions citations | VALIDATED | rows 46–47 |
| 39 | 56 | Veracode 2025: "~45% of tests", 100+ models, Java, Python, C#, JavaScript | VALIDATED in substance (fetched today); the line gives no address | Veracode report page: "AI-generated code introduced risky security flaws in 45% of tests."; "over 100 large language models across Java, JavaScript, Python, and C#" |
| 40 | 56 | "the 5–22% phantom-package rate" | STALE; **needs correction** | skill research row 4 covers this line (original line 57), and the text is unchanged |
| 41 | 57 | the confidence rule "follows the wrapper's table" | **Contradicts the wrapper** | agent lines 331–333 |
| 42 | 58 | Khati: FORGE 2026, "100% precision … (0.934 F1-score)", "200 Python snippets" | VALIDATED | row 48 |
| 43 | 66 | invented = no such name, or first registered after the cutoff | VALIDATED | follows claim 12; agent line 95 |
| 44 | 67 | a `crossenv` placeholder with "security holding package" | VALIDATED | agent report A row 21 |
| 45 | 67 | `sklearn`: "deprecated sklearn package, use scikit-learn instead" | VALIDATED | agent report A row 22, word for word |
| 46 | 68 | the wrapper's look-alike check: age, downloads, maintainers, repository link | VALIDATED | repository read, agent lines 232–238 |
| 47 | 72 | a direct lookup in the National Vulnerability Database or CVE.org | CVE.org VALIDATED (session probes, 404); the National Vulnerability Database NOT CHECKED | — |
| 48 | 84 | `react-smart-cache` answered 404 | VALIDATED | row 29 |
| 49 | 86–87 | `email-validator-pro` on npm since 2017-05-18 | VALIDATED | agent report A row 32 |
| 50 | 90–91 | `react-query` latest "3.39.3"; new code uses `@tanstack/react-query` | VALIDATED | session probes (curl); skill research row 28 |
| 51 | 93 | `bcrypt` works in Node, not in the browser; confused with `bcryptjs` | VALIDATED in substance | agent round 2 re-validation rows 21 and 23 (native add-on, "node-gyp-build"). "Not in the browser" is inferred from that, not quoted from a source |
| 52 | 96 | `Switch` removed in version 6; use `Routes` | VALIDATED | skill research row 31 |
| 53 | 97 | the four `exports` entries of zod 4.6.5, and no "./schemas" | VALIDATED | row 28, word for word |
| 54 | 101 | npm 11 prints "npm error code E404" (seen from `npm i`, issue 8736, npm 11.6.2) | VALIDATED | row 27's corrected wording; inside the code comment the backticks were dropped, the words are the same |
| 55 | 102 | `npm view react-router-dom exports --json` | VALIDATED as syntax | skill research row 34 (the command synopsis) |
| 56 | 110 | `huggingface_cli`: Lasso's test, registered later, 404 today | VALIDATED | skill research row 35; agent report A row 37; session probes |
| 57 | 111 | `email_validator_pro` is not on PyPI | VALIDATED | skill research row 36 |
| 58 | 112 | `django_security_audit` is not on PyPI | VALIDATED | skill research row 37 |
| 59 | 115 | the `validate_password(password, user=None, password_validators=None)` signature | VALIDATED | research gaps row 38; session probes, word for word |
| 60 | 116 | there is no `fastapi.security.advanced` | VALIDATED | research gaps row 39 |
| 61 | 120 | requests uses `json=`, not `json_body` | VALIDATED | research gaps row 40 |
| 62 | 132 | `NewtonsoftEx.AdvancedJson` is not on NuGet | VALIDATED | skill research row 41 |
| 63 | 133 | Stripe.net has no `PaymentPro` | NOT CHECKED | code-level |
| 64 | 136 | there is no `EntityFrameworkCore.AsyncQueries` namespace | NOT CHECKED (partly checked in research gaps row 43) | code-level |
| 65 | 139 | `FromSqlRaw` has no `validate` parameter | VALIDATED | research gaps row 44 |
| 66 | 142 | the `dotnet package search … --exact-match` line | VALIDATED | row 11 |
| 67 | 143 | NuGet answered 404 | VALIDATED | row 12 |
| 68 | 146 | `dotnet nuget verify`; look for an author signature | VALIDATED | skill research row 47 and its signed-packages source |
| 69 | 153 | no `org.apache.commons:commons-security`; three other groups | VALIDATED | rows 24–25 |
| 70 | 154 | `spring-boot-starter-security-advanced` is not found | VALIDATED | skill research row 49 |
| 71 | 157 | Jackson's method is `writeValueAsString`; the code uses `ObjectMapper.builder()` | NOT CHECKED | code-level; an open lead from research gaps |
| 72 | 160 | repo1's `maven-metadata.xml` answered 404 | VALIDATED | agent report A row 20 |
| 73 | 161 | the `fc:` quotation from Central's search guide | VALIDATED | row 26's corrected wording, word for word |
| 74 | 162 | the `fc:` search answered numFound 0 | VALIDATED | row 25 |
| 75 | 164 | `gpg --verify` against the publisher's key | VALIDATED | skill research row 53 |
| 76 | 165 | `javap -p` lists declared methods | NOT CHECKED | code-level |
| 77 | 172 | `cachepro` is not on the Go proxy | VALIDATED | row 13 |
| 78 | 173 | the Jaeger exporter was deprecated in 2023; "never had a 'pro'" | Deprecation VALIDATED (research gaps row 56); "pro" NOT CHECKED | — |
| 79 | 176 | `secrets` belongs in the separate module `secretsmanager` | VALIDATED | row 14; session probes |
| 80 | 179 | version 2 `GetObject` takes `&s3.GetObjectInput{}` | VALIDATED | research gaps row 58 |
| 81 | 182 | `go list -m …@latest` fails when the module is missing | VALIDATED | skill research row 59 |
| 82 | 183 | `cachepro` answered 404 | VALIDATED | row 13 |
| 83 | 184 | "`go mod download` … downloads the module" | NOT CHECKED as worded | code-level |
| 84 | 185 | pkg.go.dev | VALIDATED | skill research row 61 |
| 85 | 192 | `tokio_advanced` answered 404 at `index.crates.io/to/ki/…` | VALIDATED | agent report A row 34 |
| 86 | 194–195 | `serde_json_ext`'s index entry lists "0.1.0" | VALIDATED | session probes (`"vers":"0.1.0"`) |
| 87 | 199 | reqwest: `reqwest::Client`; blocking behind the "blocking" feature | VALIDATED | skill research row 64 |
| 88 | 202 | tokio has no `full-async` feature | VALIDATED | skill research row 65 |
| 89 | 205 | "textual search"; "default: 10, max: 100" | VALIDATED | row 23 |
| 90 | 206 | `cargo info` shows metadata and features | VALIDATED | skill research row 67 |
| 91 | 208 | the shape of `.version.yanked` | NOT CHECKED | code-level |
| 92 | 209 | the two crates.io policy quotations | VALIDATED | agent report A row 18, word for word |
| 93 | 210 | the Rust Reference hyphen rule and quotation | VALIDATED | agent round 2 validation row 5; round 3 row 28 |
| 94 | 217 | `pg_advanced_search`: not in core, not in contrib, not on PGXN | NOT CHECKED | code-level |
| 95 | 218 | pgvector is created with `CREATE EXTENSION vector;` | VALIDATED | session probes |
| 96 | 221 | pgcrypto has `pgp_sym_encrypt`, not `encrypt_aes_gcm` | VALIDATED | skill research row 71 |
| 97 | 224 | `hash_advanced` is not an access method | VALIDATED | skill research row 72 |
| 98 | 227 | the `pg_available_extensions` quotation | VALIDATED | session probes |
| 99 | 228 | `\dx+`: installed extensions only; "all the objects …" | VALIDATED | session probes (part of the sentence) |
| 100 | 229 | `amtype` "t = table (including materialized views), i = index" | VALIDATED | session probes (part of the sentence) |
| 101 | 234 | the ConanCenter quotation and the index address | VALIDATED | row 49 |
| 102 | 234 | the vcpkg quotation and `ports/<name>` | VALIDATED | row 50 |
| 103 | 234 | Spracklen: Python and JavaScript only; "Java, C, or C++ …" (page 3692); the PDF address | VALIDATED | rows 36 and 51; agent round 2 fetched the address with `www.` |
| 104 | 240 | the recipes never install, and check characters before a shell | VALIDATED | repository read, agent lines 18 and 143 |
| 105 | 243 | provenance and trusted-publisher fields on `sigstore/latest` | VALIDATED | row 69; agent round 3 validation row 11 |
| 106 | 244 | the PyPI provenance address answers 404 when a file has no provenance | VALIDATED (fetched today; skill validation row 70 had not checked it) | "GET /integrity/<project>/<version>/<filename>/provenance"; "404 Not Found - file has no provenance" |
| 107 | 244 | `sigstore` 4.5.0 answered 200 with and without the `Accept` header | VALIDATED | row 68 (the session's own run) |
| 108 | 251 | the order of the wrapper's "Export Verification" section | VALIDATED | repository read, agent lines 242–250 |
| 109 | 257 | the vulnerability-record service answered 404 for CVE-2025-99999 | VALIDATED | session probes |
| 110 | 261 | "matured around four layers … a single pre-merge gate" | **Contradicts its own table** (the table has five rows); NOT CHECKED otherwise | — |
| 111 | 265 | the audit tools; `dotnet package list --vulnerable`, the "noun first" form from .NET 10 | VALIDATED | research gaps rows 80 and 86; session probes (status 200) |
| 112 | 266 | the malicious-package row: "Behavioral analysis …"; "Socket also scores …" | **Wrong in part** | fetched today: the GitHub Advisory Database republishes advisories, it does not analyse behaviour. Socket and Aikido: search snippets only. Snyk: not checked |
| 113 | 267 | the slopcheck tools "cross-check … against a corpus" | **Wrong in part** | fetched today: slopcheck queries the live registries; only DepScope is a corpus |
| 114 | 268 | the signature and provenance layer (Rekor, provenance attestations, PEP 740, GPG, NuGet, Go's checksum database) | VALIDATED; `cosign verify` itself NOT CHECKED | Rekor fetched today; the rest are rows 16–21 |
| 115 | 269 | "abandoned packages are slopsquatting bait"; deps.dev and Dependency-Track | **Does not fit line 45's own definition**; deps.dev and Dependency-Track NOT CHECKED; Scorecard VALIDATED (row 8) | — |
| 116 | 271 | `npm ci` runs lifecycle scripts including `preinstall`, `install`, `postinstall` | VALIDATED; the cited page is marked "Legacy" | row 2; the npm 12.2.0 page (the current one) shows the same list today |
| 117 | 271 | pip "involves running arbitrary code from distributions" | VALIDATED | row 3 |
| 118 | 271 | the pip-audit "functionally equivalent" quotation | VALIDATED | row 4 |
| 119 | 278–291 | the gate commands | VALIDATED | rows 1, 4–8 and 18; research gaps rows 80, 83, 86 and 88 |
| 120 | 294 | the `--ignore-scripts` quotation | VALIDATED; the cited page is marked "Legacy" | row 1; the same sentence is on the npm 12.2.0 page today |
| 121 | 294 | Socket's token permissions | VALIDATED | row 6 |
| 122 | 294 | cosign's "Either --certificate-identity …" | VALIDATED | row 7 |
| 123 | 294 | Scorecard's README: authenticate first; no score field, no threshold | VALIDATED for the README only | rows 9–10 |
| 124 | 294 | `go list -m -u all` "along with the latest version available for each" | VALIDATED | research gaps row 86 |
| 125 | 301 | `react-query` renamed in 2022 | VALIDATED (fetched today) | TanStack blog, "Jul 14, 2022", "previously known as react-query", `@tanstack/react-query` |
| 126 | 302 | `bcrypt` is Node-only; use `bcryptjs` | VALIDATED in substance | same basis as claim 51 |
| 127 | 303 | the two lines of Node.js's `fetch` history | VALIDATED | agent report B, item 4's corrected wording, word for word |
| 128 | 304 | `huggingface-cli` answers 404 today; the `hf` quotation; 2.0.0 lists no `cli` extra | VALIDATED | rows 30–31; session probes |
| 129 | 305 | `react-codeshift`'s description; created 2026-01-14 | VALIDATED | rows 32–33 |
| 130 | 305 | "the real tools are `jscodeshift` + `react-codemod`" | NOT CHECKED | — |
| 131 | 310 | `moment.formatISO()` becomes `moment().toISOString()` | VALIDATED | agent round 1 re-validation rows 32 and 73; the agent's identical row |
| 132 | 311 | `React.useAutoEffect` does not exist | VALIDATED | research gaps row 96 |
| 133 | 312 | axios GET has no `body`; use `params` | VALIDATED | agent round 3 re-validation row 23 |
| 134 | 313 | requests uses `json=` | VALIDATED | research gaps row 40 |
| 135 | 318 | `throwOnError` is "not a real option" | **Overstated** | agent round 2 validation row 41: the options go unchanged to a registered virtual-file-system handler |
| 136 | 319 | tokio's feature is `full` | VALIDATED | skill research row 65 |
| 137 | 320 | the built-in access methods | VALIDATED | skill research row 72 (the source also lists the bloom extension) |
| 138 | 324 | `docs/DISPATCH_PROTOCOL.md`; the wrapper's types, fields and confidence rules | VALIDATED | repository read |
| 139 | 328 | "the loop is **NOT RUNNING** today" | VALIDATED | repository read, `docs/REFINEMENT_LOOP.md` line 8 |
| 140 | 330 | the link to `warnings-are-critical.md` | VALIDATED | the file exists |
| 141 | 352 | the wrapper uses `registry_checked`, `registry_response` and the seven kinds | VALIDATED | repository read, agent lines 349 and 358–359 |
| 142 | 374 | `reference: https://docs.npmjs.com/cli/v10/commands/npm-view` | STALE | skill research row 101; today the version 11 page is "Version 11.21.0 (Legacy)" and the version 12 page is "Version 12.2.0 (Latest)" |
| 143 | 381 | "(v6.9.8)" | VALIDATED | the test file header |
| 144 | 383 | the `docs/REFINEMENT_LOOP.md` quotation | VALIDATED | repository read |
| 145 | 386 | the letter schema "rejects `warn`" | VALIDATED | repository read: its severity list is only critical, medium and low (schema line 72) |

## Claims that need action: exact text and corrected wording

**Needs correction**

1. **Line 56 (claims 39 and 40).**
   - File text: `Veracode's 2025 GenAI Code Security Report measured that AI-generated code introduced at least one security flaw in ~45% of tests (100+ models across Java, Python, C#, and JavaScript); combined with the 5–22% phantom-package rate, AI code must clear…`
   - Corrected: `Veracode's 2025 GenAI Code Security Report says "AI-generated code introduced risky security flaws in 45% of tests", for code "generated by over 100 large language models across Java, JavaScript, Python, and C#" (https://www.veracode.com/resources/analyst-reports/2025-genai-code-security-report/, read 2026-09-30); with the package-invention rates above, AI code must clear…`
   - The two Veracode sources disagree on what the 45% counts. The report page says "45% of tests"; the July 2025 blog post says "45% of code samples failed security tests". I have not resolved that.

2. **Line 57 (claim 41).**
   - File text: `Confidence follows the wrapper's table: a registry answer read during the check, or installed declaration files that lack the member after every re-export is followed, is HIGH on its own; a pattern hit alone is LOW.`
   - Corrected: `Confidence follows the wrapper's "Severity and confidence" table: a registry answer of status 200 or 404, read during the check, for the name the code needs, or installed declaration files that lack the member after every re-export is followed, is HIGH on its own, except where that table gives MEDIUM (a Maven Central 404, a Python import name no manifest maps to a distribution, a member missing only from plain source, a registration date set against a stated training cutoff); a pattern hit alone is LOW.`

3. **Line 261 (claim 110).**
   - File text: `The detection stack has matured around four layers — registry-check, malicious-package detection, signature verification, and supply-chain health — that compose into a single pre-merge gate.`
   - Corrected: `The table groups the tools into five layers; the gate below runs them in order.`

4. **Line 266 (claim 112).**
   - File text (third cell): `Behavioral analysis catches install-script malware, typosquatting and slopsquatting names; Socket also scores post-install scripts and network calls`
   - Corrected: `Report packages already identified as malicious. The GitHub Advisory Database carries "advisories about malicious open source packages", published "from the npm security team and the OpenSSF Malicious Packages repository" (https://docs.github.com/en/code-security/security-advisories/working-with-global-security-advisories-from-the-github-advisory-database/about-the-github-advisory-database, read 2026-09-30); how Socket, Snyk and Aikido detect malware was not checked`

5. **Line 267 (claim 113).**
   - File text: `| Slopsquatting-specific | Community **slopcheck** tools (e.g. the npm and Python CLIs of that name) and public known-hallucination corpora (e.g. the DepScope hallucinations dataset) | Cross-check imports against a corpus of names already observed as LLM hallucinations before install |`
   - Corrected: `| Slopsquatting-specific | **slopcheck** (for example https://github.com/experimental-gains/slopcheck, installed with pip) and the DepScope hallucinations dataset (https://github.com/cuttalo/depscope-hallucinations-dataset) | slopcheck: "Catch hallucinated / slopsquatted dependency names before you \`pip install\` or \`npm install\` them." It asks the live PyPI and npm registries, the same question as the wrapper's recipes. DepScope: a "Public corpus of verified LLM-generated package-name hallucinations observed in production AI coding agent traffic", licensed Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International. Both read 2026-09-30 |`
   - DepScope's own page disagrees with itself: its description says "19 package ecosystems" and its body says "161 entries across 18 ecosystems". The corrected wording avoids the count.
   - An npm command named slopcheck appeared only in a search snippet.

6. **Line 269 (claim 115).**
   - File text: `Maintenance signal — abandoned packages are slopsquatting bait`
   - Corrected: `Maintenance signal`
   - An abandoned package's name is already registered, so it is not a name a model invents (line 45's definition).

7. **Line 318 (claim 135).**
   - File text: `| \`fs.readFileSync(path, { throwOnError: true })\` | not a real option |`
   - Corrected: `| \`fs.readFileSync(path, { throwOnError: true })\` | not an option that \`readFileSync\` in Node.js's \`lib/fs.js\` reads (as the wrapper recorded it on 2026-09-30); a registered virtual-file-system handler receives the options unchanged (see the wrapper's "Configuration Options") |`

8. **Line 374 (claim 142).**
   - File text: `reference: https://docs.npmjs.com/cli/v10/commands/npm-view`
   - Corrected: `reference: https://docs.npmjs.com/cli/v12/commands/npm-view`
   - This line sits inside the letter schema but is none of the protected items.

**Should change: validated, but the text is out of date**

- **Line 52 (claim 34).** Replace `The **Sigstore Rekor** transparency log for any signed artifact is named here but was not checked.` with `Sigstore's **Rekor** "fulfils the signature transparency role of Sigstore's software signing infrastructure" (https://docs.sigstore.dev/logging/overview/, read 2026-09-30).`
- **Lines 271 and 294 (claims 116 and 120).**
  - Replace `…/cli/v11/using-npm/scripts` and `…/cli/v11/commands/npm-ci` with their `v12` addresses.
  - The version 11 pages now call themselves "Legacy". The quoted text is the same on "Version 12.2.0 (Latest)".

**Not checked: open, no correction made (the no-guesses rule does not apply to what I did not look up)**

| Line | Exact file text |
|---|---|
| 43 | `The hallucination landscape has shifted from "LLM gets the wrong name" to "attackers register the wrong name as malware."` |
| 53 | `` `.pyi` stubs / `module-info.java` / Cargo docs.rs `` (a code-level claim) |
| 72 | the National Vulnerability Database half of `NVD / CVE.org direct lookup` |
| 133 | `Stripe.net has no 'PaymentPro' namespace` (code-level) |
| 136 | `No such namespace; async is built into EF Core` (code-level) |
| 157 | `Jackson is writeValueAsString`, and whether `ObjectMapper.builder()` exists (code-level) |
| 165 | `javap -p <Class>   → list declared methods` (code-level) |
| 173 | `never had a 'pro'` (code-level) |
| 184 | `it downloads the module` (code-level) |
| 208 | the `.version.yanked` shape (code-level) |
| 217 | `not in core, not in contrib, not on PGXN` (code-level) |
| 266 | Snyk Open Source; Socket and Aikido beyond search snippets |
| 267 | the npm command named slopcheck |
| 268 | `cosign verify` |
| 269 | deps.dev and Dependency-Track |
| 305 | `the real tools are \`jscodeshift\` + \`react-codemod\`` |

- **Line 43:** my one search found a secondary source that reports an `unused-imports` case; I did not read the primary. If it stays unsourced, the recommendation is to cut that sentence.

## (B) Agent "Read the method first", item 2: consistent

Agent line 25 matches the replacement text prescribed in the critic's final change list (line 964) word for word. Against the skill as it now stands:

- **The skill no longer offers the old existence tests.**
  - `pip index versions` appears nowhere in the skill.
  - `npm view` appears only at line 47, as "is not proof", and at lines 100 and 102. Those two are per-language verification lines marked "the wrapper's npm recipe is the full check", which item 2 correctly treats as examples.
- **The NuGet and Go addresses** at skill lines 48, 49, 143 and 183 are recorded observations. Skill lines 47 and 240 say names from those registries are recorded as not checked. That matches the agent's "No recipe here" paragraph at line 219. The pointer in item 2 finds that paragraph by its bold lead-in; it is not a heading.
- **Two small gaps, neither a contradiction:**
  - Item 2 mentions only NuGet and Go, not Postgres. Skill line 247 ("checked only on a server you are allowed to query") and the SQL lines 227–229 show queries that agent line 219 says not to run. Agent item 5 (the agent wins) settles it. An optional addition to item 2: "…and a database query for Postgres extensions…".
  - Agent line 22 still promises "examples across seven languages". Skill line 234 says there is no checked C or C++ example yet. This is the critic's known cross-file finding 4, carried forward.

## Structural checks

- **The five strings `tests/critic-warnings-are-critical.test.js` pins (lines 71–89) are all present:**
  - `Refinement Loop — critic mode` at line 381;
  - `warnings-are-critical` at lines 330 and 383;
  - `refinement-loop-schema\.json` at line 386;
  - `docs\/REFINEMENT_LOOP\.md` at lines 328 and 383;
  - `severity:\s*critical` (not case-sensitive) at lines 330, 356 and 385.
- **`when_to_load`** gained exactly "package hallucination" and "library hallucination" and lost nothing. The eight earlier entries are unchanged and in the same order.
- **The frontmatter:** there is no `allowed-tools:` key (only `tools: Read, Grep, Bash`, line 23), and `type: skill` at line 4 is unchanged.
- **The round-1 research note holds no copy** of the triage table, the kinds, the fields, the headings or the red line, so there was nothing there to compare against.
  - The triage table, the seven `kind` values, `registry_checked`, `registry_response` and the five headings the agent quotes appear in **no** `old` block of the critic's final change list, so none of the changes touched them.
  - The red line (`- NEVER auto-install … attack path.`) is the whole `old` block of change 1h. It comes back unchanged as the first line of the new text, with the new red line added after it.
- **A second check of the same items:**
  - I matched all 19 of those lines, each as a complete line, in both the current file and the installed marketplace copy. They are identical in both.
  - I believe the marketplace copy is the pre-edit file, because its line numbers match every original line the research note cites. I could not confirm that by fingerprint.

## Counts (145 claims)

| Verdict | Count |
|---|---|
| Validated | 127 |
| — by a prior report or the session's probes | 110 |
| — by repository read | 13 |
| — by my fetches today (claims 34, 39, 106, 125) | 4 |
| Needs correction (claims 40, 41, 110, 112, 113, 115, 135, 142) | 8 |
| Not checked (claims 2, 35, 63, 64, 71, 76, 83, 91, 94, 130) | 10 |
| Fabricated | 0 |

Some claims counted as validated or as needing correction still have a part that was not checked: claims 47, 78, 112, 113, 114 and 115.

## Fetches, in order (19 of 20)

1. Search: the Veracode 2025 report (limited to veracode.com)
2. docs.pypi.org/api/integrity/
3. docs.npmjs.com/cli/commands/npm-view (came back empty)
4. docs.sigstore.dev/logging/overview/
5. veracode.com/blog/genai-code-security-report/
6. docs.npmjs.com/cli/v11/commands/npm-view
7. veracode.com/resources/analyst-reports/2025-genai-code-security-report/
8. docs.npmjs.com/cli/v12/commands/npm-view
9. docs.npmjs.com/cli/v12/commands/npm-ci
10. docs.npmjs.com/cli/v12/using-npm/scripts
11. Search: slopcheck
12. Search: DepScope
13. github.com/experimental-gains/slopcheck
14. github.com/cuttalo/depscope-hallucinations-dataset
15. tanstack.com/blog/announcing-tanstack-query-v4
16. Search: Aikido Intel
17. docs.github.com, the page about the GitHub Advisory Database
18. Search: slopsquatting cases in the wild
19. Search: Socket's alerts (limited to socket.dev)

No page I fetched addressed a reviewer or gave instructions.

## What I did not check

- **The SHA-256 fingerprints of either file.** I have no shell.
- **Exact wording of web quotations.** Every quotation I fetched came through the fetch tool's summarising model, not as raw bytes. The Rekor sentence says "signature transparency role"; I did not see the word "log" in it.
- **The later Veracode updates** (October 2025 and Spring 2026): I saw their titles only.
- **The primary source for line 43.**
- **Every claim marked not checked above.** The code-level ones among them belong to hallucination-detector, not to me.

```yaml
response:
  dispatch_id: "d-s4-skill-r1-revalidate"   # does not match the schema's 26-character pattern
  protocol_version: 1
  agent: ai-quality/citation-validator
  agent_version: "not stated"
  completed_at: null        # no shell to read the date
  findings:
    - {id: citation-validator/d-s4-skill-r1-revalidate/001, severity: high, type: citation-misattributed, file: skills/ai-quality/hallucination-detector/SKILL.md, line_range: [56, 56], message: "'5–22% phantom-package rate' is the 2023–24 averages presented as current; research row 4 marked it stale; the Veracode claim has no address", suggestion: "correct-to the line-56 wording above", confidence: HIGH, confidence_rationale: "Veracode report page quoted today; research row 4", citations: {brief_url: "https://www.veracode.com/resources/analyst-reports/2025-genai-code-security-report/", evidence: [{file: skills/ai-quality/hallucination-detector/SKILL.md, line_range: [56, 56]}]}}
    - {id: citation-validator/d-s4-skill-r1-revalidate/002, severity: medium, type: repository-inconsistency, file: skills/ai-quality/hallucination-detector/SKILL.md, line_range: [57, 57], message: "says any registry answer is HIGH; the wrapper gives MEDIUM for a Maven Central 404 and three other cases", suggestion: "correct-to the line-57 wording above", confidence: HIGH, confidence_rationale: "agent lines 331–333 read today"}
    - {id: citation-validator/d-s4-skill-r1-revalidate/003, severity: high, type: citation-misattributed, file: skills/ai-quality/hallucination-detector/SKILL.md, line_range: [266, 267], message: "the GitHub Advisory Database republishes advisories and does not analyse behaviour; slopcheck queries live registries and is not a corpus", suggestion: "correct-to the line-266 and line-267 wording above", confidence: MEDIUM, citations: {brief_url: "https://github.com/experimental-gains/slopcheck"}}
    - {id: citation-validator/d-s4-skill-r1-revalidate/004, severity: medium, type: internal-inconsistency, file: skills/ai-quality/hallucination-detector/SKILL.md, line_range: [261, 269], message: "'four layers' but the table has five rows; 'abandoned packages are slopsquatting bait' does not fit the line-45 definition", suggestion: strip-the-specificity, confidence: HIGH}
    - {id: citation-validator/d-s4-skill-r1-revalidate/005, severity: low, type: citation-overstated, file: skills/ai-quality/hallucination-detector/SKILL.md, line_range: [318, 318], message: "'not a real option' is stronger than the checked fact (the options go to a virtual-file-system handler)", suggestion: "correct-to the line-318 wording above", confidence: HIGH}
    - {id: citation-validator/d-s4-skill-r1-revalidate/006, severity: high, type: citation-misattributed, file: skills/ai-quality/hallucination-detector/SKILL.md, line_range: [374, 374], message: "npm documentation version 10 is Legacy; the current page is 'Version 12.2.0 (Latest)'", suggestion: "correct-to https://docs.npmjs.com/cli/v12/commands/npm-view", confidence: HIGH, citations: {brief_url: "https://docs.npmjs.com/cli/v12/commands/npm-view"}}
    - {id: citation-validator/d-s4-skill-r1-revalidate/007, severity: info, type: citation-validated, file: skills/ai-quality/hallucination-detector/SKILL.md, line_range: [52, 52], message: "Rekor confirmed; the 'not checked' note is out of date", suggestion: "correct-to the line-52 wording above", confidence: MEDIUM, citations: {brief_url: "https://docs.sigstore.dev/logging/overview/"}}
    - {id: citation-validator/d-s4-skill-r1-revalidate/008, severity: low, type: malformed-fingerprint, file: .ctoc/audit/improvement-run-notes/s4-skill-round1-critic-final-d-s4-skill-r1-critic.md, line_range: [12, 12], message: "the pre-edit SHA-256 value has 63 hexadecimal characters", suggestion: "record the full 64-character value", confidence: HIGH}
  self_assessment:
    coverage: 0.93          # 135 of 145 claims given a verdict
    confidence_overall: MEDIUM
    limitations: ["web quotations came through a summarising tool", "no shell: fingerprints not computed; I believe the marketplace copy is the pre-edit file but did not prove it", "19 of 20 fetches used"]
    unknowns: ["line 43 primary source", "the National Vulnerability Database", "Snyk, deps.dev, Dependency-Track; Socket and Aikido beyond search snippets", "npm command named slopcheck", "cosign verify", "jscodeshift and react-codemod", "code-level claims at lines 53, 133, 136, 157, 165, 173, 184, 208, 217 (hallucination-detector's)"]
  metadata: {tokens_used: null, tool_calls: 48}
```

Files:
- `/Users/account/Code/ctoc/skills/ai-quality/hallucination-detector/SKILL.md`
- `/Users/account/Code/ctoc/agents/ai-quality/hallucination-detector.md`
- `/Users/account/Code/ctoc/tests/critic-warnings-are-critical.test.js`
- `/Users/account/Code/ctoc/.ctoc/audit/improvement-run-notes/s4-skill-round1-critic-final-d-s4-skill-r1-critic.md`
- `/Users/account/.claude/plugins/marketplaces/robotijn/skills/ai-quality/hallucination-detector/SKILL.md` (the copy I believe is pre-edit)

Sources:
- [Veracode 2025 GenAI Code Security Report](https://www.veracode.com/resources/analyst-reports/2025-genai-code-security-report/) · [Veracode blog, July 2025](https://www.veracode.com/blog/genai-code-security-report/)
- [PyPI Integrity API](https://docs.pypi.org/api/integrity/) · [Sigstore Rekor overview](https://docs.sigstore.dev/logging/overview/)
- [npm view v11](https://docs.npmjs.com/cli/v11/commands/npm-view) · [npm view v12](https://docs.npmjs.com/cli/v12/commands/npm-view) · [npm ci v12](https://docs.npmjs.com/cli/v12/commands/npm-ci) · [npm scripts v12](https://docs.npmjs.com/cli/v12/using-npm/scripts)
- [slopcheck (experimental-gains)](https://github.com/experimental-gains/slopcheck) · [DepScope hallucinations dataset](https://github.com/cuttalo/depscope-hallucinations-dataset) · [TanStack Query v4 announcement](https://tanstack.com/blog/announcing-tanstack-query-v4)
- [About the GitHub Advisory Database](https://docs.github.com/en/code-security/security-advisories/working-with-global-security-advisories-from-the-github-advisory-database/about-the-github-advisory-database) · [Aikido Intel malware](https://intel.aikido.dev/malware) · [Socket install-scripts alert](https://socket.dev/alerts/installScripts) · [Cloud Security Alliance note on slopsquatting (snippet only)](https://labs.cloudsecurityalliance.org/research/csa-research-note-slopsquatting-ai-supply-chain-20260419-csa/)