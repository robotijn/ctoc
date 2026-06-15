/**
 * AI Provenance Stamp (v6.9.27)
 *
 * European Union Artificial Intelligence Act Article 50 (effective 2 August
 * 2026) requires that synthetic content be machine-readable as AI-generated
 * and that humans be informed when they interact with AI systems.
 *
 * This library:
 *   1. Wraps code-generation operations with a provenance record.
 *   2. Appends each generation event to `.ctoc/ai-provenance.jsonl` (append-only).
 *   3. Optionally stamps a machine-readable comment header into generated files
 *      (only when the file is a code file AND the regulatory regime requires it).
 *
 * Activated when the `ai_provenance_stamp` control is enabled.
 *
 * Cross-platform Node 18+, no native deps.
 *
 * References:
 *   - European Union Artificial Intelligence Act Article 50:
 *     https://artificialintelligenceact.eu/article/50/
 *   - Coalition for Content Provenance and Authenticity (C2PA) specification:
 *     https://c2pa.org/specifications/specifications/
 */

const fs = require('fs');
const path = require('path');

const PROVENANCE_LOG = '.ctoc/ai-provenance.jsonl';

// File extensions where a provenance comment is safe to embed.
const COMMENTABLE_EXTENSIONS = {
  '.js':  { open: '// ', close: '' },
  '.ts':  { open: '// ', close: '' },
  '.jsx': { open: '// ', close: '' },
  '.tsx': { open: '// ', close: '' },
  '.go':  { open: '// ', close: '' },
  '.rs':  { open: '// ', close: '' },
  '.java':{ open: '// ', close: '' },
  '.cs':  { open: '// ', close: '' },
  '.c':   { open: '// ', close: '' },
  '.cc':  { open: '// ', close: '' },
  '.cpp': { open: '// ', close: '' },
  '.h':   { open: '// ', close: '' },
  '.hpp': { open: '// ', close: '' },
  '.py':  { open: '# ',  close: '' },
  '.rb':  { open: '# ',  close: '' },
  '.sh':  { open: '# ',  close: '' },
  '.yaml':{ open: '# ',  close: '' },
  '.yml': { open: '# ',  close: '' },
  '.toml':{ open: '# ',  close: '' },
  '.md':  { open: '<!-- ', close: ' -->' },
  '.html':{ open: '<!-- ', close: ' -->' },
  '.xml': { open: '<!-- ', close: ' -->' },
  '.sql': { open: '-- ',   close: '' },
};

/**
 * Log a provenance event to the append-only log.
 *
 * @param {string} projectRoot
 * @param {Object} event - {target_path, model_id, model_version, dispatch_id, intent, content_sha256}
 * @returns {Object} the recorded event with timestamp
 */
function logEvent(projectRoot, event) {
  ensureDir(path.dirname(path.join(projectRoot, PROVENANCE_LOG)));
  const recorded = {
    timestamp: new Date().toISOString(),
    target_path: event.target_path,
    model_id: event.model_id || '(unspecified)',
    model_version: event.model_version || '(unspecified)',
    dispatch_id: event.dispatch_id || null,
    intent: event.intent || 'generation',
    content_sha256: event.content_sha256 || null,
  };
  fs.appendFileSync(
    path.join(projectRoot, PROVENANCE_LOG),
    JSON.stringify(recorded) + '\n'
  );
  return recorded;
}

/**
 * Stamp a provenance comment at the top of a generated file. Returns the
 * stamped content. Does NOT modify the file — caller writes the returned
 * content.
 *
 * @param {string} content
 * @param {string} filepath - so we can choose the right comment syntax
 * @param {Object} attribution - {model_id, model_version, dispatch_id?, generated_at?}
 */
function stampContent(content, filepath, attribution) {
  const ext = path.extname(filepath).toLowerCase();
  const syntax = COMMENTABLE_EXTENSIONS[ext];
  if (!syntax) return content; // unknown extension: no stamp

  const timestamp = attribution.generated_at || new Date().toISOString();
  const banner = [
    `${syntax.open}AI-GENERATED-PROVENANCE-START${syntax.close}`,
    `${syntax.open}Model: ${attribution.model_id || '(unspecified)'} ${attribution.model_version || ''}${syntax.close}`.trim(),
    `${syntax.open}Generated: ${timestamp}${syntax.close}`,
    attribution.dispatch_id ? `${syntax.open}Dispatch: ${attribution.dispatch_id}${syntax.close}` : null,
    `${syntax.open}Disclosure: This file was authored or substantially edited by an artificial-intelligence assistant.${syntax.close}`,
    `${syntax.open}Required disclosure per European Union Artificial Intelligence Act Article 50 (effective 2 August 2026).${syntax.close}`,
    `${syntax.open}AI-GENERATED-PROVENANCE-END${syntax.close}`,
    '',
  ].filter(Boolean).join('\n');

  // If the file already has a shebang line, insert the banner after it.
  if (content.startsWith('#!')) {
    const firstNewline = content.indexOf('\n');
    return content.slice(0, firstNewline + 1) + banner + content.slice(firstNewline + 1);
  }
  return banner + content;
}

/**
 * Check if a file appears to carry a provenance stamp already.
 */
function isStamped(content) {
  return content.includes('AI-GENERATED-PROVENANCE-START');
}

/**
 * Return all provenance events recorded since `sinceISO`.
 */
function getEventsSince(projectRoot, sinceISO) {
  const logPath = path.join(projectRoot, PROVENANCE_LOG);
  if (!fs.existsSync(logPath)) return [];
  const cutoff = new Date(sinceISO).getTime();
  return fs.readFileSync(logPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line))
    .filter(e => new Date(e.timestamp).getTime() >= cutoff);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

module.exports = {
  COMMENTABLE_EXTENSIONS,
  logEvent,
  stampContent,
  isStamped,
  getEventsSince,
  PROVENANCE_LOG,
};
