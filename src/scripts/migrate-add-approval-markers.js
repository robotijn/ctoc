#!/usr/bin/env node
/**
 * Migration: Add approval markers to ALL existing plans in gate destinations
 * Run once after implementing human gates
 */

const fs = require('fs');
const path = require('path');

const PLANS_DIR = path.join(process.cwd(), 'plans');

// All gate destinations with their source stages
const GATE_DESTINATIONS = {
  'implementation': 'functional',
  'todo': 'implementation',
  'done': 'review'
};

function addMarker(filePath, fromStage, toStage) {
  let content = fs.readFileSync(filePath, 'utf8');

  if (content.includes('approved_by: human')) {
    console.log(`  SKIP: ${path.basename(filePath)} (already has marker)`);
    return false;
  }

  const marker = `---\napproved_by: human\napproved_at: ${new Date().toISOString()}\ngate_crossed: ${fromStage} → ${toStage}\nnote: Retroactively added during human gates migration\n---\n\n`;

  content = marker + content;
  fs.writeFileSync(filePath, content);
  console.log(`  ADDED: ${path.basename(filePath)}`);
  return true;
}

function migrateFolder(folderName, fromStage) {
  const folderPath = path.join(PLANS_DIR, folderName);

  if (!fs.existsSync(folderPath)) {
    console.log(`  ${folderName}/: folder not found, skipping`);
    return 0;
  }

  const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.md'));

  if (files.length === 0) {
    console.log(`  ${folderName}/: no plans found`);
    return 0;
  }

  console.log(`\n  ${folderName}/ (${files.length} plans):`);

  let migrated = 0;
  for (const file of files) {
    if (addMarker(path.join(folderPath, file), fromStage, folderName)) {
      migrated++;
    }
  }
  return migrated;
}

function main() {
  console.log('Migration: Adding approval markers to ALL gate destinations\n');

  let totalMigrated = 0;

  for (const [toStage, fromStage] of Object.entries(GATE_DESTINATIONS)) {
    totalMigrated += migrateFolder(toStage, fromStage);
  }

  console.log(`\nMigration complete: ${totalMigrated} plans updated.`);
}

main();
