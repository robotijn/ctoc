'use strict';

/**
 * actions-atomicity — the two single-source-of-truth writes in stampAndLedger must
 * be crash-atomic (temp sibling + rename), never a bare in-place writeFileSync.
 *
 * Two confirmed MEDIUM atomicity defects (both inside the gate-approval commit path):
 *   - The DESTINATION PLAN write: after `movePlan` renames source → dest, the MARKED
 *     bytes are written over the just-renamed plan. A bare in-place writeFileSync
 *     truncates the plan (whose only prior copy was the now-renamed source) if a crash
 *     lands between open(O_TRUNC) and the full write.
 *   - The OVERRIDE ADDENDUM write: the "Approve anyway" path re-opens the COMMITTED
 *     approval-ledger entry and rewrites it with the override provenance. A bare
 *     in-place writeFileSync truncates the ledger entry → readEntry JSON.parse fails →
 *     verify() false → the residency sweep reverts the freshly-approved plan as a forgery.
 *
 * The reference-correct writer is temp+rename (approval-ledger.persistEntry,
 * task-registry.save): write a sibling temp, then rename over the target; on any error
 * unlink the temp and rethrow. Rename is the atomic commit — a reader sees either the
 * whole old file or the whole new file, never a truncation.
 *
 * This test proves the MECHANISM (exactly as approval-ledger-atomicity does): it records
 * every direct writeFileSync target and asserts that neither the committed ledger entry
 * nor the destination plan is EVER the direct target of a bare in-place writeFileSync —
 * they are only ever committed via a temp sibling + rename. Against the bare-write code
 * both files ARE direct writeFileSync targets → RED. Real temp plan trees under
 * os.tmpdir(), the real exported approvePlan + real approval-ledger; the only seam is a
 * pass-through writeFileSync recorder, restored in finally.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { approvePlan } = require('../src/lib/actions');
const ledger = require('../src/lib/approval-ledger');
const safeFs = require('../src/lib/safe-fs');

const STAGES = ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
const sandboxes = [];

function mkSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'actions-atom-'));
  for (const stage of STAGES) {
    fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
  }
  sandboxes.push(root);
  return root;
}

test.after(() => {
  while (sandboxes.length) {
    try { fs.rmSync(sandboxes.pop(), { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

test('[atomicity] approvePlan commits the destination plan AND the override ledger addendum via temp+rename — never a bare in-place write', () => {
  const root = mkSandbox();
  const slug = 'actions-atom-override';
  const planPath = path.join(root, 'plans', 'review', slug + '.md');
  fs.writeFileSync(planPath, '---\ntitle: "Atom"\ntype: feature\n---\n\n# Atom\n\nBody.\n');

  const donePath = path.join(root, 'plans', 'done', slug + '.md');
  const entryPath = ledger.ledgerPath(slug, root);

  // Record every DIRECT writeFileSync target (the shared safeFs module instance is used
  // by both actions.js and approval-ledger.js — one stub sees both). Pass-through.
  const directWrites = [];
  const origWrite = safeFs.writeFileSync;
  safeFs.writeFileSync = (p, data, opts) => {
    directWrites.push(p);
    return origWrite(p, data, opts);
  };

  let res;
  try {
    // review → done requires on-disk VERIFY evidence; the subject here is the atomic
    // commit, not the validation gate, so cross via an explicit audited override — which
    // ALSO exercises the override-addendum re-write (the second defect).
    res = approvePlan(planPath, root, { override: { reason: 'atomicity — mechanism under test' } });
  } finally {
    safeFs.writeFileSync = origWrite;
  }

  // The crossing actually committed (so the writes we assert about really happened).
  assert.ok(fs.existsSync(donePath), 'plan committed to done/');
  assert.ok(!fs.existsSync(planPath), 'plan left review/');
  assert.strictEqual(res.newPath, donePath, 'return shape preserved: newPath is the done/ destination');
  const entry = ledger.readEntry(slug, root);
  assert.ok(entry, 'ledger entry present');
  assert.strictEqual(entry.override, true, 'override provenance addendum was committed');

  // ── The atomicity guarantee: the committed files were NEVER bare-overwritten ──
  assert.ok(
    !directWrites.includes(donePath),
    'the destination plan must be committed via temp+rename, never a bare in-place writeFileSync',
  );
  assert.ok(
    !directWrites.includes(entryPath),
    'the committed ledger entry must be re-written via temp+rename, never a bare in-place writeFileSync',
  );

  // ── And the mechanism actually used was a temp sibling of each committed file ──
  assert.ok(
    directWrites.some((p) => typeof p === 'string' && p.startsWith(donePath + '.tmp')),
    'a temp sibling of the destination plan must be written (proves temp+rename)',
  );
  assert.ok(
    directWrites.some((p) => typeof p === 'string' && p.startsWith(entryPath + '.tmp')),
    'a temp sibling of the ledger entry must be written (proves temp+rename)',
  );
});
