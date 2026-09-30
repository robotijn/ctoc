---
iron_loop_verdict: true
iron_loop: true
title: "The menu shows only the skills a human invokes: specialist skills stop registering as slash entries"
type: functional
status: functional
created: 2026-09-30
priority: medium
effort: medium
files:
  - .claude-plugin/plugin.json
  - tests/plugin-skill-discovery.test.js
  - tests/watcher-shape.test.js
  - tests/skill-loading.test.js
  - agents/ai-quality/citation-validator.md
  - agents/iron-loop/advocate-critic.md
  - agents/coordinator/cto-chief.md
  - .ctoc/templates/watcher.md
  - README.md
  - CLAUDE.md
  - tests/agent-and-skill-improvement-record.test.js
depends_on: none
approved_by: human
approved_at: 2026-09-30T14:25:24.848Z
gate_crossed: implementation → todo
---

# The menu shows only the skills a human invokes: specialist skills stop registering as slash entries

## 1. ASSESS — Problem Understanding

### Problem statement

The human's request of 2026-09-30, verbatim: "what did you do? there are now 100+ ctoc menu items! remove them I only want start, update, deepthink, ask-me-questions".

The cause is one file. `.claude-plugin/plugin.json` carries a `skills` array of 24 entries: `./skills/`, then 21 category folders, then `./skills/testing/runners` and `./skills/testing/writers` (read today). Claude Code registers every `<name>/SKILL.md` one level below each listed folder as a `/ctoc:<name>` entry, so every specialist skill body became a picker entry. The request brief states the array was added on 2026-07-17 in commit 669c51c3 (version 6.12.79); that commit was not re-read here, because this agent holds no shell. The reason for it is written in the docstring of `tests/plugin-skill-discovery.test.js`: without the array only the one depth-one skill registers, and the specialists were meant to be reachable by name. That test also makes the picker impossible to shrink, because it fails until every skill folder is declared.

Entries today: at most 101 skill bodies (1 at depth one, 91 at depth two, 9 at depth three, counted by the deepthink plan from disk) plus the 3 commands, so at most 104. One body read today, `skills/saas/workos-sso/SKILL.md`, declares `user-invocable: false`, which the Claude Code documentation (seen through a search summary, not fetched) says hides a skill from the slash menu; so the picker shows up to 103. Neither number was observed live.

### Who benefits

- The owner of a project with CTOC installed: a picker holding what a human types, not 100 agent methods.
- Any person who installs CTOC from the marketplace: the same picker, with the same short list.
- The pipeline is unchanged for the specialists: they are reached through their agents (see the routes below).

### Facts checked on disk today (2026-09-30)

- `src/commands/` holds `start`, `push` and `update`, each as a `.md` and a `.js` file (Glob). `skills/ask-me-questions/SKILL.md` is the only `skills/<name>/SKILL.md` at depth one (Glob). `skills/deepthink/` does not exist yet (Glob); the approved deepthink plan places it at depth one in its second slice.
- The tools line of every one of the 124 agent definitions was read (Glob in six partitions summing to 124): the first 12 to 20 lines of 117 files, and the whole of seven (`citation-validator`, `advocate-critic`, `ai-code-quality-reviewer`, `gdpr-agent`, `eu-ai-act-agent`, `clerk-auth`, `cto-chief`). **Exactly two hold `Skill`:** `agents/ai-quality/citation-validator.md` (`Read, Grep, Skill, WebSearch, WebFetch`) and `agents/iron-loop/advocate-critic.md` (`Read, Grep, Skill`). The shipped template `.ctoc/templates/watcher.md` also carries `tools: Read, Grep, Skill`.
- What each loads. `citation-validator`, in `## What I Borrow`: skills "invoked lazily through the `Skill` tool when a claim needs a domain lookup I do not carry — a standards catalogue, a legal citation format, a scientific index" — it names no skill. `advocate-critic`, same heading: a "security skill" when a credential appears and a "testing skill" when a mitigation rests on a test — it names neither — plus `skills/iron-loop/advocate-lens/SKILL.md`, "the reference copy … loadable that same way", and the sentence "`Skill` MUST stay in `tools:` above or this section is dead". The template says the same sentence and quotes the Claude Code reference. After this change the tool resolves only depth-one skills, so none of these three can deliver what its text promises.
- **The wrapper route is a file read, not registration.** 122 of 124 agents hold no `Skill`. The wrappers I read order a read of the skill file by a repository-relative path: `ai-code-quality-reviewer` ("Read `skills/ai-quality/ai-code-quality-reviewer/SKILL.md` in full"), `clerk-auth` and `gdpr-agent` (same shape). `dead-code-detector` carries its method inline in the lines I read (12 to 41). Counted by category from the agent heads, not by a program: 97 specialist skills are named by an agent's `target_skill` or `extends_skill`; `compliance/gdpr-compliance-checker` is named by a body path in `gdpr-agent`, which says "read that file in full"; `compliance/ai-governance-checker` is named by `extends_skill` in `eu-ai-act-agent`. **`saas/workos-sso` is named by no agent's frontmatter.** It is reached only by a "Skills you reuse" table row in `agents/saas/clerk-auth.md` and by a name (not a path) in CTO Chief's Step 10 list.
- `tests/cu5-wrapper-coverage-completeness.test.js` counts a skill as covered when any agent body contains its `skills/<category>/<name>` path. That cannot tell a citation from an order to read, so it does not prove a route.
- The unexecutable-instruction fence (`src/lib/unexecutable-instruction-scan.js`) only fires on a backticked token that starts with an identifier and a parenthesis. A `Skill` order is a bare word, so **the fence cannot see it**. It stays green whether or not an agent orders a `Skill` call that cannot resolve.
- `tests/watcher-shape.test.js` allows `Skill` in a watcher's tools ("the template's own `## What I Borrow` section REQUIRES the Skill tool") and checks the template against the same rules. `tests/citation-validator.test.js` pins no `Skill` and pins the `## What I Borrow` heading. `tests/skill-loading.test.js` never reads the manifest; its trigger corpus matches prompts against `when_to_load` phrases, and `docs/DISPATCH_PROTOCOL.md` names that corpus as the specialist isolation gate. `docs/AGENT_ARCHITECTURE.md`'s account of the wrapper coverage says agents reach the bodies and never says registration.
- `tests/readme-numbers.test.js` pins `countSlashCommandSpecs() === 3` and the README text `3 slash commands`; both stay true. `src/areas/library.js` counts files on disk, not registered skills. `src/commands/start.md` neither lists nor counts skills.
- README passages that depend on registration: Lesson 0 ("typing `/ctoc` offers three commands"); the blockquote above the Skills table ("reached through the skill auto-load mechanism below", naming `ai-governance-checker`, `workos-sso`, `gdpr-compliance-checker` — false already for the first and third, see above); the paragraph "How skills reach you after install", which names three paths, of which two (`when_to_load` phrases that "auto-load the skill", and "direct invocation through Claude Code's built-in `Skill` tool") end with this change.
- `agents/coordinator/cto-chief.md`: the paragraph "Skill-first, subagent-second routing rule" (matches `when_to_load` triggers and dispatches "the skill in-context"), the paragraph "Pre-load skills in the dispatch payload", and the "Spawning Agents" example with a `"skills": [...]` key. CTO Chief holds `Read, Grep, Glob, Task, Bash`, no `Skill`.
- Documents read in full with no registration claim: `docs/AGENT_ARCHITECTURE.md`, `DISPATCH_PROTOCOL.md`, `IRON_LOOP.md`, `REFINEMENT_LOOP.md`, `CONTINUOUS_IMPROVEMENT.md`, `CONFIG_SOURCES.md`, `SECURITY_LINT.md`, `REALTIME.md`, `REGULATORY_OPS.md`, `INDEPENDENCE.md`, `PROCESS_FMEA.md`, `CRITICAL_CONTROL_POINTS.md`, `CONTRIBUTING.md`, plus `.ctoc/templates/CLAUDE.md.template` and `agent-template.md`. Not read: `docs/CODE_OF_CONDUCT.md`.

### The routes to a specialist body, and which one this plan removes

| Route | Used by | After this plan |
|---|---|---|
| An agent reads the body from its file path | the wrappers, the agents with `extends_skill`, `gdpr-agent`, `eu-ai-act-agent`, `clerk-auth` | kept, unchanged |
| The session or an agent calls the `Skill` tool; a person types `/ctoc:<name>` | the session model's "skill-first" rule, the two agents above, people typing a specialist's name | removed for specialists; stays for depth-one skills |
| `when_to_load` phrases load a skill | the README's claim | not a route. The only reader of `when_to_load` found is `tests/skill-loading.test.js`; the documentation's own frontmatter fields for the menu are `description` and `when_to_use` (believed, from a search summary) |

## 2. ALIGN — Approach

The manifest's `skills` array becomes `["./skills/"]` and nothing else, so the picker offers the three commands plus every skill folder directly under `skills/`. No file under `skills/` is moved, renamed or deleted, so the counts the README pins do not change: 429 skill files, 101 bodies, 328 reference files, 124 agents. The deepthink plan moves them (to 430, 102, 328, 124) when its second slice lands; that is a fact about that plan, not an edit here.

### What changes

1. `.claude-plugin/plugin.json`: `skills` is exactly `["./skills/"]`. The release sync rewrites only version paths (`tests/release-metadata-sync.test.js`, `tests/version-syncplugin-path-fix.test.js`); that it preserves the other keys is believed, and the closing check reads the file after a release sync ran.
2. `tests/plugin-skill-discovery.test.js` is tightened to the new contract, never loosened. It keeps: the array exists, `./skills/` is first, every declared path exists and starts with `./`, no two `SKILL.md` share a name, the marketplace source premise. It replaces "every directory holding a `<name>/SKILL.md` child is declared" with "the array is exactly `./skills/`, nothing under a category is registered". It adds: every folder holding a `SKILL.md` directly under `skills/` is `ask-me-questions` or `deepthink` and its name equals its frontmatter name (so a specialist placed at depth one fails by name, and the test holds whichever of the two plans lands first); no agent definition and not the watcher template holds `Skill` in `tools:` or names the backticked tool in its body; the README names every depth-one skill on disk as `/ctoc:<name>`; `cto-chief.md` no longer contains `Skill-first, subagent-second` or `when_to_load` or `"skills": [` and does contain `skills/saas/workos-sso/SKILL.md`. Its assertion message that calls `ask-me-questions` "the only depth-1 skill" is corrected.
3. `tests/watcher-shape.test.js`: `Skill` leaves the allowed read-only tools, and the comment that says the template requires it is corrected. Its template check and its check of every conforming agent then force the next edit.
4. `.ctoc/templates/watcher.md`, `agents/ai-quality/citation-validator.md`, `agents/iron-loop/advocate-critic.md`: `Skill` leaves `tools:`; `## What I Borrow` (the heading stays, both tests pin it) says a borrowed method is read from its file by path, `skills/<category>/<name>/SKILL.md`, only when a finding needs it, and that no specialist skill is registered for a tool to load. `advocate-critic` keeps its sentence that every rule it obeys is in the file, and its mention of `skills/iron-loop/advocate-lens/SKILL.md` as the reference copy, now read by path. The template's sentence that `Skill` must stay in `tools:`, and the Claude Code sentence it quotes, are removed, because both contain the backticked tool name the new check forbids.
5. `agents/coordinator/cto-chief.md`: the "skill-first" paragraph becomes agent-first with the same economy: a small unit of work that a step list already names is done by reading `skills/<category>/<name>/SKILL.md` in context and applying it; the wrapper agent is dispatched through `Task` when the work spans several specialists or needs isolation. "Pre-load skills in the dispatch payload" becomes "name the skill file path in the dispatch payload". The "Spawning Agents" example drops the `"skills"` key. The Step 10 line for `saas/workos-sso` names its path and orders the read.
6. `tests/skill-loading.test.js`: assertions unchanged. Its header and describe names call the corpus "auto-load"; they are reworded to say the phrases are the trigger vocabulary each skill declares, not a registration.
7. `README.md`: Lesson 0 names `/ctoc:ask-me-questions` (and `/ctoc:deepthink` once its skill is on disk) beside the three commands; the blockquote above the Skills table and the "How skills reach you after install" paragraph say specialists are reached through the pipeline's agents, that `saas/workos-sso` has no agent of its own, and that only depth-one skills appear in the picker; the Commands section gets one sentence. The text `3 slash commands` stays.
8. `CLAUDE.md`: one sentence for contributors stating the manifest lists only `./skills/`, why (2026-07-17 registered every specialist), and which test holds it.

### Where the request brief and the disk differ

- **The brief says the unexecutable-instruction fence and its test must keep a `Skill` order from resolving to nothing.** The fence cannot see one (above). It stays green unchanged, with `.ctoc/unexecutable-instruction-baseline.json` byte-identical (`maxDebt` 15, exemptions empty), and it protects nothing here. The new exact-string check in the discovery test does. An exact presence or absence check is what a text check is for; reachability is not answered by it.
- **The brief says the deepthink plan and this plan do not conflict because this plan touches the manifest and tests.** For `skills/ask-me-questions/SKILL.md` and `skills/deepthink/` that holds. But the deepthink slices declare `README.md` and `CLAUDE.md`, and so does this plan.
- **The brief says the plan must show the wrapper path exists.** Shown: 97 skills by frontmatter key, one by a body path, and the dev-repository read by the tests. **Not shown: that a repository-relative read order resolves from a project that has CTOC installed.** Claude Code copies an installed plugin into a cache (documentation, seen through a search summary), so the path may not exist in the user's project. That is true today and not caused here, but this plan removes the session model's other route, so it now matters. Scenario 5 observes it.
- **The brief lists agents holding `Skill`.** Agrees: two agents, plus the template.
- **`saas/workos-sso` has no agent.** The brief did not say so. Decision 4 settles it.

### Sequencing facts (technical dependencies; the order is the human's)

- The deepthink plan's slices add `skills/deepthink/` and edit `skills/ask-me-questions/SKILL.md`; this plan edits neither. The acceptance check that `/ctoc:deepthink` appears can only hold after that plan's second slice (`00398-deepthink-ships-with-ctoc-s2-deepthink-skill-and-counts`) lands. The new discovery check allows deepthink at depth one and does not require it, so the order does not matter to the tests. The deepthink plan's first scenario and its out-of-scope line were written against today's manifest ("unchanged manifests"); after this plan lands they hold through the tightened test instead.
- Shared files: `README.md` (this plan; deepthink slice 2; the README rebuild slices `00388` to `00396`) and `CLAUDE.md` (this plan; deepthink slices 1 to 3). Builds that declare the same file never run at the same time. If the rebuild's reference slice lands first, this plan's README edits are made against the rewritten text; if this plan lands first, the rebuild's claim-checking slice reads them. The README pin for the depth-one names is in a test the rebuild does not own, so a rebuild that drops them fails loudly.
- Shared agent files: the improvement run has queued slices for `citation-validator` (`00375`), `cto-chief` (`00376`) and the gate lenses (`00370`, read by name only, not opened, so whether it covers `advocate-critic` is unconfirmed). An edit here changes the fingerprint an improvement round starts from; the record has a field for an unrecorded earlier edit. An improvement round that re-introduces `Skill` turns the tightened fence red.
- The scheduler serializes plans by declared files. I did not census the other queued plans; that is the scheduler's job when this plan is approved.

### Scope

#### In scope

- The ten paths in `files:`, and nothing else.
- Exact-string checks only for presence or absence of named strings; no check answers a reachability question by text.
- Evidence recorded from real dispatches for scenario 4, and an honest statement for what cannot be observed before shipping.

#### Out of scope (each states where it lives)

- Moving, renaming or deleting any skill body, and the improvement run's edits to skill bodies (the improvement plan and the deepthink plan).
- Adding an agent for `saas/workos-sso` (decision 4).
- Rewriting the wrapper agents' read orders to a plugin-root-relative form (decision 5; would touch about 100 agent files held by the improvement run).
- `.claude-plugin/plugin.json`'s stale `description` ("60 AI agents. 265 expert skills"): false against 124 and 429, pinned by no test I read, left alone as the deepthink plan leaves it; the human decides.
- Removing `push` (decision 1), changing the release script, any file under `src/`.
- Pushing: the human's act; this plan adds no push step.

### What was not verified

- The live picker, before or after: it can only be observed after the human ships and installs from the marketplace, never from a local path.
- That Claude Code registers exactly as described: sources are the request brief, the discovery test's docstring and documentation search summaries; nothing was observed.
- Whether a repository-relative read order resolves from an installed project (scenario 5).
- Whether a `Task` payload key `skills` injects anything. The frontmatter `skills:` preload was verified not to work on 2026-07-18 (comments in `tests/watcher-shape.test.js`); there is no evidence either way for the payload key, and this plan does not rely on it.
- The bodies of about 115 agents beyond their first 12 to 20 lines: the new exact-string check is the census, and an agent it names outside `files:` is a scope-growth question in the inbox, never a silent edit.
- Not read: `.ctoc/operations-registry.yaml`, `src/hooks/SessionStart.js`, `src/lib/ctoc-routing-reminder.js`, `src/lib/menu-screens.js`, `docs/CODE_OF_CONDUCT.md`, and most test files other than those named. The whole suite is the check for the rest; every red that names a registration, a `Skill` tool or the 24-entry array is a pin to tighten to the new truth, never to loosen.
- Docs that name commands which do not exist (found by reading, not edited here): `docs/PRODUCT_LOOP.md` lists `/ctoc:kpi-status`, `/ctoc:product-review`, `/ctoc:experiment-design` and the files `src/commands/product-review.md` and `kpi-status.md`; `docs/EVALUATION_HARNESS.md` ends with `src/commands/evals.md` and `/ctoc:evals`. `src/commands` holds three commands. `src/commands/start.md` ends with "three slash commands: `menu`, `push`, `update`"; the command is named `start`.

## 3. CAPTURE — Acceptance Criteria

### User stories

**As the** owner of a project with CTOC installed, **I want** the `/ctoc:` picker to offer only start, push, update, ask-me-questions and deepthink, **so that** I can find what I type without scrolling past 100 specialist methods.

**As the** owner, **I want** the pipeline to keep reading each specialist's method exactly as before, **so that** cleaning the picker does not silently drop a check.

**As the** maintainer of CTOC, **I want** a test that fails the moment a specialist is registered again, or an agent borrows through a tool that resolves nothing, **so that** the picker cannot grow back unseen.

### Scenarios

Each is a test or recorded output. Before the edits, the checks in 1, 6, 8 and 9 and the tightened watcher fence are run and seen failing for the right reason (24 entries; two agents and the template hold `Skill`; the README lacks `/ctoc:ask-me-questions`; the CTO Chief text is present). Scenario 2 and the unchanged checks are green before the edits, so they are guards, not red-first tests, and the record says so.

1. **The manifest is exact.** GIVEN the change, WHEN `tests/plugin-skill-discovery.test.js` runs, THEN it passes; and it fails when `skills` holds anything other than the single entry `./skills/`.
2. **Only depth-one skills register.** GIVEN `skills/`, WHEN the same test lists the folders holding a `SKILL.md` directly beneath `skills/`, THEN each is `ask-me-questions` or `deepthink`, `ask-me-questions` is present, each folder name equals its frontmatter `name`, and placing any specialist body at depth one fails by naming it.
3. **The picker after install** (observed after shipping). GIVEN the change is shipped and installed from the marketplace, WHEN a fresh session types `/ctoc:`, THEN it offers start, push, update, ask-me-questions and, after slice `00398` of the deepthink plan lands, deepthink, and offers no specialist (for example neither sast-scanner nor clerk-auth). Before shipping, scenarios 1 and 2 are the evidence and the report says the listing was not observed.
4. **Wrapper agents still read their skill body** (this repository). GIVEN this repository, WHEN the session dispatches `ai-code-quality-reviewer`, `clerk-auth`, `gdpr-agent` and `dead-code-detector` in turn on a small named input (the build executor holds no `Task` tool, so the session does this), THEN the transcript of each of the first three shows a read of its own skill file, and the fourth's transcript is recorded and the report says whether it read one. Untested wrappers are named as untested. `tests/skill-loading.test.js` passes with its assertions unchanged: every wrapper's `target_skill` resolves to an existing file.
5. **Resolution from an installed project** (observed after shipping). GIVEN CTOC installed from the marketplace in a project that has no `skills/` folder, WHEN a wrapper agent is dispatched, THEN the transcript shows whether its read of the repository-relative path succeeded. A failure is a finding returned upstream with the two options in decision 5, never worked around; before shipping the report says it was not observed.
6. **No agent borrows through a tool that resolves nothing.** GIVEN `agents/**/*.md` and `.ctoc/templates/watcher.md`, WHEN the discovery test walks them, THEN none holds `Skill` in `tools:` and none contains the backticked tool name in its body; and `tests/watcher-shape.test.js` no longer allows `Skill`, its template check passes, and every conforming agent passes.
7. **The fence is untouched.** WHEN `tests/unexecutable-instruction-fence.test.js` runs, THEN it passes and the baseline file is byte-identical.
8. **CTO Chief routes through agents.** GIVEN `agents/coordinator/cto-chief.md`, THEN it contains none of `Skill-first, subagent-second`, `when_to_load` or `"skills": [`, it contains `skills/saas/workos-sso/SKILL.md`, and `tests/cto-chief-toplevel.test.js` still passes.
9. **The README tells the truth.** GIVEN `README.md`, THEN it names each depth-one skill on disk as `/ctoc:<name>`, contains neither "direct invocation through Claude Code's built-in" nor "auto-load the skill when your conversation matches", still contains `3 slash commands`, and every derived pin in `tests/readme-numbers.test.js` passes with no edit to that test.
10. **Nothing moved.** GIVEN the build ends, THEN the changed paths are exactly those in `files:`; no path under `skills/` changed; no agent other than the three named changed; no file under `src/` changed; no test file was created, so the test-file count does not move and no count sync is needed; 429, 101, 328 and 124 still hold.
11. **The commands are unchanged.** `src/commands/` still holds start, push and update, and `countSlashCommandSpecs()` still reads 3.
12. **The whole gate passes.** WHEN `npm test` runs, THEN it passes with zero failures, zero skipped, and coverage at or above the floor recorded in `.ctoc/coverage-baseline.json` (no source file changes, so the floor is not at risk).

### Definition of Done

- [x] The checks in scenarios 1, 6, 8 and 9 and the tightened watcher fence were written first, run, and seen failing for the stated reasons before any other file changed; the checks that were already green are named as guards.
- [x] `plugin.json` `skills` is exactly `["./skills/"]`; the version fields are untouched and correct after a release sync.
- [x] The two agents, the template, the watcher fence, CTO Chief, the skill-loading wording, `README.md` and `CLAUDE.md` are edited as section 2 says, by tightening, with no pin loosened and no test weakened.
- [x] Scenario 4 is recorded from real dispatches; scenarios 3 and 5 are observed after shipping and recorded, or the closing report says plainly they were not observed.
- [x] No build that declares `README.md` or `CLAUDE.md` ran at the same time as this one.
- [x] `npm test` passes.
- [x] Reachability, in the same unit of work: the manifest is the live entry for the depth-one skills; each specialist body stays reachable through an agent that names it, and the weakest route (`saas/workos-sso`) is stated as such in the record, not called covered.

## Decisions By The Human

The authority for settling the forks below is the human's instruction for this session, quoted verbatim: "stop asking theswe stupid questions fix it". The plan's authority to exist is the request quoted under the problem statement. These instructions settle the forks only; they do not approve this plan at its gate, and no approval marker is written here.

**Scope widened by the human on 2026-09-30.** The build stopped at verification because one test outside the declared files failed: the improvement-record check demands that the citation validator's tools line equal, character for character, the line recorded when the improvement run started, and that recorded line includes the Skill tool this plan removes. The executor filed the scope question; the human answered, verbatim: "ok fix it". The declared files therefore gain `tests/agent-and-skill-improvement-record.test.js`, for one edit only: the check expects the recorded starting line with only the Skill tool removed. It stays an exact match, so the validator can lose that one tool and can never gain one. The recorded starting line in the inventory is not rewritten.

## Decisions Taken Under Ambiguity

1. **`push` stays.**
   - Choice: `src/commands/push.md` and `push.js` are untouched, so the picker shows start, push, update, ask-me-questions and deepthink.
   - Reason: the human named four; the request's object is the 100+ entries that arrived with the specialist registration. `push` is one of the three commands shipped since 6.9.32 and is the human's ship route (`docs/IRON_LOOP.md` names `/ctoc:push` as the push crossing; README Lesson 6 and the Commands table; `tests/readme-numbers.test.js` pins the count of 3 and the README text).
   - Not chosen: removing `push` so the picker lists exactly the four named. Pro: exact match to the four words. Con: the ship route needs another door, and at least the command-count test, the README, the contributor sentences and the generated project template must be re-cut. If the human wants it, it is its own plan.
2. **The manifest lists `./skills/` only.**
   - Not chosen: `user-invocable: false` in each of the 99 specialist bodies. It hides them from the picker but, per the documentation summary, leaves them available to Claude (their descriptions stay in the session's skill list), and it is 99 edits in files the improvement run holds.
   - Not chosen: `disable-model-invocation: true`: keeps them in the picker.
   - Cost accepted: a person can no longer type a specialist's name as a slash entry; they ask, and the pipeline dispatches the agent.
3. **`Skill` leaves the two agents and the template, and the fence forbids it.**
   - Reason: after this change the tool resolves only depth-one skills, neither a domain skill; a held tool that cannot deliver what the body promises is the mirror of the impossible orders the repository already fences. `src/commands/start.md` says the gate lenses hold `Read, Grep` on purpose.
   - Not chosen: keep `Skill` and add words. It leaves a false promise standing.
4. **`saas/workos-sso` gets no new agent.** A new agent moves the 124 that six README pins and CLAUDE.md state, needs a watcher-baseline entry, and is a scope the human did not ask for. Its route is CTO Chief's Step 10 rule (now naming the path and ordering the read) and the `clerk-auth` reuse table. That is instruction-level and the weakest route; the record says so. The human may add a wrapper later.
5. **The wrappers' read orders are not rewritten, and a failed installed-project read is a finding.** Rewriting about 100 agent bodies is not the request and conflicts with the improvement run. If scenario 5 fails, the finding carries two options: restore category entries in the manifest (this plan's opposite), or rewrite the read orders to the plugin-root variable, which the documentation summary says is substituted in agent content, while a third-party issue titled as a canary test of exactly that suggests it is unconfirmed in practice.
6. **Tests are edited, not added.** No new test file, so the test-file count and its release sync do not move.
7. **No edit to `start.md`, `library.js`, `AGENT_ARCHITECTURE.md` or the other docs.** They were read and make no registration claim; the stale command names and nonexistent-command docs listed above are not caused by this change and are reported, not fixed.
8. **The README is edited by exact passage, not rewritten.** The rebuild owns the rest.
9. **(Build) The CTO Chief dispatch example keeps `"subagent_type": "general-purpose"`.** Only the `"skills"` key was dropped and the file paths moved into the prompt, as section 2 item 5 says; changing the example's agent type was not asked.
10. **(Build) The README names `/ctoc:deepthink` nowhere yet.** Its skill is not on disk; the discovery test demands the README name every depth-one skill that IS on disk, so the deepthink plan's second slice is held to naming it when it lands.
11. **(Build) The contributor sentence in `CLAUDE.md` sits directly under the architecture tree**, beside the `.claude-plugin/` and `skills/` lines it explains, and carries no number, so no count pin moves.
12. **(Build) The skill-loading test header no longer says the phrases are matched by the pipeline.** The planning record found the corpus test to be their only reader; the header says so rather than claiming a runtime reader nobody verified.

## Open Questions For The Human

None.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling
- [x] Wire up integration points

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal)
- [x] Sanitize outputs
- [x] No secrets in code
- [x] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
- [x] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

## Execution Record (Steps 8-16)

### Step 8 — test first, seen red
Red record (2026-09-30, before any non-test file changed). Command: `node --test` over the 44 affected test files listed under Step 14. Result: 848 tests, 842 pass, 6 fail, 0 skipped. The six failures, each for the stated reason:

1. `plugin-skill-discovery` — "the skills array is exactly ["./skills/"]": the manifest held 24 entries (the 23 extra category folders were listed in the diff).
2. `plugin-skill-discovery` — "no agent definition and not the watcher template holds or orders the Skill tool": six offences, `Skill` in `tools:` and the backticked tool in the body of `.ctoc/templates/watcher.md`, `agents/ai-quality/citation-validator.md` and `agents/iron-loop/advocate-critic.md`. No other agent was named, so no scope growth.
3. `plugin-skill-discovery` — "the README names every human-invoked skill on disk": `/ctoc:ask-me-questions` absent.
4. `plugin-skill-discovery` — "CTO Chief routes specialists through agents": `Skill-first, subagent-second` present.
5. `watcher-shape` case 1: the template's tools held `Skill`, now outside the allowlist.
6. `watcher-shape` case 4: both conforming agents held `Skill`.

Guards, green before the implementation and therefore not red-first tests: "only the human-invoked skills sit directly under skills/" (scenario 2; the tree already holds only `ask-me-questions` at depth one). Its ability to fail was checked by a mutation in a scratch copy outside the repository (a copy of `security/sast-scanner/SKILL.md` placed at depth one): it failed and named `sast-scanner`. The unchanged discovery checks (array exists, `./skills/` first, paths exist, no duplicate names) and every other affected test were green before and are guards.

Test edits and their justification (tightened, none loosened):
- `tests/plugin-skill-discovery.test.js`: "every category folder is declared" is replaced by "the array is exactly `./skills/`", because the external contract changed — the human asked on 2026-09-30 for the specialist picker entries to go, and the old assertion made that impossible. Four new checks were added (depth-one names, no `Skill` tool, README names, CTO Chief text). The assertion message calling `ask-me-questions` "the only depth-1 skill" was corrected. The duplicate-name check now reuses one frontmatter helper; its assertion is unchanged.
- `tests/watcher-shape.test.js`: `Skill` removed from the read-only allowlist, because with no specialist registered the tool resolves nothing a watcher borrows; the comment that said the template requires it is corrected. Stricter, not looser.

### Steps 9 to 13 — what landed
- Step 9: no dependency, directory or configuration was needed.
- Step 10, in the declared files only: `.claude-plugin/plugin.json` `skills` is `["./skills/"]`; `.ctoc/templates/watcher.md`, `agents/ai-quality/citation-validator.md` and `agents/iron-loop/advocate-critic.md` dropped `Skill` from `tools:` and their `## What I Borrow` text now says a specialist is read from its file by path and that none is registered for a tool to load (the template's "must stay in tools" sentence and its quotation are gone); `agents/coordinator/cto-chief.md` has the read-in-context-first routing rule, the "name the skill file path in the dispatch payload" rule, the example without a `"skills"` key, and the Step 10 line for `saas/workos-sso` orders a read of `skills/saas/workos-sso/SKILL.md`; `tests/skill-loading.test.js` header, one comment and one describe name reworded, assertions unchanged; `README.md` Lesson 0, the Commands section, the blockquote above the agents' Skills table and the "How skills reach you after install" paragraph; `CLAUDE.md` one contributor paragraph. Error handling: no runtime code changed; the test helpers read real files and fail loudly on an unreadable one.
- Steps 11 to 13: self-reviewed the diff; no secrets, no new path handling (the existing check that a declared manifest path has no `..` and is not absolute is kept).
- `.ctoc/unexecutable-instruction-baseline.json` compared byte-for-byte against the last commit: identical (scenario 7).

### Step 14 — stopped once: scope growth requested, then allowed
After Step 10 the 44 affected test files ran 848 tests, 847 pass, 1 fail, 0 skipped. The whole suite (`node --test tests/*.test.js`, which does not enforce the coverage floor) then ran 12034 tests, 12033 pass, 1 fail, 0 skipped. The one failure, in both runs: `tests/agent-and-skill-improvement-record.test.js` — "the real record directory passes the check": check 9 demands the citation validator's tools line equal the start line recorded in `.ctoc/audit/agent-and-skill-improvement/inventory.json` (`tools: Read, Grep, Skill, WebSearch, WebFetch`), and this plan removes `Skill` from it. It was green before this build. Neither that test nor the inventory is in `files:`, so nothing was edited: a scope-growth request was filed to the inbox (question `1790779151941-1s4114`) naming the test file, with the change "the validator may lose a tool against its recorded start, never gain one". Rewriting the recorded start line instead would falsify a measured record and is not proposed. The build stops here until the human decides; version bump, completion and commit were not done.

The 44 affected test files (the loop set, also used for the red run): `tests/plugin-skill-discovery.test.js`, `tests/watcher-shape.test.js`, `tests/skill-loading.test.js`, `tests/citation-validator.test.js`, `tests/cto-chief-toplevel.test.js`, `tests/cto-chief-compliance-dispatch.test.js`, `tests/readme-numbers.test.js`, `tests/unexecutable-instruction-fence.test.js`, `tests/release-metadata-sync.test.js`, `tests/version-syncplugin-path-fix.test.js`, `tests/agent-honest-status-fence.test.js`, `tests/gate-words.test.js`, `tests/instruction-surfaces-say-the-moment.test.js`, `tests/compliance-claims-match-code.test.js`, `tests/architecture-invariants.test.js`, `tests/agent-model-floor.test.js`, `tests/agent-contract-load.test.js`, `tests/agent-dispatch-resolution.test.js`, `tests/agent-layer-reachability.test.js`, `tests/agent-and-skill-improvement-record.test.js`, `tests/claude-md-lessons.test.js`, `tests/claude-md-lessons-coverage.test.js`, `tests/doc-counts.test.js`, `tests/doc-counts-generated.test.js`, `tests/cu5-s1-safety-wrappers.test.js`, `tests/cu5-s2-security-wrappers.test.js`, `tests/cu5-s3-legal-realtime-wrappers.test.js`, `tests/cu5-s4-compliance-aiquality-wrappers.test.js`, `tests/cu5-wrapper-coverage-completeness.test.js`, `tests/no-tier-3.test.js`, `tests/tier1-no-peer-dispatch.test.js`, `tests/registry-integrity.test.js`, `tests/version.test.js`, `tests/version-coverage.test.js`, `tests/version-license-invariant.test.js`, `tests/release.test.js`, `tests/no-phantom-command-family.test.js`, `tests/slash-command-no-model-pin.test.js`, `tests/corpus-audit-ledger.test.js`, `tests/skill-regulatory-citations.test.js`, `tests/operating-manual.test.js`, `tests/operating-manual-coverage.test.js`, `tests/agent-shared-not-dispatchable.test.js`, `tests/refinement-loop-claims-match-code.test.js`.

### Step 14 continued — the scope the human allowed
The human answered the scope question ("ok fix it"; recorded under "Decisions By The Human") and `tests/agent-and-skill-improvement-record.test.js` joined the declared files.

Justification for this test change:
- The contract that changed, from outside the test: the human's ruling that the plugin manifest registers no specialist skill, so the citation validator must not hold the Skill tool (scenario 6, decision 3), and the human's explicit answer allowing this one edit.
- Why the test and not the code: the code (the validator's tools line) is now correct by that ruling. The test's premise, that the validator's grant equals its recorded starting line character for character, is the one fact the ruling changes. The recorded starting line in `.ctoc/audit/agent-and-skill-improvement/inventory.json` is a measured record and was not rewritten.
- The edit: a helper derives the expected line from the recorded one with only `Skill` removed, order kept; the comparison stays exact. The synthetic fixture's validator file now carries the Skill-less line, mirroring the real one.
- What newly fails: a validator line that still holds `Skill` (it used to pass, because it equalled the recorded start). What still fails: gaining any tool, losing any tool other than `Skill`, and any forbidden write tool.
- Test first: the new case "rejects a validator tools line that keeps Skill, gains a tool, or loses one other than Skill" was written and run before the check changed, and failed with `expected a "tools" failure, got: []` on the line that keeps Skill (with it, "accepts a well-formed record directory" and "the real record directory passes the check" were red, 3 of 16). After the change: 16 of 16 pass. Its teeth were checked by adding the correct line to its list of wrong lines: it then failed with `got: []`, and the list was restored.

Affected tests after the change: the same 44 files, 849 tests, 849 pass, 0 fail, 0 skipped.

Version: `VERSION` set to 6.14.71 and `node src/scripts/release.js` run; it updated `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `package.json` and four version strings in `README.md`. `plugin.json` `skills` read back as exactly `["./skills/"]` (the release script re-indented the array onto separate lines; the value is unchanged). The release-sync, version, release, discovery and README-number tests: 198 tests, 198 pass, 0 skipped. There is no changelog file in this repository, so none was updated.

### Steps 14 and 16 — verification run by the builder before completion
Once nothing else was writing in the repository: `npm run lint` exited 0 (no warnings allowed); `npm run typecheck` exited 0 (1 test, 1 pass); `npm test` exited 0 — 12035 tests, 12035 pass, 0 fail, 0 skipped, coverage 99.9% against the 99% floor, the offline claims ledger gate passed. Scenario 12 holds on this run. Steps 8 to 15 were re-read against this record before the Step 16 boxes were ticked. The completion step runs its own verification and writes the evidence the human's final OK reads; that result is reported separately, not assumed from this run.

### Definition of done — evidence per box, and the one box left open
- Tests first, seen red, guards named: see "Step 8 — test first, seen red" and the improvement-record test's red above.
- Manifest exact, versions right after the release sync: see "Step 14 continued".
- Edits by tightening: see "Steps 9 to 13" and the per-test justifications.
- No concurrent build on `README.md` or `CLAUDE.md`: the task registry (`.ctoc/state/tasks.json`) shows no other build task running between this task's start (14:32 UTC) and now; the last build declaring `CLAUDE.md` (t110) finished at 08:30 UTC. The planning tasks t113 and t116 declared no `README.md` or `CLAUDE.md` (t116 declares one plan file; t113 declares nothing and is still marked running in the registry, which the coordinator reports has stopped).
- `npm test` passes: see "Steps 14 and 16".
- Reachability: the manifest entry `./skills/` is the live entry for the depth-one skill (`ask-me-questions`). Each specialist body stays reachable only through an agent that reads it by path; `skills/iron-loop/advocate-lens/SKILL.md` through `advocate-critic`'s read order. The weakest route is `saas/workos-sso`: it has no agent of its own and is reached only by CTO Chief's Step 10 read order and the reuse table in `clerk-auth` — an instruction-level route, stated here as that and not called covered.
- **Left open, truthfully: "Scenario 4 is recorded from real dispatches".** Dispatching `ai-code-quality-reviewer`, `clerk-auth`, `gdpr-agent` and `dead-code-detector` and reading their transcripts needs a dispatch tool the build executor does not hold. The first completion attempt was refused for this box and the six others (a kickback, recorded by the circuit breaker); the six are ticked above with their evidence, and this one waited for the session to run and record scenario 4 (now recorded below, and ticked).

### Scenario 4 — recorded from real dispatches by the session
Run by the session, not by the build executor, in this repository on 2026-09-30, against the INSTALLED plugin, version 6.14.67 (dispatched agents load from the installed plugin, not from this repository's agent files). Six dispatches; each agent was given a small read-only task and was NOT told to read its skill file; each transcript was checked tool call by tool call by the session.

1. `clerk-auth` — a question about verifying a session in a route handler. One tool call, a read of `skills/saas/clerk-auth/SKILL.md`. READ ITS SKILL FILE.
2. `ai-code-quality-reviewer` — reviewed `src/lib/request-exit.js`. Four tool calls (three file reads, one text search), none of its skill file. DID NOT READ ITS SKILL FILE. Cause, checked by exact string presence: the installed 6.14.67 definition contains no order to read `skills/ai-quality/ai-code-quality-reviewer/SKILL.md`; this repository's definition (changed in 6.14.70, not yet shipped) contains it. The read order this scenario expected for this agent is therefore UNTESTED until that version is shipped and installed. The agent holds `Read, Grep` and never held the Skill tool, so the manifest change removes no route it used.
3. `gdpr-agent` — asked to scan `src/lib/inbox.js`. One tool call, a read of `.ctoc/settings.yaml`; it found the privacy profile absent from the active profiles (`active_profiles: []`, `declined: true`) and stopped at its first check, as its definition orders. DID NOT REACH ITS SKILL FILE; the read route is UNTESTED for this agent in this project. It never held the Skill tool.
4. `dead-code-detector` — checked `src/lib/request-exit.js`. Five tool calls (one file read, four shell commands using the repository's own reachability analyzer and the TypeScript compiler), no skill file. DID NOT READ A SKILL FILE, which matches the plan's expectation that its method is inline; recorded, not a failure.
5. `input-validation-checker` (added by the session as a substitute; its installed body mentions its skill file) — checked `src/scripts/ledger-backfill.js`. First tool call is a read of `skills/security/input-validation-checker/SKILL.md`. READ ITS SKILL FILE.
6. `error-handler-checker` (added by the session as a substitute; its installed definition names its skill ONLY in the `target_skill` frontmatter key, with no path in the body) — checked `src/scripts/ledger-backfill.js`. First tool call is a read of `skills/specialized/error-handler-checker/SKILL.md`. READ ITS SKILL FILE.

Outcome, plainly: of the three agents the scenario named as expected to read their skill file, ONE did (`clerk-auth`); the other two (`ai-code-quality-reviewer`, `gdpr-agent`) are untested, for the reasons above, neither caused by this change. The two substitute wrappers both read their skill file by repository-relative path, one of them with nothing but the frontmatter key to go on. Every other wrapper is untested. **Scenario 4's THEN clause as written is therefore NOT fully met.** The definition-of-done box ticked above says scenario 4 is recorded from real dispatches, which is now true; it does not say scenario 4 passed. Scenarios 3 and 5 remain NOT OBSERVED.

### Not done by this build
- Scenario 4 was run by the session, not by this build; its record is above and its THEN clause is not fully met.
- Scenarios 3 and 5 are NOT OBSERVED: they can only be observed after the change ships and is installed from the marketplace.
- The "no build declaring README.md or CLAUDE.md ran at the same time" item in the definition of done: the builder did not census other runs; the coordinator reported that two planning agents were writing plan files mid-build and had stopped before the verification above.
