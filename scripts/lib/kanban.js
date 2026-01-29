/**
 * CTOC Kanban - Pure JavaScript, OS independent
 * No shell calls, no execSync, works everywhere
 *
 * Features:
 * - Numbered items across all columns
 * - Legend display below kanban
 * - Item lookup by number for human review
 * - Supports both old nested and new flat directory structures
 */

const fs = require('fs');
const path = require('path');
const terminalUI = require('./terminal-ui');

// New flat directory structure
const PLAN_DIRS = {
  FUNCTIONAL_DRAFT: '1_functional_draft',
  FUNCTIONAL_APPROVED: '2_functional_approved',
  TECHNICAL_DRAFT: '3_technical_draft',
  TECHNICAL_APPROVED: '4_technical_approved',
  IRON_LOOP: '5_iron_loop',
  BUILDING: '6_building',
  REVIEW: '7_ready_for_review',
  DONE: '8_done'
};

class Kanban {
  constructor(root) {
    this.root = root || path.resolve(__dirname, '../..');
    this.statePath = path.join(this.root, '.ctoc', 'kanban.yaml');
    // Detect which directory structure exists
    this.useNewStructure = this._detectNewStructure();
  }

  // Check if new flat directory structure exists
  _detectNewStructure() {
    const newDir = path.join(this.root, 'plans', PLAN_DIRS.FUNCTIONAL_DRAFT);
    return fs.existsSync(newDir);
  }

  // Get the directory path for a column, supporting both old and new structures
  _getColumnDir(column) {
    if (this.useNewStructure) {
      // New flat structure
      const mapping = {
        backlog: PLAN_DIRS.FUNCTIONAL_DRAFT,
        functional: PLAN_DIRS.FUNCTIONAL_APPROVED,
        technical: PLAN_DIRS.TECHNICAL_DRAFT,
        ready: PLAN_DIRS.TECHNICAL_APPROVED,
        iron_loop: PLAN_DIRS.IRON_LOOP,
        building: PLAN_DIRS.BUILDING,
        review: PLAN_DIRS.REVIEW,
        done: PLAN_DIRS.DONE
      };
      return mapping[column] || column;
    } else {
      // Old nested structure
      const mapping = {
        backlog: 'functional/draft',
        functional: 'functional/approved',
        technical: 'implementation/draft',
        ready: 'implementation/approved',
        building: 'in_progress',
        review: 'review',
        done: 'done'
      };
      return mapping[column] || column;
    }
  }

  // Count .md files in a directory
  count(dir) {
    const fullPath = path.join(this.root, dir);
    try {
      if (!fs.existsSync(fullPath)) return 0;
      return fs.readdirSync(fullPath).filter(f => f.endsWith('.md')).length;
    } catch {
      return 0;
    }
  }

  // List .md files in a directory with metadata
  list(dir, column) {
    const fullPath = path.join(this.root, dir);
    try {
      if (!fs.existsSync(fullPath)) return [];
      return fs.readdirSync(fullPath)
        .filter(f => f.endsWith('.md'))
        .map(f => {
          const filePath = path.join(fullPath, f);
          const stat = fs.statSync(filePath);
          // Extract feature name from filename
          // Formats: 2026-01-29-001-feature-name.md -> feature-name
          //          2026-01-29-feature-name.md -> feature-name
          const baseName = f.replace('.md', '');
          const nameParts = baseName.split('-');
          let displayName = baseName;
          // Check if starts with date pattern (YYYY-MM-DD)
          if (nameParts.length >= 3 && /^\d{4}$/.test(nameParts[0])) {
            // If 4th part is a number (sequence), skip it too
            if (nameParts.length > 4 && /^\d+$/.test(nameParts[3])) {
              displayName = nameParts.slice(4).join('-');
            } else if (nameParts.length > 3) {
              displayName = nameParts.slice(3).join('-');
            }
          }
          return {
            name: baseName,
            displayName: displayName,
            path: filePath,
            column: column,
            modified: stat.mtime
          };
        })
        .sort((a, b) => b.modified - a.modified);
    } catch {
      return [];
    }
  }

  // Get version from VERSION file
  getVersion() {
    try {
      return fs.readFileSync(path.join(this.root, 'VERSION'), 'utf8').trim();
    } catch {
      return '0.0.0';
    }
  }

  // Load done items from state file (recent completions)
  loadState() {
    try {
      if (!fs.existsSync(this.statePath)) {
        return { done: [], lastUpdated: null };
      }
      const content = fs.readFileSync(this.statePath, 'utf8');
      return this.parseYaml(content);
    } catch {
      return { done: [], lastUpdated: null };
    }
  }

  // Save state
  saveState(state) {
    const dir = path.dirname(this.statePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.statePath, this.toYaml(state));
  }

  // Add completed item
  addDone(name, version) {
    const state = this.loadState();
    state.done.unshift({
      name,
      version,
      completedAt: new Date().toISOString()
    });
    // Keep last 20 items
    state.done = state.done.slice(0, 20);
    state.lastUpdated = new Date().toISOString();
    this.saveState(state);
  }

  // Simple YAML parser (no dependencies)
  parseYaml(content) {
    const result = { done: [] };
    const lines = content.split('\n');
    let inDone = false;
    let currentItem = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === 'done:') {
        inDone = true;
        continue;
      }
      if (trimmed.startsWith('lastUpdated:')) {
        result.lastUpdated = trimmed.split(': ')[1]?.replace(/['"]/g, '');
        continue;
      }
      if (inDone) {
        if (trimmed.startsWith('- name:')) {
          if (currentItem) result.done.push(currentItem);
          currentItem = { name: trimmed.replace('- name:', '').trim().replace(/['"]/g, '') };
        } else if (trimmed.startsWith('version:') && currentItem) {
          currentItem.version = trimmed.replace('version:', '').trim().replace(/['"]/g, '');
        } else if (trimmed.startsWith('completedAt:') && currentItem) {
          currentItem.completedAt = trimmed.replace('completedAt:', '').trim().replace(/['"]/g, '');
        } else if (trimmed && !trimmed.startsWith('-') && !trimmed.includes(':')) {
          inDone = false;
        }
      }
    }
    if (currentItem) result.done.push(currentItem);
    return result;
  }

  // Simple YAML serializer
  toYaml(state) {
    let yaml = `# CTOC Kanban State\nlastUpdated: "${state.lastUpdated || new Date().toISOString()}"\ndone:\n`;
    for (const item of state.done || []) {
      yaml += `  - name: "${item.name}"\n`;
      yaml += `    version: "${item.version || ''}"\n`;
      yaml += `    completedAt: "${item.completedAt || ''}"\n`;
    }
    return yaml;
  }

  // Get all items with numbers assigned across columns
  getNumberedItems() {
    const items = {};
    let num = 1;

    // Column order for numbering
    const columnKeys = ['backlog', 'functional', 'technical', 'ready', 'building', 'review', 'done'];

    for (const key of columnKeys) {
      const dir = 'plans/' + this._getColumnDir(key);
      const fileItems = this.list(dir, key);
      for (const item of fileItems) {
        items[num] = {
          number: num,
          name: item.name,
          displayName: item.displayName,
          column: key,
          path: item.path,
          modified: item.modified
        };
        num++;
      }
    }

    return items;
  }

  // Get item by number for review
  getItem(number) {
    const items = this.getNumberedItems();
    return items[number] || null;
  }

  // Get full kanban data
  getData() {
    const columnKeys = ['backlog', 'functional', 'technical', 'ready', 'building', 'review', 'done'];

    const columns = {};
    const items = {};

    for (const key of columnKeys) {
      const dir = 'plans/' + this._getColumnDir(key);
      const fileItems = this.list(dir, key);
      columns[key] = fileItems.length;
      items[key] = fileItems;
    }

    return {
      version: this.getVersion(),
      columns,
      items,
      numberedItems: this.getNumberedItems(),
      useNewStructure: this.useNewStructure
    };
  }

  // Generate legend from numbered items
  generateLegend(numberedItems, maxItems = 20) {
    // Use terminal-ui legend function
    return terminalUI.legend(numberedItems, maxItems);
  }

  // Render kanban board with legend
  render() {
    const d = this.getData();
    const legend = this.generateLegend(d.numberedItems);

    // Use terminal-ui kanban board
    const board = terminalUI.kanbanBoard(d);

    return `${board}

Legend:
${legend}

Actions:
  [N] New feature    [R#] Review item #    [V#] View item #`;
  }

  // Render compact admin view
  renderAdmin() {
    const d = this.getData();
    const c = d.columns;
    const total = c.backlog + c.functional + c.technical + c.ready + c.building + c.review + c.done;

    // Generate compact numbered list
    const items = Object.entries(d.numberedItems).slice(0, 10);
    const itemLines = items.map(([num, item]) => {
      const col = item.column.slice(0, 3).toUpperCase();
      return `[${num}] ${col}: ${item.displayName.slice(0, 25)}`;
    });

    return {
      summary: `B:${c.backlog} F:${c.functional} T:${c.technical} R:${c.ready} I:${c.building} H:${c.review} D:${c.done} (${total} total)`,
      items: itemLines,
      data: d
    };
  }

  // JSON output for Claude to read directly
  toJSON() {
    return JSON.stringify(this.getData(), null, 2);
  }
}

module.exports = Kanban;

// CLI usage
if (require.main === module) {
  const kanban = new Kanban();
  const arg = process.argv[2];
  if (arg === '--json') {
    console.log(kanban.toJSON());
  } else {
    console.log(kanban.render());
  }
}
