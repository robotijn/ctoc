/**
 * CU4a s3 — content-contract tests for the AI/ML numeric & classic-ML framework
 * guides (jax.md, keras.md, fastai.md, scikit-learn.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js and
 * tests/cu3-ai-ml-deeplearning-guides.test.js) and asserts substantive
 * structure — no mocks, no fixtures, no fakes. It guards the CU4a acceptance
 * criteria for these four files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (footgun/tracing,
 *     Error Handling, Security/Dependency, Testing, Performance, Version,
 *     References);
 *   - each guide carries >= 4 code fences (>= 2 single-framework examples);
 *   - each guide names its own concrete framework identifiers + the CWE-502
 *     untrusted-deserialization class;
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing).
 *
 * Every version/security fact these guides assert is web-verified against official
 * sources at edit time (pypi.org JSON API for jax/keras/fastai/scikit-learn,
 * docs.jax.dev, keras.io, scikit-learn.org, cwe.mitre.org/502, and the NVD CVE
 * records CVE-2025-49655 / CVE-2026-12481). This test does NOT re-verify the
 * facts; it guards the substance against a future edit dropping it.
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
  jax: 'skills/frameworks/ai-ml/jax.md',
  keras: 'skills/frameworks/ai-ml/keras.md',
  fastai: 'skills/frameworks/ai-ml/fastai.md',
  'scikit-learn': 'skills/frameworks/ai-ml/scikit-learn.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Footgun/Tracing/Leakage', re: /^##.*(footgun|tracing|purity|leakage|backend|learner)/im },
  { name: 'Error Handling', re: /^##.*error.?handling/im },
  { name: 'Security/Dependency', re: /^##.*(security|dependenc|deserial)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s3 — AI/ML numeric & classic-ML guides are substantive (real files, zero doubles)', () => {
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

      it('carries >= 4 code fences (>= 2 single-framework examples)', () => {
        const md = read(rel);
        const fences = (md.match(/^```/gm) || []).length;
        assert.ok(fences >= 4, `expected >= 4 code fences (>= 2 blocks), found ${fences}`);
      });

      it('carries at least one dated source (>= 2025) with an http URL', () => {
        const md = read(rel);
        assert.match(md, /20(2[5-9]|[3-9]\d)/, 'expected a date token >= 2025');
        assert.match(md, /https?:\/\//, 'expected at least one http(s) source URL');
      });

      it('names the CWE-502 untrusted-deserialization class', () => {
        const md = read(rel);
        assert.match(md, /CWE-502/, 'expected the CWE-502 deserialization token');
      });

      it('keeps its original H1 header intact (skills.json indexing)', () => {
        const md = read(rel);
        assert.match(md, /^# .+CTO/m, 'expected the original "# <Framework> CTO" H1 header');
      });
    });
  }

  it('jax names jit purity, PRNGKey split, tracer leaks, x64, and a version token', () => {
    const md = read(GUIDES.jax);
    assert.match(md, /\bjit\b/, 'expected jit content');
    assert.match(md, /jax\.random\.split/, 'expected jax.random.split PRNG content');
    assert.match(md, /tracer|leak/i, 'expected tracer-leak footgun content');
    assert.match(md, /lax\.(cond|scan|fori_loop)/, 'expected lax control-flow content');
    assert.match(md, /enable_x64|float32/, 'expected float32/x64 precision content');
    assert.match(md, /donate_argnums/, 'expected donation/recompilation content');
    assert.match(md, /orbax|checkpoint/i, 'expected checkpoint deserialization content');
    assert.match(md, /jax 0\.10|jaxlib 0\.10/i, 'expected a JAX 0.10.x version token');
  });

  it('keras names KERAS_BACKEND, .keras safe-mode, h5/Lambda, a real CVE, and a version token', () => {
    const md = read(GUIDES.keras);
    assert.match(md, /KERAS_BACKEND/, 'expected KERAS_BACKEND backend content');
    assert.match(md, /\.keras/, 'expected .keras safe-format content');
    assert.match(md, /\.h5/, 'expected legacy .h5 content');
    assert.match(md, /Lambda/, 'expected Lambda-layer arbitrary-code content');
    assert.match(md, /safe_mode/, 'expected safe_mode content');
    assert.match(md, /CVE-2025-49655|CVE-2026-12481/, 'expected a real Keras deserialization CVE id');
    assert.match(md, /keras 3\.15|Keras 3/i, 'expected a Keras 3.x version token');
  });

  it('fastai names load_learner, fit_one_cycle, split leakage, torch coupling, and a version token', () => {
    const md = read(GUIDES.fastai);
    assert.match(md, /load_learner/, 'expected load_learner pickle-boundary content');
    assert.match(md, /fit_one_cycle/, 'expected fit_one_cycle vs fine_tune content');
    assert.match(md, /set_seed|leakage|splitter/i, 'expected reproducibility/leakage content');
    assert.match(md, /torch\.load|torch</i, 'expected torch coupling/pickle content');
    assert.match(md, /fastai 2\.8/i, 'expected a fastai 2.8.x version token');
  });

  it('scikit-learn names Pipeline, cross_val leakage, joblib/pickle, stratify, and a version token', () => {
    const md = read(GUIDES['scikit-learn']);
    assert.match(md, /Pipeline/, 'expected Pipeline leakage-prevention content');
    assert.match(md, /cross_val/, 'expected cross_val content');
    assert.match(md, /leakage/i, 'expected data-leakage content');
    assert.match(md, /joblib|pickle/, 'expected joblib/pickle persistence content');
    assert.match(md, /strat/i, 'expected stratification content');
    assert.match(md, /random_state/, 'expected random_state reproducibility content');
    assert.match(md, /scikit-learn 1\.9|sklearn 1\.9/i, 'expected a scikit-learn 1.9.x version token');
  });
});
