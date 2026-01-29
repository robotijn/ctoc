#!/usr/bin/env node
/**
 * CTOC Kanban - Fast single-call display
 * Usage: node scripts/kanban.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const count = (dir) => {
  try {
    const p = path.join(ROOT, dir);
    return fs.existsSync(p) ? fs.readdirSync(p).filter(f => f.endsWith('.md')).length : 0;
  } catch { return 0; }
};

const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();

// Count kanban columns
const k = {
  backlog: count('plans/functional/draft'),
  func: count('plans/functional/approved'),
  tech: count('plans/implementation/draft'),
  ready: count('plans/implementation/approved'),
  build: count('plans/in_progress'),
  review: count('plans/review'),
  done: count('plans/done')
};

// Get recent feat/fix commits for done count
let commits = [];
try {
  commits = execSync('git log --oneline -10 --format="%h|%s"', { cwd: ROOT, encoding: 'utf8' })
    .trim().split('\n').filter(Boolean)
    .map(l => { const [h, ...m] = l.split('|'); return { h, m: m.join('|') }; })
    .filter(c => c.m.startsWith('feat:') || c.m.startsWith('fix:'));
  if (commits.length > k.done) k.done = commits.length;
} catch {}

// Output
console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  CTOC KANBAN                                                    v${version.padEnd(10)}║
╠══════════════════════════════════════════════════════════════════════════════╣
║ BACKLOG │FUNCTIONAL│TECHNICAL │  READY  │BUILDING │ REVIEW  │     DONE       ║
║ (draft) │(steps1-3)│(steps4-6)│         │ (7-14)  │ [HUMAN] │                ║
╠═════════╪══════════╪══════════╪═════════╪═════════╪═════════╪════════════════╣
║   (${String(k.backlog).padStart(1)})   │   (${String(k.func).padStart(1)})    │   (${String(k.tech).padStart(1)})    │   (${String(k.ready).padStart(1)})   │   (${String(k.build).padStart(1)})   │   (${String(k.review).padStart(1)})   │     (${String(k.done).padStart(1)})        ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  ${commits.slice(0,3).map(c => '✓ ' + c.m.replace(/^(feat|fix): /,'').slice(0,18)).join('  ').padEnd(76)}║
╠══════════════════════════════════════════════════════════════════════════════╣
║  [1] New feature  [2] Continue  [3] Implement  [4] Review  [5] View all      ║
╚══════════════════════════════════════════════════════════════════════════════╝
`.trim());
