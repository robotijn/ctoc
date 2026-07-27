'use strict';

// ---------------------------------------------------------------------------
// plan-work-already-landed.test.js
//
// The landed-check: a plan describing a change is NOT evidence the change is
// pending. Drives, against REAL git fixtures, the two derived questions added to
// verifyStaleCandidate — landedBySelf / landedByOther — and the third term added
// to detectConflicts (finished work is not a live conflict), plus the honesty
// contract that a landed-check which could not run never renders as "nothing
// landed" / "no conflicts".
//
// Boundary discipline mirrors stale-detector-coverage.test.js: the only fakes are
// a real on-disk tmp fixture (fs) and a real `git` process; no classification
// logic is mocked. The conflict-panel tests use a REAL PI1 openStore (the
// plan-index-conflict.test.js pattern) so the AND is exercised end to end.
//
// Git is REQUIRED. If the binary is absent the git-backed suites are NOT registered
// (0 contribution to the counter, deterministic on every platform) and ONE loud
// FAILURE is registered instead — a missing required capability is a loud failure,
// never a silent pass, and never a machine-nondeterministic runtime skip.
// ---------------------------------------------------------------------------

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const {
  verifyStaleCandidate,
  classifyStaleCandidate,
} = require('../src/lib/stale-detector.js');
const {
  detectConflicts,
  SEVERITY_UNVERIFIED,
} = require('../src/lib/plan-index/conflict-detect.js');
const { openStore, PLAN_SENTINEL } = require('../src/lib/plan-index/store.js');

// ── git availability probe (skip loudly, never silently) ──────────────────────
let GIT_OK = true;
let GIT_SKIP_REASON = '';
try {
  execFileSync('git', ['--version'], { stdio: 'ignore' });
} catch (e) {
  GIT_OK = false;
  GIT_SKIP_REASON = 'git binary not available: ' + (e && e.message ? e.message : String(e));
}

// ── fixtures ──────────────────────────────────────────────────────────────────
const sandboxes = [];

function makeSandbox() {
  const dir = path.join(
    os.tmpdir(),
    'ctoc-landed-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2)
  );
  fs.mkdirSync(dir, { recursive: true });
  sandboxes.push(dir);
  return dir;
}

function writePlan(sb, stage, slug, { files = [] } = {}) {
  const stageDir = path.join(sb, 'plans', stage);
  fs.mkdirSync(stageDir, { recursive: true });
  const filesBlock = files.length ? `files: [${files.join(', ')}]\n` : '';
  const content = '---\n' + `title: "${slug}"\n` + filesBlock + 'status: refined\n' + '---\n\n' + `# ${slug}\n`;
  const fp = path.join(stageDir, slug + '.md');
  fs.writeFileSync(fp, content);
  return fp;
}

function touch(sb, rel, body = '') {
  const full = path.join(sb, ...rel.split('/'));
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

function gitInit(sb) {
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', HOME: sb };
  execFileSync('git', ['init', '-q', '.'], { cwd: sb, env });
  execFileSync('git', ['config', 'user.email', 't@ctoc.test'], { cwd: sb, env });
  execFileSync('git', ['config', 'user.name', 'ctoc-test'], { cwd: sb, env });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: sb, env });
  return env;
}

function gitCommit(sb, env, message, epochSeconds) {
  const date = '@' + epochSeconds + ' +0000';
  execFileSync('git', ['add', '-A'], { cwd: sb, env });
  execFileSync('git', ['commit', '-q', '-m', message], {
    cwd: sb,
    env: { ...env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
}

// A REAL PI1 store keyed by plans/<stage>/<slug>.md — the shape detectConflicts
// receives from the live index. Identical vectors ⇒ cosine 1.0 ≥ threshold, so
// similarity is guaranteed and each case isolates the LANDED term.
function buildStore(plans) {
  const dir = makeSandbox();
  const store = openStore(path.join(dir, 'plan-index.json'));
  const vec = [1, 0, 0, 0, 0, 0, 0, 0];
  for (const p of plans) {
    for (const sectionId of [PLAN_SENTINEL, 'goals']) {
      store.upsertUnit({
        planPath: p.key,
        sectionId,
        kind: sectionId === PLAN_SENTINEL ? 'plan' : 'section',
        text: p.key,
        files: (p.files || []).slice(),
        contentHash: `${p.key}::${sectionId}`,
        embedding: Float32Array.from(vec),
      });
    }
  }
  return store;
}

function spyEmbedder() {
  const embedder = async (texts) => ({
    vectors: texts.map(() => Float32Array.from([1, 0, 0, 0, 0, 0, 0, 0])),
    source: 'spy',
  });
  return embedder;
}

afterEach(() => {
  while (sandboxes.length) fs.rmSync(sandboxes.pop(), { recursive: true, force: true });
});

// Git is REQUIRED for the fixtures below. Rather than a runtime `t.skip` — which
// the zero-skipped gate forbids as machine-nondeterministic (see
// tests/skip-visibility.test.js) — an absent binary registers ONE loud FAILURE and
// the git-backed suites are simply NOT registered (0 contribution, deterministic on
// every platform). A missing required capability is a loud failure, never a silent
// pass.
const gitSuite = GIT_OK ? describe : () => {};
if (!GIT_OK) {
  it('ENVIRONMENT: git binary is required for the landed-check fixtures', () => {
    assert.fail(GIT_SKIP_REASON);
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  verifyStaleCandidate — the two derived questions (git fixtures)
// ════════════════════════════════════════════════════════════════════════════

gitSuite('verifyStaleCandidate — landedBySelf / landedByOther', () => {
  it('1. work landed under ANOTHER plan\'s name ⇒ landedByOther, attributed to that plan', () => {
    const sb = makeSandbox();
    const env = gitInit(sb);
    writePlan(sb, 'review', '00100-plan-a', { files: ['src/lib/x.js'] });
    gitCommit(sb, env, 'add plan a', 1000); // A's stage entry (does NOT touch x.js)
    touch(sb, 'src/lib/x.js', 'work');
    gitCommit(sb, env, '00200-plan-b: implement x.js', 2000); // names B, after entry

    const ev = verifyStaleCandidate({ plan: '00100-plan-a', stage: 'review' }, sb);

    assert.equal(ev.gitAvailable, true);
    assert.equal(ev.landedByOther, true, 'a differently-named commit modified the files after entry');
    assert.equal(ev.landedBySelf, false, 'the plan\'s own slug never appears in a file-modifying commit');
    assert.ok(
      ev.landingAttributedTo.includes('00200-plan-b'),
      'the superseding plan slug is attributed: ' + JSON.stringify(ev.landingAttributedTo)
    );
    assert.ok(Array.isArray(ev.landingCommits) && ev.landingCommits.length >= 1, 'at least one landing commit hash');
  });

  it('2. a genuinely PENDING plan is NOT flagged (the false-positive guard)', () => {
    const sb = makeSandbox();
    const env = gitInit(sb);
    // Plan and its declared file enter together; nothing modifies the file AFTER entry.
    writePlan(sb, 'implementation', '00110-pending', { files: ['src/lib/p.js'] });
    touch(sb, 'src/lib/p.js', 'stub');
    gitCommit(sb, env, 'add pending plan and its file', 1000);

    const ev = verifyStaleCandidate({ plan: '00110-pending', stage: 'implementation' }, sb);

    assert.equal(ev.gitAvailable, true);
    assert.equal(ev.filesModifiedAfterEntry, false, 'file last changed AT entry, not after');
    assert.equal(ev.landedBySelf, false);
    assert.equal(ev.landedByOther, false, 'a pending plan must never be flagged as landed');
    assert.deepEqual(ev.landingAttributedTo, []);
    assert.deepEqual(ev.landingCommits, []);
  });

  it('3. work landed under the plan\'s OWN name ⇒ landedBySelf, not landedByOther', () => {
    const sb = makeSandbox();
    const env = gitInit(sb);
    writePlan(sb, 'review', '00120-self', { files: ['src/lib/s.js'] });
    gitCommit(sb, env, 'add plan', 1000);
    touch(sb, 'src/lib/s.js', 'shipped');
    gitCommit(sb, env, '00120-self: ship s.js', 2000); // names self, after entry

    const ev = verifyStaleCandidate({ plan: '00120-self', stage: 'review' }, sb);

    assert.equal(ev.landedBySelf, true, 'the plan\'s own slug names the file-modifying commit');
    assert.equal(ev.landedByOther, false, 'a self-landed plan is an ordinary completed plan, not a supersession candidate');
  });

  it('4. git UNAVAILABLE ⇒ inconclusive, NEVER a confident "nothing landed"', () => {
    const sb = makeSandbox();
    writePlan(sb, 'review', '00130-nogit', { files: ['src/lib/n.js'] });
    const prevCeil = process.env.GIT_CEILING_DIRECTORIES;
    process.env.GIT_CEILING_DIRECTORIES = path.dirname(sb);
    let ev;
    try {
      ev = verifyStaleCandidate({ plan: '00130-nogit', stage: 'review' }, sb);
    } finally {
      if (prevCeil === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
      else process.env.GIT_CEILING_DIRECTORIES = prevCeil;
    }

    assert.equal(ev.gitAvailable, false, 'not a git repo ⇒ could not look');
    assert.equal(ev.landedBySelf, false);
    assert.equal(ev.landedByOther, false);
    assert.deepEqual(ev.landingCommits, []);
    assert.deepEqual(ev.landingAttributedTo, []);
    // The load-bearing honesty: landedByOther:false here is licensed ONLY because
    // the classifier reads gitAvailable and returns inconclusive — "I could not
    // look", never "nothing landed".
    const proposal = classifyStaleCandidate({ plan: '00130-nogit', stage: 'review' }, ev);
    assert.equal(proposal.category, 'inconclusive');
    assert.equal(proposal.proposedAction, null);
  });

  it('6. a modification PREDATING stage entry does not count', () => {
    const sb = makeSandbox();
    const env = gitInit(sb);
    touch(sb, 'src/lib/old.js', 'pre-existing');
    gitCommit(sb, env, '00190-other: earlier unrelated change', 1000); // BEFORE the plan exists
    writePlan(sb, 'review', '00140-late', { files: ['src/lib/old.js'] });
    gitCommit(sb, env, 'add plan later', 2000); // entry = 2000, file last-mod = 1000

    const ev = verifyStaleCandidate({ plan: '00140-late', stage: 'review' }, sb);

    assert.equal(ev.filesModifiedAfterEntry, false, 'file change predates entry');
    assert.equal(ev.landedBySelf, false);
    assert.equal(ev.landedByOther, false, 'a pre-entry modification is not a landing');
  });

  it('7. landing evidence is BOUNDED (200 commits ⇒ capped arrays)', () => {
    const sb = makeSandbox();
    const env = gitInit(sb);
    writePlan(sb, 'review', '00150-busy', { files: ['src/lib/busy.js'] });
    gitCommit(sb, env, 'add plan', 1000);
    for (let i = 0; i < 30; i++) {
      touch(sb, 'src/lib/busy.js', 'rev ' + i);
      gitCommit(sb, env, '00201-plan-b touch ' + i, 2000 + i);
    }

    const ev = verifyStaleCandidate({ plan: '00150-busy', stage: 'review' }, sb);

    assert.equal(ev.landedByOther, true, 'many other-named commits still land it');
    assert.ok(ev.landingCommits.length <= 20, 'landingCommits capped, got ' + ev.landingCommits.length);
    assert.ok(ev.landingAttributedTo.length <= 20, 'landingAttributedTo capped');
  });

  it('5. the landed-candidate category carries a NULL action (candidate, not verdict)', () => {
    const sb = makeSandbox();
    const env = gitInit(sb);
    writePlan(sb, 'review', '00160-super', { files: ['src/lib/y.js'] });
    gitCommit(sb, env, 'add plan', 1000);
    touch(sb, 'src/lib/y.js', 'work');
    gitCommit(sb, env, '00202-successor: reimplement y.js', 2000);

    const ev = verifyStaleCandidate({ plan: '00160-super', stage: 'review' }, sb);
    assert.equal(ev.landedByOther, true, 'precondition: fixture is a supersession candidate');

    const proposal = classifyStaleCandidate({ plan: '00160-super', stage: 'review' }, ev);
    assert.equal(proposal.category, 'landed-candidate');
    assert.equal(proposal.proposedAction, null, 'a candidate is never a verdict — no cleanup path may act');
    assert.deepEqual(
      Object.keys(proposal).sort(),
      ['category', 'evidence', 'plan', 'proposedAction'],
      'proposal shape is unchanged (the classifier contract holds)'
    );
  });

  it('12. a supplied slugHistoryCache is REUSED — no second history scan', () => {
    const sb = makeSandbox();
    const env = gitInit(sb);
    writePlan(sb, 'review', '00170-one', { files: ['src/lib/a.js'] });
    writePlan(sb, 'review', '00171-two', { files: ['src/lib/b.js'] });
    touch(sb, 'src/lib/a.js', 'a');
    touch(sb, 'src/lib/b.js', 'b');
    gitCommit(sb, env, 'seed both plans and files', 1000);

    const cache = {};
    // First call populates cache.records from the real history.
    verifyStaleCandidate({ plan: '00170-one', stage: 'review' }, sb, { slugHistoryCache: cache });
    assert.ok(Array.isArray(cache.records), 'the first call populated the shared history cache');

    // Poison the cache with a fabricated record naming the SECOND plan. If the
    // second call re-scanned git, this fabricated commit could not surface; that it
    // does proves the shared scan was reused rather than run a second time.
    cache.records = [{ ct: 1500, shortHash: 'feed777', message: 'work on 00171-two slice' }];
    const ev2 = verifyStaleCandidate({ plan: '00171-two', stage: 'review' }, sb, { slugHistoryCache: cache });
    assert.ok(
      ev2.slugMatchCommits.some((c) => c.shortHash === 'feed777'),
      'the cached (not re-read) history record is used ⇒ no second scan'
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  detectConflicts — finished work is not a live conflict (real store)
// ════════════════════════════════════════════════════════════════════════════

describe('detectConflicts — the landed term', () => {
  const SEED = 'plans/implementation/00300-seed.md';
  const getSetting = () => 0.78;

  it('8. a candidate keyed under plans/done/ is NOT reported (cheap, certain — no git)', async () => {
    const store = buildStore([
      { key: SEED, files: ['src/lib/shared.js'] },
      { key: 'plans/done/00301-finished.md', files: ['src/lib/shared.js'] },
    ]);
    const rows = await detectConflicts(SEED, {
      store,
      embedder: spyEmbedder(),
      getSetting,
      projectPath: makeSandbox(), // non-git; the done stage decides without it
    });
    assert.ok(
      !rows.some((r) => r.conflictingPlan === 'plans/done/00301-finished.md'),
      'finished work in done/ is not a live conflict (the twelve, silenced)'
    );
  });

  it('9b. a candidate the landed-check reports as landed is dropped (git-backed)', async () => {
    const store = buildStore([
      { key: 'plans/implementation/00410-seed.md', files: ['src/lib/s.js'] },
      { key: 'plans/implementation/00411-landed.md', files: ['src/lib/s.js'] },
    ]);
    const rows = await detectConflicts('plans/implementation/00410-seed.md', {
      store,
      embedder: spyEmbedder(),
      getSetting,
      // Injected resolver: the candidate's work has landed under another plan.
      landedResolver: (slug) =>
        slug === '00411-landed'
          ? { gitAvailable: true, landedBySelf: false, landedByOther: true }
          : { gitAvailable: true, landedBySelf: false, landedByOther: false },
    });
    assert.ok(
      !rows.some((r) => r.conflictingPlan === 'plans/implementation/00411-landed.md'),
      'a landed candidate is not a live conflict'
    );
  });

  it('10. an unavailable (throwing) landed-check NEVER empties the panel — rows marked unverified', async () => {
    const store = buildStore([
      { key: 'plans/implementation/00500-seed.md', files: ['src/lib/s.js'] },
      { key: 'plans/implementation/00501-cand.md', files: ['src/lib/s.js'] },
    ]);
    const rows = await detectConflicts('plans/implementation/00500-seed.md', {
      store,
      embedder: spyEmbedder(),
      getSetting,
      landedResolver: () => { throw new Error('git blew up'); },
    });
    const cand = rows.find((r) => r.conflictingPlan === 'plans/implementation/00501-cand.md');
    assert.ok(cand, 'the row survives an unavailable landed-check — never filtered to empty');
    assert.equal(cand.severity, SEVERITY_UNVERIFIED, 'the surviving row is LABELLED unverified');
  });

  it('10b. a landed-check that could not run (gitAvailable:false) also passes rows through unverified', async () => {
    const store = buildStore([
      { key: 'plans/implementation/00510-seed.md', files: ['src/lib/s.js'] },
      { key: 'plans/implementation/00511-cand.md', files: ['src/lib/s.js'] },
    ]);
    const rows = await detectConflicts('plans/implementation/00510-seed.md', {
      store,
      embedder: spyEmbedder(),
      getSetting,
      landedResolver: () => ({ gitAvailable: false }),
    });
    const cand = rows.find((r) => r.conflictingPlan === 'plans/implementation/00511-cand.md');
    assert.ok(cand, 'an unavailable check never removes a conflict');
    assert.equal(cand.severity, SEVERITY_UNVERIFIED);
  });

  it('11. detectConflicts stays fail-open: empty conditions ⇒ [], only a non-string slug throws', async () => {
    const store = buildStore([{ key: SEED, files: ['src/lib/shared.js'] }]);
    await assert.rejects(
      () => detectConflicts(123, { store, embedder: spyEmbedder() }),
      TypeError,
      'a non-string slug is the ONLY throw'
    );
    assert.deepEqual(await detectConflicts('plans/x/y.md', { store: null }), [], 'null store ⇒ []');
    const empty = buildStore([]);
    assert.deepEqual(await detectConflicts(SEED, { store: empty, embedder: spyEmbedder(), getSetting }), [], 'zero-unit index ⇒ []');
  });

  it('existing opaque store keys (not plans/<stage>/<slug>.md) keep their original severity', async () => {
    // Regression guard for the whole existing conflict-detect suite: an unparseable
    // key is "landed-check not applicable" ⇒ the row is neither dropped nor relabelled.
    const store = buildStore([
      { key: 'target', files: ['src/lib/shared.js'] },
      { key: 'cand', files: ['src/lib/shared.js'] },
    ]);
    const rows = await detectConflicts('target', { store, embedder: spyEmbedder(), getSetting });
    const cand = rows.find((r) => r.conflictingPlan === 'cand');
    assert.ok(cand, 'an opaque-keyed candidate is still reported');
    assert.equal(cand.severity, 'potential conflict or dependency', 'opaque key ⇒ original severity, unchanged');
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  detectConflicts — the DEFAULT git-backed landed resolver (real git fixture).
//  Exercises the verifyStaleCandidate call site end to end: neither plan exists in
//  the fixture repo, so neither has landed ⇒ the live conflict is still reported
//  with the VERIFIED severity (the landed-check ran).
// ════════════════════════════════════════════════════════════════════════════

gitSuite('detectConflicts — default git-backed landed resolver', () => {
  it('9. two LIVE implementation plans still contend, severity verified', async () => {
    const store = buildStore([
      { key: 'plans/implementation/00400-seed.md', files: ['src/lib/s.js'] },
      { key: 'plans/implementation/00401-cand.md', files: ['src/lib/s.js'] },
    ]);
    const gitdir = makeSandbox();
    gitInit(gitdir);
    const rows = await detectConflicts('plans/implementation/00400-seed.md', {
      store,
      embedder: spyEmbedder(),
      getSetting: () => 0.78,
      projectPath: gitdir,
    });
    const cand = rows.find((r) => r.conflictingPlan === 'plans/implementation/00401-cand.md');
    assert.ok(cand, 'a live overlapping+similar plan is still reported');
    assert.equal(cand.severity, 'potential conflict or dependency', 'landed-check ran ⇒ verified severity');
  });
});
