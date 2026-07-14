/**
 * Vision Tab — behavior tests
 *
 * Drives the ACTUAL functions of src/tabs/vision.js against REAL temp-dir
 * fixtures (zero mocks of core logic — the module is pure + filesystem, so the
 * filesystem itself is the fixture). Every assertion checks human-visible
 * meaning: a vision title appears in the render, a count is right, a created
 * file's real bytes on disk, an app-state transition actually happening.
 *
 * Coverage target: src/tabs/vision.js 25.75% -> ~85%+.
 *
 * Non-exported internals (renderVisionList, getStatusIcon, parseVisionMetadata,
 * executeAction) are exercised THROUGH their exported callers (render,
 * readVisions/getVisionCounts/createVision, handleKey) — no source change.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const vision = require('../src/tabs/vision');

// ---------------------------------------------------------------------------
// Fixtures — real temp project on disk
// ---------------------------------------------------------------------------

// Strip ANSI escape codes so assertions read against plain human text.
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

let projectRoot;
let visionDir;

function visionFileBody({ title, status, progress, problem }) {
  let body = `# Vision: ${title}\n\n## Status\n`;
  body += `- Created: 2026-01-01T00:00:00.000Z\n`;
  body += `- Last Updated: 2026-01-01T00:00:00.000Z\n`;
  if (progress !== undefined) body += `- Progress: ${progress}\n`;
  if (status !== undefined) body += `- Status: ${status}\n`;
  body += `\n## Phase 1: Problem Discovery\n### Problem Statement\n`;
  body += problem ? `✓ ${problem}\n` : `⏳ (not yet answered)\n`;
  return body;
}

/** Fresh app state matching what the tab reads. */
function makeApp(overrides = {}) {
  return {
    projectPath: projectRoot,
    width: 80,
    mode: 'list',
    selectedIndex: 0,
    actionIndex: 0,
    selectedPlan: null,
    viewContent: null,
    inputValue: '',
    ...overrides
  };
}

before(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-vision-'));
  visionDir = path.join(projectRoot, 'plans', 'vision');
  fs.mkdirSync(visionDir, { recursive: true });
});

after(() => {
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// readVisions — filesystem read + parse + sort
// ---------------------------------------------------------------------------

describe('readVisions', () => {
  test('missing directory returns empty array, no throw', () => {
    const result = vision.readVisions(path.join(projectRoot, 'does-not-exist'));
    assert.deepStrictEqual(result, []);
  });

  test('empty directory returns empty array', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-vision-empty-'));
    try {
      assert.deepStrictEqual(vision.readVisions(empty), []);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  test('ignores .gitkeep and non-md files, parses real vision files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-vision-read-'));
    try {
      fs.writeFileSync(path.join(dir, '.gitkeep'), '', 'utf8');
      fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignore me', 'utf8');
      fs.writeFileSync(
        path.join(dir, 'alpha.md'),
        visionFileBody({ title: 'Alpha Idea', status: 'ready', progress: '3/5 phases complete', problem: 'Users cannot find the export button' }),
        'utf8'
      );
      const result = vision.readVisions(dir);
      assert.strictEqual(result.length, 1, 'only alpha.md counts');
      const v = result[0];
      assert.strictEqual(v.name, 'alpha');
      assert.strictEqual(v.status, 'ready');
      assert.strictEqual(v.progress, '3/5 phases complete');
      assert.strictEqual(v.problem, 'Users cannot find the export button');
      assert.strictEqual(v.title, 'Alpha Idea');
      assert.ok(v.content.includes('# Vision: Alpha Idea'));
      assert.ok(v.path.endsWith(`alpha.md`));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('sorts by modified time, newest first', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-vision-sort-'));
    try {
      const older = path.join(dir, 'older.md');
      const newer = path.join(dir, 'newer.md');
      fs.writeFileSync(older, visionFileBody({ title: 'Older', status: 'exploring' }), 'utf8');
      fs.writeFileSync(newer, visionFileBody({ title: 'Newer', status: 'exploring' }), 'utf8');
      // Deterministic mtimes: older is a day behind newer.
      const t1 = new Date('2026-01-01T00:00:00Z');
      const t2 = new Date('2026-01-02T00:00:00Z');
      fs.utimesSync(older, t1, t1);
      fs.utimesSync(newer, t2, t2);
      const result = vision.readVisions(dir);
      assert.deepStrictEqual(result.map(v => v.name), ['newer', 'older']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// parseVisionMetadata — exercised through readVisions on real files
// ---------------------------------------------------------------------------

describe('parseVisionMetadata (via readVisions)', () => {
  test('extracts every field when all present', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-vision-meta-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'full.md'),
        visionFileBody({ title: 'My Grand Plan', status: 'converted', progress: '5/5 phases complete', problem: 'The system is slow' }),
        'utf8'
      );
      const [v] = vision.readVisions(dir);
      assert.strictEqual(v.title, 'My Grand Plan');
      assert.strictEqual(v.status, 'converted');
      assert.strictEqual(v.progress, '5/5 phases complete');
      assert.strictEqual(v.problem, 'The system is slow');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('malformed content (no metadata lines) degrades to defaults, no crash', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-vision-bad-'));
    try {
      // Not a real vision doc: no title, no status, no progress, no problem.
      fs.writeFileSync(path.join(dir, 'garbage.md'), 'random text\nwith no structure at all\n', 'utf8');
      const [v] = vision.readVisions(dir);
      assert.strictEqual(v.status, 'exploring', 'default status');
      assert.strictEqual(v.progress, null);
      assert.strictEqual(v.problem, null);
      assert.strictEqual(v.title, null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('each status value round-trips through the parser', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-vision-status-'));
    try {
      for (const status of ['exploring', 'ready', 'converted']) {
        fs.writeFileSync(path.join(dir, `${status}.md`), visionFileBody({ title: status, status }), 'utf8');
      }
      const byName = Object.fromEntries(vision.readVisions(dir).map(v => [v.name, v.status]));
      assert.strictEqual(byName.exploring, 'exploring');
      assert.strictEqual(byName.ready, 'ready');
      assert.strictEqual(byName.converted, 'converted');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// getVisionCounts
// ---------------------------------------------------------------------------

describe('getVisionCounts', () => {
  test('counts visions per status in a real project', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-vision-counts-'));
    const vdir = path.join(root, 'plans', 'vision');
    fs.mkdirSync(vdir, { recursive: true });
    try {
      fs.writeFileSync(path.join(vdir, 'a.md'), visionFileBody({ title: 'A', status: 'exploring' }), 'utf8');
      fs.writeFileSync(path.join(vdir, 'b.md'), visionFileBody({ title: 'B', status: 'exploring' }), 'utf8');
      fs.writeFileSync(path.join(vdir, 'c.md'), visionFileBody({ title: 'C', status: 'ready' }), 'utf8');
      fs.writeFileSync(path.join(vdir, 'd.md'), visionFileBody({ title: 'D', status: 'converted' }), 'utf8');
      const counts = vision.getVisionCounts(root);
      assert.strictEqual(counts.total, 4);
      assert.strictEqual(counts.exploring, 2);
      assert.strictEqual(counts.ready, 1);
      assert.strictEqual(counts.converted, 1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('empty project reports all-zero counts', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-vision-zero-'));
    try {
      const counts = vision.getVisionCounts(root);
      assert.deepStrictEqual(counts, { total: 0, exploring: 0, ready: 0, converted: 0 });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// createVision — writes a real file
// ---------------------------------------------------------------------------

describe('createVision', () => {
  test('creates a file on disk with the expected title, slug and frontmatter', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-vision-create-'));
    try {
      const result = vision.createVision('My Great Idea!', root);
      assert.strictEqual(result.name, 'my-great-idea', 'slug strips punctuation');
      assert.strictEqual(result.title, 'My Great Idea!');
      // The file really exists and has the real content.
      assert.ok(fs.existsSync(result.path), 'file written to disk');
      const written = fs.readFileSync(result.path, 'utf8');
      assert.ok(written.includes('# Vision: My Great Idea!'), 'title header');
      assert.ok(written.includes('- Status: exploring'), 'initial status');
      assert.ok(written.includes('- Progress: 0/5 phases complete'), 'initial progress');
      assert.ok(written.includes('## Phase 1: Problem Discovery'), 'template body');
      // And it round-trips through readVisions.
      const [v] = vision.readVisions(path.join(root, 'plans', 'vision'));
      assert.strictEqual(v.title, 'My Great Idea!');
      assert.strictEqual(v.status, 'exploring');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('creates the vision directory when it does not yet exist', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-vision-mkdir-'));
    try {
      assert.ok(!fs.existsSync(path.join(root, 'plans', 'vision')), 'no vision dir yet');
      const result = vision.createVision('Fresh Start', root);
      assert.ok(fs.existsSync(path.join(root, 'plans', 'vision')), 'dir created');
      assert.ok(fs.existsSync(result.path));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// render — the human-visible tab output
// ---------------------------------------------------------------------------

describe('render', () => {
  test('empty state shows the no-visions guidance and the new-idea hint', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-vision-render-empty-'));
    fs.mkdirSync(path.join(root, 'plans', 'vision'), { recursive: true });
    try {
      const out = stripAnsi(vision.render(makeApp({ projectPath: root })));
      assert.ok(out.includes('Vision Mode'), 'header');
      assert.ok(out.includes('No visions'), 'empty count label');
      assert.ok(out.includes('No visions yet.'), 'empty guidance');
      assert.ok(out.includes('start exploring a new idea'), 'call to action');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('non-empty state lists vision names, the selection marker and the problem preview', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-vision-render-list-'));
    const vdir = path.join(root, 'plans', 'vision');
    fs.mkdirSync(vdir, { recursive: true });
    try {
      const longProblem = 'x'.repeat(80); // > 50 chars -> exercises the truncation branch
      fs.writeFileSync(path.join(vdir, 'first-idea.md'),
        visionFileBody({ title: 'First', status: 'exploring', progress: '1/5 phases complete', problem: longProblem }), 'utf8');
      fs.writeFileSync(path.join(vdir, 'second-idea.md'),
        visionFileBody({ title: 'Second', status: 'ready' }), 'utf8');
      // Force deterministic order: first-idea newest so it is index 0.
      fs.utimesSync(path.join(vdir, 'first-idea.md'), new Date('2026-02-02Z'), new Date('2026-02-02Z'));
      fs.utimesSync(path.join(vdir, 'second-idea.md'), new Date('2026-02-01Z'), new Date('2026-02-01Z'));

      const out = stripAnsi(vision.render(makeApp({ projectPath: root, selectedIndex: 0 })));
      assert.ok(out.includes('first-idea'), 'first vision name shown');
      assert.ok(out.includes('second-idea'), 'second vision name shown');
      assert.ok(out.includes('2 exploring'), 'count label reflects two visions');
      assert.ok(out.includes('→'), 'selection marker present');
      assert.ok(out.includes('(1/5 phases complete)'), 'progress indicator shown');
      // Selected row shows a truncated problem preview ending in an ellipsis.
      assert.ok(out.includes('x'.repeat(50) + '...'), 'problem truncated to 50 chars + ellipsis');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('status icons differ per status in the rendered list', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-vision-icons-'));
    const vdir = path.join(root, 'plans', 'vision');
    fs.mkdirSync(vdir, { recursive: true });
    try {
      fs.writeFileSync(path.join(vdir, 'exp.md'), visionFileBody({ title: 'E', status: 'exploring' }), 'utf8');
      fs.writeFileSync(path.join(vdir, 'rdy.md'), visionFileBody({ title: 'R', status: 'ready' }), 'utf8');
      fs.writeFileSync(path.join(vdir, 'cnv.md'), visionFileBody({ title: 'C', status: 'converted' }), 'utf8');
      fs.writeFileSync(path.join(vdir, 'unk.md'), visionFileBody({ title: 'U', status: 'weirdstatus' }), 'utf8');
      const out = stripAnsi(vision.render(makeApp({ projectPath: root, selectedIndex: -1 })));
      // exploring ◐, ready ●, converted ✓, unknown fallback ○ — all four appear.
      assert.ok(out.includes('◐'), 'exploring icon');
      assert.ok(out.includes('●'), 'ready icon');
      assert.ok(out.includes('✓'), 'converted icon');
      assert.ok(out.includes('○'), 'default/unknown icon');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// renderActions — action menu, with the converted relabel branch
// ---------------------------------------------------------------------------

describe('renderActions', () => {
  test('shows the standard action labels for a non-converted vision', () => {
    const out = stripAnsi(vision.renderActions(makeApp({ actionIndex: 0 }), { name: 'demo', status: 'exploring' }));
    assert.ok(out.includes('demo'), 'vision name is the menu title');
    assert.ok(out.includes('Continue'));
    assert.ok(out.includes('Convert'), 'convert action label');
    assert.ok(out.includes('Rename'));
    assert.ok(out.includes('Delete'));
  });

  test('relabels action 3 to "View converted plan" for a converted vision', () => {
    const out = stripAnsi(vision.renderActions(makeApp({ actionIndex: 0 }), { name: 'done-idea', status: 'converted' }));
    assert.ok(out.includes('View converted plan'), 'converted relabel applied');
  });
});

// ---------------------------------------------------------------------------
// handleKey — real navigation / selection, asserted via app-state change
// ---------------------------------------------------------------------------

describe('handleKey — empty visions', () => {
  let emptyRoot;
  before(() => {
    emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-vision-key-empty-'));
    fs.mkdirSync(path.join(emptyRoot, 'plans', 'vision'), { recursive: true });
  });
  after(() => fs.rmSync(emptyRoot, { recursive: true, force: true }));

  test('"n" opens new-vision mode', () => {
    const app = makeApp({ projectPath: emptyRoot });
    const handled = vision.handleKey({ name: 'n' }, app);
    assert.strictEqual(handled, true);
    assert.strictEqual(app.mode, 'new-vision');
  });

  test('any other key is a real no-op (returns false, mode unchanged)', () => {
    const app = makeApp({ projectPath: emptyRoot, mode: 'list' });
    const handled = vision.handleKey({ name: 'down' }, app);
    assert.strictEqual(handled, false);
    assert.strictEqual(app.mode, 'list');
  });
});

describe('handleKey — list mode navigation', () => {
  let root;
  before(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-vision-key-list-'));
    const vdir = path.join(root, 'plans', 'vision');
    fs.mkdirSync(vdir, { recursive: true });
    fs.writeFileSync(path.join(vdir, 'one.md'), visionFileBody({ title: 'One', status: 'exploring' }), 'utf8');
    fs.writeFileSync(path.join(vdir, 'two.md'), visionFileBody({ title: 'Two', status: 'ready' }), 'utf8');
    fs.writeFileSync(path.join(vdir, 'three.md'), visionFileBody({ title: 'Three', status: 'ready' }), 'utf8');
  });
  after(() => fs.rmSync(root, { recursive: true, force: true }));

  test('down increments selectedIndex; clamps at the last vision', () => {
    const app = makeApp({ projectPath: root, selectedIndex: 0 });
    assert.strictEqual(vision.handleKey({ name: 'down' }, app), true);
    assert.strictEqual(app.selectedIndex, 1);
    app.selectedIndex = 2; // last of three
    assert.strictEqual(vision.handleKey({ name: 'down' }, app), true);
    assert.strictEqual(app.selectedIndex, 2, 'clamped at last');
  });

  test('up decrements selectedIndex; clamps at zero', () => {
    const app = makeApp({ projectPath: root, selectedIndex: 2 });
    assert.strictEqual(vision.handleKey({ name: 'up' }, app), true);
    assert.strictEqual(app.selectedIndex, 1);
    app.selectedIndex = 0;
    assert.strictEqual(vision.handleKey({ name: 'up' }, app), true);
    assert.strictEqual(app.selectedIndex, 0, 'clamped at zero');
  });

  test('Enter opens the action menu and captures the selected vision', () => {
    const app = makeApp({ projectPath: root, selectedIndex: 1 });
    assert.strictEqual(vision.handleKey({ name: 'return' }, app), true);
    assert.strictEqual(app.mode, 'actions');
    assert.strictEqual(app.actionIndex, 0);
    assert.ok(app.selectedPlan, 'a vision was captured');
    assert.strictEqual(typeof app.selectedPlan.name, 'string');
  });

  test('"n" opens new-vision mode from a populated list', () => {
    const app = makeApp({ projectPath: root, selectedIndex: 0 });
    assert.strictEqual(vision.handleKey({ name: 'n' }, app), true);
    assert.strictEqual(app.mode, 'new-vision');
  });

  test('number key jumps directly to that vision and opens actions', () => {
    const app = makeApp({ projectPath: root, selectedIndex: 0 });
    assert.strictEqual(vision.handleKey({ sequence: '2' }, app), true);
    assert.strictEqual(app.selectedIndex, 1, 'jumped to vision #2 (0-based 1)');
    assert.strictEqual(app.mode, 'actions');
    assert.ok(app.selectedPlan);
  });

  test('out-of-range number is a real no-op', () => {
    const app = makeApp({ projectPath: root, selectedIndex: 0, mode: 'list' });
    assert.strictEqual(vision.handleKey({ sequence: '9' }, app), false);
    assert.strictEqual(app.mode, 'list', 'mode unchanged');
    assert.strictEqual(app.selectedIndex, 0, 'index unchanged');
  });
});

describe('handleKey — action mode', () => {
  let root;
  before(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-vision-key-actions-'));
    const vdir = path.join(root, 'plans', 'vision');
    fs.mkdirSync(vdir, { recursive: true });
    fs.writeFileSync(path.join(vdir, 'idea.md'),
      visionFileBody({ title: 'Idea', status: 'exploring', problem: 'a problem' }), 'utf8');
  });
  after(() => fs.rmSync(root, { recursive: true, force: true }));

  function actionApp(overrides = {}) {
    const app = makeApp({ projectPath: root, mode: 'list', selectedIndex: 0 });
    vision.handleKey({ name: 'return' }, app); // enter actions mode, sets selectedPlan
    return Object.assign(app, overrides);
  }

  test('escape returns to the list', () => {
    const app = actionApp({ actionIndex: 2 });
    assert.strictEqual(vision.handleKey({ name: 'escape' }, app), true);
    assert.strictEqual(app.mode, 'list');
  });

  test('"0" sequence also returns to the list', () => {
    const app = actionApp();
    assert.strictEqual(vision.handleKey({ sequence: '0' }, app), true);
    assert.strictEqual(app.mode, 'list');
  });

  test('down moves the action cursor and clamps at the last action', () => {
    const app = actionApp({ actionIndex: 0 });
    assert.strictEqual(vision.handleKey({ name: 'down' }, app), true);
    assert.strictEqual(app.actionIndex, 1);
    app.actionIndex = 4; // last of five actions
    assert.strictEqual(vision.handleKey({ name: 'down' }, app), true);
    assert.strictEqual(app.actionIndex, 4, 'clamped');
  });

  test('up moves the action cursor and clamps at zero', () => {
    const app = actionApp({ actionIndex: 2 });
    assert.strictEqual(vision.handleKey({ name: 'up' }, app), true);
    assert.strictEqual(app.actionIndex, 1);
    app.actionIndex = 0;
    assert.strictEqual(vision.handleKey({ name: 'up' }, app), true);
    assert.strictEqual(app.actionIndex, 0, 'clamped');
  });

  test('Enter on action 1 (Continue) enters vision-explore mode', () => {
    const app = actionApp({ actionIndex: 0 });
    assert.strictEqual(vision.handleKey({ name: 'return' }, app), true);
    assert.strictEqual(app.mode, 'vision-explore');
  });

  test('number "2" (View) enters view mode and loads the vision content', () => {
    const app = actionApp();
    assert.strictEqual(vision.handleKey({ sequence: '2' }, app), true);
    assert.strictEqual(app.mode, 'view');
    assert.ok(app.viewContent.includes('# Vision: Idea'), 'real content loaded');
  });

  test('number "3" (Convert) enters convert-vision mode', () => {
    const app = actionApp();
    assert.strictEqual(vision.handleKey({ sequence: '3' }, app), true);
    assert.strictEqual(app.mode, 'convert-vision');
  });

  test('number "4" (Rename) enters rename mode prefilled with the vision name', () => {
    const app = actionApp();
    assert.strictEqual(vision.handleKey({ sequence: '4' }, app), true);
    assert.strictEqual(app.mode, 'rename');
    assert.strictEqual(app.inputValue, app.selectedPlan.name);
  });

  test('number "5" (Delete) enters confirm-delete mode', () => {
    const app = actionApp();
    assert.strictEqual(vision.handleKey({ sequence: '5' }, app), true);
    assert.strictEqual(app.mode, 'confirm-delete');
  });
});

// ---------------------------------------------------------------------------
// saveVisionProgress — mutates a real vision file on disk
// ---------------------------------------------------------------------------

describe('saveVisionProgress', () => {
  test('missing vision file is a safe no-op (no throw)', () => {
    assert.doesNotThrow(() =>
      vision.saveVisionProgress(path.join(projectRoot, 'nope.md'), 'Problem Statement', 'answer'));
  });

  test('records an answer, bumps progress and appends discussion history', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-vision-save-'));
    try {
      const { path: vp } = vision.createVision('Save Test', root);
      vision.saveVisionProgress(vp, 'Problem Statement', 'The onboarding is confusing');
      const after = fs.readFileSync(vp, 'utf8');
      assert.ok(after.includes('### Problem Statement\n✓ The onboarding is confusing'), 'section answered');
      assert.ok(after.includes('- Progress: 0/5 phases complete'), '1 of 3 answered -> still 0 phases');
      assert.ok(after.includes('Q: Problem Statement'), 'history question recorded');
      assert.ok(after.includes('A: The onboarding is confusing'), 'history answer recorded');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('answering all sections flips status to ready', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-vision-ready-'));
    try {
      const { path: vp } = vision.createVision('Full Run', root);
      const sections = [
        'Problem Statement', 'Target User', 'Problem Severity',
        'Success Criteria', 'Impact Scale',
        'Minimum Viable Scope', 'Explicit Exclusions', 'Dependencies',
        'Failure Modes', 'Unknowns', 'Assumptions'
      ];
      for (const s of sections) {
        vision.saveVisionProgress(vp, s, `answer for ${s}`);
      }
      const after = fs.readFileSync(vp, 'utf8');
      assert.ok(after.includes('- Status: ready'), 'status flipped to ready after all sections');
      assert.ok(after.includes('- Progress: 3/5 phases complete'), '11 answers -> floor(11/3)=3 phases');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// convertToFunctional — writes a functional plan, updates the vision
// ---------------------------------------------------------------------------

describe('convertToFunctional', () => {
  test('missing vision file returns null', () => {
    const result = vision.convertToFunctional(path.join(projectRoot, 'ghost.md'), projectRoot);
    assert.strictEqual(result, null);
  });

  test('produces a functional plan from answered sections and marks the vision converted', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-vision-convert-'));
    try {
      const { path: vp } = vision.createVision('Portable Export', root);
      vision.saveVisionProgress(vp, 'Problem Statement', 'Users cannot export their data');
      vision.saveVisionProgress(vp, 'Target User', 'Power users');
      vision.saveVisionProgress(vp, 'Success Criteria', 'One-click CSV export');

      const result = vision.convertToFunctional(vp, root);
      assert.ok(result, 'returned a result');
      assert.strictEqual(result.functionalSlug, 'portable-export');
      assert.ok(fs.existsSync(result.functionalPath), 'functional plan written');

      const fn = fs.readFileSync(result.functionalPath, 'utf8');
      assert.ok(fn.includes('title: "Portable Export"'), 'frontmatter title');
      assert.ok(fn.includes('Users cannot export their data'), 'problem carried over');
      assert.ok(fn.includes('Power users'), 'target user carried over');
      assert.ok(fn.includes('One-click CSV export'), 'success criteria carried over');
      assert.ok(fn.includes('Not defined'), 'unanswered sections get a placeholder');

      // Vision file is updated: status converted + conversion note appended.
      const visionAfter = fs.readFileSync(vp, 'utf8');
      assert.ok(visionAfter.includes('- Status: converted'), 'vision marked converted');
      assert.ok(visionAfter.includes('Converted to: plans/functional/portable-export.md'), 'conversion note');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('falls back to the filename when the vision has no title header', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-vision-notitle-'));
    const vdir = path.join(root, 'plans', 'vision');
    fs.mkdirSync(vdir, { recursive: true });
    try {
      const vp = path.join(vdir, 'headless-idea.md');
      // No "# Vision:" header -> metadata.title is null -> basename fallback.
      fs.writeFileSync(vp, '## Status\n- Status: exploring\n\n### Problem Statement\n✓ Something\n', 'utf8');
      const result = vision.convertToFunctional(vp, root);
      assert.ok(result);
      assert.strictEqual(result.functionalSlug, 'headless-idea', 'slug from filename');
      assert.ok(fs.existsSync(result.functionalPath));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
