'use strict';

// CU5-s4 — content-contract test for the compliance + ai-quality Tier-2
// wrappers. Reads the REAL wrapper .md files off disk (zero test doubles) and
// asserts the DISPATCHABLE wrapper schema (resolution keys + routing keys, closed
// allowlist), target_skill resolution to a real SKILL.md, the redirect sentence,
// and the "restate NO rule" (thin BODY) invariant.
//
// gdpr reconciliation (CU5-s5): compliance/gdpr-compliance-checker gets NO thin
// wrapper. EC2-s3 (tests/gdpr-agent-definition.test.js) deleted the old thin
// wrapper because the rich agents/compliance/gdpr-agent.md subsumes it, and
// mandates it stay deleted. Re-adding a thin wrapper would regress that shipped
// contract. So this slice asserts the INVERSE coexistence invariant: the thin
// wrapper must NOT exist, and the skill is dispatch-reachable only via the rich
// agent. Only sbom-cra-checker and llm-security-tester are thin-wrapped by s4.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');

// Wrappers keyed by their agent category directory.
// NOTE: gdpr-compliance-checker is intentionally absent — it is rich-covered by
// gdpr-agent.md and MUST NOT get a thin wrapper (EC2-s3). See the gdpr test below.
const WRAPPERS = [
  { name: 'sbom-cra-checker', category: 'compliance' },
  { name: 'llm-security-tester', category: 'ai-quality' },
];

// REPLACED CONTRACT (owner, 2026-07-17: "give each wrapper a real description and
// tools, make them dispatchable" / "NO EMPTY AGENTS").
//
// This file previously read:
//   const FORBIDDEN_FIELDS = ['tier','reports_to','dispatch_protocol','model','tools'];
// plus an "exactly {name,type,target_skill}" assertion. Those FORBADE the routing
// surface: the Task tool routes agents BY THEIR DESCRIPTION and needs a tools
// declaration, so a routable agent was a TEST FAILURE here. That is the machine
// that made 97 of 128 agents descriptionless stubs — the stubs were COMPLIANCE,
// not neglect, and the suite went green enforcing that every agent was invisible
// to the dispatcher.
//
// The two conflated halves are now separated, and the rule is TIGHTENED, not
// loosened:
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

// target_skill guard — literal "<category>/<name>" only (no traversal).
const TARGET_SKILL_RE = /^(compliance|ai-quality)\/[a-z0-9-]+$/;

// REPLACED CONTRACT — second scope correction (owner, 2026-07-17: an agent is a
// standing WATCHER that USES skills; "an agent that merely redirects to one skill
// is worthless"; "SKILLS CANNOT WATCH A BUILD, THEY ARE USED BY AN AGENT").
//
// This was an anchored full-body regex: the body had to BE the redirect sentence
// and nothing else. With `body.length < 200` below, it did not assert that the
// wrapper DELEGATES — it asserted that the wrapper is EMPTY. Same conflation the
// earlier `raw`→`body` correction fixed one level up: the rule these assertions sit
// under is named "copies nothing from SKILL.md" — DUPLICATION, not length.
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

function readWrapper(category, name) {
  const file = path.join(REPO_ROOT, 'agents', category, `${name}.md`);
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

for (const { name, category } of WRAPPERS) {
  test(`${name}: exists, resolves to its skill, and is DISPATCHABLE`, () => {
    const { keys, front } = readWrapper(category, name);

    // REPLACED CONTRACT (owner, 2026-07-17). Asserting EXACTLY three keys forbade
    // the description the Task tool routes on — the machine behind 97 unroutable
    // agents. TIGHTENED: still resolves to its skill, and now must be dispatchable.
    for (const f of REQUIRED_FIELDS) {
      assert.ok(keys.includes(f), `${name}.md frontmatter must declare "${f}"`);
    }

    // Closed world preserved: nothing undocumented may leak in.
    const unknown = keys.filter((k) => !ALLOWED_FIELDS.has(k));
    assert.deepEqual(unknown, [], `${name}.md carries undocumented key(s): ${unknown.join(', ')}`);

    assert.equal(front.name, name, `name must equal "${name}"`);
    assert.equal(front.type, 'wrapper', 'wrapper must stay type: wrapper');
    assert.equal(front.target_skill, `${category}/${name}`, 'wrapper must target its skill');

    // The description IS the routing surface — the Task tool picks this agent over
    // its ~127 siblings by reading it. Absent or trivial means unroutable.
    assert.ok(String(front.description || '').trim().length >= 40,
      `${name}.md needs a real description — it is the routing surface`);
    assert.ok(String(front.tools || '').trim().length > 0,
      `${name}.md must declare the tools its skill actually needs`);
  });

  test(`${name}: type is wrapper`, () => {
    const { front } = readWrapper(category, name);
    assert.equal(front.type, 'wrapper');
  });

  test(`${name}: target_skill is ${category}/<name>`, () => {
    const { front } = readWrapper(category, name);
    assert.equal(front.target_skill, `${category}/${name}`);
    // name equals last segment of target_skill.
    assert.equal(front.target_skill.split('/').pop(), front.name);
  });

  test(`${name}: target_skill resolves to a real SKILL.md (no dangling)`, () => {
    const { front } = readWrapper(category, name);
    assert.match(front.target_skill, /^(compliance|ai-quality)\/[a-z0-9-]+$/, 'target_skill guard');
    const skillFile = path.join(REPO_ROOT, 'skills', front.target_skill, 'SKILL.md');
    assert.ok(
      fs.existsSync(skillFile),
      `target_skill must resolve to an existing SKILL.md: ${skillFile}`
    );
  });

  test(`${name}: body resolves to its own skill and delegates to it`, () => {
    const { body } = readWrapper(category, name);
    // Resolution half, asserted directly instead of by matching one exact sentence.
    assert.match(
      body,
      SKILL_REF_RE(category, name),
      `${name}.md body must point at skills/${category}/${name}/SKILL.md`
    );
    // Delegation: what makes this a wrapper over the skill, not a rewrite of it.
    assert.match(
      body,
      DELEGATION_RE,
      `${name}.md body must delegate the deep method to its skill (read it in full)`
    );
  });

  test(`${name}: body is a real watcher, not an empty redirect`, () => {
    const { body } = readWrapper(category, name);
    // TIGHTENING (owner, 2026-07-17). The replaced assertions required a one-line
    // body under 200 characters — they mandated the stub. An agent is a class that
    // USES skills; a skill is a function and cannot watch a build. A wrapper with no
    // Trigger has no answer to "when does this look?", and an agent that never looks
    // is not a watcher.
    for (const section of WATCHER_SECTIONS) {
      assert.ok(
        body.includes(section),
        `${name}.md body must carry the watcher section "${section}" — a redirect-only body is the empty agent this fence used to mandate`
      );
    }
  });

  test(`${name}: thin — body restates NO rule, and carries no gate field`, () => {
    const { keys, raw, front, body } = readWrapper(category, name);
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
    //     assert.ok(body.length < 200,    'body must be the redirect sentence only');
    // Same conflation, one level down. This test is named "body restates NO rule" —
    // a DUPLICATION rule. A line count is not duplication; it is length. Under those
    // two lines the only passing body was a stub, so the fence did not permit the
    // empty agent — it REQUIRED it, and the suite went green enforcing that these
    // watchers stayed bodiless.
    //
    // Deleted rather than raised: raising 200 would be the ratchet-loosening this
    // repo bans and would keep measuring the wrong thing. Duplication is now checked
    // EXACTLY, line-by-line, against the real skill file below — strictly stronger
    // than any length proxy, since a 199-character body could copy the skill's most
    // important sentence and pass, while a long body sharing no line with the skill
    // genuinely duplicates nothing. Body SHAPE is pinned by WATCHER_SECTIONS above.

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

// gdpr reconciliation invariant (real files): the thin gdpr-compliance-checker
// wrapper must NOT exist — the skill is dispatch-reachable ONLY via the rich
// gdpr-agent.md, which subsumed and deleted the thin wrapper in EC2-s3. This is
// the inverse of the original s4 coexistence premise, reconciled in CU5-s5 to
// avoid regressing the shipped EC2-s3 contract (tests/gdpr-agent-definition.test.js).
test('gdpr: NO thin wrapper; skill is rich-covered by gdpr-agent.md (EC2-s3 honored)', () => {
  const wrapperFile = path.join(REPO_ROOT, 'agents', 'compliance', 'gdpr-compliance-checker.md');
  const richFile = path.join(REPO_ROOT, 'agents', 'compliance', 'gdpr-agent.md');

  // The thin wrapper must NOT exist (EC2-s3 deleted it; CU5 does not re-add it).
  assert.equal(
    fs.existsSync(wrapperFile),
    false,
    'agents/compliance/gdpr-compliance-checker.md must stay deleted (subsumed by gdpr-agent.md per EC2-s3)'
  );

  // The rich agent must exist and cover the skill by body path.
  assert.ok(fs.existsSync(richFile), 'rich gdpr-agent.md must exist (skill coverage)');
  const richRaw = fs.readFileSync(richFile, 'utf8');
  assert.match(
    richRaw,
    /skills\/compliance\/gdpr-compliance-checker/,
    'gdpr-agent.md must reference skills/compliance/gdpr-compliance-checker (delegation)'
  );

  // The rich gdpr-agent.md is NOT type: wrapper.
  const richFrontMatch = richRaw.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(richFrontMatch, 'gdpr-agent.md must have a YAML frontmatter block');
  const richType = richFrontMatch[1]
    .split('\n')
    .map((l) => l.match(/^type:\s*(.*)$/))
    .filter(Boolean)
    .map((m) => m[1].trim())[0];
  assert.notEqual(richType, 'wrapper', 'rich gdpr-agent.md must NOT be type: wrapper');
});
