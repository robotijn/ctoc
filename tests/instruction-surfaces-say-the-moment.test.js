'use strict';

/**
 * THE INSTRUCTION-SURFACE GATE-NUMBER FENCE — its ratchet.
 *
 * The rule: never put a gate number in text a person reads, and never TELL the model
 * to produce such text. `src/lib/human-facing-scan.js` fences the JavaScript screen
 * modules; it cannot see the Markdown instruction surfaces (the `.md` files under
 * `src/commands` and `agents`), which told the session model to report `"Gate N ready"`, wrote
 * `User outcome: Gate 0 — …`, and described a moment as `Gate 1/2/3`. The model read
 * those and echoed the number to the owner, who has said "no gate numbers" repeatedly.
 * A prose rule silently stops being true; a test that fails does not.
 *
 * These cases fall into three groups:
 *   1. THE REAL SURFACES ARE CLEAN — the two named surfaces, and the whole surface
 *      tree, carry zero output-instruction leaks (mirrors the enforcer fence).
 *   2. WHAT IT CATCHES — the four leak shapes, on literal strings.
 *   3. WHAT IT MUST NOT CATCH — the internal gate table, the `--gate N` flag, a
 *      machinery description, and a machine-field JSON value. A fence with no
 *      false-positive tests gets tuned by deletion the first time it blocks someone.
 *   4. WHAT IT SAYS WHEN IT CANNOT SEE — an unreadable surface is available:false,
 *      NEVER an empty (passing) findings list.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  PATTERNS,
  scanText,
  scanFile,
  listSurfaces,
  scanSurfaceList,
  scanInstructionSurfaces,
} = require('../src/lib/instruction-gate-words-scan');

const { CHECKS } = require('../src/lib/iron-loop-enforcer');

const ROOT = path.resolve(__dirname, '..');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'igw-'));
}

describe('instruction surfaces say the moment, not the gate number', () => {
  it('start.md and cto-chief.md carry ZERO human-facing gate-number output instructions', () => {
    const res = scanSurfaceList(ROOT, ['src/commands/start.md', 'agents/coordinator/cto-chief.md']);
    assert.equal(res.available, true);
    assert.deepEqual(
      res.findings,
      [],
      `human-facing gate-number output instructions remain:\n${JSON.stringify(res.findings, null, 2)}`
    );
  });

  it('the whole instruction-surface tree is clean (mirrors the enforcer fence)', () => {
    const res = scanInstructionSurfaces(ROOT);
    assert.equal(res.available, true);
    assert.deepEqual(
      res.findings.map((f) => `${f.file}:${f.line} [${f.pattern}]`),
      [],
      `instruction-surface gate-number leaks remain:\n${JSON.stringify(res.findings, null, 2)}`
    );
    assert.ok(res.scanned.length > 100, 'the surface census must not silently shrink');
  });
});

describe('the scan catches the four output-instruction leak shapes', () => {
  const caught = [
    ['quoted-label', 'the completion contract — return a one-line summary, report "Gate N ready" plus a route'],
    ['quoted-label', "becomes a 'Gate N ready' inbox item"],
    ['ready-report', 'Gate 3 is ready for the human.'],
    ['user-outcome', 'User outcome: Gate 0 — user approves the explored vision.'],
    ['slash-enum', 'the plans at Gate 1/2/3 ARE the questions'],
  ];
  for (const [pattern, line] of caught) {
    it(`catches [${pattern}]: ${line.slice(0, 48)}…`, () => {
      const found = scanText(line, 'x.md');
      assert.equal(found.length, 1, `expected exactly one finding in: ${line}`);
      assert.equal(found[0].pattern, pattern);
      assert.equal(found[0].line, 1);
    });
  }

  it('reports at most one finding per line even when several shapes match', () => {
    // "Gate N ready" matches both quoted-label and ready-report; one finding wins.
    const found = scanText('report "Gate N ready" now', 'x.md');
    assert.equal(found.length, 1);
    assert.equal(found[0].pattern, 'quoted-label');
  });

  it('a >160-char leak line is truncated in the excerpt', () => {
    const long = `User outcome: Gate 0 — ${'x'.repeat(300)}`;
    const found = scanText(long, 'x.md');
    assert.equal(found.length, 1);
    assert.ok(found[0].text.endsWith('...'), 'a long excerpt is bounded with an ellipsis');
    assert.ok(found[0].text.length <= 160);
  });

  it('finds a leak on the correct line of a multi-line surface', () => {
    const text = 'clean line one\nanother clean line\nUser outcome: Gate 2 — go';
    const found = scanText(text, 'x.md');
    assert.equal(found.length, 1);
    assert.equal(found[0].line, 3);
  });
});

describe('the scan does NOT catch machinery references', () => {
  const machinery = [
    '| Gate 0 | vision → functional | vision | User approves vision |',
    'the human deliberately crossing Gate 2 (implementation → todo)',
    'crosses Gate 1 (functional → implementation)',
    'menu task complete <id> --summary "…" [--gate N] [--next <navroute>]',
    'A completion records the stop with --gate N',
    '**Four human gates** (Gate 0–3, per CLAUDE.md)',
    '**Four human gates** (Gate 0-3, per CLAUDE.md)',
    '"gate": "Gate 2",',
    'Gate 3 refuses it (correctly) because it has no evidence',
    'the human can cross Gate 3 with one decision',
    '`Gate 0` maps to the vision stage',
  ];
  for (const line of machinery) {
    it(`leaves machinery alone: ${line.slice(0, 48)}…`, () => {
      assert.deepEqual(scanText(line, 'x.md'), [], `false positive on machinery: ${line}`);
    });
  }

  it('every pattern carries a find predicate (frozen registry)', () => {
    assert.ok(PATTERNS.length >= 4);
    for (const p of PATTERNS) {
      assert.equal(typeof p.id, 'string');
      assert.equal(typeof p.find, 'function');
    }
  });
});

describe('the scan fails CLOSED when it cannot read a surface', () => {
  it('scanFile on a missing path is available:false, never empty findings', () => {
    const res = scanFile(path.join(mkTmp(), 'nope.md'), 'nope.md');
    assert.equal(res.available, false);
    assert.match(res.reason, /could not read nope\.md/);
  });

  it('scanFile rejects a non-string path', () => {
    const res = scanFile(0, 'x');
    assert.equal(res.available, false);
  });

  it('scanSurfaceList surfaces the first unreadable entry, does not skip it', () => {
    const res = scanSurfaceList(ROOT, ['agents/coordinator/cto-chief.md', 'agents/does/not/exist.md']);
    assert.equal(res.available, false);
    assert.match(res.reason, /exist\.md/);
  });

  it('scanSurfaceList rejects a missing root', () => {
    assert.equal(scanSurfaceList('', []).available, false);
  });

  it('scanInstructionSurfaces rejects a missing root', () => {
    assert.equal(scanInstructionSurfaces('').available, false);
  });

  it('a tree with no agents/ and no src/commands/ is CLEAN, not unavailable', () => {
    const tmp = mkTmp();
    const res = scanInstructionSurfaces(tmp);
    assert.equal(res.available, true);
    assert.deepEqual(res.findings, []);
    assert.deepEqual(res.scanned, []);
    assert.deepEqual(listSurfaces(tmp), []);
  });

  it('listSurfaces walks nested agent dirs and skips dotfiles and _includes', () => {
    const tmp = mkTmp();
    fs.mkdirSync(path.join(tmp, 'agents', 'sub'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'src', 'commands'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'agents', 'top.md'), 'ok');
    fs.writeFileSync(path.join(tmp, 'agents', 'sub', 'deep.md'), 'ok');
    fs.writeFileSync(path.join(tmp, 'agents', '_include.md'), 'skip');
    fs.writeFileSync(path.join(tmp, 'agents', '.hidden.md'), 'skip');
    fs.writeFileSync(path.join(tmp, 'agents', 'notes.txt'), 'skip');
    fs.writeFileSync(path.join(tmp, 'src', 'commands', 'start.md'), 'ok');
    fs.writeFileSync(path.join(tmp, 'src', 'commands', '.h.md'), 'skip');
    assert.deepEqual(
      listSurfaces(tmp),
      ['agents/sub/deep.md', 'agents/top.md', 'src/commands/start.md']
    );
  });
});

describe('the enforcer wires the instruction-gate-words fence (thorough)', () => {
  const check = CHECKS.find((c) => c.id === 'instruction-gate-words-fence');

  it('is registered as a thorough architecture check', () => {
    assert.ok(check, 'instruction-gate-words-fence must be in CHECKS');
    assert.equal(check.mode, 'thorough');
    assert.equal(check.scope, 'architecture');
  });

  it('is CLEAN against the real repo (all surfaces reworded)', () => {
    assert.deepEqual(check.fn(ROOT), { clean: true });
  });

  it('is CLEAN on a non-CTOC tree (nothing to scan)', () => {
    assert.deepEqual(check.fn(mkTmp()), { clean: true });
  });

  it('BLOCKS when a surface tells the model to emit a gate number', () => {
    const tmp = mkTmp();
    fs.mkdirSync(path.join(tmp, 'agents', 'x'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'agents', 'x', 'bad.md'), 'report "Gate N ready" to the user\n');
    const res = check.fn(tmp);
    assert.equal(res.clean, false);
    assert.equal(res.severity, 'block');
    assert.match(res.message, /emit a gate number/);
    assert.match(res.message, /bad\.md/);
  });

  it('BLOCKS (never passes) when a surface cannot be read', () => {
    const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
    if (process.platform === 'win32' || isRoot) {
      // A permissions test that silently no-ops is itself a check reporting a verdict
      // it never earned. chmod 000 does not deny root and is ignored on Windows.
      console.log('SKIP (loud): unreadable-surface case needs a non-root POSIX host; ' +
        `platform=${process.platform} root=${isRoot}`);
      return;
    }
    const tmp = mkTmp();
    fs.mkdirSync(path.join(tmp, 'agents', 'x'), { recursive: true });
    const bad = path.join(tmp, 'agents', 'x', 'locked.md');
    fs.writeFileSync(bad, 'report "Gate N ready"\n');
    fs.chmodSync(bad, 0o000);
    try {
      const res = check.fn(tmp);
      assert.equal(res.clean, false);
      assert.equal(res.severity, 'block');
      assert.match(res.message, /could not run/);
    } finally {
      fs.chmodSync(bad, 0o644);
    }
  });
});
