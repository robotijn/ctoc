/**
 * Agent Resolver (B2 / CTOC v7) — supplemental tooling
 *
 * After converting a leaf-node agent to a skill (per ADR-1 in the B2 plan),
 * the original `agents/X/Y.md` is replaced with a **redirect stub** that
 * points to `skills/X/Y/SKILL.md`. Claude follows the stub at invocation
 * time (filesystem-based, no JS required) — that's the backward-compat
 * mechanism.
 *
 * This module is **supplemental** — it powers:
 *   - Library area listings (knows which agents have been promoted)
 *   - Cross-link discovery for documentation generators
 *   - Tests that verify redirect stubs point to existing skills
 *
 * It is **NOT** invoked by Claude's normal agent loading path.
 */

const fs = require('fs');
const path = require('path');

const REDIRECT_MARKER_RE = /^type:\s*wrapper$/m;
const TARGET_SKILL_RE = /^target_skill:\s*(.+?)\s*$/m;

/**
 * Read the frontmatter of an agent file and return whether it's a redirect stub.
 *
 * @param {string} agentPath - Absolute path to the agent file
 * @returns {boolean}
 */
function isRedirectStub(agentPath) {
  if (!fs.existsSync(agentPath)) return false;
  let content;
  try { content = fs.readFileSync(agentPath, 'utf8'); } catch { return false; }
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return false;
  return REDIRECT_MARKER_RE.test(fm[1]) && TARGET_SKILL_RE.test(fm[1]);
}

/**
 * Resolve an agent reference. Returns the actual file Claude would use.
 *
 * @param {string} relAgentPath - Path relative to root (e.g. 'agents/quality/code-reviewer.md')
 * @param {string} root - Project root
 * @returns {{ kind: 'original' | 'redirected' | 'broken-redirect' | 'not-found',
 *             path: string,
 *             targetSkill?: string }}
 */
function resolveAgent(relAgentPath, root) {
  const absAgent = path.join(root, relAgentPath);
  if (!fs.existsSync(absAgent)) {
    return { kind: 'not-found', path: absAgent };
  }
  if (!isRedirectStub(absAgent)) {
    return { kind: 'original', path: absAgent };
  }
  const content = fs.readFileSync(absAgent, 'utf8');
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  const targetMatch = fm[1].match(TARGET_SKILL_RE);
  const targetSkill = targetMatch[1].trim();
  const skillPath = path.join(root, 'skills', targetSkill, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    return { kind: 'broken-redirect', path: skillPath, targetSkill };
  }
  return { kind: 'redirected', path: skillPath, targetSkill };
}

/**
 * Walk the agents/ tree and return all redirect stubs.
 *
 * @param {string} root - Project root
 * @returns {Array<{ agentPath: string, targetSkill: string }>}
 */
function listConvertedAgents(root) {
  const out = [];
  const agentsDir = path.join(root, 'agents');
  if (!fs.existsSync(agentsDir)) return out;

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.md')) {
        if (isRedirectStub(full)) {
          const content = fs.readFileSync(full, 'utf8');
          const m = content.match(TARGET_SKILL_RE);
          out.push({
            agentPath: path.relative(root, full),
            targetSkill: m ? m[1].trim() : '',
          });
        }
      }
    }
  }
  walk(agentsDir);
  return out;
}

module.exports = {
  resolveAgent,
  isRedirectStub,
  listConvertedAgents,
};
