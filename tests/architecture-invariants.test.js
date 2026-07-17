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

// Anchored at byte 0 to match the Claude Code runtime (finding C7). The runtime
// honours agent/skill frontmatter ONLY when it starts at byte 0; the previous
// match-anywhere read (a `/m` `^---` plus an explicit `\n---` fallback) parsed a
// YAML block that follows an `# H1` heading — frontmatter the runtime never reads —
// and thereby certified inert contracts green (cto-chief running with all tools,
// scouts on the session model). This single byte-0 regex (no `/m`, no fallback)
// makes the test agree with the runtime: a heading-first file yields empty
// frontmatter and its contract assertions fail loud. GREEN on today's tree because
// W03 moved the 19 heading-first agents' YAML to line 1; if any file regresses to
// heading-first, its frontmatter parses as empty here. Pure so the anchoring is
// provable on an in-memory value without a fixture file (see the C7 describe below).
function parseFrontmatter(content) {
  const m = /^---\n([\s\S]*?)\n---/.exec(content);
  return m ? m[1] : '';
}

function readFM(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return { fm: parseFrontmatter(content), body: content };
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
    'agents/infrastructure/deployment-setup.md',
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

  // v6.9.11: pin the dispatch-graph semantics for Tier 1.
  // Tier 1 may dispatch its own children (Tier 2 specialists) — this is needed
  // for parallel critic fan-out in the refinement loop and for Iron Loop step
  // orchestration. It MUST NOT dispatch peer Tier 1 agents (no cross-orchestrator
  // cascading). The matching budget is max_subagents: 10.
  // v6.12.79 (plan F3b): the tier_3 arms of these assertions were removed — Tier 3
  // is deleted, and its absence is fenced by tests/no-tier-3.test.js.
  describe('Dispatch graph — Tier 1 children + peer-dispatch ban', () => {
    const tierDefsPath = path.join(projectRoot, '.ctoc', 'architecture', 'tier-definitions.yaml');
    const content = fs.existsSync(tierDefsPath) ? fs.readFileSync(tierDefsPath, 'utf8') : '';

    function extractWhoCanDispatchLine(tier) {
      // Match e.g. `    tier_1: [tier_2, tier_3]` under the who_can_dispatch block.
      const block = content.split('who_can_dispatch:')[1] || '';
      const rx = new RegExp(`^\\s*${tier}:\\s*(\\[[^\\]]*\\]|\\[\\])`, 'm');
      const m = block.match(rx);
      return m ? m[1] : null;
    }

    it('tier_1 in who_can_dispatch lists tier_2', () => {
      const t1 = extractWhoCanDispatchLine('tier_1');
      assert.ok(t1, 'tier_1 entry missing from who_can_dispatch');
      assert.match(t1, /tier_2/, 'tier_1 must dispatch tier_2 (refinement loop fan-out)');
      assert.doesNotMatch(t1, /tier_3/, 'tier_3 is deleted — tier_1 must not dispatch it');
    });

    it('tier_1 does NOT dispatch peer tier_1 (no cross-orchestrator cascading)', () => {
      const t1 = extractWhoCanDispatchLine('tier_1');
      assert.ok(t1, 'tier_1 entry missing from who_can_dispatch');
      assert.doesNotMatch(t1, /tier_1/, 'tier_1 must NOT dispatch peer tier_1 (cascading ban)');
    });

    it('tier_1 budget remains max_subagents: 10 (reflects parallel fan-out need)', () => {
      const block = content.split('tier_1:')[1] || '';
      const budget = block.split('tier_2:')[0];
      assert.match(budget, /max_subagents:\s*10/,
        'tier_1.effort_budget.max_subagents must remain 10 to support refinement-loop critic fan-out');
    });

    it('tier_2 still cannot dispatch (leaf agents)', () => {
      const t2 = extractWhoCanDispatchLine('tier_2');
      assert.equal(t2, '[]', 'tier_2 must not dispatch');
      assert.equal(
        extractWhoCanDispatchLine('tier_3'),
        null,
        'tier_3 must not appear in who_can_dispatch — the tier is deleted'
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
//  Tier 2: Specialist skills have v8 frontmatter
// ─────────────────────────────────────────────────────────────────────

describe('v8 Architecture — Tier 2 (Specialist skills)', () => {
  // All 20 specialist categories — all 99 leaf-skills are v8.
  const MIGRATED = [
    'quality', 'testing', 'documentation', 'security', 'specialized',
    'infrastructure', 'frontend', 'mobile', 'compliance', 'data-ml',
    'versioning', 'ai-quality', 'architecture', 'devex', 'cost',
    'saas', 'safety', 'legal', 'realtime', 'product',
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
//  Tier 3 (Scouts) — DELETED by plan F3b (v6.12.79).
//
//  The three assertions that stood here contracted a thing that no longer
//  exists: that ≥ 5 scouts exist under agents/scouts/; that each declares
//  tier: 3 + model: haiku; and that each declares short_circuits: to the Tier 2
//  specialist it may suppress. Removing an assertion about a deleted thing is
//  not green-washing — the contract itself is gone.
//
//  The INVERSE assertions now live in tests/no-tier-3.test.js, which fails if
//  the directory, the haiku model, or the short_circuits key ever return.
// ─────────────────────────────────────────────────────────────────────

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

  // Retained deliberately after plan F3b deleted the pre-screen that read it:
  // this is curated CVE DATA, not an agent. Deleting an agent must never delete
  // the data it happened to read — security/dependency-auditor (opus) wants it.
  it('.ctoc/security/known-bad-deps.yaml exists (curated CVE data)', () => {
    assert.ok(fs.existsSync(path.join(projectRoot, '.ctoc', 'security', 'known-bad-deps.yaml')));
  });
});

// ─────────────────────────────────────────────────────────────────────
//  Dispatch authority invariant
//
//  Per the architecture: only Tier 0 issues dispatches. Tier 2 specialists
//  must declare max_subagents: 0 (cannot dispatch). Tier 2 is the leaf tier —
//  Tier 3 was deleted by plan F3b.
// ─────────────────────────────────────────────────────────────────────

describe('v8 Architecture — Dispatch authority', () => {
  it('all Tier 2 specialists declare max_subagents: 0', () => {
    const MIGRATED = [
      'quality', 'testing', 'documentation', 'security', 'specialized',
      'infrastructure', 'frontend', 'mobile', 'compliance', 'data-ml',
      'versioning', 'ai-quality', 'architecture', 'devex', 'cost',
      'saas', 'safety', 'legal', 'realtime', 'product',
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

  // DELETED by plan F3b: 'all Tier 3 scouts declare max_subagents: 0'. Note this
  // assertion opened with `if (!fs.existsSync(scoutsDir)) return;` — with the
  // directory gone it would have returned early and reported GREEN having asserted
  // NOTHING, which is the silent-pass pattern CLAUDE.md bans outright. It is
  // removed rather than left to pass vacuously. tests/no-tier-3.test.js asserts the
  // directory's absence loudly instead.
});

// ─────────────────────────────────────────────────────────────────────
//  Frontmatter conformance — SKILL.md corpus invariant
//
//  Every SKILL.md must declare `type: skill` and MUST NOT use the
//  deprecated `allowed-tools:` frontmatter key (all tool declarations use
//  the canonical `tools:` key). Reads the real corpus off disk — no doubles.
// ─────────────────────────────────────────────────────────────────────

describe('Frontmatter conformance — SKILL.md', () => {
  // ask-me-questions is a verbatim mirror of .ctoc/ask-me-questions.md (the
  // canonical decision-elicitation format, referenced by menu.md and CLAUDE.md).
  // A test binds skills/ask-me-questions/SKILL.md byte-for-byte to that source,
  // so its frontmatter format (`allowed-tools:`, no `type:`) is fixed by the
  // source of truth and MUST NOT be rewritten. Exempt this single file here
  // while keeping the invariant loud for every other SKILL.md.
  const VERBATIM_MIRROR_SKILLS = new Set([
    path.join('skills', 'ask-me-questions', 'SKILL.md'),
  ]);

  it('every SKILL.md declares type: skill and uses tools: (never allowed-tools:)', () => {
    const skills = walkSkillFiles(path.join(projectRoot, 'skills'));
    assert.ok(skills.length > 0, 'expected to find SKILL.md files under skills/');
    for (const skill of skills) {
      const { fm } = readFM(skill);
      const rel = path.relative(projectRoot, skill);
      if (VERBATIM_MIRROR_SKILLS.has(rel)) continue;
      assert.match(fm, /^type:\s*skill\s*$/m, `${rel} must declare type: skill`);
      assert.doesNotMatch(fm, /^allowed-tools:/m, `${rel} must NOT use deprecated allowed-tools: (use tools:)`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
//  Frontmatter anchoring — finding C7
//
//  The runtime honours frontmatter only when it begins at byte 0. These
//  cases prove the anchored parser is non-vacuous: it parses a well-formed
//  (byte-0) block and REJECTS a heading-first block — the exact loophole
//  that let inert agent contracts certify green. The bad value is held in
//  memory (no fixture file); the real corpus is byte-0-anchored today
//  because W03 already moved the 19 heading-first agents' YAML to line 1,
//  so the corpus assertions above are green while these cases guard that
//  the anchoring itself still discriminates.
// ─────────────────────────────────────────────────────────────────────

describe('Frontmatter anchoring — parseFrontmatter (finding C7)', () => {
  it('parses frontmatter when the content begins with --- at byte 0', () => {
    const fm = parseFrontmatter('---\ntier: 0\nrole: top-level-coordinator\n---\n# Title\nbody\n');
    assert.match(fm, /^tier:\s*0$/m, 'byte-0 frontmatter must parse');
    assert.match(fm, /role:\s*top-level-coordinator/, 'byte-0 frontmatter must parse');
  });

  it('returns empty frontmatter when an # H1 heading precedes the YAML (runtime ignores it)', () => {
    // Synthetic heading-first content, in memory only — the precise shape the
    // Claude Code runtime never parses. The old match-anywhere read would have
    // returned `tier: 3\nmodel: haiku`; the anchored parser must reject it.
    const headingFirst = '# Some Agent\n\n---\ntier: 3\nmodel: haiku\n---\n';
    assert.equal(parseFrontmatter(headingFirst), '', 'mid-file frontmatter must not parse');
  });

  it('returns empty frontmatter when any text precedes the opening --- (even one blank line)', () => {
    assert.equal(parseFrontmatter('\n---\ntier: 2\n---\n'), '', 'a leading newline is not byte 0');
  });

  it('does not treat a mid-file --- fence as frontmatter', () => {
    // A prose paragraph followed by a horizontal-rule fence must not be read as a contract.
    const proseFirst = 'Some intro prose.\n\n---\nnot: frontmatter\n---\n';
    assert.equal(parseFrontmatter(proseFirst), '', 'a mid-file fence is not byte-0 frontmatter');
  });

  // Load-bearing differential: this pins that the byte-0 anchoring is NOT a no-op.
  // It reconstructs the pre-C7 lenient reader in memory (the removed `/m` `^---`
  // match plus the explicit `\n---` match-anywhere fallback) and proves, on the
  // SAME heading-first value, that the old reader ACCEPTED the misplaced YAML the
  // runtime never reads while the shipped anchored parser REJECTS it. If a future
  // refactor silently loosened `parseFrontmatter` back toward match-anywhere, this
  // assertion — not just the reject cases above — turns red, because it asserts the
  // two parsers DISAGREE on exactly the loophole finding C7 closed. The inline
  // pre-C7 function is a reference oracle (the historical implementation), not a
  // test double of the code under test.
  it('anchoring is load-bearing: the pre-C7 lenient reader accepted what the anchored parser rejects', () => {
    function parseFrontmatterLenientPreC7(content) {
      const m = content.match(/^---\n([\s\S]*?)\n---/m) ||
                content.match(/\n---\n([\s\S]*?)\n---/);
      return m ? m[1] : '';
    }

    // Plan W03-s2's exact fixtures (Story B / finding C7).
    const headingFirst = '# Title\n\n---\nname: x\n---\n';
    const byte0 = '---\nname: x\n---\n# Title\n';

    // The old reader mis-parsed the mid-file block — the false-green this fix closes.
    assert.match(
      parseFrontmatterLenientPreC7(headingFirst), /^name:\s*x$/m,
      'sanity: the pre-C7 lenient reader DID accept the heading-first block (the defect)'
    );
    // The shipped anchored parser rejects the identical input — the fix.
    assert.equal(
      parseFrontmatter(headingFirst), '',
      'anchored parser must reject the same heading-first block the old reader accepted'
    );
    // And it still accepts the byte-0 form (no over-rejection).
    assert.match(
      parseFrontmatter(byte0), /^name:\s*x$/m,
      'anchored parser must still accept byte-0 frontmatter'
    );
  });
});
