/**
 * Persona-aware question routing (v8.3)
 *
 * Spec: docs/PERSONA_ROUTING.md
 *
 * The core invariant: **a question is asked only when the current persona can
 * answer it**. A programmer never sees pricing questions; a founder never sees
 * "Postgres vs MongoDB". Questions that can't be answered by the current
 * persona are DEFERRED to .ctoc/inbox/questions/ with `awaits_persona: <role>`
 * so the right user answers later (async-overnight pattern).
 *
 * Usage (in an agent):
 *
 *   const { loadPersona, getApplicableQuestions, recordAnswer, deferQuestion } = require('./persona');
 *   const persona = loadPersona();
 *   const questions = getApplicableQuestions({ phase: 'vision', persona });
 *   // ... ask each question, capture answers ...
 *   recordAnswer('vision/problem', userAnswer);
 *   // ... for questions outside persona scope ...
 *   deferQuestion('canvas/pricing-model', { awaitsPersona: 'founder' });
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const PERSONA_PATH = path.join(ROOT, '.ctoc', 'session', 'persona.yaml');
const ANSWERS_PATH = path.join(ROOT, '.ctoc', 'session', 'answers.yaml');
const QUESTIONS_CATALOG = path.join(ROOT, '.ctoc', 'templates', 'questions.yaml');
const INBOX_QUESTIONS = path.join(ROOT, '.ctoc', 'inbox', 'questions');

// Lazy require so persona.js can be loaded standalone
function getYaml() {
  // Re-use the zero-dep YAML from v8-dispatcher
  try { return require('./v8-dispatcher'); } catch { return null; }
}

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

function readFile(p, fallback = null) {
  if (!fs.existsSync(p)) return fallback;
  try { return fs.readFileSync(p, 'utf8'); } catch { return fallback; }
}

// ─────────────────────────────────────────────────────────────────────
//  Persona model — what each role can answer
// ─────────────────────────────────────────────────────────────────────

const KNOWN_PERSONAS = {
  founder: {
    label: 'Founder',
    description: 'Owns business outcome. Decides pricing, market, target customer.',
    can_answer: ['vision', 'canvas', 'pricing', 'market', 'target_users', 'business_model', 'unit_economics', 'compliance_scope', 'success_criteria'],
    cannot_answer: ['tech_stack', 'db_schema', 'deployment_target', 'code_style', 'test_framework'],
  },
  'technical-founder': {
    label: 'Technical founder',
    description: 'Wears both hats — answers business AND technical questions.',
    can_answer: ['*'], // can answer everything
    cannot_answer: [],
  },
  pm: {
    label: 'Product Manager',
    description: 'Owns feature definition + user value. Defers pricing to founder.',
    can_answer: ['vision', 'target_users', 'success_criteria', 'ux_flow', 'feature_priority', 'acceptance_criteria'],
    cannot_answer: ['tech_stack', 'db_schema', 'pricing', 'unit_economics'],
  },
  programmer: {
    label: 'Programmer / IC engineer',
    description: 'Builds the code. Defers business + architecture to other roles.',
    can_answer: ['tech_stack', 'test_framework', 'code_style', 'success_criteria'],
    cannot_answer: ['pricing', 'market', 'unit_economics', 'business_model', 'db_schema'],
  },
  architect: {
    label: 'Architect',
    description: 'Owns system design + integration. Defers product strategy.',
    can_answer: ['tech_stack', 'db_schema', 'deployment_target', 'integration_design', 'scalability_targets'],
    cannot_answer: ['pricing', 'market', 'unit_economics', 'business_model', 'ux_flow'],
  },
  designer: {
    label: 'Designer',
    description: 'Owns UX + IA + a11y + brand. Defers technical + business.',
    can_answer: ['ux_flow', 'ia_structure', 'accessibility', 'copy_tone', 'brand'],
    cannot_answer: ['pricing', 'tech_stack', 'db_schema', 'unit_economics'],
  },
  hobbyist: {
    label: 'Hobbyist / learner',
    description: 'Just wants something working. Minimum questions; system defaults aggressively.',
    can_answer: ['vision', 'success_criteria'],
    cannot_answer: ['pricing', 'unit_economics', 'compliance_scope'],
    auto_accept_defaults: true,
  },
  agency: {
    label: 'Agency / contractor',
    description: 'Building for a client. Some answers belong to the client, not them.',
    can_answer: ['tech_stack', 'success_criteria', 'integration_design'],
    cannot_answer: ['pricing', 'market', 'business_model'],
    defer_to_persona: 'founder', // their client
  },
};

// ─────────────────────────────────────────────────────────────────────
//  Persona I/O
// ─────────────────────────────────────────────────────────────────────

function loadPersona() {
  const content = readFile(PERSONA_PATH);
  if (!content) return null;
  const m = content.match(/^primary_role:\s*(\S+)/m);
  const conf = content.match(/^confidence:\s*(\S+)/m);
  const sec = [...content.matchAll(/^\s*-\s+role:\s*(\S+)/gm)].map(x => x[1]);
  return {
    primary: m ? m[1] : null,
    secondary: sec.filter(r => r !== (m && m[1])),
    confidence: conf ? conf[1] : 'unknown',
    raw: content,
  };
}

function savePersona(persona) {
  ensureDir(path.dirname(PERSONA_PATH));
  const now = new Date().toISOString();
  const primary = persona.primary || persona.primary_role;
  const secondary = persona.secondary || [];
  const confidence = persona.confidence || 'high';
  const signals = persona.signals || [];
  let yaml = `schema_version: 1\nclassified_at: ${now}\nclassifier: ${persona.classifier || 'agents/coordinator/persona-classifier'}\nprimary_role: ${primary}\nconfidence: ${confidence}\n`;
  if (secondary.length > 0) {
    yaml += `secondary_roles:\n`;
    for (const r of secondary) yaml += `  - role: ${r}\n`;
  }
  if (signals.length > 0) {
    yaml += `signals:\n`;
    for (const s of signals) yaml += `  - ${JSON.stringify(s)}\n`;
  }
  fs.writeFileSync(PERSONA_PATH, yaml);
  return { primary, secondary, confidence, signals };
}

// ─────────────────────────────────────────────────────────────────────
//  Question catalog — parsed lazily, cached
// ─────────────────────────────────────────────────────────────────────

let _questionCatalogCache = null;
function loadQuestionCatalog() {
  if (_questionCatalogCache) return _questionCatalogCache;
  const content = readFile(QUESTIONS_CATALOG);
  if (!content) { _questionCatalogCache = []; return []; }
  const questions = [];
  const blocks = content.split(/^---\s*$/m).map(b => b.trim()).filter(Boolean);
  // Actually our catalog is a single YAML doc with a `questions:` list — parse simply
  const qMatches = [...content.matchAll(/^\s*-\s+id:\s*(\S+)\s*\n([\s\S]*?)(?=^\s*-\s+id:|\Z)/gm)];
  for (const m of qMatches) {
    const id = m[1];
    const body = m[2];
    const get = (key) => {
      const r = body.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm'));
      return r ? r[1].trim() : null;
    };
    const getList = (key) => {
      const re = new RegExp(`^\\s*${key}:\\s*\\n((?:\\s+-\\s+\\S.*\\n?)+)`, 'm');
      const r = body.match(re);
      if (!r) return [];
      return [...r[1].matchAll(/^\s+-\s+(.+)$/gm)].map(x => x[1].trim());
    };
    questions.push({
      id,
      phase: get('phase'),
      default_phrasing: get('default_phrasing'),
      personas: getList('personas'),
      deferred_for: getList('deferred_for'),
      defer_to_persona: get('defer_to_persona'),
      required: get('required') === 'true',
      optional: get('optional') === 'true',
      category: get('category'),
    });
  }
  _questionCatalogCache = questions;
  return questions;
}

// ─────────────────────────────────────────────────────────────────────
//  The routing logic
// ─────────────────────────────────────────────────────────────────────

function personaCan(personaRole, questionId, question) {
  const profile = KNOWN_PERSONAS[personaRole];
  if (!profile) return false;
  if (profile.can_answer.includes('*')) return true;
  const category = question.category || questionId.split('/')[0];
  if (profile.cannot_answer.includes(category)) return false;
  if (profile.can_answer.includes(category)) return true;
  // If the catalog explicitly lists this persona → can ask
  if (question.personas && question.personas.includes(personaRole)) return true;
  return false;
}

function shouldAskQuestion(question, persona, phase) {
  if (!persona) return false;
  if (question.phase && question.phase !== phase) return false;
  // Already answered?
  if (isAnswered(question.id)) return false;

  const roles = [persona.primary, ...(persona.secondary || [])].filter(Boolean);
  for (const role of roles) {
    if (personaCan(role, question.id, question)) {
      // Check explicit deferral list
      if (question.deferred_for && question.deferred_for.includes(role)) continue;
      return true;
    }
  }
  return false;
}

function getApplicableQuestions({ phase, persona }) {
  const catalog = loadQuestionCatalog();
  return catalog
    .filter(q => shouldAskQuestion(q, persona, phase))
    .map(q => ({ ...q, phrasing: phrasingFor(q, persona) }));
}

function phrasingFor(question, persona) {
  // For now, return default_phrasing. Phase 2 will add per-persona overrides
  // from the catalog YAML.
  return question.default_phrasing || `(no phrasing) ${question.id}`;
}

// ─────────────────────────────────────────────────────────────────────
//  Answer persistence — never re-ask
// ─────────────────────────────────────────────────────────────────────

function loadAnswers() {
  const content = readFile(ANSWERS_PATH, '');
  const answers = {};
  for (const line of (content || '').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    answers[key] = value;
  }
  return answers;
}

function recordAnswer(questionId, answer) {
  ensureDir(path.dirname(ANSWERS_PATH));
  const existing = loadAnswers();
  existing[questionId] = String(answer).replace(/\n/g, ' ').replace(/"/g, '\\"');
  let yaml = '# Persisted answers — checked before re-asking any question.\n';
  for (const [k, v] of Object.entries(existing)) {
    yaml += `${k}: "${v}"\n`;
  }
  fs.writeFileSync(ANSWERS_PATH, yaml);
}

function isAnswered(questionId) {
  return Object.keys(loadAnswers()).includes(questionId);
}

// ─────────────────────────────────────────────────────────────────────
//  Question deferral — pushes to inbox so the right persona answers later
// ─────────────────────────────────────────────────────────────────────

function deferQuestion(questionId, { awaitsPersona, reason, sourcePlan = null, sourceStep = null }) {
  ensureDir(INBOX_QUESTIONS);
  const slug = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const filePath = path.join(INBOX_QUESTIONS, `${slug}.md`);
  const content = `---
id: ${slug}
question_id: ${questionId}
created: ${new Date().toISOString()}
awaits_persona: ${awaitsPersona}
source_plan: ${sourcePlan || ''}
source_step: ${sourceStep || ''}
status: open
---

## Question deferred

**Question**: ${questionId}
**Awaits persona**: ${awaitsPersona}
**Reason**: ${reason || 'Outside current persona scope'}

A user with the ${awaitsPersona} role should answer this when they next interact.
`;
  fs.writeFileSync(filePath, content);
  return { id: slug, path: filePath };
}

function listDeferredQuestions({ awaitsPersona } = {}) {
  if (!fs.existsSync(INBOX_QUESTIONS)) return [];
  const files = fs.readdirSync(INBOX_QUESTIONS).filter(f => f.endsWith('.md'));
  const out = [];
  for (const f of files) {
    const content = fs.readFileSync(path.join(INBOX_QUESTIONS, f), 'utf8');
    const get = (k) => {
      const m = content.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'));
      return m ? m[1].trim() : null;
    };
    const status = get('status');
    if (status !== 'open') continue;
    const awaits = get('awaits_persona');
    if (awaitsPersona && awaits !== awaitsPersona) continue;
    out.push({
      id: get('id'),
      question_id: get('question_id'),
      awaits_persona: awaits,
      source_plan: get('source_plan'),
      source_step: get('source_step'),
      path: path.join(INBOX_QUESTIONS, f),
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
//  Classification helper — detect persona from text signals
// ─────────────────────────────────────────────────────────────────────

const PERSONA_SIGNALS = {
  founder: [
    /\b(founder|founding|i'm starting|i started|my (company|startup|saas|business))\b/i,
    /\b(pricing|monetiz|customers? would pay|revenue|MRR|ARR)\b/i,
    /\b(target market|product[- ]market fit|PMF|TAM)\b/i,
  ],
  'technical-founder': [
    /\b(technical (co)?founder|solo founder.*(building|coding)|i'm building it myself)\b/i,
  ],
  pm: [
    /\b(product manager|PM|user stor(y|ies)|acceptance criteria|roadmap|backlog)\b/i,
  ],
  programmer: [
    /\b(implement|refactor|debug|fix.*bug|merge|PR|commit|test pass)\b/i,
    /\b(typescript|python|rust|node|react|prisma|drizzle)\b/i,
  ],
  architect: [
    /\b(architect|system design|microservic|monolith|distributed|consistency|scalab)\b/i,
  ],
  designer: [
    /\b(designer|UX|UI|figma|wireframe|prototype|accessibility|a11y)\b/i,
  ],
  hobbyist: [
    /\b(hobby|side project|learning|just want.*working|tinkering)\b/i,
  ],
  agency: [
    /\b(agency|client work|contracting|for my client|on behalf of)\b/i,
  ],
};

function classifyFromText(text) {
  if (!text || typeof text !== 'string') return null;
  const scores = {};
  for (const [role, patterns] of Object.entries(PERSONA_SIGNALS)) {
    let score = 0;
    const signals = [];
    for (const re of patterns) {
      const m = text.match(re);
      if (m) {
        score += 1;
        signals.push(m[0]);
      }
    }
    if (score > 0) scores[role] = { score, signals };
  }
  if (Object.keys(scores).length === 0) return null;
  const sorted = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);
  const primary = sorted[0][0];
  const secondary = sorted.slice(1).filter(([, s]) => s.score >= sorted[0][1].score - 1).map(([r]) => r);
  const confidence = sorted[0][1].score >= 2 ? 'high' : sorted[0][1].score === 1 ? 'medium' : 'low';
  return {
    primary,
    secondary,
    confidence,
    signals: sorted[0][1].signals,
  };
}

module.exports = {
  // Persona profiles
  KNOWN_PERSONAS,
  // Persona I/O
  loadPersona,
  savePersona,
  // Catalog
  loadQuestionCatalog,
  // Routing
  shouldAskQuestion,
  getApplicableQuestions,
  personaCan,
  phrasingFor,
  // Answers
  loadAnswers,
  recordAnswer,
  isAnswered,
  // Deferral
  deferQuestion,
  listDeferredQuestions,
  // Classification
  classifyFromText,
  PERSONA_SIGNALS,
};
