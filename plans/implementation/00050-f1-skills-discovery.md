---
title: "F1 — Make 99 invisible skills discoverable: declare the skill category paths in plugin.json"
type: implementation
parent_plan: watcher-fleet-rebuild
depends_on: none
priority: CRITICAL
program: watcher-fleet-rebuild
iron_loop: true
files:
  - ".claude-plugin/plugin.json"
  - "tests/plugin-skill-discovery.test.js"
---

# F1 — 99 of CTOC's 100 skills are not registered with Claude Code

## The defect, measured

An empirical probe of the installed plugin (`claude -p`, asking it to enumerate
its own available skills in the `ctoc` namespace) returns **three**:

```
{"ctoc_skills_visible": true,
 "sample_names": ["ctoc:menu", "ctoc:push", "ctoc:ask-me-questions"],
 "total_ctoc_skills": 3}
```

`ctoc:menu` and `ctoc:push` are slash commands, declared by
`"commands": "./src/commands/"`. **One skill is registered.** It is
`skills/ask-me-questions/SKILL.md` — the only SKILL.md at depth 1.

```
skill directory depth                     count   registered?
skills/<name>/SKILL.md                        1   YES  (ask-me-questions)
skills/<cat>/<name>/SKILL.md                 90   NO
skills/<cat>/<sub>/<name>/SKILL.md            9   NO
```

The correlation is exact: the only depth-1 skill is the only visible skill.

**Root cause.** Plugin *agents* are scanned recursively — the plugin reference
says so, and `ctoc:testing:runners:e2e-test-runner` proves it. Plugin *skills*
are not: the reference specifies `skills/<name>/SKILL.md`, one level. CTOC's
`plugin.json` declares only `"commands"`, so the default `skills/` scan finds
exactly the one skill at the spec's depth and nothing below it.

This is why 102 of 128 agents copy skill bodies inline (`target_skill:` /
`extends_skill:` are inert YAML that nothing reads at runtime): the skill was not
reachable any other way. Fixing discovery is the precondition for the native
`skills:` frontmatter preload, and therefore for the entire one-page watcher.

`tests/cu5-wrapper-coverage-completeness.test.js:61` already documents the
depth-1 rule for `ask-me-questions` and calls it "always-available". It never
drew the inference that the other 99 are therefore invisible.

## The fix

`plugin.json` gains a `skills` array naming every directory that contains
`<name>/SKILL.md` subdirectories.

### The trap this plan exists to avoid (READ THIS BEFORE EDITING)

The plugin reference states, for the `skills` key:

> **Adds to the default**: `skills`. The default `skills/` directory is always
> scanned, and directories listed in `skills` are loaded alongside it.
> **Exception: for a marketplace entry whose `source` resolves to the marketplace
> root, declaring specific subdirectories replaces the default `skills/` scan.**

`.claude-plugin/marketplace.json` declares `"source": "./"` for the ctoc entry —
**the marketplace root**. CTOC therefore hits the exception: declaring
subdirectories **REPLACES** the default scan.

Consequence: if the array lists only the category directories, `./skills/` stops
being scanned and **`ask-me-questions` — the one skill that works today —
disappears.** `"./skills/"` MUST be listed explicitly as the first entry.

### The exact value

```json
"skills": [
  "./skills/",
  "./skills/ai-quality",
  "./skills/architecture",
  "./skills/compliance",
  "./skills/cost",
  "./skills/data-ml",
  "./skills/devex",
  "./skills/documentation",
  "./skills/frontend",
  "./skills/infrastructure",
  "./skills/legal",
  "./skills/mobile",
  "./skills/product",
  "./skills/quality",
  "./skills/realtime",
  "./skills/saas",
  "./skills/safety",
  "./skills/security",
  "./skills/specialized",
  "./skills/testing",
  "./skills/testing/runners",
  "./skills/testing/writers",
  "./skills/versioning"
]
```

23 entries: `./skills/` plus the 22 directories that contain `<name>/SKILL.md`
children. `./skills/testing` and its two subdirectories are all listed because
`testing/` holds both direct skill children and the `runners/` and `writers/`
containers. Paths must be relative to the plugin root and start with `./`.

Do NOT touch `"commands"`, `"name"`, `"version"`, or `"description"`.

### Wiring — the live call sites (MANDATORY)

There is no JavaScript call site: `plugin.json` is read by Claude Code itself at
plugin load. The wiring IS the manifest. Reachability is proven by the empirical
probe in Step 14, not by a require edge.

## Decisions Taken Under Ambiguity

1. **`./skills/` listed first rather than relying on the default scan.** The
   marketplace `source: "./"` exception makes the default scan conditional. Being
   explicit costs one array entry and removes the dependency on interpreting the
   exception correctly. If the exception does not apply, listing `./skills/`
   points at the default folder, which the reference explicitly says does not
   warn.
2. **Every category directory listed individually rather than a glob.** The
   reference states paths must start with `./` and be relative to the plugin
   root; it documents no glob support. A literal list is what the schema shows.
3. **No skill file is moved.** Flattening `skills/<cat>/<name>/` to
   `skills/<name>/` would also fix discovery, but it discards the category
   structure that 128 agents, the tests, and the docs all reference by path. The
   manifest declaration achieves the same registration with no path churn.

## Test Plan (TDD-Red first)

New file `tests/plugin-skill-discovery.test.js`. It is a **ratcheting fence**: it
walks the real `skills/` tree on disk and the real `plugin.json`, with zero
doubles. Adding a new skill category later fails this test until the category is
declared — which is the whole point.

Write these tests FIRST and watch each one fail against the current
`plugin.json` (which has no `skills` key at all):

1. `plugin.json declares a skills array` — currently ABSENT → red.
2. `every directory containing a <name>/SKILL.md child is declared` — set
   difference between the real tree and the manifest must be EMPTY, and the
   failure message must list every undeclared directory by name. Currently 22
   undeclared → red.
3. `./skills/ is declared explicitly (marketplace source is the root, so
   declaring subdirs REPLACES the default scan)` — assert the literal `"./skills/"`
   entry is present AND assert `marketplace.json`'s ctoc entry still has
   `"source": "./"`, so the test fails loudly if the premise ever changes rather
   than silently guarding nothing. Currently red.
4. `every declared path exists on disk and starts with ./` — no dead entries, no
   absolute paths, no `../` traversal.
5. `no two SKILL.md files declare the same frontmatter name` — skills flatten into
   one `ctoc:<name>` namespace, so a duplicate name would shadow. Measured today:
   zero collisions. This test keeps it that way.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/plugin-skill-discovery.test.js` with all five cases. Run it. Confirm cases 1, 2, 3 FAIL against the unmodified `plugin.json` and record the literal output. A test that passes before the fix is testing nothing — fix the test, not the plan.

### Step 9: PREPARE — read `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` in full. Re-derive the category list from disk with `find skills -name SKILL.md | sed 's|/[^/]*/SKILL.md$||' | sort -u` rather than trusting the list transcribed above.

### Step 10: IMPLEMENT — add the `skills` array to `.claude-plugin/plugin.json`. Preserve existing keys and formatting. `./skills/` first.

### Step 11: REVIEW — re-read the written `plugin.json`. Confirm valid JSON, 23 entries, `./skills/` present, `commands` untouched.

### Step 12: OPTIMIZE — n/a. A manifest array has no hot path.

### Step 13: SECURE — confirm no declared path escapes the plugin root (no `../`, no absolute paths). A skills path is a load instruction; traversal there would load files from outside the plugin.

### Step 14: VERIFY — two independent routes, both required:
  (a) `node --test tests/plugin-skill-discovery.test.js` → all five green.
  (b) **The empirical probe.** `plugin.json` is read by Claude Code at plugin
      load, so a green unit test proves only that the manifest is well-formed —
      NOT that a single skill actually registered. Re-run the probe that found
      the defect and require the count to move off 3:
      `claude -p 'Answer ONLY with JSON: {"total_ctoc_skills": <int>, "sample_names": [<up to 8 exact ctoc-namespace skill names>]}. Look at your available skills. Do NOT use any tools.' --output-format json`
      Expect ~100 skills, including at least `ctoc:threat-modeler` and
      `ctoc:code-reviewer`. **The plugin cache must be refreshed first** (the
      installed copy under the robotijn cache is what registers, not this working
      directory) — reinstall or reload the plugin before probing, and if the
      probe still reports 3, the fix has NOT landed regardless of test colour.
      Report the literal probe output either way.
  (c) `npm test` → the full gate. The 9 pre-existing failures are recorded in
      the handoff and are not this plan's; any NEW failure is.

### Step 15: DOCUMENT — update the skills count claim in `CLAUDE.md` only if the probe changes what is true. Do not restate the count from memory; state what the probe returned.

### Step 16: FINAL-REVIEW — report three things literally: the five test results, the probe's before (3) and after counts, and any skill that did NOT register with the reason. Do not report success on test colour alone — case (b) is the claim that matters.

## Executor Verification (Steps 8-16)

- [ ] Step 8 tests written and observed RED before any edit to `plugin.json`
- [ ] `./skills/` is the first array entry (the marketplace-root exception)
- [ ] `marketplace.json` untouched
- [ ] Probe re-run against a refreshed plugin cache; literal output reported
- [ ] Probe count moved off 3, or the failure reported plainly as a failure
