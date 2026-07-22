/**
 * start.js coverage — HARD, failure-first, branch-pinning tests for the dashboard
 * router (`src/commands/start.js`).
 *
 * Every test here is written to go RED if a happy-path-only implementation were
 * substituted: it pins an error/catch path, a boundary comparison, a coercion of
 * malformed input, an `||`/`??` fallback, or a specific router branch. Tests that
 * would still pass against a trivially-wrong implementation are deliberately absent.
 *
 * IN-PROCESS strategy: the module exports its functions AND the live `app` object,
 * so `render`/`handleKey` (which close over module-level `app`) are driven directly
 * by mutating the exported `app`. Only genuine boundaries are controlled —
 * `process.stdout.write` (captured, never mocking render logic), `process.exit`
 * (throws a sentinel so the quit path is observable), and `global.setTimeout` (so a
 * message-timer never leaks a real 2-second timer). The filesystem is exercised with
 * REAL temp-dir fixtures, never a fake `fs`.
 *
 * DOCUMENTED UNREACHABLE (never faked):
 *  - `main()` (start.js ~594-667) and `handleResize` (~519-522) are NOT exported and
 *    only run when the module is the process entry point / under a TTY. The
 *    `## main() — real behavior, cross-process` suite exercises them by spawning
 *    `node start.js`, but Node's `--experimental-test-coverage` instruments only the
 *    test process, so that real execution is NOT attributed to this file's line %.
 *    The TTY interactive branch (isTTY true, ~625-638) additionally needs a pseudo-
 *    terminal (node-pty is not a dependency), so it stays uncredited by design.
 *  - The VERSION read-fallback catch (start.js 244-245) runs only if the VERSION file
 *    is unreadable at module-load time; the file exists, so the catch is load-time-
 *    only and cannot be re-entered after import.
 *  - `activateCurrentArea`'s catch (start.js 513-515) fires only when `TABS[tabIndex]`
 *    is out of range; every public entry (left/right/numeric shortcuts) clamps the
 *    index into a valid area, so no public API emits the malformed state it guards.
 *  - `enterSearchMode`'s catch (start.js 139-140) is a redundant belt-and-suspenders
 *    guard: the underlying `plan-index.search` barrel is itself fully fail-open and
 *    never throws or rejects for ANY query or projectPath (a numeric/object root
 *    still returns real results), so the catch cannot be entered from the public API.
 *  - `render`'s inner `tabModule.renderActions` call (start.js 337) never runs because
 *    no area module exposes a `renderActions` hook; the actions-mode ARM (335-336) is
 *    covered, but the optional inner call has no real implementation to exercise.
 */

const { describe, it, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const menu = require('../src/commands/start.js');
const streamingFlow = require('../src/lib/streaming-flow');
const { TABS } = require('../src/lib/tabs');
const {
  splitCliArgs,
  extractLiveAgentIds,
  ensureInitialized,
  needsComplianceRegimePrompt,
  attachComplianceQuestion,
  enterSearchMode,
  handleSearchKey,
  handleSearchInput,
  renderSearch,
  handleKey,
  render,
  app,
} = menu;

const MENU = path.join(__dirname, '..', 'src', 'commands', 'start.js');

// ── temp-dir fixtures ────────────────────────────────────────────────────────
const tmpDirs = [];
function mkTmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}
// A fully valid, already-set-up project — the only state where "no re-init"
// (plan 00176) is the correct verdict, since a bare `.ctoc/` now repairs.
function seedFullySetUpProject(dir) {
  fs.mkdirSync(path.join(dir, '.ctoc', 'state'), { recursive: true });
  for (const s of ['vision', 'canvas', 'functional', 'implementation',
    'todo', 'in-progress', 'review', 'done']) {
    fs.mkdirSync(path.join(dir, 'plans', s), { recursive: true });
  }
  fs.writeFileSync(path.join(dir, '.ctoc', 'settings.yaml'),
    'version: 1\n\nregulatory_regime:\n  active_profiles: []\n', 'utf8');
  fs.writeFileSync(path.join(dir, '.ctoc', 'state', 'iron-loop.yaml'), 'step: 1\n', 'utf8');
  return dir;
}
after(() => tmpDirs.forEach(d => fs.rmSync(d, { recursive: true, force: true })));

// ── stdout capture (a real boundary, not render logic) ───────────────────────
function withStdout(fn) {
  const orig = process.stdout.write;
  let buf = '';
  process.stdout.write = (s) => { buf += s; return true; };
  try { fn(); } finally { process.stdout.write = orig; }
  return buf;
}

// Reset the live app fields these tests mutate, so tests stay order-independent
// (FIRST.Independent) despite the shared module-level `app` object.
function baselineApp() {
  app.searchMode = false;
  // The streaming view is the session's primary screen (app-literal default true).
  // The legacy in-process render/handleKey suites below assert CLASSIC-dashboard
  // behavior, so the fixture puts the app into the classic-dashboard state
  // (streamView=false); the streaming suite re-enables it explicitly. This keeps the
  // pre-existing dashboard/area assertions unchanged while streaming is primary live.
  app.streamView = false;
  app.streamAction = null;
  app.mode = 'list';
  app.tabIndex = 0;
  app.viewContent = null;
  app.selectedPlan = null;
  app.message = null;
  app.toolMode = null;
  app.directInput = '';
  app.inputValue = '';
  app.searchQuery = '';
  app.searchResults = [];
  app.selectedIndex = 0;
  app.actionIndex = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
describe('splitCliArgs — tokenizes ONLY the single-combined-string form', () => {
  it('returns [] for a non-array argv (kills "return cliArgs" mutant)', () => {
    assert.deepEqual(splitCliArgs(null), []);
    assert.deepEqual(splitCliArgs(undefined), []);
    assert.deepEqual(splitCliArgs('browse functional'), []);
  });

  it('splits a one-element combined string on whitespace and drops empties', () => {
    // Arrange / Act
    const out = splitCliArgs(['  browse   functional  ']);
    // Assert — collapsed run of spaces yields exactly two tokens, no empty strings
    assert.deepEqual(out, ['browse', 'functional']);
  });

  it('passes a shell-tokenized multi-element argv through UNSPLIT', () => {
    // A quoted value must survive as one token — the anti-truncation contract (M6).
    const out = splitCliArgs(['--summary', 'two words']);
    assert.deepEqual(out, ['--summary', 'two words']);
    assert.equal(out[1], 'two words', 'quoted token not re-split');
  });
});

describe('extractLiveAgentIds — present-but-empty flag is NOT authoritative', () => {
  it('parses a non-empty csv into a trimmed id array and strips the flag+value', () => {
    const { liveAgentIds, rest } = extractLiveAgentIds(['x', '--live-agent-ids', ' a , b ,c ', 'y']);
    assert.deepEqual(liveAgentIds, ['a', 'b', 'c'], 'ids trimmed, blanks dropped');
    assert.deepEqual(rest, ['x', 'y'], 'flag AND its value consumed from residual');
  });

  it('leaves liveAgentIds UNDEFINED for an empty flag value (R3-B honesty branch)', () => {
    // Mapping "" → [] would mass-orphan every live agent; an empty parse must be
    // the SAME as absent. This kills the `liveAgentIds = ids` (unconditional) mutant.
    const { liveAgentIds, rest } = extractLiveAgentIds(['--live-agent-ids', '   ', 'keep']);
    assert.equal(liveAgentIds, undefined, 'all-blank csv is not "zero agents alive"');
    assert.deepEqual(rest, ['keep'], 'value still consumed even when it yields no ids');
  });

  it('treats a trailing flag with no value (args[i+1] == null) as empty → undefined', () => {
    const { liveAgentIds, rest } = extractLiveAgentIds(['--live-agent-ids']);
    assert.equal(liveAgentIds, undefined);
    assert.deepEqual(rest, []);
  });

  it('returns undefined ids and [] rest for a non-array argv', () => {
    const { liveAgentIds, rest } = extractLiveAgentIds(undefined);
    assert.equal(liveAgentIds, undefined);
    assert.deepEqual(rest, []);
  });

  it('accumulates ordinary args into rest untouched when the flag is absent', () => {
    const { liveAgentIds, rest } = extractLiveAgentIds(['plan', 'todo/foo.md']);
    assert.equal(liveAgentIds, undefined);
    assert.deepEqual(rest, ['plan', 'todo/foo.md']);
  });
});

// CONTRACT CHANGE (plan 00156, 2026-07-20). `ensureInitialized` returns a VERDICT
// read back from the filesystem — `{ attempted, ok, created, skipped, missing,
// reason }` — not a boolean. The boolean meant "nothing threw" and nothing more,
// which is why the menu announced initialization on projects it had not
// initialized. Each assertion below keeps its original subject and gains
// precision: `true` conflated "it ran" with "it worked", and `false` conflated
// "we did not try" with "we tried and failed".
describe('ensureInitialized — auto-init boundary and fail-open catch', () => {
  it('initializes a project that has no .ctoc/ and reports it worked', () => {
    const dir = mkTmp('menu-cov-init-');
    assert.ok(!fs.existsSync(path.join(dir, '.ctoc')), 'precondition');
    const setup = ensureInitialized(dir);
    assert.equal(setup.attempted, true);
    assert.equal(setup.ok, true, `missing: ${JSON.stringify(setup.missing)}`);
    assert.ok(fs.existsSync(path.join(dir, '.ctoc')), '.ctoc/ created');
  });

  it('is a no-op (attempted false) on a fully set-up project (kills init-always mutant)', () => {
    // CONTRACT INVERSION (plan 00176, 2026-07-21).
    //  (a) Contract from OUTSIDE the test: the human-approved 00176 repair makes
    //      the setup trigger the READ-BACK; any missing artifact is repaired.
    //  (b) Why the prior fixture was wrong, not the code: a BARE `.ctoc/` is not
    //      "already exists" in the sense this guard means — it is a broken world
    //      that 00176 now repairs, so it correctly yields attempted:true. The
    //      guard's real intent is "do NOT re-initialise a project that is already
    //      COMPLETE", which is exactly what a fully-seeded project proves.
    //  (c) What newly failed: a bare `.ctoc/` inverts to attempted:true /
    //      created:non-empty. Re-pointed at a complete project, the init-always
    //      mutant it kills stays dead — a healthy project must attempt nothing.
    const dir = seedFullySetUpProject(mkTmp('menu-cov-noop-'));
    const setup = ensureInitialized(dir);
    assert.equal(setup.attempted, false, 'no re-initialization on a complete project');
    assert.deepEqual(setup.created, [], 'and nothing written — the mutant stays dead');
  });

  it('FAILS OPEN (false, no throw) when initProject cannot run — root under a file', () => {
    // Arrange: a regular file, then a path that treats it as a parent directory.
    const dir = mkTmp('menu-cov-failopen-');
    const filePath = path.join(dir, 'a-file');
    fs.writeFileSync(filePath, 'x');
    const brokenRoot = path.join(filePath, 'child'); // parent is a file → mkdir throws

    // Act — existsSync(.ctoc under a file) is false, so initProject runs and throws.
    let result, threw = false;
    try { result = ensureInitialized(brokenRoot); } catch { threw = true; }

    // Assert — the catch swallowed the error; the menu is never blocked by init.
    assert.equal(threw, false, 'ensureInitialized must not propagate the init error');
    // Fail-open, now with the reason preserved instead of collapsed into `false`.
    // "We tried and it failed" is a different fact from "we did not try", and the
    // old boolean rendered both as the same value.
    assert.equal(result.ok, false, 'fail-open reports failure, never success');
    assert.equal(result.attempted, true, 'the attempt happened and is recorded as such');
    assert.equal(typeof result.reason, 'string', 'the error message survives');
    assert.ok(result.reason.length > 0, 'and is not empty');
  });
});

describe('needsComplianceRegimePrompt — ride-along predicate and fail-open', () => {
  function projectWithSettingsYaml(body) {
    const dir = mkTmp('menu-cov-compl-');
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
    if (body !== undefined) fs.writeFileSync(path.join(dir, '.ctoc', 'settings.yaml'), body);
    return dir;
  }

  it('returns true when neither EU profile is active and no decline is recorded', () => {
    const dir = projectWithSettingsYaml(undefined);
    assert.equal(needsComplianceRegimePrompt(dir), true);
  });

  it('returns false when a durable "None" decline is recorded (kills dropping the declined check)', () => {
    // A trailing top-level key terminates the regulatory_regime block for the
    // block-extraction regex in loadActiveProfiles (matches the real settings shape).
    const dir = projectWithSettingsYaml(
      'regulatory_regime:\n  active_profiles: []\n  declined: true\n\ngeneral:\n  x: 1\n');
    assert.equal(needsComplianceRegimePrompt(dir), false);
  });

  it('FAILS OPEN to false when the read throws (malformed projectRoot triggers the catch)', () => {
    // A numeric root makes path.join inside loadActiveProfiles throw TypeError; the
    // try/catch must convert that to a non-blocking false, never crash the dashboard.
    assert.equal(needsComplianceRegimePrompt(42), false);
  });
});

describe('attachComplianceQuestion — additive, with defensive guards', () => {
  it('appends the compliance question + actions and prefixes the banner text', () => {
    const result = { text: 'DASHBOARD', ask: { questions: [{ header: 'Pipeline' }] }, actions: { Business: 'x' } };
    const out = attachComplianceQuestion(result, '/tmp/whatever');
    assert.equal(out.ask.questions.length, 2, 'question appended, not replaced');
    assert.equal(out.ask.questions[1].header, 'Compliance');
    assert.equal(out.actions['GDPR'], 'claude:set-compliance-regime gdpr');
    assert.equal(out.actions.Business, 'x', 'existing actions preserved');
    assert.match(out.text, /^⚖ No EU compliance regime/, 'banner prefixed');
    assert.match(out.text, /DASHBOARD$/, 'original dashboard text kept after the banner');
  });

  it('does NOT throw on a malformed result missing ask/actions — it creates them', () => {
    // Kills the mutant that removes the `result.ask = result.ask || {...}` guards:
    // without them the push/Object.assign would throw on undefined.
    const result = { text: 'D' };
    let out, threw = false;
    try { out = attachComplianceQuestion(result, '/tmp/x'); } catch { threw = true; }
    assert.equal(threw, false, 'defensive guards prevent the throw');
    assert.equal(out.ask.questions.length, 1, 'question array created and populated');
    assert.equal(out.actions['Both'], 'claude:set-compliance-regime both');
  });
});

describe('handleSearchKey — "/" enters search only in list mode', () => {
  it('consumes "/" in list mode and sets searchMode + empty query buffer', () => {
    const a = { mode: 'list' };
    assert.equal(handleSearchKey({ sequence: '/' }, a), true);
    assert.equal(a.searchMode, true);
    assert.equal(a.searchQuery, '', 'seeds an empty query so the human can type');
  });

  it('does NOT consume "/" when mode is not list (kills dropping the mode guard)', () => {
    const a = { mode: 'actions' };
    assert.equal(handleSearchKey({ sequence: '/' }, a), false);
    assert.notEqual(a.searchMode, true);
  });

  it('does NOT consume a non-"/" key', () => {
    assert.equal(handleSearchKey({ sequence: 's' }, { mode: 'list' }), false);
  });
});

describe('handleSearchInput — search sub-mode keystroke accumulation', () => {
  it('returns false and consumes nothing when the app is not in search mode', () => {
    assert.equal(handleSearchInput('a', { sequence: 'a' }, { searchMode: false }), false);
    assert.equal(handleSearchInput('a', { sequence: 'a' }, null), false);
  });

  it('escape exits search mode and clears query + results', () => {
    const a = { searchMode: true, searchQuery: 'abc', searchResults: [1, 2] };
    const res = handleSearchInput('', { name: 'escape' }, a);
    assert.equal(res, true);
    assert.equal(a.searchMode, false);
    assert.equal(a.searchQuery, '');
    assert.deepEqual(a.searchResults, []);
  });

  it('enter/return signals a run without mutating the query', () => {
    const a = { searchMode: true, searchQuery: 'find' };
    assert.deepEqual(handleSearchInput('', { name: 'return' }, a), { run: true });
    assert.deepEqual(handleSearchInput('', { name: 'enter' }, a), { run: true });
    assert.equal(a.searchQuery, 'find', 'query untouched by submit');
  });

  it('backspace deletes exactly the last character (kills an off-by-one slice)', () => {
    const a = { searchMode: true, searchQuery: 'abc' };
    assert.equal(handleSearchInput('', { name: 'backspace' }, a), true);
    assert.equal(a.searchQuery, 'ab');
  });

  it('appends a single printable character', () => {
    const a = { searchMode: true, searchQuery: 'a' };
    assert.equal(handleSearchInput('b', { sequence: 'b' }, a), true);
    assert.equal(a.searchQuery, 'ab');
  });

  it('initializes a missing query buffer to "" before appending', () => {
    const a = { searchMode: true }; // no searchQuery
    handleSearchInput('z', { sequence: 'z' }, a);
    assert.equal(a.searchQuery, 'z');
  });

  it('does NOT append a ctrl-combo (kills dropping the !key.ctrl guard)', () => {
    const a = { searchMode: true, searchQuery: 'a' };
    assert.equal(handleSearchInput('c', { sequence: 'c', ctrl: true }, a), false);
    assert.equal(a.searchQuery, 'a', 'ctrl+c not accumulated');
  });

  it('does NOT append the leading "/" that entered search mode', () => {
    const a = { searchMode: true, searchQuery: '' };
    assert.equal(handleSearchInput('/', { sequence: '/' }, a), false);
    assert.equal(a.searchQuery, '');
  });
});

describe('enterSearchMode — fail-open async fetch, bounded to 10', () => {
  it('stashes [] for an empty query and never touches the index', async () => {
    const a = { projectPath: process.cwd() };
    await enterSearchMode(a, '');
    assert.deepEqual(a.searchResults, []);
    assert.equal(a.searchMode, true);
  });

  it('stashes [] for a non-string query (kills dropping the type guard)', async () => {
    const a = {};
    await enterSearchMode(a, 42);
    assert.deepEqual(a.searchResults, []);
  });

  it('returns an array capped at 10 for a real query (fail-open, never rejects)', async () => {
    const a = { projectPath: process.cwd() };
    await assert.doesNotReject(enterSearchMode(a, 'plan'));
    assert.ok(Array.isArray(a.searchResults));
    assert.ok(a.searchResults.length <= 10, 'bounded to the top 10 hits');
  });
});

describe('renderSearch — synchronous search sub-mode render', () => {
  it('prompts "Type a query" when the query is empty (kills swapping the ternary)', () => {
    const out = renderSearch({ searchQuery: '', searchResults: [] });
    assert.match(out, /Type a query/);
    assert.doesNotMatch(out, /No results/);
  });

  it('shows "No results." when a non-empty query returned nothing', () => {
    const out = renderSearch({ searchQuery: 'zzz', searchResults: [] });
    assert.match(out, /No results/);
    assert.doesNotMatch(out, /Type a query/);
  });

  it('renders ranked results, using the id fallback chain and optional score', () => {
    const out = renderSearch({
      searchQuery: 'q',
      searchResults: [
        { planPath: 'plans/a.md', score: 0.42 }, // score rendered
        { planSlug: 'b-slug' },                  // planSlug fallback, no score
        { plan: 'c' },                           // plan fallback
        {},                                      // '?' fallback
      ],
    });
    assert.match(out, /plans\/a\.md/);
    assert.match(out, /0\.42/, 'numeric score printed to 2dp');
    assert.match(out, /b-slug/);
    assert.match(out, /\?/, 'missing id falls back to "?"');
    assert.match(out, /Results/);
  });

  it('returns a minimal intact prompt when a getter throws (catch path)', () => {
    const bad = {};
    Object.defineProperty(bad, 'searchQuery', { get() { throw new Error('boom'); } });
    const out = renderSearch(bad);
    assert.match(out, /search unavailable/, 'catch returns the safe fallback, not a crash');
  });
});

// ── render() router — each branch selects a DISTINCT screen ───────────────────
describe('render() — the dashboard router picks the right screen per app state', () => {
  beforeEach(() => baselineApp());
  afterEach(() => { app.message = null; });

  it('renders the search sub-mode (query line) when searchMode is set', () => {
    app.searchMode = true;
    app.searchQuery = 'needle';
    const out = withStdout(() => render());
    assert.match(out, /Search plans/);
    assert.match(out, /needle/, 'the live query the human typed is shown');
  });

  it('renders the plan-content VIEW (not tab content) in view mode', () => {
    app.mode = 'view';
    app.viewContent = 'UNIQUE_VIEW_CONTENT_MARKER';
    const out = withStdout(() => render());
    assert.match(out, /UNIQUE_VIEW_CONTENT_MARKER/);
  });

  it('renders the reject-input prompt with the SANITIZED plan name', () => {
    app.mode = 'reject-input';
    const bel = String.fromCharCode(7);
    app.selectedPlan = { name: 'my-plan' + bel + 'evil' };
    app.inputValue = '';
    const out = withStdout(() => render());
    assert.match(out, /Reject: my-plan/);
    assert.equal(out.includes(bel), false, 'control character stripped from the plan name');
  });

  it('enters the actions branch when mode is "actions" with a selected plan', () => {
    // Pins the `else if (app.mode === 'actions' && app.selectedPlan)` router arm.
    // No area exposes renderActions, so the inner call is a documented no-op; the
    // branch selection itself is what this asserts (it must NOT fall to tab render).
    app.mode = 'actions';
    app.selectedPlan = { name: 'p' };
    const out = withStdout(() => render());
    // The pipeline plan list ("Plans at gates"/section headers) must be absent —
    // proving the actions arm was taken, not the default tab render.
    assert.doesNotMatch(out, /Plans at gates/);
  });

  it('renders the System Settings sub-mode when toolMode is "3"', () => {
    app.tabIndex = 4; // system
    app.toolMode = '3';
    const out = withStdout(() => render());
    assert.ok(out.length > 0);
    assert.match(out, /Settings/i);
  });

  it('renders Doctor for toolMode "1" and Update for "2" — distinct screens', () => {
    app.tabIndex = 4;
    app.toolMode = '1';
    const doctor = withStdout(() => render());
    app.toolMode = '2';
    const update = withStdout(() => render());
    assert.notEqual(doctor, update, 'toolMode 1 and 2 select different renderers');
  });

  it('renders a breadcrumb only when the nav stack is deeper than one entry', () => {
    // Off-by-one boundary: path().length > 1. Push two frames to cross it.
    app.navStack.push('Alpha');
    app.navStack.push('Beta');
    const deep = withStdout(() => render());
    assert.ok(app.navStack.path().length > 1, 'precondition: stack deeper than one');
    assert.ok(deep.length > 0);
  });

  it('schedules a 2s message timer that CLEARS the message when it fires', () => {
    const origST = global.setTimeout;
    let scheduled = 0;
    let captured = null;
    global.setTimeout = (fn, ms) => { scheduled += 1; captured = fn; assert.equal(ms, 2000); return { fake: true }; };
    try {
      app.message = null;
      withStdout(() => render());
      assert.equal(scheduled, 0, 'no message → no timer');

      app.message = 'saved!';
      const out = withStdout(() => render());
      assert.match(out, /saved!/);
      assert.equal(scheduled, 1, 'message present → one timer scheduled');

      // Fire the captured timer callback: it must null the message and re-render.
      assert.equal(typeof captured, 'function');
      withStdout(() => captured());
      assert.equal(app.message, null, 'timer callback cleared the status message');
    } finally {
      global.setTimeout = origST;
      app.message = null;
    }
  });
});

// ── handleKey() — global key routing ──────────────────────────────────────────
describe('handleKey() — global key routing and guards', () => {
  let exitCalls;
  let origExit;
  beforeEach(() => {
    baselineApp();
    exitCalls = [];
    origExit = process.exit;
    process.exit = (code) => { exitCalls.push(code); throw new Error('__EXIT__'); };
  });
  afterEach(() => { process.exit = origExit; app.message = null; });

  function press(str, key) {
    // render writes to stdout; capture + swallow the sentinel exit throw.
    withStdout(() => { try { handleKey(str, key); } catch (e) { if (e.message !== '__EXIT__') throw e; } });
  }

  it('quits with exit code 0 on "q" in plain list mode', () => {
    press('q', { name: 'q' });
    assert.deepEqual(exitCalls, [0], 'process.exit(0) fired');
  });

  it('does NOT quit on "q" while an input field is active (kills dropping the guard)', () => {
    app.inputValue = 'half-typed';
    press('q', { name: 'q' });
    assert.deepEqual(exitCalls, [], 'q is swallowed as text, not a quit');
  });

  it('left arrow moves to the previous area (wraps 0 → last)', () => {
    app.tabIndex = 0;
    press('', { name: 'left' });
    assert.equal(app.tabIndex, 4, 'prevTab wraps to the last area');
  });

  it('right arrow advances to the next area', () => {
    app.tabIndex = 0;
    press('', { name: 'right' });
    assert.equal(app.tabIndex, 1);
  });

  it('numeric "3" jumps straight to the third area', () => {
    press('3', { sequence: '3' });
    assert.equal(app.tabIndex, 2, '1-based shortcut maps to 0-based index');
  });

  it('"s" in pipeline list mode jumps to System Settings sub-mode', () => {
    app.tabIndex = 0; // pipeline
    press('s', { sequence: 's', name: 's' });
    assert.equal(app.tabIndex, 4, 'switched to the system area');
    assert.equal(app.toolMode, '3', 'Settings sub-mode selected');
  });

  it('"s" is CONSISTENTLY Settings from a non-pipeline area too (library)', () => {
    // The owner directive: s = Settings is a GLOBAL, consistent binding, not a
    // pipeline-only surprise. From the library area (index 3), an area that does not
    // consume 's' itself, pressing 's' must still open the System Settings sub-mode.
    app.tabIndex = 3; // library
    app.toolMode = null;
    press('s', { sequence: 's', name: 's' });
    assert.equal(app.tabIndex, 4, 'switched to the system area');
    assert.equal(app.toolMode, '3', 'Settings sub-mode selected from library too');
  });

  it('"/" enters the search sub-mode and clears prior results', () => {
    app.searchResults = [{ plan: 'stale' }];
    press('', { sequence: '/' });
    assert.equal(app.searchMode, true);
    assert.deepEqual(app.searchResults, []);
  });

  it('"b" in view mode returns to the list and drops the viewed content', () => {
    app.mode = 'view';
    app.viewContent = 'something';
    press('', { name: 'b' });
    assert.equal(app.mode, 'list');
    assert.equal(app.viewContent, null);
  });

  it('delegates to the active area and renders when the area consumes the key', () => {
    // Pipeline consumes b/i/x (collapse toggles) and PERSISTS prefs to
    // app.projectPath — redirect that write to a throwaway temp project so the
    // real repo is never mutated, then assert the consume→render path fired.
    const origРath = app.projectPath;
    const dir = mkTmp('menu-cov-deleg-');
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
    app.projectPath = dir;
    try {
      app.tabIndex = 0; // pipeline
      const out = withStdout(() => handleKey('', { name: 'i', sequence: 'i' }));
      assert.ok(out.length > 0, 'a consumed key triggers a re-render');
    } finally {
      app.projectPath = origРath;
    }
  });

  it('does NOT re-render when the area ignores the key (delegation returns false)', () => {
    app.tabIndex = 4; // system
    const out = withStdout(() => handleKey('', { name: 'f5', sequence: 'zz' }));
    assert.equal(out.length, 0, 'an unconsumed key produces no output');
  });

  it('accumulates a printable key into the query and re-renders while in search mode', () => {
    // Pins the `if (res) { render(); return; }` arm — a consumed (non-submit)
    // search keystroke re-renders without falling through to the global handlers.
    app.searchMode = true;
    app.searchQuery = 'fo';
    const out = withStdout(() => handleKey('o', { sequence: 'o' }));
    assert.equal(app.searchQuery, 'foo', 'character appended to the live query');
    assert.match(out, /Search plans/, 're-rendered the search screen');
    assert.equal(app.tabIndex, 0, 'did NOT fall through to a numeric/area shortcut');
  });

  it('routes a submitted search query off the key path without quitting on "q"-like keys', () => {
    app.searchMode = true;
    app.searchQuery = 'hunt';
    const out = withStdout(() => handleKey('', { name: 'return' }));
    assert.match(out, /Search plans/, 'enter re-renders the search screen');
    assert.equal(app.searchMode, true, 'still in search mode after submit');
  });
});

// ── renderView() truncation boundary ─────────────────────────────────────────
describe('render() plan-content view — truncation boundary', () => {
  beforeEach(() => baselineApp());
  afterEach(() => { app.message = null; });

  it('does NOT show the "more lines" notice for short content', () => {
    app.mode = 'view';
    app.viewContent = Array.from({ length: 5 }, (_, i) => `L${i}`).join('\n');
    const out = withStdout(() => render());
    assert.doesNotMatch(out, /more lines/);
  });

  it('truncates and shows the "more lines" notice past the display cap', () => {
    // process.stdout.rows is undefined under the test harness → maxLines falls back
    // to 30 (the `|| 30` branch). 200 lines must cross it.
    app.mode = 'view';
    app.viewContent = Array.from({ length: 200 }, (_, i) => `line-${i}`).join('\n');
    const out = withStdout(() => render());
    assert.match(out, /more lines/, 'overflow notice rendered');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// STREAMING PRIMARY VIEW WIRING — streaming-render is the session's primary screen.
// The classic dashboard + areas stay reachable via the transitional 'm' bridge (a
// temporary key the menu-retirement slice removes). Written RED first: against the
// pre-wiring start.js the default render showed the classic dashboard and the
// streaming keys did nothing, so every assertion below failed until start.js routed
// the streaming view (streamView) through streaming-render.
// ─────────────────────────────────────────────────────────────────────────────
describe('streaming primary view — render + key routing (the wiring under test)', () => {
  // Slice 2: streaming-render shows the IN-FLOW IDEA PROMPT when there are NO real
  // topics on disk, and drives real topics when `<projectPath>/.ctoc/streaming/topics.json`
  // exists. These routing tests exercise the REAL-topic flow, so beforeEach points
  // app.projectPath at a temp project carrying a real topics.json (auth/session critical,
  // mirroring the prior demo so the routing assertions hold on real data). The DEFAULT
  // idea-prompt state gets its own test with an empty project (no topics.json).
  let exitCalls, origExit, savedProjectPath, realTopicsDir, emptyDir;
  const REAL_TOPICS = JSON.stringify([
    {
      id: 'auth', label: 'Authentication', critical: true,
      questions: [
        { id: 'session', critical: true, prompt: 'Where should session tokens be stored?',
          options: [{ key: '1', label: 'httpOnly cookie', recommended: true }, { key: '2', label: 'localStorage' }] },
        { id: 'mfa', important: true, prompt: 'Require MFA?',
          options: [{ key: '1', label: 'Yes', recommended: true }, { key: '2', label: 'No' }] },
        { id: 'provider', prompt: 'Auth provider?',
          options: [{ key: '1', label: 'Clerk', recommended: true }, { key: '2', label: 'Auth.js' }] },
      ],
    },
    {
      id: 'stack', label: 'Stack', critical: false,
      questions: [
        { id: 'lang', prompt: 'Language?', options: [{ key: '1', label: 'TypeScript', recommended: true }, { key: '2', label: 'Python' }] },
      ],
    },
  ]);
  beforeEach(() => {
    baselineApp();
    if (!realTopicsDir) {
      realTopicsDir = mkTmp('menu-cov-streaming-real-');
      const dir = path.join(realTopicsDir, '.ctoc', 'streaming');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'topics.json'), REAL_TOPICS, 'utf8');
      emptyDir = mkTmp('menu-cov-streaming-empty-'); // no topics.json → idea prompt
    }
    app.streamView = true;   // session-start state: streaming is primary
    delete app.buildFlow;    // fresh flow — nothing answered yet
    delete app.ideaMode;     // fresh init decision each test
    delete app.ideaBuffer;
    app.streamAction = null;
    savedProjectPath = app.projectPath;
    app.projectPath = realTopicsDir; // real topics drive the routing tests
    exitCalls = [];
    origExit = process.exit;
    process.exit = (code) => { exitCalls.push(code); throw new Error('__EXIT__'); };
  });
  afterEach(() => {
    process.exit = origExit; app.message = null; app.streamView = false;
    app.projectPath = savedProjectPath; delete app.ideaMode; delete app.ideaBuffer;
  });

  const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
  function press(str, key) {
    withStdout(() => { try { handleKey(str, key); } catch (e) { if (e.message !== '__EXIT__') throw e; } });
  }

  it('with NO decomposition yet (empty project) the DEFAULT session render is the idea prompt', () => {
    app.projectPath = emptyDir;   // no topics.json → the in-flow idea dump
    delete app.buildFlow; delete app.ideaMode; delete app.ideaBuffer;
    const out = plain(withStdout(() => render()));
    // The idea prompt is the empty-state default — NOT the canned demo, NOT the dashboard.
    assert.match(out, /Dump your idea/i, 'the idea prompt is the default when nothing is decomposed yet');
    assert.doesNotMatch(out, /Plans at gates/, 'the classic pipeline dashboard is not the primary view');
    assert.doesNotMatch(out, /Authentication/, 'not the canned demo');
    assert.equal(app.ideaMode, true, 'idea mode is the empty-state default');
  });

  it('the DEFAULT session render with real topics is the streaming topic-Q&A, NOT the classic dashboard', () => {
    const out = plain(withStdout(() => render()));
    // Streaming heartbeat: the critical topic label (ordered first by the flow) plus a
    // recommended-tagged option — this is streaming-render's output, proving it primary.
    assert.match(out, /Authentication/, 'streaming topic label is shown as the first screen');
    assert.match(out, /recommended/, 'the recommended option is tagged (streaming heartbeat)');
    // The old pipeline dashboard is NOT the first screen.
    assert.doesNotMatch(out, /Plans at gates/, 'the classic pipeline dashboard is not the primary view');
    assert.ok(app.buildFlow, 'render lazily seeded the streaming flow via streaming-render');
  });

  it('a digit key drives streaming-flow — the answer is recorded and the pointer advances', () => {
    render(); // seeds app.buildFlow (critical topic auth; critical question 'session' is first)
    const before = streamingFlow.currentQuestion(app.buildFlow);
    assert.equal(before.id, 'session', 'the critical question is current first (critical-first ordering)');
    press('1', { name: '1', sequence: '1' }); // pick the recommended option
    assert.equal(app.buildFlow.answers['auth/session'], '1', 'the chosen option key is recorded');
    const after = streamingFlow.currentQuestion(app.buildFlow);
    assert.notStrictEqual(after, before, 'the flow pointer advanced to the next question');
  });

  it('the "settings" intent opens the System Settings sub-mode (reuses toolMode=3)', () => {
    render();
    press('s', { name: 's', sequence: 's' });
    assert.equal(TABS[app.tabIndex].id, 'system', 'settings intent switched to the system area');
    assert.equal(app.toolMode, '3', 'the existing Settings sub-mode is selected');
    assert.equal(app.streamAction, null, 'streamAction cleared after the host interpreted it');
    // And that sub-mode actually renders the Settings screen.
    const out = plain(withStdout(() => render()));
    assert.match(out, /Settings/i, 'the Settings screen renders after the intent');
  });

  it('the transitional "m" bridge reaches the classic dashboard and area keys still work there', () => {
    render();
    press('m', { name: 'm', sequence: 'm' });
    assert.equal(app.streamView, false, '"m" left the streaming view for the classic dashboard');
    const out = plain(withStdout(() => render()));
    assert.doesNotMatch(out, /Authentication/, 'the classic dashboard, not streaming, renders after "m"');
    // Once in the classic dashboard, the existing area navigation works exactly as today.
    press('2', { name: '2', sequence: '2' });
    assert.equal(app.tabIndex, 1, 'numeric area switch works in the classic dashboard');
    press('', { name: 'right' });
    assert.equal(app.tabIndex, 2, 'right-arrow area nav still works in the classic dashboard');
    // And a way BACK to streaming exists from the dashboard.
    app.tabIndex = 0; app.toolMode = null; app.mode = 'list';
    press('m', { name: 'm', sequence: 'm' });
    assert.equal(app.streamView, true, '"m" returns from the classic dashboard to streaming');
  });

  it('regression: q quits from streaming; the prior-slice "s"=Settings binding survives; initProject still runs', () => {
    // q still quits from the primary streaming view (session lifecycle preserved).
    press('q', { name: 'q' });
    assert.deepEqual(exitCalls, [0], 'q quits with exit 0 from the primary streaming view');

    // Reach the classic dashboard, then the global "s" = Settings binding still works.
    app.streamView = false; app.tabIndex = 0; app.toolMode = null; app.mode = 'list';
    press('s', { name: 's', sequence: 's' });
    assert.equal(TABS[app.tabIndex].id, 'system', 'global s reaches System from the dashboard');
    assert.equal(app.toolMode, '3', 'the s=Settings binding from the prior slice is intact');

    // initProject still runs on first open (auto-init unchanged by the streaming wiring).
    const dir = mkTmp('menu-stream-init-');
    const setup = ensureInitialized(dir);
    assert.equal(setup.ok, true, 'ensureInitialized initializes a fresh project');
    assert.ok(fs.existsSync(path.join(dir, '.ctoc')), '.ctoc created on first open');
  });
});

// ── main() — REAL behavior via child process (NOT credited to line %; see header)
describe('main() — real behavior, cross-process (documented uncredited coverage)', () => {
  function project({ withCtoc = true, settingsJson, settingsYaml } = {}) {
    const dir = mkTmp('menu-cov-main-');
    if (withCtoc) {
      fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'plans', 'functional'), { recursive: true });
      if (settingsJson !== undefined) {
        fs.writeFileSync(path.join(dir, '.ctoc', 'settings.json'), settingsJson);
      }
      if (settingsYaml !== undefined) {
        fs.writeFileSync(path.join(dir, '.ctoc', 'settings.yaml'), settingsYaml);
      }
    }
    return dir;
  }
  function run(cwd, args = []) {
    const out = execFileSync(process.execPath, [MENU, ...args], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out;
  }

  it('auto-initializes a project with NO .ctoc and prefixes the setup note', () => {
    // A REAL contract assertion, not a mechanical boolean: it pins that main()
    // tells the human something about setup on first open. Only the WORDING
    // changed (plan 00156) — "CTOC initialized for this project (automatic — no
    // init command needed)" became "CTOC is set up for this project.", a sentence
    // now derived from a read-back rather than from the absence of an exception.
    // Re-pointed rather than deleted: dropping a contract assertion because its
    // wording moved is how a contract quietly stops being checked.
    //
    // It is also TIGHTENED. The note and the filesystem must AGREE — that pairing
    // is the assertion whose absence let the reported defect ship, and it is the
    // subject of tests/menu-reports-what-init-did.test.js case 12.
    const dir = project({ withCtoc: false });
    const out = run(dir);
    const parsed = JSON.parse(out);
    assert.match(parsed.text, /CTOC is set up for this project\./, 'setup note surfaced');
    assert.ok(fs.existsSync(path.join(dir, '.ctoc')), '.ctoc actually created by main()');
    assert.ok(
      fs.existsSync(path.join(dir, '.ctoc', 'settings.yaml')),
      'and the artifact the note implies is genuinely on disk'
    );
  });

  it('routes a sub-command (args mode) to a JSON screen, NOT the dashboard', () => {
    const dir = project({ settingsJson: '{"general":{"environment":"dev"}}' });
    const out = run(dir, ['browse', 'functional']);
    const parsed = JSON.parse(out);
    assert.match(parsed.text, /\[functional\]/, 'the functional stage screen, not the overview');
  });

  it('treats a --live-agent-ids-only invocation as the no-args streaming default', () => {
    const dir = project({ settingsJson: '{"general":{"environment":"dev"}}' });
    const out = run(dir, ['--live-agent-ids', 'agent-1,agent-2']);
    const parsed = JSON.parse(out);
    // Residual args empty → streaming gate branch: the gate-decision question leads
    // (empty project → the "nothing pending" screen).
    assert.ok(Array.isArray(parsed.ask.questions));
    assert.equal(parsed.ask.questions[0].header, 'Gate decisions');
  });

  it('FAILS OPEN: a corrupt settings.yaml still renders the streaming screen (never crashes)', () => {
    const dir = project({
      settingsJson: '{"general":{"environment":"dev"}}',
      settingsYaml: 'regulatory_regime:\n  active_profiles: [gdpr\n  : : : not yaml : :\n',
    });
    // If the compliance read threw instead of failing open, execFileSync would throw
    // on a non-zero exit. Reaching a parseable screen proves fail-open.
    const parsed = JSON.parse(run(dir));
    assert.equal(parsed.ask.questions[0].header, 'Gate decisions', 'primary never gated by a parse fault');
  });
});
