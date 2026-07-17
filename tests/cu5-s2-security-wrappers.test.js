'use strict';

// CU5-s2 — content-contract test for the three security Tier-2 wrappers.
// Reads the REAL wrapper .md files off disk (zero test doubles) and asserts the
// DISPATCHABLE wrapper schema (resolution keys + routing keys, closed allowlist),
// target_skill resolution to a real SKILL.md, the redirect sentence, and the
// "restate NO rule" (thin BODY) invariant.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const AGENTS_DIR = path.join(REPO_ROOT, 'agents', 'security');

const WRAPPERS = ['cra-incident-clocks', 'incident-responder', 'threat-modeler'];

// REPLACED CONTRACT (owner, 2026-07-17: "give each wrapper a real description and
// tools, make them dispatchable" / "NO EMPTY AGENTS").
//
// The routing fields (description/tools/model/effort/tier/reports_to/
// dispatch_protocol) were FORBIDDEN here, conflated with the gate fields in one
// list. That is the machine that made 97 of 128 agents unroutable: the Task tool
// routes agents BY THEIR DESCRIPTION and needs a tools declaration, and this fence
// made carrying them a TEST FAILURE. The stubs were compliance, not neglect — the
// suite went green enforcing that every agent was invisible to the dispatcher.
//
// The two halves are now separated, and the rule is TIGHTENED, not loosened:
//   - GATE fields stay BANNED. A wrapper must never carry approved_by or a gate
//     marker — 26 forged approved_by markers were removed from this repo on the
//     same day, so this half is load-bearing and non-negotiable.
//   - ROUTING fields become REQUIRED. An agent with no description is dead to the
//     dispatcher no matter how green its coverage looks.
//
// The old fence's real strength was its closed world (frontmatter had to be
// EXACTLY three keys). That property is PRESERVED by ALLOWED_FIELDS below; only
// the membership changed. A key outside the set still fails — so a gate field
// cannot arrive merely by being absent from GATE_FIELDS.
const REQUIRED_FIELDS = [
  // Resolution — what makes this a wrapper that finds its skill. Unchanged.
  'name', 'type', 'target_skill',
  // Routing — what makes it REACHABLE by the Task tool. Previously FORBIDDEN.
  'description', 'tools',
];
const PERMITTED_FIELDS = [
  // Dispatch metadata, propagated from the target skill. Previously FORBIDDEN.
  'model', 'effort', 'tier', 'reports_to', 'dispatch_protocol',
];
const ALLOWED_FIELDS = new Set([...REQUIRED_FIELDS, ...PERMITTED_FIELDS]);

// Gate fields that must never be present (no human gate weakened).
const GATE_FIELDS = ['human_gate', 'review_gate', 'approved_by'];

// target_skill guard — literal "security/<name>" only (no traversal).
const TARGET_SKILL_RE = /^security\/[a-z0-9-]+$/;

// REPLACED CONTRACT — second scope correction (owner, 2026-07-17: an agent is a
// standing WATCHER that USES skills; "an agent that merely redirects to one skill
// is worthless").
//
// This used to be an anchored full-body regex: the body had to BE the redirect
// sentence and nothing else. Combined with `body.length < 200` and the no-headings
// rule below, it did not assert that the wrapper delegates — it asserted that the
// wrapper is EMPTY. That is the same conflation the earlier `raw`→`body` correction
// fixed one level up: the rule is named "the wrapper copies nothing from SKILL.md",
// which is a statement about DUPLICATION, not about length.
//
// The real contract has two halves and BOTH are kept:
//   1. RESOLUTION — the body must still point at its own SKILL.md and instruct that
//      it be read in full. That is the entire semantic content the redirect
//      sentence carried, and it is now asserted directly instead of by matching one
//      exact string.
//   2. NON-DUPLICATION — the body must copy no substantive line of the skill. This
//      was always the load-bearing half, it is exact rather than a proxy, and it is
//      preserved untouched below.
//
// And the fence is TIGHTENED, not loosened: a body that resolves and duplicates
// nothing but says nothing is now a FAILURE, because WATCHER_SECTIONS below
// requires the sections that make it a watcher. The old fence permitted — in fact
// mandated — exactly the empty stub the owner rejected. No numeric cap is raised to
// turn red green; the length assertions are deleted because length was never the
// contract, and duplication (which is) is checked line-by-line against the real
// skill file.
const SKILL_REF_RE = (name) =>
  new RegExp(`skills/security/${name}/SKILL\\.md`);
const DELEGATION_RE = /[Rr]ead (that file|it) in full/;

// The sections that make a body a standing watcher rather than a redirect stub.
// A skill is passive and cannot watch a build; an agent watches and delegates the
// deep method to the skill. These headings are the shape the restored watchers use
// (see agents/quality/architecture-checker.md, agents/security/security-scanner.md).
const WATCHER_SECTIONS = [
  '## Role',
  '## Trigger',
  '## Checks',
  '## Output Format (MANDATORY)',
  '## Blocking Rules',
  '## Related Agents',
];

/**
 * Substantive prose lines of a target SKILL.md body (frontmatter stripped).
 * Used to check the single-source-of-truth rule against the REAL skill file
 * rather than by proxy: the wrapper must copy none of it.
 */
function skillBodyLines(targetSkill) {
  assert.match(targetSkill, TARGET_SKILL_RE, 'target_skill guard (no traversal)');
  const rawSkill = fs.readFileSync(path.join(REPO_ROOT, 'skills', targetSkill, 'SKILL.md'), 'utf8');
  const m = rawSkill.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return (m ? m[1] : rawSkill)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 25);
}

function readWrapper(name) {
  const file = path.join(AGENTS_DIR, `${name}.md`);
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  assert.ok(m, `${name}.md must have a single YAML frontmatter block`);
  const frontRaw = m[1];
  const body = m[2].trim();

  const front = {};
  const keys = [];
  for (const line of frontRaw.split('\n')) {
    if (!line.trim()) continue;
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    assert.ok(kv, `${name}.md frontmatter line not key: value → "${line}"`);
    const key = kv[1];
    keys.push(key);
    front[key] = kv[2].trim();
  }
  return { file, raw, front, keys, body };
}

for (const name of WRAPPERS) {
  test(`${name}: exists, resolves to its skill, and is DISPATCHABLE`, () => {
    const { keys, front } = readWrapper(name);

    // REPLACED CONTRACT (owner, 2026-07-17). Asserting EXACTLY three keys forbade
    // the description the Task tool routes on — the machine behind 97 unroutable
    // agents. TIGHTENED: still resolves to its skill, and now must be dispatchable.
    for (const f of REQUIRED_FIELDS) {
      assert.ok(keys.includes(f), `${name}.md frontmatter must declare "${f}"`);
    }

    // Closed world preserved: nothing undocumented may leak in.
    const unknown = keys.filter((k) => !ALLOWED_FIELDS.has(k));
    assert.deepEqual(unknown, [], `${name}.md carries undocumented key(s): ${unknown.join(', ')}`);

    assert.equal(front.name, name, 'wrapper must declare its own name');
    assert.equal(front.type, 'wrapper', 'wrapper must stay type: wrapper');
    assert.ok(String(front.target_skill || '').length > 0, 'wrapper must target its skill');

    // The description IS the routing surface — the Task tool picks this agent over
    // its ~127 siblings by reading it. Absent or trivial means unroutable.
    assert.ok(String(front.description || '').trim().length >= 40,
      `${name}.md needs a real description — it is the routing surface`);
    assert.ok(String(front.tools || '').trim().length > 0,
      `${name}.md must declare the tools its skill actually needs`);
  });

  test(`${name}: type is wrapper`, () => {
    const { front } = readWrapper(name);
    assert.equal(front.type, 'wrapper');
  });

  test(`${name}: target_skill is security/<name>`, () => {
    const { front } = readWrapper(name);
    assert.equal(front.target_skill, `security/${name}`);
    // name equals last segment of target_skill.
    assert.equal(front.target_skill.split('/').pop(), front.name);
  });

  test(`${name}: target_skill resolves to a real SKILL.md (no dangling)`, () => {
    const { front } = readWrapper(name);
    assert.match(front.target_skill, /^security\/[a-z0-9-]+$/, 'target_skill guard');
    const skillFile = path.join(REPO_ROOT, 'skills', front.target_skill, 'SKILL.md');
    assert.ok(
      fs.existsSync(skillFile),
      `target_skill must resolve to an existing SKILL.md: ${skillFile}`
    );
  });

  test(`${name}: body resolves to its own skill and delegates to it`, () => {
    const { body } = readWrapper(name);
    // Resolution half of the replaced contract, asserted directly rather than by
    // matching one exact sentence. The wrapper must still name its own SKILL.md...
    assert.match(
      body,
      SKILL_REF_RE(name),
      `${name}.md body must point at skills/security/${name}/SKILL.md`
    );
    // ...and must still instruct that the skill be read in full — the delegation
    // that makes this a wrapper over that skill and not a reimplementation of it.
    assert.match(
      body,
      DELEGATION_RE,
      `${name}.md body must delegate the deep method to its skill (read it in full)`
    );
  });

  test(`${name}: body is a real watcher, not an empty redirect`, () => {
    const { body } = readWrapper(name);
    // TIGHTENING (owner, 2026-07-17). The replaced assertions required this body to
    // be one line under 200 chars with no headings — they mandated the stub. An
    // agent is a class that USES skills; a skill is a function and cannot watch a
    // build. A wrapper with no Trigger has no answer to "when does this look?", and
    // an agent that never looks is not a watcher.
    for (const section of WATCHER_SECTIONS) {
      assert.ok(
        body.includes(section),
        `${name}.md body must carry the watcher section "${section}" — a redirect-only body is the empty agent this fence used to mandate`
      );
    }
  });

  test(`${name}: thin — body restates NO rule, and carries no gate field`, () => {
    const { keys, raw, front, body } = readWrapper(name);
    for (const g of GATE_FIELDS) {
      assert.ok(!keys.includes(g), `${name}.md must not carry gate field "${g}"`);
      // Gate invariant asserted against the WHOLE file text, not just the keys:
      // a gate marker is forbidden in the body too. This half of the fence is
      // load-bearing — 26 forged approved_by markers were removed from this repo
      // on 2026-07-17 — and is deliberately left exactly as strict.
      assert.ok(!raw.includes(g), `${name}.md must not mention gate field "${g}" anywhere`);
    }

    // SECOND SCOPE CORRECTION (owner, 2026-07-17). The first correction moved this
    // rule from `raw` to `body` — right about the frontmatter, but it left the
    // emptiness assertions standing on the body:
    //     assert.ok(!body.includes('\n'), 'body must stay a single line');
    //     assert.ok(body.length < 200,   'body must be the redirect sentence only');
    // Those are the same conflation one level down. This test is named "body
    // restates NO rule" — a DUPLICATION rule. A line count is not duplication; it is
    // length. Under those two lines the only passing body was a stub, so the fence
    // did not permit the empty agent, it REQUIRED it, and the suite went green
    // enforcing that 26 watchers stayed bodiless.
    //
    // They are deleted rather than raised: raising 200 to some larger number would
    // be the ratchet-loosening this repo bans, and would keep measuring the wrong
    // thing. Duplication is now checked EXACTLY, line-by-line, against the real
    // skill file below — which is strictly stronger than any length proxy, since a
    // 199-character body could copy the skill's most important sentence and pass,
    // while a 6000-character body that shares no line with the skill is genuinely
    // non-duplicating. The body's SHAPE is pinned by WATCHER_SECTIONS above.

    // Single source of truth, checked against the REAL skill instead of by proxy:
    // no substantive line of the target SKILL.md may appear in the wrapper. This
    // is what stops a wrapper duplicating the skill body and drifting from it.
    for (const line of skillBodyLines(front.target_skill)) {
      assert.ok(
        !body.includes(line),
        `${name}.md body copies a line from skills/${front.target_skill}/SKILL.md: ${JSON.stringify(line.slice(0, 60))}`
      );
    }
  });
}
