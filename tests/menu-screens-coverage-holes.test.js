'use strict';

/**
 * The dark ranges of `src/lib/menu-screens.js` — the screens the human actually reads.
 *
 * Measured by the gate on 2026-09-01 (`npm test`, line coverage scoped to `src/**`):
 * menu-screens.js at 99.19 %, uncovered 189-195 · 1050-1051 · 1140-1141 · 1310-1312 ·
 * 1439-1441 · 2308-2312. Every range below is classified, and each classification says
 * WHY. Line numbers move with every commit; the range is named by its behaviour too.
 *
 * COVERED HERE (reachable behaviour, driven through the public surface — the router and
 * `buildDashboardTable`, never by calling the function under test through a stub):
 *
 *   189-195  the catch inside the working-directory disclosure line. The documented
 *            contract is SILENCE: the working directory could not be read (a deleted
 *            working directory), so the line is omitted, because the absence of a claim
 *            is the only honest output when the comparison could not be made. Two
 *            mutations die here: a fabricated "Working in …" line, and letting the throw
 *            escape and blank the whole dashboard. Paired with a positive control that
 *            renders the real line from the same fixture, so the silence is a contrast
 *            and not a vacuous absence.
 *
 *   1050-1051 the fail-open catch in the escalations door. When the escalation lister
 *            throws, the door still OPENS: zero escalations, and the deploy-ready half
 *            of the same screen still renders its rows. Paired with a control that
 *            seeds a real escalation file and shows the row the fault suppresses.
 *
 *   1140-1141 the "… and N more" line of the approval-ledger migration door, past the
 *            twenty-row display cap. Seeded through the real writer
 *            (`gateMigration.writePendingNotice`), never by hand-writing the JSON, so
 *            the case renders the shape production writes.
 *
 * LEFT UNCOVERED, and why — none of these is permission-gated; all three are
 * UNREACHABLE, and a dead range is reported, never deleted (plan Decision 3):
 *
 *   1310-1312 `truncated++` in the verified-proposals screen. The fan-out cap is applied
 *            TWICE with the same constant: `toVerify = candidates.slice(0, MAX_ROWS)`
 *            and then `if (rows >= MAX_ROWS)` over exactly those proposals. With at most
 *            MAX_ROWS proposals, `rows` never reaches MAX_ROWS while an item remains, so
 *            the branch cannot fire. The source says as much itself ("With the pre-verify
 *            slice, truncated is normally 0"); the honest word is "always". The "… and N
 *            more" line the human reads is driven by `overflow`, which IS covered.
 *
 *   1439-1441 the same shape in the clean-up screen: `_buildCleanupItems` slices
 *            candidates to CLEANUP_MAX_ROWS before classifying, and the render loop then
 *            re-checks `rows >= CLEANUP_MAX_ROWS` over that already-capped list, filtered
 *            down further to the actionable categories. Unreachable for the same reason.
 *
 *   2308-2312 the `return undefined` tail of the task-registry mutator. `taskTransition`
 *            is not exported, and its only caller — `taskCommand` — routes exactly
 *            `start` and `fail` into the mutator (`cancel` is delegated before it). No
 *            input reaches the tail. The comment above it already states this.
 *
 * The three unreachable ranges are RECORDED here and left dark; no case asserts source
 * text to "cover" them, because a text match is not evidence about reachability.
 *
 * Fixtures live under `os.tmpdir()` and are removed in `afterEach`. No shell, no network,
 * no secret. Nothing asserts an absolute path or a raw filesystem error as screen text.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ms = require('../src/lib/menu-screens');
const inbox = require('../src/lib/inbox');
const gateMigration = require('../src/lib/gate-migration');
const { invalidate } = require('../src/lib/cache');

let root;

/** Count bullet rows in a rendered screen body. */
function bulletRows(text) {
  return text.split('\n').filter((l) => l.trimStart().startsWith('•')).length;
}

beforeEach(() => {
  // realpathSync: on macOS os.tmpdir() is a symlink (/var → /private/var), and the
  // disclosure line compares the resolved root against the resolved working directory.
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-menu-holes-')));
  fs.mkdirSync(path.join(root, '.ctoc', 'logs'), { recursive: true });
  for (const s of ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done']) {
    fs.mkdirSync(path.join(root, 'plans', s), { recursive: true });
  }
  invalidate('getInboxCounts');
});

afterEach(() => {
  invalidate('getInboxCounts');
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 189-195 — the working-directory disclosure line
// ═══════════════════════════════════════════════════════════════════════════════

describe('the dashboard header when the working directory cannot be read', () => {
  it('renders the disclosure line when the human is standing below the project root (control)', () => {
    const deeper = path.join(root, 'service', 'api');
    fs.mkdirSync(deeper, { recursive: true });
    const back = process.cwd();
    let out;
    try {
      process.chdir(deeper);
      out = ms.buildDashboardTable(root);
    } finally {
      process.chdir(back);
    }
    assert.match(
      out,
      /Working in \.\.[/\\]\.\. {2}— {2}opened from this directory's parent project/,
      'the header discloses that the project root is above the directory the human is standing in'
    );
  });

  it('stays silent when the working directory cannot be read — silence is the absence of a claim, not a claim', () => {
    const deeper = path.join(root, 'service', 'api');
    fs.mkdirSync(deeper, { recursive: true });
    const back = process.cwd();
    const realCwd = process.cwd;
    let out;
    try {
      process.chdir(deeper);
      // The true boundary: the working directory itself is unreadable (a deleted
      // working directory). Restored in the same `finally`.
      process.cwd = () => { throw new Error('ENOENT: no such file or directory, uv_cwd'); };
      out = ms.buildDashboardTable(root);
    } finally {
      process.cwd = realCwd;
      process.chdir(back);
    }
    assert.ok(
      !out.includes('Working in'),
      'no working-directory claim is made when the comparison could not be made'
    );
    assert.ok(
      !/opened from this directory/.test(out),
      'no half of the disclosure sentence leaks when the read failed'
    );
  });

  it('still renders the whole dashboard when that line is absent', () => {
    const realCwd = process.cwd;
    let out;
    try {
      process.cwd = () => { throw new Error('ENOENT: no such file or directory, uv_cwd'); };
      out = ms.buildDashboardTable(root);
    } finally {
      process.cwd = realCwd;
    }
    assert.match(out, /^CTOC v\d+\.\d+\.\d+\n/, 'the version line still opens the dashboard');
    assert.match(out, /Business \(0\)/, 'the Business section still renders');
    assert.match(out, /Implementation \(0\)/, 'the Implementation section still renders');
    assert.match(out, /Execution \(0\)/, 'the Execution section still renders');
    assert.ok(out.includes('Todo'), 'the per-stage rows still render');
    assert.ok(!out.includes(os.tmpdir()), 'the header never pastes an absolute path');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1050-1051 — the escalations door stays open when its lister throws
// ═══════════════════════════════════════════════════════════════════════════════

/** Seed one real circuit-breaker escalation through the file the breaker writes. */
function seedEscalation() {
  fs.writeFileSync(
    path.join(root, '.ctoc', 'logs', 'escalations.json'),
    JSON.stringify([{
      plan: 'a-plan-that-keeps-failing',
      type: 'same-step',
      step: '14',
      count: 4,
      at: new Date().toISOString(),
    }], null, 2) + '\n'
  );
}

/** Seed one deploy-ready notice — the other half of the same screen. */
function seedDeployReady() {
  fs.writeFileSync(
    path.join(root, '.ctoc', 'logs', 'deploy-ready.json'),
    JSON.stringify([{ plan: 'a-plan-you-called-finished', at: new Date().toISOString() }], null, 2) + '\n'
  );
}

describe('the escalations door when the escalation lister throws', () => {
  it('names the failing plan when the lister works (control)', () => {
    seedEscalation();
    seedDeployReady();
    const screen = ms.route(['inbox', 'escalations'], root);
    assert.match(screen.text, /Escalations & deploy-ready \(2\)/, 'the door counts both streams');
    assert.ok(
      screen.text.includes('a plan keeps failing and needs you'),
      'the human is told what an escalation means'
    );
    assert.ok(screen.text.includes('a-plan-that-keeps-failing'), 'the failing plan is named');
    assert.ok(screen.text.includes('Step 14 kicked back 4× (max 3)'), 'the escalation detail is rendered');
  });

  it('still opens, with the deploy-ready half intact, when the lister throws', (t) => {
    seedEscalation();
    seedDeployReady();
    t.mock.method(inbox, 'listEscalations', () => {
      throw new Error('injected: the escalation store could not be listed');
    });

    const screen = ms.route(['inbox', 'escalations'], root);

    assert.ok(!screen.text.includes('a-plan-that-keeps-failing'), 'the unreadable stream contributes nothing');
    assert.ok(
      screen.text.includes('No circuit-breaker escalations.'),
      'the escalation half degrades to zero rather than crashing the door'
    );
    assert.match(screen.text, /Escalations & deploy-ready \(1\)/, 'the count reflects only the readable stream');
    assert.ok(screen.text.includes('a-plan-you-called-finished'), 'the deploy-ready half still renders its row');
    assert.ok(
      screen.text.includes('Deploying them is a separate decision, and it is still yours.'),
      'the deploy-ready sentence the human reads survives the fault'
    );
    assert.deepEqual(Object.keys(screen.actions), ['◀ Back'], 'the door is still navigable');
    assert.ok(!screen.text.includes('injected'), 'no raw error text reaches the screen');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1140-1141 — the migration door past its twenty-row display cap
// ═══════════════════════════════════════════════════════════════════════════════

describe('the approval-ledger migration door past its display cap', () => {
  /** Write the notice through the real writer, with `n` withheld violations. */
  function seedPending(n) {
    const withheld = Array.from({ length: n }, (_, i) => ({
      file: `plans/done/${String(i).padStart(5, '0')}-an-older-plan.md`,
      folder: 'done',
      reason: 'no-ledger-entry',
    }));
    assert.equal(gateMigration.writePendingNotice(root, withheld), true, 'the notice was written');
  }

  it('lists every plan when the pending set fits (control)', () => {
    seedPending(3);
    const screen = ms.route(['inbox', 'migration'], root);
    assert.match(screen.text, /Approval-ledger migration \(3\)/);
    assert.equal(bulletRows(screen.text), 3, 'one row per pending plan');
    assert.ok(!screen.text.includes('… and'), 'nothing is elided when everything fits');
  });

  it('caps the list at twenty rows and says how many more there are', () => {
    seedPending(23);
    const screen = ms.route(['inbox', 'migration'], root);

    assert.match(screen.text, /Approval-ledger migration \(23\)/, 'the header states the true total');
    assert.equal(bulletRows(screen.text), 20, 'exactly twenty rows are shown');
    assert.ok(screen.text.includes('… and 3 more'), 'the surplus is named, not silently dropped');
    assert.ok(
      screen.text.includes('CTOC is NOT moving them'),
      'the human is still told that nothing is being reverted'
    );
    assert.ok(
      screen.text.includes(gateMigration.MIGRATION_COMMAND),
      'the way forward is still printed below the elision'
    );
    assert.ok(!screen.text.includes(os.tmpdir()), 'no absolute path reaches the screen');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// The three unreachable ranges — asserted as unreachable, never deleted
// ═══════════════════════════════════════════════════════════════════════════════

describe('the unknown task subcommand is refused at the dispatcher', () => {
  // The mutator's `return undefined` tail (2308-2312) is unreachable because
  // `taskTransition` is unexported and `taskCommand` routes only `start` and `fail`
  // into it. This is the behaviour that keeps it unreachable: anything else is refused
  // one level above, so no input ever arrives at the tail.
  it('refuses a subcommand it does not know, naming what was asked for', () => {
    const res = ms.taskCommand(['transmogrify'], root);
    assert.equal(res.ok, false, 'an unknown subcommand is a caller error, not a crash');
    assert.equal(res.error, 'unknown task subcommand');
    assert.ok(res.text.includes('transmogrify'), 'the refusal names what was asked for');
  });

  it('refuses a missing subcommand without naming a phantom one', () => {
    const res = ms.taskCommand([], root);
    assert.equal(res.ok, false);
    assert.equal(res.error, 'unknown task subcommand');
    assert.equal(res.text, 'Unknown task subcommand: ', 'nothing is invented in place of the missing word');
  });
});
