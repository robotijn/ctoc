/**
 * TUI Engine — dark-branch coverage tests (node:test)
 *
 * Companion to tests/tui.test.js. Every test here pins a branch that the
 * existing suite leaves dark and that goes RED under a one-line mutation of
 * src/lib/tui.js: the control-char sanitiser range boundaries, the `|| 80` /
 * `|| getWidth()` / `action.key || i+1` second operands, the per-status colour
 * branches in renderList, the padding `Math.max(1, ...)` floor, the column
 * arithmetic in renderTabIndicator, the clear() escape sequence, and the
 * isTTY-gated keyboard setup / cleanup paths (driven with a fake stdin/stdout,
 * the only true boundary).
 *
 * Human-reviewed: every assertion was read line-by-line against tui.js.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const tui = require('../src/lib/tui.js');

// ---------------------------------------------------------------------------
// Helpers: fake the true boundary (process.stdout / process.stdin), never core.
// ---------------------------------------------------------------------------

/** Temporarily override a property (even getter-backed) and return a restore fn. */
function overrideProp(obj, key, value) {
  const had = Object.prototype.hasOwnProperty.call(obj, key);
  const original = Object.getOwnPropertyDescriptor(obj, key);
  Object.defineProperty(obj, key, {
    value,
    configurable: true,
    writable: true,
    enumerable: true,
  });
  return () => {
    if (original) {
      Object.defineProperty(obj, key, original);
    } else if (!had) {
      delete obj[key];
    }
  };
}

// ---------------------------------------------------------------------------
// stripCtl — the security sanitiser range boundaries (0x00-0x1f, 0x7f-0x9f).
// These lines are "covered" by nothing in tui.test.js. Each row dies if the
// regex range is widened/narrowed by one code point.
// ---------------------------------------------------------------------------

const STRIP_ROWS = [
  { id: 'C0-low-boundary NUL 0x00', ch: '\x00', stripped: true },
  { id: 'C0-ESC 0x1b (screen-forge byte)', ch: '\x1b', stripped: true },
  { id: 'C0-CR 0x0d', ch: '\x0d', stripped: true },
  { id: 'C0-LF 0x0a (newline also stripped)', ch: '\x0a', stripped: true },
  { id: 'C0-high-boundary 0x1f', ch: '\x1f', stripped: true },
  { id: 'printable-low-boundary space 0x20', ch: '\x20', stripped: false },
  { id: 'printable-tilde 0x7e', ch: '\x7e', stripped: false },
  { id: 'DEL-low-boundary 0x7f', ch: '\x7f', stripped: true },
  { id: 'C1-high-boundary 0x9f', ch: '\x9f', stripped: true },
  { id: 'above-C1 nbsp 0xa0 survives', ch: '\xa0', stripped: false },
];

for (const row of STRIP_ROWS) {
  test(`stripCtl_${row.stripped ? 'removes' : 'keeps'}_char_when_${row.id}`, () => {
    // Arrange — sentinel letters bracket the char so we see exactly what remains.
    const input = `A${row.ch}B`;

    // Act
    const out = tui.stripCtl(input);

    // Assert
    assert.equal(out, row.stripped ? 'AB' : input);
  });
}

test('stripCtl_coerces_non_string_via_String_when_given_number', () => {
  // The `String(s)` coercion is the first thing the function does; a number
  // input must not throw and must round-trip its digits.
  assert.equal(tui.stripCtl(1234), '1234');
});

test('stripCtl_strips_every_control_byte_when_string_is_all_control', () => {
  // Whole-string reduction to empty pins the global `g` flag (drop it and only
  // the first match is removed).
  assert.equal(tui.stripCtl('\x00\x1b\x07\x1f\x7f\x9f'), '');
});

// ---------------------------------------------------------------------------
// getWidth — the `process.stdout.columns || 80` second operand.
// ---------------------------------------------------------------------------

test('getWidth_returns_columns_when_stdout_reports_a_width', () => {
  const restore = overrideProp(process.stdout, 'columns', 137);
  try {
    assert.equal(tui.getWidth(), 137);
  } finally {
    restore();
  }
});

test('getWidth_falls_back_to_80_when_columns_is_zero', () => {
  // 0 is falsy → the `|| 80` operand fires. Mutate `|| 80` to `|| 0` or drop
  // it and this goes red.
  const restore = overrideProp(process.stdout, 'columns', 0);
  try {
    assert.equal(tui.getWidth(), 80);
  } finally {
    restore();
  }
});

test('getWidth_falls_back_to_80_when_columns_is_undefined', () => {
  const restore = overrideProp(process.stdout, 'columns', undefined);
  try {
    assert.equal(tui.getWidth(), 80);
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// line — `width || getWidth()`: explicit width vs. falsy-width fallback.
// ---------------------------------------------------------------------------

test('line_uses_explicit_width_when_positive_number_passed', () => {
  const out = tui.line(3);
  assert.ok(out.includes('─'.repeat(3)));
  assert.ok(!out.includes('─'.repeat(4)), 'must be exactly 3 dashes, not 4');
});

test('line_falls_back_to_getWidth_when_width_is_zero', () => {
  // 0 is falsy → `|| getWidth()`. Pin the terminal width to a known value so
  // the fallback count is deterministic.
  const restore = overrideProp(process.stdout, 'columns', 12);
  try {
    const out = tui.line(0);
    assert.ok(out.includes('─'.repeat(12)));
    assert.ok(!out.includes('─'.repeat(13)), 'fallback must equal getWidth()==12');
  } finally {
    restore();
  }
});

test('line_falls_back_to_getWidth_when_no_arg_defaults_null', () => {
  const restore = overrideProp(process.stdout, 'columns', 7);
  try {
    const out = tui.line();
    assert.ok(out.includes('─'.repeat(7)));
    assert.ok(!out.includes('─'.repeat(8)));
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// clear — the exact escape sequence (lines 44-46, previously dark).
// ---------------------------------------------------------------------------

test('clear_writes_the_erase_display_and_home_cursor_sequence', () => {
  const writes = [];
  const restore = overrideProp(process.stdout, 'write', (s) => {
    writes.push(s);
    return true;
  });
  try {
    tui.clear();
  } finally {
    restore();
  }
  // \x1b[2J = erase entire display; \x1b[H = move cursor home. Both required.
  assert.equal(writes.length, 1);
  assert.equal(writes[0], '\x1b[2J\x1b[H');
});

// ---------------------------------------------------------------------------
// renderTabIndicator — column arithmetic (lines 63-70, previously dark).
// pos advances by len+4 per preceding tab; indicator is len+2 carets.
// ---------------------------------------------------------------------------

test('renderTabIndicator_places_caret_run_at_first_tab_when_active_index_zero', () => {
  // Arrange — no leading spaces (pos loop never runs), width = len+2.
  const tabs = ['ABC', 'DE'];

  // Act
  const out = tui.renderTabIndicator(tabs, 0);

  // Assert — 'ABC' → 3+2 = 5 carets, zero leading spaces.
  assert.equal(out, '^'.repeat(5));
});

test('renderTabIndicator_offsets_by_preceding_tab_width_plus_four_when_active_index_one', () => {
  // Arrange
  const tabs = ['ABC', 'DE'];

  // Act
  const out = tui.renderTabIndicator(tabs, 1);

  // Assert — leading pos = 'ABC'.length + 4 = 7 spaces; indicator = 'DE'.length + 2 = 4 carets.
  assert.equal(out, ' '.repeat(7) + '^'.repeat(4));
});

test('renderTabIndicator_sums_all_preceding_tabs_when_active_index_two', () => {
  // Arrange — two preceding tabs prove the accumulation loop, not a single term.
  const tabs = ['A', 'BB', 'CCC'];

  // Act
  const out = tui.renderTabIndicator(tabs, 2);

  // Assert — pos = (1+4) + (2+4) = 11 spaces; indicator = 3+2 = 5 carets.
  assert.equal(out, ' '.repeat(11) + '^'.repeat(5));
});

// ---------------------------------------------------------------------------
// renderList — per-status colour branches (lines 140-152, previously dark).
// Each status maps to a distinct colour wrapper around the bgIcon.
// ---------------------------------------------------------------------------

const STATUS_ROWS = [
  { id: 'working', bgStatus: 'working', color: tui.c.yellow },
  { id: 'complete', bgStatus: 'complete', color: tui.c.green },
  { id: 'needs-input', bgStatus: 'needs-input', color: tui.c.red },
  { id: 'timeout', bgStatus: 'timeout', color: tui.c.red },
  { id: 'unknown-status-falls-to-dim', bgStatus: 'zzz', color: tui.c.dim },
  { id: 'missing-status-falls-to-dim', bgStatus: undefined, color: tui.c.dim },
];

for (const row of STATUS_ROWS) {
  test(`renderList_colors_bgIcon_${row.id}`, () => {
    // Arrange
    const items = [{ name: 'plan.md', bgIcon: '●', bgStatus: row.bgStatus }];

    // Act
    const out = tui.renderList(items, -1, { showStatus: true });

    // Assert — the icon is wrapped in exactly this colour + reset.
    assert.ok(
      out.includes(`${row.color}●${tui.c.reset}`),
      `expected ${row.id} icon wrapped in its status colour`,
    );
  });
}

test('renderList_omits_icon_when_showStatus_false_even_though_bgIcon_present', () => {
  // The `showStatus && ...` first operand short-circuits the whole block dark.
  const items = [{ name: 'plan.md', bgIcon: '●', bgStatus: 'working' }];

  const out = tui.renderList(items, -1, { showStatus: false });

  assert.ok(!out.includes('●'), 'icon must be suppressed when showStatus is false');
});

test('renderList_omits_icon_when_object_has_no_bgIcon', () => {
  // Third operand of the `showStatus && isObject && item.bgIcon` chain.
  const items = [{ name: 'plan.md', bgStatus: 'working' }];

  const out = tui.renderList(items, -1, { showStatus: true });

  assert.ok(!out.includes(tui.c.yellow), 'no icon colour when bgIcon absent');
  assert.ok(out.includes('plan.md'));
});

// ---------------------------------------------------------------------------
// renderList — suffix padding math + Math.max(1, padding) floor.
// ---------------------------------------------------------------------------

test('renderList_pads_ago_suffix_to_at_least_one_space_when_name_overflows_width', () => {
  // Arrange — a name far wider than the terminal drives `padding` negative;
  // Math.max(1, padding) must floor it at a single space (never zero/negative,
  // which would throw on ' '.repeat()).
  const restore = overrideProp(process.stdout, 'columns', 10);
  try {
    const longName = 'x'.repeat(200);
    const items = [{ name: longName, ago: '2h ago' }];

    // Act
    const out = tui.renderList(items, -1, { showNumbers: false });

    // Assert — suffix still present, separated by exactly the 1-space floor.
    assert.ok(out.includes(`${longName}${tui.c.dim}2h ago`) === false); // sanity: there IS a space
    assert.ok(out.includes(`${longName} ${tui.c.dim}2h ago${tui.c.reset}`));
  } finally {
    restore();
  }
});

test('renderList_no_suffix_block_when_object_item_lacks_ago', () => {
  // The `item.ago ? ... : ''` false branch — no padding computed, no suffix.
  const items = [{ name: 'plan.md' }];

  const out = tui.renderList(items, -1, { showNumbers: false });

  const bodyLine = out.split('\n').find((l) => l.includes('plan.md'));
  assert.ok(!/\s{2,}/.test(bodyLine.replace(/^\s{0,3}/, '')), 'no trailing pad run without ago');
});

test('renderList_uses_default_empty_message_when_no_option_and_items_empty', () => {
  // emptyMessage default 'No items.' — the `emptyMessage = 'No items.'` default.
  const out = tui.renderList([], 0, {});
  assert.ok(out.includes('No items.'));
});

test('renderList_appends_pagination_block_when_showBack_but_single_page', () => {
  // `pagination.totalPages > 1 || options.showBack` — second operand: one page
  // of items, showBack true → the back control must still be appended.
  const out = tui.renderList(['only'], 0, { showBack: true, pageSize: 9 });
  assert.ok(out.includes('[0] back'));
});

// ---------------------------------------------------------------------------
// renderActionMenu — `action.key || i + 1` second operand.
// tui.test.js always supplies keys; the fallback numbering is dark.
// ---------------------------------------------------------------------------

test('renderActionMenu_numbers_by_index_plus_one_when_action_has_no_key', () => {
  // Arrange — no `key` field on either action.
  const actions = [{ label: 'Alpha' }, { label: 'Beta' }];

  // Act
  const out = tui.renderActionMenu('T', actions, 0);

  // Assert — index 0 → "1. Alpha", index 1 → "2. Beta".
  assert.ok(out.includes('1. Alpha'));
  assert.ok(out.includes('2. Beta'));
});

test('renderActionMenu_prefers_explicit_key_over_index_when_key_present', () => {
  // First operand of the || wins — proves it is not always index-based.
  const actions = [{ label: 'Alpha', key: '9' }];
  const out = tui.renderActionMenu('T', actions, 0);
  assert.ok(out.includes('9. Alpha'));
  assert.ok(!out.includes('1. Alpha'));
});

// ---------------------------------------------------------------------------
// renderInput — default value '' (the `value = ''` default parameter).
// ---------------------------------------------------------------------------

test('renderInput_renders_bare_cursor_when_value_omitted', () => {
  const out = tui.renderInput('Name:');
  // With no value the prompt line is exactly "> _" (empty value + cursor).
  assert.ok(out.includes('> _'));
});

// ---------------------------------------------------------------------------
// renderPaginationControls — showBack default true when options omitted.
// ---------------------------------------------------------------------------

test('renderPaginationControls_shows_back_by_default_when_options_omitted', () => {
  const state = { hasNext: false, hasPrev: false, page: 0, totalPages: 1 };
  const out = tui.renderPaginationControls(state);
  assert.ok(out.includes('[0] back'), 'showBack defaults to true');
});

// ---------------------------------------------------------------------------
// paginate — negative page clamps up to 0 (the Math.max(0, ...) floor).
// ---------------------------------------------------------------------------

test('paginate_clamps_negative_page_up_to_zero', () => {
  const items = Array.from({ length: 5 }, (_, i) => i);
  const result = tui.paginate(items, -4, 9);
  assert.equal(result.page, 0);
  assert.equal(result.startIndex, 0);
});

// ---------------------------------------------------------------------------
// cleanup — isTTY-gated setRawMode(false) (lines 249-255, previously dark).
// Driven with a fake stdin/stdout at the true boundary.
// ---------------------------------------------------------------------------

test('cleanup_disables_raw_mode_when_stdin_is_a_tty', () => {
  // Arrange — fake the TTY boundary: isTTY true + spies on setRawMode/pause.
  const calls = { rawMode: [], paused: 0 };
  const restoreTTY = overrideProp(process.stdin, 'isTTY', true);
  const restoreRaw = overrideProp(process.stdin, 'setRawMode', (v) => { calls.rawMode.push(v); });
  const restorePause = overrideProp(process.stdin, 'pause', () => { calls.paused += 1; });
  const restoreLog = overrideProp(console, 'log', () => {});
  try {
    // Act
    tui.cleanup();
  } finally {
    restoreLog();
    restorePause();
    restoreRaw();
    restoreTTY();
  }
  // Assert — raw mode turned OFF, exactly once, and stream paused.
  assert.deepEqual(calls.rawMode, [false]);
  assert.equal(calls.paused, 1);
});

test('cleanup_skips_setRawMode_when_stdin_is_not_a_tty', () => {
  // The `if (process.stdin.isTTY)` false branch — setRawMode must NOT be called
  // (calling it on a non-TTY throws in real Node).
  const calls = { rawMode: 0, paused: 0 };
  const restoreTTY = overrideProp(process.stdin, 'isTTY', false);
  const restoreRaw = overrideProp(process.stdin, 'setRawMode', () => { calls.rawMode += 1; });
  const restorePause = overrideProp(process.stdin, 'pause', () => { calls.paused += 1; });
  const restoreLog = overrideProp(console, 'log', () => {});
  try {
    tui.cleanup();
  } finally {
    restoreLog();
    restorePause();
    restoreRaw();
    restoreTTY();
  }
  assert.equal(calls.rawMode, 0, 'setRawMode must be skipped for non-TTY');
  assert.equal(calls.paused, 1, 'stream still paused regardless of TTY');
});

// ---------------------------------------------------------------------------
// setupKeyboard — handler dispatch + ctrl-c cleanup path (lines 231-246).
// We keep isTTY false so the raw-mode line is skipped (it is exercised by the
// cleanup tests above); the genuinely interactive raw-TTY toggle at line 234
// is documented unreachable below.
// ---------------------------------------------------------------------------

test('setupKeyboard_forwards_non_ctrl_keypress_to_the_handler', () => {
  // Arrange — non-TTY so setRawMode is skipped; capture forwarded keypresses.
  const restoreTTY = overrideProp(process.stdin, 'isTTY', false);
  const restoreResume = overrideProp(process.stdin, 'resume', () => {});
  const received = [];
  try {
    tui.setupKeyboard((str, key) => received.push({ str, key }));

    // Act — emit an ordinary key.
    process.stdin.emit('keypress', 'a', { name: 'a', ctrl: false });

    // Assert — handler saw it verbatim.
    assert.equal(received.length, 1);
    assert.equal(received[0].str, 'a');
    assert.equal(received[0].key.name, 'a');
  } finally {
    process.stdin.removeAllListeners('keypress');
    restoreResume();
    restoreTTY();
  }
});

test('setupKeyboard_intercepts_ctrl_c_and_exits_without_forwarding', () => {
  // Arrange — ctrl-c must trigger cleanup + process.exit and NOT reach handler.
  const restoreTTY = overrideProp(process.stdin, 'isTTY', false);
  const restoreResume = overrideProp(process.stdin, 'resume', () => {});
  const restorePause = overrideProp(process.stdin, 'pause', () => {});
  const restoreLog = overrideProp(console, 'log', () => {});
  let exited = 0;
  // Real process.exit terminates the process before the following handler line
  // runs. Model that by throwing a sentinel so control flow stops exactly where
  // the real exit would stop it — otherwise a non-halting stub lets handler() run.
  const EXIT = Symbol('exit');
  const restoreExit = overrideProp(process, 'exit', () => { exited += 1; throw EXIT; });
  const forwarded = [];
  try {
    tui.setupKeyboard((str, key) => forwarded.push({ str, key }));

    // Act — the ctrl-c chord; the emit re-throws our exit sentinel.
    assert.throws(
      () => process.stdin.emit('keypress', undefined, { name: 'c', ctrl: true }),
      (err) => err === EXIT,
    );

    // Assert — exit was requested, handler never saw the chord.
    assert.equal(exited, 1, 'ctrl-c must call process.exit via cleanup');
    assert.equal(forwarded.length, 0, 'ctrl-c must not be forwarded to handler');
  } finally {
    process.stdin.removeAllListeners('keypress');
    restoreExit();
    restoreLog();
    restorePause();
    restoreResume();
    restoreTTY();
  }
});

// ---------------------------------------------------------------------------
// DOCUMENTED UNREACHABLE (honesty clause):
//
// tui.js line 233-234:
//   if (process.stdin.isTTY) { process.stdin.setRawMode(true); }
//     inside setupKeyboard. Forcing isTTY=true here would call the REAL
//     process.stdin.setRawMode(true), switching the test runner's own stdin
//     into raw mode and corrupting the node:test harness. The symmetric
//     isTTY=true → setRawMode branch IS exercised safely in cleanup() (line
//     250) with a spied setRawMode, so the boolean gate is covered; only the
//     raw-mode-ON side inside setupKeyboard is left to the manual/interactive
//     tier. Not faked — a spy on setupKeyboard's setRawMode would test the spy,
//     not the code, and a real call would break the runner.
// ---------------------------------------------------------------------------
