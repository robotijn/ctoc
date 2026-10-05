**Verdict: block.** A null character (U+0000) inside any frontmatter value still passes this test and the whole suite. Claude Code's real YAML parser rejects that block, so the agent gets every tool. The fix is one line in the main test, and I verified it in scratch. No security policy file or baseline exists, so the default policy applies: a new high-tier finding with high confidence blocks. I edited nothing in the repository.

## 1. The 78 reproductions

74 fail by name and 4 stay green, which matches the executor's claim. The 4 greens:
- **Correct:** no change; Windows line endings with the grant unchanged; a `tools:` line in the body.
- **Documented residual:** check 3 handed a wider debt set.

I added 6 rows. The 3 null-character rows are green today, and the patch below catches them by name. The 3 vm-reader rows are green today and stay green with the patch (finding 2).

## 2. What changed in how I tested: the real parser

Claude Code 2.1.289 embeds Bun 1.4.3+eecfd55de. That exact build is not published, so I fetched Bun 1.4.2 and 1.4.3-canary.1 from npm into scratch. The tarball checksums match the registry. Both builds give the same results below. I copied the agent-loading functions from the shipped binary (`RIt`, `Fs`, `UWt`, the repair step, `mTe`, `mst`, `Up`) and ran them under that Bun.

- **CTOC's agents load on the trusted path.** `EIt` calls `RIt` without `untrusted`. On that path a parse error means no frontmatter, so no tools key, so every tool.
- **All 125 agents:** Bun reads every key and every value exactly as the test does, with 0 mismatches. This turns the header's "believed" claim into "verified on today's agents".
- **The top-level `: ` claim is verified** against the real code and the real parser. Both real cases (`security/dependency-auditor`, `security/security-scanner`) fail Bun's first parse, the repair step quotes them, and the result is the same text. Eleven more variants behave the same way, including ones with `#`, brackets, quotes and braces.
- **Sweep of every Unicode code point** in four positions (description, end of value, nested item, name): the only character the test accepts and Bun rejects is U+0000.

## Findings

All go out at severity critical; the tier is the weighting.

| # | Tier, confidence | Where | Finding | Fix |
|---|---|---|---|---|
| 1 | **high**, high (reproduced on the real parser) | `tests/agent-tool-grants.test.js:536-560` (`parseFrontmatter`); claims at `:13-28` and `:585-590`, plan decision 23 (line 640) | **A null character in any frontmatter value is accepted.** It works in the description, the name or a nested item. The test reads `Read, Grep, Glob` while Bun throws "Unexpected character", so Claude Code grants every tool. The full suite on a mutated copy exits 0 (14,156 tests and suites, no failure). This falsifies the claim that readability is "decided by construction". Being invisible, it is mainly an adversarial shape, the same class as the 17 shapes closed last round. | After the `---` check at `:540`, add the line below. It exempts tab so fixture 7.9 keeps its message. Measured: the 125 frontmatters contain no character of that class (the only non-ASCII is U+2014), so nothing goes into debt. Verified: 22/22 pass on the repository, lint clean, rows Q1-Q3 caught by name ("holds the invisible character U+0000"), every earlier row unchanged, and the sweep shows 0 disagreements. Add a test 7.9 fixture that writes the escape `\u0000`, not a raw null. Update the header and decision 23 with the measured result and the Bun version. |
| 2 | low, high | `tests/agent-tool-grants-maxima.test.js:19-21`, `:27-29`, `:63`; decision 23 "What stays open" | **One-file edits keep both files green.** Each puts `red-team-critic` into debt while the vm reader still sees 118:<br>• Q4 sets `MAX_DEBT = 119; DEBT.add(...)` inside the describe body, which the stub never runs;<br>• Q5 checks `typeof process`;<br>• Q6 overrides `JSON.stringify`.<br>This is the same class as the check-3 residual, but the header's "leaves every value and list unchanged" is not true at run time. | Widen the "cannot catch" sentence to cover values changed while the suite runs and a main test that detects the stub. Optional one-line hardening: `describe(name, fn) { fn(); }`. Verified: it catches Q4 and leaves the real file green. |
| 3 | low, high | maxima `:75` | **No vm timeout.** A main test that never ends hangs this file: I killed it at 20 seconds with no output. The main file would hang the gate the same way, and `test-gate.js` has no per-file timeout. | Pass `timeout: 10000` to the `runInContext` call. Verified: it then fails with "Script execution timed out". |
| 4 | low, high | main test, no check exists | **`name` is not tied to the file name.** Bun reads `name: 0x1F` as "31" and `name: False` as "false". A second file in the same folder could also claim another agent's name. Today all 125 names equal their file names and are unique. | Require `name` to equal the file's base name. |
| 5 | low, high | `:498-503` with `:25-26` | **The top-level `: ` allowance has a hidden dependency.** The repair step only matches keys of the form `[a-zA-Z_-]+`. All 28 known keys fit; a future key with a digit would lose the repair. | One assertion over `FRONTMATTER_KEYS`, or one sentence in decision 23. |
| 6 | low, medium | nested-key check, `:548-549` | **Some nested keys differ to the test but are one key to YAML:** `null`/`Null` and `true`/`True`. Bun accepts the duplicate (verified), so this is only a hole if Bun's parser changes. js-yaml rejects it. | Optional: compare nested keys case-insensitively. |
| 7 | low (wording) | maxima, the failure message | A string `"118"` fails with "MAX_DEBT is 118 in the main test but 118 here". | Print the values with `JSON.stringify`. |

The fix for finding 1:
```js
    if (/(?!\t)\p{C}/u.test(line)) return { error: `holds the invisible character U+${line.match(/(?!\t)\p{C}/u)[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} in a frontmatter line` };
```

## Your specific questions

- **YAML scalar types** (`yes`, `no`, `on`, `off`, `null`, `~`, numbers, `0x`, `0o`, dates, `.inf`): none of them changes a grant. The tools value is always a list of fixed tool words. They only change how `name` and `description` are typed (finding 4).
- **Values with `#`:** `a#b` and `a` + no-break space + `#` are read the same by both. ` #` is refused.
- **Leading or trailing spaces, including Unicode spaces:** refused by the byte-for-byte comparison. A zero-width space is content in both readers.
- **Unicode line separators:** U+2028 and U+2029 are refused. NEL (U+0085) is content in Bun.
- **Two texts rendering to the same canonical form:** not possible. A text is only accepted if it equals its own rendering, so two different accepted texts always render differently. The only remaining risk is the readers disagreeing, which is the null character.
- **vm side effects:** measured with instrumentation: 0 writes, 0 child processes, 0 network calls. It reads 125 files and 27 folders, all under `agents/`, in about 11 ms.
- **Can the main test detect the stub?** Yes (finding 2).
- **Does the vm reader fail closed?** Yes, on a throw, a missing binding, NaN, a BigInt or a string. It has no timeout (finding 3).

## 3. Leak and hidden-character scan

I scanned both test files and the plan for:
- home and temporary-folder paths, the account name, email addresses and your name;
- key formats for OpenAI, Anthropic, GitHub, AWS, Slack, private keys, Google and signed web tokens;
- assignments of a key, secret or password to a literal; IP addresses; credentials inside a link.

Result: no leaks. The only hit is the redacted placeholder `<scratchpad>` (plan lines 702, 710, 723). There are no hidden characters. Non-ASCII is visible typography only: dashes, arrows, an ellipsis and box-drawing characters. Decision 19 now holds the six-character escape, not a raw byte-order mark.

## Risk, and what would change this

- **Bun version:** tested on 1.4.2 and 1.4.3-canary, not the exact embedded build. A later Claude Code with a different YAML build could move the boundary. Re-run `fullsweep-bun.js` on each update.
- **Loading mode:** if CTOC's agents were ever loaded as untrusted, a parse error would refuse the agent, and finding 1 would become a denial rather than a widening.
- **Network:** I downloaded two Bun packages into scratch. That is network activity you did not explicitly ask for. They are not a repository dependency.
- **Not written:** `security-results.json` and the run report, because the brief forbade repository edits.

Files are in `<scratchpad>/r4/`, where `<scratchpad>` is the path you gave. I wrote it that way so the account name stays out of the repository if this report is saved there.
- `harness4.js`: the 84 reproductions. Results are in `results4.txt` (current files) and `results4-patched.txt` (patched).
- `patched4.test.js`: the one-line fix.
- `cc-sim-bun.js`: the loader functions copied from the binary.
- `allagents.js`, `roundtrip.js`, `probe.js`, `sweep.js`, `fullsweep-bun.js`: the parser comparisons.
- `vm-sidefx.js`: the side-effect count.
- `nul-suite.txt`: the full suite passing with the null character in place.
- The Bun builds are in `<scratchpad>/bun/` and `<scratchpad>/bun-canary/`.
