# Round 3 critique and change list for `skills/ai-quality/hallucination-detector/SKILL.md`

**Dispatch:** `d-s4-skill-r3-critic`. This is the last round, so nothing is carried. What stays unresolved is listed as left open, and the file says so in its own words where it matters.

**Verdict: REFINE. The file scores 7.4 of 10 as it stands after round 2.** The weakest dimension is robustness.

**What drives the score**
- **The gate contradicts its own source.** It installs, and runs `pip-audit -r`, which executes install code, before it scans for known malicious packages. Yet the advisory it quotes puts scans "prior to installation or during dependency review".
- **Eight ways past its checks cost an attacker nothing, and the skill is silent on them.** The wrapper already handles most of them.
- **The skill calls a third party's registration a registry placeholder.** `react-codeshift` is an ordinary publisher's package that calls itself a placeholder.
- **It recommends a tool, slopcheck, whose name belongs to three unrelated projects.**

This round closes each by instruction, citing the wrapper's rules so the two files say the same thing.

**Before applying**
- **Fingerprint.** Confirm the skill is at `sha256:9d56e48e41da44b77c849bda44960f8ce326b549363adc030e7d66e378aad179`.
- **`old` strings.** Every `old` below was copied from my read of the current file. Each is verbatim and unique, and no two overlap.
- **What stays byte-identical:**
  - the frontmatter;
  - the triage table rows, the seven `kind` values, `registry_checked` and `registry_response`;
  - the five headings the wrapper quotes;
  - the red line "NEVER auto-install…";
  - all five strings `tests/critic-warnings-are-critical.test.js` pins.

## Where this round's evidence comes from, and how it differs from rounds 1 and 2

**Round 1 used** research papers, and each registry's and vendor's documentation.

**Round 2 used** specifications, standards bodies, the agency's final advisory, and the peer-reviewed paper's mitigation section.

**Round 3 used:**
- **Re-reads at the level of the source file:**
  - `requests/api.py`;
  - Stripe.net's `SessionService.cs`;
  - Jackson 3's `ObjectMapper.java`;
  - FastAPI's `security` directory;
  - OpenSSL's cipher manual page;
  - the tool pages: npm version 12, pip-audit, cosign, Socket.
- **A regulator new to this file:** the Cybersecurity and Infrastructure Security Agency's page for technique T1195.001.
- **An adversarial reading:** 21 ways past the file's checks, ranked by what they cost an attacker.
- **The session's raw probes:**
  - Jackson 3's source;
  - `react-codeshift`'s registry answer;
  - the three projects named `slopcheck`;
  - FastAPI's directory listing;
  - OpenSSL's manual page.

**Why these classes are different.** Rounds 1 and 2 asked whether a statement matches its source. Round 3 reads the code a statement describes, asks what a regulator expects, and asks how an attacker who has read this file would get past it.

## Seven-language check

All seven required languages carry examples, as they did after round 2. Examples changed this round, each with how it was checked:

| Language | Example | How it was checked |
|---|---|---|
| Python | `requests` | Read in the main-branch source |
| Python | FastAPI | Read in the directory listing |
| C# | Stripe.net | Read in `SessionService.cs` |
| Java | Jackson 3 | Read in the raw source |
| JavaScript and TypeScript | `react-codeshift`, and the bcrypt row | Read in the raw registry answer and the bcrypt readme |

Unchanged this round:
- **C and C++:** OpenSSL's manual page re-read raw; the C++ pair was compiled in round 2.
- **SQL.**

---

## Findings, most severe first

### Finding 1 — high — new: the gate contradicts its own source

**What is wrong.** Step 2 installs, and `pip-audit -r` runs install code, before step 3 scans for known malicious packages. The paragraph above the gate quotes the advisory placing scans "prior to installation or during dependency review".

**What the vendors say, all read 2026-09-30:**
- **pip-audit:** "you **must not** assume that `pip-audit` will **defend** you against malicious packages".
- **npm-ci:** "commands explicitly intended to run a particular script, such as `npm start`, `npm stop`, `npm restart`, `npm test`, and `npm run` will still run their intended script if `ignore-scripts` is set".
- **Socket:** `socket ci` exits non-zero on "no supported manifest files", so it reads manifests and can run before anything is installed. It fails a scan whose alerts "violate your security or license policy".

**The fix.** The malicious-package scan moves before the install.

**Decision:** `change`. Changes 1a–1c. Change 1b also carries finding 11 (cosign).

**Proposed change 1a** (the gate's code)

old:
~~~text
# 1. Names first, read-only: run the wrapper's registry recipes on every new dependency name
#    (agents/ai-quality/hallucination-detector.md, "Detection Methods", section 1)

# 2. Install without lifecycle scripts, then audit (only after step 1 passed)
npm ci --ignore-scripts && npm audit --omit=dev
pip-audit -r requirements.txt   # runs the same code an install would
cargo audit
govulncheck ./...

# 3. Malicious-package detection (Socket as example)
socket ci                       # alias for 'socket scan create --report'; non-zero exit on unhealthy alerts

# 4. Signature / provenance
npm audit signatures
cosign verify-attestation --type slsaprovenance --certificate-identity <id> --certificate-oidc-issuer <issuer> <image>

# 5. Health (authenticate first, as the Scorecard README requires)
scorecard --repo=github.com/<org>/<pkg> --format=json
~~~

new:
~~~text
# 1. Names first, read-only: run the wrapper's registry recipes on every new dependency name
#    (agents/ai-quality/hallucination-detector.md, "Detection Methods", section 1)

# 2. Malicious-package detection before anything is installed (Socket as example; it reads the manifest files)
socket ci                       # alias for 'socket scan create --report'; non-zero exit when alerts violate your security or license policy

# 3. Install without lifecycle scripts, then audit for known vulnerabilities (only after steps 1 and 2 passed)
npm ci --ignore-scripts && npm audit --omit=dev   # npm audit's exit code depends on the audit-level configuration
pip-audit -r requirements.txt   # runs the same code an install would, and is not a malware check
cargo audit
govulncheck ./...

# 4. Signature / provenance
npm audit signatures
cosign verify-attestation --type slsaprovenance --certificate-identity <id> --certificate-oidc-issuer <issuer> <image>   # container images only

# 5. Health (authenticate first, as the Scorecard README requires)
scorecard --repo=github.com/<org>/<pkg> --format=json   # <org>/<pkg>: a repository you have reason to trust, never the one a package's metadata names
~~~

**Proposed change 1b** (the sources paragraph under the gate)

old:
~~~text
Sources, all read 2026-09-30: `--ignore-scripts` means "npm does not run scripts specified in package.json files" (https://docs.npmjs.com/cli/v12/commands/npm-ci); Socket's token "needs the `full-scans:create`, `full-scans:list`, and `security-policy:read` permissions" (https://docs.socket.dev/docs/socket-ci); for keyless verification "Either --certificate-identity or --certificate-identity-regexp must be set", and the same holds for the issuer (https://github.com/sigstore/cosign/blob/main/doc/cosign_verify-attestation.md);
~~~

new:
~~~text
Sources, all read 2026-09-30: `--ignore-scripts` means "npm does not run scripts specified in package.json files", but "commands explicitly intended to run a particular script, such as `npm start`, `npm stop`, `npm restart`, `npm test`, and `npm run` will still run their intended script if `ignore-scripts` is set" (https://docs.npmjs.com/cli/v12/commands/npm-ci), and, this file's own reasoning, a package's own code still runs whenever it is loaded; for `npm audit`, "If vulnerabilities were found the exit code will depend on the `audit-level` config." (https://docs.npmjs.com/cli/v12/commands/npm-audit); pip-audit's documentation says "you **must not** assume that `pip-audit` will **defend** you against malicious packages" (https://github.com/pypa/pip-audit); `socket ci` "is basically an alias to `socket scan create --report`", its exit code is non-zero when the scan "has alerts that violate your security or license policy" and also when there are "no supported manifest files", and its token "needs the `full-scans:create`, `full-scans:list`, and `security-policy:read` permissions" (https://docs.socket.dev/docs/socket-ci); `cosign verify-attestation` is to "Verify an attestation on the supplied container image", and for keyless verification "Either --certificate-identity or --certificate-identity-regexp must be set", and the same holds for the issuer (https://github.com/sigstore/cosign/blob/main/doc/cosign_verify-attestation.md);
~~~

**Proposed change 1c** (the paragraph above the gate)

old:
~~~text
Check names before anything is installed, which matches the order in the European Union Agency for Cybersecurity's advisory:
~~~

new:
~~~text
Check names, and scan for packages already known to be malicious, before anything is installed, which matches the order in the European Union Agency for Cybersecurity's advisory:
~~~

### Finding 2 — high — new: the skill is silent on eight ways past its checks that cost an attacker nothing

**What is wrong.** Research Part C lists 21 ways past the checks. Eight cost nothing, and the skill says nothing about them:
1. a pre-registered name with no well-known counterpart;
2. a private registry configured outside the repository;
3. a name written with characters that only imitate Latin letters;
4. declaration files written by a look-alike's publisher;
5. a repository link that points at the genuine project;
6. a new scope that resembles the organisation's own;
7. inflated download counts;
8. this file's own dated 404s, which anyone can now register.

The wrapper states a rule for most of them. The skill states none, so a reader of the skill alone is exposed.

**Sources for the rules**
- **The wrapper's own rules** (look-alike check; the private-name rule; the character check; Export Verification; "a repository link is the publisher's claim").
- **The advisory:** "Popularity metrics can be misleading or artificially inflated" and "should not be relied upon in isolation" (section 4.1.1, page 17, read as a page image in round 2).
- **The file's own history:** `react-codeshift`, `serde_json_ext`.

**Decision:** `change`. Each evasion is closed by an instruction.

**Proposed change 2**

old:
~~~text
- **Verify every import against its registry, never by installing it.**
~~~

new:
~~~text
- **Ways past these checks, and the rule for each.** Each of these gets past a review that stops at the registry's answer:
  - A pre-registered name with no well-known counterpart: record it as "registered; no well-known counterpart named; not settled" (the wrapper's look-alike check).
  - A private registry configured outside the repository, in a user's own settings or a pipeline's environment: a reviewer who reads only the repository cannot see it; say so in the limitations (the wrapper's rule for a private-looking name).
  - A name written with a character that only imitates a Latin letter: the wrapper's character check refuses it; search the line for any character above code point 127 before recording the name as not checked.
  - Declaration files written by the publisher of a look-alike: a member found there proves only that the publisher declared it (section 2 below).
  - A repository link that points at the genuine project: the link is the publisher's claim, not proof of where the code came from (the wrapper), so give Scorecard a repository you have reason to trust, never the one a package's metadata names.
  - A new scope that resembles the organisation's own, for example `@acme-corp` beside `@acme`: the scope itself is the counterpart to compare (the wrapper).
  - Inflated download counts: the European Union Agency for Cybersecurity warns that "Popularity metrics can be misleading or artificially inflated" and "should not be relied upon in isolation" (version 1.1, section 4.1.1, page 17, https://www.enisa.europa.eu/sites/default/files/2026-03/ENISA%20Technical%20Advisory%20-%20Package_Managers_Final.pdf, read 2026-09-30); a name registered later than its counterpart is reported whatever its count.
  - The dated answers in this file's examples: each 404 below was true on the day it was read, and the names are now published here, where anyone can register them; `react-codeshift` and `serde_json_ext` below show that plausible names do get registered. Run the recipe again in every review; a dated answer is never today's.
- **Verify every import against its registry, never by installing it.**
~~~

### Finding 3 — high — new: a third party's self-described "placeholder" is presented as a registry hold

**What is wrong.** `react-codeshift` is an ordinary registration:
- maintainer "debugducky", latest "1.0.0", created 2026-01-14 (session raw);
- description "🚫 Placeholder to prevent dependency confusion.".

The wrapper's npm recipe marks a name as held only on a `-security` version or the "security holding package" wording, so it prints REGISTERED for this name. The skill's table and its "Registry placeholder" category make it read as harmless.

**Decision:** `change`. Changes 3a and 3b.

**Proposed change 3a** (the `react-codeshift` row)

old:
~~~text
now registered with the description "Placeholder to prevent dependency confusion." (the description begins with a symbol), created 2026-01-14 (https://registry.npmjs.org/react-codeshift, read 2026-09-30);
~~~

new:
~~~text
registered on 2026-01-14 by a third party, maintainer "debugducky", latest version "1.0.0", with the description "Placeholder to prevent dependency confusion." (the description begins with a symbol) (https://registry.npmjs.org/react-codeshift, read 2026-09-30). That is not a registry hold: the wrapper's npm recipe prints REGISTERED for it, and, this file's own reasoning, its publisher can put anything in the next version;
~~~

**Proposed change 3b** (the "Registry placeholder" category)

old:
~~~text
"deprecated sklearn package, use scikit-learn instead" (https://pypi.org/pypi/sklearn/json, read 2026-09-30) |
~~~

new:
~~~text
"deprecated sklearn package, use scikit-learn instead" (https://pypi.org/pypi/sklearn/json, read 2026-09-30). A package that only calls itself a placeholder, published by an ordinary account, is not a hold: the wrapper's recipe prints REGISTERED for it, as for `react-codeshift` (see "Package Names"), so it goes to the look-alike check |
~~~

### Finding 4 — medium — new: the recommended tool "slopcheck" is three unrelated projects

**What is wrong.** The session found three projects under the name, all read 2026-09-30:
- **experimental-gains/slopcheck** on GitHub, the one the skill links;
- **the PyPI distribution `slopcheck`** 0.6.1, whose project address is `github.com/0xToxSec/slopcheck`;
- **the npm package `slopcheck`** 0.2.0, maintainer mattschaller, created 2026-03-08.

The row's "installed with pip" therefore installs a different project. The collision is itself the lesson the skill teaches.

**Decision:** `change`. Changes 4a and 4b, both on the same row and not overlapping.

**Proposed change 4a**

old:
~~~text
**slopcheck** (for example https://github.com/experimental-gains/slopcheck, installed with pip)
~~~

new:
~~~text
**slopcheck** — three unrelated projects carry this name: https://github.com/experimental-gains/slopcheck (the one described in the next column); the PyPI distribution `slopcheck`, version 0.6.1, whose project address is https://github.com/0xToxSec/slopcheck (https://pypi.org/pypi/slopcheck/json); and the npm package `slopcheck`, version 0.2.0, maintainer mattschaller, created 2026-03-08, repository github.com/mattschaller/slopcheck (https://registry.npmjs.org/slopcheck); all read 2026-09-30. Installing "slopcheck" by bare name from PyPI or npm gets one of the other two. The shared name is itself the lesson: install a checking tool by its repository or exact registry entry, and check that entry as you would any other name;
~~~

**Proposed change 4b**

old:
~~~text
| slopcheck: "Catch hallucinated / slopsquatted
~~~

new:
~~~text
| experimental-gains' slopcheck: "Catch hallucinated / slopsquatted
~~~

### Finding 5 — medium — resolves round 2's carried item: the bcrypt table row has no source, and the "Hallucinated" heading contradicts the wrapper

**What is wrong.**
- **"bcrypt (browser)" and "bcrypt is Node-only" cannot be sourced.** bcrypt's readme names no browser (research Part D).
- **The heading "Hallucinated" is wrong for this table,** which lists real packages. The wrapper says these are "never as non-existent".

The fix uses the wrapper's sourced wording.

**Decision:** `change`

**Proposed change 5**

old:
~~~text
### Package Names (npm/PyPI)
| Hallucinated | Actual |
|---|---|
| `react-query` | `@tanstack/react-query` (rename, 2022) |
| `bcrypt` (browser) | `bcryptjs` (bcrypt is Node-only) |
~~~

new:
~~~text
### Package Names (npm/PyPI)
Several of these are real packages chosen for the wrong job, not invented names: report them as stale or wrong for the environment, never as non-existent.

| Written | Prefer |
|---|---|
| `react-query` | `@tanstack/react-query` (rename, 2022) |
| `bcrypt` where no pre-built binary fits and native builds aren't available | `bcryptjs`: bcrypt is a native add-on whose install script is "node-gyp-build" (https://registry.npmjs.org/bcrypt/latest, read 2026-09-30), and its readme says "Pre-built binaries for various NodeJS versions are made available on a best-effort basis." (https://raw.githubusercontent.com/kelektiv/node.bcrypt.js/master/README.md, read 2026-09-30) |
~~~

### Finding 6 — medium — new: section 2 lacks the wrapper's two limits on reading an installed copy

**What is wrong.** The wrapper's Export Verification states two limits the skill's section 2 omits:
- declaration files come from whoever published the package, so a member found there proves nothing about a suspect name;
- an installed copy has already run its install step.

**Decision:** `change`

**Proposed change 6**

old:
~~~text
with no installed copy, the member stays unsettled and is never installed to settle it.
~~~

new:
~~~text
with no installed copy, the member stays unsettled and is never installed to settle it. Two limits the wrapper states apply here too: a member found in the installed copy settles the member only when the package's name is settled as well, because a package's declaration files come from whoever published it; and an installed copy has already been through its install step, so read the `scripts` object in its `package.json` and hand every entry whose name contains `install` to dependency-auditor, which owns install-time hook abuse.
~~~

### Finding 7 — medium — new: the provenance layer implies more than a valid attestation proves

**What is wrong.** "Verify the artifact's chain back to the source repo" suggests a valid attestation settles the question. It shows which repository built the package, not that this is the repository the code meant. This is the file's own reasoning, labelled as such: anyone can publish with provenance from their own repository.

**Decision:** `change`. Changes 7a and 7b.

**Proposed change 7a**

old:
~~~text
A missing or mismatched attestation is a reason to look closer, never proof on its own.
~~~

new:
~~~text
A missing or mismatched attestation is a reason to look closer, never proof on its own; and a present, valid one shows only where a package was built, not that it is the package the code meant (this file's own reasoning).
~~~

**Proposed change 7b**

old:
~~~text
| Verify the artifact's chain back to the source repo |
~~~

new:
~~~text
| Verify the artifact's chain back to the repository that built it; a valid attestation shows which repository and workflow built a package, not that it is the repository the code meant (this file's own reasoning, since anyone can publish with provenance from their own repository) |
~~~

### Finding 8 — medium — new: no regulator source for name confusion, and the LOW "Renamed library" tier assumes an old name stays with its owner

**What the Cybersecurity and Infrastructure Security Agency's page for T1195.001 says** (read 2026-09-30):
- "Adversaries may also employ 'typosquatting' or name-confusion by choosing names similar to existing popular libraries or packages in order to deceive a user."
- The attack "may also include abandoned packages, which in some cases could be re-registered by threat actors after being removed by adversaries."

**A caution on the source.** The page follows MITRE ATT&CK's numbering, and whether the wording is the agency's own was not checked; the file says so.

**The fix.** The triage rows stay byte-identical, so the limit goes after the table.

**Decision:** `change`. Changes 8a and 8b.

**Proposed change 8a**

old:
~~~text
groups package confusion into "typosquatting, combosquatting, brandjacking, and similarity attacks" (page 3688),
~~~

new:
~~~text
groups package confusion into "typosquatting, combosquatting, brandjacking, and similarity attacks" (page 3688); the Cybersecurity and Infrastructure Security Agency's page for technique T1195.001, which follows MITRE ATT&CK's numbering (whether the wording is the agency's own was not checked), says "Adversaries may also employ 'typosquatting' or name-confusion by choosing names similar to existing popular libraries or packages in order to deceive a user." (https://www.cisa.gov/eviction-strategies-tool/info-attack/T1195.001, read 2026-09-30);
~~~

**Proposed change 8b**

old:
~~~text
The wire severity is always `critical`. Triage tier informs the human-readable report only.
~~~

new:
~~~text
The wire severity is always `critical`. Triage tier informs the human-readable report only.

One limit on the LOW row, which applies now: an old package name is not always still in its owner's hands. The Cybersecurity and Infrastructure Security Agency's page for technique T1195.001 says this "may also include abandoned packages, which in some cases could be re-registered by threat actors after being removed by adversaries." (https://www.cisa.gov/eviction-strategies-tool/info-attack/T1195.001, read 2026-09-30). Triage a renamed library as LOW only when the registry answer read during the check shows the maintainers the well-known project has (the wrapper's npm recipe prints them); otherwise treat the name as a suspected look-alike.
~~~

### Finding 9 — medium — new: the `requests` check cannot settle the question it asks

**What is wrong.** `requests.get` takes `**kwargs`, so reading its signature shows neither `json=` nor `json_body=`. The keyword is documented on `request`.

**Evidence.** Research Part A, read from the main-branch source. Released versions' typing was not checked, and the file says so.

**Decision:** `change`

**Proposed change 9**

old:
~~~text
#   read the signature of requests.get in the installed requests source, or in the library's interface reference
~~~

new:
~~~text
#   requests.get takes **kwargs (on the main branch: def get(url: _t.UriType, params: _t.ParamsType = None, **kwargs: Unpack[_t.GetKwargs]) -> Response),
#   so its signature shows neither json= nor json_body=; follow the keyword arguments to request, whose docstring has
#   ":param json: (optional) A JSON serializable Python object to send in the body of the :class:`Request`." (https://raw.githubusercontent.com/psf/requests/main/src/requests/api.py, read 2026-09-30; released versions' typing not checked)
~~~

### Finding 10 — low — resolves round 2's carried item: the tool table says Socket's detection "was not checked"

**What changes.**
- **Socket:** its own "Known malware" page is now quoted.
- **Aikido:** its page describes no method, and the file says so.
- **Snyk:** its documentation answered 404, so it stays not checked, stated in the file's own words.

**Decision:** `change`

**Proposed change 10**

old:
~~~text
; how Socket, Snyk and Aikido detect malware was not checked |
~~~

new:
~~~text
; Socket's "Known malware" alert means the package version "has been flagged either by Socket's AI scanner and confirmed by our threat research team, or is listed as malicious in security databases and other sources" (https://socket.dev/alerts/malware, read 2026-09-30); Aikido's page says it detects malware but describes no method (https://intel.aikido.dev, read 2026-09-30); how Snyk detects malicious packages was not checked, because its documentation page answered 404 |
~~~

### Finding 11 — low — new: `cosign verify-attestation` checks container images, not package dependencies

**What is wrong.** Its synopsis is "Verify an attestation on the supplied container image". Nothing in the file says the command's scope is images.

**Decision:** `change`, carried by changes 1a and 1b.

### Finding 12 — low — resolves round 2's carried item: the Stripe comment still says the namespace declarations were not read

**Evidence.** `SessionService.cs` declares `namespace Stripe.Checkout`, and "PaymentPro" does not appear in it (research Part D).

**Decision:** `change`

**Proposed change 12**

old:
~~~text
its namespace declarations were not read
~~~

new:
~~~text
its SessionService.cs declares namespace Stripe.Checkout, and "PaymentPro" does not appear in it (https://raw.githubusercontent.com/stripe/stripe-dotnet/master/src/Stripe.net/Services/Checkout/Sessions/SessionService.cs, read 2026-09-30); the rest of the repository was not searched
~~~

### Finding 13 — low — new: the FastAPI comment can cite the directory itself

**Evidence.** The session listed `fastapi/security`: `__init__.py`, `api_key.py`, `base.py`, `http.py`, `oauth2.py`, `open_id_connect_url.py`, `utils.py`. There is no `advanced.py`.

**Decision:** `change`

**Proposed change 13**

old:
~~~text
# No 'advanced' submodule
~~~

new:
~~~text
# No 'advanced' submodule: the fastapi/security directory holds __init__.py, api_key.py, base.py, http.py, oauth2.py, open_id_connect_url.py and utils.py (https://api.github.com/repos/fastapi/fastapi/contents/fastapi/security, read 2026-09-30)
~~~

### Finding 14 — low — new: the Jackson 3 fact is now settled from raw source

**Evidence.** Jackson 3's `ObjectMapper.java` declares no static `builder()`; the only hit is a comment on line 49. Jackson 3's `JsonMapper.java` declares it at line 151 (session raw).

**Decision:** `change`. The example stays pinned to Jackson 2.18, with the Jackson 3 fact added.

**Proposed change 14**

old:
~~~text
// SAFE — the form the jackson-databind readme shows:
~~~

new:
~~~text
// In Jackson 3 too, ObjectMapper declares no static builder(); the only "static builder()" in its source is a comment (https://raw.githubusercontent.com/FasterXML/jackson-databind/3.x/src/main/java/tools/jackson/databind/ObjectMapper.java, read 2026-09-30), and JsonMapper.java in the same branch declares it at line 151
// SAFE — the form the jackson-databind readme shows:
~~~

### Finding 15 — low — new: the confidence sentence no longer matches the wrapper

**What is wrong.** Since the wrapper's round-2 late corrections, its HIGH row and Export Verification exclude a whole module missing from a Python stub package that declares itself partial. The skill's line 57 omits that exception, so the paired files disagree.

**Decision:** `change`

**Proposed change 15**

old:
~~~text
a registration date set against a stated training cutoff); a pattern hit alone is LOW.
~~~

new:
~~~text
a registration date set against a stated training cutoff); a pattern hit alone is LOW; and a whole module missing from a Python stub package that declares itself partial is not a finding at all but an unknown (the wrapper's Export Verification).
~~~

---

## Left open (there is no round 4)

**Stated in the file's own words after these changes**
- **Tools and their detection methods:**
  - how Snyk detects malicious packages (its documentation answered 404);
  - that Aikido describes no method.
- **Code and sources:**
  - `requests`' released-version typing;
  - the rest of the Stripe.net repository;
  - whether the agency's T1195.001 wording is its own;
  - `npm view`'s own 404 output (already stated);
  - a module missing from a partial stub package (it is an unknown).
- **Excluded deliberately:** a complete AES-GCM program in C (already stated, with the reason).

**Left open here, and not claimed in the file**
- **Tools not checked:**
  - `cosign verify`, which the table only names;
  - whether `go list -m …@latest` contacts the proxy;
  - later Veracode updates;
  - the National Vulnerability Database itself;
  - PostgreSQL "core" and third-party distributions;
  - Django's raw source (the documentation was checked).
- **Quotations and addresses to confirm:**
  - whether docs.deps.dev reads "structure, construction, and security" (the file's quotation) or "structure, security, and construction" (the FAQ page, as the research read it). The two may be different pages; neither was read as raw bytes.
  - the exact address of Jackson 3's `JsonMapper.java`. Its line 151 was read by the session, but the note records no address; the validation dispatch should supply it.
  - the FastAPI directory listing's address, which the validation dispatch should confirm (the session used GitHub's contents interface).
- **How registries behave:** whether npm keeps `time.created` when a held name is adopted.
- **Documents not read:**
  - OWASP's Software Component Verification Standard beyond chapter 4;
  - the agency's printed pages 22–24;
  - the Cyber Resilience Act text (not cited: only an unofficial mirror was readable).
- **Stub files:** what the typing specification says about a name missing inside a stub module that is present.

## Statements that rest only on a page read through a summarising tool

**Through a summarising tool, not as raw bytes**
- `requests/api.py`'s quotations;
- `SessionService.cs`;
- Socket's two pages;
- Aikido's page;
- the npm-ci note and the npm-audit exit sentence;
- pip-audit's caution;
- cosign's synopsis;
- the T1195.001 sentences.

**Read directly**
- **The agency's section 4.1.1 sentence:** from round 2's page images.
- **The session's raw probes:** Jackson 3, `react-codeshift`, the three `slopcheck` projects, the FastAPI directory, and the OpenSSL manual page.

## For the human

- **Whether the skill keeps a recommended gate for continuous integration at all,** now reordered. The wrapper never runs it, and it recommends third-party tools. The `slopcheck` name collision shows the risk of recommending tools by name. Standing, and a scope decision.
- **The trigger phrase "AI code review"** is shared with ai-code-quality-reviewer. Standing.
- **Standing from the agent file:** private-registry credentials; a tool that verifies provenance; `tokens_used: null` versus the schema.

## Cross-file findings for the agent (`agents/ai-quality/hallucination-detector.md`)

1. **The wrapper's `renamed_package` row carries the same unstated assumption as the skill's LOW tier (finding 8).** Proposed late correction:

   old:
   ~~~text
   | `renamed_package` | low |
   ~~~

   new:
   ~~~text
   | `renamed_package`, when the npm recipe's answer shows the maintainers the well-known project has; otherwise report `suspected_lookalike`, because an abandoned name "could be re-registered by threat actors" (https://www.cisa.gov/eviction-strategies-tool/info-attack/T1195.001, read 2026-09-30) | low |
   ~~~

2. **Self-described placeholders (finding 3).** The wrapper's recipe already prints REGISTERED for them. No change is needed; the skill now says so.
3. **The gate (finding 1).** The wrapper never runs it. No change.
4. **"the examples across seven languages" (wrapper line 22).** True. No change.
5. **Everything the wrapper depends on is byte-identical:**
   - the triage table rows;
   - the seven `kind` values;
   - `registry_checked` and `registry_response`;
   - the five quoted headings;
   - the "NEVER auto-install…" red line.

## Scores for the skill as it stands (round-2 result), weighted as a review agent

| Dimension | Score | Why |
|---|---|---|
| Specificity | 8 | Concrete, sourced, and examples proved by compiling or by reading the source. |
| Completeness | 7 | The eight free ways past its checks are unstated. |
| Boundaries | 7 | Defers to the wrapper; the tool table's scope is loose. |
| Actionability | 8 | — |
| Integration | 8 | One inconsistency with the wrapper: the partial-stub exception. |
| Robustness | 6 | The gate contradicts its own source; eight silent evasions; a third party's registration presented as a hold. |
| Calibration | 7 | The LOW tier assumes a renamed name stays with its owner. |
| Research grounding | 8 | The bcrypt row is unsourced, and `slopcheck` is ambiguous. |
| **Overall** | **7.4** | Weights: specificity 1.75, completeness 1.5, boundaries 1, actionability 1.25, integration 1, robustness 0.75, calibration 1.25, research grounding 1. Verdict: REFINE. |

**Weakest dimension: robustness (6).** Findings 1, 2 and 3 close it: the malicious-package scan now runs before any install, every free evasion has a rule, and a self-described placeholder is sent to the look-alike check instead of being trusted.