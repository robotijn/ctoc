/**
 * A DECLARED PATTERN MUST BE ANCHORED — OR SAY OUT LOUD THAT IT IS NOT.
 *
 * `files: ["**"]` is one character wider than `files: ["src/**"]` and, before this
 * slice, an approved `**` granted write access to every path in the repository. This
 * suite pins the enforcement half plan 00126 adds to `declared-breadth.js` and the
 * guard it adds to `plan-coverage.scanForCoverage`:
 *
 *   - a declaration is ANCHORED iff its first `/`-separated segment carries no
 *     wildcard (`isAnchored`);
 *   - an UNANCHORED declaration grants nothing UNLESS the plan's own approved
 *     frontmatter carries a non-empty `unanchored_scope` acknowledgement
 *     (`hasUnanchoredAcknowledgement`);
 *   - the acknowledgement is UNFORGEABLE — it is inside the hashed specification, so
 *     adding it after approval breaks the approval (the specification-hash binding
 *     fires first);
 *   - the denial slot is ranked by REASON SEVERITY first, glob specificity second.
 *
 * BOTH DIRECTIONS ARE ASSERTED. A blanket denial would pass half of these; cases 5,
 * 8 and 12 are the other half, and case 12 exists so a scan that never matched
 * ANYTHING cannot masquerade as a fence.
 *
 * Fixtures are real `os.tmpdir()` directories; approvals are minted with the REAL
 * `approval-ledger` over the fixture's own bytes (never a hand-written digest).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const declaredBreadth = require('../src/lib/declared-breadth');
const coverage = require('../src/lib/plan-coverage');
const ledger = require('../src/lib/approval-ledger');

const ACK = 'this plan\'s file list is rooted at the repository';

function makeRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'declared-breadth-'));
  for (const s of ['in-progress', 'todo', 'implementation']) {
    fs.mkdirSync(path.join(dir, 'plans', s), { recursive: true });
  }
  return dir;
}

function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
}

/**
 * Write a plan declaring `files:` into plans/<stage>/<slug>.md. When `ack` is set,
 * the `unanchored_scope` acknowledgement is placed INSIDE the frontmatter block (so
 * the hashed specification covers it). Returns the plan path.
 */
function writePlan(root, stage, slug, files, { ack, crlf } = {}) {
  const yaml = files.map((f) => `  - "${f}"`).join('\n');
  const ackLine = ack ? `unanchored_scope: "${ack}"\n` : '';
  let content = `---\ntitle: "${slug}"\nprogram: ctoc-v7\n${ackLine}files:\n${yaml}\n---\n\n# ${slug}\n\nbody\n`;
  if (crlf) content = content.replace(/\n/g, '\r\n');
  const p = path.join(root, 'plans', stage, `${slug}.md`);
  fs.writeFileSync(p, content);
  return p;
}

/** Write a plan whose frontmatter is PRECEDED by an approval-marker block. */
function writePlanWithMarker(root, stage, slug, files, { ack } = {}) {
  const yaml = files.map((f) => `  - "${f}"`).join('\n');
  const ackLine = ack ? `unanchored_scope: "${ack}"\n` : '';
  const marker = '---\napproved_by: human\ngate_crossed: implementation → todo\n---\n\n';
  const body = `---\ntitle: "${slug}"\nprogram: ctoc-v7\n${ackLine}files:\n${yaml}\n---\n\n# ${slug}\n\nbody\n`;
  const p = path.join(root, 'plans', stage, `${slug}.md`);
  fs.writeFileSync(p, marker + body);
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

// ---------------------------------------------------------------------------
// 1 — isAnchored: TRUE for anchored declarations.
// ---------------------------------------------------------------------------
test('1: isAnchored is true for a first segment without a wildcard', () => {
  for (const g of ['src/**', 'tests/*.test.js', 'docs/**/*.md', 'a/b/c.js', 'VERSION']) {
    assert.equal(declaredBreadth.isAnchored(g), true, `${g} is anchored`);
  }
});

// ---------------------------------------------------------------------------
// 2 — isAnchored: FALSE for a first-segment wildcard or a non-string, NO THROW.
// ---------------------------------------------------------------------------
test('2: isAnchored is false for a wildcard first segment or bad input, and never throws', () => {
  for (const g of ['**', '*', '*.md', '**/*.js', '?rc', '', null, 42, undefined, {}]) {
    let out;
    assert.doesNotThrow(() => { out = declaredBreadth.isAnchored(g); }, `isAnchored(${String(g)}) must not throw`);
    assert.equal(out, false, `${String(g)} is not anchored`);
  }
});

// ---------------------------------------------------------------------------
// 3 — isAnchored: judged on the NORMALIZED form (Windows-authored src\** is anchored).
// ---------------------------------------------------------------------------
test('3: a Windows-authored src\\** is anchored (judged on the normalized form)', () => {
  assert.equal(declaredBreadth.isAnchored('src\\**'), true);
  assert.equal(declaredBreadth.isAnchored('./src/**'), true);
});

// ---------------------------------------------------------------------------
// 4 — THE REPORTER'S CASE, END TO END. An approved `**` grants NOTHING now.
// ---------------------------------------------------------------------------
test('4: an approved plan declaring files: ["**"] covers none of the reporter\'s four paths', () => {
  const root = makeRoot();
  try {
    const p = writePlan(root, 'todo', 'zz-glob', ['**']);
    approve(root, p, 'todo');

    for (const target of ['package.json', 'VERSION', 'src/hooks/PreToolUse.Edit.js', '.ctoc/approvals/x.json']) {
      assert.equal(
        coverage.findCoveringPlan(target, root), null,
        `an unanchored declaration must not grant ${target}`,
      );
    }
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// 5 — THE ACKNOWLEDGED CASE. Documented consent still works.
// ---------------------------------------------------------------------------
test('5: an approved plan declaring ["**"] WITH unanchored_scope still grants everything', () => {
  const root = makeRoot();
  try {
    const p = writePlan(root, 'todo', 'zz-glob-ack', ['**'], { ack: ACK });
    approve(root, p, 'todo');

    assert.ok(coverage.findCoveringPlan('package.json', root), 'acknowledged globstar grants package.json');
    assert.ok(coverage.findCoveringPlan('src/hooks/PreToolUse.Edit.js', root), 'and the hook');
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// 6 — THE ACKNOWLEDGEMENT IS NOT FORGEABLE. Added after approval → hash reason.
// ---------------------------------------------------------------------------
test('6: an unanchored_scope added AFTER approval grants nothing, with a hash reason not an anchoring one', () => {
  const root = makeRoot();
  try {
    const p = writePlan(root, 'todo', 'zz-forge', ['**']);
    approve(root, p, 'todo'); // approved WITHOUT the acknowledgement

    // The agent inserts the acknowledgement into its own already-approved frontmatter.
    const tampered = fs.readFileSync(p, 'utf8').replace(
      'program: ctoc-v7\n',
      `program: ctoc-v7\nunanchored_scope: "${ACK}"\n`,
    );
    fs.writeFileSync(p, tampered);

    // The ack IS now present (so the anchoring guard is skipped) but the specification
    // hash is broken, so the approval no longer holds.
    assert.equal(declaredBreadth.hasUnanchoredAcknowledgement(tampered), true, 'the key is present in the tampered file');
    assert.equal(coverage.findCoveringPlan('package.json', root), null, 'the broken approval grants nothing');

    const why = coverage.explainDenial('package.json', root);
    assert.ok(why, 'a denial is explained');
    assert.ok(String(why.reason).startsWith('hash-mismatch'), `expected a hash reason, got ${why.reason}`);
    assert.notEqual(why.reason, declaredBreadth.REFUSAL_REASON, 'the specification binding fires before the anchoring guard');
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// 7 — MIXED LIST. Only the unanchored entries are lost.
// ---------------------------------------------------------------------------
test('7: a mixed ["src/**", "**"] approved plan covers src/lib/x.js but not package.json', () => {
  const root = makeRoot();
  try {
    const p = writePlan(root, 'todo', 'zz-mixed', ['src/**', '**']); // no acknowledgement
    approve(root, p, 'todo');

    assert.ok(coverage.findCoveringPlan('src/lib/x.js', root), 'the anchored entry still grants its files');
    assert.equal(coverage.findCoveringPlan('package.json', root), null, 'the unanchored entry grants nothing');
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// 8 — ANCHORED PLANS ARE UNTOUCHED. Unchanged behaviour.
// ---------------------------------------------------------------------------
test('8: an approved ["src/lib/**"] covers src/lib/x.js and not tests/x.js (unchanged)', () => {
  const root = makeRoot();
  try {
    const p = writePlan(root, 'todo', 'zz-anchored', ['src/lib/**']);
    approve(root, p, 'todo');

    assert.ok(coverage.findCoveringPlan('src/lib/x.js', root), 'anchored grant honoured');
    assert.equal(coverage.findCoveringPlan('tests/x.js', root), null, 'and bounded to its subtree');
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// 9 — THE DENIAL EXPLAINS ITSELF. Reason and plan named.
// ---------------------------------------------------------------------------
test('9: explainDenial reports unanchored-declaration and names the plan', () => {
  const root = makeRoot();
  try {
    const p = writePlan(root, 'todo', 'zz-explain', ['**']);
    approve(root, p, 'todo');

    const why = coverage.explainDenial('package.json', root);
    assert.ok(why, 'a rejected candidate is reported');
    assert.equal(why.reason, declaredBreadth.REFUSAL_REASON);
    assert.equal(why.plan, 'todo/zz-explain');
    const serialized = JSON.stringify(why);
    assert.equal(serialized.includes(root), false, 'no absolute path leaks');
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// 10 — ACKNOWLEDGEMENT SURVIVES A PREPENDED APPROVAL MARKER (multi-block union).
// ---------------------------------------------------------------------------
test('10: the acknowledgement is found under a prepended approval-marker block', () => {
  const root = makeRoot();
  try {
    const p = writePlanWithMarker(root, 'todo', 'zz-marker', ['**'], { ack: ACK });
    approve(root, p, 'todo');

    const content = fs.readFileSync(p, 'utf8');
    assert.equal(declaredBreadth.hasUnanchoredAcknowledgement(content), true, 'the multi-block union finds it');
    assert.ok(coverage.findCoveringPlan('package.json', root), 'so the acknowledged grant holds');
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// 11 — ACKNOWLEDGEMENT SURVIVES CRLF.
// ---------------------------------------------------------------------------
test('11: the acknowledgement is found in a CRLF plan', () => {
  const root = makeRoot();
  try {
    const p = writePlan(root, 'todo', 'zz-crlf', ['**'], { ack: ACK, crlf: true });
    approve(root, p, 'todo');

    const content = fs.readFileSync(p, 'utf8');
    assert.equal(declaredBreadth.hasUnanchoredAcknowledgement(content), true, 'CRLF must read identically');
    assert.ok(coverage.findCoveringPlan('package.json', root), 'so the acknowledged grant holds under CRLF');
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// 12 — THE FENCE IS NOT VACUOUS. The identical fixture with an ANCHORED glob and
//      NO acknowledgement matches — so cases 4/7 fail for the anchoring reason and
//      not because the harness never matched anything.
// ---------------------------------------------------------------------------
test('12: the fence is not vacuous — the identical fixture, anchored and unacknowledged, matches', () => {
  const root = makeRoot();
  try {
    const p = writePlan(root, 'todo', 'zz-vacuity', ['src/**']); // anchored, no ack
    approve(root, p, 'todo');

    assert.ok(coverage.findCoveringPlan('src/lib/x.js', root), 'the only difference from case 4 is anchoring');
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// 13 — SEVERITY BEATS SPECIFICITY. An UNAPPROVED anchored `a/**` (approval reason,
//      LOW specificity) and an APPROVED-but-unacknowledged unanchored `*/x.js`
//      (unanchored-declaration, HIGH specificity), both matching a/x.js. Pure
//      specificity would report the unanchored reason; severity-first reports the
//      approval reason, the deeper blocker.
// ---------------------------------------------------------------------------
test('13: a stronger approval reason beats a more-specific unanchored one', () => {
  const root = makeRoot();
  try {
    // Anchored (first segment "a"), unapproved → approval reason, specificity("a/**") = -3.
    writePlan(root, 'todo', 'zz-unapproved', ['a/**']);
    // Unanchored (first segment "*"), approved without ack → unanchored-declaration,
    // specificity("*/x.js") = 5 — strictly higher than -3.
    const approved = writePlan(root, 'todo', 'zz-approved-broad', ['*/x.js']);
    approve(root, approved, 'todo');

    assert.equal(coverage.findCoveringPlan('a/x.js', root), null, 'neither candidate grants');
    const why = coverage.explainDenial('a/x.js', root);
    assert.ok(why, 'a denial is explained');
    assert.notEqual(why.reason, declaredBreadth.REFUSAL_REASON, 'the shallower unanchored reason must not win');
    assert.equal(why.reason, 'no-ledger-entry', 'the deeper approval reason is reported despite lower specificity');
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// 14 — SPECIFICITY STILL BREAKS TIES WITHIN A REASON. Two approved-but-unacknowledged
//      unanchored plans, `**` and `**/*.js`, both matching a/b.js → the more specific
//      `**/*.js` is reported.
// ---------------------------------------------------------------------------
test('14: within the same reason, the more specific glob is reported', () => {
  const root = makeRoot();
  try {
    const broad = writePlan(root, 'todo', 'zz-star', ['**']);
    approve(root, broad, 'todo');
    const narrower = writePlan(root, 'todo', 'zz-starjs', ['**/*.js']);
    approve(root, narrower, 'todo');

    const why = coverage.explainDenial('a/b.js', root);
    assert.ok(why, 'a denial is explained');
    assert.equal(why.reason, declaredBreadth.REFUSAL_REASON, 'both are unanchored');
    assert.equal(why.glob, '**/*.js', 'the more specific unanchored glob is the reported one');
    assert.equal(why.plan, 'todo/zz-starjs');
  } finally { rm(root); }
});

// ---------------------------------------------------------------------------
// 15 — hasUnanchoredAcknowledgement FAULT PATHS all resolve to false (the refusing
//      direction) and never throw: non-string input, content with no frontmatter at
//      all, frontmatter that carries no `unanchored_scope`, and an empty-valued key.
// ---------------------------------------------------------------------------
test('15: hasUnanchoredAcknowledgement is false (no throw) for bad, keyless, or empty input', () => {
  const cases = [
    null, 42, undefined, {}, '',
    'just body text, no frontmatter at all\n',
    '---\ntitle: "x"\nfiles:\n  - "**"\n---\n\nbody\n',        // frontmatter, no key
    '---\nunanchored_scope:\n---\n\nbody\n',                     // key present, empty value
    '---\nunanchored_scope: ""\n---\n\nbody\n',                  // key present, quoted-empty
  ];
  for (const c of cases) {
    let out;
    assert.doesNotThrow(() => { out = declaredBreadth.hasUnanchoredAcknowledgement(c); }, `must not throw on ${JSON.stringify(String(c).slice(0, 30))}`);
    assert.equal(out, false, `absent/empty acknowledgement is the refusing direction for ${JSON.stringify(String(c).slice(0, 30))}`);
  }
  // And the positive control, so this case is not vacuously green.
  assert.equal(
    declaredBreadth.hasUnanchoredAcknowledgement('---\nunanchored_scope: "rooted at the repository"\n---\n\nbody\n'),
    true,
    'a non-empty top-level key is found',
  );
});
