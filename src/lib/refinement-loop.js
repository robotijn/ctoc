/**
 * Refinement Loop orchestrator (v8.5)
 *
 * Spec: docs/REFINEMENT_LOOP.md
 * Schema: .ctoc/architecture/refinement-loop-schema.json
 *
 * Provides the data-layer + decision-layer functions that drive the
 * multi-agent iterative critic loop. Pure functions where possible;
 * file I/O via `loadJournal`, `appendRound`, `writeLetter`.
 *
 * This module does NOT itself dispatch agents — the Iron Loop integrator
 * (agents/iron-loop/iron-loop-integrator.md) uses these functions to
 * drive the loop via Claude Code's Task tool. See v6.9.7 for the wiring.
 */

const safeFs = require('./safe-fs');
const path = require('path');
const crypto = require('crypto');

// ─────────────────────────────────────────────────────────────────────
//  Constants — from docs/REFINEMENT_LOOP.md
// ─────────────────────────────────────────────────────────────────────

const PHASES = ['critical', 'medium', 'low', 'final-sweep'];

const K_PER_PHASE = {
  critical: 3,
  medium: 5,
  low: 7,
  'final-sweep': Infinity,
};

// Soft caps on round count per phase. Initial values; flagged TODO-calibrate.
// TODO(calibration): empirical from journal data after N plans (target: 30+).
const PHASE_ROUND_CAPS_DEFAULT = {
  critical: 8,
  medium: 5,
  low: 3,
  'final-sweep': 1,
};

// Loop-detection thresholds (initial — TODO-calibrate)
const PERSISTENT_ISSUE_ROUNDS = 3;     // TODO(calibration)
const IMPLEMENTER_WALL_ATTEMPTS = 3;   // TODO(calibration)
const FINGERPRINT_LINE_FUZZ = 5;       // TODO(calibration)

const CORE_CRITICS = [
  'quality/duplicate-code-detector',
  'security/sast-scanner',
  'quality/code-reviewer',
];

// Dynamic critic selection: when any file in the plan matches the pattern,
// the listed critics are added to the panel.
const DYNAMIC_CRITICS_BY_PATTERN = [
  {
    name: 'frontend',
    pattern: /\b(components|pages|frontend|ui)\b|src\/app\/(?!api\/)/i,
    critics: ['specialized/accessibility-checker', 'frontend/visual-regression-checker'],
  },
  {
    name: 'db-migration',
    pattern: /(migrations|schema|drizzle\/|prisma\/)/i,
    critics: ['specialized/database-reviewer', 'saas/multi-tenancy-row-level'],
  },
  {
    name: 'auth',
    pattern: /\bauth\b|jwt|oauth|sso|saml|oidc/i,
    critics: ['security/input-validation-checker', 'security/secrets-detector'],
  },
  {
    name: 'deploy',
    pattern: /(deploy|infra|terraform|kubernetes|k8s|helm|Dockerfile|\.github\/workflows)/i,
    critics: ['specialized/observability-checker', 'specialized/error-handler-checker'],
  },
  {
    name: 'billing',
    pattern: /(billing|stripe|payment|checkout|subscription)/i,
    critics: ['saas/stripe-subscriptions', 'specialized/resilience-checker'],
  },
  {
    name: 'ml',
    pattern: /\b(ml|model|train|inference|embedding)\b/i,
    critics: ['ai-quality/hallucination-detector', 'ai-quality/ai-code-quality-reviewer'],
  },
  {
    name: 'hipaa',
    pattern: /(health|medical|phi|patient|clinical|hipaa|ehr|emr)/i,
    critics: ['compliance/audit-log-checker', 'compliance/gdpr-compliance-checker'],
  },
  {
    name: 'pii',
    pattern: /(personal|profile|pii|dsar|ccpa|user-data|gdpr|export)/i,
    critics: ['compliance/gdpr-compliance-checker', 'security/input-validation-checker'],
  },
];

// ─────────────────────────────────────────────────────────────────────
//  Filesystem helpers
// ─────────────────────────────────────────────────────────────────────

function findProjectRoot(start = process.cwd()) {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (safeFs.existsSync(path.join(dir, '.claude-plugin')) || safeFs.existsSync(path.join(dir, '.ctoc'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

function loopDir(planSlug, root = findProjectRoot()) {
  return path.join(root, '.ctoc', 'loops', planSlug);
}

function journalPath(planSlug, root = findProjectRoot()) {
  return path.join(loopDir(planSlug, root), 'journal.yaml');
}

function letterDir(planSlug, root = findProjectRoot()) {
  return path.join(loopDir(planSlug, root), 'letters');
}

function ensureDir(d) {
  if (!safeFs.existsSync(d)) safeFs.mkdirSync(d, { recursive: true });
}

// ─────────────────────────────────────────────────────────────────────
//  Journal I/O — append-only YAML
//
//  The journal stores structured per-round records. We emit YAML with a
//  fixed shape so the minimal parser below is reliable. Each round is a
//  block under `rounds:`.
// ─────────────────────────────────────────────────────────────────────

function isoNow() {
  return new Date().toISOString();
}

function loadJournal(planSlug, root) {
  const p = journalPath(planSlug, root);
  if (!safeFs.existsSync(p)) {
    return { plan: planSlug, started_at: null, phase: null, rounds: [] };
  }
  const content = safeFs.readFileSync(p, 'utf8');
  return parseJournalYaml(content, planSlug);
}

/**
 * Append a round entry to the journal.
 * @param {string} planSlug
 * @param {Object} roundEntry — { round, phase, timestamp, critics_dispatched,
 *   findings_by_critic, letter_id, fixes_applied, tests_added, tests_result,
 *   convergence_delta }
 * @returns {Object} the updated journal
 */
function appendRound(planSlug, roundEntry, root = findProjectRoot()) {
  ensureDir(loopDir(planSlug, root));
  const journal = loadJournal(planSlug, root);
  if (!journal.started_at) journal.started_at = isoNow();
  if (!journal.phase) journal.phase = roundEntry.phase;
  journal.rounds.push({ ...roundEntry, timestamp: roundEntry.timestamp || isoNow() });
  safeFs.writeFileSync(journalPath(planSlug, root), serializeJournalYaml(journal));
  return journal;
}

function serializeJournalYaml(journal) {
  let yaml = `plan: ${journal.plan}\n`;
  yaml += `started_at: ${journal.started_at || isoNow()}\n`;
  yaml += `phase: ${journal.phase || 'critical'}\n`;
  yaml += `rounds:\n`;
  for (const r of journal.rounds) {
    yaml += `  - round: ${r.round}\n`;
    yaml += `    phase: ${r.phase}\n`;
    yaml += `    timestamp: ${r.timestamp}\n`;
    if (r.letter_id) yaml += `    letter_id: ${r.letter_id}\n`;
    if (r.critics_dispatched && r.critics_dispatched.length > 0) {
      yaml += `    critics_dispatched:\n`;
      for (const c of r.critics_dispatched) yaml += `      - ${c}\n`;
    }
    if (r.fingerprints && r.fingerprints.length > 0) {
      yaml += `    fingerprints:\n`;
      for (const fp of r.fingerprints) yaml += `      - ${fp}\n`;
    }
    if (r.fixes_applied && r.fixes_applied.length > 0) {
      yaml += `    fixes_applied:\n`;
      for (const f of r.fixes_applied) {
        yaml += `      - file: ${f.file}\n`;
        if (f.fixed_findings) {
          yaml += `        fixed_findings: [${f.fixed_findings.join(', ')}]\n`;
        }
        if (typeof f.lines_changed === 'number') yaml += `        lines_changed: ${f.lines_changed}\n`;
      }
    }
    if (r.tests_added && r.tests_added.length > 0) {
      yaml += `    tests_added:\n`;
      for (const t of r.tests_added) yaml += `      - ${t}\n`;
    }
    if (r.tests_result) {
      const tr = r.tests_result;
      yaml += `    tests_result: { added: ${tr.added || 0}, passed: ${tr.passed || 0}, failed: ${tr.failed || 0}, total: ${tr.total || 0}, regressions: ${tr.regressions || 0}, warnings: ${tr.warnings || 0} }\n`;
    }
    if (r.convergence_delta) {
      yaml += `    convergence_delta: { phase_open_before: ${r.convergence_delta.phase_open_before || 0}, phase_open_after: ${r.convergence_delta.phase_open_after || 0} }\n`;
    }
  }
  return yaml;
}

/**
 * Minimal YAML parser tailored to the journal shape produced by
 * serializeJournalYaml. Not a general YAML implementation.
 */
function parseJournalYaml(content, planSlug) {
  const journal = { plan: planSlug, started_at: null, phase: null, rounds: [] };
  const lines = content.split('\n');
  let inRounds = false;
  let currentRound = null;
  let currentListField = null;

  const flush = () => {
    if (currentRound) journal.rounds.push(currentRound);
    currentRound = null;
    currentListField = null;
  };

  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.startsWith('plan:')) journal.plan = line.split(':')[1].trim();
    else if (line.startsWith('started_at:')) journal.started_at = line.split(':').slice(1).join(':').trim();
    else if (line.startsWith('phase:') && !inRounds) journal.phase = line.split(':')[1].trim();
    else if (line.startsWith('rounds:')) inRounds = true;
    else if (inRounds && /^ {2}- round:/.test(line)) {
      flush();
      currentRound = { round: parseInt(line.match(/round:\s*(\d+)/)[1], 10) };
      currentListField = null;
    } else if (inRounds && currentRound) {
      // 4-space-indented field
      const fieldMatch = line.match(/^ {4}([a-z_]+):\s*(.*)$/);
      if (fieldMatch) {
        const [, key, val] = fieldMatch;
        if (val === '') {
          currentListField = key;
          currentRound[key] = [];
        } else if (val.startsWith('{')) {
          // inline object — parse simple {k: v, k: v}
          currentRound[key] = parseInlineObject(val);
          currentListField = null;
        } else {
          currentRound[key] = val.replace(/^["']|["']$/g, '');
          currentListField = null;
        }
      } else if (currentListField) {
        const itemMatch = line.match(/^ {6}- (.+)$/);
        if (itemMatch) {
          const item = itemMatch[1];
          if (item.includes(':')) {
            // nested object in list (e.g. fixes_applied)
            const obj = parseInlineObjectPrefix(item);
            currentRound[currentListField].push(obj);
          } else {
            currentRound[currentListField].push(item);
          }
        }
      }
    }
  }
  flush();
  return journal;
}

function parseInlineObject(s) {
  // very simple { key: value, key: value } parser
  const inner = s.replace(/^\{|\}$/g, '').trim();
  const obj = {};
  for (const pair of inner.split(/,\s*/)) {
    const [k, v] = pair.split(/:\s*/);
    if (!k) continue;
    const cleanK = k.trim();
    const cleanV = (v || '').trim();
    obj[cleanK] = /^-?\d+$/.test(cleanV) ? parseInt(cleanV, 10) : cleanV;
  }
  return obj;
}

function parseInlineObjectPrefix(s) {
  // for entries like "file: foo.py" where the line starts the object
  const obj = {};
  const colon = s.indexOf(':');
  if (colon > 0) {
    obj[s.slice(0, colon).trim()] = s.slice(colon + 1).trim();
  }
  return obj;
}

// ─────────────────────────────────────────────────────────────────────
//  Fingerprinting — stable issue identity across rounds
// ─────────────────────────────────────────────────────────────────────

function computeFingerprint(criticId, file, lineRange, findingType) {
  const lineKey = Array.isArray(lineRange) ? lineRange.join('-') : String(lineRange);
  const input = `${criticId}|${file}|${lineKey}|${findingType}`;
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 12);
}

/**
 * Fuzzy fingerprint match — compares two findings with possibly-shifted
 * line numbers. Returns true if same critic + same file + same type +
 * line within ±FINGERPRINT_LINE_FUZZ.
 */
function fingerprintsMatchFuzzy(a, b, fuzz = FINGERPRINT_LINE_FUZZ) {
  if (a.critic_id !== b.critic_id) return false;
  if (a.file !== b.file) return false;
  if (a.finding_type !== b.finding_type) return false;
  const aLine = Array.isArray(a.line_range) ? a.line_range[0] : a.line_range;
  const bLine = Array.isArray(b.line_range) ? b.line_range[0] : b.line_range;
  return Math.abs(aLine - bLine) <= fuzz;
}

// ─────────────────────────────────────────────────────────────────────
//  Loop-detection heuristics
// ─────────────────────────────────────────────────────────────────────

/**
 * Persistent issue: same fingerprint appeared in N+ consecutive rounds.
 * @returns {Array<{ fingerprint, rounds_seen }>}
 */
function detectPersistentIssues(journal, threshold = PERSISTENT_ISSUE_ROUNDS) {
  const fpAppearances = {};
  for (const round of journal.rounds) {
    const fps = round.fingerprints || [];
    for (const fp of fps) {
      if (!fpAppearances[fp]) fpAppearances[fp] = [];
      fpAppearances[fp].push(round.round);
    }
  }
  const stuck = [];
  for (const [fp, rounds] of Object.entries(fpAppearances)) {
    // Check for ≥ threshold consecutive rounds
    let maxConsecutive = 1;
    let currentRun = 1;
    for (let i = 1; i < rounds.length; i++) {
      if (rounds[i] === rounds[i - 1] + 1) {
        currentRun++;
        maxConsecutive = Math.max(maxConsecutive, currentRun);
      } else {
        currentRun = 1;
      }
    }
    if (maxConsecutive >= threshold) {
      stuck.push({ fingerprint: fp, consecutive_rounds: maxConsecutive, rounds_seen: rounds });
    }
  }
  return stuck;
}

/**
 * Oscillation: fingerprint appeared, was absent for ≥ 1 round, then reappeared.
 * @returns {Array<{ fingerprint, gap_rounds }>}
 */
function detectOscillation(journal) {
  const fpAppearances = {};
  for (const round of journal.rounds) {
    const fps = round.fingerprints || [];
    for (const fp of fps) {
      if (!fpAppearances[fp]) fpAppearances[fp] = [];
      fpAppearances[fp].push(round.round);
    }
  }
  const oscillating = [];
  for (const [fp, rounds] of Object.entries(fpAppearances)) {
    for (let i = 1; i < rounds.length; i++) {
      if (rounds[i] - rounds[i - 1] >= 2) {
        oscillating.push({ fingerprint: fp, gap_rounds: [rounds[i - 1], rounds[i]] });
        break;
      }
    }
  }
  return oscillating;
}

/**
 * Implementer wall: same fingerprint persisted across ≥ N rounds where
 * the implementer made distinct fix attempts on the same file each round.
 * Approximation: persistent issue + ≥ N rounds with that file in fixes_applied.
 */
function detectImplementerWall(journal, attempts = IMPLEMENTER_WALL_ATTEMPTS) {
  const persistent = detectPersistentIssues(journal, 2);
  const walls = [];
  for (const stuck of persistent) {
    // Look at rounds where this fingerprint was raised
    const fingerprintRounds = stuck.rounds_seen;
    let distinctAttempts = 0;
    for (const r of journal.rounds) {
      if (!fingerprintRounds.includes(r.round)) continue;
      if (r.fixes_applied && r.fixes_applied.length > 0) {
        distinctAttempts++;
      }
    }
    if (distinctAttempts >= attempts) {
      walls.push({ fingerprint: stuck.fingerprint, distinct_attempts: distinctAttempts });
    }
  }
  return walls;
}

// ─────────────────────────────────────────────────────────────────────
//  Critic panel selection (Decision 1)
// ─────────────────────────────────────────────────────────────────────

/**
 * Select the panel for a plan: 3 core + 2-4 dynamic critics matched
 * against the plan's `files:` declaration globs.
 * @param {Array<string>} planFiles — globs from plan frontmatter
 * @returns {Array<string>} agent paths
 */
function selectPanel(planFiles) {
  const dynamic = new Set();
  for (const file of planFiles) {
    for (const rule of DYNAMIC_CRITICS_BY_PATTERN) {
      if (rule.pattern.test(file)) {
        for (const c of rule.critics) dynamic.add(c);
      }
    }
  }
  return [...CORE_CRITICS, ...dynamic];
}

// ─────────────────────────────────────────────────────────────────────
//  Gating (Decision 7) — should the loop run for this plan?
// ─────────────────────────────────────────────────────────────────────

const ESCAPE_PHRASES = ['hotfix', 'trivial fix', 'urgent', 'quick fix', 'trivial change', 'skip refinement'];

function shouldRunLoop({ effortLevel = 'medium', files = [], recentMessages = [] } = {}) {
  // Escape phrases bypass
  for (const msg of recentMessages) {
    for (const phrase of ESCAPE_PHRASES) {
      const re = new RegExp(`\\b${phrase.replace(/\s+/g, '\\s+')}\\b`, 'i');
      if (re.test(msg)) return { run: false, reason: 'escape-phrase', matched: phrase };
    }
  }
  // Effort-tier trigger
  if (effortLevel === 'high' || effortLevel === 'xhigh') {
    return { run: true, reason: 'effort-tier', effort: effortLevel };
  }
  // Risk-surface trigger
  const triggers = loadTriggers();
  for (const file of files) {
    for (const glob of triggers.trigger_loop_when_files_match) {
      if (globMatch(file, glob)) {
        return { run: true, reason: 'risk-surface', file, glob };
      }
    }
  }
  return { run: false, reason: 'no-trigger' };
}

function loadTriggers(root = findProjectRoot()) {
  const p = path.join(root, '.ctoc', 'config', 'refinement-triggers.yaml');
  if (!safeFs.existsSync(p)) return { trigger_loop_when_files_match: [], bypass_escape_phrases: ESCAPE_PHRASES };
  const content = safeFs.readFileSync(p, 'utf8');
  const triggers = [];
  let inTriggers = false;
  for (const rawLine of content.split('\n')) {
    // Strip inline YAML comments (everything from the first `#` onward).
    // None of our globs contain `#`, so this is safe.
    const line = rawLine.split('#')[0].replace(/\s+$/, '');
    if (line.startsWith('trigger_loop_when_files_match:')) {
      inTriggers = true;
      continue;
    }
    if (inTriggers) {
      if (/^[a-z_]/.test(line)) break; // next top-level key
      const m = line.match(/^\s+- "?(.+?)"?\s*$/);
      if (m) triggers.push(m[1]);
    }
  }
  return { trigger_loop_when_files_match: triggers, bypass_escape_phrases: ESCAPE_PHRASES };
}

function globMatch(filePath, glob) {
  // Minimal globstar match: ** matches any path segment(s), * matches within a segment
  const re = '^' + glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__DOUBLE_STAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLE_STAR__/g, '.*') + '$';
  return new RegExp(re).test(filePath);
}

// ─────────────────────────────────────────────────────────────────────
//  Letter generation (Decision 6 — JSON)
// ─────────────────────────────────────────────────────────────────────

function generateUlid(now = Date.now()) {
  // 26-char Crockford Base32 ULID
  const alpha = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let ts = '';
  let t = now;
  for (let i = 0; i < 10; i++) {
    ts = alpha[t % 32] + ts;
    t = Math.floor(t / 32);
  }
  const rand = crypto.randomBytes(10);
  let r = '';
  for (let i = 0; i < 16; i++) r += alpha[rand[i % 10] % 32];
  return ts + r;
}

/**
 * Build a letter JSON object for one round.
 * Validates against the schema's required structure (without running
 * a full JSON Schema validator — we keep the shape correct by construction).
 */
function buildLetter({ planSlug, round, phase, summary, issues }) {
  if (!PHASES.includes(phase)) throw new Error(`phase must be one of: ${PHASES.join(', ')}`);
  if (!summary || summary.length === 0) throw new Error('summary is required (1+ chars)');
  if (!Array.isArray(issues)) throw new Error('issues must be an array');
  const K = K_PER_PHASE[phase];
  if (K !== Infinity && issues.length > K * CORE_CRITICS.length * 2) {
    // Soft check: panel size × K × 2-margin
    // Just warn via metadata; don't throw
  }
  for (const issue of issues) {
    if (!issue.id || !issue.fingerprint || !issue.severity || !issue.file) {
      throw new Error(`issue missing required fields: ${JSON.stringify(issue)}`);
    }
    if (!['critical', 'medium', 'low'].includes(issue.severity)) {
      throw new Error(`invalid severity: ${issue.severity} (must be critical/medium/low — warnings classify as critical)`);
    }
    if (!Array.isArray(issue.observable_test_conditions) || issue.observable_test_conditions.length === 0) {
      throw new Error(`issue ${issue.id} missing observable_test_conditions (required for test-writer)`);
    }
    if (!Array.isArray(issue.raised_by) || issue.raised_by.length === 0) {
      throw new Error(`issue ${issue.id} missing raised_by`);
    }
  }
  return {
    letter_id: generateUlid(),
    round,
    phase,
    plan: planSlug,
    summary,
    convergence_status: {
      phase_issues_before: issues.length,
      phase_issues_after: 0, // filled in after the round
      total_issues_remaining: issues.length,
    },
    issues,
  };
}

function writeLetter(planSlug, letter, root = findProjectRoot()) {
  ensureDir(letterDir(planSlug, root));
  const p = path.join(letterDir(planSlug, root), `${letter.letter_id}.json`);
  safeFs.writeFileSync(p, JSON.stringify(letter, null, 2) + '\n');
  return p;
}

// ─────────────────────────────────────────────────────────────────────
//  Phase + round-cap logic
// ─────────────────────────────────────────────────────────────────────

function phaseConverged(roundFindings, phase) {
  for (const critic of Object.keys(roundFindings)) {
    const findings = (roundFindings[critic] || []).filter(f => f.severity === effectivePhaseSeverity(phase, f.severity));
    if (phase === 'final-sweep') {
      if (findings.length > 0) return false;
    } else {
      if (findings.length > 0) return false; // any phase-matched finding blocks exit
    }
  }
  return true;
}

function effectivePhaseSeverity(phase, severity) {
  // For final-sweep, all severities count. For named phases, severity must match.
  if (phase === 'final-sweep') return severity;
  return phase;
}

function shouldEscalate(journal, phase, phaseCaps = PHASE_ROUND_CAPS_DEFAULT) {
  const cap = phaseCaps[phase];
  if (cap === undefined) return false;
  const phaseRounds = journal.rounds.filter(r => r.phase === phase).length;
  return phaseRounds >= cap;
}

// ─────────────────────────────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────────────────────────────

module.exports = {
  // Constants
  PHASES,
  K_PER_PHASE,
  PHASE_ROUND_CAPS_DEFAULT,
  CORE_CRITICS,
  DYNAMIC_CRITICS_BY_PATTERN,
  PERSISTENT_ISSUE_ROUNDS,
  IMPLEMENTER_WALL_ATTEMPTS,

  // Filesystem
  findProjectRoot,
  loopDir,
  journalPath,

  // Journal
  loadJournal,
  appendRound,

  // Fingerprinting
  computeFingerprint,
  fingerprintsMatchFuzzy,

  // Loop-detection heuristics
  detectPersistentIssues,
  detectOscillation,
  detectImplementerWall,

  // Panel + gating
  selectPanel,
  shouldRunLoop,
  loadTriggers,
  globMatch,

  // Letter
  buildLetter,
  writeLetter,
  generateUlid,

  // Phase
  phaseConverged,
  shouldEscalate,
};
