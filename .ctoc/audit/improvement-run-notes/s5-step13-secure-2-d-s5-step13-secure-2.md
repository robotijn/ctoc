# s5 — Step 13 SECURE, narrow re-scan — security-scanner report (verbatim)

Dispatch d-s5-step13-secure-2, received 2026-10-01 12:42 CEST. Saved by the session without edits. Verdict: warn (no critical or high finding, no secret).

---

**Verdict: warn.** I found no critical or high finding and no secret. All five recipe cases that your earlier form accepted now fail closed, and no temporary file is left on any failing branch. Two of the three earlier medium findings (1 and 3) are fully closed. The third (2) is closed for the place the model reads the text, and one new low finding covers what it leaves open. Neither `.ctoc/security-policy.yaml` nor `.security/baseline.sarif` exists, so the default policy applies: block on critical, high or a verified secret, otherwise warn. That leaves three new low findings and four informational ones.

## A. ATLAS lookup recipe, `<home>/Code/ctoc/agents/ai-quality/llm-security-tester.md` lines 32–35

I extracted lines 32–33 with the indent removed: 978 bytes, sha256 `7aeeecb8…`. It is byte-identical to `recipe-v3-50.sh`. I ran it under your curl and mktemp stand-ins with a fresh temp folder for each run, one case per Bash call. Each case ran in `/bin/bash` 3.2 and `zsh -f`, and seven ran again in the Bash tool's own shell, where `grep` is the embedded ugrep. There were 90 recipe runs in all, and every one exited 0.

**Your 18 cases.** Closed = it accepted the input before and now fails closed. Held = same correct behaviour as before.

| Case | Printed (identical in all shells) | Second request | Temp files left | Status |
|---|---|---|---|---|
| 01 honest | saved 2026.09 | `v6/ATLAS-2026.09.yaml` | 1 (by design) | held |
| 02 three-part first | saved 2026.09 | same | 1 | held |
| 03 unquoted first | saved 2026.09 | same | 1 | held |
| 04 comment only | shape not recognised | none | 0 | held |
| 05 comment first | saved 2026.09 | same | 1 | held |
| 06 traversal / foreign address | shape not recognised | none | 0 | held |
| 07 suffix / `$(touch …)` | shape not recognised, nothing created | none | 0 | held |
| 08 path on fifth line | shape not recognised | none | 0 | held |
| 09 dot→slash | shape not recognised | none | 0 | **closed** |
| 10 dot→`?` | shape not recognised | none | 0 | **closed** |
| 11 earlier `'2026x10'` entry | release mismatch | `v6/ATLAS-2026.10.yaml`, no longer `2026/10` | 0 | **closed** |
| 12 version 2026.04 | release mismatch | `…2026.09.yaml` | 0 | held |
| 13 2026.04 in collection, 2026.09 elsewhere | release mismatch | `…2026.09.yaml` | 0 | **closed** |
| 14 `'2026x09'` | release mismatch | `…2026.09.yaml` | 0 | **closed** |
| 15 manifest 404 | curl error, then (manifest) | none | 0 | held |
| 16 data 404 | curl error, then (data file) | `…2026.09.yaml` | 0 | held |
| 17 empty manifest | shape not recognised | none | 0 | held |
| 18 Windows line endings | shape not recognised | none | 0 | held |

In case 11, the mismatch comes from that fixture's data file having no `collection:` line. The closure itself is the address: the second request is now the correctly shaped path.

**New attacks** (bash and zsh; n09, n10 and n19 also in the tool shell):

- **Path does not point into `v6/`.** Variants tried: `v5/…`, `v6/../…`, `/v6/…`, `https://evil.example/…`, `%2F`, five-space indent, tab indent. All print shape not recognised, make no second request and leave 0 files. They also do not fall through to a later entry. Held.
- **Newest release line has a trailing space.** Prints saved release 2026.08. This matches the documented "never call it the latest", and line 44 then uses the table. Held.
- **Full-width digits in the release.** Not read as a release in any of the three shells. Held.
- **A NUL byte in the manifest.** Shape not recognised. Held.
- **Data-file variants.** A missing `collection:` block, a version in double quotation marks, unquoted, with a trailing comment, indented four spaces, `collection: ` with a trailing space, and Windows line endings all print release mismatch and leave 0 files. They fail closed; if MITRE ever reformats that line, every lookup fails rather than passing.
- **A second top-level `collection:` block at the end of the data file holding `'2026.09'`.** Prints saved. Open; informational finding D below.
- **A NUL byte in the data file.** Saved in bash and zsh, release mismatch in the tool shell. Under bash, step 2's name command then prints nothing and the count prints 2, so the agent writes "name not read". Fail-safe.
- **Every `mktemp` fails.** No request is sent; it prints "COULD NOT DOWNLOAD (manifest)" and leaves 0 files. Real curl 8.7.1 rejects `-o ""` with exit 2: "blank argument where content is expected".
- **Only the second `mktemp` fails.** The manifest is fetched and deleted, no second request is made, it prints "(data file)" and leaves 0 files.
- **`--max-time` against a server that trickles one byte a second.** Real curl gave exit 28 after 3,001 milliseconds with a partial file. The recipe's curl-failure branch deletes that file.
- **Live run.** Printed `saved … release 2026.09` at 2026-10-01T10:36:30Z; the file was 841,482 bytes and its collection block reads `version: '2026.09'`. I deleted it and confirmed it was gone.

**Are `$m` and `$f` removed on every branch? Yes.** The manifest file was never left behind in any run with the stand-ins. The data file was left only after `saved`, which is by design. One gap: in the live run I saw only the saved file, not the manifest's deletion.

## B. Hidden characters

- **The strip at skill line 121** is pure ASCII escape sequences. I ran it byte for byte: all 397 code points in the requested ranges are stripped, and none of the 14 neighbouring code points are.
  - Ordinary text is unchanged: English with symbols, composed and decomposed accents, Chinese, Arabic, Hebrew, Hindi, and emoji without selectors (including a skin tone and a flag).
  - Some text does change: the selector in "❤️" and in a keycap emoji, the zero-width joiner in a family emoji, the zero-width non-joiner in Persian, and a Japanese ideographic variation selector. This affects legibility only; see informational finding F.
- **Order at skill line 152.** `html.escape(HIDDEN.sub('', pr_description))` strips before escaping, which is the right way round. A `</pr_description>` split by a zero-width space comes out as `&lt;/pr_description&gt;`. The block compiles with warnings treated as errors.
- **The three agent patterns at line 88.** Run with ripgrep 14.1.1 on a crafted corpus:
  - The first matched tag characters, a zero-width space and a right-to-left override. It also matched the rainbow-flag sequence, which the prose covers under its two-emoji exception.
  - The third matched an emoji followed by three selectors and an emoji followed by two supplementary selectors. It did not match a single selector after an emoji, nor a single ideographic selector.
  - The second matched a letter or digit followed by a selector, **and also the keycap emoji `1️⃣` and `0️⃣`** (finding A).
  - All three patterns find nothing in the two changed files, and the second finds nothing in the repository.
- **The quoting rule.** Run with PyYAML 6.0.3 and js-yaml 4.2.0:
  - A raw carriage return or line feed in a quoted span inside `message: |` added the keys `verdict` and `note` in both parsers.
  - U+0085, U+2028 and U+2029 added them in PyYAML only.
  - With the rule applied as written, no keys were added for any of the five characters.

## Findings

| # | Severity | File:line | Exact text | Problem and evidence | Proposed change |
|---|---|---|---|---|---|
| A | low (new) | agent:88 | ``Also search for `[A-Za-z0-9][\x{FE00}-\x{FE0F}]` — a variation selector directly after a basic Latin letter or digit, which no emoji produces;`` | A keycap emoji is a digit, U+FE0F and U+20E3. The pattern matches it, so the clause "which no emoji produces" is false (run). A keycap in a prompt under review would become a spurious finding under checks 1 and 2. | Pattern → `[A-Za-z][\x{FE00}-\x{FE0F}]\|[0-9][\x{FE00}-\x{FE0F}]([^\x{20E3}]\|$)`. Run: it matches a letter or digit followed by a hidden selector, and no keycap. It still matches `0`+U+FE00; I believe that is a standardized "zero with short diagonal stroke" variant, which is rare. Change the clause to "…directly after a basic Latin letter, or after a digit that U+20E3 does not follow (a keycap emoji is a digit, U+FE0F, U+20E3)". In "which the second finds only directly after a basic Latin letter or digit", add "that does not start a keycap". |
| B | low (new) | agent:33, both `curl -sS --fail --max-time …` | `curl -sS --fail --max-time 60 -o "$m"` and `curl -sS --fail --max-time 50 -o "$f"` | Without `-q`, curl reads the user's `~/.curlrc` (manual, verified). From the manual, not run: a `retry` line there "resets" the time counter "each time the transfer is retried", which breaks the 110-second bound, gets the run killed and leaves both files. An `insecure` or `url` line there would turn off certificate checks or add a second address. None of these files exist on this machine, and a repository cannot plant one: the current folder is not searched outside Windows. | Change both to `curl -q -sS --fail --max-time …`; `-q` must be the first argument. In line 35 add: "Both requests start with `-q`, so no curl configuration file adds options to them." Before landing, run the honest case, case 16 and one live run again. |
| C | low (new) | skill:93 and skill:169 | ``asks to strip at every ingest boundary``; `    return review` | The cited 2026 entry says "at every ingest and render boundary". The model's `reasoning` is returned with any tag characters still in it, and showing it as plain text does not remove them. | skill:169 → `    return {**review, "reasoning": HIDDEN.sub("", review["reasoning"])}   # strip again at the render boundary`. skill:93 → "at every ingest and render boundary: before the model reads the text, and on `reasoning` before it is returned". Not run. |
| D | info (new) | agent:35 | ``the downloaded file's collection block — the lines from `collection:` to the next line that is not indented —`` | `sed` reads every top-level `collection:` block, not only the first (new case 15, saved). Anyone who can forge the file can also write the expected line, so this check only catches honest mistakes, not forgeries. | Prose: "every block of the downloaded file that starts at a line reading `collection:` and runs to the next line that is not indented". Alternative, not run: replace the `sed` with `awk '$0=="collection:"{c=1;next} c&&/^[^ ]/{exit} c' "$f"`. |
| E | info (new) | agent:35 | ``when a download fails, curl's own error message on standard error comes before that line`` | When `mktemp` fails, the recipe prints "(manifest)" or "(data file)" after mktemp's own message, with no download attempted (run). | Append: "; when a temporary file cannot be made, mktemp's message comes first and the line reads the same". |
| F | info (new) | skill:120 | `# Strip invisible characters before the model reads the text (LLM01:2026); an emoji's own selector goes too.` | The strip also splits emoji joined by a zero-width joiner, and removes the zero-width non-joiner in Persian and Indic text and Japanese ideographic selectors (run). This affects legibility only. | Optional: "…; an emoji's own selector, a joiner inside an emoji or a script that uses one, and an ideographic selector go too." |
| G | info (new) | skill:121, agent:88 | the character set | The set stops at what the quoted OWASP sentence names. U+FEFF, U+2061–U+2064, U+00AD and U+180E are also invisible, and I believe U+FEFF is common in zero-width hiding schemes. | Your call; not required by the cited source. |

## Status of the previous findings (numbers 1–13 from my last report)

Your brief describes 6–9 as recipe findings. In my report they were skill findings: `safe_log` (6–8) and the PostgreSQL note (9). They are listed by what they actually were.

1. **Closed.** The third pattern shipped as I proposed it and I ran it; see finding A for the second pattern.
2. **Closed** where the model reads the text: I ran it. The return path is new finding C.
3. **Closed.** Checked with two parsers.
4. **Closed.** Cases 09, 10, 11, 13 and 14.
5. **Closed.** 60 + 50 = 110 seconds, under the tool's 120-second default. What remains is a kill from an interrupt, a shorter timeout, or the configuration-file retry in finding B. The data is public.
6. **Closed.** skill:380, text as proposed.
7. **Closed.** I ran the exact `safe_log`. Line feed, carriage return, U+2028, U+0085, the escape character and a tag character all came out escaped, and an email address and a key were still redacted.
8. **Accepted, not fixed.** skill:381–382 now records it as "an accepted limit". I did not measure it again.
9. **Closed** as text at skill:558. It still says "not run", which is true.
10. **Informational, unchanged.** I did not re-test it; step 2 is outside this re-scan.
11. **Re-confirmed.** All 90 runs exited 0.
12. **Re-confirmed.** The tool shell gave the same results as bash and zsh, except the NUL-in-data case, where ugrep's `-I` gives release mismatch.
13. **Still open; your call.** Six lines in `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s5-skill-round3-research-d-s5-skill-r3-research.md` contain the account name or user id.

Line 35's disclosure "the 50-second limit was set after those runs" is now superseded: this scan ran the 50-second form against all 18 cases and once live.

## Not run, and side effects

- **Not run:** the fixes I propose for A to D, any test with a real `.curlrc`, a kill mid-download, the third pattern across the whole repository, and the C# `HtmlEncoder` behaviour.
- **What would change the verdict:** a `.ctoc/security-policy.yaml` that blocks on low findings.
- **Side effects:**
  - I wrote nothing inside the repository; `git status` for the two files shows only the executor's existing changes.
  - Scratch files are in `/private/tmp/claude-uid/-Users-account-Code-ctoc/b1c5a29e-f445-4461-8294-b84832a0154b/scratchpad/secure-s5-r2/`: the runner `run1.sh`, the extracted `recipe.sh`, the new cases in `cases-new/`, the mktemp-failure stand-ins in `bin-mkfail-*/`, `hidden_test.py`, `quote_test.py`, `corpus.txt`, and saved copies of the fixture data file in `work/*/tmp/`, about 17 MB.
  - The live run's file in the system temporary folder was deleted.
