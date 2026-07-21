/**
 * AGENT-LAYER REACHABILITY — a fence against "built, tested, shipped, invisible".
 *
 * `tests/reachability.test.js` proves every `src/**` file has a live JavaScript
 * caller. That is a REAL fence, but it measures the wrong axis for a capability
 * that exists to be used by the AGENT layer. The plan-index is the proof: `search`,
 * `related`, and `detectConflicts` were fully built, unit-tested, JavaScript-wired,
 * and passed the JavaScript-reachability fence at a baseline of zero dead files —
 * while ZERO agents and ZERO command prose ever mentioned them. Every critic agent
 * hand-grepped the plan corpus instead. A capability the agent layer cannot reach is
 * dead to the pipeline no matter how green its unit tests are.
 *
 * This fence pins a curated list of AGENT-FACING capabilities and asserts each one is
 * actually referenced by the agent layer: `src/commands/*.md` prose and the `.md` agent
 * definitions found recursively under `agents/`.
 *
 * ── THE LIMIT OF THIS FENCE (stated honestly, not oversold) ─────────────────────
 *
 * It proves a capability is MENTIONED in the agent layer. It does NOT prove the
 * capability is used, used correctly, used with the right arguments, or used well. A
 * paragraph that names `detectConflicts` and then calls it with a wrong signature
 * passes this fence. It is a FLOOR — the cheapest check that catches the specific,
 * repeated, expensive defect of shipping a capability no agent can see. Good usage is
 * the job of review and of the behavioral tests for each capability, not of this file.
 *
 * ── HOW A REFERENCE IS RECOGNIZED (not gameable by accident) ────────────────────
 *
 * A bare word must not satisfy the fence — the word "search" appears incidentally in
 * almost any prose. A capability counts as referenced only when BOTH hold in the same
 * agent-layer file:
 *   1. the capability name appears in a QUALIFIED form — preceded by `.` (a property
 *      or method access, e.g. `.detectConflicts(`) or wrapped in a backtick code span
 *      (e.g. `` `related` ``) — never as a bare prose word; and
 *   2. the owning module name (e.g. `plan-index`) appears within
 *      {@link PROXIMITY_CHARS} characters of that occurrence, so the reference
 *      demonstrably means THIS capability rather than a same-named unrelated thing.
 *
 * Cross-platform: path.join throughout; raw fs is permitted in tests/**.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const COMMANDS_DIR = path.join(REPO, 'src', 'commands');
const AGENTS_DIR = path.join(REPO, 'agents');

/**
 * How near the owning module name must sit to a qualified capability mention for the
 * mention to count as a reference to THAT capability. Wide enough to span a prose
 * paragraph that introduces the module then names its functions; narrow enough that an
 * unrelated `.search(` elsewhere in a long file cannot borrow the qualification.
 */
const PROXIMITY_CHARS = 600;

/**
 * The curated agent-facing capability list.
 *
 * Each entry is a capability that EXISTS TO BE USED BY THE AGENT LAYER. Adding a row
 * here is a claim: "an agent or a command recipe is supposed to be able to reach this."
 * Seeded with the three plan-index retrieval functions whose invisibility motivated the
 * fence — the hybrid lexical+semantic `search`, the neighbour surface `related`, and the
 * cross-plan `detectConflicts`.
 *
 * @type {Array<{ name: string, module: string, source: string, why: string }>}
 */
const AGENT_FACING_CAPABILITIES = [
  {
    name: 'search',
    module: 'plan-index',
    source: 'src/lib/plan-index/search.js',
    why: 'concept-presence over the plan corpus where wording may drift — grep gives false '
      + 'negatives the moment the wording changes; this is hybrid lexical BM25 + vector.',
  },
  {
    name: 'related',
    module: 'plan-index',
    source: 'src/lib/plan-index/related.js',
    why: 'the sibling plans a plan must be judged against — an agent cannot grep for '
      + '"plans like this one".',
  },
  {
    name: 'detectConflicts',
    module: 'plan-index',
    source: 'src/lib/plan-index/conflict-detect.js',
    why: 'cross-plan contradiction (section-vector similarity intersected with glob-aware '
      + '`files:` overlap) — two plans contradict without sharing a keyword, so grep '
      + 'cannot find this at all.',
  },
];

// ── corpus ───────────────────────────────────────────────────────────────────

/** Recursively collect every `.md` file under `dir` (absent dir → []). */
function collectMarkdown(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...collectMarkdown(full));
    else if (e.isFile() && e.name.endsWith('.md')) out.push(full);
  }
  return out;
}

/**
 * The agent layer as the fence sees it: command prose + agent definitions.
 * @returns {Array<{ file: string, text: string }>}
 */
function readAgentLayerCorpus() {
  const files = [...collectMarkdown(COMMANDS_DIR), ...collectMarkdown(AGENTS_DIR)];
  return files.map((file) => ({
    file: path.relative(REPO, file),
    text: fs.readFileSync(file, 'utf8'),
  }));
}

// ── detector (pure — exercised on synthetic corpora below) ───────────────────

/**
 * A qualified mention: the capability name preceded by `.` or a backtick, i.e. a
 * property/method access or a code span. A bare prose word never matches.
 * @param {string} name
 * @returns {RegExp} global regex
 */
function qualifiedMentionRegex(name) {
  return new RegExp(`(?:\\.|\`)${name}(?![A-Za-z0-9_])`, 'g');
}

/**
 * Is `capability` referenced anywhere in `corpus`?
 * @param {{name: string, module: string}} capability
 * @param {Array<{file: string, text: string}>} corpus
 * @returns {{ referenced: boolean, file: string|null }}
 */
function findReference(capability, corpus) {
  const re = qualifiedMentionRegex(capability.name);
  for (const { file, text } of corpus) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const from = Math.max(0, m.index - PROXIMITY_CHARS);
      const to = Math.min(text.length, m.index + m[0].length + PROXIMITY_CHARS);
      if (text.slice(from, to).includes(capability.module)) {
        return { referenced: true, file };
      }
    }
  }
  return { referenced: false, file: null };
}

/**
 * Every curated capability the agent layer does NOT reference.
 * @param {Array<{name: string, module: string, source?: string, why?: string}>} capabilities
 * @param {Array<{file: string, text: string}>} corpus
 * @returns {Array<{name: string, module: string, source?: string, why?: string}>}
 */
function findUnreferenced(capabilities, corpus) {
  return capabilities.filter((c) => !findReference(c, corpus).referenced);
}

/** The instructive failure message — it must teach, not just fail. */
function explain(missing) {
  return 'These capabilities are BUILT and JavaScript-reachable, but NO agent definition '
    + '(agents/**/*.md) and NO command prose (src/commands/*.md) references them. A '
    + 'capability the agent layer cannot reach is DEAD TO THE PIPELINE no matter how green '
    + 'its unit tests are — agents will keep hand-grepping around it forever.\n'
    + missing.map((c) => (
      `\n  • ${c.module}.${c.name}  (${c.source})\n`
      + `      what it is for: ${c.why}\n`
      + `      fix: reference it from the agent layer — name it in the dispatch recipe in\n`
      + `           src/commands/start.md, or in the agent definition that should use it,\n`
      + `           qualified (\`${c.name}\`) and near the module name ("${c.module}").`
    )).join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// The fence
// ═══════════════════════════════════════════════════════════════════════════

describe('agent-layer reachability — curated agent-facing capabilities are visible to agents', () => {
  it('NON-VACUITY: the scanned agent-layer corpus is real, not empty', () => {
    const corpus = readAgentLayerCorpus();
    // If the corpus reads as empty (a moved directory, a bad glob, a renamed folder)
    // every capability would trivially "pass" by never being looked for. Fail instead.
    assert.ok(
      corpus.length >= 100,
      `the agent-layer corpus reads as ${corpus.length} files — expected the real corpus `
      + '(src/commands/*.md + agents/**/*.md). An empty scan makes this fence vacuous.'
    );
    const chars = corpus.reduce((n, c) => n + c.text.length, 0);
    assert.ok(chars > 100000, `the agent-layer corpus reads as ${chars} characters — too small to be real`);
    assert.ok(
      corpus.some((c) => c.file === path.join('src', 'commands', 'start.md')),
      'src/commands/start.md must be part of the scanned corpus'
    );
    assert.ok(
      corpus.some((c) => c.file.startsWith(`agents${path.sep}`)),
      'agents/**/*.md must be part of the scanned corpus'
    );
  });

  it('RED-BEFORE-GREEN: the detector demonstrably FIRES on a capability the agent layer does not reference', () => {
    const cap = { name: 'detectConflicts', module: 'plan-index', source: 's', why: 'w' };

    // 1. An agent layer that never mentions it at all → flagged.
    const silent = [{ file: 'fake/a.md', text: 'This agent reads plans with Read and Grep.' }];
    assert.deepEqual(findUnreferenced([cap], silent).map((c) => c.name), ['detectConflicts'],
      'a capability absent from the agent layer MUST be flagged');

    // 2. The name present but NOT qualified (bare prose) → still flagged. This is the
    //    accidental-gaming case: prose that happens to contain the word.
    const bare = [{ file: 'fake/b.md', text: 'The plan-index can detectConflicts between plans someday.' }];
    assert.deepEqual(findUnreferenced([cap], bare).map((c) => c.name), ['detectConflicts'],
      'an unqualified bare-word mention MUST NOT satisfy the fence');

    // 3. Qualified but FAR from the module name → still flagged (it cannot be shown to
    //    mean this capability).
    const far = [{
      file: 'fake/c.md',
      text: 'plan-index' + ' '.repeat(PROXIMITY_CHARS + 50) + 'call `detectConflicts` here',
    }];
    assert.deepEqual(findUnreferenced([cap], far).map((c) => c.name), ['detectConflicts'],
      'a qualified mention far from its module MUST NOT satisfy the fence');

    // 4. Qualified AND near the module name → NOT flagged. The detector is not simply
    //    always-fail; it recognizes a real reference.
    const real = [{
      file: 'fake/d.md',
      text: "The dispatcher runs require('src/lib/plan-index').detectConflicts(ref) and passes the rows in.",
    }];
    assert.deepEqual(findUnreferenced([cap], real), [],
      'a qualified mention near its module IS a reference — the detector must not always fail');

    // 5. The failure message actually names the capability and its purpose.
    const msg = explain([cap]);
    assert.match(msg, /detectConflicts/, 'the message names the capability');
    assert.match(msg, /DEAD TO THE PIPELINE/, 'the message states the consequence');
    assert.match(msg, /src\/commands\/start\.md/, 'the message names where to fix it');
  });

  it('the curated list is non-empty and every entry names a source file that exists on disk', () => {
    assert.ok(AGENT_FACING_CAPABILITIES.length >= 3, 'the curated list must not be emptied to make the fence pass');
    for (const c of AGENT_FACING_CAPABILITIES) {
      const abs = path.join(REPO, ...c.source.split('/'));
      assert.ok(fs.existsSync(abs), `${c.module}.${c.name} claims source ${c.source}, which does not exist`);
      const src = fs.readFileSync(abs, 'utf8');
      assert.match(src, new RegExp(`\\b${c.name}\\b`),
        `${c.source} must actually define ${c.name} — the fence must pin a real capability`);
    }
  });

  it('FENCE: every curated agent-facing capability is referenced by the agent layer', () => {
    const corpus = readAgentLayerCorpus();
    assert.ok(corpus.length >= 100, 'corpus non-vacuity (guarded again at the point of use)');
    const missing = findUnreferenced(AGENT_FACING_CAPABILITIES, corpus);
    assert.deepEqual(missing.map((c) => `${c.module}.${c.name}`), [], explain(missing));
  });

  it('the plan-index retrieval trio is reachable from the command prose specifically', () => {
    // The menu is the driver: it is where the dispatcher recipe lives, so the three
    // retrieval functions must be reachable from command prose, not only from some
    // agent definition that might be deleted independently.
    const commands = collectMarkdown(COMMANDS_DIR).map((file) => ({
      file: path.relative(REPO, file),
      text: fs.readFileSync(file, 'utf8'),
    }));
    assert.ok(commands.length >= 1, 'command prose corpus is non-empty');
    const missing = findUnreferenced(AGENT_FACING_CAPABILITIES, commands);
    assert.deepEqual(missing.map((c) => `${c.module}.${c.name}`), [], explain(missing));
  });
});
