'use strict';

/**
 * The compaction smoke-check harness (plan "agents get smaller without losing findings —
 * pilot"). Drives the REAL modules under tests/compaction-eval/ against literal inputs:
 * the unit splitter the rule inventory is built on, the lens-contract check and finding
 * matchers the scorer applies to every dispatch, the smoke pass rule, and the preparer that
 * writes the two evaluation copies of an agent. No doubles.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const units = require('./compaction-eval/units');
const score = require('./compaction-eval/score');
const prepare = require('./compaction-eval/prepare');

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-compaction-eval-'));
}

// ── 1. Units ─────────────────────────────────────────────────────────────────────────

describe('1. units', () => {
  test('a paragraph of two sentences gives two units', () => {
    const u = units.splitUnits('First rule here. Second rule there.\n');
    assert.deepEqual(u.map((x) => x.text), ['First rule here.', 'Second rule there.']);
  });

  test('a period inside a backtick span does not split', () => {
    const u = units.splitUnits('Read `src/lib/state.js. getPlansDir` first. Then stop.\n');
    assert.equal(u.length, 2);
    assert.equal(u[0].text, 'Read `src/lib/state.js. getPlansDir` first.');
  });

  test('a table row, a fenced block and the frontmatter are one unit each', () => {
    const md = '---\nname: x\ntools: Read\n---\n\n# Title\n\n| a | b |\n|---|---|\n| one. two. | three |\n\n```json\n{ "a": 1 }\n\nmore. text.\n```\n';
    const u = units.splitUnits(md);
    assert.deepEqual(u.map((x) => x.type), ['frontmatter', 'heading', 'table-row', 'table-row', 'fence']);
    assert.equal(u[0].text, '---\nname: x\ntools: Read\n---');
    assert.equal(u[3].text, '| one. two. | three |');
    assert.ok(u[4].text.startsWith('```json') && u[4].text.endsWith('```'));
  });

  test('a list item splits into sentences and keeps its continuation lines', () => {
    const u = units.splitUnits('- **Bold.** Rule one\n  continues here. Rule two.\n- Next item.\n');
    assert.deepEqual(u.map((x) => x.text), ['- **Bold.** Rule one continues here.', 'Rule two.', '- Next item.']);
  });

  test('the sha ignores runs of whitespace', () => {
    assert.equal(units.shaOf('a  b\n c'), units.shaOf('a b c'));
    assert.notEqual(units.shaOf('a b c'), units.shaOf('a b d'));
    const [one] = units.splitUnits('Same   words here.\n');
    assert.equal(one.sha, units.shaOf('Same words here.'));
  });

  test('sections are split at # and ## headings, normalised, emphasis ignored', () => {
    const s = units.sectionize('---\nname: x\n---\n\n# Agent\n\nIntro **bold** text.\n\n## One\n\nA   rule.\n\n### Sub\n\nStill one.\n\n## Two\n\nB.\n');
    assert.deepEqual(s.map((x) => x.heading), ['frontmatter', '# Agent', '## One', '## Two']);
    assert.equal(s[1].text, '# Agent Intro bold text.');
    assert.ok(s[2].text.includes('A rule.') && s[2].text.includes('Still one.'));
  });
});

// ── 2. Contract check ────────────────────────────────────────────────────────────────

function validPayload() {
  return {
    ref: 'implementation/x.md',
    lens: 'premortem',
    findings: [{
      id: 'f-1', severity: 'critical', confidence: 'HIGH', claim: 'c', evidence: 'src/a.js:12', decision: 'd?',
      options: [
        { key: '1', label: 'fix', recommended: true, pros: 'p', cons: 'c' },
        { key: '2', label: 'cross', pros: 'p', cons: 'c' }
      ]
    }],
    self_assessment: {
      ancestry_read: [], ancestry_missing: [], inputs_unsupplied: ['gate'], source_grepped: [],
      gate: 'Gate 2', gate_source: 'derived-from-ref-stage', coverage: 'full',
      blind_spots: ['symbolic links could not be resolved — x'], stories_generated: 2, stories_kept: 1,
      budget_exhausted: false, rerun_stability: 'stable'
    }
  };
}
const EXPECT = { ref: 'implementation/x.md', lens: 'premortem' };

describe('2. contract check', () => {
  test('a complete valid payload passes', () => {
    const r = score.checkLensContract(validPayload(), EXPECT);
    assert.deepEqual(r.errors, []);
    assert.equal(r.valid, true);
  });

  const breakers = {
    'a missing field': (p) => { delete p.findings[0].evidence; },
    'lens written pre-mortem': (p) => { p.lens = 'pre-mortem'; },
    'a singular pro': (p) => { p.findings[0].options[1].pro = 'x'; },
    'two recommended options': (p) => { p.findings[0].options[1].recommended = true; },
    'one option': (p) => { p.findings[0].options.pop(); },
    'duplicate ids': (p) => { p.findings.push(JSON.parse(JSON.stringify(p.findings[0]))); },
    'gate set with gate_source none': (p) => { p.self_assessment.gate_source = 'none'; },
    'an unknown escalation reason': (p) => { p.escalate = { to: 'cto-chief', reason: 'made-up', detail: 'x' }; },
    'a ref that differs': (p) => { p.ref = 'implementation/y.md'; },
    'empty blind_spots': (p) => { p.self_assessment.blind_spots = []; }
  };
  for (const [name, breakIt] of Object.entries(breakers)) {
    test(`fails for ${name}`, () => {
      const p = validPayload();
      breakIt(p);
      const r = score.checkLensContract(p, EXPECT);
      assert.equal(r.valid, false, `${name} must fail`);
      assert.ok(r.errors.length > 0);
    });
  }

  test('a valid escalate block passes', () => {
    const p = validPayload();
    p.escalate = { to: 'cto-chief', reason: 'pre-mortem-not-performed', also_matched: ['instruction-injection-in-plan'], detail: 'x' };
    assert.equal(score.checkLensContract(p, EXPECT).valid, true);
  });

  test('prose before the object is invalid', () => {
    const r = score.parseFinalMessage('Here is my output:\n' + JSON.stringify(validPayload()));
    assert.equal(r.ok, false);
  });

  test('a bare object parses, unfenced', () => {
    const r = score.parseFinalMessage('  ' + JSON.stringify(validPayload()) + '\n');
    assert.equal(r.ok, true);
    assert.equal(r.fenced, false);
  });

  test('a single fenced block passes and is counted fenced', () => {
    const r = score.parseFinalMessage('```json\n' + JSON.stringify(validPayload(), null, 2) + '\n```');
    assert.equal(r.ok, true);
    assert.equal(r.fenced, true);
    assert.equal(score.checkLensContract(r.value, EXPECT).valid, true);
  });

  test('two fenced blocks are invalid', () => {
    const block = '```json\n{}\n```';
    assert.equal(score.parseFinalMessage(`${block}\n${block}`).ok, false);
  });
});

// ── 3. Matchers ──────────────────────────────────────────────────────────────────────

describe('3. matchers', () => {
  const finding = (evidence, severity = 'important', id = 'x') => ({ id, severity, evidence });
  const window = { evidence_cites: { path: 'src/a.js', from: 11, to: 13 } };

  test('a single line inside the window hits', () => {
    assert.equal(score.matchCondition(finding('see src/a.js:12 for the call'), window), true);
  });
  test('a range overlapping the window hits', () => {
    assert.equal(score.matchCondition(finding('src/a.js:10-12 reads it'), window), true);
  });
  test('a line just outside the window misses', () => {
    assert.equal(score.matchCondition(finding('src/a.js:14'), window), false);
    assert.equal(score.matchCondition(finding('src/a.js:9-10'), window), false);
  });
  test('another path with the same suffix does not hit', () => {
    assert.equal(score.matchCondition(finding('lib/src/a.jsx:12'), window), false);
  });
  test('a severity below the floor misses', () => {
    assert.equal(score.matchCondition(finding('src/a.js:12', 'normal'), { ...window, min_severity: 'important' }), false);
    assert.equal(score.matchCondition(finding('src/a.js:12', 'critical'), { ...window, min_severity: 'important' }), true);
  });
  test('evidence_contains and id are literal matches', () => {
    const f = finding('<<<UNTRUSTED_PLAN_TEXT x UNTRUSTED_PLAN_TEXT>>>', 'critical', 'instruction-injection-in-plan');
    assert.equal(score.matchCondition(f, { id: 'instruction-injection-in-plan', evidence_contains: '<<<UNTRUSTED_PLAN_TEXT' }), true);
    assert.equal(score.matchCondition(f, { id: 'other' }), false);
  });

  const fx = {
    name: 'f', kind: 'planted',
    require: [{ id: 'gate-underivable', min_severity: 'critical' }],
    fields: { 'self_assessment.coverage': 'none' },
    forbid: ['brief-gate-contradicts-ref-stage']
  };
  const payload = (ids, coverage = 'none') => ({
    findings: ids.map((id) => ({ id, severity: 'critical', evidence: '' })),
    self_assessment: { coverage }
  });

  test('a planted defect is found when every require, field and forbid holds', () => {
    assert.equal(score.evaluate(payload(['gate-underivable']), fx).found, true);
  });
  test('a forbidden id present is not found', () => {
    const r = score.evaluate(payload(['gate-underivable', 'brief-gate-contradicts-ref-stage']), fx);
    assert.equal(r.found, false);
    assert.deepEqual(r.forbidden, ['brief-gate-contradicts-ref-stage']);
  });
  test('a payload field mismatch is not found', () => {
    const r = score.evaluate(payload(['gate-underivable'], 'full'), fx);
    assert.equal(r.found, false);
    assert.deepEqual(r.fieldMismatches, ['self_assessment.coverage']);
  });
  test('a clean plan with an important finding is a serious false finding', () => {
    const clean = { name: 'c', kind: 'clean' };
    assert.equal(score.evaluate({ findings: [{ id: 'a', severity: 'important' }] }, clean).seriousFalse, true);
    assert.equal(score.evaluate({ findings: [{ id: 'a', severity: 'normal' }] }, clean).seriousFalse, false);
  });
});

// ── 4. The smoke rule ────────────────────────────────────────────────────────────────

describe('4. the smoke rule', () => {
  const ok = { valid: true, found: true, seriousFalse: false };
  const row = (kind, original, compacted, rerun) => ({ fixture: 'p', kind, original, compacted, rerun });

  test('a clean result passes', () => {
    const v = score.smokeVerdict([row('planted', ok, ok), row('clean', ok, ok)]);
    assert.equal(v.verdict, 'PASS');
  });
  test('a planted defect the original found and the compacted missed fails (pending a rerun)', () => {
    const v = score.smokeVerdict([row('planted', ok, { ...ok, found: false })]);
    assert.equal(v.verdict, 'RERUN');
    assert.deepEqual(v.rows[0].shortfalls, ['missed-planted-defect']);
  });
  test('an invalid output where the original was valid fails on its own', () => {
    const v = score.smokeVerdict([row('clean', ok, { valid: false, found: false, seriousFalse: false })]);
    assert.deepEqual(v.rows[0].shortfalls, ['invalid-output']);
  });
  test('a serious false finding on a clean plan fails on its own', () => {
    const v = score.smokeVerdict([row('clean', ok, { ...ok, seriousFalse: true })]);
    assert.deepEqual(v.rows[0].shortfalls, ['serious-false-finding']);
  });
  test('a planted defect both versions missed is reported and not counted', () => {
    const missed = { ...ok, found: false };
    const v = score.smokeVerdict([row('planted', missed, missed)]);
    assert.equal(v.verdict, 'PASS');
    assert.deepEqual(v.rows[0].shortfalls, []);
    assert.ok(v.rows[0].notes.includes('both-missed-planted-defect'));
  });
  test('a rerun that does not repeat the shortfall clears it', () => {
    const v = score.smokeVerdict([row('planted', ok, { ...ok, found: false }, { original: ok, compacted: ok })]);
    assert.equal(v.verdict, 'PASS');
    assert.equal(v.rows[0].status, 'cleared-by-rerun');
  });
  test('a rerun that repeats the shortfall confirms the failure', () => {
    const miss = { ...ok, found: false };
    const v = score.smokeVerdict([row('planted', ok, miss, { original: ok, compacted: miss })]);
    assert.equal(v.verdict, 'FAIL');
    assert.equal(v.rows[0].status, 'confirmed');
  });
});

// ── 5. prepare.js ────────────────────────────────────────────────────────────────────

const AGENT = '---\nname: premortem-critic\ndescription: Real one.\ntools: Read, Grep\nmodel: opus\n---\n\n# Body\n\nRule.\n';

describe('5. prepare.js', () => {
  test('the eval copy keeps the body byte for byte and changes only name and description', () => {
    const copy = prepare.evalCopy(AGENT, 'premortem-eval-original');
    const a = prepare.splitFrontmatter(AGENT);
    const b = prepare.splitFrontmatter(copy);
    assert.equal(b.body, a.body);
    const diff = a.lines.filter((l, i) => l !== b.lines[i]);
    assert.deepEqual(diff, ['name: premortem-critic', 'description: Real one.']);
    assert.ok(b.lines.includes('name: premortem-eval-original'));
    assert.ok(/evaluation copy, dispatch by name only/.test(copy));
  });

  test('it writes only under the directories it is given, lists every dispatch, and --clean removes them', () => {
    const dir = tmpdir();
    try {
      const agentsDir = path.join(dir, 'agents');
      const evalDir = path.join(dir, 'eval');
      const expectations = {
        brief_title: 'Run the pre-mortem lens on one plan.',
        fixtures_dir: 'fx',
        fixtures: [
          { name: 'a', kind: 'planted', ref: 'todo/a.md', gate: 'Gate 2', related_plans: [], detected_conflicts: [] },
          { name: 'b', kind: 'clean', ref: 'functional/b.md', related_plans: [{ plan: 'plans/functional/c.md', score: 0.5 }] }
        ]
      };
      const out = prepare.prepare({
        agent: 'premortem-critic', originalText: AGENT, compactedText: AGENT.replace('Rule.', 'Rule!'),
        agentsDir, evalDir, expectations, root: dir
      });
      const written = fs.readdirSync(agentsDir).sort();
      assert.deepEqual(written, ['premortem-eval-compacted.md', 'premortem-eval-original.md']);
      assert.deepEqual(fs.readdirSync(dir).sort(), ['agents', 'eval']);
      const plan = JSON.parse(fs.readFileSync(out.runPlanPath, 'utf8'));
      assert.equal(plan.dispatches.length, 4);
      for (const name of ['a', 'b']) {
        const ds = plan.dispatches.filter((d) => d.fixture === name);
        assert.deepEqual(ds.map((d) => d.version), ['original', 'compacted']);
        assert.equal(ds[0].prompt, ds[1].prompt, 'both versions get the exact same brief');
      }
      const a = plan.dispatches[0];
      assert.equal(a.subagent_type, 'premortem-eval-original');
      assert.ok(a.prompt.startsWith('Run the pre-mortem lens on one plan.\nref: todo/a.md\nproject root: '));
      assert.ok(a.prompt.includes('project root: fx/a\n'), 'the project root is relative to the repository root');
      assert.ok(!fs.readFileSync(out.runPlanPath, 'utf8').includes(dir), 'the run plan carries no absolute path');
      assert.ok(a.prompt.includes('gate: Gate 2\n'));
      assert.ok(a.prompt.includes('Related plans: []\nDetected cross-plan conflicts: []'));
      assert.ok(!plan.dispatches[2].prompt.includes('gate:'), 'no gate line when the fixture names none');
      assert.ok(plan.dispatches[2].prompt.includes('Related plans: [{"plan":"plans/functional/c.md","score":0.5}]'));
      assert.equal(plan.token_readings.length, 2);
      assert.equal(plan.token_readings[0].prompt, 'Reply with OK.');

      prepare.clean({ agent: 'premortem-critic', agentsDir });
      assert.deepEqual(fs.readdirSync(agentsDir), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('an agent name that could leave the directory is refused', () => {
    assert.throws(() => prepare.evalName('../x'), /agent name/);
  });

  test('prepare refuses a bad agent name before it writes anything', () => {
    const dir = tmpdir();
    try {
      assert.throws(() => prepare.prepare({ agent: '../x', originalText: AGENT, compactedText: AGENT, agentsDir: path.join(dir, 'agents'), evalDir: path.join(dir, 'eval'), expectations: null, root: dir }), /agent name/);
      assert.deepEqual(fs.readdirSync(dir), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('prepare refuses an agents directory that resolves outside the root', () => {
    const dir = tmpdir();
    const outside = tmpdir();
    try {
      fs.mkdirSync(path.join(dir, '.claude'));
      fs.symlinkSync(outside, path.join(dir, '.claude', 'agents'));
      assert.throws(() => prepare.prepare({ agent: 'premortem-critic', originalText: AGENT, compactedText: AGENT, agentsDir: path.join(dir, '.claude', 'agents'), evalDir: path.join(dir, 'eval'), expectations: null, root: dir }), /outside the root/);
      assert.deepEqual(fs.readdirSync(outside), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  test('a rerun of prepare replaces the evaluation copies', () => {
    const dir = tmpdir();
    try {
      const args = { agent: 'premortem-critic', originalText: AGENT, compactedText: AGENT, agentsDir: path.join(dir, 'agents'), evalDir: path.join(dir, 'eval'), expectations: null, root: dir };
      prepare.prepare(args);
      prepare.prepare({ ...args, compactedText: AGENT.replace('Rule.', 'Changed.') });
      assert.ok(fs.readFileSync(path.join(dir, 'agents', 'premortem-eval-compacted.md'), 'utf8').includes('Changed.'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a <commit>:<path> original is read with git show', () => {
    const text = prepare.readSource('d57186c0:agents/iron-loop/premortem-critic.md', path.join(__dirname, '..'));
    assert.ok(text.startsWith('---\nname: premortem-critic\n'));
  });
});

// ── 6. Transcript collection ─────────────────────────────────────────────────────────

describe('6. collecting outputs from subagent transcripts', () => {
  test('the final assistant text, its tokens and the duration are written as a run file', () => {
    const dir = tmpdir();
    try {
      const sub = path.join(dir, 'subagents');
      const runs = path.join(dir, 'runs');
      fs.mkdirSync(sub);
      fs.writeFileSync(path.join(sub, 'agent-1.meta.json'), JSON.stringify({ description: 'compaction-eval a original' }));
      const lines = [
        { type: 'user', timestamp: '2026-10-06T10:00:00.000Z', message: { content: 'brief' } },
        { type: 'assistant', timestamp: '2026-10-06T10:00:05.000Z', message: { content: [{ type: 'text', text: 'thinking aloud' }], usage: { input_tokens: 1, output_tokens: 1 } } },
        { type: 'assistant', timestamp: '2026-10-06T10:01:00.000Z', message: { content: [{ type: 'text', text: '{"ref":"x"}' }], usage: { input_tokens: 10, cache_creation_input_tokens: 20, cache_read_input_tokens: 30, output_tokens: 40 } } }
      ];
      fs.writeFileSync(path.join(sub, 'agent-1.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
      fs.writeFileSync(path.join(sub, 'agent-2.meta.json'), JSON.stringify({ description: 'something else' }));
      for (const [i, d] of [['3', 'compaction-eval .. original'], ['4', 'compaction-eval ../../x original'], ['5', 'compaction-eval not-a-fixture original']].entries()) {
        fs.writeFileSync(path.join(sub, `agent-x${i}.meta.json`), JSON.stringify({ description: d[1] }));
        fs.writeFileSync(path.join(sub, `agent-x${i}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
      }
      const got = score.collectTranscripts(sub, runs, ['a']);
      assert.deepEqual(fs.readdirSync(dir).sort(), ['runs', 'subagents'], 'nothing written outside the runs directory');
      assert.deepEqual(got.map((g) => g.file), ['a__original.json']);
      const run = JSON.parse(fs.readFileSync(path.join(runs, 'a__original.json'), 'utf8'));
      assert.equal(run.output, '{"ref":"x"}');
      assert.equal(run.tokens, 100);
      assert.equal(run.duration_ms, 60000);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── 7. Headless outputs ──────────────────────────────────────────────────────────────

describe('7. collecting outputs from headless runs', () => {
  test('the result text, summed usage tokens and duration become a run file; private fields are dropped', () => {
    const dir = tmpdir();
    try {
      const raw = path.join(dir, 'raw');
      const runs = path.join(dir, 'runs');
      fs.mkdirSync(raw);
      const out = { type: 'result', result: '{"ref":"x"}', is_error: false, duration_ms: 1234, session_id: 'secret-session', total_cost_usd: 0.5,
        usage: { input_tokens: 1, cache_creation_input_tokens: 2, cache_read_input_tokens: 3, output_tokens: 4 } };
      fs.writeFileSync(path.join(raw, 'a__original.json'), JSON.stringify(out));
      fs.writeFileSync(path.join(raw, 'a__compacted__rerun.json'), JSON.stringify(out));
      fs.writeFileSync(path.join(raw, '..__original.json'), JSON.stringify(out));
      fs.writeFileSync(path.join(raw, 'unknown__original.json'), JSON.stringify(out));
      const got = score.collectHeadless(raw, runs, ['a']);
      assert.deepEqual(got.map((g) => g.file).sort(), ['a__compacted__rerun.json', 'a__original.json']);
      const run = JSON.parse(fs.readFileSync(path.join(runs, 'a__original.json'), 'utf8'));
      assert.deepEqual(run, { output: '{"ref":"x"}', tokens: 10, duration_ms: 1234, cost_usd: 0.5, is_error: false });
      assert.deepEqual(fs.readdirSync(dir).sort(), ['raw', 'runs']);
      fs.writeFileSync(path.join(raw, 'b__original.json'), JSON.stringify({ ...out, result: 'see /home/u/repo/src/a.js:3 and /home/u/repo' }));
      score.collectHeadless(raw, runs, ['b'], '/home/u/repo');
      assert.equal(JSON.parse(fs.readFileSync(path.join(runs, 'b__original.json'), 'utf8')).output, 'see src/a.js:3 and .', 'the repository root never reaches a run file');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
