/**
 * Fence: `model_optimized_for` must never return to the corpus.
 *
 * The field was DELETED from CTOC because it was a category error. It carried
 * two incompatible meanings in one key:
 *
 *   - On the 27 opus rows it meant PROVENANCE  — "an Opus model authored this file".
 *   - On the 5 Tier-3 scouts it meant EXECUTION TARGET — and there it was simply
 *     FALSE. No Haiku model authored those files; `model_optimized_for: haiku-4-5`
 *     merely duplicated their runtime `model: haiku` declaration.
 *
 * One field, two meanings, one of them false. `model:` is the real, legitimate
 * field: it declares which model RUNS the artifact, and it is untouched by this
 * fence. If a new artifact needs to say what runs it, it declares `model:`.
 *
 * This fence scans every skill and agent markdown file for the deleted key.
 * It includes a non-vacuity guard so it can never pass by scanning nothing.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

const DELETED_FIELD = 'model_optimized_for';

// Matches the key in YAML frontmatter position (line-start, optional indent for
// list-item nesting) and in prose that re-teaches it as a field.
const DELETED_FIELD_RE = /model_optimized_for/;

/** Recursively collect every .md file under `dir`. */
function walkMarkdown(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkMarkdown(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

/** Every hit of the deleted field, as { file, line, text }. */
function findHits(files) {
  const hits = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    if (!DELETED_FIELD_RE.test(content)) continue;
    content.split(/\r?\n/).forEach((text, i) => {
      if (DELETED_FIELD_RE.test(text)) {
        hits.push({
          file: path.relative(projectRoot, file),
          line: i + 1,
          text: text.trim(),
        });
      }
    });
  }
  return hits;
}

// The corpus is large and stable; these floors exist only to make an empty or
// mis-rooted scan fail LOUD rather than pass green. They are deliberately far
// below the real counts (99 skills, 32 agents) so ordinary corpus churn never
// trips them — only a scan that read nothing does.
const MIN_SKILL_FILES = 50;
const MIN_AGENT_FILES = 20;

describe('fence: model_optimized_for is deleted and stays deleted', () => {
  const skillFiles = walkMarkdown(path.join(projectRoot, 'skills'));
  const agentFiles = walkMarkdown(path.join(projectRoot, 'agents'));

  // ---- Non-vacuity guards -------------------------------------------------
  // Without these, a bad path, an empty checkout, or a refactor that moves the
  // corpus would make the fence below pass for the WRONG reason: it would scan
  // zero files and find zero hits.

  it('scans a non-empty skills corpus (non-vacuity guard)', () => {
    assert.ok(
      skillFiles.length >= MIN_SKILL_FILES,
      `Vacuity guard tripped: scanned only ${skillFiles.length} skill markdown files under ` +
        `${path.join(projectRoot, 'skills')}, expected at least ${MIN_SKILL_FILES}. ` +
        `The model_optimized_for fence below is meaningless against an empty corpus — ` +
        `it would pass by finding nothing rather than by the field being absent. ` +
        `Fix the scan root before trusting the fence.`
    );
  });

  it('scans a non-empty agents corpus (non-vacuity guard)', () => {
    assert.ok(
      agentFiles.length >= MIN_AGENT_FILES,
      `Vacuity guard tripped: scanned only ${agentFiles.length} agent markdown files under ` +
        `${path.join(projectRoot, 'agents')}, expected at least ${MIN_AGENT_FILES}. ` +
        `The model_optimized_for fence below is meaningless against an empty corpus — ` +
        `it would pass by finding nothing rather than by the field being absent. ` +
        `Fix the scan root before trusting the fence.`
    );
  });

  it('reads real file content (non-vacuity guard)', () => {
    // Proves the walker returns readable files with substance, not empty stubs —
    // a scan of 100 empty strings would also find zero hits.
    const sample = [...skillFiles, ...agentFiles].filter(
      (f) => fs.readFileSync(f, 'utf8').trim().length > 0
    );
    assert.ok(
      sample.length >= MIN_SKILL_FILES + MIN_AGENT_FILES,
      `Vacuity guard tripped: only ${sample.length} of ${skillFiles.length + agentFiles.length} ` +
        `scanned files have any content. The fence cannot find a field in empty files.`
    );
  });

  // ---- The fence ----------------------------------------------------------

  it(`no skill or agent declares the deleted \`${DELETED_FIELD}\` field`, () => {
    const hits = findHits([...skillFiles, ...agentFiles]);

    const detail = hits.map((h) => `  ${h.file}:${h.line}  ${h.text}`).join('\n');

    assert.equal(
      hits.length,
      0,
      `\`${DELETED_FIELD}\` is a DELETED field and must not reappear. Found ${hits.length} occurrence(s):\n` +
        `${detail}\n\n` +
        `WHY THIS FIELD IS GONE:\n` +
        `  It conflated two different things under one key. On the opus rows it recorded\n` +
        `  PROVENANCE ("an Opus model authored this file"). On the Tier-3 scouts it was read\n` +
        `  as an EXECUTION TARGET — and it was FALSE there: no Haiku model authored those\n` +
        `  files; \`model_optimized_for: haiku-4-5\` only duplicated their runtime\n` +
        `  \`model: haiku\`. One field, two meanings, one of them a lie.\n\n` +
        `WHAT TO USE INSTEAD:\n` +
        `  \`model:\` is the field that declares which model RUNS the artifact. It is real,\n` +
        `  it is enforced elsewhere (scouts must declare \`model: haiku\`), and it is the\n` +
        `  only model declaration an artifact needs. Provenance is not tracked in\n` +
        `  frontmatter — git history records who wrote what.\n\n` +
        `FIX: delete the \`${DELETED_FIELD}:\` line. Do not rename it, do not revive it.`
    );
  });
});
