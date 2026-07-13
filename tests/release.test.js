/**
 * Release Script Tests
 * Tests for scripts/release.js
 *
 * These tests verify version reading, bumping, and syncing functionality
 * without modifying actual project files.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  readVersionSources,
  readLicenseSources,
  allVersionsAgree,
} = require('./helpers/source-of-truth');

// =============================================================================
// Test Setup - Shared temp directory
// =============================================================================

let TEST_DIR;
let TEST_VERSION_FILE;
let TEST_MARKETPLACE_FILE;
let TEST_PLUGIN_FILE;
let TEST_DASHBOARD_FILE;
let TEST_README_FILE;

function setupTestDir() {
  TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-release-test-'));
  TEST_VERSION_FILE = path.join(TEST_DIR, 'VERSION');
  TEST_MARKETPLACE_FILE = path.join(TEST_DIR, '.claude-plugin', 'marketplace.json');
  TEST_PLUGIN_FILE = path.join(TEST_DIR, '.claude-plugin', 'plugin.json');
  TEST_DASHBOARD_FILE = path.join(TEST_DIR, 'commands', 'dashboard.md');
  TEST_README_FILE = path.join(TEST_DIR, 'README.md');

  // Create directory structure
  fs.mkdirSync(path.join(TEST_DIR, '.claude-plugin'), { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR, 'commands'), { recursive: true });
}

function cleanupTestDir() {
  if (TEST_DIR && fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// Helper to create VERSION file
function createVersionFile(version) {
  fs.writeFileSync(TEST_VERSION_FILE, version + '\n');
}

// Helper to create marketplace.json
function createMarketplaceFile(version) {
  const content = {
    metadata: {
      name: 'ctoc',
      version: version
    },
    plugins: [
      {
        name: 'ctoc',
        version: version,
        description: 'Test plugin'
      }
    ]
  };
  fs.writeFileSync(TEST_MARKETPLACE_FILE, JSON.stringify(content, null, 2) + '\n');
}

// Helper to create plugin.json
function createPluginFile(version) {
  const content = {
    name: 'ctoc',
    version: version,
    description: 'Test plugin'
  };
  fs.writeFileSync(TEST_PLUGIN_FILE, JSON.stringify(content, null, 2) + '\n');
}

// Helper to create dashboard.md
function createDashboardFile(version) {
  const content = `# Dashboard

CTOC - CTO Chief v${version}

Some content here.
`;
  fs.writeFileSync(TEST_DASHBOARD_FILE, content);
}

// Helper to create README.md
function createReadmeFile(version) {
  const content = `# CTOC

**${version}** — The CTO Chief

Some content here.
`;
  fs.writeFileSync(TEST_README_FILE, content);
}

// =============================================================================
// Pure function implementations for testing
// (Extracted from release.js logic to test in isolation with custom paths)
// =============================================================================

function getVersion(versionFile) {
  const version = fs.readFileSync(versionFile, 'utf8').trim();
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Invalid version format in ${versionFile}: "${version}" (expected X.Y.Z)`);
  }
  return version;
}

function updateJsonVersionFiles(version, root, jsonVersionFiles) {
  const updated = [];

  for (const config of jsonVersionFiles) {
    const filePath = path.join(root, config.file);

    if (!fs.existsSync(filePath)) {
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    let json;
    try {
      json = JSON.parse(content);
    } catch (err) {
      continue;
    }
    let changed = false;

    for (const update of config.updates) {
      let obj = json;
      const pathCopy = [...update.path];
      const lastKey = pathCopy.pop();

      for (const key of pathCopy) {
        if (obj == null || typeof obj !== 'object') {
          obj = null;
          break;
        }
        obj = obj[key];
      }
      if (obj == null) continue;

      if (obj[lastKey] !== version) {
        obj[lastKey] = version;
        changed = true;
      }
    }

    if (changed) {
      fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n');
      updated.push(config.file);
    }
  }

  return updated;
}

function updateVersionInFiles(version, root, versionUpdates) {
  const updated = [];

  for (const update of versionUpdates) {
    const filePath = path.join(root, update.file);

    if (!fs.existsSync(filePath)) {
      continue;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;

    content = content.replace(update.pattern, update.replacement(version));

    if (content !== original) {
      fs.writeFileSync(filePath, content);
      updated.push(update.file);
    }
  }

  return updated;
}

// =============================================================================
// Version Read Tests
// =============================================================================

describe('Version Read', () => {
  beforeEach(() => setupTestDir());
  afterEach(() => cleanupTestDir());

  test('reads version from VERSION file', () => {
    createVersionFile('1.2.3');

    const version = getVersion(TEST_VERSION_FILE);
    assert.strictEqual(version, '1.2.3');
  });

  test('trims whitespace from version', () => {
    fs.writeFileSync(TEST_VERSION_FILE, '  2.0.0  \n\n');

    const version = getVersion(TEST_VERSION_FILE);
    assert.strictEqual(version, '2.0.0');
  });

  test('handles version with newline', () => {
    fs.writeFileSync(TEST_VERSION_FILE, '3.5.10\n');

    const version = getVersion(TEST_VERSION_FILE);
    assert.strictEqual(version, '3.5.10');
  });

  test('reads single digit version', () => {
    createVersionFile('1.0.0');

    const version = getVersion(TEST_VERSION_FILE);
    assert.strictEqual(version, '1.0.0');
  });

  test('reads large version numbers', () => {
    createVersionFile('123.456.789');

    const version = getVersion(TEST_VERSION_FILE);
    assert.strictEqual(version, '123.456.789');
  });

  test('throws when VERSION file does not exist', () => {
    assert.throws(() => {
      getVersion(path.join(TEST_DIR, 'nonexistent', 'VERSION'));
    }, /ENOENT/);
  });
});

// =============================================================================
// Version Bump Tests (testing version string manipulation)
// =============================================================================

describe('Version Bump', () => {
  beforeEach(() => setupTestDir());
  afterEach(() => cleanupTestDir());

  test('version string format is valid semver', () => {
    createVersionFile('1.2.3');

    const version = getVersion(TEST_VERSION_FILE);
    assert.match(version, /^\d+\.\d+\.\d+$/);
  });

  test('can read and write different versions', () => {
    const versions = ['0.0.1', '1.0.0', '2.5.10', '10.20.30'];

    for (const v of versions) {
      createVersionFile(v);
      const read = getVersion(TEST_VERSION_FILE);
      assert.strictEqual(read, v, `Version ${v} should be read correctly`);
    }
  });

  test('version file contains only version string', () => {
    createVersionFile('5.0.0');

    const content = fs.readFileSync(TEST_VERSION_FILE, 'utf8');
    assert.strictEqual(content, '5.0.0\n');
  });
});

// =============================================================================
// Sync Tests - JSON Files
// =============================================================================

describe('Sync JSON Files', () => {
  beforeEach(() => setupTestDir());
  afterEach(() => cleanupTestDir());

  const JSON_VERSION_FILES = [
    {
      file: '.claude-plugin/marketplace.json',
      updates: [
        { path: ['metadata', 'version'] },
        { path: ['plugins', 0, 'version'] }
      ]
    },
    {
      file: '.claude-plugin/plugin.json',
      updates: [
        { path: ['version'] }
      ]
    }
  ];

  test('updates marketplace.json metadata.version', () => {
    createVersionFile('2.0.0');
    createMarketplaceFile('1.0.0');

    updateJsonVersionFiles('2.0.0', TEST_DIR, JSON_VERSION_FILES);

    const content = JSON.parse(fs.readFileSync(TEST_MARKETPLACE_FILE, 'utf8'));
    assert.strictEqual(content.metadata.version, '2.0.0');
  });

  test('updates marketplace.json plugins[0].version', () => {
    createVersionFile('2.0.0');
    createMarketplaceFile('1.0.0');

    updateJsonVersionFiles('2.0.0', TEST_DIR, JSON_VERSION_FILES);

    const content = JSON.parse(fs.readFileSync(TEST_MARKETPLACE_FILE, 'utf8'));
    assert.strictEqual(content.plugins[0].version, '2.0.0');
  });

  test('updates plugin.json version', () => {
    createVersionFile('2.0.0');
    createPluginFile('1.0.0');

    updateJsonVersionFiles('2.0.0', TEST_DIR, JSON_VERSION_FILES);

    const content = JSON.parse(fs.readFileSync(TEST_PLUGIN_FILE, 'utf8'));
    assert.strictEqual(content.version, '2.0.0');
  });

  test('returns list of updated files', () => {
    createMarketplaceFile('1.0.0');
    createPluginFile('1.0.0');

    const updated = updateJsonVersionFiles('2.0.0', TEST_DIR, JSON_VERSION_FILES);

    assert.ok(updated.includes('.claude-plugin/marketplace.json'));
    assert.ok(updated.includes('.claude-plugin/plugin.json'));
  });

  test('does not update files already at correct version', () => {
    createMarketplaceFile('2.0.0');
    createPluginFile('2.0.0');

    const updated = updateJsonVersionFiles('2.0.0', TEST_DIR, JSON_VERSION_FILES);

    assert.strictEqual(updated.length, 0);
  });

  test('skips missing files without error', () => {
    // Only create marketplace, not plugin
    createMarketplaceFile('1.0.0');

    const updated = updateJsonVersionFiles('2.0.0', TEST_DIR, JSON_VERSION_FILES);

    assert.ok(updated.includes('.claude-plugin/marketplace.json'));
    assert.strictEqual(updated.length, 1);
  });

  test('preserves other JSON properties', () => {
    createMarketplaceFile('1.0.0');

    updateJsonVersionFiles('2.0.0', TEST_DIR, JSON_VERSION_FILES);

    const content = JSON.parse(fs.readFileSync(TEST_MARKETPLACE_FILE, 'utf8'));
    assert.strictEqual(content.metadata.name, 'ctoc');
    assert.strictEqual(content.plugins[0].name, 'ctoc');
    assert.strictEqual(content.plugins[0].description, 'Test plugin');
  });
});

// =============================================================================
// Sync Tests - Documentation Files
// =============================================================================

describe('Sync Documentation Files', () => {
  beforeEach(() => setupTestDir());
  afterEach(() => cleanupTestDir());

  const VERSION_UPDATES = [
    {
      file: 'commands/dashboard.md',
      pattern: /CTOC - CTO Chief v[\d.]+/g,
      replacement: (v) => `CTOC - CTO Chief v${v}`
    },
    {
      file: 'README.md',
      pattern: /^\*\*\d+\.\d+\.\d+\*\* — /m,
      replacement: (v) => `**${v}** — `
    }
  ];

  test('updates dashboard.md version', () => {
    createDashboardFile('1.0.0');

    updateVersionInFiles('2.0.0', TEST_DIR, VERSION_UPDATES);

    const content = fs.readFileSync(TEST_DASHBOARD_FILE, 'utf8');
    assert.ok(content.includes('CTOC - CTO Chief v2.0.0'));
    assert.ok(!content.includes('v1.0.0'));
  });

  test('updates README.md version', () => {
    createReadmeFile('1.0.0');

    updateVersionInFiles('2.0.0', TEST_DIR, VERSION_UPDATES);

    const content = fs.readFileSync(TEST_README_FILE, 'utf8');
    assert.ok(content.includes('**2.0.0**'));
    assert.ok(!content.includes('**1.0.0**'));
  });

  test('returns list of updated files', () => {
    createDashboardFile('1.0.0');
    createReadmeFile('1.0.0');

    const updated = updateVersionInFiles('2.0.0', TEST_DIR, VERSION_UPDATES);

    assert.ok(updated.includes('commands/dashboard.md'));
    assert.ok(updated.includes('README.md'));
  });

  test('does not update files already at correct version', () => {
    createDashboardFile('2.0.0');
    createReadmeFile('2.0.0');

    const updated = updateVersionInFiles('2.0.0', TEST_DIR, VERSION_UPDATES);

    assert.strictEqual(updated.length, 0);
  });

  test('skips missing files without error', () => {
    // Only create dashboard, not readme
    createDashboardFile('1.0.0');

    const updated = updateVersionInFiles('2.0.0', TEST_DIR, VERSION_UPDATES);

    assert.ok(updated.includes('commands/dashboard.md'));
    assert.strictEqual(updated.length, 1);
  });

  test('preserves other content in dashboard.md', () => {
    createDashboardFile('1.0.0');

    updateVersionInFiles('2.0.0', TEST_DIR, VERSION_UPDATES);

    const content = fs.readFileSync(TEST_DASHBOARD_FILE, 'utf8');
    assert.ok(content.includes('# Dashboard'));
    assert.ok(content.includes('Some content here.'));
  });

  test('preserves other content in README.md', () => {
    createReadmeFile('1.0.0');

    updateVersionInFiles('2.0.0', TEST_DIR, VERSION_UPDATES);

    const content = fs.readFileSync(TEST_README_FILE, 'utf8');
    assert.ok(content.includes('# CTOC'));
    assert.ok(content.includes('The CTO Chief'));
  });

  test('handles multiple version references in same file', () => {
    const content = `# Dashboard

CTOC - CTO Chief v1.0.0

Welcome to CTOC - CTO Chief v1.0.0 dashboard.
`;
    fs.writeFileSync(TEST_DASHBOARD_FILE, content);

    updateVersionInFiles('2.0.0', TEST_DIR, VERSION_UPDATES);

    const result = fs.readFileSync(TEST_DASHBOARD_FILE, 'utf8');
    assert.ok(!result.includes('v1.0.0'));
    const matches = result.match(/v2\.0\.0/g);
    assert.strictEqual(matches.length, 2);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration', () => {
  beforeEach(() => setupTestDir());
  afterEach(() => cleanupTestDir());

  const JSON_VERSION_FILES = [
    {
      file: '.claude-plugin/marketplace.json',
      updates: [
        { path: ['metadata', 'version'] },
        { path: ['plugins', 0, 'version'] }
      ]
    },
    {
      file: '.claude-plugin/plugin.json',
      updates: [
        { path: ['version'] }
      ]
    }
  ];

  const VERSION_UPDATES = [
    {
      file: 'commands/dashboard.md',
      pattern: /CTOC - CTO Chief v[\d.]+/g,
      replacement: (v) => `CTOC - CTO Chief v${v}`
    },
    {
      file: 'README.md',
      pattern: /^\*\*\d+\.\d+\.\d+\*\* — /m,
      replacement: (v) => `**${v}** — `
    }
  ];

  test('full sync updates all files from VERSION', () => {
    // Create all files at old version
    createVersionFile('3.0.0');
    createMarketplaceFile('2.0.0');
    createPluginFile('2.0.0');
    createDashboardFile('2.0.0');
    createReadmeFile('2.0.0');

    // Read version and sync
    const version = getVersion(TEST_VERSION_FILE);
    const jsonUpdated = updateJsonVersionFiles(version, TEST_DIR, JSON_VERSION_FILES);
    const docsUpdated = updateVersionInFiles(version, TEST_DIR, VERSION_UPDATES);

    // Verify all were updated
    assert.strictEqual(jsonUpdated.length, 2);
    assert.strictEqual(docsUpdated.length, 2);

    // Verify content
    const marketplace = JSON.parse(fs.readFileSync(TEST_MARKETPLACE_FILE, 'utf8'));
    const plugin = JSON.parse(fs.readFileSync(TEST_PLUGIN_FILE, 'utf8'));
    const dashboard = fs.readFileSync(TEST_DASHBOARD_FILE, 'utf8');
    const readme = fs.readFileSync(TEST_README_FILE, 'utf8');

    assert.strictEqual(marketplace.metadata.version, '3.0.0');
    assert.strictEqual(marketplace.plugins[0].version, '3.0.0');
    assert.strictEqual(plugin.version, '3.0.0');
    assert.ok(dashboard.includes('v3.0.0'));
    assert.ok(readme.includes('**3.0.0**'));
  });

  test('sync is idempotent', () => {
    createVersionFile('1.0.0');
    createMarketplaceFile('1.0.0');
    createPluginFile('1.0.0');
    createDashboardFile('1.0.0');
    createReadmeFile('1.0.0');

    const version = getVersion(TEST_VERSION_FILE);

    // First sync - should report no changes
    const jsonUpdated1 = updateJsonVersionFiles(version, TEST_DIR, JSON_VERSION_FILES);
    const docsUpdated1 = updateVersionInFiles(version, TEST_DIR, VERSION_UPDATES);

    assert.strictEqual(jsonUpdated1.length, 0);
    assert.strictEqual(docsUpdated1.length, 0);

    // Second sync - should also report no changes
    const jsonUpdated2 = updateJsonVersionFiles(version, TEST_DIR, JSON_VERSION_FILES);
    const docsUpdated2 = updateVersionInFiles(version, TEST_DIR, VERSION_UPDATES);

    assert.strictEqual(jsonUpdated2.length, 0);
    assert.strictEqual(docsUpdated2.length, 0);
  });

  test('handles partial file set', () => {
    // Only create VERSION and marketplace
    createVersionFile('4.0.0');
    createMarketplaceFile('3.0.0');

    const version = getVersion(TEST_VERSION_FILE);
    const jsonUpdated = updateJsonVersionFiles(version, TEST_DIR, JSON_VERSION_FILES);
    const docsUpdated = updateVersionInFiles(version, TEST_DIR, VERSION_UPDATES);

    // Only marketplace should be updated
    assert.strictEqual(jsonUpdated.length, 1);
    assert.ok(jsonUpdated.includes('.claude-plugin/marketplace.json'));
    assert.strictEqual(docsUpdated.length, 0);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  beforeEach(() => setupTestDir());
  afterEach(() => cleanupTestDir());

  const JSON_VERSION_FILES = [
    {
      file: '.claude-plugin/plugin.json',
      updates: [
        { path: ['version'] }
      ]
    }
  ];

  test('handles version with leading zeros', () => {
    // Note: This tests string handling, not semver validity
    createVersionFile('01.02.03');
    createPluginFile('1.0.0');

    const version = getVersion(TEST_VERSION_FILE);
    updateJsonVersionFiles(version, TEST_DIR, JSON_VERSION_FILES);

    const content = JSON.parse(fs.readFileSync(TEST_PLUGIN_FILE, 'utf8'));
    assert.strictEqual(content.version, '01.02.03');
  });

  test('handles empty VERSION file', () => {
    fs.writeFileSync(TEST_VERSION_FILE, '');

    assert.throws(() => {
      getVersion(TEST_VERSION_FILE);
    }, /Invalid version format/);
  });

  test('handles VERSION file with only whitespace', () => {
    fs.writeFileSync(TEST_VERSION_FILE, '   \n\t  \n');

    assert.throws(() => {
      getVersion(TEST_VERSION_FILE);
    }, /Invalid version format/);
  });

  test('handles malformed JSON gracefully', () => {
    createVersionFile('2.0.0');
    fs.writeFileSync(TEST_PLUGIN_FILE, 'not valid json');

    // Should not throw -- gracefully skips malformed files
    const updated = updateJsonVersionFiles('2.0.0', TEST_DIR, JSON_VERSION_FILES);
    assert.ok(Array.isArray(updated));
  });

  test('handles deeply nested JSON path', () => {
    const complexConfig = [{
      file: '.claude-plugin/plugin.json',
      updates: [
        { path: ['deep', 'nested', 'version'] }
      ]
    }];

    const content = {
      deep: {
        nested: {
          version: '1.0.0',
          other: 'preserved'
        }
      }
    };
    fs.writeFileSync(TEST_PLUGIN_FILE, JSON.stringify(content, null, 2));

    updateJsonVersionFiles('2.0.0', TEST_DIR, complexConfig);

    const result = JSON.parse(fs.readFileSync(TEST_PLUGIN_FILE, 'utf8'));
    assert.strictEqual(result.deep.nested.version, '2.0.0');
    assert.strictEqual(result.deep.nested.other, 'preserved');
  });

  test('pattern matching is case sensitive', () => {
    const content = `# Dashboard

ctoc - cto chief v1.0.0
CTOC - CTO Chief v1.0.0
`;
    fs.writeFileSync(TEST_DASHBOARD_FILE, content);

    const updates = [{
      file: 'commands/dashboard.md',
      pattern: /CTOC - CTO Chief v[\d.]+/g,
      replacement: (v) => `CTOC - CTO Chief v${v}`
    }];

    updateVersionInFiles('2.0.0', TEST_DIR, updates);

    const result = fs.readFileSync(TEST_DASHBOARD_FILE, 'utf8');
    // Lowercase should remain unchanged
    assert.ok(result.includes('ctoc - cto chief v1.0.0'));
    // Uppercase should be updated
    assert.ok(result.includes('CTOC - CTO Chief v2.0.0'));
  });
});

// =============================================================================
// Real-artifact single source of truth (W06-s5 — findings B1–B6)
//
// The suites above test the release SCRIPT's sync logic against synthetic temp
// fixtures — legitimate, but blind to a drift in the REAL shipped artifact. The
// two assertions below read the ACTUAL on-disk VERSION / package.json /
// plugin.json / marketplace.json / LICENSE via tests/helpers/source-of-truth.js,
// so a real version or license drift fails the test. Paired production fix: W09
// (corrected package.json + made release.js sync it). These are GREEN today only
// because W09 has landed; the non-vacuity tests below prove they go RED on drift.
// =============================================================================

describe('release artifact is the single source of truth', () => {
  test('VERSION, package.json, plugin.json, marketplace.json versions all agree', () => {
    const sources = readVersionSources();
    const verdict = allVersionsAgree(sources);
    assert.ok(
      verdict.ok,
      'version sources disagree (or a source is missing):\n' +
        Object.entries(verdict.values)
          .map(([file, value]) => `  ${file}: ${value === null ? '<missing>' : value}`)
          .join('\n'),
    );
  });

  test('package.json license equals the actual LICENSE file', () => {
    const lic = readLicenseSources();
    assert.ok(lic.declared !== null, 'package.json declares no license');
    assert.ok(lic.actual !== null, 'LICENSE file has no readable first line');
    assert.strictEqual(
      lic.declared,
      lic.actual,
      `declared license (package.json: "${lic.declaredRaw}") does not match the ` +
        `actual LICENSE file ("${lic.actualRaw}")`,
    );
  });

  // Non-vacuity: point the reader at a drift fixture and prove the same
  // assertions go RED. Without this, a passing assertion on a correct tree could
  // be a false green that never actually witnesses drift.
  describe('goes red on drift (non-vacuity)', () => {
    let fixtureRoot;

    function writeFixture({ pkgVersion, pkgLicense }) {
      const realRoot = path.resolve(__dirname, '..');
      fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'source-of-truth-drift-'));
      fs.mkdirSync(path.join(fixtureRoot, '.claude-plugin'), { recursive: true });

      const pkg = JSON.parse(fs.readFileSync(path.join(realRoot, 'package.json'), 'utf8'));
      const plugin = JSON.parse(
        fs.readFileSync(path.join(realRoot, '.claude-plugin', 'plugin.json'), 'utf8'),
      );
      const marketplace = JSON.parse(
        fs.readFileSync(path.join(realRoot, '.claude-plugin', 'marketplace.json'), 'utf8'),
      );
      const versionText = fs.readFileSync(path.join(realRoot, 'VERSION'), 'utf8');
      const licenseText = fs.readFileSync(path.join(realRoot, 'LICENSE'), 'utf8');

      if (pkgVersion !== undefined) pkg.version = pkgVersion;
      if (pkgLicense !== undefined) pkg.license = pkgLicense;

      fs.writeFileSync(path.join(fixtureRoot, 'VERSION'), versionText);
      fs.writeFileSync(path.join(fixtureRoot, 'LICENSE'), licenseText);
      fs.writeFileSync(path.join(fixtureRoot, 'package.json'), JSON.stringify(pkg, null, 2));
      fs.writeFileSync(
        path.join(fixtureRoot, '.claude-plugin', 'plugin.json'),
        JSON.stringify(plugin, null, 2),
      );
      fs.writeFileSync(
        path.join(fixtureRoot, '.claude-plugin', 'marketplace.json'),
        JSON.stringify(marketplace, null, 2),
      );
      return fixtureRoot;
    }

    afterEach(() => {
      if (fixtureRoot && fs.existsSync(fixtureRoot)) {
        fs.rmSync(fixtureRoot, { recursive: true, force: true });
      }
      fixtureRoot = undefined;
    });

    test('a drifted package.json version fails the version agreement', () => {
      const root = writeFixture({ pkgVersion: '6.9.49' });
      const verdict = allVersionsAgree(readVersionSources(root));
      assert.strictEqual(verdict.ok, false, 'a drifted version must fail agreement');
      assert.strictEqual(verdict.values.packageJson, '6.9.49');
    });

    test('a missing source (null field) fails the version agreement', () => {
      const root = writeFixture({});
      fs.rmSync(path.join(root, 'package.json'));
      const verdict = allVersionsAgree(readVersionSources(root));
      assert.strictEqual(verdict.ok, false, 'a missing source must fail loudly');
      assert.strictEqual(verdict.values.packageJson, null);
    });

    test('a reverted license (Apache-2.0) fails the license match', () => {
      const root = writeFixture({ pkgLicense: 'Apache-2.0' });
      const lic = readLicenseSources(root);
      assert.notStrictEqual(
        lic.declared,
        lic.actual,
        'Apache-2.0 must not match the PolyForm LICENSE file',
      );
    });
  });
});
