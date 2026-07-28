'use strict';

/**
 * THE COUNT-MOVER DECLARATION FENCE — a plan that will CREATE a documented-count
 * artifact must declare CLAUDE.md, so the build that moves the count can update it.
 *
 * A CLAUDE.md documented count (test files, src/lib modules, hooks, tabs, agents,
 * skills) rises when a build CREATES a file in one of those classes. CLAUDE.md is
 * the ONE ratchet whose write the PreToolUse hook genuinely withholds (the two
 * .ctoc/ JSON baselines are already whitelisted, so a declaration there grants
 * nothing). So the mechanism has exactly one job: a plan that will create a counted
 * artifact must declare CLAUDE.md, checked at Gate 2 (implementation → todo) BEFORE
 * a build is committed to a plan it could not finish.
 *
 * THE TRIGGER IS CREATION, derived from the six counted classes: a declared path
 * that MATCHES a counted-class pattern AND does NOT yet exist on disk (will be
 * created). A path that EXISTS is a MODIFICATION and is silent (no-cry-wolf). A
 * glob names no specific new file and is silent (blind spot 4).
 *
 * THE STATIC "CLEAN QUEUE" AUDIT IS SCOPED TO POST-GATE-2 STAGES (todo, review,
 * done) PER THE HUMAN'S RULING. implementation/ is PRE-approval — its declared
 * files are legitimately absent (the same reasoning as stale-detector's
 * NOT_STARTED_STAGES), and those plans are caught at the Gate-2 crossing, not
 * flagged in a static audit. And an UNBUILT plan whose declared count-artifact is
 * simply not-yet-created is NOT a static offender: the offense is only live once
 * the artifact exists / the plan is being built, and the RUNTIME check at Gate 2
 * is the real teeth. So the static audit reports only GRANDFATHERED will-create
 * plans (informational) and asserts none has already MOVED its count (artifact
 * present) while still lacking CLAUDE.md.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { checkPlanDeclaresCountMovers } = require('../src/lib/documented-counts');
const { validateForQueue, validateTransition } = require('../src/lib/plan-validator');
const { extractFrontmatterRegion, parseFilesField } = require('../src/lib/stale-detector');

const ROOT = path.join(__dirname, '..');

// One ABSENT representative path per counted class (random suffix so it never
// collides with a real file — the trigger is "matches a class AND is absent").
const CLASS_SAMPLES = [
  { name: 'testFiles', path: 'tests/zzz-fence-sample-901.test.js' },
  { name: 'libModules', path: 'src/lib/zzz-fence-sample-901.js' },
  { name: 'hooks', path: 'src/hooks/ZzzFenceSample901.js' },
  { name: 'tabs', path: 'src/tabs/zzz-fence-sample-901.js' },
  { name: 'agents', path: 'agents/planning/zzz-fence-sample-901.md' },
  { name: 'skills', path: 'skills/zzz-fence-sample-901/SKILL.md' },
];

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-count-fence-'));
  for (const stage of ['implementation', 'todo']) {
    fs.mkdirSync(path.join(dir, 'plans', stage), { recursive: true });
  }
  return dir;
}

/**
 * Write a queue-VALID implementation-stage plan (title + Implementation section so
 * validateForQueue's other checks pass) whose frontmatter declares `files`. When
 * `prependApproval` is set, a gate-approval marker block is PREPENDED ahead of the
 * plan's own frontmatter — the exact shape a plan carries after crossing Gate 2,
 * which the single-block reader cannot see past.
 */
function writePlan(root, stage, slug, files, { prependApproval = false } = {}) {
  const fm =
    '---\n' +
    `title: "${slug}"\n` +
    'type: implementation\n' +
    'files:\n' +
    files.map((f) => `  - "${f}"\n`).join('') +
    '---\n\n';
  const approval = prependApproval
    ? '---\napproved_by: human\napproved_at: 2026-07-20T00:00:00.000Z\ngate_crossed: implementation → todo\n---\n\n'
    : '';
  const body = `# ${slug}\n\n## Implementation Details\n\nTechnical approach for ${slug}.\n`;
  const p = path.join(root, 'plans', stage, `${slug}.md`);
  fs.writeFileSync(p, approval + fm + body);
  return p;
}

describe('count-mover declaration fence — checkPlanDeclaresCountMovers', () => {
  it('1: a new test file WITHOUT CLAUDE.md FAILS, offender named', () => {
    const res = checkPlanDeclaresCountMovers(['tests/new-thing.test.js'], ROOT);
    assert.equal(res.ok, false);
    assert.equal(res.offenders.length, 1);
    assert.equal(res.offenders[0].path, 'tests/new-thing.test.js');
    assert.equal(res.offenders[0].countClass, 'testFiles');
  });

  it('2: a new test file WITH CLAUDE.md passes', () => {
    const res = checkPlanDeclaresCountMovers(['tests/new-thing.test.js', 'CLAUDE.md'], ROOT);
    assert.equal(res.ok, true);
  });

  it('3: modifying an EXISTING test file passes (no-cry-wolf)', () => {
    // tests/doc-counts.test.js exists on disk → a MODIFICATION, not a creation.
    const res = checkPlanDeclaresCountMovers(['tests/doc-counts.test.js'], ROOT);
    assert.equal(res.ok, true);
    assert.equal(res.offenders.length, 0);
  });

  it('4: a plan declaring only plans/**.md passes (the 00078 shape)', () => {
    const res = checkPlanDeclaresCountMovers(['plans/todo/00078-scheduler.md'], ROOT);
    assert.equal(res.ok, true);
    assert.equal(res.offenders.length, 0);
  });

  it('5: each of the six counted classes triggers (table-driven)', () => {
    for (const sample of CLASS_SAMPLES) {
      const res = checkPlanDeclaresCountMovers([sample.path], ROOT);
      assert.equal(res.ok, false, `${sample.name} (${sample.path}) should trigger`);
      assert.equal(res.offenders.length, 1, `${sample.name} single offender`);
      assert.equal(res.offenders[0].countClass, sample.name, `${sample.name} class name`);
      // The offender carries the LIVE count (via computeDocCounts) so the message
      // can tell the human which documented number is about to move.
      assert.equal(typeof res.offenders[0].currentCount, 'number', `${sample.name} live count`);
    }
  });

  it('6: a gate-stamped plan\'s files are READ (multi-block reader)', () => {
    // A PREPENDED approval block sits ahead of the plan's own frontmatter. The
    // single-block reader returns [] for such a plan; validateForQueue must use the
    // multi-block reader or the fence passes everything (a false green).
    const root = tmpProject();
    try {
      const p = writePlan(root, 'implementation', '00900-stamped', ['tests/new-6.test.js'], {
        prependApproval: true,
      });
      // The declared files must be reachable through the multi-block reader.
      const declared = parseFilesField(extractFrontmatterRegion(fs.readFileSync(p, 'utf8')));
      assert.deepEqual(declared, ['tests/new-6.test.js']);
      const res = validateForQueue(p, root);
      assert.equal(res.valid, false, 'a stamped count-mover without CLAUDE.md must fail the queue gate');
      assert.ok(
        res.errors.some((e) => e.includes('tests/new-6.test.js') && e.includes('CLAUDE.md')),
        `error must name the offender and CLAUDE.md; saw: ${res.errors.join(' | ')}`
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('7: Gate 2 actually blocks (validateTransition implementation→todo)', () => {
    const root = tmpProject();
    try {
      const p = writePlan(root, 'implementation', '00901-blocks', ['src/lib/new-7.js']);
      const res = validateTransition(p, 'implementation', 'todo', root);
      assert.equal(res.valid, false);
      assert.ok(
        res.errors.some((e) => e.includes('src/lib/new-7.js')),
        `Gate 2 must block with the offender named; saw: ${res.errors.join(' | ')}`
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('7b: a stamped count-mover that DECLARES CLAUDE.md crosses Gate 2', () => {
    const root = tmpProject();
    try {
      const p = writePlan(root, 'implementation', '00902-ok', ['tests/new-7b.test.js', 'CLAUDE.md'], {
        prependApproval: true,
      });
      const res = validateTransition(p, 'implementation', 'todo', root);
      assert.equal(res.valid, true, `declaring CLAUDE.md must let the count-mover cross; saw: ${res.errors.join(' | ')}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('8: glob declarations are non-triggering (blind spot 4, deliberate)', () => {
    const res = checkPlanDeclaresCountMovers(['tests/**'], ROOT);
    assert.equal(res.ok, true);
    assert.equal(res.offenders.length, 0);
  });

  it('9: Windows separators normalise (tests\\x.test.js triggers identically)', () => {
    const res = checkPlanDeclaresCountMovers(['tests\\zzz-fence-win-901.test.js'], ROOT);
    assert.equal(res.ok, false);
    assert.equal(res.offenders[0].countClass, 'testFiles');
    assert.equal(res.offenders[0].path, 'tests/zzz-fence-win-901.test.js');
  });

  it('empty / non-counted declarations pass', () => {
    assert.equal(checkPlanDeclaresCountMovers([], ROOT).ok, true);
    assert.equal(checkPlanDeclaresCountMovers(['docs/README.md', 'src/scripts/x.js'], ROOT).ok, true);
  });
});

describe('10: the live queue is clean — SCOPED to POST-GATE-2 (todo, review, done)', () => {
  // Per the human's ruling: implementation/ is PRE-approval and OUT of this audit.
  const SCOPED_STAGES = ['todo', 'review', 'done'];

  function scanStage(stage) {
    const dir = path.join(ROOT, 'plans', stage);
    if (!fs.existsSync(dir)) return { scanned: 0, offenders: [] };
    const plans = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    const offenders = [];
    for (const f of plans) {
      const declared = parseFilesField(extractFrontmatterRegion(fs.readFileSync(path.join(dir, f), 'utf8')));
      const res = checkPlanDeclaresCountMovers(declared, ROOT);
      if (!res.ok) offenders.push({ plan: `${stage}/${f}`, offenders: res.offenders });
    }
    return { scanned: plans.length, offenders };
  }

  it('the scoped stage list excludes implementation (the ruling)', () => {
    assert.deepEqual(SCOPED_STAGES, ['todo', 'review', 'done']);
    assert.ok(!SCOPED_STAGES.includes('implementation'));
  });

  it('no post-Gate-2 plan has already MOVED a count (artifact present) without CLAUDE.md', () => {
    let scanned = 0;
    const willCreate = [];
    for (const stage of SCOPED_STAGES) {
      const r = scanStage(stage);
      scanned += r.scanned;
      willCreate.push(...r.offenders);
    }
    // Non-vacuity: the audit really read the queue.
    assert.ok(scanned > 30, `expected to scan the real post-Gate-2 queue, saw ${scanned}`);

    // Every will-create offender is a GRANDFATHERED not-yet-built plan: its
    // offending artifact is ABSENT on disk. If one of these artifacts had been
    // built without the plan declaring CLAUDE.md, the count would have moved with
    // no permission to update it — the deadlock this fence exists to remove. Assert
    // none is in that live state.
    for (const entry of willCreate) {
      for (const off of entry.offenders) {
        const parts = off.path.split('/').filter((s) => s && s !== '.' && s !== '..');
        const exists = fs.existsSync(path.join(ROOT, ...parts));
        assert.equal(
          exists,
          false,
          `${entry.plan} declares count-mover ${off.path} which now EXISTS but the plan ` +
            `does not declare CLAUDE.md — it moved a documented count with no permission to update it`
        );
      }
    }
  });
});
