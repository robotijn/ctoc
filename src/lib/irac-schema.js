/**
 * IRAC Output Schema (v6.9.27)
 *
 * Issue-Rule-Application-Conclusion is the standard legal-memo structure
 * (American Bar Association). When `irac_compliance_output` is active,
 * every compliance-skill finding must emit this structure so the output
 * is directly usable by in-house counsel and machine-parseable for the
 * dispatch audit trail.
 *
 * Cross-platform Node 18+, no native deps.
 *
 * References:
 *   - American Bar Association — IRAC explained:
 *     https://www.americanbar.org/groups/law_students/resources/student-lawyer/student-essentials/legal-reasoning-its-all-about-irac/
 */

/**
 * IRAC finding shape:
 *
 * {
 *   id: 'gdpr-art17-cascade-missing',
 *   issue: 'Does the delete-user endpoint cascade across the data graph?',
 *   rule: 'GDPR Article 17 requires erasure to extend to all controllers and processors holding the data, including backups within the retention window.',
 *   application: 'The endpoint deletes the users row but the orders table\'s user_id remains, and the analytics replication lag of 6 hours means the row may be re-imported.',
 *   conclusion: 'Non-compliant. Add a deletion job to the analytics replicator and document the 6-hour propagation window in the privacy notice.',
 *   severity: 'critical' | 'high' | 'medium' | 'low' | 'info',
 *   citations: [{ title, url }],
 *   evidence: [{ file, line, snippet }],
 * }
 */

const REQUIRED_FIELDS = ['id', 'issue', 'rule', 'application', 'conclusion', 'severity'];
const ALLOWED_SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'info']);

/**
 * Validate that a finding conforms to the IRAC schema.
 * Returns `{ ok: true }` or `{ ok: false, errors: [...] }`.
 */
function validate(finding) {
  if (!finding || typeof finding !== 'object') {
    return { ok: false, errors: ['finding must be an object'] };
  }
  const errors = [];
  for (const field of REQUIRED_FIELDS) {
    if (!finding[field]) errors.push(`missing required field: ${field}`);
  }
  if (finding.severity && !ALLOWED_SEVERITIES.has(finding.severity)) {
    errors.push(`invalid severity ${finding.severity}; allowed: ${[...ALLOWED_SEVERITIES].join(', ')}`);
  }
  if (finding.citations) {
    if (!Array.isArray(finding.citations)) errors.push('citations must be an array');
    else for (const c of finding.citations) {
      if (!c.url) errors.push(`citation missing url: ${JSON.stringify(c)}`);
    }
  }
  if (finding.issue && !finding.issue.includes('?')) {
    errors.push('issue must be phrased as a question ending in ?');
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * Validate every finding in a compliance-skill output.
 * Returns aggregate result.
 */
function validateAll(findings) {
  if (!Array.isArray(findings)) {
    return { ok: false, errors: ['findings must be an array'] };
  }
  const allErrors = [];
  for (let i = 0; i < findings.length; i++) {
    const r = validate(findings[i]);
    if (!r.ok) allErrors.push({ index: i, errors: r.errors });
  }
  return allErrors.length === 0 ? { ok: true } : { ok: false, errors: allErrors };
}

/**
 * Render a finding as Markdown for human consumption.
 */
function toMarkdown(finding) {
  const cits = (finding.citations || []).map(c => `- [${c.title || c.url}](${c.url})`).join('\n');
  const evid = (finding.evidence || []).map(e => `- \`${e.file}:${e.line}\`${e.snippet ? `\n  \`\`\`\n  ${e.snippet}\n  \`\`\`` : ''}`).join('\n');
  return [
    `## ${finding.id}  (severity: ${finding.severity})`,
    ``,
    `### Issue`,
    finding.issue,
    ``,
    `### Rule`,
    finding.rule,
    ``,
    `### Application`,
    finding.application,
    ``,
    `### Conclusion`,
    finding.conclusion,
    ``,
    cits ? `### Citations\n${cits}\n` : '',
    evid ? `### Evidence\n${evid}\n` : '',
  ].filter(Boolean).join('\n');
}

module.exports = {
  REQUIRED_FIELDS,
  ALLOWED_SEVERITIES,
  validate,
  validateAll,
  toMarkdown,
};
