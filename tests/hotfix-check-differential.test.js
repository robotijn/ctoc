'use strict';

// The differential test: the hotfix check's reader against real parsers.
//
// A seeded generator makes HTML and Markdown documents and one-word edits (`alpha` to
// `zulu`). For every edit the check passes (rules 2 to 7 of `ruleRefusal`: no refusal), the
// old and the new document are parsed by parse5, the HTML standard's parser, with scripting
// enabled and with scripting disabled; a Markdown document is first rendered by markdown-it
// (`html: true`). The two trees must then be identical except for the data of exactly one
// text node, whose every ancestor is a plain HTML element that does not hold its text, and
// (Markdown) no heading's generated anchor may differ. Anything else is a disagreement: the
// check called a change wording that a real parser reads as something else.
//
// parse5 and markdown-it are test-only dependencies (devDependencies, exact versions);
// nothing under src/ requires either. parse5 is published as an ECMAScript module only, so
// this file needs a Node.js that can `require` one (20.19 or later, 22.12 or later).
//
// Size: by default 50,000 HTML and 12,000 Markdown cases, about 15 seconds under the test
// gate's coverage run and about 3 seconds by itself. The long soak (6 million HTML and
// 1 million Markdown cases) runs with HOTFIX_DIFFERENTIAL_SOAK=1. Every case is a pure
// function of the seed and its index, so a failure names both and reproduces:
//   HOTFIX_DIFFERENTIAL_SEED=<seed>   another seed (default 20261009)
//   HOTFIX_DIFFERENTIAL_HTML=<count>  another number of HTML cases
//   HOTFIX_DIFFERENTIAL_MARKDOWN=<count>
//   HOTFIX_DIFFERENTIAL_FROM=<index>  the first case index (to run one share of a soak)
//   HOTFIX_DIFFERENTIAL_SHOW=<count>  also print that many plain visible-text edits the check refuses
// Plan: plans/todo/ctoc-checks-that-a-hotfix-is-really-small-and-safe-s1-the-hotfix-check.md,
// decision at review of 2026-10-09.

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

const markdown = new MarkdownIt({ html: true });

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
const KELVIN = 'K';
const LONG_S = 'ſ';
const ODD_SPACES = [' ', ' ', '　', '\f', '\u000b', '\u0085', ' ', '\t'];
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
    const sep = chance(r, 1 - 0.1 * wild) ? ' ' : pick(r, ['\n', '\t', '/', '\f', '', ' ', ' / ']);
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
  (g, d, w, x) => `<noscript></noscript x="${w}">${x}`
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
    [2, () => `<applet><${a}>${w()}</applet>${w()}`]
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
  'font', 'input', 'br', 'image', 'keygen', 'menu', 'details', 'summary', 'fieldset', 'label', 'address', 'search', 'center'];

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

/** One HTML document: a doctype or none, the document's own tags written or left out, and a body of nodes. */
function htmlDocument(r) {
  const g = { r, left: 3 + int(r, 9) };
  wild = pick(r, [0.1, 0.35, 1, 1]);
  let body = '';
  for (let n = 1 + int(r, 4); n > 0 && g.left > 0; n--) body += `${htmlNode(g, 0)}${chance(r, 0.6) ? '\n' : ''}`;
  const doctype = pick(r, chance(r, 0.2 * wild) ? OLD_DOCTYPES : DOCTYPES);
  const shape = r();
  if (shape < 0.3) return `${doctype}${body}\n`;
  const head = weighted(r, [
    [30, () => `<title>${word(r)}</title>\n`],
    [10, () => ''],
    [6, () => `<meta charset="utf-8">\n<title>${word(r)}</title>\n<link rel="stylesheet" href="/${word(r)}.css">\n`],
    [5, () => `<style>.a { color: red; } /* ${word(r)} */</style>\n`],
    [5, () => `<script src="/${word(r)}.js"></script>\n`],
    [W(5), () => `${pick(r, NOSCRIPT)(g, 2, word(r), word(r))}\n`],
    [W(4), () => `${word(r)}\n`],
    [W(4), () => `<p>${word(r)}</p>\n`],
    [3, () => `<base href="/${word(r)}/">\n`],
    [3, () => `<template>${word(r)}</template>\n`],
    [2, () => `<!-- ${word(r)} -->\n`]
  ])();
  if (shape < 0.72) return `${doctype}<html${attributes(r)}>\n<head>\n${head}</head>\n<body${attributes(r)}>\n${body}\n</body>\n</html>\n`;
  const keep = () => chance(r, 0.5);
  let out = doctype;
  if (keep()) out += `<html${attributes(r)}>\n`;
  if (keep()) out += '<head>\n';
  out += head;
  if (keep()) out += '</head>\n';
  if (keep()) out += `<body${attributes(r)}>\n`;
  out += `${body}\n`;
  if (keep()) out += '</body>\n';
  if (chance(r, 0.3 * wild)) out += weighted(r, [[3, () => `${htmlText(r)}\n`], [2, () => `<!-- ${word(r)} -->\n`], [2, () => `<p>${htmlText(r)}</p>\n`]])();
  if (keep()) out += '</html>\n';
  if (chance(r, 0.15 * wild)) out += weighted(r, [[3, () => `${htmlText(r)}\n`], [2, () => `<!-- ${word(r)} -->\n`], [2, () => `<b>${htmlText(r)}</b>\n`]])();
  return out;
}

// ---------------------------------------------------------------------------------------
// The Markdown generator.
// ---------------------------------------------------------------------------------------

const LABELS = ['ref', 'note', 'Ref', 'two words'];

/** One piece of inline Markdown. */
function inlinePiece(r) {
  const w = word(r);
  const x = word(r);
  const label = pick(r, LABELS);
  return weighted(r, [
    [60 / wild, () => w],
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
    [2, () => `[${w} ${x}][${w}]`],
    [3, () => `<https://${w}.example/${x}>`],
    [2, () => `<${w}@example.com>`],
    [1, () => `<mailto:${w}@${x}.example>`],
    [W(4), () => `<b>${w}</b>`],
    [3, () => `<a href="/${w}">${x}</a>`],
    [2, () => `<span title="${w}">${x}</span>`],
    [3, () => `<code>${w}</code>`],
    [2, () => `<kbd>${w}</kbd> ${x}`],
    [W(2), () => `<x-foo>${w}</x-foo>`],
    [3, () => `<file> ${w}`],
    [2, () => `<${w}> ${x}`],
    [2, () => `<!-- ${w} -->`],
    [1, () => `<!-- ${w}`],
    [1, () => `<br> ${w}`],
    [2, () => `<img src="/${w}.png" alt="${x}">`],
    [2, () => `&amp; ${w}`],
    [1, () => `&copy; ${w}`],
    [1, () => `&${w};`],
    [2, () => `\\*${w}\\*`],
    [2, () => `\\<b>${w}`],
    [2, () => `<code>${w}\\</code> ${x}`],
    [1, () => `<code>${w}</code x> ${x}`],
    [1, () => `\\[${w}](/${x})`],
    [1, () => `\\\`${w}\``],
    [W(2), () => `<b>${w}`],
    [2, () => `<code>${w}`],
    [1, () => `</b> ${w}`],
    [1, () => `</code> ${w}`],
    [1, () => `| ${w}`],
    [1, () => `a < ${w}`],
    [W(1), () => `<script>${w}</script>`],
    [1, () => `<textarea>${w}</textarea> ${x}`],
    [1, () => `<a title='${w}>' href="/${x}">${w}</a>`],
    [1, () => `<a href=${w}>${x}</a>`],
    [1, () => `<select><option>${w}</option></select>`],
    [1, () => `<svg><text>${w}</text></svg>`],
    [1, () => `<span is="x">${w}</span> ${x}`],
    [1, () => `<code>${x}</code> ![</code>](/${x}.png) ${w}`],
    [1, () => `![<code>](/${x}.png) ${w}`],
    [1, () => `![${x} \`](/${x}.png) \`${w}`],
    [1, () => `<textarea>${x} \\</textarea> ${w}</textarea>`],
    [1, () => `<textarea>[${x}](</textarea>) ${w}</textarea>`],
    [1, () => `<title>*${x}* </title x> ${w}</title>`],
    [1, () => `<svg><text>\\</svg><code>${w}</code></text></svg>`],
    [1, () => `<xmp>\`</xmp>\` ${w}</xmp>`],
    [1, () => `${w}  `],
    [1, () => `${w}\\`]
  ])();
}

/** One line of inline Markdown. */
function inlineLine(r) {
  const parts = [];
  for (let n = 1 + int(r, 4); n > 0; n--) parts.push(inlinePiece(r));
  return parts.join(' ');
}

/** A paragraph: one to three lines; sometimes a tag, a link or a code span runs over the line break. */
function paragraph(r) {
  if (chance(r, 0.12 * wild)) {
    const w = word(r);
    const x = word(r);
    return weighted(r, [
      [4, () => [`${word(r)} <a`, `href="/${w}">${x}</a>`]],
      [3, () => [`<a`, `href="/${w}">${x}</a> ${word(r)}`]],
      [3, () => [`${word(r)} [${w}`, `${x}](/${word(r)})`]],
      [3, () => [`${word(r)} [${w}](/${x}`, `"${word(r)}")`]],
      [3, () => [`${word(r)} \`${w}`, `${x}\` ${word(r)}`]],
      [3, () => [`${word(r)} [${w}][two`, `words] ${x}`]],
      [2, () => [`${word(r)} <span`, `title="${w}"`, `>${x}</span>`]],
      [2, () => [`${word(r)} <!-- ${w}`, `${x} --> ${word(r)}`]],
      [2, () => [`${word(r)} <code>${w}`, `${x}</code> ${word(r)}`]],
      [2, () => [`${word(r)} <b title="${w}`, `${x}">${word(r)}</b>`]]
    ])();
  }
  const lines = [];
  for (let n = 1 + int(r, 3); n > 0; n--) lines.push(inlineLine(r));
  return lines;
}

const DEFINITIONS = [
  (l, w, x) => [`[${l}]: /${w}`],
  (l, w, x) => [`[${l}]: /${w} "${x}"`],
  (l, w, x) => [`[${l}]:`, `  /${w}`],
  (l, w, x) => [`[${l}]: /${w}`, `  "${x}"`],
  (l, w, x) => ['[', `${l}]: /${w}`],
  (l, w, x) => [`[${l}`, `]: /${w}`],
  (l, w, x) => [`[${l}]: </${w}> '${x}`, `${w}'`],
  (l, w, x) => [`[${l}]: /${w}`, `    ${x}`],
  (l, w, x) => [`[${l}]: /${w}`, `${x}`],
  (l, w, x) => [`[${l}]: /${w} "${x}" ${w}`],
  (l, w, x) => [`[${l}]:`, '', `/${w}`],
  (l, w, x) => [`[${l}]: /${w}`, `[${x}]: /${w}`],
  (l, w, x) => [`[${w}]: /${x}`],
  (l, w, x) => [`[${l}]: <${w}`, `${x}>`],
  (l, w, x) => [`   [${l}]: /${w}`],
  (l, w, x) => [`[${l}]: /${w} (${x})`],
  (l, w, x) => [`[${l}]: /${w}`, `"${x}`, '', `${w}"`]
];

const HTML_BLOCKS = [
  (r, w, x) => ['<div>', inlineLine(r), '</div>'],
  (r, w, x) => [`<div>${inlineLine(r)}</div>`],
  (r, w, x) => ['<div>', '', ...paragraph(r), '', '</div>'],
  (r, w, x) => ['<table>', `<tr><td>${w}</td></tr>`, '</table>'],
  (r, w, x) => ['<x-foo>', w, '</x-foo>'],
  (r, w, x) => ['<x-foo>', '', w, '', '</x-foo>'],
  (r, w, x) => ['<b>', w, '</b>'],
  (r, w, x) => ['<pre>', w, '', x, '</pre>'],
  (r, w, x) => ['<pre>', `Use <file> ${w}.`, '', x, '</pre>'],
  (r, w, x) => ['<script>', w, '', x, '</script>'],
  (r, w, x) => [`<script>${w}</script>`, x],
  (r, w, x) => ['<style>', `.a { content: "${w}" }`, '', `/* ${x} */`, '</style>'],
  (r, w, x) => ['<textarea>', w, '', x, '</textarea>'],
  (r, w, x) => ['<!--', w, '', x, '-->'],
  (r, w, x) => [`<!-- ${w} -->`, x],
  (r, w, x) => [`<!-- ${w} --> ${x}`],
  (r, w, x) => [`<?${w}`, '', `${x}?>`],
  (r, w, x) => [`<!DOCTYPE ${w}>`, x],
  (r, w, x) => ['<![CDATA[', w, '', x, ']]>'],
  (r, w, x) => ['<div>', '```', w, '```', '</div>'],
  (r, w, x) => ['<div>', `\`${w}\``, `\`<code>\` ${x}`, '</div>'],
  (r, w, x) => ['<div>', `\`<code>\``, '</div>', x],
  (r, w, x) => ['<div>', `    ${w}`, '</div>'],
  (r, w, x) => ['<details>', `<summary>${w}</summary>`, '', ...paragraph(r), '', '</details>'],
  (r, w, x) => ['<p>', `<https://${w}.example/${x}>`, '</p>'],
  (r, w, x) => ['<div>', `<${w}@example.com> ${x}`, '</div>'],
  (r, w, x) => [`<div>[${w}](/${x})</div>`],
  (r, w, x) => ['<div>', w],
  (r, w, x) => ['</div>', w],
  (r, w, x) => ['<a', `href="/${w}">${x}</a>`],
  (r, w, x) => [`<DIV title="${w}">`, x, '</DIV>'],
  (r, w, x) => ['<select>', `<option>${w}`, '</select>', x],
  (r, w, x) => ['<frameset>', `<frame src="${w}">`, '</frameset>', x],
  (r, w, x) => ['<svg>', `<text>${w}</text>`, '</svg>', x],
  (r, w, x) => ['<math>', `<mi>${w}</mi>`, '</math>'],
  (r, w, x) => ['<div>', `\\<code>${w}`, '</div>', x],
  (r, w, x) => ['<div>', `<code>${w}\\</code>`, '</div>', x],
  (r, w, x) => ['<div>', `[${pick(r, LABELS)}]: /${w}`, '</div>'],
  (r, w, x) => ['<code>', w, '</code>', x],
  (r, w, x) => ['<span>', w, '</span>', '', x],
  (r, w, x) => [`<span title="${w}">`, x],
  (r, w, x) => [`<img src="/${w}.png"`, `alt="${x}">`],
  (r, w, x) => ['<blockquote>', '', `    ${w}`, '', '</blockquote>'],
  (r, w, x) => ['<hr>', `    ${w}`],
  (r, w, x) => [`<div>${w}</div>`, `    ${x}`],
  (r, w, x) => ['<textarea>', `</textarea><b>${w}</b>`, x],
  (r, w, x) => ['<style>', `</style><b>${w}</b>`, '', x],
  (r, w, x) => ['<script>', `// </script> ${w}`, x, '', word(r)],
  (r, w, x) => ['<!-- -->', `    ${w}`],
  (r, w, x) => [`<div class="${w}"`, '>', x, '</div>'],
  (r, w, x) => [' <div>', `  ${w}`, ' </div>'],
  (r, w, x) => ['<noscript>', w, '</noscript>'],
  (r, w, x) => ['<title>', w, '</title>', x]
];

const quoteLines = (r, lines) => lines.map((l, i) => {
  if (i > 0 && l !== '' && chance(r, 0.18)) return l; // a lazy line
  const marker = weighted(r, [[20, () => '> '], [4, () => '>'], [1, () => '>\t'], [1, () => ' > '], [1, () => '>  ']])();
  return (marker + l).replace(/\s+$/, l === '' ? '' : '$&');
});

function listLines(r, lines) {
  const marker = pick(r, ['- ', '- ', '* ', '+ ', '1. ', '2. ', '1) ', '-   ', '10. ', '-\t']);
  const width = marker === '-\t' ? 4 : marker.length;
  return lines.map((l, i) => {
    if (i === 0) return marker + l;
    if (l === '') return l;
    const roll = r();
    if (roll < 0.72) return ' '.repeat(width) + l;
    if (roll < 0.9) return l; // a lazy line, or the end of the item
    return ' '.repeat(pick(r, [1, 2, 4, 5, 6])) + l;
  });
}

/** One Markdown block, as lines. */
function block(r, depth) {
  const w = word(r);
  const x = word(r);
  return weighted(r, [
    [34 / wild, () => paragraph(r)],
    [6, () => [`${'#'.repeat(1 + int(r, 3))} ${inlineLine(r)}`]],
    [2, () => [`#${w}`]],
    [3, () => [inlineLine(r), pick(r, ['===', '---', '=', '--', '-'])]],
    [2, () => [inlineLine(r), inlineLine(r), '---']],
    [9, () => (depth >= 2 ? paragraph(r) : listLines(r, blocks(r, depth + 1, 1 + int(r, 2))))],
    [4, () => [...listLines(r, paragraph(r)), ...listLines(r, paragraph(r))]],
    [8, () => (depth >= 2 ? quoteLines(r, paragraph(r)) : quoteLines(r, blocks(r, depth + 1, 1 + int(r, 2))))],
    [2, () => [...quoteLines(r, paragraph(r)), inlineLine(r)]],
    [4, () => [`| ${w} | ${x} |`, '| --- | --- |', `| ${inlineLine(r)} | ${word(r)} |`]],
    [1, () => [`${w} | ${x}`, '--- | ---', `${word(r)} | \`${word(r)}\``, word(r)]],
    [7, () => pick(r, DEFINITIONS)(pick(r, LABELS), w, x)],
    [11, () => pick(r, HTML_BLOCKS)(r, w, x)],
    [4, () => [pick(r, ['```', '~~~', '```js', '````']), w, '', x, pick(r, ['```', '~~~', '````', '``'])]],
    [1, () => ['```', w]],
    [1, () => [`\`\`\` ${w}`, x, '```']],
    [4, () => [`    ${w}`, `    ${x}`]],
    [1, () => [`\t${w}`]],
    [2, () => [inlineLine(r), `    ${w}`]],
    [2, () => [pick(r, ['---', '***', '* * *', '___'])]],
    [2, () => [`import ${w} from './${x}'`]],
    [3, () => [`export const ${w} = ${x}`]],
    [1, () => [`export const ${w} = ${x}`, '<script>', '', word(r), '</script>']],
    [2, () => [`>>> ${w}`, x]],
    [1, () => [`>>> ${w}`, '<script>', '', x, '</script>']],
    [1, () => [`>\t${w}`, '<script>', '', x, '</script>']],
    [1, () => ['> <a', `> href="/${w}">${x}</a>`]],
    [1, () => [`> <span title="${w}`, `> ${x}">${word(r)}</span>`]],
    [1, () => ['> <div>', `> <code>${w}</code>`, '> </div>', x]],
    [1, () => [`>> ${w}`, `    <div>${x}</div>`]],
    [1, () => [`> > ${w}`, `     ${pick(r, ['- ', '# ', '```', '***', '<!-- ', '1. '])}${x}`]],
    [1, () => [`> - ${w}`, `      ${pick(r, ['- ', '# ', '<div>', '2. ', '> '])}${x}`, word(r)]],
    [1, () => [`- > ${w}`, `${pick(r, ['', ' ', '    ', '      '])}${pick(r, ['', '- ', '# ', '<div>', '| a |'])}${x}`]],
    [1, () => [`- <div>`, `  ${w}`, '', `  ${x}`]],
    [1, () => [`{${w}}`]]
  ])();
}

function blocks(r, depth, count) {
  const out = [];
  for (let n = 0; n < count; n++) {
    if (n > 0 && chance(r, 0.68)) out.push('');
    out.push(...block(r, depth));
  }
  return out;
}

const FRONT_MATTER = [
  (w, x) => ['---', `title: ${w}`, '---'],
  (w, x) => ['+++', `title = "${w}"`, '+++'],
  (w, x) => ['---', `title: ${w}`, '', `<script>`, '---', x, '</script>'],
  (w, x) => ['---', `title: ${w}`],
  (w, x) => ['{', `  "title": "${w}"`, '}'],
  (w, x) => ['---', `title: ${w}`, '...', '<script>', '', x, '</script>']
];

function markdownDocument(r) {
  wild = pick(r, [0.1, 0.35, 1, 1]);
  const lines = [];
  if (chance(r, 0.08)) lines.push(...pick(r, FRONT_MATTER)(word(r), word(r)), ...(chance(r, 0.7) ? [''] : []));
  lines.push(...blocks(r, 0, 1 + int(r, 5)));
  return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------------------
// The edit, and the change as the check's rules read it.
// ---------------------------------------------------------------------------------------

/** Replace one occurrence of one word, chosen by the random source; null when the document holds none. */
function edit(r, text) {
  const at = [];
  WORD.lastIndex = 0;
  for (let m = WORD.exec(text); m; m = WORD.exec(text)) at.push(m);
  if (at.length === 0) return null;
  const m = pick(r, at);
  return text.slice(0, m.index) + pick(r, NEW_WORDS) + text.slice(m.index + m[0].length);
}

/** One group per changed line, as git's `-U0` diff gives for two texts with the same number of lines. */
function hunksOf(oldText, newText) {
  const o = oldText.split('\n');
  const n = newText.split('\n');
  const hunks = [];
  for (let i = 0; i < o.length; i++) {
    if (o[i] !== n[i]) hunks.push({ oldStart: i + 1, newStart: i + 1, removed: [o[i]], added: [n[i]] });
  }
  return hunks;
}

const FILES = { html: 'site/page.html', markdown: 'docs/page.md' };

function judge(kind, oldText, newText) {
  const rel = FILES[kind];
  const hunks = hunksOf(oldText, newText);
  return ruleRefusal({
    files: [{ display: rel, topRel: rel, status: 'M', oldMode: '100644', newMode: '100644', oldSha: null, oldText, newText, hunks }],
    lineCount: hunks.length * 2
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

/** The anchor a site generator makes of a heading's text. */
const slug = (text) => text.trim().toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-');
const textOf = (node) => (node.nodeName === '#text' ? node.value : (node.childNodes || []).map(textOf).join(''));
function anchors(node, out) {
  if (/^h[1-6]$/.test(node.tagName || '')) out.push(slug(textOf(node)));
  else for (const child of node.childNodes || []) anchors(child, out);
  return out;
}

/**
 * What the real parser says about one edit, with scripting enabled and disabled: null when
 * it is a change to plain visible text and nothing else, or the first reason it is not.
 */
function oracle(kind, oldText, newText) {
  const oldHtml = kind === 'markdown' ? markdown.render(oldText) : oldText;
  const newHtml = kind === 'markdown' ? markdown.render(newText) : newText;
  for (const scriptingEnabled of [true, false]) {
    const a = parse5.parse(oldHtml, { scriptingEnabled });
    const b = parse5.parse(newHtml, { scriptingEnabled });
    const changed = [];
    const difference = treeDifference(a, b, [], changed);
    if (difference) return difference;
    if (changed.length === 0) return 'no text changes';
    if (changed.length > 1) return 'more than one text node changes';
    const held = heldBy(changed[0]);
    if (held) return held;
    if (kind === 'markdown' && anchors(a, []).join('\n') !== anchors(b, []).join('\n')) return "a heading's anchor changes";
  }
  return null;
}

// ---------------------------------------------------------------------------------------
// The run.
// ---------------------------------------------------------------------------------------

/** One case: the document, its edit, the check's answer. */
function caseOf(kind, index) {
  const r = stream(SEED + (kind === 'html' ? 0 : 7919), index);
  const oldText = kind === 'html' ? htmlDocument(r) : markdownDocument(r);
  const newText = edit(r, oldText);
  return newText === null ? null : { oldText, newText };
}

/**
 * Make a disagreeing case smaller: cut pieces out of both sides, outside the edit, while
 * the check still passes it and the oracle still gives the same reason.
 */
function shrink(kind, oldText, newText, reason) {
  let p = 0;
  while (oldText[p] === newText[p]) p++;
  let s = 0;
  while (oldText[oldText.length - 1 - s] === newText[newText.length - 1 - s]) s++;
  let head = oldText.slice(0, p);
  let tail = oldText.slice(oldText.length - s);
  const was = oldText.slice(p, oldText.length - s);
  const now = newText.slice(p, newText.length - s);
  const still = (h, t) => {
    const a = h + was + t;
    const b = h + now + t;
    try {
      return judge(kind, a, b) === null && oracle(kind, a, b) === reason;
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
 * (Markdown: in what markdown-it renders of it). The run counts the passed edits per
 * ingredient and requires every one to occur, so that zero disagreements can never mean
 * that the check passes nothing of a kind.
 */
const INGREDIENTS = {
  html: {
    'a comment': /<!--/, 'a doctype': /<!doctype html>/i, 'no doctype': /^(?!<!doctype)/i, 'a table': /<table/, 'a list': /<li/,
    'an end tag left out': /<li>[^<]*<li>|<p>[^<]*<p>|<td>[^<]*<td>|<dt>[^<]*<dd>/, 'a select': /<select/, 'an option with a value': /<option value="/,
    'a script': /<script/, 'a style': /<style/, 'a textarea': /<textarea/, 'a title': /<title/, 'a noscript': /<noscript/, 'a template': /<template/,
    'svg or math': /<svg|<math/, 'a void element': /<(?:br|hr|img|input|wbr)\b/, 'an attribute': /<\w+ \w+=/, 'a code element': /<(?:code|pre|kbd)\b/,
    'a custom element': /<x-foo|<my-el/, 'a character reference': /&\w+;/, 'text over two lines': /[a-z]\n[a-z]/, 'a formatting element': /<(?:b|i|em|strong|a)\b/,
    'html, head and body': /<html[\s\S]*<head[\s\S]*<body/, 'capitals in a tag name': /<[A-Z]/
  },
  markdown: {
    'a heading': /<h[1-6]>/, 'emphasis': /<em>|<strong>/, 'a list': /<li>/, 'a list inside a list': /<li>[\s\S]*<[uo]l>[\s\S]*<\/li>/, 'a block quote': /<blockquote>/,
    'a block quote inside a block quote': /<blockquote>\s*<blockquote>/, 'a table': /<table>/, 'a link': /<a href=/, 'an image': /<img src=/,
    'a code span': /<code>/, 'a code block': /<pre>/, 'a thematic break': /<hr>/, 'an HTML block': /^<(?:div|details|table|x-foo|pre|script|style)/m,
    'inline HTML': /<p>[^\n]*<(?:b|span|a href="\/\w+">\w+<\/a|kbd|code)>/, 'a comment': /<!--/, 'an autolink': /<a href="(?:https|mailto):/,
    'a placeholder': /<file>/, 'a character reference': /&amp;|©/, 'a loose list': /<li>\s*<p>/, 'a backslash': /\\|\*\w+\*/
  }
};
/** Ingredients found in the Markdown as written. */
const WRITTEN = {
  'a lazy line under a block quote': /^> ?\w[^\n]*\n\w/m, 'a lazy line under a list item': /^[-*+] \w[^\n]*\n\w/m,
  'a tab among the markers': /^[->*+ ]*\t/m, 'front matter': /^(?:---|\+\+\+)\n/, 'a definition': /^\[[^\]]+\]: /m,
  'an import or export line': /^(?:import|export) /m, 'a doctest': /^>>> /m, 'a tag over two lines': /<a\n/
};

/** Cases kept for the run through the real menu route: a few the check passes and a few it refuses, of each kind. */
const routeSample = [];

function run(kind, count) {
  const started = Date.now();
  const stats = { cases: 0, passed: 0, refused: 0, plainRefused: 0 };
  /** @type {Map<string, number>} the plain visible-text edits the check refuses, by the refusal's cause word */
  const plainByCause = new Map();
  /** @type {Map<string, {count: number, index: number, oldText: string, newText: string}>} */
  const classes = new Map();
  const kept = { passed: 0, refused: 0 };
  /** @type {Map<string, number>} the passed edits per ingredient */
  const patterns = Object.entries(INGREDIENTS[kind]);
  const written = kind === 'markdown' ? Object.entries(WRITTEN) : [];
  const ingredients = new Map([...patterns, ...written].map(([name]) => [name, 0]));
  const shown = [];
  for (let index = FROM; index < FROM + count; index++) {
    const c = caseOf(kind, index);
    if (!c) continue;
    stats.cases++;
    const refusal = judge(kind, c.oldText, c.newText);
    const reason = oracle(kind, c.oldText, c.newText);
    const slot = refusal ? 'refused' : 'passed';
    if (kept[slot] < 4 && index % 97 === 0) {
      kept[slot]++;
      routeSample.push({ kind, index, ...c, clause: refusal ? refusal.clause : null });
    }
    if (refusal) {
      stats.refused++;
      if (reason === null) {
        stats.plainRefused++;
        const key = /cannot read exactly/.test(refusal.clause) ? `${refusal.cause}, cannot read exactly` : refusal.cause;
        plainByCause.set(key, (plainByCause.get(key) || 0) + 1);
        if (shown.length < SHOW) shown.push(`case ${index}: ${refusal.clause}\n  old: ${JSON.stringify(c.oldText)}\n  new: ${JSON.stringify(c.newText)}`);
      }
      continue;
    }
    stats.passed++;
    const rendered = kind === 'markdown' ? markdown.render(c.oldText) : c.oldText;
    for (const [name, pattern] of patterns) if (pattern.test(rendered)) ingredients.set(name, ingredients.get(name) + 1);
    for (const [name, pattern] of written) if (pattern.test(c.oldText)) ingredients.set(name, ingredients.get(name) + 1);
    if (reason === null) continue;
    const seen = classes.get(reason);
    if (!seen) classes.set(reason, { count: 1, index, ...c });
    else {
      seen.count++;
      if (c.oldText.length < seen.oldText.length) Object.assign(seen, { index, ...c });
    }
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const summary = `${kind}: seed ${SEED}, cases ${FROM} to ${FROM + count - 1}: ${stats.cases} edits, ${stats.passed} passed, `
    + `${stats.refused} refused, ${[...classes.values()].reduce((n, c) => n + c.count, 0)} disagreements, in ${seconds} s; `
    + `plain visible-text edits refused: ${stats.plainRefused}`
    + ` (${[...plainByCause].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}: ${n}`).join('; ')})`
    + `; passed edits by ingredient: ${[...ingredients].map(([k, n]) => `${k} ${n}`).join(', ')}`
    + shown.map((x) => `\n${x}`).join('');
  const report = [...classes].sort((a, b) => b[1].count - a[1].count).map(([reason, c]) => {
    const small = shrink(kind, c.oldText, c.newText, reason);
    return `${c.count} x ${reason} (smallest: case ${c.index}, seed ${SEED})\n  old: ${JSON.stringify(small.oldText)}\n  new: ${JSON.stringify(small.newText)}`;
  });
  return { stats, summary, report, missing: [...ingredients].filter(([, n]) => n === 0).map(([k]) => k) };
}

test('HTML: every edit the check passes is a change to plain visible text for the HTML parser', (t) => {
  const { stats, summary, report, missing } = run('html', HTML_CASES);
  t.diagnostic(summary);
  assert.equal(report.length, 0, `${summary}\nThe check passed edits a real parser reads as something else:\n${report.join('\n')}`);
  assert.ok(stats.passed > stats.cases / 50, `the generator must give the check edits it passes: ${summary}`);
  assert.deepEqual(missing, [], `the check passed no edit in a document with: ${missing.join(', ')}`);
});

test('Markdown: every edit the check passes is a change to plain visible text for the Markdown and HTML parsers', (t) => {
  const { stats, summary, report, missing } = run('markdown', MARKDOWN_CASES);
  t.diagnostic(summary);
  assert.equal(report.length, 0, `${summary}\nThe check passed edits a real parser reads as something else:\n${report.join('\n')}`);
  assert.ok(stats.passed > stats.cases / 50, `the generator must give the check edits it passes: ${summary}`);
  assert.deepEqual(missing, [], `the check passed no edit in a document with: ${missing.join(', ')}`);
});

// Documents written by hand: the classes the security run of 2026-10-09 found, the cases the
// reader's rules were reasoned from, and everyday shapes. Every word in each is edited in
// turn; whatever the check passes must be plain visible text for the real parsers.
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
    '<table>alpha<tr><td>bravo</td></tr></table>', '<html><body><p is="x">alpha</body>bravo</html>', '<body><div><p is="x">alpha</div></body><!-- bravo -->'
  ],
  markdown: [
    'export const x = y\n<script>\n\nalpha\n</script>\n', '>>> x\n<script>\n\nalpha\n</script>\n', '>\tx\n<script>\n\nalpha\n</script>\n',
    '---\ntitle: x\n\n<script>\n---\nalpha\n</script>\n', '<div>\n```\n<code>\n```\n</div>\n\nalpha words.\n', '<div>\n`<code>`\n</div>\n\nalpha words.\n',
    '<div>\n<https://example.org/x>\n</div>\n\nalpha words.\n', '<div>\n<a@b.example> alpha\n</div>\n', '[\nguide]: /alpha\n\nbravo\n',
    'See [alpha\nguide] now.\n\n[alpha guide]: /bravo\n', 'See [the guide](/alpha) now.\n\n[the guide]: /bravo\n', '[guide]: /alpha\n"bravo"\n',
    '[guide]:\n/alpha\n', '> <a\n> href="/alpha">bravo</a>\n', '> <span title="alpha\n> bravo">charlie</span>\n', '> alpha\nbravo\n> ---\n',
    '> alpha\n]\n> -\n', '[guide]: /u\n    alpha\n', '<!-- note -->\n    alpha\n', '<hr>\n    alpha\n', '| a | b |\n| - | - |\n| c | d |\n    alpha\n',
    '> A quote that\nruns alpha lazily.\n\nbravo\n', '- an item that\nruns alpha lazily\n- bravo\n', '> ```\n> code\n> ```\nalpha words.\n',
    '- a `alpha\n2. b` bravo\n', '2. a `alpha\n3. b` bravo\n', '>     code\n    alpha\n', '- alpha\n\n      bravo\n- charlie\n',
    'Run <code>x\\</code> and alpha it.</code>\n', 'Run <code>x</code y> and alpha it.</code>\n', '<code> [a](/x "</code>") alpha</code>\n',
    '<code> ![</code>](/x) alpha</code>\n', '![The alpha logo](/logo.png)\n', '![The logo](/logo.png) <br> The alpha words.\n',
    '<x-box>\n\nText </x-box> and alpha words.\n', '<x-box>\n\n> </x-box>\n\nalpha\n', '- Use <file> here\n  <div>alpha</div>\n',
    '1) <e>a\n   <div>alpha</div>\n', '- a <p is="x">\n  <title>alpha</title>\n', 'Use <file> and <your-name> then alpha.\n\nbravo words.\n',
    'Use <object><runsql> here.\n\nalpha words.\n', 'Use <runsql> here\n```\ncode\n```\nalpha words.\n', '- <file>\n\nalpha words.\n',
    '<details>\n<summary>alpha</summary>\n\nThe bravo words.\n\n</details>\n', '| Name | Use |\n| --- | --- |\n| alpha | bravo your work |\n',
    '| Name |\n| --- |\n| alpha | bravo |\n', '| ` | `alpha` |\n', '| a | b |\n| - | - |\n| ` | `alpha` |\n', '# The &DD; alpha\n\nbravo\n',
    '# alpha\n\n## bravo charlie\n\ndelta\n', 'alpha\n===\n\nbravo\n---\n', '[alpha](/x) and <https://bravo.example/charlie> and `delta`\n',
    '[alpha][guide] and [guide]\n\n[guide]: /bravo "charlie"\n', '1. alpha\n7. bravo\n\n- charlie\n  - delta\n', '>\n    > <code>\nalpha\n',
    'alpha  \nbravo\\\ncharlie\n', 'A <b title="`">x</b> then `alpha` now.\n', 'See <https://example.org/a b> alpha.\n',
    '>>e\n    <div>alpha</div>\n', '> e\n    <div>alpha</div>\n', '> > e\n     - alpha\n', '> - e\n      # alpha\nbravo\n'
  ]
};

test('documents written by hand: the classes found, and everyday shapes', (t) => {
  const wrong = [];
  let edits = 0;
  let passed = 0;
  for (const kind of ['html', 'markdown']) {
    for (const oldText of BY_HAND[kind]) {
      WORD.lastIndex = 0;
      for (let m = WORD.exec(oldText); m; m = WORD.exec(oldText)) {
        const newText = `${oldText.slice(0, m.index)}zulu${oldText.slice(m.index + m[0].length)}`;
        edits++;
        if (judge(kind, oldText, newText) !== null) continue;
        passed++;
        const reason = oracle(kind, oldText, newText);
        if (reason !== null) wrong.push(`${reason}: ${JSON.stringify(oldText)} with ${m[0]} at ${m.index}`);
      }
    }
  }
  t.diagnostic(`${edits} edits in ${BY_HAND.html.length + BY_HAND.markdown.length} documents written by hand, ${passed} passed`);
  assert.deepEqual(wrong, []);
  assert.ok(passed > edits / 5, `the check passes edits in the everyday shapes (${passed} of ${edits})`);
});

test('the real menu route answers a sample of the generated edits as the rules do', async (t) => {
  assert.ok(routeSample.length >= 8, `the runs above keep a sample (${routeSample.length})`);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hotfix-differential-'));
  const git = (args) => {
    const r = spawnSync('git', ['-c', 'user.name=Hotfix Test', '-c', 'user.email=hotfix@test.invalid',
      '-c', 'commit.gpgsign=false', ...args], { cwd: root, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  };
  try {
    git(['init', '-q']);
    for (const sample of routeSample) {
      const rel = FILES[sample.kind];
      const file = path.join(root, ...rel.split('/'));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, sample.oldText);
      git(['add', '-A']);
      git(['commit', '-q', '--allow-empty', '-m', `case ${sample.index}`]);
      fs.writeFileSync(file, sample.newText);
      const answer = await route(['hotfix', 'check', rel], root);
      const where = `${sample.kind} case ${sample.index}, seed ${SEED}: ${JSON.stringify(sample.oldText)}`;
      if (sample.clause === null) assert.equal(answer.verdict, 'checking', `${where}: ${JSON.stringify(answer)}`);
      else {
        assert.equal(answer.text, `I did not treat this as a hotfix because ${sample.clause}; `
          + 'it goes through a normal plan, and your edits stay in place, not committed.', where);
      }
      git(['checkout', '-q', '--', '.']);
    }
    t.diagnostic(`${routeSample.length} edits through the real menu route, each answered as the rules answered it`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
