'use strict';

const DEFAULTS = Object.freeze({ title: 'Build report' });

/**
 * The report settings: the defaults, overridden by the known keys of `overrides`.
 * @param {object} [overrides]
 * @returns {{ title: string }}
 */
function loadSettings(overrides = {}) {
  const out = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) out[key] = overrides[key];
  }
  return out;
}

module.exports = { DEFAULTS, loadSettings };
