'use strict';

/**
 * THE WATCHER FENCE — a ratcheting shape gate for the watcher fleet.
 *
 * Why this exists (owner, 2026-07-17): "how can we keep the watchers as sharp as
 * possible, and understandable for humans." Those are one constraint, not two.
 * An agent's body IS its entire system prompt — a subagent receives only that
 * plus basic environment details. So a 1134-line agent is simultaneously
 * unreadable by a human and attention-diluted for the model. One page fixes
 * both halves for one reason.
 *
 * At 46 sensors feeding one aggregator, the section shape is not cosmetics — it
 * is the WIRE PROTOCOL. The corpus today carries four names for one section
 * (## Blocking Rules / ## Red Lines (NEVER Compromise) / ## When to Block vs
 * Warn; ## Output Format / ## Output Format (MANDATORY) / ## Output / ## Output
 * Contract). The synthesizer normalizes findings to a (pillar, file, line)
 * coordinate; it cannot do that if each sensor emits a different shape.
 *
 * THE RATCHET, and why a plain "every agent conforms" assertion is not enough:
 * 128 agents predate the template and the rewrite is plan W1. A fence demanding
 * conformance today would be red forever and get disabled — worse than no fence.
 * So it ratchets, exactly like the coverage floor and the reachability baseline:
 *
 *   1. Every agent on disk is in EXACTLY ONE of `conforming` / `legacy`. A file
 *      in neither is red — no agent may be silently uncatalogued.
 *   2. `legacy` may only ever SHRINK (maxLegacy is a ceiling that may only be
 *      lowered). A name added to `legacy` is red. A NEW agent must therefore be
 *      born conforming.
 *   3. Every agent in `conforming` matches the template EXACTLY, or red.
 *
 * HONESTY NOTE, stated out loud rather than left for a reader to discover:
 * `conforming` is EMPTY today, so case 4 is VACUOUSLY GREEN. That is by design
 * (seeding it with near-misses would make the fence lie on day one), and case 5
 * is the guard that stops the fence sitting green-and-vacuous forever. A green
 * run of this file today does NOT mean any agent conforms. It means the ratchet
 * is armed.
 *
 * ZERO DOUBLES: this walks the real agents/ tree and reads the real baseline.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AGENTS_DIR = path.join(ROOT, 'agents');
const TEMPLATE_FILE = path.join(ROOT, '.ctoc', 'templates', 'watcher.md');
const BASELINE_FILE = path.join(ROOT, '.ctoc', 'watcher-baseline.json');
const SCHEMA_PATH = '.ctoc/architecture/dispatch-schema.yaml';

/** The body cap. One screen. A watcher that cannot fit is two roles. */
const MAX_BODY_LINES = 80;

/** The five headings, literal text, in order. */
const REQUIRED_HEADINGS = [
  '# What I watch',
  '## Trigger',
  '## What I Report',
  '## What I Borrow',
  '## Anti-Scope',
];

/**
 * A watcher NEVER writes. An observer that can mutate the observed dissolves the
 * separation the whole system rests on. This is THE load-bearing rule of the
 * file — every other assertion here is legibility; this one is integrity.
 */
const WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];

/**
 * Bash is a write tool wearing a read tool's coat: `bash -c 'echo x > file'`
 * mutates the observed just as surely as Edit does. It is banned for the same
 * reason, not as an extra rule. (agents/security/threat-modeler.md declares
 * `tools: Bash, Read, Grep, Glob` today — that is a real hole this fence names.)
 */
const MUTATION_CAPABLE = [...WRITE_TOOLS, 'Bash', 'Task'];

/**
 * The read-only allowlist. The template declares `tools: Read, Grep`; Glob is
 * permitted because it is pure enumeration and three recently-written watchers
 * use it, and Skill is permitted because the template's own `## What I Borrow`
 * section REQUIRES the Skill tool to invoke a borrowed skill lazily. Anything
 * outside this list is a capability nobody justified.
 */
const READONLY_ALLOWED = ['Read', 'Grep', 'Glob', 'Skill'];

/** Fields the dispatch schema already defines. Restating them here would be the
 *  forty-sixth copy — the duplication that rots. */
const SCHEMA_FIELDS = [
  'severity',
  'type',
  'file',
  'line_range',
  'message',
  'confidence',
  'citations',
];

// ---------------------------------------------------------------------------
// helpers — real filesystem, no doubles
// ---------------------------------------------------------------------------

function listAgentFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        out.push(path.relative(ROOT, full).split(path.sep).join('/'));
      }
    }
  };
  walk(AGENTS_DIR);
  return out.sort();
}

function readBaseline() {
  return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
}

/** Split an agent/template file into raw frontmatter text and body text. */
function split(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return null;
  return { frontmatter: m[1], body: m[2] };
}

/**
 * The single shape contract, applied identically to the template and to every
 * conforming agent. Returns a list of human-readable violations.
 */
function shapeViolations(text, label) {
  const v = [];
  const parts = split(text);
  if (!parts) {
    v.push(`${label}: no YAML frontmatter delimited by --- / ---`);
    return v;
  }
  const { frontmatter, body } = parts;

  // frontmatter: tools grants read-only capability
  const toolsLine = /^tools:\s*(.+)$/m.exec(frontmatter);
  if (!toolsLine) {
    v.push(`${label}: missing "tools:" key`);
  } else {
    const declared = toolsLine[1]
      .replace(/#.*$/, '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const w of MUTATION_CAPABLE) {
      if (declared.includes(w)) {
        v.push(
          `${label}: declares mutation-capable tool "${w}" — a watcher NEVER writes; ` +
            'an observer that can mutate the observed dissolves the separation the system rests on'
        );
      }
    }
    for (const required of ['Read', 'Grep']) {
      if (!declared.includes(required)) {
        v.push(`${label}: tools must include "${required}"`);
      }
    }
    const extra = declared.filter((t) => !READONLY_ALLOWED.includes(t));
    if (extra.length) {
      v.push(
        `${label}: tools may only be ${READONLY_ALLOWED.join(', ')}; found: ${extra.join(', ')}`
      );
    }
  }

  // frontmatter: the reviewer is never weaker than the builder
  if (!/^model:\s*opus\s*(#.*)?$/m.test(frontmatter)) {
    v.push(`${label}: missing "model: opus"`);
  }

  // frontmatter: THE LENS — the preloaded skill is why the body can be one page
  if (!/^skills:\s*$/m.test(frontmatter) && !/^skills:\s*\S/m.test(frontmatter)) {
    v.push(`${label}: missing "skills:" key (the lens — native preload)`);
  }

  // body: the five headings, literal text, in order
  const bodyLines = body.split(/\r?\n/);
  const headingLines = bodyLines.filter((l) => /^#{1,6}\s/.test(l)).map((l) => l.trim());
  let cursor = 0;
  for (const h of REQUIRED_HEADINGS) {
    const at = headingLines.indexOf(h, cursor);
    if (at === -1) {
      v.push(`${label}: missing or out-of-order heading "${h}"`);
    } else {
      cursor = at + 1;
    }
  }

  // body: no ## Blocking Rules — a watcher reports, the aggregator decides
  for (const h of headingLines) {
    if (/^#+\s*(Blocking Rules|Red Lines|When to Block vs Warn)/i.test(h)) {
      v.push(`${label}: has "${h}" — a watcher REPORTS; the aggregator DECIDES`);
    }
  }

  // body: one page
  const bodyLineCount = bodyLines.filter((l, i) => !(i === bodyLines.length - 1 && l === '')).length;
  if (bodyLineCount > MAX_BODY_LINES) {
    v.push(`${label}: body is ${bodyLineCount} lines; cap is ${MAX_BODY_LINES}`);
  }

  return v;
}

/**
 * Case 6's contract: reference the schema by path, never restate its fields.
 */
function schemaRestatementViolations(text, label) {
  const v = [];
  const parts = split(text);
  const body = parts ? parts.body : text;

  if (!body.includes(SCHEMA_PATH)) {
    v.push(`${label}: does not reference ${SCHEMA_PATH} by path`);
  }

  const restated = SCHEMA_FIELDS.filter((f) =>
    new RegExp(`^\\s*[-*]?\\s*\`?${f}\`?\\s*:`, 'm').test(body)
  );
  if (restated.length >= 3) {
    v.push(
      `${label}: restates dispatch-schema fields inline (${restated.join(', ')}) — ` +
        `reference ${SCHEMA_PATH}, do not copy it`
    );
  }
  return v;
}

// ---------------------------------------------------------------------------
// the fence
// ---------------------------------------------------------------------------

describe('watcher shape fence', () => {
  it('case 1: the template exists and itself matches the shape it defines', () => {
    assert.ok(
      fs.existsSync(TEMPLATE_FILE),
      `${SCHEMA_PATH ? '' : ''}.ctoc/templates/watcher.md is ABSENT — a template a test can read is a contract; a template in docs/ is a suggestion`
    );
    const text = fs.readFileSync(TEMPLATE_FILE, 'utf8');
    const violations = [
      ...shapeViolations(text, '.ctoc/templates/watcher.md'),
      ...schemaRestatementViolations(text, '.ctoc/templates/watcher.md'),
    ];
    assert.deepEqual(
      violations,
      [],
      `The template must be the FIRST conforming artifact, or it is not a template:\n  - ${violations.join('\n  - ')}`
    );
  });

  it('case 2: every agent on disk is in exactly one baseline list', () => {
    assert.ok(
      fs.existsSync(BASELINE_FILE),
      '.ctoc/watcher-baseline.json is ABSENT — no agent may be silently uncatalogued'
    );
    const baseline = readBaseline();
    const conforming = new Set(baseline.conforming);
    const legacy = new Set(baseline.legacy);
    const onDisk = listAgentFiles();

    const both = [...conforming].filter((f) => legacy.has(f));
    assert.deepEqual(both, [], `In BOTH lists (must be exactly one):\n  - ${both.join('\n  - ')}`);

    const uncatalogued = onDisk.filter((f) => !conforming.has(f) && !legacy.has(f));
    assert.deepEqual(
      uncatalogued,
      [],
      `Agent files in NEITHER list — a new agent must be born conforming:\n  - ${uncatalogued.join('\n  - ')}`
    );

    const onDiskSet = new Set(onDisk);
    const ghosts = [...conforming, ...legacy].filter((f) => !onDiskSet.has(f));
    assert.deepEqual(
      ghosts,
      [],
      `Baseline names files that do not exist on disk:\n  - ${ghosts.join('\n  - ')}`
    );
  });

  it('case 3: legacy may only shrink — this is the ratchet', () => {
    const baseline = readBaseline();
    assert.equal(
      typeof baseline.maxLegacy,
      'number',
      '.ctoc/watcher-baseline.json must declare a numeric maxLegacy ceiling'
    );
    assert.ok(
      baseline.legacy.length <= baseline.maxLegacy,
      `legacy has ${baseline.legacy.length} entries but the ceiling is ${baseline.maxLegacy}. ` +
        'legacy may ONLY shrink. Do NOT raise maxLegacy to make this pass — rewrite the agent ' +
        'to the template and move it to conforming (plan W1).'
    );
    // The ceiling is a ratchet: it may only ever be LOWERED, so it must never
    // drift above the real corpus size.
    assert.ok(
      baseline.maxLegacy <= listAgentFiles().length,
      `maxLegacy (${baseline.maxLegacy}) exceeds the number of agent files on disk — ` +
        'the ceiling has drifted upward, which is exactly what the ratchet forbids'
    );
  });

  it('case 4: every conforming agent matches the template exactly', () => {
    const baseline = readBaseline();
    const failures = [];
    for (const rel of baseline.conforming) {
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      failures.push(...shapeViolations(text, rel));
    }
    assert.deepEqual(failures, [], `Conforming agents that do not match the template:\n  - ${failures.join('\n  - ')}`);
  });

  it('case 5: once W1 begins, the conforming list may not be empty', () => {
    const baseline = readBaseline();
    assert.equal(
      typeof baseline.w1_started,
      'boolean',
      '.ctoc/watcher-baseline.json must declare w1_started — the guard against a green-and-vacuous fence'
    );
    if (baseline.w1_started) {
      assert.ok(
        baseline.conforming.length > 0,
        'w1_started is true but conforming is EMPTY — case 4 is vacuous and the fence is lying'
      );
    }
  });

  it('case 6: no conforming agent restates the dispatch schema', () => {
    const baseline = readBaseline();
    const failures = [];
    for (const rel of baseline.conforming) {
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      failures.push(...schemaRestatementViolations(text, rel));
    }
    assert.deepEqual(failures, [], `One source of truth for the finding shape:\n  - ${failures.join('\n  - ')}`);
  });
});
