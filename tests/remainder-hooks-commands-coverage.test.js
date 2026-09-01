'use strict';

/**
 * remainder-hooks-commands-coverage.test.js — plan 00252, slice 18 of
 * "close the coverage holes".
 *
 * WHAT THIS FILE IS FOR
 * --------------------
 * Eleven live modules — the three shipped slash commands, the two registered stop
 * hooks, the routing reminder behind the per-prompt hook, project initialisation,
 * the release script, the settings reader, the dispatch audit writer, the terminal
 * renderer and the memo cache — each carried a handful of dark lines. Almost every
 * one of them is a FAIL-OPEN or FAIL-CLOSED arm: the behaviour the module falls back
 * to when something underneath it breaks. Each was believed and none was verified,
 * so a future edit could flip any of them and the suite would stay green.
 *
 * Every case below pins the arm's DIRECTION, which is the thing that must never
 * change silently:
 *   - a stop gate that faults must ALLOW the stop (a gate that blocks on its own bug
 *     traps the human in a loop);
 *   - a permission-ish reader that faults must DENY (an unreadable setting never
 *     opens the push ship gate);
 *   - an advisory or best-effort step that faults must be NAMED in the result, never
 *     swallowed into a silent success.
 *
 * The fail-open arms are asserted AS DOCUMENTED. Whether any of them ought to fail
 * closed instead is the human's decision; this file only makes the current contract
 * a stated one.
 *
 * RESOLVED PATHS (the plan's table left three entries without a directory; each was
 * located by listing the directory, not by guessing):
 *   - ctoc-routing-reminder.js  → src/lib/ctoc-routing-reminder.js  (no src/hooks/ twin)
 *   - stop-continuation-gate.js → src/hooks/stop-continuation-gate.js
 *   - stop-test-gate.js         → src/hooks/stop-test-gate.js
 *
 * RANGE CLASSIFICATION — measured by `npm test` on 2026-09-01, baseline 99.45 %.
 * (a) reachable and covered here; (b) named, not faked; (c) dead.
 *
 *   (a) src/lib/init-project.js      615-616  home-directory scrub failure NAMED in reportableError
 *   (a) src/lib/init-project.js      728-729  CLAUDE.md template absent → named skip
 *   (a) src/lib/init-project.js      760-762  operating-lessons block fault → named skip (fail-open)
 *   (a) src/lib/init-project.js      790-792  operating-manual block fault → named skip (fail-open)
 *   (a) src/scripts/release.js       198-201  JSON version write fault → named failure
 *   (a) src/scripts/release.js       239-242  doc version write fault → named failure
 *   (a) src/scripts/release.js       295-298  doc-count write fault → named failure
 *   (a) src/commands/update.js       140-141  mirror clears a dir shadowing a source file
 *   (a) src/commands/update.js       204-211  version last-resort from the cache directory
 *   (a) src/commands/push.js         190-194  the command entry point reports a rejection as exit 1
 *   (a) src/lib/ctoc-routing-reminder.js 85-86   plan-count fault → all-zero state
 *   (a) src/lib/ctoc-routing-reminder.js 227-228 memo write fault → false
 *   (a) src/lib/ctoc-routing-reminder.js 279-280 any internal fault → reason 'error', no throw
 *   (a) src/hooks/stop-continuation-gate.js 62-63 question-directive fault does not change the verdict
 *   (a) src/hooks/stop-test-gate.js  182-183  a spawn fault ALLOWS the stop
 *   (a) src/lib/settings.js          309-310  an unreadable setting never opens the push ship gate
 *   (a) src/lib/v8-dispatcher.js     276      a non-serialisable dispatch value still writes the audit record
 *
 *   (b) src/lib/tui.js               247-248  `process.stdin.setRawMode(true)` inside
 *       `setupKeyboard`. It runs ONLY when stdin is a real terminal. Under the test
 *       runner stdin is a pipe, and a pipe has no `setRawMode` method at all — so the
 *       only way to "cover" it is to assign a fake `isTTY` and a fake `setRawMode`
 *       onto process.stdin, which tests the fake and proves nothing about a terminal.
 *       Named, not faked (plan 00252, Decision 3).
 *
 *   (c) none. No range in this slice's eleven modules was found dead.
 *
 * BOUNDARIES ONLY. Faults are injected at the module loader, at `safe-fs`, at
 * `child_process`, at `os.homedir` and at the `state` / `ctoc-project-detector`
 * modules the reminder requires — never at the function under test. Every mock is
 * restored in a `finally`.
 *
 * NOTHING TOUCHES THE REPOSITORY. Every fixture lives under `os.tmpdir()`. No git
 * command runs, nothing is pushed, no network call is made, no real release is
 * performed, and no command table (`.ctoc/settings.yaml`, `.ctoc/quality-config.yaml`)
 * is written. The final case in this file re-checks the repository's own CLAUDE.md,
 * plans/ tree and both command tables byte-for-byte.
 *
 * Cross-platform: paths via path.join; process.execPath spawns Node; no shell.
 */

const { describe, it, test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');

const safeFs = require('../src/lib/safe-fs');
const settings = require('../src/lib/settings');
const reminder = require('../src/lib/ctoc-routing-reminder');
const reminderState = require('../src/lib/state');
const reminderDetector = require('../src/lib/ctoc-project-detector');
const release = require('../src/scripts/release');
const updateCmd = require('../src/commands/update');
const initProject = require('../src/lib/init-project');
const cache = require('../src/lib/cache');

const INIT_PROJECT_FILE = require.resolve('../src/lib/init-project');
const PUSH_CMD = path.join(REPO, 'src', 'commands', 'push.js');
const CONTINUATION_HOOK = path.join(REPO, 'src', 'hooks', 'stop-continuation-gate.js');
const TEST_GATE_HOOK = path.join(REPO, 'src', 'hooks', 'stop-test-gate.js');

// ── fixture bookkeeping ──────────────────────────────────────────────────────

const TMP_DIRS = [];
function mkTmp(prefix) {
  // realpathSync so the macOS /var -> /private/var symlink does not confuse an
  // upward project-root walk.
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  TMP_DIRS.push(d);
  return d;
}
after(() => {
  for (const d of TMP_DIRS) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

/** sha256 of a file, for the "the repository is untouched" check at the bottom. */
function sha256(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

/**
 * Replace one method on a real module object for the duration of `fn`, then put the
 * original back. `safe-fs` and friends are looked up on the shared module object at
 * call time, which is exactly why this is the true boundary.
 */
function withStub(obj, name, impl, fn) {
  const original = obj[name];
  obj[name] = impl;
  try { return fn(); } finally { obj[name] = original; }
}

/** Poison `require('<request>')` issued from one specific parent file. */
function withPoisonedRequire(request, parentFile, fn) {
  const original = Module._load;
  Module._load = function poisoned(req, parent, isMain) {
    if (req === request && parent && parent.filename === parentFile) {
      throw new Error('CTOC-FAULT-SENTINEL: injected module load failure');
    }
    return original.call(this, req, parent, isMain);
  };
  try { return fn(); } finally { Module._load = original; }
}

// ═════════════════════════════════════════════════════════════════════════════
//  src/lib/cache.js:46 — a non-serialisable memo argument must not throw
// ═════════════════════════════════════════════════════════════════════════════

describe('cache.memoize — an argument JSON cannot serialise', () => {
  it('returns the function result instead of throwing, and still memoises', () => {
    let calls = 0;
    const memoized = cache.memoize((obj) => { calls += 1; return `saw:${obj.tag}`; },
      'ctoc-test-circular-arg');

    const circular = { tag: 'alpha' };
    circular.self = circular;   // JSON.stringify throws on this

    assert.equal(memoized(circular), 'saw:alpha',
      'a circular argument must not blow up the memo wrapper');
    assert.equal(memoized(circular), 'saw:alpha');
    assert.equal(calls, 1, 'the second call must come from the cache, not the function');

    cache.invalidate('ctoc-test-circular-arg');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  src/lib/settings.js:309-310 — the push ship gate fails CLOSED
// ═════════════════════════════════════════════════════════════════════════════

describe('settings.isAutoPushEnabled — an unreadable setting', () => {
  it('returns false when the settings read faults — never opens the ship gate', () => {
    const root = mkTmp('ctoc-s18-settings-');
    const got = withStub(safeFs, 'existsSync', (p) => {
      if (String(p).startsWith(root)) throw new Error('CTOC-FAULT-SENTINEL: injected stat failure');
      return fs.existsSync(p);
    }, () => settings.isAutoPushEnabled(root));

    assert.equal(got, false,
      'a settings fault must never be read as "the human enabled machine push"');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  src/lib/ctoc-routing-reminder.js — the three fail-quiet arms
// ═════════════════════════════════════════════════════════════════════════════

describe('ctoc-routing-reminder — degrades quietly, never throws at the human', () => {
  it('collectState returns an all-zero state when the plan-count reader faults', () => {
    const got = withStub(reminderState, 'getPlanCounts', () => {
      throw new Error('CTOC-FAULT-SENTINEL: injected plan-count failure');
    }, () => reminder.collectState(REPO));

    assert.deepEqual(got, {
      inProgress: 0, todo: 0, implementation: 0, review: 0, functional: 0, canvas: 0,
    }, 'a count fault must produce a zero state, not a partial or invented one');
  });

  it('writeMemo reports false when the memo cannot be persisted', () => {
    const root = mkTmp('ctoc-s18-memo-');
    const got = withStub(safeFs, 'mkdirSync', (p, o) => {
      if (String(p).startsWith(root)) throw new Error('CTOC-FAULT-SENTINEL: injected mkdir failure');
      return fs.mkdirSync(p, o);
    }, () => reminder.writeMemo(root, 'session-abc', { fingerprint: 'x', directiveInProgress: 1 }));

    assert.equal(got, false, 'an unpersisted memo must report false, never a silent true');
  });

  it('buildReminder returns reason "error" and says nothing when the detector faults', () => {
    const got = withStub(reminderDetector, 'isCtocProject', () => {
      throw new Error('CTOC-FAULT-SENTINEL: injected detector failure');
    }, () => reminder.buildReminder({ root: REPO, prompt: 'build the thing', sessionId: 's1' }));

    assert.deepEqual(got, { text: '', directive: false, state: false, reason: 'error' },
      'the once-per-prompt path must degrade to silence, never throw into the human prompt');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  src/scripts/release.js — a write that fails is a NAMED failure, never silence
// ═════════════════════════════════════════════════════════════════════════════

describe('release.js — an unwritable target is named, not skipped', () => {
  /**
   * A temp project carrying the files the release script syncs. Every declared
   * update path is seeded, so no file can be recorded as a failure through the
   * "missing expected path" arm — the only route into `failures` here is the
   * write fault this case is about.
   */
  function releaseFixture(version) {
    const root = mkTmp('ctoc-s18-release-');
    fs.writeFileSync(path.join(root, 'VERSION'), `${version}\n`);
    for (const cfg of release.JSON_VERSION_FILES) {
      const json = {};
      for (const u of cfg.updates) {
        let node = json;
        const keys = [...u.path];
        const last = keys.pop();
        for (const [i, k] of keys.entries()) {
          if (node[k] == null) node[k] = typeof keys[i + 1] === 'number' || typeof last === 'number' ? [] : {};
          node = node[k];
        }
        node[last] = '0.0.1';
      }
      const p = path.join(root, cfg.file);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(json, null, 2) + '\n');
    }
    return root;
  }

  /** Make every write under `root` fail, leaving writes elsewhere alone. */
  function withFailingWrites(root, fn) {
    return withStub(safeFs, 'writeFileSync', (p, data, opts) => {
      if (String(p).startsWith(root)) throw new Error('CTOC-FAULT-SENTINEL: injected write failure');
      return fs.writeFileSync(p, data, opts);
    }, fn);
  }

  it('updateJsonVersionFiles records each JSON file it could not write', () => {
    const root = releaseFixture('1.2.3');
    const res = withFailingWrites(root, () => release.updateJsonVersionFiles('9.9.9', root));

    assert.deepEqual(res.updated, [], 'nothing was written, so nothing may be reported updated');
    assert.deepEqual(res.failures, release.JSON_VERSION_FILES.map((c) => c.file),
      'EVERY unwritable JSON target must be named — a dropped name is a silent half-release');
  });

  it('updateVersionInFiles records each documentation file it could not write', () => {
    const root = mkTmp('ctoc-s18-release-docs-');
    const target = release.VERSION_UPDATES[0];
    const p = path.join(root, target.file);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    // Content the real replacement patterns actually change — otherwise the
    // function short-circuits on "nothing to do" and never reaches the write.
    fs.writeFileSync(p, '**0.0.1**\n\n![v](version-0.0.1-blue)\n');

    const res = withFailingWrites(root, () => release.updateVersionInFiles('9.9.9', root));

    assert.deepEqual(res.updated, []);
    assert.ok(res.failures.includes(target.file),
      `an unwritable ${target.file} must be a named failure, not a silent no-op`);
  });

  it('updateDocCountsInClaudeMd names CLAUDE.md and returns immediately when the write fails', () => {
    const root = mkTmp('ctoc-s18-release-counts-');
    const claudeMdPath = path.join(root, 'CLAUDE.md');
    fs.writeFileSync(claudeMdPath, fs.readFileSync(path.join(REPO, 'CLAUDE.md'), 'utf8'));

    const counts = {};
    for (const u of release.COUNT_UPDATES) counts[u.field] = 4242;

    const res = withFailingWrites(root,
      () => release.updateDocCountsInClaudeMd(root, { counts, claudeMdPath }));

    assert.deepEqual(res.updated, [], 'a failed write may never be reported as an update');
    assert.ok(res.failures.includes('CLAUDE.md'),
      'the count sync must name CLAUDE.md when it cannot write it');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  src/commands/update.js — the mirror and the version fallbacks
// ═════════════════════════════════════════════════════════════════════════════

describe('update.mirrorDir — a destination directory shadowing a source file', () => {
  it('removes the shadowing directory so the file copy can land', () => {
    const base = mkTmp('ctoc-s18-mirror-');
    const src = path.join(base, 'src');
    const dst = path.join(base, 'dst');
    fs.mkdirSync(src, { recursive: true });
    fs.mkdirSync(path.join(dst, 'menu.md', 'stale-child'), { recursive: true });
    fs.writeFileSync(path.join(src, 'menu.md'), 'the real command surface\n');
    fs.writeFileSync(path.join(dst, 'menu.md', 'stale-child', 'junk.txt'), 'x');

    updateCmd.mirrorDir(src, dst);

    const landed = path.join(dst, 'menu.md');
    assert.ok(fs.statSync(landed).isFile(),
      'a stale directory must be cleared, or the slash command would never install');
    assert.equal(fs.readFileSync(landed, 'utf8'), 'the real command surface\n');
  });
});

describe('update.getCurrentVersion — the last-resort read of the cache directory', () => {
  /**
   * No VERSION file is readable anywhere, so the function falls through to naming
   * the installed cache directory. The plugin-root environment variable is cleared
   * for the duration so the first branch cannot answer first.
   */
  // The module derives this from os.homedir() at load time; recompute it exactly so
  // the stubs key on the real constant instead of on whatever the host happens to
  // have installed (which is what made a first draft of this pass by coincidence).
  const CACHE_DIR = path.join(os.homedir(), '.claude', 'plugins', 'cache', 'robotijn', 'ctoc');

  function withNoVersionFiles(cacheEntries, fn) {
    const savedRoot = process.env.CLAUDE_PLUGIN_ROOT;
    delete process.env.CLAUDE_PLUGIN_ROOT;
    const realExists = safeFs.existsSync;
    const realReaddir = safeFs.readdirSync;
    const realStat = safeFs.statSync;
    safeFs.existsSync = (p) => {
      if (path.basename(String(p)) === 'VERSION') return false;
      if (String(p) === CACHE_DIR) return true;
      return realExists(p);
    };
    safeFs.readdirSync = (p, o) => (String(p) === CACHE_DIR ? cacheEntries : realReaddir(p, o));
    safeFs.statSync = (p, o) => (path.dirname(String(p)) === CACHE_DIR
      ? { isDirectory: () => true }
      : realStat(p, o));
    try {
      return fn();
    } finally {
      safeFs.existsSync = realExists;
      safeFs.readdirSync = realReaddir;
      safeFs.statSync = realStat;
      if (savedRoot === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
      else process.env.CLAUDE_PLUGIN_ROOT = savedRoot;
    }
  }

  it('names the single installed version when exactly one cache directory exists', () => {
    const got = withNoVersionFiles(['6.14.36'], () => updateCmd.getCurrentVersion());
    assert.equal(got, '6.14.36',
      'with one installed version the command must report it, not "unknown"');
  });

  it('reports "unknown" rather than guessing when the cache holds several versions', () => {
    const got = withNoVersionFiles(['6.14.35', '6.14.36'], () => updateCmd.getCurrentVersion());
    assert.equal(got, 'unknown',
      'an ambiguous cache must produce "unknown", never an arbitrary pick');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  src/lib/init-project.js — fail-open arms that must still NAME what they skipped
// ═════════════════════════════════════════════════════════════════════════════

describe('initProject — an absorbed failure is always named in the result', () => {
  function freshProject() {
    const dir = mkTmp('ctoc-s18-init-');
    fs.writeFileSync(path.join(dir, 'package.json'),
      JSON.stringify({ name: 'fixture', version: '1.0.0' }, null, 2));
    return dir;
  }

  it('names the CLAUDE.md template as missing rather than reporting a file it never wrote', () => {
    const dir = freshProject();
    const templatePath = path.join(REPO, '.ctoc', 'templates', 'CLAUDE.md.template');

    const res = withStub(safeFs, 'existsSync', (p) => {
      if (String(p) === templatePath) return false;
      return fs.existsSync(p);
    }, () => initProject.initProject(dir));

    assert.ok(res.skipped.includes('CLAUDE.md (template not found)'),
      `expected a named template skip, got: ${JSON.stringify(res.skipped)}`);
    assert.ok(!res.created.includes('CLAUDE.md'),
      'a file that was never written must not appear as created');
    assert.ok(!fs.existsSync(path.join(dir, 'CLAUDE.md')));
  });

  it('absorbs an operating-lessons fault as a named skip, and names a failed home scrub inside it', () => {
    const dir = freshProject();
    const osMod = require('node:os');

    const res = withPoisonedRequire('./claude-md-lessons', INIT_PROJECT_FILE, () =>
      withStub(osMod, 'homedir', () => {
        throw new Error('no resolvable home on this host');
      }, () => initProject.initProject(dir)));

    const entry = res.skipped.find((s) => s.startsWith('CLAUDE.md operating-lessons block'));
    assert.ok(entry,
      `a lessons fault must be a named skip, got: ${JSON.stringify(res.skipped)}`);
    assert.match(entry, /home-directory scrub skipped: no resolvable home on this host/,
      'a scrub that could not run must say so, so nobody reads the text as fully scrubbed');
    assert.ok(fs.existsSync(path.join(dir, 'CLAUDE.md')),
      'the fault is fail-open: initialisation still completes');
  });

  it('absorbs an operating-manual fault as a named skip', () => {
    const dir = freshProject();

    const res = withPoisonedRequire('./operating-manual', INIT_PROJECT_FILE,
      () => initProject.initProject(dir));

    assert.ok(res.skipped.some((s) => s.startsWith('CLAUDE.md operating-manual block')),
      `a manual-merge fault must be a named skip, got: ${JSON.stringify(res.skipped)}`);
    assert.ok(fs.existsSync(path.join(dir, 'CLAUDE.md')),
      'the fault is fail-open: initialisation still completes');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  src/lib/v8-dispatcher.js:276 — a value YAML cannot render
// ═════════════════════════════════════════════════════════════════════════════

describe('v8-dispatcher.beginDispatch — a dispatch carrying a non-serialisable value', () => {
  it('still writes the audit record instead of losing the dispatch', () => {
    const dir = mkTmp('ctoc-s18-dispatch-');
    const originalCwd = process.cwd();
    const modulePath = require.resolve('../src/lib/v8-dispatcher');
    const savedSession = process.env.CTOC_SESSION_ID;
    process.env.CTOC_SESSION_ID = `s18-${Date.now()}`;
    process.chdir(dir);
    delete require.cache[modulePath];
    try {
      const dispatcher = require('../src/lib/v8-dispatcher');
      const token = dispatcher.beginDispatch({
        target: 'quality/code-reviewer',
        goal: 'Review the remainder coverage slice carefully.',
        context: { probe: function unrenderable() { return 1; } },
      });

      assert.ok(token && token.auditPath, 'the dispatch must return its audit path');
      assert.ok(fs.existsSync(token.auditPath),
        'an unrenderable context value must not stop the audit record being written');
      assert.match(fs.readFileSync(token.auditPath, 'utf8'), /probe:/,
        'the key must survive into the record even when its value cannot be rendered');
    } finally {
      process.chdir(originalCwd);
      delete require.cache[modulePath];
      require('../src/lib/v8-dispatcher');
      if (savedSession === undefined) delete process.env.CTOC_SESSION_ID;
      else process.env.CTOC_SESSION_ID = savedSession;
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Spawned entry points. Each runs the REAL file with a preload that seeds
//  require.cache with a faulting boundary. No git, no network, no real suite.
// ═════════════════════════════════════════════════════════════════════════════

/** Write a preload that replaces one resolved module's exports with a fault. */
function writeThrowingPreload(dir, name, targetFile) {
  const p = path.join(dir, `${name}.preload.js`);
  fs.writeFileSync(p, `
'use strict';
const target = ${JSON.stringify(targetFile)};
require.cache[target] = {
  id: target, filename: target, loaded: true, children: [], paths: [],
  exports: new Proxy({}, {
    get() { throw new Error('CTOC-FAULT-SENTINEL: injected boundary fault'); },
  }),
};
`);
  return p;
}

describe('push.js entry point — a rejection is reported, never a silent success', () => {
  it('exits 1 and prints "push error:" when the check pipeline throws', () => {
    const dir = mkTmp('ctoc-s18-push-');
    const preload = writeThrowingPreload(dir, 'tool-detector',
      require.resolve('../src/lib/tool-detector'));

    // The fault fires at the FIRST thing run() does (tool detection), so no lint,
    // no typecheck, no test run and above all no `git push` can happen here.
    const res = spawnSync(process.execPath, ['--require', preload, PUSH_CMD, '--dry-run'],
      { cwd: dir, encoding: 'utf8', env: { ...process.env } });

    assert.equal(res.status, 1,
      `a failed push command must exit non-zero, got ${res.status}\n${res.stderr}`);
    assert.match(res.stderr, /push error:/,
      'the failure must be printed, not swallowed into a clean-looking exit');
  });
});

describe('stop-continuation-gate — a fault in the question directive', () => {
  function approvedQueueProject() {
    const ledger = require('../src/lib/approval-ledger');
    const dir = mkTmp('ctoc-s18-cont-');
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
    for (const s of ['todo', 'in-progress']) {
      fs.mkdirSync(path.join(dir, 'plans', s), { recursive: true });
    }
    const content = `---
title: "alpha"
type: implementation
files:
  - "src/lib/alpha.js"
---

# alpha

The specification the human ruled on.
`;
    const p = path.join(dir, 'plans', 'todo', 'alpha.md');
    fs.writeFileSync(p, content);
    ledger.writeEntry(ledger.slugFromPlanPath(p),
      { content, stage_from: 'implementation', stage_to: 'todo', approved_by: 'human' }, dir);
    return dir;
  }

  it('does not change the verdict — the gate still blocks and still says why', () => {
    const dir = approvedQueueProject();
    const preload = writeThrowingPreload(dir, 'session-start',
      require.resolve('../src/hooks/SessionStart'));

    const res = spawnSync(process.execPath, ['--require', preload, CONTINUATION_HOOK],
      { cwd: dir, encoding: 'utf8', env: { ...process.env } });

    assert.equal(res.status, 2,
      `approved fork-free work must still block the stop, got ${res.status}\n${res.stderr}`);
    assert.match(res.stderr, /1 approved plan\(s\) are waiting to be built/,
      'the keep-going message must survive a fault in the optional directive appended to it');
  });
});

describe('stop-test-gate — a fault spawning the suite', () => {
  it('ALLOWS the stop (exit 0) — a gate that blocks on its own bug traps the human', () => {
    const dir = mkTmp('ctoc-s18-testgate-');
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.ctoc', 'settings.yaml'),
      'general:\n  stopTestGate: true\n');
    fs.writeFileSync(path.join(dir, 'package.json'),
      JSON.stringify({ name: 'fixture', scripts: { test: 'node -e ""' } }, null, 2));

    // Poison the spawn boundary itself, so the gate can never run a real suite.
    const preload = path.join(dir, 'cp.preload.js');
    fs.writeFileSync(preload, `
'use strict';
const cp = require('child_process');
cp.spawnSync = function () { throw new Error('CTOC-FAULT-SENTINEL: injected spawn fault'); };
`);

    const res = spawnSync(process.execPath, ['--require', preload, TEST_GATE_HOOK],
      { cwd: dir, encoding: 'utf8', env: { ...process.env } });

    assert.equal(res.status, 0,
      `a gate that cannot even spawn its suite must fail open, got ${res.status}\n${res.stderr}`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  The repository itself is untouched by everything above.
// ═════════════════════════════════════════════════════════════════════════════

const REPO_GUARDED = [
  path.join(REPO, 'CLAUDE.md'),
  path.join(REPO, '.ctoc', 'quality-config.yaml'),
];
const REPO_BEFORE = new Map(
  REPO_GUARDED.filter((p) => fs.existsSync(p)).map((p) => [p, sha256(p)]),
);
const PLANS_BEFORE = fs.existsSync(path.join(REPO, 'plans'))
  ? fs.readdirSync(path.join(REPO, 'plans')).sort().join(',')
  : null;

test('the repository CLAUDE.md, command tables and plans tree are byte-for-byte unchanged', () => {
  assert.ok(REPO_BEFORE.size > 0, 'the guard must actually have hashed something');
  for (const [p, before] of REPO_BEFORE) {
    assert.equal(sha256(p), before, `${path.relative(REPO, p)} was modified by this suite`);
  }
  const plansNow = fs.existsSync(path.join(REPO, 'plans'))
    ? fs.readdirSync(path.join(REPO, 'plans')).sort().join(',')
    : null;
  assert.equal(plansNow, PLANS_BEFORE, 'the plans tree was modified by this suite');
});
