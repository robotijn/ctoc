'use strict';

const fs = require('node:fs');
const path = require('node:path');

const THEMES = new Set(['light', 'dark']);

/** Returns the saved theme, or 'light' when the file is missing, unreadable or invalid. */
function readTheme(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')).theme;
    return THEMES.has(value) ? value : 'light';
  } catch {
    return 'light';
  }
}

/** Saves the theme atomically: a temporary file beside the target, renamed over it. */
function writeTheme(file, theme) {
  if (!THEMES.has(theme)) throw new Error(`unknown theme: ${theme}`);
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify({ theme }));
  fs.renameSync(tmp, file);
}

module.exports = { readTheme, writeTheme };
