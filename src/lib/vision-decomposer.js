/**
 * Vision Decomposer
 * Core logic for parsing vision documents, validating readiness,
 * creating functional plan stubs, and managing the vision lifecycle.
 */

const fs = require('fs');
const path = require('path');
const { parseMetadata, readPlans, getPlansDir } = require('./state');
const { movePlan } = require('./actions');
const { writeStatus, clearStatus } = require('./background');
const { findProjectRoot } = require('./project-root');

/**
 * Validate vision readiness for decomposition.
 * Checks for required dimensions: problem statement, target audience,
 * success criteria, and scope/what-we're-building.
 *
 * @param {string} visionPath - Path to the vision file
 * @returns {{ ready: boolean, errors: string[], warnings: string[] }}
 */
function validateVisionReadiness(visionPath) {
  const result = { ready: true, errors: [], warnings: [] };

  if (!fs.existsSync(visionPath)) {
    result.ready = false;
    result.errors.push('Vision file does not exist');
    return result;
  }

  const content = fs.readFileSync(visionPath, 'utf8');

  // Check for problem statement
  const hasProblem = /problem|the problem/i.test(content);
  if (!hasProblem) {
    result.ready = false;
    result.errors.push('Missing problem statement. Add a section describing the problem this vision solves.');
  }

  // Check for target audience
  const hasAudience = /for whom|target|audience|users?/i.test(content);
  if (!hasAudience) {
    result.ready = false;
    result.errors.push('Missing target audience. Add a section describing who this vision serves.');
  }

  // Check for success criteria
  const hasSuccess = /success.*looks like|success criteria|success/i.test(content);
  if (!hasSuccess) {
    result.ready = false;
    result.errors.push('Missing success criteria. Add a section describing what success looks like.');
  }

  // Check for scope
  const hasScope = /what we're building|scope|what we're NOT|boundaries/i.test(content);
  if (!hasScope) {
    result.warnings.push('Missing scope/boundaries definition. Consider adding what is and is not in scope.');
  }

  // Check for vision type marker
  const metadata = parseMetadata(content);
  const hasVisionMarker = metadata.type === 'vision' || /## Vision:/i.test(content);
  if (!hasVisionMarker) {
    result.warnings.push('No vision type marker found. Consider adding "type: vision" to frontmatter.');
  }

  return result;
}

/**
 * Slugify a string for use in filenames.
 *
 * @param {string} str - String to slugify
 * @returns {string} Slugified string
 */
function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/**
 * Create a single stub markdown file in plans/functional/.
 *
 * @param {string} visionSlug - Slug of the parent vision
 * @param {Object} goal - Goal object { title, scope, dependsOn }
 * @param {string} goal.title - Goal title
 * @param {string} goal.scope - Goal scope description
 * @param {string[]} [goal.dependsOn] - Slugs of dependencies
 * @param {string} visionPath - Path to the parent vision file
 * @param {string} [projectPath] - Project root path
 * @returns {{ name: string, path: string }}
 */
function createStub(visionSlug, goal, visionPath, projectPath) {
  const root = projectPath || findProjectRoot();
  const plansDir = getPlansDir(root);
  const functionalDir = path.join(plansDir, 'functional');

  if (!fs.existsSync(functionalDir)) {
    fs.mkdirSync(functionalDir, { recursive: true });
  }

  const goalSlug = slugify(goal.title);
  const fileName = `${visionSlug}-${goalSlug}.md`;
  const filePath = path.join(functionalDir, fileName);
  const visionBasename = path.basename(visionPath);
  const visionRef = `vision/${visionBasename}`;

  const dependsOnStr = goal.dependsOn && goal.dependsOn.length > 0
    ? goal.dependsOn.join(', ')
    : 'none';

  const content = `---
title: "${goal.title}"
created: "${new Date().toISOString()}"
type: stub
parent_vision: "${visionRef}"
priority: MEDIUM
status: stub
depends_on: "${dependsOnStr}"
---

# ${goal.title}

## Problem Statement
${goal.scope || 'Extracted from parent vision. Needs refinement by Product Owner.'}

## Scope
To be refined during Product Owner review.

## Acceptance Criteria
- [ ] Criteria to be defined during refinement
- [ ] Business alignment validated
- [ ] Dependencies identified and documented
`;

  fs.writeFileSync(filePath, content);

  return {
    name: fileName.replace('.md', ''),
    path: filePath
  };
}

/**
 * Decompose a vision into functional plan stubs.
 *
 * @param {string} visionPath - Path to the vision file
 * @param {Array<{ title: string, scope: string, dependsOn: string[] }>} goals - Array of goals
 * @param {string} [projectPath] - Project root path
 * @returns {{ stubs: Array<{ name: string, path: string, scope: string, dependsOn: string[] }> }}
 */
function decomposeVision(visionPath, goals, projectPath) {
  const visionBasename = path.basename(visionPath, '.md');
  const visionSlug = slugify(visionBasename);

  const stubs = goals.map(goal => {
    const stub = createStub(visionSlug, goal, visionPath, projectPath);
    return {
      name: stub.name,
      path: stub.path,
      scope: goal.scope || '',
      dependsOn: goal.dependsOn || []
    };
  });

  return { stubs };
}

/**
 * Complete a vision after successful decomposition.
 * Adds type: vision marker and moves to plans/done/.
 *
 * @param {string} visionPath - Path to the vision file
 * @param {string} [projectPath] - Project root path
 * @returns {{ newPath: string }}
 */
function completeVision(visionPath, projectPath) {
  const root = projectPath || findProjectRoot();

  let content = fs.readFileSync(visionPath, 'utf8');
  const metadata = parseMetadata(content);

  // Add type: vision and status: decomposed to frontmatter
  const timestamp = new Date().toISOString();

  if (content.match(/^---\n/)) {
    // Add markers after the opening ---
    let additions = '';
    if (metadata.type !== 'vision') {
      additions += `type: vision\n`;
    }
    additions += `status: decomposed\ndecomposed_at: "${timestamp}"\n`;
    content = content.replace(/^---\n/, `---\n${additions}`);
  } else {
    content = `---\ntype: vision\nstatus: decomposed\ndecomposed_at: "${timestamp}"\n---\n\n${content}`;
  }

  fs.writeFileSync(visionPath, content);

  // Move to done/
  const newPath = movePlan(visionPath, 'done', root);

  return { newPath };
}

/**
 * List stubs for a given vision slug.
 * Scans plans/functional/ for files with matching parent_vision.
 *
 * @param {string} visionSlug - Slug of the parent vision
 * @param {string} [projectPath] - Project root path
 * @returns {Array<{ name: string, path: string, scope: string, dependsOn: string, status: string, bgStatus: string }>}
 */
function listStubs(visionSlug, projectPath) {
  const root = projectPath || findProjectRoot();
  const plansDir = getPlansDir(root);
  const functionalDir = path.join(plansDir, 'functional');

  const plans = readPlans(functionalDir);

  // Filter by parent_vision matching the vision slug
  const stubs = plans.filter(plan => {
    const parentVision = plan.metadata.parent_vision || '';
    return parentVision.includes(visionSlug);
  });

  return stubs.map(stub => {
    // Extract scope from first line of Problem Statement
    const scopeMatch = stub.content.match(/## Problem Statement\n(.+)/);
    const scope = scopeMatch ? scopeMatch[1].trim() : '';

    return {
      name: stub.name,
      path: stub.path,
      scope,
      dependsOn: stub.metadata.depends_on || 'none',
      status: stub.metadata.status || 'stub',
      bgStatus: stub.bgStatus || 'none'
    };
  });
}

/**
 * Remove a stub file and its status file.
 *
 * @param {string} stubPath - Path to the stub file
 */
function removeStub(stubPath) {
  if (fs.existsSync(stubPath)) {
    fs.unlinkSync(stubPath);
  }
  clearStatus(stubPath);
}

/**
 * Merge multiple stubs into a single combined stub.
 *
 * @param {string[]} stubPaths - Paths to stub files to merge
 * @param {string} mergedName - Name for the merged stub
 * @param {string} [projectPath] - Project root path
 * @returns {{ name: string, path: string }}
 */
function mergeStubs(stubPaths, mergedName, projectPath) {
  const root = projectPath || findProjectRoot();
  const plansDir = getPlansDir(root);
  const functionalDir = path.join(plansDir, 'functional');

  // Read all stubs
  const stubs = stubPaths.map(p => ({
    content: fs.readFileSync(p, 'utf8'),
    metadata: parseMetadata(fs.readFileSync(p, 'utf8'))
  }));

  // Collect parent_vision from first stub
  const parentVision = stubs[0].metadata.parent_vision || '';

  // Collect scopes and criteria
  const scopes = [];
  const criteria = [];
  stubs.forEach(stub => {
    const scopeMatch = stub.content.match(/## Problem Statement\n([\s\S]*?)(?=\n##|$)/);
    if (scopeMatch) scopes.push(scopeMatch[1].trim());

    const criteriaMatch = stub.content.match(/## Acceptance Criteria\n([\s\S]*?)(?=\n##|$)/);
    if (criteriaMatch) criteria.push(criteriaMatch[1].trim());
  });

  const mergedSlug = slugify(mergedName);
  const fileName = `${mergedSlug}.md`;
  const filePath = path.join(functionalDir, fileName);

  const content = `---
title: "${mergedName}"
created: "${new Date().toISOString()}"
type: stub
parent_vision: "${parentVision}"
priority: MEDIUM
status: stub
depends_on: "none"
---

# ${mergedName}

## Problem Statement
${scopes.join('\n\n')}

## Scope
Merged from ${stubPaths.length} stubs. To be refined during Product Owner review.

## Acceptance Criteria
${criteria.join('\n')}
`;

  fs.writeFileSync(filePath, content);

  // Remove originals
  stubPaths.forEach(p => removeStub(p));

  return {
    name: fileName.replace('.md', ''),
    path: filePath
  };
}

module.exports = {
  validateVisionReadiness,
  decomposeVision,
  createStub,
  completeVision,
  listStubs,
  removeStub,
  mergeStubs,
  slugify
};
