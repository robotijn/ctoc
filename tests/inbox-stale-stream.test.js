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
// S3: spy the full set of mutating fs calls (not just writeFileSync) so a
// render path that appends/renames/removes/mkdirs is caught too.
const MUTATING_FS = ['writeFileSync', 'appendFileSync', 'rmSync', 'renameSync', 'unlinkSync', 'mkdirSync'];
let root, calls, wroteCount, mutations, realFs;

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
  root = tempProject(); // mkdir during setup happens BEFORE spies install ⇒ uncounted
  calls = [];
  invalidate('getInboxCounts'); // bust memoize before each test
  // read-only spies (S3): count ALL mutating fs calls during render paths.
  // mutations = aggregate across the full set; wroteCount kept for the existing
  // writeFileSync-scoped assertions.
  wroteCount = 0;
  mutations = 0;
  realFs = {};
  for (const fn of MUTATING_FS) {
    const orig = fs[fn];
    realFs[fn] = orig;
    fs[fn] = (...a) => {
      mutations++;
      if (fn === 'writeFileSync') wroteCount++;
      return orig.apply(fs, a);
    };
  }
});

afterEach(() => {
  staleDetector.scanCheapCandidates = realScan; // restore boundary
  for (const fn of MUTATING_FS) fs[fn] = realFs[fn]; // restore all spies
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

describe('SP2 — drill-in hardening (S1 control-char strip, S4 list cap)', () => {
  it('S1: strips ANSI/control chars from a hostile plan slug (no ESC, no mid-row newline)', () => {
    mockScan({
      candidates: [
        { plan: 'evil\x1b[2Jboom\ninjected', stage: 'func\x1btional', signals: ['miss\ning-files'], actionable: true },
        { plan: 'ok', stage: 'review', signals: ['advisory:age'], actionable: false },
      ],
      count: 2,
    });
    const screen = inboxStalePlansDrillIn(root);
    const t = screen.text;
    // No raw ESC anywhere
    assert.ok(!t.includes('\x1b'), 'rendered text must contain no ESC byte');
    // The sanitized slug content survives, the control bytes are gone
    assert.ok(t.includes('evil[2Jboominjected') || t.includes('evilboominjected') || /evil.*boom.*injected/.test(t.replace(/\n/g, '')), 'slug text survives minus control chars');
    // Each candidate is exactly ONE row: the hostile newline must not split a row.
    // Count bullet rows — must equal candidate count (2), not more.
    const bulletRows = t.split('\n').filter((l) => l.trimStart().startsWith('•'));
    assert.equal(bulletRows.length, 2, 'hostile \\n must not forge an extra row');
    // No control bytes (C0/C1) survive in the body at all.
    assert.ok(!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(t), 'no C0/C1 control bytes in rendered text');
  });

  it('S4: caps the cold-path list at 20 rows and summarizes the rest', () => {
    const N = 27;
    const candidates = Array.from({ length: N }, (_, i) => ({
      plan: `p${i}`, stage: 'functional', signals: ['missing-files'], actionable: true,
    }));
    mockScan({ candidates, count: N });
    const screen = inboxStalePlansDrillIn(root);
    const bulletRows = screen.text.split('\n').filter((l) => l.trimStart().startsWith('•'));
    assert.equal(bulletRows.length, 20, 'at most 20 candidate rows render');
    assert.ok(screen.text.includes(`… and ${N - 20} more`), 'surplus summarized on one line');
    // The header still reports the TRUE total, not the capped count.
    assert.ok(screen.text.includes(`Possibly-stale plans (${N})`), 'header shows true total');
  });

  it('S4: no "… and N more" line when count is at or below the cap', () => {
    const candidates = Array.from({ length: 20 }, (_, i) => ({
      plan: `p${i}`, stage: 'functional', signals: ['advisory:age'], actionable: false,
    }));
    mockScan({ candidates, count: 20 });
    const screen = inboxStalePlansDrillIn(root);
    assert.ok(!/… and \d+ more/.test(screen.text), 'no overflow line at exactly the cap');
  });
});

describe('SP2 — memoization single-scan (L3)', () => {
  it('scans exactly once per 5s memoize window (two getInboxCounts calls, no invalidate between)', () => {
    mockScan({ candidates: [], count: 4 });
    const before = calls.length;
    getInboxCounts(root); // first call computes ⇒ one scan
    getInboxCounts(root); // second call within window ⇒ cache hit, NO scan
    assert.equal(calls.length - before, 1, 'scanCheapCandidates runs exactly once per memoize window');
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
    const beforeMut = mutations;
    inboxStalePlansDrillIn(root);
    route(['inbox', 'stale'], root);
    assert.equal(wroteCount - before, 0, 'candidate-render path must be read-only (writes)');
    assert.equal(
      mutations - beforeMut,
      0,
      'no mutating fs call (write/append/rm/rename/unlink/mkdir) across drill-in + route(inbox stale)'
    );
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
  it('menu.md documents the stale-first precedence rule, anchored in Rule 10 itself', () => {
    const mdPath = path.join(__dirname, '..', 'src', 'commands', 'menu.md');
    const md = fs.readFileSync(mdPath, 'utf8');
    // H1: anchor on Rule 10's own heading, not the first /precedence/ match. The
    // env action-entry clause at :53 independently contains "Stale plans",
    // "inbox stale", and "precedence" and matches FIRST, so a ±window around the
    // first keyword false-greens even with Rule 10 deleted. Slicing from Rule
    // 10's index guarantees the env clause (lower index) cannot satisfy this.
    const rule10 = /^10\.\s+\*\*Stale-plans question rides along, navigates with precedence/m;
    assert.match(md, rule10, 'menu.md must contain Rule 10 with its precedence heading');
    const m = rule10.exec(md);
    const body = md.slice(m.index, m.index + 1200); // Rule 10 body only — env clause at :53 cannot satisfy this
    assert.ok(/inbox stale/.test(body),       'Rule 10 must name the inbox stale route');
    assert.ok(/takes precedence/i.test(body), 'Rule 10 must state precedence semantics');
    assert.ok(/View stale plans/.test(body),  'Rule 10 must name the View stale plans option');
  });
});
