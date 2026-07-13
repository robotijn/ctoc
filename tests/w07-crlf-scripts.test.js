'use strict';

/**
 * W07-s5 — CRLF safety for the dev-tooling frontmatter parsers.
 *
 * Behavioral contract (finding H1): a file checked out on Windows with CRLF
 * line endings must parse / migrate / strip byte-identically to its LF twin.
 * These scripts previously used the LF-only `/^---\n/` fence and silently did
 * NOTHING on CRLF input — the exact "silent lockout" the shared reader fixes.
 *
 * Covers all three tooling parsers:
 *   - src/scripts/v8-migrate-skills.js   (parseFrontmatter + migrate reconstruct)
 *   - src/scripts/strip-unenforced-budgets.js (stripFromFrontmatter)
 *   - src/scripts/v8-add-tier.js         (addTierField — the reader the review named)
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const migrateScript = require('../src/scripts/v8-migrate-skills');
const stripScript = require('../src/scripts/strip-unenforced-budgets');
const addTierScript = require('../src/scripts/v8-add-tier');

/** Turn an LF fixture into its exact CRLF twin. */
const toCRLF = (s) => s.replace(/\n/g, '\r\n');
/** Normalize any CRLF back to LF for twin comparison. */
const toLF = (s) => s.replace(/\r/g, '');

// ── v8-migrate-skills.parseFrontmatter ──────────────────────────────────────

const SKILL_LF = [
  '---',
  'name: demo-skill',
  'description: A demo skill for CRLF twin testing',
  'effort_level: high',
  'model_optimized_for: reasoning',
  '---',
  '',
  '# Demo Skill',
  '',
  'Body content that must survive migration.',
  '',
].join('\n');

test('v8-migrate-skills.parseFrontmatter: CRLF twin parses identically to LF', () => {
  const lf = migrateScript.parseFrontmatter(SKILL_LF);
  const crlf = migrateScript.parseFrontmatter(toCRLF(SKILL_LF));

  assert.notStrictEqual(lf, null, 'LF fixture must parse');
  assert.notStrictEqual(crlf, null, 'CRLF twin must parse (was the silent lockout)');
  assert.ok(!/\r/.test(crlf.raw), 'raw must be carriage-return free');
  assert.deepStrictEqual(crlf, lf, 'CRLF result must deep-equal its LF twin');
});

test('v8-migrate-skills.migrate: CRLF skill migrates to the same v8 block as its LF twin', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w07-migrate-'));
  try {
    const lfPath = path.join(dir, 'lf', 'SKILL.md');
    const crlfPath = path.join(dir, 'crlf', 'SKILL.md');
    fs.mkdirSync(path.dirname(lfPath), { recursive: true });
    fs.mkdirSync(path.dirname(crlfPath), { recursive: true });
    fs.writeFileSync(lfPath, SKILL_LF);
    fs.writeFileSync(crlfPath, toCRLF(SKILL_LF));

    const lfRes = migrateScript.migrate(lfPath);
    const crlfRes = migrateScript.migrate(crlfPath);

    assert.strictEqual(lfRes.status, 'migrated');
    assert.strictEqual(crlfRes.status, 'migrated', 'CRLF skill must actually migrate, not silently no-op');

    const lfOut = fs.readFileSync(lfPath, 'utf8');
    const crlfOut = fs.readFileSync(crlfPath, 'utf8');

    assert.ok(/\ntier: 2\b/.test(lfOut), 'LF output carries the v8 tier field');
    assert.ok(/\ntier: 2\b/.test(crlfOut), 'CRLF output carries the v8 tier field');
    assert.strictEqual(toLF(crlfOut), toLF(lfOut), 'migrated CRLF output equals its LF twin');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── strip-unenforced-budgets.stripFromFrontmatter ───────────────────────────

const BUDGET_TOP_LF = [
  '---',
  'name: some-skill',
  'effort_level: medium',
  'max_tokens: 25000',
  'max_tool_calls: 20',
  'max_subagents: 0',
  '---',
  '',
  '# Some Skill',
  '',
  'Body.',
  '',
].join('\n');

// Scout format: frontmatter AFTER a leading H1 title.
const BUDGET_AFTER_TITLE_LF = [
  '# Scout Title',
  '',
  '---',
  'name: some-scout',
  'max_tokens: 10000',
  'max_tool_calls: 10',
  'max_subagents: 0',
  '---',
  '',
  'Scout body.',
  '',
].join('\n');

test('strip-unenforced-budgets: CRLF twin strips identically (top-of-file frontmatter)', () => {
  const lf = stripScript.stripFromFrontmatter(BUDGET_TOP_LF);
  const crlf = stripScript.stripFromFrontmatter(toCRLF(BUDGET_TOP_LF));

  assert.strictEqual(lf.changed, true, 'LF must strip the budget lines');
  assert.strictEqual(crlf.changed, true, 'CRLF twin must also strip (was the silent lockout)');
  assert.ok(!/max_tokens:/.test(crlf.content), 'max_tokens removed');
  assert.ok(!/max_tool_calls:/.test(crlf.content), 'max_tool_calls removed');
  assert.ok(/max_subagents: 0/.test(crlf.content), 'max_subagents preserved');
  assert.strictEqual(toLF(crlf.content), toLF(lf.content), 'stripped CRLF content equals its LF twin');
});

test('strip-unenforced-budgets: CRLF twin strips identically (frontmatter after a title)', () => {
  const lf = stripScript.stripFromFrontmatter(BUDGET_AFTER_TITLE_LF);
  const crlf = stripScript.stripFromFrontmatter(toCRLF(BUDGET_AFTER_TITLE_LF));

  assert.strictEqual(lf.changed, true);
  assert.strictEqual(crlf.changed, true, 'after-title CRLF twin must strip too');
  assert.ok(!/max_tokens:/.test(crlf.content));
  assert.strictEqual(toLF(crlf.content), toLF(lf.content), 'stripped CRLF content equals its LF twin');
});

// ── v8-add-tier.addTierField (the reader the review named) ───────────────────

const AGENT_TOP_LF = [
  '---',
  'name: cto-chief',
  'description: top-level coordinator',
  'model: opus',
  '---',
  '',
  '# CTO Chief',
  '',
  'Agent body.',
  '',
].join('\n');

const AGENT_AFTER_TITLE_LF = [
  '# Vision Advisor',
  '',
  '---',
  'name: vision-advisor',
  'description: helps',
  '---',
  '',
  'Agent body.',
  '',
].join('\n');

test('v8-add-tier.addTierField: CRLF twin adds tier identically (top-of-file frontmatter)', () => {
  const lf = addTierScript.addTierField(AGENT_TOP_LF, 0);
  const crlf = addTierScript.addTierField(toCRLF(AGENT_TOP_LF), 0);

  assert.strictEqual(lf.changed, true, 'LF must add tier');
  assert.strictEqual(crlf.changed, true, 'CRLF twin must also add tier (was fully broken)');
  assert.ok(/\ntier: 0\b/.test(crlf.content), 'tier field inserted');
  assert.strictEqual(toLF(crlf.content), toLF(lf.content), 'CRLF output equals its LF twin');
});

test('v8-add-tier.addTierField: CRLF twin adds tier identically (frontmatter after a title)', () => {
  const lf = addTierScript.addTierField(AGENT_AFTER_TITLE_LF, 1);
  const crlf = addTierScript.addTierField(toCRLF(AGENT_AFTER_TITLE_LF), 1);

  assert.strictEqual(lf.changed, true);
  assert.strictEqual(crlf.changed, true, 'after-title CRLF twin must add tier too');
  assert.ok(/\ntier: 1\b/.test(crlf.content));
  assert.strictEqual(toLF(crlf.content), toLF(lf.content), 'CRLF output equals its LF twin');
});

test('v8-add-tier.addTierField: idempotent when tier already present (CRLF)', () => {
  const withTier = AGENT_TOP_LF.replace('model: opus', 'model: opus\ntier: 0');
  const res = addTierScript.addTierField(toCRLF(withTier), 0);
  assert.strictEqual(res.changed, false, 'already-tiered frontmatter is left untouched');
});
