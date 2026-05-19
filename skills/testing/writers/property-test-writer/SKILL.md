---
name: property-test-writer
description: Writes property-based tests using Hypothesis/fast-check/jqwik/FsCheck/rapidcheck/proptest to discover edge cases via shrinking and invariants.
type: skill
when_to_load:
  - "write property test"
  - "property based test"
  - "property-based test"
  - "hypothesis test"
  - "fast-check test"
  - "jqwik test"
  - "FsCheck test"
  - "rapidcheck test"
  - "proptest"
  - "find edge cases"
  - "invariant test"
  - "round-trip test"
  - "model-based test"
related_skills:
  - testing/writers/unit-test-writer
  - testing/runners/mutation-test-runner
  - testing/runners/unit-test-runner
effort_level: high
model_optimized_for: opus-4-7
tools: Read, Write, Edit, Bash
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Property Test Writer (skill)

> Converted from agents/testing/writers/property-test-writer.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You write property-based tests that verify universal **invariants** hold across the entire input space, not just specific examples. Property tests excel at finding edge cases that example-based tests miss because the generator explores pathological inputs (empty, huge, Unicode, NaN, near-boundary) and the **shrinker** collapses any failure to the minimal reproducible counterexample.

## 2026 Best Practices (Testing category)

The 2026 consensus across the QuickCheck heritage (Haskell QuickCheck → Hypothesis, fast-check, jqwik, FsCheck, rapidcheck, PropEr, ScalaCheck, proptest) is that property-based testing has moved from a niche functional-programming tool to a standard layer in mainstream test suites. Six load-bearing patterns:

- **Focus on invariants, not examples.** A property names a truth that holds for *every* valid input: round-trip (`decode(encode(x)) == x`), idempotency (`f(f(x)) == f(x)`), associativity (`(a∘b)∘c == a∘(b∘c)`), commutativity (`a+b == b+a`), monotonicity (`x ≤ y → f(x) ≤ f(y)`), preservation (length / sum / set-membership invariants). Properties survive refactors better than examples because the truth itself doesn't change when the implementation does.
- **Shrinking is the killer feature — never disable it.** When a generator finds a 500-element list with three special characters that triggers a bug, the shrinker keeps simplifying until it produces the minimum failing input (often: `[""]` or `[0]`). That minimal case is what makes the bug fixable. Frameworks that don't shrink (or where you opted out) leave you debugging a wall of random data. Hypothesis, fast-check, jqwik, FsCheck, and rapidcheck all shrink by default — keep it that way.
- **Combine with example-based tests, never replace.** Example tests document *intent* in human-readable form ("the empty cart returns total = 0") and serve as regression markers for specific historical bugs. Property tests test universal truths. Use both: example tests for the spec narrative and shipped regressions; property tests for the surface no human will enumerate.
- **Best targets are pure functions, parsers, serializers, encoders, calculators, data transforms.** These have well-defined inputs and outputs, no side effects, and natural round-trip / idempotency / oracle properties. Reach for property tests *first* on any code that converts between representations (JSON, protobuf, URL params, base64), normalizes data, computes deterministic results, or implements an algorithm with a known reference.
- **Budget shrink depth, generator complexity, and example counts deliberately.** CI runs need to stay under their time budget. Typical pattern: `max_examples=100` in PR CI (fast), `max_examples=1000` nightly, full shrink budget in both. Cap deep recursion explicitly (e.g. `st.recursive(..., max_leaves=50)`, `fc.letrec` with depth caps) — otherwise property tests can drift into combinatorial explosions that hide real failures behind timeouts.
- **Stateful / model-based testing for complex flows.** When the unit under test holds mutable state (caches, queues, ledgers, in-memory DBs, sessions), use Hypothesis `RuleBasedStateMachine`, fast-check `fc.commands`, jqwik `@StateMachine`, or QuickCheck-State-Machine equivalents. You write a simple deterministic *model* of the system; the framework generates random *sequences* of operations, runs them against both, and asserts they agree. This finds ordering bugs that single-call property tests can't.

Additional patterns you should also know:

- **Differential / oracle properties** — compare implementation against a reference (`fast_sort(xs) == sorted(xs)`, `new_parser(s) == legacy_parser(s)`). Excellent when refactoring or porting.
- **Metamorphic properties** — when an exact oracle is unavailable, test *relationships* between outputs (`distance(a,b) == distance(b,a)`, `len(filter(p, xs)) ≤ len(xs)`, `sum(map(2*, xs)) == 2*sum(xs)`).
- **Targeted property-based testing** — Hypothesis `target()` and similar in jqwik/proptest let you guide the generator toward inputs that *maximize* a metric (latency, branch coverage, output size). Catches performance regressions property tests would otherwise miss.
- **Pair with mutation testing.** Properties are excellent mutant killers — a `+ → -` mutation in addition fails commutativity instantly; an off-by-one in a length-preserving function dies under the preservation property. If your mutation score is low even with property tests, you're missing properties, not examples.
- **Seed and persist failures.** Every framework supports replaying a seed (`--hypothesis-seed`, `fc.assert(prop, { seed: ... })`). Persist counterexamples in a regression file (`.hypothesis/examples`, fast-check `examplesPath`) so a CI win sticks — once shrunk, the minimal case becomes a permanent regression test.

## Concept

Instead of:
```python
def test_reverse():
    assert reverse([1, 2, 3]) == [3, 2, 1]
```

Write:
```python
@given(lists(integers()))
def test_reverse_twice_is_identity(xs):
    assert reverse(reverse(xs)) == xs
```

The framework generates hundreds of inputs (empty, huge, Unicode, near-boundary, NaN where allowed) and shrinks any counterexample to its minimum failing form.

## Property Categories (with BAD / SAFE patterns)

These are the categories the critic engine scans for. Each shows code that **a property test would catch but example tests miss**, and the corrected property.

### 1. Invariants (length / sum / set-membership preservation)

```python
# BAD (example only — passes for [1,2,3] but misses empty/Unicode/huge cases)
def test_reverse_works():
    assert reverse([1, 2, 3]) == [3, 2, 1]

# SAFE (property): length preserved for ALL inputs
@given(text())
def test_length_preserved_after_reverse(s):
    assert len(reverse(s)) == len(s)
```

### 2. Round-Trip (serialize → deserialize, encode → decode, parse → print)

```python
# BAD (example only — only tests one user shape)
def test_user_json_roundtrip():
    u = User("alice", 30)
    assert User.from_json(u.to_json()) == u

# SAFE (property): roundtrip holds for ALL valid users
@given(builds(User, name=text(min_size=1), age=integers(0, 150)))
def test_user_serialize_deserialize_roundtrip(user):
    assert User.from_json(user.to_json()) == user
```

### 3. Idempotency (`f(f(x)) == f(x)`)

```python
# BAD (example only — passes for one input)
def test_sort_idempotent_example():
    assert sorted(sorted([3, 1, 2])) == sorted([3, 1, 2])

# SAFE (property): idempotent across all lists
@given(lists(integers()))
def test_sort_is_idempotent(xs):
    assert sorted(sorted(xs)) == sorted(xs)
```

### 4. Commutativity / Associativity (where applicable)

```python
# BAD (example only — misses overflow / NaN cases)
def test_add_commutes():
    assert add(2, 3) == add(3, 2)

# SAFE (property)
@given(integers(), integers())
def test_addition_commutative(a, b):
    assert add(a, b) == add(b, a)

@given(integers(), integers(), integers())
def test_addition_associative(a, b, c):
    assert add(add(a, b), c) == add(a, add(b, c))
```

### 5. Oracle / Differential (compare to reference implementation)

```python
# BAD (example only — only covers one input shape)
def test_fast_sort_works():
    assert fast_sort([3, 1, 2]) == [1, 2, 3]

# SAFE (property): matches the reference across all inputs
@given(lists(integers()))
def test_fast_sort_matches_builtin(xs):
    assert fast_sort(xs) == sorted(xs)
```

### 6. Monotonicity / Ordering

```python
@given(lists(integers()))
def test_sort_is_monotone(xs):
    out = sorted(xs)
    assert all(out[i] <= out[i + 1] for i in range(len(out) - 1))
```

### 7. Stateful / Model-Based (mutable state, sequences of operations)

```python
from hypothesis.stateful import RuleBasedStateMachine, rule, invariant

class CacheModel(RuleBasedStateMachine):
    def __init__(self):
        super().__init__()
        self.real = LRUCache(maxsize=10)
        self.model = {}

    @rule(k=text(), v=integers())
    def put(self, k, v):
        self.real[k] = v
        self.model[k] = v

    @rule(k=text())
    def get(self, k):
        assert self.real.get(k) == self.model.get(k)

    @invariant()
    def size_capped(self):
        assert len(self.real) <= 10
```

## Critic engine — categories it flags

When emitting findings via the refinement loop, the critic scans for and flags:

| Category | Pattern (BAD) | Property that would catch it |
|----------|---------------|------------------------------|
| Parsers / serializers without round-trip property | `parse()` and `serialize()` defined, only example tests | round-trip invariant |
| Calculators / pure functions with only single-example tests | `def compute_tax(x): ...` covered by `test_tax_for_100()` only | range scan with `@given` |
| Missing idempotency test on normalizers / formatters | `normalize_email()`, `format_phone()`, `trim()` with no `f(f(x))==f(x)` check | idempotency property |
| Missing commutativity/associativity where the operation is mathematically required | custom `add`/`merge`/`union` without algebraic checks | commutativity / associativity property |
| Missing length / sum preservation on transforms | `map`, `shuffle`, `reverse` with no preservation check | preservation invariant |
| Shrinking disabled or capped to zero | `settings(max_examples=N, deadline=None, phases=[Phase.generate])` excludes `Phase.shrink` | re-enable shrink |
| Shrink budget timed out / disabled at framework level | `fc.assert(..., { endOnFailure: true })`, `proptest! { #![proptest_config(Config { failure_persistence: None, ..  })] }` removing shrink | re-enable shrink, raise timeout |
| Property test asserting only "no exception thrown" | `@given(...) def test_no_crash(x): f(x)` — generator coverage masquerading as property | assert an actual property |
| Non-deterministic property without seeded RNG | property depends on `time.time()` or `random.random()` without `random.seed(seed)` | inject seed into generator |
| Stateful flows tested only as single-call properties | mutable cache / queue / DB with no `RuleBasedStateMachine` equivalent | model-based stateful test |
| Custom generator with no shrink strategy | `@composite` builder returning raw value without filter/map shrink path | use framework shrink-aware combinators |

## Tool Integration (2026)

Use the framework idiomatic to the target language. All listed frameworks shrink by default and integrate with the local example-test runner.

| Language / runtime | Framework | Integrates with | Shrinks | Notes (2026) |
|--------------------|-----------|-----------------|---------|--------------|
| Python 3.12+ | **Hypothesis** | pytest, unittest | yes | The reference implementation. Stateful (`RuleBasedStateMachine`), targeted (`target()`), persisted database of failing examples. |
| TypeScript / JS | **fast-check** | Vitest, Jest, Mocha, node:test | yes | `fc.assert(fc.property(...))`, `fc.commands` for stateful, `fc.letrec` for recursive generators. |
| Java 21+ | **jqwik** | JUnit 5 / 6 platform | yes | `@Property`, `@ForAll`, `@StateMachine`. In maintenance mode in 2026 (verify upstream activity before adopting for new projects). |
| Java 21+ | **junit-quickcheck** | JUnit 4/5 | yes | Annotation-driven, inspired by Haskell QuickCheck. Alternative when jqwik feels too heavy. |
| C# / .NET 9 | **FsCheck** | xUnit, NUnit, MSTest | yes | `Prop.ForAll`, `FsCheck.Xunit` for `[Property]` attribute on xUnit. Run with `dotnet test`. |
| C++20/23 | **rapidcheck** | gtest, Catch2, doctest | yes | `rc::check`, `rc::gen::*`. Header-only or CMake target. Stateful support via `rc::state::check`. |
| C (C11+) | **theft** | any C test runner | yes | Property-based testing for C with autoshrinking. `theft_run` entrypoint. |
| Rust | **proptest** | `cargo test` | yes | `proptest! { ... }` macro, `prop_assert_eq!`. `quickcheck` crate is the alternative (more QuickCheck-faithful, lighter). |
| Erlang / Elixir | **PropEr** / **PropCheck** | EUnit, ExUnit | yes | The original modern QuickCheck heir on the BEAM. Stateful via `proper_statem`. |
| Scala | **ScalaCheck** / **Stainless** | ScalaTest, MUnit | yes | Stainless adds formal verification on top of property tests. |
| F# | **FsCheck** | Expecto, xUnit | yes | Same engine as C#; idiomatic in F#. |
| Haskell | **QuickCheck** / **Hedgehog** | tasty, HUnit | yes | The ancestor. Hedgehog uses integrated shrinking. |
| PostgreSQL | **pgTAP + random row generators** | `pg_prove` | n/a (re-run with new seed) | Property-style: generate random rows, assert ALL invariants hold across the set. |

### Python — Hypothesis

```python
from hypothesis import given, strategies as st, settings, Phase

# BAD: example-only test for a calculator
def test_round_trip_example():
    assert decode(encode("hello")) == "hello"

# SAFE: property test with explicit shrink budget and seeded persistence
@given(st.text())
@settings(max_examples=200, phases=list(Phase))   # keep shrink enabled
def test_round_trip(s):
    assert decode(encode(s)) == s
```

### TypeScript — fast-check + Vitest

```typescript
// BAD: only tests one shape, misses Unicode / empty / huge inputs
import { test, expect } from 'vitest';
test('decode(encode(x)) === x for "hello"', () => {
  expect(decode(encode('hello'))).toBe('hello');
});

// SAFE: property test, shrink left on (default), bounded runs
import fc from 'fast-check';
test('decode(encode(x)) === x for all strings', () => {
  fc.assert(
    fc.property(fc.string(), (s) => decode(encode(s)) === s),
    { numRuns: 200 },   // CI budget; nightly bumps to 2000
  );
});
```

### Java 21+ — jqwik

```java
// BAD: single-input example with JUnit
@Test void roundTripHello() {
    assertEquals("hello", decode(encode("hello")));
}

// SAFE: jqwik property
@Property
boolean roundTrip(@ForAll String s) {
    return decode(encode(s)).equals(s);
}
```

### Java 21+ — junit-quickcheck (alternative)

```java
@RunWith(JUnitQuickcheck.class)
public class CodecProps {
    @Property public void roundTrip(String s) {
        assertEquals(s, decode(encode(s)));
    }
}
```

### C# / .NET 9 — FsCheck + xUnit

```csharp
// BAD: single example in xUnit
[Fact] public void RoundTrip_Hello() =>
    Assert.Equal("hello", Codec.Decode(Codec.Encode("hello")));

// SAFE: FsCheck property as an xUnit fact (FsCheck.Xunit)
[Property(MaxTest = 200)]
public bool RoundTrip(NonNull<string> s) =>
    Codec.Decode(Codec.Encode(s.Get)) == s.Get;
```

### C++20/23 — rapidcheck + Catch2

```cpp
// BAD: hand-written single case
TEST_CASE("round-trip hello") {
    REQUIRE(decode(encode("hello")) == "hello");
}

// SAFE: rapidcheck property
#include <rapidcheck.h>
#include <rapidcheck/catch.h>

TEST_CASE("round-trip") {
    rc::prop("decode(encode(s)) == s", [](const std::string &s) {
        RC_ASSERT(decode(encode(s)) == s);
    });
}
```

### C (C11+) — theft

```c
/* BAD: hand-rolled fixed inputs only */
static void test_roundtrip_hello(void) {
    assert(strcmp(decode(encode("hello")), "hello") == 0);
}

/* SAFE: theft property with shrinker */
#include <theft.h>

static enum theft_trial_res prop_roundtrip(struct theft *t, void *arg1) {
    const char *s = (const char *)arg1;
    char *enc = encode(s);
    char *dec = decode(enc);
    enum theft_trial_res r = (strcmp(s, dec) == 0) ? THEFT_TRIAL_PASS : THEFT_TRIAL_FAIL;
    free(enc); free(dec);
    return r;
}

int main(void) {
    struct theft_run_config cfg = {
        .name = "round-trip",
        .prop1 = prop_roundtrip,
        .type_info = { &theft_str_info },
        .trials = 200,
    };
    return theft_run(&cfg) == THEFT_RUN_PASS ? 0 : 1;
}
```

### Rust — proptest

```rust
// BAD: single-input #[test]
#[test] fn round_trip_hello() {
    assert_eq!(decode(&encode("hello")), "hello");
}

// SAFE: proptest property
use proptest::prelude::*;
proptest! {
    #[test]
    fn round_trip(s in ".*") {
        prop_assert_eq!(decode(&encode(&s)), s);
    }
}
```

### SQL — pgTAP + random row generators (property-style)

pgTAP doesn't ship a QuickCheck-style generator/shrinker, so the pattern is: **generate a random set of rows with `generate_series` + `random()` / `gen_random_uuid()`, then assert that ALL invariants hold across the set**. Re-run with a different seed (`SET seed = ...`) to scan more of the input space.

```sql
-- BAD: pgTAP test that only checks ONE row
SELECT plan(1);
SELECT is(
    (SELECT compute_total(items) FROM orders WHERE id = 1),
    99.99::numeric,
    'compute_total for order 1 returns 99.99'
);
SELECT * FROM finish();

-- SAFE: property-style — generate N random orders, assert invariants hold for ALL
BEGIN;
SELECT plan(3);

-- Setup: deterministic seed for reproducibility
SET LOCAL seed = 0.42;

-- Generate 1000 random orders with random line items
CREATE TEMP TABLE prop_orders AS
SELECT
    gen_random_uuid()        AS id,
    (random() * 1000)::numeric(10,2) AS unit_price,
    (random() * 100 + 1)::int        AS quantity
FROM generate_series(1, 1000);

-- Property 1: total = unit_price * quantity for every row (no rounding drift)
SELECT is(
    (SELECT count(*) FROM prop_orders
      WHERE compute_total(unit_price, quantity)
         <> round(unit_price * quantity, 2))::int,
    0,
    'compute_total preserves price*qty invariant for all rows'
);

-- Property 2: idempotency — recomputing yields the same result
SELECT is(
    (SELECT count(*) FROM prop_orders
      WHERE compute_total(unit_price, quantity)
         <> compute_total(unit_price, quantity))::int,
    0,
    'compute_total is deterministic / idempotent'
);

-- Property 3: monotonicity — doubling quantity at least doubles the total
SELECT is(
    (SELECT count(*) FROM prop_orders
      WHERE compute_total(unit_price, quantity * 2)
          < compute_total(unit_price, quantity) * 2 - 0.01)::int,
    0,
    'compute_total is monotone in quantity (within rounding)'
);

SELECT * FROM finish();
ROLLBACK;
```

The "shrink" in pgTAP-style property tests is manual: when a property fails, lower the row count and re-bisect to find the minimal failing seed/row. Persist failing seeds in a regression file (`tests/property/seeds.sql`) so they re-run.

## Custom Generators

```python
# Hypothesis — domain-shaped generator
emails = st.emails()
users = st.builds(
    User,
    name=st.text(min_size=1, max_size=100),
    email=emails,
    age=st.integers(min_value=0, max_value=150),
)

@given(users)
def test_user_invariants(user):
    assert user.is_valid()
```

```typescript
// fast-check — arbitrary with shrink-aware combinators
const user = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }),
  email: fc.emailAddress(),
  age: fc.integer({ min: 0, max: 150 }),
}).map(({ name, email, age }) => new User(name, email, age));
```

## Output Format

```markdown
## Property Tests Written

**Framework**: Hypothesis 6.151.x
**Test File**: `tests/property/test_properties.py`

**Properties Discovered**:
| Module | Property | Type |
|--------|----------|------|
| auth.password | hash/verify roundtrip | Round-trip |
| data.serializer | JSON roundtrip | Round-trip |
| utils.sort | sort is idempotent | Idempotent |
| utils.sort | sort matches sorted() | Oracle |
| math.add | addition commutative | Commutativity |
| math.add | addition associative | Associativity |
| cache.LRU | model-based 1000-step traces | Stateful |

**Custom Generators**:
- `valid_email` — RFC-compliant emails (via `st.emails()`)
- `user` — valid User objects with bounded age + non-empty name

**Settings**:
- `max_examples=200` PR CI
- `max_examples=2000` nightly
- Shrinking enabled (all phases)
- Seed persisted to `.hypothesis/examples`
```

## When to Reach for Properties

| Suited | Not suited |
|--------|------------|
| Pure functions | Side-effect-heavy code |
| Parsers and serializers | UI rendering |
| Encoders / decoders / codecs | Stateful workflows (use stateful Hypothesis or model-based) |
| Math, algorithms, sorting | Authorization decisions (use example tests) |
| Data transformations | External API integration |
| Compilers / type checkers / interpreters | Code with non-determinism you cannot seed |

## Red Lines

- **Never disable shrinking.** It's the entire reason property tests are usable.
- **Never assert "no exception thrown" alone** — that's coverage-as-test, not a property. Assert the actual invariant.
- **Never use property tests for non-deterministic code without seeding** the RNG / clock / network mock.
- **Never accept a shrunk counterexample without understanding why it fails.** The minimal case *is* the bug report.
- **Never write a custom generator that loses shrink information** (raw `lambda` returning values without using framework combinators) — the framework can't shrink what it didn't construct.
- **Never let one property mask another.** If a single `@given` test asserts five properties, a failure in one obscures the others. Split into five tests.

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when writing a human-readable property-test report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical` on the wire** per the warnings-are-bugs rule — there is no soft tier in the letter schema. The triage tiers below stay in the report body for prioritization, but the letter's `severity` field is always `critical`. The `confidence` field carries the nuance: clear missing-invariant findings (e.g. parser with no round-trip) are `confidence: high`; stylistic findings (e.g. example-count below PR-CI budget) are `confidence: low` and the integrator weights them down.

| Triage tier | Examples | Internal action recommendation | Wire confidence |
|-------------|----------|-------------------------------|-----------------|
| CRITICAL | Missing round-trip property on a serializer / parser; shrinking disabled; stateful component tested only as single-call | BLOCK | high |
| HIGH | Missing idempotency on normalizers; commutativity/associativity missing on algebraic operations; property asserts only "no exception"; non-deterministic property without seed | BLOCK | high |
| MEDIUM | Single-example test where a property would clearly catch more; custom generator without shrink-aware combinators; one `@given` multiplexing several unrelated properties | Fix soon | medium |
| LOW | Example counts below recommended PR-CI budget; missing seed persistence file | Backlog | low |

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>   # fingerprint for dedup
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                     # high = clear missing invariant; low = stylistic
engine: property-test-writer
kind: missing-round-trip | missing-idempotency | missing-commutativity | missing-associativity |
      missing-monotonicity | missing-preservation | missing-stateful-model |
      shrinking-disabled | shrinking-timeout-disabled | assertion-is-only-no-exception |
      non-deterministic-unseeded | custom-gen-loses-shrink | single-assertion-multiplexed
target_file: src/codecs/base64.py
target_line: 42
missing_invariant: "decode(encode(x)) == x for all bytes x"
suggested_property: |
  @given(st.binary())
  def test_base64_roundtrip(b):
      assert base64.b64decode(base64.b64encode(b)) == b
framework: hypothesis | fast-check | jqwik | junit-quickcheck | fscheck | rapidcheck | theft | proptest | proper | scalacheck | pgtap
message: "base64 codec has only example tests; missing universal round-trip property"
reference: https://hypothesis.readthedocs.io/en/latest/quickstart.html
```

The integrator uses `confidence` to weight findings. Two related findings (e.g. missing round-trip *and* missing idempotency on the same module) escalate together. `kind: shrinking-disabled` is always high-confidence because it's a syntactic check.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every missing invariant, disabled shrinker, no-exception-only assertion, and untested stateful flow you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Findings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a missing property today is a customer-visible edge-case bug tomorrow. Code that ships with only example tests ships with known unexplored input space.
