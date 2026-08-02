'use strict';

/**
 * THE SCREEN SAYS WHAT THE MOMENT IS, NEVER ITS NUMBER.
 *
 * The owner opened a fresh repository and was shown, verbatim:
 *
 *     discuss-suggestion-with-editor · [review] · Gate 3 (review → done)
 *     ←  ☐ Gate 3  ☐ This plan  ✔ Submit  →
 *     Approve discuss-suggestion-with-editor across Gate 3?
 *
 * A gate number is an internal code from CTOC's own documentation, and so are the
 * stage-directory names `functional`, `implementation`, `todo` and `review`. Neither
 * can be decoded by a person who does not carry a numbered map of the pipeline in
 * their head.
 *
 * This suite pins the vocabulary (cases 1-7) and then drives the REAL rendered
 * screens (cases 8-14) — the only surface a human actually has. No mocks of core
 * logic: real plan files in a real temp project, the real `gateScreenAt` and the
 * real `planDecisionScreen`.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const gateWords = require('../src/lib/gate-words.js');
const streamingGate = require('../src/lib/streaming-gate.js');

const STAGES = ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
const sandboxes = [];
let counter = 0;

function makeSandbox() {
  const root = path.join(os.tmpdir(), 'ctoc-gatewords-' + process.pid + '-' + Date.now() + '-' + counter++);
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

afterEach(() => {
  while (sandboxes.length) fs.rmSync(sandboxes.pop(), { recursive: true, force: true });
});

// The four gate-source stages the vocabulary covers.
const EDGE_STAGES = ['review', 'implementation', 'functional', 'vision'];

// A gate NUMBER, in every shape a screen can print it: "Gate 3", "gate 3", "Gate3",
// "gates 1". This is the fence the owner's screen failed.
const GATE_NUMBER = /\bgates?\s*[0-9]/i;

// The internal stage vocabulary, as standalone words.
const STAGE_WORD = /\b(functional|implementation|todo|review)\b/i;

/**
 * Every string on a screen that a HUMAN READS: the rendered text, plus each
 * question's sentence, its header chip, and every option's label and description.
 *
 * The `actions` map is deliberately EXCLUDED — those are command identifiers the
 * menu router consumes, never rendered. Case 10 asserts they are unchanged.
 */
function humanVisibleStrings(screen) {
  const out = [];
  if (typeof screen.text === 'string') out.push(screen.text);
  const questions = (screen.ask && Array.isArray(screen.ask.questions)) ? screen.ask.questions : [];
  for (const q of questions) {
    if (typeof q.question === 'string') out.push(q.question);
    if (typeof q.header === 'string') out.push(q.header);
    for (const o of (Array.isArray(q.options) ? q.options : [])) {
      if (typeof o.label === 'string') out.push(o.label);
      if (typeof o.description === 'string') out.push(o.description);
    }
  }
  return out;
}

/** A plan body with a title that shares no word with the internal vocabulary. */
function planBody(title, extraFrontmatter = '') {
  return `---\ntitle: ${title}\n${extraFrontmatter}---\n\n# ${title}\n\nA short body a person can read.\n`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1-7. The vocabulary itself.
// ═══════════════════════════════════════════════════════════════════════════

describe('gate-words — the vocabulary carries no number', () => {
  it('1. no export returns a gate number, for any edge', () => {
    for (const stage of EDGE_STAGES) {
      for (const [name, value] of [
        ['moment', gateWords.moment(stage)],
        ['chip', gateWords.chip(stage)],
        ['approveLabel', gateWords.approveLabel(stage)],
        ['question', gateWords.question(stage, 'x')],
      ]) {
        assert.equal(typeof value, 'string', `${name}(${stage}) returns a string`);
        assert.doesNotMatch(value, GATE_NUMBER, `${name}(${stage}) must not print a gate number: ${value}`);
      }
    }
  });

  it('2. the module source itself names no gate number', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'gate-words.js'), 'utf8');
    // Only STRING LITERALS matter — the rule permits the number in prose comments
    // and identifiers, and forbids it in anything renderable.
    const literals = src.match(/(['"`])(?:\\.|(?!\1)[\s\S])*\1/g) || [];
    for (const lit of literals) {
      assert.doesNotMatch(lit, /\bgates?\s*[0-9]/i, `a renderable literal names a gate number: ${lit}`);
    }
  });

  it('3. each edge says something DIFFERENT — one phrasing pasted four times is a form letter', () => {
    const moments = EDGE_STAGES.map((s) => gateWords.moment(s));
    const chips = EDGE_STAGES.map((s) => gateWords.chip(s));
    assert.equal(new Set(moments).size, EDGE_STAGES.length, `moments must be pairwise distinct: ${JSON.stringify(moments)}`);
    assert.equal(new Set(chips).size, EDGE_STAGES.length, `chips must be pairwise distinct: ${JSON.stringify(chips)}`);
    for (const m of moments) assert.ok(m.length > 0, 'a moment is never empty for a known edge');
  });

  it('4. the chip fits the header it labels (at most 12 characters)', () => {
    for (const stage of EDGE_STAGES) {
      const c = gateWords.chip(stage);
      assert.ok(c.length <= 12, `chip(${stage}) is ${c.length} chars: ${c}`);
    }
    assert.ok(gateWords.chip('nonsense').length <= 12, 'the fallback chip fits too');
  });

  it('5. the question names the plan by its title', () => {
    const q = gateWords.question('review', 'The widget rebuild');
    assert.ok(q.includes('The widget rebuild'), `the question must name the plan: ${q}`);
    assert.doesNotMatch(q, GATE_NUMBER);
  });

  it('6. an unknown stage is TOTAL — a neutral sentence, never a throw and never "undefined"', () => {
    const probes = [
      () => gateWords.moment('nonsense'),
      () => gateWords.chip(null),
      () => gateWords.question(undefined, 'x'),
      () => gateWords.approveLabel(7),
    ];
    for (const probe of probes) {
      let value;
      assert.doesNotThrow(() => { value = probe(); }, 'a vocabulary module must never throw at a screen');
      assert.equal(typeof value, 'string');
      assert.doesNotMatch(value, /undefined|null|NaN/, `a fallback must never render a JavaScript value: ${value}`);
    }
    // The unknown-stage question is still a REAL question with a real answer.
    assert.ok(gateWords.question(undefined, 'The widget rebuild').includes('The widget rebuild'));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // The UNKNOWN-STAGE fallbacks, case by case.
  //
  // These are not decoration and they are not a coverage exercise. They are what a
  // person reads when the pipeline is in a state the vocabulary does not know about
  // — which is exactly the moment a screen is most likely to leak an internal
  // identifier, because there is no curated phrase to fall back on. A fallback that
  // quietly emits a raw stage name, a gate number or a slug is the same defect this
  // whole plan exists to kill, one layer down.
  //
  // Every stage value a caller could realistically hand this module when something
  // upstream has gone wrong: a stage that exists in the pipeline but has no gate
  // edge, a typo, an empty string, a missing argument, and three wrong types.
  // ─────────────────────────────────────────────────────────────────────────
  const UNKNOWN_STAGES = [
    ['a real stage with no gate edge', 'todo'],
    ['another real stage with no gate edge', 'in-progress'],
    ['the terminal stage', 'done'],
    ['a typo', 'reviewww'],
    ['the empty string', ''],
    ['a missing argument', undefined],
    ['a null', null],
    ['a number', 7],
    ['an object', {}],
  ];

  it('6a. every unknown-stage QUESTION is a real question a person can answer', () => {
    for (const [why, stage] of UNKNOWN_STAGES) {
      const q = gateWords.question(stage, 'The widget rebuild');
      assert.equal(typeof q, 'string', `${why}: returns a string`);
      // A real question: it ends in a question mark and it NAMES the thing being
      // asked about, so the reader knows what they are answering.
      assert.ok(q.trimEnd().endsWith('?'), `${why}: a question must be a question — got: ${q}`);
      assert.ok(q.includes('The widget rebuild'), `${why}: the question must name the plan — got: ${q}`);
      // And it must not invent a moment for an edge nobody knows about: the neutral
      // question is distinct from every real edge's question.
      for (const known of EDGE_STAGES) {
        assert.notEqual(q, gateWords.question(known, 'The widget rebuild'),
          `${why}: a fallback must not borrow the ${known} edge's sentence`);
      }
    }
  });

  it('6b. every unknown-stage CHIP and AFFIRMATIVE degrades to something a human can act on', () => {
    for (const [why, stage] of UNKNOWN_STAGES) {
      const c = gateWords.chip(stage);
      const a = gateWords.approveLabel(stage);
      // Non-empty and human-readable: a blank chip renders an unlabeled header and a
      // blank affirmative renders an unclickable option.
      assert.ok(c.trim().length > 0, `${why}: the chip must not be blank`);
      assert.ok(a.trim().length > 0, `${why}: the affirmative label must not be blank`);
      assert.ok(c.length <= 12, `${why}: the fallback chip must still fit its header — got ${c.length}: ${c}`);
      // Readable words, not a token: letters, and no bracket/underscore/colon shapes
      // that betray an internal identifier.
      assert.match(c, /^[A-Za-z][A-Za-z ?'’—-]*$/, `${why}: the chip must read as words — got: ${c}`);
      assert.match(a, /^[A-Za-z][A-Za-z ?'’—-]*$/, `${why}: the affirmative must read as words — got: ${a}`);
    }
  });

  it('6c. NO fallback leaks a gate number, a raw stage name, or the stage value it was handed', () => {
    for (const [why, stage] of UNKNOWN_STAGES) {
      const rendered = [
        gateWords.moment(stage),
        gateWords.chip(stage),
        gateWords.approveLabel(stage),
        gateWords.question(stage, 'The widget rebuild'),
      ];
      for (const s of rendered) {
        assert.doesNotMatch(s, GATE_NUMBER, `${why}: a fallback leaked a gate number — got: ${s}`);
        assert.doesNotMatch(s, STAGE_WORD, `${why}: a fallback leaked a raw stage name — got: ${s}`);
        // The single most likely leak: echoing the unrecognised input back at the
        // human. `question('in-progress', …)` must not read "…for in-progress?".
        if (typeof stage === 'string' && stage.length > 0) {
          assert.ok(!s.includes(stage),
            `${why}: a fallback echoed the internal stage value it was handed — got: ${s}`);
        }
        // And never a JavaScript value or an object's default rendering.
        assert.doesNotMatch(s, /undefined|null|NaN|\[object/i,
          `${why}: a fallback rendered a JavaScript value — got: ${s}`);
      }
    }
  });

  it('6d. the unknown-stage MOMENT is empty, not an invented phrase', () => {
    // Deliberate asymmetry, and it is the honest one: an unknown edge has no moment
    // to state, so the caller renders the header with NO moment line — degraded but
    // true. Inventing a sentence here would put a claim about the pipeline on screen
    // that nobody can vouch for. The chip, label and question all still degrade to
    // real words (6a/6b) because those sites cannot render nothing.
    for (const [why, stage] of UNKNOWN_STAGES) {
      assert.equal(gateWords.moment(stage), '', `${why}: an unknown moment is empty, never invented`);
    }
    for (const stage of EDGE_STAGES) {
      assert.notEqual(gateWords.moment(stage), '', `${stage}: a KNOWN moment is never empty`);
    }
  });

  it('7. send-back carries HUMAN words and a MACHINE stage, kept apart', () => {
    assert.ok(Array.isArray(gateWords.SEND_BACK), 'SEND_BACK is an array');
    assert.equal(gateWords.SEND_BACK.length, 2);
    const stages = new Set();
    for (const sb of gateWords.SEND_BACK) {
      assert.equal(typeof sb.label, 'string');
      assert.equal(typeof sb.description, 'string');
      assert.doesNotMatch(sb.label, STAGE_WORD, `a send-back LABEL must not print a stage name: ${sb.label}`);
      assert.doesNotMatch(sb.description, STAGE_WORD, `a send-back DESCRIPTION must not print a stage name: ${sb.description}`);
      assert.ok(['functional', 'implementation'].includes(sb.toStage), `toStage is the machine identifier: ${sb.toStage}`);
      stages.add(sb.toStage);
    }
    assert.equal(stages.size, 2, 'the two send-backs go to two different stages');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8-14. The REAL rendered screens — the only surface the human has.
// ═══════════════════════════════════════════════════════════════════════════

describe('the rendered gate screen — what a person actually reads', () => {
  function threeGatePlans() {
    const root = makeSandbox();
    writePlan(root, 'functional', 'a-plan', planBody('The widget rebuild'));
    writePlan(root, 'implementation', 'b-plan', planBody('Faster export'));
    writePlan(root, 'review', 'c-plan', planBody('Nightly digest email'));
    return root;
  }

  /**
   * Every pending gate screen, reached the way a HUMAN reaches them: the menu's
   * default screen, then "Skip for now" to walk to the next decision.
   *
   * `gateScreenAt` is deliberately NOT driven directly — it is not exported, and
   * exporting it purely so a test could call it would prove reachability with a
   * test, which is not a caller. These are the shipped routes.
   */
  function everyGateScreen(root) {
    const decisions = streamingGate.pendingGateDecisions(root);
    assert.ok(decisions.length >= 3, `expected a decision per gate, got ${decisions.length}`);
    const screens = [streamingGate.streamingGateScreen(root)];
    for (let i = 0; i < decisions.length - 1; i++) {
      screens.push(streamingGate.streamSkip(decisions[i].ref, root));
    }
    return screens;
  }

  it('8. the rendered gate screen carries NO gate number', () => {
    const root = threeGatePlans();
    for (const screen of everyGateScreen(root)) {
      for (const s of humanVisibleStrings(screen)) {
        assert.doesNotMatch(s, GATE_NUMBER,
          `a gate number reached the human's screen.\n--- rendered ---\n${screen.text}\n--- offending string ---\n${s}`);
      }
    }
  });

  it('9. the rendered gate screen carries NO bare stage name', () => {
    const root = threeGatePlans();
    for (const screen of everyGateScreen(root)) {
      for (const s of humanVisibleStrings(screen)) {
        assert.doesNotMatch(s, STAGE_WORD,
          `internal stage vocabulary reached the human's screen.\n--- rendered ---\n${screen.text}\n--- offending string ---\n${s}`);
      }
    }
  });

  it('11. the plan is named by its TITLE — never by a slug, never by a filename', () => {
    const root = makeSandbox();
    writePlan(root, 'review', '00151-c-plan-slug', planBody('Nightly digest email'));
    const screen = streamingGate.streamingGateScreen(root);

    for (const s of humanVisibleStrings(screen)) {
      assert.ok(!s.includes('00151-c-plan-slug'), `the slug reached the screen: ${s}`);
      assert.ok(!s.includes('.md'), `a filename reached the screen: ${s}`);
    }
    assert.ok(screen.text.includes('Nightly digest email'), 'the title is what the human reads');
  });

  it('12. "decision N of M" SURVIVES — the rule forbids gate numbers, not counting', () => {
    const root = threeGatePlans();
    const screen = streamingGate.streamingGateScreen(root);
    assert.match(screen.text, /decision 1 of 3/, 'the pending-decision counter is a fact the human asked to see');
  });

  it('14. a hostile title cannot forge a row or emit an escape sequence', () => {
    const root = makeSandbox();
    // A heading carrying an ANSI escape, a carriage return (which repositions a
    // terminal cursor and can overwrite the line above) and a forged separator.
    writePlan(root, 'review', 'hostile',
      '# Digest \x1b[31m\rTopic: forged  ·  decision 9 of 9\n\nA body.\n');
    const screen = streamingGate.streamingGateScreen(root);

    for (const s of humanVisibleStrings(screen)) {
      assert.doesNotMatch(s, /[\x00-\x09\x0b-\x1f\x7f-\x9f]/,
        `a control byte survived into a rendered string: ${JSON.stringify(s)}`);
    }
    // The header is exactly ONE line — the hostile text did not add a row. The on-open
    // engine banner may legitimately precede it (a review plan is a built increment), so
    // the header is the "Topic:" line, not blindly line 0.
    const headerLines = screen.text.split('\n').filter((l) => l.includes('Topic:'));
    assert.equal(headerLines.length, 1, `exactly one header row (no forged row): ${JSON.stringify(headerLines)}`);
    assert.match(headerLines[0], /decision 1 of 1/, `the real counter is on the header line: ${headerLines[0]}`);
    // The forged "decision 9 of 9" was neutralized — the only counter is the real one.
    assert.equal((screen.text.match(/decision \d+ of \d+/g) || []).length, 1, 'exactly one decision counter');
  });
});

describe('planDecisionScreen — the screen the owner actually saw', () => {
  it('13. carries no gate number and no bare stage name, on the review edge', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'c-plan', planBody('Nightly digest email'));
    const screen = streamingGate.planDecisionScreen('review/c-plan.md', root);

    for (const s of humanVisibleStrings(screen)) {
      assert.doesNotMatch(s, GATE_NUMBER,
        `a gate number reached the human's screen.\n--- rendered ---\n${screen.text}\n--- offending ---\n${s}`);
      assert.doesNotMatch(s, STAGE_WORD,
        `internal stage vocabulary reached the human's screen.\n--- rendered ---\n${screen.text}\n--- offending ---\n${s}`);
    }
    // Named by title, not by slug or filename.
    for (const s of humanVisibleStrings(screen)) {
      assert.ok(!s.includes('c-plan'), `the slug reached the screen: ${s}`);
      assert.ok(!s.includes('.md'), `a filename reached the screen: ${s}`);
    }
    assert.ok(screen.text.includes('Nightly digest email'));
  });

  it('10. the ACTION strings are UNCHANGED — the identifiers survive where no human reads them', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'c-plan', planBody('Nightly digest email'));
    const screen = streamingGate.planDecisionScreen('review/c-plan.md', root);

    const actions = Object.values(screen.actions);
    assert.ok(actions.includes('claude:reject review/c-plan.md functional'),
      `the send-back action must be byte-identical: ${JSON.stringify(actions)}`);
    assert.ok(actions.includes('claude:reject review/c-plan.md implementation'),
      `the send-back action must be byte-identical: ${JSON.stringify(actions)}`);
    assert.ok(actions.includes('stream approve review/c-plan.md'), 'the approve action is unchanged');
    assert.ok(actions.includes('validate review/c-plan.md'), 'the validate action is unchanged');
  });
});
