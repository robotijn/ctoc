/**
 * Fence: the Iron Loop documentation's claim about step-label checking must
 * match the live code and the live Claude-hook manifest.
 *
 * WHAT THIS GUARDS (the true situation on disk, which the doc must reflect):
 *
 *  1. BOTH `src/lib/plan-validator.js` (validateStepLabels) AND
 *     `src/hooks/validate-plan-steps.js` check step-label TEXT against the
 *     canonical labels. A document that attributes label-text checking to only
 *     one of them is wrong. (Cases 6 and 7 prove each file rejects a wrong label.)
 *
 *  2. NEITHER label check runs at a live transition:
 *       - validate-plan-steps.js is NOT registered in `.claude-plugin/hooks.json`;
 *         it runs only as the standalone command
 *         `node src/hooks/validate-plan-steps.js <plan>`. (Cases 1-3.)
 *       - plan-validator's validateStepLabels is reachable only through
 *         validateForExecution, mapped solely to the `todo->in-progress` edge, and
 *         `startExecution` moves the plan with a bare `movePlan` — no
 *         validateTransition — so that edge is never validated at runtime. (Case 8.)
 *
 *  3. The consequence a reader needs: a present-but-mislabeled step is NOT
 *     auto-rejected at runtime today. The doc carries the marker `NOT WIRED` and
 *     must not carry the old false claim "REJECTED before execution". (Cases 2, 4.)
 *
 * The fence is BIDIRECTIONAL. If a future slice registers the hook in the
 * manifest, case 3 FAILS on purpose, demanding the corrected sentence be
 * restored — a wired hook is good news; a stale document is not.
 *
 * The fence also fails on an unreadable or zero-claim doc: readFileSync throws
 * on an unreadable file, and an absent Validation section fails the marker
 * assertion.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const REPO = path.resolve(__dirname, '..');
const IRON_LOOP = path.join(REPO, 'docs', 'IRON_LOOP.md');
const CLAUDE_MD = path.join(REPO, 'CLAUDE.md');
const MANIFEST = path.join(REPO, '.claude-plugin', 'hooks.json');
const HOOK_FILE = path.join(REPO, 'src', 'hooks', 'validate-plan-steps.js');
const ACTIONS = path.join(REPO, 'src', 'lib', 'actions.js');

const FALSE_CLAIM = 'REJECTED before execution';
const MARKER = 'NOT WIRED';

/** Read a repository file as UTF-8. Throws (⇒ test fails) if unreadable. */
function readRepo(p) {
  const text = fs.readFileSync(p, 'utf8');
  assert.ok(text.length > 0, `${p} is empty — an unreadable/zero-claim doc must fail the fence`);
  return text;
}

/**
 * The "### Validation" section of docs/IRON_LOOP.md: from that heading up to the
 * next "---" horizontal rule or next "## " heading, whichever comes first.
 */
function validationSection(md) {
  const start = md.indexOf('### Validation');
  assert.notEqual(start, -1, 'docs/IRON_LOOP.md must contain a "### Validation" section');
  const rest = md.slice(start + '### Validation'.length);
  const end = rest.search(/\n---|\n##\s/);
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * CASE 1 — read the manifest state, do not assume it. True iff any hook command
 * in .claude-plugin/hooks.json names validate-plan-steps.js. The rest of the
 * suite branches on this boolean.
 */
function hookIsRegistered() {
  const manifest = JSON.parse(readRepo(MANIFEST));
  const commands = [];
  for (const events of Object.values(manifest.hooks || {})) {
    for (const entry of events) {
      if (typeof entry.command === 'string') commands.push(entry.command);
      for (const h of entry.hooks || []) {
        if (typeof h.command === 'string') commands.push(h.command);
      }
    }
  }
  return commands.some((c) => c.includes('validate-plan-steps.js'));
}

describe('step-label doc claim matches the live manifest and code', () => {
  it('case 1: the manifest is parseable and its state is read, not assumed', () => {
    // Establishes the boolean the branching cases depend on. It is FALSE today.
    assert.equal(typeof hookIsRegistered(), 'boolean');
  });

  it('case 2: NOT registered ⇒ IRON_LOOP.md says NOT WIRED and drops the false claim', () => {
    if (hookIsRegistered()) return; // handled by case 3
    const section = validationSection(readRepo(IRON_LOOP));
    assert.ok(
      section.includes(MARKER),
      `docs/IRON_LOOP.md Validation section must carry the "${MARKER}" marker while the hook is unregistered`
    );
    assert.ok(
      !section.includes(FALSE_CLAIM),
      `docs/IRON_LOOP.md must NOT claim "${FALSE_CLAIM}" — no label check runs at a live transition`
    );
    // Both checkers are named; the doc must not attribute label-text checking to only one.
    assert.match(section, /plan-validator\.js/, 'Validation section must name src/lib/plan-validator.js');
    assert.match(section, /validate-plan-steps\.js/, 'Validation section must name src/hooks/validate-plan-steps.js');
    assert.match(section, /label/i, 'Validation section must describe label-text checking');
  });

  it('case 3: registered ⇒ the document must be updated (fails loudly if stale)', () => {
    if (!hookIsRegistered()) return; // inert while unregistered — expected today
    const section = validationSection(readRepo(IRON_LOOP));
    assert.ok(
      !section.includes(MARKER),
      'validate-plan-steps.js is now registered in .claude-plugin/hooks.json — ' +
        'update the "### Validation" section of docs/IRON_LOOP.md: remove the "NOT WIRED" ' +
        'marker and describe the hook as a live pre-execution check.'
    );
  });

  it('case 4: IRON_LOOP.md and CLAUDE.md tell the same story', () => {
    const ironSection = validationSection(readRepo(IRON_LOOP));
    const claude = readRepo(CLAUDE_MD);
    // Neither shipped document may carry the old false claim.
    assert.ok(!ironSection.includes(FALSE_CLAIM), `docs/IRON_LOOP.md must not claim "${FALSE_CLAIM}"`);
    assert.ok(!claude.includes(FALSE_CLAIM), `CLAUDE.md must not claim "${FALSE_CLAIM}"`);
    // Both carry the not-wired-at-runtime semantics (content match, never a line number).
    assert.match(ironSection, /not\s+wired/i, 'docs/IRON_LOOP.md must state the hook is not wired');
    assert.match(claude, /not\s+wired/i, 'CLAUDE.md must state the hook is not wired');
  });

  it('case 5: the checker file still exists on disk', () => {
    assert.ok(fs.existsSync(HOOK_FILE), 'src/hooks/validate-plan-steps.js must exist — the doc references it');
  });

  it('case 6: the standalone command works and names the bad label on stderr', () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-steplabel-')));
    try {
      const planBody =
        ['### Step 8: TEST', 'Write tests first.',
         '### Step 9: PREPARE', 'Prepare.',
         '### Step 10: CODE', 'Implement.', // mislabeled: IMPLEMENT -> CODE
         '### Step 11: REVIEW', 'Review.',
         '### Step 12: OPTIMIZE', 'Optimize.',
         '### Step 13: SECURE', 'Secure.',
         '### Step 14: VERIFY', 'Verify.',
         '### Step 15: DOCUMENT', 'Document.',
         '### Step 16: FINAL-REVIEW', 'Final review.'].join('\n') + '\n';
      const planPath = path.join(dir, 'bad.md');
      fs.writeFileSync(planPath, planBody);
      const r = spawnSync(process.execPath, [HOOK_FILE, planPath], { encoding: 'utf8' });
      assert.equal(r.status, 1, `mislabeled step must exit non-zero; stdout=${r.stdout} stderr=${r.stderr}`);
      // The document claims this command works; prove it, and prove the output is not dropped.
      assert.match(r.stderr, /CODE/, 'stderr must name the bad label CODE (guards against pending-write output loss)');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('case 7: plan-validator.js ALSO checks label text (the doc claim, and THE CODE WINS)', () => {
    // Direct behavioral proof that plan-validator does NOT merely match by step
    // number: a mislabeled real heading yields a label error. This is why the doc
    // says BOTH files check label text.
    const { validateStepLabels } = require('../src/lib/plan-validator');
    const body =
      '## Execution Plan\n\n' +
      ['### Step 8: TEST', 'Write tests first.',
       '### Step 9: PREPARE', 'Prepare.',
       '### Step 10: CODE', 'Implement.', // mislabeled: IMPLEMENT -> CODE
       '### Step 11: REVIEW', 'Review.',
       '### Step 12: OPTIMIZE', 'Optimize.',
       '### Step 13: SECURE', 'Secure.',
       '### Step 14: VERIFY', 'Verify.',
       '### Step 15: DOCUMENT', 'Document.',
       '### Step 16: FINAL-REVIEW', 'Final review.'].join('\n') + '\n';
    const res = validateStepLabels(body);
    assert.equal(res.valid, false, 'plan-validator must reject a mislabeled step (it checks label TEXT)');
    assert.ok(
      res.errors.some((e) => /wrong label/i.test(e) && /CODE/.test(e)),
      `plan-validator must report the wrong label; got: ${JSON.stringify(res.errors)}`
    );
  });

  it('case 8: neither check runs at a live transition — startExecution bypasses validation', () => {
    // plan-validator's label check sits on the todo->in-progress edge only, and
    // startExecution crosses that edge with a bare movePlan. If someone wires a
    // validateTransition into startExecution, the doc's "not wired at a live
    // transition" claim changes and this case fails, demanding a doc review.
    const src = readRepo(ACTIONS);
    const m = src.match(/function startExecution\([\s\S]*?\n\}/);
    assert.ok(m, 'startExecution must be present in src/lib/actions.js');
    const bodyOfFn = m[0];
    assert.match(bodyOfFn, /movePlan/, 'startExecution moves the plan via movePlan');
    assert.ok(
      !/validateTransition|validateForExecution/.test(bodyOfFn),
      'startExecution must NOT validate the todo->in-progress edge — that is why plan-validator\'s ' +
        'label check never runs at runtime. If this changes, update docs/IRON_LOOP.md.'
    );
  });
});
