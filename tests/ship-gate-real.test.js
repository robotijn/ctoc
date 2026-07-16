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

// R4-A item 11 — the fence must catch EVERY git-push idiom, not just the
// `execSync('git push')` string form. This codebase prefers the argv-array idiom
// (spawn('git', ['push', ...]) / execFile / runFile('git', ['push'])), which the
// old shallow regex silently missed. `hasUngatedPush` is the widened matcher.
//
// @param {string} text - file source
// @returns {boolean} true iff the file reaches `git push` without consulting the gate
function hasUngatedPush(text) {
  // (a) the shell-string form: execSync('git push ...') / runCommand('git push')
  const stringForm = /(?:execSync|execFileSync|exec|runCommand)\s*\(\s*[`'"]git\s+push/;
  // (b) the argv-array form: <spawner>('git', [ ... 'push' ... ]) — any spawner,
  //     any element order. Matches spawn/spawnSync/execFile/execFileSync/runFile/
  //     runCommand where the command is 'git' and an argv element is 'push'.
  const argvForm = /(?:spawn|spawnSync|execFile|execFileSync|runFile|runCommand)\s*\(\s*[`'"]git[`'"]\s*,\s*\[[^\]]*[`'"]push[`'"]/;
  const reachesPush = stringForm.test(text) || argvForm.test(text);
  return reachesPush && !/isAutoPushEnabled/.test(text);
}

test('ship-gate: hasUngatedPush catches the argv-array idiom the old fence missed', () => {
  // The argv-array forms this codebase actually uses — all ungated, all must flag.
  assert.ok(hasUngatedPush("spawn('git', ['push', 'origin', 'main'])"), 'spawn argv form');
  assert.ok(hasUngatedPush("spawnSync('git', ['push'])"), 'spawnSync argv form');
  assert.ok(hasUngatedPush("execFile('git', ['push', '--force'])"), 'execFile argv form');
  assert.ok(hasUngatedPush("runFile('git', ['push', 'origin', 'HEAD'])"), 'runFile argv form');
  // The old string form must still flag.
  assert.ok(hasUngatedPush("execSync('git push origin main')"), 'legacy string form');
  // Gated call sites (consult isAutoPushEnabled) do NOT flag.
  assert.ok(!hasUngatedPush("if (isAutoPushEnabled(root)) spawn('git', ['push'])"), 'gated argv form is fine');
  // Non-push git calls do NOT flag.
  assert.ok(!hasUngatedPush("spawn('git', ['status'])"), 'a non-push git call is fine');
  assert.ok(!hasUngatedPush("spawn('git', ['diff', '--name-only'])"), 'git diff is fine');
});

test('ship-gate: no source file hardcodes an ungated push', () => {
  // Every `git push` in src/ must sit in a file that also consults the canonical
  // gate — or be the human's own sanctioned command (/ctoc:push) or a deploy path
  // (guarded by its own ship_gate_confirmed flag).
  const SANCTIONED = new Set([
    path.join('src', 'commands', 'push.js'),      // the human ship gate itself
    path.join('src', 'lib', 'deployment.js'),     // deploy gate: ship_gate_confirmed
    path.join('src', 'hooks', 'PreToolUse.Bash.js'), // detects pushes, never runs one
  ]);
  const offenders = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.js')) continue;
      const rel = path.relative(ROOT, p);
      if (SANCTIONED.has(rel)) continue;
      const t = fs.readFileSync(p, 'utf8');
      if (hasUngatedPush(t)) {
        offenders.push(rel);
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  assert.deepStrictEqual(offenders, [], 'every push call site must consult the ship gate');
});

// ── 6. refineLoop stops self-approving (Goodhart) ────────────────────────────

test('ship-gate: refineLoop never returns status "approved" (it approves nothing)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/lib/iron-loop.js'), 'utf8');
  assert.ok(!/status:\s*'approved'/.test(src),
    'refineLoop must not label its own critic score an approval — only a human approves');
  assert.ok(/status:\s*'score-passed'/.test(src),
    'the non-authoritative status must be score-passed');
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

    assert.strictEqual(enforcer.checkGateDestinationsApproved(dir), null,
      'a ledger-backed plan is clean — the enforcer and the hook must agree');
  } finally { rm(dir); }
});
