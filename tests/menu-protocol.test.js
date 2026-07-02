/**
 * NB3 — Menu Protocol Rewrite (NAV vs WORK). Iron Loop Step 8 (TDD).
 *
 * Two suites, per plans/todo/NB3-menu-protocol-rewrite.md Step 7:
 *   • SPEC-A — doc-contract over src/commands/menu.md. Every assertion slices the
 *     section body from its OWN heading index (the SP2 H1 lesson: a lower-index
 *     prose match must never false-green a deleted section). String-anchored.
 *   • SPEC-B — behavioral over src/lib/menu-screens.js in isolated tmp roots
 *     (fs.mkdtempSync harness reused from menu-task-wiring.test.js). Exercises the
 *     `promote[]` fold on complete/fail/cancel and the dashboardCommands entry.
 *
 * Raw fs/os are permitted in tests/** (eslint exempts the fs rule there).
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ms = require('../src/lib/menu-screens');
const taskRegistry = require('../src/lib/task-registry');

// ═══════════════════════════════════════════════════════════════════════════
// SPEC-A — doc-contract over menu.md (string-anchored, own-heading sliced)
// ═══════════════════════════════════════════════════════════════════════════

function readMenuMd() {
  return fs.readFileSync(path.join(__dirname, '..', 'src', 'commands', 'menu.md'), 'utf8');
}

/**
 * Slice a section body from its OWN heading index to the next ##/### heading (or
 * EOF). Anchoring on the heading's index — not the first keyword match — is the
 * SP2 F1 lesson: a lower-index prose mention cannot satisfy a section assertion.
 */
function sectionBody(md, headingRe) {
  const m = headingRe.exec(md);
  assert.ok(m, `heading not found: ${headingRe}`);
  const bodyStart = m.index + m[0].length;
  const after = md.slice(bodyStart);
  const nm = /\n#{2,3} /.exec(after);
  const end = nm ? bodyStart + nm.index : md.length;
  return md.slice(m.index, end);
}

/** Slice a numbered-rule body from its own item to the next numbered item (or EOF). */
function ruleBody(md, ruleRe) {
  const m = ruleRe.exec(md);
  assert.ok(m, `rule not found: ${ruleRe}`);
  const bodyStart = m.index + m[0].length;
  const after = md.slice(bodyStart);
  const nm = /\n\d+\.\s/.exec(after);
  const end = nm ? bodyStart + nm.index : md.length;
  return md.slice(m.index, end);
}

describe('SPEC-A — Two-Plane Protocol section placement', () => {
  it('the section exists between the Claude Actions table and the Rules', () => {
    const md = readMenuMd();
    const iActions = md.indexOf('### Claude Actions');
    const iSection = md.indexOf('## Two-Plane Protocol — NAV vs WORK');
    const iRules = md.indexOf('### Rules');
    assert.ok(iActions >= 0, 'Claude Actions table present');
    assert.ok(iSection >= 0, 'Two-Plane Protocol section present');
    assert.ok(iRules >= 0, 'Rules section present');
    assert.ok(iActions < iSection && iSection < iRules, 'section sits after Claude Actions, before Rules');
  });

  it('all six subsections are present', () => {
    const md = readMenuMd();
    assert.match(md, /^### Classification — NAV vs WORK/m);
    assert.match(md, /^### WORK dispatch \(turn recipe\)/m);
    assert.match(md, /^### COMPLETION \(turn recipe\)/m);
    assert.match(md, /^### Human gates stay foreground/m);
    assert.match(md, /^### Interactive work — async with documented choices/m);
    assert.match(md, /^### Reaching the task board/m);
  });
});

describe('SPEC-A — DC-CLASS (classification NAV vs WORK)', () => {
  it('classification body names the two planes, WORK-never-foreground, and the WORK kinds', () => {
    const body = sectionBody(readMenuMd(), /^### Classification — NAV vs WORK/m);
    assert.match(body, /NAV/, 'names NAV');
    assert.match(body, /WORK/, 'names WORK');
    assert.match(body, /never.{0,20}foreground/i, 'WORK is never foreground');
    for (const k of ['implement', 'review', 'quality', 'security', 'decompose', 'discuss']) {
      assert.ok(body.includes(k), `classification names ${k} as WORK`);
    }
  });
});

describe('SPEC-A — DC-CLASS-NAV (approve/reject/delete are NAV, never WORK)', () => {
  it('the NAV-claude arm names approve/reject/delete; the WORK table row names none of them', () => {
    const body = sectionBody(readMenuMd(), /^### Classification — NAV vs WORK/m);
    // NAV-claude arm (item 2) must enumerate the gate-adjacent verbs as foreground NAV.
    for (const verb of ['approve', 'reject', 'delete']) {
      assert.ok(body.includes(verb), `classification names ${verb} (NAV-claude)`);
    }
    // The WORK table row must NOT contain approve/reject/delete — a future edit moving
    // a gate-crosser into WORK must fail this suite.
    const workRow = /\| WORK \|([^|]*)\|/.exec(body);
    assert.ok(workRow, 'WORK table row present');
    for (const verb of ['approve', 'reject', 'delete']) {
      assert.ok(!workRow[1].includes(verb), `WORK row does not contain ${verb}`);
    }
  });
});

describe('SPEC-A — DC-CLASS-TOTAL (classification is total — has a default arm)', () => {
  it('an explicit default/catch-all arm makes classification total', () => {
    const body = sectionBody(readMenuMd(), /^### Classification — NAV vs WORK/m);
    assert.match(body, /not listed above[^\n]{0,60}(NAV|foreground)/i, 'explicit default/catch-all arm present');
    // The formerly-unmapped live action (SP4 cleanup-exec) is now classified.
    assert.match(body, /cleanup-exec/, 'cleanup-exec is classified (NAV-claude)');
  });
});

describe('SPEC-A — DC-DISPATCH (WORK dispatch recipe)', () => {
  it('records first, orders add → run_in_background → start, never awaits, renders now', () => {
    const body = sectionBody(readMenuMd(), /^### WORK dispatch \(turn recipe\)/m);
    const iAdd = body.indexOf('menu task add');
    const iBg = body.indexOf('run_in_background');
    const iStart = body.indexOf('menu task start');
    assert.ok(iAdd >= 0 && iBg >= 0 && iStart >= 0, 'names add / run_in_background / start');
    assert.ok(iAdd < iBg && iBg < iStart, 'ordering: add before dispatch before start');
    assert.match(body, /never .{0,10}await/i, 'never await the agent');
    assert.match(body, /render/i, 'render immediately');
    assert.match(body, /canRun/, 'consults canRun');
    assert.match(body, /decision/, 'reads the scheduler decision');
    assert.match(body, /split-brain/, 'names the split-brain rule');
  });

  it('DC-TOUCHES: mandates populating --touches from the plan files: frontmatter (+ --gitop for committing kinds)', () => {
    const body = sectionBody(readMenuMd(), /^### WORK dispatch \(turn recipe\)/m);
    assert.match(body, /files:/, 'references the plan files: frontmatter');
    assert.match(body, /--touches/, 'names --touches');
    assert.match(body, /--gitop/i, 'names --gitop for committing kinds');
  });
});

describe('SPEC-A — DC-GATE4 (Rule 4 enumerates all four human gates)', () => {
  it('Rule 4 enumerates the four gates including Gate 0 (vision → functional)', () => {
    const body = ruleBody(readMenuMd(), /^4\.\s+\*\*Four human gates/m);
    assert.match(body, /vision\s*(->|→)\s*functional/i, 'Gate 0 vision → functional present');
    assert.match(body, /functional\s*(->|→)\s*implementation/i, 'Gate 1 present');
    assert.match(body, /implementation\s*(->|→)\s*todo/i, 'Gate 2 present');
    assert.match(body, /review\s*(->|→)\s*done/i, 'Gate 3 present');
  });
});

describe('SPEC-A — DC-QUEUE (queue → record only)', () => {
  it('queue decision records only and dispatches no agent', () => {
    const body = sectionBody(readMenuMd(), /^### WORK dispatch \(turn recipe\)/m);
    assert.match(body, /queue/i, 'names the queue decision');
    assert.match(body, /record only/i, 'queue records only');
    assert.match(body, /do not.{0,20}(launch|dispatch)/i, 'queue launches no agent');
  });
});

describe('SPEC-A — DC-COMPLETE (completion recipe)', () => {
  it('completes via menu task complete, promotes via nextRunnable, pulls without hijacking', () => {
    const body = sectionBody(readMenuMd(), /^### COMPLETION \(turn recipe\)/m);
    assert.match(body, /menu task complete/, 'names menu task complete');
    assert.match(body, /nextRunnable/, 'names nextRunnable');
    assert.match(body, /promote/, 'names the promote set');
    assert.match(body, /pull/i, 'pull-based notice');
    assert.match(body, /hijack|current screen/i, 'never hijacks the current screen');
  });
});

describe('SPEC-A — DC-FAIL (failure surfaced)', () => {
  it('failure recorded via menu task fail and surfaced in the inbox', () => {
    const body = sectionBody(readMenuMd(), /^### COMPLETION \(turn recipe\)/m);
    assert.match(body, /menu task fail/, 'names menu task fail');
    assert.match(body, /inbox/i, 'failure appears in the inbox');
  });
});

describe('SPEC-A — DC-GATE (gates never auto-crossed)', () => {
  it('gate section forbids auto-crossing, names Gate N ready, and keeps --gate/--next', () => {
    const body = sectionBody(readMenuMd(), /^### Human gates stay foreground/m);
    assert.match(body, /never.{0,20}(auto-cross|cross)/i, 'never auto-cross a gate');
    assert.match(body, /Gate N ready/, 'names the Gate N ready inbox item');
    assert.match(body, /--gate/, 'names the --gate marker');
    assert.match(body, /--next/, 'names the --next nav route');
  });
});

describe('SPEC-A — DC-INTERACTIVE (async with documented choices)', () => {
  it('discuss and decompose run async, make documented choices, surface decisions', () => {
    const body = sectionBody(readMenuMd(), /^### Interactive work — async with documented choices/m);
    assert.match(body, /discuss/, 'names discuss');
    assert.match(body, /decompose/, 'names decompose');
    assert.match(body, /documented .{0,20}choices/i, 'documented reasonable choices');
    assert.match(body, /decisions awaiting review/i, 'open questions → decisions awaiting review');
  });
});

describe('SPEC-A — DC-RULES (Rules 11/12/13 bodies)', () => {
  it('Rule 11 — two planes, WORK never foreground', () => {
    const body = ruleBody(readMenuMd(), /^11\.\s+\*\*Two planes/m);
    assert.match(body, /WORK/);
    assert.match(body, /never.{0,20}foreground/i);
  });

  it('Rule 12 — record-first, canRun before launch, split-brain, never await', () => {
    const body = ruleBody(readMenuMd(), /^12\.\s+\*\*WORK dispatch is record-first/m);
    assert.match(body, /menu task add/);
    assert.match(body, /canRun/);
    assert.match(body, /split-brain/);
    assert.match(body, /never .{0,10}await/i);
  });

  it('Rule 13 — completions pull, promote nextRunnable, never auto-cross a gate', () => {
    const body = ruleBody(readMenuMd(), /^13\.\s+\*\*Completions pull/m);
    assert.match(body, /promote/);
    assert.match(body, /nextRunnable/);
    assert.match(body, /never auto-cross/i);
  });
});

describe('SPEC-A — DC-ROWS (edited action-table rows)', () => {
  it('start-agent is WORK; discuss/decompose are interactive-async WORK', () => {
    const md = readMenuMd();
    assert.match(md, /`claude:start-agent`[^\n]*WORK/, 'start-agent row marked WORK');
    assert.match(md, /`claude:discuss`[^\n]*(WORK|interactive-async)/i, 'discuss row marked WORK interactive-async');
    assert.match(md, /`claude:decompose[^\n]*(WORK|interactive-async)/i, 'decompose row marked WORK interactive-async');
  });
});

describe('SPEC-A — DC-PRESERVED (SP2 Rule-10 + frontmatter invariants)', () => {
  it('Rule 10 heading is intact (SP2 doc-contract anchor)', () => {
    const md = readMenuMd();
    assert.match(md, /^10\.\s+\*\*Stale-plans question rides along, navigates with precedence/m);
  });

  it('frontmatter keeps effort: low and pins NO model:', () => {
    const md = readMenuMd();
    const fmMatch = md.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(fmMatch, 'frontmatter present');
    const fm = fmMatch[1];
    assert.match(fm, /^effort:\s*low\b/m, 'effort: low preserved');
    assert.doesNotMatch(fm, /^model:/m, 'no model pin (slash-command-no-model-pin invariant)');
  });

  it('Rules 1–10 keep their exact numbers', () => {
    const md = readMenuMd();
    for (let n = 1; n <= 10; n++) {
      assert.match(md, new RegExp('^' + n + '\\.\\s', 'm'), `Rule ${n} present`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SPEC-B — behavioral over menu-screens.js (isolated tmp roots)
// ═══════════════════════════════════════════════════════════════════════════

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-nb3-'));
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
});

describe('SPEC-B — B-PROMOTE (complete/fail/cancel fold nextRunnable into promote[])', () => {
  it('B-PROMOTE-run: completing a running implement frees the plan-serial slot → the queued implement is promoted', () => {
    const a1 = ms.route(['menu', 'task', 'add', 'implement', 'pi1'], root);
    assert.equal(a1.decision, 'run', 'first implement runs on an empty registry');
    ms.route(['menu', 'task', 'start', a1.taskId], root);
    const a2 = ms.route(['menu', 'task', 'add', 'implement', 'pi2'], root);
    assert.equal(a2.decision, 'queue', 'second implement queues (plan-serial)');

    const done = ms.route(['menu', 'task', 'complete', a1.taskId, '--summary', 'ok'], root);
    assert.equal(done.status, 'done');
    assert.ok(Array.isArray(done.promote), 'complete returns a promote[] array');
    const p = done.promote.find((t) => t.id === a2.taskId);
    assert.ok(p, 'the queued implement is promoted');
    assert.equal(p.kind, 'implement');
    for (const f of ['id', 'kind', 'plan', 'touches', 'gitOp']) assert.ok(f in p, `promote item has ${f}`);
  });

  it('B-PROMOTE-cap: with one freed slot, promote never exceeds the concurrency budget', () => {
    const reg = taskRegistry.emptyRegistry();
    const running = [];
    for (let i = 1; i <= 5; i++) {
      const t = taskRegistry.addTask(reg, { kind: 'review', plan: 'r' + i });
      taskRegistry.updateTask(reg, t.id, { status: 'running' });
      running.push(t);
    }
    for (let i = 1; i <= 6; i++) taskRegistry.addTask(reg, { kind: 'review', plan: 'q' + i });
    taskRegistry.save(root, reg);

    const done = ms.route(['menu', 'task', 'complete', running[0].id, '--summary', 'ok'], root);
    assert.ok(Array.isArray(done.promote));
    assert.equal(done.promote.length, 1, 'exactly one slot freed → exactly one promoted (≤5 honored)');
  });

  it('B-PROMOTE-failcancel(fail): failing a running implement promotes the queued implement', () => {
    const f1 = ms.route(['menu', 'task', 'add', 'implement', 'pi1'], root);
    ms.route(['menu', 'task', 'start', f1.taskId], root);
    const f2 = ms.route(['menu', 'task', 'add', 'implement', 'pi2'], root);
    const failed = ms.route(['menu', 'task', 'fail', f1.taskId], root);
    assert.equal(failed.status, 'failed');
    assert.ok(Array.isArray(failed.promote), 'fail returns a promote[] array');
    assert.ok(failed.promote.some((t) => t.id === f2.taskId), 'queued implement promoted on fail');
  });

  it('B-PROMOTE-failcancel(cancel): cancelling a running implement promotes the queued implement', () => {
    const c1 = ms.route(['menu', 'task', 'add', 'implement', 'pi1'], root);
    ms.route(['menu', 'task', 'start', c1.taskId], root);
    const c2 = ms.route(['menu', 'task', 'add', 'implement', 'pi2'], root);
    const cancelled = ms.route(['menu', 'task', 'cancel', c1.taskId], root);
    assert.equal(cancelled.cancelled, true);
    assert.ok(Array.isArray(cancelled.promote), 'cancel returns a promote[] array');
    assert.ok(cancelled.promote.some((t) => t.id === c2.taskId), 'queued implement promoted on cancel');
  });

  it('B-PROMOTE-blocked: a blocked-dep task is excluded while its UNblocked sibling IS promoted (not vacuously empty)', () => {
    const b1 = ms.route(['menu', 'task', 'add', 'implement', 'pi1'], root);
    ms.route(['menu', 'task', 'start', b1.taskId], root);
    const dep = ms.route(['menu', 'task', 'add', 'review', 'depplan'], root); // stays queued (never started)
    const blocked = ms.route(['menu', 'task', 'add', 'implement', 'pi2', '--blocked', dep.taskId], root);
    const done = ms.route(['menu', 'task', 'complete', b1.taskId, '--summary', 'ok'], root);
    assert.ok(!done.promote.some((t) => t.id === blocked.taskId), 'blocked-dep task is excluded from promote');
    // Guard against a vacuous-green "promote always empty": the unblocked sibling (the
    // queued review with no unmet dep) MUST be present now that the implement slot is free.
    assert.ok(done.promote.some((t) => t.id === dep.taskId), 'the unblocked sibling IS promoted');
  });

  it('B-PROMOTE-idfilter (LOW): a crafted non-t<n> / control-char registry id is filtered out of promote (defense in depth)', () => {
    const a1 = ms.route(['menu', 'task', 'add', 'implement', 'pi1'], root);
    ms.route(['menu', 'task', 'start', a1.taskId], root);
    // Inject a queued task with a crafted id + control-char plan straight into the store.
    const reg = taskRegistry.load(root);
    reg.tasks.push({
      id: 'evil\nmenu task start x', kind: 'review', plan: 'plan',
      status: 'queued', touches: [], blockedBy: [], gitOp: false,
    });
    taskRegistry.save(root, reg);
    // A legit queued task (canonical id) proves promote is not vacuously empty.
    const ok2 = ms.route(['menu', 'task', 'add', 'review', 'clean'], root);
    const done = ms.route(['menu', 'task', 'complete', a1.taskId, '--summary', 'ok'], root);
    assert.ok(!done.promote.some((t) => /evil/.test(t.id)), 'crafted non-t<n> id excluded from promote');
    assert.ok(done.promote.some((t) => t.id === ok2.taskId), 'the legit canonical-id task IS promoted (not vacuously empty)');
    assert.ok(done.promote.every((t) => /^t\d+$/.test(t.id)), 'every promoted id matches ^t\\d+$');
    assert.ok(done.promote.every((t) => t.plan == null || !/[\x00-\x1f\x7f-\x9f]/.test(t.plan)), 'promoted plan carries no control chars');
  });

  it('B-PROMOTE-scheduler: a file-conflicting task is excluded while a non-conflicting one is promoted', () => {
    const rA = ms.route(['menu', 'task', 'add', 'review', 'pA', '--touches', 'a.js'], root);
    ms.route(['menu', 'task', 'start', rA.taskId], root);
    const rB = ms.route(['menu', 'task', 'add', 'review', 'pB', '--touches', 'b.js'], root);
    ms.route(['menu', 'task', 'start', rB.taskId], root);
    const qConf = ms.route(['menu', 'task', 'add', 'review', 'pC', '--touches', 'a.js'], root);
    assert.equal(qConf.decision, 'queue', 'conflicting review queues (file-conflict)');
    const qOk = ms.route(['menu', 'task', 'add', 'review', 'pD', '--touches', 'c.js'], root);

    const done = ms.route(['menu', 'task', 'complete', rB.taskId, '--summary', 'ok'], root);
    assert.ok(!done.promote.some((t) => t.id === qConf.taskId), 'file-conflicting task excluded');
    assert.ok(done.promote.some((t) => t.id === qOk.taskId), 'non-conflicting task promoted');
  });
});

describe('SPEC-B — B-ENTRY (dashboardCommands "Background tasks ▸")', () => {
  it('B-ENTRY-empty: no ride-along; single Commands question of 4 options; the 4 pipeline options are unchanged', () => {
    const cmds = ms.route(['menu', 'commands'], root);
    assert.equal(cmds.ask.questions.length, 1, 'empty registry → exactly one Commands question (no ride-along)');
    assert.equal(cmds.ask.questions[0].options.length, 4, 'primary Commands question has its 4 options');
    const labels = cmds.ask.questions[0].options.map((o) => o.label);
    assert.ok(!labels.some((l) => /Background tasks|board/i.test(l)), 'no board entry when the registry is empty');
    assert.ok(!('View board ▸' in cmds.actions), 'no board action when empty');

    const pipe = ms.route([], root);
    assert.equal(pipe.ask.questions[0].options.length, 4, 'pipeline still shows exactly 4 options');
    assert.deepEqual(
      pipe.ask.questions[0].options.map((o) => o.label),
      ['Business', 'Implementation', 'Execution', 'More ▶'],
      'the 4 pipeline options are unchanged'
    );
  });

  it('B-ENTRY-cap (HIGH): non-empty registry → EVERY dashboardCommands question ≤ 4 options; primary keeps ◀ Pipeline; board is a ride-along mapping View board ▸ → tasks', () => {
    const reg = taskRegistry.emptyRegistry();
    taskRegistry.addTask(reg, { kind: 'implement', plan: 'pi1' });
    taskRegistry.save(root, reg);

    const cmds = ms.route(['menu', 'commands'], root);
    // AskUserQuestion caps EACH question at 4 options. A 5th spliced option would be
    // truncated and, sitting before ◀ Pipeline, would strand the user with no Back.
    for (const q of cmds.ask.questions) {
      assert.ok(q.options.length <= 4, `question "${q.header}" has ${q.options.length} options (> 4 breaks AskUserQuestion)`);
    }
    // The primary Commands question stays EXACTLY its 4 options with ◀ Pipeline intact.
    const primary = cmds.ask.questions[0];
    assert.equal(primary.options.length, 4, 'primary Commands question stays at exactly 4 options');
    assert.ok(primary.options.some((o) => o.label === '◀ Pipeline'), 'primary question keeps ◀ Pipeline (Back never truncated)');
    // The board is reached via a RIDE-ALONG second question (mirrors env/stale ride-along).
    const ride = cmds.ask.questions.find((q, i) => i > 0 && q.options.some((o) => /board/i.test(o.label)));
    assert.ok(ride, 'a ride-along second question offers the board when the registry is non-empty');
    const boardOpt = ride.options.find((o) => /board/i.test(o.label));
    assert.equal(cmds.actions[boardOpt.label], 'tasks', 'View board ▸ routes to the tasks board');
  });

  it('B-ENTRY-nonempty: board reachable via a ride-along question → action `tasks`, never a bare-digit key', () => {
    const reg = taskRegistry.emptyRegistry();
    taskRegistry.addTask(reg, { kind: 'implement', plan: 'pi1' });
    taskRegistry.save(root, reg);

    const cmds = ms.route(['menu', 'commands'], root);
    const allOpts = cmds.ask.questions.flatMap((q) => q.options);
    const entry = allOpts.find((o) => /board/i.test(o.label));
    assert.ok(entry, 'a board entry is present when the registry is non-empty');
    assert.equal(cmds.actions[entry.label], 'tasks', 'entry routes to the tasks board');
    for (const q of cmds.ask.questions) {
      assert.ok(q.options.length <= 4, `question "${q.header}" ≤ 4 options`);
    }
    for (const k of Object.keys(cmds.actions)) {
      assert.ok(!/^\d+$/.test(k), `no bare-digit action key: ${k}`);
    }
  });

  it('B-ENTRY-corrupt: a corrupt registry fails open — Commands renders, entry omitted', () => {
    const dir = path.join(root, '.ctoc', 'state');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'tasks.json'), '{ this is not valid json');

    const cmds = ms.route(['menu', 'commands'], root);
    assert.ok(cmds.text && cmds.text.length > 0, 'Commands still renders on a corrupt registry');
    assert.equal(cmds.ask.questions.length, 1, 'fail-open: no ride-along on a corrupt registry');
    const labels = cmds.ask.questions[0].options.map((o) => o.label);
    assert.ok(!labels.some((l) => /Background tasks|board/i.test(l)), 'fail-open: board entry omitted on a corrupt registry');
  });
});
