#!/usr/bin/env node
'use strict';
/**
 * CTOC SubagentStop Hook — give the concurrency slot back.
 *
 * The partner of `PreToolUse.Task.js`. That hook takes a slot before a background
 * subagent launches; this one gives a slot back when a subagent finishes, so the
 * five-concurrent cap refills on its own and the fence never wedges shut.
 *
 * THE CORRELATION CAVEAT — stated plainly rather than papered over.
 * `PreToolUse.Task.js` runs BEFORE the launch, and the harness assigns the agent
 * its id AFTER the call, so at slot-acquire time there is no identity to record
 * and nothing this hook could match against. This is therefore a COUNT-based
 * semaphore, not an identity-based one: a stop releases the OLDEST live entry,
 * not "the entry belonging to the agent that just stopped". Two real consequences
 * follow, and both are acceptable:
 *   • The wrong entry can be released — the COUNT stays right, the labels can
 *     drift. Nothing depends on the labels; the count is what the fence uses.
 *   • A subagent that CRASHES never fires this hook at all, which would leak its
 *     slot forever. That is why `agent-slots` reaps any entry older than
 *     `SLOT_TTL_MS` (thirty minutes) before counting: the fence self-heals without
 *     anybody touching a file.
 * An exact, identity-based release would need an id the harness does not give us
 * at acquire time. Count-plus-TTL is the honest design, not a pretend-exact one.
 *
 * I/O convention: exit 0 always. A SubagentStop hook has no allow/deny authority
 * and this one claims none. FAILS OPEN on any internal error.
 */

const fs = require('fs');

// Sibling modules loaded fail-soft — a missing/broken module degrades the release
// rather than crashing the hook. Literal requires, one try/catch each, matching
// the PreToolUse house style.
let detector = null;
try { detector = require('../lib/ctoc-project-detector'); } catch { detector = null; }
let agentSlots = null;
try { agentSlots = require('../lib/agent-slots'); } catch { agentSlots = null; }

function readStdinJson() {
  try {
    const buf = fs.readFileSync(0, 'utf8');
    return buf ? JSON.parse(buf) : null;
  } catch { return null; }
}

/**
 * Release one slot. Operates on an ALREADY-PARSED payload (which it does not need
 * — see the correlation caveat above — but accepting it keeps the entry points
 * symmetrical with the PreToolUse siblings and keeps stdin single-consumer).
 * Always terminates via process.exit(0).
 *
 * @param {object|null} _stdinJson - parsed SubagentStop payload (unused: the
 *   harness's agent id is not something the acquire side could have recorded)
 * @returns {void}
 */
function run(_stdinJson) {
  try {
    const root = process.cwd();
    if (!detector || !agentSlots) return process.exit(0);   // libs missing — fail open
    const detect = detector.isCtocProject(root);
    if (!detect.isCtoc) return process.exit(0);             // not our project, not our count

    // No token: release the OLDEST live entry (count-based — see the header).
    // Never throws, never goes negative, and a stop with nothing held is a no-op.
    agentSlots.release(root);
    return process.exit(0);
  } catch (err) {
    process.stderr.write(`[CTOC] SubagentStop slot-release error (failing open): ${err.message}\n`);
    return process.exit(0);
  }
}

module.exports = { run, readStdinJson };

// Direct invocation: this file run as the SubagentStop hook. Read stdin ONCE here
// (the single consumer of the pipe). Guarded so importing never consumes stdin.
if (require.main === module) {
  run(readStdinJson());
}
