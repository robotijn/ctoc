# Independence and Segregation of Duties

This document explains the three independence controls in CTOC's regulatory regime framework, when each is required, and how they integrate with the Iron Loop. It is the reference for Cluster 2 (Independence and Segregation of Duties) controls declared in [`src/lib/regulatory-regime.js`](../src/lib/regulatory-regime.js).

The three controls are:

1. `independent_verification_validation` — the Independent Verification and Validation Chief.
2. `four_eyes_gate3` — two distinct principals at Gate 3.
3. `privilege_posture` — per-plan work-product privilege classification.

None of these are active by default. CTOC remains lean for the common case. Each control activates only when an active regulatory profile (in `.ctoc/regulatory-regimes/*.yaml`) declares it as required.

---

## 1. Independent Verification and Validation

### What it is

The Independent Verification and Validation Chief (abbreviated to "IV&V Chief" after first use) is a Tier 1 sub-orchestrator whose entire purpose is to re-run the safety-critical Iron Loop steps from a position of organizational and technical independence from the CTO Chief development chain. Defined in [`agents/coordinator/ivv-chief.md`](../agents/coordinator/ivv-chief.md).

The IV&V Chief reports to the **user**, not to `cto-chief`. This is the load-bearing property. If the same coordinator owned both the development chain and the verification chain, the verification would not be independent and the assurance argument would collapse.

The IV&V Chief writes its audit log under `.ctoc/audit/ivv-dispatches/`, a directory that the CTO Chief chain cannot write to. This separation is enforced by the hook in `src/hooks/human-gate-check.js`.

### When it is required

The control is set by regulatory profiles whose underlying standard explicitly requires independent verification:

| Profile | Standard | Reference |
|---|---|---|
| `iso-26262-asil-d` | International Organization for Standardization 26262 Automotive Safety Integrity Level D | ISO 26262:2018 Part 6 Clause 5.4.3 |
| `do-178c-dal-a` | Radio Technical Commission for Aeronautics DO-178C Design Assurance Level A | [DO-178C](https://www.rtca.org/) Section 6.2 |
| `iec-62304-class-c` | International Electrotechnical Commission 62304 Software Safety Class C (medical devices where a hazard could lead to death or serious injury) | IEC 62304:2006+A1:2015 Clause 5.7.4 |
| `nasa-class-a` | National Aeronautics and Space Administration software classifications A and B | [NASA SWE-141](https://swehb.nasa.gov/display/SWEHBVD/SWE-141+-+Independent+Verification+and+Validation+%28IV%26V%29+Activities); NASA-STD-8739.8 |

### How it integrates with the Iron Loop

The IV&V Chief re-runs exactly three steps using fresh subagent contexts:

- **Step 11 REVIEW** — independent re-review of the diff. Specialists re-dispatched without seeing the author-side reviewer's notes.
- **Step 13 SECURE** — independent re-security. The threat model is re-derived from source, not imported.
- **Step 14 VERIFY** — independent re-verification. Stricter thresholds: 95% coverage on new code for ISO 26262 ASIL D and DO-178C DAL A (not the standard 80%), Modified Condition Decision Coverage per DO-178C Table A-7 objective 5, mutation-test score at or above 70%, 0 flaky tests across at least 10 consecutive runs.

Findings are reported in the **Issue, Rule, Application, Conclusion** schema (commonly abbreviated to "IRAC" after first use). Every finding names the rule it violates, not just the defect.

### Why developer-only review is not enough

DO-178C Section 6.1.4 names "developer bias" as the reason commercial-aviation software certification requires independent verification. In any sufficiently complex system, the development chief acquires blind spots aligned with the choices it made during design. The CTO Chief is highly capable, but it is still one coordinator with one set of priors. For projects where a defect can kill someone or sink a bank, the assurance argument demands a structurally separate coordinator that re-derives the verdict from the artefacts. That is the IV&V Chief.

---

## 2. Four-Eyes at Gate 3

### What it is

The "four-eyes principle" — sometimes called "two-person integrity" or "dual control" — requires that two distinct principals sign off before a plan crosses Gate 3 (review to done). Implemented by [`src/lib/four-eyes.js`](../src/lib/four-eyes.js).

Plan frontmatter carries two markers:

```yaml
approved_by_author_review: <role-name>
approved_by_independent:   <role-name>
```

The two role names resolve in [`.ctoc/roles.yaml`](../.ctoc/roles.yaml). The library verifies:

1. Both markers are present.
2. Both role names are declared.
3. The author-review role has `can_review: true`.
4. The independent approval role has `can_approve: true`.
5. The two roles resolve to **distinct identities**. This last check is the whole point.

### When it is required

| Profile | Standard | Reference |
|---|---|---|
| `sox-itgc` | Sarbanes-Oxley Section 404 Information Technology General Controls | Public Company Accounting Oversight Board Auditing Standard 2201; access-segregation requirement |
| `pci-dss-v4` | Payment Card Industry Data Security Standard version 4 | [Requirement 6.5.4](https://www.pcisecuritystandards.org/) — segregation of duties between development and production environments |
| `iso-27001` | International Organization for Standardization 27001:2022 | Annex A control 5.3 (segregation of duties) |

### How it integrates with the Iron Loop

The pre-tool hook in `src/hooks/human-gate-check.js` consults `four-eyes.js` when the `four_eyes_gate3` control is active. If a plan reaches `done/` without both markers satisfying the identity-distinctness property, the hook auto-reverts the move, logs the violation to `.ctoc/logs/gate-violations.json`, and alerts the user.

### Solo-developer mode

The default `.ctoc/roles.yaml` ships with a single `human` role and one `ai-author` role that explicitly cannot approve. A solo developer working without an external reviewer who wishes to honor four-eyes can add a second human role (peer reviewer) or, in the IV&V case, the `ivv-chief` role. The library refuses to accept the AI assistant as the independent approver — that is intentional. An AI assistant authoring the change and then "approving" it would defeat the entire control.

---

## 3. Privilege Posture

### What it is

The per-plan `privilege_posture` frontmatter field declares whether the work product of a given plan is intended to fall inside the protection of the attorney-client privilege and the attorney work-product doctrine. Implemented by [`src/lib/privilege-posture.js`](../src/lib/privilege-posture.js).

Three valid values:

| Value | Meaning |
|---|---|
| `none` (default) | No privilege claimed. The plan and downstream artefacts are ordinary business records, discoverable in litigation under the ordinary rules. |
| `counsel-directed` | The plan was authored at the direction of legal counsel for the purpose of obtaining legal advice or in anticipation of litigation. The audit log carries the "Privileged and Confidential" banner. |
| `client-only` | The plan was authored by in-house client personnel without counsel involvement. The audit log explicitly disclaims privilege so that no inadvertent over-claim occurs. |

The library exposes:

- `getPosture(planPath)` — reads the declared value, returning `none` if absent.
- `validatePosture(value)` — validates a candidate value without touching the filesystem.
- `warningBanner(posture)` — returns the disclosure banner text to embed in the audit log.

### Why both directions matter

Over-claiming privilege is as damaging as under-claiming it. Two 2026 United States federal court rulings sharpened this:

- **Heppner v. Allianz Global Investors U.S. LLC**, United States District Court for the Southern District of New York, 17 February 2026 — held that internal-investigation work product prepared by client personnel without counsel direction is not protected by the attorney-client privilege merely because the subject matter is sensitive. Over-claiming privilege in the audit trail risks a subject-matter waiver across the broader record.
- **Warner v. Gilbarco Veeder-Root LLC**, United States District Court for the Middle District of North Carolina, 10 February 2026 — reinforced that the work-product doctrine requires a demonstrable anticipation-of-litigation purpose at the time of creation; retrospective relabeling does not retroactively confer protection.

Together these rulings make declaration-at-creation-time load-bearing. The privilege posture must be set when the plan is authored, the banner must be embedded in the audit log at that moment, and downstream artefacts must inherit the posture without modification.

### When it is required

The `privilege_posture` control activates when any active profile sets it. In practice this includes:

- `legal-hold-enabled` profile (litigation-active projects).
- `sox-itgc` profile in companies whose general counsel directs the ITGC remediation work.
- Custom enterprise profiles that include legal-team-overseen development.

When the control is not active, plans may still declare a posture; the library accepts it and the banner is still embedded. The control simply makes declaration mandatory rather than optional.

---

## How the three controls compose

The three controls are designed to compose without redundancy.

- **Four-eyes at Gate 3** is the lightest. It enforces dual control on the final approval, nothing more. Suitable for most regulated SaaS and financial-technology projects.
- **Privilege posture** is orthogonal. It governs the disclosure status of the audit record, not the approval flow. Activating it does not change who approves; it changes what the audit log says.
- **Independent Verification and Validation** is the heaviest. It re-runs Steps 11, 13, and 14 from a structurally separate coordinator. Required only for safety-of-life software and equivalent regulatory tiers.

A safety-critical medical-device project with active litigation might activate all three:

```yaml
# .ctoc/settings.yaml
regulatory_regime:
  active_profiles:
    - iec-62304-class-c        # activates independent_verification_validation
    - sox-itgc                 # activates four_eyes_gate3
    - legal-hold-enabled       # activates privilege_posture
```

A typical United States public-company SaaS product activates only `four_eyes_gate3` via `sox-itgc`. A consumer mobile app activates none of them.

---

## References

- [DO-178C Software Considerations in Airborne Systems and Equipment Certification](https://www.rtca.org/) — Section 6 (Software Verification Process), the canonical source for the independence-of-verification requirement.
- [National Aeronautics and Space Administration Software Engineering Requirement SWE-141 — Independent Verification and Validation Activities](https://swehb.nasa.gov/display/SWEHBVD/SWE-141+-+Independent+Verification+and+Validation+%28IV%26V%29+Activities).
- ISO 26262:2018 Part 6 — Road vehicles, Functional safety, Product development at the software level.
- IEC 62304:2006+A1:2015 — Medical device software life-cycle processes.
- Public Company Accounting Oversight Board Auditing Standard 2201 — An Audit of Internal Control Over Financial Reporting.
- [Payment Card Industry Data Security Standard version 4](https://www.pcisecuritystandards.org/) — Requirement 6.5.4.
- International Organization for Standardization 27001:2022 — Annex A control 5.3 (segregation of duties).
- Heppner v. Allianz Global Investors U.S. LLC, United States District Court for the Southern District of New York, 17 February 2026.
- Warner v. Gilbarco Veeder-Root LLC, United States District Court for the Middle District of North Carolina, 10 February 2026.
