# Round 2 critique and change list for `agents/ai-quality/hallucination-detector.md`

**Dispatch:** `d-s4-agent-r2-critic`. This is one consolidated document.

**Verdict: REFINE. The file scores 7.2 of 10 as it stands after round 1.** The weakest dimension is calibration: the look-alike check's "much later / far less" has no source.

**Two statements are wrong against the specifications that govern them:**
- **Python name comparison.** The file treats `.`, `-` and `_` as one character each. The Python packaging specification collapses a *run* of them into a single `-`.
- **Character ranges in the shell recipes.** The recipes rely on ranges such as `A-Za-z`, whose meaning the POSIX standard leaves unspecified outside its own locale.

**Two methods are missing:**
- A private-looking name that the *public* registry answers with status 200, which is dependency confusion.
- The Rust rule that the crate name in a `use` path is not always the package name.

This round also:
- adds peer-reviewed and standards-body citations beside the preprints;
- replaces three detection patterns that miss common forms;
- corrects one leftover contradiction from round 1.

**Before applying**
- **Fingerprint.** The executor confirms `sha256:412d36530695efbf8ce48ff0f9161c5e21047fcfe0553e488bf087027e2aa3ea`. I cannot hash files.
- **Where the `old` strings come from.** Every `old` below was copied from my read of the file on disk during this dispatch. Each is a verbatim, unique substring, and no two overlap, so they apply in any order.
- **Test runs owed.** I ran nothing. The shell recipes, the three patterns and the Python example must be run by the session before they are applied. The exact inputs are listed under "Runs the session must do before applying".

## Where this round's evidence comes from, and how it differs from round 1

**Round 1 used:**
- arXiv preprints;
- each registry's or vendor's own documentation (npm, PyPI, crates.io, axios, Node.js, TanStack);
- live registry probes.

**Round 2 uses:**
- **Specifications:**
  - the POSIX shell chapter and its regular-expression chapter;
  - the Python packaging name-normalisation specification;
  - YAML 1.2.2;
  - the Rust Reference.
- **Standards bodies and foundations:**
  - the Open Worldwide Application Security Project (OWASP): entry LLM09:2025 and the Top 10:2025;
  - the Open Source Security Foundation (OpenSSF): its two guides;
  - Supply-chain Levels for Software Artifacts (SLSA) version 1.1.
- **Security agencies:**
  - the European Union Agency for Cybersecurity (ENISA): its draft package-manager advisory;
  - NIST Special Publication 800-218.
- **A peer-reviewed publisher:** the USENIX Security 2025 proceedings version of Spracklen and colleagues.
- **Runs the session did on this machine:**
  - the locale test on the bracket ranges;
  - the three current patterns and the research note's axios pattern, run in Node.

**Why these classes are different.** They state rules and threat models that bind or advise everyone. Round 1's sources said what one registry answers today.

**Two classes read but not used for a change:**
- NIST is used only for the provenance item carried to round 3.
- The ECMAScript specification could not be retrieved, so the pattern changes rest on the session's runs.

## Seven-language check

It applies: every one of the seven languages has a package ecosystem. This round touches:

| Language | This round |
|---|---|
| Python | Name normalisation, names ending in punctuation, and the decorator example |
| JavaScript and TypeScript | The three detection patterns |
| Rust | The rule mapping a crate name to its package name |
| Java | Unchanged |
| C# (NuGet) and Go | Still no recipe; carried |
| SQL | Postgres extensions are still not queried, by design |
| C and C++ | Out of scope, following the skill |

---

## Findings, most severe first

### Finding 1 — high — correction of round 1: the Python name-comparison rule is wrong

**What is wrong.** Line 132 says to compare names "counting `_`, `-` and `.` as the same character". It cites PyPI's index page. The specification that governs names collapses *runs*: "The name should be lowercased with all runs of the characters `.`, `-`, or `_` replaced with a single `-` character." Its list of equivalent names includes `friendly--bard`. Under the file's rule, `friendly--bard` and `friendly-bard` compare as different names.

**Evidence.** Round 2 research, row A13, citing https://packaging.python.org/en/latest/specifications/name-normalization/ (read 2026-09-30).

**Decision:** `change`. This corrects round-1 finding f-s4-agent-r1-10, which applied the Index-page rule.

**Proposed change 1**

old:
~~~text
- Compare Python names ignoring case, counting `_`, `-` and `.` as the same character. On PyPI's index, "The project is matched case-insensitively with the `_`, `-` and `.` characters considered equal." (https://docs.pypi.org/api/index-api/, read 2026-09-30).
~~~

new:
~~~text
- Compare Python names after normalising both the way the packaging specification does: "The name should be lowercased with all runs of the characters `.`, `-`, or `_` replaced with a single `-` character." (https://packaging.python.org/en/latest/specifications/name-normalization/, read 2026-09-30). So `Friendly.Bard`, `friendly_bard` and `friendly--bard` all normalise to `friendly-bard`, and are one name.
~~~

### Finding 2 — high — new: a private-looking name that the public registry answers with status 200 is left unflagged

**What is wrong**
- The file quotes npm's description of the attack, but acts only on a status 404 ("possible private package").
- The dangerous case is the opposite one. The name looks private, and the *public* registry holds it. The recipe then prints REGISTERED, and nothing in the file flags it.
- This file has no recipe for a private registry, so the honest output is an unknown with no owning agent, not a finding.

**Evidence.**
- SLSA version 1.1 threats (https://slsa.dev/spec/v1.1/threats, read 2026-09-30): "Register a package name in a public registry that shadows a name used on the victim's internal registry".
- ENISA section 3.2.4: "Attackers publish packages with the same names as private packages with a much higher version number…"
- Round 2 research, B1(a).

**Decision:** `change`

**Proposed change 2**

old:
~~~text
- **Status 200, otherwise.** The recipe prints REGISTERED. That is necessary, not sufficient; go on to the look-alike check below.
~~~

new:
~~~text
- **Status 200, for a name that may be private.** When the repository configures a registry other than the public one for that ecosystem, or the name carries the organisation's own scope or prefix, and the public registry answers 200, the public package may be shadowing the organisation's own. The Supply-chain Levels for Software Artifacts threat model lists this dependency confusion: "Register a package name in a public registry that shadows a name used on the victim's internal registry" (https://slsa.dev/spec/v1.1/threats, read 2026-09-30). This file gives no recipe for a private registry, so record the name under `self_assessment.unknowns` as a possible dependency confusion, with the words "no owning agent named here", and never treat the REGISTERED line as settling it.
- **Status 200, otherwise.** The recipe prints REGISTERED. That is necessary, not sufficient; go on to the look-alike check below.
~~~

### Finding 3 — medium — correction of round 1's decision on the locale: the recipes rely on character ranges the standard leaves unspecified

**What is wrong.** There are nine bracket expressions using `A-Za-z0-9`:
- three in npm line 141;
- one in npm line 142;
- two in PyPI line 173;
- three in `bad()`, line 198.

The POSIX regular-expression chapter, section 9.3.5, item 7, says: "In other locales, a range expression has unspecified behavior: strictly conforming applications shall not rely on whether the range expression is valid."

**Why this corrects round 1.** Round 1 left out `export LC_ALL=C` because "The claim that bracket ranges depend on the locale is unvalidated". That premise is now sourced.

**The decision: spell the set out, and do not set the locale.**

- **The session's run.** On this machine the ranges refused `é`, `ab é` and `Ω` in both the C.UTF-8 and C locales, in bash and zsh. So spelling the set out changes nothing here.
- **Why spell it out anyway.** The standard makes no promise for other locales or platforms, such as a user's Linux collation or Git Bash on Windows. An explicit list is the only form the standard guarantees.
- **Why not `export LC_ALL=C`.** Whether assigning `LC_ALL` inside a running shell changes that shell's own pattern matching was not checked (research, "Everything not checked"). The session's `LC_ALL=C` run set the locale at shell start, which is a different case.
- **The cost.** Longer lines.

**What goes into the file**
- Four recipe lines are rewritten with the set spelled out as `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789`.
- The prose that explains why is in change 8b.

**Evidence.** Research row A2, citing https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap09.html (read 2026-09-30); `.ctoc/audit/improvement-run-notes/s4-agent-round2-session-runs.md`, "Locale and the bracket ranges".

**Decision:** `change`. Changes 3a–3d, plus the explanation in 8b. Change 3a also carries finding 12, and change 3c also carries finding 9.

**Proposed change 3a** (npm recipe, line 141)

old:
~~~text
case "$name" in (@[A-Za-z0-9]*/[A-Za-z0-9]*|[A-Za-z0-9]*) ;; (*) echo "NOT CHECKED: refused by the character check"; exit 0;; esac
~~~

new:
~~~text
case "$name" in (@[ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789]*/[ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789]*|[ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789]*) : ;; (*) echo "NOT CHECKED: refused by the character check"; exit 0;; esac
~~~

**Proposed change 3b** (npm recipe, line 142)

old:
~~~text
case "${name#@}" in (*[!A-Za-z0-9._/-]*|*/*/*) echo "NOT CHECKED: refused by the character check"; exit 0;; esac
~~~

new:
~~~text
case "${name#@}" in (*[!ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._/-]*|*/*/*) echo "NOT CHECKED: refused by the character check"; exit 0;; esac
~~~

**Proposed change 3c** (PyPI recipe, line 173)

old:
~~~text
case "$name" in (''|[!A-Za-z0-9]*|*[!A-Za-z0-9._-]*) echo "NOT CHECKED: refused by the character check"; exit 0;; esac
~~~

new:
~~~text
case "$name" in (''|[!ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789]*|*[!ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-]*) echo "NOT CHECKED: refused by the character check"; exit 0;; esac
case "$name" in (*[._-]) echo "NOT CHECKED: not a valid distribution name under the packaging specification"; exit 0;; esac
~~~

**Proposed change 3d** (crates.io and Maven Central recipe, line 198)

old:
~~~text
bad() { case "$1" in (''|[!A-Za-z0-9]*|*[!A-Za-z0-9._-]*|*..*|*.|*.[!A-Za-z0-9]*) return 0;; esac; return 1; }
~~~

new:
~~~text
bad() { case "$1" in (''|[!ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789]*|*[!ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-]*|*..*|*.|*.[!ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789]*) return 0;; esac; return 1; }
~~~

### Finding 4 — medium — correction of round 1's pattern fix: all three detection patterns miss common forms

**What is wrong.** The session ran the current patterns in Node:
- **react-query** misses `import('react-query')`, `import 'react-query'` and `from 'react-query/devtools'`.
- **formatISO** misses `moment(new Date()).formatISO(` and `moment.utc(x).formatISO(`.
- **axios** misses a configuration object spread over several lines, and falsely matches `{somebody:1}`.

The research note's axios replacement was run and works on those three inputs. I extend it to catch a quoted `"body"` key. The react-query and formatISO patterns below are mine and have not been run.

**Evidence.** `s4-agent-round2-session-runs.md`, "The three regular-expression patterns"; research rows A15–A17.

**Decision:** `change`. This corrects round-1 finding f-s4-agent-r1-11. The session runs all three against the inputs under "Runs the session must do before applying" before they are applied.

**Proposed change 4a**

old:
~~~text
/(from|require\()\s*['"]react-query['"]/,
~~~

new:
~~~text
/(?:\bfrom|\brequire\s*\(|\bimport\s*\(?)\s*['"]react-query(?:\/[^'"]*)?['"]/,
~~~

**Proposed change 4b**

old:
~~~text
/\bmoment(\([^)]*\))?\.formatISO\(/,
~~~

new:
~~~text
/\bmoment\b[^;\n]*\.formatISO\(/,
~~~

**Proposed change 4c**

old:
~~~text
/axios\.get\(.*body:/,
~~~

new:
~~~text
/axios\.get\([^)]*\bbody['"]?\s*:/,
~~~

### Finding 5 — medium — new: Rust has no rule mapping a crate name to its package name

**What is wrong.** The file maps Python import names to distribution names, but has no equivalent for Rust. The Rust Reference says Cargo "will transparently replace `-` with `_`", and "The `as` clause can be used to bind the imported crate to a different name." So the crate name in a `use` path is not always the package name to query.

This change also carries the peer-reviewed citation for the "8.7%" sentence on the same line (finding 7).

**Evidence.** Research row A14, citing https://doc.rust-lang.org/reference/items/extern-crates.html (read 2026-09-30). The venue and pages are from research B4.

**Decision:** `change`

**Proposed change 5**

old:
~~~text
- Query the registry of the ecosystem the code is written in. An answer from another registry proves nothing: "8.7% (6,705/76,489) of hallucinated Python packages are valid JavaScript packages." (https://arxiv.org/html/2406.10279, read 2026-09-30).
~~~

new:
~~~text
- Rust: the crate name in a `use` path is not always the package name. Cargo "will transparently replace `-` with `_`", and an `extern crate` declaration can rename a crate: "The `as` clause can be used to bind the imported crate to a different name." (https://doc.rust-lang.org/reference/items/extern-crates.html, read 2026-09-30). Take the package name from the `Cargo.toml` entry that provides the crate; when none does, query the name in the `use` path and report the answer as being about that name only.
- Query the registry of the ecosystem the code is written in. An answer from another registry proves nothing: "8.7% (6,705/76,489) of hallucinated Python packages are valid JavaScript packages." (Spracklen and colleagues, USENIX Security 2025, page 3697, https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen; preprint https://arxiv.org/html/2406.10279; both read 2026-09-30).
~~~

### Finding 6 — medium — resolves a round-1 carried item, plus new material: the look-alike check's thresholds have no source, and two confusion classes are unnamed

**What is wrong**
- **Unsourced degree words.** "Registered much later, or downloaded far less" (lines 230 and 303) has no source. The research found none in any standard or agency it read (B1e).
- **What OpenSSF does say.** Its guide gives the comparison without a threshold: "Check its creation time and popularity." and "Check if a similar name is more popular - that could indicate a typosquatting attack."
- **Two confusion classes unnamed.** The peer-reviewed paper groups package confusion into "typosquatting, combosquatting, brandjacking, and similarity attacks" (USENIX page 3688). The file names none of these, so it reads as if only misspellings matter.

**What changes.** The words "much" and "far" are dropped. The comparison is stated as OpenSSF states it. The agent is told to quote both answers, never to describe the gap in degree words.

**Evidence.** Research B1(d), B1(e) and B3; https://best.openssf.org/Concise-Guide-for-Evaluating-Open-Source-Software (read 2026-09-30).

**Decision:** `change`. Changes 6a–6c. Change 6a also carries the 13.4% citation (finding 7).

**Proposed change 6a**

old:
~~~text
"Only 13.4% … have a Levenshtein distance of 1 or 2" (https://arxiv.org/html/2406.10279, read 2026-09-30). The check reads only what the recipes print:
~~~

new:
~~~text
"13.4% (10,263 of 76,489) have a Levenshtein distance of 1 or 2" (Spracklen and colleagues, USENIX Security 2025, page 3697, https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen; preprint https://arxiv.org/html/2406.10279; both read 2026-09-30). The same paper groups package confusion into "typosquatting, combosquatting, brandjacking, and similarity attacks" (USENIX version, page 3688): run the check on a name of any of these kinds, not only a misspelling. The check follows the Open Source Security Foundation's guide to evaluating open source software: "Check its creation time and popularity." and "Check if a similar name is more popular - that could indicate a typosquatting attack." (https://best.openssf.org/Concise-Guide-for-Evaluating-Open-Source-Software, read 2026-09-30). It reads only what the recipes print:
~~~

**Proposed change 6b**

old:
~~~text
A name registered much later, or downloaded far less, than that package is reported as `suspected_lookalike`, with both answers quoted, confidence LOW, and the canonical dependency as the suggestion.
~~~

new:
~~~text
A name downloaded less than that package, or registered later than it, is reported as `suspected_lookalike`, with both answers quoted, confidence LOW, and the canonical dependency as the suggestion. No source read for this file gives a threshold for either comparison, so quote both answers and never describe the gap with words such as "much" or "far".
~~~

**Proposed change 6c**

old:
~~~text
| `suspected_lookalike`: registered much later, or downloaded far less, than the well-known package | high |
~~~

new:
~~~text
| `suspected_lookalike`: downloaded less, or registered later, than the well-known package it was likely mistaken for | high |
~~~

### Finding 7 — medium — new: the attack is cited only to preprints and a vendor blog

**What is wrong**
- **Peer-reviewed version.** Every Spracklen sentence the file quotes is in the peer-reviewed USENIX Security 2025 text: pages 3687–3688, 3692, 3695 and 3697.
- **Standards bodies.** Two describe the attack:
  - OWASP LLM09:2025, Attack Scenario 1;
  - the OpenSSF guide for artificial-intelligence code assistants, which also names the term "slopsquatting".
- **A sentence the file lacks.** The published paper also states the reason existence alone proves nothing: "Trivial cross-referencing methods … are ineffective…" (page 3688).
- **The 13.4% quotation.** The published text lower-cases "only". Change 6a quotes the substring both versions share, so it no longer depends on the capital letter.

**Evidence.** Research B2 and B4.

**Decision:** `change`. Changes 7a and 7b here; also carried by changes 5 and 6a.

**Proposed change 7a** (line 125)

old:
~~~text
code snippet alone." (Spracklen and colleagues, https://arxiv.org/html/2406.10279, read 2026-09-30).
~~~

new:
~~~text
code snippet alone." (Spracklen and colleagues, https://arxiv.org/html/2406.10279; the second sentence is also in the peer-reviewed version, USENIX Security 2025, page 3692, https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen; both read 2026-09-30).
~~~

**Proposed change 7b** (line 222)

old:
~~~text
and found that "43% of hallucinated packages were repeated in all 10 queries" (https://arxiv.org/html/2406.10279, read 2026-09-30).
~~~

new:
~~~text
and found that "43% of hallucinated packages were repeated in all 10 queries" (USENIX Security 2025, pages 3687–3688 and 3695, https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen; preprint https://arxiv.org/html/2406.10279; both read 2026-09-30). The published version adds: "Trivial cross-referencing methods (i.e., comparing a generated package name with a list of known packages) are ineffective for detecting a package hallucination attack, as an adversary may already have published the hallucinated package with malicious code." (page 3688). The Open Worldwide Application Security Project describes the same attack as Attack Scenario 1 of entry LLM09:2025, "Misinformation", in its 2025 list of risks for large language model applications: "Attackers experiment with popular coding assistants to find commonly hallucinated package names. Once they identify these frequently suggested but nonexistent libraries, they publish malicious packages with those names to widely used repositories." (https://genai.owasp.org/llmrisk/llm092025-misinformation/, read 2026-09-30). The Open Source Security Foundation's "Security-Focused Guide for AI Code Assistant Instructions" names it: "A new class of supply chain attacks named 'slopsquatting' has emerged...threat actors could create malicious packages on indexes like PyPI and npm named after ones commonly made up by AI models." (https://best.openssf.org/Security-Focused-Guide-for-AI-Code-Assistant-Instructions.html, read 2026-09-30).
~~~

### Finding 8 — low — new: the character-check prose says "letters" with no bound

**What is wrong.** "It starts with a letter or a digit, and it contains only letters, digits…" does not say which letters. The recipes mean unaccented Latin letters only, and the packaging specification says "A valid name consists only of ASCII letters and numbers, period, underscore and hyphen."

The paragraph also needs to explain why the recipes spell the set out (finding 3), and to carry the rule on Python names that end in punctuation (finding 9).

**Evidence.** Research rows A1, A2 and A12.

**Decision:** `change`. Changes 8a and 8b, two separate substrings of line 135.

**Proposed change 8a**

old:
~~~text
it starts with a letter or a digit, and it contains only letters, digits, `.`, `_` and `-`.
~~~

new:
~~~text
it starts with an unaccented Latin letter (A to Z or a to z) or a digit (0 to 9), and it contains only such letters, digits, `.`, `_` and `-` — what the packaging specification calls "ASCII letters and numbers, period, underscore and hyphen" (https://packaging.python.org/en/latest/specifications/name-normalization/, read 2026-09-30).
~~~

**Proposed change 8b**

old:
~~~text
and a name that passes it can still be one a registry would refuse.
~~~

new:
~~~text
and a name that passes it can still be one a registry would refuse. A Python distribution name must also end with a letter or a digit — the packaging specification says a valid name "must start and end with a letter or number" (same address, read 2026-09-30) — so the PyPI recipe records a name ending in `.`, `_` or `-` as "not a valid distribution name under the packaging specification": record it under `self_assessment.unknowns` with those words, never query it, and never report it as invented. The recipes spell the allowed characters out one by one rather than writing ranges such as `A-Z`, because the Portable Operating System Interface (POSIX) standard leaves a range's meaning unspecified outside its POSIX locale: "In other locales, a range expression has unspecified behavior: strictly conforming applications shall not rely on whether the range expression is valid." (https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap09.html, section 9.3.5, read 2026-09-30).
~~~

### Finding 9 — low — new: the PyPI recipe accepts names that cannot be valid distribution names

**What is wrong.** A name ending in `.`, `_` or `-` passes the PyPI recipe's check. Under the packaging specification such a name is invalid: "It must start and end with a letter or number."

**Evidence.** Research row A12.

**Decision:** `change`. Carried by change 3c (its second line) and change 8b.

### Finding 10 — low — new: nobody is named for a malicious or compromised package

**What is wrong.**
- ENISA's draft advisory lists newly inserted malicious packages (section 3.2.1) and compromised legitimate packages (section 3.2.2) as threats in their own right.
- This agent judges names and interfaces. It never judges what a package's code does.
- The ownership list names neither threat. Dependency-auditor's description does not claim either one, so the honest owner is "no owning agent named here".

**Evidence.** Research B3; https://www.enisa.europa.eu/sites/default/files/2025-12/ENISA%20Technical%20Advisory%20-%20Package_Managers_v_0.8_draft.pdf (version 0.8, a draft for public consultation, read 2026-09-30). The section titles are paraphrased, not quoted; `agents/security/dependency-auditor.md` line 3.

**Decision:** `change`

**Proposed change 10**

old:
~~~text
Anything you notice that no line above names: record it with the words "no owning agent named here", so CTO Chief sees the gap.
~~~

new:
~~~text
Anything you notice that no line above names: record it with the words "no owning agent named here", so CTO Chief sees the gap. That includes any sign that a registered package's own code is malicious, or that a legitimate package was compromised. This agent judges names and interfaces, not what a package's code does, and the European Union Agency for Cybersecurity's draft technical advisory on package managers treats both as threats in their own right: newly inserted malicious packages in section 3.2.1, and compromised legitimate packages in section 3.2.2 (https://www.enisa.europa.eu/sites/default/files/2025-12/ENISA%20Technical%20Advisory%20-%20Package_Managers_v_0.8_draft.pdf, version 0.8, draft for public consultation, read 2026-09-30).
~~~

### Finding 11 — low — correction of an incomplete round-1 fix: the "four failure classes" definition still contradicts the one above it

**What is wrong.** Round 1 widened the definition of an invented name on line 91 to include a name first registered after the training cutoff. The definition of the fabricated class on line 93 still says only "(the registry of its ecosystem has no such name when you check)".

**Evidence.** Agent lines 91 and 93; round 1, validator A, "Change 4 contradicts change 9".

**Decision:** `change`

**Proposed change 11**

old:
~~~text
a *fabricated* package (the registry of its ecosystem has no such name when you check)
~~~

new:
~~~text
a *fabricated* package (the registry of its ecosystem has no such name when you check, or, when the dispatch states the model's training cutoff, the name was first registered after that cutoff)
~~~

### Finding 12 — low — new: an empty `case` item in the npm recipe

**What is wrong.** Line 141 contains `(pattern) ;;`, an item with no command.
- The POSIX format line the research read shows a command list there without brackets, which suggests one is required. The formal grammar was not fetched (research row A6).
- Bash and zsh accepted the empty item: round 1's live run passed valid names through that line in both shells.

**Decision:** `change`, carried by change 3a. Using `: ;;` gives the item a command that does nothing, which removes the question for any shell at no cost.

### Finding 13 — low — new: the `readFileSync` sentence points at a moving branch

**What is wrong.** "On the main branch of Node.js's `lib/fs.js`" will drift. The research saw a new branch at the top of the function (`h.readFileSync(path, options)` when `vfsState.handlers` is set) that round 1 never saw. No commit was recorded, so it cannot be pinned.

**Decision:** `change`. The sentence is bounded to the day it was read.

**Evidence.** Research C4.

**Proposed change 13**

old:
~~~text
Not a `readFileSync` option: on the main branch of Node.js's `lib/fs.js`, the body of `readFileSync` reads
~~~

new:
~~~text
Not a `readFileSync` option: on the main branch of Node.js's `lib/fs.js` — a branch that keeps changing, and no commit was recorded, so this holds for the code as read on 2026-09-30 — the body of `readFileSync` reads
~~~

### Finding 14 — low — new: the FastAPI example is not a complete Python statement

**What is wrong.** Line 113 is a decorator with no function after it (research row A20). The Python grammar was not fetched. The session parses both versions before applying.

**Decision:** `change`

**Proposed change 14**

old:
~~~text
@app.get("/", auto_validate=True)  # No such parameter
~~~

new:
~~~text
@app.get("/", auto_validate=True)  # No such parameter
def read_root():
    return {}
~~~

### Finding 15 — carry to round 3: provenance, Trusted Publishing and signature checks

**What the standards recommend.** Five sources recommend checking a package's provenance or signature:
- ENISA section 4.1.1: "prefer packages published through secure workflows such as Trusted Publishing, which provide provenance metadata";
- ENISA section 4.1.2: "Verify the package's provenance";
- OWASP Top 10:2025, A03: "Prefer signed packages";
- NIST SP 800-218, PW.4.4, example 6: "Confirm the integrity of software components through digital signatures";
- SLSA version 1.1.

**Why it is not a change.** No note validated the registry field or interface that carries provenance. The skill names `dist.attestations` and PyPI's Integrity interface (skill lines 226–230), but neither was checked. A check the recipes cannot run would be an order the agent cannot carry out.

**Decision:** `carry-to-round-3`. Validate those two before adding a check.

### Finding 16 — for the human: dependency confusion cannot be settled without a private-registry recipe

**What is wrong.** Change 2 can only record a possible confusion. Settling it would mean querying the organisation's private registry, which needs credentials and a scope this agent was never given.

**Decision:** `for-the-human`. Whether to give the agent such a recipe, and whether to give it credentials at all, is a decision about risk and scope.

### Checked in round 2 and correct, keep as they are

- **Static `moment.formatISO` (lines 101 and 283):** absent from moment's own declaration file. This closes the round-1 carried item.
- **The 13.4% denominator:** it is 76,489, per USENIX pages 3697 and 3697. This closes the round-1 carried item. The new quotation keeps "(10,263 of 76,489)", which describes itself.
- **The helpers `readFileSync` passes its options to, where read:** none reads `throwOnError`.
- **Shell constructs (rows A3, A4, A5, A7–A11):** the `!` negation, the `-` placed last, the optional `(` before a pattern, `/` in case patterns, `#`, `%%`, the exit status of a command substitution, and quoted `''` are all correct.
- **The YAML response template:** valid, checked by eye (row A19).
- **`node -e … "$body"` passing the file path as `process.argv[1]`:** settled by round 1's live run, which printed the parsed fields.

---

## Runs the session must do before applying

1. **react-query, change 4a.**
   - Must match: `import x from 'react-query';`, `const q=require('react-query')`, `import('react-query')`, `import 'react-query'`, `from 'react-query/devtools'`, `require ( "react-query" )`.
   - Must not match: `from '@tanstack/react-query'`, `from 'react-query-devtools'`, `// react-query was renamed`.
2. **formatISO, change 4b.**
   - Must match: `moment(d).formatISO(`, `moment(new Date()).formatISO(`, `moment.utc(x).formatISO(`, `moment.formatISO(`.
   - Must not match: `dateFns.formatISO(`, `formatISO(d)`, `momentum.formatISO(`, `moment(d); formatISO(x)`.
3. **axios, change 4c.**
   - Must match: `axios.get(u,{body:d})`, `axios.get(u,{\n body: d\n})`, `axios.get(u, { "body": d })`.
   - Must not match: `axios.get(u,{somebody:1})`, `axios.post(u,{body:d})`, `axios.get(u,{params:{q:1}})`.
4. **The three recipes after changes 3a–3d, in bash and zsh.**
   - Rerun round 1's name set.
   - Add `abc`, `é`, `ab é`, `requests-`, `requests_`, `Friendly.Bard`, and a valid scoped name, which exercises the `: ;;` item.
5. **The Python example, change 14.** Parse lines 109–114 before and after the change with `python3 -c 'import ast,sys; ast.parse(sys.stdin.read())'`.

## Claims still carried to round 3

- **Provenance, Trusted Publishing and signatures:** the registry fields (`dist.attestations`, PyPI's Integrity interface) were not validated (finding 15).
- **The maintainer account and repository link** that ENISA and OpenSSF recommend checking: the npm field names were not validated.
- **TanStack Query version 5's own `throwOnError` reference entry:** all three addresses failed.
- **Maven Central:** whether every artifact publishes `maven-metadata.xml` is unsettled, so a 404 there stays MEDIUM confidence.
- **Node.js `readFileSync`:** `tryGetReadFileBuffer` and the `vfsState` handler branch were not read.
- **Line 283:** whether `moment().toISOString()` gives the same string as date-fns `formatISO` in every time zone.
- **The shell environment:**
  - whether assigning `LC_ALL` inside a running shell changes its pattern matching;
  - which shell and locale the Bash tool uses on other platforms.
- **The ECMAScript regular-expression specification:** not retrieved. The patterns rest on the session's runs.
- **Cargo renaming:** `package =` renaming in `Cargo.toml`, and whether crates.io matches an underscore query to a hyphenated crate.
- **npm:** the downloads address for scoped names.
- **Recipes for NuGet and the Go module proxy.**
- **Line 285:** the 2019 edition text for `flatMap`.
- **Publication venues:** for Krishna and colleagues, and for Twist and colleagues.
- **CISA guidance.**
- **ENISA pages 5–12.**
- **Structure:**
  - line 278, the axios key sitting in the package-name table;
  - line 285, a polyfill that may be over-engineering rather than a hallucination.

## For the human

- **Shell safety for untrusted package names.** It rests on an instruction the agent follows, not on enforcement; enforcing it with a hook is your decision on risk. Already with you, from round 1.
- **The dispatch phrase "AI code review"** is shared with ai-code-quality-reviewer. Already with you.
- **Look-alike and typosquat detection overlaps with dependency-auditor**, whose description still claims typosquats. Already with you.
- **CTO Chief's condition for dispatching this agent** ("IF the implementation generated artificial-intelligence outputs", `agents/coordinator/cto-chief.md` line 528) reads as a product that produces model output, not code an assistant wrote. Already with you.
- **`tokens_used: null` breaks the dispatch schema's integer rule.** Whether the schema allows `null` is the schema owner's decision. Already with you.
- **The installed critic has no web tools.** Already with you.
- **New:** whether this agent should get a private-registry recipe, and credentials, to settle dependency confusion (finding 16).

## Cross-file findings for the skill's rounds

- **Line 84:** "`email-validator-pro` … npm: not found" is refuted. From round 1, unchanged.
- **Line 46:** `npm view` returning a non-empty result is refuted as an existence test. From round 1.
- **Line 44:** "within hours" has no source. From round 1.
- **Unsafe commands:** lines 119, 246–247 and 252–255 run the package; lines 138 and 280–281 install it; lines 154 and 175 download it. From round 1.
- **Lines 376–436 describe the refinement loop in the present tense.** Fence that text rather than delete it: `tests/critic-warnings-are-critical.test.js` requires its strings. From round 1.
- **New — Rust, lines 51, 183 and 193:** the skill queries `cargo search` with the name from the `use` path. The Rust Reference rule about `-` and `_` (finding 5) applies there too.
- **New — the skill cites Spracklen by venue** ("USENIX Security 2025") but gives no page numbers. They are 3687–3697 (research B4).
- **New — dependency confusion answering 200 (finding 2)** and **the four confusion classes (finding 6)** are missing from the skill too.
- **New — provenance:** the skill's recipes (`npm view … | jq '.dist.attestations'`, PyPI's Integrity interface) were never validated. Validating them is what would let this file add a provenance check.
- **New — skill lines 226–240:** any bracket ranges or name rules the skill adds must follow findings 1, 3 and 8.

## Scores for the file as it stands (round-1 result), weighted as a review agent

| Dimension | Score | Why |
|---|---|---|
| Specificity | 7 | Concrete recipes, patterns and rules. But "much later / far less" is vague, and three patterns miss common forms. |
| Completeness | 7 | Broad coverage. Missing: dependency confusion answering 200, the Rust crate-name rule, provenance, recipes for NuGet and Go, and the named confusion classes. |
| Boundaries | 8 | An explicit hand-on list with a catch-all phrase. Malicious or compromised packages are unnamed; one overlap is with you. |
| Actionability | 8 | A protocol schema with a suggestion per finding, and exact recipes. |
| Integration | 7 | The protocol schema is complete apart from the `tokens_used: null` schema conflict, which is with you. |
| Robustness | 7 | Handles no network, unreadable answers and untrusted text, and states the single-quote limit. But the recipes rely on locale-dependent ranges, and names that cannot be valid Python distributions are queried. |
| Calibration | 6 | Explicit severity and confidence tables. But the look-alike thresholds have no source, and one rule is wrong (Python normalisation). |
| Research grounding | 8 | Nearly every statement is cited and dated. But the Spracklen citations are preprint-only, and there are no standards-body sources for the attack. |
| **Overall** | **7.2** | Weights: specificity 1.75, completeness 1.5, boundaries 1, actionability 1.25, integration 1, robustness 0.75, calibration 1.25, research grounding 1. Verdict: REFINE. |

**Weakest dimension: calibration.** Change 6 removes the unsourced degree words. That leaves the look-alike check honest about having no threshold, but still without one; no source read in either round supplies it.