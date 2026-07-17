'use strict';

// CU5-s3 — Legal + realtime wrappers content-contract test.
// Reads the 4 REAL wrapper .md files off disk (zero doubles) and asserts the
// DISPATCHABLE wrapper shape, across TWO new categories:
//   - frontmatter carries the resolution keys {name, type, target_skill} AND the
//     routing keys {description, tools}; only documented dispatch-metadata keys
//     may join them (CLOSED allowlist — no field leakage, no gate field)
//   - type === 'wrapper'
//   - target_skill resolves to a real skills/<category>/<name>/SKILL.md (no dangling)
//   - the canonical redirect sentence is present as the single body line
//   - NO gate field anywhere in the file text
//   - the BODY restates NO skill rule (thin: copies nothing from SKILL.md)
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

// REPLACED CONTRACT — second scope correction (owner, 2026-07-17: an agent is a
// standing WATCHER that USES skills; "an agent that merely redirects to one skill
// is worthless"; "SKILLS CANNOT WATCH A BUILD, THEY ARE USED BY AN AGENT").
//
// This was an anchored full-body regex: the body had to BE the redirect sentence
// and nothing else. With `body.length < 200` and the no-headings rule below, it did
// not assert that the wrapper DELEGATES — it asserted that the wrapper is EMPTY.
// Same conflation the earlier `raw`→`body` correction fixed one level up: the rule
// is named "copies nothing from SKILL.md" — DUPLICATION, not length.
//
// Both halves of the real contract are kept: RESOLUTION (the body still names its
// own SKILL.md and instructs that it be read in full — the redirect sentence's
// entire semantic content, asserted directly rather than by matching one exact
// string) and NON-DUPLICATION (no substantive line of the skill may appear in the
// body — always the load-bearing half, exact rather than a proxy, preserved below).
//
// TIGHTENED, not loosened: a body that resolves and duplicates nothing but says
// nothing now FAILS, via WATCHER_SECTIONS. The old fence mandated the empty stub.
const SKILL_REF_RE = (category, name) =>
  new RegExp(`skills/${category}/${name}/SKILL\\.md`);
const DELEGATION_RE = /[Rr]ead (that file|it) in full/;

// The sections that make a body a standing watcher rather than a redirect stub —
// the shape of the restored real watchers (agents/quality/architecture-checker.md,
// agents/security/security-scanner.md).
const WATCHER_SECTIONS = [
  '## Role',
  '## Trigger',
  '## Checks',
  '## Output Format (MANDATORY)',
  '## Blocking Rules',
  '## Related Agents',
];

// REPLACED CONTRACT (owner, 2026-07-17: "give each wrapper a real description and
// tools, make them dispatchable" / "NO EMPTY AGENTS").
//
// This list used to ban the ROUTING fields (tier/reports_to/dispatch_protocol/
// model/tools) alongside the GATE fields. That conflation was the machine that
// made 97 of 128 agents unroutable: the Task tool routes BY DESCRIPTION and needs
// a tools/model declaration, and this fence made carrying them a TEST FAILURE. The
// stubs were compliance, not neglect — the suite went green enforcing emptiness.
//
// The two halves are now separated, and the rule is TIGHTENED, not loosened:
//   - GATE fields stay BANNED. A wrapper must never carry approved_by or a gate
//     marker — 26 forged approved_by markers were removed from this repo on the
//     same day, so this half is load-bearing and non-negotiable.
//   - ROUTING fields are now REQUIRED, not forbidden. An agent with no description
//     is dead to the dispatcher no matter how green its coverage looks.
const FORBIDDEN_FRONTMATTER_KEYS = [
  'human_gate', 'review_gate', 'approved_by', 'gate', 'gate_crossed',
];

// The CLOSED key allowlist. The old fence's real strength was its closed world —
// frontmatter had to be EXACTLY {name, type, target_skill}, so nothing could leak
// in. That property is PRESERVED here; only the membership changed. A key outside
// this set still fails, which means a gate field cannot arrive merely by being
// absent from FORBIDDEN_FRONTMATTER_KEYS above. Closed world + named gate ban.
const REQUIRED_FRONTMATTER_KEYS = [
  // Resolution — what makes this a wrapper that finds its skill. Unchanged.
  'name', 'type', 'target_skill',
  // Routing — what makes it REACHABLE by the Task tool. Previously FORBIDDEN.
  'description', 'tools',
];
const PERMITTED_FRONTMATTER_KEYS = [
  // Dispatch metadata, propagated from the target skill. Previously FORBIDDEN.
  'model', 'effort', 'tier', 'reports_to', 'dispatch_protocol',
];
const ALLOWED_FRONTMATTER_KEYS = new Set([
  ...REQUIRED_FRONTMATTER_KEYS,
  ...PERMITTED_FRONTMATTER_KEYS,
]);

/**
 * Substantive prose lines of a target SKILL.md body (frontmatter stripped).
 * Used to check the single-source-of-truth rule against the REAL skill file
 * rather than by proxy: the wrapper must copy none of it.
 */
function skillBodyLines(targetSkill) {
  assert.match(targetSkill, TARGET_SKILL_RE, 'target_skill guard (no traversal)');
  const rawSkill = fs.readFileSync(path.join(SKILLS_ROOT, targetSkill, 'SKILL.md'), 'utf8');
  const m = rawSkill.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return (m ? m[1] : rawSkill)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 25);
}

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
      it('exists, resolves to its skill, and is DISPATCHABLE (real description + tools)', () => {
        const { frontmatter } = readWrapper(category, name);

        // Resolution AND routing keys must all be present.
        for (const key of REQUIRED_FRONTMATTER_KEYS) {
          assert.ok(key in frontmatter, `wrapper frontmatter must declare "${key}"`);
        }

        // Closed world preserved: nothing undocumented may leak in.
        const unknown = Object.keys(frontmatter).filter(
          (k) => !ALLOWED_FRONTMATTER_KEYS.has(k)
        );
        assert.deepStrictEqual(
          unknown, [],
          `wrapper frontmatter carries undocumented key(s): ${unknown.join(', ')}`
        );

        // The description IS the routing surface — the Task tool picks this agent
        // over its ~127 siblings by reading it. Absent or trivial means unroutable,
        // which is precisely what the replaced assertion mandated.
        assert.ok(
          frontmatter.description.trim().length >= 40,
          `description must be real (>=40 chars) — it is the routing surface. Got: ${JSON.stringify(frontmatter.description)}`
        );
        assert.ok(
          frontmatter.tools.trim().length > 0,
          `tools must name what the skill actually needs. Got: ${JSON.stringify(frontmatter.tools)}`
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

      it('body resolves to its own skill and delegates to it', () => {
        const { body } = readWrapper(category, name);
        assert.ok(body.length > 0, 'body must be non-empty');
        // Resolution half, asserted directly instead of by matching one sentence.
        assert.match(
          body,
          SKILL_REF_RE(category, name),
          `body must point at skills/${category}/${name}/SKILL.md`
        );
        // Delegation: what makes this a wrapper over the skill, not a rewrite of it.
        assert.match(
          body,
          DELEGATION_RE,
          'body must delegate the deep method to its skill (read it in full)'
        );
      });

      it('body is a real watcher, not an empty redirect', () => {
        const { body } = readWrapper(category, name);
        // TIGHTENING (owner, 2026-07-17). The replaced assertions required a
        // one-line body under 200 characters with no headings — they mandated the
        // stub. An agent is a class that USES skills; a skill is a function and
        // cannot watch a build. A wrapper with no Trigger has no answer to "when
        // does this look?", and an agent that never looks is not a watcher.
        for (const section of WATCHER_SECTIONS) {
          assert.ok(
            body.includes(section),
            `wrapper body must carry the watcher section "${section}" — a redirect-only body is the empty agent this fence used to mandate`
          );
        }
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

      it('restates NO skill rule — thin, body copies nothing from SKILL.md', () => {
        const { frontmatter, body } = readWrapper(category, name);
        // SECOND SCOPE CORRECTION (owner, 2026-07-17). The first correction moved
        // this rule from `raw` to `body` — right about the frontmatter, but it left
        // the emptiness assertions standing on the body:
        //     assert.ok(!/^#{1,6}\s/m.test(body), 'no markdown headings');
        //     assert.ok(!/```/.test(body),        'no fenced code blocks');
        //     assert.ok(body.length < 200,        'redirect sentence only');
        // Same conflation, one level down. This rule is named "copies nothing from
        // SKILL.md" — DUPLICATION. A heading is not duplication; a length is not
        // duplication; a fenced block is not duplication. Under those three lines
        // the only passing body was a stub: the fence did not permit the empty
        // agent, it REQUIRED it, and the suite went green enforcing that.
        //
        // Deleted rather than raised — raising 200 would be the ratchet-loosening
        // this repo bans AND would keep measuring the wrong property. Duplication is
        // now checked EXACTLY, line-by-line, against the real skill file below:
        // strictly stronger than a length proxy, since a 199-character body could
        // copy the skill's most important sentence and pass, while a long body that
        // shares no line with the skill duplicates nothing. Body SHAPE is pinned by
        // WATCHER_SECTIONS; the real watchers use fenced YAML for their mandatory
        // Output Format, so a blanket fence ban would forbid the shape being copied.
        //
        // The BAD/SAFE marker ban is KEPT: those mark the skill's own code examples,
        // and the agent delegates the method rather than restating the examples.
        assert.ok(!/\bBAD\b/.test(body), 'wrapper body must not copy BAD example markers');
        assert.ok(!/\bSAFE\b/.test(body), 'wrapper body must not copy SAFE example markers');

        // Single source of truth, checked against the REAL skill instead of by
        // proxy: no substantive line of the target SKILL.md may appear in the
        // wrapper. This is what stops a wrapper duplicating the skill body and
        // drifting from it — and it is stricter than the heuristics above, which
        // only guess at copied content by its punctuation.
        for (const line of skillBodyLines(frontmatter.target_skill)) {
          assert.ok(
            !body.includes(line),
            `wrapper body copies a line from skills/${frontmatter.target_skill}/SKILL.md: ${JSON.stringify(line.slice(0, 60))}`
          );
        }
      });
    });
  }
});
