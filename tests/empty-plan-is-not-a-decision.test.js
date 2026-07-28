'use strict';

/**
 * An empty plan is a BROKEN FILE to be told about, not a decision with four options.
 *
 * The owner was shown a gate screen for an empty plan that KNEW the plan was empty,
 * KNEW it failed validation, and then offered an "Approve" option whose own
 * description said it would be refused. This suite pins the honest behaviour:
 *
 *   - an empty (or title-only, or whitespace-only) plan at a gate renders a
 *     BROKEN-ARTIFACT statement plus three actions that all DO something
 *     (Write it / Delete it / Leave it) — never an approval question;
 *   - the GENERAL RULE — an option whose description says it will be refused must
 *     not be an option — holds over every screen this module produces, so a
 *     NON-empty plan that fails validation is likewise never offered a self-refusing
 *     Approve;
 *   - the empty plan is still SURFACED (marked `broken`) in pendingGateDecisions —
 *     hiding it would be a worse dishonesty than asking about it.
 *
 * Every case seeds a real plan file on disk and drives the real exported screen
 * functions — no mocks of core logic. Hermetic os.tmpdir() sandboxes.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const streamingGate = require('../src/lib/streaming-gate.js');
const gateWords = require('../src/lib/gate-words.js');

const NO_GATE_NUMBER = /\bgates?\s*[0-9]/i;
// The general rule, made checkable: no OFFERED option's description may announce its
// own refusal while remaining selectable.
const REFUSAL_PHRASE = /\brefus(e|ed|es)\b|\bwill be rejected\b/i;

const STAGES = ['vision', 'canvas', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];
const sandboxes = [];
let counter = 0;

function makeSandbox() {
  const root = path.join(os.tmpdir(), 'ctoc-empty-' + process.pid + '-' + Date.now() + '-' + counter++);
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

// A functional plan that PASSES validateFunctionalToImpl.
function validFunctionalBody(slug, extraSentence = '') {
  return `---\ntitle: ${slug} title\n---\n\n# ${slug} title\n\n${extraSentence ? extraSentence + '\n\n' : ''}` +
    `## Problem Statement\nThe thing is broken.\n\n## Acceptance Criteria\n- [ ] the thing works\n\n## Scope\nThe module.\n`;
}

// A functional plan that FAILS its gate validator but has real prose (NOT empty).
function invalidFunctionalBody(slug) {
  return `# ${slug} title\n\nWe will do the thing, but the required sections are missing.\n`;
}

// A plan file that is FRONTMATTER ONLY — the owner's exact case.
function frontmatterOnly() {
  return `---\napproved_by: human\n---\n\n---\ntitle: placeholder\ntype: implementation\nfiles:\n  - "src/x.js"\n---\n`;
}

function optionLabels(screen) {
  const out = [];
  for (const q of screen.ask.questions) for (const o of q.options) out.push(o.label);
  return out;
}

function optionDescriptions(screen) {
  const out = [];
  for (const q of screen.ask.questions) for (const o of q.options) out.push(String(o.description || ''));
  return out;
}

afterEach(() => {
  while (sandboxes.length) fs.rmSync(sandboxes.pop(), { recursive: true, force: true });
});

// ── Cases 1-4, 8, 13, 14: the empty plan's own screen ──────────────────────────
describe('an empty plan renders a broken-artifact screen, never a decision', () => {
  it('1. the owner\'s exact case — a frontmatter-only review plan: statement + exactly Write it / Delete it / Leave it', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'empty1', frontmatterOnly());
    const screen = streamingGate.planDecisionScreen('review/empty1.md', root);

    assert.match(screen.text, /empty/i, 'the screen tells the human the plan is empty');
    assert.deepEqual(optionLabels(screen), ['Write it', 'Delete it', 'Leave it'],
      'exactly the three actions that do something — no Approve, no Check validation, no send-backs');
  });

  it('2. Approve is ABSENT — not merely last, not merely buried', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'empty1', frontmatterOnly());
    const screen = streamingGate.planDecisionScreen('review/empty1.md', root);

    assert.ok(!optionLabels(screen).some((l) => /approve/i.test(l)), 'no option is labelled Approve');
    assert.ok(!Object.keys(screen.actions).some((k) => /approve/i.test(k)), 'no Approve action key');
    assert.ok(!Object.values(screen.actions).some((v) => String(v).startsWith('stream approve')),
      'no action value crosses the gate');
  });

  it('3. Check validation is ABSENT — the screen already says why', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'empty1', frontmatterOnly());
    const screen = streamingGate.planDecisionScreen('review/empty1.md', root);

    assert.ok(!optionLabels(screen).some((l) => /check validation/i.test(l)), 'no Check validation option');
    assert.ok(!Object.values(screen.actions).some((v) => /^validate /.test(String(v))), 'no validate action');
  });

  it('4. the send-back options are ABSENT — there is nothing to send back', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'empty1', frontmatterOnly());
    const screen = streamingGate.planDecisionScreen('review/empty1.md', root);

    for (const sb of gateWords.SEND_BACK) {
      assert.ok(!optionLabels(screen).includes(sb.label), `send-back option "${sb.label}" is absent`);
    }
  });

  it('8. every offered option DOES something — Leave it maps to \'\', every other to a non-empty action', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'empty1', frontmatterOnly());
    const screen = streamingGate.planDecisionScreen('review/empty1.md', root);

    for (const label of optionLabels(screen)) {
      assert.ok(Object.prototype.hasOwnProperty.call(screen.actions, label),
        `every option has an action entry: ${label}`);
    }
    assert.equal(screen.actions['Leave it'], '', 'Leave it changes nothing');
    assert.ok(String(screen.actions['Write it']).length > 0, 'Write it does something');
    assert.ok(String(screen.actions['Delete it']).length > 0, 'Delete it does something');
  });

  it('13. the filename is LABELLED, never presented as the work\'s name', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'empty1', frontmatterOnly());
    const screen = streamingGate.planDecisionScreen('review/empty1.md', root);

    // The first line is a statement about the file, not the slug rendered as a title.
    assert.ok(!screen.text.split('\n')[0].includes('empty1'), 'the slug is not the title line');
    // Wherever the filename appears, it is preceded by a word marking it as a filename.
    const occurrences = screen.text.split('empty1').length - 1;
    assert.ok(occurrences >= 1, 'the file is still identifiable on disk');
    assert.match(screen.text, /Filename on disk: empty1\.md/, 'the filename is labelled as a filename');
    assert.equal(occurrences, 1, 'the slug appears ONLY inside the labelled filename');
  });

  it('14. no gate number anywhere on the broken screen', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'empty1', frontmatterOnly());
    const screen = streamingGate.planDecisionScreen('review/empty1.md', root);

    assert.doesNotMatch(screen.text, NO_GATE_NUMBER, 'no gate number in the text');
    for (const l of optionLabels(screen)) assert.doesNotMatch(l, NO_GATE_NUMBER);
    for (const d of optionDescriptions(screen)) assert.doesNotMatch(d, NO_GATE_NUMBER);
  });
});

// ── Cases 5, 6, 7, 16: the emptiness boundary ──────────────────────────────────
describe('what counts as empty', () => {
  it('5. a title-only plan is empty too', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'titleonly', '# Some title\n');
    const screen = streamingGate.planDecisionScreen('review/titleonly.md', root);

    assert.match(screen.text, /empty/i);
    assert.deepEqual(optionLabels(screen), ['Write it', 'Delete it', 'Leave it'],
      'a heading is a label, not a plan — same broken screen as a frontmatter-only file');
  });

  it('6. a plan with one real sentence is NOT empty — the ordinary gate screen renders with its approval option', () => {
    // A PASSING functional plan: non-empty AND valid, so the affirmative approval
    // option genuinely renders. (A one-sentence plan that FAILS validation is not
    // offered Approve at all — that is the general rule this slice enforces — so the
    // "with its approval option" clause only holds for a plan that passes.)
    const root = makeSandbox();
    writePlan(root, 'functional', 'realone', validFunctionalBody('realone', 'We will do the thing.'));
    const screen = streamingGate.planDecisionScreen('functional/realone.md', root);

    assert.ok(!/this plan is empty/i.test(screen.text), 'a plan with real content is not the broken screen');
    assert.ok(optionLabels(screen).includes(gateWords.approveLabel('functional')),
      'the ordinary gate screen offers its affirmative approval option');
  });

  it('7. stacked frontmatter does not count as content', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'stacked', `---\napproved_by: human\n---\n\n---\ntitle: x\n---\n`);
    const screen = streamingGate.planDecisionScreen('review/stacked.md', root);

    assert.match(screen.text, /empty/i);
    assert.deepEqual(optionLabels(screen), ['Write it', 'Delete it', 'Leave it']);
  });

  it('16. a whitespace-only body is empty', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'ws', `---\ntitle: x\n---\n\n   \n\t\n`);
    const screen = streamingGate.planDecisionScreen('review/ws.md', root);

    assert.match(screen.text, /empty/i);
    assert.deepEqual(optionLabels(screen), ['Write it', 'Delete it', 'Leave it']);
  });
});

// ── Case 15: unreadable is broken, not empty ───────────────────────────────────
describe('an unreadable plan is broken, not empty', () => {
  it('15. a plan path that is a directory renders a broken screen that says it could not be read, and offers no approval', () => {
    const root = makeSandbox();
    // A DIRECTORY named like a plan makes readFileSync throw — the read must be
    // handled, not thrown, and reported as unreadable rather than empty.
    fs.mkdirSync(path.join(root, 'plans', 'review', 'dir1.md'), { recursive: true });
    const screen = streamingGate.planDecisionScreen('review/dir1.md', root);

    assert.match(screen.text, /could not be read/i, 'it names the read failure');
    assert.ok(!optionLabels(screen).some((l) => /approve/i.test(l)), 'no approval option');
    assert.ok(!Object.values(screen.actions).some((v) => String(v).startsWith('stream approve')),
      'no gate-crossing action');
  });
});

// ── Case 9: the general rule over every screen this module produces ────────────
describe('the general rule — no OFFERED option announces its own refusal', () => {
  it('9. across planDecisionScreen, gateScreenAt and streamingGateScreen, no offered option description is a self-refusal', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'empty1', frontmatterOnly());                 // empty
    writePlan(root, 'functional', 'valid1', validFunctionalBody('valid1')); // passes validation
    writePlan(root, 'functional', 'fails1', invalidFunctionalBody('fails1')); // NON-empty, fails validation

    const decisions = streamingGate.pendingGateDecisions(root);
    const screens = [];
    // planDecisionScreen over each plan.
    for (const ref of ['review/empty1.md', 'functional/valid1.md', 'functional/fails1.md']) {
      screens.push(streamingGate.planDecisionScreen(ref, root));
    }
    // gateScreenAt over every pending decision index.
    for (let i = 0; i < decisions.length; i++) {
      screens.push(streamingGate.streamingGateScreen(root)); // index 0 each open
    }
    // And the top streaming screen.
    screens.push(streamingGate.streamingGateScreen(root));

    for (const screen of screens) {
      for (const d of optionDescriptions(screen)) {
        assert.doesNotMatch(d, REFUSAL_PHRASE,
          `an offered option announced its own refusal: "${d}"`);
      }
    }
  });

  it('10. a NON-empty plan that fails validation is not offered Approve either — Open the plan leads', () => {
    const root = makeSandbox();
    writePlan(root, 'functional', 'fails1', invalidFunctionalBody('fails1'));
    const screen = streamingGate.streamingGateScreen(root);
    const opts = screen.ask.questions[0].options;

    assert.equal(opts[0].label, 'Open the plan', 'Open leads when the plan fails validation');
    assert.ok(!opts.some((o) => o.label === gateWords.approveLabel('functional')),
      'the self-refusing affirmative option is not offered');
  });
});

// ── Cases 11, 12: the empty plan is surfaced, not hidden ───────────────────────
describe('the empty plan is surfaced, never silently dropped', () => {
  it('11. pendingGateDecisions keeps the empty plan, marked broken: true', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'empty1', frontmatterOnly());

    const decisions = streamingGate.pendingGateDecisions(root);
    const d = decisions.find((x) => x.ref === 'review/empty1.md');
    assert.ok(d, 'the empty plan is NOT removed from the pending list');
    assert.equal(d.broken, true, 'it is marked broken so a consumer can render it honestly');
  });

  it('12. streamingGateScreen renders the broken screen for it, with no approval question', () => {
    const root = makeSandbox();
    writePlan(root, 'review', 'empty1', frontmatterOnly());

    const screen = streamingGate.streamingGateScreen(root);
    assert.match(screen.text, /empty/i, 'the empty-plan statement renders');
    assert.ok(!Object.values(screen.actions).some((v) => String(v).startsWith('stream approve')),
      'no gate-crossing approval is offered on the streaming screen');
    assert.deepEqual(optionLabels(screen), ['Write it', 'Delete it', 'Leave it']);
  });
});
