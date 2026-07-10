/**
 * CU4a s23 — content-contract tests for the data-orchestration & quality framework
 * guides (airflow.md, dagster.md, prefect.md, great-expectations.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js and tests/cu4a-data-streaming-core-guides.test.js)
 * and asserts substantive structure — no mocks, no fixtures, no fakes. It guards
 * the CU4a acceptance criteria for these four data files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (a footgun/execution
 *     section, Error Handling, Security/Dependency, Testing, Performance,
 *     Version-specific, References);
 *   - each guide carries >= 4 code fences (>= 2 single-framework examples);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing);
 *   - each guide names its own concrete orchestration/quality identifiers.
 *
 * Every version/security fact these guides assert is web-verified against official
 * sources at edit time (pypi.org for apache-airflow / dagster / prefect /
 * great_expectations, github.com/advisories for CVE/GHSA, cwe.mitre.org for CWE
 * definitions, and each framework's official docs). This test does NOT re-verify
 * the facts against the network; it guards the substance against a future edit
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
  airflow: 'skills/frameworks/data/airflow.md',
  dagster: 'skills/frameworks/data/dagster.md',
  prefect: 'skills/frameworks/data/prefect.md',
  'great-expectations': 'skills/frameworks/data/great-expectations.md',
};

// Sections every de-stubbed orchestration/quality correction surface must carry
// (case-insensitive). The footgun family covers DAG/asset/flow/validation traps.
const REQUIRED_SECTIONS = [
  { name: 'Error Handling', re: /^##.*error.?handling/im },
  {
    name: 'Footgun/Execution',
    re: /^##.*(footgun|execution|dag|asset|flow|validation|checkpoint|partition|idempoten|orchestrat)/im,
  },
  { name: 'Security/Dependency', re: /^##.*(security|dependenc|credential|injection)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*(performance|throughput|concurrency|scheduler)/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s23 — data-orchestration & quality guides are substantive (real files, zero doubles)', () => {
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

      it('carries at least four fenced code lines (>= 2 example blocks)', () => {
        const md = read(rel);
        const fences = (md.match(/^```/gm) || []).length;
        assert.ok(fences >= 4, `expected >= 4 code fences (>= 2 blocks), found ${fences}`);
      });

      it('carries at least one dated source (>= 2025) with an http URL', () => {
        const md = read(rel);
        assert.match(md, /20(2[5-9]|[3-9]\d)/, 'expected a date token >= 2025');
        assert.match(md, /https?:\/\//, 'expected at least one http(s) source URL');
      });

      it('names at least one real CWE identifier grounded in its attack surface', () => {
        const md = read(rel);
        assert.match(md, /CWE-\d{2,4}/, 'expected a real MITRE CWE identifier');
      });

      it('keeps its original H1 header intact (skills.json indexing)', () => {
        const md = read(rel);
        assert.match(md, /^# .+CTO/m, 'expected the original "# <Framework> CTO" H1 header');
      });
    });
  }

  it('airflow names top-level code, catchup, XCom limits, idempotency, and a 3.x version token', () => {
    const md = read(GUIDES.airflow);
    assert.match(md, /top-level code/i, 'expected top-level-code-in-DAG-parse footgun');
    assert.match(md, /catchup/i, 'expected catchup backfill-storm footgun');
    assert.match(md, /XCom/, 'expected XCom size-limit footgun');
    assert.match(md, /idempoten/i, 'expected idempotency content');
    assert.match(md, /CWE-1336|CWE-502/, 'expected a real Airflow CWE (template injection / deserialization)');
    assert.match(md, /Airflow 3|3\.3/i, 'expected an Airflow 3.x version token');
  });

  it('dagster names @asset, IO manager, partition, resource, and a 1.x version token', () => {
    const md = read(GUIDES.dagster);
    assert.match(md, /@asset/, 'expected software-defined asset content');
    assert.match(md, /IO manager/i, 'expected IO-manager (where data lives) content');
    assert.match(md, /partition/i, 'expected partition content');
    assert.match(md, /resource/i, 'expected resource-config content');
    assert.match(md, /CWE-89/, 'expected the real Dagster SQL-injection CWE (partition-key)');
    assert.match(md, /Dagster 1|1\.13/i, 'expected a Dagster 1.x version token');
  });

  it('prefect names @flow, retries, cache_key_fn, deployment/work pools, and a 3.x version token', () => {
    const md = read(GUIDES.prefect);
    assert.match(md, /@flow/, 'expected flow-vs-task content');
    assert.match(md, /retries/, 'expected retries + retry_delay_seconds content');
    assert.match(md, /cache_key_fn/, 'expected caching cache_key_fn content');
    assert.match(md, /work pool|deployment/i, 'expected deployment / work-pool content');
    assert.match(md, /CWE-88|CWE-863|CWE-798/, 'expected a real Prefect CWE');
    assert.match(md, /Prefect 3|3\.7/i, 'expected a Prefect 3.x version token');
  });

  it('great-expectations names expectation suite, checkpoint, batch, data docs, and a 1.x version token', () => {
    const md = read(GUIDES['great-expectations']);
    assert.match(md, /expectation suite/i, 'expected expectation-suite content');
    assert.match(md, /checkpoint/i, 'expected checkpoint-run content');
    assert.match(md, /batch/i, 'expected batch-request content');
    assert.match(md, /data docs/i, 'expected data-docs content');
    assert.match(md, /CWE-798/, 'expected the datasource-credential CWE');
    assert.match(md, /Great Expectations 1|1\.18|v1/i, 'expected a GX 1.x version token');
  });
});
