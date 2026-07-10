/**
 * CU5-s5 — Tier-3 wrapper coverage-completeness gate.
 *
 * Proves the whole CU5 scope landed: every skills/**\/SKILL.md is now
 * dispatch-reachable through an agent wrapper (thin `target_skill:` redirect)
 * or a rich agent (`extends_skill:`), OR is on the ledger's documented NO-WRAP
 * set (empty for CU5). No skill may be silently uncovered.
 *
 * ZERO doubles: every assertion walks the REAL `skills/` and `agents/` trees on
 * disk and reads the REAL ledger. The set-difference case fails LOUDLY, listing
 * any orphan skill — there is no silent green.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AGENTS_DIR = path.join(ROOT, 'agents');
const LEDGER_PATH = path.join(ROOT, '.ctoc', 'audit', 'corpus-audit-2026-06-15.json');

// Guard target_skill / extends_skill values before any path.join (no traversal).
const SKILL_REF_RX = /^[a-z0-9-]+\/[a-z0-9-]+$/;

// The 12 skills CU5 wrapped with a NEW thin wrapper, as <category>/<name>.
// NOTE: compliance/gdpr-compliance-checker is intentionally NOT here — it was
// already dispatch-reachable via the rich agents/compliance/gdpr-agent.md
// (EC2-s3 deleted the thin wrapper as subsumed). CU5 honors that removal; the
// skill's coverage is asserted separately below.
const CU5_WRAPPED = [
  'safety/fault-tree-builder',
  'safety/fmeda-analyzer',
  'safety/redundancy-pattern-picker',
  'security/cra-incident-clocks',
  'security/incident-responder',
  'security/threat-modeler',
  'legal/clm-obligations',
  'legal/dsar-handler',
  'realtime/hil-harness',
  'realtime/wcet-budget',
  'compliance/sbom-cra-checker',
  'ai-quality/llm-security-tester',
];

// Skills covered by a RICH agent that references the SKILL.md by body path
// (no frontmatter target_skill/extends_skill key). EC2-s3's gdpr-agent.md is the
// canonical case: it subsumes the old thin wrapper and delegates to the skill.
const BODY_REFERENCED = new Map([
  ['compliance/gdpr-compliance-checker', 'agents/compliance/gdpr-agent.md'],
]);

const NEW_CATEGORIES = ['safety', 'legal', 'realtime'];

// ── real-file walkers ──────────────────────────────────────────────────

function walk(dir, predicate) {
  const acc = [];
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) acc.push(...walk(full, predicate));
    else if (predicate(full)) acc.push(full);
  }
  return acc;
}

/** Every skills/<cat>/<name>/SKILL.md as "<cat>/<name>". */
function allSkills() {
  return walk(path.join(ROOT, 'skills'), (p) => path.basename(p) === 'SKILL.md').map((p) => {
    const rel = path.relative(path.join(ROOT, 'skills'), p); // <cat>/<name>/SKILL.md (may be deeper)
    const parts = rel.split(path.sep);
    parts.pop(); // drop SKILL.md
    return parts.join('/'); // <cat>/<name> (or deeper nesting preserved)
  });
}

/** All agent .md files under agents/, excluding _shared/. */
function allAgentFiles() {
  return walk(AGENTS_DIR, (p) => p.endsWith('.md') && !p.includes(`${path.sep}_shared${path.sep}`));
}

/** Read the raw YAML frontmatter block of a file, as key→value strings. */
function frontmatter(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  return fm;
}

/**
 * Every value of target_skill: (wrappers) ∪ extends_skill: (rich agents) ∪ any
 * skill referenced by a rich agent's body path (skills/<cat>/<name>/). The last
 * clause covers rich agents like gdpr-agent that delegate to a skill by prose
 * path without a frontmatter key.
 */
function referencedSkills() {
  const refs = new Set();
  const bodyRefRx = /skills\/([a-z0-9-]+)\/([a-z0-9-]+)(?:\/SKILL\.md)?/g;
  for (const file of allAgentFiles()) {
    const raw = fs.readFileSync(file, 'utf8');
    const fm = frontmatter(file);
    if (fm.target_skill) refs.add(fm.target_skill);
    if (fm.extends_skill) refs.add(fm.extends_skill);
    let m;
    while ((m = bodyRefRx.exec(raw)) !== null) {
      refs.add(`${m[1]}/${m[2]}`);
    }
  }
  return refs;
}

function documentedNoWrap() {
  const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  const block = ledger.cu5_wrapper_verdicts;
  if (!block || !Array.isArray(block.verdicts)) return new Set();
  return new Set(
    block.verdicts.filter((v) => v.verdict === 'NO-WRAP').map((v) => v.skill)
  );
}

// ── 1. Every SKILL.md is dispatch-reachable ─────────────────────────────

describe('CU5-s5 — coverage completeness (real corpus)', () => {
  it('every SKILL.md has a wrapper/rich-agent OR a documented NO-WRAP (unwrapped set is EMPTY)', () => {
    const skills = allSkills();
    const referenced = referencedSkills();
    const noWrap = documentedNoWrap();
    const unwrapped = skills.filter((s) => !referenced.has(s) && !noWrap.has(s));
    assert.deepEqual(
      unwrapped,
      [],
      `Silently uncovered skills (no wrapper, no rich agent, no documented NO-WRAP):\n  ${unwrapped.join('\n  ')}`
    );
  });

  it('gdpr-compliance-checker is covered by the rich gdpr-agent (thin wrapper deleted per EC2-s3)', () => {
    for (const [skill, richAgentRel] of BODY_REFERENCED) {
      const richPath = path.join(ROOT, richAgentRel);
      assert.ok(fs.existsSync(richPath), `rich agent missing: ${richAgentRel}`);
      const body = fs.readFileSync(richPath, 'utf8');
      assert.match(
        body,
        new RegExp(`skills/${skill.replace('/', '\\/')}`),
        `${richAgentRel} must reference skills/${skill} by body path`
      );
      // The thin wrapper must NOT exist — it was subsumed by the rich agent.
      const thinWrapper = path.join(AGENTS_DIR, `${skill}.md`);
      assert.equal(
        fs.existsSync(thinWrapper),
        false,
        `agents/${skill}.md must stay deleted (subsumed by ${richAgentRel} per EC2-s3)`
      );
    }
  });

  // ── 2. The 12 CU5 thin wrappers exist and resolve ─────────────────────

  it('all 12 CU5 wrappers exist, parse as type: wrapper, and target an existing SKILL.md', () => {
    for (const skill of CU5_WRAPPED) {
      const wrapperPath = path.join(AGENTS_DIR, `${skill}.md`);
      assert.ok(fs.existsSync(wrapperPath), `wrapper missing: agents/${skill}.md`);
      const fm = frontmatter(wrapperPath);
      assert.equal(fm.type, 'wrapper', `agents/${skill}.md must be type: wrapper`);
      assert.ok(SKILL_REF_RX.test(fm.target_skill), `bad target_skill in agents/${skill}.md: ${fm.target_skill}`);
      assert.equal(fm.target_skill, skill, `agents/${skill}.md target_skill must equal ${skill}`);
      const skillPath = path.join(ROOT, 'skills', ...fm.target_skill.split('/'), 'SKILL.md');
      assert.ok(fs.existsSync(skillPath), `target SKILL.md missing: skills/${fm.target_skill}/SKILL.md`);
    }
  });

  // ── 3. Gate invariant across ALL wrappers ─────────────────────────────

  it('no type: wrapper agent carries a human/review/approval gate key', () => {
    for (const file of allAgentFiles()) {
      const fm = frontmatter(file);
      if (fm.type !== 'wrapper') continue;
      for (const gateKey of ['human_gate', 'review_gate', 'approved_by']) {
        assert.equal(fm[gateKey], undefined, `wrapper ${path.relative(ROOT, file)} must not carry ${gateKey}`);
      }
    }
  });

  // ── 4. Three new categories present ───────────────────────────────────

  it('the three new agent categories exist as directories', () => {
    for (const cat of NEW_CATEGORIES) {
      const dir = path.join(AGENTS_DIR, cat);
      assert.ok(fs.existsSync(dir) && fs.statSync(dir).isDirectory(), `agents/${cat}/ must exist`);
    }
  });

  // ── 5. No forbidden fields on any CU5 wrapper ─────────────────────────

  it('each CU5 wrapper frontmatter has exactly {name, type, target_skill}', () => {
    for (const skill of CU5_WRAPPED) {
      const wrapperPath = path.join(AGENTS_DIR, `${skill}.md`);
      const fm = frontmatter(wrapperPath);
      const keys = Object.keys(fm).sort();
      assert.deepEqual(
        keys,
        ['name', 'target_skill', 'type'],
        `agents/${skill}.md frontmatter keys must be exactly name/type/target_skill, got: ${keys.join(', ')}`
      );
    }
  });
});
