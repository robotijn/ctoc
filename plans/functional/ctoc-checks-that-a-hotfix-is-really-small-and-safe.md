---
title: "CTOC checks that a hotfix is really small and safe"
type: feature
status: refined
parent_vision: "none (the owner's request of 2026-10-07, quoted below)"
created: 2026-10-07
priority: HIGH
effort: medium
depends_on: none
acceptance_criteria_count: 25
risk_level: HIGH
---

# CTOC checks that a hotfix is really small and safe

## What the owner asked

> "also we need a hotfix agent or check. with a change is it small enough that it is a hotfix, like changing some text or the color of a button etc. websearch what a safe hotfix is and make certain that ctoc checks whether a hotfix is ok" (2026-10-07)

In plain words: when a change is called a hotfix, CTOC must look at the change itself and say whether it really is one. When it is not, the work goes through a normal plan. When the change is urgent but too big to be a hotfix, CTOC must say how it is handled.

## Problem Statement

Today the words "hotfix", "trivial fix", "trivial change", "quick fix" and "urgent" (the list in `src/lib/escape-phrases.js`) let a change skip planning. Nothing looks at the change. Since the owner keeps CTOC's hooks hidden, nothing acts on the words at all: whatever the change is, a session that hears "hotfix" may edit freely and commit. A one-word edit to a text and a rewrite of a payment rule are treated the same.

The owner's own examples of a real hotfix are changing some text or the colour of a button. The research below says what separates those from dangerous changes is the kind of change, not only its size. Tiny edits to program logic, settings, data, permissions, dependencies and money are behind some of the best-documented outages. The word "urgent" says how fast the owner wants it, not how small it is.

This plan gives CTOC one deterministic check of the actual change, run by the session when the owner uses one of those words and before the change is committed. When the change passes, the owner sees nothing extra. When it does not, the owner reads one plain sentence saying why, and the work goes through a normal plan. When the owner said "urgent" and the change is too big for a hotfix, it goes ahead now under conditions taken from emergency-change practice, and waits for the owner's review.

## How this was gathered

The agent that wrote this plan holds four tools: read a file, write a file, search the web, list files by pattern. It cannot run a program and cannot open a web page. Every statement about this repository was read from source this session; nothing was run. Every statement about the outside world comes from the search tool's rendering of a page (the result text), not from the page itself. Each row of the research table says which of those it is, and anything that could not be checked against its own source is marked unverified.

## What is true today (read from source)

- `src/lib/escape-phrases.js` lists seven phrases (hotfix, trivial fix, trivial change, quick fix, urgent, skip planning, skip iron loop) and matches them word-bounded and case-insensitive. It does not know what any phrase means, and it does not look at a change.
- `src/lib/ctoc-routing-reminder.js` goes silent when a prompt holds an escape phrase (reason `escape-phrase`). Its own text says "If this change is genuinely too small for a plan, say so plainly and let the human type an escape phrase." Nothing verifies "genuinely too small".
- `docs/ENFORCEMENT.md` says no hook is registered with Claude Code except the write protection for the approval records, the check records and the owner's answers. So today the phrases are checked by nothing.
- A menu route is a call of `node "${CLAUDE_PLUGIN_ROOT}/src/commands/start.js" <route> <arguments>`. `src/commands/start.js` hands the arguments to `route` in `src/lib/menu-screens.js` and prints the JSON result (`text`, `ask`, `actions`). `src/commands/start.md` splits routes into instant ones (answered synchronously) and background work. The menu is the one legitimate writer of the check records folder (`.ctoc/state/verify/`), which the loaded write protection keeps agents out of.
- `src/lib/quality-agent.js` exports `runSmartTests` and `runFullTests`. The existing functional plan `affected-tests-while-building-whole-suite-before-push.md` records, by reading, that `runSmartTests` has two exits that report a pass with zero tests run. A hotfix check that reused that pass would treat "no test ran" as "the tests pass".
- The inbox question stream (`createQuestion` in `src/lib/inbox.js`, already used for scope-growth requests per `docs/ENFORCEMENT.md`) is an existing place where an item waiting for the owner can live.

## Research

All rows were read on 2026-10-07 through web search. "Seen" means the claim appeared in the search tool's result text for that address; the page itself was not opened.

### What the research says, and what it decides

1. **A hotfix is a "standard change"; everything else is assessed.** ITIL (the Information Technology Infrastructure Library) sorts changes into standard (low risk, well understood, a defined procedure, authorised in advance), normal (assessed and approved before it is made) and emergency (made as quickly as possible, approval expedited, reviewed afterwards). The hotfix test below is the written rule that authorises a class of change in advance; a normal plan is the normal change; the urgent path below is the emergency change.
2. **Smaller is safer, but size is not safety.** DevOps Research and Assessment (DORA) says to make each change as small as possible because small changes are easier to understand, move through delivery and recover from. Google's Site Reliability Engineering book says frequent releases mean fewer changes between versions, so testing and troubleshooting are easier. Yet the best-documented outages came from tiny changes with a wide blast radius: one mistyped input to a command removed more servers than intended (Amazon Simple Storage Service, 2017); one regular expression in one rule pushed everywhere at once (Cloudflare, 2019); one policy row with blank fields replicated worldwide in seconds (Google Cloud, 2025); one extra field in a content update (CrowdStrike, 2024); one reused flag that woke old code (Knight Capital, 2012, about 440 million dollars). So the test combines size, kind of change, existing tests and a change that can be undone alone.
3. **Settings are not low risk.** Google's Site Reliability Engineering Workbook says a majority of incidents are triggered by binary or configuration pushes. The research brief listed "a configuration value" as commonly treated as low risk; the evidence says it should not be, so settings never qualify as a hotfix.
4. **Text and colour: no primary source found.** Only vendor and community pages say copy or style changes are low risk (unverified). Their inclusion rests on the owner's own examples, on the absence of every dangerous kind from the allowed list, and on the existing tests passing. Two known ways they still hurt: wording that is a price, a legal promise or a link, and a colour that lowers contrast under the Web Content Accessibility Guidelines minimum (4.5 to 1 for normal text, 3 to 1 for large text). A string that looks like text may also be something a program depends on (Hyrum's Law: all observable behaviour of a system will be depended on by somebody).
5. **Emergency practice: allow now, review after, and make the review real.** The emergency change gets only basic testing before it is made and is re-evaluated afterwards; the post-implementation review must actually happen and leave evidence (secondary). Google's release practice keeps the exact content of a release known (fixes are cherry-picked, nothing unrelated rides along) and re-runs the tests on what is actually released. So an emergency change here must pass the tests, be one commit that reverts alone, leave a record, and put a review item in front of the owner.
6. **Review size.** Defect detection per line is highest below about 200 changed lines and falls above 300 to 500 (a 2006 SmartBear study at Cisco, seen only in secondary write-ups). That sets the emergency ceiling at 200 changed lines; the hotfix ceiling is far lower and is a choice, not a research result.
7. **Kinds that are not low risk even when tiny.** Logic and control flow, settings, money and concurrency are covered by the incidents in point 2 and by the concurrency weakness catalogue entry. Authentication and permissions: the Open Worldwide Application Security Project lists broken access control first in its 2021 Top 10. Dependencies: the same list covers vulnerable components and software integrity failures. Public interfaces: Hyrum's Law. Data schemas: Martin Fowler's parallel-change article says some schema changes are backward incompatible and are made in reversible steps. None of the sources says "a tiny edit of this kind is dangerous" in those words; the list rests on the weight of these sources and is marked as such.

### Sources

| # | Address | Supports | Status |
|---|---|---|---|
| 1 | https://itsm.tools/change-enablement/ | standard, normal and emergency change; emergency reviewed retrospectively | Seen; secondary. The ITIL text itself was not read, so unverified against the source |
| 2 | https://www.securityscientist.net/blog/12-questions-and-answers-about-pre-approved-standard-changes/ and the ServiceNow page https://www.servicenow.com/docs/r/Recj91eIo1YnsOabQjgskg/34cI1hXYOn4iFzQZ~DOwNg | a standard change is low risk, well understood, repeatable, with a proven rollback, authorised in advance | Seen; secondary; the search summary did not say which page held which sentence |
| 3 | https://www.xurrent.com/glossary/change-advisory-board and https://manageengine.com/products/service-desk/it-change-management/cab-change-advisory-board.html | an emergency change advisory board speeds approval; the emergency change gets basic testing and is re-evaluated after | Seen; secondary; attribution between the two pages not determinable |
| 4 | https://compliance.theartofservice.com/controls/nist-sp-800-128/seccm-change-7 | emergency configuration changes bypass routine review but need retrospective documentation, security impact analysis and ratification | Seen on a third-party page only. The National Institute of Standards and Technology text was not read: unverified |
| 5 | https://sre.google/sre-book/release-engineering/ | frequent releases mean fewer changes between versions; release branch with cherry-picks keeps the content known; tests re-run on the release branch | Seen; page not opened |
| 6 | https://sre.google/workbook/canarying-releases/ | a majority of incidents are triggered by binary or configuration pushes | Seen (attributed to this chapter by the search summary); page not opened; wording not confirmed verbatim |
| 7 | https://dora.dev/capabilities/working-in-small-batches/ | make each change as small as possible; smaller changes are easier to recover from; contributes to throughput and stability | Seen; page not opened |
| 8 | https://dora.dev/guides/dora-metrics/ with https://www.metabase.com/metrics/change-failure-rate/ and https://docs.datadoghq.com/delivery_performance/dora_metrics/change_failure_detection/ | a deployment that needs a rollback or hotfix counts as a failed change | The detail was seen only on the two third-party pages; DORA's own wording not read: unverified against DORA |
| 9 | https://docs.cloud.google.com/architecture/framework/operational-excellence/automate-and-manage-change | deliver small changes regularly, get fast feedback, keep a way to roll back | Seen; page not opened |
| 10 | https://aws.amazon.com/message/41926/ | an authorised team member, using a playbook, entered one input wrongly and removed a larger set of servers than intended; the tool was changed to remove capacity more slowly and to refuse going below minimum capacity | Seen; page not opened |
| 11 | https://blog.cloudflare.com/details-of-the-cloudflare-outage-on-july-2-2019 | one misconfigured firewall rule deployed globally at once; a non-emergency rule change could go worldwide without a staged rollout | Seen; page not opened; the staged-rollout sentence came without its address, so partly unverified |
| 12 | https://status.cloud.google.com/incidents/ow5i3PPK96RduMcb1SsW | a policy change with unintended blank fields replicated globally and hit a code path that failed | Seen; page not opened. That the code was not behind a feature flag was seen only on third-party summaries (https://ilert.com/postmortems/google-cloud-outage-june-2025): unverified |
| 13 | https://www.crowdstrike.com/en-us/blog/channel-file-291-rca-available/ | a content configuration update supplied 21 input fields where the sensor expected 20, causing an out-of-bounds read and crashes | Seen; page not opened |
| 14 | https://www.sec.gov/files/litigation/admin/2013/34-70694.pdf | a repurposed flag woke obsolete code during a deployment; pre-tax loss about 440 million dollars; no sufficient deployment controls | Seen; page not opened |
| 15 | https://www.atlassian.com/blog/git/code-review-best-practices and https://tekin.co.uk/2020/05/proof-your-thousand-line-pull-requests-create-more-bugs | defect density is highest below 200 changed lines; review no more than about 400 lines at once | Seen; secondary write-ups of the 2006 SmartBear and Cisco study; the study was not opened: unverified against the original |
| 16 | https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html | contrast ratio at least 4.5 to 1 for normal text, 3 to 1 for large text; the ratio formula | Seen; page not opened |
| 17 | https://owasp.org/Top10/2021/A01_2021-Broken_Access_Control/, https://owasp.org/Top10/2021/A06_2021-Vulnerable_and_Outdated_Components/ and https://owasp.org/Top10/2021/A08_2021-Software_and_Data_Integrity_Failures/ | access control, vulnerable components and integrity failures are top web-application risk categories | Seen; pages not opened |
| 18 | https://abseil.io/resources/swe-book/html/ch01.html | Hyrum's Law, as quoted above | Seen; page not opened |
| 19 | https://martinfowler.com/bliki/ParallelChange.html | backward-incompatible interface or schema changes are made in reversible steps | Seen; page not opened |
| 20 | https://cwe.mitre.org/data/definitions/362.html | a race condition is a timing window in concurrent code on a shared resource | Seen; page not opened |
| 21 | https://www.securityscientist.net/blog/12-questions-and-answers-about-risk-based-change-assessment/ and https://docs.getthread.com/skill-library/change-and-problem-management/change-risk-assessment.md | text-only edits and a single font are low risk; changing authentication logic for all users needs deep review | Vendor and community pages: unverified, not authoritative. This is the only support found for "text and colour are low risk" |
| 22 | Results from agent-skill registries (for example https://tessl.io/registry/skills/github/Donchitos/Claude-Code-Game-Studios/hotfix) listing a hotfix checklist (minimal change, test first, rollback plan, review within 48 hours) | none | Seen, not used: not authoritative and none of its figures is verified |

## Business Alignment

**Job to Be Done:** When I tell CTOC a change is a hotfix and want it done without the whole planning pipeline, I want CTOC to check that the change really is small and safe, so I can fix a text or a colour in one move and never ship a risky change that skipped every review.

**Impact Map:**
- **Goal:** The pipeline's ceremony matches the risk of the change: tiny safe changes go straight through, everything else is planned. This traces to the reason the escape phrases exist (the header of `src/lib/escape-phrases.js`: pipeline ceremony must not exceed the change cost) and to the owner's request.
- **Actor:** The owner, the human who commands CTOC, and the sessions that work for him.
- **Impact:** A word like "hotfix" no longer skips planning by itself. A change of at most 20 changed lines of wording or colour goes through with no extra step and no extra message. Any other change is refused in one sentence and planned, unless the owner said "urgent", in which case it goes ahead and waits for his review.
- **Deliverable:** One deterministic check, a menu route that runs it, a fixed set of refusal sentences, the emergency path with its review item, the rule in the one loaded hook that refuses a labelled commit without a passing check, and the instructions that make the session run the check.

**Alignment checks:**
1. The goal traces to the request and to the purpose of the escape phrases: YES.
2. The actor is the owner named in the request: YES.
3. The impact is observable (a sentence shown or not shown, a commit made or not made, an item listed or not): YES.
4. The deliverable stays in one functional area, judging a change that claims to skip planning: YES. The emergency path is part of it because the owner asked for it in the same request.

## The hotfix test

### What is judged

The change is exactly the set of files that will go into the commit, compared with the last commit. They are named to the check, or, when none are named, every changed and new file in the folder. Other uncommitted work in the folder is neither judged nor committed. The same change always gets the same answer, and no language model is involved. The rules run in the order below, cheapest first, and the first rule that fails gives the sentence. The tests run only after every other rule passes, so a refused change costs no test run.

### The rules (all must hold)

1. **The change can be read.** The folder is a git repository with at least one commit, and every changed file can be read as text. If not, the test fails and says it could not read the change.
2. **Same files, same names.** No file is added, deleted, renamed or copied. No file changes its permissions. No binary file or symbolic link is involved.
3. **Size.** At most 3 files and at most 20 changed lines in total (lines added plus lines removed; a difference in line endings alone does not count).
4. **Only kinds that qualify.** Every file is one of the four kinds below, and every changed line is an edit of the kind's own shape:
   - **Documentation:** `.md`, `.txt` and `.rst` files outside the places that instruct or govern the work (`CLAUDE.md`, and anything under `.claude/`, `.ctoc/`, `agents/`, `skills/`, `commands/` and `plans/`). Any wording edit.
   - **Visible text in web page markup and component templates:** `.html`, `.htm`, `.jsx`, `.tsx`, `.vue` and `.svelte` files. Only characters between a closing `>` and the next `<`, outside script, style and text-area blocks, with no template or script characters.
   - **Message catalogue values:** `.json`, `.yaml`, `.yml`, `.po` and `.properties` files inside a folder named `locales`, `locale`, `i18n`, `lang`, `translations` or `messages`. Only the value text changes; the keys do not, and the placeholders (for example `{name}`, `{{name}}` or `%s`) are the same in number and in text before and after.
   - **Colour values in stylesheets:** `.css`, `.scss`, `.sass` and `.less` files. Only a colour (`#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()`, `hsla()` or a named colour) replaced by another colour, with the rest of the line unchanged.

   Everything else fails, including: program code (`.js`, `.ts`, `.py` and the like), settings files (`.json`, `.yaml`, `.yml`, `.toml`, `.ini`, `.env`, `.conf` outside a catalogue folder), dependency lists and lock files, database query and migration files, build and continuous-integration files, and tests.
5. **Not in a sensitive area.** No part of any changed file's path, split at every character that is not a letter, equals one of these whole words: auth, login, logout, password, session, token, secret, credential, key, permission, role, admin, payment, billing, checkout, price, pricing, invoice, tax, legal, terms, privacy, consent, cookie, gdpr, license, migration, schema, database, sql, deploy, workflow, ci.
6. **The wording carries no risk marker.** In markup text and catalogue values, the old and the new wording (outside placeholders) contain none of: a digit, a currency symbol, a percent sign, a web address (`://` or `www.`), an e-mail address (`@`), or any of the characters `<`, `>`, `{`, `}`, `$` and the backtick. Prices, legal numbers, links and template code never ride through as "text".
7. **No test is edited.** A hotfix may not change a test file (a file under `test`, `tests`, `__tests__` or `spec`, or named `*.test.*` or `*.spec.*`). Fix the code, not the tests.
8. **The existing tests pass.** The project's own test command runs and succeeds: only the tests its affected-test selection names when it names at least one, otherwise the whole suite. A run in which no test ran is not a pass. A project with no test command fails this rule, except for a change made only to documentation files.

A hotfix is committed as one commit holding only those files, with a subject that starts with "hotfix:", so one revert undoes it.

### What a deterministic check cannot answer

| Question | Why no check can answer it | What happens |
|---|---|---|
| Is a string in program code text that people read, or something the program depends on (a key, a format, a query, a log pattern)? | The change shows the characters, not their use. | The test fails; the change goes through a normal plan. No agent. |
| Is the new wording right, true and lawful (a price promise, consent, terms)? | Only a person who knows the facts can say. | Not answered. Narrowed by rules 5 and 6. The rest stays with whoever writes the words. |
| Is the new colour readable on its background (4.5 to 1 for normal text)? | One changed line does not show the other colour of the pair. | Not computed; the change passes. The residual risk is named in the risks below. |
| Does something outside the folder depend on the old text or colour (a screenshot suite elsewhere, a script that reads a label)? | Nothing in the folder says so. | Unknowable. The project's own tests are the only evidence. |
| Is this the right fix for the problem? | It is not a safety question. | Not judged. |

**Agent or check:** a check. None of these questions goes to an agent, existing or new. A model's opinion on risk is the unrepeatable judgement this check exists to remove; an agent run adds time to the one path meant to be quick; and a refusal costs one normal plan while a wrong pass costs an incident. What would change this: if the owner's real text edits inside code files are refused often, one agent could be asked question one only, and every other rule would still apply.

## Where it runs and what the owner sees

**When.** The session runs the check when the owner's message holds "hotfix", "quick fix", "trivial fix", "trivial change" or "urgent", after it has made the edit and before it commits. The session is told so in the instruction file every session reads in a CTOC project and in the menu's instruction file. CTOC's other hooks stay hidden, so nothing else starts the check; but the one loaded hook, the write protection for the records, refuses a commit whose message starts with "hotfix:" or "emergency:" unless a passing check record matches exactly the staged change (the owner's decision below). "skip planning" and "skip iron loop" are not judged: they are the owner's explicit order.

**How.** Through a menu route (working name `hotfix check`, with `--urgent` when the owner said "urgent" and the named files after it): `node "${CLAUDE_PLUGIN_ROOT}/src/commands/start.js" hotfix check [--urgent] [<file> ...]`. The rules that look at the change answer instantly, as an instant route. The test run is background work like any quality run, with one status line while it runs ("Checking the hotfix against the existing tests."), because silence over a long test run is the grinding with no feedback that the owner named as broken.

| The owner says | Small and safe | Not small or not safe |
|---|---|---|
| hotfix, quick fix, trivial fix, trivial change | Committed as "hotfix:". The owner sees nothing extra. | One sentence, then a normal plan. |
| urgent (alone or with another word) | The same as a hotfix. | The emergency path below when its conditions hold; otherwise one sentence and a normal plan marked high priority. |
| skip planning, skip iron loop | Not judged, as today. | Not judged, as today. |

**What the owner sees.** Passing: nothing beyond the status line while the tests run. Refused: one sentence of the shape "I did not treat this as a hotfix because {reason}; it goes through a normal plan, and your edits stay in place, not committed." The reason is one fixed clause per cause, so a test can assert it:

| Cause | Clause |
|---|---|
| change cannot be read | "I could not read the change ({why})" |
| file added, removed or renamed | "it adds, removes or renames {file}" |
| too big | "it changes {n} lines in {m} files and a hotfix is at most 20 lines in at most 3 files" |
| program code | "it changes program logic in {file}, and only wording and colours qualify" |
| only text inside program code | "it changes text inside program code in {file}, and no check can tell whether people read that text or the program depends on it" |
| settings file | "it changes a setting in {file}, and settings changes are a common cause of outages" |
| dependency list or lock file | "it changes the dependencies in {file}" |
| database file | "it changes stored data in {file}" |
| build or continuous-integration file | "it changes how the project is built or shipped in {file}" |
| anything else | "I do not recognise {file} as wording or a colour" |
| sensitive area | "{file} sits in an area named {word}, and such areas are never a hotfix" |
| risk marker in wording | "the wording in {file} contains a number, a price, a web address or an e-mail address" |
| a test is edited | "it changes a test ({file})" |
| tests fail | "the existing tests fail ({first failing test})" |
| no test ran | "no test ran, so nothing confirms the change" |

A refusal never deletes, reverts or stashes the edit. It only declines to call it a hotfix.

## Urgent but not small: the emergency path

"Urgent" is the owner's word, and in emergency-change practice the person with authority approving a fast route is the approval. So the owner's word opens the path; the words "hotfix", "quick fix", "trivial fix" and "trivial change" only claim smallness and never open it. The path applies only after the hotfix test has refused the change. All of these must hold:

1. **The owner said "urgent".**
2. **The change can be read** (rule 1 above).
3. **Size ceiling:** at most 10 files and 200 changed lines, so the review afterwards is one reviewable piece.
4. **It does not touch what governs the work:** `CLAUDE.md`, anything under `.claude/` or `.ctoc/`, and CTOC's hook and gate code. Those change only through a normal plan.
5. **Stored data asks first.** If the change holds a database migration or query file, CTOC stops and asks the owner once, before anything is committed: "This changes stored data, and reverting the commit cannot undo that. Go ahead as an emergency change?" with the answers "Make a normal plan" (recommended) and "Go ahead as an emergency change".
6. **The existing tests pass,** by rule 8 above. An emergency change may include test files, because a fix may need a new test; they are listed first in the review item.
7. **One commit** holding only these files, with a subject that starts with "emergency:", so one revert undoes it.

When all hold, the owner reads one sentence: "That is bigger than a hotfix ({first reason}), so it goes ahead as an emergency change and waits for your review among your open decisions." The item is written before the session reports the change done. When one fails, the owner reads "I did not go ahead as an emergency change because {reason}; it goes through a normal plan marked high priority, and your edits stay in place, not committed."

**The review item** lives in the owner's open decisions (the inbox that already carries scope-growth requests) and stays there until he answers; it never blocks other work and nothing in CTOC is timed. Its title is "Emergency change: {the commit subject after the prefix}". It shows the files and the changed line count, why the change was not a hotfix, any sensitive-area words that matched, the test result, and the one command that undoes the commit. Its two answers:

- "Keep it as it is": the item closes.
- "Keep it and make a normal plan to redo it with tests and review": the item closes and a normal plan titled from the change appears in his plans. The change stays in place.

An emergency change always leaves a record in the protected check records (written by the menu route, not by the session), because the review item reads it.

## User Stories

**As the owner,** **I want** a small wording or colour change to go through without any extra step or message, **so that** I fix a button label in one move and the pipeline does not cost more than the change.

**As the owner,** **I want** a change called a hotfix that is really logic, settings, security, data, dependencies or money to be refused in one plain sentence, **so that** a single word never silently skips every review for a risky change.

**As the owner,** **I want** a hotfix that is too big, edits a test, or breaks an existing test to be refused with the specific cause, **so that** I know exactly why it needs a plan and can trust that a pass was real.

**As the owner,** **I want** CTOC to refuse to pass a change it cannot read or recognise, **so that** a check that cannot see the change never says "safe".

**As the owner,** **I want** an urgent change that is too big for a hotfix to go ahead now under conditions and wait for my review, **so that** a real emergency is not stuck behind the pipeline and nothing unreviewed stays unreviewed.

**As the owner,** **I want** to answer the review of an emergency change with one choice, **so that** the emergency is closed or turned into a normal plan.

## Acceptance Criteria

- [ ] **Scenario: Button wording in markup passes quietly**
  Given a web page `src/pages/home.html` with the line `<button>Save</button>` and a project whose tests pass
  When the owner says "hotfix: rename the Save button to Store" and the session changes only the word between the tags
  Then the owner sees no message beyond one status line during the test run
  And the check tells the session the change may be committed as one commit whose subject starts with "hotfix:" and which holds only `src/pages/home.html`

- [ ] **Scenario: Button colour in a stylesheet passes quietly**
  Given `src/styles/button.css` with `.save { background-color: #0a58ca; }` and a project whose tests pass
  When the owner says "quick fix: make the Save button #0b5ed7" and only that colour changes
  Then the owner sees no message beyond the status line during the test run
  And the change may be committed as one "hotfix:" commit holding only `src/styles/button.css`

- [ ] **Scenario: A message catalogue value passes when its placeholders are unchanged**
  Given `locales/en.json` with `"save": "Save {count} items"` and a project whose tests pass
  When the value becomes "Store {count} items" with the same key and the same placeholder `{count}`
  Then the check passes and the owner sees nothing extra

- [ ] **Scenario: Other uncommitted work is neither judged nor committed**
  Given `notes.md` is modified in the same folder and is not named to the check
  When the check judges `src/pages/home.html` for a one-word wording change
  Then the verdict is the same as if `notes.md` were unchanged
  And the commit holds `src/pages/home.html` only

- [ ] **Scenario: Urgent with a small safe change is a hotfix**
  Given a one-word wording change in `src/pages/home.html` and a project whose tests pass
  When the owner says "urgent: the Save button says Safe" and the session fixes the one word
  Then it is committed with a subject starting "hotfix:", no review item is created and the owner sees nothing extra

- [ ] **Scenario: Program logic is refused**
  Given `src/cart.js` where `if (items.length > 0)` is changed to `if (items.length >= 0)`
  When the owner says "hotfix" for that change
  Then the owner reads "I did not treat this as a hotfix because it changes program logic in src/cart.js, and only wording and colours qualify; it goes through a normal plan, and your edits stay in place, not committed."
  And nothing is committed

- [ ] **Scenario: A settings value is refused**
  Given `config/app.yaml` where `timeout_seconds: 30` is changed to `timeout_seconds: 60`
  When the owner says "trivial change" for that change
  Then the owner reads the same sentence with the clause "it changes a setting in config/app.yaml, and settings changes are a common cause of outages"
  And nothing is committed

- [ ] **Scenario: Text inside program code is refused**
  Given `src/server.js` where `res.send("Order saved")` is changed to `res.send("Order stored")`
  When the owner says "quick fix" for that change
  Then the owner reads the clause "it changes text inside program code in src/server.js, and no check can tell whether people read that text or the program depends on it"

- [ ] **Scenario: A price in wording is refused**
  Given `src/pages/home.html` where `<p>Only 9 euro a month</p>` is changed to `<p>Only 7 euro a month</p>`
  When the owner says "hotfix" for that change
  Then the owner reads the clause "the wording in src/pages/home.html contains a number, a price, a web address or an e-mail address"

- [ ] **Scenario: A sensitive area is refused even for a wording change**
  Given `src/pages/login.html` where `<button>Sign in</button>` is changed to `<button>Log in</button>`
  When the owner says "hotfix" for that change
  Then the owner reads the clause "src/pages/login.html sits in an area named login, and such areas are never a hotfix"

- [ ] **Scenario: More than 20 changed lines is refused**
  Given wording changes that remove 13 lines and add 12 lines across 2 files
  When the owner says "hotfix" for them
  Then the owner reads the clause "it changes 25 lines in 2 files and a hotfix is at most 20 lines in at most 3 files"
  And the edits stay in place, not committed

- [ ] **Scenario: A new file is refused**
  Given the session adds `src/pages/about.html`
  When the owner says "hotfix" for that change
  Then the owner reads the clause "it adds, removes or renames src/pages/about.html"

- [ ] **Scenario: An existing test that fails refuses the hotfix**
  Given `tests/home.test.js` asserts that `src/pages/home.html` shows "Save"
  When the owner says "hotfix" for the change from "Save" to "Store" and the test run fails
  Then the owner reads the clause "the existing tests fail (tests/home.test.js)" followed by the name of the first failing test
  And nothing is committed

- [ ] **Scenario: Editing a test refuses the hotfix**
  Given a wording change in `src/pages/home.html` that also edits `tests/home.test.js`
  When the owner says "hotfix" for the two files
  Then the owner reads the clause "it changes a test (tests/home.test.js)"
  And no test is run

- [ ] **Scenario: A run in which no test ran is not a pass**
  Given a project whose test command succeeds but reports 0 tests run
  When the owner says "hotfix" for a one-word wording change in `src/pages/home.html`
  Then the owner reads the clause "no test ran, so nothing confirms the change"

- [ ] **Scenario: A change that cannot be read is refused**
  Given the folder is not a git repository, or has no commit to compare with
  When the owner says "hotfix" for any change
  Then the owner reads a sentence whose clause starts "I could not read the change" and names the reason
  And the check never reports a pass

- [ ] **Scenario: A file kind the check does not recognise is refused**
  Given `docs/diagram.svg` has one text label changed
  When the owner says "hotfix" for that change
  Then the owner reads the clause "I do not recognise docs/diagram.svg as wording or a colour"

- [ ] **Scenario: The owner's explicit order to skip planning is not judged**
  Given a change of 300 lines across 12 files
  When the owner says "skip planning" and no other escape word
  Then the check is not run and the session proceeds as it does today

- [ ] **Scenario: An urgent change that is too big for a hotfix goes ahead and waits for review**
  Given the owner says "urgent: checkout crashes when the cart is empty" and the session's fix changes 40 lines in 4 files, with logic in `src/cart.js`, and the affected tests pass
  When the check runs with the urgent word
  Then the owner reads "That is bigger than a hotfix (it changes program logic in src/cart.js), so it goes ahead as an emergency change and waits for your review among your open decisions."
  And the change is committed as one commit whose subject starts with "emergency:"
  And the next time the owner opens the menu his open decisions list "Emergency change:" with the files, 40 changed lines, the reason it was not a hotfix, the test result and the one command that undoes the commit

- [ ] **Scenario: An urgent change whose tests fail does not go ahead**
  Given an urgent change of 40 lines whose existing tests fail
  When the check runs with the urgent word
  Then the owner reads "I did not go ahead as an emergency change because the existing tests fail (" followed by the first failing test and the rest of the sentence, "; it goes through a normal plan marked high priority, and your edits stay in place, not committed."
  And no commit and no review item are made

- [ ] **Scenario: An urgent change above 200 lines or 10 files does not go ahead**
  Given an urgent change of 350 lines in 12 files
  When the check runs with the urgent word
  Then the owner reads the emergency refusal sentence with the clause "it changes 350 lines in 12 files and an emergency change is at most 200 lines in at most 10 files"
  And no commit and no review item are made

- [ ] **Scenario: An urgent change to what governs the work does not go ahead**
  Given an urgent change that edits `CLAUDE.md`
  When the check runs with the urgent word
  Then the owner reads the emergency refusal sentence with the clause "it changes CLAUDE.md, which sets the rules the work follows, and only a normal plan changes that"

- [ ] **Scenario: An urgent change to stored data asks once before anything is committed**
  Given an urgent change that includes `db/migrations/20261007_add_column.sql` and passes every other emergency condition
  When the check runs with the urgent word
  Then the owner is asked once "This changes stored data, and reverting the commit cannot undo that. Go ahead as an emergency change?" with the answers "Make a normal plan" (marked recommended) and "Go ahead as an emergency change"
  And nothing is committed until he answers

- [ ] **Scenario: Keeping an emergency change closes its review item**
  Given an emergency change waiting in the owner's open decisions
  When he chooses "Keep it as it is"
  Then the item is no longer listed and the commit stays

- [ ] **Scenario: Keeping and replanning an emergency change opens a normal plan**
  Given an emergency change waiting in the owner's open decisions
  When he chooses "Keep it and make a normal plan to redo it with tests and review"
  Then the item is no longer listed
  And a normal plan titled from the emergency change appears in his plans
  And the change stays in place

## Scope

### In Scope
- The hotfix test: rules 1 to 8 as one deterministic check of the change against the last commit, with the same answer every time and no model call. Covers every refusal and pass scenario above.
- The menu route that runs it, instant for the rules that read the change, and the background test run with one status line. Covers the passing scenarios and the test scenarios.
- The fixed refusal sentences and clauses, one per cause. Covers the refusal scenarios.
- The meaning of the phrases kept in the one phrase list: the small family is judged, "urgent" opens the emergency path, the two skip phrases stay unjudged. Covers the urgent and skip scenarios.
- The emergency path, its record in the protected check records, its review item with two answers and the one question about stored data. Covers the emergency and review scenarios.
- The instructions that make the session run the check: the file every session reads in a CTOC project, the menu's instruction file, the routing reminder text and `docs/ENFORCEMENT.md`.
- Tests that build temporary git repositories, a corpus of at least 40 edit shapes (half of them traps for the classifier), Windows line endings and backslash paths.
- The owner's decision of 2026-10-07 (below): the one loaded hook, `src/hooks/protect-records.js`, refuses a `git commit` whose message starts with "hotfix:" or "emergency:" unless a passing hotfix check record exists for exactly the staged change (bound to the staged content and the commit it builds on). Every passing check writes that record in the protected check records under `.ctoc/state/verify/`, which agents cannot write; only the menu's `hotfix check` route writes it.

### Out of Scope (this plan only; each item is the owner's to schedule, and none is deferred by this plan)
- An agent that judges whether a string in code is visible text. The check fails those instead.
- A colour-contrast calculation. The accessibility and visual-regression checkers already exist for normal plans.
- Judging "skip planning" and "skip iron loop". They stay the owner's explicit order.
- Loading any other CTOC hook. The owner's decisions of 2026-10-07 keep every CTOC hook hidden except the write protection for the records (`docs/ENFORCEMENT.md`), which gains the one commit rule above.
- Changing the zero-test pass in `runSmartTests` that the plan `affected-tests-while-building-whole-suite-before-push.md` describes. The hotfix run refuses a zero-test pass itself.
- Making the limits (20 lines and 3 files for a hotfix, 200 lines and 10 files for an emergency) settings. They are fixed values in the check; changing them is a normal plan.
- Staged rollout, canaries or rollback in the owner's own project. CTOC does not deploy.

## Risks

### Technical Risks
- **The classifier mistakes a code change for text** (template expressions, text inside script or style blocks, entity-encoded characters, a text node whose edit crosses a tag, a multi-line text node) and passes an unsafe change.
  - Likelihood: MEDIUM
  - Impact: HIGH
  - Mitigation: Write the corpus of at least 40 edit shapes, half of them traps, as failing tests before the classifier exists; treat anything not positively recognised as a refusal.
- **The test run is slow.** This repository's whole gated suite has over 500 test files and its framework detection reports no framework, so by the existing plan's reading the whole suite runs. A hotfix would feel like grinding.
  - Likelihood: HIGH for this repository
  - Impact: MEDIUM
  - Mitigation: Run only the tests the project's affected-test selection names when it names one, show the status line while it runs, and record the measured duration from the first live use in the build record (no figure is invented here).
- **Windows line endings and path separators** turn every line into a changed line or break folder-name matching.
  - Likelihood: MEDIUM
  - Impact: MEDIUM
  - Mitigation: Test with Windows line endings and backslash paths, and count changed lines ignoring line-ending differences.
- **The same change gets different answers** because of the git settings on a machine (line-ending conversion, colour, pager, rename guessing).
  - Likelihood: LOW
  - Impact: MEDIUM
  - Mitigation: Call git with fixed arguments and an explicit environment, and test the same change twice.
- **A readable-looking colour passes but is hard to read** (contrast below 4.5 to 1).
  - Likelihood: MEDIUM
  - Impact: LOW
  - Mitigation: Record the residual risk in the build record and offer the contrast calculation to the owner as an option.
- **Wording with a legal effect passes** because it sits outside the sensitive words and carries no marker.
  - Likelihood: LOW
  - Impact: MEDIUM
  - Mitigation: Keep the sensitive-word list in one place, review it against the owner's real project folders at first live use, and extend it through a normal plan.

### Business Risks
- **Too strict.** Real hotfixes are refused so often that the owner says "skip planning" instead, which nothing checks.
  - Likelihood: MEDIUM
  - Impact: MEDIUM
  - Mitigation: Count refusals by cause from the first live uses and show the counts in the build record; loosen a rule only when the counts show its cause was wrong.
- **The emergency path becomes routine.** DORA counts a hotfix as a failure of an earlier change (secondary), so a rising number is a signal.
  - Likelihood: MEDIUM
  - Impact: MEDIUM
  - Mitigation: Keep each review item listed until it is answered and show the open count with the owner's decisions.
- **The owner's "etc." is wider than text and colour** (for example one-line bug fixes).
  - Likelihood: MEDIUM
  - Impact: LOW
  - Mitigation: State the narrow reading in plain words at his approval and widen by kind only with evidence from refusals.

### Dependency Risks
- **A commit that does not carry the label is not stopped.** CTOC's other hooks stay hidden, so nothing starts the check by itself. The one loaded hook refuses only a commit labelled "hotfix:" or "emergency:" without a passing check, and it reads the label from the command; a session that never labels its commit, or labels it falsely, is not caught.
  - Likelihood: MEDIUM
  - Impact: HIGH
  - Mitigation: Put the instruction in the file every session reads and in the menu's instruction file, label commits "hotfix:" and "emergency:" so they can be found, and refuse a labelled commit without a passing check in the one loaded hook (the owner's decision below).
- **Git must be installed and the folder must be a repository.**
  - Likelihood: LOW
  - Impact: LOW
  - Mitigation: Refuse in one sentence when git cannot read the change (covered by a scenario above).
- **A project's test command may not exist or may report a pass with zero tests,** and `runSmartTests` has such passes today.
  - Likelihood: MEDIUM
  - Impact: HIGH
  - Mitigation: Run the declared test command directly, read its counters, and refuse a run that reports zero tests.
- **The inbox may not suit a review item with two recorded answers** (answers are written only by the menu).
  - Likelihood: LOW
  - Impact: MEDIUM
  - Mitigation: Spike first: write one test item and answer it through the menu route before building on it.

## Priority

**Priority: HIGH** (Score: 7/9)
- Dependency: MEDIUM (2) -- nothing depends on it, and it overlaps the test-selection plan only at the zero-test pass.
- Business Impact: HIGH (3) -- today a single word skips every review for any change, and the owner asked for the check by name.
- Technical Risk: MEDIUM (2) -- classifying edits is moderate work; the risk is a wrong pass, handled by refusing everything unrecognised.

## The owner's decision (2026-10-07)

**Question:** how should CTOC make sure the hotfix check actually runs before a hotfix is committed, given hooks stay hidden?

**Answer: a — the loaded write protection refuses a hotfix-labelled commit without a passing check.** The one hook Claude Code loads, `src/hooks/protect-records.js` (registered alone by `hooks/hooks.json`), refuses a shell `git commit` whose message starts with "hotfix:" or "emergency:" unless a passing hotfix check record exists for exactly the staged change: the record is bound to the staged content and to the commit it builds on. The record lives in a folder that same hook already keeps agents out of (under `.ctoc/state/verify/`), so an agent cannot forge it; only the menu's `hotfix check` route writes it. The refusal is one plain sentence on stderr with exit 2, like the hook's other refusals. CTOC's other hooks stay hidden; this is one more rule in the one loaded hook.

The earlier alternative, a refusal at `/ctoc:push`, is dropped. What the rule cannot catch: a commit that does not carry the label, or carries a false one.

## Decisions Taken Under Ambiguity

1. **What "etc." covers**: chose wording (documentation, markup text, message catalogue values) and colour values, because the owner's examples are exactly those and the research puts logic, settings and the other kinds on the dangerous side. One-line bug fixes get a normal plan unless the owner says "urgent".
2. **A check, not an agent**: chose a deterministic check because an agent's risk opinion is unrepeatable, adds time, and a wrong refusal is cheap. It flips to one agent for the single text-in-code question only if refusals of real text edits prove frequent.
3. **Settings never qualify**, although the research brief listed a configuration value as commonly low risk, because Google's own experience is that a majority of incidents come from binary or configuration pushes (research point 3).
4. **The limits**: 3 files and 20 changed lines for a hotfix; 10 files and 200 changed lines for an emergency. The hotfix numbers are chosen, not derived: the owner's examples are one to four lines. The emergency number comes from the review-size evidence (secondary, unverified against the original). Only a normal plan changes them.
5. **Text inside program code fails** rather than being accepted by a guess such as "the string appears once in the repository", because a guess like that passes a lookup key that happens to appear once.
6. **A number, price, web address or e-mail address in wording fails**, because those are money and legal claims and the check cannot tell a price from a page count. A copyright year edit therefore needs a normal plan.
7. **The sensitive-area word list is deliberately crude**: a false refusal costs one normal plan, a false pass costs an incident. So a button label in `login.html` is refused.
8. **Tests**: the project's affected-test selection is used only when it names at least one test, otherwise the whole suite runs; a run with zero tests is never a pass; a project with no test command passes only for documentation-only changes; a hotfix may not edit a test (fix the code, not the tests), while an emergency change may add one and lists test files first in its review item.
9. **Which phrases are judged**: the four small-change phrases are judged as hotfix claims; "urgent" is judged and can open the emergency path; "skip planning" and "skip iron loop" stay the owner's explicit unjudged order, because he alone decides to override. A one-line note for those phrases is an option for him (not built).
10. **A refusal never deletes, reverts or stashes the edit**, because those are irreversible-feeling actions the owner did not ask for. It only declines to call the edit a hotfix; the normal plan then starts from what is in the folder.
11. **One status line while the tests run**, although the owner wants nothing extra on a pass: silence over a long test run is the grinding with no feedback he called broken. The line disappears with the result and adds no verdict.
12. **Records**: every passing check writes a record in the protected check records, because the loaded hook reads it before it lets a commit labelled "hotfix:" or "emergency:" through (the owner's decision of 2026-10-07); an emergency change's record also carries its review. The check is repeatable from the change, so a pass can be re-judged.
13. **The review item has two answers**, with undo shown as a command rather than a third answer, so the item does not make the owner's repository change on its own.
14. **"Reviewed right after"** means the item exists before the session reports the change done and stays listed until answered. It does not block other builds, and nothing is timed against a clock.
15. **The emergency path never covers the files that govern the work**, and stored data asks once, because the first would let a casual "urgent" rewrite the rules and the second cannot be undone by a revert (irreversible, so the owner decides).
16. **Contrast is not computed**, because one changed line does not show the other colour of the pair; the cost is stated as a risk.
17. **The commit subject prefixes "hotfix:" and "emergency:"** are a naming convention so the owner can find them in the history he already has, and, since the owner's decision of 2026-10-07, the label the loaded hook reads.
18. **Plan level only**: this plan names no new file or module; the implementation planner chooses them and keeps the route reachable from the menu in the same unit of work.

## Neighbours (seen, not built here; scheduling is the owner's)

- `plans/functional/affected-tests-while-building-whole-suite-before-push.md` describes the zero-test passes in `runSmartTests`. If that plan is built first, the hotfix run can use its result; if not, the hotfix run still refuses a zero-test pass on its own.
- `plans/functional/ctocs-hooks-are-actually-loaded-by-claude-code.md` (written 2026-09-30) would load the edit hooks. The owner's decision of 2026-10-07 keeps them hidden. If they are ever loaded, the edit hook would still allow an edit on any phrase, and this check at commit time would remain the judgement. Whether that earlier plan stands is his call.
