/**
 * CU4a s10 — content-contract tests for the AI/ML Hugging Face guides
 * (huggingface-hub.md, datasets.md, diffusers.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js) and asserts substantive structure —
 * no mocks, no fixtures, no fakes. It guards the CU4a acceptance criteria for
 * these three files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (a footgun/memory
 *     section, Error Handling, Security/Dependency, Testing, Performance,
 *     Version-specific, References);
 *   - each guide carries >= 4 code fences (>= 2 fenced single-framework demos);
 *   - each guide names its own concrete per-framework identifiers + a real MITRE
 *     CWE id grounded in that framework's actual attack surface;
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing).
 *
 * Every version/security fact these guides assert is web-verified against official
 * sources at edit time (pypi.org JSON API for huggingface_hub/datasets/diffusers,
 * huggingface.co/docs, github release notes, cwe.mitre.org/94, /502, /798). This
 * test does NOT re-verify the facts against the network; it guards the substance
 * against a future edit dropping it.
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
  'huggingface-hub': 'skills/frameworks/ai-ml/huggingface-hub.md',
  datasets: 'skills/frameworks/ai-ml/datasets.md',
  diffusers: 'skills/frameworks/ai-ml/diffusers.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Footgun/Memory', re: /^##.*(footgun|memory|vram|download|loading|concurrency)/im },
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

describe('CU4a s10 — AI/ML HF guides are substantive (real files, zero doubles)', () => {
  for (const [fw, rel] of Object.entries(GUIDES)) {
    describe(`${fw} (${rel})`, () => {
      it('exceeds the 5-section template floor (> 5 "## " sections)', () => {
        const md = read(rel);
        const n = sectionCount(md);
        assert.ok(n > 5, `expected > 5 "## " sections, found ${n}`);
      });

      it('is well past the ~55-line stub floor', () => {
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

      it('carries at least two fenced code examples (footgun demos)', () => {
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

  it('huggingface-hub names snapshot_download, trust_remote_code, HF token leak (CWE-798), CWE-94, and a version token', () => {
    const md = read(GUIDES['huggingface-hub']);
    assert.match(md, /snapshot_download/, 'expected snapshot_download download footgun content');
    assert.match(md, /hf_hub_download/, 'expected hf_hub_download content');
    assert.match(md, /trust_remote_code/, 'expected trust_remote_code trust-boundary content');
    assert.match(md, /revision\s*=|commit.?sha/i, 'expected revision/commit-SHA pinning content');
    assert.match(md, /safetensors/i, 'expected safetensors-vs-pickle content');
    assert.match(md, /CWE-94/, 'expected the CWE-94 code-injection token');
    assert.match(md, /CWE-798/, 'expected the CWE-798 hard-coded-credentials (token leak) token');
    assert.match(md, /CWE-502/, 'expected the CWE-502 pickle-deserialization token');
    assert.match(md, /huggingface_hub 1\.|huggingface_hub 2\./i, 'expected a huggingface_hub version token');
  });

  it('datasets names streaming, load_dataset script execution (CWE-94), map/num_proc, and a version token', () => {
    const md = read(GUIDES.datasets);
    assert.match(md, /streaming/i, 'expected streaming IterableDataset footgun content');
    assert.match(md, /IterableDataset/, 'expected IterableDataset-vs-map-style content');
    assert.match(md, /load_dataset/, 'expected load_dataset script-execution content');
    assert.match(md, /trust_remote_code/, 'expected trust_remote_code dataset-script content');
    assert.match(md, /num_proc|batched/, 'expected map batched/num_proc content');
    assert.match(md, /revision\s*=|commit.?sha/i, 'expected revision-pinning content');
    assert.match(md, /CWE-94/, 'expected the CWE-94 loading-script code-injection token');
    assert.match(md, /datasets 5\.|datasets 4\./i, 'expected a datasets version token');
  });

  it('diffusers names enable_model_cpu_offload, DPMSolver, from_pretrained pickle (CWE-502), safety checker, and a version token', () => {
    const md = read(GUIDES.diffusers);
    assert.match(md, /enable_model_cpu_offload/, 'expected enable_model_cpu_offload VRAM content');
    assert.match(md, /enable_(vae_tiling|sequential_cpu_offload)|attention_slicing/, 'expected VRAM-slicing content');
    assert.match(md, /DPMSolver/, 'expected DPMSolver scheduler content');
    assert.match(md, /variant\s*=\s*["']fp16["']|torch_dtype/, 'expected fp16 variant/torch_dtype content');
    assert.match(md, /safety.?check/i, 'expected NSFW safety-checker content');
    assert.match(md, /trust_remote_code/, 'expected trust_remote_code content');
    assert.match(md, /CWE-502/, 'expected the CWE-502 pickle-deserialization token');
    assert.match(md, /CWE-94/, 'expected the CWE-94 code-injection token');
    assert.match(md, /diffusers 0\.3|diffusers 0\.4|diffusers 1\./i, 'expected a diffusers version token');
  });
});
