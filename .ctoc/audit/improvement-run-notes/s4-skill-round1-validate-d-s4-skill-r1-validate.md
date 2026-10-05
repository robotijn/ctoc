**Validation of the round-1 changes to `skills/ai-quality/hallucination-detector/SKILL.md` (dispatch `d-s4-skill-r1-validate`)**

**Result:** don't apply this as written. Of 77 statements, 55 hold (35 of them fetched by me today). Eight need fixing first:

- **Change 3d, `react-codeshift`: refuted.** The quotation "A placeholder package intended to prevent dependency confusion attacks" appears nowhere in the registry entry. The description reads "🚫 Placeholder to prevent dependency confusion." and the readme reads "🚫 This is a placeholder published to prevent dependency confusion."
- **Change 3d, Hugging Face: not found as quoted.** "The CLI command is `hf`" did not come back from my read of the guide. The page gave "The `huggingface_hub` Python package comes with a built-in CLI called `hf`." The fact itself holds.
- **Change 3a, the npm 404 message: wrong context.** Issue 8736 shows "npm error code E404" from `npm i`, not from `npm view`. The 404 there is caused by a bug that builds the wrong address, not by a missing package.
- **Change 1c, Maven Central's search guide: partly misattributed.** The guide documents the `fc:` class search but never mentions `numFound`; that field only appears in the live answer.
- **Change 5a, the Go blog: half unsourced.** The post supports "the same code for everyone". It does not say "not safe code".
- **Change 4, the model names: not a real quotation.** "ChatGPT 4.0, 4.0 Turbo, 3.5 Turbo" squeezes three rows of Table 1 into one quoted string.
- **Change 1g, two smaller corrections.** The quoted "preinstall, install, postinstall" is the first three items of a seven-item list, not a sentence. My check that Scorecard names no JSON score field or threshold covered the README only, not the wider documentation.
- **Change 5a and the wrapper agent file:**
  - 5a says each wrapper recipe spots placeholder names, but only the npm and PyPI recipes do.
  - Change 1e sends NuGet and Go to raw addresses, while the wrapper says to record those names as "not checked".

**One correction to the brief.** It lists `serde_json_ext` and the Churilov figures as already validated. No agent-file validation report contains either one; they appear only in this skill's own research note. I fetched Churilov myself. `serde_json_ext` is not checked. The same goes for `react-query`'s "3.39.3".

## Fetches, in order (35 of 35)

1. docs.npmjs.com/cli/v11/commands/npm-ci
2. docs.npmjs.com/cli/v11/using-npm/scripts
3. pip.pypa.io/en/stable/topics/secure-installs/
4. github.com/pypa/pip-audit
5. docs.socket.dev/docs/socket-ci
6. github.com/sigstore/cosign/…/cosign_verify-attestation.md
7. github.com/ossf/scorecard
8. learn.microsoft.com/en-us/dotnet/core/tools/dotnet-package-search
9. api.nuget.org/v3-flatcontainer/newtonsoftex.advancedjson/index.json (404)
10. proxy.golang.org/github.com/uber-go/cachepro/@v/list (404)
11. proxy.golang.org/github.com/aws/aws-sdk-go-v2/service/secretsmanager/@v/list
12. central.sonatype.org/publish/requirements/gpg/
13. docs.npmjs.com/generating-provenance-statements
14. docs.npmjs.com/verifying-registry-signatures
15. docs.pypi.org/attestations/
16. docs.pypi.org/trusted-publishers/
17. proxy.golang.org
18. go.dev/blog/module-mirror-launch
19. doc.rust-lang.org/cargo/commands/cargo-search.html
20. search.maven.org, `q=a:commons-security`
21. search.maven.org, `q=fc:org.apache.commons.security.PasswordValidator`
22. central.sonatype.org/search/rest-api-guide/
23. github.com/npm/cli/issues/8736
24. registry.npmjs.org/zod/latest
25. huggingface.co/docs/huggingface_hub/guides/cli
26. pypi.org/pypi/huggingface_hub/json
27. registry.npmjs.org/react-codeshift
28. registry.npmjs.org/react-smart-cache (404)
29. arxiv.org/abs/2605.17062 (Churilov)
30. arxiv.org/abs/2502.13622 (REFIND)
31. arxiv.org/abs/2509.09360 (MetaRAG)
32. arxiv.org/abs/2601.19106 (Khati)
33. docs.conan.io/2/introduction.html
34. learn.microsoft.com/en-us/vcpkg/concepts/registries
35. registry.npmjs.org/react-codeshift again, this time checking the readme

**Not counted against the budget:**
- **The USENIX paper.** I read printed pages 3687–3693 as page images from the copy of the PDF that the round-2 validation saved today (`…/tool-results/webfetch-1790790330893-6989qo.pdf`).
- **Repository reads:** the two test files, `docs/REFINEMENT_LOOP.md`, the wrapper agent file and the prior validation reports.

Every quotation from an ordinary web page came through the fetch tool's summarising model, not as raw bytes. No page I fetched addressed a reviewer or tried to give me instructions.

## The four addresses the critic lacked

| For | Address found |
|---|---|
| `dotnet package search` (changes 1b and 5a) | https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-package-search |
| `cargo search` (changes 6c and 6d) | https://doc.rust-lang.org/cargo/commands/cargo-search.html |
| Maven Central queries (change 1c) | https://search.maven.org/solrsearch/select?q=a:commons-security&rows=20&wt=json and https://search.maven.org/solrsearch/select?q=fc:org.apache.commons.security.PasswordValidator&rows=20&wt=json |
| PostgreSQL pages (changes 12a–12d) | **Not found.** The budget ran out before I reached them. |

## Every checked statement

| # | Change | Text | Verdict | Source and what I saw | Corrected wording |
|---|---|---|---|---|---|
| 1 | 1g | `--ignore-scripts`: "npm does not run scripts specified in package.json files" | VALIDATED | npm-ci page: "If true, npm does not run scripts specified in package.json files." The page labels itself "Version 11.21.0 (Legacy)"; I did not identify the current version. | keep |
| 2 | 1g | `npm ci` runs "preinstall, install, postinstall" | VALIDATED in substance, not word for word | The scripts page, under its `npm ci` heading, lists preinstall, install, postinstall, prepublish, preprepare, prepare, postprepare | "`npm ci` runs lifecycle scripts including `preinstall`, `install` and `postinstall` (…scripts, read 2026-09-30)", without quotation marks |
| 3 | 1g | pip "involves running arbitrary code from distributions" | VALIDATED | "By default, pip does not perform any checks to protect against remote tampering and involves running arbitrary code from distributions." | keep |
| 4 | 1g | "`pip-audit -r INPUT` is functionally equivalent to `pip install -r INPUT`" | VALIDATED | README, "Security Model": "For all intents and purposes, `pip-audit -r INPUT` is functionally equivalent to `pip install -r INPUT`, with a small amount of **non-security isolation**…" | keep |
| 5 | 1g | `socket ci` is an alias for `socket scan create --report` | VALIDATED | "Alias for `socket scan create --report` (creates report and exits with error if unhealthy)" | keep |
| 6 | 1g | The token needs `full-scans:create`, `full-scans:list` and `security-policy:read` | VALIDATED | "…needs the `full-scans:create`, `full-scans:list`, and `security-policy:read` permissions." | keep |
| 7 | 1g | cosign needs "--certificate-identity" and "--certificate-oidc-issuer" or their regular-expression forms | VALIDATED | "Either --certificate-identity or --certificate-identity-regexp must be set for keyless flows." The same sentence exists for the issuer. `slsaprovenance` is an accepted `--type` value. | keep |
| 8 | 1g | Scorecard's command with `--format=json` | VALIDATED | README example: `./scorecard --repo=github.com/ossf-tests/… --format=json` | keep |
| 9 | 1g | "whose documentation names no JSON score field and no risk threshold" | VALIDATED for the README only | **How I checked this negative:** one read of the README, asking (a) whether any JSON field for the score is named and (b) whether any numeric threshold is given. The answer was none for both. I did not read the rest of Scorecard's documentation, and this was not a byte-level search. | "whose README names no JSON score field and no risk threshold" |
| 10 | 1g | `GITHUB_AUTH_TOKEN=<token>` | NOT CHECKED | The README says "you must authenticate your requests before running Scorecard". The variable's name was not quoted back to me. | — |
| 11 | 1b, 5a | `--exact-match`; ".NET 8.0.2xx SDK and later" | VALIDATED | "This article applies to: ✔️ .NET 8.0.2xx SDK and later versions". `--exact-match` "narrows the search to only include packages whose IDs exactly match" | keep, and add the address above |
| 12 | 1b, 5a | NuGet's version list answered 404 for `newtonsoftex.advancedjson` | VALIDATED | 404 Not Found | keep |
| 13 | 1d, 5a | The Go proxy answered 404 for `github.com/uber-go/cachepro` | VALIDATED | 404 Not Found | keep |
| 14 | 5a, 11 | `…/service/secretsmanager` is a separate module with its own version list | VALIDATED | A body came back with 387 version lines. The tool did not report the status code, but it reports 404s explicitly. The critic's own notes say "391", but that number is not in any new text. | keep |
| 15 | 5a | `github.com/aws/aws-sdk-go-v2/secrets` answered 404 at the proxy | NOT CHECKED | Budget | — |
| 16 | 5a | "One of the requirements for publishing … is that they have been signed with PGP" | VALIDATED | "One of the requirements for publishing your artifacts to the Central Repository, is that they have been signed with PGP." | keep |
| 17 | 5a | npm provenance comes from GitHub Actions or GitLab, through Sigstore | VALIDATED | "Today this includes GitHub Actions and GitLab CI/CD."; "signed by Sigstore public good servers" | keep |
| 18 | 1e, 5a | `npm audit signatures` verifies provenance, and is npm's verification command | VALIDATED | Provenance page: "You can verify the provenance attestations of downloaded packages with … `npm audit signatures`". The registry-signatures page names it for registry signatures only. | keep; in change 1e the provenance page is the better citation |
| 19 | 5a, 6b | "PyPI's implementation of digital attestations (PEP 740)" | VALIDATED | "These pages document PyPI's implementation of digital attestations (PEP 740)…" | keep |
| 20 | 5a | OpenID Connect "to exchange short-lived identity tokens", for uploads | VALIDATED | "…using the OpenID Connect (OIDC) standard to exchange short-lived identity tokens between a trusted third-party service and PyPI." | keep |
| 21 | 5a | "an auditable checksum database … used by the go command to authenticate modules" | VALIDATED | "an auditable checksum database which will be used by the go command to authenticate modules." The ellipsis stands for "which will be". | keep |
| 22 | 5a | The checksum database "makes everyone receive the same code, not safe code" (Go blog) | "Same code" VALIDATED; "not safe code" UNSOURCEABLE from this post | The post (Katie Hockman, 29 August 2019): "ensures that the `go` command always adds the same lines to everyone's `go.sum` file". The tool found nothing in it about safety. | "…the checksum database "ensures that the `go` command always adds the same lines to everyone's `go.sum` file" (https://go.dev/blog/module-mirror-launch, read 2026-09-30); that shows everyone received the same code, not that the code is safe." The second half is the file's own reasoning, not the blog's. |
| 23 | 6c, 5a | cargo search is a "textual search" with a default limit of 10 | VALIDATED | "This performs a textual search for crates on https://crates.io."; "Limit the number of results (default: 10, max: 100)." | keep, and add the address |
| 24 | 1c | `commons-security` exists under three other groups | VALIDATED | numFound 3: `cn.aotcloud`, `org.eu.vooo`, `com.itxiaoer.commons`. None is `org.apache.commons`. "Unrelated" is an inference. | keep, and add the address |
| 25 | 1c | The `fc:` search for `org.apache.commons.security.PasswordValidator` found 0 | VALIDATED | numFound 0; the list of results was empty | keep |
| 26 | 1c | Central's search "accepts a fully qualified class name (fc:) and reports numFound" (cites the guide) | MISATTRIBUTED in part | The guide says "Mimics searching by fully-qualified classname … Returns a list of artifacts, down to the specific version containing the class". It never mentions `numFound`. | "Central's search guide documents a class-name search, `fc:`, that "Returns a list of artifacts, down to the specific version containing the class" (…rest-api-guide/, read 2026-09-30); https://search.maven.org/solrsearch/select?q=fc:org.apache.commons.security.PasswordValidator&rows=20&wt=json answered numFound 0 on 2026-09-30" |
| 27 | 3a | Under `npm view`: "npm 11.6.2 prints "npm error code E404"" | MISATTRIBUTED (the context) | Issue 8736 (npm 11.6.2): "npm error code E404" comes from `npm i`, and the 404 is caused by a bug in how the address is built | "→ npm 11 reports a 404 as "npm error code E404" (seen from `npm i` in https://github.com/npm/cli/issues/8736, npm 11.6.2; `npm view`'s own output not observed)" |
| 28 | 3a | zod 4.6.5's "exports" include "./v4", "./v4-mini", "./v3" and "./mini", and no "./schemas" | VALIDATED | Version 4.6.5. The keys include all four, and "./schemas" is absent. | keep |
| 29 | 3a | `react-smart-cache` answered 404 | VALIDATED | 404 Not Found | keep |
| 30 | 3d | "The CLI command is `hf`" | UNSOURCEABLE as quoted; the fact is validated | The guide's sentence is "The `huggingface_hub` Python package comes with a built-in CLI called `hf`." It installs with `pip install -U "huggingface_hub"`. One read through the summarising tool. | Quote "The `huggingface_hub` Python package comes with a built-in CLI called `hf`." |
| 31 | 3d | huggingface_hub 2.0.0 lists no `cli` extra | VALIDATED | `provides_extra` has 11 entries, none of them `cli` | keep |
| 32 | 3d | "A placeholder package intended to prevent dependency confusion attacks" | **REFUTED** (misquotation) | I checked the whole registry document for the exact phrase: absent. Description: "🚫 Placeholder to prevent dependency confusion." | "now registered with the description "Placeholder to prevent dependency confusion." (…react-codeshift, read 2026-09-30)" |
| 33 | 3d | `react-codeshift` created 2026-01-14 | VALIDATED | `time.created` 2026-01-14T21:02:51.762Z; maintainer debugducky | keep |
| 34 | 4 | "at least 5.2% for commercial models and 21.7% for open-source models" | VALIDATED, page 3687 | Abstract: "the average percentage of hallucinated packages is at least 5.2% for commercial models and 21.7% for open-source models" | Optional: say "average", and add page 3687 |
| 35 | 4 | The commercial models were "ChatGPT 4.0, 4.0 Turbo, 3.5 Turbo" | VALIDATED in substance, not word for word | Table 1, page 3692 has three separate rows: "ChatGPT 4.0", "ChatGPT 4.0 Turbo", "ChatGPT 3.5 Turbo" | "the commercial models were ChatGPT 4.0, ChatGPT 4.0 Turbo and ChatGPT 3.5 Turbo (Table 1, page 3692)", without quotation marks |
| 36 | 4 | 576,000 samples; 16 models; Python and JavaScript | VALIDATED | Page 3687: "Using 16 popular LLMs … we generate 576,000 code samples in two programming languages"; pages 3688 and 3692 name Python and JavaScript | keep |
| 37 | 4 | Registry lists as of 10 January 2024 | VALIDATED, page 3693 | "(each list is as of 10 January, 2024)" | keep |
| 38 | 4 | Churilov: "between 4.62% (Claude Haiku 4.5) and 6.10% (GPT-5.4-mini)" | VALIDATED by my own fetch; no prior report has it | The abstract has the exact words. Version 3 is dated 9 August 2026. | keep |
| 39 | 4 | Churilov tested "five current models" | NOT CHECKED | The abstract I read does not give the number of models | — |
| 40 | 4 | "an independent preprint not shown as peer-reviewed" | VALIDATED | Affiliation "Independent Researcher"; the comments field names no venue | keep |
| 41 | 4 | The attack sentence, pages 3687–3688 | VALIDATED by report, and seen today | Round 2, row 18; also visible on today's page images | keep |
| 42 | 4 | Krishna: "was first registered after the model's knowledge cutoff date" | VALIDATED by report | Round-1 report A, row 39; identical character for character | keep |
| 43 | 4 | "Trivial cross-referencing methods …", page 3688 | VALIDATED by report, and seen today | Round 2, row 21; the round-2 revalidation text is identical | keep |
| 44 | 4 | The four confusion classes, "citing earlier work", page 3688 | VALIDATED by report, and seen today | Round 2, row 12 (the paper's reference 28) | keep |
| 45 | 4 | The SLSA sentence on dependency confusion | VALIDATED by report | Round 2, row 3; identical | keep |
| 46 | 9a | REFIND: Lee and Yu; "detects hallucinated spans within LLM outputs by directly leveraging retrieved documents"; "accepted to SemEval@ACL 2025"; the abstract does not mention citations | VALIDATED | The comments field reads "Accepted to SemEval@ACL 2025". The abstract does not mention citations. | keep |
| 47 | 9a | MetaRAG: Sok, Luz and Haddam; "localizes unsupported claims at the factoid span where they occur"; no mention of citations | VALIDATED | The same words. Submitted 11 September 2025, for a workshop at the 28th European Conference on Artificial Intelligence. | keep |
| 48 | 9b | Khati: "accepted to FORGE 2026"; "100% precision and 87.6% recall (0.934 F1-score)"; "a manually-curated dataset of 200 Python snippets" | VALIDATED | All three strings are present | keep |
| 49 | 10 | ConanCenter is "a central public repository where the community contributes packages for popular open-source libraries" | VALIDATED | The sentence continues "like Boost, Zlib…". The conan-center-index link is on the page. | keep |
| 50 | 10 | vcpkg "hosts a selection of libraries … This collection of ports is called the curated registry"; each port under `ports/<name>` | VALIDATED | Identical; "the files for port `foo` is located in `ports/foo`" | keep |
| 51 | 10 | "Java, C, or C++ do not rely on a centralized open-source repository" | VALIDATED, page 3692 | "Other popular programming languages like Java, C, or C++ do not rely on a centralized open-source repository, as Python and JavaScript do…" | Optional: add "page 3692" |
| 52 | 12a, 12b, 12c, 12d | `pg_available_extensions` lists only what that server can install; `\dx+` needs the extension installed; `pg_am` `amtype` 'i' and 't' | NOT CHECKED (three statements) | Budget; addresses not found | — |
| 53 | 3c | pgvector: `CREATE EXTENSION vector;` | NOT CHECKED | Budget | — |
| 54 | 13 | CVE.org answered 404 for CVE-2025-99999 | NOT CHECKED | Budget; this rests only on the research-gaps note | — |
| 55 | 1a | `validate_password(password, user=None, password_validators=None)` | NOT CHECKED | Budget | — |
| 56 | 1a, 3d | PyPI answers 404 for `huggingface-cli` today | NOT CHECKED | Budget | — |
| 57 | 2a | The `tests/skill-loading.test.js` lines 9–13 statement | VALIDATED (repository read) | "They are not a registration … nothing loads a specialist on a phrase match. Specialists are reached by an agent reading the body by path." | keep |
| 58 | 2b, 2c, 2d | "the loop is **NOT RUNNING** today" | VALIDATED (repository read) | `docs/REFINEMENT_LOOP.md` line 8 | keep |
| 59 | 5a | `fs` latest "0.0.1-security" | VALIDATED by report | Report A, row 8 | keep |
| 60 | 5b | `crossenv`, "security holding package" | VALIDATED by report | Report A, row 21 | keep |
| 61 | 3a | `email-validator-pro` registered since 2017-05-18 | VALIDATED by report | Report A, row 32 | keep |
| 62 | 3b | `tokio_advanced` answered 404 at `index.crates.io/to/ki/…` | VALIDATED by report | Report A, row 34 | keep |
| 63 | 3b | `serde_json_ext` on crates.io since 2026-01-28 | NOT CHECKED | No validation report contains it | — |
| 64 | 3a | `react-query` still installs; latest "3.39.3" | "Still installs" VALIDATED by report; "3.39.3" NOT CHECKED | Round-1 revalidation, row 21 | — |
| 65 | 15 | The Node.js `fetch` history lines | VALIDATED by report | The round-1 report B correction is identical character for character | keep |
| 66 | 6d | The crates.io policy quotations | VALIDATED by report | Report A, row 18 | keep |
| 67 | 6d | The Rust Reference hyphen sentence | VALIDATED by report | Round 3, rows 28–29 | keep |
| 68 | 1e | The sigstore provenance address answered 200 with and without the `Accept` header | VALIDATED by the session's own run | Round-3 session runs, item (d) | keep |
| 69 | 1e | `dist.attestations` and `_npmUser.trustedPublisher` on `sigstore/latest` | VALIDATED by report | Session run (f); round 3, row 11 | keep |
| 70 | 1e | The PyPI integrity page says the address "answers 404 when a file has no provenance" | NOT CHECKED | Research note only | — |
| 71 | 6a | `dotnet package list --vulnerable` from .NET 10 | NOT CHECKED | Budget | — |
| 72 | 10, 4 | The USENIX PDF address without `www.` | NOT CHECKED | Only the `www.` form has been fetched (round 2) | — |
| 73 | 5a | The wrapper's recipes "each tell" a placeholder name apart | **Inconsistent with the wrapper** | An exact search of the wrapper finds a placeholder verdict only for npm and PyPI ("HELD BY NPM", "HELD BY PYPI"; lines 158, 185, 192, 223) | "the npm and PyPI recipes also tell a name the registry holds as a placeholder apart; all four report a name it does not have and an answer they could not read" |
| 74 | 1e | "the addresses under "2026 Best Practices" above for NuGet and Go" | **Inconsistent with the wrapper** | Wrapper line 219: "No recipe here. NuGet, the Go module proxy …: record each name … as not checked"; for Postgres it says "do not run it". Change 2a says the wrapper wins. | Make NuGet and Go "not checked" until the wrapper has recipes. This matches the critic's own item 3 for the coordinator. |

## Counts

| Verdict | Count |
|---|---|
| Validated, fetched by me today | 35 |
| Validated in substance, wording needs fixing | 3 (rows 2, 9, 35) |
| Validated by repository read | 2 |
| Validated by prior report or the session's own run | 15 |
| Misattributed | 2 (rows 26, 27) |
| Refuted | 1 (row 32) |
| Unsourceable as written | 2 (rows 22, 30) |
| Stale | 0 (the npm version-11 pages label themselves "Legacy"; see row 1) |
| Inconsistent with the wrapper | 2 (rows 73, 74) |
| Not checked | 15 |
| **Total** | **77** |

## Tests, checked by reading the tests' actual assertions

- **`tests/critic-warnings-are-critical.test.js`, lines 71–89.** It pins five patterns. All five still match after the changes:
  - "Refinement Loop — critic mode": the heading on line 428 is untouched.
  - "warnings-are-critical": line 378 is kept, because change 2b only adds text before its first sentence, and change 2d's new text contains the link.
  - "refinement-loop-schema.json": line 433 is untouched.
  - "docs/REFINEMENT_LOOP.md": present in the new text of 2b and 2d.
  - "severity: critical" (not case-sensitive): still on lines 378, 403 and 432. Change 1g removes only line 301's copy.
- **`tests/skill-loading.test.js`.** The new triggers "package hallucination" and "library hallucination" parse as list items. No prompt in the trigger corpus (lines 38–197) contains either phrase, so no match changes and the 90% bar is unaffected.

## Wording a person reads, in the new text

- **Gate numbers:** none.
- **Invented abbreviations:** none.
- **Unexpanded acronyms in prose** (fixable):
  - "API reference" in 1a and 1b
  - "SDK" in 1b and 5a
  - "JSON" in 1g
  - "PEP" in the 6b heading
  - "CVE Program" in 13
- **Inside verbatim quotations or proper names** (keep, or add an explanation):
  - "PGP", "(PEP 740)", "CLI" (3d and 15), "LLM"/"LLMs" (4 and 9a), "F1-score"
  - "SemEval@ACL", "FORGE", "USENIX", "E404"

## Not checked, plainly

- Rows 10, 15, 39, 52–56, 63, 64 ("3.39.3"), 70, 71 and 72. The budget of 35 was exhausted.
- **The PostgreSQL addresses** were not found.
- **Byte-exactness:** no ordinary web page was read as raw bytes; each came through the summarising tool. Scorecard's negative (row 9) comes from one such read of the README. Only the USENIX page images were read directly.
- **Code-level claims,** which belong to hallucination-detector, not to me:
  - `npm view … exports --json`
  - "go list -m -u all … is not an audit"
  - the claim that nuget.org signs every package (change 16)
  - the `.version.yanked` shape

```yaml
response:
  dispatch_id: "d-s4-skill-r1-validate"
  protocol_version: 1
  agent: ai-quality/citation-validator
  agent_version: "not stated"
  completed_at: null
  findings:
    - {id: citation-validator/d-s4-skill-r1-validate/001, severity: critical, type: citation-fabricated, file: .ctoc/audit/improvement-run-notes/s4-skill-round1-critic-d-s4-skill-r1-critic.md, line_range: [495, 495], message: "react-codeshift quotation absent from the whole registry document; description is '🚫 Placeholder to prevent dependency confusion.'", suggestion: "correct-to: \"Placeholder to prevent dependency confusion.\"", confidence: HIGH, confidence_rationale: "Two fetches: the description field, then an exact-phrase check of every text field.", citations: {brief_url: "https://registry.npmjs.org/react-codeshift"}}
    - {id: citation-validator/d-s4-skill-r1-validate/002, severity: high, type: citation-unsourceable, line_range: [494, 494], message: "'The CLI command is `hf`' not found; the page sentence is 'The `huggingface_hub` Python package comes with a built-in CLI called `hf`.'", suggestion: "correct-to that sentence", confidence: MEDIUM, citations: {brief_url: "https://huggingface.co/docs/huggingface_hub/guides/cli"}}
    - {id: citation-validator/d-s4-skill-r1-validate/003, severity: high, type: citation-misattributed, line_range: [448, 448], message: "E404 output in issue 8736 is from `npm i` on a malformed address, not `npm view`", suggestion: "correct-to row 27 wording", confidence: HIGH, citations: {brief_url: "https://github.com/npm/cli/issues/8736"}}
    - {id: citation-validator/d-s4-skill-r1-validate/004, severity: high, type: citation-misattributed, line_range: [166, 166], message: "numFound is not on the Central search guide", suggestion: "correct-to row 26 wording", confidence: HIGH, citations: {brief_url: "https://central.sonatype.org/search/rest-api-guide/"}}
    - {id: citation-validator/d-s4-skill-r1-validate/005, severity: high, type: citation-unsourceable, line_range: [565, 565], message: "'not safe code' is not in the Go blog post", suggestion: "correct-to row 22 wording", confidence: MEDIUM, citations: {brief_url: "https://go.dev/blog/module-mirror-launch"}}
    - {id: citation-validator/d-s4-skill-r1-validate/006, severity: low, type: citation-validated, line_range: [522, 522], message: "'ChatGPT 4.0, 4.0 Turbo, 3.5 Turbo' compresses three Table 1 rows into one quotation (page 3692)", suggestion: "remove the quotation marks; name all three", confidence: HIGH, citations: {brief_url: "https://www.usenix.org/system/files/usenixsecurity25-spracklen.pdf"}}
    - {id: citation-validator/d-s4-skill-r1-validate/007, severity: medium, type: repository-inconsistency, line_range: [215, 560], message: "5a: placeholder verdict exists only in npm/PyPI recipes; 1e: NuGet/Go addresses contradict wrapper line 219", suggestion: "correct-to rows 73–74", confidence: HIGH}
  self_assessment:
    coverage: 0.81
    confidence_overall: MEDIUM
    limitations: ["35/35 budget used; 15 statements not checked", "non-PDF quotes via the summarising tool"]
    unknowns: ["PostgreSQL addresses and claims", "pgvector", "CVE.org 404", "Django signature", "huggingface-cli 404", "serde_json_ext", "the .NET 10 rename", "the …/secrets 404", "Churilov's model count", "GITHUB_AUTH_TOKEN"]
  metadata: {tokens_used: null, tool_calls: 52}
```

Files:
- `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s4-skill-round1-critic-d-s4-skill-r1-critic.md`
- `<home>/Code/ctoc/skills/ai-quality/hallucination-detector/SKILL.md`
- `<home>/Code/ctoc/agents/ai-quality/hallucination-detector.md`
- `<home>/Code/ctoc/tests/critic-warnings-are-critical.test.js`
- `<home>/Code/ctoc/tests/skill-loading.test.js`
- `<home>/Code/ctoc/docs/REFINEMENT_LOOP.md`

Sources:
- npm: [npm-ci](https://docs.npmjs.com/cli/v11/commands/npm-ci) · [scripts](https://docs.npmjs.com/cli/v11/using-npm/scripts) · [provenance](https://docs.npmjs.com/generating-provenance-statements) · [registry signatures](https://docs.npmjs.com/verifying-registry-signatures) · [issue 8736](https://github.com/npm/cli/issues/8736) · [zod](https://registry.npmjs.org/zod/latest) · [react-codeshift](https://registry.npmjs.org/react-codeshift) · [react-smart-cache](https://registry.npmjs.org/react-smart-cache)
- Python: [pip secure installs](https://pip.pypa.io/en/stable/topics/secure-installs/) · [pip-audit](https://github.com/pypa/pip-audit) · [PyPI attestations](https://docs.pypi.org/attestations/) · [PyPI trusted publishers](https://docs.pypi.org/trusted-publishers/) · [huggingface_hub CLI guide](https://huggingface.co/docs/huggingface_hub/guides/cli) · [huggingface_hub on PyPI](https://pypi.org/pypi/huggingface_hub/json)
- Gate tools: [Socket](https://docs.socket.dev/docs/socket-ci) · [cosign](https://github.com/sigstore/cosign/blob/main/doc/cosign_verify-attestation.md) · [Scorecard](https://github.com/ossf/scorecard)
- .NET: [dotnet package search](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-package-search) · [NuGet probe](https://api.nuget.org/v3-flatcontainer/newtonsoftex.advancedjson/index.json)
- Go: [cachepro probe](https://proxy.golang.org/github.com/uber-go/cachepro/@v/list) · [secretsmanager](https://proxy.golang.org/github.com/aws/aws-sdk-go-v2/service/secretsmanager/@v/list) · [proxy.golang.org](https://proxy.golang.org) · [Go blog](https://go.dev/blog/module-mirror-launch)
- Maven Central: [signing requirement](https://central.sonatype.org/publish/requirements/gpg/) · [artifact search](https://search.maven.org/solrsearch/select?q=a:commons-security&rows=20&wt=json) · [class search](https://search.maven.org/solrsearch/select?q=fc:org.apache.commons.security.PasswordValidator&rows=20&wt=json) · [search guide](https://central.sonatype.org/search/rest-api-guide/)
- Rust: [cargo search](https://doc.rust-lang.org/cargo/commands/cargo-search.html)
- Papers: [Churilov](https://arxiv.org/abs/2605.17062) · [REFIND](https://arxiv.org/abs/2502.13622) · [MetaRAG](https://arxiv.org/abs/2509.09360) · [Khati](https://arxiv.org/abs/2601.19106) · [USENIX PDF](https://www.usenix.org/system/files/usenixsecurity25-spracklen.pdf)
- C and C++: [Conan](https://docs.conan.io/2/introduction.html) · [vcpkg registries](https://learn.microsoft.com/en-us/vcpkg/concepts/registries)