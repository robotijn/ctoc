'use strict';

/**
 * The dark ranges of the plan-operations module — `src/lib/actions.js`.
 *
 * This module creates, moves, approves, rejects and completes plans. Its catch arms
 * are not decoration: each one decides what happens to a HUMAN'S APPROVAL when a
 * dependency breaks mid-crossing, and every one of them points in a deliberate
 * direction that this file pins by name:
 *
 *   - A COMMIT fault ROLLS BACK. The atomic writer unlinks its temp and rethrows, so
 *     a half-finished gate crossing leaves the plan byte-identical at its source
 *     stage with no litter — never a marked plan at a destination nobody approved.
 *   - A PLAN-INDEX fault is LOGGED and SWALLOWED. The index is a rebuildable cache;
 *     it must never break the rename that is the real transition. But the two index
 *     faults are NOT the same: a store fault is RECORDED, a wiring-LOAD fault is
 *     silent (the seam is simply absent). A mutant that collapsed the two would
 *     either spam a log on every project without the index, or lose the one record
 *     that says the index is broken.
 *   - A NOTICE / LOG / DEPLOY fault NEVER UN-CROSSES a gate. The plan has already
 *     moved; a transition-log, deploy-ready or deployment-pipeline failure is
 *     reported to the console and the crossing stands.
 *   - A VERIFY fault PRODUCES NO EVIDENCE. `completeExecution` records `verify: null`
 *     and writes no artifact, so the review gate fails closed on absence rather than
 *     on a fabricated pass. A mutant that invented a passing verdict here would ship
 *     unverified code.
 *   - A BREAKER fault still REPORTS. When the circuit breaker can neither count a
 *     kickback nor persist that it failed, `recordStepKickback` returns
 *     `{ recorded: false }` rather than throwing — a frozen counter is surfaced, not
 *     a crashed pipeline.
 *   - A BATCH fault SKIPS ONE SIBLING, never the batch. One sibling whose crossing
 *     throws is reported in `skipped` with its reason; the rest still cross.
 *
 * RANGES COVERED (complete uncovered list for src/lib/actions.js as printed by the
 * gate on 2026-09-03: line 97.47%, branch 85.47%, function 96.10%):
 *
 *    56-58      atomicWriteFileSync: commit fault  -> unlink temp, rethrow, roll back
 *   150-151     movePlan: store.moveUnit fault     -> logged, rename stands
 *   185-187     loadPlanIndexWiring: load fault    -> null, silent, rename stands
 *   202-203     canonicalizeRoot: realpath absent  -> the un-canonicalized path
 *   236-252     logPlanIndexError: append (239-248), corrupt-log reset (243),
 *               500-entry cap (247), write fault swallowed (249-251)
 *   514-515     approvePlan: the non-gate fallback -> bare move, no marker, no ledger
 *   562         approvePlan: deployment rejection  -> caught, crossing stands
 *   596-598     approvePlan: transition-log fault  -> reported, crossing stands
 *   762-763     recordRefinementGate: inline `files:` string -> split into globs
 *   777-778     recordRefinementGate: write fault  -> fail-open, plan untouched
 *  1069-1073    completeExecution: verify run threw -> verify null, no evidence
 *  1138-1139    completeExecution: registry fault  -> plan stays in review
 *  1469-1470    failingStepFrom: no incomplete step -> step 14, the default
 *  1508-1509    recordStepKickback: breaker AND its failure log both throw -> report
 *  1566-1567    recordDeployReadyNotice: corrupt log -> reset, not appended to
 *  1587-1588    recordDeployReadyNotice: write fault -> reported, crossing stands
 *  1612-1613    planDeclaredFiles: frontmatter reader threw -> no declared files
 *  1712-1713    taskSpecFromPlan: malformed plan object -> TypeError before any I/O
 *  2391-2394    topoOrderByDependsOn: dependency cycle -> every sibling still emitted
 *  2446-2448    approveSubplans: a sibling that throws -> skipped, batch continues
 *
 * RANGES LEFT UNCOVERED: none.
 *
 * ONE CLASSIFICATION IS WORTH STATING. Lines 514-515 are the `else` of
 * `if (isHumanGate)` inside `approvePlan`, and every edge in `gate-order.GATE_EDGES`
 * IS a human gate, so no input to `approvePlan` reaches it — it is a defensive
 * fallback for a hypothetical non-gate flow, exactly as its comment says. It is
 * driven here by injecting at the `gate-order` module boundary (`isHumanGate`), and
 * what it asserts is the property that makes the fallback safe: the non-gate path
 * moves the plan and stamps NOTHING — no approval marker, no ledger entry. A mutant
 * that made both branches stamp would turn a non-gate move into a forged approval.
 *
 * FAULT INJECTION IS AT TRUE BOUNDARIES ONLY — the shared `safe-fs`, `gate-order`,
 * `circuit-breaker`, `task-registry`, `deployment`, `stale-detector` and
 * `plan-index/wiring` module objects via `t.mock.method`, `fs.realpathSync.native`,
 * the module loader (restored in a `finally`), and the fixture's own on-disk state.
 * No function under test is stubbed. `approvePlan`'s documented `options.deps`
 * validator seam is used only where validation is not the subject.
 *
 * Fixtures are real project trees under `os.tmpdir()`, removed after each test. The
 * final case is a TRIPWIRE: this repository's own `plans/`, `.ctoc/approvals/` and
 * `.ctoc/state/verify/` must be byte-identical after this suite has run.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const actions = require('../src/lib/actions');
const safeFs = require('../src/lib/safe-fs');
const gateOrder = require('../src/lib/gate-order');
const ledger = require('../src/lib/approval-ledger');
const circuitBreaker = require('../src/lib/circuit-breaker');
const taskRegistry = require('../src/lib/task-registry');
const deployment = require('../src/lib/deployment');
const staleDetector = require('../src/lib/stale-detector');
const planIndexWiring = require('../src/lib/plan-index/wiring');

const STAGES = ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
const REPO = path.resolve(__dirname, '..');

// ── fixtures ────────────────────────────────────────────────────────────────

function mkProject(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  for (const stage of STAGES) fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
  fs.mkdirSync(path.join(root, '.ctoc', 'logs'), { recursive: true });
  return root;
}

function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
}

/** A minimal, well-formed plan at `stage`. Returns its path. */
function writePlan(root, stage, slug, extraFrontmatter = '', body = 'Some descriptive prose about the approach.\n') {
  const p = path.join(root, 'plans', stage, `${slug}.md`);
  fs.writeFileSync(
    p,
    `---\ntitle: "${slug}"\ntype: implementation\n${extraFrontmatter}---\n\n# ${slug}\n\n${body}`
  );
  return p;
}

/** The documented validator seam — used only where validation is not the subject. */
const PASS_VALIDATION = { validateTransition: () => ({ valid: true, errors: [], warnings: [] }) };

/** Recursive digest of a directory tree: sorted `relpath:sha256(bytes)` lines. */
function digestTree(dir) {
  if (!fs.existsSync(dir)) return 'ABSENT';
  const lines = [];
  const walk = (d, rel) => {
    for (const name of fs.readdirSync(d).sort()) {
      const abs = path.join(d, name);
      const st = fs.lstatSync(abs);
      if (st.isDirectory()) walk(abs, `${rel}${name}/`);
      else if (st.isFile()) {
        lines.push(`${rel}${name}:${crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex')}`);
      } else lines.push(`${rel}${name}:NON-REGULAR`);
    }
  };
  walk(dir, '');
  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
}

const REPO_BEFORE = {
  plans: digestTree(path.join(REPO, 'plans')),
  approvals: digestTree(path.join(REPO, '.ctoc', 'approvals')),
  verify: digestTree(path.join(REPO, '.ctoc', 'state', 'verify'))
};

/** Patch the module loader so `moduleId` resolves to `replacement`. Returns a restorer. */
function patchLoad(moduleId, replacement) {
  const target = require.resolve(moduleId);
  const orig = Module._load;
  Module._load = function (request, parent, isMain) {
    let resolved = null;
    try { resolved = Module._resolveFilename(request, parent, isMain); } catch { /* unresolvable */ }
    if (resolved === target) return replacement;
    return orig.apply(this, arguments);
  };
  return () => { Module._load = orig; };
}

/** Collect console.error output for the duration of `fn`. */
function captureErrors(t) {
  const lines = [];
  t.mock.method(console, 'error', (...args) => { lines.push(args.map(String).join(' ')); });
  return lines;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// ── 56-58 — the atomic commit rolls back and leaves no litter ────────────────

test('a failed atomic commit unlinks its temp, rethrows, and the plan rolls back to its source stage', (t) => {
  const root = mkProject('ctoc-actions-holes-atomic-');
  try {
    const slug = 'atomic-rollback';
    const planPath = writePlan(root, 'functional', slug);
    const original = fs.readFileSync(planPath, 'utf8');

    // Fault EXACTLY the plan's own atomic commit: a temp source renamed onto the
    // plan file. The stage rename (no `.tmp-` source) and the approval ledger's own
    // atomic write (a different target) both run for real — otherwise this case
    // would pass on the ledger's rollback and prove nothing about THIS writer.
    const realRename = safeFs.renameSync;
    t.mock.method(safeFs, 'renameSync', (from, to) => {
      if (String(from).includes('.tmp-') && String(to).endsWith(`${slug}.md`)) {
        throw new Error('injected commit failure');
      }
      return realRename(from, to);
    });

    assert.throws(
      () => actions.approvePlan(planPath, root, { deps: PASS_VALIDATION }),
      /injected commit failure/,
      'the commit fault is RETHROWN — a crossing that could not commit must not report success'
    );

    assert.ok(fs.existsSync(planPath), 'the plan is rolled back to its source stage');
    assert.equal(fs.readFileSync(planPath, 'utf8'), original,
      'the rolled-back plan is byte-identical — no approval marker survives a failed commit');
    assert.equal(fs.existsSync(path.join(root, 'plans', 'implementation', `${slug}.md`)), false,
      'nothing is left at the destination stage');

    const litter = [];
    for (const stage of STAGES) {
      for (const name of fs.readdirSync(path.join(root, 'plans', stage))) {
        if (name.includes('.tmp-')) litter.push(`${stage}/${name}`);
      }
    }
    assert.deepEqual(litter, [], 'the temp sibling is unlinked — a failed commit leaves no litter');
  } finally {
    cleanup(root);
  }
});

// ── 150-151 + 236-252 — the plan-index seam ─────────────────────────────────

test('movePlan: a plan-index store fault is RECORDED in plan-index-sync.json and the rename still stands', (t) => {
  const root = mkProject('ctoc-actions-holes-index-');
  try {
    const planPath = writePlan(root, 'todo', 'index-fault');
    t.mock.method(planIndexWiring, 'getWiring', () => ({
      store: { moveUnit() { throw new Error('index store is down'); } }
    }));

    const newPath = actions.movePlan(planPath, 'in-progress', root);
    assert.ok(fs.existsSync(newPath), 'the rename — the real transition — completed');
    assert.equal(fs.existsSync(planPath), false, 'the source is gone');

    const log = readJson(path.join(root, '.ctoc', 'logs', 'plan-index-sync.json'));
    assert.equal(Array.isArray(log), true, 'the log is an array');
    assert.equal(log.length, 1, 'exactly one entry was appended');
    assert.equal(log[0].source, 'movePlan', 'the entry names the operation that failed');
    assert.equal(log[0].error, 'index store is down', 'the entry carries the real message');
    assert.match(log[0].timestamp, /^\d{4}-\d{2}-\d{2}T/, 'the entry is timestamped');
  } finally {
    cleanup(root);
  }
});

test('movePlan: a CORRUPT plan-index log is reset to a fresh one-entry array, never appended to', (t) => {
  const root = mkProject('ctoc-actions-holes-corrupt-');
  try {
    const logPath = path.join(root, '.ctoc', 'logs', 'plan-index-sync.json');
    fs.writeFileSync(logPath, '{ this is not json');
    const planPath = writePlan(root, 'todo', 'corrupt-log');
    t.mock.method(planIndexWiring, 'getWiring', () => ({
      store: { moveUnit() { throw new Error('after corruption'); } }
    }));

    actions.movePlan(planPath, 'in-progress', root);

    const log = readJson(logPath);
    assert.equal(log.length, 1, 'the unparseable log is DISCARDED — the new entry is not lost behind it');
    assert.equal(log[0].error, 'after corruption');
  } finally {
    cleanup(root);
  }
});

test('movePlan: the plan-index log is capped at 500 entries, keeping the NEWEST', (t) => {
  const root = mkProject('ctoc-actions-holes-cap-');
  try {
    const logPath = path.join(root, '.ctoc', 'logs', 'plan-index-sync.json');
    const seed = [];
    for (let i = 0; i < 500; i++) seed.push({ timestamp: '2026-01-01T00:00:00.000Z', source: `seed-${i}`, error: 'x' });
    fs.writeFileSync(logPath, JSON.stringify(seed));

    const planPath = writePlan(root, 'todo', 'cap-log');
    t.mock.method(planIndexWiring, 'getWiring', () => ({
      store: { moveUnit() { throw new Error('the 501st'); } }
    }));

    actions.movePlan(planPath, 'in-progress', root);

    const log = readJson(logPath);
    assert.equal(log.length, 500, 'the log is capped at 500');
    assert.equal(log[0].source, 'seed-1', 'the OLDEST entry is the one dropped');
    assert.equal(log[499].error, 'the 501st', 'the newest entry is kept — a cap that dropped it would hide the live fault');
  } finally {
    cleanup(root);
  }
});

test('movePlan: a plan-index LOG-WRITE fault is swallowed — the rename is never broken by its own error log', (t) => {
  const root = mkProject('ctoc-actions-holes-logwrite-');
  try {
    const planPath = writePlan(root, 'todo', 'log-write-fault');
    t.mock.method(planIndexWiring, 'getWiring', () => ({
      store: { moveUnit() { throw new Error('primary index fault'); } }
    }));
    const realWrite = safeFs.writeFileSync;
    t.mock.method(safeFs, 'writeFileSync', (p, data, opts) => {
      if (String(p).includes('plan-index-sync.json')) throw new Error('log disk full');
      return realWrite(p, data, opts);
    });

    let newPath;
    assert.doesNotThrow(() => { newPath = actions.movePlan(planPath, 'in-progress', root); },
      'a best-effort log must never escalate into a failed transition');
    assert.ok(fs.existsSync(newPath), 'the rename completed');
    assert.equal(fs.existsSync(path.join(root, '.ctoc', 'logs', 'plan-index-sync.json')), false,
      'no log was written — and that failure is not reported as a transition failure');
  } finally {
    cleanup(root);
  }
});

// ── 185-187 — a wiring LOAD fault is silent, unlike a store fault ────────────

test('movePlan: a plan-index WIRING-LOAD fault is SILENT — the rename stands and nothing is logged', (t) => {
  const root = mkProject('ctoc-actions-holes-wiring-');
  try {
    const planPath = writePlan(root, 'todo', 'wiring-fault');
    t.mock.method(planIndexWiring, 'getWiring', () => { throw new Error('wiring blew up'); });

    const newPath = actions.movePlan(planPath, 'in-progress', root);
    assert.ok(fs.existsSync(newPath), 'the rename completed');
    assert.equal(fs.existsSync(path.join(root, '.ctoc', 'logs', 'plan-index-sync.json')), false,
      'a wiring that cannot LOAD is an absent seam, not an index error — logging it would ' +
      'spam every project without the index and drown the real store faults');
  } finally {
    cleanup(root);
  }
});

// ── 202-203 — the index key survives an unavailable realpath ─────────────────

test('movePlan: the plan-index key is the canonical plans/<stage>/<slug>.md even when realpath is unavailable', (t) => {
  const root = mkProject('ctoc-actions-holes-realpath-');
  try {
    const planPath = writePlan(root, 'todo', 'realpath-fallback');
    const calls = [];
    t.mock.method(planIndexWiring, 'getWiring', () => ({
      store: { moveUnit(from, to) { calls.push([from, to]); } }
    }));

    const realNative = fs.realpathSync.native;
    t.mock.method(fs.realpathSync, 'native', (p, o) => {
      if (String(p).includes('ctoc-actions-holes-realpath-')) throw new Error('realpath unavailable');
      return realNative(p, o);
    });

    actions.movePlan(planPath, 'in-progress', root);

    assert.deepEqual(calls, [['plans/todo/realpath-fallback.md', 'plans/in-progress/realpath-fallback.md']],
      'canonicalizeRoot falls back to the given path, so the store is re-pathed with the right keys ' +
      '— a mutant that rethrew would silently drop the re-path and log an index error instead');
  } finally {
    cleanup(root);
  }
});

// ── 514-515 — the non-gate fallback stamps NOTHING ──────────────────────────

test('approvePlan: the non-gate fallback moves the plan and stamps NO approval marker and NO ledger entry', (t) => {
  const root = mkProject('ctoc-actions-holes-nongate-');
  try {
    const slug = 'non-gate-fallback';
    const planPath = writePlan(root, 'functional', slug);
    const original = fs.readFileSync(planPath, 'utf8');

    // gate-order is the ONE encoding of the gate edges; injecting there is the only
    // way a non-gate flow can exist, which is exactly what the fallback is for.
    t.mock.method(gateOrder, 'isHumanGate', () => false);

    const res = actions.approvePlan(planPath, root, { deps: PASS_VALIDATION });
    const dest = path.join(root, 'plans', 'implementation', `${slug}.md`);

    assert.equal(res.humanGate, false, 'the result reports that no human gate was crossed');
    assert.equal(res.newPath, dest, 'the plan moved');
    assert.equal(fs.readFileSync(dest, 'utf8'), original,
      'the moved plan is BYTE-IDENTICAL — a non-gate move must never stamp an approval marker');
    assert.equal(fs.existsSync(ledger.ledgerPath(slug, root)), false,
      'no approval-ledger entry is minted for a crossing that is not a human gate');
  } finally {
    cleanup(root);
  }
});

// ── 562 — a rejected deployment pipeline never un-crosses the gate ───────────

test('approvePlan: a REJECTED deployment pipeline is caught and reported — the crossing still stands', async (t) => {
  const root = mkProject('ctoc-actions-holes-deploy-');
  try {
    fs.writeFileSync(path.join(root, '.ctoc', 'settings.json'), JSON.stringify({ deployment: { enabled: true } }));
    const slug = 'deploy-reject';
    const planPath = writePlan(root, 'review', slug);
    const errors = captureErrors(t);
    t.mock.method(deployment, 'runDeploymentPipeline', () => Promise.reject(new Error('pipeline exploded')));

    const res = actions.approvePlan(planPath, root, { deps: PASS_VALIDATION, deploy: true });
    assert.ok(fs.existsSync(res.newPath), 'the plan crossed to done');
    assert.match(res.newPath, /done/, 'the crossing completed before the pipeline was awaited');

    // The rejection is handled on a later microtask; the crossing is already committed.
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(errors.some((l) => l.includes('Deployment pipeline failed:') && l.includes('pipeline exploded')),
      'the rejection is REPORTED, never left as an unhandled rejection that would kill the process');
  } finally {
    cleanup(root);
  }
});

// ── 596-598 — a transition-log fault never un-crosses the gate ───────────────

test('approvePlan: a transition-LOG fault is reported and the crossing still stands', (t) => {
  const root = mkProject('ctoc-actions-holes-translog-');
  try {
    const slug = 'translog-fault';
    const planPath = writePlan(root, 'functional', slug);
    const errors = captureErrors(t);
    const realAppend = safeFs.appendFileSync;
    t.mock.method(safeFs, 'appendFileSync', (p, data, opts) => {
      if (String(p).includes('transitions.json')) throw new Error('audit log unwritable');
      return realAppend(p, data, opts);
    });

    const res = actions.approvePlan(planPath, root, { deps: PASS_VALIDATION });
    assert.ok(fs.existsSync(path.join(root, 'plans', 'implementation', `${slug}.md`)),
      'the plan crossed — an unwritable audit log must not revoke a human approval');
    assert.equal(res.humanGate, true);
    assert.ok(errors.some((l) => l.includes('Transition logging failed:') && l.includes('audit log unwritable')),
      'the logging failure is surfaced rather than silently dropped');
  } finally {
    cleanup(root);
  }
});

// ── 762-763 / 777-778 — the refinement gate ─────────────────────────────────

test('applyIronLoop: an INLINE comma-separated files: declaration is split into globs the refinement gate matches', () => {
  const root = mkProject('ctoc-actions-holes-refine-');
  try {
    const slug = 'inline-files';
    // A scalar `files:` value (one line, comma-separated) parses as a STRING, not an
    // array. A risk-surface path in it must still reach shouldRunLoop as a glob.
    const planPath = writePlan(root, 'todo', slug, 'effort: medium\nfiles: src/auth/login.js, src/plain.js\n');

    actions.applyIronLoop(planPath);

    const decision = readJson(path.join(root, '.ctoc', 'state', 'refinement', `${slug}.json`));
    assert.equal(decision.run, true,
      'the string form is split — a mutant that only handled arrays would see no files and answer run:false');
    assert.equal(decision.reason, 'risk-surface', 'the trigger is the file list, not the effort tier');
    assert.equal(decision.file, 'src/auth/login.js', 'the matching glob names the split token, trimmed');
  } finally {
    cleanup(root);
  }
});

test('applyIronLoop: a refinement-gate WRITE fault is fail-open — the plan still gets its Iron Loop section', (t) => {
  const root = mkProject('ctoc-actions-holes-refinefail-');
  try {
    const slug = 'refine-write-fault';
    const planPath = writePlan(root, 'todo', slug, 'effort: medium\nfiles: src/plain.js\n');
    const errors = captureErrors(t);
    const realWrite = safeFs.writeFileSync;
    const refinementDir = path.join('state', 'refinement');
    t.mock.method(safeFs, 'writeFileSync', (p, data, opts) => {
      if (String(p).includes(refinementDir)) throw new Error('refinement state unwritable');
      return realWrite(p, data, opts);
    });

    assert.doesNotThrow(() => actions.applyIronLoop(planPath),
      'an advisory gate must never block a plan entering the queue');

    const content = fs.readFileSync(planPath, 'utf8');
    assert.ok(content.includes('## Execution Plan (Steps 8-16)'),
      'the real Iron Loop section was written — the advisory failure did not trigger the basic-template fallback');
    assert.equal(errors.some((l) => l.includes('Iron Loop refinement failed')), false,
      'the fault was contained inside the refinement gate, never escalated to applyIronLoop\'s own catch');
    assert.equal(fs.existsSync(path.join(root, '.ctoc', 'state', 'refinement', `${slug}.json`)), false,
      'no verdict is fabricated for a write that failed');
  } finally {
    cleanup(root);
  }
});

// ── 1069-1073 — a verify run that throws produces NO evidence ────────────────

test('completeExecution: a VERIFY run that THROWS yields verify:null and NO evidence artifact', (t) => {
  const root = mkProject('ctoc-actions-holes-verifythrow-');
  const restore = patchLoad('../src/lib/step-13-verify', {
    persistVerifyResult() { throw new Error('verify runner exploded'); }
  });
  try {
    const slug = 'verify-throws';
    const planPath = writePlan(root, 'in-progress', slug, 'files:\n  - "src/vt.js"\n');
    const errors = captureErrors(t);

    const res = actions.completeExecution(planPath, root, { force: true });

    assert.equal(res.blocked, false, 'the forced completion moved the plan');
    assert.ok(fs.existsSync(path.join(root, 'plans', 'review', `${slug}.md`)), 'the plan reached review');
    assert.equal(res.verify, null,
      'a verify that could not RUN reports nothing — never a fabricated pass');
    assert.equal(fs.existsSync(path.join(root, '.ctoc', 'state', 'verify', `${slug}.json`)), false,
      'no evidence artifact exists, so the review gate fails closed on ABSENCE');
    assert.ok(errors.some((l) => l.includes('Step 14 VERIFY failed to run') && l.includes(slug)),
      'the run failure is surfaced loudly, never swallowed');
  } finally {
    restore();
    cleanup(root);
  }
});

// ── 1138-1139 — a registry coupling fault never un-does the move ─────────────

test('completeExecution: a task-registry coupling fault is reported and the plan STAYS in review', (t) => {
  const root = mkProject('ctoc-actions-holes-coupling-');
  const restore = patchLoad('../src/lib/step-13-verify', {
    persistVerifyResult: () => ({ passed: true, summary: 'stubbed boundary' })
  });
  try {
    const slug = 'coupling-fault';
    const planPath = writePlan(root, 'in-progress', slug, 'files:\n  - "src/cf.js"\n');
    const errors = captureErrors(t);
    t.mock.method(taskRegistry, 'withRegistry', () => { throw new Error('registry is corrupt'); });

    const res = actions.completeExecution(planPath, root, { force: true });

    assert.ok(fs.existsSync(path.join(root, 'plans', 'review', `${slug}.md`)),
      'the plan has ALREADY moved — a registry fault must never appear to undo it');
    assert.match(res.newPath, /review/);
    assert.ok(errors.some((l) => l.includes('Task/plan coupling failed for') && l.includes('registry is corrupt')),
      'the coupling failure is named, so an orphaned task slot is traceable to this plan');
  } finally {
    restore();
    cleanup(root);
  }
});

// ── 1469-1470 — the default failing step is 14 ──────────────────────────────

test('completeExecution: a validation failure with EVERY step complete is kicked back to step 14, the default', () => {
  const root = mkProject('ctoc-actions-holes-step14-');
  try {
    const slug = 'default-step';
    const steps = [
      [8, 'TEST'], [9, 'PREPARE'], [10, 'IMPLEMENT'], [11, 'REVIEW'], [12, 'OPTIMIZE'],
      [13, 'SECURE'], [14, 'VERIFY'], [15, 'DOCUMENT'], [16, 'FINAL-REVIEW']
    ];
    let body = 'Descriptive prose about the approach.\n\n## Execution Plan\n\n';
    for (const [n, name] of steps) body += `### Step ${n}: ${name}\n- [x] ${name.toLowerCase()} work performed\n\n`;
    // Every STEP is complete; the failure is elsewhere, so failingStepFrom has no
    // concrete step to key on and must fall back to the VERIFY step.
    body += '## Acceptance Criteria\n\n- [ ] this criterion is deliberately unmet\n';
    const planPath = writePlan(root, 'in-progress', slug, '', body);

    const res = actions.completeExecution(planPath, root);

    assert.equal(res.blocked, true, 'the completion is refused');
    assert.equal(res.kickback.recorded, true, 'the refusal is counted by the circuit breaker');
    const counts = circuitBreaker.readKickbackCounts(planPath, root);
    assert.deepEqual(counts.by_step, { 14: 1 },
      'the kickback is keyed on step 14 — the default when no step is itself incomplete');
  } finally {
    cleanup(root);
  }
});

// ── 1508-1509 — a doubly-broken breaker still reports ───────────────────────

test('recordStepKickback: when the breaker AND its own failure log both throw, it REPORTS instead of throwing', (t) => {
  const root = mkProject('ctoc-actions-holes-breaker-');
  try {
    const planPath = writePlan(root, 'in-progress', 'breaker-double-fault');
    const errors = captureErrors(t);
    t.mock.method(circuitBreaker, 'recordKickback', () => { throw new Error('counter frozen'); });
    t.mock.method(circuitBreaker, 'recordBreakerFailure', () => { throw new Error('escalation log unwritable'); });

    let res;
    assert.doesNotThrow(() => { res = actions.recordStepKickback(planPath, 14, root); },
      'a broken safety mechanism must not crash the pipeline it is protecting');
    assert.deepEqual(res, { recorded: false, error: 'counter frozen' },
      'the report says plainly that nothing was recorded, and why');
    assert.ok(errors.some((l) => l.includes('CIRCUIT BREAKER FAILURE') && l.includes('counter frozen')),
      'the primary failure is loud — an overnight loop cannot hide behind a frozen counter');
    assert.ok(errors.some((l) => l.includes('Failed to persist the breaker-failure escalation') && l.includes('escalation log unwritable')),
      'the SECOND failure is loud too — otherwise the durable escalation is silently lost');
  } finally {
    cleanup(root);
  }
});

// ── 1566-1567 / 1587-1588 — the deploy-ready notice ─────────────────────────

test('approvePlan(review→done) without the deploy stamp: a CORRUPT deploy-ready log is reset, not appended to', () => {
  const root = mkProject('ctoc-actions-holes-deployready-');
  try {
    fs.writeFileSync(path.join(root, '.ctoc', 'settings.json'), JSON.stringify({ deployment: { enabled: true } }));
    const logFile = path.join(root, '.ctoc', 'logs', 'deploy-ready.json');
    fs.writeFileSync(logFile, 'not json at all');
    const slug = 'deploy-ready-corrupt';
    const planPath = writePlan(root, 'review', slug);

    actions.approvePlan(planPath, root, { deps: PASS_VALIDATION });

    const log = readJson(logFile);
    assert.equal(log.length, 1, 'the unparseable log is discarded so the new notice is not lost behind it');
    assert.equal(log[0].plan, `${slug}.md`, 'the notice names the plan awaiting the separate ship decision');
    assert.equal(log[0].status, 'deploy-ready');
  } finally {
    cleanup(root);
  }
});

test('approvePlan(review→done): a deploy-ready NOTICE write fault is reported and the crossing still stands', (t) => {
  const root = mkProject('ctoc-actions-holes-noticefault-');
  try {
    fs.writeFileSync(path.join(root, '.ctoc', 'settings.json'), JSON.stringify({ deployment: { enabled: true } }));
    const slug = 'deploy-notice-fault';
    const planPath = writePlan(root, 'review', slug);
    const errors = captureErrors(t);
    const realRename = safeFs.renameSync;
    t.mock.method(safeFs, 'renameSync', (from, to) => {
      if (String(to).includes('deploy-ready.json')) throw new Error('notice commit failed');
      return realRename(from, to);
    });

    const res = actions.approvePlan(planPath, root, { deps: PASS_VALIDATION });

    assert.ok(fs.existsSync(path.join(root, 'plans', 'done', `${slug}.md`)),
      'the plan crossed — a notice the human never sees must not revoke their approval');
    assert.equal(res.humanGate, true);
    assert.ok(errors.some((l) => l.includes('Deploy-ready notice failed:') && l.includes('notice commit failed')),
      'the lost notice is REPORTED, so a silently missing ship-gate signal is traceable');
  } finally {
    cleanup(root);
  }
});

// ── 1612-1613 — an unreadable frontmatter region declares NO files ───────────

test('taskSpecFromPlan: an unreadable frontmatter region yields NO declared files — the plan is refused, never enqueued unguarded', (t) => {
  const root = mkProject('ctoc-actions-holes-declared-');
  try {
    const slug = 'declared-fault';
    const planPath = writePlan(root, 'todo', slug, 'files:\n  - "src/real.js"\n');
    const plan = { name: slug, path: planPath, content: fs.readFileSync(planPath, 'utf8') };

    // Control: with the reader working, the declaration IS read.
    assert.deepEqual(actions.taskSpecFromPlan(plan, root).touches.includes('src/real.js'), true,
      'control — the declared file is normally found');

    t.mock.method(staleDetector, 'extractFrontmatterRegion', () => { throw new Error('frontmatter reader broke'); });

    assert.throws(
      () => actions.taskSpecFromPlan(plan, root),
      /declares no files:/,
      'a reader fault must REFUSE the task — a scheduler cannot serialize file conflicts it could not read'
    );
  } finally {
    cleanup(root);
  }
});

// ── 1712-1713 — a malformed plan object is refused before any I/O ────────────

test('taskSpecFromPlan: a malformed plan object is a TypeError raised before any filesystem access', () => {
  const root = mkProject('ctoc-actions-holes-typeerror-');
  try {
    for (const bad of [null, undefined, {}, { name: 'x' }, { path: '/tmp/x.md' }, { name: 5, path: '/tmp/x.md' }]) {
      assert.throws(
        () => actions.taskSpecFromPlan(bad, root),
        TypeError,
        `a plan object without a string name AND path is refused: ${JSON.stringify(bad)}`
      );
    }
    assert.throws(() => actions.taskSpecFromPlan({}, root), /requires a plan object with name and path/);
  } finally {
    cleanup(root);
  }
});

// ── 2391-2394 / 2446-2448 — the batched sibling gate ────────────────────────

test('approveSubplans: a dependency CYCLE among siblings still emits every one of them', () => {
  const root = mkProject('ctoc-actions-holes-cycle-');
  try {
    writePlan(root, 'implementation', 'cyc-a', 'parent_plan: cyc-parent\ndepends_on: cyc-b\nfiles:\n  - "src/a.js"\n');
    writePlan(root, 'implementation', 'cyc-b', 'parent_plan: cyc-parent\ndepends_on: cyc-a\nfiles:\n  - "src/b.js"\n');

    const res = actions.approveSubplans('cyc-parent', 'implementation', root);

    const visited = [...res.approved, ...res.skipped.map((s) => s.slug)].sort();
    assert.deepEqual(visited, ['cyc-a', 'cyc-b'],
      'a cycle leaves both nodes with a non-zero indegree, so without the fallback the batch would be EMPTY ' +
      'and two approved plans would silently never cross');
  } finally {
    cleanup(root);
  }
});

test('approveSubplans: a sibling whose crossing THROWS is skipped with its reason and the batch continues', () => {
  const root = mkProject('ctoc-actions-holes-batchthrow-');
  try {
    writePlan(root, 'implementation', 'batch-bad', 'parent_plan: batch-parent\nfiles:\n  - "src/bad.js"\n');
    writePlan(root, 'implementation', 'batch-good', 'parent_plan: batch-parent\nfiles:\n  - "src/good.js"\n');
    // A DIFFERENT plan already resident at the destination under the same basename:
    // movePlan refuses to overwrite it, so this sibling's crossing THROWS.
    fs.writeFileSync(path.join(root, 'plans', 'todo', 'batch-bad.md'),
      '---\ntitle: "an unrelated resident"\ntype: implementation\n---\n\n# resident\n\nbody\n');

    const res = actions.approveSubplans('batch-parent', 'implementation', root);

    assert.deepEqual(res.approved, ['batch-good'], 'the healthy sibling still crossed');
    assert.equal(res.skipped.length, 1, 'exactly one sibling was skipped');
    assert.equal(res.skipped[0].slug, 'batch-bad');
    assert.match(res.skipped[0].reason, /Refusing to overwrite existing plan/,
      'the skip carries the REAL reason — a silent skip would strand an approved plan with no explanation');
    assert.ok(fs.existsSync(path.join(root, 'plans', 'implementation', 'batch-bad.md')),
      'the refused sibling is left in place, unharmed');
  } finally {
    cleanup(root);
  }
});

// ── tripwire ────────────────────────────────────────────────────────────────

test('TRIPWIRE: this repository\'s plans, approval ledger and verify evidence are byte-identical after this suite', () => {
  assert.equal(digestTree(path.join(REPO, 'plans')), REPO_BEFORE.plans,
    'no test in this file may move, create or edit a real plan');
  assert.equal(digestTree(path.join(REPO, '.ctoc', 'approvals')), REPO_BEFORE.approvals,
    'no test in this file may mint or alter a real approval');
  assert.equal(digestTree(path.join(REPO, '.ctoc', 'state', 'verify')), REPO_BEFORE.verify,
    'no test in this file may write real verify evidence');
});
