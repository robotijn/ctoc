#!/usr/bin/env node
/**
 * CTOC Release Script
 * Updates version numbers across all version files
 *
 * VERSION file is the single source of truth.
 * This script syncs it to:
 *   - .claude-plugin/marketplace.json (marketplace version)
 *   - .claude-plugin/plugin.json (plugin version)
 *   - Documentation files with version references
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const VERSION_FILE = path.join(ROOT, 'VERSION');

// JSON files that need version updates
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

// Files with CTOC product version references to update
// Note: Schema versions (e.g., operations-registry.yaml) are separate
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

function getVersion() {
  const version = fs.readFileSync(VERSION_FILE, 'utf8').trim();
  return version;
}

function updateJsonVersionFiles(version) {
  const updated = [];

  for (const config of JSON_VERSION_FILES) {
    const filePath = path.join(ROOT, config.file);

    if (!fs.existsSync(filePath)) {
      console.log(`  Skip: ${config.file} (not found)`);
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(content);
    let changed = false;

    for (const update of config.updates) {
      let obj = json;
      const pathCopy = [...update.path];
      const lastKey = pathCopy.pop();

      for (const key of pathCopy) {
        obj = obj[key];
      }

      if (obj[lastKey] !== version) {
        obj[lastKey] = version;
        changed = true;
      }
    }

    if (changed) {
      fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n');
      updated.push(config.file);
      console.log(`  Updated: ${config.file}`);
    }
  }

  return updated;
}

function updateVersionInFiles(version) {
  const updated = [];

  for (const update of VERSION_UPDATES) {
    const filePath = path.join(ROOT, update.file);

    if (!fs.existsSync(filePath)) {
      console.log(`  Skip: ${update.file} (not found)`);
      continue;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;

    content = content.replace(update.pattern, update.replacement(version));

    if (content !== original) {
      fs.writeFileSync(filePath, content);
      updated.push(update.file);
      console.log(`  Updated: ${update.file}`);
    }
  }

  return updated;
}

function main() {
  const version = getVersion();
  console.log(`CTOC Release v${version}`);
  console.log('─'.repeat(40));

  console.log('\nSyncing version to JSON files...');
  const jsonUpdated = updateJsonVersionFiles(version);

  console.log('\nUpdating version references in docs...');
  const docsUpdated = updateVersionInFiles(version);

  const totalUpdated = jsonUpdated.length + docsUpdated.length;
  if (totalUpdated === 0) {
    console.log('  All files already at v' + version);
  }

  console.log('\nDone.');
}

main();
