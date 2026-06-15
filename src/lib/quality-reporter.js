/**
 * Quality Reporter
 * Generates quality reports in multiple formats (JSON, HTML, Markdown, Terminal)
 */

const fs = require('fs');
const path = require('path');

/**
 * Report format types
 * @type {string[]}
 */
const FORMATS = ['json', 'html', 'markdown', 'terminal'];

/**
 * Quality Reporter class
 * Generates reports from quality score data
 */
class QualityReporter {
  /**
   * Create a QualityReporter instance
   * @param {Object} scoreData - Score data from QualityScorer
   * @param {Object} options - Reporter options
   */
  constructor(scoreData, options = {}) {
    this.data = scoreData;
    this.options = {
      projectName: path.basename(process.cwd()),
      includeHistory: true,
      includeRecommendations: true,
      verbose: false,
      ...options
    };
  }

  /**
   * Generate report in specified format
   * @param {string} format - Output format (json, html, markdown, terminal)
   * @returns {string} Formatted report
   */
  generate(format = 'terminal') {
    if (!FORMATS.includes(format)) {
      throw new Error(`Unknown format: ${format}. Valid formats: ${FORMATS.join(', ')}`);
    }

    const generators = {
      json: this.generateJSON.bind(this),
      html: this.generateHTML.bind(this),
      markdown: this.generateMarkdown.bind(this),
      terminal: this.generateTerminal.bind(this)
    };

    return generators[format]();
  }

  /**
   * Generate JSON report
   * @returns {string} JSON formatted report
   */
  generateJSON() {
    const report = {
      meta: {
        project: this.options.projectName,
        timestamp: this.data.timestamp,
        version: '1.0.0'
      },
      summary: {
        score: this.data.overall,
        grade: this.data.grade,
        gradeLabel: this.data.gradeInfo.label,
        trend: this.data.trend
      },
      components: {},
      recommendations: this.options.includeRecommendations ? this.data.recommendations : undefined,
      history: this.options.includeHistory ? this.data.trend.history : undefined
    };

    // Add component details
    for (const [name, component] of Object.entries(this.data.components)) {
      report.components[name] = {
        score: component.score,
        maxScore: component.maxScore,
        percentage: Math.round((component.score / component.maxScore) * 100),
        metrics: component.metrics,
        issues: component.details
      };
    }

    return JSON.stringify(report, null, 2);
  }

  /**
   * Generate HTML report
   * @returns {string} HTML formatted report
   */
  generateHTML() {
    const gradeColors = {
      A: '#22c55e',
      B: '#3b82f6',
      C: '#eab308',
      D: '#f97316',
      F: '#ef4444'
    };

    const componentBars = Object.entries(this.data.components).map(([name, comp]) => {
      const pct = Math.round((comp.score / comp.maxScore) * 100);
      const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#eab308' : '#ef4444';
      return `
        <div class="component">
          <div class="component-header">
            <span class="component-name">${this.formatComponentName(name)}</span>
            <span class="component-score">${comp.score}/${comp.maxScore}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${pct}%; background: ${color}"></div>
          </div>
        </div>
      `;
    }).join('');

    const recommendationItems = this.data.recommendations.slice(0, 5).map(rec => `
      <li class="recommendation priority-${rec.priority.toLowerCase()}">
        <span class="priority-badge">${rec.priority}</span>
        <span class="category">[${rec.category}]</span>
        <span class="message">${rec.message}</span>
        <div class="action">${rec.action}</div>
      </li>
    `).join('');

    const historyChart = this.data.trend.history ? `
      <div class="history-chart">
        ${this.data.trend.history.map((score, i) => {
          const height = score;
          return `<div class="bar" style="height: ${height}%" title="Score: ${score}"></div>`;
        }).join('')}
      </div>
    ` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quality Report - ${this.options.projectName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      line-height: 1.6;
      padding: 2rem;
    }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { color: #f8fafc; margin-bottom: 0.5rem; }
    .subtitle { color: #94a3b8; margin-bottom: 2rem; }

    .score-card {
      background: #1e293b;
      border-radius: 1rem;
      padding: 2rem;
      margin-bottom: 2rem;
      text-align: center;
    }
    .score-value {
      font-size: 4rem;
      font-weight: 700;
      color: ${gradeColors[this.data.grade]};
    }
    .score-label { font-size: 1.5rem; color: #94a3b8; }
    .grade-badge {
      display: inline-block;
      background: ${gradeColors[this.data.grade]};
      color: #0f172a;
      font-weight: 700;
      font-size: 1.5rem;
      padding: 0.5rem 1.5rem;
      border-radius: 0.5rem;
      margin-top: 1rem;
    }
    .trend {
      margin-top: 1rem;
      font-size: 1.2rem;
    }
    .trend-up { color: #22c55e; }
    .trend-down { color: #ef4444; }
    .trend-stable { color: #94a3b8; }

    .section {
      background: #1e293b;
      border-radius: 0.75rem;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }
    .section-title {
      font-size: 1.2rem;
      font-weight: 600;
      margin-bottom: 1rem;
      color: #f8fafc;
    }

    .component {
      margin-bottom: 1rem;
    }
    .component-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.5rem;
    }
    .component-name { font-weight: 500; }
    .component-score { color: #94a3b8; }
    .progress-bar {
      height: 8px;
      background: #334155;
      border-radius: 4px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s ease;
    }

    .recommendations { list-style: none; }
    .recommendation {
      padding: 1rem;
      background: #334155;
      border-radius: 0.5rem;
      margin-bottom: 0.75rem;
    }
    .priority-badge {
      display: inline-block;
      padding: 0.2rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      font-weight: 700;
      margin-right: 0.5rem;
    }
    .priority-p0 .priority-badge { background: #ef4444; }
    .priority-p1 .priority-badge { background: #f97316; }
    .priority-p2 .priority-badge { background: #eab308; color: #0f172a; }
    .priority-p3 .priority-badge { background: #94a3b8; color: #0f172a; }
    .category { color: #94a3b8; margin-right: 0.5rem; }
    .action {
      margin-top: 0.5rem;
      color: #94a3b8;
      font-size: 0.9rem;
      padding-left: 1rem;
      border-left: 2px solid #475569;
    }

    .history-chart {
      display: flex;
      align-items: flex-end;
      height: 100px;
      gap: 4px;
      padding: 1rem 0;
    }
    .history-chart .bar {
      flex: 1;
      background: #3b82f6;
      border-radius: 2px 2px 0 0;
      min-height: 4px;
    }

    .timestamp {
      text-align: center;
      color: #64748b;
      font-size: 0.85rem;
      margin-top: 2rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Quality Report</h1>
    <p class="subtitle">${this.options.projectName}</p>

    <div class="score-card">
      <div class="score-value">${this.data.overall}</div>
      <div class="score-label">out of 100</div>
      <div class="grade-badge">Grade ${this.data.grade} - ${this.data.gradeInfo.label}</div>
      <div class="trend trend-${this.data.trend.direction}">
        ${this.data.trend.symbol} ${this.data.trend.label}
        ${this.data.trend.change !== 0 ? `(${this.data.trend.change > 0 ? '+' : ''}${this.data.trend.change})` : ''}
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Component Scores</h2>
      ${componentBars}
    </div>

    ${this.data.recommendations.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Recommendations</h2>
      <ul class="recommendations">
        ${recommendationItems}
      </ul>
    </div>
    ` : ''}

    ${this.data.trend.history?.length > 1 ? `
    <div class="section">
      <h2 class="section-title">Score History (Last ${this.data.trend.history.length} measurements)</h2>
      ${historyChart}
    </div>
    ` : ''}

    <p class="timestamp">Generated: ${new Date(this.data.timestamp).toLocaleString()}</p>
  </div>
</body>
</html>`;
  }

  /**
   * Generate Markdown report
   * @returns {string} Markdown formatted report
   */
  generateMarkdown() {
    const lines = [];

    // Header
    lines.push(`# Quality Report: ${this.options.projectName}`);
    lines.push('');
    lines.push(`> Generated: ${new Date(this.data.timestamp).toLocaleString()}`);
    lines.push('');

    // Summary
    lines.push('## Summary');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| **Overall Score** | ${this.data.overall}/100 |`);
    lines.push(`| **Grade** | ${this.data.grade} (${this.data.gradeInfo.label}) |`);
    lines.push(`| **Trend** | ${this.data.trend.symbol} ${this.data.trend.label} |`);
    lines.push('');

    // Score Bar
    const filledBlocks = Math.round(this.data.overall / 5);
    const emptyBlocks = 20 - filledBlocks;
    const scoreBar = '`' + '[' + '#'.repeat(filledBlocks) + '-'.repeat(emptyBlocks) + ']' + '`';
    lines.push(`Score: ${scoreBar} ${this.data.overall}%`);
    lines.push('');

    // Components
    lines.push('## Component Breakdown');
    lines.push('');
    lines.push('| Component | Score | Status |');
    lines.push('|-----------|-------|--------|');

    for (const [name, comp] of Object.entries(this.data.components)) {
      const pct = Math.round((comp.score / comp.maxScore) * 100);
      const status = pct >= 80 ? 'OK' : pct >= 60 ? 'WARN' : 'FAIL';
      const emoji = pct >= 80 ? ':white_check_mark:' : pct >= 60 ? ':warning:' : ':x:';
      lines.push(`| ${this.formatComponentName(name)} | ${comp.score}/${comp.maxScore} (${pct}%) | ${emoji} ${status} |`);
    }
    lines.push('');

    // Component Details
    lines.push('## Component Details');
    lines.push('');

    for (const [name, comp] of Object.entries(this.data.components)) {
      lines.push(`### ${this.formatComponentName(name)}`);
      lines.push('');

      if (comp.metrics && Object.keys(comp.metrics).length > 0) {
        lines.push('**Metrics:**');
        for (const [metric, value] of Object.entries(comp.metrics)) {
          if (value !== null && value !== undefined) {
            lines.push(`- ${this.formatMetricName(metric)}: ${this.formatMetricValue(metric, value)}`);
          }
        }
        lines.push('');
      }

      if (comp.details && comp.details.length > 0) {
        lines.push('**Issues:**');
        for (const detail of comp.details) {
          lines.push(`- ${detail}`);
        }
        lines.push('');
      }
    }

    // Recommendations
    if (this.options.includeRecommendations && this.data.recommendations.length > 0) {
      lines.push('## Recommendations');
      lines.push('');

      for (const rec of this.data.recommendations) {
        const priorityEmoji = {
          P0: ':rotating_light:',
          P1: ':warning:',
          P2: ':bulb:',
          P3: ':memo:'
        }[rec.priority] || ':bulb:';

        lines.push(`### ${priorityEmoji} [${rec.priority}] ${rec.category}`);
        lines.push('');
        lines.push(`**Issue:** ${rec.message}`);
        lines.push('');
        lines.push(`**Action:** ${rec.action}`);
        lines.push('');
        lines.push(`**Impact:** ${rec.impact}`);
        lines.push('');
      }
    }

    // History
    if (this.options.includeHistory && this.data.trend.history?.length > 1) {
      lines.push('## Score History');
      lines.push('');
      lines.push('```');
      lines.push(this.generateASCIIChart(this.data.trend.history));
      lines.push('```');
      lines.push('');
    }

    // Footer
    lines.push('---');
    lines.push('');
    lines.push('*Report generated by CTOC Quality Dashboard*');

    return lines.join('\n');
  }

  /**
   * Generate terminal report
   * @returns {string} Terminal formatted report
   */
  generateTerminal() {
    // This will be rendered by dashboard-renderer
    // Return data structure for terminal rendering
    return JSON.stringify({
      type: 'terminal-report',
      data: this.data,
      options: this.options
    });
  }

  /**
   * Format component name for display
   * @param {string} name - Component key name
   * @returns {string} Formatted name
   */
  formatComponentName(name) {
    const nameMap = {
      coverage: 'Test Coverage',
      lint: 'Lint Compliance',
      security: 'Security',
      complexity: 'Complexity',
      architecture: 'Architecture',
      documentation: 'Documentation'
    };
    return nameMap[name] || name.charAt(0).toUpperCase() + name.slice(1);
  }

  /**
   * Format metric name for display
   * @param {string} name - Metric key name
   * @returns {string} Formatted name
   */
  formatMetricName(name) {
    const nameMap = {
      lines: 'Line Coverage',
      branches: 'Branch Coverage',
      functions: 'Function Coverage',
      statements: 'Statement Coverage',
      errors: 'Errors',
      warnings: 'Warnings',
      fixable: 'Auto-fixable',
      critical: 'Critical Vulns',
      high: 'High Vulns',
      medium: 'Medium Vulns',
      low: 'Low Vulns',
      avgCyclomatic: 'Avg Complexity',
      maxCyclomatic: 'Max Complexity',
      hotspots: 'Hotspots',
      pattern: 'Pattern',
      violations: 'Violations',
      cycles: 'Cycles',
      hasReadme: 'Has README',
      apiDocCoverage: 'API Doc Coverage'
    };
    return nameMap[name] || name.charAt(0).toUpperCase() + name.slice(1).replace(/([A-Z])/g, ' $1');
  }

  /**
   * Format metric value for display
   * @param {string} name - Metric name
   * @param {*} value - Metric value
   * @returns {string} Formatted value
   */
  formatMetricValue(name, value) {
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    if (['lines', 'branches', 'functions', 'statements', 'apiDocCoverage'].includes(name)) {
      return `${value}%`;
    }
    return String(value);
  }

  /**
   * Generate ASCII chart for history
   * @param {number[]} values - Array of score values
   * @returns {string} ASCII chart
   */
  generateASCIIChart(values) {
    const height = 10;
    const width = Math.min(values.length, 40);
    const displayValues = values.slice(-width);

    const max = Math.max(...displayValues, 100);
    const min = Math.min(...displayValues, 0);
    const range = max - min || 1;

    const lines = [];

    // Y-axis labels and chart
    for (let row = height; row >= 0; row--) {
      const threshold = min + (row / height) * range;
      const label = String(Math.round(threshold)).padStart(3);

      let line = `${label} |`;
      for (const value of displayValues) {
        const normalizedValue = ((value - min) / range) * height;
        if (Math.round(normalizedValue) >= row) {
          line += '#';
        } else {
          line += ' ';
        }
      }
      lines.push(line);
    }

    // X-axis
    lines.push('    +' + '-'.repeat(displayValues.length));
    lines.push('     ' + 'oldest'.padEnd(displayValues.length - 6) + 'newest');

    return lines.join('\n');
  }

  /**
   * Save report to file
   * @param {string} filePath - Output file path
   * @param {string} format - Report format
   */
  saveToFile(filePath, format = null) {
    // Auto-detect format from extension if not specified
    if (!format) {
      const ext = path.extname(filePath).slice(1).toLowerCase();
      const extMap = {
        json: 'json',
        html: 'html',
        htm: 'html',
        md: 'markdown',
        markdown: 'markdown',
        txt: 'terminal'
      };
      format = extMap[ext] || 'json';
    }

    const content = this.generate(format);
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, content);
  }
}

module.exports = {
  QualityReporter,
  FORMATS
};
