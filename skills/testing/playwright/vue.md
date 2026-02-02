# Playwright for Vue.js
> Claude Code Vue.js E2E testing reference. Updated February 2026.

## Installation

```bash
# New Vue project with Playwright
npm create vue@latest
# Select "Yes" for Playwright when prompted

# Add to existing Vue project
npm install -D @playwright/test
npx playwright install
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

### Nuxt Configuration

```typescript
// playwright.config.ts for Nuxt
export default defineConfig({
  use: {
    baseURL: 'http://localhost:3000'
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI
  }
});
```

## Folder Structure

```
vue-app/
├── src/
│   ├── components/
│   ├── views/
│   ├── stores/           # Pinia stores
│   ├── composables/
│   └── App.vue
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
│   │   ├── navigation.component.ts
│   │   └── modal.component.ts
│   └── fixtures/
│       └── index.ts
├── playwright.config.ts
└── package.json
```

## Page Objects

### Base Page

```typescript
// e2e/pages/base.page.ts
import { Page, Locator, expect } from '@playwright/test';

export abstract class BasePage {
  readonly page: Page;

  // Common Vue transition/loading states
  readonly transitionGroup: Locator;
  readonly loadingOverlay: Locator;
  readonly toastNotification: Locator;

  constructor(page: Page) {
    this.page = page;
    this.transitionGroup = page.locator('[data-v-transition]');
    this.loadingOverlay = page.getByTestId('loading-overlay');
    this.toastNotification = page.getByRole('alert');
  }

  abstract readonly path: string;

  async goto(): Promise<void> {
    await this.page.goto(this.path);
    await this.waitForVueMount();
  }

  async waitForVueMount(): Promise<void> {
    // Wait for Vue to finish mounting
    await this.page.waitForFunction(() => {
      const app = document.getElementById('app');
      return app && app.children.length > 0 && !app.querySelector('[data-v-loading]');
    });
    await this.loadingOverlay.waitFor({ state: 'hidden', timeout: 10000 });
  }

  async waitForTransition(): Promise<void> {
    // Wait for Vue transitions to complete
    await this.page.waitForTimeout(300);  // Vue default transition duration
  }

  async expectToast(message: string): Promise<void> {
    await expect(this.toastNotification).toContainText(message);
  }

  async dismissToast(): Promise<void> {
    await this.toastNotification.getByRole('button', { name: /close/i }).click();
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
  readonly rememberMeCheckbox: Locator;
  readonly forgotPasswordLink: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: /sign in|log in/i });
    this.errorMessage = page.getByTestId('login-error');
    this.rememberMeCheckbox = page.getByLabel(/remember me/i);
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
// e2e/pages/dashboard.page.ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';
import { NavigationComponent } from '../components/navigation.component';

export class DashboardPage extends BasePage {
  readonly path = '/dashboard';

  readonly navigation: NavigationComponent;
  readonly welcomeMessage: Locator;
  readonly statsCards: Locator;
  readonly activityList: Locator;
  readonly refreshButton: Locator;

  constructor(page: Page) {
    super(page);
    this.navigation = new NavigationComponent(page);
    this.welcomeMessage = page.getByTestId('welcome-message');
    this.statsCards = page.getByTestId('stats-card');
    this.activityList = page.getByTestId('activity-list');
    this.refreshButton = page.getByRole('button', { name: /refresh/i });
  }

  async expectWelcome(name: string): Promise<void> {
    await expect(this.welcomeMessage).toContainText(name);
  }

  async getStatsCount(): Promise<number> {
    return await this.statsCards.count();
  }

  async refresh(): Promise<void> {
    await this.refreshButton.click();
    await this.waitForVueMount();
  }

  async getActivityItems(): Promise<string[]> {
    const items = await this.activityList.getByRole('listitem').all();
    return Promise.all(items.map(item => item.textContent() as Promise<string>));
  }
}
```

### Component Objects

```typescript
// e2e/components/navigation.component.ts
import { Page, Locator } from '@playwright/test';

export class NavigationComponent {
  readonly page: Page;
  readonly sidebar: Locator;
  readonly menuItems: Locator;
  readonly userMenu: Locator;
  readonly logoutButton: Locator;
  readonly collapseToggle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sidebar = page.getByRole('navigation', { name: /sidebar/i });
    this.menuItems = this.sidebar.getByRole('link');
    this.userMenu = page.getByTestId('user-menu');
    this.logoutButton = page.getByRole('menuitem', { name: /log out/i });
    this.collapseToggle = page.getByRole('button', { name: /toggle sidebar/i });
  }

  async navigateTo(itemName: string): Promise<void> {
    await this.menuItems.filter({ hasText: itemName }).click();
    // Wait for Vue Router transition
    await this.page.waitForLoadState('networkidle');
  }

  async openUserMenu(): Promise<void> {
    await this.userMenu.click();
  }

  async logout(): Promise<void> {
    await this.openUserMenu();
    await this.logoutButton.click();
  }

  async toggleSidebar(): Promise<void> {
    await this.collapseToggle.click();
    // Wait for collapse animation
    await this.page.waitForTimeout(300);
  }

  async isCollapsed(): Promise<boolean> {
    return await this.sidebar.evaluate(el =>
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
    // Wait for Vue transition
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

  test('redirects to original page after login', async ({ page, loginPage }) => {
    // Try to access protected page
    await page.goto('/dashboard/settings');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);

    // Login
    await loginPage.login('user@example.com', 'password123');

    // Should redirect back to settings
    await expect(page).toHaveURL('/dashboard/settings');
  });
});
```

### Pinia Store Testing

```typescript
// e2e/specs/store.spec.ts
import { test, expect } from '../fixtures';

test.describe('Pinia Store Integration', () => {
  test('cart updates when adding items', async ({ page }) => {
    await page.goto('/products');

    // Add item to cart
    await page.getByTestId('product-card').first()
      .getByRole('button', { name: 'Add to Cart' }).click();

    // Cart badge should update (Pinia state reflected in UI)
    await expect(page.getByTestId('cart-count')).toHaveText('1');

    // Add another item
    await page.getByTestId('product-card').nth(1)
      .getByRole('button', { name: 'Add to Cart' }).click();

    await expect(page.getByTestId('cart-count')).toHaveText('2');
  });

  test('cart persists across navigation', async ({ page }) => {
    await page.goto('/products');

    // Add item
    await page.getByTestId('product-card').first()
      .getByRole('button', { name: 'Add to Cart' }).click();

    // Navigate to different page
    await page.goto('/about');

    // Cart should still have item
    await expect(page.getByTestId('cart-count')).toHaveText('1');

    // Go to cart page
    await page.goto('/cart');

    // Item should be there
    await expect(page.getByTestId('cart-item')).toHaveCount(1);
  });
});
```

### Vue Router Navigation

```typescript
// e2e/specs/navigation.spec.ts
import { test, expect } from '../fixtures';

test.describe('Vue Router Navigation', () => {
  test('navigates using router links', async ({ dashboardPage }) => {
    await dashboardPage.goto();

    await dashboardPage.navigation.navigateTo('Settings');
    await expect(dashboardPage.page).toHaveURL('/dashboard/settings');

    await dashboardPage.navigation.navigateTo('Profile');
    await expect(dashboardPage.page).toHaveURL('/dashboard/profile');
  });

  test('handles route guards correctly', async ({ page }) => {
    // Not authenticated
    await page.goto('/dashboard');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows 404 for unknown routes', async ({ page }) => {
    await page.goto('/unknown-page-xyz');
    await expect(page.getByRole('heading')).toContainText('404');
  });

  test('handles programmatic navigation', async ({ page }) => {
    await page.goto('/products/1');

    await page.getByRole('button', { name: 'View Details' }).click();

    // Should navigate to detail page
    await expect(page).toHaveURL('/products/1/details');
  });
});
```

### Form Validation (VeeValidate/Vuelidate)

```typescript
// e2e/specs/forms.spec.ts
import { test, expect } from '../fixtures';

test.describe('Form Validation', () => {
  test('shows validation errors on blur', async ({ page }) => {
    await page.goto('/register');

    // Focus and blur email field without entering value
    await page.getByLabel('Email').focus();
    await page.getByLabel('Email').blur();

    await expect(page.getByText('Email is required')).toBeVisible();

    // Enter invalid email
    await page.getByLabel('Email').fill('invalid-email');
    await page.getByLabel('Email').blur();

    await expect(page.getByText('Enter a valid email')).toBeVisible();
  });

  test('shows all errors on submit', async ({ page }) => {
    await page.goto('/register');

    await page.getByRole('button', { name: 'Register' }).click();

    // All validation errors should be visible
    await expect(page.getByText('Name is required')).toBeVisible();
    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('clears errors when valid input provided', async ({ page }) => {
    await page.goto('/register');

    // Trigger error
    await page.getByLabel('Email').focus();
    await page.getByLabel('Email').blur();
    await expect(page.getByText('Email is required')).toBeVisible();

    // Fix error
    await page.getByLabel('Email').fill('valid@example.com');
    await page.getByLabel('Email').blur();

    await expect(page.getByText('Email is required')).not.toBeVisible();
  });

  test('submits form when valid', async ({ page }) => {
    await page.goto('/register');

    await page.getByLabel('Name').fill('John Doe');
    await page.getByLabel('Email').fill('john@example.com');
    await page.getByLabel('Password').fill('SecurePass123!');
    await page.getByLabel('Confirm Password').fill('SecurePass123!');
    await page.getByRole('button', { name: 'Register' }).click();

    await expect(page).toHaveURL('/dashboard');
  });
});
```

### Transition Testing

```typescript
// e2e/specs/transitions.spec.ts
import { test, expect } from '../fixtures';

test.describe('Vue Transitions', () => {
  test('modal opens with transition', async ({ page }) => {
    await page.goto('/dashboard');

    // Click button to open modal
    await page.getByRole('button', { name: 'Add Item' }).click();

    // Modal should be visible after transition
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
  });

  test('list items animate when added', async ({ page }) => {
    await page.goto('/todos');

    // Add new item
    await page.getByLabel('New Todo').fill('Test item');
    await page.getByRole('button', { name: 'Add' }).click();

    // Wait for transition
    await page.waitForTimeout(300);

    // Item should be visible
    await expect(page.getByText('Test item')).toBeVisible();
  });

  test('page transitions work correctly', async ({ page }) => {
    await page.goto('/');

    // Navigate to new page
    await page.getByRole('link', { name: 'About' }).click();

    // Wait for page transition
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL('/about');
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
import { test as base } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '../.auth/user.json');

export const test = base.extend({
  storageState: async ({}, use) => {
    await use(authFile);
  }
});

// Setup script (run before tests)
import { test as setup } from '@playwright/test';

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
// e2e/specs/api-mocking.spec.ts
import { test, expect } from '../fixtures';

test('displays mocked data', async ({ page }) => {
  await page.route('**/api/users', route => {
    route.fulfill({
      json: [
        { id: 1, name: 'John Doe', email: 'john@example.com' },
        { id: 2, name: 'Jane Doe', email: 'jane@example.com' }
      ]
    });
  });

  await page.goto('/users');

  await expect(page.getByText('John Doe')).toBeVisible();
  await expect(page.getByText('Jane Doe')).toBeVisible();
});

test('handles API errors', async ({ page }) => {
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

      - name: Build Vue app
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

- Do NOT test Vue reactivity internals — test user-visible behavior
- Do NOT wait for fixed timeouts — wait for Vue transitions properly
- Do NOT access Vue instance directly — use page interactions
- Do NOT test computed properties — test their rendered output
- Do NOT ignore transition timing — wait appropriately
- Do NOT test Pinia store directly — test UI state changes
- Do NOT skip route guard testing — verify protected routes
- Do NOT hardcode test data — use fixtures
