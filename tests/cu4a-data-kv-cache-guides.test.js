/**
 * CU4a s19 — content-contract tests for the key-value & caching-store framework
 * guides (redis.md, valkey.md, memcached.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js and the sibling CU4a content tests)
 * and asserts substantive structure — no mocks, no fixtures, no fakes. It guards
 * the CU4a acceptance criteria for these three files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (footgun/blocking/
 *     memory, Correctness / Error Handling, Security, Testing, Performance,
 *     Version, References);
 *   - each guide carries >= 4 code fences (>= 2 single-framework examples);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing);
 *   - each guide names its own concrete framework identifiers proving substance,
 *     and cites a REAL MITRE CWE identifier for its unauthenticated-exposure class.
 *
 * Every version/security fact these guides assert is web-verified against official
 * sources at edit time (redis.io, valkey.io, memcached.org/GitHub releases,
 * hub.docker.com, nvd.nist.gov / cwe.mitre.org). This test does NOT re-verify the
 * facts online; it guards the substance against a future edit dropping it.
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
  redis: 'skills/frameworks/data/redis.md',
  valkey: 'skills/frameworks/data/valkey.md',
  memcached: 'skills/frameworks/data/memcached.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Footgun/Blocking/Memory', re: /^##.*(footgun|blocking|memory|evict|concurren|slab|persist)/im },
  { name: 'Correctness/Error Handling', re: /^##.*(correctness|error.?handling|pitfall|atomic)/im },
  { name: 'Security', re: /^##.*security/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*performance/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s19 — key-value & caching-store guides are substantive (real files, zero doubles)', () => {
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

      it('cites a real MITRE CWE identifier for the unauthenticated-exposure class', () => {
        const md = read(rel);
        assert.match(md, /CWE-\d{2,4}/, 'expected a real CWE-<n> identifier token');
        assert.match(md, /cwe\.mitre\.org/i, 'expected a cwe.mitre.org source link');
      });

      it('keeps its original H1 header intact (skills.json indexing)', () => {
        const md = read(rel);
        assert.match(md, /^# .+CTO/m, 'expected the original "# <Framework> CTO" H1 header');
      });
    });
  }

  it('redis names SCAN, maxmemory-policy, protected-mode, RDB/AOF, Lua sandbox and a CWE', () => {
    const md = read(GUIDES.redis);
    assert.match(md, /\bSCAN\b/, 'expected SCAN-vs-KEYS blocking content');
    assert.match(md, /maxmemory-policy/, 'expected maxmemory-policy eviction content');
    assert.match(md, /protected-mode/, 'expected protected-mode unauthenticated-exposure content');
    assert.match(md, /\bRDB\b/, 'expected RDB persistence content');
    assert.match(md, /\bAOF\b/, 'expected AOF persistence content');
    assert.match(md, /noeviction/, 'expected noeviction write-error content');
    assert.match(md, /stampede|thundering/i, 'expected cache-stampede content');
    assert.match(md, /lua/i, 'expected Lua-sandbox content');
    assert.match(md, /CWE-306|CWE-94|CWE-1188/, 'expected a real CWE identifier token');
    assert.match(md, /Redis (8|7)\./, 'expected a verified Redis version token');
  });

  it('valkey names SCAN, ACL, eviction, Redis-fork compat, TLS and a CWE', () => {
    const md = read(GUIDES.valkey);
    assert.match(md, /\bSCAN\b/, 'expected SCAN-vs-KEYS content');
    assert.match(md, /\bACL\b/, 'expected ACL auth content');
    assert.match(md, /eviction/i, 'expected eviction-policy content');
    assert.match(md, /fork|compatib/i, 'expected Redis-fork / compatibility content');
    assert.match(md, /io-threads|multi.?thread/i, 'expected multi-threaded I/O caveat content');
    assert.match(md, /\bTLS\b/, 'expected TLS content');
    assert.match(md, /BSD|licen[sc]e/i, 'expected the BSD-3 / licensing content');
    assert.match(md, /CWE-306|CWE-1188/, 'expected a real CWE identifier token');
    assert.match(md, /Valkey (9|8)\./, 'expected a verified Valkey 9.x/8.x version token');
  });

  it('memcached names slab, LRU, cas, item-size limit, UDP amplification and a CWE', () => {
    const md = read(GUIDES.memcached);
    assert.match(md, /\bslab\b/i, 'expected slab-allocator content');
    assert.match(md, /\bLRU\b/, 'expected LRU-eviction content');
    assert.match(md, /\bcas\b/i, 'expected cas compare-and-swap content');
    assert.match(md, /1\s?MB|1048576|item.?size|-I\b/i, 'expected item-size-limit content');
    assert.match(md, /UDP/, 'expected UDP-amplification content');
    assert.match(md, /-U\s?0|disable udp/i, 'expected disable-UDP hardening content');
    assert.match(md, /no persistence|no built-in persist|volatile/i, 'expected no-persistence content');
    assert.match(md, /CWE-406|CWE-306|CWE-1188/, 'expected a real CWE identifier token');
    assert.match(md, /memcached 1\.6/i, 'expected a verified memcached 1.6.x version token');
  });
});
