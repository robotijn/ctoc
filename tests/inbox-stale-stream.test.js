/**
 * SP2 — Possibly-stale plans Inbox stream
 *
 * Boundary-mock strategy (chosen seam, documented in the plan §6.4):
 * rewire `scanCheapCandidates` on the LIVE `stale-detector` module object (a
 * require-cache-level rewire of the real module's export), NOT a placeholder
 * stub file (M6). This works because `inbox.js` calls
 * `staleDetector.scanCheapCandidates(...)` LATE-BOUND via a namespace import
 * (§6.1). The original export is captured once and restored in afterEach so the
 * rewire never leaks. Node runs each tests/*.test.js in its own process, giving
 * file-level isolation as a second guard.
 *
 * Memoize busting: each test uses a UNIQUE mkdtemp root AND calls
 * cache.invalidate('getInboxCounts') in beforeEach/afterEach.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const staleDetector = require('../src/lib/stale-detector'); // real module — rewired, not stubbed
const { invalidate } = require('../src/lib/cache');
const { getInboxCounts, listStaleCandidates } = require('../src/lib/inbox');
const {
  buildDashboardTable,
  dashboardPipeline,
  inboxStalePlansDrillIn,
  route,
} = require('../src/lib/menu-screens');

const realScan = staleDetector.scanCheapCandidates; // capture once
let root, calls, realWrite, wroteCount;

function tempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-sp2-')); // cross-platform sandbox
  for (const s of ['functional', 'implementation', 'review', 'todo', 'in-progress', 'done']) {
    fs.mkdirSync(path.join(dir, 'plans', s), { recursive: true });
  }
  fs.mkdirSync(path.join(dir, '.ctoc', 'inbox', 'questions'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.ctoc', 'inbox', 'decisions'), { recursive: true });
  return dir;
}

function mockScan(result) {
  // records args → lets tests assert the seam contract (boundary receives root)
  staleDetector.scanCheapCandidates = (r, opts) => {
    calls.push({ r, opts });
    return result;
  };
}

beforeEach(() => {
  root = tempProject();
  calls = [];
  invalidate('getInboxCounts'); // bust memoize before each test
  // read-only spy: count real writes during render paths
  wroteCount = 0;
  realWrite = fs.writeFileSync;
  fs.writeFileSync = (...a) => {
    wroteCount++;
    return realWrite(...a);
  };
});

afterEach(() => {
  staleDetector.scanCheapCandidates = realScan; // restore boundary
  fs.writeFileSync = realWrite; // restore spy
  invalidate('getInboxCounts');
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
});

describe('SP2 — getInboxCounts staleCandidates (M1 / Scenario 1)', () => {
  it('returns staleCandidates from scanCheapCandidates(root).count and preserves existing keys', () => {
    mockScan({
      candidates: [{ plan: 'foo', stage: 'functional', signals: ['missing-files'], actionable: true }],
      count: 1,
    });
    const counts = getInboxCounts(root);
    assert.equal(counts.staleCandidates, 1);
    assert.equal(typeof counts.staleCandidates, 'number');
    // existing keys unchanged in value and type (empty temp project ⇒ 0)
    assert.equal(counts.questions, 0);
    assert.equal(counts.decisions, 0);
    assert.equal(counts.gatesWaiting, 0);
    assert.equal(typeof counts.questions, 'number');
    assert.equal(typeof counts.decisions, 'number');
    assert.equal(typeof counts.gatesWaiting, 'number');
    // boundary receives the project root
    assert.ok(calls.length >= 1, 'scanCheapCandidates must be called');
    assert.equal(calls[0].r, root);
  });

  it('rewires the REAL stale-detector module, not a stub (M6)', () => {
    assert.equal(typeof realScan, 'function');
    mockScan({ candidates: [], count: 0 });
    // while mocked the live export differs from the captured real export
    assert.notEqual(staleDetector.scanCheapCandidates, realScan);
    getInboxCounts(root);
    // restore happens in afterEach; verify the captured original is the real impl
    assert.equal(realScan.name, 'scanCheapCandidates');
  });

  it('listStaleCandidates returns the .candidates array from the real module boundary', () => {
    const cands = [
      { plan: 'a', stage: 'functional', signals: ['advisory:age'], actionable: false },
    ];
    mockScan({ candidates: cands, count: 1 });
    const out = listStaleCandidates(root);
    assert.deepEqual(out, cands);
    assert.equal(calls[0].r, root);
  });
});

describe('SP2 — buildDashboardTable + dashboardPipeline (M2 / Scenario 3)', () => {
  it('renders the possibly-stale line and attaches the ride-along stale question when count > 0', () => {
    mockScan({ candidates: [], count: 3 });
    const text = buildDashboardTable(root);
    assert.ok(text.includes('3 possibly-stale plans'), 'INBOX block must show "3 possibly-stale plans"');

    invalidate('getInboxCounts'); // fresh read for the pipeline call
    mockScan({ candidates: [], count: 3 });
    const pipeline = dashboardPipeline(root);
    assert.equal(pipeline.ask.questions.length, 2);
    const q2 = pipeline.ask.questions[1];
    assert.equal(q2.header, 'Stale plans');
    assert.deepEqual(q2.options.map((o) => o.label), ['View stale plans', 'Not now']);
    assert.equal(pipeline.actions['View stale plans'], 'inbox stale');
    assert.equal(pipeline.actions['Not now'], '');
    // first (pipeline) question unchanged: 4 options
    assert.equal(pipeline.ask.questions[0].header, 'Pipeline');
    assert.equal(pipeline.ask.questions[0].options.length, 4);
  });
});

describe('SP2 — zero-count hiding (M3 / Scenario 2)', () => {
  it('omits the possibly-stale line and the ride-along question when count === 0', () => {
    mockScan({ candidates: [], count: 0 });
    const text = buildDashboardTable(root);
    assert.ok(!text.includes('possibly-stale'), 'no possibly-stale text at zero count');

    invalidate('getInboxCounts');
    mockScan({ candidates: [], count: 0 });
    const pipeline = dashboardPipeline(root);
    assert.equal(pipeline.ask.questions.length, 1);
    assert.ok(!('View stale plans' in pipeline.actions), 'no stale action at zero count');
  });

  it('sibling streams still print their 0 values when another inbox item is present', () => {
    // gatesWaiting will be 1 (a plan in functional), staleCandidates 0 ⇒
    // inboxTotal > 0 ⇒ the three sibling lines (incl. their 0s) print, but
    // the possibly-stale line is hidden.
    fs.writeFileSync(path.join(root, 'plans', 'functional', 'p.md'), '# p\n');
    mockScan({ candidates: [], count: 0 });
    const text = buildDashboardTable(root);
    assert.ok(text.includes('morning question'), 'questions line prints even at 0');
    assert.ok(text.includes('decision'), 'decisions line prints even at 0');
    assert.ok(text.includes('at gates'), 'gates line prints');
    assert.ok(!text.includes('possibly-stale'), 'possibly-stale line hidden at 0');
  });
});

describe('SP2 — inboxStalePlansDrillIn (M4 / Scenario 4)', () => {
  it('lists candidates with slug/stage/signals + actionable|advisory label, ◀ Back only, no writes', () => {
    mockScan({
      candidates: [
        { plan: 'alpha', stage: 'functional', signals: ['missing-files'], actionable: true },
        { plan: 'beta', stage: 'review', signals: ['advisory:age'], actionable: false },
      ],
      count: 2,
    });
    const before = wroteCount;
    const screen = inboxStalePlansDrillIn(root);
    const t = screen.text;
    assert.ok(t.includes('alpha'));
    assert.ok(t.includes('functional'));
    assert.ok(t.includes('missing-files'));
    assert.ok(t.includes('actionable'));
    assert.ok(t.includes('beta'));
    assert.ok(t.includes('review'));
    assert.ok(t.includes('advisory:age'));
    assert.ok(t.includes('advisory'));
    assert.deepEqual(screen.actions, { '◀ Back': '' });
    assert.equal(wroteCount - before, 0, 'drill-in render must perform no writes');
  });

  it('honors the menu return contract: text ends with \\n\\n\\n and no inputMode', () => {
    mockScan({ candidates: [], count: 0 });
    const screen = inboxStalePlansDrillIn(root);
    assert.ok(screen.text.endsWith('\n\n\n'));
    assert.equal(screen.inputMode, undefined);
    assert.ok(screen.text.includes('No possibly-stale plans'));
  });
});

describe('SP2 — route dispatch (M5)', () => {
  it('route(["inbox","stale"]) dispatches to the drill-in (reachable, no slash command)', () => {
    mockScan({
      candidates: [{ plan: 'alpha', stage: 'functional', signals: ['missing-files'], actionable: true }],
      count: 1,
    });
    const screen = route(['inbox', 'stale'], root);
    assert.equal(screen.ask.questions[0].header, 'Stale plans');
    assert.deepEqual(screen.actions, { '◀ Back': '' });
  });

  it('route(["inbox","bogus"]) falls back to the dashboard pipeline', () => {
    mockScan({ candidates: [], count: 0 });
    const screen = route(['inbox', 'bogus'], root);
    assert.equal(screen.ask.questions[0].header, 'Pipeline');
  });
});

describe('SP2 — read-only candidate-render path (Scenario 5, F5-scoped delta)', () => {
  it('inboxStalePlansDrillIn + route(inbox stale) perform zero writes (scoped delta)', () => {
    mockScan({
      candidates: [
        { plan: 'alpha', stage: 'functional', signals: ['missing-files'], actionable: true },
      ],
      count: 1,
    });
    const before = wroteCount;
    inboxStalePlansDrillIn(root);
    route(['inbox', 'stale'], root);
    assert.equal(wroteCount - before, 0, 'candidate-render path must be read-only');
  });
});

describe('SP2 — menu discipline (Scenario 6, both screens)', () => {
  it('no digit-only actions key maps to a stale route; only "View stale plans" routes to inbox stale', () => {
    mockScan({ candidates: [], count: 3 });
    const pipeline = dashboardPipeline(root);
    const digitKeys = Object.keys(pipeline.actions).filter((k) => /^\d+$/.test(k));
    assert.equal(digitKeys.length, 0, 'no digit-only key in dashboardPipeline actions');
    const staleRouteKeys = Object.entries(pipeline.actions)
      .filter(([, v]) => v === 'inbox stale')
      .map(([k]) => k);
    assert.deepEqual(staleRouteKeys, ['View stale plans']);

    invalidate('getInboxCounts');
    mockScan({
      candidates: [{ plan: 'a', stage: 'functional', signals: ['missing-files'], actionable: true }],
      count: 1,
    });
    const drill = inboxStalePlansDrillIn(root);
    const drillDigitKeys = Object.keys(drill.actions).filter((k) => /^\d+$/.test(k));
    assert.equal(drillDigitKeys.length, 0, 'no digit-only key in drill-in actions');
    assert.ok(!Object.values(drill.actions).includes('inbox stale'), 'drill-in has no inbox stale key');
  });
});

describe('SP2 — pluralization edge (count === 1)', () => {
  it('renders singular "1 possibly-stale plan" and a singular ride-along prompt', () => {
    mockScan({ candidates: [], count: 1 });
    const text = buildDashboardTable(root);
    assert.ok(text.includes('1 possibly-stale plan'));
    assert.ok(!text.includes('1 possibly-stale plans'), 'no trailing s on singular count');

    invalidate('getInboxCounts');
    mockScan({ candidates: [], count: 1 });
    const pipeline = dashboardPipeline(root);
    assert.equal(
      pipeline.ask.questions[1].question,
      '1 possibly-stale plan detected — view them?'
    );
  });
});

describe('SP2 — doc-contract: menu.md stale-first precedence rule (F1 reachability guard)', () => {
  it('menu.md documents the stale-first precedence rule, co-located in one rule', () => {
    const mdPath = path.join(__dirname, '..', 'src', 'commands', 'menu.md');
    const md = fs.readFileSync(mdPath, 'utf8');
    assert.match(md, /Stale plans/, 'menu.md must name the Stale plans ride-along question');
    assert.match(md, /inbox stale/, 'menu.md must name the inbox stale route');
    assert.match(md, /precedence|takes precedence|wins/i, 'menu.md must state precedence semantics');
    // Co-location: a ±700-char window around the precedence keyword must ALSO
    // contain both "Stale plans" and "inbox stale" — proving these belong to ONE
    // rule, not three scattered mentions that could each survive a regression.
    const m = /precedence|takes precedence|wins/i.exec(md);
    const window = md.slice(Math.max(0, m.index - 700), m.index + 700);
    assert.ok(
      /Stale plans/.test(window) && /inbox stale/.test(window),
      'the stale-first precedence rule must mention "Stale plans" and "inbox stale" together'
    );
  });
});
