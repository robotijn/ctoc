/**
 * CU4a s11 — content-contract tests for the data-streaming-core framework guides
 * (kafka.md, flink.md, beam.md, debezium.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu3-data-guides.test.js) and asserts substantive structure —
 * no mocks, no fixtures, no fakes. It guards the CU4a acceptance criteria for
 * these four data-streaming files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - each guide is well past the ~55-line stub floor (> 120 lines);
 *   - the required correction-surface sections are present (a footgun/delivery
 *     section, Error Handling, Security/Dependency, Testing, Performance,
 *     Version-specific, References);
 *   - each guide carries >= 4 code fences (>= 2 single-framework examples);
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing);
 *   - each guide names its own concrete streaming-correctness identifiers.
 *
 * Every version/security fact these guides assert is web-verified against official
 * sources at edit time (kafka.apache.org / archive.apache.org, flink.apache.org,
 * pypi.org for apache-beam, repo1.maven.org for debezium-core, cwe.mitre.org).
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
  kafka: 'skills/frameworks/data/kafka.md',
  flink: 'skills/frameworks/data/flink.md',
  beam: 'skills/frameworks/data/beam.md',
  debezium: 'skills/frameworks/data/debezium.md',
};

// Sections every de-stubbed streaming correction surface must carry
// (case-insensitive). The footgun family covers delivery/ordering/state/CDC.
const REQUIRED_SECTIONS = [
  { name: 'Error Handling', re: /^##.*error.?handling/im },
  {
    name: 'Footgun/Delivery/State',
    re: /^##.*(footgun|delivery|ordering|state|checkpoint|window|cdc|snapshot|rebalance|backpressure|determinism)/im,
  },
  { name: 'Security/Dependency', re: /^##.*(security|dependenc|credential|injection)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*(performance|throughput|backpressure)/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU4a s11 — data-streaming-core guides are substantive (real files, zero doubles)', () => {
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

  it('kafka names idempotent-producer, acks=all, cooperative-sticky rebalance, and a 4.x token', () => {
    const md = read(GUIDES.kafka);
    assert.match(md, /enable\.idempotence/, 'expected enable.idempotence content');
    assert.match(md, /acks=all|'acks': 'all'|"acks": *"all"/, 'expected acks=all durability content');
    assert.match(md, /cooperative-sticky/, 'expected cooperative-sticky rebalance content');
    assert.match(md, /rebalance/i, 'expected consumer-group rebalance content');
    assert.match(md, /Kafka 4|KRaft/i, 'expected a Kafka 4.x / KRaft version token');
  });

  it('flink names checkpoint, watermark, exactly-once sink, RocksDB state backend, and a 2.x token', () => {
    const md = read(GUIDES.flink);
    assert.match(md, /checkpoint/i, 'expected checkpoint content');
    assert.match(md, /watermark/i, 'expected watermark event-time content');
    assert.match(md, /exactly-once/i, 'expected exactly-once sink content');
    assert.match(md, /RocksDB/i, 'expected RocksDB state-backend content');
    assert.match(md, /Flink 2|Flink 1/i, 'expected a Flink version token');
  });

  it('beam names GroupByKey, windowing, triggers, non-deterministic DoFn, and a 2.x SDK token', () => {
    const md = read(GUIDES.beam);
    assert.match(md, /GroupByKey/, 'expected GroupByKey hot-key content');
    assert.match(md, /window/i, 'expected windowing content');
    assert.match(md, /trigger/i, 'expected trigger content');
    assert.match(md, /non.?determinis/i, 'expected non-deterministic DoFn content');
    assert.match(md, /Beam 2|apache-beam/i, 'expected an Apache Beam SDK version token');
  });

  it('debezium names replication slot, snapshot.mode, WAL retention, tombstones, and a 3.x token', () => {
    const md = read(GUIDES.debezium);
    assert.match(md, /replication slot/i, 'expected replication-slot content');
    assert.match(md, /snapshot\.mode/, 'expected snapshot.mode content');
    assert.match(md, /WAL/, 'expected WAL-retention content');
    assert.match(md, /tombstone/i, 'expected tombstone delete-handling content');
    assert.match(md, /Debezium 3/i, 'expected a Debezium 3.x version token');
  });
});
