'use strict';

/**
 * Plan 00215 — the growing doc counts GENERATE themselves at release.
 *
 * This test proves the generator, not a hand-edited literal, keeps CLAUDE.md's
 * growing counts (test files, src/lib modules, agents, skills) true:
 *
 *   1. Running release.js's count-sync against a COPY of CLAUDE.md in a tmpdir
 *      writes the live `computeDocCounts` numbers where a human reads them.
 *   2. Drift is CORRECTED: a CLAUDE.md whose count lines hold wrong integers is
 *      synced back to the live values — rot is caught at the generator.
 *   3. TAX IS GONE: the generator tracks a simulated file-add (a fixture root
 *      whose test-file set grows) WITHOUT any CLAUDE.md edit — the thing that
 *      forced eight builds out of scope on 2026-07-21.
 *   4. CONTRACT STILL BITES: the fixed 3-slash-command invariant is NOT a tally —
 *      a fourth command file makes the generator report 4, so the exact-equality
 *      guard that policies it would go RED.
 *
 * NO fixture EVER writes to the real repo root or the real CLAUDE.md — every
 * mutation happens in os.tmpdir().
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { computeDocCounts } = require('../src/lib/doc-counts');
const { updateDocCountsInClaudeMd } = require('../src/scripts/release');

const REAL_ROOT = path.join(__dirname, '..');
const REAL_CLAUDE_MD = path.join(REAL_ROOT, 'CLAUDE.md');

// The growing-count lines, each with the parse regex the docs test uses.
const GROWING_LINES = [
  { field: 'testFiles', regex: /Run all (\d+) test files/ },
  { field: 'testFiles', regex: /tests\/\s+(\d+) test files/ },
  { field: 'libModules', regex: /(\d+) JS modules/ },
  { field: 'agents', regex: /(\d+) agent definitions/ },
  { field: 'skills', regex: /skills\/\s+(\d+) skill files/ },
];

function parseLine(content, regex) {
  const m = content.match(regex);
  assert.ok(m, `count line not found for ${regex}`);
  return Number(m[1]);
}

let tmpRoot;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-doc-counts-'));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('release.js writes the live growing counts into a CLAUDE.md copy', () => {
  it('after count-sync, every growing line in the tmp copy equals computeDocCounts(realRoot)', () => {
    const tmpClaude = path.join(tmpRoot, 'CLAUDE-copy.md');
    fs.copyFileSync(REAL_CLAUDE_MD, tmpClaude);

    const counts = computeDocCounts(REAL_ROOT);
    const { failures } = updateDocCountsInClaudeMd(REAL_ROOT, { claudeMdPath: tmpClaude });
    assert.deepEqual(failures, [], `count-sync reported failures: ${failures.join(', ')}`);

    const synced = fs.readFileSync(tmpClaude, 'utf8');
    for (const { field, regex } of GROWING_LINES) {
      assert.equal(
        parseLine(synced, regex),
        counts[field],
        `growing line ${regex} should equal live ${field}=${counts[field]}`,
      );
    }
  });

  it('CORRECTS drift: wrong integers on the count lines are synced back to live', () => {
    const tmpClaude = path.join(tmpRoot, 'CLAUDE-drifted.md');
    let content = fs.readFileSync(REAL_CLAUDE_MD, 'utf8');
    // Corrupt every growing count to a wildly wrong value.
    content = content
      .replace(/Run all \d+ test files/, 'Run all 1 test files')
      .replace(/(tests\/\s+)\d+( test files)/, '$11$2')
      .replace(/\d+ JS modules/, '1 JS modules')
      .replace(/\d+ agent definitions/, '1 agent definitions')
      .replace(/(skills\/\s+)\d+( skill files)/, '$11$2');
    fs.writeFileSync(tmpClaude, content);

    const counts = computeDocCounts(REAL_ROOT);
    const { failures } = updateDocCountsInClaudeMd(REAL_ROOT, { claudeMdPath: tmpClaude });
    assert.deepEqual(failures, []);

    const fixed = fs.readFileSync(tmpClaude, 'utf8');
    for (const { field, regex } of GROWING_LINES) {
      assert.equal(parseLine(fixed, regex), counts[field]);
    }
    // And the real CLAUDE.md was never touched by this test.
    assert.ok(fs.existsSync(REAL_CLAUDE_MD));
  });

  it('reports a NAMED failure (non-silent) when a count line is missing', () => {
    const tmpClaude = path.join(tmpRoot, 'CLAUDE-noagents.md');
    let content = fs.readFileSync(REAL_CLAUDE_MD, 'utf8');
    content = content.replace(/\d+ agent definitions/, 'AGENTS_LINE_REMOVED');
    fs.writeFileSync(tmpClaude, content);

    const { failures } = updateDocCountsInClaudeMd(REAL_ROOT, { claudeMdPath: tmpClaude });
    assert.ok(
      failures.some((f) => f.includes('agents')),
      `expected a named failure for the missing agents line, got ${JSON.stringify(failures)}`,
    );
  });
});

describe('TAX IS GONE — the generator tracks a file-add with zero CLAUDE.md edit', () => {
  function seedFixture(root, testFileCount) {
    fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src', 'lib'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src', 'commands'), { recursive: true });
    fs.mkdirSync(path.join(root, 'agents'), { recursive: true });
    fs.mkdirSync(path.join(root, 'skills'), { recursive: true });
    for (let i = 0; i < testFileCount; i += 1) {
      fs.writeFileSync(path.join(root, 'tests', `probe-${i}.test.js`), '// probe\n');
    }
  }

  it('adding a test file increments computeDocCounts.testFiles, no doc edit anywhere', () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-tax-'));
    try {
      seedFixture(fixture, 3);
      assert.equal(computeDocCounts(fixture).testFiles, 3);

      // Simulate a test-first build adding one more test file.
      fs.writeFileSync(path.join(fixture, 'tests', 'newly-added.test.js'), '// new\n');
      assert.equal(
        computeDocCounts(fixture).testFiles,
        4,
        'the generator must track the delta — no CLAUDE.md literal to hand-edit',
      );
      // There is NO CLAUDE.md in the fixture and none was created: the tax is gone.
      assert.ok(!fs.existsSync(path.join(fixture, 'CLAUDE.md')));
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('never throws on a tree missing whole directories — returns 0 for absent dirs', () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-bare-'));
    try {
      const counts = computeDocCounts(bare);
      assert.equal(counts.testFiles, 0);
      assert.equal(counts.libModules, 0);
      assert.equal(counts.agents, 0);
      assert.equal(counts.skills, 0);
      assert.equal(counts.slashCommands, 0);
    } finally {
      fs.rmSync(bare, { recursive: true, force: true });
    }
  });
});

describe('CONTRACT STILL BITES — 3 slash commands is fixed, not a tally', () => {
  it('a fourth command file makes the generator report 4 (so the ===3 guard would go RED)', () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-cmds-'));
    try {
      fs.mkdirSync(path.join(fixture, 'src', 'commands'), { recursive: true });
      for (const name of ['start.md', 'push.md', 'update.md']) {
        fs.writeFileSync(path.join(fixture, 'src', 'commands', name), '# cmd\n');
      }
      assert.equal(computeDocCounts(fixture).slashCommands, 3);

      // A fourth slash command appears — a real event the exact-equality guard sees.
      fs.writeFileSync(path.join(fixture, 'src', 'commands', 'rogue.md'), '# rogue\n');
      assert.equal(
        computeDocCounts(fixture).slashCommands,
        4,
        'slashCommands must NOT track silently — the contract change must be visible',
      );
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });
});
