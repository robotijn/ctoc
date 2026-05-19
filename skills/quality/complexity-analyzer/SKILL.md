---
name: complexity-analyzer
description: Measures cyclomatic, cognitive, NPath, Halstead, and structural complexity; flags refactoring hotspots with refactor-suggested fixes.
type: skill
when_to_load:
  - "complexity check"
  - "cyclomatic complexity"
  - "cognitive complexity"
  - "NPath complexity"
  - "Halstead complexity"
  - "too complex"
  - "complexity analysis"
  - "this function is too complicated"
  - "refactor hotspot"
  - "code is hard to read"
related_skills:
  - quality/complexity-reducer
  - quality/code-reviewer
  - quality/architecture-checker
  - quality/performance-validator
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

# Complexity Analyzer (skill)

> Converted from agents/quality/complexity-analyzer.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You measure and track code complexity metrics as part of the Smart Quality Gate System. You calculate precise complexity numbers across multiple dimensions (cyclomatic, cognitive, NPath, Halstead, structural), identify functions/methods requiring refactoring, and feed quantitative scores into Tier 2 quality checks. You are the **automated floor** for maintainability; the refactor plan is owned by [[complexity-reducer]].

You do **not** flag complexity in isolation — every finding ships with the metric kind, the measured value, the threshold, the function name, and a concrete refactor suggestion. A finding without a refactor suggestion is a bug in this skill.

## 2026 Best Practices (Quality category)

Five pillars served: **readability** + **maintainability**.

### Hard limits (defaults — overridable per-project in `.ctoc/settings.yaml`)

| Metric | Threshold | Critical at | Source |
|--------|-----------|-------------|--------|
| Cyclomatic Complexity (CC) | ≤ 10 | > 20 | McCabe 1976; SonarQube/PMD/Roslyn defaults |
| Cognitive Complexity | ≤ 15 | > 35 | SonarSource white paper (G. Ann Campbell), SonarQube default |
| NPath Complexity | ≤ 200 | > 1000 | Brian Nejmeh 1988; PMD `NPathComplexity` rule default |
| Nesting depth | ≤ 4 | > 6 | SonarQube `S134` |
| Function length (LOC, non-blank, non-comment) | ≤ 50 | > 100 | SonarQube `S138`, Roslyn `CA1505` heuristic |
| Parameter count | ≤ 5 | > 7 | SonarQube `S107`, PMD `ExcessiveParameterList` |
| Halstead Difficulty | ≤ 30 | > 50 | Halstead 1977; radon/multimetric defaults |
| Depth of Inheritance Tree (DIT) | ≤ 5 | > 7 | Chidamber & Kemerer 1994; Roslyn `CA1501` |
| Fan-out (afferent + efferent coupling) | ≤ 15 outgoing calls | > 30 | PMD `ExcessiveImports`, NDepend defaults |

These are **defaults**, not laws. Generated code, parsers, and state machines legitimately exceed these — see "Suppression contract" below.

### Modern incremental complexity rules

- **New-code-first**: enforce thresholds on changed lines and new functions only. Legacy hotspots get a separate `## Backlog` section, not a build failure. SonarQube's "Clean as You Code" model is the canonical pattern; mirror it.
- **Cognitive > Cyclomatic for human review, Cyclomatic > Cognitive for test-coverage budgeting.** A high-CC function needs more test paths; a high-cognitive function needs to be split. Report both — they tell different stories.
- **NPath catches what CC misses.** Cyclomatic ignores combinatorial path explosion; NPath multiplies path-counts through sequential branches. Three sequential `if/else` blocks score CC=4 but NPath=8. Use NPath as a tie-breaker when CC is borderline.
- **Halstead Difficulty + Effort track distinct cognitive load.** Recent neuroscience research (PMC 2023; ScienceDirect 2025) found Halstead Effort and Difficulty correlate with EEG-measured cognitive load better than raw McCabe CC on small functions. Use Halstead for short, dense functions (CC stays low but the function is still hard to read).
- **No single metric is sufficient.** A 2026 ScienceDirect study on complementarity in complexity metrics concluded that no single metric fully captures perceived complexity; emit at least cyclomatic + cognitive + one structural metric (nesting OR function length) per finding.
- **Guard clauses lower cognitive complexity without changing CC.** Recommend them in findings; they're a cheap win.
- **Self-documenting names + comments-explain-WHY-not-WHAT**: high cognitive complexity is often a comprehension problem; suggest renaming before refactoring.
- **AI-generated code skews long.** Generative coding assistants produce verbose functions; treat any function > 100 LOC born in a single commit as a complexity-suspect even before measuring.
- **Manual + automated**: this skill is the automated floor; route hotspots to [[complexity-reducer]] for the refactor plan and to [[code-reviewer]] for intent review.

## Trigger

- After Write/Edit on source files
- At stage transition: in-progress → review
- Manual: `ctoc quality --tier2`
- Critic-mode invocation by the Iron Loop integrator (refinement loop)

## Metric Categories

### 1. Cyclomatic Complexity (CC)

Decision points (+1 each, base 1): `if`, `else if`/`elif`, `for`/`foreach`, `while`/`do-while`, `case`, `catch`/`except`, `&&`/`and`, `||`/`or`, ternary `?:`, null-coalescing `??`, LINQ `Where`/`Any`/`All` lambdas with conditional bodies. Switch-expression arms each add 1.

| Tier | Range | Internal triage |
|------|-------|-----------------|
| Green | CC ≤ 10 | Pass |
| Yellow | 11–15 | Warning |
| Red | 16–20 | Strong warning |
| Critical | > 20 | Block at review |

### 2. Cognitive Complexity (SonarSource definition)

+1 per control structure; +1 additional per nesting level; +1 per logical-operator sequence change; recursion +1. No penalty for null-coalescing, simple ternaries on a single line, or early returns.

| Tier | Range | Internal triage |
|------|-------|-----------------|
| Green | Cog ≤ 15 | Pass |
| Yellow | 16–24 | Warning |
| Red | 25–35 | Strong warning |
| Critical | > 35 | Block at review |

### 3. NPath Complexity

Product of independent decision points along the execution path. NPath = ∏(branch options) across sequential blocks; a function with three sequential 2-arm `if`s has NPath = 8 (not 4 like CC).

| Tier | Range | Internal triage |
|------|-------|-----------------|
| Green | NPath ≤ 200 | Pass |
| Yellow | 201–1000 | Warning |
| Red | 1001–10 000 | Strong warning |
| Critical | > 10 000 | Block at review |

### 4. Halstead Metrics

Operands (n2, N2) + operators (n1, N1) → Difficulty = (n1/2) × (N2/n2); Effort = Difficulty × Volume. Useful on short dense functions where CC is misleading.

| Metric | Threshold (Critical) |
|--------|---------------------|
| Halstead Difficulty | > 50 |
| Halstead Effort | > 1e6 |
| Halstead Volume | > 8000 |

### 5. Depth of Inheritance Tree (DIT)

Number of ancestor classes back to root (`object`/`Object`/`System.Object`). DIT > 5 = brittle hierarchy.

### 6. Fan-in / Fan-out (Coupling)

- **Fan-in** (afferent): number of callers. Very high fan-in on non-utility code = god module.
- **Fan-out** (efferent): number of distinct functions/classes called. Fan-out > 15 = function is doing too much.

### 7. Function Length

Non-blank, non-comment lines. Threshold 50; critical at 100. Generated parsers exempt via suppression.

### 8. Parameter Count

Threshold 5; critical at 7. Wrap with a parameter object or builder before crossing 5.

## High-complexity examples and refactored equivalents

> Conventions: every BEFORE shows measured CC, Cognitive, and (where relevant) NPath. AFTER shows the new measurements. Numbers below are illustrative, hand-counted using the SonarSource cognitive rules and McCabe CC; they're shown so reviewers can sanity-check the metric, not to replace running the actual tool.

### Category 1 — Nested conditionals (foundational, all 7 languages)

#### C# (.NET 9)

```csharp
// BEFORE — CC=11, Cognitive=19, Nesting=4
public decimal CalculateDiscount(Order order, Customer c)
{
    if (order != null)
    {
        if (c != null)
        {
            if (c.IsActive)
            {
                if (order.Total > 100)
                {
                    if (c.IsPremium) return order.Total * 0.20m;
                    else return order.Total * 0.10m;
                }
                else return 0m;
            }
            else return 0m;
        }
        else return 0m;
    }
    return 0m;
}

// AFTER — CC=5, Cognitive=4, Nesting=1 (guard clauses + early returns)
public decimal CalculateDiscount(Order order, Customer c)
{
    if (order is null || c is null || !c.IsActive) return 0m;
    if (order.Total <= 100) return 0m;
    return c.IsPremium ? order.Total * 0.20m : order.Total * 0.10m;
}
```

#### Java 21+

```java
// BEFORE — CC=10, Cognitive=17, Nesting=4
public BigDecimal calculateDiscount(Order order, Customer c) {
    if (order != null) {
        if (c != null) {
            if (c.isActive()) {
                if (order.total().compareTo(BigDecimal.valueOf(100)) > 0) {
                    if (c.isPremium()) return order.total().multiply(new BigDecimal("0.20"));
                    else return order.total().multiply(new BigDecimal("0.10"));
                } else return BigDecimal.ZERO;
            } else return BigDecimal.ZERO;
        } else return BigDecimal.ZERO;
    }
    return BigDecimal.ZERO;
}

// AFTER — CC=5, Cognitive=4, Nesting=1 (pattern-matched guard clauses, records-friendly)
public BigDecimal calculateDiscount(Order order, Customer c) {
    if (order == null || c == null || !c.isActive()) return BigDecimal.ZERO;
    if (order.total().compareTo(BigDecimal.valueOf(100)) <= 0) return BigDecimal.ZERO;
    var rate = c.isPremium() ? new BigDecimal("0.20") : new BigDecimal("0.10");
    return order.total().multiply(rate);
}
```

#### Python 3.12+

```python
# BEFORE — CC=10, Cognitive=15, Nesting=4
def calculate_discount(order, customer) -> Decimal:
    if order is not None:
        if customer is not None:
            if customer.is_active:
                if order.total > 100:
                    if customer.is_premium:
                        return order.total * Decimal("0.20")
                    else:
                        return order.total * Decimal("0.10")
                else:
                    return Decimal("0")
            else:
                return Decimal("0")
        else:
            return Decimal("0")
    return Decimal("0")

# AFTER — CC=5, Cognitive=3, Nesting=1
def calculate_discount(order, customer) -> Decimal:
    if order is None or customer is None or not customer.is_active:
        return Decimal("0")
    if order.total <= 100:
        return Decimal("0")
    rate = Decimal("0.20") if customer.is_premium else Decimal("0.10")
    return order.total * rate
```

#### C (C17/23)

```c
/* BEFORE — CC=11, Cognitive=18, Nesting=4 */
double calculate_discount(const order_t *order, const customer_t *c) {
    if (order != NULL) {
        if (c != NULL) {
            if (c->is_active) {
                if (order->total > 100.0) {
                    if (c->is_premium) return order->total * 0.20;
                    else                return order->total * 0.10;
                } else return 0.0;
            } else return 0.0;
        } else return 0.0;
    }
    return 0.0;
}

/* AFTER — CC=5, Cognitive=3, Nesting=1 */
double calculate_discount(const order_t *order, const customer_t *c) {
    if (order == NULL || c == NULL || !c->is_active) return 0.0;
    if (order->total <= 100.0) return 0.0;
    return order->total * (c->is_premium ? 0.20 : 0.10);
}
```

#### C++ (C++20/23)

```cpp
// BEFORE — CC=10, Cognitive=16, Nesting=4
double calculate_discount(const Order* order, const Customer* c) {
    if (order) {
        if (c) {
            if (c->is_active()) {
                if (order->total() > 100.0) {
                    if (c->is_premium()) return order->total() * 0.20;
                    else                  return order->total() * 0.10;
                } else return 0.0;
            } else return 0.0;
        } else return 0.0;
    }
    return 0.0;
}

// AFTER — CC=5, Cognitive=3, Nesting=1 (std::optional + guard clauses)
double calculate_discount(const Order* order, const Customer* c) {
    if (!order || !c || !c->is_active()) return 0.0;
    if (order->total() <= 100.0) return 0.0;
    return order->total() * (c->is_premium() ? 0.20 : 0.10);
}
```

#### JavaScript / TypeScript

```typescript
// BEFORE — CC=10, Cognitive=15, Nesting=4
function calculateDiscount(order?: Order, c?: Customer): number {
  if (order) {
    if (c) {
      if (c.isActive) {
        if (order.total > 100) {
          if (c.isPremium) return order.total * 0.20;
          else return order.total * 0.10;
        } else return 0;
      } else return 0;
    } else return 0;
  }
  return 0;
}

// AFTER — CC=5, Cognitive=3, Nesting=1
function calculateDiscount(order?: Order, c?: Customer): number {
  if (!order || !c || !c.isActive) return 0;
  if (order.total <= 100) return 0;
  return order.total * (c.isPremium ? 0.20 : 0.10);
}
```

#### SQL (T-SQL stored procedure — nested CTEs / nested CASE)

```sql
-- BEFORE — Cyclomatic ~12 (CASE arms + nested IF), nesting=4
CREATE OR ALTER PROCEDURE dbo.CalcDiscount @OrderId INT, @CustomerId INT
AS
BEGIN
  DECLARE @Total MONEY, @Active BIT, @Premium BIT, @Discount MONEY = 0;
  SELECT @Total = Total FROM Orders WHERE Id = @OrderId;
  IF @Total IS NOT NULL
  BEGIN
    SELECT @Active = IsActive, @Premium = IsPremium FROM Customers WHERE Id = @CustomerId;
    IF @Active IS NOT NULL
    BEGIN
      IF @Active = 1
      BEGIN
        IF @Total > 100
        BEGIN
          IF @Premium = 1 SET @Discount = @Total * 0.20;
          ELSE            SET @Discount = @Total * 0.10;
        END
      END
    END
  END
  SELECT @Discount AS Discount;
END;

-- AFTER — Cyclomatic ~4, flat: a single CTE + a single CASE
CREATE OR ALTER PROCEDURE dbo.CalcDiscount @OrderId INT, @CustomerId INT
AS
BEGIN
  WITH ctx AS (
    SELECT o.Total, c.IsActive, c.IsPremium
    FROM Orders o JOIN Customers c ON c.Id = @CustomerId
    WHERE o.Id = @OrderId
  )
  SELECT
    CASE
      WHEN IsActive = 1 AND Total > 100 AND IsPremium = 1 THEN Total * 0.20
      WHEN IsActive = 1 AND Total > 100                    THEN Total * 0.10
      ELSE 0
    END AS Discount
  FROM ctx;
END;
```

### Category 2 — Long function / many responsibilities

#### Python 3.12+

```python
# BEFORE — 78 LOC, CC=14, Cognitive=22 — single function does parsing, validation, normalization, persistence, notification.
def process_signup(raw: dict) -> dict:
    email = raw.get("email", "").strip().lower()
    if not email or "@" not in email: raise ValueError("email")
    name = raw.get("name", "").strip()
    if len(name) < 2: raise ValueError("name")
    pw = raw.get("password", "")
    if len(pw) < 12: raise ValueError("password too short")
    if pw.lower() == pw or pw.upper() == pw: raise ValueError("mixed case required")
    if not any(c.isdigit() for c in pw): raise ValueError("digit required")
    # ... 60 more lines of DB inserts, email send, metrics, ...
    return {"id": new_id}

# AFTER — split into 4 functions, each CC ≤ 4, top-level CC=5, Cognitive=4.
def process_signup(raw: dict) -> dict:
    email = _normalize_email(raw.get("email", ""))
    name = _validate_name(raw.get("name", ""))
    pw_hash = _hash_password(_validate_password(raw.get("password", "")))
    user_id = _persist_user(email, name, pw_hash)
    _send_welcome(email, name)
    return {"id": user_id}
```

#### C# (.NET 9)

```csharp
// BEFORE — 90 LOC, CC=17. Same anti-pattern.
public async Task<SignupResult> ProcessSignup(JsonElement raw) { /* 90 lines */ }

// AFTER — extracted, with records for the intermediate shapes.
public async Task<SignupResult> ProcessSignup(JsonElement raw)
{
    var email = NormalizeEmail(raw.GetProperty("email").GetString());
    var name  = ValidateName(raw.GetProperty("name").GetString());
    var hash  = HashPassword(ValidatePassword(raw.GetProperty("password").GetString()));
    var id    = await _users.PersistAsync(new NewUser(email, name, hash));
    await _mail.SendWelcomeAsync(email, name);
    return new SignupResult(id);
}
```

#### TypeScript

```typescript
// BEFORE — 70 LOC, CC=13.
export async function processSignup(raw: unknown): Promise<{ id: string }> { /* 70 lines */ }

// AFTER — composition of small validated stages
export async function processSignup(raw: unknown) {
  const email = normalizeEmail(getProp(raw, "email"));
  const name  = validateName(getProp(raw, "name"));
  const hash  = await hashPassword(validatePassword(getProp(raw, "password")));
  const id    = await users.persist({ email, name, hash });
  await mail.sendWelcome(email, name);
  return { id };
}
```

### Category 3 — High NPath (sequential branches)

#### Java

```java
// BEFORE — CC=8 (looks fine!) but NPath = 2*2*2*2*2 = 32 (sequential independent ifs)
public Receipt build(Cart cart, User user) {
    Receipt r = new Receipt();
    if (cart.hasDiscount()) r.addLine("discount");
    if (user.isMember())    r.addLine("member");
    if (cart.shipsToday())  r.addLine("today");
    if (cart.isGift())      r.addLine("gift");
    if (user.hasReferral()) r.addLine("referral");
    return r;
}

// AFTER — data-driven, NPath=1, CC=2 (single loop)
private static final List<Rule> RULES = List.of(
    new Rule("discount", (cart, u) -> cart.hasDiscount()),
    new Rule("member",   (cart, u) -> u.isMember()),
    new Rule("today",    (cart, u) -> cart.shipsToday()),
    new Rule("gift",     (cart, u) -> cart.isGift()),
    new Rule("referral", (cart, u) -> u.hasReferral())
);
public Receipt build(Cart cart, User user) {
    Receipt r = new Receipt();
    for (var rule : RULES) if (rule.matches(cart, user)) r.addLine(rule.label());
    return r;
}
```

#### C++ (C++20/23)

```cpp
// BEFORE — CC=8, NPath = 32 (five sequential independent ifs)
Receipt build(const Cart& cart, const User& user) {
    Receipt r;
    if (cart.has_discount()) r.add_line("discount");
    if (user.is_member())    r.add_line("member");
    if (cart.ships_today())  r.add_line("today");
    if (cart.is_gift())      r.add_line("gift");
    if (user.has_referral()) r.add_line("referral");
    return r;
}

// AFTER — table-driven, NPath=1, CC=2
struct Rule { std::string_view label; std::function<bool(const Cart&, const User&)> match; };
static const std::array<Rule, 5> kRules = {{
    {"discount", [](auto& c, auto&)   { return c.has_discount();   }},
    {"member",   [](auto&, auto& u)   { return u.is_member();      }},
    {"today",    [](auto& c, auto&)   { return c.ships_today();    }},
    {"gift",     [](auto& c, auto&)   { return c.is_gift();        }},
    {"referral", [](auto&, auto& u)   { return u.has_referral();   }},
}};
Receipt build(const Cart& cart, const User& user) {
    Receipt r;
    for (const auto& [label, match] : kRules)
        if (match(cart, user)) r.add_line(std::string{label});
    return r;
}
```

#### SQL (nested CTE explosion)

```sql
-- BEFORE — five sequential CASE arms each branching on an independent flag.
-- Cyclomatic ~6, NPath = 32 (each independent flag doubles the implicit path count)
SELECT
  CASE WHEN c.HasDiscount = 1 THEN 'd' ELSE '' END +
  CASE WHEN u.IsMember    = 1 THEN 'm' ELSE '' END +
  CASE WHEN c.ShipsToday  = 1 THEN 't' ELSE '' END +
  CASE WHEN c.IsGift      = 1 THEN 'g' ELSE '' END +
  CASE WHEN u.HasReferral = 1 THEN 'r' ELSE '' END AS Flags
FROM Carts c JOIN Users u ON u.Id = c.UserId;

-- AFTER — single STRING_AGG over a flags table; NPath=1
SELECT
  STRING_AGG(f.Code, '') WITHIN GROUP (ORDER BY f.SortOrder) AS Flags
FROM Carts c
JOIN Users u             ON u.Id = c.UserId
JOIN FlagRules f         ON 1 = 1
CROSS APPLY dbo.MatchFlag(c.Id, u.Id, f.Id) m
WHERE m.Matched = 1
GROUP BY c.Id;
```

### Category 4 — Excessive parameters

#### TypeScript

```typescript
// BEFORE — 8 parameters (threshold 5; critical 7)
function createInvoice(customerId: string, amount: number, currency: string,
  taxRate: number, discount: number, notes: string,
  dueDate: Date, sendEmail: boolean) { /* ... */ }

// AFTER — parameter object
interface InvoiceInput {
  customerId: string; amount: number; currency: string;
  taxRate: number; discount: number; notes: string;
  dueDate: Date; sendEmail: boolean;
}
function createInvoice(input: InvoiceInput) { /* ... */ }
```

#### Python

```python
# BEFORE — 8 positional params
def create_invoice(customer_id, amount, currency, tax_rate, discount, notes, due_date, send_email):
    ...

# AFTER — dataclass
from dataclasses import dataclass
@dataclass(frozen=True, slots=True)
class InvoiceInput:
    customer_id: str
    amount: Decimal
    currency: str
    tax_rate: Decimal
    discount: Decimal
    notes: str
    due_date: date
    send_email: bool

def create_invoice(inv: InvoiceInput): ...
```

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when this skill produces a human-readable scan report. When the skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization; the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action recommendation |
|-------------|----------|-------------------------------|
| CRITICAL | CC > 20, Cognitive > 35, NPath > 10 000, function > 100 LOC, > 7 parameters | BLOCK at review |
| HIGH | CC 16–20, Cognitive 25–35, NPath 1001–10 000, 50–100 LOC, 6–7 params, DIT > 7, nesting > 6 | BLOCK before next gate |
| MEDIUM | CC 11–15, Cognitive 16–24, NPath 201–1000, nesting 5–6, fan-out 16–30 | Fix within sprint |
| LOW | Borderline metrics on new code, Halstead Effort above target, DIT 6–7 | Backlog |

**Wire contract**: every letter emitted from the refinement loop has `severity: critical`. Confidence + delta tracking carry the prioritization signal (see schema below). The integrator may defer `confidence: low` single-metric findings, but the wire severity does not soften.

## Tool Integration (2026)

| Tool | Languages | Strengths | When |
|------|-----------|-----------|------|
| **SonarQube 11+ / Sonar Server / SonarLint** | 30+ | Cognitive Complexity (canonical implementation), "Clean as You Code" new-code gate, SARIF output, IDE integration | Every PR; IDE pre-commit |
| **lizard** | 20+ (C/C++, Python, Java, JS/TS, C#, Go, Swift, Rust, Lua, ...) | Multi-language single binary, ccn + cognitive + token count + parameter count, JSON/XML/CSV output | CI for polyglot repos |
| **radon** | Python | CC, MI (Maintainability Index), raw, Halstead — all four | Python projects |
| **xenon** | Python | Wraps radon; fails CI on threshold breach | Python CI gate |
| **gocyclo** + **gocognit** | Go | CC and cognitive | Go CI |
| **eslint** `complexity` + `max-lines-per-function` + `max-params` + `max-depth` | JS/TS | Built-in rules; integrates with Prettier/Biome | JS/TS pre-commit |
| **PMD** (`CyclomaticComplexity`, `CognitiveComplexity`, `NPathComplexity`, `ExcessiveParameterList`, `ExcessiveMethodLength`) | Java, Apex | NPath + DIT + fan-out; mature ruleset | Java CI |
| **Checkstyle** (`CyclomaticComplexity`, `NPathComplexity`, `JavaNCSS`, `ClassFanOutComplexity`) | Java | NCSS counts, fan-out | Java IDE/CI |
| **Roslyn analyzers** — `CA1502` (cyclomatic), `CA1505` (maintainability), `CA1501` (DIT), `CA1506` (class coupling) | C# / VB.NET | Ships with .NET SDK; `<AnalysisMode>All</AnalysisMode>` in csproj | .NET build |
| **Clang static analyzer** (`StmtComplexity` family — alpha checkers under `alpha.core`) + Clang-Tidy `readability-function-cognitive-complexity` and `readability-function-size` | C/C++ | Cognitive + statement-tree size limits, in-tree with Clang | C/C++ build |
| **CodeClimate / Qlty** | Multi | Maintainability score aggregate, GitHub annotations | PR dashboards |
| **plato** | JS (legacy) | HTML visualization, Halstead — fine for offline reports; not actively maintained | One-off audits only |
| **multimetric** | 7 langs | Aggregates Halstead, CC, MI, fan-in/fan-out | Polyglot dashboards |
| **t-sql-complexity** / Redgate SQL Code Guard | T-SQL, PL/SQL | Cyclomatic for stored procs, nested-CTE depth | DB schema CI |

```bash
# Polyglot — fast, every PR
lizard -C 10 -L 50 -a 5 --CCN 10 --languages cpp,java,python,javascript,csharp,go .
lizard --xml -o lizard.xml .                          # CI-friendly output

# Python — radon emits per-metric JSON
radon cc src/ -a -s --json --total-average
radon mi src/ -s --json                                # Maintainability Index
radon hal src/ --json                                  # Halstead
xenon --max-absolute B --max-modules B --max-average A src/

# Go
gocyclo -over 10 -avg ./...
gocognit -over 15 ./...

# JS/TS — eslint with all four limits
npx eslint --rule 'complexity: ["error", 10]' \
           --rule 'max-lines-per-function: ["error", 50]' \
           --rule 'max-params: ["error", 5]' \
           --rule 'max-depth: ["error", 4]' \
           --format=@microsoft/eslint-formatter-sarif --output-file=eslint.sarif src/

# Java — PMD with the full complexity ruleset
pmd check -d src/ -R category/java/design.xml/CyclomaticComplexity,\
category/java/design.xml/CognitiveComplexity,\
category/java/design.xml/NPathComplexity,\
category/java/design.xml/ExcessiveParameterList \
  -f sarif -r pmd.sarif

# C# / .NET — Roslyn analyzers via build with AnalysisMode=All
dotnet build /p:AnalysisMode=All /p:TreatWarningsAsErrors=true
# Optional: standalone CA rule run
dotnet format analyzers --diagnostics CA1502 CA1505 CA1501 CA1506

# C / C++ — clang-tidy
clang-tidy -checks='readability-function-cognitive-complexity,readability-function-size' \
           -warnings-as-errors='*' --extra-arg=-std=c++20 src/*.cpp

# SonarQube/SonarCloud — aggregates everything above, "Clean as You Code" gate
sonar-scanner -Dsonar.qualitygate.wait=true \
              -Dsonar.newCode.referenceBranch=origin/main
```

All tools above either emit SARIF natively or via a thin formatter. Aggregate SARIF into the GitHub Code Scanning tab so duplicates collapse across engines (lizard + radon + SonarQube agreeing on the same hotspot raises confidence to `high`).

## Suppression contract

Some code legitimately exceeds thresholds. Allowed suppressions:

- **Generated code** (parser tables, protobuf, ORM scaffolding) — exempt by path glob in `.ctoc/settings.yaml`.
- **State machines** with > 20 explicit states — flag once, accept with annotation.
- **Switch over a sealed enum** where every arm is one-line — annotate, do not refactor for the sake of metrics.

Suppression syntax (mirrors SonarQube `NOSONAR` / linter directives):

```python
# noqa: complexity — generated parser, see plans/done/2026-04-parser-gen.md
```

Suppressions without a justifying plan reference are themselves a finding (`severity: critical`, `metric_kind: unjustified_suppression`).

## Output Format (human report)

```markdown
## Complexity Scan Report

### Summary
| Severity | Count | Required Action |
|----------|-------|-----------------|
| CRITICAL | 1     | BLOCK at gate   |
| HIGH     | 4     | Before release  |
| MEDIUM   | 11    | Within sprint   |
| LOW      | 23    | Backlog         |

| Metric kind | Functions over threshold | Worst |
|-------------|--------------------------|-------|
| cyclomatic  | 7                        | 24 (orders/processor.js:processOrder) |
| cognitive   | 9                        | 41 (orders/processor.js:processOrder) |
| NPath       | 3                        | 1 280 (billing/calc.py:apply_rules) |
| length      | 5                        | 142 LOC (legacy/migrate.cs:Migrate) |
| parameters  | 2                        | 9 (api/v1.ts:createInvoice) |
| nesting     | 4                        | 7 (auth/grant.java:authorize) |

### CRITICAL: Cognitive Complexity 41
**File**: src/orders/processor.js:45
**Function**: processOrder
**Metric**: cognitive_complexity = 41 (threshold 15, critical > 35)
**Also**: cyclomatic = 24, NPath = 768, length = 92 LOC, nesting = 5

**Refactor**:
1. Extract validation to `validateOrder()` — lowers cognitive ~12, CC ~5
2. Extract item processing to `processItem()` — lowers cognitive ~8, CC ~6
3. Replace nested `if/else` with guard clauses for null/inactive cases — lowers cognitive ~6 with no CC change
4. Replace `for` + nested switch with `Map` lookup — lowers NPath from 768 → ~12

Target after refactor: cognitive ≤ 15, CC ≤ 10. Route the actual refactor to `complexity-reducer`.
```

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+metric_kind)[:12]>   # fingerprint for dedup
severity: critical                                         # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                            # high = ≥2 engines agree; low = single-tool unverified
engine: sonarqube | lizard | radon | xenon | gocyclo | gocognit | eslint | pmd | checkstyle | roslyn | clang-tidy | multimetric | manual
metric_kind: cyclomatic | cognitive | npath | halstead_difficulty | halstead_effort | halstead_volume | function_length | parameter_count | nesting_depth | depth_of_inheritance | fan_in | fan_out | unjustified_suppression
measured_value: 41                                         # numeric measurement from the engine
threshold: 15                                              # configured limit for this metric
critical_threshold: 35                                     # the "critical" tier boundary
function_name: "processOrder"
class_name: "OrderProcessor"                               # optional, when applicable
file: src/orders/processor.js
line: 45
language: javascript                                       # one of: csharp java python c cpp javascript typescript sql go rust other
new_code: true | false                                     # is this in the diff vs. the new-code reference?
delta_to_baseline: new | unchanged | regressed | improved  # vs. .quality/baseline.json
corroborated_by: [<other engines that also flagged this>]  # empty list if single-source
related_metrics:                                           # other metrics on the same function for context
  cyclomatic: 24
  cognitive: 41
  npath: 768
  length: 92
refactor_suggested: |
  1. Extract validation to validateOrder() — lowers cognitive ~12
  2. Extract item processing to processItem() — lowers cognitive ~8
  3. Replace nested if/else with guard clauses
  4. Replace nested switch with Map lookup — lowers NPath from 768 → ~12
escalate_to: complexity-reducer                            # which skill owns the refactor
message: "Cognitive complexity 41 exceeds critical threshold 35 in processOrder"
reference: https://www.sonarsource.com/docs/CognitiveComplexity.pdf
```

The integrator uses `confidence` + `corroborated_by` to weight findings. A `confidence: low` single-source finding doesn't block phase advancement on its own; two engines agreeing escalates it. `delta_to_baseline: unchanged` lets the integrator skip findings already acknowledged in the prior baseline. `new_code: true` is the strongest signal — new complexity violations always block. `unjustified_suppression` findings always block.

## Escalation

- **Refactor plan** → [[complexity-reducer]] when any function exceeds two or more metric thresholds simultaneously, or when CC > 15 AND cognitive > 20.
- **Architectural smell** → [[code-reviewer]] when ≥ 3 related functions in the same module exceed thresholds (likely a missing abstraction).
- **Coupling / DIT issues** → [[architecture-checker]] when DIT > 5 or fan-out > 15.
- **Performance suspicion** → [[performance-validator]] when high cyclomatic correlates with hot-path functions identified by profiling.

## Configuration

```yaml
complexity-analyzer:
  thresholds:
    cyclomatic_complexity: 10
    cognitive_complexity: 15
    npath_complexity: 200
    halstead_difficulty: 30
    halstead_effort: 1_000_000
    function_loc: 50
    parameter_count: 5
    nesting_depth: 4
    depth_of_inheritance: 5
    fan_out: 15
  critical_thresholds:
    cyclomatic_complexity: 20
    cognitive_complexity: 35
    npath_complexity: 10_000
    function_loc: 100
    parameter_count: 7
    nesting_depth: 6
    depth_of_inheritance: 7
  new_code_only_enforcement: true        # "Clean as You Code"
  baseline_file: .quality/complexity-baseline.json
  ignore_patterns:
    - "**/*.generated.*"
    - "**/__tests__/**"
    - "**/migrations/**"
    - "**/vendor/**"
    - "**/node_modules/**"
    - "**/bin/**"
    - "**/obj/**"
  suppressions_require_plan_reference: true
```

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every cyclomatic/cognitive/NPath/Halstead/length/parameter/nesting/DIT/fan-out threshold breach you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Complexity breaches block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section with a refactor follow-up plan referenced.

The principle: a complexity warning today is a defect, an onboarding tax, and a refactor cost tomorrow. Code that ships green-with-warnings ships with known latent failures.
