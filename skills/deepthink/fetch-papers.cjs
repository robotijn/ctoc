'use strict';
// The fixed paper program for deepthink, shipped in the plugin as skills/deepthink/fetch-papers.cjs
// and run where it stands; nothing copies it into a project. Every address, title and author
// arrives as data in the staging file; nothing from it is ever put into a command. A CommonJS
// file, so it runs as such whatever any package.json declares.
const fs = require('../../src/lib/safe-fs');
const path = require('path');
const net = require('net');
const dns = require('dns').promises;

const DEVICE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;
const LIBRARY = path.join('.ctoc', 'papers');
const MIN_BYTES = 50 * 1024;
const MAX_BYTES = 100 * 1024 * 1024;
const MAX_HOPS = 5;
const TIMEOUT_MS = 60000;

// Addresses a paper is never fetched from: this machine, private networks, link-local,
// shared, benchmark, multicast and reserved ranges. An address of the form ::ffff:a.b.c.d
// is checked against the four-part rules as well; the older forms that carry a four-part
// address inside a version six one (compatible, both translated forms, six-to-four) and the old
// site-local range are refused whole.
const INTERNAL = new net.BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) INTERNAL.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
  ['::', 96], ['::ffff:0:0:0', 96], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['2002::', 16], ['fec0::', 10],
]) {
  INTERNAL.addSubnet(address, prefix, 'ipv6');
}

// A folder or file name: one to sixty lower-case letters, digits and single hyphens, not
// starting or ending with a hyphen, and not a name Windows reserves for a device. Written
// without a nested repetition, which the security lint rule rejects.
function isName(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 60
    && /^[a-z0-9-]+$/.test(value) && !value.startsWith('-') && !value.endsWith('-')
    && !value.includes('--') && !DEVICE.test(value);
}

function isHttps(address) {
  try {
    return new URL(address).protocol === 'https:';
  } catch {
    return false;
  }
}

function isInternalAddress(ip) {
  return INTERNAL.check(ip, net.isIPv6(ip) ? 'ipv6' : 'ipv4');
}

// A host is internal when it is an internal address, has no dot, ends in a local-only
// suffix, or any address its name resolves to is internal.
async function isInternalHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) return isInternalAddress(host);
  if (!host.includes('.') || /\.(local|internal|localhost|home\.arpa)\.?$/i.test(host)) return true;
  const found = await dns.lookup(host, { all: true });
  return found.length === 0 || found.some((entry) => isInternalAddress(entry.address));
}

// Download one address. Redirects are followed by hand: every hop must be https and not an
// internal address before it is requested. The whole download, every redirect included, stops
// after TIMEOUT_MS; the name lookups are bounded by the system's resolver, not by this limit. The
// body is read as a stream that stops past MAX_BYTES, counted after decompression.
async function download(address) {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let current = address;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    if (!isHttps(current)) return { reason: 'a redirect left https' };
    if (await isInternalHost(new URL(current).hostname)) return { reason: 'an internal address' };
    const response = await fetch(current, { redirect: 'manual', signal });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      if (response.body) await response.body.cancel();
      current = new URL(location, current).href;
      continue;
    }
    if (response.status < 200 || response.status > 299) {
      if (response.body) await response.body.cancel();
      return { reason: `status ${response.status}` };
    }
    if (!response.body) return { reason: 'an empty answer' };
    let total = 0;
    const chunks = [];
    for await (const chunk of response.body) {
      total += chunk.length;
      if (total > MAX_BYTES) return { reason: 'larger than the size cap' };
      chunks.push(chunk);
    }
    return { bytes: Buffer.concat(chunks) };
  }
  return { reason: 'too many redirects' };
}

// Characters a reader cannot see or that reorder what is shown: control characters, zero-width
// characters, direction marks and overrides, variation selectors and tag characters. Written as
// code point ranges, so no such character sits in this file.
const HIDDEN = [
  [0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200d], [0x2060, 0x2060], [0x202a, 0x202e],
  [0x2066, 0x2069], [0xfe00, 0xfe0f], [0xe0000, 0xe007f],
];

// The text with every hidden character turned into a space.
function plain(value) {
  let text = '';
  for (const ch of String(value == null ? '' : value)) {
    const code = ch.codePointAt(0);
    text += HIDDEN.some(([low, high]) => code >= low && code <= high) ? ' ' : ch;
  }
  return text;
}

// An address as it may be shown or indexed: any user name and password removed.
function shownAddress(address) {
  try {
    const url = new URL(address);
    if (!url.username && !url.password) return address;
    url.username = '';
    url.password = '';
    return url.href;
  } catch {
    return address;
  }
}

// An address carries a user name or a password.
function hasCredentials(address) {
  try {
    const url = new URL(address);
    return Boolean(url.username || url.password);
  } catch {
    return false;
  }
}

// A path that exists as a symbolic link. A missing path is not one; any other failure to look
// stops the program rather than guessing.
function isLink(target) {
  try {
    return fs.lstatSync(target).isSymbolicLink();
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
}

// One table cell: hidden characters become spaces; backslash, pipe, square brackets, angle
// brackets and the backtick are escaped, so no cell can open a link, an image or markup.
function cell(value) {
  return plain(value).replace(/ +/g, ' ').replace(/[\\|[\]<>`]/g, '\\$&').trim();
}

// The run's block for the index: a heading line, a table of every paper of the run that is in
// the library, kept now or already there, and the cited web pages.
function runBlock(run, listed) {
  const lines = ['', `## ${cell(run.date)}, ${cell(run.item)}`, ''];
  lines.push('| File | Title | Authors | Year | Link | Why it was read |');
  lines.push('|---|---|---|---|---|---|');
  for (const p of listed) {
    const file = `${p.topic}/${p.file}.pdf`;
    lines.push(`| ${cell(file)} | ${cell(p.title)} | ${cell(p.authors)} | ${cell(p.year)} | ${cell(shownAddress(p.url))} | ${cell(p.why)} |`);
  }
  lines.push('', 'Web sources cited, not papers:', '');
  for (const page of Array.isArray(run.pages) ? run.pages : []) {
    lines.push(`- ${cell(page && page.title)}: ${cell(shownAddress(page && page.url))}`);
  }
  return lines.join('\n') + '\n';
}

// A failure's name for the output line: a system error code when there is one, never a number.
function errorCode(error) {
  if (!error) return 'unknown';
  if (typeof error.code === 'string') return error.code;
  if (error.cause && typeof error.cause.code === 'string') return error.cause.code;
  return error.name || 'unknown';
}

async function main() {
  const staging = String(process.argv[2] || '');
  const base = path.basename(staging);
  const slug = base.startsWith('.incoming-') && base.endsWith('.json') ? base.slice('.incoming-'.length, -'.json'.length) : '';
  if (path.dirname(path.normalize(staging)) !== LIBRARY || !isName(slug)) {
    console.log('refused: the staging file must be .ctoc/papers/.incoming-<slug>.json');
    process.exitCode = 1;
    return;
  }
  // Nothing is written through a symbolic link: a library, an index or an ignore file that is
  // one refuses the whole run before anything is read or fetched.
  for (const target of ['.ctoc', LIBRARY, path.join(LIBRARY, 'index.md'), path.join(LIBRARY, '.gitignore')]) {
    if (isLink(target)) {
      console.log(`refused: ${target} is a symbolic link`);
      process.exitCode = 1;
      return;
    }
  }
  let run;
  try {
    run = JSON.parse(fs.readFileSync(staging, 'utf8'));
  } catch {
    console.log('refused: the staging file could not be read as a paper list');
    process.exitCode = 1;
    return;
  }
  if (!run || typeof run !== 'object' || !Array.isArray(run.papers)) {
    console.log('refused: the staging file holds no list named papers');
    process.exitCode = 1;
    return;
  }
  // The paper library is never committed (the owner's ruling of 2026-10-02): a file holding
  // `*` ignores the folder and itself. One that exists is never replaced: the exclusive write
  // fails on any existing entry, and two runs at once both go on.
  const ignoreFile = path.join(LIBRARY, '.gitignore');
  try {
    fs.writeFileSync(ignoreFile, '*\n', { flag: 'wx' });
  } catch (error) {
    if (!error || error.code !== 'EEXIST') throw error;
  }
  const kept = [];
  // Every paper of the run that is in the library after the run, kept now or already there,
  // in list order and once per file; the run's index block lists them all.
  const listed = [];
  const listedPaths = new Set();
  const list = (p, dest) => {
    if (listedPaths.has(dest)) return;
    listedPaths.add(dest);
    listed.push(p);
  };
  for (const p of run.papers) {
    if (!p || typeof p !== 'object') {
      console.log('refused, not a paper entry');
      continue;
    }
    const address = typeof p.url === 'string' ? p.url : '';
    const shown = JSON.stringify(plain(shownAddress(address)));
    let dest = '';
    try {
      if (!isHttps(address)) {
        console.log(`refused, not https: ${shown}`);
        continue;
      }
      if (hasCredentials(address)) {
        console.log(`refused, the address carries a user name or password: ${shown}`);
        continue;
      }
      if (!isName(p.topic) || !isName(p.file)) {
        console.log(`refused, a folder or file name breaks the name rule: ${shown}`);
        continue;
      }
      if (isLink(path.join(LIBRARY, p.topic))) {
        console.log(`refused, the topic folder is a symbolic link: ${shown}`);
        continue;
      }
      dest = path.join(LIBRARY, p.topic, `${p.file}.pdf`);
      if (fs.existsSync(dest)) {
        list(p, dest);
        console.log(`already in the library ${dest}: ${shown}`);
        continue;
      }
      const result = await download(address);
      if (!result.bytes) {
        console.log(`not fetched, ${result.reason}: ${shown}`);
        continue;
      }
      const bytes = result.bytes;
      if (bytes.length <= MIN_BYTES || bytes.subarray(0, 4).toString('latin1') !== '%PDF') {
        console.log(`not fetched, not a paper file over fifty kilobytes: ${shown}`);
        continue;
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, bytes, { flag: 'wx' });
      kept.push(p);
      list(p, dest);
      console.log(`kept ${dest} (${bytes.length} bytes)`);
    } catch (error) {
      const code = errorCode(error);
      const held = code === 'EEXIST' && dest !== '' && fs.existsSync(dest);
      if (held) list(p, dest);
      console.log(held ? `already in the library ${dest}: ${shown}` : `not fetched, error ${code}: ${shown}`);
    }
  }
  fs.mkdirSync(LIBRARY, { recursive: true });
  fs.appendFileSync(path.join(LIBRARY, 'index.md'), runBlock(run, listed));
  fs.rmSync(staging);
  console.log(`papers in the list: ${run.papers.length}; kept: ${kept.length}`);
}

main().catch((error) => {
  console.log(`stopped: ${errorCode(error)}`);
  process.exitCode = 1;
});
