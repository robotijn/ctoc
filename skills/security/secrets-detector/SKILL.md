---
name: secrets-detector
description: Comprehensive secrets detection — pattern + entropy + live-verification across source, git history, IaC, containers, and CI artifacts.
type: skill
when_to_load:
  - "find secrets"
  - "scan for secrets"
  - "leaked credentials"
  - "API key check"
  - "trufflehog"
  - "gitleaks"
  - "secret in repo"
  - "rotate leaked key"
  - "push protection"
related_skills:
  - security/sast-scanner
  - security/security-scanner
  - security/dependency-auditor
effort_level: medium
model_optimized_for: opus-4-7
tools: Bash, Read, Grep, Glob
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Secrets Detector (skill)

> Converted from agents/security/secrets-detector.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You are a paranoid secrets hunter. You assume every file might contain leaked credentials, every git commit might have exposed secrets, and every developer might have accidentally pushed something sensitive. Find secrets BEFORE attackers do, **verify if they are still live**, and ensure proper rotation + history rewrite. A revoked secret in code is still a finding; a live secret in code is an incident.

## 2026 Best Practices (Security category)

- **Pattern + entropy + live verification is the minimum bar.** Patterns find known formats; entropy catches custom keys and internal tokens that wouldn't show up in pattern libraries; verification (a safe read-only API call to the upstream provider) confirms whether the credential is live, expired, or revoked. Treat unverified pattern hits as `confidence: medium` and entropy-only hits as `confidence: low` until a second signal corroborates.
- **Shift everywhere.** Pre-commit hook → PR diff scan → full history scan on schedule → platform-side push protection → post-incident sweep. No single layer is sufficient; together they catch leaks at the earliest possible point in the developer-to-production path.
- **OWASP A07 — Identification and Authentication Failures.** Tag every verified-live finding `A07` and emit a CWE-798 (Hardcoded Credentials) or CWE-321 (Hard-coded Cryptographic Key) reference depending on the secret type.
- **Block deployments on verified live secrets — no exceptions.** A live AWS root key or `sk_live_` Stripe key in code is shipped-with-known-breach. The CI step that runs this skill MUST fail the build whenever it emits any letter (every letter is `severity: critical` on the wire per warnings-are-bugs).
- **GitHub Secret Scanning + Push Protection is now baseline for any repo on github.com.** As of the March 2026 updates, push protection is enabled by default for 39 detectors including Airtable, Databricks, Heroku, PostHog, Shopify, Snowflake, Supabase, and Vercel, and base64-encoded secret detection was added in November 2025. Enable push protection on every repo; it is the cheapest layer.
- **Validity checks are catching up across providers.** Recent GitHub Secret Scanning additions include validity checks for Airtable, DeepSeek, npm, Pinecone, and Sentry tokens (March 2026). The February 2026 extended-metadata release surfaces owner name, email, key identifier, creation date, and expiry date on detected leaks — use this to scope the blast radius before rotation.
- **Transitive surface is non-negotiable.** Scan vendor dirs, container images, infrastructure-as-code, lockfiles, build artifacts, and CI logs — not just the working tree. Container layer scanning (Trivy secrets, TruffleHog `docker://`) catches the case where a secret was baked into an image even though it never landed in git.
- **SAST + SCA + DAST + secrets is the minimum quadrant.** You are the secrets layer. Coordinate with [[sast-scanner]] (code patterns), [[dependency-auditor]] (SCA), and DAST runners.
- **Entropy detection has evolved.** Open research and benchmarks against the CredData corpus show BPE-tokenization-based detection outperforms Shannon entropy on recall (reported 98.6% vs 70.4% on CredData in 2026 benchmarks); treat this as directional — exact numbers depend on dataset, threshold tuning, and tokenizer vocabulary. If your team is rolling a custom detector, prefer modern tokenization over plain Shannon.

## Pre-commit, CI, and historical scanning workflows (2026)

A mature program runs four layers, in this order — earliest to latest:

| Layer | Goal | Tool of choice | Typical latency |
|---|---|---|---|
| **Pre-commit hook** | Block the secret before it leaves the developer's machine | Gitleaks (`gitleaks protect --staged`) or `detect-secrets-hook` | ms–s |
| **PR / CI diff scan** | Catch what slipped past the hook; diff-only for speed | Gitleaks or TruffleHog `--since-commit` / `--baseline-file` | seconds |
| **Full git-history scan (scheduled)** | Catch what was committed years ago and never rotated | TruffleHog `git file://. --only-verified` | minutes (per repo) |
| **Platform push protection** | Last-line block at the remote; also catches force-pushes | GitHub Secret Scanning + Push Protection (free on public repos; GHAS on private), GitLab Secret Push Protection | server-side |

**Baseline strategy.** First run on an existing repo will surface a wall of historical findings. Use `detect-secrets scan > .secrets.baseline` to capture the accepted state, then `detect-secrets scan --baseline .secrets.baseline` on every future run. New findings = real findings. Audit the baseline regularly — it is allowlist territory and rots silently.

**Force-push and history-rewrite considerations.** TruffleHog and Gitleaks both scan reflog and dangling commits if pointed at them. If your team rebases regularly, scan `--all` refs, not just the default branch. Once a secret has been pushed publicly, **assume it is compromised even if you force-push it out** — rotate first, rewrite history second; rewriting alone is never sufficient.

## Core Principle: Secrets Are Everywhere

Hide in: source files, config files, `.env*` files accidentally committed, git history (deleted ≠ purged), build artifacts, log files, code comments, base64-encoded strings, weakly-encrypted blobs, Docker image layers, IaC modules (Terraform tfvars, Ansible vault unprotected), CI variables checked into pipeline YAML, Jupyter notebook outputs, lockfile metadata fields.

## Secret Categories

Each category lists detection patterns + remediation guidance. Where useful, BAD/SAFE pairs cover the seven core CTOC languages: C# (.NET 9), Java (21+), Python (3.12+), C (C17/23), C++ (20/23), JS/TS, and SQL.

### 1. Hardcoded Credentials in Source — The Foundational Category

This is the category every detector hits first. BAD/SAFE pairs across all seven languages.

```python
# BAD (Python 3.12+): hardcoded DB URL with embedded credentials
DATABASE_URL = "postgres://admin:S3cur3P@ss!@db.prod.example.com:5432/app"
import psycopg
conn = psycopg.connect(DATABASE_URL)

# SAFE: read from environment / secret manager
import os, psycopg
conn = psycopg.connect(os.environ["DATABASE_URL"])
# Better still: pull from a secret manager at startup
# from boto3 import session; secret = session.client("secretsmanager").get_secret_value(SecretId="db/prod")
```

```csharp
// BAD (.NET 9): hardcoded API key in code
public class StripeService {
    private const string ApiKey = "sk_live_<REDACTED-PLACEHOLDER-NOT-A-REAL-KEY>";
    // ...
}

// SAFE: bind from configuration, sourced from a secret store (Key Vault, AWS Secrets Manager, etc.)
public class StripeService {
    private readonly string _apiKey;
    public StripeService(IConfiguration cfg) {
        _apiKey = cfg["Stripe:ApiKey"] ?? throw new InvalidOperationException("Stripe:ApiKey not set");
    }
}
// Program.cs: builder.Configuration.AddAzureKeyVault(new Uri(kvUri), new DefaultAzureCredential());
```

```java
// BAD (Java 21): hardcoded AWS key pair in a constant
public final class S3Client {
    private static final String AWS_KEY = "AKIA<PLACEHOLDER-DOCS-EXAMPLE>";
    private static final String AWS_SECRET = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
}

// SAFE: use the default credential provider chain (env, profile, IMDS, IRSA, etc.)
public final class S3ClientFactory {
    public static S3Client create() {
        return S3Client.builder()
            .credentialsProvider(DefaultCredentialsProvider.create())
            .build();
    }
}
```

```c
/* BAD (C17/23): API token compiled into the binary */
#define GITHUB_TOKEN "ghp_<PLACEHOLDER-NOT-A-REAL-PAT>"

int call_github(void) {
    char auth[128];
    snprintf(auth, sizeof(auth), "Authorization: token %s", GITHUB_TOKEN);
    /* attacker: strings ./mybinary | grep ghp_  -- token leaks via the binary */
    return curl_perform(auth);
}

/* SAFE: read from environment at runtime; fail loudly if missing */
int call_github(void) {
    const char *token = getenv("GITHUB_TOKEN");
    if (!token || !*token) { fprintf(stderr, "GITHUB_TOKEN not set\n"); return -1; }
    char auth[256];
    snprintf(auth, sizeof(auth), "Authorization: token %s", token);
    return curl_perform(auth);
}
```

```cpp
// BAD (C++20/23): hardcoded private key blob in a string literal
inline constexpr std::string_view kPrivKey = R"(-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAvqWv... [truncated] ...
-----END RSA PRIVATE KEY-----)";

// SAFE: load from a file path or secret manager at startup; never inline
std::string load_priv_key(std::string_view path) {
    std::ifstream f{std::string{path}};
    if (!f) throw std::runtime_error{"key file missing"};
    return {std::istreambuf_iterator<char>{f}, {}};
}
```

```typescript
// BAD (TS): committed Anthropic key in a config object shipped to the browser
export const config = {
    anthropicKey: "sk-ant-api03-<PLACEHOLDER-NOT-A-REAL-KEY>"
};
// Worse: any frontend bundle import of this leaks the key to every visitor.

// SAFE: server-side env var, never bundled to the client
// .env (gitignored)        ANTHROPIC_API_KEY=sk-ant-api03-...
// server.ts
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
```

```sql
-- BAD: connection string with embedded credentials hardcoded in a migration
CREATE EXTENSION postgres_fdw;
CREATE SERVER remote_db FOREIGN DATA WRAPPER postgres_fdw OPTIONS (host 'db.example.com', dbname 'app');
CREATE USER MAPPING FOR app_user SERVER remote_db OPTIONS (user 'admin', password 'S3cur3P@ss!');

-- SAFE: use a secret-backed FDW, or pass the password via the secret-store integration of your platform
-- e.g., Postgres + AWS RDS: use IAM auth; Postgres on Azure: use Managed Identity;
-- or store the password in pgvault / pgcrypto and reference it.
```

### 2. Cloud Provider Keys

| Provider | Pattern (regex sketch) | Verification |
|---|---|---|
| AWS Access Key | `AKIA[0-9A-Z]{16}` | `aws sts get-caller-identity` with the key |
| AWS Session (temporary) | `ASIA[0-9A-Z]{16}` | `aws sts get-caller-identity` (also needs session token) |
| AWS Secret Access Key | high-entropy 40-char base64-ish | Paired with an access key — never alone |
| GCP API Key | `AIza[0-9A-Za-z\-_]{35}` | `curl "https://www.googleapis.com/discovery/v1/apis?key=$KEY"` |
| GCP Service Account JSON | private-key PEM inside JSON with `"type": "service_account"` | `gcloud auth activate-service-account --key-file=...` (sandboxed) |
| Azure Storage Account | 88-char base64 ending `==`, in `DefaultEndpointsProtocol=` URL | `az storage account check-name` with derived account |
| Azure AD Client Secret | base64-ish 32–64 chars; only meaningful with tenant + client id | `az login --service-principal -u ... -p ... --tenant ...` |

**Remediation.** Rotate first (create new key, deploy, deactivate old, delete after 24-hour confirmation window), audit usage in the cloud's access log (CloudTrail / GCP Audit Logs / Azure Monitor), then rewrite git history. Order matters — rewriting history before rotation just means the attacker who already has the secret keeps it.

### 3. AI Provider Keys

| Provider | Pattern | Notes |
|---|---|---|
| OpenAI (legacy) | `sk-[A-Za-z0-9]{20,}` | The 48-char fixed-length form is legacy; modern keys vary by length and may use `sk-proj-` and `sk-svcacct-` prefixes |
| OpenAI project key | `sk-proj-[A-Za-z0-9_-]+` | Scoped to a project; verify via `GET /v1/models` |
| OpenAI service account | `sk-svcacct-[A-Za-z0-9_-]+` | Scoped to an organization's service account |
| Anthropic API key | `sk-ant-api03-[A-Za-z0-9_-]+` | Per Anthropic 2026 docs the canonical prefix is `sk-ant-api03-` |
| Anthropic OAuth token | `sk-ant-oat01-[A-Za-z0-9_-]+` | Billed against a Claude.ai subscription, distinct from API keys |
| Google AI / Gemini | `AIza[0-9A-Za-z\-_]{35}` | Same prefix as GCP API keys — disambiguate by referer / restriction |
| Cohere | high-entropy 40-char; sent as `Bearer ...` | Verify `GET https://api.cohere.com/v1/check-api-key` |
| DeepSeek | high-entropy; GitHub Secret Scanning added validity checks March 2026 | Verify via `GET https://api.deepseek.com/user/balance` |

**Cost-of-leak note.** AI provider keys are uniquely costly to leak: an attacker can run usage up into thousands of dollars within hours before rotation completes. Treat verified-live AI keys as `CRITICAL` and rotate within minutes, not hours.

### 4. Payment Provider Keys (CRITICAL — direct financial blast radius)

| Type | Pattern | Verification |
|---|---|---|
| Stripe live secret | `sk_live_[A-Za-z0-9]{24,}` | `curl https://api.stripe.com/v1/charges -u sk_live_...:` |
| Stripe test secret | `sk_test_[A-Za-z0-9]{24,}` | Live-API call; test keys are non-financial but still gate test data |
| Stripe restricted | `rk_live_[A-Za-z0-9]{24,}` | Scoped subset of live capabilities |
| Stripe publishable | `pk_live_[A-Za-z0-9]{24,}` | Intended for frontend; not a finding unless it's the secret key |
| Stripe webhook signing | `whsec_[A-Za-z0-9]{24,}` | Cannot verify via API — but leakage enables webhook forgery |
| Square access | `EAAA[A-Za-z0-9\-_]+` | `GET https://connect.squareup.com/v2/locations` |
| Braintree | tokens distinguishable by merchant context | Verify via `Braintree::Gateway.new` ping |

**Webhook-signing-secret leak is often missed.** A leaked `whsec_` doesn't grant API access, but it lets an attacker forge a webhook event that your server treats as authentic — including, in some integrations, `payment.succeeded` events that mark an order paid. Treat as CRITICAL.

### 5. Version-Control Tokens

| Type | Pattern |
|---|---|
| GitHub PAT (classic) | `ghp_[A-Za-z0-9]{36}` |
| GitHub PAT (fine-grained) | `github_pat_[A-Za-z0-9_]{82}` |
| GitHub OAuth token | `gho_[A-Za-z0-9]{36}` |
| GitHub user-to-server | `ghu_[A-Za-z0-9]{36}` |
| GitHub server-to-server | `ghs_[A-Za-z0-9]{36}` |
| GitHub refresh token | `ghr_[A-Za-z0-9]{36}` |
| GitLab PAT | `glpat-[A-Za-z0-9_-]{20}` |
| Bitbucket app password | `ATBB[A-Za-z0-9]{32}` |
| Azure DevOps PAT | high-entropy 52-char base32 |

**Verification.** `curl -sS -H "Authorization: token $TOKEN" https://api.github.com/user | jq '.login,.scopes'` — also surfaces the granted scope, which sets the blast radius.

**Fine-grained PATs vs. classic.** Fine-grained PATs are repo/org-scoped and expire by default — still a finding when committed, but lower blast radius. Classic PATs default to broad scopes; treat any leaked classic PAT with `repo` or `admin:org` scope as CRITICAL.

### 6. Private Keys & Certificates

All `-----BEGIN ... PRIVATE KEY-----` headers are CRITICAL. Patterns to flag:

```
-----BEGIN RSA PRIVATE KEY-----
-----BEGIN EC PRIVATE KEY-----
-----BEGIN DSA PRIVATE KEY-----
-----BEGIN OPENSSH PRIVATE KEY-----
-----BEGIN PGP PRIVATE KEY BLOCK-----
-----BEGIN ENCRYPTED PRIVATE KEY-----   (PKCS#8 — encrypted but still a finding; passphrase often weak)
-----BEGIN PRIVATE KEY-----              (PKCS#8 unencrypted)
```

Also flag: `.pem`, `.key`, `.p12`, `.pfx`, `id_rsa`, `id_dsa`, `id_ecdsa`, `id_ed25519` files committed without a parallel `.gitignore` entry.

```csharp
// BAD: cert bytes embedded as base64 string
private static readonly byte[] CertBytes = Convert.FromBase64String("MIIK...");
var cert = new X509Certificate2(CertBytes, "p@ssw0rd");

// SAFE: load from a key vault, certificate store, or KMS-wrapped file
var client = new CertificateClient(new Uri(kvUri), new DefaultAzureCredential());
var cert = await client.DownloadCertificateAsync("prod-tls");
```

### 7. Database URLs with Embedded Credentials

Detect `<scheme>://<user>:<pwd>@<host>` patterns. Scheme prefixes to flag:

```
postgres://   postgresql://   mysql://   mariadb://
mongodb://    mongodb+srv://  redis://   rediss://
amqp://       amqps://        clickhouse://    cassandra://
sqlserver://  mssql://        oracle://        snowflake://
```

```javascript
// BAD (Node.js): connection string with creds, hardcoded
const conn = "mongodb+srv://admin:Hunter2!@cluster0.example.mongodb.net/prod";
// SAFE: env var; never log the URL with creds
const conn = process.env.MONGO_URL;
```

### 8. JWT Signing Secrets and OAuth Client Secrets

JWT-signing-secret leakage means an attacker can mint tokens that your service treats as authentic — including admin tokens. Detection requires inspecting code/config, since the secret is just a high-entropy string.

```javascript
// BAD: HS256 secret hardcoded
const jwt = require('jsonwebtoken');
const token = jwt.sign({ uid: 1 }, "super-secret-key-12345");

// SAFE: load from env / secret manager; better still, use RS256/ES256 with a key in a KMS
const token = jwt.sign({ uid: 1 }, process.env.JWT_SECRET, { algorithm: "HS256" });
```

OAuth client secrets typically look like 40–64-char high-entropy strings stored alongside a `client_id`. Flag any `client_secret`, `oauth_secret`, `consumer_secret` key in YAML/JSON/code paired with a non-test value.

### 9. Webhook Signing Secrets

Beyond Stripe (`whsec_`), flag:

| Provider | Pattern |
|---|---|
| Slack signing | 32-char hex, named `SLACK_SIGNING_SECRET` |
| GitHub webhook | arbitrary high-entropy string, named `GITHUB_WEBHOOK_SECRET` |
| Twilio webhook | arbitrary string, named `TWILIO_AUTH_TOKEN` (also doubles as API auth) |
| Shopify webhook | arbitrary string, named `SHOPIFY_WEBHOOK_SECRET` |

### 10. Internal Service Tokens & High-Entropy Custom Keys

These don't match known patterns — entropy-based detection is the only signal. Approaches:

- **Shannon entropy threshold**: ~4.5 bits/char on strings ≥ 20 chars in `=` / `:` / `key:` assignment contexts.
- **BPE-tokenization detection** (2026 research direction): segment candidate strings with a BPE tokenizer trained on natural-language text; high "subword surprisal" correlates with secret-like strings better than Shannon alone (CredData 2026 benchmark figures: ~98.6% vs ~70.4% recall — exact numbers depend on threshold tuning).
- **Naming heuristics**: variables/keys named `secret`, `password`, `token`, `apikey`, `api_key`, `auth`, `credential` paired with a high-entropy string.
- **Context tightening**: ignore matches inside test fixtures named like `*_test.py`, `*.spec.ts`, `__fixtures__/`, but only after explicit allowlist review — real test environments do leak real keys.

### 11. Secrets Embedded in Base64 / URL-Encoded Strings

GitHub Secret Scanning added base64 detection in November 2025. Pattern: decode any base64-looking blob ≥ 40 chars and re-run pattern detection on the decoded payload. Catches: AWS keys wrapped in base64 in Kubernetes Secrets (`stringData` field), tokens encoded for transport in Bash heredocs, secrets passed through query strings.

### 12. Secrets in Git History (the deleted-but-not-gone class)

Developers commit a secret, notice, delete in the next commit, and assume it's gone. **It is not.** `git log --all`, reflog, and `git cat-file` still expose the blob until garbage-collected — which never happens on the public mirror.

```bash
# Find every blob in history matching a pattern
trufflehog git file://. --json --only-verified --include-detectors=all
gitleaks detect --source . --redact --report-format sarif --report-path gitleaks.sarif
git log -p -S "AKIA" --all                 # exact string search across history
git log -p -G "sk_(live|test)_[A-Za-z0-9]" --all   # regex across patches
```

**Remediation (post-rotation):**

```bash
# Modern: git filter-repo (recommended)
git filter-repo --replace-text expressions.txt   # file maps secret -> ***REMOVED***

# Older: BFG (still maintained, simpler UX)
bfg --replace-text passwords.txt
git reflog expire --expire=now --all
git gc --prune=now --aggressive
# Coordinate force-push with the team — every clone must re-clone after rewrite
git push --force --all
git push --force --tags
```

**Crucial:** rotation always comes first. Public history rewrite without rotation is theatre.

## Tool Integration (2026 landscape)

| Tool | Strengths | Trade-offs | When |
|---|---|---|---|
| **TruffleHog v3** | 800+ detectors with live-verification on most major providers; scans filesystem, git, S3, GCS, Docker, GitHub/GitLab orgs, Postman, Jira, Slack, CircleCI artifacts | Slower than Gitleaks on git history; verification calls go to upstream APIs (rate-limit aware, but be mindful in air-gapped envs) | Scheduled deep scans; post-incident sweeps; ad-hoc org-wide audits |
| **Gitleaks** | Fast, single-binary, regex-based; first-class pre-commit and CI integration; supports SARIF output and baseline files | Pure pattern + entropy; no live verification (Gitleaks does not call upstream APIs) | Pre-commit and PR-diff scans where latency matters |
| **detect-secrets** | Baseline-driven (audit existing findings once, scan only deltas afterward); plugin architecture; widely used in regulated environments | Pattern + entropy only; baselines need active maintenance | Establishing a baseline on a legacy repo; teams that need an explicit allowlist workflow |
| **GitHub Secret Scanning + Push Protection** | Free on public repos; GHAS on private; March 2026 ships push protection by default for 39 token types incl. Airtable/Databricks/Heroku/PostHog/Shopify/Snowflake/Supabase/Vercel; base64 detection (Nov 2025); validity checks for Airtable/DeepSeek/npm/Pinecone/Sentry (Mar 2026); extended metadata (owner, email, dates) Feb 2026 | GitHub-only; partner-driven pattern list (can't add custom patterns without GHAS custom patterns SKU); push protection bypass requires explicit reason | Always-on; every repo, public or private |
| **GitLab Secret Detection / Push Protection** | Built into GitLab CI; gitleaks under the hood; secret push protection blocks pushes containing detected secrets | GitLab-only | Always-on for GitLab repos |
| **Trivy (secrets module)** | Container-image and IaC-aware; finds secrets baked into Docker layers, Helm charts, Kustomize, Terraform tfvars | Pattern-only; no live verification | Container/IaC pipelines |
| **ggshield (GitGuardian CLI)** | Same engine as the GitGuardian platform; large detector catalog; live verification on supported providers | Commercial behind a free tier; cloud-side scanning sends content to GitGuardian (review data-handling for regulated repos) | Teams that have GitGuardian; pre-commit and CI |
| **Microsoft Security DevOps (MSDO) action** | Bundles Microsoft + partner static-analysis tooling into one GitHub Action; normalizes results to SARIF for the Security tab; .NET-friendly | Heavyweight; pulls multiple analyzers; download size and runtime non-trivial | .NET / Azure DevOps shops that want one CI step covering SAST + secrets + IaC |
| **git-secrets (AWS Labs)** | Lightweight, pre-commit-focused; bundled AWS patterns | Pattern-only; sparse upstream maintenance | Legacy / lightweight setups |
| **Betterleaks** | Open-source 2026 project by the Gitleaks creator; positioned as a faster successor with refined rules | Very new (Feb 2026 launch) — evaluate maturity before depending on it for CI | Worth piloting; not yet a primary recommendation |
| **Puaro, Rafter, Jit, etc.** | Newer commercial entrants offering managed scanning + remediation workflow | Commercial; data residency considerations | If team wants a managed product |

### Canonical command lines

```bash
# TruffleHog — filesystem + git, only verified live findings
trufflehog filesystem . --json --only-verified
trufflehog git file://. --json --only-verified

# TruffleHog — Docker image (catches secrets baked into layers)
trufflehog docker --image myorg/api:latest --json --only-verified

# TruffleHog — entire GitHub org (paid plan or PAT with org-read)
trufflehog github --org=your-org --json --only-verified --include-issue-comments

# Gitleaks — current tree (skips history); fast pre-PR check
gitleaks detect --source . --no-git --report-format sarif --report-path gitleaks.sarif

# Gitleaks — full git history with custom config and baseline
gitleaks detect --source . --config .gitleaks.toml --baseline-path .gitleaks-baseline.json \
                --report-format sarif --report-path gitleaks.sarif

# Gitleaks — pre-commit (in .git/hooks/pre-commit or via pre-commit framework)
gitleaks protect --staged --redact

# detect-secrets — baseline workflow
detect-secrets scan > .secrets.baseline
detect-secrets audit .secrets.baseline                    # mark known-acceptable findings
detect-secrets scan --baseline .secrets.baseline          # subsequent runs

# Trivy — secrets in containers + IaC
trivy fs --scanners secret,misconfig --format sarif --output trivy.sarif .
trivy image --scanners secret myorg/api:latest --format sarif --output trivy-img.sarif

# ggshield — pre-commit and CI
ggshield secret scan pre-commit
ggshield secret scan ci

# Microsoft Security DevOps GitHub Action (.NET-friendly bundle)
# - uses: microsoft/security-devops-action@v1.6.0
#   with: tools: trufflehog
```

All scanners that matter in 2026 emit **SARIF**. Make SARIF the default output and aggregate into the GitHub code-scanning Security tab so duplicates collapse and reviewers see one unified list.

### Verifying that a found secret is live (sandboxed)

```bash
# AWS — minimal IAM call, no side effects
AWS_ACCESS_KEY_ID=AKIA... AWS_SECRET_ACCESS_KEY=... aws sts get-caller-identity

# GitHub PAT — returns user + scopes
curl -sS -H "Authorization: token $TOKEN" -H "Accept: application/vnd.github+json" \
     https://api.github.com/user

# Stripe — list charges page with secret key (read-only)
curl -sS https://api.stripe.com/v1/charges -u "$STRIPE_SK:"

# OpenAI — list models
curl -sS -H "Authorization: Bearer $OPENAI_KEY" https://api.openai.com/v1/models

# Anthropic — minimal models call (read-only)
curl -sS -H "x-api-key: $ANTHROPIC_KEY" -H "anthropic-version: 2023-06-01" \
     https://api.anthropic.com/v1/models

# Slack
curl -sS -H "Authorization: Bearer $SLACK_TOKEN" https://slack.com/api/auth.test
```

Always run verification in a sandbox (CI runner, throwaway shell) and assume the call could be logged. Never paste a live secret into an interactive prompt that may be saved to history.

## .gitignore — required baseline patterns

```gitignore
.env
.env.*
!.env.example
*.pem
*.key
*.p12
*.pfx
id_rsa
id_dsa
id_ecdsa
id_ed25519
*.crt
credentials.json
*credentials*.json
.aws/credentials
.aws/config
.npmrc
.pypirc
.netrc
.secrets/
secrets.yaml
secrets.yml
*.kdbx
```

Audit `.gitignore` early — a missing `.env` is responsible for a disproportionate share of all leaks ever shipped.

## False-positive allowlisting — discipline, not convenience

`.gitleaks.toml`:

```toml
[allowlist]
description = "audited 2026-05-19 by security@; review quarterly"
paths = [
    '''(^|/)test_.*\.py$''',
    '''(^|/)docs/.*\.md$''',
    '''(^|/)__fixtures__/'''
]
regexes = [
    '''EXAMPLE_KEY''',
    '''your-api-key-here''',
    '''xxxxxxxx+''',
    '''AKIA<DOCS-EXAMPLE-PLACEHOLDER>'''   # AWS-published docs example pattern
]
```

Before allowlisting, verify: is the string unique enough to be a real key? Is the path definitively non-production? Could a developer have substituted a real secret in a test? When in doubt, do not allowlist — kick back to triage.

## Rotation procedures

| Type | Steps |
|---|---|
| AWS | `aws iam create-access-key` → deploy → `aws iam update-access-key --status Inactive` on the old → audit CloudTrail for usage of the old key over the leak window → `aws iam delete-access-key` after 24 h confirmation |
| GCP API key | Console: APIs & Services > Credentials > regenerate → deploy → revoke the old → audit Cloud Audit Logs |
| Azure AD client secret | Portal: App registrations > Certificates & secrets > new client secret → deploy → delete old → audit Sign-in logs |
| GitHub PAT | Settings > Developer settings > Personal access tokens > regenerate or delete → update consumers → review the PAT's recent activity (now visible in 2026 audit log) |
| Stripe | Dashboard > Developers > API keys > Roll → deploy → audit Events / API logs for activity using the old key |
| Anthropic / OpenAI | Console: revoke key → create new → deploy → audit Usage tab for unexpected spend |
| Database | `ALTER USER ... WITH PASSWORD ...` or platform-specific (RDS rotate, Cloud SQL rotate); restart app pods to pick up new creds |
| Private key (RSA/EC) | Generate new keypair → distribute public half → revoke old (CRL / OCSP if cert-bound) → re-sign any artifacts signed with the old key |
| JWT signing secret | Rotate to a new HS256 secret (or migrate to RS256 with KMS-held key); allow brief overlap window where both verify; invalidate all existing sessions if leak was public |
| OAuth client secret | Regenerate in provider console → update all deployments atomically (no overlap window — secrets aren't multi-valued); review token-issue logs |

Document every rotation in an incident ticket with: detection time, exposure window (commit time of leak → rotation completion), evidence of misuse (or absence thereof) from audit logs, post-mortem actions.

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when you produce a human-readable scan report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization, but the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action recommendation |
|---|---|---|
| CRITICAL | Verified-live cloud root key; verified-live `sk_live_` payment key; verified-live AI provider key (active spend exposure); private key paired with active cert chain; admin-scoped classic PAT | BLOCK; rotate within minutes |
| HIGH | Unverified-but-pattern-matched cloud/payment/AI key; webhook signing secret; DB URL with creds; private key whose chain is unknown; secrets surfaced in git history but absent from HEAD | BLOCK; rotate within hours |
| MEDIUM | Test-environment keys (still rotate-worthy); high-entropy custom token without naming context; fine-grained PAT with narrow scope | Fix this sprint |
| LOW | Allowlisted vendor docs examples (AWS canonical `AKIA<docs-placeholder>`), JWT secret that was visibly placeholder (`"changeme"`), commented-out lines containing old patterns | Acknowledge and document |

## Output Format (human-readable scan report)

```markdown
## Secrets Detection Report

### Executive Summary
| Category | Count | Status |
|---|---|---|
| Verified Live Secrets | 2 | CRITICAL — ROTATE NOW |
| Unverified Pattern Matches | 5 | HIGH — Investigate + verify |
| Entropy-Only (no pattern) | 12 | MEDIUM — Review |
| In Git History (not in HEAD) | 3 | HIGH — Rotate + rewrite history |
| .gitignore Gaps | 4 | MEDIUM — Add patterns |
| Push Protection Bypasses (last 30d) | 1 | HIGH — Review the bypass reason |

### CRITICAL: Verified Live
#### AWS Access Key (VERIFIED LIVE via sts:GetCallerIdentity)
- File: `config/aws.py:12`
- Introduced: commit `abc1234` (2025-08-14)
- Still in HEAD: yes
- Verification: Account `123456789012`, User `deploy-user`, Permissions include `AdministratorAccess`
- Actions:
  1. `aws iam create-access-key --user-name deploy-user` → deploy new key
  2. `aws iam update-access-key --access-key-id AKIA... --status Inactive`
  3. CloudTrail audit for usage of the leaked key between 2025-08-14 and now
  4. After 24h with no production traffic on the new key, `aws iam delete-access-key`
  5. Rewrite git history with `git filter-repo --replace-text`

### HIGH: In Git History (not in HEAD)
#### Stripe live key — deleted in commit `def4567`, still in history
- Introduced: `abc1234`, Removed: `def4567`
- Still accessible: `git show abc1234:src/payments/config.js | grep sk_live`
- Action: rotate the Stripe key (Dashboard > Developers > Roll), then `bfg --replace-text` to scrub history.

### .gitignore Audit
| Pattern | Status |
|---|---|
| `.env` | MISSING — add now |
| `*.pem` | Present |
| `id_rsa` | MISSING — add now |
| `credentials.json` | Present |

### Required Actions
| Priority | Action | Deadline |
|---|---|---|
| CRITICAL | Rotate AWS deploy-user key | IMMEDIATELY |
| CRITICAL | Rotate Stripe live secret | IMMEDIATELY |
| HIGH | Rewrite git history (post-rotation) | Today |
| MEDIUM | Add `.env`, `id_rsa` to `.gitignore` | This week |
| MEDIUM | Enable GitHub push protection org-wide | This week |
```

## CI Integration

```yaml
# .github/workflows/secret-scan.yml
name: Secret scan
on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: '0 3 * * *'   # nightly deep scan
permissions:
  contents: read
  security-events: write  # upload SARIF

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # full history for scheduled scans

      - name: TruffleHog (verified-only)
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          extra_args: --only-verified --fail

      - name: Gitleaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload SARIF
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: gitleaks.sarif
```

Pin a CI step that fails the build whenever this skill emits any letter — per warnings-are-bugs, every finding is `critical` on the wire.

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(secret_type+file+line+git_blob)[:12]>  # fingerprint for dedup
severity: critical                                          # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                             # high = live-verified; medium = pattern match; low = entropy-only
engine: trufflehog | gitleaks | detect-secrets | github-secret-scanning | trivy | ggshield | manual
rule_id: <tool's rule id, e.g. AWS_AKID, stripe-live-secret, generic-api-key-entropy>
secret_type: aws_access_key | stripe_live | github_pat_classic | anthropic_api | private_key_rsa | jwt_secret | db_url | webhook_signing | generic_high_entropy
file: src/config/aws.py
line: 12
git_blob: <sha1 of the blob in git — present even if not in HEAD>
git_commit_introduced: <sha of commit that added the secret>
git_commit_removed: <sha if it was deleted; null if still in HEAD>
in_head: true | false
entropy: 4.7                                                # Shannon bits/char on the matched string
verified: live | revoked | unverified                       # live = upstream API confirmed; revoked = API returned 401/403; unverified = no check performed
verifier_response_meta:                                     # populated when verified=live; helps scope blast radius
  account: "123456789012"
  user: "deploy-user"
  scopes: ["AdministratorAccess"]
reachable: true | false | unknown                           # is the secret actually used in code paths reachable from an entry point?
delta_to_baseline: new | unchanged | regressed              # vs. .secrets.baseline / .gitleaks-baseline.json
message: "AWS access key (verified live) hardcoded in src/config/aws.py:12; account 123456789012 has AdministratorAccess."
fix: "Rotate immediately: aws iam create-access-key + deactivate old + CloudTrail audit + filter-repo to rewrite history. Replace with env-var load."
reference: https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/
```

The integrator uses `confidence` and `verified` to weight findings:

- `verified: live` always blocks phase advancement and triggers immediate rotation guidance.
- `confidence: medium` (pattern match, not verified) blocks advancement unless explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section with a documented rationale.
- `confidence: low` (entropy-only) is informational; the integrator may defer it but the letter still ships as `severity: critical`.
- `delta_to_baseline: unchanged` lets the integrator skip already-accepted findings — but the baseline itself is reviewed quarterly per the allowlist discipline above.
- `in_head: false` (secret only in history) still requires rotation; rewriting alone is never enough.

## Special considerations

- **Vendor / `node_modules` / `vendor/` directories**: don't flag inside vendor trees — but DO flag if a vendored package itself ships test secrets that you may have copied into your own tests.
- **Test code**: lower triage priority but still flagged. Real keys end up in tests; CI runners get rotated less often than production; test-env keys often grant broader access than people remember.
- **Sample / example files**: `.env.example` should contain placeholders only. If pattern detection hits a real-looking value in `.env.example`, treat as MEDIUM and verify.
- **Generated files**: build artifacts, compiled binaries, minified bundles — scan them. Secrets baked at build time end up in `strings $(binary)` output forever.
- **Container images**: TruffleHog `docker://` and Trivy `image --scanners secret` catch the case where a Dockerfile copies `.env` in despite `.dockerignore` being incomplete.
- **Jupyter notebooks**: outputs sometimes embed printed env vars. Scan `.ipynb` JSON, not just `.py` exports.
- **Lockfile metadata**: npm/pnpm/yarn lockfiles occasionally carry registry tokens in `_auth` fields. Scan lockfiles.
- **CI pipeline YAML**: secrets that should reference `${{ secrets.X }}` sometimes get inlined during debugging — scan `.github/workflows/`, `.gitlab-ci.yml`, `azure-pipelines.yml`, `Jenkinsfile`.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
