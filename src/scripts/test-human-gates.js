#!/usr/bin/env node
/**
 * Test Human Gates - Verifies the hook works correctly
 */

const safeFs = require('../lib/safe-fs');
const path = require('path');
const { execSync } = require('child_process');

const PLANS_DIR = path.join(process.cwd(), 'plans');
const TEST_PLAN = 'test-gate-violation.md';

function ensureDir(dir) {
  if (!safeFs.existsSync(dir)) {
    safeFs.mkdirSync(dir, { recursive: true });
  }
}

function cleanup(filePath) {
  try { safeFs.unlinkSync(filePath); } catch { /* ignore: best-effort, non-fatal */ }
}

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    return false;
  }
}

function main() {
  console.log('Testing Human Gate Enforcement\n');
  let passed = 0;
  let failed = 0;

  // Ensure test directories exist
  ensureDir(path.join(PLANS_DIR, 'done'));
  ensureDir(path.join(PLANS_DIR, 'review'));
  ensureDir(path.join(PLANS_DIR, 'todo'));
  ensureDir(path.join(PLANS_DIR, 'implementation'));
  ensureDir(path.join(PLANS_DIR, 'functional'));

  // Test 1: Plan in done/ without marker gets reverted to review/
  if (test('Plan without marker in done/ → reverts to review/', () => {
    const donePath = path.join(PLANS_DIR, 'done', TEST_PLAN);
    const reviewPath = path.join(PLANS_DIR, 'review', TEST_PLAN);

    cleanup(donePath);
    cleanup(reviewPath);

    safeFs.writeFileSync(donePath, '# Test Plan\nNo approval marker');
    execSync('node hooks/human-gate-check.js', { stdio: 'pipe' });

    if (safeFs.existsSync(donePath)) throw new Error('Plan not removed from done/');
    if (!safeFs.existsSync(reviewPath)) throw new Error('Plan not in review/');

    cleanup(reviewPath);
  })) passed++; else failed++;

  // Test 2: Plan with marker stays in done/
  if (test('Plan WITH marker in done/ → stays in done/', () => {
    const donePath = path.join(PLANS_DIR, 'done', TEST_PLAN);

    cleanup(donePath);

    safeFs.writeFileSync(donePath, '---\napproved_by: human\n---\n# Test Plan');
    execSync('node hooks/human-gate-check.js', { stdio: 'pipe' });

    if (!safeFs.existsSync(donePath)) throw new Error('Plan incorrectly removed');

    cleanup(donePath);
  })) passed++; else failed++;

  // Test 3: Plan in todo/ without marker gets reverted to implementation/
  if (test('Plan without marker in todo/ → reverts to implementation/', () => {
    const todoPath = path.join(PLANS_DIR, 'todo', TEST_PLAN);
    const implPath = path.join(PLANS_DIR, 'implementation', TEST_PLAN);

    cleanup(todoPath);
    cleanup(implPath);

    safeFs.writeFileSync(todoPath, '# Test Plan\nNo approval marker');
    execSync('node hooks/human-gate-check.js', { stdio: 'pipe' });

    if (safeFs.existsSync(todoPath)) throw new Error('Plan not removed from todo/');
    if (!safeFs.existsSync(implPath)) throw new Error('Plan not in implementation/');

    cleanup(implPath);
  })) passed++; else failed++;

  // Test 4: Plan in implementation/ without marker gets reverted to functional/
  if (test('Plan without marker in implementation/ → reverts to functional/', () => {
    const implPath = path.join(PLANS_DIR, 'implementation', TEST_PLAN);
    const funcPath = path.join(PLANS_DIR, 'functional', TEST_PLAN);

    cleanup(implPath);
    cleanup(funcPath);

    safeFs.writeFileSync(implPath, '# Test Plan\nNo approval marker');
    execSync('node hooks/human-gate-check.js', { stdio: 'pipe' });

    if (safeFs.existsSync(implPath)) throw new Error('Plan not removed from implementation/');
    if (!safeFs.existsSync(funcPath)) throw new Error('Plan not in functional/');

    cleanup(funcPath);
  })) passed++; else failed++;

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
