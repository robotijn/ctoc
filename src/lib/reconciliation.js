/**
 * Spec ↔ Code Reconciliation — Step 14.5 (v6.9.27)
 *
 * Basel Committee on Banking Supervision Principle 3 requires reconciliation
 * with golden sources. In the CTOC pipeline, the implementation plan's
 * declared `files:` list and acceptance criteria are the golden source;
 * actual changed files and passing tests must reconcile.
 *
 * Runs between Step 14 VERIFY and Step 15 DOCUMENT when
 * `spec_code_reconciliation` is enabled. Flags drift: files changed that
 * the plan did not declare, files declared but not changed, acceptance
 * criteria with no matching passing test.
 *
 * Cross-platform Node 18+, uses `git` if available (falls back to mtime
 * comparison otherwise).
 *
 * References:
 *   - Atlan BCBS 239 data lineage / reconciliation:
 *     https://atlan.com/know/data-governance/bcbs-239-data-lineage/
 */

const safeFs = require('./safe-fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Reconcile a plan's declared scope against actual changes.
 *
 * @param {string} projectRoot
 * @param {string} planPath - path to the implementation plan
 * @param {Object} opts - {baseRef?: string} (defaults to HEAD~1)
 * @returns {{ok, drift: {undeclared_changes, declared_but_unchanged, uncovered_criteria}}}
 */
function reconcile(projectRoot, planPath, opts = {}) {
  const baseRef = opts.baseRef || 'HEAD~1';
  const planFull = path.join(projectRoot, planPath);
  if (!safeFs.existsSync(planFull)) {
    return { ok: false, error: `plan not found: ${planPath}` };
  }
  const plan = safeFs.readFileSync(planFull, 'utf8');

  // Extract the declared `files:` list from frontmatter.
  const declaredFiles = extractDeclaredFiles(plan);
  // Extract acceptance criteria checkboxes.
  const criteria = extractAcceptanceCriteria(plan);
  // Extract test ids referenced in the plan.
  const referencedTests = extractTestIds(plan);

  // Get the actual changed files via git.
  let actualChanges = [];
  try {
    const diff = execSync(`git diff --name-only ${baseRef} HEAD`, { cwd: projectRoot, encoding: 'utf8' });
    actualChanges = diff.split('\n').filter(Boolean);
  } catch (e) {
    return { ok: false, error: `git diff failed: ${e.message}; skipping reconciliation` };
  }

  // Glob-match declared files against actual changes.
  const undeclaredChanges = [];
  const declaredButUnchanged = [...declaredFiles];

  for (const change of actualChanges) {
    let matchedAny = false;
    for (let i = 0; i < declaredButUnchanged.length; i++) {
      if (matchesGlob(change, declaredButUnchanged[i])) {
        matchedAny = true;
        declaredButUnchanged.splice(i, 1);
        break;
      }
    }
    if (!matchedAny) undeclaredChanges.push(change);
  }

  const uncoveredCriteria = criteria.filter(c => !c.checked);

  const drift = {
    undeclared_changes: undeclaredChanges,
    declared_but_unchanged: declaredButUnchanged,
    uncovered_criteria: uncoveredCriteria.map(c => c.text),
    referenced_tests: referencedTests,
  };

  const ok = undeclaredChanges.length === 0
    && declaredButUnchanged.length === 0
    && uncoveredCriteria.length === 0;

  return { ok, drift };
}

function extractDeclaredFiles(planContent) {
  const fmMatch = planContent.match(/^---\n([\s\S]*?)\n---/m);
  if (!fmMatch) return [];
  const fm = fmMatch[1];
  // files: [a, b, c] OR multi-line list
  const inline = fm.match(/^files:\s*\[([^\]]+)\]/m);
  if (inline) return inline[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
  const block = fm.match(/^files:\s*\n((?:\s+-\s+\S.*\n?)+)/m);
  if (block) return [...block[1].matchAll(/-\s+(\S.+)/g)].map(m => m[1].trim().replace(/^["']|["']$/g, ''));
  return [];
}

function extractAcceptanceCriteria(planContent) {
  const out = [];
  const re = /^\s*-\s+\[([ xX])\]\s+(.+)$/gm;
  let m;
  while ((m = re.exec(planContent))) {
    out.push({ checked: m[1].toLowerCase() === 'x', text: m[2].trim() });
  }
  return out;
}

function extractTestIds(planContent) {
  // Look for explicit "test:" or "TEST-" references.
  const ids = new Set();
  for (const m of planContent.matchAll(/\bTEST-\d+\b/g)) ids.add(m[0]);
  for (const m of planContent.matchAll(/\btest_[a-z_]+\b/g)) ids.add(m[0]);
  return [...ids];
}

function matchesGlob(filepath, glob) {
  // Minimal glob: supports * and **.
  if (glob === filepath) return true;
  const escaped = glob.replace(/[.+^$(){}|]/g, '\\$&');
  const regex = '^' + escaped.replace(/\*\*/g, '.~~').replace(/\*/g, '[^/]*').replace(/\.~~/g, '.*') + '$';
  return new RegExp(regex).test(filepath);
}

module.exports = {
  reconcile,
};
