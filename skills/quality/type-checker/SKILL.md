---
name: type-checker
description: Static type analysis — strict-mode type checking across 7 languages, with parse-don't-validate and newtype/branded-type enforcement.
type: skill
when_to_load:
  - "type check"
  - "type errors"
  - "type safety"
  - "mypy"
  - "tsc"
  - "pyright"
  - "static type check"
  - "any types"
  - "nullable reference"
  - "branded types"
  - "newtype"
  - "exhaustiveness"
related_skills:
  - quality/code-reviewer
  - quality/quality-gate
  - security/sast-scanner
effort_level: medium
model_optimized_for: opus-4-7
tools: Bash, Read, Grep, Glob
model: sonnet
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Type Checker (skill)

> Converted from agents/quality/type-checker.md as part of CTOC v7 B2 leaf-node sweep. Refreshed against 2026 best practices in the v6.9.x sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You are a static-type analyst. You run language-aware type checkers in strict mode, find type-system escape hatches (`any`, `dynamic`, `void*`, `Object`, `!`, `as`, `# type: ignore`), and verify that domain invariants are encoded in the type system rather than enforced at runtime. Type errors found here cost a build; the same bug found in production costs an incident.

Type checking is the cheapest quality gate available — measured in milliseconds, not seconds. It runs in Step 8 (QUALITY) but should also run on every save in the IDE and on every PR.

## 2026 Best Practices (Quality category)

Five pillars served: **reliability** + **maintainability** + **correctness**.

- **Strict mode is the default**: `mypy --strict`, `tsc --strict`, `<Nullable>enable</Nullable>` + `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>`, `cargo clippy -D warnings`, `clang -Wall -Wextra -Wpedantic -Werror`. Loose mode hides bugs that strict mode would catch at compile time. Retrofitting strict onto a large untyped codebase is painful; **starting strict from day one is nearly free**.
- **Treat escape hatches as code smell**: `any` (TS), `dynamic` (C#), `void*` (C/C++), `Object` (Java, when used as a stand-in for a generic type), `Any` (Python), `!` (TS non-null assertion), `as` (TS unsafe cast), `# type: ignore` (mypy), `@SuppressWarnings("unchecked")` (Java). Each occurrence requires a justification comment naming the invariant that makes it safe. Unjustified escape hatches are findings.
- **Parse, don't validate** (Alexis King, 2019): encode invariants in types at the boundary, then trust the type system internally. A function that accepts `Email` can never receive a malformed email — the impossibility is structural, not behavioral. Validation functions that return `bool` lose information; parsers that return a refined type preserve it.
- **Newtype / branded types for domain primitives**: `UserId` is not `string`. `Cents` is not `number`. Different IDs that share a representation should not be assignable to each other. Use `NewType` (Python), branded types (TS), `record struct` (C#), value classes (Kotlin/Java), strong typedef wrappers (C++), `_Generic` selectors (C). The compiler should reject `chargeUser(orderId)` even if both are `string` underneath.
- **Exhaustiveness on tagged unions**: every `switch` / `match` over a discriminated union must be exhaustive. The compiler should fail when a new variant is added and a call site forgets to handle it. Tools: TS `assertNever` pattern, Python `typing.assert_never` (added in 3.11), C# switch expressions with explicit type patterns, Java sealed classes + `switch` patterns (JEP 440/441, GA in Java 21), Rust `match` (already exhaustive by language design).
- **Self-documenting types over inline structural**: prefer named aliases (`type Email = Branded<string, "Email">`) over inline shapes (`{ value: string; isEmail: true }`). Names document intent; structural types document syntax.
- **DRY in types**: shared shapes get a shared definition. Re-declared interfaces drift.
- **Manual + automated**: automated checkers catch syntactic type errors; humans catch semantic mismatches ("the type is right but the type is wrong for what we mean" — e.g., `string` for an email, `int` for cents-vs-dollars, `Date` for an instant-vs-local-date).
- **Type tests are tests**: use `expect-type`, `tsd`, `assert_type` (Python 3.11+), or `static_assert` (C++) to lock down inferred shapes. Type regressions are silent without them.

## What to Check (category catalog)

The refinement-loop letter's `type_kind` field is drawn from this list. Each category has a strict-mode flag in at least one mainstream checker.

| `type_kind` | Description | Triggering flags |
|---|---|---|
| `implicit_any` | A binding inferred as `any` because no annotation was provided | `noImplicitAny` (tsc), `disallow_untyped_defs` (mypy), `reportMissingTypeStubs` (pyright) |
| `dynamic_type` | Use of a deliberately untyped type (`dynamic` C#, `Any` Py, `unknown` TS without narrowing) | per-tool warnings; manual rule |
| `null_violation` | Reference assumed non-null where the type allows null | `strictNullChecks` (tsc), `<Nullable>enable</Nullable>` (C#), mypy default |
| `unsafe_cast` | Cast that bypasses the type system without runtime check | `noImplicitOverride`, `noUncheckedIndexedAccess`, `as any` audit |
| `non_exhaustive_union` | Switch/match on a discriminated union missing a variant | `noFallthroughCasesInSwitch` (tsc), pyright `reportMatchNotExhaustive`, Java `--enable-preview` + sealed `switch` |
| `generic_variance` | Variance violation (covariant where contravariant expected, or vice versa) | tsc `strictFunctionTypes`, mypy `--strict` |
| `runtime_type_check_needed` | Boundary input (HTTP body, JSON, env var) used as a typed value without parse | manual — pair with parse-don't-validate audit |
| `escape_hatch_unjustified` | `any` / `dynamic` / `// @ts-ignore` / `# type: ignore` / `!` without a comment explaining the invariant | tsc `noImplicitAny`, mypy `warn_unused_ignores`, ESLint `@typescript-eslint/no-explicit-any` |
| `missing_return_type` | Function without an explicit return type annotation | mypy `disallow_untyped_defs`, ESLint `@typescript-eslint/explicit-function-return-type` |
| `unused_ignore` | `# type: ignore` / `@ts-expect-error` whose underlying error no longer exists | mypy `warn_unused_ignores`, tsc `@ts-expect-error` (errors if unused by design) |
| `weak_typing_idiom` | `string` for `Email`, `number` for `Cents`, primitive obsession | manual — newtype audit |
| `domain_invariant_unencoded` | Validation done by `if`/`assert` rather than at the type level (parse-don't-validate violation) | manual — boundary audit |

## Per-language BAD / SAFE examples (7 languages)

The seven languages CTOC commits to maintaining first-class type coverage for. Order matches the sast-scanner convention.

### C# (.NET 9 / C# 13) — nullable reference types, generics, records

```csharp
// BAD: nullable not enabled; UserId is a primitive
public record User(string UserId, string Email, string? DisplayName);
public User? FindUser(string userId) => _db.Users.FirstOrDefault(u => u.UserId == userId);
public void Charge(string userId, int cents) { /* userId/orderId/cents indistinguishable */ }

// BAD: dynamic short-circuits the type system
dynamic payload = JsonSerializer.Deserialize<dynamic>(body)!;
Charge(payload.userId, payload.cents);   // runtime errors only
```

```csharp
// SAFE: nullable enable; newtype primitives via record struct; parse at boundary
#nullable enable

public readonly record struct UserId(string Value);
public readonly record struct OrderId(string Value);
public readonly record struct Cents(long Value);
public readonly record struct Email
{
    public string Value { get; }
    private Email(string v) => Value = v;
    public static Email Parse(string raw) =>
        MailAddress.TryCreate(raw, out _) ? new Email(raw) : throw new ArgumentException(nameof(raw));
}

public sealed record User(UserId Id, Email Email, string? DisplayName);

public User? FindUser(UserId id) => _db.Users.FirstOrDefault(u => u.Id == id);

// Exhaustive switch over a sealed hierarchy (C# 9+ + switch expressions)
public abstract record PaymentResult;
public sealed record Approved(string AuthCode) : PaymentResult;
public sealed record Declined(string Reason)   : PaymentResult;
public sealed record Pending(TimeSpan RetryIn) : PaymentResult;

public string Describe(PaymentResult r) => r switch
{
    Approved a => $"OK {a.AuthCode}",
    Declined d => $"NO {d.Reason}",
    Pending  p => $"WAIT {p.RetryIn}",
    // No default: compiler emits CS8509 if a case is missed
};
```

Project config — make the analyzers loud:

```xml
<PropertyGroup>
  <Nullable>enable</Nullable>
  <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
  <AnalysisMode>All</AnalysisMode>
  <AnalysisLevel>latest</AnalysisLevel>
  <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
</PropertyGroup>
```

### Java (21+) — sealed classes, records, pattern matching

```java
// BAD: raw type, primitive obsession, no exhaustiveness
public class PaymentResult {
    public String status;        // "approved" / "declined" / "pending" — typo-prone
    public String detail;
}
public void handle(PaymentResult r) {
    if (r.status.equals("approved")) { /* ... */ }
    else if (r.status.equals("declined")) { /* ... */ }
    // forgot "pending" — silent
}
```

```java
// SAFE: sealed hierarchy + records + exhaustive switch (Java 21 GA — JEP 440/441)
public sealed interface PaymentResult permits Approved, Declined, Pending {}
public record Approved(String authCode)        implements PaymentResult {}
public record Declined(String reason)          implements PaymentResult {}
public record Pending(java.time.Duration retryIn) implements PaymentResult {}

public String describe(PaymentResult r) {
    return switch (r) {
        case Approved a -> "OK "   + a.authCode();
        case Declined d -> "NO "   + d.reason();
        case Pending  p -> "WAIT " + p.retryIn();
        // No default: javac flags non-exhaustive at compile time
    };
}

// Newtype-ish via records — UserId is not OrderId
public record UserId(String value) {
    public UserId { java.util.Objects.requireNonNull(value); }
}
public record OrderId(String value) {
    public OrderId { java.util.Objects.requireNonNull(value); }
}
```

Tool config: `javac --release 21 -Xlint:all -Werror`, plus ErrorProne and NullAway for nullness annotations (`@Nullable` / `@NonNull`). For genuine exhaustiveness, prefer sealed + switch patterns over `instanceof` ladders.

### Python (3.12+) — PEP 695 type params, mypy strict, Pyright

```python
# BAD: implicit Any, primitive obsession, validation-not-parsing
def find_user(user_id):                       # no annotations -> Any
    return db.users.get(user_id)

def charge(user_id: str, order_id: str, cents: int) -> None:
    # user_id and order_id interchangeable; cents could be negative
    ...

# Validation that throws away information
def is_email(s: str) -> bool:
    return "@" in s
if is_email(raw):
    send_mail(raw)   # raw is still `str`, not `Email`
```

```python
# SAFE: PEP 695 type params, NewType for IDs, parse-don't-validate
from typing import NewType, assert_never
from dataclasses import dataclass
from email.utils import parseaddr

UserId  = NewType("UserId",  str)
OrderId = NewType("OrderId", str)
Cents   = NewType("Cents",   int)

@dataclass(frozen=True, slots=True)
class Email:
    value: str
    @classmethod
    def parse(cls, raw: str) -> "Email":
        name, addr = parseaddr(raw)
        if "@" not in addr:
            raise ValueError(f"not an email: {raw!r}")
        return cls(addr)

# PEP 695 generic syntax (Python 3.12+) — scoped, no module-level TypeVar
def first[T](xs: list[T]) -> T | None:
    return xs[0] if xs else None

# Tagged-union exhaustiveness via match + assert_never
from dataclasses import dataclass
@dataclass(frozen=True)
class Approved: auth_code: str
@dataclass(frozen=True)
class Declined: reason: str
@dataclass(frozen=True)
class Pending:  retry_seconds: int

PaymentResult = Approved | Declined | Pending

def describe(r: PaymentResult) -> str:
    match r:
        case Approved(auth_code=c): return f"OK {c}"
        case Declined(reason=x):    return f"NO {x}"
        case Pending(retry_seconds=s): return f"WAIT {s}"
        case _ as other: assert_never(other)   # mypy/pyright error if a variant is added
```

`pyproject.toml`:
```toml
[tool.mypy]
strict = true
warn_return_any = true
warn_unused_ignores = true
disallow_untyped_defs = true
disallow_any_explicit = true
disallow_any_generics = true
no_implicit_reexport = true

[tool.pyright]
typeCheckingMode = "strict"
reportMissingTypeStubs = "error"
reportUnknownMemberType = "error"
reportMatchNotExhaustive = "error"
```

Use **pyright for new projects** (faster, better inference, native PEP 695 support); mypy where stability and tooling integration matter most. Run both in CI when budget allows — they catch slightly different categories.

### C (C17 / C23) — `_Generic`, `static_assert`, restrict

```c
/* BAD: void*, no compile-time discrimination, magic ints */
void charge(int user_id, int order_id, int cents);   /* all three indistinguishable */

void *find_thing(void *table, void *key) {            /* type-erased */
    /* caller casts the result and hopes */
}
```

```c
/* SAFE: opaque struct wrappers, _Generic for compile-time dispatch, static_assert for invariants */
#include <assert.h>          /* C11+ static_assert in <assert.h> as keyword in C23 */
#include <stdint.h>

typedef struct { int64_t v; } user_id_t;
typedef struct { int64_t v; } order_id_t;
typedef struct { int64_t v; } cents_t;

static_assert(sizeof(cents_t) == sizeof(int64_t), "cents wrapper must be ABI-equal");

/* Constructors enforce parsing */
static inline cents_t cents_make(int64_t n) {
    /* refuse negative at the boundary */
    if (n < 0) { /* return sentinel or fail loudly */ }
    return (cents_t){n};
}

/* user_id and order_id no longer interchangeable */
void charge(user_id_t user, order_id_t order, cents_t amount);

/* _Generic gives compile-time type dispatch — C11+, polished in C23 */
#define id_value(x) _Generic((x),               \
    user_id_t:  (x).v,                          \
    order_id_t: (x).v)                          \

/* restrict promises non-aliasing — type-system-adjacent guarantee */
void copy_bytes(char * restrict dst, const char * restrict src, size_t n);
```

Build flags: `clang -std=c23 -Wall -Wextra -Wpedantic -Wshadow -Wconversion -Wstrict-prototypes -Werror`, plus `clang-tidy` with `clang-analyzer-*` and `bugprone-*` checks enabled. `-fsanitize=undefined` for runtime catches of what the type system can't.

### C++ (20 / 23) — concepts, constexpr if, ranges, `consteval`

```cpp
// BAD: untyped template, raw primitive params, no parse boundary
template <typename T>
T sum(T a, T b) { return a + b; }                  // accepts anything with +; bad errors

void charge(int user_id, int order_id, int cents); // indistinguishable primitives

void parse_json(const std::string &body) {
    auto j = nlohmann::json::parse(body);
    charge(j["user"], j["order"], j["cents"]);     // ints fall through; no validation
}
```

```cpp
// SAFE: concept-constrained template, strong typedefs, consteval invariants
#include <concepts>
#include <ranges>
#include <expected>            // C++23

template <typename T>
concept Addable = requires(T a, T b) { { a + b } -> std::same_as<T>; };

template <Addable T>
constexpr T sum(T a, T b) { return a + b; }        // concept-bounded, clear error if violated

// Strong typedefs — the "passkey" / NamedType pattern
template <typename T, typename Tag>
struct StrongId {
    T value;
    constexpr explicit StrongId(T v) : value(v) {}
    auto operator<=>(const StrongId&) const = default;
};
using UserId  = StrongId<int64_t, struct UserIdTag>;
using OrderId = StrongId<int64_t, struct OrderIdTag>;
using Cents   = StrongId<int64_t, struct CentsTag>;

void charge(UserId u, OrderId o, Cents c);
// charge(OrderId{1}, UserId{2}, Cents{3});   // compile error — types don't match

// Parse-don't-validate at the boundary with std::expected
struct Email { std::string value; };
constexpr std::expected<Email, std::string> parse_email(std::string_view sv) {
    if (sv.find('@') == std::string_view::npos)
        return std::unexpected("not an email");
    return Email{std::string(sv)};
}

// consteval forces compile-time-only — invariant proven before runtime
consteval int answer() { return 42; }
static_assert(answer() == 42);
```

Build flags: `clang++ -std=c++23 -Wall -Wextra -Wpedantic -Wshadow -Wnon-virtual-dtor -Wold-style-cast -Wconversion -Wsign-conversion -Wnull-dereference -Werror`, plus `clang-tidy` with `cppcoreguidelines-*`, `modernize-*`, `bugprone-*`.

### TypeScript (5.6+) — strict mode, no any, branded types

```typescript
// BAD: implicit any, primitive obsession, validation-not-parsing
function findUser(id) {                            // implicit any
    return db.users.find(u => u.id === id);
}

function charge(userId: string, orderId: string, cents: number) {
    // userId / orderId interchangeable; cents can be negative
}

function isEmail(s: string): boolean { return s.includes("@"); }
// `if (isEmail(raw)) send(raw)` — raw stays `string`, info thrown away

// BAD: escape hatches without justification
const user = response.data as User;                // unsafe cast
const x = (window as any).legacyGlobal;            // any leak
const y = list[0]!.name;                           // non-null assertion w/o noUncheckedIndexedAccess
```

```typescript
// SAFE: branded types, Opaque pattern, parse-don't-validate, exhaustiveness
declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

type UserId  = Brand<string, "UserId">;
type OrderId = Brand<string, "OrderId">;
type Cents   = Brand<number, "Cents">;
type Email   = Brand<string, "Email">;

const parseEmail = (raw: string): Email => {
    if (!raw.includes("@")) throw new Error(`not an email: ${raw}`);
    return raw as Email;        // sole legitimate cast — at the parse boundary
};

function charge(u: UserId, o: OrderId, c: Cents): void { /* ... */ }
// charge(orderId, userId, 100);  // compile error — UserId !== OrderId

// Exhaustiveness via assertNever
type PaymentResult =
    | { kind: "approved"; authCode: string }
    | { kind: "declined"; reason: string }
    | { kind: "pending";  retryMs: number };

function assertNever(x: never): never { throw new Error("unhandled: " + JSON.stringify(x)); }

function describe(r: PaymentResult): string {
    switch (r.kind) {
        case "approved": return `OK ${r.authCode}`;
        case "declined": return `NO ${r.reason}`;
        case "pending":  return `WAIT ${r.retryMs}`;
        default: return assertNever(r);       // compile error if a variant added
    }
}
```

`tsconfig.json` — flags worth turning on in 2026:

```jsonc
{
  "compilerOptions": {
    "strict": true,                              // turns on the 8 strict-family flags
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "useUnknownInCatchVariables": true,
    "alwaysStrict": true,

    // The flags strict doesn't include but you almost always want:
    "noUncheckedIndexedAccess": true,            // arr[0] becomes T | undefined
    "exactOptionalPropertyTypes": true,          // { x?: T } cannot be set to undefined explicitly
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitOverride": true,
    "noEmit": true
  }
}
```

ESLint pairs: `@typescript-eslint/no-explicit-any`, `no-non-null-assertion`, `no-unsafe-assignment`, `consistent-type-imports`, `strict-boolean-expressions`. Prefer `unknown` + narrowing over `any`.

### SQL (strict mode, type coercion gotchas)

```sql
-- BAD: implicit coercion, NULL-vs-empty ambiguity, no CHECK constraints
CREATE TABLE orders (
    id           VARCHAR(64),                -- could be UUID; isn't typed
    user_id      VARCHAR(64),                -- same shape as order id; conflatable
    amount_cents INT,                        -- can be negative; can be NULL
    status       VARCHAR(32)                 -- free-form string for an enum
);

-- BAD: implicit string-to-int coercion (works on MySQL with default flags; fails on Postgres)
SELECT * FROM orders WHERE id = 42;          -- id is VARCHAR; '42' compared as text
-- BAD: NULL comparison via = always false; misses rows
SELECT * FROM orders WHERE status = NULL;
```

```sql
-- SAFE: domain types, CHECK constraints, exhaustive enum
CREATE TYPE order_status AS ENUM ('pending', 'approved', 'declined', 'refunded');

CREATE DOMAIN user_id  AS UUID;
CREATE DOMAIN order_id AS UUID;
CREATE DOMAIN cents    AS BIGINT CHECK (VALUE >= 0);

CREATE TABLE orders (
    id           order_id    PRIMARY KEY,
    user_id      user_id     NOT NULL REFERENCES users(id),
    amount_cents cents       NOT NULL,
    status       order_status NOT NULL DEFAULT 'pending',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SAFE: explicit NULL handling; explicit casts only
SELECT * FROM orders WHERE id = '550e8400-e29b-41d4-a716-446655440000'::order_id;
SELECT * FROM orders WHERE status IS NULL;

-- Strict mode (Postgres is strict by default; for MySQL):
SET sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- Type-checked migrations: sqitch, dbt with type tests, or sqlc-generated code
-- sqlc converts SQL into typed Go/TypeScript; type mismatches between query and schema fail the build.
```

Gotchas to flag: `BIGINT` -> `JS Number` truncation (use string IDs at the API edge); `TIMESTAMP` vs `TIMESTAMPTZ` (always prefer TZ-aware); `VARCHAR(n)` chosen for storage rather than meaning; missing `NOT NULL`; missing `CHECK`; `JSONB` columns used as a type-free escape hatch.

## Tool Integration (2026)

| Language | Primary | Secondary | Notes |
|---|---|---|---|
| TypeScript | `tsc --noEmit --strict` (5.6+) | `eslint @typescript-eslint`, `expect-type`, `tsd` | `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are the two flags `strict` doesn't include but you want |
| Python | `mypy --strict` or `pyright --strict` | `bandit` (security overlap), `ruff` (lint) | Prefer **pyright for new projects** (faster, better PEP 695 support); mypy where stability and tooling integration matter most |
| C# / .NET | `dotnet build /warnaserror` (.NET 9) | `Microsoft.CodeAnalysis.NetAnalyzers`, `Nullable.Extended.Analyzer`, Roslynator | `<Nullable>enable</Nullable>` + `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>` + `<AnalysisMode>All</AnalysisMode>` |
| Java | `javac --release 21 -Xlint:all -Werror` | `ErrorProne`, `NullAway`, `Checker Framework` | Sealed + switch patterns (JEP 440/441) provide compiler-enforced exhaustiveness |
| C | `clang -std=c23 -Wall -Wextra -Wpedantic -Wconversion -Werror` | `clang-tidy`, `clang-analyzer`, Cppcheck | `static_assert` for compile-time invariants; UBSan for runtime catches |
| C++ | `clang++ -std=c++23 -Wall -Wextra -Wpedantic -Wshadow -Wnon-virtual-dtor -Wold-style-cast -Wconversion -Werror` | `clang-tidy` with `cppcoreguidelines-*` `modernize-*` `bugprone-*` | Concepts for template bounds; `consteval` for compile-time-only |
| SQL | `psql --set ON_ERROR_STOP=on` for Postgres; `SET sql_mode='STRICT_ALL_TABLES,...'` for MySQL | `sqlfluff` (lint), `sqlc` (generates typed code from SQL), `dbt` tests | Domain types + CHECK constraints + ENUM, never `VARCHAR` for enums |
| Rust | `cargo check`, `cargo clippy -D warnings` | `cargo-deny`, `cargo-udeps` | Rustc itself is the strictest mainstream type checker; exhaustiveness is the language default |
| Go | `go build ./...`, `go vet ./...`, `gopls check` | `staticcheck`, `golangci-lint`, `nilaway` | Go's type system is weaker; pair with linters that emulate sum types via interfaces |
| Ruby | `srb tc` (Sorbet) or `steep check` (RBS) | RuboCop with Sorbet plugin | Gradual typing — start with `# typed: false`, ratchet to `# typed: strict` |

Aggregate type-check output as **SARIF** where the tool supports it (pyright, ESLint, clang-tidy, Roslyn analyzers do; mypy via `mypy-to-sarif`) so findings land in the GitHub code-scanning dashboard alongside SAST.

```bash
# CI snippets — fail the build on any type error or any newly-introduced warning

# TypeScript
tsc --noEmit                                          # zero output on success

# Python (mypy)
mypy --strict --warn-unused-ignores src/ tests/
# Python (pyright)
pyright --outputjson | jq '.summary.errorCount == 0'

# C# / .NET
dotnet build -warnaserror -p:TreatWarningsAsErrors=true

# Java
mvn -B verify -Dmaven.compiler.failOnWarning=true

# C
clang -std=c23 -Wall -Wextra -Wpedantic -Wconversion -Werror -fsyntax-only $(git ls-files '*.c')

# C++
cmake --build build -- -k0 -j        # with -Werror in CMakeLists

# SQL — schema lint
sqlfluff lint --dialect postgres migrations/
# Validate that generated code matches schema:
sqlc generate && git diff --exit-code  # fails if drift
```

## Scan Methodology

### Phase 1: Strict-mode baseline
Run the language's strict-mode checker. Capture error count, file count touched, top 5 error codes by frequency. If the project isn't on strict mode, the first finding is: **"strict mode not enabled — every other type finding below is a lower bound"**.

### Phase 2: Escape-hatch audit
`rg`/`grep` for the language's escape hatches and verify each has a justification comment.

```bash
# TypeScript
rg ': any\b|<any>|as any|@ts-ignore|@ts-expect-error|!\.|!\[' --type ts
# Python
rg '# type: ignore|: Any\b|cast\(' --type py
# C# / Java
rg '\bdynamic\b|@SuppressWarnings|!\s*[.;)]' --type cs --type java
# C / C++
rg '\bvoid\s*\*|\breinterpret_cast\b|\bconst_cast\b' --type c --type cpp
```

### Phase 3: Domain-primitive audit (newtype check)
For every public function signature, flag uses of bare `string` / `int` / `long` for IDs, emails, money, timestamps. Suggest a newtype wrapper. This is the highest-signal manual pass.

### Phase 4: Boundary parse audit (parse-don't-validate)
For every external entry point (HTTP handler, message-queue consumer, JSON deserializer, env-var loader), verify the raw input is parsed into a refined type at the boundary, not validated lazily downstream.

### Phase 5: Exhaustiveness audit
For every `switch` / `match` / chain-of-`if`-`else` over a closed set, verify the compiler enforces exhaustiveness (sealed/discriminated union + total switch + `assertNever`-style fallthrough).

## Severity reconciliation

Type-checker triage tiers (internal report) vs refinement-loop letter severity (wire format):

| Triage tier | Examples | Letter `severity` |
|---|---|---|
| CRITICAL | type error blocking compile/build; null violation reaching a production code path | `critical` |
| HIGH | unjustified `any` / `dynamic` in production code path; non-exhaustive switch on a domain-modeling union; cast that masks a real error | `critical` |
| MEDIUM | bare primitive used where a newtype would prevent a confusable bug (`string` for IDs); validation-not-parsing at a boundary | `critical` |
| LOW | missing return type annotation; unused `# type: ignore`; stylistic type-alias suggestion | `critical` |

Per the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md), **every finding emits `severity: critical` on the wire**. The triage tiers stay in the human report body for prioritization. A type-checker warning today is a runtime crash after the next refactor.

## Output Format

```markdown
## Type Check Report

**Language**: TypeScript
**Tool**: tsc 5.6.3
**Mode**: strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
**Status**: FAIL

### Summary
| Triage | Count |
|--------|-------|
| CRITICAL | 1 |
| HIGH     | 4 |
| MEDIUM   | 9 |
| LOW      | 12 |

### CRITICAL: null violation
**File**: src/api/users.ts:45
**Code**: TS2532 — Object is possibly 'undefined'
**Kind**: null_violation

```typescript
const user = users.find(u => u.id === id);
return user.email;     // user is User | undefined
```

**Fix**:
```typescript
const user = users.find(u => u.id === id);
if (!user) throw new NotFound(`user ${id}`);
return user.email;
```

### HIGH: unjustified escape hatch
**File**: src/utils/legacy.ts:23
**Kind**: escape_hatch_unjustified
**Pattern**: `(window as any).legacyGlobal`
**Fix**: Declare a typed global via `declare global { interface Window { legacyGlobal: LegacyShape } }`.

### MEDIUM: weak typing idiom
**File**: src/billing/charge.ts:12
**Kind**: weak_typing_idiom
**Signature**: `charge(userId: string, orderId: string, cents: number)`
**Fix**: Introduce branded `UserId`, `OrderId`, `Cents`. See "Per-language BAD/SAFE" in the type-checker skill.
```

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(engine+file+line+type_kind)[:12]>
severity: critical                              # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                 # high = compiler error; medium = lint-class; low = heuristic
engine: tsc | mypy | pyright | roslyn | javac | clang | clang-tidy | sorbet | sqlc | sqlfluff
error_code: <tool's code, e.g. TS2532, error[E0382], CS8602, reportPossiblyUnbound>
type_kind: implicit_any | dynamic_type | null_violation | unsafe_cast | non_exhaustive_union | generic_variance | runtime_type_check_needed | escape_hatch_unjustified | missing_return_type | unused_ignore | weak_typing_idiom | domain_invariant_unencoded
target_file: src/api/users.ts
target_line: 45
target_symbol: "findUser"                       # function/method/class symbol if known
language: typescript | python | csharp | java | c | cpp | sql | rust | go | ruby
strict_mode: true | false                       # was the checker run in strict mode?
suggested_fix: "Narrow with `if (!user) throw new NotFound(...)` before accessing .email"
reference: https://www.typescriptlang.org/docs/handbook/2/narrowing.html
```

The integrator uses `confidence` and `strict_mode` to weight findings — a `strict_mode: false` finding implies the project hasn't enabled the right flags, and the integrator should escalate the missing config as a separate finding before triaging the body.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
