/**
 * SaaS template invariants (v8.3)
 *
 * Verifies:
 *   - .ctoc/templates/saas/index.yaml lists valid templates
 *   - Each "ready" template has README.md + manifest.yaml + production-readiness.yaml
 *   - Each required skill referenced in a manifest exists
 *   - Each SaaS skill declares v8 frontmatter
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

function read(p) { return fs.readFileSync(p, 'utf8'); }
function exists(p) { return fs.existsSync(p); }

describe('SaaS template index', () => {
  it('.ctoc/templates/saas/index.yaml exists', () => {
    assert.ok(exists(path.join(projectRoot, '.ctoc/templates/saas/index.yaml')));
  });

  it('contains saas/b2c-subscription as a ready template', () => {
    const content = read(path.join(projectRoot, '.ctoc/templates/saas/index.yaml'));
    assert.match(content, /id: saas\/b2c-subscription/);
    assert.match(content, /status: ready/);
  });
});

describe('saas/b2c-subscription template structure', () => {
  const base = path.join(projectRoot, '.ctoc/templates/saas/b2c-subscription');

  it('has README.md', () => {
    assert.ok(exists(path.join(base, 'README.md')));
  });

  it('has manifest.yaml', () => {
    assert.ok(exists(path.join(base, 'manifest.yaml')));
  });

  it('has production-readiness.yaml', () => {
    assert.ok(exists(path.join(base, 'production-readiness.yaml')));
  });

  it('manifest declares default_tech_stack with required components', () => {
    const m = read(path.join(base, 'manifest.yaml'));
    assert.match(m, /default_tech_stack:/);
    assert.match(m, /auth_provider:/);
    assert.match(m, /database:/);
    assert.match(m, /payments:/);
    assert.match(m, /email_transactional:/);
    assert.match(m, /analytics_product:/);
    assert.match(m, /error_monitoring:/);
    assert.match(m, /deployment_target:/);
  });

  it('manifest declares required_skills referencing existing saas skills', () => {
    const m = read(path.join(base, 'manifest.yaml'));
    const skillMatches = [...m.matchAll(/^\s+-\s+saas\/(\S+)$/gm)].map(x => x[1]);
    assert.ok(skillMatches.length >= 5, `expected ≥5 required_skills, got ${skillMatches.length}`);
    for (const skill of skillMatches) {
      const skillPath = path.join(projectRoot, 'skills/saas', skill, 'SKILL.md');
      assert.ok(exists(skillPath), `manifest references skills/saas/${skill} but file is missing`);
    }
  });

  it('production-readiness.yaml has at least 5 block-severity checks', () => {
    const pr = read(path.join(base, 'production-readiness.yaml'));
    const blockChecks = [...pr.matchAll(/^\s+severity:\s+block$/gm)];
    assert.ok(blockChecks.length >= 5, `expected ≥5 block checks, got ${blockChecks.length}`);
  });
});

describe('SaaS skills v8 conformance', () => {
  const saasSkillsDir = path.join(projectRoot, 'skills/saas');

  function listSaasSkills() {
    if (!exists(saasSkillsDir)) return [];
    return fs.readdirSync(saasSkillsDir)
      .filter(name => exists(path.join(saasSkillsDir, name, 'SKILL.md')))
      .map(name => path.join(saasSkillsDir, name, 'SKILL.md'));
  }

  it('skills/saas/ exists and has at least 5 skills', () => {
    const skills = listSaasSkills();
    assert.ok(skills.length >= 5, `expected ≥5 saas skills, got ${skills.length}`);
  });

  it('every saas skill declares tier: 2 + dispatch_protocol: v1 + effort_budget', () => {
    for (const skill of listSaasSkills()) {
      const content = read(skill);
      const rel = path.relative(projectRoot, skill);
      assert.match(content, /^tier:\s*2$/m, `${rel} missing tier: 2`);
      assert.match(content, /dispatch_protocol:\s*v1/, `${rel} missing dispatch_protocol: v1`);
      assert.match(content, /effort_budget:/, `${rel} missing effort_budget`);
      assert.match(content, /max_subagents:\s*0/, `${rel} must have max_subagents: 0`);
      assert.match(content, /confidence_calibration:/, `${rel} missing confidence_calibration`);
    }
  });

  it('every saas skill has a corresponding redirect stub at agents/saas/<name>.md', () => {
    for (const skill of listSaasSkills()) {
      const name = path.basename(path.dirname(skill));
      const stubPath = path.join(projectRoot, 'agents/saas', `${name}.md`);
      assert.ok(exists(stubPath), `missing redirect stub agents/saas/${name}.md`);
      const stub = read(stubPath);
      assert.match(stub, /type:\s+wrapper/, `${stubPath} not a wrapper`);
      assert.match(stub, new RegExp(`target_skill:\\s+saas/${name}`), `wrong target_skill`);
    }
  });
});

describe('Planning sub-orchestrators exist', () => {
  it('agents/planning/stack-chooser.md exists', () => {
    assert.ok(exists(path.join(projectRoot, 'agents/planning/stack-chooser.md')));
  });

  it('agents/planning/unit-economics-modeler.md exists', () => {
    assert.ok(exists(path.join(projectRoot, 'agents/planning/unit-economics-modeler.md')));
  });

  it('stack-chooser declares tier: 1 + reports_to: cto-chief', () => {
    const c = read(path.join(projectRoot, 'agents/planning/stack-chooser.md'));
    assert.match(c, /^tier:\s*1$/m);
    assert.match(c, /reports_to:\s*cto-chief/);
  });

  it('unit-economics-modeler declares tier: 1 and reports outside the CTO Chief chain', () => {
    const c = read(path.join(projectRoot, 'agents/planning/unit-economics-modeler.md'));
    assert.match(c, /^tier:\s*1$/m);
    assert.match(c, /reports_to:\s*user/);
  });
});
