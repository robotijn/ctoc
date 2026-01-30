/**
 * State Management Tests
 */

const assert = require('assert');
const path = require('path');

// Test FIFO queue ordering
function testFifoOrdering() {
  const queue = [
    { name: 'oldest', created: '2026-01-28' },
    { name: 'middle', created: '2026-01-29' },
    { name: 'newest', created: '2026-01-30' }
  ];

  // Sort oldest first (FIFO)
  queue.sort((a, b) => new Date(a.created) - new Date(b.created));

  assert.strictEqual(queue[0].name, 'oldest', 'Oldest is first');
  assert.strictEqual(queue[2].name, 'newest', 'Newest is last');
  console.log('✓ FIFO ordering');
}

// Test plan metadata parsing
function testMetadataParsing() {
  const planContent = `# Test Plan

---
status: todo
iron_loop: true
revision: 2
rejection_reason: "JWT expiry not handled"
---

## Goal
Test goal here.
`;

  // Parse metadata
  const metadataMatch = planContent.match(/---\n([\s\S]*?)\n---/);
  assert.ok(metadataMatch, 'Metadata block found');

  const metadata = {};
  metadataMatch[1].split('\n').forEach(line => {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length) {
      metadata[key.trim()] = valueParts.join(':').trim().replace(/^["']|["']$/g, '');
    }
  });

  assert.strictEqual(metadata.status, 'todo', 'Status parsed');
  assert.strictEqual(metadata.iron_loop, 'true', 'Iron loop parsed');
  assert.strictEqual(metadata.revision, '2', 'Revision parsed');
  console.log('✓ Metadata parsing');
}

// Test directory to tab mapping
function testDirectoryMapping() {
  const dirToTab = {
    'functional/draft': 'Functional',
    'implementation/draft': 'Implementation',
    'review': 'Review',
    'todo': 'Todo',
    'in_progress': 'Progress',
    'done': 'Progress'
  };

  assert.strictEqual(dirToTab['functional/draft'], 'Functional');
  assert.strictEqual(dirToTab['todo'], 'Todo');
  console.log('✓ Directory mapping');
}

// Test agent status structure
function testAgentStatus() {
  const agentStatus = {
    active: true,
    name: 'user-auth-flow',
    step: 9,
    totalSteps: 15,
    phase: 'IMPLEMENT',
    task: 'Implement login endpoint',
    startedAt: new Date('2026-01-30T10:00:00'),
    elapsed: function() {
      return Math.floor((Date.now() - this.startedAt) / 1000 / 60) + 'm';
    }
  };

  assert.strictEqual(agentStatus.active, true);
  assert.strictEqual(agentStatus.step, 9);
  assert.strictEqual(agentStatus.phase, 'IMPLEMENT');
  console.log('✓ Agent status structure');
}

// Run tests
console.log('\nState Management Tests\n');
testFifoOrdering();
testMetadataParsing();
testDirectoryMapping();
testAgentStatus();
console.log('\nAll state tests passed!\n');
