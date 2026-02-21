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
    pattern: /^\*\*\d+\.\d+\.\d+\*\*/m,
    replacement: (v) => `**${v}**`
  },
  {
    file: 'README.md',
    pattern: /version-\d+\.\d+\.\d+-blue/g,
    replacement: (v) => `version-${v}-blue`
  },
  {
    file: 'README.md',
    pattern: /getVersion\(\)\s+\/\/\s*→\s*'\d+\.\d+\.\d+'/,
    replacement: (v) => `getVersion()       // → '${v}'`
  }
];

function getVersion() {
  const version = fs.readFileSync(VERSION_FILE, 'utf8').trim();
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Invalid version format in ${VERSION_FILE}: "${version}" (expected X.Y.Z)`);
  }
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
    let json;
    try {
      json = JSON.parse(content);
    } catch (err) {
      console.error(`  ERROR: ${config.file} contains invalid JSON: ${err.message}`);
      continue;
    }
    let changed = false;

    for (const update of config.updates) {
      let obj = json;
      const pathCopy = [...update.path];
      const lastKey = pathCopy.pop();

      for (const key of pathCopy) {
        if (obj == null || typeof obj !== 'object') {
          console.error(`  ERROR: ${config.file} missing expected path: ${update.path.join('.')}`);
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
  try {
    // Read version from VERSION file (source of truth)
    const version = getVersion();
    console.log(`CTOC Release v${version}`);
    console.log('─'.repeat(40));

    console.log('\nSyncing version to JSON files...');
    updateJsonVersionFiles(version);

    console.log('\nUpdating version references in docs...');
    updateVersionInFiles(version);

    console.log('\nDone.');
  } catch (err) {
    console.error(`Release failed: ${err.message}`);
    process.exit(1);
  }
}

main();
