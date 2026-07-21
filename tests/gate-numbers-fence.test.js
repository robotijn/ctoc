'use strict';

/**
 * THE GATE-NUMBER FENCE — its ratchet.
 *
 * The rule: never put a gate number in text a person reads. It was stated to the
 * assistant three times and applied to its prose all three times; twenty-seven
 * shipped string literals went on saying the number, and twelve tests were actively
 * holding the old wording in place. A prose rule silently stops being true. A test
 * that fails does not.
 *
 * These cases fall into three groups, and the middle group is the load-bearing one:
 *
 *   1. WHAT IT CATCHES (cases 1-3, 10) — including the composed `Gate ${n}` shape,
 *      whose SOURCE TEXT CONTAINS NO DIGIT and which no text search can find. That
 *      is the shape that actually reached the owner's screen.
 *   2. WHAT IT MUST NOT CATCH (cases 4-9) — comments, JSDoc, identifiers, import
 *      paths, property keys, out-of-range numbers, and a log line that stores a gate
 *      number without ever rendering it. A fence with no false-positive tests gets
 *      tuned by deletion the first time it blocks somebody unfairly.
 *   3. WHAT IT SAYS WHEN IT CANNOT SEE (cases 11-13, 18) — unreadable and
 *      unparseable input yields `available: false`, NEVER an empty findings list.
 *      An empty findings list is the SUCCESS value here, so returning one for input
 *      that was never read would be the false-green defect, committed by the fence
 *      built to prevent its cousin.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  SCREEN_MODULES,
  scanFile,
  scanRegistry,
  findUnregisteredScreens,
} = require('../src/lib/human-facing-scan');

const REPO_ROOT = path.join(__dirname, '..');

/** A scratch directory per describe-block, removed afterwards. */
function makeTmp(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ctoc-gate-fence-${label}-`));
}

/** Write `source` into `dir` as `name` and return its absolute path. */
function fixture(dir, name, source) {
  const abs = path.join(dir, name);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, source, 'utf8');
  return abs;
}

/** scanFile, asserting availability first so a failure names the real reason. */
function findingsOf(abs) {
  const res = scanFile(abs);
  assert.equal(res.available, true,
    `expected the scan to be available, got reason: ${res.reason}`);
  return res.findings;
}

// ─────────────────────────────────────────────────────────────────────
//  1. What the fence catches
// ─────────────────────────────────────────────────────────────────────

describe('the fence catches a gate number on its way to a human', () => {
  let dir;
  before(() => { dir = makeTmp('catch'); });
  after(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('case 1 — a written-out gate number in a string literal is found', () => {
    const abs = fixture(dir, 'written.js', [
      'const label = 1;',
      "const s = 'Approve across Gate 3?';",
      'module.exports = { s, label };',
    ].join('\n'));

    const findings = findingsOf(abs);
    assert.equal(findings.length, 1, `expected exactly 1 finding, got ${JSON.stringify(findings)}`);
    assert.equal(findings[0].pattern, 'written');
    assert.equal(findings[0].line, 2, 'the finding names the line the string is on');
    assert.match(findings[0].text, /Gate 3/);
  });

  it('case 2 — the COMPOSED form is found, and its source text has no digit at all', () => {
    // THE REGRESSION TEST FOR THE DEFECT THAT ACTUALLY SHIPPED.
    // `gateName: `Gate ${meta.gate}`` put "Gate 3" on the owner's screen. Grepping
    // the repository for "Gate 3" never finds this line — there is no 3 in it.
    const source = [
      'function render(n) {',
      '  return `Gate ${n} ready`;',
      '}',
      'module.exports = { render };',
    ].join('\n');
    assert.doesNotMatch(source, /Gate\s+[0-3]/,
      'the fixture must contain no literal gate digit, or this case proves nothing a grep could not');

    const findings = findingsOf(fixture(dir, 'composed.js', source));
    assert.equal(findings.length, 1, `expected exactly 1 finding, got ${JSON.stringify(findings)}`);
    assert.equal(findings[0].pattern, 'composed');
    assert.equal(findings[0].line, 2);
  });

  it('case 3 — string concatenation onto a gate word is found', () => {
    const findings = findingsOf(fixture(dir, 'concat.js', [
      'function render(n) {',
      "  return 'Gate ' + n + ' ready';",
      '}',
      'module.exports = { render };',
    ].join('\n')));

    assert.equal(findings.length, 1, `expected exactly 1 finding, got ${JSON.stringify(findings)}`);
    assert.equal(findings[0].pattern, 'composed');
    assert.equal(findings[0].line, 2);
  });

  it('case 10 — lower case and the plural are both caught', () => {
    const findings = findingsOf(fixture(dir, 'case-and-plural.js', [
      "const a = 'crossing gate 3 now';",
      "const b = 'Gates 1 and beyond';",
      'module.exports = { a, b };',
    ].join('\n')));

    assert.equal(findings.length, 2, `expected 2 findings, got ${JSON.stringify(findings)}`);
    assert.deepEqual(findings.map((f) => f.line), [1, 2]);
    assert.ok(findings.every((f) => f.pattern === 'written'));
  });

  it('a finding carries file, line, column, text and pattern — actionable without opening the scanner', () => {
    const abs = fixture(dir, 'shape.js', "const s = 'Gate 2 next';\nmodule.exports = { s };\n");
    const [f] = findingsOf(abs);
    assert.equal(typeof f.file, 'string');
    assert.equal(typeof f.line, 'number');
    assert.equal(typeof f.column, 'number');
    assert.equal(typeof f.text, 'string');
    assert.ok(f.pattern === 'written' || f.pattern === 'composed');
  });

  it('the matched text is stripped of control characters before it is reported', () => {
    // A finding is printed to a terminal. An escape sequence smuggled through a
    // source string must not reach it.
    const abs = fixture(dir, 'ctl.js', "const s = 'Gate 3 \\u001b[31mred\\u001b[0m';\nmodule.exports = { s };\n");
    const [f] = findingsOf(abs);
    assert.doesNotMatch(f.text, /[\u0000-\u001f\u007f]/,
      'the reported text still carries a control character');
  });
});

// ─────────────────────────────────────────────────────────────────────
//  2. What the fence must NOT catch — a fence that cries wolf gets deleted
// ─────────────────────────────────────────────────────────────────────

describe('the fence stays quiet on everything the rule permits', () => {
  let dir;
  before(() => { dir = makeTmp('quiet'); });
  after(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('case 4 — a line comment and a block comment are not findings', () => {
    const findings = findingsOf(fixture(dir, 'comments.js', [
      '// the plan crosses Gate 3 here',
      '/* Gate 2 is implementation → todo */',
      'const x = 1;',
      'module.exports = { x };',
    ].join('\n')));
    assert.deepEqual(findings, [], `a comment must never be a finding, got ${JSON.stringify(findings)}`);
  });

  it('case 5 — a JSDoc block is not a finding', () => {
    const findings = findingsOf(fixture(dir, 'jsdoc.js', [
      '/**',
      ' * Validate the plan before Gate 3.',
      ' * @param {string} p - crosses Gates 1 and 2 first',
      ' */',
      'function validate(p) { return p; }',
      'module.exports = { validate };',
    ].join('\n')));
    assert.deepEqual(findings, [], `JSDoc must never be a finding, got ${JSON.stringify(findings)}`);
  });

  it('case 6 — an identifier is not a finding', () => {
    // A previous fence attempt flagged `state.gate1_approval` — a FIELD NAME, not
    // something a person reads. An identifier is an Identifier node; the walk never
    // inspects one.
    const findings = findingsOf(fixture(dir, 'identifiers.js', [
      'const gate3 = 1;',
      'const GATE_2_META = {};',
      'function validateGate2(state) { return state.gate1_approval; }',
      'module.exports = { gate3, GATE_2_META, validateGate2 };',
    ].join('\n')));
    assert.deepEqual(findings, [], `an identifier must never be a finding, got ${JSON.stringify(findings)}`);
  });

  it('case 7 — an import path is not a finding', () => {
    const findings = findingsOf(fixture(dir, 'imports.js', [
      "const h = require('./gate-3-helper');",
      "const g = require('../lib/gate 2 loader');",
      'module.exports = { h, g };',
    ].join('\n')));
    assert.deepEqual(findings, [], `a module specifier must never be a finding, got ${JSON.stringify(findings)}`);
  });

  it('case 8 — a property KEY is not a finding, but its VALUE is', () => {
    const findings = findingsOf(fixture(dir, 'keys.js', [
      'const x = 1;',
      'const o = {',
      "  'gate 3': x,",
      "  label: 'Gate 3',",
      '};',
      'module.exports = { o };',
    ].join('\n')));
    assert.equal(findings.length, 1,
      `exactly the value must fire, got ${JSON.stringify(findings)}`);
    assert.equal(findings[0].line, 4, 'the finding is on the VALUE line, not the key line');
  });

  it('case 9 — a number outside the gate range does not fire', () => {
    const findings = findingsOf(fixture(dir, 'range.js', [
      "const a = 'Gate 8080 of the server';",
      "const b = 'Gate 4 does not exist';",
      "const c = 'Gate 42';",
      'module.exports = { a, b, c };',
    ].join('\n')));
    assert.deepEqual(findings, [],
      `only gates 0-3 exist; a wider bound fires on ports and versions, got ${JSON.stringify(findings)}`);
  });

  it('a log line that STORES a gate number without rendering it is not a finding', () => {
    // src/lib/actions.js writes a gate number into a deploy-ready log that no
    // renderer prints. That is a FILE FORMAT, on the right side of the rule, and it
    // must stay legal. The number here lives in a variable, not in adjacent text.
    const findings = findingsOf(fixture(dir, 'log.js', [
      'function record(log, gate) {',
      '  log.push({ status: "deploy-ready", gate });',
      '  return log;',
      '}',
      'module.exports = { record };',
    ].join('\n')));
    assert.deepEqual(findings, [],
      `storing a gate number is legal; only rendering one is not. Got ${JSON.stringify(findings)}`);
  });

  it('the English plural "gates" in a count phrase is NOT a finding', () => {
    // The real screen line `` `${n} plans at gates${flag ? ' · view' : ''}` `` ends a
    // template chunk with the WORD "gates" flush against an interpolation — no
    // trailing space, no number. The composed shape it must not be confused with is
    // `` `Gate ${n}` ``, which always has "Gate " + a space before the number. This
    // is the false positive the fence measured on the real repository at first cut.
    const findings = findingsOf(fixture(dir, 'count-phrase.js', [
      'function line(n, flag) {',
      "  return `${n} plans at gates${flag ? ' more' : ''}`;",
      '}',
      "const also = 'two plans at gates';",
      'module.exports = { line, also };',
    ].join('\n')));
    assert.deepEqual(findings, [],
      `the plural noun "gates" in prose must not fire, got ${JSON.stringify(findings)}`);
  });

  it('a file with no gate vocabulary at all is clean and AVAILABLE', () => {
    const res = scanFile(fixture(dir, 'plain.js', 'const a = 1;\nmodule.exports = { a };\n'));
    assert.equal(res.available, true);
    assert.deepEqual(res.findings, []);
  });
});

// ─────────────────────────────────────────────────────────────────────
//  3. What the fence says when it could not look
// ─────────────────────────────────────────────────────────────────────

describe('the fence distinguishes "clean" from "I could not read it"', () => {
  let dir;
  before(() => { dir = makeTmp('unavailable'); });
  after(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('case 11 — an unparseable file is UNAVAILABLE, not clean', () => {
    const res = scanFile(fixture(dir, 'broken.js', 'function ( { ][ \n'));
    assert.equal(res.available, false,
      'a file that could not be parsed must never report an empty, passing findings list');
    assert.equal(typeof res.reason, 'string');
    assert.ok(res.reason.length > 0);
    assert.equal(res.findings, undefined,
      'an unavailable result carries NO findings key — an empty list is the success value');
  });

  it('case 12 — a missing file is UNAVAILABLE, and the reason names the path', () => {
    const missing = path.join(dir, 'no-such-file.js');
    const res = scanFile(missing);
    assert.equal(res.available, false);
    assert.match(res.reason, /no-such-file\.js/,
      'the reason must name the file, or the failure is not actionable');
  });

  it('scanFile never throws, whatever it is handed', () => {
    for (const bad of [undefined, null, 42, '', dir]) {
      let res;
      assert.doesNotThrow(() => { res = scanFile(bad); }, `scanFile threw on ${String(bad)}`);
      assert.equal(res.available, false, `scanFile(${String(bad)}) must be unavailable, not clean`);
    }
  });

  it('scanRegistry and findUnregisteredScreens reject a non-string root, never throwing', () => {
    for (const bad of [undefined, null, 42, '']) {
      const r1 = scanRegistry(bad);
      assert.equal(r1.available, false, `scanRegistry(${String(bad)}) must be unavailable`);
      assert.deepEqual(r1.findings, []);
      const r2 = findUnregisteredScreens(bad);
      assert.equal(r2.available, false, `findUnregisteredScreens(${String(bad)}) must be unavailable`);
      assert.deepEqual(r2.modules, []);
    }
  });

  it('findUnregisteredScreens on a tree with no src/ is CLEAN, not unavailable', () => {
    // A user project that is not a CTOC source tree has no screens to check — that is
    // clean (nothing to look at), the mirror of the not-a-CTOC-tree gate. It must NOT
    // report unavailable, which would fail a foreign project's build.
    const root = makeTmp('no-src');
    try {
      const res = findUnregisteredScreens(root);
      assert.equal(res.available, true, `reason: ${res.reason}`);
      assert.deepEqual(res.modules, []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('when the parser is unavailable, BOTH entry points report available:false — never clean', () => {
    // The load-bearing honesty property applied to the registry entry points: with the
    // parser gone, "I could not look" must never read as "I looked and it was clean".
    const Module = require('node:module');
    const originalLoad = Module._load;
    Module._load = function patched(request, ...rest) {
      if (request === 'typescript') throw new Error('forced: parser unavailable');
      return originalLoad.call(this, request, ...rest);
    };
    try {
      const reg = scanRegistry(REPO_ROOT);
      assert.equal(reg.available, false, 'scanRegistry must be unavailable with no parser');
      assert.match(reg.reason, /parser|not installed|cannot run/i);
      const unreg = findUnregisteredScreens(REPO_ROOT);
      assert.equal(unreg.available, false, 'findUnregisteredScreens must be unavailable with no parser');
      assert.match(unreg.reason, /parser|not installed|cannot run/i);
    } finally {
      Module._load = originalLoad;
    }
  });

  it('case 13 — one unavailable file poisons the WHOLE registry result', () => {
    // A registry scan that skipped an unreadable entry and returned the remaining
    // findings would report a verdict on input it never received.
    const root = makeTmp('partial-root');
    try {
      // Materialise exactly one registry entry; every other entry is missing.
      const first = SCREEN_MODULES[0];
      fixture(root, first, 'const a = 1;\nmodule.exports = { a };\n');

      const res = scanRegistry(root);
      assert.equal(res.available, false,
        'a registry with an unreadable entry must not report available');
      assert.equal(typeof res.reason, 'string');
      assert.ok(res.reason.length > 0, 'the reason must name what could not be read');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
//  4. The ratchet over the shipped product
// ─────────────────────────────────────────────────────────────────────

describe('the ratchet over this repository', () => {
  it('case 14 — the real registry carries no gate number a human reads', () => {
    const res = scanRegistry(REPO_ROOT);
    assert.equal(res.available, true,
      `the scan must be able to run in this repository; reason: ${res.reason}`);
    assert.ok(res.scanned.length > 0, 'the registry must not be empty');

    const shown = res.findings
      .map((f) => `${f.file}:${f.line}:${f.column} [${f.pattern}] ${f.text}`)
      .join('\n  ');
    assert.deepEqual(res.findings, [],
      `a gate number reaches a human from:\n  ${shown}\n` +
      'Say what the MOMENT is (src/lib/gate-words.js), not what number it is.');
  });

  it('case 15 — every module that produces a screen is in the registry', () => {
    const res = findUnregisteredScreens(REPO_ROOT);
    assert.equal(res.available, true, `reason: ${res.reason}`);
    assert.deepEqual(res.modules, [],
      `these modules produce a screen (the { text, ask, actions } contract OR a ` +
      `render-export area) but are not in SCREEN_MODULES, so the fence does not look ` +
      `at them:\n  ${res.modules.join('\n  ')}\n` +
      'Add each to SCREEN_MODULES in src/lib/human-facing-scan.js.');
  });

  it('the registry covers the TUI-area family, not just the menu-router screens', () => {
    // The first registry was hand-seeded from the files people remembered and omitted
    // the whole src/areas/* family — which is precisely how a live gate number reached
    // the owner's inbox. These entries are the regression guard for that blind spot.
    for (const rel of ['src/areas/inbox.js', 'src/tabs/review.js', 'src/commands/start.js']) {
      assert.ok(SCREEN_MODULES.includes(rel), `${rel} must be in the registry`);
    }
  });

  it('case 16 — the registry names only files that exist', () => {
    // A renamed file must fail HERE, loudly, rather than being silently dropped from
    // the scan and quietly shrinking the fence's reach to nothing.
    for (const rel of SCREEN_MODULES) {
      assert.ok(fs.existsSync(path.join(REPO_ROOT, rel)),
        `SCREEN_MODULES names ${rel}, which does not exist — the registry has rotted`);
    }
  });

  it('the registry is frozen and stored with POSIX separators', () => {
    assert.ok(Object.isFrozen(SCREEN_MODULES));
    for (const rel of SCREEN_MODULES) {
      assert.doesNotMatch(rel, /\\/, `${rel} must be stored POSIX-relative and joined with path.join`);
      assert.ok(!path.isAbsolute(rel), `${rel} must be repository-relative`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
//  4b. The registry sees BOTH screen styles — the blind spot that shipped
// ─────────────────────────────────────────────────────────────────────

describe('the registry detects the TUI-area render-export style, not only the object contract', () => {
  let dir;
  before(() => { dir = makeTmp('two-styles'); });
  after(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('a gate number inside a render(app) area module is found — style is irrelevant to scanFile', () => {
    // The inbox leak lived in `out += `Gate ${p.gate}`` inside `render(app)`, a style
    // the object-contract query never saw. scanFile parses, so the render STYLE does
    // not matter — the number is caught wherever it is composed.
    const findings = findingsOf(fixture(dir, 'area.js', [
      'function render(app) {',
      '  let out = "";',
      '  out += `Gate ${app.gate} ${app.plan}`;',
      '  return out;',
      '}',
      'module.exports = { render, handleKey: () => false };',
    ].join('\n')));
    assert.equal(findings.length, 1, `expected 1 finding, got ${JSON.stringify(findings)}`);
    assert.equal(findings[0].pattern, 'composed');
    assert.equal(findings[0].line, 3);
  });

  it('an unregistered render-export area module is flagged by findUnregisteredScreens', () => {
    // The bug: the hand-seeded registry omitted the render-export family, so the
    // rot-defence could not SEE the inbox. This drives the fix — a module that
    // exports `render` and is not in SCREEN_MODULES must be named.
    const root = makeTmp('area-root');
    try {
      // Register every real entry so only the planted one is unregistered.
      for (const rel of SCREEN_MODULES) {
        fixture(root, rel, 'const a = 1;\nmodule.exports = { a };\n');
      }
      fixture(root, 'src/areas/brand-new.js', [
        'function render(app) { return `hello ${app.x}`; }',
        'module.exports = { render, handleKey: () => false };',
      ].join('\n'));

      const res = findUnregisteredScreens(root);
      assert.equal(res.available, true, `reason: ${res.reason}`);
      assert.ok(res.modules.includes('src/areas/brand-new.js'),
        `the unregistered render-export module was not flagged; got ${JSON.stringify(res.modules)}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('exports.render assignment is also detected as a screen', () => {
    const root = makeTmp('exports-render');
    try {
      for (const rel of SCREEN_MODULES) {
        fixture(root, rel, 'const a = 1;\nmodule.exports = { a };\n');
      }
      fixture(root, 'src/areas/late.js', [
        'function render(app) { return String(app.x); }',
        'exports.render = render;',
      ].join('\n'));
      const res = findUnregisteredScreens(root);
      assert.ok(res.modules.includes('src/areas/late.js'),
        `exports.render form not detected; got ${JSON.stringify(res.modules)}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('a plain helper that exports no render and no screen contract is NOT a screen', () => {
    const root = makeTmp('helper-root');
    try {
      for (const rel of SCREEN_MODULES) {
        fixture(root, rel, 'const a = 1;\nmodule.exports = { a };\n');
      }
      fixture(root, 'src/lib/helper.js', [
        'function add(a, b) { return a + b; }',
        'module.exports = { add };',
      ].join('\n'));
      const res = findUnregisteredScreens(root);
      assert.ok(!res.modules.includes('src/lib/helper.js'),
        `a non-screen helper must not be flagged; got ${JSON.stringify(res.modules)}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
//  5. The live call site — a fence nobody runs is not a fence
// ─────────────────────────────────────────────────────────────────────

describe('the enforcer surfaces the fence on demand', () => {
  const { checkAllInvariants } = require('../src/lib/iron-loop-enforcer');

  /** The gate-words-fence finding from a thorough architecture run, or null. */
  function runFence(root) {
    const { findings } = checkAllInvariants({ root, mode: 'thorough', scopes: ['architecture'] });
    return findings.find((f) => f.id === 'gate-words-fence') || null;
  }

  it('the check is registered in the architecture scope, thorough mode', () => {
    // Registration is proved by driving it, not by reading the CHECKS array: an
    // entry that is never reached is not a call site.
    const root = makeTmp('registered');
    try {
      for (const rel of SCREEN_MODULES) {
        fixture(root, rel, 'const a = 1;\nmodule.exports = { a };\n');
      }
      fixture(root, SCREEN_MODULES[0], "const s = 'Gate 3 here';\nmodule.exports = { s };\n");
      assert.notEqual(runFence(root), null,
        'gate-words-fence produced no verdict in a thorough architecture run');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('case 17 — the check FAILS on a planted gate number, naming the file and line', () => {
    const root = makeTmp('planted');
    try {
      for (const rel of SCREEN_MODULES) {
        fixture(root, rel, 'const a = 1;\nmodule.exports = { a };\n');
      }
      const target = SCREEN_MODULES[0];
      fixture(root, target, [
        'const a = 1;',
        "const label = 'Approve across Gate 3?';",
        'module.exports = { a, label };',
      ].join('\n'));

      const f = runFence(root);
      assert.notEqual(f, null, 'the check produced no finding at all');
      assert.equal(f.severity, 'block');
      assert.match(f.message, /Gate 3/, 'the message must quote the offending text');
      assert.ok(f.message.includes(target), `the message must name ${target}`);
      assert.match(f.message, /:2\b/, 'the message must name the line');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('case 18 — an UNAVAILABLE scan is a FAILURE, never a pass and never a skip', () => {
    // The case that keeps this fence honest about itself. A check that could not run
    // has no verdict to give, and reporting one would be the exact defect class this
    // repository has fixed repeatedly. Drive it against the REAL repository (a
    // genuine CTOC tree, so the "not a CTOC tree → clean" branch does NOT apply) and
    // force the parser to be unavailable through the module-load seam, exactly the
    // condition a user project without the development dependency hits.
    const Module = require('node:module');
    const originalLoad = Module._load;
    Module._load = function patched(request, ...rest) {
      if (request === 'typescript') throw new Error('forced: the TypeScript parser is unavailable');
      return originalLoad.call(this, request, ...rest);
    };
    let f;
    try {
      f = runFence(REPO_ROOT);
    } finally {
      Module._load = originalLoad;
    }
    assert.notEqual(f, null, 'an unavailable scan produced no finding — it was silently treated as a pass');
    assert.equal(f.severity, 'block');
    assert.doesNotMatch(f.message, /\bpassed\b|\bskipped\b/i,
      'a check that could not run must not describe itself as passed or skipped');
    assert.match(f.message, /could not|unavailable|cannot/i,
      'the message must say that the scan could not run');
  });

  it('the check does not fire on a root that is not a CTOC source tree', () => {
    // A user project with no src/lib at all must not be told its screens are broken.
    const root = makeTmp('foreign');
    try {
      fixture(root, 'index.js', 'console.log(1);\n');
      const f = runFence(root);
      assert.equal(f, null, 'a non-CTOC tree must produce no gate-words-fence finding');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
