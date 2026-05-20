/**
 * Guard test: no slash command may pin a model (v6.9.29).
 *
 * A slash command's `model:` frontmatter switches the LIVE session's model —
 * slash commands run inside the user's session, not in a separate process.
 * When `/ctoc:menu` pinned `model: claude-haiku-4-5`, invoking it switched the
 * running session to Haiku; if the conversation exceeded Haiku's context
 * window, autocompact triggered and the session crashed.
 *
 * The v6.9.29 fix removed every `model:` line from src/commands/*.md. This
 * test fails if any slash command reintroduces one.
 *
 * See: CLAUDE.md "Model rules" and docs/AGENT_ARCHITECTURE.md
 *      "Front-process vs subagent model rules (corrected v6.9.29)".
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const COMMANDS_DIR = path.join(__dirname, '..', 'src', 'commands');

function frontmatterOf(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : '';
}

describe('Slash commands — no model pin (v6.9.29 crash-prevention invariant)', () => {
  const files = fs.readdirSync(COMMANDS_DIR).filter(f => f.endsWith('.md'));

  it('src/commands/ contains at least one slash command spec', () => {
    assert.ok(files.length > 0, 'expected at least one .md slash command spec');
  });

  for (const file of files) {
    it(`${file} does not declare a model: in frontmatter`, () => {
      const content = fs.readFileSync(path.join(COMMANDS_DIR, file), 'utf8');
      const fm = frontmatterOf(content);
      assert.doesNotMatch(
        fm,
        /^model:/m,
        `${file} pins a model in frontmatter. A slash command's model: switches the LIVE session and can force autocompact + crash. Remove the model: line. See docs/AGENT_ARCHITECTURE.md.`
      );
    });
  }
});
