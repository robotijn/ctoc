'use strict';

/**
 * Coverage + behaviour tests for src/tabs/review.js — the "Awaiting Review" tab.
 *
 * These tests pin the DATA/LOGIC decisions the tab makes, not the fact that a
 * string was produced:
 *   - the exact "N pending" count (no singular/plural logic — verbatim length)
 *   - the empty-vs-populated render branch (message + which footer hints appear)
 *   - the Math.max(1, padding) underflow guard (tiny width must not throw)
 *   - stripCtl() sanitisation of the agent-writable plan name in both the action
 *     menu heading and the reject prompt (a bell byte must never survive)
 *   - the directInput-present-vs-absent affordance in renderActions
 *   - the full handleKey state machine: list nav clamps, number-select range gate,
 *     actions-mode separator skip, digit-shortcut-vs-typed-feedback guard, the
 *     dead '5' key, executeAction key→viewType mapping, and both reject paths
 *     (direct feedback = reject, and the reject-input submit) driven end-to-end
 *     against a real tmp fixture so the plan actually moves review -> functional.
 *
 * Boundary: fakes only at the true fs boundary (real tmp project dirs). No mocks
 * of core logic. Destructive reject flows run ONLY against throwaway tmp fixtures,
 * never the real repo.
 *
 * AI-authored, human-reviewed line-by-line.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const review = require('../src/tabs/review');

// ---- fixtures -------------------------------------------------------------

// Create a throwaway project with plans/review/<name>.md for each given name.
// Returns { root, reviewDir, cleanup, planPath(name) }.
function makeProject(planNames = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-review-'));
  const reviewDir = path.join(root, 'plans', 'review');
  fs.mkdirSync(reviewDir, { recursive: true });
  for (const name of planNames) {
    fs.writeFileSync(
      path.join(reviewDir, `${name}.md`),
      `---\ntitle: ${name}\ntype: functional\n---\n\n# ${name}\n`,
      'utf8'
    );
  }
  return {
    root,
    reviewDir,
    planPath: (name) => path.join(reviewDir, `${name}.md`),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true })
  };
}

// A bare key event as node's readline delivers it.
const keySeq = (sequence) => ({ sequence });
const keyName = (name, extra = {}) => ({ name, ...extra });

// =====================================================================
// render() — count, empty/populated branch, footer hints, padding guard
// =====================================================================

test('render: empty review shows the no-items message and the SHORT footer', () => {
  // Arrange
  const proj = makeProject([]);
  try {
    // Act
    const out = review.render({ projectPath: proj.root, width: 100, selectedIndex: 0 });

    // Assert — empty branch: message present, count is exactly "0 pending",
    // and the nav-only hints of the populated footer are ABSENT.
    assert.match(out, /No items awaiting review\./);
    assert.match(out, /0 pending/);
    assert.ok(!out.includes('Enter select'), 'empty footer must not offer Enter select');
    assert.ok(!out.includes('↑/↓ nav'), 'empty footer must not offer up/down nav');
  } finally {
    proj.cleanup();
  }
});

test('render: populated review omits the no-items message and shows the NAV footer', () => {
  // Arrange — three plans awaiting review.
  const proj = makeProject(['alpha', 'bravo', 'charlie']);
  try {
    // Act
    const out = review.render({ projectPath: proj.root, width: 100, selectedIndex: 0 });

    // Assert — populated branch: exact count, no empty message, nav hints present.
    assert.match(out, /3 pending/);
    assert.ok(!out.includes('No items awaiting review.'), 'populated must not show empty message');
    assert.ok(out.includes('Enter select'), 'populated footer must offer Enter select');
    assert.ok(out.includes('↑/↓ nav'), 'populated footer must offer up/down nav');
  } finally {
    proj.cleanup();
  }
});

// The count is `${plans.length} pending` — verbatim, no 0/1/many plural logic.
// Mutating the length expression must change the rendered number.
for (const { n, names, expected } of [
  { n: 0, names: [], expected: '0 pending' },
  { n: 1, names: ['one'], expected: '1 pending' },
  { n: 2, names: ['one', 'two'], expected: '2 pending' }
]) {
  test(`render: count string is exactly "${expected}" for ${n} plan(s)`, () => {
    const proj = makeProject(names);
    try {
      const out = review.render({ projectPath: proj.root, width: 100, selectedIndex: 0 });
      assert.ok(out.includes(expected), `expected "${expected}" in header`);
      // A "1 pending" must not also read as "1 pendings"/pluralised, and a
      // 2-count must not collapse to 1: guard against off-by-one count mutants.
      if (n === 1) assert.ok(!out.includes('0 pending') && !out.includes('2 pending'));
      if (n === 2) assert.ok(!out.includes('1 pending') && !out.includes('3 pending'));
    } finally {
      proj.cleanup();
    }
  });
}

test('render: tiny terminal width does NOT throw (Math.max(1,padding) underflow guard)', () => {
  // Arrange — width so small that (width - 18 - countStr.length) is negative.
  // Without Math.max(1, …) this reaches ' '.repeat(negative) → RangeError.
  const proj = makeProject([]);
  try {
    // Act + Assert — the guard turns the negative into 1 space; render survives.
    let out;
    assert.doesNotThrow(() => {
      out = review.render({ projectPath: proj.root, width: 5, selectedIndex: 0 });
    });
    assert.match(out, /0 pending/);
  } finally {
    proj.cleanup();
  }
});

// =====================================================================
// renderActions() — stripCtl heading + directInput affordance
// =====================================================================

test('renderActions: strips control bytes from the agent-writable plan name', () => {
  // Arrange — a bell (0x07) forged into the plan title. Bell never appears in the
  // colour codes, so its absence uniquely proves stripCtl ran.
  const app = { actionIndex: 0, directInput: '' };
  const plan = { name: 'plan\x07evil' };

  // Act
  const out = review.renderActions(app, plan);

  // Assert
  assert.ok(!out.includes('\x07'), 'bell control byte must be stripped from heading');
  assert.ok(out.includes('planevil'), 'visible characters of the name survive');
});

test('renderActions: shows typed feedback plus a caret when directInput is present', () => {
  // Arrange
  const app = { actionIndex: 0, directInput: 'needs a real fix' };

  // Act
  const out = review.renderActions(app, { name: 'p' });

  // Assert — the SECOND operand of the `if (app.directInput)` branch: echo + caret.
  assert.ok(out.includes('type feedback directly:'), 'prompt label present');
  assert.ok(out.endsWith('needs a real fix_'), 'directInput echoed with trailing caret');
});

test('renderActions: shows a bare caret when directInput is empty', () => {
  // Arrange
  const app = { actionIndex: 0, directInput: '' };

  // Act
  const out = review.renderActions(app, { name: 'p' });

  // Assert — the ELSE operand: only the caret, no echoed feedback text.
  assert.ok(out.endsWith('_'), 'bare caret present');
  assert.ok(!out.includes('needs a real fix'), 'no feedback echoed when directInput empty');
});

// =====================================================================
// renderRejectInput() — stripCtl name + value pass-through
// =====================================================================

test('renderRejectInput: sanitises the plan name and renders the current input value', () => {
  // Arrange
  const app = { selectedPlan: { name: 'rej\x07name' }, inputValue: 'partial reason' };

  // Act
  const out = review.renderRejectInput(app);

  // Assert
  assert.ok(out.includes('Reject:'), 'reject prompt heading present');
  assert.ok(!out.includes('\x07'), 'bell control byte stripped from reject heading');
  assert.ok(out.includes('rejname'), 'visible characters of the name survive');
  assert.ok(out.includes('partial reason'), 'in-progress input value is rendered');
});

test('renderRejectInput: renders with the empty-string fallback when inputValue is absent', () => {
  // The `app.inputValue || ''` falsy arm — must not print "undefined".
  const app = { selectedPlan: { name: 'clean-name' } };

  const out = review.renderRejectInput(app);

  assert.ok(out.includes('Reject:'), 'prompt still renders with no value');
  assert.ok(out.includes('clean-name'), 'name rendered');
  assert.ok(!out.includes('undefined'), 'missing value falls back to empty, never "undefined"');
});

// =====================================================================
// handleKey() — empty guard
// =====================================================================

test('handleKey: returns false and ignores every key when review is empty', () => {
  // Arrange
  const proj = makeProject([]);
  try {
    const app = { projectPath: proj.root, mode: 'list', selectedIndex: 0 };

    // Act + Assert — the early `plans.length === 0` guard short-circuits.
    assert.equal(review.handleKey(keyName('down'), app), false);
    assert.equal(review.handleKey(keyName('return'), app), false);
    assert.equal(app.selectedIndex, 0, 'no state mutated on empty review');
  } finally {
    proj.cleanup();
  }
});

// =====================================================================
// handleKey() — list-mode navigation boundaries + number select
// =====================================================================

test('handleKey list: up clamps at index 0 (does not go negative)', () => {
  const proj = makeProject(['a', 'b']);
  try {
    const app = { projectPath: proj.root, mode: 'list', selectedIndex: 0 };
    assert.equal(review.handleKey(keyName('up'), app), true);
    assert.equal(app.selectedIndex, 0, 'up at top stays at 0');
  } finally {
    proj.cleanup();
  }
});

test('handleKey list: down clamps at the last plan (Math.min(len-1, …))', () => {
  const proj = makeProject(['a', 'b']);
  try {
    const app = { projectPath: proj.root, mode: 'list', selectedIndex: 1 };
    assert.equal(review.handleKey(keyName('down'), app), true);
    assert.equal(app.selectedIndex, 1, 'down at bottom stays at last index');
  } finally {
    proj.cleanup();
  }
});

test('handleKey list: down moves selection forward when not at the end', () => {
  const proj = makeProject(['a', 'b']);
  try {
    const app = { projectPath: proj.root, mode: 'list', selectedIndex: 0 };
    review.handleKey(keyName('down'), app);
    assert.equal(app.selectedIndex, 1);
  } finally {
    proj.cleanup();
  }
});

test('handleKey list: Enter enters actions mode, resets actionIndex, binds selectedPlan', () => {
  const proj = makeProject(['only']);
  try {
    const app = { projectPath: proj.root, mode: 'list', selectedIndex: 0, actionIndex: 4 };
    const handled = review.handleKey(keyName('return'), app);
    assert.equal(handled, true);
    assert.equal(app.mode, 'actions');
    assert.equal(app.actionIndex, 0, 'actionIndex reset to 0 on entry');
    assert.equal(app.directInput, '', 'directInput cleared on entry');
    assert.ok(app.selectedPlan && app.selectedPlan.name === 'only', 'selectedPlan bound from disk');
  } finally {
    proj.cleanup();
  }
});

test('handleKey list: a number within range selects that plan and opens actions', () => {
  const proj = makeProject(['a', 'b']);
  try {
    const app = { projectPath: proj.root, mode: 'list', selectedIndex: 0 };
    const handled = review.handleKey(keySeq('2'), app);
    assert.equal(handled, true);
    assert.equal(app.selectedIndex, 1, 'key "2" selects the 2nd plan (0-based index 1)');
    assert.equal(app.mode, 'actions');
  } finally {
    proj.cleanup();
  }
});

test('handleKey list: a number PAST the plan count is not handled (upper range gate)', () => {
  const proj = makeProject(['a', 'b']);
  try {
    const app = { projectPath: proj.root, mode: 'list', selectedIndex: 0 };
    // Only 2 plans → "3" fails `num <= plans.length`; nothing happens.
    const handled = review.handleKey(keySeq('3'), app);
    assert.equal(handled, false);
    assert.equal(app.mode, 'list', 'out-of-range number leaves mode unchanged');
    assert.equal(app.selectedIndex, 0);
  } finally {
    proj.cleanup();
  }
});

test('handleKey list: "0" (parseInt 0) fails the lower range bound → not handled', () => {
  // num >= 1 lower-bound arm: "0" must not select a plan.
  const proj = makeProject(['a', 'b']);
  try {
    const app = { projectPath: proj.root, mode: 'list', selectedIndex: 0 };
    const handled = review.handleKey(keySeq('0'), app);
    assert.equal(handled, false);
    assert.equal(app.mode, 'list', 'zero does not open actions');
  } finally {
    proj.cleanup();
  }
});

// =====================================================================
// handleKey() — actions mode
// =====================================================================

for (const back of [keyName('escape'), keyName('b'), keySeq('0')]) {
  const id = back.name || `seq:${back.sequence}`;
  test(`handleKey actions: "${id}" returns to list mode and clears directInput`, () => {
    const proj = makeProject(['a']);
    try {
      const app = { projectPath: proj.root, mode: 'actions', actionIndex: 0, directInput: 'x' };
      const handled = review.handleKey(back, app);
      assert.equal(handled, true);
      assert.equal(app.mode, 'list');
      assert.equal(app.directInput, '');
    } finally {
      proj.cleanup();
    }
  });
}

test('handleKey actions: up over the separator lands on the item before it (index 3)', () => {
  // ACTIONS layout: [0..3] items, [4] separator, [5] "Reject".
  const proj = makeProject(['a']);
  try {
    const app = { projectPath: proj.root, mode: 'actions', actionIndex: 5, directInput: '' };
    review.handleKey(keyName('up'), app);
    assert.equal(app.actionIndex, 3, 'separator at index 4 is skipped upward → 3');
  } finally {
    proj.cleanup();
  }
});

test('handleKey actions: down over the separator lands on the item after it (index 5)', () => {
  const proj = makeProject(['a']);
  try {
    const app = { projectPath: proj.root, mode: 'actions', actionIndex: 3, directInput: '' };
    review.handleKey(keyName('down'), app);
    assert.equal(app.actionIndex, 5, 'separator at index 4 is skipped downward → 5');
  } finally {
    proj.cleanup();
  }
});

test('handleKey actions: down onto a non-separator item just advances (no extra skip)', () => {
  // The FALSE arm of the post-move separator check: 0 → 1 is a normal item.
  const proj = makeProject(['a']);
  try {
    const app = { projectPath: proj.root, mode: 'actions', actionIndex: 0, directInput: '' };
    review.handleKey(keyName('down'), app);
    assert.equal(app.actionIndex, 1, 'plain down advances by one');
  } finally {
    proj.cleanup();
  }
});

test('handleKey actions: a multi-byte sequence is NOT appended as feedback (length===1 guard)', () => {
  // An unmapped escape sequence (length 3) must not become feedback text.
  const proj = makeProject(['a']);
  try {
    const app = { projectPath: proj.root, mode: 'actions', actionIndex: 0, directInput: '' };
    const handled = review.handleKey({ sequence: '\x1b[Z' }, app);
    assert.equal(handled, false, 'multi-byte sequence not consumed');
    assert.equal(app.directInput, '', 'nothing appended');
  } finally {
    proj.cleanup();
  }
});

test('handleKey reject-input: a multi-byte sequence is NOT appended to the reason (length===1 guard)', () => {
  const proj = makeProject(['a']);
  try {
    const app = { projectPath: proj.root, mode: 'reject-input', inputValue: '' };
    const handled = review.handleKey({ sequence: '\x1b[Z' }, app);
    assert.equal(handled, false, 'multi-byte sequence not consumed');
    assert.equal(app.inputValue, '', 'nothing appended');
  } finally {
    proj.cleanup();
  }
});

test('handleKey actions: a char below "1" with no directInput is typed as feedback (lower range bound)', () => {
  // A space (0x20) is < "1" (0x31): the digit-shortcut range is NOT entered,
  // so the char falls through to the feedback-append branch.
  const proj = makeProject(['a']);
  try {
    const app = { projectPath: proj.root, mode: 'actions', actionIndex: 0, directInput: '' };
    const handled = review.handleKey(keySeq(' '), app);
    assert.equal(handled, true);
    assert.equal(app.directInput, ' ', 'sub-range char appended as feedback, not run as an action');
    assert.equal(app.mode, 'actions', 'no action fired');
  } finally {
    proj.cleanup();
  }
});

test('handleKey actions: a digit shortcut with NO directInput runs the action', () => {
  const proj = makeProject(['a']);
  try {
    const app = { projectPath: proj.root, mode: 'actions', actionIndex: 0, directInput: '' };
    const handled = review.handleKey(keySeq('4'), app);
    assert.equal(handled, true);
    assert.equal(app.mode, 'view');
    assert.equal(app.viewType, 'code-changes', 'key 4 → code-changes view');
  } finally {
    proj.cleanup();
  }
});

test('handleKey actions: a digit while typing feedback is APPENDED, not treated as a shortcut', () => {
  // The `!app.directInput` guard: once feedback is being typed, digits are text.
  const proj = makeProject(['a']);
  try {
    const app = { projectPath: proj.root, mode: 'actions', actionIndex: 0, directInput: 'v' };
    const handled = review.handleKey(keySeq('2'), app);
    assert.equal(handled, true);
    assert.equal(app.directInput, 'v2', 'digit appended to feedback text');
    assert.equal(app.mode, 'actions', 'stayed in actions mode — no action fired');
    assert.equal(app.viewType, undefined, 'no view opened');
  } finally {
    proj.cleanup();
  }
});

test('handleKey actions: the "5" key is in the digit range but maps to no action → false', () => {
  // '5' passes `>= '1' && <= '6'` yet executeAction('5') hits no case.
  const proj = makeProject(['a']);
  try {
    const app = { projectPath: proj.root, mode: 'actions', actionIndex: 0, directInput: '' };
    const handled = review.handleKey(keySeq('5'), app);
    assert.equal(handled, false, 'dead digit returns false');
    assert.equal(app.mode, 'actions', 'mode unchanged by the dead digit');
  } finally {
    proj.cleanup();
  }
});

test('handleKey actions: a printable char appends to directInput and backspace removes it', () => {
  const proj = makeProject(['a']);
  try {
    const app = { projectPath: proj.root, mode: 'actions', actionIndex: 0, directInput: '' };

    review.handleKey(keySeq('h'), app);
    review.handleKey(keySeq('i'), app);
    assert.equal(app.directInput, 'hi', 'chars accumulate into feedback');

    const handled = review.handleKey(keyName('backspace'), app);
    assert.equal(handled, true);
    assert.equal(app.directInput, 'h', 'backspace removes the last char');
  } finally {
    proj.cleanup();
  }
});

test('handleKey actions: a Ctrl-modified char is NOT typed as feedback (!key.ctrl guard)', () => {
  const proj = makeProject(['a']);
  try {
    const app = { projectPath: proj.root, mode: 'actions', actionIndex: 0, directInput: '' };
    // Ctrl+n arrives as a length-1 sequence but with ctrl:true → must be rejected.
    const handled = review.handleKey({ sequence: 'n', ctrl: true }, app);
    assert.equal(handled, false, 'ctrl combo is not consumed as feedback');
    assert.equal(app.directInput, '', 'nothing appended to feedback buffer');
  } finally {
    proj.cleanup();
  }
});

test('handleKey actions: backspace on an absent directInput yields "" (|| fallback, no throw)', () => {
  const proj = makeProject(['a']);
  try {
    const app = { projectPath: proj.root, mode: 'actions', actionIndex: 0 }; // directInput undefined
    const handled = review.handleKey(keyName('backspace'), app);
    assert.equal(handled, true);
    assert.equal(app.directInput, '', 'undefined buffer coerces to empty string, not a crash');
  } finally {
    proj.cleanup();
  }
});

test('handleKey actions: Enter with NO directInput executes the highlighted action', () => {
  const proj = makeProject(['a']);
  try {
    // actionIndex 0 → ACTIONS[0].key === '1' → functional view.
    const app = { projectPath: proj.root, mode: 'actions', actionIndex: 0, directInput: '' };
    review.handleKey(keyName('return'), app);
    assert.equal(app.mode, 'view');
    assert.equal(app.viewType, 'functional', 'Enter fired the highlighted view action');
  } finally {
    proj.cleanup();
  }
});

// =====================================================================
// executeAction key → viewType mapping (driven through handleKey digits)
// =====================================================================

for (const { key, expected } of [
  { key: '1', expected: 'functional' },
  { key: '2', expected: 'implementation' },
  { key: '3', expected: 'ai-summary' },
  { key: '4', expected: 'code-changes' }
]) {
  test(`executeAction: digit "${key}" opens the "${expected}" view`, () => {
    const proj = makeProject(['a']);
    try {
      const app = { projectPath: proj.root, mode: 'actions', actionIndex: 0, directInput: '' };
      review.handleKey(keySeq(key), app);
      assert.equal(app.mode, 'view');
      assert.equal(app.viewType, expected);
    } finally {
      proj.cleanup();
    }
  });
}

test('executeAction: digit "6" switches to reject-input mode with a cleared value', () => {
  const proj = makeProject(['a']);
  try {
    const app = { projectPath: proj.root, mode: 'actions', actionIndex: 0, directInput: '' };
    review.handleKey(keySeq('6'), app);
    assert.equal(app.mode, 'reject-input');
    assert.equal(app.inputValue, '', 'reject buffer starts empty');
  } finally {
    proj.cleanup();
  }
});

// =====================================================================
// handleKey() — reject flows (end-to-end against a tmp fixture)
// =====================================================================

test('handleKey actions: Enter WITH directInput rejects the plan (review -> functional)', () => {
  // Direct feedback == reject. Destructive move, but only on the throwaway fixture.
  const proj = makeProject(['broken-plan']);
  try {
    const app = {
      projectPath: proj.root,
      mode: 'actions',
      actionIndex: 0,
      directInput: 'this ships a bug',
      selectedPlan: { path: proj.planPath('broken-plan'), name: 'broken-plan' }
    };

    const handled = review.handleKey(keyName('return'), app);

    assert.equal(handled, true);
    assert.equal(app.mode, 'list', 'returns to the list after reject');
    assert.equal(app.directInput, '', 'feedback buffer cleared');
    assert.match(app.message, /rejected/, 'confirmation message names the rejection');
    // The plan physically moved out of review and into functional drafts.
    assert.ok(!fs.existsSync(proj.planPath('broken-plan')), 'plan left the review dir');
    assert.ok(
      fs.existsSync(path.join(proj.root, 'plans', 'functional', 'broken-plan.md')),
      'plan landed in functional drafts'
    );
  } finally {
    proj.cleanup();
  }
});

test('handleKey reject-input: Enter with a reason rejects the plan (review -> functional)', () => {
  const proj = makeProject(['needs-work']);
  try {
    const app = {
      projectPath: proj.root,
      mode: 'reject-input',
      inputValue: 'missing error handling',
      selectedPlan: { path: proj.planPath('needs-work'), name: 'needs-work' }
    };

    const handled = review.handleKey(keyName('return'), app);

    assert.equal(handled, true);
    assert.equal(app.mode, 'list');
    assert.equal(app.inputValue, '', 'reject buffer cleared');
    assert.match(app.message, /rejected/);
    assert.ok(!fs.existsSync(proj.planPath('needs-work')), 'plan left review');
    assert.ok(
      fs.existsSync(path.join(proj.root, 'plans', 'functional', 'needs-work.md')),
      'plan landed in functional'
    );
  } finally {
    proj.cleanup();
  }
});

test('handleKey reject-input: Enter with an EMPTY reason does nothing (no move, no false-reject)', () => {
  const proj = makeProject(['keep-me']);
  try {
    const app = {
      projectPath: proj.root,
      mode: 'reject-input',
      inputValue: '',
      selectedPlan: { path: proj.planPath('keep-me'), name: 'keep-me' }
    };

    // A bare return event (no `sequence`) → the printable branch cannot append it.
    const handled = review.handleKey(keyName('return'), app);

    assert.equal(handled, false, 'empty-reason Enter is not handled');
    assert.equal(app.mode, 'reject-input', 'stays in reject-input');
    assert.ok(fs.existsSync(proj.planPath('keep-me')), 'plan was NOT rejected/moved');
  } finally {
    proj.cleanup();
  }
});

test('handleKey reject-input: Escape returns to actions and clears the buffer', () => {
  const proj = makeProject(['a']);
  try {
    const app = { projectPath: proj.root, mode: 'reject-input', inputValue: 'half typed' };
    const handled = review.handleKey(keyName('escape'), app);
    assert.equal(handled, true);
    assert.equal(app.mode, 'actions');
    assert.equal(app.inputValue, '');
  } finally {
    proj.cleanup();
  }
});

test('handleKey reject-input: a Ctrl-modified char is NOT typed into the reason (!key.ctrl guard)', () => {
  const proj = makeProject(['a']);
  try {
    const app = { projectPath: proj.root, mode: 'reject-input', inputValue: '' };
    const handled = review.handleKey({ sequence: 'c', ctrl: true }, app);
    assert.equal(handled, false, 'ctrl combo is not consumed as reason text');
    assert.equal(app.inputValue, '', 'nothing appended to the reason buffer');
  } finally {
    proj.cleanup();
  }
});

test('handleKey reject-input: backspace on an absent inputValue yields "" (|| fallback, no throw)', () => {
  const proj = makeProject(['a']);
  try {
    const app = { projectPath: proj.root, mode: 'reject-input' }; // inputValue undefined
    const handled = review.handleKey(keyName('backspace'), app);
    assert.equal(handled, true);
    assert.equal(app.inputValue, '', 'undefined reason buffer coerces to empty string');
  } finally {
    proj.cleanup();
  }
});

test('handleKey reject-input: a printable char appends and backspace removes it', () => {
  const proj = makeProject(['a']);
  try {
    const app = { projectPath: proj.root, mode: 'reject-input', inputValue: '' };

    review.handleKey(keySeq('n'), app);
    review.handleKey(keySeq('o'), app);
    assert.equal(app.inputValue, 'no', 'chars accumulate into the reason');

    review.handleKey(keyName('backspace'), app);
    assert.equal(app.inputValue, 'n', 'backspace trims the reason');
  } finally {
    proj.cleanup();
  }
});
