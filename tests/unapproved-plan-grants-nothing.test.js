/**
 * A PLAN NOBODY APPROVED GRANTS NO WRITE ACCESS.
 *
 * The defect these tests close: the permission that decides whether an agent may
 * edit a file was derived from a document the same agent is free to write.
 * `plans/**.md` is edit-whitelisted, and `plan-coverage.findCoveringPlan` scanned
 * `plans/implementation/` — a PRE-approval stage. So writing a seven-line plan file
 * declaring `files: ["src/hooks/human-gate-check.js"]` granted an agent permission
 * to edit the hook that enforces the four human gates. With `files: ["**"]` it
 * granted the whole repository.
 *
 * BOTH DIRECTIONS ARE ASSERTED. A fix that denied everything would pass half of
 * these; cases 2, 5, 7b, 9, 13 and 17 are the other half, and case 17 exists so a
 * scan that never matched ANYTHING cannot masquerade as a fence. (Case 7 flipped
 * with slice 00126: an approved unanchored `**` now grants nothing WITHOUT an
 * `unanchored_scope` acknowledgement, and 7b carries the grant direction.)
 *
 * Fixtures are real `os.tmpdir()` directories and approvals are minted with the
 * REAL `approval-ledger` (it hashes the fixture's actual bytes) — never a
 * hand-written digest, which would drift the moment the hash derivation changes.
 * The only hand-written ledger files are the deliberately malformed ones (corrupt
 * JSON, unknown provenance, evidence-less sufficiency), which the real writers
 * correctly REFUSE to produce.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const coverage = require('../src/lib/plan-coverage');
const ledger = require('../src/lib/approval-ledger');
const safeFs = require('../src/lib/safe-fs');

const GATE_HOOK = 'src/hooks/human-gate-check.js';

function makeRoot(stages = ['in-progress', 'todo', 'implementation']) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unapproved-'));
  for (const s of stages) fs.mkdirSync(path.join(dir, 'plans', s), { recursive: true });
  return dir;
}

function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
}

/** Write a plan declaring `files:` into plans/<stage>/<slug>.md; returns its path. */
function writePlan(root, stage, slug, files) {
  const yaml = files.map((f) => `  - "${f}"`).join('\n');
  const content = `---\ntitle: "${slug}"\nprogram: ctoc-v7\nfiles:\n${yaml}\n---\n\n# ${slug}\n\nbody\n`;
  const p = path.join(root, 'plans', stage, `${slug}.md`);
  fs.writeFileSync(p, content);
  return p;
}

/** Mint a REAL specification-scope human approval for a plan file, at `stageTo`. */
function approve(root, planPath, stageTo = 'todo') {
  const content = fs.readFileSync(planPath, 'utf8');
  return ledger.writeEntry(ledger.slugFromPlanPath(planPath), {
    content,
    stage_from: 'implementation',
    stage_to: stageTo,
    approved_by: 'human',
  }, root);
}

/** Mint a LEGACY whole-file-scope human approval (no `hash_scope`). */
function approveLegacy(root, planPath, stageTo = 'todo') {
  const content = fs.readFileSync(planPath, 'utf8');
  return ledger.writeEntry(ledger.slugFromPlanPath(planPath), {
    content_sha256: ledger.computeContentHash(content),
    stage_from: 'implementation',
    stage_to: stageTo,
    approved_by: 'human',
  }, root);
}

/** Write a ledger entry file verbatim — for shapes the real writers refuse to mint. */
function writeRawEntry(root, planPath, obj) {
  const dir = path.join(root, '.ctoc', 'approvals');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `${ledger.slugFromPlanPath(planPath)}.json`);
  fs.writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
  return p;
}

// ---------------------------------------------------------------------------
// 1 — THE REPORTER'S PROBE. An unapproved plan in the PRE-approval stage
//     declaring the gate-enforcement hook grants nothing.
// ---------------------------------------------------------------------------
test('1: an unapproved implementation-stage plan declaring the gate hook grants NOTHING', () => {
  const root = makeRoot();
  try {
    writePlan(root, 'implementation', 'zz-probe', [GATE_HOOK]);

    assert.equal(
      coverage.findCoveringPlan(GATE_HOOK, root), null,
      'a plan an agent can author must never grant write access to gate enforcement',
    );
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// 2 — THE OTHER DIRECTION. The SAME plan, approved, DOES grant access.
// ---------------------------------------------------------------------------
test('2: the same plan, genuinely approved into todo/, DOES grant access', () => {
  const root = makeRoot();
  try {
    const p = writePlan(root, 'todo', 'zz-probe', [GATE_HOOK]);
    approve(root, p, 'todo');

    const hit = coverage.findCoveringPlan(GATE_HOOK, root);
    assert.ok(hit, 'an approved plan must still grant what it declares');
    assert.equal(hit.plan, 'todo/zz-probe');
    assert.equal(hit.stage, 'todo');
    assert.equal(hit.glob, GATE_HOOK);
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// 3 — THE SQUAT. Dropping the pre-approval stage ALONE does not close the hole:
//     the whitelist covers every stage folder, so the identical probe written one
//     directory over must also grant nothing.
// ---------------------------------------------------------------------------
test('3: an unapproved plan squatted directly into todo/ grants NOTHING', () => {
  const root = makeRoot();
  try {
    writePlan(root, 'todo', 'zz-squat', [GATE_HOOK]);

    assert.equal(
      coverage.findCoveringPlan(GATE_HOOK, root), null,
      'residing in a post-approval folder is not proof of approval',
    );
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// 4 — AMENDMENT AFTER APPROVAL. The specification hash covers the frontmatter in
//     full, so a `files:` list amended after approval grants nothing further —
//     and the plan stops granting the file it originally declared too, because the
//     approval it holds no longer matches its content. Both are asserted.
// ---------------------------------------------------------------------------
test('4: a files: list amended after approval grants neither the added nor the original file', () => {
  const root = makeRoot();
  try {
    const p = writePlan(root, 'todo', 'zz-amend', ['src/lib/declared.js']);
    approve(root, p, 'todo');
    assert.ok(coverage.findCoveringPlan('src/lib/declared.js', root), 'covered before the amendment');

    // The agent adds one more file to its own approved plan.
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(
      '  - "src/lib/declared.js"',
      '  - "src/lib/declared.js"\n  - "src/hooks/human-gate-check.js"',
    ));

    assert.equal(
      coverage.findCoveringPlan(GATE_HOOK, root), null,
      'self-granting one more file through an amendment is the same defect wearing a different coat',
    );
    assert.equal(
      coverage.findCoveringPlan('src/lib/declared.js', root), null,
      'the amendment invalidates the approval the plan held, so it grants nothing at all',
    );
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// 5 — THE BUILD PHASE STILL WORKS. `in-progress` is never a gate destination, so
//     no ledger entry ever records it. A plan building there holds its Gate 2
//     `todo` entry, and must stay covered — otherwise every active build dies.
// ---------------------------------------------------------------------------
test('5: a plan in in-progress/ holding its Gate 2 todo entry IS covered', () => {
  const root = makeRoot();
  try {
    const p = writePlan(root, 'in-progress', 'zz-building', ['src/lib/building.js']);
    approve(root, p, 'todo');

    const hit = coverage.findCoveringPlan('src/lib/building.js', root);
    assert.ok(hit, 'the whole build phase depends on this');
    assert.equal(hit.stage, 'in-progress');
  } finally { rm(root); }
});

test('5b: an in-progress plan with NO ledger entry is not covered', () => {
  const root = makeRoot();
  try {
    writePlan(root, 'in-progress', 'zz-squat-inp', [GATE_HOOK]);

    assert.equal(
      coverage.findCoveringPlan(GATE_HOOK, root), null,
      'the in-progress → todo edge mapping must not become a bypass of its own',
    );
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// 6 — THE WORSE VARIANT. An unapproved `**` was a repository-wide write grant.
// ---------------------------------------------------------------------------
test('6: an unapproved plan declaring files: ["**"] grants NOTHING anywhere', () => {
  const root = makeRoot();
  try {
    writePlan(root, 'implementation', 'zz-glob', ['**']);
    writePlan(root, 'todo', 'zz-glob-squat', ['**']);

    for (const target of [GATE_HOOK, 'package.json', 'VERSION', '.ctoc/x', 'src/lib/approval-ledger.js']) {
      assert.equal(
        coverage.findCoveringPlan(target, root), null,
        `an unapproved globstar must not grant ${target}`,
      );
    }
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// 7 — AN APPROVED `**` GRANTS NOTHING UNLESS THE PLAN SAYS IT IS UNANCHORED.
//     `**` is one character wider than `src/**` and reads almost identically at a
//     glance, and the gate screen used to strip the frontmatter the file list lives
//     in — so a blanket grant could be approved without noticing. An unanchored
//     declaration is therefore refused UNLESS the plan's own approved frontmatter
//     carries a non-empty `unanchored_scope` acknowledgement (which is inside the
//     hashed specification, so it cannot be minted after approval). BOTH directions
//     are asserted: without the acknowledgement grants nothing, with it grants
//     everything (documented, informed consent preserved).
// ---------------------------------------------------------------------------
test('7: an APPROVED files: ["**"] without an unanchored_scope acknowledgement grants NOTHING', () => {
  const root = makeRoot();
  try {
    const p = writePlan(root, 'todo', 'zz-glob-ok', ['**']);
    approve(root, p, 'todo');

    assert.equal(coverage.findCoveringPlan(GATE_HOOK, root), null, 'an unanchored declaration does not grant the gate hook');
    assert.equal(coverage.findCoveringPlan('package.json', root), null, 'nor package.json');

    const why = coverage.explainDenial('package.json', root);
    assert.ok(why, 'the refusal explains itself');
    assert.equal(why.reason, 'unanchored-declaration', 'the reason names the unbounded declaration');
    assert.equal(why.plan, 'todo/zz-glob-ok');
  } finally { rm(root); }
});

test('7b: an APPROVED files: ["**"] WITH an unanchored_scope acknowledgement grants everything', () => {
  const root = makeRoot();
  try {
    const yaml = '  - "**"';
    const content = `---\ntitle: "zz-glob-ack"\nprogram: ctoc-v7\nunanchored_scope: "this plan's file list is rooted at the repository"\nfiles:\n${yaml}\n---\n\n# zz-glob-ack\n\nbody\n`;
    const p = path.join(root, 'plans', 'todo', 'zz-glob-ack.md');
    fs.writeFileSync(p, content);
    approve(root, p, 'todo');

    assert.ok(coverage.findCoveringPlan(GATE_HOOK, root), 'documented consent still grants the gate hook');
    assert.ok(coverage.findCoveringPlan('package.json', root), 'and package.json');
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// 8 — TRAVERSAL. Confinement holds regardless of approval.
// ---------------------------------------------------------------------------
test('8: an approved traversal glob still covers nothing, in either direction', () => {
  const root = makeRoot();
  try {
    const p = writePlan(root, 'todo', 'zz-traversal', ['../../**']);
    approve(root, p, 'todo');

    assert.equal(coverage.findCoveringPlan('../outside.js', root), null, 'escaping target rejected');
    assert.equal(
      coverage.findCoveringPlan(path.resolve(root, '..', 'outside.js'), root), null,
      'absolute out-of-root target rejected',
    );
    assert.equal(coverage.findCoveringPlan('src/inside.js', root), null, 'the escaping glob is ignored');
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// 9 / 10 — LEGACY WHOLE-FILE SCOPE. It verifies while the file is byte-identical
//     to approval time, and stops the moment anything is written into the plan.
// ---------------------------------------------------------------------------
test('9: a legacy whole-file-scope approval covers while the content is unchanged', () => {
  const root = makeRoot();
  try {
    const p = writePlan(root, 'todo', 'zz-legacy', ['src/lib/legacy.js']);
    approveLegacy(root, p, 'todo');

    assert.ok(coverage.findCoveringPlan('src/lib/legacy.js', root), 'legacy entry still verifies');
  } finally { rm(root); }
});

test('10: a legacy approval stops covering once a checkbox is written, and the denial says why', () => {
  const root = makeRoot();
  try {
    const p = writePlan(root, 'todo', 'zz-legacy-x', ['src/lib/legacy.js']);
    approveLegacy(root, p, 'todo');
    fs.appendFileSync(p, '\n- [x] Step 8: TEST\n');

    assert.equal(coverage.findCoveringPlan('src/lib/legacy.js', root), null);

    const why = coverage.explainDenial('src/lib/legacy.js', root);
    assert.ok(why, 'a lockout the human cannot read is what gets reverted');
    assert.equal(why.plan, 'todo/zz-legacy-x');
    assert.equal(why.reason, 'hash-mismatch-legacy');
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// 11 / 12 / 13 / 14 — PROVENANCE KINDS. Only the kinds this system RECOGNISES,
//     at the gates where they are allowed, with the evidence they require.
// ---------------------------------------------------------------------------
test('11: an entry with unrecognised provenance grants nothing', () => {
  const root = makeRoot();
  try {
    const p = writePlan(root, 'todo', 'zz-bogus', ['src/lib/bogus.js']);
    const content = fs.readFileSync(p, 'utf8');
    writeRawEntry(root, p, {
      content_sha256: ledger.computeSpecHash(content).hash,
      hash_scope: 'specification',
      stage_from: 'implementation',
      stage_to: 'todo',
      approved_at: new Date().toISOString(),
      advanced_by: 'bogus',
      approved_by: 'human',
    });

    assert.equal(
      coverage.findCoveringPlan('src/lib/bogus.js', root), null,
      'a machine cross wearing the human marker is the forgery shape, not an approval',
    );
  } finally { rm(root); }
});

test('12: a PIPELINE entry at todo/ grants nothing (pre-done gates are human-only)', () => {
  const root = makeRoot();
  try {
    const p = writePlan(root, 'todo', 'zz-pipeline', ['src/lib/pipe.js']);
    ledger.writePipelineEntry(ledger.slugFromPlanPath(p), {
      content: fs.readFileSync(p, 'utf8'),
      stage_from: 'implementation',
      stage_to: 'todo',
      evidence: 'some-automation',
    }, root);

    assert.equal(coverage.findCoveringPlan('src/lib/pipe.js', root), null);
    const why = coverage.explainDenial('src/lib/pipe.js', root);
    assert.equal(why && why.reason, 'pipeline-not-allowed');
  } finally { rm(root); }
});

test('13: a SUFFICIENCY entry WITH evidence at todo/ does grant coverage', () => {
  const root = makeRoot();
  try {
    const p = writePlan(root, 'todo', 'zz-suff', ['src/lib/suff.js']);
    ledger.writeSufficiencyEntry(ledger.slugFromPlanPath(p), {
      content: fs.readFileSync(p, 'utf8'),
      stage_from: 'implementation',
      stage_to: 'todo',
      evidence: 'zz-suff: 4 questions answered, zero open forks',
    }, root);

    assert.ok(
      coverage.findCoveringPlan('src/lib/suff.js', root),
      'the sufficiency gate is a real crossing at a pre-build gate; coverage must honour it',
    );
  } finally { rm(root); }
});

test('14: a SUFFICIENCY entry with NO evidence grants nothing', () => {
  const root = makeRoot();
  try {
    const p = writePlan(root, 'todo', 'zz-suff-bare', ['src/lib/suffbare.js']);
    const content = fs.readFileSync(p, 'utf8');
    writeRawEntry(root, p, {
      content_sha256: ledger.computeSpecHash(content).hash,
      hash_scope: 'specification',
      stage_from: 'implementation',
      stage_to: 'todo',
      approved_at: new Date().toISOString(),
      advanced_by: 'sufficiency',
    });

    assert.equal(coverage.findCoveringPlan('src/lib/suffbare.js', root), null);
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// 15 — FAIL CLOSED, AND NEVER BY THROWING. `PreToolUse.Edit.js` catches every
//     error and fails OPEN, so a throw out of this module becomes an ALLOW. The
//     absence of the throw is the whole point of this test.
// ---------------------------------------------------------------------------
test('15: a stage directory that exists but cannot be listed DENIES, and does not throw', () => {
  const root = makeRoot();
  const realReaddir = safeFs.readdirSync;
  try {
    const p = writePlan(root, 'todo', 'zz-listed', ['src/lib/listed.js']);
    approve(root, p, 'todo');
    assert.ok(coverage.findCoveringPlan('src/lib/listed.js', root), 'covered before the fault');

    safeFs.readdirSync = () => { throw Object.assign(new Error('EACCES'), { code: 'EACCES' }); };

    let result;
    assert.doesNotThrow(() => { result = coverage.findCoveringPlan('src/lib/listed.js', root); },
      'a throw here reaches the hook catch and becomes an ALLOW — the defect, repeated');
    assert.equal(result, null, 'a permission check that cannot look must DENY');
  } finally {
    safeFs.readdirSync = realReaddir;
    rm(root);
  }
});

test('15b: explainDenial also survives an unlistable stage directory without throwing', () => {
  const root = makeRoot();
  const realReaddir = safeFs.readdirSync;
  try {
    safeFs.readdirSync = () => { throw new Error('EACCES'); };
    let out;
    assert.doesNotThrow(() => { out = coverage.explainDenial('src/lib/x.js', root); });
    assert.equal(out, null);
  } finally {
    safeFs.readdirSync = realReaddir;
    rm(root);
  }
});

// ---------------------------------------------------------------------------
// 16 — A CORRUPT LEDGER ENTRY DENIES.
// ---------------------------------------------------------------------------
test('16: a corrupt ledger entry grants nothing', () => {
  const root = makeRoot();
  try {
    const p = writePlan(root, 'todo', 'zz-corrupt', ['src/lib/corrupt.js']);
    writeRawEntry(root, p, '{ this is not valid json');

    assert.equal(coverage.findCoveringPlan('src/lib/corrupt.js', root), null);
    const why = coverage.explainDenial('src/lib/corrupt.js', root);
    assert.equal(why && why.reason, 'ledger-corrupt');
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// 17 — THE FENCE IS NOT VACUOUS. Every `null` above must be caused by the
//     APPROVAL, not by a harness that never matched anything. The identical
//     fixture, approved, matches — under the same helpers, in one test.
// ---------------------------------------------------------------------------
test('17: the fence is not vacuous — the identical fixture matches once approved', () => {
  const root = makeRoot();
  try {
    const probe = writePlan(root, 'todo', 'zz-vacuity-a', [GATE_HOOK]);
    assert.equal(coverage.findCoveringPlan(GATE_HOOK, root), null, 'unapproved: nothing');

    approve(root, probe, 'todo');
    const hit = coverage.findCoveringPlan(GATE_HOOK, root);
    assert.ok(hit, 'the ONLY difference is the approval — so the denial was the approval, not a dead scan');
    assert.equal(hit.plan, 'todo/zz-vacuity-a');
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// Ranking — an approved LESS-specific glob must beat an unapproved MORE-specific
// one, which is only true if unapproved candidates are excluded BEFORE ranking.
// ---------------------------------------------------------------------------
test('18: an approved broad glob wins over an unapproved exact one', () => {
  const root = makeRoot();
  try {
    const broad = writePlan(root, 'todo', 'zz-broad', ['src/**']);
    approve(root, broad, 'todo');
    writePlan(root, 'todo', 'zz-exact', ['src/lib/foo.js']);

    const hit = coverage.findCoveringPlan('src/lib/foo.js', root);
    assert.ok(hit, 'the approved plan still covers');
    assert.equal(hit.plan, 'todo/zz-broad', 'exclusion must happen BEFORE specificity ranking');
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// explainDenial says nothing it should not: no file contents, no absolute paths.
// ---------------------------------------------------------------------------
test('19: explainDenial leaks no file contents and no absolute path', () => {
  const root = makeRoot();
  try {
    writePlan(root, 'todo', 'zz-quiet', [GATE_HOOK]);

    const why = coverage.explainDenial(GATE_HOOK, root);
    assert.ok(why, 'a rejected candidate is reported');
    assert.equal(why.reason, 'no-ledger-entry');
    const serialized = JSON.stringify(why);
    assert.equal(serialized.includes(root), false, 'no absolute path');
    assert.equal(serialized.includes('program: ctoc-v7'), false, 'no plan contents');
  } finally { rm(root); }
});

test('20: explainDenial returns null when nothing matched at all', () => {
  const root = makeRoot();
  try {
    writePlan(root, 'todo', 'zz-other', ['src/lib/other.js']);

    assert.equal(coverage.explainDenial('src/lib/unrelated.js', root), null);
  } finally { rm(root); }
});
