# Playwright for Astro
> Claude Code Astro E2E testing reference. Updated February 2026.

## Installation

```bash
# Add Playwright to Astro project
npm install -D @playwright/test
npx playwright install

# Or create new Astro project with testing
npm create astro@latest
cd my-astro-app
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
    baseURL: 'http://localhost:4321',
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
    url: 'http://localhost:4321',
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
      ? 'npm run build && npm run preview'
      : 'npm run dev',
    url: process.env.CI
      ? 'http://localhost:4321'
      : 'http://localhost:4321',
    reuseExistingServer: !process.env.CI
  }
});
```

### SSR Mode Configuration

```typescript
// For Astro with SSR adapter
export default defineConfig({
  webServer: {
    command: 'npm run build && node ./dist/server/entry.mjs',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    env: {
      HOST: '0.0.0.0',
      PORT: '4321'
    }
  }
});
```

## Folder Structure

```
astro-app/
├── src/
│   ├── components/
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   └── Card.astro
│   ├── layouts/
│   │   └── Layout.astro
│   ├── pages/
│   │   ├── index.astro
│   │   ├── about.astro
│   │   └── blog/
│   │       ├── index.astro
│   │       └── [slug].astro
│   └── islands/            # Client-side components
│       ├── Counter.tsx
│       └── Search.vue
├── tests/
│   └── e2e/
│       ├── specs/
│       │   ├── navigation.spec.ts
│       │   ├── blog.spec.ts
│       │   └── islands.spec.ts
│       ├── pages/
│       │   ├── base.page.ts
│       │   ├── home.page.ts
│       │   └── blog.page.ts
│       ├── components/
│       │   └── header.component.ts
│       └── fixtures/
│           └── index.ts
├── playwright.config.ts
└── astro.config.mjs
```

## Page Objects

### Base Page

```typescript
// tests/e2e/pages/base.page.ts
import { Page, Locator, expect } from '@playwright/test';

export abstract class BasePage {
  readonly page: Page;

  // Common Astro elements
  readonly skipLink: Locator;
  readonly mainContent: Locator;
  readonly viewTransition: Locator;

  constructor(page: Page) {
    this.page = page;
    this.skipLink = page.getByRole('link', { name: /skip to content/i });
    this.mainContent = page.locator('main');
    this.viewTransition = page.locator('[data-astro-transition]');
  }

  abstract readonly path: string;

  async goto(): Promise<void> {
    await this.page.goto(this.path);
    await this.waitForAstroReady();
  }

  async waitForAstroReady(): Promise<void> {
    // Wait for Astro to finish hydration
    await this.page.waitForFunction(() => {
      return document.readyState === 'complete';
    });

    // Wait for any islands to hydrate
    await this.page.waitForFunction(() => {
      const islands = document.querySelectorAll('astro-island');
      return Array.from(islands).every(island =>
        !island.hasAttribute('ssr') || island.children.length > 0
      );
    }, { timeout: 10000 });
  }

  async waitForViewTransition(): Promise<void> {
    // Wait for Astro View Transitions to complete
    await this.page.waitForFunction(() => {
      return !document.startViewTransition ||
             !document.querySelector('[data-astro-transition-fallback]');
    });
  }

  async expectInViewport(locator: Locator): Promise<void> {
    await expect(locator).toBeInViewport();
  }
}
```

### Home Page

```typescript
// tests/e2e/pages/home.page.ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';
import { HeaderComponent } from '../components/header.component';

export class HomePage extends BasePage {
  readonly path = '/';

  readonly header: HeaderComponent;
  readonly heroSection: Locator;
  readonly heroTitle: Locator;
  readonly ctaButton: Locator;
  readonly featuresGrid: Locator;
  readonly blogPreview: Locator;

  constructor(page: Page) {
    super(page);
    this.header = new HeaderComponent(page);
    this.heroSection = page.getByTestId('hero-section');
    this.heroTitle = page.getByRole('heading', { level: 1 });
    this.ctaButton = page.getByRole('link', { name: /get started/i });
    this.featuresGrid = page.getByTestId('features-grid');
    this.blogPreview = page.getByTestId('blog-preview');
  }

  async expectHeroVisible(): Promise<void> {
    await expect(this.heroSection).toBeVisible();
    await expect(this.heroTitle).toBeVisible();
  }

  async clickCta(): Promise<void> {
    await this.ctaButton.click();
    await this.waitForViewTransition();
  }

  async getFeatureCount(): Promise<number> {
    return await this.featuresGrid.getByTestId('feature-card').count();
  }
}
```

### Blog Page

```typescript
// tests/e2e/pages/blog.page.ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class BlogPage extends BasePage {
  readonly path = '/blog';

  readonly pageTitle: Locator;
  readonly postList: Locator;
  readonly postCards: Locator;
  readonly searchInput: Locator;
  readonly categoryFilter: Locator;
  readonly pagination: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.getByRole('heading', { level: 1 });
    this.postList = page.getByTestId('post-list');
    this.postCards = page.getByTestId('post-card');
    this.searchInput = page.getByRole('searchbox');
    this.categoryFilter = page.getByRole('combobox', { name: /category/i });
    this.pagination = page.getByRole('navigation', { name: /pagination/i });
  }

  async getPostCount(): Promise<number> {
    return await this.postCards.count();
  }

  async clickPost(title: string): Promise<void> {
    await this.postCards.filter({ hasText: title }).click();
    await this.waitForViewTransition();
  }

  async searchPosts(query: string): Promise<void> {
    await this.searchInput.fill(query);
    // Wait for island to react
    await this.page.waitForTimeout(300);
  }

  async filterByCategory(category: string): Promise<void> {
    await this.categoryFilter.selectOption(category);
  }

  async goToPage(pageNumber: number): Promise<void> {
    await this.pagination.getByRole('link', { name: String(pageNumber) }).click();
    await this.waitForViewTransition();
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
  readonly navLinks: Locator;
  readonly mobileMenuButton: Locator;
  readonly mobileMenu: Locator;
  readonly themeToggle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.getByRole('banner');
    this.logo = this.container.getByRole('link', { name: /home|logo/i });
    this.navLinks = this.container.getByRole('navigation').getByRole('link');
    this.mobileMenuButton = this.container.getByRole('button', { name: /menu/i });
    this.mobileMenu = page.getByTestId('mobile-menu');
    this.themeToggle = this.container.getByRole('button', { name: /theme/i });
  }

  async navigateTo(linkName: string): Promise<void> {
    await this.navLinks.filter({ hasText: linkName }).click();
  }

  async openMobileMenu(): Promise<void> {
    await this.mobileMenuButton.click();
  }

  async toggleTheme(): Promise<void> {
    await this.themeToggle.click();
  }

  async isMobileMenuOpen(): Promise<boolean> {
    return await this.mobileMenu.isVisible();
  }
}
```

## Test Examples

### Static Content Testing

```typescript
// tests/e2e/specs/navigation.spec.ts
import { test, expect } from '../fixtures';

test.describe('Static Site Navigation', () => {
  test('home page loads correctly', async ({ homePage }) => {
    await homePage.goto();
    await homePage.expectHeroVisible();
    await expect(homePage.page).toHaveTitle(/Astro/);
  });

  test('navigates between pages', async ({ homePage }) => {
    await homePage.goto();

    await homePage.header.navigateTo('About');
    await expect(homePage.page).toHaveURL('/about');

    await homePage.header.navigateTo('Blog');
    await expect(homePage.page).toHaveURL('/blog');
  });

  test('view transitions animate smoothly', async ({ page }) => {
    await page.goto('/');

    // Enable view transition monitoring
    const transitionPromise = page.evaluate(() => {
      return new Promise<boolean>(resolve => {
        document.addEventListener('astro:before-swap', () => {
          resolve(true);
        }, { once: true });

        // Fallback if no transition
        setTimeout(() => resolve(false), 5000);
      });
    });

    await page.getByRole('link', { name: 'About' }).click();

    // Check if view transition was used
    const usedTransition = await transitionPromise;
    expect(usedTransition).toBe(true);
  });

  test('static content is present in HTML', async ({ page }) => {
    const response = await page.goto('/about');
    const html = await response?.text();

    // Verify SSG content
    expect(html).toContain('<h1');
    expect(html).toContain('About');
  });
});
```

### Island Hydration Testing

```typescript
// tests/e2e/specs/islands.spec.ts
import { test, expect } from '../fixtures';

test.describe('Astro Islands', () => {
  test('counter island hydrates and works', async ({ page }) => {
    await page.goto('/interactive');

    // Island should be visible
    const counter = page.getByTestId('counter-island');
    await expect(counter).toBeVisible();

    // Initial value
    await expect(counter.getByTestId('count')).toHaveText('0');

    // Click increment
    await counter.getByRole('button', { name: 'Increment' }).click();

    // Value should update (proves hydration worked)
    await expect(counter.getByTestId('count')).toHaveText('1');
  });

  test('islands with client:visible hydrate on scroll', async ({ page }) => {
    await page.goto('/lazy-islands');

    const lazyIsland = page.getByTestId('lazy-chart');

    // Island should not be hydrated yet (below fold)
    await expect(lazyIsland.locator('[data-hydrated]')).not.toBeVisible();

    // Scroll to island
    await lazyIsland.scrollIntoViewIfNeeded();

    // Wait for hydration
    await expect(lazyIsland.locator('[data-hydrated]')).toBeVisible({ timeout: 5000 });
  });

  test('islands with client:idle hydrate after load', async ({ page }) => {
    await page.goto('/');

    const idleIsland = page.getByTestId('newsletter-form');

    // Should hydrate after page is idle
    await expect(idleIsland.getByRole('button')).toBeEnabled({ timeout: 5000 });

    // Form should work
    await idleIsland.getByLabel('Email').fill('test@example.com');
    await idleIsland.getByRole('button', { name: 'Subscribe' }).click();

    await expect(page.getByText('Thanks for subscribing')).toBeVisible();
  });

  test('React island works correctly', async ({ page }) => {
    await page.goto('/react-demo');

    const reactComponent = page.getByTestId('react-component');

    // React state should work
    await reactComponent.getByRole('button', { name: 'Toggle' }).click();
    await expect(reactComponent.getByTestId('panel')).toBeVisible();
  });

  test('Vue island works correctly', async ({ page }) => {
    await page.goto('/vue-demo');

    const vueComponent = page.getByTestId('vue-component');

    // Vue reactivity should work
    await vueComponent.getByLabel('Name').fill('Test User');
    await expect(vueComponent.getByTestId('greeting')).toContainText('Test User');
  });

  test('Svelte island works correctly', async ({ page }) => {
    await page.goto('/svelte-demo');

    const svelteComponent = page.getByTestId('svelte-component');

    // Svelte store should work
    await svelteComponent.getByRole('button', { name: 'Add Item' }).click();
    await expect(svelteComponent.getByRole('listitem')).toHaveCount(1);
  });
});
```

### Blog and Content Collections

```typescript
// tests/e2e/specs/blog.spec.ts
import { test, expect } from '../fixtures';

test.describe('Blog', () => {
  test('displays blog post list', async ({ blogPage }) => {
    await blogPage.goto();

    const postCount = await blogPage.getPostCount();
    expect(postCount).toBeGreaterThan(0);
  });

  test('blog post page shows content', async ({ blogPage, page }) => {
    await blogPage.goto();
    await blogPage.clickPost('Getting Started');

    // Should navigate to post
    await expect(page).toHaveURL(/\/blog\/.+/);

    // Post content should be visible
    await expect(page.getByRole('article')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('search filters posts', async ({ blogPage }) => {
    await blogPage.goto();

    const initialCount = await blogPage.getPostCount();

    await blogPage.searchPosts('astro');

    // Should filter results
    const filteredCount = await blogPage.getPostCount();
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
  });

  test('category filter works', async ({ blogPage }) => {
    await blogPage.goto();

    await blogPage.filterByCategory('tutorials');

    // All visible posts should be tutorials
    const posts = await blogPage.postCards.all();
    for (const post of posts) {
      await expect(post).toContainText('tutorials');
    }
  });

  test('pagination navigates correctly', async ({ blogPage }) => {
    await blogPage.goto();

    await blogPage.goToPage(2);

    await expect(blogPage.page).toHaveURL(/\?page=2/);
  });
});
```

### SSR Mode Testing

```typescript
// tests/e2e/specs/ssr.spec.ts
import { test, expect } from '../fixtures';

test.describe('SSR Features', () => {
  test('dynamic routes work', async ({ page }) => {
    await page.goto('/products/123');

    await expect(page.getByRole('heading')).toContainText('Product 123');
  });

  test('API routes respond', async ({ page }) => {
    const response = await page.request.get('/api/products');

    expect(response.ok()).toBe(true);
    const json = await response.json();
    expect(Array.isArray(json)).toBe(true);
  });

  test('server-side data fetching works', async ({ page }) => {
    // Mock external API
    await page.route('https://api.example.com/data', route => {
      route.fulfill({
        json: { message: 'Mocked data' }
      });
    });

    await page.goto('/server-data');

    await expect(page.getByText('Mocked data')).toBeVisible();
  });

  test('redirects work correctly', async ({ page }) => {
    await page.goto('/old-page');

    await expect(page).toHaveURL('/new-page');
  });
});
```

### SEO and Meta Testing

```typescript
// tests/e2e/specs/seo.spec.ts
import { test, expect } from '../fixtures';

test.describe('SEO', () => {
  test('has correct meta tags', async ({ page }) => {
    await page.goto('/');

    // Title
    await expect(page).toHaveTitle(/My Astro Site/);

    // Meta description
    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute('content', /.+/);

    // Open Graph
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute('content', /.+/);
  });

  test('canonical URL is set', async ({ page }) => {
    await page.goto('/about');

    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', /\/about$/);
  });

  test('sitemap is accessible', async ({ page }) => {
    const response = await page.request.get('/sitemap.xml');

    expect(response.ok()).toBe(true);
    const text = await response.text();
    expect(text).toContain('<urlset');
  });

  test('robots.txt is configured', async ({ page }) => {
    const response = await page.request.get('/robots.txt');

    expect(response.ok()).toBe(true);
    const text = await response.text();
    expect(text).toContain('User-agent');
  });
});
```

## Fixtures

```typescript
// tests/e2e/fixtures/index.ts
import { test as base, expect } from '@playwright/test';
import { HomePage } from '../pages/home.page';
import { BlogPage } from '../pages/blog.page';

type TestFixtures = {
  homePage: HomePage;
  blogPage: BlogPage;
};

export const test = base.extend<TestFixtures>({
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },

  blogPage: async ({ page }, use) => {
    await use(new BlogPage(page));
  }
});

export { expect };
```

## API Mocking

```typescript
// tests/e2e/specs/api-mocking.spec.ts
import { test, expect } from '../fixtures';

test('mocks API data for islands', async ({ page }) => {
  await page.route('**/api/products', route => {
    route.fulfill({
      json: [
        { id: 1, name: 'Mocked Product', price: 99.99 }
      ]
    });
  });

  await page.goto('/products');

  await expect(page.getByText('Mocked Product')).toBeVisible();
});

test('mocks external API', async ({ page }) => {
  await page.route('https://api.github.com/repos/**', route => {
    route.fulfill({
      json: { stargazers_count: 999 }
    });
  });

  await page.goto('/');

  await expect(page.getByText('999 stars')).toBeVisible();
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

      - name: Build Astro site
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

- Do NOT test Astro build internals — test rendered output
- Do NOT skip island hydration waiting — causes flaky tests
- Do NOT ignore View Transitions — wait for completion
- Do NOT test static files directly — use page interactions
- Do NOT mock content collections — test actual content
- Do NOT forget multi-framework islands — test each framework
- Do NOT ignore SSG/SSR differences — test both modes
- Do NOT skip SEO testing — verify meta tags
