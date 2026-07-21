/**
 * PI4-s4 — UI wiring tests (menu search shortcut, overview Related Plans panel,
 * inbox related surfacing). Hermetic: the barrel retrieval API
 * (`search`/`related`/`getWiring`) is stubbed via require-cache injection so the
 * UI wiring is exercised WITHOUT a live index.
 *
 * Load-bearing invariant under test: FAIL-OPEN. A search/related/index fault must
 * NEVER break the menu key handler or the dashboard render — mirrors the PI0
 * `readIndexStatus` precedent ("a read error must NEVER break the dashboard").
 *
 * The render functions are synchronous string builders driven by pre-stashed
 * `app.*` arrays (the async-fetch/sync-render bridge, ADR-B). Most assertions run
 * against `render(app)` output with `app.relatedPlans` / `app.searchResults` /
 * `app.inboxRelated` pre-populated; fail-open cases stub the barrel to throw or
 * return undefined and assert no throw escapes.
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const BARREL = path.join(__dirname, '..', 'src', 'lib', 'plan-index', 'index.js');
const OVERVIEW = path.join(__dirname, '..', 'src', 'tabs', 'overview.js');
const AREA_INBOX = path.join(__dirname, '..', 'src', 'areas', 'inbox.js');
const LIB_INBOX = path.join(__dirname, '..', 'src', 'lib', 'inbox.js');

const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

/**
 * Replace the plan-index barrel in the require cache with a stub, then fresh-load
 * the module-under-test so it binds to the stub. Returns a restore fn.
 */
function stubBarrel(stub, moduleUnderTest) {
  const resolved = require.resolve(BARREL);
  const prevBarrel = require.cache[resolved];
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: stub,
  };
  // Fresh-load the module-under-test so it re-requires the stubbed barrel.
  const mutResolved = require.resolve(moduleUnderTest);
  delete require.cache[mutResolved];
  const mod = require(moduleUnderTest);
  return {
    mod,
    restore() {
      if (prevBarrel) require.cache[resolved] = prevBarrel;
      else delete require.cache[resolved];
      delete require.cache[mutResolved];
    },
  };
}

// ── Overview: Related Plans panel ──────────────────────────────────────────────
describe('overview Related Plans panel', () => {
  let overview;
  beforeEach(() => {
    delete require.cache[require.resolve(OVERVIEW)];
    overview = require(OVERVIEW);
  });
  afterEach(() => {
    delete require.cache[require.resolve(OVERVIEW)];
  });

  test('1. renders Related Plans panel from stashed results in score order', () => {
    const out = strip(overview.render({
      projectPath: process.cwd(),
      relatedPlans: [
        { planPath: 'alpha-plan', score: 0.9 },
        { planPath: 'beta-plan', score: 0.8 },
      ],
    }));
    assert.match(out, /Related Plans/, 'has the Related Plans heading');
    assert.match(out, /alpha-plan/, 'shows first related plan');
    assert.match(out, /beta-plan/, 'shows second related plan');
    // score order: alpha (0.9) must appear before beta (0.8)
    assert.ok(
      out.indexOf('alpha-plan') < out.indexOf('beta-plan'),
      'higher score rendered first',
    );
  });

  test('2. shows "index building" indicator on zero-unit store (Scenario 7)', () => {
    // getWiring stub → store.size === 0
    const { mod, restore } = stubBarrel(
      { getWiring: () => ({ store: { size: 0 } }) },
      OVERVIEW,
    );
    try {
      const out = strip(mod.render({ projectPath: process.cwd(), relatedPlans: [] }));
      assert.match(out, /index building/i, 'shows building indicator on zero units');
      assert.doesNotMatch(out, /alpha-plan/, 'no stale related list');
    } finally {
      restore();
    }
  });

  test('3. fail-open — barrel related undefined → panel omitted, no throw, dashboard intact', () => {
    const { mod, restore } = stubBarrel({ related: undefined, getWiring: undefined }, OVERVIEW);
    try {
      let out;
      assert.doesNotThrow(() => {
        out = strip(mod.render({ projectPath: process.cwd() }));
      }, 'render never throws when related is unavailable');
      // rest of the dashboard is intact (the readIndexStatus precedent)
      assert.match(out, /Pipeline/, 'pipeline section still rendered');
      assert.match(out, /Agent Status/, 'agent status still rendered');
      // no crash, no stray related content
      assert.doesNotMatch(out, /alpha-plan/);
    } finally {
      restore();
    }
  });

  test('3c. fail-open — renderRelatedPanel outer catch: poisoned result never breaks render', () => {
    // Force units > 0 so we reach the list path, then feed a hostile element whose
    // `.score` access throws — the outer try/catch must swallow it and render stays intact.
    const { mod, restore } = stubBarrel(
      { getWiring: () => ({ store: { size: 3 } }) },
      OVERVIEW,
    );
    try {
      const poison = { planPath: 'p' };
      Object.defineProperty(poison, 'score', { get() { throw new Error('poison'); }, enumerable: true });
      let out;
      assert.doesNotThrow(() => {
        out = strip(mod.render({ projectPath: process.cwd(), relatedPlans: [poison] }));
      });
      assert.match(out, /Pipeline/, 'dashboard still rendered despite poisoned related result');
    } finally {
      restore();
    }
  });

  test('3b. fail-open — related throws inside prefetch never escapes render', () => {
    const { mod, restore } = stubBarrel({
      related: () => { throw new Error('boom'); },
      getWiring: () => { throw new Error('boom'); },
    }, OVERVIEW);
    try {
      let out;
      assert.doesNotThrow(() => {
        out = strip(mod.render({ projectPath: process.cwd() }));
      });
      assert.match(out, /Pipeline/);
    } finally {
      restore();
    }
  });
});

// ── Overview: async pre-fetch bridge ───────────────────────────────────────────
describe('overview related pre-fetch (async-fetch/sync-render bridge)', () => {
  afterEach(() => {
    delete require.cache[require.resolve(OVERVIEW)];
  });

  test('4. prefetchRelated stashes results on app; render reads them synchronously', async () => {
    const { mod, restore } = stubBarrel({
      related: async () => [{ planPath: 'x-plan', score: 0.5 }],
      getWiring: () => ({ store: { size: 3 } }),
    }, OVERVIEW);
    try {
      const app = { projectPath: process.cwd(), selectedPlan: 'seed-plan' };
      assert.equal(typeof mod.prefetchRelated, 'function', 'exposes prefetchRelated');
      await mod.prefetchRelated(app);
      assert.ok(Array.isArray(app.relatedPlans), 'stashes an array');
      assert.equal(app.relatedPlans[0].planPath, 'x-plan');
      const out = strip(mod.render(app));
      assert.match(out, /x-plan/);
    } finally {
      restore();
    }
  });

  test('5. prefetchRelated fail-open — related throws → app.relatedPlans = [] (never rejects)', async () => {
    const { mod, restore } = stubBarrel({
      related: async () => { throw new Error('index down'); },
    }, OVERVIEW);
    try {
      const app = { projectPath: process.cwd(), selectedPlan: 'seed-plan' };
      await assert.doesNotReject(() => mod.prefetchRelated(app));
      assert.deepEqual(app.relatedPlans, [], 'empties on error, never rejects');
    } finally {
      restore();
    }
  });
});

// ── Overview: existing exports preserved ───────────────────────────────────────
describe('overview export contract (regression)', () => {
  test('6. still exports render, handleKey, reset', () => {
    delete require.cache[require.resolve(OVERVIEW)];
    const overview = require(OVERVIEW);
    assert.equal(typeof overview.render, 'function');
    assert.equal(typeof overview.handleKey, 'function');
    assert.equal(typeof overview.reset, 'function');
  });
});

// ── menu: search shortcut ──────────────────────────────────────────────────────
describe('menu search shortcut', () => {
  let menu;
  beforeEach(() => {
    delete require.cache[require.resolve(path.join(__dirname, '..', 'src', 'commands', 'start.js'))];
    menu = require(path.join(__dirname, '..', 'src', 'commands', 'start.js'));
  });

  test('7. enterSearchMode routes: sets search mode on app, returns results', async () => {
    const { mod, restore } = stubBarrel({
      search: async () => [{ planPath: 'hit-1', score: 0.7 }],
    }, path.join(__dirname, '..', 'src', 'commands', 'start.js'));
    try {
      assert.equal(typeof mod.enterSearchMode, 'function', 'exposes enterSearchMode');
      const app = { projectPath: process.cwd() };
      await mod.enterSearchMode(app, 'auth flow');
      assert.ok(Array.isArray(app.searchResults), 'stashes searchResults array');
      assert.equal(app.searchResults[0].planPath, 'hit-1');
    } finally {
      restore();
    }
  });

  test('8. search shortcut key enters search flow in list mode; returns truthy', () => {
    assert.equal(typeof menu.handleSearchKey, 'function', 'exposes handleSearchKey');
    const app = { mode: 'list', projectPath: process.cwd() };
    const handled = menu.handleSearchKey({ sequence: '/' }, app);
    assert.ok(handled, 'search key handled in list mode');
    assert.equal(app.searchMode, true, 'search mode flag set');
  });

  test('9. non-search key is unaffected by handleSearchKey', () => {
    const app = { mode: 'list', projectPath: process.cwd() };
    const handled = menu.handleSearchKey({ sequence: 'z' }, app);
    assert.ok(!handled, 'non-search key not consumed');
    assert.notEqual(app.searchMode, true);
  });

  test('10. search shortcut ignored when not in list mode (does not shadow input)', () => {
    const app = { mode: 'view', projectPath: process.cwd() };
    const handled = menu.handleSearchKey({ sequence: '/' }, app);
    assert.ok(!handled, 'not consumed outside list mode');
  });

  test('11. fail-open — search throws → empty results, no crash', async () => {
    const { mod, restore } = stubBarrel({
      search: async () => { throw new Error('search down'); },
    }, path.join(__dirname, '..', 'src', 'commands', 'start.js'));
    try {
      const app = { projectPath: process.cwd() };
      await assert.doesNotReject(() => mod.enterSearchMode(app, 'q'));
      assert.deepEqual(app.searchResults, [], 'empties on error');
    } finally {
      restore();
    }
  });

  test('12. fail-open — search undefined (barrel getter returns undefined) → empty results', async () => {
    const { mod, restore } = stubBarrel({ search: undefined }, path.join(__dirname, '..', 'src', 'commands', 'start.js'));
    try {
      const app = { projectPath: process.cwd() };
      await assert.doesNotReject(() => mod.enterSearchMode(app, 'q'));
      assert.deepEqual(app.searchResults, []);
    } finally {
      restore();
    }
  });

  test('13. regression — menu still exports ensureInitialized', () => {
    assert.equal(typeof menu.ensureInitialized, 'function');
  });
});

// ── inbox area: related block ──────────────────────────────────────────────────
describe('inbox area related block', () => {
  let area;
  beforeEach(() => {
    delete require.cache[require.resolve(AREA_INBOX)];
    area = require(AREA_INBOX);
  });
  afterEach(() => {
    delete require.cache[require.resolve(AREA_INBOX)];
  });

  test('14. renders related block from stash before footer', () => {
    const out = strip(area.render({
      projectPath: process.cwd(),
      inboxRelated: [
        { planPath: 'rel-a', score: 0.6 },
        { planPath: 'rel-b', score: 0.5 },
      ],
    }));
    assert.match(out, /Related/, 'has a Related heading');
    assert.match(out, /rel-a/);
    assert.match(out, /rel-b/);
    // block appears before the footer nav hints
    assert.ok(out.indexOf('rel-a') < out.indexOf('areas'), 'related block precedes footer');
  });

  test('15. empty/absent related array → block omitted, render still non-empty', () => {
    const outEmpty = strip(area.render({ projectPath: process.cwd(), inboxRelated: [] }));
    assert.doesNotMatch(outEmpty, /rel-a/);
    assert.ok(outEmpty.trim().length > 0, 'render still non-empty');
    const outAbsent = strip(area.render({ projectPath: process.cwd() }));
    assert.ok(outAbsent.trim().length > 0, 'render non-empty with no inboxRelated key');
  });

  test('15b. fail-open — inbox related block outer catch: poisoned element never breaks render', () => {
    const poison = { planPath: 'p' };
    Object.defineProperty(poison, 'score', { get() { throw new Error('poison'); }, enumerable: true });
    let out;
    assert.doesNotThrow(() => {
      out = strip(area.render({ projectPath: process.cwd(), inboxRelated: [poison] }));
    });
    assert.ok(out.trim().length > 0, 'inbox render still non-empty despite poisoned related element');
  });

  test('16. regression — inbox area still exports render, handleKey', () => {
    assert.equal(typeof area.render, 'function');
    assert.equal(typeof area.handleKey, 'function');
    // exercise handleKey (always false — no keys handled in the inbox area)
    assert.equal(area.handleKey({ name: 'x', sequence: 'x' }, { projectPath: process.cwd() }), false);
  });
});

// ── lib/inbox: listRelatedForInbox helper ──────────────────────────────────────
describe('lib/inbox listRelatedForInbox helper', () => {
  afterEach(() => {
    delete require.cache[require.resolve(LIB_INBOX)];
  });

  test('17. resolves to related results from the barrel', async () => {
    const { mod, restore } = stubBarrel({
      related: async () => [{ planPath: 'lib-hit', score: 0.4 }],
    }, LIB_INBOX);
    try {
      assert.equal(typeof mod.listRelatedForInbox, 'function');
      const res = await mod.listRelatedForInbox('seed', process.cwd());
      assert.ok(Array.isArray(res));
      assert.equal(res[0].planPath, 'lib-hit');
    } finally {
      restore();
    }
  });

  test('18. fail-open — related throws → resolves [] (never rejects)', async () => {
    const { mod, restore } = stubBarrel({
      related: async () => { throw new Error('boom'); },
    }, LIB_INBOX);
    try {
      let res;
      await assert.doesNotReject(async () => { res = await mod.listRelatedForInbox('seed', process.cwd()); });
      assert.deepEqual(res, []);
    } finally {
      restore();
    }
  });

  test('19. fail-open — related undefined → resolves []', async () => {
    const { mod, restore } = stubBarrel({ related: undefined }, LIB_INBOX);
    try {
      const res = await mod.listRelatedForInbox('seed', process.cwd());
      assert.deepEqual(res, []);
    } finally {
      restore();
    }
  });

  test('20. regression — lib/inbox still exports pre-existing functions', () => {
    delete require.cache[require.resolve(LIB_INBOX)];
    const inbox = require(LIB_INBOX);
    for (const fn of ['getInboxCounts', 'listQuestions', 'listDecisions',
      'listPlansAtGates', 'listStaleCandidates', 'createQuestion', 'createDecision']) {
      assert.equal(typeof inbox[fn], 'function', `still exports ${fn}`);
    }
    assert.equal(typeof inbox.listRelatedForInbox, 'function', 'adds listRelatedForInbox');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// END-TO-END HUMAN-FLOW TESTS (PI4-s4 pre-Gate-3 kickback)
//
// "The measure is the human." The tests above drive the extracted helper functions
// DIRECTLY — which is exactly why the s4 wiring shipped dead: every helper passed in
// isolation while NONE of it reached the mounted menu. These tests instead drive the
// REAL key-dispatch / render loop end to end and assert the rendered output the human
// actually sees CONTAINS the search results and the Related Plans panel. They FAIL
// against dead wiring (panel not called from the live area, search input not
// accumulated, no results render branch) and PASS only once the flow reaches a human.
// ═══════════════════════════════════════════════════════════════════════════════

const MENU = path.join(__dirname, '..', 'src', 'commands', 'start.js');
const AREA_PIPELINE = path.join(__dirname, '..', 'src', 'areas', 'pipeline.js');

/** Capture everything written to process.stdout while `fn` runs; restore after. */
function captureStdout(fn) {
  const orig = process.stdout.write;
  let buf = '';
  process.stdout.write = (chunk) => { buf += String(chunk); return true; };
  try { fn(); } finally { process.stdout.write = orig; }
  return buf;
}

/** Load start.js bound to a stubbed barrel (fresh require so overview/pipeline rebind too). */
function loadMenuWithBarrel(stub) {
  const barrelResolved = require.resolve(BARREL);
  const prevBarrel = require.cache[barrelResolved];
  require.cache[barrelResolved] = { id: barrelResolved, filename: barrelResolved, loaded: true, exports: stub };
  // Drop menu + everything it pulls in that binds the barrel, so they re-require the stub.
  for (const m of [MENU, AREA_PIPELINE, OVERVIEW, AREA_INBOX, LIB_INBOX]) {
    delete require.cache[require.resolve(m)];
  }
  const menu = require(MENU);
  return {
    menu,
    restore() {
      if (prevBarrel) require.cache[barrelResolved] = prevBarrel;
      else delete require.cache[barrelResolved];
      for (const m of [MENU, AREA_PIPELINE, OVERVIEW, AREA_INBOX, LIB_INBOX]) {
        delete require.cache[require.resolve(m)];
      }
    },
  };
}

describe('E2E — menu search flow reaches the human (real handleKey/render loop)', () => {
  test('E1. "/" + typed query + Enter → app.searchQuery captured AND results rendered', async () => {
    const { menu, restore } = loadMenuWithBarrel({
      search: async () => [
        { planPath: 'auth-login-plan', score: 0.91 },
        { planPath: 'auth-session-plan', score: 0.77 },
      ],
    });
    try {
      const app = menu.app;
      // Reset to the clean list landing state the human starts from.
      app.mode = 'list';
      app.searchMode = false;
      app.searchQuery = undefined;
      app.searchResults = undefined;

      // Press '/' to enter search — driven through the REAL top-level handleKey.
      let out = captureStdout(() => menu.handleKey('/', { sequence: '/' }));
      assert.equal(app.searchMode, true, 'search sub-mode entered via handleKey');
      assert.equal(app.searchQuery, '', 'empty query buffer seeded');
      assert.match(strip(out), /Search plans/, 'search prompt rendered to the human');

      // Type the query one keystroke at a time (the accumulation the dead wiring lacked).
      for (const ch of 'auth') {
        captureStdout(() => menu.handleKey(ch, { sequence: ch }));
      }
      assert.equal(app.searchQuery, 'auth', 'keystrokes ACCUMULATED into app.searchQuery');

      // Press Enter → runs the async search off the key path. Capture the follow-up
      // render that fires when the promise resolves.
      captureStdout(() => menu.handleKey('\r', { name: 'return' }));
      await new Promise((r) => setImmediate(r)); // let the fire-and-forget search resolve
      const rendered = strip(captureStdout(() => menu.render()));

      assert.ok(Array.isArray(app.searchResults) && app.searchResults.length === 2,
        'search results stashed on app.searchResults');
      assert.match(rendered, /Results/, 'results section rendered');
      assert.match(rendered, /auth-login-plan/, 'ranked hit #1 visible to the human');
      assert.match(rendered, /auth-session-plan/, 'ranked hit #2 visible to the human');
      assert.ok(rendered.indexOf('auth-login-plan') < rendered.indexOf('auth-session-plan'),
        'results rendered in score-rank order');
    } finally {
      restore();
    }
  });

  test('E2. Esc exits search mode and clears the query (human can back out)', () => {
    const { menu, restore } = loadMenuWithBarrel({ search: async () => [] });
    try {
      const app = menu.app;
      app.mode = 'list'; app.searchMode = false; app.searchQuery = undefined;
      captureStdout(() => menu.handleKey('/', { sequence: '/' }));
      captureStdout(() => menu.handleKey('x', { sequence: 'x' }));
      assert.equal(app.searchQuery, 'x');
      captureStdout(() => menu.handleKey('', { name: 'escape' }));
      assert.equal(app.searchMode, false, 'escape exits search mode');
      assert.equal(app.searchQuery, '', 'query cleared on escape');
    } finally {
      restore();
    }
  });

  test('E3. typing "q" while searching does NOT quit the process (search owns keystrokes)', () => {
    const { menu, restore } = loadMenuWithBarrel({ search: async () => [] });
    try {
      const app = menu.app;
      app.mode = 'list'; app.searchMode = false; app.searchQuery = undefined;
      captureStdout(() => menu.handleKey('/', { sequence: '/' }));
      // 'q' would normally quit; in search mode it must accumulate instead. If it
      // quit, process.exit would fire and this assertion would never run.
      captureStdout(() => menu.handleKey('q', { name: 'q', sequence: 'q' }));
      assert.equal(app.searchQuery, 'q', "'q' accumulated as text, did not quit");
    } finally {
      restore();
    }
  });
});

describe('E2E — pipeline dashboard shows the Related Plans panel populated (live area)', () => {
  test('E4. activate() populates app.relatedPlans and render() shows them on the LIVE dashboard', async () => {
    // Stub the barrel: non-zero store (so we pass the Scenario-7 building gate) and a
    // related() returning two neighbours. Fresh-load pipeline so it binds the stub.
    const pipelineResolved = require.resolve(AREA_PIPELINE);
    const barrelResolved = require.resolve(BARREL);
    const prevBarrel = require.cache[barrelResolved];
    require.cache[barrelResolved] = {
      id: barrelResolved, filename: barrelResolved, loaded: true,
      exports: {
        getWiring: () => ({ store: { size: 5 } }),
        related: async () => [
          { planPath: 'nearby-plan-a', score: 0.88 },
          { planPath: 'nearby-plan-b', score: 0.71 },
        ],
      },
    };
    delete require.cache[pipelineResolved];
    delete require.cache[require.resolve(OVERVIEW)];
    const pipeline = require(AREA_PIPELINE);
    try {
      assert.equal(typeof pipeline.activate, 'function', 'pipeline exposes activate()');

      // BEFORE activation the render must NOT contain a stale related list.
      const app = { projectPath: process.cwd(), selectedPlan: 'seed-plan' };
      const before = strip(pipeline.render(app));
      assert.doesNotMatch(before, /nearby-plan-a/, 'no related plans before activation');

      // Activation is the fire-and-forget pre-fetch the live menu runs on tab entry.
      await pipeline.activate(app);
      assert.ok(Array.isArray(app.relatedPlans) && app.relatedPlans.length === 2,
        'activate() stashed related plans on the app');

      const after = strip(pipeline.render(app));
      assert.match(after, /Related Plans/, 'Related Plans panel rendered on the live dashboard');
      assert.match(after, /nearby-plan-a/, 'related neighbour #1 visible to the human');
      assert.match(after, /nearby-plan-b/, 'related neighbour #2 visible to the human');
      // dashboard is still whole (the panel is additive, fail-open)
      assert.match(after, /Business/, 'pipeline sections still rendered alongside the panel');
    } finally {
      if (prevBarrel) require.cache[barrelResolved] = prevBarrel;
      else delete require.cache[barrelResolved];
      delete require.cache[pipelineResolved];
      delete require.cache[require.resolve(OVERVIEW)];
    }
  });

  test('E5. inbox area activate() populates app.inboxRelated → rendered before footer', async () => {
    const barrelResolved = require.resolve(BARREL);
    const prevBarrel = require.cache[barrelResolved];
    require.cache[barrelResolved] = {
      id: barrelResolved, filename: barrelResolved, loaded: true,
      exports: { related: async () => [{ planPath: 'inbox-neighbour', score: 0.6 }] },
    };
    delete require.cache[require.resolve(AREA_INBOX)];
    delete require.cache[require.resolve(LIB_INBOX)];
    const area = require(AREA_INBOX);
    try {
      assert.equal(typeof area.activate, 'function', 'inbox area exposes activate()');
      const app = { projectPath: process.cwd(), selectedPlan: 'seed-plan' };
      await area.activate(app);
      assert.ok(Array.isArray(app.inboxRelated) && app.inboxRelated.length === 1,
        'activate() stashed inbox related on the app');
      const out = strip(area.render(app));
      assert.match(out, /inbox-neighbour/, 'inbox related neighbour visible to the human');
      assert.ok(out.indexOf('inbox-neighbour') < out.indexOf('areas'),
        'related block precedes the footer');
    } finally {
      if (prevBarrel) require.cache[barrelResolved] = prevBarrel;
      else delete require.cache[barrelResolved];
      delete require.cache[require.resolve(AREA_INBOX)];
      delete require.cache[require.resolve(LIB_INBOX)];
    }
  });
});
