'use strict';
/**
 * The PreToolUse payload has ONE source: stdin. `process.env.CLAUDE_TOOL_INPUT`
 * is never read — the Claude Code harness does not set it, and reading it first
 * let any process in the session substitute a decoy target (`{"file_path":"VERSION"}`
 * resolved to the whitelist allow while the real Edit landed elsewhere, defeating
 * the ledger guard, the verify-evidence guard, plan coverage and the secret-file
 * guard). This suite proves the two hooks that had the defect (PreToolUse.Edit.js
 * getTargetFile, guard-files.js getTarget) are stdin-only, proves the decoy no
 * longer reaches the guard it defeated, and — case 12 — FENCES the divergence: a
 * SOURCE SCAN over every hook so a future sibling that reaches for the env var
 * fails the suite the day it is written. See plan 00200.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  getTargetFile,
  isProtectedLedgerPath,
} = require('../src/hooks/PreToolUse.Edit.js');
const {
  getTarget,
  isSecretTarget,
} = require('../src/hooks/guard-files.js');

/** Set CLAUDE_TOOL_INPUT for the duration of fn, always restoring the prior value. */
function withEnv(value, fn) {
  const orig = process.env.CLAUDE_TOOL_INPUT;
  process.env.CLAUDE_TOOL_INPUT = value;
  try {
    return fn();
  } finally {
    if (orig === undefined) delete process.env.CLAUDE_TOOL_INPUT;
    else process.env.CLAUDE_TOOL_INPUT = orig;
  }
}

// ---------------------------------------------------------------------------
// PreToolUse.Edit.js — getTargetFile is stdin-only
// ---------------------------------------------------------------------------

test('1. Edit: the environment cannot substitute a target', () => {
  withEnv(JSON.stringify({ file_path: 'VERSION' }), () => {
    assert.strictEqual(
      getTargetFile({ tool_input: { file_path: 'src/lib/plan-coverage.js' } }),
      'src/lib/plan-coverage.js',
      'the stdin payload is the target; a present env file_path must be ignored',
    );
  });
});

test('2. Edit: the environment alone yields nothing', () => {
  withEnv(JSON.stringify({ file_path: 'VERSION' }), () => {
    assert.strictEqual(getTargetFile(null), null, 'env set + null stdin → null');
  });
});

test('3. Edit: the regex fallback is gone', () => {
  withEnv('some prefix file_path: "x" trailing prose', () => {
    assert.strictEqual(
      getTargetFile(null),
      null,
      'the best-effort regex over the env string is deleted; unparseable env yields nothing',
    );
  });
});

test('4. Edit: notebook and path keys still resolve from stdin', () => {
  assert.strictEqual(getTargetFile({ tool_input: { file_path: 'a.js' } }), 'a.js');
  assert.strictEqual(getTargetFile({ tool_input: { path: 'b.js' } }), 'b.js');
  assert.strictEqual(getTargetFile({ tool_input: { notebook_path: 'c.ipynb' } }), 'c.ipynb');
  assert.strictEqual(getTargetFile({ tool_input: {} }), null, 'no known key → the || null default');
});

test('5. Edit: the decoy no longer reaches the whitelist allow (measured at the ledger guard)', () => {
  withEnv(JSON.stringify({ file_path: 'VERSION' }), () => {
    const payload = { tool_input: { file_path: '.ctoc/approvals/x.json' } };
    assert.strictEqual(
      isProtectedLedgerPath(getTargetFile(payload)),
      true,
      'a VERSION decoy in the env must NOT mask the real ledger target on stdin',
    );
  });
});

// ---------------------------------------------------------------------------
// guard-files.js — getTarget is stdin-only
// ---------------------------------------------------------------------------

test('6. guard-files: the environment cannot substitute a target', () => {
  withEnv(JSON.stringify({ file_path: 'README.md' }), () => {
    const target = getTarget({ tool_input: { file_path: '.env' } });
    assert.ok(target.includes('.env'), 'the stdin .env target must survive an env decoy');
  });
});

test('7. guard-files: the environment cannot mask a command', () => {
  withEnv(JSON.stringify({ command: 'ls' }), () => {
    const target = getTarget({ tool_input: { command: 'cat .env' } });
    assert.ok(target.includes('cat .env'), 'a benign env command must not discard the real stdin command');
  });
});

test('8. guard-files: absent payload', () => {
  assert.strictEqual(getTarget(null), '', 'no payload → empty target string');
});

test('9. guard-files: the installation secret is a secret target', () => {
  assert.strictEqual(isSecretTarget('/home/u/.ctoc/.secret'), true);
  assert.strictEqual(isSecretTarget('cat ~/.ctoc/.secret'), true);
});

test('10. guard-files: the secret pattern does not over-match', () => {
  assert.strictEqual(isSecretTarget('src/lib/mysecret.js'), false);
  assert.strictEqual(isSecretTarget('src/secretly.js'), false);
});

test('11. guard-files: Windows separators', () => {
  assert.strictEqual(isSecretTarget('C:\\Users\\u\\.ctoc\\.secret'), true);
});

// ---------------------------------------------------------------------------
// The divergence fence — a SOURCE scan over every hook (catches a file that
// does not exist yet). Comments are stripped first: PreToolUse.Bash.js mentions
// the variable in prose deliberately (its documentation of the rule).
// ---------------------------------------------------------------------------

/** Remove /* block *\/ and // line comments so only executable source remains. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

test('12. the divergence fence: no hook reads CLAUDE_TOOL_INPUT in code', () => {
  const hooksDir = path.join(__dirname, '..', 'src', 'hooks');
  const files = fs.readdirSync(hooksDir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 0, 'expected hook files under src/hooks/');
  const offenders = [];
  for (const file of files) {
    const source = fs.readFileSync(path.join(hooksDir, file), 'utf8');
    const code = stripComments(source);
    const lines = code.split('\n');
    lines.forEach((line, i) => {
      if (line.includes('CLAUDE_TOOL_INPUT')) offenders.push(`${file}:${i + 1}`);
    });
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `a hook reads the never-set env var in code (single-source-of-truth violation): ${offenders.join(', ')}`,
  );
});
