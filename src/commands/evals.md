---
description: Run the Continuous Tool of Continuous Tools (CTOC) Evaluation-Driven Development (EDD) harness against the current branch and report the verdict.
---

# /ctoc:evals

Runs the Continuous Tool of Continuous Tools (CTOC) Evaluation-Driven
Development (EDD) harness against the current branch and reports the verdict.

Spec: [docs/EVALUATION_HARNESS.md](../../docs/EVALUATION_HARNESS.md).
Contributor guide: [evals/_README.md](../../evals/_README.md).

## What it does

1. Walks `evals/skills/**/cases/*.yaml`.
2. Loads, parses, and validates every case file against the schema in
   `evals/_template.yaml`.
3. When `ANTHROPIC_API_KEY` is set, dispatches the comparator agent for
   each case. The comparator performs a blind A/B Large Language
   Model (LLM)-as-judge comparison between the baseline skill version
   (`main`) and the candidate skill version (`HEAD`), per
   `src/lib/comparator-agent.js`.
4. Aggregates per-case verdicts into a weighted pass rate.
5. Prints a human-readable report. Exits non-zero when the weighted pass
   rate falls below the configured regression threshold (default 0.95).

## Usage

```bash
# Validate every case file (no Application Programming Interface (API) key
# required). Safe default — runs in load-only mode when the environment
# does not have ANTHROPIC_API_KEY set.
node "${CLAUDE_PLUGIN_ROOT:-.}/src/scripts/run-evals.js"

# Restrict to a single skill
node "${CLAUDE_PLUGIN_ROOT:-.}/src/scripts/run-evals.js" --only=security/threat-modeler

# Run the comparator (requires ANTHROPIC_API_KEY in environment)
ANTHROPIC_API_KEY=sk-ant-... node "${CLAUDE_PLUGIN_ROOT:-.}/src/scripts/run-evals.js" --no-load-only

# Fail when weighted pass rate falls below threshold (suitable for
# continuous integration)
node "${CLAUDE_PLUGIN_ROOT:-.}/src/scripts/run-evals.js" --fail-on-regression --threshold=0.95

# Emit a single JavaScript Object Notation (JSON) document for downstream
# tooling
node "${CLAUDE_PLUGIN_ROOT:-.}/src/scripts/run-evals.js" --json
```

## Reading the report

The report has four sections:

- **LOAD / VALIDATION ERRORS** — case files that failed to parse or whose
  schema is invalid. Fix these first. Cases listed here are not run.
- **CASES** — per-case verdict line. Format: `[PASS|FAIL] <skill>/<id>
  (<severity>, verdict=<A|B|tie|loaded>, conf=<0..1>, <ms>)`. Failed cases
  include their `reasons` indented underneath.
- **AGGREGATE** — overall totals, raw pass rate, and weighted pass rate
  broken down by severity. The weighted pass rate is what the threshold
  check uses.
- **Outcome** — `OK`, `LOAD ERRORS`, or `REGRESSION (<rate> < <threshold>)`.

A `NOTE: Comparator stub in effect` banner appears when no
`ANTHROPIC_API_KEY` was available; the reported verdicts are placeholders
and only the case-schema validation step is meaningful in that run.

## Exit codes

| Exit | Meaning |
|-----:|---------|
|   0  | All cases loaded successfully and either passed or the comparator was stubbed. |
|   1  | One or more cases failed to load or validate. |
|   2  | Regression detected (weighted pass rate below threshold) AND `--fail-on-regression` was specified. |

## After running

After running, summarise the report:

- Number of cases loaded; number that failed to validate.
- If the comparator ran: weighted pass rate, threshold, the highest-
  severity failed case (if any).
- If the comparator was stubbed: note that explicitly so the user knows
  the verdicts are placeholders.

If failures are present, point the user at:

- `evals/_README.md` for the contributor guide.
- `docs/EVALUATION_HARNESS.md` for the specification.
- The specific failing case file path so they can inspect it.

## See also

- `/ctoc:menu` — top-level dashboard
- `/ctoc:self-check` — Iron Loop self-check
- `docs/EVALUATION_HARNESS.md`
- `.github/workflows/evals.yml`
