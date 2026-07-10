/**
 * CU4a s7 — content-contract tests for the AI/ML experiment-tracking framework
 * guides (mlflow.md, wandb.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js) and asserts substantive structure —
 * no mocks, no fixtures, no fakes. It guards the CU4a acceptance criteria for
 * these two files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (footgun, Error
 *     Handling, Security/Dependency, Testing/Reproducibility, Performance/Cost,
 *     Version, References);
 *   - each guide carries >= 4 code fences (>= 2 fenced single-framework blocks);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing);
 *   - each guide names its own concrete correction identifiers:
 *       mlflow: log_model, CWE-502, pyfunc (+ tracking-server CWE-306 exposure);
 *       wandb:  wandb.init, artifact, CWE-798 (API-key leak).
 *
 * Every version/security fact these guides assert is web-verified against official
 * sources at edit time (pypi.org JSON API for mlflow/wandb, mlflow.org docs,
 * docs.wandb.ai, github.com release notes, nvd.nist.gov / cwe.mitre.org). This
 * test does NOT re-verify the facts; it guards the substance against a future
 * edit dropping it.
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
  mlflow: 'skills/frameworks/ai-ml/mlflow.md',
  wandb: 'skills/frameworks/ai-ml/wandb.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Footgun', re: /^##.*(footgun|mistake|gotcha|pitfall)/im },
  { name: 'Error Handling', re: /^##.*error.?handling/im },
  { name: 'Security/Dependency', re: /^##.*(security|dependenc|injection|deserial)/im },
  { name: 'Testing/Reproducibility', re: /^##.*(test|reproducib)/im },
  { name: 'Performance/Cost', re: /^##.*(performance|cost|scal)/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s7 — AI/ML experiment-tracking guides are substantive (real files, zero doubles)', () => {
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

      it('carries at least four fenced code examples (>= 2 footgun demos)', () => {
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

  it('mlflow names log_model, pyfunc, model-load pickle CWE-502, tracking-server CWE-306, and a version token', () => {
    const md = read(GUIDES.mlflow);
    assert.match(md, /log_model/, 'expected log_model flavor content');
    assert.match(md, /pyfunc/, 'expected pyfunc signature content');
    assert.match(md, /load_model/, 'expected load_model deserialization content');
    assert.match(md, /CWE-502/, 'expected the CWE-502 deserialization token');
    assert.match(md, /CWE-306/, 'expected the CWE-306 tracking-server exposure token');
    assert.match(md, /pickle/i, 'expected pickle deserialization content');
    assert.match(md, /autolog/i, 'expected autolog double-logging content');
    assert.match(md, /registr/i, 'expected model-registry stage-transition content');
    assert.match(md, /mlflow 3|mlflow 2/i, 'expected an MLflow version token (2.x/3.x)');
  });

  it('wandb names wandb.init, artifact lineage, API-key leak CWE-798, offline sync, and a version token', () => {
    const md = read(GUIDES.wandb);
    assert.match(md, /wandb\.init/, 'expected wandb.init run-resumption content');
    assert.match(md, /artifact/i, 'expected artifact versioning/lineage content');
    assert.match(md, /CWE-798/, 'expected the CWE-798 hardcoded-credentials token');
    assert.match(md, /WANDB_API_KEY|api.?key/i, 'expected API-key leak content');
    assert.match(md, /offline/i, 'expected offline-mode sync content');
    assert.match(md, /wandb\.log/, 'expected wandb.log commit-semantics content');
    assert.match(md, /step/i, 'expected step-vs-global-step content');
    assert.match(md, /wandb 0\.[0-9]|wandb 0\./i, 'expected a wandb version token (0.x)');
  });
});
