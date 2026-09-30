# Round 1 critique and change list for `skills/ai-quality/hallucination-detector/SKILL.md`

**Dispatch:** `d-s4-skill-r1-critic`. This is one consolidated document.

**Verdict: REFINE. The skill scores 4.6 of 10 as it stands.** The weakest dimension is robustness, at 2.

**What is wrong, most serious first**
- **The method breaks its own red line.** Its verification lines and "Detection Methods" run, install or download the package being checked: `python -c "import …"`, `require()`, `importlib`, `dotnet add package`, `mvn dependency:resolve`, `go mod download`. Its recommended gate for continuous integration runs `npm ci` and `pip install` before any name is checked.
- **It describes two mechanisms as running that do not run:** loading on a phrase match, and the refinement-loop letter.
- **Three of its "invented" names are registered,** and several commands and statistics are refuted, stale or unsourced.

**What the changes do**
- **Recipes.** Every unsafe recipe becomes read-only. Where the wrapper already has a recipe that was validated and run, the skill points to it rather than copying it, so there is one source to maintain.
- **Mechanisms.** The refinement-loop text is fenced as a design, never deleted; every string `tests/critic-warnings-are-critical.test.js` pins survives.
- **Everything the wrapper depends on stays byte-identical:** the triage table, the seven `kind` values, `registry_checked` and `registry_response`, the headings the wrapper quotes, and red line 395.

**Before applying**
- **Fingerprint.** The executor confirms `sha256:e1472d75e7ebcbcf1f0a69340601ce698cc506b609392d454772ec7d6290f11`.
- **Where the `old` strings come from.** Every `old` below was copied from my read of the file during this dispatch. Each is unique, and no two overlap.
- **Aligned comments inside code blocks.** I counted their spaces from the read. If one does not match, re-anchor on the same lines rather than editing by hand.

## Where this round's evidence comes from

- **The skill's two round-1 research notes.** Research papers, and registry and vendor documentation. Two papers were read as PDFs.
- **Facts the agent file's three rounds already validated:**
  - registry answers, placeholder wording and provenance fields;
  - the Python and Rust naming rules;
  - the USENIX page numbers;
  - the European Union Agency for Cybersecurity's final package-manager advisory.
- **Repository reads, done myself:**
  - `tests/skill-loading.test.js`, lines 9–13 and 271–307;
  - `tests/critic-warnings-are-critical.test.js`, lines 59–89;
  - the three repository links the skill uses. All three exist: `skills/agent-fragments/warnings-are-critical.md`, `docs/REFINEMENT_LOOP.md` and `.ctoc/architecture/refinement-loop-schema.json`.

## Seven-language check

The required set is C#, Java, Python, C, C++, JavaScript and TypeScript, and SQL. The skill also covers Go and Rust.

| Language | Result after this round |
|---|---|
| JavaScript and TypeScript | Examples corrected |
| Python | Examples corrected |
| C# | Examples corrected |
| Java | Examples corrected |
| SQL (Postgres) | Examples corrected |
| Go and Rust | Examples corrected |
| C and C++ | **Still no examples.** The out-of-scope sentence is corrected (finding 10), but no invented C or C++ name has been checked in any note, and adding an unchecked one would break "code examples must be correct against vendor documentation". Carried to round 2 with an exact research request. |

---

## Findings, most severe first

### Finding 1 — critical — new: the method runs, installs or downloads the package it checks

**What is wrong.** The skill tells the reader to do what its own red line forbids ("NEVER auto-install a hallucinated dependency to "see if it works"", line 395):

| Lines | Command | What it does |
|---|---|---|
| 119–120 | `python -c "import …"` | Runs the package |
| 138 | `dotnet add package` | Adds the reference and then restores, which installs it |
| 154 | `mvn dependency:resolve` | "Requires a Maven project to be executed" |
| 175 | `go mod download` | Downloads the module |
| 246 | `require()` | Runs the package |
| 253 | `importlib.import_module` | Runs the package |
| 280–281 | The gate's `npm ci` and `pip install` | Run before any name is checked |

The research sources for the gate:
- npm's scripts page says `npm ci` runs "preinstall, install, postinstall".
- pip says installing "involves running arbitrary code from distributions".
- pip-audit says "`pip-audit -r INPUT` is functionally equivalent to `pip install -r INPUT`".

**Evidence.** Research note, Part B.2 and rows 46, 51, 60 and 85; research-gaps note, row 80.

**Decision:** `change`. Changes 1a–1h.

**Proposed change 1a** (Python verification lines; also carries finding 14)

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
#   read the signature of requests.get in the installed requests source, or in the library's API reference
~~~

**Proposed change 1b** (C# verification lines)

old:
~~~text
//   dotnet package search NewtonsoftEx.AdvancedJson          (empty result = not on NuGet)
//   dotnet add package NewtonsoftEx.AdvancedJson             (NU1101 if the id doesn't resolve)
//   Inspect dotnet reflection on the .dll for the method signature
//   Also verify NuGet package signature: dotnet nuget verify <pkg>.nupkg
~~~

new:
~~~text
//   dotnet package search NewtonsoftEx.AdvancedJson --exact-match   (empty result = not on NuGet; .NET 8.0.2xx SDK and later)
//   https://api.nuget.org/v3-flatcontainer/newtonsoftex.advancedjson/index.json   (answered status 404 on 2026-09-30)
//   Never use dotnet add package to test a name: it changes the project and restores the package
//   Read the method's signature in the library's API reference, never by loading the assembly
//   Signature: dotnet nuget verify <pkg>.nupkg — look for an author signature, not only a signature
~~~

**Proposed change 1c** (Java verification lines; also carries part of finding 3)

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
import org.apache.commons.security.PasswordValidator;   // no org.apache.commons:commons-security and no class of this name on Maven Central; an unrelated artifact called commons-security exists under three other groups
// pom.xml: <artifactId>spring-boot-starter-security-advanced</artifactId>   ← not found

// HALLUCINATION — wrong method on a real class
String json = ObjectMapper.builder().build().writeValueAsJson(obj);  // Jackson is writeValueAsString

// VERIFICATION (read-only; the wrapper's Maven Central recipe is the full check)
//   https://repo1.maven.org/maven2/org/apache/commons/commons-security/maven-metadata.xml   (answered status 404 on 2026-09-30)
//   Central's search interface accepts a fully qualified class name (fc:) and reports numFound (https://central.sonatype.org/search/rest-api-guide/, read 2026-09-30); for org.apache.commons.security.PasswordValidator it found 0 on 2026-09-30
//   Never run mvn dependency:resolve to test a name
//   Verify GPG: gpg --verify <jar>.asc <jar>   (against publisher's known key)
//   javap -p <Class>   → list declared methods
~~~

**Proposed change 1d** (Go verification lines)

old:
~~~text
//   go list -m github.com/uber-go/cachepro@latest        (will fail if missing)
//   go mod download github.com/uber-go/cachepro          (sumdb check)
~~~

new:
~~~text
//   go list -m github.com/uber-go/cachepro@latest        (will fail if missing)
//   https://proxy.golang.org/github.com/uber-go/cachepro/@v/list   (answered status 404 on 2026-09-30)
//   Never run go mod download to test a name: it downloads the module
~~~

**Proposed change 1e** ("Detection Methods", section 1)

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

Existence: use the wrapper's read-only recipes (`agents/ai-quality/hallucination-detector.md`, "Detection Methods", section 1) for npm, PyPI, crates.io and Maven Central, and the addresses under "2026 Best Practices" above for NuGet and Go. They query the registry and never install, import or run what they check, and they check a name's characters before it reaches a shell, because the name comes from the code under review.

Provenance and signatures, read-only:
- npm: the wrapper's npm recipe prints whether the latest version carries provenance (`dist.attestations`) and was published through trusted publishing (`_npmUser.trustedPublisher`), fields that https://registry.npmjs.org/sigstore/latest carried on 2026-09-30. It reads presence only; `npm audit signatures` is npm's verification command (https://docs.npmjs.com/verifying-registry-signatures, read 2026-09-30).
- PyPI: `GET https://pypi.org/integrity/<project>/<version>/<filename>/provenance` answers 404 when a file has no provenance (https://docs.pypi.org/api/integrity/, read 2026-09-30); https://pypi.org/integrity/sigstore/4.5.0/sigstore-4.5.0-py3-none-any.whl/provenance answered status 200 both with and without the header `Accept: application/vnd.pypi.integrity.v1+json` on 2026-09-30.
- Maven Central: every published file is signed, so check the key, not the file: `gpg --verify <jar>.asc <jar>` against the publisher's known key.
- NuGet: `dotnet nuget verify <pkg>.nupkg`, looking for an author signature.
- Postgres: an extension is checked only on a server you are allowed to query, never by installing it; `pg_available_extensions` answers for that server alone.
~~~

**Proposed change 1f** ("Detection Methods", section 2)

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

**Proposed change 1g** (the gate for continuous integration; also carries finding 6's refuted and stale commands, and removes the letter reference on line 301)

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
Recommended pre-merge gate for continuous integration. Check names before anything is installed: `npm ci` runs the packages' "preinstall, install, postinstall" scripts (https://docs.npmjs.com/cli/v11/using-npm/scripts, read 2026-09-30), installing with pip "involves running arbitrary code from distributions" (https://pip.pypa.io/en/stable/topics/secure-installs/, read 2026-09-30), and "`pip-audit -r INPUT` is functionally equivalent to `pip install -r INPUT`" (https://github.com/pypa/pip-audit, read 2026-09-30).

```bash
# 1. Names first, read-only: run the wrapper's registry recipes on every new dependency name
#    (agents/ai-quality/hallucination-detector.md, "Detection Methods", section 1)

# 2. Install without lifecycle scripts, then audit (only after step 1 passed)
npm ci --ignore-scripts && npm audit --omit=dev
pip-audit -r requirements.txt   # runs the same code an install would
cargo audit
govulncheck ./...
#    go list -m -u all lists available upgrades; it is not an audit

# 3. Malicious-package detection (Socket as example; the token needs
#    full-scans:create, full-scans:list and security-policy:read)
socket ci                       # alias for 'socket scan create --report'; non-zero exit on unhealthy alerts

# 4. Signature / provenance
npm audit signatures
cosign verify-attestation --type slsaprovenance --certificate-identity <id> --certificate-oidc-issuer <issuer> <image>

# 5. Health
GITHUB_AUTH_TOKEN=<token> scorecard --repo=github.com/<org>/<pkg> --format=json
```

Sources, all read 2026-09-30: `--ignore-scripts` means "npm does not run scripts specified in package.json files" (https://docs.npmjs.com/cli/v11/commands/npm-ci); Socket's token scopes (https://docs.socket.dev/docs/socket-ci); cosign's keyless verification needs "--certificate-identity" and "--certificate-oidc-issuer" or their regular-expression forms (https://github.com/sigstore/cosign/blob/main/doc/cosign_verify-attestation.md); Scorecard's command and flag (https://github.com/ossf/scorecard), whose documentation names no JSON score field and no risk threshold. Report what a layer finds as a finding, with the severity the triage table below gives it.
~~~

**Proposed change 1h** (a red line for loading, added after line 395, which stays byte-identical because the wrapper quotes it)

old:
~~~text
- NEVER auto-install a hallucinated dependency to "see if it works" — that's exactly the slopsquatting attack path.
~~~

new:
~~~text
- NEVER auto-install a hallucinated dependency to "see if it works" — that's exactly the slopsquatting attack path.
- NEVER `require`, `import` or otherwise load a package named in the code under review to see what it exports; read its installed files instead.
~~~

### Finding 2 — high — new: the file describes two mechanisms that do not run

**What is wrong**
- **Loading on a phrase match (line 34).** Line 34 says "Auto-loaded when the user prompt matches a when_to_load trigger." The repository's own test records the opposite: `when_to_load` phrases "are not a registration", "nothing loads a specialist on a phrase match", and "Specialists are reached by an agent reading the body by path" (`tests/skill-loading.test.js`, lines 9–13).
- **The refinement-loop letter.** Lines 378, 399, 430 and 301 describe it in the present tense. `docs/REFINEMENT_LOOP.md` line 8 says "the loop is **NOT RUNNING** today".
- **What must not change.** The test requires "Refinement Loop — critic mode", "warnings-are-critical", "refinement-loop-schema.json", "docs/REFINEMENT_LOOP.md" and "severity: critical". So the text is fenced as a design, and every pinned string, heading and field stays.

**Decision:** `change`. Changes 2a–2d. Change 1g already removes line 301's "letter".

**Proposed change 2a**

old:
~~~text
> Converted from agents/ai-quality/hallucination-detector.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.
~~~

new:
~~~text
> This is the method that the wrapper agent `agents/ai-quality/hallucination-detector.md` reads by this file's path before it checks anything. Nothing loads this file on a phrase match: its `when_to_load` phrases are trigger vocabulary that only a test reads, and a specialist is reached by an agent reading its body by path (`tests/skill-loading.test.js`, lines 9–13). Where this file and the wrapper disagree, the wrapper wins, and its read-only registry recipes replace every existence check here.
~~~

**Proposed change 2b** (fence at the start of the Severity section; the original sentence follows unchanged)

old:
~~~text
These tiers are the **internal triage view** used when you produce a human-readable scan report.
~~~

new:
~~~text
**Not running.** The refinement loop that this section and the two after it describe is a design: `docs/REFINEMENT_LOOP.md` says "the loop is **NOT RUNNING** today". Nothing sends the letter described here. Findings go back in the dispatching agent's own format, with the severity that agent's table gives them; the triage table below is what that table follows. The rest of this section is the design as written.

These tiers are the **internal triage view** used when you produce a human-readable scan report.
~~~

**Proposed change 2c**

old:
~~~text
When emitting a finding via the refinement loop, write the letter with these fields:
~~~

new:
~~~text
When the refinement loop runs — it does not today (see the note under "Severity") — a letter would carry these fields. The wrapper already uses two of them, `registry_checked` and `registry_response`, and the seven `kind` values as its finding types, so they must not be renamed:
~~~

**Proposed change 2d**

old:
~~~text
When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../agent-fragments/warnings-are-critical.md):
~~~

new:
~~~text
This mode is a design: nothing invokes this skill as a critic today, because the loop is not running ([docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md): "the loop is **NOT RUNNING** today"). When the Iron Loop integrator does invoke it as a critic, apply the [warnings-are-critical rule](../../agent-fragments/warnings-are-critical.md):
~~~

### Finding 3 — high — new, and cross-file from the agent file's round 1: names the file calls invented are registered, and names it calls stale are misdescribed

**What is wrong.**

| Line | The file says | What the registry shows |
|---|---|---|
| 84 | `email-validator-pro` "npm: not found" | Registered since 2017-05-18 |
| 184 | `serde_json_ext` "not found" | On crates.io since 2026-01-28 |
| 147 | "commons-security doesn't exist" | Three unrelated groups use the artifact name; there is no `org.apache.commons` one, and no class of that name |
| 86 | Heading: "old name parked or never existed" | `react-query` still installs "3.39.3" |
| 204 | "pgvector exists; pgvector_pro does not" | The extension is created with `CREATE EXTENSION vector;` |
| 311 | `huggingface_hub[cli]` | Version 2.0.0 has no `cli` extra; the command is `hf` |
| 312 | `react-codeshift` "confused fork name" | Now "A placeholder package intended to prevent dependency confusion attacks", created 2026-01-14 |

**Evidence.** Research note rows 27, 29, 48, 63, 70, 93 and 94; agent round-1 record (`email-validator-pro`).

**Decision:** `change`. Changes 3a–3d, plus change 1c for the Java line.

**Proposed change 3a** (the npm examples; also carries finding 6's stale and refuted npm commands)

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
//   → npm 11.6.2 prints "npm error code E404" (https://github.com/npm/cli/issues/8736, read 2026-09-30) → category: hallucinated_import
//   npm view react-router-dom exports --json
//   → the package's actual subpaths
~~~

**Proposed change 3b** (the Rust examples)

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

// LOOKS INVENTED, IS REGISTERED — serde_json_ext has been on crates.io since 2026-01-28, first version 0.1.0
// (https://index.crates.io/se/rd/serde_json_ext, read 2026-09-30): a plausible name that got registered
use serde_json_ext::Value;
~~~

**Proposed change 3c** (the pgvector example)

old:
~~~text
CREATE EXTENSION pgvector_pro;                   -- pgvector exists; 'pgvector_pro' does not
~~~

new:
~~~text
CREATE EXTENSION pgvector_pro;                   -- the pgvector project's extension is created with CREATE EXTENSION vector; (https://github.com/pgvector/pgvector, read 2026-09-30)
~~~

**Proposed change 3d** (two table rows; the "real tools" wording on row 312 is carried unchanged)

old:
~~~text
| `huggingface-cli` (PyPI) | `huggingface_hub[cli]` (Lasso's slopsquatting demonstration) |
| `react-codeshift` | confused fork name; the real tools are `jscodeshift` + `react-codemod` |
~~~

new:
~~~text
| `huggingface-cli` (PyPI; Lasso's slopsquatting demonstration; answers 404 today) | `huggingface_hub`, whose command is `hf`: "The CLI command is `hf`" (https://huggingface.co/docs/huggingface_hub/guides/cli, read 2026-09-30); version 2.0.0 lists no `cli` extra (https://pypi.org/pypi/huggingface_hub/json, read 2026-09-30) |
| `react-codeshift` | now registered as "A placeholder package intended to prevent dependency confusion attacks", created 2026-01-14 (https://registry.npmjs.org/react-codeshift, read 2026-09-30); the real tools are `jscodeshift` + `react-codemod` |
~~~

### Finding 4 — high — new, and cross-file from the agent file: the headline statistics are unsourced or stale, and the section omits why existence is not enough

**What is wrong in line 44**
- **"Dominant supply-chain vector"** has no source (research row 5).
- **"Attackers register the most-hallucinated names … within hours"** is not in the paper, which chose "not to pursue" publishing packages (row 6).
- **"Commercial frontier models"** is stale. They were "ChatGPT 4.0, 4.0 Turbo, 3.5 Turbo". A 2026 replication measured 4.62–6.10% on five current models (row 4).
- **"Roughly 5–22%"** should read "at least". The paper measured against the registries' lists of 10 January 2024 (row 3).

**What the section omits.** The agent file's cross-file findings:
- the paper's warning that cross-referencing against a list of known names fails;
- the four confusion classes;
- dependency confusion answering status 200.

**Decision:** `change`

**Proposed change 4**

old:
~~~text
- **Slopsquatting is the dominant supply-chain vector** for AI-generated code. The USENIX Security 2025 study by Spracklen et al. (*We Have a Package for You! A Comprehensive Analysis of Package Hallucinations by Code Generating LLMs*) analyzed 576,000 code samples across 16 LLMs and measured **roughly 5–22%** of recommended package imports as non-existent on the official registry (about 5% for commercial frontier models, about 22% for open-source models). Attackers register the most-hallucinated names on npm and PyPI within hours. Treat every AI-suggested package import as untrusted until the registry confirms it existed BEFORE the LLM's training cutoff.
~~~

new:
~~~text
- **Slopsquatting: registering the names models invent.** Spracklen and colleagues (*We Have a Package for You! A Comprehensive Analysis of Package Hallucinations by Code Generating LLMs*, USENIX Security 2025, https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen; preprint https://arxiv.org/abs/2406.10279; both read 2026-09-30) generated 576,000 code samples in Python and JavaScript with 16 models and found invented packages at "at least 5.2% for commercial models and 21.7% for open-source models", measured against the registries' package lists of 10 January 2024; the commercial models were "ChatGPT 4.0, 4.0 Turbo, 3.5 Turbo". A 2026 replication on five current models measured "between 4.62% (Claude Haiku 4.5) and 6.10% (GPT-5.4-mini)" (Churilov, https://arxiv.org/abs/2605.17062, an independent preprint not shown as peer-reviewed, read 2026-09-30). The attack: "An adversary can exploit package hallucinations, especially if they are repeated, by publishing a package … with the same name as the hallucinated … package" (USENIX version, pages 3687–3688). Treat every package a model suggests as untrusted until its registry confirms it and, when the model's training cutoff is known, until the registry shows it was registered before that cutoff: Krishna and colleagues count a package as invented if it "was first registered after the model's knowledge cutoff date" (https://arxiv.org/html/2501.19012, read 2026-09-30).
- **Existence is not enough.** "Trivial cross-referencing methods (i.e., comparing a generated package name with a list of known packages) are ineffective for detecting a package hallucination attack, as an adversary may already have published the hallucinated package with malicious code." (USENIX version, page 3688). The same paper, citing earlier work, groups package confusion into "typosquatting, combosquatting, brandjacking, and similarity attacks" (page 3688), and names that look invented can be registered (see the examples below). A private-looking name that the public registry answers is dependency confusion: "Register a package name in a public registry that shadows a name used on the victim's internal registry" (https://slsa.dev/spec/v1.1/threats, read 2026-09-30).
~~~

### Finding 5 — high — new, and cross-file from the agent file: the existence tests and signature checks are refuted, misattributed or cannot tell names apart

**What is wrong in lines 45–53**
- **`npm view` is refuted as an existence test.** npm holds some names as placeholders that still answer with a version.
- **PyPI's two mechanisms are conflated.** "Trusted Publishers (PEP 740 attestations)" and "OIDC-issued attestations" mix Trusted Publishing with attestations; they are separate mechanisms (rows 9 and 16).
- **The NuGet check cannot fail.** nuget.org repository-signs every package (row 11).
- **The Maven check cannot fail.** Maven Central requires a signature on every file (rows 10 and 79).
- **`cargo search` does not find an exact name.** It is a "textual search" (row 13).
- **The Postgres check draws the wrong conclusion.** `pg_available_extensions` reports only what the queried server can install (row 73).
- **The categories table uses the same tests.** Its row for "Hallucinated import" also lacks the training-cutoff clause and the placeholder and look-alike categories the wrapper reports.

**Decision:** `change`. Changes 5a and 5b.

**Carried unchanged.** The phrase naming **Sigstore Rekor** is only partly checked, so it stays word for word and is marked not checked.

**One address the validation dispatch must supply.** The `.NET 8.0.2xx SDK and later` statement comes from Microsoft's `dotnet package search` reference, whose exact address is not in either note.

**Proposed change 5a**

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
- **Verify every import against its registry, never by installing it.** The read-only recipes for npm, PyPI, crates.io and Maven Central are in `agents/ai-quality/hallucination-detector.md`, "Detection Methods", section 1; each tells a registered name from a name the registry holds as a placeholder, a name it does not have, and an answer it could not read. `npm view <pkg>` returning a result is not proof of a usable package: npm holds some names as security placeholders that still answer with a version, such as `fs`, latest "0.0.1-security" (https://registry.npmjs.org/fs/latest, read 2026-09-30). For the other registries:
  - NuGet: `dotnet package search <id> --exact-match` (.NET 8.0.2xx SDK and later), or the package's version list, which answered status 404 for a missing id at https://api.nuget.org/v3-flatcontainer/newtonsoftex.advancedjson/index.json on 2026-09-30.
  - Go modules: the module proxy's version list, which answered status 404 for a missing module at https://proxy.golang.org/github.com/uber-go/cachepro/@v/list on 2026-09-30. Query a module path, not a package path inside a module: `github.com/aws/aws-sdk-go-v2/secrets` answered 404 there, while `github.com/aws/aws-sdk-go-v2/service/secretsmanager` is a separate module with its own version list (https://proxy.golang.org/github.com/aws/aws-sdk-go-v2/service/secretsmanager/@v/list, read 2026-09-30).
  - Cargo: never `cargo search`, which matches text rather than the exact name; use the wrapper's crates.io recipe.
  - Postgres extensions: `pg_available_extensions` reports only what the server you query can install, so an empty answer means "not installable here", not "exists nowhere".
- **Cross-reference signatures, and know which ones can tell names apart.** A package that exists is not the same as a package that should exist. Maven Central requires every published file to be signed ("One of the requirements for publishing … is that they have been signed with PGP", https://central.sonatype.org/publish/requirements/gpg/, read 2026-09-30), so a `.asc` file proves nothing; check the signing key against the publisher's known key. On NuGet, look for an author signature, not only a signature. npm provenance is generated from GitHub Actions or GitLab through Sigstore, and `npm audit signatures` verifies it (https://docs.npmjs.com/generating-provenance-statements and https://docs.npmjs.com/verifying-registry-signatures, read 2026-09-30). On PyPI, attestations are "PyPI's implementation of digital attestations (PEP 740)" (https://docs.pypi.org/attestations/, read 2026-09-30); Trusted Publishing is a separate mechanism that uses OpenID Connect "to exchange short-lived identity tokens" for uploads (https://docs.pypi.org/trusted-publishers/, read 2026-09-30). Go's checksum database is "an auditable checksum database … used by the go command to authenticate modules" (https://proxy.golang.org, read 2026-09-30); it makes everyone receive the same code, not safe code (https://go.dev/blog/module-mirror-launch, read 2026-09-30). The **Sigstore Rekor** transparency log for any signed artifact is named here but was not checked. A missing or mismatched attestation is a reason to look closer, never proof on its own.
~~~

**Proposed change 5b** (the categories table)

old:
~~~text
| **Hallucinated import** | Registry does not have this package name at all | `npm view` / `pip index versions` / `cargo search` / `go list -m` / `nuget search` returns nothing |
~~~

new:
~~~text
| **Hallucinated import** | The registry of the code's own ecosystem has no such name when checked, or, when the model's training cutoff is known, the name was first registered after it | A status 404 from the wrapper's read-only recipes, or the registration date set against the cutoff; never a search that matches text rather than the exact name |
| **Registry placeholder** | The registry answers, but holds the name with no usable package behind it | npm: a latest version ending in `-security`, or a description reading "security holding package" (https://registry.npmjs.org/crossenv, read 2026-09-30) |
| **Suspected look-alike** | The name is registered, but may be one registered in advance under a name models invent | The wrapper's look-alike check: age, downloads, maintainers and repository link set beside the well-known package's |
~~~

### Finding 6 — medium — new: stale and refuted commands

**What is wrong**
- **npm messages and fields:**
  - `npm ERR! 404` is stale: npm 11.6.2 prints "npm error code E404".
  - `npm view … dist-tags` then `.exports` is refuted; the fix is `npm view … exports --json`.
- **.NET:** `dotnet list package --vulnerable` was renamed in .NET 10 (research-gaps row 80).
- **Tools in the gate:**
  - `cosign verify-attestation` without identity flags cannot run (research-gaps row 83).
  - Scorecard's `jq '.score'` field and its "< 5" threshold are both unsourced (rows 89 and 90).
  - `slopcheck .` is unsourced (row 87).
- **Go and Rust verification lines:**
  - `go mod download … (sumdb check)` is refuted as described (row 60).
  - `cargo search` "performs a textual search" with a default limit of 10 (row 66).
  - The crates.io yanked check needs an identifying user-agent (RFC 3463).
- **The PyPI row in the tools table** repeats the attestation misattribution from finding 5.

**Decision:** `change`. Carried by changes 1d, 1g and 3a, and by changes 6a–6d.

**One address the validation dispatch must supply.** The `cargo search` statements come from the Cargo book's `cargo-search` page, whose exact address is not in either note.

**Proposed change 6a**

old:
~~~text
| Existence + audit | `npm audit`, `pip-audit`, `cargo audit`, `go list -m`, `dotnet list package --vulnerable`, `mvn dependency:resolve` | Does it resolve? Any known CVEs? |
~~~

new:
~~~text
| Existence + audit | the wrapper's read-only registry recipes for existence; for known vulnerabilities `npm audit`, `pip-audit`, `cargo audit`, `govulncheck`, and `dotnet package list --vulnerable` (.NET 10 and later; `dotnet list package --vulnerable` on .NET 9 and earlier, https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-list-package, read 2026-09-30) | Does it resolve? Any known vulnerabilities? |
~~~

**Proposed change 6b**

old:
~~~text
**PyPI Trusted Publishers (PEP 740)**
~~~

new:
~~~text
**PyPI attestations (PEP 740)**
~~~

**Proposed change 6c**

old:
~~~text
(empty result = hallucinated)
~~~

new:
~~~text
(a "textual search" returning up to 10 results by default, so a hit is not an exact-name match; use the wrapper's crates.io recipe)
~~~

**Proposed change 6d** (the Rust hyphen rule, cross-file from the agent file's round 2, and the user-agent requirement)

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

### Finding 7 — medium — new: the Output Format contradicts the wrapper and carries unchecked content

**What is wrong.**
- The markdown report conflicts with the dispatch-protocol response the wrapper returns.
- It holds illustrative counts that can be copied as data.
- It puts "Critical" in a column for confidence.
- It makes an unchecked claim: "Verified against DepScope dataset: not currently malicious, but a typosquat for `react-cache`" (research row 100).
- It recommends `slopcheck`, whose invocation is unsourced (row 87).

The wrapper wins where the two disagree, so the report only misleads.

**Decision:** `change`

**Proposed change 7**

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

### Finding 8 — medium — new: the confidence rule contradicts the wrapper

**What is wrong.** Line 58 says a single technique gives confidence LOW. The wrapper's confidence table rates a registry answer read during the check, or declaration files lacking the member, as HIGH on its own. Paired files must state the same rules.

**Decision:** `change`. The letter schema's line 404 carries the same old rule, but it now sits inside the fenced design (change 2c) and is left as written.

**Proposed change 8**

old:
~~~text
Single-technique findings get `confidence: low`; corroboration by a second technique escalates to `confidence: high`.
~~~

new:
~~~text
Confidence follows the wrapper's table: a registry answer read during the check, or installed declaration files that lack the member after every re-export is followed, is HIGH on its own; a pattern hit alone is LOW.
~~~

### Finding 9 — medium — new: one claim is overgeneralised and one cannot be sourced

**What is wrong**
- **Line 59:** "gives 100% precision on semantic errors" generalises one study of "200 Python snippets" (research-gaps row 23).
- **Line 56:** "the current state-of-the-art for catching fabricated citations" has no source. Neither paper's abstract mentions citations (research-gaps rows 19 and 20).

**Decision:** `change`. Changes 9a and 9b.

**Proposed change 9a**

old:
~~~text
Span-level verification (REFIND, SemEval 2025) and metamorphic testing of RAG (MetaRAG, 2025) are the current state-of-the-art for catching fabricated citations even inside RAG pipelines.
~~~

new:
~~~text
Two 2025 methods locate unsupported text at the level of a span: REFIND "detects hallucinated spans within LLM outputs by directly leveraging retrieved documents" (Lee and Yu, https://arxiv.org/abs/2502.13622, accepted to SemEval@ACL 2025) and MetaRAG "localizes unsupported claims at the factoid span where they occur" (Sok, Luz and Haddam, https://arxiv.org/abs/2509.09360); both read 2026-09-30. Neither abstract mentions citations, so neither is shown to check them.
~~~

**Proposed change 9b**

old:
~~~text
- **Deterministic AST analysis** gives 100% precision on semantic errors when structurally grounded — e.g. "this method does not exist on this class" can be verified deterministically from the library's type stubs / declaration files.
~~~

new:
~~~text
- **Checking a call against the library's declaration files** settles whether a method exists on a class without running anything. One 2026 study (Khati and colleagues, https://arxiv.org/abs/2601.19106, accepted to FORGE 2026, read 2026-09-30) reported "100% precision and 87.6% recall (0.934 F1-score)" for detection based on the syntax tree, on "a manually-curated dataset of 200 Python snippets"; it is one small Python study, not a general guarantee.
~~~

### Finding 10 — medium — new: "C and C++ have no centralized package registry" is wrong as an absolute

**What is wrong.**
- ConanCenter is "a central public repository".
- vcpkg's "collection of ports is called the curated registry".
- The line's own last sentence already tells the reader to "query the relevant central index manually".

**The decision.** The skill checks Conan and vcpkg names against those catalogues. It records system and vendored libraries as not checked. C and C++ *examples* are carried to round 2, because no note has checked an invented C or C++ name.

**Evidence.** Research-gaps note, "C and C++, line 220"; research note row 76.

**Decision:** `change` for the sentence; `carry-to-round-2` for the examples.

**Proposed change 10**

old:
~~~text
### C / C++ — explicitly out of scope

C/C++ have no centralized package registry equivalent to npm/PyPI/Maven/NuGet/crates.io/goproxy. Dependencies are vendored via Conan, vcpkg, system packages (apt/dnf/brew), or git submodules — each with its own attestation model. The "verify against the registry" technique that anchors this skill does not have a single authoritative target in the C/C++ ecosystem. **Out of scope for this skill.** For C/C++ code review, use [[security/sast-scanner]] which handles the language directly and defers dependency verification to the build system. If the user has a specific Conan/vcpkg package to verify, use Bash to query the relevant central index manually.
~~~

new:
~~~text
### C / C++ — registry checks through Conan and vcpkg only

C and C++ have no single registry that every project uses, but two package managers keep a central catalogue that a name can be checked against. ConanCenter is "a central public repository where the community contributes packages for popular open-source libraries", with its recipes in https://github.com/conan-io/conan-center-index (https://docs.conan.io/2/introduction.html, read 2026-09-30). vcpkg "hosts a selection of libraries packaged into ports at https://github.com/Microsoft/vcpkg. This collection of ports is called the curated registry", each port in its own `ports/<name>` directory (https://learn.microsoft.com/en-us/vcpkg/concepts/registries, read 2026-09-30). System packages and vendored code have no registry to check. Spracklen and colleagues measured Python and JavaScript only, noting that "Java, C, or C++ do not rely on a centralized open-source repository" (https://usenix.org/system/files/usenixsecurity25-spracklen.pdf, read 2026-09-30). This file has no checked example of an invented C or C++ name yet. Until it has one, check a Conan or vcpkg dependency's name against those catalogues, record system and vendored libraries under unknowns as not checked, and use [[security/sast-scanner]] for the language itself.
~~~

### Finding 11 — medium — new: the Go example's heading misdescribes the fix

**What is wrong.** Line 167 calls `…/secrets` a "wrong import subpath inside real module". The real code is a *separate module*: `…/service/secretsmanager` answered with 391 versions at its own proxy address (research-gaps row 57).

**Decision:** `change`

**Proposed change 11**

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

### Finding 12 — low — new: three Postgres verification comments draw the wrong conclusion

**What is wrong.**
- "Empty = hallucinated" is refuted: the view reports only what the server can install (row 73).
- `\dx+` needs the extension installed first (row 74).
- `pg_am` also lists table access methods (`amtype` "t"), not only index access methods (row 75).

**Decision:** `change`. Four small, non-overlapping edits on lines 213–215.

**One address the validation dispatch must supply.** The research gives the PostgreSQL pages without their exact addresses, so these comments carry no new quotation.

**Proposed change 12a**

old:
~~~text
(empty = hallucinated)
~~~

new:
~~~text
(empty = not installable on this server; check the extension's own distribution before calling it invented)
~~~

**Proposed change 12b**

old:
~~~text
(lists actual functions)
~~~

new:
~~~text
(lists the objects of an installed extension; it must be installed first)
~~~

**Proposed change 12c**

old:
~~~text
SELECT amname FROM pg_am;
~~~

new:
~~~text
SELECT amname FROM pg_am WHERE amtype = 'i';
~~~

**Proposed change 12d**

old:
~~~text
(valid access methods)
~~~

new:
~~~text
(index access methods; table access methods have amtype 't')
~~~

### Finding 13 — low — new: an unsourced frequency claim, and a lookup with no address

**What is wrong.**
- Line 262 says "Fabricated citations are common in AI-generated security claims" with no source.
- The CVE.org lookup has an observed address: it answered status 404 for an identifier with no record (research-gaps row 25; the part about NVD is carried).

**Decision:** `change`

**Proposed change 13**

old:
~~~text
When code or comments cite a CVE, benchmark number, paper, or version: verify via an authoritative source through retrieval (NVD, vendor docs, paper PDF). Fabricated citations are common in AI-generated security claims.
~~~

new:
~~~text
When code or comments cite a vulnerability identifier, a benchmark number, a paper or a version, verify it against an authoritative source: the National Vulnerability Database, vendor documentation, or the paper itself. For a vulnerability identifier, the CVE Program's record service answered status 404 for an identifier with no record (https://cveawg.mitre.org/api/cve/CVE-2025-99999, read 2026-09-30).
~~~

### Finding 14 — low — new: the Django example lacks the real function, and the huggingface example lacks today's status

**What is wrong.**
- The Django password check is `validate_password(password, user=None, password_validators=None)` (research-gaps row 38).
- `huggingface-cli` answers 404 on PyPI today (research row 35).

**Decision:** `change`, carried by change 1a.

### Finding 15 — low — new: the `node-fetch` row sits under "Hallucinated" although `node-fetch` is a real package

**What is wrong.** The row gives no version, and `node-fetch` is a real package, so the "Hallucinated" heading is wrong for it. Node.js's history table lists v18.0.0 as "No longer behind `--experimental-fetch` CLI flag." and v21.0.0 as "No longer experimental." (research-gaps row 92). The wrapper already uses this wording.

**Decision:** `change`

**Proposed change 15**

old:
~~~text
| `node-fetch` (Node ≥18) | built-in `fetch` |
~~~

new:
~~~text
| `node-fetch` on Node.js 21 or later (a real package, so stale rather than invented) | built-in `fetch`: Node.js's history table for `fetch` lists version v18.0.0 as "No longer behind `--experimental-fetch` CLI flag." and version v21.0.0 as "No longer experimental." (https://nodejs.org/api/globals.html, read 2026-09-30) |
~~~

### Finding 16 — low — new: red line 391 demands a signature check that proves nothing on two registries

**What is wrong.** Every nuget.org and Maven Central package carries a signature (finding 5), so "the existence + signature check" counts a check that cannot fail.

**Decision:** `change`

**Proposed change 16**

old:
~~~text
- NEVER merge code with unverified imports of "convenient" packages — every import must pass the existence + signature check.
~~~

new:
~~~text
- NEVER merge code with unverified imports of "convenient" packages — every import must pass the read-only existence check; a signature that every package on its registry carries does not count as a check.
~~~

### Finding 17 — low — new: two field terms are missing from the trigger vocabulary

**What is wrong.** "Package hallucination" (Spracklen's title) and "library hallucination" (Twist's title) are the field's own terms. Neither contains an existing trigger as a substring, so neither currently matches.

**Check against the test.** I searched the trigger-corpus prompts in `tests/skill-loading.test.js`: none contains either phrase, so the ≥90% match rate is unaffected.

**Deliberately not added.** "Package confusion" would pull dependency-confusion requests toward this skill. That boundary with dependency-auditor is already with the human.

**Decision:** `change`. The list only grows.

**Proposed change 17**

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

## Carried to round 2, by line in the current file

- **57** — the Veracode statistic: only a search snippet; the primary source answered 403.
- **88 and 309** — whether `bcrypt` fails in the browser: not checked.
- **128** — whether Stripe.net has a `PaymentPro` namespace: not checked.
- **131** — `EntityFrameworkCore.AsyncQueries`: partly checked; only the `FromSqlRaw` namespace was read.
- **151** — Jackson: partly checked, with an open lead that `ObjectMapper.builder()` may itself be invented. Check the `JsonMapper.builder()` page and Jackson 3.
- **157** — `javap -p`: not checked.
- **165** — Go's Jaeger exporter "never had a 'pro'": not checked.
- **196, the yanked check** — the answer's shape (`.version.yanked`) was not checked.
- **203** — `pg_advanced_search` on PGXN: not checked.
- **271** — whether Socket, Snyk, Aikido and the GitHub Advisory Database detect malicious packages: not checked.
- **272** — slopcheck and the DepScope dataset: search snippets only.
- **273** — the name "Rekor": partly checked.
- **274** — deps.dev and Dependency-Track: partly checked.
- **308** — the rename year 2022: not checked.
- **312** — "the real tools are `jscodeshift` + `react-codemod`": not checked.
- **421** — the npm documentation version for the `reference:` value: versions 10 and 11 both label themselves "Legacy", and the current one was not identified.
- **C and C++ examples** — none yet. The research round 2 should do:
  - probe `https://github.com/microsoft/vcpkg/tree/master/ports/<name>` (or the raw `vcpkg.json` path) for one real and one invented port;
  - probe the ConanCenter recipe path for one real and one invented name;
  - check one invented C or C++ function or header against its vendor documentation.
- **NVD itself** (lines 71 and 262) — only CVE.org was probed.
- **Addresses for the validation dispatch to supply before changes are applied:**
  - Microsoft's `dotnet package search` page (changes 1b and 5a);
  - the Cargo book's `cargo-search` page (change 6c);
  - the PostgreSQL pages behind finding 12;
  - the `search.maven.org` query that found `commons-security` under three groups (change 1c).

## For the human

- **The trigger phrase "AI code review" is in this skill too,** and also in ai-code-quality-reviewer's vocabulary. The same standing item as for the agent file.
- **New: whether the skill should keep a recommended gate for continuous integration at all.** The wrapper never runs it, and it names third-party tools the research could not fully check. Keeping it, trimming it to the checked commands, or moving it elsewhere is a scope decision.
- **Standing from the agent file:** private-registry credentials; a tool to verify provenance; `tokens_used: null` versus the schema.

## Cross-file findings for the agent (`agents/ai-quality/hallucination-detector.md`)

1. **Item 2 of the wrapper's "Read the method first" becomes false after this round.** It describes skill text that no longer exists. Proposed late correction (the agent file is in this slice's `files:`):

   old:
   ~~~text
   2. The skill's existence tests — `npm view <pkg>` returning a non-empty result, `pip index versions <pkg>` succeeding — are replaced by this file's recipes. The first reports as existing a name npm holds as a placeholder (see "What a registry answer proves").
   ~~~

   new:
   ~~~text
   2. The skill's per-language verification lines are examples; this file's recipes are the existence checks. The skill gives read-only addresses for NuGet and the Go module proxy that this file has not yet turned into recipes, so names from those registries stay "not checked" (see "No recipe here").
   ~~~

2. **Item 1's list of forbidden commands** (`python -c "import …"`, `dotnet add package`, `mvn dependency:resolve`, `go mod download`, and so on) will no longer appear in the skill. The rule stays correct as a general order, so no change is required.
3. **Adding NuGet and Go recipes to the wrapper.** The skill now gives observed read-only addresses for both: the NuGet version list and the Go proxy version list, each seen answering 404. Turning them into wrapper recipes needs recipe code and a session run. That is a decision for the coordinator, not a change made here.
4. **The wrapper says the skill holds "the examples across seven languages".** That is not true for C and C++ until round 2 adds examples.
5. **Everything the wrapper depends on is unchanged:**
   - the triage table;
   - the seven `kind` values;
   - `registry_checked` and `registry_response`;
   - the headings "Severity (internal triage vs. refinement-loop output)", "Letter schema (refinement-loop output contract)", "Refinement Loop — critic mode (v6.9.8)", "Tool Integration (2026)" and "Red Lines";
   - line 395, which the wrapper quotes.

## Scores for the skill as it stands, weighted as a review agent

| Dimension | Score | Why |
|---|---|---|
| Specificity | 5 | Concrete commands, but many are wrong or stale, and the statistics are vague ("roughly"). |
| Completeness | 5 | Seven languages, but no C or C++. No placeholder, look-alike or dependency-confusion classes. |
| Boundaries | 5 | Related skills are listed, but nothing is handed on, and it overlaps the wrapper's output. |
| Actionability | 6 | The report template carries fix lines, but some rest on unchecked claims. |
| Integration | 4 | Its output conflicts with the wrapper and the protocol; it claims to load automatically; the letter is presented as live. |
| Robustness | 2 | Its recipes run, install or download the package being checked, against its own red line, and the gate installs before checking names. |
| Calibration | 4 | Its confidence rule contradicts the wrapper; the "< 5" threshold and "100% precision" are unsourced. |
| Research grounding | 4 | Three registered names called invented; "dominant" and "within hours" unsourced; misattributions and stale commands. |
| **Overall** | **4.6** | Weights: specificity 1.75, completeness 1.5, boundaries 1, actionability 1.25, integration 1, robustness 0.75, calibration 1.25, research grounding 1. Verdict: REFINE. |

**Weakest dimension: robustness (2).** Findings 1 and 16 remove every order that runs, installs or downloads a package being checked, and make the gate check names before anything is installed.