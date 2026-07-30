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
      // wrapper argument exhaustion: a value-flag with no following token, and a
      // wrapper whose positional operand never arrives (both resolve to word '' -> none)
      'sudo -u', 'env -u', 'flock', 'chroot', 'sudo env -i',
    ];
    for (const c of nasty) {
      assert.doesNotThrow(() => classifyWrites(c), `threw on: ${JSON.stringify(c)}`);
      const r = classifyWrites(c);
      assert.ok(['none', 'writes', 'indeterminate'].includes(r.verdict), `bad verdict for ${JSON.stringify(c)}`);
    }
  });
});

describe('classifyWrites — wrapper flag & bareword bypass (second-round fix)', () => {
  // RESIDUAL of the same fail-open class as the cd-prefix: a wrapper
  // (env/command/exec/sudo/flock/…) whose OWN flags/operands were not consumed left
  // the FLAG (or a positional operand) as the "command word", which matched no writer
  // and fell to `none` — an ALLOW at a planning step. Each writes/executes for real.
  const writeThrough = [
    ['env -i absolute tee', 'env -i /usr/bin/tee src/x.js', ['src/x.js']],
    ['command -p tee (input redirect)', 'command -p tee src/x.js < payload', ['src/x.js']],
    ['sudo env -i tee (chained wrappers)', 'sudo env -i tee f', ['f']],
    ['flock lockfile tee', 'flock /tmp/lock tee src/x.js', ['src/x.js']],
    ['flock -w N lockfile tee', 'flock -w 5 /tmp/lock tee src/x.js', ['src/x.js']],
    ['doas tee', 'doas tee src/x.js', ['src/x.js']],
    ['doas -u root tee', 'doas -u root tee src/x.js', ['src/x.js']],
    ['chroot newroot tee', 'chroot /jail tee src/x.js', ['src/x.js']],
    ['watch tee', 'watch tee src/x.js', ['src/x.js']],
    ['watch -n N tee', 'watch -n 2 tee src/x.js', ['src/x.js']],
    ['time tee', 'time tee src/x.js', ['src/x.js']],
  ];
  for (const [label, cmd, targets] of writeThrough) {
    test(`writes through a wrapper: ${label}`, () => {
      const r = classifyWrites(cmd);
      assert.equal(r.verdict, 'writes', `${cmd} -> ${JSON.stringify(r)}`);
      assert.deepEqual(r.targets, targets, `${cmd} targets`);
    });
  }

  const interpThrough = [
    ['env -i node -e', 'env -i /usr/bin/node -e \'require("fs").writeFileSync("src/x.js","evil")\''],
    ['exec -a name node -e', 'exec -a foo node -e \'x\''],
  ];
  for (const [label, cmd] of interpThrough) {
    test(`interpreter behind a wrapper is indeterminate: ${label}`, () => {
      const r = classifyWrites(cmd);
      assert.equal(r.verdict, 'indeterminate', `${cmd} -> ${JSON.stringify(r)}`);
      assert.equal(r.reason, 'interpreter', `${cmd} reason`);
    });
  }

  test('guard: a resolved command word that is a dash-flag fails CLOSED (indeterminate)', () => {
    // After `--`, a dash-led "command" cannot be a real command word — a dash means a
    // prefix/flag was mis-parsed. Fail closed (indeterminate), never fall to `none`.
    const r = classifyWrites('sudo -- -weirdcmd src/x.js');
    assert.equal(r.verdict, 'indeterminate', JSON.stringify(r));
    assert.equal(r.reason, 'write target could not be read', JSON.stringify(r));
  });

  // The guard must NOT over-fire: a real read behind a wrapper stays `none`.
  for (const cmd of ['env -i ls', 'command ls', 'time ls', 'sudo ls -la']) {
    test(`guard does not over-fire on a read behind a wrapper: ${cmd} -> none`, () => {
      const r = classifyWrites(cmd);
      assert.equal(r.verdict, 'none', `${cmd} -> ${JSON.stringify(r)}`);
    });
  }

  test('env VAR=val assignment still resolves to the real writer (not the guard)', () => {
    const r = classifyWrites('env FOO=bar tee f');
    assert.equal(r.verdict, 'writes', JSON.stringify(r));
    assert.deepEqual(r.targets, ['f']);
  });
});

describe('classifyWrites — exec-wrapper & bare-assignment bypass (third-round fix)', () => {
  // The round-2 WRAPPERS map covered sudo/time/flock/doas/chroot/watch but dropped the
  // common exec-wrapper family (nice/timeout/nohup/stdbuf/ionice/setsid/setpriv/runuser/
  // taskset/chrt) and never handled a BARE `NAME=VALUE` prefix. Each classified `none`
  // (an ALLOW at a planning step) while running a real write via `tee`.
  const writeThrough = [
    ['nice tee', 'nice tee src/x.js', ['src/x.js']],
    ['nice -n 5 tee', 'nice -n 5 tee src/x.js', ['src/x.js']],
    ['timeout duration operand tee', 'timeout 5 tee src/x.js', ['src/x.js']],
    ['timeout -s SIG duration tee', 'timeout -s KILL 5 tee src/x.js', ['src/x.js']],
    ['timeout -k after duration tee', 'timeout -k 1 5 tee src/x.js', ['src/x.js']],
    ['nohup tee', 'nohup tee src/x.js', ['src/x.js']],
    ['stdbuf -oL attached tee', 'stdbuf -oL tee src/x.js', ['src/x.js']],
    ['stdbuf -o L spaced tee', 'stdbuf -o L tee src/x.js', ['src/x.js']],
    ['ionice tee', 'ionice tee src/x.js', ['src/x.js']],
    ['ionice -c 3 tee', 'ionice -c 3 tee src/x.js', ['src/x.js']],
    ['setsid tee', 'setsid tee src/x.js', ['src/x.js']],
    ['setpriv --reuid=1000 tee', 'setpriv --reuid=1000 tee src/x.js', ['src/x.js']],
    ['setpriv --reuid 1000 tee', 'setpriv --reuid 1000 tee src/x.js', ['src/x.js']],
    ['runuser -u foo tee', 'runuser -u foo tee src/x.js', ['src/x.js']],
    ['taskset -c cpulist tee', 'taskset -c 0 tee src/x.js', ['src/x.js']],
    ['taskset -c0 attached cpulist tee', 'taskset -c0 tee src/x.js', ['src/x.js']],
    ['taskset mask operand tee', 'taskset 0x1 tee src/x.js', ['src/x.js']],
    ['chrt priority operand tee', 'chrt 1 tee src/x.js', ['src/x.js']],
    ['bare NAME=VALUE tee', 'FOO=bar tee src/x.js', ['src/x.js']],
    ['two bare assignments tee', 'FOO=bar BAZ=qux tee src/x.js', ['src/x.js']],
    ['bare assignment before a wrapper', 'FOO=bar nice tee src/x.js', ['src/x.js']],
  ];
  for (const [label, cmd, targets] of writeThrough) {
    test(`writes through an exec-wrapper / assignment: ${label}`, () => {
      const r = classifyWrites(cmd);
      assert.equal(r.verdict, 'writes', `${cmd} -> ${JSON.stringify(r)}`);
      assert.deepEqual(r.targets, targets, `${cmd} targets`);
    });
  }

  test('env -S / --split-string is indeterminate (a re-split string, not argv)', () => {
    for (const cmd of ["env -S 'tee f'", "env --split-string='tee f'", "sudo env -S 'tee f'"]) {
      const r = classifyWrites(cmd);
      assert.equal(r.verdict, 'indeterminate', `${cmd} -> ${JSON.stringify(r)}`);
      assert.equal(r.reason, 'write target could not be read', `${cmd} reason`);
    }
  });

  // The round-2 wrappers must NOT be lost by the extension.
  const round2Kept = [
    ['sudo tee', 'sudo tee src/x.js'],
    ['time tee', 'time tee src/x.js'],
    ['flock lockfile tee', 'flock /tmp/lock tee src/x.js'],
    ['doas tee', 'doas tee src/x.js'],
    ['chroot newroot tee', 'chroot /jail tee src/x.js'],
    ['watch tee', 'watch tee src/x.js'],
  ];
  for (const [label, cmd] of round2Kept) {
    test(`round-2 wrapper still resolves: ${label}`, () => {
      const r = classifyWrites(cmd);
      assert.equal(r.verdict, 'writes', `${cmd} -> ${JSON.stringify(r)}`);
      assert.deepEqual(r.targets, ['src/x.js'], `${cmd} targets`);
    });
  }

  // Over-fire guard: a real READ behind an exec-wrapper / assignment must stay `none`.
  for (const cmd of [
    'nice ls', 'nice -n 5 ls', 'timeout 5 ls', 'nohup ls', 'stdbuf -oL ls',
    'ionice ls', 'setsid ls', 'taskset -c 0 ls', 'taskset 0x1 ls', 'chrt 1 ls',
    'FOO=bar ls', 'FOO=bar BAZ=qux ls', 'env -i ls',
  ]) {
    test(`over-fire guard — read stays none: ${cmd}`, () => {
      const r = classifyWrites(cmd);
      assert.equal(r.verdict, 'none', `${cmd} -> ${JSON.stringify(r)}`);
    });
  }
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

  test('36 cd . && echo x > src/x.js is DENIED at step 10 (00202 now enforces coverage)', () => {
    setState(10);
    const d = denyOf(runHook('cd . && echo x > src/x.js'));
    // 00202 SHIPPED: past the step gate, a determinate write to an UNCOVERED source
    // file is denied by the plan-coverage stage. This fixture declares no covering
    // plan, so src/x.js is uncovered. (Before 00202 the shell channel enforced no
    // coverage and this was allowed — the now-closed bypass.)
    assert.ok(d, 'the cd-prefixed determinate write is uncovered, so 00202 must deny it');
    assert.match(d.permissionDecisionReason || '', /no approved plan covers/i,
      'the deny is the coverage stage, not a step/feature block');
  });

  test('38 env -i /usr/bin/tee src/x.js is DENIED at a planning step (RED before fix)', () => {
    setState(3);
    const d = denyOf(runHook('env -i /usr/bin/tee src/x.js'));
    assert.ok(d, 'a writer behind an unconsumed wrapper flag must reach the step gate and be denied');
  });

  test('39 command -p tee src/x.js is DENIED at a planning step (RED before fix)', () => {
    setState(3);
    const d = denyOf(runHook('command -p tee src/x.js'));
    assert.ok(d, 'a writer behind command -p must reach the step gate and be denied');
  });

  test('40 nice tee src/x.js is DENIED at a planning step (exec-wrapper bypass, RED before fix)', () => {
    setState(3);
    const d = denyOf(runHook('nice tee src/x.js'));
    assert.ok(d, 'a writer behind an exec-wrapper (nice) must reach the step gate and be denied');
  });

  test('41 FOO=bar tee src/x.js is DENIED at a planning step (bare assignment bypass, RED before fix)', () => {
    setState(3);
    const d = denyOf(runHook('FOO=bar tee src/x.js'));
    assert.ok(d, 'a writer behind a bare NAME=VALUE prefix must reach the step gate and be denied');
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
