'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CANONICAL = path.join(ROOT, '.ctoc', 'ask-me-questions.md');
const SKILL = path.join(ROOT, 'skills', 'ask-me-questions', 'SKILL.md');

test('ask-me-questions skill file exists at the standard plugin-skill location', () => {
  assert.ok(fs.existsSync(SKILL), `expected shipped skill at ${SKILL}`);
});

test('shipped SKILL.md is byte-identical to the canonical .ctoc/ask-me-questions.md', () => {
  // Bind the shipped skill to the canonical source so they can never drift.
  const canonicalContent = fs.readFileSync(CANONICAL, 'utf8');
  const skillContent = fs.readFileSync(SKILL, 'utf8');
  assert.equal(skillContent, canonicalContent);
});

test('shipped SKILL.md frontmatter has name: ask-me-questions and a non-empty description', () => {
  const skillContent = fs.readFileSync(SKILL, 'utf8');
  assert.match(skillContent, /^name:\s*ask-me-questions\s*$/m);
  const descMatch = skillContent.match(/^description:\s*(.+)$/m);
  assert.ok(descMatch, 'expected a description: line in frontmatter');
  assert.ok(descMatch[1].trim().length > 0, 'description: must be non-empty');
});
