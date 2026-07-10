'use strict';

// CU5-s3 — Legal + realtime wrappers content-contract test.
// Reads the 4 REAL wrapper .md files off disk (zero doubles) and asserts the
// thin wrapper shape mandated by the CU5 parent plan, across TWO new categories:
//   - frontmatter has exactly {name, type, target_skill}
//   - type === 'wrapper'
//   - target_skill resolves to a real skills/<category>/<name>/SKILL.md (no dangling)
//   - the canonical redirect sentence is present as the single body line
//   - NO gate field, NO forbidden rich-agent fields (tier/reports_to/model/tools/...)
//   - the wrapper restates NO skill rule (thin: no copied heading/enum/BAD-SAFE)
//   - the two NEW agent directories (agents/legal, agents/realtime) exist

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const AGENTS_ROOT = path.join(REPO_ROOT, 'agents');
const SKILLS_ROOT = path.join(REPO_ROOT, 'skills');

// Each wrapper: [category, name]. Two categories, two skills each.
const WRAPPERS = [
  ['legal', 'clm-obligations'],
  ['legal', 'dsar-handler'],
  ['realtime', 'hil-harness'],
  ['realtime', 'wcet-budget'],
];

const NEW_CATEGORIES = ['legal', 'realtime'];

// target_skill guard — literal "<category>/<name>" only (no traversal).
const TARGET_SKILL_RE = /^[a-z0-9-]+\/[a-z0-9-]+$/;

// Category-aware redirect: this slice touches only legal + realtime.
const REDIRECT_RE =
  /^This agent's logic lives at skills\/(legal|realtime)\/[a-z0-9-]+\/SKILL\.md\. Read that file in full, then follow its instructions\.$/;

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

function readWrapper(category, name) {
  const file = path.join(AGENTS_ROOT, category, `${name}.md`);
  const raw = fs.readFileSync(file, 'utf8'); // throws loudly if wrapper absent (RED)
  return { file, raw, ...parseWrapper(raw) };
}

describe('CU5-s3 legal + realtime wrappers — content contract', () => {
  it('the two NEW agent directories exist', () => {
    for (const category of NEW_CATEGORIES) {
      const dir = path.join(AGENTS_ROOT, category);
      assert.strictEqual(
        fs.existsSync(dir) && fs.statSync(dir).isDirectory(),
        true,
        `agents/${category}/ must exist as a directory`
      );
    }
  });

  for (const [category, name] of WRAPPERS) {
    describe(`agents/${category}/${name}.md`, () => {
      it('exists and has exactly the 3 thin frontmatter fields', () => {
        const { frontmatter } = readWrapper(category, name);
        assert.deepStrictEqual(
          Object.keys(frontmatter).sort(),
          ['name', 'target_skill', 'type'],
          'frontmatter must be exactly {name, target_skill, type}'
        );
      });

      it('type is wrapper', () => {
        const { frontmatter } = readWrapper(category, name);
        assert.strictEqual(frontmatter.type, 'wrapper');
      });

      it('name matches file basename and target_skill last segment', () => {
        const { frontmatter } = readWrapper(category, name);
        assert.strictEqual(frontmatter.name, name, 'name must equal basename');
        assert.strictEqual(
          frontmatter.target_skill,
          `${category}/${name}`,
          `target_skill must be ${category}/<name>`
        );
        assert.strictEqual(
          frontmatter.target_skill.split('/').pop(),
          frontmatter.name,
          'target_skill last segment must equal name'
        );
      });

      it('target_skill resolves to a real SKILL.md (no dangling)', () => {
        const { frontmatter } = readWrapper(category, name);
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
        const { body } = readWrapper(category, name);
        assert.ok(body.length > 0, 'body must be non-empty');
        const lines = body.split('\n').filter((l) => l.trim().length > 0);
        assert.strictEqual(lines.length, 1, 'body must be a single non-empty line');
        assert.match(lines[0], REDIRECT_RE, 'body must match the canonical redirect sentence');
        assert.ok(
          lines[0].includes(`skills/${category}/${name}/SKILL.md`),
          'redirect must point at this wrapper\'s SKILL.md'
        );
      });

      it('carries no gate field and no forbidden rich-agent fields', () => {
        const { frontmatter, raw } = readWrapper(category, name);
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
        const { raw } = readWrapper(category, name);
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
