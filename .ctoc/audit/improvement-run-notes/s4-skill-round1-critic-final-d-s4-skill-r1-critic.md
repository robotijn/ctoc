# Final change list, round 1, for `skills/ai-quality/hallucination-detector/SKILL.md`

**Dispatch:** `d-s4-skill-r1-critic`, final. The executor applies this document as it stands and reads nothing else.

**Corrections folded in**
- Every correction from the validator (`d-s4-skill-r1-validate`), in its own wording.
- Every fact the session probed afterwards with raw fetches (`s4-skill-round1-session-runs.md`).
- Four addresses the validator found, and three PostgreSQL addresses the session found.
- Spelled out in prose: "the library's interface reference", "software development kit", "JavaScript Object Notation", "Python Enhancement Proposal", "the Common Vulnerabilities and Exposures program".

**Rules for applying the changes**
- **Fingerprint.** Confirm `sha256:e1472d75e7ebcbcf1f0a69340601ce698cc506b609392d454772ec7d6290f11` before applying anything.
- **`old` strings.** Every `old` is a verbatim, unique substring of the current file, and no two overlap.
- **`new` strings.** Every `new` is complete.
- **Aligned comments.** The spaces inside aligned comments in code blocks were counted from my read. If one fails to match, re-anchor on the same lines.

**What stays byte-identical, because the wrapper `agents/ai-quality/hallucination-detector.md` depends on it or a test pins it**
- the triage table;
- the seven `kind` values;
- `registry_checked` and `registry_response`;
- the headings "Severity (internal triage vs. refinement-loop output)", "Letter schema (refinement-loop output contract)", "Refinement Loop — critic mode (v6.9.8)", "Tool Integration (2026)" and "Red Lines";
- red line 395;
- all five strings `tests/critic-warnings-are-critical.test.js` pins.

**Seven-language result.**
- **Corrected:** JavaScript and TypeScript, Python, C#, Java and SQL, plus the extra Go and Rust examples.
- **C and C++:** the out-of-scope sentence is corrected, but there are no examples yet. No note has checked an invented C or C++ name, so the examples are carried to round 2.

---

## Findings and changes, most severe first

### Finding 1 — critical: the method runs, installs or downloads the package it checks

**What is wrong.** These lines tell the reader to do what red line 395 forbids:
- lines 119–120, `python -c "import …"`;
- line 138, `dotnet add package`;
- line 154, `mvn dependency:resolve`;
- line 175, `go mod download`;
- lines 246 and 253, `require` and `importlib`;
- the gate at lines 280–281, `npm ci` and `pip install` before any name is checked.

**Decision:** `change`

**Change 1a** (Python examples and verification lines)

old:
~~~text
import huggingface_cli                          # Lasso's classic test — empty package was registered later
from email_validator_pro import validate        # PyPI: not found
from django_security_audit import scan          # PyPI: not found

# HALLUCINATION — wrong submodule inside a real package
from django.core.validators import validate_strong_password   # Django has no such validator
from fastapi.security.advanced import OAuth3                  # No 'advanced' submodule

# HALLUCINATION — wrong signature on a real method
import requests
requests.get(url, json_body=payload)            # 'json_body' is not a kwarg; it's 'json='

# VERIFICATION
#   pip index versions huggingface_cli
#   python -c "import django.core.validators as m; print(dir(m))"
#   python -c "import inspect, requests; print(inspect.signature(requests.get))"
~~~

new:
~~~text
import huggingface_cli                          # Lasso's classic test — empty package was registered later; PyPI answers 404 for huggingface-cli today (https://pypi.org/pypi/huggingface-cli/json, read 2026-09-30)
from email_validator_pro import validate        # PyPI: not found
from django_security_audit import scan          # PyPI: not found

# HALLUCINATION — wrong submodule inside a real package
from django.core.validators import validate_strong_password   # Django has no such validator; its password check is validate_password(password, user=None, password_validators=None) (https://docs.djangoproject.com/en/5.2/topics/auth/passwords/, read 2026-09-30)
from fastapi.security.advanced import OAuth3                  # No 'advanced' submodule

# HALLUCINATION — wrong signature on a real method
import requests
requests.get(url, json_body=payload)            # 'json_body' is not a kwarg; it's 'json='

# VERIFICATION (read-only: never import a package to inspect it)
#   the wrapper's PyPI recipe, run on the distribution name (an import name is not a distribution name)
#   read the installed source or .pyi stub of django.core.validators and search it for the name
#   read the signature of requests.get in the installed requests source, or in the library's interface reference
~~~

**Change 1b** (C# verification lines)

old:
~~~text
//   dotnet package search NewtonsoftEx.AdvancedJson          (empty result = not on NuGet)
//   dotnet add package NewtonsoftEx.AdvancedJson             (NU1101 if the id doesn't resolve)
//   Inspect dotnet reflection on the .dll for the method signature
//   Also verify NuGet package signature: dotnet nuget verify <pkg>.nupkg
~~~

new:
~~~text
//   dotnet package search NewtonsoftEx.AdvancedJson --exact-match   (empty result = not on NuGet; .NET 8.0.2xx software development kit and later; https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-package-search, read 2026-09-30)
//   https://api.nuget.org/v3-flatcontainer/newtonsoftex.advancedjson/index.json answered status 404 on 2026-09-30
//   Never use dotnet add package to test a name
//   Read the method's signature in the library's interface reference, never by loading the assembly
//   Signature: dotnet nuget verify <pkg>.nupkg — look for an author signature, not only a signature
~~~

**Change 1c** (Java examples and verification lines; also carries part of finding 3)

old:
~~~text
// HALLUCINATION — Maven coordinates don't resolve
import org.apache.commons.security.PasswordValidator;   // commons-security doesn't exist
// pom.xml: <artifactId>spring-boot-starter-security-advanced</artifactId>   ← not found

// HALLUCINATION — wrong method on a real class
String json = ObjectMapper.builder().build().writeValueAsJson(obj);  // Jackson is writeValueAsString

// VERIFICATION
//   mvn dependency:resolve   (will fail with [ERROR] Could not find artifact)
//   curl -I "https://repo1.maven.org/maven2/<groupId-path>/<artifactId>/<version>/"
//   Verify GPG: gpg --verify <jar>.asc <jar>   (against publisher's known key)
//   javap -p <Class>   → list declared methods
~~~

new:
~~~text
// HALLUCINATION — Maven coordinates don't resolve
import org.apache.commons.security.PasswordValidator;   // no org.apache.commons:commons-security and no class of this name on Maven Central; an artifact called commons-security exists under three other groups, none of them org.apache.commons (https://search.maven.org/solrsearch/select?q=a:commons-security&rows=20&wt=json, read 2026-09-30)
// pom.xml: <artifactId>spring-boot-starter-security-advanced</artifactId>   ← not found

// HALLUCINATION — wrong method on a real class
String json = ObjectMapper.builder().build().writeValueAsJson(obj);  // Jackson is writeValueAsString

// VERIFICATION (read-only; the wrapper's Maven Central recipe is the full check)
//   https://repo1.maven.org/maven2/org/apache/commons/commons-security/maven-metadata.xml answered status 404 on 2026-09-30
//   Central's search guide documents a class-name search, fc:, that "Returns a list of artifacts, down to the specific version containing the class" (https://central.sonatype.org/search/rest-api-guide/, read 2026-09-30);
//   https://search.maven.org/solrsearch/select?q=fc:org.apache.commons.security.PasswordValidator&rows=20&wt=json answered numFound 0 on 2026-09-30
//   Never run mvn dependency:resolve to test a name
//   Verify GPG: gpg --verify <jar>.asc <jar>   (against publisher's known key)
//   javap -p <Class>   → list declared methods
~~~

**Change 1d** (Go verification lines)

old:
~~~text
//   go list -m github.com/uber-go/cachepro@latest        (will fail if missing)
//   go mod download github.com/uber-go/cachepro          (sumdb check)
~~~

new:
~~~text
//   go list -m github.com/uber-go/cachepro@latest        (will fail if missing)
//   https://proxy.golang.org/github.com/uber-go/cachepro/@v/list answered status 404 on 2026-09-30
//   Never run go mod download to test a name: it downloads the module
~~~

**Change 1e** ("Detection Methods", section 1)

old:
~~~text
### 1. Package existence + signature
```bash
# npm — exists + provenance attestation
npm view <pkg> --json 2>/dev/null | jq '{name, version, attestations: .dist.attestations}'
# PyPI — exists + Trusted Publisher attestation (PEP 740, served by the Integrity API)
pip index versions <pkg> 2>/dev/null && \
  curl -s "https://pypi.org/integrity/<pkg>/<version>/<filename>/provenance"
# Maven Central — exists + GPG signature
curl -fI "https://repo1.maven.org/maven2/<g>/<a>/<v>/<a>-<v>.jar.asc"
# NuGet — exists + author/repo signature
dotnet nuget verify <pkg>.nupkg
# Go — exists + sumdb
GOPROXY=https://proxy.golang.org go list -m <module>@<version>
# Cargo — exists + not yanked
curl -s "https://crates.io/api/v1/crates/<name>/<v>" | jq '.version.yanked'
# Postgres extension — exists in target Postgres version
psql -c "SELECT * FROM pg_available_extensions WHERE name = '<ext>'"
```
~~~

new:
~~~text
### 1. Package existence + signature

Existence: use the wrapper's read-only recipes (`agents/ai-quality/hallucination-detector.md`, "Detection Methods", section 1) for npm, PyPI, crates.io and Maven Central. They query the registry and never install, import or run what they check, and they check a name's characters before it reaches a shell, because the name comes from the code under review. The wrapper has no recipe for NuGet, the Go module proxy or Postgres extensions, so names from those are recorded as not checked; the addresses under "2026 Best Practices" above are observed facts about those registries, not recipes to run.

Provenance and signatures, read-only:
- npm: the wrapper's npm recipe prints whether the latest version carries provenance (`dist.attestations`) and was published through trusted publishing (`_npmUser.trustedPublisher`), fields that https://registry.npmjs.org/sigstore/latest carried on 2026-09-30. It reads presence only; "You can verify the provenance attestations of downloaded packages with … `npm audit signatures`" (https://docs.npmjs.com/generating-provenance-statements, read 2026-09-30).
- PyPI: `GET https://pypi.org/integrity/<project>/<version>/<filename>/provenance` answers 404 when a file has no provenance (https://docs.pypi.org/api/integrity/, read 2026-09-30); https://pypi.org/integrity/sigstore/4.5.0/sigstore-4.5.0-py3-none-any.whl/provenance answered status 200 both with and without the header `Accept: application/vnd.pypi.integrity.v1+json` on 2026-09-30.
- Maven Central: every published file is signed, so check the key, not the file: `gpg --verify <jar>.asc <jar>` against the publisher's known key.
- NuGet: `dotnet nuget verify <pkg>.nupkg`, looking for an author signature.
- Postgres: an extension is checked only on a server you are allowed to query, never by installing it; `pg_available_extensions` answers for that server alone.
~~~

**Change 1f** ("Detection Methods", section 2)

old:
~~~text
### 2. AST / type-stub verification
```javascript
// JS/TS — inspect actual exports
const pkg = require('package-name');
console.log(Object.keys(pkg));
```

```python
# Python — inspect signatures from the installed version, not from training data
import inspect, importlib
mod = importlib.import_module('package_name')
print([n for n in dir(mod) if not n.startswith('_')])
print(inspect.signature(mod.some_function))
```
~~~

new:
~~~text
### 2. AST / type-stub verification

Read the installed copy as files; never `require`, `import` or `importlib.import_module` a package named in the code under review, because an unverified name may be an attacker's package. The wrapper's "Export Verification" section gives the order: for JavaScript and TypeScript, the installed `package.json`, its "exports"/"types" entry, every re-export, then a search for the member; for Python, the installed source or `.pyi` stub file; with no installed copy, the member stays unsettled and is never installed to settle it.
~~~

**Change 1g** (the gate for continuous integration; also carries the refuted and stale gate commands of finding 6, and removes the "letter" on line 301)

old:
~~~text
Recommended pre-merge gate (CI):

```bash
# 1. Resolve and audit
npm ci && npm audit --omit=dev
pip install -r requirements.txt && pip-audit
cargo audit
go list -m -u all && govulncheck ./...

# 2. Slopsquatting / known-hallucination corpus
#    (slopcheck-family tools scan the repo's manifests/config for hallucinated names;
#     check the specific tool's --help for its exact invocation and flags)
slopcheck .

# 3. Malicious-package detection (Socket as example)
socket ci                       # alias for 'socket scan create --report'; non-zero exit on unhealthy alerts

# 4. Signature / provenance
npm view <pkg> --json | jq '.dist.attestations'   # must be non-empty for critical deps
cosign verify-attestation --type slsaprovenance <artifact>

# 5. Health
scorecard --repo=github.com/<org>/<pkg> --format=json | jq '.score'   # < 5 = elevated risk
```

Any layer reporting **hallucinated, unsigned, or unscored** for a critical dependency = `severity: critical` letter to CTO Chief.
~~~

new:
~~~text
Recommended pre-merge gate for continuous integration. Check names before anything is installed: `npm ci` runs lifecycle scripts including `preinstall`, `install` and `postinstall` (https://docs.npmjs.com/cli/v11/using-npm/scripts, read 2026-09-30), installing with pip "involves running arbitrary code from distributions" (https://pip.pypa.io/en/stable/topics/secure-installs/, read 2026-09-30), and "`pip-audit -r INPUT` is functionally equivalent to `pip install -r INPUT`" (https://github.com/pypa/pip-audit, read 2026-09-30).

```bash
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
```

Sources, all read 2026-09-30: `--ignore-scripts` means "npm does not run scripts specified in package.json files" (https://docs.npmjs.com/cli/v11/commands/npm-ci); Socket's token "needs the `full-scans:create`, `full-scans:list`, and `security-policy:read` permissions" (https://docs.socket.dev/docs/socket-ci); for keyless verification "Either --certificate-identity or --certificate-identity-regexp must be set", and the same holds for the issuer (https://github.com/sigstore/cosign/blob/main/doc/cosign_verify-attestation.md); Scorecard's README says "you must authenticate your requests before running Scorecard" and names no JavaScript Object Notation field for the score and no risk threshold (https://github.com/ossf/scorecard). `go list -m -u all` lists the dependencies "along with the latest version available for each", so it is not an audit (https://go.dev/doc/modules/managing-dependencies). Report what a layer finds as a finding, with the severity the triage table below gives it.
~~~

**Change 1h** (adds a red line after line 395, which stays byte-identical because the wrapper quotes it)

old:
~~~text
- NEVER auto-install a hallucinated dependency to "see if it works" — that's exactly the slopsquatting attack path.
~~~

new:
~~~text
- NEVER auto-install a hallucinated dependency to "see if it works" — that's exactly the slopsquatting attack path.
- NEVER `require`, `import` or otherwise load a package named in the code under review to see what it exports; read its installed files instead.
~~~

### Finding 2 — high: the file describes two mechanisms that do not run

**What is wrong**
- **Loading on a phrase match.** Line 34 says the skill is "Auto-loaded when the user prompt matches a when_to_load trigger". `tests/skill-loading.test.js`, lines 9–13, records that nothing loads a specialist on a phrase match.
- **The refinement-loop letter.** Lines 378, 399 and 430 describe it in the present tense. `docs/REFINEMENT_LOOP.md` line 8 says "the loop is **NOT RUNNING** today".

The text is fenced as a design, and every pinned string survives.

**Decision:** `change`

**Change 2a**

old:
~~~text
> Converted from agents/ai-quality/hallucination-detector.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.
~~~

new:
~~~text
> This is the method that the wrapper agent `agents/ai-quality/hallucination-detector.md` reads by this file's path before it checks anything. Nothing loads this file on a phrase match: its `when_to_load` phrases are trigger vocabulary that only a test reads, and a specialist is reached by an agent reading its body by path (`tests/skill-loading.test.js`, lines 9–13). Where this file and the wrapper disagree, the wrapper wins, and its read-only registry recipes replace every existence check here.
~~~

**Change 2b**

old:
~~~text
These tiers are the **internal triage view** used when you produce a human-readable scan report.
~~~

new:
~~~text
**Not running.** The refinement loop that this section and the two after it describe is a design: `docs/REFINEMENT_LOOP.md` says "the loop is **NOT RUNNING** today". Nothing sends the letter described here. Findings go back in the dispatching agent's own format, with the severity that agent's table gives them; the triage table below is what that table follows. The rest of this section is the design as written.

These tiers are the **internal triage view** used when you produce a human-readable scan report.
~~~

**Change 2c**

old:
~~~text
When emitting a finding via the refinement loop, write the letter with these fields:
~~~

new:
~~~text
When the refinement loop runs — it does not today (see the note under "Severity") — a letter would carry these fields. The wrapper already uses two of them, `registry_checked` and `registry_response`, and the seven `kind` values as its finding types, so they must not be renamed:
~~~

**Change 2d**

old:
~~~text
When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../agent-fragments/warnings-are-critical.md):
~~~

new:
~~~text
This mode is a design: nothing invokes this skill as a critic today, because the loop is not running ([docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md): "the loop is **NOT RUNNING** today"). When the Iron Loop integrator does invoke it as a critic, apply the [warnings-are-critical rule](../../agent-fragments/warnings-are-critical.md):
~~~

### Finding 3 — high: names the file calls invented are registered, and stale names are misdescribed

**What is wrong.**
- **Called invented, but registered:** `email-validator-pro` (line 84), `serde_json_ext` (line 184), and `commons-security` under other groups (line 147).
- **Called parked or never existing, but still installable:** the `react-query` heading (line 86); the package's latest version is "3.39.3".
- **Wrong extension name:** pgvector's is `vector` (line 204).
- **Stale:** the `huggingface_hub[cli]` extra (line 311), and `react-codeshift`, which is now a placeholder (line 312).

**Decision:** `change`. Changes 3a–3d, plus change 1c for the Java line.

**Change 3a** (npm examples)

old:
~~~text
// HALLUCINATION — package doesn't exist on npm (slopsquatting target)
import { useSmartCache } from 'react-smart-cache';   // npm: not found
import { ValidatorPro } from 'email-validator-pro';  // npm: not found

// HALLUCINATION — package renamed; old name parked or never existed
import { useQuery } from 'react-query';              // moved to '@tanstack/react-query'
import { hashSync } from 'bcrypt';                   // works in Node, NOT in browser; AI confuses with 'bcryptjs'

// HALLUCINATION — wrong import path inside a real package
import { Switch } from 'react-router-dom';           // removed in v6; use Routes
import { z } from 'zod/schemas';                     // no such subpath — Zod's real subpaths are 'zod/v4', 'zod/v4-mini', 'zod/v3'

// VERIFICATION
//   npm view react-smart-cache version
//   → 'npm ERR! 404'  → category: hallucinated_import
//   npm view react-router-dom dist-tags
//   → look at .exports for the actual subpaths
~~~

new:
~~~text
// HALLUCINATION — package doesn't exist on npm (slopsquatting target)
import { useSmartCache } from 'react-smart-cache';   // npm: status 404 at https://registry.npmjs.org/react-smart-cache (read 2026-09-30)

// LOOKS INVENTED, IS REGISTERED — email-validator-pro has been on npm since 2017-05-18
// (https://registry.npmjs.org/email-validator-pro, read 2026-09-30); judge a name by its registry, never by its sound
import { ValidatorPro } from 'email-validator-pro';

// STALE, NOT HALLUCINATED — the old name still installs an older version (latest "3.39.3",
// https://registry.npmjs.org/react-query/latest, read 2026-09-30); new code uses '@tanstack/react-query'
import { useQuery } from 'react-query';
import { hashSync } from 'bcrypt';                   // works in Node, NOT in browser; AI confuses with 'bcryptjs'

// HALLUCINATION — wrong import path inside a real package
import { Switch } from 'react-router-dom';           // removed in v6; use Routes
import { z } from 'zod/schemas';                     // no such subpath: zod 4.6.5's "exports" include "./v4", "./v4-mini", "./v3" and "./mini", and no "./schemas" (https://registry.npmjs.org/zod/latest, read 2026-09-30)

// VERIFICATION (read-only; the wrapper's npm recipe is the full check)
//   npm view react-smart-cache version
//   → npm 11 reports a 404 as "npm error code E404" (seen from npm i in https://github.com/npm/cli/issues/8736, npm 11.6.2; npm view's own output not observed) → category: hallucinated_import
//   npm view react-router-dom exports --json
//   → the package's actual subpaths
~~~

**Change 3b** (Rust examples; the registration is cited, not the first-version date, which was not re-checked)

old:
~~~text
// HALLUCINATION — crate doesn't exist on crates.io
use tokio_advanced::runtime::SmartRuntime;       // crates.io: not found
use serde_json_ext::Value;                       // not found
~~~

new:
~~~text
// HALLUCINATION — crate doesn't exist on crates.io
use tokio_advanced::runtime::SmartRuntime;       // crates.io: status 404 at https://index.crates.io/to/ki/tokio_advanced (read 2026-09-30)

// LOOKS INVENTED, IS REGISTERED — serde_json_ext is on crates.io; its index entry lists version "0.1.0"
// (https://index.crates.io/se/rd/serde_json_ext, read 2026-09-30): a plausible name that got registered
use serde_json_ext::Value;
~~~

**Change 3c**

old:
~~~text
CREATE EXTENSION pgvector_pro;                   -- pgvector exists; 'pgvector_pro' does not
~~~

new:
~~~text
CREATE EXTENSION pgvector_pro;                   -- the pgvector project's extension is created with CREATE EXTENSION vector; (https://raw.githubusercontent.com/pgvector/pgvector/master/README.md, read 2026-09-30)
~~~

**Change 3d** (the "real tools" wording is carried unchanged)

old:
~~~text
| `huggingface-cli` (PyPI) | `huggingface_hub[cli]` (Lasso's slopsquatting demonstration) |
| `react-codeshift` | confused fork name; the real tools are `jscodeshift` + `react-codemod` |
~~~

new:
~~~text
| `huggingface-cli` (PyPI; Lasso's slopsquatting demonstration; answers 404 today, https://pypi.org/pypi/huggingface-cli/json, read 2026-09-30) | `huggingface_hub`: "The `huggingface_hub` Python package comes with a built-in CLI called `hf`." (https://huggingface.co/docs/huggingface_hub/guides/cli, read 2026-09-30); version 2.0.0 lists no `cli` extra (https://pypi.org/pypi/huggingface_hub/json, read 2026-09-30) |
| `react-codeshift` | now registered with the description "Placeholder to prevent dependency confusion." (the description begins with a symbol), created 2026-01-14 (https://registry.npmjs.org/react-codeshift, read 2026-09-30); the real tools are `jscodeshift` + `react-codemod` |
~~~

### Finding 4 — high: the headline statistics are unsourced or stale, and "existence is not enough" is missing

**What is wrong in line 44**
- **Unsourced:** "Dominant" and "within hours".
- **Stale:** "commercial frontier models". The three commercial models were earlier ChatGPT versions.
- **Imprecise:** the paper says "at least", not "roughly".

**What is missing.** The agent file's cross-file findings: the paper's warning about cross-referencing, the four confusion classes, and dependency confusion.

**Decision:** `change`

**Change 4**

old:
~~~text
- **Slopsquatting is the dominant supply-chain vector** for AI-generated code. The USENIX Security 2025 study by Spracklen et al. (*We Have a Package for You! A Comprehensive Analysis of Package Hallucinations by Code Generating LLMs*) analyzed 576,000 code samples across 16 LLMs and measured **roughly 5–22%** of recommended package imports as non-existent on the official registry (about 5% for commercial frontier models, about 22% for open-source models). Attackers register the most-hallucinated names on npm and PyPI within hours. Treat every AI-suggested package import as untrusted until the registry confirms it existed BEFORE the LLM's training cutoff.
~~~

new:
~~~text
- **Slopsquatting: registering the names models invent.** Spracklen and colleagues (*We Have a Package for You! A Comprehensive Analysis of Package Hallucinations by Code Generating LLMs*, USENIX Security 2025, https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen; preprint https://arxiv.org/abs/2406.10279; both read 2026-09-30) generated 576,000 code samples in Python and JavaScript with 16 models and report that "the average percentage of hallucinated packages is at least 5.2% for commercial models and 21.7% for open-source models" (page 3687), measured against the registries' package lists "as of 10 January, 2024" (page 3693); the commercial models were ChatGPT 4.0, ChatGPT 4.0 Turbo and ChatGPT 3.5 Turbo (Table 1, page 3692). A 2026 replication on "five frontier code-capable LLMs released between October 2025 and March 2026" measured "between 4.62% (Claude Haiku 4.5) and 6.10% (GPT-5.4-mini)" (Churilov, https://arxiv.org/abs/2605.17062, an independent preprint not shown as peer-reviewed, read 2026-09-30). The attack: "An adversary can exploit package hallucinations, especially if they are repeated, by publishing a package … with the same name as the hallucinated … package" (USENIX version, pages 3687–3688). Treat every package a model suggests as untrusted until its registry confirms it and, when the model's training cutoff is known, until the registry shows it was registered before that cutoff: Krishna and colleagues count a package as invented if it "was first registered after the model's knowledge cutoff date" (https://arxiv.org/html/2501.19012, read 2026-09-30).
- **Existence is not enough.** "Trivial cross-referencing methods (i.e., comparing a generated package name with a list of known packages) are ineffective for detecting a package hallucination attack, as an adversary may already have published the hallucinated package with malicious code." (USENIX version, page 3688). The same paper, citing earlier work, groups package confusion into "typosquatting, combosquatting, brandjacking, and similarity attacks" (page 3688), and names that look invented can be registered (see the examples below). A private-looking name that the public registry answers is dependency confusion: "Register a package name in a public registry that shadows a name used on the victim's internal registry" (https://slsa.dev/spec/v1.1/threats, read 2026-09-30).
~~~

### Finding 5 — high: the existence tests and signature checks are refuted, misattributed or cannot tell names apart; two statements contradicted the wrapper

**What is wrong**
- **`npm view` is not an existence test.** Placeholder names still answer with a version.
- **PyPI's two mechanisms are conflated.** Trusted Publishing and attestations are separate.
- **The NuGet and Maven signature checks cannot fail.** Every package on those registries carries a signature.
- **`cargo search` is textual.** It does not match an exact name.
- **The Postgres check draws the wrong conclusion.** `pg_available_extensions` answers only for the server queried.
- **Two statements contradicted the wrapper** (validator rows 73 and 74):
  - Only the npm and PyPI recipes tell placeholders apart.
  - NuGet and Go stay "not checked", in line with the wrapper's "No recipe here", so their addresses are given as observed facts, not as recipes.
- **Carried unchanged:** "Sigstore Rekor" is only partly checked, so it stays word for word and is marked not checked.

**Decision:** `change`

**Change 5a**

old:
~~~text
- **Verify-every-import** is the new baseline. Before any AI-generated code merges:
  - npm: `npm view <pkg>` returns a non-empty JSON object **and** the package was first published before the model's training cutoff.
  - PyPI: `pip index versions <pkg>` succeeds **and** the package has provenance via PyPI Trusted Publishers (PEP 740 attestations) when available.
  - Maven Central: artifact resolves **and** the JAR is GPG-signed by a known publisher.
  - NuGet: package resolves **and** is signed (author or repository signature).
  - Go modules: `go list -m <module>@<version>` succeeds against the module proxy **and** sum-db verifies.
  - Cargo: `cargo search <crate>` returns a match **and** the crate has not been yanked.
  - SQL extensions / Postgres contrib: extension exists in `pg_available_extensions` on a real Postgres install of the claimed version.
- **Cross-reference signatures** with the registry's authenticity layer. A package that exists is not the same as a package that should exist. Check **npm provenance** (Sigstore attestations linking package to source repo), **PyPI Trusted Publishers** (OIDC-issued attestations), **Maven GPG signatures** against the publisher's known key, **NuGet author/repository signatures**, **Go sumdb** (`GOSUMDB=sum.golang.org`), and **Sigstore Rekor** transparency log for any signed artifact. Mismatch or absent attestation = elevated risk even if the package "exists."
~~~

new:
~~~text
- **Verify every import against its registry, never by installing it.** The wrapper's read-only recipes for npm, PyPI, crates.io and Maven Central are in `agents/ai-quality/hallucination-detector.md`, "Detection Methods", section 1. All four report a name the registry does not have and an answer they could not read; the npm and PyPI recipes also tell a name the registry holds as a placeholder apart. `npm view <pkg>` returning a result is not proof of a usable package: npm holds some names as security placeholders that still answer with a version, such as `fs`, latest "0.0.1-security" (https://registry.npmjs.org/fs/latest, read 2026-09-30). The wrapper has no recipe for NuGet, the Go module proxy or Postgres extensions, so names from those are recorded as not checked. What is known about them:
  - NuGet: its own search command is `dotnet package search <id> --exact-match`, for the .NET 8.0.2xx software development kit and later, where `--exact-match` "narrows the search to only include packages whose IDs exactly match" (https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-package-search, read 2026-09-30); the version list at https://api.nuget.org/v3-flatcontainer/newtonsoftex.advancedjson/index.json answered status 404 for that missing id on 2026-09-30.
  - Go modules: the module proxy's version list at https://proxy.golang.org/github.com/uber-go/cachepro/@v/list answered status 404 for that missing module on 2026-09-30. A package path inside a module is not a module path: https://proxy.golang.org/github.com/aws/aws-sdk-go-v2/secrets/@v/list answered 404 on 2026-09-30, while `github.com/aws/aws-sdk-go-v2/service/secretsmanager` is a separate module with its own version list (https://proxy.golang.org/github.com/aws/aws-sdk-go-v2/service/secretsmanager/@v/list, read 2026-09-30).
  - Cargo: never `cargo search`, which "performs a textual search for crates" (https://doc.rust-lang.org/cargo/commands/cargo-search.html, read 2026-09-30) rather than an exact-name lookup; use the wrapper's crates.io recipe.
  - Postgres extensions: "The pg_available_extensions view lists the extensions that are available for installation." (https://www.postgresql.org/docs/current/view-pg-available-extensions.html, read 2026-09-30) — on the server you query, so an empty answer means "not installable here", not "exists nowhere".
- **Cross-reference signatures, and know which ones can tell names apart.** A package that exists is not the same as a package that should exist. Maven Central requires every published file to be signed ("One of the requirements for publishing your artifacts to the Central Repository, is that they have been signed with PGP.", https://central.sonatype.org/publish/requirements/gpg/, read 2026-09-30), so a `.asc` file proves nothing; check the signing key against the publisher's known key. On NuGet, look for an author signature, not only a signature. npm provenance comes from GitHub Actions or GitLab and is signed through Sigstore, and "You can verify the provenance attestations of downloaded packages with … `npm audit signatures`" (https://docs.npmjs.com/generating-provenance-statements, read 2026-09-30). On PyPI, attestations follow Python Enhancement Proposal 740 — "PyPI's implementation of digital attestations (PEP 740)" (https://docs.pypi.org/attestations/, read 2026-09-30) — and Trusted Publishing is a separate mechanism that uses OpenID Connect "to exchange short-lived identity tokens" for uploads (https://docs.pypi.org/trusted-publishers/, read 2026-09-30). Go's checksum database is "an auditable checksum database which will be used by the go command to authenticate modules" (https://proxy.golang.org, read 2026-09-30), and it "ensures that the `go` command always adds the same lines to everyone's `go.sum` file" (https://go.dev/blog/module-mirror-launch, read 2026-09-30): everyone receives the same code, which is not the same as safe code. The **Sigstore Rekor** transparency log for any signed artifact is named here but was not checked. A missing or mismatched attestation is a reason to look closer, never proof on its own.
~~~

**Change 5b** (the categories table)

old:
~~~text
| **Hallucinated import** | Registry does not have this package name at all | `npm view` / `pip index versions` / `cargo search` / `go list -m` / `nuget search` returns nothing |
~~~

new:
~~~text
| **Hallucinated import** | The registry of the code's own ecosystem has no such name when checked, or, when the model's training cutoff is known, the name was first registered after it | A status 404 from the wrapper's read-only recipes, or the registration date set against the cutoff; never a search that matches text rather than the exact name |
| **Registry placeholder** | The registry answers, but holds the name with no usable package behind it | npm: a latest version ending in `-security`, or a description reading "security holding package" (https://registry.npmjs.org/crossenv, read 2026-09-30); PyPI: a summary such as `sklearn`'s "deprecated sklearn package, use scikit-learn instead" (https://pypi.org/pypi/sklearn/json, read 2026-09-30) |
| **Suspected look-alike** | The name is registered, but may be one registered in advance under a name models invent | The wrapper's look-alike check: age, downloads, maintainers and repository link set beside the well-known package's |
~~~

### Finding 6 — medium: stale and refuted commands

**What is wrong.** Beyond those changes 1d, 1g and 3a already carry:
- the .NET vulnerability command was renamed;
- the attestation label is misattributed to Trusted Publishing;
- `cargo search`'s textual matching is not stated;
- the crates.io user-agent and request-rate rule is missing;
- the Rust hyphen rule is missing (cross-file from the agent file).

**Decision:** `change`

**Change 6a**

old:
~~~text
| Existence + audit | `npm audit`, `pip-audit`, `cargo audit`, `go list -m`, `dotnet list package --vulnerable`, `mvn dependency:resolve` | Does it resolve? Any known CVEs? |
~~~

new:
~~~text
| Existence + audit | the wrapper's read-only registry recipes for existence; for known vulnerabilities `npm audit`, `pip-audit`, `cargo audit`, `govulncheck`, and `dotnet package list --vulnerable` (the "noun first" form introduced in .NET 10; `dotnet list package --vulnerable` on .NET 9 and earlier, https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-package-list, read 2026-09-30) | Does it resolve? Any known vulnerabilities? |
~~~

**Change 6b**

old:
~~~text
**PyPI Trusted Publishers (PEP 740)**
~~~

new:
~~~text
**PyPI attestations (Python Enhancement Proposal 740)**
~~~

**Change 6c**

old:
~~~text
(empty result = hallucinated)
~~~

new:
~~~text
(a "textual search" returning up to 10 results by default — "default: 10, max: 100", https://doc.rust-lang.org/cargo/commands/cargo-search.html, read 2026-09-30 — so a hit is not an exact-name match; use the wrapper's crates.io recipe)
~~~

**Change 6d**

old:
~~~text
//     curl https://crates.io/api/v1/crates/<name>/<version> | jq .version.yanked
~~~

new:
~~~text
//     curl -A '<application> (<contact>)' https://crates.io/api/v1/crates/<name>/<version> | jq .version.yanked
//     (crates.io requires "a user-agent header that allows us to uniquely identify your application" and "a maximum of 1 request per second", https://rust-lang.github.io/rfcs/3463-crates-io-policy-update.html, read 2026-09-30)
//   The package name can differ from the name in a use path: hyphens are disallowed in crate names, and "when `Cargo.toml` doesn't specify a crate name, Cargo will transparently replace `-` with `_`" (https://doc.rust-lang.org/reference/items/extern-crates.html, read 2026-09-30); read the name from Cargo.toml
~~~

### Finding 7 — medium: the Output Format contradicts the wrapper and carries unchecked content

**What is wrong.**
- It holds illustrative counts that can be copied as data.
- It puts "Critical" in the confidence column.
- It makes an unchecked DepScope claim.
- It recommends `slopcheck`, whose invocation is unsourced.

The wrapper's format wins in any case, so the report only misleads.

**Decision:** `change`

**Change 7**

old:
~~~text
## Output Format

```markdown
## Hallucination Detection Report

### Summary
| Severity | Count | Required Action |
|----------|-------|-----------------|
| CRITICAL | 0     | IMMEDIATE       |
| HIGH     | 2     | Before Release  |
| MEDIUM   | 5     | Within Sprint   |
| LOW      | 12    | Backlog         |

### Verified Issues
| Type | File | Line | Issue | Registry checked | Confidence |
|------|------|------|-------|-------------------|------------|
| Hallucinated import | src/api.ts | 1 | 'react-smart-cache' not on npm | npm registry | High |
| Fictional function | src/utils.ts | 45 | moment.formatISO() (it's date-fns) | type stubs | High |
| Wrong import path | api/users.py | 3 | django.core.validators.validate_strong_password | django source | High |
| Hallucinated CVE | docs/sec.md | 12 | CVE-2025-99999 (not in NVD) | nvd.nist.gov | Critical |

### Detail per finding
**1. Hallucinated import** (High confidence — npm registry verified)
- File: `src/api.ts:1`
- Code: `import { useSmartCache } from 'react-smart-cache'`
- Verification: `npm view react-smart-cache` → 404
- Slopsquatting risk: name is plausible; an attacker could register it. Verified against DepScope dataset: not currently malicious, but a typosquat for `react-cache`.
- Fix: remove import OR replace with `@tanstack/react-query` if caching was the intent

### Verification Status
| Check | Count |
|---|---|
| Imports verified existing | 45 |
| Imports not found | 3 |
| Imports signed (provenance/GPG) | 38 |
| Methods verified against type stubs | 128 |
| Methods suspicious | 5 |
| CVE citations verified | 4 |
| CVE citations fabricated | 1 |

### Recommendations
1. Remove all three hallucinated imports; do NOT install them speculatively.
2. Re-verify any AI-generated section that cited CVE-2025-99999 — the citation is fabricated; the underlying claim may also be.
3. Add `slopcheck` and `socket ci` to PR gates.
4. Pin remaining deps with provenance attestations where available.
```
~~~

new:
~~~text
## Output Format

Return findings in the response format of the agent that dispatched you. For the wrapper that is the dispatch protocol's response (`docs/DISPATCH_PROTOCOL.md`), as `agents/ai-quality/hallucination-detector.md` defines it: its finding types, the registry fields `registry_checked` and `registry_response`, and its confidence rules. Every number in a report comes from checks you ran; never copy an example count.
~~~

### Finding 8 — medium: the confidence rule contradicts the wrapper

**What is wrong.** Line 58 says a finding from one technique is LOW. The wrapper rates a registry answer, or declaration files lacking the member, as HIGH on its own. The letter schema's line 404 sits inside the fenced design (change 2c) and is left as written.

**Decision:** `change`

**Change 8**

old:
~~~text
Single-technique findings get `confidence: low`; corroboration by a second technique escalates to `confidence: high`.
~~~

new:
~~~text
Confidence follows the wrapper's table: a registry answer read during the check, or installed declaration files that lack the member after every re-export is followed, is HIGH on its own; a pattern hit alone is LOW.
~~~

### Finding 9 — medium: one claim is overgeneralised and one cannot be sourced

**Decision:** `change`

**Change 9a**

old:
~~~text
Span-level verification (REFIND, SemEval 2025) and metamorphic testing of RAG (MetaRAG, 2025) are the current state-of-the-art for catching fabricated citations even inside RAG pipelines.
~~~

new:
~~~text
Two 2025 methods locate unsupported text at the level of a span: REFIND "detects hallucinated spans within LLM outputs by directly leveraging retrieved documents" (Lee and Yu, https://arxiv.org/abs/2502.13622, accepted to SemEval@ACL 2025) and MetaRAG "localizes unsupported claims at the factoid span where they occur" (Sok, Luz and Haddam, https://arxiv.org/abs/2509.09360); both read 2026-09-30. Neither abstract mentions citations, so neither is shown to check them.
~~~

**Change 9b**

old:
~~~text
- **Deterministic AST analysis** gives 100% precision on semantic errors when structurally grounded — e.g. "this method does not exist on this class" can be verified deterministically from the library's type stubs / declaration files.
~~~

new:
~~~text
- **Checking a call against the library's declaration files** settles whether a method exists on a class without running anything. One 2026 study (Khati and colleagues, https://arxiv.org/abs/2601.19106, accepted to FORGE 2026, read 2026-09-30) reported "100% precision and 87.6% recall (0.934 F1-score)" for detection based on the syntax tree, on "a manually-curated dataset of 200 Python snippets"; it is one small Python study, not a general guarantee.
~~~

### Finding 10 — medium: "C and C++ have no centralized package registry" is wrong as an absolute

**Decision:** `change` for the sentence; `carry-to-round-2` for the examples.

**Change 10**

old:
~~~text
### C / C++ — explicitly out of scope

C/C++ have no centralized package registry equivalent to npm/PyPI/Maven/NuGet/crates.io/goproxy. Dependencies are vendored via Conan, vcpkg, system packages (apt/dnf/brew), or git submodules — each with its own attestation model. The "verify against the registry" technique that anchors this skill does not have a single authoritative target in the C/C++ ecosystem. **Out of scope for this skill.** For C/C++ code review, use [[security/sast-scanner]] which handles the language directly and defers dependency verification to the build system. If the user has a specific Conan/vcpkg package to verify, use Bash to query the relevant central index manually.
~~~

new:
~~~text
### C / C++ — registry checks through Conan and vcpkg only

C and C++ have no single registry that every project uses, but two package managers keep a central catalogue that a name can be checked against. ConanCenter is "a central public repository where the community contributes packages for popular open-source libraries", with its recipes in https://github.com/conan-io/conan-center-index (https://docs.conan.io/2/introduction.html, read 2026-09-30). vcpkg "hosts a selection of libraries packaged into ports at https://github.com/Microsoft/vcpkg. This collection of ports is called the curated registry", each port in its own `ports/<name>` directory (https://learn.microsoft.com/en-us/vcpkg/concepts/registries, read 2026-09-30). System packages and vendored code have no registry to check. Spracklen and colleagues measured Python and JavaScript only, noting that "Java, C, or C++ do not rely on a centralized open-source repository" (https://www.usenix.org/system/files/usenixsecurity25-spracklen.pdf, page 3692, read 2026-09-30). This file has no checked example of an invented C or C++ name yet. Until it has one, check a Conan or vcpkg dependency's name against those catalogues, record system and vendored libraries under unknowns as not checked, and use [[security/sast-scanner]] for the language itself.
~~~

### Finding 11 — medium: the Go example's heading misdescribes the fix

**Decision:** `change`

**Change 11**

old:
~~~text
// HALLUCINATION — wrong import subpath inside real module
import "github.com/aws/aws-sdk-go-v2/secrets"    // it's '.../service/secretsmanager'
~~~

new:
~~~text
// HALLUCINATION — wrong import path; the real code is a separate module
import "github.com/aws/aws-sdk-go-v2/secrets"    // it's the separate module 'github.com/aws/aws-sdk-go-v2/service/secretsmanager' (https://proxy.golang.org/github.com/aws/aws-sdk-go-v2/service/secretsmanager/@v/list, read 2026-09-30)
~~~

### Finding 12 — low: three Postgres verification comments draw the wrong conclusion

**Decision:** `change`. Four small, non-overlapping edits. The session supplied the addresses.

**Change 12a**

old:
~~~text
(empty = hallucinated)
~~~

new:
~~~text
(empty = not installable on this server; the view "lists the extensions that are available for installation", https://www.postgresql.org/docs/current/view-pg-available-extensions.html, read 2026-09-30)
~~~

**Change 12b**

old:
~~~text
(lists actual functions)
~~~

new:
~~~text
(for installed extensions only: "all the objects belonging to each matching extension are listed", https://www.postgresql.org/docs/current/app-psql.html, read 2026-09-30)
~~~

**Change 12c**

old:
~~~text
SELECT amname FROM pg_am;
~~~

new:
~~~text
SELECT amname FROM pg_am WHERE amtype = 'i';
~~~

**Change 12d**

old:
~~~text
(valid access methods)
~~~

new:
~~~text
(index access methods; amtype is "t = table (including materialized views), i = index", https://www.postgresql.org/docs/current/catalog-pg-am.html, read 2026-09-30)
~~~

### Finding 13 — low: an unsourced frequency claim, and a lookup with no address

**Decision:** `change`

**Change 13**

old:
~~~text
When code or comments cite a CVE, benchmark number, paper, or version: verify via an authoritative source through retrieval (NVD, vendor docs, paper PDF). Fabricated citations are common in AI-generated security claims.
~~~

new:
~~~text
When code or comments cite a vulnerability identifier, a benchmark number, a paper or a version, verify it against an authoritative source: the National Vulnerability Database, vendor documentation, or the paper itself. For a vulnerability identifier, the Common Vulnerabilities and Exposures program's record service answered status 404 for an identifier with no record (https://cveawg.mitre.org/api/cve/CVE-2025-99999, read 2026-09-30).
~~~

### Finding 14 — low: the Django example lacks the real function; the huggingface example lacks today's status

**Decision:** `change`, carried by change 1a. The session confirmed both facts.

### Finding 15 — low: the `node-fetch` row is under "Hallucinated", though `node-fetch` is a real package, and it gives no version

**Decision:** `change`

**Change 15**

old:
~~~text
| `node-fetch` (Node ≥18) | built-in `fetch` |
~~~

new:
~~~text
| `node-fetch` on Node.js 21 or later (a real package, so stale rather than invented) | built-in `fetch`: Node.js's history table for `fetch` lists version v18.0.0 as "No longer behind `--experimental-fetch` CLI flag." and version v21.0.0 as "No longer experimental." (https://nodejs.org/api/globals.html, read 2026-09-30) |
~~~

### Finding 16 — low: red line 391 demands a signature check that proves nothing on two registries

**Decision:** `change`

**Change 16**

old:
~~~text
- NEVER merge code with unverified imports of "convenient" packages — every import must pass the existence + signature check.
~~~

new:
~~~text
- NEVER merge code with unverified imports of "convenient" packages — every import must pass the read-only existence check; a signature that every package on its registry carries does not count as a check.
~~~

### Finding 17 — low: two field terms are missing from the trigger vocabulary

**What is wrong.** "Package hallucination" (the Spracklen paper's title) and "library hallucination" (the Twist paper's title) are missing.
- **The test stays green.** The validator confirmed no corpus prompt contains either phrase, so the ≥90% match rate is unaffected.
- **Deliberately not added:** "package confusion", which would pull dependency-confusion requests toward this skill.

**Decision:** `change`. The list only grows.

**Change 17**

old:
~~~text
  - "verify imports"
~~~

new:
~~~text
  - "verify imports"
  - "package hallucination"
  - "library hallucination"
~~~

---

## Statements that still rest only on a page read through a summarising tool

These quotations and observations came back through a fetch tool's summarising model. None was read as raw bytes or as a page image.

**Registry and specification pages**
- npm: the `npm ci` `--ignore-scripts` sentence; the lifecycle-script list; the provenance page's sentence; issue 8736's E404 line; the `zod` exports list; `react-smart-cache` 404; `react-codeshift`'s description and creation date; `crossenv`'s wording.
- Python: pip's secure-installs sentence; pip-audit's sentence; the PyPI attestation and Trusted Publishing sentences; the PyPI integrity page's 404 rule; the Hugging Face guide sentence; `huggingface_hub` 2.0.0's extras.
- NuGet: the `dotnet package search` quotation and version note; the NuGet 404 for `newtonsoftex.advancedjson`.
- Go: the proxy's two 404s and the `secretsmanager` version list; proxy.golang.org's checksum sentence; the Go blog sentence; the `go list -m -u all` sentence.
- Maven Central: the signing requirement; the search guide's sentence; both `search.maven.org` results.
- Rust: `cargo search`'s two quotations; the crates.io policy quotations; the Rust Reference sentence; `tokio_advanced`'s 404.
- Node.js: the `fetch` history lines.
- C and C++: the Conan and vcpkg sentences.

**Tools in the gate**
- Socket's token sentence, cosign's flag sentence, and Scorecard's README sentence and its negative. The negative covers the README only.

**Research abstracts**
- REFIND, MetaRAG and Khati.

**Security and research sources**
- The SLSA sentence and Krishna's definition, both validated in the agent file's rounds.

**Read directly, not through a summary**
- **The USENIX paper:** pages 3687–3693, read as page images.
- **The session's raw curl fetches:**
  - huggingface-cli 404;
  - Common Vulnerabilities and Exposures 404;
  - `serde_json_ext`'s index listing version "0.1.0";
  - `react-query` "3.39.3";
  - the Go `…/secrets` 404;
  - pgvector's `CREATE EXTENSION vector;`;
  - Django's signature;
  - the three PostgreSQL sentences;
  - Churilov's abstract;
  - the presence of .NET's "noun first" note.
- **The agent file's session runs:** `fs`; the `sigstore` provenance fields; the PyPI integrity answers of status 200.

## Carried to round 2, by line in the current file

- **57** — the Veracode statistic: only a search snippet; the primary source answered 403.
- **88 and 309** — whether `bcrypt` fails in the browser: not checked.
- **128** — Stripe.net's `PaymentPro`: not checked.
- **131** — the Entity Framework Core namespace: partly checked.
- **151** — Jackson, and the open lead that `ObjectMapper.builder()` may be invented. Check `JsonMapper.builder()` and Jackson 3.
- **157** — `javap -p`: not checked.
- **165** — the Jaeger exporter "never had a 'pro'": not checked.
- **196** — the shape of `.version.yanked`: not checked.
- **203** — `pg_advanced_search` on PGXN: not checked.
- **271** — Socket, Snyk, Aikido and the GitHub Advisory Database: not checked.
- **272** — slopcheck and DepScope: search snippets only.
- **273** — the name "Rekor": partly checked.
- **274** — deps.dev and Dependency-Track: partly checked.
- **308** — the rename year 2022: not checked.
- **312** — "the real tools are `jscodeshift` + `react-codemod`": not checked.
- **421** — the current npm documentation version for the `reference:` value: versions 10 and 11 both say "Legacy".
- **Dropped from the new text because they were not checked:**
  - `GITHUB_AUTH_TOKEN` as Scorecard's variable name;
  - `serde_json_ext`'s first-version date.
- **Not observed:** what `npm view` itself prints for a missing name.
- **C and C++ examples:** none yet. Round 2 should:
  - probe `github.com/microsoft/vcpkg` `ports/<name>` for one real and one invented port;
  - probe ConanCenter's recipe path for one real and one invented name;
  - check one invented C or C++ function or header against its vendor documentation.
- **The National Vulnerability Database itself:** only the Common Vulnerabilities and Exposures program's service was probed.

## For the human

- **The trigger phrase "AI code review"** is shared with ai-code-quality-reviewer's vocabulary. Standing item.
- **Whether the skill keeps a recommended gate for continuous integration at all.** The wrapper never runs it, and some of the tools it names are unchecked. This is a scope decision.
- **Standing from the agent file:** private-registry credentials; a tool that verifies provenance; `tokens_used: null` versus the schema.

## Cross-file findings for the agent (`agents/ai-quality/hallucination-detector.md`)

1. **Item 2 of the wrapper's "Read the method first" becomes false once these changes land,** because the skill no longer states those tests. Exact late correction (the agent file is in this slice's `files:`):

   old:
   ~~~text
   2. The skill's existence tests — `npm view <pkg>` returning a non-empty result, `pip index versions <pkg>` succeeding — are replaced by this file's recipes. The first reports as existing a name npm holds as a placeholder (see "What a registry answer proves").
   ~~~

   new:
   ~~~text
   2. The skill's per-language verification lines are examples; this file's recipes are the existence checks. The skill records observed addresses for NuGet and the Go module proxy that this file has not turned into recipes, so names from those registries stay "not checked" (see "No recipe here").
   ~~~

2. **Item 1's list of forbidden commands** will no longer appear in the skill. It stays correct as a general order, so no change is needed.
3. **Turning the observed NuGet and Go addresses into wrapper recipes** would need recipe code and a session run. That is the coordinator's decision.
4. **"The examples across seven languages" is not true for C and C++** until round 2 adds examples.
5. **Everything the wrapper depends on is byte-identical:**
   - the triage table;
   - the seven `kind` values;
   - `registry_checked` and `registry_response`;
   - the five headings it quotes;
   - red line 395.

## Scores for the skill as it stands (before these changes), weighted as a review agent

| Dimension | Score |
|---|---|
| Specificity | 5 |
| Completeness | 5 |
| Boundaries | 5 |
| Actionability | 6 |
| Integration | 4 |
| Robustness | 2 |
| Calibration | 4 |
| Research grounding | 4 |
| **Overall** | **4.6** (REFINE) |

**Weakest dimension: robustness (2).** The method runs, installs or downloads the package it checks, against its own red line. Changes 1a–1h and 16 remove every such order.