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
    { num: 8, name: 'QUALITY', required: true },
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
    'in-progress->review': validateForReview,
    'todo->in-progress': validateForExecution,
    'implementation->todo': validateForQueue
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

module.exports = {
  validateForReview,
  validateForExecution,
  validateForQueue,
  validateTransition,
  formatValidationResult,
  ESCALATION_STATUSES
};
