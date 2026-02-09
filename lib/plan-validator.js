/**
 * Plan Validator
 * Enforces validation gates before plans can move between stages.
 * Addresses: executor autonomy issues, missing validation, instruction adherence.
 */

const fs = require('fs');
const path = require('path');
const { parseMetadata } = require('./state');
const { findProjectRoot } = require('./project-root');

/**
 * Validation result structure
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {string[]} errors - Blocking errors (must fix)
 * @property {string[]} warnings - Non-blocking warnings
 * @property {Object} checklist - Checklist items with status
 */

/**
 * Step status that requires escalation
 */
const ESCALATION_STATUSES = ['SKIPPED', 'BLOCKED', 'DEFERRED'];

/**
 * Validate a plan before it can move to review stage
 *
 * @param {string} planPath - Path to the plan file
 * @param {string} projectPath - Project root path
 * @returns {ValidationResult}
 */
function validateForReview(planPath, projectPath) {
  projectPath = projectPath || findProjectRoot();

  const content = fs.readFileSync(planPath, 'utf8');
  const metadata = parseMetadata(content);

  const result = {
    valid: true,
    errors: [],
    warnings: [],
    checklist: {}
  };

  // 1. Check all required steps are addressed
  const stepValidation = validateStepsComplete(content, planPath, projectPath);
  if (stepValidation.errors.length > 0) {
    result.errors.push(...stepValidation.errors);
    result.valid = false;
  }
  result.warnings.push(...stepValidation.warnings);
  result.checklist.steps = stepValidation.checklist;

  // 2. Check for unescalated skip/block statuses
  const escalationValidation = validateEscalations(content, metadata);
  if (escalationValidation.errors.length > 0) {
    result.errors.push(...escalationValidation.errors);
    result.valid = false;
  }
  result.warnings.push(...escalationValidation.warnings);
  result.checklist.escalations = escalationValidation.checklist;

  // 3. Check acceptance criteria are marked
  const criteriaValidation = validateAcceptanceCriteria(content);
  if (criteriaValidation.errors.length > 0) {
    result.errors.push(...criteriaValidation.errors);
    result.valid = false;
  }
  result.warnings.push(...criteriaValidation.warnings);
  result.checklist.criteria = criteriaValidation.checklist;

  // 4. Check for contradictions (e.g., script referenced but doesn't exist)
  const contradictionValidation = validateNoContradictions(content, projectPath);
  if (contradictionValidation.errors.length > 0) {
    result.errors.push(...contradictionValidation.errors);
    result.valid = false;
  }
  result.warnings.push(...contradictionValidation.warnings);
  result.checklist.contradictions = contradictionValidation.checklist;

  // 5. Check user instruction adherence
  const instructionValidation = validateInstructionAdherence(content, metadata);
  if (instructionValidation.errors.length > 0) {
    result.errors.push(...instructionValidation.errors);
    result.valid = false;
  }
  result.warnings.push(...instructionValidation.warnings);
  result.checklist.instructions = instructionValidation.checklist;

  return result;
}

/**
 * Check that all Iron Loop steps 7-15 are addressed
 */
function validateStepsComplete(content, planPath, projectPath) {
  const result = { errors: [], warnings: [], checklist: {} };

  const requiredSteps = [
    { num: 7, name: 'TEST', required: true },
    { num: 8, name: 'PREPARE', required: true },
    { num: 9, name: 'IMPLEMENT', required: true },
    { num: 10, name: 'REVIEW', required: true },
    { num: 11, name: 'OPTIMIZE', required: false },
    { num: 12, name: 'SECURE', required: true },
    { num: 13, name: 'VERIFY', required: true },
    { num: 14, name: 'DOCUMENT', required: false },
    { num: 15, name: 'FINAL-REVIEW', required: true }
  ];

  for (const step of requiredSteps) {
    const stepPattern = new RegExp(`Step\\s*${step.num}[:\\s]*${step.name}`, 'i');
    const hasStep = stepPattern.test(content);

    // Check for completion markers
    const completedPattern = new RegExp(`Step\\s*${step.num}.*(?:COMPLETE|DONE|✓|\\[x\\])`, 'i');
    const skippedPattern = new RegExp(`Step\\s*${step.num}.*(?:SKIP|N\\/A|NOT APPLICABLE)`, 'i');

    const isCompleted = completedPattern.test(content);
    const isSkipped = skippedPattern.test(content);

    result.checklist[`step_${step.num}`] = {
      name: step.name,
      present: hasStep,
      completed: isCompleted,
      skipped: isSkipped,
      required: step.required
    };

    if (step.required && !hasStep && !isSkipped) {
      result.errors.push(`Step ${step.num} (${step.name}) is required but not addressed`);
    }

    if (step.required && isSkipped) {
      result.warnings.push(`Step ${step.num} (${step.name}) was skipped - requires escalation approval`);
    }
  }

  return result;
}

/**
 * Check that skipped/blocked steps have proper escalation
 */
function validateEscalations(content, metadata) {
  const result = { errors: [], warnings: [], checklist: {} };

  // Look for SKIPPED/BLOCKED without approval
  for (const status of ESCALATION_STATUSES) {
    const pattern = new RegExp(`(Step\\s*\\d+[^\\n]*${status})`, 'gi');
    const matches = content.match(pattern) || [];

    for (const match of matches) {
      const stepMatch = match.match(/Step\s*(\d+)/i);
      const stepNum = stepMatch ? stepMatch[1] : 'unknown';

      // Check if there's an approval/justification nearby
      const approvalPattern = new RegExp(`Step\\s*${stepNum}[^\\n]*${status}[^\\n]*(?:APPROVED|JUSTIFIED|REASON:|ESCALATED)`, 'i');
      const hasApproval = approvalPattern.test(content);

      result.checklist[`escalation_${stepNum}_${status}`] = {
        step: stepNum,
        status: status,
        approved: hasApproval
      };

      if (!hasApproval) {
        result.errors.push(
          `Step ${stepNum} marked as ${status} without escalation approval. ` +
          `Add "REASON: <justification>" or get CTO-Chief approval.`
        );
      }
    }
  }

  // Check metadata for unapproved skips
  if (metadata.skipped_steps && !metadata.skips_approved) {
    result.errors.push(
      `Plan has skipped steps (${metadata.skipped_steps}) without approval in metadata. ` +
      `Add "skips_approved: true" after CTO-Chief review.`
    );
  }

  return result;
}

/**
 * Check that acceptance criteria are addressed
 */
function validateAcceptanceCriteria(content) {
  const result = { errors: [], warnings: [], checklist: {} };

  // Find acceptance criteria section
  const criteriaSection = content.match(/(?:acceptance criteria|definition of done|requirements)[:\s]*\n([\s\S]*?)(?=\n##|\n---|\Z)/i);

  if (!criteriaSection) {
    result.warnings.push('No explicit acceptance criteria section found');
    return result;
  }

  const criteriaContent = criteriaSection[1];

  // Count checkboxes
  const totalBoxes = (criteriaContent.match(/\[[ x]\]/g) || []).length;
  const checkedBoxes = (criteriaContent.match(/\[x\]/gi) || []).length;
  const uncheckedBoxes = totalBoxes - checkedBoxes;

  result.checklist.criteria = {
    total: totalBoxes,
    checked: checkedBoxes,
    unchecked: uncheckedBoxes
  };

  if (totalBoxes > 0 && uncheckedBoxes > 0) {
    result.errors.push(
      `${uncheckedBoxes} of ${totalBoxes} acceptance criteria not checked. ` +
      `All criteria must be met before review.`
    );
  }

  if (totalBoxes === 0) {
    result.warnings.push('No checkbox-style acceptance criteria found');
  }

  return result;
}

/**
 * Check for contradictions between plan and actual code/files
 */
function validateNoContradictions(content, projectPath) {
  const result = { errors: [], warnings: [], checklist: {} };

  // Pattern 1: File referenced as "created" but doesn't exist
  const createdFilePattern = /(?:created?|added?|new file)[:\s]*[`"]?([^\s`"]+\.[a-z]+)[`"]?/gi;
  let match;

  while ((match = createdFilePattern.exec(content)) !== null) {
    const filePath = match[1];
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(projectPath, filePath);

    const exists = fs.existsSync(fullPath);
    result.checklist[`file_${filePath}`] = { claimed: 'created', exists };

    if (!exists) {
      result.errors.push(
        `File "${filePath}" claimed as created but doesn't exist. ` +
        `Create the file or remove the claim.`
      );
    }
  }

  // Pattern 2: Script referenced but doesn't exist
  const scriptPattern = /(?:run|execute|script)[:\s]*[`"]?([^\s`"]+\.(?:sh|js|py|ts))[`"]?/gi;

  while ((match = scriptPattern.exec(content)) !== null) {
    const scriptPath = match[1];
    const fullPath = path.isAbsolute(scriptPath)
      ? scriptPath
      : path.join(projectPath, scriptPath);

    // Only check if it looks like a local path (not a command)
    if (!scriptPath.includes('/') && !scriptPath.startsWith('.')) {
      continue;
    }

    const exists = fs.existsSync(fullPath);
    result.checklist[`script_${scriptPath}`] = { referenced: true, exists };

    if (!exists) {
      result.warnings.push(
        `Script "${scriptPath}" referenced but not found. ` +
        `Ensure the script exists or update the reference.`
      );
    }
  }

  // Pattern 3: "SKIPPED" but implementation exists
  const skippedStepPattern = /Step\s*(\d+)[^\\n]*SKIP/gi;

  while ((match = skippedStepPattern.exec(content)) !== null) {
    const stepNum = match[1];

    // Check if there are actually files for this step
    // (e.g., if step 7 TEST is skipped but test files exist)
    if (stepNum === '7') {
      const hasTests = checkForTestFiles(projectPath);
      if (hasTests) {
        result.warnings.push(
          `Step 7 (TEST) marked as skipped but test files exist. ` +
          `Verify the skip is intentional or update the step status.`
        );
      }
    }
  }

  return result;
}

/**
 * Check if test files exist in the project
 */
function checkForTestFiles(projectPath) {
  const testPatterns = [
    'tests',
    '__tests__',
    'spec',
    '*.test.js',
    '*.spec.ts'
  ];

  for (const pattern of testPatterns) {
    const testPath = path.join(projectPath, pattern);
    if (fs.existsSync(testPath)) {
      return true;
    }
  }

  return false;
}

/**
 * Check that user instructions were followed
 */
function validateInstructionAdherence(content, metadata) {
  const result = { errors: [], warnings: [], checklist: {} };

  // Look for user instructions in the plan
  const instructionPatterns = [
    { pattern: /user said[:\s]*["']([^"']+)["']/gi, label: 'user_said' },
    { pattern: /user requested?[:\s]*["']([^"']+)["']/gi, label: 'user_requested' },
    { pattern: /requirement[:\s]*["']([^"']+)["']/gi, label: 'requirement' }
  ];

  for (const { pattern, label } of instructionPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const instruction = match[1].toLowerCase();

      // Check for common contradictions
      if (instruction.includes('cli') || instruction.includes('command line')) {
        // User said CLI, check if manual/GUI was used instead
        const usedManual = /manual|gui|interface|web/i.test(content);
        if (usedManual) {
          result.warnings.push(
            `User requested CLI approach but implementation mentions manual/GUI access. ` +
            `Verify the implementation matches user requirements.`
          );
        }
      }

      if (instruction.includes('automated') || instruction.includes('automatic')) {
        const usedManual = /manual|by hand|manually/i.test(content);
        if (usedManual) {
          result.warnings.push(
            `User requested automated approach but implementation mentions manual steps. ` +
            `Verify the implementation is truly automated.`
          );
        }
      }

      result.checklist[`instruction_${label}`] = {
        instruction: instruction.slice(0, 100),
        checked: true
      };
    }
  }

  return result;
}

/**
 * Validate plan before moving from functional to implementation
 */
function validateFunctionalToImpl(planPath, projectPath) {
  const content = fs.readFileSync(planPath, 'utf8');

  const result = {
    valid: true,
    errors: [],
    warnings: [],
    checklist: {}
  };

  // Must have problem statement
  const hasProblem = /problem\s*statement/i.test(content) || /## Problem/i.test(content);
  result.checklist.problemStatement = hasProblem;
  if (!hasProblem) {
    result.errors.push('Missing problem statement');
    result.valid = false;
  }

  // Must have acceptance criteria or success criteria
  const hasCriteria = /acceptance\s*criteria/i.test(content) || /success\s*criteria/i.test(content);
  result.checklist.acceptanceCriteria = hasCriteria;
  if (!hasCriteria) {
    result.errors.push('Missing acceptance criteria or success criteria');
    result.valid = false;
  }

  // Must have scope
  const hasScope = /## Scope/i.test(content) || /### In Scope/i.test(content) || /\bscope\b/i.test(content);
  result.checklist.scope = hasScope;
  if (!hasScope) {
    result.warnings.push('Missing scope definition');
  }

  return result;
}

/**
 * Validate plan before moving from review to done
 */
function validateReviewToDone(planPath, projectPath) {
  const content = fs.readFileSync(planPath, 'utf8');
  const metadata = parseMetadata(content);

  const result = {
    valid: true,
    errors: [],
    warnings: [],
    checklist: {}
  };

  // Should be human-reviewed (has approval marker or metadata)
  const hasApproval = /approved_by:\s*human/i.test(content) || metadata.approved_by === 'human';
  result.checklist.humanReviewed = hasApproval;
  // Note: human gate enforcement is in actions.js, this is informational
  if (!hasApproval) {
    result.warnings.push('No previous human approval marker found');
  }

  // No unresolved feedback
  const hasUnresolved = /unresolved/i.test(content) || /\bTODO\b/.test(content) || /\bFIXME\b/.test(content);
  result.checklist.noUnresolved = !hasUnresolved;
  if (hasUnresolved) {
    result.warnings.push('Plan may contain unresolved feedback (TODO/FIXME markers found)');
  }

  return result;
}

/**
 * Validate plan can move from one stage to another
 *
 * @param {string} planPath - Path to plan file
 * @param {string} fromStage - Current stage
 * @param {string} toStage - Target stage
 * @param {string} projectPath - Project root
 * @returns {ValidationResult}
 */
function validateTransition(planPath, fromStage, toStage, projectPath) {
  projectPath = projectPath || findProjectRoot();

  const result = {
    valid: true,
    errors: [],
    warnings: [],
    checklist: {}
  };

  // Transitions that require validation
  const validatedTransitions = {
    'functional->implementation': validateFunctionalToImpl,
    'implementation->todo': validateForQueue,
    'todo->in-progress': validateForExecution,
    'in-progress->review': validateForReview,
    'review->done': validateReviewToDone
  };

  const key = `${fromStage}->${toStage}`;
  const validator = validatedTransitions[key];

  if (validator) {
    return validator(planPath, projectPath);
  }

  return result;
}

/**
 * Validate plan before execution starts
 */
function validateForExecution(planPath, projectPath) {
  const content = fs.readFileSync(planPath, 'utf8');
  const metadata = parseMetadata(content);

  const result = {
    valid: true,
    errors: [],
    warnings: [],
    checklist: {}
  };

  // Must have iron_loop marker
  if (!metadata.iron_loop) {
    result.errors.push('Plan missing Iron Loop execution steps (Steps 7-15)');
    result.valid = false;
  }

  // Should have clear scope
  if (!content.includes('Scope') && !content.includes('scope')) {
    result.warnings.push('Plan missing explicit scope definition');
  }

  // Validate step labels are correct (BLOCKING)
  const labelValidation = validateStepLabels(content);
  if (!labelValidation.valid) {
    result.errors.push(...labelValidation.errors);
    result.valid = false;
  }
  result.warnings.push(...labelValidation.warnings);
  result.checklist.stepLabels = labelValidation.checklist;

  return result;
}

/**
 * Validate plan before adding to queue
 */
function validateForQueue(planPath, projectPath) {
  const content = fs.readFileSync(planPath, 'utf8');
  const metadata = parseMetadata(content);

  const result = {
    valid: true,
    errors: [],
    warnings: [],
    checklist: {}
  };

  // Must have technical approach
  if (!content.includes('Technical') && !content.includes('Implementation')) {
    result.warnings.push('Plan missing technical approach section');
  }

  // Check for basic structure
  const hasTitle = content.match(/^#\s+\S/m);
  if (!hasTitle) {
    result.errors.push('Plan missing title (# heading)');
    result.valid = false;
  }

  return result;
}

/**
 * Format validation result for display
 *
 * @param {ValidationResult} result
 * @returns {string}
 */
function formatValidationResult(result) {
  let output = '';

  if (result.valid) {
    output += '✓ Validation PASSED\n';
  } else {
    output += '✗ Validation FAILED\n';
  }

  if (result.errors.length > 0) {
    output += '\nBLOCKING ERRORS:\n';
    for (const error of result.errors) {
      output += `  ✗ ${error}\n`;
    }
  }

  if (result.warnings.length > 0) {
    output += '\nWARNINGS:\n';
    for (const warning of result.warnings) {
      output += `  ⚠ ${warning}\n`;
    }
  }

  return output;
}

/**
 * Canonical Iron Loop step labels (Steps 7-15).
 * These are MANDATORY and must appear in this exact order.
 */
const CANONICAL_STEP_LABELS = {
  7: 'TEST',
  8: 'PREPARE',
  9: 'IMPLEMENT',
  10: 'REVIEW',
  11: 'OPTIMIZE',
  12: 'SECURE',
  13: 'VERIFY',
  14: 'DOCUMENT',
  15: 'FINAL-REVIEW'
};

/**
 * Validate that a plan uses the correct Iron Loop step labels.
 *
 * Rules enforced:
 * 1. All 9 steps (7-15) must be present
 * 2. Labels must match the canonical set exactly
 * 3. Only ONE IMPLEMENT step (Step 9) - no duplicates
 * 4. Step 7 must include writing tests (not just "identify coverage")
 * 5. Step 13 must be automated VERIFY (not manual verification)
 * 6. Correct order: TEST -> PREPARE -> IMPLEMENT -> REVIEW -> OPTIMIZE -> SECURE -> VERIFY -> DOCUMENT -> FINAL-REVIEW
 *
 * @param {string} content - Plan file content
 * @returns {ValidationResult}
 */
function validateStepLabels(content) {
  const result = {
    valid: true,
    errors: [],
    warnings: [],
    checklist: {}
  };

  // 1. Check all 9 canonical labels are present
  for (const [num, label] of Object.entries(CANONICAL_STEP_LABELS)) {
    const stepPattern = new RegExp(`Step\\s*${num}[:\\s]+${label.replace('-', '[-\\s]')}`, 'i');
    const hasStep = stepPattern.test(content);

    result.checklist[`label_step_${num}`] = {
      expected: label,
      present: hasStep
    };

    if (!hasStep) {
      // Check for wrong label at this step number
      const anyLabelPattern = new RegExp(`Step\\s*${num}[:\\s]+(\\w[\\w-]*)`, 'i');
      const wrongLabel = content.match(anyLabelPattern);

      if (wrongLabel) {
        result.errors.push(
          `Step ${num} has wrong label "${wrongLabel[1]}" - must be "${label}"`
        );
      } else {
        result.errors.push(
          `Step ${num} (${label}) is missing from the plan`
        );
      }
      result.valid = false;
    }
  }

  // 2. Check for multiple IMPLEMENT steps (only Step 9 should be IMPLEMENT)
  const implementMatches = content.match(/Step\s*(\d+)[:\s]+IMPLEMENT/gi) || [];
  if (implementMatches.length > 1) {
    result.errors.push(
      `Found ${implementMatches.length} IMPLEMENT steps - only Step 9 should be IMPLEMENT. ` +
      `Merge all code changes as sub-items under Step 9.`
    );
    result.valid = false;
  }

  // 3. Check Step 7 actually writes tests (not just identifies coverage)
  const step7Section = extractStepSection(content, 7);
  if (step7Section) {
    const identifyOnly = /identify.*coverage|review.*test.*pattern|check.*existing/i.test(step7Section);
    const writesTests = /write.*test|create.*test|test.*function|test.*expect|TDD/i.test(step7Section);

    if (identifyOnly && !writesTests) {
      result.errors.push(
        'Step 7 (TEST) must WRITE tests, not just "identify coverage". ' +
        'This is TDD - tests are written BEFORE implementation.'
      );
      result.valid = false;
    }
  }

  // 4. Check Step 13 is automated VERIFY (not manual)
  const step13Section = extractStepSection(content, 13);
  if (step13Section) {
    const isManualOnly = /manual.*verification|manually.*check/i.test(step13Section) &&
                         !/run.*test|run.*lint|run.*type/i.test(step13Section);

    if (isManualOnly) {
      result.errors.push(
        'Step 13 (VERIFY) must run automated checks (lint, type check, tests). ' +
        'Manual verification belongs in Step 15 (FINAL-REVIEW).'
      );
      result.valid = false;
    }
  }

  return result;
}

/**
 * Extract the content of a specific step section from plan markdown.
 *
 * @param {string} content - Full plan content
 * @param {number} stepNum - Step number to extract
 * @returns {string|null} Step section content or null if not found
 */
function extractStepSection(content, stepNum) {
  const nextStep = stepNum + 1;
  const pattern = new RegExp(
    `Step\\s*${stepNum}[:\\s][^\\n]*\\n([\\s\\S]*?)(?=###\\s*Step\\s*${nextStep}|###\\s*Step\\s*\\d|## |$)`,
    'i'
  );
  const match = content.match(pattern);
  return match ? match[1] : null;
}

module.exports = {
  validateForReview,
  validateForExecution,
  validateForQueue,
  validateFunctionalToImpl,
  validateReviewToDone,
  validateTransition,
  validateStepLabels,
  formatValidationResult,
  ESCALATION_STATUSES,
  CANONICAL_STEP_LABELS
};
