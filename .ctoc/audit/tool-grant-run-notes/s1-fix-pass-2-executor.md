The second fix pass is done and Step 14 passes. One part is not built: the separate maxima test file. That file is outside the plan's declared files, so I filed a scope-growth request instead of creating it, and it now waits for your decision. I have not run the task completion and have not touched git.

**Step 14, on the final files**
- `tests/agent-tool-grants.test.js`: 18 pass, 0 fail, 0 skipped.
- `npm run lint`: clean.
- `npm run typecheck`: 1 pass, 0 fail.
- `npm test`: 12089 tests, 12089 pass, 0 fail, 0 skipped, 0 cancelled. Coverage is 99.9% against the 99% floor, and the gate says PASS.
- There are 546 test files on disk.

**Red first.** I added two new tests, 7.7 and 7.8. The red run was 18 tests, 16 pass, 2 fail.
- **7.7** has one assertion per frontmatter shape, 22 in all. On the old reader, 19 of them read as a clean grant. The other 3 already failed, but with a different message than the one the fixture asserts.
- **7.8** covers a file named `.MD` in the census.

**What changed in the test**
- **`frontmatterError`** is called from `grantOf` and written in this file's own style. It fails closed on:
  - `---` anywhere in the frontmatter;
  - any key outside the 28 in use today (so `memory:` is refused);
  - a key that does not start with a letter;
  - an unclosed quote or bracket;
  - a value that starts with a YAML indicator character;
  - under `tools:`, any line that is not a `- Tool` item (and items only when `tools:` has no inline value);
  - an indented line under any other key, unless that key's value sits on its own lines;
  - a blank line, a comment line or a continuation line anywhere in the block.
- **Census:** a file whose name ends in `.md` in any other letter case fails, with its path.
- **Byte-order mark:** the fixture now writes it as the escape `\uFEFF`.
  - The Edit tool could not make this change; it kept turning the escape back into the raw byte. I made it with a one-line string replacement that first checked there was exactly one such byte. This is the one place I did not use Edit.
- **Test header (lines 13–16):** rewritten to say exactly what "cannot read" covers. It also says what remains believed rather than proven: that this line grammar and Claude Code's YAML parser agree on every line the grammar accepts.
- **No new dependency.** No second YAML reader was added.

**The re-scan's reproductions and the earlier bite runs**
- **The scanner's file holds 48 reproductions, not 49.** I ran them all: 43 fail by name and 5 stay green. Each new shape is named, for example:
  - "has the frontmatter key "memory"" on `deepthink-researcher`;
  - "holds "---" inside its frontmatter";
  - "has a frontmatter line this test cannot read: """ for the blank line in a tools list;
  - "Claude Code loads it as an agent; spell the extension .md" for `evil.MD`.
- **Four of the five greens are correct:**
  - no change at all;
  - Windows line endings with the grant unchanged;
  - a `tools:` line in the body;
  - an inline comment that hides nothing.
- **The fifth green is not correct: raising every copy of `MAX_DEBT` in one edit.** It stays open until the maxima file exists.
- **My earlier 19 bite runs:** all 19 still fail by name. All scratch copies are deleted.

**Decision needed from you: the maxima file**
- `tests/agent-tool-grants-maxima.test.js` is not in the plan's declared files, and no approved plan covers it.
- The rule for an undeclared file is to stop and ask; a decision from the CTO Chief session does not widen the plan's scope. So I did not create the file.
- I filed a scope-growth request: inbox question `1791226690486-rxjfsg`.
- Until you decide through the menu, both copies of the maximums stay in the one test file, and the count lines stay at 546. Approving it means creating the file, moving `HISTORICAL_MAXIMA` into it, and changing the three count lines to 547.

**Written claims corrected**
- **Test header:** fixed in place.
- **Decision 10:** its fail-closed bullet is corrected, and it now says the first build was not fail-closed against Claude Code's own reading.
- **New decisions:**
  - 19: the line grammar, and why the escape was written by script.
  - 20: the maxima file waits on the scope request.
  - 21: the correction to plan line 588, old reading beside new.
- I checked afterwards that the plan's approval still matches.

**Files changed in this pass**
- `<home>/Code/ctoc/tests/agent-tool-grants.test.js`
- `<home>/Code/ctoc/plans/in-progress/agent-tool-grants-s1-the-test.md` (decisions section and execution record only)
- `<home>/Code/ctoc/.ctoc/inbox/questions/1791226690486-rxjfsg.md`, created by the scope-growth request

`CLAUDE.md` and `README.md` were not touched in this pass.

**Still owed by the session:** your decision on the scope request, then the Step 13 re-scan, the final review, and `menu task complete t126`.
