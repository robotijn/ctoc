/**
 * Shared agent-prompt fragments must never be dispatchable agents.
 *
 * HISTORY (two designs, one lesson). The fragments originally lived in
 * `agents/_shared/`, and the first fix tried to exclude them with a
 * `plugin.json` `agents` whitelist of the real category directories. The LIVE
 * plugin validator (`claude plugin validate`, verified against Claude Code
 * 2.1.207) rejected that outright — the `agents` field accepts ONLY an array
 * of FILE paths (every directory form, with or without a trailing slash, and
 * a bare string, is "Invalid input") — and the invalid manifest took the whole
 * plugin down: every CTOC agent vanished from the session. Worse, probing
 * showed the validator scans everything under `agents/` regardless of the
 * field, so the whitelist never excluded the fragments anyway.
 *
 * THE STANDING DESIGN — exclusion by construction: the fragments live OUTSIDE
 * the scanned tree, at `skills/agent-fragments/` (the skills tree already
 * holds hundreds of inert reference markdown files; only `SKILL.md` files are
 * loaded as skills), and `plugin.json` declares NO `agents` field at all, so
 * default discovery scans a clean `agents/` in which EVERY markdown file is a
 * genuine, dispatchable agent.
 *
 * These tests read the REAL manifest and the REAL trees — no fixtures.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MANIFEST = path.join(ROOT, '.claude-plugin', 'plugin.json');
const AGENTS_DIR = path.join(ROOT, 'agents');
const FRAGMENTS_DIR = path.join(ROOT, 'skills', 'agent-fragments');

const FRAGMENTS = [
  'ancestry-read.md',
  'async-choice-protocol.md',
  'no-stub-rule.md',
  'warnings-are-critical.md'
];

function walkMd(dir) {
  const acc = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) acc.push(...walkMd(full));
    else if (entry.name.endsWith('.md')) acc.push(full);
  }
  return acc;
}

describe('shared fragments are not dispatchable agents (exclusion by construction)', () => {
  it('plugin.json declares NO agents field — default discovery scans a clean agents/', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    assert.equal(
      'agents' in manifest,
      false,
      'plugin.json must not carry an agents field: the live validator accepts only an ' +
      'array of file paths there, every directory form is Invalid input, and an invalid ' +
      'manifest disables the ENTIRE plugin (observed live on v6.11.1)'
    );
  });

  it('no _shared (or any underscore-prefixed) directory exists under agents/', () => {
    const underscored = [];
    (function scan(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('_')) underscored.push(path.join(dir, entry.name));
        else scan(path.join(dir, entry.name));
      }
    })(AGENTS_DIR);
    assert.deepEqual(
      underscored,
      [],
      `agents/ must contain only real agent categories; found: ${underscored.join(', ')}`
    );
  });

  it('every markdown file under agents/ is a genuine agent (byte-0 frontmatter with a name)', () => {
    // The real loading contract, per the live validator: an agent file opens
    // with YAML frontmatter at byte 0 carrying at least name:. Full agents add
    // description/tools/model; Tier-2 wrapper agents carry name + type +
    // target_skill and are legitimately dispatchable. The retired _shared
    // fragments had NO frontmatter at all — that is what this catches.
    const files = walkMd(AGENTS_DIR);
    assert.ok(files.length >= 100, `expected a real agent tree, found only ${files.length} files`);
    const offenders = [];
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf8');
      const m = content.match(/^---\n([\s\S]*?)\n---/);
      const fm = m ? m[1] : '';
      if (!/^name:\s*\S/m.test(fm)) {
        offenders.push(path.relative(ROOT, f));
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `every file the harness discovers as an agent must BE one; non-agent files under agents/: ${offenders.join(', ')}`
    );
  });

  it('the four fragments live at skills/agent-fragments/ and are not skills (no SKILL.md)', () => {
    for (const name of FRAGMENTS) {
      assert.ok(
        fs.existsSync(path.join(FRAGMENTS_DIR, name)),
        `skills/agent-fragments/${name} must exist`
      );
    }
    assert.equal(
      fs.existsSync(path.join(FRAGMENTS_DIR, 'SKILL.md')),
      false,
      'the fragments directory must not be loadable as a skill'
    );
  });

  it('no agent references the retired agents/_shared location', () => {
    const stale = walkMd(AGENTS_DIR)
      .filter((f) => fs.readFileSync(f, 'utf8').includes('_shared'))
      .map((f) => path.relative(ROOT, f));
    assert.deepEqual(stale, [], `stale fragment links: ${stale.join(', ')}`);
  });
});
