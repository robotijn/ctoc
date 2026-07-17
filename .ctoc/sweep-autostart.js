/* eslint-disable n/no-process-exit, security/detect-non-literal-fs-filename */
'use strict';

/**
 * ── Why the ESLint disables above (a CONFIG GAP, not an exemption) ─────────────
 * `eslint.config.js` already declares `n/no-process-exit` off for CTOC's own
 * scripts ("CLI entry points and hooks exit by design"), and turns the security
 * rules off for the tests directory on the grounds that they run against trusted,
 * repo-local files. That tuning block's `files` glob covers only the src, tests and
 * evals directories, so `.ctoc` scripts never inherited it and get the raw plugin
 * defaults instead — flagged for doing exactly what the repo blesses one directory
 * over. Same reasoning applies here: this is a hand-run operator script reading the
 * repo's own files, not a production surface taking untrusted input. The honest fix
 * is a `.ctoc` script block in eslint.config.js; that file is not in this plan's
 * `files:` declaration, so it is reported rather than edited here.
 *
 * The shebang was REMOVED rather than disabled: `n/hashbang` was right. This script
 * is not a package.json `bin` entry and is documented to run as `node .ctoc/…`, so
 * the shebang served nothing. A file-level disable could not have covered it anyway
 * — the shebang is line 1, ahead of any directive.
 *
 * SWEEP AUTOSTART — waits for the two in-flight fixes to land, then starts the
 * sweep by itself. No human in the loop, no spinner to watch.
 *
 * It will NOT start until BOTH preconditions are genuinely true on disk:
 *
 *   1. Every agent has a real `description:` — the wrapper-frontmatter agent has
 *      finished. Starting before that means the sweep and that agent both write
 *      `agents/**` and clobber each other.
 *   2. The watchdog has a WRITER stage — it dispatches `agent-writer`. Without it
 *      the round is critic-only, and `agent-critic`'s own Anti-Scope says "Does
 *      NOT implement fixes -- that is agent-writer's job". A critic-only sweep
 *      scores POOR and changes nothing. That was the whole "nothing happened".
 *
 * Both are CHECKED, not assumed. If a precondition never lands this reports it
 * and exits non-zero rather than starting a sweep that cannot work.
 *
 * Run:  nohup node .ctoc/sweep-autostart.js > /dev/null 2>&1 &
 * Stop: touch .ctoc/sweep-AUTOSTART-STOP
 * Log:  .ctoc/sweep-autostart.log
 */

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOG = path.join(ROOT, '.ctoc', 'sweep-autostart.log');
const STOP = path.join(ROOT, '.ctoc', 'sweep-AUTOSTART-STOP');
const SWEEP_STOP = path.join(ROOT, '.ctoc', 'sweep-STOP');
const WATCHDOG = path.join(ROOT, '.ctoc', 'sweep-watchdog.js');

const POLL_MS = 60 * 1000;        // check every minute
const MAX_WAIT_MS = 6 * 60 * 60 * 1000; // 6h then give up loudly

function log(m) {
  const line = `[${new Date().toISOString()}] ${m}\n`;
  process.stdout.write(line);
  try { fs.appendFileSync(LOG, line); } catch { /* never die on logging */ }
}

/** Every agent .md, from disk. */
function agentFiles() {
  const out = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== '_shared') walk(full); }
      else if (full.endsWith('.md')) out.push(full);
    }
  };
  walk(path.join(ROOT, 'agents'));
  return out;
}

/** Precondition 1: zero agents without a description. Returns {ok, missing}. */
function wrappersLanded() {
  const missing = [];
  for (const f of agentFiles()) {
    try {
      if (!/^description:/m.test(fs.readFileSync(f, 'utf8'))) missing.push(path.relative(ROOT, f));
    } catch { missing.push(path.relative(ROOT, f) + ' (unreadable)'); }
  }
  return { ok: missing.length === 0, missing };
}

/** Precondition 2: the watchdog actually dispatches agent-writer. */
function writerStageExists() {
  try {
    const src = fs.readFileSync(WATCHDOG, 'utf8');
    return /agent-writer/.test(src);
  } catch {
    return false;
  }
}

function watchdogRunning() {
  // execFileSync with an argument array — no shell, so nothing here can be
  // interpreted as a shell metacharacter even if the pattern ever became dynamic.
  try {
    const out = execFileSync('pgrep', ['-f', 'sweep-watchdog.js'], { encoding: 'utf8' }).trim();
    return out.length > 0;
  } catch {
    return false; // pgrep exits 1 when nothing matches
  }
}

function startSweep() {
  try { fs.unlinkSync(SWEEP_STOP); } catch { /* already absent */ }
  const child = spawn('node', [WATCHDOG], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  log(`SWEEP STARTED — pid ${child.pid}`);
}

async function main() {
  log('=== autostart waiting for both preconditions ===');
  const deadline = Date.now() + MAX_WAIT_MS;
  let lastReport = '';

  for (;;) {
    if (fs.existsSync(STOP)) { log('AUTOSTART-STOP present — exiting, sweep NOT started'); return; }

    if (watchdogRunning()) { log('watchdog already running — nothing to do, exiting'); return; }

    const w = wrappersLanded();
    const writer = writerStageExists();

    if (w.ok && writer) {
      log(`precondition 1 OK: all ${agentFiles().length} agents have a description`);
      log('precondition 2 OK: watchdog dispatches agent-writer');
      startSweep();
      return;
    }

    const report = `waiting — wrappers:${w.ok ? 'READY' : `${w.missing.length} still without a description`} writer-stage:${writer ? 'READY' : 'MISSING'}`;
    if (report !== lastReport) { log(report); lastReport = report; }

    if (Date.now() > deadline) {
      log(`GAVE UP after 6h. wrappers-missing=${w.missing.length} writer-stage=${writer}. Sweep NOT started — a sweep without a writer stage cannot fix anything, and starting it would only burn tokens producing zero edits.`);
      process.exit(1);
    }

    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((e) => { log(`autostart crashed: ${e && e.stack ? e.stack : e}`); process.exit(1); });
