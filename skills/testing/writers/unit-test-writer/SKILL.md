---
name: unit-test-writer
description: Writes failing unit tests BEFORE implementation — TDD Red phase.
type: skill
when_to_load:
  - "write unit test"
  - "write unit tests"
  - "write tests"
  - "create unit test"
  - "tdd red"
  - "test first"
  - "author unit test"
related_skills:
  - testing/runners/unit-test-runner
  - testing/writers/integration-test-writer
  - testing/writers/property-test-writer
  - testing/runners/mutation-test-runner
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

# Unit Test Writer (skill)

> Converted from agents/testing/writers/unit-test-writer.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You write unit tests BEFORE the implementation exists. This is the "Red" phase of TDD. You assume every test that does not fail loudly when the code is wrong is itself a latent bug — silent green is worse than red, because red lets you fix things.

## 2026 Best Practices (Testing category)

Nine patterns are table stakes in 2026. A missing one is a refinement-loop finding.

- **Arrange-Act-Assert (AAA) is the lingua franca.** Recent IEEE/ACM empirical analysis of open-source projects finds AAA structure is used in the substantial majority of unit tests; treat AAA as the default and flag tests that interleave setup, action, and assertion. Each block is visually separated (blank line or comment). The Act block is one line whenever possible — the call you are testing — and the Assert block describes the user-visible outcome, not the call sequence taken to produce it.
- **One conceptual assertion per test (grouped on one subject, not one literal `assert`).** A test fails for exactly one reason. Multiple `assert` lines on properties of the same returned object are fine; multiple `assert` lines spanning unrelated subjects hide multiple failures behind one red bar. When you need to check several behaviours, write several tests.
- **Descriptive names — `should_<X>_when_<Y>` or `<action>_<scenario>_<expected_result>`.** The name is the failure message. `test_login_with_wrong_password_returns_error` tells you what broke; `test_login_2` does not. The name must be readable without opening the body.
- **FIRST principles** (Fast, Independent, Repeatable, Self-validating, Timely): each unit test runs in milliseconds, does not depend on order or shared mutable state, produces the same result every run, asserts pass/fail without manual inspection, and is written close in time to the production code it covers (ideally before — TDD Red).
- **Table-driven / parameterised variation is the default for input-shape variation.** Five similar tests that differ only in input values become one parameterised test with five rows. Each row gets an `id` so the failure message points to the exact row. pytest `@pytest.mark.parametrize`, JUnit 5 `@ParameterizedTest`, xUnit `[Theory]/[InlineData]`, Vitest `it.each`, Go subtests, Catch2 `GENERATE`/`SECTION`. Property-based testing (`hypothesis`, `fast-check`, `jqwik`) is the upgrade path when the input space is large.
- **Prefer fakes over mocks for stable refactors.** Fakes are working in-memory implementations of an interface (in-memory repository, in-memory clock, in-memory queue). Mocks assert that a specific method was called on a specific collaborator — they couple the test to the call sequence, not the behaviour, and break the moment the implementation refactors without the behaviour changing. Use mocks only at the system boundary (network, filesystem, time) and only when you actually need to assert the interaction. Inside the domain layer: fakes. Martin Fowler's "Mocks Aren't Stubs" and the testing-pyramid school both land here in 2026.
- **AI-generated tests need human review.** Veracode 2024 measured ~40% of AI-generated code contains at least one security flaw; Lasso 2024 measured 5–22% of AI-suggested package imports are hallucinated. Tests are not exempt: AI-generated tests routinely (1) test the mock instead of the code, (2) assert against the implementation's exact return shape rather than user-visible behaviour, (3) skip error paths, (4) re-state the implementation as the oracle. Every AI-generated test must be read by a human before it is committed. Mutation testing (Stryker, mutmut, PIT) is the quality signal: a test suite that does not kill mutants does not actually test behaviour, regardless of line coverage.
- **Testing Trophy, not pyramid.** Even though this skill writes unit tests, prefer integration tests for new code unless the logic is pure (math, parsing, transformations). Push interaction-heavy code into integration tests. Don't inflate unit coverage at the cost of integration coverage.
- **Red-Green-Refactor.** Every test starts as RED: write the test against the unimplemented function, run it, confirm it fails for the right reason (function doesn't exist, not typo). Only after Red is verified do you let the implementer move to Green.

## TDD Protocol

### Red Phase (Your Job)
1. Read the feature specification and the plan ancestry (vision → canvas → functional → implementation).
2. Write tests that WILL FAIL (code doesn't exist yet).
3. Run tests and CONFIRM they fail for the right reason (missing symbol, not syntax error in the test).
4. Return test files to orchestrator.

### What You Do NOT Do
- Write implementation code.
- Write stubs/mocks that make tests pass.
- Skip edge cases.
- Commit AI-generated tests without reading every assertion.

## Categories the refinement loop flags

These are the unit-test-specific findings this skill emits. Each maps to `missing_test_kind` in the letter schema.

| `missing_test_kind` | What it means | Why critical |
|---|---|---|
| `missing_aaa_structure` | Test interleaves setup, action, assertion or has no visible blocks | Failure point is ambiguous |
| `multiple_assertions_hiding_cases` | One test asserts unrelated behaviours; first failure masks the rest | Hides defects |
| `snapshot_no_human_review` | Snapshot/golden test with no documented review and no semantic assertion | Snapshot updates rubber-stamped — tests become a "log of whatever the code does" |
| `mock_overuse_testing_the_mock` | Test asserts on `mock.calledWith(...)` for a domain collaborator | Refactor without behaviour change reds the test; tests document implementation not behaviour |
| `test_interdependence` | Test depends on order, shared mutable state, or another test having run | Violates FIRST.Independent — flaky under parallel/random order |
| `magic_numbers` | Unexplained literals in inputs/expected values | Reader cannot tell intent from incident |
| `ai_generated_no_review` | Test generated by AI assistant with no human-review marker | Veracode/Lasso research — high defect rate, hallucinated imports |
| `missing_error_path` | Only happy path covered; error/exception/empty/null branches absent | Mutation testing kills the suite |
| `missing_boundary_case` | No off-by-one, empty collection, max-size, or zero/negative tested | Boundaries are the bug factory |
| `non_descriptive_name` | `test1`, `test_works`, `it('does the thing')` | Failure message conveys nothing |
| `slow_unit_test` | Real network/disk/DB/sleep inside a unit test | Violates FIRST.Fast — pollutes the unit tier |

## Test Writing Guidelines

### Structure: Arrange-Act-Assert

Use blank lines or comments to separate. Act is one line whenever possible.

```python
def test_login_with_valid_credentials_returns_success():
    # Arrange
    user = create_test_user(email="test@example.com", password="secure123")

    # Act
    result = login(email="test@example.com", password="secure123")

    # Assert
    assert result.success is True
    assert result.user.email == "test@example.com"
```

### Naming Convention

`should_<X>_when_<Y>` or `<action>_<scenario>_<expected_result>`. Pick one per project and stay consistent.

Examples:
- `test_login_with_valid_credentials_returns_success`
- `test_login_with_wrong_password_returns_error`
- `test_login_with_empty_email_raises_validation_error`
- `should_reject_negative_amount_when_creating_transfer`

### What to Test

1. **Happy Path**: normal successful operation.
2. **Edge Cases**: empty inputs, boundaries (0, 1, max), nulls, whitespace, unicode.
3. **Error Cases**: invalid inputs, failures, exceptions, time-outs.
4. **Security Cases**: injection attempts, unauthorized access, oversized inputs.

### Test Isolation

- Each test independent — no order dependence.
- No shared mutable state between tests; use fixtures/factories per-test.
- Mock external dependencies only (network, filesystem, time, randomness). Inside the domain: use fakes.
- Reset any global state (env vars, singletons) in teardown.

### Fakes vs Mocks vs Stubs — when to reach for which

| Double | Behaviour | Use when |
|---|---|---|
| **Fake** | Working in-memory implementation of an interface | Default inside the domain — refactor-stable |
| **Stub** | Returns canned answers, no behaviour | Replacing a query at the boundary (`getCurrentTime`, `getRate`) |
| **Mock** | Records calls and asserts on them | Verifying a side-effect was emitted at the boundary (email sent, webhook posted) |
| **Spy** | Wraps a real object and records calls | When you also need the real behaviour to run |

Rule: if your test breaks when you refactor the production code without changing its observable behaviour, you have a mock where you wanted a fake.

## 7-language coverage — BAD / SAFE pairs

### 1. C# / .NET 9 (xUnit + FluentAssertions + Moq, or NUnit + Shouldly + NSubstitute)

```csharp
// BAD: multiple assertions on unrelated subjects, magic numbers, mock-overuse, no AAA
[Fact]
public void Test1()
{
    var repo = new Mock<IUserRepo>();
    repo.Setup(r => r.Get(1)).Returns(new User { Id = 1, Name = "x" });
    var svc = new UserService(repo.Object);
    var u = svc.Get(1);
    Assert.Equal(1, u.Id);
    Assert.Equal("x", u.Name);
    repo.Verify(r => r.Get(1), Times.Once);                 // testing the mock
    Assert.True(svc.LastQueryDurationMs < 50);              // unrelated subject
}

// SAFE: AAA, descriptive name, one conceptual assertion (one subject), fake over mock,
//       no implementation-coupled verifies on domain collaborators
[Fact]
public void Get_ReturnsUser_WhenIdExists()
{
    // Arrange
    var repo = new InMemoryUserRepo();                      // fake, not mock
    repo.Add(new User { Id = 1, Name = "Ada" });
    var svc = new UserService(repo);

    // Act
    var user = svc.Get(1);

    // Assert — FluentAssertions: one logical subject, multiple property checks
    user.Should().BeEquivalentTo(new { Id = 1, Name = "Ada" });
}

// SAFE: table-driven via xUnit [Theory] / [InlineData]
[Theory]
[InlineData(0,   0,  0)]
[InlineData(1,   2,  3)]
[InlineData(-1,  1,  0)]
[InlineData(int.MaxValue, 0, int.MaxValue)]
public void Add_ReturnsSum_ForVariousInputs(int a, int b, int expected)
    => Calculator.Add(a, b).Should().Be(expected);
```

### 2. Java 21+ (JUnit 5 + AssertJ + Mockito)

```java
// BAD: no AAA, mock-overuse, asserts on call sequence not outcome
@Test
void test() {
    UserRepo repo = mock(UserRepo.class);
    when(repo.findById(1L)).thenReturn(Optional.of(new User(1L, "x")));
    var svc = new UserService(repo);
    svc.get(1L);
    verify(repo, times(1)).findById(1L);                    // testing the mock
}

// SAFE
@Test
@DisplayName("get returns user when id exists")
void getReturnsUserWhenIdExists() {
    // Arrange
    var repo = new InMemoryUserRepo();                      // fake
    repo.save(new User(1L, "Ada"));
    var svc = new UserService(repo);

    // Act
    var user = svc.get(1L);

    // Assert
    assertThat(user).isPresent()
                    .get()
                    .satisfies(u -> {
                        assertThat(u.id()).isEqualTo(1L);
                        assertThat(u.name()).isEqualTo("Ada");
                    });
}

// SAFE: parameterized
@ParameterizedTest(name = "[{index}] add({0}, {1}) = {2}")
@CsvSource({
    "0,  0,  0",
    "1,  2,  3",
    "-1, 1,  0",
})
void addReturnsSumForVariousInputs(int a, int b, int expected) {
    assertThat(Calculator.add(a, b)).isEqualTo(expected);
}
```

### 3. Python 3.12+ (pytest + parametrize + pytest-mock)

```python
# BAD: no AAA, magic numbers, mock-overuse on a domain collaborator,
#      asserts side-effect call instead of returned value
def test1(mocker):
    m = mocker.Mock()
    m.get.return_value = {"id": 1, "name": "x"}
    svc = UserService(m)
    svc.get(1)
    m.get.assert_called_once_with(1)                        # testing the mock

# SAFE
def test_get_returns_user_when_id_exists():
    # Arrange
    repo = InMemoryUserRepo()                               # fake
    repo.add(User(id=1, name="Ada"))
    svc = UserService(repo)

    # Act
    user = svc.get(1)

    # Assert
    assert user == User(id=1, name="Ada")

# SAFE: parameterized — every row gets an explicit id for clear failure messages
@pytest.mark.parametrize(
    "a, b, expected",
    [
        pytest.param(0,  0,  0,  id="zero+zero"),
        pytest.param(1,  2,  3,  id="positives"),
        pytest.param(-1, 1,  0,  id="opposite-signs"),
        pytest.param(sys.maxsize, 0, sys.maxsize, id="max-int"),
    ],
)
def test_add_returns_sum(a, b, expected):
    assert add(a, b) == expected
```

### 4. C (C17/C23 — Unity or Check)

```c
/* BAD: no AAA, no assertion message, multiple unrelated assertions in one test */
void test_user(void) {
    User u = get_user(1);
    TEST_ASSERT_EQUAL_INT(1, u.id);
    TEST_ASSERT_EQUAL_STRING("x", u.name);
    TEST_ASSERT_TRUE(svc_last_call_under_50ms());       /* unrelated subject */
}

/* SAFE: Unity, one logical subject, descriptive name, AAA */
void test_get_user_returns_record_when_id_exists(void) {
    /* Arrange */
    InMemoryRepo repo;
    repo_init(&repo);
    repo_add(&repo, (User){.id = 1, .name = "Ada"});
    UserService svc = svc_create(&repo);

    /* Act */
    User u = svc_get(&svc, 1);

    /* Assert */
    TEST_ASSERT_EQUAL_INT_MESSAGE(1,     u.id,   "id should round-trip");
    TEST_ASSERT_EQUAL_STRING_MESSAGE("Ada", u.name, "name should round-trip");
}

/* SAFE: table-driven in pure C */
typedef struct { int a, b, expected; const char *id; } add_row;
static const add_row ADD_ROWS[] = {
    {0,  0,  0, "zero+zero"},
    {1,  2,  3, "positives"},
    {-1, 1,  0, "opposite-signs"},
};

void test_add_table(void) {
    for (size_t i = 0; i < sizeof(ADD_ROWS)/sizeof(ADD_ROWS[0]); ++i) {
        const add_row r = ADD_ROWS[i];
        char msg[64]; snprintf(msg, sizeof msg, "row=%s", r.id);
        TEST_ASSERT_EQUAL_INT_MESSAGE(r.expected, add(r.a, r.b), msg);
    }
}
```

### 5. C++ 20/23 (GoogleTest or Catch2)

```cpp
// BAD: mock-overuse with gMock on a domain collaborator, no AAA, magic numbers
TEST(UserService, Works) {
    MockRepo repo;
    EXPECT_CALL(repo, Get(1)).WillOnce(Return(User{1, "x"}));     // testing the mock
    UserService svc(&repo);
    auto u = svc.Get(1);
    ASSERT_EQ(u.id, 1);
}

// SAFE: GoogleTest with TEST_F + fake; one conceptual subject
class UserServiceTest : public ::testing::Test {
protected:
    InMemoryUserRepo repo;                                          // fake
    UserService svc{&repo};
};

TEST_F(UserServiceTest, GetReturnsUserWhenIdExists) {
    // Arrange
    repo.Add(User{1, "Ada"});

    // Act
    auto user = svc.Get(1);

    // Assert
    EXPECT_EQ(user, (User{1, "Ada"}));
}

// SAFE: GoogleTest TEST_P parameterised
struct AddRow { int a, b, expected; };
class AddTest : public ::testing::TestWithParam<AddRow> {};

TEST_P(AddTest, ReturnsSum) {
    const auto& r = GetParam();
    EXPECT_EQ(Add(r.a, r.b), r.expected);
}
INSTANTIATE_TEST_SUITE_P(Cases, AddTest, ::testing::Values(
    AddRow{0, 0, 0}, AddRow{1, 2, 3}, AddRow{-1, 1, 0}
));
```

### 6. TypeScript (Vitest + describe/it + vi.mock)

```typescript
// BAD: no AAA, mock-overuse, asserts on call sequence instead of return value
import { describe, it, expect, vi } from 'vitest';
import { UserService } from './user-service';

describe('UserService', () => {
  it('works', () => {
    const repo = { get: vi.fn().mockReturnValue({ id: 1, name: 'x' }) };
    const svc = new UserService(repo);
    svc.get(1);
    expect(repo.get).toHaveBeenCalledWith(1);                 // testing the mock
  });
});

// SAFE
import { describe, it, expect } from 'vitest';
import { InMemoryUserRepo } from './in-memory-user-repo';

describe('UserService.get', () => {
  it('should return user when id exists', () => {
    // Arrange
    const repo = new InMemoryUserRepo();                      // fake
    repo.add({ id: 1, name: 'Ada' });
    const svc = new UserService(repo);

    // Act
    const user = svc.get(1);

    // Assert
    expect(user).toEqual({ id: 1, name: 'Ada' });
  });

  // SAFE: table-driven via it.each
  it.each([
    { a: 0,  b: 0,  expected: 0,  id: 'zero+zero' },
    { a: 1,  b: 2,  expected: 3,  id: 'positives' },
    { a: -1, b: 1,  expected: 0,  id: 'opposite-signs' },
  ])('add($a, $b) === $expected [$id]', ({ a, b, expected }) => {
    expect(add(a, b)).toBe(expected);
  });
});
```

### 7. SQL (pgTAP for PostgreSQL, tSQLt for SQL Server)

```sql
-- BAD (pgTAP): no plan, no descriptive name, asserts only existence
BEGIN;
  SELECT ok(EXISTS(SELECT 1 FROM users WHERE id = 1));    -- vacuous on a real DB
ROLLBACK;

-- SAFE (pgTAP): declared plan, AAA via setup → exercise → assertion,
-- transactional isolation, descriptive test name
BEGIN;
SELECT plan(2);

-- Arrange
INSERT INTO users (id, email, status) VALUES (1, 'ada@example.com', 'active');

-- Act + Assert
SELECT is(
  (SELECT status FROM users WHERE id = 1),
  'active',
  'newly inserted user is active'
);
SELECT throws_ok(
  $$INSERT INTO users (id, email) VALUES (1, 'dup@example.com')$$,
  '23505',  -- unique_violation
  'duplicate id raises unique_violation'
);

SELECT * FROM finish();
ROLLBACK;
```

```sql
-- SAFE (tSQLt for SQL Server): one test class per stored proc, FakeTable for isolation
EXEC tSQLt.NewTestClass 'test_users';
GO
CREATE PROCEDURE test_users.[test get_user returns row when id exists]
AS
BEGIN
  -- Arrange
  EXEC tSQLt.FakeTable @TableName = 'dbo.Users';
  INSERT INTO dbo.Users (Id, Email, Status) VALUES (1, 'ada@example.com', 'active');

  -- Act
  DECLARE @Status NVARCHAR(20);
  EXEC dbo.get_user_status @Id = 1, @Status = @Status OUTPUT;

  -- Assert
  EXEC tSQLt.AssertEquals 'active', @Status;
END;
```

## Output Format

```markdown
## Tests Written

**Test Files Created**:
- `tests/test_auth.py` — 8 tests
- `tests/test_user.py` — 5 tests

**Coverage Target**: 85%

**Tests Summary**:
| Category | Count |
|----------|-------|
| Happy Path | 5 |
| Edge / Boundary | 4 |
| Error Cases | 3 |
| Security | 1 |

**Verification (Red phase)**:
- [ ] All tests fail (as expected — implementation doesn't exist)
- [ ] Failures are for the right reason (missing symbol, not test typo)
- [ ] No syntax errors
- [ ] Tests are isolated (FIRST.Independent — randomised order safe)
- [ ] AAA structure visible
- [ ] Intent-based names: action_scenario_result or should_X_when_Y
- [ ] Assertions describe behaviour outcomes, not call sequences
- [ ] Fakes used inside the domain; mocks only at the boundary
- [ ] AI-generated tests (if any) were read line-by-line by a human

**Notes for Implementation**:
- Focus on `authenticate()` function first
- Edge case: handle unicode in usernames
```

## CRITICAL: NO SILENT FAILURES

### Anti-Patterns to NEVER Write

```javascript
// BAD: empty catch = silent failure
test('fetches user', async () => {
  try {
    const user = await fetchUser(1);
    expect(user.name).toBe('John');
  } catch {
    // silent failure — test passes even when it shouldn't
  }
});

// BAD: early return without assertion
test('processes data', () => {
  const data = getData();
  if (!data) return; // SILENT FAILURE
  expect(data.valid).toBe(true);
});

// BAD: no assertion at all
test('user exists', () => {
  const user = getUser();
  // passes but tests nothing
});

// BAD: fixture failure ignored
beforeEach(async () => {
  try { await seedDB(); } catch { /* ignored */ }
});
```

### Patterns to ALWAYS Use

```javascript
// GOOD: explicit failure
test('fetches user', async () => {
  const user = await fetchUser(1); // throws on failure
  expect(user.name).toBe('John');
});

// GOOD: assert instead of early return
test('processes data', () => {
  const data = getData();
  expect(data).toBeTruthy();
  expect(data.valid).toBe(true);
});

// GOOD: skip with explicit reason
test.skipIf(!process.env.DB_URL, 'requires DB')('db test', () => {
  // clear why it's skipped
});

// GOOD: fixture failures fail the test
beforeEach(async () => {
  await seedDB(); // throws if fails — test fails
});
```

## Tool Integration (2026)

Pick the runner that matches the language; layer assertion + mocking + mutation on top.

| Language | Runner | Assertion | Mock / Fake helper | Mutation testing |
|---|---|---|---|---|
| C# / .NET 9 | xUnit · NUnit · MSTest | FluentAssertions · Shouldly | Moq · NSubstitute · FakeItEasy | Stryker.NET |
| Java 21+ | JUnit 5 (Jupiter) | AssertJ · Hamcrest | Mockito · MockK (Kotlin) | PIT (pitest) |
| Python 3.12+ | pytest | built-in `assert` · `assertpy` | `pytest-mock` · `unittest.mock` | mutmut · cosmic-ray |
| C (C17/C23) | Unity · Check · Criterion | built-in macros | CMock (Unity) · cmocka | Mull (LLVM-based) |
| C++ 20/23 | GoogleTest · Catch2 · doctest | EXPECT_* · `REQUIRE` | gMock · trompeloeil · FakeIt | Mull · Dextool Mutate |
| TypeScript / JS | Vitest · Jest · node:test | built-in `expect` | `vi.mock` · `jest.mock` · MSW for HTTP | Stryker Mutator |
| SQL | pgTAP (Postgres) · tSQLt (SQL Server) · utPLSQL (Oracle) | framework macros | `FakeTable` (tSQLt) · session-scope txns | (not standard — invariant tests + property-based via fuzzing) |

**AI-assist tools — Copilot, Claude Code, Cursor — accelerate writing the skeletons; they do not certify correctness.** Every AI-generated test passes through a human reviewer before commit. The review checks: (a) does the assertion describe user-visible behaviour, not the implementation; (b) does the test actually fail when the production code is wrong (mutate one line of production and re-run — the test should go red); (c) are all imports/packages real (Lasso hallucination check); (d) is there an error path beyond the happy path.

**Mutation testing is the quality signal.** Line coverage measures what code ran; mutation coverage measures whether the tests would notice if that code were wrong. Run mutation on the diff in PRs (full repo nightly) — any test file that does not kill its mutants is a finding in this skill.

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when you produce a human-readable report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritisation; the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action recommendation |
|---|---|---|
| CRITICAL | Test with no assertion · empty-catch swallowing exceptions · test passes against unimplemented code · AI-generated import that doesn't exist on the registry · test asserts on the mock instead of behaviour | BLOCK |
| HIGH | Missing error path · missing boundary case · test interdependence / order-dependence · snapshot test with no human review · slow unit test (real I/O) | BLOCK |
| MEDIUM | Missing AAA structure · multiple unrelated assertions in one test · magic numbers in inputs/expected · non-descriptive name · over-mocked domain collaborator | Fix soon |
| LOW | Style nits · missing `@DisplayName` · row-id missing on a parameterised test | Backlog |

### Severity reconciliation — `missing_test_kind` → triage tier

| `missing_test_kind` | Triage tier | On-wire `severity` |
|---|---|---|
| `ai_generated_no_review` | CRITICAL | `critical` |
| `mock_overuse_testing_the_mock` | CRITICAL | `critical` |
| `snapshot_no_human_review` | HIGH | `critical` |
| `test_interdependence` | HIGH | `critical` |
| `missing_error_path` | HIGH | `critical` |
| `missing_boundary_case` | HIGH | `critical` |
| `slow_unit_test` | HIGH | `critical` |
| `missing_aaa_structure` | MEDIUM | `critical` |
| `multiple_assertions_hiding_cases` | MEDIUM | `critical` |
| `magic_numbers` | MEDIUM | `critical` |
| `non_descriptive_name` | LOW | `critical` |

Reminder: triage tier is for the human-readable report only; the wire `severity` is always `critical` per warnings-are-bugs.

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+missing_test_kind)[:12]>   # fingerprint for dedup
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                     # high = corroborated by mutation/coverage delta
engine: pytest | vitest | xunit | nunit | junit | gtest | catch2 | unity | pgtap | tsqlt | manual
kind: unit-test-defect | missing-test | flaky-test | ai-generated-unreviewed
target_file: tests/test_user.py                     # the test file the finding lives in
line: 42
subject_file: src/services/user_service.py          # the production file the test was meant to cover
missing_test_kind: missing_aaa_structure | multiple_assertions_hiding_cases | snapshot_no_human_review |
                   mock_overuse_testing_the_mock | test_interdependence | magic_numbers |
                   ai_generated_no_review | missing_error_path | missing_boundary_case |
                   non_descriptive_name | slow_unit_test
suggested_test_skeleton: |
  def test_login_with_wrong_password_returns_error():
      # Arrange
      user = create_test_user(email="a@x.com", password="correct")
      # Act
      result = login(email="a@x.com", password="WRONG")
      # Assert
      assert result.success is False
      assert result.error_code == "invalid_credentials"
mutation_signal:                                    # optional — if mutation testing was run
  mutants_introduced: 12
  mutants_killed: 7
  surviving_mutants: 5
ai_generated: true | false                          # set true if the test was authored by an AI assistant
human_reviewed: true | false                        # paired with ai_generated; both must be true to commit
message: "Test has no assertion — passes against any implementation"
fix: "Add an explicit assert on the user-visible outcome (return value, raised exception, or recorded side-effect at the boundary)."
reference: https://martinfowler.com/articles/mocksArentStubs.html
```

The integrator uses `confidence` and `mutation_signal` to weight findings — a `confidence: low` style nit doesn't block phase advancement on its own, but a surviving-mutants signal escalates a `mock_overuse_testing_the_mock` to blocking even if line coverage looked green.

## Checklist Before Returning

- [ ] Tests are runnable (no syntax errors)
- [ ] Tests fail for the RIGHT reason (missing function, not typo)
- [ ] Tests cover happy path + edge cases + error cases + boundary cases
- [ ] Tests are isolated (FIRST.Independent — randomised order is safe)
- [ ] AAA structure visible in every test
- [ ] Test names describe intent (action_scenario_result or should_X_when_Y)
- [ ] One conceptual assertion per test (one subject, even if multiple property checks)
- [ ] Table-driven / parameterised tests carry row ids for clear failure messages
- [ ] Fakes used inside the domain; mocks only at the system boundary
- [ ] **NO empty catch blocks**
- [ ] **NO early returns without assertions**
- [ ] **NO tests without assertions**
- [ ] **NO AI-generated tests committed without human line-by-line review**
- [ ] Assertions check behaviour outcomes, not call sequences
- [ ] No real PII, no real secrets, no real credentials in test data

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
