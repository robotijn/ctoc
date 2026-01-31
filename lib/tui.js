/**
 * Terminal UI Engine
 * Core rendering and input handling for CTOC interface
 */

const readline = require('readline');

// ANSI color codes
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m'
};

// Get terminal width
function getWidth() {
  return process.stdout.columns || 80;
}

// Draw horizontal line
function line(width = null) {
  return c.dim + '─'.repeat(width || getWidth()) + c.reset;
}

// Clear screen and move cursor to top
function clear() {
  process.stdout.write('\x1b[2J\x1b[H');
}

// Render tabs bar
function renderTabs(tabs, activeIndex) {
  let output = '';
  tabs.forEach((tab, i) => {
    if (i === activeIndex) {
      output += `${c.cyan}${c.bold}[${tab}]${c.reset}`;
    } else {
      output += `${c.dim}[${tab}]${c.reset}`;
    }
    if (i < tabs.length - 1) output += '  ';
  });
  return output;
}

// Render tab underline indicator
function renderTabIndicator(tabs, activeIndex) {
  let pos = 0;
  for (let i = 0; i < activeIndex; i++) {
    pos += tabs[i].length + 4; // [name] + 2 spaces
  }
  const indicatorWidth = tabs[activeIndex].length + 2;
  return ' '.repeat(pos) + '^'.repeat(indicatorWidth);
}

// Pagination helper - paginate items for display
// Returns { items: [], page, totalPages, hasNext, hasPrev }
function paginate(items, page = 0, pageSize = 9) {
  const totalPages = Math.ceil(items.length / pageSize);
  const currentPage = Math.max(0, Math.min(page, totalPages - 1));
  const start = currentPage * pageSize;
  const end = start + pageSize;
  const pageItems = items.slice(start, end);

  return {
    items: pageItems,
    page: currentPage,
    totalPages,
    hasNext: currentPage < totalPages - 1,
    hasPrev: currentPage > 0,
    startIndex: start,
    endIndex: Math.min(end, items.length) - 1
  };
}

// Render pagination controls
function renderPaginationControls(paginationState, options = {}) {
  const { showBack = true } = options;
  const { hasNext, hasPrev, page, totalPages } = paginationState;

  const parts = [];

  if (showBack) {
    parts.push('[0] back');
  }

  if (hasPrev) {
    parts.push('[p] prev');
  }

  if (hasNext) {
    parts.push('[n] next');
  }

  if (totalPages > 1) {
    parts.push(`${c.dim}page ${page + 1}/${totalPages}${c.reset}`);
  }

  return parts.length > 0 ? `${c.dim}${parts.join('  ')}${c.reset}` : '';
}

// Render a list with selection
function renderList(items, selectedIndex, options = {}) {
  const { showNumbers = true, prefix = '', emptyMessage = 'No items.', page = 0, pageSize = 9, showStatus = true } = options;

  if (items.length === 0) {
    return `${c.dim}${emptyMessage}${c.reset}\n`;
  }

  // Apply pagination
  const pagination = paginate(items, page, pageSize);
  const displayItems = pagination.items;

  let output = '';
  displayItems.forEach((item, i) => {
    const globalIndex = pagination.startIndex + i;
    const arrow = globalIndex === selectedIndex ? '→' : ' ';
    const num = showNumbers ? `[${i + 1}] ` : '';
    const name = typeof item === 'string' ? item : item.name;

    // Background status icon (if available)
    let statusIcon = '';
    if (showStatus && typeof item === 'object' && item.bgIcon) {
      // Color the icon based on status
      if (item.bgStatus === 'working') {
        statusIcon = `${c.yellow}${item.bgIcon}${c.reset} `;
      } else if (item.bgStatus === 'complete') {
        statusIcon = `${c.green}${item.bgIcon}${c.reset} `;
      } else if (item.bgStatus === 'needs-input') {
        statusIcon = `${c.red}${item.bgIcon}${c.reset} `;
      } else if (item.bgStatus === 'timeout') {
        statusIcon = `${c.red}${item.bgIcon}${c.reset} `;
      } else {
        statusIcon = `${c.dim}${item.bgIcon}${c.reset} `;
      }
    }

    const suffix = typeof item === 'object' && item.ago ? `${c.dim}${item.ago}${c.reset}` : '';

    output += `${arrow} ${num}${statusIcon}${name}`;
    if (suffix) {
      const statusLen = statusIcon ? 2 : 0; // Icon + space
      const padding = getWidth() - name.length - num.length - 4 - (item.ago?.length || 0) - statusLen;
      output += ' '.repeat(Math.max(1, padding)) + suffix;
    }
    output += '\n';
  });

  // Add pagination controls if needed
  if (pagination.totalPages > 1 || options.showBack) {
    output += '\n' + renderPaginationControls(pagination, { showBack: options.showBack });
    output += '\n';
  }

  return output;
}

// Render action menu
function renderActionMenu(title, actions, selectedIndex = 0) {
  let output = '\n';
  output += `${c.bold}${title}${c.reset}\n`;
  output += line() + '\n\n';

  let hasDanger = false;
  actions.forEach((action, i) => {
    if (action.separator) {
      output += line() + '\n';
      hasDanger = true;
      return;
    }

    const selected = i === selectedIndex ? '→ ' : '  ';
    const num = `${action.key || i + 1}. `;

    if (action.danger) {
      output += `${selected}${c.red}${num}${action.label}${c.reset}\n`;
    } else {
      output += `${selected}${num}${action.label}\n`;
    }
  });

  output += '\n';
  output += `${c.dim}↑/↓ select · Enter confirm · Esc back${c.reset}\n`;

  return output;
}

// Render confirmation dialog
function renderConfirm(title, message, options) {
  let output = '\n';
  output += `${c.yellow}${c.bold}${title}${c.reset}\n`;
  output += line() + '\n\n';
  output += message + '\n\n';
  output += line() + '\n';

  options.forEach((opt, i) => {
    if (opt.danger) {
      output += `${c.red}${c.bold}${i + 1}. ${opt.label}${c.reset}\n`;
    } else {
      output += `${i + 1}. ${opt.label}\n`;
    }
  });

  output += `\n${c.dim}Enter 1-${options.length} · Esc cancel${c.reset}\n`;

  return output;
}

// Render text input prompt
function renderInput(prompt, value = '') {
  let output = '\n';
  output += `${prompt}\n\n`;
  output += `> ${value}_\n\n`;
  output += line() + '\n';
  output += `${c.dim}Enter to submit · Esc cancel${c.reset}\n`;
  return output;
}

// Render footer with navigation hints
function renderFooter(hints) {
  let output = line() + '\n';
  output += `${c.dim}${hints.join(' · ')}${c.reset}\n`;
  return output;
}

// Breadcrumb trail
function renderBreadcrumb(path) {
  return `${c.dim}${path.join(' › ')}${c.reset}`;
}

// Setup keyboard input
function setupKeyboard(handler) {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  process.stdin.on('keypress', (str, key) => {
    if (key.ctrl && key.name === 'c') {
      cleanup();
      process.exit();
    }
    handler(str, key);
  });

  process.stdin.resume();
}

// Cleanup on exit
function cleanup() {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();
  console.log('\n');
}

module.exports = {
  c,
  getWidth,
  line,
  clear,
  paginate,
  renderPaginationControls,
  renderTabs,
  renderTabIndicator,
  renderList,
  renderActionMenu,
  renderConfirm,
  renderInput,
  renderFooter,
  renderBreadcrumb,
  setupKeyboard,
  cleanup
};
