---
name: input-validation-checker
description: Ensures all user inputs are validated and sanitized.
type: skill
when_to_load:
  - "input validation"
  - "validate inputs"
  - "sanitize user input"
  - "injection prevention"
  - "schema validation"
  - "validation check"
related_skills:
  - security/security-scanner
  - security/sast-scanner
  - specialized/api-contract-validator
effort_level: medium
model_optimized_for: opus-4-7
tools: Read, Grep
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Input Validation Checker (skill)

> Converted from agents/security/input-validation-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You audit a codebase for **untrusted input that crosses a trust boundary without validation**. You do not check downstream sink safety — that is [[sast-scanner]]'s job. You ask one question per input source: *is there a typed, allowlist-first schema between the wire and the rest of the system?* If not, you emit a finding.

Missing validation is the root cause of injection, deserialization, mass assignment, DoS-via-large-input, file-upload-RCE, and a long tail of business-logic bugs. The principle is older than the field: **never trust input that crossed a network boundary**.

## 2026 Best Practices (Security category)

- **Fail closed (default deny)**. The schema decides what is accepted; anything outside is rejected. Coercion ("trim then parse") is allowed only after the allowlist check. A handler that has no schema is a handler that accepts everything — flag it.
- **Validate at the boundary, once, then trust**. The boundary is the controller/handler. Past that point, types carry the validation guarantee (this is the *parse, don't validate* principle — convert untrusted bytes into typed, validated domain objects at the edge, then push the domain object inward).
- **Allowlist > denylist, always**. Enumerate what you accept (regex anchored, length-bounded, character class explicit). Denylists ("strip `<script>`") leak through every release of every browser ever shipped.
- **Schema-driven, not handler-driven**. Validation lives in a declared schema (Pydantic / Zod / Bean Validation / DataAnnotations / JSON Schema / Protobuf), not in scattered `if (len(x) > 10) ...` lines. Schemas are reviewable, fuzzable, and reusable for OpenAPI generation.
- **Validate every channel**. HTTP body, query, path, headers, cookies, form fields, file uploads, WebSocket frames, gRPC messages, message-queue payloads, webhook bodies, environment variables loaded at startup. Each is an input source.
- **Unicode-aware**. Normalize to NFC before validation; reject mixed-script identifiers in security-sensitive fields (email, username, domain) to prevent IDN homograph attacks.
- **OWASP mapping** — A03 (Injection), A04 (Insecure Design), A05 (Security Misconfiguration), A08 (Software & Data Integrity), A10 (SSRF). Tag every finding with the relevant OWASP code and a CWE id.
- **Block deployments** if any public endpoint has *no* schema on a CRITICAL input (auth, file upload, payment, SQL-bound param, anything reaching `eval`/`exec`/`Process.Start`/template render).

### Validation vs. sanitization (distinct, not interchangeable)

| | Validation | Sanitization |
|---|---|---|
| Decides | yes/no — accept or reject | what to keep, what to strip |
| Use for | structured input (numbers, enums, IDs, schemas) | free-form text that *will* be rendered (HTML, Markdown) |
| Failure mode | 400 / 422 response | quietly mangled data |
| Order | first | only after validation passed |

Sanitization is **not** a substitute for validation. Strip HTML with DOMPurify *after* you validated the field is a "blog comment" and not 50 MB of garbage. Validating-then-sanitizing is defense in depth; sanitizing-instead-of-validating is a vulnerability factory.

## Input Sources to Audit

1. HTTP request body (POST/PUT/PATCH)
2. Query parameters
3. Path parameters
4. Headers (Authorization, custom `X-*`, `Content-Type`, `Origin`, `Referer`)
5. Cookies (session id, CSRF token, preferences)
6. File uploads — filename, declared MIME, actual content, size
7. WebSocket frames
8. Form data (multi-part)
9. gRPC / Protobuf messages
10. Message-queue payloads (Kafka, SQS, RabbitMQ) — *even internal queues; assume hostile producer*
11. Webhook bodies (Stripe, GitHub, etc.) — validate signature *and* schema
12. Environment variables (validate at startup; fail fast if malformed)

## Validation Categories — 7-Language Coverage

### 1. Structured / Schema Validation (foundational — all 7 languages)

```python
# BAD (Python / FastAPI): handler accepts arbitrary dict
@app.post("/users")
def create_user(data: dict):
    db.insert(data)                                  # mass assignment, no type check

# SAFE: Pydantic v2 model enforces type, length, range, allowlist at the boundary
from pydantic import BaseModel, EmailStr, Field
from typing import Literal

class UserCreate(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=100)
    age: int = Field(ge=13, le=150)
    role: Literal["member", "admin"]
    model_config = {"extra": "forbid"}               # reject unknown keys (fail closed)

@app.post("/users")
def create_user(data: UserCreate):
    db.insert(data.model_dump())
```

```typescript
// BAD: Express handler reads req.body directly
app.post('/users', (req, res) => {
  db.insert(req.body);                              // anything goes — including isAdmin: true
});

// SAFE: Zod v4 schema; .strict() rejects unknown keys; parse throws on failure
import { z } from 'zod';

const UserCreate = z.object({
  email: z.email(),
  name: z.string().min(1).max(100),
  age: z.number().int().min(13).max(150),
  role: z.enum(['member', 'admin']),
}).strict();

app.post('/users', (req, res) => {
  const data = UserCreate.parse(req.body);          // throws 400 on invalid
  db.insert(data);
});

// SAFE (edge / size-sensitive): Valibot, ~90% smaller bundle than Zod
import * as v from 'valibot';
const UserCreateV = v.strictObject({
  email: v.pipe(v.string(), v.email()),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  age: v.pipe(v.number(), v.integer(), v.minValue(13), v.maxValue(150)),
  role: v.picklist(['member', 'admin']),
});
```

```csharp
// BAD (ASP.NET Core minimal API): no schema, no annotations
app.MapPost("/users", (User u, AppDb db) => { db.Users.Add(u); db.SaveChanges(); return Results.Ok(); });

// SAFE: DataAnnotations + DTO + FluentValidation + automatic 400 on failure
public record UserCreateDto(
    [EmailAddress] string Email,
    [Required, StringLength(100, MinimumLength = 1)] string Name,
    [Range(13, 150)] int Age,
    [RegularExpression("^(member|admin)$")] string Role);

public class UserCreateValidator : AbstractValidator<UserCreateDto> {
    public UserCreateValidator() {
        RuleFor(x => x.Email).EmailAddress();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Age).InclusiveBetween(13, 150);
        RuleFor(x => x.Role).Must(r => r is "member" or "admin");
    }
}

app.MapPost("/users", async (UserCreateDto dto, IValidator<UserCreateDto> v, AppDb db) => {
    var result = await v.ValidateAsync(dto);
    if (!result.IsValid) return Results.ValidationProblem(result.ToDictionary());
    db.Users.Add(new User(dto)); await db.SaveChangesAsync(); return Results.Ok();
});
```

```java
// BAD (Spring Boot): @RequestBody with no constraints
@PostMapping("/users")
public ResponseEntity<?> create(@RequestBody Map<String,Object> body) { repo.save(body); return ok(); }

// SAFE: Jakarta Bean Validation 3.0 (Hibernate Validator) on a typed DTO
public record UserCreateDto(
    @Email                                   String email,
    @NotBlank @Size(max = 100)               String name,
    @Min(13) @Max(150)                       int    age,
    @Pattern(regexp = "^(member|admin)$")    String role) {}

@PostMapping("/users")
public ResponseEntity<?> create(@Valid @RequestBody UserCreateDto dto) {
    repo.save(dto); return ok();
}
// Add @ControllerAdvice @ExceptionHandler(MethodArgumentNotValidException.class) -> 400.
```

```c
/* BAD: parsing a comma-separated user payload into a struct, no length check */
void handle(const char *body) {
    char name[64]; int age;
    sscanf(body, "%63[^,],%d", name, &age);          /* age has no range; name truncated silently */
    insert_user(name, age);
}

/* SAFE: explicit length + range + character-class allowlist before insert */
#include <ctype.h>
int validate_name(const char *s) {
    size_t n = strnlen(s, 101);
    if (n == 0 || n > 100) return 0;
    for (size_t i = 0; i < n; i++) {
        unsigned char c = (unsigned char)s[i];
        if (!(isalnum(c) || c == ' ' || c == '-')) return 0;   /* allowlist */
    }
    return 1;
}
int validate_age(long a) { return a >= 13 && a <= 150; }
```

```cpp
// BAD: nlohmann::json read straight into business logic
auto j = json::parse(body);
db.insert(j["email"].get<std::string>(), j["age"].get<int>());   // no validation, will throw on missing

// SAFE: validate against a JSON Schema (Draft 2020-12) via nlohmann/json-schema-validator
#include <nlohmann/json-schema.hpp>
using nlohmann::json_schema::json_validator;

static const json user_schema = R"({
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["email", "name", "age", "role"],
  "properties": {
    "email": {"type":"string","format":"email","maxLength":254},
    "name":  {"type":"string","minLength":1,"maxLength":100},
    "age":   {"type":"integer","minimum":13,"maximum":150},
    "role":  {"type":"string","enum":["member","admin"]}
  }
})"_json;

json_validator validator;
validator.set_root_schema(user_schema);
validator.validate(j);                              // throws on invalid
```

```sql
-- BAD: stored procedure with no parameter length / type narrowing
CREATE PROCEDURE CreateUser @email NVARCHAR(MAX), @name NVARCHAR(MAX), @age INT AS
BEGIN
  INSERT INTO Users(Email, Name, Age) VALUES (@email, @name, @age);
END;

-- SAFE: narrow types, CHECK constraints, table-level guarantees
CREATE TABLE Users (
  Email NVARCHAR(254) NOT NULL CHECK (Email LIKE '%_@__%.__%'),
  Name  NVARCHAR(100) NOT NULL CHECK (LEN(Name) BETWEEN 1 AND 100),
  Age   TINYINT       NOT NULL CHECK (Age BETWEEN 13 AND 150),
  Role  NVARCHAR(16)  NOT NULL CHECK (Role IN (N'member', N'admin'))
);
CREATE PROCEDURE CreateUser @email NVARCHAR(254), @name NVARCHAR(100), @age TINYINT, @role NVARCHAR(16) AS
BEGIN
  INSERT INTO Users(Email, Name, Age, Role) VALUES (@email, @name, @age, @role);
END;
```

### 2. String Validation — length, character class, normalization

```python
# BAD: no length cap → DoS via 1 GB string
username = request.json["username"]
db.insert(username)

# SAFE: NFC normalize → length cap → anchored regex allowlist
import unicodedata, re
USERNAME_RE = re.compile(r"\A[a-z0-9_]{3,32}\Z")    # anchored, bounded, explicit class
u = unicodedata.normalize("NFC", request.json["username"])
if not USERNAME_RE.match(u):
    raise ValueError("invalid username")
```

```typescript
// SAFE (TS): Zod with .regex anchored, length bounded, plus .transform for NFC
const Username = z.string()
  .transform(s => s.normalize('NFC'))
  .pipe(z.string().regex(/^[a-z0-9_]{3,32}$/));
```

### 3. Numeric Range — never trust a parsed integer

```python
# BAD: parse → use, no bounds
page = int(request.args["page"])
offset = (page - 1) * 100                            # page = 10^9 → giant offset → DoS
```

```csharp
// SAFE (C#): use TryParse + explicit range, or [Range] on the binding model
if (!int.TryParse(Request.Query["page"], out var page) || page < 1 || page > 10_000)
    return Results.BadRequest("page out of range");
```

### 4. Enum / Literal — finite allowlist

```typescript
// BAD: free string → switch silently falls through
const sort = req.query.sort as string;
// SAFE
const Sort = z.enum(['created_at', 'updated_at', 'name']);
const sort = Sort.parse(req.query.sort);
```

### 5. File Upload — MIME header + magic bytes + size + extension allowlist

> The single most common file-upload bug: trusting `Content-Type` (client-controlled) or extension. OWASP 2025: **always verify magic bytes server-side**, then re-encode via a format-specific parser. Beware polyglot files that satisfy two magic-byte tests simultaneously.

```python
# BAD: trust client extension
file = request.files["upload"]
if file.filename.endswith(".png"):
    file.save(f"/uploads/{file.filename}")           # attacker uploads shell.png that's actually PHP

# SAFE: size cap → magic-byte sniff → format-parse → store with server-generated name
import magic
ALLOWED = {"image/png": b"\x89PNG\r\n\x1a\n",
           "image/jpeg": b"\xff\xd8\xff"}
MAX = 5 * 1024 * 1024                               # 5 MB

data = file.read(MAX + 1)
if len(data) > MAX: raise ValueError("too large")
mime = magic.from_buffer(data, mime=True)           # libmagic — reads actual bytes
if mime not in ALLOWED or not data.startswith(ALLOWED[mime]):
    raise ValueError("disallowed file type")
# Re-encode through PIL to strip metadata + reject polyglots
from PIL import Image; import io, secrets
img = Image.open(io.BytesIO(data)); img.verify()
safe_name = f"{secrets.token_hex(16)}.{mime.split('/')[1]}"
img.save(f"/var/uploads/{safe_name}")
```

```csharp
// SAFE (C#): magic-byte check via byte[] inspection + size cap, server-generated filename
static readonly Dictionary<string, byte[]> MagicBytes = new() {
    ["image/png"]  = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
    ["image/jpeg"] = [0xFF, 0xD8, 0xFF],
};
app.MapPost("/upload", async (IFormFile file) => {
    if (file.Length > 5 * 1024 * 1024) return Results.BadRequest("too large");
    await using var s = file.OpenReadStream();
    var head = new byte[8]; await s.ReadAsync(head);
    var match = MagicBytes.FirstOrDefault(kv => head.Take(kv.Value.Length).SequenceEqual(kv.Value));
    if (match.Key is null) return Results.BadRequest("disallowed type");
    var safeName = $"{Convert.ToHexString(RandomNumberGenerator.GetBytes(16))}.{match.Key.Split('/')[1]}";
    // re-encode through System.Drawing / ImageSharp to strip metadata
    return Results.Ok(new { name = safeName });
});
```

### 6. Email / URL / UUID — semantic + structural

```python
# Bad: rolling your own email regex
# Good: use a library that follows RFC 5321/5322 (e.g. email-validator)
from email_validator import validate_email
addr = validate_email(input_email, check_deliverability=False).normalized   # NFC + lowercased domain
```

```typescript
// URL: never accept arbitrary URLs unchecked — block scheme + private CIDRs (SSRF defense)
const u = new URL(input);
if (u.protocol !== 'https:') throw new Error('https only');
// Resolve hostname and reject RFC 1918, loopback, link-local before fetching (see sast-scanner SSRF section).

// UUID: structural check
const Uuid = z.uuid({ version: 'v4' });             // Zod v4
```

### 7. Internationalization — Unicode + IDN homograph

```python
# BAD: identifier comparisons on raw input — "аdmin" (Cyrillic 'а') != "admin" (Latin 'a')
if username == "admin": grant_admin()

# SAFE: NFC normalize, restrict to single script for security-sensitive fields
import unicodedata
def safe_username(s: str) -> str:
    s = unicodedata.normalize("NFC", s)
    scripts = {unicodedata.name(c, "").split(" ")[0] for c in s if c.isalpha()}
    if len(scripts) > 1: raise ValueError("mixed scripts")    # IDN homograph defense
    return s.casefold()
```

For domains, use **IDNA 2008** (UTS #46) processing. Reject domains where the rendered form differs from the registered ASCII (`punycode`).

### 8. Business-Rule Validation — runs AFTER schema validation

Schema validation answers "is this well-formed?". Business-rule validation answers "is this allowed *for this user, in this state, at this time*?".

```csharp
// SAFE: schema-valid order, but business rule rejects negative discount stacking
public record OrderDto([Range(0.01, 100000)] decimal Total,
                      [Range(0, 100)]        decimal DiscountPct);

if (dto.Total * (1 - dto.DiscountPct / 100) < cost) return Results.BadRequest("below cost");
if (await db.Orders.CountAsync(o => o.UserId == userId && o.CreatedAt > today) > 50)
    return Results.BadRequest("daily order limit");
```

Business rules belong in a domain service, not in the controller. Schema validation is data shape; business validation is policy.

## Validation Library Landscape (2026)

| Language / runtime | Library | Notes |
|---|---|---|
| Python 3.12+ | **Pydantic v2** | Rust core; default for FastAPI; `model_config = {"extra": "forbid"}` enforces fail-closed. Also `attrs` + `cattrs` for non-FastAPI codebases. |
| TypeScript / JS | **Zod v4** | Most ergonomic; `.strict()` rejects unknown keys; v4 is a substantial perf step over v3. |
| TypeScript / JS (edge) | **Valibot** | Tree-shakable; bundle is a large fraction smaller than Zod — choose for Cloudflare Workers, browser, React Native. |
| TypeScript / JS (schema-first) | **TypeBox** | Outputs JSON Schema Draft 2020-12 directly; choose when OpenAPI generation matters; pairs with Ajv. |
| TypeScript / JS (runtime alt) | **ArkType** | TS-syntax-as-schema; competitive speed; smaller ecosystem than Zod. |
| C# / .NET 9 | **DataAnnotations** + **FluentValidation 11** | DataAnnotations for declarative; FluentValidation for complex/business rules. `System.ComponentModel.DataAnnotations` is built-in. |
| Java 21+ | **Jakarta Bean Validation 3.0** (Hibernate Validator) | `@Valid` on the controller arg + DTO constraints; Spring auto-binds 400 on failure. |
| C / C++ | **JSON Schema Draft 2020-12** | Via `nlohmann/json-schema-validator` (C++) or `ajv-c` / hand-rolled checks (C). No "framework" — discipline-driven. |
| Schema-first (cross-lang) | **Protobuf** + `protovalidate` | Wire-format + validation rules in `.proto`; one source of truth across services. |
| Schema-first (HTTP) | **OpenAPI 3.1** (uses JSON Schema 2020-12) | Generate validators from the spec; reject anything that doesn't conform at the gateway. |
| SQL | **CHECK constraints + narrow column types** | Last line of defense — even if the app forgets, the DB refuses. |

**Pick one per stack and enforce in PR review.** Mixing two libraries in one service is a code-review smell.

## Common Gaps

| Input | Gap | Risk | OWASP |
|-------|-----|------|-------|
| JSON body | No schema | Mass assignment, unexpected types | A04 |
| File upload | Extension or `Content-Type` only | Polyglot RCE, malicious upload | A04 |
| Path parameter | No format validation | Path traversal, IDOR | A01 |
| Pagination | No bounds on `page` / `limit` | DoS via giant offset | A04 |
| Search query | No length cap, no sanitization | ReDoS, XSS on reflection | A03 |
| Header (`X-Forwarded-For`) | Trusted without validation | IP spoofing, rate-limit bypass | A04 |
| Numeric string | `int(x)` with no range | Integer overflow, DoS | A04 |
| Username / email | No NFC normalize | IDN homograph, comparison bypass | A07 |
| Webhook body | Signature checked, schema not | Forged payloads w/ extra fields | A08 |
| Env var | Loaded as string, no validation | Misconfig in prod | A05 |

## Scan Methodology

### Phase 1 — pattern scan (find unvalidated reads)

```bash
# Python — handlers reading raw request data
rg -n "request\.(args|json|form|files|headers)" --type py
rg -n "request\.get_json\(\)" --type py

# JS/TS — Express/Fastify/Hono handlers without parse()
rg -n "req\.(body|query|params|headers|cookies)" --type ts --type js
rg -n "request\.body" --type ts --type js

# C# — minimal-API and MVC controllers
rg -n "Request\.(Query|Form|Headers|Body)" -g '*.cs'
rg -n "\[FromBody\]|\[FromQuery\]|\[FromForm\]" -g '*.cs'

# Java — Spring controllers
rg -n "@RequestBody|@RequestParam|@PathVariable|@RequestHeader" -g '*.java'

# File uploads
rg -n "IFormFile|MultipartFile|request\.files|formidable|multer" .
```

### Phase 2 — schema-coverage check

For each match: does the handler arg have a **typed schema** (Pydantic, Zod, DTO + Bean Validation, DataAnnotations, JSON Schema), and does that schema have an **explicit allowlist** of fields (`extra=forbid` / `.strict()` / `additionalProperties: false`)? If no, flag.

### Phase 3 — file-upload deep dive

For every upload handler: confirm size cap, magic-byte check, and that the saved filename is server-generated (not derived from `file.filename`).

### Phase 4 — boundary inventory

Cross-check the route table (FastAPI `app.routes`, Express `_router.stack`, ASP.NET Core endpoint datasource, Spring `RequestMappingHandlerMapping`) against the set of handlers with schemas. The delta is your "unvalidated endpoints" list.

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when you produce a human-readable scan report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization, but the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action |
|---|---|---|
| CRITICAL | Unvalidated body on auth/payment/file-upload/SQL-bound handler; raw `request.body` reaching `eval`/`exec`/raw SQL/template render | BLOCK |
| HIGH | Numeric param with no range on pagination/limit; file upload validated by extension only; header trusted without check | BLOCK |
| MEDIUM | String length unbounded; enum implemented as `if` chain (drift risk); Unicode normalization missing on identifier fields | Fix soon |
| LOW | Validation present but denylist-based; schema does not set `additionalProperties: false`; error messages too verbose | Backlog |

## Output Format

```markdown
## Input Validation Report

### Endpoints Analyzed: 45
- Fully validated (schema + allowlist + bounds): 38
- Partially validated: 5
- Unvalidated: 2

### CRITICAL
1. **POST /api/users** (`routes/users.ts:23`) — OWASP A04, CWE-20
   - Source: `req.body`
   - Validator present: false
   - Strategy: none
   - Risk: mass assignment (caller can set `isAdmin: true`), type confusion, DoS via giant payload
   - Fix:
   ```typescript
   const UserCreate = z.object({
     email: z.email(),
     name: z.string().min(1).max(100),
   }).strict();
   const data = UserCreate.parse(req.body);
   ```

2. **POST /api/upload** (`routes/files.ts:45`) — OWASP A04, CWE-434
   - Source: `request.files["file"]`
   - Strategy: extension allowlist only (no magic bytes, no size cap)
   - Risk: polyglot upload, RCE on misconfigured server
   - Fix: see "File Upload" section above (magic bytes + size cap + server-generated name + re-encode).

### Coverage
- Schema present: 85%
- Allowlist (`extra=forbid` / `.strict()` / `additionalProperties: false`): 60%
- Length / range bounds on every string/int: 70%
- File uploads with magic-byte check: 30%
- **Overall: 61%**
```

## Tool Integration (2026 landscape)

| Layer | Tool | Use |
|---|---|---|
| Python | `bandit` (gaps in input handling) + `mypy --strict` (type-level checks) + Pydantic in app | Static + runtime |
| TS / JS | `eslint-plugin-security`, `tsc --strict`, Zod / Valibot / TypeBox in app | Static + runtime |
| C# / .NET 9 | Roslyn analyzers (`Microsoft.CodeAnalysis.NetAnalyzers` with `<AnalysisMode>All</AnalysisMode>`), Security Code Scan, DataAnnotations + FluentValidation in app | Static + runtime |
| Java 21+ | SpotBugs + FindSecBugs, ErrorProne, Bean Validation in app | Static + runtime |
| C / C++ | Clang-Tidy (`bugprone-*`, `cert-*`), Coverity / CodeQL, JSON Schema validator in app | Static + runtime |
| Schema-first | **Ajv 8+** (JSON Schema 2020-12), **protovalidate** (Protobuf), OpenAPI 3.1 request validation at the gateway (Kong, Envoy, AWS API Gateway) | Wire-edge |
| SAST corroboration | [[sast-scanner]] confirms that unvalidated input reaches an unsafe sink. This skill flags the *absence of validation*; sast-scanner flags the *reachable sink*. Two letters on the same finding = high confidence. |

OpenAPI / JSON Schema at the gateway is a force multiplier: one source of truth generates the spec, the server validator, the client SDK, and the docs. If the gateway rejects malformed input before it reaches the handler, every handler gets a defense-in-depth layer for free.

## Letter Schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+type)[:12]>    # fingerprint for dedup
severity: critical                                   # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                      # high = corroborated by sast-scanner; low = single-tool
engine: input-validation-checker
rule_id: ivc.no-schema | ivc.no-allowlist | ivc.no-bounds | ivc.upload-no-magic | ivc.no-nfc | ivc.denylist
owasp: A03 | A04 | A05 | A07 | A08 | A10
cwe: CWE-20 | CWE-79 | CWE-89 | CWE-434 | CWE-502 | CWE-915 | CWE-918
file: src/api/user.py
line: 42
input_source: request.body | request.query | request.path | request.header | request.cookie | request.form | request.file | websocket | grpc | mq | webhook | env
validator_present: true | false
validation_strategy: allowlist | denylist | none
bounds_present: true | false                         # length / range caps
unknown_keys_rejected: true | false | n/a            # extra=forbid / .strict() / additionalProperties:false
reachable: true | false | unknown                    # cross-checked with sast-scanner
corroborated_by: [sast-scanner]                      # empty list if single-source
delta_to_baseline: new | unchanged | regressed
message: "POST /api/users reads req.body with no schema; mass assignment possible."
fix: "Define a Zod .strict() schema, parse req.body, then pass the typed result downstream."
reference: https://owasp.org/Top10/A04_2021-Insecure_Design/
```

The integrator uses `confidence` and `corroborated_by` to weight findings — an `ivc.no-schema` finding corroborated by a `sast-scanner` SQL-injection finding on the same line is the highest-priority bucket. `reachable: false` (handler exists but is unmounted / behind a feature flag) keeps the finding `severity: critical` on the wire but lets the integrator defer it.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
