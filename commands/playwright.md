# Playwright Command

E2E testing setup and management with Playwright.

## Usage

```bash
ctoc playwright init [--pom] [--ci]
ctoc playwright run [--headed] [--ui]
ctoc playwright report
ctoc playwright codegen [url]
ctoc playwright detect
```

## Actions

### init

Initialize Playwright E2E testing in the current project.

```bash
# Basic setup
ctoc playwright init

# With Page Object Model scaffolding
ctoc playwright init --pom

# With GitHub Actions CI workflow
ctoc playwright init --ci

# Full setup with POM and CI
ctoc playwright init --pom --ci
```

**What it creates:**
- `playwright.config.ts` - Framework-aware configuration
- `e2e/example.spec.ts` - Starter E2E test
- `e2e/pages/` - Page Object Model files (with `--pom`)
- `.github/workflows/playwright.yml` - CI workflow (with `--ci`)

### run

Run Playwright tests.

```bash
# Run all tests (headless)
ctoc playwright run

# Run with visible browser
ctoc playwright run --headed

# Run with Playwright UI
ctoc playwright run --ui
```

### report

Open the HTML test report.

```bash
ctoc playwright report
```

### codegen

Generate tests by recording browser interactions.

```bash
# Record from dev server
ctoc playwright codegen

# Record from specific URL
ctoc playwright codegen https://example.com
```

### detect

Detect the web framework and show Playwright configuration.

```bash
ctoc playwright detect
```

## Framework Support

| Framework | Detection | Config |
|-----------|-----------|--------|
| Next.js | `next.config.js` | Port 3000 |
| Vue | `vite.config.ts` + vue | Port 5173 |
| Nuxt | `nuxt.config.ts` | Port 3000 |
| Svelte | `svelte.config.js` | Port 5173 |
| Angular | `angular.json` | Port 4200 |
| Astro | `astro.config.mjs` | Port 4321 |
| React (Vite) | `vite.config.ts` + react | Port 5173 |
| React (CRA) | `react-scripts` | Port 3000 |
| Remix | `remix.config.js` | Port 3000 |
| Gatsby | `gatsby-config.js` | Port 8000 |

## Generated Configuration

The generated `playwright.config.ts` includes:

```typescript
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],

  use: {
    baseURL: 'http://localhost:3000',  // Framework-specific
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  webServer: {
    command: 'npm run dev',  // Framework-specific
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
    { name: 'Mobile Safari', use: { ...devices['iPhone 13'] } },
  ],
});
```

## Page Object Model Structure

With `--pom` flag:

```
e2e/
├── pages/
│   ├── BasePage.ts      # Abstract base class
│   ├── HomePage.ts      # Example page object
│   └── index.ts         # Exports
└── example.spec.ts      # Example test
```

### BasePage

```typescript
export abstract class BasePage {
  protected readonly page: Page;
  abstract readonly url: string;
  abstract readonly loadedIndicator: Locator;

  constructor(page: Page) {
    this.page = page;
  }

  async navigate(): Promise<void> {
    await this.page.goto(this.url);
    await this.waitForPageLoad();
  }

  async waitForPageLoad(): Promise<void> {
    await expect(this.loadedIndicator).toBeVisible({ timeout: 10000 });
  }
}
```

## CI Workflow

With `--ci` flag, creates `.github/workflows/playwright.yml`:

```yaml
name: Playwright E2E Tests

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Next Steps After Init

1. **Install dependencies:**
   ```bash
   npm install -D @playwright/test
   npx playwright install
   ```

2. **Customize selectors:**
   Update test files to use your application's actual selectors.

3. **Add data-testid attributes:**
   For stable selectors, add `data-testid` to key elements.

4. **Run tests:**
   ```bash
   npx playwright test
   ```

5. **Debug failures:**
   ```bash
   npx playwright test --ui
   ```

## Best Practices

1. **Use data-testid selectors** - Most stable across refactors
2. **Test critical user journeys** - Not every edge case
3. **Keep tests independent** - No shared state between tests
4. **Use Page Object Model** - For maintainability
5. **Run in CI** - Catch regressions early

## Related Skills

- [Playwright Best Practices](/skills/testing/playwright/index.md)
- [Framework-Specific Guides](/skills/testing/playwright/)
- [Test Pyramid Strategy](/skills/testing/test-pyramid.md)

## Related Commands

- `ctoc quality check` - Run quality checks including E2E
- `ctoc coverage check` - Check test coverage
