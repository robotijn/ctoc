# Evaluation-Driven Development Harness

> v8.5 — The Continuous Tool of Continuous Tools (CTOC) is itself a quality
> system. A quality system that cannot measure its own outputs cannot improve
> them. This document specifies the Evaluation-Driven Development (EDD) harness
> that closes that loop.

## Why evaluation matters

Large-language-model-powered agent skills drift. A skill that produced a
correct Spoofing-Tampering-Repudiation-Information disclosure-Denial of
service-Elevation of privilege (STRIDE) decomposition last month can quietly
start hallucinating mitigations after a model upgrade, a prompt edit, or a
context-format change upstream. The drift is invisible by inspection — the
output still **looks** right.

Anthropic's own internal practice — published with the `skill-creator`
reference skill — is to attach a deterministic evaluation suite to every
non-trivial skill, replay the suite on every change, and treat regressions as
build failures. (Reference: Anthropic Claude Code Skills — `skill-creator`
evaluation pattern; see also the public write-up at
<https://www.adwaitx.com/claude-agent-skills-skill-creator-evals/>.) The
April 2026 Claude Code quality-regression postmortem reinforced the lesson:
"Models that cannot be measured cannot be trusted." Evaluation-Driven
Development (EDD) is the practice of writing the eval **before** the skill,
and never accepting a change that lowers the eval score.

The Continuous Tool of Continuous Tools (CTOC) adopts the same pattern. Every
skill under `skills/**` is eligible for an eval suite under `evals/<same
path>/cases/*.yaml`. The harness in `src/lib/eval-harness.js` runs the cases;
the comparator agent in `src/lib/comparator-agent.js` performs blind A/B
comparison between the baseline skill version and the candidate skill
version; the runner in `src/scripts/run-evals.js` aggregates the verdicts;
the continuous-integration workflow in `.github/workflows/evals.yml` fails
the build when the regression exceeds the configured threshold.

## The comparator-agent pattern

The harness mirrors Anthropic's published `skill-creator` evaluation pattern:

```
                  ┌────────────────────────────────────────┐
case input ──────►│ skill version A (baseline, main)       │──► output A
                  └────────────────────────────────────────┘
                  ┌────────────────────────────────────────┐
case input ──────►│ skill version B (candidate, branch)    │──► output B
                  └────────────────────────────────────────┘
                                    │
                                    ▼
                  ┌────────────────────────────────────────┐
input + A + B ───►│ comparator agent (Claude as judge)     │──► verdict
                  │  - blind to which is A vs B            │     {A | B | tie}
                  │  - 14 quality dimensions (ISO 25010)   │     confidence
                  │  - structured reasoning                │     reasoning
                  └────────────────────────────────────────┘
```

The comparator is run **blind**: the judge does not know which output came
from the baseline. The harness shuffles the (A, B) labels per case and
un-shuffles after the verdict is captured. This prevents position bias —
documented in the Anthropic and Allen Institute for Artificial Intelligence
(AI2) literature on Large Language Model as Judge (LLM-as-judge) reliability.

A case is **passed** when:

1. The candidate output contains every entry in `expected_findings`.
2. The candidate output contains **none** of the entries in `must_not_contain`.
3. The comparator's verdict is `B` (candidate wins) or `tie` with confidence
   at least the configured `tie_floor` (default 0.6).

A case is **failed** when the comparator's verdict is `A` (baseline wins)
with confidence at least the `regression_floor` (default 0.6), or when any
`expected_findings` entry is missing, or when any `must_not_contain` entry
appears.

## Regression threshold

The harness aggregates per-case verdicts into a single pass rate. The default
regression threshold is **0.95**: the candidate must pass at least 95 percent
of cases, weighted by `severity_when_fails`:

| Severity     | Weight |
|--------------|-------:|
| critical     |    4.0 |
| high         |    2.0 |
| medium       |    1.0 |
| low          |    0.5 |

The continuous-integration job fails when the weighted pass rate falls below
the threshold. The threshold is configurable via the `--threshold` flag on
`src/scripts/run-evals.js` and via the repository-level setting
`evaluation.regression_threshold` in `.ctoc/settings.yaml`.

## The case-file schema

Each case lives at `evals/<skill-path>/cases/<case-name>.yaml`. The template
is `evals/_template.yaml`. Required fields:

| Field                 | Type            | Purpose |
|-----------------------|-----------------|---------|
| `id`                  | string          | Stable identifier; reused across versions. |
| `skill`               | string          | Path under `skills/` this case evaluates (for example, `security/threat-modeler`). |
| `description`         | string          | One-sentence purpose. |
| `input`               | multi-line text | The prompt or invocation that triggers the skill. |
| `expected_output`     | multi-line text | The reference answer or pattern. May be a pattern; the comparator agent decides similarity. |
| `expected_findings`   | list of strings | Finding identifiers that **must** appear. Empty list is allowed. |
| `must_not_contain`    | list of strings | Strings that **must not** appear. Empty list is allowed. |
| `severity_when_fails` | enum            | `critical` \| `high` \| `medium` \| `low`. Controls weight. |
| `contributed_by`      | string          | GitHub handle (preferred) or `(maintainer)`. |
| `added_in_version`    | string          | CTOC version that added this case (for example, `8.5.0`). |
| `last_verified`       | ISO 8601 date   | Date the case was last replayed and confirmed correct. |

Optional fields:

| Field           | Type      | Purpose |
|-----------------|-----------|---------|
| `tags`          | list      | Free-form tags for filtering (for example, `owasp`, `mitre-atlas`). |
| `references`    | list      | Citations supporting the expected output. |
| `timeout_ms`    | integer   | Per-case timeout. Default 60000. |
| `flaky`         | boolean   | If true, the case is allowed to fail once before counting. |

## Contributor lifecycle

Community contributions flow through GitHub fork plus pull request only. The
Continuous Tool of Continuous Tools does **not** collect telemetry, does not
implement opt-in tracking, voting, or reputation systems. Every signal comes
from files in the repository.

```
                                                            (regression-aware)
contributor                                                            CI run
   │                                                                     │
   │ 1. fork repo                                                        │
   │ 2. add evals/<skill>/cases/<case>.yaml                              │
   │ 3. run locally:                                                     │
   │      node src/scripts/run-evals.js --only=<skill>                   │
   │ 4. open PR                                                          │
   ├─────────────────────────────────────────────────────────────────────┤
   │                       maintainer review                             │
   │  - confirm input is realistic                                       │
   │  - confirm expected_output is correct (cite source)                 │
   │  - confirm severity is calibrated                                   │
   │  - merge when all three are satisfied                               │
   ├─────────────────────────────────────────────────────────────────────┤
   │           case becomes part of the regression baseline              │
   │           every future PR that touches the skill replays it         │
   └─────────────────────────────────────────────────────────────────────┘
```

The maintainer's bar is calibrated to the user's role as an Artificial
Intelligence (AI) research professor: cases must cite a source for the
expected output (OWASP, MITRE Adversarial Threat Landscape for
Artificial-Intelligence Systems (MITRE ATLAS), Stripe documentation, Request
For Comments (RFC), peer-reviewed paper). Invented numbers and unsourced
claims are rejected.

## End-to-end example

A contributor wants to harden the `skills/security/threat-modeler` skill
against a regression where a model upgrade caused the skill to forget the
"Repudiation" leg of STRIDE. They:

1. Fork `github.com/robotijn/ctoc`.
2. Add `evals/skills/security/threat-modeler/cases/repudiation-coverage.yaml`
   describing a system with weak audit logging.
3. Set `expected_findings: [repudiation_risk_audit_log_missing]` and
   `must_not_contain: ["no repudiation risk"]`.
4. Set `severity_when_fails: high` because losing a STRIDE category is a
   silent quality failure.
5. Run `node src/scripts/run-evals.js --only=security/threat-modeler`. The
   case loads, parses, and runs against the current `main` skill version.
   Passing locally confirms the case is well-formed.
6. Open a pull request. The `.github/workflows/evals.yml` workflow re-runs
   the case in continuous integration.
7. A maintainer reviews. The expected finding identifier matches the skill's
   internal finding vocabulary. The case is merged.
8. The case is now part of the regression baseline. Every future change to
   `skills/security/threat-modeler` replays it.

## Relationship to the Iron Loop

The Iron Loop ships features. EDD validates that features don't silently
degrade. They are **independent control loops** running on different
cadences:

| Loop          | Cadence                          | Trigger                          |
|---------------|----------------------------------|----------------------------------|
| Iron Loop     | Per-plan, 16 steps               | A new plan is created            |
| Product Loop  | Weekly                           | KPI review                       |
| EDD harness   | Per-pull-request, plus nightly   | Skill, agent, or eval-case edit  |

The EDD harness does **not** introduce a new gate in the Iron Loop. It runs
in continuous integration after Step 14 (VERIFY) passes. A regression at the
EDD layer kicks the plan back to Step 11 (REVIEW), not to a new gate.

## Skill-version baseline

The harness compares the candidate skill version against the baseline
recorded in `.ctoc/eval-baselines/<skill-path>/version.txt`. This file is
updated when a maintainer accepts that a change is an intentional improvement
(not a regression). The accepted version is the new baseline; subsequent
evals compare against it.

Updating the baseline is an explicit, reviewed operation, not an automatic
side-effect of merging a pull request. The intent is to prevent slow,
unmonitored quality drift across many small changes — the failure mode the
April 2026 postmortem identified.

## Acronyms used (first-use disambiguation)

- **EDD** — Evaluation-Driven Development.
- **CTOC** — Continuous Tool of Continuous Tools.
- **STRIDE** — Spoofing, Tampering, Repudiation, Information disclosure,
  Denial of service, Elevation of privilege.
- **MITRE ATLAS** — MITRE Adversarial Threat Landscape for
  Artificial-Intelligence Systems.
- **OWASP** — Open Web Application Security Project.
- **LLM-as-judge** — Large Language Model used as an evaluator.
- **CI** — Continuous Integration.
- **PR** — Pull Request.

## See also

- `evals/_README.md` — contributor instructions
- `evals/_template.yaml` — case template
- `src/lib/eval-harness.js` — harness library
- `src/lib/comparator-agent.js` — comparator-agent dispatch
- `src/scripts/run-evals.js` — runner
- `.github/workflows/evals.yml` — continuous-integration workflow
- `src/commands/evals.md` — `/ctoc:evals` slash command
