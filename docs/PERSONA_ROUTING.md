# Persona-Aware Question Routing (v8.3)

> "Don't ask a programmer or architect about pricing.
>  Don't ask a founder about TypeScript vs Python."
> — the core promise this document encodes.

## The problem

CTOC v8.0-8.2 had an excellent agent layer but generic question flows. A programmer building a side project got asked about pricing tiers; a founder validating a SaaS idea got asked about Postgres index strategy. Both bounced.

## The solution

Every question has metadata:
- `phase`: vision | canvas | functional | implementation | testing | deployment
- `personas`: which roles CAN answer it
- `deferred_for`: which roles SHOULD NOT see it
- `defer_to_persona`: where to route the question if the current persona can't answer

Every persona has metadata:
- `can_answer`: question categories this role is qualified for
- `cannot_answer`: question categories this role should never see

The `shouldAskQuestion(question, persona, phase)` function in `src/lib/persona.js` combines them: a question is asked only when the current persona has authority over the question's category AND the current phase matches AND no other persona has already answered it.

## The eight personas

| Role | Authority | Defers |
|---|---|---|
| **founder** | pricing · market · target customer · business model · unit economics · compliance scope | tech stack · db schema · code style · test framework |
| **technical-founder** | everything (solo wears both hats) | (none) |
| **pm** | features · acceptance criteria · UX flow · success metrics | pricing · unit economics · tech stack · db schema |
| **programmer** | tech stack · code style · test framework · "shipped" definition | pricing · market · business model · db schema (mostly) |
| **architect** | system design · db schema · deployment · integration · scalability | pricing · market · business model · UX flow |
| **designer** | UX · IA · a11y · brand · copy tone | tech stack · pricing · db schema · unit economics |
| **hobbyist** | vision · success criteria; auto-accepts defaults | pricing · compliance · business model |
| **agency** | tech stack · integration; client owns business decisions | pricing · market · business model (→ defer to client/founder) |

## How a session unfolds (founder example)

```
User: "I want to build a SaaS for managing freelance invoices."

  → persona-classifier runs (Tier 1)
    Signals: "build a SaaS" + "freelance" (no tech terms, no architecture terms)
    Classification: primary_role: founder, confidence: high
    Writes: .ctoc/session/persona.yaml

  → vision-advisor runs
    getApplicableQuestions(phase='vision', persona=founder)
    Returns: [vision/problem, vision/success, vision/scope, vision/audience]
    Skips:   [implementation/tech-stack, implementation/db-schema]  (not in vision phase)

  → product-owner runs (Gate 0 approved)
    getApplicableQuestions(phase='canvas', persona=founder)
    Returns: [canvas/business-model, canvas/pricing-model, canvas/target-ltv,
              canvas/cac-payback, canvas/north-star, canvas/competitors,
              canvas/compliance-scope]
    User answers all (or "skip with default" per question).

  → implementation-planner runs (Gate 1 approved)
    getApplicableQuestions(phase='implementation', persona=founder)
    Returns: []   ← founder isn't asked tech-stack questions!
    Instead, deferQuestion('implementation/tech-stack', {awaitsPersona: 'programmer'})

    Then: implementation-planner consults the stack-chooser sub-orchestrator
    which uses the saas/b2c-subscription template defaults.

    If the user later returns wearing programmer hat (re-classify):
      getApplicableQuestions(phase='implementation', persona=programmer)
      Returns: [implementation/tech-stack, implementation/db-schema,
                implementation/deployment-target, ...]
      The deferred questions surface from the inbox.
```

## How a session unfolds (programmer example)

```
User: "Refactor the auth middleware to use Clerk."

  → persona-classifier runs
    Signals: "refactor" + "auth middleware" + "Clerk" (technical vocabulary)
    Classification: primary_role: programmer, confidence: high

  → vision-advisor runs (lighter touch)
    getApplicableQuestions(phase='vision', persona=programmer)
    Returns: [vision/problem, vision/success, vision/scope]
    Skips:   [vision/audience]   ← not asking a programmer about target users
             [canvas/pricing-model]  ← not even shown

  → implementation-planner takes the lead
    getApplicableQuestions(phase='implementation', persona=programmer)
    Returns: [implementation/tech-stack, implementation/auth-provider,
              implementation/observability-stack, implementation/db-schema*,
              implementation/multi-tenancy*]
    (* only if architect-level decisions; otherwise the programmer accepts defaults)
```

## Deferred questions

When a question is asked of the wrong persona, the system **defers** it to `.ctoc/inbox/questions/` with `awaits_persona: <role>`. The deferred question:

- Does NOT block the current phase if `optional: true`
- BLOCKS the next gate if `required: true`
- Surfaces in `.ctoc/inbox/questions/` for review
- Is auto-presented when the matching persona is detected (re-classify)

Example deferred question file:

```yaml
---
id: 1715701234-x7k9m2
question_id: canvas/pricing-model
created: 2026-05-14T15:30:00Z
awaits_persona: founder
source_plan: plans/in-progress/freelance-invoices-impl.md
source_step: 5
status: open
---

## Question deferred

**Question**: canvas/pricing-model
**Awaits persona**: founder
**Reason**: Outside current persona scope (current persona: programmer)
```

## Answer persistence — never re-ask

`.ctoc/session/answers.yaml` stores every question that's been answered (by any agent). Before asking, an agent calls `isAnswered(question_id)` and skips if already answered. This prevents the dreaded "Wait, didn't I just tell you this?" moment.

## Phrasing variants per persona

Some questions need different phrasing for different personas:

```yaml
- id: vision/success
  default_phrasing: "What does success look like?"
  persona_phrasing:
    founder: "Revenue target? Customer count? Retention rate?"
    programmer: "What does 'shipped' look like? Deployed, tested, monitored?"
    architect: "What does 'complete' look like? SLA met, observability in place?"
    pm: "Activation, retention, NPS?"
    designer: "Accessibility validated, UX tested, brand consistent?"
```

`phrasingFor(question, persona)` returns the appropriate variant. Default phrasing is the fallback.

## Classification heuristics

Initial classification uses `classifyFromText(userMessage)` — pattern-matches against canonical signal phrases per persona (see `src/lib/persona.js#PERSONA_SIGNALS`).

- Score ≥ 2 patterns → HIGH confidence
- Score = 1 pattern → MEDIUM confidence, may re-classify later
- Score = 0 → LOW confidence, ask the user via persona-classifier's one-question gate

## Multi-persona handling

A solo technical founder is BOTH founder AND programmer. The system handles this with:
- `primary_role: technical-founder` (the synthesis role with `can_answer: ['*']`)
- OR `primary_role: founder` + `secondary_roles: [{role: programmer}]`

Either way, `shouldAskQuestion()` returns true if ANY role can answer.

## Persona override

User can force a persona:

```
/ctoc:persona founder       # set primary to founder
/ctoc:persona +programmer   # add programmer as secondary
/ctoc:persona -programmer   # remove programmer from secondary
```

(Slash command to be added in v8.4.)

## Why this is the right design

1. **Respect for the user**: never ask someone a question they can't answer well.
2. **Async-overnight compatible**: deferred questions wait in inbox; right user answers later.
3. **Prevents drift**: the same question is never asked twice (answers persist).
4. **Defaults aggressively for hobbyist**: a learner sees the minimum question set with smart defaults.
5. **Multi-role aware**: solo founder + technical founder + agency owner all have explicit handling.
6. **Test-enforced**: `tests/persona.test.js` enforces the routing invariants.

## Integration with v8 dispatch protocol

The persona is loaded once per session by CTO Chief and passed in `plan_ancestry.persona` to every Tier 1 sub-orchestrator dispatch. Sub-orchestrators consult `loadPersona()` and apply `shouldAskQuestion()` filtering before invoking any user-facing question.

## Files

- `src/lib/persona.js` — routing library
- `.ctoc/session/persona.yaml` — current persona
- `.ctoc/session/answers.yaml` — persisted answers
- `.ctoc/templates/questions.yaml` — question catalog
- `agents/coordinator/persona-classifier.md` — classifier agent
- `tests/persona.test.js` — invariant tests
