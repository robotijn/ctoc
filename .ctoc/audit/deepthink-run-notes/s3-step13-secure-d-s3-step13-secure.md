**Verdict: block.** Two high findings. The first is a new run note that names another of the owner's projects. The second is a new order in the skill: when Claude Code puts a security warning on the reading agent's report, the session strips the warning and still downloads every paper address in that report from the owner's machine. Both fixes are small. There is no checked-in baseline and no `.ctoc/security-policy.yaml`, so every finding counts as new under the skill's default policy. Under the warnings-are-critical rule every finding goes out at critical; the tiers below are for weighting.

## Findings

**1. High: another project is named in a new file.**
- `.ctoc/audit/deepthink-run-notes/s3-round1-revalidate-d-s3-r1-revalidate.md:121` holds the owner's private note for another project (its file name removed at the owner's decision of 2026-10-05). The account name is spelled out in that path; I put `<account>` in its place here.
- The other notes reporting the same read already wrote it as `<another of the owner's own projects>`: round 2 validate line 93, and `for-the-human.json:328`. The plan's record also says "none names the other project", which holds for the owner list but not for this note.
- The open account-name question does not cover this, because the project name is the problem.
- **Fix:** replace the path with `<home>/.claude/projects/<another of the owner's own projects>/memory/…`, with a one-line redaction marker so the verbatim note says it was edited.

**2. High: a security warning on the report is stripped, and the paper download still runs.**
- `skills/deepthink/SKILL.md:103` is new in this slice (finding r2-f3). It tells the session to leave Claude Code's security warning, or its note to verify the work, out of the result and name it in one line under Failures. Step 6 then goes on to write the staging file and run `fetch-papers.cjs`.
- Line 63 of the same skill says that program is the second way data can leave, and that no person sees those addresses first. So the one signal that the reading agent may have been steered does not stop the unprompted requests.
- Lines 248–249 then order a notice of just "…research finished", so the owner hears nothing about the warning until they open the brief.
- **Fix:**
  - When either the warning or the note is present, keep it word for word at the top of the result.
  - Write no staging file and do not run the program. Mark every paper `[paper not fetched]` with the reason "the report carried a security warning".
  - Make the notice say `research finished with a security warning`. That still contains the substring the test pins at line 501.
  - Download the papers only when the owner says to.

**3. Medium: the list of characters that can reach an index cell is incomplete.**
- `SKILL.md:230` names the left-to-right, right-to-left and Arabic letter marks, U+FEFF, U+2028 and U+2029 as able to reach an index cell. It leaves out the second range of variation selectors, U+E0100 to U+E01EF.
- I ran the program's own `cell()` function from its source, with no network. A whole hidden ASCII sentence encoded in that range came through unchanged.
- These also survive, verified the same way: U+2061 to U+2064, U+00AD, U+034F, U+3164, U+206A to U+206F, U+FFF9 to U+FFFB, and U+180E.
- The owner entry `h-deepthink-r3-index-direction-marks` already names the second variation-selector range in its evidence, so the record knew more than the skill now says.
- **Fix:** add the second variation-selector range to the sentence, and the other characters as a group ("and other invisible format characters"). Say plainly that hidden text can survive in a cell.

**4. Medium: words from another project's private memory are in committed files (the owner decides).**
The other project's name is redacted in these places, but the memory note's file name and its words, including a phrase (from the owner's private note for another project; quotation removed at the owner's decision of 2026-10-05), are quoted:
- `for-the-human.json:328` and `:356`
- `s3-round2-critic-d-s3-r2-critic.md:298` and `:308`
- `s3-round2-validate-d-s3-r2-validate.md:93`

The repository ships publicly. The owner's options, flat:
- keep the quotations as they are;
- cut them down to the words already in the skill and drop the memory file's name.

**5. Medium: an agent with web access read a file in another project.**
- In round 1's re-validation and round 2's validation, `citation-validator` read a file in another project's memory folder, outside this repository. That agent holds WebSearch and WebFetch, so one agent held untrusted web input, private data and a way to send data out.
- The notes report no instructions on any fetched page, and nothing shows misuse.
- **Fix:** future round briefs should limit that agent's file reads to the repository root. A quotation from outside the repository should be pasted in by the session or checked by the owner.

**6. Low: line 63 could be more explicit.** `SKILL.md:63` should state two more things:
- The paper addresses go through no web permission prompt and no per-request review by auto mode's classifier.
- The program's name lookup sends the host name before it decides anything, so a lookup alone can carry a piece of text out, even for a host the program then refuses.

**7. Low: "two known gaps" could point to the rest.** At `SKILL.md:205–207` the claim is honest within the skill's own list of internal address kinds. These are also not refused, all verified by running the check: documentation ranges (2001:db8::/32, 192.0.2.0/24), discard-only 100::/64, Teredo 2001::/32, and 5f00::/16. **Fix:** one clause pointing to `h-deepthink-r2-version-six-benchmark-range`.

**8. Low: one rule reads like a guarantee.** `SKILL.md:59`, "data … never instruction", is an order to a session that holds Bash and Write, not something that enforces itself. **Fix:** one clause matching line 61's "reduces the risk without removing it".

## The checks you asked for
- **Web-derived text run as a command:** none. Every command (lines 79, 99, 196 and 239) is fixed text, or is built from the checked name pattern, a task id or the id the launch returned. Web text reaches files only through the Write tool and the staging file.
- **Secrets:** none found in the 29 files. This was my own pattern scan, because gitleaks and trufflehog are not installed and no secrets or code analyzer was dispatched, so confidence is low.
- **Hidden or bidirectional characters written raw:** zero in all 29 files, scanned by code point including the supplementary ranges.
- **Account name in the s3 notes:** 6 occurrences in 4 notes, all covered by `h-s5-step13-account-name-in-note-paths`:
  - round 1 re-validate line 121 (1);
  - round 3 quiet re-read line 65 (1);
  - round 3 re-validate line 83 (1);
  - steps 8–9 executor lines 42, 43 and 45 (3). Lines 42 and 43 are the full home folder rather than `<home>`.
- **The plan's Execution Record:** uses `<home>` throughout, with no secrets and no other project.
- **The test diff:** reads files only, with no network and no shell.

## The paper program (out of scope, already filed)
- `h-deepthink-r1-check-and-connect-lookups`: the program looks the name up again to connect, so the address it checked is not the one it reaches.
- `h-deepthink-r2-version-six-benchmark-range`
- `h-deepthink-r2-mapped-address-untested`
- `h-deepthink-r3-paper-list-unprompted-requests`
- `h-deepthink-r3-index-direction-marks`
- `h-deepthink-r1-arxiv-pace-after-refusal`
- `h-deepthink-r1-fifty-kilobytes-wording`

Not filed, and I did not file them:
- the surviving characters listed in finding 3;
- a raw line separator (U+2028) in a printed address can put `papers in the list:` after a line break inside a quoted address. Line 222's rule about quoted addresses covers that.

## Risk
I took the Claude Code version claims at lines 56, 61 and 62 (2.1.271, 2.1.283, three and twenty blocks, WebFetch refusing names without a dot) from the record's sources and did not check them again myself. I did not write `security-results.json` or a report, because the dispatch said read-only. My scratch probes are in `<temporary folder>/sec13/`.

<!-- Redacted by the session on 2026-10-02: one other project name replaced with a placeholder. -->

<!-- Redacted by the build executor on 2026-10-05, at the owner's decisions of that day (cut the private note down; no private personal information in a public repository): 5 occurrence(s) of the private note's file name or words, a configuration folder, a temporary folder or a home path replaced. -->
