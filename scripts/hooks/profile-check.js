#!/usr/bin/env node
/**
 * CTOC Profile Check Hook
 * Validates code against CTO profile red lines before edits
 *
 * Usage: node profile-check.js <language> <file_path>
 *
 * Checks for:
 * - Red line violations (non-negotiables)
 * - Anti-patterns specific to the language/framework
 * - Common mistakes from the CTO profile
 */

const fs = require('fs');
const path = require('path');
const {
  getCTOCRoot,
  readFileSafe,
  log,
  warn,
  error
} = require('../lib/utils');

const { getProfilePath } = require('../lib/stack-detector');
const { loadProfile, parseProfileSections } = require('../lib/profile-loader');

// ============================================================================
// Red Line Patterns
// ============================================================================

/**
 * Language-specific red line patterns
 * These are extracted from CTO profiles and checked against code
 */
const RED_LINE_PATTERNS = {
  python: [
    {
      pattern: /except\s*:/g,
      message: 'Bare except clause - always specify exception type',
      severity: 'error',
      fix: 'except Exception as e:'
    },
    {
      pattern: /from\s+typing\s+import\s+.*Optional/g,
      message: 'Python 3.10+ uses X | None instead of Optional[X]',
      severity: 'warning',
      fix: 'Use X | None syntax'
    },
    {
      pattern: /import\s+pickle/g,
      message: 'Pickle is insecure - use JSON or other safe serialization',
      severity: 'warning',
      fix: 'Use json or msgpack'
    },
    {
      pattern: /\.format\s*\(/g,
      message: 'Use f-strings instead of .format() for Python 3.6+',
      severity: 'warning',
      fix: 'Use f"..." syntax'
    },
    {
      pattern: /os\.system\s*\(/g,
      message: 'os.system is insecure - use subprocess.run with shell=False',
      severity: 'error',
      fix: 'subprocess.run([...], shell=False)'
    },
    {
      pattern: /eval\s*\(/g,
      message: 'eval() is dangerous - avoid executing arbitrary code',
      severity: 'error',
      fix: 'Use ast.literal_eval() or safer alternatives'
    }
  ],

  typescript: [
    {
      pattern: /:\s*any\b/g,
      message: 'Explicit any type - use proper typing or unknown',
      severity: 'warning',
      fix: 'Use specific type or unknown'
    },
    {
      pattern: /as\s+any\b/g,
      message: 'Type assertion to any - loses type safety',
      severity: 'warning',
      fix: 'Use proper type assertion'
    },
    {
      pattern: /\/\/\s*@ts-ignore/g,
      message: 'ts-ignore suppresses errors - fix the type issue instead',
      severity: 'warning',
      fix: 'Fix the type error properly'
    },
    {
      pattern: /console\.log\s*\(/g,
      message: 'console.log in production code - use proper logging',
      severity: 'warning',
      fix: 'Use a logger or remove'
    },
    {
      pattern: /\.then\s*\([^)]*\)\s*\.catch/g,
      message: 'Consider async/await instead of .then().catch()',
      severity: 'info',
      fix: 'Use async/await with try/catch'
    }
  ],

  javascript: [
    {
      pattern: /var\s+\w+/g,
      message: 'Use const or let instead of var',
      severity: 'warning',
      fix: 'Use const (preferred) or let'
    },
    {
      pattern: /==(?!=)/g,
      message: 'Use === instead of == for strict equality',
      severity: 'warning',
      fix: 'Use === or !=='
    },
    {
      pattern: /console\.log\s*\(/g,
      message: 'console.log in production code',
      severity: 'warning',
      fix: 'Use a logger or remove'
    },
    {
      pattern: /eval\s*\(/g,
      message: 'eval() is dangerous',
      severity: 'error',
      fix: 'Use safer alternatives'
    }
  ],

  go: [
    {
      pattern: /panic\s*\(/g,
      message: 'Avoid panic in application code - return errors instead',
      severity: 'warning',
      fix: 'Return error instead of panic'
    },
    {
      pattern: /fmt\.Print/g,
      message: 'Use structured logging instead of fmt.Print',
      severity: 'warning',
      fix: 'Use log/slog or zerolog'
    },
    {
      pattern: /interface\{\}/g,
      message: 'Empty interface loses type safety - use any or specific type',
      severity: 'warning',
      fix: 'Use any (Go 1.18+) or specific interface'
    },
    {
      pattern: /\berr\s*!=\s*nil\s*\{[\s\S]*?return\s+nil/g,
      message: 'Error swallowed - return or handle the error',
      severity: 'error',
      fix: 'Return or log the error'
    }
  ],

  rust: [
    {
      pattern: /\.unwrap\s*\(\)/g,
      message: 'unwrap() can panic - use ? or handle the error',
      severity: 'warning',
      fix: 'Use ? operator or match'
    },
    {
      pattern: /\.expect\s*\(/g,
      message: 'expect() can panic - consider proper error handling',
      severity: 'info',
      fix: 'Use ? operator or match for production code'
    },
    {
      pattern: /unsafe\s*\{/g,
      message: 'Unsafe block - ensure this is necessary and documented',
      severity: 'warning',
      fix: 'Document why unsafe is needed'
    }
  ]
};

// ============================================================================
// Checking Functions
// ============================================================================

/**
 * Checks code against red line patterns
 */
function checkRedLines(code, language) {
  const patterns = RED_LINE_PATTERNS[language] || [];
  const issues = [];

  const lines = code.split('\n');

  for (const { pattern, message, severity, fix } of patterns) {
    // Reset regex
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(code)) !== null) {
      // Find line number
      const beforeMatch = code.substring(0, match.index);
      const lineNumber = (beforeMatch.match(/\n/g) || []).length + 1;

      issues.push({
        line: lineNumber,
        column: match.index - beforeMatch.lastIndexOf('\n'),
        severity: severity,
        message: message,
        fix: fix,
        match: match[0].substring(0, 50) // Truncate long matches
      });
    }
  }

  return issues;
}

/**
 * Formats issues for output
 */
function formatIssues(issues, filePath) {
  if (issues.length === 0) {
    return null;
  }

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  const infos = issues.filter(i => i.severity === 'info');

  let output = `\n[CTOC] Profile check for ${path.basename(filePath)}:\n`;

  if (errors.length > 0) {
    output += `\n  ERRORS (${errors.length}):\n`;
    for (const issue of errors) {
      output += `    Line ${issue.line}: ${issue.message}\n`;
      output += `      Found: ${issue.match}\n`;
      output += `      Fix: ${issue.fix}\n`;
    }
  }

  if (warnings.length > 0) {
    output += `\n  WARNINGS (${warnings.length}):\n`;
    for (const issue of warnings) {
      output += `    Line ${issue.line}: ${issue.message}\n`;
      if (issue.fix) {
        output += `      Fix: ${issue.fix}\n`;
      }
    }
  }

  if (infos.length > 0) {
    output += `\n  INFO (${infos.length}):\n`;
    for (const issue of infos) {
      output += `    Line ${issue.line}: ${issue.message}\n`;
    }
  }

  return {
    output: output,
    hasErrors: errors.length > 0,
    errorCount: errors.length,
    warningCount: warnings.length,
    infoCount: infos.length
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: node profile-check.js <language> <file_path>');
    process.exit(0);
  }

  const language = args[0].toLowerCase();
  const filePath = args[1];

  // Read file content
  const content = readFileSafe(filePath);

  if (!content) {
    // File might not exist yet (new file), that's OK
    process.exit(0);
  }

  // Check red lines
  const issues = checkRedLines(content, language);

  if (issues.length === 0) {
    // No issues found
    process.exit(0);
  }

  // Format and output
  const result = formatIssues(issues, filePath);

  if (result) {
    console.log(result.output);

    // Exit with error if there are blocking issues
    if (result.hasErrors) {
      console.log('\n[CTOC] Fix errors before proceeding.\n');
      // Note: We exit 0 to not block Claude, but the message warns the user
      // In strict mode, we could exit 1 to block
    }
  }

  process.exit(0);
}

main();
