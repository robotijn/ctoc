/**
 * Skill Loader Tests
 * Tests for lib/skill-loader.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Import the module under test
const skillLoader = require('../lib/skill-loader');

// Test constants
const PLUGIN_DIR = path.join(__dirname, '..');
const EMBEDDED_SKILLS_DIR = path.join(PLUGIN_DIR, 'skills');
const TEST_CACHE_DIR = skillLoader.CACHE_DIR;

// Helper function to check if test environment has embedded skills
function hasEmbeddedSkills() {
  return fs.existsSync(path.join(EMBEDDED_SKILLS_DIR, 'languages'));
}

// ============================================================================
// loadEmbeddedSkill Tests
// ============================================================================

function testLoadEmbeddedSkill_Language() {
  if (!hasEmbeddedSkills()) {
    console.log('# SKIP loadEmbeddedSkill language (no embedded skills)');
    return;
  }

  const content = skillLoader.loadEmbeddedSkill('python', 'language');
  assert.ok(content, 'Should load python skill');
  assert.ok(content.includes('Python'), 'Content should mention Python');
  console.log('# loadEmbeddedSkill loads language skill');
}

function testLoadEmbeddedSkill_Framework() {
  if (!hasEmbeddedSkills()) {
    console.log('# SKIP loadEmbeddedSkill framework (no embedded skills)');
    return;
  }

  const content = skillLoader.loadEmbeddedSkill('react', 'framework', 'web');
  assert.ok(content, 'Should load react skill');
  assert.ok(content.includes('React') || content.includes('react'), 'Content should mention React');
  console.log('# loadEmbeddedSkill loads framework skill with category');
}

function testLoadEmbeddedSkill_MissingLanguage() {
  const content = skillLoader.loadEmbeddedSkill('nonexistent-language-xyz', 'language');
  assert.strictEqual(content, null, 'Should return null for missing language');
  console.log('# loadEmbeddedSkill returns null for missing language');
}

function testLoadEmbeddedSkill_FrameworkWithoutCategory() {
  const content = skillLoader.loadEmbeddedSkill('react', 'framework');
  assert.strictEqual(content, null, 'Should return null for framework without category');
  console.log('# loadEmbeddedSkill returns null for framework without category');
}

function testLoadEmbeddedSkill_InvalidType() {
  const content = skillLoader.loadEmbeddedSkill('python', 'invalid-type');
  assert.strictEqual(content, null, 'Should return null for invalid type');
  console.log('# loadEmbeddedSkill returns null for invalid type');
}

// ============================================================================
// loadSkillsIndex Tests
// ============================================================================

async function testLoadSkillsIndex() {
  const index = await skillLoader.loadSkillsIndex();

  assert.ok(index, 'Index should exist');
  assert.ok(Array.isArray(index.languages), 'Should have languages array');
  assert.ok(Array.isArray(index.frameworks), 'Should have frameworks array');
  assert.ok(index.languages.length > 0, 'Should have at least one language');
  assert.ok(index.frameworks.length > 0, 'Should have at least one framework');

  // Check structure
  const lang = index.languages[0];
  assert.ok(lang.name, 'Language should have name');
  assert.ok(lang.file, 'Language should have file');

  const framework = index.frameworks[0];
  assert.ok(framework.name, 'Framework should have name');
  assert.ok(framework.category, 'Framework should have category');
  assert.ok(framework.file, 'Framework should have file');

  console.log('# loadSkillsIndex loads valid index');
}

async function testLoadSkillsIndex_HasPython() {
  const index = await skillLoader.loadSkillsIndex();
  const python = index.languages.find(l => l.name === 'python');

  assert.ok(python, 'Should have Python in index');
  assert.strictEqual(python.file, 'python.md', 'Python file should be python.md');
  console.log('# loadSkillsIndex contains python');
}

async function testLoadSkillsIndex_HasReact() {
  const index = await skillLoader.loadSkillsIndex();
  const react = index.frameworks.find(f => f.name === 'react');

  assert.ok(react, 'Should have React in index');
  assert.strictEqual(react.category, 'web', 'React should be in web category');
  console.log('# loadSkillsIndex contains react framework');
}

// ============================================================================
// loadSkill Tests
// ============================================================================

async function testLoadSkill_Language() {
  if (!hasEmbeddedSkills()) {
    console.log('# SKIP loadSkill language (no embedded skills)');
    return;
  }

  const content = await skillLoader.loadSkill('python', 'language');
  assert.ok(content, 'Should load python skill');
  assert.ok(typeof content === 'string', 'Content should be a string');
  assert.ok(content.length > 100, 'Content should have substantial length');
  console.log('# loadSkill loads language skill');
}

async function testLoadSkill_Framework() {
  if (!hasEmbeddedSkills()) {
    console.log('# SKIP loadSkill framework (no embedded skills)');
    return;
  }

  const content = await skillLoader.loadSkill('react', 'framework');
  assert.ok(content, 'Should load react skill');
  assert.ok(typeof content === 'string', 'Content should be a string');
  console.log('# loadSkill loads framework skill');
}

async function testLoadSkill_DefaultsToLanguage() {
  if (!hasEmbeddedSkills()) {
    console.log('# SKIP loadSkill default type (no embedded skills)');
    return;
  }

  const content = await skillLoader.loadSkill('javascript');
  assert.ok(content, 'Should load javascript skill with default type');
  console.log('# loadSkill defaults to language type');
}

async function testLoadSkill_InvalidLanguage() {
  try {
    await skillLoader.loadSkill('nonexistent-lang-xyz-123', 'language');
    assert.fail('Should throw for invalid language');
  } catch (e) {
    assert.ok(e.message.includes('Failed to load skill'), 'Should throw meaningful error');
    console.log('# loadSkill throws for invalid language');
  }
}

async function testLoadSkill_InvalidFramework() {
  try {
    await skillLoader.loadSkill('nonexistent-framework-xyz', 'framework');
    assert.fail('Should throw for invalid framework');
  } catch (e) {
    assert.ok(e.message.includes('not found'), 'Should indicate framework not found');
    console.log('# loadSkill throws for invalid framework');
  }
}

// ============================================================================
// hasSkill Tests
// ============================================================================

async function testHasSkill_ExistingLanguage() {
  const exists = await skillLoader.hasSkill('python', 'language');
  assert.strictEqual(exists, true, 'Python should exist');
  console.log('# hasSkill returns true for existing language');
}

async function testHasSkill_ExistingFramework() {
  const exists = await skillLoader.hasSkill('react', 'framework');
  assert.strictEqual(exists, true, 'React should exist');
  console.log('# hasSkill returns true for existing framework');
}

async function testHasSkill_NonexistentLanguage() {
  const exists = await skillLoader.hasSkill('nonexistent-lang-xyz-abc', 'language');
  assert.strictEqual(exists, false, 'Nonexistent language should not exist');
  console.log('# hasSkill returns false for nonexistent language');
}

async function testHasSkill_NonexistentFramework() {
  const exists = await skillLoader.hasSkill('nonexistent-fw-xyz', 'framework');
  assert.strictEqual(exists, false, 'Nonexistent framework should not exist');
  console.log('# hasSkill returns false for nonexistent framework');
}

async function testHasSkill_DefaultsToLanguage() {
  const exists = await skillLoader.hasSkill('javascript');
  assert.strictEqual(exists, true, 'JavaScript should exist with default type');
  console.log('# hasSkill defaults to language type');
}

// ============================================================================
// listSkills Tests
// ============================================================================

async function testListSkills() {
  const list = await skillLoader.listSkills();

  assert.ok(list, 'List should exist');
  assert.ok(Array.isArray(list.languages), 'Should have languages array');
  assert.ok(Array.isArray(list.frameworks), 'Should have frameworks array');
  assert.ok(list.counts, 'Should have counts');

  console.log('# listSkills returns valid structure');
}

async function testListSkills_HasCounts() {
  const list = await skillLoader.listSkills();

  assert.ok(list.counts.languages > 0, 'Should have language count');
  assert.ok(list.counts.frameworks, 'Should have framework counts');
  assert.ok(list.counts.total > 0, 'Should have total count');

  console.log('# listSkills includes counts');
}

// ============================================================================
// getEmbeddedSkillsCounts Tests
// ============================================================================

function testGetEmbeddedSkillsCounts() {
  const counts = skillLoader.getEmbeddedSkillsCounts();

  assert.ok(typeof counts.languages === 'number', 'Languages count should be number');
  assert.ok(typeof counts.frameworks === 'object', 'Frameworks should be object');
  assert.ok(typeof counts.frameworks.total === 'number', 'Frameworks total should be number');

  console.log('# getEmbeddedSkillsCounts returns valid structure');
}

function testGetEmbeddedSkillsCounts_HasCategories() {
  const counts = skillLoader.getEmbeddedSkillsCounts();

  const expectedCategories = ['web', 'ai-ml', 'data', 'devops', 'mobile'];
  for (const cat of expectedCategories) {
    assert.ok(typeof counts.frameworks[cat] === 'number', `Should have ${cat} category count`);
  }

  console.log('# getEmbeddedSkillsCounts has all framework categories');
}

function testGetEmbeddedSkillsCounts_NonZeroIfEmbedded() {
  if (!hasEmbeddedSkills()) {
    console.log('# SKIP getEmbeddedSkillsCounts values (no embedded skills)');
    return;
  }

  const counts = skillLoader.getEmbeddedSkillsCounts();
  assert.ok(counts.languages > 0, 'Should count embedded languages');
  assert.ok(counts.frameworks.total > 0, 'Should count embedded frameworks');

  console.log('# getEmbeddedSkillsCounts finds embedded skills');
}

// ============================================================================
// getSkillsForStack Tests
// ============================================================================

async function testGetSkillsForStack_WithLanguage() {
  if (!hasEmbeddedSkills()) {
    console.log('# SKIP getSkillsForStack with language (no embedded skills)');
    return;
  }

  const stack = {
    primary: {
      language: 'python',
      framework: null
    }
  };

  const skills = await skillLoader.getSkillsForStack(stack);

  assert.ok(Array.isArray(skills), 'Should return array');
  assert.ok(skills.length >= 1, 'Should have at least language skill');

  const langSkill = skills.find(s => s.type === 'language');
  assert.ok(langSkill, 'Should have language skill');
  assert.strictEqual(langSkill.name, 'python', 'Language should be python');
  assert.ok(langSkill.content, 'Should have content');

  console.log('# getSkillsForStack loads language skill');
}

async function testGetSkillsForStack_WithFramework() {
  if (!hasEmbeddedSkills()) {
    console.log('# SKIP getSkillsForStack with framework (no embedded skills)');
    return;
  }

  const stack = {
    primary: {
      language: 'javascript',
      framework: 'react'
    }
  };

  const skills = await skillLoader.getSkillsForStack(stack);

  assert.ok(skills.length >= 2, 'Should have both language and framework skills');

  const langSkill = skills.find(s => s.type === 'language');
  const fwSkill = skills.find(s => s.type === 'framework');

  assert.ok(langSkill, 'Should have language skill');
  assert.ok(fwSkill, 'Should have framework skill');
  assert.strictEqual(fwSkill.name, 'react', 'Framework should be react');

  console.log('# getSkillsForStack loads both language and framework skills');
}

async function testGetSkillsForStack_EmptyStack() {
  const stack = {
    primary: {
      language: null,
      framework: null
    }
  };

  const skills = await skillLoader.getSkillsForStack(stack);

  assert.ok(Array.isArray(skills), 'Should return array');
  assert.strictEqual(skills.length, 0, 'Should return empty array');

  console.log('# getSkillsForStack returns empty array for empty stack');
}

async function testGetSkillsForStack_InvalidLanguage() {
  const stack = {
    primary: {
      language: 'nonexistent-xyz-lang',
      framework: null
    }
  };

  const skills = await skillLoader.getSkillsForStack(stack);

  assert.ok(Array.isArray(skills), 'Should return array');
  // Should gracefully handle missing skill

  console.log('# getSkillsForStack handles invalid language gracefully');
}

// ============================================================================
// clearCache Tests
// ============================================================================

function testClearCache() {
  // Create a test cache entry
  const testCacheKey = 'test-skill-loader-cache';
  const cachePath = path.join(TEST_CACHE_DIR, testCacheKey + '.json');

  // Ensure cache dir exists
  if (!fs.existsSync(TEST_CACHE_DIR)) {
    fs.mkdirSync(TEST_CACHE_DIR, { recursive: true });
  }

  // Write test cache file
  fs.writeFileSync(cachePath, JSON.stringify({ timestamp: Date.now(), content: 'test' }));
  assert.ok(fs.existsSync(cachePath), 'Test cache file should exist before clear');

  // Clear cache
  skillLoader.clearCache();

  // Verify cleared
  assert.ok(!fs.existsSync(cachePath), 'Test cache file should be cleared');

  console.log('# clearCache removes cache files');
}

// ============================================================================
// Exports Tests
// ============================================================================

function testExports() {
  assert.ok(typeof skillLoader.loadSkillsIndex === 'function', 'loadSkillsIndex should be exported');
  assert.ok(typeof skillLoader.loadSkill === 'function', 'loadSkill should be exported');
  assert.ok(typeof skillLoader.loadEmbeddedSkill === 'function', 'loadEmbeddedSkill should be exported');
  assert.ok(typeof skillLoader.hasSkill === 'function', 'hasSkill should be exported');
  assert.ok(typeof skillLoader.getSkillsForStack === 'function', 'getSkillsForStack should be exported');
  assert.ok(typeof skillLoader.listSkills === 'function', 'listSkills should be exported');
  assert.ok(typeof skillLoader.getEmbeddedSkillsCounts === 'function', 'getEmbeddedSkillsCounts should be exported');
  assert.ok(typeof skillLoader.clearCache === 'function', 'clearCache should be exported');
  assert.ok(skillLoader.CACHE_DIR, 'CACHE_DIR should be exported');
  assert.ok(skillLoader.EMBEDDED_SKILLS_DIR, 'EMBEDDED_SKILLS_DIR should be exported');

  console.log('# All expected functions are exported');
}

function testExportedConstants() {
  assert.ok(skillLoader.CACHE_DIR.includes('.ctoc'), 'CACHE_DIR should be in .ctoc');
  assert.ok(skillLoader.CACHE_DIR.includes('cache'), 'CACHE_DIR should include cache');
  assert.ok(skillLoader.EMBEDDED_SKILLS_DIR.includes('skills'), 'EMBEDDED_SKILLS_DIR should include skills');

  console.log('# Exported constants have expected values');
}

// ============================================================================
// Test Runner
// ============================================================================

async function runTests() {
  console.log('\nSkill Loader Tests\n');

  // Synchronous tests
  testExports();
  testExportedConstants();
  testLoadEmbeddedSkill_Language();
  testLoadEmbeddedSkill_Framework();
  testLoadEmbeddedSkill_MissingLanguage();
  testLoadEmbeddedSkill_FrameworkWithoutCategory();
  testLoadEmbeddedSkill_InvalidType();
  testGetEmbeddedSkillsCounts();
  testGetEmbeddedSkillsCounts_HasCategories();
  testGetEmbeddedSkillsCounts_NonZeroIfEmbedded();
  testClearCache();

  // Async tests
  await testLoadSkillsIndex();
  await testLoadSkillsIndex_HasPython();
  await testLoadSkillsIndex_HasReact();
  await testLoadSkill_Language();
  await testLoadSkill_Framework();
  await testLoadSkill_DefaultsToLanguage();
  await testLoadSkill_InvalidLanguage();
  await testLoadSkill_InvalidFramework();
  await testHasSkill_ExistingLanguage();
  await testHasSkill_ExistingFramework();
  await testHasSkill_NonexistentLanguage();
  await testHasSkill_NonexistentFramework();
  await testHasSkill_DefaultsToLanguage();
  await testListSkills();
  await testListSkills_HasCounts();
  await testGetSkillsForStack_WithLanguage();
  await testGetSkillsForStack_WithFramework();
  await testGetSkillsForStack_EmptyStack();
  await testGetSkillsForStack_InvalidLanguage();

  console.log('\nAll skill loader tests passed!\n');
}

// Node.js test runner compatibility
const { test } = require('node:test');

test('Skill Loader Tests', async () => {
  await runTests();
});
