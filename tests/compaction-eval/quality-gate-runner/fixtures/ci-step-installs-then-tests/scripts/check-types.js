'use strict';

// Checks every exported function's parameter count against the signatures in src/types.json.
const path = require('node:path');

const types = require('../src/types.json');
let errors = 0;
for (const [file, fns] of Object.entries(types)) {
  const mod = require(path.join(__dirname, '..', 'src', file));
  for (const [name, arity] of Object.entries(fns)) {
    if (typeof mod[name] !== 'function') {
      console.error(`src/${file}: ${name} is not an exported function`);
      errors++;
    } else if (mod[name].length !== arity) {
      console.error(`src/${file}: ${name} takes ${mod[name].length} parameters; src/types.json declares ${arity}`);
      errors++;
    }
  }
}
console.log(`check-types: ${errors} errors`);
process.exitCode = errors ? 1 : 0;
