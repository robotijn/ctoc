/**
 * Project Root Finder
 * Ensures CTOC always operates from the project root, regardless of current directory.
 */

const safeFs = require('./safe-fs');
const path = require('path');

/**
 * Find project root by looking for common project markers.
 * Searches up the directory tree until it finds a marker.
 *
 * Markers checked (in order of priority):
 * 1. .ctoc directory (CTOC initialized project)
 * 2. plans directory (CTOC plans exist)
 * 3. .git directory (git repository root)
 * 4. package.json, pyproject.toml, go.mod, Cargo.toml (project root files)
 *
 * @param {string} [startDir=process.cwd()] - Directory to start searching from
 * @returns {string} Project root path, or cwd if no markers found
 */
function findProjectRoot(startDir = process.cwd()) {
  let dir = path.resolve(startDir);

  // Search up to 15 levels (handles deep nesting)
  for (let i = 0; i < 15; i++) {
    // Priority 1: CTOC markers (strongest indicators)
    if (safeFs.existsSync(path.join(dir, '.ctoc'))) {
      return dir;
    }
    if (safeFs.existsSync(path.join(dir, 'plans'))) {
      // Verify it's a CTOC plans directory (has expected subdirs)
      const plansDir = path.join(dir, 'plans');
      if (safeFs.statSync(plansDir).isDirectory()) {
        const subDirs = ['vision', 'functional', 'implementation', 'todo', 'done', 'in-progress', 'review'];
        const hasCtocPlans = subDirs.some(sub => safeFs.existsSync(path.join(plansDir, sub)));
        if (hasCtocPlans) {
          return dir;
        }
      }
    }

    // Priority 2: Git repository root
    if (safeFs.existsSync(path.join(dir, '.git'))) {
      return dir;
    }

    // Priority 3: Common project root files
    const projectFiles = ['CLAUDE.md', 'package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle'];
    for (const file of projectFiles) {
      if (safeFs.existsSync(path.join(dir, file))) {
        return dir;
      }
    }

    // Move up one directory
    const parent = path.dirname(dir);
    if (parent === dir) {
      // Reached filesystem root
      break;
    }
    dir = parent;
  }

  // Fallback to current working directory
  return process.cwd();
}

/**
 * Get the plans directory path (always from project root)
 *
 * @param {string} [startDir] - Optional starting directory
 * @returns {string} Absolute path to plans directory
 */
function getPlansPath(startDir) {
  const root = findProjectRoot(startDir);
  return path.join(root, 'plans');
}

/**
 * Get the .ctoc directory path (always from project root)
 *
 * @param {string} [startDir] - Optional starting directory
 * @returns {string} Absolute path to .ctoc directory
 */
function getCtocPath(startDir) {
  const root = findProjectRoot(startDir);
  return path.join(root, '.ctoc');
}

/**
 * Ensure a path is relative to project root
 *
 * @param {string} relativePath - Path relative to project root
 * @param {string} [startDir] - Optional starting directory
 * @returns {string} Absolute path from project root
 */
function fromProjectRoot(relativePath, startDir) {
  const root = findProjectRoot(startDir);
  return path.join(root, relativePath);
}

module.exports = {
  findProjectRoot,
  getPlansPath,
  getCtocPath,
  fromProjectRoot
};
