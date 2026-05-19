---
name: code-smell-detector
description: Detects code smells and anti-patterns that indicate design problems — classic Fowler catalog plus 2026 ML/LLM additions.
type: skill
when_to_load:
  - "code smell"
  - "anti-pattern"
  - "messy code"
  - "this code is bad"
  - "find smells"
  - "design problem"
  - "clean up this file"
  - "ml smells"
  - "prompt smells"
related_skills:
  - quality/code-reviewer
  - quality/complexity-analyzer
  - quality/complexity-reducer
  - quality/duplicate-code-detector
  - quality/dead-code-detector
effort_level: medium
model_optimized_for: opus-4-7
tools: Read, Grep, Glob
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Code Smell Detector (skill)

> Converted from agents/quality/code-smell-detector.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You detect code smells — symptoms that indicate deeper problems in the code. These aren't bugs, but they make code harder to understand, extend, and maintain. You operate across general-purpose code and the **two new 2026 surfaces**: ML pipelines and LLM-integrated apps. Smells are graded; not every smell is a fault, but every smell deserves a documented refactor suggestion.

## 2026 Best Practices (Quality category)

Five pillars served: **readability** + **maintainability** + **testability**.

- **SRP red flags as concrete checks**: functions > 50 lines or > 4 levels of nesting are concrete checklist items, not vague "consider refactoring" notes. Tools like SonarQube enforce these as cognitive-complexity rules, not just cyclomatic complexity.
- **Guard clauses & early returns**: any deeply-nested smell is reported with the guard-clause refactor inline.
- **DRY**: copy-pasted blocks ≥ 6 lines are a `duplicate-code` smell — cross-reference [[duplicate-code-detector]].
- **Self-documenting names**: cryptic identifiers (`d`, `tmp`, `do_it`) are a smell on their own.
- **Magic numbers/strings**: any unnamed numeric or string constant repeated > 1 time is a smell. Recommend a named constant.
- **Manual + automated mix**: this skill is automated detection. Final triage requires human judgment — surface findings, don't auto-fix.
- **ML pipelines are first-class**: 22 ML-specific smells now exist in the published catalog (Van Oort et al., 2022; extended to ~76 detectors by MLScent in 2025). Data leakage is the most-cited smell in ML repositories scanned to date. Treat any ML pipeline without an explicit `Pipeline()`/`make_pipeline()` train/test boundary as a smell.
- **LLM-integrated apps add new smell families**: "god prompts" (one mega-prompt for every task), missing error-handling instructions ("what to do when you don't know"), generic role ("you are a helpful assistant"), and hallucination feedback loops (model output piped into the next prompt with no validation gate). See §"2026 additions" below.
- **SonarQube ≠ Fowler**: SonarQube uses "code smell" as one of four issue types (Bug / Vulnerability / Code Smell / Security Hotspot). Its rule set partially overlaps Fowler's catalog but is not a one-to-one map. When integrating with SonarQube, treat the rule id as authoritative for tagging and reconcile manually with Fowler's category.

## Code Smell Categories

### Bloaters (too big, too much)

- **Long Method**: > 50 lines, or cyclomatic complexity > 10.
- **Large Class**: > 500 lines, > 7 public methods, or > 7 instance fields — typically multiple responsibilities.
- **Primitive Obsession**: `string`, `int`, `bool` used where a domain type (`Email`, `Money`, `UserId`) belongs.
- **Long Parameter List**: > 4 parameters; > 3 in a constructor.
- **Data Clumps**: the same group of parameters/fields (`firstName, lastName, email`) recurring in many signatures — likely a missing `Person` / `Address` type.

### OO Abusers

- **Switch Statements**: large `switch`/`if-else-if` chain on a type discriminator — replace with polymorphism.
- **Refused Bequest**: subclass overrides parent methods to no-op or throw — wrong inheritance hierarchy.
- **Alternative Classes with Different Interfaces**: two classes do the same job with different method names.
- **Temporary Field**: a field used only in some code paths, `null` otherwise — extract or restructure.

### Change Preventers

- **Divergent Change**: one class is modified for many unrelated reasons.
- **Shotgun Surgery**: one logical change touches many classes — likely the abstraction belongs in one place.
- **Parallel Inheritance Hierarchies**: every new subclass in tree A forces a new subclass in tree B.

### Dispensables

- **Comments**: long explanatory comments often signal unclear code — rename / extract instead.
- **Duplicate Code**: see [[duplicate-code-detector]].
- **Dead Code**: unreachable or unused → see [[dead-code-detector]].
- **Lazy Class**: class that doesn't earn its keep — inline.
- **Data Class**: fields + getters/setters only, no behavior — either add behavior or merge with its consumers.
- **Speculative Generality**: abstractions added "in case we need them later" — YAGNI, remove.

### Couplers

- **Feature Envy**: a method uses another class's data more than its own — move it.
- **Inappropriate Intimacy**: two classes know too much about each other's internals.
- **Message Chains**: `a.b().c().d().e()` — Law of Demeter violation.
- **Middle Man**: class whose methods all delegate to another — remove the layer.

### 2026 additions — ML pipeline smells

Per Van Oort et al. (2022) "Code Smells for Machine Learning Applications" and MLScent (2025).

- **Data Leakage** (most-cited): preprocessing fit on the full dataset before train/test split, target encoding using future labels, time-series cross-validation without temporal ordering, scaler fit on test set. Detect: any `fit()` or `fit_transform()` call on data that has not already been split, OR any scaler/encoder/imputer used outside a `Pipeline`/`ColumnTransformer`.
- **Threshold-dependent evaluation only**: relying solely on accuracy / F1 at default threshold without reporting AUC, PR-AUC, or calibration. Recommend threshold-independent metrics.
- **Magic hyperparameters**: literal `learning_rate=0.001`, `dropout=0.2` embedded in training scripts — extract to config.
- **NaN swallowing**: silently filling NaNs with 0 or mean without recording how many — masks data-quality drift.
- **Randomness without seed**: `np.random`, `torch.manual_seed`, `tf.random` not pinned — non-reproducible training.
- **In-place pandas mutations**: `df.drop(..., inplace=True)` chained inside reusable functions — leaks state to callers.

### 2026 additions — LLM prompt / agent smells

- **God Prompt**: one mega-system-prompt covering all tasks (review PR, summarize, classify, translate) — bloats context, blurs role. Refactor: per-task prompts.
- **Generic Role**: "You are a helpful assistant" — under-specified role produces under-specified output.
- **Missing Unknown-Path**: no instruction for what to do when the model doesn't know — the model defaults to confabulation. Add: "If you do not know, output `UNKNOWN` and stop."
- **Hallucination Feedback Loop**: model output piped directly into the next call without an evaluator/guardrail step — errors compound across turns.
- **Untyped Tool Output**: LLM tool/function returns free-form prose instead of a JSON schema — caller can't parse.
- **Hidden Few-Shot Drift**: in-context examples copy-pasted across prompts without versioning — silent regression when an example is edited.
- **Cross-link**: prompt-injection in untrusted strings is a security concern handled by [[sast-scanner]] §LLM01, not here.

## Detection — BAD/SAFE in 7 languages

Each foundational smell ("magic number" and "long parameter list") shown across **C# (.NET 9), Java (21+), Python (3.12+), C (C17/23), C++ (20/23), JS/TS, SQL**. Additional language samples follow.

### Foundational smell: Magic Number (Primitive Obsession sub-case)

```csharp
// BAD (C# .NET 9): magic numeric literal repeated across the file
public decimal CalculatePrice(int days) => days * 19.99m * 0.92m + 4.50m;
public decimal Refund(int days)         => days * 19.99m * 0.92m;

// SAFE (C# .NET 9): named constants in a static class — or use a record for the price card
internal static class Pricing {
    public const decimal DailyRate   = 19.99m;
    public const decimal TaxFactor   = 0.92m;
    public const decimal ServiceFee  = 4.50m;
}
public decimal CalculatePrice(int days) => days * Pricing.DailyRate * Pricing.TaxFactor + Pricing.ServiceFee;
```

```java
// BAD (Java 21+)
public BigDecimal price(int days) {
    return BigDecimal.valueOf(days).multiply(new BigDecimal("19.99"))
            .multiply(new BigDecimal("0.92")).add(new BigDecimal("4.50"));
}

// SAFE: extract to a price-card record (Java 21 records + constants)
public record PriceCard(BigDecimal dailyRate, BigDecimal taxFactor, BigDecimal serviceFee) {
    public static final PriceCard DEFAULT =
        new PriceCard(new BigDecimal("19.99"), new BigDecimal("0.92"), new BigDecimal("4.50"));
}
public BigDecimal price(int days, PriceCard p) {
    return BigDecimal.valueOf(days).multiply(p.dailyRate())
            .multiply(p.taxFactor()).add(p.serviceFee());
}
```

```python
# BAD (Python 3.12+)
def price(days: int) -> float:
    return days * 19.99 * 0.92 + 4.50

# SAFE: module-level constants (or pydantic Settings / dataclass)
DAILY_RATE: float = 19.99
TAX_FACTOR: float = 0.92
SERVICE_FEE: float = 4.50
def price(days: int) -> float:
    return days * DAILY_RATE * TAX_FACTOR + SERVICE_FEE
```

```c
/* BAD (C17/23) */
double price(int days) { return days * 19.99 * 0.92 + 4.50; }

/* SAFE: #define / static const */
static const double DAILY_RATE  = 19.99;
static const double TAX_FACTOR  = 0.92;
static const double SERVICE_FEE = 4.50;
double price(int days) { return days * DAILY_RATE * TAX_FACTOR + SERVICE_FEE; }
```

```cpp
// BAD (C++20/23)
double price(int days) { return days * 19.99 * 0.92 + 4.50; }

// SAFE: constexpr (C++20) or std::numbers-style domain header
inline constexpr double kDailyRate  = 19.99;
inline constexpr double kTaxFactor  = 0.92;
inline constexpr double kServiceFee = 4.50;
double price(int days) { return days * kDailyRate * kTaxFactor + kServiceFee; }
```

```typescript
// BAD (TS)
export const price = (days: number) => days * 19.99 * 0.92 + 4.5;

// SAFE
export const PRICING = { dailyRate: 19.99, taxFactor: 0.92, serviceFee: 4.5 } as const;
export const price = (days: number) =>
    days * PRICING.dailyRate * PRICING.taxFactor + PRICING.serviceFee;
```

```sql
-- BAD: magic constants embedded in a stored procedure body. When the same literals
-- leak across many procs that must be edited together, this becomes Shotgun Surgery
-- in stored-procedure form (sometimes called "shotgun parsing" of business rules).
CREATE PROCEDURE CalcInvoice @Days INT AS
BEGIN
    SELECT @Days * 19.99 * 0.92 + 4.50 AS Total;
END;

-- SAFE: configuration table, lookup once per call
CREATE TABLE PricingConfig (Code VARCHAR(32) PRIMARY KEY, Value DECIMAL(10,4));
INSERT INTO PricingConfig VALUES ('DailyRate', 19.99), ('TaxFactor', 0.92), ('ServiceFee', 4.50);

CREATE PROCEDURE CalcInvoice @Days INT AS
BEGIN
    DECLARE @Daily DECIMAL(10,4), @Tax DECIMAL(10,4), @Fee DECIMAL(10,4);
    SELECT @Daily = Value FROM PricingConfig WHERE Code = 'DailyRate';
    SELECT @Tax   = Value FROM PricingConfig WHERE Code = 'TaxFactor';
    SELECT @Fee   = Value FROM PricingConfig WHERE Code = 'ServiceFee';
    SELECT @Days * @Daily * @Tax + @Fee AS Total;
END;
```

### Long Parameter List + Data Clumps

```csharp
// BAD (C# .NET 9): 6 primitives, a data clump screaming for a record
public Order Create(string firstName, string lastName, string email,
                    string street, string city, string zip) { /* ... */ }

// SAFE: positional record bundles the clump
public record Customer(string FirstName, string LastName, string Email);
public record Address(string Street, string City, string Zip);
public Order Create(Customer c, Address a) { /* ... */ }
```

```java
// BAD (Java 21+): long parameter list
public Order create(String firstName, String lastName, String email,
                    String street, String city, String zip) { /* ... */ }

// SAFE: Java 21 records
public record Customer(String firstName, String lastName, String email) {}
public record Address(String street, String city, String zip) {}
public Order create(Customer c, Address a) { /* ... */ }
```

```python
# BAD (Python 3.12+)
def create_order(first_name: str, last_name: str, email: str,
                 street: str, city: str, zip_code: str) -> Order: ...

# SAFE: dataclasses (or pydantic v2 BaseModel for validation)
from dataclasses import dataclass
@dataclass(frozen=True)
class Customer: first_name: str; last_name: str; email: str
@dataclass(frozen=True)
class Address: street: str; city: str; zip_code: str
def create_order(c: Customer, a: Address) -> Order: ...
```

```c
/* BAD (C17/23): primitives passed flat — also a Feature Envy risk in callers */
Order *create_order(const char *first, const char *last, const char *email,
                    const char *street, const char *city, const char *zip);

/* SAFE: structs aggregate the clump */
typedef struct { const char *first; const char *last; const char *email; } Customer;
typedef struct { const char *street; const char *city; const char *zip; } Address;
Order *create_order(const Customer *c, const Address *a);
```

```cpp
// BAD (C++20/23)
Order create_order(std::string f, std::string l, std::string email,
                   std::string street, std::string city, std::string zip);

// SAFE: aggregates with designated initializers (C++20)
struct Customer { std::string first; std::string last; std::string email; };
struct Address  { std::string street; std::string city;  std::string zip;  };
Order create_order(Customer c, Address a);
// Call site: create_order({.first="Ada", .last="Lovelace", .email="..."}, {.street="...", ...});
```

```typescript
// BAD (TS): wide positional parameters
export function createOrder(first: string, last: string, email: string,
                            street: string, city: string, zip: string): Order { /* ... */ }

// SAFE: object types, or zod schemas for runtime validation
type Customer = { first: string; last: string; email: string };
type Address  = { street: string; city: string;  zip: string  };
export function createOrder(c: Customer, a: Address): Order { /* ... */ }
```

```sql
-- BAD: stored proc with a clump of customer/address parameters that recur in 5 other procs
CREATE PROCEDURE CreateOrder
    @FirstName NVARCHAR(50), @LastName NVARCHAR(50), @Email NVARCHAR(255),
    @Street NVARCHAR(100), @City NVARCHAR(50), @Zip NVARCHAR(20)
AS BEGIN /* ... */ END;

-- SAFE: SQL Server table-typed parameters (TVP) bundle the clump
CREATE TYPE dbo.CustomerTVP AS TABLE
    (FirstName NVARCHAR(50), LastName NVARCHAR(50), Email NVARCHAR(255));
CREATE TYPE dbo.AddressTVP  AS TABLE
    (Street NVARCHAR(100), City NVARCHAR(50), Zip NVARCHAR(20));

CREATE PROCEDURE CreateOrder
    @Customer dbo.CustomerTVP READONLY,
    @Address  dbo.AddressTVP  READONLY
AS BEGIN /* ... */ END;
```

### Feature Envy + Long Method (Python ML pipeline example)

```python
# BAD (Python 3.12+): preprocessing reaches into model internals AND fits on full data — data leakage
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)                   # fit on ALL data
X_train, X_test, y_train, y_test = train_test_split(X_scaled, y, test_size=0.2)
clf = LogisticRegression(C=0.1, max_iter=1000)       # magic numbers
clf.fit(X_train, y_train)

# SAFE: split first, fit inside a Pipeline so the scaler only sees train rows
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression

C_VALUE = 0.1
MAX_ITER = 1000
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
pipe = Pipeline([
    ("scaler", StandardScaler()),
    ("clf",   LogisticRegression(C=C_VALUE, max_iter=MAX_ITER)),
])
pipe.fit(X_train, y_train)
```

### God Prompt / Generic Role (LLM smell)

```python
# BAD: one mega-prompt for review + summarize + classify — god prompt + generic role
SYSTEM = """You are a helpful AI assistant. You can review PRs, summarize text,
classify documents, translate Spanish, write SQL, and do data entry."""

# SAFE: one prompt per task, specific role, explicit unknown-path
REVIEW_SYSTEM = """You are a strict code reviewer for Python services.
Output JSON matching the tool schema. If the diff is empty or unreadable,
output {"verdict":"UNKNOWN","reason":"..."} and stop."""
```

## Output Format

```markdown
## Code Smell Report

**Total Smells**: 41

### By Category
| Category          | Count | Severity |
|-------------------|-------|----------|
| Bloaters          | 15    | High     |
| Dispensables      | 11    | Medium   |
| Couplers          |  5    | Medium   |
| Change Preventers |  3    | High     |
| ML pipeline       |  4    | High     |
| LLM prompt        |  3    | Medium   |

### Critical Smells
1. **God Class**: `OrderService.ts` (850 lines, 7 responsibilities)
   Fix: Extract PaymentService, InventoryService, NotificationService.
2. **Data Leakage**: `train.py:48` — `StandardScaler().fit_transform(X)` before split.
   Fix: wrap in `sklearn.pipeline.Pipeline`, fit after `train_test_split`.
3. **Feature Envy**: `User.calculate_order_discount()` reads 8 Order fields.
   Fix: move to Order or create DiscountCalculator.

### Refactoring Priority
1. Data Leakage (High impact, low effort) — correctness defect, fix first.
2. God Class (High impact, high effort).
3. Feature Envy (High impact, low effort).
4. Long Methods (Medium impact, medium effort).
```

## Severity — internal triage vs. refinement-loop output

This skill uses an **internal triage view** for the human-readable report and a **single `critical` field on the refinement-loop letter**. The mapping below reconciles them.

| Triage tier | Examples                                                                                        | Internal action       | Letter `severity` (wire) |
|-------------|-------------------------------------------------------------------------------------------------|-----------------------|--------------------------|
| CRITICAL    | Data Leakage in ML pipeline; God Class > 1500 lines; Shotgun Surgery touching > 10 files        | Block phase advance   | `critical`               |
| HIGH        | Long Method > 100 lines; Feature Envy; Divergent Change; God Prompt; Hallucination feedback loop | Block phase advance   | `critical`               |
| MEDIUM      | Long Parameter List 5–6; Data Clumps; Generic Role; Magic Numbers in hot paths                  | Fix this sprint       | `critical`               |
| LOW         | Comments-as-explanation; Lazy Class; Speculative Generality                                     | Backlog               | `critical`               |

Why: per [warnings-are-critical](../../../agents/_shared/warnings-are-critical.md), the refinement-loop schema rejects soft tiers. Triage labels stay in the report body so reviewers can prioritize; the wire is uniformly `critical`. The integrator then uses `confidence`, `corroborated_by`, and `refactor_effort` to weight findings within the critical bucket.

## Tool Integration (2026 landscape)

| Tool                         | Strengths                                                                  | Trade-offs                                          | When                              |
|------------------------------|----------------------------------------------------------------------------|-----------------------------------------------------|-----------------------------------|
| **SonarQube / SonarCloud**   | Large rule set tagged as "Code Smell"; cognitive-complexity score; multi-lang | "Code Smell" issue type ≠ Fowler's catalog directly | Every PR, CI gate              |
| **jscpd**                    | Cross-language duplicate-code detector (JS, TS, Python, Java, C#, ...)      | Duplicates only, not other smell families           | Pair with this skill on every PR  |
| **JDeodorant**               | Eclipse plugin: Long Method, Feature Envy, God Class — research-grade      | Java only; IDE plugin, not CI-friendly              | Java refactoring deep-dive        |
| **PMD**                      | Java + Apex + Visualforce rules incl. design smells                         | Java family only                                    | Java/JVM projects                 |
| **Designite / DesigniteJava**| Architectural + design + implementation smells                              | Commercial for non-academic use                     | Architecture review               |
| **.NET CodeMaid / Roslyn**   | Roslyn analyzers (FxCop successors) cover ~150 design + maintainability rules | .NET only                                         | Every .NET PR                     |
| **MLScent**                  | 76 ML-specific detectors across TF / PyTorch / sklearn / HF (2025)         | ML-only, AST-based, Python-only at v1               | Any repo with `requirements.txt` containing sklearn / torch / tensorflow |
| **great_expectations / Pandera** | Data-quality contracts at the DataFrame level — catches NaN-swallow, schema drift | Data smells, not code smells per se               | ML data ingest                    |
| **promptfoo / DeepEval**     | LLM prompt eval suites; catch generic-role and missing-unknown-path drift  | LLM-only                                            | LLM apps and agents               |

Example CI invocation:

```bash
# SonarQube scan (server-side)
sonar-scanner -Dsonar.projectKey=myproj -Dsonar.sources=src

# Duplicate code across the repo
npx jscpd --min-tokens 70 --reporters html,json --output ./jscpd-report .

# .NET design + maintainability
dotnet build /warnaserror /p:AnalysisMode=All

# ML smells
pip install mlscent
mlscent --path ./training --out mlscent.json

# Data contracts
pip install pandera great_expectations
```

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+smell_kind)[:12]>   # fingerprint for dedup
severity: critical                                       # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                          # high = corroborated; low = single-tool
smell_kind: long-method | god-class | feature-envy | data-leakage | god-prompt | ...
fowler_category: bloater | oo-abuser | change-preventer | dispensable | coupler | ml | llm
target_file: src/services/order.py
target_line: 142
target_symbol: "OrderService.process_order"             # function / class / proc name when resolvable
metric:                                                 # measurement that triggered the smell
  kind: lines_of_code | cyclomatic_complexity | param_count | nesting_depth | fit_before_split
  value: 187
  threshold: 50
refactor_suggestion: "Extract validate(), calculateTotals(), processPayment() — guard clauses on input"
refactor_effort: low | medium | high
engine: sonarqube | jscpd | mlscent | pmd | roslyn | manual
rule_id: <tool rule id, e.g. java:S138 for too-many-lines>
corroborated_by: [<other engines that also flagged this>]
cross_link:
  - quality/complexity-reducer                          # when smell is bloater-class
  - quality/duplicate-code-detector                     # when smell is duplicate-code
  - quality/dead-code-detector                          # when smell is dead-code
message: "Long Method: process_order is 187 lines (threshold 50)"
reference: https://refactoring.guru/refactoring/smells/long-method
```

The integrator uses `confidence`, `corroborated_by`, and `refactor_effort` to weight findings within the `critical` bucket. A `confidence: low` single-source finding doesn't block phase advancement on its own; two engines agreeing escalates it. `refactor_effort: high` smells (e.g., God Class spanning 850 lines) may be deferred to the plan's `## Decisions Taken Under Ambiguity` with a documented migration window — never silently dropped.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every smell you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Smells block phase advancement until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a smell today is a refactor blocker tomorrow and a re-architecture cost next quarter. Code that ships green-with-smells ships with known latent design debt.
