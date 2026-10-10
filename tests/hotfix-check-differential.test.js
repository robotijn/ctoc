'use strict';

// The differential test: the hotfix check's stylesheet reader against a real parser.
//
// A seeded generator makes stylesheets and one edit of each: mostly a colour replaced, else
// one of eleven kinds (a word replaced, deleted or added, a mark added or removed, a change at
// a line start, lines joined or split, a line added or removed, leading or trailing spaces
// changed). For every edit the check passes (rules 2 to 7 of `ruleRefusal`: no refusal) the
// real parser is asked what the edit changed: both sides are parsed by postcss, and the two
// trees must be identical except for the value of exactly one declaration, which
// postcss-value-parser reads as exactly one colour on both sides, in a real colour property.
// Anything else is a disagreement: the check called a change a colour that a real parser
// reads as something else.
//
// (This file held a Markdown section against markdown-it and a YAML section against js-yaml
// until the tenth round, and an HTML section against parse5 until the re-check of 2026-10-10.
// Markdown prose, catalogue files and pages are no kinds the check reads any more, and those
// three parsers are no dependencies of this repository's tests.)
//
// The test must also notice a weakened rule. So every refusal rule has a witness written by
// hand: the smallest change that the rule refuses, with the reason it is refused for.
//
// postcss and postcss-value-parser are test-only dependencies of this file (devDependencies,
// exact versions); the hotfix check requires neither.
//
// Size: by default 30,000 cases. The long soak (1 million cases) runs with
// HOTFIX_DIFFERENTIAL_SOAK=1. Every case is a pure function of the seed and its index, so a
// failure names both and reproduces:
//   HOTFIX_DIFFERENTIAL_SEED=<seed>   another seed (default 20261009)
//   HOTFIX_DIFFERENTIAL_CSS=<count>   another number of cases
//   HOTFIX_DIFFERENTIAL_FROM=<index>  the first case index (to run one share of a soak)
//   HOTFIX_DIFFERENTIAL_SHOW=<count>  also print that many one-colour edits the check refuses
// Plan: plans/todo/ctoc-checks-that-a-hotfix-is-really-small-and-safe-s1-the-hotfix-check.md,
// decisions at review of 2026-10-09 and 2026-10-10.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const postcss = require('postcss');
const valueParser = require('postcss-value-parser');

const { route } = require('../src/lib/menu-screens');
const { ruleRefusal } = require('../src/lib/hotfix-check');

const SOAK = process.env.HOTFIX_DIFFERENTIAL_SOAK === '1';
const SEED = Number(process.env.HOTFIX_DIFFERENTIAL_SEED || 20261009);
const FROM = Number(process.env.HOTFIX_DIFFERENTIAL_FROM || 0);
const SHOW = Number(process.env.HOTFIX_DIFFERENTIAL_SHOW || 0);
const CSS_CASES = Number(process.env.HOTFIX_DIFFERENTIAL_CSS || (SOAK ? 1000000 : 30000));

// ---------------------------------------------------------------------------------------
// The random source: mulberry32, one stream per (seed, case index).
// ---------------------------------------------------------------------------------------

function stream(seed, index) {
  let a = (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(index + 1, 0xc2b2ae35)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (r, n) => Math.floor(r() * n);
const pick = (r, list) => list[int(r, list.length)];
const chance = (r, p) => r() < p;
/** One of `[weight, maker]` pairs, by weight. */
function weighted(r, table) {
  let total = 0;
  for (const [w] of table) total += w;
  let at = r() * total;
  for (const [w, make] of table) {
    at -= w;
    if (at < 0) return make;
  }
  return table[table.length - 1][1];
}

/** The words an edit may replace, and the words it puts in their place. */
const WORDS = ['alpha', 'bravo', 'charlie', 'delta'];
const NEW_WORDS = ['zulu', 'yankee', 'xray'];
const WORD = /alpha|bravo|charlie|delta/g;
const word = (r) => pick(r, WORDS);
/**
 * How wild the document being generated is: the weight of every ingredient that most
 * readers trip over is multiplied by it, so some documents are everyday markup with one odd
 * thing in them and others are odd throughout. Set per document from its random source.
 */
let wild = 1;
const W = (weight) => weight * wild;

// ---------------------------------------------------------------------------------------
// The CSS generator (the ninth round): rules, at-rules, nesting, comments, strings and
// escapes; custom properties and what reads them; colour functions and keywords;
// `!important`; shorthands; selectors that look like colours; and, seldom, each thing at
// which a hand-written reader and a real parser part ways.
// ---------------------------------------------------------------------------------------

const CSS_COLOURS = ['red', 'blue', '#fff', '#0a58ca', '#ABCDEF80', 'rgb(1, 2, 3)', 'rgba(0, 0, 0, .5)', 'hsl(210 50% 40%)', 'hsla(210, 50%, 40%, 0.9)',
  'transparent', 'tomato', 'RED', 'rgb(1 2 3 / 50%)'];
const CSS_NEW_COLOURS = ['green', '#000', 'navy', '#123', 'rgb(4 5 6)'];
const COLOUR_PROPERTIES = ['color', 'background-color', 'border-color', 'outline-color', 'background', 'border', 'fill', 'stroke', 'caret-color',
  'border-top-color', 'text-decoration-color', 'box-shadow', 'COLOR'];
const OTHER_PROPERTIES = ['width', 'margin', 'content', 'animation-name', 'animation', 'font-family', 'display', 'grid-area', 'transition', 'will-change', 'filter', 'mask'];
const CUSTOM_PROPERTIES = ['--brand-color', '--accent-colour', '--color-text', '--Brand-COLOR', '--mode', '--shape', '--gap', '--enabled'];
const CSS_SELECTORS = ['a', '.btn', '#fff', '#bad:hover', '.red', 'red', 'nav > a', '.alpha.bravo', 'a::before', 'a:hover', '.btn--brand-color', '[data-x="red"]',
  'a[href^="#fff"]', ':root', 'h1, h2', '.sm\\:flex', '*', '&:hover', '& .charlie', '.delta', '.w-\\[calc\\(1px\\)\\]', '.w-1\\/2', '.echo\\{f', '.c-\\[\\\'x\\\'\\]',
  '.golf\\/*', '.hotel\\;i'];
const cssColour = (r) => pick(r, CSS_COLOURS);

/** A declaration's value: for a colour property mostly exactly one colour. */
function cssValue(r, colourful) {
  const c = cssColour(r);
  const w = word(r);
  if (colourful) {
    return weighted(r, [
      [50, () => c], [8, () => `${c} !important`], [5, () => `1px solid ${c}`], [4, () => `var(${pick(r, CUSTOM_PROPERTIES)})`],
      [3, () => `var(${pick(r, CUSTOM_PROPERTIES)}, ${c})`], [3, () => `linear-gradient(${c}, ${cssColour(r)})`], [3, () => `url(#fff) ${c}`],
      [2, () => `url("${w}.png") ${c}`], [3, () => `${c} ${cssColour(r)}`], [3, () => pick(r, ['inherit', 'currentColor', 'none'])],
      [2, () => `${c}!important`], [2, () => `${c} ! important`], [2, () => `${c} !IMPORTANT`],
      [W(2), () => `\\75 rl(a;color:${c};b)`], [W(2), () => `${c}\\9`], [W(2), () => `(a; color: ${c}; b)`], [W(1), () => `[a; color: ${c}; b]`],
      [W(2), () => `"${c}"`], [W(2), () => `${c} /* ${cssColour(r)} */`], [W(2), () => `/* ${w} */ ${c}`], [W(1), () => `${c};;`],
      [W(1), () => `${c} color: ${cssColour(r)}`], [W(1), () => `(b { c; } d) ${c}`], [W(1), () => `(${c}`], [W(1), () => `${c})`], [W(1), () => `"${w}`],
      [W(1), () => 'rgb(<1, 2, 3)'], [W(1), () => `${c}\\`], [W(1), () => `{ color: ${c} }`], [W(1), () => `:${c}`], [W(1), () => `progid:${w}(a=1)`],
      [W(1), () => `(]) ${c}`], [W(1), () => `${c} \\; ${cssColour(r)}`]
    ])();
  }
  return weighted(r, [
    [10, () => '1px'], [8, () => 'none'], [8, () => w], [6, () => `"${w} ${word(r)}"`], [5, () => `${c} 2s`], [4, () => c],
    [4, () => `var(${pick(r, CUSTOM_PROPERTIES)})`], [3, () => `${w} 1s ease`], [3, () => `url(${w}.svg#fff)`], [2, () => `'${w}'`], [2, () => 'calc(1px + (2px * 3))'],
    [W(1), () => '(a; b)'], [W(1), () => `"${w}\\"; color: ${c}; x: \\""`], [W(1), () => `\\"; color: ${c}; x: \\"`], [W(1), () => `"${w}\r"`]
  ])();
}

function cssDeclaration(r) {
  const c = cssColour(r);
  const w = word(r);
  return weighted(r, [
    [50, () => `${pick(r, COLOUR_PROPERTIES)}: ${cssValue(r, true)}`],
    [18, () => `${pick(r, CUSTOM_PROPERTIES)}: ${cssValue(r, true)}`],
    [24, () => `${pick(r, OTHER_PROPERTIES)}: ${cssValue(r, false)}`],
    [2, () => `color : ${c}`], [2, () => `color:${c}`], [2, () => `@apply ${w}`], [1, () => ''],
    [W(1), () => `*color: ${c}`], [W(1), () => `_color: ${c}`], [W(1), () => `c\\6f lor: ${c}`], [W(1), () => 'foo'], [W(1), () => `2x: ${c}`],
    [W(1), () => `a b: ${c}`], [W(1), () => `color:: ${c}`], [W(1), () => `--x: { color: ${c} }`], [W(1), () => `$brand: ${c}`], [W(1), () => `@accent: ${c}`]
  ])();
}

/** One rule: a selector and a block of declarations, sometimes a rule nested in it, on one line or on several. */
function cssRule(r, depth) {
  const parts = [];
  for (let n = 1 + int(r, 3); n > 0; n--) parts.push(cssDeclaration(r));
  if (depth < 2 && chance(r, 0.12)) parts.push(cssRule(r, depth + 1));
  if (chance(r, 0.1)) parts.push(`/* ${word(r)} ${cssColour(r)} */`);
  const lines = parts.map((p, i) => (/(?:\}|\*\/)$/.test(p) ? p : `${p}${i === parts.length - 1 && chance(r, 0.3) ? '' : ';'}`));
  const closing = chance(r, 1 - 0.04 * wild) ? '}' : pick(r, ['', '}}', '} }']);
  const selector = pick(r, CSS_SELECTORS);
  return chance(r, 0.5) ? `${selector} {\n${lines.map((l) => `  ${l}`).join('\n')}\n${closing}` : `${selector} { ${lines.join(' ')} ${closing}`;
}

function cssStatement(r) {
  const w = word(r);
  const custom = () => pick(r, CUSTOM_PROPERTIES);
  return weighted(r, [
    [60, () => cssRule(r, 0)],
    [6, () => `@media (min-width: 10px) {\n${cssRule(r, 1)}\n}`],
    [3, () => `@supports (color: ${cssColour(r)}) { ${cssRule(r, 1)} }`],
    [3, () => `@font-face { font-family: "${w}"; src: url(${w}.woff) }`],
    [3, () => `@keyframes ${pick(r, ['red', w])} { from { color: ${cssColour(r)} } to { color: ${cssColour(r)} } }`],
    [2, () => `@import "${w}.css";`], [2, () => '@charset "utf-8";'], [2, () => `@layer ${w}, base;`],
    [3, () => `@container style(${custom()}: ${cssColour(r)}) { ${cssRule(r, 1)} }`],
    [2, () => `@property ${custom()} { syntax: "<color>"; inherits: false; initial-value: ${cssColour(r)} }`],
    [3, () => `/* ${w}: ${cssColour(r)}; } */`],
    [8, () => `:root { ${custom()}: ${cssColour(r)}; ${custom()}: ${cssColour(r)} }`],
    [4, () => `.${w} { color: var(${custom()}); border: 1px solid var(${custom()}, ${cssColour(r)}) }`],
    [W(1), () => `@media (a; color: ${cssColour(r)}; b) { ${cssRule(r, 1)} }`], [W(1), () => `${pick(r, COLOUR_PROPERTIES)}: ${cssColour(r)};`],
    [W(1), () => `${custom()}: ${cssColour(r)};`],
    [W(2), () => pick(r, ['}', '<!--', '-->', w, '@ { }', '/* open', `"${w}`, `{ color: ${cssColour(r)} }`, '(', ')', ']', '@media {'])]
  ])();
}

/** One stylesheet: one to five statements. */
function cssDocument(r) {
  wild = pick(r, [0.1, 0.35, 1, 1]);
  const parts = [];
  for (let n = 1 + int(r, 5); n > 0; n--) parts.push(cssStatement(r));
  let text = `${parts.join(chance(r, 0.5) ? '\n' : '\n\n')}\n`;
  if (chance(r, 0.03)) text = `\ufeff${text}`;
  if (chance(r, 0.03)) text = text.replace(/\n/g, '\r\n');
  if (chance(r, 0.04)) text = text.replace(/\n$/, '');
  return text;
}

// ---------------------------------------------------------------------------------------
// The edit, of eleven kinds, and the change as the check's rules read it.
// ---------------------------------------------------------------------------------------

const EDITS = ['a word replaced', 'a word deleted', 'a word added', 'a mark added', 'a mark removed', 'a change at a line start',
  'lines joined', 'a line split', 'a line added', 'a line removed', 'leading or trailing spaces changed'];
/** What an edit writes, per language: the marks, what it puts at a line start, and the lines it adds. */
const EDIT_WORDS = {
  css: {
    marks: [';', '{', '}', '(', ')', ':', '\\', '"', '/', '*', '!', ',', '#', '-', '[', ']', '@', ' '],
    starts: ['}', '{', '/* ', '@', '  ', ' ', '\t', 'a { ', '--x: ', '*', '//'],
    added: [(r) => `a { color: ${cssColour(r)}; }`, () => '}', (r) => `/* ${word(r)} */`, () => '', (r) => `  color: ${cssColour(r)};`, () => '{', () => '@import "x.css";']
  }
};

/**
 * One edit of the kind the random source chooses: `{ newText, kind }`, or null when the
 * document gives that kind nothing to change.
 */
function edit(r, text, { marks, starts, added }) {
  const kind = weighted(r, [[40, () => 0], [8, () => 1], [8, () => 2], [8, () => 3], [6, () => 4], [6, () => 5], [5, () => 6], [5, () => 7],
    [5, () => 8], [5, () => 9], [4, () => 10]])();
  const words = [];
  WORD.lastIndex = 0;
  for (let m = WORD.exec(text); m; m = WORD.exec(text)) words.push(m);
  const lineStarts = [0];
  for (let i = text.indexOf('\n'); i >= 0 && i + 1 < text.length; i = text.indexOf('\n', i + 1)) lineStarts.push(i + 1);
  const at = pick(r, lineStarts);
  const eol = (from) => {
    const e = text.indexOf('\n', from);
    return e < 0 ? text.length : e;
  };
  let out = null;
  if (kind <= 3) {
    if (words.length === 0) return null;
    const m = pick(r, words);
    const end = m.index + m[0].length;
    if (kind === 0) out = text.slice(0, m.index) + pick(r, NEW_WORDS) + text.slice(end);
    else if (kind === 1) out = text.slice(0, m.index) + text.slice(text[end] === ' ' ? end + 1 : end);
    else if (kind === 2) out = `${text.slice(0, end)} ${pick(r, NEW_WORDS)}${text.slice(end)}`;
    else {
      const where = pick(r, [m.index, end, m.index + 1 + int(r, m[0].length - 1)]);
      out = text.slice(0, where) + pick(r, marks) + text.slice(where);
    }
  } else if (kind === 4) {
    const found = [];
    for (let i = 0; i < text.length; i++) if (marks.includes(text[i])) found.push(i);
    if (found.length === 0) return null;
    const i = pick(r, found);
    out = text.slice(0, i) + text.slice(i + 1);
  } else if (kind === 5) {
    out = chance(r, 0.7) ? text.slice(0, at) + pick(r, starts) + text.slice(at)
      : text.slice(0, at) + text.slice(at).replace(/^(?:[-*+>#<] ?|\d+[.)] ?| +|\t)/, '');
  } else if (kind === 6) {
    const e = eol(at);
    if (e >= text.length - 1) return null;
    out = text.slice(0, e) + pick(r, [' ', '', ' ']) + text.slice(e + 1);
  } else if (kind === 7) {
    const spaces = [];
    for (let i = at; i < eol(at); i++) if (text[i] === ' ') spaces.push(i);
    if (spaces.length === 0) return null;
    const i = pick(r, spaces);
    out = `${text.slice(0, i)}\n${text.slice(i + 1)}`;
  } else if (kind === 8) {
    out = `${text.slice(0, at)}${pick(r, added)(r)}\n${text.slice(at)}`;
  } else if (kind === 9) {
    out = text.slice(0, at) + text.slice(Math.min(eol(at) + 1, text.length));
  } else {
    const e = eol(at);
    out = weighted(r, [
      [3, () => `${text.slice(0, at)}${' '.repeat(1 + int(r, 4))}${text.slice(at)}`],
      [3, () => `${text.slice(0, e)}${' '.repeat(1 + int(r, 2))}${text.slice(e)}`],
      [2, () => text.slice(0, at) + text.slice(at).replace(/^ +/, '')],
      [2, () => text.slice(0, e).replace(/ +$/, '') + text.slice(e)],
      [1, () => `${text.slice(0, e)}\t${text.slice(e)}`],
      [1, () => (text[0] === '\ufeff' ? text.slice(1) : `\ufeff${text}`)],
      [1, () => (text.includes('\r\n') ? text.replace(/\r\n/g, '\n') : text.replace(/\n/g, '\r\n'))],
      [1, () => (text.endsWith('\n') ? text.slice(0, -1) : `${text}\n`)]
    ])();
  }
  return out === null || out === text ? null : { newText: out, kind: EDITS[kind] };
}

/**
 * The changed lines as git's `-U0 --ignore-cr-at-eol` diff gives them for one edit: the
 * lines between the common start and the common end of the two texts, a carriage return
 * before a line feed left out of the comparison and of the lines.
 */
function hunksOf(oldText, newText) {
  const keyed = (t) => {
    const l = t.split('\n');
    const last = l.pop();
    const keys = l.map((x) => `${x.replace(/\r$/, '')}\n`);
    if (last !== '') keys.push(last.replace(/\r$/, ''));
    return keys;
  };
  const a = keyed(oldText);
  const b = keyed(newText);
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let q = 0;
  while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
  const strip = (x) => x.replace(/\n$/, '');
  const removed = a.slice(p, a.length - q).map(strip);
  const added = b.slice(p, b.length - q).map(strip);
  return removed.length + added.length === 0 ? [] : [{ oldStart: p + 1, newStart: p + 1, removed, added }];
}

const FILES = { css: 'site/page.css' };

/** What the rules say of one edit of the file at `rel`; `carried`: what else the change holds (its repository's top, the linked files). */
function judgeAt(rel, oldText, newText, carried = {}) {
  const hunks = hunksOf(oldText, newText);
  return ruleRefusal({
    files: [{ display: rel, topRel: rel, status: 'M', oldMode: '100644', newMode: '100644', oldSha: null, oldText, newText, hunks }],
    lineCount: hunks.reduce((n, h) => n + h.removed.length + h.added.length, 0),
    ...carried
  });
}
const judge = (kind, oldText, newText) => judgeAt(FILES[kind], oldText, newText);

// ---------------------------------------------------------------------------------------
// The oracle: what the real parsers say the edit changed.
// ---------------------------------------------------------------------------------------

/** The oracle's own copy of the named colours of CSS Color Module Level 4, and `transparent`. */
const ORACLE_COLOUR_NAMES = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood '
  + 'cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki '
  + 'darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet '
  + 'deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow '
  + 'grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow '
  + 'lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime '
  + 'limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen '
  + 'mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid '
  + 'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue '
  + 'saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle '
  + 'tomato turquoise violet wheat white whitesmoke yellow yellowgreen transparent').split(' '));
assert.equal(ORACLE_COLOUR_NAMES.size, 149);
const ORACLE_COLOUR_FUNCTIONS = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color']);
const ORACLE_SHORTHANDS = new Set(['background', 'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-block', 'border-block-start',
  'border-block-end', 'border-inline', 'border-inline-start', 'border-inline-end', 'outline', 'column-rule', 'fill', 'stroke', 'box-shadow', 'text-shadow',
  'text-decoration', 'text-emphasis']);

/** @param {string} text @returns {string} lower case as a browser compares a CSS name: the ASCII letters only (the Kelvin sign is no `k`) */
const asciiLower = (text) => text.replace(/[A-Z]+/g, (letters) => letters.toLowerCase());

/** @returns {boolean} postcss-value-parser reads the value as exactly one colour: a hexadecimal colour, a named colour or one colour function */
function oneColourValue(value) {
  const nodes = valueParser(value).nodes;
  if (nodes.length !== 1) return false;
  const [node] = nodes;
  if (node.type === 'function') return ORACLE_COLOUR_FUNCTIONS.has(asciiLower(node.value));
  return node.type === 'word' && (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(node.value) || ORACLE_COLOUR_NAMES.has(asciiLower(node.value)));
}

/**
 * Walk two postcss trees side by side. Returns the first difference that is no declaration's
 * value, as a sentence, or null; `changed` gains every pair of declarations whose values differ.
 */
function cssDifference(a, b, changed) {
  if (a.type !== b.type) return 'the tree has another shape';
  if (a.type === 'decl') {
    if (a.prop !== b.prop || Boolean(a.important) !== Boolean(b.important) || a.raws.between !== b.raws.between || a.raws.important !== b.raws.important) return 'a property, its colon or !important differs';
    if (a.value !== b.value || JSON.stringify(a.raws.value) !== JSON.stringify(b.raws.value)) changed.push([a, b]);
    return null;
  }
  if (a.type === 'comment') return a.text === b.text ? null : 'a comment differs';
  if (a.type === 'rule' && a.selector !== b.selector) return 'a selector differs';
  if (a.type === 'atrule' && (a.name !== b.name || a.params !== b.params)) return 'an at-rule differs';
  const x = a.nodes || [];
  const y = b.nodes || [];
  if (x.length !== y.length || Array.isArray(a.nodes) !== Array.isArray(b.nodes)) return 'the tree has another shape';
  for (let i = 0; i < x.length; i++) {
    const found = cssDifference(x[i], y[i], changed);
    if (found) return found;
  }
  return null;
}

/**
 * What postcss says about one edit of a stylesheet: null when both sides parse, the trees
 * are identical except for the value of exactly one declaration, that value is exactly one
 * colour on both sides, and its property is a real colour property (never a custom
 * property); or the first reason it is not.
 */
function cssOracle(oldText, newText) {
  let a;
  let b;
  try {
    a = postcss.parse(oldText);
    b = postcss.parse(newText);
  } catch (err) {
    return `a side is no stylesheet for postcss (${err.reason || err.message})`;
  }
  const changed = [];
  const difference = cssDifference(a, b, changed);
  if (difference) return difference;
  if (changed.length !== 1) return changed.length === 0 ? 'no declaration value differs' : 'more than one declaration value differs';
  const [before, after] = changed[0];
  if (before.raws.value || after.raws.value || !oneColourValue(before.value.trim()) || !oneColourValue(after.value.trim())) return 'the changed value is not exactly one colour';
  const prop = before.prop;
  if (prop.startsWith('--') || !(/(?:^|-)color$/i.test(prop) || ORACLE_SHORTHANDS.has(asciiLower(prop)))) return `the property ${prop} holds no colour`;
  return null;
}

const ORACLES = { css: cssOracle };
/** Whether the real parser calls the edit a change to one colour and nothing else (for the count of such edits the check refuses). */
const PLAIN = { css: (o, n) => cssOracle(o, n) === null };

// ---------------------------------------------------------------------------------------
// The run.
// ---------------------------------------------------------------------------------------

/** One case: the document, its edit, the kind of edit. */
/** The colours an edit may replace in a stylesheet, wherever they stand: in a value, a selector, a comment or a string. */
const CSS_COLOUR_TOKEN = /#[0-9a-fA-F]{3,8}\b|\b(?:red|blue|tomato|transparent|RED)\b|(?:rgba?|hsla?)\([^()]*\)/g;
/** One edit of a stylesheet: mostly one colour replaced by another, else one of the eleven kinds. */
function cssEdit(r, text) {
  if (chance(r, 0.6)) {
    const found = [...text.matchAll(CSS_COLOUR_TOKEN)];
    if (found.length === 0) return null;
    const m = pick(r, found);
    return { newText: text.slice(0, m.index) + pick(r, CSS_NEW_COLOURS) + text.slice(m.index + m[0].length), kind: 'a colour replaced' };
  }
  return edit(r, text, EDIT_WORDS.css);
}

const DOCUMENTS = { css: cssDocument };
/** Each kind has a stream of its own (those of the earlier rounds). */
const SEED_OFFSET = { css: 1299709 };
function caseOf(kind, index, seed = SEED) {
  const r = stream(seed + SEED_OFFSET[kind], index);
  const oldText = DOCUMENTS[kind](r);
  const e = kind === 'css' ? cssEdit(r, oldText) : edit(r, oldText, EDIT_WORDS[kind]);
  return e === null ? null : { oldText, newText: e.newText, edit: e.kind };
}

/**
 * Make a disagreeing case smaller: cut pieces out of both sides, outside the edit, while
 * the check still passes it and the oracle still gives the same reason.
 */
function shrink(kind, oldText, newText, reason) {
  let p = 0;
  while (p < oldText.length && oldText[p] === newText[p]) p++;
  let s = 0;
  while (s < oldText.length - p && s < newText.length - p && oldText[oldText.length - 1 - s] === newText[newText.length - 1 - s]) s++;
  let head = oldText.slice(0, p);
  let tail = oldText.slice(oldText.length - s);
  const was = oldText.slice(p, oldText.length - s);
  const now = newText.slice(p, newText.length - s);
  const still = (h, t) => {
    const a = h + was + t;
    const b = h + now + t;
    try {
      return judge(kind, a, b) === null && ORACLES[kind](a, b) === reason;
    } catch {
      return false;
    }
  };
  for (let size = Math.max(head.length, tail.length); size >= 1; size = Math.floor(size / 2)) {
    for (let i = 0; i + size <= head.length;) {
      const cut = head.slice(0, i) + head.slice(i + size);
      if (still(cut, tail)) head = cut; else i++;
    }
    for (let i = 0; i + size <= tail.length;) {
      const cut = tail.slice(0, i) + tail.slice(i + size);
      if (still(head, cut)) tail = cut; else i++;
    }
  }
  return { oldText: head + was + tail, newText: head + now + tail };
}

/**
 * The ingredients a passed edit's document may hold, each found by a pattern in the document
 * as written. The run counts the passed edits per ingredient and requires every one to
 * occur, so that zero disagreements can never mean that the check passes nothing of a kind.
 */
const INGREDIENTS = {
  css: {
    'an at-rule with a block': /@media|@supports|@container/, 'an at-rule without one': /@import|@charset|@layer/, 'a nested rule': /\{[^{}]*\{[^{}]*\{|&/, 'a comment': /\/\*/,
    'a string': /"/, 'an escape': /\\/, 'a custom property': /--[a-z-]+: /i, 'a custom property that is read': /var\(/, 'a colour function': /rgb|hsl/,
    'a colour keyword': /\b(?:red|blue|tomato|transparent)\b/i, '!important': /!\s*important/i, 'a shorthand': /\b(?:background|border|box-shadow|fill|stroke): /,
    'a selector that looks like a colour': /^(?:#fff|#bad:hover|\.red|red) \{/m, 'a url': /url\(/, 'several declarations on one line': /; [a-z-]+: [^;\n]+;/,
    'Windows line endings': /\r\n/, 'a byte-order mark': /^\ufeff/, 'a style query': /@container style/
  }
};

/** The kinds of edit that add or remove a line. No such edit may pass. */
const NEVER_PASSES = {
  // In a stylesheet nothing but a colour may change. Ten of the eleven kinds of edit never
  // pass; the eleventh, a mark removed, passes where the mark is a space inside a colour
  // function (`hsla(210, 50%, 40%, 0.9)` to `hsla(210, 50%,40%, 0.9)`): one colour written
  // another way, for the check and for postcss alike (about 330 of 24,000 such edits).
  css: EDITS.filter((name) => name !== 'a mark removed')
};
/** The kinds of edit of which the check must pass some, per language. */
const MUST_PASS = { css: ['a colour replaced'] };
/**
 * The share of the generated edits the check must pass: 90% of the share measured on the
 * default seed and size after the last change to the reader (the re-check of 2026-10-10), so
 * that a rule which starts to refuse a tenth more than it did fails here.
 */
const PASS_FLOOR = { css: 0.0569 };

function run(kind, count) {
  const started = Date.now();
  const stats = { cases: 0, passed: 0, refused: 0, plainRefused: 0, plainSampled: 0 };
  /** @type {Map<string, number>} the plain visible-text edits the check refuses, by the refusal's cause word */
  const plainByCause = new Map();
  /** @type {Map<string, {count: number, index: number, oldText: string, newText: string, edit: string}>} */
  const classes = new Map();
  const patterns = Object.entries(INGREDIENTS[kind]);
  const ingredients = new Map(patterns.map(([name]) => [name, 0]));
  /** @type {Map<string, number[]>} for each kind of edit: how many were made, and how many passed */
  const byEdit = new Map([...EDITS, ...MUST_PASS[kind]].map((name) => [name, [0, 0]]));
  const shown = [];
  for (let index = FROM; index < FROM + count; index++) {
    const c = caseOf(kind, index);
    if (!c) continue;
    stats.cases++;
    byEdit.get(c.edit)[0]++;
    const refusal = judge(kind, c.oldText, c.newText);
    if (refusal) {
      stats.refused++;
      // Whether a refused edit was plain text for the real parser is counted in one case of eight.
      if (index % 8 !== 0) continue;
      stats.plainSampled++;
      if (PLAIN[kind](c.oldText, c.newText)) {
        stats.plainRefused++;
        const key = /cannot read exactly/.test(refusal.clause) ? `${refusal.cause}, cannot read exactly` : refusal.cause;
        plainByCause.set(key, (plainByCause.get(key) || 0) + 1);
        if (shown.length < SHOW) shown.push(`case ${index} (${c.edit}): ${refusal.clause}\n  old: ${JSON.stringify(c.oldText)}\n  new: ${JSON.stringify(c.newText)}`);
      }
      continue;
    }
    stats.passed++;
    byEdit.get(c.edit)[1]++;
    for (const [name, pattern] of patterns) if (pattern.test(c.oldText)) ingredients.set(name, ingredients.get(name) + 1);
    const reason = ORACLES[kind](c.oldText, c.newText);
    if (reason === null) continue;
    const seen = classes.get(reason);
    if (!seen) classes.set(reason, { count: 1, index, ...c });
    else {
      seen.count++;
      if (c.oldText.length < seen.oldText.length) Object.assign(seen, { index, ...c });
    }
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const share = stats.cases === 0 ? 0 : stats.passed / stats.cases;
  const summary = `${kind}: seed ${SEED}, cases ${FROM} to ${FROM + count - 1}: ${stats.cases} edits, ${stats.passed} passed (${(100 * share).toFixed(1)}%), `
    + `${stats.refused} refused, ${[...classes.values()].reduce((n, c) => n + c.count, 0)} disagreements, in ${seconds} s; `
    + `passed by kind of edit: ${[...byEdit].map(([k, [made, passed]]) => `${k} ${passed} of ${made}`).join(', ')}; `
    + `plain visible-text edits refused, in a sample of ${stats.plainSampled} refused edits: ${stats.plainRefused}`
    + ` (${[...plainByCause].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}: ${n}`).join('; ')})`
    + `; passed edits by ingredient: ${[...ingredients].map(([k, n]) => `${k} ${n}`).join(', ')}`
    + shown.map((x) => `\n${x}`).join('');
  const report = [...classes].sort((a, b) => b[1].count - a[1].count).map(([reason, c]) => {
    const small = shrink(kind, c.oldText, c.newText, reason);
    return `${c.count} x ${reason} (smallest: case ${c.index}, seed ${SEED}, ${c.edit})\n  old: ${JSON.stringify(small.oldText)}\n  new: ${JSON.stringify(small.newText)}`;
  });
  return { stats, share, summary, report, byEdit, missing: [...ingredients].filter(([, n]) => n === 0).map(([k]) => k) };
}

/** What every run must show, whatever its size: no disagreement, enough passes, every ingredient, and no pass of an edit that adds or removes a line. */
function assertRun(t, kind, count) {
  const { stats, share, summary, report, byEdit, missing } = run(kind, count);
  t.diagnostic(summary);
  assert.equal(report.length, 0, `${summary}\nThe check passed edits a real parser reads as something else:\n${report.join('\n')}`);
  assert.ok(share > PASS_FLOOR[kind], `the check must pass more than ${(100 * PASS_FLOOR[kind]).toFixed(2)}% of the generated edits: ${summary}`);
  for (const name of NEVER_PASSES[kind]) assert.equal(byEdit.get(name)[1], 0, `no edit of the kind "${name}" may pass: ${summary}`);
  for (const name of MUST_PASS[kind]) assert.ok(byEdit.get(name)[1] > 0, `the check must pass edits of the kind "${name}": ${summary}`);
  // A small run cannot hold every ingredient; the default size and the soak must.
  if (stats.cases >= 10000) assert.deepEqual(missing, [], `the check passed no edit in a document with: ${missing.join(', ')}`);
}

// Measured on 2026-10-10, seed 20261009, default size: 27,083 edits, 1,714 passed (6.3%). (The
// ninth round's reader passed 12.3%: custom properties named for a colour and the colour
// functions written with spaces passed then.) Beyond this test, 120,000 edits the ninth round's
// reader passed were read by Chromium 156's own CSS parser (the plan's Execution Record).
test('CSS: every stylesheet edit the check passes changes exactly one colour for postcss', (t) => {
  assertRun(t, 'css', CSS_CASES);
});

/**
 * The reason a refusal gives, as one word (the tenth round: each witness asserts the reason it
 * is refused for, so that a rule taken out is noticed also where another rule still refuses).
 * @param {({clause: string, cause: string}|null)} refusal
 */
function reasonOf(refusal) {
  if (refusal === null) return 'passed';
  const { clause, cause } = refusal;
  if (/cannot read exactly/.test(clause)) return cause === 'unreadable' ? 'subset' : 'inexact';
  if (/^I do not recognise /.test(clause)) return 'unrecognised';
  if (/^it changes a setting in /.test(clause)) return 'setting';
  if (/holds something I cannot follow\)$/.test(clause)) return 'lost';
  if (/ open\)$/.test(clause)) return 'open';
  if (/ sits in an area named /.test(clause)) return `area ${/ named (\p{L}+),/u.exec(clause)[1]}`;
  if (/^it changes a test /.test(clause)) return 'test';
  if (/^the wording in /.test(clause)) return 'risk';
  return clause;
}

// ---------------------------------------------------------------------------------------
// The witnesses of the ninth and tenth rounds: one change per refusal rule those rounds added.
// ---------------------------------------------------------------------------------------
//
// As above, for the rules about the wording of a page, stylesheets, paths, byte-order marks and
// line endings: the smallest change that one rule, and no other, refuses. Each row is [the
// rule, the reason it is refused for ({@link reasonOf}), the path, the old text, the new text,
// what else the change carries].
// Without a new text the word `alpha` becomes `zulu`, or, in a file that holds no `alpha`, the
// colour `red` becomes `blue`. To prove that a witness bites, weaken its rule in a scratch copy
// of `src/lib/hotfix-check.js` and run this test against the copy: that witness must then
// answer otherwise, and fail here. (Until the tenth round this table also held the witnesses
// of the Markdown, catalogue and custom-property rules; those kinds are taken out.)
const CSS_FILE = 'site/page.css';
const COLOUR = 'a { color: red }\n';
/** The plain change of each kind: every one of these passes, so a witness is refused for what it adds. */
const PLAIN_CHANGES = [[CSS_FILE, COLOUR], ['src/styles/design-tokens.css', COLOUR], ['src/author/site.css', COLOUR]];
const LATER_WITNESSES = [
  // Byte-order marks and line endings.
  ['a byte-order mark stands on both sides or on neither', 'unrecognised', CSS_FILE, COLOUR, 'BOMa { color: blue }\n'],
  ['as many carriage returns', 'unrecognised', CSS_FILE, 'a { color: red; } b { margin: 0 }', 'a { color: blue; }\r b { margin: 0 }'],
  ['the same ending on every line', 'unrecognised', CSS_FILE, 'a { color: red }\r\nb { margin: 0 }\n', 'a { color: blue }\nb { margin: 0 }\r\n'],
  // Stylesheets: the strict subset.
  ['a semicolon inside round brackets ends no statement', 'unrecognised', CSS_FILE, 'a { grid-area: (a; color: red; x: y) }\n'],
  ['a brace inside brackets cannot be followed', 'lost', CSS_FILE, 'a { x: (b { c; } d); color: red }\n'],
  ['a closing bracket matches the one open', 'lost', CSS_FILE, 'a { x: (]; y: 0 } b { color: red }\n'],
  ['a closing bracket matches the one open', 'lost', CSS_FILE, 'a { x: 1) } b { color: red }\n'],
  ['every bracket is closed at the end', 'open', CSS_FILE, 'a { color: red }\n@import (x\n'],
  ['a statement is a declaration, an at-rule or the head of a rule', 'lost', CSS_FILE, 'a { color: red; foo }\n'],
  ['a statement is a declaration, an at-rule or the head of a rule', 'lost', CSS_FILE, 'a { color: red } b\n'],
  ['a statement is a declaration, an at-rule or the head of a rule', 'lost', CSS_FILE, 'a { *zoom: 1; color: red }\n'],
  ['a statement is a declaration, an at-rule or the head of a rule', 'lost', CSS_FILE, 'margin: 0;\na { color: red }\n'],
  ['a statement is a declaration, an at-rule or the head of a rule', 'lost', CSS_FILE, 'a { "x"; color: red }\n'],
  ['an at-rule has a name', 'lost', CSS_FILE, '@ { } a { color: red }\n'],
  ['the head of a block starts with no `--`', 'lost', CSS_FILE, '--x: { a: b } a { color: red }\n'],
  ['a value holds no colon outside round brackets', 'lost', CSS_FILE, 'a { margin: 0 padding: 1px; } c { color: red }\n'],
  ['a colon in square brackets counts', 'lost', CSS_FILE, 'a { grid-area: [a: b]; color: red }\n'],
  ['a string ends at a carriage return or a form feed', 'lost', CSS_FILE, 'a { content: "x\f"; color: red }\n'],
  ['a string ends at a carriage return or a form feed', 'lost', CSS_FILE, 'a { content: "x\r"; color: red }\n'],
  ['a changed declaration holds no backslash', 'unrecognised', CSS_FILE, 'a { background: \\75 rl(a;color:red;b) }\n'],
  ['an escaped brace, semicolon, quote or comment start cannot be followed', 'lost', CSS_FILE, '.a\\{b { color: red }\n'],
  ['an escaped brace, semicolon, quote or comment start cannot be followed', 'lost', CSS_FILE, '.a\\;b { color: red }\n'],
  ['an escaped brace, semicolon, quote or comment start cannot be followed', 'lost', CSS_FILE, '.a\\\'b { color: red }\n'],
  ['an escaped brace, semicolon, quote or comment start cannot be followed', 'lost', CSS_FILE, '.a\\/* { color: red }\n'],
  ['a backslash before a line break escapes nothing', 'lost', CSS_FILE, 'a { color: red } b\\\n{ }\n'],
  ['an @charset rule names UTF-8', 'lost', CSS_FILE, '@charset "shift_jis";\na { color: red }\n'],
  ['a colour name is compared in ASCII letters', 'unrecognised', CSS_FILE, 'a { color: red }\n', 'a { color: blacKELVIN }\n'],
  ['a property name holds ASCII letters and hyphens only', 'lost', CSS_FILE, 'a { stroKELVINe: red }\n'],
  // Stylesheets: what the tenth round added.
  ['a stylesheet holds no control character but white space', 'lost', CSS_FILE, 'a { color: red; animation-name: CTRL; outline-style: tan }\n', 'a { color: blue; animation-name: tan; outline-style: CTRL }\n'],
  ['a stylesheet holds no control character but white space', 'lost', CSS_FILE, 'a { color: red } /* CTRL */\n'],
  ['rgb holds three integers or three percentages, never mixed', 'unrecognised', CSS_FILE, 'a { color: rgb(10, 20, 30%) }\n', 'a { color: rgb(10, 20, 40%) }\n'],
  ['hsl holds a number and two percentages', 'unrecognised', CSS_FILE, 'a { color: hsl(10, 20, 30) }\n', 'a { color: hsl(10, 20, 40) }\n'],
  ['a colour function is written with commas', 'unrecognised', CSS_FILE, 'a { color: rgb(10 20 30) }\n', 'a { color: rgb(10 20 40) }\n'],
  ['only rgb and hsl are colour functions', 'unrecognised', CSS_FILE, 'a { color: oklch(60% 0.2 240) }\n', 'a { color: oklch(60% 0.2 250) }\n'],
  ['a hexadecimal colour has 3, 4, 6 or 8 digits', 'unrecognised', CSS_FILE, 'a { color: red }\n', 'a { color: #abcde }\n'],
  ['a name before `url(` makes it no url: a character above U+007F', 'lost', CSS_FILE, 'a { x: EACUTEurl({); color: red }\n'],
  ['a name before `url(` makes it no url: an escape', 'lost', CSS_FILE, 'a { x: \\41 url({); color: red }\n'],
  // Stylesheets: custom properties never qualify (the tenth round).
  ['a changed custom property is a setting', 'setting', CSS_FILE, ':root { --brand-color: red }\n'],
  ['a changed custom property is a setting', 'setting', CSS_FILE, ':root { --brand-color: red }\na { color: var(--brand-color) }\n'],
  ['a changed custom property is a setting', 'setting', CSS_FILE, 'a { --shape: (a; color: red; x: y) }\n'],
  ['a changed custom property is a setting', 'setting', CSS_FILE, ':root { --gap: 4px }\n', ':root { --gap: 8px }\n'],
  // Paths and names.
  ['a folder named prompts governs the work', 'unrecognised', 'prompts/site.css', COLOUR],
  ['a folder named output-styles governs the work', 'unrecognised', 'output-styles/page.css', COLOUR],
  ['a sensitive word counts anywhere inside a part of the path', 'area key', 'src/APIKey/site.css', COLOUR],
  ['a sensitive word counts anywhere inside a part of the path', 'area auth', 'src/oauth/site.css', COLOUR],
  ['a sensitive word counts anywhere inside a part of the path', 'area deploy', 'src/styles/deployment.css', COLOUR],
  ['security is a sensitive word', 'area security', 'src/security/site.css', COLOUR],
  ['a part of the path that holds `prompt` governs the work', 'unrecognised', 'src/llm/system_prompt.css', COLOUR],
  ['a page or stylesheet in a dot-folder never qualifies', 'unrecognised', '.storybook/site.css', COLOUR],
  ['a path is asked as its letters read', 'area payment', 'src/payZWSPment/site.css', COLOUR],
  ['a path is asked as its letters read', 'area payment', 'src/pAACUTEyment/site.css', COLOUR],
  ['a path is asked as it is written', 'area auth', 'src/authZWSPlogin/site.css', COLOUR],
  ['a path is asked with compatibility letters as plain ones', 'area auth', 'src/FWAuthZWSPpanel/site.css', COLOUR],
  ['in a stylesheet\'s name only `tokens` keeps its plural', 'area payment', 'src/styles/payments.css', COLOUR],
  ['a test folder is found in every form of the path', 'test', 'teZWSPsts/site.css', COLOUR],
  ['a governing folder is found in every form of the path', 'unrecognised', 'promZWSPpts/site.css', COLOUR],
  ['a page or stylesheet is one as its name is written', 'unrecognised', 'site/page.cZWSPss', COLOUR],
];
const SPELT = [['CTRL', '\u0001'], ['EACUTE', '\u00e9'], ['ZWSP', '\u200b'], ['BOM', '\ufeff'], ['KELVIN', '\u212a'], ['AACUTE', '\u00e1'], ['FWA', '\uff41']];
const spelt = (text) => SPELT.reduce((t, [name, character]) => t.replaceAll(name, character), text);

test('witnesses of the ninth and tenth rounds: every refusal rule they added refuses the one change written for it, for its own reason', (t) => {
  for (const [rel, text] of PLAIN_CHANGES) {
    const edited = text.includes('alpha') ? text.replace('alpha', 'zulu') : text.replace('red', 'blue');
    assert.equal(judgeAt(rel, text, edited), null, `the plain change of ${rel} passes`);
  }
  const wrong = [];
  for (const [rule, reason, rel, before, after, carried = {}] of LATER_WITNESSES) {
    const oldText = spelt(before);
    const newText = spelt(after === undefined ? (before.includes('alpha') ? before.replace('alpha', 'zulu') : before.replace('red', 'blue')) : after);
    assert.notEqual(newText, oldText, `${rule}: the witness holds an edit`);
    const given = reasonOf(judgeAt(spelt(rel), oldText, newText, carried));
    if (given !== reason) wrong.push(`${rule}: ${spelt(rel)} ${JSON.stringify(oldText)} answered "${given}", not "${reason}"`);
  }
  t.diagnostic(`${LATER_WITNESSES.length} witnesses for ${new Set(LATER_WITNESSES.map((w) => w[0])).size} rules`);
  assert.deepEqual(wrong, [], 'each of these rules no longer refuses its witness, or no longer for its own reason');
});

// ---------------------------------------------------------------------------------------
// Documents written by hand: the classes the security runs of 2026-10-09 found, the cases
// the reader's rules were reasoned from, and everyday shapes. Every colour is edited in
// turn; whatever the check passes must be one colour for the real parser.
// ---------------------------------------------------------------------------------------
const BY_HAND = {
  css: [
    // Everyday shapes: every colour that is the whole value of a colour property passes.
    'a { color: red; }\n', '.btn {\n  color: #0a58ca;\n  background-color: #fff;\n  border-color: rgb(1, 2, 3);\n}\n',
    'a { color: red !important; outline-color: hsla(210, 50%, 40%, 0.9) }\n', '@media (min-width: 10px) {\n  a { color: red; }\n}\n',
    '/* brand: red */\n@import "x.css";\na { fill: red; stroke: blue; }\n', '.sm\\:flex, #fff, .red { COLOR : red }\n', 'a { color: RED; caret-color: Tomato }\n',
    '\ufeffa { color: red; }\r\nb { margin: 0; }\r\n', '@supports (color: red) { a { color: blue; } }\n', 'a { color: red; & b { color: blue; } }\n',
    // A colour that is not the whole value, or stands in no colour property.
    'a { border: 1px solid red; box-shadow: 0 0 2px blue; }\n', 'a { background: url("red.png") red; }\n', 'a { background: linear-gradient(red, blue); }\n',
    'a { animation: red 2s; animation-name: blue; }\n', 'a { width: #fff; content: "red"; }\n', '.red, #fff { margin: 0 }\n', '@keyframes red { from { color: red } to { color: blue } }\n',
    'a[href^="#fff"]::before { content: "\\"; color: red; x: \\""; }\n', 'a { color: var(--brand-color, red); }\n',
    // Custom properties: never a colour, whatever they hold and whatever reads them.
    ':root { --brand-color: red; --accent-colour: #fff; --mode: blue; }\n', ':root { --brand-color: red }\na { color: var(--brand-color); background-color: blue }\n',
    ':root { --brand-color: red }\n@container style(--brand-color: red) { a { color: blue } }\n', '@property --brand-color { syntax: "<color>"; inherits: false; initial-value: red }\n',
    'a { --shape: (a; color: red; b); color: blue }\n',
    // Where a hand-written reader and a real parser part ways.
    'a { color: red; foo }\n', 'a { color: red } b\n', 'a { *zoom: 1; color: red }\n', 'margin: 0;\na { color: red }\n', 'a { color: red; }\n}\n', 'a { color: red; }\n/* open\n',
    'a { grid-area: [a; color: red; b] }\n', 'a { background: \\75 rl(a;color:red;b) }\n', 'a { x: (b { c; } d); color: red }\n', '.a\\{b { color: red }\n',
    'a { color: red } b\\\n{ }\n', 'a { content: "x\r"; color: red }\n', '@charset "shift_jis";\na { color: red }\n', '<!-- a { color: red } -->\n',
    'a { color: rgb(1 2 3 / 50%); background-color: hsl(210 50% 40%) }\n', 'a { color: rgb(10, 20, 30%); background-color: hsl(10, 20, 30) }\n',
    'a { color /* c */ : red }\n', 'a {\n  /* brand */\n  color: red;\n}\n', 'a { color: red; ; color: blue;; }\n', 'a { c\\6f lor: red; color: blue\\9 }\n'
  ]
};
/** The edits of a hand-written document: in a page each word becomes another, in a stylesheet each colour. */
const HAND_EDITS = { css: [CSS_COLOUR_TOKEN, 'green'] };

test('documents written by hand: the classes found, and everyday shapes', (t) => {
  const wrong = [];
  const counts = { css: [0, 0] };
  for (const kind of ['css']) {
    const [pattern, replacement] = HAND_EDITS[kind];
    for (const oldText of BY_HAND[kind]) {
      for (const m of oldText.matchAll(pattern)) {
        const newText = `${oldText.slice(0, m.index)}${replacement}${oldText.slice(m.index + m[0].length)}`;
        counts[kind][0]++;
        if (judge(kind, oldText, newText) !== null) continue;
        counts[kind][1]++;
        const reason = ORACLES[kind](oldText, newText);
        if (reason !== null) wrong.push(`${reason}: ${JSON.stringify(oldText)} with ${m[0]} at ${m.index}`);
      }
    }
  }
  t.diagnostic(`${counts.css[1]} of ${counts.css[0]} edits passed in ${BY_HAND.css.length} stylesheets`);
  assert.deepEqual(wrong, []);
  for (const kind of ['css']) {
    assert.ok(counts[kind][1] > counts[kind][0] / 6, `the check passes edits in the everyday ${kind} shapes (${counts[kind][1]} of ${counts[kind][0]})`);
  }
});

test('the real menu route answers a sample of the generated edits as the rules do', async (t) => {
  // The sample is made here, from a seed of its own, so that this test stands alone: the
  // first four edits the rules pass and the first four they refuse.
  const sample = [];
  for (const kind of ['css']) {
    const kept = { passed: 0, refused: 0 };
    for (let index = 0; kept.passed + kept.refused < 8 && index < 20000; index++) {
      const c = caseOf(kind, index, 4242);
      if (!c) continue;
      const refusal = judge(kind, c.oldText, c.newText);
      const slot = refusal ? 'refused' : 'passed';
      // The route reads the change through git, which shows a lone carriage return as it is but
      // takes a file that ends without a line feed, or holds one before a line feed, the same way.
      if (kept[slot] < 4) {
        kept[slot]++;
        sample.push({ kind, index, ...c, clause: refusal ? refusal.clause : null });
      }
    }
    assert.deepEqual(kept, { passed: 4, refused: 4 }, `${kind}: the generator gives four passed and four refused edits`);
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hotfix-differential-'));
  const git = (args) => {
    // `maintenance.auto=false` and `gc.auto=0`: git 2.54 starts a detached maintenance run after a commit.
    const r = spawnSync('git', ['-c', 'user.name=Hotfix Test', '-c', 'user.email=hotfix@test.invalid',
      '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', '-c', 'maintenance.auto=false', '-c', 'gc.auto=0', ...args], { cwd: root, encoding: 'utf8', timeout: 60000 });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  };
  try {
    git(['init', '-q']);
    for (const s of sample) {
      const rel = FILES[s.kind];
      const file = path.join(root, ...rel.split('/'));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, s.oldText);
      git(['add', '-A']);
      git(['commit', '-q', '--allow-empty', '-m', `case ${s.index}`]);
      fs.writeFileSync(file, s.newText);
      const answer = await route(['hotfix', 'check', rel], root);
      const where = `${s.kind} case ${s.index}, seed 4242 (${s.edit}): ${JSON.stringify(s.oldText)}`;
      if (s.clause === null) assert.equal(answer.verdict, 'checking', `${where}: ${JSON.stringify(answer)}`);
      else {
        assert.equal(answer.text, `I did not treat this as a hotfix because ${s.clause}; `
          + 'it goes through a normal plan, and your edits stay in place, not committed.', where);
      }
      git(['checkout', '-q', '--', '.']);
    }
    t.diagnostic(`${sample.length} edits through the real menu route, each answered as the rules answered it`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

// The oracle itself compares names as a browser does. Until the tenth round it lower-cased
// with `toLowerCase()`, which turns the Kelvin sign into `k`: it then called `blac<Kelvin>` a
// colour, `o<Kelvin>lch(…)` a colour function and `stro<Kelvin>e` a colour property, and
// would have agreed with a reader that made the same mistake.
test('the stylesheet oracle compares a colour name, a function name and a property name in ASCII letters only', () => {
  const K = String.fromCharCode(0x212a);
  const one = (before, after) => cssOracle(`a { ${before} }\n`, `a { ${after} }\n`);
  assert.equal(one('color: red', 'color: black'), null);
  assert.equal(one('color: red', `color: blac${K}`), 'the changed value is not exactly one colour', 'a colour name');
  assert.equal(one('color: red', 'color: oklch(60% 0.2 240)'), null);
  assert.equal(one('color: red', `color: o${K}lch(60% 0.2 240)`), 'the changed value is not exactly one colour', 'a function name');
  assert.equal(one('stroke: red', 'stroke: blue'), null);
  assert.equal(one(`stro${K}e: red`, `stro${K}e: blue`), `the property stro${K}e holds no colour`, 'a property name');
});
