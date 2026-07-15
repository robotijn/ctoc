/**
 * inbox-coverage.test.js — dark-branch / mutation-kill coverage for src/lib/inbox.js
 *
 * Companion to tests/inbox.test.js (happy paths) and tests/inbox-stale-stream.test.js
 * (the staleCandidates render seam). This file deliberately targets the branches those
 * two DON'T reach, and every test is written to go RED under a one-line mutation of the
 * production code — line coverage that kills no mutant is not the goal here.
 *
 * Baseline before this file (scoped to src/lib/inbox.js): 95.18% line / 66.67% branch,
 * uncovered lines 255-268 (listRelatedForInbox) and 284-285 (listEscalations catch).
 *
 * Boundary seams (fakes ONLY at the true collaborator boundary — never inbox's own logic):
 *   - plan-index leaf `related.js` .related  (semantic-search subsystem)
 *   - circuit-breaker .getEscalations         (escalation store)
 *   - stale-detector .scanCheapCandidates / .NOT_STARTED_STAGES (stale scanner)
 * Each is captured once and restored in afterEach; node runs this file in its own
 * process, so a rewire can never leak to another test file.
 *
 * NOTE on scope: control-char stripping of hostile agent fields lives in the RENDER
 * layer (src/areas/inbox.js / menu-screens stripCtl — see inbox-stale-stream.test.js
 * S1). The DATA layer's only field sanitization is createDecision's double-quote
 * escaping into YAML frontmatter, which is exercised below.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const inbox = require('../src/lib/inbox');
const { invalidate } = require('../src/lib/cache');
const relatedLeaf = require('../src/lib/plan-index/related'); // real module — rewired at .related
const circuitBreaker = require('../src/lib/circuit-breaker'); // real module — rewired at .getEscalations
const staleDetector = require('../src/lib/stale-detector');   // real module — rewired at scan / NOT_STARTED_STAGES

function tempProject({ plansStages = ['functional', 'implementation', 'todo', 'in-progress', 'review', 'done'], inboxDirs = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-inbox-cov-'));
  for (const s of plansStages) fs.mkdirSync(path.join(dir, 'plans', s), { recursive: true });
  if (inboxDirs) {
    fs.mkdirSync(path.join(dir, '.ctoc', 'inbox', 'questions'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.ctoc', 'inbox', 'decisions'), { recursive: true });
  }
  return dir;
}
function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ } }

// ---------------------------------------------------------------------------
// Cluster A — listRelatedForInbox: the fail-open semantic-search wrapper (255-268)
// Every branch here is dark at baseline. The load-bearing invariant is: a fault in
// the semantic subsystem can NEVER reject or crash the inbox — it always resolves [].
// ---------------------------------------------------------------------------
describe('listRelatedForInbox — fail-open wrapper around plan-index.related', () => {
  let root;
  const realRelated = relatedLeaf.related; // capture the genuine impl once

  beforeEach(() => { root = tempProject(); });
  afterEach(() => { relatedLeaf.related = realRelated; cleanup(root); });

  it('should_return_empty_without_calling_related_when_seed_is_not_a_string', async () => {
    // Arrange — a related() that would EXPLODE if it were ever called
    let called = false;
    relatedLeaf.related = async () => { called = true; throw new Error('related must not be called'); };

    // Act
    const out = await inbox.listRelatedForInbox(42, root);

    // Assert — the typeof guard short-circuits before the boundary is touched
    assert.deepEqual(out, []);
    assert.equal(called, false, 'non-string seed must not reach the semantic boundary');
  });

  it('should_return_empty_when_seed_is_the_empty_string', async () => {
    let called = false;
    relatedLeaf.related = async () => { called = true; return [{ planPath: 'x', score: 1 }]; };

    const out = await inbox.listRelatedForInbox('', root);

    assert.deepEqual(out, []);
    assert.equal(called, false, 'length===0 guard fires before the boundary');
  });

  it('should_pass_projectPath_and_limit_five_to_the_boundary_and_return_the_neighbours', async () => {
    // Arrange — capture the exact args the wrapper hands the boundary
    let seen = null;
    const neighbours = [{ planPath: 'a', score: 0.9 }, { planPath: 'b', score: 0.8 }];
    relatedLeaf.related = async (slug, opts) => { seen = { slug, opts }; return neighbours; };

    // Act
    const out = await inbox.listRelatedForInbox('seed-plan', root);

    // Assert — return value AND the boundary contract ({ projectPath, limit: 5 })
    assert.deepEqual(out, neighbours);
    assert.equal(seen.slug, 'seed-plan');
    assert.equal(seen.opts.projectPath, root, 'root must be forwarded as projectPath');
    assert.equal(seen.opts.limit, 5, 'limit must be pinned to 5');
  });

  it('should_cap_the_result_at_five_when_the_boundary_returns_more', async () => {
    // Arrange — 8 neighbours; the wrapper must slice to the top 5
    const eight = Array.from({ length: 8 }, (_, i) => ({ planPath: `p${i}`, score: 1 - i / 10 }));
    relatedLeaf.related = async () => eight;

    // Act
    const out = await inbox.listRelatedForInbox('seed', root);

    // Assert
    assert.equal(out.length, 5, 'slice(0,5) must bound the list even when the boundary over-returns');
    assert.deepEqual(out.map((r) => r.planPath), ['p0', 'p1', 'p2', 'p3', 'p4']);
  });

  it('should_return_empty_when_the_boundary_resolves_a_non_array', async () => {
    // Arrange — a malformed boundary result (object, not array)
    relatedLeaf.related = async () => ({ nope: true });

    // Act
    const out = await inbox.listRelatedForInbox('seed', root);

    // Assert — Array.isArray guard falls through to []
    assert.deepEqual(out, []);
  });

  it('should_resolve_empty_when_the_boundary_rejects_rather_than_propagating', async () => {
    // Arrange — the boundary throws asynchronously
    relatedLeaf.related = async () => { throw new Error('embedding backend down'); };

    // Act — must NOT reject (the load-bearing fail-open invariant)
    const out = await inbox.listRelatedForInbox('seed', root);

    // Assert
    assert.deepEqual(out, [], 'a rejecting boundary must be swallowed into []');
  });

  it('should_return_empty_when_the_related_export_is_absent_from_the_barrel', async () => {
    // Arrange — simulate a broken/missing barrel export (getter resolves undefined)
    relatedLeaf.related = undefined;

    // Act
    const out = await inbox.listRelatedForInbox('seed', root);

    // Assert — the `typeof planIndex.related !== 'function'` guard returns []
    assert.deepEqual(out, []);
  });
});

// ---------------------------------------------------------------------------
// Cluster B — listEscalations: fail-open around the circuit-breaker store (282, 284-285)
// Real escalation files exercise the filter predicate; the boundary is rewired ONLY
// for the two defensive branches (throw / non-array) that the hardened getEscalations
// can never emit through real files.
// ---------------------------------------------------------------------------
describe('listEscalations — unacknowledged filter + fail-open store', () => {
  let root;
  const realGetEscalations = circuitBreaker.getEscalations;

  beforeEach(() => { root = tempProject(); invalidate('getInboxCounts'); });
  afterEach(() => { circuitBreaker.getEscalations = realGetEscalations; invalidate('getInboxCounts'); cleanup(root); });

  function writeEscalations(entries) {
    const logsDir = path.join(root, '.ctoc', 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(path.join(logsDir, 'escalations.json'), JSON.stringify(entries));
  }

  it('should_return_only_unacknowledged_entries', () => {
    // Arrange — a real store mixing acknowledged and open escalations
    writeEscalations([
      { type: 'same-step', plan: 'p1', acknowledged: false },
      { type: 'per-plan', plan: 'p2', acknowledged: true },  // must be filtered OUT
      { type: 'same-step', plan: 'p3' },                     // no flag ⇒ still open
    ]);

    // Act
    const out = inbox.listEscalations(root);

    // Assert — the !e.acknowledged predicate drops exactly the acknowledged one
    assert.deepEqual(out.map((e) => e.plan), ['p1', 'p3']);
  });

  it('should_skip_null_entries_in_the_store', () => {
    // Arrange — a corrupt array with a null hole
    writeEscalations([null, { plan: 'real', acknowledged: false }]);

    // Act
    const out = inbox.listEscalations(root);

    // Assert — the `e &&` guard drops the null without crashing
    assert.deepEqual(out.map((e) => e.plan), ['real']);
  });

  it('should_return_empty_when_the_escalations_store_is_absent', () => {
    // Arrange — no escalations.json written at all
    // Act
    const out = inbox.listEscalations(root);
    // Assert
    assert.deepEqual(out, []);
  });

  it('should_fail_open_to_empty_when_getEscalations_throws', () => {
    // Arrange — boundary fault: the store read itself throws
    circuitBreaker.getEscalations = () => { throw new Error('store read exploded'); };

    // Act — must not propagate (this is the 284-285 catch)
    const out = inbox.listEscalations(root);

    // Assert
    assert.deepEqual(out, [], 'a throwing escalation store must degrade to []');
  });

  it('should_fail_safe_to_empty_when_getEscalations_returns_a_non_array', () => {
    // Arrange — boundary returns a non-array (defensive Array.isArray branch)
    circuitBreaker.getEscalations = () => ({ not: 'an array' });

    // Act
    const out = inbox.listEscalations(root);

    // Assert
    assert.deepEqual(out, []);
  });

  it('should_count_only_unacknowledged_escalations_in_getInboxCounts', () => {
    // Arrange
    writeEscalations([
      { plan: 'open1', acknowledged: false },
      { plan: 'done1', acknowledged: true },
    ]);

    // Act
    const counts = inbox.getInboxCounts(root);

    // Assert — the count is the filtered length, not the raw store length
    assert.equal(counts.escalations, 1);
  });
});

// ---------------------------------------------------------------------------
// Cluster C — parseFrontmatter: the colon-split / unquote branches
// ---------------------------------------------------------------------------
describe('parseFrontmatter — colon-split and unquote edge branches', () => {
  it('should_return_empty_map_when_there_is_no_frontmatter_block', () => {
    // Arrange — body-only content, no leading --- fence
    const content = '# Just a heading\n\nsome prose: with a colon in it\n';

    // Act
    const meta = inbox.parseFrontmatter(content);

    // Assert — hasFrontmatter false ⇒ {}, NOT a fabricated key from the prose colon
    assert.deepEqual(meta, {});
  });

  it('should_skip_lines_with_no_colon_and_lines_that_begin_with_a_colon', () => {
    // Arrange — a valid pair, a bare no-colon line, and a leading-colon line (c===0)
    const content = [
      '---',
      'good: yes',
      'barewordnocolon',   // indexOf(':') === -1 ⇒ skipped
      ':leadingcolon',     // indexOf(':') === 0  ⇒ c>0 false ⇒ skipped
      '---',
      'body',
    ].join('\n');

    // Act
    const meta = inbox.parseFrontmatter(content);

    // Assert — only the valid pair survives; the two malformed lines contribute nothing
    assert.deepEqual(meta, { good: 'yes' });
  });

  it('should_strip_a_single_wrapping_quote_pair_from_values', () => {
    // Arrange — double-quoted, single-quoted, and half-quoted values
    const content = [
      '---',
      'dq: "hello"',
      "sq: 'world'",
      'lead: "onlyleading',   // leading quote stripped, no trailing
      'trail: onlytrailing"', // trailing quote stripped, no leading
      '---',
    ].join('\n');

    // Act
    const meta = inbox.parseFrontmatter(content);

    // Assert — the /^["']|["']$/g strip removes wrapping quotes on each end
    assert.equal(meta.dq, 'hello');
    assert.equal(meta.sq, 'world');
    assert.equal(meta.lead, 'onlyleading');
    assert.equal(meta.trail, 'onlytrailing');
  });

  it('should_parse_a_CRLF_frontmatter_byte_identically_to_its_LF_twin', () => {
    // Arrange — same document, Windows CRLF endings
    const crlf = '---\r\nid: abc\r\nstatus: open\r\n---\r\nbody\r\n';

    // Act
    const meta = inbox.parseFrontmatter(crlf);

    // Assert — no stray \r leaks into keys or values
    assert.deepEqual(meta, { id: 'abc', status: 'open' });
  });
});

// ---------------------------------------------------------------------------
// Cluster D — listQuestions / listDecisions: the status-filter SECOND operand,
// the .md/.gitkeep filter, and the absent-directory fallback.
// ---------------------------------------------------------------------------
describe('listQuestions / listDecisions — status filter and missing-dir fallback', () => {
  let root;
  beforeEach(() => { root = tempProject(); });
  afterEach(() => cleanup(root));

  function writeRaw(stream, name, frontmatter) {
    const p = path.join(root, '.ctoc', 'inbox', stream, name);
    fs.writeFileSync(p, `---\n${frontmatter}\n---\n\nbody\n`);
    return p;
  }

  it('should_exclude_a_question_whose_status_is_not_open', () => {
    // Arrange — one open, one resolved (status !== 'open')
    writeRaw('questions', 'a.md', 'id: a\nstatus: open');
    writeRaw('questions', 'b.md', 'id: b\nstatus: resolved');

    // Act
    const out = inbox.listQuestions(root);

    // Assert — the item.status === 'open' operand drops the resolved one
    assert.deepEqual(out.map((q) => q.id), ['a']);
  });

  it('should_exclude_an_item_that_has_no_status_field_at_all', () => {
    // Arrange — a decision file missing its status frontmatter entirely
    writeRaw('decisions', 'nostatus.md', 'id: n\nplan: p');
    writeRaw('decisions', 'ok.md', 'id: o\nstatus: pending-review');

    // Act
    const out = inbox.listDecisions(root);

    // Assert — undefined !== 'pending-review' ⇒ the fieldless item is excluded
    assert.deepEqual(out.map((d) => d.id), ['o']);
  });

  it('should_ignore_gitkeep_and_non_markdown_files_in_the_stream', () => {
    // Arrange — noise alongside a single valid open question
    writeRaw('questions', 'real.md', 'id: r\nstatus: open');
    fs.writeFileSync(path.join(root, '.ctoc', 'inbox', 'questions', '.gitkeep'), '');
    fs.writeFileSync(path.join(root, '.ctoc', 'inbox', 'questions', 'notes.txt'), 'status: open');

    // Act
    const out = inbox.listQuestions(root);

    // Assert — only the .md (and not .gitkeep) is enumerated
    assert.deepEqual(out.map((q) => q.id), ['r']);
  });

  it('should_return_empty_when_the_stream_directory_is_absent', () => {
    // Arrange — a project with NO inbox subdirectories at all
    const bare = tempProject({ inboxDirs: false });
    try {
      // Act
      const q = inbox.listQuestions(bare);
      const d = inbox.listDecisions(bare);

      // Assert — a missing dir yields [], never a crash
      assert.deepEqual(q, []);
      assert.deepEqual(d, []);
    } finally {
      cleanup(bare);
    }
  });
});

// ---------------------------------------------------------------------------
// Cluster E — listPlansAtGates: absent plans/ dir and a missing gate-source stage.
// (inbox.test.js only exercises the all-dirs-present path.)
// ---------------------------------------------------------------------------
describe('listPlansAtGates — missing-directory branches', () => {
  it('should_return_empty_when_the_plans_directory_is_absent', () => {
    // Arrange — a project with inbox dirs but NO plans/ tree
    const root = tempProject({ plansStages: [] });
    try {
      // Act
      const out = inbox.listPlansAtGates(root);
      // Assert — the !existsSync(plansDir) early return, not a readdir crash
      assert.deepEqual(out, []);
    } finally {
      cleanup(root);
    }
  });

  it('should_skip_a_gate_source_stage_whose_directory_is_missing', () => {
    // Arrange — plans/ exists with ONLY functional/ (implementation/ + review/ absent)
    const root = tempProject({ plansStages: ['functional'] });
    try {
      fs.writeFileSync(path.join(root, 'plans', 'functional', 'f1.md'), '---\ntitle: F1\n---\n');

      // Act
      const out = inbox.listPlansAtGates(root);

      // Assert — the two missing stage dirs hit `continue`; only functional is reported
      assert.deepEqual(out, [{ plan: 'f1', stage: 'functional', gate: 1 }]);
    } finally {
      cleanup(root);
    }
  });
});

// ---------------------------------------------------------------------------
// Cluster F — countActionableStale via getInboxCounts.staleCandidates:
// the NOT_STARTED_STAGES-absent fallback and the non-array candidates guard.
// Boundary rewire on stale-detector; NOT_STARTED_STAGES temporarily removed.
// ---------------------------------------------------------------------------
describe('countActionableStale — NOT_STARTED_STAGES fallback and non-array guard', () => {
  let root;
  const realScan = staleDetector.scanCheapCandidates;
  const realNotStarted = staleDetector.NOT_STARTED_STAGES;

  beforeEach(() => { root = tempProject(); invalidate('getInboxCounts'); });
  afterEach(() => {
    staleDetector.scanCheapCandidates = realScan;
    staleDetector.NOT_STARTED_STAGES = realNotStarted;
    invalidate('getInboxCounts');
    cleanup(root);
  });

  it('should_count_every_candidate_unfiltered_when_NOT_STARTED_STAGES_export_is_absent', () => {
    // Arrange — an older stale-detector without the NOT_STARTED_STAGES Set.
    // With the real Set, a functional candidate would be filtered out (count 2);
    // WITHOUT it, the fallback must count all three.
    staleDetector.scanCheapCandidates = () => ({
      candidates: [
        { plan: 'a', stage: 'functional', signals: ['missing-files'], actionable: true },
        { plan: 'b', stage: 'review', signals: ['missing-files'], actionable: true },
        { plan: 'c', stage: 'todo', signals: ['missing-files'], actionable: true },
      ],
      count: 3,
    });
    staleDetector.NOT_STARTED_STAGES = undefined; // simulate the missing export

    // Act
    const counts = inbox.getInboxCounts(root);

    // Assert — the guard falls back to list.length (no filtering)
    assert.equal(counts.staleCandidates, 3);
  });

  it('should_treat_a_non_array_candidates_payload_as_empty', () => {
    // Arrange — a malformed scan result whose candidates is not an array
    staleDetector.scanCheapCandidates = () => ({ candidates: null, count: 99 });

    // Act
    const counts = inbox.getInboxCounts(root);

    // Assert — Array.isArray guard ⇒ [] ⇒ 0, never a crash or the bogus 99
    assert.equal(counts.staleCandidates, 0);
  });
});

// ---------------------------------------------------------------------------
// Cluster G — createQuestion / createDecision: the `|| ''` field fallbacks and
// createDecision's double-quote escaping into YAML frontmatter (the data layer's
// only field sanitization).
// ---------------------------------------------------------------------------
describe('createQuestion / createDecision — defaults and quote-escaping', () => {
  let root;
  beforeEach(() => { root = tempProject(); });
  afterEach(() => cleanup(root));

  it('should_default_all_question_fields_to_empty_strings_when_opts_are_omitted', () => {
    // Arrange + Act — create with a completely empty opts object
    inbox.createQuestion({}, root);
    const [q] = inbox.listQuestions(root);

    // Assert — the `|| ''` fallbacks write empty (not the string "undefined")
    assert.equal(q.status, 'open');
    assert.equal(q.source_plan, '', 'missing source_plan defaults to empty, not "undefined"');
    assert.equal(q.source_step, '');
  });

  it('should_default_decision_fields_to_empty_and_mark_pending_review_when_opts_are_omitted', () => {
    // Arrange + Act
    inbox.createDecision({ plan: 'p' }, root);
    const [d] = inbox.listDecisions(root);

    // Assert
    assert.equal(d.status, 'pending-review');
    assert.equal(d.plan, 'p');
    assert.equal(d.choice, '', 'missing choice defaults to empty in frontmatter');
    assert.equal(d.rationale, '');
  });

  it('should_escape_embedded_double_quotes_in_decision_frontmatter', () => {
    // Arrange — an ambiguity field carrying literal double quotes (would break YAML
    // if not escaped, and could inject a spurious frontmatter value)
    const result = inbox.createDecision({
      plan: 'p', step: '10',
      ambiguity: 'he said "hi" loudly',
      choice: 'q"uote',
      rationale: 'because "reasons"',
    }, root);
    const content = fs.readFileSync(result.path, 'utf8');

    // Assert — each interior double quote is backslash-escaped in the YAML line
    assert.ok(
      content.includes('ambiguity: "he said \\"hi\\" loudly"'),
      'interior quotes in ambiguity must be escaped as \\"',
    );
    assert.ok(content.includes('choice: "q\\"uote"'), 'interior quote in choice must be escaped');
    assert.ok(content.includes('rationale: "because \\"reasons\\""'), 'interior quotes in rationale must be escaped');
  });
});
