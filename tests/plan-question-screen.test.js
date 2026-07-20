'use strict';

/**
 * `plan <ref>` is a QUESTION, never a navigation menu.
 *
 * The owner's instruction: "remove the menu completely, only questions", and the
 * design sentence behind it: "the user should get questions one at a time and
 * answer them, THE PLANS GO THROUGH THE GATES AUTOMATICALLY WHEN THERE IS ENOUGH
 * CONTEXT."
 *
 * That makes the QUESTIONS the product. A question is about THE APPLICATION —
 * what it does, what the rule is in some case — and it ELICITS the context CTOC
 * needs in order to build the app the human actually wants. The old `plan <ref>`
 * screen asked "What would you like to do with this plan?" and listed five
 * navigation routes (Discuss / View-Edit / Approve → Done / Feedback → Functional
 * / Rework → Implementation). That is a menu wearing a question's clothes: none of
 * those options is a decision about the application, and picking one only moves
 * the human to another screen.
 *
 * This suite fixes the replacement contract:
 *   1. The plan's BODY is rendered — opening a plan shows the work, not a bare
 *      title over a list of routes.
 *   2. The PRODUCT question comes first when one has been precomputed for the
 *      plan (`streaming-precompute.loadPlanQuestions`), carrying its real
 *      pros/cons and its one recommendation.
 *   3. The plain "Approve across Gate N?" prompt is the LAST-RESORT fallback,
 *      reached only when no product question is waiting — never the main event.
 *   4. No screen offers a navigation list.
 *
 * Hermetic os.tmpdir() sandboxes. Every assertion drives the REAL exported
 * functions and the REAL `route` — no mocks of core logic.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const streamingGate = require('../src/lib/streaming-gate.js');
const precompute = require('../src/lib/streaming-precompute.js');
const gateWords = require('../src/lib/gate-words.js');

// Re-pointed 2026-07-20: a screen says what the MOMENT is, never its number.
const NO_GATE_NUMBER = /\bgates?\s*[0-9]/i;
const { route } = require('../src/lib/menu-screens.js');

const STAGES = ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
const sandboxes = [];
let counter = 0;

function makeSandbox() {
  const root = path.join(os.tmpdir(), 'ctoc-planq-' + process.pid + '-' + Date.now() + '-' + counter++);
  for (const stage of STAGES) fs.mkdirSync(path.join(root, 'plans', stage), { recursive: true });
  fs.mkdirSync(path.join(root, '.ctoc'), { recursive: true });
  sandboxes.push(root);
  return root;
}

function writePlan(root, stage, slug, body) {
  const p = path.join(root, 'plans', stage, slug + '.md');
  fs.writeFileSync(p, body);
  return p;
}

/** A realistic plan: frontmatter + heading + real body prose. */
function planBody(title, extra) {
  return [
    '---',
    `title: "${title}"`,
    'type: implementation',
    'iron_loop: true',
    '---',
    '',
    `# ${title}`,
    '',
    'This plan carries real work in its body. The body is the thing a human',
    'opens a plan to read, and it must reach the screen.',
    '',
    '## Decisions Taken Under Ambiguity',
    '',
    '- Chose the conservative default for the retry window.',
    extra || '',
  ].join('\n');
}

after(() => {
  for (const dir of sandboxes) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. The plan BODY reaches the human.
// ═══════════════════════════════════════════════════════════════════════════

describe('plan <ref> renders the plan body, not a bare title', () => {
  it('shows body prose from the plan file in text', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'r2a-scheduler', planBody('R2-A — Scheduler lifecycle honesty'));

    const r = route(['plan', 'review/r2a-scheduler.md'], root);

    assert.match(r.text, /R2-A — Scheduler lifecycle honesty/, 'the title is shown');
    assert.match(
      r.text,
      /The body is the thing a human/,
      'the plan BODY must reach the screen — a bare heading is the bug this replaces'
    );
    assert.match(r.text, /Decisions Taken Under Ambiguity/, 'body sections are shown');
  });

  it('a plan body is bounded, and says so when it is truncated', () => {
    const root = makeSandbox();
    const long = Array.from({ length: 400 }, (_, i) => `line ${i} of a very long plan body`).join('\n');
    writePlan(root, 'review', 'long-plan', planBody('Long plan', long));

    const r = route(['plan', 'review/long-plan.md'], root);

    assert.ok(r.text.length < 20000, 'an unbounded body would flood the screen');
    assert.match(r.text, /more lines/, 'truncation is disclosed honestly, never silent');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. The PRODUCT question is what gets asked when one is waiting.
// ═══════════════════════════════════════════════════════════════════════════

describe('plan <ref> asks the PRODUCT question first', () => {
  it('asks the precomputed product question with its pros/cons and recommendation', () => {
    const root = makeSandbox();
    const p = writePlan(root, 'review', 'session-expiry', planBody('Session expiry'));

    const questions = [{
      id: 'q01-session-idle-timeout',
      prompt: 'A session with no activity — should it end, and when?',
      critical: true,
      options: [
        {
          key: '1',
          label: 'Configurable per account',
          recommended: true,
          pros: 'Each deployment picks the window its own risk profile needs.',
          cons: 'Adds a settings surface and a migration — roughly one more slice.',
        },
        {
          key: '2',
          label: 'Fifteen minutes',
          pros: 'Limits the window an unattended session can be used.',
          cons: 'Signs out users who step away mid-task.',
        },
      ],
    }];
    const w = precompute.writePlanQuestions(root, 'review/session-expiry.md', questions, fs.statSync(p).mtimeMs);
    assert.equal(w.ok, true, 'fixture questions must write');

    const r = route(['plan', 'review/session-expiry.md'], root);

    const q = r.ask.questions[0];
    assert.equal(
      q.question,
      'A session with no activity — should it end, and when?',
      'the PRODUCT question is asked — not "What would you like to do with this plan?"'
    );

    const labels = q.options.map((o) => o.label);
    assert.equal(labels[0], 'Configurable per account', 'the recommended option leads');

    const rec = q.options[0].description;
    assert.match(rec, /Recommended/, 'the recommendation is surfaced');
    assert.match(rec, /Each deployment picks the window/, 'the real pros reach the human');
    assert.match(rec, /Adds a settings surface/, 'the real cons reach the human');

    // Answering the product question records an answer; it never crosses a gate.
    assert.equal(r.actions['Configurable per account'], 'stream answer review/session-expiry.md q01-session-idle-timeout 1');
  });

  it('the product question is NOT a gate-approval prompt', () => {
    const root = makeSandbox();
    const p = writePlan(root, 'functional', 'export-rules', planBody('Export rules'));
    precompute.writePlanQuestions(root, 'functional/export-rules.md', [{
      id: 'q01-export-format',
      prompt: 'Which format should an export produce?',
      options: [{ key: '1', label: 'Comma-separated values', recommended: true, pros: 'Opens anywhere.', cons: 'No types.' }],
    }], fs.statSync(p).mtimeMs);

    const r = route(['plan', 'functional/export-rules.md'], root);

    // INVERTED (2026-07-20): was `/Approve .* across Gate/`. That pattern can only
    // catch the OLD wording, so after the re-wording it would have passed vacuously
    // — a fence over a string that no longer exists. It now asserts the real thing:
    // the question is the PRODUCT question, not the gate question for this edge, and
    // no gate number reaches it either way.
    assert.notEqual(r.ask.questions[0].question, gateWords.question('functional', 'Export rules'),
      'a gate prompt must never pre-empt a waiting product question');
    assert.doesNotMatch(r.ask.questions[0].question, NO_GATE_NUMBER);
    assert.doesNotMatch(r.ask.questions[0].question, /Approve .* across Gate/,
      'and the old gate wording must never come back');
    assert.match(r.ask.questions[0].question, /Which format should an export produce\?/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. The gate prompt is the LAST-RESORT fallback.
// ═══════════════════════════════════════════════════════════════════════════

describe('plan <ref> falls back to the gate question only when no product question waits', () => {
  it('asks the gate question when no questions are precomputed', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'no-questions', planBody('No questions yet'));

    const r = route(['plan', 'review/no-questions.md'], root);

    // INVERTED (2026-07-20): was `/Approve no-questions across Gate 3\?/` — the exact
    // sentence the owner could not decode ("WHAT THE FUKCCCCKKK IS GATE 3"). The
    // fallback still asks the gate decision; it now asks it in words, naming the plan
    // by its TITLE rather than by its slug.
    assert.equal(r.ask.questions[0].question, gateWords.question('review', 'No questions yet'));
    assert.equal(r.ask.questions[0].header, gateWords.chip('review'));
    assert.doesNotMatch(r.ask.questions[0].question, NO_GATE_NUMBER);
    assert.ok(!r.ask.questions[0].question.includes('no-questions'),
      'the slug names a file, not a piece of work — it must not reach the question');
    assert.equal(r.actions[gateWords.approveLabel('review')], 'stream approve review/no-questions.md');
  });

  // The validation detail screen carries the human's own escape hatch: the
  // deliberate `claude:approve --override` force-crossing past a failed check.
  // `validate <ref>` is its ONLY route, so the plan question must keep offering it
  // — losing it would strand every plan that fails validation.
  it('keeps the validation detail screen (and its override) reachable at a gate', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'failing-plan', planBody('Failing plan'));

    const r = route(['plan', 'review/failing-plan.md'], root);

    assert.equal(r.actions['Check validation'], 'validate review/failing-plan.md');
    const opts = r.ask.questions[0].options;
    assert.equal(
      opts[0].label,
      'Check validation',
      'a plan that fails validation must lead with the only option that can move it forward'
    );
    assert.match(opts[0].description, /Recommended/);
    assert.match(opts[0].description, /override/, 'the override escape hatch is disclosed');
  });

  it('a passing plan leads with the affirmative, and still offers the validation detail', () => {
    const root = makeSandbox();
    // functional→implementation validates on far less than a full Iron Loop run.
    writePlan(root, 'functional', 'clean-plan', planBody('Clean plan'));

    const r = route(['plan', 'functional/clean-plan.md'], root);
    assert.equal(r.actions['Check validation'], 'validate functional/clean-plan.md');
    // INVERTED (2026-07-20): the action map is keyed by the OPTION LABEL, so
    // re-wording the affirmative necessarily re-keys it. The command VALUE is
    // byte-identical — that is the half that must not move.
    assert.equal(r.actions[gateWords.approveLabel('functional')], 'stream approve functional/clean-plan.md');
    assert.equal(r.actions['Approve'], undefined, 'the old bare label is gone, not aliased');
  });

  it('a non-gate stage asks what should happen to the plan — with decisions, not routes', () => {
    const root = makeSandbox();
    writePlan(root, 'todo', 'queued-work', planBody('Queued work'));

    const r = route(['plan', 'todo/queued-work.md'], root);

    const q = r.ask.questions[0];
    assert.ok(q, 'a non-gate plan still asks a question');
    const labels = q.options.map((o) => o.label);
    // Every option must DO something to the plan; none may be a list route.
    assert.ok(labels.includes('Discuss'), 'critique stays reachable as a decision');
    assert.deepEqual(
      labels.filter((l) => /Back to list|◀ Actions|More/.test(l)),
      [],
      'navigation rows are gone'
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. No navigation lists anywhere on the plan route. This is the fence.
// ═══════════════════════════════════════════════════════════════════════════

describe('plan <ref> never renders a navigation list', () => {
  for (const stage of ['review', 'functional', 'implementation', 'todo']) {
    it(`${stage}: no "What would you like to do" / "Review this plan" menu prompt`, () => {
      const root = makeSandbox();
      writePlan(root, stage, 'a-plan', planBody('A plan'));

      const r = route(['plan', `${stage}/a-plan.md`], root);
      const prompt = r.ask.questions[0].question;

      assert.doesNotMatch(prompt, /What would you like to do with this plan\?/, 'the old menu prompt is gone');
      assert.doesNotMatch(prompt, /^Review this plan:$/, 'the old review menu prompt is gone');
      assert.doesNotMatch(prompt, /Select an action:/, 'no action-list prompt');

      const labels = r.ask.questions[0].options.map((o) => o.label);
      assert.deepEqual(
        labels.filter((l) => /Back to list|◀ Actions|◀ Back|More/.test(l)),
        [],
        'no navigation rows in the options'
      );
    });
  }

  it('the "more" sub-menu no longer exists as a separate navigation screen', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'a-plan', planBody('A plan'));

    const r = route(['plan', 'functional/a-plan.md', 'more'], root);

    // `more` must not resurrect a Delete/Back-to-list/Actions navigation list.
    const labels = r.ask.questions[0].options.map((o) => o.label);
    assert.deepEqual(
      labels.filter((l) => /Back to list|◀ Actions/.test(l)),
      [],
      '"more" must not be a navigation menu'
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Safety is preserved exactly — traversal and unknown stages still refuse.
// ═══════════════════════════════════════════════════════════════════════════

describe('plan <ref> keeps its safety guards', () => {
  it('refuses a traversal filename before touching the filesystem', () => {
    const root = makeSandbox();
    const r = route(['plan', 'functional/../../etc/passwd'], root);
    assert.match(r.text, /Invalid plan reference/);
  });

  it('refuses an unknown stage', () => {
    const root = makeSandbox();
    const r = route(['plan', 'nonsense-stage/x.md'], root);
    assert.match(r.text, /Invalid plan reference/);
  });

  it('a plan body carrying control characters cannot forge screen rows', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'hostile', '---\ntitle: "Hostile"\n---\n\n# Hostile\n\n[31mforged[0m row\n');
    const r = route(['plan', 'review/hostile.md'], root);
    assert.doesNotMatch(r.text, /\[31m/, 'control sequences are stripped from plan-derived text');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. The exported screen builder is reachable directly (wired-is-done).
// ═══════════════════════════════════════════════════════════════════════════

describe('planDecisionScreen is the one builder behind the plan route', () => {
  it('is exported and returns the { text, ask, actions } screen contract', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'contract', planBody('Contract'));

    assert.equal(typeof streamingGate.planDecisionScreen, 'function');
    const r = streamingGate.planDecisionScreen('review/contract.md', root);

    assert.equal(typeof r.text, 'string');
    assert.ok(Array.isArray(r.ask.questions) && r.ask.questions.length >= 1);
    assert.equal(typeof r.actions, 'object');
  });
});
