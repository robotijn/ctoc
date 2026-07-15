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

const safeFs = require('./safe-fs');
const path = require('path');

/**
 * Directories the monorepo walk must NOT descend into: installed dependencies and
 * build/output/cache dirs are never workspace members. Excluding them avoids a
 * per-installed-package detector (a cost) and a false-positive "member" surfaced
 * from a config file inside an installed package or a build artifact.
 * @type {Set<string>}
 */
const EXCLUDED_MEMBER_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt', '.turbo', '.cache'
]);

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
    // Remix v1 keyed off remix.config.js; Remix v2 (2024) moved to Vite, so a
    // modern Remix app carries vite.config.* and @remix-run/dev and NO
    // remix.config.js. The server packages (@remix-run/dev / node / serve) are the
    // authoritative Remix signal; detect() additionally overrides a generic
    // react-vite match when any of the four recognized @remix-run packages
    // (@remix-run/dev, /react, /node, /serve — the packageDeps whitelist below) is
    // present (see FINDING 1).
    configFiles: ['remix.config.js'],
    packageDeps: ['@remix-run/react', '@remix-run/dev', '@remix-run/node', '@remix-run/serve'],
    packageDevDeps: ['@remix-run/dev'],
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
      if (safeFs.existsSync(packagePath)) {
        const content = safeFs.readFileSync(packagePath, 'utf8');
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
    return safeFs.existsSync(path.join(this.projectRoot, filename));
  }

  /**
   * Check if package has a dependency
   * @param {string} dep - Dependency name
   * @returns {boolean} True if dependency exists
   */
  hasDependency(dep) {
    if (!this.packageJson) return false;
    // FINDING 5(b): read ALL four dependency maps. A framework declared only in
    // peerDependencies (a plugin/adapter) or optionalDependencies would otherwise
    // be invisible, under-detecting a real web app and silently skipping its
    // security surface.
    const pj = this.packageJson;
    return Boolean(
      (pj.dependencies && pj.dependencies[dep]) ||
      (pj.devDependencies && pj.devDependencies[dep]) ||
      (pj.peerDependencies && pj.peerDependencies[dep]) ||
      (pj.optionalDependencies && pj.optionalDependencies[dep])
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
    // FINDING 5(a): do NOT dead-end on a null package.json. A malformed (or
    // absent) package.json used to early-return null EVEN WHEN a definitive config
    // file (next.config.js, angular.json, …) was present, so a real web app read
    // as no-framework and its security surface was silently skipped. Config files
    // are scored independently of package.json below, so a config-file fallback
    // falls straight out of the normal scoring path.

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

    // FINDING 3: a React framework must carry its BUNDLER evidence, otherwise a
    // bare `react` dependency (score 40 on the dep alone) is handed a run strategy
    // it cannot honour (react-vite → port 5173 + `npm run preview` on a project
    // with no Vite). react-vite requires a Vite signal (a vite.config.* file OR a
    // vite/@vitejs devDep); react-cra requires react-scripts. Without that
    // evidence the match is disqualified → generic/unknown React shape (null).
    if (bestMatch && bestMatch.id === 'react-vite' && !this.hasViteSignal()) {
      bestMatch = null;
      highestConfidence = 0;
    }
    if (bestMatch && bestMatch.id === 'react-cra' && !this.hasDependency('react-scripts')) {
      bestMatch = null;
      highestConfidence = 0;
    }

    // FINDING 1: Remix moved to Vite in v2, so a Remix app scores as a generic
    // react-vite SPA (vite.config + react + vite devDep = 100) while remix scored
    // only 40. But a Remix app has a full server surface (loaders, actions, session
    // cookies, CSRF) that a client-only React profile would skip. If any of the
    // four recognized @remix-run packages (dev / react / node / serve — see
    // hasRemixSignal) is present, this is Remix — override the generic react-vite
    // match.
    if (bestMatch && bestMatch.id === 'react-vite' && this.hasRemixSignal()) {
      return { id: 'remix', ...FRAMEWORKS.remix, confidence: highestConfidence };
    }

    // Return match only if confidence is above threshold
    if (bestMatch && highestConfidence >= 40) {
      return bestMatch;
    }

    return null;
  }

  /**
   * Whether the project carries a Vite signal: a vite.config.* file OR a
   * vite/@vitejs/plugin-react devDependency. Used to gate the react-vite shape so a
   * bundler-less bare react dep is never handed Vite's run strategy (FINDING 3).
   * @returns {boolean} True if Vite evidence is present.
   */
  hasViteSignal() {
    return Boolean(
      this.fileExists('vite.config.ts') ||
      this.fileExists('vite.config.js') ||
      this.fileExists('vite.config.mjs') ||
      this.hasDevDependency('vite') ||
      this.hasDevDependency('@vitejs/plugin-react')
    );
  }

  /**
   * Whether any Remix package is present. Remix v2 dropped remix.config.js for
   * Vite, so this dependency signal — not a config file — is the authoritative way
   * to tell a Remix app from a plain React+Vite SPA (FINDING 1).
   * @returns {boolean} True if a @remix-run/* package is declared.
   */
  hasRemixSignal() {
    const REMIX_PACKAGES = ['@remix-run/dev', '@remix-run/react', '@remix-run/node', '@remix-run/serve'];
    return REMIX_PACKAGES.some((dep) => this.hasDependency(dep));
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
      if (safeFs.existsSync(locationPath) && safeFs.statSync(locationPath).isDirectory()) {
        try {
          const entries = safeFs.readdirSync(locationPath, { withFileTypes: true });
          for (const entry of entries) {
            // Skip node_modules and other non-source dirs: instantiating a detector
            // per installed package is a needless cost, and an installed package that
            // itself carries a framework config would be surfaced as a bogus
            // "workspace member" (a latent false positive).
            if (
              entry.isDirectory() &&
              !EXCLUDED_MEMBER_DIRS.has(entry.name) &&
              !entry.name.startsWith('.')
            ) {
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
