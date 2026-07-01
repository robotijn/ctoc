/**
 * Playwright Command
 * Manages Playwright E2E testing setup and execution
 *
 * Usage:
 *   ctoc playwright init [--pom] [--ci]
 *   ctoc playwright run [--headed] [--ui]
 *   ctoc playwright report
 *   ctoc playwright codegen [url]
 *   ctoc playwright detect
 */

const path = require('path');
const safeFs = require('./safe-fs');
const { PlaywrightScaffolder } = require('../lib/playwright-scaffolder');
const { FrameworkDetector } = require('../lib/framework-detector');

/**
 * Execute playwright command
 * @param {Object} options - Command options
 * @param {string} options.action - Action to perform (init, run, report, codegen, detect)
 * @param {boolean} options.pom - Enable Page Object Model scaffolding
 * @param {boolean} options.ci - Generate CI workflow
 * @param {boolean} options.headed - Run in headed mode
 * @param {boolean} options.ui - Run with Playwright UI
 * @param {string} options.url - URL for codegen
 * @param {string} options.projectRoot - Project root directory
 * @returns {Promise<Object>} Command result
 */
async function execute(options) {
  const {
    action = 'init',
    pom = false,
    ci = false,
    headed = false,
    ui = false,
    url,
    projectRoot = process.cwd()
  } = options;

  switch (action) {
    case 'init':
      return await initPlaywright(projectRoot, { pageObjects: pom, ci });

    case 'run':
      return await runTests(projectRoot, { headed, ui });

    case 'report':
      return await showReport(projectRoot);

    case 'codegen':
      return await runCodegen(projectRoot, url);

    case 'detect':
      return await detectWebFramework(projectRoot);

    default:
      return {
        success: false,
        error: `Unknown action: ${action}. Valid actions: init, run, report, codegen, detect`
      };
  }
}

/**
 * Initialize Playwright in the project
 * @param {string} projectRoot - Project root path
 * @param {Object} options - Init options
 * @returns {Promise<Object>} Init result
 */
async function initPlaywright(projectRoot, options = {}) {
  try {
    // First detect the framework
    const detector = new FrameworkDetector(projectRoot);
    const framework = detector.detect();

    if (!detector.isWebApp()) {
      return {
        success: false,
        error: 'No web framework detected. Playwright is for web application testing.',
        suggestion: 'Ensure you have a web framework (React, Vue, Next.js, etc.) installed.'
      };
    }

    // Run scaffolding
    const scaffolder = new PlaywrightScaffolder(projectRoot, options);
    const result = await scaffolder.init();

    return {
      success: true,
      framework: framework ? framework.name : 'Generic Web App',
      ...result
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to initialize Playwright: ${error.message}`
    };
  }
}

/**
 * Run Playwright tests
 * @param {string} projectRoot - Project root path
 * @param {Object} options - Run options
 * @returns {Promise<Object>} Run result
 */
async function runTests(projectRoot, options = {}) {
  const { headed, ui } = options;

  const args = [];
  if (ui) {
    args.push('--ui');
  } else if (headed) {
    args.push('--headed');
  }

  const command = `npx playwright test ${args.join(' ')}`.trim();

  return {
    success: true,
    command,
    message: `Run Playwright tests with:\n\n  ${command}\n\nOther useful commands:\n  npx playwright test --project=chromium  # Run only in Chrome\n  npx playwright test example.spec.ts     # Run specific file\n  npx playwright test --grep "homepage"   # Run tests matching pattern`
  };
}

/**
 * Show Playwright test report
 * @param {string} projectRoot - Project root path
 * @returns {Promise<Object>} Report result
 */
async function showReport(projectRoot) {
  const command = 'npx playwright show-report';

  return {
    success: true,
    command,
    message: `Open Playwright report with:\n\n  ${command}\n\nThe report includes:\n  - Test results by browser\n  - Screenshots of failures\n  - Traces for debugging\n  - Video recordings (if enabled)`
  };
}

/**
 * Run Playwright codegen for recording tests
 * @param {string} projectRoot - Project root path
 * @param {string} url - Target URL
 * @returns {Promise<Object>} Codegen result
 */
async function runCodegen(projectRoot, url) {
  // Detect framework to get default URL
  const detector = new FrameworkDetector(projectRoot);
  const config = detector.getPlaywrightConfig();

  const targetUrl = url || config.baseURL || 'http://localhost:3000';
  const command = `npx playwright codegen ${targetUrl}`;

  return {
    success: true,
    command,
    url: targetUrl,
    message: `Generate tests by recording with:\n\n  ${command}\n\nThis will:\n  1. Open a browser window\n  2. Record your interactions\n  3. Generate test code\n\nTip: Start your dev server first:\n  ${config.webServer ? config.webServer.command : 'npm run dev'}`
  };
}

/**
 * Detect web framework in the project
 * @param {string} projectRoot - Project root path
 * @returns {Promise<Object>} Detection result
 */
async function detectWebFramework(projectRoot) {
  const detector = new FrameworkDetector(projectRoot);
  const framework = detector.detect();

  if (!framework) {
    return {
      success: true,
      detected: false,
      message: 'No web framework detected in this project.'
    };
  }

  const config = detector.getPlaywrightConfig();

  const lines = [];
  lines.push('Web Framework Detection');
  lines.push('=======================');
  lines.push('');
  lines.push(`Framework: ${framework.name}`);
  lines.push(`Confidence: ${framework.confidence}%`);
  lines.push('');
  lines.push('Playwright Configuration:');
  lines.push(`  Base URL: ${config.baseURL}`);
  lines.push(`  Dev Command: ${config.webServer ? config.webServer.command : 'N/A'}`);
  lines.push(`  Port: ${config.webServer ? config.webServer.port : 'N/A'}`);
  lines.push('');
  lines.push(`Test Directory: ${detector.getTestDirectory()}`);
  lines.push(`TypeScript: ${detector.usesTypeScript() ? 'Yes' : 'No'}`);

  return {
    success: true,
    detected: true,
    framework: framework.name,
    frameworkId: framework.id,
    confidence: framework.confidence,
    config,
    testDir: detector.getTestDirectory(),
    typescript: detector.usesTypeScript(),
    message: lines.join('\n')
  };
}

/**
 * Check if Playwright is already set up
 * @param {string} projectRoot - Project root path
 * @returns {boolean} True if Playwright is configured
 */
function isPlaywrightConfigured(projectRoot) {
  const configFiles = [
    'playwright.config.ts',
    'playwright.config.js',
    'playwright.config.mjs'
  ];

  for (const configFile of configFiles) {
    if (safeFs.existsSync(path.join(projectRoot, configFile))) {
      return true;
    }
  }

  return false;
}

module.exports = {
  execute,
  initPlaywright,
  runTests,
  showReport,
  runCodegen,
  detectWebFramework,
  isPlaywrightConfigured
};
