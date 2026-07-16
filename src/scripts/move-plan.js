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
 * - ANY gate-crossing move is blocked, including multi-hop moves that would skip
 *   over a gate (e.g. in-progress->done skips review->done, functional->todo skips
 *   both functional->implementation and implementation->todo). See gate-order.js.
 * - Backward (revert) moves and non-gate forward transitions are allowed freely
 */

const path = require('path');
const safeFs = require('../lib/safe-fs');
const { movePlan } = require('../lib/actions');
const { findProjectRoot } = require('../lib/project-root');
const { crossesHumanGate } = require('../lib/gate-order');

const VALID_STAGES = ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];

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

// Block ANY gate-crossing move — single-hop or multi-hop. crossesHumanGate returns
// true iff the move is forward and spans one or more of the three gate edges, so a
// skip-a-gate request like in-progress->done or functional->todo is blocked exactly
// as its adjacent-gate equivalent is.
if (crossesHumanGate(sourceStage, destination)) {
  console.error(`Human gate: ${sourceStage} -> ${destination} requires human approval via menu.`);
  process.exit(1);
}

const root = findProjectRoot();
const plansRoot = path.resolve(root, 'plans');
const planPath = path.join(root, 'plans', ref);

// Confine the source to the plans/ tree. The file part of `ref` is unvalidated,
// so a ref like "functional/../../outside.md" would otherwise resolve outside
// plans/ and let move-plan.js rename an arbitrary file into the pipeline.
const resolvedPlanPath = path.resolve(planPath);
if (resolvedPlanPath !== plansRoot && !resolvedPlanPath.startsWith(plansRoot + path.sep)) {
  console.error(`Refusing reference that escapes the plans/ directory: ${ref}`);
  process.exit(1);
}

// Check source file exists
if (!safeFs.existsSync(planPath)) {
  console.error(`Plan file not found: ${planPath}`);
  process.exit(1);
}

// Refuse to clobber a DIFFERENT same-basename plan already resident at the
// destination. movePlan does a bare renameSync, which atomically REPLACES the
// destination — silently destroying an existing plan (a stale revert copy, a
// re-created slug, a manually staged file). A plan slug lives in exactly one
// stage, so a collision here is always a bug; fail loudly rather than lose data.
// A same-stage move (destination === source stage) resolves to the same file and
// is a harmless no-op, so it is exempt.
const destPath = path.join(plansRoot, destination, path.basename(planPath));
if (safeFs.existsSync(destPath) && path.resolve(destPath) !== resolvedPlanPath) {
  console.error(`Refusing to overwrite existing plan at ${destination}/${path.basename(planPath)}`);
  process.exit(1);
}

try {
  movePlan(planPath, destination, root);
  console.log(`Moved ${ref} -> ${destination}/`);
} catch (err) {
  console.error(`Failed to move plan: ${err.message}`);
  process.exit(1);
}
