/**
 * A LINK INSIDE THE REPOSITORY REACHES OUTSIDE IT.
 *
 * Root confinement in `plan-coverage.scanForCoverage`, and protected-directory
 * matching in `PreToolUse.Edit.js`, are both PURE PATH ARITHMETIC — `path.relative`,
 * `path.posix.normalize`, `startsWith`. None of those touch the filesystem, so none
 * of them can see a symbolic link. A repository containing `link → /outside` turns
 * `/repo/link/x.js` into the clean, confined relative path `link/x.js`: confinement
 * passes and the write lands outside the tree.
 *
 * The same blindness sits under the APPROVAL LEDGER guard, which is the predicate
 * every other permission in this system rests on. Cases 7, 8 and 9 are that claim,
 * turned into evidence rather than argued.
 *
 * Every fixture is a real `os.tmpdir()` directory with real symbolic links and real
 * ledger approvals minted by the real `approval-ledger` over the fixture's own bytes.
 * Nothing here writes inside this repository. Link creation NEVER skips: a platform
 * that refuses to make a link fails the test loudly with the platform and the error,
 * because a skipped case is a check that reports a verdict on input it never received.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { findCoveringPlan } = require('../src/lib/plan-coverage');
const ledger = require('../src/lib/approval-ledger');
const {
  isProtectedLedgerPath,
  isProtectedVerifyPath,
} = require('../src/hooks/PreToolUse.Edit.js');
const safeFs = require('../src/lib/safe-fs');
const { escapesRoot, resolvesUnder } = require('../src/lib/real-path-confinement');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A temp directory with the CTOC shape a coverage scan expects. */
function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-link-'));
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
 * Create a symbolic link, LOUDLY. `junction` is used for directories so Windows
 * permits creation without elevation. A failure fails the test with the platform
 * and the underlying error — it never degrades into a skip.
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
 * every positive case below would pass for the wrong reason.
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

/** Run `fn` with the process cwd set to `dir`, restoring it unconditionally. */
function withCwd(dir, fn) {
  const before = process.cwd();
  process.chdir(dir);
  try {
    return fn(process.cwd());
  } finally {
    process.chdir(before);
  }
}

// ---------------------------------------------------------------------------
// The coverage oracle
// ---------------------------------------------------------------------------

describe('a link cannot leave the repository — coverage', () => {

  it('case 1: an approved plan declaring a link that points OUTSIDE covers nothing', () => {
    const root = makeProject();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-outside-'));
    try {
      fs.writeFileSync(path.join(outside, 'x.js'), '// outside\n');
      mklink(outside, path.join(root, 'link'));
      writeApprovedPlan(root, 'todo', 'p-link', ['link/**']);

      const match = findCoveringPlan(path.join(root, 'link', 'x.js'), root);
      assert.equal(match, null, 'a target whose REAL location is outside the repository must not be covered');
    } finally { rm(root); rm(outside); }
  });

  it('case 2: the wildcard variant — a deep target through the same link covers nothing', () => {
    const root = makeProject();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-outside-'));
    try {
      fs.mkdirSync(path.join(outside, 'nested', 'deep'), { recursive: true });
      fs.writeFileSync(path.join(outside, 'nested', 'deep', 'x.js'), '// outside\n');
      mklink(outside, path.join(root, 'link'));
      writeApprovedPlan(root, 'todo', 'p-link', ['link/**']);

      const match = findCoveringPlan(path.join(root, 'link', 'nested', 'deep', 'x.js'), root);
      assert.equal(match, null);
    } finally { rm(root); rm(outside); }
  });

  it('case 3: a link that stays INSIDE the repository is still covered', () => {
    const root = makeProject();
    try {
      fs.writeFileSync(path.join(root, 'src', 'lib', 'x.js'), '// inside\n');
      mklink(path.join(root, 'src', 'lib'), path.join(root, 'inner'));
      writeApprovedPlan(root, 'todo', 'p-inner', ['inner/**']);

      const match = findCoveringPlan(path.join(root, 'inner', 'x.js'), root);
      assert.ok(match, 'an in-tree link is not an escape — without this the fix is a blanket denial');
      assert.equal(match.glob, 'inner/**');
    } finally { rm(root); }
  });

  it('case 4: the root itself reached THROUGH a link is still covered (the /tmp → /private/tmp shape)', () => {
    const real = makeProject();
    const holder = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-holder-'));
    try {
      fs.writeFileSync(path.join(real, 'src', 'lib', 'x.js'), '// inside\n');
      writeApprovedPlan(real, 'todo', 'p-src', ['src/lib/**']);

      // The caller hands us an UNRESOLVED root: a link that points at the project.
      const linkedRoot = path.join(holder, 'rootlink');
      mklink(real, linkedRoot);

      const match = findCoveringPlan(path.join(linkedRoot, 'src', 'lib', 'x.js'), linkedRoot);
      assert.ok(match, 'resolving the target but not the root would deny EVERY fixture in this suite');
      assert.equal(match.glob, 'src/lib/**');
    } finally { rm(real); rm(holder); }
  });

  it('case 5: a target that does not exist yet (a Write creating a file) is covered', () => {
    const root = makeProject();
    try {
      writeApprovedPlan(root, 'todo', 'p-src', ['src/lib/**']);
      const match = findCoveringPlan(path.join(root, 'src', 'lib', 'brand-new.js'), root);
      assert.ok(match, 'denying ENOENT would block every Write that creates a file');
    } finally { rm(root); }
  });

  it('case 6: a NON-EXISTENT target through an outside link covers nothing', () => {
    const root = makeProject();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-outside-'));
    try {
      mklink(outside, path.join(root, 'link'));
      writeApprovedPlan(root, 'todo', 'p-link', ['link/**']);
      const match = findCoveringPlan(path.join(root, 'link', 'brand-new.js'), root);
      assert.equal(match, null);
    } finally { rm(root); rm(outside); }
  });

  it('case 11: a link LOOP returns (bounded) and never throws', () => {
    const root = makeProject();
    try {
      writeApprovedPlan(root, 'todo', 'p-a', ['a/**']);
      mklink(path.join(root, 'b'), path.join(root, 'a'));
      mklink(path.join(root, 'a'), path.join(root, 'b'));

      let match;
      assert.doesNotThrow(() => { match = findCoveringPlan(path.join(root, 'a', 'x.js'), root); },
        'a throw reaches the hook fail-open catch and becomes an ALLOW');
      assert.equal(match, null, 'ELOOP must DENY');
    } finally { rm(root); }
  });

  it('case 12: an unresolvable root denies, and never throws', () => {
    const root = path.join(os.tmpdir(), `ctoc-absent-${Date.now()}`, 'nope');
    let match;
    assert.doesNotThrow(() => { match = findCoveringPlan(path.join(root, 'src', 'x.js'), root); });
    assert.equal(match, null);
  });

  it('case 14: the fence is not vacuous — the identical fixture with NO link IS covered', () => {
    const root = makeProject();
    try {
      fs.writeFileSync(path.join(root, 'src', 'lib', 'real.js'), '// real\n');
      writeApprovedPlan(root, 'todo', 'p-src', ['src/lib/**']);
      const match = findCoveringPlan(path.join(root, 'src', 'lib', 'real.js'), root);
      assert.ok(match, 'cases 1, 2 and 6 must fail for the LINK reason, not because the harness never matches');
      assert.equal(match.glob, 'src/lib/**');
    } finally { rm(root); }
  });
});

// ---------------------------------------------------------------------------
// The protected-directory guards — the approval ledger and the verify evidence
// ---------------------------------------------------------------------------

describe('a link cannot reach the approval ledger — protected paths', () => {

  it('case 7: the ledger reached DIRECTLY through an in-repository link is protected', () => {
    const root = makeProject();
    try {
      withCwd(root, (cwd) => {
        mklink(path.join(cwd, '.ctoc', 'approvals'), path.join(cwd, 'src', 'anywhere'));
        const target = path.join(cwd, 'src', 'anywhere', 'forged.json');
        assert.equal(isProtectedLedgerPath(target), true,
          'a write whose REAL destination is the ledger forges human-approval provenance');
      });
    } finally { rm(root); }
  });

  it('case 8: the ledger reached through a PARENT link is protected', () => {
    const root = makeProject();
    try {
      withCwd(root, (cwd) => {
        mklink(path.dirname(cwd), path.join(cwd, 'src', 'up'));
        const target = path.join(cwd, 'src', 'up', path.basename(cwd), '.ctoc', 'approvals', 'forged.json');
        assert.equal(isProtectedLedgerPath(target), true);
      });
    } finally { rm(root); }
  });

  it('case 9: the Gate-3 verify evidence reached through a link is protected', () => {
    const root = makeProject();
    try {
      withCwd(root, (cwd) => {
        mklink(path.join(cwd, '.ctoc', 'state', 'verify'), path.join(cwd, 'src', 'ev'));
        const target = path.join(cwd, 'src', 'ev', 'forged.json');
        assert.equal(isProtectedVerifyPath(target), true);
      });
    } finally { rm(root); }
  });

  it('case 10: the ARITHMETIC guards still fire unchanged — the new check adds, it does not replace', () => {
    const root = makeProject();
    try {
      withCwd(root, () => {
        // plainly under the protected dirs
        assert.equal(isProtectedLedgerPath('.ctoc/approvals/x.json'), true);
        assert.equal(isProtectedVerifyPath('.ctoc/state/verify/x.json'), true);
        // a `..` that resolves BACK INSIDE is still protected
        assert.equal(isProtectedVerifyPath('.ctoc/state/verify/../verify/x.json'), true);
        // a `..` that resolves OUT of the protected dir is NOT protected
        assert.equal(isProtectedLedgerPath('.ctoc/approvals/../x.js'), false);
        // case variants (macOS APFS / Windows route these into the real dir)
        assert.equal(isProtectedLedgerPath('.CTOC/Approvals/x.json'), true);
        // an ordinary source file is not protected
        assert.equal(isProtectedLedgerPath('src/lib/x.js'), false);
      });
    } finally { rm(root); }
  });

  it('case 13: a realpath fault DENIES — and returns rather than throwing', () => {
    const root = makeProject();
    const realOriginal = safeFs.realpathSync;
    try {
      fs.writeFileSync(path.join(root, 'src', 'lib', 'x.js'), '// x\n');
      writeApprovedPlan(root, 'todo', 'p-src', ['src/lib/**']);

      safeFs.realpathSync = () => {
        const err = new Error('permission denied');
        err.code = 'EACCES';
        throw err;
      };

      let match;
      assert.doesNotThrow(() => { match = findCoveringPlan(path.join(root, 'src', 'lib', 'x.js'), root); },
        'a throw out of a permission check reaches the fail-OPEN catch and becomes an ALLOW');
      assert.equal(match, null, 'a check that cannot look must DENY');

      withCwd(root, () => {
        let protectedVerdict;
        assert.doesNotThrow(() => { protectedVerdict = isProtectedLedgerPath('src/lib/x.js'); });
        assert.equal(protectedVerdict, true, 'a check that cannot look must treat the path as protected');
      });
    } finally {
      safeFs.realpathSync = realOriginal;
      rm(root);
    }
  });
});

// ---------------------------------------------------------------------------
// The predicate itself — the two OPPOSITE failing directions, and every input
// that is not a path at all. Both functions must return, never throw.
//
// DOCUMENTED UNREACHABLE (honesty clause — no fabricated hit):
//   real-path-confinement.js — the loop-exhaustion return after MAX_ANCESTOR_WALK
//   and the two outermost `catch` blocks in `resolveExisting` and `resolvesUnder`.
//   The walk terminates at the `path.dirname` fixed point long before 4096
//   iterations on every real filesystem, and the outer catches sit behind input
//   type-guards over `path.join`/`path.resolve`, which are total for the string
//   inputs that survive those guards. They are a SECOND, independent bound whose
//   whole purpose is that nothing reaches them; reaching them would need
//   monkeypatching `path` itself. Documented, not faked.
// ---------------------------------------------------------------------------

describe('real-path confinement — the two opposite failing directions', () => {

  it('escapesRoot: DENIES (escapes:true) on every input that is not a usable path', () => {
    const root = makeProject();
    try {
      assert.equal(escapesRoot('', root).escapes, true);
      assert.equal(escapesRoot(null, root).escapes, true);
      assert.equal(escapesRoot('src/lib/x.js', '').escapes, true);
      assert.equal(escapesRoot('src/lib/x.js', null).escapes, true);
      // a NUL byte cannot be resolved: safe-fs refuses it, and the refusal must
      // land as a returned DENY rather than as a thrown exception
      assert.equal(escapesRoot('src/lib/\0evil.js', root).escapes, true);
      // an ancestor that is a FILE (ENOTDIR) is not a path we can see through
      fs.writeFileSync(path.join(root, 'src', 'lib', 'afile.js'), '// f\n');
      assert.equal(escapesRoot(path.join(root, 'src', 'lib', 'afile.js', 'child.js'), root).escapes, true);
      // and the control: an ordinary in-tree path does NOT escape
      assert.equal(escapesRoot('src/lib/afile.js', root).escapes, false);
    } finally { rm(root); }
  });

  it('resolvesUnder: DENIES (true) on every fault — the INVERTED direction', () => {
    const root = makeProject();
    try {
      // a target that is not a path at all is not something to protect
      assert.equal(resolvesUnder('', '.ctoc/approvals', root), false);
      assert.equal(resolvesUnder(null, '.ctoc/approvals', root), false);
      // every OTHER fault denies
      assert.equal(resolvesUnder('x.json', '', root), true);
      assert.equal(resolvesUnder('x.json', null, root), true);
      assert.equal(resolvesUnder('x.json', '.ctoc/approvals', ''), true);
      assert.equal(resolvesUnder('x.json', '.ctoc/approvals', null), true);
      assert.equal(resolvesUnder('\0x.json', '.ctoc/approvals', root), true);
      // and the controls, both ways
      assert.equal(resolvesUnder('.ctoc/approvals/x.json', '.ctoc/approvals', root), true);
      assert.equal(resolvesUnder('src/lib/x.js', '.ctoc/approvals', root), false);
      // a same-prefix SIBLING directory is not within — the separator is required
      fs.mkdirSync(path.join(root, '.ctoc', 'approvalsOTHER'), { recursive: true });
      assert.equal(resolvesUnder('.ctoc/approvalsOTHER/x.json', '.ctoc/approvals', root), false);
    } finally { rm(root); }
  });
});
