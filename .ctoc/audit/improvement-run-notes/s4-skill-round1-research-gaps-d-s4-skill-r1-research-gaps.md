# Research gaps report: citations in `hallucination-detector/SKILL.md`, round 1, second pass

I checked 26 of the 37 rows on the work list and left 11 unchecked; 18 of the 26 have a final verdict. I used all 35 fetches and searches. An earlier progress line in this run said the work list had 45 rows. That was a miscount: it is 36 rows plus row 23.

**Rows that could mislead a reader**

- **The `cosign` command in the pre-merge gate will not run as written (lines 273 and 295).** Keyless verification needs identity flags the command leaves out.
- **The .NET vulnerability command was renamed in .NET 10 (line 270).** The current form is `dotnet package list --vulnerable`.
- **The Scorecard line reads a field and applies a threshold that the README does not document (line 298).** Neither `.score` nor "below 5" appears there.
- **The line 59 paper, now read from its own abstract, confirms the earlier "overgeneralised" verdict.** The figures are real but come from one small Python study.
- **The earlier pass's fix for the npm reference is itself stale.** The npm version 11 pages are now labelled "Legacy".
- **The C and C++ out-of-scope sentence (line 220) is wrong as an absolute.** Both ConanCenter and vcpkg have a documented central catalogue.

No fetched page addressed a reviewer or an agent, so there is no injection finding. Pages came back through the fetch tool's summariser, so the quotes below are its rendering of the page text.

## Queries and fetches, in order (35 of 35)

1. docs.npmjs.com/cli/v11/commands/npm-audit
2. github.com/pypa/pip-audit
3. github.com/rustsec/rustsec/tree/main/cargo-audit
4. learn.microsoft.com/en-us/dotnet/core/tools/dotnet-list-package (it served the `dotnet package list` page)
5. go.dev/doc/modules/managing-dependencies
6. pkg.go.dev/golang.org/x/vuln/cmd/govulncheck
7. docs.sigstore.dev/cosign/verifying/attestation/
8. docs.socket.dev/docs/socket-ci
9. github.com/ossf/scorecard
10. github.com/sigstore/cosign/blob/main/doc/cosign_verify-attestation.md
11. arxiv.org/abs/2502.13622
12. arxiv.org/abs/2509.09360
13. arxiv.org/abs/2601.19106
14. Search: Veracode 2025 GenAI Code Security Report 45% …
15. businesswire.com Veracode release, 2025-07-30 — **403 Forbidden**
16. docs.djangoproject.com/en/5.2/topics/auth/passwords/
17. fastapi.tiangolo.com/reference/security/
18. requests.readthedocs.io/en/latest/api/
19. learn.microsoft.com, the `FromSqlRaw` reference page
20. javadoc.io jackson-databind latest — landing page only, no class content
21. pkg.go.dev/go.opentelemetry.io/otel/exporters/jaeger
22. proxy.golang.org/github.com/aws/aws-sdk-go-v2/service/secretsmanager/@v/list — **200**, 391 versions
23. pkg.go.dev/github.com/aws/aws-sdk-go-v2/service/s3
24. nodejs.org/api/globals.html
25. momentjs.com/docs/ — truncated
26. react.dev/reference/react/hooks
27. axios-http.com/docs/req_config — **301 redirect** to axios.rest/pages/advanced/request-config, not followed (budget)
28. nodejs.org/api/fs.html — truncated before `readFileSync`
29. javadoc.io jackson-databind 2.22.2 `ObjectMapper` page — method summary truncated
30. docs.npmjs.com/policies/disputes — the page title came back as "Username Policy | npm Docs"
31. peps.python.org/pep-0541/
32. docs.conan.io/2/introduction.html
33. learn.microsoft.com/en-us/vcpkg/concepts/registries
34. registry.npmjs.org/zod/latest
35. cveawg.mitre.org/api/cve/CVE-2025-99999 — **404**

## Verdict table (every row on the work list)

| Row | Line | Claim | Verdict | Source; verbatim quote | Recommended wording |
|---|---|---|---|---|---|
| 18 | 53 | Sigstore Rekor transparency log | PARTIAL | cosign `verify-attestation` doc: `--insecure-ignore-tlog`: "ignore transparency log verification, to be used when an artifact signature has not been uploaded to the transparency log". Nothing I read names Rekor. | "the Sigstore transparency log (cosign checks it unless `--insecure-ignore-tlog` is passed)". Name Rekor only after a source is read. |
| 19 | 56 | REFIND, SemEval 2025, span-level | VALIDATED | arXiv 2502.13622: "REFIND at SemEval-2025 Task 3: Retrieval-Augmented Factuality Hallucination Detection in Large Language Models"; "detects hallucinated spans within LLM outputs by directly leveraging retrieved documents"; "Accepted to SemEval@ACL 2025" | keep; add "Lee and Yu, arXiv 2502.13622". The abstract does not mention citations, so row 21 stays unsourceable. |
| 20 | 56 | MetaRAG, 2025 | VALIDATED | arXiv 2509.09360: "MetaRAG: Metamorphic Testing for Hallucination Detection in RAG Systems", Sok, Luz, Haddam; v1 11 Sep 2025; "localizes unsupported claims at the factoid span where they occur" | keep; add authors and arXiv id. It is not about citations. |
| 22 | 57 | Veracode 2025: about 45%, more than 100 models, Java, Python, C# and JavaScript | SNIPPET ONLY | The primary (Business Wire) returned 403. Aggregator snippets: "80 curated coding tasks across more than 100 large language models … introduces security vulnerabilities in 45 percent of cases"; "Java, Python, C#, and JavaScript". | Hold until the primary is read. If confirmed: "in 45% of 80 coding tasks", not "of tests". |
| 23 | 59 | "AST analysis gives 100% precision on semantic errors" | MISATTRIBUTED (overgeneralised), now confirmed from the abstract page | arXiv 2601.19106, Khati, Rodriguez-Cardenas, Pantzer, Poshyvanyk, 27 Jan 2026, "Accepted to FORGE 2026": "a manually-curated dataset of 200 Python snippets … 100% precision and 87.6% recall (0.934 F1-score)" | "One 2026 study (Khati et al., arXiv 2601.19106) reported 100% precision and 87.6% recall for AST-based detection of knowledge-conflicting hallucinations on 200 curated Python snippets." |
| 25 | 71 | Look the CVE up directly in NVD or CVE.org | PARTIAL | cveawg.mitre.org/api/cve/CVE-2025-99999 returned 404 for an unassigned ID, so the CVE.org lookup works as a check. I did not fetch NVD. | keep; name the endpoint `cveawg.mitre.org/api/cve/<id>` |
| 30 | 88 | `bcrypt` fails in the browser | NOT CHECKED | — | — |
| 32 | 92 | No `zod/schemas`; the real subpaths are `zod/v4`, `zod/v4-mini`, `zod/v3` | VALIDATED, with a caveat | zod 4.6.5 `exports`: ".", "./v3", "./v4", "./mini", "./compile", "./locales", "./v4-mini", "./v4/core", "./v4/mini", "./v4/locales", "./package.json", "./v4/locales/*". There is no "./schemas". | "Zod 4 subpaths include `zod/v4`, `zod/v4-mini`, `zod/v3` and `zod/mini`". The current wording reads as a complete list. |
| 38 | 110 | Django has no `validate_strong_password` | VALIDATED | Django 5.2 passwords page: the validators are `MinimumLengthValidator`, `UserAttributeSimilarityValidator`, `CommonPasswordValidator` and `NumericPasswordValidator`; the function is `validate_password(password, user=None, password_validators=None)`. The name does not appear. I did not read the `django.core.validators` reference page. | keep; add "the real API is `django.contrib.auth.password_validation.validate_password`" |
| 39 | 111 | No `fastapi.security.advanced` | VALIDATED | FastAPI security reference: everything is imported `from fastapi.security import (APIKeyCookie, … OAuth2, OAuth2AuthorizationCodeBearer, OAuth2PasswordBearer, … SecurityScopes)`. There is no `advanced` submodule and no `OAuth3`. | keep |
| 40 | 115, 320 | `requests`: the keyword is `json=`, not `json_body` | VALIDATED | "json – (optional) A JSON serializable Python object to send in the body of the Request."; there is no `json_body`. | keep |
| 42 | 128 | Stripe.net has no `PaymentPro` | NOT CHECKED | — | — |
| 43 | 131 | No `EntityFrameworkCore.AsyncQueries` namespace | PARTIAL | The `FromSqlRaw` page gives "Namespace: Microsoft.EntityFrameworkCore". I did not read where the async methods live. | "the namespace is `Microsoft.EntityFrameworkCore`" |
| 44 | 134 | `FromSqlRaw` has no `validate` parameter | VALIDATED | "public static System.Linq.IQueryable<TEntity> FromSqlRaw<TEntity>(this … DbSet<TEntity> source, string sql, params object[] parameters)" | keep |
| 50 | 151 | Jackson: the method is `writeValueAsString` | PARTIAL | 2.22.2 `ObjectMapper` summary (truncated): no `writeValueAsJson` seen; the only static methods visible were `findModules()` and `findModules(ClassLoader)`. The `writeValueAsString` signature was not reached. | See the open lead below on `ObjectMapper.builder()`. |
| 52 | 155 | `curl -I` on a repo1 directory | NOT CHECKED | — | — |
| 54 | 157 | `javap -p` | NOT CHECKED | — | — |
| 56 | 165 | Jaeger exporter deprecated in 2023 | VALIDATED | pkg.go.dev: "Deprecated: This module is no longer supported. OpenTelemetry dropped support for Jaeger exporter in July 2023." Last version v1.17.0, published 2023-08-28. | "dropped July 2023; use `otlptracehttp` or `otlptracegrpc`". I did not check that `jaeger-pro` never existed. |
| 57 | 167–168 | `aws-sdk-go-v2/secrets` should be `…/service/secretsmanager` | VALIDATED (the target) | proxy.golang.org `…/service/secretsmanager/@v/list` returned 391 versions, so it is a separate module. | "// it's the separate module `github.com/aws/aws-sdk-go-v2/service/secretsmanager`". The heading "subpath inside real module" is inaccurate. |
| 58 | 171 | Version 2 `GetObject` takes `&s3.GetObjectInput{}` | VALIDATED | v1.113.4, published 2026-09-24: "func (c *Client) GetObject(ctx context.Context, params *GetObjectInput, optFns ...func(*Options)) (*GetObjectOutput, error)" | keep |
| 69 | 203 | `pg_advanced_search` is not on PGXN | NOT CHECKED | — | — |
| 80 | 270 | `npm audit --omit=dev`, `pip-audit`, `cargo audit`, `dotnet list package --vulnerable` | STALE (the .NET part only) | npm: "npm audit [fix\|signatures]"; `--omit` takes "dev", "optional", or "peer". pip-audit: "`1`: One or more known vulnerabilities were found". cargo-audit: "Audit your dependencies for crates with security vulnerabilities reported to the RustSec Advisory Database". .NET: "If you're using .NET 9 SDK or earlier, use the "verb first" form (`dotnet list package`) … The "noun first" form was introduced in .NET 10." | "`dotnet package list --vulnerable` (.NET 10 and later; `dotnet list package --vulnerable` on .NET 9 and earlier)". pip-audit's own documentation adds: "`pip-audit -r INPUT` is functionally equivalent to `pip install -r INPUT`". It carries the same code-execution risk the earlier pass found for the gate (row 85). |
| 81 | 271 | Socket, Snyk, Aikido and the GitHub Advisory Database detect malicious packages | NOT CHECKED | — | — |
| 82 | 272 | slopcheck tools; DepScope dataset | NOT CHECKED (still snippet only from the earlier pass) | — | — |
| 83 | 273, 295 | `cosign verify-attestation --type slsaprovenance <artifact>` | REFUTED as a runnable command; the type value is VALIDATED | `--type` accepts "slsaprovenance\|slsaprovenance02\|slsaprovenance1\|link\|spdx\|…\|custom". For keyless flows: "Either --certificate-identity or --certificate-identity-regexp must be set" and "Either --certificate-oidc-issuer or --certificate-oidc-issuer-regexp must be set". The examples target `<image uri>`. | `cosign verify-attestation --type slsaprovenance --certificate-identity <id> --certificate-oidc-issuer <issuer> <image>`, or `--key cosign.pub <image>`. |
| 84 | 274 | OpenSSF Scorecard, deps.dev, Dependency-Track | PARTIAL | Scorecard's README is live. deps.dev and Dependency-Track were not checked. | — |
| 86 | 282–283 | `cargo audit`, `go list -m -u all`, `govulncheck ./...` | VALIDATED | Go: "List all of the modules that are dependencies of your current module, along with the latest version available for each: $ go list -m -u all". govulncheck v1.8.0 (2026-09-08): "$ govulncheck ./..."; "exits unsuccessfully if there are [vulnerabilities]". | keep. Note that `go list -m -u all` lists available upgrades; it is not an audit. |
| 88 | 291 | `socket ci` is an alias for `socket scan create --report` and exits non-zero | VALIDATED | "Alias for `socket scan create --report` (creates report and exits with error if unhealthy)". It also exits non-zero when there are "no supported manifest files". The token needs "`full-scans:create`, `full-scans:list`, and `security-policy:read`". | keep; add the token requirement |
| 89 | 298 | `scorecard --repo=… --format=json \| jq '.score'` | VALIDATED (command and flag); `.score` is UNSOURCEABLE | "scorecard --repo=github.com/ossf-tests/…"; "--format=json"; "Each individual check returns a score of 0 to 10". The README names no JSON field and no risk threshold, which confirms row 90. | `GITHUB_AUTH_TOKEN=… scorecard --repo=github.com/<org>/<pkg> --format=json`; remove `jq '.score'` and "< 5 = elevated risk" |
| 91 | 308 | Rename year 2022 | NOT CHECKED | — | — |
| 92 | 310 | `node-fetch` → built-in `fetch` on Node 18 or later | VALIDATED | Node v26.10.0 docs: "v18.0.0: No longer behind `--experimental-fetch` CLI flag"; "v21.0.0: No longer experimental." | "built-in `fetch` (no flag since Node 18, stable since Node 21)". `node-fetch` is a real package, so the "Hallucinated" column is the wrong heading for it. |
| 95 | 317 | `moment.formatISO` is date-fns; the moment form is `toISOString` | PARTIAL | momentjs.com: "Moment.js is a legacy project in maintenance mode." No `formatISO` in the part that loaded; the page truncated before `toISOString`. date-fns was not fetched. | — |
| 96 | 318 | `React.useAutoEffect` does not exist | VALIDATED | react.dev lists 17 hooks (useState … useEffectEvent … useActionState); there is no `useAutoEffect`. | keep |
| 97 | 319 | axios GET has no `body`; use `params` | NOT CHECKED | The documentation moved: 301 to axios.rest/pages/advanced/request-config | — |
| 98 | 325 | `fs.readFileSync` has no `throwOnError` option | NOT CHECKED | nodejs.org/api/fs.html truncated before the `readFileSync` section | — |
| 99 | 348, 371 | CVE-2025-99999 is not in NVD (illustrative) | PARTIAL | CVE.org API: 404 Not Found. NVD not fetched. | "not a CVE record (CVE.org)" |
| 100 | 355 | "DepScope … typosquat for react-cache" (illustrative) | NOT CHECKED | — | — |

## Name-squatting policies and C and C++ registries

**npm.** Source: docs.npmjs.com/policies/disputes; the page title that came back was "Username Policy".
- "It is against npm's Terms of Use to publish a package, register a username or an organization name simply for the purposes of reserving it for future use."
- "Accounts violating the name squatting policy may be removed or renamed without notice."
- The page says nothing about typosquatting and nothing about blocking look-alike names. npm's typosquatting policy was not found.

**Python Package Index.** Source: PEP 541, "Package Index Name Retention", status Final.
- It defines "project name squatting (package has no functionality or is empty)".
- Projects are removed for malware, name squatting, obfuscation and other listed reasons.
- The Python Software Foundation's Packaging Working Group administers it.
- The page did not show the word "typosquatting".

**C and C++, line 220.** The line says C and C++ "have no centralized package registry equivalent". As an absolute that is wrong for projects that use Conan or vcpkg:
- **ConanCenter:** "a central public repository where the community contributes packages for popular open-source libraries", with recipes in github.com/conan-io/conan-center-index.
- **vcpkg:** "vcpkg hosts a selection of libraries packaged into ports at https://github.com/Microsoft/vcpkg. This collection of ports is called the curated registry." In manifest mode, "when a default registry is not specified, vcpkg implicitly uses the built-in registry". A port lives at `ports/<name>`.
- **Line 220's own last sentence** already tells the reader to "query the relevant central index manually".
- **Recommended wording:** "C and C++ have no single registry every project uses. Conan dependencies can be checked against ConanCenter (conan-center-index) and vcpkg dependencies against the curated registry (github.com/microsoft/vcpkg, `ports/<name>`). System packages and vendored code have no registry to check." Whether C and C++ stay out of scope is your call, not mine.

## Other drift and open leads

- **The npm reference at line 421 is still stale after the earlier fix.** The npm-audit version 11 page labels itself "Version 11.20.0 (Legacy)". The earlier pass recommended switching to the version 11 path, so that recommendation is stale too. I did not work out which version is current.
- **Possible second hallucination in the Java example, line 151 (not a verdict).** `ObjectMapper.builder()` may not exist in Jackson 2.x. It was not among the static methods visible in the 2.22.2 summary, but the summary was truncated, so this is unproven. Next round: check the `JsonMapper.builder()` page, and check Jackson 3.
- **The dispatch id `d-s4-skill-r1-research-gaps` does not match the schema's id pattern** (a 26-character ULID).

## Counts (37 rows: the 36 on the work list plus row 23)

| Category | Count | Rows |
|---|---|---|
| Validated | 15 | 19, 20, 32, 38, 39, 40, 44, 56, 57, 58, 86, 88, 89, 92, 96 (row 89's `.score` part is unsourceable) |
| Refuted | 1 | 83 |
| Misattributed | 1 | 23 |
| Stale | 1 | 80 (.NET part) |
| Partial, no final verdict | 7 | 18, 25, 43, 50, 84, 95, 99 |
| Search snippet only | 1 | 22 |
| Not checked | 11 | 30, 42, 52, 54, 69, 81, 82, 91, 97, 98, 100 |

**Not reached, by row:**
- **30:** bcrypt in the browser.
- **42:** Stripe.net `PaymentPro`.
- **52:** `curl -I` on a repo1 directory.
- **54:** `javap -p`.
- **69:** PGXN.
- **81:** Socket, Snyk, Aikido and the GitHub Advisory Database.
- **82:** slopcheck and DepScope.
- **91:** the 2022 rename year.
- **97:** the axios page redirected and was not followed.
- **98:** the Node fs page truncated.
- **100:** the DepScope illustration.
- **Parts of partial rows:**
  - NVD itself (rows 25, 99)
  - date-fns and moment's `toISOString` (row 95)
  - where Entity Framework Core's async methods live (row 43)
  - deps.dev and Dependency-Track (row 84)
  - whether the name "Rekor" is right (row 18)
  - the primary source for the Veracode report (row 22)

## Structured response (dispatch schema)

```yaml
dispatch_id: d-s4-skill-r1-research-gaps   # does not match the schema's 26-character pattern
protocol_version: 1
agent: citation-validator
completed_at: 2026-09-30
findings:
  - {id: r83, severity: high, type: citation-refuted, file: skills/ai-quality/hallucination-detector/SKILL.md, line_range: [273, 295], message: "cosign verify-attestation lacks the required --certificate-identity/--certificate-oidc-issuer or --key; examples target images", suggestion: "correct-to: cosign verify-attestation --type slsaprovenance --certificate-identity <id> --certificate-oidc-issuer <issuer> <image>", confidence: HIGH, confidence_rationale: "flag requirements quoted from cosign's own command reference", citations: {brief_url: "https://github.com/sigstore/cosign/blob/main/doc/cosign_verify-attestation.md", evidence: [{file: skills/ai-quality/hallucination-detector/SKILL.md, line_range: [295, 295]}]}}
  - {id: r80, severity: high, type: citation-stale, file: skills/ai-quality/hallucination-detector/SKILL.md, line_range: [270, 270], message: "dotnet list package renamed dotnet package list in .NET 10", suggestion: "correct-to: dotnet package list --vulnerable (.NET 10+; dotnet list package --vulnerable on .NET 9 and earlier)", confidence: HIGH, confidence_rationale: "verbatim note on the Microsoft Learn page", citations: {brief_url: "https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-package-list", evidence: [{file: skills/ai-quality/hallucination-detector/SKILL.md, line_range: [270, 270]}]}}
  - {id: r89, severity: high, type: citation-unsourceable, file: skills/ai-quality/hallucination-detector/SKILL.md, line_range: [298, 298], message: "jq '.score' field and '< 5 = elevated risk' not in the Scorecard README", suggestion: strip-the-specificity, confidence: MEDIUM, citations: {brief_url: "https://github.com/ossf/scorecard", evidence: [{file: skills/ai-quality/hallucination-detector/SKILL.md, line_range: [298, 298]}]}}
  - {id: r23, severity: high, type: citation-misattributed, file: skills/ai-quality/hallucination-detector/SKILL.md, line_range: [59, 59], message: "100% precision is one study on 200 Python snippets, not a general property", suggestion: "correct-to: One 2026 study (Khati et al., arXiv 2601.19106) reported 100% precision and 87.6% recall on 200 curated Python snippets", confidence: HIGH, confidence_rationale: "abstract read on arxiv.org", citations: {brief_url: "https://arxiv.org/abs/2601.19106", evidence: [{file: skills/ai-quality/hallucination-detector/SKILL.md, line_range: [59, 59]}]}}
  - {id: l220, severity: high, type: citation-refuted, file: skills/ai-quality/hallucination-detector/SKILL.md, line_range: [220, 220], message: "ConanCenter and the vcpkg curated registry are documented central catalogues", suggestion: "correct-to: no single registry every project uses; Conan and vcpkg names can be checked against ConanCenter and github.com/microsoft/vcpkg ports/<name>", confidence: MEDIUM, citations: {brief_url: "https://learn.microsoft.com/en-us/vcpkg/concepts/registries", evidence: [{file: skills/ai-quality/hallucination-detector/SKILL.md, line_range: [220, 220]}]}}
  - {id: l421, severity: high, type: citation-stale, file: skills/ai-quality/hallucination-detector/SKILL.md, line_range: [421, 421], message: "npm version 11 docs now self-label Legacy (11.20.0); the earlier fix to v11 is also stale", suggestion: "correct-to the current npm documentation version (not identified this round)", confidence: MEDIUM, citations: {brief_url: "https://docs.npmjs.com/cli/v11/commands/npm-audit", evidence: [{file: skills/ai-quality/hallucination-detector/SKILL.md, line_range: [421, 421]}]}}
self_assessment:
  coverage: 0.49          # 18 of 37 rows reached a final verdict
  confidence_overall: MEDIUM
  limitations: ["quotes are the fetch summariser's rendering", "Business Wire 403; axios redirect not followed; Node fs, moment and Jackson pages truncated"]
  unknowns: ["rows 30, 42, 52, 54, 69, 81, 82, 91, 97, 98, 100 not checked"]
metadata:
  tokens_used: null       # the schema requires an integer; I have no measured count
  tool_calls: 39          # 35 web, 4 local reads
  subagents_dispatched: 0
```

I changed no files. The files involved are `<home>/Code/ctoc/skills/ai-quality/hallucination-detector/SKILL.md` and `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s4-skill-round1-research-d-s4-skill-r1-research.md`.

**What would change these results:**
- **Row 22:** a browser read of Veracode's primary release, which returned 403 here.
- **Line 151:** the `JsonMapper` and Jackson 3 pages.
- **Rows 97 and 98:** the full axios and Node fs pages. The summariser suggested `throwOnError` is absent, but the section never loaded, so that is not a verdict.

Sources:
- [npm audit (v11)](https://docs.npmjs.com/cli/v11/commands/npm-audit)
- [pip-audit](https://github.com/pypa/pip-audit)
- [cargo-audit](https://github.com/rustsec/rustsec/tree/main/cargo-audit)
- [dotnet package list](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-list-package)
- [Go: managing dependencies](https://go.dev/doc/modules/managing-dependencies)
- [govulncheck](https://pkg.go.dev/golang.org/x/vuln/cmd/govulncheck)
- [Sigstore: verifying attestations](https://docs.sigstore.dev/cosign/verifying/attestation/)
- [cosign verify-attestation reference](https://github.com/sigstore/cosign/blob/main/doc/cosign_verify-attestation.md)
- [socket ci](https://docs.socket.dev/docs/socket-ci)
- [OpenSSF Scorecard](https://github.com/ossf/scorecard)
- [arXiv 2502.13622 (REFIND)](https://arxiv.org/abs/2502.13622)
- [arXiv 2509.09360 (MetaRAG)](https://arxiv.org/abs/2509.09360)
- [arXiv 2601.19106 (Khati et al.)](https://arxiv.org/abs/2601.19106)
- [Veracode release on Business Wire (403)](https://www.businesswire.com/news/home/20250730694951/en/AI-Generated-Code-Poses-Major-Security-Risks-in-Nearly-Half-of-All-Development-Tasks-Veracode-Research-Reveals)
- [Aggregator: augmentcode](https://www.augmentcode.com/guides/ai-code-vulnerability-audit-fix-the-45-security-flaws-fast)
- [Aggregator: softprom](https://softprom.com/who-is-responsible-for-ai-generated-code-a-review-of-the-veracode-2025-report)
- [Django password validation](https://docs.djangoproject.com/en/5.2/topics/auth/passwords/)
- [FastAPI security reference](https://fastapi.tiangolo.com/reference/security/)
- [requests API](https://requests.readthedocs.io/en/latest/api/)
- [FromSqlRaw](https://learn.microsoft.com/en-us/dotnet/api/microsoft.entityframeworkcore.relationalqueryableextensions.fromsqlraw)
- [Jackson ObjectMapper 2.22.2](https://javadoc.io/static/com.fasterxml.jackson.core/jackson-databind/2.22.2/com/fasterxml/jackson/databind/ObjectMapper.html)
- [OpenTelemetry Go Jaeger exporter](https://pkg.go.dev/go.opentelemetry.io/otel/exporters/jaeger)
- [secretsmanager module version list](https://proxy.golang.org/github.com/aws/aws-sdk-go-v2/service/secretsmanager/@v/list)
- [aws-sdk-go-v2 s3](https://pkg.go.dev/github.com/aws/aws-sdk-go-v2/service/s3)
- [Node.js globals](https://nodejs.org/api/globals.html)
- [Moment.js docs](https://momentjs.com/docs/)
- [React hooks reference](https://react.dev/reference/react/hooks)
- [axios request config (redirected)](https://axios-http.com/docs/req_config)
- [Node.js fs](https://nodejs.org/api/fs.html)
- [npm username and name-squatting policy](https://docs.npmjs.com/policies/disputes)
- [PEP 541](https://peps.python.org/pep-0541/)
- [Conan introduction](https://docs.conan.io/2/introduction.html)
- [vcpkg registries](https://learn.microsoft.com/en-us/vcpkg/concepts/registries)
- [zod latest on the npm registry](https://registry.npmjs.org/zod/latest)
- [CVE.org API lookup for CVE-2025-99999](https://cveawg.mitre.org/api/cve/CVE-2025-99999)