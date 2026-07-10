/**
 * CU4a s27 — content-contract tests for the devops Kubernetes-family framework
 * guides (kubernetes.md, helm.md, kustomize.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js and tests/cu3-ai-ml-deeplearning-guides.test.js)
 * and asserts substantive structure — no mocks, no fixtures, no fakes. It guards
 * the CU4a acceptance criteria for these three files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (a footgun/resource/
 *     overlay/chart section, Error Handling, Security/Dependency, Testing,
 *     Performance, Version, References);
 *   - each guide names its own concrete Kubernetes-family identifiers
 *     (kubernetes: readiness / runAsNonRoot / CWE-284;
 *      helm: nindent / values.yaml / CWE-312;
 *      kustomize: overlay / configMapGenerator / CWE-312);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing).
 *
 * Every version/security fact these guides assert is web-verified against official
 * sources at edit time (kubernetes.io, endoflife.date/kubernetes, github.com/helm,
 * github.com/kubernetes-sigs/kustomize releases, nvd.nist.gov CVE-2025-1974,
 * cwe.mitre.org/{284,312,798,653}). This test does NOT re-verify the live facts;
 * it guards the substance against a future edit dropping it.
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
  kubernetes: 'skills/frameworks/devops/kubernetes.md',
  helm: 'skills/frameworks/devops/helm.md',
  kustomize: 'skills/frameworks/devops/kustomize.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Footgun/Resource/Overlay/Chart', re: /^##.*(footgun|resource|probe|overlay|chart|template|manifest|api)/im },
  { name: 'Error Handling', re: /^##.*error.?handling/im },
  { name: 'Security/Dependency', re: /^##.*(security|dependenc|secret|rbac|injection)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*(performance|reliability|rollout)/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s27 — devops K8s-family guides are substantive (real files, zero doubles)', () => {
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

      it('carries at least four code fences (>= 2 fenced examples)', () => {
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

  it('kubernetes names readiness/liveness probes, runAsNonRoot, RBAC least-privilege with CWE-284, and a current version token', () => {
    const md = read(GUIDES.kubernetes);
    assert.match(md, /readiness/i, 'expected readiness-probe content');
    assert.match(md, /liveness/i, 'expected liveness-probe content');
    assert.match(md, /runAsNonRoot/, 'expected runAsNonRoot securityContext content');
    assert.match(md, /readOnlyRootFilesystem/, 'expected readOnlyRootFilesystem content');
    assert.match(md, /CWE-284/, 'expected the CWE-284 access-control token (RBAC least-privilege)');
    assert.match(md, /requests.{0,40}limits|limits.{0,40}requests/is, 'expected resource requests-vs-limits content');
    assert.match(md, /OOMKill|OOMKilled|evict/i, 'expected OOMKilled/eviction content');
    assert.match(md, /1\.3[3-9]|1\.[4-9]\d/, 'expected a current K8s 1.3x+ version token');
  });

  it('helm names nindent templating, values.yaml precedence, secrets-in-values with CWE-312, --atomic, and a Helm version token', () => {
    const md = read(GUIDES.helm);
    assert.match(md, /nindent/, 'expected nindent whitespace-templating content');
    assert.match(md, /values\.yaml/, 'expected values.yaml precedence content');
    assert.match(md, /precedence|override/i, 'expected values override-precedence content');
    assert.match(md, /CWE-312/, 'expected the CWE-312 cleartext-storage token (secrets in values)');
    assert.match(md, /--atomic/, 'expected --atomic rollback-safety content');
    assert.match(md, /SOPS|external.?secrets|sealed.?secrets/i, 'expected an encrypted-secrets mechanism');
    assert.match(md, /Helm 4|Helm 3|helm 4|v4\./i, 'expected a Helm version token (3.x/4.x)');
  });

  it('kustomize names overlay patches, configMapGenerator hash, secretGenerator plaintext with CWE-312, JSON6902, and a version token', () => {
    const md = read(GUIDES.kustomize);
    assert.match(md, /overlay/i, 'expected base/overlay content');
    assert.match(md, /configMapGenerator/, 'expected configMapGenerator hash-suffix content');
    assert.match(md, /secretGenerator/, 'expected secretGenerator content');
    assert.match(md, /CWE-312/, 'expected the CWE-312 cleartext-storage token (plaintext secrets in manifests)');
    assert.match(md, /JSON.?6902|strategic.?merge/i, 'expected patch-strategy (JSON6902 vs strategic-merge) content');
    assert.match(md, /\bbases\b/, 'expected the deprecated `bases` -> `resources` content');
    assert.match(md, /kustomize.{0,6}5|v5\.\d/i, 'expected a Kustomize 5.x version token');
  });

  it('all three guides cite a real MITRE CWE URL and no fabricated CVE-shaped token appears un-sourced', () => {
    for (const rel of Object.values(GUIDES)) {
      const md = read(rel);
      assert.match(md, /cwe\.mitre\.org/i, `expected a cwe.mitre.org citation in ${rel}`);
      // Any CVE token present must be the web-verified real one (CVE-2025-1974),
      // guarding against a future edit dropping in a fabricated CVE id.
      const cves = md.match(/CVE-\d{4}-\d{4,7}/g) || [];
      for (const cve of cves) {
        assert.equal(cve, 'CVE-2025-1974', `unexpected/unverified CVE token ${cve} in ${rel}`);
      }
    }
  });
});
