'use strict';

/**
 * Agent dispatch resolution — registry surface (W04 · s1).
 *
 * Asserts RESOLUTION, not string presence: every agent named by
 * `.ctoc/operations-registry.yaml` (its `path:` entries and its `iron_loop:`
 * name references) must resolve, via the project's own runtime resolver
 * (`src/lib/agent-resolver.js`), to a real dispatchable file under the REAL
 * `agents/` tree. No fixtures, no doubles — the test reads the live tree
 * read-only so it tracks reality and catches drift on every run.
 *
 * The shared helpers (`buildNameIndex`, `resolvesName`, `RESOLVES`,
 * `RETIRED_PHANTOMS`, `TRIO`) live at the top of the file: sibling slice `s2`
 * extends this same file with the step-table and coordinator surfaces and
 * reuses them.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { resolveAgent } = require('../src/lib/agent-resolver');

const ROOT = path.join(__dirname, '..');
const REGISTRY_PATH = path.join(ROOT, '.ctoc', 'operations-registry.yaml');

// ---------------------------------------------------------------------------
//  Shared helpers (s2 reuses these — do not inline elsewhere)
// ---------------------------------------------------------------------------

// A registry reference is considered RESOLVED when the resolver finds a real
// dispatchable target: an original agent file, OR a redirect stub that points
// at an existing skill (`kind: 'redirected'`). Both are non-dangling — the
// parent acceptance criterion is "0 dangling paths", and a redirect stub is a
// valid dispatch target, not a dangling pointer. `not-found` and
// `broken-redirect` are the failure kinds.
function RESOLVES(kind) {
  return kind === 'original' || kind === 'redirected';
}

// Tolerant frontmatter parser — identical strategy to
// tests/architecture-invariants.test.js so W03's heading-first defect (a
// leading `# H1` before the `---` block) does not couple in here. Matches an
// anchored `---` block first, then a mid-file `---` block as a fallback.
function readFrontmatter(content) {
  const fm = content.match(/^---\n([\s\S]*?)\n---/m) || content.match(/\n---\n([\s\S]*?)\n---/);
  return fm ? fm[1] : null;
}

// Walk agents/**/*.md, extract each file's declared `name:`, and build a
// Map<name, relPath>. Skips dot- and underscore-prefixed entries (shared prose
// fragments and hidden dirs) to mirror the resolver's own walk.
function buildNameIndex() {
  const idx = new Map();
  const agentsDir = path.join(ROOT, 'agents');
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.md')) {
        const fmBody = readFrontmatter(fs.readFileSync(full, 'utf8'));
        if (!fmBody) continue;
        const nameMatch = fmBody.match(/^name:\s*(.+)$/m);
        if (nameMatch) idx.set(nameMatch[1].trim(), path.relative(ROOT, full));
      }
    }
  }
  walk(agentsDir);
  return idx;
}

// A NAME resolves when the index knows it AND its file resolves to a real
// dispatchable target.
function resolvesName(idx, name) {
  if (!idx.has(name)) return false;
  return RESOLVES(resolveAgent(idx.get(name), ROOT).kind);
}

// The 10 phantom step-agent names retired under Option B (their role folds into
// a trio member). None may survive anywhere in the registry.
const RETIRED_PHANTOMS = [
  'test-maker', 'quality-checker', 'implementer', 'self-reviewer', 'optimizer',
  'verifier', 'documenter', 'implementation-reviewer', 'functional-reviewer',
  'implementation-plan-reviewer',
];

// The real trio the phantom step-agents fold into.
const TRIO = ['iron-loop-executor', 'iron-loop-critic', 'iron-loop-integrator'];

// Model each trio member DECLARES on disk — read live so the assertion is a
// regeneration-from-disk invariant, not a hard-coded guess.
function onDiskModel(idx, name) {
  const rel = idx.get(name);
  if (!rel) return null;
  const fmBody = readFrontmatter(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  if (!fmBody) return null;
  const m = fmBody.match(/^model:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

function loadRegistry() {
  return yaml.load(fs.readFileSync(REGISTRY_PATH, 'utf8'));
}

// Collect every agent NAME the `iron_loop:` block references: each step's
// `agents: [...]` entries plus every string-valued `review_gate:`.
function collectIronLoopNames(reg) {
  const names = new Set();
  const il = reg.iron_loop || {};
  for (const [key, phase] of Object.entries(il)) {
    if (!Array.isArray(phase)) continue; // skip `version`
    for (const step of phase) {
      for (const a of step.agents || []) names.add(a);
      if (typeof step.review_gate === 'string') names.add(step.review_gate);
    }
    void key;
  }
  return names;
}

// ---------------------------------------------------------------------------
//  Registry-surface test cases
// ---------------------------------------------------------------------------

describe('agent-dispatch-resolution — registry surface', () => {
  it('case 1: every agents.<k>.path resolves to a real dispatchable file', () => {
    const reg = loadRegistry();
    const dangling = [];
    for (const [key, entry] of Object.entries(reg.agents || {})) {
      const kind = resolveAgent(entry.path, ROOT).kind;
      if (!RESOLVES(kind)) dangling.push(`${key} -> ${entry.path} (${kind})`);
    }
    assert.deepEqual(
      dangling, [],
      `registry has dangling agent path(s):\n  ${dangling.join('\n  ')}`,
    );
  });

  it('case 2: every iron_loop.* agent name resolves', () => {
    const reg = loadRegistry();
    const idx = buildNameIndex();
    const unresolved = [];
    for (const name of collectIronLoopNames(reg)) {
      if (!resolvesName(idx, name)) unresolved.push(name);
    }
    assert.deepEqual(
      unresolved, [],
      `iron_loop names that fail to resolve: ${unresolved.join(', ')}`,
    );
  });

  it('case 3: no retired phantom name remains anywhere in the registry', () => {
    const reg = loadRegistry();
    const offenders = [];
    for (const phantom of RETIRED_PHANTOMS) {
      // as an agents: key
      if (reg.agents && Object.prototype.hasOwnProperty.call(reg.agents, phantom)) {
        offenders.push(`agents.${phantom} (key)`);
      }
      // as a path: basename
      for (const [key, entry] of Object.entries(reg.agents || {})) {
        if (entry.path && path.basename(entry.path) === `${phantom}.md`) {
          offenders.push(`agents.${key}.path -> ${entry.path}`);
        }
      }
      // as an iron_loop agents[] element or review_gate value
      if (collectIronLoopNames(reg).has(phantom)) {
        offenders.push(`iron_loop reference: ${phantom}`);
      }
    }
    assert.deepEqual(
      offenders, [],
      `retired phantom name(s) still present:\n  ${offenders.join('\n  ')}`,
    );
  });

  it('case 4: trio present in registry with resolving path and disk-matching model', () => {
    const reg = loadRegistry();
    const idx = buildNameIndex();
    for (const name of TRIO) {
      const entry = (reg.agents || {})[name];
      assert.ok(entry, `trio member '${name}' missing from registry agents:`);
      const kind = resolveAgent(entry.path, ROOT).kind;
      assert.ok(
        RESOLVES(kind),
        `trio member '${name}' path does not resolve: ${entry.path} (${kind})`,
      );
      const diskModel = onDiskModel(idx, name);
      assert.equal(
        entry.model, diskModel,
        `trio member '${name}' registry model '${entry.model}' != on-disk model '${diskModel}'`,
      );
    }
  });

  it('case 5: drift guard — a nonexistent agent path resolves to not-found', () => {
    // Proves the walk/resolver catches a later rename or delete, so registry
    // drift after regeneration is still caught on the next run.
    const kind = resolveAgent('agents/iron-loop/__does_not_exist__.md', ROOT).kind;
    assert.equal(kind, 'not-found');
  });

  it('case 6: red-before-fix proof — pre-fix registry paths resolve to not-found', () => {
    // These paths were live `path:` entries in the registry before this slice.
    // Asserting they resolve to not-found proves the resolver actually detects
    // the pre-fix dangling-pointer defect class rather than passing vacuously.
    const PRE_FIX_DANGLING = [
      'agents/implementation/implementer.md',
      'agents/planning/functional-reviewer.md',
      'agents/implementation/verifier.md',
    ];
    for (const p of PRE_FIX_DANGLING) {
      assert.equal(
        resolveAgent(p, ROOT).kind, 'not-found',
        `expected pre-fix path '${p}' to be not-found (detector proof)`,
      );
    }
  });
});

// ===========================================================================
//  Step-table (CLAUDE.md) + coordinator (cto-chief.md) surfaces (W04 · s2)
//
//  Extends the s1 registry surface above, reusing its shared helpers
//  (buildNameIndex, resolvesName, RETIRED_PHANTOMS). These two surfaces are the
//  human-facing half of the Option-B story: CLAUDE.md's Iron Loop step table
//  and cto-chief's per-step "Owner sub-orchestrator:" dispatch lines must name
//  only agents that resolve to a real file, and no retired phantom name may
//  survive in either. Files are read live and read-only, so the assertions
//  track the real tree and catch drift on every run.
// ===========================================================================

const CLAUDE_MD_PATH = path.join(ROOT, 'CLAUDE.md');
const CTO_CHIEF_PATH = path.join(ROOT, 'agents', 'coordinator', 'cto-chief.md');

// Candidate dispatchable-agent tokens are lowercase, hyphenated identifiers
// (e.g. `iron-loop-executor`, `product-owner`). Model words (`opus`, `sonnet`)
// and single-word English carry no hyphen and are excluded — every real CTOC
// agent name is hyphenated. Used only for the RESOLUTION assertions; phantom
// detection below scans by whole-word boundary so it also catches the
// single-word phantoms (`implementer`, `optimizer`, `verifier`, `documenter`).
const AGENT_TOKEN = /[a-z][a-z0-9]*(?:-[a-z0-9]+)+/g;
const AGENT_LIKE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/;

function agentTokens(text) {
  return text.match(AGENT_TOKEN) || [];
}

// Which retired phantom names appear as whole words in a string. Whole-word
// matching (not the hyphen-token regex) is what catches the four non-hyphenated
// phantoms; phantom names are [a-z-] only, so they are literal in a RegExp.
function phantomsInText(text) {
  return RETIRED_PHANTOMS.filter((p) => new RegExp(`\\b${p}\\b`).test(text));
}

// Extract the Agent-column cell for every data row of CLAUDE.md's Iron Loop
// step table (the markdown table headed `| Step | Label | Agent | Phase |`).
// Splits on `\r?\n` so a CRLF checkout parses identically.
function stepTableAgentColumns() {
  const lines = fs.readFileSync(CLAUDE_MD_PATH, 'utf8').split(/\r?\n/);
  const headerIdx = lines.findIndex((l) =>
    /^\|\s*Step\s*\|\s*Label\s*\|\s*Agent\s*\|\s*Phase\s*\|/.test(l));
  if (headerIdx === -1) {
    throw new Error('CLAUDE.md Iron Loop step-table header not found');
  }
  const cols = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|')) break;                 // table ended
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 4) continue;
    if (/^:?-+:?$/.test(cells[3])) continue;          // separator row
    cols.push(cells[3]);                              // Agent column
  }
  return cols;
}

// Every "Owner sub-orchestrator:" / "Owner sub-orchestrators:" dispatch line in
// cto-chief.md, returned as the text AFTER the colon.
function ownerDispatchLines() {
  const content = fs.readFileSync(CTO_CHIEF_PATH, 'utf8');
  const out = [];
  const re = /^Owner sub-orchestrators?:\s*(.+)$/gm;
  let m;
  while ((m = re.exec(content)) !== null) out.push(m[1].trim());
  return out;
}

// Backticked tokens on a line (the dispatch lines wrap each agent name in
// backticks; the parenthetical qualifiers are never backticked).
function backtickedTokens(line) {
  const out = [];
  const re = /`([^`]+)`/g;
  let m;
  while ((m = re.exec(line)) !== null) out.push(m[1].trim());
  return out;
}

describe('agent-dispatch-resolution — CLAUDE.md step-table surface', () => {
  const idx = buildNameIndex();

  it('case 7: every index-known agent token in the step table resolves', () => {
    const unresolved = [];
    for (const col of stepTableAgentColumns()) {
      for (const tok of agentTokens(col)) {
        if (idx.has(tok) && !resolvesName(idx, tok)) unresolved.push(tok);
      }
    }
    assert.deepEqual(
      unresolved, [],
      `step-table agent token(s) that fail to resolve: ${unresolved.join(', ')}`,
    );
  });

  it('case 8: no retired phantom name appears in the step-table Agent column', () => {
    const offenders = [];
    for (const col of stepTableAgentColumns()) {
      for (const phantom of phantomsInText(col)) {
        offenders.push(`${phantom} in "${col}"`);
      }
    }
    assert.deepEqual(
      offenders, [],
      `retired phantom name(s) still in the step table:\n  ${offenders.join('\n  ')}`,
    );
  });
});

describe('agent-dispatch-resolution — cto-chief coordinator surface', () => {
  const idx = buildNameIndex();
  const SELF = 'cto-chief';

  it('case 9: every agent name dispatched by an "Owner sub-orchestrator" line resolves', () => {
    const unresolved = [];
    for (const line of ownerDispatchLines()) {
      for (const tok of backtickedTokens(line)) {
        if (tok === SELF) continue;            // self-reference resolves anyway
        if (!AGENT_LIKE.test(tok)) continue;   // skip any non-agent backticked prose
        if (!resolvesName(idx, tok)) unresolved.push(tok);
      }
    }
    assert.deepEqual(
      unresolved, [],
      `cto-chief dispatch target(s) that fail to resolve: ${unresolved.join(', ')}`,
    );
  });

  it('case 10: no retired phantom name appears in any "Owner sub-orchestrator" line', () => {
    const offenders = [];
    for (const line of ownerDispatchLines()) {
      for (const phantom of phantomsInText(line)) {
        offenders.push(`${phantom} in "Owner sub-orchestrator: ${line}"`);
      }
    }
    assert.deepEqual(
      offenders, [],
      `retired phantom name(s) still dispatched by cto-chief:\n  ${offenders.join('\n  ')}`,
    );
  });
});

describe('agent-dispatch-resolution — step-table/coordinator non-vacuity proofs', () => {
  const idx = buildNameIndex();

  it('case 11: regression guard — a synthetic future step naming a phantom is flagged', () => {
    // A future contributor who adds a step row naming a phantom must go red in
    // CI. Run the exact case-8 detection pipeline over a synthetic row and prove
    // it flags the phantom, and that the phantom does not resolve to a file.
    const syntheticRow = '| 99 | FOO | implementer (sonnet) |';
    const col = syntheticRow.split('|').map((c) => c.trim())[3];
    assert.deepEqual(
      phantomsInText(col), ['implementer'],
      'phantom-scan must flag a future step that names a phantom',
    );
    assert.equal(
      resolvesName(idx, 'implementer'), false,
      'and that phantom must not resolve to a real file',
    );
  });

  it('case 12: non-vacuity — the retired phantoms still resolve to no file (only pointers moved)', () => {
    // Option B moved the step-table/coordinator POINTERS to the trio; it did not
    // create phantom agent files. Proving the phantoms remain unresolvable shows
    // cases 8/10 detect a phantom pointer, not merely a missing string.
    for (const phantom of ['test-maker', 'functional-reviewer', 'implementer']) {
      assert.equal(
        resolvesName(idx, phantom), false,
        `phantom '${phantom}' must not resolve — Option B repointed, it did not create files`,
      );
    }
  });
});
