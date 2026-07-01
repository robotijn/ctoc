/**
 * Plan Coverage (C1 / CTOC v7)
 *
 * Determines whether an edit target is covered by an active plan. Used by
 * the PreToolUse enforcement hook to allow edits that are part of declared
 * plan work, and block edits that aren't.
 *
 * Plans declare their files in YAML frontmatter:
 *   files:
 *     - "src/lib/foo.js"
 *     - "tests/foo.test.js"
 *     - "src/areas/**"
 *
 * Glob support (minimatch-style):
 *   *   matches any chars except /
 *   **  matches any chars including /
 *   ?   matches single char except /
 *   everything else is literal
 *
 * Stage priority (per I11): in-progress > todo > implementation.
 * Within a stage, the most-specific glob wins.
 *
 * X1: pre-v7 plans (no `files:` declaration AND no `program: ctoc-v7`) are
 * treated warn-only — they never match, so the hook falls through to the
 * escape-phrase check.
 */

const safeFs = require('./safe-fs');
const path = require('path');

const STAGE_PRIORITY = ['in-progress', 'todo', 'implementation'];

/**
 * Convert a glob pattern to a RegExp.
 *
 * @param {string} glob
 * @returns {RegExp}
 */
function globToRegex(glob) {
  let out = '^';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        out += '.*';
        i += 2;
        if (glob[i] === '/') i += 1; // consume trailing slash so "**/x" matches "x"
      } else {
        out += '[^/]*';
        i += 1;
      }
    } else if (c === '?') {
      out += '[^/]';
      i += 1;
    } else if ('.+^${}()|[]\\'.includes(c)) {
      out += '\\' + c;
      i += 1;
    } else {
      out += c;
      i += 1;
    }
  }
  out += '$';
  return new RegExp(out);
}

/**
 * Read a plan's `files:` declaration as an array of globs.
 * Returns [] for plans without a `files:` block.
 *
 * @param {string} planPath
 * @returns {string[]}
 */
function readPlanFiles(planPath) {
  let content;
  try { content = safeFs.readFileSync(planPath, 'utf8'); } catch { return []; }
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return [];
  const fmBody = fm[1];
  // Find `files:` block then collect lines that look like `  - "..."` until next top-level key or end
  const filesIdx = fmBody.search(/^files:\s*$/m);
  if (filesIdx === -1) return [];
  const after = fmBody.slice(filesIdx);
  const lines = after.split('\n').slice(1);
  const files = [];
  for (const line of lines) {
    const m = line.match(/^\s*-\s*["']?([^"'\n]+?)["']?\s*$/);
    if (m) {
      files.push(m[1]);
    } else if (/^\S/.test(line)) {
      // hit next top-level key, stop
      break;
    }
  }
  return files;
}

/**
 * Score a glob's specificity (more specific = higher score).
 * Used to pick the most-specific match within a stage.
 *
 * @param {string} glob
 * @returns {number}
 */
function specificity(glob) {
  return glob.length - (glob.match(/\*\*/g) || []).length * 5 - (glob.match(/\*/g) || []).length;
}

/**
 * Find the plan that covers `targetFile` in the project at `root`.
 * Returns null if no plan covers it.
 *
 * @param {string} targetFile - Path relative to project root (or absolute; both supported)
 * @param {string} root - Project root
 * @returns {{ plan: string, stage: string, glob: string } | null}
 */
function findCoveringPlan(targetFile, root) {
  // Normalize target relative to root for matching
  const absTarget = path.isAbsolute(targetFile) ? targetFile : path.join(root, targetFile);
  const relTarget = path.relative(root, absTarget).replace(/\\/g, '/');

  for (const stage of STAGE_PRIORITY) {
    const stageDir = path.join(root, 'plans', stage);
    if (!safeFs.existsSync(stageDir)) continue;
    const files = safeFs.readdirSync(stageDir).filter(f => f.endsWith('.md') && f !== '.gitkeep');

    let best = null;
    for (const f of files) {
      const planPath = path.join(stageDir, f);
      const globs = readPlanFiles(planPath);
      for (const glob of globs) {
        const re = globToRegex(glob);
        if (re.test(relTarget)) {
          const score = specificity(glob);
          if (!best || score > best.score) {
            best = { plan: `${stage}/${f.replace(/\.md$/, '')}`, stage, glob, score };
          }
        }
      }
    }
    if (best) return { plan: best.plan, stage: best.stage, glob: best.glob };
  }
  return null;
}

module.exports = {
  findCoveringPlan,
  readPlanFiles,
  globToRegex,
};
