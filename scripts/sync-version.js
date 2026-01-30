#!/usr/bin/env node
/**
 * Syncs VERSION file to marketplace.json
 * Run: node scripts/sync-version.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const versionFile = path.join(root, 'VERSION');
const marketplaceFile = path.join(root, '.claude-plugin', 'marketplace.json');

const version = fs.readFileSync(versionFile, 'utf8').trim();
const marketplace = JSON.parse(fs.readFileSync(marketplaceFile, 'utf8'));

marketplace.metadata.version = version;
marketplace.plugins[0].version = version;

fs.writeFileSync(marketplaceFile, JSON.stringify(marketplace, null, 2) + '\n');

console.log(`Synced version ${version} to marketplace.json`);
