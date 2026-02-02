# Playwright for Next.js
> Claude Code Next.js E2E testing reference. Updated February 2026.

## Installation

```bash
# In a Next.js project
npm install -D @playwright/test
npx playwright install

# Or use create-next-app with Playwright
npx create-next-app@latest --typescript --tailwind --app --e2e=playwright
```

## Configuration

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
    ['json', { outputFile: 'test-results/results.json' }]
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    }
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000
  }
});
```

### Production Build Testing

```typescript
// playwright.config.ts
export default defineConfig({
  webServer: {
    command: process.env.CI
      ? 'npm run build && npm run start'
      : 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      NODE_ENV: process.env.CI ? 'production' : 'development'
    }
  }
});
```

## Folder Structure

```
your-nextjs-app/
├── app/                          # Next.js App Router
│   ├── (auth)/
│   │   ├── login/
│   │   └── register/
│   ├── dashboard/
│   └── layout.tsx
├── components/
├── tests/
│   └── e2e/
│       ├── specs/
│       │   ├── auth/
│       │   │   ├── login.spec.ts
│       │   │   └── register.spec.ts
│       │   ├── dashboard.spec.ts
│       │   └── navigation.spec.ts
│       ├── pages/
│       │   ├── base.page.ts
│       │   ├── login.page.ts
│       │   └── dashboard.page.ts
│       ├── components/
│       │   ├── header.component.ts
│       │   └── sidebar.component.ts
│       ├── fixtures/
│       │   ├── index.ts
│       │   └── auth.fixture.ts
│       └── utils/
│           ├── test-database.ts
│           └── mock-api.ts
├── playwright.config.ts
└── package.json
```

## Page Objects

### Base Page

```typescript
// tests/e2e/pages/base.page.ts
import { Page, Locator, expect } from '@playwright/test';

export abstract class BasePage {
  readonly page: Page;
  readonly loadingIndicator: Locator;
  readonly pageHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    // Next.js loading UI patterns
    this.loadingIndicator = page.locator('[data-loading="true"]');
    this.pageHeading = page.getByRole('heading', { level: 1 });
  }

  abstract readonly path: string;

  async goto(): Promise<void> {
    await this.page.goto(this.path);
    await this.waitForHydration();
  }

  async waitForHydration(): Promise<void> {
    // Wait for Next.js hydration to complete
    await this.page.waitForFunction(() => {
      return document.documentElement.hasAttribute('data-hydrated') ||
             !document.querySelector('[data-loading="true"]');
    }, { timeout: 10000 });
  }

  async waitForNavigation(): Promise<void> {
    // Next.js App Router uses soft navigation
    await this.page.waitForLoadState('domcontentloaded');
    await this.loadingIndicator.waitFor({ state: 'hidden', timeout: 10000 });
  }

  async expectPageTitle(title: string): Promise<void> {
    await expect(this.page).toHaveTitle(title);
  }

  async expectHeading(text: string): Promise<void> {
    await expect(this.pageHeading).toHaveText(text);
  }
}
```

### Login Page

```typescript
// tests/e2e/pages/login.page.ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class LoginPage extends BasePage {
  readonly path = '/login';

  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorAlert: Locator;
  readonly googleSignInButton: Locator;
  readonly forgotPasswordLink: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: /sign in/i });
    this.errorAlert = page.getByRole('alert');
    this.googleSignInButton = page.getByRole('button', { name: /continue with google/i });
    this.forgotPasswordLink = page.getByRole('link', { name: /forgot password/i });
  }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async expectError(message: string): Promise<void> {
    await expect(this.errorAlert).toBeVisible();
    await expect(this.errorAlert).toContainText(message);
  }

  async expectRedirectToDashboard(): Promise<void> {
    await expect(this.page).toHaveURL(/\/dashboard/);
  }
}
```

### Dashboard Page

```typescript
// tests/e2e/pages/dashboard.page.ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';
import { HeaderComponent } from '../components/header.component';
import { SidebarComponent } from '../components/sidebar.component';

export class DashboardPage extends BasePage {
  readonly path = '/dashboard';

  readonly header: HeaderComponent;
  readonly sidebar: SidebarComponent;

  readonly welcomeMessage: Locator;
  readonly statsCards: Locator;
  readonly activityFeed: Locator;

  constructor(page: Page) {
    super(page);
    this.header = new HeaderComponent(page);
    this.sidebar = new SidebarComponent(page);
    this.welcomeMessage = page.getByTestId('welcome-message');
    this.statsCards = page.getByTestId('stats-card');
    this.activityFeed = page.getByTestId('activity-feed');
  }

  async expectWelcomeMessage(username: string): Promise<void> {
    await expect(this.welcomeMessage).toContainText(username);
  }

  async getStatsCount(): Promise<number> {
    return await this.statsCards.count();
  }

  async waitForActivityFeed(): Promise<void> {
    await this.activityFeed.waitFor({ state: 'visible' });
    // Wait for Suspense boundary to resolve
    await this.page.waitForFunction(
      () => !document.querySelector('[data-testid="activity-feed"] [data-loading]'),
      { timeout: 10000 }
    );
  }
}
```

### Component Objects

```typescript
// tests/e2e/components/header.component.ts
import { Page, Locator } from '@playwright/test';

export class HeaderComponent {
  readonly page: Page;
  readonly container: Locator;
  readonly logo: Locator;
  readonly searchInput: Locator;
  readonly userMenuButton: Locator;
  readonly userMenuDropdown: Locator;
  readonly logoutButton: Locator;
  readonly notificationButton: Locator;
  readonly notificationBadge: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.getByRole('banner');
    this.logo = this.container.getByRole('link', { name: /home/i });
    this.searchInput = this.container.getByRole('searchbox');
    this.userMenuButton = this.container.getByTestId('user-menu-button');
    this.userMenuDropdown = page.getByRole('menu', { name: /user menu/i });
    this.logoutButton = page.getByRole('menuitem', { name: /log out/i });
    this.notificationButton = this.container.getByRole('button', { name: /notifications/i });
    this.notificationBadge = this.notificationButton.locator('.badge');
  }

  async openUserMenu(): Promise<void> {
    await this.userMenuButton.click();
    await this.userMenuDropdown.waitFor({ state: 'visible' });
  }

  async logout(): Promise<void> {
    await this.openUserMenu();
    await this.logoutButton.click();
  }

  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.searchInput.press('Enter');
  }

  async getNotificationCount(): Promise<number> {
    const text = await this.notificationBadge.textContent();
    return parseInt(text || '0', 10);
  }
}
```

## Test Examples

### Basic Test

```typescript
// tests/e2e/specs/auth/login.spec.ts
import { test, expect } from '../../fixtures';

test.describe('Login', () => {
  test('allows user to sign in with valid credentials', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login('test@example.com', 'validPassword123');
    await loginPage.expectRedirectToDashboard();
  });

  test('shows error for invalid credentials', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login('test@example.com', 'wrongPassword');
    await loginPage.expectError('Invalid email or password');
  });

  test('validates required fields', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.submitButton.click();
    await expect(loginPage.page.getByText('Email is required')).toBeVisible();
  });
});
```

### Server Actions Test

```typescript
// tests/e2e/specs/dashboard.spec.ts
import { test, expect } from '../fixtures';

test.describe('Dashboard', () => {
  test.use({ storageState: '.auth/user.json' });

  test('displays user dashboard with stats', async ({ dashboardPage }) => {
    await dashboardPage.goto();
    await dashboardPage.expectHeading('Dashboard');
    await expect(dashboardPage.statsCards).toHaveCount(4);
  });

  test('can submit form using Server Action', async ({ page }) => {
    await page.goto('/dashboard/settings');

    // Fill form
    await page.getByLabel('Display Name').fill('New Name');
    await page.getByRole('button', { name: 'Save Changes' }).click();

    // Server Action submits and revalidates
    await expect(page.getByRole('alert')).toContainText('Settings saved');
    await expect(page.getByLabel('Display Name')).toHaveValue('New Name');
  });

  test('handles Server Action errors', async ({ page }) => {
    await page.goto('/dashboard/settings');

    // Trigger validation error
    await page.getByLabel('Display Name').fill('');
    await page.getByRole('button', { name: 'Save Changes' }).click();

    await expect(page.getByText('Name is required')).toBeVisible();
  });
});
```

### Suspense and Loading States

```typescript
// tests/e2e/specs/suspense.spec.ts
import { test, expect } from '../fixtures';

test.describe('Suspense Loading States', () => {
  test('shows loading skeleton while data loads', async ({ page }) => {
    // Slow down API response
    await page.route('**/api/dashboard/stats', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.fulfill({
        json: { views: 1000, users: 50 }
      });
    });

    await page.goto('/dashboard');

    // Skeleton should appear
    await expect(page.getByTestId('stats-skeleton')).toBeVisible();

    // Then data should load
    await expect(page.getByTestId('stats-skeleton')).toBeHidden();
    await expect(page.getByText('1,000 views')).toBeVisible();
  });

  test('handles streaming with Suspense boundaries', async ({ page }) => {
    await page.goto('/dashboard');

    // Main content loads first
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // Sidebar loads separately (streaming)
    await expect(page.getByTestId('sidebar-skeleton')).toBeHidden({ timeout: 10000 });
    await expect(page.getByRole('navigation', { name: 'Sidebar' })).toBeVisible();
  });
});
```

## Fixtures

```typescript
// tests/e2e/fixtures/index.ts
import { test as base, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { DashboardPage } from '../pages/dashboard.page';

type TestFixtures = {
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  authenticatedPage: DashboardPage;
};

export const test = base.extend<TestFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },

  authenticatedPage: async ({ browser }, use) => {
    // Create context with stored auth state
    const context = await browser.newContext({
      storageState: '.auth/user.json'
    });
    const page = await context.newPage();
    const dashboard = new DashboardPage(page);
    await use(dashboard);
    await context.close();
  }
});

export { expect };
```

### Auth Setup

```typescript
// tests/e2e/fixtures/auth.setup.ts
import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '../.auth/user.json');

setup('authenticate', async ({ page }) => {
  // Login via UI
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.TEST_USER_EMAIL!);
  await page.getByLabel('Password').fill(process.env.TEST_USER_PASSWORD!);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for redirect
  await expect(page).toHaveURL('/dashboard');

  // Save signed-in state
  await page.context().storageState({ path: authFile });
});
```

### Config with Dependencies

```typescript
// playwright.config.ts
export default defineConfig({
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup']
    }
  ]
});
```

## Mocking Next.js APIs

### Route Handlers

```typescript
// tests/e2e/specs/api.spec.ts
import { test, expect } from '../fixtures';

test('mocks API route handler', async ({ page }) => {
  await page.route('**/api/users', async route => {
    await route.fulfill({
      status: 200,
      json: [
        { id: 1, name: 'Test User', email: 'test@example.com' }
      ]
    });
  });

  await page.goto('/users');
  await expect(page.getByText('Test User')).toBeVisible();
});

test('simulates API error', async ({ page }) => {
  await page.route('**/api/users', route => {
    route.fulfill({
      status: 500,
      json: { error: 'Internal Server Error' }
    });
  });

  await page.goto('/users');
  await expect(page.getByRole('alert')).toContainText('Failed to load users');
});
```

### External API Mocking

```typescript
// tests/e2e/specs/external-api.spec.ts
import { test, expect } from '../fixtures';

test('mocks external payment provider', async ({ page }) => {
  // Mock Stripe API
  await page.route('https://api.stripe.com/**', async route => {
    if (route.request().url().includes('payment_intents')) {
      await route.fulfill({
        json: {
          id: 'pi_test123',
          status: 'succeeded',
          amount: 2000
        }
      });
    } else {
      await route.continue();
    }
  });

  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Pay Now' }).click();
  await expect(page.getByText('Payment successful')).toBeVisible();
});
```

## CI/CD Workflow

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Build Next.js app
        run: npm run build

      - name: Run E2E tests
        run: npx playwright test --project=chromium
        env:
          TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
          TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7

      - name: Upload traces
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-traces
          path: test-results/
          retention-days: 7
```

## Environment Configuration

```typescript
// tests/e2e/utils/env.ts
export const config = {
  baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
  testUser: {
    email: process.env.TEST_USER_EMAIL || 'test@example.com',
    password: process.env.TEST_USER_PASSWORD || 'testPassword123'
  },
  apiMocking: process.env.MOCK_API === 'true'
};
```

```env
# .env.test
PLAYWRIGHT_BASE_URL=http://localhost:3000
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=testPassword123
MOCK_API=false
```

## What NOT to Do

- Do NOT test with `npm run dev` in CI — use production build
- Do NOT hardcode API URLs — use environment variables
- Do NOT test Next.js internals — test user-facing behavior
- Do NOT skip hydration waiting — causes flaky tests
- Do NOT test static content — focus on dynamic behavior
- Do NOT ignore Server Action errors — verify error states
- Do NOT forget to mock external services — avoid flaky network calls
- Do NOT share browser context between unrelated tests — use isolation
