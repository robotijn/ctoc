/**
 * Product Loop tests (v8.4)
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const projectRoot = path.join(__dirname, '..');

function loadModule() {
  const p = require.resolve('../src/lib/product-loop');
  delete require.cache[p];
  return require('../src/lib/product-loop');
}

describe('Product Loop — canonical KPI library', () => {
  it('.ctoc/templates/product-kpis.yaml exists', () => {
    assert.ok(fs.existsSync(path.join(projectRoot, '.ctoc/templates/product-kpis.yaml')));
  });

  it('loadCanonicalKPIs returns at least 10 KPIs', () => {
    const originalCwd = process.cwd();
    process.chdir(projectRoot);
    try {
      const { loadCanonicalKPIs } = loadModule();
      const kpis = loadCanonicalKPIs();
      assert.ok(kpis.length >= 10, `expected ≥10 canonical KPIs, got ${kpis.length}`);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('canonical KPIs include activation_rate, w1_retention, mrr, monthly_churn', () => {
    const originalCwd = process.cwd();
    process.chdir(projectRoot);
    try {
      const { loadCanonicalKPIs } = loadModule();
      const ids = loadCanonicalKPIs().map(k => k.id);
      for (const expected of ['activation_rate', 'w1_retention', 'mrr', 'monthly_churn']) {
        assert.ok(ids.includes(expected), `missing canonical KPI: ${expected}`);
      }
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('getApplicableKPIs filters by project type', () => {
    const originalCwd = process.cwd();
    process.chdir(projectRoot);
    try {
      const { getApplicableKPIs } = loadModule();
      const saasKpis = getApplicableKPIs({ projectType: 'saas-b2c' });
      assert.ok(saasKpis.length > 0, 'should return saas-b2c KPIs');
      // All returned KPIs should have applicable_to including saas-b2c (or empty/missing)
      for (const k of saasKpis) {
        if (k.applicable_to && k.applicable_to.length > 0) {
          assert.ok(k.applicable_to.includes('saas-b2c'), `${k.id} should be applicable to saas-b2c`);
        }
      }
    } finally {
      process.chdir(originalCwd);
    }
  });
});

describe('Product Loop — template KPI plan', () => {
  it('saas/b2c-subscription has a kpi-plan.yaml', () => {
    const p = path.join(projectRoot, '.ctoc/templates/saas/b2c-subscription/kpi-plan.yaml');
    assert.ok(fs.existsSync(p), 'b2c template must have a kpi-plan.yaml');
  });

  it('loadTemplateKPIPlan returns launch_kpis for b2c', () => {
    const originalCwd = process.cwd();
    process.chdir(projectRoot);
    try {
      const { loadTemplateKPIPlan } = loadModule();
      const plan = loadTemplateKPIPlan('saas/b2c-subscription');
      assert.ok(plan, 'should load b2c plan');
      assert.ok(plan.launch_kpis.length >= 5, `expected ≥5 launch KPIs, got ${plan.launch_kpis.length}`);
      assert.ok(plan.launch_kpis.includes('activation_rate'));
      assert.ok(plan.launch_kpis.includes('mrr'));
    } finally {
      process.chdir(originalCwd);
    }
  });
});

describe('Product Loop — project KPI plan I/O', () => {
  let originalCwd;
  let tmpDir;

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-product-'));
    process.chdir(tmpDir);
    fs.mkdirSync('plans/canvas', { recursive: true });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('saveProjectKPIPlan + loadProjectKPIPlan round-trip', () => {
    const { saveProjectKPIPlan, loadProjectKPIPlan } = loadModule();
    saveProjectKPIPlan('my-saas', {
      project: 'my-saas',
      template_id: 'saas/b2c-subscription',
      activation_event: 'created_first_invoice',
      launch_kpis: [
        { id: 'activation_rate', target: '> 30%', rationale: 'canonical default' },
        { id: 'mrr', target: 'growing', rationale: 'pre-revenue baseline' },
      ],
      next_review: { cadence: 'weekly', first_review_date: '2026-05-21' },
    });
    const loaded = loadProjectKPIPlan('my-saas');
    assert.ok(loaded);
    assert.match(loaded.raw, /activation_rate/);
    assert.match(loaded.raw, /created_first_invoice/);
    assert.match(loaded.raw, /saas\/b2c-subscription/);
  });
});

describe('Product Loop — review + experiment storage', () => {
  let originalCwd;
  let tmpDir;

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-product-'));
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('saveReview writes to .ctoc/product-loop/reviews/', () => {
    const { saveReview, listReviews, latestReview } = loadModule();
    saveReview('2026-05-14', '# Review\nKPI snapshot...');
    saveReview('2026-05-21', '# Review\nLater...');
    const all = listReviews();
    assert.equal(all.length, 2);
    assert.match(latestReview(), /2026-05-21\.md$/);
  });

  it('saveExperiment writes to .ctoc/product-loop/experiments/', () => {
    const { saveExperiment, listExperiments } = loadModule();
    saveExperiment('exp1', 'status: designed\nhypothesis: x');
    saveExperiment('exp2', 'status: running\nhypothesis: y');
    const all = listExperiments();
    assert.equal(all.length, 2);
    const running = listExperiments({ status: 'running' });
    assert.equal(running.length, 1);
    assert.equal(running[0].id, 'exp2');
  });
});

describe('Product Loop — review scheduling', () => {
  let originalCwd;
  let tmpDir;

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-product-'));
    process.chdir(tmpDir);
    fs.mkdirSync('plans/canvas', { recursive: true });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('nextReviewDue returns null if no plan exists', () => {
    const { nextReviewDue } = loadModule();
    assert.equal(nextReviewDue('nonexistent'), null);
  });

  it('nextReviewDue computes 7 days from creation if no reviews exist', () => {
    const { saveProjectKPIPlan, nextReviewDue } = loadModule();
    saveProjectKPIPlan('my-saas', {
      project: 'my-saas',
      launch_kpis: [{ id: 'activation_rate', target: '> 30%' }],
    });
    const due = nextReviewDue('my-saas', 7);
    assert.ok(due, 'should compute a due date');
    assert.match(due, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('Product Loop — agent + skill conformance', () => {
  it('kpi-planner exists at tier:1 reporting outside the CTO Chief chain (Product Loop, not Iron Loop)', () => {
    const p = path.join(projectRoot, 'agents/planning/kpi-planner.md');
    assert.ok(fs.existsSync(p), 'kpi-planner.md must exist');
    const content = fs.readFileSync(p, 'utf8');
    assert.match(content, /^tier:\s*1$/m);
    assert.match(content, /reports_to:\s*user/);
  });

  it('product-reviewer skill exists at tier:2', () => {
    const p = path.join(projectRoot, 'skills/product/product-reviewer/SKILL.md');
    assert.ok(fs.existsSync(p), 'product-reviewer SKILL.md must exist');
    const content = fs.readFileSync(p, 'utf8');
    assert.match(content, /^tier:\s*2$/m);
    assert.match(content, /dispatch_protocol:\s*v1/);
    assert.match(content, /max_subagents:\s*0/);
  });

  it('experiment-designer skill exists at tier:2', () => {
    const p = path.join(projectRoot, 'skills/product/experiment-designer/SKILL.md');
    assert.ok(fs.existsSync(p), 'experiment-designer SKILL.md must exist');
    const content = fs.readFileSync(p, 'utf8');
    assert.match(content, /^tier:\s*2$/m);
    assert.match(content, /dispatch_protocol:\s*v1/);
  });

  it('redirect stubs at agents/product/ point to skills/product/', () => {
    for (const name of ['product-reviewer', 'experiment-designer']) {
      const p = path.join(projectRoot, 'agents/product', `${name}.md`);
      assert.ok(fs.existsSync(p), `redirect stub agents/product/${name}.md must exist`);
      const content = fs.readFileSync(p, 'utf8');
      assert.match(content, /type:\s+wrapper/);
      assert.match(content, new RegExp(`target_skill:\\s+product/${name}`));
    }
  });
});

describe('Product Loop — docs + command surface', () => {
  it('docs/PRODUCT_LOOP.md exists', () => {
    assert.ok(fs.existsSync(path.join(projectRoot, 'docs/PRODUCT_LOOP.md')));
  });

  it('Product Loop slash commands are removed — workflow goes through the menu (v6.9.32)', () => {
    // v6.9.32: the slash-command surface is menu, push, update only.
    // kpi-status and product-review were removed; the Product Loop is
    // dispatched outside the slash-command surface (see docs/PRODUCT_LOOP.md).
    assert.ok(!fs.existsSync(path.join(projectRoot, 'src/commands/product-review.md')),
      'product-review slash command must be removed');
    assert.ok(!fs.existsSync(path.join(projectRoot, 'src/commands/kpi-status.md')),
      'kpi-status slash command must be removed');
  });
});
