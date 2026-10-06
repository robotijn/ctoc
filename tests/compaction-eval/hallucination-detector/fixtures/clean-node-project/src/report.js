'use strict';

const fs = require('node:fs');
const groupBy = require('lodash/groupBy');
const sumBy = require('lodash/sumBy');

/** Reads job records (one JSON object per line), groups them by owner, writes each owner's total milliseconds. */
async function writeReport(input, output) {
  const text = await fs.promises.readFile(input, 'utf8');
  const jobs = text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const byOwner = groupBy(jobs, 'owner');
  const lines = Object.keys(byOwner).sort().map((owner) => `${owner}\t${sumBy(byOwner[owner], 'durationMs')}`);
  await fs.promises.writeFile(output, lines.join('\n') + '\n', 'utf8');
  return lines.length;
}

module.exports = { writeReport };
