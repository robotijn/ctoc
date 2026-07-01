/**
 * Library Area (A3.2 / CTOC v7)
 *
 * Browse agents, skills, and slash commands. Filterable by category.
 */

const safeFs = require('../lib/safe-fs');
const path = require('path');
const { c, line, renderFooter } = require('../lib/tui');

function countFiles(dir, ext = '.md') {
  if (!safeFs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of safeFs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) total += countFiles(p, ext);
    else if (entry.name.endsWith(ext)) total += 1;
  }
  return total;
}

function listCategories(dir) {
  if (!safeFs.existsSync(dir)) return [];
  return safeFs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.'))
    .map(e => ({ name: e.name, count: countFiles(path.join(dir, e.name)) }))
    .sort((a, b) => b.count - a.count);
}

function render(app) {
  const root = app.projectPath || process.cwd();
  let out = '\n';
  out += `${c.bold}Library${c.reset}\n\n`;

  const agentsDir = path.join(root, 'agents');
  const skillsDir = path.join(root, 'skills');
  const commandsDir = path.join(root, 'src', 'commands');

  out += `  ${c.bold}Agents${c.reset}    ${c.cyan}${countFiles(agentsDir)}${c.reset}\n`;
  for (const cat of listCategories(agentsDir).slice(0, 6)) {
    out += `    ${cat.name.padEnd(18)} ${c.dim}${cat.count}${c.reset}\n`;
  }
  out += '\n';

  out += `  ${c.bold}Skills${c.reset}    ${c.cyan}${countFiles(skillsDir)}${c.reset}\n`;
  for (const cat of listCategories(skillsDir).slice(0, 6)) {
    out += `    ${cat.name.padEnd(18)} ${c.dim}${cat.count}${c.reset}\n`;
  }
  out += '\n';

  out += `  ${c.bold}Commands${c.reset}  ${c.cyan}${countFiles(commandsDir, '.js')}${c.reset}\n`;
  if (safeFs.existsSync(commandsDir)) {
    for (const f of safeFs.readdirSync(commandsDir).filter(f => f.endsWith('.js')).slice(0, 8)) {
      out += `    ${c.dim}${f}${c.reset}\n`;
    }
  }
  out += '\n';

  out += line() + '\n';
  out += renderFooter(['←/→ areas', 'q quit']);
  return out;
}

function handleKey(_key, _app) {
  return false;
}

module.exports = { render, handleKey };
