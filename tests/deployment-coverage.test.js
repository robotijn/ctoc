/**
 * Deployment Pipeline — DARK-BRANCH coverage tests.
 *
 * Companion to deployment.test.js (dry-run happy paths), deployment-execute.test.js
 * (real local execution), and security-deployment-injection.test.js (marker-based
 * RCE/SSRF proofs). This file targets the branches those three leave dark, and it
 * targets them the way the unit-test-writer skill demands: every assertion pins a
 * branch that goes RED under mutation, not a line that merely "ran".
 *
 * The angles here that the sibling files do NOT cover:
 *   • The child_process boundary is FAKED (execFileSync captured, never a real
 *     deploy). That lets us assert the exact ARGUMENT ARRAY handed to the boundary
 *     (command-construction correctness: no shell, the untrusted field lands only
 *     inside a single arg) AND prove the boundary is skipped entirely in dry-run.
 *   • The ship gate at the boundary: a deploy fires ONLY when isLive is confirmed.
 *     Dry-run ⇒ zero execFileSync calls; live ⇒ exactly the right call. A mutant
 *     that inverts the gate reds these.
 *   • Option/argument injection is REJECTED before the boundary (a value starting
 *     with '-' or carrying shell metacharacters throws, and execFileSync is never
 *     reached) — the security file asserts "no marker appeared"; this file asserts
 *     "the throw happened and the boundary was never called".
 *   • The webhook SSRF guard's dark arms: non-http(s) protocol, internal host BY
 *     NAME (localhost/.local/.internal), the DNS-resolve path (both resolve and
 *     the non-resolving catch), IPv6 unique-local / link-local blocks, and the
 *     safe-return path for a genuinely public host.
 *   • The script strategy's path-traversal gate (script must live inside project)
 *     and the .sh / .py interpreter selection arms.
 *   • sendNotifications live: a notification failure must be swallowed (never break
 *     the pipeline), and dry-run must make no network attempt.
 *
 * HERMETIC: child_process.execFileSync is faked; http.request / dns.promises.lookup
 * are stubbed only inside the tests that need them and restored in finally. No real
 * push, POST, ssh, docker, or DNS egress. Temp dirs cleaned in after().
 *
 * AI-authored, human-reviewed line-by-line before commit (Veracode/Lasso rule).
 */

const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

// --- Fake the child_process boundary BEFORE loading deployment.js. -----------
// deployment.js destructures execFileSync at module-load, so the fake MUST be
// installed on the shared module object before the require below runs. Node 24
// runs each test file in its own process (default isolation), so this fake is
// confined to this file's process and cannot affect deployment-execute.test.js.
const childProcess = require('child_process');
const realExecFileSync = childProcess.execFileSync;

// Captured boundary calls for the current test. execFileHandler lets a test make
// the fake throw (to simulate a failing deploy) instead of returning canned output.
let captured = [];
let execFileHandler = null;
childProcess.execFileSync = function fakeExecFileSync(file, args, options) {
  captured.push({ file, args, options });
  if (execFileHandler) return execFileHandler(file, args, options);
  return 'FAKE_OUTPUT';
};

const deployment = require('../src/lib/deployment.js');
const {
  executeStrategy,
  deployToEnvironment,
  runDeploymentPipeline,
  httpPostJson,
  sendNotifications
} = deployment;

after(() => {
  childProcess.execFileSync = realExecFileSync;
});

beforeEach(() => {
  captured = [];
  execFileHandler = null;
});

// --- Temp-dir fixtures, cleaned in after(). ----------------------------------
const tmpDirs = [];
function mkTmp(prefix) {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  tmpDirs.push(d);
  return d;
}
after(() => tmpDirs.forEach(d => { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }));

const CTX = { commit: 'abc123', branch: 'main', plan: 'p.md', timestamp: 't' };

// =============================================================================
// 1. SHIP GATE at the boundary — a deploy fires ONLY when isLive is confirmed.
//    Kills: any mutant that inverts / removes the dry-run gate, causing a real
//    execFileSync in simulate mode (the "enabling deployment fired a destructive
//    op by accident" defect the module header swears cannot happen).
// =============================================================================
describe('Ship gate — the boundary is reached only when live', () => {
  it('git-branch in dry-run builds the command but never calls execFileSync', async () => {
    // Arrange
    const cwd = mkTmp('dep-gate-dry-');
    const env = { name: 'staging', strategy: 'git-branch', remote: 'origin', branch: 'deploy/staging' };

    // Act — no opts.dryRun ⇒ simulate.
    const res = await executeStrategy('git-branch', env, CTX, { cwd });

    // Assert — command constructed, boundary untouched, marked dry.
    assert.equal(res.dryRun, true);
    assert.equal(res.executed, undefined);
    assert.equal(captured.length, 0, 'simulate must never reach the child_process boundary');
  });

  it('git-branch live calls execFileSync exactly once with a shell-free argument array', async () => {
    // Arrange
    const cwd = mkTmp('dep-gate-live-');
    const env = { name: 'staging', strategy: 'git-branch', remote: 'origin', branch: 'deploy/staging' };

    // Act
    const res = await executeStrategy('git-branch', env, CTX, { dryRun: false, cwd });

    // Assert — the untrusted branch name lands ONLY inside the ref arg; no shell string.
    assert.equal(res.executed, true);
    assert.equal(captured.length, 1);
    assert.equal(captured[0].file, 'git');
    assert.deepEqual(captured[0].args, ['push', 'origin', 'HEAD:refs/heads/deploy/staging']);
  });

  it('full pipeline at the default dry_run never touches the deploy boundary yet reports success', async () => {
    // Arrange — enabled + a git-branch target, but dry_run left at its safe default (true).
    const dir = mkTmp('dep-pipe-dry-');
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'plans', 'done'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.ctoc', 'settings.json'), JSON.stringify({
      deployment: {
        enabled: true,
        environments: [{ name: 'staging', enabled: true, strategy: 'git-branch', branch: 'deploy/staging' }],
        approval: { staging: 'auto', production: 'auto' }
      }
    }));
    const planPath = path.join(dir, 'plans', 'done', 'f.md');
    fs.writeFileSync(planPath, '# f');

    // Act
    const result = await runDeploymentPipeline(planPath, dir);

    // Assert — success, but NOT a single real deploy call happened.
    assert.equal(result.status, 'success');
    assert.equal(result.dryRun, true);
    assert.equal(captured.length, 0, 'enabled-but-dry pipeline must fire no real deploy command');
  });

  it('full pipeline with dry_run:false threads the live gate through to the boundary', async () => {
    // Arrange
    const dir = mkTmp('dep-pipe-live-');
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'plans', 'done'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.ctoc', 'settings.json'), JSON.stringify({
      deployment: {
        enabled: true,
        dry_run: false,
        environments: [{ name: 'staging', enabled: true, strategy: 'git-branch', branch: 'deploy/staging', remote: 'origin' }],
        approval: { staging: 'auto', production: 'auto' }
      }
    }));
    const planPath = path.join(dir, 'plans', 'done', 'f.md');
    fs.writeFileSync(planPath, '# f');

    // Act
    const result = await runDeploymentPipeline(planPath, dir);

    // Assert — the git push actually reached the (faked) boundary via the pipeline.
    assert.equal(result.status, 'success');
    assert.equal(result.dryRun, false);
    assert.equal(captured.length, 1);
    assert.equal(captured[0].file, 'git');
    assert.deepEqual(captured[0].args, ['push', 'origin', 'HEAD:refs/heads/deploy/staging']);
  });
});

// =============================================================================
// 2. OPTION / ARGUMENT INJECTION is rejected BEFORE the boundary.
//    assertSafeArg throws on a leading '-' (option injection) or a shell
//    metacharacter, and execFileSync is never reached. Kills any mutant that
//    drops the guard or lets a '-'/meta value through into the arg array.
// =============================================================================
describe('Config-value neutralization — unsafe args are rejected, boundary never reached', () => {
  const ROWS = [
    { id: 'git-branch/remote leading-dash', strategy: 'git-branch',
      env: { name: 's', remote: '-upload-pack=evil', branch: 'deploy/s' }, err: /Unsafe git remote/ },
    { id: 'git-branch/branch leading-dash', strategy: 'git-branch',
      env: { name: 's', remote: 'origin', branch: '-evil' }, err: /Unsafe git branch/ },
    { id: 'git-branch/branch shell-meta', strategy: 'git-branch',
      env: { name: 's', remote: 'origin', branch: 'deploy;touch pwned' }, err: /Unsafe git branch/ },
    { id: 'git-tag/remote leading-dash', strategy: 'git-tag',
      env: { name: 's', remote: '-evil', tagPattern: 'v1' }, err: /Unsafe git remote/ },
    { id: 'docker/image leading-dash', strategy: 'docker',
      env: { name: 'p', image: '-evil', imageTag: 'v1', context: '.' }, err: /Unsafe docker image/ },
    { id: 'ssh/user leading-dash', strategy: 'ssh',
      env: { name: 'p', host: 'prod.example.com', user: '-oProxyCommand=evil', command: 'true' }, err: /Unsafe ssh user/ },
    { id: 'ssh/host shell-meta', strategy: 'ssh',
      env: { name: 'p', host: 'prod;touch pwned', user: 'deploy', command: 'true' }, err: /Unsafe ssh host/ }
  ];

  for (const row of ROWS) {
    it(`rejects and skips the boundary [${row.id}]`, async () => {
      // Arrange
      const cwd = mkTmp('dep-reject-');

      // Act + Assert — the guard throws...
      await assert.rejects(
        executeStrategy(row.strategy, { strategy: row.strategy, ...row.env }, CTX, { dryRun: false, cwd }),
        row.err
      );
      // ...and no command ever reached execFileSync.
      assert.equal(captured.length, 0, 'unsafe value must be rejected before the deploy boundary');
    });
  }
});

// =============================================================================
// 3. PROVIDER/COMMAND CONSTRUCTION — docker live, incl. the optional push arm.
//    Covers lines 486/488/490 (docker build + conditional push + return) and
//    pins the exact argv. Kills a mutant that mis-builds ref, drops the context
//    arg, or always/never pushes.
// =============================================================================
describe('Docker strategy — live command construction and the push second-operand', () => {
  it('builds "<image>:<tag> <context>" and pushes when config.push is true', async () => {
    // Act
    const res = await executeStrategy(
      'docker',
      { name: 'production', image: 'myapp', imageTag: 'v1', context: '.', push: true },
      CTX,
      { dryRun: false, cwd: mkTmp('dep-docker-') }
    );

    // Assert — two boundary calls: build then push, both shell-free with correct argv.
    assert.equal(res.executed, true);
    assert.equal(captured.length, 2);
    assert.deepEqual(captured[0].args, ['build', '-t', 'myapp:v1', '.']);
    assert.deepEqual(captured[1].args, ['push', 'myapp:v1']);
  });

  it('does NOT push when config.push is falsy (only the build call fires)', async () => {
    // Act
    const res = await executeStrategy(
      'docker',
      { name: 'production', image: 'myapp', imageTag: 'v1', context: '.' }, // push omitted
      CTX,
      { dryRun: false, cwd: mkTmp('dep-docker-nopush-') }
    );

    // Assert
    assert.equal(res.executed, true);
    assert.equal(captured.length, 1, 'no push call when config.push is falsy');
    assert.deepEqual(captured[0].args, ['build', '-t', 'myapp:v1', '.']);
  });
});

// =============================================================================
// 4. SCRIPT STRATEGY — path-traversal gate + interpreter selection arms.
// =============================================================================
describe('Script strategy — confinement gate and interpreter selection', () => {
  it('rejects a script that resolves OUTSIDE the project root (path-traversal gate)', async () => {
    // Arrange — a real file exists outside the cwd, but the gate must still refuse it.
    const parent = mkTmp('dep-script-parent-');
    const cwd = path.join(parent, 'proj');
    fs.mkdirSync(cwd);
    fs.writeFileSync(path.join(parent, 'outside.sh'), 'echo hi');

    // Act + Assert — line 446/447: escape attempt throws, boundary never reached.
    await assert.rejects(
      executeStrategy('script', { name: 'staging', strategy: 'script', script: '../outside.sh' }, CTX, { dryRun: false, cwd }),
      /must live inside the project/
    );
    assert.equal(captured.length, 0);
  });

  it('picks the shell interpreter for a .sh script and passes it as a single arg', async () => {
    // Arrange
    const cwd = mkTmp('dep-script-sh-');
    fs.writeFileSync(path.join(cwd, 'deploy.sh'), 'echo hi');

    // Act — line 458 (.sh ⇒ file = 'sh').
    const res = await executeStrategy(
      'script', { name: 'staging', strategy: 'script', script: 'deploy.sh' }, CTX, { dryRun: false, cwd }
    );

    // Assert — interpreter is 'sh', script path is a single argument, env is exported.
    assert.equal(res.executed, true);
    assert.equal(captured.length, 1);
    assert.equal(captured[0].file, 'sh');
    assert.deepEqual(captured[0].args, [path.resolve(cwd, 'deploy.sh')]);
    assert.equal(captured[0].options.env.DEPLOY_ENV, 'staging');
    assert.equal(captured[0].options.env.DEPLOY_COMMIT, 'abc123');
  });

  it('picks the python interpreter for a .py script', async () => {
    // Arrange
    const cwd = mkTmp('dep-script-py-');
    fs.writeFileSync(path.join(cwd, 'deploy.py'), 'print("hi")');

    // Act — line 459 (.py ⇒ file = 'python3').
    const res = await executeStrategy(
      'script', { name: 'production', strategy: 'script', script: 'deploy.py' }, CTX, { dryRun: false, cwd }
    );

    // Assert
    assert.equal(res.executed, true);
    assert.equal(captured[0].file, 'python3');
    assert.deepEqual(captured[0].args, [path.resolve(cwd, 'deploy.py')]);
  });

  it('fails the environment when a live script does not exist on disk', async () => {
    // Arrange — via deployToEnvironment so we observe the failed status, not a raw throw.
    const cwd = mkTmp('dep-script-missing-');

    // Act
    const res = await deployToEnvironment(
      { name: 'staging', strategy: 'script', script: 'nope.sh' }, CTX, { dryRun: false, cwd }
    );

    // Assert
    assert.equal(res.status, 'failed');
    assert.match(res.error, /Deploy script not found/);
    assert.equal(captured.length, 0);
  });
});

// =============================================================================
// 5. WEBHOOK SSRF GUARD — the dark arms of assertSafeWebhookUrl.
//    All hermetic: each rejection fires before any socket, and the one success
//    case stubs dns + http.request so nothing leaves the process.
// =============================================================================
describe('Webhook URL guard — protocol, internal-name, DNS and IPv6 arms', () => {
  it('rejects a non-http(s) protocol', async () => {
    await assert.rejects(httpPostJson('ftp://example.com/x', { p: 1 }), /http or https/);
  });

  const INTERNAL_NAMES = ['localhost', 'svc.localhost', 'api.local', 'db.internal'];
  for (const host of INTERNAL_NAMES) {
    it(`rejects internal host by name [${host}]`, async () => {
      await assert.rejects(httpPostJson(`http://${host}/x`, { p: 1 }), /internal host/);
    });
  }

  it('rejects an IPv6 unique-local address (fc00::/7)', async () => {
    await assert.rejects(httpPostJson('http://[fd00::1]/x', { p: 1 }), /non-public address/);
  });

  it('rejects an IPv6 link-local address (fe80::/10)', async () => {
    await assert.rejects(httpPostJson('http://[fe80::1]/x', { p: 1 }), /non-public address/);
  });

  it('rejects a hostname that does not resolve (DNS lookup path, catch arm)', async () => {
    // Arrange — stub the resolver so this is hermetic (no real DNS egress).
    const dns = require('dns');
    const orig = dns.promises.lookup;
    dns.promises.lookup = async () => { throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }); };
    try {
      // Act + Assert — line 361 runs the lookup, line 362 catches and throws.
      await assert.rejects(httpPostJson('http://does-not-resolve.example/x', { p: 1 }), /did not resolve/);
    } finally {
      dns.promises.lookup = orig;
    }
  });

  it('accepts a public host that resolves to a routable address (safe-return path)', async () => {
    // Arrange — stub DNS to a public IP and stub http.request so no socket opens.
    const dns = require('dns');
    const http = require('http');
    const origLookup = dns.promises.lookup;
    const origRequest = http.request;
    dns.promises.lookup = async () => [{ address: '93.184.216.34' }]; // public (documented TEST-NET-adjacent)
    http.request = (parsed, options, cb) => {
      const res = new EventEmitter();
      res.statusCode = 202;
      res.resume = () => {};
      setImmediate(() => { cb(res); res.emit('end'); });
      return { on() { return this; }, write() { return this; }, end() { return this; } };
    };
    try {
      // Act — passes the guard (line 369 returns parsed), then the POST resolves.
      const status = await httpPostJson('http://example.com/hook', { ping: 1 });

      // Assert
      assert.equal(status, 202, 'a public host must pass the guard and return the HTTP status');
    } finally {
      dns.promises.lookup = origLookup;
      http.request = origRequest;
    }
  });
});

// =============================================================================
// 6. sendNotifications LIVE — failure is swallowed; dry-run makes no attempt.
// =============================================================================
describe('sendNotifications — live delivery is best-effort, dry-run is silent', () => {
  it('swallows a delivery failure so a notification error never breaks the pipeline', async () => {
    // Arrange — a blocked loopback URL makes httpPostJson reject inside the loop.
    // Act + Assert — must resolve (the catch swallows), not reject.
    await assert.doesNotReject(
      sendNotifications(['http://127.0.0.1:1/hook'], { event: 'deployment_failed' }, { dryRun: false })
    );
  });

  it('makes no network attempt in dry-run even with non-empty URLs', async () => {
    // Arrange — spy the request boundary; dry-run must return before reaching it.
    const http = require('http');
    const https = require('https');
    const origHttp = http.request;
    const origHttps = https.request;
    let attempts = 0;
    http.request = https.request = () => { attempts++; return { on() { return this; }, write() { return this; }, end() { return this; } }; };
    try {
      // Act
      await sendNotifications(['http://example.com/hook'], { event: 'x' }, { dryRun: true });

      // Assert — the dry-run guard short-circuited before any request.
      assert.equal(attempts, 0, 'dry-run must not dispatch notification requests');
    } finally {
      http.request = origHttp;
      https.request = origHttps;
    }
  });

  it('returns early for an empty URL list (no boundary interaction)', async () => {
    await assert.doesNotReject(sendNotifications([], { event: 'x' }, { dryRun: false }));
    assert.equal(captured.length, 0);
  });
});
