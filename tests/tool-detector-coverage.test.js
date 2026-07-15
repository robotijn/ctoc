'use strict';

/**
 * tool-detector — DARK-branch coverage (mutation-first).
 *
 * Sibling of tool-detector-defects.test.js and tool-detector-registry.test.js; this file
 * deliberately targets the branches those two leave dark, WITHOUT re-testing any case they
 * already own. Every test here pins a decision that goes RED under a one-line mutation of
 * the production code — never a line-coverage-only "it returned an object" assertion.
 *
 * The through-line is HONESTY of detection:
 *   • a manifest/marker must map to the RIGHT tool (jest→jest, pytest.ini→pytest, …);
 *   • absence or a malformed/inconclusive probe must surface as UNDETERMINED / UNKNOWN /
 *     "no framework" — NEVER a fabricated tool the human would be told to run and that
 *     would then error;
 *   • a user override wins, an explicit `null` means "no command", and a quoted scalar is
 *     unquoted;
 *   • a broken config or malformed manifest degrades gracefully (no crash, no false claim).
 *
 * ZERO doubles of core logic. The only boundary touched is the filesystem — every case
 * builds a REAL temp project via os.tmpdir() and drives the REAL exported functions; each
 * dir is cleaned in `finally`. commandExists' `which`/`where` probe is exercised only where
 * its outcome is deterministic (a guaranteed-absent nonsense token), matching the existing
 * suites' real-subprocess pattern.
 *
 * DOCUMENTED UNREACHABLE (never fabricated a hit):
 *   • Lines 278-279 (hasTypeScriptEvidence `catch`): reached only if `readdirSync` throws on
 *     a directory that the SAME detectTools call already read successfully to detect
 *     `typescript`. The public API cannot emit that self-contradictory state, so the catch
 *     is unreachable without malformed internal state. Left uncovered by contract.
 *   • Lines 671-673 (the `require.main === module` CLI block): runs only when the file is the
 *     process entry point. Under `node --test` the module is `require`d, never `main`, so this
 *     block is structurally unreachable in-process. Spawning it as a child would not count
 *     toward this process's coverage. Left uncovered by contract.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const toolDetector = require('../src/lib/tool-detector');

// ── fixtures — real filesystem boundary only ─────────────────────────────────────
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
function mkdir(dir, rel) {
  fs.mkdirSync(path.join(dir, rel), { recursive: true });
}

// ═══════════════════════════════════════════════════════════════════════════════════
// Cluster A — detectJsTestFramework: a manifest maps to the RIGHT framework, absence/
// malformed maps to NONE. Kills mutants that swap a framework or fabricate one from junk.
// ═══════════════════════════════════════════════════════════════════════════════════
describe('detectJsTestFramework: scripts.test substring selects the correct framework', () => {
  // The scripts.test path (lines 131-138) — every branch, including `tap` which the
  // dependency table (141-145) deliberately does NOT check. One row per framework.
  const SCRIPT_ROWS = [
    { id: 'jest',   script: 'jest --ci',        expected: 'jest' },
    { id: 'vitest', script: 'vitest run',       expected: 'vitest' },
    { id: 'mocha',  script: 'mocha --recursive', expected: 'mocha' },
    { id: 'ava',    script: 'ava',              expected: 'ava' },
    { id: 'tap',    script: 'tap',              expected: 'tap' }
  ];

  for (const row of SCRIPT_ROWS) {
    it(`maps scripts.test "${row.script}" to ${row.expected} [${row.id}]`, () => {
      // Arrange
      const dir = makeProject(`ctoc-tdc-fw-${row.id}-`);
      try {
        write(dir, 'package.json', JSON.stringify({ scripts: { test: row.script } }));

        // Act
        const framework = toolDetector.detectJsTestFramework(dir);

        // Assert — the exact framework, not merely "truthy"
        assert.equal(framework, row.expected,
          `scripts.test "${row.script}" must resolve to ${row.expected}`);
      } finally { rm(dir); }
    });
  }
});

describe('detectJsTestFramework: dependency table and precedence', () => {
  it('resolves ava from devDependencies when no scripts.test is present', () => {
    // Arrange — dark branch: ava via deps (line 144), not via scripts
    const dir = makeProject('ctoc-tdc-depava-');
    try {
      write(dir, 'package.json', JSON.stringify({ devDependencies: { ava: '^6.0.0' } }));

      // Act
      const framework = toolDetector.detectJsTestFramework(dir);

      // Assert
      assert.equal(framework, 'ava', 'an ava devDependency must resolve to ava');
    } finally { rm(dir); }
  });

  it('lets scripts.test win over a conflicting dependency (scripts checked first)', () => {
    // Arrange — scripts says mocha, deps say jest: the scripts path returns FIRST.
    const dir = makeProject('ctoc-tdc-prec-');
    try {
      write(dir, 'package.json', JSON.stringify({
        scripts: { test: 'mocha' },
        devDependencies: { jest: '^29.0.0' }
      }));

      // Act
      const framework = toolDetector.detectJsTestFramework(dir);

      // Assert — a mutant that checks deps before scripts would return 'jest'
      assert.equal(framework, 'mocha', 'scripts.test must take precedence over dependencies');
    } finally { rm(dir); }
  });
});

describe('detectJsTestFramework: inconclusive inputs resolve to NO framework, never a guess', () => {
  it('returns null for a malformed (unparseable) package.json instead of throwing', () => {
    // Arrange — JSON.parse throws → the `catch` (lines 148-150) must return null.
    const dir = makeProject('ctoc-tdc-badjson-');
    try {
      write(dir, 'package.json', '{ this is : not json');

      // Act
      const framework = toolDetector.detectJsTestFramework(dir);

      // Assert — a mutant that lets the throw escape, or fabricates a framework, dies here
      assert.equal(framework, null, 'a malformed package.json must yield null, not a fabricated framework');
    } finally { rm(dir); }
  });

  it('returns null when there is no package.json at all', () => {
    // Arrange
    const dir = makeProject('ctoc-tdc-nopkg-');
    try {
      // Act
      const framework = toolDetector.detectJsTestFramework(dir);

      // Assert — the early guard (line 121)
      assert.equal(framework, null, 'no package.json must yield null');
    } finally { rm(dir); }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════
// Cluster B — Python framework detection: pytest.ini / setup.cfg / pyproject content
// each map to the RIGHT framework; an inconclusive file surfaces NO framework (undefined),
// never a fabricated 'pytest'. Reached through detectTools (the private detector is
// exercised via its public consumer). These are the dark 159-166 / 171-176 lines.
// ═══════════════════════════════════════════════════════════════════════════════════
describe('python framework detection: the right marker file selects the right framework', () => {
  it('detects pytest from a pytest.ini when there is no pyproject.toml', () => {
    // Arrange — python via setup.py; framework via pytest.ini (line 159)
    const dir = makeProject('ctoc-tdc-pyini-');
    try {
      write(dir, 'setup.py', 'from setuptools import setup\nsetup()\n');
      write(dir, 'pytest.ini', '[pytest]\naddopts = -q\n');

      // Act
      const res = toolDetector.detectTools(dir);

      // Assert
      assert.equal(res.tools.python.testFramework, 'pytest',
        'a pytest.ini must resolve the python framework to pytest');
    } finally { rm(dir); }
  });

  it('detects pytest from a setup.cfg [tool:pytest] section', () => {
    // Arrange — framework via setup.cfg marker (lines 161-162)
    const dir = makeProject('ctoc-tdc-cfgpytest-');
    try {
      write(dir, 'setup.py', 'x\n');
      write(dir, 'setup.cfg', '[tool:pytest]\naddopts = -q\n');

      // Act
      const res = toolDetector.detectTools(dir);

      // Assert
      assert.equal(res.tools.python.testFramework, 'pytest',
        'a setup.cfg [tool:pytest] section must resolve pytest');
    } finally { rm(dir); }
  });

  it('detects pytest from a pyproject.toml that names pytest without a [tool.pytest] table', () => {
    // Arrange — the SECOND `includes('pytest')` (line 171), reached only when the
    // `[tool.pytest` check (line 170) is false.
    const dir = makeProject('ctoc-tdc-pyprojdep-');
    try {
      write(dir, 'pyproject.toml', '[project]\ndependencies = ["pytest>=8"]\n');

      // Act
      const res = toolDetector.detectTools(dir);

      // Assert
      assert.equal(res.tools.python.testFramework, 'pytest',
        'a bare "pytest" mention in pyproject.toml must resolve pytest');
    } finally { rm(dir); }
  });

  it('detects unittest from a pyproject.toml [tool.unittest] table', () => {
    // Arrange — the unittest branch (line 172), reached only when neither pytest check hits.
    const dir = makeProject('ctoc-tdc-pyunit-');
    try {
      write(dir, 'pyproject.toml', '[tool.unittest]\nverbose = true\n');

      // Act
      const res = toolDetector.detectTools(dir);

      // Assert — a mutant collapsing this to 'pytest' or dropping it dies here
      assert.equal(res.tools.python.testFramework, 'unittest',
        'a [tool.unittest] table must resolve unittest, not pytest');
    } finally { rm(dir); }
  });
});

describe('python framework detection: inconclusive files surface NO framework, honestly', () => {
  it('surfaces no framework for a setup.cfg with no pytest section', () => {
    // Arrange — setup.cfg present but no [tool:pytest] → returns null (line 164)
    const dir = makeProject('ctoc-tdc-cfgnone-');
    try {
      write(dir, 'setup.py', 'x\n');
      write(dir, 'setup.cfg', '[metadata]\nname = demo\n');

      // Act
      const res = toolDetector.detectTools(dir);

      // Assert — python IS detected, but no framework must be claimed
      assert.ok(res.languages.includes('python'), 'python must still be detected');
      assert.equal('testFramework' in res.tools.python, false,
        'a setup.cfg without a pytest section must NOT fabricate a framework');
    } finally { rm(dir); }
  });

  it('surfaces no framework for a pyproject.toml that mentions neither pytest nor unittest', () => {
    // Arrange — the `return null` at line 173
    const dir = makeProject('ctoc-tdc-pyprojnone-');
    try {
      write(dir, 'pyproject.toml', '[build-system]\nrequires = ["setuptools"]\n');

      // Act
      const res = toolDetector.detectTools(dir);

      // Assert
      assert.equal('testFramework' in res.tools.python, false,
        'a pyproject.toml naming no framework must NOT fabricate one');
    } finally { rm(dir); }
  });

  it('degrades to no framework (no throw) when pyproject.toml is unreadable', () => {
    // Arrange — pyproject.toml is a DIRECTORY: existsSync is true (so we enter the try),
    // readFileSync throws EISDIR → the catch (lines 175-176) must return null, not crash.
    const dir = makeProject('ctoc-tdc-pyprojdir-');
    try {
      mkdir(dir, 'pyproject.toml');

      // Act
      const res = toolDetector.detectTools(dir);

      // Assert — no crash, python detected, no fabricated framework
      assert.ok(res.languages.includes('python'), 'python must be detected from the pyproject marker');
      assert.equal('testFramework' in res.tools.python, false,
        'an unreadable pyproject.toml must NOT fabricate a framework');
    } finally { rm(dir); }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════
// Cluster C — the HONESTY distinction: nothing detected → 'unknown'; a malformed manifest
// → 'undetermined', never a plausible-but-wrong command. Dark lines 616-618 + the two
// catch blocks (149-150, 296-297) that a malformed package.json trips at once.
// ═══════════════════════════════════════════════════════════════════════════════════
describe('detectTools honesty: an empty project is UNKNOWN and asks for input, never fabricates', () => {
  it('reports source=unknown and needsUserInput when no language is detected', () => {
    // Arrange — a truly empty project
    const dir = makeProject('ctoc-tdc-empty-');
    try {
      // Act
      const res = toolDetector.detectTools(dir);

      // Assert — the exact honest state (lines 616-618)
      assert.deepEqual(res.languages, [], 'no languages must be detected');
      assert.equal(res.source, 'unknown', 'source must be unknown, not auto-detect');
      assert.equal(res.needsUserInput, true, 'needsUserInput must be flagged so the human is asked');
      assert.deepEqual(res.tools, {}, 'no fabricated toolchains for an empty project');
    } finally { rm(dir); }
  });
});

describe('detectTools honesty: a malformed manifest is UNDETERMINED, never a wrong command', () => {
  it('surfaces test:null + testUndetermined for an unparseable package.json (never `npm test`)', () => {
    // Arrange — invalid JSON: detectJsTestFramework's catch AND readJsTestScript's catch
    // (lines 149-150 and 296-297) both fire; javascript is still detected via existsSync.
    const dir = makeProject('ctoc-tdc-jsbad-');
    try {
      write(dir, 'package.json', '{ "scripts": broken');

      // Act
      const res = toolDetector.detectTools(dir);

      // Assert — an unreadable manifest must yield an honest undetermined state
      assert.ok(res.languages.includes('javascript'), 'javascript is detected by file presence');
      assert.equal(res.tools.javascript.test, null,
        'an unparseable package.json must NOT produce a guessed test command');
      assert.equal(res.tools.javascript.testUndetermined, true,
        'the undetermined state must be surfaced, not hidden behind a plausible guess');
    } finally { rm(dir); }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════
// Cluster D — user quality-config override parsing edges: quoted scalar unquoting, an
// explicit `null` meaning "no command", the `detect:` container being ignored while the
// sibling scalar still applies, and a broken config degrading without a crash. Dark lines
// 345-346, 313-314, plus the testUndetermined-delete honesty (line 588).
// ═══════════════════════════════════════════════════════════════════════════════════
describe('user override parsing: quoted scalar is unquoted, explicit null means no command', () => {
  it('unquotes a "double-quoted" test override and treats coverage:null as no command', () => {
    // Arrange — starts undetermined (empty package.json), then the override lands.
    const dir = makeProject('ctoc-tdc-ovq-');
    try {
      write(dir, 'package.json', '{}');
      write(dir, path.join('.ctoc', 'quality-config.yaml'),
        [
          'languages:',
          '  javascript:',
          '    test: "runner --all"',
          '    coverage: null',
          ''
        ].join('\n'));

      // Act
      const res = toolDetector.detectTools(dir);
      const js = res.tools.javascript;

      // Assert — quoted value unquoted (lines 344-346); null → null (line 343);
      // once the user declares a test, the "undetermined" flag must be cleared (line 588).
      assert.equal(js.test, 'runner --all', 'a quoted scalar must be unquoted, not kept with quotes');
      assert.equal(js.coverage, null, 'coverage: null must mean an explicit no-command, not the registry default');
      assert.equal('testUndetermined' in js, false,
        'a user-declared test command must clear the undetermined flag');
      assert.equal(res.source, 'user-config', 'source must reflect the applied override');
    } finally { rm(dir); }
  });

  it('ignores a nested detect: container yet still applies the sibling scalar override', () => {
    // Arrange — `detect:` is a deeper container key that must NOT be read as a language or
    // phase; the sibling `test:` scalar under the same language must still apply.
    const dir = makeProject('ctoc-tdc-ovdetect-');
    try {
      write(dir, 'package.json', '{}');
      write(dir, path.join('.ctoc', 'quality-config.yaml'),
        [
          'languages:',
          '  javascript:',
          '    detect:',
          '      - foo.js',
          '    test: my-runner',
          ''
        ].join('\n'));

      // Act
      const res = toolDetector.detectTools(dir);

      // Assert — the container is skipped, the scalar wins
      assert.equal(res.tools.javascript.test, 'my-runner',
        'the sibling test scalar must apply despite the nested detect: container');
      assert.equal(res.source, 'user-config', 'the override must take effect');
    } finally { rm(dir); }
  });
});

describe('user override parsing: a broken config degrades gracefully', () => {
  it('does not crash or falsely claim user-config when quality-config.yaml is unreadable', () => {
    // Arrange — quality-config.yaml is a DIRECTORY: existsSync true (enter try), readFileSync
    // throws → readUserConfig catch (lines 313-314) returns null; detection continues normally.
    const dir = makeProject('ctoc-tdc-cfgdir-');
    try {
      write(dir, 'package.json', JSON.stringify({ scripts: { test: 'node --test' } }));
      mkdir(dir, path.join('.ctoc', 'quality-config.yaml'));

      // Act
      const res = toolDetector.detectTools(dir);

      // Assert — no crash, the declared script still wins, and no false user-config claim
      assert.equal(res.tools.javascript.test, 'node --test', 'detection must continue with the declared script');
      assert.notEqual(res.source, 'user-config',
        'an unreadable config applied no override, so source must NOT claim user-config');
    } finally { rm(dir); }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════
// Cluster E — TypeScript EVIDENCE via a real .ts source (line 276 true-return): a root
// .ts file legitimizes a typescript toolchain even without tsconfig.json. Complements the
// defects-suite case which only exercises the tsconfig.json path.
// ═══════════════════════════════════════════════════════════════════════════════════
describe('hasTypeScriptEvidence: a real .ts source legitimizes the typescript toolchain', () => {
  it('keeps a typescript toolchain when a root .ts file exists without a tsconfig.json', () => {
    // Arrange — package.json (legacy lists typescript) + a real index.ts, NO tsconfig.
    const dir = makeProject('ctoc-tdc-tsfile-');
    try {
      write(dir, 'package.json', '{}');
      write(dir, 'index.ts', 'export const x: number = 1;\n');

      // Act
      const res = toolDetector.detectTools(dir);

      // Assert — a mutant forcing the readdir evidence-scan to always-false would drop this
      assert.ok(res.tools.typescript, 'a real .ts source must keep the typescript toolchain');
      assert.equal(res.tools.typescript.typecheck, 'tsc --noEmit',
        'the typescript typecheck command must come from the registry');
    } finally { rm(dir); }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════
// Cluster F — printDetectionResults rendering (dark lines 626-656). A tool with a command
// is printed; a null-command phase is skipped; missing tools and config warnings render
// their sections. Console is captured; nothing is asserted about which real tools exist,
// except a guaranteed-absent token which deterministically renders the ❌ marker.
// ═══════════════════════════════════════════════════════════════════════════════════
describe('printDetectionResults: renders tools, missing hints, and warnings honestly', () => {
  function capture(fn) {
    const original = console.log;
    const lines = [];
    console.log = (...args) => { lines.push(args.join(' ')); };
    try { fn(); } finally { console.log = original; }
    return lines.join('\n');
  }

  it('prints commanded phases and their status, skips null-command phases, and lists missing + warnings', () => {
    // Arrange — a guaranteed-absent tool token so `commandExists` deterministically → ❌.
    const absent = 'ctoc-no-such-tool-zzq-9f3a1';
    const results = {
      source: 'auto-detect',
      languages: ['javascript'],
      tools: { javascript: { test: absent, lint: null } },
      missing: [{ tool: 'lint', language: 'javascript', install: 'npm install -D eslint' }],
      warnings: [{ message: 'tab-indented languages block was IGNORED', file: '/p/.ctoc/quality-config.yaml' }]
    };

    // Act
    const out = capture(() => toolDetector.printDetectionResults(results));

    // Assert — the commanded phase renders (with a deterministic ❌); the null phase does not;
    // the missing-tools and warnings sections both render their content.
    assert.match(out, new RegExp(`❌ test: ${absent.replace(/[-]/g, '\\-')}`),
      'a commanded, absent tool must render with the ❌ status marker');
    assert.equal(/lint:/.test(out), false, 'a null-command phase (lint) must be skipped, not printed');
    assert.match(out, /Missing tools/, 'the missing-tools section must render when missing is non-empty');
    assert.match(out, /npm install -D eslint/, 'the install hint must be printed');
    assert.match(out, /Config warnings/, 'the warnings section must render when warnings are present');
    assert.match(out, /tab-indented languages block was IGNORED/, 'the warning message must be printed');
  });

  it('omits the missing and warnings sections when there is nothing to report', () => {
    // Arrange — empty missing + empty warnings → both section guards are false.
    const results = {
      source: 'auto-detect',
      languages: ['python'],
      tools: { python: { test: 'pytest' } },
      missing: [],
      warnings: []
    };

    // Act
    const out = capture(() => toolDetector.printDetectionResults(results));

    // Assert — a mutant flipping either guard to always-render would add these headers
    assert.equal(/Missing tools/.test(out), false, 'no missing-tools header when missing is empty');
    assert.equal(/Config warnings/.test(out), false, 'no warnings header when warnings is empty');
    assert.match(out, /python:/, 'the language section still renders');
  });
});
