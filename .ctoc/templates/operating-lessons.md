<!-- Canonical CTOC operating-lessons source. Edit the lessons HERE; ensureLessonsBlock propagates them. -->

<!-- CTOC:LESSONS v1 START -->
<!-- Content between these markers is CTOC-managed. Do not edit manually. -->

## CTOC Operating Lessons

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

**Methodology reference:** CTOC runs a **16-step** Iron Loop across **4 human gates**
(Gate 0 vision→functional, Gate 1 functional→implementation, Gate 2
implementation→todo, Gate 3 review→done). Key step labels: **8:TEST** (TDD), **10:IMPLEMENT**
(one step, files as sub-items), **14:VERIFY** (quality gate: lint, typecheck, all
tests, coverage ≥ 80%, 0 skipped, 0 flaky). CTOC ships exactly **3 slash commands** —
`/ctoc:menu`, `/ctoc:push`, `/ctoc:update` — and is **always installed from the
marketplace**, never from a local path.

<!-- CTOC:LESSONS v1 END -->
