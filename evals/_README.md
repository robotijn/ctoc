# Contributing an Evaluation Case

> Welcome. This directory holds the regression-test suite for the Continuous
> Tool of Continuous Tools (CTOC) skill library. Cases are contributed by
> forking the repository and submitting a pull request. There is no telemetry,
> no opt-in tracking, no voting system — every signal is a file in this
> directory.

## Why your contribution matters

Large-language-model-powered skills drift. A skill that worked correctly on
the day it was merged can silently degrade after a model upgrade or a prompt
change upstream. The eval harness catches that drift before it ships. Every
case you contribute makes the next regression visible.

## Quick start (5 minutes)

1. **Fork** `github.com/robotijn/ctoc`. Clone your fork locally.

2. **Pick a skill** to evaluate. Browse `skills/` and find one that lacks
   coverage under `evals/skills/<same-path>/cases/`.

3. **Copy the template**:

   ```bash
   mkdir -p evals/skills/<skill-path>/cases
   cp evals/_template.yaml evals/skills/<skill-path>/cases/<case-name>.yaml
   ```

4. **Fill in the case**. Required fields (see `evals/_template.yaml` for the
   full list):

   - `id` — stable identifier
   - `skill` — path under `skills/` (for example, `security/threat-modeler`)
   - `description` — one sentence
   - `input` — the prompt or invocation that triggers the skill
   - `expected_output` — the reference answer
   - `expected_findings` — list of finding identifiers that **must** appear
   - `must_not_contain` — list of strings that **must not** appear
   - `severity_when_fails` — `critical` \| `high` \| `medium` \| `low`
   - `contributed_by` — your GitHub handle
   - `added_in_version` — the current Continuous Tool of Continuous Tools (CTOC) version from the `VERSION` file
   - `last_verified` — today's date in International Organization for Standardization 8601 (ISO 8601) format, for example `2026-05-19`

5. **Validate locally**:

   ```bash
   node src/scripts/run-evals.js --only=<skill-path>
   ```

   The script parses the case, validates the schema, and (if the
   `ANTHROPIC_API_KEY` environment variable is set) runs the comparator
   agent. If the script exits 0 with the case marked `loaded`, you are
   ready.

6. **Open a pull request**. A maintainer will review. Continuous integration
   replays the case automatically.

## End-to-end worked example: `skills/security/threat-modeler`

The threat-modeler skill produces a STRIDE — Spoofing, Tampering,
Repudiation, Information disclosure, Denial of service, Elevation of
privilege — decomposition of a system description. A regression where the
skill stops emitting the "Repudiation" leg is silent: the output still looks
like a threat model.

A case that catches that regression:

```yaml
id: threat-modeler-repudiation-coverage
skill: security/threat-modeler
description: |
  Confirms the skill emits a Repudiation finding when a system has
  weak audit logging.
input: |
  Threat-model the following system: a public web application that
  accepts user-submitted comments. Comments are written directly to a
  shared database table with no audit log. There is no per-write
  immutable record. Identify all STRIDE categories.
expected_output: |
  A STRIDE table covering all six categories. The Repudiation row must
  identify the missing audit log as the root cause and recommend an
  append-only audit table or a write-ahead log.
expected_findings:
  - repudiation_risk_audit_log_missing
must_not_contain:
  - "no repudiation risk"
  - "Repudiation: Not applicable"
severity_when_fails: high
contributed_by: "@your-handle"
added_in_version: "8.5.0"
last_verified: "2026-05-19"
tags:
  - stride
  - audit-logging
  - owasp
references:
  - "OWASP threat modeling cheat sheet (2024 revision)"
```

Save the case at:

```
evals/skills/security/threat-modeler/cases/repudiation-coverage.yaml
```

Validate locally:

```bash
node src/scripts/run-evals.js --only=security/threat-modeler
```

Expected output (without an Application Programming Interface (API) key):

```
[load]   security/threat-modeler/repudiation-coverage ok
[harness] 1 case loaded, 0 errors. Comparator stub used (no ANTHROPIC_API_KEY).
[summary] cases=1 passed=1 failed=0 weighted_pass_rate=1.00 threshold=0.95
exit 0
```

Open the pull request.

## Severity calibration guide

The `severity_when_fails` field controls how heavily the case weights into
the aggregate pass rate. Calibrate honestly:

| Severity | Weight | Use when... |
|----------|-------:|-------------|
| critical |   4.0  | The skill emitting the wrong output causes data loss, a security breach, or a compliance violation. |
| high     |   2.0  | The skill emitting the wrong output causes a silent quality regression that a user is unlikely to notice. |
| medium   |   1.0  | The skill emitting the wrong output is detectable on inspection but inconvenient. |
| low      |   0.5  | The skill emitting the wrong output is cosmetic or stylistic. |

When in doubt, **start one level lower** than your first instinct. A flood
of `critical` cases will mask the genuinely critical ones.

## What makes a good case

- **Realistic input**. The prompt should be a credible request from a real
  user. Resist contrived edge cases unless the edge is a known failure
  mode.
- **Sourced expected output**. Cite the document that justifies the
  reference answer (Open Web Application Security Project (OWASP), MITRE
  Adversarial Threat Landscape for Artificial-Intelligence Systems (MITRE
  ATLAS), Stripe documentation, Request For Comments (RFC), peer-reviewed
  paper). Unsourced expected outputs are rejected at review.
- **Specific findings**. Prefer `expected_findings` over freeform
  `expected_output` when the skill emits structured finding identifiers.
  Findings are deterministic; freeform text is judged.
- **Tight `must_not_contain`**. List the specific anti-patterns that prove
  the regression. Avoid listing common English words.
- **One concern per case**. A case that tests both Repudiation coverage and
  Elevation-of-privilege coverage fails in an ambiguous way. Split into two
  cases.

## What a maintainer checks

- Does the case file parse? (Continuous integration confirms this.)
- Is the input realistic?
- Is the expected output sourced?
- Is the severity calibrated honestly?
- Is the finding identifier consistent with the skill's existing vocabulary?
- Does the case add coverage the existing suite lacks?

If all five are satisfied, the case is merged.

## What a maintainer rejects

- Cases with no citation for the expected output.
- Cases that duplicate existing coverage without adding a distinct failure
  mode.
- Cases with invented finding identifiers — the identifier must match a
  category the skill already emits, or the skill must be updated in a
  separate pull request to emit it.
- Cases inflated to `critical` severity that do not meet the bar.
- Cases that depend on the model's stochastic output ("the answer should
  contain the word 'maybe'"); use deterministic expected findings instead.

## Updating an existing case

Edit the file. Bump `last_verified` to today's International Organization
for Standardization 8601 (ISO 8601) date. In the pull-request description,
explain **why** the case changed. Cases should only change when:

1. The cited source was updated (for example, OWASP revised its cheat sheet).
2. The skill's finding vocabulary changed (the case is being kept in sync).
3. The reference answer was wrong, and a maintainer agrees.

Never silently lower the expected bar to make a failing case pass.

## File-naming conventions

```
evals/skills/<category>/<skill-name>/cases/<case-name>.yaml
```

- Lowercase, hyphen-separated.
- Case name describes the **what is being tested**, not the **expected
  outcome**. Good: `repudiation-coverage.yaml`. Bad: `pass.yaml`,
  `should-emit-repudiation-finding.yaml`.

## Frequently asked questions

**Q: Do I need an Anthropic Application Programming Interface (API) key to
contribute?**

No. The harness validates and loads cases without an API key. The full
comparator-agent run requires an `ANTHROPIC_API_KEY` and runs in
continuous integration with a repository secret.

**Q: Can I contribute a case for a skill that does not yet exist?**

No. The case must reference an existing skill at `skills/<path>`. If you
want a new skill, open a pull request that adds the skill **and** at least
one case in the same change.

**Q: How is the regression threshold chosen?**

The default is 0.95 weighted pass rate. See `docs/EVALUATION_HARNESS.md`
for the rationale and how to tune the threshold per repository.

**Q: Where do I report a flaky case?**

Open an issue. Add `flaky: true` in the case file as a temporary measure;
the harness allows one failure per flaky case per run. Flaky cases are
expected to be fixed, not left flaky indefinitely.

## See also

- `docs/EVALUATION_HARNESS.md` — full specification
- `evals/_template.yaml` — case template
- `src/scripts/run-evals.js` — local runner
- `.github/workflows/evals.yml` — continuous-integration workflow
