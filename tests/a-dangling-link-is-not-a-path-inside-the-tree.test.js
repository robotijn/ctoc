/**
 * A LINK THAT POINTS AT NOTHING YET IS REPORTED AS A PATH INSIDE THE TREE.
 *
 * `real-path-confinement.resolveExisting` handles a path that does not exist yet —
 * the ordinary `Write`-creates-a-file case — by walking up to the nearest existing
 * ancestor and rejoining the unresolved tail, on the stated guarantee that "the tail
 * contains no links BECAUSE IT DOES NOT EXIST".
 *
 * That guarantee is false for a tail segment that EXISTS AS A SYMBOLIC LINK WHOSE
 * TARGET DOES NOT. `realpathSync` answers ENOENT for both facts, and the walk cannot
 * tell them apart: it pushes the link onto the not-yet-existing tail and reports
 * `<root>/link` — inside the tree — while the write follows the link out of it.
 *
 * This is not an exotic shape for the guard that matters most. A FORGED APPROVAL
 * RECORD IS BY DEFINITION A FILE THAT DOES NOT EXIST UNTIL IT IS FORGED, so the
 * dangling case is the ORDINARY case for the attack on the approval ledger.
 *
 * Every fixture is a real `os.tmpdir()` directory with real symbolic links. Nothing
 * here creates a link inside this repository. Link creation NEVER skips: a platform
 * that refuses to make one fails the test loudly with the platform and the error,
 * because a skipped case is a check that reports a verdict on input it never received.
 *
 * The fixture root is always reached through an EXPLICIT link created here rather
 * than through the platform's own tmpdir link, so the root-resolution trap is
 * exercised deterministically on Linux and Windows too, not only on macOS.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { findCoveringPlan } = require('../src/lib/plan-coverage');
const ledger = require('../src/lib/approval-ledger');
const safeFs = require('../src/lib/safe-fs');
const { escapesRoot, resolvesUnder } = require('../src/lib/real-path-confinement');

const EDIT_HOOK = path.join(__dirname, '..', 'src', 'hooks', 'PreToolUse.Edit.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A temp directory with the CTOC shape a coverage scan expects. */
function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-dangling-'));
  for (const s of ['in-progress', 'todo']) {
    fs.mkdirSync(path.join(dir, 'plans', s), { recursive: true });
  }
  fs.mkdirSync(path.join(dir, '.ctoc', 'approvals'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.ctoc', 'state', 'verify'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src', 'lib'), { recursive: true });
  return dir;
}

function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
}

/**
 * Create a symbolic link, LOUDLY. `junction` is used for directory targets so
 * Windows permits creation without elevation; a DANGLING link has no target to
 * inspect, so the caller states the type. A failure fails the test with the
 * platform and the underlying error — it never degrades into a skip.
 */
function mklink(target, linkPath, type = 'junction') {
  try {
    fs.symlinkSync(target, linkPath, type);
  } catch (err) {
    assert.fail(
      `could not create a symbolic link on ${process.platform} ` +
      `(${linkPath} -> ${target}): ${err.code || ''} ${err.message}`
    );
  }
}

/**
 * Write a plan into plans/<stage>/ AND mint the real, agent-unforgeable ledger
 * approval over its actual bytes. Without the entry the plan grants nothing and
 * the negative cases below would pass for the wrong reason.
 */
function writeApprovedPlan(root, stage, name, files) {
  const yaml = files.map(f => `  - "${f}"`).join('\n');
  const content = `---\ntitle: "${name}"\nprogram: ctoc-v7\nfiles:\n${yaml}\n---\n# ${name}\n`;
  const planPath = path.join(root, 'plans', stage, `${name}.md`);
  fs.writeFileSync(planPath, content);
  ledger.writeEntry(ledger.slugFromPlanPath(planPath), {
    content,
    stage_from: 'implementation',
    stage_to: stage === 'in-progress' ? 'todo' : stage,
    approved_by: 'human',
  }, root);
  return planPath;
}

/** True iff the hook emitted a deny decision on stdout. */
function deniedOnStdout(res) {
  const s = String(res.stdout || '');
  let decision = null;
  try { decision = JSON.parse(s); } catch {
    const idx = s.indexOf('{');
    if (idx === -1) return false;
    try { decision = JSON.parse(s.slice(idx)); } catch { return false; }
  }
  return !!(decision && decision.hookSpecificOutput
    && decision.hookSpecificOutput.permissionDecision === 'deny');
}

// ---------------------------------------------------------------------------
// The defect
// ---------------------------------------------------------------------------

describe('a dangling link is not a path inside the tree', () => {

  it('case 1: a link pointing at a NOT-YET-EXISTING file OUTSIDE the tree escapes', () => {
    const root = makeProject();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-outside-'));
    try {
      // The target does NOT exist. The link does. realpathSync answers ENOENT for
      // both facts, and only lstat separates them.
      mklink(path.join(outside, 'newfile'), path.join(root, 'link'), 'file');
      assert.equal(escapesRoot('link', root).escapes, true,
        'a write through this link creates a file OUTSIDE the repository');
    } finally { rm(root); rm(outside); }
  });

  it('case 2: the LEDGER shape — a link pointing at a not-yet-forged approval entry is protected', () => {
    const root = makeProject();
    try {
      // A forged approval record is BY DEFINITION a file that does not exist until
      // it is forged, so the dangling case is the ORDINARY case for this attack.
      mklink(path.join(root, '.ctoc', 'approvals', 'forged.json'),
        path.join(root, 'src', 'anywhere'), 'file');
      assert.equal(resolvesUnder('src/anywhere', '.ctoc/approvals', root), true,
        'a write through this link mints the approval record it names, inside the ledger');
    } finally { rm(root); }
  });

  it('case 3: a dangling link in the MIDDLE of the path escapes', () => {
    const root = makeProject();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-outside-'));
    try {
      mklink(path.join(outside, 'nodir'), path.join(root, 'link'));
      assert.equal(escapesRoot(path.join('link', 'x.js'), root).escapes, true);
    } finally { rm(root); rm(outside); }
  });

  it('case 4: the fence is NOT vacuous — a plain new file with no link anywhere is permitted', () => {
    const root = makeProject();
    try {
      assert.equal(escapesRoot(path.join('src', 'lib', 'brand-new.js'), root).escapes, false,
        'without this the fix is a blanket denial of every Write that creates a file');
      // and one level deeper, where the missing tail is longer than a single segment
      assert.equal(escapesRoot(path.join('src', 'lib', 'nested', 'brand-new.js'), root).escapes, false);
    } finally { rm(root); }
  });

  it('case 5: an IN-TREE dangling link is refused — the documented over-refusal (Decision 1)', () => {
    const root = makeProject();
    try {
      // Following the link one hop would permit this. It is REFUSED instead, because
      // following re-introduces link-following and cycle risk into the module whose
      // entire purpose is not to be fooled by links. Measured cost: this repository
      // contains zero symbolic links outside node_modules/ and .git/.
      mklink(path.join(root, 'src', 'newfile'), path.join(root, 'link'), 'file');
      const verdict = escapesRoot('link', root);
      assert.equal(verdict.escapes, true, 'DOCUMENTED CHOICE, not an accident — see Decision 1');
      assert.equal(verdict.reason, 'dangling', 'the report must be able to name which fault fired');
    } finally { rm(root); }
  });

  it('case 6: a LIVE link that stays inside the tree is still permitted', () => {
    const root = makeProject();
    try {
      fs.writeFileSync(path.join(root, 'src', 'lib', 'x.js'), '// inside\n');
      mklink(path.join(root, 'src', 'lib'), path.join(root, 'inner'));
      assert.equal(escapesRoot(path.join('inner', 'x.js'), root).escapes, false);
    } finally { rm(root); }
  });

  it('case 7: a LIVE link that leaves the tree is still refused', () => {
    const root = makeProject();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-outside-'));
    try {
      fs.writeFileSync(path.join(outside, 'x.js'), '// outside\n');
      mklink(outside, path.join(root, 'link'));
      assert.equal(escapesRoot(path.join('link', 'x.js'), root).escapes, true);
    } finally { rm(root); rm(outside); }
  });

  it('case 8: a link LOOP returns a refusal — no throw, no hang', () => {
    const root = makeProject();
    try {
      mklink(path.join(root, 'b'), path.join(root, 'a'));
      mklink(path.join(root, 'a'), path.join(root, 'b'));
      let verdict;
      assert.doesNotThrow(() => { verdict = escapesRoot(path.join('a', 'x.js'), root); },
        'a throw reaches the hook fail-OPEN catch and becomes an ALLOW');
      assert.equal(verdict.escapes, true);
      assert.equal(verdict.reason, 'loop');
    } finally { rm(root); }
  });

  it('case 9: a file where a directory is expected (ENOTDIR) is refused', () => {
    const root = makeProject();
    try {
      fs.writeFileSync(path.join(root, 'src', 'lib', 'afile.js'), '// f\n');
      let verdict;
      assert.doesNotThrow(() => {
        verdict = escapesRoot(path.join('src', 'lib', 'afile.js', 'x.js'), root);
      });
      assert.equal(verdict.escapes, true);
    } finally { rm(root); }
  });

  it('case 10: an unresolvable root refuses, and never throws', () => {
    const root = path.join(os.tmpdir(), `ctoc-absent-${Date.now()}`, 'nope');
    let verdict;
    assert.doesNotThrow(() => { verdict = escapesRoot(path.join('src', 'x.js'), root); });
    assert.equal(verdict.escapes, true);
    assert.doesNotThrow(() => { resolvesUnder('x.json', '.ctoc/approvals', root); });
    assert.equal(resolvesUnder('x.json', '.ctoc/approvals', root), true);

    // A root that is a link LOOP is unresolvable for a different mechanical reason,
    // and the whole call must refuse rather than hang or throw.
    const holder = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-looproot-'));
    try {
      mklink(path.join(holder, 'b'), path.join(holder, 'a'));
      mklink(path.join(holder, 'a'), path.join(holder, 'b'));
      let looped;
      assert.doesNotThrow(() => { looped = escapesRoot('src/x.js', path.join(holder, 'a')); });
      assert.equal(looped.escapes, true);
      assert.equal(looped.reason, 'root-loop', 'the report must name which fault fired');
      assert.equal(resolvesUnder('x.json', '.ctoc/approvals', path.join(holder, 'a')), true);
    } finally { rm(holder); }
  });

  it('case 11: resolvesUnder keeps its DOCUMENTED INVERSION for a target that is not a path', () => {
    const root = makeProject();
    try {
      // Deliberate asymmetry, NOT an inconsistency to be tidied away: a target that
      // is not a path at all is not a resolver fault, there is nothing to protect,
      // and both call sites guard `targetFile &&` before asking. Returning true here
      // would report a null target as ledger-protected.
      assert.doesNotThrow(() => { resolvesUnder(null, '.ctoc/approvals', root); });
      assert.equal(resolvesUnder(null, '.ctoc/approvals', root), false);
      assert.equal(resolvesUnder('', '.ctoc/approvals', root), false);
      assert.equal(resolvesUnder(42, '.ctoc/approvals', root), false);
      // while escapesRoot DENIES the same input — the opposite direction, same verdict
      assert.equal(escapesRoot(null, root).escapes, true);
    } finally { rm(root); }
  });

  it('case 12: a permission fault on the lstat itself DENIES by returning, never by throwing', () => {
    const root = makeProject();
    const original = safeFs.lstatSync;
    try {
      safeFs.lstatSync = () => {
        const err = new Error('permission denied');
        err.code = 'EACCES';
        throw err;
      };
      let verdict;
      assert.doesNotThrow(() => { verdict = escapesRoot(path.join('src', 'lib', 'new.js'), root); },
        'a throw out of a permission check reaches the fail-OPEN catch and becomes an ALLOW');
      assert.equal(verdict.escapes, true, 'a check that cannot look must DENY');
      let prot;
      assert.doesNotThrow(() => { prot = resolvesUnder('src/lib/new.js', '.ctoc/approvals', root); });
      assert.equal(prot, true, 'the inverted direction fails toward DENY too');
    } finally {
      safeFs.lstatSync = original;
      rm(root);
    }
  });

  it('case 13: the LIVE coverage guard inherits the fix — a plan cannot cover a dangling link', () => {
    const real = makeProject();
    const holder = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-holder-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-outside-'));
    try {
      writeApprovedPlan(real, 'todo', 'p-link', ['link/**', 'link']);
      mklink(path.join(outside, 'newfile'), path.join(real, 'link'), 'file');

      // The root is handed over UNRESOLVED, through an explicit link, so the
      // root-resolution trap is exercised on every platform rather than only where
      // the platform's own tmpdir happens to be a link.
      const linkedRoot = path.join(holder, 'rootlink');
      mklink(real, linkedRoot);

      let match;
      assert.doesNotThrow(() => {
        match = findCoveringPlan(path.join(linkedRoot, 'link'), linkedRoot);
      });
      assert.equal(match, null,
        'an approved plan must not cover a link whose write lands outside the repository');
    } finally { rm(real); rm(holder); rm(outside); }
  });

  it('case 14: the LIVE ledger guard inherits the fix — the real hook denies the dangling ledger link', () => {
    const root = makeProject();
    try {
      // src/anywhere -> <root>/.ctoc/approvals/forged.json, which does not exist yet.
      // A write to src/anywhere follows the link and mints the approval record.
      mklink(path.join(root, '.ctoc', 'approvals', 'forged.json'),
        path.join(root, 'src', 'anywhere'), 'file');

      const res = spawnSync(process.execPath, [EDIT_HOOK], {
        cwd: root,
        input: JSON.stringify({
          tool_name: 'Write',
          tool_input: { file_path: path.join(root, 'src', 'anywhere') },
        }),
        encoding: 'utf8',
        env: { ...process.env, CLAUDE_TOOL_INPUT: '' },
      });
      assert.equal(res.signal, null, `edit hook killed by signal ${res.signal}`);
      assert.equal(deniedOnStdout(res), true,
        `a write whose REAL destination is the approval ledger must be denied; ` +
        `stdout=${res.stdout} stderr=${res.stderr}`);
      assert.equal(fs.existsSync(path.join(root, '.ctoc', 'approvals', 'forged.json')), false,
        'a denied write must not have minted the approval record');
    } finally { rm(root); }
  });
});
