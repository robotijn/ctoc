**Verdict: block.** Every earlier reproduction now fails by name. But the frontmatter grammar still accepts lines that a YAML parser rejects. When that happens, Claude Code throws away the whole frontmatter, so the agent gets every tool, while the test reads the intended grant and stays green. I found 16 such shapes. Some are honest typos: a description ending in a colon, or a quoted description containing a Windows path. The default policy applies, because there is still no `.ctoc/security-policy.yaml` and no baseline; under it, a new high-rated finding with at least medium confidence blocks. The fix touches only the two test files, both already declared, and I verified it in scratch. Next step: fixtures written red at Step 8, then Step 10.

## 1. My reproductions, re-run against the current files

- **Old rows:** I ran all 48 earlier reproductions plus the maxima file. 44 fail by name and 4 stay green. All four greens are correct: no change; Windows line endings with the grant unchanged; a `tools:` line in the body; an inline comment that hides nothing.
- **Earlier finding 7 is closed.** Raising `MAX_DEBT` in the main file now fails in the maxima test with "MAX_DEBT is 119 in the main test but 118 here".
- **Earlier finding 6 is closed.** The test file has no raw byte-order mark left.

## Findings

All go out at severity critical. The tier is the weighting.

| # | Tier, confidence | Where | Finding | Fix |
|---|---|---|---|---|
| 1 | **high**. Test side: high (reproduced). Claude Code side: medium. js-yaml and PyYAML 6.0.3 both reject 14 of the 16 shapes; Bun's parser was not run. | `tests/agent-tool-grants.test.js:501`, `:504-510`, `:520-541` (the indented-line rule at `:535`) | **The grammar accepts YAML that does not parse.** On `quality/code-reviewer`, each shape stays 20 of 20 green while Claude Code's pipeline grants every tool:<br>• `description: … as follows:` (trailing colon)<br>• `description: "see C:\path …"` (unknown escape)<br>• `"a" "x"`, `"a"b"`, `'it's'`<br>• a value starting with `- `<br>• `tools:` list items at mixed indentation (`  - Read`, `  - Grep`, `- Glob`). This one is inside the tools key itself.<br>• nested `a: b: c`<br>• nested items or pairs at inconsistent indentation, or items and pairs mixed in one block<br>• an unterminated quote or unknown escape on an indented line<br>• a duplicate top-level or nested key. Low confidence on these two: PyYAML accepts duplicates.<br>Claude Code's repair step only rewrites unquoted top-level lines, so none of these get repaired. This falsifies three written claims: the test header (`:13-22`), plan decision 19 (line 636) and plan decision 21 (line 639). | Tighten the grammar to the shapes in use today (measured across all 125 agents: no quotes, no backslashes, two-space indentation only, no duplicate keys):<br>• a quoted value must be one whole scalar with no escape and no inner quote;<br>• refuse a value that starts with `- ` or ends with `:`;<br>• refuse duplicate keys at both levels;<br>• one indentation and one line kind (items or pairs) per block, spaces only;<br>• indented values must be plain: no `: `, no flow brackets.<br>My patch adds no dependency. It passes 20 of 20 on the repository with every existing fixture unchanged, and catches all 17 shapes (the 16 plus a tab-indented line, which Claude Code would repair) by name, e.g. "has a value ending in ":" under description". |
| 2 | medium, high (reproduced) | `tests/agent-tool-grants-maxima.test.js:45-46`; header `:8-9` | **The maxima test reads text, not values.** Each of these edits touches only the main file, moves `MAX_DEBT` or the debt list, and keeps both files green:<br>• the literal kept in a block comment, with the real binding `const [MAX_DEBT] = [119]`<br>• the literal kept in a template string<br>• `const [MAX_DEBT] = [DEBT.size];` inside check 4<br>• a shadow spelled `MAX_DEB\u0054`<br>• the assertion operand changed to `MAX_DEBT + 1`<br>This falsifies "raising one … means editing two files" (maxima header and decision 22). | Evaluate instead of parse. Run the main test's source in `node:vm` with `describe` and `it` stubbed out, read back the four `MAX_*` values **and** the list sizes, and compare both to the ceilings. Keep test 2's historical ceilings. Verified: catches all five edits above, and still fails loudly when the main file is missing. |
| 3 | medium, high (reproduced) | `:211-237`; nothing in the maxima file counts this | **The tools that safety-floor exceptions excuse are not counted.** Changing legal-scaffold's exception to `tools: ['Write', 'Bash']` and adding Bash to that agent stays green. That puts Bash on an agent that reads the web. `MAX_RULE6_EXCEPTIONS` counts exceptions, not the tools they excuse. | Add a ceiling of 6 excused tools. Included in the value-reading patch and verified. |
| 4 | low, high (reproduced) | `:371-402` | **A held removal can be swapped for another tool.** Changing pattern-detector's held Bash to Task (in both the list and the agent) keeps 50 held tools and stays green. | Add ceilings per tool: Bash 21, Write 14, Edit 14, Task 1. These are the numbers in the comment at `:371`. Verified. |
| 5 | low, high | `plans/in-progress/agent-tool-grants-s1-the-test.md:636`, column 1202 | **The plan now holds a raw byte-order mark.** It sits in decision 19, at the spot meant to show the escape text: "written as the escape \`<invisible>\`". | Replace it with the six characters `\uFEFF`. Decisions are outside the approval hash, as the fix passes showed. |

## 2. The maxima file, your three questions

- **Can a limit move with one file edited?**
  - Editing only the maxima file: no. Changing a ceiling alone fails the equality check, and raising one past the 2026-10-05 value fails test 2.
  - Editing only the main file: yes, in five ways (finding 2).
  - Remaining weakness, even after my patch: check 3 can be handed a wider debt set, `grantCheckFailures(all, { debt: new Set([...DEBT, 'iron-loop/red-team-critic']) })`, and it stays green. Any check whose logic lives in a file that can be edited has this weakness. Only review catches it.
- **Can the maxima file be made vacuous?** No.
  - A missing main file fails test 1 with ENOENT.
  - A renamed `MAX_*` fails with "found 0 such declarations".
  - Emptied ceilings fail test 2 on the key list.
  - The file is picked up by `npm test`, because the gate's file filter takes every `*.test.js` in `tests/`.
- **Can its reading be fooled?** Yes. The literal is matched inside comments and strings (finding 2).

## 3. Leak and hidden-character scan

Files scanned: both test files and the plan. Patterns searched:
- home paths, the account name, temporary-folder paths, email domains, your name;
- token formats for OpenAI-style keys, GitHub, AWS, Slack, private keys, Google keys and signed web tokens;
- assignments of a key, secret or password to a literal.

Result: no leaks. The one hidden character is the byte-order mark in finding 5. The only other non-ASCII characters are visible: dashes, arrows, an ellipsis and box-drawing characters.

**Confidence and what would change this.** This verdict is my review alone; no second engine backs it.
- The Claude Code side is a transcription of its shipped pipeline with js-yaml standing in for Bun, cross-checked against PyYAML. If Bun's parser accepted the YAML-invalid lines, finding 1 would drop toward a warning. So would a ruling from you that the test only has to match well-formed YAML.
- My two patches are not linted.
- I did not write `security-results.json` or the run report, because the brief forbade repository edits. The repository is unchanged.

Files are in `/private/tmp/<temporary folder>/-Users-<account>-Code-ctoc/61c0082a-1db5-4827-8ad4-1bed72e03bbe/scratchpad/r3/`:
- `harness3.js`: 78 reproductions.
- `patched.test.js`: the tighter grammar.
- `patched-maxima.test.js`: the value-reading sketch. It leaves out test 2's historical ceilings, so add them back.
- `results3-final.txt`: the run against the current files.
- `results3-bothpatched.txt`: the run with both patches. 72 fail by name. Of the 6 greens, 4 are the correct ones, one is the check-3 weakness above, and one is the historical-ceiling row my sketch leaves out.
