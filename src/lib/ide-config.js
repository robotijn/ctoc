/**
 * CTOC IDE Configuration Library
 * Handles IDE configuration generation, detection, and merging
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// IDE TYPES DEFINITION
// ---------------------------------------------------------------------------

const IDE_TYPES = {
  vscode: {
    name: 'Visual Studio Code',
    description: 'Microsoft VS Code editor',
    configDir: '.vscode',
    files: ['settings.json', 'extensions.json', 'launch.json', 'tasks.json'],
  },
  jetbrains: {
    name: 'JetBrains IDE',
    description: 'IntelliJ, PyCharm, WebStorm, GoLand, RustRover, etc.',
    configDir: '.idea',
    files: ['codeStyles/Project.xml', 'inspectionProfiles/Project_Default.xml'],
  },
  vim: {
    name: 'Vim/Neovim',
    description: 'Vim with coc.nvim or Neovim with native LSP',
    configDir: '.',
    files: ['coc-settings.json'],
  },
  cursor: {
    name: 'Cursor',
    description: 'AI-powered VS Code fork',
    configDir: '.cursor',
    files: ['settings.json'],
  },
};

// ---------------------------------------------------------------------------
// TEMPLATE DIRECTORY
// ---------------------------------------------------------------------------

/**
 * Get the templates directory path
 */
function getTemplatesDir() {
  // Look for templates in multiple locations
  const possiblePaths = [
    path.join(__dirname, '..', '..', '.ctoc', 'templates', 'ide'),
    path.join(__dirname, '..', '..', 'templates', 'ide'),
    path.join(process.cwd(), '.ctoc', 'templates', 'ide'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // Fallback to first path (for creation)
  return possiblePaths[0];
}

/**
 * Get templates for a specific IDE
 */
function getTemplatesForIDE(ideType) {
  const templatesDir = getTemplatesDir();
  const ideDir = path.join(templatesDir, ideType);

  if (!fs.existsSync(ideDir)) {
    return [];
  }

  const templates = [];
  const files = fs.readdirSync(ideDir);

  files.forEach(file => {
    if (file.endsWith('.template')) {
      templates.push({
        name: file.replace('.template', ''),
        path: path.join(ideDir, file),
      });
    }
  });

  return templates;
}

// ---------------------------------------------------------------------------
// IDE DETECTION
// ---------------------------------------------------------------------------

/**
 * Detect current IDE from environment variables
 */
function detectIDE(projectPath) {
  // VS Code detection
  if (
    process.env.TERM_PROGRAM === 'vscode' ||
    process.env.VSCODE_IPC_HOOK ||
    process.env.VSCODE_GIT_IPC_HANDLE
  ) {
    return { type: 'vscode', name: 'Visual Studio Code' };
  }

  // Cursor detection
  if (
    process.env.TERM_PROGRAM === 'cursor' ||
    process.env.CURSOR_CHANNEL
  ) {
    return { type: 'cursor', name: 'Cursor' };
  }

  // JetBrains detection
  if (
    process.env.TERMINAL_EMULATOR?.includes('JetBrains') ||
    process.env.JETBRAINS_REMOTE_RUN
  ) {
    return { type: 'jetbrains', name: 'JetBrains IDE' };
  }

  // Vim/Neovim detection
  if (process.env.VIM || process.env.NVIM || process.env.NVIM_LISTEN_ADDRESS) {
    return { type: 'vim', name: 'Vim/Neovim' };
  }

  // Check for existing configurations in project
  if (projectPath) {
    if (fs.existsSync(path.join(projectPath, '.cursor'))) {
      return { type: 'cursor', name: 'Cursor (detected from config)' };
    }
    if (fs.existsSync(path.join(projectPath, '.vscode'))) {
      return { type: 'vscode', name: 'VS Code (detected from config)' };
    }
    if (fs.existsSync(path.join(projectPath, '.idea'))) {
      return { type: 'jetbrains', name: 'JetBrains (detected from config)' };
    }
    if (fs.existsSync(path.join(projectPath, 'coc-settings.json'))) {
      return { type: 'vim', name: 'Vim/CoC (detected from config)' };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// TEMPLATE PROCESSING
// ---------------------------------------------------------------------------

/**
 * Read and process a template file
 */
function readTemplate(templatePath) {
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  let content = fs.readFileSync(templatePath, 'utf8');

  // Process template variables (if any)
  // {{PROJECT_NAME}}, {{YEAR}}, etc.
  content = content.replace(/\{\{YEAR\}\}/g, new Date().getFullYear().toString());
  content = content.replace(/\{\{DATE\}\}/g, new Date().toISOString().split('T')[0]);

  return content;
}

/**
 * Filter template content based on detected stack
 */
function filterTemplateForStack(content, stack, filePath) {
  // For JSON files, we could selectively include/exclude sections
  // For now, return full content - templates are comprehensive
  return content;
}

// ---------------------------------------------------------------------------
// CONFIGURATION GENERATION
// ---------------------------------------------------------------------------

/**
 * Generate IDE configuration files
 */
function generateConfig(projectPath, ideType, stack) {
  const templates = getTemplatesForIDE(ideType);
  const generated = [];
  const ideConfig = IDE_TYPES[ideType];

  if (!ideConfig) {
    throw new Error(`Unknown IDE type: ${ideType}`);
  }

  templates.forEach(template => {
    const content = readTemplate(template.path);
    const filteredContent = filterTemplateForStack(content, stack, template.name);

    // Determine output path
    let outputPath;
    if (ideType === 'vim' && template.name === 'coc-settings.json') {
      outputPath = 'coc-settings.json';
    } else if (ideType === 'vim' && template.name === 'init.lua') {
      // init.lua is a reference, not written to project
      // Skip or write to a reference location
      outputPath = '.ctoc/reference/init.lua';
    } else if (ideType === 'jetbrains') {
      // Map JetBrains templates to proper locations
      const nameMap = {
        'codeStyles.xml': 'codeStyles/Project.xml',
        'inspectionProfiles.xml': 'inspectionProfiles/Project_Default.xml',
        'runConfigurations.xml': 'runConfigurations/README.xml',
      };
      outputPath = path.join(ideConfig.configDir, nameMap[template.name] || template.name);
    } else {
      outputPath = path.join(ideConfig.configDir, template.name);
    }

    generated.push({
      name: template.name,
      path: outputPath,
      content: filteredContent,
    });
  });

  return generated;
}

// ---------------------------------------------------------------------------
// CONFIGURATION MERGING
// ---------------------------------------------------------------------------

/**
 * Deep merge two objects
 */
function deepMerge(target, source) {
  const output = { ...target };

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else if (Array.isArray(source[key]) && Array.isArray(target[key])) {
        // Merge arrays (unique values)
        output[key] = [...new Set([...target[key], ...source[key]])];
      } else {
        output[key] = source[key];
      }
    });
  }

  return output;
}

/**
 * Check if value is a plain object
 */
function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Parse JSON with comments (JSONC)
 */
function parseJsonc(content) {
  // Remove single-line comments
  let cleaned = content.replace(/\/\/.*$/gm, '');
  // Remove multi-line comments
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove trailing commas
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Failed to parse JSON: ${e.message}`);
  }
}

/**
 * Merge existing configuration with new template
 */
function mergeConfigs(existingContent, newContent) {
  try {
    const existing = parseJsonc(existingContent);
    const template = parseJsonc(newContent);

    // Merge with existing taking precedence for user-defined values
    // but adding new keys from template
    const merged = deepMerge(template, existing);

    // Format output
    return JSON.stringify(merged, null, 2);
  } catch (e) {
    // If parsing fails, return new content
    throw new Error(`Merge failed: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

module.exports = {
  IDE_TYPES,
  getTemplatesDir,
  getTemplatesForIDE,
  detectIDE,
  readTemplate,
  generateConfig,
  mergeConfigs,
  deepMerge,
  parseJsonc,
};
