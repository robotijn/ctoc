/**
 * Unit tests for CTOC UI Library
 */

const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert');

// Mock state-manager before requiring ui
const mockStateManager = {
  STEP_NAMES: {
    1: 'ASSESS', 2: 'ALIGN', 3: 'CAPTURE', 4: 'PLAN', 5: 'DESIGN', 6: 'SPEC',
    7: 'TEST', 8: 'QUALITY', 9: 'IMPLEMENT', 10: 'REVIEW', 11: 'OPTIMIZE',
    12: 'SECURE', 13: 'DOCUMENT', 14: 'VERIFY', 15: 'COMMIT'
  },
  STEP_DESCRIPTIONS: {
    1: 'Assess the problem and context',
    2: 'Align with user goals and business objectives',
    3: 'Capture requirements and success criteria',
    4: 'Plan the technical approach',
    5: 'Design the architecture',
    6: 'Write detailed specifications',
    7: 'Write failing tests (TDD Red)',
    8: 'Run quality checks (lint, format, type-check)',
    9: 'Implement to make tests pass (TDD Green)',
    10: 'Code review against CTO profile',
    11: 'Optimize for performance',
    12: 'Security audit',
    13: 'Update documentation',
    14: 'Run full test suite',
    15: 'Commit with verification'
  }
};

// Register mock before loading ui module
require.cache[require.resolve('../lib/state-manager')] = {
  exports: mockStateManager
};

const ui = require('../lib/ui');

// ============================================================================
// Shared Test Fixtures
// ============================================================================

const fixtures = {
  // Stack configurations
  emptyStack: {
    project: null,
    languages: [],
    frameworks: []
  },

  simpleStack: {
    project: '/home/user/my-project',
    languages: ['javascript'],
    frameworks: []
  },

  fullStack: {
    project: '/home/user/my-project',
    languages: ['typescript', 'python'],
    frameworks: ['react', 'fastapi']
  },

  // State configurations
  noState: null,

  emptyState: {
    feature: null,
    currentStep: 1,
    steps: {},
    gate1_approval: null,
    gate2_approval: null
  },

  earlyPlanningState: {
    feature: 'Add user authentication',
    currentStep: 2,
    steps: {
      1: { status: 'completed', timestamp: '2024-01-01T00:00:00Z' }
    },
    gate1_approval: null,
    gate2_approval: null
  },

  gate1PassedState: {
    feature: 'Add user authentication',
    currentStep: 4,
    steps: {
      1: { status: 'completed', timestamp: '2024-01-01T00:00:00Z' },
      2: { status: 'completed', timestamp: '2024-01-01T01:00:00Z' },
      3: { status: 'completed', timestamp: '2024-01-01T02:00:00Z' }
    },
    gate1_approval: { timestamp: '2024-01-01T03:00:00Z', user_confirmed: true },
    gate2_approval: null
  },

  bothGatesPassedState: {
    feature: 'Add user authentication',
    currentStep: 7,
    steps: {
      1: { status: 'completed', timestamp: '2024-01-01T00:00:00Z' },
      2: { status: 'completed', timestamp: '2024-01-01T01:00:00Z' },
      3: { status: 'completed', timestamp: '2024-01-01T02:00:00Z' },
      4: { status: 'completed', timestamp: '2024-01-01T04:00:00Z' },
      5: { status: 'completed', timestamp: '2024-01-01T05:00:00Z' },
      6: { status: 'completed', timestamp: '2024-01-01T06:00:00Z' }
    },
    gate1_approval: { timestamp: '2024-01-01T03:00:00Z', user_confirmed: true },
    gate2_approval: { timestamp: '2024-01-01T07:00:00Z', user_confirmed: true }
  },

  implementationState: {
    feature: 'Add user authentication',
    currentStep: 9,
    steps: {
      1: { status: 'completed', timestamp: '2024-01-01T00:00:00Z' },
      2: { status: 'completed', timestamp: '2024-01-01T01:00:00Z' },
      3: { status: 'completed', timestamp: '2024-01-01T02:00:00Z' },
      4: { status: 'completed', timestamp: '2024-01-01T04:00:00Z' },
      5: { status: 'completed', timestamp: '2024-01-01T05:00:00Z' },
      6: { status: 'completed', timestamp: '2024-01-01T06:00:00Z' },
      7: { status: 'completed', timestamp: '2024-01-01T08:00:00Z' },
      8: { status: 'completed', timestamp: '2024-01-01T09:00:00Z' }
    },
    gate1_approval: { timestamp: '2024-01-01T03:00:00Z', user_confirmed: true },
    gate2_approval: { timestamp: '2024-01-01T07:00:00Z', user_confirmed: true }
  },

  // Doctor check configurations
  healthyChecks: [
    {
      name: 'Environment',
      items: [
        { ok: true, label: 'Node.js version 20+' },
        { ok: true, label: 'Git installed' }
      ]
    },
    {
      name: 'Configuration',
      items: [
        { ok: true, label: 'CLAUDE.md exists' },
        { ok: true, label: 'Settings valid' }
      ]
    }
  ],

  mixedChecks: [
    {
      name: 'Environment',
      items: [
        { ok: true, label: 'Node.js version 20+' },
        { ok: false, label: 'Git not installed' }
      ]
    },
    {
      name: 'Configuration',
      items: [
        { ok: true, label: 'CLAUDE.md exists' },
        { ok: false, warn: true, label: 'Settings incomplete' }
      ]
    }
  ],

  // Kanban counts
  emptyKanban: {
    backlog: 0,
    functional: 0,
    technical: 0,
    ready: 0,
    building: 0,
    review: 0,
    done: 0
  },

  activeKanban: {
    backlog: 5,
    functional: 2,
    technical: 3,
    ready: 1,
    building: 4,
    review: 2,
    done: 10
  },

  // Git status
  cleanGit: { modified: 0, untracked: 0 },
  dirtyGit: { modified: 3, untracked: 5 }
};

// ============================================================================
// Helper Functions
// ============================================================================

function stripAnsi(str) {
  // Remove ANSI escape codes for easier assertion
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function containsAnsi(str, code) {
  return str.includes(code);
}

// ============================================================================
// Test: colors object
// ============================================================================

describe('colors object', () => {
  it('exports all expected color codes', () => {
    const expectedColors = ['red', 'green', 'yellow', 'blue', 'cyan', 'magenta', 'bold', 'dim', 'reset'];
    for (const color of expectedColors) {
      assert.ok(ui.colors[color], `Missing color: ${color}`);
      assert.ok(ui.colors[color].startsWith('\x1b['), `Invalid ANSI code for: ${color}`);
    }
  });

  it('has correct ANSI codes', () => {
    assert.strictEqual(ui.colors.reset, '\x1b[0m');
    assert.strictEqual(ui.colors.bold, '\x1b[1m');
    assert.strictEqual(ui.colors.dim, '\x1b[2m');
  });
});

// ============================================================================
// Test: getPhase function
// ============================================================================

describe('getPhase', () => {
  const planningSteps = [1, 2, 3, 4, 5, 6];
  const developmentSteps = [7, 8, 9, 10];
  const deliverySteps = [11, 12, 13, 14, 15];

  it('returns Planning for steps 1-6', () => {
    for (const step of planningSteps) {
      assert.strictEqual(ui.getPhase(step), 'Planning', `Step ${step} should be Planning`);
    }
  });

  it('returns Development for steps 7-10', () => {
    for (const step of developmentSteps) {
      assert.strictEqual(ui.getPhase(step), 'Development', `Step ${step} should be Development`);
    }
  });

  it('returns Delivery for steps 11-15', () => {
    for (const step of deliverySteps) {
      assert.strictEqual(ui.getPhase(step), 'Delivery', `Step ${step} should be Delivery`);
    }
  });

  it('returns Delivery for steps beyond 15', () => {
    assert.strictEqual(ui.getPhase(16), 'Delivery');
    assert.strictEqual(ui.getPhase(100), 'Delivery');
  });
});

// ============================================================================
// Test: dashboard function
// ============================================================================

describe('dashboard', () => {
  const version = '5.0.0';

  describe('header rendering', () => {
    it('displays CTOC title and version', () => {
      const output = ui.dashboard(fixtures.emptyState, fixtures.simpleStack, version);
      const plain = stripAnsi(output);

      assert.ok(plain.includes('CTOC'));
      assert.ok(plain.includes('v5.0.0'));
      assert.ok(plain.includes('CTO Chief'));
    });

    it('includes decorative borders', () => {
      const output = ui.dashboard(fixtures.emptyState, fixtures.simpleStack, version);
      assert.ok(output.includes('\u2550')); // Box drawing character
    });
  });

  describe('stack display', () => {
    it('shows project name from path', () => {
      const output = ui.dashboard(fixtures.emptyState, fixtures.simpleStack, version);
      const plain = stripAnsi(output);

      assert.ok(plain.includes('Project:'));
      assert.ok(plain.includes('my-project'));
    });

    it('shows Unknown when project is null', () => {
      const output = ui.dashboard(fixtures.emptyState, fixtures.emptyStack, version);
      const plain = stripAnsi(output);

      assert.ok(plain.includes('Unknown'));
    });

    it('shows languages joined with slash', () => {
      const output = ui.dashboard(fixtures.emptyState, fixtures.fullStack, version);
      const plain = stripAnsi(output);

      assert.ok(plain.includes('typescript/python'));
    });

    it('shows "none" when no languages', () => {
      const output = ui.dashboard(fixtures.emptyState, fixtures.emptyStack, version);
      const plain = stripAnsi(output);

      assert.ok(plain.includes('none'));
    });

    it('shows frameworks when present', () => {
      const output = ui.dashboard(fixtures.emptyState, fixtures.fullStack, version);
      const plain = stripAnsi(output);

      assert.ok(plain.includes('Framework:'));
      assert.ok(plain.includes('react, fastapi'));
    });

    it('omits Framework line when no frameworks', () => {
      const output = ui.dashboard(fixtures.emptyState, fixtures.simpleStack, version);
      const plain = stripAnsi(output);

      assert.ok(!plain.includes('Framework:'));
    });
  });

  describe('feature tracking display', () => {
    it('shows "No feature being tracked" with null state', () => {
      const output = ui.dashboard(null, fixtures.simpleStack, version);
      const plain = stripAnsi(output);

      assert.ok(plain.includes('No feature being tracked'));
      assert.ok(plain.includes('/ctoc start'));
    });

    it('shows "No feature being tracked" with empty feature', () => {
      const output = ui.dashboard(fixtures.emptyState, fixtures.simpleStack, version);
      const plain = stripAnsi(output);

      assert.ok(plain.includes('No feature being tracked'));
    });

    it('shows feature name when tracking', () => {
      const output = ui.dashboard(fixtures.earlyPlanningState, fixtures.simpleStack, version);
      const plain = stripAnsi(output);

      assert.ok(plain.includes('Feature:'));
      assert.ok(plain.includes('Add user authentication'));
    });

    it('shows current step number and name', () => {
      const output = ui.dashboard(fixtures.earlyPlanningState, fixtures.simpleStack, version);
      const plain = stripAnsi(output);

      assert.ok(plain.includes('Step:'));
      assert.ok(plain.includes('2/15'));
      assert.ok(plain.includes('ALIGN'));
      assert.ok(plain.includes('Planning'));
    });
  });

  describe('gate status display', () => {
    it('shows both gates as pending initially', () => {
      const output = ui.dashboard(fixtures.earlyPlanningState, fixtures.simpleStack, version);
      const plain = stripAnsi(output);

      assert.ok(plain.includes('Gate 1:'));
      assert.ok(plain.includes('Gate 2:'));
      // Both should show pending indicator
      const pendingCount = (plain.match(/Pending/g) || []).length;
      assert.strictEqual(pendingCount, 2);
    });

    it('shows Gate 1 passed when approved', () => {
      const output = ui.dashboard(fixtures.gate1PassedState, fixtures.simpleStack, version);
      const plain = stripAnsi(output);

      assert.ok(plain.includes('Passed')); // At least one passed
      assert.ok(plain.includes('Pending')); // Gate 2 still pending
    });

    it('shows both gates passed when approved', () => {
      const output = ui.dashboard(fixtures.bothGatesPassedState, fixtures.simpleStack, version);
      const plain = stripAnsi(output);

      const passedCount = (plain.match(/Passed/g) || []).length;
      assert.strictEqual(passedCount, 2);
    });

    it('uses green color for passed gates', () => {
      const output = ui.dashboard(fixtures.bothGatesPassedState, fixtures.simpleStack, version);

      assert.ok(containsAnsi(output, ui.colors.green));
    });

    it('uses yellow color for pending gates', () => {
      const output = ui.dashboard(fixtures.earlyPlanningState, fixtures.simpleStack, version);

      assert.ok(containsAnsi(output, ui.colors.yellow));
    });
  });
});

// ============================================================================
// Test: progress function
// ============================================================================

describe('progress', () => {
  describe('no feature state', () => {
    it('shows "No feature being tracked" with null state', () => {
      const output = ui.progress(null);
      const plain = stripAnsi(output);

      assert.ok(plain.includes('No feature being tracked'));
      assert.ok(plain.includes('/ctoc start'));
    });

    it('shows "No feature being tracked" with empty feature', () => {
      const output = ui.progress(fixtures.emptyState);
      const plain = stripAnsi(output);

      assert.ok(plain.includes('No feature being tracked'));
    });
  });

  describe('header rendering', () => {
    it('displays Iron Loop Progress title', () => {
      const output = ui.progress(fixtures.earlyPlanningState);
      const plain = stripAnsi(output);

      assert.ok(plain.includes('Iron Loop Progress'));
    });

    it('displays feature name', () => {
      const output = ui.progress(fixtures.earlyPlanningState);
      const plain = stripAnsi(output);

      assert.ok(plain.includes('Add user authentication'));
    });
  });

  describe('phase grouping', () => {
    it('shows all three phases', () => {
      const output = ui.progress(fixtures.earlyPlanningState);
      const plain = stripAnsi(output);

      assert.ok(plain.includes('Planning (1-6)'));
      assert.ok(plain.includes('Development (7-10)'));
      assert.ok(plain.includes('Delivery (11-15)'));
    });

    it('shows all 15 steps', () => {
      const output = ui.progress(fixtures.earlyPlanningState);
      const plain = stripAnsi(output);

      for (let i = 1; i <= 15; i++) {
        const stepName = mockStateManager.STEP_NAMES[i];
        assert.ok(plain.includes(stepName), `Missing step: ${stepName}`);
      }
    });

    it('shows step descriptions', () => {
      const output = ui.progress(fixtures.earlyPlanningState);
      const plain = stripAnsi(output);

      assert.ok(plain.includes('Assess the problem'));
      assert.ok(plain.includes('Write failing tests'));
    });
  });

  describe('step status indicators', () => {
    it('shows completed steps with check mark', () => {
      const output = ui.progress(fixtures.implementationState);

      // Steps 1-8 are completed
      assert.ok(containsAnsi(output, ui.colors.green));
    });

    it('shows current step with arrow indicator', () => {
      const output = ui.progress(fixtures.earlyPlanningState);
      const plain = stripAnsi(output);

      // Current step (2) should have arrow
      assert.ok(output.includes('\u25b6') || plain.includes('>')); // Arrow or fallback
    });

    it('shows pending steps with circle indicator', () => {
      const output = ui.progress(fixtures.earlyPlanningState);

      assert.ok(containsAnsi(output, ui.colors.dim));
    });
  });

  describe('gate status', () => {
    it('shows Gates section', () => {
      const output = ui.progress(fixtures.earlyPlanningState);
      const plain = stripAnsi(output);

      assert.ok(plain.includes('Gates'));
      assert.ok(plain.includes('Gate 1 (after step 3)'));
      assert.ok(plain.includes('Gate 2 (after step 6)'));
    });

    it('shows correct gate status for early planning', () => {
      const output = ui.progress(fixtures.earlyPlanningState);
      const plain = stripAnsi(output);

      const pendingCount = (plain.match(/Pending/g) || []).length;
      assert.strictEqual(pendingCount, 2);
    });

    it('shows correct gate status when both passed', () => {
      const output = ui.progress(fixtures.bothGatesPassedState);
      const plain = stripAnsi(output);

      const passedCount = (plain.match(/Passed/g) || []).length;
      assert.strictEqual(passedCount, 2);
    });
  });
});

// ============================================================================
// Test: adminDashboard function
// ============================================================================

describe('adminDashboard', () => {
  const version = '5.0.0';

  describe('structure', () => {
    it('displays CTOC ADMIN header with version', () => {
      const output = ui.adminDashboard(fixtures.emptyKanban, fixtures.cleanGit, version);

      assert.ok(output.includes('CTOC ADMIN'));
      assert.ok(output.includes('v5.0.0'));
    });

    it('displays column headers', () => {
      const output = ui.adminDashboard(fixtures.emptyKanban, fixtures.cleanGit, version);

      assert.ok(output.includes('BACKLOG'));
      assert.ok(output.includes('FUNCTIONAL'));
      assert.ok(output.includes('TECHNICAL'));
      assert.ok(output.includes('READY'));
      assert.ok(output.includes('BUILDING'));
      assert.ok(output.includes('REVIEW'));
      assert.ok(output.includes('DONE'));
    });

    it('displays step ranges in headers', () => {
      const output = ui.adminDashboard(fixtures.emptyKanban, fixtures.cleanGit, version);

      assert.ok(output.includes('(draft)'));
      assert.ok(output.includes('(steps1-3)'));
      assert.ok(output.includes('(steps4-6)'));
      assert.ok(output.includes('(7-14)'));
      assert.ok(output.includes('[HUMAN]'));
    });

    it('uses box drawing characters', () => {
      const output = ui.adminDashboard(fixtures.emptyKanban, fixtures.cleanGit, version);

      assert.ok(output.includes('\u2554')); // Top-left corner
      assert.ok(output.includes('\u2550')); // Horizontal line
      assert.ok(output.includes('\u2502')); // Vertical line
    });
  });

  describe('kanban counts', () => {
    it('displays all zero counts correctly', () => {
      const output = ui.adminDashboard(fixtures.emptyKanban, fixtures.cleanGit, version);

      // Should have ( 0) formatted entries
      assert.ok(output.includes('( 0)'));
    });

    it('displays non-zero counts correctly', () => {
      const output = ui.adminDashboard(fixtures.activeKanban, fixtures.cleanGit, version);

      assert.ok(output.includes('( 5)')); // backlog
      assert.ok(output.includes('( 2)')); // functional
      assert.ok(output.includes('( 3)')); // technical
      assert.ok(output.includes('( 1)')); // ready
      assert.ok(output.includes('( 4)')); // building
      assert.ok(output.includes('(10)')); // done
    });

    it('calculates total correctly', () => {
      const output = ui.adminDashboard(fixtures.activeKanban, fixtures.cleanGit, version);

      assert.ok(output.includes('27 items')); // 5+2+3+1+4+2+10 = 27
    });
  });

  describe('git status', () => {
    it('displays clean git status', () => {
      const output = ui.adminDashboard(fixtures.emptyKanban, fixtures.cleanGit, version);

      assert.ok(output.includes('0 modified'));
      assert.ok(output.includes('0 untracked'));
    });

    it('displays dirty git status', () => {
      const output = ui.adminDashboard(fixtures.emptyKanban, fixtures.dirtyGit, version);

      assert.ok(output.includes('3 modified'));
      assert.ok(output.includes('5 untracked'));
    });
  });

  describe('actions menu', () => {
    it('displays action keys', () => {
      const output = ui.adminDashboard(fixtures.emptyKanban, fixtures.cleanGit, version);

      assert.ok(output.includes('[N] New feature'));
      assert.ok(output.includes('[R#] Review item'));
      assert.ok(output.includes('[V#] View item'));
      assert.ok(output.includes('[C] Commit'));
      assert.ok(output.includes('[P] Push'));
      assert.ok(output.includes('[Q] Queue status'));
    });
  });

  describe('version padding', () => {
    it('pads short version correctly', () => {
      const output = ui.adminDashboard(fixtures.emptyKanban, fixtures.cleanGit, '1.0');

      assert.ok(output.includes('v1.0    ')); // 7 chars total
    });

    it('handles long version', () => {
      const output = ui.adminDashboard(fixtures.emptyKanban, fixtures.cleanGit, '10.20.30');

      assert.ok(output.includes('v10.20.30'));
    });
  });
});

// ============================================================================
// Test: doctor function
// ============================================================================

describe('doctor', () => {
  const version = '5.0.0';

  describe('structure', () => {
    it('displays CTOC Doctor header', () => {
      const output = ui.doctor(fixtures.healthyChecks, version);
      const plain = stripAnsi(output);

      assert.ok(plain.includes('CTOC Doctor'));
      assert.ok(plain.includes('Health Check'));
    });

    it('displays completion message', () => {
      const output = ui.doctor(fixtures.healthyChecks, version);
      const plain = stripAnsi(output);

      assert.ok(plain.includes('Doctor check complete'));
    });
  });

  describe('section rendering', () => {
    it('displays section names in brackets', () => {
      const output = ui.doctor(fixtures.healthyChecks, version);
      const plain = stripAnsi(output);

      assert.ok(plain.includes('[Environment]'));
      assert.ok(plain.includes('[Configuration]'));
    });

    it('displays all check items', () => {
      const output = ui.doctor(fixtures.healthyChecks, version);
      const plain = stripAnsi(output);

      assert.ok(plain.includes('Node.js version 20+'));
      assert.ok(plain.includes('Git installed'));
      assert.ok(plain.includes('CLAUDE.md exists'));
      assert.ok(plain.includes('Settings valid'));
    });
  });

  describe('status indicators', () => {
    it('shows green check for passing items', () => {
      const output = ui.doctor(fixtures.healthyChecks, version);

      assert.ok(containsAnsi(output, ui.colors.green));
    });

    it('shows red X for failing items', () => {
      const output = ui.doctor(fixtures.mixedChecks, version);

      assert.ok(containsAnsi(output, ui.colors.red));
    });

    it('shows yellow warning for warn items', () => {
      const output = ui.doctor(fixtures.mixedChecks, version);

      assert.ok(containsAnsi(output, ui.colors.yellow));
    });
  });

  describe('empty checks', () => {
    it('handles empty sections array', () => {
      const output = ui.doctor([], version);
      const plain = stripAnsi(output);

      assert.ok(plain.includes('CTOC Doctor'));
      assert.ok(plain.includes('Doctor check complete'));
    });

    it('handles section with no items', () => {
      const emptySection = [{ name: 'Empty', items: [] }];
      const output = ui.doctor(emptySection, version);
      const plain = stripAnsi(output);

      assert.ok(plain.includes('[Empty]'));
    });
  });
});

// ============================================================================
// Test: blocked function
// ============================================================================

describe('blocked', () => {
  describe('structure', () => {
    it('displays CTOC IRON LOOP BLOCKED header', () => {
      const output = ui.blocked('Test reason', fixtures.earlyPlanningState, 'Edit');
      const plain = stripAnsi(output);

      assert.ok(plain.includes('CTOC IRON LOOP'));
      assert.ok(plain.includes('BLOCKED'));
    });

    it('displays the tool name', () => {
      const output = ui.blocked('Test reason', fixtures.earlyPlanningState, 'Write');
      const plain = stripAnsi(output);

      assert.ok(plain.includes('Write BLOCKED'));
    });

    it('includes decorative separators', () => {
      const output = ui.blocked('Test reason', fixtures.earlyPlanningState, 'Edit');

      assert.ok(output.includes('='.repeat(70)));
    });
  });

  describe('state display', () => {
    it('shows feature name', () => {
      const output = ui.blocked('Test reason', fixtures.earlyPlanningState, 'Edit');
      const plain = stripAnsi(output);

      assert.ok(plain.includes('Feature: Add user authentication'));
    });

    it('shows current step number and name', () => {
      const output = ui.blocked('Test reason', fixtures.earlyPlanningState, 'Edit');
      const plain = stripAnsi(output);

      assert.ok(plain.includes('Current Step: 2'));
      assert.ok(plain.includes('ALIGN'));
    });

    it('shows required step is 7', () => {
      const output = ui.blocked('Test reason', fixtures.earlyPlanningState, 'Edit');
      const plain = stripAnsi(output);

      assert.ok(plain.includes('Required Step: 7 (TEST)'));
    });

    it('handles null state gracefully', () => {
      const output = ui.blocked('Test reason', null, 'Edit');
      const plain = stripAnsi(output);

      assert.ok(plain.includes('Feature: No feature'));
      assert.ok(plain.includes('Current Step: 1'));
    });

    it('handles undefined currentStep gracefully', () => {
      const output = ui.blocked('Test reason', { feature: 'Test' }, 'Edit');
      const plain = stripAnsi(output);

      assert.ok(plain.includes('Current Step: 1'));
    });
  });

  describe('reason display', () => {
    it('displays the blocking reason', () => {
      const reason = 'Cannot edit files before completing planning phase';
      const output = ui.blocked(reason, fixtures.earlyPlanningState, 'Edit');
      const plain = stripAnsi(output);

      assert.ok(plain.includes('REASON:'));
      assert.ok(plain.includes(reason));
    });
  });

  describe('messaging', () => {
    it('displays Iron Loop message', () => {
      const output = ui.blocked('Test reason', fixtures.earlyPlanningState, 'Edit');
      const plain = stripAnsi(output);

      assert.ok(plain.includes('THE IRON LOOP IS HOLY'));
      assert.ok(plain.includes('IT CANNOT BE BYPASSED'));
    });

    it('displays steps to proceed', () => {
      const output = ui.blocked('Test reason', fixtures.earlyPlanningState, 'Edit');
      const plain = stripAnsi(output);

      assert.ok(plain.includes('TO PROCEED:'));
      assert.ok(plain.includes('Complete planning steps 1-3'));
      assert.ok(plain.includes('Get user approval at Gate 1'));
      assert.ok(plain.includes('Complete planning steps 4-6'));
      assert.ok(plain.includes('Get user approval at Gate 2'));
      assert.ok(plain.includes('Edit/Write operations are allowed'));
    });
  });

  describe('color usage', () => {
    it('uses red for blocked header', () => {
      const output = ui.blocked('Test reason', fixtures.earlyPlanningState, 'Edit');

      assert.ok(containsAnsi(output, ui.colors.red));
    });

    it('uses yellow for reason label', () => {
      const output = ui.blocked('Test reason', fixtures.earlyPlanningState, 'Edit');

      assert.ok(containsAnsi(output, ui.colors.yellow));
    });

    it('uses cyan for Iron Loop message', () => {
      const output = ui.blocked('Test reason', fixtures.earlyPlanningState, 'Edit');

      assert.ok(containsAnsi(output, ui.colors.cyan));
    });
  });
});

// ============================================================================
// Test: writeToTerminal function
// ============================================================================

describe('writeToTerminal', () => {
  it('is a function', () => {
    assert.strictEqual(typeof ui.writeToTerminal, 'function');
  });

  // Note: Testing stderr.write would require mocking process.stderr
  // which is complex. We verify the function exists and is callable.
  it('does not throw when called', () => {
    assert.doesNotThrow(() => {
      // Temporarily redirect stderr to avoid test output noise
      const originalWrite = process.stderr.write;
      process.stderr.write = () => true;
      try {
        ui.writeToTerminal('test');
      } finally {
        process.stderr.write = originalWrite;
      }
    });
  });
});

// ============================================================================
// Test: module exports
// ============================================================================

describe('module exports', () => {
  it('exports all expected functions', () => {
    const expectedExports = [
      'colors',
      'dashboard',
      'progress',
      'adminDashboard',
      'doctor',
      'blocked',
      'writeToTerminal',
      'getPhase'
    ];

    for (const name of expectedExports) {
      assert.ok(name in ui, `Missing export: ${name}`);
    }
  });

  it('colors is an object', () => {
    assert.strictEqual(typeof ui.colors, 'object');
  });

  it('all functions are callable', () => {
    const functionNames = ['dashboard', 'progress', 'adminDashboard', 'doctor', 'blocked', 'writeToTerminal', 'getPhase'];

    for (const name of functionNames) {
      assert.strictEqual(typeof ui[name], 'function', `${name} should be a function`);
    }
  });
});
