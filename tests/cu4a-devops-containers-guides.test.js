/**
 * CU4a s28 — content-contract tests for the container-runtime framework guides
 * (docker.md, podman.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js and the sibling CU4a content tests)
 * and asserts substantive structure — no mocks, no fixtures, no fakes. It guards
 * the CU4a acceptance criteria for these two files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (footgun/build/runtime,
 *     Security, Testing, Performance, Version, References);
 *   - each guide carries >= 4 code fences (>= 2 single-framework examples);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing);
 *   - each guide names its own concrete framework identifiers proving substance.
 *
 * Every version/security fact these guides assert is web-verified against official
 * sources at edit time (docs.docker.com/engine/release-notes/28 for Docker Engine
 * 28.5.2, github.com/containers/podman releases for Podman 6.0.1, and
 * cwe.mitre.org/{250,538,526}). This test does NOT re-verify the facts online; it
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
  docker: 'skills/frameworks/devops/docker.md',
  podman: 'skills/frameworks/devops/podman.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Footgun/Build/Runtime', re: /^##.*(footgun|build|runtime|rootless|image|layer|cache)/im },
  { name: 'Security', re: /^##.*security/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s28 — container-runtime guides are substantive (real files, zero doubles)', () => {
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

      it('keeps its original H1 header intact (skills.json indexing)', () => {
        const md = read(rel);
        assert.match(md, /^# .+CTO/m, 'expected the original "# <Framework> CTO" H1 header');
      });
    });
  }

  it('docker names multi-stage, USER non-root, .dockerignore, digest pin, healthcheck and CWE ids', () => {
    const md = read(GUIDES.docker);
    assert.match(md, /multi-stage/i, 'expected multi-stage build content');
    assert.match(md, /\bUSER\b/, 'expected non-root USER directive content');
    assert.match(md, /\.dockerignore/, 'expected .dockerignore content');
    assert.match(md, /@sha256:|digest/i, 'expected digest-pin (not latest) content');
    assert.match(md, /HEALTHCHECK/i, 'expected HEALTHCHECK content');
    assert.match(md, /--tmpfs|--read-only|read-only rootfs/i, 'expected read-only rootfs hardening content');
    assert.match(md, /cap-drop|--cap-drop|drop.*cap/i, 'expected capability-drop content');
    assert.match(md, /CWE-250/, 'expected CWE-250 (execution with unnecessary privileges) token');
    assert.match(md, /CWE-538/, 'expected CWE-538 (secret-in-layer) token');
    assert.match(md, /BuildKit|--secret/, 'expected BuildKit build-secret content');
    assert.match(md, /28\.5|28\.5\.2|\b28\.x\b/, 'expected a Docker Engine 28.5.x version token');
  });

  it('podman names rootless, subuid/subgid, pasta/slirp4netns, Quadlet, pods, daemonless and CWE ids', () => {
    const md = read(GUIDES.podman);
    assert.match(md, /rootless/i, 'expected rootless-vs-root content');
    assert.match(md, /subuid|subgid/, 'expected subuid/subgid mapping content');
    assert.match(md, /pasta|slirp4netns/, 'expected rootless-networking (pasta/slirp4netns) content');
    assert.match(md, /Quadlet/, 'expected Quadlet content');
    assert.match(md, /\bpod\b|pods/i, 'expected pod-vs-container content');
    assert.match(md, /daemonless/i, 'expected daemonless content');
    assert.match(md, /:Z\b|:z\b|SELinux/, 'expected SELinux :Z relabel content');
    assert.match(md, /CWE-538/, 'expected CWE-538 (secret-in-layer) token');
    assert.match(md, /6\.0|6\.0\.1|\b6\.x\b/, 'expected a Podman 6.0.x version token');
  });
});
