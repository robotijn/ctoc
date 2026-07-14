---
title: "Coverage climb wave 1 — vision dashboard tab behavior tests"
type: implementation
parent_plan: ctoc-coverage-climb
depends_on: none
priority: HIGH
program: ctoc-coverage-climb
iron_loop: true
files:
  - "tests/vision-tab-behavior.test.js"
---

# Coverage wave 1 — the vision tab (25.75% → target ~85%)

The coverage floor is 40; the repo measures 39.70% and has been under the floor
(pre-existing drift). The climb to 80 is a ratcheted campaign; wave 1 takes the
single biggest lever: `src/tabs/vision.js` — a LIVE dashboard tab (one of the 4 real
tabs: overview, vision, review, tools) with NO dedicated test file and 25.75% line
coverage (~370 uncovered lines of 501). Covering it well crosses 40 immediately.

## What to test — REAL human behavior, not structure
`src/tabs/vision.js` exports: `render`, `renderVisionList`, `getStatusIcon`,
`renderActions`, `handleKey`, `executeAction`, `readVisions`, `parseVisionMetadata`,
`getVisionCounts`, `createVision`. Write a NEW `tests/vision-tab-behavior.test.js`
(zero mocks of core logic; real temp-dir fixtures for the filesystem functions) that
drives the ACTUAL functions and asserts human-visible output / real effects:

- `readVisions(dir)` on a real temp dir containing vision `.md` files → returns the
  parsed vision objects; empty/missing dir → honest empty result (not a throw).
- `parseVisionMetadata(content)` on real vision-file content (with and without
  frontmatter, with each status value) → the exact parsed metadata; malformed content
  → a documented graceful result, not a crash.
- `getVisionCounts(projectPath)` on a temp project with N visions in known statuses →
  the correct counts per status.
- `createVision(title, projectPath)` → the file is actually created on disk with the
  expected frontmatter/title; verify by reading it back. Use a temp project.
- `render(app)` / `renderVisionList(visions, i)` / `renderActions(app, vision)` /
  `getStatusIcon(status)` → drive with representative `app` state objects and assert
  the rendered STRING contains the real, human-visible content (the vision titles, the
  status icons, the action labels) — assert on MEANING (a title appears, the selected
  row is marked), never on incidental markup. Cover the empty-list and no-selection
  branches (the big uncovered ranges 88-152, 268-342, 347-389, 394-490).
- `handleKey(key, app)` → drive the real navigation/selection keys and assert the
  resulting `app` state changes (index moves, action fires); cover `executeAction`
  branches. Do NOT assert a key does nothing without checking the real no-op state.

## Rules
- ZERO test doubles for core logic. Mock ONLY a genuine external dependency if one
  exists (vision.js looks pure + filesystem — use real temp dirs, mock nothing).
- Do NOT modify `src/tabs/vision.js`. If a function is UNtestable without a source
  change (a genuine testability defect), STOP and report it — do not fake a green.
- Every test has a meaningful assertion; no early-return-without-assert, no empty catch.
- Test error paths (missing dir, malformed content), not just happy paths.

## VERIFY (Step 14) — paste verbatim
- `node --test tests/vision-tab-behavior.test.js` → all pass, 0 skipped.
- `node --experimental-test-coverage --test tests/vision-tab-behavior.test.js` and
  report `src/tabs/vision.js` line % (target ~85%+, must be a large rise from 25.75%).
- `eslint tests/vision-tab-behavior.test.js` → exit 0.
- NO git; do not move the plan. Step 16: report vision.js before→after coverage and any
  function you could NOT reach (with the reason).
