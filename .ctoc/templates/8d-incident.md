# Eight Disciplines (8D) Problem Solving Report

> Ford Motor Company introduced the Global 8D method in 1987 to give cross-
> functional teams a single, disciplined sequence for resolving systemic
> defects. CTOC uses 8D for any incident classified `high` or `critical`
> in the Corrective and Preventive Action register at `.ctoc/capa/`.

**Sources**

- American Society for Quality, *Eight Disciplines (8D) Process* —
  https://asq.org/quality-resources/eight-disciplines-8d
- Kepner-Tregoe, *Problem Solving and Decision Making* —
  https://kepner-tregoe.com/blogs/problem-solving-and-decision-making/
- Ford Motor Company, *Global 8D Problem Solving Process* — internal
  reference, public summary at https://en.wikipedia.org/wiki/Eight_disciplines_problem_solving

---

## Incident Identification

- **8D Report ID:** `<ULID — match the linked CAPA id when one-to-one>`
- **Linked CAPA:** `.ctoc/capa/<capa-id>.yaml`
- **Reported by:** `<role / agent / human>`
- **Reported at:** `<ISO 8601 UTC>`
- **Severity classification:** `high` | `critical`
- **Customer impact summary:** `<one sentence in customer terms>`

---

## D0 — Plan

> Decide whether 8D is the right tool, gather symptoms, and authorize
> resources. Skip 8D and use a lighter CAPA when the defect is `medium` or
> below.

| Field | Entry |
|---|---|
| Is 8D appropriate? (severity `high` or `critical`) | yes / no |
| Symptoms list (observable facts only — no causes yet) | |
| Why is acting now required? (urgency, regulatory clock, customer harm) | |
| Resources authorized (people, tools, budget, calendar deadline) | |
| Emergency response containment in place? (D3 below) | yes / no |

---

## D1 — Establish the Team

> Cross-functional, with the authority to make decisions. In CTOC's agent
> model, the team is the **set of sub-orchestrators and specialists** that
> own the affected pillars, with CTO Chief as the team lead.

| Role | Person / agent | Why on the team |
|---|---|---|
| Team lead | CTO Chief | Top-level coordinator, only top-level dispatcher |
| Process owner | `<sub-orchestrator>` | Owns the affected pillar |
| Subject matter expert | `<specialist agent>` | Knows the defective surface |
| Customer voice | `<human user or product-owner agent>` | Represents impact |
| Independent verifier | `<IV&V chief if active>` | Cannot have authored the defect |
| Quality lead | `<quality-checker agent>` | Owns the verification ladder |

The team must have at least one member who **did not** author the
defective work product. Independence is non-negotiable.

---

## D2 — Describe the Problem

> Use the Is / Is Not technique introduced by Kepner-Tregoe. Quantify
> dimensions: *what, where, when, how many.* Resist jumping to causes.

| Dimension | Is | Is Not |
|---|---|---|
| What (object + defect) | | |
| Where (location, environment, file path) | | |
| When (calendar time, build version, after which change) | | |
| How many (frequency, severity, blast radius) | | |
| Who is affected | | |
| Trend (stable, growing, decaying) | | |

**Quantified statement.** Write a single sentence that any new team member
can read and reproduce the defect from:

```
On <DATE/BUILD>, <WHO> observed that <OBJECT> exhibited <DEFECT>
in <CONTEXT>, occurring <N> times out of <DENOMINATOR>, with
customer impact of <QUANTIFIED IMPACT>.
```

---

## D3 — Interim Containment Actions

> Stop the bleeding while root cause is investigated. Containment is not
> a fix; it is a tourniquet. Each action must list its end-of-life
> condition.

| Action | Owner | Applied at | End-of-life trigger | Verified working |
|---|---|---|---|---|
| | | | | yes / no |

Common containment actions in CTOC:

- Feature flag the affected path to `off` for all tenants.
- Roll back to the previous configuration baseline (`config_baseline`
  control if active).
- Pause the relevant sub-orchestrator's dispatch authority.
- Trigger Andon halt (`andon_cord_halt` control if active) to stop all
  dispatches until root cause is found.

---

## D4 — Root Cause Identification

> Use a structured method. Five-Why is the minimum; Fishbone (Ishikawa)
> or Fault Tree Analysis is preferred for severity `critical`.

### Five-Why chain

| Why | Answer |
|---|---|
| 1. Why did the defect occur? | |
| 2. Why did *that* happen? | |
| 3. Why? | |
| 4. Why? | |
| 5. Why? (must point at a system, not a person) | |

### Fishbone categories (optional, for `critical`)

Group candidate causes under each category. For each category, mark the
strongest candidate.

| Category | Candidate causes | Strongest |
|---|---|---|
| Method (process, plan, gate) | | |
| Machine (tooling, runtime, infrastructure) | | |
| Material (input data, dependency versions) | | |
| Measurement (metrics, monitors, alerts) | | |
| Manpower (agent prompts, human review steps) | | |
| Environment (timing, load, deployment context) | | |

### Root cause statement

One sentence. Must name a *system-level* root cause, not a person.

```
<ROOT CAUSE>
```

### Escape point

The check that *should* have caught the defect but did not. Examples:
"Step 14 VERIFY did not have a malformed-input test"; "Refinement loop
phase `medium` did not include a critic for this surface."

```
<ESCAPE POINT>
```

---

## D5 — Choose and Verify Permanent Corrective Action

> Multiple candidate actions, scored on impact, cost, and risk of
> introducing new defects. Choose one and **verify** it solves the
> problem *before* implementing in production.

### Candidates

| # | Action | Impact (1-5) | Cost (1-5) | New-risk (1-5) | Net score |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

### Chosen action

```
<CHOSEN ACTION>
```

### Verification (before D6 implementation)

Demonstrate in a sandbox / preview environment that the chosen action
prevents the defect. Record the evidence:

- Test added: `<path/to/test.js or .test.py>`
- Test result before fix: FAIL (defect reproduced)
- Test result after fix: PASS
- Evidence file: `<path/to/evidence>`

---

## D6 — Implement Permanent Corrective Action

> Roll out the verified action. Remove the interim containment from D3
> only after the permanent action is in place and the previous
> verification still passes.

| Step | Owner | Deadline | Done |
|---|---|---|---|
| Implement the permanent fix | | | [ ] |
| Update relevant tests | | | [ ] |
| Update relevant agent prompts / templates | | | [ ] |
| Update relevant documentation | | | [ ] |
| Run full Iron Loop verification (Step 14) | | | [ ] |
| Confirm verification test from D5 still passes | | | [ ] |
| Remove D3 interim containment | | | [ ] |

---

## D7 — Prevent Recurrence

> The hardest discipline. The corrective action fixed *this* defect; the
> preventive action must change the *system* so the same class of defect
> cannot recur on a different plan, different surface, or different team.

Each prevention must touch at least one of:

| Lever | What to update | Linked control |
|---|---|---|
| Process / plan template | `.ctoc/templates/*.template` | `process_fmea_loop` |
| Agent prompt | `agents/<pillar>/<agent>.md` | n/a |
| Refinement-loop critic | `src/lib/refinement-loop.js` (`CORE_CRITICS` or `DYNAMIC_CRITICS_BY_PATTERN`) | `process_fmea_loop` |
| Gate threshold | `.ctoc/config/andon-thresholds.yaml` | `andon_cord_halt` |
| Quality metric | `src/lib/metrics-loop.js` | `process_capability_index` |
| Risk-surface trigger | `.ctoc/config/refinement-triggers.yaml` | n/a |
| Test policy | `tests/` and Step 8 template | n/a |
| Documentation | `docs/` | `lessons_learned_closure` |

### Permanent system changes applied

| Lever changed | File | Commit ref | Reviewer |
|---|---|---|---|
| | | | |

### Effectiveness check schedule

When the team will confirm that the preventive action actually prevented
recurrence (typically thirty days or thirty plans after the change).

- **Check date:** `<ISO 8601 date>`
- **Check method:** `<how recurrence will be detected — escape-rate trend, control chart, audit sample>`
- **Pass criterion:** `<objective threshold>`

---

## D8 — Recognize the Team and Close

> Two purposes: acknowledge the work, and capture the lessons so future
> teams benefit. Closure without lessons is closure that defeats the
> purpose of 8D.

### Team recognition

| Team member | Contribution |
|---|---|
| | |

### Lessons learned

A single paragraph that a future engineer could read in isolation and
extract value from. Include:

1. What surprised the team during investigation.
2. What process gap allowed the defect.
3. What permanent change closes that gap.
4. What signals would predict a similar defect in the future.

```
<LESSONS LEARNED PARAGRAPH>
```

Add the lesson to `.ctoc/learnings/approved/` for downstream propagation.

### Closure record

| Field | Entry |
|---|---|
| 8D report closed at (ISO 8601) | |
| Linked CAPA marked `effective: true`? | yes / no |
| If no, what's still open | |
| Closure approver | CTO Chief (or named delegate with written authority) |

---

## Audit trail

This report itself is an evidence artifact. Once closed, it is immutable
(see `audit_hash_chain` control if active). Subsequent corrections must
open a new 8D linked back to this one via the `related_capa_ids` field
on the CAPA register.
