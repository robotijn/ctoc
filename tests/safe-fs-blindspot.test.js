'use strict';

/**
 * LH1 — safe-fs blind-spot guard.
 *
 * eslint-plugin-security's `detect-non-literal-fs-filename` rule only flags the
 * fs methods listed in its `fsFunctionData.json`. Several path-taking fs methods
 * are NOT on that list — notably `rmSync`, `cpSync`, `rm`, `cp`, `mkdtemp`,
 * `opendir`, and `access`/`accessSync`. A computed-path call to one of these
 * would therefore BYPASS the lint gate AND skip the safe-fs choke point (no path
 * validation, no fail-closed) — exactly the class of hole the LH1 choke-point
 * strategy exists to close.
 *
 * This test pins that blind spot to ZERO: no raw `fs.<blindspot>(...)` call on a
 * NON-literal argument may exist anywhere under src/ except safe-fs.js itself
 * (the sole audited wrapper). It is a plain regex scan over file contents — no
 * eslint dependency — so it holds even if the plugin's coverage list drifts.
 *
 * Currently there are zero such uses; this test locks that in. To add one, route
 * it through safe-fs.js (or add a literal-only, human-reviewed exception here).
 *
 * Cross-platform: pure fs.readdir + string scan, path.join for all paths.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC_DIR = path.join(__dirname, '..', 'src');
const SAFE_FS = path.join(SRC_DIR, 'lib', 'safe-fs.js');

// fs methods that take a path but are NOT flagged by eslint-plugin-security.
const BLINDSPOT = ['rmSync', 'cpSync', 'rm', 'cp', 'mkdtemp', 'mkdtempSync', 'opendir', 'opendirSync', 'access', 'accessSync'];

// Match `fs.<method>(` or `fsp.<method>(` etc. The first argument is captured up
// to the first `,` or `)`; a call is a violation only when that argument is NOT a
// string/template literal (i.e. it references a variable / computed path).
function scanFile(contents) {
  const violations = [];
  // \b(?:fs|fsp|fsPromises)\.(method)\s*\(  — then capture the first arg token.
  const methodAlt = BLINDSPOT.join('|');
  const re = new RegExp('\\b(?:fs|fsp|fsPromises|fsync)\\.(' + methodAlt + ')\\s*\\(\\s*([^,)]*)', 'g');
  let m;
  while ((m = re.exec(contents)) !== null) {
    const method = m[1];
    const firstArg = m[2].trim();
    if (firstArg === '') continue;                       // e.g. fs.rm() with no arg — not a path call
    const isStringLiteral = /^(['"`])/.test(firstArg);   // 'x' | "x" | `x`
    const isNumericFd = /^\d+$/.test(firstArg);          // file-descriptor, not a path
    if (!isStringLiteral && !isNumericFd) {
      violations.push(`fs.${method}(${firstArg}…)`);
    }
  }
  return violations;
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
}

describe('safe-fs blind-spot guard (unflagged fs methods)', () => {
  it('no raw non-literal fs.<blindspot>(...) call exists in src/ outside safe-fs.js', () => {
    const files = [];
    walk(SRC_DIR, files);
    assert.ok(files.length > 0, 'expected to scan at least one src/ file');

    const offenders = [];
    for (const file of files) {
      if (path.resolve(file) === path.resolve(SAFE_FS)) continue; // sole audited wrapper
      const violations = scanFile(fs.readFileSync(file, 'utf8'));
      if (violations.length) {
        offenders.push(`${path.relative(SRC_DIR, file)}: ${violations.join(', ')}`);
      }
    }

    assert.deepEqual(
      offenders,
      [],
      'Unflagged fs methods on computed paths bypass BOTH the lint gate and safe-fs. ' +
      'Route these through src/lib/safe-fs.js:\n  ' + offenders.join('\n  ')
    );
  });

  it('the guard actually detects a violation (self-test, no false-green)', () => {
    // Sanity: a synthetic computed-path call MUST be flagged, and a literal one MUST NOT.
    assert.deepEqual(scanFile('fs.rmSync(computedPath, { recursive: true });'), ['fs.rmSync(computedPath…)']);
    assert.deepEqual(scanFile("fs.rmSync('literal/path');"), []);
    assert.deepEqual(scanFile('fs.accessSync(userInput);'), ['fs.accessSync(userInput…)']);
  });
});
