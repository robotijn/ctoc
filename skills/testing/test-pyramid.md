# Testing Pyramid Strategy Guide
> Claude Code testing strategy reference. Updated February 2026.

## The Testing Pyramid

The Testing Pyramid is a strategic framework for allocating test effort across different test types. It optimizes for fast feedback, maintainability, and confidence.

```
         /\
        /  \        E2E Tests (10%)
       /----\       - Slow, expensive, brittle
      /      \      - Test critical user journeys
     /--------\
    /          \    Integration Tests (20%)
   /------------\   - Medium speed, moderate cost
  /              \  - Test component interactions
 /----------------\
/                  \ Unit Tests (70%)
                    - Fast, cheap, stable
                    - Test isolated logic
```

## The 70/20/10 Ratio

### Unit Tests (70%)
**Purpose**: Verify individual functions, classes, and modules in isolation.

| Attribute | Guidance |
|-----------|----------|
| Execution time | < 10ms per test |
| Dependencies | Mocked/stubbed |
| Scope | Single function or class |
| Failure diagnosis | Pinpoint exact location |
| Maintenance cost | Low |

**What to test**:
- Pure functions and business logic
- Data transformations and calculations
- Edge cases and boundary conditions
- Error handling paths
- State management logic

**What NOT to unit test**:
- Third-party library internals
- Simple getters/setters without logic
- Configuration objects
- Framework boilerplate

### Integration Tests (20%)
**Purpose**: Verify that components work correctly together.

| Attribute | Guidance |
|-----------|----------|
| Execution time | 100ms - 5s per test |
| Dependencies | Real (or realistic fakes) |
| Scope | Multiple components/services |
| Failure diagnosis | Narrow to interaction |
| Maintenance cost | Medium |

**What to test**:
- API endpoint behavior
- Database query correctness
- Service-to-service communication
- Message queue handling
- Cache integration
- Authentication/authorization flows

**Integration test boundaries**:
```
┌─────────────────────────────────────────────┐
│              Integration Test               │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐ │
│  │ Handler │───▶│ Service │───▶│  Repo   │ │
│  └─────────┘    └─────────┘    └────┬────┘ │
│                                     │       │
│                               ┌─────▼─────┐ │
│                               │  Test DB  │ │
│                               └───────────┘ │
└─────────────────────────────────────────────┘
```

### E2E Tests (10%)
**Purpose**: Verify critical user journeys through the entire system.

| Attribute | Guidance |
|-----------|----------|
| Execution time | 10s - 2min per test |
| Dependencies | Full system |
| Scope | Complete user flow |
| Failure diagnosis | Requires investigation |
| Maintenance cost | High |

**What to test**:
- Critical business flows (signup, checkout, payment)
- Cross-service workflows
- Happy paths that generate revenue
- Regulatory/compliance requirements

**E2E test budget**:
- Maximum 50-100 E2E tests for typical applications
- Each test must justify its maintenance cost
- Review and prune quarterly

## When to Deviate from Standard Ratios

### Shift Toward More Integration Tests

**Microservices Architecture (50/40/10)**
```
Unit: 50%  |  Integration: 40%  |  E2E: 10%
```
Rationale: Service boundaries are the primary failure points. Integration tests catch contract violations, serialization issues, and network-related bugs.

**Data-Heavy Applications (40/50/10)**
```
Unit: 40%  |  Integration: 50%  |  E2E: 10%
```
Rationale: Data transformations and database interactions are core to correctness. Integration tests with real databases catch query issues, transaction problems, and data integrity violations.

**API-First Products (50/40/10)**
```
Unit: 50%  |  Integration: 40%  |  E2E: 10%
```
Rationale: API contracts are the product. Integration tests verify request/response cycles, authentication, rate limiting, and error handling.

### Shift Toward More E2E Tests

**Highly Regulated Industries (60/20/20)**
```
Unit: 60%  |  Integration: 20%  |  E2E: 20%
```
Rationale: Regulatory compliance requires demonstrable end-to-end verification. Audit trails demand proof that complete workflows function correctly.

**Small Teams with Critical Flows (60/25/15)**
```
Unit: 60%  |  Integration: 25%  |  E2E: 15%
```
Rationale: When you cannot afford any failure in critical paths, more E2E coverage provides confidence at the cost of speed.

### Shift Toward More Unit Tests

**Library/SDK Development (85/10/5)**
```
Unit: 85%  |  Integration: 10%  |  E2E: 5%
```
Rationale: Public APIs must handle every edge case. Extensive unit tests verify behavior exhaustively.

**Algorithm-Heavy Applications (80/15/5)**
```
Unit: 80%  |  Integration: 15%  |  E2E: 5%
```
Rationale: Complex algorithms require exhaustive input testing. Unit tests provide fast feedback on mathematical correctness.

## The Ice Cream Cone Anti-Pattern

**WARNING**: This is what NOT to do.

```
    _______________
   /               \
  /     E2E (60%)   \      ← Slow, flaky, expensive
 /___________________\
        /     \
       / Int   \           ← Squeezed out
      /___(15%)_\
          /\
         /  \              ← Insufficient foundation
        / U  \
       /(25%)\
```

### Why Ice Cream Cones Form

1. **"Just write an E2E test"** — Developers avoid understanding code and write end-to-end tests instead
2. **QA-driven testing** — Separate QA teams focus on system-level verification
3. **Legacy codebases** — Untestable code leads to reliance on external testing
4. **Time pressure** — E2E tests feel faster to write (but cost more long-term)

### Ice Cream Cone Consequences

| Problem | Impact |
|---------|--------|
| Slow feedback | 30+ minute CI runs |
| Flaky tests | False positives erode trust |
| Hard to diagnose | Hours to find root cause |
| Expensive to maintain | Tests break with UI changes |
| Parallelization limited | E2E tests share state |

### Escaping the Ice Cream Cone

1. **Freeze new E2E tests** — No new E2E tests without justification
2. **Characterization tests** — Add unit tests before refactoring
3. **Dependency injection** — Make code testable in isolation
4. **Delete duplicate coverage** — Remove E2E tests covered by unit tests
5. **Track metrics** — Measure test:production code ratio by type

## Microservices Testing Strategy

### The Testing Honeycomb

For microservices, the honeycomb model often fits better than the pyramid:

```
         ┌───────────┐
        /│  E2E (5%) │\
       / └───────────┘ \
      /   ┌─────────┐   \
     /    │ Contract│    \
    /     │  (30%)  │     \
   /      └─────────┘      \
  /     ┌─────────────┐     \
 /      │ Integration │      \
/       │    (40%)    │       \
\       └─────────────┘       /
 \      ┌─────────────┐      /
  \     │    Unit     │     /
   \    │   (25%)     │    /
    \   └─────────────┘   /
```

### Contract Testing

Contract tests verify that services honor their API contracts without running the full system.

**Consumer-Driven Contracts**:
```
┌──────────┐                    ┌──────────┐
│ Consumer │                    │ Provider │
│          │───▶ Contract ◀────│          │
│          │    Broker          │          │
└──────────┘                    └──────────┘
     │                               │
     ▼                               ▼
 Verify that              Verify that responses
 expectations             match consumer
 are met                  expectations
```

**Tools**: Pact, Spring Cloud Contract, Specmatic

### Service Virtualization

When testing services in isolation:

```javascript
// Mock downstream service
beforeAll(async () => {
  mockServer = await MockServer.create({
    port: 3001,
    stubs: [
      {
        request: { method: 'GET', path: '/users/123' },
        response: { status: 200, body: { id: 123, name: 'Test' } }
      }
    ]
  });
});
```

## Test Isolation Principles

### The FIRST Principles

| Principle | Meaning | Implementation |
|-----------|---------|----------------|
| **F**ast | < 10ms unit, < 5s integration | No I/O in unit tests |
| **I**solated | No shared state | Fresh fixtures per test |
| **R**epeatable | Same result every time | No randomness, no time-dependence |
| **S**elf-validating | Pass or fail, no interpretation | Clear assertions |
| **T**imely | Written at development time | TDD or immediate coverage |

### Isolation Strategies

**Database Isolation**:
```javascript
// Option 1: Transactions (rollback after each test)
beforeEach(async () => {
  await db.beginTransaction();
});
afterEach(async () => {
  await db.rollback();
});

// Option 2: Test containers (fresh DB per suite)
beforeAll(async () => {
  container = await new PostgreSqlContainer().start();
});
afterAll(async () => {
  await container.stop();
});

// Option 3: Schema isolation (parallel-safe)
beforeAll(async () => {
  schema = `test_${randomUUID()}`;
  await db.query(`CREATE SCHEMA ${schema}`);
});
```

**Time Isolation**:
```javascript
// Use fake timers
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-15T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});
```

**Network Isolation**:
```javascript
// Mock HTTP at the adapter level
const mockFetch = vi.fn();
const service = new ApiService({ fetch: mockFetch });

// Or use MSW for realistic mocking
const server = setupServer(
  http.get('/api/users', () => HttpResponse.json([]))
);
```

### Test Data Management

**Builders for consistent data**:
```typescript
// User builder with sensible defaults
const userBuilder = () => ({
  id: randomUUID(),
  email: `test-${Date.now()}@example.com`,
  name: 'Test User',
  role: 'user',
  createdAt: new Date(),

  withAdmin() {
    this.role = 'admin';
    return this;
  },

  build() {
    return { ...this };
  }
});

// Usage
const admin = userBuilder().withAdmin().build();
```

## Flaky Test Prevention

### Root Causes and Solutions

| Cause | Detection | Solution |
|-------|-----------|----------|
| Race conditions | Non-deterministic failures | Proper async/await, waitFor patterns |
| Shared state | Failures depend on test order | Isolated test fixtures |
| Time dependence | Fails at midnight/new year | Fake timers, fixed dates |
| Network variance | Timeout failures | Mock external calls |
| DOM timing | Element not found | Built-in waiting, test-ids |
| Resource exhaustion | Fails under load | Connection pooling, cleanup |

### Flaky Test Quarantine Process

```yaml
# .github/workflows/test.yml
jobs:
  test:
    steps:
      - name: Run tests (excluding quarantined)
        run: npm test -- --exclude-pattern="**/*.flaky.test.ts"

      - name: Run quarantined tests (allow failures)
        run: npm test -- --pattern="**/*.flaky.test.ts"
        continue-on-error: true
```

### Flakiness Detection

```javascript
// vitest.config.ts - Repeat tests to detect flakiness
export default defineConfig({
  test: {
    retry: process.env.CI ? 2 : 0,
    reporters: ['default', 'junit'],
    outputFile: 'test-results.xml'
  }
});
```

Track flaky tests systematically:
1. Monitor test reruns in CI
2. Flag tests that pass on retry
3. Quarantine after 3 flaky incidents
4. Fix or delete within 2 weeks

## Test Organization

### Recommended Structure

```
src/
├── features/
│   └── checkout/
│       ├── checkout.service.ts
│       ├── checkout.service.test.ts      # Unit tests
│       └── checkout.integration.test.ts  # Integration tests
│
tests/
├── e2e/
│   ├── checkout.spec.ts                  # E2E tests
│   └── fixtures/
│       └── checkout.fixtures.ts
├── contracts/
│   └── payment-provider.pact.ts          # Contract tests
└── support/
    ├── builders/                         # Test data builders
    ├── mocks/                           # Shared mocks
    └── test-utils.ts                    # Common utilities
```

### Naming Conventions

```javascript
// Unit test: describe what, test when/then
describe('calculateDiscount', () => {
  it('returns 10% off when cart total exceeds $100', () => {});
  it('returns 0% off when cart total is under $100', () => {});
  it('throws when cart is empty', () => {});
});

// Integration test: describe the integration point
describe('POST /api/orders', () => {
  it('creates order and charges payment provider', () => {});
  it('returns 400 when inventory insufficient', () => {});
});

// E2E test: describe the user journey
describe('Checkout Flow', () => {
  it('allows guest user to complete purchase with credit card', () => {});
});
```

## Metrics and Monitoring

### Key Testing Metrics

| Metric | Target | Action if Off-Target |
|--------|--------|----------------------|
| Unit test ratio | > 70% | Add unit tests before integration |
| Test execution time | < 5 min | Parallelize, mock I/O |
| Flaky test rate | < 1% | Quarantine and fix |
| Coverage (line) | > 80% | Focus on untested paths |
| Coverage (branch) | > 75% | Add edge case tests |

### CI Performance Budget

```
┌────────────────────────────────────────────────┐
│              CI Time Budget (10 min)           │
├────────────────────────────────────────────────┤
│ ████████████░░░░░░░░░░░░░░░░░░░░  Lint (1 min) │
│ ████████████████████████░░░░░░░░  Unit (3 min) │
│ ████████████████████████████░░░░  Int (4 min)  │
│ ████████████████████████████████  E2E (2 min)  │
└────────────────────────────────────────────────┘
```

## What NOT to Do

- Do NOT write E2E tests as the first line of defense
- Do NOT skip unit tests because "integration tests cover it"
- Do NOT share state between tests without explicit isolation
- Do NOT use `sleep()` or fixed delays — use proper waiting
- Do NOT mock what you do not own (mock adapters instead)
- Do NOT let flaky tests persist in the main suite
- Do NOT test implementation details — test behavior
- Do NOT aim for 100% coverage — aim for meaningful coverage
