/**
 * CU4a s9 — content-contract tests for the AI/ML data-app UI guides
 * (gradio.md, streamlit.md under skills/frameworks/ai-ml/).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js and tests/cu4a-aiml-inference-runtime-guides.test.js).
 * No mocks, no fixtures, no fakes. It guards the CU4a acceptance criteria for
 * these two data-app-UI files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (a footgun/
 *     rerun/concurrency/memory section, Error Handling, Security/Dependency,
 *     Testing, Performance, Version-specific, References);
 *   - each guide carries >= 4 code fences (>= 2 fenced single-framework examples);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original "# <Framework> CTO" H1 header is intact (skills.json indexing);
 *   - each guide names its own concrete identifiers and the real MITRE CWE class:
 *       gradio    -> gr.State + share=True + CWE-22 (path traversal);
 *       streamlit -> session_state + cache_data + CWE-79 (XSS).
 *
 * Every version / security fact these guides assert is web-verified against
 * official sources at edit time (pypi.org/project/gradio, pypi.org/project/streamlit,
 * gradio.app, docs.streamlit.io, github.com, cwe.mitre.org, services.nvd.nist.gov).
 * This test does NOT re-verify the facts; it guards the substance against a
 * future edit dropping it.
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
  gradio: 'skills/frameworks/ai-ml/gradio.md',
  streamlit: 'skills/frameworks/ai-ml/streamlit.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
// The first entry accepts the per-framework footgun/rerun/concurrency/memory equivalent.
const REQUIRED_SECTIONS = [
  { name: 'Footgun/Rerun/Concurrency/Memory', re: /^##.*(footgun|rerun|concurren|memory|component|execution|session|streaming|queue)/im },
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

describe('CU4a s9 — AI/ML data-app UI guides are substantive (real files, zero doubles)', () => {
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

  it('gradio names gr.State, share=True, allowed_paths, CWE-22, and a real path-traversal CVE', () => {
    const md = read(GUIDES.gradio);
    assert.match(md, /gr\.State/, 'expected gr.State per-session state footgun');
    assert.match(md, /share\s*=\s*True/, 'expected share=True public-tunnel exposure');
    assert.match(md, /allowed_paths/, 'expected allowed_paths file-access allowlist mitigation');
    assert.match(md, /CWE-22/, 'expected CWE-22 (path traversal) named');
    assert.match(md, /concurrency_limit/, 'expected concurrency_limit queue knob');
    assert.match(md, /CVE-2023-51449|CVE-2024-47164|CVE-2024-1728/, 'expected a real Gradio path-traversal CVE id');
  });

  it('streamlit names session_state, cache_data, cache_resource, unsafe_allow_html, CWE-79, and a real CVE', () => {
    const md = read(GUIDES.streamlit);
    assert.match(md, /session_state/, 'expected st.session_state rerun-persistence footgun');
    assert.match(md, /cache_data/, 'expected @st.cache_data staleness footgun');
    assert.match(md, /cache_resource/, 'expected @st.cache_resource vs cache_data distinction');
    assert.match(md, /unsafe_allow_html/, 'expected unsafe_allow_html XSS surface');
    assert.match(md, /CWE-79/, 'expected CWE-79 (XSS) named');
    assert.match(md, /CWE-798/, 'expected CWE-798 (hardcoded secrets) named');
    assert.match(md, /CVE-2023-27494|CVE-2024-42474/, 'expected a real Streamlit XSS/path-traversal CVE id');
  });
});
