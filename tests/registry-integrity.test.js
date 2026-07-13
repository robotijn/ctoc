'use strict';

/**
 * Registry integrity — every dispatch pointer resolves (W06 · s4).
 *
 * Findings C8 / M24. SIBLING-PAIRED with W04 ("Every dispatched agent
 * resolves"). This slice adds the invariant that goes RED on dangling
 * pointers; W04's production fix (repoint the step table + registry to the
 * real Option-B trio and regenerate the registry from disk) turns it GREEN.
 * W06 creates NO agent files and edits NO registry — it only witnesses.
 *
 * Two pointer classes are asserted, read live and read-only so the test tracks
 * the real tree and catches drift on every run:
 *
 *   1. `.ctoc/operations-registry.yaml` `path:` values — each must exist on
 *      disk (parsed with a minimal line scan; no YAML dependency added, matching
 *      the parent index's zero-new-dependency posture — the file is line-oriented
 *      and this invariant only needs the `path:` values).
 *   2. `CLAUDE.md` Iron Loop step-table agents — each bare agent slug in the
 *      Agent column must resolve to a dispatchable file anywhere under agents/.
 *
 * Name resolution is TREE-WIDE UNDER `agents/` by design: `security-scanner`
 * lives in `agents/security/`, so a fixed-subdir lookup would false-flag it —
 * the walk is repo-wide (excluding `_shared/`, which holds shared prose
 * fragments, not dispatchable agents).
 *
 * Non-vacuity: the paired W04 fix is present in the working tree, so the two
 * resolution assertions are GREEN today. The explicit count guards below
 * (a parse that finds zero pointers is itself a failure) plus the in-memory
 * synthetic-defect cases prove the assertions catch a dangling registry path
 * and an unresolvable step agent rather than passing vacuously — without ever
 * mutating the repository.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const REGISTRY_PATH = path.join(projectRoot, '.ctoc', 'operations-registry.yaml');
const CLAUDE_MD_PATH = path.join(projectRoot, 'CLAUDE.md');

// ---------------------------------------------------------------------------
//  Parsers + resolvers (short, single-purpose — kept inline per this slice's
//  design; see the parent index's decision to scope helpers per concern rather
//  than force independent slices through one generic harness)
// ---------------------------------------------------------------------------

// Every `path:` value in the registry, as a repo-relative string. Minimal line
// scan (split on \r?\n so a CRLF checkout parses identically); no YAML parse.
function registryPaths() {
  const lines = fs.readFileSync(REGISTRY_PATH, 'utf8').split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const m = line.match(/^\s*path:\s*(\S+)/);
    if (m) out.push(m[1]);
  }
  return out;
}

// Bare agent slugs are lowercase hyphenated identifiers (`iron-loop-executor`,
// `product-owner`, `security-scanner`). Model hints (`opus`, `sonnet`) and prose
// glue (`then`, `+`, `,`, `10 rounds`) are single, non-hyphenated words and are
// excluded by construction — every real CTOC agent slug is hyphenated. This is
// the same token shape the sibling W04 test relies on.
const AGENT_TOKEN = /[a-z][a-z0-9]*(?:-[a-z0-9]+)+/g;

// Each Iron Loop step-table row of CLAUDE.md as { step, name } pairs: the row's
// step number paired with every bare agent slug in its Agent column. A row that
// names two agents (e.g. step 1: vision-advisor, product-owner) yields two
// pairs, each carrying the same step number so a failure names the exact step.
function stepTableAgents() {
  const lines = fs.readFileSync(CLAUDE_MD_PATH, 'utf8').split(/\r?\n/);
  const pairs = [];
  for (const line of lines) {
    if (!/^\|\s*\d+\s*\|/.test(line)) continue;         // data rows only
    const cells = line.split('|').map((c) => c.trim());
    // cells: ['', step, label, agentColumn, phase, ''] → step=cells[1], agent=cells[3]
    if (cells.length < 4) continue;
    const step = Number(cells[1]);
    const agentColumn = cells[3];
    for (const name of agentColumn.match(AGENT_TOKEN) || []) {
      pairs.push({ step, name });
    }
  }
  return pairs;
}

// The set of dispatchable agent slugs on disk: basename (sans .md) of every
// agents/**/*.md, excluding `_shared/` and dot-dirs. Walked once into a Set so
// resolveAgent is an O(1) membership test, not a re-walk per name.
function dispatchableAgentSlugs() {
  const slugs = new Set();
  const agentsDir = path.join(projectRoot, 'agents');
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.md')) {
        slugs.add(entry.name.slice(0, -'.md'.length));
      }
    }
  }
  walk(agentsDir);
  return slugs;
}

// True iff a bare agent slug resolves to a dispatchable agents/**/<name>.md.
function resolveAgent(name, slugs) {
  return slugs.has(name);
}

// True iff a repo-relative path exists on disk. path.join keeps this
// cross-platform; the value is ONLY existence-checked, never required or
// executed, so a hostile registry entry cannot cause code execution here.
function existsFromRoot(rel) {
  return fs.existsSync(path.join(projectRoot, rel));
}

// ---------------------------------------------------------------------------
//  Invariant 1 — every operations-registry `path:` resolves
// ---------------------------------------------------------------------------

describe('registry-integrity — operations-registry path: resolution', () => {
  it('parses a non-empty set of registry path: values (guards against a vacuous pass)', () => {
    assert.ok(
      registryPaths().length > 0,
      'registryPaths() found no path: entries — parser or registry is broken; ' +
      'an empty set would make the resolution assertion pass vacuously',
    );
  });

  it('every operations-registry path: resolves to a real file', () => {
    const dangling = registryPaths().filter((p) => !existsFromRoot(p));
    assert.deepEqual(
      dangling, [],
      `operations-registry.yaml has dangling path: value(s):\n  ${dangling.join('\n  ')}`,
    );
  });
});

// ---------------------------------------------------------------------------
//  Invariant 2 — every CLAUDE.md step-table agent resolves
// ---------------------------------------------------------------------------

describe('registry-integrity — CLAUDE.md step-table agent resolution', () => {
  it('parses a non-empty set of step-table agents (guards against a vacuous pass)', () => {
    assert.ok(
      stepTableAgents().length > 0,
      'stepTableAgents() found no agent slugs — parser or step table is broken; ' +
      'an empty set would make the resolution assertion pass vacuously',
    );
  });

  it('every CLAUDE.md step-table agent resolves to a dispatchable file', () => {
    const slugs = dispatchableAgentSlugs();
    const unresolved = stepTableAgents()
      .filter(({ name }) => !resolveAgent(name, slugs))
      .map(({ step, name }) => `step ${step}: ${name}`);
    assert.deepEqual(
      unresolved, [],
      `CLAUDE.md step table names agent(s) that resolve to no dispatchable file:\n  ${unresolved.join('\n  ')}`,
    );
  });

  it('resolves security-scanner tree-wide (it lives in agents/security/, proving the walk is not fixed-subdir)', () => {
    const slugs = dispatchableAgentSlugs();
    assert.ok(
      resolveAgent('security-scanner', slugs),
      'security-scanner must resolve via a tree-wide walk of agents/',
    );
  });
});

// ---------------------------------------------------------------------------
//  Non-vacuity proofs — the paired W04 fix is present in the working tree, so
//  invariants 1 and 2 are GREEN today. These in-memory cases prove each
//  assertion catches its defect class, using synthetic bad values — the
//  repository is never mutated and no false RED is fabricated against it.
// ---------------------------------------------------------------------------

describe('registry-integrity — non-vacuity (assertions catch the defect class)', () => {
  it('a synthetic dangling registry path is flagged by existsFromRoot', () => {
    // A pre-W04 registry path that dangled; proving it does NOT exist shows the
    // resolution filter would name it if the registry regressed to that pointer.
    const PRE_FIX_DANGLING = 'agents/implementation/implementer.md';
    assert.equal(
      existsFromRoot(PRE_FIX_DANGLING), false,
      'expected pre-fix registry path to be missing (detector proof)',
    );
    // Drive the exact invariant-1 filter over a synthetic registry list and
    // prove the dangling entry is the one reported.
    const synthetic = [...registryPaths(), PRE_FIX_DANGLING];
    const dangling = synthetic.filter((p) => !existsFromRoot(p));
    assert.deepEqual(dangling, [PRE_FIX_DANGLING]);
  });

  it('a synthetic step naming a phantom agent is flagged by the resolution filter', () => {
    const slugs = dispatchableAgentSlugs();
    // The 10 Option-B phantom step agents never became files; proving one does
    // not resolve shows invariant 2 detects an unresolvable step agent.
    for (const phantom of ['implementer', 'test-maker', 'functional-reviewer']) {
      assert.equal(
        resolveAgent(phantom, slugs), false,
        `phantom '${phantom}' must not resolve — W04 repointed pointers, it did not create files`,
      );
    }
    // Drive the exact invariant-2 filter over a synthetic step row and prove it
    // names both the step number and the unresolved agent.
    const syntheticPairs = [{ step: 10, name: 'implementer' }];
    const unresolved = syntheticPairs
      .filter(({ name }) => !resolveAgent(name, slugs))
      .map(({ step, name }) => `step ${step}: ${name}`);
    assert.deepEqual(unresolved, ['step 10: implementer']);
  });

  it('the step-table parser strips model hints and prose (no false dangling reports)', () => {
    // A row with a model hint and prose glue must yield only real agent slugs,
    // never `opus`/`sonnet`/`then`. Uses the real parse token on a synthetic row.
    const agentColumn = 'iron-loop-critic (opus) then iron-loop-integrator+iron-loop-critic (10 rounds)';
    assert.deepEqual(
      agentColumn.match(AGENT_TOKEN) || [],
      ['iron-loop-critic', 'iron-loop-integrator', 'iron-loop-critic'],
      'parser must extract only hyphenated agent slugs, not model hints or prose',
    );
  });
});
