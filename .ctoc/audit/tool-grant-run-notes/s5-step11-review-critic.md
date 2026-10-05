**Verdict: kick back.** Two sentences are wrong, both in the new Bash paragraphs of the two set-up agents. Neither fix touches a pinned test sentence or a limit. I hold only Read and Grep, so I ran nothing: every test result below is the executor's record, not mine.

## Blockers

**1. `<home>/Code/ctoc/agents/infrastructure/ci-runner-setup.md`, line 20: "one thing only" is false against the agent's own orders.**

- Lines 175 to 180 of the same file send the agent to the method file for the Actions Runner Controller and GitLab Runner Helm paths, and line 3 dispatches it on those words.
- That path (`<home>/Code/ctoc/skills/infrastructure/ci-runner-setup/SKILL.md`, lines 203 to 253) is two `helm install … oci://ghcr.io/actions/…` commands plus `kubectl` against the user's cluster.
- Those are neither "the runner from GitHub's own release pages" nor "the commands in the Setup Wizard Steps below", and "no package downloaded to run" forbids them.

Old:
> Your Bash reaches the network for one thing only: downloading the runner from GitHub's own release pages and registering it, with the commands in the Setup Wizard Steps below, after the user chose a self-hosted or hybrid runner.

New:
> Your Bash reaches the network for one thing only: installing and registering the runner the user chose. That is the runner download from GitHub's own release pages with the commands in the Setup Wizard Steps below, or, when the user chose the Actions Runner Controller path, the chart install from GitHub's own container registry and the `kubectl` commands against the cluster the user named, as written in the Setup Wizard Steps of `skills/infrastructure/ci-runner-setup/SKILL.md`. Either happens only after the user chose a self-hosted or hybrid runner.

I recommend this wider wording because it keeps what the agent could already do, and the index's stated limit ("Bash downloads from GitHub") covers it. The narrower alternative is to order the agent to show those commands and never run them; that removes a behaviour the plan did not ask to remove.

**2. `<home>/Code/ctoc/agents/infrastructure/deployment-setup.md`, line 18: "the dry run" is named as a network use, which is untrue.**

- Line 490 of the same file defines it as "simulate — build commands, execute nothing".
- `<home>/Code/ctoc/src/lib/deployment.js` returns before any push or POST when not live (lines 278, 381, 398, 422).

Old:
> Your Bash reaches the network only for what the user configured and confirmed: the dry run, the git branch checks and the webhook connectivity test of Post-Setup Verification, against the remote and the URL the user gave you.

New:
> Your Bash reaches the network only for what the user configured and confirmed: the git branch checks and the webhook connectivity test of Post-Setup Verification, against the remote and the URL the user gave you. The dry run reaches no network: it builds the commands and executes nothing.

In the same pass, the comment at `<home>/Code/ctoc/tests/agent-tool-grants.test.js` line 456 should change "the one network use each body names" to "the network uses each body names".

## Findings on the slice's goal (not blocking)

- **`deployment-setup`, lines 516 to 534 (Post-Deploy Verification).** "After each deployment, run these checks" orders health-endpoint and certificate checks that the new sentence forbids. I read them as advice for the user's pipeline. One sentence on line 18 would settle it: "The checks under Post-Deploy Verification are for the pipeline the user runs; you do not run them."
- **`changelog-generator`, line 20 (the new paragraph), two gaps.**
  - "The first existing version heading" does not say whether `## [Unreleased]` counts. Lines 69 and 79 put it first, so a literal reading inserts the release above it.
  - Line 32 (`npx conventional-changelog … -i CHANGELOG.md -s`) and the method file's lines 76, 83, 90 and 93 write `CHANGELOG.md` themselves. Following one and then the paragraph gives two entries for one release.
  - Proposed text: "Put the curated entry into `CHANGELOG.md` with `Edit`, after a fresh `Read`: the `old_string` is the first released-version heading (the first `## [x.y.z]` line, below `## [Unreleased]`) and the `new_string` is the new entry followed by that same heading. If a command from the Commands section has already written its draft into `CHANGELOG.md`, curate that entry where it stands with `Edit` instead of adding a second one. Create `CHANGELOG.md` with `Write` only when it does not exist; never rewrite an existing changelog whole."
- **`documentation-updater` is the one agent ordered to use a tool it lacks.** It holds no Bash, yet:
  - its body (lines 136 to 141) orders "Generate docs from code where possible";
  - its method file orders "Regenerate from OpenAPI / Javadoc / TypeDoc / Sphinx" (line 66);
  - the method's checklist requires "`lychee` passes", "Vale passes" and a docstring-coverage number (lines 431 to 433).

  The executor's method-file reading judged Write only. This slice takes the agent off the debt list, so record a decision. I recommend no new grant here, since Bash is not in the approved table and the security scan has not seen it. Instead add one sentence after line 141: "You hold no command tool. Where this file or the method file calls for something that takes a command — regenerating reference pages with a generator, a link check, a prose check, a docstring-coverage number — name the command in your report for the executor to run, and never write a percentage or a "passes" you did not see."

## The six checks

| Check | Result |
|---|---|
| Changed passages match the plan or a recorded decision | Yes. Tools lines, the three body edits and the test edits match word for word; the search sections and web paragraphs match the executor's recorded decisions. |
| The two agents that dropped WebFetch | Two blockers above. The `needs-input` route is coherent, and `deepthink-researcher` does hold only WebSearch and WebFetch. "Check current pricing" (`ci-runner-setup` line 55) is menu text shown to the user. |
| Held Write or Bash misread | No case. None of the nine is on the held-removals list (test file lines 339 to 366), and every Write they hold is ordered by a body or method line. |
| An order for a tool the agent lacks | One: `documentation-updater`, above. |
| Limits, both test files | Debt 89, Write-without-Edit 9, safety-floor exceptions 1, excused tools 1, safety-sentence debt 9, held removals 48. I counted the lists; each equals its maximum and its ceiling, and none rose. |
| Personal information | None in the diff or the plan. |

**Final-review judgement:** once the two replacements are in and the tool-grant tests are re-run on the final bytes, nothing from this review stands in the way. The security scan and the full verification run are still open.

## Backlog

- The executor's six carried items in the plan's Decisions stand.
- `ci-runner-setup` line 84: the public-repository warning needs a fact the agent can now only get by asking the user; no line says so.
- `ci-runner-setup` line 132: the latest version from GitHub's interface goes straight into the download command, while the method file (lines 172 to 176) orders a pinned version and a checksum. For the security scan.
- `ci-runner-setup` lines 154 and 163: the registration token is printed into the agent's output and passed on the command line. For the security scan.
- `deployment-setup` line 542: the agent's own webhook test bypasses the internal-address guard in `src/lib/deployment.js` (line 345). For the security scan.
- The build step's edits were made by a string-replace script through the shell, not with Edit as the plan orders; disclosed in the Execution Record.
- `ci-pipeline-checker` line 27 and the checkers' method files write scanner output files with shell redirects from observer agents.
- `changelog-generator`'s body says the agent curates; its method file (line 35) says a human does.
- `changelog-generator` and `documentation-updater` carry no order to read their method file; `ci-runner-setup` has only the hint on line 179.
