#!/usr/bin/env node
'use strict';
/**
 * CTOC v7 PreToolUse Enforcement Hook — NotebookEdit (W01-s3, finding C3).
 *
 * This file is its OWN process entry. It reads the PreToolUse payload from stdin
 * (fd 0) exactly ONCE — a pipe is single-consumer — and calls the exported
 * `enforce(parsed)` from PreToolUse.Edit.js. Enforcement therefore does NOT depend
 * on PreToolUse.Edit.js being `require.main === module` (the C3 defect): the old
 * bare `require('./PreToolUse.Edit.js')` loaded Edit for side effects, but Edit's
 * enforcement IIFE is guarded by `require.main === module`, which is false when a
 * sibling is the entry point — so NotebookEdit enforced nothing at all.
 *
 * `enforce()` reads `tool_name` from the payload, so the enforcement log
 * distinguishes NotebookEdit from Edit/Write. `getTargetFile()` in the delegate
 * already resolves `tool_input.notebook_path`, so no Edit.js change is needed here.
 *
 * Fails OPEN: if the enforcement delegate cannot be loaded, the hook exits 0 (the
 * tool proceeds) with a stderr note — the same posture as PreToolUse.Write.js. The
 * `require` is a literal string (no dynamic require), and `main()` is
 * `require.main`-guarded so importing this module in a test never consumes stdin
 * or exits.
 *
 * Cross-platform: no paths built here, no shell; the delegate owns normalization.
 */

const fs = require('fs');

/**
 * Read + parse the PreToolUse payload from stdin (fd 0) once. Returns null on any
 * read/parse failure, so a broken/empty pipe cannot crash the hook (fail-open:
 * enforce(null) then falls through to allow rather than blocking blindly).
 * @returns {object|null}
 */
function readStdinJson() {
  try {
    const buf = fs.readFileSync(0, 'utf8');
    return buf ? JSON.parse(buf) : null;
  } catch {
    return null;
  }
}

/**
 * Production entry. Loads the exported enforce() from the Edit delegate and hands
 * it the single stdin read. The delegate owns the block/allow decision and the
 * exit. A delegate-load failure fails OPEN (exit 0).
 * @returns {Promise<void>}
 */
async function main() {
  let enforce;
  try {
    ({ enforce } = require('./PreToolUse.Edit.js'));
  } catch (err) {
    process.stderr.write(`[CTOC] NotebookEdit hook: enforcement delegate failed to load (failing open): ${err.message}\n`);
    process.exit(0);
    return;
  }
  if (typeof enforce !== 'function') {
    process.stderr.write('[CTOC] NotebookEdit hook: enforcement delegate has no enforce() (failing open)\n');
    process.exit(0);
    return;
  }
  await enforce(readStdinJson());
}

module.exports = { main, readStdinJson };

if (require.main === module) {
  main();
}
