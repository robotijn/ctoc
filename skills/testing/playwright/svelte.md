# Playwright for Svelte/SvelteKit
> Claude Code Svelte E2E testing reference. Updated February 2026.

## Installation

```bash
# SvelteKit with Playwright (recommended)
npm create svelte@latest my-app
# Select "Yes" for Playwright when prompted

# Add to existing project
npm install -D @playwright/test
npx playwright install
```

## Configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }]
  ],
  use: {
    baseURL: 'http://localhost:5173',
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
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000
  }
});
```

### SvelteKit Production Build

```typescript
// playwright.config.ts for production testing
export default defineConfig({
  webServer: {
    command: process.env.CI
      ? 'npm run build && npm run preview'
      : 'npm run dev',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI
  },
  use: {
    baseURL: process.env.CI
      ? 'http://localhost:4173'
      : 'http://localhost:5173'
  }
});
```

## Folder Structure

```
sveltekit-app/
├── src/
│   ├── lib/
│   │   ├── components/
│   │   └── stores/
│   └── routes/
│       ├── +layout.svelte
│       ├── +page.svelte
│       ├── login/
│       │   ├── +page.svelte
│       │   └── +page.server.ts
│       └── dashboard/
│           ├── +page.svelte
│           └── +page.server.ts
├── tests/
│   ├── specs/
│   │   ├── auth.spec.ts
│   │   ├── dashboard.spec.ts
│   │   └── forms.spec.ts
│   ├── pages/
│   │   ├── base.page.ts
│   │   ├── login.page.ts
│   │   └── dashboard.page.ts
│   ├── components/
│   │   ├── header.component.ts
│   │   └── modal.component.ts
│   └── fixtures/
│       └── index.ts
├── playwright.config.ts
└── package.json
```

## Page Objects

### Base Page

```typescript
// tests/pages/base.page.ts
import { Page, Locator, expect } from '@playwright/test';

export abstract class BasePage {
  readonly page: Page;

  // Common SvelteKit elements
  readonly loadingIndicator: Locator;
  readonly pageTransition: Locator;
  readonly errorBanner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.loadingIndicator = page.locator('[data-sveltekit-preload-data]');
    this.pageTransition = page.locator('[data-sveltekit-transition]');
    this.errorBanner = page.getByRole('alert');
  }

  abstract readonly path: string;

  async goto(): Promise<void> {
    await this.page.goto(this.path);
    await this.waitForSvelteKitLoad();
  }

  async waitForSvelteKitLoad(): Promise<void> {
    // Wait for SvelteKit hydration
    await this.page.waitForFunction(() => {
      return document.body.dataset.sveltekit !== 'loading';
    }, { timeout: 10000 });
  }

  async waitForNavigation(): Promise<void> {
    // SvelteKit uses client-side navigation
    await this.page.waitForLoadState('networkidle');
  }

  async expectNoErrors(): Promise<void> {
    await expect(this.errorBanner).not.toBeVisible();
  }

  async getPageData(): Promise<Record<string, unknown>> {
    return await this.page.evaluate(() => {
      const script = document.querySelector('[data-sveltekit-data]');
      return script ? JSON.parse(script.textContent || '{}') : {};
    });
  }
}
```

### Login Page

```typescript
// tests/pages/login.page.ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class LoginPage extends BasePage {
  readonly path = '/login';

  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly forgotPasswordLink: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: /sign in|log in/i });
    this.errorMessage = page.getByTestId('login-error');
    this.forgotPasswordLink = page.getByRole('link', { name: /forgot password/i });
  }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async expectError(message: string): Promise<void> {
    await expect(this.errorMessage).toBeVisible();
    await expect(this.errorMessage).toContainText(message);
  }

  async expectSuccess(): Promise<void> {
    await expect(this.page).toHaveURL(/\/dashboard/);
  }
}
```

### Dashboard Page

```typescript
// tests/pages/dashboard.page.ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';
import { HeaderComponent } from '../components/header.component';

export class DashboardPage extends BasePage {
  readonly path = '/dashboard';

  readonly header: HeaderComponent;
  readonly welcomeMessage: Locator;
  readonly statsGrid: Locator;
  readonly recentActivity: Locator;
  readonly refreshButton: Locator;

  constructor(page: Page) {
    super(page);
    this.header = new HeaderComponent(page);
    this.welcomeMessage = page.getByTestId('welcome-message');
    this.statsGrid = page.getByTestId('stats-grid');
    this.recentActivity = page.getByTestId('recent-activity');
    this.refreshButton = page.getByRole('button', { name: /refresh/i });
  }

  async expectWelcome(name: string): Promise<void> {
    await expect(this.welcomeMessage).toContainText(name);
  }

  async getStatValue(statName: string): Promise<string> {
    const stat = this.statsGrid.getByTestId(`stat-${statName}`);
    return await stat.textContent() || '';
  }

  async refresh(): Promise<void> {
    await this.refreshButton.click();
    await this.waitForNavigation();
  }

  async invalidateData(): Promise<void> {
    // Trigger SvelteKit data invalidation
    await this.page.evaluate(() => {
      // @ts-ignore - SvelteKit global
      window.__sveltekit_invalidateAll?.();
    });
  }
}
```

### Component Objects

```typescript
// tests/components/header.component.ts
import { Page, Locator } from '@playwright/test';

export class HeaderComponent {
  readonly page: Page;
  readonly container: Locator;
  readonly logo: Locator;
  readonly navLinks: Locator;
  readonly userMenu: Locator;
  readonly logoutButton: Locator;
  readonly themeToggle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.getByRole('banner');
    this.logo = this.container.getByRole('link', { name: /home|logo/i });
    this.navLinks = this.container.getByRole('navigation').getByRole('link');
    this.userMenu = this.container.getByTestId('user-menu');
    this.logoutButton = page.getByRole('menuitem', { name: /log out/i });
    this.themeToggle = this.container.getByRole('button', { name: /theme/i });
  }

  async navigateTo(linkName: string): Promise<void> {
    await this.navLinks.filter({ hasText: linkName }).click();
    await this.page.waitForLoadState('networkidle');
  }

  async openUserMenu(): Promise<void> {
    await this.userMenu.click();
  }

  async logout(): Promise<void> {
    await this.openUserMenu();
    await this.logoutButton.click();
  }

  async toggleTheme(): Promise<void> {
    await this.themeToggle.click();
  }
}
```

```typescript
// tests/components/modal.component.ts
import { Page, Locator, expect } from '@playwright/test';

export class ModalComponent {
  readonly page: Page;
  readonly container: Locator;
  readonly title: Locator;
  readonly closeButton: Locator;
  readonly confirmButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page, testId?: string) {
    this.page = page;
    this.container = testId
      ? page.getByTestId(testId)
      : page.getByRole('dialog');
    this.title = this.container.getByRole('heading');
    this.closeButton = this.container.getByRole('button', { name: /close/i });
    this.confirmButton = this.container.getByRole('button', { name: /confirm|save|ok/i });
    this.cancelButton = this.container.getByRole('button', { name: /cancel/i });
  }

  async expectOpen(): Promise<void> {
    await expect(this.container).toBeVisible();
  }

  async expectClosed(): Promise<void> {
    await expect(this.container).not.toBeVisible();
  }

  async close(): Promise<void> {
    await this.closeButton.click();
    // Wait for Svelte transition
    await this.page.waitForTimeout(300);
    await this.expectClosed();
  }

  async confirm(): Promise<void> {
    await this.confirmButton.click();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
    await this.expectClosed();
  }
}
```

## Test Examples

### Basic Tests

```typescript
// tests/specs/auth.spec.ts
import { test, expect } from '../fixtures';

test.describe('Authentication', () => {
  test('allows user to log in', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login('user@example.com', 'password123');
    await loginPage.expectSuccess();
  });

  test('shows error for invalid credentials', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login('user@example.com', 'wrongpassword');
    await loginPage.expectError('Invalid email or password');
  });

  test('preserves redirect URL after login', async ({ page, loginPage }) => {
    // Try to access protected page
    await page.goto('/dashboard/settings');

    // Should redirect to login with return URL
    await expect(page).toHaveURL(/\/login\?redirectTo=/);

    // Login
    await loginPage.login('user@example.com', 'password123');

    // Should return to settings
    await expect(page).toHaveURL('/dashboard/settings');
  });
});
```

### Form Actions Testing

```typescript
// tests/specs/forms.spec.ts
import { test, expect } from '../fixtures';

test.describe('SvelteKit Form Actions', () => {
  test('submits form via form action', async ({ page }) => {
    await page.goto('/contact');

    await page.getByLabel('Name').fill('John Doe');
    await page.getByLabel('Email').fill('john@example.com');
    await page.getByLabel('Message').fill('Hello, this is a test.');

    // SvelteKit form action submission
    await page.getByRole('button', { name: 'Send' }).click();

    // Wait for form action response
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Message sent successfully')).toBeVisible();
  });

  test('handles form action errors', async ({ page }) => {
    await page.goto('/contact');

    // Submit without filling required fields
    await page.getByRole('button', { name: 'Send' }).click();

    // Form action should return validation errors
    await expect(page.getByText('Name is required')).toBeVisible();
    await expect(page.getByText('Email is required')).toBeVisible();
  });

  test('progressive enhancement works without JS', async ({ page }) => {
    // Disable JavaScript
    await page.context().route('**/*', route => {
      if (route.request().resourceType() === 'script') {
        route.abort();
      } else {
        route.continue();
      }
    });

    await page.goto('/contact');

    await page.getByLabel('Name').fill('John Doe');
    await page.getByLabel('Email').fill('john@example.com');
    await page.getByLabel('Message').fill('Test message');

    // Form should still submit without JS
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText('Message sent')).toBeVisible();
  });
});
```

### Load Functions Testing

```typescript
// tests/specs/data-loading.spec.ts
import { test, expect } from '../fixtures';

test.describe('SvelteKit Data Loading', () => {
  test('displays data from load function', async ({ dashboardPage }) => {
    await dashboardPage.goto();

    // Data from +page.server.ts load function
    await dashboardPage.expectWelcome('Test User');
    await expect(dashboardPage.statsGrid).toBeVisible();
  });

  test('shows loading state while fetching', async ({ page }) => {
    // Slow down API response
    await page.route('**/api/dashboard', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.fulfill({
        json: { stats: [] }
      });
    });

    await page.goto('/dashboard');

    // Loading indicator should appear
    await expect(page.getByTestId('loading-skeleton')).toBeVisible();

    // Then data should load
    await expect(page.getByTestId('loading-skeleton')).toBeHidden({ timeout: 5000 });
  });

  test('handles load function errors', async ({ page }) => {
    await page.route('**/api/dashboard', route => {
      route.fulfill({
        status: 500,
        json: { message: 'Server error' }
      });
    });

    await page.goto('/dashboard');

    await expect(page.getByRole('alert')).toContainText('Failed to load');
  });

  test('invalidates and refetches data', async ({ dashboardPage }) => {
    await dashboardPage.goto();

    // Get initial stat value
    const initialValue = await dashboardPage.getStatValue('users');

    // Mock updated response
    await dashboardPage.page.route('**/api/dashboard', route => {
      route.fulfill({
        json: { stats: { users: parseInt(initialValue) + 100 } }
      });
    });

    // Trigger data invalidation
    await dashboardPage.refresh();

    // Value should update
    const newValue = await dashboardPage.getStatValue('users');
    expect(parseInt(newValue)).toBeGreaterThan(parseInt(initialValue));
  });
});
```

### Svelte Stores Testing

```typescript
// tests/specs/stores.spec.ts
import { test, expect } from '../fixtures';

test.describe('Svelte Stores', () => {
  test('cart store updates UI across components', async ({ page }) => {
    await page.goto('/products');

    // Add item to cart
    await page.getByTestId('product-card').first()
      .getByRole('button', { name: 'Add to Cart' }).click();

    // Cart count in header should update
    await expect(page.getByTestId('cart-count')).toHaveText('1');

    // Navigate to cart
    await page.goto('/cart');

    // Item should be in cart
    await expect(page.getByTestId('cart-item')).toHaveCount(1);
  });

  test('theme store persists preference', async ({ page }) => {
    await page.goto('/');

    // Toggle to dark theme
    await page.getByRole('button', { name: /theme/i }).click();

    // Should have dark class
    await expect(page.locator('html')).toHaveClass(/dark/);

    // Reload page
    await page.reload();

    // Theme should persist
    await expect(page.locator('html')).toHaveClass(/dark/);
  });
});
```

### SSR and Streaming

```typescript
// tests/specs/ssr.spec.ts
import { test, expect } from '../fixtures';

test.describe('SSR and Streaming', () => {
  test('page content is present in initial HTML', async ({ page }) => {
    // Get HTML before JavaScript executes
    const response = await page.goto('/about');
    const html = await response?.text();

    // Check for SSR content
    expect(html).toContain('About Us');
    expect(html).toContain('<h1');
  });

  test('streaming shows content progressively', async ({ page }) => {
    // Slow down streamed data
    await page.route('**/api/slow-data', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.fulfill({ json: { data: 'Streamed content' } });
    });

    await page.goto('/streaming-demo');

    // Initial content loads immediately
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // Streamed content shows loading first
    await expect(page.getByTestId('streamed-skeleton')).toBeVisible();

    // Then streamed content appears
    await expect(page.getByText('Streamed content')).toBeVisible({ timeout: 5000 });
  });
});
```

## Fixtures

```typescript
// tests/fixtures/index.ts
import { test as base, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { DashboardPage } from '../pages/dashboard.page';

type TestFixtures = {
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
};

export const test = base.extend<TestFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  }
});

export { expect };
```

### Auth Fixture

```typescript
// tests/fixtures/auth.fixture.ts
import { test as setup } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '../.auth/user.json');

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/dashboard');
  await page.context().storageState({ path: authFile });
});
```

## API Mocking

```typescript
// tests/specs/api-mocking.spec.ts
import { test, expect } from '../fixtures';

test('mocks external API', async ({ page }) => {
  await page.route('**/api/users', route => {
    route.fulfill({
      json: [
        { id: 1, name: 'Mocked User', email: 'mocked@example.com' }
      ]
    });
  });

  await page.goto('/users');

  await expect(page.getByText('Mocked User')).toBeVisible();
});

test('mocks SvelteKit endpoint', async ({ page }) => {
  await page.route('**/api/stats', route => {
    route.fulfill({
      json: { views: 999, users: 100 }
    });
  });

  await page.goto('/dashboard');

  await expect(page.getByText('999 views')).toBeVisible();
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

      - name: Install Playwright
        run: npx playwright install --with-deps chromium

      - name: Build SvelteKit app
        run: npm run build

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload report
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

## What NOT to Do

- Do NOT test Svelte reactivity internals — test user-visible behavior
- Do NOT skip waiting for SvelteKit hydration — causes flaky tests
- Do NOT test compiled output — test source behavior
- Do NOT ignore form action responses — verify action results
- Do NOT test load functions directly — test rendered output
- Do NOT mock $app/stores — interact through UI
- Do NOT forget SSR testing — verify server-rendered content
- Do NOT hardcode URLs — use page objects
