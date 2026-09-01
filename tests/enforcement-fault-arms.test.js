/**
 * CTOC — MAKE EVERY FAIL-CLOSED ENFORCEMENT ARM THROW, AND WATCH IT DENY.
 *
 * WHAT THESE ARMS ARE. Scattered across the permission path are `catch` blocks whose
 * only job is to keep the harness CLOSED when something underneath them breaks. They
 * are the inverse of the fail-open reporting checks that neighbour them: a permission
 * check that throws reaches a hook catch which ALLOWS, so "fail closed" here means
 * RETURNING a refusing value, never throwing. Every one of them was believed rather
 * than verified — nothing had ever made them throw — so a future edit could flip any
 * one to an allow and the whole suite would stay green.
 *
 * WHAT EACH CASE DOES. Injects a fault at a TRUE boundary (`safeFs`, `node:path`, a
 * sibling module's exports object, or a child process preload) and asserts the exact
 * DENY-WARD value the arm documents. No function under test is ever stubbed. Every
 * mock carries a path sentinel so only the case's own input faults and the rest of the
 * process keeps working, and every mock is restored (`t.mock.method` restores itself;
 * the spawned cases mutate only a child's module cache).
 *
 * DIRECTION MATTERS MORE THAN THE VALUE. `escapesRoot` denies with `true` and
 * `resolvesUnder` denies with `true` while `isApprovedForCoverage` denies with
 * `false` — they answer opposite questions. Each case therefore asserts the value AND,
 * where a control run is meaningful, the opposite value on the same input without the
 * fault, so no case can pass by accident.
 *
 * RANGES COVERED (re-derived from the current files on 2026-09-01):
 *   src/lib/approval-residency.js      285-288  isApprovedForCoverage catch
 *   src/lib/approval-residency.js      279      stage-not-coverable (same contract, one branch over)
 *   src/lib/plan-coverage.js           467-469  target-path resolution fault -> FAILED
 *   src/lib/plan-coverage.js           669-672  explainDenial fault -> null
 *   src/lib/real-path-confinement.js   165      resolveExisting walk exhaustion
 *   src/lib/real-path-confinement.js   166-169  resolveExisting outer catch
 *   src/lib/real-path-confinement.js   195-198  resolveBasis outer catch
 *   src/lib/real-path-confinement.js   257-259  escapesRoot outer catch
 *   src/lib/real-path-confinement.js   304-306  resolvesUnder outer catch
 *   src/lib/shell-write-targets.js     187      skipWrapperArgs `suppresses` false arm
 *   src/lib/shell-write-targets.js     526-529  classifyWrites catch
 *   src/hooks/PreToolUse.Bash.js       826-830  checkWriteCoverage catch
 *   src/hooks/PreToolUse.Bash.js       1068-1071 main().catch
 *
 * RANGE DELIBERATELY LEFT, WITH ITS REASON — src/lib/plan-coverage.js 245-247, the
 * `touchesOverlap` pathological-glob catch. It is UNREACHABLE without stubbing the
 * module under test, and the module says so itself at globToRegex's docblock: "Never
 * throws for any input (tokenize and match are total functions), so the safety-oracle
 * catch in `touchesOverlap` stays correct as documented-unreachable defense in depth."
 * `globToRegex` is defined INSIDE plan-coverage.js — it is not required from a sibling
 * — so there is no loader seam and no boundary to inject at; both non-string and empty
 * entries are filtered before the try. Rather than fake it, the case below pins the
 * PREMISE the unreachability rests on (totality over adversarial globs). If a future
 * edit makes `globToRegex` throw, that case reds and the arm becomes reachable.
 *
 * ONE ARM PINS A DOCUMENTED FAIL-OPEN, not a deny: `PreToolUse.Bash.js`'s `main().catch`
 * exits 1, and the file's own comment records that the harness treats exit 1 as
 * NON-blocking — so it is a cosmetic code, not a deny. This file pins it exactly as it
 * is so any future change to it is visible; changing it is the human's decision.
 *
 * Run with: node --test tests/enforcement-fault-arms.test.js
 * The gate is `npm test` (coverage floor + zero-skipped); `node --test` alone is not.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const HOOK = path.join(REPO, 'src', 'hooks', 'PreToolUse.Bash.js');

const safeFs = require(path.join(REPO, 'src', 'lib', 'safe-fs'));
const ledger = require(path.join(REPO, 'src', 'lib', 'approval-ledger'));
const approvalResidency = require(path.join(REPO, 'src', 'lib', 'approval-residency'));
const coverage = require(path.join(REPO, 'src', 'lib', 'plan-coverage'));
const confinement = require(path.join(REPO, 'src', 'lib', 'real-path-confinement'));
const shellWrites = require(path.join(REPO, 'src', 'lib', 'shell-write-targets'));
const stateManager = require(path.join(REPO, 'src', 'lib', 'state-manager'));

/** The one marker every injected fault keys on, so no other read in this process faults. */
const SENTINEL = 'CTOC-FAULT-SENTINEL';

/** `analysis fault` — shell-write-targets' REASONS.FAULT (the table is module-private). */
const REASON_FAULT = 'analysis fault';

let project;

/** A hermetic CTOC project under os.tmpdir(), realpath'd (macOS /tmp is a link). */
function makeProject(prefix = 'ctoc-fault-arms-') {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  fs.mkdirSync(path.join(dir, '.ctoc', 'approvals'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.ctoc', 'logs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# CTOC Project Instructions\n');
  for (const stage of ['functional', 'implementation', 'todo', 'review', 'done']) {
    fs.mkdirSync(path.join(dir, 'plans', stage), { recursive: true });
  }
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  return dir;
}

function cleanupProject(dir) {
  if (!dir) return;
  try { fs.rmSync(stateManager.getStatePath(dir), { force: true }); } catch { /* may not exist */ }
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * A plan in plans/todo declaring `declared`, optionally with a REAL ledger approval
 * (a plan file alone grants nothing — coverage consults the agent-write-denied ledger).
 */
function writePlan(root, name, declared, { approved = true } = {}) {
  const body = `---\nfiles:\n  - "${declared}"\n---\n\n# ${name}\n`;
  const planPath = path.join(root, 'plans', 'todo', `${name}.md`);
  fs.writeFileSync(planPath, body, 'utf8');
  if (approved) {
    ledger.writeEntry(ledger.slugFromPlanPath(planPath), {
      content: body, stage_from: 'implementation', stage_to: 'todo', approved_by: 'human',
    }, root);
  }
  return planPath;
}

// ---------------------------------------------------------------------------
// 1. approval-residency — a classifier fault must DENY, never throw
// ---------------------------------------------------------------------------

describe('approval-residency: a fault inside the classifier denies', () => {
  beforeEach(() => { project = makeProject(); });
  afterEach(() => { cleanupProject(project); project = null; });

  it('a classifier fault returns approved:false / classify-error / kind:null — a throw would become an ALLOW', (t) => {
    const planPath = writePlan(project, `00236-${SENTINEL}-arm1`, 'src/arm1.js');

    // Control: with no fault this very plan IS approved, so the fault below is the
    // only thing that can flip the verdict.
    const clean = approvalResidency.isApprovedForCoverage(planPath, 'todo', project);
    assert.equal(clean.approved, true, 'fixture must be genuinely approved, or the fault case proves nothing');

    // Boundary: approval-ledger's exports object, looked up at call time inside
    // classifyResidency (`ledger.slugFromPlanPath(filePath)`). The function under
    // test is NOT stubbed.
    const realSlug = ledger.slugFromPlanPath;
    t.mock.method(ledger, 'slugFromPlanPath', (p) => {
      if (String(p).includes(SENTINEL)) throw new Error('injected classifier fault');
      return realSlug(p);
    });

    const verdict = approvalResidency.isApprovedForCoverage(planPath, 'todo', project);
    assert.deepEqual(verdict, { approved: false, reason: 'classify-error', kind: null });
  });

  it('a residency stage with no declared gate edge is not coverable — stage-not-coverable', () => {
    const planPath = writePlan(project, '00236-stage-arm', 'src/arm1b.js');
    assert.deepEqual(
      approvalResidency.isApprovedForCoverage(planPath, 'review', project),
      { approved: false, reason: 'stage-not-coverable', kind: null },
    );
  });
});

// ---------------------------------------------------------------------------
// 2-4. plan-coverage
// ---------------------------------------------------------------------------

describe('plan-coverage: a scan that could not look grants nothing', () => {
  beforeEach(() => { project = makeProject(); });
  afterEach(() => { cleanupProject(project); project = null; });

  it('touchesOverlap: the pathological-glob catch is UNREACHABLE — this pins the totality premise it rests on', () => {
    // globToRegex is module-local and total, so nothing can make it throw without
    // stubbing the module under test. What CAN be asserted is the premise: adversarial
    // globs neither throw nor mis-answer. If that premise ever breaks, the catch
    // becomes reachable and this case is the one that says so.
    const adversarial = [
      '**/**/**/**/**/**/**/**/**/**/x.js',
      '*'.repeat(200) + '/a.js',
      'src/[a-z]{1,2}(x|y)+.js',
      'a\\b\\c/**',
      '**',
    ];
    for (const g of adversarial) {
      assert.equal(typeof coverage.touchesOverlap([g], ['src/x.js']), 'boolean', `no throw for ${g.slice(0, 20)}`);
    }
    assert.equal(coverage.touchesOverlap(['src/**'], ['src/deep/x.js']), true);
    assert.equal(coverage.touchesOverlap(['src/**'], ['tests/x.js']), false);
    // The conservative direction the arm exists to protect, reached by the ordinary path.
    assert.equal(coverage.touchesOverlap(['**'], ['anything/at/all.js']), true);
  });

  it('findCoveringPlan: an unresolvable target path yields NO covering plan (the FAILED verdict), never a grant', (t) => {
    const target = `src/${SENTINEL}.js`;
    writePlan(project, '00236-arm3-covering', target);

    // Control: the target really is covered, so `null` below can only come from the fault.
    const clean = coverage.findCoveringPlan(target, project);
    assert.ok(clean && clean.stage === 'todo', 'fixture must genuinely cover the target');

    // Boundary: node:path. scanForCoverage's FIRST statement resolves the target with
    // path.isAbsolute; a throw there is the target-path resolution fault.
    const realIsAbsolute = path.isAbsolute;
    t.mock.method(path, 'isAbsolute', (p) => {
      if (String(p).includes(SENTINEL)) throw new Error('injected path fault');
      return realIsAbsolute(p);
    });

    assert.equal(coverage.findCoveringPlan(target, project), null,
      'a scan that could not resolve the target must not vouch for it');
    assert.equal(coverage.explainDenial(target, project), null,
      'a failed scan explains nothing either');
  });

  it('explainDenial: a fault returns null and changes no decision — it never throws into the hook fail-open catch', (t) => {
    project = makeProject(`ctoc-fault-arms-${SENTINEL}-`);
    const target = 'src/arm4.js';
    writePlan(project, '00236-arm4-unapproved', target, { approved: false });

    // Control: an unapproved plan DID declare the target, so the denial is explained.
    const clean = coverage.explainDenial(target, project);
    assert.ok(clean && clean.reason === 'no-ledger-entry', 'fixture must produce a real explained denial');

    // Boundary: node:path, narrowed to the stage-directory join inside scanForCoverage
    // (the second argument is literally 'plans'), which sits OUTSIDE that function's own
    // try — so the throw propagates into explainDenial's catch.
    const realJoin = path.join;
    t.mock.method(path, 'join', (...args) => {
      if (args[1] === 'plans' && String(args[0]).includes(SENTINEL)) throw new Error('injected join fault');
      return realJoin(...args);
    });

    assert.equal(coverage.explainDenial(target, project), null);
  });
});

// ---------------------------------------------------------------------------
// 5-8. real-path-confinement — four totality arms, both failing directions
// ---------------------------------------------------------------------------

describe('real-path-confinement: every fault denies, in whichever boolean carries deny', () => {
  beforeEach(() => { project = makeProject(); });
  afterEach(() => { cleanupProject(project); project = null; });

  it('resolveExisting outer catch: a path-resolution fault gives escapes:true / resolve-failed', (t) => {
    const target = `${SENTINEL}/x.js`;
    assert.deepEqual(confinement.escapesRoot(target, project), { escapes: false, reason: null },
      'control: an in-tree target does not escape');

    const realResolve = path.resolve;
    t.mock.method(path, 'resolve', (...args) => {
      if (args.some((a) => String(a).includes(SENTINEL))) throw new Error('injected resolve fault');
      return realResolve(...args);
    });

    assert.deepEqual(confinement.escapesRoot(target, project), { escapes: true, reason: 'resolve-failed' });
  });

  it('resolveExisting walk exhaustion: a path deeper than the ancestor bound gives escapes:true / resolve-failed', (t) => {
    // The bound is MAX_ANCESTOR_WALK = 4096 (read from the module this session). Mock the
    // two filesystem primitives the walk uses so every sentinel segment reports "absent"
    // (ENOENT from realpath AND from lstat = genuinely absent, the ordinary new-file
    // case), which makes the walk climb until it exhausts its bound.
    const deep = `${SENTINEL}/` + 'a/'.repeat(4200) + 'x.js';
    const enoent = () => { const e = new Error('injected ENOENT'); e.code = 'ENOENT'; throw e; };
    const realRealpath = safeFs.realpathSync;
    const realLstat = safeFs.lstatSync;
    t.mock.method(safeFs, 'realpathSync', (p, o) => {
      if (String(p).includes(SENTINEL)) enoent();
      return realRealpath(p, o);
    });
    t.mock.method(safeFs, 'lstatSync', (p, o) => {
      if (String(p).includes(SENTINEL)) enoent();
      return realLstat(p, o);
    });

    assert.deepEqual(confinement.escapesRoot(deep, project), { escapes: true, reason: 'resolve-failed' });
  });

  it('resolveBasis outer catch: an unreadable comparison basis gives escapes:true / root-resolve-failed', (t) => {
    const sentinelRoot = path.join(os.tmpdir(), `${SENTINEL}-basis-root`);
    const realRealpath = safeFs.realpathSync;
    t.mock.method(safeFs, 'realpathSync', (p, o) => {
      if (String(p).includes(SENTINEL)) {
        // A NON-Error whose `code` getter throws: the inner catch reads `err.code`, so
        // the fault escapes the inner catch and reaches the OUTER one. Nothing else can
        // reach it — every other primitive in that try is total.
        throw { get code() { throw new Error('injected code-getter fault'); } };
      }
      return realRealpath(p, o);
    });

    assert.deepEqual(confinement.escapesRoot('src/x.js', sentinelRoot),
      { escapes: true, reason: 'root-resolve-failed' });
  });

  it('escapesRoot outer catch: any other fault gives escapes:true / fault — never escapes:false', (t) => {
    const target = `${SENTINEL}/x.js`;
    const realIsAbsolute = path.isAbsolute;
    t.mock.method(path, 'isAbsolute', (p) => {
      if (String(p).includes(SENTINEL)) throw new Error('injected isAbsolute fault');
      return realIsAbsolute(p);
    });

    const res = confinement.escapesRoot(target, project);
    assert.deepEqual(res, { escapes: true, reason: 'fault' });
    assert.notEqual(res.escapes, false, 'escapes:false here would turn a confinement check into a permission grant');
  });

  it('resolvesUnder outer catch: a fault returns TRUE — the inverted direction, and it still means DENY', (t) => {
    const target = `${SENTINEL}/x.js`;
    assert.equal(confinement.resolvesUnder(target, '.ctoc/approvals', project), false,
      'control: this target is genuinely outside the protected directory');

    const realIsAbsolute = path.isAbsolute;
    t.mock.method(path, 'isAbsolute', (p) => {
      if (String(p).includes(SENTINEL)) throw new Error('injected isAbsolute fault');
      return realIsAbsolute(p);
    });

    assert.equal(confinement.resolvesUnder(target, '.ctoc/approvals', project), true,
      'a protected-directory check that cannot look must treat the target as protected');
  });
});

// ---------------------------------------------------------------------------
// 9-10. shell-write-targets
// ---------------------------------------------------------------------------

describe('shell-write-targets: a classifier fault is indeterminate, never none', () => {
  it('classifyWrites catch: an analysis fault gives indeterminate + "analysis fault", and NEVER none (none means allow)', (t) => {
    const command = `echo x > /${SENTINEL}/out.js`;

    const clean = shellWrites.classifyWrites(command);
    assert.equal(clean.verdict, 'writes', 'control: this is a plain determinate redirect write');

    // Boundary: node:path's posix namespace, which resolveTarget calls to normalise a
    // target. classifyWrites itself is pure and is NOT stubbed.
    const realNormalize = path.posix.normalize;
    t.mock.method(path.posix, 'normalize', (p) => {
      if (String(p).includes(SENTINEL)) throw new Error('injected normalize fault');
      return realNormalize(p);
    });

    const res = shellWrites.classifyWrites(command);
    assert.equal(res.verdict, 'indeterminate');
    assert.notEqual(res.verdict, 'none', "'none' means 'no write here, allow' — a fault must never say that");
    assert.deepEqual(res.targets, []);
    assert.equal(res.reason, REASON_FAULT);
  });

  it('skipWrapperArgs: a wrapper flag that does NOT suppress the operand leaves the operand in place, so the real command word still resolves', () => {
    // taskset is the one wrapper with a suppressOperand set ({-c, --cpu-list}). `-a` is
    // not in it, so `suppresses` returns false, the MASK operand is still consumed, and
    // `tee` is found as the command word. A mutant that always suppressed would eat the
    // mask count and mistake `0x3` for the command word.
    const res = shellWrites.classifyWrites('taskset -a 0x3 tee src/arm10.js');
    assert.equal(res.verdict, 'writes');
    assert.deepEqual(res.targets, ['src/arm10.js']);

    // The suppressing form resolves to the same writer through the other branch.
    const suppressed = shellWrites.classifyWrites('taskset -c 0-1 tee src/arm10.js');
    assert.equal(suppressed.verdict, 'writes');
    assert.deepEqual(suppressed.targets, ['src/arm10.js']);
  });
});

// ---------------------------------------------------------------------------
// 11-12. PreToolUse.Bash.js — spawned, because the hook exports nothing on purpose
// ---------------------------------------------------------------------------

describe('PreToolUse.Bash: the shell channel denies when it cannot decide', () => {
  let preload;

  beforeEach(() => {
    project = makeProject();
    preload = null;
  });

  afterEach(() => {
    if (preload) { try { fs.rmSync(preload, { force: true }); } catch { /* already gone */ } }
    cleanupProject(project);
    project = null;
  });

  /** Write a --require preload that mutates one already-loaded module's exports. */
  function writePreload(body) {
    const p = path.join(os.tmpdir(), `ctoc-fault-preload-${process.pid}-${Date.now()}.js`);
    fs.writeFileSync(p, body, 'utf8');
    preload = p;
    return p;
  }

  function runHook(command, { preloadPath = null } = {}) {
    const args = preloadPath ? ['--require', preloadPath, HOOK] : [HOOK];
    return spawnSync(process.execPath, args, {
      cwd: project,
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
      env: { ...process.env, CLAUDE_TOOL_INPUT: '' },
      encoding: 'utf8',
    });
  }

  function denyReason(res) {
    const s = (res.stdout ? String(res.stdout) : '').trim();
    if (!s) return null;
    let decision = null;
    try { decision = JSON.parse(s); } catch { /* a banner may precede the JSON */ }
    if (!decision) {
      const idx = s.indexOf('{');
      if (idx === -1) return null;
      try { decision = JSON.parse(s.slice(idx)); } catch { return null; }
    }
    const out = decision && decision.hookSpecificOutput;
    if (!out || out.permissionDecision !== 'deny') return null;
    return out.permissionDecisionReason || '';
  }

  function setState(step, feature = 'fault-arms-feature') {
    const state = stateManager.createState(project, feature, 'javascript', null);
    state.currentStep = step;
    stateManager.saveState(project, state);
  }

  it('checkWriteCoverage catch: a coverage-oracle fault DENIES the write (uncovered), naming the target', () => {
    setState(10);
    writePlan(project, '00236-arm11-covering', 'src/covered.js');

    // Control: the write is genuinely covered, so it is allowed today.
    const clean = runHook('echo x > src/covered.js');
    assert.equal(denyReason(clean), null, 'control: an approved covering plan allows the write');
    assert.equal(clean.status, 0);

    // Boundary: the child's module cache. findCoveringPlan is replaced on the already
    // loaded plan-coverage exports object; every other export stays intact, and
    // checkWriteCoverage — the function under test — is untouched.
    const target = path.join(REPO, 'src', 'lib', 'plan-coverage.js').replace(/\\/g, '\\\\');
    const p = writePreload(
      `const m = require('${target}');\n`
      + "m.findCoveringPlan = () => { throw new Error('injected coverage-oracle fault'); };\n",
    );

    const res = runHook('echo x > src/covered.js', { preloadPath: p });
    const reason = denyReason(res);
    assert.ok(reason, 'a coverage oracle that threw must produce a DENY, not an allow');
    assert.match(reason, /src\/covered\.js/, 'the denial names the target so the human can act on it');
  });

  it('main().catch: an unhandled fault exits 1 with "[CTOC] Bash gate error:" on stderr — a cosmetic code the harness reads as NON-blocking', () => {
    setState(10);

    // Control: a harmless command is allowed.
    const clean = runHook('echo hello');
    assert.equal(clean.status, 0);

    const target = path.join(REPO, 'src', 'lib', 'state-manager.js').replace(/\\/g, '\\\\');
    const p = writePreload(
      `const m = require('${target}');\n`
      + "m.loadState = () => { throw new Error('injected state fault'); };\n",
    );

    const res = runHook('echo hello', { preloadPath: p });
    assert.equal(res.status, 1, 'the documented exit code for an unhandled fault');
    assert.match(String(res.stderr), /\[CTOC\] Bash gate error:/);
    // Pinned as-is: exit 1 is NOT a deny. Changing that is the human's decision.
    assert.equal(denyReason(res), null, 'exit 1 carries no deny decision JSON — that is the documented fail-open');
  });
});
