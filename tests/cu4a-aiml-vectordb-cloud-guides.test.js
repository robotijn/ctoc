/**
 * CU4a s6 — content-contract tests for the AI/ML vector-database framework
 * guides (pinecone.md, weaviate.md, qdrant.md, chromadb.md, milvus.md,
 * pgvector.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js and
 * tests/cu4a-aiml-orchestration-agents-guides.test.js) and asserts substantive
 * structure — no mocks, no fixtures, no fakes. It guards the CU4a acceptance
 * criteria for these six files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (a footgun/index/
 *     collection section, Error/Consistency handling, Security/Isolation,
 *     Testing, Performance, Version-specific, References);
 *   - each guide carries >= 4 code fences (>= 2 fenced single-framework examples);
 *   - each guide carries at least one dated source (>= 2025) with an http URL;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing);
 *   - each guide names its own concrete vector-DB identifiers (per-framework
 *     token assertions below).
 *
 * Every version/security fact these guides assert is web-verified against official
 * sources at edit time: pypi.org JSON API for pinecone / weaviate-client /
 * qdrant-client / chromadb / pymilvus / pgvector versions; github.com release tags
 * for the weaviate / qdrant / milvus servers and the pgvector Postgres extension;
 * cwe.mitre.org for CWE-284 (Improper Access Control) / CWE-89 (SQL Injection) /
 * CWE-285 (Improper Authorization) / CWE-522 (Insufficiently Protected Credentials)
 * / CWE-400 (Uncontrolled Resource Consumption). This test does NOT re-verify the
 * facts against the network; it guards the substance against a future edit dropping
 * it.
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
  pinecone: 'skills/frameworks/ai-ml/pinecone.md',
  weaviate: 'skills/frameworks/ai-ml/weaviate.md',
  qdrant: 'skills/frameworks/ai-ml/qdrant.md',
  chromadb: 'skills/frameworks/ai-ml/chromadb.md',
  milvus: 'skills/frameworks/ai-ml/milvus.md',
  pgvector: 'skills/frameworks/ai-ml/pgvector.md',
};

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Index/Collection footgun', re: /^##.*(footgun|index|collection|schema)/im },
  { name: 'Correctness/Consistency', re: /^##.*(correctness|consistency|error.?handling|filter)/im },
  { name: 'Security/Isolation', re: /^##.*(security|isolation|multi.?tenan|access)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance/Recall', re: /^##.*(performance|recall|latency|cost)/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s6 — AI/ML vector-database guides are substantive (real files, zero doubles)', () => {
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

      it('carries at least four code fences (>= 2 single-framework examples)', () => {
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

  it('pinecone names namespace, dimension, and top_k', () => {
    const md = read(GUIDES.pinecone);
    assert.match(md, /namespace/, 'expected namespace tenant-boundary content');
    assert.match(md, /dimension/, 'expected fixed-dimension footgun content');
    assert.match(md, /top_k/, 'expected top_k recall content');
    assert.match(md, /CWE-284|CWE-285|CWE-522/, 'expected a real access-control/credentials CWE token');
    assert.match(md, /\b9\.\d/, 'expected a pinecone 9.x version token');
  });

  it('weaviate names HNSW, efConstruction, and multi-tenancy', () => {
    const md = read(GUIDES.weaviate);
    assert.match(md, /HNSW/i, 'expected HNSW index content');
    assert.match(md, /efConstruction/, 'expected efConstruction tuning content');
    assert.match(md, /multi-tenan/i, 'expected multi-tenancy isolation content');
    assert.match(md, /CWE-284|CWE-285/, 'expected a real access-control CWE token');
    assert.match(md, /1\.38|4\.2\d/, 'expected a Weaviate 1.38 server or v4.2x client version token');
  });

  it('qdrant names HNSW, ef_construct, and payload index', () => {
    const md = read(GUIDES.qdrant);
    assert.match(md, /HNSW/i, 'expected HNSW index content');
    assert.match(md, /ef_construct/, 'expected ef_construct tuning content');
    assert.match(md, /payload index/i, 'expected payload-index filter content');
    assert.match(md, /CWE-284|CWE-285/, 'expected a real access-control CWE token');
    assert.match(md, /1\.18/, 'expected a Qdrant 1.18 version token');
  });

  it('chromadb names embedding_function, hnsw:space, and where', () => {
    const md = read(GUIDES.chromadb);
    assert.match(md, /embedding_function|embedding function/i, 'expected embedding-function mismatch content');
    assert.match(md, /hnsw:space/, 'expected hnsw:space metric content');
    assert.match(md, /\bwhere\b/, 'expected metadata where-filter content');
    assert.match(md, /CWE-284|CWE-285/, 'expected a real access-control CWE token');
    assert.match(md, /1\.5/, 'expected a Chroma 1.5.x version token');
  });

  it('milvus names IVF, nprobe, and consistency level', () => {
    const md = read(GUIDES.milvus);
    assert.match(md, /IVF/, 'expected IVF index content');
    assert.match(md, /nprobe/, 'expected nprobe recall-vs-latency content');
    assert.match(md, /consistency level/i, 'expected consistency-level content');
    assert.match(md, /CWE-284|CWE-285/, 'expected a real access-control CWE token');
    assert.match(md, /2\.6/, 'expected a Milvus 2.6 server version token');
  });

  it('pgvector names ivfflat, hnsw, and ef_search', () => {
    const md = read(GUIDES.pgvector);
    assert.match(md, /ivfflat/i, 'expected ivfflat index content');
    assert.match(md, /hnsw/i, 'expected hnsw index content');
    assert.match(md, /ef_search/, 'expected ef_search tuning content');
    assert.match(md, /CWE-284/, 'expected the CWE-284 RLS/access-control token');
    assert.match(md, /CWE-89/, 'expected the CWE-89 SQL-injection token');
    assert.match(md, /0\.8/, 'expected a pgvector 0.8.x extension version token');
  });
});
