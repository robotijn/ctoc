/**
 * Playwright Scaffolder — overwrite-protection tests
 *
 * Regression coverage for a MEDIUM silent-data-loss defect: the scaffolder
 * used to call writeFileSync for every generated artifact with no existsSync
 * guard, clobbering a user's hand-written playwright.config.ts / spec / page
 * objects / CI workflow without warning. These tests pin the contract:
 *   - existing files are PRESERVED and reported in result.skipped
 *   - a fresh project still scaffolds every file into result.files
 *   - options.overwrite === true forces a write
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { setupPlaywright, PlaywrightScaffolder } = require('../src/lib/playwright-scaffolder');

function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-overwrite-'));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ dependencies: { react: '18.0.0' } })
  );
  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

test('existing playwright.config.ts is preserved and reported in skipped', async () => {
  const dir = makeProject();
  try {
    const sentinel = '// USER-AUTHORED CONFIG — DO NOT CLOBBER\nexport default { custom: true };\n';
    const configPath = path.join(dir, 'playwright.config.ts');
    fs.writeFileSync(configPath, sentinel);

    const result = await setupPlaywright(dir, {});

    // The user's content must survive untouched.
    assert.strictEqual(
      fs.readFileSync(configPath, 'utf8'),
      sentinel,
      'existing playwright.config.ts must NOT be overwritten'
    );
    // It must be surfaced as skipped, and NOT claimed as created.
    assert.ok(Array.isArray(result.skipped), 'result.skipped must be an array');
    assert.ok(
      result.skipped.includes('playwright.config.ts'),
      'preserved config must appear in result.skipped'
    );
    assert.ok(
      !result.files.includes('playwright.config.ts'),
      'preserved config must NOT be reported as created'
    );
  } finally {
    cleanup(dir);
  }
});

test('existing page-object and CI files are preserved and skipped', async () => {
  const dir = makeProject();
  try {
    // Seed an existing HomePage.ts and CI workflow.
    const testDir = 'e2e';
    const pagesDir = path.join(dir, testDir, 'pages');
    fs.mkdirSync(pagesDir, { recursive: true });
    const homePagePath = path.join(pagesDir, 'HomePage.ts');
    const homeSentinel = '// USER HOME PAGE OBJECT\nexport class HomePage {}\n';
    fs.writeFileSync(homePagePath, homeSentinel);

    const workflowsDir = path.join(dir, '.github', 'workflows');
    fs.mkdirSync(workflowsDir, { recursive: true });
    const workflowPath = path.join(workflowsDir, 'playwright.yml');
    const workflowSentinel = 'name: USER WORKFLOW\n';
    fs.writeFileSync(workflowPath, workflowSentinel);

    const result = await setupPlaywright(dir, { pageObjects: true, ci: true });

    assert.strictEqual(
      fs.readFileSync(homePagePath, 'utf8'),
      homeSentinel,
      'existing HomePage.ts must be preserved'
    );
    assert.strictEqual(
      fs.readFileSync(workflowPath, 'utf8'),
      workflowSentinel,
      'existing CI workflow must be preserved'
    );
    assert.ok(
      result.skipped.includes(`${testDir}/pages/HomePage.ts`),
      'preserved HomePage.ts must appear in result.skipped'
    );
    assert.ok(
      result.skipped.includes('.github/workflows/playwright.yml'),
      'preserved workflow must appear in result.skipped'
    );
    // Sibling files that did not pre-exist must still be created.
    assert.ok(
      result.files.includes(`${testDir}/pages/BasePage.ts`),
      'non-existing BasePage.ts must still be scaffolded'
    );
  } finally {
    cleanup(dir);
  }
});

test('fresh project still scaffolds every file (nothing skipped)', async () => {
  const dir = makeProject();
  try {
    const result = await setupPlaywright(dir, { pageObjects: true, ci: true });

    assert.ok(result.success, 'setup should succeed');
    assert.deepStrictEqual(result.skipped, [], 'nothing should be skipped on a fresh project');

    for (const rel of [
      'playwright.config.ts',
      'e2e/example.spec.ts',
      'e2e/pages/BasePage.ts',
      'e2e/pages/HomePage.ts',
      'e2e/pages/index.ts',
      '.github/workflows/playwright.yml'
    ]) {
      assert.ok(result.files.includes(rel), `result.files must include ${rel}`);
      assert.ok(fs.existsSync(path.join(dir, rel)), `${rel} must exist on disk`);
    }
  } finally {
    cleanup(dir);
  }
});

test('options.overwrite === true forces a write over an existing file', async () => {
  const dir = makeProject();
  try {
    const configPath = path.join(dir, 'playwright.config.ts');
    fs.writeFileSync(configPath, '// old\n');

    const scaffolder = new PlaywrightScaffolder(dir, { overwrite: true });
    const result = await scaffolder.init();

    assert.ok(
      fs.readFileSync(configPath, 'utf8').includes('defineConfig'),
      'overwrite:true must regenerate the config'
    );
    assert.ok(
      result.files.includes('playwright.config.ts'),
      'overwritten config is reported as created'
    );
    assert.ok(
      !result.skipped.includes('playwright.config.ts'),
      'overwritten config is not skipped'
    );
  } finally {
    cleanup(dir);
  }
});
