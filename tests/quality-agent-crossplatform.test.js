/**
 * R6-D — quality-agent cross-platform + no-hang.
 *
 *  - runCommand had NO timeout → a hung/`--watch`/stdin-waiting command pinned the
 *    quality gate forever. It now bounds every subprocess and surfaces a timeout as
 *    a LOUD failure ({ success:false, timedOut:true }) on the allowFail path.
 *  - Go package paths were built with path.dirname → backslashes on Windows →
 *    malformed `go test ./pkg\sub/...`. They are now normalized to forward slashes.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');

const QA_PATH = require.resolve('../src/lib/quality-agent');
const REAL_EXEC = cp.execSync;

function freshQA() {
  delete require.cache[QA_PATH];
  return require(QA_PATH);
}

test('runCommand: a command that outlives the timeout fails LOUDLY, does not hang', () => {
  cp.execSync = REAL_EXEC; // real subprocess — prove the bound is real
  const { runCommand } = freshQA();
  try {
    const sleepy = `${process.execPath} -e "setTimeout(function(){}, 10000)"`;
    const start = Date.now();
    const r = runCommand(sleepy, { allowFail: true, silent: true, timeout: 400 });
    const elapsed = Date.now() - start;
    assert.equal(r.success, false, 'a timed-out command is not a success');
    assert.equal(r.timedOut, true, 'the timeout must be surfaced, never swallowed');
    assert.ok(elapsed < 5000, `must return promptly on timeout (took ${elapsed}ms), not hang`);
  } finally {
    cp.execSync = REAL_EXEC;
    delete require.cache[QA_PATH];
  }
});

test('runSpecificTests: Go package paths use forward slashes even for backslash inputs', () => {
  let captured;
  cp.execSync = (command) => { captured = command; return ''; };
  const { runSpecificTests } = freshQA();
  try {
    const tools = { go: { test: 'go test ./...', testFramework: 'go' } };
    const testFiles = ['pkg\\sub\\a_test.go', 'pkg\\sub2\\b_test.go'];
    runSpecificTests(tools, testFiles);
    assert.ok(captured, 'a go test command must have been issued');
    assert.ok(!captured.includes('\\'), `go package path must not contain backslashes: ${captured}`);
    assert.equal(captured, 'go test ./pkg/sub/... ./pkg/sub2/...');
  } finally {
    cp.execSync = REAL_EXEC;
    delete require.cache[QA_PATH];
  }
});
