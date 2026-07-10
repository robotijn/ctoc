/**
 * CU4a s5 — content-contract tests for the AI/ML agent & RAG orchestration
 * framework guides (llamaindex.md, autogen.md, crewai.md, semantic-kernel.md,
 * dspy.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js and tests/cu2-dynamic-web-guides.test.js)
 * and asserts substantive structure — no mocks, no fixtures, no fakes. It guards
 * the CU4a acceptance criteria for these five files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (a footgun/loop/memory
 *     section, Error Handling, Security/Dependency, Testing, Performance,
 *     Version-specific, References);
 *   - each guide carries >= 4 code fences (>= 2 fenced single-framework examples);
 *   - each guide carries at least one dated source (>= 2025) with an http URL;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing);
 *   - each guide names its own concrete orchestration/security identifiers
 *     (per-framework token assertions below).
 *
 * Every version/security fact these guides assert is web-verified against official
 * sources at edit time (pypi.org JSON API for llama-index/pyautogen/autogen-agentchat/
 * crewai/semantic-kernel/dspy versions; cwe.mitre.org for CWE-77/78/94/89/653;
 * api.osv.dev/GitHub Security Advisories for CVE-2025-1793 (LlamaIndex SQLi) and
 * CVE-2025-12695 (DSPy file-read); genai.owasp.org for the LLM prompt-injection
 * class). This test does NOT re-verify the facts against the network; it guards the
 * substance against a future edit dropping it.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(projectRoot, rel), 'utf8');
}

const GUIDES = {
  llamaindex: 'skills/frameworks/ai-ml/llamaindex.md',
  autogen: 'skills/frameworks/ai-ml/autogen.md',
  crewai: 'skills/frameworks/ai-ml/crewai.md',
  'semantic-kernel': 'skills/frameworks/ai-ml/semantic-kernel.md',
  dspy: 'skills/frameworks/ai-ml/dspy.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Footgun/Loop/Memory', re: /^##.*(footgun|loop|indexing|planner|compil|crew|agent)/im },
  { name: 'Error Handling', re: /^##.*error.?handling/im },
  { name: 'Security/Dependency', re: /^##.*(security|dependenc|injection|sandbox|trust)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance/Cost', re: /^##.*(performance|cost|latency)/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s5 — AI/ML orchestration & agent guides are substantive (real files, zero doubles)', () => {
  for (const [fw, rel] of Object.entries(GUIDES)) {
    describe(`${fw} (${rel})`, () => {
      it('exceeds the 5-section template floor (> 5 "## " sections)', () => {
        const md = read(rel);
        const n = sectionCount(md);
        assert.ok(n > 5, `expected > 5 "## " sections, found ${n}`);
      });

      it('is well past the ~55-line stub floor (> 120 lines)', () => {
        const md = read(rel);
        const lines = md.split('\n').length;
        assert.ok(lines > 120, `expected > 120 lines (de-stubbed), found ${lines}`);
      });

      it('has all required correction-surface sections', () => {
        const md = read(rel);
        for (const { name, re } of REQUIRED_SECTIONS) {
          assert.match(md, re, `missing required section: ${name}`);
        }
      });

      it('carries at least four code fences (>= 2 single-framework examples)', () => {
        const md = read(rel);
        const fences = (md.match(/^```/gm) || []).length;
        assert.ok(fences >= 4, `expected >= 4 code fences (>= 2 blocks), found ${fences}`);
      });

      it('carries at least one dated source (>= 2025) with an http URL', () => {
        const md = read(rel);
        assert.match(md, /20(2[5-9]|[3-9]\d)/, 'expected a date token >= 2025');
        assert.match(md, /https?:\/\//, 'expected at least one http(s) source URL');
      });

      it('keeps its original H1 header intact (skills.json indexing)', () => {
        const md = read(rel);
        assert.match(md, /^# .+CTO/m, 'expected the original "# <Framework> CTO" H1 header');
      });
    });
  }

  it('llamaindex names chunk_size, similarity_top_k, prompt injection, and a real CVE/CWE', () => {
    const md = read(GUIDES.llamaindex);
    assert.match(md, /chunk_size/, 'expected chunk_size indexing footgun content');
    assert.match(md, /similarity_top_k/, 'expected similarity_top_k retrieval content');
    assert.match(md, /prompt injection/i, 'expected indirect prompt-injection content');
    assert.match(md, /CVE-2025-1793/, 'expected the real LlamaIndex SQLi CVE token');
    assert.match(md, /CWE-94/, 'expected the CWE-94 code-injection token');
    assert.match(md, /0\.14/, 'expected a llama-index 0.14.x version token');
  });

  it('autogen names code_executor, max_turns, Docker sandbox, and CWE-94', () => {
    const md = read(GUIDES.autogen);
    assert.match(md, /code_executor|DockerCommandLineCodeExecutor/, 'expected code-executor content');
    assert.match(md, /max_turns|max_consecutive_auto_reply|max_round/, 'expected loop-limit content');
    assert.match(md, /CWE-94/, 'expected the CWE-94 code-injection token');
    assert.match(md, /Docker/, 'expected Docker-sandbox content');
    assert.match(md, /autogen-agentchat|0\.7|v0\.4/i, 'expected an AutoGen v0.4+ version token');
  });

  it('crewai names max_iter, hierarchical, tool-injection CWE, and a version token', () => {
    const md = read(GUIDES.crewai);
    assert.match(md, /max_iter/, 'expected max_iter runaway-loop content');
    assert.match(md, /hierarchical/i, 'expected hierarchical-process content');
    assert.match(md, /CWE-94|CWE-78/, 'expected a tool code/command-injection CWE token');
    assert.match(md, /crewai 1|1\.1[0-9]/i, 'expected a CrewAI 1.x version token');
  });

  it('semantic-kernel names KernelFunction, plugin, CWE-94, and a version token', () => {
    const md = read(GUIDES['semantic-kernel']);
    assert.match(md, /KernelFunction|kernel_function/, 'expected KernelFunction content');
    assert.match(md, /plugin/i, 'expected plugin trust-boundary content');
    assert.match(md, /CWE-94/, 'expected the CWE-94 code-injection token');
    assert.match(md, /1\.4[0-9]|semantic.?kernel 1/i, 'expected a Semantic Kernel 1.x version token');
  });

  it('dspy names Signature, compile, optimizer, and the real file-read CVE', () => {
    const md = read(GUIDES.dspy);
    assert.match(md, /Signature/, 'expected DSPy Signature content');
    assert.match(md, /compile/, 'expected compile/optimization content');
    assert.match(md, /optimizer|BootstrapFewShot|MIPRO/i, 'expected optimizer content');
    assert.match(md, /CVE-2025-12695/, 'expected the real DSPy file-read CVE token');
    assert.match(md, /3\.[0-9]/, 'expected a DSPy 3.x version token');
  });
});
