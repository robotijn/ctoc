#!/usr/bin/env node
/**
 * Syncs VERSION file to all version references
 * Run: node scripts/sync-version.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const versionFile = path.join(root, 'VERSION');

// Files to sync
const filesToSync = [
  {
    path: path.join(root, '.claude-plugin', 'marketplace.json'),
    update: (data, version) => {
      data.metadata.version = version;
      data.plugins[0].version = version;
      return data;
    }
  },
  {
    path: path.join(root, 'ctoc-plugin', '.claude-plugin', 'plugin.json'),
    update: (data, version) => {
      data.version = version;
      return data;
    }
  }
];

const version = fs.readFileSync(versionFile, 'utf8').trim();

let synced = 0;
for (const file of filesToSync) {
  if (fs.existsSync(file.path)) {
    const data = JSON.parse(fs.readFileSync(file.path, 'utf8'));
    const updated = file.update(data, version);
    fs.writeFileSync(file.path, JSON.stringify(updated, null, 2) + '\n');
    synced++;
    console.log(`  ✓ ${path.relative(root, file.path)}`);
  }
}

console.log(`\nSynced version ${version} to ${synced} files`);
