---
title: "CTOC's hooks are actually loaded by Claude Code, and CTOC says out loud whenever they are not"
type: functional
status: functional
created: 2026-09-30
priority: high
effort: large
depends_on: none
files:
  - "hooks/hooks.json"
  - ".claude-plugin/hooks.json"
  - ".claude-plugin/plugin.json"
  - "src/commands/update.js"
  - "src/lib/reachability.js"
  - "src/lib/enforcement-log.js"
  - "src/lib/enforcement-liveness.js"
  - "src/lib/hook-deny-signal.js"
  - "src/lib/streaming-gate.js"
  - "src/hooks/PreToolUse.Edit.js"
  - "src/hooks/PreToolUse.Bash.js"
  - "src/hooks/PreToolUse.Task.js"
  - "src/hooks/PostToolUse.status-check.js"
  - "src/hooks/SessionStart.js"
  - "src/hooks/UserPromptSubmit.js"
  - "src/tabs/tools.js"
  - "src/areas/system.js"
  - "src/scripts/verify-hooks-live.js"
  - ".ctoc/reachability-roots.json"
  - "tests/installer-paths.test.js"
  - "tests/step-label-hook-claim-matches-manifest.test.js"
  - "tests/tools-tab-coverage.test.js"
  - "tests/the-edit-protection-says-whether-it-is-running.test.js"
  - "CLAUDE.md"
---

# CTOC's hooks are actually loaded by Claude Code, and CTOC says out loud whenever they are not

## Problem Statement

CTOC's written design says its hooks refuse edits that no approved plan covers, keep the four human approval moments the human's, keep a build going until its queue is empty, greet every session with a banner and a routing reminder, and record every decision in a log. In the live session observed on 2026-09-30 none of that ran. A file write that the edit hook refuses when it is run by hand succeeded. The enforcement log did not grow from it. No CTOC text reached the session, while the hooks of three other enabled plugins did fire.

By the vendor's documentation, Claude Code loads a plugin's hooks from a file named `hooks/hooks.json` at the plugin root, or from a path the plugin manifest names. CTOC's registration sits in `.claude-plugin/hooks.json`, a place the vendor's layout rule does not list. Nothing in the product noticed. The Doctor screen reports "Hooks configured" as passed because that file exists. The test suite proves the file is well-formed and that each hook works when it is run by its own file name. The one liveness check that exists can be reset to "active" by anyone who runs a hook by hand.

This plan puts the registration where Claude Code loads it, proves it by running it (in the suite, and in a live session with evidence the session cannot author), makes CTOC tell the owner plainly whenever the hooks are not running, and lists, before anything is switched on, every sanctioned flow a working hook would refuse.

## Business Alignment

**Job to Be Done:** When I rely on CTOC to refuse edits no approved plan covers, to keep the four human approval moments mine, and to keep building until the queue is empty, I want Claude Code to actually run CTOC's hooks and CTOC to tell me at once whenever it is not, so I can trust the word "enforced" instead of finding out weeks later from an empty log.

**Impact Map:**
- **Goal:** CTOC's written rules hold in real sessions. This traces to the project's first operating lesson (the measure is the human, and green tests do not make something work) and to its lesson on honesty (report reality plainly).
- **Actor:** The owner (the human CTO Chief), and every person who installs the plugin from the marketplace.
- **Impact:** An edit no approved plan covers is refused in a live session. A session in which CTOC's protection is off says so on the first screen the owner opens, in words, with the consequence and one action.
- **Deliverable:** The registration at the place the vendor loads it; a check that runs it; a recorded live-session proof; a truthful signal; and the list of what switching enforcement on will change.

## What is true on disk today

How this was gathered: the agent that wrote this plan holds four tools (read a file, write a file, search the web, list files by pattern). It cannot run a program. Every statement below about how a hook behaves was read from its source. Nothing was run. Every vendor statement comes from the search tool's rendering of vendor pages, not from the page text, because no page-fetch tool was available.

### The registration

`.claude-plugin/` holds exactly three files: `hooks.json`, `marketplace.json`, `plugin.json`. There is no `hooks/` directory in the working tree, and none in the installed copy at `<home>/.claude/plugins/cache/robotijn/ctoc/6.14.67/` (the only version directory there). The installed copy has `.claude-plugin/hooks.json` and no root `hooks/`.

The manifest is this, in full:

```json
{
  "name": "ctoc",
  "version": "6.14.71",
  "description": "Your Virtual CTO — 60 AI agents. 265 expert skills. 15 quality gates.",
  "commands": "./src/commands/",
  "skills": [
    "./skills/"
  ]
}
```

The registration file declares six events (session start, before a tool, after a tool, subagent stop, stop, prompt submit) with fifteen handlers that run fifteen distinct scripts, each as `node "${CLAUDE_PLUGIN_ROOT}/src/hooks/<name>.js"`. `src/hooks/` holds seventeen files. The other two are not Claude Code hooks: one is a git hook script and one is a command-line plan validator. Six other plugins on this machine have their own `hooks/hooks.json` at their plugin root (explanatory-output-style, security-guidance, langfuse-observability, remember, superpowers, railway). The brief reports that the hooks of three enabled plugins fire and names superpowers and remember as examples of that root layout.

The session-start entry in CTOC's file has no matcher group around it. Every event in a file that fires (security-guidance's prompt-submit entry is shown) has a group holding a list of handlers:

```json
    "SessionStart": [
      {
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/src/hooks/SessionStart.js\""
      }
    ],
```

```json
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/sg-python.sh\" \"${CLAUDE_PLUGIN_ROOT}/hooks/security_reminder_hook.py\""
          }
        ]
      }
    ],
```

The dispatch entry matches only the name `Task`:

```json
      {
        "matcher": "Task",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/src/hooks/PreToolUse.Task.js\""
          }
        ]
      },
```

What installs or wires hooks elsewhere: the hooks installer in `src/lib/hooks-installer.js` installs git hooks only (husky, the pre-commit framework, native hooks and a post-commit script), never a Claude Code hook. `.git/hooks/` in this repository holds only `.sample` files, so no post-commit hook is installed here. Project initialisation installs a git hook only when its caller passes the flag that says the human was asked. The update command (`src/commands/update.js`) mirrors the whole marketplace copy into the plugin cache and never mentions hooks. Nothing I read writes a Claude Code hook setting.

### Whether it ever worked

I cannot establish that the registration was ever loaded. Three kinds of evidence exist.

The enforcement log now holds 30 lines: 22 for the edit tools, 8 for the write tool, none from the shell hook, none from dispatch. The 30th line is the hand run made in the observed session:

```json
{"timestamp":"2026-09-30T16:42:20.721Z","tool":"Write","target_file":"<home>/Code/ctoc/src/__hook_probe.txt","project_is_ctoc":true,"plan_matched":null,"escape_phrase":null,"outcome":"block","mode":"strict","mode_source":"settings.yaml"}
```

The newest line before it is 2026-08-31T12:55:50Z. Lines that look like real work exist on 2026-06-15, 2026-07-17, 2026-07-23 and 2026-08-31, for example:

```json
{"timestamp":"2026-08-31T12:52:31.952Z","tool":"Edit","target_file":"<home>/Code/ctoc/README.md","project_is_ctoc":true,"plan_matched":null,"escape_phrase":null,"outcome":"block","mode":"strict","mode_source":"settings.yaml"}
```

The log cannot tell a harness run from a hand run, because a hand run writes an identical line. Several lines are plainly hand-fired: seven of the twelve lines from 2026-07-08 have no target at all; targets named for probing exist (`zz-probe-does-not-exist.js`, `zz2.js`, `totally-unplanned-file.js`); three writes on 2026-08-31 landed within about 150 milliseconds of each other, one of them in the session's scratch directory. So the log neither proves nor excludes that the harness ever invoked the edit hook.

An independent witness that hand runs do not contaminate: the after-tool hook stamps `.ctoc/state/hook-beacon.json` on every tool call. The installed 6.14.67 copy of that hook contains the stamping function and calls it first in its main routine (I read both). The stamp file does not exist in this project, in its parent `<home>/Code/`, or in `<home>/.ctoc/state/`. A machine-wide search for it timed out, so "it exists nowhere on this machine" is not established. The dispatch hook's slot store `.ctoc/state/agent-slots.json` is also absent, although the brief reports subagents were launched today; that witness is weaker, because it would also be absent if the `Task` name no longer matches the launch tool (see the vendor section).

Two earlier plans measured the same silence without finding the cause. The plan titled "Nothing proves the dispatch hook ever runs" (review stage, measurement recorded as taken on 2026-07-20) found that the dispatch hook had left no slot store and no log line, and recorded that the installed copy carried the registration in the same place. The plan titled "The edit protection says out loud when it has stopped running" (review stage) measured 24 lines as the complete lifetime record and named "session staleness" as consistent with the evidence and verified by none of it. Neither asked whether Claude Code reads the place the registration sits in.

The project ignores `.claude/` in git. A project-level hook block in `.claude/settings.json`, if one ever existed, would not be in history, so the brief's finding that no commit ever gave `plugin.json` a `hooks` key does not exclude that earlier lines came from such a block. Whether an older Claude Code read `.claude-plugin/hooks.json` was not found in the vendor text.

### What looks like a fix and is not one

The Doctor health row checks only that a file exists at the old path:

```js
  // Hooks configured
  const hooksPath = path.join(pluginPath, '.claude-plugin', 'hooks.json');
  checks.push({
    label: 'Hooks configured',
    pass: safeFs.existsSync(hooksPath)
  });
```

The System screen already renders an "Edit protection" verdict (the earlier plan above), which compares the newest log line with the modification times of files that active plans declare. It is reached through the classic dashboard's System area. The command that opens the default screen (`src/commands/start.js`) composes the streaming gate screen, the setup note and two optional questions, and adds no protection line; I did not open the streaming screen builders, so whether they carry one is not established. The verdict has three weaknesses. First, by that plan's own recorded decision, any hook invocation including a hand run resets the cutoff and forgives every earlier unrecorded edit. Second, its no-record wording reads:

```js
        'Cannot tell — CTOC has no record of ever checking an edit in this project.',
        'That is normal for a new project, and it is not proof that anything is wrong.'
```

which is false reassurance for every project on a machine where the hooks never loaded. Third, it reads the beacon, which is absent, and renders that absence as "it may predate that check", although the installed build contains the check.

What each existing test or reader proves, and what it cannot:

| Test or reader | What it proves | What it cannot prove |
|---|---|---|
| installer-paths test | The file at the old path exists, parses, and each command names a script present in the working tree | Anything about where Claude Code looks |
| step-label claim test | One script name is absent from the old file | The same |
| reachability analyzer | Treats every command in the old file as a live root; its constant is the old path | That Claude Code runs any of them; credit for "reachable" rests on a file the vendor layout does not list |
| Doctor row | The old file exists | The same |
| end-to-end, shell-hook, secret-guard, prompt and session-start tests | Each hook behaves when started by its file name with planted input | That anything starts them |
| the forgery test over the menu recipes | No menu recipe is falsely refused as a forgery, with state planted so the shell's write rule allows everything | That a recipe runs under the state a real session has |
| the older hooks test file | Nothing about the hooks: it re-declares the shell patterns inside the test and tests its own copy | Everything |

The forgery test states its plant in its own header:

```
State is planted at step 10 with a feature, so the write/commit gates would ALLOW every command here: any deny observed is the ledger guard, nothing else.
```

### Where the brief and the disk differed

- The brief counts 29 log lines. Disk holds 30. The 30th is the hand run in the observed session, which is consistent with the brief's claim that the live write did not change the log.
- The brief says the dashboard and every status line assume the hooks are live. The System area already has a protection verdict with the weaknesses above; the default screen, the Doctor row and the session banner do assume it.
- The brief asks what the hooks installer wires. It wires git hooks only, and none is installed in this repository, although `.ctoc/reachability-roots.json` records the post-commit script as "executed by git after every commit".
- The brief cites `general.entry_point` as a precedent to declare and drive. The mechanism exists; this repository's `.ctoc/settings.json` declares none.
- The brief says another planner found the shell hook has no rule about the ledger-backfill script. Confirmed by reading: only message text and comments name it; no allow rule does.

## What the vendor documents

Each row is the search tool's rendering of a vendor page. The tool did not attribute each sentence to one page; the addresses are the pages it returned for that query.

| Statement | Address |
|---|---|
| "Put every other plugin file at the plugin root, not inside .claude-plugin/. That includes skills/, commands/, and hooks/." | https://code.claude.com/docs/en/plugins-reference and https://code.claude.com/docs/en/plugins/create |
| "Hooks are located under the plugin's root directory as hooks/hooks.json." Plugin hooks are defined there with an optional top-level description field. | https://code.claude.com/docs/en/plugins-reference |
| The manifest's hooks field "takes a .json file path, an inline hooks object, or an array mixing both. ... Claude Code merges whatever you declare with hooks/hooks.json when that file exists." | https://code.claude.com/docs/en/plugins-reference |
| "A hook event refers to the lifecycle point, a matcher group is the filter, and a hook handler is the shell command, HTTP endpoint, MCP tool, prompt, or agent that runs." "Each object in the inner hooks array is a hook handler." | https://code.claude.com/docs/en/hooks |
| "Use exit 2 to block with a stderr message, or exit 0 with JSON for structured control. Don't mix them: Claude Code ignores JSON when you exit 2." "Stderr from a hook that exits 0 goes to the debug log only, never the transcript." | https://code.claude.com/docs/en/hooks |
| "Hooks from settings files, managed policy settings, and plugins also run inside subagents." "When a subagent calls a tool, tool events such as PreToolUse and PostToolUse fire the same configured hooks as in the main conversation, and the input carries the agent_id and agent_type common input fields that identify the subagent." | https://code.claude.com/docs/en/hooks and https://code.claude.com/docs/en/sub-agents |
| The plugin root, project directory and plugin data directory are exported as environment variables to the spawned hook process. "The variables aren't present in the environment of commands Claude runs through the Bash tool, in the main session or in a subagent." | https://code.claude.com/docs/en/plugins-reference and https://code.claude.com/docs/en/env-vars |
| "A timed-out command, http, or mcp_tool hook doesn't block the tool call. The call continues through the normal permission flow, so don't count on a stalled hook to act as a gate." | https://code.claude.com/docs/en/hooks |
| "Run /hooks to list every hook registered for the current session, grouped by event. If a hook you defined doesn't appear, it isn't being read." "Start a session with claude --debug and trigger the tool call. The debug log records each event, which matchers were checked, and the hook's exit code and output." | https://code.claude.com/docs/en/debug-your-config |
| `claude plugin list` prints the load status or the load error; `claude plugin details` lists the plugin's hooks; `claude plugin validate` catches "a JSON syntax problem in hooks/hooks.json". | https://code.claude.com/docs/en/plugins/cli-reference |
| "Run /reload-plugins or restart Claude Code to pick up changes to the plugin's components, such as hooks/, .mcp.json, agents/, and output-styles/." | https://code.claude.com/docs/en/plugins/loading |
| The matcher is "a single string that uses | to match multiple tool names, for example Edit|Write". | https://code.claude.com/docs/en/debug-your-config |
| A marketplace entry may carry hooks only as an inline object, and with a manifest present "the entry's matchers for an event replace the manifest's matchers for that same event". | https://code.claude.com/docs/en/plugin-marketplaces |

Found only in user reports, not in vendor text:

- A plugin whose manifest names `./hooks/hooks.json` is refused whole on Claude Code 2.1.255 and later, with the loader message "The standard hooks/hooks.json is loaded automatically, so manifest.hooks should only reference additional hook files" (https://github.com/ScriptedAlchemy/agent-bundle/issues/462). The wrong repair, declaring the standard file in the manifest, would therefore disable the whole plugin, including its commands and skills.
- Another plugin shipped the same defect, a registration one directory too deep in `.claude-plugin/`, with the symptom that its session-start hook never ran, and the repair was to move it to the root (https://github.com/basecamp/hey-cli/issues/429).
- The subagent-launch tool was renamed from `Task` to `Agent` in Claude Code 2.1.63 and the payload's tool name changed; `Task` still matches in the settings tool filter as a compatibility alias (https://github.com/anthropics/claude-code/issues/29677).
- Files whose entries lack the matcher-group-plus-handler-list shape are reported as failing to load, in some reports with none of the file's hooks running (https://github.com/ananddtyagi/cc-marketplace/issues/65).

Not found in the vendor text I could reach, and therefore not relied on: the sentence "Claude Code does not read `.claude-plugin/hooks.json`" (the positive layout rule above is what exists); the default per-hook timeout; what Claude Code does with a handler placed directly under an event; whether the `Task` alias applies to hook matchers; how a session-only copy of a plugin interacts with an installed copy of the same name; the debug log's line format; and whether a plugin installed for the whole user account runs its hooks in every project (the install record says scope "user").

## What switching enforcement on will do, read from the source

These are predictions from reading. The plan requires them to be replaced by a recorded run (see the consequence scenario).

Two states matter. The state a new session starts with is what session start saves when none exists: no feature named and step one. The state the tests plant is a named feature at step ten. The shell hook reads this signed per-project state. These are the lines that decide:

```js
  const classified = shellWrites.classifyWrites(command);
  const isWrite = classified.verdict !== 'none';

  // Check for write command
  if (isWrite) {
    // No feature context - block
    if (!state || !state.feature) {
      const reason = 'No feature context - write commands not allowed';
```

```js
  if (INTERPRETERS.has(word)) markIndet(REASONS.INTERPRETER);
  else if (TASK_RUNNERS.has(word)) markIndet(REASONS.TASK_RUNNER);
```

```js
function createState(projectPath, feature, language, framework) {
  const now = new Date().toISOString();
  return {
    ...
    feature: feature || null,
    ...
    currentStep: 1,
```

`node`, `python`, `npm`, `npx`, `make` and similar are in those two sets, and the shell hook treats a command whose writes it cannot read as a write for this rule. Session start calls the state constructor with no feature. I did not establish what, in production, ever sets a named feature or a step of eight or more. The hook's plan-coverage stage only acts after this rule has passed.

| Sanctioned flow | New-session state | Test-planted state |
|---|---|---|
| The menu command with no arguments | Refused: "No feature context - write commands not allowed" | Allowed |
| `menu task add`, `menu task start`, `menu task complete`, the live-agent-ids form | Refused | Allowed |
| Starting the next plan through an inline `node -e` program, and every other inline recipe in the menu instructions (settings, stale, cleanup, numbering, compliance) | Refused | Allowed, except an inline program that names the approval ledger or an approval-crossing function, which is refused at every state |
| `npm test`, `node --test`, `node src/scripts/release.js`, `npx` | Refused | Allowed |
| `node src/scripts/ledger-backfill.js` and `node src/scripts/move-plan.js` | Refused | Allowed (no rule allows them by name; the move-script exemption only lifts the raw-move refusal) |
| `git add`, `git status`, `git diff`, `git log` | Allowed | Allowed |
| `git commit` and `git push` | Refused | Refused until step fifteen |
| Force pushes, `reset --hard`, `clean -f`, `branch -D`, `checkout .`, recursive forced removal, destructive database statements | Refused at every state | Same |
| An executor's edit to a file a human-approved plan in the in-progress or todo folder declares | Allowed | Allowed |
| The same edit to a file no approved plan declares | Refused (strict); allowed with a warning (soft) | Same |
| An edit to a plan file under `plans/` | Allowed; a write of a numbered plan whose number another plan holds is refused | Same |
| An edit to `.ctoc/` state | Allowed, except the approval ledger, the verify-evidence store and the streaming store (its `questions/pending/` quarantine excepted), refused at every mode; the two command tables need a covering plan | Same |
| A subagent launch | Allowed while fewer than five are live | Same |
| A turn ending while approved plans wait in `plans/todo/` | Refused, up to 100 consecutive no-progress refusals | Same |

Consequences beyond single flows, all read and none run:

- The approval functions. The menu instructions tell the session to call the single-plan approval function and the batch approval function for a single approval, for all-to-todo and for all-done. The shell hook refuses any inline program that names either of them, at every state, by design. Whether an argument-driven route exists for the batch forms was not established.
- The plan-folder sweep runs on every tool call. This project has no migration marker (`.ctoc/approvals/.migration-complete.json` does not exist), so a plan resident in implementation, todo or done with no ledger entry is reported and left alone, while any other provenance fault moves the plan back. The folders hold 26 files in implementation and 136 in todo by the file listing. How many fail was not measured.
- The secret guard matches `.env`, `id_` followed by a word, `.key`, `credentials` and similar anywhere in a path or a shell command:

```js
  /\.env(?!\.(?:example|sample|template)\b)\b/i,
  /id_(rsa|dsa|ed25519|ecdsa|\w+)/i,
  /\.(pem|key)\b/i,
```

  An inline program that reads the process environment, or a commit message containing a word like `valid_path`, would match. Which sanctioned flows are caught can only be known by running them.
- Other projects. The install record says the plugin is installed for the whole user account. The shell hook and the secret guard carry no check that the directory is a CTOC project (the edit and dispatch hooks do). Session start saves a no-feature state for any directory, so the same shell rule would refuse program and task-runner commands in unrelated projects. Session start also creates the plan and learnings folders, may write the operating-lessons block into `CLAUDE.md`, and may start a detached index rebuild in any git repository, because a `.git` directory counts as evidence of a project.
- The banner session start injects says "MANDATORY: Edit/Write Blocked Before Step 8 ... You CANNOT Edit or Write files until ... Current step >= 8". The edit hook does not read the step; it judges plan coverage. Once the hooks load, that text reaches every session and is false.
- Reasons for refusals. The deny emitter writes the structured decision text and then exits with code 2, while its header says the process exits 0. By the vendor rule, exit 2 makes Claude Code ignore the structured text and use standard error as the message. Every refusal path I read writes its banner to standard error first (for the shell hook, through a helper whose own comments say it writes to standard error), so the model is told why; this has never been observed.
- A hook that runs longer than its timeout lets the tool call through. No hook's running time has been measured under the real harness.

## User Stories

**As the** owner, **I want** Claude Code to load CTOC's hooks from a marketplace install, **so that** an edit no approved plan covers is refused in a real session instead of only in a test.

**As the** owner, **I want** the copy of CTOC that Claude Code runs to carry the registration and to refuse an incomplete update, **so that** an update can never silently remove the hooks again.

**As the** owner, **I want** the first screen I open to say plainly whether CTOC's protection is running, never reading a hand run or an unreadable record as "running", **so that** I learn about an outage on the day it starts.

**As the** owner, **I want** a recorded, repeatable live-session procedure whose key evidence the session cannot write, covering the main session and a dispatched subagent, **so that** "the hooks work" is something I have seen, not something a green suite implies.

**As the** owner, **I want** every sanctioned flow run through the real hooks and every refusal listed before anything is switched on, **so that** switching on does not refuse CTOC's own menu, builds, commits or approvals without my knowing.

## Approach

1. **Registration.** Place the registration at `hooks/hooks.json` in the plugin root, rewrite the session-start entry into a matcher group, make the dispatch matcher name both `Agent` and `Task`, delete `.claude-plugin/hooks.json`, and give `plugin.json` no `hooks` key. Every reader of the old path (the Doctor row, the reachability analyzer, two tests) moves with it.
2. **Proof in the suite.** Tests read the registration and run each registered command as a child process with the environment and payload the vendor documents, so the chain registration, command, process, effect is exercised, not each link separately. Only the location scenario and the live procedure would have caught this defect: a wrong location is invisible to a test that starts from the registration. They are paired for that reason.
3. **Proof in a live session.** A human-run script issues a random probe token and prints the exact probe prompt, the session attempts three harmless-if-unprotected probes, and the script then reads the evidence and writes a record that the Doctor screen shows. The record names the Claude Code version and the plugin build it covers.
4. **Truthful signal.** Every hook that writes a record stamps who started it: the harness (the plugin-root variable is in the hook's environment and the payload carries a session identifier) or a person (neither). The shell hook also records its refusals, which it does not log today, with a fixed-vocabulary reason and never the command text. The liveness verdict counts only harness stamps. One verdict feeds the first line of the default screen, the dashboard, the System block and the Doctor row. The menu cannot know which session opened it, so its line reports the age of the newest harness activity in the project; the session-start line and the assistant's instruction cover "this session". The project's instructions carry one sentence for the case where no hook runs at all.
5. **Consequences.** The menu instructions' inline recipes are extracted from the menu file, as the recipe harness already does, and run through the real shell hook under each state. Every refused flow is listed. A fix that only adds a log field or corrects a comment is in this plan. A change to what a refusing hook decides is a question for the human, because the project treats hook and gate logic as safety-critical and human-approved.

Technical dependencies (what must exist before what): the consequence record and the human's answers to the open questions must exist before `hooks/hooks.json` is in a released tree, because placing it is the act that switches every refusing hook on for every installed copy after its next update. The live proof needs a session that loaded the registration: either a session started with the vendor's session-only plugin-directory option in a disposable project, or the installed plugin after update and reload. The verdict's use of harness stamps needs the hooks' log additions first. The first-line signal needs the verdict.

## Acceptance Criteria

### Story: Claude Code loads the hooks

- [ ] **Scenario: The registration sits where Claude Code loads it**
  Given the tree that ships (the tree the update command mirrors into the installed copy)
  When the registration check runs
  Then `hooks/hooks.json` exists at the plugin root, `.claude-plugin/hooks.json` does not exist, and `.claude-plugin/plugin.json` has no `hooks` key naming the standard file
  And the same check run on a fixture captured byte for byte from today's tree fails, naming both the missing root file and the file in the wrong place
  Seen failing first: today there is no root `hooks/` directory in the tree or the installed copy, and the file sits in `.claude-plugin/`.

- [ ] **Scenario: Every entry has the shape the vendor documents**
  Given the registration file
  When its structure is checked
  Then every event holds matcher groups, every group holds a non-empty list of handlers, every handler has type `command` and a command string, and no handler sits directly under an event
  And the fixture captured from today's tree fails this check on its session-start entry
  Seen failing first: that entry today is a handler directly under the event.

- [ ] **Scenario: Every registered command resolves in what ships and survives a path with a space**
  Given the registration and the set of files git tracks
  When each command is expanded with the plugin root set to a copy of the tracked files placed in a directory whose name contains a space
  Then every command names a script in the tracked set, none is ignored by git, and each starts without a missing-module failure
  Seen failing first: no test expands commands against a tracked-only copy; the existing test checks the working tree at the old path.

- [ ] **Scenario: Each registered command, run exactly as written, does its job**
  Given the registration, a fixture CTOC project, the environment variables the vendor says it sets for hooks, and for each event a payload carrying the documented fields (session identifier, transcript path, working directory, event name, tool name, tool input, and for a subagent the agent identifier and type)
  When the test extracts every event, matcher and command from the registration and runs each command as a child process with its payload on standard input
  Then the session-start command prints the CTOC banner; the edit, write, multi-edit and notebook-edit commands refuse an uncovered target with exit code 2 and a reason on standard error, and allow a covered one; the shell command refuses a destructive command; the dispatch command takes a slot; the secret guard refuses a secret path; the prompt command prints the routing reminder when plans are in flight; the after-tool command stamps the beacon; the two stop commands exit 0 with no batch and no queue; the subagent-stop command releases a slot
  And the number of commands run equals the number registered, and each command's wall time is recorded in the output
  Seen failing first: nothing starts from the registration today; every hook is started by its own file name.

- [ ] **Scenario: The dispatch matcher names the tool under both its names**
  Given the vendor renamed the subagent-launch tool from `Task` to `Agent`
  When the matchers are read
  Then the dispatch entry matches `Agent|Task`, and every matcher token in the file is on the suite's list of tool names taken from the vendor's tools reference, kept in one named place with the vendor address beside it
  Seen failing first: today the only token is `Task`.

### Story: The update path and the tree carry it

- [ ] **Scenario: The update command carries the registration and refuses a thin copy**
  Given the update command's list of required source files and its mirror
  When it mirrors a fixture marketplace copy without `hooks/hooks.json`
  Then it refuses and leaves the installed copy untouched
  And when the fixture has the file, the installed copy holds `hooks/hooks.json` afterwards
  Seen failing first: the required list names the manifest, `VERSION` and three command files, not the registration, so a copy without `hooks/` is accepted and the mirror prunes it from the installed copy.

- [ ] **Scenario: Nothing reads the old path, and the dead-code fence still sees every hook script as live**
  Given the reachability analyzer, the Doctor row and the two existing tests that read `.claude-plugin/hooks.json`
  When the registration moves
  Then the analyzer reads the new path, all fifteen registered scripts are live roots, and the recorded unreachable list is unchanged; both tests read the new path and keep the direction of their assertions (tightened, never loosened); no source or test names the old path except the negative assertion in the first scenario
  Seen failing first: the analyzer's manifest constant names the old path; what it does when that file is absent was not read, and the result is recorded at build time.

- [ ] **Scenario: The written claims match what is proven**
  Given the claims listed in the scope section
  When a check looks for the exact old sentences
  Then none remains: each claim states what is registered and where, or points to the on-screen verdict for whether it is running; the prompt hook's header no longer says Claude Code reads the registration from `.claude-plugin/hooks.json`; the deny emitter's header states the exit code the code uses and the vendor's rule that the reason travels on standard error; the session banner no longer says edits are blocked before step eight
  Seen failing first: each old sentence is present today.

### Story: The owner is told the truth

- [ ] **Scenario: A hook records who started it, and a hand run cannot pass for the harness**
  Given the real enforcement log captured byte for byte (today's 30 lines) as a fixture
  When a hook is run as the harness runs it (the plugin-root variable in its environment and a payload with a session identifier) and again by hand (neither)
  Then the first run's line records provenance "harness" with the session identifier, the tool-use identifier and, for a subagent, the agent identifier and type; the second records "manual"; every captured old line is still read and reads as provenance unknown; the shell hook's refusals are now recorded the same way, with a fixed-vocabulary reason and no command text; no hook's allow or deny decision changes
  Seen failing first: no provenance field exists and a hand run writes a line identical to a harness run; the captured last line is a hand run; the shell hook logs nothing when it refuses a destructive command.

- [ ] **Scenario: The verdict ignores hand runs, and "cannot tell" never reads as running**
  Given the captured log, whose newest line is a hand run, and a project whose plan-declared files changed after the newest harness-stamped line
  When the verdict is computed
  Then it is "not running", not "active"
  And with no harness stamp at all and no beacon it is "not confirmed on", never "running"; with an unreadable record it is "cannot read"; no combination of unknown or unreadable sources yields "running"
  And the wording for "no record" no longer says that is normal for a new project unless it also says protection is not confirmed on
  Seen failing first: today a hand-fired line resets the cutoff (the earlier plan's own recorded decision) and the no-record text reads "normal for a new project".

- [ ] **Scenario: The owner sees it where the owner already looks**
  Given the default start screen, the top of the classic dashboard, the System protection block and the Doctor health row
  When the verdict is anything other than "running"
  Then the first line of the default start screen says so in plain words, names the consequence (edits and shell commands are not being checked against your plans) and names one action; the Doctor row shows a cross for the same verdict; the Doctor row never shows a tick because the registration file exists
  And when the verdict is "running" one calm line shows the age of the newest harness activity in this project
  And the wording stays in the owner's vocabulary that the existing test already enforces: no hook names, no internal codes, no gate numbers
  Seen failing first: the Doctor row shows a tick on this tree today, and the default screen composed by the menu command carries no such line.

- [ ] **Scenario: When no hook runs at all, the assistant still says so**
  Given the project instructions file the assistant reads in every session whether or not any hook ran
  When a session begins and the session-start line "CTOC hooks live" is absent from the opening context
  Then the instructions direct the assistant to tell the owner so in its first reply, before any work; the sentence is in the managed operating-lessons block that every project receives on update (its template is named in the session-start hook's comments; I did not open it); and the session-start command prints the exact line the sentence names
  And a test asserts the sentence and the line agree (it proves the sentence ships, never that a model obeys it)
  Seen failing first: neither the sentence nor the line exists.

### Story: A live session proves it, with evidence the session cannot write

- [ ] **Scenario: The live-session proof is a recorded, repeatable procedure**
  Given a session that loaded the registration, either started with the vendor's session-only plugin-directory option inside a disposable project or the installed plugin after update and reload
  When the owner runs the script's prepare step in a terminal (outside the session), pastes its prompt into the session, saves the session's three tool results to a file, and runs the check step with that file
  Then prepare records `claude --version`, the installed plugin build, the `claude plugin list` line for CTOC and the prepare instant, refuses to issue any probe path that an approved plan covers, and prints a fresh random token with three probes: a write of a file in a new root-level folder named for the token; a shell `rm -rf` of a path named for the token that does not exist; a subagent told to attempt the write at a second path
  And check writes `.ctoc/verification/hooks-live.json` with one row per probe. The write row reads "proven" only when the probe file is absent and the log holds a line for that exact target stamped "harness". The shell row reads "proven" only when the supplied tool result shows CTOC's refusal and the log holds a harness-stamped shell refusal line between the prepare and check instants. The subagent row reads "proven" only when its target is absent and its log line is stamped "harness" with the agent identifier and type. All harness lines must carry the same session identifier
  And the owner's human-read evidence is recorded beside it: the `/hooks` screen text showing CTOC's commands by event and, if supplied, the debug log from `claude --debug-file`, which check scans for each registered command and its exit code
  And the overall result is "live", "not live" or "unknown", and the exit code is zero only for "live"
  And the Doctor screen shows the result with its date, the Claude Code version and the plugin build, and says "not verified for this build" when the installed build differs
  Seen failing first: the script, the record and the Doctor row do not exist. The suite drives the script against three fixtures (harness lines present; only manual lines; nothing) and the live run is the owner's recorded output.

- [ ] **Scenario: The same procedure proves a dispatched subagent is covered**
  Given the vendor statement that plugin hooks run inside subagents and carry the agent identifier and type
  When the subagent probe runs in the live session
  Then the probe's target is absent, its log line is stamped "harness" with the agent identifier and type, and the record says "subagent: proven"; if the line is missing the record says "subagent: not proven" and the overall result cannot be "live"
  Seen failing first: nothing records a subagent observation; the vendor sentence is not relied on without it.

### Story: What switching on will refuse is known first

- [ ] **Scenario: Every sanctioned flow is run through the real hooks, and every refusal is listed in full**
  Given the flows in the consequence table, the inline recipes extracted from the menu instructions by the recipe harness, a fixture CTOC project and a fixture directory that is not a CTOC project, each under the new-session state, the test-planted state and the step-fifteen state, and each once as the main session and once with an agent identifier present
  When each command string is sent to the real shell hook, each file target to the real edit hooks, and each trigger to the stop, session-start and dispatch hooks, as child processes with vendor-shaped payloads
  Then a committed record lists the verdict and the reason text for every cell, in full, refusals first; the prediction table in this plan is replaced by it; and a test fails if a sanctioned flow's verdict in the record differs from the answer the human gave to the strictness question
  And every refused sanctioned flow is either fixed in this plan (when the fix only adds a log field or corrects a comment) or written up as a question for the human
  Seen failing first: no such record exists; the forgery test plants the state that allows everything.

- [ ] **Scenario: The first live sweep of the plan folders is known in advance**
  Given this repository's real plan tree and the plan-folder sweep
  When the sweep's read-only violation list is computed for the implementation, todo and done folders
  Then the list, with each plan's reason, is recorded and shown to the human before the registration is released
  And the record states whether each violation would be reported only (no migration marker) or would move a plan
  Seen failing first: nothing computes or records it; the migration marker is absent today.

- [ ] **Scenario: A refusal always tells the model why**
  Given every refusing hook
  When each is driven to refuse, with exit code 2
  Then standard error holds a non-empty reason that names the target or the command class, and the test fails if any refusal leaves standard error empty
  Seen failing first: no test asserts this; the emitter's header describes a different exit code from the one its code uses.

## Definition of Done

- Every scenario above is a passing test in the gated suite (`npm test`, coverage floor held, zero skipped) or a recorded output committed with the plan's evidence, each seen failing first as stated.
- The live record exists for the main session and for a dispatched subagent, for the plugin build in use, and the owner has read the `/hooks` screen text in it.
- The Doctor screen and the default start screen show the verdict, and the owner has opened both and read the line.
- The consequence record is committed and the human has answered every open question below.
- Every claim listed in the scope section is corrected, and the old path is named nowhere except the negative assertion.
- Every new module is reachable from a live entry point in the same unit of work: the verification script is a declared human-run root like the claims verifier and is named on the Doctor screen; the verdict is called by the screens; the reachability baseline does not grow.
- Nothing in this plan crosses or bypasses a human approval moment, and no change to what a refusing hook decides was made without the human's answer.

## Scope

### In Scope

- The registration file at the vendor's location, its shape, and the dispatch matcher.
- The update command's required-source list and the readers of the old path (the Doctor row, the reachability analyzer, the two named tests).
- Provenance in the enforcement log and the beacon, the shell hook's refusal records, and a verdict that counts only harness stamps; the first-screen line (the default screen is built by the streaming gate screen function that the menu command calls, in `src/lib/streaming-gate.js`, named in `src/commands/start.js` and not opened), the System block, the Doctor row, and the dead-hooks sentence in the operating-lessons block.
- The verification script, its record, and the recorded live procedure.
- The consequence record, the first-sweep record and the refusal-reason test.
- Correcting these claims: the project instructions' present-tense statements that the pre-tool hook intercepts every edit, that both write channels check plan coverage, that the shell gate denies a payload it cannot read, that violations auto-revert plans, that the stop hook blocks a premature stop, that session start injects the resume directive and the question-dispatch directive, the key-entry-points rows for the shell hook and the plan-folder sweep, the architecture line that lists `hooks.json` under `.claude-plugin/`, and the statement that every decision is logged; the prompt hook's header; the deny emitter's header; the session banner's "blocked before step eight" text; and any matching statement in `README.md` and `docs/IRON_LOOP.md`, which I did not open, so the implementation planner lists them.
- A golden capture of today's real enforcement log and today's real registration file as fixtures, byte for byte, registered in the golden-corpus fence (named in the project instructions; I did not open its registry).

### Out of Scope

- Changing what a refusing hook decides (the shell step rule, the stop rules, the secret patterns, the approval-function refusal). These are the open questions; if the human chooses a change, that change is added to this plan's scope by the human's answer.
- New enforcement (for example refusing every indeterminate shell command under the coverage model). The project's instructions record that as its own human-approved policy; it is not part of this plan.
- Making the hooks a security boundary against an agent with an unrestricted shell. The project already states they guard against mistake and drift; forging a log line or the beacon stays possible and the record is evidence against accident, not against intent.
- Other plugins' hooks, and the post-commit git hook (a separate consent decision recorded in project initialisation).
- Migrating this project's approval ledger (a human-run script exists; this plan only reports the marker's absence).

## Risks

### Technical Risks

- **Declaring the registration twice disables the whole plugin.** If `plugin.json` also names the standard file, user reports say Claude Code refuses the plugin entirely. Likelihood: MEDIUM (an obvious-looking repair). Impact: HIGH (commands and skills vanish). Mitigation: Assert in the suite that the manifest has no `hooks` key naming the standard file, and run `claude plugin validate` and `claude plugin list` in the live procedure.
- **The running copy is the installed one, not the repository.** A fix in the tree does nothing in this repository's own sessions until released, updated and reloaded. Likelihood: HIGH. Impact: MEDIUM (a false belief that it is live). Mitigation: Record the plugin build in the live record, show "not verified for this build" on the Doctor screen, and use the session-only plugin-directory route in a disposable project for the first observation.
- **The shell hook's step rule may refuse CTOC's own menu in every new session.** Likelihood: HIGH by reading. Impact: HIGH (the product unusable once hooks load). Mitigation: Run the consequence record before the registration is released, and put the decision to the human as the strictness and non-CTOC-project questions.
- **A flat handler or an unaliased `Task` name may silently drop hooks.** Likelihood: MEDIUM. Impact: HIGH (a registered hook that never fires is the present defect again). Mitigation: Fix the shape and name both tool names in the registration, and make the live probe exercise session start and dispatch.
- **A hook slower than its timeout lets the call through.** Likelihood: LOW to MEDIUM (unmeasured). Impact: HIGH for a refusing hook. Mitigation: Record each hook's wall time in the run-from-registration test and in the debug log, and ask the human to read the slowest before release.
- **The menu's line can show activity from an earlier session.** The menu cannot know which session opened it. Likelihood: MEDIUM. Impact: MEDIUM. Mitigation: Show the age of the newest harness activity in words, never the bare word "running" without it, and rely on the session-start line and the assistant's first-reply sentence for "this session".

### Business Risks

- **Switching on affects every installed copy after its next update.** Likelihood: HIGH (the registration file is the switch). Impact: HIGH. Mitigation: Hold the release of the root registration until the human has answered the open questions, and describe the change in the release note in plain words.
- **A trusted-looking "running" line that is wrong.** Likelihood: MEDIUM. Impact: HIGH (the original defect, relocated). Mitigation: Test that unknown and unreadable sources can never yield "running", and test with the captured real log.

### Dependency Risks

- **Vendor behaviour not found in the text.** The default timeout, the flat-handler behaviour, the alias question and the session-only-copy interaction are undocumented in what I reached. Likelihood: HIGH that at least one matters. Impact: MEDIUM. Mitigation: Observe each in the live procedure and record the observation, and state in the record that it is an observation, not a documented guarantee.
- **The vendor may change the layout rule or the tool names again.** Likelihood: MEDIUM. Impact: MEDIUM. Mitigation: Keep the suite's vendor-derived allowlists in one named place with the vendor address beside them, and re-run the live procedure after each Claude Code update.

## Priority

**Priority: HIGH** (Score: 9/9)
- Dependency: HIGH (3) — every enforcement statement in the project's instructions, and the two earlier liveness plans, depend on the hooks being loaded.
- Business Impact: HIGH (3) — with the hooks off, the plan-coverage rule, the approval-ledger denies and the shell blocklist protect nothing.
- Technical Risk: HIGH (3) — switching on changes behaviour for sanctioned flows and for other projects, and the vendor behaviours above are undocumented.

## What was not verified

- Nothing was run. Every hook behaviour, every prediction in the consequence table and every count of files is read from source or from a file listing.
- Every vendor statement is the search tool's rendering, not page text. That Claude Code does not read `.claude-plugin/hooks.json` is inferred from the positive layout rule, the six plugins with a root registration on this machine, the absent beacon and a user report of the same defect in another plugin. It is not stated in the vendor text I reached.
- Which of the six root-registration plugins actually fire (the brief names two), and the installed Claude Code version. The third-party version numbers (2.1.255, 2.1.63) are as reported by users.
- What the vendor does with a handler placed directly under an event; whether the `Task` alias applies to hook matchers; the default hook timeout; the debug log's format; whether a user-scope plugin's hooks run in every project; how a session-only copy interacts with an installed copy.
- Who, in production, sets a named feature or a step of eight or more in the signed state; the contents of this project's own state file (its name is a hash I could not compute).
- How many plans in the implementation, todo and done folders would fail the sweep.
- The contents of the streaming screen builders, `README.md`, `docs/IRON_LOOP.md`, the golden-corpus registry and the operating-lessons template.
- The user-level Claude settings file, which I did not open; the brief's statement that it holds only a session-start entry naming nothing from CTOC is not re-checked.
- The git history search in the brief; I hold no way to run git.
- Whether the 18,150 files in `<home>/.ctoc/state/` (the count the listing reported) matter here. They are noted, not examined.

## Decisions Taken Under Ambiguity

1. **The registration moves to `hooks/hooks.json` at the plugin root; `plugin.json` gets no `hooks` key.** Reason: the vendor rule names that location and auto-loads it; declaring the same file again is reported to refuse the whole plugin; six plugins on this machine use it. Would flip if the live procedure shows the root location is not loaded; then a differently named file declared in the manifest is tried, never the same file twice.
2. **The old file is deleted, not kept as a second copy.** Two copies drift, and a copy left in `.claude-plugin/` invites the manifest route that refuses the plugin.
3. **The session-start entry becomes a matcher group with no matcher, so it runs for every start source.** Reason: the banner and the resume directive are wanted on start, resume, clear and compact alike.
4. **The dispatch matcher is `Agent|Task`.** Reason: it is harmless if the alias works and necessary if it does not; the vendor documents the vertical bar for several tool names.
5. **The suite proves the chain from registration to effect and cannot prove that Claude Code invokes it; the live procedure does, and is its own recorded artifact.** The two are stated separately everywhere so a green suite is never read as a live proof.
6. **The live script runs in the owner's terminal, not in the session.** Reason: by reading, a working shell hook would refuse the script itself under the new-session state, and the session must not author the evidence. The session only performs the three probes.
7. **Each probe is harmless if the protection is off.** The write creates an empty file in a folder named for the token that the owner removes; the shell probe removes a path that does not exist; the prepare step refuses any probe path an approved plan covers, so a covering plan cannot turn a live hook into a false "not live".
8. **Provenance is decided by two facts the vendor documents: the plugin-root variable is exported to hook processes and absent from commands the Bash tool runs, and the payload carries a session identifier.** Old lines read as unknown and are never counted. This separates accident from harness; it does not stop deliberate forgery, which this project already places outside what the hooks can prevent.
9. **The verdict gains a fourth state, "not confirmed on", for a project where no harness stamp has ever been seen.** Reason: "cannot tell" and "normal for a new project" hid this outage.
10. **The existing rule that rendered text uses the owner's words (no hook names, no internal codes) stays.** The screen says "protection", not "hooks".
11. **A change that only adds a log field or corrects a comment in a hook is in scope; a change to what a hook decides is a question.** Reason: hook and gate logic is safety-critical and the human's to approve. The shell hook recording its own refusals is a log addition.
12. **Predictions in the consequence table are labelled predictions and are replaced by the recorded run.** They are there so the human can see the size of the question before anything runs.
13. **The golden captures keep the machine's home-directory paths unredacted.** Reason: the project's golden-corpus rule forbids redaction, and committed plans already contain such paths. Would flip if the human prefers the variant recorded as not captured.
14. **The menu line reports the age of the newest harness activity in the project and does not claim to know the current session.** Reason: the menu runs as a child of a tool call and is not told the session identifier. The per-session statement is carried by the session-start line and the assistant's first-reply sentence.
15. **Priority is high and effort is large.** The score is the maximum on all three factors.

## Open Questions For The Human

No recommendation is made on any of these. Each is yours to decide.

### Question 1 — How strict the hooks are at the moment they first take effect

The hooks that can refuse a tool call, hold a turn or move a plan are: the edit, write, multi-edit and notebook-edit hooks, the shell hook, the dispatch hook, the secret guard, the plan-folder sweep and the two stop hooks. The ones that cannot are session start, the prompt reminder, the two after-tool hooks and subagent stop. By reading, with the shell rule as written, the menu command and every program or task-runner command is refused in a new session's state.

| Option | Pros | Cons |
|---|---|---|
| 1. All fifteen registered, every hook exactly as written today | The refusals you designed are the refusals you get; each hook's logic is already fenced by tests | By reading, the menu command and every `node` or `npm` command is refused in a session whose state names no feature; a turn can be held by the stop hook |
| 2. All fifteen registered, with the existing soft setting applied to this repository | Uses an existing, tested switch; edit refusals become warnings recorded in the log so you can read what would have been refused | The soft setting relaxes only the edit channel; the shell, dispatch, secret guard, protected-store denies and stop hooks act as in option 1, so some protection you believe on is partly off |
| 3. All fifteen registered, with the shell hook's step rule changed so program and task-runner commands are judged by plan coverage only | Sanctioned flows stop being refused by session state; the coverage rule on determinate writes stays | Changes safety-critical hook logic; differs from the state the tests plant today, so those tests change too |
| 4. Register only the hooks that cannot refuse or hold anything; register the others when you say so | You see the live signal and the recorded would-have-refused list before anything can refuse you | Edits stay unchecked meanwhile; "hooks registered" is true for only some, which the on-screen verdict must say exactly |

### Question 2 — Projects that are not CTOC projects

The plugin is installed for the whole user account on this machine. The shell hook and the secret guard do not check that a directory is a CTOC project; the edit and dispatch hooks do. Session start scaffolds folders in any git repository.

| Option | Pros | Cons |
|---|---|---|
| 1. Leave as written | No change to hook logic; one rule everywhere | By reading, the shell rule refuses program and task-runner commands in unrelated projects, and session start writes into every git repository you open |
| 2. The shell hook, the secret guard and session start do nothing in a directory CTOC does not manage, the same rule the edit hook uses | Unrelated projects are left alone; consistent with the edit hook | Changes safety-critical hook logic; the secret guard stops protecting secrets in projects CTOC does not manage |
| 3. Leave the hooks as written and install CTOC for chosen projects only, not the whole account | No hook change; you choose where protection applies | Changes how CTOC is installed and documented; a project you forget to add is unprotected without any hook saying so |

### Question 3 — What a session may do while protection is known to be off

"Off" means the verdict reads not running, not confirmed on, or cannot read.

| Option | Pros | Cons |
|---|---|---|
| 1. Tell only: the verdict and the assistant's first reply say so | No new refusals; nothing you want to do is blocked | Work continues unprotected; it relies on you acting on the line |
| 2. Tell, and the menu refuses to cross any of your approval moments while the verdict is not "running" | The moments that are yours stay yours when the hooks that guard them are off | A dead hook system or an unreadable record blocks approvals you want to make; it changes how the approval routes behave |
| 3. Tell, and the assistant is instructed to make no edits until you say to continue | Stops unprotected edits without menu code and works even when no hook runs | A written instruction only, which nothing enforces; it slows every session that starts with protection off |

### Question 4 — The stop hooks

One hook refuses to let a turn end while approved plans wait in the todo folder (up to 100 consecutive no-progress refusals, with an environment-variable escape); the other runs the test suite before a turn ends, off unless switched on in settings.

| Option | Pros | Cons |
|---|---|---|
| 1. Register both as written | Building keeps going as the project's instructions describe; the test hook stays opt-in | In this repository each attempt to end a turn can be refused many times in a row while approved plans wait |
| 2. Register only the test hook | No turn is ever held; the opt-in test gate stays available | The "building must not stop" rule stays unenforced in live sessions |
| 3. Register neither | Nothing can hold a turn; fewest moving parts | Both stop rules in the project's instructions stay unenforced |

### Question 5 — Approval routes that the instructions describe as inline programs

By reading, the shell hook refuses, at every state, any inline program that names the approval functions. The menu instructions tell the session to call them for a single approval, for all-to-todo and for all-done. An argument-driven route exists for a single approval through the menu command; whether one exists for the batch forms was not established.

| Option | Pros | Cons |
|---|---|---|
| 1. Add an argument-driven route for each refused approval action, so the instructions and the hook agree | The session can carry out your approvals without an inline program | A new path into the approval moments needs the same review as any path into them |
| 2. The batch approvals are made only by you through the menu screens' own keys; the instructions say the session never runs them | Smaller surface; clearer ownership | Changes how all-to-todo and all-done work today |
| 3. Leave as is and record the refusals as known | No change to any approval path | The instructions and the hook contradict each other; the session will try and be refused |
