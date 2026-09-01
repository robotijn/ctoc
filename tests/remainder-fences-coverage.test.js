'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  THE FENCES' OWN DARK ARMS — plan 00249 (slice 15 of "close the coverage holes")
//
//  These eight modules are the checks that judge the rest of the codebase. Their
//  own unexercised arms are the ones most likely to make a fence report a verdict
//  it never earned, so every case below asserts the DIRECTION a fault must point:
//  a fence that could not look reports "could not look" — never a passing empty
//  result — and a fence that could look does not invent a finding.
//
//  Every range measured uncovered on 2026-08-31 (`npm test`, node line coverage
//  scoped to src/**) is listed here with its class:
//    (a) reachable behaviour  → a named case below, which a mutation of that line
//                               makes fail;
//    (b) permission-gated / terminal-only → left, with the reason;
//    (c) dead                 → reported in the plan, never deleted.
//
//  ── src/lib/agent-honesty-scan.js ──────────────────────────────────────────
//   75-76   (a) scanAgentFile — readFileSync throws → `unreadable: <file>`
//   78-79   (a) scanAgentFile — an empty definition → `empty: <file>`
//   169-170 (a) fragmentIsSubstantive — the fragment is unreadable
//
//  ── src/lib/declared-breadth.js ────────────────────────────────────────────
//   144-145 (a) hasUnanchoredAcknowledgement — the stale-detector frontmatter
//               reader throws; the parseFrontmatter fallback still finds the key
//   161-162 (a) hasUnanchoredAcknowledgement — the fallback reader throws too;
//               the refusing direction (false) is returned, never a throw that
//               would reach the hook's fail-OPEN catch and become an ALLOW
//
//  ── src/lib/plan-index/wiring.js ───────────────────────────────────────────
//   92-93   (a) resolveRoot — the project-root finder throws → process.cwd()
//
//  ── src/lib/reachability.js ────────────────────────────────────────────────
//   155     (a) relLabel — a file outside (or with no) project root is labelled
//               by its last two segments, never by its absolute path
//
//  ── src/lib/human-facing-scan.js ───────────────────────────────────────────
//   284-285 (a) scanFile — the TypeScript parser throws → available:false
//   507-508 (a) findUnregisteredScreens — same, and modules stays empty
//
//  ── src/lib/recipe-harness.js ──────────────────────────────────────────────
//   68      (a) stripRootPrefix — a script path carrying no root placeholder is
//               returned unchanged
//   150-151 (a) extractRecipes — a non-string / empty target is a LOUD throw
//   264-268 (a) runRecipe — an unsubstituted placeholder REFUSES to run
//
//  ── src/lib/false-green-scan.js ────────────────────────────────────────────
//   345-347 (a) segment — an unbalanced file closes its still-open scopes rather
//               than dropping them (dropping them loses every finding inside)
//   428     (a) spanEnd — a bracket span that never closes ends at the last line
//   564     (a) catchBodyBrace — a `catch` with no body before end-of-file yields
//               null, so no silent-catch finding is fabricated for it
//
//  ── src/lib/unexecutable-instruction-scan.js ───────────────────────────────
//   190     (a) sectionHeading — no preceding heading → '' → the capability-
//               manifest signature does not fire on a headingless bullet
//   242-243 (a) collectMarkdown — an unreadable agents subdirectory is skipped
//   271-272 (a) scanAgentOrders — an agent file that cannot be read is skipped,
//               and the enumerated count still reports it
//   439-440 (a) containsWord — advance past an occurrence inside a longer
//               identifier and find the real whole-word read
//   504-505 (a) keyIsRead — an unreadable src file cannot satisfy a key
//   521-522 (a) collectJs — an unreadable src subdirectory contributes no reader
//
//  NOTHING in this slice is class (b) or class (c): every range above is reached
//  through the module's own public surface, with faults injected only at the true
//  boundary (safe-fs, the TypeScript module, the lazily-required frontmatter
//  readers). No filesystem permission bit is used, so no case here is skipped on
//  Windows or as root — there are no skips in this file at all.
//
//  Baselines: this file adds NOTHING to any baseline's debt or exemption list.
//  Every fixture tree lives under os.tmpdir() and is removed in `after`.
// ─────────────────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const safeFs = require('../src/lib/safe-fs');

const agentHonesty = require('../src/lib/agent-honesty-scan');
const declaredBreadth = require('../src/lib/declared-breadth');
const reachability = require('../src/lib/reachability');
const humanFacing = require('../src/lib/human-facing-scan');
const recipeHarness = require('../src/lib/recipe-harness');
const { scanFalseGreen } = require('../src/lib/false-green-scan');
const unexecutable = require('../src/lib/unexecutable-instruction-scan');

const SENTINEL = 'CTOC-FAULT-SENTINEL';

/** Every temp tree this file creates, removed in `after`. */
const trees = [];

function makeTree(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ctoc-fences-${label}-`));
  const real = fs.realpathSync.native(dir);
  trees.push(real);
  return real;
}

function write(root, rel, content) {
  const abs = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  return abs;
}

/**
 * Fault the named safe-fs reader for paths containing `SENTINEL` only. The guard
 * matters: an unguarded mock breaks every other read in the process.
 */
function faultSafeFs(t, method) {
  const real = safeFs[method];
  t.mock.method(safeFs, method, (p, ...rest) => {
    if (String(p).includes(SENTINEL)) {
      const err = new Error(`injected ${method} fault`);
      err.code = 'EIO';
      throw err;
    }
    return real(p, ...rest);
  });
}

test.after(() => {
  for (const dir of trees) fs.rmSync(dir, { recursive: true, force: true });
});

// ── src/lib/agent-honesty-scan.js ────────────────────────────────────────────

test('an unreadable agent definition reports "unreadable", and poisons the whole census — never an empty missing list', (t) => {
  const root = makeTree('honesty-unreadable');
  const bad = write(root, `agents/tier/${SENTINEL}.md`, '---\nname: alpha\n---\n\nhonest-status.md\n');
  write(root, 'agents/tier/good.md', '---\nname: beta\n---\n\nhonest-status.md\n');
  faultSafeFs(t, 'readFileSync');

  const one = agentHonesty.scanAgentFile(bad);
  assert.equal(one.available, false, 'a file it could not read is never available');
  assert.match(one.reason, /^unreadable: CTOC-FAULT-SENTINEL\.md \(/);

  const census = agentHonesty.censusAgents(root, { minDispatchable: 1 });
  assert.equal(census.available, false, 'one unreadable file poisons the census');
  assert.match(census.reason, /^unreadable: .* — census cannot be trusted$/);
  assert.equal('missing' in census, false, 'an untrustworthy census reports no missing list at all');
});

test('an empty agent definition reports "empty" rather than a compliant read', () => {
  const root = makeTree('honesty-empty');
  const empty = write(root, 'agents/tier/blank.md', '   \n\n');
  write(root, 'agents/tier/good.md', '---\nname: beta\n---\n\nhonest-status.md\n');

  const one = agentHonesty.scanAgentFile(empty);
  assert.equal(one.available, false);
  assert.equal(one.reason, 'empty: blank.md');
  assert.equal('hasFragmentRef' in one, false, 'no compliance verdict is offered for a file with no content');

  const census = agentHonesty.censusAgents(root, { minDispatchable: 1 });
  assert.equal(census.available, false);
  assert.match(census.reason, /^empty: blank\.md — census cannot be trusted$/);
});

test('an unreadable honest-status fragment reports unreadable, never ok:false or ok:true', (t) => {
  const root = makeTree(`honesty-fragment-${SENTINEL}`);
  write(root, 'skills/agent-fragments/honest-status.md', '# HONEST STATUS\n');
  faultSafeFs(t, 'readFileSync');

  const res = agentHonesty.fragmentIsSubstantive(root);
  assert.equal(res.available, false);
  assert.match(res.reason, /^the honest-status fragment is unreadable \(/);
  assert.equal('ok' in res, false, 'a fragment it could not read gets no ok verdict at all');
});

// ── src/lib/declared-breadth.js ──────────────────────────────────────────────

test('a throwing frontmatter-region reader does not lose an unanchored-scope acknowledgement', (t) => {
  const staleDetector = require('../src/lib/stale-detector');
  const content = '---\ntitle: "x"\nunanchored_scope: "acknowledged by the human"\nfiles:\n  - "**"\n---\n\nbody\n';

  assert.equal(declaredBreadth.hasUnanchoredAcknowledgement(content), true, 'guard: the key is readable normally');

  t.mock.method(staleDetector, 'extractFrontmatterRegion', () => {
    throw new Error('injected frontmatter-region fault');
  });
  assert.equal(
    declaredBreadth.hasUnanchoredAcknowledgement(content),
    true,
    'the parseFrontmatter fallback still finds the acknowledgement'
  );
});

test('when both frontmatter readers fail, the acknowledgement reads FALSE — the refusing direction', (t) => {
  const staleDetector = require('../src/lib/stale-detector');
  const frontmatter = require('../src/lib/frontmatter');
  const content = '---\nunanchored_scope: "acknowledged by the human"\n---\n\nbody\n';

  t.mock.method(staleDetector, 'extractFrontmatterRegion', () => '');
  t.mock.method(frontmatter, 'parseFrontmatter', () => {
    throw new Error('injected frontmatter fault');
  });

  assert.equal(
    declaredBreadth.hasUnanchoredAcknowledgement(content),
    false,
    'a fault must not throw out of here: the hook catches and would turn it into an ALLOW'
  );
});

// ── src/lib/plan-index/wiring.js ─────────────────────────────────────────────

test('a throwing project-root finder falls back to the working directory, never an empty root', (t) => {
  const wiringPath = require.resolve('../src/lib/plan-index/wiring');
  const projectRoot = require('../src/lib/project-root');
  const elsewhere = makeTree('wiring-root');
  assert.notEqual(elsewhere, process.cwd(), 'the fixture root must differ from cwd for this to discriminate');

  const found = t.mock.method(projectRoot, 'findProjectRoot', () => elsewhere);
  try {
    // wiring.js destructures findProjectRoot at load, so it must be re-required
    // with the mock already installed.
    delete require.cache[wiringPath];
    const { getWiring } = require(wiringPath);

    const ok = getWiring({ openStore: () => null });
    assert.equal(ok.projectPath, elsewhere, 'guard: the finder normally decides the root');

    found.mock.mockImplementation(() => {
      throw new Error('injected project-root fault');
    });
    const degraded = getWiring({ openStore: () => null });
    assert.equal(degraded.projectPath, process.cwd());
    assert.equal(degraded.isIndexAvailable(), false);
    assert.equal(typeof degraded.degradedReason(), 'string');
  } finally {
    delete require.cache[wiringPath];
  }
});

// ── src/lib/reachability.js ──────────────────────────────────────────────────

test('an unreadable source file outside any project root is named by its last two segments, never its absolute path', () => {
  const root = makeTree('reach-label');
  const missing = path.join(root, 'deep', 'nested', 'missing.js');

  assert.throws(
    () => reachability.edgesFrom(missing, []),
    (err) => {
      assert.match(err.message, /^reachability: cannot read source file nested\/missing\.js \(/);
      assert.equal(err.message.includes(root), false, 'an absolute path would leak a home directory into a build log');
      return true;
    }
  );

  assert.throws(
    () => reachability.edgesFrom(missing, [], root),
    /cannot read source file deep\/nested\/missing\.js \(/,
    'with a root, the label is repository-relative'
  );
});

// ── src/lib/human-facing-scan.js ─────────────────────────────────────────────

/**
 * Make the TypeScript parser throw for the duration of `body`.
 *
 * `createSourceFile` is a NON-CONFIGURABLE getter on the typescript namespace, so
 * `t.mock.method` cannot reach it. The true boundary one level out is the module
 * cache: `loadParser()` calls `require('typescript')` on every scan, so swapping
 * the cached exports for a delegating object (real namespace on the prototype
 * chain, one own throwing property) faults exactly the one call and nothing else.
 */
function withThrowingParser(body) {
  const tsPath = require.resolve('typescript');
  const cached = require.cache[tsPath];
  const real = cached.exports;
  const shim = Object.create(real);
  Object.defineProperty(shim, 'createSourceFile', {
    value: () => { throw new Error('injected parser fault'); },
  });
  cached.exports = shim;
  try {
    return body();
  } finally {
    cached.exports = real;
  }
}

test('a parser that throws makes the gate-number scan report unavailable, never an empty findings list', () => {
  const root = makeTree('human-facing-file');
  const file = write(root, 'src/screen.js', 'console.log("Gate 3");\n');

  assert.equal(humanFacing.scanFile(file).available, true, 'guard: the file parses normally');

  const res = withThrowingParser(() => humanFacing.scanFile(file));
  assert.equal(res.available, false);
  assert.match(res.reason, /^could not parse .*screen\.js: injected parser fault$/);
  assert.equal('findings' in res, false, 'no findings verdict is offered for a file that was never parsed');
});

test('a parser that throws makes the screen-registry census report unavailable with an empty module list', () => {
  const root = makeTree('human-facing-registry');
  write(root, 'src/lib/some-screen.js', 'function render() { return "x"; }\nmodule.exports = { render };\n');

  assert.equal(humanFacing.findUnregisteredScreens(root).available, true, 'guard: the tree parses normally');

  const res = withThrowingParser(() => humanFacing.findUnregisteredScreens(root));
  assert.equal(res.available, false);
  assert.match(res.reason, /^could not parse .*some-screen\.js: injected parser fault$/);
  assert.deepEqual(res.modules, [], 'the empty list is never the verdict — available:false is');
});

// ── src/lib/recipe-harness.js ────────────────────────────────────────────────

test('a script recipe with no root placeholder keeps its path verbatim', () => {
  const root = makeTree('recipe-strip');
  const md = write(root, 'start.md', [
    'Run `node "src/scripts/ledger-backfill.js" --dry-run` to preview.',
    'Or `node "${CLAUDE_PLUGIN_ROOT}/src/scripts/ledger-backfill.js" --apply` to write.',
    ''
  ].join('\n'));

  const recipes = recipeHarness.extractRecipes(md).filter((r) => r.kind === 'node-script');
  assert.equal(recipes.length, 2);
  assert.equal(recipes[0].scriptPath, 'src/scripts/ledger-backfill.js', 'no placeholder to strip — unchanged');
  assert.equal(recipes[1].scriptPath, 'src/scripts/ledger-backfill.js', 'the placeholder prefix is stripped');
  assert.equal(recipeHarness.isStateChanging(recipes[0]), true, 'the un-prefixed path still resolves to a known writer');
});

test('an empty instruction-surface path is a LOUD throw, never a silent zero-recipe result', () => {
  assert.throws(
    () => recipeHarness.extractRecipes(''),
    /recipe-harness\.extractRecipes: markdownPath must be a non-empty string/
  );
  assert.throws(
    () => recipeHarness.extractRecipes(null),
    /recipe-harness\.extractRecipes: markdownPath must be a non-empty string/
  );
});

test('an unsubstituted placeholder REFUSES to run rather than guessing a substitution', () => {
  const root = makeTree('recipe-run');
  assert.throws(
    () => recipeHarness.runRecipe(
      'require("fs").writeFileSync("marker.txt", "x"); /* {{TARGET}} */',
      { root }
    ),
    /unsubstituted placeholder "\{\{TARGET\}\}" — refusing to run rather than guess a substitution/
  );
  assert.equal(
    fs.existsSync(path.join(root, 'marker.txt')),
    false,
    'the refusal happens BEFORE the spawn — nothing ran'
  );
});

// ── src/lib/false-green-scan.js ──────────────────────────────────────────────

test('an unbalanced file keeps its still-open scope, so a finding inside it is still anchored and reported', () => {
  const source = [
    'function parseCount(text) {',
    '  const m = text.match(/x/);',
    '  if (!m) return 0;',
    ''
  ].join('\n');

  const res = scanFalseGreen('unused', { sources: [{ path: 'src/unbalanced.js', source }] });
  assert.equal(res.findings.length, 1, 'dropping the unclosed scope would lose this finding entirely');
  assert.equal(res.findings[0].signature, 'parse-default');
  assert.equal(res.findings[0].key, 'src/unbalanced.js:parse-default:parseCount');
  assert.equal(res.findings[0].line, 3);
});

test('a capture call whose parentheses never close is still read to the end of the file', () => {
  const source = [
    'function run() {',
    "  const out = execSync('cmd', {",
    "    encoding: 'utf8'",
    ''
  ].join('\n');

  const res = scanFalseGreen('unused', { sources: [{ path: 'src/unclosed-capture.js', source }] });
  assert.equal(res.findings.length, 1, 'stopping at the opening line would miss the capturing option');
  assert.equal(res.findings[0].signature, 'unbounded-capture');
  assert.equal(res.findings[0].line, 2);
});

test('a catch with no body before end-of-file fabricates no silent-catch finding', () => {
  const source = [
    'function a() {',
    '  try { x(); } catch {}',
    '}',
    'function b() {',
    '  try { y(); } catch',
    ''
  ].join('\n');

  const res = scanFalseGreen('unused', { sources: [{ path: 'src/truncated-catch.js', source }] });
  assert.equal(res.findings.length, 1, 'a catch clause with no body must not be counted as an empty one');
  assert.equal(res.findings[0].signature, 'silent-catch');
  assert.equal(res.findings[0].key, 'src/truncated-catch.js:silent-catch:a');
  assert.equal(res.findings[0].line, 2);
});

// ── src/lib/unexecutable-instruction-scan.js ─────────────────────────────────

const MANIFEST_AGENT = [
  '---',
  'name: manifested',
  'tools: Read, Write',
  '---',
  '',
  '## Tools used',
  '',
  '- `shouldRunGdpr(projectRoot)`',
  ''
].join('\n');

const HEADLESS_AGENT = [
  '---',
  'name: headless',
  'tools: Read, Write',
  '---',
  '',
  '- `shouldRunGdpr(projectRoot)`',
  ''
].join('\n');

test('a bullet with no heading above it is not a capability manifest — the same bullet under a Tools heading is', () => {
  const root = makeTree('unexec-heading');
  write(root, 'agents/tools/manifested.md', MANIFEST_AGENT);
  write(root, 'agents/tools/headless.md', HEADLESS_AGENT);

  const keys = unexecutable.scan(root).findings.map((f) => f.key);
  assert.ok(
    keys.includes('agents/tools/manifested.md::instruction-tool::shouldRunGdpr'),
    'guard: the capability-manifest signature fires under a Tools heading'
  );
  assert.equal(
    keys.includes('agents/tools/headless.md::instruction-tool::shouldRunGdpr'),
    false,
    'with no heading at all there is no manifest to read, so the signature must not fire'
  );
});

test('an unreadable agents subdirectory is skipped, and the readable definitions are still judged', (t) => {
  const root = makeTree('unexec-subdir');
  write(root, 'agents/tools/manifested.md', MANIFEST_AGENT);
  write(root, `agents/${SENTINEL}-dir/hidden.md`, MANIFEST_AGENT);
  faultSafeFs(t, 'readdirSync');

  const res = unexecutable.scan(root);
  const keys = res.findings.map((f) => f.key);
  assert.ok(keys.includes('agents/tools/manifested.md::instruction-tool::shouldRunGdpr'));
  assert.equal(keys.some((k) => k.includes(SENTINEL)), false, 'nothing is reported from a directory never read');
  assert.equal(res.scanned.agents, 1, 'only the files it actually enumerated are counted');
});

test('an agent file that cannot be read is skipped without a crash, and is still counted as enumerated', (t) => {
  const root = makeTree('unexec-file');
  write(root, 'agents/tools/manifested.md', MANIFEST_AGENT);
  write(root, `agents/tools/${SENTINEL}.md`, MANIFEST_AGENT);
  faultSafeFs(t, 'readFileSync');

  const res = unexecutable.scan(root);
  const keys = res.findings.map((f) => f.key);
  assert.ok(keys.includes('agents/tools/manifested.md::instruction-tool::shouldRunGdpr'));
  assert.equal(keys.some((k) => k.includes(SENTINEL)), false);
  assert.equal(res.scanned.agents, 2, 'the file was enumerated, so the count says so');
  assert.equal(res.scanned.withGrant, 1, 'its grant was never read, so it is not counted as granted');
});

/** A fixture whose init-project writes exactly one settings.yaml key. */
function configTree(label, readerRel, readerBody) {
  const root = makeTree(label);
  write(root, 'src/lib/init-project.js', [
    'function generateSettings() {',
    '  return [',
    "    'enforcement:',",
    "    '  mode: strict',",
    "  ].join('\\n');",
    '}',
    'module.exports = { generateSettings };',
    ''
  ].join('\n'));
  if (readerRel) write(root, readerRel, readerBody);
  return root;
}

const READER_WITH_EMBEDDED_LEAF_FIRST = [
  "const surface = 'settings.yaml';",
  'const modeless = 1;',
  'const mode = pick(modeless);',
  'module.exports = { surface, mode };',
  ''
].join('\n');

test('a config leaf hiding inside a longer identifier does not stop the scan finding the real read', () => {
  const root = configTree('unexec-word', 'src/lib/reader.js', READER_WITH_EMBEDDED_LEAF_FIRST);

  const res = unexecutable.scan(root);
  assert.equal(res.scanned.settingsKeys, 1, 'guard: the written key was found and evaluated');
  assert.equal(
    res.findings.some((f) => f.key === 'settings.yaml::config-key::enforcement.mode'),
    false,
    'the whole-word read on the line AFTER the embedded occurrence must be found'
  );
});

test('an unreadable src file cannot satisfy a config key — the key reports as unread', (t) => {
  const root = configTree('unexec-keyread', `src/lib/${SENTINEL}-reader.js`, READER_WITH_EMBEDDED_LEAF_FIRST);
  faultSafeFs(t, 'readFileSync');

  const res = unexecutable.scan(root);
  assert.equal(res.scanned.settingsKeys, 1);
  assert.ok(
    res.findings.some((f) => f.key === 'settings.yaml::config-key::enforcement.mode'),
    'a file it could not read is never evidence that the key is read'
  );
});

test('an unreadable src subdirectory contributes no reader — the key reports as unread', (t) => {
  const root = configTree('unexec-collect', `src/lib/${SENTINEL}-dir/reader.js`, READER_WITH_EMBEDDED_LEAF_FIRST);
  faultSafeFs(t, 'readdirSync');

  const res = unexecutable.scan(root);
  assert.equal(res.scanned.settingsKeys, 1);
  assert.ok(
    res.findings.some((f) => f.key === 'settings.yaml::config-key::enforcement.mode'),
    'a directory it could not list is never evidence that the key is read'
  );
});
