/**
 * CTOC — Pipeline dashboard AREA: non-obvious DATA/LOGIC coverage.
 *
 * Target: src/areas/pipeline.js. This suite deliberately AVOIDS render-only
 * "a string came back" filler (already covered by tests/area-modules.test.js and
 * tests/dashboard-injection.test.js). Every test pins a branch that goes RED under
 * mutation of the production code:
 *
 *   - per-stage count → section-total aggregation (the reduce sum, each stageCount case)
 *   - stage label humanization ('in-progress' → "In progress")
 *   - collapsed-vs-expanded chevron + the `if (!collapsed)` detail-suppression guard
 *   - count color boundary `n > 0 ? cyan : dim`
 *   - agent active/idle branch, the `agent.step` second operand, the `plan || 'unknown'` fallback
 *   - renderConflictPanel: empty→'', populated content, the `|| '?'` / `|| 'potential…'`
 *     / Array.isArray(files) fallbacks, the slice(0,5) truncation cap, the fail-open catch
 *   - pickSeedPlan stage-priority ordering (in-progress > todo > implementation) + null
 *   - prefetchConflicts: seed guard, non-function guard, non-array→[], slice cap, catch
 *   - activate: seed-only-when-unset guard, arrays always populated
 *   - handleKey: b/i/x toggles incl. the `|| key.sequence` second operand, and unknown→false
 *
 * Fakes only at the true boundary: the semantic index (plan-index) is stubbed via the
 * module cache for prefetchConflicts (network/index-class boundary), and the
 * filesystem/task-registry are real temp fixtures. No core logic is mocked. All temp
 * dirs are real os.tmpdir() projects, cleaned in `after`.
 *
 * AI-authored, human-reviewed line-by-line against the module (unit-test-writer skill).
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const pipeline = require('../src/areas/pipeline');
const { loadDashboardPrefs, saveDashboardPrefs } = require('../src/lib/sections');

// ── fixtures ────────────────────────────────────────────────────────────────
const tmpDirs = [];
function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-area-'));
  tmpDirs.push(dir);
  return dir;
}
after(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
  }
});

// Create `n` plan .md files in plans/<stage>/.
function mkPlans(root, stage, n, prefix) {
  const dir = path.join(root, 'plans', stage);
  fs.mkdirSync(dir, { recursive: true });
  for (let k = 0; k < n; k++) {
    fs.writeFileSync(path.join(dir, `${prefix || stage}-${k + 1}.md`), `# ${stage} ${k + 1}\n`);
  }
}

// Write a live "running implement" task-registry (drives getAgentStatus liveness),
// and optionally the supplementary agent.json detail (drives agent.step).
function writeRunningAgent(root, { plan, step } = {}) {
  const stateDir = path.join(root, '.ctoc', 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  const task = {
    id: 't1', kind: 'implement', status: 'running', touches: ['src/x.js'],
    ts: { created: '2026-01-01T00:00:00.000Z', started: '2026-01-01T00:00:00.000Z' },
  };
  if (plan !== undefined) task.plan = plan;
  fs.writeFileSync(
    path.join(stateDir, 'tasks.json'),
    JSON.stringify({ version: 1, generation: 0, seq: 1, tasks: [task] }),
  );
  if (step !== undefined) fs.writeFileSync(path.join(stateDir, 'agent.json'), JSON.stringify({ step }));
}

// Strip ANSI SGR colour sequences so semantic text can be asserted directly.
const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

// Boundary fake: swap the plan-index module in the require cache for the duration
// of `fn` (async), then restore. plan-index is the semantic-index boundary — the
// legitimate place to substitute a stub, exactly as the module treats it.
const PLAN_INDEX = require.resolve('../src/lib/plan-index');
async function withStubbedPlanIndex(exportsObj, fn) {
  const original = require.cache[PLAN_INDEX];
  require.cache[PLAN_INDEX] = {
    id: PLAN_INDEX, filename: PLAN_INDEX, loaded: true, exports: exportsObj, children: [], paths: [],
  };
  try {
    return await fn();
  } finally {
    if (original) require.cache[PLAN_INDEX] = original;
    else delete require.cache[PLAN_INDEX];
  }
}

// ── render: per-stage count → section-total aggregation ──────────────────────
describe('pipeline.render — count aggregation (DATA)', () => {
  it('section total is the SUM of its member stage counts', () => {
    // Arrange — distinct counts so each section total is a distinct sum:
    //   business = vision(2)+canvas(1)+functional(3) = 6
    //   implementation = implementation(4)+todo(0)   = 4
    //   execution = in-progress(1)+review(2)+done(5) = 8
    const root = tmpProject();
    mkPlans(root, 'vision', 2);
    mkPlans(root, 'canvas', 1);
    mkPlans(root, 'functional', 3);
    mkPlans(root, 'implementation', 4);
    mkPlans(root, 'in-progress', 1);
    mkPlans(root, 'review', 2);
    mkPlans(root, 'done', 5);

    // Act
    const out = plain(pipeline.render({ projectPath: root }));

    // Assert — a dropped/summed-wrong stage would change these totals.
    assert.match(out, /▼ Business \(6\)/);
    assert.match(out, /▼ Implementation \(4\)/);
    assert.match(out, /▼ Execution \(8\)/);
  });

  it('each stage renders its own count (stageCount case mapping)', () => {
    // Arrange
    const root = tmpProject();
    mkPlans(root, 'vision', 2);
    mkPlans(root, 'functional', 3);
    mkPlans(root, 'done', 5);
    // todo intentionally empty → 0

    // Act
    const out = plain(pipeline.render({ projectPath: root }));

    // Assert — stage labels never collide with the section headers.
    assert.match(out, /Vision\s+2/);
    assert.match(out, /Functional\s+3/);
    assert.match(out, /Done\s+5/);
    assert.match(out, /Todo\s+0/);
  });

  it('humanizes the "in-progress" stage label to "In progress"', () => {
    // Arrange
    const root = tmpProject();
    mkPlans(root, 'in-progress', 1);

    // Act
    const out = plain(pipeline.render({ projectPath: root }));

    // Assert — kills the `.replace(/-/g,' ')` + charAt-uppercase mutations.
    assert.match(out, /In progress\s+1/);
    assert.ok(!/In-progress/.test(out), 'hyphen must be humanized to a space');
  });
});

// ── render: collapsed section hides detail + flips chevron ────────────────────
describe('pipeline.render — collapse state (chevron + detail guard)', () => {
  it('collapsed section shows ▶ and omits its stage detail lines', () => {
    // Arrange — collapse only Implementation; Business stays expanded (control).
    const root = tmpProject();
    mkPlans(root, 'vision', 1);
    mkPlans(root, 'todo', 2);
    const prefs = loadDashboardPrefs(root);
    prefs.collapsed.implementation = true;
    saveDashboardPrefs(prefs, root);

    // Act
    const out = plain(pipeline.render({ projectPath: root }));

    // Assert — collapsed chevron + suppressed "Todo" detail; expanded control intact.
    assert.match(out, /▶ Implementation/);
    assert.ok(!/Todo/.test(out), 'collapsed section must not render its stage detail lines');
    assert.match(out, /▼ Business/);
    assert.match(out, /Vision\s+1/);
  });

  it('expanded section shows ▼ and renders its stage detail lines', () => {
    // Arrange
    const root = tmpProject();
    mkPlans(root, 'todo', 2);

    // Act
    const out = plain(pipeline.render({ projectPath: root }));

    // Assert
    assert.match(out, /▼ Implementation/);
    assert.match(out, /Todo\s+2/);
  });
});

// ── render: count colour boundary n>0 ? cyan : dim ───────────────────────────
describe('pipeline.render — count colour boundary', () => {
  it('colours a positive count cyan and never colours a zero count cyan', () => {
    // Arrange — functional(2) is the ONLY non-zero stage; every other stage is 0.
    const root = tmpProject();
    mkPlans(root, 'functional', 2);

    // Act — assert on the RAW (coloured) output.
    const raw = pipeline.render({ projectPath: root });

    // Assert — kills `n > 0` → `n >= 0` (would paint a 0 cyan) and → false (would dim the 2).
    assert.ok(raw.includes('\x1b[36m2\x1b[0m'), 'positive count must be cyan');
    assert.ok(!raw.includes('\x1b[36m0'), 'a zero count must never be cyan');
  });
});

// ── render: agent status branch ──────────────────────────────────────────────
describe('pipeline.render — agent status branch', () => {
  it('renders the active agent plan and step when an implement task is running', () => {
    // Arrange
    const root = tmpProject();
    writeRunningAgent(root, { plan: 'alpha-plan', step: 7 });

    // Act
    const raw = pipeline.render({ projectPath: root });
    const out = plain(raw);

    // Assert — active branch + plan + the `if (agent.step)` second operand.
    assert.ok(raw.includes('\x1b[32m●'), 'active agent shows the green ● marker');
    assert.match(out, /Agent: alpha-plan/);
    assert.match(out, /\(step 7\)/);
  });

  it('renders "Agent idle" when no implement task is running', () => {
    // Arrange — no tasks.json at all.
    const root = tmpProject();

    // Act
    const out = plain(pipeline.render({ projectPath: root }));

    // Assert — the else branch.
    assert.match(out, /Agent idle/);
    assert.ok(!/Agent: /.test(out), 'idle state must not print an active-agent line');
  });

  it('falls back to "unknown" when the running task carries no plan', () => {
    // Arrange — running implement task with NO plan field → getAgentStatus plan:null.
    const root = tmpProject();
    writeRunningAgent(root, { /* plan omitted */ });

    // Act
    const out = plain(pipeline.render({ projectPath: root }));

    // Assert — kills the `agent.plan || 'unknown'` second operand.
    assert.match(out, /Agent: unknown/);
    assert.ok(!/\(step /.test(out), 'no agent.json detail → no step suffix');
  });
});

// ── renderConflictPanel — empty / absent ─────────────────────────────────────
describe('pipeline.renderConflictPanel — empty states', () => {
  const rows = [
    { id: 'empty-array', app: { conflicts: [] } },
    { id: 'not-an-array', app: { conflicts: 'nope' } },
    { id: 'absent-field', app: {} },
    { id: 'null-app', app: null },
  ];
  for (const { id, app } of rows) {
    it(`returns '' when conflicts are absent/empty [${id}]`, () => {
      assert.equal(pipeline.renderConflictPanel(app), '');
    });
  }
});

// ── renderConflictPanel — populated content + fallbacks ──────────────────────
describe('pipeline.renderConflictPanel — content + fallbacks', () => {
  it('renders plan, severity and joined files for a full row', () => {
    // Arrange
    const app = { conflicts: [{ conflictingPlan: 'p1', overlappingFiles: ['a.js', 'b.js'], severity: 'blocking' }] };

    // Act
    const out = plain(pipeline.renderConflictPanel(app));

    // Assert
    assert.match(out, /Potential conflicts/);
    assert.match(out, /p1 \[blocking\]/);
    assert.match(out, /files: a\.js, b\.js/);
    assert.match(out, /Review before both plans enter implementation simultaneously\./);
  });

  it('uses the default severity label when severity is absent', () => {
    // Arrange — no `severity` key.
    const app = { conflicts: [{ conflictingPlan: 'p2', overlappingFiles: [] }] };

    // Act
    const out = plain(pipeline.renderConflictPanel(app));

    // Assert — kills the `|| 'potential conflict or dependency'` second operand.
    assert.match(out, /p2 \[potential conflict or dependency\]/);
  });

  it('uses "?" when the conflicting plan slug is absent', () => {
    // Arrange — no `conflictingPlan` key.
    const app = { conflicts: [{ overlappingFiles: ['x.js'], severity: 'warn' }] };

    // Act
    const out = plain(pipeline.renderConflictPanel(app));

    // Assert — kills the `|| '?'` second operand.
    assert.match(out, /\? \[warn\]/);
  });

  it('renders an empty file list (no throw) when overlappingFiles is absent', () => {
    // Arrange — overlappingFiles missing → Array.isArray false → [] → empty join.
    const app = { conflicts: [{ conflictingPlan: 'p3', severity: 'warn' }] };

    // Act
    const out = plain(pipeline.renderConflictPanel(app));

    // Assert — kills the `Array.isArray(files) ? files : []` guard (removal would throw).
    assert.match(out, /p3 \[warn\]/);
    assert.match(out, /files:\s*\n/); // "files: " with nothing after
  });

  it('truncates to the first 5 conflicts', () => {
    // Arrange — 6 rows; only 5 may render.
    const conflicts = [];
    for (let k = 1; k <= 6; k++) conflicts.push({ conflictingPlan: `p${k}`, overlappingFiles: [], severity: 's' });

    // Act
    const out = plain(pipeline.renderConflictPanel({ conflicts }));

    // Assert — kills the `.slice(0, 5)` cap (exact boundary).
    for (let k = 1; k <= 5; k++) assert.match(out, new RegExp(`\\bp${k}\\b`), `p${k} must render`);
    assert.ok(!/\bp6\b/.test(out), 'the 6th conflict must be truncated');
  });

  it('fails open to "" when a conflict row throws on access', () => {
    // Arrange — a row whose slug getter throws mid-render.
    const evil = { get conflictingPlan() { throw new Error('boom'); }, severity: 's', overlappingFiles: [] };

    // Act + Assert — kills removal of the try/catch (the throw would propagate).
    assert.equal(pipeline.renderConflictPanel({ conflicts: [evil] }), '');
  });
});

// ── pickSeedPlan — stage-priority ordering + null ────────────────────────────
describe('pipeline.pickSeedPlan — stage priority (ORDERING)', () => {
  it('prefers in-progress over todo and implementation', () => {
    // Arrange — a plan in every candidate stage.
    const root = tmpProject();
    mkPlans(root, 'in-progress', 1, 'ip');
    mkPlans(root, 'todo', 1, 'td');
    mkPlans(root, 'implementation', 1, 'impl');

    // Act + Assert — kills a reversed/reordered priority loop.
    assert.equal(pipeline.pickSeedPlan(root), 'ip-1');
  });

  it('falls back to todo when no in-progress plan exists', () => {
    // Arrange
    const root = tmpProject();
    fs.mkdirSync(path.join(root, 'plans', 'in-progress'), { recursive: true }); // present but empty
    mkPlans(root, 'todo', 1, 'td');
    mkPlans(root, 'implementation', 1, 'impl');

    // Act + Assert
    assert.equal(pipeline.pickSeedPlan(root), 'td-1');
  });

  it('falls back to implementation when only implementation drafts exist', () => {
    // Arrange
    const root = tmpProject();
    mkPlans(root, 'implementation', 1, 'impl');

    // Act + Assert — third-choice branch.
    assert.equal(pipeline.pickSeedPlan(root), 'impl-1');
  });

  it('returns null when no candidate plan exists', () => {
    // Arrange — bare project, no plan dirs.
    const root = tmpProject();

    // Act + Assert — the terminal null fallback.
    assert.equal(pipeline.pickSeedPlan(root), null);
  });

  it('swallows a read error and falls through to the next stage', () => {
    // Arrange — plans/in-progress is a FILE, so reading it throws ENOTDIR; a real
    // todo plan sits behind it.
    const root = tmpProject();
    fs.mkdirSync(path.join(root, 'plans'), { recursive: true });
    fs.writeFileSync(path.join(root, 'plans', 'in-progress'), 'not a directory');
    mkPlans(root, 'todo', 1, 'td');

    // Act + Assert — kills removal of the per-stage try/catch (the throw would escape).
    assert.equal(pipeline.pickSeedPlan(root), 'td-1');
  });
});

// ── prefetchConflicts — guards, cap, fail-open (boundary-stubbed index) ───────
describe('pipeline.prefetchConflicts — async bridge', () => {
  it('sets [] and does not call the index when the seed is not a string', async () => {
    // Arrange — non-string seed; stub would explode if reached.
    const root = tmpProject();
    const app = { projectPath: root, selectedPlan: 123 };

    await withStubbedPlanIndex(
      { detectConflicts: async () => { throw new Error('must not be called'); } },
      () => pipeline.prefetchConflicts(app),
    );

    // Assert — kills the `!seed || typeof seed !== 'string'` guard.
    assert.deepEqual(app.conflicts, []);
  });

  it('sets [] when the index exposes no detectConflicts function', async () => {
    // Arrange
    const root = tmpProject();
    const app = { projectPath: root, selectedPlan: 'seed' };

    await withStubbedPlanIndex({ /* no detectConflicts */ }, () => pipeline.prefetchConflicts(app));

    // Assert — kills the `typeof planIndex.detectConflicts !== 'function'` guard.
    assert.deepEqual(app.conflicts, []);
  });

  it('caps results at the first 5 rows', async () => {
    // Arrange — index returns 7 rows.
    const root = tmpProject();
    const app = { projectPath: root, selectedPlan: 'seed' };
    const seven = Array.from({ length: 7 }, (_, k) => ({ conflictingPlan: `c${k}` }));

    await withStubbedPlanIndex({ detectConflicts: async () => seven }, () => pipeline.prefetchConflicts(app));

    // Assert — kills the `.slice(0, 5)` cap.
    assert.equal(app.conflicts.length, 5);
    assert.equal(app.conflicts[4].conflictingPlan, 'c4');
  });

  it('sets [] when the index returns a non-array', async () => {
    // Arrange
    const root = tmpProject();
    const app = { projectPath: root, selectedPlan: 'seed' };

    await withStubbedPlanIndex({ detectConflicts: async () => ({ not: 'array' }) }, () => pipeline.prefetchConflicts(app));

    // Assert — kills the `Array.isArray(results) ? … : []` fallback.
    assert.deepEqual(app.conflicts, []);
  });

  it('fails open to [] (never rejects) when the index throws', async () => {
    // Arrange
    const root = tmpProject();
    const app = { projectPath: root, selectedPlan: 'seed' };

    // Act — must resolve, not reject.
    await withStubbedPlanIndex(
      { detectConflicts: async () => { throw new Error('index blew up'); } },
      () => pipeline.prefetchConflicts(app),
    );

    // Assert — kills removal of the catch (a reject/throw would fail the await).
    assert.deepEqual(app.conflicts, []);
  });
});

// ── activate — seeds selectedPlan only when unset ────────────────────────────
describe('pipeline.activate — seed guard', () => {
  it('seeds selectedPlan from the pipeline when unset, leaving both panels arrays', async () => {
    // Arrange — an in-progress plan exists to seed from.
    const root = tmpProject();
    mkPlans(root, 'in-progress', 1, 'ip');
    const app = { projectPath: root };

    // Act
    await pipeline.activate(app);

    // Assert — kills the seed assignment; panels always end as arrays (fail-open).
    assert.equal(app.selectedPlan, 'ip-1');
    assert.ok(Array.isArray(app.relatedPlans), 'relatedPlans populated as an array');
    assert.ok(Array.isArray(app.conflicts), 'conflicts populated as an array');
  });

  it('does NOT overwrite an already-set selectedPlan', async () => {
    // Arrange — caller pre-seeded a selection; a different plan exists on disk.
    const root = tmpProject();
    mkPlans(root, 'in-progress', 1, 'ip');
    const app = { projectPath: root, selectedPlan: 'keepme' };

    // Act
    await pipeline.activate(app);

    // Assert — kills removal of the `if (!app.selectedPlan)` guard.
    assert.equal(app.selectedPlan, 'keepme');
  });

  it('fails open (never throws) when app is null', async () => {
    // Act + Assert — `null.selectedPlan` throws inside the try; the catch must
    // swallow it so activation never breaks the menu. Kills removal of the catch.
    await assert.doesNotReject(() => pipeline.activate(null));
  });
});

// ── handleKey — toggle state machine ─────────────────────────────────────────
describe('pipeline.handleKey — section toggles', () => {
  it('toggles Implementation collapse on "i" and reports handled', () => {
    // Arrange
    const root = tmpProject();
    const before = loadDashboardPrefs(root).collapsed.implementation;

    // Act
    const handled = pipeline.handleKey({ name: 'i', sequence: 'i' }, { projectPath: root });

    // Assert
    assert.equal(handled, true);
    assert.notEqual(loadDashboardPrefs(root).collapsed.implementation, before);
  });

  it('toggles Execution collapse on "x" and reports handled', () => {
    // Arrange
    const root = tmpProject();
    const before = loadDashboardPrefs(root).collapsed.execution;

    // Act
    const handled = pipeline.handleKey({ name: 'x', sequence: 'x' }, { projectPath: root });

    // Assert
    assert.equal(handled, true);
    assert.notEqual(loadDashboardPrefs(root).collapsed.execution, before);
  });

  it('matches on key.sequence when key.name differs (|| second operand)', () => {
    // Arrange — name is unrelated but the raw sequence is 'b'.
    const root = tmpProject();
    const before = loadDashboardPrefs(root).collapsed.business;

    // Act
    const handled = pipeline.handleKey({ name: 'return', sequence: 'b' }, { projectPath: root });

    // Assert — kills the `|| key.sequence === 'b'` second operand.
    assert.equal(handled, true);
    assert.notEqual(loadDashboardPrefs(root).collapsed.business, before);
  });

  it('returns false and mutates nothing for an unrelated key', () => {
    // Arrange
    const root = tmpProject();
    const snapshot = JSON.stringify(loadDashboardPrefs(root));

    // Act
    const handled = pipeline.handleKey({ name: 'z', sequence: 'z' }, { projectPath: root });

    // Assert — the terminal `return false`; no prefs write for an unknown key.
    assert.equal(handled, false);
    assert.equal(JSON.stringify(loadDashboardPrefs(root)), snapshot);
  });
});
