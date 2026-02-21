/**
 * Deep Explorer
 * Provides deep analysis of decision options with pros, cons, and risk assessment
 */

/**
 * @typedef {Object} OptionAnalysis
 * @property {string} name - Option name
 * @property {string[]} pros - List of advantages
 * @property {string[]} cons - List of disadvantages
 * @property {string} risk - Risk level (low/medium/high)
 * @property {string} [riskExplanation] - Explanation of risk
 */

/**
 * @typedef {Object} ExplorationResult
 * @property {string} question - The original question
 * @property {OptionAnalysis[]} options - Analyzed options
 * @property {string} recommendation - Recommended option
 * @property {string} rationale - Reasoning for recommendation
 */

// Risk level constants
const RISK_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

/**
 * Format exploration result as box-drawing output
 * @param {ExplorationResult} result - The exploration result
 * @returns {string} Formatted output
 */
function formatExploration(result) {
  const maxWidth = 65;
  const lines = [];

  // Top border
  lines.push('┌' + '─'.repeat(maxWidth) + '┐');

  // Header
  const question = result.question || 'Decision';
  const headerText = ` DECISION: ${question.substring(0, maxWidth - 12)} `;
  lines.push('│' + headerText.padEnd(maxWidth) + '│');
  lines.push('├' + '─'.repeat(maxWidth) + '┤');
  lines.push('│' + ' '.repeat(maxWidth) + '│');

  // Options
  for (const option of (result.options || [])) {
    const optionName = option.name || 'Unknown';
    lines.push('│' + ` Option: ${optionName}`.padEnd(maxWidth) + '│');

    // Pros
    if (option.pros && option.pros.length > 0) {
      lines.push('│' + '   Pros:'.padEnd(maxWidth) + '│');
      for (const pro of option.pros) {
        const proText = `     ✓ ${pro}`.substring(0, maxWidth - 2);
        lines.push('│' + proText.padEnd(maxWidth) + '│');
      }
    }

    // Cons
    if (option.cons && option.cons.length > 0) {
      lines.push('│' + '   Cons:'.padEnd(maxWidth) + '│');
      for (const con of option.cons) {
        const conText = `     ✗ ${con}`.substring(0, maxWidth - 2);
        lines.push('│' + conText.padEnd(maxWidth) + '│');
      }
    }

    // Risk
    const riskText = `   Risk: ${option.risk || 'unknown'}`;
    if (option.riskExplanation) {
      lines.push('│' + `${riskText} - ${option.riskExplanation}`.substring(0, maxWidth).padEnd(maxWidth) + '│');
    } else {
      lines.push('│' + riskText.padEnd(maxWidth) + '│');
    }

    lines.push('│' + ' '.repeat(maxWidth) + '│');
  }

  // Separator
  lines.push('│' + ' ─'.repeat(Math.floor(maxWidth / 2)) + '│');

  // Recommendation
  const recText = ` → RECOMMENDED: ${result.recommendation || 'None'}`;
  lines.push('│' + recText.padEnd(maxWidth) + '│');

  // Rationale
  if (result.rationale) {
    const rationaleText = `   Reason: ${result.rationale}`.substring(0, maxWidth - 2);
    lines.push('│' + rationaleText.padEnd(maxWidth) + '│');
  }

  // Bottom border
  lines.push('└' + '─'.repeat(maxWidth) + '┘');

  return lines.join('\n');
}

/**
 * Generate a prompt for deep exploration
 * @param {string} question - The decision question
 * @param {string[]} options - List of option names
 * @param {Object} context - Additional context
 * @returns {string} The exploration prompt
 */
function generateExplorationPrompt(question, options, context = {}) {
  const optionsList = options.map((opt, i) => `${i + 1}. ${opt}`).join('\n');

  return `Analyze this strategic decision and provide a deep exploration of the options.

QUESTION: ${question}

OPTIONS TO ANALYZE:
${optionsList}

${context.projectType ? `PROJECT TYPE: ${context.projectType}` : ''}
${context.constraints ? `CONSTRAINTS: ${context.constraints}` : ''}

For each option, provide:
1. Pros (advantages)
2. Cons (disadvantages)
3. Risk level (low/medium/high) with explanation

Then provide a clear recommendation with detailed reasoning.

Format your response as:
OPTION: {name}
PROS:
- {advantage 1}
- {advantage 2}
CONS:
- {disadvantage 1}
RISK: {low/medium/high} - {explanation}

RECOMMENDATION: {recommended option}
RATIONALE: {detailed reasoning}`;
}

/**
 * Perform deep exploration of a decision
 * @param {Object} params - Exploration parameters
 * @param {string} params.question - The decision question
 * @param {string[]} params.options - Option names
 * @param {boolean} params.skipLLM - Skip LLM call (for testing)
 * @param {Object} params.context - Additional context
 * @returns {Promise<ExplorationResult>}
 */
async function deepExplore(params) {
  const { question, options, skipLLM = false, context = {} } = params;

  // If skipping LLM (for testing), return mock data
  if (skipLLM) {
    const analyzedOptions = options.map(opt => ({
      name: typeof opt === 'string' ? opt : opt.name,
      pros: ['Example pro 1', 'Example pro 2'],
      cons: ['Example con'],
      risk: RISK_LEVELS.LOW,
      riskExplanation: 'Mock risk assessment'
    }));

    return {
      question,
      options: analyzedOptions,
      recommendation: analyzedOptions[0]?.name || options[0],
      rationale: 'Mock recommendation for testing'
    };
  }

  // In real implementation, would call LLM here
  // Generate the prompt for potential LLM call
  const prompt = generateExplorationPrompt(question, options, context);

  // For now, return structured mock response
  const analyzedOptions = options.map((opt, i) => ({
    name: typeof opt === 'string' ? opt : opt.name,
    pros: [`Strong choice for ${question}`, 'Well-documented'],
    cons: ['May have learning curve'],
    risk: i === 0 ? RISK_LEVELS.LOW : RISK_LEVELS.MEDIUM,
    riskExplanation: i === 0 ? 'Well-established option' : 'Less common choice'
  }));

  return {
    question,
    options: analyzedOptions,
    recommendation: analyzedOptions[0]?.name || options[0],
    rationale: `After analyzing the options, ${analyzedOptions[0]?.name} is recommended due to lower risk and strong community support.`
  };
}

module.exports = {
  RISK_LEVELS,
  formatExploration,
  generateExplorationPrompt,
  deepExplore
};
