/**
 * Review Reporter
 * Generates combined review reports from Code Reviewer and CTO Chief
 */

// Verdict constants
const VERDICT = {
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  NEEDS_WORK: 'NEEDS_WORK'
};

/**
 * Determine combined verdict from both reviewers
 * @param {string} reviewerVerdict - Code Reviewer's verdict
 * @param {string} ctoVerdict - CTO Chief's verdict
 * @returns {string} Combined verdict
 */
function determineCombinedVerdict(reviewerVerdict, ctoVerdict) {
  // REJECT from either = REJECT
  if (reviewerVerdict === VERDICT.REJECT || ctoVerdict === VERDICT.REJECT) {
    return VERDICT.REJECT;
  }

  // Both APPROVE = APPROVE
  if (reviewerVerdict === VERDICT.APPROVE && ctoVerdict === VERDICT.APPROVE) {
    return VERDICT.APPROVE;
  }

  // Any other combination = NEEDS_WORK
  return VERDICT.NEEDS_WORK;
}

/**
 * Format criteria table row
 * @param {string} criterion - Criterion name
 * @param {number} score - Score value
 * @param {string} notes - Notes
 * @returns {string} Formatted row
 */
function formatCriteriaRow(criterion, score, notes) {
  const scoreStr = typeof score === 'number' ? `${score}/10` : String(score);
  return `| ${criterion} | ${scoreStr} | ${notes || '-'} |`;
}

/**
 * Generate combined review report
 * @param {Object} params - Report parameters
 * @param {string} params.planName - Name of the plan
 * @param {Object} params.reviewerAssessment - Code Reviewer's assessment
 * @param {Object} params.ctoAssessment - CTO Chief's assessment
 * @returns {string} Formatted markdown report
 */
function generateCombinedReport(params) {
  const { planName, reviewerAssessment, ctoAssessment } = params;

  const lines = [];

  lines.push(`## Review Report: ${planName}`);
  lines.push('');
  lines.push(`**Generated**: ${new Date().toISOString()}`);
  lines.push('');

  // Code Reviewer Section
  lines.push('### Code Reviewer Assessment');
  lines.push('');
  lines.push(`**Quality Score: ${reviewerAssessment.qualityScore || 'N/A'}/10**`);
  lines.push('');

  // Criteria table
  if (reviewerAssessment.criteria && Object.keys(reviewerAssessment.criteria).length > 0) {
    lines.push('| Criteria | Score | Notes |');
    lines.push('|----------|-------|-------|');
    for (const [criterion, value] of Object.entries(reviewerAssessment.criteria)) {
      const score = typeof value === 'object' ? value.score : value;
      const notes = typeof value === 'object' ? value.notes : '';
      lines.push(formatCriteriaRow(criterion, score, notes));
    }
    lines.push('');
  }

  // Issues
  if (reviewerAssessment.issues && reviewerAssessment.issues.length > 0) {
    lines.push('**Issues Found:**');
    for (const issue of reviewerAssessment.issues) {
      lines.push(`- ${issue}`);
    }
    lines.push('');
  }

  lines.push(`**Verdict:** ${reviewerAssessment.verdict || 'PENDING'}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // CTO Chief Section
  lines.push('### CTO Chief Assessment');
  lines.push('');
  lines.push(`**Strategic Score: ${ctoAssessment.strategicScore || 'N/A'}/10**`);
  lines.push('');

  // Criteria table
  if (ctoAssessment.criteria && Object.keys(ctoAssessment.criteria).length > 0) {
    lines.push('| Criteria | Score | Notes |');
    lines.push('|----------|-------|-------|');
    for (const [criterion, value] of Object.entries(ctoAssessment.criteria)) {
      const score = typeof value === 'object' ? value.score : value;
      const notes = typeof value === 'object' ? value.notes : '';
      lines.push(formatCriteriaRow(criterion, score, notes));
    }
    lines.push('');
  }

  // Concerns
  if (ctoAssessment.concerns && ctoAssessment.concerns.length > 0) {
    lines.push('**Concerns:**');
    for (const concern of ctoAssessment.concerns) {
      lines.push(`- ${concern}`);
    }
    lines.push('');
  }

  lines.push(`**Verdict:** ${ctoAssessment.verdict || 'PENDING'}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Combined Recommendation
  const combinedVerdict = determineCombinedVerdict(
    reviewerAssessment.verdict,
    ctoAssessment.verdict
  );

  lines.push('### Combined Recommendation');
  lines.push('');
  lines.push(`**${combinedVerdict}**`);
  lines.push('');

  // Rationale
  if (combinedVerdict === VERDICT.APPROVE) {
    lines.push('**Rationale:**');
    lines.push('Both reviewers have approved. The implementation meets quality and strategic requirements.');
  } else if (combinedVerdict === VERDICT.REJECT) {
    lines.push('**Rationale:**');
    lines.push('At least one reviewer has rejected. See individual assessments for details.');
  } else {
    lines.push('**Rationale:**');
    lines.push('Reviewers have concerns that need to be addressed before approval.');
    lines.push('');

    // Collect all issues/concerns
    const allIssues = [
      ...(reviewerAssessment.issues || []),
      ...(ctoAssessment.concerns || [])
    ];

    if (allIssues.length > 0) {
      lines.push('**Required Changes:**');
      for (const issue of allIssues) {
        lines.push(`1. ${issue}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Remove existing review report from plan content
 * @param {string} content - Plan content
 * @returns {string} Content without review report
 */
function removeExistingReport(content) {
  // Find and remove existing review report section
  // Match from "## Review Report" to end of file
  const reportStartPattern = /\n?## Review Report[^\n]*\n[\s\S]*$/;
  return content.replace(reportStartPattern, '');
}

/**
 * Append review report to plan content
 * @param {string} content - Original plan content
 * @param {string} report - Review report to append
 * @returns {string} Updated content
 */
function appendReportToPlan(content, report) {
  // Remove existing report first
  const cleanContent = removeExistingReport(content);

  // Ensure proper spacing
  const separator = cleanContent.endsWith('\n\n') ? '' : cleanContent.endsWith('\n') ? '\n' : '\n\n';

  return cleanContent + separator + report + '\n';
}

/**
 * Spawn review agents and collect assessments
 * @param {string} planPath - Path to the plan file
 * @param {Object} options - Options
 * @returns {Promise<Object>} Combined assessments
 */
async function spawnReviewAgents(planPath, options = {}) {
  // In real implementation, this would spawn actual agents
  // For now, return mock assessments

  const mockReviewerAssessment = {
    qualityScore: 8,
    criteria: {
      requirementsMet: { score: 8, notes: 'Most requirements implemented' },
      testCoverage: { score: 9, notes: '87% coverage' },
      codeQuality: { score: 8, notes: 'Clean and readable' },
      technicalDebt: { score: 7, notes: 'Minor TODOs added' }
    },
    issues: [],
    verdict: VERDICT.APPROVE
  };

  const mockCtoAssessment = {
    strategicScore: 9,
    criteria: {
      businessAlignment: { score: 9, notes: 'Addresses user needs' },
      architecture: { score: 8, notes: 'Fits existing patterns' },
      security: { score: 10, notes: 'No vulnerabilities' },
      maintainability: { score: 8, notes: 'Well documented' }
    },
    concerns: [],
    verdict: VERDICT.APPROVE
  };

  return {
    reviewerAssessment: mockReviewerAssessment,
    ctoAssessment: mockCtoAssessment
  };
}

module.exports = {
  VERDICT,
  determineCombinedVerdict,
  generateCombinedReport,
  appendReportToPlan,
  spawnReviewAgents
};
