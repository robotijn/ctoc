/**
 * CU4a s8 — content-contract tests for the AI/ML distributed-compute & serverless
 * guides (ray.md, modal.md, replicate.md under skills/frameworks/ai-ml/).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu4a-aiml-inference-runtime-guides.test.js and
 * tests/cu3-data-guides.test.js). No mocks, no fixtures, no fakes. It guards the
 * CU4a acceptance criteria for these three distributed/serverless-compute files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (a footgun/
 *     concurrency/memory section, Error Handling, Security/Dependency, Testing,
 *     Performance, Version-specific, References);
 *   - each guide carries >= 4 code fences (>= 2 fenced single-framework examples);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - each guide cites a real MITRE CWE authority URL (cwe.mitre.org);
 *   - the original "# <Framework> CTO" H1 header is intact (skills.json indexing);
 *   - each guide names its own concrete identifiers and the real MITRE CWE class:
 *       ray       -> @ray.remote + ray.get + CWE-306 (dashboard/jobs unauth RCE
 *                    surface) + CVE-2023-48022 (ShadowRay, CWE-918) +
 *                    cloudpickle/CWE-502 arg deserialization;
 *       modal     -> @app.function + modal.Secret + CWE-798 (hard-coded creds);
 *       replicate -> predictions.create + version pinning + webhook + CWE-798.
 *
 * Every version / security fact these guides assert is web-verified against
 * official sources at edit time (pypi.org for ray/modal/replicate, github.com
 * for cog, docs.ray.io, modal.com/docs, replicate.com/docs, services.nvd.nist.gov,
 * cwe.mitre.org). This test does NOT re-verify the facts against the network; it
 * guards the substance against a future edit dropping it.
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
  ray: 'skills/frameworks/ai-ml/ray.md',
  modal: 'skills/frameworks/ai-ml/modal.md',
  replicate: 'skills/frameworks/ai-ml/replicate.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
// The first entry accepts the per-framework footgun/concurrency/memory equivalent.
const REQUIRED_SECTIONS = [
  { name: 'Footgun/Concurrency/Memory', re: /^##.*(footgun|concurren|memory|serializ|scheduling|cost|cold.?start|autoscal|prediction)/im },
  { name: 'Error Handling', re: /^##.*(error.?handling|error.?idiom|troubleshoot)/im },
  { name: 'Security/Dependency', re: /^##.*(security|dependenc|supply.?chain|trust|secret)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s8 — AI/ML distributed-compute & serverless guides are substantive (real files, zero doubles)', () => {
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

  it('ray names @ray.remote, ray.get, CWE-306, ShadowRay CVE-2023-48022, and cloudpickle', () => {
    const md = read(GUIDES.ray);
    assert.match(md, /@ray\.remote/, 'expected @ray.remote actor/task footgun');
    assert.match(md, /ray\.get/, 'expected ray.get blocking/deadlock footgun');
    assert.match(md, /CWE-306/, 'expected CWE-306 (missing authentication) named');
    assert.match(md, /CVE-2023-48022/, 'expected the ShadowRay CVE id');
    assert.match(md, /CWE-918/, 'expected CWE-918 (SSRF/job-submission RCE class) named');
    assert.match(md, /cloudpickle/i, 'expected cloudpickle arg-deserialization risk');
    assert.match(md, /CWE-502/, 'expected CWE-502 (untrusted deserialization) named');
    assert.match(md, /object.?store|spill/i, 'expected object-store spill/OOM footgun');
    assert.match(md, /num_gpus|num_cpus/, 'expected resource-scheduling knob');
    assert.match(md, /ray 2\.5[0-9]|ray 2\.56/i, 'expected a current Ray 2.5x version token');
  });

  it('modal names @app.function, modal.Secret, CWE-798, and cost/cold-start knobs', () => {
    const md = read(GUIDES.modal);
    assert.match(md, /@app\.function/, 'expected @app.function image/gpu footgun');
    assert.match(md, /modal\.Secret/, 'expected modal.Secret (not env-in-code) pattern');
    assert.match(md, /CWE-798/, 'expected CWE-798 (hard-coded credentials) named');
    assert.match(md, /container_idle_timeout|scaledown_window/, 'expected the idle-timeout cost knob');
    assert.match(md, /allow_concurrent_inputs|max_inputs|@modal\.concurrent/, 'expected concurrency knob');
    assert.match(md, /keep_warm|min_containers/, 'expected keep-warm cold-start knob');
    assert.match(md, /modal 1\.[0-9]/i, 'expected a current Modal 1.x version token');
  });

  it('replicate names predictions.create, version pinning, webhook signing, and CWE-798', () => {
    const md = read(GUIDES.replicate);
    assert.match(md, /predictions\.create/, 'expected async predictions.create footgun');
    assert.match(md, /:version|model.?version|immutable/i, 'expected model-version pinning discussion');
    assert.match(md, /webhook/i, 'expected webhook async pattern');
    assert.match(md, /HMAC|signature|signing.?secret/i, 'expected webhook signature verification');
    assert.match(md, /CWE-798/, 'expected CWE-798 (hard-coded API token) named');
    assert.match(md, /cold.?boot|cold.?start/i, 'expected cold-boot latency footgun');
    assert.match(md, /replicate 1\.[0-9]/i, 'expected a current Replicate 1.x version token');
  });
});
