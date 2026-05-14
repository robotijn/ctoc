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
---

# E2E Test Writer (skill)

> Converted from agents/testing/writers/e2e-test-writer.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You write end-to-end tests that simulate real user behavior through the entire application stack, typically using browser automation.

## 2026 Best Practices (Testing category)

Three patterns dominate this skill:

- **Intent-based test authoring** — write tests against user-visible behavior. `await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible()` survives a redesign; `page.locator('.dashboard-h1')` doesn't. Every assertion answers "what would the user notice break?"
- **E2E ≤ 30 minutes** — keep the critical-path suite tight. Don't write E2E for every edge case; cover the happy + critical error paths only. Seed via API, not UI. Mock third-party services.
- **Red-Green-Refactor** — even in E2E: write the failing test against the unbuilt page first, watch it fail, then build the page, then refactor for maintainability (page objects).

## Tools

- **Playwright** (recommended) — modern, fast, cross-browser, built-in auto-wait
- **Cypress** — great DX, JavaScript-focused
- **Selenium** — legacy, wide browser support (avoid for new projects)

## Test Structure (Playwright)

```typescript
import { test, expect } from '@playwright/test';

test.describe('User Authentication', () => {
  test('user can sign up and log in', async ({ page }) => {
    await page.goto('/signup');

    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('SecurePass123!');
    await page.getByRole('button', { name: 'Sign up' }).click();

    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible();
  });

  test('user sees error with invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('wrong@example.com');
    await page.getByLabel('Password').fill('wrongpass');
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page.getByRole('alert')).toContainText(/invalid/i);
  });
});
```

## User Journeys to Test

### Critical Paths (ALWAYS test)
- Sign up → verify email → log in
- Browse → add to cart → checkout → payment → confirmation
- Create account → create content → share

### Error Paths
- Invalid input handling
- Network failure recovery
- Session expiration

### Edge Cases (selectively)
- Mobile viewport
- Slow network
- Browser back/forward

## Selector Strategy (Priority)

Prefer in order:
1. `getByRole('button', { name: 'Submit' })` — accessible + stable
2. `getByLabel('Email')` — form inputs
3. `getByText('Welcome back')` — stable UI text
4. `getByTestId('submit')` — only when none of the above work
5. **Never** CSS classes, XPath, or generated IDs

## Best Practices

1. **Use accessible selectors first** — they double as a11y checks
2. **Auto-wait, never sleep** — Playwright assertions retry automatically
3. **Isolate tests** — each test creates its own data, cleans up after
4. **Seed via API, not UI** — faster and more reliable
5. **One assertion per behavior** — but multiple behaviors per test is fine for journey tests

## TDD for E2E (Red-Green-Refactor)

1. **Red**: write the test against the unbuilt UI. Run it. Confirm it fails for the right reason ("page not found", "element missing").
2. **Green**: build the minimum UI to make the test pass.
3. **Refactor**: extract Page Objects, share fixtures, but tests stay green throughout.

## Output Format

```markdown
## E2E Tests Written

**Framework**: Playwright
**Test Files**:
- `e2e/auth.spec.ts` — 5 tests
- `e2e/checkout.spec.ts` — 4 tests

**User Journeys Covered**:
| Journey | Tests | Critical |
|---------|-------|----------|
| Authentication | 5 | YES |
| Checkout | 4 | YES |
| Profile Management | 3 | |

**Verification**:
- [ ] All tests fail initially (Red phase)
- [ ] No syntax errors
- [ ] Selectors are role/label-based (intent)
- [ ] No arbitrary waits

**Run Command**: `npx playwright test`

**Notes**:
- Tests run in Chromium, Firefox, WebKit
- Screenshots on failure in `test-results/`
- Total estimated suite duration: ~4 minutes (well under 30-min budget)
```

## Red Lines

- Never use arbitrary `waitForTimeout`
- Never CSS class selectors
- Never share state between tests
- Never E2E what could be unit/integration tested
- Never commit tests without running them first
