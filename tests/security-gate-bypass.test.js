/**
 * SECURITY: human-gate approval-marker bypass.
 *
 * CTOC's four human gates are CTOC's only hard safety boundary. A plan may not
 * land in a gate destination (implementation/, todo/, done/) without GENUINE
 * human approval. Since the gate-integrity hardening (finding C4), "genuine
 * approval" is a LEDGER fact, not a text fact: every real human approval is
 * recorded by `src/lib/approval-ledger.js` under `.ctoc/approvals/` with a
 * content hash of the plan as approved, and the PreToolUse hooks deny any tool
 * write into that directory. `src/hooks/human-gate-check.js` accepts a plan in
 * a gate destination only when a matching ledger entry exists (for todo/ and
 * done/, one whose content hash still matches the live plan bytes). Text in the
 * plan file — frontmatter or body — is NEVER sufficient: any process can write
 * `approved_by: human` into a file, so a text marker proves nothing about who
 * approved (the original substring check accepted a body mention anywhere).
 *
 * This file asserts the CONTRACT (ledger-backed approval), not any particular
 * implementation. Tests that fail here are REAL SECURITY BUGS: a plan reaches a
 * gate destination — including done/ (shipped) — with no human ever having
 * approved it. The bug is reported, not papered over: assertions are NOT
 * weakened to match a forgeable acceptance.
 *
 * MECHANICS
 *   - The real hook is spawned as a child Node process (no mocking) against a
 *     hermetic temp project passed as cwd. The hook always exits 0; its effect
 *     is observed on the filesystem: violating plans are MOVED from the gate
 *     destination back to the source stage, and an entry is appended to
 *     .ctoc/logs/gate-violations.json.
 *   - Each test builds its own temp project (fs.mkdtempSync) and removes it in
 *     afterEach. The temp dir is canonicalized with realpathSync because on
 *     macOS os.tmpdir() lives under /var -> /private/var; without it the hook's
 *     process.cwd() and our assertions would disagree.
 *   - Cross-platform: all paths via path.join; process.execPath spawns Node.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const REPO = path.resolve(__dirname, '..');
const GATE_HOOK = path.join(REPO, 'src', 'hooks', 'human-gate-check.js');

const { isCtocProject } = require(path.join(REPO, 'src', 'lib', 'ctoc-project-detector'));
const ledger = require(path.join(REPO, 'src', 'lib', 'approval-ledger'));

// Every plan stage directory the hook may read or revert into.
const PLAN_STAGES = [
  'vision', 'canvas', 'functional', 'implementation',
  'todo', 'in-progress', 'review', 'done',
];

/** The exact human gates the hook enforces: destination -> revert source. */
const HUMAN_GATES = {
  implementation: 'functional',
  todo: 'implementation',
  done: 'review',
};

/**
 * Build a hermetic, CTOC-detectable temp project.
 *
 * The hook itself keys off process.cwd()/plans only, but the task requires us
 * to prove the fixture is a genuine CTOC project (so a future hook hardening
 * that gates on detection still exercises these tests). We therefore create
 * BOTH the `.ctoc/` directory AND a CLAUDE.md carrying the CTOC marker, which
 * ctoc-project-detector requires together.
 */
function makeProject() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-gate-sec-')));
  for (const stage of PLAN_STAGES) {
    fs.mkdirSync(path.join(dir, 'plans', stage), { recursive: true });
  }
  fs.mkdirSync(path.join(dir, '.ctoc', 'logs'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'CLAUDE.md'),
    '# CTOC Project Instructions\n\nHermetic security fixture.\n',
  );
  // Sanity: the fixture MUST be detected as a CTOC project, else the harness is
  // testing the wrong thing.
  assert.equal(
    isCtocProject(dir).isCtoc, true,
    'harness invariant: temp project must be detected as a CTOC project',
  );
  return dir;
}

function cleanup(dir) {
  if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore: best-effort temp cleanup */ } }
}

/** Write a plan file into plans/<stage>/<name>. Returns absolute path. */
function writePlan(dir, stage, name, content) {
  const p = path.join(dir, 'plans', stage, name);
  fs.writeFileSync(p, content);
  return p;
}

/**
 * Record a REAL ledger approval (finding C4) for a plan at a gate edge. Human-gate
 * acceptance provenance comes from the agent-write-denied ledger at
 * `.ctoc/approvals/`, NEVER the forgeable in-plan `approved_by: human` marker — so a
 * genuinely-approved plan is one with a matching ledger entry, not one carrying the
 * marker text. `content` MUST be the exact bytes written to disk: the tamper-
 * sensitive `todo/`/`done/` folders bind acceptance to a live content-hash match.
 */
function approveInLedger(dir, stage, name, content, stageFrom) {
  const slug = name.replace(/\.md$/, '');
  ledger.writeEntry(slug, {
    content_sha256: ledger.computeContentHash(content),
    stage_from: stageFrom,
    stage_to: stage,
  }, dir);
}

function planExists(dir, stage, name) {
  return fs.existsSync(path.join(dir, 'plans', stage, name));
}

/**
 * Spawn the real gate hook against the temp project. Returns the child result.
 * The hook reads stdin (the Claude Code hook payload) but ignores its content
 * for the folder sweep; we still feed it '{}' to mimic a real invocation.
 */
function runGateHook(dir) {
  const res = spawnSync(process.execPath, [GATE_HOOK], {
    cwd: dir,
    input: '{}',
    encoding: 'utf8',
  });
  // Harness invariant: the hook process actually ran and did not crash.
  assert.equal(res.error, undefined,
    `gate hook failed to spawn: ${res.error && res.error.message}`);
  assert.equal(res.status, 0,
    'human-gate-check.js must always exit 0 (it reverts; it does not block)');
  return res;
}

function readViolations(dir) {
  const f = path.join(dir, '.ctoc', 'logs', 'gate-violations.json');
  if (!fs.existsSync(f)) return [];
  // gate-violations.json is an append-only JSONL log (durable-log format): one
  // JSON object per line, NOT a single JSON array.
  const raw = fs.readFileSync(f, 'utf8').trim();
  if (!raw) return [];
  return raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

// --- Plan fixtures ---------------------------------------------------------

/** Genuinely approved: approved_by is a real frontmatter key == human. */
function approvedFrontmatter(title = 'Real approval') {
  return [
    '---',
    `title: ${title}`,
    'stage: done',
    'approved_by: human',
    '---',
    '',
    `# ${title}`,
    '',
    'Body content.',
    '',
  ].join('\n');
}

/** No marker anywhere — an outright illegal landing. */
function noMarker(title = 'No approval') {
  return [
    '---',
    `title: ${title}`,
    'stage: done',
    '---',
    '',
    `# ${title}`,
    '',
    'This plan was never approved.',
    '',
  ].join('\n');
}

/**
 * Bypass attempt: the ONLY occurrence of the marker text is inside a fenced
 * code block in the body — an example showing what a marker looks like. This is
 * documentation, not approval.
 */
function markerInFencedBlock(title = 'Fenced-block bypass') {
  return [
    '---',
    `title: ${title}`,
    'stage: done',
    '---',
    '',
    `# ${title}`,
    '',
    'To approve a plan, add this to the frontmatter:',
    '',
    '```yaml',
    'approved_by: human',
    '```',
    '',
    'But this plan itself has NOT been approved.',
    '',
  ].join('\n');
}

/**
 * Bypass attempt: the marker text appears only inside a prose sentence, in fact
 * a NEGATION of approval.
 */
function markerInProse(title = 'Prose bypass') {
  return [
    '---',
    `title: ${title}`,
    'stage: done',
    '---',
    '',
    `# ${title}`,
    '',
    'Note: this was not approved_by: human reviewers; it was auto-promoted.',
    '',
  ].join('\n');
}

/**
 * Bypass attempt: frontmatter carries a COMMENTED-OUT marker, and a separate
 * "## Rejected" section in the body quotes the marker. Neither is a live
 * frontmatter approval.
 */
function markerCommentedAndRejected(title = 'Commented + rejected bypass') {
  return [
    '---',
    `title: ${title}`,
    'stage: done',
    '# approved_by: human   <- pending, do not uncomment until signed off',
    '---',
    '',
    `# ${title}`,
    '',
    '## Rejected',
    '',
    'Reviewer declined to set `approved_by: human`. Sent back for rework.',
    '',
  ].join('\n');
}

/** Genuinely approved but with odd intra-value spacing in the frontmatter. */
function approvedOddSpacing(title = 'Odd spacing approval') {
  return [
    '---',
    `title: ${title}`,
    'stage: done',
    'approved_by:   human',
    '---',
    '',
    `# ${title}`,
    '',
    'Legitimately approved; whitespace must not matter.',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------

describe('security: human-gate approval-marker bypass', () => {
  let dir;
  beforeEach(() => { dir = makeProject(); });
  afterEach(() => { cleanup(dir); dir = null; });

  // 3 — TRUE POSITIVE: a real LEDGER-backed approval must survive.
  it('keeps a done/ plan backed by a real ledger approval', () => {
    const content = approvedFrontmatter();
    writePlan(dir, 'done', 'real-approval.md', content);
    approveInLedger(dir, 'done', 'real-approval.md', content, 'review');
    runGateHook(dir);

    assert.equal(
      planExists(dir, 'done', 'real-approval.md'), true,
      'a genuinely approved plan must NOT be reverted (false-positive revert)',
    );
    assert.equal(
      planExists(dir, 'review', 'real-approval.md'), false,
      'genuinely approved plan must not appear back in review/',
    );
  });

  // 4 — TRUE NEGATIVE: no marker at all must be reverted and logged.
  it('reverts a done/ plan with NO marker and logs the violation', () => {
    writePlan(dir, 'done', 'no-marker.md', noMarker());
    runGateHook(dir);

    assert.equal(
      planExists(dir, 'done', 'no-marker.md'), false,
      'a plan with no approval marker must be removed from done/',
    );
    assert.equal(
      planExists(dir, 'review', 'no-marker.md'), true,
      'an unapproved done/ plan must be reverted to review/',
    );

    const violations = readViolations(dir);
    const v = violations.find(e => e.plan === 'no-marker.md');
    assert.ok(v, 'violation must be logged to gate-violations.json');
    assert.match(v.violation, /done\//,
      'logged violation must name the offending gate destination');
    assert.match(v.action, /review\//,
      'logged action must name the revert target (review/)');
    assert.equal(v.status, 'pending_reapproval',
      'logged violation must record pending_reapproval status');
  });

  // 1 — BYPASS: marker only in a fenced code block (BODY) -> NOT approved.
  it('reverts a done/ plan whose only marker is inside a fenced code block', () => {
    writePlan(dir, 'done', 'fenced.md', markerInFencedBlock());
    runGateHook(dir);

    assert.equal(
      planExists(dir, 'done', 'fenced.md'), false,
      'CONTRACT VIOLATED: a fenced-code example of the marker is documentation, '
      + 'not frontmatter approval — the plan must be reverted out of done/',
    );
    assert.equal(
      planExists(dir, 'review', 'fenced.md'), true,
      'plan with body-only fenced marker must be reverted to review/',
    );
  });

  // 2 — BYPASS: marker only in a prose sentence (BODY) -> NOT approved.
  it('reverts a done/ plan whose only marker is in a prose sentence', () => {
    writePlan(dir, 'done', 'prose.md', markerInProse());
    runGateHook(dir);

    assert.equal(
      planExists(dir, 'done', 'prose.md'), false,
      'CONTRACT VIOLATED: marker text inside prose (here a negation) is not '
      + 'frontmatter approval — the plan must be reverted out of done/',
    );
    assert.equal(
      planExists(dir, 'review', 'prose.md'), true,
      'plan with body-only prose marker must be reverted to review/',
    );
  });

  // 6 — BYPASS: commented-out frontmatter marker + "## Rejected" body mention.
  it('reverts a done/ plan with a commented-out marker and a Rejected section', () => {
    writePlan(dir, 'done', 'commented.md', markerCommentedAndRejected());
    runGateHook(dir);

    assert.equal(
      planExists(dir, 'done', 'commented.md'), false,
      'CONTRACT VIOLATED: a commented-out marker and a Rejected-section mention '
      + 'are explicitly NOT approval — frontmatter is the source of truth; '
      + 'the plan must be reverted out of done/',
    );
    assert.equal(
      planExists(dir, 'review', 'commented.md'), true,
      'plan with commented/rejected marker must be reverted to review/',
    );
  });

  // 7 — EDGE: a legitimately (ledger-)approved plan must survive. Under the ledger
  //   contract the in-plan marker's spacing is irrelevant to acceptance — a real
  //   ledger entry is what keeps it; a genuinely approved plan must NOT be falsely
  //   reverted.
  it('keeps a done/ plan backed by a ledger approval (in-plan marker spacing is irrelevant)', () => {
    const content = approvedOddSpacing();
    writePlan(dir, 'done', 'odd-spacing.md', content);
    approveInLedger(dir, 'done', 'odd-spacing.md', content, 'review');
    runGateHook(dir);

    assert.equal(
      planExists(dir, 'done', 'odd-spacing.md'), true,
      'CONTRACT: a ledger-approved plan must NOT be reverted — the in-plan marker '
      + 'spacing is irrelevant to acceptance',
    );
    assert.equal(
      planExists(dir, 'review', 'odd-spacing.md'), false,
      'odd-spacing approved plan must not be falsely reverted to review/',
    );
  });

  // 5 — Same body-only bypass must be caught at the OTHER two gates too.
  describe('body-only marker bypass at every human gate', () => {
    for (const [destStage, srcStage] of Object.entries(HUMAN_GATES)) {
      it(`reverts a ${destStage}/ plan whose marker is only in a fenced block`, () => {
        writePlan(dir, destStage, 'fenced.md', markerInFencedBlock());
        runGateHook(dir);

        assert.equal(
          planExists(dir, destStage, 'fenced.md'), false,
          `CONTRACT VIOLATED at gate ${srcStage}->${destStage}: a body-only `
          + `fenced marker is not frontmatter approval — plan must leave ${destStage}/`,
        );
        assert.equal(
          planExists(dir, srcStage, 'fenced.md'), true,
          `plan must be reverted from ${destStage}/ to ${srcStage}/`,
        );
      });

      it(`reverts a ${destStage}/ plan whose marker is only in prose`, () => {
        writePlan(dir, destStage, 'prose.md', markerInProse());
        runGateHook(dir);

        assert.equal(
          planExists(dir, destStage, 'prose.md'), false,
          `CONTRACT VIOLATED at gate ${srcStage}->${destStage}: a body-only `
          + `prose marker is not frontmatter approval — plan must leave ${destStage}/`,
        );
        assert.equal(
          planExists(dir, srcStage, 'prose.md'), true,
          `plan must be reverted from ${destStage}/ to ${srcStage}/`,
        );
      });

      it(`keeps a ${destStage}/ plan backed by a real ledger approval`, () => {
        const content = approvedFrontmatter();
        writePlan(dir, destStage, 'ok.md', content);
        approveInLedger(dir, destStage, 'ok.md', content, srcStage);
        runGateHook(dir);

        assert.equal(
          planExists(dir, destStage, 'ok.md'), true,
          `a genuinely (ledger-)approved plan must survive in ${destStage}/`,
        );
        assert.equal(
          planExists(dir, srcStage, 'ok.md'), false,
          `genuinely approved plan must not be reverted to ${srcStage}/`,
        );
      });
    }
  });
});
