/**
 * CI Configuration Parser
 *
 * Parses CI configurations from various systems and extracts checks.
 * Supports: GitHub Actions, GitLab CI, Jenkins, CircleCI
 *
 * @module lib/ci-parser
 */

const fs = require('fs');
const path = require('path');

// CI system definitions
const CI_SYSTEMS = {
  github: {
    name: 'GitHub Actions',
    detect: (projectPath) => {
      const workflowDir = path.join(projectPath, '.github', 'workflows');
      if (!fs.existsSync(workflowDir)) return null;

      const files = fs.readdirSync(workflowDir)
        .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

      if (files.length === 0) return null;
      return path.join(workflowDir, files[0]);
    }
  },
  gitlab: {
    name: 'GitLab CI',
    detect: (projectPath) => {
      const configPath = path.join(projectPath, '.gitlab-ci.yml');
      return fs.existsSync(configPath) ? configPath : null;
    }
  },
  jenkins: {
    name: 'Jenkins',
    detect: (projectPath) => {
      const configPath = path.join(projectPath, 'Jenkinsfile');
      return fs.existsSync(configPath) ? configPath : null;
    }
  },
  circleci: {
    name: 'CircleCI',
    detect: (projectPath) => {
      const configPath = path.join(projectPath, '.circleci', 'config.yml');
      return fs.existsSync(configPath) ? configPath : null;
    }
  }
};

/**
 * Check types for categorization
 */
const CHECK_TYPES = {
  LINT: 'lint',
  TEST: 'test',
  TYPE_CHECK: 'type-check',
  BUILD: 'build',
  COVERAGE: 'coverage',
  SECURITY: 'security',
  FORMAT: 'format',
  INSTALL: 'install',
  UNKNOWN: 'unknown'
};

/**
 * Detect check type from command
 * @param {string} command - Command string
 * @returns {string} Check type
 */
function detectCheckType(command) {
  const cmd = command.toLowerCase();

  // Security checks first (before test, since "snyk test" contains "test")
  if (cmd.includes('audit') || cmd.includes('snyk') || cmd.includes('security') ||
      cmd.includes('trivy') || cmd.includes('bandit')) {
    return CHECK_TYPES.SECURITY;
  }
  if (cmd.includes('eslint') || /\blint\b/.test(cmd)) {
    return CHECK_TYPES.LINT;
  }
  // Test frameworks - be more specific to avoid matching "snyk test"
  if (cmd.includes('jest') || cmd.includes('mocha') || cmd.includes('vitest') ||
      cmd.includes('pytest') || cmd.includes('cargo test') || cmd.includes('go test') ||
      /\bnpm\s+test\b/.test(cmd) || /\bnode\s+--test\b/.test(cmd) ||
      /\brun\s+test\b/.test(cmd)) {
    return CHECK_TYPES.TEST;
  }
  if (cmd.includes('tsc') || cmd.includes('type-check') || cmd.includes('typecheck') ||
      cmd.includes('mypy') || cmd.includes('pyright')) {
    return CHECK_TYPES.TYPE_CHECK;
  }
  if (cmd.includes('build') || cmd.includes('compile')) {
    return CHECK_TYPES.BUILD;
  }
  if (cmd.includes('coverage') || cmd.includes('nyc') || cmd.includes('c8')) {
    return CHECK_TYPES.COVERAGE;
  }
  if (cmd.includes('prettier') || cmd.includes('format')) {
    return CHECK_TYPES.FORMAT;
  }
  if (cmd.includes('install') || cmd.includes('npm ci') || cmd.includes('yarn install')) {
    return CHECK_TYPES.INSTALL;
  }

  return CHECK_TYPES.UNKNOWN;
}

/**
 * Filter to relevant checks (exclude install, cache, etc.)
 * @param {Array} checks - All extracted checks
 * @returns {Array} Relevant checks only
 */
function filterRelevantChecks(checks) {
  const excludePatterns = [
    /^echo\s/i,
    /^cat\s/i,
    /^mkdir\s/i,
    /^cd\s/i,
    /^export\s/i,
    /^which\s/i,
    /^ls\s/i,
    /checkout/i,
    /setup-node/i,
    /upload-artifact/i,
    /download-artifact/i,
    /cache/i
  ];

  return checks.filter(check => {
    // Include tests, lint, type-check, build, coverage, security
    if ([CHECK_TYPES.TEST, CHECK_TYPES.LINT, CHECK_TYPES.TYPE_CHECK,
         CHECK_TYPES.BUILD, CHECK_TYPES.COVERAGE, CHECK_TYPES.SECURITY,
         CHECK_TYPES.FORMAT].includes(check.type)) {
      return true;
    }

    // Exclude install steps
    if (check.type === CHECK_TYPES.INSTALL) {
      return false;
    }

    // Exclude matching exclude patterns
    for (const pattern of excludePatterns) {
      if (pattern.test(check.command)) {
        return false;
      }
    }

    // Include unknown if command looks substantial
    return check.command.length > 3;
  });
}

/**
 * Detect CI system in use
 * @param {string} projectPath - Project root
 * @returns {Object|null} Detected system info
 */
function detectCISystem(projectPath) {
  for (const [systemId, config] of Object.entries(CI_SYSTEMS)) {
    const configPath = config.detect(projectPath);
    if (configPath) {
      return {
        system: systemId,
        name: config.name,
        configPath
      };
    }
  }
  return null;
}

/**
 * Parse GitHub Actions workflow
 * @param {string} workflowPath - Path to workflow file
 * @param {string} projectPath - Project root
 * @returns {Object} Parsed CI config
 */
function parseGitHubActions(workflowPath, projectPath) {
  const content = fs.readFileSync(workflowPath, 'utf8');
  const checks = [];
  let container = null;
  let nodeVersion = null;

  // Extract jobs and their steps
  // Simple regex-based parsing for common patterns

  // Extract container image
  const containerMatch = content.match(/container:\s*['"]?([^\s'"]+)/);
  if (containerMatch) {
    container = containerMatch[1];
  }

  // Extract node version
  const nodeMatch = content.match(/node-version:\s*['"]?(\d+)/);
  if (nodeMatch) {
    nodeVersion = nodeMatch[1];
  }

  // Extract run commands
  const runRegex = /-\s*name:\s*([^\n]+)\s*\n\s*run:\s*\|?\s*\n?((?:[ \t]+[^\n]+\n?)+|[^\n]+)/g;
  let match;

  while ((match = runRegex.exec(content)) !== null) {
    const name = match[1].trim();
    const commands = match[2].trim().split('\n').map(c => c.trim()).filter(c => c);

    for (const cmd of commands) {
      checks.push({
        name: name,
        command: cmd,
        type: detectCheckType(cmd),
        job: 'main'
      });
    }
  }

  // Also extract simple `run:` lines
  const simpleRunRegex = /run:\s*([^\n|]+)$/gm;
  while ((match = simpleRunRegex.exec(content)) !== null) {
    const cmd = match[1].trim();
    if (cmd && !checks.some(c => c.command === cmd)) {
      checks.push({
        name: cmd.slice(0, 40),
        command: cmd,
        type: detectCheckType(cmd),
        job: 'main'
      });
    }
  }

  // Derive container from node version if not specified
  if (!container && nodeVersion) {
    container = `node:${nodeVersion}-alpine`;
  }

  return {
    found: true,
    system: 'github',
    configPath: workflowPath,
    checks: filterRelevantChecks(checks),
    container: container || detectDefaultContainer(projectPath),
    nodeVersion
  };
}

/**
 * Parse GitLab CI configuration
 * @param {string} configPath - Path to config
 * @param {string} projectPath - Project root
 * @returns {Object} Parsed CI config
 */
function parseGitLabCI(configPath, projectPath) {
  const content = fs.readFileSync(configPath, 'utf8');
  const checks = [];
  let container = null;

  // Extract global image
  const imageMatch = content.match(/^image:\s*['"]?([^\s'"]+)/m);
  if (imageMatch) {
    container = imageMatch[1];
  }

  // Extract script commands (simple parsing)
  const scriptRegex = /script:\s*\n((?:[ \t]+-[^\n]+\n?)+)/g;
  let match;

  while ((match = scriptRegex.exec(content)) !== null) {
    const scripts = match[1].split('\n')
      .map(line => line.trim().replace(/^-\s*/, ''))
      .filter(line => line);

    for (const cmd of scripts) {
      checks.push({
        name: cmd.slice(0, 40),
        command: cmd,
        type: detectCheckType(cmd),
        job: 'gitlab'
      });
    }
  }

  return {
    found: true,
    system: 'gitlab',
    configPath,
    checks: filterRelevantChecks(checks),
    container: container || detectDefaultContainer(projectPath)
  };
}

/**
 * Parse Jenkinsfile
 * @param {string} configPath - Path to Jenkinsfile
 * @param {string} projectPath - Project root
 * @returns {Object} Parsed CI config
 */
function parseJenkinsfile(configPath, projectPath) {
  const content = fs.readFileSync(configPath, 'utf8');
  const checks = [];
  let container = null;

  // Extract docker image
  const dockerMatch = content.match(/docker\s*\{\s*image\s+['"](.*?)['"]/);
  if (dockerMatch) {
    container = dockerMatch[1];
  }

  // Extract sh commands
  const shRegex = /sh\s+['"]([^'"]+)['"]/g;
  let match;

  while ((match = shRegex.exec(content)) !== null) {
    const cmd = match[1];
    checks.push({
      name: cmd.slice(0, 40),
      command: cmd,
      type: detectCheckType(cmd),
      job: 'jenkins'
    });
  }

  return {
    found: true,
    system: 'jenkins',
    configPath,
    checks: filterRelevantChecks(checks),
    container: container || detectDefaultContainer(projectPath)
  };
}

/**
 * Parse CircleCI configuration
 * @param {string} configPath - Path to config
 * @param {string} projectPath - Project root
 * @returns {Object} Parsed CI config
 */
function parseCircleCI(configPath, projectPath) {
  const content = fs.readFileSync(configPath, 'utf8');
  const checks = [];
  let container = null;

  // Extract docker image
  const dockerMatch = content.match(/docker:\s*\n\s*-\s*image:\s*['"]?([^\s'"]+)/);
  if (dockerMatch) {
    container = dockerMatch[1];
  }

  // Extract run commands
  const runRegex = /run:\s*([^\n]+|name:[^\n]+\s*command:[^\n]+)/g;
  let match;

  while ((match = runRegex.exec(content)) !== null) {
    let cmd = match[1].trim();
    // Handle command: syntax
    const cmdMatch = cmd.match(/command:\s*(.+)/);
    if (cmdMatch) {
      cmd = cmdMatch[1].trim();
    }

    if (cmd && !cmd.startsWith('name:')) {
      checks.push({
        name: cmd.slice(0, 40),
        command: cmd,
        type: detectCheckType(cmd),
        job: 'circleci'
      });
    }
  }

  return {
    found: true,
    system: 'circleci',
    configPath,
    checks: filterRelevantChecks(checks),
    container: container || detectDefaultContainer(projectPath)
  };
}

/**
 * Detect default container based on project
 * @param {string} projectPath - Project root
 * @returns {string|null} Container image or null
 */
function detectDefaultContainer(projectPath) {
  // Check for Node.js
  const packageJson = path.join(projectPath, 'package.json');
  if (fs.existsSync(packageJson)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
      const engines = pkg.engines?.node;
      if (engines) {
        const version = engines.match(/\d+/)?.[0] || '20';
        return `node:${version}-alpine`;
      }
    } catch (e) { /* ignore: best-effort, non-fatal */ }
    return 'node:20-alpine';
  }

  // Check for Python
  const requirementsTxt = path.join(projectPath, 'requirements.txt');
  const pyprojectToml = path.join(projectPath, 'pyproject.toml');
  if (fs.existsSync(requirementsTxt) || fs.existsSync(pyprojectToml)) {
    return 'python:3.11-slim';
  }

  // Check for Go
  const goMod = path.join(projectPath, 'go.mod');
  if (fs.existsSync(goMod)) {
    return 'golang:1.22-alpine';
  }

  // Check for Rust
  const cargoToml = path.join(projectPath, 'Cargo.toml');
  if (fs.existsSync(cargoToml)) {
    return 'rust:1.75-alpine';
  }

  return null;
}

/**
 * Get default checks when no CI config found
 * @param {string} projectPath - Project root
 * @returns {Array} Default checks
 */
function getDefaultChecks(projectPath) {
  const checks = [];
  const packageJson = path.join(projectPath, 'package.json');

  if (fs.existsSync(packageJson)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
      const scripts = pkg.scripts || {};

      if (scripts.lint) {
        checks.push({ name: 'Lint', command: 'npm run lint', type: CHECK_TYPES.LINT });
      }
      if (scripts.test) {
        checks.push({ name: 'Test', command: 'npm test', type: CHECK_TYPES.TEST });
      }
      if (scripts.typecheck || scripts['type-check']) {
        checks.push({ name: 'Type Check', command: 'npm run typecheck', type: CHECK_TYPES.TYPE_CHECK });
      }
      if (scripts.build) {
        checks.push({ name: 'Build', command: 'npm run build', type: CHECK_TYPES.BUILD });
      }
    } catch (e) { /* ignore: best-effort, non-fatal */ }
  }

  // If no checks found, add common defaults
  if (checks.length === 0) {
    checks.push(
      { name: 'Lint', command: 'npm run lint', type: CHECK_TYPES.LINT },
      { name: 'Test', command: 'npm test', type: CHECK_TYPES.TEST }
    );
  }

  return checks;
}

/**
 * Main entry point - parse CI config for project
 * @param {string} projectPath - Project root
 * @returns {Object} CI configuration
 */
function parseCIConfig(projectPath = process.cwd()) {
  const detected = detectCISystem(projectPath);

  if (!detected) {
    return {
      found: false,
      system: null,
      checks: getDefaultChecks(projectPath),
      container: detectDefaultContainer(projectPath)
    };
  }

  const parsers = {
    github: parseGitHubActions,
    gitlab: parseGitLabCI,
    jenkins: parseJenkinsfile,
    circleci: parseCircleCI
  };

  const parser = parsers[detected.system];
  if (!parser) {
    return {
      found: false,
      system: detected.system,
      checks: getDefaultChecks(projectPath),
      container: detectDefaultContainer(projectPath)
    };
  }

  try {
    return parser(detected.configPath, projectPath);
  } catch (e) {
    return {
      found: true,
      system: detected.system,
      configPath: detected.configPath,
      parseError: e.message,
      checks: getDefaultChecks(projectPath),
      container: detectDefaultContainer(projectPath)
    };
  }
}

module.exports = {
  parseCIConfig,
  detectCISystem,
  detectCheckType,
  filterRelevantChecks,
  getDefaultChecks,
  detectDefaultContainer,
  CHECK_TYPES,
  CI_SYSTEMS
};
