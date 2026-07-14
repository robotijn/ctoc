'use strict';

/**
 * W02-s5 — Atomic stamp-then-move + merged-frontmatter parse (findings M18, M19).
 *
 * BEHAVIOR-first, ZERO test doubles for the code under test: real temp plan trees
 * under `os.tmpdir()`, the real exported `approvePlan` / `parseMetadata`, and the
 * real `approval-ledger` reads. The only injected seam is a single throwing
 * `writeEntry` in the crash-injection case — the documented `deps` seam whose
 * whole purpose is to force step 3 to fail so the rollback is observable.
 *
 * Two coupled defects are covered:
 *   - M19: a PREPENDED approval-marker block must not drop the plan's own
 *     frontmatter fields — `parseMetadata` must return the UNION of both blocks.
 *   - M18: `approvePlan` must stamp the marker atomically at the DESTINATION and
 *     commit approval to the ledger, rolling back so a crash never leaves a
 *     false-approved plan resident in the SOURCE folder (the forbidden state).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { parseMetadata } = require('../src/lib/state');
const { approvePlan } = require('../src/lib/actions');
const ledger = require('../src/lib/approval-ledger');

// ── Sandbox harness ──────────────────────────────────────────────────────────

const STAGES = ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
const sandboxes = [];

function mkSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w02-s5-'));
  for (const stage of STAGES) {
    fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
  }
  sandboxes.push(root);
  return root;
}

test.after(() => {
  while (sandboxes.length) {
    fs.rmSync(sandboxes.pop(), { recursive: true, force: true });
  }
});

// ── [M19] merged parse returns the UNION of marker + own frontmatter ──────────

test('[M19] parseMetadata merges a prepended marker block with the plan\'s own frontmatter (no field dropped)', () => {
  const marker = [
    '---',
    'approved_by: human',
    'approved_at: 2026-07-13T00:00:00Z',
    'gate_crossed: review → done',
    '---',
  ].join('\n');

  const own = [
    '---',
    'title: "Union plan"',
    'type: feature',
    'status: ready',
    'priority: HIGH',
    'parent_vision: "vision/x.md"',
    'depends_on: ctoc-audit-w02-s1-approval-ledger',
    '---',
    '',
    '# Union plan',
    '',
    'Body text.',
    '',
  ].join('\n');

  const content = marker + '\n\n' + own;
  const meta = parseMetadata(content);

  // Marker-block fields survive.
  assert.strictEqual(meta.approved_by, 'human', 'marker approved_by preserved');
  assert.strictEqual(meta.approved_at, '2026-07-13T00:00:00Z', 'marker approved_at preserved');
  assert.strictEqual(meta.gate_crossed, 'review → done', 'marker gate_crossed preserved');

  // The plan's OWN fields must NOT be dropped (this is the M19 fix — fails today).
  assert.strictEqual(meta.title, 'Union plan', 'title survives the prepend');
  assert.strictEqual(meta.type, 'feature', 'type survives the prepend');
  assert.strictEqual(meta.status, 'ready', 'status survives the prepend');
  assert.strictEqual(meta.priority, 'HIGH', 'priority survives the prepend');
  assert.strictEqual(meta.parent_vision, 'vision/x.md', 'parent_vision survives the prepend');
  assert.strictEqual(
    meta.depends_on,
    'ctoc-audit-w02-s1-approval-ledger',
    'depends_on survives the prepend'
  );
});

// ── [M19] single-block plan parses exactly as before (regression guard) ───────

test('[M19] parseMetadata is behavior-identical for a single-block plan (regression guard)', () => {
  const single = [
    '---',
    'title: "Single"',
    'type: feature',
    'priority: LOW',
    'iron_loop: true',
    'revision: 2',
    '---',
    '',
    '# Single',
    '',
    'Body.',
    '',
  ].join('\n');

  const meta = parseMetadata(single);
  assert.strictEqual(meta.title, 'Single');
  assert.strictEqual(meta.type, 'feature');
  assert.strictEqual(meta.priority, 'LOW');
  assert.strictEqual(meta.iron_loop, true, 'boolean coercion preserved');
  assert.strictEqual(meta.revision, 2, 'integer coercion preserved');
  assert.ok(!('approved_by' in meta), 'no marker field invented for an un-stamped plan');

  // CRLF twin must parse byte-identically (H1 CRLF-safety is preserved by the merge).
  const crlf = parseMetadata(single.replace(/\n/g, '\r\n'));
  assert.deepStrictEqual(crlf, meta, 'CRLF twin equals LF twin');
});

// ── [M18] happy path — atomic stamp at destination + ledger commit ────────────

test('[M18] approvePlan review→done stamps at destination and commits a verifiable ledger entry', () => {
  const root = mkSandbox();
  const slug = 'w02-s5-happy';
  const planPath = path.join(root, 'plans', 'review', slug + '.md');
  const body = '---\ntitle: "Happy"\ntype: feature\n---\n\n# Happy\n\nBody.\n';
  fs.writeFileSync(planPath, body);

  // R5-B: approvePlan now VALIDATES review→done (which requires on-disk VERIFY
  // evidence). This test's subject is the ATOMIC STAMP + ledger commit, not the
  // validation gate, so it crosses via an explicit, audited override.
  const res = approvePlan(planPath, root, { override: { reason: 'M18 atomic-stamp — validation not under test' } });

  // Resident in the destination, gone from the source.
  const donePath = path.join(root, 'plans', 'done', slug + '.md');
  assert.ok(!fs.existsSync(planPath), 'plan left review/');
  assert.ok(fs.existsSync(donePath), 'plan landed in done/');
  assert.strictEqual(res.newPath, donePath, 'newPath is the done/ destination');
  assert.strictEqual(res.humanGate, true, 'return shape preserved: humanGate === true');

  // Carries the human marker at the destination.
  const doneContent = fs.readFileSync(donePath, 'utf8');
  assert.match(doneContent, /approved_by: human/, 'destination carries the human marker');

  // Ledger entry exists, is scoped to the exact gate edge, and its hash verifies
  // against the EXACT bytes on disk (metric 7 / criterion 2).
  const entry = ledger.readEntry(slug, root);
  assert.ok(entry, 'ledger entry written');
  assert.strictEqual(entry.stage_from, 'review', 'entry scoped to source stage');
  assert.strictEqual(entry.stage_to, 'done', 'entry scoped to destination stage');
  assert.strictEqual(
    ledger.verify(slug, doneContent, 'done', root),
    true,
    'ledger hash matches the destination file (verify true)'
  );
});

// ── [M18] crash between move and ledger self-heals — never marked-in-source ───

test('[M18] a crash between move and ledger rolls back to (a) unmarked + in source — never (c) marked-in-source', () => {
  const root = mkSandbox();
  const slug = 'w02-s5-crash';
  const planPath = path.join(root, 'plans', 'review', slug + '.md');
  const body = '---\ntitle: "Crash"\ntype: feature\n---\n\n# Crash\n\nBody.\n';
  fs.writeFileSync(planPath, body);

  // Inject a throwing ledger write (step 3). Before the fix approvePlan writes no
  // ledger and ignores deps, so nothing throws — this assertion is RED today.
  assert.throws(
    () => approvePlan(planPath, root, {
      // R5-B: override past the review→done validation (not the subject) so the
      // crossing reaches the ledger-write step this test forces to throw.
      override: { reason: 'M18 rollback — validation not under test' },
      deps: { writeEntry: () => { throw new Error('injected crash between move and ledger'); } },
    }),
    /injected crash between move and ledger/,
    'the failed approval surfaces the error (never a silent false commit)'
  );

  const donePath = path.join(root, 'plans', 'done', slug + '.md');

  // (a) unmarked AND resident in the SOURCE folder.
  assert.ok(fs.existsSync(planPath), 'plan rolled back to the source review/ folder');
  assert.ok(!fs.existsSync(donePath), 'no plan left resident in the destination');

  const srcContent = fs.readFileSync(planPath, 'utf8');
  // NOT (c): the forbidden marked-and-resident-in-source state must be unreachable.
  assert.doesNotMatch(srcContent, /approved_by: human/, 'source plan is UNMARKED (not the forbidden state c)');
  assert.strictEqual(srcContent, body, 'original content restored byte-for-byte');

  // The partial ledger entry is cleared by the rollback.
  assert.strictEqual(ledger.readEntry(slug, root), null, 'no ledger entry survives the rollback');
});
