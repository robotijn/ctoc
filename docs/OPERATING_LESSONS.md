# CTOC operating lessons — the full text

This text was moved word for word out of this repository's `CLAUDE.md` on 2026-10-06, so that `CLAUDE.md` stays small. The lessons block in `CLAUDE.md` and in every user project (source: `.ctoc/templates/operating-lessons.md`) carries the tightened rules; this file keeps each lesson's full wording, origin and mechanism. Read it for the reasons behind an operating lesson.


1. **The measure is the human.** "Working" means a person can open it, act, and
   get a fast, legible response. Green tests, a finished job, or a running engine
   are not "working" if the human sees nothing happen. Grinding with no feedback
   is broken.
2. **Never route around CTOC or self-cross its gates.** The four human gates
   belong to the human. No auto-approval, no skipping the pipeline — rot
   accumulates exactly where the pipeline is bypassed.
3. **Always implement via the Iron Loop** (TDD-Red → implement → verify →
   review). No ad-hoc edits to plan-covered files.
4. **Use CTOC's own agents** for pipeline work; never substitute a generic or
   ad-hoc agent. If CTOC looks unavailable, stop and surface the blocker.
5. **Honesty is the mechanism.** Report reality plainly; never hide behind
   "technically it ran." Show the real data/output; do not point at a file in
   place of showing it.
6. **Test the human's behavior, not the structure.** Drive the real end-to-end
   flow (act → it responds in reasonable time → it does the thing); snapshot or
   render-only tests are false green.
7. **No-stub rule.** On ambiguity, make a documented reasonable choice and
   continue with working code; record it under
   `## Decisions Taken Under Ambiguity`. Never leave stubs or TODOs.
8. **Async-overnight.** Do not synchronously block on ambiguity; document the
   choice, continue, and let review/kickback catch wrong calls.
9. **Warnings are bugs.** Deprecations, compiler/linter warnings, and
   vulnerabilities of any severity are critical — fix them now.
10. **Menu discipline — just show it.** Present a menu or selection immediately;
    do not deliberate at the human before showing it.
11. **Pre-todo is context; todo+ is execution.** Lock all context before code; if
    the implementer would have to guess, kick back upstream.
12. **Cross-platform always.** `path.join`, `fs.promises`, `os.homedir`,
    `process.platform`; never a shell script as an entry point.
13. **Talk to a human like a human, not like an artificial intelligence.** Write
    in plain words and complete sentences. Never invent an abbreviation, label,
    code, or piece of shorthand — the reader cannot decode notation you made up,
    so name every thing by what it actually is. Do not lean on common acronyms
    either; spell every term out in full (write "test-driven development", not the
    three-letter short form; "user interface", not the two-letter one; "continuous
    integration", not the two-letter one). Refer to each item by its real,
    spelled-out subject, never by an internal code.
14. **Fix the failures, not the tests.** When a test fails, the default is that
    the code is wrong — fix the code first. Changing the test is the last resort,
    allowed only when the test itself is plain wrong (it asserts a bug, a cosmetic
    non-behavior, or a contract the human has explicitly replaced) — and then the
    change must tighten the test toward the real behavior, never loosen it to make
    red go green. Weakening an assertion, widening a range, deleting a case, or
    whitelisting without a justified reason is green-washing, not fixing.
15. **Ask before you build — an unanswered question is a red flag.** Making
    software is a collaboration between the human and the model: build enough
    context by asking BEFORE building so that no guessing is required. A model
    guessing produces plausible-but-wrong outcomes exactly as surely as a human
    deciding carelessly does. When context is missing, the correct output is a
    question, not a guess dressed up as a decision.
16. **A module is not done when its test passes — it is done when a human can
    reach it.** A test is a caller, so "module + its own test" proves nothing
    about being wired into the product. Every new module must be reachable from
    a live entry point in the same unit of work that creates it; deferring the
    wiring to "a follow-up" is an unasked question and produces well-tested dead
    code. Enforce this with a reachability gate where one can exist.
17. **A foregone answer is not a question — presenting it as a choice is
    manipulation.** If you frame the obvious as one good option and one bad
    option, it is not a real choice and therefore not a conversation — you are
    steering the human while pretending to consult. If the answer is genuinely
    obvious, DO NOT ASK: act, and report what you did. Ask only when the fork is
    real. And separate the two kinds of decision: a **quality** decision has an
    objectively best answer, so recommend it honestly; an **owner** decision
    (what to schedule, what to build and when, how much cost or risk is
    acceptable, proceed-or-hold) belongs to the human, so present the options
    flat with symmetric pros and cons and manufacture NO recommendation. Never
    tilt an owner decision with a "(Recommended)" tag, a "risk" wrapped around
    the option you disfavor, or loaded pros and cons. The full format is in
    [`.ctoc/ask-me-questions.md`](../.ctoc/ask-me-questions.md).
18. **Say only what you verified; when you have no data, say you have none.**
    Asked where something stands, an agent with no data must say so — naming what
    it has not read is a complete answer. A fluent status line with an invented
    number, time or subsystem in it is a fabrication, and it reads exactly like a
    fact. Nothing in CTOC is scheduled against a wall clock, so no status line
    contains a time. Never name a subsystem as running without confirming it has a
    caller. This is an instruction, not a fence: no hook sees an agent's prose
    before the human does. `skills/agent-fragments/honest-status.md` carries it for
    every dispatchable agent; `src/lib/agent-honesty-scan.js` fences that the
    reference is present, never that a generation obeyed it.
19. **Never say a gate number to a human — say the moment.** "Gate 3" is an internal
    code; the owner never carries a numbered map of the pipeline and being handed one
    reads as evasive. In text a person reads — a report, an inbox notice, a question,
    a status line — say what the MOMENT IS in plain words ("built and waiting for your
    OK to call it done"), never the number. The number stays legal in code, comments,
    file formats, directory names, and the `--gate N` flag — audience is the test: a
    number a machine reads stays, a number a person reads goes. `src/lib/gate-words.js`
    is the phrasing; `skills/agent-fragments/plain-gate-words.md` carries the rule for
    agents; `src/lib/instruction-gate-words-scan.js` fences the instruction surfaces
    (wired as `instruction-gate-words-fence` in `iron-loop-enforcer.js`).

**Methodology reference:** CTOC runs a **16-step** Iron Loop across **4 human gates**
(Gate 0 vision→functional, Gate 1 functional→implementation, Gate 2
implementation→todo, Gate 3 review→done). Key step labels: **8:TEST** (TDD), **10:IMPLEMENT**
(one step, files as sub-items), **14:VERIFY** (quality gate: lint, typecheck, all
tests, coverage at or above the enforced floor — `.ctoc/coverage-baseline.json`
`minPct`, **99** today — that file is the single source of truth for the number,
ratchet-up only, and an unreadable baseline REFUSES rather than defaulting; 80 is
the aspirational default for a project with no baseline at all, and the new-code
target at review — 0
skipped, 0 flaky, run via `npm test`). CTOC ships exactly **3 slash commands** —
`/ctoc:start`, `/ctoc:push`, `/ctoc:update` — and is **always installed from the
marketplace**, never from a local path.
