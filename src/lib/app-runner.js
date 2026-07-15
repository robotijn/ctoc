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
const capabilityRegistry = require('./capability-registry');

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
 * Ordering rationale (documented decision under ambiguity): a `bin` field is the
 * strongest signal of a command-line tool, so it is checked FIRST — a published
 * CLI that also ships a docs site is still a CLI. The hard 'web' shape is claimed
 * only when a LAUNCHABLE web runtime is present (a `dev`/`start` script), because
 * driveServer requires one and a missing script is a gate failure; a web SIGNAL
 * without a runnable script (a component library with its framework as a
 * peerDependency, or a stray framework config file) is therefore NOT web. A
 * project with a runnable script but no web signal is a server. A package with
 * only `main`/`exports`/`module` is a library — no human-facing runtime, which is
 * NOT a gate failure. Anything else is unknown.
 *
 * @param {string} projectPath - Project root.
 * @returns {'web'|'server'|'cli'|'library'|'unknown'} The project shape.
 */
function detectAppShape(projectPath) {
  const detector = new FrameworkDetector(projectPath);
  const pkg = loadPackageJson(projectPath);
  const scripts = (pkg && pkg.scripts) || {};
  const hasLaunchableWebRuntime = Boolean(scripts.dev || scripts.start);

  // A `bin` field is the strongest command-line-tool signal, so it is checked
  // BEFORE any web branch: a published CLI that ALSO ships a docs site under
  // apps/web is still a CLI, and driving it as a web server (which it has no
  // dev/start script for) is a FALSE gate failure (F2). Ordering it first means a
  // web signal in a workspace member never masks the bin.
  if (pkg && pkg.bin) return 'cli';

  // 'web' is a HARD shape: driveServer REQUIRES a dev/start script, and a missing
  // one is surfaced as a gate failure ("no dev/start script to launch"). So only
  // classify 'web' when a LAUNCHABLE web runtime is actually present. Without a
  // dev/start script, a project that merely carries web SIGNALS must fall through
  // to library/unknown rather than be forced into the hard web shape:
  //   - F4: a component library lists its framework as a peerDependency (the
  //         standard publish pattern) and ships only build/test scripts — it is a
  //         library, not a web app;
  //   - F3: a non-web project with a stray framework config file (astro.config.mjs,
  //         next.config.js) and a malformed/absent package.json is unknown, not web.
  // A REAL web app always carries a dev/start script, so this gate never demotes a
  // genuine web app (the regression guards below in the test suite prove it).
  if (hasLaunchableWebRuntime) {
    if (detector.isWebApp()) return 'web';

    // FINDING 2: MONOREPO web detection. In a workspace/monorepo (pnpm/npm/yarn/
    // turbo) the framework dep lives in a member (apps/web, packages/frontend), NOT
    // the root, so the root-only isWebApp() above returns false and the project
    // would fall through to 'server' — running `turbo dev` blindly while
    // framework-security sees no framework. detectAll() walks apps/packages/* and
    // returns the detected web frameworks; if ANY member is a web app AND the root
    // has a launchable runtime (the `turbo dev`/`pnpm -r dev` orchestrator script),
    // the project is web-shaped.
    const members = detector.detectAll();
    if (Array.isArray(members) && members.length > 0) return 'web';
  }

  if (!pkg) return 'unknown';
  if (hasLaunchableWebRuntime) return 'server';
  if (pkg.main || pkg.exports || pkg.module) return 'library';
  return 'unknown';
}

/**
 * Choose the default run shape for a registry language: prefer a genuinely runnable
 * shape (cli/server), fall back to the honest build-is-last-mile shapes
 * (mobile/web), else the first shape the language declares.
 *
 * @param {string} language - registry language key.
 * @param {string} projectPath - project root (for a project-local override).
 * @returns {string|null} the chosen shape, or null when the language declares none.
 */
function defaultShapeFor(language, projectPath) {
  const cap = capabilityRegistry.capabilitiesFor(language, projectPath);
  const shapes = cap && cap.run && cap.run.shapes && typeof cap.run.shapes === 'object'
    ? Object.keys(cap.run.shapes)
    : [];
  for (const pref of ['cli', 'server', 'mobile', 'web']) {
    if (shapes.includes(pref)) return pref;
  }
  return shapes[0] || null;
}

/**
 * Registry-backed detection of a NON-JS run target — the exact gap app-runner's
 * package.json logic leaves open (a Flutter/Android/Rust project has no
 * package.json, so `detectAppShape` returns 'unknown'). When the shape is 'unknown',
 * consult the Capability Registry: if the project matches a language that declares a
 * run strategy, return that strategy plus the honest build+test last mile.
 *
 * This is CR1's LIVE consumer of the registry — the keystone would otherwise be a
 * dead engine reachable only by its test. It DESCRIBES the run (returns command
 * strings); it never executes a build/run here (that is CR6).
 *
 * CR3 enriches the evidence with the PROJECT-TYPE dimension: `projectTypeFor`
 * detects the taxonomy (a Flutter app is `mobile-crossplatform`, not merely "a dart
 * mobile shape"), and `pipelineFor` merges the language toolchain with that type's
 * phase-relevance + honest run strategy + config scaffold. This is the LIVE consumer
 * of CR3's new engine functions — they would otherwise be a dead engine reachable
 * only by a test. It still DESCRIBES the run; it never executes a build/run here.
 *
 * @param {string} projectPath - project root.
 * @returns {{applicable: true, language: string, projectType: string,
 *   strategy: {command: string, honest: (boolean|string), shape: string},
 *   lastMile: {build: (string|null), test: (string|null)},
 *   taxonomy: (string|null), pipeline: (Object|null),
 *   honest: (boolean|string)}|null} the native run target, or null for a JS-shaped
 *   or unrecognized project. `honest` is the authoritative honest flag: the taxonomy
 *   pipeline's when a taxonomy is detected, else the language shape's.
 */
function detectRunTarget(projectPath) {
  if (detectAppShape(projectPath) !== 'unknown') return null;
  const langs = capabilityRegistry.detectLanguages(projectPath);
  for (const language of langs) {
    const projectType = defaultShapeFor(language, projectPath);
    if (!projectType) continue;
    const strategy = capabilityRegistry.runStrategyFor(language, projectType, projectPath);
    if (!strategy) continue;
    const build = capabilityRegistry.toolchainFor(language, 'build', projectPath);
    const test = capabilityRegistry.toolchainFor(language, 'test', projectPath);
    // CR3 live edge: consult the project-type taxonomy for richer run evidence, and
    // merge the full language+type pipeline when a taxonomy is detected.
    const taxonomy = capabilityRegistry.projectTypeFor(projectPath);
    const pipeline = taxonomy ? capabilityRegistry.pipelineFor(language, taxonomy, projectPath) : null;
    // F9: the language shape's honest flag (strategy.honest) and the taxonomy's honest
    // flag (pipeline.run.honest) can disagree — a Rust Tauri app is a `cli` shape
    // (honest:true) but the desktop taxonomy is build-is-last-mile. When a taxonomy
    // pipeline is present it is the authoritative source of truth about how honestly
    // this thing can be "run"; prefer it over the bare language shape.
    const honest = pipeline && pipeline.run && pipeline.run.honest != null
      ? pipeline.run.honest
      : strategy.honest;
    return {
      applicable: true,
      language,
      projectType,
      strategy,
      lastMile: {
        build: build && typeof build.cmd === 'string' ? build.cmd : null,
        test: test && typeof test.cmd === 'string' ? test.cmd : null
      },
      taxonomy,
      pipeline,
      honest
    };
  }
  return null;
}

/**
 * Build the HONEST not-applicable result for a registry-detected native/mobile
 * project. `applicable:false` so it never fails the Step-14 gate (there is no HTTP
 * endpoint to probe here), but the evidence names the stack and the build-is-last-
 * mile run strategy — more honest than the old bare "shape could not be determined".
 * It NEVER claims the app ran.
 *
 * @param {ReturnType<typeof detectRunTarget>} target - a non-null run target.
 * @param {number} [started] - optional start timestamp for durationMs.
 * @returns {Object} an app-run result with applicable:false and rich evidence.
 */
function nativeNotApplicableResult(target, started) {
  const s = target.strategy;
  return {
    applicable: false,
    launched: false,
    responded: false,
    evidence: {
      shape: 'native',
      language: target.language,
      projectType: target.projectType,
      projectTypeTaxonomy: target.taxonomy || null,
      runCommand: s.command,
      // F9: prefer the taxonomy's authoritative honest flag (target.honest) over the
      // bare language shape, so the evidence never claims a Tauri desktop app "runs"
      // when its honest last mile is build+test.
      honest: target.honest != null ? target.honest : s.honest,
      buildCommand: target.lastMile.build,
      testCommand: target.lastMile.test,
      reason:
        `Detected a ${target.language} ${target.taxonomy || target.projectType} project via the ` +
        `capability registry. Its honest run last mile is build+test (build: ${target.lastMile.build || 'n/a'}; ` +
        `test: ${target.lastMile.test || 'n/a'}; run: ${s.command}); executing it is CR6. ` +
        'Not launched here.'
    },
    durationMs: typeof started === 'number' ? Date.now() - started : 0,
    errors: []
  };
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

/** Shell metacharacters that turn a script into a compound/piped command. */
const SHELL_OPERATOR_CHARS = new Set(['&', '|', ';']);

/**
 * Quote-aware, ReDoS-safe tokenizer for an npm script string.
 *
 * A single linear scan (no backtracking regex) honours single and double quotes
 * so a spaced quoted argument (`--hostname "my host"`) stays ONE token — the old
 * `.split(/\s+/)` shattered it and made a correct dev script fail to launch on
 * POSIX. Any UNQUOTED shell operator (`&&`, `||`, `|`, `;`, `&`) sets
 * `hasShellOperators`; an operator that appears inside quotes is literal data and
 * is NOT flagged.
 *
 * @param {string} scriptStr - The raw script command.
 * @returns {{tokens: string[], hasShellOperators: boolean}} Tokens and an operator flag.
 */
function tokenizeScript(scriptStr) {
  const s = String(scriptStr);
  const tokens = [];
  let cur = '';
  let hasToken = false;
  let inSingle = false;
  let inDouble = false;
  let hasShellOperators = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if (inSingle) {
      if (c === "'") inSingle = false;
      else cur += c;
      hasToken = true;
      continue;
    }
    if (inDouble) {
      if (c === '"') {
        inDouble = false;
      } else if (c === '\\' && i + 1 < s.length && (s[i + 1] === '"' || s[i + 1] === '\\')) {
        cur += s[++i];
      } else {
        cur += c;
      }
      hasToken = true;
      continue;
    }

    if (c === "'") { inSingle = true; hasToken = true; continue; }
    if (c === '"') { inDouble = true; hasToken = true; continue; }
    if (c === '\\' && i + 1 < s.length) { cur += s[++i]; hasToken = true; continue; }

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      if (hasToken) { tokens.push(cur); cur = ''; hasToken = false; }
      continue;
    }

    if (SHELL_OPERATOR_CHARS.has(c)) hasShellOperators = true;
    cur += c;
    hasToken = true;
  }
  if (hasToken) tokens.push(cur);

  return { tokens, hasShellOperators };
}

/**
 * Resolve an npm script string into a concrete (command, args, shell) launch.
 *
 * `node`-based scripts are the strict, fully cross-platform path: they run via
 * `process.execPath` with `shell:false`. Other commands (e.g. a framework's
 * `next dev`) are spawned with `shell:false` on POSIX; on Windows they need the
 * shell to resolve a `.cmd` shim, which is the one narrow, documented exception.
 *
 * A script that contains an unquoted shell operator (`&&`, `||`, `|`, `;`, `&`)
 * is NOT launchable by this direct-spawn path: handing shell metacharacters from
 * a semi-trusted package.json to a shell (cmd.exe on Windows) is a command-
 * injection surface, and mis-tokenizing them into a bare `spawn` would launch the
 * WRONG command. Such a script is returned as `{ unsupported: true, reason }` so
 * `driveServer` surfaces a clear, honest error instead of silently mis-launching.
 *
 * @param {string} scriptStr - The raw script command (e.g. "node server.js").
 * @returns {{command: (string|null), args: string[], shell: boolean,
 *   unsupported?: boolean, reason?: string}} Launch spec, or an unsupported marker.
 */
function resolveScriptCommand(scriptStr) {
  const { tokens, hasShellOperators } = tokenizeScript(scriptStr);

  if (hasShellOperators) {
    return {
      command: null,
      args: [],
      shell: false,
      unsupported: true,
      reason:
        `Dev script contains a shell operator (&&, ||, |, ;, or &): "${String(scriptStr).trim()}". ` +
        'The last-mile runner launches a single command with shell:false so it never hands shell ' +
        'metacharacters from package.json to a shell (a command-injection surface on Windows cmd.exe). ' +
        'Reduce the dev script to a single command (e.g. "node server.js" or "next dev") so the app ' +
        'can be launched directly, or move the compound steps into a separate build script.'
    };
  }

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
 * Decide the honest drive outcome from the terminal state of a launched dev
 * server. Pure and synchronous so the decision is deterministically testable —
 * it is the SAME code `driveServer` runs, not a test double.
 *
 * The precedence encodes two honesty rules:
 *  1. `exited` is DECISIVE. If the child WE launched has exited, that is a
 *     failure regardless of who answers the port. A foreign process squatting on
 *     the (supposedly private) port — e.g. after an EADDRINUSE crash in the port
 *     time-of-check/time-of-use gap — must never let us attest "responded".
 *  2. A 5xx response is a FAILURE. A server that answers '/' with HTTP 500 shows
 *     the human an error page — that is NOT "working"; the status is surfaced.
 *     A 2xx/3xx/4xx response means the server is up (an API-only server may
 *     legitimately 404 on '/'), so those remain `responded:true`.
 *
 * @param {Object} state
 * @param {boolean} state.exited - Whether the launched child has exited.
 * @param {{code:(number|null),signal:(string|null),error?:string}|null} state.exitInfo
 * @param {{ok:boolean, statusCode?:number, body?:string}} state.probe - Last HTTP probe.
 * @param {number} state.port - Port the child was told to bind.
 * @param {number} state.budget - Wall-clock budget (ms) for the timeout message.
 * @param {string} state.stderr - Captured child stderr (for the failure detail).
 * @returns {{responded: boolean, httpStatus: (number|undefined),
 *   bodyExcerpt: (string|undefined), errors: string[]}} The decided outcome.
 */
function classifyServerOutcome(state) {
  const { exited, exitInfo, probe, port, budget, stderr } = state;
  const out = { responded: false, httpStatus: undefined, bodyExcerpt: undefined, errors: [] };
  const stderrTail = (stderr || '').slice(0, 400).trim() || '(none)';

  // Rule 1: a dead child is a failure, whoever answers the port.
  if (exited) {
    const detail = exitInfo && exitInfo.error
      ? exitInfo.error
      : `code ${exitInfo && exitInfo.code}, signal ${exitInfo && exitInfo.signal}`;
    out.errors.push(
      `Dev server exited before responding (${detail}). Stderr: ${stderrTail}`
    );
    return out;
  }

  if (probe && probe.ok) {
    out.httpStatus = probe.statusCode;
    // Rule 2: a 5xx means the app booted but ERRORS on load — not working.
    if (typeof probe.statusCode === 'number' && probe.statusCode >= 500) {
      out.errors.push(
        `Dev server booted but returned HTTP ${probe.statusCode} on / — the app errors on load. ` +
        `Stderr: ${stderrTail}`
      );
      return out;
    }
    out.responded = true;
    out.bodyExcerpt = (probe.body || '').slice(0, 200);
    return out;
  }

  out.errors.push(
    `Dev server did not respond on port ${port} within ${budget}ms. Stderr: ${stderrTail}`
  );
  return out;
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

  const spec = resolveScriptCommand(scriptStr);
  result.evidence.command = scriptStr;
  result.evidence.port = port;

  // A compound/piped script cannot be launched by the direct-spawn path; surface
  // an honest error rather than silently mis-launching a wrong command (Defect 3).
  if (spec.unsupported) {
    result.errors.push(spec.reason);
    return result;
  }
  const { command, args, shell } = spec;

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
    // A warming-up server commonly answers '/' with a TRANSIENT 5xx (DB pool
    // coming up, first compile, a migration running) before its steady 2xx.
    // Keep polling THROUGH a 5xx until a non-5xx response or the deadline, then
    // classify on the LAST probe: a transient 5xx-then-200 recovers, while a
    // persistent 5xx still fails (the last probe at the deadline is the 5xx).
    if (probe.ok && !(typeof probe.statusCode === 'number' && probe.statusCode >= 500)) break;
    await sleep(POLL_INTERVAL_MS);
  }

  result.evidence.stdout = stdout.slice(0, 800);
  result.evidence.stderr = stderr.slice(0, 800);

  // The decision is delegated to the pure `classifyServerOutcome`: `exited` is
  // DECISIVE over any probe (a dead child never attests "responded", even if a
  // foreign process answers the port — Defect 2), and a 5xx response is a failure
  // rather than a false pass (Defect 1). See that function for the honesty rules.
  const outcome = classifyServerOutcome({ exited, exitInfo, probe, port, budget, stderr });
  result.responded = outcome.responded;
  if (outcome.httpStatus !== undefined) result.evidence.httpStatus = outcome.httpStatus;
  if (outcome.bodyExcerpt !== undefined) result.evidence.bodyExcerpt = outcome.bodyExcerpt;
  for (const e of outcome.errors) result.errors.push(e);

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
    if (shape === 'unknown') {
      const target = detectRunTarget(projectPath);
      if (target) return nativeNotApplicableResult(target, started);
    }
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
    if (shape === 'unknown') {
      const target = detectRunTarget(projectPath);
      if (target) return nativeNotApplicableResult(target);
    }
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
  detectRunTarget,
  driveApp,
  driveAppSync,
  scaffoldPlaywright,
  probeHttp,
  resolveScriptCommand,
  classifyServerOutcome,
  getFreePort,
  DEFAULT_TIME_BUDGET_MS
};
