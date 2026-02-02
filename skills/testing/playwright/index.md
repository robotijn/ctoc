# Playwright Best Practices Master Guide
> Claude Code Playwright E2E testing reference. Updated February 2026.

## Installation and Setup

```bash
# New project
npm init playwright@latest

# Add to existing project
npm install -D @playwright/test
npx playwright install
```

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }]
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 12'] } }
  ],
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI
  }
});
```

## Page Object Model (POM)

The Page Object Model encapsulates page structure and interactions, providing reusable and maintainable test components.

### Structure

```
tests/
├── e2e/
│   ├── specs/
│   │   ├── auth.spec.ts
│   │   ├── checkout.spec.ts
│   │   └── dashboard.spec.ts
│   ├── pages/
│   │   ├── base.page.ts
│   │   ├── login.page.ts
│   │   ├── dashboard.page.ts
│   │   └── checkout.page.ts
│   ├── components/
│   │   ├── navbar.component.ts
│   │   ├── modal.component.ts
│   │   └── form.component.ts
│   └── fixtures/
│       ├── index.ts
│       └── auth.fixture.ts
```

### Base Page Object

```typescript
// tests/e2e/pages/base.page.ts
import { Page, Locator, expect } from '@playwright/test';

export abstract class BasePage {
  readonly page: Page;

  // Common elements
  readonly loadingSpinner: Locator;
  readonly toastMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.loadingSpinner = page.getByTestId('loading-spinner');
    this.toastMessage = page.getByRole('alert');
  }

  abstract readonly url: string;

  async goto(): Promise<void> {
    await this.page.goto(this.url);
    await this.waitForPageLoad();
  }

  async waitForPageLoad(): Promise<void> {
    await this.loadingSpinner.waitFor({ state: 'hidden', timeout: 10000 });
  }

  async expectToastMessage(message: string): Promise<void> {
    await expect(this.toastMessage).toContainText(message);
  }

  async screenshot(name: string): Promise<void> {
    await this.page.screenshot({
      path: `screenshots/${name}.png`,
      fullPage: true
    });
  }
}
```

### Concrete Page Object

```typescript
// tests/e2e/pages/login.page.ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class LoginPage extends BasePage {
  readonly url = '/login';

  // Form elements
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly forgotPasswordLink: Locator;
  readonly errorMessage: Locator;
  readonly rememberMeCheckbox: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: 'Sign In' });
    this.forgotPasswordLink = page.getByRole('link', { name: 'Forgot password?' });
    this.errorMessage = page.getByTestId('login-error');
    this.rememberMeCheckbox = page.getByLabel('Remember me');
  }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
    await this.waitForPageLoad();
  }

  async loginWithRememberMe(email: string, password: string): Promise<void> {
    await this.rememberMeCheckbox.check();
    await this.login(email, password);
  }

  async expectLoginError(message: string): Promise<void> {
    await expect(this.errorMessage).toBeVisible();
    await expect(this.errorMessage).toContainText(message);
  }

  async expectSuccessfulLogin(): Promise<void> {
    await expect(this.page).toHaveURL(/\/dashboard/);
  }
}
```

### Component Objects

```typescript
// tests/e2e/components/navbar.component.ts
import { Page, Locator } from '@playwright/test';

export class NavbarComponent {
  readonly page: Page;
  readonly container: Locator;
  readonly logo: Locator;
  readonly userMenu: Locator;
  readonly logoutButton: Locator;
  readonly notificationBell: Locator;
  readonly notificationCount: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.getByRole('navigation');
    this.logo = this.container.getByRole('link', { name: 'Home' });
    this.userMenu = this.container.getByTestId('user-menu');
    this.logoutButton = page.getByRole('menuitem', { name: 'Logout' });
    this.notificationBell = this.container.getByTestId('notifications');
    this.notificationCount = this.notificationBell.locator('.badge');
  }

  async openUserMenu(): Promise<void> {
    await this.userMenu.click();
  }

  async logout(): Promise<void> {
    await this.openUserMenu();
    await this.logoutButton.click();
  }

  async getNotificationCount(): Promise<number> {
    const count = await this.notificationCount.textContent();
    return parseInt(count || '0', 10);
  }
}
```

## Fixtures for Setup and Teardown

### Custom Fixtures

```typescript
// tests/e2e/fixtures/index.ts
import { test as base, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { DashboardPage } from '../pages/dashboard.page';
import { CheckoutPage } from '../pages/checkout.page';
import { NavbarComponent } from '../components/navbar.component';

// Define fixture types
type Pages = {
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  checkoutPage: CheckoutPage;
  navbar: NavbarComponent;
};

type TestData = {
  testUser: { email: string; password: string };
  testProduct: { id: string; name: string; price: number };
};

// Extend base test with fixtures
export const test = base.extend<Pages & TestData>({
  // Page fixtures
  loginPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await use(loginPage);
  },

  dashboardPage: async ({ page }, use) => {
    const dashboardPage = new DashboardPage(page);
    await use(dashboardPage);
  },

  checkoutPage: async ({ page }, use) => {
    const checkoutPage = new CheckoutPage(page);
    await use(checkoutPage);
  },

  navbar: async ({ page }, use) => {
    const navbar = new NavbarComponent(page);
    await use(navbar);
  },

  // Data fixtures
  testUser: async ({}, use) => {
    const user = {
      email: `test-${Date.now()}@example.com`,
      password: 'SecurePass123!'
    };

    // Setup: Create user via API
    const response = await fetch('http://localhost:3000/api/test/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user)
    });
    const createdUser = await response.json();

    await use({ ...user, ...createdUser });

    // Teardown: Delete user
    await fetch(`http://localhost:3000/api/test/users/${createdUser.id}`, {
      method: 'DELETE'
    });
  },

  testProduct: async ({}, use) => {
    await use({
      id: 'test-product-1',
      name: 'Test Product',
      price: 99.99
    });
  }
});

export { expect };
```

### Auth Fixture with Storage State

```typescript
// tests/e2e/fixtures/auth.fixture.ts
import { test as base } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '../.auth/user.json');

export const test = base.extend<{}, { workerStorageState: string }>({
  // Use the same storage state for all tests in this worker
  storageState: ({ workerStorageState }, use) => use(workerStorageState),

  // Authenticate once per worker
  workerStorageState: [async ({ browser }, use) => {
    const page = await browser.newPage({ storageState: undefined });

    // Perform authentication
    await page.goto('/login');
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('/dashboard');

    // Save signed-in state
    await page.context().storageState({ path: authFile });
    await page.close();

    await use(authFile);
  }, { scope: 'worker' }]
});
```

### Using Fixtures in Tests

```typescript
// tests/e2e/specs/auth.spec.ts
import { test, expect } from '../fixtures';

test.describe('Authentication', () => {
  test('allows user to log in', async ({ loginPage, testUser }) => {
    await loginPage.goto();
    await loginPage.login(testUser.email, testUser.password);
    await loginPage.expectSuccessfulLogin();
  });

  test('shows error for invalid credentials', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login('invalid@example.com', 'wrongpassword');
    await loginPage.expectLoginError('Invalid email or password');
  });

  test('allows user to logout', async ({ dashboardPage, navbar }) => {
    // Assumes authenticated state from auth fixture
    await dashboardPage.goto();
    await navbar.logout();
    await expect(dashboardPage.page).toHaveURL('/login');
  });
});
```

## Auto-Waiting and Built-in Waits

### Playwright's Built-in Auto-Waiting

Playwright automatically waits for elements before performing actions. These are the built-in wait conditions:

| Action | Auto-Wait Conditions |
|--------|---------------------|
| `click()` | Attached, visible, stable, enabled, no overlay |
| `fill()` | Attached, visible, enabled, editable |
| `check()` | Attached, visible, stable, enabled |
| `type()` | Attached, visible, enabled, editable |
| `hover()` | Attached, visible, stable |

### Explicit Waiting Patterns

```typescript
// Wait for element state
await page.getByRole('button').waitFor({ state: 'visible' });
await page.getByRole('button').waitFor({ state: 'hidden' });
await page.getByRole('button').waitFor({ state: 'attached' });
await page.getByRole('button').waitFor({ state: 'detached' });

// Wait for navigation
await page.waitForURL('/dashboard');
await page.waitForURL(/\/users\/\d+/);

// Wait for network
await page.waitForResponse('/api/users');
await page.waitForResponse(response =>
  response.url().includes('/api') && response.status() === 200
);

// Wait for load state
await page.waitForLoadState('networkidle');
await page.waitForLoadState('domcontentloaded');

// Wait for function
await page.waitForFunction(() => window.appReady === true);
```

### Assertion-Based Waiting

```typescript
// expect() has built-in retry logic
await expect(page.getByText('Success')).toBeVisible();
await expect(page.getByRole('button')).toBeEnabled();
await expect(page.locator('.items')).toHaveCount(5);
await expect(page).toHaveURL('/dashboard');
await expect(page).toHaveTitle('Dashboard');

// Custom timeout for slow operations
await expect(page.getByText('Processing')).toBeHidden({ timeout: 30000 });
```

### Anti-Patterns

```typescript
// BAD: Fixed delays
await page.waitForTimeout(2000);  // Never do this

// GOOD: Wait for specific condition
await page.getByText('Loaded').waitFor();

// BAD: Polling manually
while (!(await page.getByText('Ready').isVisible())) {
  await page.waitForTimeout(100);
}

// GOOD: Use built-in waiting
await expect(page.getByText('Ready')).toBeVisible();
```

## Parallel Execution Configuration

### Parallel Workers

```typescript
// playwright.config.ts
export default defineConfig({
  // Run tests in parallel files
  fullyParallel: true,

  // Number of parallel workers
  workers: process.env.CI ? 4 : undefined,  // undefined = CPU count / 2

  // Retry flaky tests
  retries: process.env.CI ? 2 : 0,

  // Maximum time for a single test
  timeout: 30 * 1000,

  // Maximum time for expect() assertions
  expect: {
    timeout: 5 * 1000
  }
});
```

### Sharding for CI

```yaml
# GitHub Actions with sharding
jobs:
  test:
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - run: npx playwright test --shard=${{ matrix.shard }}/4
```

### Serial Execution When Needed

```typescript
// Force serial execution for specific tests
test.describe.configure({ mode: 'serial' });

test.describe('Checkout Flow', () => {
  test('step 1: add to cart', async ({ page }) => {});
  test('step 2: enter shipping', async ({ page }) => {});
  test('step 3: payment', async ({ page }) => {});
});
```

### Isolating Test State

```typescript
// Each test gets a new browser context (isolated cookies/storage)
test('test 1', async ({ page }) => {
  // Fresh context - no cookies from other tests
});

test('test 2', async ({ page }) => {
  // Also fresh context
});

// Share context within describe block
test.describe('shared context', () => {
  let sharedPage: Page;

  test.beforeAll(async ({ browser }) => {
    sharedPage = await browser.newPage();
  });

  test.afterAll(async () => {
    await sharedPage.close();
  });
});
```

## API Mocking and Network Interception

### Route Interception

```typescript
// Mock API response
await page.route('**/api/users', async route => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([
      { id: 1, name: 'John' },
      { id: 2, name: 'Jane' }
    ])
  });
});

// Modify response
await page.route('**/api/config', async route => {
  const response = await route.fetch();
  const json = await response.json();
  json.featureFlags.newCheckout = true;
  await route.fulfill({ json });
});

// Abort request
await page.route('**/analytics/**', route => route.abort());

// Delay response (testing loading states)
await page.route('**/api/slow', async route => {
  await new Promise(resolve => setTimeout(resolve, 3000));
  await route.fulfill({ json: { data: 'delayed' } });
});
```

### HAR Recording and Playback

```typescript
// Record network traffic
await page.routeFromHAR('network.har', {
  update: true,  // Record mode
  url: '**/api/**'
});

// Playback recorded traffic
await page.routeFromHAR('network.har', {
  url: '**/api/**'
});
```

### Request Assertions

```typescript
// Wait for and assert on request
const requestPromise = page.waitForRequest('**/api/orders');
await page.getByRole('button', { name: 'Submit Order' }).click();
const request = await requestPromise;
expect(request.method()).toBe('POST');
expect(JSON.parse(request.postData()!)).toMatchObject({
  items: expect.any(Array)
});

// Assert on response
const responsePromise = page.waitForResponse('**/api/orders');
await page.getByRole('button', { name: 'Submit Order' }).click();
const response = await responsePromise;
expect(response.status()).toBe(201);
const data = await response.json();
expect(data.orderId).toBeDefined();
```

## Visual Regression Testing

### Screenshot Comparison

```typescript
// Full page screenshot
await expect(page).toHaveScreenshot('homepage.png');

// Element screenshot
await expect(page.getByTestId('header')).toHaveScreenshot('header.png');

// With options
await expect(page).toHaveScreenshot('dashboard.png', {
  maxDiffPixels: 100,
  maxDiffPixelRatio: 0.01,
  threshold: 0.2,  // 0-1, lower = stricter
  animations: 'disabled',
  mask: [page.getByTestId('timestamp')],  // Ignore dynamic content
  fullPage: true
});
```

### Configuration

```typescript
// playwright.config.ts
export default defineConfig({
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 50,
      animations: 'disabled',
      caret: 'hide'
    },
    toMatchSnapshot: {
      maxDiffPixelRatio: 0.05
    }
  },
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}'
});
```

### Updating Snapshots

```bash
# Update all snapshots
npx playwright test --update-snapshots

# Update specific test snapshots
npx playwright test login.spec.ts --update-snapshots
```

### Handling Dynamic Content

```typescript
// Mask dynamic elements
await expect(page).toHaveScreenshot('page.png', {
  mask: [
    page.getByTestId('current-time'),
    page.getByTestId('random-ad')
  ]
});

// Wait for animations to complete
await page.getByRole('dialog').waitFor({ state: 'visible' });
await page.waitForTimeout(300);  // Wait for CSS transition
await expect(page.getByRole('dialog')).toHaveScreenshot('modal.png');

// Disable CSS animations
await page.addStyleTag({
  content: `
    *, *::before, *::after {
      animation-duration: 0s !important;
      transition-duration: 0s !important;
    }
  `
});
```

## Accessibility Testing Integration

### Built-in Accessibility Scanning

```typescript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility', () => {
  test('homepage has no critical accessibility issues', async ({ page }) => {
    await page.goto('/');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('login form is accessible', async ({ page }) => {
    await page.goto('/login');

    const results = await new AxeBuilder({ page })
      .include('[data-testid="login-form"]')
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('allows excluding known issues', async ({ page }) => {
    await page.goto('/legacy');

    const results = await new AxeBuilder({ page })
      .disableRules(['color-contrast'])  // Known issue in legacy component
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
```

### Accessibility Fixture

```typescript
// fixtures/a11y.fixture.ts
import { test as base, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export const test = base.extend({
  checkA11y: async ({ page }, use) => {
    const check = async (options?: { exclude?: string[]; include?: string }) => {
      let builder = new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa']);

      if (options?.include) {
        builder = builder.include(options.include);
      }

      if (options?.exclude) {
        for (const selector of options.exclude) {
          builder = builder.exclude(selector);
        }
      }

      const results = await builder.analyze();

      if (results.violations.length > 0) {
        const messages = results.violations.map(v =>
          `${v.id}: ${v.description}\n  ${v.nodes.map(n => n.html).join('\n  ')}`
        ).join('\n\n');
        throw new Error(`Accessibility violations:\n${messages}`);
      }
    };

    await use(check);
  }
});
```

## Debugging and Troubleshooting

### Debug Mode

```bash
# Run with Playwright Inspector
PWDEBUG=1 npx playwright test

# Run headed (visible browser)
npx playwright test --headed

# Slow down execution
npx playwright test --headed --slowmo=500
```

### Trace Viewer

```typescript
// Enable tracing
export default defineConfig({
  use: {
    trace: 'on-first-retry',  // or 'on', 'retain-on-failure'
  }
});

// View traces
// npx playwright show-trace test-results/trace.zip
```

### Console and Network Logging

```typescript
test('debug network', async ({ page }) => {
  // Log all console messages
  page.on('console', msg => console.log('CONSOLE:', msg.text()));

  // Log all requests
  page.on('request', req => console.log('REQUEST:', req.method(), req.url()));

  // Log all responses
  page.on('response', res => console.log('RESPONSE:', res.status(), res.url()));

  await page.goto('/');
});
```

### Pause Execution

```typescript
test('debugging', async ({ page }) => {
  await page.goto('/');

  // Pause and open inspector
  await page.pause();

  // Continue after inspection
});
```

## Best Practices Summary

### Locator Priority

Use locators in this order of preference:

1. **Role** — `getByRole('button', { name: 'Submit' })`
2. **Label** — `getByLabel('Email')`
3. **Placeholder** — `getByPlaceholder('Enter email')`
4. **Text** — `getByText('Welcome')`
5. **Alt text** — `getByAltText('Logo')`
6. **Title** — `getByTitle('Close')`
7. **Test ID** — `getByTestId('submit-button')` (last resort)

### Test Independence

```typescript
// GOOD: Each test sets up its own state
test('creates order', async ({ page, testUser }) => {
  await loginAs(page, testUser);
  await createOrder(page);
  // ...
});

// BAD: Tests depend on each other
test('creates order', async ({ page }) => {
  // Assumes previous test logged in
  await createOrder(page);
});
```

### Avoid Hardcoded Waits

```typescript
// BAD
await page.waitForTimeout(3000);

// GOOD
await page.getByText('Loaded').waitFor();
await expect(page.getByRole('status')).toContainText('Complete');
```

### Use Web-First Assertions

```typescript
// BAD: Manual assertions without retry
const text = await page.getByTestId('status').textContent();
expect(text).toBe('Ready');

// GOOD: Web-first assertion with auto-retry
await expect(page.getByTestId('status')).toHaveText('Ready');
```

## What NOT to Do

- Do NOT use `page.waitForTimeout()` — wait for conditions instead
- Do NOT use XPath or CSS selectors — use semantic locators
- Do NOT test implementation details — test user-visible behavior
- Do NOT share state between tests — use fixtures
- Do NOT ignore flaky tests — fix root cause or quarantine
- Do NOT run all browsers in CI — pick representative subset
- Do NOT store credentials in code — use environment variables
- Do NOT skip accessibility testing — integrate axe-core
- Do NOT forget to clean up test data — use fixture teardown
- Do NOT test third-party services — mock external dependencies
