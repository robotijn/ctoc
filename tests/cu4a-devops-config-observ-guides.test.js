/**
 * CU4a s30 — content-contract tests for the config-management + observability
 * devops framework guides (chef.md, puppet.md, saltstack.md, prometheus.md,
 * grafana.md, datadog.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js) and asserts substantive structure —
 * no mocks, no fixtures, no fakes. It guards the CU4a acceptance criteria for
 * these six files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (a footgun/
 *     convergence/cardinality section, Security, Testing, Performance/Cost,
 *     Version, References);
 *   - each guide carries >= 4 code fences (>= 2 single-framework examples);
 *   - each guide carries at least one dated source (>= 2025) with an http URL;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing);
 *   - each guide names its own web-verified concrete identifiers (see per-file
 *     assertions), including the real MITRE CWE ids / SaltStack CVE grounded in
 *     that tool's actual attack surface.
 *
 * Every version/security fact these guides assert is web-verified against official
 * sources at edit time (rubygems.org for chef/puppet, pypi.org for salt,
 * prometheus.io/download, github.com/grafana/grafana releases, DataDog
 * datadog-agent CHANGELOG, nvd.nist.gov for CVE-2020-11651/11652 +
 * CVE-2021-43798/CVE-2025-4123, cwe.mitre.org). This test does NOT re-verify the
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
  chef: 'skills/frameworks/devops/chef.md',
  puppet: 'skills/frameworks/devops/puppet.md',
  saltstack: 'skills/frameworks/devops/saltstack.md',
  prometheus: 'skills/frameworks/devops/prometheus.md',
  grafana: 'skills/frameworks/devops/grafana.md',
  datadog: 'skills/frameworks/devops/datadog.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  {
    name: 'Footgun/Convergence/Cardinality',
    re: /^##.*(footgun|convergence|cardinality|catalog|state|dashboard|instrumentation)/im,
  },
  { name: 'Security', re: /^##.*(security|secret|credential)/im },
  { name: 'Testing/Safety', re: /^##.*(test|safety|noop|why.?run|dry.?run|preview)/im },
  { name: 'Performance/Cost', re: /^##.*(performance|cost|scale|resource)/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s30 — devops config/observability guides are substantive (real files, zero doubles)', () => {
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

  it('chef names idempotency guards (not_if/notifies) and encrypted-secrets CWE-312', () => {
    const md = read(GUIDES.chef);
    assert.match(md, /not_if/, 'expected the not_if guard');
    assert.match(md, /only_if/, 'expected the only_if guard');
    assert.match(md, /notifies/, 'expected notifies/notification content');
    assert.match(md, /:delayed/, 'expected :delayed timing content');
    assert.match(md, /why.?run/i, 'expected why-run safety content');
    assert.match(md, /(data bag|vault)/i, 'expected encrypted data bag / Chef Vault content');
    assert.match(md, /CWE-312/, 'expected the CWE-312 cleartext-storage token');
    assert.match(md, /Chef Infra 1[89]|Chef 1[89]/i, 'expected a current Chef Infra version token');
  });

  it('puppet names resource ordering (require/exec), Hiera, and Hiera-eyaml CWE-312', () => {
    const md = read(GUIDES.puppet);
    assert.match(md, /require\b/, 'expected the require ordering metaparameter');
    assert.match(md, /before\b/, 'expected the before ordering metaparameter');
    assert.match(md, /notify\b/, 'expected the notify metaparameter');
    assert.match(md, /exec\b/, 'expected exec-guard content');
    assert.match(md, /creates|unless|onlyif/, 'expected exec idempotency guard content');
    assert.match(md, /Hiera/, 'expected Hiera lookup content');
    assert.match(md, /eyaml/i, 'expected Hiera-eyaml secrets content');
    assert.match(md, /--noop/, 'expected the --noop dry-run safety content');
    assert.match(md, /CWE-312/, 'expected the CWE-312 cleartext-storage token');
    assert.match(md, /Puppet 8/i, 'expected a current Puppet version token');
  });

  it('saltstack names idempotency (unless), pillar secrets, and CVE-2020-11651 auth-bypass', () => {
    const md = read(GUIDES.saltstack);
    assert.match(md, /cmd\.run/, 'expected the cmd.run non-idempotent footgun');
    assert.match(md, /\bunless\b/, 'expected the unless guard');
    assert.match(md, /onlyif/, 'expected the onlyif guard');
    assert.match(md, /pillar/i, 'expected pillar data/secrets content');
    assert.match(md, /CVE-2020-11651/, 'expected the CVE-2020-11651 auth-bypass token');
    assert.match(md, /CVE-2020-11652/, 'expected the CVE-2020-11652 directory-traversal token');
    assert.match(md, /CWE-306/, 'expected the CWE-306 missing-authentication token');
    assert.match(md, /master/i, 'expected master-exposure content');
    assert.match(md, /300[0-9]/, 'expected a current Salt 300x version token');
  });

  it('prometheus names cardinality, rate() windows, and no-auth CWE-306', () => {
    const md = read(GUIDES.prometheus);
    assert.match(md, /cardinality/i, 'expected label-cardinality footgun content');
    assert.match(md, /rate\(/, 'expected the rate() range-window content');
    assert.match(md, /recording rule/i, 'expected recording-rule content');
    assert.match(md, /counter reset|reset/i, 'expected counter-reset correctness content');
    assert.match(md, /CWE-306/, 'expected the CWE-306 missing-authentication token');
    assert.match(md, /federation|federat/i, 'expected federation content');
    assert.match(md, /Prometheus 3/i, 'expected a current Prometheus 3.x version token');
  });

  it('grafana names template variables, unified alerting, real CVE, and API-key CWE-798', () => {
    const md = read(GUIDES.grafana);
    assert.match(md, /template variable/i, 'expected template-variable footgun content');
    assert.match(md, /alerting/i, 'expected unified-alerting content');
    assert.match(md, /no.?data/i, 'expected no-data alert handling content');
    assert.match(md, /provisioning/i, 'expected dashboard-provisioning content');
    assert.match(md, /datasource/i, 'expected datasource proxy/secret content');
    assert.match(md, /CVE-2021-43798|CVE-2025-4123/, 'expected a real Grafana CVE token');
    assert.match(md, /CWE-798/, 'expected the CWE-798 hard-coded-credentials token');
    assert.match(md, /Grafana 1[123]/i, 'expected a current Grafana version token');
  });

  it('datadog names cardinality/cost, APM sampling, and API-key CWE-798', () => {
    const md = read(GUIDES.datadog);
    assert.match(md, /cardinality/i, 'expected custom-metric cardinality footgun content');
    assert.match(md, /sampling/i, 'expected APM sampling content');
    assert.match(md, /distribution|gauge/i, 'expected distribution-vs-gauge content');
    assert.match(md, /no.?data/i, 'expected monitor no-data content');
    assert.match(md, /CWE-798/, 'expected the CWE-798 hard-coded-credentials token');
    assert.match(md, /PII|scrub/i, 'expected PII-scrubbing content');
    assert.match(md, /Agent 7/i, 'expected a current Datadog Agent 7.x version token');
  });
});
