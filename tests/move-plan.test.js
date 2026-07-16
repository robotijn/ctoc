/**
 * Tests for src/scripts/move-plan.js
 *
 * move-plan.js is a side-effect CLI script: it exports nothing and runs its whole
 * body at require() time, reading process.argv and terminating via process.exit().
 * To exercise the real code IN-PROCESS (so per-file coverage counts it), each test
 * requires the module with the require cache busted, after installing controlled
 * doubles for the only true boundaries the script touches:
 *   - process.argv   (the script's input)
 *   - process.exit   (turned into a throw so a "failure" stops the module body
 *                     exactly where the real exit would, without killing the runner)
 *   - console.error / console.log (captured for behavioural assertions)
 *   - process.cwd    (chdir'd into a real temp plans/ fixture so findProjectRoot
 *                     resolves the fixture as the project root)
 *
 * NOTHING in the move/validate/gate logic is mocked — crossesHumanGate,
 * findProjectRoot and movePlan all run for real against real files on disk.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MOVE_PLAN = require.resolve('../src/scripts/move-plan.js');

// Every stage directory the script knows about, so the fixture is a valid CTOC
// project root and any legitimate destination directory already exists.
const STAGES = ['vision', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];

let fixtureDir;
let originalCwd;

/**
 * Run move-plan.js exactly as the CLI would, in-process.
 * @param {string[]} argv - the two positional args (ref, destination), or fewer.
 * @returns {{code:number, stdout:string, stderr:string}}
 *   code === 0 means the module body ran to completion without calling process.exit
 *   (the success path); any other code is the exact code the script passed to exit.
 */
function runMovePlan(argv) {
  delete require.cache[MOVE_PLAN];

  const origArgv = process.argv;
  const origExit = process.exit;
  const origError = console.error;
  const origLog = console.log;

  const stdout = [];
  const stderr = [];
  let exitCode = 0;

  process.argv = ['node', MOVE_PLAN, ...argv];
  console.error = (...a) => { stderr.push(a.join(' ')); };
  console.log = (...a) => { stdout.push(a.join(' ')); };
  process.exit = (code) => {
    exitCode = code === undefined ? 0 : code;
    const signal = new Error('__move_plan_exit__');
    signal.__isExitSignal = true;
    throw signal;
  };

  try {
    require(MOVE_PLAN);
  } catch (err) {
    // Only our synthetic exit is expected; a real error is a genuine test failure.
    if (!err || !err.__isExitSignal) {
      throw err;
    }
  } finally {
    process.argv = origArgv;
    process.exit = origExit;
    console.error = origError;
    console.log = origLog;
    delete require.cache[MOVE_PLAN];
  }

  return { code: exitCode, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}

/** Create plans/<stage>/<name> containing `body`. */
function writePlan(stage, name, body = '# plan\n') {
  const dir = path.join(fixtureDir, 'plans', stage);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, body);
  return file;
}

beforeEach(() => {
  originalCwd = process.cwd();
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-move-plan-'));
  for (const stage of STAGES) {
    fs.mkdirSync(path.join(fixtureDir, 'plans', stage), { recursive: true });
  }
  // chdir so findProjectRoot() (which starts at process.cwd()) resolves the fixture.
  process.chdir(fixtureDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  if (fixtureDir && fs.existsSync(fixtureDir)) {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Argument validation — the guard at the top of the script.
// ---------------------------------------------------------------------------
describe('argument validation', () => {
  const missingArgCases = [
    { id: 'no-args', argv: [] },
    { id: 'ref-only', argv: ['todo/plan.md'] },
    { id: 'empty-ref', argv: ['', 'in-progress'] },
  ];

  for (const { id, argv } of missingArgCases) {
    test(`exits 1 with usage when a positional arg is missing [${id}]`, () => {
      const { code, stderr } = runMovePlan(argv);

      assert.strictEqual(code, 1, 'must exit non-zero');
      assert.match(stderr, /Usage: node scripts\/move-plan\.js/);
    });
  }

  test('exits 1 with valid-stage list when destination is not a real stage', () => {
    const { code, stderr } = runMovePlan(['todo/plan.md', 'shipped']);

    assert.strictEqual(code, 1);
    assert.match(stderr, /Invalid destination: "shipped"/);
    assert.match(stderr, /Valid stages:/);
  });

  test('exits 1 when ref has no stage/file separator', () => {
    const { code, stderr } = runMovePlan(['plan-without-slash.md', 'in-progress']);

    assert.strictEqual(code, 1);
    assert.match(stderr, /Reference must be in format: stage\/file\.md/);
  });

  test('exits 1 when the source stage in ref is not a real stage', () => {
    const { code, stderr } = runMovePlan(['bogus-stage/plan.md', 'in-progress']);

    assert.strictEqual(code, 1);
    assert.match(stderr, /Invalid source stage: "bogus-stage"/);
  });
});

// ---------------------------------------------------------------------------
// Human-gate enforcement — the script MUST refuse any gate-crossing move,
// adjacent or multi-hop. This is the load-bearing safety property.
// ---------------------------------------------------------------------------
describe('human gate enforcement', () => {
  const gateCrossings = [
    { id: 'adjacent-review-done', from: 'review', to: 'done' },
    { id: 'adjacent-functional-implementation', from: 'functional', to: 'implementation' },
    { id: 'adjacent-implementation-todo', from: 'implementation', to: 'todo' },
    { id: 'multihop-inprogress-done', from: 'in-progress', to: 'done' },
    { id: 'multihop-functional-todo', from: 'functional', to: 'todo' },
    { id: 'multihop-todo-done', from: 'todo', to: 'done' },
  ];

  for (const { id, from, to } of gateCrossings) {
    test(`refuses gate crossing ${from} -> ${to} and leaves the file in place [${id}]`, () => {
      const src = writePlan(from, 'gated.md');

      const { code, stderr } = runMovePlan([`${from}/gated.md`, to]);

      assert.strictEqual(code, 1, 'gate crossing must be refused');
      assert.match(stderr, new RegExp(`Human gate: ${from} -> ${to} requires human approval`));
      // Refusal means NO move happened: source still present, destination absent.
      assert.ok(fs.existsSync(src), 'source file must remain after a refused gate move');
      assert.ok(
        !fs.existsSync(path.join(fixtureDir, 'plans', to, 'gated.md')),
        'destination must not receive the file on a refused gate move',
      );
    });
  }
});

// ---------------------------------------------------------------------------
// Path confinement — a ref whose file part escapes plans/ must be refused.
// ---------------------------------------------------------------------------
describe('plans/ directory confinement', () => {
  test('refuses a ref that traverses out of the plans/ tree', () => {
    // Plant the target of the traversal so any real rename would actually hit it.
    fs.writeFileSync(path.join(fixtureDir, 'outside.md'), 'secret\n');

    // review -> in-progress is a backward move (no gate), so the gate check passes
    // and control reaches the confinement guard. The file part escapes plans/.
    const { code, stderr } = runMovePlan(['review/../../outside.md', 'in-progress']);

    assert.strictEqual(code, 1);
    assert.match(stderr, /Refusing reference that escapes the plans\/ directory/);
    // The out-of-tree file must be untouched.
    assert.ok(fs.existsSync(path.join(fixtureDir, 'outside.md')));
    assert.ok(!fs.existsSync(path.join(fixtureDir, 'plans', 'in-progress', 'outside.md')));
  });
});

// ---------------------------------------------------------------------------
// Source existence — a non-gate move of a plan that does not exist.
// ---------------------------------------------------------------------------
describe('missing source file', () => {
  test('exits 1 when the referenced plan file does not exist', () => {
    const { code, stderr } = runMovePlan(['todo/ghost.md', 'in-progress']);

    assert.strictEqual(code, 1);
    assert.match(stderr, /Plan file not found:/);
    assert.match(stderr, /ghost\.md/);
  });
});

// ---------------------------------------------------------------------------
// Happy path — a legitimate non-gate forward move and a backward revert.
// ---------------------------------------------------------------------------
describe('successful moves', () => {
  test('moves a plan forward across a non-gate edge (todo -> in-progress)', () => {
    const src = writePlan('todo', 'feature.md', '# feature\nbody\n');

    const { code, stdout, stderr } = runMovePlan(['todo/feature.md', 'in-progress']);

    assert.strictEqual(code, 0, `expected success, stderr=${stderr}`);
    assert.match(stdout, /Moved todo\/feature\.md -> in-progress\//);
    assert.ok(!fs.existsSync(src), 'source must be gone after a successful move');
    const dest = path.join(fixtureDir, 'plans', 'in-progress', 'feature.md');
    assert.ok(fs.existsSync(dest), 'destination must hold the file');
    assert.strictEqual(fs.readFileSync(dest, 'utf8'), '# feature\nbody\n', 'content preserved byte-for-byte');
  });

  test('allows a backward revert across a gate edge (done -> review is not blocked)', () => {
    // Backward moves are explicitly allowed even over a gate edge: done -> review
    // reverses the review->done gate and crossesHumanGate returns false for it.
    const src = writePlan('done', 'reverted.md');

    const { code, stdout } = runMovePlan(['done/reverted.md', 'review']);

    assert.strictEqual(code, 0);
    assert.match(stdout, /Moved done\/reverted\.md -> review\//);
    assert.ok(!fs.existsSync(src));
    assert.ok(fs.existsSync(path.join(fixtureDir, 'plans', 'review', 'reverted.md')));
  });
});

// ---------------------------------------------------------------------------
// Destination collision — a same-basename plan already resident at the target
// stage must NOT be silently overwritten (rename atomically replaces it, which
// is silent data loss). The CLI must REFUSE and leave BOTH files intact.
// ---------------------------------------------------------------------------
describe('destination collision protection', () => {
  test('refuses to overwrite an existing plan of the same basename at the destination', () => {
    // Two plans share the basename foo.md across stages: content A in the source
    // (todo), content B already resident at the destination (in-progress). A bare
    // rename would destroy content B AND remove the source — both silently.
    const src = writePlan('todo', 'foo.md', 'content A\n');
    const destExisting = path.join(fixtureDir, 'plans', 'in-progress', 'foo.md');
    fs.writeFileSync(destExisting, 'content B\n');

    // todo -> in-progress crosses no gate, so nothing else intervenes.
    const { code, stderr } = runMovePlan(['todo/foo.md', 'in-progress']);

    assert.strictEqual(code, 1, 'a destination collision must be refused');
    assert.match(stderr, /Refusing to overwrite existing plan/);
    assert.match(stderr, /in-progress\/foo\.md/);
    // BOTH files must survive byte-for-byte — no move happened.
    assert.ok(fs.existsSync(src), 'source must remain after a refused collision');
    assert.strictEqual(fs.readFileSync(src, 'utf8'), 'content A\n', 'source content intact');
    assert.strictEqual(
      fs.readFileSync(destExisting, 'utf8'),
      'content B\n',
      'existing destination content must NOT be overwritten',
    );
  });
});

// ---------------------------------------------------------------------------
// Failure of the underlying move — the try/catch guard around movePlan().
// ---------------------------------------------------------------------------
describe('movePlan failure surfaces as exit 1', () => {
  test('reports "Failed to move plan" when the destination directory is a file', () => {
    // Arrange a source that exists and passes every guard, but make the destination
    // "directory" a regular file so the real renameSync throws ENOTDIR inside
    // movePlan — exercising the catch block, not a mock.
    const src = writePlan('todo', 'doomed.md');
    const inProgressDir = path.join(fixtureDir, 'plans', 'in-progress');
    fs.rmSync(inProgressDir, { recursive: true, force: true });
    fs.writeFileSync(inProgressDir, 'not a directory\n');

    const { code, stderr } = runMovePlan(['todo/doomed.md', 'in-progress']);

    assert.strictEqual(code, 1);
    assert.match(stderr, /Failed to move plan:/);
    // The source must still be present since the rename failed.
    assert.ok(fs.existsSync(src), 'source must survive a failed move');
  });
});
