/**
 * Plan Actions Tests
 */

const assert = require('assert');

// Test plan approval flow
function testApprovalFlow() {
  const flows = {
    'functional/draft': 'implementation/draft',
    'implementation/draft': 'todo',
    'review': 'done'
  };

  assert.strictEqual(flows['functional/draft'], 'implementation/draft');
  assert.strictEqual(flows['implementation/draft'], 'todo');
  assert.strictEqual(flows['review'], 'done');
  console.log('✓ Approval flow mapping');
}

// Test rejection flow
function testRejectionFlow() {
  const plan = {
    name: 'user-auth',
    content: '# User Auth\n\n## Goal\nImplement auth.',
    metadata: { status: 'review' }
  };

  const rejectionReason = 'JWT expiry not handled';
  const revision = (plan.metadata.revision || 0) + 1;

  // Create rejected plan
  const rejectedPlan = {
    name: plan.name,
    content: `# REVISION ${revision}\n\n## Rejection Reason\n${rejectionReason}\n\n---\n\n${plan.content}`,
    metadata: {
      status: 'draft',
      revision: revision,
      rejection_reason: rejectionReason,
      tag: 'rejected'
    },
    destination: 'functional/draft'
  };

  assert.strictEqual(rejectedPlan.metadata.revision, 1);
  assert.ok(rejectedPlan.content.includes('REVISION 1'));
  assert.ok(rejectedPlan.content.includes(rejectionReason));
  assert.strictEqual(rejectedPlan.destination, 'functional/draft');
  console.log('✓ Rejection flow');
}

// Test queue move operations
function testQueueMoveOperations() {
  let queue = ['a', 'b', 'c', 'd'];

  // Move up (index 2 -> 1)
  function moveUp(arr, index) {
    if (index <= 0) return arr;
    const newArr = [...arr];
    [newArr[index - 1], newArr[index]] = [newArr[index], newArr[index - 1]];
    return newArr;
  }

  // Move down (index 1 -> 2)
  function moveDown(arr, index) {
    if (index >= arr.length - 1) return arr;
    const newArr = [...arr];
    [newArr[index], newArr[index + 1]] = [newArr[index + 1], newArr[index]];
    return newArr;
  }

  queue = moveUp(queue, 2);
  assert.deepStrictEqual(queue, ['a', 'c', 'b', 'd'], 'Move up works');

  queue = moveDown(queue, 0);
  assert.deepStrictEqual(queue, ['c', 'a', 'b', 'd'], 'Move down works');

  console.log('✓ Queue move operations');
}

// Test Iron Loop application
function testIronLoopApplication() {
  const plan = {
    content: '# My Plan\n\n## Goal\nDo something.',
    metadata: {}
  };

  const ironLoopSteps = [
    '### Step 7: TEST',
    '### Step 8: QUALITY',
    '### Step 9: IMPLEMENT',
    '### Step 10: REVIEW',
    '### Step 11: OPTIMIZE',
    '### Step 12: SECURE',
    '### Step 13: DOCUMENT',
    '### Step 14: VERIFY',
    '### Step 15: COMMIT'
  ];

  const withIronLoop = {
    content: plan.content + '\n\n---\n\n## Iron Loop Execution\n\n' + ironLoopSteps.join('\n\n- [ ] Todo\n\n'),
    metadata: { ...plan.metadata, iron_loop: true }
  };

  assert.strictEqual(withIronLoop.metadata.iron_loop, true);
  assert.ok(withIronLoop.content.includes('Step 7: TEST'));
  assert.ok(withIronLoop.content.includes('Step 15: COMMIT'));
  console.log('✓ Iron Loop application');
}

// Run tests
console.log('\nPlan Actions Tests\n');
testApprovalFlow();
testRejectionFlow();
testQueueMoveOperations();
testIronLoopApplication();
console.log('\nAll action tests passed!\n');
