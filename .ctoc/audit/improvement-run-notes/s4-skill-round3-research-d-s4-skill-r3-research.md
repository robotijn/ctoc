# Round 3 research on `skills/ai-quality/hallucination-detector/SKILL.md` (dispatch `d-s4-skill-r3-research`)

None of the load-bearing registry values or quotations I re-read is fabricated. All 35 fetches and searches are used. The file should still change in eight places:

1. **The `bcrypt` browser claim has no source.** The skill says it "works in Node, NOT in browser" and "bcrypt is Node-only". bcrypt's readme does not mention a browser. The wrapper already uses a sourced wording ("native add-on"), so the two files disagree.
2. **The recommended tool "slopcheck" collides on npm.** npm has a `slopcheck` package that is a different project from the one the skill links. A tool the skill recommends by bare name has become a name-confusion case itself.
3. **The Python example's check cannot settle the question.** `requests.get` takes `**kwargs`, so reading its signature shows neither `json=` nor `json_body=`. The reader has to follow the keyword arguments on to `request`.
4. **The gate contradicts its own source.** Step 2 installs (and `pip-audit -r` runs install code) before step 3 scans for malicious packages. The skill's own quote from the European Union Agency for Cybersecurity puts scans "prior to installation or during dependency review".
5. **`react-codeshift` was registered by a third party, not held by npm.** The latest version is "1.0.0" and the maintainer is "debugducky". The wrapper's recipe reports it as REGISTERED, not as a placeholder.
6. **`cosign verify-attestation` checks container images.** Its synopsis is "Verify an attestation on the supplied container image". It checks nothing about a package dependency.
7. **Several round-2 carried items are now settled:**
   - Socket's malware verdict is now quoted from Socket's own alert page.
   - deps.dev and Dependency-Track are described by their own pages.
   - Scorecard's readme documents `--format=json`.
   - Stripe.net's `SessionService.cs` declares `namespace Stripe.Checkout`.
   - `jscodeshift` is still a dependency of the react-codemod repository.
8. **Eight evasions that cost the attacker nothing are not acknowledged in the skill.** Four of them the wrapper already covers (Part C).

## Source classes, and how they differ from rounds 1 and 2
- **Round 1:** research papers and each registry's or vendor's own documentation.
- **Round 2:** specifications, standards bodies, the agency's final advisory (page images), and the peer-reviewed paper's mitigation section.
- **This round:**
  - **Direct re-reads of primary material:** registry answers, library source files (`requests/api.py`, FastAPI's `security/__init__.py`, OpenSSL's `EVP_EncryptInit.pod`, Stripe.net's `SessionService.cs`, Jackson 3's `ObjectMapper.java`, react-codemod's `package.json`), and the tool pages (npm v12, pip-audit, cosign, Scorecard, Socket).
  - **A regulator not yet used for this file:** the Cybersecurity and Infrastructure Security Agency's (CISA) page on compromised software dependencies. Everything else in Part B is reused from the agent's round-3 note.
  - **An adversarial reading of every check.**

**How pages were read.** I have no Bash, so no answer here is raw bytes. Every fetch went through the fetch tool's summarising model, even when I asked for word-for-word text; I label that "tool copy". Where the tool reported only an error status, I label it "status only". No page images were read this round. The only true byte-level evidence is the session's earlier curl runs, which I reuse and label.

**Prompt injection:** none of the fetched pages addressed a reviewer or validator. The `react-codeshift` and npm `slopcheck` descriptions are package metadata, read as data.

## Fetches and searches, in order (35 of 35: 31 fetches, 4 searches)
| # | Address or query | Mode |
|---|---|---|
| 1 | registry.npmjs.org/react-smart-cache | status only (404) |
| 2 | registry.npmjs.org/zod/latest | tool copy |
| 3 | registry.npmjs.org/react-codeshift | tool copy |
| 4 | pypi.org/pypi/huggingface_hub/json | tool copy |
| 5 | api.nuget.org/v3-flatcontainer/newtonsoftex.advancedjson/index.json | status only (404) |
| 6 | proxy.golang.org/github.com/uber-go/cachepro/@v/list | status only (404) |
| 7 | index.crates.io/to/ki/tokio_advanced | status only (404) |
| 8 | search.maven.org `fc:org.apache.commons.security.PasswordValidator` | tool copy |
| 9 | search.maven.org `a:commons-security` | tool copy |
| 10 | api.pgxn.org/dist/pg_advanced_search.json | status only (404) |
| 11 | raw GitHub psf/requests main `src/requests/api.py` | tool copy |
| 12 | raw GitHub fastapi master `fastapi/security/__init__.py` | tool copy |
| 13 | raw GitHub openssl master `doc/man3/EVP_EncryptInit.pod` | tool copy |
| 14 | docs.npmjs.com/cli/v12/commands/npm-ci | tool copy |
| 15 | docs.npmjs.com/cli/v12/commands/npm-audit | tool copy; partly the tool's paraphrase |
| 16 | raw GitHub pypa/pip-audit main README.md | tool copy |
| 17 | raw GitHub sigstore/cosign main `doc/cosign_verify-attestation.md` | tool copy |
| 18 | raw GitHub ossf/scorecard main README.md | tool copy |
| 19 | docs.socket.dev/docs/socket-ci | tool copy |
| 20 | Search: CISA secure by design, typosquatting or dependency confusion (cisa.gov only) | search summary |
| 21 | Search: 2026 national agency guidance on AI-generated code and hallucinated packages | search summary |
| 22 | cisa.gov/eviction-strategies-tool/info-attack/T1195.001 | tool copy |
| 23 | raw GitHub kelektiv/node.bcrypt.js master README.md | tool copy; negative answer |
| 24 | registry.npmjs.org/slopcheck | tool copy |
| 25 | raw GitHub reactjs/react-codemod master package.json | tool copy |
| 26 | Search: Socket malware detection (socket.dev only) | search summary |
| 27 | Search: Snyk malicious-package detection (snyk.io only) | search summary |
| 28 | intel.aikido.dev | tool copy |
| 29 | socket.dev/alerts/malware | tool copy |
| 30 | docs.snyk.io/manage-risk/prioritize-issues-for-fixing/malicious-packages | failed: the page is a 404 |
| 31 | docs.deps.dev/faq/ | tool copy |
| 32 | docs.dependencytrack.org | tool copy |
| 33 | raw GitHub stripe-dotnet master `…/Services/Checkout/Sessions/SessionService.cs` | tool copy |
| 34 | raw GitHub jackson-databind 3.x `src/main/java/tools/jackson/databind/ObjectMapper.java` | tool copy; the tool contradicted itself |
| 35 | typing.python.org/en/latest/spec/distributing.html | tool copy |

## Part A — the skill's load-bearing claims, re-read
| Claim in the skill | What the source shows this round | Mode | Verdict and action |
|---|---|---|---|
| npm `react-smart-cache`: status 404 | 404 | status only | **Validated**, keep |
| npm `email-validator-pro`: created 2017-05-18 | Not re-fetched. The agent's round 3 read `"created":"2017-05-18T04:34:21.018Z"`. | reused tool copy | **Validated (reused)**, keep |
| npm `react-query/latest`: "3.39.3" | Not re-fetched. The session's round-1 curl read `"version":"3.39.3"`. | reused raw bytes | **Validated (reused)**, keep |
| zod 4.6.5 "exports" include "./v4", "./v4-mini", "./v3", "./mini", and no "./schemas" | Version "4.6.5". Keys: ".", "./v3", "./v4", "./mini", "./compile", "./locales", "./v4-mini", "./v4/core", "./v4/mini", "./v4/locales", "./package.json", "./v4/locales/*". No "./schemas". | tool copy | **Validated**, keep ("include" is accurate for 4 of 12 keys) |
| PyPI `huggingface-cli`: 404 | Not re-fetched; the session's round-1 curl saw 404 | reused raw bytes | **Validated (reused)**, keep |
| PyPI `huggingface_hub`: version 2.0.0, no `cli` extra | `info.version` "2.0.0". The extras are oauth, torch, fastai, hf-xet, mcp, testing, gradio, typing, quality, all, dev. No "cli". `info.name` is "huggingface-hub". | tool copy | **Validated**, keep |
| npm `react-codeshift`: description "Placeholder to prevent dependency confusion." (begins with a symbol), created 2026-01-14 | Description "🚫 Placeholder to prevent dependency confusion." (the tool names the symbol as U+1F6AB). Created "2026-01-14T21:02:51.762Z". **New:** latest `{"latest":"1.0.0"}`; maintainers `[{"name":"debugducky",…}]`. | tool copy | **Validated.** The skill leaves out that a third party registered it; see finding 5 |
| NuGet `newtonsoftex.advancedjson` version list: 404 | 404 | status only | **Validated**, keep |
| Go proxy `github.com/uber-go/cachepro/@v/list`: 404 | 404 | status only | **Validated**, keep |
| Go proxy `…/aws-sdk-go-v2/secrets/@v/list`: 404 | Not re-fetched; the session's round-1 curl saw 404 | reused raw bytes | **Validated (reused)**, keep |
| Go proxy `…/service/secretsmanager/@v/list` and `…/exporters/jaeger-pro/@v/list` | Not re-fetched | — | Not checked this round |
| crates.io index `tokio_advanced`: 404 | 404. This closes the agent round 3's gap on the `index.crates.io` address. | status only | **Validated**, keep |
| crates.io index `serde_json_ext` lists "0.1.0" | Not re-fetched; the session's round-1 curl saw `"vers":"0.1.0"` | reused raw bytes | **Validated (reused)**, keep |
| npm `fs` latest "0.0.1-security"; `crossenv` "security holding package"; PyPI `sklearn` summary | Not re-fetched; the agent round 3 read all three | reused tool copy | **Validated (reused)**, keep |
| Maven `org/apache/commons/commons-security/maven-metadata.xml`: 404 | Not re-fetched | — | Not checked this round |
| search.maven.org `fc:org.apache.commons.security.PasswordValidator`: numFound 0 | `"numFound":0,"docs":[]` | tool copy | **Validated**, keep |
| `commons-security` exists "under three other groups, none of them org.apache.commons" | numFound 3. Groups: `cn.aotcloud`, `org.eu.vooo`, `com.itxiaoer.commons`. None is `org.apache.commons`. | tool copy | **Validated**, keep |
| PGXN `pg_advanced_search.json`: 404 (with `pair.json` answering 200 as a control) | 404. `pair.json` was not re-fetched. | status only | **Validated**, keep |
| `requests.get(url, json_body=payload)`: "'json_body' is not a kwarg; it's 'json='" | On main: `def get(url: _t.UriType, params: _t.ParamsType = None, **kwargs: Unpack[_t.GetKwargs]) -> Response:`. The docstring says `:param \*\*kwargs: Optional arguments that ``request`` takes.` and `request`'s docstring has `:param json: (optional) A JSON serializable Python object to send in the body of the :class:`Request`.` "json_body" does not appear in the file. | tool copy | **The claim is validated, but the skill's check misses it:** its instruction "read the signature of requests.get" finds neither keyword, because both pass through `**kwargs`. Whether released versions carry the `_t.GetKwargs` typing was not checked. See finding 3. |
| Django `validate_password(password, user=None, password_validators=None)` | The raw source was not fetched (budget). The session's round-1 curl saw that exact text on the 5.2 documentation page. | reused raw bytes (documentation, not source) | **Validated against the documentation**; raw source not checked |
| `from fastapi.security.advanced import OAuth3`: "No 'advanced' submodule" | `__init__.py` has 15 re-export lines, from `.api_key`, `.http`, `.oauth2` and `.open_id_connect_url`. No "advanced", no "OAuth3". | tool copy | **Holds for `__init__`.** An `__init__` that does not import a submodule does not prove the submodule file is absent; the directory listing was not read. Keep, or reword to "the package's `__init__.py` re-exports nothing named `advanced`". |
| OpenSSL: the three cipher prototypes | Same tokens. The pod wraps each prototype over several lines with aligning spaces; the skill puts each on one line. "EVP_Q_" does not appear in `EVP_EncryptInit.pod`. | tool copy | **Validated** after whitespace is normalised; not byte-identical. Keep. |
| C++ [alg.contains] return text | Not fetched (budget). Round 2 read it through the tool, and the session compiled the call. | — | Not checked this round |
| `--ignore-scripts`: "npm does not run scripts specified in package.json files" | "If true, npm does not run scripts specified in package.json files." **Also:** "Note that commands explicitly intended to run a particular script, such as `npm start`, `npm stop`, `npm restart`, `npm test`, and `npm run` will still run their intended script if `ignore-scripts` is set, but they will _not_ run any pre- or post-scripts." | tool copy | **Validated.** The second sentence matters for Part C, item 5. |
| `npm audit signatures` | The npm-audit page (tool copy) says it checks registry signatures and provenance attestations. The only word-for-word text returned: "because provenance attestations are such a new feature, security features may be added to (or changed in) the attestation format over time." The skill's own quote is from the provenance page, which was not re-fetched. | tool copy, partly paraphrase | Partly checked |
| pip-audit: "`pip-audit -r INPUT` is functionally equivalent to `pip install -r INPUT`" | "For all intents and purposes, `pip-audit -r INPUT` is functionally equivalent to `pip install -r INPUT`, with a small amount of **non-security isolation** to avoid conflicts with any of your local environments." **Also:** "you **must not** assume that `pip-audit` will **defend** you against malicious packages." | tool copy | **Validated** (the skill quotes a substring). See finding 4. |
| cosign: "Either --certificate-identity or --certificate-identity-regexp must be set" | "Either --certificate-identity or --certificate-identity-regexp must be set for keyless flows." The issuer sentence is parallel. `--type` accepts `slsaprovenance`. Synopsis: "Verify an attestation on the supplied container image". | tool copy | **Validated.** The synopsis shows the scope: images, not dependencies. See finding 6. |
| Socket: alias for `socket scan create --report`; token permissions; non-zero exit | "This is basically an alias to `socket scan create --report`." / "If the Scan is not "healthy", ie. it has alerts that violate your security or license policy, then the exit code will be non-zero." / "Your Socket API token needs the `full-scans:create`, `full-scans:list`, and `security-policy:read` permissions." | tool copy | **Validated.** The skill's "non-zero exit on unhealthy alerts" leaves out that this depends on the organisation's policy. |
| Scorecard: "you must authenticate your requests before running Scorecard" | "GitHub imposes api rate limits on unauthenticated requests. To avoid these limits, you must authenticate your requests before running Scorecard." | tool copy | **Validated** (substring). The reason is rate limits. |

**Part A counts:** 27 claims.
- 22 validated: 15 this round, 7 reused from earlier rounds.
- 2 holding with a gap in the check (requests, FastAPI).
- 1 partly checked (`npm audit signatures`).
- 2 rows not checked this round: Maven metadata, C++ draft. Three further addresses inside rows were also not re-read (the two Go proxy lists, PGXN's `pair.json` control).

## Part B — regulators and agencies (all read 2026-09-30)
1. **CISA.**
   - **Reused from the agent's round 3 (page images of pages 1–8):** "Open Source Software Security Roadmap", September 2023, page 4, https://www.cisa.gov/sites/default/files/2024-02/CISA-Open-Source-Software-Security-Roadmap-508c.pdf: "…and employing typosquatting attacks that take advantage of developer errors."
   - **New this round (tool copy):** "Compromise Software Dependencies and Development Tools (T1195.001)", version 1.3, created 11 March 2020, modified 12 May 2026, https://www.cisa.gov/eviction-strategies-tool/info-attack/T1195.001:
     - "Adversaries may also employ 'typosquatting' or name-confusion by choosing names similar to existing popular libraries or packages in order to deceive a user."
     - "This may also include abandoned packages, which in some cases could be re-registered by threat actors after being removed by adversaries."
     - "Popular open source projects that are used as dependencies in many applications, such as pip and NPM packages, may be targeted as a means to add malicious code to users of the dependency."
     - Caveat: the page carries a MITRE ATT&CK-style technique identifier. Whether the wording is CISA's own was not checked.
   - **Secure by design:** the page https://www.cisa.gov/securebydesign appeared only in search results. No sentence about checking dependencies was read, so none is quoted.
2. **The UK National Cyber Security Centre** (reused from the agent's round 3, tool copy): blog post "Software supply chain attacks: check your dependencies", 4 June 2026, https://www.ncsc.gov.uk/blogs/software-supply-chain-attacks-check-your-dependencies:
   - "Publishing packages using similar names or misspelling popular legitimate packages in the hope they are installed by mistake."
   - "Attackers take over ownership of expired domains connected to package maintainers, or otherwise transfer ownership of a previously legitimate package."
   - The Centre's wider supply-chain guidance was not read this round.
3. **France's cybersecurity agency and Germany's federal information-security office, joint report "AI Coding Assistants", page 10** (reused from the agent's round 3, page images; last updated September 2024), https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf?__blob=publicationFile&v=7:
   - "Attackers exploit the hallucinations by creating a package with the same name as the hallucinated package and tagging it with malicious code."
   - "Unknown libraries should be checked for plausibility, e.g. when they were created, how commonly they are used or how active a source code repository is."
4. **Cyber Resilience Act, Article 13(5)** (reused from the agent's round 3; an unofficial mirror, https://www.european-cyber-resilience-act.com/Cyber_Resilience_Act_Article_13.html): "…manufacturers shall exercise due diligence when integrating components sourced from third parties so that those components do not compromise the cybersecurity of the product with digital elements…".
   - The official EUR-Lex text was unreachable (three failed fetches in the agent's round). I did not retry.
   - It names no check of a component's name, identity or provenance.
5. **New 2026 statements.**
   - One search found no regulator statement on hallucinated dependencies other than the one the agent's round 3 already has. That is the European Union Agency for Cybersecurity's "Technical Advisory on AI-assisted software development", version 0.4, draft, September 2026, table 2: "The system suggests APIs, packages, commands, configurations or design patterns that do not exist, or are outdated."
   - The search also surfaced a Cloud Security Alliance research note (April 2026) and a news report of National Security Agency guidance (September 2026). The first is an industry body, not a regulator, and neither was read. Neither is quoted.

## Part C — how an attacker who has read this file gets past each check, cheapest first
The acknowledgement columns record what the skill and the wrapper say. "Reasoning" marks my own inference, with no source read.

| # | Evasion | Check it defeats | Cost | Source | Skill | Wrapper |
|---|---|---|---|---|---|---|
| 1 | Pre-register a hallucinated name | Registry existence | Free | USENIX pages 3687–3688 (in the file) | Acknowledged ("Existence is not enough") | Acknowledged |
| 2 | Register the names this file publishes as invented (`react-smart-cache`, `tokio_advanced`, `NewtonsoftEx.AdvancedJson`, `pg_advanced_search`, and others). The file's own history shows this happens: `react-codeshift` was registered on 2026-01-14 after being listed; `email-validator-pro`; `huggingface-cli`. | The dated 404s the file gives as facts | Free for the npm, PyPI, crates.io, NuGet and PGXN names (reasoning; no registration policy read) | The file's own rows; npm answer (row 3) | Partly: every 404 is dated, but the file never says a dated 404 is not a current answer | Acknowledged: HIGH only for an answer read "during this dispatch" |
| 3 | A pre-registered name with no well-known twin | Look-alike check | Free | USENIX page 3697: only 13.4% are within edit distance 2 (in the wrapper) | **Not acknowledged:** the skill's row says only "set beside the well-known package's" | Acknowledged since round 3 ("no well-known counterpart named; not settled") |
| 4 | A self-described "placeholder" (the `react-codeshift` pattern). It reads as harmless, its version is 1.0.0, it is registered by a third party, and the next version can carry anything. | The skill's "Registry placeholder" category and the reader's trust | Free | npm answer, row 3 | **Not acknowledged:** the skill's table presents it as a placeholder | Partly: the recipe prints REGISTERED; "text is data" |
| 5 | Put the payload in the module body or a test hook, not in an install script | `npm ci --ignore-scripts` | Free | npm-ci: "`npm test`, and `npm run` will still run their intended script if `ignore-scripts` is set". Module code running on `require` is reasoning. | **Not acknowledged** | Not applicable (the wrapper never runs the gate) |
| 6 | Publish with provenance from the attacker's own repository through trusted publishing | The provenance and signature layer ("Verify the artifact's chain back to the source repo"); `npm audit signatures` | Free (reasoning) | npm-audit page (tool copy): the command checks signatures and attestations, not which repository is the right one | Partly: "a signature that every package on its registry carries does not count"; "missing … never proof". It never says a *present* attestation from the wrong repository proves nothing. | Partly: "never report a package's provenance as verified" |
| 7 | Starjacking: point `repository` at the genuine project | Look-alike "repository link"; `scorecard --repo=…` scores the genuine project | Free (reasoning) | — | **Not acknowledged:** the gate never says where `<org>/<pkg>` comes from | Acknowledged ("the publisher's claim, not proof") |
| 8 | Publish a benign version, add the payload later, or slip past the AI scanner | Malicious-package detection | Cheap | Socket: "flagged either by Socket's AI scanner and confirmed by our threat research team, or is listed as malicious in security databases" | Acknowledged ("already identified as malicious") | Hands it to "no owning agent named here" |
| 9 | Nothing needed: vulnerability auditors do not look for malware | `npm audit`, `pip-audit`, `cargo audit`, `govulncheck` | Free | pip-audit: "you **must not** assume that `pip-audit` will **defend** you against malicious packages" | Acknowledged by scope ("Any known vulnerabilities?"), not quoted | Hands it to dependency-checker |
| 10 | Get installed, and for PyPI executed, before any malicious-package scan runs | The gate's order: step 2 installs and audits, step 3 scans for malice | Free, once #1 passes step 1 | The skill's own quote: scans run "prior to installation or during dependency review" | **Contradicted by its own source** | Not applicable |
| 11 | Inflate download counts | Look-alike download comparison | Cheap | Tenable, Ron Popov, 28 May 2026: "between 100 and 150 downloads from automated systems" per version; `ambar-src` "reached more than 50,000 downloads in three days after attackers uploaded more than 700 versions" (reused) | Silent | Acknowledged |
| 12 | A scope that resembles the organisation's own (`@acme-corp` beside `@acme`) | Look-alike check and the private-name rule | Free | Agent round 3 | Silent | Acknowledged |
| 13 | Ship declaration files that declare exactly the hallucinated members | Export check (section 2) | Free | Agent round 3 | **Not acknowledged:** section 2 says only "Read the installed copy" | Acknowledged since round 3 |
| 14 | Publish a Python stub package declaring the invented member | Stub-based member check | Free, but the project must install the stub (reasoning) | Typing specification: "If a stub file is found for a module, the type checker should not read the corresponding "real" module." | Not acknowledged | Not acknowledged |
| 15 | A private registry configured outside the repository | Dependency-confusion rule | Free | The Supply-chain Levels for Software Artifacts sentence already in the file | Silent (only the definition is given) | Acknowledged |
| 16 | Homoglyphs; pattern-list aliasing | Character check; pattern list | Free | Agent round 3 | Not described in the skill | Acknowledged |
| 17 | Adopt a held npm name | Placeholder category | Moderate: a request to npm support | `fs` readme: "You may adopt this package by contacting support@npmjs.com and requesting the name." (reused) | Silent | Acknowledged ("A held name can change hands") |
| 18 | Re-register an abandoned or removed package, inheriting its history. It then triages as "Renamed library" (LOW, backlog) or "STALE, NOT HALLUCINATED". | Look-alike age check; the triage table | Moderate | CISA T1195.001: "abandoned packages, which in some cases could be re-registered by threat actors" | **Not acknowledged**; the LOW tier assumes the old name is still in its owner's hands | Partly (compromised packages go to "no owning agent named here") |
| 19 | Register before the model's training cutoff (repeats are predictable) | Cutoff rule | Moderate | USENIX page 3695, "43% … repeated in all 10 queries" (in the wrapper) | Silent | Acknowledged |
| 20 | Compromise a legitimate package or take over a maintainer | Everything above | Expensive | UK centre (Part B.2); the agency's final advisory section 3.2.2, ua-parser-js: "The attackers proceeded to add malicious code to the pre-install and post-install scripts, enabling automatic execution of the payload during installation." (agent round-3 validation, page image) | Silent | Acknowledged as out of scope |
| 21 | Hold the name on a private Conan remote or vcpkg registry | Catalogue 404s | Moderate | — | Acknowledged ("a private Conan remote or vcpkg registry can hold the name") | Not applicable |

**Part C counts:** 21 evasions.
- By the skill: 6 acknowledged, 4 partly, 1 contradicted by its own source (#10). The other 10 are unacknowledged or silent; 8 of those cost the attacker nothing.
- The wrapper acknowledges 4 of those 8 (#3, #7, #12, #13), in full or in part.

## Part D — items carried from round 2
| Item | Verdict |
|---|---|
| `bcrypt` in the browser | **UNSOURCEABLE in its readme.** The readme names no browser and no bcryptjs (tool's negative answer). It says "Since the `bcrypt` module uses `node-gyp` to build and install" and "Pre-built binaries for various NodeJS versions are made available on a best-effort basis." **Action:** strip "NOT in browser" and "bcrypt is Node-only", and use the wrapper's native add-on wording. The skill's "Hallucinated" column header for real packages also contradicts the wrapper's "not phantom". The npm page was not read. |
| How Socket, Snyk and Aikido detect malware | **Socket settled** (tool copy of https://socket.dev/alerts/malware), "Known malware", severity "Critical": "This package version is identified as malware. It has been flagged either by Socket's AI scanner and confirmed by our threat research team, or is listed as malicious in security databases and other sources." / "Packages containing files that were previously confirmed as malware. For these, we reuse the prior AI scans and threat classifications without additional human review." **Snyk not settled:** the documentation page answered 404, so only a search summary exists (malicious packages labelled "CWE-506", usually without a CVE identifier); do not quote it. **Aikido partial:** "We detect malware and vulnerabilities in open-source ecosystems within minutes"; "Our engine automates security analysis using the same methodologies trusted by professional pentesters."; "All Intel data is openly available and commercially licensed." No method is described. |
| deps.dev and Dependency-Track | **Settled as descriptions.** deps.dev: "Open Source Insights is a service developed and hosted by Google to help developers better understand the structure, security, and construction of open source software packages." It covers "Cargo (Rust), Go's module system, Maven (Java), npm (Node.js), NuGet (.NET), PyPI (Python) and RubyGems (Ruby)." The FAQ shows no Scorecard or provenance sentence (tool's negative answer). Dependency-Track: "Dependency-Track is an intelligent Component Analysis platform that allows organizations to identify and reduce risk in the software supply chain." It identifies "Components with known vulnerabilities, Out-of-date components, Modified components, License risk" (the tool's rendering of a list). Neither checks whether a name exists. A lead, not read: deps.dev covers NuGet and Go, the two registries the wrapper has no recipe for; its interface documentation was not read. |
| `cosign verify` | Not checked (budget). `verify-attestation` was read instead (Part A). |
| Scorecard's JSON format | **Settled:** "The currently supported formats are `default` (text) and `json`." / "These may be specified with the `--format` flag. For example, `--format=json`." The readme shows no JSON output (tool). |
| Stripe.net namespace declarations | **Settled for one file:** `SessionService.cs` declares `namespace Stripe.Checkout`; "PaymentPro" does not appear. **Action:** replace "its namespace declarations were not read" with that fact. The rest of the repository was not searched. |
| `go list -m …@latest` and the proxy | Not checked (budget). |
| Whether jscodeshift still drives react-codemod | **Settled as a dependency:** `"jscodeshift": "^0.11.0"` under dependencies, and the script `"jscodeshift": "jscodeshift"`. Whether `npx codemod` calls it was not checked. The skill no longer mentions jscodeshift, so no change is needed. |
| `npm view`'s own output for a missing name | Not checked (budget). The skill already says it was not observed. |
| An npm package named slopcheck | **Settled, and a finding.** Status 200. Description "Scan markdown and config files for hallucinated npm package names. Defends against slopsquatting supply chain attacks." Latest "0.2.0", created "2026-03-08T11:07:16.684Z", maintainer "mattschaller", repository "git+https://github.com/mattschaller/slopcheck.git". This is a different project from the skill's `experimental-gains/slopcheck`. Nothing here says it is malicious. **Action:** name the tool by repository and registry distribution name, and say that npm's `slopcheck` is another project. Whether PyPI's `slopcheck` is the experimental-gains project was not checked. |
| Jackson 3's `ObjectMapper` static `builder()` | **Unsettled.** Status 200, `package tools.jackson.databind;`. The tool quoted a declaration line for a static `builder()`, then hedged that the declaration "appears through" `MapperBuilder`. `writeValueAsJson` is absent. **Action:** keep the example pinned to Jackson 2.18 and add no Jackson 3 claim until a raw grep is run (see below). |
| Typing specification: a missing name inside a stub module that is present | **Partly settled:** "If a stub file is found for a module, the type checker should not read the corresponding "real" module." and "modules not found in the stub package SHOULD be searched for in parts five and six of the module resolution order". Being partial applies to missing *modules*. A stub file that is present is authoritative *for the type checker*, which says nothing about whether the name exists at run time. The page has no sentence about `__getattr__` (tool). |
| Later Veracode updates | Not checked (budget). |
| `npm audit`'s exit rule without `--audit-level` | **Partly settled.** Word for word: "If vulnerabilities were found the exit code will depend on the `audit-level` config." `audit-level` has "Default: null" and is described as "The minimum level of vulnerability for `npm audit` to exit with a non-zero exit code." "Non-zero on any vulnerability by default" is the tool's paraphrase, not a quotation. |

**Part D counts:** 14 items.
- 6 settled: Scorecard, Stripe, jscodeshift, slopcheck, deps.dev and Dependency-Track, Socket.
- 1 unsourceable: bcrypt.
- 3 partial: typing specification, `npm audit` exit rule, Aikido.
- 2 unsettled: Snyk, Jackson 3.
- 4 not checked: `cosign verify`, `go list`, `npm view`, Veracode.

## Recommended actions for the critic
1. **`bcrypt`** in the TypeScript example and in the "Package Names" table: `strip-the-specificity` and use the wrapper's sourced native add-on wording.
2. **slopcheck:** `correct-to` a named repository plus its registry name, and note npm's `slopcheck` (mattschaller, 2026-03-08).
3. **`requests` verification line:** `correct-to` "`get` takes `**kwargs`; read the keyword list of `request` (its `:param json:` line)".
4. **The gate:** either move the malicious-package scan before the install step, or state that the order contradicts the quoted advisory. Add pip-audit's "must not assume … defend you against malicious packages". Add npm-ci's note that `npm test` and `npm run` still run scripts under `--ignore-scripts`.
5. **`react-codeshift`:** add "registered by a third party (maintainer "debugducky", latest 1.0.0), not held by npm".
6. **`cosign verify-attestation`:** add "for container images" (synopsis quoted above).
7. **The provenance layer's purpose:** add that a valid attestation shows which repository built a package, not that it is the right repository. This is labelled reasoning.
8. **Section 2 (reading the installed copy):** add the wrapper's two round-3 caveats, attacker-authored declaration files and install scripts that already ran, so the two files agree.
9. **Tool table:** replace "how Socket … detect malware was not checked" with Socket's quote. Keep Snyk and Aikido as not checked. Add the deps.dev and Dependency-Track descriptions.
10. **Stripe comment:** `correct-to` "`SessionService.cs` declares `namespace Stripe.Checkout`".
11. **Optional:** cite CISA's T1195.001 page beside the typosquatting grouping, and use its re-registered-abandoned-packages sentence against the LOW "Renamed library" tier.

## Everything not checked, plainly
- **Raw bytes of any web answer.** Every quote above passed through the fetch tool's model. Recipes for the session to run:
  - `curl -s https://raw.githubusercontent.com/FasterXML/jackson-databind/3.x/src/main/java/tools/jackson/databind/ObjectMapper.java | grep -n 'static.*builder('`
  - `curl -s https://registry.npmjs.org/react-codeshift | node -e 'const p=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(JSON.stringify(p.description),p["dist-tags"],p.maintainers)'`
  - `curl -s https://pypi.org/pypi/slopcheck/json -o /dev/null -w '%{http_code}'`
  - The whitespace in the three OpenSSL prototypes, byte for byte.
- **Not re-fetched this round:**
  - Go `secretsmanager` and `jaeger-pro` lists; Maven `maven-metadata.xml`; PGXN `pair.json`.
  - The C++ [alg.contains] text; Django's raw source; the `npm-scripts` page; the npm provenance page.
- **Part D:** `cosign verify`; `go list -m …@latest` and the proxy; `npm view`'s 404 output; later Veracode updates; Snyk's own documentation (404); how Aikido detects anything; whether deps.dev shows Scorecard results.
- **Part B:** CISA's secure-by-design documents; the National Security Agency and CISA developer guide; the UK centre's guidance beyond its blog; the official EUR-Lex text; the Cloud Security Alliance note.
- **Part C:** items marked "reasoning" (6, 7, 14, 18) were not run or sourced. Whether npm keeps `time.created` when a name is adopted was not checked.
- **The FastAPI package's directory listing,** to prove there is no `advanced.py`.

```yaml
response:
  dispatch_id: "d-s4-skill-r3-research"
  protocol_version: 1
  agent: ai-quality/citation-validator
  agent_version: "not stated"
  completed_at: null   # no clock tool in this agent; never an invented time
  findings:
    - id: citation-validator/d-s4-skill-r3-research/001
      severity: high
      type: citation-unsourceable
      file: skills/ai-quality/hallucination-detector/SKILL.md
      message: "'works in Node, NOT in browser' and 'bcrypt is Node-only' have no source; bcrypt's readme mentions no browser; the wrapper uses a sourced native add-on wording."
      suggestion: strip-the-specificity
      confidence: MEDIUM
      confidence_rationale: "Negative answer from the fetch tool's model, not a byte check."
      citations:
        brief_url: https://raw.githubusercontent.com/kelektiv/node.bcrypt.js/master/README.md
        evidence: [{ file: skills/ai-quality/hallucination-detector/SKILL.md, text: "works in Node, NOT in browser" }]
    - id: citation-validator/d-s4-skill-r3-research/002
      severity: high
      type: citation-misattributed
      file: skills/ai-quality/hallucination-detector/SKILL.md
      message: "The tool named 'slopcheck' is ambiguous: npm's slopcheck is a different project (maintainer mattschaller, created 2026-03-08T11:07:16.684Z, repository github.com/mattschaller/slopcheck) from the linked experimental-gains/slopcheck."
      suggestion: "correct-to naming the repository and registry distribution name, and noting npm's slopcheck is another project"
      confidence: MEDIUM
      confidence_rationale: "Registry answer read during this dispatch through the fetch tool's model."
      citations:
        brief_url: https://registry.npmjs.org/slopcheck
        evidence: [{ file: skills/ai-quality/hallucination-detector/SKILL.md, text: "slopcheck" }]
    - id: citation-validator/d-s4-skill-r3-research/003
      severity: medium
      type: citation-incomplete
      file: skills/ai-quality/hallucination-detector/SKILL.md
      message: "requests.get's signature is (url, params=None, **kwargs); reading it shows neither json= nor json_body=; json is documented on request()."
      suggestion: "correct-to 'follow **kwargs to request()'s :param json: line'"
      confidence: MEDIUM
      citations:
        brief_url: https://raw.githubusercontent.com/psf/requests/main/src/requests/api.py
    - id: citation-validator/d-s4-skill-r3-research/004
      severity: medium
      type: citation-contradicted-by-own-source
      file: skills/ai-quality/hallucination-detector/SKILL.md
      message: "The gate installs (step 2; pip-audit -r runs install code) before the malicious-package scan (step 3), while the quoted advisory places scans 'prior to installation or during dependency review'; pip-audit says it must not be assumed to defend against malicious packages."
      suggestion: "correct-to scanning before install, or state the contradiction"
      confidence: MEDIUM
      citations:
        brief_url: https://raw.githubusercontent.com/pypa/pip-audit/main/README.md
    - id: citation-validator/d-s4-skill-r3-research/005
      severity: medium
      type: citation-incomplete
      file: skills/ai-quality/hallucination-detector/SKILL.md
      message: "react-codeshift is a third party's registration (latest 1.0.0, maintainer debugducky), not an npm hold."
      suggestion: "correct-to adding the maintainer and version"
      confidence: MEDIUM
      citations:
        brief_url: https://registry.npmjs.org/react-codeshift
    - id: citation-validator/d-s4-skill-r3-research/006
      severity: low
      type: citation-incomplete
      file: skills/ai-quality/hallucination-detector/SKILL.md
      message: "cosign verify-attestation's synopsis is 'Verify an attestation on the supplied container image'; it does not check a package dependency."
      suggestion: "correct-to adding 'for container images'"
      confidence: MEDIUM
      citations:
        brief_url: https://raw.githubusercontent.com/sigstore/cosign/main/doc/cosign_verify-attestation.md
    - id: citation-validator/d-s4-skill-r3-research/007
      severity: info
      type: citation-validated
      message: "22 Part A values and quotations validated (15 re-read this round, 7 reused from earlier rounds); Socket, deps.dev, Dependency-Track, Scorecard --format=json and Stripe.Checkout settled."
      suggestion: keep
      confidence: MEDIUM
      confidence_rationale: "Read during this dispatch through the fetch tool's model, not as raw bytes."
  self_assessment:
    coverage: 0.76
    confidence_overall: LOW
    limitations:
      - "No raw bytes: all 31 fetches went through the fetch tool's model; 4 searches returned summaries only."
      - "Settled 32 of 41 counted items: Part A 25 of 27 (22 validated, 2 holding with a gap; the npm audit signatures row was only partly checked, and 2 rows were not checked this round); Part D 7 of 14 (6 settled, 1 unsourceable; 3 partial, 2 unsettled, 4 not checked). Part B and Part C are not counted."
    unknowns:
      - "Jackson 3 ObjectMapper static builder(): tool answer self-contradictory"
      - "Snyk's malware detection: documentation page answered 404"
      - "Whether PyPI's slopcheck is the experimental-gains project"
      - "go list -m …@latest and the proxy; npm view's 404 output; cosign verify; later Veracode updates"
  metadata:
    tokens_used: null
    tool_calls: 42
```

**Files read locally:**
- `/Users/account/Code/ctoc/skills/ai-quality/hallucination-detector/SKILL.md`
- `/Users/account/Code/ctoc/agents/ai-quality/hallucination-detector.md`
- `/Users/account/Code/ctoc/.ctoc/audit/improvement-run-notes/s4-skill-round2-critic-d-s4-skill-r2-critic.md`
- `/Users/account/Code/ctoc/.ctoc/audit/improvement-run-notes/s4-agent-round3-research-d-s4-agent-r3-research.md`
- `/Users/account/Code/ctoc/.ctoc/audit/improvement-run-notes/s4-skill-round1-session-runs.md`
- `/Users/account/Code/ctoc/.ctoc/audit/improvement-run-notes/s4-skill-round2-session-runs.md`
- Matching lines only, from the agent round-3 critic, validation and re-validation notes.

Sources:
- npm: [react-smart-cache](https://registry.npmjs.org/react-smart-cache) · [zod/latest](https://registry.npmjs.org/zod/latest) · [react-codeshift](https://registry.npmjs.org/react-codeshift) · [slopcheck](https://registry.npmjs.org/slopcheck)
- PyPI: [huggingface_hub](https://pypi.org/pypi/huggingface_hub/json)
- Other registries: [NuGet flat container](https://api.nuget.org/v3-flatcontainer/newtonsoftex.advancedjson/index.json) · [Go proxy](https://proxy.golang.org/github.com/uber-go/cachepro/@v/list) · [crates.io index](https://index.crates.io/to/ki/tokio_advanced) · [Maven fc: search](https://search.maven.org/solrsearch/select?q=fc:org.apache.commons.security.PasswordValidator&rows=20&wt=json) · [Maven a: search](https://search.maven.org/solrsearch/select?q=a:commons-security&rows=20&wt=json) · [PGXN](https://api.pgxn.org/dist/pg_advanced_search.json)
- Library source: [requests api.py](https://raw.githubusercontent.com/psf/requests/main/src/requests/api.py) · [FastAPI security `__init__`](https://raw.githubusercontent.com/fastapi/fastapi/master/fastapi/security/__init__.py) · [OpenSSL EVP_EncryptInit.pod](https://raw.githubusercontent.com/openssl/openssl/master/doc/man3/EVP_EncryptInit.pod) · [Stripe SessionService.cs](https://raw.githubusercontent.com/stripe/stripe-dotnet/master/src/Stripe.net/Services/Checkout/Sessions/SessionService.cs) · [Jackson 3 ObjectMapper](https://raw.githubusercontent.com/FasterXML/jackson-databind/3.x/src/main/java/tools/jackson/databind/ObjectMapper.java) · [react-codemod package.json](https://raw.githubusercontent.com/reactjs/react-codemod/master/package.json) · [bcrypt README](https://raw.githubusercontent.com/kelektiv/node.bcrypt.js/master/README.md)
- Tool documentation: [npm ci v12](https://docs.npmjs.com/cli/v12/commands/npm-ci) · [npm audit v12](https://docs.npmjs.com/cli/v12/commands/npm-audit) · [pip-audit README](https://raw.githubusercontent.com/pypa/pip-audit/main/README.md) · [cosign verify-attestation](https://raw.githubusercontent.com/sigstore/cosign/main/doc/cosign_verify-attestation.md) · [Scorecard README](https://raw.githubusercontent.com/ossf/scorecard/main/README.md) · [Socket CI](https://docs.socket.dev/docs/socket-ci) · [Socket Known malware](https://socket.dev/alerts/malware) · [Snyk malicious packages (404)](https://docs.snyk.io/manage-risk/prioritize-issues-for-fixing/malicious-packages) · [Aikido Intel](https://intel.aikido.dev/) · [deps.dev FAQ](https://docs.deps.dev/faq/) · [Dependency-Track](https://docs.dependencytrack.org/) · [Typing specification, distributing](https://typing.python.org/en/latest/spec/distributing.html)
- Regulators: [CISA T1195.001](https://www.cisa.gov/eviction-strategies-tool/info-attack/T1195.001) · [CISA Secure by Design](https://www.cisa.gov/securebydesign) · [CISA Open Source Software Security Roadmap](https://www.cisa.gov/sites/default/files/2024-02/CISA-Open-Source-Software-Security-Roadmap-508c.pdf) · [UK National Cyber Security Centre blog](https://www.ncsc.gov.uk/blogs/software-supply-chain-attacks-check-your-dependencies) · [French–German joint report](https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/ANSSI_BSI_AI_Coding_Assistants.pdf?__blob=publicationFile&v=7) · [Cyber Resilience Act Article 13, unofficial mirror](https://www.european-cyber-resilience-act.com/Cyber_Resilience_Act_Article_13.html) · [European Union Agency for Cybersecurity AI-assisted development draft](https://www.enisa.europa.eu/sites/default/files/2026-09/ENISA%20Technical%20Advisory-AI-assisted-software-development-draft.pdf)
- Search results only, not read: [Cloud Security Alliance slopsquatting note](https://labs.cloudsecurityalliance.org/research/csa-research-note-slopsquatting-ai-supply-chain-20260419-csa/) · [National Security Agency guidance, news report](https://www.executivegov.com/articles/nsa-cyber-hygiene-guidance-ai-threats) · [Socket AI-detected potential malware alert](https://socket.dev/alerts/gptMalware) · [Snyk support article](https://support.snyk.io/hc/en-us/articles/360001502658-Does-the-Snyk-vulnerability-database-contain-malicious-packages-or-only-known-vulnerabilities-)