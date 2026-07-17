#!/usr/bin/env node
'use strict';
/**
 * CTOC PreToolUse Enforcement Hook — Task (the concurrency fence)
 *
 * WHY THIS EXISTS. CTOC's standing limit is five concurrent background
 * subagents, and `src/lib/task-registry.js` really does enforce it —
 * `evaluateConcurrency` Rule 1 returns `{run:false, reason:'max-concurrent'}` the
 * moment five are running. But that check only ever fired for work that walked in
 * through the scheduler (`menu task add` → `canRun`). Nothing hooked the `Task`
 * tool, so a model could launch a sixth background subagent without recording it
 * anywhere and the scheduler was never consulted. The cap was enforced; the
 * ON-RAMP to it was optional. This hook is the on-ramp, and it is not optional.
 *
 * Flow (mirrors the sibling PreToolUse.Edit.js house style):
 *   1. Is project CTOC?      (silent pass if not — we do not police other repos)
 *   2. Take a slot           (`agent-slots.acquire`)
 *   3. Got one → ALLOW
 *   4. Full → BLOCK + log. FINAL.
 *
 * SIGNALLING. A deny is emitted through the shared `../lib/hook-deny-signal`
 * emitter — the Claude Code PreToolUse decision JSON on stdout plus the harness
 * hard-block exit code. An allow stays exit-0-silent. The human banner goes to
 * STDERR so stdout carries only the decision JSON. Identical to Edit/Write.
 *
 * ENFORCEMENT MODE. The sibling PreToolUse hooks do not read
 * `enforcement.mode` from `.ctoc/settings.yaml` today — no hook does — so this
 * one does not either, rather than inventing a knob its siblings do not honor.
 *
 * NO ESCAPE HATCH, DELIBERATELY — and this hook is the ONE PreToolUse hook that
 * differs from its siblings here. An escape phrase ("urgent", "hotfix", "quick
 * fix") buys a bypass of the Iron Loop PLANNING CEREMONY: it says "this change is
 * too small to be worth a plan", and the only thing it spends is process. The
 * five-subagent cap is not process — it is a RESOURCE limit. Typing "urgent"
 * cannot conjure a sixth execution context, so honoring the phrase here would
 * grant a launch WITHOUT a slot, and the accounting would then corrupt: the next
 * `SubagentStop` releases the OLDEST live entry, which belongs to a different,
 * still-running subagent. That frees a slot that is not free, and the cap
 * silently over-subscribes from then on — every launch after it is unfenced. So
 * the `max-concurrent` decision is FINAL. The block message says so plainly,
 * because a limit that refuses without explaining why the usual override does not
 * work reads as a bug. Waiting is the whole remedy, and it is a short one: the
 * slot refills the moment any in-flight subagent finishes.
 *
 * FAILS OPEN on any internal error — a fence that bricks the session is worse
 * than the gap it closes.
 *
 * stdin contract: a pipe is SINGLE-CONSUMER (fd 0 drains exactly once), so the
 * decision lives in an exported `enforce(parsedPayload)` that reads no stdin, and
 * the `require.main === module` entry below performs the one read. Importing this
 * module never consumes stdin or runs enforcement.
 */

const fs = require('fs');
// LITERAL require, first-party and dependency-free — NOT fail-soft: enforcement
// cannot signal a real deny without it (per the file's fail-open contract, a load
// failure crashes before enforce() → the tool proceeds).
const { emitDeny } = require('../lib/hook-deny-signal');

// Sibling modules loaded fail-soft (a missing/broken module degrades enforcement
// rather than crashing the hook). Each is a LITERAL require in its own try/catch —
// no dynamic require(variable) surface — matching PreToolUse.Edit.js exactly.
let detector = null;
try { detector = require('../lib/ctoc-project-detector'); } catch { detector = null; }
let agentSlots = null;
try { agentSlots = require('../lib/agent-slots'); } catch { agentSlots = null; }
let enforcementLog = null;
try { enforcementLog = require('../lib/enforcement-log'); } catch { enforcementLog = null; }
// NOTE: no escape-phrase reader is imported here, unlike the editing hooks. See
// the module header — an escape phrase cannot cross this fence, so reading the
// transcript for one would be work whose only possible answer is ignored.

function readStdinJson() {
  try {
    const buf = fs.readFileSync(0, 'utf8');
    return buf ? JSON.parse(buf) : null;
  } catch { return null; }
}

/**
 * The human-meaningful name for this launch — what shows up in the slot store and
 * the block banner. Prefers the agent type, falls back to the launch description,
 * then to a plain default. Never returns undefined.
 *
 * @param {object|null} stdinJson - parsed PreToolUse payload
 * @returns {string}
 */
function getLabel(stdinJson) {
  const input = (stdinJson && stdinJson.tool_input) || {};
  if (typeof input.subagent_type === 'string' && input.subagent_type) return input.subagent_type;
  if (typeof input.description === 'string' && input.description) return input.description;
  return 'subagent';
}

/**
 * The block banner (stderr) and the deny reason share this text. PURE, so its
 * content is asserted in-process without a process.exit. It names the real
 * situation in plain words — how many are in flight, what the limit is, that
 * waiting is all that is required, and why the escape phrase that lifts CTOC's
 * other fences does not lift this one.
 *
 * `running` and `max` are SEPARATE facts and are printed as "N of MAX". They were
 * once the same number: the message interpolated `running` where it meant the cap
 * ("5 is CTOC's standing concurrency limit"), which reads correct only while the
 * two happen to be equal. They can diverge — `agent-slots` FAILS OPEN, so a store
 * that cannot be written hands out slots past the cap, and the banner would then
 * have announced the over-subscribed count AS the limit. A limit that misreports
 * itself is worse than no limit.
 *
 * @param {number} running - how many subagents are genuinely in flight now
 * @param {number} max - CTOC's standing concurrency cap
 * @param {string} label - the launch that was refused
 * @returns {string}
 */
function buildBlockMessage(running, max, label) {
  return `\n[CTOC] Subagent launch BLOCKED: ${running} of ${max} subagent slots are in use.\n`
    + `  Refused launch: ${label}\n\n`
    + `  ${max} is CTOC's standing concurrency limit for background subagents.\n`
    + `  Wait for one to complete — the slot refills automatically the moment it finishes,\n`
    + `  and this launch will then go through unchanged.\n\n`
    + `  An escape phrase does not lift this cap. Escape phrases skip planning overhead;\n`
    + `  this is a resource limit, and no phrase creates a sixth place to run.\n\n`;
}

/**
 * The deny reason handed to the harness. Same facts as the banner, one line.
 *
 * @param {number} running
 * @param {number} max
 * @param {string} label
 * @returns {string}
 */
function buildDenyReason(running, max, label) {
  return `CTOC: ${running} of ${max} background subagent slots are in use, and ${max} is CTOC's `
    + `standing concurrency limit. Wait for one to complete and the slot refills automatically, then `
    + `launch "${label}" again. An escape phrase does not lift this cap — escape phrases skip `
    + `planning overhead, and this is a resource limit, not overhead.`;
}

function block(running, info) {
  const max = agentSlots ? agentSlots.MAX_CONCURRENT : running;
  process.stderr.write(buildBlockMessage(running, max, info.label));
  if (info.project_root && enforcementLog) {
    try {
      enforcementLog.logEnforcement({
        tool: info.tool || 'Task',
        target_file: null,
        subagent: info.label,
        project_is_ctoc: true,
        plan_matched: null,
        escape_phrase: null,
        outcome: 'block',
      }, info.project_root);
    } catch { /* fail open on log error */ }
  }
  emitDeny(buildDenyReason(running, max, info.label));
}

function allow(outcome, info) {
  if (info.project_root && enforcementLog) {
    try {
      enforcementLog.logEnforcement({
        tool: info.tool || 'Task',
        target_file: null,
        subagent: info.label,
        project_is_ctoc: info.project_is_ctoc,
        plan_matched: null,
        escape_phrase: null,        // no phrase can produce an allow on this path
        outcome,
      }, info.project_root);
    } catch { /* fail open on log error */ }
  }
  process.exit(0);
}

/**
 * The enforcement decision, operating on an ALREADY-PARSED PreToolUse payload.
 * Performs NO stdin read (the caller owns the one read). Always terminates via
 * process.exit: 0 = allowed, the harness hard-block code = denied.
 *
 * @param {object|null} stdinJson - parsed PreToolUse payload (may be null)
 * @returns {Promise<void>}
 */
async function enforce(stdinJson) {
  try {
    const root = process.cwd();
    const tool = (stdinJson && stdinJson.tool_name) || 'Task';
    const label = getLabel(stdinJson);

    // 1. CTOC project? If not, silent pass — CTOC's cap is CTOC's business.
    if (!detector || !agentSlots) return process.exit(0);   // libs missing — fail open
    const detect = detector.isCtocProject(root);
    if (!detect.isCtoc) {
      return allow('silent-passthrough', { tool, label, project_root: root, project_is_ctoc: false });
    }

    // 2. Take a slot. This is the whole fence: acquire() reaps stale holders,
    //    counts what is genuinely live, and refuses at MAX_CONCURRENT.
    const slot = agentSlots.acquire(root, { label });
    if (slot.ok) {
      return allow('allow', { tool, label, project_root: root, project_is_ctoc: true });
    }

    // 3. Full — BLOCK, and that is FINAL. No escape phrase is consulted: this is
    //    a resource limit, not planning ceremony (see the module header).
    //
    //    The count the human is told comes from `agentSlots.activeCount`, not from
    //    `slot.running`, and the difference is real work rather than a second
    //    opinion. `acquire` filters stale holders out of its IN-MEMORY count but
    //    returns before `writeSlots` on the refuse path, so it never PERSISTS that
    //    reap: a store holding five live entries and three crashed ones refuses
    //    correctly at five and stays at eight on disk. `activeCount` reaps and
    //    persists. The cap-hit is exactly the moment that matters — a dead holder
    //    only ever costs a human a real launch once the fence is under pressure —
    //    so the refusal is where the store gets healed. The number is identical to
    //    `slot.running` (both count the same live set); the side effect is the point.
    return block(agentSlots.activeCount(root), { tool, label, project_root: root });
  } catch (err) {
    // Fail OPEN — never break the user's flow due to a hook bug.
    process.stderr.write(`[CTOC] Task concurrency hook error (failing open): ${err.message}\n`);
    process.exit(0);
  }
}

module.exports = { enforce, getLabel, buildBlockMessage, buildDenyReason, readStdinJson };

// Direct invocation: this file run as a PreToolUse hook on a Task launch. Read
// stdin ONCE here (the single consumer of the pipe) and hand the parsed payload
// to enforce(). Guarded so importing the module never consumes stdin.
if (require.main === module) {
  enforce(readStdinJson());
}
