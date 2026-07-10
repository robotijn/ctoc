/**
 * CU4a s29 — content-contract tests for the devops IaC & secrets guides
 * (pulumi.md, crossplane.md, vault.md, ansible.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js) and asserts substantive structure —
 * no mocks, no fixtures, no fakes. It guards the CU4a acceptance criteria for
 * these four files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (footgun/correctness,
 *     Security/Dependency, Testing, Performance/Availability/Safety, Version,
 *     References);
 *   - each guide names its own concrete IaC/secrets identifiers (see per-file
 *     assertions) plus a web-verified current version token;
 *   - each guide names the real MITRE CWE class(es) grounding its attack surface
 *     (CWE-312 for pulumi/ansible cleartext state/secrets; CWE-284 for
 *     crossplane/vault improper access control);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing).
 *
 * Every version/security fact these guides assert is web-verified against official
 * sources at edit time (pypi.org for pulumi + ansible-core; charts.crossplane.io
 * for crossplane; releases.hashicorp.com + checkpoint-api.hashicorp.com for vault;
 * cwe.mitre.org for the CWE ids). This test does NOT re-verify the live facts; it
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
  pulumi: 'skills/frameworks/devops/pulumi.md',
  crossplane: 'skills/frameworks/devops/crossplane.md',
  vault: 'skills/frameworks/devops/vault.md',
  ansible: 'skills/frameworks/devops/ansible.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Footgun/Correctness', re: /^##.*(footgun|correctness|idempoten|composition|secret|state)/im },
  { name: 'Security/Dependency', re: /^##.*(security|dependenc|access|credential|audit|injection)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Ops/Perf/Availability/Safety', re: /^##.*(performance|availability|safety|reconcil|operational|drift)/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s29 — devops IaC & secrets guides are substantive (real files, zero doubles)', () => {
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

      it('carries at least four code fences (>= 2 single-framework blocks)', () => {
        const md = read(rel);
        const fences = (md.match(/^```/gm) || []).length;
        assert.ok(fences >= 4, `expected >= 4 code fences (>= 2 blocks), found ${fences}`);
      });

      it('carries at least one dated source (>= 2025) with an http URL', () => {
        const md = read(rel);
        assert.match(md, /20(2[5-9]|[3-9]\d)/, 'expected a date token >= 2025');
        assert.match(md, /https?:\/\//, 'expected at least one http(s) source URL');
      });

      it('keeps its original H1 "# <Framework> CTO" header intact (skills.json indexing)', () => {
        const md = read(rel);
        assert.match(md, /^# .+CTO/m, 'expected the original "# <Framework> CTO" H1 header');
      });
    });
  }

  it('pulumi names --secret config, Output<T> async, and CWE-312 cleartext state', () => {
    const md = read(GUIDES.pulumi);
    assert.match(md, /--secret/, 'expected pulumi config set --secret content');
    assert.match(md, /Output/, 'expected Output<T> async-value content');
    assert.match(md, /CWE-312/, 'expected the CWE-312 cleartext-state token');
    assert.match(md, /secretsprovider|secrets provider|passphrase|KMS/i, 'expected a state secrets-provider gotcha');
    assert.match(md, /stack ?reference|StackReference/i, 'expected stack-reference content');
    assert.match(md, /3\.2\d\d/, 'expected a Pulumi 3.2xx version token');
  });

  it('crossplane names Composition, XRD, reconcile drift, and CWE-284 access control', () => {
    const md = read(GUIDES.crossplane);
    assert.match(md, /Composition/, 'expected Composition content');
    assert.match(md, /XRD/, 'expected XRD content');
    assert.match(md, /reconcil/i, 'expected reconciliation-loop / drift content');
    assert.match(md, /CWE-284/, 'expected the CWE-284 improper-access-control token');
    assert.match(md, /managementPolicies|deletionPolicy/, 'expected a management/deletion-policy gotcha');
    assert.match(md, /RBAC/, 'expected RBAC-on-XR content');
    assert.match(md, /2\.3\.\d/, 'expected a Crossplane 2.3.x version token');
  });

  it('vault names lease/TTL, seal/unseal, least-privilege policy, and CWE-284 + CWE-532', () => {
    const md = read(GUIDES.vault);
    assert.match(md, /lease/i, 'expected lease/TTL content');
    assert.match(md, /unseal/i, 'expected seal/unseal content');
    assert.match(md, /CWE-284/, 'expected the CWE-284 improper-access-control token');
    assert.match(md, /CWE-532/, 'expected the CWE-532 sensitive-info-in-logs token');
    assert.match(md, /least.?privilege|deny/i, 'expected least-privilege policy content');
    assert.match(md, /audit/i, 'expected audit-device content');
    assert.match(md, /root token/i, 'expected never-use-root-in-prod content');
    assert.match(md, /1\.19|2\.0/, 'expected a Vault version token (1.19 LTS / 2.0)');
  });

  it('ansible names idempotency, become, no_log, Ansible Vault, and CWE-312 + CWE-532', () => {
    const md = read(GUIDES.ansible);
    assert.match(md, /idempoten/i, 'expected idempotency content');
    assert.match(md, /become/, 'expected become-privilege content');
    assert.match(md, /no_log/, 'expected no_log-secrets content');
    assert.match(md, /CWE-312/, 'expected the CWE-312 cleartext-secrets token');
    assert.match(md, /CWE-532/, 'expected the CWE-532 secrets-in-logs token');
    assert.match(md, /changed_when|creates:/, 'expected an idempotency-control gotcha');
    assert.match(md, /ansible-vault|Ansible Vault/, 'expected Ansible Vault content');
    assert.match(md, /2\.2\d/, 'expected an ansible-core 2.2x version token');
  });
});
