---
title: "The file guard blocks the common credential files, not only .env, .ssh and .aws"
type: functional
status: functional
created: 2026-10-02
priority: high
effort: small
depends_on: none
files:
  - src/hooks/guard-files.js
  - tests/guard-files-coverage.test.js
---

# The file guard blocks the common credential files, not only .env, .ssh and .aws

## 1. ASSESS — Problem Understanding

### What the human decided

On 2026-10-02, after the security scan of the deepthink skill, the human decided to add the common credential files to CTOC's file-protection hook, as a hook change with its own plan and explicit approval. (Relayed in the dispatch for this plan; not a verbatim quote.) The scan had found that the guard blocks `.env`, `.ssh/` and `.aws/` and allows `~/.netrc`, `~/.npmrc` and `~/.config/gh/hosts.yml`.

Job to be done: when a session's model can call tools on my machine, I want a read or an edit of a sign-in or token file refused before it happens, so that no registry, code-hosting, container or cloud credential ever enters the model's context.

### What is true on disk today

Everything below was read from the file named. Nothing was run; this plan was written by an agent that holds no way to execute programs, so every statement about behaviour is "by reading", not "observed".

1. **What the guard blocks.** `src/hooks/guard-files.js:40-69` holds 11 case-insensitive literal regular expressions: the `.env` family (minus `.env.example`, `.env.sample`, `.env.template`), `.envrc`, `secrets.*`, a path segment that starts with `credentials` (`:52`), `id_*` key files, `.pem` and `.key` (`:56`), `.kube/config` (`:57`), `.aws/` (`:58`), `.ssh/` (`:59`), token files (`:64`), and `.secret` (`:68`). I checked the human's list against all 11 by reading each expression: `.netrc`, `_netrc`, `.npmrc`, `.pypirc`, `.git-credentials`, `.config/gh/`, `.docker/config.json`, `.m2/settings.xml`, `.gnupg/` (apart from its `.key` files), `.azure/` and `.config/gcloud/` match none, so they are allowed. This agrees with the scan.
2. **Five names on the human's list are already blocked, by reading.** `.kube/config` has its own pattern (`:57`), its own test case (`tests/guard-files-coverage.test.js:75`) and a Windows-path case (`:142-151`). `.cargo/credentials`, `.cargo/credentials.toml`, `.gem/credentials` and `.terraform.d/credentials.tfrc.json` each contain a path segment that starts with `credentials`, which pattern `:52` catches. `.git-credentials` is not caught: the segment starts with `.git-`, and the file's own comment (`:48-51`) deliberately lets names like `get-credentials.ts` through. So the question "does `.kube/config` count" is already answered: it counts, today.
3. **How it decides.** The target is the single string `"<file path> <command>"` (`:103-107`), backslashes are turned into slashes (`:79`), and any pattern that matches anywhere in that string refuses the call. A shell command is therefore judged by its whole text, including a commit message that merely names a protected file (the hooks-loaded plan observes the same at `plans/functional/ctocs-hooks-are-actually-loaded-by-claude-code.md:276-284`).
4. **How it refuses.** It writes a banner that lists the protected families (`:115-121`), then `emitDeny` (`src/lib/hook-deny-signal.js:90-101`) writes the deny decision and exits with code 2. An internal error allows the call (`:129-133`). The file imports only `fs` and the deny emitter (`:33-34`): it reads no enforcement mode and no conversation transcript. So `enforcement.mode` and the escape phrases (`CLAUDE.md:139-155`) cannot lift it; the refusal is already absolute at every mode, by construction.
5. **Which tools reach it.** `.claude-plugin/hooks.json:84-92` attaches the guard to `Read|Edit|Write|Bash` only. `MultiEdit` and `NotebookEdit` have their own entries (`:48-65`) that run the plan-coverage hooks, not the guard. `Grep` has none. The guard already reads a `path` field (`guard-files.js:106`), but the registration never sends it a `Grep` call.
6. **The test that pins the list.** `tests/guard-files-coverage.test.js` has a blocked cluster of 26 rows (`:57-96`), an allowed cluster of 15 look-alike names (`:105-133`), three Windows-path cases, three empty-target cases, a list-size floor of 10 (`:181`), and 13 cases that start the hook as a real process (`:194-328`). Its header (`:50-56`) states the design: each blocked row uses a path that only its own pattern matches, so deleting a pattern turns exactly its rows red. Counted by reading.
7. **The rule.** `CLAUDE.md:885` lists, among things not to change without explicit human approval, any change that "would modify hook behavior or gate logic". This plan changes what a refusing hook decides. It is that approval request; nothing here pre-approves it.
8. **Whether the guard runs at all is open.** `plans/functional/ctocs-hooks-are-actually-loaded-by-claude-code.md:40-42` records that in the session observed on 2026-09-30 none of CTOC's hooks ran, and that the registration sits in `.claude-plugin/hooks.json` while the vendor's documented location is `hooks/hooks.json` (the vendor statement is in its table at `:198-199`). I did not re-verify that. The same plan notes the secret guard has no check that a directory is a CTOC project, and that the plugin is installed for the whole account (`:285`).

### The problem in one paragraph

The guard refuses the credential files its authors thought of and not the ones a developer actually has: the registry token in `~/.npmrc`, the machine login in `~/.netrc`, the code-hosting token in `~/.config/gh/hosts.yml`, the container-registry login in `~/.docker/config.json`, and the cloud and signing-key folders. A model asked to "check why publishing fails" can read any of them and carry the secret into its context, its logs and its summaries.

## 2. ALIGN — Approach

Add one literal pattern per credential location below, in the same style as the existing ones (case-insensitive, no pattern built from data), extend the refusal banner so it names the new families, and extend the existing test file. No new module, no new test file, no setting. The implementation plan must show the exact expressions at its own approval moment.

### The credential locations, each checked

"Verified" means a vendor or project page appeared in the search results for the claim; the search tool rendered it, I did not open the page. "Believed" means recalled or from a user report, not confirmed on a vendor page. You can strike any row.

| # | Pattern | What it holds | Source | Label | Guard today (by reading) |
|---|---|---|---|---|---|
| 1 | `.netrc` | machine, login and password, plain text | https://everything.curl.dev/usingcurl/netrc.html | verified | allowed |
| 2 | `_netrc` | the same file on Windows ("two filenames ... `.netrc` and `_netrc`") | same page | verified | allowed |
| 3 | `.npmrc` | `_authToken`, `_auth`, `_password` per registry | https://docs.npmjs.com/cli/v9/configuring-npm/npmrc/ | verified | allowed |
| 4 | `.pypirc` | repository username and password, plain text | https://packaging.python.org/en/latest/specifications/pypirc/ | verified | allowed |
| 5 | `.git-credentials` | `https://user:password@host`, plain text | https://git-scm.com/book/en/v2/Git-Tools-Credential-Storage | verified | allowed |
| 6 | `.config/gh/` (covers `hosts.yml`) | a sign-in token when the system keyring is not used | https://github.com/cli/cli/issues/7757 (user report) | believed; the manual page was not opened | allowed |
| 7 | `.docker/config.json` | base64 `auth` entries unless a credential store is configured | https://docs.docker.com/reference/cli/docker/login/ | verified | allowed |
| 8 | `.cargo/credentials.toml`, `.cargo/credentials` | registry tokens, plain text | https://doc.rust-lang.org/cargo/reference/config.html | verified for `.toml`; extensionless name believed | already blocked |
| 9 | `.gem/credentials` | the publishing key; the tool insists on mode 0600 | https://docs.ruby-lang.org/en/3.2/Gem/ConfigFile.html | verified | already blocked |
| 10 | `.m2/settings.xml` | server usernames and passwords, plain unless encrypted; also mirrors, proxies and profiles (more than credentials) | https://www.sonatype.com/maven-complete-reference/settings-details | verified for passwords | allowed |
| 11 | `.kube/config` | client certificates, keys, tokens | https://www.redhat.com/en/blog/kubeconfig | verified; official page not opened | **already blocked, no change** |
| 12 | `.gnupg/` | secret keys under `private-keys-v1.d/`; also the public keyring and configuration | https://www.gnupg.org/documentation/manuals/gnupg/GPG-Configuration-Options.html (home folder only) | key location believed | `.key` files only |
| 13 | `.terraform.d/credentials.tfrc.json` | access token, plain text | https://www.terraform.io/cli/commands/login | believed | already blocked |
| 14 | `.azure/` | the sign-in token cache `msal_token_cache.json` | https://learn.microsoft.com/en-us/cli/azure/use-azure-cli-successfully-tips?view=azure-cli-latest (folder), https://github.com/Azure/azure-cli/issues/27176 (file) | folder verified; file believed | allowed |
| 15 | `.config/gcloud/` | `application_default_credentials.json`; `credentials.db` and `access_tokens.db` | https://cloud.google.com/docs/authentication/application-default-credentials | first verified; the two databases believed | the first file allowed |

Rows 8, 9 and 13 need no new pattern if you only want the file blocked. They still get a test row each, to pin that a later narrowing of the `credentials` carve-out cannot silently unblock them. Row 11 already has its cases.

### Found while verifying — not on your list; strike any

- **The Maven master-password file.** `.m2/settings-security.xml` holds the master password that decrypts the encrypted server passwords in row 10 (https://www.sonatype.com/blog/2009/10/maven-tips-and-tricks-encrypting-passwords, verified). Folded into row 10's pattern.
- **The two Windows locations.** Windows keeps two of these elsewhere: `%APPDATA%\GitHub CLI\hosts.yml` (believed, from a search summary) and `%APPDATA%\gcloud\` (https://cloud.google.com/docs/authentication/application-default-credentials, verified). Rows 6 and 15 protect macOS and Linux only without them. Two extra patterns.

## 3. CAPTURE — Acceptance Criteria

**As the** owner, **I want** a tool call that targets a sign-in or token file to be refused, **so that** no model reads my registry, code-hosting, container or cloud credentials into its context.

**As the** owner, **I want** the refusal to name the kind of file, **so that** a blocked `.npmrc` is not explained as an `.env`.

Each scenario is a case in `tests/guard-files-coverage.test.js`. Where a case is green before the change, the build says why.

1. **Every kept row is refused.** GIVEN each row of the table that you keep (rows 1 to 15 and the two additions), WHEN a path containing it reaches `isSecretTarget`, THEN it answers true. One case per row, in the blocked cluster. Each case's path is one no pre-existing pattern matches, so deleting that row's pattern turns that case, and only that case, red. Prediction from reading, to be confirmed by the first run: **12 cases red** (rows 1 to 7, 10, 12, 14 and 15, with row 6 given two cases: `hosts.yml` and another file under `.config/gh/`) and **4 cases green on arrival** (row 8 twice, rows 9 and 13, already caught by `guard-files.js:52`), plus 3 more red cases if you keep my three additions. Any other split means my reading is wrong and is reported as a finding, not absorbed.
2. **The real hook refuses.** GIVEN a payload for `Read` of `~/.netrc`, `Edit` of `~/.config/gh/hosts.yml`, `Write` of `~/.docker/config.json`, and `Bash` running `cat ~/.npmrc`, WHEN the hook is started as its own process, THEN each exits with code 2, prints the deny decision on standard output, and prints the refusal banner on standard error.
3. **Windows paths are refused.** GIVEN `C:\Users\me\_netrc` and `C:\Users\me\.docker\config.json` (and the two Windows locations if kept), WHEN matched, THEN true.
4. **No enforcement mode lifts it.** GIVEN a project whose `.ctoc/settings.yaml` sets `enforcement.mode` to `off`, and again to `soft`, WHEN the hook is started as a process in that folder with a payload reading `~/.netrc`, THEN it still exits with code 2. Green on arrival by design: it pins a property of today's code (finding 4) against a later edit that adds a mode check.
5. **Nothing that was decided before changes.** GIVEN the case names in the test file captured before the first edit, THEN every name is still present with its assertion unchanged and all pass: the 26 blocked rows, the 15 allowed rows, the Windows, empty-target and process cases.
6. **Look-alike names stay allowed.** GIVEN `src/lib/netrc-parser.js`, `docs/npmrc-guide.md`, `docs/git-credentials.md`, `.dockerignore`, `.config/ghostty/config` and `.config/gcloudignore`, THEN none is refused. Each is a case in the allowed cluster.
7. **The refusal names the new families.** GIVEN a blocked read of `~/.npmrc`, WHEN the banner is printed, THEN it names each new family (`.netrc`, `.npmrc`, `.pypirc`, `.git-credentials`, `.config/gh/`, `.docker/config.json`, `.m2/`, `.gnupg/`, `.azure/`, `.config/gcloud/`) alongside the existing ones.
8. **A project's own `.npmrc` is refused** (encodes option A of question 1 as a working default so it is testable; it changes with your answer). GIVEN `my-app/.npmrc`, THEN true.
9. **Only if question 2 is answered with option B:** GIVEN a `Grep` call whose path is `~/.npmrc`, and `MultiEdit` and `NotebookEdit` calls targeting `~/.netrc`, WHEN the hook is started as a process, THEN each exits with code 2.

## Definition of Done

- The new cases were written first, run, and seen failing exactly as scenario 1 predicts. The four greens are each accounted for in the record.
- For each new pattern, one recorded run with that pattern removed shows its own case red and no other new case red; the pattern is then restored.
- Scenarios 1 to 8 pass, and the whole quality check (`npm test`) passes with the coverage floor unchanged and no skipped test.
- The final report states what was and was not shown. It says "the guard refuses these paths when started by its file name" and does not say "these files are protected in a session" until the live-session proof described by the hooks-loaded plan (its acceptance criteria around `:403-417`) has recorded this guard firing for the plugin build in use. A green suite proves the first sentence only.
- Nothing new to wire: the guard is already registered (`.claude-plugin/hooks.json:84-92`), so the reachability rule is met without a follow-up. If question 2 is answered with option B, the matcher change is made in the same unit of work.

## Scope

### In Scope

- The patterns for the rows you keep, in `src/hooks/guard-files.js` (scenarios 1, 3, 8).
- The banner text naming the new families (scenario 7).
- Cases in the existing test file for blocked, look-alike, Windows and process behaviour (scenarios 1 to 6).
- The matcher in `.claude-plugin/hooks.json`, only if question 2 is answered with option B.

### Out of Scope

- A per-project allowlist for a file a project legitimately needs read. Not planned; a separate plan if you want it.
- You reading these files with your own commands outside a session. The guard only sees tool calls made in a session.
- A configuration folder moved by its tool's environment variable (`GH_CONFIG_DIR`, `DOCKER_CONFIG`, `CARGO_HOME`, `KUBECONFIG`, `GNUPGHOME`, `AZURE_CONFIG_DIR`), and obfuscated spellings (`cat ~/.net*`). A text guard stops mistakes, not intent; the hooks-loaded plan says the same of all hooks (`:467`).
- Secrets inside file contents, commit messages or environment variables. `src/lib/secrets-scanner.js` is a separate content scanner; this plan does not touch it.
- Making the hooks load at all, and whether the guard does nothing outside CTOC-managed folders: `plans/functional/ctocs-hooks-are-actually-loaded-by-claude-code.md`, its question 2 (`:545-553`).
- Changing `.kube/config` or any existing pattern.

## Technical dependencies (stated as facts, not as a schedule)

- **A guard that is not loaded protects nothing.** This plan can be built, tested and merged without the hooks-loaded plan, and its suite will be green. Its value in a real session starts only when that plan (or another fix) makes Claude Code load the registration. If the guard is not loaded today, as that plan records, then after this plan lands the owner is exactly as exposed as before.
- **The edited hook reaches a session only from the installed plugin copy.** The command is `${CLAUDE_PLUGIN_ROOT}/src/hooks/guard-files.js` (`hooks.json:89`); the hooks-loaded plan records that the running copy is the installed one (`:476`). A repository edit changes nothing in this repository's own sessions until published, updated and reloaded.
- **File overlap, if question 2 is answered with option B.** That plan deletes `.claude-plugin/hooks.json` and recreates the registration at `hooks/hooks.json` (its `files:` at `:9-11`). Two plans declaring the same file are built one at a time; the second must edit wherever the registration then lives.
- **The human's answer to that plan's question 2** (a secret guard that does nothing outside CTOC-managed folders) decides where these new patterns apply at all.

## Risks

- **Over-refusal of commands that only name a file.** The guard judges the whole command text (finding 3), so `git add .npmrc` or a commit message naming `.pypirc` is refused. Likelihood: HIGH in Node projects, which I believe commonly commit an `.npmrc`. Impact: MEDIUM (a human edits those outside the session). Mitigation: scenario 6 pins that look-alike names stay allowed; question 1 is the decision about the committed project file.
- **Directory rows refuse harmless files too** (`.gnupg/pubring.kbx`, `.config/gh/config.yml`, `.azure/azureProfile.json`), as `.aws/` and `.ssh/` already do (`:58-59`). Likelihood: HIGH. Impact: LOW. Mitigation: you chose directories on 2026-10-02; strike a row if a narrower pattern is wanted.
- **Credentials read through a tool the guard is not attached to.** Likelihood: MEDIUM (`Grep` returns matching lines). Impact: HIGH. Mitigation: question 2.
- **A vendor moves a file** (the code-hosting tool already prefers the system keyring). Likelihood: MEDIUM over time. Impact: LOW (a stale row only over-blocks). Mitigation: the table carries its sources and the date 2026-10-02; the corpus claim checker covers skill guides under `skills/`, not this list, so nothing re-checks it automatically.

## What was not verified

- Nothing was run. Every "allowed", every "already blocked" and the 12 red / 4 green prediction is from reading eleven regular expressions against sixteen names. A wrong reading of one expression moves a row between red and green.
- Vendor pages were not opened; every "verified" is a search-result rendering. The Kubernetes official page, the Maven settings page and the GitHub CLI manual page were not seen.
- Whether the installed Claude Code loads the guard (finding 8), and which version is installed.
- Whether the `Grep` tool carries its target in a field named `path` (believed).
- `README.md` was not read; it may list the protected families. `src/hooks/PreToolUse.Bash.js` was not read for its own credential-path rules. Agent, skill and command texts were not checked for instructions that name these files; the implementation planner must, and any hit is a conflict the human is told about.
- `tests/enforcement-mode.test.js` (first 120 lines) and `tests/hook-payload-single-source.test.js` (first 60 lines) were read; the first does not name the secret guard in that range, so finding 4 rests on the guard's imports, not on that test.

## Decisions Taken Under Ambiguity

1. **Literal, case-insensitive expressions only, anchored at the start of a path segment where the name is a bare file name** (`.netrc`, `_netrc`, `.npmrc`, `.pypirc`, `.git-credentials`), substring match for the folder and file-path rows. Same style as the existing list (`guard-files.js:25-27`); no home-folder lookup. Not chosen: a home-folder-aware check, which is question 1 option B.
2. **Directory rows block everything under them**, as `.aws/` and `.ssh/` do. Not chosen: file-by-file rows; you named directories.
3. **`.kube/config` unchanged**, no new row beyond its existing cases.
4. **The list-size floor of 10 (`:181`) is left alone.** Each new row has its own case that fails when the row is deleted, so a higher floor adds nothing; raising it would be a tightening and is allowed if the reviewer wants it.
5. **The two additions under "Found while verifying" are included unless you strike them.** Cost: scope beyond your list, three extra cases.
6. **The refusal reason sent to the model (`:125`) stays generic**; only the banner lists families.
7. **Scenario 8 encodes option A of question 1** so every scenario is testable now.
8. **`priority: high` and `effort: small` are the dispatch's settings**, not scored here.
9. **No `CLAUDE.md` or count edit.** No test file, module, agent or skill is added, and `CLAUDE.md` (read in full today) does not describe the guard's pattern list.

## Open Questions For The Human

No recommendation is made on either. Both are yours.

**Question 1 — A project's own `.npmrc`: refuse it wherever its name appears, or only in your home folder?**

The guard compares text and cannot tell `~/.npmrc` from a committed `my-app/.npmrc`. The plugin is installed for the whole account, so this also applies in projects that are not CTOC's.

| Option | What happens | Pros | Cons |
|---|---|---|---|
| A. Anywhere the name appears | Same rule as `.env`: one literal pattern. | One rule; a relative path or a `cd` cannot slip past it. | A committed project `.npmrc` (registry settings, usually no secret) cannot be read or edited by the model, and neither can any shell command naming it, such as `git add .npmrc`. |
| B. Only in your home folder | The guard compares against your home folder before refusing. | A project's `.npmrc` stays editable. | A new mechanism the file does not have today (it forbids data-derived patterns, `guard-files.js:25-27`); `cd ~ && cat .npmrc` has no home path in its text and slips past. |
| C. Home folder only for `.npmrc`, anywhere for the rest | Two rules in one list. | The one commonly committed file stays editable; the rest keep one rule. | The list no longer reads as one idea; a project-level `.pypirc` or `.netrc` is still refused. |

**Question 2 — Tools that read or change file contents but are not attached to the guard.**

The guard is attached to `Read|Edit|Write|Bash` (`hooks.json:85`). `Grep` can return the matching lines of a credential file. `MultiEdit` and `NotebookEdit` change files and run only the plan-coverage hooks.

| Option | What happens | Pros | Cons |
|---|---|---|---|
| A. Leave the matcher alone | This plan changes the list only. | No change to hook wiring; no overlap with the hooks-loaded plan's file. | `Grep` can still read a credential file's lines; `MultiEdit` and `NotebookEdit` can still change one. |
| B. Add `Grep`, `MultiEdit` and `NotebookEdit` to the matcher in this plan | Scenario 9 applies. | The list's protection covers every tool that touches file contents. | A second hook-wiring change in a small plan; it edits the registration file the hooks-loaded plan is moving, so the two builds run one at a time. |
| C. Do the matcher in its own plan | This plan stays the list. | Each hook change is approved on its own; it can follow the hooks-loaded plan's move of the registration. | The gap stays open until that second plan is built. |

**Question 3 — Whether anything other than an instruction stops the web-fetch tool at internal addresses.** (Added 2026-10-02 from the security scan of the deepthink web-only reading agent, `.ctoc/audit/deepthink-run-notes/s5-step13-secure-d-deepthink-s5-step13-secure.md`, finding 8.)

No CTOC hook watches `WebFetch`. The tool itself upgrades `http` to `https`, refuses a host name without a dot (which also stops `file:` and `localhost`), refuses an address carrying a user name or password, and follows a redirect only within one host. It has no check against private addresses: `https://10.0.0.5/`, or a public name that resolves to an internal address, is stopped only by the agent's own instruction and, in practice, by certificate checking. The scanner read the tool's code and did not execute it.

| Option | What happens | Pros | Cons |
|---|---|---|---|
| A. Leave it as an instruction plus `https` and certificate checking | No change. | Nothing to build; an internal server would need a valid certificate for the attacker's name. | An instruction is not a fence; a server with a valid certificate on an internal name is reachable. |
| B. A `PreToolUse` hook for `WebFetch` that refuses private address ranges and local-only suffixes | A second hook, wired beside this plan's guard. | Mechanical for address literals and obvious names. | A hook change, so its own plan and approval; it cannot see what a public name resolves to without a lookup of its own; it depends on the hooks being loaded at all. |
