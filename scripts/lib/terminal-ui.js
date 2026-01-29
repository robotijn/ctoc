/**
 * CTOC Terminal UI Module
 * Consistent terminal output formatting across all scripts
 *
 * Features:
 * - Dynamic terminal width detection
 * - Box drawing with multiple styles
 * - Tables with pros/cons format
 * - Progress bars for Iron Loop steps
 * - Menus with numbered options
 * - Cross-platform terminal write
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// ANSI Color Codes (no external dependencies)
// ============================================================================

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  orange: '\x1b[38;5;208m',
  gray: '\x1b[90m',

  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m'
};

// ============================================================================
// Color Helper Functions
// ============================================================================

const colors = {
  reset: (str) => `${ANSI.reset}${str}${ANSI.reset}`,
  bold: (str) => `${ANSI.bold}${str}${ANSI.reset}`,
  dim: (str) => `${ANSI.dim}${str}${ANSI.reset}`,
  italic: (str) => `${ANSI.italic}${str}${ANSI.reset}`,
  underline: (str) => `${ANSI.underline}${str}${ANSI.reset}`,

  black: (str) => `${ANSI.black}${str}${ANSI.reset}`,
  red: (str) => `${ANSI.red}${str}${ANSI.reset}`,
  green: (str) => `${ANSI.green}${str}${ANSI.reset}`,
  yellow: (str) => `${ANSI.yellow}${str}${ANSI.reset}`,
  blue: (str) => `${ANSI.blue}${str}${ANSI.reset}`,
  magenta: (str) => `${ANSI.magenta}${str}${ANSI.reset}`,
  cyan: (str) => `${ANSI.cyan}${str}${ANSI.reset}`,
  white: (str) => `${ANSI.white}${str}${ANSI.reset}`,
  orange: (str) => `${ANSI.orange}${str}${ANSI.reset}`,
  gray: (str) => `${ANSI.gray}${str}${ANSI.reset}`,

  // Background variants
  bgRed: (str) => `${ANSI.bgRed}${str}${ANSI.reset}`,
  bgGreen: (str) => `${ANSI.bgGreen}${str}${ANSI.reset}`,
  bgYellow: (str) => `${ANSI.bgYellow}${str}${ANSI.reset}`,
  bgBlue: (str) => `${ANSI.bgBlue}${str}${ANSI.reset}`,
  bgCyan: (str) => `${ANSI.bgCyan}${str}${ANSI.reset}`,

  // Semantic colors
  success: (str) => `${ANSI.green}${str}${ANSI.reset}`,
  error: (str) => `${ANSI.red}${str}${ANSI.reset}`,
  warning: (str) => `${ANSI.yellow}${str}${ANSI.reset}`,
  info: (str) => `${ANSI.cyan}${str}${ANSI.reset}`,
  muted: (str) => `${ANSI.gray}${str}${ANSI.reset}`
};

// ============================================================================
// Box Drawing Characters
// ============================================================================

const BOX_STYLES = {
  single: {
    topLeft: '\u250C',     // ┌
    topRight: '\u2510',    // ┐
    bottomLeft: '\u2514',  // └
    bottomRight: '\u2518', // ┘
    horizontal: '\u2500',  // ─
    vertical: '\u2502',    // │
    teeDown: '\u252C',     // ┬
    teeUp: '\u2534',       // ┴
    teeRight: '\u251C',    // ├
    teeLeft: '\u2524',     // ┤
    cross: '\u253C'        // ┼
  },
  double: {
    topLeft: '\u2554',     // ╔
    topRight: '\u2557',    // ╗
    bottomLeft: '\u255A',  // ╚
    bottomRight: '\u255D', // ╝
    horizontal: '\u2550',  // ═
    vertical: '\u2551',    // ║
    teeDown: '\u2566',     // ╦
    teeUp: '\u2569',       // ╩
    teeRight: '\u2560',    // ╠
    teeLeft: '\u2563',     // ╣
    cross: '\u256C'        // ╬
  },
  rounded: {
    topLeft: '\u256D',     // ╭
    topRight: '\u256E',    // ╮
    bottomLeft: '\u2570',  // ╰
    bottomRight: '\u256F', // ╯
    horizontal: '\u2500',  // ─
    vertical: '\u2502',    // │
    teeDown: '\u252C',     // ┬
    teeUp: '\u2534',       // ┴
    teeRight: '\u251C',    // ├
    teeLeft: '\u2524',     // ┤
    cross: '\u253C'        // ┼
  }
};

// ============================================================================
// Common Emoji/Symbols
// ============================================================================

const EMOJI = {
  check: '\u2713',      // ✓
  cross: '\u2717',      // ✗
  warning: '\u26A0',    // ⚠
  info: '\u2139',       // ℹ
  arrow: '\u2192',      // →
  bullet: '\u2022',     // •
  star: '\u2605',       // ★
  circle: '\u25CF',     // ●
  square: '\u25A0',     // ■
  block: '\u2588',      // █
  blockLight: '\u2591', // ░
  blockMed: '\u2592',   // ▒
  blockDark: '\u2593'   // ▓
};

// ============================================================================
// Terminal Utilities
// ============================================================================

/**
 * Gets the terminal width, with fallback
 * @returns {number} Terminal width in columns
 */
function getWidth() {
  return process.stdout.columns || 80;
}

/**
 * Gets the terminal height, with fallback
 * @returns {number} Terminal height in rows
 */
function getHeight() {
  return process.stdout.rows || 24;
}

/**
 * Write directly to terminal, bypassing stdout/stderr capture
 * This allows output to be visible even when hooks capture stdout
 * @param {string} message - Message to write
 * @returns {boolean} True if written to TTY, false if fallback used
 */
function writeToTerminal(message) {
  const isWindows = process.platform === 'win32';
  const terminalDevice = isWindows ? 'CONOUT$' : '/dev/tty';

  try {
    const fd = fs.openSync(terminalDevice, 'w');
    fs.writeSync(fd, message);
    fs.closeSync(fd);
    return true;
  } catch (e) {
    // Fallback to stderr (will go to Claude's context, but at least logged)
    process.stderr.write(message);
    return false;
  }
}

/**
 * Strips ANSI codes from a string (for length calculation)
 * @param {string} str - String with potential ANSI codes
 * @returns {string} String without ANSI codes
 */
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Gets visible length of a string (excluding ANSI codes)
 * @param {string} str - String to measure
 * @returns {number} Visible length
 */
function visibleLength(str) {
  return stripAnsi(str).length;
}

/**
 * Pads string to length, accounting for ANSI codes
 * @param {string} str - String to pad
 * @param {number} length - Target length
 * @param {string} char - Padding character (default: space)
 * @returns {string} Padded string
 */
function padEnd(str, length, char = ' ') {
  const visible = visibleLength(str);
  if (visible >= length) return str;
  return str + char.repeat(length - visible);
}

/**
 * Pads string to length from start, accounting for ANSI codes
 * @param {string} str - String to pad
 * @param {number} length - Target length
 * @param {string} char - Padding character (default: space)
 * @returns {string} Padded string
 */
function padStart(str, length, char = ' ') {
  const visible = visibleLength(str);
  if (visible >= length) return str;
  return char.repeat(length - visible) + str;
}

/**
 * Centers string within length, accounting for ANSI codes
 * @param {string} str - String to center
 * @param {number} length - Target length
 * @param {string} char - Padding character (default: space)
 * @returns {string} Centered string
 */
function center(str, length, char = ' ') {
  const visible = visibleLength(str);
  if (visible >= length) return str;
  const leftPad = Math.floor((length - visible) / 2);
  const rightPad = length - visible - leftPad;
  return char.repeat(leftPad) + str + char.repeat(rightPad);
}

// ============================================================================
// Box Drawing
// ============================================================================

/**
 * Creates a box around content
 * @param {string|string[]} content - Content to put in box (string or array of lines)
 * @param {Object} options - Options
 * @param {number} options.width - Box width (default: terminal width)
 * @param {string} options.style - Box style: 'single', 'double', 'rounded' (default: 'double')
 * @param {number} options.padding - Horizontal padding inside box (default: 1)
 * @param {string} options.title - Optional title for top of box
 * @returns {string} Box as string
 */
function box(content, options = {}) {
  const width = options.width || getWidth();
  const style = BOX_STYLES[options.style] || BOX_STYLES.double;
  const padding = options.padding !== undefined ? options.padding : 1;
  const title = options.title || '';

  const lines = Array.isArray(content) ? content : content.split('\n');
  const innerWidth = width - 2 - (padding * 2);

  const result = [];

  // Top border with optional title
  if (title) {
    const titlePadded = ` ${title} `;
    const remainingWidth = width - 2 - visibleLength(titlePadded);
    const leftBorder = Math.floor(remainingWidth / 2);
    result.push(
      style.topLeft +
      style.horizontal.repeat(leftBorder) +
      titlePadded +
      style.horizontal.repeat(remainingWidth - leftBorder) +
      style.topRight
    );
  } else {
    result.push(style.topLeft + style.horizontal.repeat(width - 2) + style.topRight);
  }

  // Content lines
  const pad = ' '.repeat(padding);
  for (const line of lines) {
    const paddedLine = pad + padEnd(line, innerWidth) + pad;
    result.push(style.vertical + paddedLine + style.vertical);
  }

  // Bottom border
  result.push(style.bottomLeft + style.horizontal.repeat(width - 2) + style.bottomRight);

  return result.join('\n');
}

// ============================================================================
// Tables
// ============================================================================

/**
 * Creates a simple table
 * @param {Array<Object>} rows - Array of row objects
 * @param {Array<Object>} columns - Column definitions [{key, label, width}]
 * @param {Object} options - Options
 * @returns {string} Table as string
 */
function table(rows, columns, options = {}) {
  const style = BOX_STYLES[options.style] || BOX_STYLES.single;

  // Calculate column widths if not specified
  for (const col of columns) {
    if (!col.width) {
      col.width = Math.max(
        visibleLength(col.label || col.key),
        ...rows.map(r => visibleLength(String(r[col.key] || '')))
      );
    }
  }

  const totalWidth = columns.reduce((sum, col) => sum + col.width + 3, 0) + 1;
  const lines = [];

  // Header
  const headerCells = columns.map(col => ' ' + padEnd(col.label || col.key, col.width) + ' ');
  lines.push(style.topLeft + columns.map((col, i) =>
    style.horizontal.repeat(col.width + 2) +
    (i < columns.length - 1 ? style.teeDown : '')
  ).join('') + style.topRight);
  lines.push(style.vertical + headerCells.join(style.vertical) + style.vertical);
  lines.push(style.teeRight + columns.map((col, i) =>
    style.horizontal.repeat(col.width + 2) +
    (i < columns.length - 1 ? style.cross : '')
  ).join('') + style.teeLeft);

  // Rows
  for (const row of rows) {
    const cells = columns.map(col => ' ' + padEnd(String(row[col.key] || ''), col.width) + ' ');
    lines.push(style.vertical + cells.join(style.vertical) + style.vertical);
  }

  // Footer
  lines.push(style.bottomLeft + columns.map((col, i) =>
    style.horizontal.repeat(col.width + 2) +
    (i < columns.length - 1 ? style.teeUp : '')
  ).join('') + style.bottomRight);

  return lines.join('\n');
}

/**
 * Creates a pros/cons comparison table
 * @param {Object} options - Options
 * @param {Array<Object>} options.options - [{id, description, pros, cons, recommended?}]
 * @param {string} options.title - Optional title
 * @returns {string} Formatted pros/cons table
 */
function prosConsTable(options = {}) {
  const items = options.options || [];
  const title = options.title || 'Options Comparison';
  const width = options.width || Math.min(getWidth(), 80);

  const lines = [];

  lines.push('');
  lines.push(colors.bold(title));
  lines.push('='.repeat(width));
  lines.push('');

  for (const item of items) {
    const rec = item.recommended ? colors.green(' (Recommended)') : '';
    lines.push(colors.bold(`[${item.id}] ${item.description}${rec}`));

    if (item.pros) {
      const prosItems = Array.isArray(item.pros) ? item.pros : [item.pros];
      for (const pro of prosItems) {
        lines.push(`  ${colors.green(EMOJI.check)} ${pro}`);
      }
    }

    if (item.cons) {
      const consItems = Array.isArray(item.cons) ? item.cons : [item.cons];
      for (const con of consItems) {
        lines.push(`  ${colors.red(EMOJI.cross)} ${con}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// Progress Bar
// ============================================================================

/**
 * Creates a step progress bar for Iron Loop
 * @param {number} currentStep - Current step (1-15)
 * @param {number} totalSteps - Total steps (default: 15)
 * @param {Object} options - Options
 * @param {string} options.color - Progress bar color (default: 'orange')
 * @param {boolean} options.showLabels - Show step labels (default: true)
 * @param {Object} options.stepNames - Step name mapping {1: 'ASSESS', ...}
 * @returns {string} Progress bar string
 */
function stepBar(currentStep, totalSteps = 15, options = {}) {
  const color = options.color || 'orange';
  const showLabels = options.showLabels !== false;
  const stepNames = options.stepNames || {};

  const width = Math.min(getWidth() - 20, 45);
  const filledWidth = Math.floor((currentStep / totalSteps) * width);
  const emptyWidth = width - filledWidth;

  const colorFn = colors[color] || colors.orange;

  const filled = colorFn(EMOJI.block.repeat(filledWidth));
  const empty = colors.gray(EMOJI.blockLight.repeat(emptyWidth));

  let bar = `[${filled}${empty}]`;

  const stepName = stepNames[currentStep] || '';
  const stepLabel = stepName ? `: ${stepName}` : '';
  bar += ` Step ${currentStep}/${totalSteps}${stepLabel}`;

  return bar;
}

/**
 * Creates a feature start bar with different color
 * @param {string} featureName - Name of the feature
 * @param {Object} options - Options
 * @param {string} options.color - Bar color (default: 'cyan')
 * @returns {string} Feature bar string
 */
function featureBar(featureName, options = {}) {
  const color = options.color || 'cyan';
  const width = Math.min(getWidth(), 80);

  const colorFn = colors[color] || colors.cyan;

  const lines = [];
  lines.push(colorFn('='.repeat(width)));
  lines.push(colorFn(`  NEW FEATURE: ${featureName}`));
  lines.push(colorFn('='.repeat(width)));

  return lines.join('\n');
}

// ============================================================================
// Menus
// ============================================================================

/**
 * Creates a numbered menu
 * @param {Array<Object>} items - Menu items [{label, description, key?}]
 * @param {Object} options - Options
 * @param {string} options.title - Menu title
 * @param {number} options.width - Menu width
 * @returns {string} Menu string
 */
function menu(items, options = {}) {
  const title = options.title || '';
  const width = options.width || Math.min(getWidth(), 70);

  const lines = [];

  if (title) {
    lines.push('');
    lines.push(colors.bold(title));
    lines.push('-'.repeat(Math.min(visibleLength(title) + 4, width)));
    lines.push('');
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const key = item.key || (i + 1);
    const label = item.label || item;
    const desc = item.description ? colors.gray(` - ${item.description}`) : '';

    lines.push(`  [${key}] ${label}${desc}`);
  }

  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// Legend
// ============================================================================

/**
 * Creates a legend from numbered items
 * @param {Object} numberedItems - Items keyed by number
 * @param {number} maxItems - Maximum items to show (default: 20)
 * @returns {string} Legend string
 */
function legend(numberedItems, maxItems = 20) {
  const entries = Object.entries(numberedItems).slice(0, maxItems);
  if (entries.length === 0) return '  (no items)';

  // Group by column for better display
  const byColumn = {};
  for (const [num, item] of entries) {
    const col = item.column || 'other';
    if (!byColumn[col]) byColumn[col] = [];
    byColumn[col].push({ num, item });
  }

  const columnLabels = {
    backlog: 'Backlog',
    functional: 'Functional',
    technical: 'Technical',
    ready: 'Ready',
    building: 'Building',
    review: 'Review',
    done: 'Done'
  };

  const lines = [];
  for (const [col, items] of Object.entries(byColumn)) {
    const label = columnLabels[col] || col;
    const itemList = items.map(({ num, item }) => {
      const name = (item.displayName || item.name || '').slice(0, 20);
      return `[${num}] ${name}`;
    }).join('  ');
    lines.push(`  ${colors.bold(label)}: ${itemList}`);
  }

  return lines.join('\n');
}

// ============================================================================
// Kanban Board
// ============================================================================

/**
 * Renders a kanban board
 * @param {Object} data - Kanban data {columns: {name: count}, version}
 * @param {Object} options - Options
 * @returns {string} Kanban board string
 */
function kanbanBoard(data, options = {}) {
  const c = data.columns || {};
  const version = (data.version || '0.0.0').padEnd(8);

  return `
\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
\u2551  CTOC KANBAN                                                      v${version}  \u2551
\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2564\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2564\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2564\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2564\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2564\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2564\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563
\u2551 BACKLOG \u2502FUNCTIONAL\u2502TECHNICAL \u2502  READY  \u2502BUILDING \u2502 REVIEW  \u2502     DONE       \u2551
\u2551 (draft) \u2502(steps1-3)\u2502(steps4-6)\u2502         \u2502 (7-14)  \u2502 [HUMAN] \u2502                \u2551
\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u256A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u256A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u256A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u256A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u256A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u256A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563
\u2551   (${String(c.backlog || 0).padStart(2)})  \u2502   (${String(c.functional || 0).padStart(2)})   \u2502   (${String(c.technical || 0).padStart(2)})   \u2502  (${String(c.ready || 0).padStart(2)})   \u2502  (${String(c.building || 0).padStart(2)})   \u2502  (${String(c.review || 0).padStart(2)})   \u2502     (${String(c.done || 0).padStart(2)})       \u2551
\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2567\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2567\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2567\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2567\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2567\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2567\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D`.trim();
}

// ============================================================================
// Background Implementation Menus
// ============================================================================

/**
 * Generates the background implementation settings menu
 * @param {number} planCount - Number of plans queued
 * @returns {string} Formatted menu string
 */
function backgroundMenu(planCount) {
  const planWord = planCount === 1 ? 'plan' : 'plans';

  return `
+======================================================================+
|  Background Implementation Settings                                  |
+======================================================================+
|  You have ${planCount} ${planWord} queued for implementation.                       |
|                                                                      |
|  How should background implementation proceed?                       |
|                                                                      |
|  [1] Per plan      - Ask permission before each plan                 |
|  [2] Check-in      - Ask permission at intervals:                    |
|      [2a] Every 5 min   [2f] Every 45 min                            |
|      [2b] Every 10 min  [2g] Every 60 min                            |
|      [2c] Every 15 min  [2h] Every 90 min                            |
|      [2d] Every 20 min  [2i] Every 120 min                           |
|      [2e] Every 30 min  [2j] Every 180 min                           |
|  [3] Auto-continue - Implement all queued plans without asking       |
|                                                                      |
|  [S] Skip          - Don't start background implementation now       |
|                                                                      |
|  Check usage: https://claude.ai/settings/usage                       |
+======================================================================+
`.trim();
}

/**
 * Generates the check-in prompt for background implementation
 * @param {number} elapsed - Elapsed time in milliseconds
 * @param {number} plansCompleted - Number of plans completed
 * @param {number} plansRemaining - Number of plans remaining
 * @returns {string} Formatted check-in prompt
 */
function checkInPrompt(elapsed, plansCompleted, plansRemaining) {
  const minutes = Math.floor(elapsed / (60 * 1000));

  return `
+======================================================================+
|  Background Implementation Check-in                                  |
+======================================================================+
|                                                                      |
|  Time elapsed: ${String(minutes).padEnd(4)} minutes                                     |
|  Plans completed: ${String(plansCompleted).padEnd(4)}                                         |
|  Plans remaining: ${String(plansRemaining).padEnd(4)}                                         |
|                                                                      |
|  [C] Continue      - Keep implementing                               |
|  [P] Pause         - Pause after current plan                        |
|  [S] Stop          - Stop background implementation                  |
|                                                                      |
|  Check usage: https://claude.ai/settings/usage                       |
+======================================================================+
`.trim();
}

/**
 * Formats a deferred question for display
 * @param {Object} question - The deferred question object
 * @param {number} questionNumber - Current question number
 * @param {number} totalQuestions - Total number of questions
 * @param {Object} stepNames - Step name mapping
 * @returns {string} Formatted display string
 */
function deferredQuestion(question, questionNumber, totalQuestions, stepNames = {}) {
  const stepName = stepNames[question.step] || 'Unknown';

  const lines = [];
  lines.push('');
  lines.push('+' + '='.repeat(68) + '+');
  lines.push(`|  DEFERRED QUESTION ${questionNumber} of ${totalQuestions}`.padEnd(69) + '|');
  lines.push('+' + '='.repeat(68) + '+');
  lines.push('|'.padEnd(69) + '|');
  lines.push(`|  Context: ${question.context}`.slice(0, 68).padEnd(69) + '|');
  lines.push(`|  Issue:   ${question.issue}`.slice(0, 68).padEnd(69) + '|');
  lines.push(`|  Step:    ${question.step} (${stepName})`.padEnd(69) + '|');
  lines.push('|'.padEnd(69) + '|');
  lines.push('+' + '-'.repeat(68) + '+');
  lines.push('|'.padEnd(69) + '|');
  lines.push(`|  ${question.question}`.slice(0, 68).padEnd(69) + '|');
  lines.push('|'.padEnd(69) + '|');
  lines.push('|  Options:'.padEnd(69) + '|');

  if (question.options) {
    for (const opt of question.options) {
      const rec = opt.recommended ? ' *Recommended*' : '';
      lines.push(`|    [${opt.id}] ${opt.description}${rec}`.slice(0, 68).padEnd(69) + '|');
    }
  }

  lines.push('|'.padEnd(69) + '|');
  lines.push('+' + '='.repeat(68) + '+');

  return lines.join('\n');
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Core utilities
  getWidth,
  getHeight,
  writeToTerminal,
  stripAnsi,
  visibleLength,
  padEnd,
  padStart,
  center,

  // Components
  box,
  table,
  prosConsTable,
  menu,
  stepBar,
  featureBar,
  legend,
  kanbanBoard,

  // Background implementation
  backgroundMenu,
  checkInPrompt,
  deferredQuestion,

  // Styling
  colors,
  ANSI,

  // Constants
  BOX_STYLES,
  EMOJI
};
