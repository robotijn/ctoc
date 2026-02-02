# OWASP Top 10 2021 - Detection and Prevention
> Claude Code security correction guide. Updated February 2026.

## Overview

The OWASP Top 10 represents the most critical web application security risks. This guide provides detection patterns, SAST rules, and remediation for each category.

---

## A01:2021 - Broken Access Control

**Moved from #5 to #1** - 94% of applications tested had some form of broken access control.

### Attack Patterns
- Bypassing access controls by modifying URL, application state, HTML page
- Permitting viewing/editing someone else's account via primary key manipulation
- Privilege escalation (acting as admin when logged in as user)
- CORS misconfiguration allowing unauthorized API access
- Force browsing to authenticated pages as unauthenticated user

### Detection (SAST Rules)
```yaml
# Semgrep rule - Missing authorization check
rules:
  - id: missing-authorization-check
    patterns:
      - pattern: |
          @app.route($PATH, ...)
          def $FUNC(...):
            ...
      - pattern-not: |
          @app.route($PATH, ...)
          @requires_auth
          def $FUNC(...):
            ...
      - pattern-not: |
          @app.route($PATH, ...)
          @login_required
          def $FUNC(...):
            ...
    message: "Endpoint missing authorization decorator"
    severity: ERROR

  - id: direct-object-reference
    patterns:
      - pattern: |
          $MODEL.objects.get(id=$REQ.params["$ID"])
      - pattern-not-inside: |
          if $REQ.user.id == ...:
            ...
    message: "Potential IDOR - verify user owns this resource"
    severity: WARNING
```

### Code Patterns to Flag
```python
# BAD: Direct object reference without ownership check
@app.route('/api/users/<user_id>/profile')
def get_profile(user_id):
    return User.query.get(user_id).to_dict()  # VULNERABLE

# GOOD: Verify ownership
@app.route('/api/users/<user_id>/profile')
@login_required
def get_profile(user_id):
    user = User.query.get_or_404(user_id)
    if user.id != current_user.id and not current_user.is_admin:
        abort(403)
    return user.to_dict()
```

### Prevention Checklist
- [ ] Deny by default - require explicit grants
- [ ] Implement ownership checks on every data access
- [ ] Disable web server directory listing
- [ ] Log access control failures, alert on repeated failures
- [ ] Rate limit API access to minimize automated attacks
- [ ] Invalidate JWT tokens on logout (stateful or short-lived)
- [ ] Use UUIDs instead of sequential IDs (defense in depth)

---

## A02:2021 - Cryptographic Failures

**Previously "Sensitive Data Exposure"** - Focus on cryptography-related failures.

### Attack Patterns
- Data transmitted in clear text (HTTP, SMTP, FTP)
- Old/weak cryptographic algorithms (MD5, SHA1, DES, RC4)
- Default or weak encryption keys
- Missing encryption at rest for sensitive data
- Insufficient TLS configuration

### Detection (SAST Rules)
```yaml
# Semgrep rules for weak cryptography
rules:
  - id: weak-hash-md5
    pattern-either:
      - pattern: hashlib.md5(...)
      - pattern: MD5.new(...)
      - pattern: Digest::MD5.hexdigest(...)
    message: "MD5 is cryptographically broken - use SHA-256 or better"
    severity: ERROR

  - id: weak-hash-sha1
    pattern-either:
      - pattern: hashlib.sha1(...)
      - pattern: SHA.new(...)
      - pattern: Digest::SHA1.hexdigest(...)
    message: "SHA-1 is deprecated - use SHA-256 or better"
    severity: WARNING

  - id: weak-cipher-des
    pattern-either:
      - pattern: DES.new(...)
      - pattern: TripleDES(...)
      - pattern: Cipher.getInstance("DES")
    message: "DES/3DES is deprecated - use AES-256-GCM"
    severity: ERROR

  - id: hardcoded-encryption-key
    patterns:
      - pattern: AES.new($KEY, ...)
      - metavariable-pattern:
          metavariable: $KEY
          pattern-either:
            - pattern: "..."  # String literal
            - pattern: b"..."  # Bytes literal
    message: "Hardcoded encryption key - use key derivation or KMS"
    severity: ERROR

  - id: weak-random
    pattern-either:
      - pattern: random.random()
      - pattern: Math.random()
      - pattern: rand()
    message: "Weak random for crypto - use secrets module or crypto.randomBytes"
    severity: ERROR
```

### Weak vs Strong Cryptography
| Use Case | Weak (Avoid) | Strong (Use) |
|----------|--------------|--------------|
| Password storage | MD5, SHA1, SHA256 (unsalted) | bcrypt, Argon2id, scrypt |
| Hashing | MD5, SHA1 | SHA-256, SHA-3, BLAKE3 |
| Symmetric encryption | DES, 3DES, RC4, AES-ECB | AES-256-GCM, ChaCha20-Poly1305 |
| Asymmetric encryption | RSA-1024 | RSA-2048+, Ed25519, ECDSA P-256+ |
| Key derivation | None | PBKDF2 (100k+ iterations), Argon2 |
| Random numbers | `random`, `Math.random()` | `secrets`, `crypto.randomBytes` |

### Prevention Checklist
- [ ] Classify data (PII, financial, health) - apply controls by sensitivity
- [ ] Encrypt all sensitive data at rest (AES-256-GCM)
- [ ] Enforce TLS 1.3 (minimum TLS 1.2) with strong ciphers
- [ ] Use authenticated encryption (GCM, CCM, Poly1305)
- [ ] Store passwords with Argon2id or bcrypt (cost factor 12+)
- [ ] Use cryptographically secure random for all crypto operations
- [ ] Never commit encryption keys - use KMS or secrets manager

---

## A03:2021 - Injection

**Includes SQL, NoSQL, OS Command, LDAP, Expression Language, ORM, OGNL.**

### Attack Patterns
- SQL Injection: `' OR '1'='1` in login forms
- NoSQL Injection: `{"$gt": ""}` in MongoDB queries
- Command Injection: `; rm -rf /` in shell commands
- LDAP Injection: `*)(uid=*))(|(uid=*` in directory queries
- Template Injection: `{{constructor.constructor('return this')()}}` in SSTI

### Detection (SAST Rules)
```yaml
# Semgrep rules for injection
rules:
  - id: sql-injection
    patterns:
      - pattern-either:
          - pattern: |
              $QUERY = "..." + $USER_INPUT + "..."
              ...
              $DB.execute($QUERY)
          - pattern: |
              $DB.execute(f"...{$USER_INPUT}...")
          - pattern: |
              $DB.execute("...%s..." % $USER_INPUT)
    message: "SQL Injection - use parameterized queries"
    severity: ERROR

  - id: command-injection
    patterns:
      - pattern-either:
          - pattern: os.system($CMD)
          - pattern: subprocess.call($CMD, shell=True)
          - pattern: subprocess.Popen($CMD, shell=True)
          - pattern: exec($CMD)
    message: "Potential command injection - avoid shell=True"
    severity: ERROR

  - id: nosql-injection
    patterns:
      - pattern: |
          $COLLECTION.find({$FIELD: $REQ.$PARAM})
      - pattern-not: |
          $COLLECTION.find({$FIELD: sanitize($REQ.$PARAM)})
    message: "NoSQL Injection - validate/sanitize input"
    severity: WARNING

  - id: ldap-injection
    patterns:
      - pattern: |
          $FILTER = "..." + $USER_INPUT + "..."
          ...
          $CONN.search(..., $FILTER, ...)
    message: "LDAP Injection - escape special characters"
    severity: ERROR

  - id: template-injection
    patterns:
      - pattern: Template($USER_INPUT)
      - pattern: render_template_string($USER_INPUT)
      - pattern: Environment().from_string($USER_INPUT)
    message: "Server-Side Template Injection - never template user input"
    severity: ERROR
```

### Code Fixes
```python
# SQL - BAD
cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")

# SQL - GOOD
cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))

# Command - BAD
os.system(f"convert {filename} output.png")

# Command - GOOD
subprocess.run(["convert", filename, "output.png"], check=True)

# NoSQL - BAD
db.users.find({"username": request.json["username"]})

# NoSQL - GOOD
username = str(request.json.get("username", ""))[:50]  # Type + length
if not re.match(r'^[a-zA-Z0-9_]+$', username):
    abort(400)
db.users.find({"username": username})
```

### Prevention Checklist
- [ ] Use parameterized queries / prepared statements ALWAYS
- [ ] Use ORM with proper escaping (SQLAlchemy, Prisma)
- [ ] Avoid shell=True in subprocess - use list of arguments
- [ ] Validate and sanitize all input (type, length, format, range)
- [ ] Use allowlist input validation where possible
- [ ] Escape output context-appropriately (HTML, JS, SQL, OS)
- [ ] Use LIMIT to prevent mass disclosure on SQL injection

---

## A04:2021 - Insecure Design

**NEW in 2021** - Focuses on design and architectural flaws, not implementation bugs.

### Attack Patterns
- Missing rate limiting on authentication endpoints
- No account lockout after failed attempts
- Security questions with guessable answers
- Missing CAPTCHA on forms
- Business logic flaws (negative quantities, price manipulation)

### Detection (Design Review)
```yaml
# Semgrep rules for design issues
rules:
  - id: missing-rate-limit
    patterns:
      - pattern: |
          @app.route("/login", methods=["POST"])
          def login(...):
            ...
      - pattern-not: |
          @app.route("/login", methods=["POST"])
          @limiter.limit(...)
          def login(...):
            ...
    message: "Login endpoint missing rate limiting"
    severity: WARNING

  - id: missing-account-lockout
    patterns:
      - pattern: |
          def authenticate($USER, $PASS):
            ...
            if not verify_password(...):
              return False
            ...
      - pattern-not-inside: |
          def authenticate($USER, $PASS):
            ...
            if failed_attempts > $MAX:
              ...
    message: "Consider implementing account lockout"
    severity: INFO
```

### Threat Modeling Requirements
1. **Data Flow Diagrams** - Map all data flows
2. **Trust Boundaries** - Identify where trust changes
3. **STRIDE Analysis** - Spoofing, Tampering, Repudiation, Info Disclosure, DoS, Elevation
4. **Attack Trees** - Model attack scenarios
5. **Abuse Cases** - Document how features can be misused

### Prevention Checklist
- [ ] Perform threat modeling for critical flows
- [ ] Implement defense in depth - multiple security layers
- [ ] Add rate limiting on all sensitive operations
- [ ] Implement account lockout (5 failed attempts = 15 min lockout)
- [ ] Use CAPTCHA for public forms
- [ ] Validate business logic server-side (prices, quantities)
- [ ] Separate tenant/user data by design (multi-tenancy)
- [ ] Implement unit and integration tests for security controls

---

## A05:2021 - Security Misconfiguration

**Moved from #6 to #5** - Includes missing hardening, open cloud storage, verbose errors.

### Attack Patterns
- Default credentials left in place
- Unnecessary features enabled (directory listing, debug mode)
- Error messages revealing stack traces
- Missing security headers
- Overly permissive CORS
- Outdated software

### Detection (SAST/Config Scanning)
```yaml
# Semgrep rules for misconfiguration
rules:
  - id: debug-mode-production
    patterns:
      - pattern-either:
          - pattern: app.run(debug=True)
          - pattern: DEBUG = True
          - pattern: 'debug': True
    message: "Debug mode enabled - disable in production"
    severity: ERROR

  - id: verbose-error-handling
    patterns:
      - pattern: |
          except $EXCEPTION:
            return str($EXCEPTION)
      - pattern: |
          except $EXCEPTION as $E:
            return traceback.format_exc()
    message: "Exposing stack traces to users"
    severity: WARNING

  - id: cors-wildcard
    patterns:
      - pattern: 'Access-Control-Allow-Origin': '*'
      - pattern: CORS(app, origins="*")
    message: "CORS allows any origin - restrict to known origins"
    severity: WARNING

  - id: missing-security-headers
    patterns:
      - pattern: Response(...)
      - pattern-not-inside: |
          response.headers['X-Content-Type-Options'] = 'nosniff'
    message: "Missing security headers"
    severity: INFO
```

### Required Security Headers
```python
# Flask example
@app.after_request
def security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '0'  # Deprecated, use CSP
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'"
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'
    return response
```

### Prevention Checklist
- [ ] Remove/disable unused features, frameworks, accounts
- [ ] Harden all configurations (use CIS Benchmarks)
- [ ] Implement security headers (use securityheaders.com to test)
- [ ] Disable directory listing
- [ ] Remove default credentials
- [ ] Custom error pages - never expose stack traces
- [ ] Scan configurations regularly (Trivy config, checkov)
- [ ] Automate configuration deployment with IaC

---

## A06:2021 - Vulnerable and Outdated Components

**Previously #9** - Using components with known vulnerabilities.

### Attack Patterns
- Using libraries with known CVEs
- Outdated frameworks without security patches
- Unsupported software (EOL)
- Unpatched OS packages

### Detection (SCA Tools)
```bash
# See dependency-scanning.md for comprehensive SCA tools

# Quick checks
npm audit                           # JavaScript
pip-audit                           # Python
govulncheck ./...                   # Go
cargo audit                         # Rust
trivy fs --scanners vuln .          # Multi-language
```

### Component Inventory Requirements
```yaml
# SBOM generation - see dependency-scanning.md
# Every project MUST maintain:
# 1. Direct dependencies list with versions
# 2. Full SBOM (CycloneDX or SPDX format)
# 3. Automated vulnerability monitoring
# 4. Update policy (patch within X days based on severity)
```

### Prevention Checklist
- [ ] Generate and maintain SBOM for all applications
- [ ] Monitor dependencies continuously (Dependabot, Renovate)
- [ ] Remove unused dependencies
- [ ] Only use components from trusted sources
- [ ] Scan dependencies in CI/CD pipeline
- [ ] Subscribe to security bulletins for major dependencies
- [ ] Have upgrade path planned before using any library

---

## A07:2021 - Identification and Authentication Failures

**Previously "Broken Authentication"** - Expanded scope.

### Attack Patterns
- Credential stuffing (known breached credentials)
- Brute force attacks (no rate limiting)
- Session fixation
- Weak password requirements
- Exposed session IDs in URL
- Missing MFA for sensitive operations

### Detection (SAST Rules)
```yaml
# Semgrep rules for auth failures
rules:
  - id: weak-password-policy
    patterns:
      - pattern: |
          if len($PASSWORD) >= 6:
            ...
    message: "Weak password policy - require 12+ characters"
    severity: WARNING

  - id: session-in-url
    patterns:
      - pattern: |
          url + "?session_id=" + $SESSION
      - pattern: |
          redirect(f"...?token={$TOKEN}")
    message: "Session ID in URL - use cookies"
    severity: ERROR

  - id: missing-password-hash
    patterns:
      - pattern: |
          $USER.password = $PASSWORD
      - pattern-not: |
          $USER.password = hash_password($PASSWORD)
      - pattern-not: |
          $USER.password = bcrypt.hash($PASSWORD)
    message: "Storing plaintext password"
    severity: ERROR

  - id: timing-attack-auth
    patterns:
      - pattern: |
          if $USER.password == $INPUT_PASSWORD:
            ...
    message: "Use constant-time comparison for passwords"
    severity: ERROR
```

### Secure Authentication Implementation
```python
# Password requirements
def validate_password(password: str) -> bool:
    if len(password) < 12:
        return False
    if not any(c.isupper() for c in password):
        return False
    if not any(c.islower() for c in password):
        return False
    if not any(c.isdigit() for c in password):
        return False
    if password in COMMON_PASSWORDS:  # Have I Been Pwned API
        return False
    return True

# Password hashing (Argon2id)
from argon2 import PasswordHasher
ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4)
hashed = ph.hash(password)
ph.verify(hashed, password)  # Raises on mismatch

# Session management
session.config.update(
    SESSION_COOKIE_SECURE=True,      # HTTPS only
    SESSION_COOKIE_HTTPONLY=True,    # No JavaScript access
    SESSION_COOKIE_SAMESITE='Lax',   # CSRF protection
    PERMANENT_SESSION_LIFETIME=3600,  # 1 hour
)
```

### Prevention Checklist
- [ ] Implement MFA for all users (TOTP at minimum)
- [ ] Check passwords against breached password lists (HIBP)
- [ ] Require 12+ character passwords with complexity
- [ ] Hash passwords with Argon2id or bcrypt (cost 12+)
- [ ] Rate limit authentication attempts (5/minute)
- [ ] Implement account lockout (15 min after 5 failures)
- [ ] Regenerate session ID after authentication
- [ ] Secure session cookies (Secure, HttpOnly, SameSite)
- [ ] Implement secure password reset (token-based, time-limited)

---

## A08:2021 - Software and Data Integrity Failures

**NEW in 2021** - Focuses on CI/CD security and insecure deserialization.

### Attack Patterns
- Insecure deserialization of untrusted data
- CI/CD pipeline compromise
- Unsigned software updates
- Tampered dependencies (supply chain)
- Code injection via auto-update

### Detection (SAST Rules)
```yaml
# Semgrep rules for integrity failures
rules:
  - id: unsafe-deserialization-pickle
    patterns:
      - pattern: pickle.loads($DATA)
      - pattern: pickle.load($FILE)
    message: "Unsafe deserialization - pickle executes arbitrary code"
    severity: ERROR

  - id: unsafe-deserialization-yaml
    patterns:
      - pattern: yaml.load($DATA)
      - pattern-not: yaml.load($DATA, Loader=yaml.SafeLoader)
      - pattern-not: yaml.safe_load($DATA)
    message: "Unsafe YAML loading - use yaml.safe_load()"
    severity: ERROR

  - id: unsafe-deserialization-java
    patterns:
      - pattern: ObjectInputStream($INPUT).readObject()
    message: "Unsafe Java deserialization - validate input"
    severity: ERROR

  - id: unsigned-package-install
    patterns:
      - pattern: pip install --trusted-host ...
      - pattern: npm install --ignore-scripts
    message: "Installing unsigned/unverified packages"
    severity: WARNING

  - id: eval-untrusted
    patterns:
      - pattern: eval($USER_INPUT)
      - pattern: exec($USER_INPUT)
      - pattern: Function($USER_INPUT)
    message: "Code execution from untrusted input"
    severity: ERROR
```

### CI/CD Security Controls
```yaml
# GitHub Actions hardening
jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read  # Minimum required
      # Don't grant write unless needed

    steps:
      - uses: actions/checkout@v4  # Pin to version
        with:
          persist-credentials: false  # Don't persist token

      # Use hash pinning for third-party actions
      - uses: actions/setup-node@8f152de45cc393bb48ce5d89d36b731f54556e65  # v4.0.0

      # Verify dependencies
      - name: Verify lockfile
        run: npm ci --ignore-scripts  # Don't run postinstall from deps

      # Sign artifacts
      - name: Sign with Sigstore
        uses: sigstore/cosign-installer@main
      - run: cosign sign-blob --bundle=artifact.bundle artifact.tar.gz
```

### Prevention Checklist
- [ ] Never deserialize untrusted data with unsafe loaders
- [ ] Use `yaml.safe_load()` instead of `yaml.load()`
- [ ] Avoid pickle - use JSON for serialization
- [ ] Verify software signatures before installation
- [ ] Use lockfiles and verify checksums (`npm ci`, `pip install --require-hashes`)
- [ ] Pin dependencies to specific versions/hashes
- [ ] Scan CI/CD configurations (Semgrep, checkov)
- [ ] Use minimal permissions in CI/CD
- [ ] Sign release artifacts with Sigstore/cosign

---

## A09:2021 - Security Logging and Monitoring Failures

**Previously #10** - Insufficient logging to detect attacks.

### Attack Patterns
- Failed login attempts not logged
- No alerting on suspicious activity
- Logs stored locally and easily deleted
- Missing audit trails
- Log injection attacks

### Detection (Code Review)
```yaml
# Semgrep rules for logging failures
rules:
  - id: missing-auth-logging
    patterns:
      - pattern: |
          def login(...):
            if not authenticate(...):
              return error
            ...
      - pattern-not-inside: |
          def login(...):
            if not authenticate(...):
              logger.warning(...)
              return error
    message: "Log failed authentication attempts"
    severity: WARNING

  - id: log-injection
    patterns:
      - pattern: logger.info($USER_INPUT)
      - pattern: logger.info(f"...{$USER_INPUT}...")
    message: "Potential log injection - sanitize input"
    severity: INFO

  - id: logging-sensitive-data
    patterns:
      - pattern: logger.$METHOD(..., password=..., ...)
      - pattern: logger.$METHOD(..., token=..., ...)
      - pattern: logger.$METHOD(..., secret=..., ...)
    message: "Logging sensitive data - mask or remove"
    severity: ERROR
```

### What to Log
```python
# Security-relevant events to log
MUST_LOG = [
    "authentication_success",
    "authentication_failure",
    "authorization_failure",
    "input_validation_failure",
    "session_created",
    "session_destroyed",
    "password_changed",
    "mfa_enabled",
    "mfa_disabled",
    "admin_action",
    "data_export",
    "api_key_created",
    "rate_limit_exceeded",
]

# Log format with security context
import structlog
logger = structlog.get_logger()

logger.warning(
    "authentication_failure",
    username=username,
    ip_address=request.remote_addr,
    user_agent=request.user_agent.string,
    failure_reason="invalid_password",
    failed_attempts=get_failed_attempts(username),
)
```

### Log Protection
```python
# Sanitize logs to prevent injection
def sanitize_for_log(value: str) -> str:
    """Remove newlines and control characters."""
    return value.replace('\n', '\\n').replace('\r', '\\r')

# Mask sensitive fields
def mask_sensitive(data: dict, fields: list) -> dict:
    masked = data.copy()
    for field in fields:
        if field in masked:
            masked[field] = "***REDACTED***"
    return masked
```

### Prevention Checklist
- [ ] Log all authentication events (success and failure)
- [ ] Log all authorization failures
- [ ] Log admin and privileged operations
- [ ] Include context: user, IP, timestamp, action, resource
- [ ] Send logs to centralized, immutable storage (SIEM)
- [ ] Set up alerts for suspicious patterns (brute force, etc.)
- [ ] Sanitize log input to prevent injection
- [ ] Never log passwords, tokens, or secrets
- [ ] Retain logs per compliance requirements (90+ days)
- [ ] Test that logging works (include in security tests)

---

## A10:2021 - Server-Side Request Forgery (SSRF)

**NEW in 2021** - Making server fetch attacker-controlled URLs.

### Attack Patterns
- Fetching internal URLs (`http://localhost`, `http://169.254.169.254`)
- Port scanning internal network
- Accessing cloud metadata endpoints
- Bypassing firewalls
- Reading local files via `file://`

### Detection (SAST Rules)
```yaml
# Semgrep rules for SSRF
rules:
  - id: ssrf-requests
    patterns:
      - pattern-either:
          - pattern: requests.get($URL)
          - pattern: requests.post($URL, ...)
          - pattern: urllib.request.urlopen($URL)
          - pattern: http.get($URL)
          - pattern: fetch($URL)
      - pattern-not-inside: |
          if is_allowed_url($URL):
            ...
    message: "Potential SSRF - validate URL against allowlist"
    severity: WARNING

  - id: ssrf-redirect-follow
    patterns:
      - pattern: requests.get($URL, allow_redirects=True)
    message: "SSRF via redirect - validate final URL"
    severity: INFO
```

### SSRF Prevention Code
```python
import ipaddress
from urllib.parse import urlparse

# Blocklist approach (INSUFFICIENT - can be bypassed)
BLOCKED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254']

# Proper allowlist approach
ALLOWED_DOMAINS = ['api.example.com', 'cdn.example.com']

def validate_url(url: str) -> bool:
    """Validate URL against allowlist."""
    parsed = urlparse(url)

    # Only allow http/https
    if parsed.scheme not in ('http', 'https'):
        return False

    # Check against allowlist
    if parsed.hostname not in ALLOWED_DOMAINS:
        return False

    # Resolve and check IP
    try:
        ip = ipaddress.ip_address(socket.gethostbyname(parsed.hostname))
        if ip.is_private or ip.is_loopback or ip.is_link_local:
            return False
    except (socket.gaierror, ValueError):
        return False

    return True

def safe_fetch(url: str) -> Response:
    """Fetch URL with SSRF protections."""
    if not validate_url(url):
        raise ValueError("URL not allowed")

    response = requests.get(
        url,
        allow_redirects=False,  # Handle redirects manually
        timeout=10,
    )

    # If redirect, validate redirect URL too
    if response.is_redirect:
        redirect_url = response.headers.get('Location')
        if not validate_url(redirect_url):
            raise ValueError("Redirect URL not allowed")

    return response
```

### Cloud Metadata Protection
```yaml
# AWS - Instance Metadata Service v2 (IMDSv2)
# Requires session token, mitigates SSRF
aws ec2 modify-instance-metadata-options \
    --instance-id i-1234567890abcdef0 \
    --http-tokens required \
    --http-put-response-hop-limit 1

# GCP - Block metadata endpoint from pods
# Use Workload Identity instead
# Network policy to block 169.254.169.254

# Azure - Use managed identities with restricted scope
```

### Prevention Checklist
- [ ] Use allowlist for URLs, not blocklist
- [ ] Validate resolved IP is not private/internal
- [ ] Disable HTTP redirects or validate each hop
- [ ] Use network segmentation (apps can't reach internal services)
- [ ] Enable cloud metadata service v2 (requires token)
- [ ] Block `file://`, `gopher://`, `dict://` schemes
- [ ] Set timeouts on outbound requests
- [ ] Log and alert on SSRF attempts

---

## OWASP Testing Checklist

```markdown
## Security Testing Checklist

### A01 - Broken Access Control
- [ ] Test horizontal privilege escalation (access other user's data)
- [ ] Test vertical privilege escalation (user → admin)
- [ ] Test IDOR vulnerabilities
- [ ] Verify CORS configuration

### A02 - Cryptographic Failures
- [ ] Verify TLS 1.3/1.2 only
- [ ] Check for weak algorithms
- [ ] Verify password hashing (Argon2id/bcrypt)
- [ ] Test for sensitive data in logs

### A03 - Injection
- [ ] SQL injection testing (sqlmap)
- [ ] Command injection testing
- [ ] NoSQL injection testing
- [ ] Template injection testing

### A04 - Insecure Design
- [ ] Review threat model
- [ ] Verify rate limiting
- [ ] Test business logic flaws

### A05 - Security Misconfiguration
- [ ] Check security headers
- [ ] Verify error handling (no stack traces)
- [ ] Check for default credentials
- [ ] Directory listing disabled

### A06 - Vulnerable Components
- [ ] Run SCA scan
- [ ] Verify SBOM current
- [ ] Check for EOL components

### A07 - Authentication Failures
- [ ] Test brute force protection
- [ ] Verify MFA implementation
- [ ] Test password policy
- [ ] Session management review

### A08 - Integrity Failures
- [ ] Review CI/CD security
- [ ] Check for unsafe deserialization
- [ ] Verify dependency integrity

### A09 - Logging Failures
- [ ] Verify security events logged
- [ ] Check log injection protection
- [ ] Verify alerting configured

### A10 - SSRF
- [ ] Test internal URL access
- [ ] Test cloud metadata access
- [ ] Verify URL validation
```

## Bypass Techniques (Attackers Know These)

### A01 Access Control Bypasses
```python
# Bypass 1: HTTP method manipulation
# App only checks POST, attacker uses PUT
@app.route('/admin', methods=['POST'])  # But PUT not checked!

# Bypass 2: Path traversal to bypass auth
# /api/users/123/../admin/settings

# Bypass 3: Case sensitivity
# /Admin vs /admin - different on some systems

# Bypass 4: URL encoding
# /admin%2fsettings - bypasses path-based checks

# Bypass 5: Adding trailing characters
# /admin/ vs /admin vs /admin.
```

### A03 Injection Bypasses
```python
# SQL injection filter bypasses
# Bypass: Double encoding
# %2527 -> %27 -> '

# Bypass: Unicode normalization
# ＇ (fullwidth apostrophe) -> ' after normalization

# Bypass: Comments
# SELECT/**/username/**/FROM/**/users

# Bypass: Case mixing (MySQL)
# SeLeCt * FrOm users

# NoSQL injection bypasses
{"$where": "this.password.match(/.*/)"}  # JavaScript in query
{"password": {"$regex": ".*"}}  # Regex matching
```

### A10 SSRF Bypasses
```python
# Bypass 1: Decimal IP
http://2130706433/  # = 127.0.0.1

# Bypass 2: Octal IP
http://0177.0.0.1/  # = 127.0.0.1

# Bypass 3: IPv6
http://[::1]/  # localhost
http://[::ffff:127.0.0.1]/  # IPv6-mapped

# Bypass 4: DNS rebinding
# First resolves to allowed IP, then to internal

# Bypass 5: URL shorteners
http://bit.ly/internal-url

# Bypass 6: Redirect chains
http://allowed.com -> 301 -> http://169.254.169.254
```

## Framework-Specific Patterns

### Django Security
```python
# A01 - Use object-level permissions
from guardian.shortcuts import get_objects_for_user
objects = get_objects_for_user(request.user, 'view_object', Object)

# A03 - Always use ORM, never raw SQL
User.objects.filter(id=user_id)  # Safe
User.objects.raw("SELECT * FROM users WHERE id = %s", [user_id])  # Safe with params
User.objects.raw(f"SELECT * FROM users WHERE id = {user_id}")  # VULNERABLE

# A05 - Security settings
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_SECURE = True
```

### Express.js Security
```javascript
// A01 - Middleware-based authorization
const authorize = (permission) => (req, res, next) => {
    if (!req.user.can(permission)) return res.status(403).send();
    next();
};
app.get('/admin', authorize('admin:read'), adminHandler);

// A03 - Parameterized queries
const result = await db.query(
    'SELECT * FROM users WHERE id = $1',
    [userId]  // Parameterized
);

// A05 - Security headers with Helmet
const helmet = require('helmet');
app.use(helmet());
app.use(helmet.contentSecurityPolicy({
    directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
    }
}));
```

### Spring Boot Security
```java
// A01 - Method-level security
@PreAuthorize("hasRole('ADMIN') or #userId == authentication.principal.id")
public User getUser(@PathVariable Long userId) { ... }

// A03 - JPA/Hibernate parameterization
@Query("SELECT u FROM User u WHERE u.id = :id")
User findById(@Param("id") Long id);  // Safe

// Never do this:
entityManager.createQuery("SELECT u FROM User u WHERE u.id = " + id);  // VULNERABLE

// A07 - Password encoding
@Bean
public PasswordEncoder passwordEncoder() {
    return new Argon2PasswordEncoder(16, 32, 1, 65536, 3);
}
```

## API Security Considerations

### GraphQL-Specific Vulnerabilities
```graphql
# Excessive data exposure
query {
    user(id: 1) {
        password  # Should be filtered by resolver
        ssn       # Should be filtered by resolver
    }
}

# Batching attacks (bypass rate limiting)
query {
    user1: user(id: 1) { name }
    user2: user(id: 2) { name }
    # ... 1000 more
}

# Deep nesting DoS
query {
    user { friends { friends { friends { friends { ... } } } } }
}
```

### REST API Security
```yaml
# Required headers
security_headers:
  - "X-Content-Type-Options: nosniff"
  - "X-Frame-Options: DENY"
  - "Content-Security-Policy: default-src 'none'"

# Rate limiting by endpoint sensitivity
rate_limits:
  "/auth/login": "5/minute"
  "/auth/password-reset": "3/hour"
  "/api/public": "100/minute"
  "/api/private": "30/minute"

# Input validation
validation:
  max_request_size: "1MB"
  max_field_length: 10000
  allowed_content_types: ["application/json"]
```

## Automated Testing Integration

### OWASP ZAP in CI
```yaml
# GitHub Actions - DAST with ZAP
name: DAST Scan

on:
  schedule:
    - cron: '0 2 * * 1'  # Weekly on Monday

jobs:
  zap-scan:
    runs-on: ubuntu-latest
    steps:
      - name: Start application
        run: docker-compose up -d

      - name: ZAP Baseline Scan
        uses: zaproxy/action-baseline@v0.12.0
        with:
          target: 'http://localhost:8080'
          rules_file_name: '.zap/rules.tsv'
          cmd_options: '-a'

      - name: ZAP Full Scan
        uses: zaproxy/action-full-scan@v0.10.0
        with:
          target: 'http://localhost:8080'
```

### SQLMap Integration
```bash
# Automated SQL injection testing
sqlmap -u "http://target.com/api/user?id=1" \
    --batch \
    --risk=2 \
    --level=3 \
    --output-dir=/tmp/sqlmap \
    --forms \
    --crawl=2

# CI integration
if sqlmap ... --batch | grep -q "injectable"; then
    echo "SQL Injection found!"
    exit 1
fi
```

## Compliance Mapping

### OWASP to Compliance Standards

| OWASP | PCI DSS 4.0 | HIPAA | SOC 2 | GDPR |
|-------|-------------|-------|-------|------|
| A01 Access Control | 7.1, 7.2 | 164.312(a) | CC6.1 | Art. 32 |
| A02 Crypto | 3.4, 4.1 | 164.312(e) | CC6.1 | Art. 32 |
| A03 Injection | 6.5.1 | 164.312(c) | CC6.1 | Art. 32 |
| A04 Design | 6.5 | 164.308(a) | CC3.2 | Art. 25 |
| A05 Misconfig | 2.2, 6.4 | 164.312(e) | CC6.8 | Art. 32 |
| A06 Components | 6.3 | 164.308(a) | CC7.1 | Art. 32 |
| A07 Auth | 8.2, 8.3 | 164.312(d) | CC6.1 | Art. 32 |
| A08 Integrity | 6.4, 11.6 | 164.312(c) | CC7.2 | Art. 32 |
| A09 Logging | 10.1-10.7 | 164.312(b) | CC7.2 | Art. 30 |
| A10 SSRF | 6.5.9 | 164.312(e) | CC6.6 | Art. 32 |

## Claude's Common Mistakes

1. **Recommending blocklists for SSRF** - Use allowlists; blocklists can be bypassed
2. **Using SHA-256 for passwords** - Use Argon2id or bcrypt, not bare hashes
3. **Missing constant-time comparison** - Use `secrets.compare_digest()` for tokens
4. **Allowing `yaml.load()` without SafeLoader** - Always use `yaml.safe_load()`
5. **Not considering redirects in SSRF** - Validate each redirect hop
6. **Suggesting MD5/SHA1 for any purpose** - Both are cryptographically broken
7. **Missing IP encoding bypasses** - Decimal, octal, IPv6 bypass blocklists
8. **Not considering case sensitivity** - URL and path checks must be case-insensitive
9. **Forgetting GraphQL-specific attacks** - Batching, nesting, introspection exposure

## What NOT to Do

- Do NOT use blocklists for security controls - always use allowlists
- Do NOT log sensitive data (passwords, tokens, PII)
- Do NOT use `pickle`, `eval`, or `exec` on untrusted data
- Do NOT rely solely on client-side validation
- Do NOT expose stack traces in production errors
- Do NOT use weak cryptographic algorithms (MD5, SHA1, DES)
- Do NOT store passwords with reversible encryption
- Do NOT trust redirect URLs without validation
- Do NOT forget IP encoding variations in SSRF protection
- Do NOT assume filter bypass is impossible - defense in depth
- Do NOT skip GraphQL introspection disabling in production
