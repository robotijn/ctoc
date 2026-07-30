'use strict';

/**
 * GOLDEN-CORPUS SCANNER — detects a module that consumes a PERSISTED real-world
 * contract but has no test driving a real captured sample, and measures whether the
 * corpus of captured samples is still honest (extreme enough to represent reality).
 *
 * THE DEFECT CLASS, in the human's words: "the matrix fix passed its own tests while
 * your screen was still unreadable. It only broke when rendered against the real
 * question files in your store." A test that exercises only SYNTHETIC input, for a
 * module whose real job is to read a file the pipeline actually WROTE. The test passes;
 * the production path fails on the shape the real data has.
 *
 * THE WORKED EXAMPLE. This morning a decision-matrix renderer was fixed test-first;
 * four synthetic tests passed and the human's screen was still unreadable. The real
 * question file in `.ctoc/streaming/questions/` carries option fields over a thousand
 * characters long, full of file-and-line citations. Against that shape the matrix
 * wrapped ~20 lines down a narrow column, split `src/lib/task-reconcile.js` mid-word,
 * and duplicated a cell. `tests/real-question-file-render.test.js` reproduces it against
 * the real captured file and is red on the pre-fix renderer.
 *
 * WHY TWO SIGNALS FOR "CONSUMER". A module consumes contract C if it EITHER imports C's
 * canonical reader and uses one of its exports (reader-import), OR constructs C's
 * on-disk path from its own segments AND parses what it reads (inline-read). The naive
 * "any module containing `path.join(root, '.ctoc', …)`" was rejected: ~60 sites in
 * src/lib own a LOG they alone write and consume nobody's contract, and a fence with 50
 * false findings is switched off in a week. Both signals are complete on their own
 * terms — a path.join that never parses is not a consumer.
 *
 * WHY THE STATIC HALF IS THE WEAKER HALF, stated plainly. A test is "linked" to a
 * contract when it names the contract's corpus directory — which cannot prove the test
 * actually FEEDS a sample to the module (it might `existsSync` it and assert nothing).
 * So the load-bearing protection is NOT this scan; it is (a) the corpus exercise in
 * tests/golden-corpus-fence.test.js, which drives every real sample through its
 * canonical reader, and (b) the extremes ratchet, which fails by name the moment a
 * sample is shortened. This scan is a secondary ratchet that fires when a NEW persisted
 * contract gains a consumer with no corpus at all.
 *
 * THIS MODULE MUST NOT COMMIT ITS OWN DEFECT. A bad `root` THROWS (an empty finding
 * list IS the success value, so returning one for input never read would be the exact
 * neighbouring class this repository fences). A corrupt/unreadable corpus sample THROWS
 * WITH ITS PATH rather than being skipped into a false "all clear".
 *
 * Cross-platform: `path.join` for walking; every emitted module path is normalised to
 * POSIX separators so a baseline committed on macOS matches on Windows. Requires only
 * `node:path` and `./safe-fs` — no reader modules — so it is safe on the hook path.
 */

const path = require('node:path');
const safeFs = require('./safe-fs');

/**
 * The curated contract registry — hand-chosen from real recorded instances on disk, not
 * inferred. Adding a contract is a deliberate, reviewable act.
 * @type {ReadonlyArray<{id:string, corpusDir:string, segments:string[], readerBasename:string, readerExports:string[], parse:'json'|'frontmatter', location:string[]}>}
 */
const CONTRACTS = Object.freeze([
  {
    id: 'streaming-questions', corpusDir: 'streaming-questions',
    location: ['.ctoc', 'streaming', 'questions'], segments: ['.ctoc', 'streaming', 'questions'],
    readerBasename: 'streaming-precompute',
    readerExports: ['loadPlanQuestions', 'planQuestionsStatus', 'readAnsweredQuestionIds'],
    parse: 'json',
  },
  {
    id: 'verify-evidence', corpusDir: 'verify-evidence',
    location: ['.ctoc', 'state', 'verify'], segments: ['.ctoc', 'state', 'verify'],
    readerBasename: 'step-13-verify', readerExports: ['readVerifyEvidence'],
    parse: 'json',
  },
  {
    id: 'approval-ledger', corpusDir: 'approvals',
    location: ['.ctoc', 'approvals'], segments: ['.ctoc', 'approvals'],
    readerBasename: 'approval-ledger', readerExports: ['readEntry', 'readEntryResult'],
    parse: 'json',
  },
  {
    id: 'task-registry', corpusDir: 'task-registry',
    location: ['.ctoc', 'state'], locationFile: 'tasks.json', segments: ['.ctoc', 'state', 'tasks.json'],
    readerBasename: 'task-registry', readerExports: ['load'],
    parse: 'json',
  },
  {
    id: 'plan-frontmatter', corpusDir: 'plan-frontmatter',
    location: ['plans'], segments: ['plans'],
    readerBasename: 'state', readerExports: ['parseMetadata'],
    parse: 'frontmatter',
  },
]);

const FRONTMATTER_PARSE_CALLS = ['parseMetadata(', 'parseFrontmatter(', 'extractFrontmatterRegion('];

/** Strip line and block comments so a path named in a docblock never registers as a
 *  consumer. Strings are left intact — the path literals live in them. */
function stripComments(source) {
  let out = '';
  let i = 0;
  let inBlock = false;
  let inString = null; // the closing quote char, or null
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (inBlock) {
      if (two === '*/') { inBlock = false; i += 2; continue; }
      i += 1; continue;
    }
    if (inString) {
      out += source[i];
      if (source[i] === '\\') { out += source[i + 1] || ''; i += 2; continue; }
      if (source[i] === inString) inString = null;
      i += 1; continue;
    }
    if (two === '/*') { inBlock = true; i += 2; continue; }
    if (two === '//') { while (i < source.length && source[i] !== '\n') i += 1; continue; }
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === '`') { inString = ch; out += ch; i += 1; continue; }
    out += ch;
    i += 1;
  }
  return out;
}

/** Whether `text` contains `ident` as a whole word (not part of a longer identifier). */
function hasWord(text, ident) {
  let idx = text.indexOf(ident);
  while (idx !== -1) {
    const before = idx === 0 ? '' : text[idx - 1];
    const after = text[idx + ident.length] || '';
    if (!/[\w$]/.test(before) && !/[\w$]/.test(after)) return true;
    idx = text.indexOf(ident, idx + 1);
  }
  return false;
}

/** Whether `stripped` imports the module whose specifier ends in `/basename`. */
function importsModule(stripped, basename) {
  if (!stripped.includes('require(')) return false;
  let idx = stripped.indexOf(basename);
  while (idx !== -1) {
    const before = stripped[idx - 1];
    const after = stripped[idx + basename.length];
    if (before === '/' && (after === "'" || after === '"' || after === '`')) return true;
    idx = stripped.indexOf(basename, idx + 1);
  }
  return false;
}

/** Whether one `path.join(...)` call in `stripped` contains every segment as a quoted
 *  literal. Walks each call's argument list to its matching paren. */
function joinHasAllSegments(stripped, segments) {
  let from = 0;
  for (;;) {
    const at = stripped.indexOf('path.join(', from);
    if (at === -1) return false;
    const open = at + 'path.join('.length - 1;
    let depth = 0;
    let end = -1;
    for (let j = open; j < stripped.length; j += 1) {
      if (stripped[j] === '(') depth += 1;
      else if (stripped[j] === ')') { depth -= 1; if (depth === 0) { end = j; break; } }
    }
    const args = stripped.slice(open, end === -1 ? stripped.length : end);
    if (segments.every((seg) => args.includes(`'${seg}'`) || args.includes(`"${seg}"`) || args.includes('`' + seg + '`'))) {
      return true;
    }
    from = end === -1 ? stripped.length : end + 1;
  }
}

/** Whether the file parses what it reads, for the given contract kind. */
function hasParse(stripped, kind) {
  if (kind === 'json') return stripped.includes('JSON.parse(');
  return FRONTMATTER_PARSE_CALLS.some((c) => stripped.includes(c));
}

/**
 * Which contract, if any, this source consumes, and by which signal. The reader
 * MODULE ITSELF is not treated as its own consumer: the canonical reader is the wiring,
 * not a bystander that needs a corpus test.
 * @returns {{contract: string, signal: 'reader-import'|'inline-read', evidence: string}|null}
 */
function detectConsumer(modulePath, source) {
  const stripped = stripComments(source);
  const base = path.basename(modulePath).replace(/\.js$/, '');
  for (const c of CONTRACTS) {
    if (base === c.readerBasename) continue; // a reader is not its own consumer
    if (importsModule(stripped, c.readerBasename) && c.readerExports.some((e) => hasWord(stripped, e))) {
      return { contract: c.id, signal: 'reader-import', evidence: `imports ${c.readerBasename}` };
    }
    if (joinHasAllSegments(stripped, c.segments) && hasParse(stripped, c.parse)) {
      return { contract: c.id, signal: 'inline-read', evidence: `path.join(${c.segments.join('/')}) + parse` };
    }
  }
  return null;
}

/** Collect files with a given extension under a directory, without following symlinks. */
function collectFiles(dir, ext, acc = []) {
  if (!safeFs.existsSync(dir)) return acc;
  for (const entry of safeFs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, ext, acc);
    else if (entry.isFile() && entry.name.endsWith(ext)) acc.push(full);
  }
  return acc;
}

/** Structural extremes of a parsed JSON value. */
function walkJson(value) {
  let maxFieldLen = 0;
  let maxDepth = 0;
  let maxArrayLen = 0;
  (function walk(x, depth) {
    if (depth > maxDepth) maxDepth = depth;
    if (typeof x === 'string') { if (x.length > maxFieldLen) maxFieldLen = x.length; }
    else if (Array.isArray(x)) { if (x.length > maxArrayLen) maxArrayLen = x.length; for (const e of x) walk(e, depth + 1); }
    else if (x && typeof x === 'object') { for (const v of Object.values(x)) walk(v, depth + 1); }
  })(value, 0);
  return { maxFieldLen, maxDepth, maxArrayLen };
}

/**
 * Measure the extremes of ONE sample. A json contract THROWS on unparseable input
 * (the caller adds the path); a frontmatter/text sample is measured by its longest line.
 */
function measureSample(text, kind) {
  const totalBytes = Buffer.byteLength(text, 'utf8');
  if (kind === 'json') {
    const parsed = JSON.parse(text);
    return { totalBytes, ...walkJson(parsed) };
  }
  let maxLine = 0;
  for (const line of text.split('\n')) if (line.length > maxLine) maxLine = line.length;
  return { totalBytes, maxFieldLen: maxLine, maxDepth: 0, maxArrayLen: 0 };
}

function emptyExtremes() {
  return { totalBytes: 0, maxFieldLen: 0, maxDepth: 0, maxArrayLen: 0 };
}

function mergeMax(a, b) {
  return {
    totalBytes: Math.max(a.totalBytes, b.totalBytes),
    maxFieldLen: Math.max(a.maxFieldLen, b.maxFieldLen),
    maxDepth: Math.max(a.maxDepth, b.maxDepth),
    maxArrayLen: Math.max(a.maxArrayLen, b.maxArrayLen),
  };
}

/** Max extremes over every real instance in a contract's production store. */
function measureProductionFloor(root, contract) {
  const dir = path.join(root, ...contract.location);
  if (!safeFs.existsSync(dir)) return { status: 'unmeasurable', ...emptyExtremes() };
  const ext = contract.parse === 'json' ? '.json' : '.md';
  // A single-file contract (task-registry → tasks.json) measures only that file, never
  // the whole directory — .ctoc/state also holds the verify evidence store, which is a
  // DIFFERENT contract and would contaminate this floor.
  const files = contract.locationFile
    ? (safeFs.existsSync(path.join(dir, contract.locationFile)) ? [path.join(dir, contract.locationFile)] : [])
    : collectFiles(dir, ext);
  if (files.length === 0) return { status: 'unmeasurable', ...emptyExtremes() };
  let floor = emptyExtremes();
  for (const abs of files) {
    let text;
    try { text = safeFs.readFileSync(abs, 'utf8'); } catch { continue; }
    try { floor = mergeMax(floor, measureSample(text, contract.parse)); }
    catch { continue; } // a corrupt PRODUCTION file cannot lower the floor — skip it, do not fail the scan
  }
  return { status: 'met', ...floor };
}

/** The prescriptive fix for a finding — names the module, the contract, and the corpus path. */
function fixFor(contract, corpusDir) {
  return `${contract}: add a test that drives a REAL captured sample from ` +
    `tests/fixtures/golden-corpus/${corpusDir}/ through the canonical reader (a synthetic-only ` +
    `test for a module that reads a persisted contract is the defect this fence catches). ` +
    `If genuinely not a consumer, add the key to exemptions with a written justification.`;
}

/**
 * @typedef {Object} GoldenCorpusFinding
 * @property {string} contract   Registry id, e.g. 'streaming-questions'.
 * @property {string} module     Repo-relative POSIX path of the consuming module.
 * @property {'reader-import'|'inline-read'} signal
 * @property {string} key        Stable identity `${contract}::${module}` — no line number.
 * @property {string} evidence   The matched construct.
 * @property {string} fix        Prescriptive: names module, contract and corpus path.
 */

/**
 * Scan for consumers of a persisted contract that no test links to a real sample, and
 * measure the corpus's extremes.
 *
 * @param {string} root Project root.
 * @param {{sources?: Array<{path:string, source:string}>,
 *          testSources?: Array<{path:string, source:string}>,
 *          corpusRoot?: string, measureProduction?: boolean}} [opts]
 *   `sources`/`testSources` plant in-memory files so the fence can self-test without
 *   writing to disk (the single-export constraint). `corpusRoot` overrides the corpus
 *   location for the corrupt-sample self-test. `measureProduction` (default false)
 *   walks the live production stores to compute a drift floor — off on the gated path.
 * @returns {{findings: GoldenCorpusFinding[],
 *            contracts: Array<{id:string, consumers:string[], samples:string[],
 *              extremes:object, productionFloor:(object|null)}>,
 *            filesScanned:number, samplesExercised:number}}
 * @throws {TypeError} when `root` is not a non-empty string and no `sources` are given.
 * @throws {Error} when a corpus sample cannot be read or (for a json contract) parsed.
 */
function scanGoldenCorpus(root, opts = {}) {
  const planted = opts && Array.isArray(opts.sources) ? opts.sources : null;

  /** @type {Array<{path:string, source:string}>} */
  let srcFiles = [];
  if (planted) {
    for (const entry of planted) {
      if (!entry || typeof entry.path !== 'string' || typeof entry.source !== 'string') {
        throw new TypeError('scanGoldenCorpus: every `sources` entry must be {path, source}.');
      }
      srcFiles.push({ path: entry.path.split(path.sep).join('/'), source: entry.source });
    }
  } else {
    if (typeof root !== 'string' || root.trim() === '') {
      throw new TypeError(
        `scanGoldenCorpus: root must be a non-empty string, received ${typeof root} (${String(root)}). ` +
        'Returning an empty finding list here would report "all clear" for input never read — the exact ' +
        'defect class this scanner exists to catch.'
      );
    }
    srcFiles = collectFiles(path.join(root, 'src'), '.js').map((abs) => ({
      path: path.relative(root, abs).split(path.sep).join('/'),
      source: safeFs.readFileSync(abs, 'utf8'), // unreadable → throws with its path, never skipped
    }));
  }

  // Which contracts are LINKED — named by at least one test's corpus directory path.
  const testFiles = Array.isArray(opts.testSources)
    ? opts.testSources
    : (typeof root === 'string' && root.trim() !== '' && !planted
      ? collectFiles(path.join(root, 'tests'), '.js')
        .filter((abs) => !abs.includes(`${path.sep}fixtures${path.sep}`))
        .map((abs) => ({ path: abs, source: safeFs.readFileSync(abs, 'utf8') }))
      : []);
  const linked = new Set();
  for (const c of CONTRACTS) {
    const needle = `fixtures/golden-corpus/${c.corpusDir}`;
    if (testFiles.some((t) => t.source.includes(needle))) linked.add(c.id);
  }

  /** @type {GoldenCorpusFinding[]} */
  const findings = [];
  for (const file of srcFiles) {
    const hit = detectConsumer(file.path, file.source);
    if (!hit) continue;
    if (linked.has(hit.contract)) continue; // some test names this contract's corpus dir
    const contract = CONTRACTS.find((c) => c.id === hit.contract);
    findings.push({
      contract: hit.contract,
      module: file.path,
      signal: hit.signal,
      key: `${hit.contract}::${file.path}`,
      evidence: hit.evidence,
      fix: fixFor(hit.contract, contract.corpusDir),
    });
  }
  findings.sort((a, b) => a.key.localeCompare(b.key));

  // Corpus extremes + sample exercise. A corrupt json sample THROWS with its path.
  const corpusRoot = opts.corpusRoot || path.join(root, 'tests', 'fixtures', 'golden-corpus');
  let samplesExercised = 0;
  const contracts = CONTRACTS.map((c) => {
    const dir = path.join(corpusRoot, c.corpusDir);
    const samples = [];
    let extremes = emptyExtremes();
    if (safeFs.existsSync(dir)) {
      for (const entry of safeFs.readdirSync(dir)) {
        if (entry === '.gitkeep') continue;
        const abs = path.join(dir, entry);
        let text;
        try { text = safeFs.readFileSync(abs, 'utf8'); }
        catch (err) { throw new Error(`golden-corpus: sample ${c.corpusDir}/${entry} could not be read (${err && err.message})`); }
        let m;
        try { m = measureSample(text, c.parse); }
        catch (err) { throw new Error(`golden-corpus: sample ${c.corpusDir}/${entry} is not valid ${c.parse} (${err && err.message})`); }
        samples.push(entry);
        samplesExercised += 1;
        extremes = mergeMax(extremes, m);
      }
    }
    const consumers = findings.filter((f) => f.contract === c.id).map((f) => f.module);
    return {
      id: c.id,
      consumers,
      samples,
      extremes,
      productionFloor: opts.measureProduction ? measureProductionFloor(root, c) : null,
    };
  });

  return { findings, contracts, filesScanned: srcFiles.length, samplesExercised };
}

module.exports = { scanGoldenCorpus };
