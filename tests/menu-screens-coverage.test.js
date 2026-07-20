/**
 * Menu Screens — DARK-BRANCH coverage tests.
 *
 * Companion to tests/menu-screens.test.js. That file pins the happy-path screen
 * shapes; this file targets the NON-OBVIOUS data/logic branches those tests leave
 * dark: inbox door aggregation + capping, stripCtl sanitization of agent-writable
 * fields, the stale/cleanup grouping + category mapping, the background-task
 * command state machine (add/start/fail/cancel/complete), argument parsing and
 * base64 decoding fallbacks, the traversal/unknown-stage refusal shape, the
 * dashboard's inbox count wiring, and the router's every arm.
 *
 * Every test asserts SEMANTIC content (counts, labels, action strings, sanitized
 * output, section presence/absence) — never merely "a string was produced". Real
 * os.tmpdir() fixtures, cleaned in afterEach. Loads the real module; the only
 * boundary fakes are (a) the git-spawning staleDetector.verifyStaleCandidate seam
 * the module documents, and (b) safeFs.readFileSync for the VERSION-read catch —
 * both restored in finally.
 *
 * Human-reviewed line-by-line before commit (AI-authored per unit-test-writer skill).
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { test, describe, afterEach } = require('node:test');

const menu = require('../src/lib/menu-screens.js');
const staleDetector = require('../src/lib/stale-detector.js');
const safeFs = require('../src/lib/safe-fs.js');

// ── fixtures ─────────────────────────────────────────────────────────────────
const STAGES = ['canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done', 'vision'];
const dirs = [];

function mkProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-mscov-'));
  dirs.push(root);
  for (const s of STAGES) fs.mkdirSync(path.join(root, 'plans', s), { recursive: true });
  fs.mkdirSync(path.join(root, '.ctoc', 'state'), { recursive: true });
  fs.mkdirSync(path.join(root, '.ctoc', 'logs'), { recursive: true });
  return root;
}

function writePlan(root, stage, name, body) {
  const p = path.join(root, 'plans', stage, `${name}.md`);
  fs.writeFileSync(p, body != null ? body : `# ${name}\n\n## Problem Statement\nX.\n`);
  return p;
}

/**
 * A plan that declares a file which does not exist → cheap scan emits missing-files.
 *
 * CHOOSE THE STAGE DELIBERATELY. A missing declared file only means "abandoned" at a
 * stage where the files were supposed to have been BUILT. Pass `'review'` when the
 * fixture needs an ACTIONABLE / dead-on-arrival candidate; pass a not-started stage
 * (`vision`, `canvas`, `functional`, `implementation`) when it needs a benign one.
 *
 * TEN FIXTURES RETARGETED implementation → review, 2026-07-19. They passed
 * `'implementation'` to manufacture a dead-on-arrival candidate, which stopped
 * working — correctly — when `implementation` joined NOT_STARTED_STAGES.
 *
 * WHAT THE CODE IS SUPPOSED TO DO, derived from OUTSIDE these tests, never from what
 * the code returns:
 *   1. The NOT_STARTED_STAGES contract in src/lib/stale-detector.js defines the set as
 *      "stages at which declared files are NOT yet expected to exist — a missing-files
 *      signal here means the plan is UNBUILT (not started), never abandoned."
 *   2. CLAUDE.md's pipeline model, "Pre-todo is context-building. Todo+ is execution",
 *      places the implementation stage BEFORE Gate 2. Such a plan has never entered the
 *      todo queue and has therefore NEVER BEEN EXECUTED; its declared `files:` are the
 *      files it INTENDS to create, so they are SUPPOSED to be missing.
 *   3. Measured on this repository before the fix: 8 of 21 cheap-scan candidates (38%)
 *      were unbuilt implementation plans reported as abandoned work — the detector's
 *      loudest output, and noise.
 *
 * WHY THE TESTS WERE WRONG RATHER THAN THE CODE: not one of the ten has the stage
 * polarity as its SUBJECT. Their subjects are dashboard counts, cleanup grouping, and
 * routing; the stage is scaffolding chosen only to produce an actionable candidate.
 * They needed SOME files-expected stage and had picked one that is not. `review` is
 * post-build, so a declared file missing there is a genuine death signal — the one
 * stage where `missing-files` keeps full teeth.
 *
 * WHICH IMPLEMENTATION PASSES/FAILS: they passed while NOT_STARTED_STAGES was
 * {vision, canvas, functional} and fail once `implementation` joins it. No assertion
 * was weakened, deleted, or widened — only the fixture's stage moved.
 */
function writeStalePlan(root, stage, name) {
  writePlan(root, stage, name,
    `---\ntitle: ${name}\ntype: implementation\nfiles:\n  - src/does-not-exist-${name}.js\n---\n\n# ${name}\n`);
}

function writeQuestion(root, id, fields) {
  const dir = path.join(root, '.ctoc', 'inbox', 'questions');
  fs.mkdirSync(dir, { recursive: true });
  const f = fields || {};
  const created = f.created != null ? f.created : new Date().toISOString();
  fs.writeFileSync(path.join(dir, `${id}.md`),
    `---\nid: ${id}\ncreated: ${created}\nsource_plan: ${f.source_plan || ''}\nsource_step: ${f.source_step || ''}\nstatus: open\n---\n\n## Question\n${f.question || 'q'}\n`);
}

function writeDecision(root, id, fields) {
  const dir = path.join(root, '.ctoc', 'inbox', 'decisions');
  fs.mkdirSync(dir, { recursive: true });
  const f = fields || {};
  const created = f.created != null ? f.created : new Date().toISOString();
  fs.writeFileSync(path.join(dir, `${id}.md`),
    `---\nid: ${id}\ncreated: ${created}\nplan: ${f.plan || ''}\nstep: ${f.step || ''}\nambiguity: "${f.ambiguity || ''}"\nstatus: pending-review\n---\n\n## Ambiguity\n${f.ambiguity || ''}\n`);
}

function writeEscalations(root, entries) {
  fs.writeFileSync(path.join(root, '.ctoc', 'logs', 'escalations.json'), JSON.stringify(entries, null, 2));
}

function writeDeployReady(root, raw) {
  fs.writeFileSync(path.join(root, '.ctoc', 'logs', 'deploy-ready.json'),
    typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2));
}

function iso(offsetMs) {
  return new Date(Date.now() - offsetMs).toISOString();
}

function makeTask(id, o) {
  o = o || {};
  const status = o.status || 'queued';
  const started = o.startedAgo != null
    ? iso(o.startedAgo)
    : (status === 'running' || status === 'cancelling' ? new Date().toISOString() : null);
  return {
    id,
    kind: o.kind || 'review',
    label: o.label || '',
    plan: o.plan != null ? o.plan : null,
    status,
    agentTaskId: o.agentTaskId != null ? o.agentTaskId : null,
    touches: o.touches || [],
    gitOp: o.gitOp === true,
    blockedBy: o.blockedBy || [],
    result: o.result != null ? o.result : null,
    ts: { created: new Date().toISOString(), started, cancelRequested: o.cancelRequested || null, done: o.done || null },
  };
}

function writeRegistry(root, tasks, seq) {
  fs.writeFileSync(path.join(root, '.ctoc', 'state', 'tasks.json'),
    JSON.stringify({ version: 1, generation: 0, seq: seq != null ? seq : tasks.length, tasks }, null, 2));
}

/** Rewire the git-spawning verify seam for one test, restore after. */
function withVerify(stub, body) {
  const orig = staleDetector.verifyStaleCandidate;
  staleDetector.verifyStaleCandidate = stub;
  try { return body(); } finally { staleDetector.verifyStaleCandidate = orig; }
}

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('invalid plan reference — traversal + unknown-stage refusal', () => {
  // The plan-menu screens these tests used to call (planActions / planActionsMore /
  // reviewActions) are gone — opening a plan is a question now. The REFUSAL contract
  // they guarded is unchanged and is re-asserted here through the real `plan` route,
  // which is how a human actually reaches it. Driving the route instead of the
  // deleted function is strictly closer to the human's path, not further from it.
  test('plan_route_with_unknown_stage_returns_refusal_screen_not_a_crash', () => {
    const root = mkProject();
    const r = menu.route(['plan', 'nonsense-stage/x.md'], root);
    assert.match(r.text, /Invalid plan reference: nonsense-stage\/x\.md/);
    assert.deepEqual(r.actions, { '◀ Back': '' });
  });

  test('plan_route_with_traversal_filename_is_refused_before_path_join', () => {
    const root = mkProject();
    const r = menu.route(['plan', 'functional/../../etc/passwd'], root);
    assert.match(r.text, /Invalid plan reference/);
    assert.match(r.text, /escapes the plans\/ directory/);
  });

  test('plan_route_and_validateScreen_refuse_traversal', () => {
    const root = mkProject();
    assert.match(menu.route(['plan', 'functional/a/b.md'], root).text, /Invalid plan reference/);
    assert.match(menu.route(['plan', 'review/..'], root).text, /Invalid plan reference/);
    assert.match(menu.validateScreen('functional', 'sub\\dir.md', root).text, /Invalid plan reference/);
  });

  test('validateScreen_with_unknown_stage_is_refused', () => {
    const root = mkProject();
    assert.match(menu.validateScreen('made-up', 'p.md', root).text, /Invalid plan reference/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('getVersion — VERSION-read failure falls back to ?.?.?', () => {
  test('getVersion_returns_placeholder_when_the_version_file_read_throws', () => {
    const orig = safeFs.readFileSync;
    safeFs.readFileSync = (p, enc) => {
      if (String(p).endsWith('VERSION')) throw new Error('boom');
      return orig(p, enc);
    };
    try {
      assert.equal(menu.getVersion('/whatever'), '?.?.?');
    } finally {
      safeFs.readFileSync = orig;
    }
  });

  test('getVersion_reads_the_real_version_when_the_file_is_present', () => {
    // The other operand of the ||-free path: a successful read is trimmed and not '?.?.?'.
    const v = menu.getVersion('/whatever');
    assert.notEqual(v, '?.?.?');
    assert.equal(v, v.trim());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('buildDashboardTable — inbox count wiring (each count names its door)', () => {
  test('populated_inbox_renders_every_count_with_its_view_door_and_no_inbox_clear', () => {
    const root = mkProject();
    writeQuestion(root, 'q1', { source_plan: 'p' });
    writeDecision(root, 'd1', { plan: 'p' });
    writePlan(root, 'functional', 'gate-plan'); // a plan at Gate 1
    const out = menu.buildDashboardTable(root);

    assert.doesNotMatch(out, /Inbox clear/, 'a populated inbox is not "clear"');
    assert.match(out, /1 morning question · view: inbox questions/);
    assert.match(out, /1 decision awaiting review · view: inbox decisions/);
    assert.match(out, /1 plan at gates · view: inbox gates/);
  });

  test('escalations_and_deploy_ready_counts_each_render_their_own_door_line', () => {
    const root = mkProject();
    writeEscalations(root, [{ type: 'same-step', plan: 'px', step: 14, count: 4, at: iso(0) }]);
    writeDeployReady(root, [{ plan: 'py', at: iso(0), message: 'ready' }]);
    const out = menu.buildDashboardTable(root);

    assert.match(out, /1 circuit-breaker escalation .* view: inbox escalations/);

    // INVERTED (was `/1 plan deploy-ready .* view: inbox escalations/`). That
    // assertion pinned the DEFECT as the contract: "deploy-ready" is the pipeline's
    // own vocabulary, and the line it guarded also read "deploy is a separate ship
    // gate". The contract is the rule, not the old string — a screen says what the
    // MOMENT IS, in plain words, never its number and never a stage-directory name.
    // The count must still name its door (a count with no door is the original bug),
    // so BOTH halves are asserted: the door survives, the jargon cannot come back.
    const deployLine = out.split('\n').find((l) => /deploy/i.test(l));
    assert.ok(deployLine, `expected a deploy count line on the dashboard:\n${out}`);
    assert.match(deployLine, /view: inbox escalations/, `the count must still name its door: ${deployLine}`);
    assert.match(deployLine, /still yours/, `the line must say whose decision deploying is: ${deployLine}`);
    assert.doesNotMatch(deployLine, /\bgates?\s*[0-9]/i, `a gate NUMBER reached a human: ${deployLine}`);
    assert.doesNotMatch(deployLine, /ship gate/i, `"ship gate" is jargon a reader cannot decode: ${deployLine}`);
    assert.doesNotMatch(
      deployLine, /\b(functional|implementation|todo|in-progress)\b/i,
      `a raw stage-directory name reached a human: ${deployLine}`
    );
  });

  test('possibly_stale_count_appears_only_for_an_actionable_candidate', () => {
    const root = mkProject();
    writeStalePlan(root, 'review', 'impl-stale'); // missing-files at a POST-BUILD stage ⇒ actionable
    const out = menu.buildDashboardTable(root);
    assert.match(out, /1 possibly-stale plan/);
  });

  test('not_started_functional_missing_files_does_not_inflate_the_stale_nag', () => {
    const root = mkProject();
    // functional is a NOT_STARTED stage: unbuilt declared files are benign, so the
    // actionable-stale COUNT stays 0 even though the cheap scan emits a candidate.
    writeStalePlan(root, 'functional', 'func-unbuilt');
    const out = menu.buildDashboardTable(root);
    assert.doesNotMatch(out, /possibly-stale plan/);
  });

  test('done_background_task_prints_the_inbox_pull_line_instead_of_inbox_clear', () => {
    const root = mkProject();
    writeRegistry(root, [makeTask('t1', { kind: 'review', status: 'done' })]);
    const out = menu.buildDashboardTable(root);
    assert.doesNotMatch(out, /Inbox clear/);
    assert.match(out, /background task.*done — awaiting review/);
  });

  test('running_implement_task_renders_the_active_agent_line', () => {
    const root = mkProject();
    writeRegistry(root, [makeTask('t1', { kind: 'implement', status: 'running', plan: 'live-plan', touches: ['a.js'] })]);
    const out = menu.buildDashboardTable(root);
    assert.match(out, /● Active: live-plan/);
  });

  test('empty_project_reports_idle_agent_and_inbox_clear', () => {
    const root = mkProject();
    const out = menu.buildDashboardTable(root);
    assert.match(out, /○ Idle/);
    assert.match(out, /Inbox clear/);
  });

  test('a_stale_running_task_with_no_live_agent_surfaces_the_orphaned_offer_line', () => {
    const root = mkProject();
    // kind 'plan' (30-min floor) started 3h ago, liveAgentIds absent → staleness backstop
    // orphans it on reconcile; the dashboard surfaces the singular re-run offer.
    writeRegistry(root, [makeTask('t1', { kind: 'plan', status: 'running', plan: 'p', startedAgo: 3 * 3600 * 1000 })]);
    const out = menu.buildDashboardTable(root);
    assert.match(out, /1 task orphaned — offer re-run/);
  });

  test('corrupt_deploy_ready_log_does_not_crash_the_dashboard', () => {
    const root = mkProject();
    writeDeployReady(root, '{ this is not json');
    const out = menu.buildDashboardTable(root); // readDeployReady catch → [] → no crash
    assert.match(out, /INBOX/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('dashboardPipeline — stale ride-along question', () => {
  test('actionable_stale_adds_a_second_question_routing_to_the_stale_door', () => {
    const root = mkProject();
    writeStalePlan(root, 'review', 's1');
    const r = menu.dashboardPipeline(root);

    assert.equal(r.ask.questions.length, 2, 'stale ride-along is a SECOND question');
    assert.equal(r.actions['View stale plans'], 'inbox stale');
    assert.equal(r.actions["Don't ask again for these"], 'claude:dismiss-stale');
    assert.equal(r.actions['Not now'], '');
  });

  test('no_stale_means_no_ride_along_question', () => {
    const root = mkProject();
    const r = menu.dashboardPipeline(root);
    assert.equal(r.ask.questions.length, 1);
    assert.equal(r.actions['View stale plans'], undefined);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('dashboardCommands — background-task ride-along + agent label toggle', () => {
  test('registry_with_tasks_adds_the_board_ride_along_question', () => {
    const root = mkProject();
    writeRegistry(root, [makeTask('t1', { kind: 'review', status: 'queued' })]);
    const r = menu.dashboardCommands(root);
    assert.equal(r.actions['View board ▸'], 'tasks');
    assert.equal(r.actions['Not now'], '');
  });

  test('empty_registry_omits_the_board_ride_along', () => {
    const root = mkProject();
    const r = menu.dashboardCommands(root);
    assert.equal(r.actions['View board ▸'], undefined);
    assert.equal(r.ask.questions.length, 1);
  });

  test('running_implement_task_flips_start_agent_label_to_stop_agent', () => {
    const root = mkProject();
    writeRegistry(root, [makeTask('t1', { kind: 'implement', status: 'running', plan: 'p', touches: ['a.js'] })]);
    const r = menu.dashboardCommands(root);
    assert.equal(r.actions['Stop agent'], 'claude:stop-agent');
    assert.equal(r.actions['Start agent'], undefined);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('sectionBrowse — unknown section + per-stage counts', () => {
  test('unknown_section_returns_error_screen', () => {
    const root = mkProject();
    const r = menu.sectionBrowse('not-a-section', root);
    assert.match(r.text, /Unknown section: not-a-section/);
    assert.equal(r.actions.Back, '');
  });

  test('execution_section_counts_in_progress_review_done_stages', () => {
    const root = mkProject();
    writePlan(root, 'in-progress', 'ip1');
    writePlan(root, 'review', 'rv1');
    writePlan(root, 'done', 'dn1');
    writePlan(root, 'done', 'dn2');
    const r = menu.sectionBrowse('execution', root);
    assert.match(r.text, /In progress\s+1/);
    assert.match(r.text, /Review\s+1/);
    assert.match(r.text, /Done\s+2/);
  });

  test('implementation_section_counts_implementation_and_todo_stages', () => {
    const root = mkProject();
    writePlan(root, 'implementation', 'i1');
    writePlan(root, 'todo', 't1');
    writePlan(root, 'todo', 't2');
    const r = menu.sectionBrowse('implementation', root);
    assert.match(r.text, /Implementation\s+1/);
    assert.match(r.text, /Todo\s+2/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('inbox door screens — aggregation, age, capping, sanitization', () => {
  test('morning_questions_door_formats_age_buckets_minutes_hours_days', () => {
    const root = mkProject();
    writeQuestion(root, 'qm', { source_plan: 'pm', created: iso(30 * 60 * 1000) });   // ~30m
    writeQuestion(root, 'qh', { source_plan: 'ph', created: iso(3 * 3600 * 1000) });  // ~3h
    writeQuestion(root, 'qd', { source_plan: 'pd', created: iso(3 * 86400 * 1000) }); // ~3d
    writeQuestion(root, 'qf', { source_plan: 'pf', created: iso(-3600 * 1000) });     // future → no age
    writeQuestion(root, 'qx', { source_plan: 'px', created: 'not-a-timestamp' });     // unparseable → no age

    const r = menu.route(['inbox', 'questions'], root);
    assert.match(r.text, /Inbox ▸ Morning questions \(5\)/);
    assert.match(r.text, /\d+m ago/);
    assert.match(r.text, /\d+h ago/);
    assert.match(r.text, /\d+d ago/);
  });

  test('morning_questions_door_caps_at_20_rows_with_and_N_more', () => {
    const root = mkProject();
    for (let i = 0; i < 21; i++) writeQuestion(root, `q${i}`, { source_plan: `p${i}` });
    const r = menu.route(['inbox', 'questions'], root);
    assert.match(r.text, /Inbox ▸ Morning questions \(21\)/, 'header shows the TRUE total');
    assert.match(r.text, /… and 1 more/, '21 - 20 cap = 1 more');
  });

  test('empty_questions_door_shows_the_empty_message', () => {
    const root = mkProject();
    const r = menu.route(['inbox', 'questions'], root);
    assert.match(r.text, /No morning questions\./);
  });

  test('decisions_door_strips_control_chars_from_the_agent_written_ambiguity', () => {
    const root = mkProject();
    // A forged ESC + BEL + C1 CSI in an agent-written field must NEVER reach the terminal.
    writeDecision(root, 'd1', { plan: 'pd', ambiguity: 'safe\x1b[2Jclear\x07\x9b' });
    const r = menu.route(['inbox', 'decisions'], root);
    assert.match(r.text, /safe\[2Jclear/, 'the printable text survives');
    assert.doesNotMatch(r.text, /\x1b/, 'ESC is stripped');
    assert.doesNotMatch(r.text, /\x07/, 'BEL is stripped');
    assert.doesNotMatch(r.text, /\x9b/, 'C1 CSI is stripped');
  });

  test('plans_at_gates_door_lists_each_source_stage_with_its_gate_number', () => {
    const root = mkProject();
    writePlan(root, 'functional', 'f1');
    writePlan(root, 'implementation', 'i1');
    writePlan(root, 'review', 'r1');
    const r = menu.route(['inbox', 'gates'], root);
    assert.match(r.text, /f1\s+\[functional\]\s+Gate 1\s+plans\/functional\/f1\.md/);
    assert.match(r.text, /i1\s+\[implementation\]\s+Gate 2\s+plans\/implementation\/i1\.md/);
    assert.match(r.text, /r1\s+\[review\]\s+Gate 3\s+plans\/review\/r1\.md/);
  });

  test('empty_gates_door_shows_the_empty_message', () => {
    const root = mkProject();
    assert.match(menu.route(['inbox', 'gates'], root).text, /No plans at gates\./);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('inbox escalations & deploy-ready door', () => {
  test('empty_escalations_and_deploys_show_the_no_escalations_message', () => {
    const root = mkProject();
    const r = menu.route(['inbox', 'escalations'], root);
    assert.match(r.text, /No circuit-breaker escalations\./);
  });

  test('same_step_and_per_plan_escalations_render_their_distinct_detail_formats', () => {
    const root = mkProject();
    writeEscalations(root, [
      { type: 'same-step', plan: 'alpha', step: 14, count: 4, at: iso(3600 * 1000) },
      { type: 'per-plan', plan: 'beta', total: 6, at: iso(3600 * 1000) },
    ]);
    const r = menu.route(['inbox', 'escalations'], root);
    assert.match(r.text, /Circuit-breaker escalations \(2\)/);
    assert.match(r.text, /alpha\s+Step 14 kicked back 4× \(max 3\)/);
    assert.match(r.text, /beta\s+6 kickbacks total \(max 5\)/);
  });

  test('over_20_escalations_are_capped_with_and_N_more', () => {
    const root = mkProject();
    const many = [];
    for (let i = 0; i < 21; i++) many.push({ type: 'per-plan', plan: `p${i}`, total: 6, at: iso(0) });
    writeEscalations(root, many);
    const r = menu.route(['inbox', 'escalations'], root);
    assert.match(r.text, /Circuit-breaker escalations \(21\)/);
    assert.match(r.text, /… and 1 more/);
  });

  test('deploy_ready_notices_render_their_own_section_and_cap', () => {
    const root = mkProject();
    const many = [];
    for (let i = 0; i < 21; i++) many.push({ plan: `d${i}`, at: iso(0), message: 'm' });
    writeDeployReady(root, many);
    const r = menu.route(['inbox', 'escalations'], root);
    // INVERTED (was `/Deploy-ready \(21\)/`). What this case exists to prove is the
    // SECTION + the CAP, not the heading's exact words; pinning the heading made a
    // copy edit look like a behaviour change while letting the jargon stand. The
    // count is asserted on the section line itself, which must carry no gate number
    // and no stage name.
    const section = r.text.split('\n').find((l) => /^ {2}\S/.test(l) && /deploy/i.test(l) && /\(21\)/.test(l));
    assert.ok(section, `expected the deploy-ready section line with its count:\n${r.text}`);
    assert.doesNotMatch(section, /\bgates?\s*[0-9]/i, `a gate NUMBER reached a human: ${section}`);
    assert.doesNotMatch(
      section, /\b(functional|implementation|todo|in-progress)\b/i,
      `a raw stage-directory name reached a human: ${section}`
    );
    assert.match(r.text, /… and 1 more/);
  });

  test('non_array_deploy_ready_json_is_treated_as_no_notices', () => {
    const root = mkProject();
    writeDeployReady(root, '{}'); // parses, not an array → readDeployReady returns []
    const r = menu.route(['inbox', 'escalations'], root);

    // WAS VACUOUS: `assert.doesNotMatch(r.text, /Deploy-ready/)`. Once the section
    // heading was re-worded, "Deploy-ready" existed nowhere in the codebase, so the
    // assertion could never fail — it looked like proof while proving nothing. That
    // is the same defect as a search whose output was truncated: a verdict reported
    // on input never received. The dead pattern is kept HERE, in a comment, so
    // nobody re-adopts it as a live assertion.
    //
    // The real property: a non-array log yields ZERO notices, so the notice SECTION
    // must not render at all. Asserted positively (the empty-state message is the
    // one thing that must be there) and negatively against the CURRENT heading,
    // which does exist and therefore can actually fail.
    assert.match(r.text, /No circuit-breaker escalations/, `the door must still render its empty state:\n${r.text}`);
    assert.doesNotMatch(r.text, /Waiting to be deployed/, `a non-array log must render NO deploy section:\n${r.text}`);
    assert.doesNotMatch(r.text, /^ {2}\S.*\(\d+\).*deploy/im, `no deploy section line may render:\n${r.text}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('inbox stale drill-in', () => {
  test('candidates_render_actionable_advisory_labels_and_a_verify_affordance', () => {
    const root = mkProject();
    writeStalePlan(root, 'implementation', 'sA'); // missing-files → actionable
    const r = menu.route(['inbox', 'stale'], root);
    assert.match(r.text, /Inbox ▸ Possibly-stale plans \(1\)/);
    assert.match(r.text, /sA\s+\[implementation\].*— actionable/);
    assert.equal(r.actions.Verify, 'inbox verify');
    assert.equal(r.actions["Don't ask again for these"], 'claude:dismiss-stale');
  });

  test('empty_stale_list_offers_only_back', () => {
    const root = mkProject();
    const r = menu.route(['inbox', 'stale'], root);
    assert.match(r.text, /No possibly-stale plans\./);
    assert.deepEqual(Object.keys(r.actions), ['◀ Back']);
  });

  test('over_20_stale_candidates_are_capped_with_and_N_more', () => {
    const root = mkProject();
    for (let i = 0; i < 21; i++) writeStalePlan(root, 'implementation', `s${String(i).padStart(2, '0')}`);
    const r = menu.route(['inbox', 'stale'], root);
    assert.match(r.text, /Inbox ▸ Possibly-stale plans \(21\)/);
    assert.match(r.text, /… and 1 more/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('inbox verified proposals (git seam stubbed)', () => {
  function doaEvidence() {
    return {
      gitAvailable: true, error: null, approvedBy: null,
      declaredFiles: ['x.js'], allFilesExist: false, anyFileMissing: true,
      stageEntryEpoch: 1, filesLastModifiedEpoch: null, filesModifiedAfterEntry: false,
      slugMatchCommits: [], slugMatchAfterEntry: false, explicitlyRejected: false,
    };
  }

  test('dead_on_arrival_proposals_group_and_surface_the_cleanup_entry', () => {
    const root = mkProject();
    writeStalePlan(root, 'review', 'doa1');
    withVerify(() => doaEvidence(), () => {
      const r = menu.route(['inbox', 'verify'], root);
      assert.match(r.text, /dead-on-arrival \(1\)/);
      assert.match(r.text, /doa1 → revert/);
      assert.equal(r.actions['Clean up ▸'], 'inbox cleanup');
    });
  });

  test('no_candidates_yields_no_proposals_and_no_cleanup_entry', () => {
    const root = mkProject();
    const r = menu.route(['inbox', 'verify'], root);
    assert.match(r.text, /No proposals\./);
    assert.equal(r.actions['Clean up ▸'], undefined);
  });

  test('a_throwing_verify_degrades_that_row_to_inconclusive_not_a_screen_crash', () => {
    const root = mkProject();
    writeStalePlan(root, 'implementation', 'boom');
    withVerify(() => { throw new Error('git exploded'); }, () => {
      const r = menu.route(['inbox', 'verify'], root);
      assert.match(r.text, /inconclusive \(1\)/);
      assert.match(r.text, /boom → none.*verification error — skipped/);
      assert.equal(r.actions['Clean up ▸'], undefined, 'inconclusive is not actionable');
    });
  });

  test('overflow_beyond_the_fan_out_cap_is_reported_as_and_N_more', () => {
    const root = mkProject();
    for (let i = 0; i < 21; i++) writeStalePlan(root, 'implementation', `v${String(i).padStart(2, '0')}`);
    withVerify(() => doaEvidence(), () => {
      const r = menu.route(['inbox', 'verify'], root);
      assert.match(r.text, /… and 1 more/, 'candidates beyond the 20 fan-out cap');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('inbox cleanup review + category + confirm + per-plan + override', () => {
  const evidenceFor = {
    'dead-on-arrival': () => ({
      gitAvailable: true, error: null, approvedBy: null, declaredFiles: ['x.js'],
      allFilesExist: false, anyFileMissing: true, stageEntryEpoch: 1,
      filesLastModifiedEpoch: null, filesModifiedAfterEntry: false,
      slugMatchCommits: [], slugMatchAfterEntry: false, explicitlyRejected: false,
    }),
    'dead-on-arrival-rejected': () => ({
      gitAvailable: true, error: null, approvedBy: null, declaredFiles: ['x.js'],
      allFilesExist: false, anyFileMissing: true, stageEntryEpoch: 1,
      filesLastModifiedEpoch: null, filesModifiedAfterEntry: false,
      slugMatchCommits: [], slugMatchAfterEntry: false, explicitlyRejected: true,
    }),
    'approved-but-stranded': () => ({
      gitAvailable: true, error: null, approvedBy: 'human', declaredFiles: ['x.js'],
      allFilesExist: true, anyFileMissing: false, stageEntryEpoch: 1,
      filesLastModifiedEpoch: 2, filesModifiedAfterEntry: true,
      slugMatchCommits: [], slugMatchAfterEntry: false, explicitlyRejected: false,
    }),
  };

  test('cleanup_review_groups_actionable_proposals_with_their_verb', () => {
    const root = mkProject();
    writeStalePlan(root, 'review', 'doaX');
    withVerify(() => evidenceFor['dead-on-arrival'](), () => {
      const r = menu.route(['inbox', 'cleanup'], root);
      assert.match(r.text, /Inbox ▸ Clean up \(1\)/);
      assert.match(r.text, /dead-on-arrival \(1\)/);
      assert.match(r.text, /doaX → revert/);
      assert.equal(r.actions['Approve a category ▸'], 'inbox cleanup category');
      assert.equal(r.actions['Review individually ▸'], 'inbox cleanup plan');
    });
  });

  test('cleanup_review_with_only_inconclusive_shows_no_actionable_proposals', () => {
    const root = mkProject();
    writeStalePlan(root, 'implementation', 'inc');
    withVerify(() => ({ gitAvailable: false, error: 'no git' }), () => {
      const r = menu.route(['inbox', 'cleanup'], root);
      assert.match(r.text, /No actionable proposals\./);
      assert.equal(r.actions['Approve a category ▸'], undefined);
    });
  });

  test('cleanup_build_degrades_a_throwing_verify_row_to_inconclusive', () => {
    const root = mkProject();
    // A per-candidate verify throw inside _buildCleanupItems must degrade that one
    // row (inconclusive, non-actionable), never crash the cleanup screen.
    writeStalePlan(root, 'implementation', 'cboom');
    withVerify(() => { throw new Error('git died'); }, () => {
      const r = menu.route(['inbox', 'cleanup'], root);
      assert.match(r.text, /No actionable proposals\./, 'a degraded row is inconclusive, not actionable');
    });
  });

  test('category_pick_lists_present_actionable_categories_with_confirm_routes', () => {
    const root = mkProject();
    writeStalePlan(root, 'review', 'doaY');
    withVerify(() => evidenceFor['dead-on-arrival'](), () => {
      const r = menu.route(['inbox', 'cleanup', 'category'], root);
      assert.match(r.text, /Approve a category/);
      assert.equal(r.actions['dead-on-arrival (1) ▸'], 'inbox cleanup confirm dead-on-arrival');
    });
  });

  test('category_confirm_names_the_batch_and_maps_to_the_exec_string', () => {
    const root = mkProject();
    writeStalePlan(root, 'review', 'doaZ');
    withVerify(() => evidenceFor['dead-on-arrival'](), () => {
      const r = menu.route(['inbox', 'cleanup', 'confirm', 'dead-on-arrival'], root);
      assert.match(r.text, /revert 1 dead-on-arrival plan\(s\)/);
      assert.match(r.text, /doaZ/);
      const confirmKey = 'Confirm: revert 1 dead-on-arrival plans';
      assert.equal(r.actions[confirmKey], 'claude:cleanup-exec category dead-on-arrival');
    });
  });

  test('category_confirm_with_an_invalid_category_falls_back_to_review', () => {
    const root = mkProject();
    const r = menu.route(['inbox', 'cleanup', 'confirm', 'bogus-category'], root);
    assert.match(r.text, /Inbox ▸ Clean up \(0\)/); // inboxCleanupReview safe default
  });

  test('per_plan_review_without_slug_lists_actionable_plans', () => {
    const root = mkProject();
    writeStalePlan(root, 'review', 'pickme');
    withVerify(() => evidenceFor['dead-on-arrival'](), () => {
      const r = menu.route(['inbox', 'cleanup', 'plan'], root);
      assert.match(r.text, /Review individually/);
      assert.equal(r.actions['pickme'], 'inbox cleanup plan pickme');
    });
  });

  test('per_plan_review_with_a_slug_offers_approve_override_skip_with_the_exec_action', () => {
    const root = mkProject();
    writeStalePlan(root, 'review', 'onep');
    withVerify(() => evidenceFor['dead-on-arrival'](), () => {
      const r = menu.route(['inbox', 'cleanup', 'plan', 'onep'], root);
      assert.equal(r.actions.Approve, 'claude:cleanup-exec plan onep revert');
      assert.equal(r.actions['Override ▸'], 'inbox cleanup override onep');
      assert.equal(r.actions.Skip, 'inbox cleanup');
    });
  });

  test('per_plan_review_with_an_unknown_slug_falls_back_to_review', () => {
    const root = mkProject();
    writeStalePlan(root, 'review', 'realp');
    withVerify(() => evidenceFor['dead-on-arrival'](), () => {
      const r = menu.route(['inbox', 'cleanup', 'plan', 'ghost'], root);
      assert.match(r.text, /Inbox ▸ Clean up \(1\)/); // review default, not a per-plan screen
      assert.equal(r.actions.Approve, undefined);
    });
  });

  test('override_for_a_non_rejected_doa_offers_archive_but_not_delete', () => {
    const root = mkProject();
    writeStalePlan(root, 'review', 'doaov');
    withVerify(() => evidenceFor['dead-on-arrival'](), () => {
      const r = menu.route(['inbox', 'cleanup', 'override', 'doaov'], root);
      assert.equal(r.actions['Archive to done instead'], 'claude:cleanup-exec plan doaov archive-to-done');
      assert.equal(r.actions['Delete permanently'], undefined, 'delete only for an explicitly-rejected DOA');
    });
  });

  test('override_for_an_explicitly_rejected_doa_offers_the_irreversible_delete', () => {
    const root = mkProject();
    writeStalePlan(root, 'implementation', 'doadel');
    withVerify(() => evidenceFor['dead-on-arrival-rejected'](), () => {
      const r = menu.route(['inbox', 'cleanup', 'override', 'doadel'], root);
      assert.equal(r.actions['Delete permanently'], 'claude:cleanup-exec plan doadel delete');
    });
  });

  test('override_for_a_non_doa_category_offers_revert_instead', () => {
    const root = mkProject();
    writeStalePlan(root, 'implementation', 'strand');
    withVerify(() => evidenceFor['approved-but-stranded'](), () => {
      const r = menu.route(['inbox', 'cleanup', 'override', 'strand'], root);
      assert.equal(r.actions['Revert instead'], 'claude:cleanup-exec plan strand revert');
      assert.equal(r.actions['Archive to done instead'], undefined);
    });
  });

  test('override_with_an_unknown_slug_falls_back_to_review', () => {
    const root = mkProject();
    const r = menu.route(['inbox', 'cleanup', 'override', 'nobody'], root);
    assert.match(r.text, /Inbox ▸ Clean up \(0\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('vision stubs browse', () => {
  test('decomposed_vision_renders_a_numbered_stub_table', () => {
    const root = mkProject();
    writePlan(root, 'functional', 'stub-one',
      `---\ntitle: One\ntype: functional\nparent_vision: myvision\ndepends_on: none\n---\n\n# One\n\n## Problem Statement\nBuild the thing.\n`);
    const r = menu.route(['stubs', 'myvision'], root);
    assert.match(r.text, /\[Vision Decomposition\] myvision/);
    assert.match(r.text, /decomposed into 1 functional plans/);
    assert.match(r.text, /stub-one/);
    assert.equal(r.actions['Looks good -- refine all'], 'claude:approve-stubs myvision');
  });

  test('vision_with_no_stubs_shows_the_empty_message', () => {
    const root = mkProject();
    const r = menu.route(['stubs', 'emptyvision'], root);
    assert.match(r.text, /No stubs created yet\./);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('stageBrowse — implementation bulk word shortcuts', () => {
  test('implementation_stage_registers_both_discuss_and_todo_all_word_keys', () => {
    const root = mkProject();
    writePlan(root, 'implementation', 'impl-a');
    const r = menu.stageBrowse('implementation', root);
    assert.equal(r.actions.discuss, 'claude:discuss-all implementation');
    assert.equal(r.actions['todo-all'], 'claude:advance-all-implementation');
    assert.match(r.text, /todo-all = move all to todo/);
  });

  test('functional_stage_registers_discuss_but_not_todo_all', () => {
    const root = mkProject();
    writePlan(root, 'functional', 'f-a');
    const r = menu.stageBrowse('functional', root);
    assert.equal(r.actions.discuss, 'claude:discuss-all functional');
    assert.equal(r.actions['todo-all'], undefined, 'todo-all is implementation-only');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('task command state machine — add', () => {
  test('add_a_review_task_queues_it_and_reports_a_run_decision', () => {
    const root = mkProject();
    const r = menu.route(['menu', 'task', 'add', 'review'], root);
    assert.equal(r.ok, true);
    assert.equal(r.status, 'queued');
    assert.equal(r.decision, 'run', 'an empty registry has a free slot');
    assert.match(r.taskId, /^t\d+$/);
  });

  test('add_a_duplicate_implement_task_returns_the_existing_one_without_writing', () => {
    const root = mkProject();
    writeRegistry(root, [makeTask('t1', { kind: 'implement', status: 'running', plan: 'dupe', touches: ['a.js'] })], 1);
    const r = menu.route(['menu', 'task', 'add', 'implement', 'dupe', '--touches', 'b.js'], root);
    assert.equal(r.existing, true);
    assert.equal(r.taskId, 't1');
    assert.match(r.text, /already covers plan dupe/);
  });

  test('add_an_implement_task_with_no_touches_is_refused_loudly', () => {
    const root = mkProject();
    const r = menu.route(['menu', 'task', 'add', 'implement', 'nofiles'], root);
    assert.equal(r.ok, false);
    assert.match(r.error, /non-empty touches/);
  });

  test('add_decodes_a_b64_payload_and_lets_it_drive_kind_and_plan', () => {
    const root = mkProject();
    const b64 = Buffer.from(JSON.stringify({ kind: 'review', plan: 'zeta', label: 'L' })).toString('base64');
    const r = menu.route(['menu', 'task', 'add', 'ignored-positional', '--b64', b64], root);
    assert.equal(r.ok, true);
    assert.match(r.text, /zeta/, 'the b64 plan overrides the positional kind path');
  });

  test('add_ignores_an_oversized_b64_payload_and_uses_the_positional_kind', () => {
    const root = mkProject();
    const huge = 'A'.repeat(65537); // exceeds the 65536 decode bound → decodeB64 returns null
    const r = menu.route(['menu', 'task', 'add', 'review', '--b64', huge], root);
    assert.equal(r.ok, true);
    assert.match(r.text, /\(review/, 'falls back to the positional kind');
  });

  test('add_ignores_a_non_json_b64_payload', () => {
    const root = mkProject();
    const r = menu.route(['menu', 'task', 'add', 'plan', '--b64', '@@@not-base64-json@@@'], root);
    assert.equal(r.ok, true);
    assert.match(r.text, /\(plan/);
  });

  test('add_a_sync_task_requires_and_accepts_a_blockedBy_list', () => {
    const root = mkProject();
    writeRegistry(root, [makeTask('t1', { kind: 'review', status: 'done' })], 1);
    const r = menu.route(['menu', 'task', 'add', 'sync', '--blocked', 't1'], root);
    assert.equal(r.ok, true);
    assert.equal(r.status, 'queued');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('task command state machine — start / fail / cancel', () => {
  test('start_a_queued_task_when_a_slot_is_free_moves_it_to_running', () => {
    const root = mkProject();
    writeRegistry(root, [makeTask('t1', { kind: 'review', status: 'queued' })], 1);
    const r = menu.route(['menu', 'task', 'start', 't1'], root);
    assert.equal(r.ok, true);
    assert.equal(r.status, 'running');
  });

  test('start_is_refused_when_the_concurrency_ladder_says_no', () => {
    const root = mkProject();
    const tasks = [];
    for (let i = 1; i <= 5; i++) tasks.push(makeTask(`t${i}`, { kind: 'review', status: 'running' }));
    tasks.push(makeTask('t6', { kind: 'review', status: 'queued' }));
    writeRegistry(root, tasks, 6);
    const r = menu.route(['menu', 'task', 'start', 't6'], root);
    assert.equal(r.ok, false);
    assert.equal(r.refused, true);
    assert.equal(r.reason, 'max-concurrent');
  });

  test('start_force_overrides_a_ladder_refusal_and_shouts_it', () => {
    const root = mkProject();
    const tasks = [];
    for (let i = 1; i <= 5; i++) tasks.push(makeTask(`t${i}`, { kind: 'review', status: 'running' }));
    tasks.push(makeTask('t6', { kind: 'review', status: 'queued' }));
    writeRegistry(root, tasks, 6);
    const r = menu.route(['menu', 'task', 'start', 't6', '--force'], root);
    assert.equal(r.ok, true);
    assert.equal(r.forced, true);
    assert.equal(r.status, 'running');
    assert.match(r.text, /FORCED past the scheduler/);
  });

  test('start_on_a_terminal_task_is_an_invalid_transition', () => {
    const root = mkProject();
    writeRegistry(root, [makeTask('t1', { kind: 'review', status: 'done' })], 1);
    const r = menu.route(['menu', 'task', 'start', 't1'], root);
    assert.equal(r.ok, false);
    assert.match(r.error, /invalid transition done → running/);
  });

  test('start_on_an_unknown_id_fails_soft', () => {
    const root = mkProject();
    const r = menu.route(['menu', 'task', 'start', 'tX'], root);
    assert.equal(r.ok, false);
    assert.match(r.error, /unknown task id tX/);
  });

  test('fail_a_running_task_moves_it_to_failed_and_computes_a_promote_set', () => {
    const root = mkProject();
    writeRegistry(root, [makeTask('t1', { kind: 'review', status: 'running' })], 1);
    const r = menu.route(['menu', 'task', 'fail', 't1', '--summary', 'died'], root);
    assert.equal(r.status, 'failed');
    assert.ok(Array.isArray(r.promote));
  });

  test('freeing_a_slot_projects_the_newly_runnable_queued_task_into_promote', () => {
    const root = mkProject();
    // t1 running occupies a slot; t2 queued becomes runnable once t1 fails. computePromote
    // must project t2 with its scheduler inputs (id/kind/plan/touches/gitOp).
    writeRegistry(root, [
      makeTask('t1', { kind: 'review', status: 'running' }),
      makeTask('t2', { kind: 'implement', status: 'queued', plan: 'q-plan', touches: ['b.js'] }),
    ], 2);
    const r = menu.route(['menu', 'task', 'fail', 't1'], root);
    const promoted = r.promote.find(p => p.id === 't2');
    assert.ok(promoted, 't2 is projected as newly runnable');
    assert.equal(promoted.plan, 'q-plan');
    assert.deepEqual(promoted.touches, ['b.js']);
  });

  test('fail_on_a_terminal_task_is_an_invalid_transition', () => {
    const root = mkProject();
    writeRegistry(root, [makeTask('t1', { kind: 'review', status: 'done' })], 1);
    const r = menu.route(['menu', 'task', 'fail', 't1'], root);
    assert.equal(r.ok, false);
    assert.match(r.error, /invalid transition done → failed/);
  });

  test('cancel_a_running_task_enters_cancelling_and_keeps_its_files_locked', () => {
    const root = mkProject();
    writeRegistry(root, [makeTask('t1', { kind: 'review', status: 'running' })], 1);
    const r = menu.route(['menu', 'task', 'cancel', 't1'], root);
    assert.equal(r.status, 'cancelling');
    assert.match(r.text, /files stay locked until the agent is confirmed gone/);
  });

  test('cancel_a_queued_task_cancels_immediately', () => {
    const root = mkProject();
    writeRegistry(root, [makeTask('t1', { kind: 'review', status: 'queued' })], 1);
    const r = menu.route(['menu', 'task', 'cancel', 't1'], root);
    assert.equal(r.status, 'cancelled');
  });

  test('cancel_force_frees_a_running_task_immediately_and_shouts_it', () => {
    const root = mkProject();
    writeRegistry(root, [makeTask('t1', { kind: 'review', status: 'running' })], 1);
    const r = menu.route(['menu', 'task', 'cancel', 't1', '--force'], root);
    assert.equal(r.status, 'cancelled');
    assert.equal(r.forced, true);
    assert.match(r.text, /FORCED/);
  });

  test('cancel_a_terminal_task_is_an_invalid_transition', () => {
    const root = mkProject();
    writeRegistry(root, [makeTask('t1', { kind: 'review', status: 'done' })], 1);
    const r = menu.route(['menu', 'task', 'cancel', 't1'], root);
    assert.equal(r.ok, false);
    assert.match(r.error, /invalid transition done → cancelled/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('task command state machine — complete', () => {
  test('completing_a_non_implement_task_settles_it_done_with_a_promote_set', () => {
    const root = mkProject();
    writeRegistry(root, [makeTask('t1', { kind: 'review', status: 'running', plan: 'rev-target' })], 1);
    const r = menu.route(['menu', 'task', 'complete', 't1', '--summary', 'reviewed'], root);
    assert.equal(r.ok, true);
    assert.equal(r.status, 'done');
    assert.match(r.text, /Task t1 → done/);
    assert.ok(Array.isArray(r.promote));
  });

  test('completing_an_implement_task_whose_plan_file_is_absent_refuses_no_fake_evidence', () => {
    const root = mkProject();
    writeRegistry(root, [makeTask('t1', { kind: 'implement', status: 'running', plan: 'ghost-plan', touches: ['a.js'] })], 1);
    const r = menu.route(['menu', 'task', 'complete', 't1'], root);
    assert.equal(r.ok, false);
    assert.equal(r.blocked, true);
    assert.match(r.text, /NOT completed/);
    assert.match(r.error, /no evidence/);
  });

  test('complete_rejects_a_next_action_that_is_a_gate_crossing_claude_verb', () => {
    const root = mkProject();
    writeRegistry(root, [makeTask('t1', { kind: 'review', status: 'running', plan: 'p' })], 1);
    const r = menu.route(['menu', 'task', 'complete', 't1', '--next', 'claude:approve'], root);
    assert.equal(r.ok, false);
    assert.match(r.text, /nextAction must be a navigation route/);
  });

  test('complete_parses_a_gate_number_and_a_nav_next_action_into_the_result', () => {
    const root = mkProject();
    writeRegistry(root, [makeTask('t1', { kind: 'review', status: 'running', plan: 'p' })], 1);
    const r = menu.route(['menu', 'task', 'complete', 't1', '--gate', '3', '--next', 'browse review'], root);
    assert.equal(r.ok, true);
    assert.equal(r.status, 'done');
  });

  test('complete_on_a_queued_task_is_an_invalid_transition', () => {
    const root = mkProject();
    writeRegistry(root, [makeTask('t1', { kind: 'review', status: 'queued' })], 1);
    const r = menu.route(['menu', 'task', 'complete', 't1'], root);
    assert.equal(r.ok, false);
    assert.match(r.error, /invalid transition queued → done/);
  });

  test('complete_on_an_unknown_id_fails_soft', () => {
    const root = mkProject();
    const r = menu.route(['menu', 'task', 'complete', 'tZ'], root);
    assert.equal(r.ok, false);
    assert.match(r.error, /unknown task id tZ/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('task list / board / detail screens', () => {
  test('task_list_projects_every_task_to_id_kind_status_label_plan', () => {
    const root = mkProject();
    writeRegistry(root, [
      makeTask('t1', { kind: 'review', status: 'queued', plan: 'p1' }),
      makeTask('t2', { kind: 'implement', status: 'running', plan: 'p2', touches: ['a.js'] }),
    ], 2);
    const r = menu.route(['menu', 'task', 'list'], root);
    assert.equal(r.ok, true);
    assert.equal(r.tasks.length, 2);
    assert.deepEqual(r.tasks[0], { id: 't1', kind: 'review', status: 'queued', label: '', plan: 'p1' });
  });

  test('unknown_task_subcommand_fails_soft', () => {
    const root = mkProject();
    const r = menu.route(['menu', 'task', 'nope'], root);
    assert.equal(r.ok, false);
    assert.match(r.text, /Unknown task subcommand: nope/);
  });

  test('task_board_screen_lists_selectable_t_ids_grouped_by_status', () => {
    const root = mkProject();
    writeRegistry(root, [
      makeTask('t1', { kind: 'review', status: 'running' }),
      makeTask('t2', { kind: 'review', status: 'queued' }),
    ], 2);
    const r = menu.route(['tasks'], root);
    assert.equal(r.inputMode, 'task-select');
    assert.equal(r.actions.t1, 'task t1');
    assert.equal(r.actions.t2, 'task t2');
  });

  test('empty_task_board_shows_no_background_tasks', () => {
    const root = mkProject();
    const r = menu.route(['tasks'], root);
    assert.match(r.text, /No background tasks\./);
  });

  test('task_detail_for_a_known_id_shows_kind_plan_status', () => {
    const root = mkProject();
    writeRegistry(root, [makeTask('t1', { kind: 'implement', status: 'running', plan: 'detail-plan', touches: ['a.js'] })], 1);
    const r = menu.route(['task', 't1'], root);
    assert.match(r.text, /kind:\s+implement/);
    assert.match(r.text, /plan:\s+detail-plan/);
  });

  test('task_detail_for_an_unknown_id_shows_task_not_found', () => {
    const root = mkProject();
    const r = menu.route(['task', 'tNope'], root);
    assert.match(r.text, /Task not found: tNope/);
    assert.equal(r.actions['◀ Back'], 'tasks');
  });

  test('task_detail_drops_a_gate_crossing_next_action_but_keeps_a_nav_route', () => {
    const root = mkProject();
    writeRegistry(root, [
      makeTask('t1', { kind: 'review', status: 'done', plan: 'safe', result: { nextAction: 'browse review' } }),
      makeTask('t2', { kind: 'review', status: 'done', plan: 'evil', result: { nextAction: 'claude:approve review/x.md' } }),
    ], 2);
    const nav = menu.route(['task', 't1'], root);
    assert.ok(Object.values(nav.actions).includes('browse review'), 'nav route is offered');
    const bad = menu.route(['task', 't2'], root);
    assert.ok(!Object.values(bad.actions).some(v => String(v).startsWith('claude:')),
      'a claude: next-action is never emitted as a selectable action');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('router — every arm', () => {
  test('menu_task_dispatches_to_the_task_command', () => {
    const root = mkProject();
    const r = menu.route(['menu', 'task', 'list'], root);
    assert.equal(r.ok, true);
  });

  test('bare_menu_and_unknown_top_level_command_fall_back_to_the_pipeline_dashboard', () => {
    const root = mkProject();
    for (const args of [['menu'], ['totally-unknown']]) {
      const r = menu.route(args, root);
      assert.ok(r.ask.questions[0].options.some(o => o.label === 'Business'));
    }
  });

  // `plan` with no ref used to fall back to the DASHBOARD's section list. There is
  // no dashboard fallback any more: the menu was replaced by questions, so a bare
  // `plan` lands on the streaming question — and a malformed ref is now REFUSED
  // outright rather than silently swallowed into a navigation screen. Both are
  // tighter than the behaviour they replace: one asks, the other tells the truth.
  test('plan_route_without_a_ref_asks_a_question_instead_of_showing_a_dashboard', () => {
    const root = mkProject();
    const r = menu.route(['plan'], root);
    assert.ok(r.ask.questions[0].question.length > 0, 'a bare `plan` must still ASK something');
    assert.ok(
      !r.ask.questions[0].options.some(o => o.label === 'Business'),
      'the section-navigation dashboard must not be the fallback any more'
    );
  });

  test('plan_route_without_a_slash_is_refused_as_a_malformed_reference', () => {
    const root = mkProject();
    assert.match(menu.route(['plan', 'noslash'], root).text, /Invalid plan reference/);
  });

  test('plan_route_more_review_discuss_suffixes_no_longer_open_sub_menus', () => {
    const root = mkProject();
    writePlan(root, 'functional', 'pp');
    writePlan(root, 'review', 'rr');

    // The three sub-screens are gone. Their decisions live on the one plan screen,
    // so a stale suffix must degrade to that screen — never to a navigation list.
    for (const [ref, suffix] of [['functional/pp.md', 'more'], ['functional/pp.md', 'discuss'], ['review/rr.md', 'review']]) {
      const r = menu.route(['plan', ref, suffix], root);
      const labels = r.ask.questions.flatMap(q => q.options.map(o => o.label));
      assert.deepEqual(
        labels.filter(l => /Back to list|◀ Actions|Continue|Apply edits/.test(l)),
        [],
        `plan ${ref} ${suffix} must not resurrect a navigation sub-menu`
      );
      // The plan's real decisions are still all there, on the one screen.
      assert.ok(labels.includes('Discuss'), 'critique survives');
      assert.ok(labels.includes('Delete'), 'delete survives');
    }
  });

  test('validate_route_without_a_ref_or_without_a_slash_falls_back_to_the_dashboard', () => {
    const root = mkProject();
    assert.ok(menu.route(['validate'], root).ask.questions[0].options.some(o => o.label === 'Business'));
    assert.ok(menu.route(['validate', 'noslash'], root).ask.questions[0].options.some(o => o.label === 'Business'));
  });

  test('unknown_inbox_subcommand_falls_back_to_the_dashboard', () => {
    const root = mkProject();
    const r = menu.route(['inbox', 'nonsense'], root);
    assert.ok(r.ask.questions[0].options.some(o => o.label === 'Business'));
  });

  test('inbox_verify_and_stale_and_cleanup_bare_route_reach_their_screens', () => {
    const root = mkProject();
    assert.match(menu.route(['inbox', 'cleanup'], root).text, /Inbox ▸ Clean up/);
    assert.match(menu.route(['inbox', 'stale'], root).text, /Possibly-stale plans/);
  });

  test('section_route_dispatches_to_sectionBrowse', () => {
    const root = mkProject();
    writePlan(root, 'review', 'rv');
    const r = menu.route(['section', 'execution'], root);
    assert.match(r.text, /Execution section/);
    assert.match(r.text, /Review\s+1/);
  });
});
