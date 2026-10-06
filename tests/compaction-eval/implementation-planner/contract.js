'use strict';

/**
 * Contract adapter of the implementation planner's smoke check (rollout slice 1).
 *
 * Reads the files a scratch run created or changed (`run.files`, posix paths relative to the
 * fixture copy). A slice is any `plans/implementation/*.md` other than the parent plan
 * (`fx.parent` + `.md`). Its frontmatter is read with the repository's own reader
 * (`state.parseMetadata`) and its step labels with the repository's own validator
 * (`plan-validator.validateStepLabels`) — no new parser.
 *
 * VALID when at least one slice was written — or, with none, when the run raised a question
 * (the Needs-Input protocol's halt is a correct answer) — and every slice carries
 * `parent_plan`, `depends_on` and `files`, has `parent_plan` equal to the parent slug exactly
 * (bare slug: `listSubplans` matches it by string equality), carries the nine canonical labels
 * of Steps 8 to 16, and the `depends_on` graph between slices has no cycle.
 *
 * FINDINGS: `module-with-its-test` (normal), `claude-md-declared` (normal),
 * `invented-call-site` (important), `dependency-too-deep` (important), `question-raised`
 * (important). The question channels are the two the baseline agent names: the plan's status
 * file (`<plan>.status`, `markNeedsInput` → status `needs-input`) and the streaming questions
 * store (`.ctoc/streaming/questions/`, `writePlanQuestions`).
 *
 * @param {{ output: string, files: object }} run
 * @param {{ name: string, parent: string, dir?: string }} fx
 * @param {{ fixtures_dir: string }} exp
 * @returns {{ valid: boolean, errors: string[], findings: object[], payload: object }}
 */

const fs = require('node:fs');
const path = require('node:path');

const { parseMetadata } = require('../../../src/lib/state');
const { validateStepLabels } = require('../../../src/lib/plan-validator');

const ROOT = path.join(__dirname, '..', '..', '..');
const PLANS = 'plans/implementation/';
const LABEL_ERROR = /is missing from the plan|appears \d+ times|has wrong label|out of order/;
const SOURCE = /^src\/.+\.(?:js|cjs|mjs|ts)$/;
const NEW_TEST = /^tests\/.+\.test\.(?:js|cjs|mjs|ts)$/;
const PATHISH = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.*-]+)+\.[A-Za-z0-9]+$/;
const MAX_DEPTH = 3;

const unquote = (v) => String(v).trim().replace(/^["']|["']$/g, '').trim();
const posix = (p) => String(p).split(path.sep).join('/');

/** The fixture project folder, so "exists in the fixture" reads the seeded project itself. */
function fixtureDir(fx, exp) {
  return path.join(ROOT, fx.dir !== undefined ? fx.dir : exp.fixtures_dir, fx.name);
}

/** `depends_on` as a slug list: `none`, empty, a comma or space list, or a `[a, b]` flow list. */
function depsOf(raw) {
  if (raw === undefined || raw === null) return [];
  const list = Array.isArray(raw) ? raw : String(raw).replace(/^\[|\]$/g, '').split(/[\s,]+/);
  return list.map(unquote).filter((s) => s && s.toLowerCase() !== 'none');
}

/** Every path written in backticks inside a "Wiring" section (heading to the next heading of its level or higher). */
function wiringPaths(body) {
  const lines = String(body).split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const h = /^(#{1,6})\s+.*wiring/i.exec(lines[i]);
    if (!h) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const next = /^(#{1,6})\s/.exec(lines[j]);
      if (next && next[1].length <= h[1].length) break;
      for (const m of lines[j].matchAll(/`([^`]+)`/g)) {
        const p = m[1].split(/[:#\s(]/)[0];
        if (PATHISH.test(p) && !p.includes('*')) out.push(p);
      }
    }
  }
  return out;
}

/** The longest chain of slices (counted in slices) and whether the graph has a cycle. */
function graph(deps) {
  const depth = new Map();
  const state = new Map();
  let cycle = false;
  const visit = (n) => {
    if (state.get(n) === 'done') return depth.get(n);
    if (state.get(n) === 'open') { cycle = true; return 0; }
    state.set(n, 'open');
    let d = 1;
    for (const m of deps.get(n) || []) if (deps.has(m)) d = Math.max(d, 1 + visit(m));
    state.set(n, 'done');
    depth.set(n, d);
    return d;
  };
  let longest = 0;
  for (const n of deps.keys()) longest = Math.max(longest, visit(n));
  return { longest, cycle };
}

exports.check = (run, fx, exp) => {
  const files = run.files || {};
  const fixture = fixtureDir(fx, exp);
  const exists = (p) => fs.existsSync(path.join(fixture, p));
  const errors = [];
  const findings = [];

  const asked = Object.entries(files).filter(([rel, text]) => {
    const r = posix(rel);
    if (r.startsWith('.ctoc/streaming/questions/') && r.endsWith('.json')) return true;
    if (!r.endsWith('.status') || typeof text !== 'string') return false;
    try { return JSON.parse(text).status === 'needs-input'; } catch { return /needs-input/.test(text); }
  }).map(([rel]) => posix(rel));
  if (asked.length) findings.push({ id: 'question-raised', severity: 'important', evidence: asked.join(', ') });

  const slices = [];
  for (const [rel, text] of Object.entries(files)) {
    const r = posix(rel);
    if (!r.startsWith(PLANS) || !r.endsWith('.md') || r.slice(PLANS.length).includes('/')) continue;
    const slug = r.slice(PLANS.length, -3);
    if (slug === fx.parent) continue;
    if (typeof text !== 'string') { errors.push(`${slug}: the capture was truncated, so it cannot be read`); continue; }
    const meta = parseMetadata(text) || {};
    for (const key of ['parent_plan', 'depends_on', 'files']) {
      if (meta[key] === undefined || meta[key] === null || meta[key] === '') errors.push(`${slug}: frontmatter has no ${key}`);
    }
    if (meta.parent_plan !== undefined && unquote(meta.parent_plan) !== fx.parent) {
      errors.push(`${slug}: parent_plan ${JSON.stringify(meta.parent_plan)} is not the bare slug ${fx.parent}`);
    }
    for (const e of validateStepLabels(text).errors) if (LABEL_ERROR.test(e)) errors.push(`${slug}: ${e}`);
    const declared = (Array.isArray(meta.files) ? meta.files : meta.files ? [meta.files] : []).map(unquote);
    slices.push({ slug, text, deps: depsOf(meta.depends_on), files: declared });
  }
  if (!slices.length && !asked.length) errors.push('no slice file was written and no question was raised');

  const { longest, cycle } = graph(new Map(slices.map((s) => [s.slug, s.deps])));
  if (cycle) errors.push('the depends_on graph between slices has a cycle');
  else if (longest > MAX_DEPTH) findings.push({ id: 'dependency-too-deep', severity: 'important', evidence: `a chain of ${longest} slices` });

  const created = slices.map((s) => ({ s, modules: s.files.filter((f) => SOURCE.test(f) && !exists(f)) })).filter((x) => x.modules.length);
  if (created.length && created.every(({ s, modules }) => modules.every((m) => {
    const base = path.posix.basename(m).replace(/\.[^.]+$/, '');
    return s.files.some((f) => NEW_TEST.test(f) && path.posix.basename(f).includes(base));
  }))) {
    findings.push({ id: 'module-with-its-test', severity: 'normal', evidence: created.map(({ s }) => s.slug).join(', ') });
  }

  const testing = slices.filter((s) => s.files.some((f) => NEW_TEST.test(f) && !exists(f)));
  if (testing.length && testing.every((s) => s.files.includes('CLAUDE.md'))) {
    findings.push({ id: 'claude-md-declared', severity: 'normal', evidence: testing.map((s) => s.slug).join(', ') });
  }

  const planned = new Set(slices.flatMap((s) => s.files));
  const invented = [...new Set(slices.flatMap((s) => wiringPaths(s.text)))].filter((p) => !exists(p) && !planned.has(p));
  if (invented.length) findings.push({ id: 'invented-call-site', severity: 'important', evidence: invented.join(', ') });

  return { valid: errors.length === 0, errors, findings, payload: { slices: slices.map((s) => s.slug), asked, longest } };
};
