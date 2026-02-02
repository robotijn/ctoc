# Playwright for Angular
> Claude Code Angular E2E testing reference. Updated February 2026.

## Installation

```bash
# New Angular project with Playwright
ng new my-app
cd my-app
ng e2e  # Select Playwright when prompted

# Add to existing project
npm install -D @playwright/test
npx playwright install

# Or use Angular CLI schematic
ng add @playwright/angular-schematic
```

## Configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }]
  ],
  use: {
    baseURL: 'http://localhost:4200',
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
    command: 'ng serve',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000
  }
});
```

### Production Build Configuration

```typescript
// playwright.config.ts for production testing
export default defineConfig({
  webServer: {
    command: process.env.CI
      ? 'ng build && npx serve -s dist/my-app/browser -l 4200'
      : 'ng serve',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env.CI
  }
});
```

## Folder Structure

```
angular-app/
├── src/
│   ├── app/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── app.routes.ts
│   └── main.ts
├── e2e/
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
└── angular.json
```

## Page Objects

### Base Page

```typescript
// e2e/pages/base.page.ts
import { Page, Locator, expect } from '@playwright/test';

export abstract class BasePage {
  readonly page: Page;

  // Common Angular elements
  readonly appRoot: Locator;
  readonly loadingSpinner: Locator;
  readonly routerOutlet: Locator;

  constructor(page: Page) {
    this.page = page;
    this.appRoot = page.locator('app-root');
    this.loadingSpinner = page.getByTestId('loading-spinner');
    this.routerOutlet = page.locator('router-outlet');
  }

  abstract readonly path: string;

  async goto(): Promise<void> {
    await this.page.goto(this.path);
    await this.waitForAngularReady();
  }

  async waitForAngularReady(): Promise<void> {
    // Wait for Angular to finish bootstrapping and rendering
    await this.page.waitForFunction(() => {
      const appRoot = document.querySelector('app-root');
      if (!appRoot) return false;

      // Check if Angular has finished initialization
      // @ts-ignore - Angular internal
      const ngComponent = (window as any).ng?.getComponent?.(appRoot);
      return !!ngComponent;
    }, { timeout: 10000 });

    // Wait for any loading indicators to disappear
    await this.loadingSpinner.waitFor({ state: 'hidden', timeout: 10000 });
  }

  async waitForNavigation(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
    await this.loadingSpinner.waitFor({ state: 'hidden' });
  }

  async getCurrentRoute(): Promise<string> {
    return await this.page.evaluate(() => window.location.pathname);
  }
}
```

### Login Page

```typescript
// e2e/pages/login.page.ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class LoginPage extends BasePage {
  readonly path = '/login';

  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly forgotPasswordLink: Locator;
  readonly rememberMeCheckbox: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: /sign in|log in/i });
    this.errorMessage = page.getByTestId('login-error');
    this.forgotPasswordLink = page.getByRole('link', { name: /forgot password/i });
    this.rememberMeCheckbox = page.getByLabel(/remember me/i);
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
// e2e/pages/dashboard.page.ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';
import { HeaderComponent } from '../components/header.component';
import { SidebarComponent } from '../components/sidebar.component';

export class DashboardPage extends BasePage {
  readonly path = '/dashboard';

  readonly header: HeaderComponent;
  readonly sidebar: SidebarComponent;

  readonly pageTitle: Locator;
  readonly statsCards: Locator;
  readonly activityTable: Locator;
  readonly refreshButton: Locator;

  constructor(page: Page) {
    super(page);
    this.header = new HeaderComponent(page);
    this.sidebar = new SidebarComponent(page);
    this.pageTitle = page.getByRole('heading', { level: 1 });
    this.statsCards = page.getByTestId('stats-card');
    this.activityTable = page.getByRole('table');
    this.refreshButton = page.getByRole('button', { name: /refresh/i });
  }

  async expectTitle(title: string): Promise<void> {
    await expect(this.pageTitle).toHaveText(title);
  }

  async getStatValue(statName: string): Promise<string> {
    const card = this.statsCards.filter({ hasText: statName });
    return await card.getByTestId('stat-value').textContent() || '';
  }

  async refresh(): Promise<void> {
    await this.refreshButton.click();
    await this.waitForAngularReady();
  }

  async getTableRowCount(): Promise<number> {
    return await this.activityTable.getByRole('row').count() - 1; // Minus header
  }
}
```

### Component Objects

```typescript
// e2e/components/header.component.ts
import { Page, Locator } from '@playwright/test';

export class HeaderComponent {
  readonly page: Page;
  readonly container: Locator;
  readonly logo: Locator;
  readonly searchInput: Locator;
  readonly userMenu: Locator;
  readonly userMenuDropdown: Locator;
  readonly logoutButton: Locator;
  readonly notificationBell: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('app-header');
    this.logo = this.container.getByRole('link', { name: /home|logo/i });
    this.searchInput = this.container.getByRole('searchbox');
    this.userMenu = this.container.getByTestId('user-menu');
    this.userMenuDropdown = page.getByRole('menu');
    this.logoutButton = page.getByRole('menuitem', { name: /log out/i });
    this.notificationBell = this.container.getByRole('button', { name: /notifications/i });
  }

  async openUserMenu(): Promise<void> {
    await this.userMenu.click();
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
}
```

```typescript
// e2e/components/sidebar.component.ts
import { Page, Locator } from '@playwright/test';

export class SidebarComponent {
  readonly page: Page;
  readonly container: Locator;
  readonly navItems: Locator;
  readonly collapseToggle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('app-sidebar');
    this.navItems = this.container.getByRole('link');
    this.collapseToggle = this.container.getByRole('button', { name: /toggle/i });
  }

  async navigateTo(itemName: string): Promise<void> {
    await this.navItems.filter({ hasText: itemName }).click();
    await this.page.waitForLoadState('networkidle');
  }

  async toggleCollapse(): Promise<void> {
    await this.collapseToggle.click();
    // Wait for Angular animation
    await this.page.waitForTimeout(300);
  }

  async isCollapsed(): Promise<boolean> {
    return await this.container.evaluate(el =>
      el.classList.contains('collapsed')
    );
  }
}
```

```typescript
// e2e/components/modal.component.ts
import { Page, Locator, expect } from '@playwright/test';

export class ModalComponent {
  readonly page: Page;
  readonly container: Locator;
  readonly title: Locator;
  readonly closeButton: Locator;
  readonly confirmButton: Locator;
  readonly cancelButton: Locator;
  readonly backdrop: Locator;

  constructor(page: Page, selector?: string) {
    this.page = page;
    this.container = selector
      ? page.locator(selector)
      : page.getByRole('dialog');
    this.title = this.container.getByRole('heading');
    this.closeButton = this.container.getByRole('button', { name: /close/i });
    this.confirmButton = this.container.getByRole('button', { name: /confirm|save|ok/i });
    this.cancelButton = this.container.getByRole('button', { name: /cancel/i });
    this.backdrop = page.locator('.modal-backdrop, .cdk-overlay-backdrop');
  }

  async expectOpen(): Promise<void> {
    await expect(this.container).toBeVisible();
  }

  async expectClosed(): Promise<void> {
    await expect(this.container).not.toBeVisible();
  }

  async close(): Promise<void> {
    await this.closeButton.click();
    // Wait for Angular animation
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

  async clickBackdrop(): Promise<void> {
    await this.backdrop.click({ force: true });
  }
}
```

## Test Examples

### Basic Tests

```typescript
// e2e/specs/auth.spec.ts
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

  test('validates email format', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.emailInput.fill('invalid-email');
    await loginPage.emailInput.blur();
    await expect(loginPage.page.getByText(/valid email/i)).toBeVisible();
  });
});
```

### Reactive Forms Testing

```typescript
// e2e/specs/forms.spec.ts
import { test, expect } from '../fixtures';

test.describe('Reactive Forms', () => {
  test('shows validation errors on touched fields', async ({ page }) => {
    await page.goto('/register');

    // Touch and leave email field
    await page.getByLabel('Email').focus();
    await page.getByLabel('Email').blur();

    await expect(page.getByText('Email is required')).toBeVisible();
  });

  test('shows all errors on submit attempt', async ({ page }) => {
    await page.goto('/register');

    await page.getByRole('button', { name: 'Register' }).click();

    // All validation errors should appear
    await expect(page.getByText('Name is required')).toBeVisible();
    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('disables submit button when form invalid', async ({ page }) => {
    await page.goto('/register');

    const submitButton = page.getByRole('button', { name: 'Register' });
    await expect(submitButton).toBeDisabled();

    // Fill valid data
    await page.getByLabel('Name').fill('John Doe');
    await page.getByLabel('Email').fill('john@example.com');
    await page.getByLabel('Password').fill('SecurePass123!');
    await page.getByLabel('Confirm Password').fill('SecurePass123!');

    await expect(submitButton).toBeEnabled();
  });

  test('clears errors when valid input provided', async ({ page }) => {
    await page.goto('/register');

    // Trigger error
    await page.getByLabel('Email').focus();
    await page.getByLabel('Email').blur();
    await expect(page.getByText('Email is required')).toBeVisible();

    // Fix error
    await page.getByLabel('Email').fill('valid@example.com');

    await expect(page.getByText('Email is required')).not.toBeVisible();
  });
});
```

### Angular Router Testing

```typescript
// e2e/specs/navigation.spec.ts
import { test, expect } from '../fixtures';

test.describe('Angular Router', () => {
  test('navigates between routes', async ({ dashboardPage }) => {
    await dashboardPage.goto();

    await dashboardPage.sidebar.navigateTo('Settings');
    await expect(dashboardPage.page).toHaveURL('/dashboard/settings');

    await dashboardPage.sidebar.navigateTo('Profile');
    await expect(dashboardPage.page).toHaveURL('/dashboard/profile');
  });

  test('protects routes with guards', async ({ page }) => {
    // Not authenticated
    await page.goto('/dashboard');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test('preserves query params during navigation', async ({ page }) => {
    await page.goto('/products?category=electronics&sort=price');

    await page.getByRole('link', { name: 'Next Page' }).click();

    const url = new URL(page.url());
    expect(url.searchParams.get('category')).toBe('electronics');
  });

  test('lazy loads modules', async ({ page }) => {
    // Monitor network requests
    const requests: string[] = [];
    page.on('request', request => {
      if (request.url().includes('.js')) {
        requests.push(request.url());
      }
    });

    await page.goto('/');

    // Navigate to lazy-loaded route
    await page.getByRole('link', { name: 'Admin' }).click();

    // Should have loaded admin module chunk
    expect(requests.some(r => r.includes('admin'))).toBe(true);
  });
});
```

### Angular Material/CDK Testing

```typescript
// e2e/specs/material.spec.ts
import { test, expect } from '../fixtures';

test.describe('Angular Material Components', () => {
  test('mat-select works correctly', async ({ page }) => {
    await page.goto('/forms');

    // Open mat-select
    await page.getByLabel('Country').click();

    // Select option from overlay
    await page.getByRole('option', { name: 'United States' }).click();

    // Verify selection
    await expect(page.getByLabel('Country')).toContainText('United States');
  });

  test('mat-autocomplete shows suggestions', async ({ page }) => {
    await page.goto('/search');

    await page.getByLabel('Search').fill('ang');

    // Wait for autocomplete panel
    const panel = page.locator('.mat-mdc-autocomplete-panel');
    await expect(panel).toBeVisible();

    // Select option
    await panel.getByRole('option', { name: 'Angular' }).click();

    await expect(page.getByLabel('Search')).toHaveValue('Angular');
  });

  test('mat-dialog opens and closes', async ({ page }) => {
    await page.goto('/dashboard');

    await page.getByRole('button', { name: 'Add Item' }).click();

    // Dialog should open
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Close dialog
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    // Wait for animation
    await page.waitForTimeout(300);
    await expect(dialog).not.toBeVisible();
  });

  test('mat-table pagination works', async ({ page }) => {
    await page.goto('/users');

    // Check initial page
    await expect(page.getByText('1 - 10 of')).toBeVisible();

    // Go to next page
    await page.getByRole('button', { name: 'Next page' }).click();

    await expect(page.getByText('11 - 20 of')).toBeVisible();
  });

  test('drag and drop with CDK', async ({ page }) => {
    await page.goto('/kanban');

    const item = page.getByTestId('task-1');
    const targetColumn = page.getByTestId('column-done');

    // Drag and drop
    await item.dragTo(targetColumn);

    // Verify item moved
    await expect(targetColumn.getByTestId('task-1')).toBeVisible();
  });
});
```

### HTTP Interceptor Testing

```typescript
// e2e/specs/http.spec.ts
import { test, expect } from '../fixtures';

test.describe('HTTP Handling', () => {
  test('shows loading indicator during requests', async ({ page }) => {
    await page.route('**/api/users', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.fulfill({ json: [] });
    });

    await page.goto('/users');

    // Loading indicator should appear
    await expect(page.getByTestId('loading-spinner')).toBeVisible();

    // Then disappear after load
    await expect(page.getByTestId('loading-spinner')).toBeHidden({ timeout: 5000 });
  });

  test('handles HTTP errors gracefully', async ({ page }) => {
    await page.route('**/api/users', route => {
      route.fulfill({ status: 500 });
    });

    await page.goto('/users');

    await expect(page.getByRole('alert')).toContainText('Failed to load');
  });

  test('retries failed requests', async ({ page }) => {
    let requestCount = 0;
    await page.route('**/api/data', route => {
      requestCount++;
      if (requestCount < 3) {
        route.abort('failed');
      } else {
        route.fulfill({ json: { data: 'success' } });
      }
    });

    await page.goto('/data');

    // Should eventually succeed after retries
    await expect(page.getByText('success')).toBeVisible({ timeout: 10000 });
  });
});
```

## Fixtures

```typescript
// e2e/fixtures/index.ts
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
// e2e/fixtures/auth.fixture.ts
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

      - name: Build Angular app
        run: npm run build

      - name: Run E2E tests
        run: npm run e2e

      - name: Upload report
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

## What NOT to Do

- Do NOT test Angular internals — test user-visible behavior
- Do NOT use Protractor patterns — Playwright has better APIs
- Do NOT wait for arbitrary timeouts — wait for Angular to stabilize
- Do NOT test services directly — test through components
- Do NOT ignore zone.js timing — wait for Angular ready state
- Do NOT test template bindings — test rendered output
- Do NOT access component instances — use page interactions
- Do NOT skip Angular Material waiting — overlays need time
