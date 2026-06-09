/**
 * Deployment Pipeline — REAL execution tests.
 *
 * The base deployment.test.js covers the simulate (dry_run) path. This file
 * proves the executors actually DO the thing when dry_run is false, using only
 * local resources (a temp script, a local bare git remote, a localhost HTTP
 * server) — never the network, ssh, or docker.
 *
 * Safety contract under test: nothing executes unless dry_run is explicitly
 * false, and the Gate-3 default (dry_run: true) never fires a real operation.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { execSync } = require('child_process');

const {
  DEFAULT_CONFIG,
  executeStrategy,
  deployToEnvironment,
  runDeploymentPipeline,
  isLive,
  httpPostJson,
  getDeploymentHistory
} = require('../src/lib/deployment.js');

const tmpDirs = [];
function mkTmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}
after(() => tmpDirs.forEach(d => fs.rmSync(d, { recursive: true, force: true })));

describe('Deployment execution — safety default', () => {
  it('dry_run is the shipped default', () => {
    assert.equal(DEFAULT_CONFIG.dry_run, true);
  });

  it('isLive is true only when dryRun is explicitly false', () => {
    assert.equal(isLive({ dryRun: false }), true);
    assert.equal(isLive({ dryRun: true }), false);
    assert.equal(isLive({}), false);
    assert.equal(isLive(undefined), false);
  });

  it('a bare 2-arg executor call simulates (no side effects)', async () => {
    const dir = mkTmp('dep-sim-');
    fs.writeFileSync(path.join(dir, 'deploy.js'), "require('fs').writeFileSync('marker.txt','ran')");
    // No opts → simulate. Must NOT run the script.
    const res = await executeStrategy('script', { name: 'staging', script: 'node deploy.js' }, { commit: 'abc' });
    assert.equal(res.dryRun, true);
    assert.equal(res.command, 'node deploy.js');
    assert.equal(fs.existsSync(path.join(dir, 'marker.txt')), false, 'script must not run in simulate');
  });
});

describe('Deployment execution — script strategy (live)', () => {
  it('actually runs the script and passes DEPLOY_ENV when dry_run is false', async () => {
    const dir = mkTmp('dep-script-');
    fs.writeFileSync(
      path.join(dir, 'deploy.js'),
      "require('fs').writeFileSync('deployed.txt', process.env.DEPLOY_ENV + ':' + process.env.DEPLOY_COMMIT)"
    );
    const res = await executeStrategy(
      'script',
      { name: 'production', script: 'node deploy.js' },
      { commit: 'c0ffee' },
      { dryRun: false, cwd: dir }
    );
    assert.equal(res.executed, true);
    const written = fs.readFileSync(path.join(dir, 'deployed.txt'), 'utf8');
    assert.equal(written, 'production:c0ffee', 'script ran with env vars exported');
  });
});

describe('Deployment execution — git-branch strategy (live, local remote)', () => {
  it('pushes the current commit to the env branch on a local bare remote', () => {
    const bare = mkTmp('dep-remote-');
    const work = mkTmp('dep-work-');
    execSync('git init --bare', { cwd: bare });
    execSync('git init', { cwd: work });
    execSync('git config user.email ci@example.com', { cwd: work });
    execSync('git config user.name CI', { cwd: work });
    execSync('git config commit.gpgsign false', { cwd: work });
    fs.writeFileSync(path.join(work, 'app.txt'), 'v1');
    execSync('git add -A', { cwd: work });
    execSync('git commit -m init', { cwd: work });
    execSync(`git remote add origin "${bare}"`, { cwd: work });

    const res = executeStrategyGitBranchSync(work);

    function executeStrategyGitBranchSync(cwd) {
      // git-branch is synchronous; await is a no-op on a plain value.
      return require('../src/lib/deployment.js').executeStrategy(
        'git-branch',
        { name: 'staging', branch: 'deploy/staging', remote: 'origin' },
        { commit: 'x' },
        { dryRun: false, cwd }
      );
    }

    return Promise.resolve(res).then(r => {
      assert.equal(r.executed, true);
      // The branch must now exist on the bare remote — throws if missing.
      const ref = execSync('git show-ref refs/heads/deploy/staging', { cwd: bare, encoding: 'utf8' });
      assert.match(ref, /refs\/heads\/deploy\/staging/);
    });
  });
});

describe('Deployment execution — webhook strategy (live, localhost)', () => {
  it('POSTs the payload to the configured URL and parses status', async () => {
    let received = null;
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => { received = JSON.parse(body); res.statusCode = 200; res.end('ok'); });
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${server.address().port}/deploy`;
    try {
      const res = await deployToEnvironment(
        { name: 'staging', strategy: 'webhook', url },
        { commit: 'abc', branch: 'main', plan: 'p.md', timestamp: 't' },
        { dryRun: false }
      );
      assert.equal(res.status, 'success');
      assert.equal(res.detail.httpStatus, 200);
      assert.equal(received.environment, 'staging');
      assert.equal(received.commit, 'abc');
    } finally {
      server.close();
    }
  });

  it('fails the environment on an HTTP error status', async () => {
    const server = http.createServer((req, res) => { res.statusCode = 500; res.end('nope'); });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${server.address().port}/deploy`;
    try {
      const res = await deployToEnvironment(
        { name: 'staging', strategy: 'webhook', url },
        { commit: 'abc' },
        { dryRun: false }
      );
      assert.equal(res.status, 'failed');
      assert.match(res.error, /HTTP 500/);
    } finally {
      server.close();
    }
  });
});

describe('Deployment execution — full pipeline (live script via config)', () => {
  it('threads dry_run:false from settings.json through to real execution', async () => {
    const dir = mkTmp('dep-pipe-');
    fs.mkdirSync(path.join(dir, '.ctoc'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'plans', 'done'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'run.js'), "require('fs').writeFileSync('shipped.txt','yes')");
    fs.writeFileSync(path.join(dir, '.ctoc', 'settings.json'), JSON.stringify({
      deployment: {
        enabled: true,
        dry_run: false,
        environments: [{ name: 'staging', enabled: true, strategy: 'script', script: 'node run.js' }],
        approval: { staging: 'auto', production: 'auto' }
      }
    }));
    const planPath = path.join(dir, 'plans', 'done', 'feature.md');
    fs.writeFileSync(planPath, '# feature');

    const result = await runDeploymentPipeline(planPath, dir);
    assert.equal(result.status, 'success');
    assert.equal(result.dryRun, false);
    assert.equal(fs.existsSync(path.join(dir, 'shipped.txt')), true, 'pipeline really ran the script');
    assert.ok(getDeploymentHistory(dir).length > 0, 'history recorded');
  });
});

describe('Deployment execution — non-testable strategies build correct commands', () => {
  it('docker and ssh expose their real command in simulate mode', async () => {
    const docker = await executeStrategy('docker',
      { name: 'production', image: 'myapp', imageTag: 'v1' }, { commit: 'abc' });
    assert.equal(docker.command, 'docker build -t myapp:v1 .');
    assert.equal(docker.dryRun, true);

    const ssh = await executeStrategy('ssh',
      { name: 'production', host: 'prod.example.com', user: 'deploy', command: 'systemctl restart app' },
      { commit: 'abc' });
    assert.equal(ssh.command, 'ssh deploy@prod.example.com "systemctl restart app"');
    assert.equal(ssh.dryRun, true);
  });
});

describe('Deployment execution — httpPostJson guards', () => {
  it('rejects an invalid URL', async () => {
    await assert.rejects(() => httpPostJson('not a url', {}), /Invalid webhook URL/);
  });
});
