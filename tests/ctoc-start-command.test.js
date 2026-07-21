'use strict';

/**
 * The command is `/ctoc:start`, not `/ctoc:menu` — a rename, nothing else.
 *
 * In Claude Code a plugin command's NAME is the command file's basename, so
 * `src/commands/start.md` is what renders `/ctoc:start`. This suite pins the
 * rename the owner asked for, in plain words and more than once:
 *
 *   1. the command file moved  menu.md → start.md
 *   2. the backing script moved menu.js → start.js
 *   3. no shipped, human-or-tool-facing file under src/, docs/, README.md or
 *      CLAUDE.md still prints the literal `ctoc:menu` (a historical mention
 *      inside a plans/ file is NOT shipped and is out of scope)
 *   4. the renamed script still WORKS — it produces the dashboard JSON
 *      contract { text, ask, actions }, exactly as before
 *   5. CTOC still ships exactly THREE slash commands: start, push, update
 *
 * Written FIRST and seen RED before the rename existed (TDD).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const COMMANDS = path.join(REPO, 'src', 'commands');

/**
 * Recursively collect every file under `dir` whose extension is in `exts`.
 * @param {string} dir
 * @param {Set<string>} exts
 * @param {string[]} [out]
 * @returns {string[]} absolute paths
 */
function walk(dir, exts, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      walk(full, exts, out);
    } else if (exts.has(path.extname(e.name))) {
      out.push(full);
    }
  }
  return out;
}

describe('ctoc:start is the command name — a rename, nothing else', () => {
  it('1a. the command file moved: src/commands/start.md exists', () => {
    assert.ok(
      fs.existsSync(path.join(COMMANDS, 'start.md')),
      'src/commands/start.md must exist — it is what renders /ctoc:start');
  });

  it('1b. the old command file is gone: src/commands/menu.md does not exist', () => {
    assert.ok(
      !fs.existsSync(path.join(COMMANDS, 'menu.md')),
      'src/commands/menu.md must NOT exist — /ctoc:menu is replaced, not aliased');
  });

  it('2a. the backing script moved: src/commands/start.js exists', () => {
    assert.ok(
      fs.existsSync(path.join(COMMANDS, 'start.js')),
      'src/commands/start.js must exist — the internal filename must not contradict the command');
  });

  it('2b. the old backing script is gone: src/commands/menu.js does not exist', () => {
    assert.ok(
      !fs.existsSync(path.join(COMMANDS, 'menu.js')),
      'src/commands/menu.js must NOT exist after the rename');
  });

  it('3. no shipped file under src/, docs/, README.md or CLAUDE.md prints the literal ctoc:menu', () => {
    const targets = [
      ...walk(path.join(REPO, 'src'), new Set(['.js', '.md', '.json'])),
      ...walk(path.join(REPO, 'docs'), new Set(['.js', '.md', '.json'])),
      path.join(REPO, 'README.md'),
      path.join(REPO, 'CLAUDE.md'),
    ];
    const offenders = [];
    for (const f of targets) {
      let text;
      try {
        text = fs.readFileSync(f, 'utf8');
      } catch {
        continue;
      }
      if (text.includes('ctoc:menu')) {
        offenders.push(path.relative(REPO, f));
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `these shipped files still print the old command name "ctoc:menu": ${offenders.join(', ')}`);
  });

  it('4. the renamed script still WORKS — dashboard route yields { text, ask, actions }', () => {
    const script = path.join(COMMANDS, 'start.js');
    assert.ok(fs.existsSync(script), 'start.js must exist to be run');
    const res = spawnSync(process.execPath, [script, 'dashboard'], {
      cwd: REPO,
      encoding: 'utf8',
      timeout: 90000,
    });
    assert.equal(res.status, 0, `start.js exited ${res.status}\nstderr: ${res.stderr}`);
    let json;
    try {
      json = JSON.parse(res.stdout);
    } catch (err) {
      assert.fail(`start.js stdout was not valid JSON: ${err.message}\n${res.stdout}`);
    }
    assert.equal(typeof json.text, 'string', 'contract requires a text string');
    assert.equal(typeof json.ask, 'object', 'contract requires an ask object');
    assert.equal(typeof json.actions, 'object', 'contract requires an actions object');
  });

  it('5. CTOC still ships exactly three slash commands: start, push, update', () => {
    const mdCommands = fs
      .readdirSync(COMMANDS)
      .filter((f) => f.endsWith('.md'))
      .map((f) => path.basename(f, '.md'))
      .sort();
    assert.deepEqual(mdCommands, ['push', 'start', 'update'],
      `slash commands (the .md files) must be exactly start, push, update — found: ${mdCommands.join(', ')}`);

    const jsBacking = fs
      .readdirSync(COMMANDS)
      .filter((f) => f.endsWith('.js'))
      .map((f) => path.basename(f, '.js'))
      .sort();
    assert.deepEqual(jsBacking, ['push', 'start', 'update'],
      `backing scripts (the .js files) must be exactly start, push, update — found: ${jsBacking.join(', ')}`);
  });
});
