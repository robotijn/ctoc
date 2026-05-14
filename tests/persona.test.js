/**
 * Persona-aware question routing tests (v8.3)
 *
 * Verifies the core promise: a programmer never sees pricing questions;
 * a founder never sees tech-stack questions.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

let originalCwd;
let tmpDir;

function load() {
  const p = require.resolve('../src/lib/persona');
  delete require.cache[p];
  return require('../src/lib/persona');
}

function setup() {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-persona-'));
  process.chdir(tmpDir);
  // copy the question catalog from the real repo
  fs.mkdirSync('.ctoc/templates', { recursive: true });
  fs.mkdirSync('.ctoc/session', { recursive: true });
  fs.mkdirSync('.ctoc/inbox/questions', { recursive: true });
  fs.copyFileSync(
    path.join(originalCwd, '.ctoc/templates/questions.yaml'),
    path.join(tmpDir, '.ctoc/templates/questions.yaml')
  );
}

function teardown() {
  process.chdir(originalCwd);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}

describe('persona — classification from text', () => {
  it('classifies clear founder signals as founder', () => {
    setup();
    const { classifyFromText } = load();
    const result = classifyFromText("I'm starting a SaaS for managing freelance invoices. Thinking about pricing tiers.");
    assert.equal(result.primary, 'founder');
    assert.ok(['high', 'medium'].includes(result.confidence));
    teardown();
  });

  it('classifies clear programmer signals as programmer', () => {
    setup();
    const { classifyFromText } = load();
    const result = classifyFromText("Refactor the auth middleware to use TypeScript strict mode. Need to fix the failing tests.");
    assert.equal(result.primary, 'programmer');
    teardown();
  });

  it('classifies architect signals as architect', () => {
    setup();
    const { classifyFromText } = load();
    const result = classifyFromText("Working on the system design — should we use microservices or monolith? Need to think about scalability.");
    assert.equal(result.primary, 'architect');
    teardown();
  });

  it('returns null when no signals match', () => {
    setup();
    const { classifyFromText } = load();
    const result = classifyFromText("hello world");
    assert.equal(result, null);
    teardown();
  });
});

describe('persona — save and load', () => {
  it('round-trips primary + confidence', () => {
    setup();
    const { savePersona, loadPersona } = load();
    savePersona({ primary: 'founder', confidence: 'high', signals: ["starting a SaaS"] });
    const loaded = loadPersona();
    assert.equal(loaded.primary, 'founder');
    assert.equal(loaded.confidence, 'high');
    teardown();
  });

  it('returns null when no persona file exists', () => {
    setup();
    const { loadPersona } = load();
    assert.equal(loadPersona(), null);
    teardown();
  });
});

describe('persona — routing (the core promise)', () => {
  it('founder is NOT asked tech-stack questions', () => {
    setup();
    const { getApplicableQuestions } = load();
    const persona = { primary: 'founder', secondary: [], confidence: 'high' };
    const questions = getApplicableQuestions({ phase: 'implementation', persona });
    const ids = questions.map(q => q.id);
    assert.ok(!ids.includes('implementation/tech-stack'), 'founder must NOT be asked tech-stack');
    assert.ok(!ids.includes('implementation/db-schema'), 'founder must NOT be asked db-schema');
    assert.ok(!ids.includes('implementation/multi-tenancy'), 'founder must NOT be asked multi-tenancy');
    teardown();
  });

  it('programmer is NOT asked pricing questions', () => {
    setup();
    const { getApplicableQuestions } = load();
    const persona = { primary: 'programmer', secondary: [], confidence: 'high' };
    const questions = getApplicableQuestions({ phase: 'canvas', persona });
    const ids = questions.map(q => q.id);
    assert.ok(!ids.includes('canvas/pricing-model'), 'programmer must NOT be asked pricing');
    assert.ok(!ids.includes('canvas/business-model'), 'programmer must NOT be asked business model');
    assert.ok(!ids.includes('canvas/target-ltv'), 'programmer must NOT be asked LTV');
    assert.ok(!ids.includes('canvas/cac-payback'), 'programmer must NOT be asked CAC');
    teardown();
  });

  it('architect is NOT asked pricing/market questions', () => {
    setup();
    const { getApplicableQuestions } = load();
    const persona = { primary: 'architect', secondary: [], confidence: 'high' };
    const questions = getApplicableQuestions({ phase: 'canvas', persona });
    const ids = questions.map(q => q.id);
    assert.ok(!ids.includes('canvas/pricing-model'));
    assert.ok(!ids.includes('canvas/competitors'));
    teardown();
  });

  it('technical-founder gets BOTH business AND tech questions', () => {
    setup();
    const { getApplicableQuestions } = load();
    const persona = { primary: 'technical-founder', secondary: [], confidence: 'high' };
    const canvasQs = getApplicableQuestions({ phase: 'canvas', persona }).map(q => q.id);
    const implQs = getApplicableQuestions({ phase: 'implementation', persona }).map(q => q.id);
    assert.ok(canvasQs.includes('canvas/pricing-model'), 'technical-founder gets pricing');
    assert.ok(implQs.includes('implementation/tech-stack'), 'technical-founder gets tech-stack');
    teardown();
  });

  it('designer is asked UX/a11y questions but not pricing/tech-stack', () => {
    setup();
    const { getApplicableQuestions } = load();
    const persona = { primary: 'designer', secondary: [], confidence: 'high' };
    const canvasQs = getApplicableQuestions({ phase: 'canvas', persona }).map(q => q.id);
    const implQs = getApplicableQuestions({ phase: 'implementation', persona }).map(q => q.id);
    const functionalQs = getApplicableQuestions({ phase: 'functional', persona }).map(q => q.id);
    assert.ok(!canvasQs.includes('canvas/pricing-model'), 'designer not asked pricing');
    assert.ok(!implQs.includes('implementation/tech-stack'), 'designer not asked tech-stack');
    assert.ok(functionalQs.includes('functional/user-flow'), 'designer asked UX flow');
    teardown();
  });
});

describe('persona — answer persistence', () => {
  it('never re-asks an answered question', () => {
    setup();
    const { recordAnswer, isAnswered, getApplicableQuestions } = load();
    const persona = { primary: 'founder', secondary: [], confidence: 'high' };

    // Initially the founder gets vision/problem
    const before = getApplicableQuestions({ phase: 'vision', persona }).map(q => q.id);
    assert.ok(before.includes('vision/problem'));

    // After answering, no longer in the list
    recordAnswer('vision/problem', 'We help freelancers track invoices');
    assert.equal(isAnswered('vision/problem'), true);
    const after = getApplicableQuestions({ phase: 'vision', persona }).map(q => q.id);
    assert.ok(!after.includes('vision/problem'), 'answered question should not be re-asked');
    teardown();
  });
});

describe('persona — deferral to inbox', () => {
  it('writes deferred question to inbox/questions/', () => {
    setup();
    const { deferQuestion, listDeferredQuestions } = load();
    deferQuestion('canvas/pricing-model', {
      awaitsPersona: 'founder',
      reason: 'current persona is programmer',
    });
    const deferred = listDeferredQuestions({ awaitsPersona: 'founder' });
    assert.equal(deferred.length, 1);
    assert.equal(deferred[0].question_id, 'canvas/pricing-model');
    teardown();
  });

  it('lists deferred questions filtered by awaits_persona', () => {
    setup();
    const { deferQuestion, listDeferredQuestions } = load();
    deferQuestion('canvas/pricing-model', { awaitsPersona: 'founder' });
    deferQuestion('implementation/tech-stack', { awaitsPersona: 'programmer' });
    const forFounder = listDeferredQuestions({ awaitsPersona: 'founder' });
    const forProgrammer = listDeferredQuestions({ awaitsPersona: 'programmer' });
    assert.equal(forFounder.length, 1);
    assert.equal(forProgrammer.length, 1);
    teardown();
  });
});

describe('persona — known persona profiles', () => {
  it('every known persona has can_answer and cannot_answer', () => {
    setup();
    const { KNOWN_PERSONAS } = load();
    for (const [role, profile] of Object.entries(KNOWN_PERSONAS)) {
      assert.ok(Array.isArray(profile.can_answer), `${role} missing can_answer`);
      assert.ok(Array.isArray(profile.cannot_answer), `${role} missing cannot_answer`);
    }
    teardown();
  });

  it('technical-founder can answer everything', () => {
    setup();
    const { KNOWN_PERSONAS } = load();
    assert.ok(KNOWN_PERSONAS['technical-founder'].can_answer.includes('*'));
    assert.equal(KNOWN_PERSONAS['technical-founder'].cannot_answer.length, 0);
    teardown();
  });

  it('founder cannot answer tech_stack', () => {
    setup();
    const { KNOWN_PERSONAS } = load();
    assert.ok(KNOWN_PERSONAS.founder.cannot_answer.includes('tech_stack'));
    teardown();
  });

  it('programmer cannot answer pricing', () => {
    setup();
    const { KNOWN_PERSONAS } = load();
    assert.ok(KNOWN_PERSONAS.programmer.cannot_answer.includes('pricing'));
    teardown();
  });
});
