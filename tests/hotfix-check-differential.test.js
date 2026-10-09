'use strict';

// The differential test: the hotfix check's readers against real parsers.
//
// A seeded generator makes HTML and Markdown documents and one edit of each, of eleven kinds
// (a word replaced, deleted or added, a mark added or removed, a change at a line start,
// lines joined or split, a line added or removed, leading or trailing spaces changed). For
// every edit the check passes (rules 2 to 7 of `ruleRefusal`: no refusal) the real parsers
// are asked what the edit changed:
//   HTML      the old and the new document are parsed by parse5, the HTML standard's parser,
//             with scripting enabled and with scripting disabled (one leading byte-order
//             mark taken off first, as a browser does). The two trees must be identical
//             except for the data of exactly one text node, whose every ancestor is a plain
//             HTML element that does not hold its text.
//   Markdown  both documents are rendered by markdown-it in four configurations (the default;
//             `html: true`; `linkify: true`; `html: true, linkify: true, typographer: true`)
//             and each result is parsed by parse5, with scripting enabled and disabled. In
//             EVERY configuration the two trees must be identical except for the data of text
//             nodes whose ancestors are only `p` (and `body` and `html`). No tag, attribute,
//             code or structure may differ.
// Anything else is a disagreement: the check called a change wording that a real parser
// reads as something else.
//
// The test must also notice a weakened rule. So every refusal rule of the HTML reader has a
// witness written by hand: a document and an edit that the check must refuse. Each witness
// was proven to bite (2026-10-09): its rule was weakened in a scratch copy of the module, the
// witness then passed, and the copy was thrown away. The plan's Execution Record holds the
// table of rules, witnesses and results.
//
// parse5 and markdown-it are test-only dependencies (devDependencies, exact versions);
// nothing under src/ requires either. Both load ECMAScript modules with `require`, which
// needs Node.js 20.19 or later, or 22.12 or later: the guard below says so in one sentence.
//
// Size: by default 50,000 HTML and 12,000 Markdown cases. The long soak (6 million HTML and
// 1 million Markdown cases) runs with HOTFIX_DIFFERENTIAL_SOAK=1. Every case is a pure
// function of the seed and its index, so a failure names both and reproduces:
//   HOTFIX_DIFFERENTIAL_SEED=<seed>   another seed (default 20261009)
//   HOTFIX_DIFFERENTIAL_HTML=<count>  another number of HTML cases
//   HOTFIX_DIFFERENTIAL_MARKDOWN=<count>
//   HOTFIX_DIFFERENTIAL_FROM=<index>  the first case index (to run one share of a soak)
//   HOTFIX_DIFFERENTIAL_SHOW=<count>  also print that many plain visible-text edits the check refuses
// Plan: plans/todo/ctoc-checks-that-a-hotfix-is-really-small-and-safe-s1-the-hotfix-check.md,
// decisions at review of 2026-10-09.

const [NODE_MAJOR, NODE_MINOR] = process.versions.node.split('.').map(Number);
if (!((NODE_MAJOR === 20 && NODE_MINOR >= 19) || (NODE_MAJOR === 22 && NODE_MINOR >= 12) || NODE_MAJOR > 22)) {
  throw new Error('The differential test of the hotfix check needs Node.js 20.19 or later, or 22.12 or later, '
    + `because parse5 and markdown-it load ECMAScript modules with require; this is Node.js ${process.versions.node}.`);
}

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const parse5 = require('parse5');
const MarkdownIt = require('markdown-it');

const { route } = require('../src/lib/menu-screens');
const { ruleRefusal } = require('../src/lib/hotfix-check');

const SOAK = process.env.HOTFIX_DIFFERENTIAL_SOAK === '1';
const SEED = Number(process.env.HOTFIX_DIFFERENTIAL_SEED || 20261009);
const FROM = Number(process.env.HOTFIX_DIFFERENTIAL_FROM || 0);
const HTML_CASES = Number(process.env.HOTFIX_DIFFERENTIAL_HTML || (SOAK ? 6000000 : 50000));
const SHOW = Number(process.env.HOTFIX_DIFFERENTIAL_SHOW || 0);
const MARKDOWN_CASES = Number(process.env.HOTFIX_DIFFERENTIAL_MARKDOWN || (SOAK ? 1000000 : 12000));

/** The Markdown readers of the oracle: markdown-it in four configurations. */
const MARKDOWN_READERS = [
  ['the default', new MarkdownIt()],
  ['html', new MarkdownIt({ html: true })],
  ['linkify', new MarkdownIt({ linkify: true })],
  ['html, linkify and typographer', new MarkdownIt({ html: true, linkify: true, typographer: true })]
];

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
// The HTML generator.
// ---------------------------------------------------------------------------------------

const HOST_INLINE = ['span', 'b', 'i', 'em', 'strong', 'a', 'u', 's', 'small', 'label', 'q', 'cite', 'abbr', 'mark', 'sub',
  'sup', 'time', 'data', 'bdi', 'bdo', 'dfn', 'ins', 'del', 'button', 'output', 'meter', 'progress', 'summary', 'legend'];
const HOST_BLOCK = ['div', 'p', 'section', 'article', 'aside', 'header', 'footer', 'nav', 'main', 'h1', 'h2', 'h3', 'ul', 'ol',
  'li', 'dl', 'dt', 'dd', 'blockquote', 'figure', 'figcaption', 'address', 'details', 'dialog', 'form', 'fieldset', 'menu',
  'hgroup', 'ruby', 'rt', 'rp', 'map', 'object', 'audio', 'video', 'canvas', 'picture', 'td', 'tr', 'th', 'caption', 'tbody',
  'body', 'html', 'head', 'optgroup', 'option', 'datalist'];
const HOLDERS = ['code', 'pre', 'kbd', 'samp', 'var', 'template', 'x-foo', 'my-el', 'foo', 'file'];
const NON_HOST = ['center', 'font', 'big', 'tt', 'strike', 'nobr', 'marquee', 'applet', 'acronym', 'dir', 'listing', 'image',
  'keygen', 'menuitem', 'rb', 'rtc', 'search', 'bgsound', 'basefont', 'blink', 'frame', 'isindex', 'selectedcontent'];
const VOIDS = ['br', 'hr', 'img', 'input', 'wbr', 'meta', 'link', 'base', 'area', 'col', 'embed', 'param', 'source', 'track'];
/** Letters that fold to an ASCII letter in Unicode but not in HTML: the Kelvin sign and the long s. */
const KELVIN = '\u212a';
const LONG_S = '\u017f';
const ODD_SPACES = ['\u00a0', '\u2003', '\u3000', '\f', '\u000b', '\u0085', '\u2028', '\t'];
/** Characters of the control and format categories: an escape, a zero-width space, a right-to-left override, a soft hyphen, a word joiner, a tag character. */
const CONTROLS = ['\u001b[1m', '\u200b', '\u202e', '\u00ad', '\u2060', '\u{e0041}'];
const REFERENCES = ['&amp;', '&amp', '&lt;', '&gt;', '&quot;', '&nbsp;', '&copy;', '&copy', '&#65;', '&#x41;', '&#x41', '&not',
  '&notin;', '&hellip;', '&', '&x;', '&#;'];

/** A tag name as written: mostly as is, sometimes in capitals, sometimes with a letter that only looks like one. */
function written(r, name) {
  const roll = r() / Math.max(wild, 0.2);
  if (roll < 0.86 || roll >= 1) return name;
  if (roll < 0.91) return name.toUpperCase();
  if (roll < 0.94) return name[0].toUpperCase() + name.slice(1);
  if (roll < 0.97 && /k/.test(name)) return name.replace('k', KELVIN);
  if (/s/.test(name)) return name.replace('s', LONG_S);
  return name;
}

/** Visible text: one to three words, sometimes with a character reference, an odd space or a line break. */
function htmlText(r) {
  const parts = [];
  for (let n = 1 + int(r, 3); n > 0; n--) {
    parts.push(word(r));
    if (chance(r, 0.07)) parts.push(pick(r, REFERENCES));
    if (chance(r, 0.03)) parts.push(pick(r, ['a < b', '>', '"', "'", '=', '/', '.', ',', '!']));
    if (chance(r, 0.012 * wild)) parts.push(pick(r, CONTROLS));
  }
  let sep = ' ';
  if (chance(r, 0.06)) sep = pick(r, ODD_SPACES);
  else if (chance(r, 0.08)) sep = '\n';
  let out = parts.join(sep);
  if (chance(r, 0.03)) out = `&${out}`; // `&alpha` and `&alpha;` are character references too
  if (chance(r, 0.03)) out += ';';
  if (chance(r, 0.1)) out = ` ${out} `;
  return out;
}

const ATTRIBUTE_NAMES = ['class', 'id', 'title', 'href', 'value', 'lang', 'data-x', 'is', 'hidden', 'style', 'onclick', 'alt',
  'src', 'name', 'type', 'color', 'encoding', 'ID', `lin${KELVIN}`, 'definitionurl'];
/** Zero to two attributes, in every quoting form, well separated or not. */
function attributes(r) {
  if (chance(r, 0.62)) return '';
  let out = '';
  for (let n = 1 + int(r, 2); n > 0; n--) {
    const name = pick(r, ATTRIBUTE_NAMES);
    const v = chance(r, 0.25) ? `${word(r)} ${word(r)}` : word(r);
    const sep = chance(r, 1 - 0.1 * wild) ? ' ' : pick(r, ['\n', '\t', '/', '\f', '', '\u00a0', ' / ']);
    out += sep + weighted(r, [
      [30, () => `${name}="${v}"`],
      [12, () => `${name}='${v}'`],
      [12, () => `${name}=${v.replace(' ', '')}`],
      [6, () => name],
      [4, () => `${name} = "${v}"`],
      [W(4), () => `${name}="a>b ${v}"`],
      [W(3), () => `${name}='${v}"'`],
      [W(3), () => `${name}=${v.replace(' ', '')}/`],
      [W(2), () => `${name}="${v}`],
      [W(2), () => `${name}='${v}`],
      [2, () => `${name}=""`],
      [W(2), () => `${name}="${v}"${name}="${word(r)}"`],
      [W(2), () => `="${v}"`],
      [W(2), () => `${name}=&quot;${v}&quot;`],
      [W(1), () => `${name}="{${v}}"`],
      [W(1), () => `"${v}"`]
    ])();
  }
  if (chance(r, 0.05)) out += pick(r, ['/', ' /', ' ']);
  return out;
}

/** The generator's state for one document: the random source and how many more nodes it may make. */
function htmlKids(g, depth) {
  if (depth >= 3 || g.left <= 0) return htmlText(g.r);
  let out = '';
  for (let n = 1 + int(g.r, 3); n > 0 && g.left > 0; n--) out += htmlNode(g, depth + 1);
  return out;
}

function element(g, depth, names) {
  const r = g.r;
  const name = pick(r, names);
  const open = `<${written(r, name)}${attributes(r)}>`;
  const kids = htmlKids(g, depth);
  const roll = chance(r, 1 - 0.1 * wild) ? 0 : 0.9 + r() * 0.1;
  if (roll < 0.9) return `${open}${kids}</${written(r, name)}>`;
  if (roll < 0.94) return `${open}${kids}`; // never closed
  if (roll < 0.97) return `${open}${kids}</${written(r, name)} ${pick(r, ['x', '/', `class="${word(r)}"`])}>`;
  return `${open}${kids}</${pick(r, names)}>`; // closed by another name
}

const COMMENTS = [
  (w) => `<!-- ${w} -->`, (w) => `<!--${w}-->`, (w) => `<!-->${w}-->`, (w) => `<!--->${w}-->`,
  (w) => `<!-- ${w} --!> ${w} -->`, (w) => `<!-- ${w} <!-- ${w} --> ${w} -->`, (w) => `<!-- ${w}`,
  (w) => `<!${w}>`, (w) => `<?${w}?>`, (w) => `<![CDATA[${w}]]>`, (w) => `</ ${w}>`, (w) => `<!--${w}--!>`,
  (w) => `<!-- ${w} -- ${w} -->`, () => '<!---->', (w) => `<!-- ${w} ->${w}`, (w) => `<!-- <!-${w}-->`,
  (w) => `<!--\n${w}\n-->`, (w) => `<!- ${w} -->`, (w) => `<!-- ${w} <!--> ${w}`, (w) => `</>${w}`, (w) => `<!-- ${w} --\n>`
];

const RAW = [
  (w, x) => `<script>var a = "${w}";</script>`,
  (w, x) => `<script>\n${w}\n</script>`,
  (w, x) => `<script><!-- ${w} </script> ${x} --></script>`,
  (w, x) => `<script><!--<script>${w}</script>${x}-->${w}</script>`,
  (w, x) => `<script><!--<script>${w}</script>${x}</script>`,
  (w, x) => `<script>${w}</script x>${x}`,
  (w, x) => `<script>${w}</SCRIPT>${x}`,
  (w, x) => `<script src="${w}"/>${x}</script>`,
  (w, x) => `<script>${w}`,
  (w, x) => `<script>${w}</scriptx>${x}</script>`,
  (w, x) => `<script type="text/plain">${w}<!--</script>${x}-->`,
  (w, x) => `<style>.a{content:"${w}"}</style>`,
  (w, x) => `<style>${w}</style\n>${x}`,
  (w, x) => `<style><!-- ${w} </style> ${x} -->`,
  (w, x) => `<style>${w}`,
  (w, x) => `<textarea>${w}</textarea>`,
  (w, x) => `<textarea><b>${w}</b></textarea>${x}`,
  (w, x) => `<textarea>${w}`,
  (w, x) => `<textarea>${w}</textare>${x}</textarea>`,
  (w, x) => `<title>${w}</title>`,
  (w, x) => `<title>${w}<b>${x}</b></title>`,
  (w, x) => `<title>${w}</titl>${x}`,
  (w, x) => `<title>${w} &amp; ${x}</title>`,
  (w, x) => `<xmp>${w}<b>${x}</xmp>`,
  (w, x) => `<iframe>${w}</iframe>${x}`,
  (w, x) => `<iframe src="${w}"><p>${x}</p></iframe>`,
  (w, x) => `<noembed>${w}</noembed>${x}`,
  (w, x) => `<noframes>${w}<p>${x}</noframes>`,
  (w, x) => `<plaintext>${w}</plaintext>${x}`,
  (w, x) => `<${LONG_S}cript>${w}</${LONG_S}cript>${x}`,
  (w, x) => `<${LONG_S}tyle>${w}</${LONG_S}tyle>${x}`,
  (w, x) => `<lin${KELVIN} href="${w}">${x}`,
  (w, x) => `<lin${KELVIN}>${w}</lin${KELVIN}>${x}`
];

const NOSCRIPT = [
  (g, d, w, x) => `<noscript>${htmlKids(g, d)}</noscript>`,
  (g, d, w, x) => `<noscript><p>${w}</p></noscript>${x}`,
  (g, d, w, x) => `<noscript><!-- </noscript> ${w} -->${x}</noscript>`,
  (g, d, w, x) => `<noscript><style></noscript>${w}</style>${x}`,
  (g, d, w, x) => `<noscript><p>${w}</noscript>${x}`,
  (g, d, w, x) => `<noscript><a title="</noscript>${w}">${x}</a></noscript>`,
  (g, d, w, x) => `<noscript><textarea></noscript>${w}</textarea>${x}`,
  (g, d, w, x) => `<noscript><code>${w}</noscript>${x}</code>`,
  (g, d, w, x) => `<noscript><x-foo></noscript>${w}`,
  (g, d, w, x) => `<noscript><select><option></noscript>${w}</select>`,
  (g, d, w, x) => `<noscript>${w}`,
  (g, d, w, x) => `<noscript><img src="/${w}" alt="${x}"></noscript>`,
  (g, d, w, x) => `<noscript><script>"</noscript>${w}"</script>${x}</noscript>`,
  (g, d, w, x) => `<noscript></noscript x="${w}">${x}`,
  (g, d, w, x) => `<noscript>${w}<noscript>${x}</noscript></noscript>`,
  (g, d, w, x) => `<noscript><p>${w}</p><link rel="${x}"><style>.a{}</style></noscript>`,
  (g, d, w, x) => `<noscript> ${w} </noscript>${x}`,
  (g, d, w, x) => `<noscript><p>${w}</noscript>${x}</p></noscript>`,
  (g, d, w, x) => `<noscript><b>${w}</b></noscript><b>${x}</b>`,
  (g, d, w, x) => `<noscript><ul><li>${w}<li>${x}</ul></noscript>`,
  (g, d, w, x) => `<noscript><table><tr><td>${w}</table></noscript>${x}`,
  (g, d, w, x) => `<noscript></noscript>${w}</noscript>${x}`
];

function selectBox(g, depth) {
  const r = g.r;
  const name = chance(r, 0.75) ? 'select' : 'datalist';
  let out = `<${written(r, name)}${attributes(r)}>`;
  for (let n = 1 + int(r, 4); n > 0; n--) {
    const w = htmlText(r);
    out += weighted(r, [
      [18, () => `<option>${w}</option>`],
      [14, () => `<option value="${word(r)}">${w}</option>`],
      [10, () => `<option>${w}`],
      [8, () => `<option value="${word(r)}">${w}`],
      [4, () => `<option value>${w}</option>`],
      [3, () => `<option VALUE=x>${w}`],
      [4, () => `<optgroup label="${word(r)}"><option>${w}</optgroup>`],
      [4, () => `<optgroup><option value="x">${w}<option>${word(r)}`],
      [3, () => `<optgroup>${w}</optgroup>`],
      [4, () => '<hr>'],
      [5, () => w],
      [W(3), () => `<b>${w}</b>`],
      [W(3), () => `<option><b>${w}</b>${word(r)}</option>${word(r)}`],
      [W(3), () => `<option>${w}<b>${word(r)}<option value="x">${word(r)}`],
      [W(2), () => `<option value="x"><p>${w}</p>${word(r)}</option>`],
      [W(2), () => `<div>${w}</div>`],
      [W(2), () => `<input value="${word(r)}">${w}`],
      [W(2), () => `<script>${w}</script>`],
      [W(2), () => `<select>${w}`],
      [W(2), () => `<textarea>${w}</textarea>`],
      [W(2), () => `<option>${w}</select>${word(r)}</option>`],
      [2, () => `<option is="x" value="y">${w}</option>`],
      [2, () => `<option>${w}<hr>${word(r)}`],
      [2, () => `<option>${w}<optgroup>${word(r)}`],
      [W(2), () => `<option><span>${w}</option>${word(r)}</span>`],
      [2, () => `<!-- ${w} -->`],
      [W(1), () => `<template>${w}</template>`],
      [W(1), () => `<option>${w}</div>${word(r)}`],
      [W(1), () => `<option value="a"><option>${w}</option>${word(r)}</option>`]
    ])();
  }
  if (chance(r, 0.85)) out += `</${written(r, name)}>`;
  return out + (chance(r, 0.5) ? htmlText(r) : '');
}

function table(g, depth) {
  const r = g.r;
  let out = `<table${attributes(r)}>`;
  for (let n = 1 + int(r, 4); n > 0; n--) {
    const w = htmlText(r);
    out += weighted(r, [
      [16, () => `<tr><td>${htmlKids(g, depth)}</td></tr>`],
      [10, () => `<tr><td>${w}<td>${word(r)}`],
      [6, () => `<tr><th>${w}</th><td>${word(r)}</tr>`],
      [6, () => `<tbody><tr><td>${w}</td></tr></tbody>`],
      [4, () => `<thead><tr><th>${w}<tbody><tr><td>${word(r)}<tfoot><tr><td>${word(r)}`],
      [5, () => `<caption>${w}</caption>`],
      [3, () => `<caption>${w}`],
      [4, () => `<colgroup><col><col></colgroup>`],
      [3, () => `<colgroup>${w}`],
      [8, () => w],
      [W(5), () => `<b>${w}</b>`],
      [W(3), () => `<b>${w}`],
      [W(3), () => `<code>${w}<tr><td>${word(r)}</td></tr></code>`],
      [W(3), () => `<x-foo>${w}</x-foo>`],
      [W(3), () => `<x-foo>${w}<tr><td>${word(r)}</td></tr></x-foo>${word(r)}`],
      [W(3), () => `<p>${w}`],
      [W(2), () => `<input type="hidden" value="${word(r)}">${w}`],
      [W(2), () => `<input value="${word(r)}">${w}`],
      [W(2), () => `<form>${w}</form>`],
      [W(2), () => `<script>${w}</script>`],
      [W(2), () => `<template><td>${w}</td></template>`],
      [W(2), () => `<select><option>${w}<tr><td>${word(r)}`],
      [W(2), () => `<td>${w}</td>`],
      [W(2), () => `<tr>${w}</tr>`],
      [W(2), () => `<table><tr><td>${w}</table>`],
      [W(2), () => `<tr><td><table>${w}</td></tr>`],
      [W(2), () => `<a href="${word(r)}">${w}<tr><td>${word(r)}</a>`],
      [W(3), () => `<b><table><tr><td>${w}</td></tr></table></b><tr><td><p>${word(r)}</td></tr>`],
      [W(2), () => `<tr><b><table><tr><td>${w}</td></tr></table></b><td>${word(r)}</td></tr>`],
      [W(2), () => `<caption><table><tr><td>${w}</td></tr></table></caption>`],
      [W(2), () => `<template><table></table></template><tr><td>${w}</td></tr>`],
      [W(2), () => ` ${w}<tr><td>${word(r)}</td></tr>\n ${word(r)}`],
      [W(2), () => `<tbody> ${w}<tr> ${word(r)}<td>${word(r)}</td></tr></tbody>`],
      [2, () => `<!-- ${w} -->`],
      [W(1), () => `</td>${w}`],
      [W(1), () => `</table>${w}<tr><td>${word(r)}`]
    ])();
  }
  if (chance(r, 0.85)) out += '</table>';
  return out + (chance(r, 0.5) ? htmlText(r) : '');
}

/** Lists, definitions, paragraphs and ruby text with the end tags the standard lets a writer leave out. */
function optionalEnds(g, depth) {
  const r = g.r;
  const w = () => htmlText(r);
  const k = () => htmlKids(g, depth);
  return weighted(r, [
    [10, () => `<ul><li>${k()}<li>${w()}</ul>`],
    [6, () => `<ol${attributes(r)}><li>${w()}<li${attributes(r)}>${w()}</li><li>${w()}</ol>`],
    [4, () => `<ul><li><p>${w()}<li>${w()}<p>${w()}</ul>`],
    [8, () => `<p>${w()}<p${attributes(r)}>${k()}`],
    [5, () => `<div><p>${w()}</div>${w()}`],
    [W(5), () => `<p>${w()}<div>${w()}</div>${w()}</p>${w()}`],
    [5, () => `<dl><dt>${w()}<dd>${w()}<dt${attributes(r)}>${w()}<dd>${k()}</dl>`],
    [4, () => `<ruby>${w()}<rt>${w()}<rp>${w()}</ruby>`],
    [3, () => `<ruby>${w()}<rp>(<rt${attributes(r)}>${w()}<rp>)</ruby>${w()}`],
    [W(3), () => `<ruby>${w()}<span><rt>${w()}<rt>${w()}</span></ruby>${w()}`],
    [W(2), () => `<ruby><p>${w()}<rt>${w()}<rp>${w()}</ruby>`],
    [W(2), () => `<ruby><b>${w()}<rp>${w()}<rt>${w()}</b></ruby>`],
    [4, () => `<li>${w()}<li>${w()}`],
    [3, () => `<blockquote><p>${w()}</blockquote>${w()}`],
    [3, () => `<section><h1>${w()}</h1><p>${w()}</section>`],
    [W(3), () => `<p>${w()}<ul><li>${w()}</ul>${w()}</p>`],
    [W(3), () => `<p>${w()}<table><tr><td>${w()}</table>${w()}</p>`],
    [3, () => `<p${attributes(r)}>${w()}<h2>${w()}</h2>${w()}`],
    [W(3), () => `<a href="/x"><p>${w()}</a>${w()}`],
    [W(2), () => `<button><p>${w()}</button>${w()}`],
    [2, () => `<p>${w()}<hr>${w()}<pre>${w()}</pre>${w()}`],
    [W(2), () => `<dd>${w()}<li>${w()}</dd>${w()}`],
    [W(2), () => `<ul><li>${w()}</ul></li>${w()}`],
    [W(2), () => `<td>${w()}<td>${w()}</tr>${w()}`]
  ])();
}

/** Formatting elements and others closed in the wrong order, opened twice, or never. */
function misnested(g, depth) {
  const r = g.r;
  const w = () => htmlText(r);
  const a = pick(r, ['b', 'i', 'a', 'em', 'code', 'span', 'x-foo', 'font', 'nobr', 'u', 'button', 'h1', 'form', 'tt', 'label']);
  const b = pick(r, ['p', 'div', 'b', 'i', 'a', 'span', 'li', 'code', 'x-foo', 'h2', 'td', 'ul', 'section', 'object', 'button']);
  // The elements that bound a scope: what stands open outside one is not closed from inside it.
  const scope = pick(r, ['object', 'marquee', 'applet', 'template']);
  return weighted(r, [
    [14, () => `<${a}${attributes(r)}>${w()}<${b}>${w()}</${a}>${w()}</${b}>${w()}`],
    [6, () => `<${a}>${w()}<${a}${attributes(r)}>${w()}</${a}>${w()}</${a}>${w()}`],
    [6, () => `<${a}>${w()}<${a}>${w()}`],
    [6, () => `<p><${a}${attributes(r)}>${w()}</p>${w()}`],
    [5, () => `<${a}${attributes(r)}>${w()}<${b}>${w()}</${b}>${w()}</${b}>${w()}</${a}>${w()}`],
    [5, () => `<div><${a}${attributes(r)}>${w()}</div>${w()}`],
    [4, () => `<${a}${attributes(r)}><table><tr><td>${w()}</${a}>${w()}</td></tr></table>${w()}`],
    [4, () => `<p><${a}${attributes(r)}><div>${w()}</div>${w()}</${a}>${w()}</p>${w()}`],
    [4, () => `<${b}><${a}${attributes(r)}>${w()}</${b}>${w()}`],
    [3, () => `<${a}><${a}><${a}><${a}${attributes(r)}>${w()}</${a}></${a}></${a}></${a}>${w()}`],
    [3, () => `<h1>${w()}<h2>${w()}</h1>${w()}</h2>${w()}`],
    [3, () => `<form${attributes(r)}>${w()}<div><form>${w()}</form>${w()}</div>${w()}</form>${w()}`],
    [3, () => `<table><${a}${attributes(r)}><tr><td>${w()}</td></tr></table>${w()}`],
    [3, () => `<${a}${attributes(r)}><li>${w()}</${a}>${w()}`],
    [2, () => `<object><${a}${attributes(r)}>${w()}</object>${w()}</${a}>${w()}`],
    [2, () => `<marquee><code>${w()}</marquee>${w()}`],
    [2, () => `<applet><${a}>${w()}</applet>${w()}`],
    [3, () => `<p>${w()}<${scope}><p>${w()}</${scope}>${w()}</p>${w()}`],
    [3, () => `<ul><li>${w()}<${scope}><li>${w()}</${scope}>${w()}</ul>`],
    [2, () => `<a href="/x">${w()}<${scope}><a href="/y">${w()}</a></${scope}>${w()}</a>`],
    [2, () => `<button>${w()}<${scope}><button>${w()}</button></${scope}>${w()}</button>`],
    [2, () => `<table><tr><td>${w()}<${scope}><td>${w()}</td></${scope}>${w()}</td></tr></table>`]
  ])();
}

/** Stray tags: an end tag with nothing to close, a start tag never closed, and the document's own tags in odd places. */
function stray(g, depth) {
  const r = g.r;
  const w = htmlText(r);
  const any = pick(r, [...HOST_INLINE, ...HOST_BLOCK, ...HOLDERS, ...NON_HOST]);
  return weighted(r, [
    [8, () => `</${written(r, any)}>${w}`],
    [8, () => `<${written(r, any)}${attributes(r)}>${w}`],
    [3, () => `</br>${w}`],
    [3, () => `</p>${w}`],
    [4, () => `</body>${w}`],
    [4, () => `</html>${w}`],
    [4, () => `<body${attributes(r)}>${w}`],
    [4, () => `<html${attributes(r)}>${w}`],
    [2, () => `<body is="x">${w}</body>`],
    [2, () => `<html is="x">${w}`],
    [2, () => `<head>${w}</head>${word(r)}`],
    [2, () => `</head>${w}`],
    [2, () => `<div><body></body>${w}</div>`],
    [2, () => `<${written(r, any)}/>${w}`],
    [1, () => `<${word(r)}>${w}`],
    [1, () => `<a${pick(r, ODD_SPACES)}href="${word(r)}">${w}</a>`],
    [1, () => `< p>${w}</p>`],
    [1, () => `<p${word(r)}`]
  ])();
}

function foreign(g, depth) {
  const r = g.r;
  const w = () => htmlText(r);
  if (chance(r, 0.65)) {
    let out = `<svg${attributes(r)}>`;
    for (let n = 1 + int(r, 3); n > 0; n--) {
      out += weighted(r, [
        [10, () => `<g><text x="1">${w()}</text></g>`],
        [6, () => `<title>${w()}</title>`],
        [5, () => `<desc>${w()}<b>${w()}</b></desc>`],
        [6, () => `<foreignObject><p>${w()}</p></foreignObject>`],
        [4, () => `<foreignObject>${htmlKids(g, depth)}</foreignObject>`],
        [5, () => `<p>${w()}</p>`],
        [3, () => `<div>${w()}`],
        [3, () => `<b>${w()}</b>`],
        [3, () => `<font color="${word(r)}">${w()}</font>`],
        [3, () => `<font>${w()}</font>`],
        [3, () => `<img src="${word(r)}">${w()}`],
        [2, () => `<br>${w()}`],
        [3, () => `<script>${w()}</script>`],
        [3, () => `<style>${w()}</style>`],
        [3, () => `<![CDATA[${w()}]]>`],
        [3, () => `<a href="${word(r)}">${w()}</a>`],
        [3, () => `<path d="${word(r)}"/>${w()}`],
        [2, () => `<g/>${w()}`],
        [2, () => `<g>${w()}`],
        [2, () => `</g>${w()}`],
        [2, () => `<textarea>${w()}</textarea>`],
        [2, () => `<title><b>${w()}</title>${w()}</b>`],
        [2, () => `<!-- ${w()} -->`],
        [2, () => `</p>${w()}`],
        [2, () => `</br>${w()}`],
        [2, () => `<svg>${w()}</svg>`],
        [2, () => `<math><mi>${w()}</mi></math>`],
        [2, () => `<foreignobject><p>${w()}</p></foreignobject>`],
        [1, () => `<table>${w()}`],
        [1, () => w()]
      ])();
    }
    return out + (chance(r, 0.85) ? '</svg>' : '') + (chance(r, 0.6) ? w() : '');
  }
  let out = `<math${attributes(r)}>`;
  for (let n = 1 + int(r, 3); n > 0; n--) {
    out += weighted(r, [
      [10, () => `<mi>${w()}</mi>`],
      [5, () => `<mtext><b>${w()}</b></mtext>`],
      [5, () => `<mo>${w()}<p>${w()}</mo>`],
      [4, () => `<annotation-xml encoding="text/html"><p>${w()}</p></annotation-xml>`],
      [4, () => `<annotation-xml encoding="application/xhtml+xml">${htmlKids(g, depth)}</annotation-xml>`],
      [3, () => `<annotation-xml><p>${w()}</p></annotation-xml>`],
      [3, () => `<mglyph>${w()}</mglyph>`],
      [3, () => `<mi><mglyph>${w()}</mglyph></mi>`],
      [3, () => `<malignmark>${w()}`],
      [4, () => `<p>${w()}</p>`],
      [3, () => `<mrow><span>${w()}</span></mrow>`],
      [3, () => `<ms>${w()}<script>${w()}</script></ms>`],
      [2, () => `<mn>${w()}</mn>${w()}`],
      [2, () => `<svg><text>${w()}</text></svg>`],
      [2, () => `<mi/>${w()}`],
      [2, () => `<title>${w()}</title>`],
      [2, () => `<![CDATA[${w()}]]>`],
      [2, () => `</mi>${w()}`],
      [1, () => w()]
    ])();
  }
  return out + (chance(r, 0.85) ? '</math>' : '') + (chance(r, 0.6) ? w() : '');
}

const FRAMES = [
  (w, x) => `<frameset><frame src="${w}"></frameset>${x}`,
  (w, x) => `<frameset>${w}</frameset>`,
  (w, x) => `<frame src="${w}">${x}`,
  (w, x) => `<div></div><frameset><frame name="${w}"></frameset><noframes>${x}</noframes>`,
  (w, x) => `<frameset></frameset>${w}`,
  (w, x) => `<FRAMESET><frame>${w}</FRAMESET>`
];

/** The names whose start and end tags change what the parser has open: the soup is made of them. */
const SOUP = ['p', 'p', 'li', 'ul', 'ol', 'div', 'div', 'hr', 'x-foo', 'code', 'a', 'b', 'span', 'table', 'tr', 'td', 'th',
  'tbody', 'thead', 'caption', 'colgroup', 'col', 'option', 'optgroup', 'select', 'datalist', 'form', 'button', 'h1', 'h2',
  'dl', 'dt', 'dd', 'ruby', 'rt', 'rp', 'template', 'object', 'body', 'html', 'head', 'section', 'blockquote', 'pre', 'nobr',
  'font', 'input', 'br', 'image', 'keygen', 'menu', 'details', 'summary', 'fieldset', 'label', 'address', 'search', 'center',
  'marquee', 'applet', 'noscript'];

/**
 * Tag soup: a walk that opens elements, closes the innermost, closes one further out (which
 * leaves end tags out), closes one that is not open, and writes text in between. It reaches
 * the parser's rules for closing elements by itself in every order.
 */
function soup(g) {
  const r = g.r;
  const open = [];
  let out = '';
  for (let n = 3 + int(r, 10); n > 0; n--) {
    const roll = r();
    if (roll < 0.4) {
      const name = pick(r, SOUP);
      const attrs = chance(r, 0.12) ? pick(r, [' is="x"', ` value="${word(r)}"`, ` href="/${word(r)}"`, ` title="${word(r)}"`]) : '';
      out += `<${name}${attrs}>`;
      if (!VOIDS.includes(name)) open.push(name);
    } else if (roll < 0.66) {
      if (open.length > 0) out += `</${open.pop()}>`;
    } else if (roll < 0.74) {
      if (open.length > 1) out += `</${open.splice(int(r, open.length - 1), open.length)[0]}>`;
    } else if (roll < 0.78) {
      out += `</${pick(r, SOUP)}>`;
    } else {
      out += chance(r, 0.85) ? word(r) : htmlText(r);
    }
  }
  if (chance(r, 0.85)) while (open.length > 0) out += `</${open.pop()}>`;
  return out + (chance(r, 0.6) ? word(r) : '');
}

function htmlNode(g, depth) {
  const r = g.r;
  g.left--;
  const w = word(r);
  const x = word(r);
  return weighted(r, [
    [34, () => htmlText(r)],
    [14, () => element(g, depth, HOST_INLINE)],
    [14, () => element(g, depth, HOST_BLOCK)],
    [7, () => element(g, depth, HOLDERS)],
    [3, () => element(g, depth, NON_HOST)],
    [7, () => optionalEnds(g, depth)],
    [9, () => soup(g)],
    [5, () => `<${written(r, pick(r, VOIDS))}${attributes(r)}>`],
    [W(5), () => pick(r, COMMENTS)(w)],
    [W(5), () => pick(r, RAW)(w, x)],
    [W(3), () => pick(r, NOSCRIPT)(g, depth, w, x)],
    [5, () => selectBox(g, depth)],
    [5, () => table(g, depth)],
    [W(5), () => misnested(g, depth)],
    [W(4), () => stray(g, depth)],
    [W(4), () => foreign(g, depth)],
    [W(1), () => pick(r, FRAMES)(w, x)]
  ])();
}

const DOCTYPES = ['<!DOCTYPE html>\n', '<!doctype html>\n', '<!DOCTYPE HTML>\n', ''];
const OLD_DOCTYPES = ['<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN">\n', '<!DOCTYPE html SYSTEM "about:legacy-compat">\n',
  '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">\n', '<!doctype htm>\n', '<!DOCTYPE html >\n'];

/** What may stand before the doctype: white space and a comment leave it the doctype; text or a tag puts the page in quirks mode. */
const BEFORE_DOCTYPE = ['Draft', '<!-- c -->', '<p>x</p>', ' \n', 'x ', '<br>', '\n<!-- c -->\n'];
/** The finished document: sometimes something before its doctype, sometimes a byte-order mark (or two) before everything. */
function marked(r, text) {
  let out = text;
  if (chance(r, 0.05 * wild)) out = pick(r, BEFORE_DOCTYPE) + out;
  if (chance(r, 0.04)) out = `\uFEFF${out}`;
  if (chance(r, 0.005)) out = `\uFEFF${out}`;
  return out;
}

/** One HTML document: a doctype or none, the document's own tags written or left out, and a body of nodes. */
function htmlDocument(r) {
  const g = { r, left: 3 + int(r, 9) };
  wild = pick(r, [0.1, 0.35, 1, 1]);
  let body = '';
  for (let n = 1 + int(r, 4); n > 0 && g.left > 0; n--) body += `${htmlNode(g, 0)}${chance(r, 0.6) ? '\n' : ''}`;
  const doctype = pick(r, chance(r, 0.2 * wild) ? OLD_DOCTYPES : DOCTYPES);
  const shape = r();
  if (shape < 0.3) return marked(r, `${doctype}${body}\n`);
  const head = weighted(r, [
    [30, () => `<title>${word(r)}</title>\n`],
    [10, () => ''],
    [6, () => `<meta charset="utf-8">\n<title>${word(r)}</title>\n<link rel="stylesheet" href="/${word(r)}.css">\n`],
    [5, () => `<style>.a { color: red; } /* ${word(r)} */</style>\n`],
    [5, () => `<script src="/${word(r)}.js"></script>\n`],
    [W(5), () => `${pick(r, NOSCRIPT)(g, 2, word(r), word(r))}\n`],
    [W(4), () => `${word(r)}\n`],
    [W(3), () => ` ${word(r)}\n<title>${word(r)}</title>\n`],
    [W(4), () => `<p>${word(r)}</p>\n`],
    [3, () => `<base href="/${word(r)}/">\n`],
    [3, () => `<template>${word(r)}</template>\n`],
    [2, () => `<!-- ${word(r)} -->\n`]
  ])();
  if (shape < 0.72) return marked(r, `${doctype}<html${attributes(r)}>\n<head>\n${head}</head>\n<body${attributes(r)}>\n${body}\n</body>\n</html>\n`);
  const keep = () => chance(r, 0.5);
  let out = doctype;
  if (keep()) out += `<html${attributes(r)}>${chance(r, 0.15 * wild) ? pick(r, [' ', ` ${word(r)}`, word(r)]) : ''}\n`;
  if (keep()) out += '<head>\n';
  out += head;
  if (keep()) out += '</head>\n';
  if (keep()) out += `<body${attributes(r)}>\n`;
  out += `${body}\n`;
  if (keep()) out += '</body>\n';
  if (chance(r, 0.3 * wild)) out += weighted(r, [[3, () => `${htmlText(r)}\n`], [2, () => `<!-- ${word(r)} -->\n`], [2, () => `<p>${htmlText(r)}</p>\n`], [3, () => pick(r, [' ', '  \n', '\t\n'])]])();
  if (keep()) out += '</html>\n';
  if (chance(r, 0.15 * wild)) out += weighted(r, [[3, () => `${htmlText(r)}\n`], [2, () => `<!-- ${word(r)} -->\n`], [2, () => `<b>${htmlText(r)}</b>\n`]])();
  return marked(r, out);
}

// ---------------------------------------------------------------------------------------
// The Markdown generator: every construct of the security run's findings, the shapes on
// which Markdown readers disagree, and plain paragraphs in all positions.
// ---------------------------------------------------------------------------------------

const LABELS = ['ref', 'note', 'Ref', 'two words'];
/** Filler a plain sentence is made of, beside the words an edit replaces. */
const FILLER = ['the', 'a', 'Read', 'then', 'and', 'It', 'well-known', 'caf\u00e9', 'na\u00efve', 'we', 'Save', 'file'];

/** One plain prose line: words, sentence punctuation, quotes, a hyphenated word, typographic marks. */
function plainLine(r) {
  const parts = [];
  for (let n = 2 + int(r, 5); n > 0; n--) {
    let w = chance(r, 0.6) ? word(r) : pick(r, FILLER);
    const roll = r();
    if (roll < 0.1) w += ',';
    else if (roll < 0.14) w += ';';
    else if (roll < 0.17) w = `"${w}"`;
    else if (roll < 0.19) w = `\u201c${w}\u201d`;
    else if (roll < 0.21) w += ' \u2014';
    else if (roll < 0.23) w += '\u2026';
    else if (roll < 0.25) w = `${w}'s`;
    else if (roll < 0.27) w += ` ${1 + int(r, 30)}`;
    parts.push(w);
  }
  let out = parts.join(' ');
  out = out[0].toUpperCase() + out.slice(1);
  return out + pick(r, ['.', '.', '.', '', '?', '!']);
}
/** A plain paragraph: one to three plain lines, the later ones sometimes indented, sometimes ending in two spaces. */
function plainParagraph(r) {
  const lines = [];
  for (let n = 1 + int(r, 3); n > 0; n--) lines.push(plainLine(r));
  return lines.map((l, i) => (i > 0 && chance(r, 0.1) ? `${' '.repeat(1 + int(r, 3))}${l}` : l) + (chance(r, 0.05) ? '  ' : ''));
}

function inlinePiece(r) {
  const w = word(r);
  const x = word(r);
  const label = pick(r, LABELS);
  return weighted(r, [
    [40 / wild, () => w],
    [4, () => `*${w}*`],
    [3, () => `**${w} ${x}**`],
    [2, () => `_${w}_`],
    [5, () => `\`${w}\``],
    [2, () => `\`\`${w} \` ${x}\`\``],
    [2, () => `\`${w}`],
    [5, () => `[${w}](/${x})`],
    [3, () => `[${w}](/${x} "${word(r)}")`],
    [2, () => `[${w}](</${x}>)`],
    [2, () => `[${w}](${x}`],
    [3, () => `![${w}](/${x}.png)`],
    [3, () => `[${w}][${label}]`],
    [3, () => `[${label}]`],
    [2, () => `[${w}][]`],
    [2, () => `[${w}]`],
    [3, () => `<https://${w}.example/${x}>`],
    [2, () => `<${w}@example.com>`],
    [W(4), () => `<b>${w}</b>`],
    [3, () => `<a href="/${w}">${x}</a>`],
    [3, () => `<code>${w}</code>`],
    [W(2), () => `<x-foo>${w}</x-foo>`],
    [3, () => `<file> ${w}`],
    [2, () => `<!-- ${w} -->`],
    [1, () => `<!-- ${w}`],
    [1, () => `<br> ${w}`],
    [2, () => `<img src="/${w}.png" alt="${x}">`],
    [2, () => `&amp; ${w}`],
    [1, () => `&${w};`],
    [2, () => `\\*${w}\\*`],
    [2, () => `\\<b>${w}`],
    [2, () => `\\<script>${w}`],
    [2, () => `\`<${w}>\``],
    [2, () => `\`<script>\` ${w}`],
    [1, () => `\\\`<script>\` ${w}`],
    [1, () => `\`\`<b> \` <i>\`\` ${w}`],
    [1, () => `\`${w} | <script>\` ${x}`],
    [1, () => `\`${w}\` <i> \`${x}\``],
    [1, () => `\`a\n<div>\n\` ${w}`],
    [W(2), () => `<b>${w}`],
    [1, () => `</b> ${w}`],
    [1, () => `| ${w}`],
    [1, () => `a < ${w}`],
    [W(1), () => `<script>${w}</script>`],
    [1, () => `<textarea>${w}</textarea> ${x}`],
    [1, () => `${w}.com`],
    [1, () => `README.md ${w}`],
    [1, () => `{${w}}`],
    [1, () => `[[${w} guide]]`],
    [1, () => `${w}:${x}`],
    [1, () => `Template: ${w}`],
    [1, () => `(${w})`],
    [1, () => `${w}  `],
    [1, () => `${w}\\`]
  ])();
}
function inlineLine(r) {
  const parts = [];
  for (let n = 1 + int(r, 4); n > 0; n--) parts.push(inlinePiece(r));
  return parts.join(' ');
}
function paragraph(r) {
  if (chance(r, 0.5 / wild)) return plainParagraph(r);
  const lines = [];
  for (let n = 1 + int(r, 3); n > 0; n--) lines.push(chance(r, 0.4) ? plainLine(r) : inlineLine(r));
  return lines;
}

const DEFINITIONS = [
  (l, w, x) => [`[${l}]: /${w}`],
  (l, w, x) => [`[${l}]: /${w} "${x}"`],
  (l, w, x) => [`[${l}]:`, `  /${w}`],
  (l, w, x) => [`[${l}]: /${w}`, `  "${x}"`],
  (l, w, x) => [`[${l}]: /${w}`, `${x}`],
  (l, w, x) => [`[g]: guide/${w}`],
  (l, w, x) => [`[${l}]:`, '```', w, '```', '', `Read ${x} ${w} then.`],
  (l, w, x) => [`[${l}]:`, '~~~js', w, '~~~', '', `Read ${x} ${w} then.`, '', '~~~'],
  (l, w, x) => [`[${l}]:`, '---', `Read ${x} ${w} then.`],
  (l, w, x) => [`[${l}]:`, '<div>', '', `Read ${x} ${w} then.`]
];

const HTML_BLOCKS = [
  (r, w, x) => ['<div>', plainLine(r), '</div>'],
  (r, w, x) => ['<div>', '', ...plainParagraph(r), '', '</div>'],
  (r, w, x) => ['<div markdown="1">', '', ...plainParagraph(r), '', '</div>'],
  (r, w, x) => ['<div>', '', ...plainParagraph(r)],
  (r, w, x) => ['<x-foo>', '', ...plainParagraph(r), '', '</x-foo>'],
  (r, w, x) => ['<run-sql>', '', `Select ${w} from ${x}`, '', '</run-sql>'],
  (r, w, x) => ['<details>', `<summary>${w}</summary>`, '', ...plainParagraph(r), '', '</details>'],
  (r, w, x) => ['<table>', `<tr><td>${w}</td></tr>`, '</table>'],
  (r, w, x) => ['<pre>', w, '', plainLine(r), '</pre>'],
  (r, w, x) => ['<pre>', `<!-- </pre> -->`, '', plainLine(r)],
  (r, w, x) => ['<script>', w, '', plainLine(r), '</script>'],
  (r, w, x) => ['<script>', '</pre>', '', `\`</script>\``, '', plainLine(r)],
  (r, w, x) => ['<script>', '<!--<script>', '</script>', '', plainLine(r), '', '</script>'],
  (r, w, x) => ['<style>', `.a { content: "${w}" }`, '', plainLine(r), '</style>'],
  (r, w, x) => ['<textarea>', w, '', plainLine(r), '</textarea>'],
  (r, w, x) => ['<xmp>', '', '`</xmp>`', '', plainLine(r)],
  (r, w, x) => ['<title>', w, '', plainLine(r)],
  (r, w, x) => ['<noscript>', '', plainLine(r), '', '</noscript>'],
  (r, w, x) => ['<iframe>', '', plainLine(r)],
  (r, w, x) => ['<plaintext>', '', plainLine(r)],
  (r, w, x) => ['<!--', w, '', plainLine(r), '-->'],
  (r, w, x) => [`<!-- ${w} -->`],
  (r, w, x) => [`<!-- ${w} -->`, plainLine(r)],
  (r, w, x) => [`<!-- ${w} --> ${x}`],
  (r, w, x) => [`<!-- ${w} --!>`, '', plainLine(r), '', '-->'],
  (r, w, x) => [`<!-->${w}`, '', plainLine(r)],
  (r, w, x) => [`<!-- ${w} -- ${x} -->`, '', plainLine(r)],
  (r, w, x) => [` <!-- ${w}`, '', '-->', '', plainLine(r)],
  (r, w, x) => [`> <!-- ${w}`, '', '-->', '', plainLine(r)],
  (r, w, x) => [`- ${w}`, '', `  <!-- ${x}`, '', '-->', '', plainLine(r)],
  (r, w, x) => [`<!-- ${w}`, '', '-->', '', plainLine(r)],
  (r, w, x) => [`<?${w}`, '', plainLine(r), '?>'],
  (r, w, x) => [`<!${w}`, '', plainLine(r), '>'],
  (r, w, x) => ['<![CDATA[', w, '', plainLine(r), ']]>'],
  (r, w, x) => ['<hr>', `<https://${w}.example/${x}>`, '', plainLine(r)],
  (r, w, x) => [`<a href="/${w}"><div></a></div>`, '', plainLine(r)],
  (r, w, x) => [`<img src="/${w}.png" alt="${x}">`],
  (r, w, x) => [`<img alt="${w}>`, '', plainLine(r), '', '">'],
  (r, w, x) => [`<br>`, '', plainLine(r)],
  (r, w, x) => [`<b>`, '', plainLine(r), '', '</b>'],
  (r, w, x) => ['<svg>', `<text>${w}</text>`, '', plainLine(r), '</svg>'],
  (r, w, x) => ['<select>', `<option>${w}`, '', plainLine(r), '</select>']
];

const quoteLines = (r, lines) => lines.map((l, i) => {
  if (i > 0 && l !== '' && chance(r, 0.18)) return l; // a lazy line
  const marker = weighted(r, [[20, () => '> '], [4, () => '>'], [1, () => '>\t'], [1, () => ' > '], [1, () => '>> > \t']])();
  return (marker + l).replace(/\s+$/, l === '' ? '' : '$&');
});
function listLines(r, lines) {
  const marker = pick(r, ['- ', '- ', '* ', '+ ', '1. ', '2. ', '1) ', '-   ', '10. ', '-\t', '- [ ] ', '- [x] ']);
  const width = marker === '-\t' ? 4 : Math.min(marker.length, 4);
  return lines.map((l, i) => {
    if (i === 0) return marker + l;
    if (l === '') return l;
    const roll = r();
    if (roll < 0.6) return ' '.repeat(width) + l;
    if (roll < 0.85) return l; // a lazy line, or the end of the item
    return ' '.repeat(pick(r, [1, 2, 3, 4, 5, 6])) + l;
  });
}
const FENCES = [
  (w, x, p) => ['```', w, '', p, '```'],
  (w, x, p) => ['```js', w, '```'],
  (w, x, p) => ['~~~', w, '', p, '~~~'],
  (w, x, p) => ['````', '```', p, '````'],
  (w, x, p) => ['```', w, '', p],
  (w, x, p) => ['```', w, '````', '', p, '', '```'],
  (w, x, p) => [' ```', w, '```', '', p, '', '```'],
  (w, x, p) => ['```', w, ' ```', '', p, '', '```'],
  (w, x, p) => ['   ```', w, '   ```', '', p],
  (w, x, p) => ['    ```', w, '    ```', '', p],
  (w, x, p) => ['``` foo bar', w, '```', '', p, '', '```'],
  (w, x, p) => ['```js title="a.js"', w, '```', '', p],
  (w, x, p) => ['```', w, '```\u00a0', '', p, '', '```'],
  (w, x, p) => ['```', w, '```\t', '', p],
  (w, x, p) => ['\t```', w, '```', '', p],
  (w, x, p) => [`\`\`\` ${w} \`\`\``, '', p],
  (w, x, p) => ['~~~ a ` b', w, '~~~', '', p],
  (w, x, p) => ['```', '~~~', p, '```', '', '~~~'],
  (w, x, p) => ['```', w, '``` x', p, '```'],
  (w, x, p) => ['```', '<div>', '', '<script>', '```', '', p],
  (w, x, p) => ['  ```', '<div>', '  ```', '', p],
  (w, x, p) => ['\ufeff```', w, '```', '', p, '', '```']
];
const FRONT_MATTER = [
  (w, x, p) => ['---', `title: ${w}`, '---'],
  (w, x, p) => ['---', p, '---'],
  (w, x, p) => ['+++', `title = "${w}"`, '', p, '+++'],
  (w, x, p) => ['---js', `{ title: "${w}" }`, '', p, '---'],
  (w, x, p) => ['---', `title: ${w}`, '', p],
  (w, x, p) => ['---', 'text: |', '  ```', '---', '', p, '', '```'],
  (w, x, p) => ['---', `title: ${w}`, '...', '', p],
  (w, x, p) => ['----', p, '', plain(p), '---'],
  (w, x, p) => ['+++', p, '---', '', plain(p), '', '+++'],
  (w, x, p) => ['\ufeff---', `title: ${w}`, '', p, '---'],
  (w, x, p) => ['---', `title: ${w}`, '---', p, '', plain(p), '', '---'],
  (w, x, p) => ['---', `The ${w}: [`, '---', p, '', plain(p), '', '---'],
  (w, x, p) => ['----------- ------- ----------', `First       ${w}     ${x}`, '', p, '', plain(p), '----------- ------- ----------'],
  (w, x, p) => ['----', p, '', plain(p), '----'],
  (w, x, p) => ['Right     Left', '-------   ------', `${w}     ${x}`, '', p],
  (w, x, p) => ['+++', `title = "${w}"`, '+++', p, '', plain(p)]
];
const plain = (p) => p.replace('.', '');

function block(r, depth) {
  const w = word(r);
  const x = word(r);
  const p = plainLine(r);
  return weighted(r, [
    [44 / wild, () => plainParagraph(r)],
    [10, () => paragraph(r)],
    [5, () => [`${'#'.repeat(1 + int(r, 3))} ${chance(r, 0.5) ? plainLine(r) : inlineLine(r)}`]],
    [2, () => [`## ${w} !`]],
    [3, () => [plainLine(r), pick(r, ['===', '---', '=', '--', '-'])]],
    [2, () => [plainLine(r), '', pick(r, ['===', '---'])]],
    [8, () => (depth >= 2 ? paragraph(r) : listLines(r, blocks(r, depth + 1, 1 + int(r, 2))))],
    [4, () => [...listLines(r, plainParagraph(r)), ...listLines(r, plainParagraph(r))]],
    [3, () => [`${pick(r, ['- ', '1. ', '* ', '-   '])}${w}`, '', `${' '.repeat(int(r, 4))}${plainLine(r)}`]],
    [2, () => [`${pick(r, ['- ', '1. ', '* '])}${w}`, plainLine(r)]],
    [2, () => [`-   ${w}:`, '', `        ${x} ${w}`]],
    [7, () => (depth >= 2 ? quoteLines(r, paragraph(r)) : quoteLines(r, blocks(r, depth + 1, 1 + int(r, 2))))],
    [2, () => [...quoteLines(r, plainParagraph(r)), plainLine(r)]],
    [1, () => [`> [!NOTE]`, `> ${plainLine(r)}`]],
    [4, () => [`| ${w} | ${x} |`, '| --- | --- |', `| ${chance(r, 0.5) ? plainLine(r) : inlineLine(r)} | ${word(r)} |`]],
    [1, () => [`| a | b |`, '| - | - |', `| \`${w} | <script>\` | ${x} |`]],
    [6, () => pick(r, DEFINITIONS)(pick(r, LABELS), w, x)],
    [2, () => [plainLine(r), `[g]: guide/${w}`]],
    [10, () => pick(r, HTML_BLOCKS)(r, w, x)],
    [9, () => pick(r, FENCES)(w, x, p)],
    [3, () => [`    ${w}`, `    ${x}`]],
    [1, () => [`\t${w}`]],
    [1, () => [`\ufeff    ${w} ${x}`]],
    [2, () => [plainLine(r), `    ${w}`]],
    [2, () => [pick(r, ['---', '***', '* * *', '___'])]],
    [2, () => ['---', plainLine(r)]],
    [3, () => pick(r, FRONT_MATTER)(w, x, p)],
    [1, () => [`import ${w} from './${x}'`]],
    [1, () => [`>>> ${w}`, x]],
    [1, () => [`::: tip`, p, ':::']],
    [1, () => [`!!! note`, `    ${p}`]],
    [1, () => [`Term ${w}`, `: ${p}`]],
    [1, () => [`${pick(r, ['a', 'i', 'A', 'iv'])}. ${p}`]],
    [1, () => [`${w}\r${pick(r, ['```', '- x', '# y'])}`, '', p]],
    [1, () => [`${w} \u2028 ${x}`]],
    [1, () => [`${w}\u00a0${x}`, `\u200b${p}`]]
  ])();
}
function blocks(r, depth, count) {
  const out = [];
  for (let n = 0; n < count; n++) {
    if (n > 0 && chance(r, 0.8)) out.push(chance(r, 0.04) ? pick(r, [' ', '\t', '\u00a0', '  ']) : '');
    out.push(...block(r, depth));
  }
  return out;
}
function markdownDocument(r) {
  wild = pick(r, [0.1, 0.35, 1, 1]);
  const lines = [];
  if (chance(r, 0.08)) lines.push(...pick(r, FRONT_MATTER)(word(r), word(r), plainLine(r)), ...(chance(r, 0.7) ? [''] : []));
  lines.push(...blocks(r, 0, 1 + int(r, 6)));
  let text = `${lines.join('\n')}\n`;
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
  markdown: {
    marks: ['[', ']', '(', ')', '`', '*', '_', '#', '>', '|', '<', ':', '!'],
    starts: ['- ', '> ', '# ', '1. ', ' ', '    ', 'a. ', '\t', '* ', '+ ', '[g]: ', ': ', '<', '```', '---', '| ', '! ', 'x', 'import ', 'i. '],
    added: [(r) => plainLine(r), (r) => plainLine(r), () => '', () => '```', () => '---', () => '===', (r) => `- ${word(r)}`,
      (r) => `> ${word(r)}`, (r) => `# ${word(r)}`, () => '<div>', () => '</div>', () => '<!--', () => '-->', (r) => `    ${word(r)}`, (r) => `[g]: /${word(r)}`]
  },
  html: {
    marks: ['<', '>', '&', '"', '\'', '=', '/', ';', '!', '-', '{', '`'],
    starts: ['<p>', '</p>', '<', ' ', '\t', '<!--', 'x', '</', '  ', '<b>', '&'],
    added: [(r) => `<p>${word(r)}</p>`, () => '<div>', () => '</div>', (r) => `<!-- ${word(r)} -->`, (r) => word(r), () => '', () => '<br>', () => '</body>']
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

const FILES = { html: 'site/page.html', markdown: 'docs/page.md' };

function judge(kind, oldText, newText) {
  const rel = FILES[kind];
  const hunks = hunksOf(oldText, newText);
  return ruleRefusal({
    files: [{ display: rel, topRel: rel, status: 'M', oldMode: '100644', newMode: '100644', oldSha: null, oldText, newText, hunks }],
    lineCount: hunks.reduce((n, h) => n + h.removed.length + h.added.length, 0)
  });
}

// ---------------------------------------------------------------------------------------
// The oracle: what the real parsers say the edit changed.
// ---------------------------------------------------------------------------------------

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
/** The HTML element names: the oracle's own copy of the 111 names of Vue's `isHTMLTag` list. */
const HOST = new Set((
  'html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,'
  + 'nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,'
  + 'code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,'
  + 'track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,'
  + 'tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,'
  + 'select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot').split(','));
assert.equal(HOST.size, 111);
const HOLDS_TEXT = new Set(['script', 'style', 'textarea', 'template', 'code', 'pre', 'kbd', 'samp', 'var']);

/**
 * Walk two trees side by side. Returns the first difference that is no text node's data,
 * as a sentence, or null; `changed` gains every text node whose data differs, with its
 * ancestors (the template content of a `<template>` counts as inside it).
 */
function treeDifference(a, b, ancestors, changed) {
  if (a.nodeName !== b.nodeName) return 'the tree has another shape';
  if (a.nodeName === '#text') {
    if (a.value !== b.value) changed.push(ancestors.slice());
    return null;
  }
  if (a.nodeName === '#comment') return a.data === b.data ? null : 'a comment differs';
  if (a.nodeName === '#documentType') {
    return a.name === b.name && a.publicId === b.publicId && a.systemId === b.systemId ? null : 'the doctype differs';
  }
  if (a.tagName) {
    if (a.namespaceURI !== b.namespaceURI || a.attrs.length !== b.attrs.length) return 'the tree has another shape';
    for (let i = 0; i < a.attrs.length; i++) {
      const x = a.attrs[i];
      const y = b.attrs[i];
      if (x.name !== y.name) return 'an attribute name differs';
      if (x.value !== y.value) {
        if (x.name === 'href' || x.name === 'src') return 'a link destination differs';
        if (x.name === 'value') return 'a form value differs';
        return 'an attribute differs';
      }
    }
    ancestors.push(a);
  } else if (a.mode !== b.mode) return 'the document mode differs';
  let found = null;
  if (a.childNodes.length !== b.childNodes.length) found = 'the tree has another shape';
  for (let i = 0; !found && i < a.childNodes.length; i++) found = treeDifference(a.childNodes[i], b.childNodes[i], ancestors, changed);
  if (!found && a.content) found = treeDifference(a.content, b.content, ancestors, changed);
  if (a.tagName) ancestors.pop();
  return found;
}

/** Why a changed text node is no plain visible text, from its ancestors; null when it is. */
function heldBy(ancestors) {
  let select = false;
  for (const el of ancestors) {
    const name = el.tagName;
    if (el.namespaceURI !== HTML_NAMESPACE) return 'text inside svg or math changes';
    if (!HOST.has(name) || name.includes('-')) return 'text inside a custom or unknown element changes';
    if (el.attrs.some((x) => x.name === 'is')) return 'text inside an element with an is attribute changes';
    if (name === 'script') return 'script text changes';
    if (name === 'style') return 'style text changes';
    if (HOLDS_TEXT.has(name)) return `text inside a ${name} element changes`;
    if (name === 'select') select = true;
    if (name === 'option') {
      if (!el.attrs.some((x) => x.name === 'value')) return 'the text of an option without a value changes';
      select = false;
    }
  }
  return select ? 'text inside a select, outside an option, changes' : null;
}

/** A browser takes one leading byte-order mark off the page before it reads it. */
const withoutMark = (text) => (text[0] === '\ufeff' ? text.slice(1) : text);

/**
 * What the HTML parser says about one edit of an HTML document, with scripting enabled and
 * disabled: null when it is a change to one plain visible text node and nothing else, or
 * the first reason it is not.
 */
function htmlOracle(oldText, newText) {
  for (const scriptingEnabled of [true, false]) {
    const a = parse5.parse(withoutMark(oldText), { scriptingEnabled });
    const b = parse5.parse(withoutMark(newText), { scriptingEnabled });
    const changed = [];
    const difference = treeDifference(a, b, [], changed);
    if (difference) return difference;
    if (changed.length === 0) return 'no text changes';
    if (changed.length > 1) return 'more than one text node changes';
    const held = heldBy(changed[0]);
    if (held) return held;
  }
  return null;
}

/** The only elements a changed Markdown text node may stand in. */
const PROSE_ANCESTORS = new Set(['html', 'body', 'p']);

/**
 * What the Markdown readers say about one edit of a Markdown document: null when, in every
 * configuration and with scripting enabled and disabled, the two rendered trees are
 * identical except for the data of text nodes whose ancestors are only `p`, `body` and
 * `html`; or the configuration and the first reason they are not.
 */
function markdownOracle(oldText, newText) {
  for (const [name, reader] of MARKDOWN_READERS) {
    const oldHtml = reader.render(oldText);
    const newHtml = reader.render(newText);
    for (const scriptingEnabled of [true, false]) {
      const changed = [];
      const difference = treeDifference(parse5.parse(oldHtml, { scriptingEnabled }), parse5.parse(newHtml, { scriptingEnabled }), [], changed);
      if (difference) return `${name}: ${difference}`;
      for (const ancestors of changed) {
        const holder = ancestors.find((el) => el.namespaceURI !== HTML_NAMESPACE || !PROSE_ANCESTORS.has(el.tagName));
        if (holder) return `${name}: text inside <${holder.tagName}> changes`;
      }
    }
  }
  return null;
}

const ORACLES = { html: htmlOracle, markdown: markdownOracle };
/** Whether the default reader alone calls the edit a change to plain text and nothing else (for the count of refused plain edits). */
const PLAIN = {
  html: (o, n) => htmlOracle(o, n) === null,
  markdown: (o, n) => {
    const changed = [];
    const [, reader] = MARKDOWN_READERS[0];
    return treeDifference(parse5.parse(reader.render(o)), parse5.parse(reader.render(n)), [], changed) === null && changed.length > 0
      && changed.every((ancestors) => ancestors.every((el) => PROSE_ANCESTORS.has(el.tagName)));
  }
};

// ---------------------------------------------------------------------------------------
// The run.
// ---------------------------------------------------------------------------------------

/** One case: the document, its edit, the kind of edit. */
function caseOf(kind, index, seed = SEED) {
  const r = stream(seed + (kind === 'html' ? 0 : 7919), index);
  const oldText = kind === 'html' ? htmlDocument(r) : markdownDocument(r);
  const e = edit(r, oldText, EDIT_WORDS[kind]);
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
  html: {
    'a comment': /<!--/, 'a doctype': /<!doctype html>/i, 'no doctype': /^\ufeff?(?!<!doctype)/i, 'a table': /<table/, 'a list': /<li/,
    'an end tag left out': /<li>[^<]*<li>|<p>[^<]*<p>|<td>[^<]*<td>|<dt>[^<]*<dd>/, 'a select': /<select/, 'an option with a value': /<option value="/,
    'a script': /<script/, 'a style': /<style/, 'a textarea': /<textarea/, 'a title': /<title/, 'a noscript': /<noscript/, 'a template': /<template/,
    'svg or math': /<svg|<math/, 'a void element': /<(?:br|hr|img|input|wbr)\b/, 'an attribute': /<\w+ \w+=/, 'a code element': /<(?:code|pre|kbd)\b/,
    'a custom element': /<x-foo|<my-el/, 'a character reference': /&\w+;/, 'text over two lines': /[a-z]\n[a-z]/, 'a formatting element': /<(?:b|i|em|strong|a)\b/,
    'html, head and body': /<html[\s\S]*<head[\s\S]*<body/, 'capitals in a tag name': /<[A-Z]/, 'a byte-order mark': /^\ufeff/,
    'a ruby': /<ruby/, 'an object, marquee or applet': /<(?:object|marquee|applet)\b/, 'white space after the body': /<\/body>\s/
  },
  markdown: {
    'a heading': /^#{1,6} /m, 'a list': /^(?:[-*+]|\d+[.)]) /m, 'a block quote': /^>/m, 'a table': /^\|.*\|$/m, 'a code fence': /^(?:```|~~~)/m,
    'indented code': /^ {4}\S/m, 'front matter that is closed': /^---\n[^\n]+\n(?:---|\.\.\.)\n/, 'a link': /\]\(/, 'a code span': /`[^`\n]+`/,
    'a tag below the edit': /<[a-z!]/, 'a comment alone on its line': /^<!--[^<>]*-->$/m, 'a tag inside a code span': /`[^`\n]*<[a-z][^`\n]*`/,
    'two plain paragraphs': /^[A-Z"][^\n<>[\]`*_#|:()]+\n\n[A-Z"][^\n<>[\]`*_#|:()]+\n/m,
    'a line break of two spaces': / {2}\n\S/, 'a number': /\d/, 'typographic marks': /[\u2014\u2026\u201c]/, 'a thematic break': /^(?:\*\*\*|___|\* \* \*)$/m,
    'a definition': /^\[[^\]]+\]: /m
  }
};

/** The kinds of edit that add or remove a line; in Markdown also a change of the spaces around a line. No such edit may pass. */
const NEVER_PASSES = {
  html: ['lines joined', 'a line split', 'a line added', 'a line removed'],
  markdown: ['lines joined', 'a line split', 'a line added', 'a line removed', 'leading or trailing spaces changed']
};
/**
 * The share of the generated edits the check must pass, per language: about half of the
 * share measured on 2026-10-09 (the numbers are beside each test), so that a rule which
 * starts to refuse far more than it did fails here.
 */
const PASS_FLOOR = { html: 0.03, markdown: 0.09 };

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
  const byEdit = new Map(EDITS.map((name) => [name, [0, 0]]));
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
  assert.ok(share > PASS_FLOOR[kind], `the check must pass more than ${(100 * PASS_FLOOR[kind]).toFixed(1)}% of the generated edits: ${summary}`);
  for (const name of NEVER_PASSES[kind]) assert.equal(byEdit.get(name)[1], 0, `no edit of the kind "${name}" may pass: ${summary}`);
  for (const name of EDITS.slice(0, 3)) assert.ok(byEdit.get(name)[1] > 0, `the check must pass edits of the kind "${name}": ${summary}`);
  // A small run cannot hold every ingredient; the default size and the soak must.
  if (stats.cases >= 10000) assert.deepEqual(missing, [], `the check passed no edit in a document with: ${missing.join(', ')}`);
}

// Measured on 2026-10-09, seed 20261009, default size: 47,352 edits, 2,857 passed (6.0%).
test('HTML: every edit the check passes is a change to plain visible text for the HTML parser', (t) => {
  assertRun(t, 'html', HTML_CASES);
});

// Measured on 2026-10-09, seed 20261009, default size: 11,236 edits, 2,024 passed (18.0%).
test('Markdown: every edit the check passes changes only the words of a paragraph, for markdown-it in four configurations', (t) => {
  assertRun(t, 'markdown', MARKDOWN_CASES);
});

// ---------------------------------------------------------------------------------------
// The witnesses: one document and edit per refusal rule of the HTML reader.
// ---------------------------------------------------------------------------------------
//
// A million generated cases did not notice some rules being taken out of the reader (a
// security run of 2026-10-09 weakened them one at a time), because the generator seldom
// writes the one shape a rule exists for. So each rule has a witness here: the smallest
// document in which that rule, and no other, refuses the edit. Each row is
// [the rule, the old document, the new document]; without a new document the word `alpha`
// becomes `zulu`. To prove that a witness bites, weaken its rule in a scratch copy of
// `src/lib/hotfix-check.js` and run this test against the copy: that witness, and only
// witnesses of that rule, must fail. The plan's Execution Record holds the last such run.
const WITNESSES = [
  // The tag reader.
  ['an attribute name cannot start with a quote, `<` or `=`', '<p>alpha</p><br "x">'],
  ['an attribute value in quotes must end', '<p>alpha</p><br title="x>'],
  ['a tag must end', '<p>alpha</p><br class'],
  ['a tag holds no brace', '<p title="{x}">alpha</p>'],
  ['names are lower-cased as HTML does it, the ASCII letters only', '<lin\u212a>x<p>alpha</p>'],
  // Comments, the doctype, and what a browser ends by rules of its own.
  ['a comment must end', '<p>alpha</p><!-- x'],
  ['a comment does not start with `>`', '<!--><br>--><p>alpha</p>'],
  ['a comment does not start with `->`', '<!---><br>--><p>alpha</p>'],
  ['a comment holds no `<!--`', '<!-- a <!-- b --><p>alpha</p>'],
  ['a comment holds no `--!>`', '<!-- a --!> b --><p>alpha</p>'],
  ['a comment does not end in `<!-`', '<!-- a <!---><p>alpha</p>'],
  ['`<!`, `<?` and `</` start only a standard comment, `<!DOCTYPE html>` or an end tag', '<!x><p>alpha</p>'],
  ['`<!`, `<?` and `</` start only a standard comment, `<!DOCTYPE html>` or an end tag', '<?x?><p>alpha</p>'],
  ['`<!`, `<?` and `</` start only a standard comment, `<!DOCTYPE html>` or an end tag', '</ x><p>alpha</p>'],
  ['`<!`, `<?` and `</` start only a standard comment, `<!DOCTYPE html>` or an end tag', '<!DOCTYPE html PUBLIC "x"><p>alpha</p>'],
  ['only white space stands before the doctype', 'Draft<!DOCTYPE html><p>alpha</p>'],
  ['only white space stands before the doctype', '<br><!DOCTYPE html><p>alpha</p>'],
  ['only white space stands before the doctype', '<!-- c --><!DOCTYPE html><p>alpha</p>'],
  // Raw text: a script block's comment marks.
  ['in a script, `<!--` is not followed at once by `>` or `->`', '<script><!--> x</script><p>alpha</p>'],
  ['in a script, a `<!--` holds no second `<!--`', '<script><!-- a <!-- b --></script><p>alpha</p>'],
  ['in a script, a `<!--` holds no `--!>`', '<script><!-- a --!> b --></script><p>alpha</p>'],
  // `<svg>` and `<math>`: one opaque piece each.
  ['inside svg or math an end tag closes the element on top', '<svg><g></path></svg><p>alpha</p>'],
  ['inside svg or math no tag stands where HTML is read again', '<svg><title><g></g></title></svg><p>alpha</p>'],
  ['inside svg or math no HTML element name stands', '<svg><b>x</b></svg><p>alpha</p>'],
  ['inside svg or math no name stands that the parser treats in a way of its own', '<svg><font>x</font></svg><p>alpha</p>'],
  ['svg or math must end', '<p>alpha</p><svg><g>'],
  // The structure a browser builds.
  ['inside a select only options are followed', '<select><b>x</b></select><p>alpha</p>'],
  ['after the body\'s end no tag follows', '<body><p>alpha</p></body><br>'],
  ['after the body\'s end no text follows', '<body><p>alpha</p></body>x'],
  ['white space after the body\'s end is no wording', '<html><body><p>x</p></body> </html>', '<html><body><p>x</p></body>  </html>'],
  ['an end tag closes the element on top, or elements that may leave their end tag out', '<p>alpha</p></div>'],
  ['an end tag closes the element on top, or elements that may leave their end tag out', '<p>alpha</p><span></div></span>'],
  ['a frameset refuses the file', '<p>alpha</p><frameset></frameset>'],
  ['a frame refuses the file', '<p>alpha</p><frame></frame>'],
  ['`html` carries no `is` attribute', '<p>alpha</p><html is="x"></html>'],
  ['`body` carries no `is` attribute', '<p>alpha</p><body is="x"></body>'],
  ['an item\'s start tag closes an open item only where that item is on top', '<ul><li><span>x<li>y</li></span></li></ul><p>alpha</p>'],
  ['an item\'s start tag closes an open item only where that item is on top', '<dl><dt><span>x<dd>y</dd></span></dt></dl><p>alpha</p>'],
  ['a tag that ends a paragraph closes it only where the paragraph is on top', '<p><span>x<div>y</div></span></p><p>alpha</p>'],
  ['without a doctype a table stays inside the paragraph (quirks mode)', '<p is="x">x<table><tr><td>alpha</td></tr></table>'],
  ['a link, a button or a nobr closes an open one of its own only where that is on top', '<a href="/a"><span>x<a href="/b">y</a></span></a><p>alpha</p>'],
  ['no form stands in a form', '<form><div><form>x</form></div></form><p>alpha</p>'],
  ['in a ruby, `rt` and `rp` do not follow an element whose end tag the parser would add', '<ruby><p>x<rt>y</rt></p></ruby><p>alpha</p>'],
  ['in a ruby, `rb` and `rtc` are outside the subset', '<ruby><rb>x</rb></ruby><p>alpha</p>'],
  ['`rt` and `rp` close an open one only directly inside the ruby', '<ruby><span><rt>x<rt>y</rt></span></ruby><p>alpha</p>'],
  ['a part of a table stands only where a table has it', '<div><td>x</td></div><p>alpha</p>'],
  ['no table starts among a table\'s rows', '<table><table></table></table><p>alpha</p>'],
  ['no table starts among a table\'s rows', '<table><b><table></table></b><tr><td>x</td></tr></table><p>alpha</p>'],
  ['a column group holds columns only', '<table><colgroup><b>x</b></colgroup></table><p>alpha</p>'],
  ['a column group holds no text', '<table><colgroup>x</colgroup></table><p>alpha</p>'],
  ['a noscript ends where its raw text ends', '<noscript><!-- </noscript> --></noscript><p>alpha</p>'],
  ['an element must be closed', '<div><p>alpha</p>'],
  ['an element must be closed', '<p>alpha</p><style>x'],
  ['an element must be closed', '<p>alpha</p><script>x'],
  ['an element must be closed', '<p>alpha</p><title>x'],
  // What may change: text between two tags or comments, and nothing else.
  ['nothing but text between tags may change', '<p class="alpha">x</p>'],
  ['nothing but text between tags may change', '<p>x</p>', '<p>x<br></p>'],
  ['nothing but text between tags may change', '<svg><text>alpha</text></svg>'],
  ['nothing but text between tags may change', '<script>alpha()</script>'],
  ['a group of changed lines keeps its number of lines', '<p>alpha\nbravo</p>\n', '<p>alpha bravo</p>\n'],
  ['a byte-order mark neither comes nor goes', '\ufeff<p>alpha</p>', '<p>alpha</p>'],
  ['text inside a code element is code', '<p><code>alpha</code></p>'],
  ['text inside a template is not shown', '<template><p>alpha</p></template>'],
  ['an option without a value sends its text', '<datalist><option>alpha</option></datalist>'],
  ['inside a select only the text of an option with a value is wording', '<select>alpha<option value="x">y</option></select>'],
  ['an element whose name is no HTML element holds its text', '<x-foo>alpha</x-foo>'],
  ['an element with an `is` attribute holds its text', '<p is="x">alpha</p>'],
  ['the text of a noscript is not shown to every reader', '<noscript>alpha</noscript>'],
  ['changed text holds no character reference but the plain ones', '<p>alpha &commat;</p>'],
  ['changed text holds no control or format character', '<p>alpha\u200b</p>'],
  ['changed text stands between two tags or comments', 'alpha<p>x</p>'],
  ['text neither comes nor goes whole', '<p>alpha<b>x</b></p>', '<p> <b>x</b></p>'],
  ['text read before the body, or directly inside a table, keeps its leading white space', '<html><head> alpha</head><body></body></html>', '<html><head>alpha</head><body></body></html>'],
  ['text read before the body, or directly inside a table, keeps its leading white space', '<table> alpha<tr><td>x</td></tr></table>', '<table>alpha<tr><td>x</td></tr></table>']
];

test('witnesses: every refusal rule of the HTML reader refuses the one document written for it', (t) => {
  const passed = [];
  for (const [rule, oldText, changed] of WITNESSES) {
    const newText = changed === undefined ? oldText.replace('alpha', 'zulu') : changed;
    assert.notEqual(newText, oldText, `${rule}: the witness holds an edit`);
    if (judge('html', oldText, newText) === null) passed.push(`${rule}: ${JSON.stringify(oldText)}`);
  }
  t.diagnostic(`${WITNESSES.length} witnesses for ${new Set(WITNESSES.map((w) => w[0])).size} rules`);
  assert.deepEqual(passed, [], 'each of these rules no longer refuses its witness');
});

// ---------------------------------------------------------------------------------------
// Documents written by hand: the classes the security runs of 2026-10-09 found, the cases
// the readers' rules were reasoned from, and everyday shapes. Every word in each is edited
// in turn; whatever the check passes must be plain text for the real parsers.
// ---------------------------------------------------------------------------------------
const BY_HAND = {
  html: [
    // names, frames, options, noscript, end tags
    `<lin${KELVIN}>alpha</lin${KELVIN}>bravo<br>`, `<${LONG_S}cript>alpha</${LONG_S}cript><p>bravo</p>`, '<LINK rel="alpha"><p>bravo</p>',
    '<div></div><frameset></frameset>\n<p>alpha</p>', '<p>alpha</p><frame>bravo', '<frameset><frame src="alpha"></frameset><p>bravo</p>',
    '<select>alpha<option>bravo<option value="charlie">delta</select>alpha<br>', '<select><optgroup>alpha<option>bravo</optgroup>charlie</select>',
    '<select><option>alpha<hr>bravo<option value="x">charlie<optgroup label="y">delta<option value="z">alpha</select>',
    '<datalist><option>alpha<option value="x">bravo</datalist><p>charlie</p>', '<p><small><datalist><hr><option></datalist><small><form>alpha</form></small></small></p>',
    '<datalist><option>alpha<hr>bravo</datalist><p>charlie</p>', '<select><option value="a">alpha<b>bravo</b></option></select><p>charlie</p>',
    '<noscript><code></noscript><p>alpha</p></code>', '<noscript><!-- </noscript> alpha --><p>bravo</p></noscript>', '<noscript><p>alpha</p></noscript><p>bravo</p>',
    '<head><noscript><p>alpha</p></noscript></head><body><p>bravo</p></body>', '<noscript><style></noscript>alpha</style><p>bravo</p>',
    '<p><noscript><div>alpha</div></noscript>bravo</p>', '<noscript><a title="</noscript>alpha">bravo</a></noscript>',
    '<b><p>alpha</b>bravo</p>', '<a href="/x">alpha<a href="/y">bravo</a>charlie</a>delta<br>', '<p>alpha</p></div><p>bravo</p>',
    '<p><span>alpha<div>bravo</div>charlie</span></p>', '<x-foo><p><span><hr><li>alpha</span>bravo</p></x-foo>charlie<br>',
    '<x-foo><p><ul><hr><li></ul>alpha</p></x-foo>bravo<br>', '<x-foo><td><p>alpha</td>bravo</x-foo>charlie<br>', '<ul><li><span>alpha<li>bravo</span></ul>',
    '<form><div><form>alpha</form>bravo</div></form>charlie<br>', '<table><tr><td>alpha</td></tr><table><tr><td>bravo</td></tr></table></table>',
    '<table><colgroup>alpha</colgroup><tr><td>bravo</td></tr></table>', '<ruby>alpha<p>bravo<rt>charlie</ruby>', '<html><body><p>alpha</p></body>bravo</html>',
    '<p>alpha</p>\n<body is="x"></body>', '<html is="x"><body><p>alpha</p></body></html>', '<p is="x">alpha<table><tr><td>bravo</td></tr></table></p>charlie<br>',
    '<!DOCTYPE html>\n<p is="x">alpha<table><tr><td>bravo</td></tr></table>charlie<br>', '<!DOCTYPE html PUBLIC "x">\n<p>alpha<table><tr><td>bravo</td></tr></table></p>',
    '<table><code><tr><td>alpha</td></tr></code></table>bravo<br>', '<table><x-foo><tr><td>alpha</td></tr></x-foo></table>bravo<br>',
    '<code><table><tr><td>alpha</code>bravo</td></tr></table>charlie<br>', '<p><code><div>alpha</div>bravo</code>charlie</p>delta<br>',
    '<button is="x">alpha<button>bravo</button>charlie</button>delta<br>', '<h1 is="x">alpha<h2>bravo</h2>charlie</h1>delta<br>',
    // the end tags that may be left out
    '<ul><li><p>alpha<li>bravo</ul>\n<ol><li>charlie</li><li>delta</ol>', '<div><p>alpha<p>bravo</div>\n<blockquote><p>charlie</blockquote>',
    '<dl><dt>alpha<dd>bravo<dt>charlie<dd>delta</dl>', '<ruby>alpha<rp>(<rt>bravo<rp>)</ruby>',
    '<table><caption>alpha<colgroup><col><thead><tr><th>bravo<tbody><tr><td>charlie<td>delta<tr><td>alpha<tfoot><tr><td>bravo</table>',
    '<!DOCTYPE html>\n<html><head><title>alpha</title><body><h1>bravo<h2>charlie</h2><p>delta</html>',
    '<p><a href="/a">alpha<a href="/b">bravo</a></p>\n<button>charlie<button>delta</button>',
    // text over lines, references, comments
    '<p>\n  alpha your bravo\n  now\n</p>', '<p>alpha &amp; bravo &mdash; charlie&hellip;</p>', '<p>alpha<!-- note --> bravo</p>', '<p>&alpha; &bravo</p>',
    '<table>alpha<tr><td>bravo</td></tr></table>', '<html><body><p is="x">alpha</body>bravo</html>', '<body><div><p is="x">alpha</div></body><!-- bravo -->',
    // The second security run of 2026-10-09 (its own generator, parse5 and a headless Chromium),
    // the smallest case of each of its classes: text before the doctype puts the page in
    // quirks mode; a table started among another table's rows through an inline element; the
    // content of a noscript, read as markup; `rt` and `rp` under another element than the
    // ruby; text before the body and directly inside a table; control and format characters;
    // a byte-order mark; white space after the body's end.
    'Draft<!DOCTYPE html><p is="x">alpha<table><tr><td>bravo</td></tr></table>charlie<br>',
    '<p>x</p><!DOCTYPE html><p is="x">alpha<table><tr><td>bravo</td></tr></table>charlie<br>',
    '<!-- c -->\n<!DOCTYPE html><p is="x">alpha<table><tr><td>bravo</td></tr></table>charlie<br>',
    '<x-foo><table><b><table><tr><td>alpha</td></tr></table></b><tr><td><p>bravo</td></tr></table></x-foo><p>charlie</p>',
    '<table><b><table></table></b><tr><td>alpha</td></tr></table><p>bravo</p>', '<table><tr><b><table><tr><td>alpha</td></tr></table></b><td>bravo</td></tr></table>',
    '<noscript><p>alpha</noscript>bravo</p><p>charlie</p>', '<noscript>alpha<noscript>bravo</noscript>charlie</noscript><p>delta</p>',
    '<head><noscript>alpha</noscript></head><body><p>bravo</p></body>', '<noscript><p>alpha</p><b>bravo</b></noscript><p>charlie</p>',
    '<head><noscript><link rel="alpha"><style>.bravo{}</style></noscript></head><p>charlie</p>', '<noscript></noscript x><p>alpha</p>',
    '<ruby>alpha<span><rt>bravo<rt>charlie</span></ruby><p>delta</p>', '<ruby><p>alpha<rt>bravo<rp>charlie</ruby><p>delta</p>',
    '<ruby>alpha<rt>bravo<rt>charlie<rp>delta</ruby>', '<ruby><b>alpha<rp>bravo<rt>charlie</b></ruby>',
    '<html> alpha<head><title>bravo</title></head><body><p>charlie</p></body></html>', '<head>\n alpha\n<title>bravo</title></head>',
    '<html><head></head> alpha<body><p>bravo</p></body></html>', '<table> alpha<tr><td>bravo</td></tr> charlie</table>',
    '<table><tbody> alpha<tr> bravo<td>charlie</td></tr></tbody></table>',
    '<p>alpha\u200bbravo</p><p>charlie\u202edelta</p>', '<p>alpha\u001b[1m bravo</p>', '<p>alpha\u00adbravo \u{e0041}charlie</p>',
    '\ufeff<!DOCTYPE html><p>alpha</p>', '\ufeff\ufeff<p>alpha</p>', '\ufeffalpha<p>bravo</p>',
    '<html><body><p>alpha</p></body> \n</html>\n', '<body><p>alpha</p></body>\n<!-- bravo -->\n',
    // scope boundaries
    '<p>alpha<object><p>bravo</object>charlie</p>', '<ul><li>alpha<marquee><li>bravo</marquee>charlie</ul>', '<a href="/x">alpha<applet><a href="/y">bravo</a></applet>charlie</a>',
    '<table><tr><td>alpha<template><td>bravo</td></template>charlie</td></tr></table>', '<p>alpha<template><p>bravo</template>charlie</p>',
    '<button>alpha<object><button>bravo</button></object>charlie</button>'
  ],
  markdown: [
    // Plain paragraphs: every edit passes.
    'Read the alpha guide first.\n', 'The alpha way is well-known; it works,\nand bravo\'s safe.\n\nThen charlie.\n', '# Title\n\nThe alpha words.\n\n- an item\n',
    'The alpha words.\n\n```sh\nbravo --charlie\n```\n\nThe delta words.\n', '---\ntitle: alpha\n---\n\nThe bravo words.\n', 'Use `<b>` now.\n\nThe alpha words.\n',
    '<!-- alpha -->\n\nThe bravo words.\n', '```html\n<div>alpha</div>\n```\n\nThe bravo words.\n', 'The alpha words.\r\n\r\nThe bravo words.\r\n',
    'The alpha words.  \nThe bravo words.\n', '> a quote\n\nThe alpha words.\n\n| a | b |\n| - | - |\n| charlie | delta |\n',
    // The findings of the Markdown security run of 2026-10-09: nothing here may pass as wording
    // that a renderer reads as a link, an attribute, code or structure.
    '<div markdown="1">\n\nRead the alpha guide.\n\n</div>\n', '>> > \tamet alpha word\n', '```\nalpha\n```\u00a0\n\nRun bravo now.\n\n```\n',
    '-   Install alpha:\n\n        bravo charlie\n', 'Read alpha](guide/bravo) first.\n', 'See the alpha guide\n[g]: guide/bravo\n', 'Visit alpha.com today.\n',
    'Read alpha.md first.\n', '---js\n{ title: "alpha" }\n\nA plain bravo line\n\n---\n\nThe charlie words.\n', 'Intro alpha.\n\n---\ntheme: bravo\n\nA plain charlie line\n\n---\n',
    'Template: alpha\n\nBody bravo.\n', '| a | b |\n| - | - |\n| `alpha | bravo` | charlie |\n', '## alpha !\n\nBody bravo.\n', '- [ ] Write the alpha guide\n',
    '> [!NOTE]\n> Read alpha first.\n', '::: tip\nUse the alpha way\n:::\n', '!!! note\n    Use the alpha way\n', 'See [[alpha guide]] first.\n',
    '\ufeff    pip install alpha\n', 'Use \\<script> tags.\n\nThe alpha words.\n', '- Install the alpha tool\nRun bravo then\n', 'Install the alpha tool\n===\n',
    // What the differential test found against the rule as first written, and what Python-Markdown
    // and pandoc read otherwise.
    '- Step alpha.\n\n  The bravo words.\n', '1. Step alpha.\n\n   The bravo words.\n', '<div>\n\nThe alpha words.\n\n</div>\n', '<run-sql>\n\nSelect alpha from bravo\n\n</run-sql>\n',
    '> <!-- alpha\n\n-->\n\nThe bravo words.\n', '- alpha\n\n  <!-- bravo\n\n-->\n\nThe charlie words.\n', 'alpha\r```\n\nThe bravo words.\n',
    '1. Step alpha\n\n   ```\nbravo\n   ```\n\nThe charlie words.\n', '[ref]:\n```\nalpha\n```\n\nThe bravo words.\n', '```\nalpha\n````\n\nThe bravo words.\n\n```\n',
    '``` foo bar\nalpha\n```\n\nThe bravo words.\n\n```\n', ' ```\nalpha\n```\n\nThe bravo words.\n\n```\n', '<script>\n</pre>\n\n`</script>`\n\nThe alpha words.\n',
    '<pre>\n<!-- </pre> -->\n\nThe alpha words.\n', '<xmp>\n\n`</xmp>`\n\nThe alpha words.\n', '<!alpha\n\nThe bravo words.\n>\n', '<hr>\n<https://alpha.example/x>\n\nThe bravo words.\n',
    '---\ntext: |\n  ```\n---\n\nThe alpha words.\n\n```\n', '---\ntitle: <hr>\n<https://alpha.example/x>\n---\n\nThe bravo words.\n', '---\nThe alpha: [\n---\nText bravo here\n\nMore charlie words.\n\n---\n',
    '----\nRow alpha here\n\nRow bravo here\n----\n', '----------- -------\nFirst       alpha\n\nSecond bravo words\n\nThird charlie\n----------- -------\n',
    'a. The alpha words.\n', 'import Chart from "alpha"\n', 'export default alpha\n', 'The fix landed in alpha last week.\n'
  ]
};

test('documents written by hand: the classes found, and everyday shapes', (t) => {
  const wrong = [];
  const counts = { html: [0, 0], markdown: [0, 0] };
  for (const kind of ['html', 'markdown']) {
    for (const oldText of BY_HAND[kind]) {
      WORD.lastIndex = 0;
      for (let m = WORD.exec(oldText); m; m = WORD.exec(oldText)) {
        const newText = `${oldText.slice(0, m.index)}zulu${oldText.slice(m.index + m[0].length)}`;
        counts[kind][0]++;
        if (judge(kind, oldText, newText) !== null) continue;
        counts[kind][1]++;
        const reason = ORACLES[kind](oldText, newText);
        if (reason !== null) wrong.push(`${reason}: ${JSON.stringify(oldText)} with ${m[0]} at ${m.index}`);
      }
    }
  }
  t.diagnostic(`HTML: ${counts.html[1]} of ${counts.html[0]} edits passed in ${BY_HAND.html.length} documents; `
    + `Markdown: ${counts.markdown[1]} of ${counts.markdown[0]} in ${BY_HAND.markdown.length}`);
  assert.deepEqual(wrong, []);
  for (const kind of ['html', 'markdown']) {
    assert.ok(counts[kind][1] > counts[kind][0] / 6, `the check passes edits in the everyday ${kind} shapes (${counts[kind][1]} of ${counts[kind][0]})`);
  }
});

test('the real menu route answers a sample of the generated edits as the rules do', async (t) => {
  // The sample is made here, from a seed of its own, so that this test stands alone: the
  // first four edits the rules pass and the first four they refuse, of each language.
  const sample = [];
  for (const kind of ['html', 'markdown']) {
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
    const r = spawnSync('git', ['-c', 'user.name=Hotfix Test', '-c', 'user.email=hotfix@test.invalid',
      '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd: root, encoding: 'utf8' });
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
    fs.rmSync(root, { recursive: true, force: true });
  }
});
