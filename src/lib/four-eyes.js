/**
 * Four-Eyes Gate 3 Enforcement (v6.9.x)
 *
 * Enforces the "four-eyes principle" — sometimes called "two-person integrity"
 * or "dual control" — at Gate 3 of the Iron Loop. When the
 * `four_eyes_gate3` control is active in the project's regulatory regime, a
 * plan cannot cross from review to done unless TWO distinct principals have
 * signed it: one as the author-side reviewer, one as the independent approver.
 *
 * Plan frontmatter carries two markers:
 *
 *   approved_by_author_review: <role-name>
 *   approved_by_independent:   <role-name>
 *
 * The two role names are looked up in `.ctoc/roles.yaml`. They MUST resolve
 * to distinct `identity` values; if both markers carry the same identity, the
 * approval is rejected. This is the segregation-of-duties property required
 * by Sarbanes-Oxley Section 404 Information Technology General Controls, by
 * Payment Card Industry Data Security Standard version 4 Requirement 6.5.4,
 * and by International Organization for Standardization 27001:2022 Annex A
 * control 5.3 (segregation of duties).
 *
 * Activation: the control is checked by callers via
 * `regulatory-regime.isControlEnabled(root, 'four_eyes_gate3')`. This library
 * itself is regime-agnostic; it returns a structured result that callers can
 * gate on as appropriate.
 *
 * Cross-platform: uses path.join, fs.promises, no shell-outs, no external
 * dependencies.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROLES_PATH = path.join('.ctoc', 'roles.yaml');

/**
 * Parse the minimal YAML subset used by `.ctoc/roles.yaml`. The schema is
 * a single top-level `roles:` list of maps. We intentionally avoid pulling
 * in a YAML dependency; the file is small and well-structured.
 *
 * @param {string} content - The raw YAML text.
 * @returns {{roles: Array<{name: string, identity: string, can_author: boolean, can_review: boolean, can_approve: boolean}>}}
 */
function parseRolesYaml(content) {
  const lines = content.split('\n');
  const roles = [];
  let current = null;

  for (const raw of lines) {
    // Strip comments and skip blank lines.
    const stripped = raw.replace(/#.*$/, '');
    if (stripped.trim() === '') continue;

    // Skip the top-level `roles:` key line.
    if (/^roles\s*:\s*$/.test(stripped)) continue;

    // List item start: `  - name: foo`
    const listStart = stripped.match(/^\s*-\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (listStart) {
      if (current) roles.push(current);
      current = {};
      current[listStart[1]] = coerceScalar(listStart[2]);
      continue;
    }

    // Continuation key inside the current list item: `    can_author: true`
    const cont = stripped.match(/^\s+([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (cont && current) {
      current[cont[1]] = coerceScalar(cont[2]);
    }
  }
  if (current) roles.push(current);

  return { roles };
}

/**
 * Coerce a YAML scalar string into its JavaScript type.
 * Handles booleans, null, integers, and quoted strings.
 *
 * @param {string} v - Raw scalar text.
 * @returns {string|number|boolean|null}
 */
function coerceScalar(v) {
  const t = v.trim();
  if (t === '' || t === '~' || t === 'null') return null;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  return t.replace(/^["']|["']$/g, '');
}

/**
 * Load the project's declared roles. Returns the parsed list of role
 * entries. If `.ctoc/roles.yaml` does not exist, returns an empty list —
 * callers should treat that as "no roles declared", which the four-eyes
 * verifier reports as a configuration failure (you cannot enforce four
 * eyes when no roles exist).
 *
 * @param {string} projectRoot - Absolute path to the project root.
 * @returns {Array<{name: string, identity: string, can_author: boolean, can_review: boolean, can_approve: boolean}>}
 */
function loadRoles(projectRoot) {
  const rolesPath = path.join(projectRoot, ROLES_PATH);
  if (!fs.existsSync(rolesPath)) return [];
  const content = fs.readFileSync(rolesPath, 'utf8');
  const parsed = parseRolesYaml(content);
  return Array.isArray(parsed.roles) ? parsed.roles : [];
}

/**
 * Extract the two approval markers from a plan's YAML frontmatter. The
 * frontmatter is the first `---`-delimited block at the top of the plan
 * file. We do a targeted regex scan rather than parsing the whole document.
 *
 * @param {string} planText - The full plan file text.
 * @returns {{author: string|null, independent: string|null}}
 */
function extractApprovalMarkers(planText) {
  const fmMatch = planText.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!fmMatch) return { author: null, independent: null };
  const fm = fmMatch[1];

  const authorMatch = fm.match(/^\s*approved_by_author_review\s*:\s*(.+?)\s*$/m);
  const independentMatch = fm.match(/^\s*approved_by_independent\s*:\s*(.+?)\s*$/m);

  const clean = (v) => v ? v.replace(/^["']|["']$/g, '').trim() : null;
  return {
    author: clean(authorMatch ? authorMatch[1] : null),
    independent: clean(independentMatch ? independentMatch[1] : null),
  };
}

/**
 * Verify that a plan satisfies the four-eyes property.
 *
 * Returns a structured result so callers can render an actionable message.
 * Never throws on missing markers — the failure mode is part of the
 * contract.
 *
 * Failure conditions, in priority order:
 *   1. Plan text could not be read or has no frontmatter.
 *   2. One or both markers missing.
 *   3. One or both role names not found in `.ctoc/roles.yaml`.
 *   4. The role that signed author-review lacks `can_review: true`.
 *   5. The role that signed independent approval lacks `can_approve: true`.
 *   6. Both markers resolve to the SAME identity (the load-bearing check).
 *
 * @param {Object} plan - Either { path: string } or { text: string, projectRoot: string }.
 *   - `path` form reads the file and uses the path's project root.
 *   - `text` form is for callers that have already loaded the plan.
 * @param {string} [projectRoot] - Project root if `plan` is a path string.
 * @returns {{passed: boolean, reason: string, author: ?string, independent: ?string}}
 */
function verifyFourEyes(plan, projectRoot) {
  let planText;
  let root = projectRoot;

  if (typeof plan === 'string') {
    // Convenience: caller passed a path.
    if (!fs.existsSync(plan)) {
      return { passed: false, reason: `Plan not found: ${plan}`, author: null, independent: null };
    }
    planText = fs.readFileSync(plan, 'utf8');
    if (!root) root = inferProjectRoot(plan);
  } else if (plan && typeof plan === 'object') {
    if (typeof plan.text === 'string') {
      planText = plan.text;
      root = root || plan.projectRoot;
    } else if (typeof plan.path === 'string') {
      if (!fs.existsSync(plan.path)) {
        return { passed: false, reason: `Plan not found: ${plan.path}`, author: null, independent: null };
      }
      planText = fs.readFileSync(plan.path, 'utf8');
      root = root || plan.projectRoot || inferProjectRoot(plan.path);
    } else {
      return { passed: false, reason: 'verifyFourEyes: expected { path } or { text, projectRoot }', author: null, independent: null };
    }
  } else {
    return { passed: false, reason: 'verifyFourEyes: invalid plan argument', author: null, independent: null };
  }

  const { author, independent } = extractApprovalMarkers(planText);

  if (!author && !independent) {
    return {
      passed: false,
      reason: 'Missing both approval markers (approved_by_author_review and approved_by_independent).',
      author, independent,
    };
  }
  if (!author) {
    return {
      passed: false,
      reason: 'Missing approval marker: approved_by_author_review.',
      author, independent,
    };
  }
  if (!independent) {
    return {
      passed: false,
      reason: 'Missing approval marker: approved_by_independent.',
      author, independent,
    };
  }

  const roles = loadRoles(root);
  if (roles.length === 0) {
    return {
      passed: false,
      reason: 'No roles declared in .ctoc/roles.yaml. Four-eyes enforcement requires at least two distinct principals.',
      author, independent,
    };
  }

  const authorRole = roles.find(r => r.name === author);
  const independentRole = roles.find(r => r.name === independent);

  if (!authorRole) {
    return { passed: false, reason: `Author-review role "${author}" not declared in .ctoc/roles.yaml.`, author, independent };
  }
  if (!independentRole) {
    return { passed: false, reason: `Independent-approval role "${independent}" not declared in .ctoc/roles.yaml.`, author, independent };
  }

  if (!authorRole.can_review) {
    return { passed: false, reason: `Role "${author}" lacks can_review authority; cannot sign approved_by_author_review.`, author, independent };
  }
  if (!independentRole.can_approve) {
    return { passed: false, reason: `Role "${independent}" lacks can_approve authority; cannot sign approved_by_independent.`, author, independent };
  }

  // The load-bearing check: identities must differ.
  if (authorRole.identity && independentRole.identity && authorRole.identity === independentRole.identity) {
    return {
      passed: false,
      reason: `Four-eyes violation: both markers resolve to identity "${authorRole.identity}". The author-side reviewer and the independent approver must be distinct principals.`,
      author, independent,
    };
  }

  return {
    passed: true,
    reason: `Four-eyes satisfied: author-review by "${author}" (${authorRole.identity}), independent approval by "${independent}" (${independentRole.identity}).`,
    author, independent,
  };
}

/**
 * Walk upward from a plan path to find the nearest project root, defined as
 * the closest ancestor containing a `.ctoc/` directory. Falls back to
 * `process.cwd()` if none is found (single-project workspaces).
 *
 * @param {string} planPath - Absolute or relative path to the plan file.
 * @returns {string} The inferred project root.
 */
function inferProjectRoot(planPath) {
  let dir = path.dirname(path.resolve(planPath));
  const root = path.parse(dir).root;
  while (dir !== root) {
    if (fs.existsSync(path.join(dir, '.ctoc'))) return dir;
    const next = path.dirname(dir);
    if (next === dir) break;
    dir = next;
  }
  return process.cwd();
}

module.exports = {
  loadRoles,
  verifyFourEyes,
  extractApprovalMarkers,
  // Exposed for tests; not part of the stable public surface.
  _parseRolesYaml: parseRolesYaml,
};
