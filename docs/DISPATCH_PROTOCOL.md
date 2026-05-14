# CTOC Dispatch Protocol v1

> Defines the request/response shape for CTO Chief → agent dispatches.
> Companion to [`AGENT_ARCHITECTURE.md`](./AGENT_ARCHITECTURE.md).

## Why a protocol

Without structure, agent dispatches are unreplayable and ungrading. Plain-text prompts allow drift, hallucination, and silent scope creep. v8 introduces a structured dispatch protocol so every call is:

1. **Reproducible** — same input → same output
2. **Auditable** — full request/response logged
3. **Gradable** — outputs comparable to ground truth
4. **Effort-bounded** — hard caps on tokens, tool calls, subagent depth
5. **MCP/A2A-conformant** — future-proof for inter-org dispatch

## Request schema

Every CTO Chief dispatch produces a request like:

```yaml
dispatch:
  id: 01J9X8Y2KZQ3M5N7P9R2T4V6W8       # ULID
  protocol_version: 1
  issued_by: cto-chief
  issued_at: 2026-05-14T12:34:56Z
  target_agent: quality/code-reviewer
  target_tier: 2

  goal: |
    Review the auth refactor in src/auth/ for code quality issues.
    Focus on readability and maintainability.

  plan_ancestry:
    vision: plans/done/auth-refactor.md
    canvas: plans/done/auth-refactor-canvas.md
    functional: plans/done/auth-refactor-functional.md
    implementation: plans/in-progress/auth-refactor-impl.md
    todo: null
    step: 11                            # Iron Loop step number

  context:
    files:
      - path: src/auth/middleware.py
        sha: 9d2c4f6e
        lines: [1, 240]
      - path: src/auth/handlers.py
        sha: 4a8b1c3d
        lines: [1, 180]
    changed_lines_only: true
    related_diffs:
      - src/auth/__tests__/middleware.test.py

  effort_budget:
    max_subagents: 0                    # Tier 2 cannot dispatch (enforced)
    deadline_seconds: 300

  expected_output:
    contract: skills/quality/code-reviewer/CONTRACT.yaml
    min_confidence_per_finding: MEDIUM
    require_citations: true
    require_brief_url_per_pattern: true

  priority: normal                       # low | normal | high | critical
```

### Required fields

- `id` (ULID) — unique dispatch identifier
- `protocol_version` — `1` for v8
- `issued_by` — always `cto-chief` (only Tier 0 issues dispatches)
- `target_agent` — `<category>/<name>` path
- `goal` — one-line statement of intent
- `plan_ancestry` — full chain of parent plans (NULL fields allowed for early-stage)
- `effort_budget` — `max_subagents` (0 for Tier 2/3, the only field runtime-enforced as of v6.9.3)

### Optional fields

- `context.files` — explicit file/line ranges to focus on
- `expected_output.contract` — path to a YAML schema for the response
- `priority` — affects queue ordering when budget is constrained

## Response schema

Every agent responds with:

```yaml
response:
  dispatch_id: 01J9X8Y2KZQ3M5N7P9R2T4V6W8
  protocol_version: 1
  agent: quality/code-reviewer
  agent_version: 6.4.6
  completed_at: 2026-05-14T12:35:42Z
  duration_ms: 4523

  findings:
    - id: code-reviewer/2026-05-14/001
      severity: high                    # critical | high | medium | low | info
      type: long_function               # category-specific
      file: src/auth/middleware.py
      line_range: [45, 132]

      message: |
        validate_token() is 87 lines, exceeds 50-line threshold.

      rationale: |
        The function combines request parsing, signature verification,
        and audit logging. Single Responsibility violation.

      suggestion: |
        Extract three helpers:
        1. parse_token_header(request) -> Token
        2. verify_signature(token, key) -> bool
        3. record_audit_entry(token, outcome)

      confidence: HIGH
      confidence_rationale: |
        Deterministic measurement (line count + nesting depth from AST).

      citations:
        brief_url: https://www.codeant.ai/blogs/what-are-the-five-pillars-of-code-quality
        evidence:
          - file: src/auth/middleware.py
            line_range: [45, 132]
            sha: 9d2c4f6e

      tags: [readability, maintainability, SRP]

  self_assessment:
    coverage: 0.95                       # fraction of changed lines analyzed
    confidence_overall: HIGH
    limitations:
      - "Dynamic imports not fully traced."
      - "Decorator side effects not analyzed."
    unknowns: []

  metadata:
    tokens_used: 12450
    tool_calls: 8
    subagents_dispatched: 0
    model: opus-4-7
```

### Required fields

- `dispatch_id` — must match the request
- `findings` — array (may be empty)
- `self_assessment.coverage` — 0.0-1.0
- `self_assessment.confidence_overall` — HIGH/MEDIUM/LOW
- `metadata.tokens_used`, `metadata.tool_calls`

### Per-finding required fields

- `id`, `severity`, `type`, `message`, `confidence`
- `citations.evidence` (file + line range)
- For HIGH-confidence findings: `confidence_rationale` (why HIGH, not MEDIUM)

## Audit log

Every dispatch produces an audit log entry at:

```
.ctoc/audit/dispatches/YYYY-MM-DD/<dispatch_id>.yaml
```

The audit log contains both `request:` and `response:` blocks. Format:

```yaml
request:
  # (full request as above)
response:
  # (full response as above)
outcome:
  status: completed | timeout | error | rejected
  reason: ""                            # if not completed
  graded_at: null                       # filled by grader
  grade: null                           # filled by grader
```

CTO Chief writes the request block before dispatching; the agent writes the response block; a grader (offline, monthly) writes the outcome.grade block.

## Confidence calibration

Confidence is not vibes. Every HIGH-confidence finding must declare its `confidence_rationale`:

- **Deterministic measurement** (AST node count, line number, file existence) → HIGH
- **Pattern + context** (regex match + surrounding-line check) → MEDIUM
- **Heuristic** (similar to a known anti-pattern, but not exactly) → LOW

The monthly grader updates `.ctoc/agents/grades.yaml`:
```yaml
quality/code-reviewer:
  precision_high: 0.94   # fraction of HIGH findings that were accepted
  precision_med:  0.78
  precision_low:  0.41
  recall_estimate: 0.86  # fraction of issues caught (from kickback signals)
  last_graded: 2026-05-01
  trend: stable          # improving | stable | degrading
```

Agents whose `precision_high` drops below 0.85 are flagged for re-modernization (re-WebSearch the category brief, refresh the skill body).

## Cite-your-sources

Every finding must include:

1. **File evidence** — exact file + line range it came from
2. **Brief URL** — the category brief source that justifies the pattern being flagged

This requirement cuts hallucination 20-40% (per Stanford research on RAG+RLHF+guardrails). Without citations, the finding is treated as LOW confidence regardless of the agent's claim.

## Worker isolation gate

Before a specialist appears in a sub-orchestrator's dispatch recommendations, it must pass an **isolation test**:

```
agent <X> must pass tests/skill-loading.test.js trigger corpus (≥ 90%)
agent <X> must produce a valid response against a known-input fixture
```

Sub-orchestrators MAY NOT recommend a specialist whose isolation test fails. CTO Chief MAY NOT dispatch a specialist whose isolation test fails. This is the architectural enforcement of "build workers in isolation first" (per multi-agent orchestration best practices, 2026).

## Effort budgets

The only runtime-enforced per-agent budget is `max_subagents` — it prevents specialists from cascading dispatches (Tier 2/3 must be 0).

| Tier | max_subagents |
|------|---------------|
| 0 (CTO Chief)   | unbounded |
| 1 (sub-orch)    | 10        |
| 2 (specialist)  | 0         |
| 3 (scout)       | 0         |

### History (v6.9.3)

`max_tokens` and `max_tool_calls` used to appear in agent frontmatter and dispatch requests, but they were never runtime-enforced — purely advisory. They were dropped in v6.9.3 to remove noise.

The real budget enforcement is at the **session level**, not the per-agent level. See `.ctoc/config/budget.yaml` and `src/lib/budget.js` (introduced v6.9.4) for `max_session_hours`, `max_dispatches`, and `max_iron_loop_iterations`. When a session-level budget is exceeded, the dispatcher halts (or warns, per `halt_action`).

## Priority and queueing

When budget is constrained (e.g., near token limits), CTO Chief queues dispatches by priority:

- `critical` — runs first; cannot be deferred
- `high` — runs before normal in the same batch
- `normal` — default
- `low` — may be deferred to next session if budget tight

## MCP / A2A conformance

The protocol is designed to translate cleanly to:

- **MCP (Model Context Protocol)** — for tool calls within an agent
- **A2A (Agent-to-Agent)** — for dispatches between agents (especially inter-org)

When CTOC operates standalone, the protocol uses local file-based audit logs. When CTOC integrates with external systems, A2A messages carry the same `dispatch:` and `response:` blocks over the wire.

## Versioning

- `protocol_version: 1` is the v8 protocol.
- Breaking changes bump the protocol version (major-bump triggers).
- New optional fields can be added without bumping (minor-bump triggers).
- Agents declare `dispatch_protocol: v1` in frontmatter; dispatches matching the declared version are routed normally; mismatches go to a compatibility shim.
