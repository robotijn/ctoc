/**
 * Security — Deployment pipeline command injection, SSRF, and secret leakage.
 *
 * src/lib/deployment.js builds shell strings via raw interpolation and runs them
 * through execSync (e.g. `git push ${remote} HEAD:refs/heads/${targetBranch}`,
 * `git tag ${tag} && git push ${remote} ${tag}`, docker/ssh/script executors),
 * and the webhook strategy POSTs to a raw config URL with no SSRF guard. Config
 * values come from the .ctoc/settings.json `deployment` block — attacker- or
 * mistake-controlled. This file asserts the SECURE contract for each path.
 *
 * SAFETY / HERMETICITY:
 *   - Every test runs in a fresh fs.mkdtempSync + fs.realpathSync temp dir.
 *   - Injection payloads are HARMLESS SENTINELS ONLY: they `touch` a marker file
 *     (`INJECTED_MARKER`) inside the temp dir. No rm, no destructive commands.
 *   - Injection is DETECTED by checking whether the marker file appeared.
 *   - Git tests use a LOCAL BARE remote — never the network.
 *   - SSRF tests aim at an unroutable loopback port so nothing actually connects;
 *     we assert on refusal/validation, not on a live connection.
 *   - opts.cwd is always the temp dir; the real repo is never touched.
 *   - Temp dirs are removed in afterEach.
 *
 * A FAILING assertion here is a REAL security bug. It is left to fail on purpose
 * (no skip, no weakening). The header comment of each test names the bug it proves.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const {
  executeStrategy,
  deployToEnvironment,
  isLive,
  httpPostJson
} = require(path.join(REPO, 'src', 'lib', 'deployment.js'));

// The sentinel a successful injection would create. Harmless: it only `touch`es.
const MARKER = 'INJECTED_MARKER';

let temp;

beforeEach(() => {
  temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-dep-sec-')));
});

afterEach(() => {
  if (temp) {
    fs.rmSync(temp, { recursive: true, force: true });
    temp = null;
  }
});

// Absolute path to the marker the injection would create, and a checker.
function markerPath() {
  return path.join(temp, MARKER);
}
function markerExists() {
  return fs.existsSync(markerPath());
}

// A harmless POSIX injection payload that appends a `touch <temp>/INJECTED_MARKER`
// to whatever shell string it lands in. `;` chains; the marker path is absolute
// so cwd does not matter. Kept harmless: touch only, never rm.
function injectSemicolon(prefix) {
  return `${prefix}; touch ${markerPath()}`;
}
// Backtick/command-substitution form for fields that may sit mid-word.
function injectSubst(prefix) {
  return `${prefix}$(touch ${markerPath()})`;
}

// Build a minimal real git repo + LOCAL bare remote in the temp dir so the
// git strategies can run live without ever reaching the network. Returns the
// work tree path (used as opts.cwd) and the bare remote path.
function makeGitRepo() {
  const bare = path.join(temp, 'bare.git');
  const work = path.join(temp, 'work');
  fs.mkdirSync(bare, { recursive: true });
  fs.mkdirSync(work, { recursive: true });
  execFileSync('git', ['init', '--bare'], { cwd: bare, stdio: 'ignore' });
  execFileSync('git', ['init'], { cwd: work, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'ci@example.com'], { cwd: work, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'CI'], { cwd: work, stdio: 'ignore' });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: work, stdio: 'ignore' });
  fs.writeFileSync(path.join(work, 'app.txt'), 'v1');
  execFileSync('git', ['add', '-A'], { cwd: work, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: work, stdio: 'ignore' });
  // Bare remote referenced by name 'origin' (so the strategy's default remote works
  // when we are NOT injecting via remote). The remote URL is the local bare path.
  execFileSync('git', ['remote', 'add', 'origin', bare], { cwd: work, stdio: 'ignore' });
  return { work, bare };
}

// Run a strategy live and swallow execution errors. An injected payload may make
// the surrounding git/docker/ssh command fail, but the marker side effect already
// fired BEFORE the failure — so we only care whether the marker exists, never
// whether the call threw. Returns the resolved result or the caught error.
async function runLiveTolerant(strategy, config, context, cwd) {
  try {
    return await executeStrategy(strategy, config, context, { dryRun: false, cwd });
  } catch (err) {
    return err;
  }
}

// ---------------------------------------------------------------------------
// 1. COMMAND INJECTION via config — per shell-executing strategy.
//    CONTRACT: a sentinel in a config value MUST NOT create the marker.
//    The executor must validate/reject/escape config values (safe names only).
//    Marker present === real RCE === expected FAIL.
// ---------------------------------------------------------------------------
describe('Security — command injection via deployment config', () => {
  it('git-branch: a `;` payload in `branch` must NOT execute (proves RCE via branch name)', async () => {
    const { work } = makeGitRepo();
    const env = { name: 'staging', strategy: 'git-branch', remote: 'origin', branch: injectSemicolon('deploy/staging') };
    await runLiveTolerant('git-branch', env, { commit: 'abc' }, work);
    assert.equal(markerExists(), false,
      'INJECTION: git-branch executed an attacker payload embedded in config.branch (RCE)');
  });

  it('git-branch: a `;` payload in `remote` must NOT execute (proves RCE via remote)', async () => {
    const { work } = makeGitRepo();
    const env = { name: 'staging', strategy: 'git-branch', remote: injectSemicolon('origin'), branch: 'deploy/staging' };
    await runLiveTolerant('git-branch', env, { commit: 'abc' }, work);
    assert.equal(markerExists(), false,
      'INJECTION: git-branch executed an attacker payload embedded in config.remote (RCE)');
  });

  it('git-tag: a `;` payload in `tagPattern` must NOT execute (proves RCE via tag)', async () => {
    const { work } = makeGitRepo();
    // tagPattern is substituted into the tag, which is interpolated into
    // `git tag <tag> && git push ...` — a classic injection sink.
    const env = { name: 'staging', strategy: 'git-tag', remote: 'origin', tagPattern: injectSemicolon('v-{env}') };
    await runLiveTolerant('git-tag', env, { commit: 'abc' }, work);
    assert.equal(markerExists(), false,
      'INJECTION: git-tag executed an attacker payload embedded in config.tagPattern (RCE)');
  });

  it('git-tag: a `;` payload in `remote` must NOT execute (proves RCE via remote)', async () => {
    const { work } = makeGitRepo();
    const env = { name: 'staging', strategy: 'git-tag', remote: injectSemicolon('origin'), tagPattern: 'v-{env}' };
    await runLiveTolerant('git-tag', env, { commit: 'abc' }, work);
    assert.equal(markerExists(), false,
      'INJECTION: git-tag executed an attacker payload embedded in config.remote (RCE)');
  });

  it('docker: a `;` payload in `image` must NOT execute (proves RCE via image name)', async () => {
    const env = { name: 'production', strategy: 'docker', image: injectSemicolon('myapp'), imageTag: 'v1', context: '.' };
    await runLiveTolerant('docker', env, { commit: 'abc' }, temp);
    assert.equal(markerExists(), false,
      'INJECTION: docker executed an attacker payload embedded in config.image (RCE)');
  });

  it('docker: a `;` payload in `context` must NOT execute (proves RCE via build context)', async () => {
    const env = { name: 'production', strategy: 'docker', image: 'myapp', imageTag: 'v1', context: injectSemicolon('.') };
    await runLiveTolerant('docker', env, { commit: 'abc' }, temp);
    assert.equal(markerExists(), false,
      'INJECTION: docker executed an attacker payload embedded in config.context (RCE)');
  });

  it('ssh: a `;` payload in `host` must NOT execute (proves RCE via host)', async () => {
    // `command` is JSON.stringified, but host/user are interpolated raw into
    // `ssh ${user}@${host} ...` — injectable before ssh even resolves the host.
    const env = { name: 'production', strategy: 'ssh', host: injectSemicolon('prod.example.com'), user: 'deploy', command: 'true' };
    await runLiveTolerant('ssh', env, { commit: 'abc' }, temp);
    assert.equal(markerExists(), false,
      'INJECTION: ssh executed an attacker payload embedded in config.host (RCE)');
  });

  it('ssh: a `;` payload in `user` must NOT execute (proves RCE via user)', async () => {
    const env = { name: 'production', strategy: 'ssh', host: 'prod.example.com', user: injectSemicolon('deploy'), command: 'true' };
    await runLiveTolerant('ssh', env, { commit: 'abc' }, temp);
    assert.equal(markerExists(), false,
      'INJECTION: ssh executed an attacker payload embedded in config.user (RCE)');
  });

  it('script: a command-substitution payload in `script` must NOT execute (proves arbitrary exec, no allowlist)', async () => {
    // The script strategy runs config.script verbatim through the shell. A secure
    // design would constrain it to a vetted path/allowlist rather than executing
    // any string. We use the substitution form to make the marker the side effect.
    const env = { name: 'staging', strategy: 'script', script: injectSubst('echo ') };
    await runLiveTolerant('script', env, { commit: 'abc' }, temp);
    assert.equal(markerExists(), false,
      'INJECTION: script strategy executed an arbitrary attacker-controlled shell string (no allowlist)');
  });
});

// ---------------------------------------------------------------------------
// 2. DRY-RUN SAFETY — default (dry_run:true) must perform NO side effect.
//    Even with an injection payload present, simulate mode must not run it.
// ---------------------------------------------------------------------------
describe('Security — dry-run performs no side effects', () => {
  it('git-branch simulate: injection payload in config does not execute; reports dryRun:true', async () => {
    const { work } = makeGitRepo();
    const env = { name: 'staging', strategy: 'git-branch', remote: 'origin', branch: injectSemicolon('deploy/staging') };
    // No opts → simulate (isLive false). Build the command, run nothing.
    const res = await executeStrategy('git-branch', env, { commit: 'abc' }, { cwd: work });
    assert.equal(res.dryRun, true, 'simulate must report dryRun:true');
    assert.equal(res.executed, undefined, 'simulate must not mark executed');
    assert.equal(markerExists(), false, 'simulate must not run any command');
  });

  it('git-tag simulate: reports dryRun:true and creates no marker', async () => {
    const { work } = makeGitRepo();
    const env = { name: 'staging', strategy: 'git-tag', remote: 'origin', tagPattern: injectSemicolon('v-{env}') };
    const res = await executeStrategy('git-tag', env, { commit: 'abc' }, { cwd: work });
    assert.equal(res.dryRun, true);
    assert.equal(markerExists(), false);
  });

  it('script simulate: reports dryRun:true and creates no marker', async () => {
    const env = { name: 'staging', strategy: 'script', script: injectSubst('echo ') };
    const res = await executeStrategy('script', env, { commit: 'abc' }, { cwd: temp });
    assert.equal(res.dryRun, true);
    assert.equal(markerExists(), false);
  });

  it('docker simulate: reports dryRun:true and creates no marker', async () => {
    const env = { name: 'production', strategy: 'docker', image: injectSemicolon('myapp'), imageTag: 'v1' };
    const res = await executeStrategy('docker', env, { commit: 'abc' }, { cwd: temp });
    assert.equal(res.dryRun, true);
    assert.equal(markerExists(), false);
  });

  it('ssh simulate: reports dryRun:true and creates no marker', async () => {
    const env = { name: 'production', strategy: 'ssh', host: injectSemicolon('prod.example.com'), user: 'deploy', command: 'true' };
    const res = await executeStrategy('ssh', env, { commit: 'abc' }, { cwd: temp });
    assert.equal(res.dryRun, true);
    assert.equal(markerExists(), false);
  });
});

// ---------------------------------------------------------------------------
// 3. WEBHOOK SSRF — a webhook URL at a loopback/internal target must be refused.
//
//    HERMETIC: we never actually connect. We intercept http/https `request` so
//    the socket is never opened, and assert the SECURE contract: an internal /
//    loopback / link-local host must be REFUSED before any request is dispatched.
//    If the executor calls request() with the internal host, that IS the SSRF
//    (the connection would have gone to the internal target) — expected FAIL.
// ---------------------------------------------------------------------------
describe('Security — webhook SSRF protection', () => {
  const http = require('http');
  const https = require('https');

  // Replace request() on both modules with a spy that records the destination
  // host and immediately aborts WITHOUT opening a socket. Returns a restore fn
  // and a list of hosts the code attempted to reach.
  function interceptRequest() {
    const attempted = [];
    const origHttp = http.request;
    const origHttps = https.request;
    function fakeRequest(arg) {
      // arg is the parsed URL object passed by httpPostJson.
      const host = (arg && (arg.hostname || arg.host)) || String(arg);
      attempted.push(host);
      // Return a request-like object that NEVER touches the network. We capture
      // the caller's 'error' handler and fire it on the next tick so the
      // httpPostJson promise settles (rejects) instead of hanging the test.
      const handlers = {};
      const fake = {
        on(event, cb) { handlers[event] = cb; return this; },
        write() { return this; },
        end() {
          setImmediate(() => {
            if (handlers.error) handlers.error(new Error('intercepted: no network in test'));
          });
          return this;
        },
        destroy() { return this; }
      };
      return fake;
    }
    http.request = fakeRequest;
    https.request = fakeRequest;
    return {
      attempted,
      restore() { http.request = origHttp; https.request = origHttps; }
    };
  }

  // An internal host is one the SSRF guard must refuse: loopback or link-local
  // (cloud metadata lives at 169.254.169.254).
  function isInternalHost(host) {
    return host === '127.0.0.1' || host === 'localhost' || host === '::1' ||
      host.startsWith('169.254.') || host.startsWith('10.') ||
      host.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  }

  it('refuses a loopback webhook (127.0.0.1) — must not dispatch a request to localhost', async () => {
    const spy = interceptRequest();
    try {
      // Either httpPostJson rejects on validation (good), or it dispatches via the
      // intercepted request() (bad — recorded in spy.attempted). We tolerate the
      // reject and inspect what was attempted.
      await httpPostJson('http://127.0.0.1:1/x', { ping: 1 }).catch(() => {});
    } finally {
      spy.restore();
    }
    const hitInternal = spy.attempted.some(isInternalHost);
    assert.equal(hitInternal, false,
      `SSRF: webhook dispatched a request to a loopback host (${spy.attempted.join(', ')}) instead of refusing it`);
  });

  it('refuses the cloud metadata endpoint (169.254.169.254) — must not dispatch to link-local', async () => {
    const spy = interceptRequest();
    try {
      await httpPostJson('http://169.254.169.254/latest/meta-data/', { ping: 1 }).catch(() => {});
    } finally {
      spy.restore();
    }
    const hitInternal = spy.attempted.some(isInternalHost);
    assert.equal(hitInternal, false,
      `SSRF: webhook dispatched a request to the cloud metadata IP (${spy.attempted.join(', ')}) instead of refusing it`);
  });

  it('webhook strategy via deployToEnvironment refuses an internal target host', async () => {
    const spy = interceptRequest();
    let attempted;
    try {
      await deployToEnvironment(
        { name: 'production', strategy: 'webhook', url: 'http://169.254.169.254/latest/meta-data/' },
        { commit: 'abc', branch: 'main', plan: 'p.md', timestamp: 't' },
        { dryRun: false }
      ).catch(() => {});
      attempted = spy.attempted.slice();
    } finally {
      spy.restore();
    }
    assert.equal(attempted.some(isInternalHost), false,
      `SSRF: webhook strategy dispatched a request to an internal host (${attempted.join(', ')}) instead of refusing it`);
  });
});

// ---------------------------------------------------------------------------
// 4. SECRET LEAKAGE — secrets in config must NOT be echoed verbatim into the
//    returned intent/result/command/log object.
// ---------------------------------------------------------------------------
describe('Security — secrets are not echoed into returned intent', () => {
  const TOKEN = 'SUPER_SECRET_TOKEN_abc123XYZ';

  function flatten(obj) {
    // Serialize the whole returned object so a leak anywhere (command, fields,
    // nested payload) is caught, not just top-level keys.
    try {
      return JSON.stringify(obj);
    } catch {
      return String(obj);
    }
  }

  it('webhook (simulate): a token field in config is not present verbatim in the intent', async () => {
    const env = { name: 'production', strategy: 'webhook', url: 'http://example.com/hook', token: TOKEN, secret: TOKEN };
    const res = await executeStrategy('webhook', env, { commit: 'abc', branch: 'main', plan: 'p.md', timestamp: 't' });
    assert.equal(res.dryRun, true);
    assert.equal(flatten(res).includes(TOKEN), false,
      'SECRET LEAK: webhook intent echoed the configured token/secret verbatim');
  });

  it('ssh (simulate): an ssh private-key field in config is not present verbatim in the intent', async () => {
    const env = { name: 'production', strategy: 'ssh', host: 'prod.example.com', user: 'deploy', command: 'true', sshKey: TOKEN, privateKey: TOKEN };
    const res = await executeStrategy('ssh', env, { commit: 'abc' });
    assert.equal(res.dryRun, true);
    assert.equal(flatten(res).includes(TOKEN), false,
      'SECRET LEAK: ssh intent echoed the configured ssh key verbatim');
  });

  it('script (simulate): a secret embedded in the script string is not surfaced verbatim in the intent', async () => {
    const env = { name: 'staging', strategy: 'script', script: `deploy.sh --token=${TOKEN}` };
    const res = await executeStrategy('script', env, { commit: 'abc' });
    assert.equal(res.dryRun, true);
    assert.equal(flatten(res).includes(TOKEN), false,
      'SECRET LEAK: script intent echoed the embedded token verbatim in command/script');
  });
});

// ---------------------------------------------------------------------------
// 5. dry_run flag integrity — only dryRun===false triggers execution.
//    Truthy/other/missing values must stay simulated (fail-safe gating).
// ---------------------------------------------------------------------------
describe('Security — isLive / real-exec gating is fail-safe', () => {
  it('isLive is true ONLY for an explicit boolean false', () => {
    assert.equal(isLive({ dryRun: false }), true);
    assert.equal(isLive({ dryRun: true }), false);
    assert.equal(isLive({ dryRun: 0 }), false, "0 must not be treated as 'live'");
    assert.equal(isLive({ dryRun: 'false' }), false, "the string 'false' must not be treated as 'live'");
    assert.equal(isLive({ dryRun: null }), false);
    assert.equal(isLive({ dryRun: undefined }), false);
    assert.equal(isLive({}), false);
    assert.equal(isLive(undefined), false);
    assert.equal(isLive(null), false);
  });

  it('a non-false dryRun (string "false") simulates — no command runs even with injection payload', async () => {
    const env = { name: 'staging', strategy: 'script', script: injectSubst('echo ') };
    // dryRun:'false' is truthy-but-not-boolean-false → must simulate.
    const res = await executeStrategy('script', env, { commit: 'abc' }, { dryRun: 'false', cwd: temp });
    assert.equal(res.dryRun, true, "string 'false' must be treated as simulate, not live");
    assert.equal(markerExists(), false, "string 'false' must NOT trigger real execution");
  });

  it('a truthy-numeric dryRun (1) simulates — fail-safe', async () => {
    const env = { name: 'staging', strategy: 'script', script: injectSubst('echo ') };
    const res = await executeStrategy('script', env, { commit: 'abc' }, { dryRun: 1, cwd: temp });
    assert.equal(res.dryRun, true);
    assert.equal(markerExists(), false);
  });
});
