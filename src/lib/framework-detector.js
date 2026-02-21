/**
 * Framework Detector
 * Auto-detects web frameworks based on config files and package.json
 *
 * Supports:
 * - Next.js
 * - Vue (Vite, Nuxt)
 * - Svelte (SvelteKit)
 * - Angular
 * - Astro
 * - React (CRA, Vite)
 */

const fs = require('fs');
const path = require('path');

/**
 * Framework definitions with detection markers
 * @type {Object.<string, Object>}
 */
const FRAMEWORKS = {
  nextjs: {
    name: 'Next.js',
    configFiles: ['next.config.js', 'next.config.mjs', 'next.config.ts'],
    packageDeps: ['next'],
    defaultPort: 3000,
    devCommand: 'npm run dev',
    buildCommand: 'npm run build',
    startCommand: 'npm run start'
  },
  vue: {
    name: 'Vue',
    configFiles: ['vue.config.js', 'vite.config.ts', 'vite.config.js'],
    packageDeps: ['vue'],
    packageDevDeps: ['@vue/cli-service', 'vite'],
    defaultPort: 5173,
    devCommand: 'npm run dev',
    buildCommand: 'npm run build',
    startCommand: 'npm run preview'
  },
  nuxt: {
    name: 'Nuxt',
    configFiles: ['nuxt.config.js', 'nuxt.config.ts'],
    packageDeps: ['nuxt'],
    defaultPort: 3000,
    devCommand: 'npm run dev',
    buildCommand: 'npm run build',
    startCommand: 'npm run start'
  },
  svelte: {
    name: 'Svelte',
    configFiles: ['svelte.config.js'],
    packageDeps: ['svelte'],
    packageDevDeps: ['@sveltejs/kit'],
    defaultPort: 5173,
    devCommand: 'npm run dev',
    buildCommand: 'npm run build',
    startCommand: 'npm run preview'
  },
  angular: {
    name: 'Angular',
    configFiles: ['angular.json'],
    packageDeps: ['@angular/core'],
    defaultPort: 4200,
    devCommand: 'npm run start',
    buildCommand: 'npm run build',
    startCommand: 'npm run start'
  },
  astro: {
    name: 'Astro',
    configFiles: ['astro.config.mjs', 'astro.config.js', 'astro.config.ts'],
    packageDeps: ['astro'],
    defaultPort: 4321,
    devCommand: 'npm run dev',
    buildCommand: 'npm run build',
    startCommand: 'npm run preview'
  },
  'react-vite': {
    name: 'React (Vite)',
    configFiles: ['vite.config.ts', 'vite.config.js'],
    packageDeps: ['react'],
    packageDevDeps: ['vite', '@vitejs/plugin-react'],
    defaultPort: 5173,
    devCommand: 'npm run dev',
    buildCommand: 'npm run build',
    startCommand: 'npm run preview'
  },
  'react-cra': {
    name: 'React (Create React App)',
    packageDeps: ['react'],
    packageDevDeps: ['react-scripts'],
    defaultPort: 3000,
    devCommand: 'npm run start',
    buildCommand: 'npm run build',
    startCommand: 'npm run start'
  },
  remix: {
    name: 'Remix',
    configFiles: ['remix.config.js'],
    packageDeps: ['@remix-run/react'],
    defaultPort: 3000,
    devCommand: 'npm run dev',
    buildCommand: 'npm run build',
    startCommand: 'npm run start'
  },
  gatsby: {
    name: 'Gatsby',
    configFiles: ['gatsby-config.js', 'gatsby-config.ts'],
    packageDeps: ['gatsby'],
    defaultPort: 8000,
    devCommand: 'npm run develop',
    buildCommand: 'npm run build',
    startCommand: 'npm run serve'
  }
};

/**
 * Framework Detector class
 * Detects web frameworks in a project
 */
class FrameworkDetector {
  /**
   * Create a FrameworkDetector instance
   * @param {string} projectRoot - Root directory of the project
   */
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.packageJson = this.loadPackageJson();
  }

  /**
   * Load package.json from project root
   * @returns {Object|null} Parsed package.json or null
   */
  loadPackageJson() {
    const packagePath = path.join(this.projectRoot, 'package.json');
    try {
      if (fs.existsSync(packagePath)) {
        const content = fs.readFileSync(packagePath, 'utf8');
        return JSON.parse(content);
      }
    } catch (e) {
      // Ignore parse errors
    }
    return null;
  }

  /**
   * Check if a file exists in the project
   * @param {string} filename - File name to check
   * @returns {boolean} True if file exists
   */
  fileExists(filename) {
    return fs.existsSync(path.join(this.projectRoot, filename));
  }

  /**
   * Check if package has a dependency
   * @param {string} dep - Dependency name
   * @returns {boolean} True if dependency exists
   */
  hasDependency(dep) {
    if (!this.packageJson) return false;
    return (
      (this.packageJson.dependencies && this.packageJson.dependencies[dep]) ||
      (this.packageJson.devDependencies && this.packageJson.devDependencies[dep])
    );
  }

  /**
   * Check if package has a dev dependency specifically
   * @param {string} dep - Dependency name
   * @returns {boolean} True if dev dependency exists
   */
  hasDevDependency(dep) {
    if (!this.packageJson) return false;
    return this.packageJson.devDependencies && this.packageJson.devDependencies[dep];
  }

  /**
   * Calculate confidence score for a framework match
   * @param {Object} framework - Framework definition
   * @returns {number} Confidence score (0-100)
   */
  calculateConfidence(framework) {
    let score = 0;
    let checks = 0;

    // Check config files (high weight)
    if (framework.configFiles) {
      checks++;
      for (const configFile of framework.configFiles) {
        if (this.fileExists(configFile)) {
          score += 50;
          break;
        }
      }
    }

    // Check package dependencies (high weight)
    if (framework.packageDeps) {
      checks++;
      for (const dep of framework.packageDeps) {
        if (this.hasDependency(dep)) {
          score += 40;
          break;
        }
      }
    }

    // Check dev dependencies (lower weight)
    if (framework.packageDevDeps) {
      checks++;
      for (const dep of framework.packageDevDeps) {
        if (this.hasDevDependency(dep)) {
          score += 10;
          break;
        }
      }
    }

    return checks > 0 ? Math.min(100, score) : 0;
  }

  /**
   * Detect the web framework used in the project
   * @returns {Object|null} Detected framework info or null
   */
  detect() {
    if (!this.packageJson) {
      return null;
    }

    let bestMatch = null;
    let highestConfidence = 0;

    // Check each framework in priority order
    // (more specific frameworks first)
    const priorityOrder = [
      'nextjs', 'nuxt', 'svelte', 'angular', 'astro',
      'remix', 'gatsby', 'vue', 'react-vite', 'react-cra'
    ];

    for (const frameworkId of priorityOrder) {
      const framework = FRAMEWORKS[frameworkId];
      const confidence = this.calculateConfidence(framework);

      if (confidence > highestConfidence) {
        highestConfidence = confidence;
        bestMatch = {
          id: frameworkId,
          ...framework,
          confidence
        };
      }
    }

    // Return match only if confidence is above threshold
    if (bestMatch && highestConfidence >= 40) {
      return bestMatch;
    }

    return null;
  }

  /**
   * Detect all frameworks in a monorepo
   * @returns {Array<Object>} Array of detected frameworks with paths
   */
  detectAll() {
    const results = [];

    // Check root
    const rootFramework = this.detect();
    if (rootFramework) {
      results.push({
        path: '.',
        ...rootFramework
      });
    }

    // Check common monorepo locations
    const monorepoLocations = [
      'apps', 'packages', 'projects', 'sites', 'web', 'frontend'
    ];

    for (const location of monorepoLocations) {
      const locationPath = path.join(this.projectRoot, location);
      if (fs.existsSync(locationPath) && fs.statSync(locationPath).isDirectory()) {
        try {
          const entries = fs.readdirSync(locationPath, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const subPath = path.join(location, entry.name);
              const subDetector = new FrameworkDetector(
                path.join(this.projectRoot, subPath)
              );
              const subFramework = subDetector.detect();
              if (subFramework) {
                results.push({
                  path: subPath,
                  ...subFramework
                });
              }
            }
          }
        } catch (e) {
          // Ignore read errors
        }
      }
    }

    return results;
  }

  /**
   * Get Playwright configuration for the detected framework
   * @returns {Object} Playwright config options
   */
  getPlaywrightConfig() {
    const framework = this.detect();

    if (!framework) {
      // Default config for unknown frameworks
      return {
        baseURL: 'http://localhost:3000',
        webServer: null,
        framework: 'unknown'
      };
    }

    return {
      framework: framework.id,
      frameworkName: framework.name,
      baseURL: `http://localhost:${framework.defaultPort}`,
      webServer: {
        command: framework.devCommand,
        port: framework.defaultPort,
        reuseExistingServer: true,
        timeout: 120000
      },
      buildCommand: framework.buildCommand,
      startCommand: framework.startCommand
    };
  }

  /**
   * Check if project is a web application
   * @returns {boolean} True if web app detected
   */
  isWebApp() {
    // Check for common web framework dependencies
    const webDeps = [
      'react', 'vue', 'svelte', '@angular/core', 'next',
      'nuxt', 'astro', 'gatsby', '@remix-run/react'
    ];

    return webDeps.some(dep => this.hasDependency(dep));
  }

  /**
   * Check if project uses TypeScript
   * @returns {boolean} True if TypeScript detected
   */
  usesTypeScript() {
    return (
      this.fileExists('tsconfig.json') ||
      this.hasDependency('typescript')
    );
  }

  /**
   * Get the test directory for the framework
   * @returns {string} Recommended test directory
   */
  getTestDirectory() {
    const framework = this.detect();

    // Framework-specific conventions
    const testDirs = {
      nextjs: 'e2e',
      nuxt: 'tests/e2e',
      svelte: 'tests',
      angular: 'e2e',
      astro: 'tests/e2e',
      vue: 'tests/e2e',
      'react-vite': 'e2e',
      'react-cra': 'e2e',
      remix: 'e2e',
      gatsby: 'e2e'
    };

    if (framework && testDirs[framework.id]) {
      return testDirs[framework.id];
    }

    // Check for existing test directories
    const commonDirs = ['e2e', 'tests/e2e', 'test/e2e', 'tests', 'test'];
    for (const dir of commonDirs) {
      if (this.fileExists(dir)) {
        return dir;
      }
    }

    return 'e2e';
  }
}

/**
 * Quick detect function for simple usage
 * @param {string} projectRoot - Project root path
 * @returns {Object|null} Detected framework or null
 */
function detectFramework(projectRoot) {
  const detector = new FrameworkDetector(projectRoot);
  return detector.detect();
}

/**
 * Check if a directory contains a web application
 * @param {string} projectRoot - Project root path
 * @returns {boolean} True if web app
 */
function isWebApplication(projectRoot) {
  const detector = new FrameworkDetector(projectRoot);
  return detector.isWebApp();
}

module.exports = {
  FrameworkDetector,
  FRAMEWORKS,
  detectFramework,
  isWebApplication
};
