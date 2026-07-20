/**
 * Project Root Finder
 * Ensures CTOC always operates from the project root, regardless of current directory.
 */

const safeFs = require('./safe-fs');
const path = require('path');

/**
 * Describe where the project root came from — for surfaces that must tell the human
 * WHICH project they opened, not merely operate inside it.
 *
 * This is the single implementation of the walk. `findProjectRoot` delegates to it and
 * returns `.root`, so the description can never disagree with the resolution: a screen
 * naming a root different from the one in use would be a worse defect than the one this
 * function exists to fix.
 *
 * Markers checked (in order of priority):
 * 1. .ctoc directory (CTOC initialized project)
 * 2. plans directory (CTOC plans exist)
 * 3. .git directory (git repository root)
 * 4. package.json, pyproject.toml, go.mod, Cargo.toml (project root files)
 *
 * Never throws. On any failure it reports the working directory with `marker: 'fallback'`.
 *
 * @param {string} [startDir=process.cwd()] - Directory to start searching from
 * @returns {{ root: string, cwd: string, sameAsCwd: boolean,
 *   marker: 'ctoc'|'plans'|'git'|'project-file'|'fallback',
 *   stoppedAtRepoBoundary: boolean, fallbackReason?: string }}
 *   `fallbackReason` is present only with `marker: 'fallback'`, and says WHY no marker
 *   was reported — so a caller can tell "no project found" from "the walk could not run".
 */
function describeProjectRoot(startDir = process.cwd()) {
  let start;
  try {
    start = path.resolve(startDir == null ? process.cwd() : startDir);
  } catch (err) {
    // Absorbed: `startDir` is not a resolvable path (a non-string, or a value whose
    // coercion throws). That is not a VERDICT about the project — it means the caller
    // gave no usable starting point — so the working directory is reported as the root
    // with `marker: 'fallback'`, which names the absence rather than implying a found
    // marker. Recorded so the reason is not lost.
    const cwd = process.cwd();
    return {
      root: cwd, cwd, sameAsCwd: true, marker: 'fallback', stoppedAtRepoBoundary: false,
      fallbackReason: `unresolvable startDir: ${err && err.message ? err.message : String(err)}`
    };
  }

  let stoppedAtRepoBoundary = false;
  const describe = (root, marker) => ({
    root,
    cwd: start,
    sameAsCwd: root === start,
    marker,
    stoppedAtRepoBoundary
  });

  try {
  // Two-pass walk so the documented priority holds ACROSS ancestry levels, not just
  // within a single directory. The old single pass returned the FIRST directory holding
  // ANY marker, so a NESTED package.json/.git/CLAUDE.md (a monorepo package, a nested
  // service) would outrank an ANCESTOR `.ctoc` — binding CTOC to the wrong root and
  // making getCtocPath/getPlansPath point at a non-existent `.ctoc`/`plans`.
  //
  // Pass 1 STOPS at a repository boundary, and that is the other half of the rule. The
  // two-pass design was written about WEAK markers (`package.json`, `CLAUDE.md`) that
  // legitimately appear inside a monorepo package. A `.git` entry is not weak — it is
  // the strongest available statement that a directory is a DISTINCT project, which is
  // what the word "repository" means. Climbing past it bound CTOC to a project the human
  // was not in: a fresh git repository created anywhere beneath a CTOC project could
  // never BECOME a CTOC project, because setup found `.ctoc` at somebody else's root and
  // returned without doing anything, while the menu announced it had initialised. The
  // human was then shown the ancestor's pipeline — including its plans — believing he
  // was in his new repository. The boundary directory is EXAMINED before the stop, so a
  // repository root that carries `.ctoc` still wins and the monorepo case is unchanged.

  // Pass 1: `.ctoc` (and a verified CTOC `plans/`) is the authoritative CTOC-root
  // marker. Walk the ancestry UP TO THE REPOSITORY BOUNDARY looking ONLY for it and
  // return the nearest ancestor that carries it — so no weaker marker at any level can
  // outrank it.
  {
    let dir = start;
    for (let i = 0; i < 15; i++) {
      const ctocDir = path.join(dir, '.ctoc');
      if (safeFs.existsSync(ctocDir)) {
        // A `.ctoc` entry alone is NOT proof of a project root: src/lib/crypto.js creates
        // the global crypto home `~/.ctoc` (holding only `.secret`) on any machine that has
        // used CTOC's crypto path. Accepting a bare `.ctoc` made Pass 1 climb from any
        // project under $HOME up to `~/.ctoc` and over-root to $HOME. Require a genuine
        // PROJECT CTOC root: a `.ctoc` that also carries `settings.yaml`/`settings.json`
        // (what init writes) OR sits beside a `plans/` sibling. The crypto home (only
        // `.secret`, no plans/ sibling in $HOME) then no longer qualifies, while a real
        // CTOC project root still wins across levels.
        const isProjectCtoc =
          safeFs.existsSync(path.join(ctocDir, 'settings.yaml')) ||
          safeFs.existsSync(path.join(ctocDir, 'settings.json')) ||
          safeFs.existsSync(path.join(dir, 'plans'));
        if (isProjectCtoc) {
          return describe(dir, 'ctoc');
        }
      }
      if (safeFs.existsSync(path.join(dir, 'plans'))) {
        // Verify it's a CTOC plans directory (has expected subdirs)
        const plansDir = path.join(dir, 'plans');
        try {
          if (safeFs.statSync(plansDir).isDirectory()) {
            const subDirs = ['vision', 'functional', 'implementation', 'todo', 'done', 'in-progress', 'review'];
            const hasCtocPlans = subDirs.some(sub => safeFs.existsSync(path.join(plansDir, sub)));
            if (hasCtocPlans) {
              return describe(dir, 'plans');
            }
          }
        } catch (err) {
          // Absorbed: `plans` could not be stat'd or read (it is a file, a broken link,
          // or unreadable). That is a definite NEGATIVE, not an unread input: an entry
          // that cannot be shown to be a CTOC plans directory is not one, so continuing
          // the climb is the correct verdict rather than a permissive fall-through.
          void err;
        }
      }

      // The repository boundary ends the climb. Both marker checks above have already
      // run against `dir`, so a repository root carrying CTOC has already returned.
      // Breaking here leaves Pass 1 with no result, and Pass 2 returns this same
      // directory by its own `.git` check — "a repository root with no CTOC marker is
      // the root", which is what a human means by "my project".
      if (safeFs.existsSync(path.join(dir, '.git'))) {
        stoppedAtRepoBoundary = true;
        break;
      }

      const parent = path.dirname(dir);
      if (parent === dir) {
        // Reached filesystem root
        break;
      }
      dir = parent;
    }
  }

  // Pass 2: no CTOC marker anywhere in the ancestry — fall back to the weaker markers
  // (git root, then common project-root files), nearest ancestor wins.
  {
    let dir = start;
    for (let i = 0; i < 15; i++) {
      // Priority 2: Git repository root
      if (safeFs.existsSync(path.join(dir, '.git'))) {
        return describe(dir, 'git');
      }

      // Priority 3: Common project root files
      const projectFiles = ['CLAUDE.md', 'package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle'];
      for (const file of projectFiles) {
        if (safeFs.existsSync(path.join(dir, file))) {
          return describe(dir, 'project-file');
        }
      }

      const parent = path.dirname(dir);
      if (parent === dir) {
        // Reached filesystem root
        break;
      }
      dir = parent;
    }
  }
  } catch (err) {
    // Absorbed: the walk itself failed (an unreadable ancestor, a permission error, a
    // path operation throwing). Resolution sits on the path of every hook and every
    // screen, so throwing here would take the whole product down. The fallback is NOT a
    // claim that no project was found — `marker: 'fallback'` plus `fallbackReason` say
    // that the walk could not complete, so no caller can read this as a verdict.
    const cwd = process.cwd();
    return {
      root: cwd, cwd: start, sameAsCwd: cwd === start, marker: 'fallback', stoppedAtRepoBoundary,
      fallbackReason: `walk failed: ${err && err.message ? err.message : String(err)}`
    };
  }

  // No marker anywhere in the examined ancestry — the working directory is the answer.
  const cwd = process.cwd();
  return {
    root: cwd, cwd: start, sameAsCwd: cwd === start, marker: 'fallback', stoppedAtRepoBoundary,
    fallbackReason: 'no project marker found in the examined ancestry'
  };
}

/**
 * Find project root by looking for common project markers.
 * Searches up the directory tree until it finds a marker, stopping at a repository
 * boundary (see `describeProjectRoot`, which performs the one and only walk).
 *
 * @param {string} [startDir=process.cwd()] - Directory to start searching from
 * @returns {string} Project root path, or cwd if no markers found
 */
function findProjectRoot(startDir = process.cwd()) {
  return describeProjectRoot(startDir).root;
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
  describeProjectRoot,
  getPlansPath,
  getCtocPath,
  fromProjectRoot
};
