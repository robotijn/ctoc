/**
 * CTOC Plan Archive
 *
 * Consolidates functional, implementation, and execution plans into
 * a single "done" archive file after human review approval.
 *
 * Features:
 * - Load plans from all stages
 * - Generate consolidated done file
 * - Archive feature with metadata
 */

const fs = require('fs');
const path = require('path');

class PlanArchive {
  constructor(root) {
    this.root = root || path.resolve(__dirname, '../..');
  }

  // Read a plan file if it exists
  readPlanFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) return null;
      return fs.readFileSync(filePath, 'utf8');
    } catch {
      return null;
    }
  }

  // Find a plan by name pattern in a directory
  findPlan(dir, namePattern) {
    const fullDir = path.join(this.root, dir);
    try {
      if (!fs.existsSync(fullDir)) return null;
      const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.md'));
      // Find file matching pattern (e.g., contains the feature name)
      const match = files.find(f => f.includes(namePattern));
      if (match) {
        return {
          name: match.replace('.md', ''),
          path: path.join(fullDir, match),
          content: this.readPlanFile(path.join(fullDir, match))
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  // Load functional plan from plans/functional/approved/
  loadFunctionalPlan(name) {
    return this.findPlan('plans/functional/approved', name);
  }

  // Load implementation plan from plans/implementation/approved/
  loadImplementationPlan(name) {
    return this.findPlan('plans/implementation/approved', name);
  }

  // Load execution output from plans/execution/
  loadExecutionPlan(name) {
    return this.findPlan('plans/execution', name);
  }

  // Load from review directory
  loadReviewPlan(name) {
    return this.findPlan('plans/review', name);
  }

  // Extract metadata from plan content
  extractMetadata(content) {
    const metadata = {};
    if (!content) return metadata;

    // Try to extract title from first heading
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) metadata.title = titleMatch[1];

    // Extract date if present
    const dateMatch = content.match(/\*\*Date\*\*:\s*(.+)/i) ||
                      content.match(/Date:\s*(\d{4}-\d{2}-\d{2})/i);
    if (dateMatch) metadata.date = dateMatch[1];

    return metadata;
  }

  // Generate consolidated done file content
  generateDoneFile(featureName, options = {}) {
    const {
      version = '?.?.?',
      completedAt = new Date().toISOString().split('T')[0],
      humanReview = 'PASSED',
      functionalPlan = null,
      implementationPlan = null,
      executionOutput = null,
      reviewNotes = ''
    } = options;

    // Build the consolidated markdown
    let content = `# Done: ${featureName}\n\n`;

    // Metadata table
    content += `## Metadata\n\n`;
    content += `| Field | Value |\n`;
    content += `|-------|-------|\n`;
    content += `| Version | v${version} |\n`;
    content += `| Completed | ${completedAt} |\n`;
    content += `| Human Review | ${humanReview} |\n`;
    content += `\n---\n\n`;

    // Functional Plan section
    content += `## Functional Plan (Steps 1-3)\n\n`;
    if (functionalPlan?.content) {
      content += functionalPlan.content.replace(/^#\s+.+$/m, '').trim();
    } else {
      content += `*No functional plan archived*\n`;
    }
    content += `\n\n---\n\n`;

    // Implementation Plan section
    content += `## Implementation Plan (Steps 4-6)\n\n`;
    if (implementationPlan?.content) {
      content += implementationPlan.content.replace(/^#\s+.+$/m, '').trim();
    } else {
      content += `*No implementation plan archived*\n`;
    }
    content += `\n\n---\n\n`;

    // Execution Output section
    content += `## Execution Output (Steps 7-14)\n\n`;
    if (executionOutput?.content) {
      content += executionOutput.content.replace(/^#\s+.+$/m, '').trim();
    } else {
      content += `*No execution output archived*\n`;
    }
    content += `\n\n---\n\n`;

    // Human Review section
    content += `## Human Acceptance (Step 15)\n\n`;
    content += `**Status:** ${humanReview}\n\n`;
    if (reviewNotes) {
      content += `**Notes:**\n${reviewNotes}\n`;
    }

    return content;
  }

  // Archive a feature to plans/done/
  archiveFeature(featureName, options = {}) {
    const {
      version,
      humanReview = 'PASSED',
      reviewNotes = '',
      deleteSource = false
    } = options;

    try {
      // Load all related plans
      const functionalPlan = this.loadFunctionalPlan(featureName);
      const implementationPlan = this.loadImplementationPlan(featureName);
      const executionOutput = this.loadExecutionPlan(featureName);
      const reviewPlan = this.loadReviewPlan(featureName);

      // Generate the done file content
      const content = this.generateDoneFile(featureName, {
        version,
        completedAt: new Date().toISOString().split('T')[0],
        humanReview,
        functionalPlan,
        implementationPlan,
        executionOutput: executionOutput || reviewPlan,
        reviewNotes
      });

      // Ensure done directory exists
      const doneDir = path.join(this.root, 'plans', 'done');
      if (!fs.existsSync(doneDir)) {
        fs.mkdirSync(doneDir, { recursive: true });
      }

      // Generate filename with date prefix
      const date = new Date().toISOString().split('T')[0];
      const safeName = featureName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const fileName = `${date}-${safeName}.md`;
      const filePath = path.join(doneDir, fileName);

      // Write the archive file
      fs.writeFileSync(filePath, content);

      // Optionally delete source files
      if (deleteSource) {
        const sources = [functionalPlan, implementationPlan, executionOutput, reviewPlan];
        for (const plan of sources) {
          if (plan?.path && fs.existsSync(plan.path)) {
            fs.unlinkSync(plan.path);
          }
        }
      }

      return {
        success: true,
        path: filePath,
        fileName
      };

    } catch (e) {
      return {
        success: false,
        error: e.message
      };
    }
  }

  // Create a minimal done file for historical features
  createHistoricalDone(featureName, version, completedAt, description = '') {
    try {
      const doneDir = path.join(this.root, 'plans', 'done');
      if (!fs.existsSync(doneDir)) {
        fs.mkdirSync(doneDir, { recursive: true });
      }

      const safeName = featureName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const fileName = `${completedAt}-${safeName}.md`;
      const filePath = path.join(doneDir, fileName);

      const content = `# Done: ${featureName}

## Metadata

| Field | Value |
|-------|-------|
| Version | v${version} |
| Completed | ${completedAt} |
| Human Review | HISTORICAL |

---

## Summary

${description || `Feature ${featureName} was completed and committed.`}

---

*This is a historical archive entry created retroactively.*
`;

      fs.writeFileSync(filePath, content);

      return {
        success: true,
        path: filePath,
        fileName
      };

    } catch (e) {
      return {
        success: false,
        error: e.message
      };
    }
  }

  // List all done files
  listDone() {
    const doneDir = path.join(this.root, 'plans', 'done');
    try {
      if (!fs.existsSync(doneDir)) return [];
      return fs.readdirSync(doneDir)
        .filter(f => f.endsWith('.md'))
        .map(f => {
          const filePath = path.join(doneDir, f);
          const stat = fs.statSync(filePath);
          const content = this.readPlanFile(filePath);
          const metadata = this.extractMetadata(content);
          return {
            name: f.replace('.md', ''),
            path: filePath,
            modified: stat.mtime,
            title: metadata.title,
            version: this.extractVersion(content)
          };
        })
        .sort((a, b) => b.modified - a.modified);
    } catch {
      return [];
    }
  }

  // Extract version from done file content
  extractVersion(content) {
    if (!content) return null;
    const match = content.match(/\|\s*Version\s*\|\s*v?([\d.]+)\s*\|/i);
    return match ? match[1] : null;
  }
}

module.exports = PlanArchive;
