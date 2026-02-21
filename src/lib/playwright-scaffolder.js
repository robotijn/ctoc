/**
 * Playwright Scaffolder
 * Sets up Playwright E2E testing infrastructure for web applications
 *
 * Features:
 * - Framework-aware configuration
 * - Page Object Model scaffolding
 * - CI/CD workflow generation
 * - TypeScript support
 */

const fs = require('fs');
const path = require('path');
const { FrameworkDetector } = require('./framework-detector');

/**
 * Template loader for Playwright files
 * @param {string} templateName - Template file name
 * @returns {string} Template content
 */
function loadTemplate(templateName) {
  const templateDir = path.join(__dirname, '..', '..', '.ctoc', 'templates', 'testing');
  const templatePath = path.join(templateDir, templateName);

  if (fs.existsSync(templatePath)) {
    return fs.readFileSync(templatePath, 'utf8');
  }

  // Fallback to inline templates if file not found
  return getInlineTemplate(templateName);
}

/**
 * Get inline template content (fallback)
 * @param {string} templateName - Template name
 * @returns {string} Template content
 */
function getInlineTemplate(templateName) {
  const templates = {
    'playwright.config.ts.template': getBasePlaywrightConfig(),
    'example.spec.ts.template': getExampleSpec(),
    'BasePage.ts.template': getBasePage(),
    'playwright.yml.template': getGitHubWorkflow()
  };

  return templates[templateName] || '';
}

/**
 * Playwright Scaffolder class
 * Sets up Playwright testing infrastructure
 */
class PlaywrightScaffolder {
  /**
   * Create a PlaywrightScaffolder instance
   * @param {string} projectRoot - Project root directory
   * @param {Object} options - Scaffolding options
   */
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.options = {
      typescript: options.typescript !== false,
      pageObjects: options.pageObjects || false,
      ci: options.ci || false,
      ...options
    };
    this.detector = new FrameworkDetector(projectRoot);
    this.framework = this.detector.detect();
  }

  /**
   * Initialize Playwright in the project
   * @returns {Object} Result with created files and commands
   */
  async init() {
    const createdFiles = [];
    const commands = [];

    // Ensure test directory exists
    const testDir = this.detector.getTestDirectory();
    const testDirPath = path.join(this.projectRoot, testDir);
    if (!fs.existsSync(testDirPath)) {
      fs.mkdirSync(testDirPath, { recursive: true });
    }

    // Create playwright.config.ts
    const configContent = this.generateConfig();
    const configPath = path.join(this.projectRoot, 'playwright.config.ts');
    fs.writeFileSync(configPath, configContent);
    createdFiles.push('playwright.config.ts');

    // Create example test
    const exampleContent = this.generateExampleTest();
    const examplePath = path.join(testDirPath, 'example.spec.ts');
    fs.writeFileSync(examplePath, exampleContent);
    createdFiles.push(`${testDir}/example.spec.ts`);

    // Create Page Object Model structure if requested
    if (this.options.pageObjects) {
      const pomFiles = this.generatePageObjects(testDir);
      createdFiles.push(...pomFiles);
    }

    // Create CI workflow if requested
    if (this.options.ci) {
      const ciFile = this.generateCIWorkflow();
      if (ciFile) {
        createdFiles.push(ciFile);
      }
    }

    // Generate install command
    const installCmd = this.getInstallCommand();
    commands.push(installCmd);
    commands.push('npx playwright install');

    return {
      success: true,
      framework: this.framework ? this.framework.name : 'Unknown',
      testDir,
      files: createdFiles,
      commands,
      message: this.generateSummary(createdFiles, commands)
    };
  }

  /**
   * Generate Playwright configuration
   * @returns {string} Config file content
   */
  generateConfig() {
    const config = this.detector.getPlaywrightConfig();
    const testDir = this.detector.getTestDirectory();

    let webServerConfig = '';
    if (config.webServer && this.framework) {
      webServerConfig = `
  webServer: {
    command: '${config.webServer.command}',
    url: '${config.baseURL}',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },`;
    }

    return `import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for ${this.framework ? this.framework.name : 'web application'}
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './${testDir}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
    ...(process.env.CI ? [['github']] : []),
  ],

  use: {
    baseURL: '${config.baseURL}',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
${webServerConfig}
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    /* Mobile viewports */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 13'] },
    },
  ],
});
`;
  }

  /**
   * Generate example test file
   * @returns {string} Test file content
   */
  generateExampleTest() {
    const frameworkName = this.framework ? this.framework.name : 'application';

    return `import { test, expect } from '@playwright/test';

/**
 * Example E2E tests for ${frameworkName}
 * These tests verify critical user journeys
 */

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load successfully', async ({ page }) => {
    // Wait for the page to be fully loaded
    await expect(page).toHaveTitle(/.+/);
  });

  test('should have visible main content', async ({ page }) => {
    // Adjust selector to match your application
    const main = page.locator('main, [role="main"], #root, #app');
    await expect(main.first()).toBeVisible();
  });

  test('should be accessible', async ({ page }) => {
    // Basic accessibility check - ensure no axe-core violations
    // For full accessibility testing, add @axe-core/playwright
    const body = page.locator('body');
    await expect(body).toBeVisible();

    // Check for ARIA landmarks
    const landmarks = page.locator('[role="banner"], [role="navigation"], [role="main"], header, nav, main');
    const count = await landmarks.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('Navigation', () => {
  test('should navigate between pages', async ({ page }) => {
    await page.goto('/');

    // Find and click a navigation link
    // Adjust selector to match your navigation
    const navLinks = page.locator('nav a, header a');
    const linkCount = await navLinks.count();

    if (linkCount > 0) {
      // Click the first navigation link
      const firstLink = navLinks.first();
      const href = await firstLink.getAttribute('href');

      if (href && !href.startsWith('http') && href !== '/') {
        await firstLink.click();
        // Verify navigation occurred
        await expect(page).not.toHaveURL('/');
      }
    }
  });
});

test.describe('Performance', () => {
  test('should load within performance budget', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;

    // Page should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });
});
`;
  }

  /**
   * Generate Page Object Model files
   * @param {string} testDir - Test directory
   * @returns {Array<string>} Created file paths
   */
  generatePageObjects(testDir) {
    const createdFiles = [];
    const pagesDir = path.join(this.projectRoot, testDir, 'pages');

    if (!fs.existsSync(pagesDir)) {
      fs.mkdirSync(pagesDir, { recursive: true });
    }

    // Create BasePage
    const basePageContent = `import { Page, Locator, expect } from '@playwright/test';

/**
 * Base Page Object class
 * All page objects should extend this class
 */
export abstract class BasePage {
  protected readonly page: Page;
  abstract readonly url: string;
  abstract readonly loadedIndicator: Locator;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigate to the page
   */
  async navigate(): Promise<void> {
    await this.page.goto(this.url);
    await this.waitForPageLoad();
  }

  /**
   * Wait for page to be fully loaded
   */
  async waitForPageLoad(): Promise<void> {
    await expect(this.loadedIndicator).toBeVisible({ timeout: 10000 });
  }

  /**
   * Get the current page URL
   */
  async getCurrentUrl(): Promise<string> {
    return this.page.url();
  }

  /**
   * Get page title
   */
  async getTitle(): Promise<string> {
    return await this.page.title();
  }

  /**
   * Take a screenshot
   */
  async screenshot(name: string): Promise<void> {
    await this.page.screenshot({
      path: \`test-results/screenshots/\${name}.png\`,
      fullPage: true
    });
  }

  /**
   * Wait for network to be idle
   */
  async waitForNetworkIdle(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }
}
`;

    const basePagePath = path.join(pagesDir, 'BasePage.ts');
    fs.writeFileSync(basePagePath, basePageContent);
    createdFiles.push(`${testDir}/pages/BasePage.ts`);

    // Create HomePage example
    const homePageContent = `import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Home Page Object
 * Represents the homepage of the application
 */
export class HomePage extends BasePage {
  readonly url = '/';
  readonly loadedIndicator: Locator;

  // Page elements
  readonly heading: Locator;
  readonly navigation: Locator;
  readonly mainContent: Locator;

  constructor(page: Page) {
    super(page);
    // Update these selectors to match your application
    this.loadedIndicator = page.locator('main, [role="main"], #root, #app').first();
    this.heading = page.locator('h1').first();
    this.navigation = page.locator('nav, [role="navigation"]').first();
    this.mainContent = page.locator('main, [role="main"]').first();
  }

  /**
   * Get the main heading text
   */
  async getHeadingText(): Promise<string> {
    return await this.heading.textContent() ?? '';
  }

  /**
   * Check if navigation is visible
   */
  async isNavigationVisible(): Promise<boolean> {
    return await this.navigation.isVisible();
  }

  /**
   * Click a navigation link by text
   */
  async clickNavLink(text: string): Promise<void> {
    await this.navigation.getByRole('link', { name: text }).click();
  }
}
`;

    const homePagePath = path.join(pagesDir, 'HomePage.ts');
    fs.writeFileSync(homePagePath, homePageContent);
    createdFiles.push(`${testDir}/pages/HomePage.ts`);

    // Create index.ts for exports
    const indexContent = `export { BasePage } from './BasePage';
export { HomePage } from './HomePage';
`;

    const indexPath = path.join(pagesDir, 'index.ts');
    fs.writeFileSync(indexPath, indexContent);
    createdFiles.push(`${testDir}/pages/index.ts`);

    return createdFiles;
  }

  /**
   * Generate CI workflow file
   * @returns {string|null} Created file path or null
   */
  generateCIWorkflow() {
    const workflowDir = path.join(this.projectRoot, '.github', 'workflows');
    if (!fs.existsSync(workflowDir)) {
      fs.mkdirSync(workflowDir, { recursive: true });
    }

    const content = `name: Playwright E2E Tests

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright Browsers
        run: npx playwright install --with-deps

      - name: Run Playwright tests
        run: npx playwright test

      - uses: actions/upload-artifact@v4
        if: \${{ !cancelled() }}
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: test-results
          path: test-results/
          retention-days: 7
`;

    const workflowPath = path.join(workflowDir, 'playwright.yml');
    fs.writeFileSync(workflowPath, content);
    return '.github/workflows/playwright.yml';
  }

  /**
   * Get the npm install command
   * @returns {string} Install command
   */
  getInstallCommand() {
    const deps = ['@playwright/test'];

    if (this.options.pageObjects) {
      // TypeScript is already included with Playwright
    }

    return `npm install -D ${deps.join(' ')}`;
  }

  /**
   * Generate summary message
   * @param {Array<string>} files - Created files
   * @param {Array<string>} commands - Commands to run
   * @returns {string} Summary message
   */
  generateSummary(files, commands) {
    const lines = [];
    lines.push('Playwright E2E Testing Setup Complete');
    lines.push('=====================================');
    lines.push('');

    if (this.framework) {
      lines.push(`Framework detected: ${this.framework.name}`);
      lines.push(`Dev server port: ${this.framework.defaultPort}`);
      lines.push('');
    }

    lines.push('Files created:');
    files.forEach(f => lines.push(`  - ${f}`));
    lines.push('');

    lines.push('Next steps:');
    lines.push('');
    lines.push('1. Install dependencies:');
    commands.forEach(cmd => lines.push(`   ${cmd}`));
    lines.push('');

    lines.push('2. Run tests:');
    lines.push('   npx playwright test');
    lines.push('');

    lines.push('3. Run tests with UI:');
    lines.push('   npx playwright test --ui');
    lines.push('');

    lines.push('4. View test report:');
    lines.push('   npx playwright show-report');

    return lines.join('\n');
  }
}

/**
 * Quick setup function for simple usage
 * @param {string} projectRoot - Project root path
 * @param {Object} options - Setup options
 * @returns {Promise<Object>} Setup result
 */
async function setupPlaywright(projectRoot, options = {}) {
  const scaffolder = new PlaywrightScaffolder(projectRoot, options);
  return await scaffolder.init();
}

// Base config template for fallback
function getBasePlaywrightConfig() {
  return `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
`;
}

function getExampleSpec() {
  return `import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/.+/);
});
`;
}

function getBasePage() {
  return `import { Page, Locator, expect } from '@playwright/test';

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
`;
}

function getGitHubWorkflow() {
  return `name: Playwright Tests
on: [push, pull_request]
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
`;
}

module.exports = {
  PlaywrightScaffolder,
  setupPlaywright
};
