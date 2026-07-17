/**
 * F3b — Tier 3 is DELETED, permanently.
 *
 * Owner ruling, 2026-07-17, verbatim:
 *   "A scout is NOT A STUPID REGEX WITH HAIKU, IT IS AN OPUS THINKING ABOUT THE
 *    CODE. CTO Chief dispatches real agents to check on the code and aggregates
 *    the information, then steers the build."
 *
 * WHY THIS FILE EXISTS AT ALL — it is a ratchet, not a checkbox.
 *
 * The five Tier-3 scouts were a false-green machine. `secret-scout` declared
 * `short_circuits: security/secrets-detector` and pattern-matched twenty known
 * secret formats with a Haiku model. A credential outside those twenty formats
 * returned `pass` — and the deep detector NEVER RAN, while the audit record said
 * "scanned, nothing found". `short_circuits:` stated the defect as a feature: the
 * scout's job was to PREVENT the thinking. That violates this repo's own written
 * rule — a critique that did not RUN is not "nothing found"; absence of evidence
 * is never evidence of absence.
 *
 * An EDIT does not hold that line. A corpus-wide field deletion in this repo was
 * already undone once by a `git restore`, and it STAYED undone because the only
 * thing holding it was an edit rather than a fence. Without this file, Tier 3
 * silently returns the next time someone restores from history, and the suite
 * stays green while it happens.
 *
 * These assertions are about the ABSENCE of a thing. That inverts TDD-Red: they
 * were written and observed RED (all five) BEFORE a single file was deleted.
 *
 * DO NOT relax an assertion here to make a future change pass. If a Tier 3 is
 * ever wanted again, that is an owner decision, and this file is where it gets
 * argued — not quietly deleted.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** The five deleted scouts, by name. */
const SCOUT_NAMES = ['dep-scout', 'lint-scout', 'secret-scout', 'syntax-scout', 'test-scout'];

/**
 * Tombstone markers. A region between them may name the dead (see Case 5's note).
 * Written to work as a comment in both markdown (`<!-- ... -->`) and YAML (`# ...`).
 */
const TOMBSTONE_BEGIN = /tier-3-tombstone:begin/;
const TOMBSTONE_END = /tier-3-tombstone:end/;

/** A tombstone explains a deletion in a few paragraphs. It is not a hiding place. */
const MAX_TOMBSTONE_LINES = 45;

/**
 * Frontmatter, anchored at byte 0 — the same read the Claude Code runtime does.
 * A match-anywhere read would parse a YAML block below an `# H1` heading that the
 * runtime never honours, and certify an inert contract green.
 */
function parseFrontmatter(content) {
  const m = /^---\n([\s\S]*?)\n---/.exec(content);
  return m ? m[1] : '';
}

/** Every real agent definition. `_`-prefixed paths are prose fragments, not agents. */
function walkAgents(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkAgents(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

const AGENT_FILES = walkAgents(path.join(ROOT, 'agents'));

describe('F3b — Tier 3 (Haiku scouts) is deleted and cannot return', () => {
  // ---- Case 1: the directory itself -------------------------------------------
  it('agents/scouts/ does not exist', () => {
    const scoutsDir = path.join(ROOT, 'agents', 'scouts');
    assert.equal(
      fs.existsSync(scoutsDir),
      false,
      'agents/scouts/ exists. Tier 3 was deleted by plan F3b — a pre-screen that can ' +
        'return `pass` without thinking is a false-green machine. If this directory is ' +
        'back, it came back from history, which is exactly what this fence exists to catch.'
    );
  });

  // ---- Case 2: no haiku anywhere in the agent corpus ---------------------------
  it('no agent declares `model: haiku`', () => {
    const haiku = AGENT_FILES.filter((f) => /^model:\s*haiku\s*$/m.test(parseFrontmatter(fs.readFileSync(f, 'utf8'))))
      .map((f) => path.relative(ROOT, f));

    assert.deepEqual(
      haiku,
      [],
      `${haiku.length} agent(s) declare \`model: haiku\`:\n  ${haiku.join('\n  ')}\n\n` +
        'Haiku was the scout tier and the scout tier is gone. Haiku is not a thinking ' +
        'budget for anything that judges Opus-written code. A new haiku agent is an ' +
        'owner decision, not a quiet addition.'
    );
  });

  // ---- Case 3: the suppression key must never return ---------------------------
  it('no agent declares `short_circuits:`', () => {
    const suppressors = AGENT_FILES.filter((f) => /^short_circuits:/m.test(parseFrontmatter(fs.readFileSync(f, 'utf8'))))
      .map((f) => path.relative(ROOT, f));

    assert.deepEqual(
      suppressors,
      [],
      `${suppressors.length} agent(s) declare \`short_circuits:\`:\n  ${suppressors.join('\n  ')}\n\n` +
        'THIS IS THE KEY THAT MATTERED. `short_circuits:` names an agent this one may ' +
        'PREVENT from running, and records "nothing found" when it does. Absence of ' +
        'evidence is not evidence of absence. No agent may suppress another agent.'
    );
  });

  // ---- Case 4: the dispatch schema no longer describes a tier 3 ----------------
  it('the dispatch schema has no scout_response and target_tier maxes at 2', () => {
    const schemaPath = path.join(ROOT, '.ctoc', 'architecture', 'dispatch-schema.yaml');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    assert.equal(
      /scout_response/.test(schema),
      false,
      'dispatch-schema.yaml still defines or references `scout_response`. A schema ' +
        'definition nothing emits is dead weight the next author will assume is live. ' +
        'Both the definition AND the `oneOf` $ref in audit_entry must be gone.'
    );

    // target_tier lives under dispatch_request. Read ITS maximum specifically —
    // asserting on a bare /maximum: 2/ anywhere in the file would pass on an
    // unrelated key and certify nothing. Comment lines inside the block are skipped
    // so that documenting the ceiling cannot blind the check that enforces it.
    const lines = schema.split('\n');
    const start = lines.findIndex((l) => /^\s*target_tier:\s*$/.test(l));
    assert.notEqual(start, -1, 'could not locate the target_tier key in dispatch-schema.yaml');

    const block = {};
    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*#/.test(line) || !line.trim()) continue;
      const kv = /^\s*(type|minimum|maximum):\s*(\S+)\s*$/.exec(line);
      if (!kv) break; // left the target_tier block
      block[kv[1]] = kv[2];
    }

    assert.equal(block.type, 'integer', 'target_tier must remain an integer');
    assert.equal(block.minimum, '1', 'target_tier minimum must remain 1 (never dispatch to Tier 0)');
    assert.equal(
      block.maximum,
      '2',
      `dispatch_request.target_tier declares maximum: ${block.maximum}. With Tier 3 deleted ` +
        'the ceiling is 2 — otherwise the schema still claims a tier 3 exists and will ' +
        'validate a dispatch to a tier that has no agents.'
    );
  });

  // ---- Case 5: no live spec or source names a scout ----------------------------
  //
  // WHAT THIS CATCHES: a LIVE POINTER — a spec, roster, dispatch target, members
  // list, or source reference aimed at an agent that does not exist.
  //
  // WHAT IT DELIBERATELY PERMITS: a marked TOMBSTONE — prose that explains the
  // deletion. This exemption was NOT in the plan's Case 5 as written, and it is
  // recorded rather than quietly taken. The plan's own Step 15 requires documenting
  // WHY Tier 3 was deleted, and a tombstone that cannot name the thing it buries
  // cannot say why (the who-covers-it-now table is the most useful part). A literal
  // name grep and a written tombstone cannot both exist; the fence's INTENT is the
  // broken pointer, so the tombstone is exempted — narrowly and visibly:
  //
  //   * the region must be explicitly delimited by a marker (below), so an exemption
  //     is a reviewable act in a diff, never an accident;
  //   * markers must BALANCE — an unclosed `begin` would silently exempt the rest of
  //     a file, so that is asserted as a failure;
  //   * a region is capped at MAX_TOMBSTONE_LINES — you cannot wrap a live roster in
  //     a tombstone and call it history;
  //   * cases 1-4 are NOT exempted by anything. A real resurrection (the directory,
  //     the haiku model, the short_circuits key, the schema) still fails loudly, and
  //     those are the assertions that actually hold the line.
  it('no live spec or source names a scout', () => {
    // plans/done/** and HANDOFF.md are EXCLUDED: they are the historical record of
    // what was decided when. Rewriting history to match the present is the opposite
    // of an audit trail (plan F3b, Decision 4).
    //
    // .ctoc/security/known-bad-deps.yaml is EXCLUDED: it is curated CVE DATA, not a
    // scout. Deleting an agent must never delete the data it happened to read
    // (plan F3b, Decision 3). It lives in .ctoc/security/, not .ctoc/architecture/,
    // so it is outside the scanned set below.
    const targets = [
      path.join(ROOT, 'src'),
      path.join(ROOT, 'docs'),
      path.join(ROOT, '.ctoc', 'architecture'),
      path.join(ROOT, 'README.md'),
      path.join(ROOT, 'CLAUDE.md'),
    ];

    const files = [];
    for (const t of targets) {
      if (!fs.existsSync(t)) continue;
      if (fs.statSync(t).isDirectory()) {
        const stack = [t];
        while (stack.length) {
          const d = stack.pop();
          for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
            if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
            const full = path.join(d, entry.name);
            if (entry.isDirectory()) stack.push(full);
            else if (/\.(js|md|yaml|yml)$/.test(entry.name)) files.push(full);
          }
        }
      } else {
        files.push(t);
      }
    }

    const namePattern = new RegExp(SCOUT_NAMES.join('|'));
    const hits = [];
    const unbalanced = [];

    for (const f of files) {
      const rel = path.relative(ROOT, f);
      const lines = fs.readFileSync(f, 'utf8').split('\n');

      let open = null; // line number where the current tombstone opened
      lines.forEach((line, i) => {
        if (TOMBSTONE_BEGIN.test(line)) {
          if (open !== null) unbalanced.push(`${rel}:${i + 1}: tombstone opened at line ${open} was never closed`);
          open = i + 1;
          return;
        }
        if (TOMBSTONE_END.test(line)) {
          if (open === null) unbalanced.push(`${rel}:${i + 1}: tombstone end with no matching begin`);
          else if (i + 1 - open > MAX_TOMBSTONE_LINES) {
            unbalanced.push(
              `${rel}: tombstone at lines ${open}-${i + 1} spans ${i + 1 - open} lines, over the ` +
                `${MAX_TOMBSTONE_LINES}-line cap — a tombstone explains a deletion; it does not shelter a roster`
            );
          }
          open = null;
          return;
        }
        if (open !== null) return; // inside a marked tombstone: prose about the dead
        if (namePattern.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim()}`);
      });

      if (open !== null) {
        unbalanced.push(`${rel}: tombstone opened at line ${open} is never closed — it would exempt the rest of the file`);
      }
    }

    assert.deepEqual(
      unbalanced,
      [],
      `Malformed tombstone marker(s):\n  ${unbalanced.join('\n  ')}\n\n` +
        'An unclosed or oversized tombstone silently widens this fence, which is exactly ' +
        'the hole it exists to close. Fix the markers.'
    );

    assert.deepEqual(
      hits,
      [],
      `${hits.length} live reference(s) to a deleted scout:\n  ${hits.join('\n  ')}\n\n` +
        'A live spec or source naming an agent that does not exist is a broken pointer. ' +
        'If this is prose EXPLAINING the deletion rather than a pointer at it, wrap it in ' +
        `a tombstone marker (${TOMBSTONE_BEGIN.source} / ${TOMBSTONE_END.source}) — that is a ` +
        'deliberate, reviewable act. History (plans/done/**, HANDOFF.md) is not scanned.'
    );
  });
});
