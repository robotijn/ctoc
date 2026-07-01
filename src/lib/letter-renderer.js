/**
 * Letter renderer (v8.5)
 *
 * Converts a refinement-loop letter (JSON, per Decision 6) into a
 * Markdown view for human escalation. Used when CTO Chief escalates
 * a stuck loop and a human needs to read the round's findings.
 *
 * Spec: docs/REFINEMENT_LOOP.md
 * Schema: .ctoc/architecture/refinement-loop-schema.json
 *
 * Letters in transit between agents are JSON. This module is the
 * sole point where JSON → human-readable form happens.
 */

const safeFs = require('./safe-fs');

/**
 * Render a parsed letter object as Markdown.
 * @param {Object} letter — parsed letter (matches the schema)
 * @returns {string} Markdown text
 */
function renderLetterAsMarkdown(letter) {
  const lines = [];
  lines.push(`# Letter — round ${letter.round}, phase: ${letter.phase}`);
  lines.push('');
  lines.push(`- Plan: \`${letter.plan}\``);
  lines.push(`- Letter ID: \`${letter.letter_id}\``);
  if (letter.convergence_status) {
    const c = letter.convergence_status;
    lines.push(`- Convergence: ${c.phase_issues_before ?? '?'} issues open this phase; ${c.total_issues_remaining ?? '?'} total remaining`);
  }
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(letter.summary);
  lines.push('');
  lines.push('## Issues');
  lines.push('');
  if (!letter.issues || letter.issues.length === 0) {
    lines.push('_No issues this round — phase converged._');
  } else {
    for (const issue of letter.issues) {
      lines.push(`### ${issue.id} — ${issue.severity.toUpperCase()}`);
      lines.push('');
      lines.push(`**File**: \`${issue.file}${formatLineRange(issue.line_range)}\``);
      lines.push(`**Fingerprint**: \`${issue.fingerprint}\``);
      lines.push(`**Raised by**: ${issue.raised_by.map(r => '`' + r + '`').join(' · ')}`);
      if (issue.related_findings && issue.related_findings.length > 0) {
        lines.push(`**Related**: ${issue.related_findings.map(r => '`' + r + '`').join(', ')}`);
      }
      lines.push('');
      lines.push(`**Current behaviour**:`);
      lines.push('');
      lines.push(`> ${issue.current_behaviour.replace(/\n/g, '\n> ')}`);
      lines.push('');
      lines.push(`**Expected behaviour**:`);
      lines.push('');
      lines.push(`> ${issue.expected_behaviour.replace(/\n/g, '\n> ')}`);
      lines.push('');
      lines.push(`**Test conditions** (test-writer asserts these — must not see implementation):`);
      lines.push('');
      for (const cond of issue.observable_test_conditions) {
        lines.push(`- ${cond}`);
      }
      if (issue.forbidden_in_test && issue.forbidden_in_test.length > 0) {
        lines.push('');
        lines.push(`**Forbidden in test**:`);
        lines.push('');
        for (const f of issue.forbidden_in_test) {
          lines.push(`- ${f}`);
        }
      }
      lines.push('');
    }
  }
  lines.push('---');
  lines.push('');
  lines.push('*Workflow*: test-writer writes failing tests against the test conditions (red); implementer makes them pass (green); verifier confirms 0 warnings + all tests pass before round close.');
  lines.push('');
  return lines.join('\n');
}

function formatLineRange(lineRange) {
  if (!lineRange) return '';
  if (Array.isArray(lineRange)) {
    if (lineRange.length === 1) return `:${lineRange[0]}`;
    return `:${lineRange[0]}-${lineRange[1]}`;
  }
  return `:${lineRange}`;
}

/**
 * Render an entire stuck-issues report when escalation fires.
 * @param {Object} args
 * @param {string} args.planSlug
 * @param {string} args.phase
 * @param {string} args.reason — one of: persistent | oscillation | implementer-wall | cap-exceeded
 * @param {Array} args.stuckIssues — output of detectPersistentIssues / detectOscillation / detectImplementerWall
 * @returns {string} Markdown text
 */
function renderEscalationReport({ planSlug, phase, reason, stuckIssues }) {
  const lines = [];
  lines.push(`# Refinement Loop — ESCALATION`);
  lines.push('');
  lines.push(`- Plan: \`${planSlug}\``);
  lines.push(`- Phase: ${phase}`);
  lines.push(`- Reason: ${reason}`);
  lines.push('');
  lines.push('## Stuck issues');
  lines.push('');
  if (!stuckIssues || stuckIssues.length === 0) {
    lines.push('_No stuck issues recorded._');
  } else {
    for (const issue of stuckIssues) {
      lines.push(`- **\`${issue.fingerprint}\`** — ${describeStuckIssue(issue)}`);
    }
  }
  lines.push('');
  lines.push('## What to do');
  lines.push('');
  switch (reason) {
    case 'persistent':
      lines.push('These issues have resisted multiple fix attempts. Consider: (a) re-classifying as known-issue with an explicit waiver + ticket, (b) plan-level rework (the fix needs a different approach than implementer is taking), (c) calibrating critic severity (may be over-classifying as critical).');
      break;
    case 'oscillation':
      lines.push('These issues were fixed in one round and reappeared in a later round — the fix did not hold. Likely a different change is re-introducing the issue. Investigate the lattice of related findings.');
      break;
    case 'implementer-wall':
      lines.push('Implementer has tried multiple distinct approaches without success. The issue may need a plan-level rethink rather than another code attempt.');
      break;
    case 'cap-exceeded':
      lines.push(`Phase ${phase} hit its soft round cap. Choose: extend the cap (re-engage the loop), accept remaining issues as known-issues (document waivers), or kick back to plan revision.`);
      break;
    default:
      lines.push('See journal at `.ctoc/loops/<plan>/journal.yaml` for full round-by-round detail.');
  }
  lines.push('');
  return lines.join('\n');
}

function describeStuckIssue(issue) {
  if (typeof issue.consecutive_rounds === 'number') {
    return `${issue.consecutive_rounds} consecutive rounds (rounds: ${issue.rounds_seen.join(', ')})`;
  }
  if (issue.gap_rounds) {
    return `oscillation between rounds ${issue.gap_rounds[0]} → ${issue.gap_rounds[1]}`;
  }
  if (typeof issue.distinct_attempts === 'number') {
    return `${issue.distinct_attempts} distinct fix attempts`;
  }
  return JSON.stringify(issue);
}

/**
 * Render a letter file (by path) to Markdown.
 */
function renderLetterFile(letterPath) {
  const json = JSON.parse(safeFs.readFileSync(letterPath, 'utf8'));
  return renderLetterAsMarkdown(json);
}

module.exports = {
  renderLetterAsMarkdown,
  renderEscalationReport,
  renderLetterFile,
};
