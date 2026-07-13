/**
 * Global sequential numbering for CTOC implementation plans.
 *
 * Convention: an implementation plan is named with a single global, zero-padded
 * five-digit prefix — e.g. "00001-make-the-block-actually-stop",
 * "00002-fix-the-install-path", "00003-remove-dead-code". This yields ONE global
 * order across every implementation plan, rather than a per-parent count.
 *
 * Two entry points:
 *   - `nextImplementationPlanNumber(root)` — pure helper returning the next global
 *     number as a five-digit string, computed from the highest existing prefix.
 *   - `renumberImplementationPlans(root)` — one-time migration that walks the
 *     implementation-stage plans in dependency-then-creation order, assigns a
 *     prefix to every plan that lacks one, renames the files on disk, and rewrites
 *     every `parent_plan` / `depends_on` reference that names a renamed plan.
 *
 * Both operate on an explicit `root`, so they are testable against temporary
 * fixtures. `nextImplementationPlanNumber` is pure (read-only, no side effects).
 *
 * Decisions taken under ambiguity (documented per the no-stub rule):
 *   - The "next number" is (highest existing prefix) + 1, NOT (count + 1). This
 *     keeps numbering stable when a plan is removed and matches the stated intent
 *     of a single monotonic global order.
 *   - `renumber` only assigns prefixes to plans that LACK one; already-prefixed
 *     plans keep their name. When assigning, numbers already in use by prefixed
 *     plans are skipped, so no two plans ever collide on a number.
 *   - References are rewritten across ALL plan stages (not just implementation),
 *     because a `parent_plan`/`depends_on` in any stage that names a renamed
 *     implementation plan would otherwise dangle.
 *   - `depends_on` is treated as an inline scalar — `none` or a comma-separated
 *     list of slugs — matching the CTOC convention used elsewhere (see
 *     `parseDependsOn` in `state`/`actions`). YAML block-list form is not the
 *     convention and is left untouched.
 */

const path = require('path');
const safeFs = require('./safe-fs');
const { invalidate } = require('./cache');

const PREFIX_RE = /^(\d{5})-/;
const STAGES = ['vision', 'functional', 'implementation', 'todo', 'in-progress', 'review', 'done'];

/** Zero-pad a positive integer to five digits (grows past five for >= 100000). */
function pad5(n) {
  return String(n).padStart(5, '0');
}

/** Strip one layer of surrounding single/double quotes and trim. */
function unquote(v) {
  if (v === undefined || v === null) return v;
  return String(v).replace(/^["']|["']$/g, '').trim();
}

/** Path to a stage directory under `<root>/plans/`. */
function stageDir(root, stage) {
  return path.join(root, 'plans', stage);
}

/**
 * Highest numeric prefix among implementation plans, or 0 when none exist.
 * @param {string} root - project root
 * @returns {number}
 */
function highestImplementationNumber(root) {
  const dir = stageDir(root, 'implementation');
  if (!safeFs.existsSync(dir)) return 0;
  let max = 0;
  for (const f of safeFs.readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    const m = f.match(PREFIX_RE);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return max;
}

/**
 * Next global implementation-plan number as a five-digit string.
 * "00001" when no numbered implementation plans exist. Pure / read-only.
 *
 * @param {string} root - project root
 * @returns {string} zero-padded next number, e.g. "00007"
 */
function nextImplementationPlanNumber(root) {
  return pad5(highestImplementationNumber(root) + 1);
}

/**
 * Parse an inline `depends_on` scalar into a trimmed slug array.
 * `none`/absent/empty → []. Comma-separated → each trimmed non-empty token.
 * @param {*} raw
 * @returns {string[]}
 */
function parseDependsOn(raw) {
  if (raw === undefined || raw === null) return [];
  const s = String(raw).trim();
  if (s === '' || s.toLowerCase() === 'none') return [];
  return s.split(',').map(t => t.trim()).filter(t => t.length > 0);
}

/**
 * Kahn topological sort over intra-set `depends_on` edges, seeded and
 * tie-broken by input order (creation order). A dependency precedes its
 * dependents. Edges naming a slug outside the set are ignored. On a cycle the
 * remaining nodes are appended in input order rather than throwing.
 *
 * @param {Array<{slug: string, dependsOn: string[]}>} plans
 * @returns {Array} same objects, dependency-ordered
 */
function topoOrder(plans) {
  const bySlug = new Map(plans.map(p => [p.slug, p]));
  const indeg = new Map(plans.map(p => [p.slug, 0]));
  const dependents = new Map(plans.map(p => [p.slug, []]));

  for (const p of plans) {
    for (const dep of p.dependsOn) {
      if (!bySlug.has(dep)) continue; // edge outside the set
      indeg.set(p.slug, indeg.get(p.slug) + 1);
      dependents.get(dep).push(p.slug);
    }
  }

  const queue = plans.filter(p => indeg.get(p.slug) === 0).map(p => p.slug);
  const ordered = [];
  const seen = new Set();

  while (queue.length > 0) {
    const slug = queue.shift();
    if (seen.has(slug)) continue;
    seen.add(slug);
    ordered.push(bySlug.get(slug));
    for (const child of dependents.get(slug)) {
      indeg.set(child, indeg.get(child) - 1);
      if (indeg.get(child) === 0) queue.push(child);
    }
  }

  if (ordered.length < plans.length) {
    for (const p of plans) {
      if (!seen.has(p.slug)) ordered.push(p);
    }
  }
  return ordered;
}

/**
 * Remap a single-slug scalar value (e.g. `parent_plan`), preserving quoting.
 * `none`/empty is returned unchanged.
 * @param {string} rawValue - text after the colon (may be quoted)
 * @param {Map<string,string>} map - oldSlug → newSlug
 * @returns {string}
 */
function remapScalar(rawValue, map) {
  const raw = rawValue;
  const qm = raw.match(/^(["'])([\s\S]*)\1\s*$/);
  const quote = qm ? qm[1] : '';
  const inner = (qm ? qm[2] : raw).trim();
  if (inner === '' || inner.toLowerCase() === 'none') return raw;
  const mapped = map.has(inner) ? map.get(inner) : inner;
  return quote ? `${quote}${mapped}${quote}` : mapped;
}

/**
 * Remap a comma-separated list value (e.g. `depends_on`), preserving quoting.
 * `none`/empty is returned unchanged.
 * @param {string} rawValue - text after the colon (may be quoted)
 * @param {Map<string,string>} map - oldSlug → newSlug
 * @returns {string}
 */
function remapList(rawValue, map) {
  const raw = rawValue;
  const qm = raw.match(/^(["'])([\s\S]*)\1\s*$/);
  const quote = qm ? qm[1] : '';
  const inner = (qm ? qm[2] : raw).trim();
  if (inner === '' || inner.toLowerCase() === 'none') return raw;
  const tokens = inner.split(',').map(t => t.trim()).filter(Boolean);
  const mapped = tokens.map(t => (map.has(t) ? map.get(t) : t)).join(', ');
  return quote ? `${quote}${mapped}${quote}` : mapped;
}

/**
 * Rewrite `parent_plan` and `depends_on` references in file content using the
 * old→new slug map. Operates line-wise across every frontmatter block.
 * @param {string} content
 * @param {Map<string,string>} map
 * @returns {string}
 */
function remapReferences(content, map) {
  let out = content.replace(
    /^([ \t]*parent_plan[ \t]*:[ \t]*)(.*)$/gm,
    (_m, pre, val) => pre + remapScalar(val, map)
  );
  out = out.replace(
    /^([ \t]*depends_on[ \t]*:[ \t]*)(.*)$/gm,
    (_m, pre, val) => pre + remapList(val, map)
  );
  return out;
}

/**
 * Read the merged-frontmatter `depends_on` for a plan file (inline scalar).
 * Scans the whole file so a value in a second (gate-marker) block is still seen.
 * @param {string} content
 * @returns {string|undefined}
 */
function readDependsOn(content) {
  const m = content.match(/^\s*depends_on\s*:\s*(.+?)\s*$/m);
  return m ? unquote(m[1]) : undefined;
}

/**
 * Assign global sequential prefixes to implementation-stage plans that lack one,
 * rename the files on disk, and rewrite every `parent_plan`/`depends_on`
 * reference (in any stage) that names a renamed plan so no link dangles.
 *
 * Order: dependency order (via each plan's `depends_on`), falling back to
 * creation order (file birthtime, then slug for stability).
 *
 * @param {string} root - project root
 * @returns {Object<string,string>} mapping of old slug → new slug (renamed only)
 */
function renumberImplementationPlans(root) {
  const implDir = stageDir(root, 'implementation');
  if (!safeFs.existsSync(implDir)) return {};

  // Gather implementation plans with creation time + dependency edges.
  const plans = [];
  for (const f of safeFs.readdirSync(implDir)) {
    if (!f.endsWith('.md')) continue;
    const p = path.join(implDir, f);
    const content = safeFs.readFileSync(p, 'utf8');
    const stat = safeFs.statSync(p);
    plans.push({
      slug: f.replace(/\.md$/, ''),
      path: p,
      dependsOn: parseDependsOn(readDependsOn(content)),
      created: stat.birthtimeMs !== undefined ? stat.birthtimeMs : stat.birthtime.getTime()
    });
  }
  if (plans.length === 0) return {};

  // Stable creation order first, then dependency order.
  plans.sort((a, b) => (a.created - b.created) || a.slug.localeCompare(b.slug));
  const ordered = topoOrder(plans);

  // Numbers already claimed by pre-prefixed plans must not be reused.
  const used = new Set();
  for (const p of plans) {
    const m = p.slug.match(PREFIX_RE);
    if (m) used.add(parseInt(m[1], 10));
  }

  // Assign the next free number to each plan lacking a prefix.
  /** @type {Object<string, string>} */
  const mapping = {};
  /** @type {Map<string, string>} */
  const map = new Map();
  let n = 1;
  for (const p of ordered) {
    if (PREFIX_RE.test(p.slug)) continue; // already numbered — keep as-is
    while (used.has(n)) n++;
    used.add(n);
    const newSlug = `${pad5(n)}-${p.slug}`;
    mapping[p.slug] = newSlug;
    map.set(p.slug, newSlug);
    n++;
  }

  if (map.size === 0) return mapping; // nothing to rename

  // Rewrite references across every stage; rename the implementation files.
  for (const stage of STAGES) {
    const dir = stageDir(root, stage);
    if (!safeFs.existsSync(dir)) continue;
    for (const f of safeFs.readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const oldPath = path.join(dir, f);
      const slug = f.replace(/\.md$/, '');
      const content = safeFs.readFileSync(oldPath, 'utf8');
      const updated = remapReferences(content, map);

      if (stage === 'implementation' && map.has(slug)) {
        // This file is being renamed. Write new, remove old.
        const newPath = path.join(dir, `${map.get(slug)}.md`);
        safeFs.writeFileSync(newPath, updated, 'utf8');
        if (newPath !== oldPath) safeFs.unlinkSync(oldPath);
      } else if (updated !== content) {
        safeFs.writeFileSync(oldPath, updated, 'utf8');
      }
    }
  }

  // Renaming plan files changes what plan-count / plan-list reads see, so bust
  // the read cache immediately after the mutations (CF1 "always read fresh").
  invalidate();

  return mapping;
}

module.exports = {
  nextImplementationPlanNumber,
  renumberImplementationPlans,
  // exported for focused unit reuse / testing
  highestImplementationNumber,
  topoOrder,
  remapReferences
};
