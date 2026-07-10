'use strict';

// CU5-s1 — Safety wrappers content-contract test.
// Reads the 3 REAL wrapper .md files off disk (zero doubles) and asserts the
// thin wrapper shape mandated by the CU5 parent plan:
//   - frontmatter has exactly {name, type, target_skill}
//   - type === 'wrapper'
//   - target_skill resolves to a real skills/safety/<name>/SKILL.md (no dangling)
//   - the canonical redirect sentence is present as the single body line
//   - NO gate field, NO forbidden rich-agent fields (tier/reports_to/model/tools/...)
//   - the wrapper restates NO skill rule (thin: no copied heading/enum/BAD-SAFE)

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const AGENTS_SAFETY = path.join(REPO_ROOT, 'agents', 'safety');
const SKILLS_ROOT = path.join(REPO_ROOT, 'skills');

const WRAPPERS = ['fault-tree-builder', 'fmeda-analyzer', 'redundancy-pattern-picker'];

// target_skill guard — literal "<category>/<name>" only (no traversal).
const TARGET_SKILL_RE = /^[a-z0-9-]+\/[a-z0-9-]+$/;

const REDIRECT_RE =
  /^This agent's logic lives at skills\/safety\/[a-z0-9-]+\/SKILL\.md\. Read that file in full, then follow its instructions\.$/;

const FORBIDDEN_FRONTMATTER_KEYS = [
  'tier', 'reports_to', 'dispatch_protocol', 'model', 'tools',
  'human_gate', 'review_gate', 'approved_by', 'gate', 'gate_crossed',
];

// Lightweight frontmatter split: returns { frontmatter: {k:v}, body: '...' }.
function parseWrapper(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  assert.ok(m, 'file must start with a --- frontmatter block');
  const fmBlock = m[1];
  const body = (m[2] || '').trim();

  const frontmatter = {};
  for (const line of fmBlock.split('\n')) {
    if (!line.trim()) continue;
    const idx = line.indexOf(':');
    assert.ok(idx > 0, `malformed frontmatter line: ${JSON.stringify(line)}`);
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    frontmatter[key] = value;
  }
  return { frontmatter, body };
}

function readWrapper(name) {
  const file = path.join(AGENTS_SAFETY, `${name}.md`);
  const raw = fs.readFileSync(file, 'utf8'); // throws loudly if wrapper absent (RED)
  return { file, raw, ...parseWrapper(raw) };
}

describe('CU5-s1 safety wrappers — content contract', () => {
  for (const name of WRAPPERS) {
    describe(`agents/safety/${name}.md`, () => {
      it('exists and has exactly the 3 thin frontmatter fields', () => {
        const { frontmatter } = readWrapper(name);
        assert.deepStrictEqual(
          Object.keys(frontmatter).sort(),
          ['name', 'target_skill', 'type'],
          'frontmatter must be exactly {name, target_skill, type}'
        );
      });

      it('type is wrapper', () => {
        const { frontmatter } = readWrapper(name);
        assert.strictEqual(frontmatter.type, 'wrapper');
      });

      it('name matches file basename and target_skill last segment', () => {
        const { frontmatter } = readWrapper(name);
        assert.strictEqual(frontmatter.name, name, 'name must equal basename');
        assert.strictEqual(
          frontmatter.target_skill,
          `safety/${name}`,
          'target_skill must be safety/<name>'
        );
        assert.strictEqual(
          frontmatter.target_skill.split('/').pop(),
          frontmatter.name,
          'target_skill last segment must equal name'
        );
      });

      it('target_skill resolves to a real SKILL.md (no dangling)', () => {
        const { frontmatter } = readWrapper(name);
        assert.match(
          frontmatter.target_skill,
          TARGET_SKILL_RE,
          'target_skill must be literal <category>/<name> (path-traversal guard)'
        );
        const skillPath = path.join(SKILLS_ROOT, frontmatter.target_skill, 'SKILL.md');
        assert.strictEqual(
          fs.existsSync(skillPath),
          true,
          `target_skill must resolve to a real file: ${skillPath}`
        );
      });

      it('body is the single canonical redirect sentence', () => {
        const { body } = readWrapper(name);
        assert.ok(body.length > 0, 'body must be non-empty');
        const lines = body.split('\n').filter((l) => l.trim().length > 0);
        assert.strictEqual(lines.length, 1, 'body must be a single non-empty line');
        assert.match(lines[0], REDIRECT_RE, 'body must match the canonical redirect sentence');
        assert.ok(
          lines[0].includes(`skills/safety/${name}/SKILL.md`),
          'redirect must point at this wrapper\'s SKILL.md'
        );
      });

      it('carries no gate field and no forbidden rich-agent fields', () => {
        const { frontmatter, raw } = readWrapper(name);
        for (const key of FORBIDDEN_FRONTMATTER_KEYS) {
          assert.ok(
            !(key in frontmatter),
            `wrapper frontmatter must NOT contain "${key}" (thin/advisory, no gate)`
          );
        }
        // Gate invariant also asserted against the whole file text.
        for (const gate of ['human_gate', 'review_gate', 'approved_by']) {
          assert.ok(
            !raw.includes(gate),
            `wrapper must not mention gate field "${gate}" anywhere`
          );
        }
      });

      it('restates NO skill rule — thin, copies nothing from SKILL.md', () => {
        const { raw } = readWrapper(name);
        // Thin proof: no markdown headings, no BAD/SAFE example markers,
        // no enumerated rule lists copied from the skill body.
        assert.ok(!/^#{1,6}\s/m.test(raw), 'wrapper must contain no markdown headings');
        assert.ok(!/\bBAD\b/.test(raw), 'wrapper must not copy BAD example markers');
        assert.ok(!/\bSAFE\b/.test(raw), 'wrapper must not copy SAFE example markers');
        assert.ok(!/```/.test(raw), 'wrapper must not contain fenced code blocks');
        // Whole file is small (frontmatter + one sentence).
        assert.ok(raw.length < 400, 'wrapper must be small (thin redirect only)');
      });
    });
  }
});
