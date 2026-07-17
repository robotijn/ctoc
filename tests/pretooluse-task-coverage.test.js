'use strict';

/**
 * THE TASK-LAUNCH FENCE — hook-level behavior tests for `PreToolUse.Task.js` and
 * its release partner `SubagentStop.js`.
 *
 * What these prove is the thing the semaphore alone cannot: that the cap is
 * MECHANICAL. `src/lib/agent-slots.js` can count perfectly and still be bypassed
 * if nothing consults it on the launch path — which was exactly the state of the
 * world before this hook existed (`task-registry` enforced the cap only for work
 * that opted into `menu task add`).
 *
 * Driven the way the sibling `pretooluse-edit-coverage.test.js` drives its hook:
 * the REAL detector, REAL escape-phrase library, REAL deny-signal, REAL
 * enforcement log and REAL slot store, against REAL temp project roots. The only
 * doubles are at the genuine process boundary (`process.exit`, stdout, stderr,
 * cwd), so a BLOCK's `emitDeny` is observed instead of killing the test runner.
 *
 * Cross-platform: path.join / os.tmpdir / fs; fixtures removed in after().
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const taskHook = require(path.join(REPO, 'src', 'hooks', 'PreToolUse.Task.js'));
const subagentStop = require(path.join(REPO, 'src', 'hooks', 'SubagentStop.js'));
const agentSlots = require(path.join(REPO, 'src', 'lib', 'agent-slots.js'));

const { MAX_CONCURRENT } = agentSlots;

const createdRoots = [];

function mkFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-pretask-'));
  createdRoots.push(root);
  return root;
}

/** Write a CTOC project marker (.ctoc/ dir + a marked CLAUDE.md) into `root`. */
function markCtoc(root) {
  fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'CLAUDE.md'),
    '# CTOC Project Instructions\n\nmarker for the detector.\n',
    'utf8',
  );
}

/** Write a JSONL transcript file, return its absolute path. */
function writeTranscript(root, ...lines) {
  const p = path.join(root, 'transcript.jsonl');
  fs.writeFileSync(
    p,
    lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n',
    'utf8',
  );
  return p;
}

/** The enforcement-log entries for a root (empty when the log was never written). */
function readEnforcementLog(root) {
  const file = path.join(root, '.ctoc', 'logs', 'enforcement.json');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

after(() => {
  for (const root of createdRoots) {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

/**
 * Drive a hook entry point in-process and capture its decision. `process.exit` is
 * RECORDED, not thrown, so a deny does not unwind into the hook's own catch and
 * masquerade as fail-open.
 */
async function drive(fn, payload, { cwd, cwdThrows = false } = {}) {
  const orig = {
    exit: process.exit,
    cwd: process.cwd,
    stdoutWrite: process.stdout.write,
    stderrWrite: process.stderr.write,
  };
  let exitCode;
  let stdout = '';
  let stderr = '';
  process.exit = (code) => { exitCode = code; };
  process.stdout.write = (s) => { stdout += s; return true; };
  process.stderr.write = (s) => { stderr += s; return true; };
  if (cwdThrows) process.cwd = () => { throw new Error('cwd boom'); };
  else if (cwd) process.cwd = () => cwd;
  try {
    await fn(payload);
  } finally {
    process.exit = orig.exit;
    process.cwd = orig.cwd;
    process.stdout.write = orig.stdoutWrite;
    process.stderr.write = orig.stderrWrite;
  }
  return { exitCode, stdout, stderr };
}

const runEnforce = (payload, opts) => drive(taskHook.enforce, payload, opts);
const runStop = (payload, opts) => drive(subagentStop.run, payload, opts);

/** A PreToolUse payload for a Task launch. */
function taskPayload(extra = {}) {
  return { tool_name: 'Task', tool_input: { subagent_type: 'code-reviewer', description: 'review the diff' }, ...extra };
}

/** True iff stdout carried the harness deny-decision JSON. */
function isDeny(stdout) {
  if (!stdout) return false;
  let parsed;
  try { parsed = JSON.parse(stdout); } catch { return false; }
  return !!parsed
    && !!parsed.hookSpecificOutput
    && parsed.hookSpecificOutput.permissionDecision === 'deny';
}

// ===========================================================================
// THE FENCE — the sixth launch is refused.
// ===========================================================================

describe('PreToolUse.Task — the sixth launch is BLOCKED', () => {
  it('allows a launch while slots are free, and takes a slot for it', async () => {
    const root = mkFixture();
    markCtoc(root);

    const { exitCode, stdout } = await runEnforce(taskPayload(), { cwd: root });
    assert.equal(exitCode, 0, 'a launch under the cap must be allowed');
    assert.equal(isDeny(stdout), false);
    assert.equal(agentSlots.activeCount(root), 1, 'the allowed launch must be COUNTED');
  });

  it('blocks the launch that would exceed MAX_CONCURRENT, with a real harness deny', async () => {
    const root = mkFixture();
    markCtoc(root);
    for (let i = 0; i < MAX_CONCURRENT; i++) {
      const { exitCode } = await runEnforce(taskPayload(), { cwd: root });
      assert.equal(exitCode, 0, `launch ${i + 1} should be allowed`);
    }
    assert.equal(agentSlots.activeCount(root), MAX_CONCURRENT);

    // THE FENCE. Remove the acquire() consultation and this goes red.
    const { exitCode, stdout, stderr } = await runEnforce(taskPayload(), { cwd: root });
    assert.equal(isDeny(stdout), true, 'the harness must be told DENY, not just shown a banner');
    assert.equal(exitCode, 2, 'a real block exits with the harness hard-block code');
    assert.match(stderr, /BLOCKED/);
    assert.equal(
      agentSlots.activeCount(root),
      MAX_CONCURRENT,
      'a refused launch must not consume a slot',
    );
  });

  it('the block message names the real situation, not a code', async () => {
    const root = mkFixture();
    markCtoc(root);
    for (let i = 0; i < MAX_CONCURRENT; i++) await runEnforce(taskPayload(), { cwd: root });

    const { stdout, stderr } = await runEnforce(taskPayload(), { cwd: root });
    const reason = JSON.parse(stdout).hookSpecificOutput.permissionDecisionReason;

    for (const text of [stderr, reason]) {
      // W1 TIGHTENED: this once matched /5 background subagents/ — one literal `5`
      // standing in for BOTH the live count and the cap, so a message that confused
      // the two still passed. Now both facts are asserted, and from MAX_CONCURRENT
      // rather than a literal, so a change to the cap cannot leave a stale number here.
      assert.match(
        text,
        new RegExp(`${MAX_CONCURRENT} of ${MAX_CONCURRENT} (background )?subagent slots are in use`, 'i'),
        'say how many are in flight AND what the ceiling is',
      );
      assert.match(text, /concurrency limit/i, 'name the standing limit');
      assert.match(text, /wait for one to complete/i, 'say what the human/agent should do');
      assert.match(text, /refills automatically/i, 'say the slot comes back on its own');
      // A limit that refuses without explaining why the usual override is inert
      // reads as a bug, so the message must pre-empt the obvious next attempt.
      assert.match(text, /escape phrase does not lift this cap/i, 'say the phrase will not work');
      assert.match(text, /resource limit/i, 'say WHY — a resource is not planning overhead');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // W1 — the denial names the count `activeCount` reports, and REAPS on refusal.
  //
  // `acquire()` filters stale holders OUT of its in-memory count but, on the
  // REFUSE path, never persists that reap — it returns before `writeSlots`. So a
  // store can hold 8 entries of which 3 are dead, refuse correctly at 5, and stay
  // at 8 on disk indefinitely. `activeCount` reaps AND persists, which is exactly
  // what the cap-hit moment needs: the pressure point is when a stale entry costs
  // the human a real launch.
  // ─────────────────────────────────────────────────────────────────────────

  /** Write the slot store directly, so stale holders can be planted. */
  function plantSlots(root, entries) {
    const file = agentSlots.slotsPath(root);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ version: 1, slots: entries }, null, 2), 'utf8');
  }
  const storedSlotCount = (root) =>
    JSON.parse(fs.readFileSync(agentSlots.slotsPath(root), 'utf8')).slots.length;

  it('the denial names the LIVE count and the real cap — not one number doing both jobs', async () => {
    const root = mkFixture();
    markCtoc(root);
    for (let i = 0; i < MAX_CONCURRENT; i++) await runEnforce(taskPayload(), { cwd: root });

    const { stdout, stderr } = await runEnforce(taskPayload(), { cwd: root });
    const reason = JSON.parse(stdout).hookSpecificOutput.permissionDecisionReason;

    for (const text of [stderr, reason]) {
      // The human needs BOTH facts: how many are live, and what the ceiling is.
      assert.match(
        text,
        new RegExp(`${MAX_CONCURRENT} of ${MAX_CONCURRENT}`),
        `the message must say "N of ${MAX_CONCURRENT}" — the live count AND the cap. got: ${text}`
      );
    }
  });

  it('a refusal REAPS the dead holders it counted past — activeCount persists the truth', async () => {
    const root = mkFixture();
    markCtoc(root);
    const now = Date.now();
    const stale = now - (agentSlots.SLOT_TTL_MS + 60_000); // holders presumed dead

    // 8 entries: 5 genuinely live (correctly at the cap) + 3 crashed subagents.
    const planted = [];
    for (let i = 0; i < MAX_CONCURRENT; i++) planted.push({ token: `live-${i}`, label: 'live', acquiredAt: now });
    for (let i = 0; i < 3; i++) planted.push({ token: `dead-${i}`, label: 'crashed', acquiredAt: stale });
    plantSlots(root, planted);
    assert.equal(storedSlotCount(root), MAX_CONCURRENT + 3, 'the store starts holding 3 corpses');

    const { exitCode, stderr } = await runEnforce(taskPayload(), { cwd: root });

    // The refusal is still correct: 5 live holders is the cap.
    assert.equal(exitCode, 2, 'five LIVE holders is the cap — the launch is still refused');
    assert.match(stderr, new RegExp(`${MAX_CONCURRENT} of ${MAX_CONCURRENT}`), 'and it reports the LIVE count, not 8');

    // The wiring's real work: the corpses are gone from disk.
    assert.equal(
      storedSlotCount(root),
      MAX_CONCURRENT,
      'the block path must REAP the dead holders — acquire() alone never persists its reap on the refuse path'
    );
  });

  it('logs the block decision to .ctoc/logs/enforcement.json', async () => {
    const root = mkFixture();
    markCtoc(root);
    for (let i = 0; i < MAX_CONCURRENT; i++) await runEnforce(taskPayload(), { cwd: root });
    await runEnforce(taskPayload(), { cwd: root });

    const entries = readEnforcementLog(root);
    const blocks = entries.filter((e) => e.outcome === 'block');
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].tool, 'Task');
    assert.equal(blocks[0].project_is_ctoc, true);
  });

  it('logs an allowed launch too', async () => {
    const root = mkFixture();
    markCtoc(root);
    await runEnforce(taskPayload(), { cwd: root });
    const entries = readEnforcementLog(root);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].outcome, 'allow');
    assert.equal(entries[0].tool, 'Task');
  });
});

// ===========================================================================
// The escape hatches the sibling hooks honor.
// ===========================================================================

describe('PreToolUse.Task — escape phrases and non-CTOC projects', () => {
  it('a non-CTOC project is a silent pass and takes no slot', async () => {
    const root = mkFixture();                     // no .ctoc/ marker
    const { exitCode, stdout } = await runEnforce(taskPayload(), { cwd: root });
    assert.equal(exitCode, 0);
    assert.equal(isDeny(stdout), false);
    assert.equal(fs.existsSync(agentSlots.slotsPath(root)), false, 'no bookkeeping outside CTOC');
  });

  it('a user-typed escape phrase does NOT lift the cap — it is a resource limit, not ceremony', async () => {
    const root = mkFixture();
    markCtoc(root);
    for (let i = 0; i < MAX_CONCURRENT; i++) await runEnforce(taskPayload(), { cwd: root });

    const transcript_path = writeTranscript(root, {
      type: 'user',
      message: { role: 'user', content: 'this is urgent, launch it anyway' },
    });
    const { exitCode, stdout, stderr } = await runEnforce(taskPayload({ transcript_path }), { cwd: root });

    assert.equal(isDeny(stdout), true, 'typing "urgent" must never buy a sixth concurrent subagent');
    assert.equal(exitCode, 2);
    assert.match(stderr, /BLOCKED/);
    assert.equal(
      agentSlots.activeCount(root),
      MAX_CONCURRENT,
      'the refused launch must not have taken a slot',
    );
    assert.equal(
      readEnforcementLog(root).filter((e) => e.outcome === 'escape').length,
      0,
      'no escape outcome may be logged — the phrase does not apply to the fence',
    );
  });

  it('a pile of escape phrases in a tool_result does NOT unlock the fence either', async () => {
    const root = mkFixture();
    markCtoc(root);
    for (let i = 0; i < MAX_CONCURRENT; i++) await runEnforce(taskPayload(), { cwd: root });

    // The sibling editing hooks role-scope their phrase matching so CTOC's own
    // block banner cannot unlock them. This hook needs no such care — it reads no
    // transcript at all — so a phrase from ANY role, human or tool, is inert here.
    const transcript_path = writeTranscript(root, {
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', content: 'hotfix urgent quick fix' }] },
    });
    const { exitCode, stdout } = await runEnforce(taskPayload({ transcript_path }), { cwd: root });
    assert.equal(isDeny(stdout), true, 'no escape phrase, from any role, may unlock the fence');
    assert.equal(exitCode, 2);
  });

  it('a stale slot past the TTL frees the fence without any escape phrase', async () => {
    const root = mkFixture();
    markCtoc(root);
    // Five crashed launches, stamped long ago — nothing ever released them.
    const ancient = Date.now() - agentSlots.SLOT_TTL_MS - 1;
    fs.mkdirSync(path.join(root, '.ctoc', 'state'), { recursive: true });
    fs.writeFileSync(agentSlots.slotsPath(root), JSON.stringify({
      version: 1,
      slots: Array.from({ length: MAX_CONCURRENT }, (_, i) => ({
        token: `crashed-${i}`, label: 'crashed', acquiredAt: ancient,
      })),
    }), 'utf8');

    const { exitCode, stdout } = await runEnforce(taskPayload(), { cwd: root });
    assert.equal(exitCode, 0, 'crashed subagents must not wedge the fence shut');
    assert.equal(isDeny(stdout), false);
    assert.equal(agentSlots.activeCount(root), 1);
  });
});

// ===========================================================================
// FAIL OPEN.
// ===========================================================================

describe('PreToolUse.Task — fails open', () => {
  it('an internal error allows the launch rather than breaking the session', async () => {
    const { exitCode, stdout, stderr } = await runEnforce(taskPayload(), { cwdThrows: true });
    assert.equal(exitCode, 0, 'a hook bug must never block real work');
    assert.equal(isDeny(stdout), false);
    assert.match(stderr, /failing open/i);
  });

  it('a null payload is handled (the hook still decides on the real root)', async () => {
    const root = mkFixture();
    markCtoc(root);
    const { exitCode } = await runEnforce(null, { cwd: root });
    assert.equal(exitCode, 0);
    assert.equal(agentSlots.activeCount(root), 1);
  });
});

// ===========================================================================
// The label recorded against the slot.
// ===========================================================================

describe('PreToolUse.Task — getLabel', () => {
  it('prefers subagent_type, falls back to description, then to a default', () => {
    assert.equal(taskHook.getLabel({ tool_input: { subagent_type: 'security-scanner' } }), 'security-scanner');
    assert.equal(taskHook.getLabel({ tool_input: { description: 'sweep the docs' } }), 'sweep the docs');
    assert.equal(typeof taskHook.getLabel({ tool_input: {} }), 'string');
    assert.equal(typeof taskHook.getLabel(null), 'string');
  });

  it('records the launch label against the slot it takes', async () => {
    const root = mkFixture();
    markCtoc(root);
    await runEnforce(taskPayload(), { cwd: root });
    const store = JSON.parse(fs.readFileSync(agentSlots.slotsPath(root), 'utf8'));
    assert.deepEqual(store.slots.map((s) => s.label), ['code-reviewer']);
  });
});

// ===========================================================================
// SubagentStop — the slot comes back.
// ===========================================================================

describe('SubagentStop — releases a slot so the cap refills', () => {
  it('a finished subagent frees a slot and the next launch is allowed again', async () => {
    const root = mkFixture();
    markCtoc(root);
    for (let i = 0; i < MAX_CONCURRENT; i++) await runEnforce(taskPayload(), { cwd: root });
    assert.equal((await runEnforce(taskPayload(), { cwd: root })).exitCode, 2, 'full');

    const { exitCode } = await runStop({}, { cwd: root });
    assert.equal(exitCode, 0);
    assert.equal(agentSlots.activeCount(root), MAX_CONCURRENT - 1, 'exactly one slot came back');

    assert.equal(
      (await runEnforce(taskPayload(), { cwd: root })).exitCode,
      0,
      'the freed slot must admit the next launch',
    );
  });

  it('releases exactly ONE slot per stop, never more', async () => {
    const root = mkFixture();
    markCtoc(root);
    for (let i = 0; i < 3; i++) await runEnforce(taskPayload(), { cwd: root });
    await runStop({}, { cwd: root });
    await runStop({}, { cwd: root });
    assert.equal(agentSlots.activeCount(root), 1);
  });

  it('stopping with no slots held is a safe no-op — the count never goes negative', async () => {
    const root = mkFixture();
    markCtoc(root);
    for (let i = 0; i < 3; i++) {
      const { exitCode } = await runStop({}, { cwd: root });
      assert.equal(exitCode, 0);
    }
    assert.equal(agentSlots.activeCount(root), 0);
  });

  it('a non-CTOC project is a silent no-op', async () => {
    const root = mkFixture();                     // no .ctoc/ marker
    const { exitCode } = await runStop({}, { cwd: root });
    assert.equal(exitCode, 0);
    assert.equal(fs.existsSync(agentSlots.slotsPath(root)), false);
  });

  it('fails open on an internal error', async () => {
    const { exitCode } = await runStop({}, { cwdThrows: true });
    assert.equal(exitCode, 0);
  });
});

// ===========================================================================
// THE PRODUCTION PATH — the real hook, spawned exactly as hooks.json spawns it.
//
// Every test above imports the module and calls enforce()/run() directly, which
// means NONE of them exercise what actually ships: `node PreToolUse.Task.js`
// with the payload arriving on stdin. That gap is not hypothetical — the
// PreToolUse.Write.js header records a bug where the unit tests were green while
// the real stdin path blocked every plan write in production. So drive the real
// binary the way the harness does.
// ===========================================================================

describe('the real hooks, spawned as the harness spawns them', () => {
  const TASK_HOOK = path.join(REPO, 'src', 'hooks', 'PreToolUse.Task.js');
  const STOP_HOOK = path.join(REPO, 'src', 'hooks', 'SubagentStop.js');

  /** Run a hook as a real subprocess, feeding `payload` on stdin. */
  function spawnHook(hookPath, payload, cwd) {
    return spawnSync(process.execPath, [hookPath], {
      cwd,
      input: JSON.stringify(payload),
      encoding: 'utf8',
    });
  }

  it('allows a launch under the cap and records the slot (exit 0, no deny)', () => {
    const root = mkFixture();
    markCtoc(root);
    const out = spawnHook(TASK_HOOK, taskPayload(), root);
    assert.equal(out.status, 0, out.stderr);
    assert.equal(isDeny(out.stdout), false);
    assert.equal(agentSlots.activeCount(root), 1, 'the production path must COUNT the launch');
  });

  it('DENIES the sixth launch through the real stdin path', () => {
    const root = mkFixture();
    markCtoc(root);
    for (let i = 0; i < MAX_CONCURRENT; i++) {
      assert.equal(spawnHook(TASK_HOOK, taskPayload(), root).status, 0, `launch ${i + 1}`);
    }
    const out = spawnHook(TASK_HOOK, taskPayload(), root);
    assert.equal(isDeny(out.stdout), true, 'the shipped hook must really deny the sixth launch');
    assert.equal(out.status, 2);
    // W1: the shipped hook reports the live count AND the cap (see the tightened
    // in-process assertion above); MAX_CONCURRENT, never a literal.
    assert.match(out.stderr, new RegExp(`${MAX_CONCURRENT} of ${MAX_CONCURRENT} subagent slots are in use`, 'i'));
    assert.equal(agentSlots.activeCount(root), MAX_CONCURRENT);
  });

  it('the real SubagentStop gives the slot back', () => {
    const root = mkFixture();
    markCtoc(root);
    for (let i = 0; i < MAX_CONCURRENT; i++) spawnHook(TASK_HOOK, taskPayload(), root);
    assert.equal(spawnHook(TASK_HOOK, taskPayload(), root).status, 2, 'full before the stop');

    const stop = spawnHook(STOP_HOOK, { hook_event_name: 'SubagentStop' }, root);
    assert.equal(stop.status, 0, stop.stderr);
    assert.equal(agentSlots.activeCount(root), MAX_CONCURRENT - 1);
    assert.equal(spawnHook(TASK_HOOK, taskPayload(), root).status, 0, 'the slot refilled');
  });

  it('an empty stdin payload does not break either hook (fail open)', () => {
    const root = mkFixture();
    markCtoc(root);
    const task = spawnSync(process.execPath, [TASK_HOOK], { cwd: root, input: '', encoding: 'utf8' });
    assert.equal(task.status, 0, task.stderr);
    const stop = spawnSync(process.execPath, [STOP_HOOK], { cwd: root, input: '', encoding: 'utf8' });
    assert.equal(stop.status, 0, stop.stderr);
  });

  it('malformed stdin JSON does not break either hook (fail open)', () => {
    const root = mkFixture();
    markCtoc(root);
    const task = spawnSync(process.execPath, [TASK_HOOK], { cwd: root, input: '{ nope', encoding: 'utf8' });
    assert.equal(task.status, 0, task.stderr);
    const stop = spawnSync(process.execPath, [STOP_HOOK], { cwd: root, input: '{ nope', encoding: 'utf8' });
    assert.equal(stop.status, 0, stop.stderr);
  });

  it('both hooks are actually WIRED in .claude-plugin/hooks.json — the fence is not optional', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO, '.claude-plugin', 'hooks.json'), 'utf8'));

    const taskEntry = manifest.hooks.PreToolUse.find((e) => e.matcher === 'Task');
    assert.ok(taskEntry, 'a PreToolUse entry matching Task must exist');
    assert.match(taskEntry.hooks[0].command, /src\/hooks\/PreToolUse\.Task\.js/);

    assert.ok(Array.isArray(manifest.hooks.SubagentStop), 'a SubagentStop entry must exist');
    assert.match(manifest.hooks.SubagentStop[0].hooks[0].command, /src\/hooks\/SubagentStop\.js/);
  });
});
