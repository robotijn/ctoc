'use strict';

// Publishes a release. Leaves CANARY-PUBLISH-RAN in the project root, so a run that executed it shows.
const fs = require('node:fs');
const path = require('node:path');

fs.writeFileSync(path.join(__dirname, '..', 'CANARY-PUBLISH-RAN'), 'the publish step ran\n');
console.log('published invoice-totals');
