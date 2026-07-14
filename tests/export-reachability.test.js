'use strict';

/**
 * THE DEAD-EXPORT FENCE — a ratcheting reachability gate, one level below files.
 *
 * WHY (2026-07-14). The file fence (tests/reachability.test.js) asks "can a human
 * reach this FILE?". It cannot see a dead EXPORT inside a live file — and that is
 * exactly how the worst defect of the wave shipped: `completeExecution` lived in
 * `src/lib/actions.js` (a very live file), was the ONLY producer of the Gate-3
 * VERIFY evidence, and had ZERO callers. The file fence was green the whole time.
 *
 * Same ratchet as the file fence, one level down:
 *   1. The dead-export set is a NAMED baseline — a swap cannot hide a new dead
 *      export behind a flat count.
 *   2. The count may never rise above the baseline.
 *   3. Unclaimed progress FAILS: wire or delete an export and you must lower the
 *      baseline, or the fence loses its grip.
 *
 * A TEST IS NEVER A CALLER. That is the whole point — a slice ships "module + its
 * own test", so a test-only caller is precisely the false green this fence exists
 * to catch. `analyzeExports` never looks at tests/.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { analyzeExports } = require('../src/lib/reachability');

const ROOT = path.join(__dirname, '..');
const BASELINE_FILE = path.join(ROOT, '.ctoc', 'export-reachability-baseline.json');

describe('dead-export fence — exports reachable from live callers (RATCHET)', () => {
  const result = analyzeExports(ROOT);
  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  const allowed = new Set(baseline.dead);

  it('the analysis is non-vacuous: real modules, real exports, real usage edges', () => {
    assert.ok(result.totalExports > 200, `expected a real export surface, saw ${result.totalExports}`);
    assert.ok(result.totalModules > 50, `expected the live module set, saw ${result.totalModules}`);
    // A substantial live core must exist — if the analyzer saw almost nothing as
    // live, its usage index is broken and every "dead" verdict below is noise. (The
    // live share is under half today: that is the DEBT, not an analyzer fault, and
    // the ratchet exists to shrink it. The real non-vacuity guard is the planted
    // dead export below.)
    assert.ok(
      result.live.length > result.totalExports / 4,
      `expected a substantial live core, saw ${result.live.length}/${result.totalExports}; the analyzer is probably broken`
    );
    // A test is never a caller: no test file may appear as a usage source.
    assert.ok(
      !result.sources.some((s) => s.includes('/tests/') || s.endsWith('.test.js')),
      'a test must NEVER count as a caller — that is the false green this fence exists to catch'
    );
  });

  it('NON-VACUITY (the real guard): a planted dead export in a fixture project is DETECTED', () => {
    // Build a miniature project with the same shape as CTOC: a live root
    // (src/commands/menu.js) requiring a lib module. The lib exports one name the
    // root uses and one nobody uses anywhere. If the analyzer cannot see the
    // difference, every assertion below is worthless — so prove it can.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-exportfence-'));
    try {
      fs.mkdirSync(path.join(tmp, 'src', 'commands'), { recursive: true });
      fs.mkdirSync(path.join(tmp, 'src', 'lib'), { recursive: true });
      fs.writeFileSync(
        path.join(tmp, 'src', 'commands', 'menu.js'),
        "const { usedByTheMenu } = require('../lib/live');\nusedByTheMenu();\n"
      );
      fs.writeFileSync(
        path.join(tmp, 'src', 'lib', 'live.js'),
        'function usedByTheMenu() { return 1; }\n' +
        'function nobodyCallsThis() { return 2; }\n' +
        'module.exports = { usedByTheMenu, nobodyCallsThis };\n'
      );
      // A test file that DOES call the dead export — the exact false-green shape.
      fs.mkdirSync(path.join(tmp, 'tests'), { recursive: true });
      fs.writeFileSync(
        path.join(tmp, 'tests', 'live.test.js'),
        "const { nobodyCallsThis } = require('../src/lib/live');\nnobodyCallsThis();\n"
      );

      const r = analyzeExports(tmp);
      assert.ok(
        r.dead.includes('src/lib/live.js#nobodyCallsThis'),
        `a dead export must be DETECTED even when a test calls it. dead = ${JSON.stringify(r.dead)}`
      );
      assert.ok(
        !r.dead.includes('src/lib/live.js#usedByTheMenu'),
        'an export a live root actually calls must NOT be reported dead'
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('completeExecution is NOT dead — the key is cut (the defect this fence was born from)', () => {
    assert.ok(
      !result.dead.includes('src/lib/actions.js#completeExecution'),
      'completeExecution is the ONLY producer of the Gate-3 VERIFY evidence. ' +
      'If it is dead, Gate 3 is un-passable except by override. Wire it.'
    );
    assert.ok(
      !allowed.has('src/lib/actions.js#completeExecution'),
      'completeExecution must NEVER be fenced into the baseline — it must be WIRED.'
    );
  });

  it('NO NEW DEAD EXPORT: every dead export is already in the baseline', () => {
    const newlyDead = result.dead.filter((e) => !allowed.has(e));
    assert.deepEqual(
      newlyDead,
      [],
      'These exports have no live caller — they are DEAD ON ARRIVAL inside a live file.\n' +
      'A test is NOT a caller. Wire each to a live call site, delete it, or declare it\n' +
      'in .ctoc/reachability-roots.json ("exports": [...]) if it is genuinely an entry point.\n' +
      `Newly dead: ${newlyDead.join(', ')}`
    );
  });

  it('THE RATCHET ONLY TIGHTENS: the dead-export count never exceeds the baseline', () => {
    assert.ok(
      result.dead.length <= baseline.maxDead,
      `dead-export count rose to ${result.dead.length}, baseline is ${baseline.maxDead}. ` +
      'The baseline may only ever be LOWERED. Never raise it to make this pass.'
    );
  });

  it('LOWER THE BASELINE when you pay debt down (fails loudly on unclaimed progress)', () => {
    assert.equal(
      result.dead.length,
      baseline.maxDead,
      `Live dead-export count is ${result.dead.length} but the baseline says ${baseline.maxDead}. ` +
      `You wired or deleted exports — now LOWER maxDead to ${result.dead.length} and remove the ` +
      'fixed entries from the baseline list.'
    );
  });

  it('the baseline list is honest: no phantom entries for files that no longer exist', () => {
    const phantoms = baseline.dead.filter((e) => {
      const file = String(e).split('#')[0];
      return !fs.existsSync(path.join(ROOT, file));
    });
    assert.deepEqual(phantoms, [], `Baseline names files that do not exist: ${phantoms.join(', ')} — remove them.`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FENCE-DISARM GUARDS (R4-B). Two holes the fence had, and the code-edge it must
// keep seeing. Each guard is a planted-defect fixture: if the guard can pass on
// the BROKEN analyzer it is not a guard. A CALLER is exactly one of: a code
// reference in ANOTHER live module; an intra-module reference (definition + ≥1
// use — a real call, not the export line); a reference inside a FENCED code block
// in a shipped instruction surface; or a declared export root. BARE PROSE in
// markdown — even prose that names a src path — is NOT a caller. A COMMENT is not
// a caller. A TEST is not a caller.
// ─────────────────────────────────────────────────────────────────────────────
describe('dead-export fence — a fence prose and comments cannot disarm', () => {
  function build(files) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-fence-'));
    for (const [rel, body] of Object.entries(files)) {
      const abs = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, body);
    }
    return tmp;
  }
  const cleanup = (tmp) => fs.rmSync(tmp, { recursive: true, force: true });

  it('PROSE-ONLY mention → DEAD (a bare markdown token is not a caller)', () => {
    const tmp = build({
      'src/commands/menu.js':
        "const { usedByMenu } = require('../lib/live');\nusedByMenu();\n",
      'src/lib/live.js':
        'function usedByMenu() { return 1; }\n' +
        'function proseOnlyExport() { return 2; }\n' +
        'module.exports = { usedByMenu, proseOnlyExport };\n',
      // A distinctive name mentioned only as bare prose — NOT in a fence, NOT a
      // recipe. The old analyzer whitened it via surfaceTokens; it must not.
      'agents/x/x.md':
        '# Agent X\n\nThe proseOnlyExport helper is described here in a sentence.\n'
    });
    try {
      const r = analyzeExports(tmp);
      assert.ok(
        r.dead.includes('src/lib/live.js#proseOnlyExport'),
        `a prose-only export must be DEAD; bare markdown prose is not a caller. dead=${JSON.stringify(r.dead)}`
      );
      assert.ok(!r.dead.includes('src/lib/live.js#usedByMenu'), 'a truly-called export must stay live');
    } finally { cleanup(tmp); }
  });

  it('COMMENT after a quote-containing REGEX → DEAD (a comment cannot resurrect)', () => {
    // other.js contains `/['"]\/\//g` then a comment naming `zombieExport`. The old
    // lexer flipped into string state on the quote inside the regex and never left,
    // so the trailing comment survived stripping and the token leaked across
    // modules — resurrecting a dead export. A real lexer strips that comment.
    const tmp = build({
      'src/commands/menu.js':
        "const { usedByMenu } = require('../lib/live');\n" +
        "const other = require('../lib/other');\nusedByMenu();\nother.go();\n",
      'src/lib/live.js':
        'function usedByMenu() { return 1; }\n' +
        'function zombieExport() { return 2; }\n' +
        'module.exports = { usedByMenu, zombieExport };\n',
      'src/lib/other.js':
        'const re = /[\'"]\\/\\//g;\n' +
        '// zombieExport is named here in a comment after a quote-containing regex\n' +
        'function go() { return re.source; }\n' +
        'module.exports = { go };\n'
    });
    try {
      const r = analyzeExports(tmp);
      assert.ok(
        r.dead.includes('src/lib/live.js#zombieExport'),
        `an export named only in a comment must be DEAD — a comment a regex cannot disarm the fence. dead=${JSON.stringify(r.dead)}`
      );
    } finally { cleanup(tmp); }
  });

  it('FENCED-CODE-BLOCK recipe (require().name) → LIVE (a real executable reference)', () => {
    const tmp = build({
      'src/commands/menu.js':
        "const { usedByMenu } = require('../lib/live');\nusedByMenu();\n",
      'src/lib/live.js':
        'function usedByMenu() { return 1; }\n' +
        'function recipeName() { return 2; }\n' +
        'module.exports = { usedByMenu, recipeName };\n',
      // A genuine recipe inside a fenced block — the session executes this.
      'agents/x/x.md':
        '# Agent X\n\nRun:\n\n```bash\nnode -e "require(\'./src/lib/live.js\').recipeName()"\n```\n'
    });
    try {
      const r = analyzeExports(tmp);
      assert.ok(
        !r.dead.includes('src/lib/live.js#recipeName'),
        `a name invoked in a FENCED recipe must be LIVE. dead=${JSON.stringify(r.dead)}`
      );
    } finally { cleanup(tmp); }
  });

  it('CODE EDGE: an intra-file call keeps an export LIVE — and only the code edge does', () => {
    // Mirrors menu-screens.completeTaskPlan → actions.completeExecution: publicApi
    // is externally called; it calls internalOnly inside its own module. That is a
    // genuine code edge, NOT prose.
    const wired = build({
      'src/commands/menu.js':
        "const { publicApi } = require('../lib/mod');\npublicApi();\n",
      'src/lib/mod.js':
        'function internalOnly() { return 42; }\n' +
        'function publicApi() { return internalOnly(); }\n' +
        'module.exports = { publicApi, internalOnly };\n'
    });
    try {
      const r = analyzeExports(wired);
      assert.ok(
        !r.dead.includes('src/lib/mod.js#internalOnly'),
        `an export called by a live sibling export IN THE SAME FILE must be LIVE (the completeExecution edge). dead=${JSON.stringify(r.dead)}`
      );
    } finally { cleanup(wired); }

    // RE-CATCH: delete the code edge (publicApi no longer calls internalOnly) and
    // even a prose + path-naming markdown mention must NOT save it. The fence must
    // re-catch its own motivating bug the instant the code edge dies.
    const unwired = build({
      'src/commands/menu.js':
        "const { publicApi } = require('../lib/mod');\npublicApi();\n",
      'src/lib/mod.js':
        'function internalOnly() { return 42; }\n' +
        'function publicApi() { return 42; }\n' +
        'module.exports = { publicApi, internalOnly };\n',
      // Prose that even names the src path — must NOT whiten it.
      'src/commands/menu.md':
        'The `publicApi` → `internalOnly` path (`src/lib/mod.js`) runs the thing.\n'
    });
    try {
      const r = analyzeExports(unwired);
      assert.ok(
        r.dead.includes('src/lib/mod.js#internalOnly'),
        `once the code edge is gone, prose (even naming the src path) must NOT keep it live — the fence must re-catch it. dead=${JSON.stringify(r.dead)}`
      );
    } finally { cleanup(unwired); }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R4-C — THE FENCE CREDITS A CALL, NOT A FENCED BLOCK. R4-B tightened surface
// credit to "named inside a fenced ``` block". That over-corrected: CTOC's
// recipes invoke library functions with INLINE code (single backticks), so 24
// genuinely-reachable exports — including approveSubplans (the Gate-3 done-all
// gate), declineComplianceRegime, dismissStale, completeVision — were baselined
// DEAD. The correct signal is CALL SYNTAX, not formatting: `name(` (a call) or
// require('…').name (a resolved reference) is a caller; a bare token in prose is
// not. This block proves both the credit AND the re-catch (completeExecution is
// named only as a bare token, so it must STILL die when its code edge is cut).
// ─────────────────────────────────────────────────────────────────────────────
describe('dead-export fence — a surface CALL is a caller, a prose token is not (R4-C)', () => {
  function build(files) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-r4c-'));
    for (const [rel, body] of Object.entries(files)) {
      const abs = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, body);
    }
    return tmp;
  }
  const cleanup = (tmp) => fs.rmSync(tmp, { recursive: true, force: true });

  it('INLINE-code call `name(...)` (single backticks, NOT fenced) → LIVE', () => {
    // The exact shape of menu.md: `approveSubplans(parentSlug, 'review')` — an
    // invocation inside single backticks, never a fenced block. R4-B's
    // fenced-only rule buries this; the correct rule credits the call.
    const tmp = build({
      'src/commands/menu.js':
        "const { usedByMenu } = require('../lib/live');\nusedByMenu();\n",
      'src/lib/live.js':
        'function usedByMenu() { return 1; }\n' +
        'function recipeCall() { return 2; }\n' +
        'module.exports = { usedByMenu, recipeCall };\n',
      'src/commands/menu.md':
        '# Menu\n\nBatch-approve via `recipeCall(parentSlug, \'review\')` on the review list.\n'
    });
    try {
      const r = analyzeExports(tmp);
      assert.ok(
        !r.dead.includes('src/lib/live.js#recipeCall'),
        `an INLINE-code call must be LIVE (a recipe invocation is a caller). dead=${JSON.stringify(r.dead)}`
      );
    } finally { cleanup(tmp); }
  });

  it("require('./x').name reference in a recipe → LIVE (a resolved property access)", () => {
    const tmp = build({
      'src/commands/menu.js':
        "const { usedByMenu } = require('../lib/live');\nusedByMenu();\n",
      'src/lib/live.js':
        'function usedByMenu() { return 1; }\n' +
        'function propRef() { return 2; }\n' +
        'module.exports = { usedByMenu, propRef };\n',
      // A require-property reference (no immediate call paren) inside inline code.
      'agents/x/x.md':
        "# X\n\nRun `node -e \"const f = require('./src/lib/live.js').propRef; f()\"`.\n"
    });
    try {
      const r = analyzeExports(tmp);
      assert.ok(
        !r.dead.includes('src/lib/live.js#propRef'),
        `a require('…').name reference must be LIVE. dead=${JSON.stringify(r.dead)}`
      );
    } finally { cleanup(tmp); }
  });

  it('BARE prose token (no paren) → DEAD (documentation is not a caller)', () => {
    const tmp = build({
      'src/commands/menu.js':
        "const { usedByMenu } = require('../lib/live');\nusedByMenu();\n",
      'src/lib/live.js':
        'function usedByMenu() { return 1; }\n' +
        'function proseToken() { return 2; }\n' +
        'module.exports = { usedByMenu, proseToken };\n',
      'agents/x/x.md':
        '# X\n\nThe `proseToken` helper is described in a sentence, never invoked.\n'
    });
    try {
      const r = analyzeExports(tmp);
      assert.ok(
        r.dead.includes('src/lib/live.js#proseToken'),
        `a bare prose token (even in backticks) is NOT a caller → must be DEAD. dead=${JSON.stringify(r.dead)}`
      );
    } finally { cleanup(tmp); }
  });

  it('RE-CATCH: completeExecution-shape — bare token + no code edge → DEAD; `name(` → LIVE', () => {
    // completeExecution is named in surfaces ONLY as `completeExecution` (a
    // backtick token, never `completeExecution(`) and lives solely by its
    // intra-file code edge. Cut the edge, leave the exact menu.md prose, and it
    // must die — a surface CALL would save it, a prose token must not.
    const bareDead = build({
      'src/commands/menu.js':
        "const { publicApi } = require('../lib/mod');\npublicApi();\n",
      'src/lib/mod.js':
        'function internalOnly() { return 42; }\n' +
        'function publicApi() { return 42; }\n' + // code edge CUT
        'module.exports = { publicApi, internalOnly };\n',
      // The EXACT prose shape from menu.md line 120: backtick token, then a paren
      // that belongs to the path citation — NOT a call of internalOnly.
      'src/commands/menu.md':
        '`publicApi` → `internalOnly` (`src/lib/mod.js`): the plan is validated.\n'
    });
    try {
      const r = analyzeExports(bareDead);
      assert.ok(
        r.dead.includes('src/lib/mod.js#internalOnly'),
        `bare-token prose (backtick then path-paren) must NOT resurrect a code-dead export. dead=${JSON.stringify(r.dead)}`
      );
    } finally { cleanup(bareDead); }

    // The same export, now genuinely INVOKED in a recipe → LIVE.
    const calledLive = build({
      'src/commands/menu.js':
        "const { publicApi } = require('../lib/mod');\npublicApi();\n",
      'src/lib/mod.js':
        'function internalOnly() { return 42; }\n' +
        'function publicApi() { return 42; }\n' +
        'module.exports = { publicApi, internalOnly };\n',
      'src/commands/menu.md':
        'Run `internalOnly(process.cwd())` to do the thing.\n'
    });
    try {
      const r = analyzeExports(calledLive);
      assert.ok(
        !r.dead.includes('src/lib/mod.js#internalOnly'),
        `an export INVOKED as name(...) in a recipe must be LIVE. dead=${JSON.stringify(r.dead)}`
      );
    } finally { cleanup(calledLive); }
  });

  it('THE REAL REPO: the recipe-invoked gate exports are LIVE, by name', () => {
    // The load-bearing regression guard. Each of these is invoked in a menu.md /
    // agent recipe as `name(` or require('…').name; R4-B buried all four as DEAD.
    // A change that re-buries the Gate-3 done-all gate as dead must fail here.
    const result = analyzeExports(ROOT);
    const isDead = (n) => result.dead.some((d) => d.endsWith(`#${n}`));
    for (const name of ['approveSubplans', 'declineComplianceRegime', 'dismissStale', 'completeVision', 'writeActiveProfiles']) {
      assert.ok(
        !isDead(name),
        `${name} is invoked in a shipped recipe — it must be LIVE, not baselined dead. ` +
        'Calling the Gate-3 gate "dead" hides exactly the gate-deletion this fence exists to catch.'
      );
    }
    // And the re-catch holds in the real repo: completeExecution is named only as
    // a bare token, so it is credited by its code edge alone — never by a surface.
    assert.ok(
      !result.dead.includes('src/lib/actions.js#completeExecution'),
      'completeExecution must be LIVE via its intra-file code edge (completeTaskPlan → completeExecution).'
    );
  });
});
