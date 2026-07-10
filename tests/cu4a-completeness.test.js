/**
 * CU4a — the 114-file completeness check over all CU4a-targeted long-tail
 * framework guides.
 *
 * ZERO DOUBLES: reads ALL 114 named CU4a framework guides off disk via
 * fs.readFileSync, reads the corpus audit ledger (read-only for
 * CU1/CU2/CU3/CU4c/CU5 records; the CU4a verdict block is appended by this
 * slice's Step 10), and enumerates the full
 * skills/frameworks/{ai-ml,data,mobile,devops}/*.md set off disk. No mocks, no
 * fixtures, no fakes.
 *
 * This is the CU4a-wide gate. It proves:
 *   (a) every one of the 114 long-tail framework guides is substantive
 *       (past the stub floor, > 5 "## " sections, carries a dated >= 2025
 *       source with an http URL) — the UPGRADED verdict is real, not fabricated;
 *   (b) every one of the 114 has a recorded CU4a verdict (UPGRADED or
 *       SOLID-SKIPPED) in the audit ledger — the completeness diff
 *       IN_SCOPE \ (UPGRADED ∪ SOLID-SKIPPED) is EMPTY, and no phantom verdict
 *       is recorded for a non-in-scope path (no silent omission, no phantom);
 *   (c) the SCOPE BOUNDARY holds two ways:
 *       - no CU3-named framework file (ai-ml pytorch/tensorflow/langchain/
 *         transformers/anthropic-sdk/openai-sdk; web react/nextjs; data pandas/
 *         numpy/prisma; mobile react-native/flutter/expo) and no web file is
 *         recorded under a CU4a verdict (CU4a must not touch CU3 / web);
 *       - NO-SILENT-SKIP: enumerate ALL
 *         skills/frameworks/{ai-ml,data,mobile,devops}/*.md, subtract the 12
 *         CU3-named framework files in those four dirs, and assert every
 *         remaining guide is substantive (> 5 "## " sections). Any long-tail
 *         framework guide left at <= 5 sections that ISN'T a CU3 name FAILS —
 *         proving CU4a's whole 114-file scope landed with nothing thin left
 *         behind; AND assert no CU3/web file was regressed below its floor.
 *
 * The 114 IN_SCOPE filenames are the audit-ledger diff (all
 * skills/frameworks/{ai-ml,data,mobile,devops}/*.md at <= 5 "## " sections at
 * audit time MINUS the CU3-named files), confirmed fresh as exactly 114
 * (38 ai-ml + 49 data + 12 mobile + 15 devops). web/*.md is OUT OF SCOPE (all
 * >= 6 sections). Mirrors tests/cu4c-completeness.test.js + CU3's completeness
 * gate (the CU no-silent-skip content-contract precedent).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(projectRoot, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(projectRoot, rel));
}

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

const AUDIT_LEDGER = '.ctoc/audit/corpus-audit-2026-06-15.json';

// The four framework dirs CU4a operates over. web/*.md is deliberately EXCLUDED
// (every web guide already has >= 6 sections — CU3 scope / already solid).
const CU4A_DIRS = ['ai-ml', 'data', 'mobile', 'devops'];

// The CU3-named framework guides — OUT OF CU4a SCOPE (>= 12 sections each).
// CU4a must not touch these. Keyed by dir so the disk-derivation can subtract
// exactly the CU3 names that live inside CU4a's four dirs (web react/nextjs are
// not in these dirs, handled by the web-exclusion). The scope-boundary guard
// asserts no CU3 name (incl. web) and no web file is recorded under a CU4a
// verdict, and the no-silent-skip enumeration excludes exactly these.
const CU3_NAMED_BY_DIR = {
  'ai-ml': ['pytorch', 'tensorflow', 'langchain', 'transformers', 'anthropic-sdk', 'openai-sdk'],
  'data': ['pandas', 'numpy', 'prisma'],
  'mobile': ['react-native', 'flutter', 'expo'],
  'devops': [],
};
// The two web CU3 names (react, nextjs) — used only by the scope-boundary guard.
const CU3_WEB_NAMED = ['react', 'nextjs'];

// The full CU3-named set as ledger-relative paths (across ai-ml/data/mobile +
// web), for the scope-boundary leak check.
const CU3_NAMED_RELS = new Set([
  ...Object.entries(CU3_NAMED_BY_DIR).flatMap(([dir, names]) =>
    names.map((n) => `skills/frameworks/${dir}/${n}.md`)
  ),
  ...CU3_WEB_NAMED.map((n) => `skills/frameworks/web/${n}.md`),
]);

// The canonical CU4a in-scope set: the 114 read-fresh-confirmed thin long-tail
// framework guides upgraded by s1–s30. Every one started at exactly 5 "## "
// sections (the audit-ledger diff floor), so the strict floor is 5 (n > 5) —
// this defeats a no-op false-green. 38 ai-ml + 49 data + 12 mobile + 15 devops.
const IN_SCOPE_BY_DIR = {
  'ai-ml': [
    'accelerate', 'autogen', 'bitsandbytes', 'chromadb', 'crewai', 'datasets',
    'deepspeed', 'diffusers', 'dspy', 'fastai', 'ggml', 'gradio',
    'huggingface-hub', 'jax', 'keras', 'llama-cpp', 'llamaindex', 'milvus',
    'mlflow', 'modal', 'ollama', 'onnx', 'peft', 'pgvector', 'pinecone',
    'qdrant', 'ray', 'replicate', 'scikit-learn', 'semantic-kernel',
    'streamlit', 'tensorrt', 'triton', 'trl', 'unsloth', 'vllm', 'wandb',
    'weaviate',
  ],
  'data': [
    'airbyte', 'airflow', 'alembic', 'arangodb', 'arrow', 'beam', 'cassandra',
    'clickhouse', 'cockroachdb', 'couchbase', 'dagster', 'dask', 'dbt',
    'debezium', 'delta-lake', 'dgraph', 'drizzle', 'duckdb', 'dynamodb',
    'elasticsearch', 'fivetran', 'flink', 'great-expectations', 'hudi',
    'iceberg', 'kafka', 'meilisearch', 'memcached', 'mongodb', 'neo4j', 'neon',
    'opensearch', 'planetscale', 'polars', 'prefect', 'presto', 'questdb',
    'redis', 'scylladb', 'snowflake', 'spark', 'sqlalchemy', 'sqlite',
    'supabase', 'timescaledb', 'trino', 'typesense', 'vaex', 'valkey',
  ],
  'mobile': [
    'beeware', 'capacitor', 'compose-multiplatform', 'ionic', 'jetpack-compose',
    'kivy', 'maui', 'nativescript', 'swiftui', 'unity', 'unreal', 'xamarin',
  ],
  'devops': [
    'ansible', 'chef', 'crossplane', 'datadog', 'docker', 'grafana', 'helm',
    'kubernetes', 'kustomize', 'podman', 'prometheus', 'pulumi', 'puppet',
    'saltstack', 'vault',
  ],
};

const IN_SCOPE = Object.entries(IN_SCOPE_BY_DIR).flatMap(([dir, names]) =>
  names.map((name) => ({
    name,
    dir,
    rel: `skills/frameworks/${dir}/${name}.md`,
    floor: 5,
  }))
);

const CU4A_VALID_VERDICTS = new Set(['UPGRADED', 'SOLID-SKIPPED']);

function loadLedger() {
  const raw = read(AUDIT_LEDGER);
  return JSON.parse(raw); // throws on invalid JSON — that IS the check
}

// The CU4a verdict block: an additive top-level `cu4a_verdicts` object on the
// ledger (existing CU1/CU2/CU3/CU4c/CU5 records untouched). The object carries
// provenance + a legend and a `.verdicts[]` array of per-file entries. Also
// tolerates a bare-array shape. Read fresh off disk each call.
function cu4aVerdicts() {
  const ledger = loadLedger();
  const block = ledger.cu4a_verdicts;
  if (Array.isArray(block)) return block;
  if (block && Array.isArray(block.verdicts)) return block.verdicts;
  return [];
}

// Enumerate every framework markdown guide in a given dir on disk (flat dir).
function guidesInDir(dir) {
  const abs = path.join(projectRoot, 'skills/frameworks', dir);
  return fs.readdirSync(abs)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''))
    .sort();
}

describe('CU4a — 114-file completeness check (real files + recorded verdicts, zero doubles)', () => {
  it('the ledger is valid JSON with the expected top-level shape', () => {
    const ledger = loadLedger();
    assert.ok(Array.isArray(ledger.records), 'ledger.records must be an array');
    assert.ok(ledger.records.length > 0, 'ledger.records must be non-empty');
  });

  it('the IN_SCOPE constant is exactly 114, distinct, and disjoint from the CU3-named + web files', () => {
    assert.equal(IN_SCOPE.length, 114, 'the canonical CU4a in-scope set must be exactly 114 files');
    // Per-dir shape: 38 + 49 + 12 + 15 = 114.
    assert.equal(IN_SCOPE_BY_DIR['ai-ml'].length, 38, 'ai-ml in-scope must be 38');
    assert.equal(IN_SCOPE_BY_DIR['data'].length, 49, 'data in-scope must be 49');
    assert.equal(IN_SCOPE_BY_DIR['mobile'].length, 12, 'mobile in-scope must be 12');
    assert.equal(IN_SCOPE_BY_DIR['devops'].length, 15, 'devops in-scope must be 15');

    const rels = IN_SCOPE.map((s) => s.rel);
    assert.equal(new Set(rels).size, 114, 'IN_SCOPE paths must be distinct (no duplicates)');
    for (const { rel } of IN_SCOPE) {
      assert.ok(!CU3_NAMED_RELS.has(rel), `IN_SCOPE must not include a CU3-named file: ${rel}`);
      assert.ok(!rel.startsWith('skills/frameworks/web/'), `IN_SCOPE must not include a web file: ${rel}`);
    }
  });

  it('the on-disk long-tail framework set equals the 114-file IN_SCOPE list (no drift)', () => {
    // For each of the four CU4a dirs: the full on-disk guide set minus the
    // CU3-named guides in that dir must equal the IN_SCOPE list for that dir.
    // A mistyped constant or a missing/extra guide on disk fails here.
    for (const dir of CU4A_DIRS) {
      const cu3 = new Set(CU3_NAMED_BY_DIR[dir]);
      const onDisk = guidesInDir(dir).filter((n) => !cu3.has(n)).sort();
      const inScope = [...IN_SCOPE_BY_DIR[dir]].sort();
      assert.deepEqual(
        onDisk,
        inScope,
        `the on-disk long-tail set in ${dir} drifted from the IN_SCOPE constant`
      );
    }
  });

  it('all 114 named guide files exist on disk', () => {
    for (const { rel } of IN_SCOPE) {
      assert.ok(exists(rel), `named CU4a guide missing on disk: ${rel}`);
    }
  });

  describe('every in-scope guide is UPGRADED on disk — exceeds its section floor (> 5)', () => {
    for (const { rel, floor } of IN_SCOPE) {
      it(`${rel} has > ${floor} "## " sections`, () => {
        const n = sectionCount(read(rel));
        assert.ok(n > floor, `expected > ${floor} "## " sections, found ${n}`);
      });
    }
  });

  describe('every in-scope guide carries a dated source (>= 2025) with an http URL', () => {
    for (const { rel } of IN_SCOPE) {
      it(`${rel} has a >= 2025 date and an http source`, () => {
        const md = read(rel);
        assert.match(md, /20(2[5-9]|[3-9]\d)/, `expected a >= 2025 date token in ${rel}`);
        assert.match(md, /https?:\/\//, `expected an http(s) source URL in ${rel}`);
      });
    }
  });

  describe('no silent omission — every in-scope file has a recorded CU4a verdict', () => {
    it('the CU4a verdict block exists and is non-empty', () => {
      const v = cu4aVerdicts();
      assert.ok(v.length > 0, 'ledger.cu4a_verdicts must exist and be non-empty');
    });

    it('every CU4a verdict entry is well-formed (path, cu4a_verdict, slice, date)', () => {
      for (const rec of cu4aVerdicts()) {
        assert.equal(typeof rec.path, 'string', `verdict path not string: ${JSON.stringify(rec)}`);
        assert.ok(
          CU4A_VALID_VERDICTS.has(rec.cu4a_verdict),
          `bad cu4a_verdict for ${rec.path}: ${rec.cu4a_verdict}`
        );
        assert.equal(typeof rec.slice, 'string', `verdict slice not string: ${rec.path}`);
        assert.equal(typeof rec.date, 'string', `verdict date not string: ${rec.path}`);
      }
    });

    it('completeness diff is EMPTY — IN_SCOPE \\ (UPGRADED ∪ SOLID-SKIPPED) === []', () => {
      const recorded = new Set(cu4aVerdicts().map((r) => r.path));
      const missing = IN_SCOPE
        .map((s) => s.rel)
        .filter((rel) => !recorded.has(rel));
      assert.deepEqual(
        missing,
        [],
        `in-scope file(s) with NO recorded CU4a verdict (silently omitted): ${missing.join(', ')}`
      );
    });

    it('no phantom verdict — every recorded CU4a verdict path is one of the 114 in-scope', () => {
      const inScope = new Set(IN_SCOPE.map((s) => s.rel));
      const phantom = cu4aVerdicts()
        .map((r) => r.path)
        .filter((p) => !inScope.has(p));
      assert.deepEqual(
        phantom,
        [],
        `CU4a verdict recorded for path(s) NOT in the 114-file scope (phantom): ${phantom.join(', ')}`
      );
    });

    it('every UPGRADED verdict is real — the recorded file has > 5 "## " sections on disk', () => {
      for (const rec of cu4aVerdicts()) {
        if (rec.cu4a_verdict !== 'UPGRADED') continue;
        assert.ok(exists(rec.path), `UPGRADED verdict path missing on disk: ${rec.path}`);
        const n = sectionCount(read(rec.path));
        assert.ok(n > 5, `UPGRADED verdict for ${rec.path} but only ${n} "## " sections on disk (fabricated verdict)`);
      }
    });
  });

  describe('scope boundary — CU4a must not touch CU3-named or web framework files', () => {
    it('no CU3-named framework file is recorded under a CU4a verdict', () => {
      const leaked = cu4aVerdicts()
        .map((r) => r.path)
        .filter((p) => CU3_NAMED_RELS.has(p));
      assert.deepEqual(
        leaked,
        [],
        `CU3-named framework file(s) recorded under a CU4a verdict (scope breach): ${leaked.join(', ')}`
      );
    });

    it('no web framework file is recorded under a CU4a verdict', () => {
      const leaked = cu4aVerdicts()
        .map((r) => r.path)
        .filter((p) => p.startsWith('skills/frameworks/web/'));
      assert.deepEqual(
        leaked,
        [],
        `web framework file(s) recorded under a CU4a verdict (scope breach): ${leaked.join(', ')}`
      );
    });

    it('no CU3-named framework file was regressed below its floor', () => {
      // CU3's guarantee: its named guides stay substantive. The relaxed CU3
      // completeness gate no longer asserts ai-ml exclusivity, so CU4a re-checks
      // here that no CU3 name (across ai-ml/data/mobile + web) was accidentally
      // thinned while the long-tail was upgraded.
      const regressed = [];
      for (const rel of CU3_NAMED_RELS) {
        if (!exists(rel)) {
          regressed.push(`${rel} (MISSING)`);
          continue;
        }
        const n = sectionCount(read(rel));
        if (n <= 5) regressed.push(`${rel} (${n} sections)`);
      }
      assert.deepEqual(
        regressed,
        [],
        `CU3-named framework guide(s) regressed below the > 5 floor: ${regressed.join(', ')}`
      );
    });
  });

  it('NO-SILENT-SKIP — every long-tail framework guide on disk is substantive (> 5 sections)', () => {
    // Enumerate ALL skills/frameworks/{ai-ml,data,mobile,devops}/*.md, subtract
    // the CU3-named guides in those dirs, and assert every remaining file is
    // substantive. A long-tail guide left at <= 5 "## " sections that ISN'T a
    // CU3 name was silently skipped — CU4a scope would be incomplete. This
    // proves CU4a's whole 114-file scope landed with nothing thin left behind,
    // independent of the hand-maintained IN_SCOPE list.
    const thin = [];
    for (const dir of CU4A_DIRS) {
      const cu3 = new Set(CU3_NAMED_BY_DIR[dir]);
      for (const name of guidesInDir(dir)) {
        if (cu3.has(name)) continue; // CU3 scope — not CU4a's concern here
        const n = sectionCount(read(`skills/frameworks/${dir}/${name}.md`));
        if (n <= 5) thin.push(`${dir}/${name} (${n} sections)`);
      }
    }
    assert.deepEqual(
      thin,
      [],
      `long-tail framework guide(s) left thin (<= 5 sections) OUTSIDE the CU3 named set — silently skipped by CU4a: ${thin.join(', ')}`
    );
  });
});
