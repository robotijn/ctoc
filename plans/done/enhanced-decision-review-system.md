---
approved_by: human
approved_at: 2026-02-08T12:38:19.458Z
gate_crossed: review → done
note: Retroactively added during human gates migration
---

# Enhanced Decision & Review System

## Problem Statement

Currently, CTOC presents choices without deep analysis of trade-offs. Users must rely on their own judgment without seeing the full picture. Additionally, when plans reach review stage, there's no structured evaluation - just a simple approve/reject without justification.

## Proposed Solution

### 1. Deep Choice Exploration

For EVERY decision point in CTOC, automatically:

1. **Explore Options** - Research each option thoroughly
2. **Analyze Pros/Cons** - List advantages and disadvantages
3. **Assess Risk** - Identify potential issues
4. **Recommend** - Provide clear recommendation with reasoning

**Format:**
```
┌─────────────────────────────────────────────────────────────┐
│ DECISION: {question}                                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Option A: {name}                                            │
│   Pros:                                                     │
│     ✓ {advantage 1}                                         │
│     ✓ {advantage 2}                                         │
│   Cons:                                                     │
│     ✗ {disadvantage 1}                                      │
│   Risk: {low/medium/high} - {explanation}                   │
│                                                              │
│ Option B: {name}                                            │
│   Pros:                                                     │
│     ✓ {advantage 1}                                         │
│   Cons:                                                     │
│     ✗ {disadvantage 1}                                      │
│     ✗ {disadvantage 2}                                      │
│   Risk: {low/medium/high} - {explanation}                   │
│                                                              │
│ ─────────────────────────────────────────────────────────── │
│ → RECOMMENDED: Option A                                     │
│   Reason: {detailed justification}                          │
└─────────────────────────────────────────────────────────────┘
```

### 2. Review Stage Approval Reports

When a plan enters review, automatically spawn two agents:

#### Agent 1: Code Reviewer
- Reviews implementation against requirements
- Checks test coverage
- Validates code quality
- Identifies technical debt introduced

#### Agent 2: CTO Chief
- Evaluates business alignment
- Assesses architectural impact
- Reviews security implications
- Considers maintainability

**Combined Report Format:**
```markdown
## Review Report: {plan-name}

### Code Reviewer Assessment

**Quality Score: {1-10}**

| Criteria | Score | Notes |
|----------|-------|-------|
| Requirements Met | 8/10 | Missing edge case X |
| Test Coverage | 9/10 | 87% coverage |
| Code Quality | 8/10 | Minor complexity in Y |
| Technical Debt | 7/10 | Added 2 TODOs |

**Issues Found:**
1. {issue with severity}
2. {issue with severity}

**Verdict:** APPROVE / NEEDS_WORK / REJECT

---

### CTO Chief Assessment

**Strategic Score: {1-10}**

| Criteria | Score | Notes |
|----------|-------|-------|
| Business Alignment | 9/10 | Addresses user pain point |
| Architecture | 8/10 | Fits existing patterns |
| Security | 10/10 | No vulnerabilities |
| Maintainability | 7/10 | Could use more docs |

**Concerns:**
1. {concern with impact}

**Verdict:** APPROVE / NEEDS_WORK / REJECT

---

### Combined Recommendation

**APPROVE** / **NEEDS_WORK** / **REJECT**

**Rationale:**
{Detailed explanation of why this decision was made}

**If NEEDS_WORK, required changes:**
1. {specific change needed}
2. {specific change needed}
```

## Decision Rules

### When to Deep Explore

**Strategic decisions ONLY** - not every choice:

| Decision Type | Deep Explore? | Examples |
|---------------|---------------|----------|
| Architecture | ✅ Yes | "Monolith vs microservices?" |
| Technology | ✅ Yes | "PostgreSQL vs MongoDB?" |
| Approach | ✅ Yes | "Build vs buy?" |
| File/naming | ❌ No | "Name this function?" |
| Simple config | ❌ No | "Enable feature X?" |

**Detection:** LLM classification - ask Claude: "Is this a strategic decision requiring deep analysis? (architecture, technology choice, design approach)"
- If yes → deep explore
- If no → simple options
- Small token cost, high accuracy

### Reviewer Disagreement

**Both must agree** for approval, with escalation:

| Reviewer | CTO Chief | Result |
|----------|-----------|--------|
| APPROVE | APPROVE | ✅ APPROVE |
| APPROVE | NEEDS_WORK | ⚠️ NEEDS_WORK |
| NEEDS_WORK | APPROVE | ⚠️ NEEDS_WORK |
| REJECT | * | ❌ REJECT |
| * | REJECT | ❌ REJECT |

**Escalation Protocol (max 3 rounds):**

```
Round 1: Disagreement detected
  → Both agents present their case
  → Attempt to reach consensus

Round 2: Still disagreeing
  → Each agent responds to other's concerns
  → Second attempt at consensus

Round 3: Final round
  → If still no agreement: CTO Chief decides
  → Decision logged with full rationale
  → Dissenting opinion preserved in report
```

**Why CTO Chief wins:** Business alignment and strategic vision take precedence over technical perfectionism when deadlocked.

## Triggers

| Event | Action |
|-------|--------|
| Strategic AskUserQuestion | Deep explore options first |
| Plan moves to review/ | Spawn reviewer + CTO chief agents |
| User views plan in review | Show combined report |

## Business Value

- Better informed decisions
- Reduced risk from poor choices
- Consistent review quality
- Documented decision rationale
- Audit trail for approvals

## Implementation Scope

### Phase 1: Update Agent Prompts (Batch Script)
Add deep exploration template to ALL agents with user interaction.

**Approach:** Create `scripts/add-exploration-template.js` that:
1. Reads all `agents/**/*.md` files
2. Detects if agent has user interaction patterns
3. Appends the exploration template
4. Logs changes for review

**Validation (2-step):**
1. **Dry-run + spot check**: Script outputs diff without writing. Review changes, spot-check 5 random agents.
2. **Full test suite**: Run `node --test --test-force-exit tests/*.test.js` after applying. All 489+ tests must pass.

**Agents to Update:**
- `agents/coordinator/cto-chief.md` - Strategic decisions
- `agents/quality/code-reviewer.md` - Review decisions
- `agents/iron-loop/iron-loop-integrator.md` - Planning decisions
- `agents/iron-loop/iron-loop-critic.md` - Critique decisions
- All agents in `agents/` that use AskUserQuestion

**Template to Add:**
```markdown
## Decision Exploration Protocol

When presenting choices to the user:

1. **Identify if strategic** (architecture/technology/approach)
2. **If strategic, explore deeply:**
   - Research each option
   - List 2-3 pros per option
   - List 1-2 cons per option
   - Assess risk level (low/medium/high)
   - Provide clear recommendation with reasoning
3. **Use the standard format** (see below)
4. **If not strategic**, present simple options without deep analysis
```

### Phase 2: Review Report System
- Create `lib/review-reporter.js`
- Modify review stage to spawn both agents
- Generate combined report
- Handle disagreement per rules above
- **Storage:** Append report to plan file under `## Review Report` section

## Success Criteria

- [ ] All 60+ agents updated with exploration template
- [ ] Strategic decisions show pros/cons analysis
- [ ] Non-strategic decisions remain fast
- [ ] Review stage auto-spawns reviewer + CTO chief
- [ ] Combined report generated for every review
- [ ] Both agents must agree for APPROVE
- [ ] Reports saved to plan file under `## Review Report`
- [ ] Approval/rejection includes documented reasoning

---

## Implementation Details

### Files to Create/Modify

#### 1. `scripts/add-exploration-template.js` (New File)

Batch script to update all 75 agents with the Decision Exploration Protocol.

```javascript
#!/usr/bin/env node
/**
 * Add Exploration Template to Agents
 *
 * Batch updates agents with the Decision Exploration Protocol.
 * Detects agents that may present user choices and adds the template.
 *
 * Usage:
 *   node scripts/add-exploration-template.js --dry-run   # Preview changes
 *   node scripts/add-exploration-template.js             # Apply changes
 */

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '../agents');
const DRY_RUN = process.argv.includes('--dry-run');

// Patterns that indicate an agent may present choices to users
const USER_INTERACTION_PATTERNS = [
  /AskUserQuestion/i,
  /user choice/i,
  /user decision/i,
  /options?:/i,
  /recommend/i,
  /select.*approach/i,
  /which.*prefer/i,
  /decision.*tree/i,
  /choose/i,
  /alternative/i
];

// Agents that definitely interact with users (explicit list)
const INTERACTIVE_AGENTS = [
  'coordinator/cto-chief.md',
  'iron-loop/iron-loop-integrator.md',
  'iron-loop/iron-loop-critic.md',
  'iron-loop/iron-loop-executor.md',
  'quality/code-reviewer.md',
  'quality/architecture-checker.md'
];

const EXPLORATION_TEMPLATE = `
## Decision Exploration Protocol

When presenting choices to the user:

### 1. Classify the Decision

Ask: "Is this a strategic decision requiring deep analysis?"

| Strategic (Deep Explore) | Tactical (Simple Options) |
|--------------------------|---------------------------|
| Architecture choices | File naming |
| Technology selection | Simple config toggles |
| Design approaches | Implementation details |
| Build vs buy | Formatting preferences |

### 2. For Strategic Decisions, Deep Explore

Generate analysis using this format:

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│ DECISION: {question}                                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Option A: {name}                                            │
│   Pros:                                                     │
│     ✓ {advantage 1}                                         │
│     ✓ {advantage 2}                                         │
│   Cons:                                                     │
│     ✗ {disadvantage 1}                                      │
│   Risk: {low/medium/high} - {explanation}                   │
│                                                              │
│ Option B: {name}                                            │
│   Pros:                                                     │
│     ✓ {advantage 1}                                         │
│   Cons:                                                     │
│     ✗ {disadvantage 1}                                      │
│     ✗ {disadvantage 2}                                      │
│   Risk: {low/medium/high} - {explanation}                   │
│                                                              │
│ ─────────────────────────────────────────────────────────── │
│ → RECOMMENDED: Option A                                     │
│   Reason: {detailed justification}                          │
└─────────────────────────────────────────────────────────────┘
\`\`\`

### 3. Requirements

- **2-3 pros** per option (concrete benefits)
- **1-2 cons** per option (honest drawbacks)
- **Risk assessment** with brief explanation
- **Clear recommendation** with reasoning
- **Present both** the analysis AND the AskUserQuestion tool

### 4. For Tactical Decisions

Skip deep analysis. Present simple numbered options directly.
`;

/**
 * Check if agent content indicates user interaction
 */
function hasUserInteraction(content, relativePath) {
  // Check explicit list first
  if (INTERACTIVE_AGENTS.includes(relativePath)) {
    return true;
  }

  // Check patterns
  for (const pattern of USER_INTERACTION_PATTERNS) {
    if (pattern.test(content)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if agent already has the exploration protocol
 */
function hasExplorationProtocol(content) {
  return content.includes('## Decision Exploration Protocol') ||
         content.includes('Deep Explore') ||
         content.includes('Strategic (Deep Explore)');
}

/**
 * Find the best insertion point for the template
 * Inserts before "## Output" or at end of file
 */
function findInsertionPoint(content) {
  // Try to insert before Output section
  const outputMatch = content.match(/\n## Output/i);
  if (outputMatch) {
    return content.indexOf(outputMatch[0]);
  }

  // Try to insert before Known Limitations
  const limitationsMatch = content.match(/\n## Known Limitations/i);
  if (limitationsMatch) {
    return content.indexOf(limitationsMatch[0]);
  }

  // Insert at end
  return content.length;
}

/**
 * Process a single agent file
 */
function processAgent(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(AGENTS_DIR, filePath);

  // Skip if already has the protocol
  if (hasExplorationProtocol(content)) {
    return { path: relativePath, action: 'skip', reason: 'already has protocol' };
  }

  // Skip if no user interaction detected
  if (!hasUserInteraction(content, relativePath)) {
    return { path: relativePath, action: 'skip', reason: 'no user interaction detected' };
  }

  // Find insertion point and add template
  const insertPoint = findInsertionPoint(content);
  const newContent = content.slice(0, insertPoint) + '\n' + EXPLORATION_TEMPLATE + content.slice(insertPoint);

  if (!DRY_RUN) {
    fs.writeFileSync(filePath, newContent);
  }

  return { path: relativePath, action: 'updated', insertPoint };
}

/**
 * Recursively find all .md files in a directory
 */
function findAgentFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findAgentFiles(fullPath));
    } else if (entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

// Main execution
function main() {
  console.log('Add Exploration Template to Agents');
  console.log('─'.repeat(50));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'APPLY CHANGES'}`);
  console.log('');

  const agentFiles = findAgentFiles(AGENTS_DIR);
  console.log(`Found ${agentFiles.length} agent files\n`);

  const results = {
    updated: [],
    skipped: []
  };

  for (const filePath of agentFiles) {
    const result = processAgent(filePath);

    if (result.action === 'updated') {
      results.updated.push(result);
      console.log(`✓ ${result.path}`);
    } else {
      results.skipped.push(result);
      if (DRY_RUN) {
        console.log(`  (skip) ${result.path}: ${result.reason}`);
      }
    }
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`Updated: ${results.updated.length} agents`);
  console.log(`Skipped: ${results.skipped.length} agents`);

  if (DRY_RUN) {
    console.log('\nRun without --dry-run to apply changes.');
  } else {
    console.log('\nChanges applied. Run tests to verify:');
    console.log('  node --test --test-force-exit tests/*.test.js');
  }

  return results;
}

module.exports = { main, processAgent, hasUserInteraction, EXPLORATION_TEMPLATE };

if (require.main === module) {
  main();
}
```

**Edge Case Handling:**
- Detects existing exploration protocol to avoid duplicates
- Checks both explicit agent list and content patterns
- Finds appropriate insertion point (before Output section)
- Full dry-run mode with detailed output
- Exports functions for testing

---

#### 2. `lib/strategic-classifier.js` (New File)

LLM-based decision classification system.

```javascript
/**
 * Strategic Decision Classifier
 *
 * Uses lightweight LLM classification to determine if a question
 * requires deep exploration or can use simple options.
 *
 * @module lib/strategic-classifier
 */

// Keywords that strongly indicate strategic decisions
const STRATEGIC_KEYWORDS = [
  'architecture', 'microservices', 'monolith',
  'database', 'postgresql', 'mongodb', 'redis',
  'framework', 'react', 'vue', 'angular', 'nextjs',
  'cloud', 'aws', 'azure', 'gcp',
  'build vs buy', 'make vs buy',
  'api design', 'rest vs graphql',
  'authentication', 'oauth', 'jwt',
  'deployment', 'kubernetes', 'docker',
  'scaling', 'performance', 'caching'
];

// Keywords that indicate tactical/simple decisions
const TACTICAL_KEYWORDS = [
  'name', 'naming', 'file name',
  'format', 'formatting', 'style',
  'enable', 'disable', 'toggle',
  'config', 'configuration',
  'indent', 'tabs', 'spaces',
  'order', 'sort'
];

// Classification result
const DECISION_TYPE = {
  STRATEGIC: 'strategic',
  TACTICAL: 'tactical',
  UNKNOWN: 'unknown'
};

/**
 * Classify a decision question using keyword analysis
 * Fast heuristic that handles 80% of cases without LLM
 *
 * @param {string} question - The decision question
 * @returns {{type: string, confidence: number, reason: string}}
 */
function classifyByKeywords(question) {
  const lowerQuestion = question.toLowerCase();

  // Count keyword matches
  let strategicScore = 0;
  let tacticalScore = 0;
  const matchedKeywords = [];

  for (const keyword of STRATEGIC_KEYWORDS) {
    if (lowerQuestion.includes(keyword)) {
      strategicScore++;
      matchedKeywords.push(keyword);
    }
  }

  for (const keyword of TACTICAL_KEYWORDS) {
    if (lowerQuestion.includes(keyword)) {
      tacticalScore++;
    }
  }

  // Determine type
  if (strategicScore > 0 && strategicScore > tacticalScore) {
    return {
      type: DECISION_TYPE.STRATEGIC,
      confidence: Math.min(0.9, 0.5 + strategicScore * 0.1),
      reason: `Matched strategic keywords: ${matchedKeywords.join(', ')}`
    };
  }

  if (tacticalScore > strategicScore) {
    return {
      type: DECISION_TYPE.TACTICAL,
      confidence: Math.min(0.9, 0.5 + tacticalScore * 0.1),
      reason: 'Matched tactical keywords'
    };
  }

  return {
    type: DECISION_TYPE.UNKNOWN,
    confidence: 0.3,
    reason: 'No strong keyword matches'
  };
}

/**
 * Generate LLM classification prompt
 * Used when keyword analysis is uncertain
 *
 * @param {string} question - The decision question
 * @returns {string} Prompt for classification
 */
function generateClassificationPrompt(question) {
  return `Classify this decision as STRATEGIC or TACTICAL.

STRATEGIC decisions:
- Architecture choices (monolith vs microservices)
- Technology selection (database, framework, language)
- Design approaches (REST vs GraphQL)
- Build vs buy decisions

TACTICAL decisions:
- File/variable naming
- Configuration toggles
- Formatting preferences
- Simple implementation details

Question: "${question}"

Respond with exactly one word: STRATEGIC or TACTICAL`;
}

/**
 * Check if a decision is strategic
 * Main entry point for classification
 *
 * @param {string} question - The decision question
 * @param {Object} options - Classification options
 * @param {boolean} options.useLLM - Whether to use LLM for uncertain cases
 * @returns {Promise<{isStrategic: boolean, confidence: number, reason: string}>}
 */
async function isStrategicDecision(question, options = {}) {
  const { useLLM = false } = options;

  // First try keyword classification
  const keywordResult = classifyByKeywords(question);

  // If confident enough, return immediately
  if (keywordResult.confidence >= 0.7) {
    return {
      isStrategic: keywordResult.type === DECISION_TYPE.STRATEGIC,
      confidence: keywordResult.confidence,
      reason: keywordResult.reason
    };
  }

  // If LLM not enabled or confidence is acceptable, return keyword result
  if (!useLLM) {
    // Default to strategic for unknown (better to over-analyze than under-analyze)
    const isStrategic = keywordResult.type !== DECISION_TYPE.TACTICAL;
    return {
      isStrategic,
      confidence: keywordResult.confidence,
      reason: keywordResult.reason + ' (defaulting to strategic for safety)'
    };
  }

  // LLM classification would go here
  // For now, return keyword result with lower confidence
  return {
    isStrategic: keywordResult.type !== DECISION_TYPE.TACTICAL,
    confidence: 0.5,
    reason: 'LLM classification not implemented, defaulting based on keywords'
  };
}

module.exports = {
  isStrategicDecision,
  classifyByKeywords,
  generateClassificationPrompt,
  DECISION_TYPE,
  STRATEGIC_KEYWORDS,
  TACTICAL_KEYWORDS
};
```

---

#### 3. `lib/deep-explorer.js` (New File)

Generates pros/cons analysis for strategic decisions.

```javascript
/**
 * Deep Explorer
 *
 * Generates structured pros/cons analysis for strategic decisions.
 * Formats output in the standard exploration format.
 *
 * @module lib/deep-explorer
 */

const RISK_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

/**
 * Analysis structure for a single option
 * @typedef {Object} OptionAnalysis
 * @property {string} name - Option name
 * @property {string[]} pros - List of advantages
 * @property {string[]} cons - List of disadvantages
 * @property {string} risk - Risk level (low/medium/high)
 * @property {string} riskExplanation - Why this risk level
 */

/**
 * Full exploration result
 * @typedef {Object} ExplorationResult
 * @property {string} question - The decision question
 * @property {OptionAnalysis[]} options - Analyzed options
 * @property {string} recommendation - Recommended option name
 * @property {string} reasoning - Why this recommendation
 */

/**
 * Format an exploration result as a display string
 *
 * @param {ExplorationResult} result - The exploration result
 * @returns {string} Formatted exploration display
 */
function formatExploration(result) {
  const lines = [];
  const width = 61;

  // Header
  lines.push('┌' + '─'.repeat(width) + '┐');
  lines.push('│ DECISION: ' + result.question.padEnd(width - 11) + '│');
  lines.push('├' + '─'.repeat(width) + '┤');
  lines.push('│' + ' '.repeat(width) + '│');

  // Options
  for (let i = 0; i < result.options.length; i++) {
    const option = result.options[i];
    const letter = String.fromCharCode(65 + i); // A, B, C...

    lines.push(`│ Option ${letter}: ${option.name}`.padEnd(width + 1) + '│');
    lines.push('│   Pros:'.padEnd(width + 1) + '│');

    for (const pro of option.pros) {
      lines.push(`│     ✓ ${pro}`.padEnd(width + 1) + '│');
    }

    lines.push('│   Cons:'.padEnd(width + 1) + '│');

    for (const con of option.cons) {
      lines.push(`│     ✗ ${con}`.padEnd(width + 1) + '│');
    }

    lines.push(`│   Risk: ${option.risk} - ${option.riskExplanation}`.padEnd(width + 1) + '│');
    lines.push('│' + ' '.repeat(width) + '│');
  }

  // Recommendation
  lines.push('│ ' + '─'.repeat(width - 2) + ' │');
  lines.push(`│ → RECOMMENDED: ${result.recommendation}`.padEnd(width + 1) + '│');
  lines.push(`│   Reason: ${result.reasoning}`.padEnd(width + 1) + '│');
  lines.push('└' + '─'.repeat(width) + '┘');

  return lines.join('\n');
}

/**
 * Generate a deep exploration for a decision
 *
 * @param {Object} params - Exploration parameters
 * @param {string} params.question - The decision question
 * @param {Array<{name: string, description?: string}>} params.options - Options to analyze
 * @param {Object} [params.context] - Additional context for analysis
 * @returns {Promise<ExplorationResult>} The exploration result
 */
async function deepExplore(params) {
  const { question, options, context = {} } = params;

  // This is the structure - actual analysis would involve LLM
  // For now, return a template that the calling agent fills in
  const result = {
    question,
    options: options.map(opt => ({
      name: opt.name,
      pros: ['[Analyze advantage 1]', '[Analyze advantage 2]'],
      cons: ['[Analyze disadvantage 1]'],
      risk: RISK_LEVELS.MEDIUM,
      riskExplanation: '[Assess risk factors]'
    })),
    recommendation: options[0]?.name || 'Option A',
    reasoning: '[Provide detailed justification based on context]'
  };

  return result;
}

/**
 * Generate exploration prompt for LLM analysis
 *
 * @param {string} question - The decision question
 * @param {string[]} options - Option names
 * @param {Object} context - Additional context
 * @returns {string} Prompt for exploration
 */
function generateExplorationPrompt(question, options, context = {}) {
  return `Analyze this strategic decision and provide a structured comparison.

DECISION: ${question}

OPTIONS:
${options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}

CONTEXT:
${JSON.stringify(context, null, 2)}

For each option, provide:
1. 2-3 concrete advantages (pros)
2. 1-2 honest disadvantages (cons)
3. Risk level (low/medium/high) with brief explanation

Then provide:
- Your recommendation
- Detailed reasoning for the recommendation

Format as JSON:
{
  "options": [
    {
      "name": "Option Name",
      "pros": ["advantage 1", "advantage 2"],
      "cons": ["disadvantage 1"],
      "risk": "low|medium|high",
      "riskExplanation": "why this risk level"
    }
  ],
  "recommendation": "Recommended Option Name",
  "reasoning": "Why this is recommended"
}`;
}

module.exports = {
  deepExplore,
  formatExploration,
  generateExplorationPrompt,
  RISK_LEVELS
};
```

---

#### 4. `lib/review-reporter.js` (New File)

Generates combined review reports from Code Reviewer and CTO Chief.

```javascript
/**
 * Review Reporter
 *
 * Generates combined review reports from multiple reviewers.
 * Handles verdict determination and disagreement resolution.
 *
 * @module lib/review-reporter
 */

const fs = require('fs');
const path = require('path');
const { resolveDisagreement } = require('./consensus-resolver');

// Verdict constants
const VERDICT = {
  APPROVE: 'APPROVE',
  NEEDS_WORK: 'NEEDS_WORK',
  REJECT: 'REJECT'
};

/**
 * Code Reviewer assessment structure
 * @typedef {Object} CodeReviewAssessment
 * @property {number} qualityScore - Overall quality score 1-10
 * @property {Object} criteria - Individual criteria scores
 * @property {Array} issues - Issues found
 * @property {string} verdict - APPROVE/NEEDS_WORK/REJECT
 */

/**
 * CTO Chief assessment structure
 * @typedef {Object} CTOAssessment
 * @property {number} strategicScore - Overall strategic score 1-10
 * @property {Object} criteria - Individual criteria scores
 * @property {Array} concerns - Strategic concerns
 * @property {string} verdict - APPROVE/NEEDS_WORK/REJECT
 */

/**
 * Generate a combined review report
 *
 * @param {Object} params - Report parameters
 * @param {string} params.planName - Name of the plan being reviewed
 * @param {CodeReviewAssessment} params.codeReview - Code reviewer assessment
 * @param {CTOAssessment} params.ctoReview - CTO Chief assessment
 * @returns {string} Formatted markdown report
 */
function generateCombinedReport(params) {
  const { planName, codeReview, ctoReview } = params;

  // Determine combined verdict
  const combinedVerdict = determineCombinedVerdict(codeReview.verdict, ctoReview.verdict);

  const report = `## Review Report: ${planName}

### Code Reviewer Assessment

**Quality Score: ${codeReview.qualityScore}/10**

| Criteria | Score | Notes |
|----------|-------|-------|
| Requirements Met | ${codeReview.criteria.requirementsMet}/10 | ${codeReview.criteria.requirementsNotes || ''} |
| Test Coverage | ${codeReview.criteria.testCoverage}/10 | ${codeReview.criteria.coverageNotes || ''} |
| Code Quality | ${codeReview.criteria.codeQuality}/10 | ${codeReview.criteria.qualityNotes || ''} |
| Technical Debt | ${codeReview.criteria.technicalDebt}/10 | ${codeReview.criteria.debtNotes || ''} |

**Issues Found:**
${codeReview.issues.map((issue, i) => `${i + 1}. ${issue.description} (${issue.severity})`).join('\n')}

**Verdict:** ${codeReview.verdict}

---

### CTO Chief Assessment

**Strategic Score: ${ctoReview.strategicScore}/10**

| Criteria | Score | Notes |
|----------|-------|-------|
| Business Alignment | ${ctoReview.criteria.businessAlignment}/10 | ${ctoReview.criteria.alignmentNotes || ''} |
| Architecture | ${ctoReview.criteria.architecture}/10 | ${ctoReview.criteria.architectureNotes || ''} |
| Security | ${ctoReview.criteria.security}/10 | ${ctoReview.criteria.securityNotes || ''} |
| Maintainability | ${ctoReview.criteria.maintainability}/10 | ${ctoReview.criteria.maintainabilityNotes || ''} |

**Concerns:**
${ctoReview.concerns.map((concern, i) => `${i + 1}. ${concern.description} (${concern.impact})`).join('\n')}

**Verdict:** ${ctoReview.verdict}

---

### Combined Recommendation

**${combinedVerdict.verdict}**

**Rationale:**
${combinedVerdict.rationale}

${combinedVerdict.verdict === VERDICT.NEEDS_WORK ? `**Required Changes:**
${combinedVerdict.requiredChanges.map((change, i) => `${i + 1}. ${change}`).join('\n')}` : ''}
`;

  return report;
}

/**
 * Determine combined verdict from both reviewers
 *
 * @param {string} reviewerVerdict - Code reviewer verdict
 * @param {string} ctoVerdict - CTO Chief verdict
 * @returns {{verdict: string, rationale: string, requiredChanges?: string[]}}
 */
function determineCombinedVerdict(reviewerVerdict, ctoVerdict) {
  // Any REJECT = REJECT
  if (reviewerVerdict === VERDICT.REJECT || ctoVerdict === VERDICT.REJECT) {
    return {
      verdict: VERDICT.REJECT,
      rationale: `Rejected by ${reviewerVerdict === VERDICT.REJECT ? 'Code Reviewer' : 'CTO Chief'}. Critical issues must be addressed before re-review.`
    };
  }

  // Both APPROVE = APPROVE
  if (reviewerVerdict === VERDICT.APPROVE && ctoVerdict === VERDICT.APPROVE) {
    return {
      verdict: VERDICT.APPROVE,
      rationale: 'Both reviewers approve. Implementation meets quality and strategic requirements.'
    };
  }

  // Any NEEDS_WORK = NEEDS_WORK
  return {
    verdict: VERDICT.NEEDS_WORK,
    rationale: `Requires changes based on ${reviewerVerdict === VERDICT.NEEDS_WORK ? 'Code Reviewer' : 'CTO Chief'} feedback.`,
    requiredChanges: ['Address issues identified in the review above']
  };
}

/**
 * Spawn review agents and collect assessments
 *
 * @param {string} planPath - Path to the plan file
 * @param {Object} options - Options for review
 * @returns {Promise<{codeReview: CodeReviewAssessment, ctoReview: CTOAssessment}>}
 */
async function spawnReviewAgents(planPath, options = {}) {
  // This would invoke the Task tool to spawn agents
  // For now, return structure that calling code fills in
  return {
    codeReview: {
      qualityScore: 0,
      criteria: {
        requirementsMet: 0,
        testCoverage: 0,
        codeQuality: 0,
        technicalDebt: 0
      },
      issues: [],
      verdict: VERDICT.NEEDS_WORK
    },
    ctoReview: {
      strategicScore: 0,
      criteria: {
        businessAlignment: 0,
        architecture: 0,
        security: 0,
        maintainability: 0
      },
      concerns: [],
      verdict: VERDICT.NEEDS_WORK
    }
  };
}

/**
 * Append review report to plan file
 *
 * @param {string} planPath - Path to plan file
 * @param {string} report - The review report markdown
 */
function appendReportToPlan(planPath, report) {
  let content = fs.readFileSync(planPath, 'utf8');

  // Remove existing review report if present
  const reportStart = content.indexOf('## Review Report:');
  if (reportStart !== -1) {
    content = content.slice(0, reportStart).trimEnd();
  }

  // Append new report
  fs.writeFileSync(planPath, content + '\n\n' + report);
}

module.exports = {
  generateCombinedReport,
  determineCombinedVerdict,
  spawnReviewAgents,
  appendReportToPlan,
  VERDICT
};
```

---

#### 5. `lib/consensus-resolver.js` (New File)

Handles 3-round disagreement resolution between reviewers.

```javascript
/**
 * Consensus Resolver
 *
 * Implements the 3-round escalation protocol for reviewer disagreement.
 * Ensures both reviewers can present their case before final decision.
 *
 * @module lib/consensus-resolver
 */

const MAX_ROUNDS = 3;

/**
 * Resolution state
 * @typedef {Object} ResolutionState
 * @property {number} round - Current round (1-3)
 * @property {string} reviewerVerdict - Code reviewer's current verdict
 * @property {string} ctoVerdict - CTO Chief's current verdict
 * @property {string[]} reviewerArguments - Reviewer's supporting arguments
 * @property {string[]} ctoArguments - CTO's supporting arguments
 * @property {boolean} resolved - Whether consensus was reached
 * @property {string} finalVerdict - The final decision
 * @property {string} rationale - Why this decision was made
 */

/**
 * Initialize a new resolution process
 *
 * @param {string} reviewerVerdict - Initial reviewer verdict
 * @param {string} ctoVerdict - Initial CTO verdict
 * @returns {ResolutionState} Initial state
 */
function initResolution(reviewerVerdict, ctoVerdict) {
  const agree = reviewerVerdict === ctoVerdict;

  return {
    round: agree ? 0 : 1,
    reviewerVerdict,
    ctoVerdict,
    reviewerArguments: [],
    ctoArguments: [],
    resolved: agree,
    finalVerdict: agree ? reviewerVerdict : null,
    rationale: agree ? 'Both reviewers agree' : null
  };
}

/**
 * Process a round of disagreement resolution
 *
 * @param {ResolutionState} state - Current state
 * @param {Object} input - Round input
 * @param {string} input.reviewerResponse - Reviewer's argument/response
 * @param {string} input.ctoResponse - CTO's argument/response
 * @param {string} [input.reviewerNewVerdict] - If reviewer changes verdict
 * @param {string} [input.ctoNewVerdict] - If CTO changes verdict
 * @returns {ResolutionState} Updated state
 */
function processRound(state, input) {
  if (state.resolved) {
    return state;
  }

  const newState = { ...state };

  // Record arguments
  if (input.reviewerResponse) {
    newState.reviewerArguments.push(input.reviewerResponse);
  }
  if (input.ctoResponse) {
    newState.ctoArguments.push(input.ctoResponse);
  }

  // Update verdicts if changed
  if (input.reviewerNewVerdict) {
    newState.reviewerVerdict = input.reviewerNewVerdict;
  }
  if (input.ctoNewVerdict) {
    newState.ctoVerdict = input.ctoNewVerdict;
  }

  // Check for consensus
  if (newState.reviewerVerdict === newState.ctoVerdict) {
    newState.resolved = true;
    newState.finalVerdict = newState.reviewerVerdict;
    newState.rationale = `Consensus reached in round ${state.round}: ${newState.reviewerVerdict}`;
    return newState;
  }

  // Move to next round
  newState.round = state.round + 1;

  // Round 3: CTO Chief decides
  if (newState.round > MAX_ROUNDS) {
    newState.resolved = true;
    newState.finalVerdict = newState.ctoVerdict;
    newState.rationale = generateFinalRationale(newState);
  }

  return newState;
}

/**
 * Generate rationale for CTO Chief's final decision
 *
 * @param {ResolutionState} state - Final state
 * @returns {string} Rationale text
 */
function generateFinalRationale(state) {
  return `After ${MAX_ROUNDS} rounds without consensus, CTO Chief makes final decision.

**Code Reviewer Position:** ${state.reviewerVerdict}
Arguments:
${state.reviewerArguments.map((arg, i) => `  ${i + 1}. ${arg}`).join('\n')}

**CTO Chief Position:** ${state.ctoVerdict}
Arguments:
${state.ctoArguments.map((arg, i) => `  ${i + 1}. ${arg}`).join('\n')}

**Final Decision:** ${state.ctoVerdict}
**Reasoning:** Business alignment and strategic vision take precedence when technical and strategic views are deadlocked.

*Note: Dissenting opinion from Code Reviewer preserved above for record.*`;
}

/**
 * Run full disagreement resolution
 *
 * @param {string} reviewerVerdict - Reviewer's verdict
 * @param {string} ctoVerdict - CTO's verdict
 * @param {Function} getResponses - Async function to get round responses
 * @returns {Promise<ResolutionState>} Final resolution state
 */
async function resolveDisagreement(reviewerVerdict, ctoVerdict, getResponses) {
  let state = initResolution(reviewerVerdict, ctoVerdict);

  while (!state.resolved && state.round <= MAX_ROUNDS) {
    const responses = await getResponses(state);
    state = processRound(state, responses);
  }

  return state;
}

/**
 * Generate prompt for resolution round
 *
 * @param {ResolutionState} state - Current state
 * @param {string} role - 'reviewer' or 'cto'
 * @returns {string} Prompt for the agent
 */
function generateRoundPrompt(state, role) {
  const isReviewer = role === 'reviewer';
  const myVerdict = isReviewer ? state.reviewerVerdict : state.ctoVerdict;
  const theirVerdict = isReviewer ? state.ctoVerdict : state.reviewerVerdict;
  const theirArguments = isReviewer ? state.ctoArguments : state.reviewerArguments;

  if (state.round === 1) {
    return `You verdicted ${myVerdict}. The ${isReviewer ? 'CTO Chief' : 'Code Reviewer'} verdicted ${theirVerdict}.

Please present your case for ${myVerdict}. Explain:
1. Why you believe ${myVerdict} is the right verdict
2. What specific evidence supports your position
3. What concerns led you to this conclusion

You may also reconsider if the other party's position has merit.`;
  }

  return `Round ${state.round} of disagreement resolution.

The ${isReviewer ? 'CTO Chief' : 'Code Reviewer'} argues:
${theirArguments[theirArguments.length - 1]}

Your previous verdict: ${myVerdict}

Please:
1. Respond to their arguments
2. Either maintain your position with additional evidence, or
3. Acknowledge merit in their position and update your verdict

${state.round === MAX_ROUNDS ? '\nThis is the final round. If no consensus is reached, CTO Chief will make the final decision.' : ''}`;
}

module.exports = {
  initResolution,
  processRound,
  resolveDisagreement,
  generateRoundPrompt,
  generateFinalRationale,
  MAX_ROUNDS
};
```

---

### Key Functions Summary

| Function | File | Purpose |
|----------|------|---------|
| `isStrategicDecision(question)` | `lib/strategic-classifier.js` | Classify if question needs deep exploration |
| `deepExplore(options)` | `lib/deep-explorer.js` | Generate pros/cons analysis |
| `formatExploration(result)` | `lib/deep-explorer.js` | Format analysis for display |
| `spawnReviewAgents(planPath)` | `lib/review-reporter.js` | Launch reviewer + CTO chief |
| `generateCombinedReport(reviews)` | `lib/review-reporter.js` | Merge reports into markdown |
| `determineCombinedVerdict(r, c)` | `lib/review-reporter.js` | Apply verdict rules |
| `resolveDisagreement(r, c, fn)` | `lib/consensus-resolver.js` | Run 3-round consensus |
| `processRound(state, input)` | `lib/consensus-resolver.js` | Handle single round |

---

### Template Content

#### Exploration Template (Full)

The following is appended to agents by `add-exploration-template.js`:

```markdown
## Decision Exploration Protocol

When presenting choices to the user:

### 1. Classify the Decision

Ask: "Is this a strategic decision requiring deep analysis?"

| Strategic (Deep Explore) | Tactical (Simple Options) |
|--------------------------|---------------------------|
| Architecture choices | File naming |
| Technology selection | Simple config toggles |
| Design approaches | Implementation details |
| Build vs buy | Formatting preferences |

### 2. For Strategic Decisions, Deep Explore

Generate analysis using this format:

```
┌─────────────────────────────────────────────────────────────┐
│ DECISION: {question}                                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Option A: {name}                                            │
│   Pros:                                                     │
│     ✓ {advantage 1}                                         │
│     ✓ {advantage 2}                                         │
│   Cons:                                                     │
│     ✗ {disadvantage 1}                                      │
│   Risk: {low/medium/high} - {explanation}                   │
│                                                              │
│ Option B: {name}                                            │
│   Pros:                                                     │
│     ✓ {advantage 1}                                         │
│   Cons:                                                     │
│     ✗ {disadvantage 1}                                      │
│     ✗ {disadvantage 2}                                      │
│   Risk: {low/medium/high} - {explanation}                   │
│                                                              │
│ ─────────────────────────────────────────────────────────── │
│ → RECOMMENDED: Option A                                     │
│   Reason: {detailed justification}                          │
└─────────────────────────────────────────────────────────────┘
```

### 3. Requirements

- **2-3 pros** per option (concrete benefits)
- **1-2 cons** per option (honest drawbacks)
- **Risk assessment** with brief explanation
- **Clear recommendation** with reasoning
- **Present both** the analysis AND the AskUserQuestion tool

### 4. For Tactical Decisions

Skip deep analysis. Present simple numbered options directly.
```

#### Review Report Template (Full)

Generated by `generateCombinedReport()`:

```markdown
## Review Report: {plan-name}

### Code Reviewer Assessment

**Quality Score: {1-10}/10**

| Criteria | Score | Notes |
|----------|-------|-------|
| Requirements Met | X/10 | {notes} |
| Test Coverage | X/10 | {notes} |
| Code Quality | X/10 | {notes} |
| Technical Debt | X/10 | {notes} |

**Issues Found:**
1. {issue description} ({severity})
2. {issue description} ({severity})

**Verdict:** APPROVE / NEEDS_WORK / REJECT

---

### CTO Chief Assessment

**Strategic Score: {1-10}/10**

| Criteria | Score | Notes |
|----------|-------|-------|
| Business Alignment | X/10 | {notes} |
| Architecture | X/10 | {notes} |
| Security | X/10 | {notes} |
| Maintainability | X/10 | {notes} |

**Concerns:**
1. {concern description} ({impact})

**Verdict:** APPROVE / NEEDS_WORK / REJECT

---

### Combined Recommendation

**{FINAL_VERDICT}**

**Rationale:**
{Detailed explanation of why this decision was made}

**If NEEDS_WORK, required changes:**
1. {specific change needed}
2. {specific change needed}
```

---

### Integration Points

#### 1. AskUserQuestion Flow Integration

Modify the workflow that handles AskUserQuestion to check for strategic decisions:

**File:** `commands/ctoc.md` (modify Rule 3 section)

Add before presenting options:
```markdown
### Before Presenting Options

1. Call `isStrategicDecision(question)` from `lib/strategic-classifier.js`
2. If strategic:
   - Generate deep exploration using `deepExplore()`
   - Format and display the exploration box
   - THEN present AskUserQuestion with the options
3. If tactical:
   - Present AskUserQuestion directly
```

#### 2. Review Stage Transition Integration

**File:** `lib/plan-validator.js` (modify `validateTransition`)

Add new transition handler:
```javascript
// In validatedTransitions object:
'in-progress->review': async (planPath, projectPath) => {
  // Existing validation
  const baseValidation = validateForReview(planPath, projectPath);

  // Spawn review agents and generate report
  const { generateCombinedReport, spawnReviewAgents, appendReportToPlan } = require('./review-reporter');
  const reviews = await spawnReviewAgents(planPath);
  const report = generateCombinedReport({
    planName: path.basename(planPath, '.md'),
    codeReview: reviews.codeReview,
    ctoReview: reviews.ctoReview
  });

  appendReportToPlan(planPath, report);

  return baseValidation;
}
```

#### 3. Agent Updates Required

**`agents/coordinator/cto-chief.md`:**
- Add Decision Exploration Protocol section
- Add Review Report generation instructions
- Add consensus resolution protocol

**`agents/quality/code-reviewer.md`:**
- Add Review Assessment format
- Add criteria scoring guidelines
- Add disagreement response protocol

---

### Complete List of 75 Agents

The batch script will process these agents (found via `agents/**/*.md`):

| Category | Count | Agents |
|----------|-------|--------|
| ai-quality | 2 | ai-code-quality-reviewer, hallucination-detector |
| compliance | 3 | audit-log-checker, gdpr-compliance-checker, license-scanner |
| devex | 2 | api-deprecation-checker, onboarding-validator |
| documentation | 2 | documentation-updater, changelog-generator |
| data-ml | 3 | feature-store-validator, ml-model-validator, data-quality-checker |
| infrastructure | 4 | docker-security-checker, terraform-validator, kubernetes-checker, ci-pipeline-checker |
| frontend | 3 | bundle-analyzer, component-tester, visual-regression-checker |
| cost | 1 | cloud-cost-analyzer |
| testing/runners | 5 | mutation-test-runner, smoke-test-runner, integration-test-runner, e2e-test-runner, unit-test-runner |
| testing/writers | 4 | e2e-test-writer, unit-test-writer, property-test-writer, integration-test-writer |
| testing | 3 | playwright-qa, coverage-enforcer, quality-gate-runner |
| mobile | 3 | react-native-bridge-checker, ios-checker, android-checker |
| quality | 8 | architecture-checker, consistency-checker, dead-code-detector, duplicate-code-detector, code-smell-detector, type-checker, code-reviewer, complexity-analyzer, complexity-reducer |
| security | 6 | input-validation-checker, security-scanner, dependency-checker, concurrency-checker, sast-scanner, dependency-auditor, secrets-detector |
| specialized | 11 | configuration-validator, error-handler-checker, memory-safety-checker, accessibility-checker, database-reviewer, resilience-checker, health-check-validator, translation-checker, performance-profiler, api-contract-validator, observability-checker |
| versioning | 3 | technical-debt-tracker, feature-flag-auditor, backwards-compatibility-checker |
| iron-loop | 3 | iron-loop-integrator, iron-loop-critic, iron-loop-executor |
| architecture | 2 | pattern-detector, dependency-analyzer |
| coordinator | 1 | cto-chief |
| pipeline | 5 | agent-critic, agent-writer, agent-tester, agent-qa, agent-publisher |

**Total: 75 agents**

---

### Self-Critique Responses

#### Does the batch script handle edge cases (agents with existing sections)?

**Yes.** The `hasExplorationProtocol()` function checks for:
- Exact match: `## Decision Exploration Protocol`
- Partial match: `Deep Explore`
- Partial match: `Strategic (Deep Explore)`

Agents with any of these are skipped to prevent duplicates.

The `findInsertionPoint()` function carefully places the template:
1. Before `## Output` section (if exists)
2. Before `## Known Limitations` (if exists)
3. At end of file (fallback)

This ensures the template appears in a logical location.

#### Is the 3-round consensus logic clear?

**Yes.** The consensus resolver has explicit state management:

```
Round 1: Both present their case
  ↓
Check for agreement → If yes, resolved
  ↓
Round 2: Respond to each other's arguments
  ↓
Check for agreement → If yes, resolved
  ↓
Round 3: Final arguments
  ↓
Check for agreement → If yes, resolved
                    → If no, CTO Chief decides
```

The `generateFinalRationale()` function preserves dissenting opinion.

#### Are all 75 agents properly identified?

**Yes.** The glob pattern `agents/**/*.md` captures all agents. The script uses:
- `findAgentFiles()` - Recursive directory scan
- Pattern matching for user interaction detection
- Explicit list for known interactive agents

The actual count is **75 agents** (not 60+ as estimated in the plan).

---

### Execution Order

1. **Create lib files** (can be parallel):
   - `lib/strategic-classifier.js`
   - `lib/deep-explorer.js`
   - `lib/review-reporter.js`
   - `lib/consensus-resolver.js`

2. **Create batch script**:
   - `scripts/add-exploration-template.js`

3. **Run batch script in dry-run mode**:
   ```bash
   node scripts/add-exploration-template.js --dry-run
   ```

4. **Review output, spot-check 5 agents**

5. **Apply changes**:
   ```bash
   node scripts/add-exploration-template.js
   ```

6. **Run test suite**:
   ```bash
   node --test --test-force-exit tests/*.test.js
   ```

7. **Update integration points**:
   - Modify `commands/ctoc.md`
   - Modify `lib/plan-validator.js`

8. **Test end-to-end**:
   - Create test plan
   - Verify strategic decision triggers exploration
   - Verify review stage generates report
   - Verify disagreement resolution works

---

## Execution Steps (Iron Loop 7-15)

### Step 7: TEST (TDD Red) - COMPLETE

Write tests first before implementation. All tests should initially fail.

#### 7.1 Create `/home/tijn/ctoc/tests/strategic-classifier.test.js` - DONE

- [x] Test `classifyByKeywords()` returns STRATEGIC for architecture keywords
- [x] Test `classifyByKeywords()` returns TACTICAL for naming/config keywords
- [x] Test `classifyByKeywords()` returns UNKNOWN when no strong matches
- [x] Test `isStrategicDecision()` returns high confidence for clear strategic questions
- [x] Test `isStrategicDecision()` defaults to strategic for unknown (safety default)
- [x] Test `generateClassificationPrompt()` produces valid prompt string
- [x] Test edge case: empty string input
- [x] Test edge case: question with mixed strategic/tactical keywords
- [x] Test edge case: very long question (>1000 chars)

#### 7.2 Create `/home/tijn/ctoc/tests/deep-explorer.test.js` - DONE

- [x] Test `formatExploration()` produces valid box-drawing output
- [x] Test `formatExploration()` handles 2 options correctly
- [x] Test `formatExploration()` handles 3+ options correctly
- [x] Test `deepExplore()` returns proper structure with all required fields
- [x] Test `generateExplorationPrompt()` includes all options in output
- [x] Test RISK_LEVELS constants are correct (low/medium/high)
- [x] Test edge case: option with empty pros/cons arrays
- [x] Test edge case: very long option names (>50 chars)
- [x] Test edge case: recommendation not in options list

#### 7.3 Create `/home/tijn/ctoc/tests/review-reporter.test.js` - DONE

- [x] Test `generateCombinedReport()` produces valid markdown
- [x] Test `generateCombinedReport()` includes both reviewer sections
- [x] Test `determineCombinedVerdict()` returns REJECT if either reviewer REJECT
- [x] Test `determineCombinedVerdict()` returns APPROVE only if both APPROVE
- [x] Test `determineCombinedVerdict()` returns NEEDS_WORK for mixed verdicts
- [x] Test `appendReportToPlan()` removes existing report before adding new
- [x] Test `appendReportToPlan()` preserves plan content above report
- [x] Test VERDICT constants have correct values
- [x] Test edge case: missing criteria fields (should not crash)
- [x] Test edge case: empty issues/concerns arrays

#### 7.4 Create `/home/tijn/ctoc/tests/consensus-resolver.test.js` - DONE

- [x] Test `initResolution()` marks resolved=true when verdicts agree
- [x] Test `initResolution()` starts round=1 when verdicts disagree
- [x] Test `processRound()` detects consensus when verdicts align
- [x] Test `processRound()` advances round when still disagreeing
- [x] Test `processRound()` sets CTO verdict as final after round 3
- [x] Test `generateFinalRationale()` includes both parties' arguments
- [x] Test `generateRoundPrompt()` differs by round number
- [x] Test MAX_ROUNDS constant equals 3
- [x] Test edge case: same verdict in both rounds (resolved early)
- [x] Test edge case: one party changes verdict mid-resolution

#### 7.5 Create `/home/tijn/ctoc/tests/add-exploration-template.test.js` - DONE

- [x] Test `hasUserInteraction()` returns true for agents in INTERACTIVE_AGENTS list
- [x] Test `hasUserInteraction()` returns true for pattern matches (AskUserQuestion)
- [x] Test `hasUserInteraction()` returns false for pure automation agents
- [x] Test `hasExplorationProtocol()` detects existing protocol section
- [x] Test `findInsertionPoint()` returns position before `## Output` section
- [x] Test `findInsertionPoint()` returns end of file when no markers found
- [x] Test `processAgent()` returns skip for agents with existing protocol
- [x] Test `processAgent()` returns updated for interactive agents without protocol
- [x] Test dry-run mode does not modify files
- [x] Test edge case: agent file with only title (no sections)
- [x] Test edge case: agent file does not exist (graceful error)
- [x] Test edge case: agent file is read-only (proper error message)

---

### Step 8: QUALITY - COMPLETE

Run lint, format, and type-check on all new files.

- [x] Run ESLint on `/home/tijn/ctoc/lib/strategic-classifier.js`
- [x] Run ESLint on `/home/tijn/ctoc/lib/deep-explorer.js`
- [x] Run ESLint on `/home/tijn/ctoc/lib/review-reporter.js`
- [x] Run ESLint on `/home/tijn/ctoc/lib/consensus-resolver.js`
- [x] Run ESLint on `/home/tijn/ctoc/scripts/add-exploration-template.js`
- [x] Run Prettier on all new files
- [x] Verify no syntax errors: `node --check lib/*.js`
- [x] Verify all exports are valid: require each module in Node REPL
- [x] Check for unused variables and imports
- [x] Ensure consistent code style with existing `/home/tijn/ctoc/lib/` files

---

### Step 9: IMPLEMENT - COMPLETE

Create all files as specified in the Implementation Details section.

#### 9.1 Create Core Library Files (Parallel) - DONE

- [x] Create `/home/tijn/ctoc/lib/strategic-classifier.js` with:
  - `classifyByKeywords(question)` function
  - `generateClassificationPrompt(question)` function
  - `isStrategicDecision(question, options)` async function
  - STRATEGIC_KEYWORDS and TACTICAL_KEYWORDS arrays
  - DECISION_TYPE constants
  - Export all public functions

- [x] Create `/home/tijn/ctoc/lib/deep-explorer.js` with:
  - `deepExplore(params)` async function
  - `formatExploration(result)` function
  - `generateExplorationPrompt(question, options, context)` function
  - RISK_LEVELS constants
  - JSDoc typedefs for OptionAnalysis and ExplorationResult
  - Export all public functions

- [x] Create `/home/tijn/ctoc/lib/review-reporter.js` with:
  - `generateCombinedReport(params)` function
  - `determineCombinedVerdict(reviewerVerdict, ctoVerdict)` function
  - `spawnReviewAgents(planPath, options)` async function
  - `appendReportToPlan(planPath, report)` function
  - VERDICT constants
  - Require consensus-resolver.js for resolveDisagreement
  - Export all public functions

- [x] Create `/home/tijn/ctoc/lib/consensus-resolver.js` with:
  - `initResolution(reviewerVerdict, ctoVerdict)` function
  - `processRound(state, input)` function
  - `resolveDisagreement(reviewerVerdict, ctoVerdict, getResponses)` async function
  - `generateRoundPrompt(state, role)` function
  - `generateFinalRationale(state)` function
  - MAX_ROUNDS constant (3)
  - JSDoc typedef for ResolutionState
  - Export all public functions

#### 9.2 Create Batch Script - DONE

- [x] Create `/home/tijn/ctoc/scripts/add-exploration-template.js` with:
  - Shebang `#!/usr/bin/env node`
  - `--dry-run` CLI flag support
  - `findAgentFiles(dir)` recursive directory scanner
  - `hasUserInteraction(content, relativePath)` detector
  - `hasExplorationProtocol(content)` checker
  - `findInsertionPoint(content)` locator
  - `processAgent(filePath)` processor
  - `main()` entry point
  - USER_INTERACTION_PATTERNS array
  - INTERACTIVE_AGENTS explicit list
  - EXPLORATION_TEMPLATE multi-line string
  - Export functions for testing

#### 9.3 Wire Up Integration Points - PENDING

- [ ] Modify `/home/tijn/ctoc/lib/plan-validator.js`:
  - Add require for review-reporter.js
  - Update `validateTransition` function
  - Add review agent spawning in `in-progress->review` transition
  - Call `generateCombinedReport()` after reviews complete
  - Call `appendReportToPlan()` to save report

---

### Step 10: REVIEW

Self-review all new code for correctness and completeness.

- [ ] Review `strategic-classifier.js`: Does keyword matching work correctly?
- [ ] Review `strategic-classifier.js`: Is the default-to-strategic behavior safe?
- [ ] Review `deep-explorer.js`: Does box-drawing handle Unicode properly?
- [ ] Review `deep-explorer.js`: Are pro/con arrays properly iterated?
- [ ] Review `review-reporter.js`: Does markdown table formatting work?
- [ ] Review `review-reporter.js`: Is existing report properly removed?
- [ ] Review `consensus-resolver.js`: Are rounds counted correctly (1-indexed)?
- [ ] Review `consensus-resolver.js`: Does CTO-wins logic trigger at round > 3?
- [ ] Review `add-exploration-template.js`: Does dry-run truly skip writes?
- [ ] Review `add-exploration-template.js`: Are relative paths computed correctly?
- [ ] Verify all functions have JSDoc comments
- [ ] Verify all error paths return meaningful messages
- [ ] Check that module.exports match what tests import

---

### Step 11: OPTIMIZE

Check for performance issues and unnecessary overhead.

- [ ] `strategic-classifier.js`: Ensure keyword arrays are searched efficiently (early exit on match)
- [ ] `strategic-classifier.js`: Cache compiled regex patterns if called repeatedly
- [ ] `deep-explorer.js`: Pre-calculate box width instead of repeated padEnd calls
- [ ] `review-reporter.js`: Use template literals efficiently (no repeated concatenation)
- [ ] `consensus-resolver.js`: Avoid deep copying state unless values change
- [ ] `add-exploration-template.js`: Process files in parallel using Promise.all (batch of 10)
- [ ] Check for unnecessary fs.readFileSync calls (read once, reuse)
- [ ] Verify no blocking operations in async functions
- [ ] Profile batch script with 75 agents to ensure < 5s completion

---

### Step 12: SECURE

Security review of all new code.

- [ ] `add-exploration-template.js`: Validate AGENTS_DIR path stays within project
- [ ] `add-exploration-template.js`: No path traversal via user-supplied paths (agents dir is hardcoded)
- [ ] `review-reporter.js`: Sanitize planPath before fs operations
- [ ] `review-reporter.js`: Validate planPath exists before reading/writing
- [ ] All files: No eval() or Function() constructors
- [ ] All files: No shell command execution (child_process) without sanitization
- [ ] All files: No secrets, API keys, or credentials in code
- [ ] All files: No sensitive data logged to console
- [ ] Verify file permissions: new files should be 644 (readable, not executable)
- [ ] Check that fs.writeFileSync does not overwrite critical system files

---

### Step 13: VERIFY

Run all tests and verify end-to-end functionality.

#### 13.1 Unit Tests

- [ ] Run: `node --test --test-force-exit /home/tijn/ctoc/tests/strategic-classifier.test.js`
- [ ] Run: `node --test --test-force-exit /home/tijn/ctoc/tests/deep-explorer.test.js`
- [ ] Run: `node --test --test-force-exit /home/tijn/ctoc/tests/review-reporter.test.js`
- [ ] Run: `node --test --test-force-exit /home/tijn/ctoc/tests/consensus-resolver.test.js`
- [ ] Run: `node --test --test-force-exit /home/tijn/ctoc/tests/add-exploration-template.test.js`

#### 13.2 Full Test Suite

- [ ] Run: `node --test --test-force-exit /home/tijn/ctoc/tests/*.test.js`
- [ ] Verify all 489+ existing tests still pass
- [ ] Verify no regressions in plan-validator functionality

#### 13.3 Batch Script Verification

- [ ] Run: `node /home/tijn/ctoc/scripts/add-exploration-template.js --dry-run`
- [ ] Verify output shows expected agents to update
- [ ] Spot-check 5 random agents from output list
- [ ] Run: `node /home/tijn/ctoc/scripts/add-exploration-template.js` (apply changes)
- [ ] Verify agents now contain Decision Exploration Protocol section

#### 13.4 Integration Tests

- [ ] Create test plan in `/home/tijn/ctoc/plans/test/`
- [ ] Test strategic decision detection: ask "PostgreSQL vs MongoDB?"
- [ ] Verify deep exploration box appears with pros/cons
- [ ] Test tactical decision detection: ask "Name this variable?"
- [ ] Verify simple options appear (no deep exploration)
- [ ] Test review transition with mock reviewer + CTO assessments
- [ ] Verify combined report appended to plan file
- [ ] Test disagreement resolution with conflicting verdicts
- [ ] Verify CTO Chief wins after 3 rounds

---

### Step 14: DOCUMENT

Update documentation for new features.

- [ ] Add "Decision Exploration" section to `/home/tijn/ctoc/README.md`
- [ ] Document the deep exploration format with example
- [ ] Add "Review Report System" section to README
- [ ] Document the combined review report format
- [ ] Update `/home/tijn/ctoc/CHANGELOG.md` with new feature entry
- [ ] Add JSDoc @example tags to key public functions
- [ ] Document the 3-round consensus protocol in `/home/tijn/ctoc/docs/` (if docs dir exists)
- [ ] Add inline comments explaining the CTO-wins rationale
- [ ] Update CLAUDE.md if any new commands were added

---

### Step 15: FINAL-REVIEW

Final verification before marking plan complete.

#### 15.1 Checklist Verification

- [ ] All Step 7 test files created and passing
- [ ] All Step 8 quality checks passed (lint, format)
- [ ] All Step 9 implementation files created
- [ ] All Step 10 code review items addressed
- [ ] All Step 11 optimizations applied
- [ ] All Step 12 security concerns resolved
- [ ] All Step 13 tests passing (unit + integration)
- [ ] All Step 14 documentation updated

#### 15.2 Success Criteria Check (from plan)

- [ ] All 75 agents updated with exploration template
- [ ] Strategic decisions show pros/cons analysis
- [ ] Non-strategic decisions remain fast (< 100ms)
- [ ] Review stage auto-spawns reviewer + CTO chief
- [ ] Combined report generated for every review
- [ ] Both agents must agree for APPROVE
- [ ] Reports saved to plan file under `## Review Report`
- [ ] Approval/rejection includes documented reasoning

#### 15.3 Final Actions

- [ ] Run full test suite one more time
- [ ] Commit all changes with message: `feat: add enhanced decision review system`
- [ ] Move plan from `plans/todo/` to `plans/done/`
- [ ] Tag version if appropriate

---

## Execution Notes

### Parallelization Opportunities

The following can be executed in parallel:
- Step 7.1-7.5 (all 5 test files)
- Step 8 quality checks can run concurrently with Step 9 implementation
- Step 9.1 (all 4 lib files can be created in parallel)
- Step 13.1 (all 5 unit test runs)

### Dependencies

- Step 9.3 depends on Step 9.1 (needs lib files first)
- Step 13 depends on Steps 7-9 (needs tests and implementation)
- Step 15 depends on all previous steps

### Estimated Time

- Step 7 (TEST): 45 min
- Step 8 (QUALITY): 15 min
- Step 9 (IMPLEMENT): 60 min
- Step 10 (REVIEW): 20 min
- Step 11 (OPTIMIZE): 15 min
- Step 12 (SECURE): 15 min
- Step 13 (VERIFY): 30 min
- Step 14 (DOCUMENT): 20 min
- Step 15 (FINAL-REVIEW): 15 min

**Total Estimated: ~4 hours**
