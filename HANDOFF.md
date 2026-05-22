# Handoff — CTOC menu/command UX overhaul + README truth audit

<!-- Maintained by the `handoff` skill. Left by the previous Claude instance so
     the next one (claude or claudex) can continue. Treat as last-known state —
     verify against the repo before acting. -->

- Updated: 2026-05-22 10:59 by claude
- Branch: main
- Status: complete

## Goal
Fix CTOC's menu/command user experience and bring its docs back to truth.
The user found the dashboard menu broken (a dead-end on Vision), too many
confusing slash commands, and a stale README. All of that is now done,
released through v6.9.31–v6.9.37, and pushed to origin/main.

## Current status
- Done (all committed + pushed, HEAD = 2243d6c):
  - v6.9.31 — Business → Vision menu dead-end fixed; routes to Vision Mode.
  - v6.9.32 — slash commands trimmed to **menu / push / update** only;
    10 commands removed; init is auto-triggered when the menu opens an
    uninitialized project (`ensureInitialized` in src/commands/menu.js).
  - v6.9.33 — See + Edit merged into one **View/Edit** action on every plan menu.
  - v6.9.34 — full README truth audit, 16 stale/false claims corrected.
  - v6.9.35 — short Cross-Industry Skills section in README; CLAUDE.md
    enforcement mode `warn`→`soft` and b2b-sales-led `planned`→`ready`.
  - v6.9.36 — shipped `.ctoc/ask-me-questions.md` (matrix decision format)
    and wired it into the discussion phase (menu.md + CLAUDE.md rules 2 & 5).
  - v6.9.37 — `/ctoc:update` zsh unmatched-glob bug fixed (`ls -d` → `find`).
- In progress: nothing.
- Next: nothing — task complete. Plugin cache updated to v6.9.37.

## Key decisions
- Only 3 slash commands ever (menu, push, update) — the user found more
  confusing; everything else goes through the menu. See memory
  feedback_minimal_slash_commands.md. Guard: tests/readme-numbers.test.js
  pins the count at 3.
- `init` removed as a command; the menu auto-initializes instead.
- `.ctoc/ask-me-questions.md` placed OUTSIDE `skills/` deliberately — anything
  under skills/ is counted in the audited "421-file skill library", so putting
  it there would have forced a 421→422 churn. It still ships and is referenced
  by menu.md via `${CLAUDE_PLUGIN_ROOT}/.ctoc/ask-me-questions.md`.
- Review menu keeps its 3 gate transitions + View/Edit (no Create/Discuss) —
  the review screen is the human gate; dropping a kickback option to fit them
  would weaken it.

## Open questions / blockers
None. One non-code user action remains: the user must fully quit and restart
Claude Code so the running session reloads the 3-command surface (slash
commands load at startup; the live session still shows the old list). The
on-disk cache (v6.9.37) is verified correct.

## Gotchas
- zsh aborts a command at parse time on an unmatched glob ("no matches found")
  — before any `|| fallback` can fire. Use `find`, not `ls -d <glob> <glob>`.
- A slash command's `model:` frontmatter switches the LIVE session's model;
  never pin a model in src/commands/*.md (guard: slash-command-no-model-pin.test.js).
- Running src/commands/update.js from the repo reports "already up to date"
  because it reads the repo VERSION as current — run the cache copy
  (`~/.claude/plugins/cache/robotijn/ctoc/<ver>/src/commands/update.js`) to
  actually update the installed plugin.

## Key files
- src/lib/menu-screens.js — dashboard screens (stageBrowse, sectionBrowse,
  planActions, reviewActions); vision routing + View/Edit merge live here.
- src/commands/menu.js — menu entry point; `ensureInitialized` auto-init.
- src/commands/menu.md — claude: action table; discussion wired to ask-me-questions.
- .ctoc/ask-me-questions.md — canonical matrix decision-question format.
- CLAUDE.md — Menu System Rules 2 & 5 mandate the matrix format.
- README.md — truth-audited; counts verified accurate.
- tests/ — 1470 tests, all passing (`node --test tests/*.test.js`).

## Resume here
Nothing to resume — this task is complete. If the user reports old `/ctoc:*`
commands still showing, the fix is a full Claude Code restart (and, if they
persist, delete `~/.claude/plugins/cache/robotijn/` and
`~/.claude/plugins/marketplaces/robotijn/`, restart, reinstall). For any new
task, start fresh; delete this HANDOFF.md once it is no longer useful.
