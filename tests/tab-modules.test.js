/**
 * Tab Module Tests
 * Tests for the live tab modules in /tabs/
 *
 * Tests: overview.js, review.js, tools.js
 * (functional.js was deleted — R5-C; it was dead after R5-B removed its only
 *  live caller. The assignDirectly-GONE require-time guard was relocated to a
 *  surviving top-level block below.)
 * (implementation.js, todo.js, progress.js were deleted — see B1 guard below)
 *
 * DRY: Shared fixtures for app state, grouped by operation type
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// ============================================================================
// SHARED FIXTURES
// ============================================================================

/**
 * Create a mock app state object used by all tabs
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock app state
 */
function createMockApp(overrides = {}) {
  return {
    projectPath: '/test/project',
    width: 80,
    mode: 'list',
    selectedIndex: 0,
    actionIndex: 0,
    message: null,
    selectedPlan: null,
    viewContent: null,
    toolIndex: 0,
    toolMode: null,
    settingsTabIndex: 0,
    settingIndex: 0,
    finishedOffset: 0,
    finishedIndex: 0,
    directInput: '',
    inputValue: '',
    doctorInput: '',
    latestVersion: null,
    ...overrides
  };
}

/**
 * Create a mock plan object
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock plan
 */
function createMockPlan(overrides = {}) {
  return {
    name: 'test-plan',
    path: '/test/project/plans/functional/draft/test-plan.md',
    created: new Date(),
    modified: new Date(),
    ago: '1h ago',
    metadata: {},
    content: '# Test Plan\n\nContent here.',
    ...overrides
  };
}

/**
 * Create a mock key event
 * @param {string} name - Key name (e.g., 'up', 'down', 'return')
 * @param {Object} overrides - Additional properties
 * @returns {Object} Mock key event
 */
function createMockKey(name, overrides = {}) {
  const key = {
    name,
    sequence: name.length === 1 ? name : '',
    ctrl: false,
    meta: false,
    shift: false,
    ...overrides
  };
  // For single character keys, set sequence
  if (name.length === 1) {
    key.sequence = name;
  }
  return key;
}

// ============================================================================
// MODULE MOCKS
// ============================================================================

// Mock state module
function mockState(mocks = {}) {
  return {
    getPlanCounts: mocks.getPlanCounts || (() => ({
      functional: 2,
      implementation: 1,
      review: 3,
      todo: 4,
      inProgress: 1,
      done: 5
    })),
    getAgentStatus: mocks.getAgentStatus || (() => ({
      active: false
    })),
    readPlans: mocks.readPlans || (() => []),
    getPlansDir: mocks.getPlansDir || ((p) => path.join(p || '/test/project', 'plans')),
    getFinishedItems: mocks.getFinishedItems || (() => []),
    getSettings: mocks.getSettings || (() => ({
      autoPick: true,
      maxParallelAgents: 1,
      showElapsed: true,
      finishedItemsToShow: 10
    }))
  };
}

// Mock actions module
function mockActions(mocks = {}) {
  return {
    approvePlan: mocks.approvePlan || (() => '/test/approved.md'),
    renamePlan: mocks.renamePlan || (() => '/test/renamed.md'),
    deletePlan: mocks.deletePlan || (() => {}),
    rejectPlan: mocks.rejectPlan || (() => '/test/rejected.md'),
    removeFromQueue: mocks.removeFromQueue || (() => '/test/removed.md')
  };
}

// Mock version module
function mockVersion(mocks = {}) {
  return {
    getVersion: mocks.getVersion || (() => '1.2.3'),
    bump: mocks.bump || ((v, t) => {
      const [major, minor, patch] = v.split('.').map(Number);
      if (t === 'major') return `${major + 1}.0.0`;
      if (t === 'minor') return `${major}.${minor + 1}.0`;
      return `${major}.${minor}.${patch + 1}`;
    }),
    release: mocks.release || ((t) => ({ oldVersion: '1.2.3', newVersion: '1.2.4', synced: {} }))
  };
}

// Mock settings module
function mockSettings(mocks = {}) {
  return {
    SETTINGS_TABS: mocks.SETTINGS_TABS || [
      { id: 'general', name: 'General' },
      { id: 'agents', name: 'Agents' },
      { id: 'workflow', name: 'Workflow' }
    ],
    SETTINGS_SCHEMA: mocks.SETTINGS_SCHEMA || {
      general: {
        label: 'General Settings',
        settings: [
          { key: 'timezone', label: 'Timezone', type: 'string', default: 'UTC' },
          { key: 'syncEnabled', label: 'Auto-sync enabled', type: 'toggle', default: true }
        ]
      }
    },
    loadSettings: mocks.loadSettings || (() => ({ general: { timezone: 'UTC', syncEnabled: true } })),
    saveSettings: mocks.saveSettings || (() => {}),
    toggleSetting: mocks.toggleSetting || (() => false),
    setSetting: mocks.setSetting || (() => {}),
    getCategorySchema: mocks.getCategorySchema || ((cat) => ({
      label: 'Test Settings',
      settings: [
        { key: 'test', label: 'Test Setting', type: 'toggle', default: true }
      ]
    }))
  };
}

// Mock sync module
function mockSync(mocks = {}) {
  return {
    getLastSync: mocks.getLastSync || (() => new Date()),
    manualSync: mocks.manualSync || (() => ({ synced: true }))
  };
}

// Mock task-reconcile module (the doctor "Repair state" action).
// Default: a healthy reconcile that changed nothing.
function mockReconcile(mocks = {}) {
  return {
    reconcileState: mocks.reconcileState || (() => ({
      report: {
        orphaned: [], swept: [], cancelled: [], unsatisfiable: [],
        quarantineReleased: [], corrupt: null
      },
      promote: []
    }))
  };
}

// Mock enforcement-log module (the doctor "View logs" action).
function mockEnforcementLog(mocks = {}) {
  return {
    readLog: mocks.readLog || (() => [])
  };
}

// Mock tui module (returns real functions since they're pure)
const realTui = require('../src/lib/tui');
function mockTui() {
  return {
    c: realTui.c,
    line: realTui.line,
    renderList: realTui.renderList,
    renderActionMenu: realTui.renderActionMenu,
    renderConfirm: realTui.renderConfirm,
    renderInput: realTui.renderInput,
    renderFooter: realTui.renderFooter,
    renderTabs: realTui.renderTabs,
    stripCtl: realTui.stripCtl
  };
}

// ============================================================================
// TEST HELPER: Module loader with mocks
// ============================================================================

/**
 * Load a tab module with mocked dependencies
 * @param {string} tabName - Tab module name (e.g., 'overview')
 * @param {Object} mocks - Mock overrides for dependencies
 * @returns {Object} The tab module with mocked dependencies
 */
function loadTabWithMocks(tabName, mocks = {}) {
  // Clear module cache for the tab and its dependencies
  const tabPath = require.resolve(`../src/tabs/${tabName}`);
  delete require.cache[tabPath];
  delete require.cache[require.resolve('../src/lib/state')];
  delete require.cache[require.resolve('../src/lib/actions')];
  delete require.cache[require.resolve('../src/lib/version')];
  delete require.cache[require.resolve('../src/lib/settings')];
  delete require.cache[require.resolve('../src/lib/sync')];

  // Mock require for dependencies
  const Module = require('module');
  const originalRequire = Module.prototype.require;

  Module.prototype.require = function(id) {
    if (id === '../src/lib/state' || id.endsWith('/lib/state')) {
      return mockState(mocks.state);
    }
    if (id === '../src/lib/actions' || id.endsWith('/lib/actions')) {
      return mockActions(mocks.actions);
    }
    if (id === '../src/lib/version' || id.endsWith('/lib/version')) {
      return mockVersion(mocks.version);
    }
    if (id === '../src/lib/settings' || id.endsWith('/lib/settings')) {
      return mockSettings(mocks.settings);
    }
    if (id === '../src/lib/sync' || id.endsWith('/lib/sync')) {
      return mockSync(mocks.sync);
    }
    if (id === '../src/lib/task-reconcile' || id.endsWith('/lib/task-reconcile')) {
      return mockReconcile(mocks.reconcile);
    }
    if (id === '../src/lib/enforcement-log' || id.endsWith('/lib/enforcement-log')) {
      return mockEnforcementLog(mocks.enforcementLog);
    }
    if (id === '../src/lib/tui' || id.endsWith('/lib/tui')) {
      return mockTui();
    }
    return originalRequire.apply(this, arguments);
  };

  try {
    return require(`../src/tabs/${tabName}`);
  } finally {
    Module.prototype.require = originalRequire;
  }
}

// ============================================================================
// RENDER TESTS - All tabs
// ============================================================================

describe('Tab Modules - render()', () => {

  // -------------------------------------------------------------------------
  // Overview Tab
  // -------------------------------------------------------------------------
  describe('overview.render()', () => {
    test('renders version and plan counts', () => {
      const overview = loadTabWithMocks('overview', {
        version: { getVersion: () => '2.0.0' },
        state: {
          getPlanCounts: () => ({ functional: 5, implementation: 3, review: 2, todo: 1, inProgress: 0 }),
          getAgentStatus: () => ({ active: false })
        }
      });

      const app = createMockApp();
      const output = overview.render(app);

      assert.ok(output.includes('CTOC'), 'Should show CTOC title');
      assert.ok(output.includes('2.0.0'), 'Should show version');
      assert.ok(output.includes('5'), 'Should show functional count');
      assert.ok(output.includes('Pipeline'), 'Should show Pipeline section');
    });

    test('renders active agent status', () => {
      const overview = loadTabWithMocks('overview', {
        state: {
          getPlanCounts: () => ({ functional: 0, implementation: 0, review: 0, todo: 0, inProgress: 1 }),
          getAgentStatus: () => ({
            active: true,
            name: 'test-agent',
            step: 7,
            phase: 'TEST',
            task: 'Running tests',
            elapsed: '5m'
          })
        }
      });

      const app = createMockApp();
      const output = overview.render(app);

      assert.ok(output.includes('Running'), 'Should show running status');
      assert.ok(output.includes('test-agent'), 'Should show agent name');
      assert.ok(output.includes('Step 7/16'), 'Should show step');
      assert.ok(output.includes('TEST'), 'Should show phase');
    });

    test('renders idle agent status', () => {
      const overview = loadTabWithMocks('overview', {
        state: {
          getPlanCounts: () => ({ functional: 0, implementation: 0, review: 0, todo: 0, inProgress: 0 }),
          getAgentStatus: () => ({ active: false })
        }
      });

      const app = createMockApp();
      const output = overview.render(app);

      assert.ok(output.includes('Idle'), 'Should show idle status');
    });

    test('renders release section with footer', () => {
      const overview = loadTabWithMocks('overview');
      const app = createMockApp();
      const output = overview.render(app);

      assert.ok(output.includes('Release') || output.includes('release'), 'Should show release section');
      assert.ok(output.includes('quit'), 'Should show quit hint in footer');
    });
  });

  // -------------------------------------------------------------------------
  // Review Tab
  // -------------------------------------------------------------------------
  describe('review.render()', () => {
    test('renders empty state', () => {
      const review = loadTabWithMocks('review', {
        state: { readPlans: () => [] }
      });

      const app = createMockApp();
      const output = review.render(app);

      assert.ok(output.includes('Awaiting Review'), 'Should show title');
      assert.ok(output.includes('0 pending'), 'Should show zero count');
      assert.ok(output.includes('No items awaiting review'), 'Should show empty message');
    });

    test('renders review list', () => {
      const plans = [
        createMockPlan({ name: 'review-item-1' }),
        createMockPlan({ name: 'review-item-2' }),
        createMockPlan({ name: 'review-item-3' })
      ];

      const review = loadTabWithMocks('review', {
        state: { readPlans: () => plans }
      });

      const app = createMockApp();
      const output = review.render(app);

      assert.ok(output.includes('3 pending'), 'Should show pending count');
      assert.ok(output.includes('review-item-1'), 'Should list items');
    });
  });

  // -------------------------------------------------------------------------
  // Tools Tab
  // -------------------------------------------------------------------------
  describe('tools.render()', () => {
    test('renders tool list', () => {
      const tools = loadTabWithMocks('tools');

      const app = createMockApp();
      const output = tools.render(app);

      assert.ok(output.includes('Tools'), 'Should show title');
      assert.ok(output.includes('Doctor'), 'Should show Doctor tool');
      assert.ok(output.includes('Update'), 'Should show Update tool');
      assert.ok(output.includes('Settings'), 'Should show Settings tool');
      assert.ok(output.includes('Health check'), 'Should show Doctor description');
    });

    test('renders with selection indicator', () => {
      const tools = loadTabWithMocks('tools');

      const app = createMockApp({ toolIndex: 1 });
      const output = tools.render(app);

      // The arrow indicator should be at index 1 (Update)
      assert.ok(output.includes('Update'), 'Should show Update tool');
    });
  });

  // -------------------------------------------------------------------------
  // Tools Tab - Sub-renders
  // -------------------------------------------------------------------------
  describe('tools.renderDoctor()', () => {
    test('renders health checks', () => {
      const tools = loadTabWithMocks('tools');

      const app = createMockApp({ projectPath: __dirname });
      const output = tools.renderDoctor(app);

      assert.ok(output.includes('Doctor'), 'Should show Doctor title');
      assert.ok(output.includes('Health Check'), 'Should show health check section');
      assert.ok(output.includes('Node.js'), 'Should check Node version');
    });
  });

  describe('tools.renderUpdate()', () => {
    test('renders current version', () => {
      const tools = loadTabWithMocks('tools', {
        version: { getVersion: () => '3.0.0' }
      });

      const app = createMockApp();
      const output = tools.renderUpdate(app);

      assert.ok(output.includes('Update'), 'Should show Update title');
      assert.ok(output.includes('Current version'), 'Should show current version label');
    });

    test('renders update available', () => {
      const tools = loadTabWithMocks('tools');

      const app = createMockApp({ latestVersion: '4.0.0' });
      const output = tools.renderUpdate(app);

      assert.ok(output.includes('4.0.0'), 'Should show latest version');
    });
  });

  describe('tools.renderSettings()', () => {
    test('renders settings categories', () => {
      const tools = loadTabWithMocks('tools');

      const app = createMockApp({ settingsTabIndex: 0, settingIndex: 0 });
      const output = tools.renderSettings(app);

      assert.ok(output.includes('Settings'), 'Should show Settings title');
      assert.ok(output.includes('General'), 'Should show General tab');
    });
  });
});

// ============================================================================
// HANDLEKEY TESTS - All tabs
// ============================================================================

describe('Tab Modules - handleKey()', () => {

  // -------------------------------------------------------------------------
  // Common Navigation Patterns
  // -------------------------------------------------------------------------
  describe('List Navigation (shared pattern)', () => {
    // 'functional' removed (R5-C — tab deleted); 'review' still exercises the pattern
    const listTabs = ['review'];

    for (const tabName of listTabs) {
      test(`${tabName}: up/down navigation with plans`, () => {
        const plans = [
          createMockPlan({ name: 'plan-1' }),
          createMockPlan({ name: 'plan-2' }),
          createMockPlan({ name: 'plan-3' })
        ];

        const tab = loadTabWithMocks(tabName, {
          state: { readPlans: () => plans }
        });

        const app = createMockApp({ selectedIndex: 1 });

        // Down navigation
        let handled = tab.handleKey(createMockKey('down'), app);
        assert.strictEqual(handled, true, 'Should handle down key');
        assert.strictEqual(app.selectedIndex, 2, 'Should increment selectedIndex');

        // Up navigation
        handled = tab.handleKey(createMockKey('up'), app);
        assert.strictEqual(handled, true, 'Should handle up key');
        assert.strictEqual(app.selectedIndex, 1, 'Should decrement selectedIndex');
      });

      test(`${tabName}: boundary limits`, () => {
        const plans = [createMockPlan({ name: 'plan-1' })];

        const tab = loadTabWithMocks(tabName, {
          state: { readPlans: () => plans }
        });

        // At top, can't go higher
        const appAtTop = createMockApp({ selectedIndex: 0 });
        tab.handleKey(createMockKey('up'), appAtTop);
        assert.strictEqual(appAtTop.selectedIndex, 0, 'Should not go below 0');

        // At bottom, can't go lower
        const appAtBottom = createMockApp({ selectedIndex: 0 });
        tab.handleKey(createMockKey('down'), appAtBottom);
        assert.strictEqual(appAtBottom.selectedIndex, 0, 'Should not exceed list length');
      });

      test(`${tabName}: enter opens actions`, () => {
        const plans = [createMockPlan({ name: 'plan-1' })];

        const tab = loadTabWithMocks(tabName, {
          state: { readPlans: () => plans }
        });

        const app = createMockApp();
        const handled = tab.handleKey(createMockKey('return'), app);

        assert.strictEqual(handled, true, 'Should handle enter');
        assert.strictEqual(app.mode, 'actions', 'Should switch to actions mode');
        assert.strictEqual(app.actionIndex, 0, 'Should reset actionIndex');
        assert.ok(app.selectedPlan, 'Should set selectedPlan');
      });

      test(`${tabName}: number jump selects item`, () => {
        const plans = [
          createMockPlan({ name: 'plan-1' }),
          createMockPlan({ name: 'plan-2' })
        ];

        const tab = loadTabWithMocks(tabName, {
          state: { readPlans: () => plans }
        });

        const app = createMockApp();
        const handled = tab.handleKey(createMockKey('2', { sequence: '2' }), app);

        assert.strictEqual(handled, true, 'Should handle number key');
        assert.strictEqual(app.selectedIndex, 1, 'Should jump to item 2 (index 1)');
        assert.strictEqual(app.mode, 'actions', 'Should open actions');
      });

      test(`${tabName}: empty list returns false`, () => {
        const tab = loadTabWithMocks(tabName, {
          state: { readPlans: () => [] }
        });

        const app = createMockApp();
        const handled = tab.handleKey(createMockKey('down'), app);

        // review returns false when the list is empty
        assert.strictEqual(handled, false, 'Should not handle when empty');
      });
    }
  });

  // -------------------------------------------------------------------------
  // Action Menu Navigation (shared pattern)
  // -------------------------------------------------------------------------
  describe('Action Menu Navigation (shared pattern)', () => {
    // 'functional' removed (R5-C — tab deleted); 'review' still exercises the pattern
    const actionTabs = ['review'];

    for (const tabName of actionTabs) {
      test(`${tabName}: escape returns to list`, () => {
        const plans = [createMockPlan()];

        const tab = loadTabWithMocks(tabName, {
          state: { readPlans: () => plans }
        });

        const app = createMockApp({ mode: 'actions', selectedPlan: plans[0] });
        const handled = tab.handleKey(createMockKey('escape'), app);

        assert.strictEqual(handled, true, 'Should handle escape');
        assert.strictEqual(app.mode, 'list', 'Should return to list mode');
      });

      test(`${tabName}: b key returns to list`, () => {
        const plans = [createMockPlan()];

        const tab = loadTabWithMocks(tabName, {
          state: { readPlans: () => plans }
        });

        const app = createMockApp({ mode: 'actions', selectedPlan: plans[0] });
        const handled = tab.handleKey(createMockKey('b'), app);

        assert.strictEqual(handled, true, 'Should handle b key');
        assert.strictEqual(app.mode, 'list', 'Should return to list mode');
      });

      test(`${tabName}: up/down in actions menu`, () => {
        const plans = [createMockPlan()];

        const tab = loadTabWithMocks(tabName, {
          state: { readPlans: () => plans }
        });

        const app = createMockApp({ mode: 'actions', actionIndex: 1, selectedPlan: plans[0] });

        // Down
        tab.handleKey(createMockKey('down'), app);
        assert.strictEqual(app.actionIndex, 2, 'Should increment actionIndex');

        // Up
        tab.handleKey(createMockKey('up'), app);
        assert.strictEqual(app.actionIndex, 1, 'Should decrement actionIndex');
      });
    }
  });

  // -------------------------------------------------------------------------
  // Overview Tab - Release Mode
  // -------------------------------------------------------------------------
  describe('overview.handleKey() - Release Mode', () => {
    test('r key enters release mode', () => {
      const overview = loadTabWithMocks('overview');

      const app = createMockApp();
      const handled = overview.handleKey(createMockKey('r', { sequence: 'r' }), app);

      assert.strictEqual(handled, true, 'Should handle r key');
      // Note: releaseMode is internal to the module
    });

    test('reset() clears release state', () => {
      const overview = loadTabWithMocks('overview');

      // Should not throw
      assert.doesNotThrow(() => overview.reset());
    });
  });

  // -------------------------------------------------------------------------
  // Review Tab - Specific Actions
  // -------------------------------------------------------------------------
  describe('review.handleKey() - Specific Actions', () => {
    test('direct typing for feedback', () => {
      const plan = createMockPlan();
      const review = loadTabWithMocks('review', {
        state: { readPlans: () => [plan] }
      });

      const app = createMockApp({ mode: 'actions', selectedPlan: plan, directInput: '' });

      // Type some feedback
      review.handleKey(createMockKey('t', { sequence: 't' }), app);
      assert.strictEqual(app.directInput, 't', 'Should append character');

      review.handleKey(createMockKey('e', { sequence: 'e' }), app);
      assert.strictEqual(app.directInput, 'te', 'Should append more characters');
    });

    test('backspace removes character', () => {
      const plan = createMockPlan();
      const review = loadTabWithMocks('review', {
        state: { readPlans: () => [plan] }
      });

      const app = createMockApp({ mode: 'actions', selectedPlan: plan, directInput: 'test' });
      review.handleKey(createMockKey('backspace'), app);

      assert.strictEqual(app.directInput, 'tes', 'Should remove last character');
    });

    test('enter with feedback rejects plan', () => {
      let rejectCalled = false;
      let rejectFeedback = null;
      const plan = createMockPlan();

      const review = loadTabWithMocks('review', {
        state: { readPlans: () => [plan] },
        actions: { rejectPlan: (p, f) => { rejectCalled = true; rejectFeedback = f; } }
      });

      const app = createMockApp({
        mode: 'actions',
        selectedPlan: plan,
        directInput: 'Fix the bug'
      });
      review.handleKey(createMockKey('return'), app);

      assert.strictEqual(rejectCalled, true, 'Should call rejectPlan');
      assert.strictEqual(rejectFeedback, 'Fix the bug', 'Should pass feedback');
      assert.strictEqual(app.mode, 'list', 'Should return to list');
    });

    test('action 5 does NOT approve (Gate-3 one-keystroke crossing removed, L8)', () => {
      let approveCalled = false;
      const plan = createMockPlan();

      const review = loadTabWithMocks('review', {
        state: { readPlans: () => [plan] },
        actions: { approvePlan: () => { approveCalled = true; } }
      });

      const app = createMockApp({ mode: 'actions', selectedPlan: plan, directInput: '' });
      const handled = review.handleKey(createMockKey('5', { sequence: '5' }), app);

      assert.strictEqual(approveCalled, false, 'approvePlan must NOT be reachable via key 5');
      assert.strictEqual(handled, false, 'key 5 is no longer a handled action');
    });

    test('action 6 enters reject-input mode', () => {
      const plan = createMockPlan();
      const review = loadTabWithMocks('review', {
        state: { readPlans: () => [plan] }
      });

      const app = createMockApp({ mode: 'actions', selectedPlan: plan, directInput: '' });
      review.handleKey(createMockKey('6', { sequence: '6' }), app);

      assert.strictEqual(app.mode, 'reject-input', 'Should enter reject-input mode');
      assert.strictEqual(app.inputValue, '', 'Should clear input value');
    });

    test('reject-input: enter submits rejection', () => {
      let rejectCalled = false;
      const plan = createMockPlan();

      const review = loadTabWithMocks('review', {
        state: { readPlans: () => [plan] },
        actions: { rejectPlan: () => { rejectCalled = true; } }
      });

      const app = createMockApp({
        mode: 'reject-input',
        selectedPlan: plan,
        inputValue: 'Needs more tests'
      });
      review.handleKey(createMockKey('return'), app);

      assert.strictEqual(rejectCalled, true, 'Should call rejectPlan');
      assert.strictEqual(app.mode, 'list', 'Should return to list');
    });

    test('reject-input: escape cancels', () => {
      const plan = createMockPlan();
      const review = loadTabWithMocks('review', {
        state: { readPlans: () => [plan] }
      });

      const app = createMockApp({ mode: 'reject-input', selectedPlan: plan, inputValue: 'test' });
      review.handleKey(createMockKey('escape'), app);

      assert.strictEqual(app.mode, 'actions', 'Should return to actions');
      assert.strictEqual(app.inputValue, '', 'Should clear input');
    });
  });

  // -------------------------------------------------------------------------
  // Tools Tab - Tool Selection
  // -------------------------------------------------------------------------
  describe('tools.handleKey() - Tool Selection', () => {
    test('up/down navigates tools', () => {
      const tools = loadTabWithMocks('tools');

      const app = createMockApp({ toolIndex: 0 });

      tools.handleKey(createMockKey('down'), app);
      assert.strictEqual(app.toolIndex, 1, 'Should increment toolIndex');

      tools.handleKey(createMockKey('up'), app);
      assert.strictEqual(app.toolIndex, 0, 'Should decrement toolIndex');
    });

    test('enter opens selected tool', () => {
      const tools = loadTabWithMocks('tools');

      const app = createMockApp({ toolIndex: 0 });
      tools.handleKey(createMockKey('return'), app);

      assert.strictEqual(app.toolMode, '1', 'Should enter tool mode 1 (Doctor)');
    });

    test('number keys open tools directly', () => {
      const tools = loadTabWithMocks('tools');

      const app = createMockApp();
      tools.handleKey(createMockKey('2', { sequence: '2' }), app);

      assert.strictEqual(app.toolMode, '2', 'Should enter tool mode 2 (Update)');
    });

    test('opening Settings initializes tab state', () => {
      const tools = loadTabWithMocks('tools');

      const app = createMockApp({ settingsTabIndex: 5, settingIndex: 10 });
      tools.handleKey(createMockKey('3', { sequence: '3' }), app);

      assert.strictEqual(app.toolMode, '3', 'Should enter Settings mode');
      assert.strictEqual(app.settingsTabIndex, 0, 'Should reset settingsTabIndex');
      assert.strictEqual(app.settingIndex, 0, 'Should reset settingIndex');
    });
  });

  // -------------------------------------------------------------------------
  // Tools Tab - Doctor Mode
  // -------------------------------------------------------------------------
  describe('tools.handleKey() - Doctor Mode', () => {
    test('escape exits doctor mode', () => {
      const tools = loadTabWithMocks('tools');

      const app = createMockApp({ toolMode: '1', doctorInput: 'test' });
      tools.handleKey(createMockKey('escape'), app);

      assert.strictEqual(app.toolMode, null, 'Should exit tool mode');
      assert.strictEqual(app.doctorInput, '', 'Should clear input');
    });

    test('3 triggers sync', () => {
      let syncCalled = false;
      const tools = loadTabWithMocks('tools', {
        sync: {
          manualSync: () => { syncCalled = true; return { synced: true }; },
          getLastSync: () => new Date()
        }
      });

      const app = createMockApp({ toolMode: '1' });
      tools.handleKey(createMockKey('3', { sequence: '3' }), app);

      assert.strictEqual(syncCalled, true, 'Should call manualSync');
      assert.ok(app.message.includes('Sync'), 'Should show sync message');
    });

    test('typing adds to doctor input', () => {
      const tools = loadTabWithMocks('tools');

      const app = createMockApp({ toolMode: '1', doctorInput: '' });

      tools.handleKey(createMockKey('h', { sequence: 'h' }), app);
      assert.strictEqual(app.doctorInput, 'h', 'Should add character');

      tools.handleKey(createMockKey('i', { sequence: 'i' }), app);
      assert.strictEqual(app.doctorInput, 'hi', 'Should append character');
    });

    test('backspace removes from doctor input', () => {
      const tools = loadTabWithMocks('tools');

      const app = createMockApp({ toolMode: '1', doctorInput: 'test' });
      tools.handleKey(createMockKey('backspace'), app);

      assert.strictEqual(app.doctorInput, 'tes', 'Should remove character');
    });

    test('1 re-runs the health checks and confirms', () => {
      const tools = loadTabWithMocks('tools');

      const app = createMockApp({ toolMode: '1' });
      const handled = tools.handleKey(createMockKey('1', { sequence: '1' }), app);

      assert.strictEqual(handled, true, 'Should handle the key');
      assert.ok(/re-run/i.test(app.message), 'Should confirm checks were re-run');
      assert.strictEqual(app.doctorInput, '', 'Must not type the digit into the question box');
    });

    test('2 repairs state via reconcileState and reports what it fixed', () => {
      let repairPath = null;
      const tools = loadTabWithMocks('tools', {
        reconcile: {
          reconcileState: (root) => {
            repairPath = root;
            return {
              report: {
                orphaned: [{ id: 't1' }, { id: 't2' }], swept: [{ id: 't3' }],
                cancelled: [], unsatisfiable: [], quarantineReleased: [], corrupt: null
              },
              promote: []
            };
          }
        }
      });

      const app = createMockApp({ toolMode: '1' });
      const handled = tools.handleKey(createMockKey('2', { sequence: '2' }), app);

      assert.strictEqual(handled, true, 'Should handle the key');
      assert.strictEqual(repairPath, '/test/project', 'Should reconcile the project path');
      assert.ok(app.message.includes('3'), 'Should report 3 repaired issues');
      assert.ok(/repair/i.test(app.message), 'Should mention repair');
      assert.strictEqual(app.doctorInput, '', 'Must not type the digit into the question box');
    });

    test('2 reports a single repaired issue in the singular', () => {
      const tools = loadTabWithMocks('tools', {
        reconcile: {
          reconcileState: () => ({
            report: {
              orphaned: [{ id: 't1' }], swept: [], cancelled: [], unsatisfiable: [],
              quarantineReleased: [], corrupt: null
            },
            promote: []
          })
        }
      });

      const app = createMockApp({ toolMode: '1' });
      tools.handleKey(createMockKey('2', { sequence: '2' }), app);

      assert.ok(app.message.includes('1 '), 'Should report exactly 1');
      assert.ok(!/issues/.test(app.message), 'Should use the singular "issue"');
    });

    test('2 reports a healthy state when nothing needed repair', () => {
      const tools = loadTabWithMocks('tools'); // default reconcile: all empty

      const app = createMockApp({ toolMode: '1' });
      tools.handleKey(createMockKey('2', { sequence: '2' }), app);

      assert.ok(/healthy|nothing/i.test(app.message), 'Should say state is healthy');
    });

    test('2 surfaces a corrupt task registry legibly', () => {
      const tools = loadTabWithMocks('tools', {
        reconcile: {
          reconcileState: () => ({
            report: { orphaned: [], swept: [], cancelled: [], unsatisfiable: [],
              quarantineReleased: [], corrupt: { reason: 'load-failed' } },
            promote: []
          })
        }
      });

      const app = createMockApp({ toolMode: '1' });
      tools.handleKey(createMockKey('2', { sequence: '2' }), app);

      assert.ok(/load-failed/.test(app.message), 'Should name the corruption reason');
    });

    test('4 views the enforcement log (multiple entries)', () => {
      let logPath = null;
      const tools = loadTabWithMocks('tools', {
        enforcementLog: {
          readLog: (root) => { logPath = root; return [{ a: 1 }, { a: 2 }, { a: 3 }]; }
        }
      });

      const app = createMockApp({ toolMode: '1' });
      const handled = tools.handleKey(createMockKey('4', { sequence: '4' }), app);

      assert.strictEqual(handled, true, 'Should handle the key');
      assert.strictEqual(logPath, '/test/project', 'Should read the project log');
      assert.ok(app.message.includes('3'), 'Should report the entry count');
      assert.strictEqual(app.doctorInput, '', 'Must not type the digit into the question box');
    });

    test('4 reports a single log entry in the singular', () => {
      const tools = loadTabWithMocks('tools', {
        enforcementLog: { readLog: () => [{ a: 1 }] }
      });

      const app = createMockApp({ toolMode: '1' });
      tools.handleKey(createMockKey('4', { sequence: '4' }), app);

      assert.ok(app.message.includes('1 '), 'Should report exactly 1');
      assert.ok(/entry/.test(app.message), 'Should use the singular "entry"');
    });

    test('4 reports an empty log clearly', () => {
      const tools = loadTabWithMocks('tools'); // default readLog: []

      const app = createMockApp({ toolMode: '1' });
      tools.handleKey(createMockKey('4', { sequence: '4' }), app);

      assert.ok(/no enforcement|no .*activity/i.test(app.message), 'Should say the log is empty');
    });
  });

  // -------------------------------------------------------------------------
  // Tools Tab - Update Mode
  // -------------------------------------------------------------------------
  describe('tools.handleKey() - Update Mode', () => {
    test('escape exits update mode', () => {
      const tools = loadTabWithMocks('tools');

      const app = createMockApp({ toolMode: '2' });
      tools.handleKey(createMockKey('escape'), app);

      assert.strictEqual(app.toolMode, null, 'Should exit tool mode');
    });

    test('b key exits update mode', () => {
      const tools = loadTabWithMocks('tools');

      const app = createMockApp({ toolMode: '2' });
      tools.handleKey(createMockKey('b'), app);

      assert.strictEqual(app.toolMode, null, 'Should exit tool mode');
    });
  });

  // -------------------------------------------------------------------------
  // Tools Tab - Settings Mode
  // -------------------------------------------------------------------------
  describe('tools.handleKey() - Settings Mode', () => {
    test('escape exits settings mode', () => {
      const tools = loadTabWithMocks('tools');

      const app = createMockApp({ toolMode: '3' });
      tools.handleKey(createMockKey('escape'), app);

      assert.strictEqual(app.toolMode, null, 'Should exit tool mode');
    });

    test('left/right switches settings tabs', () => {
      const tools = loadTabWithMocks('tools');

      const app = createMockApp({ toolMode: '3', settingsTabIndex: 0 });

      tools.handleKey(createMockKey('right'), app);
      assert.strictEqual(app.settingsTabIndex, 1, 'Should increment tab index');
      assert.strictEqual(app.settingIndex, 0, 'Should reset setting index');

      tools.handleKey(createMockKey('left'), app);
      assert.strictEqual(app.settingsTabIndex, 0, 'Should decrement tab index');
    });

    test('up/down navigates settings', () => {
      const tools = loadTabWithMocks('tools', {
        settings: {
          SETTINGS_TABS: [{ id: 'general', name: 'General' }],
          loadSettings: () => ({ general: { a: true, b: false } }),
          toggleSetting: () => true,
          getCategorySchema: () => ({
            label: 'General',
            settings: [
              { key: 'a', label: 'Setting A', type: 'toggle', default: true },
              { key: 'b', label: 'Setting B', type: 'toggle', default: false },
              { key: 'c', label: 'Setting C', type: 'toggle', default: true }
            ]
          })
        }
      });

      const app = createMockApp({ toolMode: '3', settingIndex: 0 });

      tools.handleKey(createMockKey('down'), app);
      assert.strictEqual(app.settingIndex, 1, 'Should increment setting index');

      tools.handleKey(createMockKey('up'), app);
      assert.strictEqual(app.settingIndex, 0, 'Should decrement setting index');
    });

    test('enter toggles boolean setting', () => {
      let toggleCalled = false;
      const tools = loadTabWithMocks('tools', {
        settings: {
          SETTINGS_TABS: [{ id: 'general', name: 'General' }],
          loadSettings: () => ({ general: { testToggle: true } }),
          toggleSetting: () => { toggleCalled = true; return false; },
          getCategorySchema: () => ({
            label: 'General',
            settings: [{ key: 'testToggle', label: 'Test Toggle', type: 'toggle', default: true }]
          })
        }
      });

      const app = createMockApp({ toolMode: '3', settingsTabIndex: 0, settingIndex: 0 });
      tools.handleKey(createMockKey('return'), app);

      assert.strictEqual(toggleCalled, true, 'Should call toggleSetting');
    });

    test('settings tab wraps around', () => {
      const tools = loadTabWithMocks('tools');

      // Start at index 0, go left to wrap to end
      const app = createMockApp({ toolMode: '3', settingsTabIndex: 0 });
      tools.handleKey(createMockKey('left'), app);

      assert.strictEqual(app.settingsTabIndex, 2, 'Should wrap to last tab');

      // Go right to wrap back to start
      tools.handleKey(createMockKey('right'), app);
      assert.strictEqual(app.settingsTabIndex, 0, 'Should wrap to first tab');
    });
  });

  // -------------------------------------------------------------------------
  // Unhandled Keys Return False
  // -------------------------------------------------------------------------
  describe('Unhandled keys return false', () => {
    // 'functional' removed (R5-C — tab deleted)
    const allTabs = ['overview', 'review', 'tools'];

    for (const tabName of allTabs) {
      test(`${tabName}: unhandled key returns false`, () => {
        const tab = loadTabWithMocks(tabName, {
          state: { readPlans: () => [] }
        });

        const app = createMockApp();
        const handled = tab.handleKey(createMockKey('z', { sequence: 'z' }), app);

        // In list mode with no items, most keys should not be handled
        // (overview and tools have their own always-on keybindings)
        if (tabName !== 'overview' && tabName !== 'tools') {
          assert.strictEqual(handled, false, 'Should not handle unknown key');
        }
      });
    }
  });
});

// ============================================================================
// ADDITIONAL RENDER HELPERS TESTS
// ============================================================================

describe('Tab Modules - Additional Renders', () => {

  describe('review.renderActions()', () => {
    test('renders action menu with direct input area', () => {
      const review = loadTabWithMocks('review');
      const plan = createMockPlan();
      const app = createMockApp({ actionIndex: 0, directInput: '' });

      const output = review.renderActions(app, plan);

      assert.ok(output.includes('View functional'), 'Should show view functional');
      assert.ok(output.includes('View implementation'), 'Should show view implementation');
      assert.ok(!output.includes('Approve'), 'Approve action removed (L8 gate-crossing gone)');
      assert.ok(output.includes('Reject'), 'Should show reject');
      assert.ok(output.includes('feedback'), 'Should show feedback hint');
    });

    test('shows current direct input', () => {
      const review = loadTabWithMocks('review');
      const plan = createMockPlan();
      const app = createMockApp({ directInput: 'typing...' });

      const output = review.renderActions(app, plan);

      assert.ok(output.includes('typing...'), 'Should show current input');
    });
  });

  describe('review.renderRejectInput()', () => {
    test('renders rejection input form', () => {
      const review = loadTabWithMocks('review');
      const plan = createMockPlan({ name: 'test-plan' });
      const app = createMockApp({ selectedPlan: plan, inputValue: 'needs work' });

      const output = review.renderRejectInput(app);

      assert.ok(output.includes('Reject'), 'Should show reject title');
      assert.ok(output.includes('test-plan'), 'Should show plan name');
      assert.ok(output.includes('needs work'), 'Should show current input');
      assert.ok(output.includes('fixed'), 'Should ask what needs fixing');
    });
  });

});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Tab Modules - Edge Cases', () => {

  test('handles undefined app properties gracefully', () => {
    const tools = loadTabWithMocks('tools');

    // Create minimal app without optional properties
    const minimalApp = {
      projectPath: '/test',
      width: 80
    };

    // Should not throw when initializing undefined properties
    assert.doesNotThrow(() => {
      tools.handleKey(createMockKey('down'), minimalApp);
    });

    // Properties should be initialized
    assert.strictEqual(minimalApp.toolIndex, 1, 'Should initialize and increment toolIndex');
  });

  // R5-C: the three render/handleKey robustness edge cases (long names, empty
  // content, special characters) exercised the now-deleted functional tab and
  // were carved with it.
});

// ============================================================================
// ASSIGN-DIRECTLY REMOVED (R5-B) — require-time guard, RELOCATED here from the
// deleted `functional.handleKey() - Specific Actions` block (R5-C) so the
// permanent proof still runs. It requires only ../src/lib/actions and never
// loads a tab module, so it is unaffected by the functional-tab deletion.
// ============================================================================

describe('assignDirectly removed (R5-B) — no stamp-less todo insertion path', () => {
  // The dangerous "Assign (skips impl planning)" action and its
  // `actions.assignDirectly` backing were DELETED — the old confirm-assign flow
  // inserted a plan into todo/ with no marker and no ledger entry, and the
  // revived gate hook reverted it right after the UI said "✓ added to todo
  // queue". This asserts the removal at the source: the export is GONE.
  test('actions.assignDirectly is GONE (require-time) — no stamp-less todo insertion path', () => {
    const actions = require('../src/lib/actions');
    assert.strictEqual(actions.assignDirectly, undefined,
      'assignDirectly must not be exported — reaching todo crosses Gate 2 (approvePlan only)');
  });
});

// ============================================================================
// DEAD MODULE GUARD (B1) — legacy tab modules deleted, nothing imports them
// ============================================================================

describe('Legacy tab modules removed (B1)', () => {
  const deadModules = ['implementation', 'progress', 'todo'];

  test('the three dead tab module files no longer exist', () => {
    for (const name of deadModules) {
      const modulePath = path.join(__dirname, '..', 'src', 'tabs', `${name}.js`);
      assert.strictEqual(
        fs.existsSync(modulePath), false,
        `src/tabs/${name}.js should be deleted`
      );
    }
  });

  test('no source or test file requires a deleted tab module', () => {
    // Exclude THIS guard file so its own regex literal never matches itself.
    const selfBasename = 'tab-modules.test.js';
    const deadRequire = /tabs\/(implementation|progress|todo)\b/;

    const roots = [
      path.join(__dirname, '..', 'src'),
      path.join(__dirname, '..', 'tests')
    ];

    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith('.js') && entry.name !== selfBasename) {
          if (deadRequire.test(fs.readFileSync(full, 'utf8'))) offenders.push(full);
        }
      }
    };
    roots.forEach(walk);

    assert.deepStrictEqual(
      offenders, [],
      `No file may require a deleted tab module; offenders: ${offenders.join(', ')}`
    );
  });
});
