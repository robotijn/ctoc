---
name: e2e-test-writer
description: Writes end-to-end tests simulating real user journeys using Playwright (preferred) or Cypress.
type: skill
when_to_load:
  - "write e2e test"
  - "write e2e tests"
  - "create e2e test"
  - "author e2e test"
  - "playwright write"
  - "scaffold e2e test"
related_skills:
  - testing/playwright-qa
  - testing/runners/e2e-test-runner
  - testing/writers/integration-test-writer
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

# E2E Test Writer (skill)

> Converted from agents/testing/writers/e2e-test-writer.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You design **what** end-to-end tests to write across the application — which user journeys deserve E2E coverage, which belong at the unit or integration layer, what data they consume, how they are isolated, and what accessibility / visual / performance signals they emit alongside functional assertions.

This skill is **framework-agnostic** by design. The companion skill [[testing/playwright-qa]] is the runtime-focused deep skill — Playwright config, fixtures, CI wiring, trace viewer, debugging, code-coverage merge. When the user is choosing **what** to test, load this skill. When they're configuring how to **run** Playwright (or debugging an existing suite), defer to [[testing/playwright-qa]].

## 2026 Best Practices (Testing category)

The E2E philosophy in 2026 is harsher about scope than it was five years ago. Browser-driven tests are the slowest, most expensive, and flakiest tier in the pyramid; the consensus is to write **fewer of them**, and only on journeys that prove the product still works for paying users. The principles below are non-negotiable.

- **E2E covers golden paths only — not edge cases.** A typical SaaS application should have on the order of **10–30 E2E tests** total — signup, login, the one or two key conversion events (checkout, subscription start, the activation moment), and the top one or two error paths that block recovery. Everything else — input validation, branching logic, retry semantics, formatting, calculations — belongs at unit or integration level. If a bug can be reproduced without launching a browser, it does not belong in the E2E suite.

- **The 10/90 split.** Hybrid testing strategies in 2026 reserve roughly 10% of the automation budget for true browser-driven E2E and route the remaining 90% to API/integration tests that exercise the same code paths an order of magnitude faster. When the design discussion produces a 50th E2E test, the right reaction is to push it down a layer, not write it.

- **Intent-based selectors over structural selectors.** Every assertion answers "what would a user notice break?" `page.getByRole('button', { name: 'Sign up' })` survives a redesign; `page.locator('.btn-primary-large')` does not. Role/label/text/test-id is the priority order. CSS classes, XPath, and generated IDs are red lines.

- **Deterministic seed data, isolated per run.** Hard-coded `user@example.com` shared across runs creates parallel-execution interference and ordering-dependent flakes. Generate unique identifiers per run (timestamp + UUID, faker with a seed, or a database-side `nextval`); seed prerequisite state **via API**, not by clicking through the UI; tear down or sandbox the data after the run. Determinism survives sharding; shared mutable state does not.

- **Accessibility is part of E2E.** Wire `@axe-core/playwright` into the critical-path suite. Every page touched by an E2E test runs an axe scan, and WCAG 2.2 AA violations fail the test the same way a missing button would. Accessible-name selectors (`getByRole`, `getByLabel`) double as accessibility assertions for free; combining them with an axe scan turns the suite into a structural a11y gate.

- **Visual regression supplements, never replaces, functional assertions.** Tools like Percy / Chromatic / Playwright's own `toHaveScreenshot` catch pixel drift; they do not catch a broken button handler. Use them on the **shell** (header, footer, key landing screens) and on **components in Storybook test-runner**, not on every page of the E2E flow. Pixel diffs across viewports drown the suite in noise otherwise.

- **Parallel sharding is the default.** A 30-test suite that runs sequentially in 12 minutes runs in under 2 minutes across 8 shards. Playwright's deterministic test order makes shard assignments stable across runs (same suite + filters + config → same allocation), which is what makes shard-level retries safe. Wire `--shard=X/Y` into a CI matrix from day one; do not wait until the suite is slow.

- **Retries hide bugs unless every retry is surfaced and triaged.** `retries: 2` silently re-greens flakes and lets real bugs ship. The 2026 posture is **`retries: 0` locally** (so flakes can't hide on the author's machine) and **at most `retries: 1` in CI** purely as a safety net — and every CI retry emits a flake report that gets triaged within the week. A test that needed a retry to go green is a critical finding, not a successful run; the suite owner either fixes the root cause or quarantines the test.

- **Tests that bypass the UI are integration tests in disguise.** If the implementation calls `page.evaluate(() => fetch('/api/...'))` to set up state, that is fine. If the **assertion** is on the API response and the browser is never used to verify the page rendered the result, the test is mis-tiered — move it to the integration layer and replace it with a real journey test.

- **Suite budget ≤ 30 minutes end-to-end on the slowest shard.** Individual tests should generally complete in under 30 seconds; anything pushing 60 seconds is a maintainability red flag and gets split or pushed to integration. Total CI wall-clock for the E2E layer stays under half an hour on the slowest shard, including artifact upload. If the suite breaches this, the answer is to delete tests or push them down a layer — not to buy more CI minutes.

## When to write E2E (decision matrix)

| Question | If yes | If no |
|---|---|---|
| Does this exercise the **top revenue path** (signup → activation → first conversion)? | Write E2E. | Continue. |
| Does this exercise an **auth boundary** (login, MFA, session timeout, role gating)? | Write E2E. | Continue. |
| Does this rely on **cross-system orchestration** the integration tests can't reach (CDN, third-party SDK loaded in the browser, payment iframe, OAuth redirect chain)? | Write E2E. | Continue. |
| Is this the **only** way to observe the failure (i.e. could a unit/integration test catch it)? | Probably E2E, but keep it minimal. | Push down a layer. |
| Is this **input validation / branching / formatting / a calculation**? | — | Unit test. |
| Is this **a service contract / DB constraint / queue interaction**? | — | Integration test. |

## Tools

- **Playwright** (recommended) — fastest, most stable, native parallel sharding, cross-browser (Chromium / Firefox / WebKit), official bindings for **TypeScript, Python, .NET (C#), and Java**. Default choice for new projects in 2026.
- **Cypress** — JavaScript/TypeScript only; strong DX and time-travel debugger; in-browser execution model imposes architectural limits (no native multi-tab, no cross-origin without workarounds). Reasonable for frontend-heavy teams already on Chromium-only.
- **Selenium** — broadest browser/language matrix but the slowest and flakiest. Justify before picking it for new work.

## Test Structure — TypeScript (Playwright)

```typescript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';

test.describe('User Authentication (golden path)', () => {
  test('user can sign up and reach the dashboard', async ({ page, request }) => {
    // BAD: shared credential across runs causes parallel interference
    //   await page.getByLabel('Email').fill('test@example.com');
    // SAFE: unique-per-run identity
    const email = `e2e+${randomUUID()}@example.test`;

    await page.goto('/signup');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('CorrectHorseBatteryStaple-1');
    await page.getByRole('button', { name: 'Sign up' }).click();

    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible();

    // a11y gate — every page touched by an E2E test gets an axe scan
    const a11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    expect(a11y.violations, JSON.stringify(a11y.violations, null, 2)).toEqual([]);
  });
});
```

```typescript
// BAD: arbitrary sleep — masks race conditions, slows the suite
await page.click('text=Submit');
await page.waitForTimeout(3000);
await expect(page.locator('.success')).toBeVisible();

// SAFE: assertion auto-retries until the condition is true (or timeout)
await page.getByRole('button', { name: 'Submit' }).click();
await expect(page.getByRole('status')).toHaveText(/saved/i);
```

```typescript
// BAD: seed prerequisite state through the UI — slow and brittle
await page.goto('/items/new');
await page.getByLabel('Title').fill('Seed item');
await page.getByRole('button', { name: 'Create' }).click();
await page.goto('/items');
await page.getByRole('link', { name: 'Seed item' }).click();
// then the actual journey under test starts here

// SAFE: seed via API, test the journey, not the setup
const created = await request.post('/api/items', {
  data: { title: `seed-${randomUUID()}` },
  headers: { Authorization: `Bearer ${TEST_TOKEN}` },
});
const { id } = await created.json();
await page.goto(`/items/${id}`);
```

## Test Structure — TypeScript (Cypress)

```typescript
// BAD: depends on test order; mutates a shared user
describe('Profile', () => {
  it('updates display name', () => {
    cy.visit('/login');
    cy.get('#email').type('shared@example.com');     // shared across runs
    cy.get('#pw').type('hunter2');
    cy.get('button[type=submit]').click();           // structural selector
    cy.get('.profile-name').type('Alice');           // CSS class — fragile
  });
});

// SAFE: unique identity per spec, intent-based selectors, API seed
describe('Profile (golden path)', () => {
  it('updates display name', () => {
    const email = `e2e+${crypto.randomUUID()}@example.test`;
    cy.task('seedUser', { email }).then(({ token }) => {
      cy.setCookie('session', token);
    });
    cy.visit('/profile');
    cy.findByLabelText(/display name/i).clear().type('Alice');
    cy.findByRole('button', { name: /save/i }).click();
    cy.findByRole('status').should('contain.text', /saved/i);
    cy.injectAxe();
    cy.checkA11y(null, { runOnly: ['wcag2a', 'wcag2aa', 'wcag22aa'] });
  });
});
```

## Test Structure — Python (Playwright for Python)

```python
# BAD: shared credential, sleep, CSS-class selector
def test_signup(page):
    page.goto("/signup")
    page.fill("#email", "user@example.com")
    page.fill("#password", "pw")
    page.click(".btn-primary")
    page.wait_for_timeout(3000)
    assert page.locator(".dashboard-h1").is_visible()

# SAFE: uuid identity, role-based selectors, auto-waiting assertion, axe scan
import uuid
from playwright.sync_api import Page, expect
from axe_playwright_python.sync_playwright import Axe

def test_signup_golden_path(page: Page):
    email = f"e2e+{uuid.uuid4()}@example.test"
    page.goto("/signup")
    page.get_by_label("Email").fill(email)
    page.get_by_label("Password").fill("CorrectHorseBatteryStaple-1")
    page.get_by_role("button", name="Sign up").click()

    expect(page).to_have_url("/dashboard")
    expect(page.get_by_role("heading", name="Welcome")).to_be_visible()

    results = Axe().run(page, options={"runOnly": ["wcag2a", "wcag2aa", "wcag22aa"]})
    assert results.violations_count == 0, results.generate_report()
```

## Test Structure — C# / .NET (Microsoft.Playwright)

```csharp
// BAD: structural selector, sleep, shared user
[Test] public async Task Signup() {
    await Page.GotoAsync("/signup");
    await Page.FillAsync("#email", "user@example.com");
    await Page.FillAsync("#password", "pw");
    await Page.ClickAsync(".submit");
    await Task.Delay(3000);
    Assert.That(await Page.IsVisibleAsync(".dashboard-h1"), Is.True);
}

// SAFE: unique identity, role selectors, expect auto-retry, axe via Deque.AxeCore.Playwright
using Microsoft.Playwright;
using Microsoft.Playwright.NUnit;
using Deque.AxeCore.Playwright;

public class SignupTests : PageTest {
    [Test]
    public async Task User_Can_Sign_Up_And_Reach_Dashboard() {
        var email = $"e2e+{Guid.NewGuid()}@example.test";

        await Page.GotoAsync("/signup");
        await Page.GetByLabel("Email").FillAsync(email);
        await Page.GetByLabel("Password").FillAsync("CorrectHorseBatteryStaple-1");
        await Page.GetByRole(AriaRole.Button, new() { Name = "Sign up" }).ClickAsync();

        await Expect(Page).ToHaveURLAsync("/dashboard");
        await Expect(Page.GetByRole(AriaRole.Heading, new() { Name = "Welcome" }))
            .ToBeVisibleAsync();

        var axe = await Page.RunAxe();
        Assert.That(axe.Violations, Is.Empty);
    }
}
```

## Test Structure — Java (Playwright for Java)

```java
// BAD: structural selector, hardcoded credential, no a11y check
@Test void signup() {
    page.navigate("/signup");
    page.fill("#email", "user@example.com");
    page.fill("#password", "pw");
    page.click(".btn-primary");
    page.waitForTimeout(3000);
    assertTrue(page.isVisible(".dashboard-h1"));
}

// SAFE: UUID identity, role-based locators, expect auto-retry, axe via com.deque.html.axe-core:playwright (verify current coordinates on Maven Central before pinning)
import com.microsoft.playwright.*;
import com.microsoft.playwright.options.AriaRole;
import com.deque.html.axecore.playwright.AxeBuilder;
import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;

@Test void user_can_sign_up_golden_path() {
    String email = "e2e+" + java.util.UUID.randomUUID() + "@example.test";

    page.navigate("/signup");
    page.getByLabel("Email").fill(email);
    page.getByLabel("Password").fill("CorrectHorseBatteryStaple-1");
    page.getByRole(AriaRole.BUTTON,
        new Page.GetByRoleOptions().setName("Sign up")).click();

    assertThat(page).hasURL("/dashboard");
    assertThat(page.getByRole(AriaRole.HEADING,
        new Page.GetByRoleOptions().setName("Welcome"))).isVisible();

    var axe = new AxeBuilder(page)
        .withTags(java.util.List.of("wcag2a", "wcag2aa", "wcag22aa"))
        .analyze();
    org.junit.jupiter.api.Assertions.assertTrue(axe.violations.isEmpty(),
        () -> axe.violations.toString());
}
```

> **C / C++ / SQL — out of scope.** E2E means driving a UI; native and database layers do not host one. C/C++ services exposing an HTTP API are tested at the integration layer (see [[integration-test-writer]]). SQL stored procedures are tested via direct DB harnesses, not a browser.

## Selector Strategy (priority — never invert this order)

1. `getByRole('button', { name: 'Submit' })` — accessible + stable; doubles as a11y assertion.
2. `getByLabel('Email')` — form inputs by their visible label.
3. `getByText('Welcome back')` — stable UI text.
4. `getByPlaceholder(...)` / `getByAltText(...)` — only when no role/label is available.
5. `getByTestId('submit')` — only when none of the above work; treat as a code smell that the element is missing an accessible name.
6. **Never** CSS classes, XPath, generated IDs, or nth-child indexing.

## Failure Categories (with severity reconciliation)

These are the categories this skill emits as critic findings. Severity reconciliation: the table column **Internal triage** is what appears in the human-readable scan report; **Letter severity** is what goes on the wire to CTO Chief. Per the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md), every letter severity is `critical` — there is no soft tier on the wire.

| Category | Internal triage | Letter severity | Why |
|---|---|---|---|
| E2E test written for an edge case that belongs at unit/integration | HIGH | critical | Pollutes the suite, slows CI, exhausts the 10/90 budget |
| Shared test user across runs (no per-run identity) | CRITICAL | critical | Causes parallel-execution interference; ordering-dependent flakes |
| Test bypasses the UI to assert on API response | HIGH | critical | Mis-tiered; not actually exercising the browser path |
| Missing accessibility (axe) assertion on a critical-path page | HIGH | critical | A11y regressions ship undetected; legal exposure under WCAG 2.2 |
| Visual regression used as a substitute for functional assertion | MEDIUM | critical | Pixel diffs do not catch broken handlers |
| `waitForTimeout` / arbitrary sleep | HIGH | critical | Masks race conditions, slows the suite, defeats auto-waiting |
| CSS-class / XPath / generated-ID selector | HIGH | critical | Breaks on refactor; doubles as missing accessible name |
| Individual test runtime > 60s | MEDIUM | critical | Suite-budget breach; pushes total wall-clock past the 30-min ceiling |
| Suite total runtime > 30 min on slowest shard | HIGH | critical | Violates the 2026 budget; symptom of over-scoped E2E layer |
| Missing flaky-retry strategy (no retries, or unlimited retries, or retries silently re-greening) | HIGH | critical | Either leaks flakes to main or hides real bugs |
| State shared between tests (no isolation) | CRITICAL | critical | Ordering-dependent test pollution; non-deterministic CI |
| Seed data created through the UI instead of the API | MEDIUM | critical | Slow, brittle, makes the test about the seed not the journey |
| Hardcoded credentials in spec files | CRITICAL | critical | Secret-leak vector; cross-references [[secrets-detector]] |

## Tool Integration (2026)

| Tool | Role | When |
|---|---|---|
| **Playwright** | Browser automation across Chromium/Firefox/WebKit. Native sharding, trace viewer, fixtures, TS/Python/.NET/Java bindings. | Default for new projects |
| **Cypress** | Chromium-focused E2E with in-browser run model and time-travel debugger. | Existing Cypress shops |
| **@axe-core/playwright** | a11y scans inside Playwright tests; WCAG 2.x rule packs. | Every critical-path page |
| **axe-playwright-python** / **Deque.AxeCore.Playwright** / **axe-core Java integration** | Axe in non-TS bindings. | Python / .NET / Java suites |
| **Storybook test-runner** | Run interaction + a11y tests against every Storybook story. Catches component regressions an order of magnitude faster than a browser-level E2E. | Component-level checks |
| **Percy / Chromatic** | Visual regression as a **supplement** — diff the shell and critical landing screens; do not diff every E2E page. | Supplement only |
| **Lighthouse via Playwright** (`playwright-lighthouse`) | Performance / a11y / SEO budgets on critical landing routes. | Pre-deploy budget gate |
| **GitHub Actions matrix sharding** | `strategy.matrix.shard: [1,2,3,4,5,6,7,8]` with `npx playwright test --shard=${{ matrix.shard }}/8` and the `blob` reporter merged via `playwright merge-reports`. | Always, from day one |

```yaml
# .github/workflows/e2e.yml — illustrative; pin versions in real projects
jobs:
  e2e:
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4, 5, 6, 7, 8]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test --shard=${{ matrix.shard }}/8 --reporter=blob
      - uses: actions/upload-artifact@v4
        with: { name: blob-${{ matrix.shard }}, path: blob-report }
  merge-reports:
    if: ${{ !cancelled() }}
    needs: [e2e]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
      - run: npx playwright merge-reports --reporter=html ./blob-*
```

## User Journeys to Test (the typical 10–30)

### Always covered (golden paths)
- Signup → email verification → first login
- Login (success + locked-out / invalid-credential error path)
- The single key conversion event for the product (checkout, subscription start, first activation moment per [`.ctoc/templates/product-kpis.yaml`](../../../.ctoc/templates/product-kpis.yaml))
- One representative cross-system flow (OAuth redirect, Stripe Checkout return, webhook-driven status update)

### Selectively covered (only if no lower tier can reach it)
- Session expiration mid-flow (does the app recover gracefully?)
- Role gating across primary entry points (admin sees the admin page; member doesn't)
- One representative mobile viewport for the critical-path screen
- One offline / slow-network behavior if the product claims offline support

### Never E2E (push down a layer)
- Input validation, formatting, calculations → unit
- ORM query shape, DB constraints, queue interactions → integration
- Every individual form field across the product → unit/integration
- Pixel-perfect rendering of every screen → Storybook + visual regression supplement
- Performance regressions across the whole app → synthetic monitoring + Lighthouse budgets, not the functional E2E suite

## TDD for E2E (Red-Green-Refactor)

1. **Red** — write the test against the unbuilt UI. Run it. Confirm it fails for the right reason ("page not found", "element with role=button name=Sign up not visible"). A test that goes green on the first run was probably not checking what you thought.
2. **Green** — build the minimum UI to make the test pass. Resist the urge to write the next test until this one is green.
3. **Refactor** — extract fixtures, page objects (or the [Functional Page Model](https://medium.com/@jameskip/functional-page-model-for-playwright-a-scalable-alternative-to-classic-pom-007d8ec26333) variant), and shared seed helpers. Tests stay green throughout.

## Output Format

```markdown
## E2E Tests Written

**Framework**: Playwright (TypeScript)
**Suite budget**: 30 min ceiling on slowest shard; this suite ~6 min across 8 shards
**Test count**: 14 (well within the 10–30 golden-path target for a SaaS app)

**Test Files**:
- `e2e/auth.spec.ts` — 5 tests (signup, login success/failure, session timeout, MFA)
- `e2e/checkout.spec.ts` — 4 tests (Stripe Checkout happy path + 3 error paths)
- `e2e/dashboard.spec.ts` — 3 tests (first-activation moment, key conversion event)
- `e2e/a11y.spec.ts` — 2 tests (axe scan on landing + dashboard shell)

**User Journeys Covered**:
| Journey | Tests | Golden path? |
|---|---|---|
| Authentication | 5 | YES |
| Checkout (key conversion) | 4 | YES |
| Activation moment | 3 | YES |
| A11y shell scan | 2 | YES |

**Verification**:
- [ ] All tests fail initially (Red phase) for the right reason
- [ ] No syntax errors; `playwright test --list` enumerates them
- [ ] All selectors are role/label/text-based (no CSS class, no XPath, no nth-child)
- [ ] No arbitrary `waitForTimeout` calls
- [ ] Each test uses a per-run unique identity (UUID-suffixed email)
- [ ] Each prerequisite is seeded via API, not through the UI
- [ ] Every critical-path page runs an axe scan with WCAG 2.2 AA tags
- [ ] CI matrix shards configured (--shard=X/Y); blob reporter merged via playwright merge-reports
- [ ] `retries: 1` in CI, `retries: 0` locally; flaky-retry report exported

**Run Command**: `npx playwright test`
**CI Command**: `npx playwright test --shard=${SHARD}/8 --reporter=blob`

**Notes**:
- Tests run in Chromium, Firefox, WebKit
- Trace, screenshot, video on first retry only (`trace: 'on-first-retry'`)
- Total estimated suite duration: ~6 min on slowest shard (well under 30-min ceiling)
```

## Red Lines

- Never use arbitrary `waitForTimeout` / `Task.Delay` / `Thread.sleep`.
- Never use CSS class, XPath, nth-child, or generated-ID selectors.
- Never share state between tests; never share a credential across runs.
- Never E2E what could be unit- or integration-tested.
- Never assert on an API response while bypassing the UI — that test is mis-tiered.
- Never commit a test without running it first and confirming it failed for the right reason.
- Never substitute visual regression for functional assertion.
- Never ship a critical-path E2E without an axe scan on the touched pages.

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>      # fingerprint for dedup
severity: critical                                     # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                        # high = pattern + AST match; low = pattern only
engine: e2e-test-writer
kind:                                                  # taxonomy below
  - edge_case_at_e2e_layer
  - shared_test_user
  - ui_bypass_for_assertion
  - missing_a11y_scan
  - visual_regression_as_functional_substitute
  - arbitrary_sleep
  - fragile_selector
  - slow_test
  - suite_budget_breach
  - missing_or_silent_retry_strategy
  - shared_state_between_tests
  - ui_seeded_data
  - hardcoded_credential
target_file: e2e/checkout.spec.ts
target_line: 42
missing_scenario: "no E2E test covers the Stripe Checkout cancel-return path"
suggested_test_skeleton: |
  test('user cancels Stripe Checkout and lands on /cart with items intact', async ({ page }) => {
    // arrange: seed cart via API
    // act: start checkout, abort on Stripe-hosted page
    // assert: redirected to /cart, items unchanged, no charge in Stripe test ledger
    // a11y: axe scan on /cart
  });
message: "Checkout cancel-return path is uncovered; this is a top-3 conversion drop-off."
reference: https://playwright.dev/docs/best-practices
```

The integrator uses `confidence` and `kind` to weight findings. `confidence: low` single-pattern hits do not block phase advancement on their own; two corroborating kinds on the same file (e.g. `fragile_selector` + `arbitrary_sleep`) escalate. Missing scenarios on golden paths block until either the test is written or an explicit waiver appears in the plan's `## Decisions Taken Under Ambiguity` section.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
