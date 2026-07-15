/**
 * EC5-s4 — iron-loop-compliance-trigger DARK-BRANCH coverage tests.
 *
 * Companion to tests/iron-loop-compliance-trigger.test.js. That file pins the
 * happy trigger decisions, the surgical upsert on a normal plan, and the
 * NO-DISPATCH / GATE source invariants. This file deliberately targets the
 * branches those tests leave dark, and each test is written so a mutation of the
 * production line goes RED:
 *
 *   - the try/catch fail-open in writeComplianceTrigger (source lines 165-167):
 *     a real fs throw (readFileSync of a DIRECTORY ⇒ EISDIR) must yield
 *     {ok:false} WITHOUT throwing and WITHOUT losing the already-computed
 *     advisory descriptor — even when a regime is active.
 *   - the `sep` ternary in upsertTriggerBlock (source line 106): the SECOND
 *     operand of the `||` (`fmBody.length === 0`) and the FIRST (`endsWith('\n')`)
 *     — an empty frontmatter body and a body that already ends in a newline must
 *     each append the block with EXACTLY the right number of separating newlines.
 *   - the child-consume loop's non-indented STOP condition in upsertTriggerBlock
 *     (source line 112, `/^[ \t]+\S/` returning false while endIdx < length): a
 *     rewrite of an EXISTING block that is followed by another top-level key must
 *     replace in place and PRESERVE the following key.
 *   - the gating direction: a fail-open (all-false) evaluation must still write a
 *     block whose values are FALSE — an absent regime never fabricates a true
 *     trigger.
 *
 * REAL module, REAL os.tmpdir() fixtures, REAL shipped regime profiles copied in.
 * No mocking of core logic — the only boundary exercised is the genuine
 * filesystem (a directory that cannot be read as a file).
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const trigger = require('../src/lib/iron-loop-compliance-trigger');

const REPO_ROOT = path.join(__dirname, '..');
const REGIMES_SRC = path.join(REPO_ROOT, '.ctoc', 'regulatory-regimes');

const GDPR = 'gdpr';
const EU_AI_ACT = 'eu-ai-act-high-risk';

// The block renderTriggerBlock produces for an all-false (fail-open) descriptor.
// Kept as an explicit literal so the upsert-mechanics assertions compare against
// a byte-exact expectation rather than a loose regex.
const FALSE_BLOCK = [
  'compliance_trigger:',
  '  runGdpr: false',
  '  runEuAiAct: false',
  '  dispatcher: cto-chief',
].join('\n');

const tmpDirs = [];

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'il-compliance-trigger-cov-'));
  tmpDirs.push(dir);
  return dir;
}

// Build a tmp project carrying a real .ctoc/settings.yaml AND a copy of the
// shipped regulatory-regimes/ dir, so the resolver sees the real profiles.
function projectWithRegime(activeProfilesLine) {
  const dir = tmpProject();
  fs.mkdirSync(path.join(dir, '.ctoc', 'regulatory-regimes'), { recursive: true });
  for (const f of fs.readdirSync(REGIMES_SRC)) {
    if (f.endsWith('.yaml')) {
      fs.copyFileSync(path.join(REGIMES_SRC, f), path.join(dir, '.ctoc', 'regulatory-regimes', f));
    }
  }
  const yaml = [
    'timezone: "UTC"',
    '',
    'regulatory_regime:',
    `  active_profiles: ${activeProfilesLine}`,
    '  overrides: {}',
    '',
    'enforcement:',
    '  mode: strict',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dir, '.ctoc', 'settings.yaml'), yaml);
  return dir;
}

function rawPlan(dir, name, content) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
}

// Extract the FIRST frontmatter body using the SAME regex the module uses, so
// the upsert-mechanics tests assert on exactly the region the writer rebuilt.
function frontmatterBody(content) {
  const m = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  assert.ok(m, 'expected a frontmatter block to be present');
  return m[2];
}

after(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe('writeComplianceTrigger — fail-open through the real fs catch (lines 165-167)', () => {
  it('planPath is a directory (readFileSync throws EISDIR) ⇒ {ok:false}, no throw, advisory descriptor preserved with regime TRUE', () => {
    // Arrange — a project with BOTH regimes active, and a planPath that exists
    // but is a DIRECTORY, so safeFs.existsSync passes yet safeFs.readFileSync
    // throws a real EISDIR — the only way into the module's catch clause.
    const root = projectWithRegime(`[${GDPR}, ${EU_AI_ACT}]`);
    const dirAsPlan = path.join(root, 'i-am-a-directory.md');
    fs.mkdirSync(dirAsPlan);

    // Act
    let res;
    assert.doesNotThrow(() => { res = trigger.writeComplianceTrigger(dirAsPlan, root); });

    // Assert — write failed open, but the already-evaluated advisory trigger
    // still reflects the active regimes (CTO Chief still learns runGdpr:true).
    assert.equal(res.ok, false);
    assert.deepEqual(res.trigger, { runGdpr: true, runEuAiAct: true, dispatcher: 'cto-chief' });
    // The directory was not clobbered into a file.
    assert.equal(fs.statSync(dirAsPlan).isDirectory(), true, 'planPath directory left intact');
  });

  it('catch fail-open still returns the all-false descriptor when the regime is off', () => {
    // Arrange — no active regime; the descriptor is all-false, and the write
    // still fails open through the catch (directory planPath).
    const root = projectWithRegime('[]');
    const dirAsPlan = path.join(root, 'dir-plan.md');
    fs.mkdirSync(dirAsPlan);

    // Act
    const res = trigger.writeComplianceTrigger(dirAsPlan, root);

    // Assert — fail-open never fabricates a true trigger.
    assert.equal(res.ok, false);
    assert.deepEqual(res.trigger, { runGdpr: false, runEuAiAct: false, dispatcher: 'cto-chief' });
  });
});

describe('writeComplianceTrigger — upsert separator ternary (source line 106)', () => {
  it('empty frontmatter body ⇒ block appended with NO leading blank line (|| second operand: length === 0)', () => {
    // Arrange — a frontmatter whose body is the empty string. sep must be '' via
    // the SECOND operand of the `||` (endsWith('\n') is false; length === 0 true).
    // A non-string root keeps the evaluated trigger deterministically all-false.
    const dir = tmpProject();
    const p = rawPlan(dir, 'empty-body.md', '---\n\n---\nbody\n');

    // Act
    const res = trigger.writeComplianceTrigger(p, undefined);

    // Assert — the whole frontmatter body is exactly the block, with no blank
    // line inserted after the opening delimiter (a sep='\n' mutant would red).
    assert.equal(res.ok, true);
    const body = frontmatterBody(fs.readFileSync(p, 'utf8'));
    assert.equal(body, FALSE_BLOCK);
  });

  it('frontmatter body ending in a newline ⇒ single separator, not a doubled blank line (|| first operand: endsWith("\\n"))', () => {
    // Arrange — after the module's non-greedy regex, this body resolves to
    // "title: X\n", which endsWith('\n') ⇒ sep=''. A mutant flipping that branch
    // to sep='\n' would produce "title: X\n\ncompliance_trigger:".
    const dir = tmpProject();
    const p = rawPlan(dir, 'trailing-nl.md', '---\ntitle: X\n\n---\nbody\n');

    // Act
    const res = trigger.writeComplianceTrigger(p, undefined);

    // Assert — exactly one newline between the retained key and the block.
    assert.equal(res.ok, true);
    const body = frontmatterBody(fs.readFileSync(p, 'utf8'));
    assert.equal(body, `title: X\n${FALSE_BLOCK}`);
    assert.equal(body.includes('title: X\n\ncompliance_trigger:'), false, 'no doubled blank line');
  });
});

describe('writeComplianceTrigger — rewrite an existing block FOLLOWED by another key (source line 112)', () => {
  it('replaces the block in place, recomputes values, and preserves the following top-level key', () => {
    // Arrange — a plan that ALREADY has a compliance_trigger block (with stale
    // true values) followed by a `status:` key. The child-consume loop must stop
    // at `status:` (the `/^[ \t]+\S/` test returns FALSE for a non-indented line
    // while endIdx < length) so the following key survives the upsert.
    const dir = tmpProject();
    const content = [
      '---',
      'title: A',
      'compliance_trigger:',
      '  runGdpr: true',
      '  runEuAiAct: true',
      '  dispatcher: cto-chief',
      'status: todo',
      '---',
      '# body',
      '',
    ].join('\n');
    const p = rawPlan(dir, 'has-block-then-key.md', content);

    // Act — a non-string root yields an all-false evaluation, so a correct
    // rewrite must FLIP the stale true values to false in place.
    const res = trigger.writeComplianceTrigger(p, undefined);

    // Assert
    assert.equal(res.ok, true);
    const after = fs.readFileSync(p, 'utf8');
    // Exactly one block — replaced, not appended/duplicated.
    assert.equal((after.match(/compliance_trigger:/g) || []).length, 1);
    // Values recomputed to false (a "don't recompute" mutant keeps them true).
    assert.match(after, /runGdpr:\s*false/);
    assert.match(after, /runEuAiAct:\s*false/);
    // Both the preceding and the FOLLOWING top-level keys survived.
    assert.match(after, /^title: A$/m);
    assert.match(after, /^status: todo$/m);
    // Ordering preserved: title before the block, status after it (a loop that
    // over-consumes `status: todo` would drop it or reorder it).
    const body = frontmatterBody(after);
    assert.equal(
      body,
      ['title: A', FALSE_BLOCK, 'status: todo'].join('\n'),
      'block replaced in place between title and status',
    );
  });
});

describe('writeComplianceTrigger — gating direction: absent regime writes a FALSE block, not a true one', () => {
  it('regime off ⇒ ok:true and a persisted block whose values are false (advisory, never over-triggers)', () => {
    // Arrange — regime empty; the plan is a normal, valid frontmatter file.
    const root = projectWithRegime('[]');
    const p = rawPlan(root, 'plan.md', ['---', 'title: "P"', '---', '# P', ''].join('\n'));

    // Act
    const res = trigger.writeComplianceTrigger(p, root);

    // Assert — the write succeeds AND the persisted trigger is false. A mutant
    // that defaulted the trigger to true, or skipped the write when off, reds.
    assert.equal(res.ok, true);
    assert.deepEqual(res.trigger, { runGdpr: false, runEuAiAct: false, dispatcher: 'cto-chief' });
    const after = fs.readFileSync(p, 'utf8');
    assert.match(after, /runGdpr:\s*false/);
    assert.match(after, /runEuAiAct:\s*false/);
    assert.match(after, /dispatcher:\s*cto-chief/);
  });

  it('GDPR-only regime writes runGdpr:true but runEuAiAct:false — the two gates are independent', () => {
    // Arrange — only the gdpr profile active. This pins that the writer reads BOTH
    // gates independently: a mutant that mirrored one gate onto the other reds.
    const root = projectWithRegime(`[${GDPR}]`);
    const p = rawPlan(root, 'plan.md', ['---', 'title: "P"', '---', '# P', ''].join('\n'));

    // Act
    const res = trigger.writeComplianceTrigger(p, root);

    // Assert
    assert.equal(res.ok, true);
    assert.deepEqual(res.trigger, { runGdpr: true, runEuAiAct: false, dispatcher: 'cto-chief' });
    const after = fs.readFileSync(p, 'utf8');
    assert.match(after, /runGdpr:\s*true/);
    assert.match(after, /runEuAiAct:\s*false/);
  });
});
