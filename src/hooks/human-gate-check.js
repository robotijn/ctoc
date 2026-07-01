#!/usr/bin/env node
/**
 * Human Gate Checker - Pre-tool hook
 * Runs before EVERY tool call to detect human gate violations
 *
 * Human gates (require approval marker):
 *   functional → implementation
 *   implementation → todo
 *   review → done
 */

const path = require('path');

const safeFs = require('../lib/safe-fs');

const PLANS_DIR = path.join(process.cwd(), 'plans');
const LOG_DIR = path.join(process.cwd(), '.ctoc', 'logs');
const VIOLATIONS_FILE = path.join(LOG_DIR, 'gate-violations.json');

// Human gates: destination folder → source folder (for revert)
const HUMAN_GATES = {
  'implementation': 'functional',
  'todo': 'implementation',
  'done': 'review'
};

function ensureDir(dir) {
  if (!safeFs.existsSync(dir)) {
    safeFs.mkdirSync(dir, { recursive: true });
  }
}

function loadViolations() {
  try {
    if (safeFs.existsSync(VIOLATIONS_FILE)) {
      return JSON.parse(safeFs.readFileSync(VIOLATIONS_FILE, 'utf8'));
    }
  } catch { /* ignore: best-effort, non-fatal */ }
  return [];
}

function saveViolations(violations) {
  ensureDir(LOG_DIR);
  safeFs.writeFileSync(VIOLATIONS_FILE, JSON.stringify(violations, null, 2));
}

function logViolation(entry) {
  const violations = loadViolations();
  violations.push(entry);
  // Keep last 100 entries
  if (violations.length > 100) {
    violations.splice(0, violations.length - 100);
  }
  saveViolations(violations);
}

function hasApprovalMarker(filePath) {
  try {
    const content = safeFs.readFileSync(filePath, 'utf8');
    // Approval MUST come from the YAML frontmatter block, never from arbitrary
    // body text. A substring search (the old behaviour) let any plan forge a
    // gate crossing by writing "approved_by: human" in a code fence, prose, or
    // a commented-out / rejected line — and rejected a genuine approval whose
    // value had non-canonical spacing. Parse the frontmatter and require an
    // `approved_by` key whose value trims to exactly "human".
    const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) return false;
    for (const line of fm[1].split(/\r?\n/)) {
      const m = line.match(/^\s*approved_by\s*:\s*(.+?)\s*$/);
      if (m) {
        const value = m[1].replace(/^["']|["']$/g, '').trim();
        if (value === 'human') return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function checkFolder(folderName) {
  const folderPath = path.join(PLANS_DIR, folderName);
  if (!safeFs.existsSync(folderPath)) return [];

  const violations = [];
  const files = safeFs.readdirSync(folderPath).filter(f => f.endsWith('.md'));

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    if (!hasApprovalMarker(filePath)) {
      violations.push({
        file,
        path: filePath,
        folder: folderName,
        revertTo: HUMAN_GATES[folderName]
      });
    }
  }

  return violations;
}

function revertPlan(violation) {
  const destDir = path.join(PLANS_DIR, violation.revertTo);
  const destPath = path.join(destDir, path.basename(violation.path));

  // Read content and add violation note
  let content = safeFs.readFileSync(violation.path, 'utf8');
  const note = `\n\n---\n**⚠️ HUMAN GATE VIOLATION**\nThis plan was moved to ${violation.folder}/ without human approval.\nAutomatically reverted to ${violation.revertTo}/ at ${new Date().toISOString()}\n---\n`;
  content += note;

  // Move file
  ensureDir(destDir);
  safeFs.writeFileSync(destPath, content);
  safeFs.unlinkSync(violation.path);

  return destPath;
}

function main() {
  try {
    // Check all human gate destinations
    const allViolations = [];

    for (const folder of Object.keys(HUMAN_GATES)) {
      const violations = checkFolder(folder);
      allViolations.push(...violations);
    }

    if (allViolations.length > 0) {
      console.error('\n⛔ HUMAN GATE VIOLATION DETECTED\n');

      for (const v of allViolations) {
        console.error(`  Plan: ${v.file}`);
        console.error(`  Location: ${v.folder}/`);
        console.error(`  Issue: Missing human approval marker`);

        // Log violation with status tracking
        logViolation({
          id: `v-${Date.now()}`,
          timestamp: new Date().toISOString(),
          plan: v.file,
          violation: `Moved to ${v.folder}/ without approval`,
          action: `REVERTED to ${v.revertTo}/`,
          status: 'pending_reapproval',
          resolvedAt: null
        });

        // Revert to previous stage
        revertPlan(v);
        console.error(`  Action: REVERTED to ${v.revertTo}/`);
        console.error('');
      }

      console.error('⚠️  Plans must be approved by human via menu to cross human gates\n');
    }
  } catch (err) {
    // Fail open - log error but don't block user
    console.error(`Warning: Gate check error: ${err.message}`);
  }

  // Exit 0 to allow tool call to proceed
  process.exit(0);
}

main();
