#!/usr/bin/env node
/**
 * v8 add `tier:` field to Tier 0 and Tier 1 agent frontmatter.
 *
 * Tier 2 (specialist skills) already migrated via v8-migrate-skills.js.
 * Tier 3 (scouts) declared tier: 3 inline at creation.
 *
 * This script handles both frontmatter shapes:
 *   - Top-of-file:  ---\n... ---\n
 *   - After title:  # Title\n\n---\n... ---\n
 */

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dryRun = process.argv.includes('--dry-run');

const TIER_0_AGENTS = [
  'agents/coordinator/cto-chief.md',
];

const TIER_1_AGENTS = [
  'agents/coordinator/synthesizer.md',                 // already has tier:1
  'agents/iron-loop/iron-loop-integrator.md',
  'agents/iron-loop/iron-loop-critic.md',
  'agents/iron-loop/iron-loop-executor.md',
  'agents/pipeline/agent-writer.md',
  'agents/pipeline/agent-critic.md',
  'agents/pipeline/agent-tester.md',
  'agents/pipeline/agent-qa.md',
  'agents/pipeline/agent-publisher.md',
  'agents/planning/vision-advisor.md',
  'agents/planning/vision-decomposer.md',
  'agents/planning/product-owner.md',
  'agents/planning/implementation-planner.md',
];

function addTierField(content, tier) {
  // Find the frontmatter block — may be at top or after a # title
  const fmMatch = content.match(/(^|\n)(---\n[\s\S]*?\n---)/);
  if (!fmMatch) return { changed: false, content, reason: 'no frontmatter' };

  const fmBlock = fmMatch[2];
  // Check if tier already declared
  if (/^tier:\s*\d/m.test(fmBlock)) return { changed: false, content, reason: 'tier already present' };

  // Insert `tier: N` just before the closing ---
  const insertion = `\ntier: ${tier}`;
  const newFm = fmBlock.replace(/\n---$/, `${insertion}\n---`);
  const newContent = content.replace(fmBlock, newFm);
  return { changed: true, content: newContent };
}

function processFile(relPath, tier) {
  const abs = path.join(root, relPath);
  if (!fs.existsSync(abs)) return { path: relPath, status: 'missing' };

  const content = fs.readFileSync(abs, 'utf8');
  const result = addTierField(content, tier);
  if (!result.changed) return { path: relPath, status: result.reason };

  if (!dryRun) fs.writeFileSync(abs, result.content);
  return { path: relPath, status: 'tier-added', tier };
}

function main() {
  console.log(`v8 add-tier${dryRun ? ' (DRY RUN)' : ''}`);
  console.log('─'.repeat(60));

  const results = [
    ...TIER_0_AGENTS.map(p => processFile(p, 0)),
    ...TIER_1_AGENTS.map(p => processFile(p, 1)),
  ];

  const added = results.filter(r => r.status === 'tier-added');
  const skipped = results.filter(r => r.status === 'tier already present');
  const missing = results.filter(r => r.status === 'missing');
  const other = results.filter(r => !['tier-added', 'tier already present', 'missing'].includes(r.status));

  console.log(`Total: ${results.length}`);
  console.log(`Added tier: ${added.length}`);
  console.log(`Already had: ${skipped.length}`);
  console.log(`Missing files: ${missing.length}`);
  console.log(`Other: ${other.length}`);

  if (missing.length) {
    console.log('\nMissing files:');
    for (const r of missing) console.log(`  ${r.path}`);
  }
  if (other.length) {
    console.log('\nOther issues:');
    for (const r of other) console.log(`  ${r.path} — ${r.status}`);
  }
}

if (require.main === module) main();

module.exports = { addTierField };
