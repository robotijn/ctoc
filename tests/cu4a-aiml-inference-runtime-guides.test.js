/**
 * CU4a s2 — content-contract tests for the AI/ML local inference-runtime guides
 * (ggml.md, llama-cpp.md, onnx.md, ollama.md under skills/frameworks/ai-ml/).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js and tests/cu4c-data-query-guides.test.js).
 * No mocks, no fixtures, no fakes. It guards the CU4a acceptance criteria for
 * these four local-inference-runtime files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (a footgun/
 *     concurrency/memory section, Error Handling, Security/Dependency, Testing,
 *     Performance, Version-specific, References);
 *   - each guide carries >= 4 code fences (>= 2 fenced single-framework examples);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original "# <Framework> CTO" H1 header is intact (skills.json indexing);
 *   - each guide names its own concrete identifiers and the real MITRE CWE class:
 *       ggml      -> GGUF + CWE-787 (out-of-bounds write) + quantization;
 *       llama-cpp -> n_ctx + n_gpu_layers + GGUF (+ CWE-787);
 *       onnx      -> ExecutionProvider + opset + CWE-502 (untrusted deserialization);
 *       ollama    -> num_ctx + OLLAMA_NUM_PARALLEL + 11434 (+ CWE-306).
 *
 * Every version / security fact these guides assert is web-verified against
 * official sources at edit time (github.com/ggml-org/llama.cpp, onnxruntime.ai,
 * ollama.com, pypi.org, cwe.mitre.org, services.nvd.nist.gov). This test does
 * NOT re-verify the facts; it guards the substance against a future edit
 * dropping it.
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
  ggml: 'skills/frameworks/ai-ml/ggml.md',
  'llama-cpp': 'skills/frameworks/ai-ml/llama-cpp.md',
  onnx: 'skills/frameworks/ai-ml/onnx.md',
  ollama: 'skills/frameworks/ai-ml/ollama.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
// The first entry accepts the per-framework footgun/concurrency/memory equivalent.
const REQUIRED_SECTIONS = [
  { name: 'Footgun/Concurrency/Memory', re: /^##.*(footgun|concurren|memory|quantiz|context|precision|runtime|sampling|modelfile)/im },
  { name: 'Error Handling', re: /^##.*(error.?handling|error.?idiom|troubleshoot)/im },
  { name: 'Security/Dependency', re: /^##.*(security|dependenc|supply.?chain|trust)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s2 — AI/ML inference-runtime guides are substantive (real files, zero doubles)', () => {
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

      it('carries at least two fenced code examples (>= 4 fences)', () => {
        const md = read(rel);
        const fences = (md.match(/^```/gm) || []).length;
        assert.ok(fences >= 4, `expected >= 4 code fences (>= 2 blocks), found ${fences}`);
      });

      it('carries at least one dated source (>= 2025) with an http URL', () => {
        const md = read(rel);
        assert.match(md, /20(2[5-9]|[3-9]\d)/, 'expected a date token >= 2025');
        assert.match(md, /https?:\/\//, 'expected at least one http(s) source URL');
      });

      it('cites a real MITRE CWE authority URL', () => {
        const md = read(rel);
        assert.match(md, /cwe\.mitre\.org/, 'expected the cwe.mitre.org authority URL');
      });

      it('keeps its original H1 header intact (skills.json indexing)', () => {
        const md = read(rel);
        assert.match(md, /^# .+CTO/m, 'expected the original "# <Framework> CTO" H1 header');
      });
    });
  }

  it('ggml names GGUF, CWE-787, quantization trade-offs, and mmap', () => {
    const md = read(GUIDES.ggml);
    assert.match(md, /GGUF/, 'expected GGUF format named');
    assert.match(md, /CWE-787/, 'expected CWE-787 (out-of-bounds write) named');
    assert.match(md, /quantiz/i, 'expected quantization discussion');
    assert.match(md, /Q4_K_M|Q5_K_M|Q8_0/, 'expected concrete quant type identifiers');
    assert.match(md, /mmap/i, 'expected mmap vs load memory discussion');
    assert.match(md, /CVE-2024-2(1802|1825|1836|3496|3605)/, 'expected a real GGUF-parse CVE id');
  });

  it('llama-cpp names n_ctx, n_gpu_layers, GGUF, CWE-787, and the server endpoint', () => {
    const md = read(GUIDES['llama-cpp']);
    assert.match(md, /n_ctx/, 'expected n_ctx context footgun');
    assert.match(md, /n_gpu_layers/, 'expected n_gpu_layers offload footgun');
    assert.match(md, /GGUF/, 'expected GGUF parsing trust boundary');
    assert.match(md, /CWE-787/, 'expected CWE-787 (GGUF out-of-bounds write) named');
    assert.match(md, /n_batch/, 'expected n_batch concurrency knob');
    assert.match(md, /llama-server|--host|127\.0\.0\.1/, 'expected server endpoint exposure guidance');
  });

  it('onnx names ExecutionProvider, opset, CWE-502, external-data, and IOBinding', () => {
    const md = read(GUIDES.onnx);
    assert.match(md, /ExecutionProvider/, 'expected ExecutionProvider fallback footgun');
    assert.match(md, /opset/, 'expected opset version mismatch');
    assert.match(md, /CWE-502/, 'expected CWE-502 (untrusted deserialization) named');
    assert.match(md, /external.?data/i, 'expected external-data path risk');
    assert.match(md, /IOBinding/, 'expected IOBinding zero-copy performance');
    assert.match(md, /CVE-2026-(34445|28500|14647)/, 'expected a real ONNX CVE id');
  });

  it('ollama names num_ctx, OLLAMA_NUM_PARALLEL, 11434, CWE-306, and keep_alive', () => {
    const md = read(GUIDES.ollama);
    assert.match(md, /num_ctx/, 'expected num_ctx context-truncation footgun');
    assert.match(md, /OLLAMA_NUM_PARALLEL/, 'expected OLLAMA_NUM_PARALLEL concurrency knob');
    assert.match(md, /11434/, 'expected the :11434 default bind port');
    assert.match(md, /CWE-306/, 'expected CWE-306 (missing authentication) named');
    assert.match(md, /keep_alive/, 'expected keep_alive unload-thrash footgun');
    assert.match(md, /CVE-2024-28224|CVE-2025-031[257]/, 'expected a real Ollama exposure/GGUF CVE id');
  });
});
