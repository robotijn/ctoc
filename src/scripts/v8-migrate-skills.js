#!/usr/bin/env node
/**
 * v8 Skill Migration
 *
 * Adds v8 architecture fields to existing converted SKILL.md files:
 *   - tier: 2
 *   - dispatch_protocol: v1
 *   - confidence_calibration: enabled
 *   - parallel_safe: <inferred>
 *   - effort_budget: { max_tokens, max_tool_calls, max_subagents }
 *
 * Walks skills/* for SKILL.md files that have v7 frontmatter (name, when_to_load,
 * effort_level, model_optimized_for) and adds v8 fields if missing.
 *
 * Run from project root:
 *   node src/scripts/v8-migrate-skills.js [--dry-run]
 */

const safeFs = require('../lib/safe-fs');
const path = require('path');

const root = process.cwd();
const dryRun = process.argv.includes('--dry-run');

// Only migrate these category dirs (the rest are being written by a parallel
// agent and will be migrated in a follow-up pass to avoid race conditions).
const SHIPPED_CATEGORIES = new Set([
  'quality', 'testing', 'documentation', 'security', 'specialized',
]);
const filterShipped = !process.argv.includes('--all-categories');

// effort_level → effort_budget mapping
const BUDGET_BY_LEVEL = {
  low:    { max_tokens: 10000, max_tool_calls: 10, max_subagents: 0 },
  medium: { max_tokens: 25000, max_tool_calls: 20, max_subagents: 0 },
  high:   { max_tokens: 50000, max_tool_calls: 30, max_subagents: 0 },
  xhigh:  { max_tokens: 100000, max_tool_calls: 50, max_subagents: 0 },
};

const PARALLEL_UNSAFE_KEYWORDS = [
  'orchestrator', 'gate', 'dispatch', 'coordinator',
];

function findSkillFiles(dir) {
  const out = [];
  function walk(d, depth = 0, topCategory = null) {
    if (!safeFs.existsSync(d)) return;
    for (const entry of safeFs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        const cat = depth === 0 ? entry.name : topCategory;
        if (depth === 0 && filterShipped && !SHIPPED_CATEGORIES.has(cat)) continue;
        walk(full, depth + 1, cat);
      } else if (entry.name === 'SKILL.md') {
        out.push(full);
      }
    }
  }
  walk(dir);
  return out;
}

function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  return { raw: m[1], end: m[0].length };
}

function readField(fm, name) {
  const re = new RegExp(`^${name}:\\s*(.+)$`, 'm');
  const m = fm.raw.match(re);
  return m ? m[1].trim() : null;
}

function hasField(fm, name) {
  const re = new RegExp(`^${name}:\\s*`, 'm');
  return re.test(fm.raw);
}

function injectV8Fields(fm, skillPath) {
  if (hasField(fm, 'tier') && hasField(fm, 'dispatch_protocol') && hasField(fm, 'effort_budget')) {
    return null; // already migrated
  }

  const effortLevel = readField(fm, 'effort_level') || 'medium';
  const budget = BUDGET_BY_LEVEL[effortLevel] || BUDGET_BY_LEVEL.medium;
  const name = readField(fm, 'name') || path.basename(path.dirname(skillPath));
  const description = readField(fm, 'description') || '';

  // parallel_safe heuristic: orchestrator-named skills aren't parallel-safe
  const lowerDesc = (name + ' ' + description).toLowerCase();
  const parallelSafe = !PARALLEL_UNSAFE_KEYWORDS.some(kw => lowerDesc.includes(kw));

  const v8Block = `
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: ${parallelSafe}
effort_budget:
  max_tokens: ${budget.max_tokens}
  max_tool_calls: ${budget.max_tool_calls}
  max_subagents: ${budget.max_subagents}`;

  return v8Block;
}

function migrate(skillPath) {
  const content = safeFs.readFileSync(skillPath, 'utf8');
  const fm = parseFrontmatter(content);
  if (!fm) {
    return { path: skillPath, status: 'no-frontmatter' };
  }

  const v8Block = injectV8Fields(fm, skillPath);
  if (v8Block === null) {
    return { path: skillPath, status: 'already-v8' };
  }

  // Insert v8 fields before the closing --- of frontmatter
  const newFm = fm.raw + v8Block;
  const newContent = content.replace(/^---\n[\s\S]*?\n---/, `---\n${newFm}\n---`);

  if (!dryRun) {
    safeFs.writeFileSync(skillPath, newContent);
  }
  return { path: skillPath, status: 'migrated' };
}

function main() {
  const skillsDir = path.join(root, 'skills');
  const skillFiles = findSkillFiles(skillsDir);

  const results = skillFiles.map(migrate);
  const migrated = results.filter(r => r.status === 'migrated');
  const skipped = results.filter(r => r.status === 'already-v8');
  const errors = results.filter(r => r.status === 'no-frontmatter');

  console.log(`v8 Skill Migration${dryRun ? ' (DRY RUN)' : ''}`);
  console.log('─'.repeat(60));
  console.log(`Skills scanned:    ${results.length}`);
  console.log(`Migrated:          ${migrated.length}`);
  console.log(`Already v8:        ${skipped.length}`);
  console.log(`No frontmatter:    ${errors.length}`);

  if (migrated.length > 0 && process.argv.includes('--verbose')) {
    console.log('\nMigrated files:');
    for (const r of migrated) {
      console.log(`  ${path.relative(root, r.path)}`);
    }
  }
  if (errors.length > 0) {
    console.log('\nSkipped (no frontmatter):');
    for (const r of errors) {
      console.log(`  ${path.relative(root, r.path)}`);
    }
  }
}

if (require.main === module) main();

module.exports = { migrate, findSkillFiles };
