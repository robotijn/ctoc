'use strict';

/**
 * Fence: the settings format has exactly ONE encoding.
 *
 * WHY THIS FENCE EXISTS. Two files once claimed to describe the shape of
 * `.ctoc/settings.yaml`: `.ctoc/settings.yaml.template` and
 * `.ctoc/templates/settings.yaml.template`. Neither had a reader — the real
 * shape is produced by `generateSettings()` in `src/lib/init-project.js` and
 * written directly by `initProject`. A dead second encoding of a format is not
 * harmless documentation: it is a loaded gun with the safety on. Nobody reads it,
 * so nothing catches it drifting; the day a code path copies a template instead
 * of calling the generator, it reproduces the exact failure this program removes
 * (a settings file with no `active_profiles:` anchor can never record a
 * compliance answer). One truth, one place.
 *
 * The deletion is a one-time act. Case 2 is the RATCHET that makes it stay
 * deleted: no `settings.yaml*.template` may reappear anywhere in the repository.
 *
 * Cross-platform: path.join, os.tmpdir(), fs.rmSync(recursive, force) teardown.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { initProject } = require('../src/lib/init-project');
const { writeActiveProfiles } = require('../src/lib/compliance-regime');
const { loadActiveProfiles } = require('../src/lib/regulatory-regime');

const REPO_ROOT = path.join(__dirname, '..');

const DEAD_TEMPLATES = [
  path.join(REPO_ROOT, '.ctoc', 'settings.yaml.template'),
  path.join(REPO_ROOT, '.ctoc', 'templates', 'settings.yaml.template'),
];

// A fresh temp project driven through the REAL generator path (initProject →
// generateSettings → write). Reading the produced settings.yaml gives the exact
// text the generator emits; there is no other encoding to read.
function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-settings-fmt-'));
  initProject(root);
  const settingsText = fs.readFileSync(
    path.join(root, '.ctoc', 'settings.yaml'),
    'utf8',
  );
  return { root, settingsText };
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

// Case 1 — neither dead template exists on disk.
test('neither settings template file exists', () => {
  for (const p of DEAD_TEMPLATES) {
    assert.strictEqual(
      fs.existsSync(p),
      false,
      `a dead settings template still exists: ${path.relative(REPO_ROOT, p)}`,
    );
  }
});

// Case 2 — the RATCHET. No second encoding may reappear ANYWHERE in the repo
// (excluding node_modules/ and plans/ — the latter carries historical plan text
// that legitimately names the deleted files).
test('no settings.yaml*.template may reappear anywhere in the repository', () => {
  const SKIP_DIRS = new Set(['node_modules', 'plans', '.git']);
  const isSecondEncoding = (name) => /^settings\.yaml.*\.template$/.test(name);

  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.isFile() && isSecondEncoding(entry.name)) {
        found.push(path.relative(REPO_ROOT, path.join(dir, entry.name)));
      }
    }
  };
  walk(REPO_ROOT);

  assert.deepStrictEqual(
    found,
    [],
    `a second encoding of the settings format reappeared: ${found.join(', ')}`,
  );
});

// Case 3 — the generator is the only encoding, and it carries the three blocks a
// reader depends on.
test('the generator emits enforcement, regulatory_regime and active_profiles', () => {
  const { root, settingsText } = makeProject();
  try {
    assert.match(settingsText, /^enforcement:/m, 'missing enforcement block');
    assert.match(settingsText, /^regulatory_regime:/m, 'missing regulatory_regime block');
    assert.match(settingsText, /active_profiles:/, 'missing active_profiles anchor');
  } finally {
    cleanup(root);
  }
});

// Case 4 — the anchor the writer targets is an INLINE value, not a bare
// block-style key. writeActiveProfiles refuses a block-style anchor
// (compliance-regime.js:185-187), so a block-style anchor would be dead on
// arrival.
test('the active_profiles anchor is an inline value the writer accepts', () => {
  const { root, settingsText } = makeProject();
  try {
    assert.match(
      settingsText,
      /^[ \t]*active_profiles:.*\S/m,
      'active_profiles has no inline value; writeActiveProfiles would refuse it',
    );
  } finally {
    cleanup(root);
  }
});

// Case 5 — the load-bearing one. A generated file round-trips through the reader
// of record: write it, activate a profile via the real writer, read it back via
// the real reader. A write is proved by reading it back through the code that
// consumes it, never by trusting the writer's own success flag.
test('a generated settings file round-trips a profile through the real reader', () => {
  const { root } = makeProject();
  try {
    const res = writeActiveProfiles(root, ['gdpr']);
    assert.strictEqual(res.ok, true, `writeActiveProfiles failed: ${JSON.stringify(res)}`);

    const { profiles } = loadActiveProfiles(root);
    assert.ok(
      profiles.includes('gdpr'),
      `loadActiveProfiles did not read back the written profile: ${JSON.stringify(profiles)}`,
    );
  } finally {
    cleanup(root);
  }
});
