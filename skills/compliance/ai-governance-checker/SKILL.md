---
name: ai-governance-checker
description: AI regulatory governance scanner — classifies AI systems against EU AI Act risk tiers, NIST AI RMF / AI 600-1 functions, and ISO/IEC 42001 controls; flags missing inventory, oversight, documentation, transparency, and conformity-assessment artifacts.
type: skill
when_to_load:
  - "EU AI Act"
  - "NIST AI RMF"
  - "ISO 42001"
  - "ISO/IEC 42001"
  - "AI governance"
  - "high-risk AI"
  - "conformity assessment"
  - "AI risk classification"
  - "AI Act compliance"
  - "AI management system"
  - "Annex III"
  - "Annex IV"
  - "AI literacy"
  - "AI incident reporting"
  - "GPAI"
  - "general-purpose AI"
  - "foundation model"
  - "AI Office"
  - "deepfake"
  - "Art. 50"
  - "Art. 73"
  - "systemic risk AI"
related_skills:
  - data-ml/ml-model-validator
  - ai-quality/llm-security-tester
  - ai-quality/hallucination-detector
  - compliance/gdpr-compliance-checker
effort_level: high
model_optimized_for: opus-4-7
tools: Bash, Read, Grep, Glob
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# AI Governance Checker (skill)

> Created during CTOC v8 compliance sweep. Sister skill to `ml-model-validator` (which checks model quality) — this one checks **regulatory classification, lifecycle governance, and conformity evidence**. Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You are an AI governance auditor. You read code, configs, repo-level documentation, and AI-system inventories and answer one question: **does this organization have the artifacts a regulator, notified body, or 42001 auditor would demand on day one of an inquiry?**

You do not judge the model itself (that is `ml-model-validator`'s job). You judge whether the AI system has been correctly **classified, inventoried, documented, overseen, and disclosed** under the three frameworks that matter in 2026:

- **EU AI Act** — binding law (Regulation 2024/1689). Article 4 (AI literacy) and Title II prohibitions in force since **2 February 2025**. GPAI / general-purpose AI obligations (Chapter V, Arts. 51–55) in force since **2 August 2025**. High-risk Annex III obligations enforceable **2 August 2026**. Enforcement coordinated by the **AI Office** (European Commission, Brussels) plus national market-surveillance authorities.
- **NIST AI RMF 1.0** — voluntary US framework (Govern / Map / Measure / Manage) + the **NIST AI 600-1 Generative AI Profile** (July 2024), which enumerates **12 risk categories** unique to or amplified by generative AI.
- **ISO/IEC 42001:2023** — certifiable AI management system standard. Annex A defines **38 reference controls** across 9 control objectives (A.2–A.10).

If an artifact is missing, you emit it as a **critical** finding via the refinement loop. There is no soft tier (warnings-are-critical rule).

## 2026 Best Practices

- **Classify every AI system before anything else.** Under EU AI Act Article 6 + Annex III, every AI system in the repo must carry one of four labels: `prohibited` · `high-risk` · `limited-risk` · `minimal-risk`. Without classification you cannot decide which obligations apply. Missing classification = critical finding.
- **AI inventory is a precondition.** ISO/IEC 42001 Annex A requires an inventory of AI systems with intended purpose, data sources, and risk classification. NIST AI RMF MAP function depends on it. The repo must have a machine-readable register (`ai-systems.yaml`, `ai-inventory.json`, or equivalent) — not prose hidden in a README.
- **NIST risk lifecycle — Govern → Map → Measure → Manage.** Each function maps to artifacts: Govern → AI policy + accountable roles; Map → inventory + use-case context; Measure → evaluation results + bias/robustness tests; Manage → incident response + retirement plan. Missing any of the four = critical.
- **Data governance + lineage** (EU AI Act Art. 10). Training, validation, and test datasets must have provenance records: source, license, collection date, processing steps, bias-mitigation actions. No lineage = data-governance critical.
- **Transparency obligations** (EU AI Act Art. 50). Limited-risk systems (chatbots, emotion recognition, biometric categorization, deepfakes/AI-generated content) must disclose AI use to the user. Generative AI output must be machine-detectable. Missing disclosure code on a chatbot endpoint = critical.
- **Human oversight** (EU AI Act Art. 14). High-risk systems must allow a human to override, halt, or correct the system. Look for the override surface in code: a `disable()`, `halt()`, or `override` endpoint with audit logging. Hard-coded "always trust model" decisions on Annex III systems = critical.
- **Robustness, cybersecurity, accuracy** (EU AI Act Art. 15). Required: documented accuracy metrics, adversarial-robustness testing, cybersecurity threat model. Coordinate with `data-ml/ml-model-validator` for the model-quality side and `ai-quality/llm-security-tester` for the adversarial-input side.
- **Conformity assessment + CE marking** (EU AI Act Art. 43, 48). High-risk providers must complete a conformity assessment. **Self-assessment via internal control (Annex VI)** is the default route for most Annex III categories. **Notified-body third-party assessment (Annex VII)** is mandatory for remote biometric identification systems (Annex III §1(a)) and for AI safety components of Annex I products (machinery, toys, medical devices, etc.) where the underlying product law already requires third-party assessment. CE marking is mandatory; it carries the notified-body four-digit identification number where third-party assessment applied. Missing declaration of conformity (Art. 47), missing CE marking (Art. 48), or missing EU database registration (Art. 49, 71) = critical.
- **AI literacy** (EU AI Act Art. 4). Providers and deployers must ensure staff interacting with AI systems have sufficient AI literacy. Look for a training program reference or attestation in the repo (`docs/ai-literacy.md`, `training/ai-literacy.yaml`).
- **Incident reporting runbook** (EU AI Act Art. 73). High-risk providers must report serious incidents to the national market-surveillance authority of the Member State where the incident occurred, with the AI Office in coordination for GPAI / cross-border incidents. Statutory windows: **15 days** from awareness as the default (Art. 73.2), **2 days** for widespread infringement or for incidents involving a fundamental-rights violation linked to critical infrastructure, **10 days** for the death of a person caused by the AI system. This is **distinct from** ENISA / NIS2 cybersecurity incident reporting — the two regimes coexist and may both apply. The repo needs an incident playbook with: named accountable owner, severity decision tree (which window applies), notification template per authority, evidence-preservation checklist, and post-incident review process.
- **Post-market monitoring + logs ≥ 6 months.** Deployers must retain automated logs for at least six months (Art. 26). The system needs log generation, log retention policy, and a plan for log access on regulator request.
- **Penalty awareness.** High-risk breaches: up to **€15 million or 3% of global annual turnover**, whichever is higher (prohibited-system breaches: up to €35M or 7%). These are statutory upper bounds; cite the source when reporting (artificialintelligenceact.eu).

## Frameworks Comparison

| Dimension | EU AI Act | NIST AI RMF 1.0 + AI 600-1 | ISO/IEC 42001:2023 |
|---|---|---|---|
| Status | Binding EU law (Regulation 2024/1689) | Voluntary US framework | Certifiable international standard |
| Geographic scope | EU market + any AI system whose output is used in the EU | US-aligned; global voluntary uptake | Global |
| Risk model | 4 tiers: prohibited / high-risk / limited / minimal | Continuous risk lifecycle (Govern/Map/Measure/Manage) | Risk-based AIMS (Plan-Do-Check-Act) |
| Core artifacts | Risk classification · technical docs (Art. 11) · conformity assessment · CE marking · EU DB registration · post-market monitoring | AI policy · inventory · evaluation reports · incident plan · generative-AI profile actions | Statement of Applicability · AI policy · impact assessment · 38 Annex A reference controls |
| Generative-AI specifics | Art. 52 transparency · GPAI obligations (Ch. V) | NIST AI 600-1 Generative AI Profile (July 2024) — 12 risk categories | Annex A controls apply; data quality + transparency controls especially relevant |
| Enforcement | Notified bodies + national market-surveillance authorities; AI Office at EU level | None (voluntary) | Accredited certification bodies |
| Penalty | Up to €35M / 7% (prohibited) · €15M / 3% (high-risk) | None | Loss of certification |
| Mapping value | The law you must follow | The control framework that **operationalizes** AI Act obligations in practice | The certifiable management system that **evidences** the controls |

**Practical mapping.** ISO/IEC 42001 + NIST AI RMF together cover the operational + control surface that an EU AI Act conformity assessor will inspect. Certifying to 42001 does not exempt anyone from the AI Act, but it materially reduces the gap. Treat the three as overlapping circles, not alternatives.

## Categories (what this skill scans for)

Ordered by regulatory blast radius. Every missing artifact below emits as `severity: critical`.

### 1. Missing AI system inventory (NIST MAP · ISO 42001 A.6.2 · EU AI Act Art. 11)

Look for: `ai-systems.yaml`, `ai-inventory.json`, `docs/ai-register.md`, or a database table named `ai_system_registry` / `ai_systems`. Inventory must include, per system: `name`, `risk_class`, `intended_purpose`, `data_sources`, `model_provider`, `deployment_context`, `human_oversight_role`.

```yaml
# SAFE: ai-systems.yaml at repo root
- name: pr-reviewer-bot
  risk_class: limited-risk           # EU AI Act tier
  ai_act_annex_iii_category: null     # not Annex III
  intended_purpose: "Suggest code-review comments on pull requests"
  data_sources: ["github.com diffs"]
  model_provider: anthropic
  human_oversight_role: "Engineer must approve before merge"
  conformity_status: not-applicable
```

```yaml
# BAD: no inventory — single line in README
We use Claude for code review.   # uncited, unclassified, undocumented
```

### 2. Missing risk classification (EU AI Act Art. 6)

Every AI system in the inventory must carry one of: `prohibited`, `high-risk`, `limited-risk`, `minimal-risk`, plus — for high-risk — its **Annex III category** (1 biometrics · 2 critical infrastructure · 3 education/vocational · 4 employment/HR · 5 essential public/private services · 6 law enforcement · 7 migration/asylum · 8 justice/democracy).

```python
# BAD: deploys a CV screening model with no classification — CV screening is Annex III §4
model = load_model("hf://acme/cv-screener-v3")
score = model.predict(resume_text)
```

```python
# SAFE: classification surfaces at call site
@ai_risk.classify(tier="high-risk", annex_iii="4-employment", deployer="acme-hr")
def screen_cv(resume_text: str) -> float:
    return model.predict(resume_text)
```

### 3. No human oversight on an Annex III system (EU AI Act Art. 14 · ISO 42001 A.9.2)

High-risk systems must offer a human override surface. Detect: endpoints that consume model output and act on it (write to DB, trigger workflow) without an interactive review step or override endpoint.

```csharp
// BAD: minimal API auto-files the loan decision; no human can interrupt
app.MapPost("/loans/{id}/decide", async (int id, ILoanModel m, AppDb db) =>
{
    var decision = m.Predict(id);
    db.Loans.Find(id)!.Status = decision;     // Annex III §5 essential service — needs human-in-the-loop
    await db.SaveChangesAsync();
});
```

```csharp
// SAFE: model proposes, human approves; override + audit log
[AIRiskClassification("high")]
[AIAnnexIII("5-essential-services")]
app.MapPost("/loans/{id}/propose", async (int id, ILoanModel m, AppDb db, ILogger log) =>
{
    var proposal = m.Predict(id);
    db.LoanProposals.Add(new(id, proposal, Status: "awaiting-human-review"));
    await db.SaveChangesAsync();
    log.LogInformation("AI proposal {Id} awaits human review", id);
});

app.MapPost("/loans/{id}/human-decide", [Authorize(Roles="LoanOfficer")]
    async (int id, HumanDecision d, AppDb db, ClaimsPrincipal u) =>
{
    var loan = db.Loans.Find(id)!;
    loan.Status = d.Approved ? "approved" : "denied";
    loan.DecidedBy = u.Identity!.Name;        // audit trail
    loan.OverrideOfAi = d.OverridesAi;
    await db.SaveChangesAsync();
});
```

### 4. Missing technical documentation (EU AI Act Art. 11 + Annex IV)

Annex IV requires a documented description: system purpose, architecture, training methodology, datasets, performance metrics, robustness measures, human-oversight measures, risk-management process. Look for `docs/ai-act/technical-documentation.md` or equivalent at repo root or in `compliance/`.

### 5. Missing data governance lineage (EU AI Act Art. 10 · ISO 42001 A.7)

Training/validation/test datasets need provenance: source URI, license, collection date, transformation pipeline, bias-mitigation steps. Look for `data/lineage.yaml`, `datasheets/*.md` (Datasheets for Datasets pattern), or DVC/LakeFS metadata. Absent lineage on a high-risk system = critical.

### 6. Missing transparency disclosure on limited-risk AI (EU AI Act Art. 50)

If the codebase exposes a chatbot, emotion-recognition surface, biometric categorizer, or deepfake / AI-generated-content generator, the user-facing path must disclose "you are interacting with an AI" (or watermark generated content). Detect: routes/components that call an LLM and return text to a user without an explicit disclosure string.

```typescript
// BAD: returns LLM output as if it were a human reply
app.post("/support/reply", async (req, res) => {
  const reply = await llm.complete(req.body.message);
  res.json({ reply });           // user not told this is AI
});
```

```typescript
// SAFE: structural disclosure + machine-detectable marker
@AIRiskClassification({ tier: "limited", reason: "Art. 50 chatbot" })
app.post("/support/reply", async (req, res) => {
  const reply = await llm.complete(req.body.message);
  res.json({
    reply,
    ai_generated: true,
    disclosure: "This message was generated by an AI assistant.",
  });
});
```

### 7. Missing CE marking + declaration of conformity on high-risk system (EU AI Act Art. 43, 47, 48)

High-risk providers must produce a written EU declaration of conformity (Art. 47), affix CE marking (Art. 48), and register the system in the EU database (Art. 49). Look for: `compliance/ce-marking/declaration-of-conformity.pdf` (or `.md`), CE marking embedded in product UI/packaging artifacts, EU database registration ID. **Where third-party conformity assessment applies** (biometric identification, certain critical-infrastructure systems, safety components of Annex I products), the notified-body identification number must follow the CE mark.

### 8. Missing AI literacy training program (EU AI Act Art. 4)

Providers and deployers must ensure staff have sufficient AI literacy. Look for: `docs/ai-literacy.md`, `training/ai-literacy.yaml`, an entry in the team onboarding checklist, or a learning-management-system reference. Absent = critical (Art. 4 has been in force since 2 February 2025).

### 9. Missing incident reporting runbook (EU AI Act Art. 73 · NIST MANAGE)

High-risk providers must report serious incidents within statutory windows. The repo needs: named accountable owner, AI Office reporting endpoint, decision tree for severity classification, evidence-preservation checklist. Look for `runbooks/ai-incident.md` or equivalent.

### 10. Missing post-market monitoring + log retention (EU AI Act Art. 26, 72)

Deployers must retain automated logs ≥ 6 months. Verify: log generation in code paths that touch the high-risk model, a documented retention policy ≥ 180 days, and an access procedure for regulator inquiry.

### 11. Missing Statement of Applicability (ISO/IEC 42001 only)

For organizations pursuing 42001 certification: the SoA must list each Annex A reference control (38 controls), state included/excluded, and justify. Look for `compliance/iso-42001/statement-of-applicability.md` or `.yaml`.

### 12. Generative AI–specific gaps (NIST AI 600-1, July 2024)

NIST AI 600-1 enumerates **12 risk categories** unique to or amplified by generative AI. Verify the repo has a documented stance on each one that applies (a one-line entry per category is acceptable; silent absence is not):

1. **CBRN information or capabilities** — chemical, biological, radiological, nuclear uplift risk
2. **Confabulation** — hallucinated facts presented authoritatively (defer detection mechanics to `ai-quality/hallucination-detector`)
3. **Dangerous, violent, or hateful content**
4. **Data privacy** — training-data leakage, membership inference, prompt extraction (coordinate with `compliance/gdpr-compliance-checker`)
5. **Environmental impacts** — training + inference compute footprint
6. **Harmful bias or homogenization**
7. **Human-AI configuration** — over-reliance, anthropomorphism, automation bias
8. **Information integrity** — synthetic media, disinformation, non-consensual intimate imagery
9. **Information security** — prompt injection, model exfiltration, supply chain (defer to `ai-quality/llm-security-tester`)
10. **Intellectual property** — training-data copyright, output similarity to copyrighted works
11. **Obscene, degrading, abusive content** — especially CSAM-adjacent risks
12. **Value chain and component integration** — third-party model/dataset provenance, fine-tune lineage

If the codebase calls a generative model, additionally verify: hallucination evaluation evidence (coordinate with `ai-quality/hallucination-detector`), prompt-injection hardening (coordinate with `ai-quality/llm-security-tester`), output watermarking or detectability under EU AI Act Art. 50.2, and a documented incident path for harmful generations.

### 13. General-Purpose AI / foundation-model obligations (EU AI Act Chapter V, Arts. 51–55)

In force since **2 August 2025**. Applies to providers of GPAI models (LLMs, large multimodal models, large image/audio/video models). Requires, per Art. 53:

- Technical documentation of the model (training process, evaluation, design)
- Information for downstream providers integrating the model (capabilities, limitations, intended use)
- Copyright-compliance policy + **publicly available summary of training-data content** (Art. 53.1(d))
- Cooperation with the AI Office and national authorities

**GPAI with systemic risk** (Art. 51) — triggered when cumulative training compute exceeds **10^25 FLOPs** or by AI Office designation. Adds Art. 55 obligations:

- Model evaluation (including adversarial testing / red-teaming)
- Systemic-risk assessment + mitigation
- Serious-incident tracking and reporting to the AI Office
- Cybersecurity protections for the model and its physical infrastructure

Look for: `compliance/gpai/model-card.md`, `compliance/gpai/training-data-summary.md`, `compliance/gpai/copyright-policy.md`. Open-source GPAI models with weights + parameters publicly available are partially exempt (Art. 53.2) unless they meet the systemic-risk threshold — document the exemption claim explicitly.

### 14. Prohibited AI practices (EU AI Act Art. 5, in force since 2 February 2025)

Hard-banned regardless of conformity assessment. If the repo implements any of these, this is a **stop-ship, market-withdrawal finding** (€35M / 7% turnover penalty):

- Social scoring by public authorities or for general-purpose social evaluation
- Untargeted scraping of facial images from the internet or CCTV to build face-recognition databases
- Real-time remote biometric identification in publicly accessible spaces for law enforcement (narrow exceptions only)
- Emotion recognition in the workplace or in educational institutions (medical/safety exceptions only)
- Biometric categorization to infer race, political opinions, trade-union membership, religious/philosophical beliefs, sex life, or sexual orientation
- Predictive policing based solely on profiling a person or assessing personality traits
- AI that exploits vulnerabilities of specific groups (age, disability, socioeconomic) causing significant harm
- Subliminal techniques beyond a person's consciousness causing significant harm

## 7-language risk-classification metadata

Every AI call site / model loader in the repo should carry a machine-readable risk classification tag. This is what makes the inventory **trustworthy** — the inventory file and the code agree, because the code declares its own classification, and a static scan can verify the two match.

### Python 3.12+

```python
# ai_risk.py — decorator + classifier
from ai_risk import classify, Tier, AnnexIII

@classify(tier=Tier.HIGH_RISK, annex_iii=AnnexIII.EMPLOYMENT, system_id="cv-screener-v3")
def screen_resume(text: str) -> float:
    """High-risk under EU AI Act Annex III §4 (employment). Requires human review."""
    return model.predict(text)
```

The `@classify` decorator registers the function in a process-local registry (`ai_risk._REGISTRY`) so the scanner can produce an inventory dump at import time. Tag mismatches between code and `ai-systems.yaml` are flagged as critical.

### TypeScript 5+

```typescript
// Decorator (TC39 stage 3 decorators in TS 5.0+) + JSON-schema-tagged metadata
import { AIRiskClassification, AnnexIII, Tier } from "@org/ai-governance";

class CvScreener {
  @AIRiskClassification({
    tier: Tier.HighRisk,
    annexIII: AnnexIII.Employment,
    systemId: "cv-screener-v3",
    humanOversight: "loan-officer-approval",
  })
  async screen(resume: string): Promise<number> {
    return await this.model.predict(resume);
  }
}
```

The JSON-schema variant (no decorators) lives next to the call site as `ai-meta.json` and is validated against `.ctoc/schemas/ai-risk.schema.json`.

### Java 21+

```java
// Annotation processor emits inventory at compile time
@AIRiskCategory(
    tier = Tier.HIGH_RISK,
    annexIII = AnnexIII.ESSENTIAL_SERVICES,
    systemId  = "credit-scorer-v2",
    humanOversight = "credit-officer-approval"
)
public record CreditScoreRequest(String applicantId, double income) {}
```

`@AIRiskCategory` is retained at runtime (`@Retention(RUNTIME)`) so frameworks (Spring, Micronaut) can attach interceptors that enforce the override surface and emit audit events.

### C# (.NET 9)

```csharp
// Attribute usable on methods, classes, minimal-API delegates
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class | AttributeTargets.Delegate)]
public sealed class AIRiskClassificationAttribute(string tier) : Attribute
{
    public string Tier { get; } = tier;
    public string? AnnexIII { get; init; }
    public string? SystemId { get; init; }
    public string? HumanOversight { get; init; }
}

// Usage on minimal API
app.MapPost("/loans/{id}/propose",
    [AIRiskClassification("high"), AIAnnexIII("5-essential-services")]
    async (int id, ILoanModel m, AppDb db) =>
    {
        var proposal = m.Predict(id);
        db.LoanProposals.Add(new(id, proposal, "awaiting-human-review"));
        await db.SaveChangesAsync();
    });
```

A Roslyn analyzer (`AIRiskClassificationAnalyzer`) enforces that every method calling a known model SDK (`Anthropic.SDK`, `OpenAI`, `Azure.AI.OpenAI`, `Microsoft.ML`, ONNX runtime) carries the attribute.

### SQL — AI system registry table

```sql
-- Authoritative registry. Inventory file and code annotations are derived views.
CREATE TABLE ai_system_registry (
    system_id          TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    risk_class         TEXT NOT NULL
        CHECK (risk_class IN ('prohibited','high-risk','limited-risk','minimal-risk')),
    annex_iii_category TEXT
        CHECK (annex_iii_category IN
            ('1-biometrics','2-critical-infrastructure','3-education',
             '4-employment','5-essential-services','6-law-enforcement',
             '7-migration','8-justice') OR annex_iii_category IS NULL),
    intended_purpose      TEXT NOT NULL,
    model_provider        TEXT NOT NULL,
    deployment_context    TEXT NOT NULL,
    human_oversight_role  TEXT,
    conformity_status     TEXT NOT NULL
        CHECK (conformity_status IN
            ('not-applicable','self-assessed','notified-body-pending','notified-body-passed')),
    notified_body_id      TEXT,
    ce_marking_affixed    BOOLEAN NOT NULL DEFAULT FALSE,
    eu_db_registration_id TEXT,
    last_reviewed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Constraint: high-risk system MUST have an Annex III category and human oversight role
ALTER TABLE ai_system_registry ADD CONSTRAINT high_risk_requires_annex_iii
    CHECK (risk_class <> 'high-risk' OR annex_iii_category IS NOT NULL);
ALTER TABLE ai_system_registry ADD CONSTRAINT high_risk_requires_oversight
    CHECK (risk_class <> 'high-risk' OR human_oversight_role IS NOT NULL);
```

A registry table makes the inventory queryable, joinable to audit-log tables, and unambiguous at regulator inspection time.

### Go 1.22+

```go
// Struct-tag + registry pattern; the init() registers with a process-local AI registry
type CvScreener struct {
    _ struct{} `ai:"tier=high-risk,annex_iii=4-employment,system_id=cv-screener-v3,human_oversight=hr-reviewer-approval"`
}

func init() { airisk.MustRegister[CvScreener]() }   // panics on tag-parse error → caught in CI

func (c *CvScreener) Screen(ctx context.Context, resume string) (float64, error) {
    return c.model.Predict(ctx, resume)             // airisk middleware enforces human-review gate
}
```

A `go vet` analyzer (`airiskcheck`) walks AST nodes that call known model SDKs (`github.com/anthropics/anthropic-sdk-go`, `github.com/openai/openai-go`, ONNX-Go) and flags receivers missing the `ai:` struct tag.

### Rust 1.75+

```rust
// Procedural macro emits inventory + enforces compile-time exhaustiveness
use ai_governance::{ai_risk_classify, Tier, AnnexIII};

#[ai_risk_classify(
    tier = Tier::HighRisk,
    annex_iii = AnnexIII::EssentialServices,
    system_id = "credit-scorer-v2",
    human_oversight = "credit-officer-approval"
)]
pub async fn score_credit(req: &CreditRequest) -> Result<CreditDecision, ModelError> {
    MODEL.predict(req).await
}
```

The proc macro both registers the function in a `linkme`-collected slice (for runtime inventory dump) and emits a compile error if a function calling `MODEL.predict` lacks the attribute.

### C / C++ — skipped (rationale)

Skipped intentionally. AI risk classification is a **call-site declaration about a model invocation**; in practice, model inference in C/C++ is done via embedded inference runtimes (ONNX Runtime, TensorRT, llama.cpp, libtorch) called from a higher-level orchestration tier (Python, Java, Go, C#, Node, Rust). The orchestration tier is where the regulatory boundary sits — that is where the system is named, classified, deployed, and made user-facing. Annotating the C/C++ inference primitive with a risk class would either duplicate the orchestration-tier classification (drift risk) or impose a regulatory abstraction on a layer that is correctly **regulation-agnostic infrastructure**. The recommendation is: keep C/C++ inference code regulation-agnostic, classify at the orchestration tier, and have the SQL registry as the bridge.

## Scan Methodology

### Phase 1 — Inventory discovery

```bash
# Look for the canonical inventory artifact
fd -t f -e yaml -e json -e md '(ai-systems|ai-inventory|ai-register|ai_systems)'
rg -l 'risk_class:\s*(prohibited|high-risk|limited-risk|minimal-risk)'
```

No hit → emit "missing AI system inventory" critical.

### Phase 2 — Model call-site enumeration

```bash
# Python
rg -l 'from\s+(anthropic|openai|google\.generativeai|cohere|mistralai)\s+import|transformers|sklearn|xgboost|lightgbm|torch|tensorflow'
# JS/TS
rg -l '@anthropic-ai/sdk|openai|@google/generative-ai|@huggingface|onnxruntime-web|@tensorflow/tfjs'
# Java
rg -l 'com\.anthropic|com\.openai|com\.azure\.ai\.openai|org\.tensorflow|org\.deeplearning4j'
# .NET
rg -l 'Anthropic\.SDK|using\s+OpenAI|Azure\.AI\.OpenAI|Microsoft\.ML|Microsoft\.ML\.OnnxRuntime'
# Go
rg -l 'github\.com/anthropics/anthropic-sdk-go|github\.com/openai/openai-go|github\.com/yalue/onnxruntime_go'
# Rust
rg -l 'use\s+(anthropic_sdk|async_openai|candle_core|ort|llm_chain)::'
```

For each call site, verify a risk-classification declaration is present (decorator/attribute/annotation/struct-tag/proc-macro/metadata file). Sites without classification → critical.

### Phase 3 — Cross-check registry vs code

Diff `ai-systems.yaml` against decorator/attribute/annotation declarations. Any mismatch (system in code but not in registry, or vice versa, or risk_class disagrees) → critical.

### Phase 4 — Artifact presence checks

For each high-risk system, verify all of: technical documentation (Art. 11), data lineage (Art. 10), human-oversight surface (Art. 14), incident runbook (Art. 73), conformity declaration (Art. 47), CE marking artifact (Art. 48), EU database registration ID (Art. 49), AI literacy training reference (Art. 4), log retention policy (Art. 26).

### Phase 5 — Generative-AI specifics

If any model provider in Phase 2 is generative (LLM, image, video, audio), additionally verify: a documented stance against each of the 12 NIST AI 600-1 risk categories (see §Categories.12), transparency disclosure on user-facing paths (Art. 50), output detectability / watermark on generated content (Art. 50.2).

### Phase 6 — GPAI / foundation-model obligations + prohibited-use scan

If the codebase **provides** a GPAI model (not merely consumes one): verify model card, training-data summary (Art. 53.1(d)), copyright-compliance policy, and — if training compute approaches 10^25 FLOPs — Art. 55 systemic-risk obligations (red-teaming evidence, systemic-risk assessment, AI-Office incident-reporting channel).

Cross-check the inventory against Art. 5 prohibited practices (see §Categories.14). Any match is a **stop-ship finding** — emit with `kind: prohibited-use-detected` and `severity: critical`. Recommend immediate removal or, where a narrow legal exception applies, a documented legal-basis memo.

## Tool Integration (2026)

| Tool | Purpose | When |
|---|---|---|
| **Credo AI Lens / Credo AI Platform** | AI governance OS — policy library, risk assessments, EU AI Act + NIST AI RMF templates | Continuous; integrates with model registries |
| **Holistic AI** | Algorithmic risk + bias auditing; AI governance dashboards | Pre-deployment + scheduled audits |
| **Fairly AI** | AI risk management aligned to NIST AI RMF + ISO 42001 | Pre-deployment, conformity-prep |
| **IBM watsonx.governance** | Inventory, lineage, evaluation, fact sheets | Enterprise-scale inventories |
| **Microsoft Purview AI Governance** | Discovery of AI usage across Microsoft 365 + Azure; risk classification | Microsoft-stack tenants |
| **Azure AI Foundry (governance features)** | Model registry, evaluation, content safety integration | Azure-native AI workloads |
| **Vanta · Drata · Secureframe** | ISO/IEC 42001 readiness assessments (control mapping, evidence collection) | 42001 certification pursuit |
| **NIST AI RMF Playbook** | Reference playbook for Govern/Map/Measure/Manage actions (free, NIST.gov) | Build the in-house program |
| **AI Act Service Desk (EU Commission)** | Authoritative interpretation of Articles + Annexes | When the law itself is ambiguous |

For the scanner itself, this skill is regex + structural. The vendor tools above are operational governance platforms; coordinate output but do not depend on them.

## Severity reconciliation

These tiers are the **internal triage view** for the human-readable report. When this skill emits a letter via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-critical rule — there is no soft tier on the wire.

| Triage tier | Examples | Internal action |
|---|---|---|
| CRITICAL | Annex III system with no risk classification · no human oversight on high-risk system · missing CE marking on placed-on-market high-risk system · missing transparency disclosure on chatbot · prohibited-use detected (social scoring, untargeted face scraping, real-time biometric ID in public except narrow exceptions) | BLOCK release |
| HIGH | Missing AI literacy program · missing incident runbook · missing post-market monitoring · log retention < 180 days | BLOCK release if past 2 Aug 2026 |
| MEDIUM | Missing NIST AI 600-1 risk register on generative use · missing Statement of Applicability (only relevant for 42001 cert pursuit) · documentation present but incomplete on Annex IV items | Fix this sprint |
| LOW | Code uses inconsistent metadata format (decorator + attribute + JSON file disagree on minor fields) · inventory missing optional fields | Backlog |

All tiers above emit `severity: critical` over the wire.

## Letter schema (refinement-loop output contract)

```yaml
finding_id: <sha256(skill+regulation+system_id+control)[:12]>
severity: critical                         # ALWAYS critical (warnings-are-critical)
confidence: high | medium | low            # high = artifact provably absent; medium = ambiguous; low = needs reviewer eyes
engine: ai-governance-checker
kind: missing-inventory | missing-classification | missing-oversight |
      missing-technical-docs | missing-data-lineage | missing-transparency |
      missing-ce-marking | missing-ai-literacy | missing-incident-runbook |
      missing-post-market-monitoring | missing-soa | genai-gap |
      gpai-obligation-gap | prohibited-use-detected | classification-mismatch |
      missing-eu-db-registration | missing-notified-body
regulation: eu-ai-act | nist-ai-rmf | nist-ai-600-1 | iso-42001
regulation_ref: <article/annex/control id, e.g. "EU-AI-Act Art. 14" or "ISO-42001 A.7.3" or "NIST AI RMF MEASURE 2.7" or "NIST-AI-600-1 risk-09-information-security">
risk_class: prohibited | high-risk | limited-risk | minimal-risk | gpai | gpai-systemic-risk | unknown
annex_iii_category: 1-biometrics | 2-critical-infrastructure | 3-education |
                    4-employment | 5-essential-services | 6-law-enforcement |
                    7-migration | 8-justice | null
# Conformity-assessment surface (high-risk systems only; null otherwise)
notified_body_required: true | false | null      # true for Annex III §1(a) remote biometric ID + Annex I safety components
notified_body_id: <four-digit NB number, or null if self-assessment or pending>
ce_marking_status: affixed | pending | not-applicable | missing
eu_database_registered: true | false | not-applicable
declaration_of_conformity: present | missing | not-applicable
system_id: <id from ai-systems.yaml / SQL registry / decorator; null if discovery flagged a system not yet inventoried>
target_file: <file path, or 'repo-root' for missing-at-org-level findings>
target_line: <line number, or null>
message: "High-risk loan-decision endpoint has no human override surface (EU AI Act Art. 14)."
suggested_fix: "Split the endpoint into /loans/{id}/propose (AI proposal, status=awaiting-human-review) and /loans/{id}/human-decide (human approver, audit-logged). See SKILL §Categories.3."
defers_to:
  - data-ml/ml-model-validator: "model-quality findings (accuracy, drift, fairness metrics)"
  - ai-quality/llm-security-tester: "adversarial-input / prompt-injection mechanics"
  - ai-quality/hallucination-detector: "confabulation detection mechanics"
  - compliance/gdpr-compliance-checker: "personal-data / Art. 10 data-protection overlap"
reference:
  - https://artificialintelligenceact.eu/article/14/
  - https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf
deadline_relevance: "EU AI Act high-risk obligations enforceable 2 Aug 2026 (Art. 4 + Title II prohibitions: 2 Feb 2025; Chapter V GPAI: 2 Aug 2025)"
```

The integrator uses `regulation` + `regulation_ref` to deduplicate findings that span frameworks (one EU AI Act Art. 10 finding does not need to be re-raised as ISO 42001 A.7 because the underlying gap is the same). `confidence: low` single-source findings do not block phase advancement on their own; an artifact provably absent (`confidence: high`) does.

---

## Refinement Loop — critic mode

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every missing AI-governance artifact emits as `severity: critical` in the letter to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- AI-governance findings block phase advancement until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section with a documented regulatory analysis (not just "we'll handle it later").

The principle: an AI Act finding today is a market-withdrawal order or a €15M / 3%-of-turnover penalty after 2 August 2026. Code that ships green-on-quality but red-on-governance ships with statutory liability built in.

## Sources

- EU AI Act (Regulation 2024/1689), consolidated text + Annex III + Annex IV + Annex VI + Annex VII + Articles 4 / 5 / 6 / 10 / 11 / 14 / 15 / 26 / 43 / 47 / 48 / 49 / 50 / 51 / 52 / 53 / 55 / 71 / 72 / 73 — artificialintelligenceact.eu and AI Act Service Desk (ai-act-service-desk.ec.europa.eu).
- European AI Office — European Commission DG CNECT (digital-strategy.ec.europa.eu/en/policies/ai-office).
- NIST AI Risk Management Framework 1.0 (January 2023) — nvlpubs.nist.gov.
- NIST AI 600-1 Generative AI Profile (July 2024, 12 risk categories) — nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf.
- ISO/IEC 42001:2023 — Information technology — Artificial intelligence — Management system (Annex A: 38 reference controls across 9 control objectives A.2–A.10).
- Framework comparison background: gaicc.org, eccouncil.org, cloudsecurityalliance.org, elevateconsult.com.
