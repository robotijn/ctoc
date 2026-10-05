**Verdict: block.** Your first five findings are fixed: every reproduction now fails by name, except one residual on finding 5. But the new shapes you asked me to try found five ways to widen an agent's real grant while the test stays at 16 of 16. In each one, the test's hand-written frontmatter reader and Claude Code's own parser read the same file differently. Under the default policy (there is still no `.ctoc/security-policy.yaml` and no baseline), new high-rated findings with high confidence block. Only `tests/agent-tool-grants.test.js` needs to change, so this goes back to Step 10, with the new fixtures written first at Step 8. A patched copy I built in scratch passes 16 of 16 on all 125 agents and catches every shape below.

**How I checked.** I read Claude Code's parser out of the installed 2.1.289 binary and ran a transcription of it. Three things in it matter:
- The frontmatter ends at the first `---` anywhere in the text, not only on a line of its own.
- A frontmatter that fails to parse becomes empty, so the agent has no tools key and gets every tool.
- The `memory:` key appends Read, Write and Edit to the grant.

Today the test's reading and Claude Code's reading agree on all 125 agents, so nothing is exploitable yet.

## New findings in this change

All go out at severity critical; the tier below is the weighting.

| # | Tier, confidence | Where | Shape that stays green, and what Claude Code grants | Fix |
|---|---|---|---|---|
| 1 | high, high on the test side (reproduced). Claude Code side believed: its YAML parser is Bun's, which I could not run, so js-yaml stood in | `tests/agent-tool-grants.test.js:500-502` | **The grant is read from too few lines.** The list loop stops at the first blank or comment line, and an inline grant ignores an indented continuation line. On debt agent `quality/code-reviewer`, three shapes all stayed 16 of 16: a list of Read, Grep, Glob, then a blank line, then WebFetch, Write, Bash; the same with a comment line instead of the blank; and `tools: Read, Grep, Glob` followed by a line `  , WebFetch, Write, Bash`. The blank-line shape also passes with Windows line endings. Claude Code grants the full set in every case. | Every frontmatter line must be one the test can read. Under `tools:`, only `- Tool` lines are allowed. A blank line, a comment line, or an indented line after a key that has a value on its own line fails closed. |
| 2 | high, high (Claude Code's own regular expression run) | `:476` | **`---` inside a value.** I changed code-reviewer's description so it contains ` --- `. Claude Code's frontmatter regex ends the frontmatter there, so the tools line is never read and the agent gets **every tool**. The test reads to the next line that is exactly `---`. An honest typo does this too. | Fail closed when any frontmatter line contains `---`. |
| 3 | high, high (read from Claude Code's code; it applies when Claude Code's automatic-memory feature is on, which I believe is the default) | `:491-515`, nothing reads `memory` | **The `memory:` key.** Adding `memory: project` to code-reviewer gives Read, Grep, Glob, **Write, Edit**. Adding `memory: user` to the web-only agent `ai-quality/deepthink-researcher`, which is not in debt, gives WebSearch, WebFetch, **Read, Write, Edit**. That breaks the safety floor on the very agent whose limited grant is the point, and the test stays 16 of 16. | Allow only the 28 frontmatter keys in use today. Any other key fails by name. |
| 4 | high, medium (depends on Bun's parser failing where js-yaml fails; I ran Claude Code's repair step and it does not repair these) | `:518-528` | **The rest of the frontmatter is never checked.** Three shapes stay green, and each gives **every tool**: an unterminated quote in another key (`color: "blue`), a second tools entry written as `? tools` / `: Read, WebFetch, Write`, and a key spelled with an escape, `"tool\x73":`. The parse fails, the frontmatter becomes empty, and there is no tools key. | Same line grammar as finding 1. Each key must start with a letter. A value that opens a quote or a bracket must close it. A value must not start with a YAML indicator character. |
| 5 | high, high (Claude Code's agent walker accepts any case of `.md`; test side reproduced) | `:686` | **Upper-case extension.** A new `agents/quality/evil.MD` granting WebFetch, Write and Bash, or `evil.Md` under a dot-folder, is loaded by Claude Code. The census skips it without a word: 16 of 16. | A name ending in `.md` in any case other than lower case fails the census, naming its path. |
| 6 | low, high | `:851` | **A raw, invisible byte-order mark inside a string literal.** This is new since my last scan. It is harmless today (if an editor strips it, the assertion fails loudly), but no reader can see it. | Write `'\uFEFF---\ntools: Read\n---\n'`. |
| 7 | low, high (reproduced) | `:425-433`, `:938-947` | **Earlier finding 5, partly fixed.** Every exception reason now names its slice, and check 5 enforces that. But the maximum is now stated three times in the same file. One edit raised all three copies, moved `red-team-critic` into the debt list and removed its Grep, and the test stayed 16 of 16. | State the maximums in a second file, as I recommended before. Whether to do that or accept the risk is your decision. |

These findings also falsify three written claims: the test header (lines 13-16, "fails the census by name"), the fail-closed bullet in decision 10, and plan line 588 ("an agent in debt is still held to the safety floor").

**The fix I checked in scratch.** I wrote `frontmatterError(fm)`, called inside `grantOf` right after the existing checks on how the tools key is spelled. It does four things:
- refuses `---` anywhere in the frontmatter;
- refuses any key outside the 28 in use today, which includes `memory`;
- refuses unclosed quotes or brackets and values that start with a YAML indicator character;
- allows indented lines only as `- Tool` items under `tools:`, or under a key with no value on its own line.

I also added the lower-case `.md` rule to the census. Against the current repository it passes 16 of 16, fixture 7.1 included. Against all 49 runs below it leaves only the five correct greens. Two limits:
- The grammar shrinks the problem but does not prove the test and Bun's parser agree. A second reading with js-yaml plus Claude Code's repair step, required to produce the same tools, would close the remainder. js-yaml is already loaded by six tests and `src/lib/circuit-breaker.js`.
- Each shape needs its own fixture, written red first.

## Your findings 1 to 5, re-run in scratch copies

All 17 earlier reproductions now fail by name, with exit code 1. Messages are quoted in short form:
- Tools line deleted: "has 0 tools keys".
- `Tools:` with a capital T, and `tools :` with a space: "exactly \"tools:\"".
- Two tools lines: "2 tools keys".
- Quoted grant, and bracketed list of quoted tools: read correctly, then refused by check 3 and the safety floor.
- WebFetch or WebSearch together with NotebookEdit, MultiEdit, Task or Agent: "reads untrusted web content…".
- A tool from an external tool server: "not a known tool".
- Unreadable file: "cannot be read (EACCES)".
- `agents/` renamed away: "cannot be listed (ENOENT)".
- Bash, Write and Task added to code-reviewer: "holds … which its orders do not need".
- Symbolic link: "a symbolic link".
- `MAX_DEBT` raised alone: checks 4 and 10 fail.

The other new shapes you asked for are all caught:
- A flow list split across two lines: "unterminated".
- Look-alike Cyrillic letters in a tool name or in the key, and a zero-width space: "not a known tool" or "0 tools keys".
- A byte-order mark, and lone carriage-return line endings: "no frontmatter at the first byte". Claude Code strips the mark itself, so here the test is the stricter of the two.
- An agent under a dot-folder, and a dot-file agent: "no profile".
- `*`, `Web{Fetch,Search}`, and `Glob#`: "not a known tool".

These stay green, and that is correct:
- Windows line endings with the grant unchanged.
- A `tools:` line in the body text (Claude Code ignores it too).
- `tools: … # , WebFetch` (Claude Code also reads that as a comment).

## Nothing else broken

- Check 3 over every agent, the allowlist floor, the slice-naming rule, and the loader that is loaded outside the suite all work as decision 10 says.
- Decision 18's held-removal count is right: 50 tools on 27 agents (Bash 21, Write 14, Edit 14, Task 1).
- Decisions 13 and 15 do not touch the safety floor. `gate-critic` holds no web tool, and its Write could already overwrite a whole file, so Edit adds nothing. `product-reviewer` keeps its exception until slice 3 drops WebFetch.
- I did not re-check decision 16 (AskUserQuestion). It has no security effect, because that tool is on the floor's allowlist.

## Leak and hidden-character scan

I scanned the test file, the slice plan, the index plan, the two approval records, the five run notes, and the `CLAUDE.md` and `README.md` diffs. No secrets, home paths, account names, email domains or other project names. The one hit, my own earlier report at line 31, lists the patterns I searched for, not a real path. The only hidden character is the byte-order mark in finding 6.

**Confidence and what would change this.** This is my review alone; no second engine backs it. The Claude Code side comes from its shipped code, not from a live session. Findings 1 and 4 assume Bun's parser behaves like js-yaml; proof that it does not would lower them, but not finding 2, 3 or 5. You ruling that the test only has to match the canonical grant form would also change the verdict. I wrote neither the results file nor the run report, because the brief forbade repository edits. The repository copies are deleted. `agents/architecture/dependency-analyzer.md` was already modified before I started and I did not touch it.

Files are in `/private/tmp/<temporary folder>/-Users-<account>-Code-ctoc/61c0082a-1db5-4827-8ad4-1bed72e03bbe/scratchpad/`, for the fix pass to reuse:
- `harness.js` (the 49 reproductions)
- `cc-sim.js` (Claude Code's parser, transcribed)
- `patched.test.js` (the patched test)
- `results.txt` (the run output)
