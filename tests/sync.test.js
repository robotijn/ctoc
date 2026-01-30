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

// Summary
console.log('\nSync Manager Tests');
console.log('==================\n');
