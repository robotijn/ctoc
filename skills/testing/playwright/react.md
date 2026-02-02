# Playwright for React
> Claude Code React E2E testing reference. Updated February 2026.

## Installation

```bash
# Add Playwright to existing React project
npm install -D @playwright/test
npx playwright install

# For Vite-based React projects
npm create vite@latest my-app -- --template react-ts
cd my-app
npm install -D @playwright/test
npx playwright install
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
    ['junit', { outputFile: 'test-results/junit.xml' }]
  ],
  use: {
    baseURL: 'http://localhost:5173',  // Vite default
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

### CRA (Create React App) Configuration

```typescript
// playwright.config.ts for CRA
export default defineConfig({
  use: {
    baseURL: 'http://localhost:3000'
  },
  webServer: {
    command: 'npm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    env: {
      BROWSER: 'none'  // Prevent CRA from opening browser
    }
  }
});
```

## Folder Structure

```
react-app/
├── src/
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   └── App.tsx
├── tests/
│   ├── e2e/
│   │   ├── specs/
│   │   │   ├── auth.spec.ts
│   │   │   ├── dashboard.spec.ts
│   │   │   └── forms.spec.ts
│   │   ├── pages/
│   │   │   ├── base.page.ts
│   │   │   ├── login.page.ts
│   │   │   └── dashboard.page.ts
│   │   ├── components/
│   │   │   ├── modal.component.ts
│   │   │   └── form.component.ts
│   │   └── fixtures/
│   │       └── index.ts
│   └── unit/           # Vitest/Jest unit tests
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

  // Common UI elements
  readonly loadingSpinner: Locator;
  readonly errorBoundary: Locator;
  readonly toastContainer: Locator;

  constructor(page: Page) {
    this.page = page;
    this.loadingSpinner = page.getByTestId('loading-spinner');
    this.errorBoundary = page.getByTestId('error-boundary');
    this.toastContainer = page.getByRole('region', { name: /notifications/i });
  }

  abstract readonly path: string;

  async goto(): Promise<void> {
    await this.page.goto(this.path);
    await this.waitForReactRender();
  }

  async waitForReactRender(): Promise<void> {
    // Wait for React to finish rendering
    await this.page.waitForFunction(() => {
      const root = document.getElementById('root');
      return root && root.children.length > 0;
    });
    await this.loadingSpinner.waitFor({ state: 'hidden', timeout: 10000 });
  }

  async expectNoErrors(): Promise<void> {
    await expect(this.errorBoundary).not.toBeVisible();
  }

  async expectToast(message: string): Promise<void> {
    await expect(this.toastContainer.getByText(message)).toBeVisible();
  }

  async dismissToast(): Promise<void> {
    await this.toastContainer.getByRole('button', { name: /close|dismiss/i }).click();
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
  readonly errorMessage: Locator;
  readonly rememberMeCheckbox: Locator;
  readonly forgotPasswordLink: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: /sign in|log in/i });
    this.errorMessage = page.getByRole('alert');
    this.rememberMeCheckbox = page.getByLabel(/remember me/i);
    this.forgotPasswordLink = page.getByRole('link', { name: /forgot password/i });
  }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async expectError(message: string): Promise<void> {
    await expect(this.errorMessage).toContainText(message);
  }

  async expectSuccess(): Promise<void> {
    await expect(this.page).toHaveURL(/\/dashboard|\/home/);
  }
}
```

### Dashboard Page

```typescript
// tests/e2e/pages/dashboard.page.ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';
import { NavbarComponent } from '../components/navbar.component';
import { SidebarComponent } from '../components/sidebar.component';

export class DashboardPage extends BasePage {
  readonly path = '/dashboard';

  readonly navbar: NavbarComponent;
  readonly sidebar: SidebarComponent;

  readonly welcomeCard: Locator;
  readonly statsGrid: Locator;
  readonly recentActivity: Locator;
  readonly quickActions: Locator;

  constructor(page: Page) {
    super(page);
    this.navbar = new NavbarComponent(page);
    this.sidebar = new SidebarComponent(page);
    this.welcomeCard = page.getByTestId('welcome-card');
    this.statsGrid = page.getByTestId('stats-grid');
    this.recentActivity = page.getByTestId('recent-activity');
    this.quickActions = page.getByRole('group', { name: /quick actions/i });
  }

  async expectWelcomeMessage(name: string): Promise<void> {
    await expect(this.welcomeCard).toContainText(name);
  }

  async getStatValue(statName: string): Promise<string> {
    const stat = this.statsGrid.getByTestId(`stat-${statName}`);
    return await stat.getByTestId('stat-value').textContent() || '';
  }

  async clickQuickAction(actionName: string): Promise<void> {
    await this.quickActions.getByRole('button', { name: actionName }).click();
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
  readonly searchInput: Locator;
  readonly userMenu: Locator;
  readonly logoutButton: Locator;
  readonly themeToggle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.getByRole('navigation', { name: /main/i });
    this.logo = this.container.getByRole('link', { name: /home|logo/i });
    this.searchInput = this.container.getByRole('searchbox');
    this.userMenu = this.container.getByRole('button', { name: /user menu/i });
    this.logoutButton = page.getByRole('menuitem', { name: /log out|sign out/i });
    this.themeToggle = this.container.getByRole('button', { name: /theme/i });
  }

  async openUserMenu(): Promise<void> {
    await this.userMenu.click();
  }

  async logout(): Promise<void> {
    await this.openUserMenu();
    await this.logoutButton.click();
  }

  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.searchInput.press('Enter');
  }

  async toggleTheme(): Promise<void> {
    await this.themeToggle.click();
  }
}
```

```typescript
// tests/e2e/components/modal.component.ts
import { Page, Locator, expect } from '@playwright/test';

export class ModalComponent {
  readonly page: Page;
  readonly container: Locator;
  readonly title: Locator;
  readonly closeButton: Locator;
  readonly confirmButton: Locator;
  readonly cancelButton: Locator;
  readonly overlay: Locator;

  constructor(page: Page, testId?: string) {
    this.page = page;
    this.container = testId
      ? page.getByTestId(testId)
      : page.getByRole('dialog');
    this.title = this.container.getByRole('heading');
    this.closeButton = this.container.getByRole('button', { name: /close/i });
    this.confirmButton = this.container.getByRole('button', { name: /confirm|save|submit/i });
    this.cancelButton = this.container.getByRole('button', { name: /cancel/i });
    this.overlay = page.locator('[data-testid="modal-overlay"]');
  }

  async expectVisible(): Promise<void> {
    await expect(this.container).toBeVisible();
  }

  async expectHidden(): Promise<void> {
    await expect(this.container).not.toBeVisible();
  }

  async close(): Promise<void> {
    await this.closeButton.click();
    await this.expectHidden();
  }

  async confirm(): Promise<void> {
    await this.confirmButton.click();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
    await this.expectHidden();
  }

  async clickOutside(): Promise<void> {
    await this.overlay.click({ position: { x: 10, y: 10 } });
  }
}
```

## Test Examples

### Basic Tests

```typescript
// tests/e2e/specs/auth.spec.ts
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
    await loginPage.passwordInput.fill('password123');
    await loginPage.submitButton.click();
    await expect(loginPage.page.getByText(/valid email/i)).toBeVisible();
  });
});
```

### Form Testing

```typescript
// tests/e2e/specs/forms.spec.ts
import { test, expect } from '../fixtures';

test.describe('Contact Form', () => {
  test('submits form successfully', async ({ page }) => {
    await page.goto('/contact');

    await page.getByLabel('Name').fill('John Doe');
    await page.getByLabel('Email').fill('john@example.com');
    await page.getByLabel('Message').fill('Hello, this is a test message.');
    await page.getByRole('button', { name: 'Send Message' }).click();

    await expect(page.getByText('Message sent successfully')).toBeVisible();
  });

  test('validates required fields', async ({ page }) => {
    await page.goto('/contact');
    await page.getByRole('button', { name: 'Send Message' }).click();

    await expect(page.getByText('Name is required')).toBeVisible();
    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Message is required')).toBeVisible();
  });

  test('handles submission error gracefully', async ({ page }) => {
    // Mock API to return error
    await page.route('**/api/contact', route =>
      route.fulfill({ status: 500, json: { error: 'Server error' } })
    );

    await page.goto('/contact');
    await page.getByLabel('Name').fill('John Doe');
    await page.getByLabel('Email').fill('john@example.com');
    await page.getByLabel('Message').fill('Test message');
    await page.getByRole('button', { name: 'Send Message' }).click();

    await expect(page.getByRole('alert')).toContainText('Failed to send');
  });
});
```

### State Management Testing

```typescript
// tests/e2e/specs/cart.spec.ts
import { test, expect } from '../fixtures';

test.describe('Shopping Cart', () => {
  test('adds item to cart', async ({ page }) => {
    await page.goto('/products');

    // Find and click add to cart button
    const productCard = page.getByTestId('product-card').first();
    await productCard.getByRole('button', { name: 'Add to Cart' }).click();

    // Verify cart updated
    const cartBadge = page.getByTestId('cart-badge');
    await expect(cartBadge).toHaveText('1');
  });

  test('persists cart across page navigation', async ({ page }) => {
    await page.goto('/products');

    // Add item
    await page.getByTestId('product-card').first()
      .getByRole('button', { name: 'Add to Cart' }).click();

    // Navigate away and back
    await page.goto('/about');
    await page.goto('/products');

    // Verify cart still has item
    await expect(page.getByTestId('cart-badge')).toHaveText('1');
  });

  test('updates quantity in cart', async ({ page }) => {
    await page.goto('/cart');

    // Assumes cart has items from previous test or fixture
    const quantityInput = page.getByRole('spinbutton', { name: /quantity/i }).first();
    await quantityInput.fill('3');
    await quantityInput.blur();

    // Verify total updated
    await expect(page.getByTestId('cart-total')).not.toHaveText('$0.00');
  });
});
```

### Modal and Dialog Testing

```typescript
// tests/e2e/specs/modals.spec.ts
import { test, expect } from '../fixtures';
import { ModalComponent } from '../components/modal.component';

test.describe('Delete Confirmation Modal', () => {
  test('shows confirmation before deleting', async ({ page }) => {
    await page.goto('/items');

    await page.getByRole('button', { name: 'Delete' }).first().click();

    const modal = new ModalComponent(page);
    await modal.expectVisible();
    await expect(modal.title).toHaveText('Confirm Delete');
  });

  test('deletes item when confirmed', async ({ page }) => {
    await page.goto('/items');
    const itemCount = await page.getByTestId('item-row').count();

    await page.getByRole('button', { name: 'Delete' }).first().click();

    const modal = new ModalComponent(page);
    await modal.confirm();

    await expect(page.getByTestId('item-row')).toHaveCount(itemCount - 1);
  });

  test('cancels deletion when dismissed', async ({ page }) => {
    await page.goto('/items');
    const itemCount = await page.getByTestId('item-row').count();

    await page.getByRole('button', { name: 'Delete' }).first().click();

    const modal = new ModalComponent(page);
    await modal.cancel();

    await expect(page.getByTestId('item-row')).toHaveCount(itemCount);
  });

  test('closes when clicking outside', async ({ page }) => {
    await page.goto('/items');

    await page.getByRole('button', { name: 'Delete' }).first().click();

    const modal = new ModalComponent(page);
    await modal.clickOutside();
    await modal.expectHidden();
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
};

type WorkerFixtures = {
  authenticatedContext: BrowserContext;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },

  authenticatedContext: [async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Login
    await page.goto('/login');
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL('/dashboard');

    await page.close();
    await use(context);
    await context.close();
  }, { scope: 'worker' }]
});

export { expect };
```

## API Mocking

```typescript
// tests/e2e/specs/api-mocking.spec.ts
import { test, expect } from '../fixtures';

test.describe('API Mocking', () => {
  test('displays mocked user data', async ({ page }) => {
    await page.route('**/api/users/me', route => {
      route.fulfill({
        status: 200,
        json: {
          id: 1,
          name: 'Test User',
          email: 'test@example.com',
          role: 'admin'
        }
      });
    });

    await page.goto('/profile');
    await expect(page.getByText('Test User')).toBeVisible();
    await expect(page.getByText('admin')).toBeVisible();
  });

  test('handles loading states', async ({ page }) => {
    await page.route('**/api/products', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.fulfill({
        json: [{ id: 1, name: 'Product' }]
      });
    });

    await page.goto('/products');
    await expect(page.getByTestId('loading-skeleton')).toBeVisible();
    await expect(page.getByText('Product')).toBeVisible({ timeout: 5000 });
  });

  test('handles network errors', async ({ page }) => {
    await page.route('**/api/products', route => {
      route.abort('failed');
    });

    await page.goto('/products');
    await expect(page.getByText(/failed to load|network error/i)).toBeVisible();
  });
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

      - name: Build app
        run: npm run build

      - name: Start server and run tests
        run: |
          npm run preview &
          npx wait-on http://localhost:4173
          npx playwright test --project=chromium

      - name: Upload report
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

## What NOT to Do

- Do NOT test React internals — test user-facing behavior
- Do NOT wait for arbitrary timeouts — use proper waits
- Do NOT rely on class names for selectors — use roles and test IDs
- Do NOT test component props — that is for unit tests
- Do NOT ignore error boundaries — verify error states
- Do NOT share state between tests — isolate completely
- Do NOT test CSS styles directly — use visual regression
- Do NOT hard-code test data — use fixtures
