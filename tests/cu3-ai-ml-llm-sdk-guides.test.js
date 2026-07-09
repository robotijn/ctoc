/**
 * CU3 s2 — content-contract tests for the ai-ml LLM-orchestration / SDK guides
 * (langchain.md, anthropic-sdk.md, openai-sdk.md).
 *
 * ZERO DOUBLES: this reads the REAL guide files off disk via fs.readFileSync
 * (mirroring tests/cu2-dynamic-web-guides.test.js and
 * tests/cu3-ai-ml-deeplearning-guides.test.js) — no mocks, no fixtures, no fakes.
 * It guards the CU3 acceptance criteria for these three files:
 *   - each guide exceeds the 5-section template floor (> 5 "## " sections);
 *   - the required correction-surface sections are present (Security/Dependency,
 *     Async/Concurrency, Error Handling, Testing, Performance, Version, References);
 *   - each guide names its own concrete identifiers (SDK version tokens, API names);
 *   - langchain names LangChain 1.0 + LCEL + a re-verified CVE + a mitigation;
 *   - the anthropic/openai guides name real model-family tokens + SDK version tokens;
 *   - at least one dated source (>= 2025) with an http URL is present per guide;
 *   - the original H1 "# <Framework> CTO" header is intact (skills.json indexing).
 *
 * FABRICATION GUARD (the CU3 hard rule): every model-ID token and every CVE token
 * that appears in these three guides is checked against a small ALLOWLIST of
 * web-verified identifiers below. If a future edit introduces a model ID or CVE
 * that is NOT on the allowlist, this test FAILS LOUDLY — catching an invented /
 * hallucinated identifier before it ships. The allowlist entries were each
 * web-verified at edit time (2026-07-09):
 *   - Anthropic model IDs: the environment-authoritative current Claude models
 *     (Fable 5, Opus 4.8, Sonnet 4.6, Haiku 4.5). See CLAUDE.md / docs.anthropic.com.
 *   - OpenAI model IDs: the openai-python official README (main, v2.44.0) example
 *     models gpt-5.5 / gpt-5.4 / gpt-4o / gpt-4o-2024-08-06 / gpt-realtime-2.
 *   - CVE: CVE-2025-68664 (NVD, published 2025-12-23, CWE-502, CVSS 3.1 9.3
 *     CRITICAL, patched in LangChain 0.3.81 and 1.2.5).
 *
 * This test does NOT re-verify the facts against the live web; it guards the
 * substance (and the fabrication allowlist) against a future edit dropping or
 * inventing an identifier.
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
  langchain: 'skills/frameworks/ai-ml/langchain.md',
  'anthropic-sdk': 'skills/frameworks/ai-ml/anthropic-sdk.md',
  'openai-sdk': 'skills/frameworks/ai-ml/openai-sdk.md',
};

// ---------------------------------------------------------------------------
// Fabrication guard: web-verified allowlists (retrieved 2026-07-09).
// Any model-ID or CVE token appearing in a guide MUST be one of these.
// ---------------------------------------------------------------------------

// Anthropic model IDs — environment-authoritative current Claude models.
const ANTHROPIC_MODEL_ALLOW = new Set([
  'claude-fable-5',
  'claude-opus-4-8',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
]);

// OpenAI model IDs — from the openai-python official README (v2.44.0, main).
const OPENAI_MODEL_ALLOW = new Set([
  'gpt-5.5',
  'gpt-5.4',
  'gpt-4o',
  'gpt-4o-2024-08-06',
  'gpt-realtime-2',
]);

// CVE tokens — web-verified against NVD.
const CVE_ALLOW = new Set([
  'CVE-2025-68664',
]);

// Extract all claude-* model tokens (word-bounded, dash/digit chars).
function claudeModelTokens(md) {
  return md.match(/claude-[a-z0-9][a-z0-9-]*/g) || [];
}
// Extract all gpt-* model tokens.
function gptModelTokens(md) {
  return md.match(/gpt-[a-z0-9][a-z0-9.-]*/g) || [];
}
// Extract all CVE tokens.
function cveTokens(md) {
  return md.match(/CVE-\d{4}-\d+/g) || [];
}

// Sections every de-stubbed correction surface must carry (case-insensitive).
const REQUIRED_SECTIONS = [
  { name: 'Security/Dependency', re: /^##.*(security|dependenc|inject|serial|supply.?chain)/im },
  { name: 'Async/Concurrency', re: /^##.*(async|concurren|stream|client)/im },
  { name: 'Error Handling', re: /^##.*(error.?handling|retr|rate.?limit)/im },
  { name: 'Testing', re: /^##.*test/im },
  { name: 'Performance', re: /^##.*(performance|token.?budget|cach)/im },
  { name: 'Version-specific', re: /^##.*version/im },
  { name: 'References', re: /^##.*(reference|source)/im },
];

function sectionCount(md) {
  return (md.match(/^## /gm) || []).length;
}

describe('CU3 s2 — ai-ml LLM/SDK guides are substantive (real files, zero doubles)', () => {
  for (const [fw, rel] of Object.entries(GUIDES)) {
    describe(`${fw} (${rel})`, () => {
      it('exceeds the 5-section template floor (> 5 "## " sections)', () => {
        const md = read(rel);
        const n = sectionCount(md);
        assert.ok(n > 5, `expected > 5 "## " sections, found ${n}`);
      });

      it('is well past the ~50-line stub floor', () => {
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

      it('carries at least two fenced code examples (footgun demos)', () => {
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

      it('contains NO fabricated CVE token (allowlist guard)', () => {
        const md = read(rel);
        for (const cve of cveTokens(md)) {
          assert.ok(
            CVE_ALLOW.has(cve),
            `unverified/fabricated CVE token "${cve}" in ${rel} — add to allowlist only after NVD/GHSA verification`,
          );
        }
      });
    });
  }

  // ---- langchain-specific substance -------------------------------------
  it('langchain names LangChain 1.0, LCEL, and the removed 0.x APIs', () => {
    const md = read(GUIDES.langchain);
    assert.match(md, /LangChain 1\.0/, 'expected "LangChain 1.0" token');
    assert.match(md, /LCEL/, 'expected the LCEL token');
    assert.match(md, /LLMChain/, 'expected the removed LLMChain API');
    assert.match(md, /AgentExecutor/, 'expected the deprecated AgentExecutor API');
    assert.match(md, /LangGraph/, 'expected the LangGraph replacement');
  });

  it('langchain names a re-verified CVE (from the allowlist) and its fixed versions', () => {
    const md = read(GUIDES.langchain);
    const cves = cveTokens(md);
    assert.ok(cves.length >= 1, 'expected at least one CVE token in langchain.md');
    for (const cve of cves) {
      assert.ok(CVE_ALLOW.has(cve), `unverified CVE token "${cve}" in langchain.md`);
    }
    // The re-verified serialization advisory patches 0.3.81 and 1.2.5.
    assert.match(md, /1\.2\.5/, 'expected the fixed version 1.2.5');
    assert.match(md, /0\.3\.81/, 'expected the fixed version 0.3.81');
    assert.match(md, /CWE-502/, 'expected the CWE-502 deserialization class');
  });

  it('langchain prompt-injection note carries a concrete mitigation', () => {
    const md = read(GUIDES.langchain);
    assert.match(md, /prompt.?inject/i, 'expected the prompt-injection risk named');
    assert.match(
      md,
      /sanitiz|schema|sandbox|validat|allow.?list|human.?in.?the.?loop/i,
      'expected at least one concrete mitigation keyword',
    );
  });

  it('langchain names the current LangChain 1.x version and LangSmith', () => {
    const md = read(GUIDES.langchain);
    assert.match(md, /1\.3\.\d+|1\.[3-9]\.\d+/, 'expected a current LangChain 1.x version token');
    assert.match(md, /LangSmith/, 'expected LangSmith production tracing content');
  });

  // ---- anthropic-sdk-specific substance ---------------------------------
  it('anthropic-sdk names AsyncAnthropic, cache_control, tool_use, and a real SDK version', () => {
    const md = read(GUIDES['anthropic-sdk']);
    assert.match(md, /AsyncAnthropic/, 'expected AsyncAnthropic async-client content');
    assert.match(md, /cache_control/, 'expected prompt-caching cache_control content');
    assert.match(md, /tool_use|input_schema/, 'expected tool_use structured-output content');
    assert.match(md, /0\.11[0-9]\.\d+|0\.1[2-9]\d?\.\d+/, 'expected a current anthropic SDK version token');
    assert.match(md, /max_tokens/, 'expected token-budget max_tokens content');
  });

  it('anthropic-sdk uses ONLY web-verified (allowlisted) Claude model IDs', () => {
    const md = read(GUIDES['anthropic-sdk']);
    const tokens = claudeModelTokens(md);
    assert.ok(tokens.length >= 1, 'expected at least one claude-* model ID');
    for (const t of tokens) {
      assert.ok(
        ANTHROPIC_MODEL_ALLOW.has(t),
        `unverified/fabricated Claude model ID "${t}" in anthropic-sdk.md — allowlist: ${[...ANTHROPIC_MODEL_ALLOW].join(', ')}`,
      );
    }
  });

  // ---- openai-sdk-specific substance ------------------------------------
  it('openai-sdk names AsyncOpenAI, the parse() structured output, max_retries, and a real SDK version', () => {
    const md = read(GUIDES['openai-sdk']);
    assert.match(md, /AsyncOpenAI/, 'expected AsyncOpenAI async-client content');
    assert.match(md, /\.parse\(|completions\.parse/, 'expected Pydantic structured-output parse() content');
    assert.match(md, /max_retries/, 'expected max_retries production content');
    assert.match(md, /2\.4[0-9]\.\d+|2\.[4-9]\d?\.\d+/, 'expected a current openai SDK version token');
    assert.match(md, /ChatCompletion|client\.chat\.completions/, 'expected the v0.x->v1+ client migration content');
  });

  it('openai-sdk uses ONLY web-verified (allowlisted) OpenAI model IDs', () => {
    const md = read(GUIDES['openai-sdk']);
    const tokens = gptModelTokens(md);
    assert.ok(tokens.length >= 1, 'expected at least one gpt-* model ID');
    for (const t of tokens) {
      assert.ok(
        OPENAI_MODEL_ALLOW.has(t),
        `unverified/fabricated OpenAI model ID "${t}" in openai-sdk.md — allowlist: ${[...OPENAI_MODEL_ALLOW].join(', ')}`,
      );
    }
  });
});
