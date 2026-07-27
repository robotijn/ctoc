/**
 * Coverage-hardening tests for src/lib/budget.js — targets the DARK branches the
 * existing tests/budget.test.js does not reach, and pins each so it goes RED
 * under mutation (not merely "line executed"). Human-reviewed line-by-line.
 *
 * Every call passes `root` and `sessionId` explicitly, so each test is fully
 * isolated on its own os.tmpdir() fixture with NO process.chdir / env mutation.
 * Fixtures are removed in a finally block (FIRST.Independent / Repeatable).
 *
 * Boundary/branch each cluster kills is documented inline as `KILLS:`.
 *
 * Documented-unreachable (never fabricated a hit):
 *   - budget.js line 184  `process.ppid || process.pid`  — the `|| process.pid`
 *     second operand only fires when process.ppid is falsy (0/undefined). In a
 *     normally-spawned Node process ppid is always a positive integer, and the
 *     public API offers no way to make it falsy without monkey-patching the
 *     read-only `process` object — which the module itself never emits. Left
 *     un-hit deliberately; the ppid path IS covered (tests/budget.test.js).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const budget = require('../src/lib/budget');

const SESSION = 'cov-session';

function makeProject(yaml) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-budget-cov-'));
  fs.mkdirSync(path.join(dir, '.ctoc', 'config'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.ctoc', 'budget-usage'), { recursive: true });
  if (yaml !== undefined) {
    fs.writeFileSync(path.join(dir, '.ctoc', 'config', 'budget.yaml'), yaml);
  }
  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
}

/** Plant a raw per-session usage file (bypasses recordDispatch to inject malformed/edge state). */
function plantUsage(dir, session, body) {
  const p = budget.getUsagePath(dir, session);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
}

// ─────────────────────────────────────────────────────────────────────────────
//  EXACT over-budget boundary:  spend == limit is WITHIN, spend > limit is OVER.
//  KILLS: `>` → `>=` on lines 255 (dispatches) and 258 (iron_loop_iterations).
//  The existing suite only tests 4>3 and fresh sessions — never spend == limit,
//  so a `>=` mutant survives it. These pin the equality edge.
// ─────────────────────────────────────────────────────────────────────────────

describe('budget-coverage — over-budget decision at the exact boundary', () => {
  const dispatchRows = [
    { id: 'at-limit-is-within', n: 3, expectedWithin: true },
    { id: 'one-over-is-exceeded', n: 4, expectedWithin: false },
  ];
  for (const row of dispatchRows) {
    it(`dispatches ${row.n} vs limit 3 -> withinLimits=${row.expectedWithin} [${row.id}]`, () => {
      // Arrange
      const dir = makeProject(`budget:\n  max_dispatches: 3\n`);
      try {
        for (let i = 0; i < row.n; i++) budget.recordDispatch(`agent/${i}`, dir, SESSION);

        // Act
        const r = budget.checkBudget(dir, SESSION);

        // Assert — the halt decision at spend==limit must NOT fire
        assert.equal(r.withinLimits, row.expectedWithin);
        assert.equal(r.exceeded.some(e => e.kind === 'max_dispatches'), !row.expectedWithin);
      } finally {
        cleanup(dir);
      }
    });
  }

  const ironRows = [
    { id: 'at-limit-is-within', n: 2, expectedWithin: true },
    { id: 'one-over-is-exceeded', n: 3, expectedWithin: false },
  ];
  for (const row of ironRows) {
    it(`iron_loop_iterations ${row.n} vs limit 2 -> withinLimits=${row.expectedWithin} [${row.id}]`, () => {
      // Arrange
      const dir = makeProject(`budget:\n  max_iron_loop_iterations: 2\n`);
      try {
        for (let i = 0; i < row.n; i++) budget.recordIronLoopStep(`STEP${i}`, dir, SESSION);

        // Act
        const r = budget.checkBudget(dir, SESSION);

        // Assert
        assert.equal(r.withinLimits, row.expectedWithin);
        assert.equal(r.exceeded.some(e => e.kind === 'max_iron_loop_iterations'), !row.expectedWithin);
      } finally {
        cleanup(dir);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  Checkpoint fires on EXACT equality, not "at or past".
//  KILLS: `===` → `>=` / `<=` on lines 264 and 267. A dispatch count PAST the
//  threshold must NOT re-trigger the checkpoint.
// ─────────────────────────────────────────────────────────────────────────────

describe('budget-coverage — checkpoint triggers only at the exact threshold', () => {
  const rows = [
    { id: 'below-threshold', n: 1, expectCheckpoint: false },
    { id: 'at-threshold', n: 2, expectCheckpoint: true },
    { id: 'past-threshold', n: 3, expectCheckpoint: false },
  ];
  for (const row of rows) {
    it(`${row.n} dispatches vs checkpoint [2] -> shouldCheckpoint=${row.expectCheckpoint} [${row.id}]`, () => {
      // Arrange
      const dir = makeProject(
        `budget:\n  max_dispatches: 100\n  checkpoint_at:\n    dispatches: [2]\n`
      );
      try {
        for (let i = 0; i < row.n; i++) budget.recordDispatch(`a${i}`, dir, SESSION);

        // Act
        const r = budget.checkBudget(dir, SESSION);

        // Assert
        assert.equal(r.shouldCheckpoint, row.expectCheckpoint);
      } finally {
        cleanup(dir);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  Disabled budget short-circuits BEFORE checkpoint computation.
//  KILLS: the early return at line 245-246 (mutant that drops it would still
//  compute checkpoints and report shouldCheckpoint=true here).
// ─────────────────────────────────────────────────────────────────────────────

describe('budget-coverage — enabled:false disables checkpoints too', () => {
  it('at a checkpoint threshold but disabled -> withinLimits and no checkpoint', () => {
    // Arrange
    const dir = makeProject(
      `budget:\n  enabled: false\n  max_dispatches: 1\n  checkpoint_at:\n    dispatches: [1]\n`
    );
    try {
      budget.recordDispatch('a', dir, SESSION); // == checkpoint threshold AND > limit

      // Act
      const r = budget.checkBudget(dir, SESSION);

      // Assert — disabled path returns before exceeded/checkpoint math
      assert.equal(r.withinLimits, true);
      assert.equal(r.shouldCheckpoint, false);
      assert.deepEqual(r.exceeded, []);
    } finally {
      cleanup(dir);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  checkpoint_at.<x> may be null on disk; the `|| []` guards must hold.
//  KILLS: the second operand of `config.checkpoint_at.dispatches || []` (line
//  263) and `...iron_loop_iterations || []` (line 266). Without them, `for..of
//  null` throws.
// ─────────────────────────────────────────────────────────────────────────────

describe('budget-coverage — null checkpoint lists do not crash checkBudget', () => {
  it('checkpoint_at.dispatches:null and iron_loop_iterations:null -> no throw, no checkpoints', () => {
    // Arrange
    const dir = makeProject(
      `budget:\n  checkpoint_at:\n    dispatches: null\n    iron_loop_iterations: null\n`
    );
    try {
      budget.recordDispatch('a', dir, SESSION);
      budget.recordIronLoopStep('S', dir, SESSION);

      // Act
      const r = budget.checkBudget(dir, SESSION);

      // Assert
      assert.equal(r.shouldCheckpoint, false);
      assert.deepEqual(r.checkpoints, []);
    } finally {
      cleanup(dir);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Malformed started_at -> hoursSince returns 0 (not NaN).
//  KILLS: the `if (!Number.isFinite(t0)) return 0` guard (lines 236-238). A
//  mutant that drops it yields NaN, which formatStatus renders as "NaN".
// ─────────────────────────────────────────────────────────────────────────────

describe('budget-coverage — unparseable started_at is treated as zero elapsed', () => {
  it('formatStatus renders 0.00 elapsed and stays within limits when started_at is garbage', () => {
    // Arrange
    const dir = makeProject(`budget:\n  max_session_hours: 4\n`);
    try {
      plantUsage(dir, SESSION, `usage:\n  started_at: "not-a-real-timestamp"\n  dispatches: 0\n  iron_loop_iterations: 0\n`);

      // Act
      const text = budget.formatStatus(dir, SESSION);
      const r = budget.checkBudget(dir, SESSION);

      // Assert
      assert.match(text, /Elapsed:\s+0\.00\s+\/\s+4 hours/);
      assert.doesNotMatch(text, /NaN/);
      assert.equal(r.exceeded.some(e => e.kind === 'max_session_hours'), false);
    } finally {
      cleanup(dir);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  recordDispatch / recordIronLoopStep with a FALSY label must PRESERVE the
//  previously recorded label (guarded by `if (target)` / `if (stepLabel)`).
//  KILLS: the guard on lines 222 and 230. A mutant that assigns unconditionally
//  overwrites the prior value with undefined (persisted/read back as null).
// ─────────────────────────────────────────────────────────────────────────────

describe('budget-coverage — falsy record label preserves prior value', () => {
  it('recordDispatch() without a target keeps the previous last_target', () => {
    // Arrange
    const dir = makeProject();
    try {
      budget.recordDispatch('quality/code-reviewer', dir, SESSION);

      // Act
      const u = budget.recordDispatch(undefined, dir, SESSION);

      // Assert
      assert.equal(u.dispatches, 2);
      assert.equal(u.last_target, 'quality/code-reviewer');
      assert.equal(budget.currentUsage(dir, SESSION).last_target, 'quality/code-reviewer');
    } finally {
      cleanup(dir);
    }
  });

  it('recordIronLoopStep() without a label keeps the previous last_step', () => {
    // Arrange
    const dir = makeProject();
    try {
      budget.recordIronLoopStep('VERIFY', dir, SESSION);

      // Act
      const u = budget.recordIronLoopStep(undefined, dir, SESSION);

      // Assert
      assert.equal(u.iron_loop_iterations, 2);
      assert.equal(u.last_step, 'VERIFY');
      assert.equal(budget.currentUsage(dir, SESSION).last_step, 'VERIFY');
    } finally {
      cleanup(dir);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  currentUsage fallbacks when the usage file is present but sparse.
//  KILLS: `Number(parsed.usage.dispatches || 0)` and `|| 0` / `|| null`
//  fallbacks (lines 198-202), and the `started_at || new Date()` pass-through
//  (a mutant dropping the left operand would replace the planted timestamp).
// ─────────────────────────────────────────────────────────────────────────────

describe('budget-coverage — currentUsage coerces a sparse usage file', () => {
  it('missing counters default to 0/null and a present started_at is preserved verbatim', () => {
    // Arrange
    const dir = makeProject();
    const planted = '2020-01-02T03:04:05.000Z';
    try {
      plantUsage(dir, SESSION, `usage:\n  started_at: ${JSON.stringify(planted)}\n`);

      // Act
      const u = budget.currentUsage(dir, SESSION);

      // Assert
      assert.equal(u.dispatches, 0);
      assert.equal(u.iron_loop_iterations, 0);
      assert.equal(u.last_target, null);
      assert.equal(u.last_step, null);
      assert.equal(u.started_at, planted);
    } finally {
      cleanup(dir);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  findProjectRoot — now a one-line delegation to the shared describeProjectRoot
//  (plan 00179). The private bare-marker ancestry walk was DELETED: it accepted a
//  bare `.ctoc` and over-rooted from any project beneath $HOME to the crypto home
//  `~/.ctoc`. These tests were rewritten toward the FIXED contract — the human
//  explicitly replaced the resolver (delegate to describeProjectRoot), so the old
//  assertions (a standalone `.claude-plugin` marker, a bare `.ctoc` root, and
//  `return start` on total fallback) pinned the removed bug, not a behaviour to keep.
//  The shared resolver identifies a project by a genuine `.ctoc` (carrying settings or
//  beside a `plans/` sibling) or `.git`, and returns process.cwd() on fallback.
// ─────────────────────────────────────────────────────────────────────────────

describe('budget-coverage — findProjectRoot (delegates to describeProjectRoot)', () => {
  it('detects a genuine project root (.ctoc carrying settings.yaml)', () => {
    // Arrange — a real CTOC project root, not the crypto-home shape.
    const dir = makeProject();
    fs.writeFileSync(path.join(dir, '.ctoc', 'settings.yaml'), 'general: {}\n');
    try {
      // Act
      const found = budget.findProjectRoot(dir);

      // Assert — the shared resolver recognises the project `.ctoc`.
      assert.equal(fs.realpathSync(found), fs.realpathSync(dir));
    } finally {
      cleanup(dir);
    }
  });

  it('walks UP from a nested subdirectory to the project root', () => {
    // Arrange — genuine project marker, deep start.
    const dir = makeProject();
    fs.writeFileSync(path.join(dir, '.ctoc', 'settings.yaml'), 'general: {}\n');
    const nested = path.join(dir, 'a', 'b', 'c');
    fs.mkdirSync(nested, { recursive: true });
    try {
      // Act
      const found = budget.findProjectRoot(nested);

      // Assert — the walk climbs to the project root, not the nested start.
      assert.equal(fs.realpathSync(found), fs.realpathSync(dir));
    } finally {
      cleanup(dir);
    }
  });

  it('falls back to the working directory when no project marker exists up to the filesystem root', () => {
    // Arrange — the filesystem root carries no project marker.
    const root = path.parse(process.cwd()).root;

    // Act
    const found = budget.findProjectRoot(root);

    // Assert — the shared resolver's documented fallback is cwd, NOT the start dir.
    assert.equal(fs.realpathSync(found), fs.realpathSync(process.cwd()));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  parseYaml value coercion — floats, inline arrays (empty + populated),
//  quoted strings, the JSON.parse-failure fallback, null variants, bare strings.
//  KILLS: the per-shape branches in parseYamlValue (lines 71-87).
// ─────────────────────────────────────────────────────────────────────────────

describe('budget-coverage — parseYaml scalar/array coercion', () => {
  const rows = [
    { id: 'float', doc: 'k: 1.5', expected: 1.5 },
    { id: 'negative-int', doc: 'k: -7', expected: -7 },
    { id: 'bool-true', doc: 'k: true', expected: true },
    { id: 'bool-false', doc: 'k: false', expected: false },
    { id: 'tilde-null', doc: 'k: ~', expected: null },
    { id: 'literal-null', doc: 'k: null', expected: null },
    { id: 'quoted-string', doc: 'k: "hello world"', expected: 'hello world' },
    { id: 'bare-string', doc: 'k: plain', expected: 'plain' },
    { id: 'empty-inline-array', doc: 'k: []', expected: [] },
    { id: 'populated-inline-array', doc: 'k: [1, 2, 3]', expected: [1, 2, 3] },
  ];
  for (const row of rows) {
    it(`parses ${row.id}`, () => {
      // Act
      const parsed = budget.parseYaml(row.doc);

      // Assert
      assert.deepEqual(parsed.k, row.expected);
    });
  }

  it('falls back to the unquoted slice when a "quoted" value is invalid JSON', () => {
    // Arrange — starts and ends with a quote but is not valid JSON
    // Act
    const parsed = budget.parseYaml('k: "a"b"');

    // Assert — JSON.parse throws, catch returns v.slice(1, -1)
    assert.equal(parsed.k, 'a"b');
  });

  it('skips a line that has no colon (colonIdx === -1)', () => {
    // Act
    const parsed = budget.parseYaml('valid: 1\nnocolon here\nalso: 2');

    // Assert — the colon-less line is ignored, the rest survive
    assert.equal(parsed.valid, 1);
    assert.equal(parsed.also, 2);
    assert.equal(Object.prototype.hasOwnProperty.call(parsed, 'nocolon here'), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  parseYaml dedent — a nested map followed by keys at shallower indent must
//  pop the stack so the shallower keys land at the correct level.
//  KILLS: the while-pop on lines 104-106.
// ─────────────────────────────────────────────────────────────────────────────

describe('budget-coverage — parseYaml stack dedent', () => {
  it('pops nested frames so a sibling and a top-level key land correctly', () => {
    // Arrange
    const doc = [
      'budget:',
      '  checkpoint_at:',
      '    dispatches: [1]',
      '  max_dispatches: 5',   // dedent one level -> sibling of checkpoint_at
      'top: 9',                // dedent to root
    ].join('\n');

    // Act
    const parsed = budget.parseYaml(doc);

    // Assert
    assert.deepEqual(parsed.budget.checkpoint_at.dispatches, [1]);
    assert.equal(parsed.budget.max_dispatches, 5);           // NOT nested under checkpoint_at
    assert.equal(parsed.budget.checkpoint_at.max_dispatches, undefined);
    assert.equal(parsed.top, 9);                             // popped all the way to root
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  stringifyYaml — array rendering (string vs non-string element), nested
//  object, null, and scalar branches.
//  KILLS: line 132 (string element JSON.stringify'd/quoted vs number String'd),
//  plus the null (129), nested-object (133-135), string (136), else (138) arms.
// ─────────────────────────────────────────────────────────────────────────────

describe('budget-coverage — stringifyYaml element typing', () => {
  it('quotes string array elements and leaves numbers bare', () => {
    // Act
    const out = budget.stringifyYaml({ arr: ['s', 5, true] });

    // Assert — string quoted, number/bool bare (a mutant that String()s all
    // elements would emit [s, 5, true] and red this)
    assert.match(out, /^arr: \["s", 5, true\]$/m);
  });

  it('renders null, nested maps, strings and numbers on their own lines', () => {
    // Act
    const out = budget.stringifyYaml({ n: null, s: 'hi', num: 3, nested: { deep: 'x' } });

    // Assert
    assert.match(out, /^n: null$/m);
    assert.match(out, /^s: "hi"$/m);
    assert.match(out, /^num: 3$/m);
    assert.match(out, /^nested:$/m);
    assert.match(out, /^ {2}deep: "x"$/m);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  loadBudget resilience.
//  KILLS: the `parsed && parsed.budget ? parsed.budget : {}` else (config with
//  no `budget:` key) AND the readYamlFile catch (lines 149-151) when the config
//  path is unreadable (a directory where a file is expected -> EISDIR).
// ─────────────────────────────────────────────────────────────────────────────

describe('budget-coverage — loadBudget falls back to DEFAULTS', () => {
  it('yaml present but without a budget: key yields pure defaults', () => {
    // Arrange
    const dir = makeProject(`other_section:\n  foo: 1\n`);
    try {
      // Act
      const cfg = budget.loadBudget(dir);

      // Assert
      assert.equal(cfg.max_dispatches, 100);
      assert.equal(cfg.max_session_hours, 4);
      assert.deepEqual(cfg.checkpoint_at.dispatches, [50, 75]);
    } finally {
      cleanup(dir);
    }
  });

  it('unreadable budget.yaml (a directory, not a file) yields defaults via the catch', () => {
    // Arrange — existsSync true, readFileSync throws EISDIR -> readYamlFile catch
    const dir = makeProject();
    fs.mkdirSync(path.join(dir, '.ctoc', 'config', 'budget.yaml'), { recursive: true });
    try {
      // Act
      const cfg = budget.loadBudget(dir);

      // Assert
      assert.equal(cfg.max_dispatches, 100);
      assert.equal(cfg.halt_action, 'ask_user');
    } finally {
      cleanup(dir);
    }
  });

  it('merges a partial user checkpoint_at with the default for the other axis', () => {
    // Arrange
    const dir = makeProject(`budget:\n  checkpoint_at:\n    dispatches: [9]\n`);
    try {
      // Act
      const cfg = budget.loadBudget(dir);

      // Assert — user dispatches override, iron_loop_iterations stays default
      assert.deepEqual(cfg.checkpoint_at.dispatches, [9]);
      assert.deepEqual(cfg.checkpoint_at.iron_loop_iterations, [25, 40]);
    } finally {
      cleanup(dir);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  formatStatus over-budget and checkpoint branches (lines 305-311).
//  KILLS: the OVER BUDGET arm (306-309) and the checkpoint arm (311); the
//  existing suite only exercises the "within limits" else.
// ─────────────────────────────────────────────────────────────────────────────

describe('budget-coverage — formatStatus status arms', () => {
  it('renders the OVER BUDGET block with each exceeded limit', () => {
    // Arrange
    const dir = makeProject(`budget:\n  max_dispatches: 1\n`);
    try {
      budget.recordDispatch('a', dir, SESSION);
      budget.recordDispatch('b', dir, SESSION);

      // Act
      const text = budget.formatStatus(dir, SESSION);

      // Assert
      assert.match(text, /STATUS: OVER BUDGET \(1\)/);
      assert.match(text, /- max_dispatches: 2 > 1/);
    } finally {
      cleanup(dir);
    }
  });

  it('renders the checkpoint status when a threshold is hit while within limits', () => {
    // Arrange
    const dir = makeProject(
      `budget:\n  max_dispatches: 100\n  checkpoint_at:\n    dispatches: [1]\n`
    );
    try {
      budget.recordDispatch('a', dir, SESSION);

      // Act
      const text = budget.formatStatus(dir, SESSION);

      // Assert
      assert.match(text, /STATUS: checkpoint \(dispatches=1\)/);
    } finally {
      cleanup(dir);
    }
  });

  it('shows last_target and last_step lines when present', () => {
    // Arrange
    const dir = makeProject();
    try {
      budget.recordDispatch('quality/code-reviewer', dir, SESSION);
      budget.recordIronLoopStep('IMPLEMENT', dir, SESSION);

      // Act
      const text = budget.formatStatus(dir, SESSION);

      // Assert
      assert.match(text, /Last dispatch:\s+quality\/code-reviewer/);
      assert.match(text, /Last Iron step:\s+IMPLEMENT/);
    } finally {
      cleanup(dir);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  enforce — within-limits early return, and the halt_action `|| 'ask_user'`
//  fallback when halt_action is null on disk.
//  KILLS: the `if (result.withinLimits) return result` early return (line 324)
//  and the `result.config.halt_action || 'ask_user'` fallback (line 327).
// ─────────────────────────────────────────────────────────────────────────────

describe('budget-coverage — enforce edge decisions', () => {
  it('returns the result without throwing when within limits', () => {
    // Arrange
    const dir = makeProject(`budget:\n  max_dispatches: 100\n`);
    try {
      budget.recordDispatch('a', dir, SESSION);

      // Act
      const r = budget.enforce(dir, SESSION);

      // Assert
      assert.equal(r.withinLimits, true);
    } finally {
      cleanup(dir);
    }
  });

  it('treats a null halt_action as ask_user and throws BUDGET_EXCEEDED', () => {
    // Arrange — halt_action:null overrides the default, exercising `|| 'ask_user'`
    const dir = makeProject(`budget:\n  max_dispatches: 1\n  halt_action: null\n`);
    try {
      budget.recordDispatch('a', dir, SESSION);
      budget.recordDispatch('b', dir, SESSION);

      // Act
      let err;
      try { budget.enforce(dir, SESSION); } catch (e) { err = e; }

      // Assert
      assert.ok(err, 'enforce must throw when over limit and halt_action is falsy');
      assert.equal(err.code, 'BUDGET_EXCEEDED');
    } finally {
      cleanup(dir);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  resetSession removes the usage file (idempotent second call is a no-op).
//  KILLS: the unlink path; a mutant that skips the unlink leaves counters intact.
// ─────────────────────────────────────────────────────────────────────────────

describe('budget-coverage — resetSession removes the usage file', () => {
  it('deletes the file so a second reset on an absent file still succeeds', () => {
    // Arrange
    const dir = makeProject();
    try {
      budget.recordDispatch('a', dir, SESSION);
      const p = budget.getUsagePath(dir, SESSION);
      assert.ok(fs.existsSync(p));

      // Act
      budget.resetSession(dir, SESSION);

      // Assert — file gone, and a repeat reset (absent file) is a silent no-op
      assert.equal(fs.existsSync(p), false);
      assert.equal(budget.resetSession(dir, SESSION), true);
      assert.equal(budget.currentUsage(dir, SESSION).dispatches, 0);
    } finally {
      cleanup(dir);
    }
  });
});
