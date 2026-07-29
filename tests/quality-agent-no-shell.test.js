'use strict';

/**
 * NO-SHELL DOCTRINE for CONFIGURED quality commands (plan 00203).
 *
 * The defect: runLint / runTypecheck and the full-test fallback ran a CONFIGURED
 * command string (from `.ctoc/quality-config.yaml` or `.ctoc/capabilities/languages/*.yaml`
 * — both agent-writable under the `/^\.ctoc\//` edit whitelist) through `execSync`, which
 * hands the whole string to `/bin/sh -c` (or `cmd.exe /d /s /c`). A configured command
 * carrying a shell operator was therefore interpreted by a shell and executed on the
 * human's own `/ctoc:push` and on the detached post-commit hook — command injection via a
 * whitelisted configuration file.
 *
 * The fix routes configured commands through an ARGV VECTOR (execFileSync, shell:false)
 * via runConfiguredCommand, and REFUSES — as a FAILED check, never a skip and never a
 * pass — any configured command that carries shell structure it cannot safely express as
 * argv. This mirrors the shipped app-runner rule for the declared entry point.
 *
 * The kill case is #13: a configured lint command whose payload (after `&&`) would write a
 * proof file. Against the vulnerable shell code the proof file EXISTS (the payload ran);
 * against the fix it does NOT (the command was refused before any execution).
 *
 * Cross-platform: NODE one-liners, path.join, os.tmpdir, fs teardown, no shell as an
 * entry point. The proof-file path is passed by environment variable so nothing is ever
 * written into this repository.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const qualityAgent = require('../src/lib/quality-agent');
const toolDetector = require('../src/lib/tool-detector');
const { parseConfiguredCommand, runConfiguredCommand, runLint, runTypecheck, runFullTests } = qualityAgent;

const NODE = process.execPath;

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}
/** Capture console.log while fn runs; always restore. */
async function captureLog(fn) {
  const orig = console.log;
  console.log = () => {};
  try { return await fn(); } finally { console.log = orig; }
}

// ---------------------------------------------------------------------------
// parseConfiguredCommand — the argv split / refuse decision (pure, deterministic)
// ---------------------------------------------------------------------------
describe('parseConfiguredCommand — accepts clean argv, refuses shell structure', () => {
  it('1. `eslint .` → ok, bin eslint, args ["."]', () => {
    const r = parseConfiguredCommand('eslint .');
    assert.equal(r.ok, true);
    assert.equal(r.bin, 'eslint');
    assert.deepEqual(r.args, ['.']);
  });

  it('2. `npx tsc --noEmit` → ok, args [tsc, --noEmit]', () => {
    const r = parseConfiguredCommand('npx tsc --noEmit');
    assert.equal(r.ok, true);
    assert.equal(r.bin, 'npx');
    assert.deepEqual(r.args, ['tsc', '--noEmit']);
  });

  it('3. `eslint --format "compact json" src` → three args, the quoted one intact', () => {
    const r = parseConfiguredCommand('eslint --format "compact json" src');
    assert.equal(r.ok, true);
    assert.deepEqual(r.args, ['--format', 'compact json', 'src']);
  });

  it('4. single quotes are honoured: `eslint --rulesdir \'my dir\'`', () => {
    const r = parseConfiguredCommand("eslint --rulesdir 'my dir'");
    assert.equal(r.ok, true);
    assert.deepEqual(r.args, ['--rulesdir', 'my dir']);
  });

  it('5. `npm test && curl evil` → refused, reason names the operator', () => {
    const r = parseConfiguredCommand('npm test && curl evil');
    assert.equal(r.ok, false);
    assert.match(r.reason, /&/, 'the refusal reason must name the shell operator');
  });

  it('6. `eslint . ; touch /tmp/x` → refused (`;`)', () => {
    const r = parseConfiguredCommand('eslint . ; touch /tmp/x');
    assert.equal(r.ok, false);
    assert.match(r.reason, /;/);
  });

  it('7. backtick command substitution → refused', () => {
    const r = parseConfiguredCommand('eslint `id`');
    assert.equal(r.ok, false);
    assert.match(r.reason, /`/);
  });

  it('8. `eslint $(id)` command substitution → refused', () => {
    const r = parseConfiguredCommand('eslint $(id)');
    assert.equal(r.ok, false);
    assert.match(r.reason, /\$\(/);
  });

  it('9. a pipe `eslint . | tee out` → refused', () => {
    const r = parseConfiguredCommand('eslint . | tee out');
    assert.equal(r.ok, false);
    assert.match(r.reason, /\|/);
  });

  it('10. a redirect `eslint . > out` → refused', () => {
    const r = parseConfiguredCommand('eslint . > out');
    assert.equal(r.ok, false);
    assert.match(r.reason, />/);
  });

  it('11. empty / whitespace / null / number → refused, never throws', () => {
    for (const bad of ['', '   ', null, undefined, 42, {}]) {
      const r = parseConfiguredCommand(bad);
      assert.equal(r.ok, false, `input ${JSON.stringify(bad)} must be refused`);
      assert.equal(typeof r.reason, 'string');
    }
  });

  it('12. a QUOTED operator is DATA, not structure: `eslint --msg "a && b"` → ok', () => {
    // A blunt substring scan for && would reject a legitimate configuration. The parse is
    // quote-aware: the && inside the double-quoted argument is one literal argv element.
    const r = parseConfiguredCommand('eslint --msg "a && b"');
    assert.equal(r.ok, true, 'a quoted operator must not trigger a refusal');
    assert.deepEqual(r.args, ['--msg', 'a && b']);
  });

  it('22. Windows spelling: `npx.cmd tsc --noEmit` → ok, no POSIX-binary assumption', () => {
    const r = parseConfiguredCommand('npx.cmd tsc --noEmit');
    assert.equal(r.ok, true);
    assert.equal(r.bin, 'npx.cmd');
    assert.deepEqual(r.args, ['tsc', '--noEmit']);
  });
});

// ---------------------------------------------------------------------------
// runConfiguredCommand — refuse vs run vs genuine failure vs timeout
// ---------------------------------------------------------------------------
describe('runConfiguredCommand — refuse is a FAILED check, a valid argv still runs', () => {
  it('refuses a shell-operator command WITHOUT running anything (success:false, refused:true)', () => {
    const r = runConfiguredCommand(`"${NODE}" -e "0" && "${NODE}" -e "process.exit(0)"`,
      { allowFail: true, silent: true });
    assert.equal(r.success, false);
    assert.equal(r.refused, true, 'a refusal must be marked, and it must NOT have executed');
    assert.match(String(r.error || r.output), /refus/i);
  });

  it('17. a legitimate simple command still runs and captures output', () => {
    const r = runConfiguredCommand(`"${NODE}" --version`, { allowFail: true, silent: true });
    assert.equal(r.success, true);
    assert.match(r.output, /^v\d+\./, 'the real node version must be captured');
  });

  it('18. a genuinely failing (but argv-valid) command FAILS from its exit code — not refused', () => {
    // node -e "process.exit(1)" is an interpreter with a valid argv: it RUNS and fails.
    // Refusal (shell structure) and failure (non-zero exit) are distinguishable outcomes.
    const r = runConfiguredCommand(`"${NODE}" -e "process.exit(1)"`, { allowFail: true, silent: true });
    assert.equal(r.success, false);
    assert.notEqual(r.refused, true, 'a valid argv that exits non-zero is a FAILURE, not a refusal');
  });

  it('19. timeout parity: a command that outlives the timeout surfaces timedOut', () => {
    const r = runConfiguredCommand(`"${NODE}" -e "setTimeout(function(){}, 10000)"`,
      { allowFail: true, silent: true, timeout: 300 });
    assert.equal(r.success, false);
    assert.equal(r.timedOut, true, 'the timeout must be surfaced, matching runCommand contract');
  });
});

// ---------------------------------------------------------------------------
// End to end: the payload NEVER executes, through every configured runner. This is
// the defect measured — a proof file the shell payload would have written stays absent.
// ---------------------------------------------------------------------------
describe('the configured payload never executes — refused as a FAILED check on every runner', () => {
  let dir, proof, payload, benign, failing;
  before(() => {
    dir = mkTmp('ctoc-noshell-');
    proof = path.join(dir, 'PROOF');
    process.env.CTOC_NOSHELL_PROOF = proof;
    // A benign first command that SUCCEEDS, then an && payload that writes the proof file.
    // On the vulnerable shell path both run and the proof appears; the fix refuses the
    // whole string before anything runs.
    payload = `"${NODE}" -e "0" && "${NODE}" -e "require('fs').writeFileSync(process.env.CTOC_NOSHELL_PROOF,'x')"`;
    benign = `"${NODE}" --version`;
    failing = `"${NODE}" -e "process.exit(1)"`;
  });
  after(() => { delete process.env.CTOC_NOSHELL_PROOF; rm(dir); });

  it('13. runLint refuses the payload and the proof file is NEVER written', async () => {
    const res = await captureLog(() => runLint({ javascript: { lint: payload } }));
    assert.equal(fs.existsSync(proof), false, 'the shell payload must NOT have executed');
    assert.equal(res.passed, false, 'a refused check is not a pass');
    assert.ok(res.errors >= 1, 'a refusal is a failure with at least one error');
    assert.match(String(res.output), /refus/i, 'the output must name the refusal');
  });

  it('14. runTypecheck refuses the payload and the proof file is NEVER written', async () => {
    const res = await captureLog(() => runTypecheck({ javascript: { typecheck: payload } }));
    assert.equal(fs.existsSync(proof), false);
    assert.equal(res.passed, false);
    assert.ok(res.errors >= 1);
  });

  it('15. the full-test fallback refuses the payload and the proof file is NEVER written', async () => {
    const res = await captureLog(() => runFullTests({ javascript: { test: payload } }));
    assert.equal(fs.existsSync(proof), false);
    assert.equal(res.passed, false);
    assert.ok((res.failed || 0) >= 1, 'a refused full-test command is a failure, never a pass');
  });

  it('16. across all three runners a refusal is a FAILURE (never a silent skip or pass)', async () => {
    const lint = await captureLog(() => runLint({ javascript: { lint: payload } }));
    const tc = await captureLog(() => runTypecheck({ javascript: { typecheck: payload } }));
    const full = await captureLog(() => runFullTests({ javascript: { test: payload } }));
    assert.equal(lint.passed, false); assert.ok(lint.errors >= 1);
    assert.equal(tc.passed, false); assert.ok(tc.errors >= 1);
    assert.equal(full.passed, false); assert.ok((full.failed || 0) >= 1);
  });

  it('a legitimate configured lint command still passes, a genuinely failing one still fails', async () => {
    const ok = await captureLog(() => runLint({ javascript: { lint: benign } }));
    assert.equal(ok.passed, true, 'a clean configured command must still run and pass');
    const bad = await captureLog(() => runLint({ javascript: { lint: failing } }));
    assert.equal(bad.passed, false, 'a real non-zero exit must still fail');
  });

  it('reaches the runner through the REAL config path (detectTools → runLint) and refuses', async () => {
    // Prove the source is genuinely a whitelisted config file, not just a hand-built tools
    // map: write .ctoc/quality-config.yaml with a shell-operator lint command, let
    // tool-detector read it, then run. The refusal message (only the fix produces it)
    // distinguishes the fixed argv path from the vulnerable shell path.
    const proj = mkTmp('ctoc-noshell-cfg-');
    try {
      fs.writeFileSync(path.join(proj, 'package.json'),
        JSON.stringify({ name: 'x', version: '1.0.0' }));
      fs.writeFileSync(path.join(proj, 'index.js'), 'module.exports = 1;\n');
      fs.mkdirSync(path.join(proj, '.ctoc'), { recursive: true });
      fs.writeFileSync(path.join(proj, '.ctoc', 'quality-config.yaml'),
        'languages:\n  javascript:\n    lint: eslint . && curl http://evil\n');
      const detection = toolDetector.detectTools(proj);
      assert.equal(detection.tools.javascript.lint, 'eslint . && curl http://evil',
        'the shell-operator lint override must reach langTools verbatim (defect precondition)');
      const res = await captureLog(() => runLint(detection.tools));
      assert.equal(res.passed, false, 'the configured shell-operator command is refused');
      assert.match(String(res.output), /refus/i,
        'the config-derived command must be REFUSED (argv path), not handed to a shell');
    } finally {
      rm(proj);
    }
  });
});

// ---------------------------------------------------------------------------
// The parse must not be so strict that real configurations stop working.
// ---------------------------------------------------------------------------
describe('the parse accepts every command CTOC itself ships and detects', () => {
  it('20. every bundled capability lint/typecheck/test command parses', () => {
    const dir = path.join(__dirname, '..', '.ctoc', 'capabilities', 'languages');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.yaml'));
    assert.ok(files.length > 0, 'there must be bundled capability files to check');
    const rejected = [];
    // A tolerant scan of the `lint|typecheck|test: { cmd: "..." }` scalars — the same
    // fields tool-detector resolves. A rejection here is a defect in the BUNDLED file,
    // fixed there, never by loosening the parse.
    const cmdRe = /^\s*(lint|typecheck|test)\s*:\s*\{[^}]*\bcmd\s*:\s*"([^"]+)"/;
    const altRe = /\baltCmd\s*:\s*"([^"]+)"/;
    for (const f of files) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const line of text.split('\n')) {
        const m = cmdRe.exec(line);
        if (m) {
          const r = parseConfiguredCommand(m[2]);
          if (!r.ok) rejected.push(`${f}: ${m[1]} "${m[2]}" — ${r.reason}`);
        }
        const a = altRe.exec(line);
        if (a && /^\s*(lint|typecheck|test)\s*:/.test(line)) {
          const r = parseConfiguredCommand(a[1]);
          if (!r.ok) rejected.push(`${f}: altCmd "${a[1]}" — ${r.reason}`);
        }
      }
    }
    assert.deepEqual(rejected, [], `bundled capability commands must all parse; rejected: ${rejected.join(' | ')}`);
  });

  it('21. every command tool-detector returns for THIS repository parses', () => {
    const detection = toolDetector.detectTools(path.join(__dirname, '..'));
    const rejected = [];
    for (const [lang, t] of Object.entries(detection.tools || {})) {
      for (const key of ['lint', 'typecheck', 'test']) {
        if (!t || !t[key]) continue;
        const r = parseConfiguredCommand(t[key]);
        if (!r.ok) rejected.push(`${lang}.${key} "${t[key]}" — ${r.reason}`);
      }
    }
    assert.deepEqual(rejected, [], `detected commands must all parse; rejected: ${rejected.join(' | ')}`);
  });
});
