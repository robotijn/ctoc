#!/usr/bin/env node
'use strict';
/**
 * CTOC UserPromptSubmit hook — the per-request routing reminder (Part One of plan
 * 00072). Registered in `.claude-plugin/hooks.json`, which is the install-and-update
 * wiring (Claude Code reads plugin hook registrations from it; `/ctoc:update` syncs
 * it) — there is no installer code to change.
 *
 * On every human prompt, Claude Code adds a UserPromptSubmit hook's stdout to the
 * model's context on exit 0. This hook writes a short, mostly-silent routing line
 * (assembled by `../lib/ctoc-routing-reminder`) and exits 0. Empty text writes
 * nothing.
 *
 * ALWAYS exits 0 — NEVER a non-zero code. On UserPromptSubmit a non-zero exit
 * BLOCKS the human's prompt; a routing reminder must never be able to do that. The
 * library is required inside a try/catch and NEVER throws, so a broken library
 * degrades to silence.
 *
 * stdin contract: a pipe is SINGLE-CONSUMER (fd 0 drains exactly once). All
 * judgment lives in `run(parsedPayload)` which reads no stdin; the
 * `require.main === module` entry performs the one read. Importing this module
 * never consumes stdin.
 */

const fs = require('fs');
// LITERAL, first-party, dependency-free: exits by setting process.exitCode and
// returning so Node DRAINS stdout before terminating. A raw process.exit(0) here
// would discard buffered stdout — dropping the very reminder this hook injects.
const { requestExit } = require('../lib/request-exit');

let reminder = null;
try { reminder = require('../lib/ctoc-routing-reminder'); } catch { reminder = null; }

/** Read the single-consumer stdin pipe exactly once. @returns {object|null} */
function readStdinJson() {
  try {
    const buf = fs.readFileSync(0, 'utf8');
    return buf ? JSON.parse(buf) : null;
  } catch { return null; }
}

/**
 * The hook body, operating on an ALREADY-PARSED payload. Writes the reminder text
 * to STDOUT and requests exit 0. Empty text writes nothing. ALWAYS exit code 0 — a
 * non-zero exit on UserPromptSubmit would BLOCK the human's prompt.
 * @param {object|null} stdinJson
 * @returns {void}
 */
function run(stdinJson) {
  try {
    const input = stdinJson || {};
    const prompt = typeof input.prompt === 'string' ? input.prompt : '';
    const sessionId = typeof input.session_id === 'string' && input.session_id
      ? input.session_id
      : 'unknown-session';
    if (reminder && typeof reminder.buildReminder === 'function') {
      const { text } = reminder.buildReminder({ root: process.cwd(), prompt, sessionId });
      if (text) process.stdout.write(text + '\n');
    }
  } catch (err) {
    // A routing reminder must never break the prompt. Record which failure was
    // absorbed — it is NOT a verdict — and stay silent to the model's context.
    process.stderr.write(`[CTOC] UserPromptSubmit routing-reminder error (failing silent): ${err && err.message}\n`);
  }
  requestExit(0);
}

module.exports = { run, readStdinJson };

if (require.main === module) { run(readStdinJson()); }
