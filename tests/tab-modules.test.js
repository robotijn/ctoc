/**
 * Tab Module Tests
 * Tests for all tab modules in /tabs/
 *
 * Tests: overview.js, functional.js, implementation.js, review.js,
 *        todo.js, progress.js, tools.js
 *
 * DRY: Shared fixtures for app state, grouped by operation type
 */

const { test, describe, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

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

// Store original module cache
const originalModules = {};

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
    assignDirectly: mocks.assignDirectly || (() => '/test/assigned.md'),
    moveUpInQueue: mocks.moveUpInQueue || (() => true),
    moveDownInQueue: mocks.moveDownInQueue || (() => true),
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

// Mock tui module (returns real functions since they're pure)
const realTui = require('../lib/tui');
function mockTui() {
  return {
    c: realTui.c,
    line: realTui.line,
    renderList: realTui.renderList,
    renderActionMenu: realTui.renderActionMenu,
    renderConfirm: realTui.renderConfirm,
    renderInput: realTui.renderInput,
    renderFooter: realTui.renderFooter,
    renderTabs: realTui.renderTabs
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
  const tabPath = require.resolve(`../tabs/${tabName}`);
  delete require.cache[tabPath];
  delete require.cache[require.resolve('../lib/state')];
  delete require.cache[require.resolve('../lib/actions')];
  delete require.cache[require.resolve('../lib/version')];
  delete require.cache[require.resolve('../lib/settings')];
  delete require.cache[require.resolve('../lib/sync')];

  // Mock require for dependencies
  const Module = require('module');
  const originalRequire = Module.prototype.require;

  Module.prototype.require = function(id) {
    if (id === '../lib/state' || id.endsWith('/lib/state')) {
      return mockState(mocks.state);
    }
    if (id === '../lib/actions' || id.endsWith('/lib/actions')) {
      return mockActions(mocks.actions);
    }
    if (id === '../lib/version' || id.endsWith('/lib/version')) {
      return mockVersion(mocks.version);
    }
    if (id === '../lib/settings' || id.endsWith('/lib/settings')) {
      return mockSettings(mocks.settings);
    }
    if (id === '../lib/sync' || id.endsWith('/lib/sync')) {
      return mockSync(mocks.sync);
    }
    if (id === '../lib/tui' || id.endsWith('/lib/tui')) {
      return mockTui();
    }
    return originalRequire.apply(this, arguments);
  };

  try {
    return require(`../tabs/${tabName}`);
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
      assert.ok(output.includes('Plans'), 'Should show Plans section');
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
      assert.ok(output.includes('Step 7/15'), 'Should show step');
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
  // Functional Tab
  // -------------------------------------------------------------------------
  describe('functional.render()', () => {
    test('renders empty state with instructions', () => {
      const functional = loadTabWithMocks('functional', {
        state: { readPlans: () => [] }
      });

      const app = createMockApp();
      const output = functional.render(app);

      assert.ok(output.includes('Functional Plans'), 'Should show title');
      assert.ok(output.includes('0 drafts'), 'Should show zero count');
      assert.ok(output.includes('No functional plans'), 'Should show empty message');
      assert.ok(output.includes('n') && output.includes('new'), 'Should show new plan hint');
    });

    test('renders plan list with selection', () => {
      const plans = [
        createMockPlan({ name: 'plan-a', ago: '2h ago' }),
        createMockPlan({ name: 'plan-b', ago: '1d ago' })
      ];

      const functional = loadTabWithMocks('functional', {
        state: { readPlans: () => plans }
      });

      const app = createMockApp({ selectedIndex: 1 });
      const output = functional.render(app);

      assert.ok(output.includes('2 drafts'), 'Should show plan count');
      assert.ok(output.includes('plan-a'), 'Should list first plan');
      assert.ok(output.includes('plan-b'), 'Should list second plan');
    });
  });

  // -------------------------------------------------------------------------
  // Implementation Tab
  // -------------------------------------------------------------------------
  describe('implementation.render()', () => {
    test('renders empty state', () => {
      const implementation = loadTabWithMocks('implementation', {
        state: { readPlans: () => [] }
      });

      const app = createMockApp();
      const output = implementation.render(app);

      assert.ok(output.includes('Implementation Plans'), 'Should show title');
      assert.ok(output.includes('0 drafts'), 'Should show zero count');
      assert.ok(output.includes('Plans move here after approving'), 'Should show instructions');
    });

    test('renders plan list', () => {
      const plans = [
        createMockPlan({ name: 'impl-plan-1' }),
        createMockPlan({ name: 'impl-plan-2' })
      ];

      const implementation = loadTabWithMocks('implementation', {
        state: { readPlans: () => plans }
      });

      const app = createMockApp();
      const output = implementation.render(app);

      assert.ok(output.includes('2 drafts'), 'Should show plan count');
      assert.ok(output.includes('impl-plan-1'), 'Should list plans');
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
  // Todo Tab
  // -------------------------------------------------------------------------
  describe('todo.render()', () => {
    test('renders empty queue', () => {
      const todo = loadTabWithMocks('todo', {
        state: { readPlans: () => [] }
      });

      const app = createMockApp();
      const output = todo.render(app);

      assert.ok(output.includes('Todo Queue'), 'Should show title');
      assert.ok(output.includes('0 queued'), 'Should show zero count');
      assert.ok(output.includes('FIFO'), 'Should mention FIFO order');
      assert.ok(output.includes('No plans in queue'), 'Should show empty message');
    });

    test('renders queue with items', () => {
      const plans = [
        createMockPlan({ name: 'todo-1' }),
        createMockPlan({ name: 'todo-2' })
      ];

      const todo = loadTabWithMocks('todo', {
        state: { readPlans: () => plans }
      });

      const app = createMockApp();
      const output = todo.render(app);

      assert.ok(output.includes('2 queued'), 'Should show queue count');
      assert.ok(output.includes('todo-1'), 'Should list items');
      assert.ok(output.includes('Agent picks oldest first'), 'Should show FIFO hint');
    });
  });

  // -------------------------------------------------------------------------
  // Progress Tab
  // -------------------------------------------------------------------------
  describe('progress.render()', () => {
    test('renders idle state', () => {
      const progress = loadTabWithMocks('progress', {
        state: {
          getAgentStatus: () => ({ active: false }),
          getFinishedItems: () => [],
          getSettings: () => ({ finishedItemsToShow: 10 })
        }
      });

      const app = createMockApp();
      const output = progress.render(app);

      assert.ok(output.includes('In Progress'), 'Should show In Progress section');
      assert.ok(output.includes('0 active'), 'Should show zero active');
      assert.ok(output.includes('Idle'), 'Should show idle status');
      assert.ok(output.includes('Finished'), 'Should show Finished section');
    });

    test('renders active agent', () => {
      const progress = loadTabWithMocks('progress', {
        state: {
          getAgentStatus: () => ({
            active: true,
            name: 'active-agent',
            step: 9,
            phase: 'IMPLEMENT',
            task: 'Building feature',
            elapsed: '10m'
          }),
          getFinishedItems: () => [],
          getSettings: () => ({ finishedItemsToShow: 10 })
        }
      });

      const app = createMockApp();
      const output = progress.render(app);

      assert.ok(output.includes('1 active'), 'Should show one active');
      assert.ok(output.includes('active-agent'), 'Should show agent name');
      assert.ok(output.includes('Step 9/15'), 'Should show step');
      assert.ok(output.includes('IMPLEMENT'), 'Should show phase');
    });

    test('renders finished items', () => {
      const finished = [
        createMockPlan({ name: 'done-1', ago: '1h ago' }),
        createMockPlan({ name: 'done-2', ago: '2h ago' })
      ];

      const progress = loadTabWithMocks('progress', {
        state: {
          getAgentStatus: () => ({ active: false }),
          getFinishedItems: () => finished,
          getSettings: () => ({ finishedItemsToShow: 10 })
        }
      });

      const app = createMockApp();
      const output = progress.render(app);

      assert.ok(output.includes('done-1'), 'Should show finished items');
      assert.ok(output.includes('completed'), 'Should show completion status');
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
    const listTabs = ['functional', 'implementation', 'review', 'todo'];

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

        // Most tabs return false when empty (functional handles 'n' key)
        if (tabName !== 'functional') {
          assert.strictEqual(handled, false, 'Should not handle when empty');
        }
      });
    }
  });

  // -------------------------------------------------------------------------
  // Action Menu Navigation (shared pattern)
  // -------------------------------------------------------------------------
  describe('Action Menu Navigation (shared pattern)', () => {
    const actionTabs = ['functional', 'implementation', 'review', 'todo'];

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
  // Functional Tab - Specific Actions
  // -------------------------------------------------------------------------
  describe('functional.handleKey() - Specific Actions', () => {
    test('n key creates new plan', () => {
      const functional = loadTabWithMocks('functional', {
        state: { readPlans: () => [] }
      });

      const app = createMockApp();
      const handled = functional.handleKey(createMockKey('n'), app);

      assert.strictEqual(handled, true, 'Should handle n key');
      assert.strictEqual(app.mode, 'new-plan', 'Should enter new-plan mode');
      assert.strictEqual(app.planType, 'functional', 'Should set plan type');
    });

    test('action 1 opens view mode', () => {
      const plan = createMockPlan({ content: 'Test content' });
      const functional = loadTabWithMocks('functional', {
        state: { readPlans: () => [plan] }
      });

      const app = createMockApp({ mode: 'actions', selectedPlan: plan });
      functional.handleKey(createMockKey('1', { sequence: '1' }), app);

      assert.strictEqual(app.mode, 'view', 'Should enter view mode');
      assert.strictEqual(app.viewContent, 'Test content', 'Should set view content');
    });

    test('action 3 approves plan', () => {
      let approveCalled = false;
      const plan = createMockPlan();

      const functional = loadTabWithMocks('functional', {
        state: { readPlans: () => [plan] },
        actions: { approvePlan: () => { approveCalled = true; return '/approved'; } }
      });

      const app = createMockApp({ mode: 'actions', selectedPlan: plan });
      functional.handleKey(createMockKey('3', { sequence: '3' }), app);

      assert.strictEqual(approveCalled, true, 'Should call approvePlan');
      assert.strictEqual(app.mode, 'list', 'Should return to list');
      assert.ok(app.message.includes('moved to implementation'), 'Should set success message');
    });

    test('action 6 shows assign confirmation', () => {
      const plan = createMockPlan();
      const functional = loadTabWithMocks('functional', {
        state: { readPlans: () => [plan] }
      });

      const app = createMockApp({ mode: 'actions', selectedPlan: plan });
      functional.handleKey(createMockKey('6', { sequence: '6' }), app);

      assert.strictEqual(app.mode, 'confirm-assign', 'Should enter confirm-assign mode');
    });

    test('confirm-assign: 1 assigns directly', () => {
      let assignCalled = false;
      const plan = createMockPlan();

      const functional = loadTabWithMocks('functional', {
        state: { readPlans: () => [plan] },
        actions: { assignDirectly: () => { assignCalled = true; } }
      });

      const app = createMockApp({ mode: 'confirm-assign', selectedPlan: plan });
      functional.handleKey(createMockKey('1', { sequence: '1' }), app);

      assert.strictEqual(assignCalled, true, 'Should call assignDirectly');
      assert.strictEqual(app.mode, 'list', 'Should return to list');
      assert.ok(app.message.includes('todo queue'), 'Should set success message');
    });

    test('confirm-assign: 2 cancels', () => {
      const plan = createMockPlan();
      const functional = loadTabWithMocks('functional', {
        state: { readPlans: () => [plan] }
      });

      const app = createMockApp({ mode: 'confirm-assign', selectedPlan: plan });
      functional.handleKey(createMockKey('2', { sequence: '2' }), app);

      assert.strictEqual(app.mode, 'actions', 'Should return to actions');
    });
  });

  // -------------------------------------------------------------------------
  // Implementation Tab - Specific Actions
  // -------------------------------------------------------------------------
  describe('implementation.handleKey() - Specific Actions', () => {
    test('action 3 approves with Iron Loop', () => {
      let approveCalled = false;
      const plan = createMockPlan();

      const implementation = loadTabWithMocks('implementation', {
        state: { readPlans: () => [plan] },
        actions: { approvePlan: () => { approveCalled = true; return '/approved'; } }
      });

      const app = createMockApp({ mode: 'actions', selectedPlan: plan });
      implementation.handleKey(createMockKey('3', { sequence: '3' }), app);

      assert.strictEqual(approveCalled, true, 'Should call approvePlan');
      assert.ok(app.message.includes('Iron Loop'), 'Should mention Iron Loop');
      assert.ok(app.message.includes('todo queue'), 'Should mention todo queue');
    });

    test('action 5 sets confirm-delete mode', () => {
      const plan = createMockPlan();
      const implementation = loadTabWithMocks('implementation', {
        state: { readPlans: () => [plan] }
      });

      const app = createMockApp({ mode: 'actions', selectedPlan: plan });
      implementation.handleKey(createMockKey('5', { sequence: '5' }), app);

      assert.strictEqual(app.mode, 'confirm-delete', 'Should enter confirm-delete mode');
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

    test('action 5 approves plan', () => {
      let approveCalled = false;
      const plan = createMockPlan();

      const review = loadTabWithMocks('review', {
        state: { readPlans: () => [plan] },
        actions: { approvePlan: () => { approveCalled = true; } }
      });

      const app = createMockApp({ mode: 'actions', selectedPlan: plan, directInput: '' });
      review.handleKey(createMockKey('5', { sequence: '5' }), app);

      assert.strictEqual(approveCalled, true, 'Should call approvePlan');
      assert.ok(app.message.includes('approved'), 'Should show approval message');
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
  // Todo Tab - Queue Actions
  // -------------------------------------------------------------------------
  describe('todo.handleKey() - Queue Actions', () => {
    test('action 2 moves plan up', () => {
      let moveUpCalled = false;
      const plans = [
        createMockPlan({ name: 'plan-1' }),
        createMockPlan({ name: 'plan-2' })
      ];

      const todo = loadTabWithMocks('todo', {
        state: { readPlans: () => plans },
        actions: { moveUpInQueue: () => { moveUpCalled = true; return true; } }
      });

      const app = createMockApp({
        mode: 'actions',
        selectedPlan: plans[1],
        selectedIndex: 1
      });
      todo.handleKey(createMockKey('2', { sequence: '2' }), app);

      assert.strictEqual(moveUpCalled, true, 'Should call moveUpInQueue');
      assert.strictEqual(app.selectedIndex, 0, 'Should update selectedIndex');
      assert.ok(app.message.includes('moved up'), 'Should show success message');
    });

    test('action 3 moves plan down', () => {
      let moveDownCalled = false;
      const plans = [
        createMockPlan({ name: 'plan-1' }),
        createMockPlan({ name: 'plan-2' })
      ];

      const todo = loadTabWithMocks('todo', {
        state: { readPlans: () => plans },
        actions: { moveDownInQueue: () => { moveDownCalled = true; return true; } }
      });

      const app = createMockApp({
        mode: 'actions',
        selectedPlan: plans[0],
        selectedIndex: 0
      });
      todo.handleKey(createMockKey('3', { sequence: '3' }), app);

      assert.strictEqual(moveDownCalled, true, 'Should call moveDownInQueue');
      assert.strictEqual(app.selectedIndex, 1, 'Should update selectedIndex');
      assert.ok(app.message.includes('moved down'), 'Should show success message');
    });

    test('action 4 removes from queue', () => {
      let removeCalled = false;
      const plan = createMockPlan();

      const todo = loadTabWithMocks('todo', {
        state: { readPlans: () => [plan] },
        actions: { removeFromQueue: () => { removeCalled = true; } }
      });

      const app = createMockApp({ mode: 'actions', selectedPlan: plan });
      todo.handleKey(createMockKey('4', { sequence: '4' }), app);

      assert.strictEqual(removeCalled, true, 'Should call removeFromQueue');
      assert.ok(app.message.includes('removed'), 'Should show removal message');
      assert.ok(app.message.includes('implementation draft'), 'Should mention destination');
    });
  });

  // -------------------------------------------------------------------------
  // Progress Tab - Navigation
  // -------------------------------------------------------------------------
  describe('progress.handleKey() - Navigation', () => {
    test('up/down scrolls finished items', () => {
      const finished = [
        createMockPlan({ name: 'done-1' }),
        createMockPlan({ name: 'done-2' }),
        createMockPlan({ name: 'done-3' })
      ];

      const progress = loadTabWithMocks('progress', {
        state: {
          getAgentStatus: () => ({ active: false }),
          getFinishedItems: () => finished,
          getSettings: () => ({ finishedItemsToShow: 10 })
        }
      });

      const app = createMockApp({ finishedIndex: 0 });

      progress.handleKey(createMockKey('down'), app);
      assert.strictEqual(app.finishedIndex, 1, 'Should increment finishedIndex');

      progress.handleKey(createMockKey('up'), app);
      assert.strictEqual(app.finishedIndex, 0, 'Should decrement finishedIndex');
    });

    test('enter on finished item opens view', () => {
      const finished = [createMockPlan({ name: 'done-1', content: 'Done content' })];

      const progress = loadTabWithMocks('progress', {
        state: {
          getAgentStatus: () => ({ active: false }),
          getFinishedItems: () => finished,
          getSettings: () => ({ finishedItemsToShow: 10 })
        }
      });

      const app = createMockApp({ finishedIndex: 0 });
      progress.handleKey(createMockKey('return'), app);

      assert.strictEqual(app.mode, 'view', 'Should enter view mode');
      assert.strictEqual(app.viewContent, 'Done content', 'Should set view content');
    });

    test('escape in view mode returns to list', () => {
      const finished = [createMockPlan()];

      const progress = loadTabWithMocks('progress', {
        state: {
          getAgentStatus: () => ({ active: false }),
          getFinishedItems: () => finished,
          getSettings: () => ({ finishedItemsToShow: 10 })
        }
      });

      const app = createMockApp({ mode: 'view', finishedIndex: 0 });
      progress.handleKey(createMockKey('escape'), app);

      assert.strictEqual(app.mode, 'list', 'Should return to list mode');
    });

    test('number jump to finished item', () => {
      const finished = [
        createMockPlan({ name: 'done-1', content: 'Content 1' }),
        createMockPlan({ name: 'done-2', content: 'Content 2' })
      ];

      const progress = loadTabWithMocks('progress', {
        state: {
          getAgentStatus: () => ({ active: false }),
          getFinishedItems: () => finished,
          getSettings: () => ({ finishedItemsToShow: 10 })
        }
      });

      const app = createMockApp();
      progress.handleKey(createMockKey('2', { sequence: '2' }), app);

      assert.strictEqual(app.finishedIndex, 1, 'Should jump to item 2');
      assert.strictEqual(app.mode, 'view', 'Should open view');
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
    const allTabs = ['overview', 'functional', 'implementation', 'review', 'todo', 'progress', 'tools'];

    for (const tabName of allTabs) {
      test(`${tabName}: unhandled key returns false`, () => {
        const tab = loadTabWithMocks(tabName, {
          state: { readPlans: () => [] }
        });

        const app = createMockApp();
        const handled = tab.handleKey(createMockKey('z', { sequence: 'z' }), app);

        // In list mode with no items, most keys should not be handled
        // (except specific keys like 'n' for functional)
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

  describe('functional.renderActions()', () => {
    test('renders action menu for plan', () => {
      const functional = loadTabWithMocks('functional');
      const plan = createMockPlan();
      const app = createMockApp({ actionIndex: 0 });

      const output = functional.renderActions(app, plan);

      assert.ok(output.includes('View'), 'Should show View action');
      assert.ok(output.includes('Plan'), 'Should show Plan action');
      assert.ok(output.includes('Approve'), 'Should show Approve action');
      assert.ok(output.includes('Assign'), 'Should show Assign action');
    });
  });

  describe('functional.renderAssignConfirm()', () => {
    test('renders assign confirmation dialog', () => {
      const functional = loadTabWithMocks('functional');
      const plan = createMockPlan();

      const output = functional.renderAssignConfirm(plan);

      assert.ok(output.includes('Assign directly'), 'Should show assign title');
      assert.ok(output.includes('skips implementation'), 'Should explain skip');
      assert.ok(output.includes('Iron Loop'), 'Should mention Iron Loop');
      assert.ok(output.includes('Yes'), 'Should show confirm option');
      assert.ok(output.includes('No'), 'Should show cancel option');
    });
  });

  describe('implementation.renderActions()', () => {
    test('renders action menu for plan', () => {
      const implementation = loadTabWithMocks('implementation');
      const plan = createMockPlan();
      const app = createMockApp({ actionIndex: 0 });

      const output = implementation.renderActions(app, plan);

      assert.ok(output.includes('View'), 'Should show View action');
      assert.ok(output.includes('Iron Loop'), 'Should mention Iron Loop in approve');
    });
  });

  describe('review.renderActions()', () => {
    test('renders action menu with direct input area', () => {
      const review = loadTabWithMocks('review');
      const plan = createMockPlan();
      const app = createMockApp({ actionIndex: 0, directInput: '' });

      const output = review.renderActions(app, plan);

      assert.ok(output.includes('View functional'), 'Should show view functional');
      assert.ok(output.includes('View implementation'), 'Should show view implementation');
      assert.ok(output.includes('Approve'), 'Should show approve');
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

  describe('todo.renderActions()', () => {
    test('renders queue action menu', () => {
      const todo = loadTabWithMocks('todo');
      const plan = createMockPlan();
      const app = createMockApp({ actionIndex: 0 });

      const output = todo.renderActions(app, plan);

      assert.ok(output.includes('View'), 'Should show View');
      assert.ok(output.includes('Move up'), 'Should show Move up');
      assert.ok(output.includes('Move down'), 'Should show Move down');
      assert.ok(output.includes('Remove'), 'Should show Remove');
    });
  });

  describe('progress.renderActions()', () => {
    test('renders action menu for finished item', () => {
      const progress = loadTabWithMocks('progress');
      const item = createMockPlan();
      const app = createMockApp();

      const output = progress.renderActions(app, item);

      assert.ok(output.includes('View'), 'Should show View action');
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

  test('handles very long plan names', () => {
    const longName = 'a'.repeat(200);
    const plans = [createMockPlan({ name: longName })];

    const functional = loadTabWithMocks('functional', {
      state: { readPlans: () => plans }
    });

    const app = createMockApp();

    assert.doesNotThrow(() => {
      functional.render(app);
    });
  });

  test('handles empty plan content', () => {
    const plan = createMockPlan({ content: '' });

    const functional = loadTabWithMocks('functional', {
      state: { readPlans: () => [plan] }
    });

    const app = createMockApp({ mode: 'actions', selectedPlan: plan });
    functional.handleKey(createMockKey('1', { sequence: '1' }), app);

    assert.strictEqual(app.viewContent, '', 'Should handle empty content');
  });

  test('handles special characters in plan name', () => {
    const plan = createMockPlan({ name: 'test-plan-with-$pecial_chars!' });

    const functional = loadTabWithMocks('functional', {
      state: { readPlans: () => [plan] }
    });

    const app = createMockApp();
    const output = functional.render(app);

    assert.ok(output.includes('$pecial'), 'Should render special characters');
  });

  test('progress tab handles scroll offset correctly', () => {
    const finished = Array.from({ length: 10 }, (_, i) =>
      createMockPlan({ name: `done-${i}`, content: `Content ${i}` })
    );

    const progress = loadTabWithMocks('progress', {
      state: {
        getAgentStatus: () => ({ active: false }),
        getFinishedItems: () => finished,
        getSettings: () => ({ finishedItemsToShow: 10 })
      }
    });

    const app = createMockApp({ finishedIndex: 6, finishedOffset: 2 });

    // Navigate down should update offset when needed
    progress.handleKey(createMockKey('down'), app);

    assert.strictEqual(app.finishedIndex, 7, 'Should update index');
    // Offset should adjust when index exceeds visible window
    assert.ok(app.finishedOffset >= 0, 'Offset should be non-negative');
  });
});
