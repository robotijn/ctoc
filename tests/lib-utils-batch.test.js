/**
 * Contract tests for five previously-untested lib modules.
 *
 * Modules under test:
 *   - src/lib/staged-files.js     (git staged-file utilities)
 *   - src/lib/tool-detector.js    (language/test-framework detection)
 *   - src/lib/time-source.js      (clock-provenance metadata)
 *   - src/lib/metrics-loop.js     (manufacturing-grade pipeline metrics)
 *   - src/lib/upgrade-planner.js  (quality-mode upgrade roadmaps)
 *
 * Style: node:test + node:assert/strict. Filesystem/git tests use hermetic
 * temp directories (mkdtempSync -> realpathSync) and clean up afterEach.
 * Tests assert the DOCUMENTED contract (JSDoc/header). Where the code
 * contradicts its documented intent, the test is left failing on purpose and
 * the contradiction is reported — never weakened to pass.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const toolDetector = require('../src/lib/tool-detector');

// ---------------------------------------------------------------------------
// Shared temp-dir helpers (hermetic; realpath resolves macOS /var -> /private)
// ---------------------------------------------------------------------------

function makeTempDir(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

function rmTempDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

function writeFile(root, rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

describe('tool-detector', () => {
  let proj;

  beforeEach(() => {
    proj = makeTempDir('ctoc-tools-');
  });

  afterEach(() => {
    if (proj) rmTempDir(proj);
    proj = undefined;
  });

  describe('constants', () => {
    it('exposes DEFAULT_TOOLS and LANGUAGE_MARKERS', () => {
      assert.equal(toolDetector.DEFAULT_TOOLS.javascript.lint, 'eslint .');
      assert.equal(toolDetector.DEFAULT_TOOLS.typescript.typecheck, 'tsc --noEmit');
      assert.deepEqual(toolDetector.LANGUAGE_MARKERS.go, ['go.mod', 'go.sum']);
    });
  });

  describe('detectLanguages', () => {
    it('detects JS from package.json (and TS, since package.json is a TS marker too)', () => {
      // Per LANGUAGE_MARKERS, package.json is the first marker for BOTH
      // javascript and typescript; the inner loop breaks on first match, so a
      // bare package.json legitimately matches both languages. Documented intent.
      writeFile(proj, 'package.json', '{}');
      const langs = toolDetector.detectLanguages(proj);
      assert.ok(langs.includes('javascript'));
      assert.ok(langs.includes('typescript'));
    });

    it('detects both JS and TS when tsconfig is present (and dedupes)', () => {
      writeFile(proj, 'package.json', '{}');
      writeFile(proj, 'tsconfig.json', '{}');
      const langs = toolDetector.detectLanguages(proj);
      assert.ok(langs.includes('javascript'));
      assert.ok(langs.includes('typescript'));
      // Deduped: each language appears once.
      assert.equal(new Set(langs).size, langs.length);
    });

    it('detects csharp via glob marker (*.csproj)', () => {
      writeFile(proj, 'App.csproj', '<Project/>');
      assert.ok(toolDetector.detectLanguages(proj).includes('csharp'));
    });

    it('returns [] for an empty project', () => {
      assert.deepEqual(toolDetector.detectLanguages(proj), []);
    });
  });

  describe('detectJsTestFramework', () => {
    it('returns null when no package.json exists', () => {
      assert.equal(toolDetector.detectJsTestFramework(proj), null);
    });

    it('detects jest from scripts.test', () => {
      writeFile(proj, 'package.json', JSON.stringify({ scripts: { test: 'jest --ci' } }));
      assert.equal(toolDetector.detectJsTestFramework(proj), 'jest');
    });

    it('detects vitest from devDependencies', () => {
      writeFile(proj, 'package.json', JSON.stringify({ devDependencies: { vitest: '^1.0.0' } }));
      assert.equal(toolDetector.detectJsTestFramework(proj), 'vitest');
    });

    it('returns null on malformed package.json (never throws)', () => {
      writeFile(proj, 'package.json', '{ not valid json');
      assert.equal(toolDetector.detectJsTestFramework(proj), null);
    });
  });

  describe('detectPythonTestFramework', () => {
    it('detects pytest from pyproject.toml', () => {
      writeFile(proj, 'pyproject.toml', '[tool.pytest.ini_options]\n');
      assert.equal(toolDetector.detectPythonTestFramework(proj), 'pytest');
    });

    it('detects pytest from pytest.ini when no pyproject', () => {
      writeFile(proj, 'pytest.ini', '[pytest]\n');
      assert.equal(toolDetector.detectPythonTestFramework(proj), 'pytest');
    });

    it('returns null when no python test config is present', () => {
      assert.equal(toolDetector.detectPythonTestFramework(proj), null);
    });
  });

  describe('commandExists', () => {
    it('returns true for a ubiquitous command (node)', () => {
      assert.equal(toolDetector.commandExists('node'), true);
    });

    it('returns false for a nonexistent command (never throws)', () => {
      assert.equal(
        toolDetector.commandExists('definitely-not-a-real-binary-xyzzy'),
        false
      );
    });
  });

  describe('getInstallCommand', () => {
    it('returns a known install command', () => {
      assert.equal(toolDetector.getInstallCommand('eslint', 'javascript'), 'npm install -D eslint');
    });

    it('falls back to a descriptive string for unknown tool/language', () => {
      assert.equal(
        toolDetector.getInstallCommand('frobnicator', 'haskell'),
        'Install frobnicator for haskell'
      );
    });
  });

  describe('detectTools (hybrid)', () => {
    it('returns the documented result shape for a JS project', () => {
      writeFile(proj, 'package.json', JSON.stringify({ devDependencies: { vitest: '^1.0.0' } }));
      const res = toolDetector.detectTools(proj);
      assert.ok(Array.isArray(res.languages));
      assert.ok(res.languages.includes('javascript'));
      assert.equal(typeof res.tools, 'object');
      assert.ok(Array.isArray(res.missing));
      assert.equal(typeof res.source, 'string');
      // JS test framework detected => tools.javascript.testFramework set.
      assert.equal(res.tools.javascript.testFramework, 'vitest');
    });

    it('flags needsUserInput when no languages are detected', () => {
      const res = toolDetector.detectTools(proj);
      assert.deepEqual(res.languages, []);
      assert.equal(res.source, 'unknown');
      assert.equal(res.needsUserInput, true);
    });
  });

  describe('printDetectionResults', () => {
    it('does not throw on a minimal results object', () => {
      assert.doesNotThrow(() =>
        toolDetector.printDetectionResults({
          source: 'auto-detect',
          languages: [],
          tools: {},
          missing: [],
        })
      );
    });
  });
});

// ===========================================================================
// 3. time-source.js
//
// Exact API:
//   KNOWN_SOURCES (['system','ntp','ptp','unknown'])
//   currentTimeSource() -> structured record (never throws)
//   recordIntoDispatch(dispatch) -> dispatch (mutated, preserves existing)
//   readClockSourcePosture(projectRoot) -> object|null
//   evaluateComplianceAgainstPosture(projectRoot, observed?) -> verdict
//   parseChronycTracking(text) -> object
//   chronyOffsetToMs(value) -> number|null
//   looksLikePtpBacked(fields, chronyConf) -> boolean
// ===========================================================================

