---
title: "Expansion wave 4 — glob-aware projectTypeFor (Unreal/Arduino detection)"
type: implementation
parent_plan: ctoc-registry-expansion
depends_on: 00040-exp-w3-sca-runner
priority: MEDIUM
program: ctoc-registry-expansion
iron_loop: true
files:
  - "src/lib/capability-registry.js"
  - ".ctoc/capabilities/project-types/game.yaml"
  - ".ctoc/capabilities/project-types/embedded.yaml"
  - "tests/capability-project-types-2026.test.js"
---

# Wave 4 — make projectTypeFor glob-aware, so *.uproject and *.ino fire

Wave 2 flagged a real engine asymmetry: `detectLanguages` (capability-registry.js ~515)
is glob-aware (readdir + anchored ReDoS-safe regex), but `projectTypeFor` (~422-441)
matches EXACT filenames only. So Unreal (`*.uproject`) and Arduino (`*.ino`) were kept out
of game/embedded markers to avoid silent dead markers. Close the asymmetry.

## The engine change (src/lib/capability-registry.js, projectTypeFor ONLY)
In `projectTypeFor`'s marker loop, add glob handling IDENTICAL to `detectLanguages`: for a
marker containing `*`, readdir the project ROOT (fail-soft to []) and match filenames with
`safeRegExp('^' + escapeRegExp(marker).replace(/\\\*/g,'.*') + '$')` (anchored, ReDoS-safe,
NO raw RegExp); for a marker without `*`, keep the exact `existsSync` (which also matches a
directory like `ProjectSettings` — preserve that). Priority resolution UNCHANGED. Do NOT
touch detectLanguages or any other function.

## The data (now that globs fire)
- `game.yaml`: add `"*.uproject"` to detectionMarkers (Unreal). Keep project.godot,
  ProjectSettings. Update the header comment (the "globs would be dead" note is now stale).
- `embedded.yaml`: add `"*.ino"` to detectionMarkers (Arduino). Keep platformio.ini,
  west.yml, sdkconfig. Update the header comment.

## Over-detection check
`*.uproject` and `*.ino` are language/engine-specific extensions (no false-positive on a
common repo — unlike `*.yaml`). Verify: a plain web-frontend (vite.config.ts) still detects
web-frontend, NOT game/embedded.

## TDD-Red FIRST
Extend `tests/capability-project-types-2026.test.js` (real temp-dir fixtures): a repo with
`MyGame.uproject` → projectTypeFor is `game`; a repo with `sketch.ino` → `embedded`; a repo
with a directory named `ProjectSettings` still → `game` (exact-dir marker preserved); the
over-detection guard (vite.config.ts only → web-frontend). Run RED first (uproject/ino fail
before the engine change).

## VERIFY (Step 14) — paste verbatim
`node --test tests/capability-project-types-2026.test.js tests/capability-project-types.test.js
tests/capability-registry.test.js tests/capability-registry-top20.test.js tests/app-runner.test.js`
all green (app-runner consumes projectTypeFor via detectRunTarget — confirm no regression);
a hand-run: MyGame.uproject→game, sketch.ino→embedded, ProjectSettings-dir→game, vite-only→
web-frontend; the RCE-guard test stays green (glob regex is safeRegExp only); eslint clean;
NO git. Step 16: confirm the glob path is ReDoS-safe and detectLanguages is untouched.
