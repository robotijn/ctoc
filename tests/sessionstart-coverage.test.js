#!/usr/bin/env node
'use strict';

/**
 * SessionStart.js — non-obvious branch coverage.
 *
 * Companion to tests/sessionstart-self-repo-and-honest-banner.test.js (which pins the
 * package-identity self-repo guard and the honest enforcement banner). This file does
 * NOT re-test those; it aims at the DARK data/logic decisions the session banner and the
 * session-start handler make, each pinned so a mutation of the production line goes RED:
 *
 *   - formatDatabasesLine  — every posture branch (rls supported/n-a/not-native,
 *     connection tls/file-local), the label-only fallback, the element-skip guard, and
 *     the two distinct ''-returns (empty input vs. all-elements-skipped).
 *   - formatFrameworksLine — the HIDE-NOTHING render (ALL concerns, never truncated —
 *     kills a reintroduced slice(0, 2)), label-only, multi-framework join, skip guard.
 *   - generateContext      — the ||/?? fallbacks and the SECOND operand of each ternary
 *     that the self-repo test leaves dark: version placeholder, update-available line,
 *     self-check line, the feature-present step line, the "unknown" stack fallback, and
 *     that both formatter lines are actually spliced into the banner.
 *   - main() interrupted-session recovery — driven IN-PROCESS (chdir + a real, HMAC-
 *     signed state written by the real state-manager) so lines 41-58 (recovery menu) and
 *     70-74 (existing-state update branch) are exercised and directly asserted. Node's
 *     coverage does not deterministically credit spawned-child execution to these lines;
 *     an in-process call does.
 *   - fail-open contract — a session-start hook must NEVER crash the session; hostile
 *     fixtures (unparseable package.json, bare directory) must still exit 0.
 *
 * No test doubles. The only interception is at true process/IO boundaries — process.cwd
 * (via chdir), process.stderr.write and console.log (to capture what the hook emits) —
 * restored in finally. state-manager and crypto are REAL collaborators (a real function
 * against a real temp tree + the real installation secret is not a double).
 *
 * DOCUMENTED UNREACHABLE (honesty clause — never fabricate a hit):
 *   - 167-168  shouldInjectLessons catch => false. isCtocProject is internally
 *              non-throwing, so the catch cannot fire without a test double.
 *   - 193-194  maybeInjectLessons catch. Proven empirically: ensureLessonsBlock swallows
 *              its own errors (it logs "ensureLessonsBlock failed" and returns), and every
 *              other statement in the try (shouldInjectLessons, path.resolve/join,
 *              require) is non-throwing — so this catch cannot fire without a double.
 *   - 111-112  plan-index backfill-kick catch, and 135-137 iron-loop self-check catch —
 *              belt-and-braces backstops that only fire if the required lib itself throws;
 *              unreachable without fault injection, which the no-doubles discipline forbids.
 *   - 343-344  the require.main main().catch ERROR callback body. main() is fail-open by
 *              design; the fail-open test below confirms hostile fixtures still exit 0, so
 *              the rejection path cannot be reached without fault injection / a double.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.resolve(__dirname, '..', 'src', 'hooks', 'SessionStart.js');
const hook = require('../src/hooks/SessionStart.js');
const stateManager = require('../src/lib/state-manager');
const crypto = require('../src/lib/crypto');

// A stack shape with no languages/databases/frameworks — the "nothing to show" baseline.
const EMPTY_STACK = { languages: [], primary: { language: null, framework: null } };

const cleanupDirs = [];
const cleanupStateFiles = [];

after(() => {
  for (const d of cleanupDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
  for (const f of cleanupStateFiles) {
    try { fs.rmSync(f, { force: true }); } catch { /* best-effort */ }
  }
});

// ---------------------------------------------------------------------------
// formatDatabasesLine — honest per-database posture rendering (dark: 222-238)
// ---------------------------------------------------------------------------

describe('SessionStart.formatDatabasesLine — posture rendering pins each branch', () => {
  // Each row's expected string is the EXACT render; a mutant that flips any posture
  // branch, drops a fallback, or garbles the join produces a different string => RED.
  const rows = [
    {
      id: 'rls-supported+tls-required',
      stack: { databases: [{ name: 'postgresql', security: { rls: 'supported', connection: 'tls-required' } }] },
      expected: '\nDatabases: postgresql (RLS-capable, TLS-capable)'
    },
    {
      id: 'rls-not-applicable+file-local',
      stack: { databases: [{ name: 'sqlite', security: { rls: 'not-applicable', connection: 'file-local' } }] },
      expected: '\nDatabases: sqlite (RLS n/a, file-local)'
    },
    {
      id: 'rls-not-native-only',
      stack: { databases: [{ name: 'mysql', security: { rls: 'not-native' } }] },
      expected: '\nDatabases: mysql (RLS not native)'
    },
    {
      id: 'no-security-object-label-only',
      stack: { databases: [{ name: 'redis' }] },
      expected: '\nDatabases: redis'
    },
    {
      id: 'unknown-rls-value-adds-no-posture',
      stack: { databases: [{ name: 'foo', security: { rls: 'sideways' } }] },
      expected: '\nDatabases: foo'
    },
    {
      id: 'unknown-connection-value-adds-no-posture',
      stack: { databases: [{ name: 'bar', security: { connection: 'plaintext' } }] },
      expected: '\nDatabases: bar'
    }
  ];

  for (const row of rows) {
    it(`renders the exact capability posture [${row.id}]`, () => {
      // Act
      const line = hook.formatDatabasesLine(row.stack);

      // Assert
      assert.equal(line, row.expected);
    });
  }

  it('skips null / non-object / nameless entries but keeps the valid one', () => {
    // Arrange — three junk entries the guard must skip, one real entry.
    const stack = { databases: [null, {}, { name: '' }, { name: 'pg', security: { rls: 'supported' } }] };

    // Act
    const line = hook.formatDatabasesLine(stack);

    // Assert — only the valid entry renders; the guard never dereferenced .name on null.
    assert.equal(line, '\nDatabases: pg (RLS-capable)');
  });

  it('returns empty string when every entry is skipped (parts.length === 0 path)', () => {
    // This is the DISTINCT second ''-return (line 237), not the empty-input return.
    assert.equal(hook.formatDatabasesLine({ databases: [null, { name: '' }] }), '');
  });

  it('returns empty string for empty, non-array, and absent databases', () => {
    // Arrange / Act / Assert — the leading guard (line 221) across three malformed shapes.
    assert.equal(hook.formatDatabasesLine({ databases: [] }), '', 'empty array');
    assert.equal(hook.formatDatabasesLine({ databases: 'nope' }), '', 'non-array coerces to []');
    assert.equal(hook.formatDatabasesLine(null), '', 'absent stack');
  });
});

// ---------------------------------------------------------------------------
// formatFrameworksLine — hide-nothing concern rendering (dark: 266-276)
// ---------------------------------------------------------------------------

describe('SessionStart.formatFrameworksLine — shows ALL concerns, hides nothing', () => {
  it('renders every concern (kills a reintroduced slice(0, 2) truncation)', () => {
    // Arrange — four concerns; a truncating mutant would drop ssrf + auth-middleware.
    const stack = {
      frameworkCapabilities: [
        { name: 'nextjs', security: { concerns: ['security-headers', 'env-exposure', 'ssrf', 'auth-middleware'] } }
      ]
    };

    // Act
    const line = hook.formatFrameworksLine(stack);

    // Assert — all four concerns present, in order, no truncation indicator.
    assert.equal(line, '\nFrameworks: nextjs (security-headers, env-exposure, ssrf, auth-middleware)');
  });

  it('renders label only when a framework has no concerns', () => {
    assert.equal(hook.formatFrameworksLine({ frameworkCapabilities: [{ name: 'express' }] }), '\nFrameworks: express');
  });

  it('renders label only when concerns is present but not an array', () => {
    // Pins `Array.isArray(fw.security.concerns) ? ... : []` (the non-array branch).
    const stack = { frameworkCapabilities: [{ name: 'flask', security: { concerns: 'not-a-list' } }] };
    assert.equal(hook.formatFrameworksLine(stack), '\nFrameworks: flask');
  });

  it('joins multiple frameworks with the middot separator', () => {
    const stack = {
      frameworkCapabilities: [
        { name: 'nextjs', security: { concerns: ['xss'] } },
        { name: 'django', security: { concerns: ['csrf', 'xss'] } }
      ]
    };
    assert.equal(hook.formatFrameworksLine(stack), '\nFrameworks: nextjs (xss) · django (csrf, xss)');
  });

  it('skips junk entries but keeps the valid framework', () => {
    const stack = { frameworkCapabilities: [null, {}, { name: '' }, { name: 'vue', security: { concerns: ['xss'] } }] };
    assert.equal(hook.formatFrameworksLine(stack), '\nFrameworks: vue (xss)');
  });

  it('returns empty string when every entry is skipped (parts.length === 0 path)', () => {
    assert.equal(hook.formatFrameworksLine({ frameworkCapabilities: [null, { name: '' }] }), '');
  });

  it('returns empty string for empty, non-array, and absent frameworkCapabilities', () => {
    assert.equal(hook.formatFrameworksLine({ frameworkCapabilities: [] }), '', 'empty array');
    assert.equal(hook.formatFrameworksLine({ frameworkCapabilities: 42 }), '', 'non-array coerces to []');
    assert.equal(hook.formatFrameworksLine(undefined), '', 'absent stack');
  });
});

// ---------------------------------------------------------------------------
// generateContext — the ||/?? fallbacks and second-operand branches (dark side)
// ---------------------------------------------------------------------------

describe('SessionStart.generateContext — fallbacks and present/absent decisions', () => {
  it('renders the version placeholder "?" when version is falsy', () => {
    // Pins `${version || '?'}` (line 298). The self-repo test passes version 'X' (truthy),
    // never the fallback. A mutant removing `|| '?'` yields "CTOC v -".
    const banner = hook.generateContext(EMPTY_STACK, null, '', null, null);
    assert.match(banner, /CTOC v\? -/);
  });

  it('renders the provided version verbatim when present', () => {
    const banner = hook.generateContext(EMPTY_STACK, null, '9.9.9', null, null);
    assert.match(banner, /CTOC v9\.9\.9 -/);
  });

  it('renders the update-available line when an update exists (second operand of ??.)', () => {
    // The self-repo test only passes updateInfo=null (empty branch). This drives the
    // TRUE branch at lines 284-285.
    const updateInfo = { updateAvailable: true, currentVersion: '1.0.0', latestVersion: '2.0.0' };
    const banner = hook.generateContext(EMPTY_STACK, null, '9.9.9', updateInfo, null);
    assert.match(banner, /Update available: 1\.0\.0 → 2\.0\.0 \(run: git pull origin main\)/);
  });

  it('omits the update line when updateAvailable is false', () => {
    const banner = hook.generateContext(EMPTY_STACK, null, '9.9.9', { updateAvailable: false }, null);
    assert.ok(!banner.includes('Update available:'), 'no update line for a non-available update');
  });

  it('appends the self-check summary line when one is provided', () => {
    // Drives the TRUE branch at line 287 (self-repo test passes null).
    const banner = hook.generateContext(EMPTY_STACK, null, '9.9.9', null, 'INVARIANTS_OK_MARKER');
    assert.match(banner, /\nINVARIANTS_OK_MARKER/);
  });

  it('renders the current Iron Loop step when a feature is active', () => {
    // state.feature truthy => stepName = STEP_NAMES[7] = 'SPEC'; line 302 feature branch.
    const state = { feature: 'Checkout flow', currentStep: 7 };
    const banner = hook.generateContext(EMPTY_STACK, state, '9.9.9', null, null);
    assert.match(banner, /Iron Loop: Step 7 \(SPEC\)/);
  });

  it('falls back to "unknown" stack label when no languages are detected', () => {
    // `stack.languages.join('/') || 'unknown'` — empty join is '' (falsy) => 'unknown'.
    const banner = hook.generateContext(EMPTY_STACK, null, '9.9.9', null, null);
    assert.match(banner, /Stack: unknown/);
  });

  it('renders detected languages joined by slash', () => {
    const stack = { languages: ['typescript', 'python'], primary: { language: null, framework: null } };
    const banner = hook.generateContext(stack, null, '9.9.9', null, null);
    assert.match(banner, /Stack: typescript\/python/);
  });

  it('splices BOTH the databases and frameworks lines into the banner', () => {
    // Proves generateContext actually calls both formatters and inserts their output
    // (lines 288-289 + 301). Dropping either splice => RED.
    const stack = {
      languages: ['typescript'],
      primary: { language: null, framework: null },
      databases: [{ name: 'postgresql', security: { rls: 'supported', connection: 'tls-required' } }],
      frameworkCapabilities: [{ name: 'nextjs', security: { concerns: ['ssrf'] } }]
    };
    const banner = hook.generateContext(stack, null, '9.9.9', null, null);

    assert.match(banner, /\nDatabases: postgresql \(RLS-capable, TLS-capable\)/);
    assert.match(banner, /\nFrameworks: nextjs \(ssrf\)/);
  });

  it('emits no Databases/Frameworks header when the stack has none (additive-only)', () => {
    const banner = hook.generateContext(EMPTY_STACK, null, '9.9.9', null, null);
    assert.ok(!banner.includes('Databases:'), 'no databases header when none detected');
    assert.ok(!banner.includes('Frameworks:'), 'no frameworks header when none detected');
  });
});

// ---------------------------------------------------------------------------
// main() — interrupted-session recovery (dark: 41-58, 70-74), driven in-process
// ---------------------------------------------------------------------------

/**
 * Build a temp project whose GLOBAL, HMAC-signed Iron Loop state is an interrupted
 * implementation (sessionStatus 'active', currentStep in [8,16], recent lastActivity).
 * realpathSync is required so the fixture path matches the child/handler's process.cwd()
 * hash on macOS (/var vs /private/var symlink), otherwise loadState would miss the state.
 */
function makeInterruptedFixture(feature, step) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ss-int-')));
  cleanupDirs.push(dir);
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'consumer-app', version: '0.0.0' }));

  const state = stateManager.createState(dir, feature, 'javascript', null);
  state.currentStep = step;
  state.sessionStatus = 'active';
  stateManager.saveState(dir, state); // signs with the real installation secret + refreshes lastActivity to now
  cleanupStateFiles.push(path.join(os.homedir(), '.ctoc', 'state', `${crypto.hashPath(dir)}.json`));
  return dir;
}

/** Run the real main() in-process against `dir`, capturing stderr + stdout at the IO boundary. */
async function runMainInProcess(dir) {
  const cwd0 = process.cwd();
  const stderrChunks = [];
  const stdoutChunks = [];
  const stderrWrite0 = process.stderr.write.bind(process.stderr);
  const log0 = console.log;

  process.stderr.write = (chunk) => { stderrChunks.push(String(chunk)); return true; };
  console.log = (...args) => { stdoutChunks.push(args.join(' ')); };
  process.chdir(dir);
  try {
    await hook.main();
  } finally {
    process.chdir(cwd0);
    process.stderr.write = stderrWrite0;
    console.log = log0;
  }
  return { stderr: stderrChunks.join(''), stdout: stdoutChunks.join('\n') };
}

describe('SessionStart.main — interrupted-session recovery', () => {
  it('writes the recovery menu with feature and resume/restart/discard options', async () => {
    // Arrange
    const dir = makeInterruptedFixture('Payment webhook retries', 10);

    // Act
    const { stderr } = await runMainInProcess(dir);

    // Assert — the recovery menu (writeToTerminal => stderr) reflects the loaded state.
    assert.match(stderr, /INTERRUPTED IMPLEMENTATION DETECTED/);
    assert.match(stderr, /Payment webhook retries/);
    assert.match(stderr, /\[R\] Resume/);
    assert.match(stderr, /\[D\] Discard/);
  });

  it('renders the loaded step name in the recovery menu', async () => {
    // Arrange — step 14 => STEP_NAMES[14] = 'VERIFY'; pins the STEP_NAMES lookup at line 48.
    const dir = makeInterruptedFixture('Coverage ratchet', 14);

    // Act
    const { stderr } = await runMainInProcess(dir);

    // Assert
    assert.match(stderr, /Step: 14 \(VERIFY\)/);
  });

  it('banner reports the persisted Iron Loop step for the existing-state update branch', async () => {
    // Arrange — an existing state drives the else-branch update (lines 70-74) then the
    // banner reflects the loaded currentStep (generateContext feature branch).
    const dir = makeInterruptedFixture('Auth hardening', 10);

    // Act
    const { stdout } = await runMainInProcess(dir);

    // Assert
    assert.match(stdout, /Iron Loop: Step 10 \(IMPLEMENT\)/);
  });
});

// ---------------------------------------------------------------------------
// Fail-open contract — a session-start hook must never crash the session.
// ---------------------------------------------------------------------------

/** Spawn the real hook against a fresh temp fixture built by `setup`; return exit status. */
function runHookAgainst(setup) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ss-failopen-')));
  cleanupDirs.push(dir);
  cleanupStateFiles.push(path.join(os.homedir(), '.ctoc', 'state', `${crypto.hashPath(dir)}.json`));
  setup(dir);
  const res = spawnSync(process.execPath, [HOOK_PATH], { cwd: dir, encoding: 'utf8', timeout: 20000 });
  return { status: res.status, stderr: res.stderr || '' };
}

describe('SessionStart.main — fail-open under hostile fixtures (never crashes the session)', () => {
  // These pin the invariant that keeps 343-344 (the main().catch error body) documented-
  // unreachable: no honest fixture drives main() to rejection.
  const cases = [
    { id: 'unparseable-package.json', setup: (d) => fs.writeFileSync(path.join(d, 'package.json'), '{ not: valid json ]') },
    { id: 'bare-directory-no-markers', setup: () => { /* no .ctoc, .git, package.json, or plans */ } }
  ];

  for (const c of cases) {
    it(`exits 0 despite ${c.id}`, () => {
      // Act
      const { status, stderr } = runHookAgainst(c.setup);

      // Assert — fail-open: session start survives, no fatal "Session start error".
      assert.equal(status, 0, 'hook must exit 0 (fail-open)');
      assert.ok(!stderr.includes('Session start error'), 'no fatal error emitted');
    });
  }
});
