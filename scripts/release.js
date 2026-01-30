#!/usr/bin/env node
/**
 * CTOC Release Script
 * Updates version numbers across documentation files
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const VERSION_FILE = path.join(ROOT, 'VERSION');

// Files with CTOC product version references to update
// Note: Schema versions (e.g., operations-registry.yaml) are separate
const VERSION_UPDATES = [
  {
    file: 'ctoc-plugin/commands/dashboard.md',
    pattern: /CTOC - CTO Chief v[\d.]+/g,
    replacement: (v) => `CTOC - CTO Chief v${v}`
  }
];

function getVersion() {
  const version = fs.readFileSync(VERSION_FILE, 'utf8').trim();
  return version;
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

  console.log('\nUpdating version references...');
  const updated = updateVersionInFiles(version);

  if (updated.length === 0) {
    console.log('  No files needed updating');
  }

  console.log('\nDone.');
}

main();
