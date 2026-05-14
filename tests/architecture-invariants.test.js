/**
 * CTOC v8 Architecture Invariants
 *
 * Enforces the structural rules from docs/AGENT_ARCHITECTURE.md and
 * .ctoc/architecture/tier-definitions.yaml.
 *
 * Failures here mean the architecture is drifting and must be repaired.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

function readFM(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const m = content.match(/^---\n([\s\S]*?)\n---/m) ||
            content.match(/\n---\n([\s\S]*?)\n---/);
  return { fm: m ? m[1] : '', body: content };
}

function hasField(fm, name) {
  return new RegExp(`^${name}:\\s`, 'm').test(fm);
}

function getField(fm, name) {
  const m = fm.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'));
  return m ? m[1].trim() : null;
}

function walkSkillFiles(dir, opts = {}) {
  const out = [];
  const { excludeCategories = new Set() } = opts;
  function w(d, depth = 0, top = null) {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        const cat = depth === 0 ? entry.name : top;
        if (depth === 0 && excludeCategories.has(cat)) continue;
        w(full, depth + 1, cat);
      } else if (entry.name === 'SKILL.md') {
        out.push(full);
      }
    }
  }
  w(dir);
  return out;
}

function walkAgentFiles(dir) {
  const out = [];
  function w(d) {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        w(full);
      } else if (entry.name.endsWith('.md')) {
        out.push(full);
      }
    }
  }
  w(dir);
  return out;
}

// ─────────────────────────────────────────────────────────────────────
//  Tier 0: CTO Chief uniqueness
// ─────────────────────────────────────────────────────────────────────

describe('v8 Architecture — Tier 0 (CTO Chief)', () => {
  it('exists at agents/coordinator/cto-chief.md', () => {
    const p = path.join(projectRoot, 'agents', 'coordinator', 'cto-chief.md');
    assert.ok(fs.existsSync(p), 'cto-chief.md must exist');
  });

  it('declares role: top-level-coordinator and top_level: true', () => {
    const p = path.join(projectRoot, 'agents', 'coordinator', 'cto-chief.md');
    const { fm } = readFM(p);
    assert.match(fm, /role:\s*top-level-coordinator/);
    assert.match(fm, /top_level:\s*true/);
  });

  it('declares tier: 0', () => {
    const p = path.join(projectRoot, 'agents', 'coordinator', 'cto-chief.md');
    const { fm } = readFM(p);
    assert.match(fm, /^tier:\s*0$/m);
  });

  it('is the ONLY agent declaring role: top-level-coordinator', () => {
    const agents = walkAgentFiles(path.join(projectRoot, 'agents'));
    const offenders = [];
    for (const a of agents) {
      const c = fs.readFileSync(a, 'utf8');
      if (/role:\s*top-level-coordinator/.test(c) && !a.endsWith('/cto-chief.md')) {
        offenders.push(path.relative(projectRoot, a));
      }
    }
    assert.deepEqual(offenders, [], `only cto-chief may be top-level; offenders: ${offenders.join(', ')}`);
  });
});

// ─────────────────────────────────────────────────────────────────────
//  Tier 1: Synthesizer + Sub-orchestrators
// ─────────────────────────────────────────────────────────────────────

describe('v8 Architecture — Tier 1 (Sub-orchestrators)', () => {
  const TIER_1_AGENTS = [
    'agents/coordinator/synthesizer.md',
    'agents/iron-loop/iron-loop-integrator.md',
    'agents/iron-loop/iron-loop-critic.md',
    'agents/iron-loop/iron-loop-executor.md',
    'agents/pipeline/agent-writer.md',
    'agents/pipeline/agent-critic.md',
    'agents/pipeline/agent-tester.md',
    'agents/pipeline/agent-qa.md',
    'agents/pipeline/agent-publisher.md',
    'agents/planning/vision-advisor.md',
    'agents/planning/vision-decomposer.md',
    'agents/planning/product-owner.md',
    'agents/planning/implementation-planner.md',
  ];

  it('synthesizer agent exists at agents/coordinator/synthesizer.md', () => {
    const p = path.join(projectRoot, 'agents', 'coordinator', 'synthesizer.md');
    assert.ok(fs.existsSync(p), 'synthesizer.md must exist');
  });

  it('synthesizer declares tier: 1, reports_to: cto-chief, dispatch_protocol: v1', () => {
    const p = path.join(projectRoot, 'agents', 'coordinator', 'synthesizer.md');
    const { fm } = readFM(p);
    assert.match(fm, /^tier:\s*1$/m, 'synthesizer must declare tier: 1');
    assert.match(fm, /reports_to:\s*cto-chief/, 'synthesizer must report to cto-chief');
    assert.match(fm, /dispatch_protocol:\s*v1/, 'synthesizer must declare dispatch_protocol: v1');
  });

  it('every Tier 1 agent declares tier: 1', () => {
    for (const rel of TIER_1_AGENTS) {
      const p = path.join(projectRoot, rel);
      assert.ok(fs.existsSync(p), `${rel} must exist`);
      const { fm } = readFM(p);
      assert.match(fm, /^tier:\s*1$/m, `${rel} must declare tier: 1`);
    }
  });

  it('every Tier 1 agent declares reports_to: cto-chief', () => {
    for (const rel of TIER_1_AGENTS) {
      const p = path.join(projectRoot, rel);
      const { fm } = readFM(p);
      assert.match(fm, /reports_to:\s*cto-chief/, `${rel} must report to cto-chief`);
    }
  });

  it('no Tier 1 agent claims role: top-level-coordinator (uniqueness)', () => {
    for (const rel of TIER_1_AGENTS) {
      const p = path.join(projectRoot, rel);
      const c = fs.readFileSync(p, 'utf8');
      assert.doesNotMatch(c, /role:\s*top-level-coordinator/, `${rel} must NOT be top-level`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
//  Tier 2: Specialist skills have v8 frontmatter
// ─────────────────────────────────────────────────────────────────────

describe('v8 Architecture — Tier 2 (Specialist skills)', () => {
  // Migrated categories (all 15 specialist categories — all 72 leaf-skills are v8)
  const MIGRATED = [
    'quality', 'testing', 'documentation', 'security', 'specialized',
    'infrastructure', 'frontend', 'mobile', 'compliance', 'data-ml',
    'versioning', 'ai-quality', 'architecture', 'devex', 'cost',
  ];

  for (const category of MIGRATED) {
    it(`${category}/ skills declare tier: 2 + dispatch_protocol: v1 + effort_budget`, () => {
      const skills = walkSkillFiles(path.join(projectRoot, 'skills', category));
      assert.ok(skills.length > 0, `expected skills in ${category}/`);
      for (const skill of skills) {
        const { fm } = readFM(skill);
        const rel = path.relative(projectRoot, skill);
        assert.match(fm, /^tier:\s*2$/m, `${rel} missing tier: 2`);
        assert.match(fm, /dispatch_protocol:\s*v1/, `${rel} missing dispatch_protocol: v1`);
        assert.match(fm, /confidence_calibration:\s*enabled/, `${rel} missing confidence_calibration`);
        assert.match(fm, /parallel_safe:\s*(true|false)/, `${rel} missing parallel_safe`);
        assert.match(fm, /effort_budget:/, `${rel} missing effort_budget`);
        // v6.9.3+: max_tokens/max_tool_calls dropped (unenforced noise).
        // max_subagents: 0 remains the load-bearing invariant for Tier 2.
        assert.match(fm, /max_subagents:\s*0/, `${rel} Tier 2 must have max_subagents: 0`);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────
//  Tier 3: Scouts
// ─────────────────────────────────────────────────────────────────────

describe('v8 Architecture — Tier 3 (Scouts)', () => {
  it('at least 5 scouts exist under agents/scouts/', () => {
    const scoutsDir = path.join(projectRoot, 'agents', 'scouts');
    assert.ok(fs.existsSync(scoutsDir), 'agents/scouts/ must exist');
    const files = fs.readdirSync(scoutsDir).filter(f => f.endsWith('.md'));
    assert.ok(files.length >= 5, `expected ≥ 5 scouts, got ${files.length}`);
  });

  it('every scout declares tier: 3, model: haiku, parallel_safe: true, reports_to: cto-chief', () => {
    // Scouts run as Task-tool SUBAGENTS — fresh agent instance with isolated 200K
    // context. The Haiku model is safe at the subagent layer because subagent
    // context is independent of the user's terminal session. See
    // docs/AGENT_ARCHITECTURE.md § "Front-process vs subagent model rules".
    const scoutsDir = path.join(projectRoot, 'agents', 'scouts');
    const files = fs.readdirSync(scoutsDir)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(scoutsDir, f));

    for (const scout of files) {
      const { fm } = readFM(scout);
      const rel = path.relative(projectRoot, scout);
      assert.match(fm, /^tier:\s*3$/m, `${rel} missing tier: 3`);
      assert.match(fm, /^model:\s*haiku$/m, `${rel} scouts must declare model: haiku (Task-tool subagent, isolated context)`);
      assert.match(fm, /model_optimized_for:\s*haiku-4-5/, `${rel} must be optimized for haiku-4-5`);
      assert.match(fm, /parallel_safe:\s*true/, `${rel} scouts must be parallel_safe`);
      assert.match(fm, /reports_to:\s*cto-chief/, `${rel} scouts must report to cto-chief`);
      assert.match(fm, /dispatch_protocol:\s*v1/, `${rel} must declare dispatch_protocol: v1`);
    }
  });

  it('every scout declares short_circuits to a Tier 2 specialist', () => {
    const scoutsDir = path.join(projectRoot, 'agents', 'scouts');
    const files = fs.readdirSync(scoutsDir)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(scoutsDir, f));

    for (const scout of files) {
      const { fm } = readFM(scout);
      const rel = path.relative(projectRoot, scout);
      assert.match(fm, /short_circuits:\s*\S+/, `${rel} must declare short_circuits target`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
//  Documents exist
// ─────────────────────────────────────────────────────────────────────

describe('v8 Architecture — Companion documents', () => {
  it('docs/AGENT_ARCHITECTURE.md exists', () => {
    assert.ok(fs.existsSync(path.join(projectRoot, 'docs', 'AGENT_ARCHITECTURE.md')));
  });

  it('docs/DISPATCH_PROTOCOL.md exists', () => {
    assert.ok(fs.existsSync(path.join(projectRoot, 'docs', 'DISPATCH_PROTOCOL.md')));
  });

  it('.ctoc/architecture/tier-definitions.yaml exists', () => {
    assert.ok(fs.existsSync(path.join(projectRoot, '.ctoc', 'architecture', 'tier-definitions.yaml')));
  });

  it('.ctoc/architecture/dispatch-schema.yaml exists', () => {
    assert.ok(fs.existsSync(path.join(projectRoot, '.ctoc', 'architecture', 'dispatch-schema.yaml')));
  });

  it('.ctoc/security/known-bad-deps.yaml exists (for dep-scout)', () => {
    assert.ok(fs.existsSync(path.join(projectRoot, '.ctoc', 'security', 'known-bad-deps.yaml')));
  });
});

// ─────────────────────────────────────────────────────────────────────
//  Dispatch authority invariant
//
//  Per the architecture: only Tier 0 issues dispatches. Tier 2 specialists
//  must declare max_subagents: 0 (cannot dispatch). Tier 3 scouts likewise.
// ─────────────────────────────────────────────────────────────────────

describe('v8 Architecture — Dispatch authority', () => {
  it('all Tier 2 specialists declare max_subagents: 0', () => {
    const MIGRATED = [
      'quality', 'testing', 'documentation', 'security', 'specialized',
      'infrastructure', 'frontend', 'mobile', 'compliance', 'data-ml',
      'versioning', 'ai-quality', 'architecture', 'devex', 'cost',
    ];
    for (const category of MIGRATED) {
      const skills = walkSkillFiles(path.join(projectRoot, 'skills', category));
      for (const skill of skills) {
        const { fm } = readFM(skill);
        const rel = path.relative(projectRoot, skill);
        assert.match(fm, /max_subagents:\s*0/, `${rel} Tier 2 must have max_subagents: 0`);
      }
    }
  });

  it('all Tier 3 scouts declare max_subagents: 0', () => {
    const scoutsDir = path.join(projectRoot, 'agents', 'scouts');
    if (!fs.existsSync(scoutsDir)) return;
    const files = fs.readdirSync(scoutsDir)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(scoutsDir, f));
    for (const scout of files) {
      const { fm } = readFM(scout);
      const rel = path.relative(projectRoot, scout);
      assert.match(fm, /max_subagents:\s*0/, `${rel} Tier 3 must have max_subagents: 0`);
    }
  });
});
