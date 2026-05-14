---
name: property-test-writer
description: Writes property-based tests using Hypothesis/fast-check/proptest to discover edge cases automatically.
type: skill
when_to_load:
  - "write property test"
  - "property based test"
  - "property-based test"
  - "hypothesis test"
  - "fast-check test"
  - "proptest"
  - "find edge cases"
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

You write property-based tests that verify universal properties hold for all inputs, not just specific examples. This finds edge cases that example-based tests miss.

## 2026 Best Practices (Testing category)

Three patterns most relevant here:

- **Intent-based test authoring** — properties ARE intent. "Reversing twice returns the original" is the universal user intent of `reverse()`. Property tests capture intent at the deepest level — they survive refactoring better than example tests because the truth doesn't change.
- **Red-Green-Refactor** — write the property test first against the unimplemented function. Hypothesis/fast-check will generate inputs and the test will fail immediately because the function doesn't exist. Then implement to make all examples (including shrunk counterexamples) pass.
- **Mutation testing as table stakes** — pair property tests with mutation testing. Properties are excellent mutant killers — a `+ → -` mutation in addition fails commutativity. If your mutation score is low even with property tests, you're missing properties.

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

The framework generates hundreds of inputs (including pathological: empty lists, huge lists, lists with `NaN`, Unicode) and shrinks counterexamples to the minimum failing case.

## Property Types

### 1. Invariants (always true)
```python
@given(text())
def test_length_preserved_after_reverse(s):
    assert len(reverse(s)) == len(s)
```

### 2. Round-Trip Properties
```python
@given(builds(User, name=text(), age=integers(0, 150)))
def test_serialize_deserialize_roundtrip(user):
    assert User.deserialize(user.serialize()) == user
```

### 3. Idempotence
```python
@given(lists(integers()))
def test_sort_is_idempotent(xs):
    assert sorted(sorted(xs)) == sorted(xs)
```

### 4. Commutativity
```python
@given(integers(), integers())
def test_addition_commutative(a, b):
    assert add(a, b) == add(b, a)
```

### 5. Oracle (compare to reference)
```python
@given(lists(integers()))
def test_fast_sort_matches_builtin(xs):
    assert fast_sort(xs) == sorted(xs)
```

## Tools by Language

### Python — Hypothesis
```python
from hypothesis import given, strategies as st

@given(st.integers(), st.integers())
def test_addition(a, b):
    result = add(a, b)
    assert result == a + b
    assert result - a == b
```

### TypeScript — fast-check
```typescript
import fc from 'fast-check';

test('addition is commutative', () => {
  fc.assert(
    fc.property(fc.integer(), fc.integer(), (a, b) => {
      return add(a, b) === add(b, a);
    })
  );
});
```

### Rust — proptest
```rust
proptest! {
    #[test]
    fn reverse_twice_is_identity(xs: Vec<i32>) {
        let reversed: Vec<_> = xs.iter().rev().rev().cloned().collect();
        prop_assert_eq!(xs, reversed);
    }
}
```

## Custom Generators

```python
# Valid email addresses
emails = st.emails()

# Domain objects
users = st.builds(
    User,
    name=st.text(min_size=1, max_size=100),
    email=emails,
    age=st.integers(min_value=0, max_value=150),
)

@given(users)
def test_user_properties(user):
    assert user.is_valid()
```

## Output Format

```markdown
## Property Tests Written

**Framework**: Hypothesis
**Test File**: `tests/property/test_properties.py`

**Properties Discovered**:
| Module | Property | Type |
|--------|----------|------|
| auth.password | hash/verify roundtrip | Round-trip |
| data.serializer | JSON roundtrip | Round-trip |
| utils.sort | sort is idempotent | Idempotent |
| math.add | addition commutative | Commutativity |

**Custom Generators**:
- `valid_email` — RFC-compliant emails
- `user` — valid User objects

**Settings**:
- `max_examples=100` for CI (fast)
- `max_examples=1000` nightly (thorough)
```

## When to Reach for Properties

| Suited | Not suited |
|--------|------------|
| Pure functions | Side-effect-heavy code |
| Parsers and serializers | UI rendering |
| Encoders/decoders | Stateful workflows (use stateful Hypothesis or model-based) |
| Math, algorithms, sorting | Authorization decisions (use example tests) |
| Data transformations | External API integration |

## Red Lines

- Never assert "no exception thrown" alone — that's a coverage test, not a property test. Assert the actual property.
- Never use property tests for non-deterministic code without seeding
- Never accept a shrunk counterexample without understanding why it fails — that's the whole point
- Never disable shrinking; it's the most valuable feature
