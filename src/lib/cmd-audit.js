/**
 * Audit Command
 * Quick access to dependency auditing (alias for security scan --deps)
 *
 * Usage:
 *   ctoc audit [deps|all]
 *   ctoc audit deps [--fix]
 *   ctoc audit report [--format <format>]
 */

const { DependencyAuditor, SEVERITY } = require('../lib/dependency-auditor');
const { QualityGate, GATE_STATUS } = require('../lib/quality-gate');
const fs = require('fs');
const path = require('path');

/**
 * Execute audit command
 * @param {Object} options - Command options
 * @param {string} options.action - Action to perform (deps, all, report)
 * @param {boolean} options.fix - Show fix commands
 * @param {string} options.format - Report format
 * @param {string} options.mode - Quality mode
 * @param {string} options.projectRoot - Project root directory
 * @returns {Promise<Object>} Command result
 */
async function execute(options) {
  const {
    action = 'deps',
    fix = false,
    format = 'text',
    mode = 'strict',
    projectRoot = process.cwd()
  } = options;

  switch (action) {
    case 'deps':
    case 'dependencies':
      return await auditDependencies(projectRoot, { fix });

    case 'all':
      return await auditAll(projectRoot);

    case 'report':
      return await generateReport(projectRoot, format);

    case 'gate':
      return await checkGate(projectRoot, mode);

    default:
      return {
        success: false,
        error: `Unknown action: ${action}. Valid actions: deps, all, report, gate`
      };
  }
}

/**
 * Audit project dependencies for vulnerabilities
 * @param {string} projectRoot - Project root path
 * @param {Object} options - Audit options
 * @returns {Promise<Object>} Audit results
 */
async function auditDependencies(projectRoot, options = {}) {
  const { fix = false } = options;

  const auditor = new DependencyAuditor(projectRoot);
  const results = await auditor.run();

  const lines = [];
  lines.push('Dependency Audit');
  lines.push('='.repeat(50));
  lines.push('');
  lines.push(`Package Managers: ${results.summary.managers.join(', ') || 'none detected'}`);
  lines.push(`Scan Duration: ${results.summary.duration}s`);
  lines.push(`Total Vulnerabilities: ${results.summary.total}`);
  lines.push('');

  // Summary by severity
  if (Object.keys(results.summary.bySeverity).length > 0) {
    lines.push('By Severity:');
    for (const [severity, count] of Object.entries(results.summary.bySeverity)) {
      if (count > 0) {
        lines.push(`  ${severity}: ${count}`);
      }
    }
    lines.push('');
  }

  // Critical and high vulnerabilities
  const criticalHigh = results.vulnerabilities.filter(v =>
    v.severity === SEVERITY.CRITICAL || v.severity === SEVERITY.HIGH
  );

  if (criticalHigh.length > 0) {
    lines.push('Critical/High Vulnerabilities:');
    lines.push('-'.repeat(30));
    for (const vuln of criticalHigh.slice(0, 15)) {
      lines.push(`  [${vuln.severity}] ${vuln.package}@${vuln.version}`);
      lines.push(`    ${vuln.title}`);
      if (vuln.cve) {
        lines.push(`    CVE: ${vuln.cve}`);
      }
      if (vuln.fixedIn) {
        lines.push(`    Fix: Upgrade to ${vuln.fixedIn}`);
      }
    }
    if (criticalHigh.length > 15) {
      lines.push(`  ... and ${criticalHigh.length - 15} more`);
    }
    lines.push('');
  }

  // Fix commands
  if (fix && results.vulnerabilities.length > 0) {
    lines.push('Fix Commands:');
    lines.push('-'.repeat(30));

    const fixes = new Map();
    for (const vuln of results.vulnerabilities) {
      if (vuln.fixedIn && !fixes.has(vuln.package)) {
        const cmd = getFixCommand(vuln.manager, vuln.package, vuln.fixedIn);
        if (cmd) {
          fixes.set(vuln.package, cmd);
        }
      }
    }

    for (const cmd of fixes.values()) {
      lines.push(`  ${cmd}`);
    }

    if (fixes.size > 0) {
      lines.push('');
      lines.push('Run these commands to fix vulnerable dependencies.');
    }
  }

  // Pass/fail summary
  const threshold = auditor.checkThreshold(SEVERITY.HIGH);
  lines.push('');
  if (threshold.pass) {
    lines.push('Audit PASSED: No critical or high severity vulnerabilities.');
  } else {
    lines.push(`Audit FAILED: ${threshold.failing} critical/high vulnerability(ies) found.`);
  }

  // Save results
  const resultsDir = path.join(projectRoot, '.ctoc', 'security');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(resultsDir, 'dependency-audit.json'),
    JSON.stringify(results, null, 2)
  );

  return {
    success: true,
    passed: threshold.pass,
    vulnerabilities: results.vulnerabilities,
    summary: results.summary,
    errors: results.errors,
    message: lines.join('\n')
  };
}

/**
 * Run full audit (dependencies + security scan)
 * @param {string} projectRoot - Project root path
 * @returns {Promise<Object>} Full audit results
 */
async function auditAll(projectRoot) {
  // Import security command (runSecurityScan lives in cmd-security.js)
  const { runSecurityScan } = require('./cmd-security');
  return await runSecurityScan(projectRoot, { all: true });
}

/**
 * Generate audit report
 * @param {string} projectRoot - Project root path
 * @param {string} format - Output format
 * @returns {Promise<Object>} Report result
 */
async function generateReport(projectRoot, format) {
  const resultsPath = path.join(projectRoot, '.ctoc', 'security', 'dependency-audit.json');

  if (!fs.existsSync(resultsPath)) {
    // Run audit first
    await auditDependencies(projectRoot, {});
  }

  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

  let report;
  switch (format) {
    case 'json':
      report = JSON.stringify(results, null, 2);
      break;

    case 'markdown':
      report = generateMarkdownReport(results);
      break;

    case 'text':
    default:
      report = results.message || generateTextReport(results);
      break;
  }

  return {
    success: true,
    format,
    report,
    message: report
  };
}

/**
 * Generate markdown report
 * @param {Object} results - Audit results
 * @returns {string} Markdown report
 */
function generateMarkdownReport(results) {
  const lines = [];

  lines.push('# Dependency Audit Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Package Managers:** ${results.summary.managers.join(', ')}`);
  lines.push(`**Total Vulnerabilities:** ${results.summary.total}`);
  lines.push('');

  lines.push('## Summary by Severity');
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('|----------|-------|');
  for (const [severity, count] of Object.entries(results.summary.bySeverity || {})) {
    if (count > 0) {
      lines.push(`| ${severity} | ${count} |`);
    }
  }
  lines.push('');

  if (results.vulnerabilities && results.vulnerabilities.length > 0) {
    lines.push('## Vulnerabilities');
    lines.push('');
    lines.push('| Severity | Package | Version | CVE | Fix |');
    lines.push('|----------|---------|---------|-----|-----|');
    for (const vuln of results.vulnerabilities) {
      const cve = vuln.cve || 'N/A';
      const fix = vuln.fixedIn || 'N/A';
      lines.push(`| ${vuln.severity} | ${vuln.package} | ${vuln.version} | ${cve} | ${fix} |`);
    }
    lines.push('');
  }

  lines.push('## Recommendations');
  lines.push('');
  lines.push('1. Update all packages with known fixes');
  lines.push('2. Review packages without available fixes');
  lines.push('3. Consider alternatives for abandoned packages');
  lines.push('4. Set up automated dependency updates (Dependabot/Renovate)');

  return lines.join('\n');
}

/**
 * Generate text report
 * @param {Object} results - Audit results
 * @returns {string} Text report
 */
function generateTextReport(results) {
  const lines = [];

  lines.push('Dependency Audit Report');
  lines.push('='.repeat(50));
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Total Vulnerabilities: ${results.summary.total}`);
  lines.push('');

  for (const vuln of results.vulnerabilities || []) {
    lines.push(`[${vuln.severity}] ${vuln.package}@${vuln.version}`);
    lines.push(`  ${vuln.title}`);
    if (vuln.cve) lines.push(`  CVE: ${vuln.cve}`);
    if (vuln.fixedIn) lines.push(`  Fix: ${vuln.fixedIn}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Check audit against quality gate
 * @param {string} projectRoot - Project root path
 * @param {string} mode - Quality mode
 * @returns {Promise<Object>} Gate result
 */
async function checkGate(projectRoot, mode) {
  const resultsPath = path.join(projectRoot, '.ctoc', 'security', 'dependency-audit.json');

  if (!fs.existsSync(resultsPath)) {
    await auditDependencies(projectRoot, {});
  }

  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

  // Prepare metrics
  const metrics = {
    security: {
      dependencies: results.summary.bySeverity || {}
    }
  };

  const gate = new QualityGate(projectRoot, { mode });
  const gateResult = gate.evaluateSecurity(metrics.security);

  const lines = [];
  lines.push('Dependency Audit Gate');
  lines.push('='.repeat(50));
  lines.push('');
  lines.push(`Mode: ${mode}`);
  lines.push(`Status: ${gateResult.status}`);
  lines.push('');

  if (gateResult.failures.length > 0) {
    lines.push('Threshold Violations:');
    for (const failure of gateResult.failures) {
      lines.push(`  - ${failure.message}`);
    }
    lines.push('');
  }

  if (gateResult.status === GATE_STATUS.PASSED) {
    lines.push('Gate PASSED. Dependency audit meets thresholds.');
  } else {
    lines.push('Gate FAILED. Fix vulnerable dependencies to pass.');
  }

  return {
    success: true,
    passed: gateResult.status === GATE_STATUS.PASSED,
    status: gateResult.status,
    failures: gateResult.failures,
    message: lines.join('\n')
  };
}

/**
 * Get fix command for package manager
 * @param {string} manager - Package manager
 * @param {string} pkg - Package name
 * @param {string} version - Target version
 * @returns {string} Fix command
 */
function getFixCommand(manager, pkg, version) {
  const commands = {
    npm: `npm install ${pkg}@${version}`,
    yarn: `yarn upgrade ${pkg}@${version}`,
    pnpm: `pnpm update ${pkg}@${version}`,
    pip: `pip install ${pkg}==${version}`,
    pipenv: `pipenv update ${pkg}`,
    poetry: `poetry update ${pkg}`,
    go: `go get ${pkg}@${version}`,
    cargo: `cargo update -p ${pkg}`,
    bundler: `bundle update ${pkg}`,
    composer: `composer require ${pkg}:${version}`
  };

  return commands[manager] || null;
}

module.exports = {
  execute,
  auditDependencies,
  auditAll,
  generateReport,
  checkGate
};
