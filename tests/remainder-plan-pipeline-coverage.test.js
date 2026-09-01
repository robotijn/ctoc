'use strict';

/**
 * Remainder coverage — the plan pipeline, plan state and the plan index.
 *
 * Fourteen modules parse, validate, migrate and index plans. Each carried a small
 * dark range at the 2026-08-31 / 2026-09-01 measurement. This file classifies every
 * one of those ranges and, where the range is reachable, asserts the BEHAVIOUR the
 * range implements — never merely touches the line. Every case here is one a
 * mutation of the named line breaks; the mutants that were actually run, and the
 * case that killed each, are recorded in the plan's execution record
 * (plans/.../00250-close-the-coverage-holes-s16-remainder-plan-pipeline.md).
 *
 * Fixtures are temp projects under os.tmpdir(). NOTHING here reads, writes, moves
 * or approves a real plan in this repository, nothing is written under
 * .ctoc/approvals/, and no case makes a network request of any kind.
 *
 * Faults are injected at a TRUE boundary only — safe-fs, a dependency module's
 * exported function (via a scoped Module._load interception), or an injected
 * `fetch`/embedder. The function under test is never stubbed. Every mock is
 * restored; the Module._load interceptions restore both the loader and the
 * require cache in a `finally`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * (a) REACHABLE — covered below, one named case per range
 * ─────────────────────────────────────────────────────────────────────────────
 *   src/lib/documented-counts.js 165-166
 *       checkPlanDeclaresCountMovers's fail-soft catch: an unreadable tree yields
 *       currentCount NULL — null, not 0, because nothing was counted.
 *   src/lib/plan-validator.js 1124-1125
 *       planSlugExists's per-stage `catch { continue }`: one unreadable stage
 *       directory must not abort the parent-plan lookup.
 *   src/lib/project-root.js 169-179
 *       describeProjectRoot's outer catch: a walk that could not complete reports
 *       marker 'fallback' WITH a fallbackReason naming the failure — never a
 *       silent "no project found".
 *   src/scripts/collapse-stacked-frontmatter.js 58-63
 *       atomicWriteFileSync's catch: the REAL write error is rethrown, and a
 *       failed temp cleanup is recorded on it (tempCleanupFailed) rather than
 *       swallowed.
 *   src/scripts/collapse-stacked-frontmatter.js 166-167
 *       the `require.main === module` command entry — proven by SPAWNING the
 *       script as a child process against a temp plan (never against this
 *       repository's plans/review, which the command's own default would target).
 *   src/lib/frontmatter-merge.js 188-193
 *       mergeBlocksFirstKeyWins's stray-line arm: a non-blank stray (a YAML
 *       comment) survives the merge; a pure blank is dropped.
 *   src/lib/state.js 147
 *       applyTodoOrder's tie-break: when two plans vanish between readPlans's
 *       directory read and the queue-order read, they tie at rank Infinity and
 *       order by creation time.
 *   src/lib/state.js 150-151
 *       applyTodoOrder's catch: a queue-order read that throws falls back to
 *       creation order and never throws out of readPlans.
 *   src/lib/traceability-matrix.js 64-65
 *       diskGeneration's catch: an unreadable matrix reads as generation 0, and
 *       the compare-and-swap then REFUSES a versioned write rather than
 *       clobbering it.
 *   src/lib/migration-safety-checker.js 1030-1031, 1053-1054, 1061-1062
 *       the migration-discovery walk's three fail-soft arms: a directory entry
 *       whose type cannot be determined is skipped (not fatal, not a break), and
 *       an unreadable subdirectory ends that branch only.
 *   src/lib/migration-safety-checker.js 1220-1221
 *       runAtlas's exit-0-with-output arm: atlas ran and printed a report, which
 *       is surfaced verbatim as a loud entry rather than read as a clean pass.
 *   src/lib/plan-index/conflict-detect.js 119-120, 174-175
 *       the two glob-compilation catches. Reached by injecting a throw at the
 *       plan-coverage boundary (see the note on unreachable-today faults below).
 *   src/lib/plan-index/search.js 327-328
 *       a throwing embedder degrades hybrid search to lexical-only and SAYS so
 *       (degraded === 'no-embedding') — it never returns silently-worse results.
 *   src/lib/plan-index/ollama-client.js 44-46
 *       rejectOnAbort's already-aborted arm: a response whose headers arrive
 *       after the timeout has already fired rejects immediately instead of
 *       waiting for an abort event that will never come again. Driven with an
 *       INJECTED fetch; no network request is made.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * (b) PERMISSION-GATED / TERMINAL-ONLY — none.
 * ─────────────────────────────────────────────────────────────────────────────
 *   No range in these fourteen modules depends on filesystem permission bits or
 *   on an interactive terminal, so this file contains no skips, loud or silent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * (c) DEAD — reported, never deleted. Each has a GUARD case below asserting the
 *     invariant that makes it dead, so a change that revives the line fails here
 *     first and is looked at deliberately.
 * ─────────────────────────────────────────────────────────────────────────────
 *   src/lib/plan-validator.js 243-245
 *       "instruction adherence produced errors → invalidate the plan".
 *       validateInstructionAdherence contains no `errors.push` on any path — it
 *       is warnings-only — so the arm can never fire. The check reads as blocking
 *       and is advisory in fact.
 *   src/lib/traceability-matrix.js 201  and  src/lib/task-registry.js 578
 *       the `throw lastErr || new <Stale…>Error(...)` fallbacks. The only path
 *       that reaches the give-up assigns lastErr first, so the fallback argument
 *       is never constructed. (Line 200 / 577 respectively ARE covered — only the
 *       unreachable fallback expression is dark.)
 *   src/lib/migration-safety-checker.js 952-953
 *       efDownBodyLines's fail-soft catch. Its body is a bounded loop over string
 *       indexOf / a brace scan / a newline count and a Set insert — no operation
 *       in it can throw for any string input.
 *   src/lib/plan-index/fusion.js 78
 *       the comparator's `return 0`. fuseRRF accumulates into a Map and rejects a
 *       non-string id, so the two sides are always DISTINCT STRINGS and exactly
 *       one of `<` / `>` holds.
 *   src/lib/plan-index/store.js 386-388
 *       atomicSave's memory-only guard. atomicSave has exactly one call site
 *       (withLock), and withLock returns before reaching it in memory-only mode,
 *       so this guard is shadowed by the one in its only caller.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A note on the two conflict-detect arms, stated plainly rather than hidden.
 * ─────────────────────────────────────────────────────────────────────────────
 * plan-coverage's globToRegex compiles a glob with a non-throwing tokenizer and
 * matches it with iterative dynamic programming, so for STRING input it cannot
 * throw today; the two catches are therefore unreachable through natural input.
 * They are still asserted, by making the DEPENDENCY throw at the module boundary,
 * because the arms exist to survive a change to that dependency and because the
 * two consumers of the same call deliberately fail in OPPOSITE directions:
 * conflict-detect (advisory) fails open to "no overlap", while plan-coverage's own
 * touchesOverlap (a safety oracle) fails closed to "overlap — block". A silent
 * flip of either direction is what these cases catch.
 *
 * AI-authored; every assertion was read line-by-line against the production source
 * and confirmed against a mutant of the line it names.
 */

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');

const safeFs = require('../src/lib/safe-fs');

const REPO_ROOT = path.resolve(__dirname, '..');

// ── temp fixtures ─────────────────────────────────────────────────────────────

/** @type {string[]} */
const tmpDirs = [];

/**
 * A throwaway project directory under os.tmpdir(). Never this repository.
 * @param {string} tag
 * @returns {string}
 */
function tmpProject(tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ctoc-${tag}-`));
  tmpDirs.push(dir);
  return dir;
}

after(() => {
  for (const d of tmpDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* a fixture that will not delete must not fail the suite */
    }
  }
});

/**
 * Write a file, creating parents.
 * @param {string} file
 * @param {string} content
 */
function writeFixture(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// ── boundary-fault helpers ────────────────────────────────────────────────────

/**
 * Replace one method on the shared safe-fs module object for the duration of
 * `body`, restoring it unconditionally. Call sites look the property up at call
 * time, so this is the real boundary — the function under test is untouched.
 *
 * @template T
 * @param {string} method
 * @param {(real: Function) => Function} make - receives the real implementation
 * @param {() => T} body
 * @returns {T}
 */
function withSafeFs(method, make, body) {
  const real = /** @type {any} */ (safeFs)[method];
  /** @type {any} */ (safeFs)[method] = make(real);
  try {
    return body();
  } finally {
    /** @type {any} */ (safeFs)[method] = real;
  }
}

/**
 * Load `targetAbs` FRESH with one of its dependencies replaced, then restore both
 * the module loader and the require cache. This is how a dependency destructured
 * at load time (`const { f } = require('./dep')`) is faulted at its boundary —
 * a post-load property assignment cannot reach the captured binding.
 *
 * A builtin resolves to its bare specifier (`child_process`), not to a path, and a
 * `node:`-prefixed request resolves separately, so the dependency is matched against
 * a SET of accepted specifiers rather than one string.
 *
 * @template T
 * @param {string} targetAbs - resolved path of the module under test
 * @param {string|string[]} depIds - accepted resolved specifiers of the dependency
 * @param {(realDep: any) => any} makeStub
 * @param {(mod: any) => T} body
 * @returns {T}
 */
function withDependencyStub(targetAbs, depIds, makeStub, body) {
  const accepted = new Set(Array.isArray(depIds) ? depIds : [depIds]);
  const realLoad = Module._load;
  const stub = makeStub(require([...accepted][0]));
  const savedTarget = require.cache[targetAbs];
  delete require.cache[targetAbs];
  Module._load = function patchedLoad(request, parent, isMain) {
    // An unresolvable request is simply not the dependency being replaced; it is
    // left undefined and passed straight through to the real loader, which raises
    // the real error. Nothing here is nulled away or skipped.
    let resolved;
    try {
      resolved = Module._resolveFilename(request, parent, isMain);
    } catch {
      /* not resolvable from here — never this dependency */
    }
    if (accepted.has(resolved)) return stub;
    return realLoad.apply(this, arguments);
  };
  try {
    const mod = require(targetAbs);
    return body(mod);
  } finally {
    Module._load = realLoad;
    delete require.cache[targetAbs];
    if (savedTarget) require.cache[targetAbs] = savedTarget;
  }
}

/**
 * A directory entry whose type cannot be determined — the shape a filesystem
 * hands back when an lstat behind a Dirent fails. Used to drive the walk's
 * "skip this entry" arms.
 * @param {string} name
 * @returns {any}
 */
function hostileDirent(name) {
  return {
    name,
    isDirectory() {
      throw new Error(`injected: entry type unavailable for ${name}`);
    },
    isFile() {
      throw new Error(`injected: entry type unavailable for ${name}`);
    },
  };
}

/**
 * A well-behaved directory entry.
 * @param {string} name
 * @param {boolean} dir
 * @returns {any}
 */
function dirent(name, dir) {
  return { name, isDirectory: () => dir, isFile: () => !dir };
}

// ═════════════════════════════════════════════════════════════════════════════
// (a) src/lib/documented-counts.js 165-166
// ═════════════════════════════════════════════════════════════════════════════

test('a component count that could not be computed is reported as null, never 0 — nobody counted', () => {
  const root = tmpProject('doccounts');
  // A plan declaring a NEW test file moves the documented test-file count, so the
  // offender exists and the live counts are read.
  const declared = ['tests/a-brand-new-test-file-that-does-not-exist.test.js'];

  const target = require.resolve('../src/lib/documented-counts');
  const dep = require.resolve('../src/lib/doc-counts');

  const result = withDependencyStub(
    target,
    dep,
    () => ({
      computeDocCounts() {
        throw new Error('injected: the documented-count tree could not be read');
      },
    }),
    (mod) => mod.checkPlanDeclaresCountMovers(declared, root),
  );

  assert.equal(result.ok, false, 'a plan that moves a count without declaring CLAUDE.md is not ok');
  assert.equal(result.offenders.length, 1, 'the offender is still reported when the count cannot be read');
  const [offender] = result.offenders;
  assert.equal(
    offender.currentCount,
    null,
    'an uncomputable count is null — 0 would be a measurement, and nothing was measured',
  );
  assert.notEqual(offender.currentCount, 0, 'null must never collapse to 0');
  assert.equal(offender.countClass, 'testFiles');
});

// ═════════════════════════════════════════════════════════════════════════════
// (a) src/lib/plan-validator.js 1124-1125
// ═════════════════════════════════════════════════════════════════════════════

test('one unreadable plan stage does not abort the parent-plan lookup — later stages are still searched', () => {
  const root = tmpProject('planslug');
  // The parent lives in `functional`, which is searched AFTER `vision`.
  writeFixture(path.join(root, 'plans', 'vision', '.keep'), '');
  writeFixture(path.join(root, 'plans', 'functional', 'the-parent.md'), '---\ntitle: parent\n---\n');

  const visionDir = path.join(root, 'plans', 'vision');
  const { validateParentPlan } = require('../src/lib/plan-validator');
  const content = '---\ntitle: child\nparent_plan: the-parent\n---\n\n# child\n';

  const result = withSafeFs(
    'readdirSync',
    (real) =>
      function readdirSyncFaulted(p, opts) {
        if (path.resolve(String(p)) === path.resolve(visionDir)) {
          throw new Error('injected: stage directory unreadable');
        }
        return real(p, opts);
      },
    () => validateParentPlan(content, root),
  );

  assert.equal(
    result.checklist.parentPlan.resolved,
    true,
    'the parent is found in a later stage even though an earlier stage could not be listed',
  );
  assert.deepEqual(result.warnings, [], 'no dangling-reference warning is raised');
});

// ═════════════════════════════════════════════════════════════════════════════
// (a) src/lib/project-root.js 169-179
// ═════════════════════════════════════════════════════════════════════════════

test('a project-root walk that could not complete says so — fallback WITH a reason, never a silent verdict', () => {
  const root = tmpProject('projroot');
  const { describeProjectRoot } = require('../src/lib/project-root');

  const clean = describeProjectRoot(root);
  assert.equal(
    clean.fallbackReason,
    'no project marker found in the examined ancestry',
    'a completed walk that found nothing says it found nothing',
  );

  const faulted = withSafeFs(
    'existsSync',
    (real) =>
      function existsSyncFaulted(p) {
        if (path.resolve(String(p)).startsWith(path.resolve(root))) {
          throw new Error('injected: ancestor unreadable');
        }
        return real(p);
      },
    () => describeProjectRoot(root),
  );

  assert.equal(faulted.marker, 'fallback');
  assert.equal(faulted.root, process.cwd(), 'the fallback is the working directory');
  assert.match(
    String(faulted.fallbackReason),
    /^walk failed: /,
    'a failed walk is distinguishable from a completed walk that found nothing',
  );
  assert.notEqual(
    faulted.fallbackReason,
    clean.fallbackReason,
    '"could not look" must never read as "looked and found nothing"',
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// (a) src/scripts/collapse-stacked-frontmatter.js 58-63
// ═════════════════════════════════════════════════════════════════════════════

const STACKED_PLAN = [
  '---',
  'approved_by: human',
  '---',
  '---',
  'title: a stacked plan',
  'files:',
  '  - src/x.js',
  '---',
  '',
  '# body',
  '',
].join('\n');

test('a failed plan write rethrows the REAL write error, and a failed temp cleanup rides on it', () => {
  const root = tmpProject('collapse-write');
  const planPath = path.join(root, 'plans', 'review', 'stacked.md');
  writeFixture(planPath, STACKED_PLAN);

  const { migrateFile } = require('../src/scripts/collapse-stacked-frontmatter');

  // 1. cleanup SUCCEEDS: the write error is the verdict and carries no cleanup note.
  const cleanupOk = withSafeFs(
    'renameSync',
    () =>
      function renameSyncFaulted() {
        throw new Error('injected: rename onto the plan failed');
      },
    () => {
      try {
        migrateFile(planPath, root);
        return null;
      } catch (err) {
        return err;
      }
    },
  );
  assert.ok(cleanupOk, 'the write failure is not swallowed');
  assert.match(String(cleanupOk.message), /injected: rename onto the plan failed/);
  assert.equal(
    cleanupOk.tempCleanupFailed,
    undefined,
    'a cleanup that succeeded leaves no note on the error',
  );

  // 2. cleanup FAILS: the ORIGINAL write error is still the verdict, and the
  //    leftover temp file is recorded on it rather than hidden.
  const cleanupBad = withSafeFs(
    'renameSync',
    () =>
      function renameSyncFaulted() {
        throw new Error('injected: rename onto the plan failed');
      },
    () =>
      withSafeFs(
        'unlinkSync',
        () =>
          function unlinkSyncFaulted() {
            throw new Error('injected: temp file could not be removed');
          },
        () => {
          try {
            migrateFile(planPath, root);
            return null;
          } catch (err) {
            return err;
          }
        },
      ),
  );
  assert.ok(cleanupBad);
  assert.match(
    String(cleanupBad.message),
    /injected: rename onto the plan failed/,
    'the ORIGINAL write error is the verdict, not the cleanup error',
  );
  assert.equal(
    cleanupBad.tempCleanupFailed,
    'injected: temp file could not be removed',
    'the leftover temp file is recorded on the thrown error, not swallowed',
  );

  assert.equal(
    fs.readFileSync(planPath, 'utf8'),
    STACKED_PLAN,
    'a failed migration leaves the plan byte-identical',
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// (a) src/scripts/collapse-stacked-frontmatter.js 166-167
// ═════════════════════════════════════════════════════════════════════════════

test('the frontmatter-collapse command runs as a command — spawned against a temp plan, never plans/review', () => {
  const root = tmpProject('collapse-cli');
  const planPath = path.join(root, 'plans', 'review', 'stacked.md');
  writeFixture(planPath, STACKED_PLAN);

  // EXPLICIT target path. With no argument the command defaults to
  // <root>/plans/review, which is why this never runs argument-less here.
  const out = execFileSync(
    process.execPath,
    [path.join(REPO_ROOT, 'src', 'scripts', 'collapse-stacked-frontmatter.js'), planPath],
    { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );

  assert.match(out, /collapsed stacked\.md/, 'the command reports the file it collapsed');
  assert.match(out, /1 collapsed, 0 already clean, 0 refused\./, 'the command prints its tally');

  const after = fs.readFileSync(planPath, 'utf8');
  assert.equal(
    (after.match(/^---$/gm) || []).length,
    2,
    'the two stacked blocks became exactly one frontmatter block',
  );
  assert.match(after, /approved_by: human/, 'the approval marker survived the collapse');
  assert.match(after, /title: a stacked plan/, 'the plan frontmatter survived the collapse');
});

// ═════════════════════════════════════════════════════════════════════════════
// (a) src/lib/frontmatter-merge.js 188-193
// ═════════════════════════════════════════════════════════════════════════════

test('merging stacked frontmatter keeps a stray comment line and drops a pure blank — no silent data loss', () => {
  const { mergeStackedFrontmatter } = require('../src/lib/frontmatter-merge');

  const content = [
    '---',
    '# a human note that is not a key',
    'approved_by: human',
    '---',
    '---',
    '',
    'title: merged',
    '---',
    '',
    '# body',
    '',
  ].join('\n');

  const { changed, content: merged } = mergeStackedFrontmatter(content);
  assert.equal(changed, true);

  const block = merged.split('---')[1];
  assert.match(
    block,
    /# a human note that is not a key/,
    'a non-blank stray line survives the merge rather than being dropped',
  );
  assert.match(block, /approved_by: human/);
  assert.match(block, /title: merged/);
  assert.equal(
    /\n[ \t]*\n[ \t]*\n/.test(block),
    false,
    'the second block\'s leading blank stray is dropped — no interior gap in the emitted block',
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// (a) src/lib/state.js 147 and 150-151
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A todo stage with three plans and a queue-order file, plus deterministic
 * creation times injected at the stat boundary (birthtime resolution is a
 * filesystem property and must not decide a test's outcome).
 * @param {string[]} order names listed in .ctoc/state/todo-order.json
 * @returns {{ root: string, todoDir: string, birth: Record<string, number> }}
 */
function todoFixture(order) {
  const root = tmpProject('state-todo');
  const todoDir = path.join(root, 'plans', 'todo');
  for (const name of ['a.md', 'b.md', 'c.md']) {
    writeFixture(path.join(todoDir, name), `---\ntitle: ${name}\n---\n\n# ${name}\n`);
  }
  writeFixture(
    path.join(root, '.ctoc', 'state', 'todo-order.json'),
    JSON.stringify(order),
  );
  // c is oldest, then b, then a — deliberately the reverse of directory order.
  return { root, todoDir, birth: { 'a.md': 3000, 'b.md': 2000, 'c.md': 1000 } };
}

/**
 * Pin creation/modification times for the fixture's plans so ordering assertions
 * are exact on every filesystem.
 * @param {Record<string, number>} birth
 * @param {Function} real
 * @returns {Function}
 */
function statWithPinnedBirthtimes(birth, real) {
  return function statSyncPinned(p, opts) {
    const name = path.basename(String(p));
    if (Object.prototype.hasOwnProperty.call(birth, name)) {
      const stat = real(p, opts);
      return Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, {
        birthtime: new Date(birth[name]),
        mtime: new Date(birth[name]),
      });
    }
    return real(p, opts);
  };
}

test('two plans that vanish between the queue read and the order read tie, and break the tie by creation time', () => {
  const { todoDir, birth } = todoFixture(['a.md']);
  const { readPlans } = require('../src/lib/state');

  let readdirCalls = 0;
  const plans = withSafeFs(
    'statSync',
    (real) => statWithPinnedBirthtimes(birth, real),
    () =>
      withSafeFs(
        'readdirSync',
        (real) =>
          function readdirSyncRacing(p, opts) {
            if (path.resolve(String(p)) === path.resolve(todoDir)) {
              readdirCalls += 1;
              // The SECOND read (the queue-order read) sees b and c already gone.
              if (readdirCalls >= 2) return ['a.md'];
            }
            return real(p, opts);
          },
        () => readPlans(todoDir),
      ),
  );

  assert.equal(readdirCalls, 2, 'the queue reads the directory twice — that is the race being covered');
  assert.deepEqual(
    plans.map((p) => p.name),
    ['a', 'c', 'b'],
    'the ranked plan leads; the two unranked plans tie and order oldest-first, not directory-first',
  );
});

test('a queue-order read that throws falls back to creation order and never throws out of readPlans', () => {
  const { todoDir, birth } = todoFixture(['a.md']);
  const { readPlans } = require('../src/lib/state');

  let readdirCalls = 0;
  const plans = withSafeFs(
    'statSync',
    (real) => statWithPinnedBirthtimes(birth, real),
    () =>
      withSafeFs(
        'readdirSync',
        (real) =>
          function readdirSyncFaulted(p, opts) {
            if (path.resolve(String(p)) === path.resolve(todoDir)) {
              readdirCalls += 1;
              if (readdirCalls >= 2) throw new Error('injected: queue directory unreadable');
            }
            return real(p, opts);
          },
        () => readPlans(todoDir),
      ),
  );

  assert.deepEqual(
    plans.map((p) => p.name),
    ['c', 'b', 'a'],
    'the explicit queue order is abandoned for pure creation order — a.md is no longer first',
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// (a) src/lib/traceability-matrix.js 64-65
// ═════════════════════════════════════════════════════════════════════════════

test('an unreadable traceability matrix reads as generation 0, and the compare-and-swap then refuses the write', () => {
  const root = tmpProject('tracematrix');
  const tm = require('../src/lib/traceability-matrix');
  const matrixPath = path.join(root, tm.MATRIX_PATH);

  tm.upsert(root, { id: 'REQ-1', description: 'first' });
  tm.upsert(root, { id: 'REQ-2', description: 'second' });
  const held = tm.load(root);
  assert.ok(held.generation >= 2, 'the fixture matrix is at a generation above 0');

  const before = fs.readFileSync(matrixPath, 'utf8');

  const err = withSafeFs(
    'readFileSync',
    (real) =>
      function readFileSyncFaulted(p, opts) {
        if (path.resolve(String(p)) === path.resolve(matrixPath)) {
          throw new Error('injected: matrix unreadable');
        }
        return real(p, opts);
      },
    () => {
      try {
        tm.save(root, held);
        return null;
      } catch (e) {
        return e;
      }
    },
  );

  assert.ok(err, 'a versioned write against an unreadable matrix is refused, not committed');
  assert.equal(err.name, 'StaleMatrixError');
  assert.equal(err.expected, held.generation, 'the refusal names the generation the caller held');
  assert.equal(
    err.actual,
    0,
    'an unreadable matrix has no committed generation to protect, so the compare sees 0',
  );
  assert.equal(
    fs.readFileSync(matrixPath, 'utf8'),
    before,
    'the on-disk matrix is byte-identical — the refusal protected it',
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// (a) src/lib/migration-safety-checker.js 1030-1031, 1053-1054, 1061-1062
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Drive detectMigrationFiles over a fully VIRTUAL directory tree presented at the
 * safe-fs boundary. A path in the map lists its entries; any other path under the
 * fixture root does not exist. Nothing is read from a real disk.
 *
 * @param {string} root
 * @param {Record<string, any[]>} tree
 * @param {object} [options]
 * @returns {string[]}
 */
function detectOverVirtualTree(root, tree, options = {}) {
  const { MigrationSafetyChecker } = require('../src/lib/migration-safety-checker');
  const checker = new MigrationSafetyChecker(root, options);
  const resolvedTree = new Map(Object.entries(tree).map(([k, v]) => [path.resolve(k), v]));
  return withSafeFs(
    'readdirSync',
    (real) =>
      function readdirSyncVirtual(p, opts) {
        const abs = path.resolve(String(p));
        if (resolvedTree.has(abs)) return resolvedTree.get(abs);
        if (abs === path.resolve(root) || abs.startsWith(path.resolve(root) + path.sep)) {
          const e = new Error(`ENOENT: no such directory, scandir '${abs}'`);
          /** @type {any} */ (e).code = 'ENOENT';
          throw e;
        }
        return real(p, opts);
      },
    () => checker.detectMigrationFiles(root),
  );
}

test('a directory entry whose type cannot be read is skipped, and the discovery walk continues past it', () => {
  const root = tmpProject('msc-discover');
  // The hostile entry sits BEFORE the good one, so "skip this entry" and "stop the
  // whole walk" produce different answers.
  const found = detectOverVirtualTree(root, {
    [root]: [hostileDirent('unknowable'), dirent('app', true)],
    [path.join(root, 'app')]: [dirent('migrations', true)],
    [path.join(root, 'app', 'migrations')]: [dirent('001_init.sql', false)],
  });

  assert.deepEqual(
    found,
    [path.join(root, 'app', 'migrations', '001_init.sql')],
    'the migration behind the unreadable entry is still discovered',
  );
});

test('an unreadable subdirectory ends that branch of the discovery walk only, never the whole walk', () => {
  const root = tmpProject('msc-branch');
  const found = detectOverVirtualTree(root, {
    // `broken` is listed as a directory but has no entry in the tree, so listing
    // it throws — the fail-soft arm must return from that branch and continue.
    [root]: [dirent('broken', true), dirent('app', true)],
    [path.join(root, 'app')]: [dirent('migrations', true)],
    [path.join(root, 'app', 'migrations')]: [dirent('002_add.sql', false)],
  });

  assert.deepEqual(
    found,
    [path.join(root, 'app', 'migrations', '002_add.sql')],
    'the sibling branch is still walked after an unreadable directory',
  );
});

test('inside a migrations directory, an entry whose type cannot be read is skipped and the rest is still collected', () => {
  const root = tmpProject('msc-collect');
  const found = detectOverVirtualTree(root, {
    [root]: [dirent('db', true)],
    [path.join(root, 'db')]: [dirent('migrations', true)],
    [path.join(root, 'db', 'migrations')]: [
      hostileDirent('unknowable.sql'),
      dirent('003_drop.sql', false),
    ],
  });

  assert.deepEqual(
    found,
    [path.join(root, 'db', 'migrations', '003_drop.sql')],
    'the readable migration after the unreadable entry is still collected',
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// (a) src/lib/migration-safety-checker.js 1220-1221
// ═════════════════════════════════════════════════════════════════════════════

test('atlas exiting 0 with a report is surfaced verbatim — a report is never read as a clean pass', () => {
  const root = tmpProject('msc-atlas');
  const target = require.resolve('../src/lib/migration-safety-checker');
  const dep = ['child_process', 'node:child_process'];

  const calls = [];
  const errors = withDependencyStub(
    target,
    dep,
    (realDep) => ({
      ...realDep,
      execFileSync(bin, args) {
        calls.push([bin, ...args]);
        if (args && args[0] === 'version') return ''; // atlas is "installed"
        return '  destructive change detected in 004_drop.sql  ';
      },
    }),
    (mod) => {
      const checker = new mod.MigrationSafetyChecker(root, {
        atlas: true,
        devUrl: 'docker://postgres/16/dev',
      });
      checker.runAtlas(path.join(root, 'db', 'migrations'));
      return checker.errors;
    },
  );

  assert.equal(calls.length, 2, 'availability was probed, then the lint was run');
  assert.equal(errors.length, 1, 'a non-empty report produces exactly one loud entry');
  assert.equal(errors[0].tool, 'atlas');
  assert.equal(
    errors[0].error,
    'atlas migrate lint report: destructive change detected in 004_drop.sql',
    'the report is carried verbatim (trimmed), not summarised away',
  );
});

test('atlas exiting 0 with no output records nothing — the arm reports a report, not every run', () => {
  const root = tmpProject('msc-atlas-quiet');
  const target = require.resolve('../src/lib/migration-safety-checker');
  const dep = ['child_process', 'node:child_process'];

  const errors = withDependencyStub(
    target,
    dep,
    (realDep) => ({ ...realDep, execFileSync: () => '   ' }),
    (mod) => {
      const checker = new mod.MigrationSafetyChecker(root, {
        atlas: true,
        devUrl: 'docker://postgres/16/dev',
      });
      checker.runAtlas(path.join(root, 'db', 'migrations'));
      return checker.errors;
    },
  );

  assert.deepEqual(errors, [], 'a silent clean atlas run adds no entry');
});

// ═════════════════════════════════════════════════════════════════════════════
// (a) src/lib/plan-index/conflict-detect.js 119-120 and 174-175
// ═════════════════════════════════════════════════════════════════════════════

const { openStore, PLAN_SENTINEL } = require('../src/lib/plan-index/store');

/**
 * A REAL plan-index store over a throwaway temp file, seeded with plan + section
 * units so both halves of conflict detection have something to read.
 * @param {Array<{ slug: string, files: string[], vec: number[] }>} plans
 * @returns {any}
 */
function buildIndexStore(plans) {
  const dir = tmpProject('cd-store');
  const store = openStore(path.join(dir, 'plan-index.json'));
  for (const p of plans) {
    for (const [sectionId, kind] of [[PLAN_SENTINEL, 'plan'], ['goals', 'section']]) {
      store.upsertUnit({
        planPath: p.slug,
        sectionId,
        kind,
        text: p.slug,
        files: p.files.slice(),
        contentHash: `${p.slug}::${sectionId}`,
        embedding: Float32Array.from(p.vec),
      });
    }
  }
  return store;
}

/** Two plans that overlap on one literal file and sit on identical vectors. */
function overlappingPlans() {
  return [
    { slug: 'plans/todo/00001-alpha.md', files: ['src/lib/shared.js'], vec: [1, 0, 0, 0] },
    { slug: 'plans/todo/00002-beta.md', files: ['src/lib/shared.js'], vec: [1, 0, 0, 0] },
  ];
}

test('a glob engine that throws never crashes conflict detection — the advisory half fails OPEN to no overlap', async () => {
  const store = buildIndexStore(overlappingPlans());
  const target = require.resolve('../src/lib/plan-index/conflict-detect');
  const dep = require.resolve('../src/lib/plan-coverage');

  // Control: with the real glob engine, the two plans DO conflict.
  const { detectConflicts } = require('../src/lib/plan-index/conflict-detect');
  const control = await detectConflicts('plans/todo/00001-alpha.md', {
    store,
    landedResolver: () => ({ gitAvailable: true, landedBySelf: false, landedByOther: false }),
  });
  assert.equal(control.length, 1, 'the control case really does find the overlap');

  const faulted = await withDependencyStub(
    target,
    dep,
    (realDep) => ({
      ...realDep,
      globToRegex() {
        throw new Error('injected: pathological glob');
      },
    }),
    (mod) =>
      mod.detectConflicts('plans/todo/00001-alpha.md', {
        store,
        landedResolver: () => ({ gitAvailable: true, landedBySelf: false, landedByOther: false }),
      }),
  );

  assert.deepEqual(
    faulted,
    [],
    'the advisory detector fails OPEN: a broken glob engine yields no conflicts rather than a crash',
  );
});

test('the scheduler safety oracle over the SAME glob engine answers in the opposite direction — a decision it cannot make blocks', () => {
  // The contrast that makes conflict-detect's fail-OPEN correct: the same
  // globToRegex backs a SAFETY oracle whose uncertain answer is "block". That
  // oracle calls globToRegex from its own module scope, so its catch cannot be
  // driven from outside the module; what IS assertable from here is the direction
  // its contract commits to, which is what a silent flip would change.
  const { touchesOverlap } = require('../src/lib/plan-coverage');

  assert.equal(
    touchesOverlap(['src/a.js'], ['src/b.js']),
    false,
    'two distinct literals genuinely do not overlap — the oracle is not vacuously true',
  );
  assert.equal(touchesOverlap(['src/a.js'], ['src/a.js']), true, 'identical entries always overlap');
  assert.equal(
    touchesOverlap(['src/**'], ['src/lib/x.js']),
    true,
    'a sweeping glob overlaps the literal it matches — the block-ward answer',
  );
});

test('a glob engine that throws while measuring index breadth reports NOT broad, never a crash', async () => {
  // isBroadGlob's compile catch. The candidate carries a glob, which is what makes
  // the breadth measurement run at all.
  const store = buildIndexStore([
    { slug: 'plans/todo/00003-gamma.md', files: ['src/lib/shared.js'], vec: [1, 0, 0, 0] },
    { slug: 'plans/todo/00004-delta.md', files: ['src/**'], vec: [1, 0, 0, 0] },
    { slug: 'plans/todo/00005-eps.md', files: ['src/lib/other.js'], vec: [0, 1, 0, 0] },
  ]);

  const target = require.resolve('../src/lib/plan-index/conflict-detect');
  const dep = require.resolve('../src/lib/plan-coverage');

  // Control: the breadth measurement really does fire and label the row "broad".
  const { detectConflicts } = require('../src/lib/plan-index/conflict-detect');
  const control = await detectConflicts('plans/todo/00003-gamma.md', {
    store,
    landedResolver: () => ({ gitAvailable: true, landedBySelf: false, landedByOther: false }),
  });
  assert.deepEqual(
    control.map((r) => r.severity),
    ['broad overlap'],
    'with a working glob engine the sweeping candidate is measured as broad',
  );

  // The overlap half compiles two globs; the breadth measurement compiles the
  // third. Breaking exactly that third call isolates isBroadGlob's own arm.
  let compiles = 0;
  const faulted = await withDependencyStub(
    target,
    dep,
    (realDep) => ({
      ...realDep,
      globToRegex(glob) {
        compiles += 1;
        if (compiles >= 3) throw new Error('injected: pathological glob');
        return realDep.globToRegex(glob);
      },
    }),
    (mod) =>
      mod.detectConflicts('plans/todo/00003-gamma.md', {
        store,
        landedResolver: () => ({ gitAvailable: true, landedBySelf: false, landedByOther: false }),
      }),
  );

  assert.equal(compiles, 3, 'the breadth measurement is the call that was broken');
  assert.deepEqual(
    faulted.map((r) => r.conflictingPlan),
    ['plans/todo/00004-delta.md'],
    'the conflict itself survives — a breadth measurement that cannot run never drops a row',
  );
  assert.equal(
    faulted[0].severity,
    'potential conflict or dependency',
    'a breadth measurement that could not run reports NOT broad rather than crashing',
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// (a) src/lib/plan-index/search.js 327-328
// ═════════════════════════════════════════════════════════════════════════════

test('an embedder that throws degrades hybrid search to lexical-only AND says so', async () => {
  const { search } = require('../src/lib/plan-index/search');
  const store = buildIndexStore([
    { slug: 'plans/todo/00010-migrations.md', files: ['db/x.sql'], vec: [1, 0, 0, 0] },
    { slug: 'plans/todo/00011-unrelated.md', files: ['src/y.js'], vec: [0, 1, 0, 0] },
  ]);

  let embedCalls = 0;
  const results = await search('migrations', {
    store,
    embedder: async () => {
      embedCalls += 1;
      throw new Error('injected: the embedding backend is unavailable');
    },
  });

  assert.equal(embedCalls, 1, 'the embedder was really called and really threw');
  assert.equal(
    /** @type {any} */ (results).degraded,
    'no-embedding',
    'the degrade is REPORTED — silently-worse results would be the false-green shape',
  );
  assert.ok(results.length > 0, 'the lexical half still answers the query');
  assert.equal(
    results[0].planPath,
    'plans/todo/00010-migrations.md',
    'lexical-only ranking still puts the matching plan first',
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// (a) src/lib/plan-index/ollama-client.js 44-46
// ═════════════════════════════════════════════════════════════════════════════

// A bounded case on purpose: without the already-aborted arm the client would
// wait forever on a body that never settles, so the failure mode of removing it
// is a HANG. The timeout turns that hang into a loud failure.
test('a response arriving after the timeout rejects at once — it never waits for an abort that already fired', { timeout: 10000 }, async () => {
  const { createOllamaClient } = require('../src/lib/plan-index/ollama-client');

  let signalWasAlreadyAborted = null;
  const client = createOllamaClient({
    timeoutMs: 20,
    // No network: this fetch resolves locally, deliberately AFTER the bound has
    // elapsed, so the handler runs against a signal that has already aborted.
    fetch: async (_url, opts) => {
      await new Promise((resolve) => setTimeout(resolve, 80));
      signalWasAlreadyAborted = opts.signal.aborted;
      return {
        ok: true,
        status: 200,
        // A body that never settles: only the already-aborted arm can end this.
        json: () => new Promise(() => {}),
      };
    },
  });

  await assert.rejects(
    () => client.embed('nomic-embed-text', ['anything']),
    /ollama-client: request exceeded 20ms timeout/,
    'the already-aborted signal rejects immediately instead of hanging forever',
  );
  assert.equal(
    signalWasAlreadyAborted,
    true,
    'the fixture really did deliver its response after the abort — the arm under test was the one taken',
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// (c) GUARDS for the dead ranges — each asserts the invariant that keeps the
//     line dark, so reviving it fails here first.
// ═════════════════════════════════════════════════════════════════════════════

test('GUARD (plan-validator 243-245 is dead): instruction-adherence findings are warnings and never invalidate a plan', () => {
  const root = tmpProject('pv-instr');
  const planPath = path.join(root, 'plans', 'review', 'instr.md');
  const content = [
    '---',
    'title: instruction adherence',
    'type: implementation',
    '---',
    '',
    '## Goal',
    'User said: "use the cli"',
    'The implementation exposes a web interface instead.',
    '',
  ].join('\n');
  writeFixture(planPath, content);

  const { validateForReview } = require('../src/lib/plan-validator');
  const result = validateForReview(planPath, root);

  const instructionWarnings = result.warnings.filter((w) => /CLI approach/i.test(String(w)));
  assert.equal(
    instructionWarnings.length,
    1,
    'the contradiction really is detected — the check is doing its job',
  );
  assert.deepEqual(
    result.errors.filter((e) => /CLI approach/i.test(String(e))),
    [],
    'an instruction-adherence finding is a WARNING; validateInstructionAdherence has no error path, '
      + 'which is what makes the "instruction errors invalidate the plan" arm unreachable',
  );
});

test('GUARD (traceability-matrix 201 is dead): the exhausted retry rethrows the LAST real refusal, detail intact', () => {
  const root = tmpProject('tm-cas');
  const tm = require('../src/lib/traceability-matrix');
  tm.upsert(root, { id: 'REQ-A', description: 'seed' });
  const matrixPath = path.join(root, tm.MATRIX_PATH);

  // Every save attempt loses the compare-and-swap: a competing writer bumps the
  // on-disk generation between this cycle's load and its save, every time.
  let bump = 100;
  const err = withSafeFs(
    'readFileSync',
    (real) =>
      function readFileSyncRacing(p, opts) {
        const out = real(p, opts);
        if (path.resolve(String(p)) === path.resolve(matrixPath)) {
          bump += 1;
          return String(out).replace(/^generation: \d+$/m, `generation: ${bump}`);
        }
        return out;
      },
    () => {
      try {
        tm.upsert(root, { id: 'REQ-B', description: 'contended' });
        return null;
      } catch (e) {
        return e;
      }
    },
  );

  assert.ok(err, 'a permanently contended upsert gives up rather than looping forever');
  assert.equal(err.name, 'StaleMatrixError');
  assert.equal(
    typeof err.actual,
    'number',
    'the rethrown error is the LAST REAL refusal, carrying its expected/actual detail — '
      + 'which is why the generic give-up fallback is never constructed',
  );
  assert.equal(typeof err.expected, 'number');
});

test('GUARD (task-registry 578 is dead): the exhausted registry retry also rethrows the last real refusal', () => {
  const root = tmpProject('registry-cas');
  const registry = require('../src/lib/task-registry');
  registry.save(root, registry.emptyRegistry());
  const tasksPath = registry.registryPath(root);

  // A competing writer commits between every load and its save, forever.
  let bump = 500;
  const err = withSafeFs(
    'readFileSync',
    (real) =>
      function readFileSyncRacing(p, opts) {
        const out = real(p, opts);
        if (path.resolve(String(p)) === path.resolve(tasksPath)) {
          bump += 1;
          const data = JSON.parse(String(out));
          data.generation = bump;
          return JSON.stringify(data);
        }
        return out;
      },
    () => {
      try {
        registry.withRegistry(root, (reg) => {
          reg.tasks.push({ id: 'probe', state: 'queued' });
          return 'never returned';
        });
        return null;
      } catch (e) {
        return e;
      }
    },
  );

  assert.ok(err, 'a permanently contended registry mutation gives up rather than looping forever');
  assert.equal(err.name, 'StaleRegistryError');
  assert.equal(
    typeof err.actual,
    'number',
    'the rethrown error is the LAST REAL refusal, carrying its expected/actual detail — '
      + 'which is why the generic give-up fallback is never constructed',
  );
  assert.equal(typeof err.expected, 'number');
  assert.notEqual(
    err.actual,
    err.expected,
    'the refusal names the two generations that disagreed, not a generic give-up message',
  );
});

test('GUARD (migration-safety-checker 952-953 is dead): direction awareness holds for every C# shape it scans', () => {
  const root = tmpProject('msc-efdown');
  const { MigrationSafetyChecker } = require('../src/lib/migration-safety-checker');
  const file = path.join(root, 'db', 'migrations', '005_ef.cs');
  writeFixture(
    file,
    [
      'public partial class Whatever {',
      '  protected override void Up(MigrationBuilder migrationBuilder) {',
      '    migrationBuilder.DropColumn(name: "legacy", table: "users");',
      '  }',
      '  protected override void Down(MigrationBuilder migrationBuilder) {',
      '    migrationBuilder.DropColumn(name: "added", table: "users");',
      '  }',
      '}',
      '',
    ].join('\n'),
  );

  const checker = new MigrationSafetyChecker(root);
  const findings = checker.scanDestructive(fs.readFileSync(file, 'utf8'), file);
  const lines = findings.map((f) => f.line);
  assert.deepEqual(
    lines,
    [3],
    'the apply-direction drop on line 3 IS flagged and the rollback drop on line 6 is NOT — '
      + 'the exclusion scan ran and produced a real set, which is exactly what its fail-soft '
      + 'catch would have to replace with an empty one',
  );
});

test('GUARD (fusion 78 is dead): fused ids are unique strings, so the comparator never sees two equal ids', () => {
  const { fuseRRF } = require('../src/lib/plan-index/fusion');

  const fused = fuseRRF([
    [{ id: 'b' }, { id: 'a' }],
    [{ id: 'a' }, { id: 'b' }],
  ]);
  assert.equal(fused.length, 2, 'the union deduplicates by id');
  assert.equal(new Set(fused.map((f) => f.id)).size, fused.length, 'every fused id is distinct');
  assert.equal(fused[0].score, fused[1].score, 'these two really are tied on score');
  assert.deepEqual(
    fused.map((f) => f.id),
    ['a', 'b'],
    'a score tie breaks by ascending id — deterministic, never insertion-dependent',
  );

  assert.throws(
    () => fuseRRF([[{ id: 7 }]]),
    /must have a string "id"/,
    'a non-string id is refused, which is the other half of what keeps the equal-id branch dark',
  );
});

test('GUARD (plan-index/store 386-388 is dead): a memory-only store serves reads and writes NOTHING to disk', () => {
  const dir = tmpProject('store-memonly');
  // A FILE where the index directory must be → mkdirSync fails → degraded mode.
  const squat = path.join(dir, 'index');
  fs.writeFileSync(squat, 'not a directory');
  const jsonPath = path.join(squat, 'plan-index.json');

  const store = openStore(jsonPath);
  assert.equal(store.__test.memoryOnly, true, 'the store really is in degraded memory-only mode');

  store.upsertUnit({
    planPath: 'plans/todo/00099-mem.md',
    sectionId: PLAN_SENTINEL,
    kind: 'plan',
    text: 'memory only',
    files: ['src/mem.js'],
    contentHash: 'mem::plan',
    embedding: Float32Array.from([1, 0, 0, 0]),
  });

  assert.equal(store.size, 1, 'the write landed in memory and the store still serves it');
  assert.deepEqual(store.listPlanPaths(), ['plans/todo/00099-mem.md']);
  assert.equal(
    fs.existsSync(jsonPath),
    false,
    'no index file was written — the mutation path returns before persisting, which is why '
      + 'the persist function\'s own memory-only guard can never be reached',
  );
  assert.equal(
    fs.readFileSync(squat, 'utf8'),
    'not a directory',
    'the squatting file is untouched',
  );
});
