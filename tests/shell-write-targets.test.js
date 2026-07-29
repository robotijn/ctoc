'use strict';

/**
 * THE SHELL WRITE-TARGET CLASSIFIER — 00201.
 *
 * `src/hooks/PreToolUse.Bash.js` decides whether a shell command writes files so
 * the Iron-Loop step gate can judge it. Before this slice the decision consulted a
 * whole-string-anchored ALWAYS_ALLOWED list FIRST, so any command whose FIRST token
 * was `cd`/`ls`/`node`/… never reached the write patterns at all:
 *
 *     cd . && echo evil > src/x.js        was ALLOWED
 *     ls;   echo evil > src/x.js          was ALLOWED
 *     node -e 'fs.writeFileSync(...)'     was ALLOWED
 *
 * A two-character `cd` prefix DISABLED the write gate — an enforcement gate whose
 * failure mode is "permission granted". `src/lib/shell-write-targets.js` moves the
 * write-target decision into a pure, per-segment, cd-aware classifier that says
 * plainly when it CANNOT determine the write set (`indeterminate`) so the gate FAILS
 * CLOSED (treats "can't tell" as "must judge"), never silently allows.
 *
 * The three-valued contract (the whole point of the slice):
 *   verdict 'none'          — no recognized write shape           → gate: not a write
 *   verdict 'writes'        — determinate literal targets, cd-resolved
 *   verdict 'indeterminate' — a write shape whose targets cannot be read, OR a
 *                             construct that makes the segment unreadable
 * `indeterminate` is NEVER collapsed into `none`. "This command writes nothing" is
 * not soundly decidable (the recognized set is a denylist), so the classifier can
 * say "writes P" and "cannot determine", never "writes nothing beyond doubt".
 *
 * The integration cases SPAWN THE REAL HOOK (the strongest available test), matching
 * how tests/ledger-forgery-closed.test.js drives this file, and assert the harness
 * deny signal (permissionDecision:"deny" on stdout). Cases 33 and 34 are RED before
 * the fix (the bypass), 35–37 guard against the fix becoming "every command writes".
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const { classifyWrites, splitSegments, resolveTarget } = require('../src/lib/shell-write-targets');

// ===========================================================================
// UNIT — classifyWrites
// ===========================================================================

describe('classifyWrites — determinate literal write targets', () => {
  const writeCases = [
    ['1  plain redirect', 'echo evil > src/x.js', ['src/x.js']],
    ['2  cd . prefix (the defect)', 'cd . && echo evil > src/x.js', ['src/x.js']],
    ['3  ls; prefix (the defect)', 'ls; echo evil > src/x.js', ['src/x.js']],
    ['4  cd-resolved target', 'cd src/lib && echo x > y.js', ['src/lib/y.js']],
    ['5  chained cd + touch', 'cd src && cd ../tests && touch a.js', ['tests/a.js']],
    ['6  cp last operand', 'cp a.js src/lib/b.js', ['src/lib/b.js']],
    ['7  mv skip flag', 'mv -f a b/c.js', ['b/c.js']],
    ['8  tee skip flag + input redirect', 'tee -a src/x.js < in', ['src/x.js']],
    ['9  sed -i', "sed -i 's/a/b/' src/x.js", ['src/x.js']],
    ['10 dd of=', 'dd of=src/x.js if=/dev/zero', ['src/x.js']],
    ['11 curl -o', 'curl -o src/x.js https://e', ['src/x.js']],
    ['30 backslash target normalized', 'echo x > src\\lib\\y.js', ['src/lib/y.js']],
  ];
  for (const [label, cmd, targets] of writeCases) {
    test(label, () => {
      const r = classifyWrites(cmd);
      assert.equal(r.verdict, 'writes', `${cmd} -> ${JSON.stringify(r)}`);
      assert.deepEqual(r.targets, targets, `${cmd} targets`);
      assert.equal(r.reason, null);
    });
  }

  test('31 stderr / merged / clobber redirects all write', () => {
    for (const cmd of ['2> src/x.js', '&> src/x.js', '>| src/x.js']) {
      const r = classifyWrites(cmd);
      assert.equal(r.verdict, 'writes', `${cmd} -> ${JSON.stringify(r)}`);
      assert.deepEqual(r.targets, ['src/x.js'], `${cmd} targets`);
    }
  });
});

describe('classifyWrites — indeterminate (the answer is unknown)', () => {
  const indet = [
    ['12 node -e (the defect)', 'node -e \'fs.writeFileSync("src/x.js","x")\'', 'interpreter'],
    ['13 python interpreter', 'python3 script.py', 'interpreter'],
    ['14 npm run task runner', 'npm run build', 'task runner'],
    ['15 variable in target', 'echo x > $TARGET', 'glob or variable in a write target'],
    ['16 backtick in target', 'echo x > `f`', 'command substitution'],
    ['17 glob in target', 'echo x > src/*.js', 'glob or variable in a write target'],
    ['18 heredoc', 'cat <<EOF > src/x.js', 'heredoc'],
    ['19 cd non-literal operand', 'cd $D && echo x > y.js', 'working directory unknown'],
  ];
  for (const [label, cmd, reason] of indet) {
    test(label, () => {
      const r = classifyWrites(cmd);
      assert.equal(r.verdict, 'indeterminate', `${cmd} -> ${JSON.stringify(r)}`);
      assert.equal(r.reason, reason, `${cmd} reason`);
    });
  }

  test('20 find -exec is indeterminate', () => {
    const r = classifyWrites("find . -name '*.js' -exec sed -i s/a/b/ {} \\;");
    assert.equal(r.verdict, 'indeterminate', JSON.stringify(r));
  });

  test('21 determinate half does not launder the opaque half; targets still surfaced', () => {
    const r = classifyWrites("echo x > a.js && node -e 'y'");
    assert.equal(r.verdict, 'indeterminate', JSON.stringify(r));
    assert.ok(r.targets.includes('a.js'), `targets should still contain a.js: ${JSON.stringify(r.targets)}`);
  });
});

describe('classifyWrites — none (no recognized write shape)', () => {
  for (const cmd of ['ls -la', 'grep -rn foo src/', 'git status', 'cat src/x.js']) {
    test(`22-25 ${cmd} -> none`, () => {
      const r = classifyWrites(cmd);
      assert.equal(r.verdict, 'none', `${cmd} -> ${JSON.stringify(r)}`);
      assert.deepEqual(r.targets, []);
      assert.equal(r.reason, null);
    });
  }
});

describe('classifyWrites — bounds and adversarial input never throw', () => {
  test('26 empty / null / number -> none, no throw', () => {
    for (const v of ['', null, undefined, 42, {}, []]) {
      const r = classifyWrites(v);
      assert.equal(r.verdict, 'none', `${JSON.stringify(v)} -> ${JSON.stringify(r)}`);
    }
  });

  test('27 a 100 KiB command is bounded to indeterminate, under 100ms', () => {
    const big = 'echo ' + 'a'.repeat(100 * 1024);
    const start = Date.now();
    const r = classifyWrites(big);
    const ms = Date.now() - start;
    assert.equal(r.verdict, 'indeterminate', JSON.stringify(r));
    assert.equal(r.reason, 'command too large to analyse');
    assert.ok(ms < 100, `took ${ms}ms`);
  });

  test('28 a 5000-&& command is bounded, no exponential time, under 100ms', () => {
    const many = Array.from({ length: 5000 }, (_, i) => `echo ${i}`).join(' && ');
    const start = Date.now();
    const r = classifyWrites(many);
    const ms = Date.now() - start;
    assert.ok(r.verdict === 'indeterminate' || r.verdict === 'none' || r.verdict === 'writes',
      JSON.stringify(r.verdict));
    assert.ok(ms < 100, `took ${ms}ms`);
  });

  test('29 KNOWN false positive, asserted so the limit is recorded: echo "a > b"', () => {
    // Quote-unaware segmentation by design (a correct shell parser is a large
    // attack surface). The failing direction is toward deny, and this is the same
    // shape the old command.includes(' > ') already had.
    const r = classifyWrites('echo "a > b"');
    assert.equal(r.verdict, 'writes', JSON.stringify(r));
    assert.deepEqual(r.targets, ['b']);
  });

  test('32 adversarial inputs never throw', () => {
    const nasty = [
      'echo "unbalanced', "echo 'unbalanced", '>', '> ', 'cd', 'cd &&', 'cp a',
      'mv', 'tee', 'sed -i', 'dd', '&&', '|| >', '`', '$(', '<<', 'cd ~ && echo x > y',
      'echo x >', 'echo x >>', '   ', '\n\n', 'node', 'find', 'cd -- && echo x > z.js',
    ];
    for (const c of nasty) {
      assert.doesNotThrow(() => classifyWrites(c), `threw on: ${JSON.stringify(c)}`);
      const r = classifyWrites(c);
      assert.ok(['none', 'writes', 'indeterminate'].includes(r.verdict), `bad verdict for ${JSON.stringify(c)}`);
    }
  });
});

describe('classifyWrites — F1: a leading group/wrapper prefix no longer disables the gate', () => {
  // REGRESSION (review finding F1). `commandWord` returned a segment's FIRST token
  // verbatim, so a determinate write command or interpreter that is NOT the literal
  // first token of its segment classified as `none` and was ALLOWED — the exact class
  // this module exists to kill. Each of these was `none` (allowed) before the fix; the
  // old \b-anchored WRITE_PATTERNS blocked them. They must classify as `writes` (right
  // target where determinate) or `indeterminate` (wrapped interpreter / unreadable), and
  // NEVER `none`.
  const f1Writes = [
    ['F1a time tee', 'time tee src/x.js', ['src/x.js']],
    ['F1b (subshell) sed -i', "(sed -i 's/a/b/' src/x.js)", ['src/x.js']],
    ['F1c sudo tee', 'sudo tee f', ['f']],
    ['F1d nohup dd of=', 'nohup dd of=f', ['f']],
    ['F1f timeout + duration truncate', 'timeout 5 truncate -s0 f', ['f']],
  ];
  for (const [label, cmd, targets] of f1Writes) {
    test(`${label} -> writes (was none)`, () => {
      const r = classifyWrites(cmd);
      assert.equal(r.verdict, 'writes', `${cmd} -> ${JSON.stringify(r)}`);
      assert.deepEqual(r.targets, targets, `${cmd} targets`);
    });
  }

  test('F1e nice perl -i -> indeterminate interpreter, target still surfaced (was none)', () => {
    // `perl` is an interpreter (writes happen inside a program this gate cannot read),
    // so the verdict stays the conservative `indeterminate` even though the in-place
    // file is readable — plan Decision 3: indeterminate outranks writes. The target is
    // surfaced (true information) but the verdict is block-ward. Was `none` before F1.
    const r = classifyWrites('nice perl -i -pe s/a/b/ f');
    assert.equal(r.verdict, 'indeterminate', JSON.stringify(r));
    assert.equal(r.reason, 'interpreter');
    assert.ok(r.targets.includes('f'), `target surfaced: ${JSON.stringify(r.targets)}`);
  });

  test('F1g { patch; } group prefix -> indeterminate (was none)', () => {
    const r = classifyWrites('{ patch -p1 < c.patch; }');
    assert.equal(r.verdict, 'indeterminate', JSON.stringify(r));
    assert.equal(r.reason, 'write target could not be read');
  });

  const f1Interp = [
    ['F1h (subshell) node -e', "(node -e 'fs.writeFileSync(\"src/x.js\",\"x\")')"],
    ['F1i sudo node -e', "sudo node -e 'fs.writeFileSync(\"src/x.js\",\"x\")'"],
  ];
  for (const [label, cmd] of f1Interp) {
    test(`${label} -> indeterminate interpreter (was none)`, () => {
      const r = classifyWrites(cmd);
      assert.equal(r.verdict, 'indeterminate', `${cmd} -> ${JSON.stringify(r)}`);
      assert.equal(r.reason, 'interpreter', `${cmd} reason`);
    });
  }

  // OVER-STRIP GUARD: a wrapper before a READ command must still classify `none` —
  // the fix must not turn "every wrapped command" into a write.
  for (const cmd of ['time ls', 'sudo ls -la', 'nice cat f', 'nohup grep x f']) {
    test(`F1 over-strip guard: ${cmd} stays none`, () => {
      const r = classifyWrites(cmd);
      assert.equal(r.verdict, 'none', `${cmd} -> ${JSON.stringify(r)}`);
    });
  }

  test('F1 wrapper token as an OPERAND is not consumed as a wrapper', () => {
    // `tee time` writes to a file literally named `time`; `time` here is an operand of
    // tee, not a leading wrapper, so it must still resolve as a target.
    const r = classifyWrites('tee time');
    assert.equal(r.verdict, 'writes', JSON.stringify(r));
    assert.deepEqual(r.targets, ['time']);
  });

  test('F1 chained wrappers strip to the real command word', () => {
    const r = classifyWrites('sudo nice tee f');
    assert.equal(r.verdict, 'writes', JSON.stringify(r));
    assert.deepEqual(r.targets, ['f']);
  });

  test('F1 separate-value wrapper flag (nice -n N) does not eat the command', () => {
    const r = classifyWrites('nice -n 5 tee f');
    assert.equal(r.verdict, 'writes', JSON.stringify(r));
    assert.deepEqual(r.targets, ['f']);
  });
});

describe('splitSegments + resolveTarget — the exported helpers', () => {
  test('splitSegments splits on ; newline && || | &', () => {
    assert.deepEqual(
      splitSegments('a && b || c | d & e ; f\ng').map((s) => s.trim()),
      ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    );
  });

  test('resolveTarget resolves a literal against a cd prefix, null for non-literal', () => {
    assert.equal(resolveTarget('src/lib', 'y.js'), 'src/lib/y.js');
    assert.equal(resolveTarget('', 'y.js'), 'y.js');
    assert.equal(resolveTarget('src', '../tests/a.js'), 'tests/a.js');
    assert.equal(resolveTarget('src\\lib', 'y.js'), 'src/lib/y.js');
    assert.equal(resolveTarget('', '$VAR'), null);
    assert.equal(resolveTarget('', 'src/*.js'), null);
    assert.equal(resolveTarget('', '~/x'), null);
    assert.equal(resolveTarget('', '`f`'), null);
  });
});

// ===========================================================================
// INTEGRATION — the REAL spawned hook (src/hooks/PreToolUse.Bash.js)
// ===========================================================================

const REPO = path.resolve(__dirname, '..');
const HOOK = path.join(REPO, 'src', 'hooks', 'PreToolUse.Bash.js');
const START_MD = path.join(REPO, 'src', 'commands', 'start.md');
const stateManager = require(path.join(REPO, 'src', 'lib', 'state-manager'));

let project;

function makeProject() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-swt-')));
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# CTOC Project Instructions\n');
  for (const stage of ['vision', 'functional', 'implementation', 'todo', 'review', 'done']) {
    fs.mkdirSync(path.join(dir, 'plans', stage), { recursive: true });
  }
  return dir;
}

function cleanupProject(dir) {
  if (!dir) return;
  try { fs.rmSync(stateManager.getStatePath(dir), { force: true }); } catch { /* none */ }
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Plant valid SIGNED state through the real state-manager (never hand-written). */
function setState(step, feature = 'swt-feature') {
  const state = stateManager.createState(project, feature, 'javascript', null);
  state.currentStep = step;
  stateManager.saveState(project, state);
}

function runHook(command) {
  return spawnSync(process.execPath, [HOOK], {
    cwd: project,
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    env: { ...process.env, CLAUDE_TOOL_INPUT: '' },
    encoding: 'utf8',
  });
}

function denyOf(res) {
  const out = String(res.stdout || '');
  const start = out.indexOf('{');
  if (start === -1) return null;
  try {
    const parsed = JSON.parse(out.slice(start));
    const d = parsed && parsed.hookSpecificOutput;
    return d && d.permissionDecision === 'deny' ? d : null;
  } catch { return null; }
}

function menuRecipes() {
  const md = fs.readFileSync(START_MD, 'utf8');
  const out = [];
  const re = /`(node\s+-e\s+"[^`]*")`/g;
  let m;
  while ((m = re.exec(md)) !== null) out.push(m[1]);
  return out;
}

describe('the spawned hook — the cd-prefix bypass is closed (the defect)', () => {
  beforeEach(() => { project = makeProject(); });
  afterEach(() => { cleanupProject(project); project = null; });

  test('33 cd . && echo evil > src/x.js is DENIED at a planning step (RED before fix)', () => {
    setState(3);
    const d = denyOf(runHook('cd . && echo evil > src/x.js'));
    assert.ok(d, 'the cd-prefixed write must reach the step gate and be denied');
  });

  test('34 ls; echo evil > src/x.js is DENIED at a planning step (RED before fix)', () => {
    setState(3);
    const d = denyOf(runHook('ls; echo evil > src/x.js'));
    assert.ok(d, 'the ls-prefixed write must reach the step gate and be denied');
  });

  test('35 ls -la is ALLOWED at a planning step (a read is not a write)', () => {
    setState(3);
    const res = runHook('ls -la');
    assert.equal(denyOf(res), null, `a read must not be denied\nstdout=${res.stdout}`);
  });

  test('36 cd . && echo x > src/x.js is ALLOWED at step 10 (this slice restores the STEP gate only)', () => {
    setState(10);
    const res = runHook('cd . && echo x > src/x.js');
    assert.equal(denyOf(res), null,
      'coverage is 00202; at step 10 with a feature the step gate passes, so this must be allowed');
  });

  test('F1-int a  time tee src/x.js is DENIED at a planning step (RED before fix)', () => {
    setState(3);
    const d = denyOf(runHook('time tee src/x.js'));
    assert.ok(d, 'a wrapped write must reach the step gate and be denied');
  });

  test('F1-int b  sudo tee f is DENIED at a planning step (RED before fix)', () => {
    setState(3);
    const d = denyOf(runHook('sudo tee f'));
    assert.ok(d, 'a wrapped write must reach the step gate and be denied');
  });

  test('37 every node -e recipe from start.md is still ALLOWED at its normal step', () => {
    setState(10);
    const recipes = menuRecipes();
    assert.ok(recipes.length > 0, 'guard: start.md must yield node -e recipes to check');
    for (const r of recipes) {
      const res = runHook(r);
      assert.equal(denyOf(res), null,
        `a false positive that breaks a menu recipe is a CRITICAL regression: ${r}\nstdout=${res.stdout}`);
    }
  });
});
