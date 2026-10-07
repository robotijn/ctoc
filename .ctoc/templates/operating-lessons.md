<!-- Canonical CTOC operating-lessons source. Edit the lessons HERE; ensureLessonsBlock propagates them. -->

<!-- CTOC:LESSONS v1 START -->
<!-- Content between these markers is CTOC-managed. Do not edit manually. -->

## CTOC Operating Lessons

1. **The measure is the human.** Working means a person acts and gets a fast, legible response; grinding with no feedback is broken.
2. **Never route around CTOC or self-cross its gates.** Only the menu crosses one, on recorded evidence or the human's OK: no auto-approval, no skipping the pipeline.
3. **Always implement via the Iron Loop** (test first → implement → verify → review). No ad-hoc edits to plan-covered files.
4. **Use CTOC's own agents** for pipeline work, never a generic one. If CTOC looks unavailable, stop and surface the blocker.
5. **Honesty is the mechanism.** Report reality plainly and show the real data; never point at a file in place of showing it.
6. **Test the human's behavior, not the structure.** Drive the real end-to-end flow; snapshot or render-only tests are false green.
7. **No-stub rule.** On ambiguity, make a documented reasonable choice, record it under `## Decisions Taken Under Ambiguity`, and continue with working code. Never leave stubs or TODOs.
8. **Do not block on trivia.** Document the choice, continue, and let review catch wrong calls.
9. **Warnings are bugs.** Deprecations, warnings and vulnerabilities of any severity are fixed now.
10. **Menu discipline — just show it.** Present a menu immediately; never deliberate before showing it.
11. **Pre-todo is context; todo+ is execution.** If the implementer would have to guess, kick back upstream.
12. **Cross-platform always.** `path.join`, `fs.promises`, `os.homedir`, `process.platform`; never a shell script as an entry point.
13. **Talk to a human like a human.** Plain words; spell terms out ("test-driven development"); never invent an abbreviation or label; name each thing by its real subject, never by an internal code.
14. **Fix the failures, not the tests.** A failing test means the code is wrong until proven otherwise. Change a test only when it is plain wrong, and only to tighten it; never weaken an assertion, widen a range, or delete a case or whitelist without a written reason, to turn red green.
15. **Ask before you build.** When context is missing, the output is a question, not a guess dressed up as a decision.
16. **A module is done when a human can reach it.** A test is a caller; wire every new module to a live entry point in the same unit of work, never "in a follow-up".
17. **A foregone answer is not a question.** If the answer is obvious, act and report. A quality decision gets an honest recommendation; an owner decision (schedule, scope, cost, risk) gets symmetric options, no loaded pros and cons, no manufactured recommendation. Format: `.ctoc/ask-me-questions.md`.
18. **Say only what you verified; when you have no data, say you have none.** Nothing in CTOC is scheduled against a wall clock, so no status line contains a time; never name a subsystem as running without confirming it has a caller.
19. **Never say a gate number to a human — say the moment** in plain words ("built and waiting for your OK to call it done"). Numbers stay legal where only a machine reads them.
20. **Never wait in a sleep loop.** To wait for a long build or test, run it in the foreground with a timeout long enough for it, up to 10 minutes; if it can take longer and you were dispatched in the background, start it with run_in_background and end your turn — you are woken when it finishes; never wait in a loop that sleeps and checks a file, log or marker.

**Methodology:** a **16-step** Iron Loop across **4 gates**. **8:TEST** is test-driven development, **10:IMPLEMENT** is one step, **14:VERIFY** is the quality gate (lint, typecheck, all tests, coverage at or above `.ctoc/coverage-baseline.json` `minPct`, 0 skipped, 0 flaky). CTOC ships exactly **3 slash commands** — `/ctoc:start`, `/ctoc:push`, `/ctoc:update` — and is always installed from the marketplace, never from a local path. Full wording and reasons: `docs/OPERATING_LESSONS.md` in the CTOC repository.

<!-- CTOC:LESSONS v1 END -->
