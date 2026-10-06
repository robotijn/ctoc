'use strict';

// Lints every .js file under src/, test/ and scripts/: no `var`, no trailing whitespace, no tab.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
let errors = 0;
for (const dir of ['src', 'test', 'scripts']) {
  for (const name of fs.readdirSync(path.join(root, dir)).filter((n) => n.endsWith('.js'))) {
    fs.readFileSync(path.join(root, dir, name), 'utf8').split('\n').forEach((line, i) => {
      const where = `${dir}/${name}:${i + 1}`;
      if (/\bvar\s/.test(line)) { console.error(`${where}: use const or let, not var`); errors++; }
      if (/[ \t]+$/.test(line)) { console.error(`${where}: trailing whitespace`); errors++; }
      if (line.includes('\t')) { console.error(`${where}: tab character`); errors++; }
    });
  }
}
console.log(`lint: ${errors} errors, 0 warnings`);
process.exitCode = errors ? 1 : 0;
