# deepthink slice 5 — Step 13 SECURE, narrow repeat — security-scanner report (verbatim)

Dispatch d-deepthink-s5-step13-secure-2, received 2026-10-02 11:16 CEST. Verdict: WARN (2, 3, 4, 5, 7 closed; 1 closed for its two routes; new medium 9: the no-file-tool fences read lines while the loader parses YAML — a `---` in the description ends the frontmatter early; new low 10, 11). Saved by the session without edits.

---

**Verdict: warn.** Nothing is critical or high. Findings 2, 3, 4, 5 and 7 are closed, and I ran the program to check each one except 2 and 7, which I checked by reading. Finding 1 is half closed. The `memory:` key and a second `tools:` line are now refused by both tests. But both tests still read the agent's frontmatter line by line, while Claude Code parses it as YAML (a configuration-text format). I found five more ways in, all passing both tests (new finding 9, medium). There are also two new low findings. Findings 6 and 8 stay with you. I wrote nothing in the repository: all five fingerprints are unchanged and no `npm test` was run.

## 1. The two tests that guard "no file tool"

- **Present:** check 17 (`tests/deepthink-ships-with-ctoc.test.js` lines 610–612) holds the exact 15-key set and requires exactly one line starting `tools:`. The watcher test's web-only branch (`tests/watcher-shape.test.js` lines 228–237) refuses `memory:` and a second `tools:` line by name.
- **How I probed:** I copied the watcher test's shape rule word for word into the scratchpad, along with a copy of check 17. I ran both against 11 variants of the agent file. Next to that, I emulated Claude Code's plugin agent loader. I read the loader in the installed 2.1.286 program; I did not run it. It cuts the frontmatter with `/^---\s*\n([\s\S]*?)---\s*\n?/` and parses it with `Bun.YAML.parse`. If parsing fails, the frontmatter becomes empty. If there is no `tools` key, the agent gets every tool (the wildcard branch). I used the `js-yaml` package as a stand-in for Bun's parser.

| Variant | Watcher test | Check 17 | What the loader gives (stand-in parser) |
|---|---|---|---|
| unchanged | passes | passes | WebSearch, WebFetch |
| `memory: user` | refuses | refuses | memory set |
| second `tools: Read` | refuses | refuses | parse error, so every tool |
| `memory : user` (space before the colon) | **passes** | **passes** | memory set |
| `"memory": user` (quoted key) | **passes** | **passes** | memory set |
| `<<: {memory: user}` (merge key) | **passes** | **passes** | memory set |
| `tools: WebSearch, WebFetch,` then an indented `Read, Bash` line | **passes** | **passes** | WebSearch, WebFetch, Read, Bash |
| `---` inside the description | **passes** | **passes** | frontmatter ends at the `---`, so no tools key and every tool |
| `: ` inside the description | passes | passes | stand-in parser fails, so every tool (see the caveat under 9) |
| `Tools: Read` second line | passes | refuses | — |

## 2. The program, run where it stands against the local stub server

| Case | Result |
|---|---|
| Broken link at `.ctoc/papers/.gitignore`, at `index.md`, at `.ctoc/papers` | Exit 1 with `refused: … is a symbolic link`. No read, no request, nothing written outside. |
| `.ctoc/papers` or `.ctoc` as a live link to a real folder (extra cases) | Refused the same way. The staging file outside was never read. |
| Topic folder that is a link | That paper refused, the next one kept. Nothing written through the link. |
| `[::7f00:1]`, `[64:ff9b::7f00:1]`, `[2002:7f00:1::1]`, `[fec0::1]`, `[::ffff:7f00:1]`, a redirect to NAT64 | Every one "an internal address", no request made |
| `[::ffff:0:7f00:1]` | **A connection was attempted** (it timed out on this Mac). Finding 10. |
| U+202E, U+200B, U+009B in the title, authors, reason and address | Turned into spaces in the printed lines and in `index.md` |
| `user:pass@`, user only, password only | Refused before any request, printed without the credentials |
| A redirect to an address with credentials | The request was never made (Node refused to build it); the original address was printed |
| An ordinary pre-existing `.gitignore` | Untouched: 28 bytes before and after |
| Two runs started together, 20 times over, with no ignore file | 40 of 40 clean: both exit 0, the ignore file holds `*`, the index has both blocks |

## 3. The skill

- **The two `${` sentences** are at `SKILL.md` lines 79 (the record command) and 190 (the paper program). They contain only `${`, not the full variable name, so filling in the plugin root never rewrites them.
- **File-name limits:** skill lines 136 and 200 and agent line 86 match the program's rule: at most sixty characters, no `.pdf` ending.
- **No path in the brief:** `exact path`, `/Users` and `~/` occur nowhere in the agent or the skill. Line 122 now reads "its file name only", and line 34 forbids the folder.

## 4. Hidden characters and home paths

None in the five changed files. I searched with ripgrep for control characters, C1 codes, U+00AD, U+061C, U+180E, U+200B–200F, U+202A–202E, U+2060–2064, U+2066–2069, U+FE00–FE0F, U+FEFF and U+E0000–E007F. I also searched for `/Users/`, `/home/`, the account name and `~/`. The only characters outside basic ASCII are the em dash, plus box-drawing characters in the plan test.

## 5. Nothing regressed

- A redirect to `http`, to `file:` or to an internal address: never requested.
- 51,200 bytes: not kept. 51,201 bytes: kept.
- A 1 GiB body: stopped at the size cap, peak memory 227 MiB.
- A stalled server: stopped at 60 seconds, and the next paper was kept.
- A plain `http` address: refused.

## Status of findings 1–8

| | Status |
|---|---|
| 1 | Both named routes are closed (I ran a probe for each). The same weakness remains open as finding 9. |
| 2 | Closed |
| 3 | Closed (verified) |
| 4 | Closed for all five ranges (verified). One neighbouring range is left: finding 10. |
| 5 | Closed (verified) |
| 6 | Open, left for you. It has grown: the executor note's second section, line 127, and my earlier report, line 175, also carry the account name in a scratchpad path. |
| 7 | Closed as an instruction to the session, not as a mechanism. Not checked on Windows. |
| 8 | Your decision, no recommendation. I did not check that it was added to the file-guard plan's questions. |

## New findings

**9. Medium, confidence medium. Both no-file-tool tests still read the frontmatter line by line, while Claude Code parses it as YAML.**
- **Where:** `tests/deepthink-ships-with-ctoc.test.js` lines 610–612 and `tests/watcher-shape.test.js` lines 204 and 228–237.
- **The solid case:** a `---` anywhere in the description ends the loader's frontmatter early. The agent is then loaded with no `tools` key and gets every tool, Bash included. This route does not depend on the parser: the loader's own unused warning reads "a value containing "---"?".
- **The believed cases:** the indented continuation line and the three other spellings of `memory` rest on standard YAML behaviour, checked with the stand-in parser.
- **Caveat on the `: ` case:** `js-yaml` rejects a colon followed by a space inside a description. But the installed `security-scanner.md` has one (`` `steps: [12]` ``), and this run was launched as that agent with only Bash, Read and Write. That points to Bun's parser accepting it, so I do not count that case as a way in.
- **The plan's criterion** ("a file or command tool added to it fails by name") is still false for the indented continuation line.
- **Fix:** add this to check 17. `js-yaml` is already used by `tests/agent-dispatch-resolution.test.js`. It refused all 11 variants and passes the real file (scratchpad `fence-probe.cjs`):

```js
const loaderCut = /^---\s*\n([\s\S]*?)---\s*\n?/.exec(raw);
assert.equal(loaderCut && loaderCut[1].trim(), fm.trim(), 'a value holds "---"; the loader would end the frontmatter there');
const parsed = require('js-yaml').load(loaderCut[1]);
assert.deepEqual(Object.keys(parsed).sort(), [...AGENT_FRONTMATTER_KEYS].sort());
assert.deepEqual(String(parsed.tools).split(',').map((s) => s.trim()).filter(Boolean).sort(), ['WebFetch', 'WebSearch']);
```

- **If the same parse is ever applied to every agent:** `js-yaml` rejects `agents/security/security-scanner.md` and `agents/security/dependency-auditor.md` today, because of a colon and a space in their descriptions.

**10. Low. One more range carries a 32-bit (IPv4) address inside a 128-bit (IPv6) one.** `fetch-papers.cjs` line 30 lacks `['::ffff:0:0', 96]`, the "translated" form. `[::ffff:0:7f00:1]` passed the check and a connection was attempted.

**11. Low. Addresses of cited web pages keep their user name and password in the index.**
- **Where:** `fetch-papers.cjs` line 170 indexes `cell(page && page.url)` without stripping credentials.
- **Evidence:** a test page address with a user name and password went into `index.md` with both. The index is ignored by git and stays on the machine. The paper rows were stripped correctly.
- **Fix:** `cell(shownAddress(page && page.url))`.

```yaml
- dispatch_id: d-deepthink-s5-step13-secure-2
  severity: critical
  internal_tier: medium
  confidence: medium
  baselineState: new
  owasp: "Large Language Model Top 10 2025 — Excessive Agency"
  file: tests/deepthink-ships-with-ctoc.test.js:610-612 ; tests/watcher-shape.test.js:204,228-237
  summary: no-file-tool fences read lines while the loader parses YAML; "---" in the description, a continued tools line, and three memory spellings pass both fences
- dispatch_id: d-deepthink-s5-step13-secure-2
  kind: rollup
  severity: critical
  verdict: warn
  reason: findings 2,3,4,5,7 closed; finding 1 closed for its two named routes, remainder raised as new medium 9
  counts: { critical: 0, high: 0, medium: 1, low: 2, owner_decision: 1, left_by_design: 1 }
  analyzers: { secrets: by hand, static: by hand plus runs, dependencies: no lockfile change, sarif: none }
```

**What I had no data for:**
- How Bun's YAML parser itself treats a continuation line, a quoted key, a merge key or a duplicate key. I used `js-yaml` as a stand-in.
- Whether the memory feature is switched on.
- Anything on Windows.
- How the running session was started.

Everything is in `/private/tmp/claude-uid/-Users-account-Code-ctoc/b1c5a29e-f445-4461-8294-b84832a0154b/scratchpad/secure-deepthink/r5b/`:
- `fence-probe.cjs` and `fence-probe.txt`
- `watcher-fence.cjs`
- `cases-b.js`, `setup-b.js`, `batch-b.js`, `batch-b.txt`
- `concurrent.js`, `concurrent.txt`
- `run.js`, `stub.js`
