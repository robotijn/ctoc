'use strict';

/**
 * THE DEAD-CODE FENCE — a ratcheting reachability gate.
 *
 * Root cause this closes (2026-07-14): a slice ships "module + its own test", a
 * test IS a caller, so every module always had a caller and nothing ever checked
 * reachability from a LIVE root. The suite certified dead code as healthy —
 * roughly half of src/ was unreachable while 5,889 tests passed. Modules were
 * built, tested, reviewed, and gate-approved without ever being wired; the
 * verify-evidence writer that Gate 3 depends on shipped exactly that way.
 *
 * THE RATCHET, and why a plain "zero unreachable" assertion is not enough:
 * the debt is real and is being paid down file by file. So this gate asserts
 * two things that together make regression impossible:
 *
 *   1. The unreachable COUNT may never rise above the committed baseline.
 *   2. No file may EVER join the unreachable set — the baseline is a named
 *      list, not just a number, so a newly-dead file fails the gate even if a
 *      previously-dead file was fixed in the same change (a swap that keeps the
 *      count flat).
 *
 * The baseline may only ever SHRINK. Lowering it is the reward for wiring or
 * deleting a file; raising it is forbidden and this test says so out loud.
 *
 * TWO SEPARATE STRUCTURES, and conflating them is what kills a fence:
 *   • `unreachable` — pre-existing DEBT. May only SHRINK. No per-entry
 *     justification (demanding one for every entry is how a fence never lands).
 *   • `whitelist`   — a PERMANENT exemption for a file genuinely reachable by a
 *     mechanism the analyzer cannot see. ONE OBJECT mapping file → written
 *     justification (the shape .ctoc/false-green-baseline.json uses), so an entry
 *     and its reason cannot desynchronize. Starts EMPTY.
 *
 * A CITATION IS NOT AN INVOCATION — in this fence too. A path merely NAMED in
 * markdown prose is not a root; a string literal ending in `.js` sitting in a
 * presence-check array is not a call edge; a `require` inside a COMMENT is not a
 * caller. That rule was always enforced by the sibling export fence and is now
 * enforced here.
 *
 * AND THE ANALYZER FAILS LOUD. Every read path used to degrade silently toward
 * "unreachable": an unreadable source file returned no edges, an unreadable hooks
 * manifest became the empty string (so EVERY hook lost root status at once), and
 * an unreadable instruction surface was skipped. A fence whose failure mode is
 * "everything is dead", feeding a list whose only exits are wire-or-delete, would
 * nominate live code for deletion. Unreadable is now FATAL; ABSENT is still a
 * legitimate state — they are different facts.
 *
 * A TEST IS NEVER A ROOT. Live roots are: registered hooks, the three shipped
 * slash commands, pipeline-sanctioned scripts, anything a shipped instruction
 * surface actually RUNS, and anything declared in .ctoc/reachability-roots.json
 * (a deliberate, reviewable act).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { analyze, edgesFrom } = require('../src/lib/reachability');

const ROOT = path.join(__dirname, '..');
const BASELINE_FILE = path.join(ROOT, '.ctoc', 'reachability-baseline.json');

// ─── fixture helpers ────────────────────────────────────────────────────────

/**
 * Build a throwaway project from a { relativePath: contents } map and hand its
 * root to `fn`. Real files, real analyzer, no seams — the discipline the export
 * fence uses. Two sentinels stand in for unreadable input:
 *
 *   • `null`  — an unreadable FILE the directory walkers still enumerate (a
 *               dangling symlink; `isDirectory()` is false so both the source and
 *               the surface walker pick it up, and the read then fails).
 *   • `false` — a path that EXISTS but is not a readable file (a directory sitting
 *               where a file belongs). This is the shape the hooks-manifest case
 *               needs, because `existsSync` follows a symlink and would report a
 *               dangling one as ABSENT — a different fact entirely.
 *
 * @param {Record<string,string|null|false>} files
 * @param {(root: string) => void} fn
 */
function withProject(files, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-filefence-'));
  try {
    for (const [rel, contents] of Object.entries(files)) {
      const full = path.join(tmp, ...rel.split('/'));
      fs.mkdirSync(path.dirname(full), { recursive: true });
      if (contents === null) makeUnreadable(full);
      else if (contents === false) fs.mkdirSync(full, { recursive: true });
      else fs.writeFileSync(full, contents);
    }
    fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Create a path that EXISTS as a directory entry but cannot be READ.
 *
 * A dangling symlink is the portable way to get there: `readdirSync` reports it
 * (and `isDirectory()` is false, so both the source walker and the surface walker
 * pick it up as a file), while `readFileSync` fails. `chmod 000` is the fallback
 * for a platform without symlink permission. If neither works this throws LOUDLY
 * rather than letting the test pass on an input it never constructed — that is
 * the exact failure mode this whole slice exists to kill.
 *
 * @param {string} full - absolute path to create
 */
function makeUnreadable(full) {
  const attempts = [
    () => fs.symlinkSync(path.join(path.dirname(full), '__no_such_target__'), full),
    () => { fs.writeFileSync(full, 'x'); fs.chmodSync(full, 0o000); }
  ];
  for (const attempt of attempts) {
    try {
      fs.rmSync(full, { force: true });
      attempt();
      fs.readFileSync(full, 'utf8');
      // Readable → this attempt did not work; try the next one.
    } catch {
      return; // read threw → genuinely unreadable
    }
  }
  throw new Error(
    `could not construct an unreadable file at ${full} on this platform — the ` +
    'fail-loud contract cannot be exercised, so this test FAILS rather than passing vacuously'
  );
}

/** A minimal live root for a fixture project: the shipped menu slash command. */
const MENU = 'src/commands/start.js';

// ─── the live ratchet ───────────────────────────────────────────────────────

describe('dead-code fence — reachability from live roots (RATCHET)', () => {
  const result = analyze(ROOT);
  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  const allowed = new Set(baseline.unreachable);
  // PERMANENT exemptions are keys of ONE object, mirroring
  // tests/false-green-fence.test.js:229 — an entry and its justification are the
  // same key/value pair and cannot desynchronize.
  const exempt = new Set(Object.keys(baseline.whitelist || {}));
  const liveUnreachable = result.unreachable.filter((f) => !exempt.has(f));

  it('the analysis itself is non-vacuous: real files, real roots, real edges', () => {
    // Guards against a silent green from a broken analyzer (e.g. a path change
    // making it see zero files, which would make every assertion below trivial).
    assert.ok(result.total > 100, `expected a real src tree, saw ${result.total} files`);
    assert.ok(result.roots.length >= 10, `expected the live roots, saw ${result.roots.length}`);
    assert.ok(
      result.reachable.length > result.total / 4,
      'expected a substantial reachable core; the analyzer is probably broken'
    );
    // The three shipped slash commands must always be roots.
    for (const cmd of ['src/commands/start.js', 'src/commands/push.js', 'src/commands/update.js']) {
      assert.ok(result.roots.includes(cmd), `${cmd} must be a live root`);
    }
    // A test file can never be a root, and never appear in the graph at all.
    assert.ok(
      !result.roots.some((r) => r.includes('/tests/') || r.endsWith('.test.js')),
      'a test must never be a live root — that is the bug this gate exists to prevent'
    );
  });

  it('THE ANALYSIS READ EVERYTHING IT JUDGED: readErrors is empty', () => {
    // A verdict computed over files the analyzer could not read is a verdict on
    // input it never received. The baseline records the count the SEEDING run saw;
    // it must be zero, and every run since must still read everything.
    assert.deepEqual(
      result.readErrors, [],
      `the analyzer could not read: ${result.readErrors.join(', ')} — every file it ` +
      'could not read degrades toward "unreachable", so this verdict is not trustworthy'
    );
    assert.equal(
      baseline.seedReadErrors, 0,
      'the baseline was seeded from a run that could not read every input — that is ' +
      'committed debt built on absence of evidence. Re-seed from a clean run.'
    );
  });

  it('NO NEW DEAD FILE: every unreachable file is already in the baseline', () => {
    const newlyDead = liveUnreachable.filter((f) => !allowed.has(f));
    assert.deepEqual(
      newlyDead,
      [],
      'These files are unreachable from every live root — they are DEAD ON ARRIVAL.\n' +
      'A module is not done when its test passes; it is done when a human can reach it.\n' +
      'Wire each to a live root (hook, slash command, or sanctioned script), delete it,\n' +
      'or — if it is genuinely a new entry point — declare it in .ctoc/reachability-roots.json.\n' +
      `Newly dead: ${newlyDead.join(', ')}`
    );
  });

  it('THE RATCHET ONLY TIGHTENS: unreachable count never exceeds the baseline', () => {
    assert.ok(
      liveUnreachable.length <= baseline.maxUnreachable,
      `unreachable count rose to ${liveUnreachable.length}, baseline is ${baseline.maxUnreachable}. ` +
      'The baseline may only ever be LOWERED. Never raise it to make this pass.'
    );
  });

  it('LOWER THE BASELINE when you pay debt down (fails loudly on unclaimed progress)', () => {
    // The reward mechanism, mirroring the typecheck ratchet: if the live count
    // drops below the baseline, the baseline is stale and must be tightened, or
    // the fence slowly loses its grip.
    assert.equal(
      liveUnreachable.length,
      baseline.maxUnreachable,
      `Live unreachable count is ${liveUnreachable.length} but the baseline says ` +
      `${baseline.maxUnreachable}. You wired or deleted files — now LOWER maxUnreachable to ` +
      `${liveUnreachable.length} and remove the fixed files from the baseline list.`
    );
  });

  it('the baseline list is honest: no phantom entries for files that no longer exist', () => {
    const phantoms = baseline.unreachable.filter(
      (f) => !fs.existsSync(path.join(ROOT, f))
    );
    assert.deepEqual(
      phantoms,
      [],
      `Baseline names files that do not exist (deleted?): ${phantoms.join(', ')} — remove them.`
    );
  });

  it('DEBT AND EXEMPTION STAY SEPARATE: whitelist is ONE justified object', () => {
    assert.ok(
      baseline.whitelist && typeof baseline.whitelist === 'object' && !Array.isArray(baseline.whitelist),
      '`whitelist` must be an OBJECT mapping file → written justification (the shape ' +
      '.ctoc/false-green-baseline.json uses), so an entry and its reason cannot desynchronize'
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(baseline, 'whitelistJustifications'), false,
      'a separate justifications map reintroduces exactly the desynchronization the ' +
      'one-object shape prevents — do not create it'
    );
    for (const [file, reason] of Object.entries(baseline.whitelist)) {
      assert.ok(
        typeof reason === 'string' && reason.length > 20,
        `whitelist entry ${file} must carry a written justification — a permanent ` +
        'exemption is a reviewable act, unlike the debt list'
      );
      assert.ok(
        !allowed.has(file),
        `${file} is in BOTH the debt list and the whitelist — conflating tolerated debt ` +
        'with permanent exemption is what kills a fence'
      );
    }
  });
});

// ─── the caller rule, on planted fixtures ───────────────────────────────────

describe('dead-code fence — a citation is not an invocation (planted fixtures)', () => {
  it('1 · a presence-check ARRAY of path literals is NOT a caller', () => {
    withProject({
      [MENU]: "require('../lib/enforcer');\n",
      'src/lib/enforcer.js': [
        "const { existsSync } = require('fs');",
        'const REQUIRED_LIBS = [',
        "  'src/lib/orphan.js',",
        '];',
        'REQUIRED_LIBS.forEach((f) => existsSync(f));',
        'module.exports = { REQUIRED_LIBS };'
      ].join('\n'),
      'src/lib/orphan.js': 'module.exports = {};\n'
    }, (root) => {
      const r = analyze(root);
      assert.ok(
        r.unreachable.includes('src/lib/orphan.js'),
        'a filename passed to existsSync is checked for EXISTENCE, never executed — ' +
        `it must not manufacture a call edge. unreachable = ${JSON.stringify(r.unreachable)}`
      );
    });
  });

  it('2 · a real spawn BY PATH is still a caller', () => {
    withProject({
      [MENU]: "const { spawnSync } = require('child_process');\n" +
              "spawnSync('node', ['src/lib/spawned.js']);\n",
      'src/lib/spawned.js': 'module.exports = {};\n'
    }, (root) => {
      const r = analyze(root);
      assert.ok(
        r.reachable.includes('src/lib/spawned.js'),
        `a spawned script IS executed and must stay reachable. unreachable = ${JSON.stringify(r.unreachable)}`
      );
    });
  });

  it('3 · a require inside a COMMENT is not a caller', () => {
    withProject({
      [MENU]: "require('../lib/live');\n",
      'src/lib/live.js': "// require('./ghost')\nmodule.exports = {};\n",
      'src/lib/ghost.js': 'module.exports = {};\n'
    }, (root) => {
      const r = analyze(root);
      assert.ok(
        r.unreachable.includes('src/lib/ghost.js'),
        'a fence a comment can disarm is not a fence — the export fence has always ' +
        `stripped comments and this one now does too. unreachable = ${JSON.stringify(r.unreachable)}`
      );
    });
  });

  it('4 · PROSE naming a path in markdown is NOT a root', () => {
    withProject({
      [MENU]: 'module.exports = {};\n',
      'agents/auditor.md': 'Audit hash-chain (`src/lib/cited.js`) — every dispatch entry is content-hashed.\n',
      'src/lib/cited.js': 'module.exports = {};\n'
    }, (root) => {
      const r = analyze(root);
      assert.ok(
        r.unreachable.includes('src/lib/cited.js'),
        'a sentence that merely NAMES a file is a citation, not an execution root. ' +
        `roots = ${JSON.stringify(r.roots)}`
      );
    });
  });

  it('5 · a surface that RUNS a path IS a root', () => {
    withProject({
      [MENU]: 'module.exports = {};\n',
      'src/commands/start.md': 'Run the self-check:\n\n    node src/scripts/invoked.js\n',
      'src/scripts/invoked.js': 'module.exports = {};\n'
    }, (root) => {
      const r = analyze(root);
      assert.ok(
        r.roots.includes('src/scripts/invoked.js'),
        `a shipped instruction the session RUNS is a genuine root. roots = ${JSON.stringify(r.roots)}`
      );
    });
  });

  it('6 · an inline require RECIPE is a root', () => {
    withProject({
      [MENU]: 'module.exports = {};\n',
      'agents/planner.md': 'Then: node -e "require(\'./src/lib/recipe.js\').go()"\n',
      'src/lib/recipe.js': 'module.exports = { go() {} };\n'
    }, (root) => {
      const r = analyze(root);
      assert.ok(
        r.roots.includes('src/lib/recipe.js'),
        `an inline require recipe is an invocation the session runs. roots = ${JSON.stringify(r.roots)}`
      );
    });
  });

  it('7 · a BASENAME collision cannot fan out', () => {
    withProject({
      [MENU]: "const NAME = 'helper.js';\nmodule.exports = { NAME };\n",
      'src/lib/helper.js': 'module.exports = {};\n',
      'src/scripts/helper.js': 'module.exports = {};\n'
    }, (root) => {
      const r = analyze(root);
      assert.deepEqual(
        r.unreachable.filter((f) => f.endsWith('helper.js')).sort(),
        ['src/lib/helper.js', 'src/scripts/helper.js'],
        'a bare basename names no path — it must never credit every file that shares it'
      );
    });
  });

  it('8 · a TEST is still never a root and never a source', () => {
    withProject({
      [MENU]: 'module.exports = {};\n',
      'tests/orphan.test.js': "require('../src/lib/orphan');\n",
      'src/lib/orphan.js': 'module.exports = {};\n'
    }, (root) => {
      const r = analyze(root);
      assert.ok(
        !r.roots.some((f) => f.includes('tests/') || f.endsWith('.test.js')),
        'a test is never a root'
      );
      assert.ok(
        r.unreachable.includes('src/lib/orphan.js'),
        'a test IS a caller, and that is exactly the false green this fence exists to catch'
      );
    });
  });
});

// ─── fail-loud on unreadable input ──────────────────────────────────────────

describe('dead-code fence — unreadable input is FATAL, absent input is not', () => {
  it('10 · an UNREADABLE hooks manifest THROWS — it is never "this project has no hooks"', () => {
    withProject({
      [MENU]: 'module.exports = {};\n',
      'src/hooks/SessionStart.js': 'module.exports = {};\n',
      '.claude-plugin/hooks.json': false
    }, (root) => {
      assert.throws(
        () => analyze(root),
        (err) => /hooks\.json/.test(err.message),
        'an unreadable manifest silently became the empty string, so EVERY registered ' +
        'hook lost root status at once with no error — the worst shape of this defect'
      );
    });
  });

  it('11 · an ABSENT hooks manifest is still the legitimate no-hooks state', () => {
    withProject({
      [MENU]: 'module.exports = {};\n',
      'src/hooks/SessionStart.js': 'module.exports = {};\n'
    }, (root) => {
      const r = analyze(root);
      assert.ok(
        r.unreachable.includes('src/hooks/SessionStart.js'),
        'absent and unreadable are DIFFERENT facts: no manifest means no hook roots'
      );
      assert.deepEqual(r.readErrors, [], 'an absent manifest is not a read error');
    });
  });

  it('12 · an UNREADABLE source file THROWS instead of reporting zero edges', () => {
    withProject({ [MENU]: 'module.exports = {};\n' }, (root) => {
      const vanished = path.join(root, 'src', 'lib', 'vanished.js');
      assert.throws(
        () => edgesFrom(vanished, [], root),
        (err) => /vanished\.js/.test(err.message),
        'a source file the analyzer cannot read has no outbound edges — everything it ' +
        'reaches silently loses a caller'
      );
    });
  });

  it('13 · an UNREADABLE instruction surface THROWS instead of being skipped', () => {
    withProject({
      [MENU]: 'module.exports = {};\n',
      'agents/broken.md': null
    }, (root) => {
      assert.throws(
        () => analyze(root),
        (err) => /broken\.md/.test(err.message),
        'a skipped surface silently loses every root it would have declared'
      );
    });
  });

  it('14 · readErrors names the file under tolerateReadErrors, and blocks a seed', () => {
    withProject({
      [MENU]: 'module.exports = {};\n',
      'agents/broken.md': null
    }, (root) => {
      const r = analyze(root, { tolerateReadErrors: true });
      assert.ok(
        r.readErrors.some((e) => e.includes('broken.md')),
        `readErrors must name what could not be read, saw ${JSON.stringify(r.readErrors)}`
      );
      assert.ok(
        r.readErrors.length > 0,
        'a run with a non-empty readErrors may NEVER seed a baseline — a seed taken ' +
        'from a partial read is committed debt built on absence of evidence'
      );
    });
  });

  it('15 · KNOWN GAP: hoisted-variable spawn, new Worker and dynamic import are NOT edges', () => {
    // These are REAL invocation shapes an argument-text rule cannot see. They are
    // pinned here so the answer is visible instead of silent: if a future change
    // teaches the analyzer one of them, this test says so out loud.
    withProject({
      [MENU]: [
        "const path = require('path');",
        "const { spawnSync } = require('child_process');",
        "const script = path.join(__dirname, '..', 'lib', 'hoisted.js');",
        "spawnSync('node', [script]);",
        "new Worker('./src/lib/worker.js');",
        "import('./src/lib/dynamic.js');"
      ].join('\n'),
      'src/lib/hoisted.js': 'module.exports = {};\n',
      'src/lib/worker.js': 'module.exports = {};\n',
      'src/lib/dynamic.js': 'module.exports = {};\n'
    }, (root) => {
      const r = analyze(root);
      assert.ok(
        r.unreachable.includes('src/lib/hoisted.js'),
        'KNOWN GAP — a spawn whose path was assigned to a variable earlier is not seen'
      );
      assert.ok(
        r.unreachable.includes('src/lib/worker.js'),
        'KNOWN GAP — new Worker(path) is not in the recognised invocation list'
      );
      assert.ok(
        r.unreachable.includes('src/lib/dynamic.js'),
        'KNOWN GAP — dynamic import(path) is neither a spawn form nor a require'
      );
    });
  });
});
