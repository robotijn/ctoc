'use strict';

/**
 * stop-test-gate-coverage.test.js
 *
 * NON-OBVIOUS coverage for src/hooks/stop-test-gate.js — the opt-in Stop hook
 * that runs the suite before allowing a "done". Every test here pins a branch
 * that goes RED under mutation of the production code; obvious happy-path echoes
 * are excluded (opuspack-hooks.test.js already crosses the npm-fallback path).
 *
 * Two layers:
 *   1. In-process unit tests of the EXPORTED pure helpers (readStopTestGate,
 *      readFailCount, writeFailCount, resolveTestCommand) — the enable/disable
 *      decision at the source, the loop-guard counter coercions, and the test-
 *      command resolution (glob expansion + npm fallback + win32).
 *   2. Subprocess tests of main()/isGateEnabled (unexported; only reachable via
 *      `require.main === module`). These FAKE the test-run boundary: the fixture
 *      project's `scripts.test` points at a trivial node script (empty file =
 *      green, process.exit(1) = red) so the hook's BLOCK-vs-ALLOW decision is
 *      what's exercised, deterministically — never the real heavy suite.
 *
 * All fixtures live under real os.tmpdir() and are removed in a finally/after.
 * Reviewed line-by-line by a human (Tijn) before commit.
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.join(__dirname, '..', 'src', 'hooks', 'stop-test-gate.js');
const mod = require(HOOK);

// ── fixture bookkeeping ──────────────────────────────────────────────────────
const TMP_DIRS = [];
function mkTmp(prefix) {
  // realpathSync so macOS /var -> /private/var symlink does not confuse
  // findProjectRoot's upward walk.
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  TMP_DIRS.push(d);
  return d;
}
after(() => {
  for (const d of TMP_DIRS) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  readStopTestGate — the source of the ENABLE (block-capable) vs DISABLE decision
//  Each row kills a distinct parsing mutant: the flat-YAML reader must accept
//  ONLY an exact-child `general.stopTestGate: true`.
// ═════════════════════════════════════════════════════════════════════════════

describe('readStopTestGate — enable decision (direct-child general.stopTestGate only)', () => {
  const ROWS = [
    { id: 'empty-string-is-off',              yaml: '',                                                    expected: false },
    { id: 'whitespace-only-falls-through',    yaml: '\n   \n\t\n',                                          expected: false },
    { id: 'direct-child-true-enables',        yaml: 'general:\n  stopTestGate: true\n',                    expected: true  },
    { id: 'direct-child-false-disables',      yaml: 'general:\n  stopTestGate: false\n',                   expected: false },
    { id: 'quoted-true-enables',              yaml: 'general:\n  stopTestGate: "true"\n',                  expected: true  },
    { id: 'single-quoted-true-enables',       yaml: "general:\n  stopTestGate: 'true'\n",                  expected: true  },
    // yaml-truthy strings that are NOT exactly "true" must stay OFF (the === 'true' operand)
    { id: 'yes-is-not-true',                  yaml: 'general:\n  stopTestGate: yes\n',                     expected: false },
    { id: 'one-is-not-true',                  yaml: 'general:\n  stopTestGate: 1\n',                       expected: false },
    // wrong section — the section === 'general' guard
    { id: 'other-section-ignored',            yaml: 'other:\n  stopTestGate: true\n',                      expected: false },
    // deeper than direct child — the indent === childIndent guard
    { id: 'nested-submap-ignored',            yaml: 'general:\n  sub:\n    stopTestGate: true\n',          expected: false },
    // childIndent is fixed by the FIRST nested key; a shallower stopTestGate is not a child
    { id: 'shallower-than-first-child-ignored', yaml: 'general:\n    first: 1\n  stopTestGate: true\n',    expected: false },
    // a full-line comment is stripped to empty and skipped (comment-strip + blank-skip)
    { id: 'comment-only-line-skipped',        yaml: 'general:\n  # stopTestGate: true\n',                  expected: false },
    // trailing inline comment is stripped, value survives
    { id: 'trailing-comment-stripped',        yaml: 'general:\n  stopTestGate: true   # backstop on\n',   expected: true  },
    // a non key:value line (list item) hits the `!m` continue; the later gate still matches
    { id: 'list-line-continues-then-matches', yaml: 'general:\n  - item\n  stopTestGate: true\n',         expected: true  },
    // section switch: a preceding unrelated section then general resets section/childIndent
    { id: 'section-switch-then-general',      yaml: 'foo:\n  a: 1\ngeneral:\n  stopTestGate: true\n',      expected: true  },
    // returns on FIRST match; a later top-level section does not override
    { id: 'first-match-wins',                 yaml: 'general:\n  stopTestGate: true\nother:\n  x: 1\n',    expected: true  },
    // tab-indented direct child still resolves
    { id: 'tab-indent-direct-child',          yaml: 'general:\n\tstopTestGate: true\n',                    expected: true  },
  ];
  for (const r of ROWS) {
    test(`should_return_${r.expected}_when_${r.id}`, () => {
      assert.equal(mod.readStopTestGate(r.yaml), r.expected);
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  readFailCount — loop-guard counter; every non-integer shape coerces to 0
//  so the guard can never trip on corrupt state.
// ═════════════════════════════════════════════════════════════════════════════

describe('readFailCount — integer-only counter, else 0', () => {
  function seed(value /* string written to the counter file, or undefined to omit */) {
    const root = mkTmp('stg-rfc-');
    fs.mkdirSync(path.join(root, '.ctoc', 'state'), { recursive: true });
    if (value !== undefined) {
      fs.writeFileSync(path.join(root, '.ctoc', 'state', '.test-gate-fails'), value);
    }
    return root;
  }

  test('should_return_0_when_counter_file_absent', () => {
    assert.equal(mod.readFailCount(seed(undefined)), 0);
  });
  test('should_return_the_integer_when_fails_is_a_positive_int', () => {
    assert.equal(mod.readFailCount(seed(JSON.stringify({ fails: 5 }))), 5);
  });
  test('should_return_0_when_fails_is_a_numeric_string_not_an_int', () => {
    // Number.isInteger("3") === false → fallback 0 (not 3)
    assert.equal(mod.readFailCount(seed(JSON.stringify({ fails: '3' }))), 0);
  });
  test('should_return_0_when_fails_is_a_float', () => {
    assert.equal(mod.readFailCount(seed(JSON.stringify({ fails: 2.5 }))), 0);
  });
  test('should_return_0_when_fails_key_is_missing', () => {
    assert.equal(mod.readFailCount(seed(JSON.stringify({ other: 1 }))), 0);
  });
  test('should_return_0_when_counter_json_is_malformed', () => {
    // JSON.parse throws → catch → 0
    assert.equal(mod.readFailCount(seed('{ not json')), 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  writeFailCount — round-trips and is best-effort (swallows a write failure).
// ═════════════════════════════════════════════════════════════════════════════

describe('writeFailCount — persistence + best-effort swallow', () => {
  test('should_create_state_dir_and_roundtrip_through_readFailCount', () => {
    const root = mkTmp('stg-wfc-');
    // no .ctoc/state pre-created — writeFailCount must mkdir -p it
    mod.writeFailCount(root, 4);
    assert.equal(mod.readFailCount(root), 4);
  });

  test('should_swallow_and_not_throw_when_counter_path_is_unwritable', () => {
    const root = mkTmp('stg-wfc-bad-');
    // Make `.ctoc` a FILE so mkdirSync('.ctoc/state', {recursive}) throws ENOTDIR;
    // the catch must swallow (counter is best-effort) and readFailCount stays 0.
    fs.writeFileSync(path.join(root, '.ctoc'), 'i am a file, not a dir');
    assert.doesNotThrow(() => mod.writeFailCount(root, 9));
    assert.equal(mod.readFailCount(root), 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  resolveTestCommand — F6 resolution order: glob-expand CTOC self-suite ->
//  npm fallback -> null. The glob branch is DARK in the existing suite (which
//  only exercises the npm fallback).
// ═════════════════════════════════════════════════════════════════════════════

describe('resolveTestCommand — command resolution & glob expansion', () => {
  function proj({ scriptsTest, badPkg, testsFiles } = {}) {
    const d = mkTmp('stg-rtc-');
    if (badPkg) {
      fs.writeFileSync(path.join(d, 'package.json'), '{ this is not json');
    } else {
      const pkg = { name: 'fixture' };
      if (scriptsTest !== undefined) pkg.scripts = { test: scriptsTest };
      fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify(pkg));
    }
    if (testsFiles !== undefined) {
      fs.mkdirSync(path.join(d, 'tests'));
      for (const f of testsFiles) fs.writeFileSync(path.join(d, 'tests', f), '');
    }
    return d;
  }
  const GLOB = 'node --test tests/*.test.js';

  test('should_return_null_when_no_package_json', () => {
    assert.equal(mod.resolveTestCommand(mkTmp('stg-nopkg-')), null);
  });
  test('should_return_null_when_package_json_is_invalid_json', () => {
    // JSON.parse throws → pkg = null → no scripts.test → null
    assert.equal(mod.resolveTestCommand(proj({ badPkg: true })), null);
  });
  test('should_return_null_when_no_scripts_test', () => {
    assert.equal(mod.resolveTestCommand(proj({})), null);
  });

  test('should_expand_glob_to_execPath_argv_over_only_dot_test_dot_js_files', () => {
    const d = proj({ scriptsTest: GLOB, testsFiles: ['a.test.js', 'b.test.js', 'notes.txt'] });
    const res = mod.resolveTestCommand(d);
    assert.equal(res.cmd, process.execPath, 'glob path must run node directly (no shell)');
    assert.deepEqual(res.args, [
      '--test',
      path.join(d, 'tests', 'a.test.js'),
      path.join(d, 'tests', 'b.test.js'),
    ], 'only *.test.js files, absolute, npm/shell excluded; notes.txt filtered out');
  });

  test('should_return_null_when_glob_matches_zero_test_files', () => {
    // tests/ exists but has no *.test.js → files.length === 0 → null (gate N/A)
    const d = proj({ scriptsTest: GLOB, testsFiles: [] });
    assert.equal(mod.resolveTestCommand(d), null);
  });

  test('should_return_null_when_glob_and_tests_dir_missing', () => {
    // readdirSync throws (no tests/) → files = [] → length 0 → null
    const d = proj({ scriptsTest: GLOB /* no testsFiles → no tests dir */ });
    assert.equal(mod.resolveTestCommand(d), null);
  });

  test('should_fall_back_to_npm_test_silent_for_a_non_glob_script', () => {
    const res = mod.resolveTestCommand(proj({ scriptsTest: 'jest' }));
    const expectedCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    assert.equal(res.cmd, expectedCmd);
    assert.deepEqual(res.args, ['test', '--silent']);
  });

  test('should_resolve_npm_binary_per_platform_win32_vs_posix', () => {
    // Kill BOTH operands of `process.platform === 'win32' ? 'npm.cmd' : 'npm'`
    // by driving each platform value. process.platform override is a boundary
    // fake restored in finally.
    const d = proj({ scriptsTest: 'jest' });
    const orig = Object.getOwnPropertyDescriptor(process, 'platform');
    try {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      assert.equal(mod.resolveTestCommand(d).cmd, 'npm.cmd', 'win32 must use npm.cmd');
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      assert.equal(mod.resolveTestCommand(d).cmd, 'npm', 'posix must use bare npm');
    } finally {
      Object.defineProperty(process, 'platform', orig);
    }
    assert.notEqual(process.platform, 'win32', 'platform restored after test');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  main() / isGateEnabled — via subprocess (unexported; require.main === module).
//  The test-run boundary is FAKED: scripts.test points at a trivial node script.
//    exit 0 = green suite  ·  process.exit(1) = red suite.
//  Asserts the BLOCK (exit 2) vs ALLOW / fail-open (exit 0) decision.
// ═════════════════════════════════════════════════════════════════════════════

const STOP_STDIN = JSON.stringify({ hook_event_name: 'Stop' });

function runHook(cwd, { env = {}, stripPath = false } = {}) {
  const baseEnv = { ...process.env, ...env };
  // The OUTER runner is itself `node --test`; it exports NODE_TEST_CONTEXT /
  // NODE_OPTIONS, which would leak into the hook's faked `node --test fixture`
  // boundary and make that grandchild act as a child-reporter (exit 0) instead
  // of a standalone red suite. Strip them so the faked boundary is hermetic.
  delete baseEnv.NODE_TEST_CONTEXT;
  delete baseEnv.NODE_OPTIONS;
  if (stripPath) baseEnv.PATH = '';
  return spawnSync(process.execPath, [HOOK], {
    cwd,
    env: baseEnv,
    input: STOP_STDIN,
    encoding: 'utf8',
  });
}

function counterFile(root) {
  return path.join(root, '.ctoc', 'state', '.test-gate-fails');
}
function readCounter(root) {
  const p = counterFile(root);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')).fails; } catch { return null; }
}

/**
 * Build a hermetic CTOC-rooted project.
 *   suite: 'glob-green' | 'glob-red' | 'npm' | 'none'
 *   gate:  the value written for general.stopTestGate ('true'|'false'|undefined),
 *          or the literal string 'DIR' to make settings.yaml a directory,
 *          or 'ABSENT' to omit settings.yaml entirely.
 */
function makeProject({ suite = 'glob-green', gate = 'true', seedFails } = {}) {
  const root = mkTmp('stg-main-');
  fs.mkdirSync(path.join(root, '.ctoc', 'state'), { recursive: true });
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# CTOC Project Instructions\n');

  if (suite === 'none') {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'no-suite' }));
  } else if (suite === 'npm') {
    fs.writeFileSync(path.join(root, 'package.json'),
      JSON.stringify({ name: 'npm-suite', scripts: { test: 'jest' } }));
  } else {
    // glob suites
    fs.writeFileSync(path.join(root, 'package.json'),
      JSON.stringify({ name: 'glob-suite', scripts: { test: 'node --test tests/*.test.js' } }));
    fs.mkdirSync(path.join(root, 'tests'));
    const body = suite === 'glob-red' ? 'process.exit(1);\n' : '';
    fs.writeFileSync(path.join(root, 'tests', 'fixture.test.js'), body);
  }

  if (gate === 'DIR') {
    // settings.yaml is a directory → isGateEnabled readFileSync throws → false
    fs.mkdirSync(path.join(root, '.ctoc', 'settings.yaml'));
  } else if (gate === 'ABSENT') {
    /* omit settings.yaml → existsSync false → gate off */
  } else {
    fs.writeFileSync(path.join(root, '.ctoc', 'settings.yaml'),
      `general:\n  stopTestGate: ${gate}\n`);
  }

  if (seedFails !== undefined) {
    fs.writeFileSync(counterFile(root), JSON.stringify({ fails: seedFails }));
  }
  return root;
}

describe('main() — ALLOW paths (exit 0): opt-in inert & fail-open', () => {
  test('should_exit_0_when_settings_yaml_absent_gate_off', () => {
    const root = makeProject({ suite: 'npm', gate: 'ABSENT' });
    const res = runHook(root);
    assert.equal(res.status, 0, res.stderr);
  });

  test('should_exit_0_when_settings_yaml_is_unreadable_directory', () => {
    // isGateEnabled: existsSync true, readFileSync throws EISDIR → catch → false
    const root = makeProject({ suite: 'npm', gate: 'DIR' });
    const res = runHook(root);
    assert.equal(res.status, 0, res.stderr);
  });

  test('should_exit_0_when_gate_enabled_but_no_test_script', () => {
    // resolveTestCommand → null (no scripts.test) → gate does not apply
    const root = makeProject({ suite: 'none', gate: 'true' });
    const res = runHook(root);
    assert.equal(res.status, 0, res.stderr);
  });

  test('should_fail_open_exit_0_when_test_binary_cannot_spawn', () => {
    // npm fallback + PATH stripped → spawnSync result.error (ENOENT) → fail open.
    // A hook fault must NEVER wedge the session.
    const root = makeProject({ suite: 'npm', gate: 'true' });
    const res = runHook(root, { stripPath: true });
    assert.equal(res.status, 0, `spawn ENOENT must fail open, got ${res.status}\n${res.stderr}`);
  });

  test('should_exit_0_when_escape_env_set_even_with_red_suite', () => {
    // CTOC_SKIP_TEST_GATE=1 short-circuits before any suite run.
    const root = makeProject({ suite: 'glob-red', gate: 'true' });
    const res = runHook(root, { env: { CTOC_SKIP_TEST_GATE: '1' } });
    assert.equal(res.status, 0, res.stderr);
  });
});

describe('main() — GREEN suite via faked glob boundary (exit 0, counter cleared)', () => {
  test('should_exit_0_when_glob_suite_is_green', () => {
    const root = makeProject({ suite: 'glob-green', gate: 'true' });
    const res = runHook(root);
    assert.equal(res.status, 0, `green glob must allow, got ${res.status}\n${res.stderr}`);
  });

  test('should_clear_a_preexisting_fail_counter_on_green', () => {
    const root = makeProject({ suite: 'glob-green', gate: 'true', seedFails: 2 });
    const res = runHook(root);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(readCounter(root), null, 'green must clear the loop-guard counter');
  });
});

describe('main() — RED suite via faked glob boundary (BLOCK exit 2, then stand-down)', () => {
  test('should_BLOCK_exit_2_and_set_counter_1_on_first_red', () => {
    const root = makeProject({ suite: 'glob-red', gate: 'true' });
    const res = runHook(root);
    assert.equal(res.status, 2, `red glob must BLOCK, got ${res.status}\n${res.stderr}`);
    assert.equal(readCounter(root), 1, 'first red increments the loop guard to 1');
    assert.match(res.stderr, /BLOCKED stop|Attempt 1\/3/, 'stderr must explain the block');
  });

  test('should_stand_down_exit_0_and_clear_counter_on_third_red', () => {
    // Pre-seed 2 → this red makes fails 3 (>= MAX_ATTEMPTS) → stand down + honest report.
    const root = makeProject({ suite: 'glob-red', gate: 'true', seedFails: 2 });
    const res = runHook(root);
    assert.equal(res.status, 0, `3rd red must stand down, got ${res.status}\n${res.stderr}`);
    assert.equal(readCounter(root), null, 'counter cleared after stand-down');
    assert.match(res.stderr, /3 attempts|honest/i, 'must force an honest failure report');
  });
});

/**
 * DOCUMENTED-UNREACHABLE — the coverage report lists exactly ONE uncovered
 * region for this module under this file: lines 182-183. No test fabricates a
 * hit for it; here is why it cannot be reached through the public surface.
 *
 *  - Lines 181-183 `catch { process.exit(0); }` around spawnSync(...). spawnSync
 *    reports a missing/failed binary via `result.error` (an ENOENT RETURN value,
 *    NOT a throw — that path IS exercised by
 *    should_fail_open_exit_0_when_test_binary_cannot_spawn). spawnSync throws
 *    synchronously only for invalid argument TYPES (e.g. a non-string command),
 *    which resolveTestCommand can never emit — cmd is always process.execPath or
 *    the npm/npm.cmd string, and args is always a string[]. Reaching this catch
 *    would require malformed internal state the public API never produces.
 *
 * Two other defensive catches are, by the same reasoning, never actually taken —
 * yet node's line counter marks them COVERED (the enclosing line executes even
 * when the catch clause does not), so they do not appear as gaps:
 *   - line 163 `catch { process.exit(0); }` around findProjectRoot — findProjectRoot
 *     has no throw path (it falls back to `return process.cwd()`).
 *   - line 154 `catch { /* swallow *\/ }` in writeStderr — only a closed/broken
 *     stderr fd would trigger it, not reproducible over an open subprocess pipe.
 */
