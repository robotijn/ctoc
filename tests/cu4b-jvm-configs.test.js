'use strict';

// CU4b s3 — content-contract test for the two java quality-config guides.
// ZERO TEST DOUBLES: reads the REAL files off disk via fs.readFileSync and
// asserts substance (section count, required sections, Java identifiers, code
// fences, a dated http source, cross-language guard, strictness gradient).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', 'skills', 'quality-configs', 'java');

/** Read a real config file off disk. No mock, no fixture. */
function readConfig(name) {
  return fs.readFileSync(path.join(ROOT, `${name}.md`), 'utf8');
}

/** Count top-level "## " section headings. */
function countSections(src) {
  return (src.match(/^##\s+/gm) || []).length;
}

/** Count fenced code blocks (``` openers, halved). */
function countFences(src) {
  return Math.floor((src.match(/^```/gm) || []).length / 2);
}

const FILES = ['legacy', 'strictest'];

for (const name of FILES) {
  test(`java/${name}.md — has more than 5 sections (proves real additions)`, () => {
    const src = readConfig(name);
    const n = countSections(src);
    assert.ok(n > 5, `expected > 5 "##" sections, got ${n}`);
  });

  test(`java/${name}.md — is more than 90 lines`, () => {
    const src = readConfig(name);
    const lines = src.split('\n').length;
    assert.ok(lines > 90, `expected > 90 lines, got ${lines}`);
  });

  test(`java/${name}.md — covers Checkstyle, SpotBugs, PMD, JaCoCo, Maven/Gradle, Coverage, Complexity, Commands/CI`, () => {
    const src = readConfig(name);
    const required = [
      /checkstyle/i,
      /spotbugs/i,
      /\bpmd\b/i,
      /jacoco/i,
      /\b(maven|gradle)\b/i,
      /coverage/i,
      /complexity/i,
      /(command|\bci\b|github\s+actions)/i,
    ];
    for (const re of required) {
      assert.match(src, re, `java/${name}.md missing required topic ${re}`);
    }
  });

  test(`java/${name}.md — names Java quality-gate identifiers`, () => {
    const src = readConfig(name);
    const identifiers = [
      /Checkstyle/,
      /SpotBugs/,
      /PMD/,
      /JaCoCo/,
      /(CyclomaticComplexity|MethodLength|NestedIfDepth|NPathComplexity)/,
      /(-Xlint|maven-checkstyle-plugin|jacoco-maven-plugin|spotbugs-maven-plugin|maven-pmd-plugin)/,
    ];
    for (const re of identifiers) {
      assert.match(src, re, `java/${name}.md missing identifier ${re}`);
    }
  });

  test(`java/${name}.md — has at least 4 code fences`, () => {
    const src = readConfig(name);
    const fences = countFences(src);
    assert.ok(fences >= 4, `expected >= 4 code fences, got ${fences}`);
  });

  test(`java/${name}.md — carries at least one dated http source (>= 2025)`, () => {
    const src = readConfig(name);
    assert.match(src, /https?:\/\//, 'no http(s) URL found');
    assert.match(src, /20(2[5-9]|[3-9]\d)/, 'no dated year token >= 2025 found');
  });

  test(`java/${name}.md — cross-language guard: no Kotlin/Scala signature tokens`, () => {
    const src = readConfig(name);
    const forbidden = [/detekt/i, /ktlint/i, /build\.gradle\.kts/i, /scalafmt/i, /scalastyle/i];
    for (const re of forbidden) {
      assert.doesNotMatch(src, re, `java/${name}.md leaked a non-Java token ${re}`);
    }
  });
}

test('java/strictest.md — gradient: 90% coverage and a tight limit', () => {
  const src = readConfig('strictest');
  assert.match(src, /90%/, 'strictest must state 90% coverage');
  assert.match(src, /(max="7"|value="7"|MethodLength|max="30"|value="30")/, 'strictest must carry a tight complexity limit');
});

test('java/legacy.md — gradient: 50% coverage and warning severity', () => {
  const src = readConfig('legacy');
  assert.match(src, /50%/, 'legacy must state 50% coverage');
  assert.match(src, /severity/i, 'legacy must mention severity');
  assert.match(src, /warning/i, 'legacy must set severity warning');
});
