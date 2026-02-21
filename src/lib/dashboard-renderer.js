/**
 * Dashboard Renderer
 * Renders beautiful terminal UI for the CTOC quality dashboard
 *
 * Features:
 * - Unicode box drawing characters
 * - ANSI color support
 * - Responsive to terminal width
 * - Progress bars with gradients
 * - Sparkline history charts
 */

const { getWidth, c } = require('./tui');
const { GRADES } = require('./quality-scorer');

/**
 * ANSI color codes for dashboard
 * @type {Object}
 */
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',

  // Standard colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  // Bright colors
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',

  // Background colors
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m'
};

/**
 * Box drawing characters
 * @type {Object}
 */
const box = {
  topLeft: '\u2554',      // double top-left
  topRight: '\u2557',     // double top-right
  bottomLeft: '\u255a',   // double bottom-left
  bottomRight: '\u255d',  // double bottom-right
  horizontal: '\u2550',   // double horizontal
  vertical: '\u2551',     // double vertical
  leftT: '\u2560',        // double left T
  rightT: '\u2563',       // double right T
  topT: '\u2566',         // double top T
  bottomT: '\u2569',      // double bottom T
  cross: '\u256c',        // double cross

  // Single line variants for inner divisions
  singleH: '\u2500',
  singleV: '\u2502',
  singleTopLeft: '\u250c',
  singleTopRight: '\u2510',
  singleBottomLeft: '\u2514',
  singleBottomRight: '\u2518'
};

/**
 * Progress bar characters
 * @type {Object}
 */
const progress = {
  full: '\u2588',       // Full block
  seven: '\u2589',
  sixEight: '\u258a',
  five: '\u258b',
  half: '\u258c',
  three: '\u258d',
  quarter: '\u258e',
  one: '\u258f',
  empty: '\u2591'       // Light shade
};

/**
 * Sparkline characters
 * @type {string[]}
 */
const sparkChars = [' ', '\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588'];

/**
 * Dashboard Renderer class
 */
class DashboardRenderer {
  /**
   * Create a DashboardRenderer instance
   * @param {Object} scoreData - Score data from QualityScorer
   * @param {Object} options - Renderer options
   */
  constructor(scoreData, options = {}) {
    this.data = scoreData;
    this.options = {
      width: Math.min(getWidth() || 80, 100),
      colorMode: 'full', // 'full', 'basic', 'none'
      projectName: 'Project',
      ...options
    };
    this.innerWidth = this.options.width - 4; // Account for borders
  }

  /**
   * Render complete dashboard
   * @returns {string} Rendered dashboard string
   */
  render() {
    const lines = [];

    lines.push(this.renderHeader());
    lines.push(this.renderScoreSection());
    lines.push(this.renderComponentsSection());
    lines.push(this.renderIssuesSection());
    lines.push(this.renderRecommendationsSection());
    lines.push(this.renderFooter());

    return lines.join('\n');
  }

  /**
   * Render dashboard header
   * @returns {string} Header section
   */
  renderHeader() {
    const width = this.options.width;
    const title = 'CTOC QUALITY DASHBOARD';
    const padding = Math.floor((width - 4 - title.length) / 2);

    const lines = [];
    lines.push(this.color('cyan', box.topLeft + box.horizontal.repeat(width - 2) + box.topRight));
    lines.push(this.color('cyan', box.vertical) +
      this.color('bold', ' '.repeat(padding) + title + ' '.repeat(width - 4 - padding - title.length)) +
      this.color('cyan', box.vertical));
    lines.push(this.color('cyan', box.leftT + box.horizontal.repeat(width - 2) + box.rightT));

    return lines.join('\n');
  }

  /**
   * Render score summary section
   * @returns {string} Score section
   */
  renderScoreSection() {
    const width = this.options.width;
    const lines = [];

    // Score line
    const score = this.data.overall;
    const grade = this.data.grade;
    const gradeInfo = this.data.gradeInfo;
    const trend = this.data.trend;

    const gradeColor = this.getGradeColor(grade);
    const trendSymbol = this.getTrendSymbol(trend);

    // Format: "  Overall Score: 87/100 (B - Good)           Trend: + +3  "
    const scoreText = `Overall Score: ${this.color(gradeColor, this.color('bold', String(score)))}${this.color('dim', '/100')} `;
    const gradeText = `(${this.color(gradeColor, grade)} - ${gradeInfo.label})`;
    const trendText = `Trend: ${trendSymbol}`;

    // Calculate spacing
    const leftContent = `  ${scoreText}${gradeText}`;
    const rightContent = trendText + '  ';
    const contentLength = this.stripAnsi(leftContent).length + this.stripAnsi(rightContent).length;
    const spacer = ' '.repeat(Math.max(1, width - 4 - contentLength));

    lines.push(this.color('cyan', box.vertical) +
      leftContent + spacer + rightContent +
      this.color('cyan', box.vertical));

    lines.push(this.color('cyan', box.leftT + box.horizontal.repeat(width - 2) + box.rightT));

    return lines.join('\n');
  }

  /**
   * Render components section with progress bars
   * @returns {string} Components section
   */
  renderComponentsSection() {
    const width = this.options.width;
    const lines = [];

    const components = this.data.components;
    const componentNames = ['coverage', 'lint', 'security', 'complexity', 'architecture', 'documentation'];

    // Two columns layout
    const colWidth = Math.floor((width - 6) / 2);

    for (let i = 0; i < componentNames.length; i += 2) {
      const left = this.renderComponentBar(componentNames[i], components[componentNames[i]], colWidth);
      const rightName = componentNames[i + 1];
      const right = rightName ? this.renderComponentBar(rightName, components[rightName], colWidth) : ' '.repeat(colWidth);

      lines.push(this.color('cyan', box.vertical) +
        '  ' + left + '  ' + right + ' ' +
        this.color('cyan', box.vertical));
    }

    lines.push(this.color('cyan', box.leftT + box.horizontal.repeat(width - 2) + box.rightT));

    return lines.join('\n');
  }

  /**
   * Render a single component progress bar
   * @param {string} name - Component name
   * @param {Object} data - Component data
   * @param {number} width - Available width
   * @returns {string} Rendered component bar
   */
  renderComponentBar(name, data, width) {
    const displayNames = {
      coverage: 'Coverage',
      lint: 'Lint',
      security: 'Security',
      complexity: 'Complexity',
      architecture: 'Arch',
      documentation: 'Docs'
    };

    const label = (displayNames[name] || name).padEnd(10);
    const pct = Math.round((data.score / data.maxScore) * 100);
    const pctStr = String(pct).padStart(3) + '%';

    // Progress bar width
    const barWidth = width - 10 - 5; // label (10) + space + percentage (4) + space
    const filledCount = Math.round((pct / 100) * barWidth);
    const emptyCount = barWidth - filledCount;

    // Color based on percentage
    const barColor = pct >= 80 ? 'green' : pct >= 60 ? 'yellow' : 'red';

    const bar = this.color(barColor, progress.full.repeat(filledCount)) +
                this.color('dim', progress.empty.repeat(emptyCount));

    return label + bar + ' ' + pctStr;
  }

  /**
   * Render top issues section
   * @returns {string} Issues section
   */
  renderIssuesSection() {
    const width = this.options.width;
    const lines = [];

    lines.push(this.color('cyan', box.vertical) +
      this.color('bold', '  Top Issues:') +
      ' '.repeat(width - 16) +
      this.color('cyan', box.vertical));

    // Collect issues from all components
    const allIssues = [];

    // Security issues (highest priority)
    const security = this.data.components.security;
    if (security.metrics.critical > 0) {
      allIssues.push({
        category: 'SECURITY',
        severity: 'critical',
        message: `${security.metrics.critical} critical vulnerabilities`
      });
    }
    if (security.metrics.high > 0) {
      allIssues.push({
        category: 'SECURITY',
        severity: 'high',
        message: `${security.metrics.high} high severity vulnerabilities`
      });
    }

    // Coverage issues
    const coverage = this.data.components.coverage;
    if (coverage.metrics.branches < 80) {
      allIssues.push({
        category: 'COVERAGE',
        severity: 'medium',
        message: `Branch coverage at ${coverage.metrics.branches}% (target: 80%)`
      });
    }

    // Complexity issues
    const complexity = this.data.components.complexity;
    if (complexity.hotspotFiles?.length > 0) {
      const hotspot = complexity.hotspotFiles[0];
      allIssues.push({
        category: 'COMPLEXITY',
        severity: 'medium',
        message: `${hotspot.file} (CC: ${hotspot.complexity})`
      });
    }

    // Architecture issues
    const arch = this.data.components.architecture;
    if (arch.metrics.violations > 0) {
      allIssues.push({
        category: 'ARCH',
        severity: 'low',
        message: `${arch.metrics.violations} architecture violations`
      });
    }
    if (arch.metrics.cycles > 0) {
      allIssues.push({
        category: 'ARCH',
        severity: 'medium',
        message: `${arch.metrics.cycles} circular dependencies`
      });
    }

    // Lint issues
    const lint = this.data.components.lint;
    if (lint.metrics.errors > 0) {
      allIssues.push({
        category: 'LINT',
        severity: 'medium',
        message: `${lint.metrics.errors} lint errors`
      });
    }

    // Sort by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    allIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    // Display top 3 issues
    const displayIssues = allIssues.slice(0, 3);

    if (displayIssues.length === 0) {
      lines.push(this.color('cyan', box.vertical) +
        this.color('green', '  No critical issues found!') +
        ' '.repeat(width - 29) +
        this.color('cyan', box.vertical));
    } else {
      for (let i = 0; i < displayIssues.length; i++) {
        const issue = displayIssues[i];
        const severityColor = {
          critical: 'brightRed',
          high: 'red',
          medium: 'yellow',
          low: 'dim'
        }[issue.severity];

        const num = `  ${i + 1}. `;
        const cat = this.color(severityColor, `[${issue.category}]`);
        const msg = ` ${issue.message}`;
        const fullLine = num + this.stripAnsi(cat) + msg;
        const padding = width - 4 - fullLine.length;

        lines.push(this.color('cyan', box.vertical) +
          num + cat + msg + ' '.repeat(Math.max(0, padding)) +
          this.color('cyan', box.vertical));
      }
    }

    lines.push(this.color('cyan', box.leftT + box.horizontal.repeat(width - 2) + box.rightT));

    return lines.join('\n');
  }

  /**
   * Render recommendations section
   * @returns {string} Recommendations section
   */
  renderRecommendationsSection() {
    const width = this.options.width;
    const lines = [];

    lines.push(this.color('cyan', box.vertical) +
      this.color('bold', '  Recommendations:') +
      ' '.repeat(width - 21) +
      this.color('cyan', box.vertical));

    const recommendations = this.data.recommendations.slice(0, 3);

    if (recommendations.length === 0) {
      lines.push(this.color('cyan', box.vertical) +
        this.color('green', '  Great job! No immediate improvements needed.') +
        ' '.repeat(width - 49) +
        this.color('cyan', box.vertical));
    } else {
      for (const rec of recommendations) {
        const bullet = this.color('cyan', '  * ');
        const maxMsgLen = width - 8;
        let message = rec.action;

        // Truncate if too long
        if (message.length > maxMsgLen) {
          message = message.substring(0, maxMsgLen - 3) + '...';
        }

        const padding = width - 6 - message.length;

        lines.push(this.color('cyan', box.vertical) +
          bullet + message + ' '.repeat(Math.max(0, padding)) +
          this.color('cyan', box.vertical));
      }
    }

    return lines.join('\n');
  }

  /**
   * Render dashboard footer
   * @returns {string} Footer section
   */
  renderFooter() {
    const width = this.options.width;
    const timestamp = new Date(this.data.timestamp).toLocaleString();
    const footer = `Generated: ${timestamp}`;
    const padding = Math.floor((width - 4 - footer.length) / 2);

    const lines = [];
    lines.push(this.color('cyan', box.bottomLeft + box.horizontal.repeat(width - 2) + box.bottomRight));

    return lines.join('\n');
  }

  /**
   * Get color code for grade
   * @param {string} grade - Letter grade
   * @returns {string} Color name
   */
  getGradeColor(grade) {
    const gradeColors = {
      A: 'green',
      B: 'blue',
      C: 'yellow',
      D: 'brightYellow',
      F: 'red'
    };
    return gradeColors[grade] || 'white';
  }

  /**
   * Get trend symbol with color
   * @param {Object} trend - Trend data
   * @returns {string} Colored trend symbol
   */
  getTrendSymbol(trend) {
    const symbols = {
      '++': { char: '\u2191\u2191', color: 'green' },      // Double up arrow
      '+': { char: '\u2191', color: 'green' },             // Up arrow
      '=': { char: '\u2192', color: 'dim' },               // Right arrow
      '-': { char: '\u2193', color: 'yellow' },            // Down arrow
      '--': { char: '\u2193\u2193', color: 'red' }         // Double down arrow
    };

    const symbol = symbols[trend.symbol] || symbols['='];
    let result = this.color(symbol.color, symbol.char);

    if (trend.change !== 0) {
      const changeStr = trend.change > 0 ? `+${trend.change}` : String(trend.change);
      result += ' ' + this.color(symbol.color, changeStr);
    }

    return result;
  }

  /**
   * Render sparkline from history data
   * @param {number[]} values - Array of values
   * @param {number} width - Chart width
   * @returns {string} Sparkline string
   */
  renderSparkline(values, width = 20) {
    if (!values || values.length === 0) {
      return this.color('dim', '-'.repeat(width));
    }

    const displayValues = values.slice(-width);
    const max = Math.max(...displayValues);
    const min = Math.min(...displayValues);
    const range = max - min || 1;

    return displayValues.map(v => {
      const normalized = (v - min) / range;
      const index = Math.round(normalized * (sparkChars.length - 1));
      return sparkChars[index];
    }).join('');
  }

  /**
   * Apply color to text
   * @param {string} colorName - Color name
   * @param {string} text - Text to color
   * @returns {string} Colored text
   */
  color(colorName, text) {
    if (this.options.colorMode === 'none') {
      return text;
    }

    const color = colors[colorName];
    if (!color) {
      return text;
    }

    return color + text + colors.reset;
  }

  /**
   * Strip ANSI codes from string
   * @param {string} str - String with ANSI codes
   * @returns {string} Plain string
   */
  stripAnsi(str) {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  }

  /**
   * Render compact single-line summary
   * @returns {string} Compact summary
   */
  renderCompact() {
    const score = this.data.overall;
    const grade = this.data.grade;
    const trend = this.data.trend;

    const gradeColor = this.getGradeColor(grade);
    const trendSymbol = this.getTrendSymbol(trend);

    // Score bar
    const barWidth = 20;
    const filled = Math.round((score / 100) * barWidth);
    const empty = barWidth - filled;
    const bar = this.color(gradeColor, progress.full.repeat(filled)) +
                this.color('dim', progress.empty.repeat(empty));

    return `Quality: ${bar} ${this.color(gradeColor, this.color('bold', String(score)))}${this.color('dim', '/100')} (${this.color(gradeColor, grade)}) ${trendSymbol}`;
  }

  /**
   * Render mini dashboard for status bars
   * @returns {string} Mini dashboard
   */
  renderMini() {
    const components = this.data.components;
    const parts = [];

    // Coverage mini bar
    const covPct = Math.round((components.coverage.score / components.coverage.maxScore) * 100);
    const covColor = covPct >= 80 ? 'green' : covPct >= 60 ? 'yellow' : 'red';
    parts.push(`Cov:${this.color(covColor, String(covPct).padStart(3))}%`);

    // Lint
    const lintPct = Math.round((components.lint.score / components.lint.maxScore) * 100);
    const lintColor = lintPct >= 80 ? 'green' : lintPct >= 60 ? 'yellow' : 'red';
    parts.push(`Lint:${this.color(lintColor, String(lintPct).padStart(3))}%`);

    // Security
    const secPct = Math.round((components.security.score / components.security.maxScore) * 100);
    const secColor = secPct >= 80 ? 'green' : secPct >= 60 ? 'yellow' : 'red';
    parts.push(`Sec:${this.color(secColor, String(secPct).padStart(3))}%`);

    return parts.join(' | ');
  }
}

module.exports = {
  DashboardRenderer,
  colors,
  box,
  progress,
  sparkChars
};
