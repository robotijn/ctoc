'use strict';

/**
 * CLAUDE.md gets small and keeps every rule.
 *
 * Every agent dispatched in this repository loads CLAUDE.md before its own
 * definition, so its size is paid on every dispatch. The long design histories
 * moved, word for word, into four files under docs/. This test holds both halves:
 *
 *   - no binding rule was lost: every sentence in the frozen inventory (extracted
 *     from the 92,952-byte CLAUDE.md before the move) is present, whitespace aside,
 *     in the file the inventory names as its home; a rule whose words were
 *     tightened records old and new side by side, and the old words survive in
 *     docs/OPERATING_LESSONS.md;
 *   - the file stays small: CLAUDE.md is at or under 15,000 bytes, so it cannot
 *     grow back one design history per plan.
 *
 * Whitespace normalisation only: re-wrapping a line is allowed, changing a word
 * is not.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INVENTORY = path.join(__dirname, 'fixtures', 'claude-md-rule-inventory.json');
const MAX_BYTES = 15000;
// The 143 rules the 2026-10-06 extraction produced, plus the irreversible-actions rule
// restated in CLAUDE.md's Privacy section. A shrunken fixture fails here.
const FLOOR = 144;
const HOMES = [
  'CLAUDE.md',
  'docs/ENFORCEMENT.md',
  'docs/FENCES.md',
  'docs/PROJECT_REFERENCE.md',
  'docs/OPERATING_LESSONS.md',
  '.ctoc/templates/operating-lessons.md',
  '.ctoc/templates/operating-manual.md',
];

const norm = (s) => s.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();

const cache = new Map();
function readHome(rel) {
  if (!cache.has(rel)) {
    const abs = path.join(ROOT, ...rel.split('/'));
    let text;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch (err) {
      throw new Error(`home file ${rel} is unreadable: ${err.message}`);
    }
    cache.set(rel, norm(text));
  }
  return cache.get(rel);
}

const inventory = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'));

function lessonsSpan(text) {
  const t = text.replace(/\r\n/g, '\n');
  const start = t.indexOf('<!-- CTOC:LESSONS v1 START -->');
  const endMarker = '<!-- CTOC:LESSONS v1 END -->';
  const end = t.indexOf(endMarker);
  return start === -1 || end === -1 || end < start ? null : t.slice(start, end + endMarker.length);
}

test('the rule inventory is not empty and has not shrunk', () => {
  assert.ok(Array.isArray(inventory.rules), 'inventory.rules must be an array');
  assert.ok(
    inventory.rules.length >= FLOOR,
    `inventory holds ${inventory.rules.length} rules, below the frozen floor of ${FLOOR}`
  );
});

test('every rule is present, word for word, in its home', () => {
  const misses = [];
  for (const rule of inventory.rules) {
    assert.ok(HOMES.includes(rule.home), `${rule.id}: home ${rule.home} is not an allowed home`);
    const want = norm(rule.new !== undefined ? rule.new : rule.old);
    if (!readHome(rule.home).includes(want)) {
      misses.push(`${rule.id} not in ${rule.home}: ${want.slice(0, 120)}`);
    }
  }
  assert.deepStrictEqual(misses, [], `rules missing from their home:\n${misses.join('\n')}`);
});

test('a tightened rule shows both texts and the old one survives word for word', () => {
  const tightened = inventory.rules.filter((r) => r.new !== undefined);
  for (const rule of tightened) {
    assert.ok(rule.old && rule.new, `${rule.id}: old and new must both be non-empty`);
    assert.notStrictEqual(norm(rule.old), norm(rule.new), `${rule.id}: old and new are identical`);
    assert.ok(rule.old_home && HOMES.includes(rule.old_home), `${rule.id}: old_home missing or not allowed`);
    assert.ok(
      readHome(rule.old_home).includes(norm(rule.old)),
      `${rule.id}: old text is not word for word in ${rule.old_home}: ${norm(rule.old).slice(0, 120)}`
    );
  }
});

test('the managed lessons block in CLAUDE.md equals its source template', () => {
  const mine = lessonsSpan(fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8'));
  const source = lessonsSpan(
    fs.readFileSync(path.join(ROOT, '.ctoc', 'templates', 'operating-lessons.md'), 'utf8')
  );
  assert.ok(mine, 'CLAUDE.md has no well-formed CTOC:LESSONS v1 block');
  assert.ok(source, 'operating-lessons.md has no well-formed CTOC:LESSONS v1 block');
  assert.strictEqual(mine, source);
});

test('CLAUDE.md stays at or under 15,000 bytes', () => {
  const size = fs.statSync(path.join(ROOT, 'CLAUDE.md')).size;
  assert.ok(
    size <= MAX_BYTES,
    `CLAUDE.md is ${size} bytes, over ${MAX_BYTES}. New design histories go to docs/, never into CLAUDE.md.`
  );
});

test('every path in the "Read before you touch" table exists', () => {
  const text = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8').replace(/\r\n/g, '\n');
  const at = text.indexOf('## Read before you touch');
  assert.ok(at !== -1, 'CLAUDE.md has no "## Read before you touch" section');
  const section = text.slice(at).split('\n## ')[0];
  const rows = section.split('\n').filter((l) => /^\|/.test(l) && !/^\|[\s|:-]+\|$/.test(l)).slice(1);
  assert.ok(rows.length >= 5, `pointer table has ${rows.length} rows, expected at least 5`);
  for (const row of rows) {
    const cells = row.split('|');
    const target = cells[cells.length - 2].trim().replace(/`/g, '');
    assert.ok(fs.existsSync(path.join(ROOT, ...target.split('/'))), `pointer target ${target} does not exist`);
  }
});

test('the project marker survives as the first line', () => {
  const first = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8').split(/\r?\n/)[0];
  assert.match(first, /^#\s*CTOC Project Instructions/);
});
