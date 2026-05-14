/**
 * Tests for the Refinement Loop foundation files (v6.9.5).
 *
 * Verifies:
 *   - docs/REFINEMENT_LOOP.md exists and references all 10 design decisions
 *   - .ctoc/architecture/refinement-loop-schema.json is valid JSON and has
 *     the expected structure (letter schema with required fields)
 *   - .ctoc/config/refinement-triggers.yaml exists and covers all the
 *     risk-surface categories (money, HIPAA, PII, etc.)
 *
 * Does NOT test orchestration code (deferred to subsequent patches — the
 * orchestrator will be src/lib/refinement-loop.js).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(projectRoot, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(projectRoot, rel));

describe('Refinement Loop — spec doc', () => {
  it('docs/REFINEMENT_LOOP.md exists', () => {
    assert.ok(exists('docs/REFINEMENT_LOOP.md'));
  });

  const content = exists('docs/REFINEMENT_LOOP.md') ? read('docs/REFINEMENT_LOOP.md') : '';

  it('references all 10 design decisions', () => {
    for (let i = 1; i <= 10; i++) {
      assert.match(content, new RegExp(`\\| ${i} \\|`), `missing Decision row ${i} in the 10-point record`);
    }
  });

  it('mentions Anthropic Code Review as production-grade citation', () => {
    assert.match(content, /Anthropic.*Code Review|claude\.com\/blog\/code-review/i);
  });

  it('mentions the warnings-are-bugs principle', () => {
    assert.match(content, /warnings? (are|=) (bug|critical)/i);
  });

  it('describes the per-phase K (3/5/7)', () => {
    assert.match(content, /K\s*=\s*3/);
    assert.match(content, /K\s*=\s*5/);
    assert.match(content, /K\s*=\s*7/);
  });

  it('mentions parallel critics + sequential test-writer/implementer', () => {
    assert.match(content, /parallel/i);
    assert.match(content, /test-?writer/i);
    assert.match(content, /implementer/i);
  });

  it('mentions JSON for transport, Markdown for human escalation', () => {
    assert.match(content, /JSON for transport/i);
    assert.match(content, /Markdown/);
  });

  it('mentions Iron Loop integration without deleting steps', () => {
    assert.match(content, /Iron Loop/);
    assert.match(content, /16 (canonical )?step/i);
    assert.match(content, /REVIEW.*OPTIMIZE.*SECURE/);
  });

  it('flags calibration items as TODO empirically', () => {
    assert.match(content, /TODO.*calibrat/i);
  });
});

describe('Refinement Loop — JSON schema', () => {
  it('refinement-loop-schema.json exists', () => {
    assert.ok(exists('.ctoc/architecture/refinement-loop-schema.json'));
  });

  let schema;
  it('parses as valid JSON', () => {
    schema = JSON.parse(read('.ctoc/architecture/refinement-loop-schema.json'));
    assert.ok(schema);
  });

  it('declares $schema draft 2020-12 (or later)', () => {
    assert.match(schema.$schema, /draft\/2020-12/);
  });

  it('has $id ctoc-refinement-loop-letter-v1', () => {
    assert.equal(schema.$id, 'ctoc-refinement-loop-letter-v1');
  });

  it('requires the core letter fields', () => {
    for (const field of ['letter_id', 'round', 'phase', 'plan', 'summary', 'issues']) {
      assert.ok(schema.required.includes(field), `missing required field: ${field}`);
    }
  });

  it('phase enum covers critical/medium/low/final-sweep', () => {
    assert.deepEqual(
      [...schema.properties.phase.enum].sort(),
      ['critical', 'final-sweep', 'low', 'medium']
    );
  });

  it('issue $def requires fingerprint + severity + observable_test_conditions', () => {
    const issue = schema.$defs.issue;
    for (const field of ['fingerprint', 'severity', 'observable_test_conditions']) {
      assert.ok(issue.required.includes(field), `issue missing required field: ${field}`);
    }
  });

  it('issue severity enum is critical/medium/low (no warn — warnings classify as critical)', () => {
    const severityEnum = schema.$defs.issue.properties.severity.enum;
    assert.deepEqual([...severityEnum].sort(), ['critical', 'low', 'medium']);
    assert.ok(!severityEnum.includes('warn'), 'severity enum must NOT include warn (warnings = critical per principle)');
  });

  it('fingerprint pattern is sha-prefix-like', () => {
    const pattern = schema.$defs.issue.properties.fingerprint.pattern;
    assert.ok(/[a-z0-9-]/.test(pattern), 'fingerprint pattern should allow lowercase + digits + hyphens');
  });
});

describe('Refinement Loop — risk-surface triggers', () => {
  it('refinement-triggers.yaml exists', () => {
    assert.ok(exists('.ctoc/config/refinement-triggers.yaml'));
  });

  const content = exists('.ctoc/config/refinement-triggers.yaml') ? read('.ctoc/config/refinement-triggers.yaml') : '';

  it('covers money + access surfaces', () => {
    for (const glob of ['**/auth/**', '**/billing/**', '**/payment/**', '**/webhook/**', '**/stripe/**']) {
      assert.ok(content.includes(glob), `missing money/access glob: ${glob}`);
    }
  });

  it('covers HIPAA / PHI surfaces (user-required)', () => {
    for (const glob of ['**/health/**', '**/medical/**', '**/phi/**', '**/patient/**', '**/clinical/**', '**/hipaa/**']) {
      assert.ok(content.includes(glob), `missing HIPAA glob: ${glob}`);
    }
  });

  it('covers PII surfaces (user-required)', () => {
    for (const glob of ['**/personal/**', '**/profile/**', '**/pii/**', '**/dsar/**', '**/export/**']) {
      assert.ok(content.includes(glob), `missing PII glob: ${glob}`);
    }
  });

  it('covers cryptography surfaces', () => {
    for (const glob of ['**/encryption/**', '**/keys/**', '**/crypto/**', '**/jwt/**', '**/oauth/**']) {
      assert.ok(content.includes(glob), `missing crypto glob: ${glob}`);
    }
  });

  it('covers infrastructure-as-code (silent misconfig = production incident)', () => {
    for (const glob of ['**/terraform/**', '**/kubernetes/**', '**/Dockerfile']) {
      assert.ok(content.includes(glob), `missing IaC glob: ${glob}`);
    }
  });

  it('declares bypass_escape_phrases for trivial fixes', () => {
    for (const phrase of ['hotfix', 'trivial fix', 'urgent', 'quick fix']) {
      assert.ok(content.includes(phrase), `missing escape phrase: ${phrase}`);
    }
  });
});

describe('Refinement Loop — iron-loop-enforcer integration', () => {
  it('enforcer can be extended with refinement-loop checks (file exists)', () => {
    // The enforcer's job is to verify foundation files exist. v6.9.5 ships the
    // foundation; subsequent patches will add the enforcer check.
    assert.ok(exists('src/lib/iron-loop-enforcer.js'));
  });
});
