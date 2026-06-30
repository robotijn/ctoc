'use strict';

// SP3 — verify, classify & propose. Deterministic classifier fixtures (NO real
// git), a boundary test of verifyStaleCandidate via an execFileSync spy, the
// menu routing/render tests, and the no-side-effects guard. Mirrors the sandbox
// harness from stale-detector-cheap.test.js.

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const staleDetector = require('../src/lib/stale-detector.js');
const menuScreens = require('../src/lib/menu-screens.js');
const inbox = require('../src/lib/inbox.js');

const { verifyStaleCandidate, classifyStaleCandidate } = staleDetector;

// ---------------------------------------------------------------------------
// Sandbox harness (fail-loud, hermetic, cross-platform)
// ---------------------------------------------------------------------------

const sandboxes = [];

function makeSandbox() {
  const dir = path.join(
    os.tmpdir(),
    'ctoc-sp3-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2)
  );
  fs.mkdirSync(dir, { recursive: true });
  sandboxes.push(dir);
  return dir;
}

// Write plans/<stage>/<slug>.md with a single declared file (optionally missing).
function writePlan(sandbox, stage, slug, { files = [], approved = false } = {}) {
  const stageDir = path.join(sandbox, 'plans', stage);
  fs.mkdirSync(stageDir, { recursive: true });
  let fm = '---\n' + `title: "${slug}"\n`;
  if (files.length) fm += 'files: [' + files.join(', ') + ']\n';
  if (approved) fm += 'approved_by: human\n';
  fm += 'status: refined\n---\n\n' + `# ${slug}\n`;
  fs.writeFileSync(path.join(stageDir, slug + '.md'), fm);
}

// Create a stale candidate by declaring a file that does not exist on disk.
function writeStalePlan(sandbox, stage, slug) {
  writePlan(sandbox, stage, slug, { files: ['src/lib/nonexistent-' + slug + '.js'] });
}

afterEach(() => {
  while (sandboxes.length) {
    const dir = sandboxes.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Replace child_process methods with a spy; restore via the returned function.
function spyChildProcess(impl) {
  const cp = require('child_process');
  const methods = ['exec', 'execSync', 'spawn', 'spawnSync', 'execFile', 'execFileSync'];
  const orig = {};
  const fired = [];
  for (const m of methods) {
    orig[m] = cp[m];
    cp[m] = (...args) => {
      fired.push(m);
      if (impl && impl[m]) return impl[m](...args);
      throw new Error('unexpected child_process call: ' + m);
    };
  }
  return {
    fired,
    restore() {
      for (const m of methods) cp[m] = orig[m];
    },
  };
}

const baseCandidate = (slug, stage = 'functional', signals = ['missing-files']) => ({
  plan: slug,
  stage,
  signals,
  actionable: signals.includes('missing-files'),
});

// ---------------------------------------------------------------------------
// 1 — classifier: shipped-but-early (M1, M2)
// ---------------------------------------------------------------------------

describe('classifier — shipped-but-early', () => {
  it('slug+files modified after entry, all present, not approved ⇒ archive-to-done', () => {
    const cand = baseCandidate('p-shipped');
    const evidence = {
      gitAvailable: true,
      error: null,
      approvedBy: null,
      declaredFiles: ['src/lib/a.js'],
      allFilesExist: true,
      anyFileMissing: false,
      stageEntryEpoch: 1700000000,
      filesLastModifiedEpoch: 1700001000,
      filesModifiedAfterEntry: true,
      slugMatchCommits: [{ shortHash: '3a1f2bc', dateISO: '2026-06-20', subject: 'ship p-shipped' }],
      slugMatchAfterEntry: true,
      explicitlyRejected: false,
    };
    const p = classifyStaleCandidate(cand, evidence);
    assert.equal(p.category, 'shipped-but-early');
    assert.equal(p.proposedAction, 'archive-to-done');
    assert.ok(Array.isArray(p.evidence) && p.evidence.length > 0);
  });
});

// ---------------------------------------------------------------------------
// 2 — classifier: approved-but-stranded (M1, M3)
// ---------------------------------------------------------------------------

describe('classifier — approved-but-stranded', () => {
  it('approvedBy + filesModifiedAfterEntry ⇒ advance-via-reconciliation (NOT approvePlan)', () => {
    const cand = baseCandidate('p-stranded', 'review');
    const evidence = {
      gitAvailable: true,
      error: null,
      approvedBy: 'human',
      declaredFiles: ['src/lib/a.js'],
      allFilesExist: true,
      anyFileMissing: false,
      stageEntryEpoch: 1700000000,
      filesLastModifiedEpoch: 1700001000,
      filesModifiedAfterEntry: true,
      slugMatchCommits: [],
      slugMatchAfterEntry: false,
      explicitlyRejected: false,
    };
    const p = classifyStaleCandidate(cand, evidence);
    assert.equal(p.category, 'approved-but-stranded');
    assert.equal(p.proposedAction, 'advance-via-reconciliation');
    assert.notEqual(p.proposedAction, 'advance-via-approvePlan');
  });
});

// ---------------------------------------------------------------------------
// 3 — classifier: dead-on-arrival default revert (M1, M4)
// ---------------------------------------------------------------------------

describe('classifier — dead-on-arrival default revert', () => {
  it('files gone, no slug commits, no approval, not explicitlyRejected ⇒ revert', () => {
    const cand = baseCandidate('p-dead');
    const evidence = {
      gitAvailable: true,
      error: null,
      approvedBy: null,
      declaredFiles: ['src/lib/gone.js'],
      allFilesExist: false,
      anyFileMissing: true,
      stageEntryEpoch: 1700000000,
      filesLastModifiedEpoch: null,
      filesModifiedAfterEntry: false,
      slugMatchCommits: [],
      slugMatchAfterEntry: false,
      explicitlyRejected: false,
    };
    const p = classifyStaleCandidate(cand, evidence);
    assert.equal(p.category, 'dead-on-arrival');
    assert.equal(p.proposedAction, 'revert');
  });
});

// ---------------------------------------------------------------------------
// 4 — classifier: dead-on-arrival delete only when explicitlyRejected (M4)
// ---------------------------------------------------------------------------

describe('classifier — dead-on-arrival delete iff explicitlyRejected', () => {
  it('same as revert fixture + explicitlyRejected:true ⇒ delete', () => {
    const cand = baseCandidate('p-rejected');
    const evidence = {
      gitAvailable: true,
      error: null,
      approvedBy: null,
      declaredFiles: ['src/lib/gone.js'],
      allFilesExist: false,
      anyFileMissing: true,
      stageEntryEpoch: 1700000000,
      filesLastModifiedEpoch: null,
      filesModifiedAfterEntry: false,
      slugMatchCommits: [],
      slugMatchAfterEntry: false,
      explicitlyRejected: true,
    };
    const p = classifyStaleCandidate(cand, evidence);
    assert.equal(p.category, 'dead-on-arrival');
    assert.equal(p.proposedAction, 'delete');
  });
});

// ---------------------------------------------------------------------------
// 5 — classifier: age-only ⇒ inconclusive (M1, M5)
// ---------------------------------------------------------------------------

describe('classifier — age-only inconclusive', () => {
  it('advisory:age only, files present, no shipping evidence ⇒ inconclusive, null', () => {
    const cand = baseCandidate('p-old', 'implementation', ['advisory:age']);
    const evidence = {
      gitAvailable: true,
      error: null,
      approvedBy: null,
      declaredFiles: ['src/lib/a.js'],
      allFilesExist: true,
      anyFileMissing: false,
      stageEntryEpoch: 1700000000,
      filesLastModifiedEpoch: null,
      filesModifiedAfterEntry: false,
      slugMatchCommits: [],
      slugMatchAfterEntry: false,
      explicitlyRejected: false,
    };
    const p = classifyStaleCandidate(cand, evidence);
    assert.equal(p.category, 'inconclusive');
    assert.equal(p.proposedAction, null);
  });
});

// ---------------------------------------------------------------------------
// 6 — classifier: gitAvailable:false ⇒ inconclusive (M5/M6)
// ---------------------------------------------------------------------------

describe('classifier — gitAvailable:false ⇒ inconclusive', () => {
  it('degraded evidence ⇒ inconclusive, null, evidence mentions git unavailable', () => {
    const cand = baseCandidate('p-nogit');
    const evidence = {
      gitAvailable: false,
      error: 'ENOENT',
      approvedBy: null,
      declaredFiles: [],
      allFilesExist: true,
      anyFileMissing: false,
      stageEntryEpoch: null,
      filesLastModifiedEpoch: null,
      filesModifiedAfterEntry: false,
      slugMatchCommits: [],
      slugMatchAfterEntry: false,
      explicitlyRejected: false,
    };
    const p = classifyStaleCandidate(cand, evidence);
    assert.equal(p.category, 'inconclusive');
    assert.equal(p.proposedAction, null);
    assert.ok(p.evidence.join(' ').toLowerCase().includes('git unavailable'));
  });
});

// ---------------------------------------------------------------------------
// 7 — classifier: proposal shape (M1, M7, typedef lock)
// ---------------------------------------------------------------------------

describe('classifier — proposal shape', () => {
  it('returns exactly the 4 locked keys; plan === candidate.plan', () => {
    const cand = baseCandidate('p-shape');
    const evidence = {
      gitAvailable: true,
      error: null,
      approvedBy: null,
      declaredFiles: [],
      allFilesExist: true,
      anyFileMissing: false,
      stageEntryEpoch: null,
      filesLastModifiedEpoch: null,
      filesModifiedAfterEntry: false,
      slugMatchCommits: [],
      slugMatchAfterEntry: false,
      explicitlyRejected: false,
    };
    const p = classifyStaleCandidate(cand, evidence);
    assert.deepEqual(Object.keys(p).sort(), ['category', 'evidence', 'plan', 'proposedAction']);
    assert.ok(Array.isArray(p.evidence));
    assert.equal(p.plan, 'p-shape');
  });
});

// ---------------------------------------------------------------------------
// 8 — classifier: purity / no side effects (M7)
// ---------------------------------------------------------------------------

describe('classifier — purity', () => {
  it('no fs write, no subprocess; inputs unmutated', () => {
    const cand = baseCandidate('p-pure');
    const evidence = {
      gitAvailable: true,
      error: null,
      approvedBy: 'human',
      declaredFiles: ['src/lib/a.js'],
      allFilesExist: true,
      anyFileMissing: false,
      stageEntryEpoch: 1700000000,
      filesLastModifiedEpoch: 1700001000,
      filesModifiedAfterEntry: true,
      slugMatchCommits: [],
      slugMatchAfterEntry: false,
      explicitlyRejected: false,
    };
    const candSnap = JSON.stringify(cand);
    const evSnap = JSON.stringify(evidence);
    const origWrite = fs.writeFileSync;
    let wrote = false;
    fs.writeFileSync = () => { wrote = true; };
    const spy = spyChildProcess();
    try {
      classifyStaleCandidate(cand, evidence);
    } finally {
      fs.writeFileSync = origWrite;
      spy.restore();
    }
    assert.equal(wrote, false, 'classify must not write');
    assert.deepEqual(spy.fired, [], 'classify must not invoke a subprocess');
    assert.equal(JSON.stringify(cand), candSnap, 'candidate must be unmutated');
    assert.equal(JSON.stringify(evidence), evSnap, 'evidence must be unmutated');
  });
});

// ---------------------------------------------------------------------------
// 9 — verify: git IS invoked on verify (M6)
// ---------------------------------------------------------------------------

describe('verify — git invoked', () => {
  it('verifyStaleCandidate calls execFileSync and returns gitAvailable:true with the documented keys', () => {
    const sb = makeSandbox();
    writeStalePlan(sb, 'functional', 'p-verify');
    const cand = baseCandidate('p-verify');
    const spy = spyChildProcess({ execFileSync: () => '1700000000' });
    let evidence;
    try {
      evidence = verifyStaleCandidate(cand, sb);
    } finally {
      spy.restore();
    }
    assert.ok(spy.fired.includes('execFileSync'), 'execFileSync must be called on verify');
    assert.equal(evidence.gitAvailable, true);
    for (const k of ['approvedBy', 'declaredFiles', 'allFilesExist', 'anyFileMissing',
      'stageEntryEpoch', 'filesModifiedAfterEntry', 'slugMatchCommits', 'slugMatchAfterEntry',
      'explicitlyRejected']) {
      assert.ok(Object.prototype.hasOwnProperty.call(evidence, k), 'missing key ' + k);
    }
  });
});

// ---------------------------------------------------------------------------
// 10 — verify: gitAvailable:false on missing git (Risk R2)
// ---------------------------------------------------------------------------

describe('verify — degrades on missing git', () => {
  it('execFileSync throwing ENOENT ⇒ gitAvailable:false, no throw', () => {
    const sb = makeSandbox();
    writeStalePlan(sb, 'functional', 'p-nogit');
    const cand = baseCandidate('p-nogit');
    const spy = spyChildProcess({
      execFileSync: () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); },
    });
    let evidence;
    try {
      assert.doesNotThrow(() => { evidence = verifyStaleCandidate(cand, sb); });
    } finally {
      spy.restore();
    }
    assert.equal(evidence.gitAvailable, false);
    assert.ok(evidence.error);
  });
});

// ---------------------------------------------------------------------------
// 11 — verify NOT called during scan/getInboxCounts; ONLY via menu (M6, M8)
// ---------------------------------------------------------------------------

describe('verify — never on the hot path', () => {
  it('0 git calls during getInboxCounts + scanCheapCandidates + listStaleCandidates; ≥1 via inbox verify', () => {
    const sb = makeSandbox();
    writeStalePlan(sb, 'functional', 'p-hot');
    const spy = spyChildProcess({ execFileSync: () => '1700000000' });
    try {
      inbox.getInboxCounts(sb);
      staleDetector.scanCheapCandidates(sb);
      inbox.listStaleCandidates(sb);
      assert.deepEqual(spy.fired, [], 'no subprocess during the hot path');
      menuScreens.route(['inbox', 'verify'], sb);
      assert.ok(spy.fired.includes('execFileSync'), 'verify route must invoke git');
    } finally {
      spy.restore();
    }
  });
});

// ---------------------------------------------------------------------------
// 12 — menu: 'Verify' routes to `inbox verify`; no digit key (M8)
// ---------------------------------------------------------------------------

describe("menu — 'Verify' routes to inbox verify", () => {
  it('inboxStalePlansDrillIn with ≥1 candidate maps Verify→inbox verify, no digit key', () => {
    const sb = makeSandbox();
    writeStalePlan(sb, 'functional', 'p-drill');
    const screen = menuScreens.inboxStalePlansDrillIn(sb);
    assert.equal(screen.actions['Verify'], 'inbox verify');
    for (const k of Object.keys(screen.actions)) {
      assert.ok(!/^\d/.test(k), 'no action key may be a digit: ' + k);
    }
  });
});

// ---------------------------------------------------------------------------
// 13 — menu: inboxVerifyProposals renders grouped; Back→inbox stale (M8)
// ---------------------------------------------------------------------------

describe('menu — inboxVerifyProposals render', () => {
  // D9 (SP4 broaden): an actionable DOA proposal (p-render: declared file missing,
  // no slug commits, not approved ⇒ dead-on-arrival/revert) now surfaces the
  // 'Clean up ▸' entry, so the read-only verify screen renders TWO options
  // (Clean up ▸ + Back). Render stays strictly read-only — it must mutate no plan
  // file (the entry is navigation, not execution).
  it('route([inbox,verify]) with an actionable DOA ⇒ Clean up ▸ + Back; read-only; no digit', () => {
    const sb = makeSandbox();
    writeStalePlan(sb, 'functional', 'p-render'); // DOA: missing declared file
    const spy = spyChildProcess({ execFileSync: () => '1700000000' });
    // Read-only render guard: any plan-file write/rename/rm flips this.
    const origWrite = fs.writeFileSync;
    const origRename = fs.renameSync;
    const origRm = fs.rmSync;
    let mutated = false;
    fs.writeFileSync = () => { mutated = true; };
    fs.renameSync = () => { mutated = true; };
    fs.rmSync = () => { mutated = true; };
    let screen;
    try {
      screen = menuScreens.route(['inbox', 'verify'], sb);
    } finally {
      fs.writeFileSync = origWrite;
      fs.renameSync = origRename;
      fs.rmSync = origRm;
      spy.restore();
    }
    assert.equal(mutated, false, 'verify render must perform NO plan-file mutation (read-only)');
    assert.ok(typeof screen.text === 'string' && screen.text.length > 0);
    // Both options present now that DOA surfaces the cleanup entry (D9).
    assert.equal(screen.ask.questions[0].options.length, 2, 'Clean up ▸ + Back');
    assert.equal(screen.actions['Clean up ▸'], 'inbox cleanup', 'DOA is actionable ⇒ Clean up ▸ entry');
    assert.equal(screen.actions['◀ Back'], 'inbox stale');
    for (const k of Object.keys(screen.actions)) {
      assert.ok(!/^\d/.test(k), 'no action key may be a digit: ' + k);
    }
  });
});

// ---------------------------------------------------------------------------
// 13b — menu: empty candidate set ⇒ "No proposals." (empty-state branch)
// ---------------------------------------------------------------------------

describe('menu — inboxVerifyProposals empty state', () => {
  it('no stale candidates ⇒ renders "No proposals." and Back→inbox stale', () => {
    const sb = makeSandbox();
    // No plans at all ⇒ zero candidates ⇒ zero git calls.
    const spy = spyChildProcess();
    let screen;
    try {
      screen = menuScreens.inboxVerifyProposals(sb);
    } finally {
      spy.restore();
    }
    assert.deepEqual(spy.fired, [], 'no git when there is nothing to verify');
    assert.ok(screen.text.includes('No proposals.'));
    assert.equal(screen.actions['◀ Back'], 'inbox stale');
  });
});

// ---------------------------------------------------------------------------
// 13c — menu: >20 proposals are capped with "… and N more" (S4 convention)
// ---------------------------------------------------------------------------

describe('menu — inboxVerifyProposals 20-row cap', () => {
  it('21 candidates ⇒ at most 20 rows rendered + "… and 1 more"', () => {
    const sb = makeSandbox();
    for (let i = 0; i < 21; i++) {
      writeStalePlan(sb, 'functional', 'p' + String(i).padStart(2, '0'));
    }
    const spy = spyChildProcess({ execFileSync: () => '1700000000' });
    let screen;
    try {
      screen = menuScreens.inboxVerifyProposals(sb);
    } finally {
      spy.restore();
    }
    assert.ok(screen.text.includes('… and 1 more'), 'cap summary line must appear');
    const rows = screen.text.split('\n').filter((l) => l.trim().startsWith('•')).length;
    assert.equal(rows, 20, 'at most 20 proposal rows rendered');
  });
});

// ---------------------------------------------------------------------------
// 14 — no side effects across verify+classify+render (M7)
// ---------------------------------------------------------------------------

describe('no side effects across verify+classify+render', () => {
  it('no write/rename/rm during inbox verify; git reads allowed', () => {
    const sb = makeSandbox();
    writeStalePlan(sb, 'functional', 'p-sidefx');
    const origWrite = fs.writeFileSync;
    const origRename = fs.renameSync;
    const origRm = fs.rmSync;
    let mutated = false;
    fs.writeFileSync = () => { mutated = true; };
    fs.renameSync = () => { mutated = true; };
    fs.rmSync = () => { mutated = true; };
    const spy = spyChildProcess({ execFileSync: () => '1700000000' });
    try {
      menuScreens.route(['inbox', 'verify'], sb);
    } finally {
      fs.writeFileSync = origWrite;
      fs.renameSync = origRename;
      fs.rmSync = origRm;
      spy.restore();
    }
    assert.equal(mutated, false, 'verify+classify+render must not write/move/delete');
  });
});

// A complete, well-formed gitAvailable:true evidence object ⇒ classifier returns
// 'inconclusive' (no shipping evidence). Reused by the fan-out and per-row tests.
const inconclusiveEvidence = () => ({
  gitAvailable: true,
  error: null,
  approvedBy: null,
  declaredFiles: [],
  allFilesExist: true,
  anyFileMissing: false,
  stageEntryEpoch: null,
  filesLastModifiedEpoch: null,
  filesModifiedAfterEntry: false,
  slugMatchCommits: [],
  slugMatchAfterEntry: false,
  explicitlyRejected: false,
});

// ---------------------------------------------------------------------------
// 15 — FIX 1a: empty-slug `.md` filename is never a cheap-scan candidate
// ---------------------------------------------------------------------------

describe('scanCheapCandidates — empty-slug filename skipped', () => {
  it('a plans/functional/.md file produces NO empty-slug candidate and does not throw', () => {
    const sb = makeSandbox();
    writeStalePlan(sb, 'functional', 'p-real'); // a genuine candidate to keep alongside
    // A literal `.md` filename ⇒ slug = '' ⇒ would crash verify if it became a candidate.
    fs.writeFileSync(path.join(sb, 'plans', 'functional', '.md'), '---\nfiles: [src/lib/gone.js]\n---\n');
    let res;
    assert.doesNotThrow(() => { res = staleDetector.scanCheapCandidates(sb); });
    assert.ok(res.candidates.every((c) => c.plan.length > 0), 'no empty-slug candidate');
    assert.ok(!res.candidates.some((c) => c.plan === ''), 'plan:"" must never appear');
    // The real plan is still detected — the skip is surgical, not over-broad.
    assert.ok(res.candidates.some((c) => c.plan === 'p-real'), 'real candidate still found');
  });
});

// ---------------------------------------------------------------------------
// 16 — FIX 1b: a throwing candidate degrades its ROW, never crashes the screen
// ---------------------------------------------------------------------------

describe('inboxVerifyProposals — per-row verify failure degrades, does not crash', () => {
  it('verify throwing on one candidate ⇒ valid screen, that row inconclusive, siblings render', () => {
    const sb = makeSandbox();
    writeStalePlan(sb, 'functional', 'p-aaa');
    writeStalePlan(sb, 'functional', 'p-bbb');
    const orig = staleDetector.verifyStaleCandidate;
    let n = 0;
    staleDetector.verifyStaleCandidate = () => {
      n++;
      if (n === 1) throw new TypeError('boom'); // first candidate throws
      return inconclusiveEvidence();
    };
    let screen;
    try {
      assert.doesNotThrow(() => { screen = menuScreens.inboxVerifyProposals(sb); });
    } finally {
      staleDetector.verifyStaleCandidate = orig;
    }
    assert.ok(typeof screen.text === 'string' && screen.text.length > 0, 'valid screen returned');
    assert.ok(screen.text.includes('verification error'), 'degraded row shows verification error');
    // Both rows render — the crash on row 1 did not suppress row 2 (sorted: p-aaa, p-bbb).
    assert.ok(screen.text.includes('p-aaa'), 'errored row still rendered with its slug');
    assert.ok(screen.text.includes('p-bbb'), 'sibling row still rendered');
    assert.equal(screen.actions['◀ Back'], 'inbox stale');
  });
});

// ---------------------------------------------------------------------------
// 17 — FIX 2: verification fan-out is capped at MAX_ROWS BEFORE the display slice
// ---------------------------------------------------------------------------

describe('inboxVerifyProposals — fan-out capped before verifying', () => {
  it('25 candidates ⇒ verifyStaleCandidate invoked at most 20 times; 20 rows + true "… and 5 more"', () => {
    const sb = makeSandbox();
    const MAX_ROWS = 20;
    for (let i = 0; i < 25; i++) writeStalePlan(sb, 'functional', 'p' + String(i).padStart(2, '0'));
    const orig = staleDetector.verifyStaleCandidate;
    let calls = 0;
    staleDetector.verifyStaleCandidate = () => { calls++; return inconclusiveEvidence(); };
    let screen;
    try {
      screen = menuScreens.inboxVerifyProposals(sb);
    } finally {
      staleDetector.verifyStaleCandidate = orig;
    }
    assert.ok(calls <= MAX_ROWS, 'verify must not run more than MAX_ROWS times, got ' + calls);
    assert.equal(calls, MAX_ROWS, 'verify runs exactly MAX_ROWS times (sliced before fan-out)');
    const rows = screen.text.split('\n').filter((l) => l.trim().startsWith('•')).length;
    assert.equal(rows, MAX_ROWS, 'exactly MAX_ROWS rows rendered');
    assert.ok(screen.text.includes('… and 5 more'), 'true remaining (25-20=5) reflected honestly');
  });
});

// ---------------------------------------------------------------------------
// 18 — FIX 3: commit subject is C0/C1-stripped AT CAPTURE in verifyStaleCandidate
// ---------------------------------------------------------------------------

describe('verifyStaleCandidate — commit subject stripped of control chars at capture', () => {
  it('a hostile commit subject (ESC sequence) is sanitized in slugMatchCommits[].subject', () => {
    const sb = makeSandbox();
    writeStalePlan(sb, 'functional', 'p-ctl');
    const cand = baseCandidate('p-ctl');
    const spy = spyChildProcess({
      execFileSync: (_file, args) => {
        const a = args.join(' ');
        if (a.includes('rev-parse')) return '';
        // slug-history scan: one record whose subject embeds an ESC color sequence.
        if (a.includes('%x1f')) return '1700000000\x1fabc1234\x1fship p-ctl \x1b[31mEVIL\x1b[0m\x1e';
        return '1700000000'; // %ct epoch queries
      },
    });
    let evidence;
    try {
      evidence = verifyStaleCandidate(cand, sb);
    } finally {
      spy.restore();
    }
    assert.equal(evidence.slugMatchCommits.length, 1, 'slug matched the commit');
    const subject = evidence.slugMatchCommits[0].subject;
    assert.ok(!/[\x00-\x1f\x7f-\x9f]/.test(subject), 'subject must carry NO control chars: ' + JSON.stringify(subject));
    assert.ok(subject.includes('ship p-ctl'), 'visible text preserved');
  });
});

// ---------------------------------------------------------------------------
// 19 — FIX 4: classifyStaleCandidate default-guards malformed/partial evidence
// ---------------------------------------------------------------------------

describe('classifyStaleCandidate — malformed evidence degrades, never throws', () => {
  it('undefined evidence ⇒ inconclusive, null action, no throw', () => {
    const cand = baseCandidate('p-undef');
    let p;
    assert.doesNotThrow(() => { p = classifyStaleCandidate(cand, undefined); });
    assert.equal(p.category, 'inconclusive');
    assert.equal(p.proposedAction, null);
    assert.equal(p.plan, 'p-undef');
  });

  it('partial evidence {gitAvailable:true} (no slugMatchCommits) ⇒ inconclusive, no throw', () => {
    const cand = baseCandidate('p-partial');
    let p;
    assert.doesNotThrow(() => { p = classifyStaleCandidate(cand, { gitAvailable: true }); });
    assert.equal(p.category, 'inconclusive');
    assert.equal(p.proposedAction, null);
  });
});

// ---------------------------------------------------------------------------
// 20 — FIX 5: empty drill-in exposes ONLY Back (no Verify)
// ---------------------------------------------------------------------------

describe('inboxStalePlansDrillIn — empty candidate set actions', () => {
  it('0 candidates ⇒ actions deepEqual {"◀ Back":""} and exactly one option', () => {
    const sb = makeSandbox(); // no plans ⇒ zero candidates
    const screen = menuScreens.inboxStalePlansDrillIn(sb);
    assert.deepEqual(screen.actions, { '◀ Back': '' });
    assert.equal(screen.ask.questions[0].options.length, 1);
    assert.equal(screen.ask.questions[0].options[0].label, '◀ Back');
  });
});
