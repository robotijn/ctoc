'use strict';

/**
 * Regression: syncToPluginJson wrote to the WRONG path.
 *
 * `syncToMarketplace` correctly targets `<root>/.claude-plugin/marketplace.json`,
 * but `syncToPluginJson` targeted `<root>/ctoc-plugin/.claude-plugin/plugin.json`
 * — an extra `ctoc-plugin/` segment. `getPluginRoot()` already returns the dir
 * that CONTAINS the VERSION file (which IS the plugin root, whether the dev repo
 * or an installed plugin), and there is no `ctoc-plugin/` subdirectory beneath it.
 * So `existsSync(pluginFile)` was always false → syncToPluginJson always returned
 * `{success:false, error:'plugin.json not found'}`, and `syncAll().plugin` never
 * actually synced the version. The pre-existing test only asserted the result had
 * a boolean `success` (true OR false), so it never caught the broken sync.
 *
 * This test pins the OBSERVABLE behaviour: given a plugin.json present at the
 * canonical `<root>/.claude-plugin/plugin.json` (and NOT under `ctoc-plugin/`),
 * syncToPluginJson must SUCCEED and write the current version to that exact path.
 * It was written RED against the `ctoc-plugin/` path and goes GREEN once the path
 * is corrected. safe-fs is faked at the boundary so no real repo file is touched.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const safeFs = require('../src/lib/safe-fs');
const version = require('../src/lib/version');

test('syncToPluginJson targets <root>/.claude-plugin/plugin.json, never a ctoc-plugin/ subdir', (t) => {
  const writes = [];
  const existsChecks = [];

  // A path under `ctoc-plugin/` does NOT exist; everything else (VERSION, the
  // canonical .claude-plugin/plugin.json) does. This makes the buggy path RED
  // (plugin file "not found") and the corrected path GREEN.
  t.mock.method(safeFs, 'existsSync', (p) => {
    existsChecks.push(String(p));
    return !String(p).includes('ctoc-plugin');
  });
  t.mock.method(safeFs, 'readFileSync', (p) => {
    if (String(p).endsWith('VERSION')) return '9.9.9\n';
    if (String(p).endsWith('plugin.json')) return JSON.stringify({ name: 'ctoc', version: '0.0.0' });
    return '';
  });
  t.mock.method(safeFs, 'writeFileSync', (p, data) => { writes.push({ p: String(p), data: String(data) }); });

  const result = version.syncToPluginJson();

  // The sync must SUCCEED (the buggy ctoc-plugin/ path made this always false).
  assert.equal(result.success, true, 'syncToPluginJson must find plugin.json at the canonical path');
  assert.equal(result.version, '9.9.9');

  // Exactly one write, to a path that ends in .claude-plugin/plugin.json and does
  // NOT contain the erroneous ctoc-plugin/ segment.
  assert.equal(writes.length, 1, 'writes plugin.json exactly once');
  const target = writes[0].p;
  assert.ok(
    target.endsWith(path.join('.claude-plugin', 'plugin.json')),
    `plugin.json write target must end in .claude-plugin/plugin.json, got ${target}`,
  );
  assert.ok(!target.includes('ctoc-plugin'), `write target must not contain a ctoc-plugin/ segment, got ${target}`);

  // The written JSON carries the new version.
  assert.match(writes[0].data, /"version": "9\.9\.9"/, 'the written plugin.json has the synced version');
});
