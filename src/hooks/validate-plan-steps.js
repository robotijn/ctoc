#!/usr/bin/env node
/**
 * CTOC Plan Step Label Validator Hook
 *
 * Pre-execution hook that validates Iron Loop step labels before
 * a plan can be executed. Ensures all 9 mandatory step labels are
 * present in the correct order.
 *
 * Canonical order:
 * TEST -> PREPARE -> IMPLEMENT -> REVIEW -> OPTIMIZE -> SECURE -> VERIFY -> DOCUMENT -> FINAL-REVIEW
 *   8       9          10          11        12         13        14        15          16
 *
 * Exit codes:
 * - 0: Validation passed
 * - 1: Validation failed (blocking)
 */

const safeFs = require('../lib/safe-fs');
const { safeRegExp } = require('../lib/regex-utils');

/**
 * Canonical step labels - these are MANDATORY and must NOT be changed.
 */
const CANONICAL_LABELS = {
  8: 'TEST',
  9: 'PREPARE',
  10: 'IMPLEMENT',
  11: 'REVIEW',
  12: 'OPTIMIZE',
  13: 'SECURE',
  14: 'VERIFY',
  15: 'DOCUMENT',
  16: 'FINAL-REVIEW'
};

/**
 * Known wrong labels that are commonly used by mistake.
 */
const WRONG_LABEL_MAP = {
  'QUALITY': { correctStep: null, message: 'QUALITY is not a valid step label. Step 9 should be PREPARE, Step 14 should be VERIFY.' },
  'SETUP': { correctStep: 9, message: 'SETUP should be PREPARE (Step 9).' },
  'COMMIT': { correctStep: null, message: 'COMMIT is not a valid step label. Step 16 should be FINAL-REVIEW.' },
  'CODE': { correctStep: null, message: 'CODE is not a valid step label. Step 10 should be IMPLEMENT.' },
  'CHECK': { correctStep: null, message: 'CHECK is not a valid step label. Use VERIFY (Step 14) or REVIEW (Step 11).' },
  'TESTING': { correctStep: null, message: 'TESTING is not a valid step label. Step 8 should be TEST.' }
};

/**
 * Validate step labels in a plan file.
 *
 * @param {string} planPath - Path to the plan file
 * @returns {Object} Validation result with valid flag, errors, and warnings
 */
function validatePlanStepLabels(planPath) {
  if (!safeFs.existsSync(planPath)) {
    return { valid: false, errors: [`Plan file not found: ${planPath}`], warnings: [] };
  }

  const content = safeFs.readFileSync(planPath, 'utf8');
  const errors = [];
  const warnings = [];

  // Strip fenced code blocks (``` … ``` and ~~~ … ~~~) BEFORE any label match, and
  // scope detection to the "## Execution Plan" region when present. This mirrors
  // the wired, non-vulnerable src/lib/plan-validator.js (validateStepLabels +
  // extractStepBlocks): a step label living ONLY inside a fenced example, a prose
  // line, or a markdown-table row must NOT satisfy a mandatory step. Without this,
  // a plan whose REAL heading is wrong (e.g. "### Step 14: DEPLOY") but which also
  // contained the string "Step 14: VERIFY" in a fence/prose PASSED, and a meta-plan
  // that merely tabulated the labels PASSED with zero real steps. Legacy plans
  // without an Execution Plan section fall back to the whole (fence-stripped) body
  // (as validateEscalations does), and matching is still anchored to REAL
  // "### Step N:" headings — a table row or prose mention never starts with `#`.
  const scanContent = content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '');
  const execMatch = scanContent.match(/^##\s+Execution Plan[\s\S]*$/m);
  const region = execMatch ? execMatch[0].split(/\n##\s+(?!#)/)[0] : scanContent;

  // Collect REAL step headings ("## … #### Step N: …") in the region, keyed by
  // step number. Only a heading LINE can satisfy a step.
  const headingsByNum = new Map();
  const headingLineRe = safeRegExp('^#{2,4}[ \\t]*Step[ \\t]*(\\d+)\\b[^\\n]*', 'gim');
  let headingMatch;
  while ((headingMatch = headingLineRe.exec(region)) !== null) {
    const n = headingMatch[1];
    if (!headingsByNum.has(n)) headingsByNum.set(n, []);
    headingsByNum.get(n).push(headingMatch[0]);
  }

  // Check each canonical label against the REAL heading(s) for that step number.
  for (const [num, label] of Object.entries(CANONICAL_LABELS)) {
    const escapedLabel = label.replace('-', '[-\\s]');
    // Trailing (?![\w-]) is REQUIRED: without it "TEST" matches inside the known-
    // wrong label "TESTING" (and "REVIEW" inside "REVIEWS"), so a wrong label
    // would silently pass the step-label gate.
    const stepPattern = safeRegExp(`Step\\s*${num}[:\\s]+${escapedLabel}(?![\\w-])`, 'i');
    const stepHeadings = headingsByNum.get(num) || [];

    if (!stepHeadings.some((line) => stepPattern.test(line))) {
      // No real heading for this step carries the canonical label. If a heading
      // for this step exists but is mislabeled, extract the wrong label; if no
      // heading exists at all, it is missing.
      const anyLabelPattern = safeRegExp(`Step\\s*${num}[:\\s]+(\\w[\\w-]*)`, 'i');
      let wrongMatch = null;
      for (const line of stepHeadings) {
        wrongMatch = line.match(anyLabelPattern);
        if (wrongMatch) break;
      }

      if (wrongMatch) {
        const foundLabel = wrongMatch[1].toUpperCase();
        const knownWrong = WRONG_LABEL_MAP[foundLabel];

        if (knownWrong) {
          errors.push(`Step ${num}: Found "${foundLabel}" - ${knownWrong.message} Expected: "${label}"`);
        } else {
          errors.push(`Step ${num}: Found "${foundLabel}" but expected "${label}"`);
        }
      } else {
        errors.push(`Step ${num} (${label}) is missing from the plan`);
      }
    }
  }

  // Check for multiple IMPLEMENT steps — count REAL IMPLEMENT-labeled headings in
  // the (fence-stripped, region-scoped) content only, so a fenced/prose example
  // never inflates the count.
  const implementMatches = region.match(/^#{2,4}[ \t]*Step\s*\d+[:\s]+IMPLEMENT\b/gim) || [];
  if (implementMatches.length > 1) {
    errors.push(
      `Found ${implementMatches.length} IMPLEMENT steps. Only Step 10 should be IMPLEMENT. ` +
      `Merge all code changes as sub-items under a single Step 10: IMPLEMENT.`
    );
  }

  // Check Step 8 writes tests (not just identifies) — scoped to the region so a
  // fenced example cannot trip the TDD check.
  const step8Match = region.match(/Step\s*8[:\s]+TEST[^\n]*\n([\s\S]*?)(?=###\s*Step\s*9|$)/i);
  if (step8Match) {
    const step8Content = step8Match[1];
    if (/identify.*coverage|review.*pattern/i.test(step8Content) &&
        !/write.*test|create.*test/i.test(step8Content)) {
      errors.push('Step 8 (TEST) must WRITE tests first (TDD), not just identify existing coverage.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Auto-fix common step label issues in a plan file.
 *
 * @param {string} planPath - Path to the plan file
 * @returns {Object} Result with fixed flag, changes made, and any remaining errors
 */
function autoFixStepLabels(planPath) {
  if (!safeFs.existsSync(planPath)) {
    return { fixed: false, changes: [], errors: [`Plan file not found: ${planPath}`] };
  }

  let content = safeFs.readFileSync(planPath, 'utf8');
  const changes = [];

  // Fix QUALITY -> PREPARE at Step 9
  const qualityPattern = /(Step\s*9[:\s]+)QUALITY/gi;
  if (qualityPattern.test(content)) {
    content = content.replace(qualityPattern, '$1PREPARE');
    changes.push('Step 9: Renamed QUALITY to PREPARE');
  }

  // Fix SETUP -> PREPARE at Step 9
  const setupPattern = /(Step\s*9[:\s]+)SETUP/gi;
  if (setupPattern.test(content)) {
    content = content.replace(setupPattern, '$1PREPARE');
    changes.push('Step 9: Renamed SETUP to PREPARE');
  }

  // Fix DOCUMENT at Step 14 -> VERIFY (old order)
  const docAt14Pattern = /(Step\s*14[:\s]+)DOCUMENT/gi;
  if (docAt14Pattern.test(content)) {
    content = content.replace(docAt14Pattern, '$1VERIFY');
    changes.push('Step 14: Renamed DOCUMENT to VERIFY');
  }

  // Fix VERIFY at Step 15 -> DOCUMENT (old order)
  const verifyAt15Pattern = /(Step\s*15[:\s]+)VERIFY/gi;
  if (verifyAt15Pattern.test(content)) {
    content = content.replace(verifyAt15Pattern, '$1DOCUMENT');
    changes.push('Step 15: Renamed VERIFY to DOCUMENT');
  }

  // Fix COMMIT at Step 16 -> FINAL-REVIEW
  const commitPattern = /(Step\s*16[:\s]+)COMMIT/gi;
  if (commitPattern.test(content)) {
    content = content.replace(commitPattern, '$1FINAL-REVIEW');
    changes.push('Step 16: Renamed COMMIT to FINAL-REVIEW');
  }

  if (changes.length > 0) {
    safeFs.writeFileSync(planPath, content);
  }

  // Re-validate after fixes
  const validation = validatePlanStepLabels(planPath);

  return {
    fixed: changes.length > 0,
    changes,
    errors: validation.errors,
    valid: validation.valid
  };
}

// CLI entry point
if (require.main === module) {
  const planPath = process.argv[2];

  if (!planPath) {
    console.error('Usage: validate-plan-steps.js <plan-path>');
    process.exit(1);
  }

  const result = validatePlanStepLabels(planPath);

  if (result.valid) {
    console.log('Step label validation PASSED.');
    process.exit(0);
  } else {
    console.error('Step label validation FAILED:');
    result.errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }
}

module.exports = {
  validatePlanStepLabels,
  autoFixStepLabels,
  CANONICAL_LABELS,
  WRONG_LABEL_MAP
};
