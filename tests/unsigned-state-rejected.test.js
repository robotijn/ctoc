/**
 * Unsigned Iron Loop state is REJECTED, not signed on load.
 *
 * The defect (src/lib/state-manager.js loadState, pre-fix): a state file with no
 * `_signature` was signed with the installation secret and returned `valid: true`.
 * That made signing prove nothing — forging the Iron Loop position (currentStep,
 * feature), the only two inputs to the Bash hook's write gate and commit gate,
 * required NO key: write an unsigned JSON file and the next load minted the
 * signature. This suite proves the forged/unsigned file is now REJECTED, both at
 * the state-manager boundary and end-to-end at the commit gate it defeated.
 *
 * ISOLATION: home is redirected to a throwaway temp dir BEFORE any CTOC module is
 * required, so no test ever writes to the developer's real ~/.ctoc/state/. See the
 * assert below — the suite refuses to run if the redirect did not take.
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// --- Home isolation, established before requiring state-manager / crypto ---------
const ISOLATED_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-unsigned-home-'));
const ORIG_HOME = process.env.HOME;
const ORIG_USERPROFILE = process.env.USERPROFILE;
process.env.HOME = ISOLATED_HOME;
process.env.USERPROFILE = ISOLATED_HOME;

// os.homedir() reads $HOME (POSIX) / %USERPROFILE% (Windows) on every call. If the
// redirect did not take, REFUSE to run rather than write to the real home directory.
assert.strictEqual(
  os.homedir(),
  ISOLATED_HOME,
  'home isolation failed — refusing to run against the real ~/.ctoc'
);

const stateManager = require('../src/lib/state-manager');
const { hashPath } = require('../src/lib/crypto');

const REPO_ROOT = path.join(__dirname, '..');
const BASH_HOOK = path.join(REPO_ROOT, 'src', 'hooks', 'PreToolUse.Bash.js');

// A distinct project path per case keeps state files from colliding.
let projectCounter = 0;
function freshProject() {
  return path.join(ISOLATED_HOME, 'projects', `p${projectCounter++}`);
}

const STATE_DIR = path.join(ISOLATED_HOME, '.ctoc', 'state');
function statePathFor(projectPath) {
  return path.join(STATE_DIR, `${hashPath(projectPath)}.json`);
}
function writeRaw(projectPath, obj) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(statePathFor(projectPath), typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
}
function readRaw(projectPath) {
  return fs.readFileSync(statePathFor(projectPath), 'utf8');
}

after(() => {
  if (ORIG_HOME === undefined) delete process.env.HOME; else process.env.HOME = ORIG_HOME;
  if (ORIG_USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = ORIG_USERPROFILE;
  fs.rmSync(ISOLATED_HOME, { recursive: true, force: true });
});

describe('Unsigned state is rejected, not believed', () => {
  test('1: an unsigned state is rejected', () => {
    const project = freshProject();
    writeRaw(project, { currentStep: 16, feature: 'x', project });

    const result = stateManager.loadState(project);

    assert.strictEqual(result.state, null, 'forged step must not be returned');
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.unsigned, true, 'discriminator distinguishes never-signed from tampered');
  });

  test('2: it is not rewritten on load (the file is left unsigned)', () => {
    const project = freshProject();
    writeRaw(project, { currentStep: 16, feature: 'x', project });

    stateManager.loadState(project);

    const onDisk = JSON.parse(readRaw(project));
    assert.strictEqual(onDisk._signature, undefined, 'load must not have signed the file');
    assert.strictEqual(onDisk._migrated_at, undefined, 'load must not have stamped a migration');
  });

  test('3: the forged step does not reach a caller (state is null)', () => {
    const project = freshProject();
    writeRaw(project, { currentStep: 16, feature: 'x', project });

    const result = stateManager.loadState(project);
    // A caller reading result.state?.currentStep gets undefined, not 16.
    assert.strictEqual(result.state, null);
    assert.strictEqual(result.state?.currentStep, undefined);
  });

  test('4: a correctly signed state still loads with its step preserved', () => {
    const project = freshProject();
    stateManager.saveState(project, stateManager.createState(project, 'real-feature'));
    // advance to a real step through the signed writer
    stateManager.updateStep(project, 10, 'in_progress');

    const result = stateManager.loadState(project);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.state.currentStep, 10);
    assert.strictEqual(result.state.feature, 'real-feature');
  });

  test('5: a badly signed state is still rejected (unsigned absent/false)', () => {
    const project = freshProject();
    stateManager.saveState(project, stateManager.createState(project, 'f'));
    // Tamper one byte of the signature.
    const signed = JSON.parse(readRaw(project));
    signed._signature = signed._signature.slice(0, -1) + (signed._signature.endsWith('a') ? 'b' : 'a');
    writeRaw(project, signed);

    const result = stateManager.loadState(project);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.state, null);
    assert.notStrictEqual(result.unsigned, true, 'a tampered signature is not the "unsigned" case');
  });

  test('6: a signed state with a tampered field is rejected', () => {
    const project = freshProject();
    stateManager.saveState(project, stateManager.createState(project, 'f'));
    // Flip the field the signature exists to protect, leaving the signature intact.
    const signed = JSON.parse(readRaw(project));
    signed.currentStep = 16;
    writeRaw(project, signed);

    const result = stateManager.loadState(project);
    assert.strictEqual(result.valid, false, 'the signature must cover currentStep');
    assert.strictEqual(result.state, null);
  });

  test('7: corrupt JSON is rejected without throwing', () => {
    const project = freshProject();
    writeRaw(project, 'not valid json {{{');

    let result;
    assert.doesNotThrow(() => { result = stateManager.loadState(project); });
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.state, null);
    assert.ok(/Failed to load/.test(result.error));
  });

  test('8: a missing file is unchanged', () => {
    const project = freshProject();
    const result = stateManager.loadState(project);
    assert.deepStrictEqual(result, { state: null, valid: false, error: 'No state file' });
  });

  test('9: the rejection error names the recovery (a way out, not just a condition)', () => {
    const project = freshProject();
    writeRaw(project, { currentStep: 16, feature: 'x', project });

    const result = stateManager.loadState(project);
    const err = String(result.error).toLowerCase();
    assert.ok(/menu/.test(err), 'names where to go');
    assert.ok(/iron loop|start/.test(err), 'names the action to take');
    assert.ok(/unsigned/.test(err), 'names the condition');
  });

  test('10: the recovery works — saveState mints a fresh signed state that loads', () => {
    const project = freshProject();
    writeRaw(project, { currentStep: 16, feature: 'x', project }); // rejected
    assert.strictEqual(stateManager.loadState(project).valid, false);

    // "start the loop again" — the existing signed writer is the way out, no new code.
    stateManager.saveState(project, stateManager.createState(project, 'fresh'));
    const result = stateManager.loadState(project);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.state.currentStep, 1);
    assert.strictEqual(result.state.feature, 'fresh');
  });

  test('11: updateStep on an unsigned state does not preserve the forged step', () => {
    const project = freshProject();
    writeRaw(project, { currentStep: 16, feature: 'x', project });

    stateManager.updateStep(project, 8, 'in_progress');

    const result = stateManager.loadState(project);
    assert.strictEqual(result.valid, true, 'updateStep writes a fresh signed state');
    assert.strictEqual(result.state.currentStep, 8, 'the forged 16 is gone; the real request wins');
    assert.ok(result.state._signature, 'the rewritten state is signed');
  });

  test('14: loadState never throws on adversarial inputs', () => {
    const dirProject = freshProject();
    // A directory in place of the state file.
    fs.mkdirSync(statePathFor(dirProject), { recursive: true });
    assert.doesNotThrow(() => {
      const r = stateManager.loadState(dirProject);
      assert.strictEqual(typeof r, 'object');
      assert.strictEqual(r.valid, false);
    });

    for (const body of ['', 'null', '[]']) {
      const p = freshProject();
      writeRaw(p, body);
      let r;
      assert.doesNotThrow(() => { r = stateManager.loadState(p); }, `body=${JSON.stringify(body)}`);
      assert.strictEqual(typeof r, 'object');
      assert.strictEqual(r.valid, false, `body=${JSON.stringify(body)} must be invalid`);
      assert.strictEqual(r.state, null);
    }
  });
});

// --- End-to-end at the gate the defect defeats ----------------------------------
// Spawns the real registered PreToolUse.Bash hook as a subprocess (the strongest
// possible test), with the isolated home and a forged unsigned state at step 16.
function spawnBashGate(projectDir, command) {
  fs.mkdirSync(projectDir, { recursive: true });
  const real = fs.realpathSync(projectDir); // process.cwd() in the child is the realpath
  return {
    real,
    run: spawnSync(process.execPath, [BASH_HOOK], {
      cwd: real,
      env: { ...process.env, HOME: ISOLATED_HOME, USERPROFILE: ISOLATED_HOME },
      input: JSON.stringify({ tool_input: { command } }),
      encoding: 'utf8',
    }),
  };
}

describe('End to end: a forged step cannot clear the commit gate', () => {
  test('12: an unsigned state at currentStep 16 does NOT allow a commit — it is denied', () => {
    const projectDir = freshProject();
    fs.mkdirSync(projectDir, { recursive: true });
    const real = fs.realpathSync(projectDir);
    writeRaw(real, { currentStep: 16, feature: 'forged', project: real });

    const { run } = spawnBashGate(projectDir, 'git commit -m x');

    // Pre-fix (RED): the unsigned file is minted at step 16 >= 15, so the commit is
    // ALLOWED — no deny JSON, exit 0. Post-fix: state is null, step defaults to 1 < 15,
    // the commit is DENIED.
    assert.ok(
      run.stdout.includes('"permissionDecision":"deny"'),
      `commit at a forged step 16 must be DENIED. stdout=${run.stdout} stderr=${run.stderr}`
    );
    assert.notStrictEqual(run.status, 0, 'a deny exits non-zero (harness hard-block code)');
  });

  test('13: the human gets feedback — the block banner reaches stderr on the denied commit', () => {
    // Scope note: the banner reports the step-gate reason (state is null → "step 1"),
    // NOT the words "unsigned state". Naming the unsigned state in the banner needs an
    // edit to src/hooks/PreToolUse.Bash.js, which is outside this plan's declared files
    // and is gate/hook logic — surfaced as a follow-up finding, not taken here. This
    // case asserts the reachable truth: the commit is denied AND a banner is printed.
    const projectDir = freshProject();
    fs.mkdirSync(projectDir, { recursive: true });
    const real = fs.realpathSync(projectDir);
    writeRaw(real, { currentStep: 16, feature: 'forged', project: real });

    const { run } = spawnBashGate(projectDir, 'git commit -m x');

    assert.ok(run.stdout.includes('"permissionDecision":"deny"'), 'the commit is denied');
    assert.ok(/BLOCKED/.test(run.stderr), `a human-readable block banner must reach stderr. stderr=${run.stderr}`);
  });
});
