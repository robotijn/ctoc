/**
 * Tests for the CTOC operating-lessons injector + onboarding corrections.
 *
 * Covers the 12 acceptance criteria from
 * plans/todo/onboarding-claude-md-operating-lessons.md plus the
 * generateContext<->operating-lessons.md sync-guard and the module's
 * error/fail-open paths.
 *
 * ALL fixtures live under os.tmpdir(). The injector is NEVER run against the
 * real repo CLAUDE.md, and the real .ctoc/templates/operating-lessons.md is
 * ONLY ever read — NEVER renamed, moved, or mutated. Missing-source error paths
 * are exercised by copying the module into a temp dir that genuinely lacks the
 * source (see loadModuleWithoutSource), so parallel suites never race on the
 * live repo file.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO_ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = path.join(REPO_ROOT, '.ctoc', 'templates', 'operating-lessons.md');

const lessons = require('../src/lib/claude-md-lessons');
const { START_MARKER, END_MARKER, MANAGED_NOTICE, LESSONS_VERSION } = lessons;

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function mkTmpProject(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-lessons-'));
  if (t) t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore cleanup error */ } });
  return dir;
}

/**
 * Load a FRESH copy of the injector from a temp directory that has NO
 * `.ctoc/templates/operating-lessons.md` anywhere up its tree. This busts the
 * module's __dirname-relative PRIMARY source resolution without touching the
 * live repo source — the only honest way to drive the missing-source path under
 * parallel `node --test` without a cross-process rename race.
 *
 * @returns {{ mod: object, root: string, expectedPrimary: string }}
 */
function loadModuleWithoutSource(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-nosrc-'));
  if (t) t.after(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) { /* ignore */ } });
  // Nest as src/lib so the module's `../../` resolution stays inside this temp
  // tree (root/.ctoc/...), which deliberately does not exist.
  const modDir = path.join(root, 'src', 'lib');
  fs.mkdirSync(modDir, { recursive: true });
  const code = fs.readFileSync(require.resolve('../src/lib/claude-md-lessons'), 'utf8');
  const modPath = path.join(modDir, 'claude-md-lessons.js');
  fs.writeFileSync(modPath, code, 'utf8');
  // claude-md-lessons.js requires('./safe-fs') (LH1 fs choke point) — copy that
  // code dependency alongside so the relative require resolves in the temp tree.
  // This helper removes the DATA source (operating-lessons.md up the tree), not
  // the module's code deps.
  const safeFsCode = fs.readFileSync(require.resolve('../src/lib/safe-fs'), 'utf8');
  fs.writeFileSync(path.join(modDir, 'safe-fs.js'), safeFsCode, 'utf8');
  const expectedPrimary = path.join(root, '.ctoc', 'templates', 'operating-lessons.md');
  return { mod: require(modPath), root, expectedPrimary };
}

function canonicalBlock() {
  const raw = fs.readFileSync(SOURCE_PATH, 'utf8');
  const norm = lessons.normalizeEol(raw).normalized;
  const lines = norm.split('\n');
  const blk = lessons.findManagedBlock(lines);
  return lines.slice(blk.startIdx, blk.endIdx + 1).join('\n');
}

function captureStderr(fn) {
  const orig = process.stderr.write;
  let out = '';
  process.stderr.write = (chunk) => { out += String(chunk); return true; };
  let result;
  try { result = fn(); } finally { process.stderr.write = orig; }
  return { stderr: out, result };
}

function countOccurrences(haystack, needle) {
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) { count++; idx += needle.length; }
  return count;
}

const V0_BLOCK = [
  '<!-- CTOC:LESSONS v0 START -->',
  '<!-- Content between these markers is CTOC-managed. Do not edit manually. -->',
  '',
  '## CTOC Operating Lessons',
  '',
  '1. Old lesson one.',
  '2. Old lesson two.',
  '<!-- CTOC:LESSONS v0 END -->'
].join('\n');

// ──────────────────────────────────────────────────────────────────────────
// AC1 / AC2 — init produces an accurate CLAUDE.md (real initProject)
// ──────────────────────────────────────────────────────────────────────────

describe('onboarding template correctness (via real initProject)', () => {
  const { initProject } = require('../src/lib/init-project');

  function renderInit(t) {
    const dir = mkTmpProject(t);
    initProject(dir);
    return fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
  }

  it('AC1: init_writes_16_step_iron_loop', (t) => {
    const content = renderInit(t);

    // Compound 16-step token — NOT the bare digit "16".
    assert.ok(/16[ -][Ss]teps?/.test(content), 'expected "16 Steps"/"16-step" compound token');

    for (const token of ['Step 8', 'Step 10', 'Step 14', 'Gate 0']) {
      assert.ok(content.includes(token), `expected token present: ${token}`);
    }

    assert.ok(
      content.includes('plans/{vision,canvas,functional,implementation,todo,in-progress,review,done}'),
      'expected the brace-form plan directory listing'
    );

    for (const cmd of ['/ctoc:menu', '/ctoc:push', '/ctoc:update']) {
      assert.ok(content.includes(cmd), `expected slash command: ${cmd}`);
    }

    // Managed block filled with the canonical lessons.
    assert.equal(countOccurrences(content, START_MARKER), 1, 'exactly one START marker');
    assert.equal(countOccurrences(content, END_MARKER), 1, 'exactly one END marker');
    assert.ok(content.includes('The measure is the human'), 'expected canonical lesson body');
  });

  it('AC2: init_no_drift_strings', (t) => {
    const content = renderInit(t);
    const drift = [
      '15 Steps',
      'Step 7 is TDD',
      'Step 9 is ONE step',
      'Step 13 VERIFY',
      'functional/draft',
      'functional/approved',
      'implementation/draft',
      'implementation/approved',
      'in_progress/',
      'ctoc plan new',
      'ctoc plan approve',
      'ctoc plan status'
    ];
    for (const s of drift) {
      assert.ok(!content.includes(s), `drift string must be absent: ${JSON.stringify(s)}`);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// ensureLessonsBlock — unit behavior
// ──────────────────────────────────────────────────────────────────────────

describe('ensureLessonsBlock — idempotency, prose preservation, upgrade', () => {
  it('AC3: ensure_lessons_idempotent (hash-keyed, not version-keyed)', (t) => {
    const dir = mkTmpProject(t);
    const target = path.join(dir, 'CLAUDE.md');
    fs.writeFileSync(target, 'PRE\n\n' + canonicalBlock() + '\n\nPOST');

    const first = lessons.ensureLessonsBlock(target, REPO_ROOT);
    assert.equal(first, false, 'seeded with canonical block -> first call is a no-op');
    const afterFirst = fs.readFileSync(target, 'utf8');

    const second = lessons.ensureLessonsBlock(target, REPO_ROOT);
    assert.equal(second, false, 'second call is a no-op');
    const afterSecond = fs.readFileSync(target, 'utf8');
    assert.equal(afterSecond, afterFirst, 'byte-for-byte identical across no-op calls');

    assert.equal(countOccurrences(afterSecond, START_MARKER), 1);
    assert.equal(countOccurrences(afterSecond, END_MARKER), 1);

    // Mutate in-block body while keeping v1 markers -> next call must repair (true).
    const mutated = afterSecond.replace(MANAGED_NOTICE, MANAGED_NOTICE + '\nHAND EDIT DRIFT');
    fs.writeFileSync(target, mutated);
    const third = lessons.ensureLessonsBlock(target, REPO_ROOT);
    assert.equal(third, true, 'in-version drift is detected by content hash and repaired');
    const repaired = fs.readFileSync(target, 'utf8');
    assert.ok(!repaired.includes('HAND EDIT DRIFT'), 'drift content removed by repair');
    assert.equal(lessons.ensureLessonsBlock(target, REPO_ROOT), false, 'repaired block is now a no-op');
  });

  it('AC4: ensure_lessons_preserves_prose (byte-for-byte around block)', (t) => {
    const dir = mkTmpProject(t);
    const target = path.join(dir, 'CLAUDE.md');
    fs.writeFileSync(target, 'PRE\n\n' + V0_BLOCK + '\n\nPOST');

    const changed = lessons.ensureLessonsBlock(target, REPO_ROOT);
    assert.equal(changed, true, 'upgrade performed');

    const out = fs.readFileSync(target, 'utf8');
    const startIdx = out.indexOf(START_MARKER);
    const endIdx = out.indexOf(END_MARKER) + END_MARKER.length;
    assert.equal(out.slice(0, startIdx), 'PRE\n\n', 'prose before block unchanged');
    assert.equal(out.slice(endIdx), '\n\nPOST', 'prose after block unchanged');
  });

  it('AC5: ensure_lessons_upgrades_old_version (v0 -> v1 in place)', (t) => {
    const dir = mkTmpProject(t);
    const target = path.join(dir, 'CLAUDE.md');
    fs.writeFileSync(target, 'HEADER\n\n' + V0_BLOCK + '\n\nFOOTER');

    const changed = lessons.ensureLessonsBlock(target, REPO_ROOT);
    assert.equal(changed, true);

    const out = fs.readFileSync(target, 'utf8');
    assert.ok(out.includes('<!-- CTOC:LESSONS v1 START -->'), 'v1 start present');
    assert.ok(out.includes('<!-- CTOC:LESSONS v1 END -->'), 'v1 end present');
    assert.ok(!out.includes('CTOC:LESSONS v0'), 'no v0 markers remain');
    assert.equal(countOccurrences(out, START_MARKER), 1);
    assert.equal(countOccurrences(out, END_MARKER), 1);
    assert.ok(out.startsWith('HEADER\n\n'), 'leading prose preserved');
    assert.ok(out.endsWith('\n\nFOOTER'), 'trailing prose preserved');
  });

  it('creates CLAUDE.md when the target is missing', (t) => {
    const dir = mkTmpProject(t);
    const target = path.join(dir, 'CLAUDE.md');
    assert.ok(!fs.existsSync(target));
    const changed = lessons.ensureLessonsBlock(target, REPO_ROOT);
    assert.equal(changed, true);
    const out = fs.readFileSync(target, 'utf8');
    assert.equal(countOccurrences(out, START_MARKER), 1);
    assert.ok(out.includes('The measure is the human'));
  });
});

// ──────────────────────────────────────────────────────────────────────────
// AC6 / AC7 — SessionStart drives the injector (real main())
// ──────────────────────────────────────────────────────────────────────────

describe('SessionStart integration', () => {
  const ss = require('../src/hooks/SessionStart');

  async function runMainIn(dir) {
    const origCwd = process.cwd();
    const origLog = console.log;
    const origErr = console.error;
    console.log = () => {};
    console.error = () => {};
    process.chdir(dir);
    try {
      await ss.main();
    } finally {
      process.chdir(origCwd);
      console.log = origLog;
      console.error = origErr;
    }
  }

  function mkSessionProject(t) {
    const dir = mkTmpProject(t);
    fs.mkdirSync(path.join(dir, '.ctoc', 'state'), { recursive: true });
    return dir;
  }

  it('AC6: session_start_injects_block', async (t) => {
    const dir = mkSessionProject(t);
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Temp Project\n\nSome user prose.\n');

    await runMainIn(dir);

    const out = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    assert.equal(countOccurrences(out, START_MARKER), 1, 'exactly one START marker');
    assert.equal(countOccurrences(out, END_MARKER), 1, 'exactly one END marker');
    assert.ok(out.includes('The measure is the human'), 'canonical lesson body injected');
  });

  it('AC7: session_start_noop_on_second_run', async (t) => {
    const dir = mkSessionProject(t);
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'PRE\n\n' + canonicalBlock() + '\n\nPOST');

    const before = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    await runMainIn(dir);
    const after = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    assert.equal(after, before, 'CLAUDE.md byte-for-byte unchanged on no-op session start');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// AC8 — fail-open when the canonical source is missing
// ──────────────────────────────────────────────────────────────────────────

describe('ensureLessonsBlock — fail-open error paths', () => {
  it('AC8: ensure_lessons_fails_open_missing_source', (t) => {
    const dir = mkTmpProject(t);
    const target = path.join(dir, 'CLAUDE.md');
    const seed = '# Project\n\nuntouched\n';
    fs.writeFileSync(target, seed);

    // Copied module with NO source up its tree → primary misses; empty fallback
    // root → fallback misses too. The live repo source is never touched.
    const { mod, expectedPrimary } = loadModuleWithoutSource(t);
    const emptyRoot = mkTmpProject(t); // fallback dir without operating-lessons.md

    const { stderr, result } = captureStderr(() => mod.ensureLessonsBlock(target, emptyRoot));
    assert.equal(result, false, 'fails open with false');
    assert.ok(stderr.length > 0, 'stderr must be non-empty (no silent failure)');
    assert.ok(stderr.includes('operating-lessons.md'), 'stderr names the missing file');
    assert.ok(stderr.includes(expectedPrimary), 'stderr names the primary resolved path');
    // The real repo source is never the resolved primary here — proves no rename.
    assert.ok(!stderr.includes(SOURCE_PATH), 'live repo source path is not involved');
    assert.equal(fs.readFileSync(target, 'utf8'), seed, 'target left unchanged');
  });

  it('fails open when the canonical source lacks well-formed markers', (t) => {
    const dir = mkTmpProject(t);
    const target = path.join(dir, 'CLAUDE.md');
    fs.writeFileSync(target, '# Project\n\nuntouched\n');

    // Copied module (primary misses) + a fallback ctocRoot whose
    // operating-lessons.md exists but has NO markers. No live-repo rename.
    const { mod } = loadModuleWithoutSource(t);
    const fakeRoot = mkTmpProject(t);
    const fakeSrcDir = path.join(fakeRoot, '.ctoc', 'templates');
    fs.mkdirSync(fakeSrcDir, { recursive: true });
    fs.writeFileSync(path.join(fakeSrcDir, 'operating-lessons.md'), '# no markers here\n');

    const { stderr, result } = captureStderr(() => mod.ensureLessonsBlock(target, fakeRoot));
    assert.equal(result, false);
    assert.ok(stderr.length > 0, 'stderr non-empty');
    assert.ok(stderr.includes('marker'), 'stderr explains the missing markers');
  });

  it('fails open (does not splice) on a malformed managed block', (t) => {
    const dir = mkTmpProject(t);
    const target = path.join(dir, 'CLAUDE.md');
    const seed = '# Project\n\n' + START_MARKER + '\n\nstart without a matching end\n';
    fs.writeFileSync(target, seed);

    const { stderr, result } = captureStderr(() => lessons.ensureLessonsBlock(target, REPO_ROOT));
    assert.equal(result, false, 'malformed block -> no change');
    assert.ok(stderr.length > 0, 'stderr non-empty');
    assert.equal(fs.readFileSync(target, 'utf8'), seed, 'malformed file left untouched');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// AC9 — cross-platform path construction + atomic temp-then-rename
// ──────────────────────────────────────────────────────────────────────────

describe('ensureLessonsBlock — cross-platform atomic write', () => {
  it('AC9: ensure_lessons_cross_platform_atomic (win32 paths, single rename, no spawn)', (t) => {
    const srcContent = fs.readFileSync(SOURCE_PATH, 'utf8');
    const dir = mkTmpProject(t);
    const target = path.join(dir, 'CLAUDE.md');

    // Require a fresh module instance BEFORE installing fs mocks, so the loader's
    // own readFileSync of the module source is not intercepted.
    delete require.cache[require.resolve('../src/lib/claude-md-lessons')];
    const fresh = require('../src/lib/claude-md-lessons');

    const cp = require('child_process');
    const execSyncSpy = t.mock.method(cp, 'execSync', () => '');
    const spawnSpy = t.mock.method(cp, 'spawn', () => ({}));

    t.mock.method(fs, 'existsSync', (p) => {
      const s = String(p);
      if (s.includes('operating-lessons')) return true;
      if (s === target) return true;
      return false;
    });
    t.mock.method(fs, 'readFileSync', (p, ...rest) => {
      const s = String(p);
      if (s.includes('operating-lessons')) return srcContent;
      if (s === target) return '# Prose\n\nno managed block here\n';
      throw new Error('unexpected readFileSync: ' + s);
    });
    t.mock.method(fs, 'writeFileSync', () => {});
    const renameSpy = t.mock.method(fs, 'renameSync', () => {});

    const saved = {
      join: path.join, resolve: path.resolve, dirname: path.dirname,
      basename: path.basename, sep: path.sep, platform: process.platform
    };
    try {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      path.join = path.win32.join;
      path.resolve = path.win32.resolve;
      path.dirname = path.win32.dirname;
      path.basename = path.win32.basename;
      path.sep = path.win32.sep;

      const changed = fresh.ensureLessonsBlock(target, REPO_ROOT);

      assert.equal(changed, true, 'append path returns true');
      assert.equal(renameSpy.mock.calls.length, 1, 'fs.renameSync called exactly once');
      const args = renameSpy.mock.calls[0].arguments;
      assert.ok(String(args[0]).includes('\\'), `temp path uses win32 separator: ${args[0]}`);
      assert.equal(args[1], target, 'rename target is the CLAUDE.md path');
      assert.equal(execSyncSpy.mock.calls.length, 0, 'no child_process.execSync');
      assert.equal(spawnSpy.mock.calls.length, 0, 'no child_process.spawn');
    } finally {
      path.join = saved.join;
      path.resolve = saved.resolve;
      path.dirname = saved.dirname;
      path.basename = saved.basename;
      path.sep = saved.sep;
      Object.defineProperty(process, 'platform', { value: saved.platform, configurable: true });
      delete require.cache[require.resolve('../src/lib/claude-md-lessons')];
    }
  });

  it('atomic write retries with a same-directory temp on EXDEV', (t) => {
    const dir = mkTmpProject(t);
    const target = path.join(dir, 'CLAUDE.md');
    fs.writeFileSync(target, '# Prose\n\nno block\n');

    const realRename = fs.renameSync.bind(fs);
    let calls = 0;
    t.mock.method(fs, 'renameSync', (a, b) => {
      calls++;
      if (calls === 1) { const e = new Error('cross-device link'); e.code = 'EXDEV'; throw e; }
      return realRename(a, b);
    });

    const changed = lessons.ensureLessonsBlock(target, REPO_ROOT);
    assert.equal(changed, true);
    assert.ok(calls >= 2, 'EXDEV triggers a second (same-dir) rename');
    const out = fs.readFileSync(target, 'utf8');
    assert.ok(out.includes(START_MARKER));
    assert.ok(out.includes('The measure is the human'));
  });

  it('fails open when a non-EXDEV rename error occurs', (t) => {
    const dir = mkTmpProject(t);
    const target = path.join(dir, 'CLAUDE.md');
    const seed = '# Prose\n\nno block\n';
    fs.writeFileSync(target, seed);

    t.mock.method(fs, 'renameSync', () => { const e = new Error('disk full'); e.code = 'ENOSPC'; throw e; });

    const { stderr, result } = captureStderr(() => lessons.ensureLessonsBlock(target, REPO_ROOT));
    assert.equal(result, false, 'fails open');
    assert.ok(stderr.length > 0, 'stderr non-empty');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// AC10 — CRLF line endings
// ──────────────────────────────────────────────────────────────────────────

describe('ensureLessonsBlock — CRLF handling', () => {
  it('AC10: ensure_lessons_idempotent_crlf', (t) => {
    const dir = mkTmpProject(t);
    const target = path.join(dir, 'CLAUDE.md');
    const lf = 'PRE\n\n' + canonicalBlock() + '\n\nPOST';
    const crlf = lf.replace(/\n/g, '\r\n');
    fs.writeFileSync(target, crlf);

    const first = lessons.ensureLessonsBlock(target, REPO_ROOT);
    assert.equal(first, false, 'CRLF-encoded current block is a no-op');

    const out = fs.readFileSync(target, 'utf8');
    assert.equal(countOccurrences(out, START_MARKER), 1);
    assert.equal(countOccurrences(out, END_MARKER), 1);
    assert.ok(out.includes('\r\n'), 'CRLF endings present');
    assert.ok(!/[^\r]\n/.test(out) && !/^\n/.test(out), 'no lone LF — original CRLF preserved');

    const second = lessons.ensureLessonsBlock(target, REPO_ROOT);
    assert.equal(second, false);
    assert.equal(fs.readFileSync(target, 'utf8'), crlf, 'file unchanged across calls');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// AC11 — markers inside fenced code blocks are ignored
// ──────────────────────────────────────────────────────────────────────────

describe('ensureLessonsBlock — fenced code blocks', () => {
  it('AC11: ensure_lessons_ignores_fenced_markers', (t) => {
    const dir = mkTmpProject(t);
    const target = path.join(dir, 'CLAUDE.md');
    const fenced = [
      '# Project',
      '',
      'Example of the markers (documentation only):',
      '',
      '```text',
      START_MARKER,
      END_MARKER,
      '```',
      '',
      'End of docs.'
    ].join('\n');
    fs.writeFileSync(target, fenced);

    const changed = lessons.ensureLessonsBlock(target, REPO_ROOT);
    assert.equal(changed, true, 'a real block is appended (fenced markers ignored)');

    const out = fs.readFileSync(target, 'utf8');
    // One in the fence + one real block.
    assert.equal(countOccurrences(out, START_MARKER), 2, 'fenced marker + one real marker');
    assert.equal(countOccurrences(out, END_MARKER), 2);
    assert.ok(out.includes(fenced), 'fenced documentation preserved byte-for-byte');
    assert.ok(out.includes('The measure is the human'), 'real lesson body appended');

    // Idempotent on a second call (the real block is now found outside the fence).
    assert.equal(lessons.ensureLessonsBlock(target, REPO_ROOT), false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// AC12 — /ctoc:update refreshes the local block
// ──────────────────────────────────────────────────────────────────────────

describe('update command — local lessons refresh', () => {
  it('AC12: update_injects_lessons_block (no network; real refreshLocalLessons)', (t) => {
    // require.main guard means requiring update.js does NOT run the network update.
    delete require.cache[require.resolve('../src/commands/update')];
    const update = require('../src/commands/update');
    assert.equal(typeof update.refreshLocalLessons, 'function', 'refreshLocalLessons exported');

    const dir = mkTmpProject(t);
    const target = path.join(dir, 'CLAUDE.md');
    fs.writeFileSync(target, '# Project\n\nuser prose\n');

    const origCwd = process.cwd();
    process.chdir(dir);
    try {
      update.refreshLocalLessons();
      const out = fs.readFileSync(target, 'utf8');
      assert.equal(countOccurrences(out, START_MARKER), 1);
      assert.equal(countOccurrences(out, END_MARKER), 1);
      assert.ok(out.includes('The measure is the human'));

      // Second invocation is a byte-for-byte no-op.
      update.refreshLocalLessons();
      assert.equal(fs.readFileSync(target, 'utf8'), out, 'second refresh is a no-op');

      // Forced-throw variant: a lessons failure is caught and logged, never thrown.
      const mod = require('../src/lib/claude-md-lessons');
      const realFn = mod.ensureLessonsBlock;
      mod.ensureLessonsBlock = () => { throw new Error('boom'); };
      try {
        const { stderr } = captureStderr(() => {
          assert.doesNotThrow(() => update.refreshLocalLessons());
        });
        assert.ok(stderr.length > 0, 'failure logged to stderr');
      } finally {
        mod.ensureLessonsBlock = realFn;
      }
    } finally {
      process.chdir(origCwd);
      delete require.cache[require.resolve('../src/commands/update')];
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Sync-guard — generateContext banner labels match operating-lessons.md
// ──────────────────────────────────────────────────────────────────────────

describe('generateContext <-> operating-lessons.md sync-guard', () => {
  it('generatecontext_syncguard_step_labels (exact ordered sequence + shared labels)', () => {
    const ss = require('../src/hooks/SessionStart');
    const banner = ss.generateContext({ languages: [] }, null, '0.0.0', null, null);
    const lessonsText = fs.readFileSync(SOURCE_PATH, 'utf8');

    // The full ordered 16-step sequence must be present, in order, in the banner.
    const ORDERED = [
      '1:IDEATE', '2:ASSESS', '3:ALIGN', '4:CAPTURE', '5:PLAN', '6:DESIGN', '7:SPEC',
      '8:TEST', '9:PREPARE', '10:IMPLEMENT', '11:REVIEW',
      '12:OPTIMIZE', '13:SECURE', '14:VERIFY', '15:DOCUMENT', '16:FINAL-REVIEW'
    ];
    let pos = -1;
    for (const label of ORDERED) {
      const i = banner.indexOf(label);
      assert.ok(i > pos, `banner step label present and in order: ${label}`);
      pos = i;
    }

    // Shared key labels must match between the banner and the canonical source.
    for (const label of ['8:TEST', '10:IMPLEMENT', '14:VERIFY']) {
      assert.ok(banner.includes(label), `banner has ${label}`);
      assert.ok(lessonsText.includes(label), `operating-lessons.md has ${label}`);
    }

    // Compound 16-step token (NOT the bare digit) present in both surfaces.
    assert.ok(banner.includes('16 Steps'), 'banner names "16 Steps"');
    assert.ok(/16[ -]step/i.test(lessonsText), 'operating-lessons.md names the 16-step loop');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// resolveLessonsSource — fallback resolution
// ──────────────────────────────────────────────────────────────────────────

describe('resolveLessonsSource', () => {
  it('resolves the primary (__dirname-relative) source', () => {
    assert.equal(lessons.resolveLessonsSource(undefined), SOURCE_PATH);
  });

  it('returns null when neither primary nor fallback exists', (t) => {
    // Copied module with no source up its tree + an empty fallback root.
    // The live repo source is never renamed.
    const { mod } = loadModuleWithoutSource(t);
    const emptyRoot = mkTmpProject(t);
    assert.equal(mod.resolveLessonsSource(emptyRoot), null);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Pre-Gate-3 hardening — phantom fence, mixed EOL, non-Error throw, wx, size cap
// ──────────────────────────────────────────────────────────────────────────

describe('ensureLessonsBlock — pre-Gate-3 hardening', () => {
  it('finds the real block beneath an UNTERMINATED code fence (no duplicate append)', (t) => {
    const dir = mkTmpProject(t);
    const target = path.join(dir, 'CLAUDE.md');
    // An unclosed ``` fence in user prose ABOVE a real, current managed block.
    const content = [
      '# Project',
      '',
      'A snippet I forgot to close:',
      '',
      '```js',
      'const x = 1;',
      '',
      canonicalBlock(),
      '',
      'trailing prose'
    ].join('\n');
    fs.writeFileSync(target, content);

    // The existing current block is FOUND (re-scan recovers it) -> idempotent no-op.
    const changed = lessons.ensureLessonsBlock(target, REPO_ROOT);
    assert.equal(changed, false, 'current block found beneath unterminated fence -> no-op');

    const out = fs.readFileSync(target, 'utf8');
    assert.equal(countOccurrences(out, START_MARKER), 1, 'no duplicate block appended');
    assert.equal(countOccurrences(out, END_MARKER), 1);
    assert.equal(out, content, 'file byte-for-byte unchanged');

    // And a second call is still a stable no-op (no churn).
    assert.equal(lessons.ensureLessonsBlock(target, REPO_ROOT), false);
    assert.equal(fs.readFileSync(target, 'utf8'), content);
  });

  it('preserves every byte OUTSIDE the block on a mixed-EOL file', (t) => {
    const dir = mkTmpProject(t);
    const target = path.join(dir, 'CLAUDE.md');
    // Deliberately mixed: LF-only and CRLF lines in the user prose.
    const before = 'First\nSecond\r\nThird\n';   // First→Second is LF; Second→Third is CRLF
    const after = 'After1\r\nAfter2\n';           // CRLF then LF
    const content = before + V0_BLOCK + '\n' + after;
    fs.writeFileSync(target, content, 'utf8');

    const changed = lessons.ensureLessonsBlock(target, REPO_ROOT);
    assert.equal(changed, true, 'v0 -> v1 upgrade performed');

    const out = fs.readFileSync(target, 'utf8');

    // Region BEFORE the block is byte-for-byte identical (mixed EOL intact).
    const outBefore = out.slice(0, out.indexOf(START_MARKER));
    assert.equal(outBefore, before, 'prose before block preserved byte-for-byte');

    // Region AFTER the block ends with the original mixed-EOL trailing prose.
    assert.ok(out.endsWith(after), 'prose after block preserved byte-for-byte');

    // The old (buggy) restoreEol globally re-CRLF'd the whole file; assert the
    // originally-LF boundary was NOT upgraded to CRLF.
    assert.ok(out.includes('First\nSecond\r\nThird\n'), 'LF/CRLF mix outside block intact');
    assert.ok(!out.includes('First\r\n'), 'an originally-LF line was not re-encoded to CRLF');
  });

  it('catch handler tolerates a non-Error (null) throw without re-throwing', (t) => {
    const dir = mkTmpProject(t);
    const target = path.join(dir, 'CLAUDE.md');
    fs.writeFileSync(target, '# Project\n');
    // Force a thrown non-Error from inside the try body.
    t.mock.method(fs, 'readFileSync', () => { throw null; });
    let result;
    const { stderr } = captureStderr(() => {
      assert.doesNotThrow(() => { result = lessons.ensureLessonsBlock(target, REPO_ROOT); });
    });
    assert.equal(result, false, 'fails open');
    assert.ok(stderr.length > 0, 'stderr non-empty even for a null throw');
  });

  it('writes the atomic temp file with the exclusive (wx) flag', (t) => {
    const dir = mkTmpProject(t);
    const target = path.join(dir, 'CLAUDE.md');
    fs.writeFileSync(target, '# Prose\n\nno block\n'); // seed before installing the spy
    let sawWx = false;
    const realWrite = fs.writeFileSync.bind(fs);
    t.mock.method(fs, 'writeFileSync', (p, data, opts) => {
      if (opts && typeof opts === 'object' && opts.flag === 'wx') sawWx = true;
      return realWrite(p, data, opts);
    });
    const changed = lessons.ensureLessonsBlock(target, REPO_ROOT);
    assert.equal(changed, true, 'block appended');
    assert.ok(sawWx, 'temp file opened O_EXCL (flag: wx) — fail-closed against symlink/pre-existing');
  });

  it('skips and fails open on a CLAUDE.md larger than the size cap', (t) => {
    const dir = mkTmpProject(t);
    const target = path.join(dir, 'CLAUDE.md');
    const big = 'x'.repeat(2 * 1024 * 1024 + 1024); // > 2 MiB
    fs.writeFileSync(target, big, 'utf8');

    const { stderr, result } = captureStderr(() => lessons.ensureLessonsBlock(target, REPO_ROOT));
    assert.equal(result, false, 'oversized file -> fail-open false');
    assert.ok(stderr.length > 0, 'stderr non-empty (no silent skip)');
    assert.equal(fs.readFileSync(target, 'utf8'), big, 'oversized file left untouched (no write)');
  });
});

describe('exported constants', () => {
  it('marker constants match the v1 contract', () => {
    assert.equal(LESSONS_VERSION, 'v1');
    assert.equal(START_MARKER, '<!-- CTOC:LESSONS v1 START -->');
    assert.equal(END_MARKER, '<!-- CTOC:LESSONS v1 END -->');
    assert.equal(MANAGED_NOTICE, '<!-- Content between these markers is CTOC-managed. Do not edit manually. -->');
  });
});
