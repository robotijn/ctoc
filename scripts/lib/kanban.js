/**
 * CTOC Kanban - Pure JavaScript, OS independent
 * No shell calls, no execSync, works everywhere
 *
 * Features:
 * - Numbered items across all columns
 * - Legend display below kanban
 * - Item lookup by number for human review
 */

const fs = require('fs');
const path = require('path');

class Kanban {
  constructor(root) {
    this.root = root || path.resolve(__dirname, '../..');
    this.statePath = path.join(this.root, '.ctoc', 'kanban.yaml');
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

    // Column order for numbering: backlog, functional, technical, ready, building, review, done
    const columns = [
      { key: 'backlog', dir: 'plans/functional/draft' },
      { key: 'functional', dir: 'plans/functional/approved' },
      { key: 'technical', dir: 'plans/implementation/draft' },
      { key: 'ready', dir: 'plans/implementation/approved' },
      { key: 'building', dir: 'plans/in_progress' },
      { key: 'review', dir: 'plans/review' },
      { key: 'done', dir: 'plans/done' }
    ];

    for (const col of columns) {
      const fileItems = this.list(col.dir, col.key);
      for (const item of fileItems) {
        items[num] = {
          number: num,
          name: item.name,
          displayName: item.displayName,
          column: col.key,
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
    const doneFiles = this.list('plans/done', 'done');
    return {
      version: this.getVersion(),
      columns: {
        backlog: this.count('plans/functional/draft'),
        functional: this.count('plans/functional/approved'),
        technical: this.count('plans/implementation/draft'),
        ready: this.count('plans/implementation/approved'),
        building: this.count('plans/in_progress'),
        review: this.count('plans/review'),
        done: doneFiles.length
      },
      items: {
        backlog: this.list('plans/functional/draft', 'backlog'),
        functional: this.list('plans/functional/approved', 'functional'),
        technical: this.list('plans/implementation/draft', 'technical'),
        ready: this.list('plans/implementation/approved', 'ready'),
        building: this.list('plans/in_progress', 'building'),
        review: this.list('plans/review', 'review'),
        done: doneFiles
      },
      numberedItems: this.getNumberedItems()
    };
  }

  // Generate legend from numbered items
  generateLegend(numberedItems, maxItems = 20) {
    const entries = Object.entries(numberedItems).slice(0, maxItems);
    if (entries.length === 0) return '  (no items)';

    // Group by column for better display
    const byColumn = {};
    for (const [num, item] of entries) {
      if (!byColumn[item.column]) byColumn[item.column] = [];
      byColumn[item.column].push({ num, item });
    }

    const lines = [];
    const columnLabels = {
      backlog: 'Backlog',
      functional: 'Functional',
      technical: 'Technical',
      ready: 'Ready',
      building: 'Building',
      review: 'Review',
      done: 'Done'
    };

    for (const [col, items] of Object.entries(byColumn)) {
      const label = columnLabels[col] || col;
      const itemList = items.map(({ num, item }) => `[${num}] ${item.displayName.slice(0, 20)}`).join('  ');
      lines.push(`  ${label}: ${itemList}`);
    }

    return lines.join('\n');
  }

  // Render kanban board with legend
  render() {
    const d = this.getData();
    const c = d.columns;
    const legend = this.generateLegend(d.numberedItems);
    const version = d.version.padEnd(8);

    return `
╔══════════════════════════════════════════════════════════════════════════════╗
║  CTOC KANBAN                                                      v${version}  ║
╠═════════╤══════════╤══════════╤═════════╤═════════╤═════════╤════════════════╣
║ BACKLOG │FUNCTIONAL│TECHNICAL │  READY  │BUILDING │ REVIEW  │     DONE       ║
║ (draft) │(steps1-3)│(steps4-6)│         │ (7-14)  │ [HUMAN] │                ║
╠═════════╪══════════╪══════════╪═════════╪═════════╪═════════╪════════════════╣
║   (${String(c.backlog).padStart(2)})  │   (${String(c.functional).padStart(2)})   │   (${String(c.technical).padStart(2)})   │  (${String(c.ready).padStart(2)})   │  (${String(c.building).padStart(2)})   │  (${String(c.review).padStart(2)})   │     (${String(c.done).padStart(2)})       ║
╚═════════╧══════════╧══════════╧═════════╧═════════╧═════════╧════════════════╝

Legend:
${legend}

Actions:
  [N] New feature    [R#] Review item #    [V#] View item #
`.trim();
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
