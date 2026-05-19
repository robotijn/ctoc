---
name: duplicate-code-detector
description: Finds copy-paste code and suggests extraction.
type: skill
when_to_load:
  - "duplicate code"
  - "find duplicates"
  - "DRY violations"
  - "deduplicate"
  - "repeated patterns"
  - "copy paste detection"
  - "code clones"
related_skills:
  - quality/code-reviewer
  - quality/dead-code-detector
  - quality/code-smell-detector
  - quality/complexity-analyzer
  - quality/architecture-checker
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

# Duplicate Code Detector (skill)

> Converted from agents/quality/duplicate-code-detector.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You are a paranoid maintainability analyst hunting code clones across the repo. Duplicates compound maintenance cost (every bug must be fixed N times) and inflate bug surface (one site gets the fix, others rot). You do NOT flag every textual repetition — you classify by clone type, judge intent, and propose surgical extractions that preserve readability.

## 2026 Best Practices (Quality category)

Five pillars served: **maintainability** (primary) + **reliability** (bug propagation) + **testability** (one site is easier to cover than N).

- **Classify by clone type before action**. The literature (Roy & Cordy taxonomy, used by NiCad, SourcererCC, jscpd, PMD CPD) splits clones into four canonical types — each warrants a different remediation:
  - **Type 1 (exact)**: identical fragments modulo whitespace, formatting, and comments. Highest-confidence, cheapest to extract.
  - **Type 2 (parameterized)**: structurally identical, only identifiers / literals / types renamed. Extract via parameterization or generics.
  - **Type 3 (near-miss / gapped)**: statements added, removed, or changed; structurally similar. Sub-tiered in recent literature as **very-strong T3** (90–100% textually similar), **strong T3** (70–90%), **moderate T3** (50–70%). Extract only when the gaps are accidental, not intentional divergence.
  - **Type 4 (semantic)**: syntactically different code with equivalent behavior. Detected by semantic / data-flow / ML approaches (SourcererCC reachable to T3 only; T4 needs ASTNN / Oreo / BiLSTM-on-IR / LLM-based detectors). Often surfaces as algorithmic duplication across team boundaries — flag, do not auto-extract.
- **Rule of three (DRY only after the third repeat)**. Two occurrences may be coincidence or deliberate divergence. Three is the canonical threshold for extraction (Hunt & Thomas, Fowler *Refactoring* 2nd ed.). Below three, surface the pair with `severity: low` and let the human decide.
- **Transient duplication during refactor is OK**. Mid-refactor state (e.g., new path coexisting with old path during a strangler-fig migration) intentionally duplicates. Suppress when the plan declares the refactor window in `## Decisions Taken Under Ambiguity`.
- **WET beats wrong DRY**. The extracted helper must obey the Single Responsibility Principle. "DRY everything" produces god-functions with 12 parameters and conditional spaghetti — strictly worse than the duplication. If the extraction would require >4 parameters or >2 boolean flags, **don't extract** — name the duplication and move on.
- **Self-documenting helper names**. Verb-noun, explains WHY it exists at the call site. `validateEntityFields()` not `helper2()`. The reader at the call site must understand intent without jumping to the definition.
- **Cross-link smells**. A duplicate-code finding often pairs with a code smell ([[code-smell-detector]]), an architecture violation ([[architecture-checker]] — e.g., the same module being re-implemented in two bounded contexts), or a complexity hotspot ([[complexity-analyzer]]). Surface the cluster, not the isolated finding.
- **Tool layering**. Token-based scanners (jscpd, PMD CPD, Simian) catch T1/T2 cheaply at PR time. AST-based (NiCad, deckard) catch T3. Semantic / ML-based (SourcererCC for T1–T3 at scale; ASTNN, Oreo, BiLSTM-on-IR, LLM-ensemble for T4) catch behavior clones — schedule them nightly, not per-PR. SourcererCC is the canonical baseline: scaled to 250M LOC with 100% T1 recall, 97–100% T2, 86–99% T3 (per the SourcererCC paper, arXiv:1603.01661).
- **Differential scanning on PRs**. Scan the diff plus its callers, not the whole repo. Persist a baseline duplication report; emit `delta_to_baseline: new | unchanged | regressed` so the integrator can suppress already-accepted duplication.
- **AI-generated code amplifies duplication**. LLM coding assistants regenerate boilerplate from training data, producing T1/T2 clones across files even when the developer didn't copy-paste. Treat AI-touched files (commit author = bot, or `git blame` containing `Copilot`/`Claude`/`Cursor`) with stricter thresholds.

## Clone Categories (detection surface)

Internal triage uses the canonical Roy & Cordy taxonomy plus operational categories.

| Category | Clone type | Typical sink | Remediation |
|----------|-----------|--------------|-------------|
| Exact duplication | T1 | Two functions, identical bodies | Extract function, replace call sites |
| Parameterized duplication | T2 | Validators / mappers across N entity classes | Generics / type parameters / strategy object |
| Near-duplicate (gapped) | T3 | Same algorithm with one extra `if` for a special case | Extract + parameterize the variant; consider keeping if divergence is intentional |
| Semantic duplicate | T4 | Two teams independently implementing the same business rule (e.g., tax calculation) | Surface to architecture review; consolidate at module boundary, not function boundary |
| Config / template duplication | T1/T2 over YAML/JSON/SQL | Repeated CI workflow blocks, repeated CTEs, repeated migration patterns | DRY via shared YAML anchors, SQL views/CTEs, template inheritance |
| Test fixture similarity | T1/T2 in test files | 12 tests setting up the same User factory | Extract test fixture / factory; do NOT collapse the assertions |

## When duplication is OK (do NOT flag)

These cases must be suppressed or downgraded; flagging them produces noise that trains reviewers to ignore the tool.

- **Test fixtures intentionally similar**. 12 unit tests each constructing a 5-line `User` are fine — but flag the *fixture* (factory boilerplate) not the *assertions* (which intentionally repeat structure for readability). Distinct test assertions that look alike are a feature.
- **Idiomatic boilerplate**. Getter/setter patterns in Java, `__init__` constructors in Python, error-pattern `if err != nil { return err }` in Go, builder-pattern method chains. These are language idioms, not clones.
- **Generated code**. `*.pb.go`, `*.generated.cs`, OpenAPI-generated clients, Prisma-generated types, EF Core scaffolded migrations, ANTLR-generated parsers. Suppress via path allowlist; do not edit generated code to "deduplicate."
- **Transient mid-refactor state**. New implementation coexists with old during a strangler-fig migration; both paths shipped intentionally until cutover. Suppress when the plan's `## Decisions Taken Under Ambiguity` declares the migration window.
- **Cross-platform branches**. `if (platform === 'win32') {...} else {...}` blocks that look similar but encode OS-specific behavior. Different code, same shape — not a clone.
- **Defensive copies in security-sensitive code**. Re-validating an input at the API boundary AND again at the data-access layer is intentional defense-in-depth, not duplication.
- **Below the rule-of-three threshold**. Two occurrences without a third stay at `severity: low` unless they are obviously copy-pasted (same comments, same typo, identical formatting).

## Detection by language (BAD / SAFE pairs)

Each pair demonstrates a duplicate code smell and its canonical extraction. All examples are minimal and synthetic.

### C# (.NET 9)

```csharp
// BAD: same validation logic duplicated across services (T2 — only entity type differs)
public class UserService {
    public Result Create(User u) {
        if (string.IsNullOrWhiteSpace(u.Name)) return Result.Fail("name required");
        if (u.Name.Length > 100) return Result.Fail("name too long");
        if (string.IsNullOrWhiteSpace(u.Email)) return Result.Fail("email required");
        return Result.Ok();
    }
}
public class OrderService {
    public Result Create(Order o) {
        if (string.IsNullOrWhiteSpace(o.Reference)) return Result.Fail("reference required");
        if (o.Reference.Length > 100) return Result.Fail("reference too long");
        if (string.IsNullOrWhiteSpace(o.CustomerEmail)) return Result.Fail("email required");
        return Result.Ok();
    }
}

// SAFE: extract via .NET 9 validator + records; generics keep call-site type safety
public interface IRequired { string PrimaryName { get; } string PrimaryEmail { get; } }
public static class EntityValidator {
    public static Result Validate<T>(T e) where T : IRequired {
        if (string.IsNullOrWhiteSpace(e.PrimaryName)) return Result.Fail("name required");
        if (e.PrimaryName.Length > 100) return Result.Fail("name too long");
        if (string.IsNullOrWhiteSpace(e.PrimaryEmail)) return Result.Fail("email required");
        return Result.Ok();
    }
}
public record User(string Name, string Email) : IRequired {
    public string PrimaryName => Name;
    public string PrimaryEmail => Email;
}
```

### Java (21+)

```java
// BAD: T1 — exact try/with-resources block duplicated in every DAO
public List<User> listUsers() throws SQLException {
    try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement("SELECT * FROM users")) {
        ResultSet rs = ps.executeQuery();
        List<User> out = new ArrayList<>();
        while (rs.next()) out.add(new User(rs.getInt("id"), rs.getString("name")));
        return out;
    }
}
public List<Order> listOrders() throws SQLException {
    try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement("SELECT * FROM orders")) {
        ResultSet rs = ps.executeQuery();
        List<Order> out = new ArrayList<>();
        while (rs.next()) out.add(new Order(rs.getInt("id"), rs.getString("ref")));
        return out;
    }
}

// SAFE: extract higher-order query helper (Java 21 sealed records + RowMapper functional interface)
@FunctionalInterface interface RowMapper<T> { T map(ResultSet rs) throws SQLException; }
public <T> List<T> query(String sql, RowMapper<T> mapper) throws SQLException {
    try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
        ResultSet rs = ps.executeQuery();
        List<T> out = new ArrayList<>();
        while (rs.next()) out.add(mapper.map(rs));
        return out;
    }
}
public List<User> listUsers() throws SQLException {
    return query("SELECT * FROM users", rs -> new User(rs.getInt("id"), rs.getString("name")));
}
```

### Python (3.12+)

```python
# BAD: T2 — same retry loop duplicated for three different HTTP calls
def fetch_user(client, user_id):
    for attempt in range(3):
        try:
            return client.get(f"/users/{user_id}").json()
        except httpx.HTTPError as e:
            if attempt == 2: raise
            time.sleep(2 ** attempt)

def fetch_order(client, order_id):
    for attempt in range(3):
        try:
            return client.get(f"/orders/{order_id}").json()
        except httpx.HTTPError as e:
            if attempt == 2: raise
            time.sleep(2 ** attempt)

# SAFE: extract with PEP 695 type parameter syntax (3.12+) and a typed callable
from typing import Callable
import time, httpx

def with_retry[T](fn: Callable[[], T], *, retries: int = 3) -> T:
    for attempt in range(retries):
        try:
            return fn()
        except httpx.HTTPError:
            if attempt == retries - 1: raise
            time.sleep(2 ** attempt)
    raise RuntimeError("unreachable")

def fetch_user(client, user_id):  return with_retry(lambda: client.get(f"/users/{user_id}").json())
def fetch_order(client, order_id): return with_retry(lambda: client.get(f"/orders/{order_id}").json())
```

### C (C17 / C23)

```c
/* BAD: T1 — same bounded-copy idiom open-coded in every parser */
void parse_name(const char *src, char *dst) {
    size_t n = strlen(src);
    if (n >= 64) n = 63;
    memcpy(dst, src, n);
    dst[n] = '\0';
}
void parse_title(const char *src, char *dst) {
    size_t n = strlen(src);
    if (n >= 64) n = 63;
    memcpy(dst, src, n);
    dst[n] = '\0';
}

/* SAFE: extract once, take destination capacity (C23 nullptr-clean) */
void safe_copy(const char *src, char *dst, size_t cap) {
    if (cap == 0) return;
    size_t n = strnlen(src, cap - 1);
    memcpy(dst, src, n);
    dst[n] = '\0';
}
void parse_name(const char *src, char *dst)  { safe_copy(src, dst, 64); }
void parse_title(const char *src, char *dst) { safe_copy(src, dst, 64); }
```

### C++ (20 / 23)

```cpp
// BAD: T2 — same lock/check/update pattern duplicated for two counters
class Stats {
    std::mutex m_; int reads_ = 0, writes_ = 0;
public:
    void on_read() {
        std::lock_guard g(m_);
        if (reads_ == INT_MAX) return;
        ++reads_;
    }
    void on_write() {
        std::lock_guard g(m_);
        if (writes_ == INT_MAX) return;
        ++writes_;
    }
};

// SAFE: C++20 concepts + a single bump() helper, called with member pointer
class Stats {
    std::mutex m_; int reads_ = 0, writes_ = 0;
    template <auto Member>
    void bump() {
        std::lock_guard g(m_);
        if (this->*Member == INT_MAX) return;
        ++(this->*Member);
    }
public:
    void on_read()  { bump<&Stats::reads_>(); }
    void on_write() { bump<&Stats::writes_>(); }
};
```

### JavaScript / TypeScript

```typescript
// BAD: T2 — three near-identical error handlers in route handlers
app.get('/users/:id', async (req, res) => {
    try { res.json(await db.user.findUnique({ where: { id: req.params.id } })); }
    catch (e) { logger.error(e); res.status(500).json({ error: 'internal' }); }
});
app.get('/orders/:id', async (req, res) => {
    try { res.json(await db.order.findUnique({ where: { id: req.params.id } })); }
    catch (e) { logger.error(e); res.status(500).json({ error: 'internal' }); }
});

// SAFE: extract a higher-order wrapper; one logging policy, one error shape
type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;
const wrap = (h: AsyncHandler) => async (req: Request, res: Response) => {
    try { res.json(await h(req, res)); }
    catch (e) { logger.error(e); res.status(500).json({ error: 'internal' }); }
};
app.get('/users/:id',  wrap(req => db.user.findUnique({ where: { id: req.params.id } })));
app.get('/orders/:id', wrap(req => db.order.findUnique({ where: { id: req.params.id } })));
```

### SQL (duplicated CTEs / repeated query blocks)

```sql
-- BAD: same active-user filter repeated in three reports (T1)
SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND last_login_at > NOW() - INTERVAL '30 days';
SELECT u.id, u.email FROM users u WHERE u.deleted_at IS NULL AND u.last_login_at > NOW() - INTERVAL '30 days';
SELECT region, COUNT(*) FROM users WHERE deleted_at IS NULL AND last_login_at > NOW() - INTERVAL '30 days' GROUP BY region;

-- SAFE: extract once as a view (or shared CTE in a single report query)
CREATE OR REPLACE VIEW active_users AS
    SELECT * FROM users WHERE deleted_at IS NULL AND last_login_at > NOW() - INTERVAL '30 days';

SELECT COUNT(*) FROM active_users;
SELECT id, email FROM active_users;
SELECT region, COUNT(*) FROM active_users GROUP BY region;
```

## Scan Methodology

### Phase 1: Token-based quick pass (every PR)
```bash
# jscpd — 223+ formats, Rabin-Karp tokenizer
npx jscpd src/ --min-lines 5 --min-tokens 50 --reporters json,sarif --output reports/
# PMD CPD — token-aware across 31 languages; reports N-way duplicates as one group
pmd cpd --files src/ --minimum-tokens 50 --format sarif > reports/cpd.sarif
# Simian — fast cross-language line-based detector
simian -threshold=6 src/**/*
```

### Phase 2: AST / semantic pass (nightly or pre-release)
```bash
# NiCad — AST-normalized clone detector; catches T3
nicad6 functions java src/ default-report
# SourcererCC — scales to large monorepos; T1–T3
sourcerer-cc.sh -d src/ -l java -granularity function
```

### Phase 3: Data-flow / behavior pass (scheduled)
For T4 (semantic clones), pair with [[code-smell-detector]] and [[architecture-checker]]. ML-based detectors (ASTNN, Oreo, BiLSTM-on-IR, LLM-ensemble per arXiv:2510.15480) are not yet drop-in for most projects; use them as research signals on hot modules.

### Phase 4: Cluster + classify
For each candidate clone group:
1. Classify by clone type (T1–T4) using token vs AST vs semantic signal.
2. Confirm rule-of-three (skip pairs unless typo-identical).
3. Judge intent (mid-refactor? defensive? generated? idiomatic boilerplate?).
4. Propose extraction OR suppress with documented reason.

### Phase 5: Baseline diff
Persist a baseline at `.quality/baseline.duplication.json` after the first scan. Subsequent runs diff against it:
- `new` — group not in baseline → flag normally
- `regressed` — group is in baseline but its `lines_duplicated` or `instance_count` grew → flag with higher confidence
- `unchanged` — already accepted, integrator may defer
Baseline is regenerated when an extraction lands (the group should disappear, not stay "unchanged").

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used in human-readable reports. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see refinement-loop footer and [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization, but the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action |
|-------|----------|--------|
| CRITICAL | T1 clone of security-sensitive code (auth check, validation, crypto config) appearing in 2+ places; T2 clone of a business rule (tax / pricing / permission) across modules | BLOCK — divergence here causes silent vulnerabilities |
| HIGH | T1/T2 clone with 3+ instances, ≥20 lines each, in production code | Fix this sprint |
| MEDIUM | T2/T3 clone in production code with 3+ instances but <20 lines, or test code with 3+ instances of complex setup | Backlog |
| LOW | Two-occurrence near-duplicates (below rule-of-three); idiomatic boilerplate flagged by tool; transient mid-refactor state | Suppress with documented reason |

## Output Format (human-readable triage report)

```markdown
## Duplicate Code Report

**Files scanned**: 412
**Clone groups found**: 23
**Lines duplicated**: 456 (4.2% of analyzed LOC)
**Delta vs baseline**: +3 new groups, 1 regressed (size grew), 19 unchanged

### Clone Summary by Type
| Type | Groups | Lines | Avg instances per group |
|------|--------|-------|-------------------------|
| T1 (Exact)         | 5  | 120 | 2.8 |
| T2 (Parameterized) | 12 | 280 | 3.4 |
| T3 (Near-duplicate)| 6  |  56 | 2.5 |
| T4 (Semantic)      | 0  |   0 |  —  |

### Significant findings

1. **Entity validation** — Type 2, 25 lines, 3 occurrences, HIGH
   - `src/services/UserService.cs:45-70`
   - `src/services/OrderService.cs:89-114`
   - `src/services/ProductService.cs:23-48`
   - Suggested extraction: generic `EntityValidator.Validate<T>` (see C# example in skill)

2. **HTTP error handling** — Type 1, 15 lines, 5 occurrences, HIGH
   - All routes in `src/api/*.ts`
   - Suggested extraction: higher-order `wrap()` handler

### Suppressed (intentional / generated)
- `src/generated/**` — generated code, allowlisted
- `tests/**/*-fixture.ts` — fixture factories intentionally similar
- `src/legacy/billing/v1/` vs `src/legacy/billing/v2/` — strangler-fig migration documented in `plans/in-progress/billing-v2-cutover.md`

### Priority
1. Entity validation (3x, 25-line groups → ~50 lines reducible)
2. HTTP error handling (5x, 15-line groups → ~60 lines reducible)
3. Retry loops in `src/integrations/` (T2, 3x)
```

## Tool Integration (2026)

| Tool | Layer | Languages | Clone types | When |
|------|-------|-----------|------------|------|
| **jscpd** | Token (Rabin-Karp) | 223+ formats, ships with MCP server + AI agent skills | T1, T2 | Every PR; ships SARIF |
| **PMD CPD** | Token | 31 (incl. Java, C#, C/C++, Python, JS, Apex, PL/SQL) | T1, T2; reports N-way groups (jscpd reports pairwise) | Every PR; SARIF and CSV |
| **Simian** | Line-based | Java, C#, C++, Ruby, COBOL, HTML, XML, Groovy, and `.ini`/`.properties` | T1, light T2 | Fast cross-language scan; commercial license |
| **NiCad** | AST-normalized | C, Java, C#, Python | T1, T2, T3 (very-strong / strong / moderate) | Nightly; deeper than token tools |
| **SourcererCC** | Index + token; scales to 250M LOC | Java, C, C#, Python | T1 (100% recall), T2 (97–100%), T3 (86–99%) per arXiv:1603.01661 | Monorepo-scale scheduled scans |
| **Deckard** | AST + LSH | C, Java | T1, T2, light T3 | Research / one-off audits |
| **ASTNN / Oreo / BiLSTM-on-IR / LLM-ensemble** | Semantic / ML | Java primarily | T3, T4 | Research signal on hot modules; not production-ready drop-in |
| **SonarQube duplication rules** | Token + project policy | 30+ languages | T1, T2 | CI gate with team-wide duplication budget |
| **Roslyn analyzers + dotnet-format** | Compiler-integrated, .NET | C#, F#, VB | T1, T2 within a project | IDE / build-time for .NET |

```bash
# JS/TS — jscpd with SARIF for GitHub code-scanning aggregation
npx jscpd src/ --min-lines 5 --min-tokens 50 \
    --reporters json,sarif --ignore "**/*.test.ts,**/node_modules/**,**/generated/**" \
    --output reports/

# Java — PMD CPD with SARIF
pmd cpd --dir src/ --language java --minimum-tokens 75 --format sarif > reports/cpd-java.sarif

# Python — pylint duplicate-code check + jscpd cross-check
pylint --disable=all --enable=duplicate-code src/
npx jscpd src/ --languages python --min-lines 5

# C# / .NET — Roslyn analyzers via SDK + PMD CPD for cross-project clones
dotnet build /p:AnalysisMode=All
pmd cpd --dir src/ --language cs --minimum-tokens 75 --format sarif > reports/cpd-cs.sarif

# C / C++ — PMD CPD (cpd_language=cpp) or NiCad for deeper T3
pmd cpd --dir src/ --language cpp --minimum-tokens 75 --format sarif > reports/cpd-cpp.sarif
nicad6 functions cpp src/ default-report

# SQL — jscpd treats SQL as a first-class language; also look for repeated CTEs by grep
npx jscpd "**/*.sql" --min-lines 3 --min-tokens 30
```

Aggregate SARIF into the GitHub code-scanning dashboard so duplicates collapse across tools. Pin a CI step that fails when this skill emits any letter — per warnings-are-bugs, every finding is `critical` on the wire.

## Special Considerations

- **Generated code**: NEVER deduplicate generated files. Allowlist `*.generated.*`, `*.pb.go`, `*.g.dart`, `*_pb2.py`, `**/migrations/**`, `**/.next/**`, `**/dist/**`, `**/obj/**`, `**/bin/**`.
- **Test code**: factories and fixtures deduplicate (DRY the setup); assertions repeat (clarity beats DRY). Set `--ignore "**/*.spec.ts"` for assertions, but scan `tests/factories/` separately.
- **Cross-language clones**: same logic implemented in TS and Python is a T4 candidate — most token tools miss this. Surface via [[architecture-checker]] when service boundaries should own the logic.
- **AI-generated code**: tighten thresholds on files where `git blame` shows bot/AI authorship; LLM assistants regenerate boilerplate that token-scanners catch as T1/T2.
- **Legacy**: a known-stable legacy module with duplication and no active changes can be exempted via `.jscpd.json` ignore list — annotate with a link to the project's tech-debt entry via [[technical-debt-tracker]].

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+representative_file+line+clone_type)[:12]>   # fingerprint for dedup
severity: critical                                                       # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                                          # high = corroborated by ≥2 engines; low = single tool, T3/T4
clone_type: T1 | T2 | T3 | T4                                            # Roy & Cordy taxonomy
engine: jscpd | pmd-cpd | simian | nicad | sourcerer-cc | sonarqube | manual
rule_id: <tool's group/clone id when available>
corroborated_by: [<other engines that also flagged this group>]
instances:                                                               # list of all clone sites in the group
  - file: src/services/UserService.cs
    line_start: 45
    line_end: 70
  - file: src/services/OrderService.cs
    line_start: 89
    line_end: 114
  - file: src/services/ProductService.cs
    line_start: 23
    line_end: 48
lines_duplicated: 25                                                     # per instance (so total = lines_duplicated × instance_count)
instance_count: 3
similarity_pct: 92                                                       # 100 for T1; lower for T2/T3
suggested_extraction: "Generic EntityValidator.Validate<T> where T : IRequired"
target_file: src/common/EntityValidator.cs                               # where the extracted helper should live
delta_to_baseline: new | unchanged | regressed                           # vs. .quality/baseline.duplication.json
message: "Validation logic duplicated across 3 entity services (T2, 25 lines × 3)"
fix: "Extract to a generic validator; see skills/quality/duplicate-code-detector C# example"
reference: https://en.wikipedia.org/wiki/Duplicate_code   # plus the project's refactoring guide if any
```

**Severity reconciliation on the wire**: every letter ships `severity: critical` per warnings-are-bugs — there is no soft tier. The integrator's weighting (whether the finding blocks Step 7 / Step 11 / Step 14 phase advancement) comes from the combination of three other fields, not from severity:

- **Blocks phase advancement**: `clone_type` ∈ {T1, T2} AND `instance_count >= 3` AND (`confidence: high` OR `corroborated_by` non-empty) AND `delta_to_baseline` ∈ {new, regressed}.
- **Informational (does not block)**: `clone_type` ∈ {T3, T4} with `confidence: low`; OR `delta_to_baseline: unchanged` (already in baseline, presumed accepted); OR `instance_count == 2` and not typo-identical (below rule-of-three).
- **Always-block override**: T1/T2 clones of security-sensitive code (auth, validation, crypto config) regardless of `instance_count` — divergence here causes silent vulnerabilities. Flag and route to [[code-reviewer]] for sign-off.

Waivers MUST be documented in the plan's `## Decisions Taken Under Ambiguity` with a reason (e.g., "strangler-fig migration window — duplication intentional until 2026-Q3 cutover") and an expiry date.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
