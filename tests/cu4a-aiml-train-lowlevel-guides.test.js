/**
 * CU4a s1 — content-contract tests for the AI/ML low-level training & serving
 * runtime guides (vllm.md, tensorrt.md, triton.md, deepspeed.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js and
 * tests/cu3-ai-ml-deeplearning-guides.test.js) and asserts substantive
 * structure — no mocks, no fixtures, no fakes. It guards the CU4a acceptance
 * criteria for these four files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (a memory/footgun/
 *     concurrency section, Error Handling, Security/Dependency, Testing,
 *     Performance, Version-specific, References);
 *   - each guide carries >= 4 code fences (>= 2 fenced single-framework demos);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing);
 *   - each guide names its own web-verified concrete identifiers (the runtime
 *     footgun knobs + the REAL MITRE CWE ids grounding its attack surface):
 *       vllm     : gpu_memory_utilization, trust_remote_code, CWE-94
 *       tensorrt : CWE-502, FP16, optimization profile
 *       triton   : config.pbtxt, max_batch_size, CWE-94
 *       deepspeed: ZeRO, CWE-502, gradient accumulation
 *
 * Every version/security fact these guides assert is web-verified against
 * official sources at edit time (pypi.org JSON API + github.com releases for
 * vllm/tensorrt/tritonclient/deepspeed and triton-inference-server/server,
 * cwe.mitre.org/94, cwe.mitre.org/502). This test does NOT re-verify the facts
 * over the network; it guards the substance against a future edit dropping it.
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
  vllm: 'skills/frameworks/ai-ml/vllm.md',
  tensorrt: 'skills/frameworks/ai-ml/tensorrt.md',
  triton: 'skills/frameworks/ai-ml/triton.md',
  deepspeed: 'skills/frameworks/ai-ml/deepspeed.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Memory/Footgun/Concurrency', re: /^##.*(memory|footgun|concurren|batch|kv.?cache|zero|offload|workspace|parallel)/im },
  { name: 'Error Handling', re: /^##.*error.?handling/im },
  { name: 'Security/Dependency', re: /^##.*(security|dependenc)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s1 — AI/ML low-level runtime guides are substantive (real files, zero doubles)', () => {
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

      it('carries at least four code fences (>= 2 single-framework demos)', () => {
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

  it('vllm names gpu_memory_utilization, trust_remote_code, and CWE-94', () => {
    const md = read(GUIDES.vllm);
    assert.match(md, /gpu_memory_utilization/, 'expected gpu_memory_utilization KV-cache/OOM content');
    assert.match(md, /trust_remote_code/, 'expected trust_remote_code code-exec content');
    assert.match(md, /CWE-94/, 'expected the CWE-94 code-injection token');
    assert.match(md, /PagedAttention|paged.?attention/i, 'expected PagedAttention KV-cache content');
    assert.match(md, /max_model_len/, 'expected max_model_len vs KV-cache content');
    assert.match(md, /max_num_seqs|continuous.?batch/i, 'expected continuous-batching content');
  });

  it('tensorrt names CWE-502, FP16, optimization profile, and engine-plan portability', () => {
    const md = read(GUIDES.tensorrt);
    assert.match(md, /CWE-502/, 'expected the CWE-502 deserialization token');
    assert.match(md, /FP16/, 'expected FP16 precision content');
    assert.match(md, /optimization.?profile/i, 'expected dynamic-shape optimization-profile content');
    assert.match(md, /INT8/, 'expected INT8 calibration content');
    assert.match(md, /\.plan|\.engine/, 'expected engine/plan-file portability content');
    assert.match(md, /deserialize|deserialization/i, 'expected plan deserialization trust-boundary content');
  });

  it('triton names config.pbtxt, max_batch_size, CWE-94, and BLS/Python backend exec', () => {
    const md = read(GUIDES.triton);
    assert.match(md, /config\.pbtxt/, 'expected config.pbtxt model-repo content');
    assert.match(md, /max_batch_size/, 'expected max_batch_size batching content');
    assert.match(md, /CWE-94/, 'expected the CWE-94 code-injection token');
    assert.match(md, /BLS|business.?logic.?scripting|python.?backend/i, 'expected BLS/Python-backend exec content');
    assert.match(md, /instance.?group/i, 'expected instance-group GPU-allocation content');
    assert.match(md, /dynamic.?batch/i, 'expected dynamic-batching content');
  });

  it('deepspeed names ZeRO, CWE-502, gradient accumulation, and offload thrash', () => {
    const md = read(GUIDES.deepspeed);
    assert.match(md, /ZeRO/, 'expected ZeRO partitioning content');
    assert.match(md, /CWE-502/, 'expected the CWE-502 checkpoint-pickle token');
    assert.match(md, /gradient.?accumulation/i, 'expected gradient-accumulation coupling content');
    assert.match(md, /stage.?3|stage 3|zero.?3/i, 'expected ZeRO stage-3 partitioning content');
    assert.match(md, /offload/i, 'expected CPU/NVMe offload thrash content');
    assert.match(md, /safetensors/, 'expected safetensors interchange content');
  });
});
