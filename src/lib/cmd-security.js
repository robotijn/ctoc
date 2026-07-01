/**
 * Security Command
 * Manages security scanning, vulnerability detection, and compliance checks
 *
 * Usage:
 *   ctoc security scan [--sast] [--deps] [--secrets] [--all]
 *   ctoc security report [--format <format>]
 *   ctoc security gate [--mode <mode>]
 *   ctoc security fix [--auto]
 */

const path = require('path');
const safeFs = require('./safe-fs');
const { SASTRunner, SEVERITY: SAST_SEVERITY } = require('../lib/sast-runner');
const { DependencyAuditor } = require('../lib/dependency-auditor');
const { SecretsScanner } = require('../lib/secrets-scanner');
const { QualityGate, GATE_STATUS } = require('../lib/quality-gate');

/**
 * Execute security command
 * @param {Object} options - Command options
 * @param {string} options.action - Action to perform (scan, report, gate, fix)
 * @param {boolean} options.sast - Run SAST scan
 * @param {boolean} options.deps - Run dependency audit
 * @param {boolean} options.secrets - Run secrets scan
 * @param {boolean} options.all - Run all scans
 * @param {string} options.mode - Quality mode (strict, strictest, legacy)
 * @param {string} options.format - Report format (text, json, markdown)
 * @param {boolean} options.auto - Auto-fix where possible
 * @param {string} options.projectRoot - Project root directory
 * @returns {Promise<Object>} Command result
 */
async function execute(options) {
  const {
    action = 'scan',
    sast = false,
    deps = false,
    secrets = false,
    all = true,
    mode = 'strict',
    format = 'text',
    auto = false,
    projectRoot = process.cwd()
  } = options;

  switch (action) {
    case 'scan':
      return await runSecurityScan(projectRoot, { sast, deps, secrets, all });

    case 'report':
      return await generateSecurityReport(projectRoot, format);

    case 'gate':
      return await checkSecurityGate(projectRoot, mode);

    case 'fix':
      return await suggestFixes(projectRoot, auto);

    default:
      return {
        success: false,
        error: `Unknown action: ${action}. Valid actions: scan, report, gate, fix`
      };
  }
}

/**
 * Run comprehensive security scan
 * @param {string} projectRoot - Project root path
 * @param {Object} options - Scan options
 * @returns {Promise<Object>} Scan results
 */
async function runSecurityScan(projectRoot, options) {
  const { sast, deps, secrets, all } = options;
  const runAll = all || (!sast && !deps && !secrets);

  const results = {
    sast: null,
    dependencies: null,
    secrets: null,
    summary: {
      total: 0,
      bySeverity: {},
      scanTime: 0
    }
  };

  const startTime = Date.now();
  const lines = [];

  lines.push('Security Scan');
  lines.push('='.repeat(50));
  lines.push('');

  // Run SAST scan
  if (runAll || sast) {
    lines.push('Running SAST scan...');
    const sastRunner = new SASTRunner(projectRoot);
    results.sast = await sastRunner.run();
    lines.push(`  Found ${results.sast.findings.length} finding(s)`);
    lines.push('');
  }

  // Run dependency audit
  if (runAll || deps) {
    lines.push('Running dependency audit...');
    const depAuditor = new DependencyAuditor(projectRoot);
    results.dependencies = await depAuditor.run();
    lines.push(`  Found ${results.dependencies.vulnerabilities.length} vulnerability(ies)`);
    lines.push('');
  }

  // Run secrets scan
  if (runAll || secrets) {
    lines.push('Running secrets scan...');
    const secretsScanner = new SecretsScanner(projectRoot);
    results.secrets = await secretsScanner.run();
    lines.push(`  Found ${results.secrets.findings.length} secret(s)`);
    lines.push('');
  }

  // Calculate summary
  const allFindings = [];
  if (results.sast) allFindings.push(...results.sast.findings);
  if (results.dependencies) allFindings.push(...results.dependencies.vulnerabilities);
  if (results.secrets) allFindings.push(...results.secrets.findings);

  results.summary.total = allFindings.length;
  results.summary.scanTime = Math.round((Date.now() - startTime) / 1000);

  // Count by severity
  for (const finding of allFindings) {
    const severity = finding.severity || 'UNKNOWN';
    results.summary.bySeverity[severity] = (results.summary.bySeverity[severity] || 0) + 1;
  }

  // Generate summary
  lines.push('Summary');
  lines.push('-'.repeat(30));
  lines.push(`  Total findings: ${results.summary.total}`);
  lines.push(`  Scan time: ${results.summary.scanTime}s`);
  lines.push('');

  if (Object.keys(results.summary.bySeverity).length > 0) {
    lines.push('By Severity:');
    for (const [severity, count] of Object.entries(results.summary.bySeverity)) {
      lines.push(`  ${severity}: ${count}`);
    }
    lines.push('');
  }

  // Highlight critical issues
  const criticalFindings = allFindings.filter(f =>
    f.severity === 'CRITICAL' || f.severity === SAST_SEVERITY.CRITICAL
  );

  if (criticalFindings.length > 0) {
    lines.push('CRITICAL ISSUES (Immediate Action Required)');
    lines.push('-'.repeat(40));
    for (const finding of criticalFindings.slice(0, 5)) {
      lines.push(`  [${finding.type || finding.rule}] ${finding.file}:${finding.line || 'N/A'}`);
      lines.push(`    ${finding.message || finding.title}`);
    }
    if (criticalFindings.length > 5) {
      lines.push(`  ... and ${criticalFindings.length - 5} more critical issues`);
    }
    lines.push('');
  }

  // Save results
  const resultsDir = path.join(projectRoot, '.ctoc', 'security');
  if (!safeFs.existsSync(resultsDir)) {
    safeFs.mkdirSync(resultsDir, { recursive: true });
  }
  safeFs.writeFileSync(
    path.join(resultsDir, 'latest-scan.json'),
    JSON.stringify(results, null, 2)
  );

  return {
    success: true,
    ...results,
    message: lines.join('\n')
  };
}

/**
 * Generate security report in specified format
 * @param {string} projectRoot - Project root path
 * @param {string} format - Output format
 * @returns {Promise<Object>} Report result
 */
async function generateSecurityReport(projectRoot, format) {
  const resultsPath = path.join(projectRoot, '.ctoc', 'security', 'latest-scan.json');

  if (!safeFs.existsSync(resultsPath)) {
    return {
      success: false,
      error: 'No security scan results found. Run "ctoc security scan" first.'
    };
  }

  const results = JSON.parse(safeFs.readFileSync(resultsPath, 'utf8'));

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
      report = generateTextReport(results);
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
 * Generate text report
 * @param {Object} results - Scan results
 * @returns {string} Text report
 */
function generateTextReport(results) {
  const lines = [];

  lines.push('Security Scan Report');
  lines.push('='.repeat(50));
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Total Findings: ${results.summary.total}`);
  lines.push('');

  // SAST findings
  if (results.sast && results.sast.findings.length > 0) {
    lines.push('SAST Findings');
    lines.push('-'.repeat(30));
    for (const finding of results.sast.findings.slice(0, 20)) {
      lines.push(`  [${finding.severity}] ${finding.file}:${finding.line}`);
      lines.push(`    ${finding.message}`);
      if (finding.cwe) {
        lines.push(`    CWE: ${finding.cwe}`);
      }
    }
    if (results.sast.findings.length > 20) {
      lines.push(`  ... and ${results.sast.findings.length - 20} more`);
    }
    lines.push('');
  }

  // Dependency vulnerabilities
  if (results.dependencies && results.dependencies.vulnerabilities.length > 0) {
    lines.push('Dependency Vulnerabilities');
    lines.push('-'.repeat(30));
    for (const vuln of results.dependencies.vulnerabilities.slice(0, 20)) {
      lines.push(`  [${vuln.severity}] ${vuln.package}@${vuln.version}`);
      lines.push(`    ${vuln.title}`);
      if (vuln.fixedIn) {
        lines.push(`    Fix: Upgrade to ${vuln.fixedIn}`);
      }
    }
    if (results.dependencies.vulnerabilities.length > 20) {
      lines.push(`  ... and ${results.dependencies.vulnerabilities.length - 20} more`);
    }
    lines.push('');
  }

  // Secrets
  if (results.secrets && results.secrets.findings.length > 0) {
    lines.push('Detected Secrets');
    lines.push('-'.repeat(30));
    for (const secret of results.secrets.findings.slice(0, 10)) {
      lines.push(`  [${secret.severity}] ${secret.file}:${secret.line}`);
      lines.push(`    Type: ${secret.name}`);
      lines.push(`    Match: ${secret.match}`);
    }
    if (results.secrets.findings.length > 10) {
      lines.push(`  ... and ${results.secrets.findings.length - 10} more`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate markdown report
 * @param {Object} results - Scan results
 * @returns {string} Markdown report
 */
function generateMarkdownReport(results) {
  const lines = [];

  lines.push('# Security Scan Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Total Findings:** ${results.summary.total}`);
  lines.push('');

  lines.push('## Summary by Severity');
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('|----------|-------|');
  for (const [severity, count] of Object.entries(results.summary.bySeverity || {})) {
    lines.push(`| ${severity} | ${count} |`);
  }
  lines.push('');

  // SAST section
  if (results.sast && results.sast.findings.length > 0) {
    lines.push('## SAST Findings');
    lines.push('');
    lines.push('| Severity | File | Line | Description |');
    lines.push('|----------|------|------|-------------|');
    for (const finding of results.sast.findings.slice(0, 30)) {
      const desc = finding.message.replace(/\|/g, '\\|').substring(0, 50);
      lines.push(`| ${finding.severity} | ${finding.file} | ${finding.line} | ${desc} |`);
    }
    lines.push('');
  }

  // Dependencies section
  if (results.dependencies && results.dependencies.vulnerabilities.length > 0) {
    lines.push('## Dependency Vulnerabilities');
    lines.push('');
    lines.push('| Severity | Package | Version | Fix |');
    lines.push('|----------|---------|---------|-----|');
    for (const vuln of results.dependencies.vulnerabilities.slice(0, 30)) {
      const fix = vuln.fixedIn || 'N/A';
      lines.push(`| ${vuln.severity} | ${vuln.package} | ${vuln.version} | ${fix} |`);
    }
    lines.push('');
  }

  // Secrets section
  if (results.secrets && results.secrets.findings.length > 0) {
    lines.push('## Detected Secrets');
    lines.push('');
    lines.push('| Severity | Type | File | Line |');
    lines.push('|----------|------|------|------|');
    for (const secret of results.secrets.findings.slice(0, 20)) {
      lines.push(`| ${secret.severity} | ${secret.name} | ${secret.file} | ${secret.line} |`);
    }
    lines.push('');
    lines.push('> **Warning:** Secrets should be rotated immediately and removed from version control.');
  }

  return lines.join('\n');
}

/**
 * Check security gate thresholds
 * @param {string} projectRoot - Project root path
 * @param {string} mode - Quality mode
 * @returns {Promise<Object>} Gate result
 */
async function checkSecurityGate(projectRoot, mode) {
  const resultsPath = path.join(projectRoot, '.ctoc', 'security', 'latest-scan.json');

  if (!safeFs.existsSync(resultsPath)) {
    // Run scan first
    await runSecurityScan(projectRoot, { all: true });
  }

  const results = JSON.parse(safeFs.readFileSync(resultsPath, 'utf8'));

  // Prepare security metrics for quality gate
  const securityMetrics = {
    sast: {},
    dependencies: {},
    secrets: 0
  };

  // Count SAST findings by severity
  if (results.sast) {
    for (const finding of results.sast.findings) {
      const severity = finding.severity || 'MEDIUM';
      securityMetrics.sast[severity] = (securityMetrics.sast[severity] || 0) + 1;
    }
  }

  // Count dependency vulnerabilities by severity
  if (results.dependencies) {
    for (const vuln of results.dependencies.vulnerabilities) {
      const severity = vuln.severity || 'MODERATE';
      securityMetrics.dependencies[severity] = (securityMetrics.dependencies[severity] || 0) + 1;
    }
  }

  // Count secrets
  if (results.secrets) {
    securityMetrics.secrets = results.secrets.findings.filter(
      f => f.severity === 'CRITICAL' || f.severity === 'HIGH'
    ).length;
  }

  // Run quality gate evaluation
  const gate = new QualityGate(projectRoot, { mode });
  const gateResult = gate.evaluateSecurity(securityMetrics);

  const lines = [];
  lines.push('Security Gate Check');
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
    lines.push('Security gate PASSED. All thresholds met.');
  } else {
    lines.push('Security gate FAILED. Fix the issues above to pass.');
  }

  return {
    success: true,
    passed: gateResult.status === GATE_STATUS.PASSED,
    status: gateResult.status,
    failures: gateResult.failures,
    warnings: gateResult.warnings,
    metrics: securityMetrics,
    message: lines.join('\n')
  };
}

/**
 * Suggest fixes for security issues
 * @param {string} projectRoot - Project root path
 * @param {boolean} auto - Auto-fix where possible
 * @returns {Promise<Object>} Fix suggestions
 */
async function suggestFixes(projectRoot, auto) {
  const resultsPath = path.join(projectRoot, '.ctoc', 'security', 'latest-scan.json');

  if (!safeFs.existsSync(resultsPath)) {
    return {
      success: false,
      error: 'No security scan results found. Run "ctoc security scan" first.'
    };
  }

  const results = JSON.parse(safeFs.readFileSync(resultsPath, 'utf8'));
  const suggestions = [];
  const autoFixable = [];

  // Dependency vulnerability fixes
  if (results.dependencies && results.dependencies.vulnerabilities.length > 0) {
    const upgrades = new Map();

    for (const vuln of results.dependencies.vulnerabilities) {
      if (vuln.fixedIn && !upgrades.has(vuln.package)) {
        upgrades.set(vuln.package, {
          package: vuln.package,
          currentVersion: vuln.version,
          fixedVersion: vuln.fixedIn,
          severity: vuln.severity,
          command: getUpgradeCommand(vuln.manager, vuln.package, vuln.fixedIn)
        });
      }
    }

    for (const upgrade of upgrades.values()) {
      suggestions.push({
        type: 'dependency',
        severity: upgrade.severity,
        description: `Upgrade ${upgrade.package} from ${upgrade.currentVersion} to ${upgrade.fixedVersion}`,
        command: upgrade.command,
        autoFixable: true
      });
      autoFixable.push(upgrade);
    }
  }

  // SAST fix suggestions
  if (results.sast && results.sast.findings.length > 0) {
    const fixPatterns = {
      'sql-injection': 'Use parameterized queries instead of string concatenation',
      'xss': 'Sanitize user input and use safe templating',
      'path-traversal': 'Validate and sanitize file paths',
      'command-injection': 'Use subprocess with shell=False and validate input',
      'hardcoded-credentials': 'Move secrets to environment variables or secret manager'
    };

    const seen = new Set();
    for (const finding of results.sast.findings) {
      const ruleBase = finding.rule?.split('.').pop() || 'unknown';
      if (!seen.has(ruleBase)) {
        seen.add(ruleBase);
        const fix = Object.entries(fixPatterns).find(([key]) =>
          ruleBase.toLowerCase().includes(key.replace('-', ''))
        );
        suggestions.push({
          type: 'sast',
          severity: finding.severity,
          rule: finding.rule,
          description: fix ? fix[1] : `Review and fix ${finding.rule} violations`,
          files: results.sast.findings.filter(f => f.rule === finding.rule).map(f => f.file),
          autoFixable: false
        });
      }
    }
  }

  // Secrets fix suggestions
  if (results.secrets && results.secrets.findings.length > 0) {
    suggestions.push({
      type: 'secrets',
      severity: 'CRITICAL',
      description: 'Remove hardcoded secrets and rotate all exposed credentials',
      steps: [
        '1. Rotate all exposed credentials immediately',
        '2. Move secrets to environment variables or secret manager',
        '3. Add sensitive files to .gitignore',
        '4. Use git-filter-branch or BFG to remove from history',
        '5. Set up pre-commit hooks to prevent future leaks'
      ],
      files: results.secrets.findings.map(f => f.file),
      autoFixable: false
    });
  }

  const lines = [];
  lines.push('Security Fix Suggestions');
  lines.push('='.repeat(50));
  lines.push('');

  if (suggestions.length === 0) {
    lines.push('No security issues found. Good job!');
  } else {
    lines.push(`Found ${suggestions.length} fix suggestion(s)`);
    lines.push(`Auto-fixable: ${autoFixable.length}`);
    lines.push('');

    for (const suggestion of suggestions.slice(0, 20)) {
      lines.push(`[${suggestion.severity}] ${suggestion.type.toUpperCase()}`);
      lines.push(`  ${suggestion.description}`);
      if (suggestion.command) {
        lines.push(`  Command: ${suggestion.command}`);
      }
      if (suggestion.steps) {
        for (const step of suggestion.steps) {
          lines.push(`  ${step}`);
        }
      }
      lines.push('');
    }

    if (auto && autoFixable.length > 0) {
      lines.push('Auto-fix Commands:');
      lines.push('-'.repeat(30));
      for (const fix of autoFixable) {
        lines.push(`  ${fix.command}`);
      }
      lines.push('');
      lines.push('Run these commands to fix dependency vulnerabilities.');
    }
  }

  return {
    success: true,
    suggestions,
    autoFixable: autoFixable.length,
    message: lines.join('\n')
  };
}

/**
 * Get upgrade command for package manager
 * @param {string} manager - Package manager name
 * @param {string} pkg - Package name
 * @param {string} version - Target version
 * @returns {string} Upgrade command
 */
function getUpgradeCommand(manager, pkg, version) {
  const commands = {
    npm: `npm install ${pkg}@${version}`,
    yarn: `yarn upgrade ${pkg}@${version}`,
    pnpm: `pnpm update ${pkg}@${version}`,
    pip: `pip install --upgrade ${pkg}==${version}`,
    cargo: `cargo update -p ${pkg}`,
    bundler: `bundle update ${pkg}`,
    composer: `composer require ${pkg}:${version}`
  };

  return commands[manager] || `# Upgrade ${pkg} to ${version}`;
}

module.exports = {
  execute,
  runSecurityScan,
  generateSecurityReport,
  checkSecurityGate,
  suggestFixes
};
