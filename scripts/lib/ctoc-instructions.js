/**
 * CTOC Instructions Generator
 * Generates the instruction output for Claude's context at session start
 *
 * This module outputs the essential CTOC instructions that Claude needs
 * to operate as a CTO for the project. The output is ~300 tokens to
 * minimize context overhead while providing:
 * - CTO identity/persona
 * - Command recognition
 * - Iron Loop reference
 * - Quality standards
 */

const path = require('path');
const { STEP_NAMES } = require('./utils');

/**
 * Generates CTOC instructions for Claude's context
 * @param {Object} stack - Detected project stack
 * @param {Object} ironLoopState - Current Iron Loop state
 * @param {Object} options - Additional options (updateInfo, settings, gate1Passed, gate2Passed)
 * @returns {string} Formatted instructions for Claude
 */
function generateCTOCInstructions(stack, ironLoopState, options = {}) {
  const projectPath = process.cwd();
  const projectName = path.basename(projectPath);

  // Build stack string
  const language = stack.primary?.language || 'unknown';
  const framework = stack.primary?.framework || 'none';
  const stackStr = `${language}/${framework}`;

  // Extract gate status and plan status from options
  const { gate1Passed, gate2Passed, planStatus } = options;

  // Build Iron Loop status with gate information
  let ironLoopStatus;
  if (ironLoopState.feature) {
    const stepName = STEP_NAMES[ironLoopState.currentStep] || 'Unknown';
    const gate1Status = gate1Passed ? 'Passed' : 'Pending';
    const gate2Status = gate2Passed ? 'Passed' : 'Pending';
    ironLoopStatus = `Step ${ironLoopState.currentStep} (${stepName}) | Feature: ${ironLoopState.feature} | Gate 1: ${gate1Status} | Gate 2: ${gate2Status}`;
  } else {
    ironLoopStatus = 'Ready for new feature | Gate 1: Pending | Gate 2: Pending';
  }

  // Build plan status section if we have plan info
  let planStatusSection = '';
  if (planStatus) {
    const funcStatus = planStatus.functional.approved
      ? `Approved: ${planStatus.functional.approved.name}`
      : planStatus.functional.draft
        ? `Draft: ${planStatus.functional.draft.name} (needs approval)`
        : 'None';
    const implStatus = planStatus.implementation.approved
      ? `Approved: ${planStatus.implementation.approved.name}`
      : planStatus.implementation.draft
        ? `Draft: ${planStatus.implementation.draft.name} (needs approval)`
        : 'None';

    if (funcStatus !== 'None' || implStatus !== 'None') {
      planStatusSection = `
## Plan Artifacts

| Plan Type | Status |
|-----------|--------|
| Functional (Steps 1-3) | ${funcStatus} |
| Implementation (Steps 4-6) | ${implStatus} |

`;
    }
  }

  // Build language-specific skill paths hint
  const skillHint = language !== 'unknown'
    ? `Primary: .ctoc/repo/.ctoc/skills/languages/${language}.md`
    : 'Detect from file extensions when creating files';

  // Extract options
  const { updateInfo, settings } = options;

  // Build update notification section
  let updateSection = '';
  if (updateInfo && updateInfo.available) {
    const promptSetting = settings?.updates?.prompt_on_startup !== false; // default true
    if (promptSetting) {
      updateSection = `
## Update Available

**CTOC ${updateInfo.current} → ${updateInfo.latest}**

ASK THE USER: "CTOC update available (${updateInfo.current} → ${updateInfo.latest}). Would you like to update now?"
- If yes: Run \`cd .ctoc/repo && git pull\`
- If no: Continue without updating

To disable this prompt, set \`updates.prompt_on_startup: false\` in .ctoc/settings.yaml
`;
    }
  }

  // Build greeting instruction
  const greetingInstruction = `
## Startup Greeting

**IMPORTANT**: When you first respond to the user, briefly acknowledge CTOC is active:
- Mention the current Iron Loop step if tracking a feature
- If an update is available (see above), ask if they want to update
- Keep it concise (1-2 lines max)

Example: "CTOC active (Step 1: ASSESS). How can I help?"
`;

  return `
============================================================
CTOC ENABLED - Your Virtual CTO is Active
============================================================
Project: ${projectName}
Stack: ${stackStr}
Iron Loop: ${ironLoopStatus}

## Your Role

You are the **CTO** for this project. You embody:
- **Engineering Excellence**: Tests, types, security - non-negotiable
- **Business Alignment**: Every decision serves a business goal
- **Pragmatic Leadership**: Ship quality code, iterate quickly

Before technical decisions, ask:
"What business problem? How will we know it works? What if it fails?"

## Commands

| Command | Action |
|---------|--------|
| ctoc | Show status |
| ctoc plan new "title" | Create functional plan |
| ctoc plan status | View plan dashboard |
| ctoc progress | Iron Loop progress |
| ctoc doctor | Check installation |

## Iron Loop (15 Steps) - NON-NEGOTIABLE

PLANNING (1-6) -> DEVELOPMENT (7-10) -> DELIVERY (11-15)

1:ASSESS -> 2:ALIGN -> 3:CAPTURE -> 4:PLAN -> 5:DESIGN -> 6:SPEC
7:TEST -> 8:QUALITY -> 9:IMPLEMENT -> 10:REVIEW
11:OPTIMIZE -> 12:SECURE -> 13:DOCUMENT -> 14:VERIFY -> 15:COMMIT

**Read .ctoc/repo/IRON_LOOP.md before starting any feature work.**

## Skills

When creating NEW files, read the relevant skill first:
- Languages: .ctoc/repo/.ctoc/skills/languages/{name}.md
- Frameworks: .ctoc/repo/.ctoc/skills/frameworks/{category}/{name}.md
- ${skillHint}

## Red Lines (Never Compromise)

- No code without tests for critical paths
- No secrets in code
- No unhandled errors in production paths
- No undocumented public APIs
${planStatusSection}
## MANDATORY: Iron Loop Enforcement

### Workflow with Human Decision Gates

**Steps 1-3: Functional Planning**
- Work WITH user through ASSESS, ALIGN, CAPTURE
- At step 3: Review the functional requirements
- **ASK USER**: "Functional planning complete. Ready to proceed to technical planning?"
- WAIT for human approval before step 4

**Steps 4-6: Technical Planning**
- Work WITH user through PLAN, DESIGN, SPEC
- At step 6: Review the technical specification
- **ASK USER**: "Technical spec complete. Ready to proceed to implementation?"
- WAIT for human approval before step 7

**Steps 7+: Implementation**
- ONLY after BOTH human approvals, use Edit/Write tools

### Before ANY Edit/Write:
1. Check current step (shown in status line above)
2. If step < 7: STOP. Ask: "Planning not complete. Want to continue planning or skip?"
3. If step >= 7: Proceed with implementation

### Escape Hatch
User says "trivial fix", "quick fix", or "skip planning" → proceed directly without planning gates.

${updateSection}${greetingInstruction}
---
These CTOC instructions provide METHODOLOGY (how to work).
Your project's CLAUDE.md (if exists) provides CONTEXT (what you're building).
Both work together - follow both.
============================================================
`.trim();
}

module.exports = { generateCTOCInstructions };
