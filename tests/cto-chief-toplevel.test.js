/**
 * Structural invariant: CTO Chief is the SOLE top-level coordinator agent.
 *
 * Verifies:
 *   1. agents/coordinator/cto-chief.md exists
 *   2. Its frontmatter declares role: top-level-coordinator + top_level: true
 *   3. The body contains the "Top-Level Authority" section
 *   4. .ctoc/operations-registry.yaml marks cto-chief with role: top-level-coordinator
 *   5. CLAUDE.md has the "Agent Hierarchy" section that names CTO Chief
 *   6. No OTHER agent file declares role: top-level-coordinator (uniqueness)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const CTO_CHIEF_PATH = path.join(projectRoot, 'agents', 'coordinator', 'cto-chief.md');
const REGISTRY_PATH = path.join(projectRoot, '.ctoc', 'operations-registry.yaml');
const CLAUDE_MD_PATH = path.join(projectRoot, 'CLAUDE.md');

function readFM(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const m = content.match(/^---\n([\s\S]*?)\n---/m) ||
            content.match(/\n---\n([\s\S]*?)\n---/);
  return { fm: m ? m[1] : '', body: content };
}

describe('CTO Chief — sole top-level coordinator', () => {
  it('cto-chief.md exists at agents/coordinator/cto-chief.md', () => {
    assert.ok(fs.existsSync(CTO_CHIEF_PATH), 'cto-chief.md must exist');
  });

  it('cto-chief frontmatter declares role: top-level-coordinator', () => {
    const { fm } = readFM(CTO_CHIEF_PATH);
    assert.match(fm, /role:\s*top-level-coordinator/, 'must declare role: top-level-coordinator');
  });

  it('cto-chief frontmatter declares top_level: true', () => {
    const { fm } = readFM(CTO_CHIEF_PATH);
    assert.match(fm, /top_level:\s*true/, 'must declare top_level: true');
  });

  it('cto-chief body contains the Top-Level Authority section', () => {
    const { body } = readFM(CTO_CHIEF_PATH);
    assert.match(body, /##\s+Top-Level Authority/, 'body must include "## Top-Level Authority" section');
    assert.match(body, /Sole Coordinator/i, 'body must claim sole-coordinator role');
  });

  it('operations registry marks cto-chief with role: top-level-coordinator', () => {
    const content = fs.readFileSync(REGISTRY_PATH, 'utf8');
    const ctoBlock = content.match(/^\s{2}cto-chief:[\s\S]+?(?=^\s{2}\w|^# =)/m);
    assert.ok(ctoBlock, 'registry must contain a cto-chief: block');
    assert.match(ctoBlock[0], /role:\s*top-level-coordinator/, 'registry must mark role: top-level-coordinator');
    assert.match(ctoBlock[0], /top_level:\s*true/, 'registry must mark top_level: true');
  });

  it('CLAUDE.md has an Agent Architecture / Hierarchy section naming CTO Chief', () => {
    const content = fs.readFileSync(CLAUDE_MD_PATH, 'utf8');
    // v7 used "Agent Hierarchy", v8 uses "Agent Architecture". Accept either.
    assert.match(content, /##\s+Agent (Hierarchy|Architecture)/, 'CLAUDE.md must declare the agent hierarchy/architecture');
    assert.match(content, /CTO Chief.*(sole top-level|only agent with top-level)/i, 'must explicitly name CTO Chief as the unique top-level coordinator');
  });

  it('no OTHER agent file declares role: top-level-coordinator (uniqueness)', () => {
    const offenders = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith('.md')) {
          if (full === CTO_CHIEF_PATH) continue;
          let content;
          try { content = fs.readFileSync(full, 'utf8'); } catch { continue; }
          if (/role:\s*top-level-coordinator/.test(content)) {
            offenders.push(path.relative(projectRoot, full));
          }
        }
      }
    }
    walk(path.join(projectRoot, 'agents'));
    assert.deepEqual(offenders, [], `only cto-chief may declare top-level-coordinator; found offenders: ${offenders.join(', ')}`);
  });
});
