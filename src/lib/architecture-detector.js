/**
 * Architecture Detector
 * Detects architecture patterns and finds violations
 *
 * Supports:
 * - Layered architecture (controllers/services/repositories)
 * - Hexagonal architecture (ports/adapters)
 * - Vertical slices (features)
 * - MVC pattern
 */

const fs = require('fs');
const path = require('path');

/**
 * Architecture patterns with their detection markers and rules
 * @type {Object.<string, Object>}
 */
const PATTERNS = {
  layered: {
    name: 'Layered Architecture',
    description: 'Traditional layered architecture with controllers, services, and repositories',
    markers: ['controllers', 'services', 'repositories', 'models'],
    layers: ['controllers', 'services', 'repositories', 'models'],
    rules: [
      { from: 'controllers', to: 'services', allowed: true },
      { from: 'controllers', to: 'repositories', allowed: false },
      { from: 'controllers', to: 'models', allowed: true },
      { from: 'services', to: 'repositories', allowed: true },
      { from: 'services', to: 'models', allowed: true },
      { from: 'services', to: 'controllers', allowed: false },
      { from: 'repositories', to: 'models', allowed: true },
      { from: 'repositories', to: 'services', allowed: false },
      { from: 'repositories', to: 'controllers', allowed: false },
      { from: 'models', to: 'controllers', allowed: false },
      { from: 'models', to: 'services', allowed: false },
      { from: 'models', to: 'repositories', allowed: false }
    ]
  },
  hexagonal: {
    name: 'Hexagonal Architecture',
    description: 'Ports and adapters architecture',
    markers: ['ports', 'adapters', 'domain', 'application'],
    layers: ['adapters', 'ports', 'application', 'domain'],
    rules: [
      { from: 'adapters', to: 'ports', allowed: true },
      { from: 'adapters', to: 'application', allowed: true },
      { from: 'adapters', to: 'domain', allowed: false },
      { from: 'ports', to: 'application', allowed: true },
      { from: 'ports', to: 'domain', allowed: false },
      { from: 'ports', to: 'adapters', allowed: false },
      { from: 'application', to: 'domain', allowed: true },
      { from: 'application', to: 'adapters', allowed: false },
      { from: 'application', to: 'ports', allowed: true },
      { from: 'domain', to: 'adapters', allowed: false },
      { from: 'domain', to: 'ports', allowed: false },
      { from: 'domain', to: 'application', allowed: false }
    ]
  },
  verticalSlices: {
    name: 'Vertical Slices',
    description: 'Feature-based architecture where each feature is self-contained',
    markers: ['features', 'modules'],
    layers: [], // No strict layers, features are self-contained
    rules: [] // Rules are per-feature isolation
  },
  mvc: {
    name: 'Model-View-Controller',
    description: 'Classic MVC pattern',
    markers: ['views', 'controllers', 'models'],
    layers: ['views', 'controllers', 'models'],
    rules: [
      { from: 'views', to: 'controllers', allowed: true },
      { from: 'views', to: 'models', allowed: true },
      { from: 'controllers', to: 'models', allowed: true },
      { from: 'controllers', to: 'views', allowed: true },
      { from: 'models', to: 'views', allowed: false },
      { from: 'models', to: 'controllers', allowed: false }
    ]
  }
};

/**
 * Architecture Detector class
 * Detects patterns and finds violations
 */
class ArchitectureDetector {
  /**
   * Create an ArchitectureDetector instance
   * @param {string} projectRoot - Root directory of the project
   */
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.importCache = null;
  }

  /**
   * Check if a directory exists in the project
   * @param {string} dirName - Directory name to check
   * @returns {boolean} True if directory exists
   */
  directoryExists(dirName) {
    // Check in common source directories
    const searchPaths = [
      path.join(this.projectRoot, 'src', dirName),
      path.join(this.projectRoot, dirName),
      path.join(this.projectRoot, 'app', dirName),
      path.join(this.projectRoot, 'lib', dirName)
    ];

    return searchPaths.some(p => {
      try {
        return fs.existsSync(p) && fs.statSync(p).isDirectory();
      } catch (e) {
        return false;
      }
    });
  }

  /**
   * Detect architecture pattern based on directory structure
   * @returns {string|null} Pattern name or null if not recognized
   */
  detect() {
    const scores = {};

    for (const [name, pattern] of Object.entries(PATTERNS)) {
      const matchCount = pattern.markers.filter(
        m => this.directoryExists(m)
      ).length;

      const score = matchCount / pattern.markers.length;
      scores[name] = score;
    }

    // Find best match (threshold: 50% of markers present)
    let bestPattern = null;
    let bestScore = 0;

    for (const [name, score] of Object.entries(scores)) {
      if (score >= 0.5 && score > bestScore) {
        bestPattern = name;
        bestScore = score;
      }
    }

    return bestPattern;
  }

  /**
   * Build import graph from source files
   * @returns {Array.<Object>} Array of imports with from, to, file, line
   */
  buildImportGraph() {
    if (this.importCache) {
      return this.importCache;
    }

    const imports = [];
    const sourceFiles = this.findSourceFiles();

    for (const file of sourceFiles) {
      const fileImports = this.parseImports(file);
      imports.push(...fileImports);
    }

    this.importCache = imports;
    return imports;
  }

  /**
   * Find all source files in the project
   * @returns {string[]} Array of source file paths
   */
  findSourceFiles() {
    const extensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.java', '.rb', '.php'];
    const files = [];

    const searchDirs = ['src', 'app', 'lib', '.'];
    for (const dir of searchDirs) {
      const fullPath = path.join(this.projectRoot, dir);
      if (fs.existsSync(fullPath)) {
        this.walkDirectory(fullPath, extensions, files);
      }
    }

    return files;
  }

  /**
   * Walk directory recursively to find source files
   * @param {string} dir - Directory to walk
   * @param {string[]} extensions - File extensions to match
   * @param {string[]} files - Array to collect files
   */
  walkDirectory(dir, extensions, files) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip common non-source directories
        if (entry.isDirectory()) {
          if (['node_modules', 'vendor', '.git', 'dist', 'build', '__pycache__'].includes(entry.name)) {
            continue;
          }
          this.walkDirectory(fullPath, extensions, files);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (e) {
      // Ignore permission errors
    }
  }

  /**
   * Parse imports from a source file
   * @param {string} filePath - Path to source file
   * @returns {Array.<Object>} Array of imports
   */
  parseImports(filePath) {
    const imports = [];

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const relativePath = path.relative(this.projectRoot, filePath);

      // Detect the layer this file belongs to
      const fromLayer = this.detectLayer(relativePath);

      // Parse require/import statements
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // JavaScript/TypeScript imports
        const jsImportMatch = line.match(/(?:import|require)\s*\(?['"]([^'"]+)['"]\)?/);
        if (jsImportMatch) {
          const importPath = jsImportMatch[1];
          const toLayer = this.detectLayer(importPath);

          if (fromLayer && toLayer) {
            imports.push({
              from: fromLayer,
              to: toLayer,
              file: relativePath,
              line: i + 1,
              importPath
            });
          }
        }

        // Python imports
        const pyImportMatch = line.match(/from\s+(\S+)\s+import/);
        if (pyImportMatch) {
          const importPath = pyImportMatch[1].replace(/\./g, '/');
          const toLayer = this.detectLayer(importPath);

          if (fromLayer && toLayer) {
            imports.push({
              from: fromLayer,
              to: toLayer,
              file: relativePath,
              line: i + 1,
              importPath
            });
          }
        }
      }
    } catch (e) {
      // Ignore read errors
    }

    return imports;
  }

  /**
   * Detect which layer a file path belongs to
   * @param {string} filePath - File or import path
   * @returns {string|null} Layer name or null
   */
  detectLayer(filePath) {
    const allLayers = [
      'controllers', 'services', 'repositories', 'models',
      'ports', 'adapters', 'domain', 'application',
      'views', 'features', 'modules'
    ];

    for (const layer of allLayers) {
      if (filePath.includes(layer) || filePath.includes(`/${layer}/`) || filePath.includes(`\\${layer}\\`)) {
        return layer;
      }
    }

    return null;
  }

  /**
   * Find architecture violations for a given pattern
   * @param {string} patternName - Pattern name to check against
   * @returns {Array.<Object>} Array of violations
   */
  findViolations(patternName) {
    const pattern = PATTERNS[patternName];
    if (!pattern) {
      return [];
    }

    const imports = this.buildImportGraph();
    const violations = [];

    for (const imp of imports) {
      for (const rule of pattern.rules) {
        if (imp.from === rule.from && imp.to === rule.to && !rule.allowed) {
          violations.push({
            file: imp.file,
            line: imp.line,
            message: `${rule.from} should not import from ${rule.to}`,
            severity: 'error',
            from: rule.from,
            to: rule.to,
            importPath: imp.importPath
          });
        }
      }
    }

    return violations;
  }

  /**
   * Find circular dependencies in the project
   * @returns {Array.<Array.<string>>} Array of cycles (each cycle is array of file paths)
   */
  findCircularDependencies() {
    const imports = this.buildImportGraph();
    const graph = new Map();

    // Build adjacency list
    for (const imp of imports) {
      if (!graph.has(imp.file)) {
        graph.set(imp.file, new Set());
      }
      // Resolve import path to actual file
      const resolvedPath = this.resolveImportPath(imp.file, imp.importPath);
      if (resolvedPath) {
        graph.get(imp.file).add(resolvedPath);
      }
    }

    // Find cycles using DFS
    const cycles = [];
    const visited = new Set();
    const recursionStack = new Set();
    const path = [];

    const dfs = (node) => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const neighbors = graph.get(node) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          const cycle = dfs(neighbor);
          if (cycle) return cycle;
        } else if (recursionStack.has(neighbor)) {
          // Found cycle
          const cycleStart = path.indexOf(neighbor);
          const cycle = path.slice(cycleStart);
          cycle.push(neighbor); // Complete the cycle
          return cycle;
        }
      }

      path.pop();
      recursionStack.delete(node);
      return null;
    };

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        const cycle = dfs(node);
        if (cycle) {
          cycles.push(cycle);
        }
      }
    }

    return cycles;
  }

  /**
   * Resolve import path to actual file path
   * @param {string} fromFile - File containing the import
   * @param {string} importPath - Import path
   * @returns {string|null} Resolved file path or null
   */
  resolveImportPath(fromFile, importPath) {
    // Handle relative imports
    if (importPath.startsWith('.')) {
      const fromDir = path.dirname(path.join(this.projectRoot, fromFile));
      const resolved = path.join(fromDir, importPath);

      // Try with common extensions
      const extensions = ['', '.js', '.ts', '.jsx', '.tsx', '/index.js', '/index.ts'];
      for (const ext of extensions) {
        const withExt = resolved + ext;
        const relativePath = path.relative(this.projectRoot, withExt);
        if (fs.existsSync(withExt)) {
          return relativePath;
        }
      }
    }

    return null;
  }

  /**
   * Get improvement suggestions based on detected issues
   * @returns {Array.<Object>} Array of suggestions
   */
  getSuggestions() {
    const suggestions = [];
    const pattern = this.detect();

    if (pattern) {
      const violations = this.findViolations(pattern);

      if (violations.length > 0) {
        suggestions.push({
          type: 'violations',
          message: `Found ${violations.length} architecture violation(s)`,
          details: violations.slice(0, 5).map(v =>
            `${v.file}:${v.line} - ${v.message}`
          )
        });
      }
    }

    const cycles = this.findCircularDependencies();
    if (cycles.length > 0) {
      suggestions.push({
        type: 'circular',
        message: `Found ${cycles.length} circular dependency(ies)`,
        details: cycles.slice(0, 3).map(c => c.join(' -> '))
      });
    }

    if (!pattern) {
      suggestions.push({
        type: 'pattern',
        message: 'No clear architecture pattern detected',
        details: [
          'Consider organizing code into layers (controllers/services/repositories)',
          'Or use feature-based vertical slices',
          'Or implement hexagonal architecture with ports/adapters'
        ]
      });
    }

    return suggestions;
  }

  /**
   * Generate comprehensive architecture report
   * @returns {string} Formatted report
   */
  generateReport() {
    const lines = [];
    lines.push('=== Architecture Analysis Report ===\n');

    const pattern = this.detect();
    if (pattern) {
      const patternInfo = PATTERNS[pattern];
      lines.push(`Detected Pattern: ${patternInfo.name}`);
      lines.push(`Description: ${patternInfo.description}`);
      lines.push('');

      const violations = this.findViolations(pattern);
      lines.push(`Violations: ${violations.length}`);
      if (violations.length > 0) {
        lines.push('');
        for (const v of violations.slice(0, 10)) {
          lines.push(`  - ${v.file}:${v.line}`);
          lines.push(`    ${v.message}`);
        }
        if (violations.length > 10) {
          lines.push(`  ... and ${violations.length - 10} more`);
        }
      }
    } else {
      lines.push('Detected Pattern: None');
      lines.push('No clear architecture pattern detected.');
    }

    lines.push('');

    const cycles = this.findCircularDependencies();
    lines.push(`Circular Dependencies: ${cycles.length}`);
    if (cycles.length > 0) {
      lines.push('');
      for (const cycle of cycles.slice(0, 5)) {
        lines.push(`  - ${cycle.join(' -> ')}`);
      }
      if (cycles.length > 5) {
        lines.push(`  ... and ${cycles.length - 5} more`);
      }
    }

    lines.push('');

    const suggestions = this.getSuggestions();
    if (suggestions.length > 0) {
      lines.push('Suggestions:');
      for (const s of suggestions) {
        lines.push(`  [${s.type.toUpperCase()}] ${s.message}`);
      }
    }

    return lines.join('\n');
  }
}

module.exports = {
  ArchitectureDetector,
  PATTERNS
};
