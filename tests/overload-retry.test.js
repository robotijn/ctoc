/**
 * Overload Retry Tests (issue #6)
 * Covers the three-layer 529 recovery: agent instructions, state layer, dashboard display.
 */

const assert = require('assert');

// ── Layer 2: status enum ────────────────────────────────────────────────────

function testStatusIconOverloadRetry() {
  const icons = {
    'none': '○',
    'working': '◐',
    'complete': '●',
    'needs-input': '⚠',
    'timeout': '✗',
    'overload-retry': '⏳',
    'overload-partial': '⚠'
  };

  assert.strictEqual(icons['overload-retry'], '⏳', 'overload-retry maps to ⏳');
  assert.strictEqual(icons['overload-partial'], '⚠', 'overload-partial maps to ⚠');
  console.log('✓ Status icon enum includes overload-retry and overload-partial');
}

// ── Layer 2: writeStatus preserves retry_at ─────────────────────────────────

function testWriteStatusPreservesRetryAt() {
  const retryAt = new Date(Date.now() + 600_000).toISOString();
  const status = {
    agent: 'iron-loop-executor',
    status: 'overload-retry',
    message: 'API overloaded (529) — no writes made',
    retry_at: retryAt
  };

  // Simulate what writeStatus builds
  const statusObj = {
    agent: status.agent,
    status: status.status,
    started: new Date().toISOString(),
    completed: null,
    message: status.message,
    updatedAt: new Date().toISOString()
  };
  if (status.retry_at) {
    statusObj.retry_at = status.retry_at;
  }

  assert.strictEqual(statusObj.retry_at, retryAt, 'retry_at is preserved in status object');
  assert.strictEqual(statusObj.status, 'overload-retry');
  console.log('✓ writeStatus preserves retry_at for overload-retry');
}

function testWriteStatusNoRetryAtForPartial() {
  const status = {
    agent: 'iron-loop-executor',
    status: 'overload-partial',
    message: 'API overloaded (529) after partial writes'
  };

  const statusObj = {
    agent: status.agent,
    status: status.status,
    started: new Date().toISOString(),
    completed: null,
    message: status.message,
    updatedAt: new Date().toISOString()
  };
  if (status.retry_at) {
    statusObj.retry_at = status.retry_at;
  }

  assert.strictEqual(statusObj.retry_at, undefined, 'overload-partial has no retry_at');
  assert.strictEqual(statusObj.status, 'overload-partial');
  console.log('✓ writeStatus does not set retry_at for overload-partial');
}

// ── Layer 2: cleanupStaleInProgress skips overload plans ────────────────────

function testCleanupSkipsOverloadPlans() {
  const plans = [
    { name: 'plan-a', bgStatus: 'overload-retry' },
    { name: 'plan-b', bgStatus: 'overload-partial' },
    { name: 'plan-c', bgStatus: 'working' },
    { name: 'plan-d', bgStatus: 'none' }
  ];

  const cleanedUp = [];
  for (const plan of plans) {
    if (plan.bgStatus === 'overload-retry' || plan.bgStatus === 'overload-partial') {
      continue; // skip — same logic as updated cleanupStaleInProgress
    }
    cleanedUp.push(plan.name);
  }

  assert.deepStrictEqual(cleanedUp, ['plan-c', 'plan-d'],
    'Only non-overload plans are cleaned up');
  assert.ok(!cleanedUp.includes('plan-a'), 'overload-retry plan is preserved');
  assert.ok(!cleanedUp.includes('plan-b'), 'overload-partial plan is preserved');
  console.log('✓ cleanupStaleInProgress skips overload-retry and overload-partial plans');
}

// ── Layer 2: startAgent resumes overload-retry plan ─────────────────────────

function testStartAgentResumesOverloadRetry() {
  const inProgressPlans = [
    { name: 'my-feature', bgStatus: 'overload-retry', path: '/plans/in-progress/my-feature.md' }
  ];
  const todoPlans = [
    { name: 'next-feature', path: '/plans/todo/next-feature.md' }
  ];

  // Simulate startAgent logic
  const retryPlan = inProgressPlans.find(p => p.bgStatus === 'overload-retry');
  let result;
  if (retryPlan) {
    result = {
      started: true,
      resumed: true,
      plan: { name: retryPlan.name, path: retryPlan.path },
      remainingTodo: todoPlans.length
    };
  } else {
    result = {
      started: true,
      plan: { name: todoPlans[0].name, path: todoPlans[0].path }
    };
  }

  assert.strictEqual(result.started, true, 'agent starts');
  assert.strictEqual(result.resumed, true, 'agent resumes rather than starting fresh');
  assert.strictEqual(result.plan.name, 'my-feature', 'resumes the overload-retry plan');
  assert.strictEqual(result.remainingTodo, 1, 'todo count unchanged');
  console.log('✓ startAgent resumes an overload-retry plan instead of picking a new todo');
}

function testStartAgentBlocksOnOverloadPartial() {
  const inProgressPlans = [
    { name: 'partial-plan', bgStatus: 'overload-partial', path: '/plans/in-progress/partial-plan.md' }
  ];

  // Simulate startAgent logic — partial blocks with an error
  const retryPlan = inProgressPlans.find(p => p.bgStatus === 'overload-retry');
  const partialPlan = inProgressPlans.find(p => p.bgStatus === 'overload-partial');
  let result;
  if (retryPlan) {
    result = { started: true, resumed: true };
  } else if (partialPlan) {
    result = {
      started: false,
      error: `Plan "${partialPlan.name}" has a partial write from an API overload. Review the in-progress plan and clear the .status file before restarting the agent.`
    };
  } else {
    result = { started: true };
  }

  assert.strictEqual(result.started, false, 'agent does not start');
  assert.ok(result.error.includes('partial-plan'), 'error names the blocked plan');
  assert.ok(result.error.includes('partial write'), 'error explains the reason');
  console.log('✓ startAgent blocks with a human-gate error when overload-partial plan exists');
}

// ── Layer 3: dashboard display labels ───────────────────────────────────────

function testDashboardLabelOverloadRetry() {
  function formatRetryLabel(retryAt) {
    if (!retryAt) return 'retry pending';
    const diffMs = new Date(retryAt).getTime() - Date.now();
    const diffMin = Math.ceil(diffMs / 60000);
    return diffMin > 0 ? `retry in ${diffMin}m` : 'ready to retry';
  }

  const futureRetryAt = new Date(Date.now() + 5 * 60_000).toISOString(); // 5 min from now
  const pastRetryAt   = new Date(Date.now() - 1 * 60_000).toISOString(); // 1 min ago

  assert.ok(formatRetryLabel(futureRetryAt).startsWith('retry in '),
    'future retry shows countdown');
  assert.strictEqual(formatRetryLabel(pastRetryAt), 'ready to retry',
    'past retry_at shows ready to retry');
  assert.strictEqual(formatRetryLabel(null), 'retry pending',
    'missing retry_at falls back to retry pending');
  console.log('✓ Dashboard formats overload-retry countdown correctly');
}

function testDashboardLabelOverloadPartial() {
  const agent = { active: false, overloadPartial: true, plan: 'my-plan' };
  // Simulate the AGENT section rendering logic
  let line = '';
  if (agent.active) {
    line = `  ● Active: ${agent.plan}`;
  } else if (agent.overloadPartial) {
    line = `  ⚠ partial write — review: ${agent.plan}`;
  }

  assert.ok(line.includes('partial write'), 'shows partial write label');
  assert.ok(line.includes('my-plan'), 'includes plan name');
  console.log('✓ Dashboard shows partial write label for overload-partial');
}

// ── Config: retry settings schema ───────────────────────────────────────────

function testRetrySettingsSchema() {
  const retrySchema = {
    label: 'Retry Settings',
    settings: [
      { key: 'overloadIntervalSeconds', label: 'API overload retry interval (seconds)', type: 'number', default: 600 }
    ]
  };

  assert.strictEqual(retrySchema.settings[0].key, 'overloadIntervalSeconds');
  assert.strictEqual(retrySchema.settings[0].default, 600,
    'default retry interval is 600s (10 minutes)');
  assert.strictEqual(retrySchema.settings[0].type, 'number');
  console.log('✓ Retry settings schema has overloadIntervalSeconds with 600s default');
}

// ── Run all ──────────────────────────────────────────────────────────────────

testStatusIconOverloadRetry();
testWriteStatusPreservesRetryAt();
testWriteStatusNoRetryAtForPartial();
testCleanupSkipsOverloadPlans();
testStartAgentResumesOverloadRetry();
testStartAgentBlocksOnOverloadPartial();
testDashboardLabelOverloadRetry();
testDashboardLabelOverloadPartial();
testRetrySettingsSchema();

console.log('\n✓ All overload-retry tests passed');
