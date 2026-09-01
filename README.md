<p align="center">
  <strong>CTO Chief</strong><br>
  <em>The CTO your AI never had.</em>
</p>

<p align="center">
  <a href="https://github.com/robotijn/ctoc"><img alt="GitHub" src="https://img.shields.io/badge/GitHub-robotijn%2Fctoc-blue"></a>
  <a href="LICENSE"><img alt="License: PolyForm Shield" src="https://img.shields.io/badge/License-PolyForm%20Shield-brightgreen.svg"></a>
  <img alt="Version" src="https://img.shields.io/badge/version-6.14.49-blue">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Claude%20Code-purple">
  <img alt="Agents" src="https://img.shields.io/badge/agents-124-orange">
  <img alt="Skills" src="https://img.shields.io/badge/skills-429-blue">
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D18-green">
</p>

CTO Chief is a Claude Code plugin that turns AI coding from "generate and pray" into disciplined engineering. Every feature follows a **16-step Iron Loop** — plan before code, test before ship, secure before deploy — wrapped by a **refinement loop** that drives findings (warnings included) to zero before you ever see the result. **124 agents** across **24 categories** route through a **3-tier architecture** (CTO Chief → sub-orchestrators → Opus watchers), with **4 mandatory human gates**. The **429-file skill library** (101 specialist bodies + 328 reference files) has been brought to 2026 best-practices quality through a websearch → update → critique → update loop on every specialist — no invented statistics, sourced citations, 7-language coverage. A **local semantic plan-index** gives you meaning-based search, related-plan surfacing, duplicate-guarding, and conflict detection over your plan corpus, and an **advisory EU-compliance program** (GDPR + EU AI Act) flags regulatory exposure as you build — always advising, never overriding a human gate. The result: production-quality code — held to that standard not by a perfect first pass, but because adversarial review and the four human gates catch what a first pass misses.

---

## How to read this README

This README is written as a **course**, not a feature list. It follows what the learning-science literature says makes a course work: state the outcomes first and design backward from them (Wiggins & McTighe), teach with **worked examples** before asking you to drive on your own (Sweller & Cooper's worked-example effect), fade the guidance as you get competent, and give you a short **retrieval check** at the end of each lesson so the knowledge sticks. Every screen you see below is a **real capture** from the current version — nothing is mocked up.

**Part 1 — The course** (read in order, about 30 minutes end to end):

| Lesson | After it you can… | Time |
|---|---|---|
| [0 · Install](#lesson-0--install) | install CTO Chief and confirm it loaded | 2 min |
| [1 · Open it](#lesson-1--open-it-and-answer-the-three-first-run-questions) | open the dashboard in any project and answer the three first-run questions | 3 min |
| [2 · Read the dashboard](#lesson-2--read-the-dashboard) | read every block of the dashboard and name the four moments that are yours | 4 min |
| [3 · From an idea to plans](#lesson-3--from-an-idea-to-plans) | turn a one-sentence idea into small, buildable plans | 6 min |
| [4 · Answer the questions](#lesson-4--answer-the-questions-the-streaming-gate-screen) | answer a gate question, read a precomputed decision, send a plan back | 5 min |
| [5 · Let it build](#lesson-5--let-it-build) | start the build, read the task board and the status lines, know the only two legitimate stops | 4 min |
| [6 · Call it done and ship](#lesson-6--call-it-done-and-ship) | approve finished work, batch-approve a wave, push with the quality gate | 3 min |
| [7 · When CTO Chief says no](#lesson-7--when-cto-chief-says-no) | read a blocked-edit message and choose the right door | 3 min |
| [8 · Keep it healthy](#lesson-8--keep-it-healthy) | update, change environment or enforcement, handle the stale-plan nag | 2 min |

**Part 2 — [Recipes](#part-2--recipes)**: task-shaped how-tos once you know the basics.
**Part 3 — [Reference](#part-3--reference)**: the Iron Loop, the agent architecture, the libraries, every setting.

---

# Part 1 — The course

## Lesson 0 · Install

**Outcome:** CTO Chief is installed from the marketplace and its commands are available.

**Do this** inside Claude Code:

```
/plugin marketplace add https://github.com/robotijn/ctoc
/plugin install ctoc
```

> [!TIP]
> Enable auto-update: `/plugin` → Marketplaces tab → `robotijn` → Enable auto-update.

**You know it worked when** typing `/ctoc` offers three commands — `/ctoc:start`, `/ctoc:push`, `/ctoc:update`. Those are the only three slash commands CTO Chief ships; everything else is reached through the dashboard.

> CTO Chief is **always** installed from the marketplace. Never point the plugin at a local checkout — `/ctoc:update` (Lesson 8) is how you get a newer version.

<details>
<summary><strong>Check yourself</strong></summary>

1. How many slash commands does CTO Chief add? → *Three: start, push, update.*
2. Where does everything else live? → *Behind `/ctoc:start`, the dashboard.*

</details>

---

## Lesson 1 · Open it, and answer the three first-run questions

**Outcome:** the dashboard is open in your project, the project is initialized, and you have chosen an environment and a compliance regime (or deliberately skipped both).

**Do this:**

```bash
claude
```
```
/ctoc:start
```

There is no init command. The first time you open the dashboard in a project without a `.ctoc/` folder, CTO Chief sets the project up **before** rendering — it detects your stack (languages, frameworks, linters, test runners), writes a tailored `CLAUDE.md` and `IRON_LOOP.md`, creates `.ctoc/settings.yaml`, `.ctoc/state/`, and the `plans/` stage folders. Initialization is idempotent: a file that already exists is never overwritten.

**Worked example.** This is the real first screen in a fresh Express project (a `package.json` and one source file), captured from the current version:

```
CTOC is set up for this project.

⚖ No EU compliance regime chosen yet — pick one (gdpr = processes EU personal data under Regulation (EU) 2016/679 · eu-ai-act = deploys AI systems in the EU market under Regulation (EU) 2024/1689). The four human gates stay mandatory. Changeable later in settings.yaml.
Choosing a regime is RECORDED in settings and switches on the advisory GDPR / EU AI Act review that runs during planning. It does NOT enforce the profile's regulatory controls (audit hash-chain, four-eyes at the final gate, legal hold and the rest are present as libraries but NOT ENFORCED). Do not treat a chosen regime as compliance coverage.

⚙ No CTOC environment chosen yet for this project — pick one below
  (dev = soft enforcement, never auto-push · staging = strict, manual push ·
   prod = strict, auto-push after gates). The four human gates stay
  mandatory in every environment. Changeable later in System → Settings.

No gate decisions pending
────────────────────────────────────────

  Every plan at a human gate has been decided. Start something new, or
  open the dashboard for the full pipeline overview.
```

Claude then asks you three questions in one go:

| Question | Options | What it changes |
|---|---|---|
| **Nothing waiting at a gate — what next?** | Start something new · Open the dashboard | Where you go next (Vision Mode, or the pipeline overview) |
| **Which environment should CTOC run in?** | Development · Staging · Production · Keep defaults, stop asking | How strict CTO Chief is with *itself* — see [Environments](#environments--dev--staging--prod). It never weakens a human gate. |
| **Which EU compliance regime applies?** | None · GDPR · EU AI Act · Both | Switches on an **advisory** GDPR / EU AI Act review during planning. It is recorded, it advises, it never enforces a control and never blocks a transition. |

Answer them once; both choices are remembered. "Keep defaults, stop asking" and "None" are durable too — the question stops riding along. One correction to the screen text above: in **every** environment, including Production, pushing stays your act (Lesson 6) — no profile turns auto-push on.

**You know it worked when** your project now contains `CLAUDE.md`, `IRON_LOOP.md`, `.ctoc/settings.yaml` and a `plans/` folder, and `/ctoc:start` opens straight onto the dashboard.

<details>
<summary><strong>Check yourself</strong></summary>

1. What command initializes a project? → *None. Opening `/ctoc:start` initializes it.*
2. Does choosing "GDPR" make your project GDPR-compliant? → *No. It turns on an advisory review; nothing is enforced and no gate changes.*
3. Can the "Production" environment let unreviewed code through? → *No. Every environment keeps all four human gates.*

</details>

---

## Lesson 2 · Read the dashboard

**Outcome:** you can read every block of the dashboard and say which four moments in the pipeline are yours to decide.

**Worked example.** The classic pipeline overview (`Open the dashboard` on the first screen) of a busy project — this is a real capture of the CTO Chief repository itself:

```
CTOC v6.14.36
────────────────────────────────────────────────────────────

▼ Business (2)
    Vision         2
    Canvas         0
    Functional     0

▼ Implementation (0)
    Implementation 0
    Todo           0

▼ Execution (373)
    In progress    0
    Review         134
    Done           239

TASKS
  ⏸ 4 queued    precompute 00003-r2a-scheduler-lifecycle-honesty (waits: ready)
  ✓ 1 done → 1 awaiting review

INBOX
  ⊙ 0 morning questions
  ⊙ 0 decisions awaiting review
  ⊙ 134 plans at gates · view: inbox gates
  ⊙ 134 possibly-stale plans
  ⊙ 1 background task done — awaiting review

AGENT
  ○ Idle
```

Read it top to bottom:

**The pipeline** is three sections, and a plan is a Markdown file that moves through folders under `plans/`:

```
Business:        vision → canvas → functional        WHY, business model, product requirements
Implementation:  implementation → todo               HOW (technical design), then ready to execute
Execution:       in-progress → review → done         building, verifying, shipped
```

Everything **before** `todo` builds context; everything **from** `todo` on executes. By the time a plan reaches `todo`, every decision is locked — the builder never guesses.

**The four moments that are yours.** Four transitions never happen without you. In plain words:

| Moment | Transition | What you are deciding |
|---|---|---|
| "Is this the idea to explore?" | vision → functional | whether to spend planning effort on it |
| "Is this what to build?" | functional → implementation | the product requirements are right |
| "Is this how to build it?" | implementation → todo | the technical approach is right — and **which files** the build may touch |
| "Is it finished?" | review → done | the built, verified result is acceptable |

Nothing crosses these on its own. A plan parked past one of them without your marker is reverted automatically. (The docs and the code call them Gate 0–3; you will not see those numbers on your screen.)

**TASKS** is the background work: builds, critiques, question precompute. Up to five run at once; a queued task tells you what it waits for.

**INBOX** is what wants your attention: questions, decisions surfaced by agents, plans waiting at a gate, possibly-stale plans, finished background tasks. Every count has a door — `inbox gates`, `inbox questions`, `inbox decisions`, `inbox stale` — so a number is always something you can open.

**AGENT** is the todo-queue runner: idle, or building.

**Navigation rule.** On a plan list, a **number** always opens a plan — never anything else. Words do the rest: `n` new, `b` back, `discuss`, `todo-all`, `done-all`. On every other screen you pick an option by its label; "Other" is always a free-text path.

<details>
<summary><strong>Check yourself</strong></summary>

1. Which stage separates "building context" from "executing"? → *`todo`.*
2. What does typing `7` do on a plan list? → *Opens plan number 7. Numbers never do anything else.*
3. Name the four moments that are yours. → *Idea to explore · what to build · how to build it · is it finished.*

</details>

---

## Lesson 3 · From an idea to plans

**Outcome:** you can take a one-sentence idea through Vision Mode to a set of small, buildable implementation plans, and you know where each agent hands off to the next.

There are two entrances. Use the first when the idea is broad, the second when you already know exactly what you want.

### Entrance A — a broad idea (Vision Mode)

**Do this:** on the dashboard pick **Start something new** (or **Vision** on the Commands screen), then say the idea:

```
I want a SaaS product with AI to help creative writers when they get stuck
```

**What happens, in order:**

1. **Vision Advisor** listens first. It scores what you said on eight dimensions, finds the one to three gaps that would change the plan, and asks **at most five questions** — zero if your sentence already covers problem, audience, success and scope. It writes the vision to `plans/vision/`.
2. **Decompose.** The vision is broken into functional **stubs** by the Vision Decomposer, in the background. You review them at a human checkpoint (`stubs <vision-slug>`) that offers exactly these options:

| Option | What it does |
|---|---|
| **Looks good — refine all** | Hand off stubs to the Product Owner agent for refinement |
| **Edit stubs** | Rename, merge, split, or remove stubs |
| **Add a stub** | Create a new stub for a missing piece |
| **Start over** | Discard all stubs and re-decompose |
| **Back** | Return to the dashboard |

   "Looks good — refine all" is the first of your four moments: the vision is archived to `done/` with its provenance recorded, and the stubs are handed on.
3. **Product Owner** refines each stub into a functional plan: user stories, Given/When/Then scenarios, a testable Definition of Done, explicit scope boundaries. Business questions (pricing, market, unit economics) are out of the technical chain — they belong to the founder or product manager, through the canvas.
4. **You approve what to build.** Each functional plan is validated first, then you confirm (Lesson 4 shows the screen).
5. **Implementation Planner** reads the whole ancestry (vision → canvas → functional), analyzes your codebase, and **slices** the functional plan into **N small implementation plans** — typically one to three files each, a module and its test kept together, `depends_on`-ordered, globally numbered (`00042-<slug>.md`). Each declares the exact `files:` it will touch. That declaration is load-bearing: it is the **write permission** the build receives.
6. **You approve how to build it.** On the implementation list, the word `todo-all` moves every slice to `todo` and starts the build (Lesson 5).

**The real implementation list** (empty here, so you can read the reply line):

```
[implementation] (0 items)
────────────────────────────────────────

  No plans in this stage.

  Reply:  n = new implementation plan · discuss = critique every plan · todo-all = move all to todo + run iron loop · b = back
```

### Entrance B — you already know what you want

Say it precisely:

```
Add a /health endpoint returning 200 OK
```

CTO Chief skips the idea exploration and starts at planning. Small requests still get a small plan with a test — that is the point. (For a change so small that a plan would cost more than the change, see Lesson 7's escape phrases.)

### Before you approve anything: `discuss`

The first item on every plan's menu, and a word on every stage list, is **Discuss** — a maximally harsh adversarial critique of the plan, run in the background: every weak assumption, failure mode, unstated dependency, missing edge case. No praise, no hedging. It never edits the plan and never crosses a gate; its open questions land in your inbox as decisions. Run it before you approve; it is the cheapest defect you will ever fix.

<details>
<summary><strong>Check yourself</strong></summary>

1. What is the maximum number of questions Vision Advisor asks? → *Five. Zero if the idea already covers problem, audience, success and scope.*
2. Why are implementation plans small? → *A crash loses one slice, not a feature; and each slice's `files:` list is exactly the write permission the build gets.*
3. Which word on the implementation list approves how to build and starts the build? → *`todo-all`.*

</details>

---

## Lesson 4 · Answer the questions (the streaming gate screen)

**Outcome:** you can answer a gate question, read a precomputed decision with its pros and cons, check validation, and send a plan back the right way.

**The default screen.** When you open `/ctoc:start` and plans are waiting at a gate, CTO Chief does not show you a menu — it asks you the pending decisions **one at a time**, most-critical first. Your reply **is** the decision. A real capture:

```
Topic: The menu grows a door for the inbox and an honest cancel route  ·  nothing is finished until you say so  ·  decision 1 of 134
────────────────────────────────────────

  R2-C — The menu grows a door for the inbox and an honest cancel route

  Scope — what approving this grants write access to:
    src/lib/menu-screens.js  —  1 file
    src/lib/inbox.js  —  1 file
    src/lib/actions.js  —  1 file
    tests/menu-task-wiring.test.js  —  1 file
    tests/menu-protocol.test.js  —  1 file
    tests/menu-inbox-routes.test.js  —  1 file
    tests/actions-scheduler.test.js  —  1 file
    7 files total

  # R2-C — The menu grows a door for the inbox and an honest cancel route
  …the plan body follows…
```

and the question:

| Is "…" finished? | Meaning |
|---|---|
| **Yes — it's finished** | Crosses the gate. Recorded as *your* answer, in a ledger no agent can write. |
| **Check validation** | Shows the pre-transition checks before you decide. |
| **Send it back — wrong thing** | The requirements are wrong → back to functional planning. |
| **Send it back — wrong way** | The requirements are right, the technical approach is wrong → back to implementation planning. |
| **Open the plan** / **Skip for now** | Read it first, or move to the next decision (nothing changes). |
| **Other** (free text) | A comment, recorded alongside the plan. Never edits it, never crosses. |

A second question — **Anything else for this plan?** — offers **Discuss**, **View/Edit**, **Delete**, **Not now**.

**Precomputed decisions.** While you were away, an adversarial critique fleet (pre-mortem, devil's-advocate, red-team, plus a defense lens arguing *for* crossing) already examined each waiting plan and wrote its open questions to disk. So when a plan has a real fork, the screen asks *that* instead of a bare yes/no — each option with its pros and cons precomputed, exactly one marked recommended when there is an objectively better answer. This is a real precomputed question from a plan in review (the pros and cons are abridged; the originals run to a paragraph each and cite file and line):

```
This slice's title advertises six defect fixes, but its own record says only two shipped here;
the other four were re-filed into a follow-up whose code already sits inside this slice's
declared files. How should this cross review → done?

  [1] Batch the whole coupled wave, narrow the header first          (recommended)
      pros: verified on disk — the header lists six fixes, the record delivers two, and the
            follow-up's code is already commingled in this slice's files; ruling on the wave
            together means no member reaches done while a sibling sits in review
      cons: you confirm the whole wave in one sitting, plus one header edit first
  [2] Cross this slice alone with the header narrowed to the two delivered fixes
      pros: the two delivered items are live and wired; unblocks this slice now
      cons: gate order inverted — its dependency is still in review
  [3] Cross as-is with the six-fix header intact
      pros: nothing further to touch
      cons: the permanent done record credits fixes it did not deliver — a false green
```

You never wait for a critique to run: questions are computed ahead of demand, and a plan whose questions are not ready yet simply gets the plain question. The line `Enough information: NO — nobody has worked out what this plan still needs to be asked` means exactly that — no critique has been recorded for it yet.

**Check validation** is what runs before any approval. A real capture, followed by the two options it offers:

```
Pre-transition validation: review → done
────────────────────────────────────────

  All checks passed.
```

| All checks passed — approve review → done? | |
|---|---|
| **Confirm approve** | Approve now — move the plan to done |
| **Back** | Return to the review list |

When validation **fails**, the failures are listed and "Approve anyway" is buried as the last option — choosing it records an override with your reason, in the ledger and in the plan, so a forced crossing is always auditable.

**How CTO Chief asks.** Every decision question follows one format: a decision matrix (Option · Pros · Cons · Recommendation) first, then the question — one question per turn, highest-information question first, never a question that could have been answered by reading the source. A quality decision (one objectively best answer) carries a recommendation; an owner decision (what to build, when, how much risk) is presented flat, without one.

<details>
<summary><strong>Check yourself</strong></summary>

1. What is the difference between "wrong thing" and "wrong way"? → *Wrong thing = requirements wrong, back to functional. Wrong way = approach wrong, back to implementation.*
2. Who wrote the pros and cons you read on a precomputed question? → *The adversarial critique fleet, in the background, before you opened the screen.*
3. Can an agent record "Yes — it's finished" for you? → *No. The approval ledger is denied to every agent; only your reply crosses.*

</details>

---

## Lesson 5 · Let it build

**Outcome:** you can start the build, read the task board and the status lines, and you know the only two legitimate reasons a build stops.

**Do this:** `todo-all` on the implementation list (Lesson 3), or **Start agent** on the Commands screen (`menu commands`), whose options are:

| Option | What it does |
|---|---|
| **Vision** | Explore new ideas before formal planning |
| **Start agent** | Execute the next plan from the todo queue |
| **Sync plans** | Pull, commit, and push plan changes |
| **◀ Pipeline** | Return to the pipeline view |

**What happens.** Each `todo` plan is built by the Iron Loop executor as a **background** task, following Steps 8–16 without interruption:

```
8 TEST      write failing tests first — the code does not exist yet
9 PREPARE   environment, dependencies, shift-left scan of the code you are about to touch
10 IMPLEMENT all code changes, one step, one sub-item per file
11 REVIEW   self-review against the plan
12 OPTIMIZE simplify, remove redundancy
13 SECURE   vulnerability scan
14 VERIFY   lint + typecheck + ALL tests + coverage floor, 0 skipped, 0 flaky
15 DOCUMENT docs match the code that was actually written
16 FINAL-REVIEW → the plan lands in review, waiting for your OK
```

Plans whose declared `files:` are disjoint build **concurrently** (up to five); two plans that touch the same file serialize. When a wave finishes, a single `sync` barrier runs the integrated suite and commits.

**The task board** (`View board` on the Commands screen, or say `tasks`) — a real capture:

```
Background Tasks
────────────────────────────────────────

Queued (4)
  • t43  precompute 00003-r2a-scheduler-lifecycle-honesty  [queued]
  • t44  precompute 00004-r2b-actions-drain-and-shipgate  [queued]
  • t45  precompute 00005-r2c-menu-doors-and-persisted-answers  [queued]
  • t48  implement 00067-y1-ctoc-start-entry-point  [queued]

Done (1)
  • t47  implement 00066-x9-gate-critic-writes-its-own-questions  [done]

  Reply with a task id (e.g. t3) to open it, or 'b' for back.
```

and one task opened:

```
Task t47
────────────────────────────────────────

  kind:   implement
  plan:   00066-x9-gate-critic-writes-its-own-questions
  status: done
  result: plan reached review
```

**What you see in the foreground** while it runs is a status plane, not a spinner: one short line per milestone, in your terms, shaped like *"Starting implementation of ‹feature›."* · *"‹feature›: tests green."* · *"Committed, bumped patch v‹X.Y.Z›. Push?"* · *"‹feature› ready for your inspection."* Progress, not process.

**Completion is real verification.** When a build task completes, Step 14 VERIFY is actually **run** — the project's lint, typecheck and full test suite, plus a last-mile check that the project's entry point still starts (when one is declared in `general.entry_point` or detectable from `package.json`) — and the result is written to `.ctoc/state/verify/<plan>.json`. That file is the evidence the final gate reads. A failed verify is honest and expected sometimes: the plan still reaches review, the evidence says it failed, and approval is refused until it is fixed.

**Only two things stop a build:**

1. **The work is complete** — the plan is in review with its evidence.
2. **A real fork** — a decision that is yours — surfaces as a question in your inbox and blocks its subtree until you answer. Trivia below that bar never blocks: the agent makes a documented reasonable choice, records it under *Decisions Taken Under Ambiguity* in the plan, and review catches a wrong call.

A build never widens its own permission. If an executor discovers it must touch a file outside the plan's `files:`, it does **not** edit the plan — it files a structured scope-growth question in your inbox and stops. Only you, crossing the build gate through the menu, widen scope.

**Circuit breaker.** A quality failure at Step 14 kicks the work back to the responsible step (tests fail → IMPLEMENT, coverage low → TEST, security → SECURE). Three kickbacks to the same step, or five in total, and the build stops and escalates to you with what kept failing and why.

<details>
<summary><strong>Check yourself</strong></summary>

1. Can two plans build at the same time? → *Yes, when their declared files are disjoint. Same file → they serialize.*
2. A build needs a file its plan did not declare. What happens? → *It stops and asks you; it never edits its own `files:`.*
3. Name the two legitimate stops. → *Work complete; a real fork surfaced as a question.*

</details>

---

## Lesson 6 · Call it done and ship

**Outcome:** you can approve finished work one plan at a time or as a wave, and push through the quality gate.

**One plan.** Open `/ctoc:start`; each review plan is asked as *"Is … finished?"* (Lesson 4). **Yes — it's finished** crosses it to `done`. The gate reads the verify evidence the build produced; a plan whose recorded verification failed is **refused**, and that refusal is the system working.

**A wave.** On the review list, the word `done-all` approves every reviewed slice of a parent plan at once — each sibling is validated, crossed, and stamped as your approval; a sibling that fails validation is reported and left in review, never silently dropped. More plans does not mean more prompts.

**Ship.** Pushing is a human ship gate. CTO Chief commits locally on its own at natural points; it **never pushes** unless you open that gate:

```
/ctoc:push
```

It runs the same quality checks that gate a commit — lint, typecheck, tests, security — and pushes only on a pass. Tier-1 failures block; Tier-2 warnings can be overridden. Options, when Claude runs the push script for you:

| Option | Effect |
|---|---|
| *(none)* | Run the checks, push on success |
| `--dry-run` | Run the checks, do not push |
| `--force` | Push despite Tier-2 warnings |
| `--skip-tests` | Lint and typecheck only |

To let the post-commit hook push on its own, set `git.autoPushEnabled: true` in `.ctoc/settings.json`. The default is `false`, and **no environment profile may flip it** — opening a ship gate is your act alone.

<details>
<summary><strong>Check yourself</strong></summary>

1. Which word approves a whole wave on the review list? → *`done-all`.*
2. Does CTO Chief push after every commit? → *Not unless you set `git.autoPushEnabled: true`. By default you push with `/ctoc:push`.*
3. A plan's verify evidence says it failed. Can you approve it? → *It is refused. Fix it first; a forced override is recorded as an override.*

</details>

---

## Lesson 7 · When CTO Chief says no

**Outcome:** you can read a blocked-edit message and pick the right door.

**The message.** Ask Claude to edit a source file that no approved plan covers and you will see this — a real capture, paths shortened:

```
[CTOC v7] Edit BLOCKED: no active plan covers this file and no escape phrase used
  Target: /your/project/src/lib/payments.js
  Project: /your/project

  Resolution:
  - Run /ctoc:start to create or activate a plan that covers this file, OR
  - If this change is genuinely small, an escape phrase you type yourself will allow it — see /ctoc:start for the current list.
```

**Why.** Before every `Edit`, `Write`, `MultiEdit` and every shell command that writes a file, a hook asks one question: *does an approved plan declare this file in its `files:`?* A plan's declared files **are** its write permission, and only a plan a human approved into the build phase grants it. An agent cannot write itself a permission slip: the approval ledger is denied to every agent, the plan folder before approval is not scanned, and the check fails **closed** — an unreadable stage directory denies, it never allows.

**Three doors, in the order to try them:**

| Door | When | How |
|---|---|---|
| **A plan that covers the file** | any real change | `/ctoc:start` → describe the change → approve it into `todo` (Lessons 3–4). This is the normal path. |
| **An escape phrase you type** | a change so small that a plan would cost more than the change | Include one of: `hotfix`, `trivial fix`, `trivial change`, `quick fix`, `urgent`, `skip planning`, `skip iron loop` in **your own** message. Word-bounded, case-insensitive; a phrase inside a filename does not count, and an agent typing it does not count. Even then, TEST and VERIFY are never skipped. |
| **Soften enforcement** | a whole project where you accept the risk | `.ctoc/settings.yaml` → `enforcement: { mode: soft }` warns instead of blocking; `off` allows silently. Choosing the Development environment sets `soft` for you. |

**The floor that no door lowers.** `soft` and `off` relax plan coverage on the *edit* channel only. They never relax the approval-ledger deny, the verify-evidence deny, the streaming-questions deny, any security deny on the shell channel, or the four human gates. And a shell command that writes an uncovered file is denied at every mode.

Config and pipeline files are always writable: `.ctoc/**` (except the ledger, the verify evidence and the question store), `.local/**`, `plans/**/*.md`, `VERSION`, `.gitignore`, `.gitattributes`.

<details>
<summary><strong>Check yourself</strong></summary>

1. What grants an agent permission to edit `src/app.js`? → *An approved plan whose `files:` covers it.*
2. Can Claude type "quick fix" to unblock itself? → *No. Only a phrase typed by you counts.*
3. Does `enforcement.mode: off` disable the four human gates? → *No. It relaxes edit coverage only.*

</details>

---

## Lesson 8 · Keep it healthy

**Outcome:** you can update CTO Chief, change its environment or enforcement, and handle the stale-plan nag.

**Update:**

```
/ctoc:update
```

then restart Claude Code. (This works around a Claude Code plugin-cache bug — [#21995](https://github.com/anthropics/claude-code/issues/21995) — where `/plugin update` does not refresh the cache: it fetches the latest version, clears the cache, and updates the registry.)

**Settings live in two files, read by different layers:**

| File | Owns | Read by |
|---|---|---|
| `.ctoc/settings.yaml` | `enforcement.mode`, `regulatory_regime`, `operations` | the safety-critical hooks (flat YAML, no parser dependency) |
| `.ctoc/settings.json` | `general.environment`, `git` (`autoPushEnabled`), `workflow`, `deployment`, `agents`, `privacy` | the menu (System → Settings) and the deployment engine |

**Environment** (Development / Staging / Production) tunes CTO Chief's own behaviour — see [Environments](#environments--dev--staging--prod). Change it any time in System → Settings.

**The stale-plan nag.** When plans look abandoned, the dashboard adds a second question — *"134 possibly-stale plans detected — view them?"* — with three options:

| Option | What it does |
|---|---|
| **View stale plans** | Inspect the possibly-stale plans (read-only) |
| **Don't ask again for these** | Durably dismiss the current possibly-stale set (a changed plan re-surfaces) |
| **Not now** | Dismiss for this menu turn |

`inbox stale` lists them, `inbox verify` proposes what to do with each, and `inbox cleanup` executes a proposal — behind your confirmation, never a blind delete. Dismissal is by signature: a plan that changes re-surfaces.

**Doctor** (the System area, behind **More ▶** on the dashboard) checks the install and shows the claim-verification ledger for the skill library — verified / refuted / unverifiable counts and how old they are.

<details>
<summary><strong>Check yourself</strong></summary>

1. Where do you change enforcement strictness? → *`.ctoc/settings.yaml` → `enforcement.mode`.*
2. Where do you turn on auto-push? → *`.ctoc/settings.json` → `git.autoPushEnabled`.*
3. What does "Don't ask again for these" do to a plan that later changes? → *It re-surfaces; dismissal is by signature.*

</details>

---

# Part 2 — Recipes

Short, task-shaped how-tos. Each assumes Part 1.

**I have a precise change in mind.** Say it precisely (*"Add a `/health` endpoint returning 200 OK"*). Planning starts directly; approve what to build and how to build it; the build runs; approve it finished; `/ctoc:push`.

**I want to fix a typo without ceremony.** Put an escape phrase in your message: *"trivial fix: correct the spelling in the login error message."* TEST and VERIFY still run.

**I want every plan critiqued before I approve anything.** On a stage list type `discuss` — one adversarial critique per plan (or per parent group), in the background. Read the decisions it surfaces in `inbox decisions`.

**I want to check quality without pushing.** Ask Claude to run the push script with `--dry-run`: it runs lint, typecheck, tests and the security scan and reports, and pushes nothing.

**I want to send a plan back.** Answer the gate question with *Send it back — wrong thing* (requirements) or *Send it back — wrong way* (approach). The plan moves back to the right stage; nothing is lost.

**I want CTO Chief to be less strict on this project.** Choose the Development environment (System → Settings), or set `enforcement.mode: soft` in `.ctoc/settings.yaml`. The human gates stay.

**I want to run the EU compliance advisory.** Answer the first-run compliance question, or later set `regulatory_regime.active_profiles` in `.ctoc/settings.yaml` (`gdpr`, `eu-ai-act-high-risk`, or both). Findings attach to your inbox; nothing is enforced and no gate moves.

**I want an approved commit promoted to staging or production.** Configure the `deployment` block in `.ctoc/settings.json` (see [Deployment Pipeline](#deployment-pipeline)) or run the `deployment-setup` agent for an interactive walkthrough. It ships with `dry_run: true`: nothing fires until you set it to `false`.

**I want to see what is waiting on me.** `/ctoc:start` asks you the pending decisions in order. For the lists: `inbox gates`, `inbox questions`, `inbox decisions`, `inbox escalations`, `tasks`.

**I want to run a build across a whole set of slices.** On the implementation list type `todo-all`; on the review list, `done-all` per parent when they come back. Numbers open plans; words act.

---

# Part 3 — Reference

## Commands

CTO Chief ships exactly **3 slash commands**. Everything else — vision, planning, quality, review, agent runs, initialization, settings — goes through the dashboard.

| Command | Description |
|---------|-------------|
| `/ctoc:start` | The dashboard. Asks pending gate decisions one at a time; auto-initializes the project on first run. |
| `/ctoc:push` | Quality checks (lint, typecheck, tests, security), then push on success. Options: `--dry-run`, `--force`, `--skip-tests`. |
| `/ctoc:update` | Update to the latest version from GitHub (then restart Claude Code). |

**Dashboard routes** you can say by name: `dashboard` · `menu commands` · `browse <stage>` · `plan <stage>/<file>` · `validate <stage>/<file>` · `stubs <slug>` · `inbox questions|decisions|gates|escalations|stale|verify|cleanup` · `tasks` · `task <id>`.

There is no `ctoc` command-line executable; typing `ctoc` followed by a subcommand in a shell does nothing.

---

## The Iron Loop

16 steps, 4 phases, 4 human gates — [full methodology →](docs/IRON_LOOP.md)

```
COLLABORATIVE (Steps 1-7) — agents ask questions, you decide
──────────────────────────────────────────────────────────────
Step 1: IDEATION
  IDEATE — vision-advisor + product-owner explore your idea with you
  Gate 0: you approve the idea to explore            (vision → functional)

Steps 2-4: FUNCTIONAL PLANNING
  ASSESS → ALIGN → CAPTURE — agents ask what to build, you approve
  Gate 1: you approve what to build                  (functional → implementation)

Steps 5-7: IMPLEMENTATION PLANNING
  PLAN → DESIGN → SPEC — agents ask how to build it, you approve
  Gate 2: you approve how to build it                (implementation → todo)

AUTOMATED (Steps 8-16) — agents execute, you review
──────────────────────────────────────────────────────────────
Steps 8-16: IMPLEMENTATION
  TEST → PREPARE → IMPLEMENT → REVIEW → OPTIMIZE → SECURE → VERIFY → DOCUMENT → FINAL-REVIEW
  Gate 3: you approve the result                     (review → done)
```

| Step | Name | One-liner |
|---|---|---|
| 1 | IDEATE | Explore the idea, shape it, decompose into actionable plans |
| 2 | ASSESS | Understand the problem before proposing solutions |
| 3 | ALIGN | Connect the solution to user goals and business value |
| 4 | CAPTURE | Write requirements as testable Given/When/Then scenarios |
| 5 | PLAN | Choose the technical approach with tradeoffs documented |
| 6 | DESIGN | Define the architecture and slice the work into N small implementation plans |
| 7 | SPEC | Refine until the plan survives adversarial review, per slice |
| 8 | TEST | Write failing tests first — the code does not exist yet |
| 9 | PREPARE | Environment, dependencies, shift-left scan of existing code |
| 10 | IMPLEMENT | All code changes in one step, one sub-item per file |
| 11 | REVIEW | Self-review: does the code do what the plan said? |
| 12 | OPTIMIZE | Simplify, remove redundancy, improve performance |
| 13 | SECURE | Vulnerability scan: OWASP Top 10, input validation, secrets |
| 14 | VERIFY | Automated gate: lint + typecheck + ALL tests + coverage floor, 0 skipped, 0 flaky |
| 15 | DOCUMENT | Update docs to match the code that was actually written |
| 16 | FINAL-REVIEW | Verify Steps 8–15; the plan waits for your OK |

**Step 8 is test-driven development** — write tests, not "identify coverage". **Step 10 is one step** — files are sub-items. **Step 14 is the quality gate** — the coverage floor is a ratchet that may only rise. TEST and VERIFY are never skipped, not even under an escape phrase.

**One functional plan → N small implementation plans.** Steps 5–7 decompose; each slice is one to three files, `parent_plan`-linked, `depends_on`-ordered, with its own Steps 8–16. The gates batch per parent (`todo-all`, `done-all`) so more plans never means more prompts.

**Enforcement, honestly scoped.** File-edit, shell-write, commit, and gate-residency enforcement are hooked (a plan at a gate destination without a human marker is reverted). Step execution, dispatch logging, and the background-task protocol are instruction-level discipline the session model follows, not a code-enforced hook today.

---

## The 3-Tier Agent Architecture

CTO Chief is the only top-level dispatcher. All other agents are dispatched by CTO Chief, directly or via a sub-orchestrator. See [`AGENT_ARCHITECTURE.md`](docs/AGENT_ARCHITECTURE.md) for the full spec.

| Tier | Role | Count | Model | What they do |
|------|------|------:|-------|--------------|
| **Tier 0** | Top-level coordinator | 1 | Opus | CTO Chief — sole dispatcher, owns the audit trail, approves all gate crossings |
| **Tier 1** | Sub-orchestrators | 20 | Opus | Planning (7) · Iron Loop (3) · Pipeline (5) · Synthesizer (1) · Gate critique (4) — recommend dispatches and orchestrate Tier 2 fan-out |
| **Tier 2** | Watchers / specialists | 99 | Opus | Domain experts that think about the actual code — single-purpose, structured findings output, cannot dispatch other agents |

There is no pre-screen tier: a check that can pass without thinking is a lie, so every watcher reads the code. Cross-pillar conflicts (security vs. performance, etc.) are resolved by the **synthesizer** using a fixed priority: Security > Correctness > Maintainability > Performance > Readability > Consistency. Each dispatch is recorded to `.ctoc/audit/dispatches/YYYY-MM-DD/<id>.yaml` — an instruction-level [Dispatch Protocol](docs/DISPATCH_PROTOCOL.md) the session model follows, not a code-enforced hook today.

**The gate-critique fleet.** Four lenses examine every plan waiting at a gate, in the background, ahead of demand: **pre-mortem** (assume it shipped and failed — what broke?), **devil's-advocate** (weak assumptions, vacuous acceptance criteria, hidden dependencies), **red-team** (the failure modes and attacks that actually occur — OWASP LLM Top 10, MITRE ATLAS, NIST AI RMF), and **advocate** (the one lens briefed to argue *for* crossing, so your options are authored by opposing intents). A **gate-critic** synthesizes them into the decision questions you saw in Lesson 4. All four are advisory: they hold read-only tools, never edit a plan, never cross a gate.

---

## The Refinement Loop

Findings from the Iron Loop don't get reviewed-and-shipped on the first pass. They run through the **refinement loop** — an iterative critic → test-writer → implementer cycle that drives findings to zero before the final gate. See [`REFINEMENT_LOOP.md`](docs/REFINEMENT_LOOP.md).

```
critics → findings → test-writer (TDD red) → implementer (TDD green) → re-critic
                                                                            │
                                                                       still findings?
                                                                            │
                                                                ┌───────────┴───────────┐
                                                              YES                       NO
                                                                │                       │
                                                          loop again                 advance
                                                                                   phase / done
```

| Phase | K (rounds) | Stops on |
|-------|------------|----------|
| Critical | 3 | 0 critical findings |
| Medium | 5 | 0 medium findings |
| Low | 7 | 0 low findings |
| Final sweep | ∞ (soft cap) | Convergence; escalates to you if it doesn't |

**Warnings are bugs.** Compiler / linter / type-checker warnings, deprecation notices, and CVEs at *any* severity are classified `critical` by every critic — they block phase advancement until fixed. Time is a vector: today's warning is tomorrow's customer-visible crash.

Triggered on `effort: high` plans or when a risk-surface glob matches (auth, billing, schema migrations, GDPR-relevant paths). The integrator agent drives the loop; the journal at `.ctoc/loops/<slug>/journal.yaml` records every round.

---

## Key Features

- **Ideation-first workflow** — Vision Advisor and Product Owner explore your idea, ask the minimum questions, and shape it into plans before any code is written
- **Collaborative planning, automated execution** — Steps 1-7: agents ask questions and you decide. Steps 8-16: agents execute and you review the result.
- **Streaming gate decisions** — the dashboard asks you the pending decisions one at a time, most critical first, with pros and cons precomputed in the background; you never wait for a critique
- **124 agents** across 24 categories — testing, security, quality, infrastructure, SaaS, product, compliance, AI quality, safety, legal, realtime, and more
- **429 skill files** — 101 specialist skill bodies (engineered through the websearch → update → critique → update loop) + 50 language refs + 211 framework refs (85 web, 44 AI/ML, 52 data, 15 DevOps, 15 mobile) + 61 per-language quality configs + 6 shared agent fragments
- **Iron Loop methodology** — 16 steps across 4 phases with 4 human gates
- **Refinement loop** — critic → test-writer → implementer cycle with tiered K-budgets (critical K=3 · medium K=5 · low K=7 · final sweep K=∞) that drives findings to zero (warnings included) — see [REFINEMENT_LOOP.md](docs/REFINEMENT_LOOP.md)
- **3-tier agent architecture** — CTO Chief (Tier 0, sole dispatcher) → 20 sub-orchestrators (Tier 1) → 99 Opus watchers (Tier 2) — see [AGENT_ARCHITECTURE.md](docs/AGENT_ARCHITECTURE.md)
- **File-based write permission** — a plan's declared `files:` is exactly what the build may touch; scope growth is a question to you, never a self-edit
- **6-month pre-mortem + 5-scenario cash flow** — every canvas carries a Gary Klein pre-mortem (≥5 failure modes scored likelihood × impact with this-week mitigations) and a Worst / Conservative / Base / Optimistic / Exceptional 18-month cash flow with runway per scenario and commit-now decision triggers
- **Warnings are bugs** — compiler/linter/type-checker warnings, deprecation notices, and CVEs at any severity are critical-tier; production readiness requires zero warnings and zero open CVEs
- **Production-ready SaaS templates** — B2C subscription and B2B sales-led starters with 20+ block-severity production-readiness checks
- **2026-grade compliance & AI safety** — `sbom-cra-checker`, `threat-modeler`, `ai-governance-checker`, `llm-security-tester`, `incident-responder` cover EU CRA, EU AI Act, NIST 800-61r3, OWASP LLM Top 10 v2, MITRE ATLAS, STRIDE/PASTA/LINDDUN
- **Product Loop** — post-launch DEFINE → INSTRUMENT → MEASURE → REVIEW → HYPOTHESIZE → EXPERIMENT → LEARN keyed to 17 canonical KPIs — see [PRODUCT_LOOP.md](docs/PRODUCT_LOOP.md)
- **Runtime environments (dev / staging / prod)** — one setting tunes enforcement strictness, auto-push, default model and log verbosity; no environment weakens a human gate
- **Deployment pipeline** — configurable staging → production promotion after the final gate, dry-run by default
- **Stack detection** — auto-detects 14 languages, dozens of frameworks, and tools
- **Honest instruments** — every check that cannot read its input reports NOT VERIFIED rather than green; coverage floor, dead-code, false-green and recipe-execution fences ratchet in one direction only
- **On-demand loading** — skills load only when needed; you only pay for what you use

---

## The Canvas — 6-Month Pre-Mortem + 5-Scenario Cash Flow

Both Lean Canvas (Maurya) and Business Model Canvas (Osterwalder) carry two extra planning sections by default — surfacing 6-month failure modes and runway scenarios up-front so the business plan is interrogated before any feature work begins.

**6-Month Pre-Mortem (Gary Klein, HBR 2007)** — Imagine 6 months from now and the initiative has *already* failed. List ≥5 distinct failure modes scored Likelihood × Impact; pair each with a mitigation that can be **started this week**. Refresh every 3–4 months.

**Cash Flow Planning — 5 Scenarios over 18 months** — Worst / Conservative / Base / Optimistic / Exceptional. The three middle scenarios must each be plausible (defensible, not aspirational). Stress-test deltas per scenario:

| Variable | Worst | Conservative | Base | Optimistic | Exceptional |
|----------|------:|------:|------:|------:|------:|
| Revenue growth | −50% | −20% | 0 | +25% | +60% |
| CAC | +75% | +25% | 0 | −15% | −30% |
| Monthly churn | 2.0× | 1.3× | 1.0× | 0.8× | 0.6× |
| Time-to-first-pay | +60d | +30d | normal | −15d | −30d |

Includes base-case assumption anchors, per-month MRR table at M3/M6/M9/M12/M15/M18, runway per scenario, and **commit-now decision triggers** (e.g., "if actuals track Worst for 2 consecutive months: switch operating plan to Worst").

Both sections are owned by the founder or product manager. The CTO Chief technical chain does not produce them; it consumes them when planning instrumentation work.

---

## The Product Loop

The Iron Loop ships features. The **Product Loop** validates that they earn their place. See [`PRODUCT_LOOP.md`](docs/PRODUCT_LOOP.md).

```
DEFINE → INSTRUMENT → MEASURE → REVIEW → HYPOTHESIZE → EXPERIMENT → LEARN
  ↑                                                                    │
  └───────────────── continuous post-launch ───────────────────────────┘
```

| Step | Owner | Cadence |
|------|---------------|---------|
| DEFINE | founder + pm | Canvas phase — via `kpi-planner` |
| INSTRUMENT | programmer | Implementation — via `skills/saas/posthog-analytics` |
| MEASURE | (automated) | Continuous — PostHog + Stripe |
| REVIEW | founder + pm | Weekly — via `skills/product/product-reviewer` |
| HYPOTHESIZE | founder + pm | From review findings |
| EXPERIMENT | pm + programmer | Via `skills/product/experiment-designer` |
| LEARN | founder + pm | Post-experiment |

Canonical KPI library at `.ctoc/templates/product-kpis.yaml` — **17 KPIs** across acquisition / activation / retention / revenue / churn / satisfaction / engagement. SaaS-b2c launch set: signup_completion, activation_rate, time_to_value, w1_retention, free_to_paid_conversion, monthly_churn, mrr.

KPI status and the weekly product review are reached through the `/ctoc:start` dashboard.

---

## SaaS Production-Readiness Templates

CTO Chief ships opinionated templates for common project types. `agents/planning/stack-chooser.md` (Tier 1) selects the matching template and presents defaults to you.

| Template | Status | Default stack |
|----------|--------|---------------|
| `saas/b2c-subscription` | ready | Next.js 15 · Supabase · Clerk · Stripe · Resend · PostHog · Sentry · Vercel |
| `saas/b2b-sales-led` | ready | adds WorkOS SSO · org-scoped data · audit log · MSA/DPA templates · SOC2 docs |
| `saas/usage-based-api` | planned | metered billing · API keys · rate limiting · usage dashboard |
| `app/expo-react-native` | planned | Expo SDK 52 · Clerk Expo · Supabase · RevenueCat · EAS |
| `cli/bun-single-binary` | planned | Bun + cross-platform binary |
| `oss-lib/typescript` | planned | tsup · changesets · GitHub Actions |

Each ready template carries a **production-readiness checklist** enforced at the final gate (review → done). Block-severity items in the B2C template include:

- **Domain & HTTPS** — custom domain, HTTPS enforced
- **Auth** — signup with email verification, password reset
- **Billing** — real-card-tested, webhook signature verified, failed-payment dunning, billing-portal link
- **Email deliverability** — SPF + DKIM + DMARC, welcome + receipt emails
- **Multi-tenancy** — Postgres RLS enforced, RLS policy per user-data table
- **Observability** — Sentry receiving errors, PostHog receiving events
- **Legal** — Privacy Policy, Terms of Service
- **Support** — support@ email forwards
- **Backups** — DB backups enabled
- **Code quality** — **zero warnings across all toolchains**, **zero open CVEs** in production dependencies

The B2B template adds enterprise-grade gates: TLS A-grade, WorkOS SSO end-to-end, SCIM provisioning/deprovisioning, organization RLS, RBAC at middleware and DB, audit log capturing every mutation + auth event, ACH/wire billing, DPA + MSA templates, public subprocessor list.

SaaS skills under `skills/saas/` (12 skill bodies): stripe-subscriptions · clerk-auth · workos-sso · multi-tenancy-row-level · resend-email · posthog-analytics · sentry-errors · supabase-data · inngest-jobs · rate-limiting · vercel-deploy · legal-scaffold.

---

## EU Compliance Program (GDPR + EU AI Act)

CTO Chief ships an **advisory** compliance program that flags GDPR and EU-AI-Act exposure while you plan and build — it never weakens a human gate or blocks a transition on its own. It advises; you decide. Choosing a regime (Lesson 1) switches the review on; it does not enforce any regulatory control, and a chosen regime must not be read as compliance coverage.

| Agent | Role |
|-------|------|
| [`compliance/gdpr-agent`](agents/compliance/gdpr-agent.md) | GDPR advisory — lawful basis, data-subject rights, retention, DPIA triggers, cross-border transfer |
| [`compliance/eu-ai-act-agent`](agents/compliance/eu-ai-act-agent.md) | EU AI Act advisory — risk-tier classification (prohibited / high-risk / GPAI), obligations, incident-reporting windows |
| [`compliance/eu-solution-recommender`](agents/compliance/eu-solution-recommender.md) | Given a flagged obligation, recommends concrete engineering solutions with web-verified sources |

**Iron Loop integration.** At the functional → implementation transition, CTO Chief runs the compliance trigger and, when a regime is on, the compliance evaluation as two shipped recipes; findings are deduplicated and attached to the plan and your inbox. A regulatory-regime profile framework sits alongside (see [`REGULATORY_OPS.md`](docs/REGULATORY_OPS.md)). Complementary compliance **skills** ship under `skills/compliance/` — `gdpr-compliance-checker`, `audit-log-checker`, `license-scanner`, `sbom-cra-checker`, `ai-governance-checker`.

---

## Local Semantic Plan-Index (vector search over plans)

CTO Chief keeps a **local vector index** of every plan so it can reason about the plan corpus semantically — no external service, no data leaving the machine. It lives under `src/lib/plan-index/` and is fully shipped and live.

| Capability | What it does | Module |
|------------|--------------|--------|
| **Semantic search** | Find plans by meaning, not keyword match | `search.js`, `fusion.js` |
| **Related plans** | Surface plans semantically adjacent to the one you're editing | `related.js` |
| **Duplicate guard** | Warn when a new plan restates an existing one before you commit effort | `duplicate-guard.js`, `content-hash.js` |
| **Conflict detection** | Flag plans whose goals or file targets contradict each other | `conflict-detect.js` |

Embeddings are produced by a local model via `embedder.js` / `ollama-client.js` (with a `hardware-probe.js` capability check and an in-process fallback engine). The store is an in-memory JSON index with brute-force cosine similarity — the right-sized choice below the ~10k-vector crossover for a plan corpus. A `PostToolUse.plan-index-sync` hook re-embeds plans as they change, so search always reflects fresh disk state. The gate-critique fleet uses `related` and `detectConflicts` to judge each waiting plan against its siblings.

---

## Environments — dev / staging / prod

CTO Chief runs in a chosen **environment** that tunes its *own* behavior — how strictly it enforces planning, the default model, and log verbosity. This is separate from deploying your app.

| Environment | Enforcement | Auto-push | Notable |
|-------------|-------------|-----------|---------|
| `dev` | soft (warn, never block) | off | Fast local iteration; cost estimates shown |
| `staging` | strict | off (manual push) | Rehearse production; auto-move to review |
| `prod` | strict | off unless you set `git.autoPushEnabled` | Locked down; top model; minimal noise |
| `ask` *(default)* | — | — | No profile applied; the dashboard asks you to choose |

**Resolution order** — any value you set explicitly always wins:

```
explicit user setting  >  environment profile  >  per-setting default
```

**The four human gates are mandatory in every environment**, and no profile may set `git.autoPushEnabled` to true — enforced by `tests/environment-mode.test.js`.

---

## Enforcement

| Channel | Hook | Decision |
|---|---|---|
| `Edit`, `Write`, `MultiEdit`, `NotebookEdit` | `PreToolUse.<tool>.js` | whitelist → plan coverage (approved plans only) → escape phrase you typed → `enforcement.mode` |
| Shell commands that write a file | `PreToolUse.Bash.js` | same coverage oracle, mode-blind: an uncovered determinate write is denied at every mode |
| Plan files at a gate destination | `human-gate-check.js` | no human marker → the plan is reverted and the violation logged |
| Approval ledger, verify evidence, question store | all channels | denied to agents outright |

Escape phrases (typed by you): `hotfix`, `trivial fix`, `trivial change`, `quick fix`, `urgent`, `skip planning`, `skip iron loop`. Always writable: `.ctoc/**` (except the three protected stores and the quality command tables), `.local/**`, `plans/**/*.md`, `VERSION`, `.gitignore`, `.gitattributes`. Every decision is logged to `.ctoc/logs/enforcement.json` with the resolved mode, so an audit can tell a permitted edit from an unenforced one.

---

## Smart Quality Gates

A background quality agent runs on every commit without blocking your workflow; `/ctoc:push` runs the same checks in the foreground.

| Tier | When | Checks | Blocking? |
|------|------|--------|-----------|
| 1 | Every commit | lint, typecheck, affected tests, secrets, critical CVEs | Yes (blocks push) |
| 2 | Every commit | coverage, complexity, duplication, medium CVEs | No (warnings) |
| 3 | Stage transitions | docs, circular deps, bundle size, benchmarks | At transition |
| 4 | CI only | full tests, e2e, mutation, memory, license | CI |

A check with zero detected tools reports **NOT VERIFIED** and fails its tier — a non-run never reads as a clean run.

---

## Deployment Pipeline

After the final gate (review → done), CTO Chief can promote the approved commit to your deploy targets. You work in **dev/local** — that is the *source*, never a target. The only deploy targets are **staging** and **production**:

```
                         ┌──────────────► staging ──(review)──┐
work (dev/local) ────────┤                                    ▼
 approved commit         └──────────────────────────────► production
                                       (direct)

Target strategies: git-branch · git-tag · webhook · script · docker · ssh
```

Each strategy is really executed — `git-branch` pushes to the environment branch, `git-tag` tags, `webhook` POSTs, `script` runs your deploy script (with `DEPLOY_ENV`/`DEPLOY_COMMIT` exported), `docker` builds and optionally pushes, `ssh` runs your remote command.

**Safe by default (`dry_run`).** Deployment ships with `dry_run: true`: every strategy builds and returns its real command but performs **nothing**. Set `dry_run: false` only when you want it to actually deploy.

```json
{
  "deployment": {
    "enabled": true,
    "dry_run": false,
    "remote": "origin",
    "environments": [
      { "name": "staging", "enabled": true, "strategy": "git-branch", "branch": "deploy/staging" },
      { "name": "production", "enabled": true, "strategy": "git-branch", "branch": "deploy/production" }
    ],
    "approval": { "staging": "auto", "production": "manual" },
    "notifications": { "on_success": [], "on_failure": ["https://hooks.example.com/deploy"] },
    "rollback": { "auto_rollback": true, "keep_history": 10 }
  }
}
```

`production: manual` pauses before production and waits for approval. History and latest status are stored in `.ctoc/deployments/` (`history.json`, `latest.json`).

---

## Agents

**124 agents across 24 categories** — [browse all →](agents/)

<details>
<summary><strong>Full agent list</strong></summary>

| Category | # | Agents |
|----------|---|--------|
| [SaaS](agents/saas/) | 11 | [clerk-auth](agents/saas/clerk-auth.md), [stripe-subscriptions](agents/saas/stripe-subscriptions.md), [multi-tenancy-row-level](agents/saas/multi-tenancy-row-level.md), [resend-email](agents/saas/resend-email.md), [posthog-analytics](agents/saas/posthog-analytics.md), [sentry-errors](agents/saas/sentry-errors.md), [supabase-data](agents/saas/supabase-data.md), [inngest-jobs](agents/saas/inngest-jobs.md), [rate-limiting](agents/saas/rate-limiting.md), [vercel-deploy](agents/saas/vercel-deploy.md), [legal-scaffold](agents/saas/legal-scaffold.md) |
| [Testing](agents/testing/) | 14 | [unit](agents/testing/runners/unit-test-runner.md), [integration](agents/testing/runners/integration-test-runner.md), [e2e](agents/testing/runners/e2e-test-runner.md), [mutation](agents/testing/runners/mutation-test-runner.md), [smoke](agents/testing/runners/smoke-test-runner.md), [quality-gate-runner](agents/testing/quality-gate-runner.md), [playwright-qa](agents/testing/playwright-qa.md), [coverage-enforcer](agents/testing/coverage-enforcer.md), [coverage-mapper](agents/testing/coverage-mapper.md), [smart-test-runner](agents/testing/smart-test-runner.md), [unit-writer](agents/testing/writers/unit-test-writer.md), [e2e-writer](agents/testing/writers/e2e-test-writer.md), [integration-writer](agents/testing/writers/integration-test-writer.md), [property-writer](agents/testing/writers/property-test-writer.md) |
| [Quality](agents/quality/) | 11 | [architecture-checker](agents/quality/architecture-checker.md), [code-reviewer](agents/quality/code-reviewer.md), [complexity-analyzer](agents/quality/complexity-analyzer.md), [complexity-reducer](agents/quality/complexity-reducer.md), [type-checker](agents/quality/type-checker.md), [code-smell-detector](agents/quality/code-smell-detector.md), [dead-code-detector](agents/quality/dead-code-detector.md), [duplicate-code-detector](agents/quality/duplicate-code-detector.md), [consistency-checker](agents/quality/consistency-checker.md), [quality-gate](agents/quality/quality-gate.md), [performance-validator](agents/quality/performance-validator.md) |
| [Specialized](agents/specialized/) | 11 | [performance-profiler](agents/specialized/performance-profiler.md), [memory-safety-checker](agents/specialized/memory-safety-checker.md), [accessibility-checker](agents/specialized/accessibility-checker.md), [database-reviewer](agents/specialized/database-reviewer.md), [api-contract-validator](agents/specialized/api-contract-validator.md), [configuration-validator](agents/specialized/configuration-validator.md), [error-handler-checker](agents/specialized/error-handler-checker.md), [health-check-validator](agents/specialized/health-check-validator.md), [observability-checker](agents/specialized/observability-checker.md), [resilience-checker](agents/specialized/resilience-checker.md), [translation-checker](agents/specialized/translation-checker.md) |
| [Planning](agents/planning/) | 7 | [vision-advisor](agents/planning/vision-advisor.md), [vision-decomposer](agents/planning/vision-decomposer.md), [product-owner](agents/planning/product-owner.md), [implementation-planner](agents/planning/implementation-planner.md), [stack-chooser](agents/planning/stack-chooser.md), [kpi-planner](agents/planning/kpi-planner.md), [unit-economics-modeler](agents/planning/unit-economics-modeler.md) |
| [Security](agents/security/) | 10 | [security-scanner](agents/security/security-scanner.md), [secrets-detector](agents/security/secrets-detector.md), [dependency-checker](agents/security/dependency-checker.md), [dependency-auditor](agents/security/dependency-auditor.md), [input-validation-checker](agents/security/input-validation-checker.md), [concurrency-checker](agents/security/concurrency-checker.md), [sast-scanner](agents/security/sast-scanner.md), [threat-modeler](agents/security/threat-modeler.md), [incident-responder](agents/security/incident-responder.md), [cra-incident-clocks](agents/security/cra-incident-clocks.md) |
| [Infrastructure](agents/infrastructure/) | 6 | [terraform-validator](agents/infrastructure/terraform-validator.md), [kubernetes-checker](agents/infrastructure/kubernetes-checker.md), [docker-security-checker](agents/infrastructure/docker-security-checker.md), [ci-pipeline-checker](agents/infrastructure/ci-pipeline-checker.md), [ci-runner-setup](agents/infrastructure/ci-runner-setup.md), [deployment-setup](agents/infrastructure/deployment-setup.md) |
| [Compliance](agents/compliance/) | 6 | [gdpr-agent](agents/compliance/gdpr-agent.md), [eu-ai-act-agent](agents/compliance/eu-ai-act-agent.md), [eu-solution-recommender](agents/compliance/eu-solution-recommender.md), [audit-log-checker](agents/compliance/audit-log-checker.md), [license-scanner](agents/compliance/license-scanner.md), [sbom-cra-checker](agents/compliance/sbom-cra-checker.md) |
| [Iron Loop](agents/iron-loop/) | 8 | [integrator](agents/iron-loop/iron-loop-integrator.md), [critic](agents/iron-loop/iron-loop-critic.md), [executor](agents/iron-loop/iron-loop-executor.md), [premortem-critic](agents/iron-loop/premortem-critic.md), [devils-advocate-critic](agents/iron-loop/devils-advocate-critic.md), [red-team-critic](agents/iron-loop/red-team-critic.md), [advocate-critic](agents/iron-loop/advocate-critic.md), [gate-critic](agents/iron-loop/gate-critic.md) |
| [Pipeline](agents/pipeline/) | 5 | [agent-writer](agents/pipeline/agent-writer.md), [agent-critic](agents/pipeline/agent-critic.md), [agent-tester](agents/pipeline/agent-tester.md), [agent-qa](agents/pipeline/agent-qa.md), [agent-publisher](agents/pipeline/agent-publisher.md) |
| [AI Quality](agents/ai-quality/) | 4 | [hallucination-detector](agents/ai-quality/hallucination-detector.md), [ai-code-quality-reviewer](agents/ai-quality/ai-code-quality-reviewer.md), [citation-validator](agents/ai-quality/citation-validator.md), [llm-security-tester](agents/ai-quality/llm-security-tester.md) |
| [Safety](agents/safety/) | 3 | [fault-tree-builder](agents/safety/fault-tree-builder.md), [fmeda-analyzer](agents/safety/fmeda-analyzer.md), [redundancy-pattern-picker](agents/safety/redundancy-pattern-picker.md) |
| [Coordinator](agents/coordinator/) | 3 | [cto-chief](agents/coordinator/cto-chief.md) (Tier 0), [ivv-chief](agents/coordinator/ivv-chief.md), [synthesizer](agents/coordinator/synthesizer.md) |
| [Data/ML](agents/data-ml/) | 3 | [data-quality-checker](agents/data-ml/data-quality-checker.md), [ml-model-validator](agents/data-ml/ml-model-validator.md), [feature-store-validator](agents/data-ml/feature-store-validator.md) |
| [Frontend](agents/frontend/) | 3 | [bundle-analyzer](agents/frontend/bundle-analyzer.md), [component-tester](agents/frontend/component-tester.md), [visual-regression-checker](agents/frontend/visual-regression-checker.md) |
| [Mobile](agents/mobile/) | 3 | [ios-checker](agents/mobile/ios-checker.md), [android-checker](agents/mobile/android-checker.md), [react-native-bridge-checker](agents/mobile/react-native-bridge-checker.md) |
| [Versioning](agents/versioning/) | 3 | [backwards-compatibility-checker](agents/versioning/backwards-compatibility-checker.md), [feature-flag-auditor](agents/versioning/feature-flag-auditor.md), [technical-debt-tracker](agents/versioning/technical-debt-tracker.md) |
| [Realtime](agents/realtime/) | 2 | [hil-harness](agents/realtime/hil-harness.md), [wcet-budget](agents/realtime/wcet-budget.md) |
| [Legal](agents/legal/) | 2 | [clm-obligations](agents/legal/clm-obligations.md), [dsar-handler](agents/legal/dsar-handler.md) |
| [Architecture](agents/architecture/) | 2 | [pattern-detector](agents/architecture/pattern-detector.md), [dependency-analyzer](agents/architecture/dependency-analyzer.md) |
| [DevEx](agents/devex/) | 2 | [onboarding-validator](agents/devex/onboarding-validator.md), [api-deprecation-checker](agents/devex/api-deprecation-checker.md) |
| [Documentation](agents/documentation/) | 2 | [documentation-updater](agents/documentation/documentation-updater.md), [changelog-generator](agents/documentation/changelog-generator.md) |
| [Product](agents/product/) | 2 | [product-reviewer](agents/product/product-reviewer.md), [experiment-designer](agents/product/experiment-designer.md) |
| [Cost](agents/cost/) | 1 | [cloud-cost-analyzer](agents/cost/cloud-cost-analyzer.md) |

</details>

Agents spawn conditionally based on your project and current Iron Loop step. No agent may skip another: if a pillar is in scope, its watcher runs and thinks about the code.

> Three specialist skills have no agent file of their own and are reached through the skill auto-load mechanism below: `ai-governance-checker`, `workos-sso`, and `gdpr-compliance-checker` (whose body the rich `gdpr-agent` dispatches).

**How skills reach you after install.** Claude Code auto-discovers every artifact the plugin ships — slash commands, agents, hooks, skills — per the [Claude Code Plugins reference](https://code.claude.com/docs/en/plugins-reference). The specialist `SKILL.md` files then become available through three routing paths: (1) the pipeline — CTO Chief dispatches a Tier-1 sub-orchestrator, which dispatches the Tier-2 specialist by name; (2) `when_to_load` trigger phrases declared in each skill's frontmatter (e.g. `"SBOM"`, `"prompt injection"`), which auto-load the skill when your conversation matches; (3) direct invocation through Claude Code's built-in `Skill` tool.

---

## Skills

**429 skill files** — [browse all →](skills/). Loaded on demand based on your stack and the current Iron Loop step.

There are two kinds of skills:

1. **Tier-2 specialist skill bodies (101)** — the actual expert agents that run during Iron Loop and refinement-loop steps: 99 Tier-2 specialists plus the ambient `ask-me-questions` decision format and the preloaded gate-lens skill. Each lives at `skills/<category>/<name>/SKILL.md` with a structured findings contract.
2. **Knowledge skills (328)** — a web-verified reference library: 50 language guides, 211 framework guides (85 web, 44 AI/ML, 52 data, 15 DevOps, 15 mobile), 61 per-language quality-config references, and 6 shared agent fragments (the honest-status rule, plain gate words, warnings-are-critical, and their siblings). Each guide was brought current against 2026 authoritative sources — no invented statistics. Guides declare their checkable version and link claims in a machine-readable block; `node src/scripts/verify-claims.js` checks the declared ones against the live registries, and a census reports how many guides still declare nothing, so partial coverage is never mistaken for coverage.

**The quality bar.** Every specialist body went through an explicit improvement loop — `websearch → update → critique → update` (a second critique round for brand-new skills). Every `SKILL.md` ships YAML frontmatter with `when_to_load` triggers and an effort level, a `## 2026 Best Practices` section with sourced citations, 7-language coverage (C#, Java, Python, C, C++, JS/TS, SQL) of BAD/SAFE pattern pairs where it applies, a tool-integration matrix with current commands, a severity block (every finding is `critical` on the wire — warnings are bugs), and a machine-readable letter schema for the refinement loop.

<details>
<summary><strong>Specialist skill bodies (Tier 2) — 99 across 20 categories</strong></summary>

| Category | # | Skill bodies |
|----------|---|--------------|
| [SaaS](skills/saas/) | 12 | clerk-auth · stripe-subscriptions · workos-sso · multi-tenancy-row-level · resend-email · posthog-analytics · sentry-errors · supabase-data · inngest-jobs · rate-limiting · vercel-deploy · legal-scaffold |
| [Quality](skills/quality/) | 11 | architecture-checker · code-reviewer · complexity-analyzer · complexity-reducer · code-smell-detector · consistency-checker · dead-code-detector · duplicate-code-detector · performance-validator · quality-gate · type-checker |
| [Specialized](skills/specialized/) | 11 | accessibility-checker · api-contract-validator · configuration-validator · database-reviewer · error-handler-checker · health-check-validator · memory-safety-checker · observability-checker · performance-profiler · resilience-checker · translation-checker |
| [Security](skills/security/) | 10 | security-scanner · sast-scanner · secrets-detector · input-validation-checker · concurrency-checker · dependency-checker · dependency-auditor · threat-modeler · incident-responder · cra-incident-clocks |
| [Testing](skills/testing/) | 14 | playwright-qa · coverage-enforcer · coverage-mapper · smart-test-runner · quality-gate-runner · 4 writers · 5 runners |
| [Infrastructure](skills/infrastructure/) | 5 | terraform-validator · kubernetes-checker · docker-security-checker · ci-pipeline-checker · ci-runner-setup |
| [Compliance](skills/compliance/) | 5 | audit-log-checker · gdpr-compliance-checker · license-scanner · sbom-cra-checker · ai-governance-checker |
| [AI Quality](skills/ai-quality/) | 3 | ai-code-quality-reviewer · hallucination-detector · llm-security-tester |
| [Data/ML](skills/data-ml/) | 3 | data-quality-checker · feature-store-validator · ml-model-validator |
| [Frontend](skills/frontend/) | 3 | bundle-analyzer · component-tester · visual-regression-checker |
| [Mobile](skills/mobile/) | 3 | android-checker · ios-checker · react-native-bridge-checker |
| [Versioning](skills/versioning/) | 3 | backwards-compatibility-checker · feature-flag-auditor · technical-debt-tracker |
| [Safety](skills/safety/) | 3 | fault-tree-builder · fmeda-analyzer · redundancy-pattern-picker |
| [Architecture](skills/architecture/) | 2 | pattern-detector · dependency-analyzer |
| [DevEx](skills/devex/) | 2 | api-deprecation-checker · onboarding-validator |
| [Documentation](skills/documentation/) | 2 | changelog-generator · documentation-updater |
| [Product](skills/product/) | 2 | product-reviewer · experiment-designer |
| [Legal](skills/legal/) | 2 | clm-obligations · dsar-handler |
| [Realtime](skills/realtime/) | 2 | hil-harness · wcet-budget |
| [Cost](skills/cost/) | 1 | cloud-cost-analyzer |

</details>

<details>
<summary><strong>Knowledge skills — 328 reference files</strong></summary>

| Type | # | Examples |
|------|---|----------|
| [Languages](skills/languages/) | 50 | [Python](skills/languages/python.md), [TypeScript](skills/languages/typescript.md), [Go](skills/languages/go.md), [Rust](skills/languages/rust.md), [Java](skills/languages/java.md), [C#](skills/languages/csharp.md), [Swift](skills/languages/swift.md), [Kotlin](skills/languages/kotlin.md), [Ruby](skills/languages/ruby.md), [PHP](skills/languages/php.md) |
| [Web frameworks](skills/frameworks/web/) | 85 | [React](skills/frameworks/web/react.md), [Next.js](skills/frameworks/web/nextjs.md), [Vue](skills/frameworks/web/vue.md), [Django](skills/frameworks/web/django.md), [FastAPI](skills/frameworks/web/fastapi.md), [Rails](skills/frameworks/web/rails.md), [Spring Boot](skills/frameworks/web/spring-boot.md), [Express](skills/frameworks/web/express.md) |
| [AI/ML frameworks](skills/frameworks/ai-ml/) | 44 | [PyTorch](skills/frameworks/ai-ml/pytorch.md), [LangChain](skills/frameworks/ai-ml/langchain.md), [Hugging Face](skills/frameworks/ai-ml/huggingface-hub.md), [MLflow](skills/frameworks/ai-ml/mlflow.md), [TensorFlow](skills/frameworks/ai-ml/tensorflow.md) |
| [Data frameworks](skills/frameworks/data/) | 52 | [MongoDB](skills/frameworks/data/mongodb.md), [Redis](skills/frameworks/data/redis.md), [Kafka](skills/frameworks/data/kafka.md), [Spark](skills/frameworks/data/spark.md), [Elasticsearch](skills/frameworks/data/elasticsearch.md), [DuckDB](skills/frameworks/data/duckdb.md) |
| [DevOps frameworks](skills/frameworks/devops/) | 15 | [Docker](skills/frameworks/devops/docker.md), [Kubernetes](skills/frameworks/devops/kubernetes.md), [Helm](skills/frameworks/devops/helm.md), [Ansible](skills/frameworks/devops/ansible.md), [Pulumi](skills/frameworks/devops/pulumi.md) |
| [Mobile frameworks](skills/frameworks/mobile/) | 15 | [React Native](skills/frameworks/mobile/react-native.md), [Flutter](skills/frameworks/mobile/flutter.md), [SwiftUI](skills/frameworks/mobile/swiftui.md), [Jetpack Compose](skills/frameworks/mobile/jetpack-compose.md) |
| [Quality configs](skills/quality-configs/) | 61 | Per-language lint, format, and test configs |
| [Agent fragments](skills/agent-fragments/) | 6 | honest-status · plain-gate-words · warnings-are-critical and siblings, referenced by every dispatchable agent |

</details>

---

## How CTO Chief Compares

| | CTO Chief | Cursor Rules | Raw Claude Code | GitHub Copilot |
|--|-----------|-------------|----------------|----------------|
| Ideation with product owner | AI explores your idea before planning | None | None | None |
| Planning before coding | 6-step plan with adversarial review | Manual rules file | None | None |
| Step-driven question routing | Questions scoped to your current Iron Loop step | None | None | None |
| Precomputed gate decisions | Adversarial fleet writes pros/cons before you look | None | None | None |
| File-scoped write permission | A plan's `files:` is the build's permission | None | None | None |
| 6-month pre-mortem + 5-scenario cash flow | Built into canvas | None | None | None |
| TDD enforcement | Automatic (Step 8) | Manual | Manual | None |
| Security scanning | Built-in (Steps 9, 13) | Manual | Manual | None |
| Threat modeling (STRIDE / PASTA / LINDDUN / ATT&CK / ATLAS) | Built-in (`threat-modeler`) | None | None | None |
| LLM security testing (OWASP LLM Top 10 v2) | Built-in (`llm-security-tester`) | None | None | None |
| EU CRA + SBOM compliance | Built-in (`sbom-cra-checker`) | None | None | None |
| AI governance (EU AI Act / NIST AI RMF / ISO 42001) | Built-in (`ai-governance-checker`) | None | None | None |
| Incident response (NIST 800-61r3, SEC 8-K, NIS2) | Built-in (`incident-responder`) | None | None | None |
| Iterative refinement to zero findings | Refinement loop (incl. warnings) | None | None | None |
| Human approval gates | 4 mandatory checkpoints | None | None | None |
| Quality verification | Automated gate (Step 14) | Manual | Manual | None |
| Specialist agents | 124 across 24 categories | None | DIY | None |
| Specialist skill library (engineered, sourced) | 99 SKILL.md bodies through critique loop | None | None | None |
| Production-readiness checklist | SaaS templates with 20+ block-severity checks | None | None | None |
| Post-launch product loop | KPI library + experiment designer | None | None | None |

---

<details>
<summary><strong>Troubleshooting</strong></summary>

**Plugin not found:**
```
/plugin marketplace add https://github.com/robotijn/ctoc
/plugin install ctoc
```

**Plugin stale after update:**
```
/ctoc:update
```
Then restart Claude Code.

**"Edit BLOCKED: no active plan covers this file":** intentional — see [Lesson 7](#lesson-7--when-cto-chief-says-no). Create or activate a covering plan through `/ctoc:start`, type an escape phrase yourself for a genuinely small change, or set `enforcement.mode: soft` in `.ctoc/settings.yaml`.

**Dashboard shows no plans:** describe what you want to build, or pick **Start something new**. CTO Chief creates the plan with you.

**A plan was moved back on its own:** it sat at a gate destination without your approval marker; the gate hook reverted it and logged the violation to `.ctoc/logs/gate-violations.json`. Approve it through the dashboard.

**Health check:** System → Doctor on the dashboard.

</details>

<details>
<summary><strong>For developers</strong></summary>

**Requirements:** Claude Code >= 1.0.0, Node.js >= 18.0.0

See [CLAUDE.md](CLAUDE.md) for full contributor instructions and [IRON_LOOP.md](docs/IRON_LOOP.md) for methodology details.

**Run the gated test suite:**
```bash
npm test                      # the gate: full suite + coverage floor + zero-skipped
node --test tests/*.test.js   # fast pass only — does NOT enforce the floor
```

**Version management:**
```javascript
const { release, getVersion, syncAll, checkForUpdates } = require('./src/lib/version');

getVersion()       // → '6.14.49'
release()          // → bumps patch, syncs all files
release('minor')   // → bumps minor
release('major')   // → bumps major
```

Files synced by `release()`: `VERSION` (source of truth), `.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json`, `README.md`

**Project structure:**
```
ctoc/
├── docs/            16 docs: IRON_LOOP.md, AGENT_ARCHITECTURE.md, REFINEMENT_LOOP.md,
│                    PRODUCT_LOOP.md, DISPATCH_PROTOCOL.md, EVALUATION_HARNESS.md,
│                    INDEPENDENCE.md, REGULATORY_OPS.md, REALTIME.md, PROCESS_FMEA.md,
│                    CRITICAL_CONTROL_POINTS.md, CONTINUOUS_IMPROVEMENT.md,
│                    CONFIG_SOURCES.md, SECURITY_LINT.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md
├── src/
│   ├── commands/    3 slash commands — start, push, update (.md spec + .js impl)
│   ├── hooks/       17 Claude Code hooks (session start, user-prompt-submit routing
│   │                reminder, pre/post tool use, stop-continuation gate, subagent fence)
│   ├── lib/         134 JS modules (planning, streaming gate, scheduler, quality,
│   │                enforcement, the EU-compliance program, the fences) plus plan-index/
│   │                (the local semantic vector search)
│   ├── areas/       5 dashboard areas (pipeline, inbox, agent, library, system)
│   ├── tabs/        4 legacy tab modules kept for drill-in flows
│   ├── scripts/     10 build/release utilities
│   └── data/        Static data files
├── agents/          124 agent definitions across 24 categories
├── skills/          429 skill files: 101 specialist bodies (SKILL.md)
│                    + 328 reference files (50 langs, 211 frameworks,
│                    61 quality configs, 6 agent-fragments/ — the cross-cutting
│                    rules every agent carries: ancestry-read, async-choice-protocol,
│                    honest-status, no-stub-rule, plain-gate-words, warnings-are-critical)
├── tests/           524 test files (run with `npm test`)
├── .ctoc/           Config, templates, operations, audit, loop journals, baselines
│   ├── templates/   CLAUDE.md.template, canvas templates, SaaS templates,
│   │                questions.yaml, product-kpis.yaml
│   ├── architecture/  tier-definitions.yaml, dispatch-schema.yaml
│   ├── audit/       dispatches/YYYY-MM-DD/<id>.yaml (one per dispatch)
│   ├── streaming/   questions/ — the precomputed gate questions
│   └── loops/       <plan-slug>/journal.yaml (refinement-loop history)
└── .claude-plugin/  Plugin metadata (plugin.json, marketplace.json, hooks.json)
```

</details>

---

## How this README was designed

The structure follows the course-design literature rather than a feature inventory: outcomes first and everything designed backward from them ([backward design](https://tll.mit.edu/teaching-resources/course-design/backward-design/), [evidence-based course design](https://sheridan.brown.edu/resources/course-design/evidence-based-course-design-practices)); complete worked examples before independent practice, then faded guidance ([the worked-example effect](https://link.springer.com/rwe/10.1007/978-1-4419-1428-6_20), [guidance fading](https://link.springer.com/chapter/10.1007/978-1-4419-8126-4_13)); a retrieval check after every lesson ([retrieval practice](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12292765/)); and a strict separation of tutorial, how-to, and reference so no single page carries three jobs at once ([Diátaxis](https://diataxis.fr/start-here/)).

---

## License

[PolyForm Shield 1.0.0](https://polyformproject.org/licenses/shield/1.0.0) — See [LICENSE](LICENSE)

Use CTO Chief freely for any project. You may not offer CTO Chief itself or a derivative as a competing product or service without permission. For commercial licensing inquiries, contact the licensor.

## Links

[Repository](https://github.com/robotijn/ctoc) · [Issues](https://github.com/robotijn/ctoc/issues) · [Discussions](https://github.com/robotijn/ctoc/discussions)

> [!NOTE]
> CTO Chief is open source and actively developed. [Issues](https://github.com/robotijn/ctoc/issues), [PRs](https://github.com/robotijn/ctoc/pulls), and [skill improvement suggestions](https://github.com/robotijn/ctoc/issues/new?template=skill-improvement.yml) are welcome.

---

**6.14.49** · Built by [@robotijn](https://github.com/robotijn)

<p align="center"><i>"Excellence is not an act, but a habit."</i></p>
