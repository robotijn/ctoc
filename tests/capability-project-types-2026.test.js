'use strict';

/**
 * EXPANSION WAVE 2 — the 8 web-grounded 2026 project types (serverless, static-site,
 * llm-agent, browser-extension, game, embedded, blockchain, data-pipeline).
 *
 * These tests prove three things, all against REAL on-disk fixtures (ZERO doubles —
 * every case writes a real marker file in a real temp dir and reads the REAL bundled
 * project-type YAML):
 *
 *   • CONTRACT — each of the 8 loads with zero warnings and carries the required
 *     shape (projectType + phases + run + configScaffold), an honest run flag, and a
 *     truthful provenance (web-2026-07 or an honest UNVERIFIED — never "guessed").
 *
 *   • DECISIVE DETECTION — a fixture holding ONLY that type's DECISIVE marker detects
 *     that type (serverless.yml→serverless, project.godot→game, foundry.toml→
 *     blockchain, platformio.ini→embedded, astro.config.mjs→static-site,
 *     langgraph.json→llm-agent, airflow.cfg→data-pipeline, wxt.config.ts→browser-extension).
 *
 *   • THE OVER-DETECTION GUARD (the exact defect an earlier review found — must not
 *     repeat) — a plain web-frontend (vite.config.ts, NO SSG/serverless marker) still
 *     detects web-frontend, NOT serverless and NOT static-site; and an AMBIGUOUS marker
 *     (manifest.json) loses to a real frontend framework, so a PWA-shaped project
 *     (vite.config.ts + manifest.json) is web-frontend, not browser-extension.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const registry = require('../src/lib/capability-registry');

// The 8 new types and the honest run flag each MUST carry (per the plan — never a
// false "it ran": a deploy/build/flash/package is build-is-last-mile, a schedulered
// pipeline is honest:false, a locally-servable SSG / agent is honest:true).
const NEW_TYPES = {
  serverless: 'build-is-last-mile',
  'static-site': true,
  'llm-agent': true,
  'browser-extension': 'build-is-last-mile',
  game: 'build-is-last-mile',
  embedded: 'build-is-last-mile',
  blockchain: 'build-is-last-mile',
  'data-pipeline': false
};

// The two types with NO universal decisive marker are flagged honestly UNVERIFIED
// (llm-agent: langgraph.json alone; browser-extension: manifest.json is ambiguous).
const UNVERIFIED_TYPES = new Set(['llm-agent', 'browser-extension']);

const HONEST_VALUES = new Set([true, false, 'build-is-last-mile', 'notebook-executes', 'per-workspace']);
const RELEVANCE = new Set(['required', 'recommended', 'optional', 'skip']);

/** Make a fresh temp project dir. */
function makeProject(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
/** Remove a temp dir, best-effort. */
function rm(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}
/** Build a temp project holding exactly the given marker files, run fn, always clean up. */
function withMarkers(prefix, markers, fn) {
  const dir = makeProject(prefix);
  try {
    for (const [name, content] of Object.entries(markers)) {
      fs.writeFileSync(path.join(dir, name), content);
    }
    return fn(dir);
  } finally { rm(dir); }
}

describe('expansion wave 2: the 8 new 2026 project types load with the required contract', () => {
  it('the registry loads all 21 project types (13 shipped + 8 new) with ZERO warnings', () => {
    const { projectTypes, warnings } = registry.loadProjectTypes();
    assert.deepEqual(warnings, [], 'the shipped project-type data must load with zero warnings');
    assert.equal(Object.keys(projectTypes).length, 21, 'exactly 21 project types ship after wave 2');
    for (const name of Object.keys(NEW_TYPES)) {
      assert.ok(projectTypes[name], `the new project type "${name}" must be registered`);
    }
  });

  it('each new type declares phases + run + configScaffold, an honest run flag, and truthful provenance', () => {
    const { projectTypes } = registry.loadProjectTypes();
    for (const [name, honest] of Object.entries(NEW_TYPES)) {
      const t = projectTypes[name];
      assert.equal(t.projectType, name, `${name}: projectType key must match the declared name`);
      assert.ok(t.phases && typeof t.phases === 'object' && !Array.isArray(t.phases), `${name}: phases must be an object`);
      assert.ok(t.run && typeof t.run === 'object', `${name}: run must be an object`);
      assert.ok(Array.isArray(t.configScaffold) && t.configScaffold.length > 0, `${name}: configScaffold must be a non-empty array`);
      assert.ok(HONEST_VALUES.has(t.run.honest), `${name}: run.honest must be an honest flag, saw "${t.run.honest}"`);
      assert.equal(t.run.honest, honest, `${name}: run.honest must be the honest last-mile flag the plan mandates`);
      assert.ok(typeof t.run.strategy === 'string' && t.run.strategy.length > 0, `${name}: run.strategy must be a non-empty string`);
      for (const [phase, rel] of Object.entries(t.phases)) {
        assert.ok(RELEVANCE.has(rel), `${name}.${phase} relevance must be required|recommended|optional|skip, saw "${rel}"`);
      }
      // Provenance is ALWAYS truthful — a web anchor, or an honest UNVERIFIED. Never "guessed".
      const expected = UNVERIFIED_TYPES.has(name) ? 'UNVERIFIED' : 'web-2026-07';
      assert.equal(t.verified, expected, `${name}: verified must be "${expected}" (no fabricated provenance)`);
    }
  });

  it('the type with contract-critical concerns carries the required phases (blockchain: security + coverage required)', () => {
    const { projectTypes } = registry.loadProjectTypes();
    assert.equal(projectTypes.blockchain.phases.security, 'required', 'a smart contract faces on-chain exploits — security is REQUIRED');
    assert.equal(projectTypes.blockchain.phases.coverage, 'required', 'contract coverage matters — coverage is REQUIRED');
    assert.equal(projectTypes['data-pipeline'].phases.test, 'required', 'pipeline correctness is testable — test is REQUIRED');
    assert.equal(projectTypes['llm-agent'].phases.security, 'required', 'prompt injection / tool access make security REQUIRED for an agent');
    assert.equal(projectTypes.embedded.phases.typecheck, 'required', 'a cross-compiled firmware treats typecheck as REQUIRED');
    assert.equal(projectTypes.serverless.phases.security, 'required', 'a public function endpoint treats security as REQUIRED');
  });
});

describe('expansion wave 2: DECISIVE marker detection — each unique marker detects its own type', () => {
  const CASES = [
    ['serverless',        'serverless.yml',    'service: x\n'],
    ['static-site',       'astro.config.mjs',  'export default {};\n'],
    ['llm-agent',         'langgraph.json',    '{"graphs":{}}\n'],
    ['browser-extension', 'wxt.config.ts',     'export default {};\n'],
    ['game',              'project.godot',     '[application]\n'],
    ['embedded',          'platformio.ini',    '[env]\n'],
    ['blockchain',        'foundry.toml',      '[profile.default]\n'],
    ['data-pipeline',     'airflow.cfg',       '[core]\n']
  ];
  for (const [type, marker, content] of CASES) {
    it(`detects ${type} from a ${marker}`, () => {
      withMarkers(`ctoc-w2-${type}-`, { [marker]: content }, (dir) => {
        assert.equal(registry.projectTypeFor(dir), type, `${marker} is the DECISIVE marker for ${type}`);
      });
    });
  }

  it('every other decisive marker also resolves (blockchain via hardhat, embedded via sdkconfig, static-site via mkdocs)', () => {
    withMarkers('ctoc-w2-hardhat-', { 'hardhat.config.ts': 'export default {};\n' }, (dir) => {
      assert.equal(registry.projectTypeFor(dir), 'blockchain');
    });
    withMarkers('ctoc-w2-espidf-', { sdkconfig: 'CONFIG_X=y\n' }, (dir) => {
      assert.equal(registry.projectTypeFor(dir), 'embedded');
    });
    withMarkers('ctoc-w2-mkdocs-', { 'mkdocs.yml': 'site_name: x\n' }, (dir) => {
      assert.equal(registry.projectTypeFor(dir), 'static-site');
    });
    withMarkers('ctoc-w2-prefect-', { 'prefect.yaml': 'name: x\n' }, (dir) => {
      assert.equal(registry.projectTypeFor(dir), 'data-pipeline');
    });
  });
});

describe('expansion wave 2: THE OVER-DETECTION GUARD — a shared/absent marker must NOT assert a type', () => {
  it('a plain web-frontend (vite.config.ts only) stays web-frontend — NOT serverless, NOT static-site', () => {
    withMarkers('ctoc-w2-overdetect-', { 'vite.config.ts': 'export default {};\n' }, (dir) => {
      const detected = registry.projectTypeFor(dir);
      assert.equal(detected, 'web-frontend', 'a bare Vite SPA must remain web-frontend');
      assert.notEqual(detected, 'serverless', 'no serverless marker present → must not mis-detect serverless');
      assert.notEqual(detected, 'static-site', 'no SSG marker present → must not mis-detect static-site');
    });
  });

  it('vercel.json / netlify.toml do NOT decisively mark serverless (they deploy ANY frontend)', () => {
    withMarkers('ctoc-w2-vercel-', { 'vite.config.ts': 'export default {};\n', 'vercel.json': '{}\n' }, (dir) => {
      assert.equal(registry.projectTypeFor(dir), 'web-frontend',
        'a Vite SPA with a vercel.json is still a web-frontend — a deploy config is not a serverless marker');
    });
  });

  it('an AMBIGUOUS manifest.json loses to a real frontend framework: a PWA shape is web-frontend, not browser-extension', () => {
    withMarkers('ctoc-w2-pwa-', { 'vite.config.ts': 'export default {};\n', 'manifest.json': '{"name":"pwa"}\n' }, (dir) => {
      assert.equal(registry.projectTypeFor(dir), 'web-frontend',
        'manifest.json is shared with PWAs — a real vite frontend (higher priority) must win over browser-extension');
    });
  });

  it('the DECISIVE browser-extension marker (wxt.config.ts) still wins on its own', () => {
    withMarkers('ctoc-w2-wxt-', { 'wxt.config.ts': 'export default {};\n' }, (dir) => {
      assert.equal(registry.projectTypeFor(dir), 'browser-extension',
        'wxt.config.ts is the modern browser-extension framework marker and is decisive on its own');
    });
  });

  it('a data-pipeline dbt overlap is avoided: dbt_project.yml alone does NOT mark data-pipeline (it is the SQL marker)', () => {
    const { projectTypes } = registry.loadProjectTypes();
    assert.ok(!projectTypes['data-pipeline'].detectionMarkers.includes('dbt_project.yml'),
      'dbt_project.yml is the SQL language marker — it must not be a data-pipeline detection marker');
  });
});

/**
 * WAVE 2 FIX (F1) — the blockchain project type's `security: required` must resolve to
 * a REAL Solidity SAST once the solidity language exists. Before the fix,
 * pipelineFor('solidity','blockchain') was null (no solidity), and the only other
 * language pairing resolved security to semgrep (a TypeScript SAST that cannot read
 * .sol). After the fix, the decisive security command is `slither .` — never semgrep.
 */
describe('WAVE 2 FIX (F1): pipelineFor(solidity, blockchain) resolves security to slither, not semgrep', () => {
  it('the merged blockchain security phase invokes slither and is web-grounded', () => {
    const pipeline = registry.pipelineFor('solidity', 'blockchain');
    assert.ok(pipeline, 'pipelineFor(solidity, blockchain) must resolve once solidity ships');
    assert.equal(pipeline.phases.security.relevance, 'required',
      'blockchain treats security as required (on-chain exploits)');
    assert.match(pipeline.phases.security.cmd, /slither/,
      'the blockchain security command must invoke the real Solidity SAST (slither)');
    assert.doesNotMatch(pipeline.phases.security.cmd, /semgrep/,
      'a TypeScript SAST (semgrep) can not read .sol files — it must never be the blockchain security tool');
    assert.equal(pipeline.phases.security.verified, 'web-2026-07',
      'slither is a genuine SAST — its provenance is web-grounded, not UNVERIFIED');
  });
});
