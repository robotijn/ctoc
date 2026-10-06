'use strict';

// Every .js and .json file under src/, test/ and scripts/ ends with exactly one newline.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
let bad = 0;
for (const dir of ['src', 'test', 'scripts']) {
  for (const name of fs.readdirSync(path.join(root, dir)).filter((n) => /\.(js|json)$/.test(n))) {
    const text = fs.readFileSync(path.join(root, dir, name), 'utf8');
    if (!text.endsWith('\n') || text.endsWith('\n\n')) { console.error(`${dir}/${name}: must end with exactly one newline`); bad++; }
  }
}
console.log(`format: ${bad} files need formatting`);
process.exitCode = bad ? 1 : 0;
