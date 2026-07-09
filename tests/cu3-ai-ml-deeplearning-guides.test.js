/**
 * CU3 s1 — content-contract tests for the ai-ml deep-learning framework guides
 * (pytorch.md, tensorflow.md, transformers.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu2-dynamic-web-guides.test.js and
 * tests/skill-regulatory-citations.test.js) and asserts substantive structure —
 * no mocks, no fixtures, no fakes. It guards the CU3 acceptance criteria for
 * these three files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - the required correction-surface sections are present (Async/Concurrency,
 *     Error Handling, Security/Dependency, Testing, Performance, Version, References);
 *   - each guide names its own concrete identifiers (version tokens, CWE ids, APIs);
 *   - the CWE-502 deserialization class is named in all three (pickle .pt/.bin/HDF5);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing).
 *
 * Every version/security fact these guides assert is web-verified against official
 * sources at edit time (pypi.org JSON API for torch/tensorflow/transformers/
 * safetensors/keras, github.com/pytorch releases, cwe.mitre.org). This test does
 * NOT re-verify the facts; it guards the substance against a future edit dropping it.
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
  pytorch: 'skills/frameworks/ai-ml/pytorch.md',
  tensorflow: 'skills/frameworks/ai-ml/tensorflow.md',
  transformers: 'skills/frameworks/ai-ml/transformers.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Async/Concurrency', re: /^##.*(async|concurren|device|graph)/im },
  { name: 'Error Handling', re: /^##.*error.?handling/im },
  { name: 'Security/Dependency', re: /^##.*(security|dependenc|supply.?chain|serial)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU3 s1 — ai-ml deep-learning guides are substantive (real files, zero doubles)', () => {
  for (const [fw, rel] of Object.entries(GUIDES)) {
    describe(`${fw} (${rel})`, () => {
      it('exceeds the 5-section template floor (> 5 "## " sections)', () => {
        const md = read(rel);
        const n = sectionCount(md);
        assert.ok(n > 5, `expected > 5 "## " sections, found ${n}`);
      });

      it('is well past the ~50-line stub floor', () => {
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

      it('carries at least one fenced code example (footgun demo)', () => {
        const md = read(rel);
        const fences = (md.match(/^```/gm) || []).length;
        assert.ok(fences >= 4, `expected >= 4 code fences (>= 2 blocks), found ${fences}`);
      });

      it('names the CWE-502 deserialization class (pickle .pt/.bin/HDF5)', () => {
        const md = read(rel);
        assert.match(md, /CWE-502/, 'expected the CWE-502 token');
        assert.match(md, /deserial/i, 'expected the named deserialization class');
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

  it('pytorch names torch.load/weights_only, a v2.x token, and DataLoader footguns', () => {
    const md = read(GUIDES.pytorch);
    assert.match(md, /torch\.load|weights_only/, 'expected torch.load / weights_only serialization content');
    assert.match(md, /v?2\.(6|1[0-9])/, 'expected a PyTorch v2.x version token');
    assert.match(md, /DataLoader/, 'expected DataLoader concurrency footgun content');
    assert.match(md, /autocast|GradScaler|mixed.?precision/i, 'expected mixed-precision content');
    assert.match(md, /torch\.compile/, 'expected torch.compile gotcha content');
  });

  it('tensorflow names tf.function retracing, a 2.x token, and SavedModel/HDF5', () => {
    const md = read(GUIDES.tensorflow);
    assert.match(md, /tf\.function/, 'expected tf.function graph-mode content');
    assert.match(md, /retrac/i, 'expected @tf.function retracing footgun');
    assert.match(md, /2\.(1[6-9]|2[0-9])/, 'expected a TensorFlow 2.x version token');
    assert.match(md, /SavedModel/, 'expected SavedModel serialization content');
    assert.match(md, /HDF5|\.h5/, 'expected HDF5/.h5 serialization content');
  });

  it('transformers names safetensors vs .bin, AutoModel, and tokenizer coupling', () => {
    const md = read(GUIDES.transformers);
    assert.match(md, /safetensors/, 'expected safetensors vs pickle .bin content');
    assert.match(md, /AutoModel/, 'expected AutoModel loading content');
    assert.match(md, /tokenizer/i, 'expected tokenizer<->model coupling content');
    assert.match(md, /trust_remote_code/, 'expected trust_remote_code risk content');
    assert.match(md, /revision=|revision\b/, 'expected revision= pinning content');
    assert.match(md, /4\.5[0-9]|5\.[0-9]/, 'expected a transformers version token');
  });
});
