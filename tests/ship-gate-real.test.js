/**
 * R3-C — THE SHIP-GATE TEST.
 *
 * The human decided: push is a human ship gate. A gate a machine can cross is
 * not a gate. This suite is the fence: with DEFAULT settings, NO CTOC code path
 * reaches `git push`. Every automatic push path (the quality agent's on-success
 * hook, the post-commit hook's argv, the sync timer, the plan-operation
 * auto-push, the dashboard's full sync) is driven here with a spy on the git
 * executor and asserted to produce ZERO push invocations.
 *
 * The ONLY sanctioned pushes are the human's own: `/ctoc:push` (src/commands/push.js
 * calls pushToRemote directly — the human's keypress IS the gate decision), and any
 * path after the human explicitly sets the canonical opt-in `git.autoPushEnabled`.
 *
 * Canonical setting: `git.autoPushEnabled` (default FALSE). It is the ONLY key
 * that gates a push. `sync.auto_push` and `git.commitAndPush` are DEAD (placebos:
 * written and toggled, read by nothing) and must not come back.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');

// ── temp project helpers ─────────────────────────────────────────────────────

function mkProject(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-shipgate-'));
  fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
  if (settings) {
    fs.writeFileSync(
      path.join(dir, '.ctoc', 'settings.json'),
      JSON.stringify(settings, null, 2)
    );
  }
  return dir;
}

function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}

/**
 * Patch child_process.execSync with a spy, then load the module under test FRESH
 * (modules destructure `execSync` at require time, so the patch must precede the
 * require). Returns { mod, calls, restore }.
 */
function withGitSpy(modulePath, impl) {
  const calls = [];
  const originalExecSync = cp.execSync;
  const originalExecFileSync = cp.execFileSync;
  const record = (cmdStr, opts) => {
    calls.push(cmdStr);
    return impl ? impl(cmdStr, opts) : '';
  };
  // sync.js now runs git argv-safe via execFileSync('git', [...args], opts) — no
  // shell. Reconstruct the equivalent command string so the dirtyGit/pushes()
  // matchers still work. execSync is spied too (other modules / legacy callers).
  cp.execSync = (cmd, opts) => record(String(cmd), opts);
  cp.execFileSync = (file, args, opts) =>
    Array.isArray(args)
      ? record(`${file} ${args.join(' ')}`, opts)
      : record(String(file), args);
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
  const mod = require(modulePath);
  return {
    mod,
    calls,
    pushes: () => calls.filter(c => /\bgit\s+push\b/.test(c)),
    restore() {
      cp.execSync = originalExecSync;
      cp.execFileSync = originalExecFileSync;
      delete require.cache[resolved];
    }
  };
}

// A git status that always reports dirty plans/ so every path proceeds as far as
// it possibly can toward a push. If a push is reachable, this WILL reach it.
const dirtyGit = (cmd) => {
  if (/git status --porcelain/.test(cmd)) return ' M plans/x.md\n';
  if (/rev-parse --abbrev-ref/.test(cmd)) return 'main\n';
  if (/git log /.test(cmd)) return '';
  if (/git diff /.test(cmd)) return '';
  return '';
};

// ── 1. THE CANONICAL SETTING ─────────────────────────────────────────────────

test('ship-gate: git.autoPushEnabled is the canonical key and defaults to FALSE', () => {
  const settings = require(path.join(ROOT, 'src/lib/settings.js'));
  const keys = settings.SETTINGS_SCHEMA.git.settings.map(s => s.key);

  assert.ok(keys.includes('autoPushEnabled'), 'git.autoPushEnabled must exist in the schema');
  const def = settings.SETTINGS_SCHEMA.git.settings.find(s => s.key === 'autoPushEnabled');
  assert.strictEqual(def.default, false, 'the ship gate is CLOSED by default');

  const dir = mkProject(null);
  try {
    assert.strictEqual(settings.getSetting('git', 'autoPushEnabled', dir), false);
    assert.strictEqual(settings.isAutoPushEnabled(dir), false, 'no settings file → gate closed');
  } finally { rm(dir); }
});

test('ship-gate: isAutoPushEnabled is true ONLY on an explicit human opt-in', () => {
  const settings = require(path.join(ROOT, 'src/lib/settings.js'));
  const on = mkProject({ git: { autoPushEnabled: true } });
  const off = mkProject({ git: { autoPushEnabled: false } });
  try {
    assert.strictEqual(settings.isAutoPushEnabled(on), true);
    assert.strictEqual(settings.isAutoPushEnabled(off), false);
  } finally { rm(on); rm(off); }
});

test('ship-gate: NO environment profile may open the push gate', () => {
  const settings = require(path.join(ROOT, 'src/lib/settings.js'));
  for (const [env, profile] of Object.entries(settings.ENVIRONMENT_PROFILES)) {
    assert.notStrictEqual(
      profile.git?.autoPushEnabled, true,
      `profile '${env}' must not enable auto-push — a profile may never cross a human gate`
    );
    const dir = mkProject({ general: { environment: env } });
    try {
      assert.strictEqual(
        settings.isAutoPushEnabled(dir), false,
        `environment '${env}' must leave the push gate closed`
      );
    } finally { rm(dir); }
  }
});

test('ship-gate: the placebo keys are GONE (no key exists that nothing reads)', () => {
  const settings = require(path.join(ROOT, 'src/lib/settings.js'));
  const gitKeys = settings.SETTINGS_SCHEMA.git.settings.map(s => s.key);
  assert.ok(!gitKeys.includes('commitAndPush'), 'git.commitAndPush had ZERO readers — must be deleted');
  for (const [env, profile] of Object.entries(settings.ENVIRONMENT_PROFILES)) {
    assert.ok(
      !(profile.git && 'commitAndPush' in profile.git),
      `profile '${env}' still sets the dead key git.commitAndPush`
    );
  }

  // sync.auto_push was read by sync.js while init wrote push.auto_push — two
  // different keys, so the visible switch was a placebo. No source may read it.
  const srcFiles = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) srcFiles.push(p);
    }
  };
  walk(path.join(ROOT, 'src'));
  const offenders = srcFiles.filter(f => {
    const t = fs.readFileSync(f, 'utf8');
    return /getSetting\(\s*['"]sync['"]\s*,\s*['"]auto_push['"]/.test(t) ||
           /getSetting\(\s*['"]git['"]\s*,\s*['"]commitAndPush['"]/.test(t);
  });
  assert.deepStrictEqual(offenders, [], 'no code may read the deleted placebo keys');
});

test('ship-gate: the canonical key has at least one real reader (reachability)', () => {
  const readers = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) {
        const t = fs.readFileSync(p, 'utf8');
        if (/isAutoPushEnabled|autoPushEnabled/.test(t) && !p.endsWith(path.join('lib', 'settings.js'))) {
          readers.push(path.relative(ROOT, p));
        }
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  assert.ok(readers.length >= 3,
    `the canonical key must be read by every push path; readers found: ${readers.join(', ')}`);
});

// ── 2. QUALITY AGENT (post-commit's on-success path) ─────────────────────────

test('ship-gate: quality-agent success path does NOT push with default settings', () => {
  const dir = mkProject(null);
  const spy = withGitSpy(path.join(ROOT, 'src/lib/quality-agent.js'), dirtyGit);
  try {
    // Even when explicitly asked to push by argv, the SETTING is the gate.
    const res = spy.mod.maybePushOnSuccess({ onSuccess: 'push' }, dir);
    assert.strictEqual(res.pushed, false, 'must not push with the gate closed');
    assert.match(res.reason, /auto-push|gate|disabled/i);
    assert.deepStrictEqual(spy.pushes(), [], 'ZERO git push invocations with default settings');
  } finally { spy.restore(); rm(dir); }
});

test('ship-gate: quality-agent DOES push when the human opted in', () => {
  const dir = mkProject({ git: { autoPushEnabled: true } });
  const spy = withGitSpy(path.join(ROOT, 'src/lib/quality-agent.js'), dirtyGit);
  try {
    const res = spy.mod.maybePushOnSuccess({ onSuccess: 'push' }, dir);
    assert.strictEqual(res.pushed, true);
    assert.strictEqual(spy.pushes().length, 1, 'exactly one push when opted in');
  } finally { spy.restore(); rm(dir); }
});

test('ship-gate: quality-agent parses --on-success default as none, never push', () => {
  const qa = require(path.join(ROOT, 'src/lib/quality-agent.js'));
  assert.strictEqual(qa.parseArgs([]).onSuccess, 'none', 'default on-success must NOT be push');
  assert.strictEqual(qa.parseArgs(['--on-success=push']).onSuccess, 'push');
});

test('ship-gate: a rejected push NEVER triggers a machine pull --rebase', () => {
  const dir = mkProject({ git: { autoPushEnabled: true } });
  const spy = withGitSpy(path.join(ROOT, 'src/lib/quality-agent.js'), (cmd) => {
    if (/\bgit\s+push\b/.test(cmd)) {
      const e = new Error('failed to push some refs — updates were rejected (non-fast-forward)');
      throw e;
    }
    return dirtyGit(cmd);
  });
  try {
    const ok = spy.mod.pushToRemote();
    assert.strictEqual(ok, false, 'a rejected push fails LOUDLY, it does not self-heal');
    const rebases = spy.calls.filter(c => /pull\s+--rebase/.test(c));
    assert.deepStrictEqual(rebases, [], 'a machine must NEVER rewrite history unattended');
    assert.strictEqual(spy.pushes().length, 1, 'no silent retry push');
  } finally { spy.restore(); rm(dir); }
});

// ── 3. POST-COMMIT HOOK (argv) ───────────────────────────────────────────────

test('ship-gate: post-commit hook argv carries no push by default', () => {
  const hook = require(path.join(ROOT, 'src/hooks/post-commit.js'));
  const dir = mkProject(null);
  try {
    const args = hook.buildAgentArgs(dir);
    assert.ok(!args.includes('--on-success=push'),
      `post-commit must not hardcode a push: ${JSON.stringify(args)}`);
    assert.ok(args.includes('--on-success=none'), 'the closed gate is explicit in argv');
  } finally { rm(dir); }
});

test('ship-gate: post-commit hook argv carries push ONLY on explicit opt-in', () => {
  const hook = require(path.join(ROOT, 'src/hooks/post-commit.js'));
  const dir = mkProject({ git: { autoPushEnabled: true } });
  try {
    assert.ok(hook.buildAgentArgs(dir).includes('--on-success=push'));
  } finally { rm(dir); }
});

// ── 4. SYNC (the 5-minute timer, plan operations, dashboard sync) ────────────

test('ship-gate: sync timer path (syncPlans) does NOT push with default settings', () => {
  const dir = mkProject(null);
  const spy = withGitSpy(path.join(ROOT, 'src/lib/sync.js'), dirtyGit);
  try {
    spy.mod.syncPlans(dir);
    assert.deepStrictEqual(spy.pushes(), [], 'the 5-minute timer must never push');
  } finally { spy.restore(); rm(dir); }
});

test('ship-gate: startAutoSync (menu open) does NOT push with default settings', () => {
  const dir = mkProject(null);
  const spy = withGitSpy(path.join(ROOT, 'src/lib/sync.js'), dirtyGit);
  try {
    spy.mod.startAutoSync(dir);   // runs an immediate sync, then arms the timer
    spy.mod.stopAutoSync();
    assert.deepStrictEqual(spy.pushes(), [], 'opening the menu must never push');
  } finally { spy.restore(); rm(dir); }
});

test('ship-gate: sync auto_push defaults to FALSE and follows the canonical key', () => {
  const off = mkProject(null);
  const on = mkProject({ git: { autoPushEnabled: true } });
  const spy = withGitSpy(path.join(ROOT, 'src/lib/sync.js'), dirtyGit);
  try {
    assert.strictEqual(spy.mod.getSyncConfig(off).auto_push, false);
    assert.strictEqual(spy.mod.getSyncConfig(on).auto_push, true);

    const r = spy.mod.autoPush(off);
    assert.strictEqual(r.pushed, false);
    assert.deepStrictEqual(spy.pushes(), []);

    spy.calls.length = 0;
    assert.strictEqual(spy.mod.autoPush(on).pushed, true);
    assert.strictEqual(spy.pushes().length, 1);
  } finally { spy.restore(); rm(off); rm(on); }
});

test('ship-gate: onPlanOperation (every plan create/edit/approve) does NOT push', () => {
  const dir = mkProject(null);
  const spy = withGitSpy(path.join(ROOT, 'src/lib/sync.js'), dirtyGit);
  try {
    spy.mod.onPlanOperation('approve', 'some-plan', dir, { from: 'todo', to: 'in-progress' });
    assert.deepStrictEqual(spy.pushes(), [], 'a plan move must never push');
  } finally { spy.restore(); rm(dir); }
});

test('ship-gate: fullPlansSync commits but does NOT push with the gate closed', () => {
  const dir = mkProject(null);
  const spy = withGitSpy(path.join(ROOT, 'src/lib/sync.js'), dirtyGit);
  try {
    const res = spy.mod.fullPlansSync(dir);
    assert.strictEqual(res.pushed, false);
    assert.deepStrictEqual(spy.pushes(), [], 'the dashboard sync must never push');
  } finally { spy.restore(); rm(dir); }
});

test('ship-gate: fullPlansSync pushes when the human opted in', () => {
  const dir = mkProject({ git: { autoPushEnabled: true } });
  const spy = withGitSpy(path.join(ROOT, 'src/lib/sync.js'), dirtyGit);
  try {
    const res = spy.mod.fullPlansSync(dir);
    assert.strictEqual(res.pushed, true);
    assert.strictEqual(spy.pushes().length, 1);
  } finally { spy.restore(); rm(dir); }
});

// ── 5. NO ENVIRONMENT VARIABLE MAY OPEN THE GATE (Step 13 SECURE) ────────────

test('ship-gate: CTOC_SKIP_QUALITY stays a SKIP — it can never enable a push', () => {
  const before = process.env.CTOC_SKIP_QUALITY;
  process.env.CTOC_SKIP_QUALITY = '1';
  const dir = mkProject(null);
  const spy = withGitSpy(path.join(ROOT, 'src/lib/quality-agent.js'), dirtyGit);
  try {
    const res = spy.mod.maybePushOnSuccess({ onSuccess: 'push' }, dir);
    assert.strictEqual(res.pushed, false);
    assert.deepStrictEqual(spy.pushes(), []);
  } finally {
    spy.restore(); rm(dir);
    if (before === undefined) delete process.env.CTOC_SKIP_QUALITY;
    else process.env.CTOC_SKIP_QUALITY = before;
  }
});

// R3-C rework (finding 4) — the fence must protect the INVARIANT, not the
// arrangement. The previous matcher decided a whole FILE was safe if the token
// `isAutoPushEnabled` appeared ANYWHERE in it, so a SECOND ungated `git push`
// added to sync.js / quality-agent.js / post-commit.js (all of which already
// carry that token) sailed through with zero test failures — the same
// "a citation is not an invocation" defect the reachability fence was bitten by.
// It also whitelisted deployment.js and PreToolUse.Bash.js BY NAME with no
// assertion that they gate anything.
//
// The fence is now PER-CALL-SITE and scope-aware:
//   1. Find every `git push` INVOCATION (three idioms: the shell-string form,
//      the argv-array spawner form, and this codebase's local `git([...'push'])`
//      wrapper — the wrapper idiom the old regex did not even recognise).
//   2. For EACH site, extract its ENCLOSING FUNCTION and require that function's
//      body to consult a real ship-gate signal — not merely somewhere in the file.
//   3. A push primitive whose gating lives in its CALLERS (quality-agent's
//      `pushToRemote`, reached only by the gated `maybePushOnSuccess` and by the
//      human's own `/ctoc:push`) is exempt HERE and asserted by call-graph below,
//      replacing the bare name-whitelist with a positive claim.
//
// Recognised in-scope gate signals, each a real gate in this repo:
//   isAutoPushEnabled / autoPushEnabled — the canonical push key
//   auto_push                           — sync's local `config.auto_push` alias, bound to it
//   isLive                              — deployment.js's live/dry-run gate
const GATE_SIGNAL = /isAutoPushEnabled|autoPushEnabled|auto_push|\bisLive\b/;
const PUSH_PRIMITIVES = new Set(['pushToRemote']);

// Balanced-delimiter match: index of the `close` that pairs the first `open` at/after `start`.
function matchDelim(text, start, open, close) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// The three `git push` invocation idioms. Precise about INVOCATION: a string
// comparison like `sub === 'push'` (PreToolUse.Bash.js detects pushes) or a bare
// mention in a comment is NOT an invocation and must not match.
function pushSiteIndices(text) {
  const idxs = [];
  const patterns = [
    // (a) shell-string form: execSync('git push ...') / runCommand('git push')
    /(?:execSync|execFileSync|exec|runCommand)\s*\(\s*[`'"]git\s+push/g,
    // (b) argv-array spawner form: <spawner>('git', [ ... 'push' ... ])
    /(?:spawn|spawnSync|execFile|execFileSync|runFile|runCommand)\s*\(\s*[`'"]git[`'"]\s*,\s*\[[^\]]*[`'"]push[`'"]/g,
    // (c) local wrapper form: git([ ... 'push' ... ]) — the idiom sync.js uses
    /\bgit\s*\(\s*\[[^\]]*[`'"]push[`'"]/g,
  ];
  for (const re of patterns) { let m; while ((m = re.exec(text))) idxs.push(m.index); }
  return idxs;
}

// The innermost `function NAME(...) { ... }` whose body brace-range contains idx.
// Skips the parameter list (so a default like `opts = {}` is not mistaken for the
// body) before matching the body braces.
function enclosingFunction(text, idx) {
  const fnRe = /\bfunction\b/g;
  let m, best = null;
  while ((m = fnRe.exec(text)) && m.index < idx) {
    const paren = text.indexOf('(', m.index);
    if (paren === -1) continue;
    const paramEnd = matchDelim(text, paren, '(', ')');
    if (paramEnd === -1) continue;
    const open = text.indexOf('{', paramEnd);
    if (open === -1) continue;
    const end = matchDelim(text, open, '{', '}');
    if (end === -1) continue;
    if (idx >= open && idx <= end) {
      const nameM = text.slice(m.index, open).match(/function\s+([A-Za-z0-9_$]+)/);
      best = { name: nameM ? nameM[1] : '(anonymous)', open, end };
    }
  }
  return best;
}

// The per-call-site verdict: names every push whose enclosing function does not
// consult a gate signal (and is not a caller-gated primitive). Empty === clean.
function ungatedPushSites(text) {
  const offenders = [];
  for (const idx of pushSiteIndices(text)) {
    const fn = enclosingFunction(text, idx);
    if (!fn) { offenders.push('(top-level push — no enclosing function)'); continue; }
    if (PUSH_PRIMITIVES.has(fn.name)) continue; // caller-gated; asserted by call-graph test
    if (!GATE_SIGNAL.test(text.slice(fn.open, fn.end + 1))) offenders.push(fn.name);
  }
  return offenders;
}

test('ship-gate: the fence flags a SECOND ungated push even in an already-gated file', () => {
  // The exact regression the old whole-file token check missed: one function gates,
  // a second function in the SAME file pushes ungated. Per-scope catches it.
  const twoFn =
    "function gated(root){ if(!isAutoPushEnabled(root)) return; runCommand('git push origin main'); }\n" +
    "function sneaky(root){ runCommand('git push origin main'); }";
  assert.deepStrictEqual(ungatedPushSites(twoFn), ['sneaky'],
    'a push in an ungated function must flag even when another function in the file gates');

  // The local wrapper idiom git([...'push'...]) the old argv regex did not recognise.
  assert.deepStrictEqual(ungatedPushSites("function foo(){ git(['push','origin','main'],{cwd}); }"), ['foo'],
    'the git([...]) wrapper form must be recognised as a push');

  // Every invocation idiom, ungated, must flag.
  assert.deepStrictEqual(ungatedPushSites("function a(){ spawn('git', ['push', 'origin']); }"), ['a']);
  assert.deepStrictEqual(ungatedPushSites("function b(){ execFile('git', ['push', '--force']); }"), ['b']);
  assert.deepStrictEqual(ungatedPushSites("function c(){ execSync('git push origin main'); }"), ['c']);

  // Gated forms (in-scope signal present) do NOT flag — including the default-param
  // shape and each recognised gate signal.
  assert.deepStrictEqual(ungatedPushSites("function d(root){ if(!isAutoPushEnabled(root)) return; git(['push']); }"), []);
  assert.deepStrictEqual(ungatedPushSites("function e(opts = {}){ if(!isLive(opts)) return; runFile('git',['push','o','m'],opts); }"), []);
  assert.deepStrictEqual(ungatedPushSites("function f(root){ const c=getSyncConfig(root); if(!c.auto_push) return; git(['push']); }"), []);

  // A non-push git call and a mere string comparison never flag.
  assert.deepStrictEqual(ungatedPushSites("function g(){ git(['status']); }"), []);
  assert.deepStrictEqual(ungatedPushSites("function h(sub){ if (sub === 'push') return true; }"), []);
});

test('ship-gate: no source file has an ungated push at ANY call site (per-scope)', () => {
  // No name-whitelist: every push INVOCATION in src/ must sit in a function that
  // consults a ship-gate signal, or be a caller-gated primitive. push.js and
  // PreToolUse.Bash.js are not listed here — they simply contain no push INVOCATION
  // (push.js routes through the primitive; PreToolUse only string-detects), so the
  // scanner exempts them by fact, not by name.
  const offenders = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.js')) continue;
      const sites = ungatedPushSites(fs.readFileSync(p, 'utf8'));
      if (sites.length) offenders.push(`${path.relative(ROOT, p)}: ${sites.join(', ')}`);
    }
  };
  walk(path.join(ROOT, 'src'));
  assert.deepStrictEqual(offenders, [], 'every push call site must consult the ship gate in its own scope');
});

test('ship-gate: every caller of the pushToRemote primitive is gated or the human command', () => {
  // Positive assertion replacing the old push.js name-whitelist: pushToRemote is a
  // primitive (its own body holds the raw `git push`), safe ONLY because every
  // caller gates it. Assert exactly that — a new ungated caller must break this.
  const HUMAN_CMD = path.join('src', 'commands', 'push.js');
  const offenders = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.js')) continue;
      const rel = path.relative(ROOT, p);
      const text = fs.readFileSync(p, 'utf8');
      const re = /\bpushToRemote\s*\(/g;
      let m;
      while ((m = re.exec(text))) {
        if (/function\s+$/.test(text.slice(Math.max(0, m.index - 20), m.index))) continue; // the definition
        if (rel === HUMAN_CMD) continue; // the human's keypress IS the gate
        const fn = enclosingFunction(text, m.index);
        const body = fn ? text.slice(fn.open, fn.end + 1) : '';
        if (!/isAutoPushEnabled/.test(body)) offenders.push(`${rel}:${fn ? fn.name : '(top-level)'}`);
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  assert.deepStrictEqual(offenders, [], 'a machine caller of pushToRemote must consult isAutoPushEnabled');
});

test('ship-gate: the deploy trigger is a per-crossing human stamp, not a standing flag', () => {
  // Positive assertion replacing the old deployment.js name-whitelist. deployment.js's
  // push sites are gated in-scope by isLive() (covered by the per-scope scan above);
  // the DEPLOY decision itself is gated in actions.js by the per-crossing
  // `options.deploy === true` stamp — never a persisted config flag, which would
  // permanently disarm the gate. (The old ship_gate_confirmed config field was a
  // standing flag with NO code reader; it was dropped in v6.13.42 — the next test
  // fences it dead.)
  const actions = fs.readFileSync(path.join(ROOT, 'src/lib/actions.js'), 'utf8');
  assert.match(actions, /options\.deploy\s*===\s*true/,
    'the deploy trigger must be a per-crossing stamp on the approval call');
  assert.match(actions, /if\s*\(\s*options\.deploy\s*===\s*true\s*\)[\s\S]{0,400}runDeploymentPipeline/,
    'runDeploymentPipeline must run ONLY under the per-crossing deploy stamp');
});

test('ship-gate: the dead ship_gate_confirmed field stays dead — no src reader, no doc claim it is read', () => {
  // deployment.ship_gate_confirmed was a STANDING config flag with ZERO code readers;
  // the per-crossing `options.deploy === true` stamp in actions.js superseded it (a
  // persisted flag would permanently disarm the deploy gate — a setting, not a gate).
  // It was dropped in v6.13.42. This fence keeps it dropped: it must never reappear as
  // a src reader, and no doc may reintroduce the false claim that src/lib/actions.js
  // consults it before a deploy.
  const srcHits = [];
  const walkSrc = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walkSrc(p);
      else if (e.name.endsWith('.js') && /ship_gate_confirmed/.test(fs.readFileSync(p, 'utf8'))) {
        srcHits.push(path.relative(ROOT, p));
      }
    }
  };
  walkSrc(path.join(ROOT, 'src'));
  assert.deepStrictEqual(srcHits, [], 'ship_gate_confirmed must have NO reader in src');

  for (const rel of ['agents/infrastructure/deployment-setup.md', 'docs/IRON_LOOP.md']) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(!/ship_gate_confirmed/.test(text),
      `${rel} must not reference the dropped ship_gate_confirmed field`);
  }
});

// ── 6. refineLoop stops self-approving (Goodhart) ────────────────────────────

// The positive assertion was RETARGETED, never loosened. It required the literal
// `status: 'score-passed'` to be PRESENT — the string that was honest when it
// replaced 'approved'. The status has since become MORE honest ('not-evaluated':
// the loop grades nothing, so it reports nothing), which to the old assertion read
// as the anti-gaming property having been REMOVED. That was a FALSE RED, and the
// cheap escape — deleting or loosening the assertion — is exactly the failure this
// gate exists to catch. Instead: the 'approved' negative is byte-identical to
// before, the positive names the new non-authoritative status, and a THIRD
// assertion pins that the old grading status cannot come back. Three properties
// where there were two: strictly stricter.
test('ship-gate: refineLoop never returns status "approved" (it approves nothing)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/lib/iron-loop.js'), 'utf8');
  assert.ok(!/status:\s*'approved'/.test(src),
    'refineLoop must not label its own critic score an approval — only a human approves');
  assert.ok(/status:\s*'not-evaluated'/.test(src),
    'the non-authoritative status must be not-evaluated');
  assert.ok(!/status:\s*'score-passed'/.test(src),
    'the grading status must not come back — this loop computed its scores by grepping ' +
    'the boilerplate template it had itself just appended to the plan');
});

test('ship-gate: docs no longer claim auto_approve_after_max', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'docs/IRON_LOOP.md'), 'utf8');
  assert.ok(!/auto_approve_after_max/.test(doc),
    'a documented auto-approval with zero code consumers is a lie about the gates');
});

// ── 7. Enforcer stops trusting forgeable frontmatter markers ─────────────────

test('ship-gate: enforcer reports a forged approval marker with no ledger entry', () => {
  const enforcer = require(path.join(ROOT, 'src/lib/iron-loop-enforcer.js'));
  assert.strictEqual(typeof enforcer.checkGateDestinationsApproved, 'function',
    'the gate-destination check must be testable');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-forge-'));
  try {
    fs.mkdirSync(path.join(dir, 'plans', 'todo'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'plans', 'todo', 'forged.md'),
      '---\ntitle: "forged"\napproved_by: human\n---\n\n# forged\n');

    const finding = enforcer.checkGateDestinationsApproved(dir);
    assert.ok(finding, 'a plan with a forged marker and NO ledger entry must be reported');
    assert.strictEqual(finding.clean, false, 'the verdict must say so explicitly, not by being truthy');
    assert.strictEqual(finding.severity, 'block');
    assert.ok(JSON.stringify(finding.details).includes('forged.md'));
  } finally { rm(dir); }
});

test('ship-gate: enforcer accepts a plan the LEDGER approves', () => {
  const enforcer = require(path.join(ROOT, 'src/lib/iron-loop-enforcer.js'));
  const ledger = require(path.join(ROOT, 'src/lib/approval-ledger.js'));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-ledger-'));
  try {
    fs.mkdirSync(path.join(dir, 'plans', 'todo'), { recursive: true });
    const planPath = path.join(dir, 'plans', 'todo', 'real.md');
    const content = '---\ntitle: "real"\napproved_by: human\n---\n\n# real\n';
    fs.writeFileSync(planPath, content);

    ledger.writeEntry(ledger.slugFromPlanPath(planPath), {
      stage_from: 'implementation',
      stage_to: 'todo',
      content_sha256: ledger.computeContentHash(content),
      approved_by: 'human'
    }, dir);

    assert.strictEqual(enforcer.checkGateDestinationsApproved(dir).clean, true,
      'a ledger-backed plan is clean — the enforcer and the hook must agree');
  } finally { rm(dir); }
});
