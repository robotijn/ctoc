/**
 * Sync Manager Tests
 */

const assert = require('assert');
const { test, describe, beforeEach, afterEach } = require('node:test');

// We need to mock modules before requiring sync.js
// Using Node.js test runner's mocking capabilities

describe('Sync Manager Tests', () => {
  let syncModule;
  let mockExecSync;
  let mockGetSetting;
  let execSyncCalls;
  let settingsStore;
  let fileSystem;

  beforeEach(() => {
    // Reset state
    execSyncCalls = [];
    settingsStore = {
      general: { syncEnabled: true, syncInterval: 5 },
      workflow: { autoMoveToReview: true }
    };
    fileSystem = {};

    // Create mock for execFileSync (argv form: git is invoked as execFileSync('git', [args], opts)).
    // Reconstruct the command string so the behavioral assertions below still read naturally.
    mockExecSync = (file, args, opts) => {
      const cmd = [file, ...args].join(' ');
      execSyncCalls.push({ cmd, opts });

      // Simulate git status --porcelain
      if (cmd.includes('git status --porcelain')) {
        return fileSystem.gitStatus || '';
      }
      // Simulate other git commands
      if (cmd.includes('git add') || cmd.includes('git commit') || cmd.includes('git push') || cmd.includes('git pull')) {
        if (fileSystem.gitError) {
          throw new Error(fileSystem.gitError);
        }
        return '';
      }
      return '';
    };

    // Create mock for getSetting
    mockGetSetting = (category, key) => {
      return settingsStore[category]?.[key];
    };

    // Clear module cache to allow fresh require with mocks
    delete require.cache[require.resolve('../src/lib/sync.js')];
  });

  afterEach(() => {
    // Clean up any intervals
    if (syncModule) {
      syncModule.stopAutoSync();
    }
  });

  test('getLastSync returns null initially', (t) => {
    // Create a fresh module instance for this test
    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;
    childProcess.execFileSync = mockExecSync;

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    try {
      delete require.cache[require.resolve('../src/lib/sync.js')];
      syncModule = require('../src/lib/sync.js');

      const lastSync = syncModule.getLastSync();
      assert.strictEqual(lastSync, null, 'Last sync should be null initially');
      console.log('# getLastSync returns null initially');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('syncPlans returns no changes when git status is empty', (t) => {
    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;
    childProcess.execFileSync = mockExecSync;

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    fileSystem.gitStatus = ''; // No changes

    try {
      delete require.cache[require.resolve('../src/lib/sync.js')];
      syncModule = require('../src/lib/sync.js');

      const result = syncModule.syncPlans('/test/project');

      assert.strictEqual(result.synced, false, 'Should not sync');
      assert.strictEqual(result.reason, 'no changes', 'Reason should be no changes');
      console.log('# syncPlans returns no changes when git status is empty');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
    }
  });

  // R3-C SHIP GATE: this test used to assert that the 5-minute sync timer PUSHED.
  // That was the defect, asserted as a feature: a machine crossing the human's push
  // ship gate on a clock. The timer may commit (local, reversible); it may not ship.
  test('syncPlans commits but does NOT push when the ship gate is closed (default)', (t) => {
    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;
    childProcess.execFileSync = mockExecSync;

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;
    const originalIsAutoPush = settings.isAutoPushEnabled;
    settings.getSetting = mockGetSetting;
    settings.isAutoPushEnabled = () => false; // the default: no human opt-in

    fileSystem.gitStatus = 'M plans/test-plan.md'; // Has changes

    try {
      delete require.cache[require.resolve('../src/lib/sync.js')];
      syncModule = require('../src/lib/sync.js');

      const result = syncModule.syncPlans('/test/project');

      assert.strictEqual(result.synced, true, 'Should sync');
      assert.strictEqual(result.pushed, false, 'Must NOT push with the ship gate closed');
      assert.ok(result.timestamp instanceof Date, 'Should have timestamp');

      const commands = execSyncCalls.map(c => c.cmd);
      assert.ok(commands.some(c => c.includes('git status --porcelain')), 'Should check status');
      assert.ok(commands.some(c => c.includes('git add plans/')), 'Should add plans');
      assert.ok(commands.some(c => c.includes('git commit')), 'Should commit');
      assert.ok(!commands.some(c => c.includes('git push')), 'Must NOT push');
      assert.ok(!commands.some(c => c.includes('pull --rebase')),
        'Must NOT rewrite history unattended');

      console.log('# syncPlans commits but does not push with the ship gate closed');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
      settings.isAutoPushEnabled = originalIsAutoPush;
    }
  });

  test('syncPlans pushes ONLY when the human opened the ship gate', (t) => {
    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;
    childProcess.execFileSync = mockExecSync;

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;
    const originalIsAutoPush = settings.isAutoPushEnabled;
    settings.getSetting = mockGetSetting;
    settings.isAutoPushEnabled = () => true; // explicit human opt-in

    fileSystem.gitStatus = 'M plans/test-plan.md';

    try {
      delete require.cache[require.resolve('../src/lib/sync.js')];
      syncModule = require('../src/lib/sync.js');

      const result = syncModule.syncPlans('/test/project');

      assert.strictEqual(result.synced, true, 'Should sync');
      assert.strictEqual(result.pushed, true, 'Should push once the human opted in');

      const commands = execSyncCalls.map(c => c.cmd);
      assert.ok(commands.some(c => c.includes('git push')), 'Should push');

      console.log('# syncPlans pushes only when the human opened the ship gate');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
      settings.isAutoPushEnabled = originalIsAutoPush;
    }
  });

  test('syncPlans returns error on git failure', (t) => {
    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;

    childProcess.execFileSync = (file, args, opts) => {
      const cmd = [file, ...args].join(' ');
      if (cmd.includes('git status --porcelain')) {
        return 'M plans/test-plan.md';
      }
      if (cmd.includes('git add')) {
        throw new Error('Git add failed');
      }
      return '';
    };

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    try {
      delete require.cache[require.resolve('../src/lib/sync.js')];
      syncModule = require('../src/lib/sync.js');

      const result = syncModule.syncPlans('/test/project');

      assert.strictEqual(result.synced, false, 'Should not sync on error');
      assert.ok(result.error, 'Should have error message');
      assert.ok(result.error.includes('Git add failed'), 'Error should contain message');

      console.log('# syncPlans returns error on git failure');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('manualSync calls syncPlans', (t) => {
    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;
    childProcess.execFileSync = mockExecSync;

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    fileSystem.gitStatus = '';

    try {
      delete require.cache[require.resolve('../src/lib/sync.js')];
      syncModule = require('../src/lib/sync.js');

      const result = syncModule.manualSync('/test/project');

      assert.strictEqual(result.synced, false, 'Should return syncPlans result');
      assert.strictEqual(result.reason, 'no changes', 'Should pass through reason');

      console.log('# manualSync calls syncPlans');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('startAutoSync does nothing when sync disabled', (t) => {
    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;
    childProcess.execFileSync = mockExecSync;

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;

    // Disable sync
    settingsStore.general.syncEnabled = false;
    settings.getSetting = mockGetSetting;

    try {
      delete require.cache[require.resolve('../src/lib/sync.js')];
      syncModule = require('../src/lib/sync.js');

      syncModule.startAutoSync('/test/project');

      // No git commands should be called
      assert.strictEqual(execSyncCalls.length, 0, 'No commands should run when disabled');

      console.log('# startAutoSync does nothing when sync disabled');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('startAutoSync performs initial sync when enabled', (t) => {
    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;
    childProcess.execFileSync = mockExecSync;

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    fileSystem.gitStatus = ''; // No changes

    try {
      delete require.cache[require.resolve('../src/lib/sync.js')];
      syncModule = require('../src/lib/sync.js');

      syncModule.startAutoSync('/test/project');

      // Should have called git status for initial sync
      assert.ok(execSyncCalls.length > 0, 'Should perform initial sync');
      assert.ok(execSyncCalls.some(c => c.cmd.includes('git status')), 'Should check git status');

      // Clean up interval
      syncModule.stopAutoSync();

      console.log('# startAutoSync performs initial sync when enabled');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('stopAutoSync clears the interval', (t) => {
    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;
    childProcess.execFileSync = mockExecSync;

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    fileSystem.gitStatus = '';

    try {
      delete require.cache[require.resolve('../src/lib/sync.js')];
      syncModule = require('../src/lib/sync.js');

      syncModule.startAutoSync('/test/project');
      syncModule.stopAutoSync();

      // Calling stop again should not error
      syncModule.stopAutoSync();

      console.log('# stopAutoSync clears the interval');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
    }
  });

  // R4-B: `moveToReviewAfterPush` was DELETED — a raw, evidence-less renameSync into
  // plans/review/, default-ON via workflow.autoMoveToReview, with ZERO callers. A
  // plan reaches review in exactly ONE place: the completion path that mints Step-14
  // VERIFY evidence. These require-time + source assertions are the ratchet that the
  // second, evidence-less door stays shut.
  test('moveToReviewAfterPush is GONE from the sync module (no second door into review)', () => {
    delete require.cache[require.resolve('../src/lib/sync.js')];
    const fresh = require('../src/lib/sync.js');
    assert.strictEqual(
      fresh.moveToReviewAfterPush,
      undefined,
      'moveToReviewAfterPush must NOT be exported — it was deleted, not hidden'
    );
  });

  test('sync.js contains no raw rename into plans/review/', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'sync.js'), 'utf8');
    assert.ok(
      !/renameSync\s*\([^)]*review/i.test(src),
      'sync.js must never rename a plan into review/ — that path belongs to the evidence-minting completion path alone'
    );
    assert.ok(
      !/autoMoveToReview/.test(src),
      'the autoMoveToReview setting is deleted; sync.js must not read it'
    );
  });

  test('syncPlans uses correct project path', (t) => {
    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;
    childProcess.execFileSync = mockExecSync;

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    fileSystem.gitStatus = '';

    try {
      delete require.cache[require.resolve('../src/lib/sync.js')];
      syncModule = require('../src/lib/sync.js');

      syncModule.syncPlans('/custom/project/path');

      // Verify cwd was passed correctly
      assert.ok(execSyncCalls.length > 0, 'Should have exec calls');
      assert.strictEqual(execSyncCalls[0].opts.cwd, '/custom/project/path', 'Should use correct cwd');
      // ADDITION 8 — pin the COMMAND, not only its working directory.
      //
      // Contract, sourced OUTSIDE this test: src/lib/sync.js:97 — syncPlans opens
      // with `git(['status', '--porcelain', 'plans/'], { cwd: projectPath })`, and
      // the sibling test at :298 establishes the same expectation for this
      // module's git invocations by pinning 'git status'.
      //
      // Without this line an implementation running an ARBITRARY command in the
      // right directory passes a test whose name claims it verified plan syncing.
      assert.ok(
        execSyncCalls[0].cmd.includes('git status --porcelain'),
        `First call must be the plans git status, got: ${execSyncCalls[0].cmd}`
      );

      console.log('# syncPlans uses correct project path');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('syncPlans updates lastSync timestamp', (t) => {
    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;
    childProcess.execFileSync = mockExecSync;

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    fileSystem.gitStatus = 'M plans/test.md'; // Has changes

    try {
      delete require.cache[require.resolve('../src/lib/sync.js')];
      syncModule = require('../src/lib/sync.js');

      const before = syncModule.getLastSync();
      assert.strictEqual(before, null, 'Last sync should be null initially');

      syncModule.syncPlans('/test/project');

      const after = syncModule.getLastSync();
      assert.ok(after instanceof Date, 'Last sync should be a Date after sync');
      assert.ok(after.getTime() > 0, 'Last sync should be a valid timestamp');

      console.log('# syncPlans updates lastSync timestamp');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('syncPlans updates lastSync even when no changes', (t) => {
    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;
    childProcess.execFileSync = mockExecSync;

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    fileSystem.gitStatus = ''; // No changes

    try {
      delete require.cache[require.resolve('../src/lib/sync.js')];
      syncModule = require('../src/lib/sync.js');

      syncModule.syncPlans('/test/project');

      const after = syncModule.getLastSync();
      assert.ok(after instanceof Date, 'Last sync should be updated even with no changes');

      console.log('# syncPlans updates lastSync even when no changes');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
    }
  });

  // The pre-push rebase now lives on the OPTED-IN path only (R3-C: no unattended
  // history rewrite behind a closed ship gate). With the gate open it must still
  // degrade gracefully when there is no upstream.
  test('syncPlans handles pull rebase failure gracefully (ship gate open)', (t) => {
    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;

    let pullFailed = false;
    childProcess.execFileSync = (file, args, opts) => {
      const cmd = [file, ...args].join(' ');
      execSyncCalls.push({ cmd, opts });
      if (cmd.includes('git status --porcelain')) {
        return 'M plans/test.md';
      }
      if (cmd.includes('git pull --rebase')) {
        pullFailed = true;
        throw new Error('No upstream');
      }
      return '';
    };

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;
    const originalIsAutoPush = settings.isAutoPushEnabled;
    settings.getSetting = mockGetSetting;
    settings.isAutoPushEnabled = () => true;

    try {
      delete require.cache[require.resolve('../src/lib/sync.js')];
      syncModule = require('../src/lib/sync.js');

      const result = syncModule.syncPlans('/test/project');

      assert.ok(pullFailed, 'Pull should have been attempted on the opted-in path');
      assert.strictEqual(result.synced, true, 'Should still sync despite pull failure');

      console.log('# syncPlans handles pull rebase failure gracefully');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
      settings.isAutoPushEnabled = originalIsAutoPush;
    }
  });

  test('syncPlans NEVER rebases when the ship gate is closed', (t) => {
    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;
    childProcess.execFileSync = mockExecSync;

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;
    const originalIsAutoPush = settings.isAutoPushEnabled;
    settings.getSetting = mockGetSetting;
    settings.isAutoPushEnabled = () => false;

    fileSystem.gitStatus = 'M plans/test.md';

    try {
      delete require.cache[require.resolve('../src/lib/sync.js')];
      syncModule = require('../src/lib/sync.js');

      syncModule.syncPlans('/test/project');

      const commands = execSyncCalls.map(c => c.cmd);
      assert.ok(!commands.some(c => c.includes('pull --rebase')),
        'a background timer must never rewrite the human history');

      console.log('# syncPlans never rebases behind a closed ship gate');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
      settings.isAutoPushEnabled = originalIsAutoPush;
    }
  });

  test('commit message includes ISO timestamp', (t) => {
    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;
    childProcess.execFileSync = mockExecSync;

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    fileSystem.gitStatus = 'M plans/test.md';

    try {
      delete require.cache[require.resolve('../src/lib/sync.js')];
      syncModule = require('../src/lib/sync.js');

      syncModule.syncPlans('/test/project');

      const commitCall = execSyncCalls.find(c => c.cmd.includes('git commit'));
      assert.ok(commitCall, 'Should have commit call');
      assert.ok(commitCall.cmd.includes('chore: auto-sync plans'), 'Should have correct prefix');
      assert.ok(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(commitCall.cmd), 'Should include ISO timestamp');

      console.log('# commit message includes ISO timestamp');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('startAutoSync uses configured interval', (t) => {
    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;
    childProcess.execFileSync = mockExecSync;

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;

    // Custom interval
    settingsStore.general.syncInterval = 10;
    settings.getSetting = mockGetSetting;

    fileSystem.gitStatus = '';

    try {
      delete require.cache[require.resolve('../src/lib/sync.js')];
      syncModule = require('../src/lib/sync.js');

      // We can't easily test the actual interval timing,
      // but we verify it starts without error
      syncModule.startAutoSync('/test/project');
      syncModule.stopAutoSync();

      console.log('# startAutoSync uses configured interval');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('startAutoSync clears existing interval before starting new one', (t) => {
    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;
    childProcess.execFileSync = mockExecSync;

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    fileSystem.gitStatus = '';

    try {
      delete require.cache[require.resolve('../src/lib/sync.js')];
      syncModule = require('../src/lib/sync.js');

      // Start twice - should not create duplicate intervals
      syncModule.startAutoSync('/test/project');
      syncModule.startAutoSync('/test/project');
      syncModule.stopAutoSync();

      // No assertion needed - if this doesn't throw, it works
      console.log('# startAutoSync clears existing interval before starting new one');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
    }
  });
});

// Event-Triggered Sync Tests (GitHub Plans Sync Agent)
// Note: These tests require fresh module loads, so we use a require at module level
// to ensure the new exports are available
const syncModuleFresh = (() => {
  delete require.cache[require.resolve('../src/lib/sync.js')];
  return require('../src/lib/sync.js');
})();

describe('Event-Triggered Sync Tests', () => {
  let syncModule;
  let mockExecSync;
  let mockGetSetting;
  let execSyncCalls;
  let settingsStore;
  let fileSystem;

  beforeEach(() => {
    execSyncCalls = [];
    settingsStore = {
      general: { syncEnabled: true, syncInterval: 5 },
      workflow: { autoMoveToReview: true },
      sync: {
        enabled: true,
        check_interval: 60,
        auto_commit: true,
        auto_push: true,
        auto_pull: 'prompt',
        branch: 'main'
      }
    };
    fileSystem = {};

    mockExecSync = (file, args, opts) => {
      const cmd = [file, ...args].join(' ');
      execSyncCalls.push({ cmd, opts });
      if (cmd.includes('git status --porcelain')) {
        return fileSystem.gitStatus || '';
      }
      if (cmd.includes('git fetch')) {
        if (fileSystem.fetchError) {
          throw new Error(fileSystem.fetchError);
        }
        return '';
      }
      if (cmd.includes('git diff')) {
        return fileSystem.gitDiff || '';
      }
      if (cmd.includes('git log')) {
        return fileSystem.gitLog || '';
      }
      return '';
    };

    mockGetSetting = (category, key) => {
      return settingsStore[category]?.[key];
    };
  });

  test('new sync functions are exported', (t) => {
    // Verify all new functions are exported
    assert.strictEqual(typeof syncModuleFresh.onPlanOperation, 'function', 'onPlanOperation should be exported');
    assert.strictEqual(typeof syncModuleFresh.getSyncConfig, 'function', 'getSyncConfig should be exported');
    assert.strictEqual(typeof syncModuleFresh.getLastSyncTimestamp, 'function', 'getLastSyncTimestamp should be exported');
    assert.strictEqual(typeof syncModuleFresh.isRateLimited, 'function', 'isRateLimited should be exported');
    assert.strictEqual(typeof syncModuleFresh.checkRemoteChanges, 'function', 'checkRemoteChanges should be exported');
    assert.strictEqual(typeof syncModuleFresh.detectConflicts, 'function', 'detectConflicts should be exported');
    assert.strictEqual(typeof syncModuleFresh.autoCommitPlan, 'function', 'autoCommitPlan should be exported');
    assert.strictEqual(typeof syncModuleFresh.autoPush, 'function', 'autoPush should be exported');

    console.log('# new sync functions are exported');
  });

  test('onPlanOperation triggers sync check with rate limiting', (t) => {
    // Mock fs BEFORE clearing sync cache
    const fs = require('fs');
    const originalExistsSync = fs.existsSync;
    const originalReadFileSync = fs.readFileSync;
    const originalWriteFileSync = fs.writeFileSync;
    const originalMkdirSync = fs.mkdirSync;

    let savedTimestamp = null;
    fs.existsSync = (p) => {
      if (p.includes('last-sync')) return savedTimestamp !== null;
      if (p.includes('.ctoc')) return true;
      return true;
    };
    fs.readFileSync = (p, enc) => {
      if (p.includes('last-sync')) return savedTimestamp ? savedTimestamp.toString() : '';
      return '';
    };
    fs.writeFileSync = (p, content) => {
      if (p.includes('last-sync')) savedTimestamp = parseInt(content, 10);
    };
    fs.mkdirSync = () => {};

    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;
    childProcess.execFileSync = mockExecSync;

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    fileSystem.gitStatus = '';

    try {
      // First call should sync
      const result1 = syncModuleFresh.onPlanOperation('create', 'test-plan.md', '/test/project');
      assert.ok(result1.checked, 'First call should check remote');

      // Second call within 60s should be rate-limited
      const result2 = syncModuleFresh.onPlanOperation('create', 'test-plan2.md', '/test/project');
      assert.strictEqual(result2.checked, false, 'Second call should be rate-limited');
      assert.strictEqual(result2.reason, 'rate-limited', 'Should indicate rate-limited');

      console.log('# onPlanOperation triggers sync check with rate limiting');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
      fs.existsSync = originalExistsSync;
      fs.readFileSync = originalReadFileSync;
      fs.writeFileSync = originalWriteFileSync;
      fs.mkdirSync = originalMkdirSync;
    }
  });

  test('onPlanOperation detects remote changes', (t) => {
    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;
    childProcess.execFileSync = mockExecSync;

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    fileSystem.gitLog = 'abc123 Remote commit\ndef456 Another remote commit';

    try {
      delete require.cache[require.resolve('../src/lib/sync.js')];
      syncModule = require('../src/lib/sync.js');

      syncModule.checkRemoteChanges('/test/project');

      // Verify fetch was called
      const fetchCall = execSyncCalls.find(c => c.cmd.includes('git fetch'));
      assert.ok(fetchCall, 'Should call git fetch');

      console.log('# onPlanOperation detects remote changes');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('onPlanOperation handles offline mode gracefully', (t) => {
    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;
    childProcess.execFileSync = mockExecSync;

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    fileSystem.fetchError = 'Network unreachable';

    try {
      delete require.cache[require.resolve('../src/lib/sync.js')];
      syncModule = require('../src/lib/sync.js');

      const result = syncModule.checkRemoteChanges('/test/project');

      assert.strictEqual(result.offline, true, 'Should indicate offline');
      assert.ok(result.error, 'Should have error message');

      console.log('# onPlanOperation handles offline mode gracefully');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('autoCommitPlan creates commit with correct message format', (t) => {
    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;
    childProcess.execFileSync = mockExecSync;

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    fileSystem.gitStatus = 'M plans/test-plan.md';

    try {
      delete require.cache[require.resolve('../src/lib/sync.js')];
      syncModule = require('../src/lib/sync.js');

      syncModule.autoCommitPlan('create', 'test-plan.md', '/test/project');

      const commitCall = execSyncCalls.find(c => c.cmd.includes('git commit'));
      assert.ok(commitCall, 'Should create commit');
      assert.ok(commitCall.cmd.includes('plan: create test-plan.md'), 'Should have correct message format');

      console.log('# autoCommitPlan creates commit with correct message format');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('autoCommitPlan uses different messages for different actions', (t) => {
    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;

    const commitMessages = [];
    childProcess.execFileSync = (file, args, opts) => {
      const cmd = [file, ...args].join(' ');
      if (cmd.includes('git commit')) {
        commitMessages.push(cmd);
      }
      if (cmd.includes('git status --porcelain')) {
        return 'M plans/test-plan.md';
      }
      return '';
    };

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    try {
      delete require.cache[require.resolve('../src/lib/sync.js')];
      syncModule = require('../src/lib/sync.js');

      // Test create
      syncModule.autoCommitPlan('create', 'new-plan.md', '/test/project');
      assert.ok(commitMessages[0].includes('plan: create'), 'Create should use "plan: create"');

      // Test edit
      syncModule.autoCommitPlan('edit', 'edited-plan.md', '/test/project');
      assert.ok(commitMessages[1].includes('plan: update'), 'Edit should use "plan: update"');

      // Test delete
      syncModule.autoCommitPlan('delete', 'deleted-plan.md', '/test/project');
      assert.ok(commitMessages[2].includes('plan: delete'), 'Delete should use "plan: delete"');

      console.log('# autoCommitPlan uses different messages for different actions');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('autoCommitPlan handles approve action with stage transition', (t) => {
    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;

    let commitMessage = '';
    childProcess.execFileSync = (file, args, opts) => {
      const cmd = [file, ...args].join(' ');
      if (cmd.includes('git commit')) {
        commitMessage = cmd;
      }
      if (cmd.includes('git status --porcelain')) {
        return 'M plans/test-plan.md';
      }
      return '';
    };

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    try {
      delete require.cache[require.resolve('../src/lib/sync.js')];
      syncModule = require('../src/lib/sync.js');

      syncModule.autoCommitPlan('approve', 'approved-plan.md', '/test/project', { from: 'todo', to: 'in-progress' });

      assert.ok(commitMessage.includes('plan: todo → in-progress'), 'Approve should include stage transition');

      console.log('# autoCommitPlan handles approve action with stage transition');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('getLastSyncTimestamp returns timestamp from file', (t) => {
    // Mock fs FIRST before clearing sync cache
    const fs = require('fs');
    const originalExistsSync = fs.existsSync;
    const originalReadFileSync = fs.readFileSync;
    const originalWriteFileSync = fs.writeFileSync;
    const originalMkdirSync = fs.mkdirSync;

    const testTimestamp = Date.now() - 120000; // 2 minutes ago

    fs.existsSync = (p) => {
      if (p.includes('last-sync')) return true;
      if (p.includes('.ctoc')) return true;
      return true;
    };
    fs.readFileSync = (p) => {
      if (p.includes('last-sync')) return testTimestamp.toString();
      return '';
    };
    fs.writeFileSync = () => {};
    fs.mkdirSync = () => {};

    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;
    childProcess.execFileSync = mockExecSync;

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    try {
      const timestamp = syncModuleFresh.getLastSyncTimestamp('/test/project');
      assert.strictEqual(timestamp, testTimestamp, 'Should return stored timestamp');

      console.log('# getLastSyncTimestamp returns timestamp from file');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
      fs.existsSync = originalExistsSync;
      fs.readFileSync = originalReadFileSync;
      fs.writeFileSync = originalWriteFileSync;
      fs.mkdirSync = originalMkdirSync;
    }
  });

  test('isRateLimited returns true when within cooldown period', (t) => {
    // Mock fs FIRST
    const fs = require('fs');
    const originalExistsSync = fs.existsSync;
    const originalReadFileSync = fs.readFileSync;

    // Timestamp from 30 seconds ago (within 60s cooldown)
    const recentTimestamp = Date.now() - 30000;

    fs.existsSync = (p) => {
      if (p.includes('last-sync')) return true;
      return true;
    };
    fs.readFileSync = (p) => {
      if (p.includes('last-sync')) return recentTimestamp.toString();
      return '';
    };

    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;
    childProcess.execFileSync = mockExecSync;

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    try {
      const isLimited = syncModuleFresh.isRateLimited('/test/project');
      assert.strictEqual(isLimited, true, 'Should be rate limited');

      console.log('# isRateLimited returns true when within cooldown period');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
      fs.existsSync = originalExistsSync;
      fs.readFileSync = originalReadFileSync;
    }
  });

  test('isRateLimited returns false when outside cooldown period', (t) => {
    // Mock fs FIRST
    const fs = require('fs');
    const originalExistsSync = fs.existsSync;
    const originalReadFileSync = fs.readFileSync;

    // Timestamp from 90 seconds ago (outside 60s cooldown)
    const oldTimestamp = Date.now() - 90000;

    fs.existsSync = (p) => {
      if (p.includes('last-sync')) return true;
      return true;
    };
    fs.readFileSync = (p) => {
      if (p.includes('last-sync')) return oldTimestamp.toString();
      return '';
    };

    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;
    childProcess.execFileSync = mockExecSync;

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    try {
      const isLimited = syncModuleFresh.isRateLimited('/test/project');
      assert.strictEqual(isLimited, false, 'Should not be rate limited');

      console.log('# isRateLimited returns false when outside cooldown period');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
      fs.existsSync = originalExistsSync;
      fs.readFileSync = originalReadFileSync;
    }
  });

  test('detectConflicts identifies conflicting files', (t) => {
    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;

    childProcess.execFileSync = (file, args, opts) => {
      const cmd = [file, ...args].join(' ');
      if (cmd.includes('git diff --name-only')) {
        return 'plans/conflict-plan.md\n';
      }
      if (cmd.includes('git status --porcelain')) {
        return 'M  plans/conflict-plan.md';  // 2 spaces after status code
      }
      return '';
    };

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    // Mock fs for the module
    const fs = require('fs');
    const originalExistsSync = fs.existsSync;
    fs.existsSync = () => true;

    try {
      delete require.cache[require.resolve('../src/lib/sync.js')];
      syncModule = require('../src/lib/sync.js');

      const conflicts = syncModule.detectConflicts('/test/project');

      assert.ok(Array.isArray(conflicts), 'Should return array');
      assert.ok(conflicts.length > 0, 'Should detect conflict');
      assert.ok(conflicts[0].includes('conflict-plan.md'), 'Should include conflicting file');

      console.log('# detectConflicts identifies conflicting files');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
      fs.existsSync = originalExistsSync;
    }
  });

  test('sync settings are configurable', (t) => {
    const childProcess = require('child_process');
    const originalExecFileSync = childProcess.execFileSync;
    childProcess.execFileSync = mockExecSync;

    const settings = require('../src/lib/settings.js');
    const originalGetSetting = settings.getSetting;

    // Custom settings
    settingsStore.sync = {
      enabled: true,
      check_interval: 120, // 2 minutes
      auto_commit: false,
      auto_push: false
    };
    settings.getSetting = mockGetSetting;

    try {
      delete require.cache[require.resolve('../src/lib/sync.js')];
      syncModule = require('../src/lib/sync.js');

      const config = syncModule.getSyncConfig('/test/project');

      assert.strictEqual(config.check_interval, 120, 'Should use custom check interval');
      assert.strictEqual(config.auto_commit, false, 'Should use custom auto_commit');
      assert.strictEqual(config.auto_push, false, 'Should use custom auto_push');

      console.log('# sync settings are configurable');
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      settings.getSetting = originalGetSetting;
    }
  });
});

// Summary
console.log('\nSync Manager Tests');
console.log('==================\n');
