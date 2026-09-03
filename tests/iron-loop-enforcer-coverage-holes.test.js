/**
 * iron-loop-enforcer — the dark ranges (plan 00240)
 *
 * Third companion to tests/iron-loop-enforcer.test.js (live-repo state + the
 * gate-destination ledger logic) and tests/iron-loop-enforcer-coverage.test.js
 * (the severity forks and the two reachability fences). Neither file is touched
 * by this one, and no assertion anywhere is weakened.
 *
 * This module is CTOC's own self-check: the thing that turned a build wave red
 * when a plan sat unapproved at a gate destination. Its checks must fail toward
 * REPORTING, never toward a silent pass, so every case below asserts the
 * reporting direction — a fault, a malformed ledger or a missing ledger yields a
 * BLOCK finding whose message names the offender.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RANGE MAP. Measured 2026-08-31 by the gated run (`npm test`, node line
 * coverage scoped to src/**): src/lib/iron-loop-enforcer.js at 96.94 %, ten
 * uncovered ranges. Every one is classified (a) reachable — none are (b)
 * permission-gated / terminal-only and none are (c) dead:
 *
 *   480-481   describeGateOffenders — the `changed` clause (a plan whose
 *             specification changed after approval).                fast mode
 *   851-854   checkUnexecutableInstructionFence — the malformed-baseline catch,
 *             `excused.clear()`: an unreadable ledger excuses NOTHING. thorough
 *   859-863   ...and the block finding it then returns.             thorough
 *   971-977   checkFalseGreenFence — the block finding (file:line, signature,
 *             evidence → fix).                                      thorough
 *   1026-1027 checkGoldenCorpusFence — the malformed-baseline catch. thorough
 *   1032-1037 ...and the block finding it then returns.             thorough
 *   1075-1079 checkRecipeExecutionFence — recipe-coverage.json ABSENT. thorough
 *   1088-1092 ...unreadable (a different fact from absent).         thorough
 *   1096-1099 ...present and readable, but the recipe is in NEITHER list.
 *                                                                   thorough
 *   1233-1237 checkGateWordsFence — a screen module missing from the registry.
 *                                                                   thorough
 *
 * An eleventh range, 908-912 (checkReachabilityFence's unreadable-baseline arm),
 * was reported COVERED by the gated run that opened this slice and UNCOVERED by
 * the one that closed it, over byte-identical source — so some other test reaches
 * it only incidentally. An arm this file's whole subject is fail-closed reporting
 * should not depend on that, so it is pinned here too, deterministically.
 *
 * Line numbers move with every commit; the gate's own report is the source of
 * truth. The BEHAVIOUR each case pins does not move.
 *
 * A FINDING THIS SLICE CARRIES (plan 00240, reported not fixed). Both malformed-
 * baseline arms are written to "drop any partially-parsed keys", and they are NOT
 * equally load-bearing:
 *
 *   • checkUnexecutableInstructionFence's `excused.clear()` really can change a
 *     verdict. `{"debt":["k"],"exemptions":{}}` parses, the first loop adds the
 *     key, the second throws on a non-iterable — and without the clear() that key
 *     would be excused by a baseline nobody could read. Pinned below.
 *   • checkGoldenCorpusFence's `excused.clear()` cannot. Its second loop is
 *     `Object.keys(...)`, which never throws for a JSON value, so no input can add
 *     a key and then throw; the line runs but no verdict depends on it. It is a
 *     defensive no-op, and per the parent plan a dead range is REPORTED, never
 *     deleted. Its real fail-closed behaviour — an unparseable baseline still
 *     blocks — comes from the try/catch and IS pinned below.
 *
 * SEAM. On-disk fixtures under os.tmpdir(), removed in afterEach — the enforcer
 * is never pointed at this repository, and no real baseline is read for mutation
 * or written. Nothing is mocked: no function under test is stubbed, and no
 * boundary fake was needed, because every arm here is reachable with a file.
 *
 * AI-authored (Claude) under plan 00240 and read line-by-line. Each case was
 * proven RED by mutating the arm it names in src/lib/iron-loop-enforcer.js and
 * observing that case — and only that case — fail; the file was restored
 * byte-for-byte (sha256-verified) afterwards.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { checkAllInvariants } = require('../src/lib/iron-loop-enforcer');
const { SCREEN_MODULES } = require('../src/lib/human-facing-scan');

// ── shared temp-root plumbing ────────────────────────────────────────────────
let tmpRoot = null;

function mkTmp() {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ile-holes-'));
  return tmpRoot;
}

function write(root, rel, content) {
  const full = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

const THOROUGH_ARCH = { mode: 'thorough', scopes: ['architecture'] };

function findingById(root, id, opts) {
  return checkAllInvariants({ root, ...opts }).findings.find((f) => f.id === id);
}

afterEach(() => {
  if (tmpRoot) {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort temp cleanup */ }
    tmpRoot = null;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 480-481 · describeGateOffenders — the `changed` clause.
//
// The message is built from the reasons ACTUALLY measured, so it never alleges a
// cause it did not observe. A plan whose ledger entry exists for the right edge
// but whose CONTENT no longer hashes to the recorded digest is a plan CHANGED
// after approval — not one missing an approval. Collapsing the two (the old
// facade did) cost a full gate run chasing the wrong diagnosis.
describe('iron-loop-enforcer — a plan changed after approval is reported as CHANGED, not as missing an approval', () => {
  it('names the specification change and does NOT allege a missing approved_by: human', () => {
    // Arrange — a done/ plan with a ledger entry minted over DIFFERENT bytes.
    // done/ is hash-sensitive, so the mismatch classifies as a changed
    // specification rather than an absent entry.
    const root = mkTmp();
    const approvedText = '---\nfiles: ["*"]\n---\nthe text the human approved';
    const planPath = write(root, 'plans/done/x.md', '---\nfiles: ["*"]\n---\nthe text as it stands NOW');

    const ledger = require('../src/lib/approval-ledger');
    ledger.writeEntry(ledger.slugFromPlanPath(planPath), {
      stage_from: 'review',
      stage_to: 'done',
      content_sha256: ledger.computeContentHash(approvedText),
      approved_by: 'human',
    }, root);

    // Act
    const f = findingById(root, 'gate-destinations-approved', { mode: 'fast', scopes: ['iron-loop'] });

    // Assert — the changed clause fires, and the missing-approval clause does not.
    assert.ok(f, 'expected a gate-destinations-approved finding');
    assert.equal(f.severity, 'block');
    assert.match(f.message, /1 changed in the specification after approval/);
    assert.doesNotMatch(
      f.message,
      /missing approved_by: human in the approval ledger/,
      'the entry EXISTS — alleging a missing approval here is the wrong diagnosis',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 851-854 + 859-863 · checkUnexecutableInstructionFence.
//
// The load-bearing arm of the whole slice: on a JSON.parse failure the check
// calls excused.clear(), so a malformed baseline excuses NOTHING and every
// finding blocks. An unreadable ledger must never read as "all clear".
describe('iron-loop-enforcer — a malformed unexecutable-instruction baseline excuses NOTHING', () => {
  // An agent granted only Read, ordered to call a JavaScript function it has no
  // way to execute. Its finding key is agents/<file>::instruction-tool::helperFn.
  const AGENT = '---\nname: fixture\ntools: Read\n---\n\n# Fixture\n\nYou must call `helperFn(arg)` now.\n';
  const KEY = 'agents/fixture.md::instruction-tool::helperFn';

  it('blocks on every finding when the baseline is unparseable, even one the baseline nominally excuses', () => {
    // Arrange — the baseline names this exact key in `debt`, but its bytes are
    // not JSON. A partially-parsed or "assume all clear" reading would excuse it.
    const root = mkTmp();
    write(root, 'agents/fixture.md', AGENT);
    write(root, '.ctoc/unexecutable-instruction-baseline.json',
      `{ "debt": ["${KEY}"], "exemptions": [] ` /* no closing brace — unparseable */);

    // Act
    const f = findingById(root, 'unexecutable-instruction-fence', THOROUGH_ARCH);

    // Assert — the finding survives, at block severity, naming the key.
    assert.ok(f, 'a malformed baseline must never read as "all clear"');
    assert.equal(f.severity, 'block');
    assert.match(f.message, /1 unexecutable instruction\(s\) with no receiver/);
    assert.ok(f.message.includes(KEY), `the message must name the key, got: ${f.message}`);
  });

  it('drops keys it had ALREADY read when the baseline throws part-way through — a half-read ledger excuses nothing', () => {
    // Arrange — this baseline PARSES. Its `debt` array is well formed and adds the
    // key; its `exemptions` is an object, so the second loop throws on a
    // non-iterable AFTER the key is in the set. This is the only input shape that
    // reaches `excused.clear()` with anything to clear, so it is the case that
    // pins the line rather than merely executing it.
    const root = mkTmp();
    write(root, 'agents/fixture.md', AGENT);
    write(root, '.ctoc/unexecutable-instruction-baseline.json',
      JSON.stringify({ debt: [KEY], exemptions: {} }));

    // Act
    const f = findingById(root, 'unexecutable-instruction-fence', THOROUGH_ARCH);

    // Assert — the half-read key is dropped, so the finding still blocks.
    assert.ok(f, 'a key read before the baseline threw must NOT survive as an excuse');
    assert.equal(f.severity, 'block');
    assert.ok(f.message.includes(KEY), `the message must name the key, got: ${f.message}`);
  });

  it('the same key IS excused when the baseline parses — proving the block came from the malformed bytes', () => {
    // Arrange — identical corpus, this time a well-formed baseline.
    const root = mkTmp();
    write(root, 'agents/fixture.md', AGENT);
    write(root, '.ctoc/unexecutable-instruction-baseline.json',
      JSON.stringify({ debt: [KEY], exemptions: [] }));

    // Act
    const f = findingById(root, 'unexecutable-instruction-fence', THOROUGH_ARCH);

    // Assert — clean. Without this contrast the case above would also pass on a
    // fence that ignored its baseline entirely.
    assert.equal(f, undefined, 'a readable baseline listing the key excuses it');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 908-912 · checkReachabilityFence — the unreadable-baseline arm.
//
// This fence is DELIBERATELY asymmetric with its two siblings above: where they
// clear the excuse set and let the real findings block, this one returns a
// finding about the BASELINE. The source says why — proceeding with an empty set
// would still block, but on a message blaming the source files for a defect in
// the baseline, sending the human to repair the wrong file.
describe('iron-loop-enforcer — an unreadable dead-code baseline is reported as a broken baseline, not as dead code', () => {
  it('names the baseline and says repair the file, instead of blaming the unreachable source file', () => {
    // Arrange — a sanctioned root plus an orphan (so there IS a real unreachable
    // file to misattribute), and a baseline whose bytes are not JSON.
    const root = mkTmp();
    write(root, 'src/commands/start.js', 'module.exports = {};\n');
    write(root, 'src/lib/orphan.js', 'function dead() { return 1; }\nmodule.exports = { dead };\n');
    write(root, '.ctoc/reachability-baseline.json', '{ "unreachable": [ ');

    // Act
    const f = findingById(root, 'reachability-fence', THOROUGH_ARCH);

    // Assert — the diagnosis is the baseline, not the orphan.
    assert.ok(f, 'expected a reachability-fence finding');
    assert.equal(f.severity, 'block');
    assert.match(f.message, /\.ctoc\/reachability-baseline\.json exists but could not be read/);
    assert.match(f.message, /must never read as "all clear"; repair the file/);
    assert.doesNotMatch(
      f.message,
      /src\/lib\/orphan\.js/,
      'an unreadable ratchet must not be reported as a dead source file',
    );
  });

  it('reports the orphan itself once the baseline is readable — proving the block above came from the baseline', () => {
    // Arrange — identical tree, a well-formed (empty) baseline.
    const root = mkTmp();
    write(root, 'src/commands/start.js', 'module.exports = {};\n');
    write(root, 'src/lib/orphan.js', 'function dead() { return 1; }\nmodule.exports = { dead };\n');
    write(root, '.ctoc/reachability-baseline.json', JSON.stringify({ unreachable: [] }));

    // Act
    const f = findingById(root, 'reachability-fence', THOROUGH_ARCH);

    // Assert
    assert.ok(f, 'expected a reachability-fence finding');
    assert.match(f.message, /src\/lib\/orphan\.js/);
    assert.doesNotMatch(f.message, /could not be read/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 971-977 · checkFalseGreenFence — the block finding.
describe('iron-loop-enforcer — the false-green fence reports a NEW site with its file, line, signature and fix', () => {
  it('blocks on an unbaselined silent catch and prints the evidence a human can act on', () => {
    // Arrange — a src tree whose only module swallows its error, with no
    // baseline to excuse it.
    const root = mkTmp();
    write(root, 'src/lib/leaky.js',
      'function load() {\n  try {\n    return read();\n  } catch { }\n}\nmodule.exports = { load };\n');

    // Act
    const f = findingById(root, 'false-green-fence', THOROUGH_ARCH);

    // Assert — severity, the count, and every field of the shown line. A mutant
    // that dropped the evidence or the fix from the message reds here.
    assert.ok(f, 'expected a false-green-fence finding');
    assert.equal(f.severity, 'block');
    assert.match(f.message, /1 NEW false-green site\(s\)/);
    assert.match(f.message, /src\/lib\/leaky\.js:4 \[silent-catch\]/);
    assert.match(f.message, / → /, 'the message must carry the evidence → fix arrow');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1026-1027 + 1032-1037 · checkGoldenCorpusFence.
describe('iron-loop-enforcer — the golden-corpus fence reports an unlinked consumer, and a malformed baseline excuses NOTHING', () => {
  // A module that imports the approval-ledger reader and calls one of its
  // exports, with no test naming that contract's corpus directory.
  const CONSUMER = "const { readEntry } = require('./approval-ledger');\nmodule.exports = { go: (s) => readEntry(s) };\n";
  const KEY = 'approval-ledger::src/lib/consumer.js';

  function seed(root) {
    write(root, 'src/lib/consumer.js', CONSUMER);
    // At least one real sample, so the fence has a corpus to assess linkage
    // against (samplesExercised === 0 is a legitimate "cannot assess" CLEAN).
    write(root, 'tests/fixtures/golden-corpus/approvals/sample.json', '{"stage_to":"done"}\n');
  }

  it('blocks on a consumer of a persisted contract that no test drives with a real sample', () => {
    // Arrange
    const root = mkTmp();
    seed(root);

    // Act
    const f = findingById(root, 'golden-corpus-fence', THOROUGH_ARCH);

    // Assert — the module, the contract and the signal all reach the message.
    assert.ok(f, 'expected a golden-corpus-fence finding');
    assert.equal(f.severity, 'block');
    assert.match(f.message, /1 NEW consumer\(s\) of a persisted contract/);
    assert.match(f.message, /src\/lib\/consumer\.js → approval-ledger \[reader-import\]/);
  });

  it('blocks anyway when the baseline is unparseable, even though it names the key', () => {
    // Arrange — the baseline would excuse this exact key if it could be read.
    // NOTE (see the header finding): what this pins is the try/catch — the parse
    // throws before any key is added, so the `excused.clear()` inside the catch has
    // nothing to clear. No JSON input can reach that line with a key to drop,
    // because the loop after the adds is `Object.keys(...)`, which never throws for
    // a JSON value. The fail-closed behaviour asserted here is real; the clear() is
    // a defensive no-op, reported rather than removed.
    const root = mkTmp();
    seed(root);
    write(root, '.ctoc/golden-corpus-baseline.json',
      `{ "findings": ["${KEY}"], "exemptions": {} ` /* unparseable */);

    // Act
    const f = findingById(root, 'golden-corpus-fence', THOROUGH_ARCH);

    // Assert
    assert.ok(f, 'an unreadable baseline must never read as "all clear"');
    assert.equal(f.severity, 'block');
    assert.match(f.message, /1 NEW consumer\(s\) of a persisted contract/);
  });

  it('the same key IS excused when the baseline parses — proving the block came from the malformed bytes', () => {
    // Arrange
    const root = mkTmp();
    seed(root);
    write(root, '.ctoc/golden-corpus-baseline.json',
      JSON.stringify({ findings: [KEY], exemptions: {} }));

    // Act
    const f = findingById(root, 'golden-corpus-fence', THOROUGH_ARCH);

    // Assert
    assert.equal(f, undefined, 'a readable baseline listing the key excuses it');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1075-1079 + 1088-1092 + 1096-1099 · checkRecipeExecutionFence.
//
// Three distinct facts, three distinct messages: the ledger is ABSENT, the
// ledger is UNREADABLE, or the ledger is fine and the recipe is in neither list.
// A check that collapsed them would tell a human to repair a file that is not
// there.
describe('iron-loop-enforcer — the recipe-execution fence separates an absent ledger from an unreadable one from an unfenced recipe', () => {
  // A shipped state-changing recipe: settings.setSetting mutates durable state.
  const START_MD = [
    '# Start',
    '',
    'Row with a recipe: `node -e "require(\'./src/lib/settings\').setSetting(\'a\', \'b\')"`',
    '',
  ].join('\n');

  it('blocks when state-changing recipes exist and .ctoc/recipe-coverage.json is MISSING', () => {
    // Arrange — the recipe surface with no ledger beside it.
    const root = mkTmp();
    write(root, 'src/commands/start.md', START_MD);

    // Act
    const f = findingById(root, 'recipe-execution-fence', THOROUGH_ARCH);

    // Assert — a missing ledger must never read as "all fenced".
    assert.ok(f, 'expected a recipe-execution-fence finding');
    assert.equal(f.severity, 'block');
    assert.match(f.message, /1 state-changing shipped recipe\(s\) exist but \.ctoc\/recipe-coverage\.json is missing/);
    assert.match(f.message, /must never read as "all fenced"/);
  });

  it('blocks with a DIFFERENT message when the ledger exists but cannot be read', () => {
    // Arrange — same surface, a ledger whose bytes are not JSON.
    const root = mkTmp();
    write(root, 'src/commands/start.md', START_MD);
    write(root, '.ctoc/recipe-coverage.json', '{ "covered": [ ');

    // Act
    const f = findingById(root, 'recipe-execution-fence', THOROUGH_ARCH);

    // Assert — unreadable is its own fact, and it says "repair the file".
    assert.ok(f, 'expected a recipe-execution-fence finding');
    assert.equal(f.severity, 'block');
    assert.match(f.message, /exists but could not be read/);
    assert.match(f.message, /repair the file/);
    assert.doesNotMatch(f.message, /is missing/, 'the ledger is present — do not tell the human it is absent');
  });

  it('blocks when a state-changing recipe is in NEITHER covered nor uncovered', () => {
    // Arrange — a readable ledger that simply does not know this recipe.
    const root = mkTmp();
    write(root, 'src/commands/start.md', START_MD);
    write(root, '.ctoc/recipe-coverage.json',
      JSON.stringify({ covered: [{ id: 'deadbeefdead' }], uncovered: [] }));

    // Act
    const f = findingById(root, 'recipe-execution-fence', THOROUGH_ARCH);

    // Assert — the arrival of an unfenced recipe, named by its row.
    assert.ok(f, 'expected a recipe-execution-fence finding');
    assert.equal(f.severity, 'block');
    assert.match(f.message, /1 state-changing shipped recipe\(s\) in start\.md are in NEITHER covered nor uncovered/);
    assert.match(f.message, /row 3 \[settings\.setSetting\]/);
  });

  it('is SILENT when the ledger knows the recipe — proving the three blocks came from the ledger, not the recipe', () => {
    // Arrange — the same recipe, this time carrying its own real identity.
    const root = mkTmp();
    const mdPath = write(root, 'src/commands/start.md', START_MD);
    const { extractRecipes, isStateChanging, recipeId } = require('../src/lib/recipe-harness');
    const ids = extractRecipes(mdPath).filter(isStateChanging).map(recipeId);
    assert.equal(ids.length, 1, 'the fixture must ship exactly one state-changing recipe');
    write(root, '.ctoc/recipe-coverage.json',
      JSON.stringify({ covered: [{ id: ids[0] }], uncovered: [] }));

    // Act
    const f = findingById(root, 'recipe-execution-fence', THOROUGH_ARCH);

    // Assert
    assert.equal(f, undefined, 'a fenced recipe contributes no finding');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1233-1237 · checkGateWordsFence — the unregistered-screen clause.
//
// The registry's own rot-defence: a module that returns the { text, ask,
// actions } screen contract but is not in SCREEN_MODULES escapes the gate-number
// scan silently. That blind spot is how a live gate number reached the owner's
// inbox.
describe('iron-loop-enforcer — the gate-words fence names a screen module missing from the registry', () => {
  it('blocks on an unregistered producer of the { text, ask, actions } contract', () => {
    // Arrange — every registered screen module present (so the registry scan can
    // read them all and is `available`), plus one rogue screen that is not
    // registered.
    const root = mkTmp();
    for (const rel of SCREEN_MODULES) write(root, rel, 'module.exports = {};\n');
    write(root, 'src/lib/rogue-screen.js',
      "function screen() {\n  return { text: 'hello', ask: 'pick one', actions: [] };\n}\nmodule.exports = { screen };\n");

    // Act
    const f = findingById(root, 'gate-words-fence', THOROUGH_ARCH);

    // Assert — the module is named, and the message is the registry clause, not
    // the "scan could not run" clause.
    assert.ok(f, 'expected a gate-words-fence finding');
    assert.equal(f.severity, 'block');
    assert.match(f.message, /1 screen module\(s\) return the \{ text, ask, actions \} contract but are not in SCREEN_MODULES/);
    assert.match(f.message, /src\/lib\/rogue-screen\.js/);
    assert.doesNotMatch(f.message, /could not run/, 'the scan ran — this is a finding, not an unavailability');
  });

  it('is SILENT once the same module is one of the registered screens', () => {
    // Arrange — the rogue file's content, written at a REGISTERED path.
    const root = mkTmp();
    for (const rel of SCREEN_MODULES) write(root, rel, 'module.exports = {};\n');
    write(root, 'src/lib/menu-screens.js',
      "function screen() {\n  return { text: 'hello', ask: 'pick one', actions: [] };\n}\nmodule.exports = { screen };\n");

    // Act
    const f = findingById(root, 'gate-words-fence', THOROUGH_ARCH);

    // Assert — registration is what silences it, not the absence of a screen.
    assert.equal(f, undefined, 'a registered screen module contributes no finding');
  });
});
