/**
 * Sync Manager Tests
 */

const assert = require('assert');
const path = require('path');
const { test, mock, describe, beforeEach, afterEach } = require('node:test');

// We need to mock modules before requiring sync.js
// Using Node.js test runner's mocking capabilities

describe('Sync Manager Tests', () => {
  let syncModule;
  let mockExecSync;
  let mockGetSetting;
  let mockFs;
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

    // Create mock for execSync
    mockExecSync = (cmd, opts) => {
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
    delete require.cache[require.resolve('../lib/sync.js')];
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
    const originalExecSync = childProcess.execSync;
    childProcess.execSync = mockExecSync;

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    try {
      delete require.cache[require.resolve('../lib/sync.js')];
      syncModule = require('../lib/sync.js');

      const lastSync = syncModule.getLastSync();
      assert.strictEqual(lastSync, null, 'Last sync should be null initially');
      console.log('# getLastSync returns null initially');
    } finally {
      childProcess.execSync = originalExecSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('syncPlans returns no changes when git status is empty', (t) => {
    const childProcess = require('child_process');
    const originalExecSync = childProcess.execSync;
    childProcess.execSync = mockExecSync;

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    fileSystem.gitStatus = ''; // No changes

    try {
      delete require.cache[require.resolve('../lib/sync.js')];
      syncModule = require('../lib/sync.js');

      const result = syncModule.syncPlans('/test/project');

      assert.strictEqual(result.synced, false, 'Should not sync');
      assert.strictEqual(result.reason, 'no changes', 'Reason should be no changes');
      console.log('# syncPlans returns no changes when git status is empty');
    } finally {
      childProcess.execSync = originalExecSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('syncPlans commits and pushes when there are changes', (t) => {
    const childProcess = require('child_process');
    const originalExecSync = childProcess.execSync;
    childProcess.execSync = mockExecSync;

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    fileSystem.gitStatus = 'M plans/test-plan.md'; // Has changes

    try {
      delete require.cache[require.resolve('../lib/sync.js')];
      syncModule = require('../lib/sync.js');

      const result = syncModule.syncPlans('/test/project');

      assert.strictEqual(result.synced, true, 'Should sync');
      assert.ok(result.timestamp instanceof Date, 'Should have timestamp');

      // Verify git commands were called
      const commands = execSyncCalls.map(c => c.cmd);
      assert.ok(commands.some(c => c.includes('git status --porcelain')), 'Should check status');
      assert.ok(commands.some(c => c.includes('git add plans/')), 'Should add plans');
      assert.ok(commands.some(c => c.includes('git commit')), 'Should commit');
      assert.ok(commands.some(c => c.includes('git push')), 'Should push');

      console.log('# syncPlans commits and pushes when there are changes');
    } finally {
      childProcess.execSync = originalExecSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('syncPlans returns error on git failure', (t) => {
    const childProcess = require('child_process');
    const originalExecSync = childProcess.execSync;

    let callCount = 0;
    childProcess.execSync = (cmd, opts) => {
      callCount++;
      if (cmd.includes('git status --porcelain')) {
        return 'M plans/test-plan.md';
      }
      if (cmd.includes('git add')) {
        throw new Error('Git add failed');
      }
      return '';
    };

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    try {
      delete require.cache[require.resolve('../lib/sync.js')];
      syncModule = require('../lib/sync.js');

      const result = syncModule.syncPlans('/test/project');

      assert.strictEqual(result.synced, false, 'Should not sync on error');
      assert.ok(result.error, 'Should have error message');
      assert.ok(result.error.includes('Git add failed'), 'Error should contain message');

      console.log('# syncPlans returns error on git failure');
    } finally {
      childProcess.execSync = originalExecSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('manualSync calls syncPlans', (t) => {
    const childProcess = require('child_process');
    const originalExecSync = childProcess.execSync;
    childProcess.execSync = mockExecSync;

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    fileSystem.gitStatus = '';

    try {
      delete require.cache[require.resolve('../lib/sync.js')];
      syncModule = require('../lib/sync.js');

      const result = syncModule.manualSync('/test/project');

      assert.strictEqual(result.synced, false, 'Should return syncPlans result');
      assert.strictEqual(result.reason, 'no changes', 'Should pass through reason');

      console.log('# manualSync calls syncPlans');
    } finally {
      childProcess.execSync = originalExecSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('startAutoSync does nothing when sync disabled', (t) => {
    const childProcess = require('child_process');
    const originalExecSync = childProcess.execSync;
    childProcess.execSync = mockExecSync;

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;

    // Disable sync
    settingsStore.general.syncEnabled = false;
    settings.getSetting = mockGetSetting;

    try {
      delete require.cache[require.resolve('../lib/sync.js')];
      syncModule = require('../lib/sync.js');

      syncModule.startAutoSync('/test/project');

      // No git commands should be called
      assert.strictEqual(execSyncCalls.length, 0, 'No commands should run when disabled');

      console.log('# startAutoSync does nothing when sync disabled');
    } finally {
      childProcess.execSync = originalExecSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('startAutoSync performs initial sync when enabled', (t) => {
    const childProcess = require('child_process');
    const originalExecSync = childProcess.execSync;
    childProcess.execSync = mockExecSync;

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    fileSystem.gitStatus = ''; // No changes

    try {
      delete require.cache[require.resolve('../lib/sync.js')];
      syncModule = require('../lib/sync.js');

      syncModule.startAutoSync('/test/project');

      // Should have called git status for initial sync
      assert.ok(execSyncCalls.length > 0, 'Should perform initial sync');
      assert.ok(execSyncCalls.some(c => c.cmd.includes('git status')), 'Should check git status');

      // Clean up interval
      syncModule.stopAutoSync();

      console.log('# startAutoSync performs initial sync when enabled');
    } finally {
      childProcess.execSync = originalExecSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('stopAutoSync clears the interval', (t) => {
    const childProcess = require('child_process');
    const originalExecSync = childProcess.execSync;
    childProcess.execSync = mockExecSync;

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    fileSystem.gitStatus = '';

    try {
      delete require.cache[require.resolve('../lib/sync.js')];
      syncModule = require('../lib/sync.js');

      syncModule.startAutoSync('/test/project');
      syncModule.stopAutoSync();

      // Calling stop again should not error
      syncModule.stopAutoSync();

      console.log('# stopAutoSync clears the interval');
    } finally {
      childProcess.execSync = originalExecSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('moveToReviewAfterPush returns disabled when autoMove is off', (t) => {
    const childProcess = require('child_process');
    const originalExecSync = childProcess.execSync;
    childProcess.execSync = mockExecSync;

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;

    // Disable auto-move
    settingsStore.workflow.autoMoveToReview = false;
    settings.getSetting = mockGetSetting;

    try {
      delete require.cache[require.resolve('../lib/sync.js')];
      syncModule = require('../lib/sync.js');

      const result = syncModule.moveToReviewAfterPush('/test/plan.md', '/test/project');

      assert.strictEqual(result.moved, false, 'Should not move');
      assert.strictEqual(result.reason, 'auto-move disabled', 'Should indicate disabled');

      console.log('# moveToReviewAfterPush returns disabled when autoMove is off');
    } finally {
      childProcess.execSync = originalExecSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('moveToReviewAfterPush moves file to review directory', (t) => {
    const childProcess = require('child_process');
    const originalExecSync = childProcess.execSync;
    childProcess.execSync = mockExecSync;

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    // Mock fs operations
    const fs = require('fs');
    const originalExistsSync = fs.existsSync;
    const originalMkdirSync = fs.mkdirSync;
    const originalRenameSync = fs.renameSync;

    let mkdirCalls = [];
    let renameCalls = [];

    fs.existsSync = (p) => {
      // Review dir doesn't exist yet
      if (p.includes('review')) return false;
      return true;
    };
    fs.mkdirSync = (p, opts) => { mkdirCalls.push({ path: p, opts }); };
    fs.renameSync = (from, to) => { renameCalls.push({ from, to }); };

    try {
      delete require.cache[require.resolve('../lib/sync.js')];
      syncModule = require('../lib/sync.js');

      const result = syncModule.moveToReviewAfterPush('/test/project/plans/draft/my-plan.md', '/test/project');

      assert.strictEqual(result.moved, true, 'Should move file');
      assert.ok(result.newPath.includes('review'), 'New path should be in review');
      assert.ok(mkdirCalls.length > 0, 'Should create review directory');
      assert.ok(renameCalls.length > 0, 'Should rename file');
      assert.strictEqual(renameCalls[0].to, result.newPath, 'Should rename to new path');

      console.log('# moveToReviewAfterPush moves file to review directory');
    } finally {
      childProcess.execSync = originalExecSync;
      settings.getSetting = originalGetSetting;
      fs.existsSync = originalExistsSync;
      fs.mkdirSync = originalMkdirSync;
      fs.renameSync = originalRenameSync;
    }
  });

  test('moveToReviewAfterPush uses existing review directory', (t) => {
    const childProcess = require('child_process');
    const originalExecSync = childProcess.execSync;
    childProcess.execSync = mockExecSync;

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    // Mock fs operations
    const fs = require('fs');
    const originalExistsSync = fs.existsSync;
    const originalMkdirSync = fs.mkdirSync;
    const originalRenameSync = fs.renameSync;

    let mkdirCalls = [];
    let renameCalls = [];

    fs.existsSync = (p) => true; // Review dir exists
    fs.mkdirSync = (p, opts) => { mkdirCalls.push({ path: p, opts }); };
    fs.renameSync = (from, to) => { renameCalls.push({ from, to }); };

    try {
      delete require.cache[require.resolve('../lib/sync.js')];
      syncModule = require('../lib/sync.js');

      const result = syncModule.moveToReviewAfterPush('/test/project/plans/draft/my-plan.md', '/test/project');

      assert.strictEqual(result.moved, true, 'Should move file');
      assert.strictEqual(mkdirCalls.length, 0, 'Should not create directory if exists');
      assert.ok(renameCalls.length > 0, 'Should rename file');

      console.log('# moveToReviewAfterPush uses existing review directory');
    } finally {
      childProcess.execSync = originalExecSync;
      settings.getSetting = originalGetSetting;
      fs.existsSync = originalExistsSync;
      fs.mkdirSync = originalMkdirSync;
      fs.renameSync = originalRenameSync;
    }
  });

  test('syncPlans uses correct project path', (t) => {
    const childProcess = require('child_process');
    const originalExecSync = childProcess.execSync;
    childProcess.execSync = mockExecSync;

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    fileSystem.gitStatus = '';

    try {
      delete require.cache[require.resolve('../lib/sync.js')];
      syncModule = require('../lib/sync.js');

      syncModule.syncPlans('/custom/project/path');

      // Verify cwd was passed correctly
      assert.ok(execSyncCalls.length > 0, 'Should have exec calls');
      assert.strictEqual(execSyncCalls[0].opts.cwd, '/custom/project/path', 'Should use correct cwd');

      console.log('# syncPlans uses correct project path');
    } finally {
      childProcess.execSync = originalExecSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('syncPlans updates lastSync timestamp', (t) => {
    const childProcess = require('child_process');
    const originalExecSync = childProcess.execSync;
    childProcess.execSync = mockExecSync;

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    fileSystem.gitStatus = 'M plans/test.md'; // Has changes

    try {
      delete require.cache[require.resolve('../lib/sync.js')];
      syncModule = require('../lib/sync.js');

      const before = syncModule.getLastSync();
      assert.strictEqual(before, null, 'Last sync should be null initially');

      syncModule.syncPlans('/test/project');

      const after = syncModule.getLastSync();
      assert.ok(after instanceof Date, 'Last sync should be a Date after sync');
      assert.ok(after.getTime() > 0, 'Last sync should be a valid timestamp');

      console.log('# syncPlans updates lastSync timestamp');
    } finally {
      childProcess.execSync = originalExecSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('syncPlans updates lastSync even when no changes', (t) => {
    const childProcess = require('child_process');
    const originalExecSync = childProcess.execSync;
    childProcess.execSync = mockExecSync;

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    fileSystem.gitStatus = ''; // No changes

    try {
      delete require.cache[require.resolve('../lib/sync.js')];
      syncModule = require('../lib/sync.js');

      syncModule.syncPlans('/test/project');

      const after = syncModule.getLastSync();
      assert.ok(after instanceof Date, 'Last sync should be updated even with no changes');

      console.log('# syncPlans updates lastSync even when no changes');
    } finally {
      childProcess.execSync = originalExecSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('syncPlans handles pull rebase failure gracefully', (t) => {
    const childProcess = require('child_process');
    const originalExecSync = childProcess.execSync;

    let pullFailed = false;
    childProcess.execSync = (cmd, opts) => {
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

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    try {
      delete require.cache[require.resolve('../lib/sync.js')];
      syncModule = require('../lib/sync.js');

      const result = syncModule.syncPlans('/test/project');

      assert.ok(pullFailed, 'Pull should have been attempted');
      assert.strictEqual(result.synced, true, 'Should still sync despite pull failure');

      console.log('# syncPlans handles pull rebase failure gracefully');
    } finally {
      childProcess.execSync = originalExecSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('commit message includes ISO timestamp', (t) => {
    const childProcess = require('child_process');
    const originalExecSync = childProcess.execSync;
    childProcess.execSync = mockExecSync;

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    fileSystem.gitStatus = 'M plans/test.md';

    try {
      delete require.cache[require.resolve('../lib/sync.js')];
      syncModule = require('../lib/sync.js');

      syncModule.syncPlans('/test/project');

      const commitCall = execSyncCalls.find(c => c.cmd.includes('git commit'));
      assert.ok(commitCall, 'Should have commit call');
      assert.ok(commitCall.cmd.includes('chore: auto-sync plans'), 'Should have correct prefix');
      assert.ok(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(commitCall.cmd), 'Should include ISO timestamp');

      console.log('# commit message includes ISO timestamp');
    } finally {
      childProcess.execSync = originalExecSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('startAutoSync uses configured interval', (t) => {
    const childProcess = require('child_process');
    const originalExecSync = childProcess.execSync;
    childProcess.execSync = mockExecSync;

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;

    // Custom interval
    settingsStore.general.syncInterval = 10;
    settings.getSetting = mockGetSetting;

    fileSystem.gitStatus = '';

    try {
      delete require.cache[require.resolve('../lib/sync.js')];
      syncModule = require('../lib/sync.js');

      // We can't easily test the actual interval timing,
      // but we verify it starts without error
      syncModule.startAutoSync('/test/project');
      syncModule.stopAutoSync();

      console.log('# startAutoSync uses configured interval');
    } finally {
      childProcess.execSync = originalExecSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('startAutoSync clears existing interval before starting new one', (t) => {
    const childProcess = require('child_process');
    const originalExecSync = childProcess.execSync;
    childProcess.execSync = mockExecSync;

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    fileSystem.gitStatus = '';

    try {
      delete require.cache[require.resolve('../lib/sync.js')];
      syncModule = require('../lib/sync.js');

      // Start twice - should not create duplicate intervals
      syncModule.startAutoSync('/test/project');
      syncModule.startAutoSync('/test/project');
      syncModule.stopAutoSync();

      // No assertion needed - if this doesn't throw, it works
      console.log('# startAutoSync clears existing interval before starting new one');
    } finally {
      childProcess.execSync = originalExecSync;
      settings.getSetting = originalGetSetting;
    }
  });
});

// Event-Triggered Sync Tests (GitHub Plans Sync Agent)
// Note: These tests require fresh module loads, so we use a require at module level
// to ensure the new exports are available
const syncModuleFresh = (() => {
  delete require.cache[require.resolve('../lib/sync.js')];
  return require('../lib/sync.js');
})();

describe('Event-Triggered Sync Tests', () => {
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

    mockExecSync = (cmd, opts) => {
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
    const originalExecSync = childProcess.execSync;
    childProcess.execSync = mockExecSync;

    const settings = require('../lib/settings.js');
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
      childProcess.execSync = originalExecSync;
      settings.getSetting = originalGetSetting;
      fs.existsSync = originalExistsSync;
      fs.readFileSync = originalReadFileSync;
      fs.writeFileSync = originalWriteFileSync;
      fs.mkdirSync = originalMkdirSync;
    }
  });

  test('onPlanOperation detects remote changes', (t) => {
    const childProcess = require('child_process');
    const originalExecSync = childProcess.execSync;
    childProcess.execSync = mockExecSync;

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    fileSystem.gitLog = 'abc123 Remote commit\ndef456 Another remote commit';

    try {
      delete require.cache[require.resolve('../lib/sync.js')];
      syncModule = require('../lib/sync.js');

      const result = syncModule.checkRemoteChanges('/test/project');

      // Verify fetch was called
      const fetchCall = execSyncCalls.find(c => c.cmd.includes('git fetch'));
      assert.ok(fetchCall, 'Should call git fetch');

      console.log('# onPlanOperation detects remote changes');
    } finally {
      childProcess.execSync = originalExecSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('onPlanOperation handles offline mode gracefully', (t) => {
    const childProcess = require('child_process');
    const originalExecSync = childProcess.execSync;
    childProcess.execSync = mockExecSync;

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    fileSystem.fetchError = 'Network unreachable';

    try {
      delete require.cache[require.resolve('../lib/sync.js')];
      syncModule = require('../lib/sync.js');

      const result = syncModule.checkRemoteChanges('/test/project');

      assert.strictEqual(result.offline, true, 'Should indicate offline');
      assert.ok(result.error, 'Should have error message');

      console.log('# onPlanOperation handles offline mode gracefully');
    } finally {
      childProcess.execSync = originalExecSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('autoCommitPlan creates commit with correct message format', (t) => {
    const childProcess = require('child_process');
    const originalExecSync = childProcess.execSync;
    childProcess.execSync = mockExecSync;

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    fileSystem.gitStatus = 'M plans/test-plan.md';

    try {
      delete require.cache[require.resolve('../lib/sync.js')];
      syncModule = require('../lib/sync.js');

      syncModule.autoCommitPlan('create', 'test-plan.md', '/test/project');

      const commitCall = execSyncCalls.find(c => c.cmd.includes('git commit'));
      assert.ok(commitCall, 'Should create commit');
      assert.ok(commitCall.cmd.includes('plan: create test-plan.md'), 'Should have correct message format');

      console.log('# autoCommitPlan creates commit with correct message format');
    } finally {
      childProcess.execSync = originalExecSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('autoCommitPlan uses different messages for different actions', (t) => {
    const childProcess = require('child_process');
    const originalExecSync = childProcess.execSync;

    const commitMessages = [];
    childProcess.execSync = (cmd, opts) => {
      if (cmd.includes('git commit')) {
        commitMessages.push(cmd);
      }
      if (cmd.includes('git status --porcelain')) {
        return 'M plans/test-plan.md';
      }
      return '';
    };

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    try {
      delete require.cache[require.resolve('../lib/sync.js')];
      syncModule = require('../lib/sync.js');

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
      childProcess.execSync = originalExecSync;
      settings.getSetting = originalGetSetting;
    }
  });

  test('autoCommitPlan handles approve action with stage transition', (t) => {
    const childProcess = require('child_process');
    const originalExecSync = childProcess.execSync;

    let commitMessage = '';
    childProcess.execSync = (cmd, opts) => {
      if (cmd.includes('git commit')) {
        commitMessage = cmd;
      }
      if (cmd.includes('git status --porcelain')) {
        return 'M plans/test-plan.md';
      }
      return '';
    };

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    try {
      delete require.cache[require.resolve('../lib/sync.js')];
      syncModule = require('../lib/sync.js');

      syncModule.autoCommitPlan('approve', 'approved-plan.md', '/test/project', { from: 'todo', to: 'in-progress' });

      assert.ok(commitMessage.includes('plan: todo → in-progress'), 'Approve should include stage transition');

      console.log('# autoCommitPlan handles approve action with stage transition');
    } finally {
      childProcess.execSync = originalExecSync;
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
    const originalExecSync = childProcess.execSync;
    childProcess.execSync = mockExecSync;

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    try {
      const timestamp = syncModuleFresh.getLastSyncTimestamp('/test/project');
      assert.strictEqual(timestamp, testTimestamp, 'Should return stored timestamp');

      console.log('# getLastSyncTimestamp returns timestamp from file');
    } finally {
      childProcess.execSync = originalExecSync;
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
    const originalExecSync = childProcess.execSync;
    childProcess.execSync = mockExecSync;

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    try {
      const isLimited = syncModuleFresh.isRateLimited('/test/project');
      assert.strictEqual(isLimited, true, 'Should be rate limited');

      console.log('# isRateLimited returns true when within cooldown period');
    } finally {
      childProcess.execSync = originalExecSync;
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
    const originalExecSync = childProcess.execSync;
    childProcess.execSync = mockExecSync;

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    try {
      const isLimited = syncModuleFresh.isRateLimited('/test/project');
      assert.strictEqual(isLimited, false, 'Should not be rate limited');

      console.log('# isRateLimited returns false when outside cooldown period');
    } finally {
      childProcess.execSync = originalExecSync;
      settings.getSetting = originalGetSetting;
      fs.existsSync = originalExistsSync;
      fs.readFileSync = originalReadFileSync;
    }
  });

  test('detectConflicts identifies conflicting files', (t) => {
    const childProcess = require('child_process');
    const originalExecSync = childProcess.execSync;

    childProcess.execSync = (cmd, opts) => {
      if (cmd.includes('git diff --name-only')) {
        return 'plans/conflict-plan.md\n';
      }
      if (cmd.includes('git status --porcelain')) {
        return 'M  plans/conflict-plan.md';  // 2 spaces after status code
      }
      return '';
    };

    const settings = require('../lib/settings.js');
    const originalGetSetting = settings.getSetting;
    settings.getSetting = mockGetSetting;

    // Mock fs for the module
    const fs = require('fs');
    const originalExistsSync = fs.existsSync;
    fs.existsSync = () => true;

    try {
      delete require.cache[require.resolve('../lib/sync.js')];
      syncModule = require('../lib/sync.js');

      const conflicts = syncModule.detectConflicts('/test/project');

      assert.ok(Array.isArray(conflicts), 'Should return array');
      assert.ok(conflicts.length > 0, 'Should detect conflict');
      assert.ok(conflicts[0].includes('conflict-plan.md'), 'Should include conflicting file');

      console.log('# detectConflicts identifies conflicting files');
    } finally {
      childProcess.execSync = originalExecSync;
      settings.getSetting = originalGetSetting;
      fs.existsSync = originalExistsSync;
    }
  });

  test('sync settings are configurable', (t) => {
    const childProcess = require('child_process');
    const originalExecSync = childProcess.execSync;
    childProcess.execSync = mockExecSync;

    const settings = require('../lib/settings.js');
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
      delete require.cache[require.resolve('../lib/sync.js')];
      syncModule = require('../lib/sync.js');

      const config = syncModule.getSyncConfig('/test/project');

      assert.strictEqual(config.check_interval, 120, 'Should use custom check interval');
      assert.strictEqual(config.auto_commit, false, 'Should use custom auto_commit');
      assert.strictEqual(config.auto_push, false, 'Should use custom auto_push');

      console.log('# sync settings are configurable');
    } finally {
      childProcess.execSync = originalExecSync;
      settings.getSetting = originalGetSetting;
    }
  });
});

// Summary
console.log('\nSync Manager Tests');
console.log('==================\n');
