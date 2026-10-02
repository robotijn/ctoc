# deepthink slice 5 — Step 13 SECURE — security-scanner report (verbatim)

Dispatch d-deepthink-s5-step13-secure, received 2026-10-02 10:56 CEST. Verdict: WARN — moves from block; the high finding (the reading agent could read local files) is closed structurally; 1 medium (the no-file-tool fences read only the first tools line; a `memory:` key adds Read/Write/Edit), 6 low, 1 owner decision. Saved by the session without edits.

---

**Verdict: warn. It moves from block.** The high finding from the earlier scan (the reading agent could read local files) is closed. The new agent's tool grant is exactly `WebSearch, WebFetch`, and the skill no longer sends it to any file. Nothing high or critical is left. There is one medium finding: the tests that guard "no file tool" can be got around by one frontmatter key. There are six low findings and one decision for you. Under the default pull-request policy (no `.ctoc/security-policy.yaml`, no baseline, so every finding counts as new), a new medium finding gives warn. Under the warnings-are-bugs rule, all eight still want fixing now. I wrote nothing in the repository.

## 1. Is the reading agent's file access closed?

- **The tool grant:** `agents/ai-quality/deepthink-researcher.md` line 4 reads exactly `tools: WebSearch, WebFetch`. I read Claude Code's plugin agent loader (installed version 2.1.286; I read its code, I did not execute it). An explicit `tools:` list is what the agent gets. The loader also ignores `permissionMode`, `hooks` and `mcpServers` in plugin agents (it warns instead), so those keys add nothing. There is one exception, which is finding 1 below.
- **File paths in the skill:** the decisions log is pasted into the brief, never pointed at (lines 38–41, 58). One leftover remains: the brief still asks for "the exact path" of a source to mine (finding 2).
- **Injected instructions:** the rule to describe one in its own words and never quote it is present in both places: skill line 127 and agent line 49.
- **What the session does with the returned text:** it copies it into the brief and the staging file, acts on nothing in it (line 57), and shows it to you, which is by design. Task summaries are fixed text (line 98). The slug never comes from the agent. Topic and file names are checked by the program before they become paths.
- **Other ways to reach local data:**
  - **Hooks:** no CTOC hook watches WebFetch. `guard-files.js` only covers Read, Edit, Write and Bash.
  - **What WebFetch blocks itself** (read from Claude Code's code, not executed): it upgrades `http` to `https`. It refuses a host name without a dot, which also stops `file://`, `data:` and `localhost`. It refuses an address with a user name or password. It asks Anthropic's domain service about the host name first. It follows a redirect only within the same host.
  - **What gets through:** I found no check against private addresses. `https://10.0.0.5/`, or a dotted name that resolves to an internal address, is stopped only by the agent's instruction (lines 60–62) and, in practice, by the certificate check. That is decision 8 below.
  - **Permissions:** the `claude` command in your shell is an alias that adds `--dangerously-skip-permissions`. If the session was started that way, no permission prompt stands in front of any address. I have no data on how the running session was actually started.

## 2. The program, run where it stands against a local stub server

| Attack | Result |
|---|---|
| Staging file `/etc/passwd`, a path with `..`, a sub-folder, an absolute path, upper case, `..` or empty as the slug, a 61-character slug, `con`, backslashes | Refused, exit 1, nothing written, no ignore file |
| Staging path with `./` or `papers/../papers/` | Accepted; it is the same file, so no harm |
| Staging file that is a link to a file outside the library | The program reads through the link and removes the link; the target is untouched (same as before) |
| Document is `null`, `papers` key misspelled, `__proto__` at the top level | Refused: "holds no list named papers" |
| Topic or file name `..`, `/`, `a/b`, `.hidden`, `Upper`, `üni`, Cyrillic `а`, empty, `-a`, `a-`, `a--b`, 61 characters, `con`/`com1`/`lpt9`, `__proto__`, zero-width space, line break, a number, a list, missing | All 39 refused, and the stub received no request; a 60-character name was kept |
| `http`, `file:`, `data:` addresses | Refused, no request made |
| `127.0.0.1`, `[::1]`, `[::ffff:127.0.0.1]`, `0x7f.1`, `2130706433`, `169.254.169.254`, `localhost`, `foo.localhost`, a name resolving to `10.x`, a host without a dot | Refused as internal, no request made |
| `[::7f00:1]` and `[64:ff9b::7f00:1]` | **A connection was attempted** (it timed out on this Mac); see finding 4 |
| `https` redirect to `http`, to an internal address, to `file:` | Never requested (stub log) |
| `https` redirect to `https`, relative redirect | Kept |
| Redirect loop | Stopped after 6 requests |
| Address with a user name and password | "not fetched, error TypeError", and the address, password included, is printed |
| HTML page; `%PDF` of 10 KiB; exactly 51,200 bytes; 404 response | Not kept |
| `%PDF` of 51,201 bytes | Kept |
| 1 GiB body; 200 MiB gzip bomb | Stopped at the size cap; peak memory 222 MiB and 189 MiB |
| Server stalls after the headers; server sends one byte a second | Each stopped at about 60 seconds ("TimeoutError"); the next paper was then kept |
| Pipe, line break, `## ` heading, markdown link or image, `<img>`, backtick, ESC and BEL in the date, title or item | Escaped or folded to a space; no heading or link injected |
| `__proto__` and `constructor` inside an entry; `pages` given as an object | No prototype change; ignored |
| Topic folder name taken by an ordinary file | "not fetched, error EEXIST", but only after the download |
| Broken link where the paper would go | "not fetched, error EEXIST"; nothing is written through the link |
| Same topic and file twice | Kept once, then "already in the library"; one index row |
| Existing `.ctoc/papers/.gitignore` with other content | Never overwritten (28 bytes before and after) |
| `.ctoc/papers/.gitignore` is a broken link | **The program wrote `*` through the link**, creating a file outside the library (finding 3) |

- **Name lookup checked separately from the connection:** I demonstrated this. When the program's own lookup returns a public address and the connection's lookup returns loopback, the program fetched and kept a file from loopback. In real use the certificate check blocks it: an internal server would need a valid certificate for the attacker's name. Same limit as the earlier scan, no change proposed.
- **The `safe-fs` wrapper** only adds checks for an empty path and a null byte, then calls Node's own functions with the path unchanged. It weakens nothing. It is reached by a path relative to the program file, so a project cannot swap it.
- **With `${CLAUDE_PLUGIN_ROOT}` unset,** zsh and bash both print `Cannot find module '/skills/deepthink/fetch-papers.cjs'` and exit 1 (`/skills` does not exist on this Mac). The variable is also unset in my own shell.
  - Claude Code's code contains a function that replaces the literal `${CLAUDE_PLUGIN_ROOT}` with the plugin path when it loads plugin content. I saw it used for agent bodies; that it also runs on skill bodies is believed, not verified. Windows is finding 7.

## 3. The watcher-fence change is limited to this one agent

`WEB_ONLY` (`tests/watcher-shape.test.js` line 144) is a hand-written set holding one path. The branch at line 221 applies only to that path. For it the rule is stricter: the tools must be exactly WebSearch and WebFetch.

Every other agent still has to include `Read` and `Grep`. A new agent cannot go into `legacy` either, because that list may only shrink. Adding another agent to `WEB_ONLY` means editing a test, which a plan has to cover and a reviewer sees. I confirmed this by reading the code; I did not run a probe against it.

## Findings

**1. Medium, confidence medium. The tests that guard "no file tool" read only the first `tools:` line, and a `memory:` key adds Read, Write and Edit.**
- **Where:**
  - `tests/deepthink-ships-with-ctoc.test.js` lines 415–421 take the first line that starts with `tools:`.
  - Line 570, `assert.equal(/^skills:/m.test(fm), false, …)`, forbids only `skills:`.
  - `tests/watcher-shape.test.js` uses `/^tools:\s*(.+)$/m`, which also takes the first match.
- **Evidence:** in Claude Code's plugin agent loader, a valid `memory` value appends `Write`, `Edit` and `Read` to the explicit tool list whenever the memory feature is switched on. I read this in the code and did not execute it. How the loader reads a second `tools:` key was not verified.
- **Why it matters:** the plan's acceptance criterion says "a file or command tool added to it fails check 3 by name". That is false for this route.
- **Change:**
  - In check 17, assert that the top-level frontmatter keys are exactly `name, description, tools, model, effort, tier, reports_to, dispatch_protocol, category, reads_ancestry, confidence_calibration, parallel_safe, effort_budget, color, maxTurns`, and that exactly one line begins with `tools:`.
  - In the web-only branch of the watcher fence, reject `memory:` and a second `tools:` line by name.

**2. Low. The brief still asks for a local path and tells the agent to read a local source.**
- **Where:** `skills/deepthink/SKILL.md`:
  - line 31: "a file the user downloaded";
  - line 120: "the user's words plus the exact path, identifier or link";
  - lines 124–125: "For a source to mine, read the source itself completely first".
- **The problem:** this contradicts line 58 ("never … a home-directory path"). The agent cannot read such a file. The path, which usually names your account, ends up in the context of an agent that can send requests out.
- **Change:** replace "the exact path, identifier or link" with "the identifier or public link; for a file on this machine, its title and any public identifier or link, never its path".
- **What to do with a file that has no public copy is your call:**
  - (a) the run says under Failures that it cannot mine a file with no public copy; or
  - (b) the session pastes the file's text into the brief, which means the session itself reads untrusted content with all its tools.

**3. Low. Symbolic links inside the library are followed, and the new ignore-file write creates a file outside the library through a broken link.**
- **Where:** `skills/deepthink/fetch-papers.cjs` line 156, `if (!fs.existsSync(ignoreFile)) fs.writeFileSync(ignoreFile, '*\n');`.
- **Evidence (verified):** a broken link at `.ctoc/papers/.gitignore` made the program create the file it pointed to, outside the library.
- **The same behaviour already existed in two other places:**
  - an `index.md` that is a broken link receives the run's block in a newly created outside file (line 213);
  - a topic folder that is a link puts the PDF outside the library (lines 200–201).
- **Who could do it:** someone who can already write to `.ctoc/papers/`, or a cloned repository that ships those links.
- **Change:**
  - Before the first write, refuse the run when `.ctoc`, `.ctoc/papers`, `index.md` or `.gitignore` is a link. Use `fs.lstatSync(p).isSymbolicLink()` when the path exists; `safe-fs` already has `lstatSync`.
  - Refuse a paper whose topic folder is a link.
  - Write the ignore file with `{ flag: 'wx' }` inside a `try`, and treat `EEXIST` as "already there" so two runs at once both work.

**4. Low. The internal-address list misses two IPv6 forms that embed an IPv4 address.**
- **Where:** `fetch-papers.cjs` lines 26–28.
- **Evidence:** `[::7f00:1]` (the old IPv4-compatible form of 127.0.0.1) and `[64:ff9b::7f00:1]` (the well-known NAT64 prefix) passed the check, and the program attempted connections.
- **Change:** add `['::', 96]`, `['64:ff9b::', 96]`, `['64:ff9b:1::', 48]`, `['2002::', 16]` and `['fec0::', 10]`.

**5. Low. Index cells let bidirectional-override, zero-width and C1 control characters through.**
- **Where:** `cell()`, lines 97–104, changes only code points below 32 and 127.
- **Evidence (verified):** U+202E, U+202C, U+200B and U+009B were written raw into `index.md`. The printed lines go through `JSON.stringify`, which does not escape these characters either. The index is now ignored by git, so this stays on the machine.
- **Change:** in `cell()` and in the printed address, turn into a space the code points 0x80–0x9F and U+200B–U+200D, U+2060, U+202A–U+202E, U+2066–U+2069, U+FE00–U+FE0F and U+E0000–U+E007F.

**6. Low. A new account home path appears in the build notes.**
- **Where:** `.ctoc/audit/deepthink-run-notes/s5-steps-8-15-executor.md` line 65 has a literal home-folder path and a scratchpad path, and both carry the account name.
- **Why it matters little but still counts:** the file is untracked and not ignored, so a broad commit takes it in. 112 files in the last commit already carry the account name in a path, so the new exposure is marginal.
- **Change:** replace both with `<home>`, as the plan's record already does.

Nothing else is new across 1,525 added lines in the 15 files I checked: the 12 changed files, the plan, its approval file and the build notes. I looked for secrets, token shapes, e-mail addresses and home paths. The hidden-character pattern you gave found nothing in the agent, the skill, the program, the plan or the four tests, and neither did a control-character search. The only character outside basic ASCII in the agent and the skill is the em dash.

**7. Low, confidence low (reasoned only; no Windows machine). An unfilled plugin root on Windows.**
- **Where:** `SKILL.md` line 183.
- **The problem:** if the skill text reaches the shell without the root filled in, PowerShell treats `${CLAUDE_PLUGIN_ROOT}` as an empty variable. Node then resolves `/skills/…` to the root of the current drive, where ordinary local users can create folders by default. Another user of the machine could put a program there.
- **Change:** one sentence in the skill: "If the command still contains the characters `${` when it is about to run, do not run it: the plugin root was not filled in; mark every paper `[paper not fetched]` and name the reason under Failures." The same sentence covers the record command in step 2.

**8. Your decision, no recommendation. Whether something other than the agent's instruction stops WebFetch at internal addresses.**
- (a) Leave it as an instruction plus https and certificate checking.
- (b) Add a `PreToolUse` hook for `WebFetch` that refuses IP literals in private ranges and local-only suffixes. This is a hook change, so it needs its own plan. It also cannot see what a name resolves to without doing its own lookup.

## 6. `.gitignore`

`.ctoc/papers/` is anchored to the repository root. `git check-ignore` returns 1 for `.ctoc/papers-old/`, `.ctoc/paper/`, `tests/fixtures/p/.ctoc/papers/a.pdf`, the program, a brief and the audit notes. No tracked file lives under `.ctoc/papers/`. It hides nothing that should be tracked.

The program's own ignore file holds `*`, so it also ignores `index.md`, which is consistent with your ruling.

## The earlier scan's findings 2–13 against this program

| Earlier finding | Status now |
|---|---|
| 2 (no size or time limit) | Fixed; verified |
| 3 (redirect to http, internal addresses) | Fixed; verified. New finding 4 left over |
| 4 (malformed fields) | Fixed; verified |
| 5 (task summary passed to the shell) | Fixed; checked by reading |
| 6 (program copied into the project) | Fixed: nothing is copied into a project, confirmed in every run |
| 7 (no test runs the program) | Fixed |
| 8 (returned text not marked as data) | Fixed |
| 9 (index passes markup and control bytes) | Fixed for ASCII; new finding 5 left over |
| 10 (Windows device names) | Fixed; verified |
| 11 (slug length) | Fixed; verified |
| 12 (symbolic links followed) | Still open; now also affects the new ignore file (finding 3) |
| 13 (papers not ignored) | Your ruling is implemented; verified |

## What I had no data for

- The agent in a live session: the installed plugin predates it.
- Whether the loader fills in `${CLAUDE_PLUGIN_ROOT}` in skill bodies.
- Whether the memory feature is switched on.
- How the loader reads a duplicate `tools:` key.
- WebFetch's behaviour beyond reading its code, including certificate checking (believed on by default).
- How the running session was started.
- Anything on Windows.
- Twenty concurrent runs: not repeated this time. The append-once design is unchanged.
- The secrets, static-analysis and dependency scanners were not dispatched. I did their part by hand. No lockfile changed.

```yaml
- dispatch_id: d-deepthink-s5-step13-secure
  severity: critical
  internal_tier: medium
  confidence: medium
  baselineState: new
  owasp: "Large Language Model Top 10 2025 — Excessive Agency"
  file: tests/deepthink-ships-with-ctoc.test.js:415-421,570 ; tests/watcher-shape.test.js:221
  summary: no-file-tool fences read only the first tools line; a memory key adds Read, Write and Edit
- dispatch_id: d-deepthink-s5-step13-secure
  kind: rollup
  severity: critical
  verdict: warn
  reason: earlier high finding closed structurally; one new medium under the default pull-request policy
  counts: { critical: 0, high: 0, medium: 1, low: 6, owner_decision: 1 }
  analyzers: { secrets: by hand, static: by hand plus runs, dependencies: no lockfile change, sarif: none }
```

Everything is in `/private/tmp/claude-uid/-Users-account-Code-ctoc/b1c5a29e-f445-4461-8294-b84832a0154b/scratchpad/secure-deepthink/r5/`: the stub server, the two preloads, the case runner, the case files, the added-lines scanner and `time-results.txt`.
