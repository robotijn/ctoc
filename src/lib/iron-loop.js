/**
 * Iron Loop Automation
 * Orchestrates the Integrator + Critic refinement loop for plan execution steps.
 */

const safeFs = require('./safe-fs');
const { safeRegExp } = require('./regex-utils');

/**
 * The one sentence this module is entitled to say about plan quality.
 *
 * Nothing here evaluates a plan. Saying so out loud, in the verdict and in the plan
 * file, is the whole deliverable of this module's honesty repair.
 * @type {string}
 */
const NO_EVALUATION_WARNING =
  'NOT EVALUATED — no automated critique was performed on this plan.';

/**
 * Generate execution steps (8-16) for a plan.
 * Reads plan content and returns markdown string with detailed execution steps.
 *
 * @param {string} planPath - Path to the plan file
 * @returns {string} Markdown string with Steps 8-16
 */
function integrate(planPath) {
  if (!safeFs.existsSync(planPath)) {
    throw new Error(`Plan file not found: ${planPath}`);
  }

  const content = safeFs.readFileSync(planPath, 'utf8');

  // Extract requirements and proposed solution sections
  const requirementsMatch = content.match(/## Requirements\n([\s\S]*?)(?=##|$)/);
  const solutionMatch = content.match(/## Proposed Solution\n([\s\S]*?)(?=##|$)/);
  const implementationMatch = content.match(/## Implementation Plan\n([\s\S]*?)(?=##|$)/);

  const requirements = requirementsMatch ? requirementsMatch[1].trim() : '';
  const solution = solutionMatch ? solutionMatch[1].trim() : '';
  const implementation = implementationMatch ? implementationMatch[1].trim() : '';

  // Generate execution steps based on plan content
  const executionPlan = generateExecutionPlan(requirements, solution, implementation);

  return executionPlan;
}

/**
 * Generate execution plan markdown from plan sections.
 *
 * @param {string} requirements - Plan requirements text
 * @param {string} solution - Proposed solution text
 * @param {string} implementation - Implementation plan text
 * @returns {string} Markdown execution plan
 */
function generateExecutionPlan(requirements, solution, implementation) {
  // Extract action items from requirements (checkbox items)
  const reqItems = extractCheckboxItems(requirements);
  const implItems = extractActionItems(implementation);

  // Build execution steps markdown
  let md = `

---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
`;

  // Add test items based on requirements
  if (reqItems.length > 0) {
    reqItems.forEach((item, i) => {
      md += `- [ ] Test: ${item.replace(/^-?\s*\[.\]\s*/, '').trim()}\n`;
    });
  } else {
    md += `- [ ] Write tests for the implementation\n`;
  }
  md += `- [ ] Test error conditions\n`;
  md += `- [ ] Run tests - expect RED (failing)\n`;

  md += `
### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
`;

  // Add implementation items
  if (implItems.length > 0) {
    implItems.forEach(item => {
      md += `- [ ] ${item}\n`;
    });
  } else {
    md += `- [ ] Implement the feature according to requirements\n`;
  }
  md += `- [ ] Add error handling\n`;
  md += `- [ ] Wire up integration points\n`;

  md += `
### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review
`;

  return md;
}

/**
 * Extract checkbox items from markdown text.
 *
 * @param {string} text - Markdown text
 * @returns {string[]} Array of checkbox item texts
 */
function extractCheckboxItems(text) {
  const matches = text.match(/- \[.\][^\n]+/g) || [];
  return matches;
}

/**
 * Extract action items from implementation section.
 *
 * @param {string} text - Implementation plan text
 * @returns {string[]} Array of action item texts
 */
function extractActionItems(text) {
  const items = [];
  const lines = text.split('\n');

  for (const line of lines) {
    // Match: "- Create/Add/Modify/Update ..." pattern
    const match = line.match(/^-\s+(Create|Add|Modify|Update|Implement|Write)[^\n]+/i);
    if (match) {
      items.push(match[0].replace(/^-\s+/, ''));
    }
  }

  return items;
}

/**
 * Report on a plan's execution section — WITHOUT scoring it.
 *
 * This function does NOT evaluate plan quality and does not pretend to. The five
 * 1-to-5 dimension scores it used to return were computed by grepping the
 * boilerplate template that `generateExecutionPlan` had just appended to the same
 * file, so `security: 5` meant "the template contains the word sanitize", not "this
 * plan is secure" — and every plan received the same five numbers. The clarity score
 * was even DOCKED a point because the template's own fallback line ("Implement the
 * feature according to requirements") matched the critic's own vague-language
 * pattern: the critic penalised the plan for a sentence the critic wrote. A verdict
 * computed from input the function itself produced is a verdict on nothing.
 *
 * What IS returned is the structural fact the caller can act on: which canonical
 * Step 8-16 labels are present, which are present with the wrong label, and whether
 * more than one IMPLEMENT step exists. Those are checkable properties of the file.
 * Quality is not assessed; `evaluated` is false and `stub` is true, mirroring
 * src/lib/comparator-agent.js — an unwired judge marks its own return a stub and
 * carries a warning to its runner rather than faking a result.
 *
 * @param {string} planPath - Path to the plan file
 * @returns {{evaluated: false, stub: true, scores: null, feedback: Array,
 *   structural: {hasExecutionPlan: boolean, missingSteps: number[],
 *     mislabeledSteps: number[], implementStepCount: number},
 *   warning: string}} An honest not-evaluated report
 */
function critique(planPath) {
  if (!safeFs.existsSync(planPath)) {
    throw new Error(`Plan file not found: ${planPath}`);
  }

  const content = safeFs.readFileSync(planPath, 'utf8');

  // Check for execution plan section. When it is absent the structural analysis
  // runs over an empty section, which honestly reports every step as missing — the
  // old code returned all-ones here, a numeric verdict on input it never read.
  const hasExecutionPlan = content.includes('## Execution Plan (Steps 8-16)');
  const execMatch = hasExecutionPlan
    ? content.match(/## Execution Plan \(Steps 8-16\)([\s\S]*?)(?=\n## [^E]|$)/)
    : null;
  const execPlan = execMatch ? execMatch[1] : '';

  return {
    evaluated: false,
    stub: true,
    scores: null,
    feedback: [],
    structural: { hasExecutionPlan, ...analyzeStepStructure(execPlan) },
    warning: NO_EVALUATION_WARNING
  };
}

/**
 * Canonical Iron Loop step labels. A step present under any other label is
 * MISLABELED — a checkable fact about the file, never a quality judgement.
 * @type {Object<number, string>}
 */
const CANONICAL_STEP_LABELS = {
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
 * Report the structural facts of an execution section.
 *
 * This is the label-matching logic that used to live inside `scoreCompleteness`,
 * kept because it was the one honest thing that function did — and returned as
 * lists of step numbers rather than collapsed into a number nobody can audit.
 *
 * @param {string} execPlan - The extracted Steps 8-16 section (may be empty)
 * @returns {{missingSteps: number[], mislabeledSteps: number[],
 *   implementStepCount: number}} Facts about the section, no judgement
 */
function analyzeStepStructure(execPlan) {
  const missingSteps = [];
  const mislabeledSteps = [];

  for (const [num, label] of Object.entries(CANONICAL_STEP_LABELS)) {
    const stepNumber = Number(num);
    const escapedLabel = label.replace('-', '[-\\s]');
    // The trailing \b is load-bearing. Without it `REVIEW` matched `REVIEWING` as a
    // prefix, so a mislabeled step was reported as canonical — an instrument
    // reporting a label it never actually checked. Inherited from the deleted
    // scoreCompleteness and fixed here rather than carried forward.
    const labelPattern = safeRegExp(`Step\\s*${num}[:\\s]+${escapedLabel}\\b`, 'i');
    const stepPresent = safeRegExp(`Step\\s*${num}[:\\s]`, 'i');

    if (!labelPattern.test(execPlan)) {
      if (stepPresent.test(execPlan)) {
        mislabeledSteps.push(stepNumber);
      } else {
        missingSteps.push(stepNumber);
      }
    }
  }

  // \b again: `IMPLEMENTATION` is not an IMPLEMENT step.
  const implementMatches = execPlan.match(/Step\s*\d+[:\s]+IMPLEMENT\b/gi) || [];

  return { missingSteps, mislabeledSteps, implementStepCount: implementMatches.length };
}

/**
 * Append the Steps 8-16 execution section to a plan, and report — honestly — that
 * NO quality evaluation was performed.
 *
 * There is no loop. There never was one that could do anything: the content was read
 * once, the append was guarded by a presence check, and nothing changed between
 * rounds, so ten rounds scored identical bytes identically. `maxRounds` is accepted
 * for signature compatibility and is IGNORED; `rounds` is always 1 and `evaluated`
 * is always false.
 *
 * APPROVES NOTHING, and now GRADES nothing either. The single terminal status is
 * `not-evaluated`. The former `score-passed` and `max-rounds` statuses are gone: no
 * consumer may keep reading a status that asserted a grade this module never earned.
 * Approvals remain human, recorded in the approval ledger and checked at the gates.
 *
 * @param {string} planPath - Path to the plan file
 * @param {number} [maxRounds] - Accepted and IGNORED (no iteration is performed)
 * @returns {{status: 'not-evaluated', evaluated: false, stub: true, rounds: 1,
 *   scores: null, structural: Object, warning: string,
 *   deferredQuestions: Array<{dimension: string, feedback: string}>}} Honest verdict
 */
function refineLoop(planPath, maxRounds = 10) {
  if (!safeFs.existsSync(planPath)) {
    throw new Error(`Plan file not found: ${planPath}`);
  }

  const content = safeFs.readFileSync(planPath, 'utf8');

  // The one piece of real work: append the execution section when it is absent.
  // Guarded, so running twice leaves exactly one section.
  if (!content.includes('## Execution Plan (Steps 8-16)')) {
    safeFs.writeFileSync(planPath, content + integrate(planPath));
  }

  const report = critique(planPath);

  let feedback = NO_EVALUATION_WARNING +
    ' The refinement loop appended the Steps 8-16 template and assessed nothing.' +
    ' (The scores this step used to report were computed from that same template,' +
    ' not from the plan.) A human or a real critic must review this plan before it' +
    ' is built.';

  // Structural findings ARE real findings about the file, so they are surfaced —
  // as integers only, never interpolated file content.
  const { missingSteps, mislabeledSteps } = report.structural;
  if (missingSteps.length > 0) {
    feedback += ` Structural fact: no Step ${missingSteps.join(', ')} found.`;
  }
  if (mislabeledSteps.length > 0) {
    feedback += ` Structural fact: Step ${mislabeledSteps.join(', ')} present under a non-canonical label.`;
  }

  return {
    status: 'not-evaluated',
    evaluated: false,
    stub: true,
    rounds: 1,
    scores: null,
    structural: report.structural,
    warning: NO_EVALUATION_WARNING,
    deferredQuestions: [{ dimension: 'evaluation', feedback }]
  };
}

/**
 * Append deferred questions to the plan file, naming where they came from.
 *
 * The provenance line is the point: an entry under this heading used to read as a
 * question someone derived from the plan, when it was a fixed literal emitted for
 * any score below 5. Every entry written here now originates from the honest
 * not-evaluated verdict above.
 *
 * @param {string} planPath - Path to the plan file
 * @param {Array<{dimension: string, feedback: string}>} deferredQuestions - Questions to defer
 */
function appendDeferredQuestions(planPath, deferredQuestions) {
  if (!deferredQuestions || deferredQuestions.length === 0) return;

  const content = safeFs.readFileSync(planPath, 'utf8');

  const questionsSection = `

## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

${deferredQuestions.map(q => `- **${q.dimension}**: ${q.feedback}`).join('\n')}
`;

  safeFs.writeFileSync(planPath, content + questionsSection);
}

module.exports = {
  integrate,
  critique,
  refineLoop,
  appendDeferredQuestions,
  generateExecutionPlan,
  extractCheckboxItems,
  extractActionItems
};
