#!/usr/bin/env node
/**
 * Move a plan between stages via CLI.
 * Used by executor agents (who can't call lib/actions.js directly from Bash).
 *
 * Usage: node scripts/move-plan.js <stage/file.md> <destination>
 * Example: node scripts/move-plan.js todo/my-plan.md in-progress
 *
 * Validates:
 * - Source file exists
 * - Destination is a valid stage
 * - Human gates cannot be crossed (functional->implementation,
 *   implementation->todo, review->done)
 * - Non-gate transitions are allowed freely
 */

const path = require('path');
const fs = require('fs');
const { movePlan } = require('../lib/actions');
const { findProjectRoot } = require('../lib/project-root');

const VALID_STAGES = ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];

const HUMAN_GATES = {
  functional: 'implementation',
  implementation: 'todo',
  review: 'done'
};

const args = process.argv.slice(2);
const ref = args[0];
const destination = args[1];

if (!ref || !destination) {
  console.error('Usage: node scripts/move-plan.js <stage/file.md> <destination>');
  process.exit(1);
}

// Validate destination
if (!VALID_STAGES.includes(destination)) {
  console.error(`Invalid destination: "${destination}". Valid stages: ${VALID_STAGES.join(', ')}`);
  process.exit(1);
}

// Parse source stage from ref
const slashIndex = ref.indexOf('/');
if (slashIndex === -1) {
  console.error('Reference must be in format: stage/file.md');
  process.exit(1);
}

const sourceStage = ref.substring(0, slashIndex);

if (!VALID_STAGES.includes(sourceStage)) {
  console.error(`Invalid source stage: "${sourceStage}". Valid stages: ${VALID_STAGES.join(', ')}`);
  process.exit(1);
}

// Block human gate transitions
if (HUMAN_GATES[sourceStage] === destination) {
  console.error(`Human gate: ${sourceStage} -> ${destination} requires human approval via menu.`);
  process.exit(1);
}

const root = findProjectRoot();
const planPath = path.join(root, 'plans', ref);

// Check source file exists
if (!fs.existsSync(planPath)) {
  console.error(`Plan file not found: ${planPath}`);
  process.exit(1);
}

try {
  const newPath = movePlan(planPath, destination, root);
  console.log(`Moved ${ref} -> ${destination}/`);
} catch (err) {
  console.error(`Failed to move plan: ${err.message}`);
  process.exit(1);
}
