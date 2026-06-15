#!/usr/bin/env node
/**
 * CTOC IDE Configuration Command
 * Generates IDE configuration files for projects
 *
 * Usage:
 *   ctoc ide init [vscode|jetbrains|vim|cursor|all]
 *   ctoc ide detect
 *   ctoc ide list
 */

const fs = require('fs');
const path = require('path');
const { detectStack } = require('../lib/stack-detector');
const {
  detectIDE,
  generateConfig,
  mergeConfigs,
  IDE_TYPES,
  getTemplatesForIDE,
} = require('../lib/ide-config');

// Colors for terminal output
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

/**
 * Print help message
 */
function printHelp() {
  console.log(`
${c.bold}CTOC IDE Configuration${c.reset}

${c.cyan}USAGE:${c.reset}
  ctoc ide init [ide]     Generate IDE configuration files
  ctoc ide detect         Detect current IDE environment
  ctoc ide list           List available IDE configurations

${c.cyan}IDE OPTIONS:${c.reset}
  vscode      Visual Studio Code
  jetbrains   JetBrains IDEs (IntelliJ, PyCharm, WebStorm, etc.)
  vim         Vim/Neovim
  cursor      Cursor IDE
  all         Generate for all IDEs

${c.cyan}EXAMPLES:${c.reset}
  ctoc ide init vscode    Generate VS Code settings
  ctoc ide init jetbrains Generate JetBrains settings
  ctoc ide init all       Generate for all IDEs
  ctoc ide detect         Auto-detect and show current IDE

${c.cyan}OPTIONS:${c.reset}
  --dry-run     Show what would be generated without writing
  --force       Overwrite existing files without merging
  --merge       Merge with existing configurations (default)

${c.cyan}FILES GENERATED:${c.reset}

${c.bold}VS Code (.vscode/):${c.reset}
  - settings.json       Editor & formatter settings
  - extensions.json     Recommended extensions
  - launch.json         Debug configurations
  - tasks.json          Build & test tasks

${c.bold}JetBrains (.idea/):${c.reset}
  - codeStyles/         Code formatting settings
  - inspectionProfiles/ Inspection settings
  - runConfigurations/  Run/debug configurations

${c.bold}Vim/Neovim:${c.reset}
  - coc-settings.json   CoC configuration
  - init.lua            Neovim native LSP setup

${c.bold}Cursor (.cursor/):${c.reset}
  - settings.json       Cursor-specific settings
`);
}

/**
 * Detect and display IDE environment
 */
function detectCommand(projectPath) {
  const detected = detectIDE(projectPath);
  const stack = detectStack(projectPath);

  console.log(`\n${c.bold}IDE Detection Results${c.reset}`);
  console.log('─'.repeat(50));

  console.log(`\n${c.cyan}Environment:${c.reset}`);
  console.log(`  TERM_PROGRAM: ${process.env.TERM_PROGRAM || 'not set'}`);
  console.log(`  VSCODE_*:     ${process.env.VSCODE_IPC_HOOK ? 'detected' : 'not detected'}`);
  console.log(`  JETBRAINS_*:  ${process.env.TERMINAL_EMULATOR?.includes('JetBrains') ? 'detected' : 'not detected'}`);
  console.log(`  VIM:          ${process.env.VIM ? 'detected' : 'not detected'}`);
  console.log(`  NVIM:         ${process.env.NVIM ? 'detected' : 'not detected'}`);

  console.log(`\n${c.cyan}Detected IDE:${c.reset}`);
  if (detected) {
    console.log(`  ${c.green}${detected.name}${c.reset} (${detected.type})`);
  } else {
    console.log(`  ${c.dim}Unable to detect IDE from environment${c.reset}`);
  }

  console.log(`\n${c.cyan}Existing Configurations:${c.reset}`);
  const existingConfigs = checkExistingConfigs(projectPath);
  if (existingConfigs.length > 0) {
    existingConfigs.forEach(config => {
      console.log(`  ${c.green}✓${c.reset} ${config}`);
    });
  } else {
    console.log(`  ${c.dim}No IDE configurations found${c.reset}`);
  }

  console.log(`\n${c.cyan}Project Stack:${c.reset}`);
  console.log(`  Languages:  ${stack.languages.join(', ') || 'none detected'}`);
  console.log(`  Frameworks: ${stack.frameworks.join(', ') || 'none detected'}`);

  console.log();
  return detected;
}

/**
 * Check for existing IDE configurations
 */
function checkExistingConfigs(projectPath) {
  const configs = [];
  const checks = [
    { path: '.vscode', name: 'VS Code' },
    { path: '.idea', name: 'JetBrains' },
    { path: 'coc-settings.json', name: 'CoC (Vim)' },
    { path: '.cursor', name: 'Cursor' },
  ];

  checks.forEach(check => {
    if (fs.existsSync(path.join(projectPath, check.path))) {
      configs.push(check.name);
    }
  });

  return configs;
}

/**
 * List available IDE configurations
 */
function listCommand() {
  console.log(`\n${c.bold}Available IDE Configurations${c.reset}`);
  console.log('─'.repeat(50));

  Object.entries(IDE_TYPES).forEach(([key, value]) => {
    console.log(`\n${c.cyan}${value.name}${c.reset} (${key})`);
    console.log(`  ${c.dim}${value.description}${c.reset}`);

    const templates = getTemplatesForIDE(key);
    if (templates.length > 0) {
      console.log(`  Templates:`);
      templates.forEach(t => {
        console.log(`    - ${t.name}`);
      });
    }
  });

  console.log();
}

/**
 * Initialize IDE configuration
 */
function initCommand(projectPath, ideType, options = {}) {
  const { dryRun, force, merge } = options;

  // Validate IDE type
  if (ideType !== 'all' && !IDE_TYPES[ideType]) {
    console.error(`${c.red}Error: Unknown IDE type '${ideType}'${c.reset}`);
    console.log(`Available: ${Object.keys(IDE_TYPES).join(', ')}, all`);
    process.exit(1);
  }

  // Detect project stack for context
  const stack = detectStack(projectPath);

  console.log(`\n${c.bold}CTOC IDE Configuration${c.reset}`);
  console.log('─'.repeat(50));
  console.log(`Project: ${projectPath}`);
  console.log(`Languages: ${stack.languages.join(', ') || 'auto-detect'}`);
  console.log(`IDE: ${ideType === 'all' ? 'All supported IDEs' : IDE_TYPES[ideType].name}`);
  console.log(`Mode: ${dryRun ? 'dry-run' : force ? 'force overwrite' : 'merge'}`);
  console.log();

  const idesToProcess = ideType === 'all' ? Object.keys(IDE_TYPES) : [ideType];
  const results = [];

  idesToProcess.forEach(ide => {
    console.log(`${c.cyan}Generating ${IDE_TYPES[ide].name} configuration...${c.reset}`);

    try {
      const generated = generateConfig(projectPath, ide, stack);

      generated.forEach(file => {
        const targetPath = path.join(projectPath, file.path);
        const exists = fs.existsSync(targetPath);

        if (dryRun) {
          console.log(`  ${c.dim}[dry-run]${c.reset} ${exists ? 'update' : 'create'}: ${file.path}`);
          results.push({ file: file.path, status: 'dry-run' });
          return;
        }

        // Ensure directory exists
        const dir = path.dirname(targetPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        let finalContent = file.content;

        // Merge with existing if applicable
        if (exists && !force && merge !== false) {
          try {
            const existingContent = fs.readFileSync(targetPath, 'utf8');
            if (file.path.endsWith('.json')) {
              finalContent = mergeConfigs(existingContent, file.content);
              console.log(`  ${c.green}✓${c.reset} merged: ${file.path}`);
            } else {
              // For non-JSON files, don't overwrite
              console.log(`  ${c.yellow}⚠${c.reset} skipped (exists): ${file.path}`);
              results.push({ file: file.path, status: 'skipped' });
              return;
            }
          } catch (e) {
            // If merge fails, use new content
            console.log(`  ${c.yellow}⚠${c.reset} merge failed, overwriting: ${file.path}`);
          }
        }

        fs.writeFileSync(targetPath, finalContent);
        console.log(`  ${c.green}✓${c.reset} ${exists ? 'updated' : 'created'}: ${file.path}`);
        results.push({ file: file.path, status: exists ? 'updated' : 'created' });
      });

    } catch (error) {
      console.error(`  ${c.red}✗${c.reset} Error: ${error.message}`);
      results.push({ file: ide, status: 'error', error: error.message });
    }
  });

  // Summary
  console.log(`\n${c.bold}Summary${c.reset}`);
  console.log('─'.repeat(50));
  const created = results.filter(r => r.status === 'created').length;
  const updated = results.filter(r => r.status === 'updated').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errors = results.filter(r => r.status === 'error').length;

  if (dryRun) {
    console.log(`Would generate ${results.length} file(s)`);
  } else {
    console.log(`Created: ${created}, Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}`);
  }

  // Recommendations
  if (!dryRun && (created > 0 || updated > 0)) {
    console.log(`\n${c.cyan}Recommendations:${c.reset}`);
    console.log('  1. Review generated configurations');
    console.log('  2. Customize settings for your project');
    console.log('  3. Add .vscode/settings.json to .gitignore if it contains local paths');
    console.log('  4. Share .vscode/extensions.json with your team');
  }

  console.log();
  return results;
}

/**
 * Main entry point
 */
function main() {
  const args = process.argv.slice(2);
  const projectPath = process.cwd();

  // Parse options
  const options = {
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    merge: !args.includes('--no-merge'),
  };

  // Remove options from args
  const cleanArgs = args.filter(a => !a.startsWith('--'));
  const command = cleanArgs[0];
  const subCommand = cleanArgs[1];

  // Handle commands
  switch (command) {
    case 'detect':
      detectCommand(projectPath);
      break;

    case 'list':
      listCommand();
      break;

    case 'init':
      if (!subCommand) {
        // Auto-detect IDE
        const detected = detectIDE(projectPath);
        if (detected) {
          console.log(`Auto-detected IDE: ${detected.name}`);
          initCommand(projectPath, detected.type, options);
        } else {
          console.log('Could not auto-detect IDE. Please specify:');
          console.log('  ctoc ide init [vscode|jetbrains|vim|cursor|all]');
          process.exit(1);
        }
      } else {
        initCommand(projectPath, subCommand, options);
      }
      break;

    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;

    default:
      if (command) {
        console.error(`Unknown command: ${command}`);
      }
      printHelp();
      process.exit(command ? 1 : 0);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  detectCommand,
  listCommand,
  initCommand,
};
