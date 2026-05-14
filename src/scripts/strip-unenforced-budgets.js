#!/usr/bin/env node
/**
 * Strip unenforced budget fields from agent/skill frontmatter (v6.9.3).
 *
 * Drops:
 *   - max_tokens
 *   - max_tool_calls
 *
 * Keeps:
 *   - max_subagents (the real invariant — enforced by tests + dispatcher)
 *
 * Rationale: per-agent token/tool-call budgets were advisory and never
 * enforced at runtime. The real budget enforcement is at the SESSION level
 * (see .ctoc/config/budget.yaml + src/lib/budget.js, v6.9.4+).
 *
 * Run:  node src/scripts/strip-unenforced-budgets.js
 * Run-and-summarize: node src/scripts/strip-unenforced-budgets.js --dry-run
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DRY_RUN = process.argv.includes('--dry-run');

function listFiles(dir, predicate) {
  const out = [];
  function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (predicate(full, entry.name)) out.push(full);
    }
  }
  walk(dir);
  return out;
}

function stripFromFrontmatter(content) {
  // Match a frontmatter block: ---\n...\n---
  // Either at top of file (skill format) OR after a leading H1 (scout format).
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/) ||
                  content.match(/\n---\n([\s\S]*?)\n---/);
  if (!fmMatch) return { changed: false, content };

  const fmBody = fmMatch[1];
  // Remove `max_tokens: <val>` and `max_tool_calls: <val>` lines (any indent)
  const stripped = fmBody
    .split('\n')
    .filter(line => !/^\s*max_tokens:\s/.test(line))
    .filter(line => !/^\s*max_tool_calls:\s/.test(line))
    .join('\n');

  if (stripped === fmBody) return { changed: false, content };

  // Reconstruct exactly: keep the wrapping `---` markers, replace inner body.
  const original = fmMatch[0];
  const isTop = original.startsWith('---');
  const newBlock = isTop ? `---\n${stripped}\n---` : `\n---\n${stripped}\n---`;
  const newContent = content.replace(original, newBlock);
  return { changed: true, content: newContent };
}

function main() {
  const targets = [
    ...listFiles(path.join(ROOT, 'skills'), (_, name) => name === 'SKILL.md'),
    ...listFiles(path.join(ROOT, 'agents', 'scouts'), (_, name) => name.endsWith('.md')),
  ];

  let changedCount = 0;
  let unchangedCount = 0;
  const changedFiles = [];

  for (const file of targets) {
    const content = fs.readFileSync(file, 'utf8');
    const { changed, content: newContent } = stripFromFrontmatter(content);
    if (changed) {
      changedFiles.push(path.relative(ROOT, file));
      if (!DRY_RUN) fs.writeFileSync(file, newContent);
      changedCount++;
    } else {
      unchangedCount++;
    }
  }

  const verb = DRY_RUN ? 'would strip' : 'stripped';
  console.log(`${verb} max_tokens/max_tool_calls from ${changedCount} files (${unchangedCount} unchanged)`);
  if (changedFiles.length > 0 && changedFiles.length <= 10) {
    for (const f of changedFiles) console.log(`  - ${f}`);
  } else if (changedFiles.length > 10) {
    for (const f of changedFiles.slice(0, 5)) console.log(`  - ${f}`);
    console.log(`  ... and ${changedFiles.length - 5} more`);
  }
}

if (require.main === module) main();

module.exports = { stripFromFrontmatter };
