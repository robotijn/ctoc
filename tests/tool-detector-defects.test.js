'use strict';

/**
 * tool-detector — confirmed SEVERE defect repairs (TDD-red-first).
 *
 * Every case builds a REAL project dir on disk and drives the REAL detector. Nothing
 * is mocked. These prove nine execution-confirmed defects are fixed:
 *
 *   1  RCE — a hostile capability override `cmd` with a shell metacharacter payload
 *      must NOT execute during detectTools (argv-safe lookup, no shell).
 *   2  Playwright  — `npx playwright test`, never bare `npx playwright` (runs zero tests).
 *   3  vitest      — `npx vitest run`, never bare `npx vitest` (watches forever).
 *   4  phantom TS  — a pure-JS repo (no tsconfig, no .ts) gets NO typescript toolchain.
 *   5  mocha       — coverage is a valid `npx nyc` form, never the invalid `--coverage` flag.
 *   6  no script   — a repo with no test script is surfaced UNDETERMINED, not `npm test`.
 *   7  gradlew     — a project-local ./gradlew is resolved against the project, not PATH.
 *   8  user-config — an explicit override is APPLIED; source is not falsely 'user-config'.
 *   9  install hint— names the real tool (gradle), not the launcher (./gradlew / npx).
 *
 * Plus the R10-regression repairs (Findings A/B/C):
 *   B  framework devDep — a framework-only repo emits `npx <framework> <subcommand>`
 *      (resolves node_modules/.bin, keeps the watch-hang-avoiding subcommand) and is
 *      NOT falsely reported missing.
 *   C  tab-indent    — a TAB-indented quality-config `languages:` block is dropped by the
 *      space-only indent reader, but now surfaces a WARNING (never silently ignored).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const toolDetector = require('../src/lib/tool-detector');

function makeProject(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}
function write(dir, rel, body) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

// ── DEFECT 1: a missing/unreadable project path must not throw ─────────────────────
// The glob branch of detectLanguagesLegacy read the project dir with an UNGUARDED
// readdirSync. On a missing (ENOENT) or unreadable (EACCES) path the exception escaped
// detectTools, so the module's DESIGNED empty-result path (source:'unknown' +
// needsUserInput:true) was never reached — unlike every sibling readdir in the codebase.
describe('tool-detector: a missing project path yields the empty/needsUserInput result, never throws', () => {
  it('detectTools on a NON-EXISTENT path returns source:unknown + needsUserInput, does not throw', () => {
    const missing = path.join(os.tmpdir(), `ctoc-td-missing-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    assert.equal(fs.existsSync(missing), false, 'precondition: the path must not exist');
    let res;
    assert.doesNotThrow(() => { res = toolDetector.detectTools(missing); },
      'detectTools must not let an ENOENT from the glob readdir escape');
    assert.deepEqual(res.languages, [], 'no languages detected on a missing path');
    assert.equal(res.source, 'unknown', 'the designed empty-result path sets source:unknown');
    assert.equal(res.needsUserInput, true, 'the designed empty-result path flags needsUserInput');
  });

  it('detectLanguages on a NON-EXISTENT path returns [] rather than throwing', () => {
    const missing = path.join(os.tmpdir(), `ctoc-td-missing2-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    let langs;
    assert.doesNotThrow(() => { langs = toolDetector.detectLanguages(missing); },
      'detectLanguages must not let an ENOENT from the glob readdir escape');
    assert.deepEqual(langs, [], 'a missing path detects no languages');
  });
});

// ── Finding 1: RCE during detection ──────────────────────────────────────────────
describe('tool-detector: a hostile capability override cmd is NEVER shell-executed (Finding 1)', () => {
  it('a `cmd` with a shell metacharacter payload runs NO side-effect during detectTools', () => {
    const dir = makeProject('ctoc-td-rce-');
    try {
      const sentinel = path.join(dir, 'PWNED');
      // Space-free payload: `which zzz` fails, then `|| touch $IFS<sentinel>` would run
      // ONLY if the string is handed to a shell. `$IFS` expands to whitespace so the
      // shell word-splits `touch` from the path. With argv-safe execFile there is no
      // shell, so `zzz||touch$IFS…` is one inert argv token that simply is-not-found.
      const payload = `zzz||touch$IFS${sentinel}`;
      write(dir, path.join('.ctoc', 'capabilities', 'languages', 'pwnlang.yaml'),
        [
          'language: pwnlang',
          'detectionMarkers: [pwn.marker]',
          'toolchain:',
          `  test: { cmd: "${payload}", tool: zzz }`,
          ''
        ].join('\n'));
      write(dir, 'pwn.marker', '');

      const res = toolDetector.detectTools(dir);

      assert.ok(res.languages.includes('pwnlang'), 'the override language must be detected');
      // THE security assertion: the payload must not have executed.
      assert.equal(fs.existsSync(sentinel), false,
        'detectTools must NOT execute a capability cmd — the payload created a file (RCE)');
      // The cmd is reported as inert DATA, verbatim — never interpreted.
      assert.equal(res.tools.pwnlang.test, payload,
        'the hostile cmd must be surfaced as an inert string, not run');
    } finally { rm(dir); }
  });
});

// ── Findings 2,3,5,6: correct JS/TS test + coverage commands ──────────────────────
describe('tool-detector: JS/TS test commands are correct, not broken `npx <fw>` (Findings 2,3,5,6)', () => {
  it('a Playwright repo → `playwright test`, never bare `npx playwright` (Finding 2)', () => {
    const dir = makeProject('ctoc-td-pw-');
    try {
      write(dir, 'package.json', JSON.stringify({ devDependencies: { '@playwright/test': '^1.44.0' } }));
      const res = toolDetector.detectTools(dir);
      const js = res.tools.javascript;
      assert.equal(js.test, 'npx playwright test', 'Playwright test command must actually run tests, launched via npx (resolves node_modules/.bin)');
      assert.notEqual(js.test, 'npx playwright', 'must NOT be bare `npx playwright` (runs zero tests)');
      assert.notEqual(js.test, 'playwright test', 'must NOT be bare `playwright test` (a devDep is not on PATH)');
      assert.equal(js.coverage, null, 'Playwright has no coverage mode — emit nothing, never an invalid `--coverage`');
    } finally { rm(dir); }
  });

  it('a vitest repo → `vitest run` (+ `vitest run --coverage`), never `npx vitest` (Finding 3)', () => {
    const dir = makeProject('ctoc-td-vt-');
    try {
      write(dir, 'package.json', JSON.stringify({ devDependencies: { vitest: '^2.0.0' } }));
      const res = toolDetector.detectTools(dir);
      const js = res.tools.javascript;
      assert.equal(js.test, 'npx vitest run', 'vitest test command must be `npx vitest run`, not watch mode');
      assert.notEqual(js.test, 'npx vitest', 'bare `npx vitest` enters watch mode and never exits');
      assert.notEqual(js.test, 'vitest run', 'must NOT be bare `vitest run` (a devDep is not on PATH)');
      assert.equal(js.coverage, 'npx vitest run --coverage', 'vitest coverage must be `npx vitest run --coverage`');
    } finally { rm(dir); }
  });

  it('a mocha repo → coverage is a valid nyc form, never the invalid `--coverage` flag (Finding 5)', () => {
    const dir = makeProject('ctoc-td-mo-');
    try {
      write(dir, 'package.json', JSON.stringify({ devDependencies: { mocha: '^10.0.0' } }));
      const res = toolDetector.detectTools(dir);
      const js = res.tools.javascript;
      assert.equal(js.test, 'npx mocha', 'mocha test command must be `npx mocha`');
      assert.equal(js.coverage, 'npx nyc mocha', 'mocha coverage must be `npx nyc mocha`, not an invalid flag');
      assert.notEqual(js.coverage, 'npx mocha --coverage', '`mocha --coverage` is an invalid flag');
    } finally { rm(dir); }
  });

  it('a JS repo with no test script AND no framework is surfaced UNDETERMINED, not `npm test` (Finding 6)', () => {
    const dir = makeProject('ctoc-td-undet-');
    try {
      write(dir, 'package.json', '{}');
      const res = toolDetector.detectTools(dir);
      const js = res.tools.javascript;
      assert.equal(js.test, null, 'an undetermined test command must be null, not a plausible-but-wrong guess');
      assert.notEqual(js.test, 'npm test', 'must NOT assert `npm test` (errors: Missing script: test)');
      assert.equal(js.testUndetermined, true, 'the undetermined state must be surfaced honestly');
    } finally { rm(dir); }
  });

  it('a JS repo with an explicit scripts.test uses it VERBATIM', () => {
    const dir = makeProject('ctoc-td-script-');
    try {
      write(dir, 'package.json', JSON.stringify({ scripts: { test: 'node --test' } }));
      const res = toolDetector.detectTools(dir);
      assert.equal(res.tools.javascript.test, 'node --test', 'a declared test script must be used verbatim');
    } finally { rm(dir); }
  });
});

// ── Finding 4: no phantom typescript toolchain ────────────────────────────────────
describe('tool-detector: a pure-JS repo gets NO phantom typescript toolchain (Finding 4)', () => {
  it('no tsconfig.json and no .ts files → res.tools has no typescript entry / no `tsc --noEmit`', () => {
    const dir = makeProject('ctoc-td-nots-');
    try {
      write(dir, 'package.json', JSON.stringify({ devDependencies: { jest: '^29.0.0' } }));
      const res = toolDetector.detectTools(dir);
      assert.ok(res.tools.javascript, 'javascript toolchain must be present');
      assert.equal('typescript' in res.tools, false,
        'a pure-JS repo must NOT get a phantom typescript toolchain');
    } finally { rm(dir); }
  });

  it('a real TS repo (tsconfig.json) STILL gets a typescript toolchain', () => {
    const dir = makeProject('ctoc-td-ts-');
    try {
      write(dir, 'package.json', '{}');
      write(dir, 'tsconfig.json', '{}');
      const res = toolDetector.detectTools(dir);
      assert.ok(res.tools.typescript, 'a tsconfig.json project must keep its typescript toolchain');
      assert.equal(res.tools.typescript.typecheck, 'tsc --noEmit', 'real TS typecheck comes from the registry');
    } finally { rm(dir); }
  });
});

// ── Finding 7: project-local gradlew resolution ───────────────────────────────────
describe('tool-detector: a project-local gradlew is resolved against the project, not PATH (Finding 7)', () => {
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

  it('a Gradle project WITH an executable gradlew does not report its test command missing', () => {
    const dir = makeProject('ctoc-td-gradlew-');
    try {
      write(dir, 'build.gradle', "plugins { id 'java' }\n");
      write(dir, 'gradlew', '#!/bin/sh\necho gradlew\n');
      write(dir, 'gradlew.bat', '@echo off\r\n');
      try { fs.chmodSync(path.join(dir, 'gradlew'), 0o755); } catch { /* non-posix */ }
      const res = toolDetector.detectTools(dir);
      const testCmd = `${gradlew} test`;
      assert.equal(res.missing.some((m) => m.command === testCmd), false,
        'a real project-local gradlew must NOT be reported missing');
    } finally { rm(dir); }
  });
});

// ── Finding 8: user-config override is applied / not falsely claimed ───────────────
describe('tool-detector: user quality-config overrides are applied honestly (Finding 8)', () => {
  it('an explicit languages.<lang> override is APPLIED and source becomes user-config', () => {
    const dir = makeProject('ctoc-td-usercfg-');
    try {
      write(dir, 'package.json', '{}');
      write(dir, path.join('.ctoc', 'quality-config.yaml'),
        [
          'languages:',
          '  javascript:',
          '    test: my-runner --all',
          '    coverage: my-runner --all --coverage',
          ''
        ].join('\n'));
      const res = toolDetector.detectTools(dir);
      assert.equal(res.tools.javascript.test, 'my-runner --all', 'the user test override must be applied');
      assert.equal(res.tools.javascript.coverage, 'my-runner --all --coverage', 'the user coverage override must be applied');
      assert.equal(res.source, 'user-config', 'source must be user-config when an override actually took effect');
    } finally { rm(dir); }
  });

  it('a config that overrides no detected language does NOT falsely claim source=user-config', () => {
    const dir = makeProject('ctoc-td-usercfg-noop-');
    try {
      write(dir, 'pyproject.toml', '[tool.pytest.ini_options]\n');
      write(dir, path.join('.ctoc', 'quality-config.yaml'),
        ['languages:', '  javascript:', '    test: my-runner --all', ''].join('\n'));
      const res = toolDetector.detectTools(dir);
      assert.notEqual(res.source, 'user-config',
        'source must not claim user-config when no override applied to a detected language');
    } finally { rm(dir); }
  });
});

// ── Finding 9: install hint names the real tool ───────────────────────────────────
describe('tool-detector: an install hint names the real tool, not the launcher (Finding 9)', () => {
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

  it('a missing Gradle test command hints `gradle`, never `./gradlew`', () => {
    const dir = makeProject('ctoc-td-hint-');
    try {
      write(dir, 'build.gradle', "plugins { id 'java' }\n");
      // No gradlew file → the gradle commands are genuinely missing → an install hint is produced.
      const res = toolDetector.detectTools(dir);
      const entry = res.missing.find((m) => m.command === `${gradlew} test`);
      assert.ok(entry, 'the missing gradle test command must be present to check its hint');
      assert.equal(entry.install, 'Install gradle for java', 'the hint must name the real tool (gradle)');
      assert.equal(entry.install.includes('gradlew'), false, 'the hint must not name the launcher (./gradlew)');
    } finally { rm(dir); }
  });
});

// ── Finding B: framework devDep resolves via npx and is not falsely missing ────────
describe('tool-detector: a framework devDep (no scripts.test) resolves via npx, not falsely missing (Finding B)', () => {
  it('a vitest devDep → `npx vitest run`, launched via npx, and NOT reported missing', () => {
    const dir = makeProject('ctoc-td-npx-vt-');
    try {
      write(dir, 'package.json', JSON.stringify({ devDependencies: { vitest: '^2.0.0' } }));
      const res = toolDetector.detectTools(dir);
      const js = res.tools.javascript;
      // The framework runner must be launched via npx (resolves node_modules/.bin), which a
      // bare `vitest run` cannot — a devDep is not on PATH, so `which vitest` / execSync
      // both fail. The `run` subcommand is preserved so the watch-hang stays avoided.
      assert.equal(js.test, 'npx vitest run', 'framework test must be `npx vitest run`');
      assert.notEqual(js.test, 'vitest run', 'must NOT be a bare `vitest run` (devDep not on PATH → "command not found")');
      assert.notEqual(js.test, 'npx vitest', 'must keep the `run` subcommand (bare `npx vitest` watch-hangs)');
      // `which npx` resolves (npx ships with npm), so an npx-launched framework is NOT
      // reported missing — the R10 regression told the human to install what was installed.
      assert.equal(
        res.missing.some((m) => m.command === js.test), false,
        `an npx-launched framework must NOT be reported missing; missing=${JSON.stringify(res.missing)}`
      );
    } finally { rm(dir); }
  });

  it('a jest devDep → `npx jest` (+ `npx jest --coverage`), launched via npx', () => {
    const dir = makeProject('ctoc-td-npx-jest-');
    try {
      write(dir, 'package.json', JSON.stringify({ devDependencies: { jest: '^29.0.0' } }));
      const res = toolDetector.detectTools(dir);
      const js = res.tools.javascript;
      assert.equal(js.test, 'npx jest', 'jest test must be launched via npx');
      assert.equal(js.coverage, 'npx jest --coverage', 'jest coverage must be `npx jest --coverage`');
    } finally { rm(dir); }
  });
});

// ── Finding C: a tab-indented quality-config languages block warns ─────────────────
describe('tool-detector: a tab-indented quality-config languages block WARNS, not silently dropped (Finding C)', () => {
  it('a TAB-indented languages override surfaces a warning in the detection result', () => {
    const dir = makeProject('ctoc-td-tab-');
    try {
      write(dir, 'package.json', '{}');
      // TAB indentation (YAML requires SPACES). The space-only indent reader drops the
      // block silently — source stays 'auto-detect' with no signal to the user.
      write(dir, path.join('.ctoc', 'quality-config.yaml'),
        ['languages:', '\tjavascript:', '\t\ttest: my-runner --all', ''].join('\n'));
      const res = toolDetector.detectTools(dir);
      assert.ok(Array.isArray(res.warnings), 'detectTools must expose a warnings array');
      assert.ok(
        res.warnings.some((w) => /tab/i.test(w.message) && /(ignored|dropped)/i.test(w.message)),
        `a tab-indented override must surface a warning; got ${JSON.stringify(res.warnings)}`
      );
    } finally { rm(dir); }
  });

  it('a correctly SPACE-indented config produces NO tab warning (precise, not noisy)', () => {
    const dir = makeProject('ctoc-td-tab-ok-');
    try {
      write(dir, 'package.json', '{}');
      write(dir, path.join('.ctoc', 'quality-config.yaml'),
        ['languages:', '  javascript:', '    test: my-runner --all', ''].join('\n'));
      const res = toolDetector.detectTools(dir);
      assert.ok(
        !(res.warnings || []).some((w) => /tab/i.test(w.message)),
        `a space-indented config must not warn about tabs; got ${JSON.stringify(res.warnings)}`
      );
      // And the space-indented override still applies (no regression).
      assert.equal(res.tools.javascript.test, 'my-runner --all', 'the space-indented override still applies');
    } finally { rm(dir); }
  });
});
