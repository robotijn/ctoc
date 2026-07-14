/**
 * R6-D — update.js must resolve HOME via os.homedir(), never bare env vars.
 *
 * `const HOME = process.env.HOME || process.env.USERPROFILE` returns undefined when
 * BOTH env vars are unset, and the very next line `path.join(HOME, ...)` throws a
 * TypeError at module load — /ctoc:update dies before it can update anything.
 * os.homedir() always resolves the home directory.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');

const UPDATE_PATH = require.resolve('../src/commands/update');

test('update.js loads even when HOME and USERPROFILE are both unset', () => {
  const savedHome = process.env.HOME;
  const savedUserProfile = process.env.USERPROFILE;
  delete process.env.HOME;
  delete process.env.USERPROFILE;
  delete require.cache[UPDATE_PATH];
  try {
    let mod;
    assert.doesNotThrow(() => { mod = require(UPDATE_PATH); },
      'update.js must resolve the home directory via os.homedir() when env vars are unset');
    assert.equal(typeof mod.update, 'function', 'the module must still export its API');
  } finally {
    if (savedHome === undefined) delete process.env.HOME; else process.env.HOME = savedHome;
    if (savedUserProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = savedUserProfile;
    delete require.cache[UPDATE_PATH];
  }
});

test('os.homedir() is defined (sanity: the replacement source is available)', () => {
  assert.ok(os.homedir() && os.homedir().length > 0);
});
