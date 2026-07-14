'use strict';

/**
 * THE LAST MILE — does the app actually run?
 *
 * CTOC's promise is "vision to WORKING APP", and its first operating lesson is
 * blunt: green tests are NOT "working" — a human must be able to open the thing
 * and get a response. Until this module existed, nothing in the pipeline ever
 * launched the app it built; Step 14 VERIFY stopped at lint + typecheck + tests
 * + coverage. This module closes that gap by making "the app actually runs" a
 * machine-checked fact.
 *
 * It classifies a project (`detectAppShape`) and, for anything with a
 * human-facing runtime, LAUNCHES it and drives one real action (`driveApp`):
 *   - web / server : start the dev server, poll the port until it answers or a
 *                    time budget expires, assert a real HTTP response on '/',
 *                    then tear the process down reliably.
 *   - cli          : run the entry with `--help`, assert exit 0 with output.
 *   - library      : no human-facing runtime → applicable:false (NOT a failure).
 *   - unknown      : nothing to launch → applicable:false.
 *
 * `driveApp` is asynchronous (a server is long-running and must be polled). A
 * synchronous caller — Step 14's `runVerify`, which existing tests call without
 * `await` — uses `driveAppSync`, which runs the async engine inside a short-lived
 * child process (this same file, invoked with `--drive`) so a blocking caller
 * gets a real verdict without leaking the app or blocking its own event loop.
 *
 * Cross-platform: processes are spawned with argv ARRAYS and `shell:false` (no
 * shell string interpolation). `node`-based scripts run via `process.execPath`.
 * Every launch is bounded by a time budget and the child is ALWAYS torn down
 * (POSIX: kill the detached process group; Windows: `taskkill /T /F`).
 */

const { spawn, spawnSync } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');
const safeFs = require('./safe-fs');
const { FrameworkDetector } = require('./framework-detector');
const { setupPlaywright } = require('./playwright-scaffolder');

/**
 * Default wall-clock budget for launching and driving an app (ms).
 *
 * R4-A item 9: 15s was below a cold Next.js/Vite first compile, so a CORRECT app
 * could fail the gate purely on start-up latency. Raised to 60s and made
 * overridable per call (`opts.timeBudgetMs`) or per environment
 * (`CTOC_APP_TIME_BUDGET_MS`), so a slow-but-correct app is not failed for being
 * slow while a genuinely dead app still fails fast (the poll breaks on `exited`).
 */
const DEFAULT_TIME_BUDGET_MS = (() => {
  const env = parseInt(process.env.CTOC_APP_TIME_BUDGET_MS || '', 10);
  return Number.isFinite(env) && env > 0 ? env : 60000;
})();

/** How often to re-probe a starting server (ms). */
const POLL_INTERVAL_MS = 250;

/** Marker framing the JSON verdict emitted by the `--drive` child process. */
const RESULT_MARKER = '__APP_RUNNER_RESULT__';

/**
 * Load and parse a project's package.json.
 * @param {string} projectPath - Project root.
 * @returns {Object|null} Parsed package.json, or null when absent/unparseable.
 */
function loadPackageJson(projectPath) {
  const p = path.join(projectPath, 'package.json');
  if (!safeFs.existsSync(p)) return null;
  try {
    return JSON.parse(safeFs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
}

/**
 * Classify a project by the kind of human-facing runtime it has.
 *
 * Ordering rationale (documented decision under ambiguity): a detected web
 * framework wins first (Next.js has both `dev` and web deps). A `bin` field is
 * the strongest signal of a command-line tool, so it is checked before a
 * long-running `dev`/`start` script. A project with a runnable script but no bin
 * is a server. A package with only `main`/`exports`/`module` is a library — no
 * human-facing runtime, which is NOT a gate failure. Anything else is unknown.
 *
 * @param {string} projectPath - Project root.
 * @returns {'web'|'server'|'cli'|'library'|'unknown'} The project shape.
 */
function detectAppShape(projectPath) {
  const detector = new FrameworkDetector(projectPath);
  if (detector.isWebApp()) return 'web';

  const pkg = loadPackageJson(projectPath);
  if (!pkg) return 'unknown';

  const scripts = pkg.scripts || {};
  if (pkg.bin) return 'cli';
  if (scripts.dev || scripts.start) return 'server';
  if (pkg.main || pkg.exports || pkg.module) return 'library';
  return 'unknown';
}

/**
 * Ask the OS for a currently-free TCP port on the loopback interface.
 * @returns {Promise<number>} A free port number.
 */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = addr && typeof addr === 'object' ? addr.port : null;
      srv.close(() => (port ? resolve(port) : reject(new Error('could not obtain a free port'))));
    });
  });
}

/**
 * Perform a single non-blocking HTTP GET probe against the loopback interface.
 * Never rejects — a connection refusal or timeout resolves to `{ ok: false }`.
 *
 * @param {number} port - Port to probe.
 * @param {string} [reqPath='/'] - Request path.
 * @returns {Promise<{ok: boolean, statusCode?: number, body?: string}>} Probe result.
 */
function probeHttp(port, reqPath = '/') {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: reqPath, timeout: 2000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        if (body.length < 512) body += chunk.toString();
      });
      res.on('end', () => resolve({ ok: true, statusCode: res.statusCode, body }));
    });
    req.on('error', () => resolve({ ok: false }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false });
    });
  });
}

/** Async sleep. @param {number} ms @returns {Promise<void>} */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve an npm script string into a concrete (command, args, shell) launch.
 *
 * `node`-based scripts are the strict, fully cross-platform path: they run via
 * `process.execPath` with `shell:false`. Other commands (e.g. a framework's
 * `next dev`) are spawned with `shell:false` on POSIX; on Windows they need the
 * shell to resolve a `.cmd` shim, which is the one narrow, documented exception.
 *
 * @param {string} scriptStr - The raw script command (e.g. "node server.js").
 * @returns {{command: string, args: string[], shell: boolean}} Launch spec.
 */
function resolveScriptCommand(scriptStr) {
  const tokens = String(scriptStr).trim().split(/\s+/);
  const cmd = tokens[0];
  const args = tokens.slice(1);
  if (cmd === 'node') {
    return { command: process.execPath, args, shell: false };
  }
  // Non-node command: strict shell:false everywhere except Windows, where a
  // bare command name needs the shell to resolve its PATHEXT/.cmd shim.
  return { command: cmd, args, shell: process.platform === 'win32' };
}

/**
 * Reliably tear down a spawned child and any processes it started.
 * POSIX: signal the detached process group (negative pid) TERM then KILL.
 * Windows: `taskkill /T /F` kills the whole tree. Best-effort; never throws.
 *
 * @param {import('child_process').ChildProcess} child - The child to kill.
 * @returns {Promise<void>} Resolves once the child has closed (or a grace elapses).
 */
async function teardown(child) {
  if (!child || child.pid == null) return;
  const alreadyDead = child.exitCode !== null || child.signalCode !== null;

  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch (e) {
        try { child.kill('SIGTERM'); } catch (e2) { /* already gone */ }
      }
    }
  } catch (e) {
    /* best-effort */
  }

  if (alreadyDead) return;

  // Give it a moment to exit gracefully, then hard-kill and wait for close.
  await new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(graceTimer);
      clearTimeout(hardTimer);
      resolve();
    };
    child.once('close', done);
    const graceTimer = setTimeout(() => {
      try {
        if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
        else spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } catch (e) { /* already gone */ }
    }, 400);
    const hardTimer = setTimeout(done, 1500);
  });
}

/**
 * Build the base result skeleton shared by every code path.
 * @param {string} shape - The detected app shape.
 * @returns {Object} Fresh result object.
 */
function baseResult(shape) {
  return {
    applicable: true,
    launched: false,
    responded: false,
    evidence: { shape },
    durationMs: 0,
    errors: []
  };
}

/**
 * Drive a command-line tool: run its entry with `--help` (or `opts.args`) and
 * require exit 0 with non-empty output. Uses `spawnSync` (the process is
 * short-lived) with an argv array and `shell:false`.
 *
 * @param {string} projectPath - Project root.
 * @param {Object} opts - Options ({ args, timeBudgetMs }).
 * @param {Object} result - Result object to populate.
 * @returns {Object} The populated result.
 */
function driveCli(projectPath, opts, result) {
  const pkg = loadPackageJson(projectPath) || {};
  let entry;
  if (typeof pkg.bin === 'string') {
    entry = pkg.bin;
  } else if (pkg.bin && typeof pkg.bin === 'object') {
    entry = Object.values(pkg.bin)[0];
  } else {
    entry = pkg.main || 'index.js';
  }

  const args = Array.isArray(opts.args) ? opts.args : ['--help'];
  const entryPath = path.join(projectPath, entry);
  const budget = opts.timeBudgetMs || DEFAULT_TIME_BUDGET_MS;

  result.evidence.command = `node ${entry} ${args.join(' ')}`.trim();

  const proc = spawnSync(process.execPath, [entryPath, ...args], {
    cwd: projectPath,
    timeout: budget,
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' }
  });

  result.launched = true;
  const output = `${proc.stdout || ''}${proc.stderr || ''}`;
  result.evidence.exitCode = proc.status;
  result.evidence.output = output.slice(0, 500);

  if (proc.error) {
    result.errors.push(`CLI failed to launch: ${proc.error.message}`);
    return result;
  }
  if (proc.status !== 0) {
    result.errors.push(`CLI '${entry}' exited with code ${proc.status} (expected 0).`);
    return result;
  }
  if (!output.trim()) {
    result.errors.push(`CLI '${entry}' exited 0 but produced no output.`);
    return result;
  }
  result.responded = true;
  return result;
}

/**
 * Drive a web app / server: start its dev (or start) script, poll '/' until it
 * answers or the time budget expires, assert a real HTTP response, then tear the
 * process down. The chosen port is exported to the child via the `PORT`
 * environment variable (respected by plain node servers and most frameworks).
 *
 * @param {string} projectPath - Project root.
 * @param {Object} opts - Options ({ port, timeBudgetMs }).
 * @param {Object} result - Result object to populate.
 * @returns {Promise<Object>} The populated result.
 */
async function driveServer(projectPath, opts, result) {
  const pkg = loadPackageJson(projectPath) || {};
  const scripts = pkg.scripts || {};
  const scriptName = scripts.dev ? 'dev' : (scripts.start ? 'start' : null);

  if (!scriptName) {
    result.errors.push('App-shaped project has no dev/start script to launch.');
    return result;
  }

  const scriptStr = scripts[scriptName];
  // R4-A item 9: NEVER trust a framework's DEFAULT port. If the human already has
  // a dev server on 3000 (Next.js) or 5173 (Vite), our spawned child fails to bind
  // and dies, but a probe against the default port would hit the OTHER process and
  // falsely attest "responded" — the Gate-3 artifact would then claim an app CTOC
  // never launched answered. Always allocate a FREE port and export it via PORT,
  // so the app under test is the only thing that could answer on it. An explicit
  // `opts.port` (tests) still wins.
  const port = opts.port || (await getFreePort());
  const budget = opts.timeBudgetMs || DEFAULT_TIME_BUDGET_MS;

  const { command, args, shell } = resolveScriptCommand(scriptStr);
  result.evidence.command = scriptStr;
  result.evidence.port = port;

  let child;
  try {
    child = spawn(command, args, {
      cwd: projectPath,
      shell,
      env: { ...process.env, PORT: String(port), NO_COLOR: '1', FORCE_COLOR: '0', BROWSER: 'none', CI: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32'
    });
  } catch (e) {
    result.errors.push(`Failed to spawn dev server ("${scriptStr}"): ${e.message}`);
    return result;
  }

  result.launched = true;

  let stdout = '';
  let stderr = '';
  let exited = false;
  /** @type {{code: (number|null), signal: (string|null), error?: string}|null} */
  let exitInfo = null;
  child.stdout.on('data', (d) => { if (stdout.length < 4000) stdout += d.toString(); });
  child.stderr.on('data', (d) => { if (stderr.length < 4000) stderr += d.toString(); });
  child.on('exit', (code, signal) => { exited = true; exitInfo = { code, signal }; });
  // A spawn error after the fact (e.g. ENOENT) must not crash the driver.
  child.on('error', (err) => { exited = true; exitInfo = { code: null, signal: null, error: err.message }; });

  const deadline = Date.now() + budget;
  let probe = { ok: false };
  while (Date.now() < deadline) {
    if (exited) break; // crashed before it ever answered
    probe = await probeHttp(port);
    if (probe.ok) break;
    await sleep(POLL_INTERVAL_MS);
  }

  result.evidence.stdout = stdout.slice(0, 800);
  result.evidence.stderr = stderr.slice(0, 800);

  // R4-A item 9: check `exited` BEFORE trusting a probe. Combined with the free
  // port above, this guarantees a "responded" verdict can only come from the app
  // WE launched — a child that died is reported as a failure even if something
  // else answers on the (now guaranteed private) port.
  if (exited && !probe.ok) {
    const detail = exitInfo && exitInfo.error ? exitInfo.error : `code ${exitInfo && exitInfo.code}, signal ${exitInfo && exitInfo.signal}`;
    result.errors.push(
      `Dev server exited before responding (${detail}). ` +
      `Stderr: ${stderr.slice(0, 400).trim() || '(none)'}`
    );
  } else if (probe.ok) {
    result.responded = true;
    result.evidence.httpStatus = probe.statusCode;
    result.evidence.bodyExcerpt = (probe.body || '').slice(0, 200);
  } else {
    result.errors.push(
      `Dev server did not respond on port ${port} within ${budget}ms. ` +
      `Stderr: ${stderr.slice(0, 400).trim() || '(none)'}`
    );
  }

  await teardown(child);
  return result;
}

/**
 * Launch an app-shaped project and drive one real human action.
 *
 * @param {string} projectPath - Project root.
 * @param {Object} [opts] - Options: { args, port, timeBudgetMs }.
 * @returns {Promise<{applicable: boolean, launched: boolean, responded: boolean,
 *   evidence: Object, durationMs: number, errors: string[]}>} Drive outcome. A
 *   library or unknown project returns `{ applicable: false, ... }` — honestly
 *   "not applicable", which must NOT fail any gate.
 */
async function driveApp(projectPath, opts = {}) {
  const started = Date.now();
  const shape = detectAppShape(projectPath);

  if (shape === 'library' || shape === 'unknown') {
    return {
      applicable: false,
      launched: false,
      responded: false,
      evidence: {
        shape,
        reason: shape === 'library'
          ? 'A library has no human-facing runtime; nothing to launch.'
          : 'Project shape could not be determined; nothing to launch.'
      },
      durationMs: Date.now() - started,
      errors: []
    };
  }

  const result = baseResult(shape);
  if (shape === 'cli') {
    driveCli(projectPath, opts, result);
  } else {
    await driveServer(projectPath, opts, result);
  }
  result.durationMs = Date.now() - started;
  return result;
}

/**
 * Synchronous facade over `driveApp` for callers that cannot await (Step 14's
 * `runVerify`). Library/unknown projects short-circuit with no subprocess. For
 * an app-shaped project the async engine runs inside a short-lived child process
 * (this file, invoked with `--drive`) which owns the launch and teardown, so the
 * synchronous caller gets a real verdict and never leaks the app.
 *
 * @param {string} projectPath - Project root.
 * @param {Object} [opts] - Options forwarded to `driveApp`.
 * @returns {{applicable: boolean, launched: boolean, responded: boolean,
 *   evidence: Object, durationMs: number, errors: string[]}} Drive outcome.
 */
function driveAppSync(projectPath, opts = {}) {
  const shape = detectAppShape(projectPath);

  if (shape === 'library' || shape === 'unknown') {
    return {
      applicable: false,
      launched: false,
      responded: false,
      evidence: {
        shape,
        reason: shape === 'library'
          ? 'A library has no human-facing runtime; nothing to launch.'
          : 'Project shape could not be determined; nothing to launch.'
      },
      durationMs: 0,
      errors: []
    };
  }

  const budget = opts.timeBudgetMs || DEFAULT_TIME_BUDGET_MS;
  const proc = spawnSync(
    process.execPath,
    [__filename, '--drive', projectPath, JSON.stringify(opts || {})],
    {
      encoding: 'utf8',
      // Generous ceiling above the internal budget so the child finishes cleanly
      // (reporting a verdict + tearing down) rather than being hard-killed.
      timeout: budget + 20000,
      shell: false,
      env: { ...process.env }
    }
  );

  if (proc.error) {
    return {
      applicable: true,
      launched: false,
      responded: false,
      evidence: { shape },
      durationMs: 0,
      errors: [`app-runner driver failed to launch: ${proc.error.message}`]
    };
  }

  const out = proc.stdout || '';
  const marker = out.lastIndexOf(RESULT_MARKER);
  if (marker >= 0) {
    try {
      return JSON.parse(out.slice(marker + RESULT_MARKER.length).trim());
    } catch (e) {
      /* fall through to the error result below */
    }
  }
  return {
    applicable: true,
    launched: false,
    responded: false,
    evidence: { shape },
    durationMs: 0,
    errors: [
      'Could not parse app-runner driver verdict. ' +
      `stdout: ${out.slice(0, 200)} stderr: ${(proc.stderr || '').slice(0, 200)}`
    ]
  };
}

/**
 * Scaffold a Playwright browser-driven end-to-end test for a detected web app.
 * `driveApp` proves the app runs right now; this lays down a durable test that
 * drives it in a real browser. Applies to web apps only.
 *
 * @param {string} projectPath - Project root.
 * @param {Object} [opts] - Options forwarded to the Playwright scaffolder.
 * @returns {Promise<Object>} `{ scaffolded: true, ...setupResult }` for a web app,
 *   or `{ scaffolded: false, reason }` when the project is not a web app.
 */
async function scaffoldPlaywright(projectPath, opts = {}) {
  const shape = detectAppShape(projectPath);
  if (shape !== 'web') {
    return {
      scaffolded: false,
      reason: `Playwright end-to-end scaffolding applies only to web apps; this project is '${shape}'.`
    };
  }
  const setup = await setupPlaywright(projectPath, opts);
  return { scaffolded: true, ...setup };
}

// --- `--drive` child-process entry point ---------------------------------
// When invoked as `node app-runner.js --drive <projectPath> <optsJson>`, run the
// async engine and print the JSON verdict framed by RESULT_MARKER, then exit 0.
// This is how driveAppSync gets a real verdict from a synchronous context.
if (require.main === module && process.argv[2] === '--drive') {
  const projectPath = process.argv[3];
  let opts = {};
  try {
    opts = process.argv[4] ? JSON.parse(process.argv[4]) : {};
  } catch (e) {
    opts = {};
  }
  driveApp(projectPath, opts)
    .then((result) => {
      process.stdout.write(RESULT_MARKER + JSON.stringify(result));
      process.exit(0);
    })
    .catch((e) => {
      process.stdout.write(
        RESULT_MARKER +
        JSON.stringify({
          applicable: true,
          launched: false,
          responded: false,
          evidence: {},
          durationMs: 0,
          errors: [`app-runner driver exception: ${e.message}`]
        })
      );
      process.exit(0);
    });
}

module.exports = {
  detectAppShape,
  driveApp,
  driveAppSync,
  scaffoldPlaywright,
  probeHttp,
  getFreePort,
  DEFAULT_TIME_BUDGET_MS
};
