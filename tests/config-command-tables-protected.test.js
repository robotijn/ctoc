'use strict';

/**
 * THE CONFIGURATION DIRECTORY STOPS GRANTING WRITES TO ITS OWN COMMAND TABLES.
 *
 * `PreToolUse.Edit.js` whitelists everything under `.ctoc/` via `/^\.ctoc\//`. Three
 * carve-outs already run ahead of that whitelist and DENY: the approval ledger
 * (`.ctoc/approvals/`), the Gate-3 verify evidence (`.ctoc/state/verify/`) and the
 * streaming gate store (`.ctoc/streaming/`, bar its `pending/` quarantine). All three
 * protect files whose CONTENTS ARE BELIEVED BY A GATE.
 *
 * There is a fourth category the whitelist still hands out for free: files whose
 * CONTENTS BECOME A SUBPROCESS. `.ctoc/quality-config.yaml` and `.ctoc/capabilities/**`
 * supply the lint/typecheck/test/cmd strings that `tool-detector` hands to
 * `quality-agent`. Since sibling plan 00203 shipped, those strings run through
 * `runConfiguredCommand` as an ARGV vector with `shell:false` — NOT a shell — so this
 * is no longer a shell-injection surface. But an argv subprocess of an agent-written
 * program string is STILL arbitrary-PROGRAM execution: an agent that can write those
 * tables makes CTOC run an arbitrary program on every `/ctoc:push` and on the detached
 * git post-commit hook. Defense in depth beyond 00203's shell fix: an approval file is
 * BELIEVED, an evidence file is BELIEVED, a command table is OBEYED — which is worse,
 * and it is the one with no carve-out.
 *
 * The fix is NOT a fourth deny-guard. Changing a project's lint command is ordinary,
 * legitimate work. So a command table is REMOVED FROM THE WHITELIST (an early return in
 * `isWhitelisted`) and falls through to ordinary plan coverage: an APPROVED plan that
 * declares the file may edit it; an agent with no plan may not — the same approval every
 * other source file needs. This test proves the exclusion AND that the approved path
 * still works (case 17 — the guard against it being read as a ban).
 *
 * The exported functions run for real; the only doubles are at the genuine process
 * boundary (exit code, stdout, stderr, cwd). Fixtures live under `os.tmpdir()`; nothing
 * writes inside this repository. The direct-call cases use the repo root as cwd, where
 * `.ctoc/quality-config.yaml` and `.ctoc/capabilities/**` really exist.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const REPO = path.resolve(__dirname, '..');
const MODULE_PATH = path.join(REPO, 'src', 'hooks', 'PreToolUse.Edit.js');
const {
  enforce, isWhitelisted, isCommandTablePath, isProtectedLedgerPath,
} = require(MODULE_PATH);

const createdDirs = [];

after(() => {
  for (const dir of createdDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

/** Run `fn` with process.cwd() forced to `dir`, restoring it unconditionally. */
function withCwd(dir, fn) {
  const before = process.cwd();
  process.chdir(dir);
  try { return fn(); } finally { process.chdir(before); }
}

// ===========================================================================
// Cases 1-15, 19 — the exclusion, called directly. process.cwd() is the repo
// root, where the real .ctoc/quality-config.yaml and .ctoc/capabilities/** live.
// ===========================================================================

describe('command tables leave the whitelist — the exclusion', () => {
  it('case 1: .ctoc/quality-config.yaml is NOT whitelisted (RED today: matches /^\\.ctoc\\// → true)', () => {
    // A whitelist ALLOW on a file whose contents run on every commit is the sentence
    // this whole slice exists to delete.
    assert.equal(isWhitelisted('.ctoc/quality-config.yaml'), false,
      'a file whose contents become a subprocess must not be whitelisted');
  });

  it('case 2: .ctoc/capabilities/languages/javascript.yaml is NOT whitelisted', () => {
    assert.equal(isWhitelisted('.ctoc/capabilities/languages/javascript.yaml'), false);
  });

  it('case 3: the WHOLE capabilities directory, not just languages/', () => {
    assert.equal(isWhitelisted('.ctoc/capabilities/project-types/b2c.yaml'), false);
  });

  it('case 4: both .yaml and .yml spellings excluded', () => {
    assert.equal(isWhitelisted('.ctoc/quality-config.yml'), false);
  });

  it('case 5: absolute form of case 1 is NOT whitelisted', () => {
    assert.equal(isWhitelisted(path.join(REPO, '.ctoc', 'quality-config.yaml')), false);
  });

  it('case 6: Windows separators are NOT whitelisted', () => {
    assert.equal(isWhitelisted('.ctoc\\capabilities\\languages\\x.yaml'), false);
  });

  it('case 7: case-insensitive — .ctoc/CAPABILITIES/x.yaml is NOT whitelisted', () => {
    assert.equal(isWhitelisted('.ctoc/CAPABILITIES/x.yaml'), false);
  });

  it('case 8: isCommandTablePath resolves a re-entering .. back into the table dir', () => {
    // normalizeForProtection collapses .ctoc/state/../capabilities/x.yaml to
    // .ctoc/capabilities/x.yaml — under the table dir. (isWhitelisted also returns
    // false here, but via its own /../ traversal guard, which short-circuits before
    // the exclusion — so the re-entry handling is proven on isCommandTablePath itself.)
    assert.equal(isCommandTablePath('.ctoc/state/../capabilities/x.yaml'), true);
  });

  it('case 9: isCommandTablePath does NOT over-reach — an out-resolving .. is not a table', () => {
    // .ctoc/capabilities/../settings.json resolves to .ctoc/settings.json, NOT a table.
    assert.equal(isCommandTablePath('.ctoc/capabilities/../settings.json'), false);
  });

  it('case 10: the / boundary is required — .ctoc/capabilities-old/ stays whitelisted', () => {
    assert.equal(isWhitelisted('.ctoc/capabilities-old/x.yaml'), true);
  });

  it('case 11: .ctoc/settings.json is untouched — still whitelisted', () => {
    assert.equal(isWhitelisted('.ctoc/settings.json'), true);
  });

  it('case 12: .ctoc/state/agent-status.json is untouched — still whitelisted', () => {
    assert.equal(isWhitelisted('.ctoc/state/agent-status.json'), true);
  });

  it('case 13: the rest of the whitelist is intact', () => {
    assert.equal(isWhitelisted('VERSION'), true);
    assert.equal(isWhitelisted('plans/todo/a.md'), true);
    assert.equal(isWhitelisted('.gitignore'), true);
  });

  it('case 14: isProtectedLedgerPath is unchanged', () => {
    assert.equal(isProtectedLedgerPath('.ctoc/approvals/x.json'), true);
  });

  it('case 15: isCommandTablePath tolerates junk without throwing', () => {
    assert.equal(isCommandTablePath(null), false);
    assert.equal(isCommandTablePath(''), false);
    assert.equal(isCommandTablePath('../outside'), false);
  });

  it('case 19: never throws — every input through a no-exception wrapper', () => {
    const inputs = [
      null, '', '../outside', '.ctoc/quality-config.yaml',
      '.ctoc/capabilities/languages/x.yaml', 'src/lib/x.js',
      path.join(REPO, '.ctoc', 'quality-config.yaml'),
      '.ctoc\\capabilities\\x.yaml', '.ctoc/state/../capabilities/x.yaml',
    ];
    for (const input of inputs) {
      assert.doesNotThrow(() => isCommandTablePath(input), `threw on ${JSON.stringify(input)}`);
      assert.doesNotThrow(() => isWhitelisted(input), `isWhitelisted threw on ${JSON.stringify(input)}`);
    }
  });
});

// ===========================================================================
// Case 16 — a symbolic link into the capabilities directory. A name-based check
// cannot see it; real-path confinement must.
// ===========================================================================

describe('command tables — a link into the table dir is caught', () => {
  it('case 16: src/link.yaml -> .ctoc/capabilities/languages/x.yaml is a command table', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-cmdtable-link-'));
    createdDirs.push(root);
    fs.mkdirSync(path.join(root, '.ctoc', 'capabilities', 'languages'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    const realTable = path.join(root, '.ctoc', 'capabilities', 'languages', 'x.yaml');
    fs.writeFileSync(realTable, 'test: echo\n', 'utf8');
    const link = path.join(root, 'src', 'link.yaml');
    // FAIL LOUDLY, never skip — the CTOC convention for symlink enforcement tests (see
    // the-whitelist-cannot-leave-the-repository.test.js's mklink) and required by
    // tests/skip-visibility.test.js, which forbids a runtime t.skip() because it makes
    // the zero-skipped gate nondeterministic across machines. A platform that refuses
    // the link fails this test with the platform and the error — a skipped case is a
    // check that reports a verdict on input it never received.
    try {
      fs.symlinkSync(realTable, link, 'file');
    } catch (err) {
      assert.fail(
        `could not create a symbolic link on ${process.platform} `
        + `(${link} -> ${realTable}): ${err.code || ''} ${err.message}`,
      );
    }
    withCwd(root, () => {
      assert.equal(isCommandTablePath('src/link.yaml'), true,
        'a link whose REAL destination is under .ctoc/capabilities/ is a command table');
    });
  });
});

// ===========================================================================
// Cases 17-18 — the spawned decision. These prove the exclusion is an APPROVAL
// REQUIREMENT (case 17: an approved plan still grants the edit), not a ban
// (case 18: no plan → deny).
// ===========================================================================

/** A temp CTOC project the detector and enforce() accept. */
function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-cmdtable-'));
  createdDirs.push(dir);
  for (const s of ['in-progress', 'todo', 'implementation']) {
    fs.mkdirSync(path.join(dir, 'plans', s), { recursive: true });
  }
  fs.mkdirSync(path.join(dir, '.ctoc', 'approvals'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.ctoc', 'state', 'verify'), { recursive: true });
  // The command table itself must exist so coverage's real-path resolution is real.
  fs.writeFileSync(path.join(dir, '.ctoc', 'quality-config.yaml'), 'test: echo ok\n', 'utf8');
  fs.writeFileSync(
    path.join(dir, 'CLAUDE.md'),
    '# CTOC Project Instructions\n\nmarker for the detector.\n',
    'utf8',
  );
  return dir;
}

/** Mint an APPROVED plan over the fixture's real bytes, via the real ledger. */
function writeApprovedPlan(root, stage, name, globs) {
  const dir = path.join(root, 'plans', stage);
  fs.mkdirSync(dir, { recursive: true });
  const body = '---\nfiles:\n' + globs.map((g) => `  - "${g}"`).join('\n') + '\n---\n\n# ' + name + '\n';
  const planPath = path.join(dir, `${name}.md`);
  fs.writeFileSync(planPath, body, 'utf8');
  const ledger = require('../src/lib/approval-ledger');
  ledger.writeEntry(ledger.slugFromPlanPath(planPath), {
    content: body,
    stage_from: 'implementation',
    stage_to: stage === 'in-progress' ? 'todo' : stage,
    approved_by: 'human',
  }, root);
  return planPath;
}

function editPayload(filePath) {
  return { tool_name: 'Edit', tool_input: { file_path: filePath } };
}

/** True iff stdout carried the harness deny-decision JSON. */
function isDeny(stdout) {
  if (!stdout) return false;
  let parsed;
  try { parsed = JSON.parse(stdout); } catch { return false; }
  return !!(parsed && parsed.hookSpecificOutput
    && parsed.hookSpecificOutput.permissionDecision === 'deny');
}

/**
 * Drive enforce() in-process. Doubles only at the process boundary; the detector,
 * plan-coverage, approval ledger, escape-phrase and deny-signal modules run for real.
 * process.exit is recorded (not thrown) so a BLOCK's emitDeny does not unwind into
 * enforce()'s own fail-open catch and masquerade as an allow.
 */
async function runEnforce(payload, { cwd } = {}) {
  const orig = {
    exit: process.exit, cwd: process.cwd,
    stdoutWrite: process.stdout.write, stderrWrite: process.stderr.write,
    toolInput: process.env.CLAUDE_TOOL_INPUT,
  };
  let exitCode; let stdout = ''; let stderr = '';
  process.exit = (code) => { exitCode = code; };
  process.stdout.write = (s) => { stdout += s; return true; };
  process.stderr.write = (s) => { stderr += s; return true; };
  if (cwd) process.cwd = () => cwd;
  delete process.env.CLAUDE_TOOL_INPUT;
  try {
    await enforce(payload);
  } finally {
    process.exit = orig.exit; process.cwd = orig.cwd;
    process.stdout.write = orig.stdoutWrite; process.stderr.write = orig.stderrWrite;
    if (orig.toolInput === undefined) delete process.env.CLAUDE_TOOL_INPUT;
    else process.env.CLAUDE_TOOL_INPUT = orig.toolInput;
  }
  return { exitCode, stdout, stderr };
}

describe('command tables — the exclusion is an approval requirement, not a ban', () => {
  it('case 17: an APPROVED plan declaring the command table still grants the edit', async () => {
    const root = makeProject();
    writeApprovedPlan(root, 'todo', 'change-lint-command', ['.ctoc/quality-config.yaml']);
    const res = await runEnforce(editPayload('.ctoc/quality-config.yaml'), { cwd: root });
    assert.equal(res.exitCode, 0,
      'a command table declared by an APPROVED plan must be allowed — the exclusion is not a ban');
    assert.equal(isDeny(res.stdout), false, 'an approved-plan edit must not emit a deny');
  });

  it('case 18: NO plan, no escape phrase → the command-table edit is DENIED', async () => {
    const root = makeProject();
    const res = await runEnforce(editPayload('.ctoc/quality-config.yaml'), { cwd: root });
    assert.equal(res.exitCode, 2,
      'an uncovered command-table edit must fall through to block (RED today: whitelisted → allowed)');
    assert.ok(isDeny(res.stdout), 'the block emits the deny decision');
  });
});
