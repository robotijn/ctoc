'use strict';

/**
 * Security: injection + traversal in CTOC's OWN code.
 *
 * Targets CTOC's hand-rolled frontmatter / YAML parsers and its plan-ref →
 * filesystem-path handling. Every test asserts the INTENDED security CONTRACT,
 * not the observed behavior. A failing assertion therefore means a REAL BUG was
 * found — it is left failing on purpose so the suite reports it. No test is
 * skipped, weakened, or made always-green; each has at least one real assertion.
 *
 * Coverage:
 *   - PROTOTYPE POLLUTION via `__proto__` / `constructor` / `prototype` keys
 *     fed to the three object-building parsers (inbox.parseFrontmatter via
 *     listQuestions/listDecisions, state.parseMetadata,
 *     regulatory-regime.parseYAMLShallow via loadProfile).
 *   - PLAN-REF PATH TRAVERSAL via `..` segments fed to the two surfaces that
 *     turn a user-supplied ref into a filesystem path and then READ or MOVE it
 *     (menu-screens.route 'validate' and src/scripts/move-plan.js). Both must
 *     stay confined to plans/.
 *   - PARSER ROBUSTNESS on malformed / huge / special-char input — must never
 *     throw uncaught, hang, or execute embedded content.
 *
 * Mechanics: node:test + node:assert/strict, hermetic temp dirs
 * (mkdtempSync → realpathSync to defeat macOS /var → /private/var symlink),
 * cross-platform path.join, cleanup in afterEach.
 */

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const REPO = path.resolve(__dirname, '..');

const inbox = require(path.join(REPO, 'src', 'lib', 'inbox.js'));
const state = require(path.join(REPO, 'src', 'lib', 'state.js'));
const regulatory = require(path.join(REPO, 'src', 'lib', 'regulatory-regime.js'));
const menuScreens = require(path.join(REPO, 'src', 'lib', 'menu-screens.js'));

const MOVE_PLAN_SCRIPT = path.join(REPO, 'src', 'scripts', 'move-plan.js');

// ---------------------------------------------------------------------------
// Hermetic temp-dir helpers
// ---------------------------------------------------------------------------

const tmpDirs = [];

function makeTmpRoot(prefix) {
  // realpathSync collapses the macOS /var -> /private/var symlink so later
  // path.resolve / path.relative comparisons are apples-to-apples.
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  tmpDirs.push(dir);
  return dir;
}

/** A minimal CTOC project root: plans/<stages>/ + a .ctoc/ marker. */
function makeProjectRoot(prefix) {
  const root = makeTmpRoot(prefix);
  for (const stage of ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done']) {
    fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
  }
  fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
  // settings.json makes findProjectRoot treat this as the project root.
  fs.writeFileSync(path.join(root, '.ctoc', 'settings.json'), '{}');
  return root;
}

afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

/**
 * Sentinel guard for prototype pollution. Captures Object.prototype state, runs
 * the parse, then asserts NOTHING leaked onto the global prototype. Cleans up
 * any leak so one failing test cannot poison the rest of the suite.
 */
function assertNoPrototypePollution(label, runParse) {
  const sentinelKeys = ['polluted', 'isAdmin', 'injected'];
  // Pre-condition: a clean prototype.
  for (const k of sentinelKeys) {
    assert.equal(({})[k], undefined, `${label}: precondition — Object.prototype.${k} should start clean`);
  }

  let parseError;
  try {
    runParse();
  } catch (err) {
    parseError = err;
  }

  // Capture pollution state BEFORE asserting, so we can always clean up.
  const leaked = {};
  for (const k of sentinelKeys) {
    if (Object.prototype.hasOwnProperty.call(Object.prototype, k)) {
      leaked[k] = Object.prototype[k];
      delete Object.prototype[k];
    }
  }

  // Parsers must not throw on hostile-but-well-formed frontmatter.
  assert.equal(parseError, undefined,
    `${label}: parser threw on a __proto__/constructor key — ${parseError && parseError.message}`);

  // CONTRACT: a freshly created plain object must be unpolluted, and
  // Object.prototype itself must carry none of the sentinel keys.
  assert.deepEqual(leaked, {},
    `${label}: prototype pollution detected — Object.prototype gained ${JSON.stringify(leaked)}`);
  for (const k of sentinelKeys) {
    assert.equal(({})[k], undefined,
      `${label}: ({}).${k} must be undefined after parsing untrusted input`);
  }
}

// ===========================================================================
// 1. PROTOTYPE POLLUTION — inbox.parseFrontmatter (via listQuestions / listDecisions)
// ===========================================================================

describe('prototype pollution — inbox frontmatter parser', () => {
  function writeQuestion(root, name, frontmatter) {
    const dir = path.join(root, '.ctoc', 'inbox', 'questions');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), frontmatter);
  }
  function writeDecision(root, name, frontmatter) {
    const dir = path.join(root, '.ctoc', 'inbox', 'decisions');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), frontmatter);
  }

  test('__proto__ key in a question file does not pollute the global prototype', () => {
    const root = makeTmpRoot('ctoc-inbox-proto-');
    writeQuestion(root, 'q.md',
      '---\nid: q1\nstatus: open\n__proto__: polluted\nquestion: hi\n---\n## Question\nhi\n');

    assertNoPrototypePollution('inbox.listQuestions(__proto__)', () => {
      const items = inbox.listQuestions(root);
      // Real assertion on the happy path too: the file is still parsed.
      assert.equal(items.length, 1, 'the question file should still be listed');
      assert.equal(items[0].id, 'q1', 'benign keys must still parse');
    });
  });

  test('constructor key in a decision file does not corrupt object construction', () => {
    const root = makeTmpRoot('ctoc-inbox-ctor-');
    writeDecision(root, 'd.md',
      '---\nid: d1\nstatus: pending-review\nconstructor: injected\nplan: p\n---\n## Ambiguity\nx\n');

    let items;
    assertNoPrototypePollution('inbox.listDecisions(constructor)', () => {
      items = inbox.listDecisions(root);
    });
    // CONTRACT: a real object's constructor chain is intact (still Object),
    // i.e. the injected `constructor: injected` string did not replace it.
    assert.equal(({}).constructor, Object,
      'Object literal .constructor must remain the real Object constructor');
    assert.equal(items.length, 1, 'the decision file should still be listed');
  });

  test('getInboxCounts over a __proto__-laden plan tree does not pollute', () => {
    const root = makeProjectRoot('ctoc-inbox-counts-');
    // A plan sitting at a gate, with a hostile frontmatter key.
    fs.writeFileSync(
      path.join(root, 'plans', 'review', 'evil.md'),
      '---\n__proto__: polluted\ntitle: evil\n---\nbody\n');
    writeQuestion(root, 'q.md', '---\nstatus: open\nprototype: injected\n---\nbody\n');

    assertNoPrototypePollution('inbox.getInboxCounts(__proto__/prototype)', () => {
      const counts = inbox.getInboxCounts(root);
      assert.equal(typeof counts.gatesWaiting, 'number', 'counts must still compute');
      assert.ok(counts.gatesWaiting >= 1, 'the review-stage plan should be counted as at-gate');
    });
  });
});

// ===========================================================================
// 2. PROTOTYPE POLLUTION — state.parseMetadata
// ===========================================================================

describe('prototype pollution — state.parseMetadata', () => {
  test('__proto__: <string> does not pollute', () => {
    assertNoPrototypePollution('state.parseMetadata(__proto__ string)', () => {
      const meta = state.parseMetadata('---\n__proto__: polluted\nname: ok\n---\nbody\n');
      assert.equal(meta.name, 'ok', 'benign keys must still parse');
    });
  });

  test('constructor / prototype keys do not pollute or corrupt construction', () => {
    assertNoPrototypePollution('state.parseMetadata(constructor/prototype)', () => {
      const meta = state.parseMetadata(
        '---\nconstructor: injected\nprototype: injected\ntitle: t\n---\nbody\n');
      assert.equal(meta.title, 't', 'benign keys must still parse');
    });
    assert.equal(({}).constructor, Object, 'Object literal .constructor must stay intact');
  });

  test('readPlans over a plan whose frontmatter carries __proto__ does not pollute', () => {
    const root = makeProjectRoot('ctoc-state-proto-');
    fs.writeFileSync(
      path.join(root, 'plans', 'todo', 'p.md'),
      '---\n__proto__: polluted\niron_loop: true\ntitle: t\n---\nbody\n');

    assertNoPrototypePollution('state.readPlans(__proto__)', () => {
      const plans = state.readPlans(path.join(root, 'plans', 'todo'));
      assert.equal(plans.length, 1, 'the plan must still be read');
      assert.equal(plans[0].metadata.title, 't', 'benign metadata must still parse');
    });
  });
});

// ===========================================================================
// 3. PROTOTYPE POLLUTION — regulatory-regime.parseYAMLShallow (via loadProfile)
// ===========================================================================

describe('prototype pollution — regulatory parseYAMLShallow', () => {
  function writeProfile(root, name, yaml) {
    const dir = path.join(root, '.ctoc', 'regulatory-regimes');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${name}.yaml`), yaml);
  }

  test('flat __proto__ key in a profile does not pollute', () => {
    const root = makeTmpRoot('ctoc-reg-flat-');
    writeProfile(root, 'evil',
      '__proto__: polluted\nrequired_controls:\n  - audit_hash_chain\n');

    assertNoPrototypePollution('regulatory.loadProfile(flat __proto__)', () => {
      const profile = regulatory.loadProfile(root, 'evil');
      assert.ok(Array.isArray(profile.required_controls), 'benign nested list must still parse');
    });
  });

  test('NESTED __proto__ map in a profile does not pollute the global prototype', () => {
    // The dangerous shape for a recursive YAML parser: a __proto__ key whose
    // value is a nested map, so child writes land on the parent prototype.
    const root = makeTmpRoot('ctoc-reg-nested-');
    writeProfile(root, 'evil',
      '__proto__:\n  polluted: true\n  isAdmin: true\nrequired_controls:\n  - audit_hash_chain\n');

    assertNoPrototypePollution('regulatory.loadProfile(nested __proto__)', () => {
      const profile = regulatory.loadProfile(root, 'evil');
      assert.ok(Array.isArray(profile.required_controls), 'sibling keys must still parse');
    });
  });

  test('effectiveControls over a profile stack with a __proto__ key does not pollute', () => {
    const root = makeTmpRoot('ctoc-reg-eff-');
    fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
    // A trailing top-level key (`general:`) is required because loadActiveProfiles
    // delimits the regulatory_regime block with a lookahead for the next
    // top-level key — so the block list parses only when another key follows.
    fs.writeFileSync(path.join(root, '.ctoc', 'settings.yaml'),
      'regulatory_regime:\n  active_profiles:\n    - evil\ngeneral:\n  environment: dev\n');
    writeProfile(root, 'evil',
      '__proto__:\n  polluted: true\nrequired_controls:\n  - audit_hash_chain\n');

    // CONTRACT: the full effectiveControls path (loadActiveProfiles ->
    // loadProfile -> parseYAMLShallow over the __proto__-laden profile) must not
    // pollute the global prototype, and must still return a Set.
    let controls;
    assertNoPrototypePollution('regulatory.effectiveControls(__proto__)', () => {
      controls = regulatory.effectiveControls(root);
    });
    assert.ok(controls instanceof Set, 'effectiveControls must return a Set even for a hostile profile');
    // The active profile WAS resolved (proves the parse path actually ran the
    // hostile profile rather than skipping it).
    assert.deepEqual(regulatory.loadActiveProfiles(root).profiles, ['evil'],
      'the hostile profile must have been resolved and parsed');
  });
});

// ===========================================================================
// 4. PLAN-REF PATH TRAVERSAL — menu-screens.route('validate', ...)
// ===========================================================================
//
// `validate <stage>/<file>` splits on the FIRST '/', so the stage prefix
// passes the STAGE_FOLDERS allow-list while the file portion can carry `..`.
// The resolved path is then handed to validateTransition -> fs.readFileSync.
// CONTRACT: the read must be confined to plans/<stage>/; a `..` ref that
// escapes the plans tree must NOT read an out-of-tree file.

describe('plan-ref traversal — validate route', () => {
  test('validate ref with .. must not read a file outside the plans/ tree', () => {
    const root = makeProjectRoot('ctoc-val-trav-');

    // A secret OUTSIDE plans/, at <root>/SECRET.md. With "functional" as the
    // stage, the file part "../../SECRET.md" resolves to plans/functional/
    // ../../SECRET.md == <root>/SECRET.md — outside the plans tree.
    const secretPath = path.join(root, 'SECRET.md');
    const SECRET_MARKER = 'TOP-SECRET-CONTENT-marker-zzz';
    fs.writeFileSync(secretPath,
      `---\napproved_by: human\niron_loop: true\nproblem: ${SECRET_MARKER}\n---\nbody\n`);

    const plansDir = path.join(root, 'plans');
    const ref = 'functional/../../SECRET.md';

    let result, threw;
    try {
      result = menuScreens.route(['validate', ref], root);
    } catch (err) {
      threw = err;
    }

    // The function must not crash on a hostile ref (graceful handling).
    assert.equal(threw, undefined,
      `validate route crashed on traversal ref instead of handling it: ${threw && threw.message}`);

    // CONTRACT (behavioral): the route MUST refuse a ref whose file part escapes
    // the plans/ tree, and MUST NOT read or surface the out-of-tree secret.
    //
    // NOTE: an earlier version of this assertion recomputed
    // path.resolve(plansDir, 'functional', '../../SECRET.md') and asserted it
    // stayed inside plans/. That was a tautology — it tests path.resolve() on a
    // literal string, which always escapes, independent of the code under test,
    // so no code fix could ever satisfy it. The genuine security contract is
    // behavioral: the route must not READ the out-of-tree file. The confinement
    // fix lives in src/lib/menu-screens.js (isUnsafePlanFile guard); this asserts
    // it works.
    void plansDir;
    const serialized = JSON.stringify(result || {});
    assert.ok(!serialized.includes(SECRET_MARKER),
      'validate route READ and surfaced a file outside plans/ via .. traversal');
    assert.match((result && result.text) || '', /invalid|refus|escape/i,
      'validate route must explicitly refuse a traversal ref, not silently process it');
  });
});

// ===========================================================================
// 5. PLAN-REF PATH TRAVERSAL — src/scripts/move-plan.js (real process)
// ===========================================================================
//
// move-plan.js validates the stage prefix against VALID_STAGES, then builds
// planPath = path.join(root, 'plans', ref) and renameSync's it. A `..` in the
// file portion escapes the plans tree. CONTRACT: a source ref that points
// outside plans/ must be REFUSED (non-zero exit, no move).

describe('plan-ref traversal — move-plan.js script', () => {
  test('move-plan refuses a source ref that escapes plans/ via ..', () => {
    const root = makeProjectRoot('ctoc-mvp-trav-');

    // A file OUTSIDE plans/ at <root>/outside.md.
    const outsidePath = path.join(root, 'outside.md');
    fs.writeFileSync(outsidePath, 'OUTSIDE-FILE-do-not-touch\n');

    // ref "functional/../../outside.md": stage prefix "functional" passes the
    // allow-list; the file part escapes to <root>/outside.md.
    const ref = 'functional/../../outside.md';

    const res = cp.spawnSync(process.execPath, [MOVE_PLAN_SCRIPT, ref, 'in-progress'], {
      cwd: root,
      encoding: 'utf8'
    });

    // It must not hang / crash uncontrollably.
    assert.equal(res.error, undefined, `move-plan.js failed to spawn: ${res.error && res.error.message}`);

    // CONTRACT 1: an out-of-tree source must be REFUSED (non-zero exit).
    assert.notEqual(res.status, 0,
      'move-plan.js accepted a source ref that escapes plans/ via .. (exit 0). ' +
      `stdout=${JSON.stringify(res.stdout)} stderr=${JSON.stringify(res.stderr)}`);

    // CONTRACT 2: the out-of-tree file must be untouched (not moved away).
    assert.equal(fs.existsSync(outsidePath), true,
      'move-plan.js MOVED a file from OUTSIDE plans/ — the outside file was relocated.');

    // CONTRACT 3: nothing should have landed in plans/in-progress/ from the
    // out-of-tree source.
    assert.equal(
      fs.existsSync(path.join(root, 'plans', 'in-progress', 'outside.md')),
      false,
      'move-plan.js pulled an out-of-tree file INTO the plans/ tree via .. traversal.');
  });

  test('move-plan still works for a legitimate in-tree, non-gate move', () => {
    // Guards against the confinement fix over-blocking legitimate refs.
    const root = makeProjectRoot('ctoc-mvp-legit-');
    fs.writeFileSync(path.join(root, 'plans', 'todo', 'real.md'),
      '---\niron_loop: true\n---\nbody\n');

    const res = cp.spawnSync(process.execPath, [MOVE_PLAN_SCRIPT, 'todo/real.md', 'in-progress'], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(res.error, undefined, `spawn failed: ${res.error && res.error.message}`);
    assert.equal(res.status, 0,
      `legitimate non-gate move was rejected: stderr=${JSON.stringify(res.stderr)}`);
    assert.equal(fs.existsSync(path.join(root, 'plans', 'in-progress', 'real.md')), true,
      'legitimate plan should have moved into in-progress/');
  });
});

// ===========================================================================
// 6. PARSER ROBUSTNESS — malformed / huge / special-char input (no silent failure)
// ===========================================================================

describe('parser robustness — malformed input must fail safe, never throw or hang', () => {
  test('state.parseMetadata: missing closing ---, garbage, binary, empty', () => {
    assert.deepEqual(state.parseMetadata('---\nfoo: bar\nbody with no closing fence'), {},
      'missing closing fence must yield {} (no metadata), not throw');
    assert.deepEqual(state.parseMetadata(' ÿ just garbage, no frontmatter'), {},
      'garbage/binary-ish input must yield {}');
    assert.deepEqual(state.parseMetadata(''), {}, 'empty input must yield {}');
    assert.deepEqual(state.parseMetadata('---\n---\n'), {}, 'empty frontmatter block must yield {}');
  });

  test('inbox parser: a malformed inbox file does not break listing', () => {
    const root = makeTmpRoot('ctoc-inbox-malformed-');
    const dir = path.join(root, '.ctoc', 'inbox', 'questions');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'good.md'), '---\nstatus: open\nid: g\n---\nok\n');
    fs.writeFileSync(path.join(dir, 'broken.md'), '---\nstatus: open\nno closing fence here\n');
    fs.writeFileSync(path.join(dir, 'binary.md'), ' ÿstatus: open\n');

    let items;
    assert.doesNotThrow(() => { items = inbox.listQuestions(root); },
      'a malformed inbox file must not throw the whole listing');
    // The well-formed open question must still surface.
    assert.ok(items.some(i => i.id === 'g'), 'the valid question must still be listed');
  });

  test('regulatory parseYAMLShallow: malformed profile yields a safe value, no throw', () => {
    const root = makeTmpRoot('ctoc-reg-malformed-');
    const dir = path.join(root, '.ctoc', 'regulatory-regimes');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'bad.yaml'),
      ': : :\n\t\tweird indentation\n- orphan list item\n binary\n');

    let profile;
    assert.doesNotThrow(() => { profile = regulatory.loadProfile(root, 'bad'); },
      'malformed YAML must not throw');
    assert.equal(typeof profile, 'object', 'parser must return an object for malformed YAML');
    assert.notEqual(profile, null, 'parser must not return null for a present-but-malformed file');
  });

  test('state.parseMetadata: 5000+ keys and a 200k-char line do not crash or hang', () => {
    let big = '---\n';
    for (let i = 0; i < 5000; i++) big += `k${i}: v${i}\n`;
    big += `${'x'.repeat(200000)}: huge\n---\nbody\n`;

    const t0 = Date.now();
    let meta;
    assert.doesNotThrow(() => { meta = state.parseMetadata(big); },
      'huge frontmatter must not throw');
    const elapsed = Date.now() - t0;
    assert.ok(Object.keys(meta).length >= 5000, 'all keys should be parsed');
    // Generous ceiling — a linear parser finishes in well under a second; this
    // catches accidental quadratic / catastrophic-backtracking regressions.
    assert.ok(elapsed < 5000, `parsing took ${elapsed}ms — possible super-linear blowup`);
  });

  test('special characters (quotes, embedded colons, urls) are parsed sanely, never executed', () => {
    const meta = state.parseMetadata(
      '---\n' +
      'title: "a: b: c"\n' +          // colons inside a quoted value
      "weird: it's: fine\n" +          // apostrophe + extra colon
      'url: http://example.com/x\n' +  // colon in a URL
      'cmd: $(rm -rf /)\n' +           // shell-ish payload must stay an inert string
      '---\nbody\n');

    assert.equal(meta.title, 'a: b: c', 'quoted value with colons keeps everything after first colon');
    assert.equal(meta.url, 'http://example.com/x', 'URL value preserved verbatim');
    // The shell payload must be an inert string — never evaluated.
    assert.equal(typeof meta.cmd, 'string', 'shell-ish payload must remain a plain string');
    assert.equal(meta.cmd, '$(rm -rf /)', 'shell-ish payload must be stored literally, not executed');
  });
});
