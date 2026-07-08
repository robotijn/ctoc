/**
 * EC5-s4 — Iron Loop compliance-trigger EMISSION tests.
 *
 * The load-bearing invariant (parent adversarial review): library code MUST NOT
 * dispatch agents. `iron-loop-compliance-trigger.js` EMITS a trigger condition
 * at the functional→implementation seam — gated on shouldRunGdpr /
 * shouldRunEuAiAct — and writes it into a plan's frontmatter under
 * `compliance_trigger:`. CTO Chief (EC5-s5) reads that and dispatches. This
 * module dispatches NOTHING.
 *
 * These tests exercise the REAL evaluator against a REAL settings.yaml + the
 * shipped regime profiles copied into a tmp project, and the REAL writer against
 * a REAL tmp plan file — no mocks of core logic. They also assert two source-
 * level invariants directly from disk:
 *   - NO-DISPATCH: the module requires no agent runner and names no dispatch.
 *   - GATE-INVARIANT: human-gate-check's HUMAN_GATES still has exactly the 3
 *     destination keys, and this module names no gate key and imports no hook.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const trigger = require('../src/lib/iron-loop-compliance-trigger');

const REPO_ROOT = path.join(__dirname, '..');
const REGIMES_SRC = path.join(REPO_ROOT, '.ctoc', 'regulatory-regimes');
const MODULE_PATH = path.join(REPO_ROOT, 'src', 'lib', 'iron-loop-compliance-trigger.js');
const GATE_HOOK_PATH = path.join(REPO_ROOT, 'src', 'hooks', 'human-gate-check.js');

const GDPR = 'gdpr';
const EU_AI_ACT = 'eu-ai-act-high-risk';

const tmpDirs = [];

// Build a tmp project with a real .ctoc/settings.yaml AND a copy of the real
// regulatory-regimes/ dir so the resolver sees gdpr.yaml + eu-ai-act-high-risk
// exactly as shipped. `activeProfilesLine` is an inline bracket list.
function projectWith(activeProfilesLine, { writeSettings = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'il-compliance-trigger-'));
  tmpDirs.push(dir);
  fs.mkdirSync(path.join(dir, '.ctoc', 'regulatory-regimes'), { recursive: true });
  for (const f of fs.readdirSync(REGIMES_SRC)) {
    if (f.endsWith('.yaml')) {
      fs.copyFileSync(path.join(REGIMES_SRC, f), path.join(dir, '.ctoc', 'regulatory-regimes', f));
    }
  }
  if (writeSettings) {
    const yaml = [
      'timezone: "UTC"',
      '',
      'regulatory_regime:',
      `  active_profiles: ${activeProfilesLine}`,
      '  overrides: {}',
      '',
      'enforcement:',
      '  mode: strict',
      ''
    ].join('\n');
    fs.writeFileSync(path.join(dir, '.ctoc', 'settings.yaml'), yaml);
  }
  return dir;
}

// A realistic plan file with a frontmatter block + a body, for the writer tests.
function planFile(dir, name, frontmatterLines, body) {
  const p = path.join(dir, name);
  const content = ['---', ...frontmatterLines, '---', '', ...body].join('\n');
  fs.writeFileSync(p, content);
  return p;
}

after(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe('evaluateComplianceTrigger — gated emission', () => {
  it('both profiles active ⇒ {runGdpr:true, runEuAiAct:true, dispatcher:cto-chief}', () => {
    const root = projectWith(`[${GDPR}, ${EU_AI_ACT}]`);
    const t = trigger.evaluateComplianceTrigger(root);
    assert.deepEqual(t, { runGdpr: true, runEuAiAct: true, dispatcher: 'cto-chief' });
  });

  it('GDPR only ⇒ {runGdpr:true, runEuAiAct:false, dispatcher:cto-chief}', () => {
    const root = projectWith(`[${GDPR}]`);
    const t = trigger.evaluateComplianceTrigger(root);
    assert.deepEqual(t, { runGdpr: true, runEuAiAct: false, dispatcher: 'cto-chief' });
  });

  it('EU AI Act only ⇒ {runGdpr:false, runEuAiAct:true, dispatcher:cto-chief}', () => {
    const root = projectWith(`[${EU_AI_ACT}]`);
    const t = trigger.evaluateComplianceTrigger(root);
    assert.deepEqual(t, { runGdpr: false, runEuAiAct: true, dispatcher: 'cto-chief' });
  });

  it('neither ⇒ {runGdpr:false, runEuAiAct:false, dispatcher:cto-chief}', () => {
    const root = projectWith('[]');
    const t = trigger.evaluateComplianceTrigger(root);
    assert.deepEqual(t, { runGdpr: false, runEuAiAct: false, dispatcher: 'cto-chief' });
  });

  it('non-string root ⇒ fail-open all-false, dispatcher still cto-chief', () => {
    for (const bad of [undefined, null, 42, {}, '']) {
      const t = trigger.evaluateComplianceTrigger(bad);
      assert.deepEqual(t, { runGdpr: false, runEuAiAct: false, dispatcher: 'cto-chief' });
    }
  });

  it('dispatcher is ALWAYS the literal "cto-chief", never "iron-loop", across every combo', () => {
    for (const line of [`[${GDPR}, ${EU_AI_ACT}]`, `[${GDPR}]`, `[${EU_AI_ACT}]`, '[]']) {
      const t = trigger.evaluateComplianceTrigger(projectWith(line));
      assert.equal(t.dispatcher, 'cto-chief');
      assert.notEqual(t.dispatcher, 'iron-loop');
    }
  });
});

describe('writeComplianceTrigger — surgical frontmatter upsert', () => {
  it('upserts compliance_trigger without touching other keys or the body', () => {
    const root = projectWith(`[${GDPR}, ${EU_AI_ACT}]`);
    const before = [
      'title: "A plan"',
      'status: todo',
      'iron_loop: true'
    ];
    const body = ['# A plan', '', 'Body text stays byte-identical.', ''];
    const p = planFile(root, 'plan.md', before, body);
    const original = fs.readFileSync(p, 'utf8');

    const res = trigger.writeComplianceTrigger(p, root);
    assert.equal(res.ok, true);
    assert.deepEqual(res.trigger, { runGdpr: true, runEuAiAct: true, dispatcher: 'cto-chief' });

    const after = fs.readFileSync(p, 'utf8');
    // Other frontmatter keys byte-identical.
    assert.match(after, /^title: "A plan"$/m);
    assert.match(after, /^status: todo$/m);
    assert.match(after, /^iron_loop: true$/m);
    // Body unchanged.
    assert.ok(after.includes('Body text stays byte-identical.'));
    assert.ok(after.split('---').length >= 3, 'frontmatter delimiters preserved');
    // The compliance_trigger block is present with the expected values.
    assert.match(after, /compliance_trigger:/);
    assert.match(after, /runGdpr:\s*true/);
    assert.match(after, /runEuAiAct:\s*true/);
    assert.match(after, /dispatcher:\s*cto-chief/);
    // Only the trigger region changed relative to the original.
    assert.notEqual(after, original);
  });

  it('re-write replaces, does not duplicate the block', () => {
    const root = projectWith(`[${GDPR}]`);
    const p = planFile(root, 'plan.md', ['title: "P"'], ['# P', '']);
    trigger.writeComplianceTrigger(p, root);
    const res2 = trigger.writeComplianceTrigger(p, root);
    assert.equal(res2.ok, true);
    const after = fs.readFileSync(p, 'utf8');
    const occurrences = (after.match(/compliance_trigger:/g) || []).length;
    assert.equal(occurrences, 1, 'exactly one compliance_trigger block after two writes');
  });

  it('re-write updates values when the regime changes', () => {
    const rootA = projectWith(`[${GDPR}]`);
    const p = planFile(rootA, 'plan.md', ['title: "P"'], ['# P', '']);
    trigger.writeComplianceTrigger(p, rootA);
    // Now write again with BOTH profiles active (a different project root).
    const rootB = projectWith(`[${GDPR}, ${EU_AI_ACT}]`);
    const res = trigger.writeComplianceTrigger(p, rootB);
    assert.equal(res.ok, true);
    const after = fs.readFileSync(p, 'utf8');
    assert.match(after, /runEuAiAct:\s*true/);
    assert.equal((after.match(/compliance_trigger:/g) || []).length, 1);
  });

  it('fail-open: missing plan file ⇒ {ok:false}, no throw, no file created', () => {
    const root = projectWith(`[${GDPR}]`);
    const missing = path.join(root, 'does-not-exist.md');
    let res;
    assert.doesNotThrow(() => { res = trigger.writeComplianceTrigger(missing, root); });
    assert.equal(res.ok, false);
    assert.deepEqual(res.trigger, { runGdpr: true, runEuAiAct: false, dispatcher: 'cto-chief' });
    assert.equal(fs.existsSync(missing), false, 'no file fabricated');
  });

  it('fail-open: plan with no frontmatter ⇒ {ok:false}, file unchanged', () => {
    const root = projectWith('[]');
    const p = path.join(root, 'no-fm.md');
    fs.writeFileSync(p, '# Just a body, no frontmatter\n');
    const original = fs.readFileSync(p, 'utf8');
    const res = trigger.writeComplianceTrigger(p, root);
    assert.equal(res.ok, false);
    assert.equal(fs.readFileSync(p, 'utf8'), original, 'file byte-unchanged');
  });

  it('fail-open: non-string planPath ⇒ {ok:false}, no throw', () => {
    const root = projectWith('[]');
    let res;
    assert.doesNotThrow(() => { res = trigger.writeComplianceTrigger(undefined, root); });
    assert.equal(res.ok, false);
  });
});

describe('NO-DISPATCH invariant (load-bearing)', () => {
  const src = fs.readFileSync(MODULE_PATH, 'utf8');

  it('module dispatches nothing: requires no agent runner and names no dispatch call', () => {
    // No agent-runner imports.
    for (const forbidden of [
      'gdpr-agent-runner',
      'eu-ai-act-agent-runner',
      'compliance-integration',
      'agent-runner'
    ]) {
      assert.equal(src.includes(forbidden), false, `must not reference ${forbidden}`);
    }
    // No require of a dispatcher/agent module, no Task tool, no spawn/exec.
    assert.equal(/require\(\s*['"][^'"]*(agent|dispatch|runner)[^'"]*['"]\s*\)/i.test(src), false,
      'must not require any agent/dispatch/runner module');
    assert.equal(/child_process|spawn\(|execSync|exec\(/.test(src), false,
      'must not spawn a process');
    assert.equal(/\bTask\b/.test(src), false, 'must not reference the Task tool');
  });

  it('never assigns dispatcher to iron-loop; only ever cto-chief', () => {
    assert.equal(/dispatcher\s*:\s*['"]iron-loop['"]/.test(src), false,
      "source must never set dispatcher: 'iron-loop'");
    assert.match(src, /dispatcher\s*:\s*['"]cto-chief['"]/,
      "source must set dispatcher: 'cto-chief'");
  });

  it('does not move plans (no rename to a plan stage dir, no unlink)', () => {
    assert.equal(/renameSync|\.rename\(/.test(src), false, 'must not move/rename plan files');
    assert.equal(/unlinkSync|\.unlink\(/.test(src), false, 'must not delete plan files');
  });
});

describe('GATE-INVARIANT (load-bearing)', () => {
  it('human-gate-check HUMAN_GATES still has exactly the 3 destination keys', () => {
    delete require.cache[require.resolve('../src/hooks/human-gate-check.js')];
    // The hook runs main() at module load and calls process.exit — do NOT
    // require it. Assert against its source directly.
    const hookSrc = fs.readFileSync(GATE_HOOK_PATH, 'utf8');
    const block = hookSrc.match(/const HUMAN_GATES\s*=\s*\{([\s\S]*?)\};/);
    assert.ok(block, 'HUMAN_GATES object literal present');
    const keys = [...block[1].matchAll(/'([a-z]+)'\s*:/g)].map(m => m[1]);
    assert.deepEqual(keys.sort(), ['done', 'implementation', 'todo']);
  });

  it('trigger module names no gate key and imports no hook', () => {
    const src = fs.readFileSync(MODULE_PATH, 'utf8');
    for (const gateKey of ['HUMAN_GATES', 'requireReviewGate', 'enforcementMode', 'review_gate']) {
      assert.equal(src.includes(gateKey), false, `must not name gate key ${gateKey}`);
    }
    assert.equal(/require\(\s*['"]\.\.?\/hooks\//.test(src), false, 'must not require any hook');
  });
});
