'use strict';

/**
 * THE REFINEMENT-LOOP DESIGN-RECORD FENCE — the document's checkable claims
 * are asserted against the LIVE code, in BOTH directions, so a future drift
 * (a doc claim that stops being true, OR a code change that outruns the doc)
 * is caught by the gated suite.
 *
 * WHY. `docs/REFINEMENT_LOOP.md` reads as a running mechanism. It is not one:
 * ten exports of `src/lib/refinement-loop.js` have no live caller, the single
 * live export writes a verdict nothing reads, one file the table lists does not
 * exist, and the agent named as the driver holds neither `Task` nor `Bash`.
 * Plan 00189 turns the document into an accurate DESIGN RECORD. This test is
 * the ratchet that keeps it accurate: each case fails in the direction of good
 * news — an export wired, a reader added, the driver's tools granted — and each
 * failure is a demand to update the document at the moment the fact changes.
 *
 * A TEST IS NEVER A CALLER, and this test writes NOTHING: every case reads
 * repository files only. THE CODE WINS — where the document and the code
 * disagree, the code is the truth and this test fails the document.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const DOC_PATH = path.join(ROOT, 'docs', 'REFINEMENT_LOOP.md');
const BASELINE_PATH = path.join(ROOT, '.ctoc', 'export-reachability-baseline.json');
const ACTIONS_PATH = path.join(ROOT, 'src', 'lib', 'actions.js');
const INTEGRATOR_PATH = path.join(ROOT, 'agents', 'iron-loop', 'iron-loop-integrator.md');

const DOC = fs.readFileSync(DOC_PATH, 'utf8');
const REFINEMENT_MODULE_PREFIX = 'src/lib/refinement-loop.js#';

// ── helpers ────────────────────────────────────────────────────────────

// Read the dead-export set for refinement-loop.js straight from the baseline —
// never from a hand-copied list. This is the source of truth the fence measures.
function baselineDeadExports() {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  return baseline.dead
    .filter((e) => e.startsWith(REFINEMENT_MODULE_PREFIX))
    .map((e) => e.slice(REFINEMENT_MODULE_PREFIX.length))
    .sort();
}

// Slice the text strictly between two HTML-comment markers. Renderer-invisible
// delimiters give a deterministic parse — no brittle "find the Nth table" grep.
function sliceBetween(text, startMarker, endMarker) {
  const s = text.indexOf(startMarker);
  if (s === -1) return '';
  const e = text.indexOf(endMarker, s + startMarker.length);
  if (e === -1) return '';
  return text.slice(s + startMarker.length, e);
}

// Slice a markdown section: from its `## heading` to the next `## ` (or EOF).
function sliceSection(text, headingLine) {
  const s = text.indexOf(headingLine);
  if (s === -1) return '';
  const afterHeading = s + headingLine.length;
  const next = text.indexOf('\n## ', afterHeading);
  return next === -1 ? text.slice(s) : text.slice(s, next);
}

// Every backticked camelCase identifier inside a block, de-duplicated + sorted.
function backtickedIdentifiers(block) {
  const set = new Set();
  for (const m of block.matchAll(/`([a-zA-Z][A-Za-z0-9]+)`/g)) set.add(m[1]);
  return [...set].sort();
}

// Every src/**/*.js file, relative to ROOT with forward slashes.
function srcJsFiles() {
  const acc = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) acc.push(full);
    }
  };
  walk(path.join(ROOT, 'src'));
  return acc.map((f) => path.relative(ROOT, f).split(path.sep).join('/'));
}

// The body of a top-level `function <name>(` up to the next top-level function.
function functionBody(src, name) {
  const start = src.indexOf(`function ${name}`);
  if (start === -1) return '';
  const rest = src.slice(start);
  const next = rest.indexOf('\nfunction ', name.length + 10);
  return next === -1 ? rest : rest.slice(0, next);
}

// Reference to the refinement gate-state directory, in EITHER form: the
// string-literal `state/refinement` (which today lands only on the docblock)
// OR the path.join segment form `'state', 'refinement'` (the actual write site).
function referencesRefinementStateDir(src) {
  return (
    src.includes('state/refinement') ||
    src.includes("'state', 'refinement'") ||
    src.includes('"state", "refinement"')
  );
}

// ── cases ──────────────────────────────────────────────────────────────

describe('refinement-loop doc is an accurate design record (bidirectional fence)', () => {
  it('Case 1 — the NOT RUNNING marker is present', () => {
    assert.ok(
      DOC.includes('NOT RUNNING'),
      'docs/REFINEMENT_LOOP.md must carry the NOT RUNNING marker so the third ' +
        'design-record state is greppable beside NOT ENFORCED and NOT WIRED',
    );
  });

  it("Case 2 — the doc's dead-export list is EXACTLY the baseline's, measured not stated", () => {
    const measured = baselineDeadExports();
    // The doc declares its list between renderer-invisible markers.
    const block = sliceBetween(
      DOC,
      '<!-- dead-exports:start -->',
      '<!-- dead-exports:end -->',
    );
    const claimed = backtickedIdentifiers(block);
    // If an export is wired later it leaves the baseline; the sets then diverge
    // and THIS FAILS — the good-news direction, demanding the doc be updated.
    assert.deepEqual(
      claimed,
      measured,
      'the doc must name exactly the refinement-loop exports the baseline marks dead',
    );
    assert.equal(measured.length, 10, 'expected exactly ten dead refinement-loop exports today');
  });

  it('Case 3 — shouldRunLoop is still the one live export, still required by actions.js', () => {
    const dead = baselineDeadExports();
    assert.ok(
      !dead.includes('shouldRunLoop'),
      'shouldRunLoop must remain OUT of the dead set; if its caller disappears the doc must say so',
    );
    const actions = fs.readFileSync(ACTIONS_PATH, 'utf8');
    assert.ok(
      /require\(['"]\.\/refinement-loop['"]\)/.test(actions),
      'src/lib/actions.js must still require ./refinement-loop (the live gate caller)',
    );
  });

  it('Case 4 — the gate verdict directory has exactly one referrer, and it WRITES with no read', () => {
    const referrers = srcJsFiles().filter((rel) =>
      referencesRefinementStateDir(fs.readFileSync(path.join(ROOT, rel), 'utf8')),
    );
    // A reader added in ANY module makes this list grow → FAIL → the doc's
    // "note nothing reads" claim must be removed.
    assert.deepEqual(
      referrers.sort(),
      ['src/lib/actions.js'],
      'only src/lib/actions.js may reference the refinement gate-state directory',
    );

    const body = functionBody(fs.readFileSync(ACTIONS_PATH, 'utf8'), 'recordRefinementGate');
    assert.ok(/writeFileSync/.test(body), 'recordRefinementGate must WRITE the verdict');
    assert.ok(/stateDir/.test(body), 'recordRefinementGate must build the state dir path');
    // No READ against the refinement state dir. (The readFileSync in this
    // function reads the PLAN, never the state dir — so it must not reference
    // stateDir or the "refinement" segment.)
    assert.ok(
      !/read(FileSync|File|dirSync|dir)\s*\([^)]*(stateDir|refinement)/.test(body),
      'recordRefinementGate must perform NO read of the refinement state directory',
    );
  });

  it('Case 5 — every file in the "Files and where they live" table exists, or is marked missing', () => {
    const table = sliceSection(DOC, '## Files and where they live');
    assert.ok(table, 'the "Files and where they live" section must be present');
    const rows = table.split('\n').filter((l) => l.trimStart().startsWith('|'));
    for (const line of rows) {
      if (/^\s*\|[\s:|-]+\|?\s*$/.test(line)) continue; // separator
      const firstCell = line.split('|')[1] || '';
      const m = firstCell.match(/`([^`]+)`/);
      if (!m) continue; // header row (no backticked path)
      const p = m[1].trim();
      if (p.includes('<')) continue; // template path, e.g. <plan_slug>
      const exists = fs.existsSync(path.join(ROOT, p));
      if (!exists) {
        assert.ok(
          /does not exist/i.test(line),
          `table lists ${p}, which is not on disk — its row must be marked "does not exist"`,
        );
      }
    }
  });

  it("Case 6 — the driver's tools grant matches the doc's claim about it", () => {
    const integrator = fs.readFileSync(INTEGRATOR_PATH, 'utf8');
    const toolsLine = (integrator.match(/^tools:.*$/m) || [''])[0];
    const hasTask = /\bTask\b/.test(toolsLine);
    const hasBash = /\bBash\b/.test(toolsLine);

    // Target the Files-table ROW specifically (a markdown table line), not the
    // prose mentions of the integrator elsewhere in the document.
    const row = DOC.split('\n').find(
      (l) => l.trimStart().startsWith('|') && l.includes('iron-loop-integrator.md'),
    );
    assert.ok(row, 'the "Files and where they live" table must have a row for the integrator');

    if (!hasTask || !hasBash) {
      // Reality today: neither granted. The row must disclose both are absent —
      // if the agent LATER gains both, this branch stops applying and the
      // else-branch below fails the stale disclosure, demanding a correction.
      assert.ok(
        /\bTask\b/.test(row) && /\bBash\b/.test(row),
        'the integrator row must name both Task and Bash to disclose the driver cannot drive the loop',
      );
    } else {
      assert.ok(
        !/neither|lacks|cannot/i.test(row),
        'the integrator now holds Task and Bash — the row must no longer claim it lacks them',
      );
    }
  });

  it('Case 7 — the round description is labelled a specification, not read as reportage', () => {
    // DELIBERATELY WEAK: prose tense is not reliably checkable, so this asserts
    // only that the "How a round runs" section carries a specification LABEL. It
    // is stated as weak rather than dressed up as stronger than it is.
    const section = sliceSection(DOC, '## How a round runs');
    assert.ok(section, 'the "How a round runs" section must be present');
    assert.ok(
      /specification/i.test(section),
      'the round description must be labelled a specification of a round, not a report of one',
    );
  });
});
