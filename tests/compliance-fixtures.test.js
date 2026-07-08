'use strict';

/*
 * SHARED COMPLIANCE FIXTURES — fixture-driven classification + manifest validation (EC6-s1).
 *
 * This suite is the single owner of `tests/fixtures/compliance/`: one shared
 * fixture library that replaces the per-slice inline ad-hoc strings the parent
 * EC6 plan calls out. It does two honest things:
 *
 *   1. FIXTURE-DRIVEN CLASSIFICATION — loads each plan fixture from disk and runs
 *      the SHIPPED, pure `classifyFromPlanText` (src/lib/eu-ai-act-helpers.js) on
 *      the real file text, asserting the returned `{ risk_class,
 *      annex_iii_category, confidence }` triple matches the manifest. The
 *      classifier is NEVER mocked; the fixtures are real files on disk.
 *
 *   2. MANIFEST VALIDATION — parses `fixture-manifest.yaml` with the repo's own
 *      zero-dependency YAML reader (src/lib/budget.js:parseYaml), asserting
 *      completeness (every on-disk fixture is a manifest key and vice versa),
 *      GDPR-article validity (every `gdpr_article` is a member of the shipped
 *      `VALID_GDPR_ARTICLES`), AI-Act risk-tier/category validity (against the
 *      shipped `RISK_TIER_TABLE` + emittable risk classes), and presence of the
 *      drift-mitigation fields `skill_version` + `coverage_gaps`.
 *
 * The JS-ASSERTED CONTRACT is the classification triple + GDPR-article
 * membership. Agent-level `finding.kind` values (missing-inventory,
 * missing-consent-banner, prohibited-use-detected, …) are produced by the agent
 * prose + skill layer, NOT by any shipped JS export, so they live in the manifest
 * as tracked metadata and are covered by fixtures + manual review — per the
 * parent EC6 "coverage scoped to JS files" decision. This keeps the test honest:
 * it asserts only what the JS actually produces.
 *
 * Data fixtures (`sample-*.js`) are read as TEXT only — never `require`d — so no
 * fixture code executes in the test process.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  classifyFromPlanText,
  RISK_TIER_TABLE,
} = require('../src/lib/eu-ai-act-helpers.js');
const {
  mapPiiFieldToArticles,
  VALID_GDPR_ARTICLES,
} = require('../src/lib/gdpr-helpers.js');
const { parseYaml } = require('../src/lib/budget.js');

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'compliance');
const MANIFEST_NAME = 'fixture-manifest.yaml';

// The full set of risk classes the shipped classifier can emit.
const EMITTABLE_RISK_CLASSES = new Set([
  'high-risk',
  'prohibited',
  'limited-risk',
  'gpai',
  'unknown',
]);

/** Read a fixture file as UTF-8 text, cross-platform, asserting non-empty. */
function loadFixture(name) {
  const p = path.join(FIXTURE_DIR, name);
  assert.ok(fs.existsSync(p), `fixture must exist on disk: ${name}`);
  const text = fs.readFileSync(p, 'utf8');
  assert.ok(
    typeof text === 'string' && text.trim().length > 0,
    `fixture must be non-empty: ${name}`
  );
  return text;
}

/** Parse the shared manifest, asserting it is a real object. */
function loadManifest() {
  const raw = loadFixture(MANIFEST_NAME);
  const manifest = parseYaml(raw);
  assert.ok(
    manifest && typeof manifest === 'object' && !Array.isArray(manifest),
    'manifest must parse to an object'
  );
  assert.ok(
    manifest.fixtures && typeof manifest.fixtures === 'object',
    'manifest must have a fixtures: map'
  );
  return manifest;
}

test('fixture-driven classification — Annex III plan (real file → shipped classifier)', () => {
  const body = loadFixture('annex-iii-ai-plan.md');
  const result = classifyFromPlanText(body);
  assert.deepStrictEqual(result, {
    risk_class: 'high-risk',
    annex_iii_category: '4-employment',
    confidence: 'medium',
  });
});

test('fixture-driven classification — prohibited plan (real file → shipped classifier)', () => {
  const body = loadFixture('prohibited-practice-plan.md');
  const result = classifyFromPlanText(body);
  assert.strictEqual(result.risk_class, 'prohibited');
  assert.strictEqual(result.annex_iii_category, null);
  assert.strictEqual(result.confidence, 'high');
});

test('every plan fixture classification matches the manifest (real file → shipped classifier)', () => {
  const manifest = loadManifest();
  let checked = 0;
  for (const [name, meta] of Object.entries(manifest.fixtures)) {
    if (meta.regime !== 'eu-ai-act') continue;
    if (!name.endsWith('.md')) continue; // classify only plan fixtures, not code fixtures
    const body = loadFixture(name);
    const result = classifyFromPlanText(body);
    assert.strictEqual(
      result.risk_class,
      meta.expected_risk_class,
      `${name}: risk_class from shipped classifier must match manifest`
    );
    const expectedCat =
      meta.expected_annex_iii_category === undefined
        ? null
        : meta.expected_annex_iii_category;
    assert.strictEqual(
      result.annex_iii_category,
      expectedCat,
      `${name}: annex_iii_category from shipped classifier must match manifest`
    );
    assert.strictEqual(
      result.confidence,
      meta.expected_confidence,
      `${name}: confidence from shipped classifier must match manifest`
    );
    checked += 1;
  }
  assert.ok(checked >= 2, 'at least the two AI-Act plan fixtures must be classified');
});

test('fixture-driven GDPR field mapping — PII fields are real triggers in VALID_GDPR_ARTICLES', () => {
  const manifest = loadManifest();
  const gdprFixtures = Object.entries(manifest.fixtures).filter(
    ([, meta]) => meta.regime === 'gdpr'
  );
  assert.ok(gdprFixtures.length >= 1, 'at least one GDPR fixture must be declared');

  let fieldsChecked = 0;
  for (const [name, meta] of gdprFixtures) {
    if (!Array.isArray(meta.pii_fields)) continue;
    for (const field of meta.pii_fields) {
      const articles = mapPiiFieldToArticles(field);
      assert.ok(
        Array.isArray(articles) && articles.length > 0,
        `${name}: PII field "${field}" must map to a non-empty article list`
      );
      for (const article of articles) {
        assert.ok(
          VALID_GDPR_ARTICLES.has(article),
          `${name}: field "${field}" mapped to unknown article "${article}"`
        );
      }
      fieldsChecked += 1;
    }
  }
  assert.ok(fieldsChecked >= 1, 'at least one PII field must be validated');
});

test('manifest completeness — bi-directional fixture/manifest correspondence', () => {
  const manifest = loadManifest();
  // This shared manifest owns the FLAT file set directly under compliance/.
  // Subdirectories are separate fixture groups (e.g. recommender/) that carry
  // their own manifest, so they are excluded here — only files are in scope.
  const onDisk = fs
    .readdirSync(FIXTURE_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name !== MANIFEST_NAME)
    .map((e) => e.name);

  // Every physical fixture appears as a manifest key.
  for (const f of onDisk) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(manifest.fixtures, f),
      `on-disk fixture "${f}" must appear in the manifest`
    );
  }
  // Every manifest key exists on disk.
  for (const key of Object.keys(manifest.fixtures)) {
    assert.ok(
      fs.existsSync(path.join(FIXTURE_DIR, key)),
      `manifest fixture "${key}" must exist on disk`
    );
  }
});

test('manifest validity — every GDPR finding-kind references a real article', () => {
  const manifest = loadManifest();
  let articlesChecked = 0;
  for (const [name, meta] of Object.entries(manifest.fixtures)) {
    if (meta.regime !== 'gdpr') continue;
    if (!meta.finding_kinds || typeof meta.finding_kinds !== 'object') continue;
    for (const [kind, detail] of Object.entries(meta.finding_kinds)) {
      if (!detail || typeof detail !== 'object') continue;
      if (detail.gdpr_article === undefined) continue;
      assert.ok(
        VALID_GDPR_ARTICLES.has(detail.gdpr_article),
        `${name}: finding-kind "${kind}" references unknown gdpr_article "${detail.gdpr_article}"`
      );
      articlesChecked += 1;
    }
  }
  assert.ok(articlesChecked >= 1, 'at least one GDPR finding-kind article must be validated');
});

test('manifest validity — AI-Act classifications reference real risk tiers/categories', () => {
  const manifest = loadManifest();
  let checked = 0;
  for (const [name, meta] of Object.entries(manifest.fixtures)) {
    if (meta.regime !== 'eu-ai-act') continue;
    if (meta.expected_risk_class === undefined) continue;
    assert.ok(
      EMITTABLE_RISK_CLASSES.has(meta.expected_risk_class),
      `${name}: expected_risk_class "${meta.expected_risk_class}" is not emittable`
    );
    const cat =
      meta.expected_annex_iii_category === undefined
        ? null
        : meta.expected_annex_iii_category;
    if (cat !== null) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(RISK_TIER_TABLE, cat),
        `${name}: annex_iii_category "${cat}" is not a key of RISK_TIER_TABLE`
      );
    }
    checked += 1;
  }
  assert.ok(checked >= 2, 'at least the two AI-Act classifications must be validated');
});

test('manifest has skill_version and coverage_gaps (drift mitigation, not hidden)', () => {
  const manifest = loadManifest();
  assert.ok(
    typeof manifest.skill_version === 'string' && manifest.skill_version.length > 0,
    'manifest must declare a non-empty skill_version'
  );
  assert.ok(
    manifest.coverage_gaps && typeof manifest.coverage_gaps === 'object',
    'manifest must declare a coverage_gaps section'
  );
  assert.ok(
    Object.keys(manifest.coverage_gaps).length > 0,
    'coverage_gaps must be non-empty'
  );
});

test('data fixtures are loadable + non-empty (read as text, never required)', () => {
  const piiCode = loadFixture('sample-pii-code.js');
  const aiCode = loadFixture('sample-ai-act-code.js');
  assert.ok(piiCode.length > 0, 'sample-pii-code.js must be non-empty');
  assert.ok(aiCode.length > 0, 'sample-ai-act-code.js must be non-empty');
});

test('prohibited fixture is scoped — no over-trigger into an Annex III category', () => {
  const body = loadFixture('prohibited-practice-plan.md');
  const result = classifyFromPlanText(body);
  // Prohibited wins over Annex III by legal precedence; the fixture must
  // trigger exactly the prohibited outcome, not also an Annex III category.
  assert.strictEqual(result.risk_class, 'prohibited');
  assert.strictEqual(result.annex_iii_category, null);
});
