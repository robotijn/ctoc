---
name: redundancy-pattern-picker
description: Recommends a redundancy pattern — dual-core lockstep, N-version programming, voting, hot or cold standby — given the safety integrity level, the failure modes uncovered by FMEDA, and the cut sets uncovered by Fault Tree Analysis. Warns explicitly against common-cause assumptions that defeat the diversity claim.
type: skill
when_to_load:
  - "redundancy"
  - "redundant"
  - "lockstep"
  - "N-version programming"
  - "voting redundancy"
  - "triple modular redundancy"
  - "hot standby"
  - "cold standby"
  - "diverse redundancy"
  - "ASIL D redundancy"
  - "SIL 3 redundancy"
  - "common cause"
related_skills:
  - safety/fmeda-analyzer
  - safety/fault-tree-builder
  - specialized/resilience-checker
  - architecture/dependency-analyzer
effort_level: high
model_optimized_for: opus-4-7
allowed-tools: [Read, Grep, Glob]
model: opus
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Redundancy Pattern Picker (skill)

> New in CTOC v6.9.27 — Cluster 3 (Risk Analysis Before Build). Recommends one or more redundancy patterns based on the safety integrity level, the failure modes uncovered by [[safety/fmeda-analyzer]], and the minimal cut sets uncovered by [[safety/fault-tree-builder]].
> Outputs a `redundancy_pattern.yaml` per plan with the recommendation, the rationale, the residual risks, and the explicit common-cause caveat the 2024 Analog Devices application note "Mitigation of Common-Cause Failures in Safety-Critical Systems" requires.

## Role

You are a safety architect. Your job is to pick a redundancy pattern that the rest of the design can defend in writing. Not every system needs redundancy. When it does, the wrong pattern is worse than no pattern: it consumes engineering budget while creating a single point of failure that the design documents claim is redundant.

You operate at Step 6 (DESIGN) of the Iron Loop, after the FMEDA and the Fault Tree Analysis have run. The recommendation feeds Step 7 (SPEC) so the implementation specification reflects the chosen pattern.

## When to load

- The active regulatory regime declares `fmeda_design` AND the FMEDA has surfaced one or more single-point dangerous failures.
- The Fault Tree contains a minimal cut set of size one.
- The plan declares `criticality: high` and the architecture has fewer than two channels per safety function.
- The user explicitly requests a redundancy recommendation.

If the system has no safety integrity level and no high-criticality flag, the skill is inert. Redundancy is expensive; do not recommend it where the safety case does not require it.

## 2026 Best Practices

- **Redundancy is the second answer, not the first.** The first answer is to reduce the failure rate of the single channel (better part, better cooling, lower de-rating, better diagnostic coverage). Add redundancy only when the single-channel design cannot meet the Single-Point Fault Metric, the Probabilistic Metric for Hardware Failures, or the Tolerable Hazard Rate threshold for the declared integrity level.
- **Diversity is the load-bearing property.** Identical redundant channels share every failure mode the underlying technology has. Two identical microcontrollers running identical firmware will hit the same software bug at the same input. The diversity dimension that breaks the correlation must be named: independent supplier, independent toolchain, independent algorithm, independent power, independent clock, independent operating temperature. Without a named diversity dimension, the redundancy is documentary, not actual.
- **N-version programming is NOT a universal answer.** The 2024 Analog Devices application note "Mitigation of Common-Cause Failures in Safety-Critical Systems" (https://www.analog.com/en/resources/app-notes/mitigation-of-common-cause-failures-in-safety-critical-systems.html) warns that correlated faults defeat the diversity assumption. Two independently-developed implementations of the same specification tend to share the same edge-case blind spots because the specification itself is the common cause. Knight and Leveson's classic 1986 experiment ("An Experimental Evaluation of the Assumption of Independence in Multiversion Programming") found correlations significantly above zero across twenty-seven independent implementations of the same problem. Treat N-version as a partial mitigation, not a guarantee.
- **Lockstep is for transient faults, not for systematic faults.** Dual-core lockstep (the two cores execute the same instruction stream and a hardware comparator flags mismatches) protects against transient hardware faults (single-event upsets, supply glitches) extremely well. It does NOT protect against systematic faults (compiler bug, specification bug, common-mode software defect) because both cores execute identical code. The diversity dimension is hardware-only.
- **Voting redundancy needs an odd number and a trusted voter.** Triple Modular Redundancy assumes that no more than one of three channels fails at a time AND that the voter itself does not fail. The voter is a hidden single point of failure unless it is itself redundant. For ASIL D and SIL 3, the voter typically uses a separate technology (a discrete logic comparator rather than a microcontroller) to break the dependency chain.
- **Hot standby trades cost for transition time.** Hot standby (the secondary runs in parallel with the primary, synchronised state, instant takeover) costs roughly twice the primary in hardware and operating expense. Its takeover latency is in the order of milliseconds. Cold standby (secondary powered off, must boot to take over) costs roughly the same in capital but less in operating expense; its takeover latency is in the order of seconds to minutes. Use hot standby when the Fault Tolerant Time Interval is shorter than the cold-standby boot time.
- **The common-cause factor is the bottom line.** All of the patterns above benefit from a small common-cause factor (beta in IEC 61508 Part 6 Annex D). Common values range from five percent for "fully segregated, fully diverse, independent supply" to twenty-five percent for "co-located, identical, single supplier". The recommendation MUST cite the beta value used in the supporting FMEDA / FTA and MUST justify it against an architecture-specific table.

## Inputs

- `.ctoc/safety/fmeda/<plan-id>.yaml` — failure modes, diagnostic coverage, metric gaps.
- `.ctoc/safety/fault-trees/<plan-id>__*.yaml` — minimal cut sets, top-event probability.
- The plan's `## Architecture` section — current channel count, current diversity dimensions, current power and clock topology.
- The safety goals' Fault Tolerant Time Interval (how fast the system must reach the safe state).
- The cost and schedule budget if provided — the recommendation is not free.

## Outputs

A single artifact at `.ctoc/safety/redundancy/<plan-id>.yaml`:

```yaml
plan_id: <plan filename without extension>
asil_or_sil: <integrity level under analysis>
analysis_date: YYYY-MM-DD
analyst: <agent or human author>
recommended_pattern: dual-core-lockstep | triple-modular-redundancy | dual-channel-diverse | n-version-programming | hot-standby | cold-standby | none
rationale: |
  <Multi-paragraph explanation that references the specific FMEDA gap, the
  specific FTA cut set, the Fault Tolerant Time Interval, the diversity
  dimension proposed, and the cost-versus-coverage trade-off.>
diversity_dimensions:
  hardware_supplier: <e.g., supplier A for primary, supplier B for secondary>
  toolchain: <e.g., compiler A versus compiler B, qualified separately>
  algorithm: <e.g., model-based control for primary, look-up table for secondary>
  power: <e.g., independent rails with independent regulators>
  clock: <e.g., independent oscillators, drift bounded>
  operator: <e.g., two distinct teams developed the channels>
common_cause_assessment:
  beta_factor_pct: <number between 0 and 100>
  beta_factor_source: <IEC 61508 Part 6 Annex D table reference, or project-specific evidence>
  shared_dependencies:
    - <e.g., shared power supply, shared mechanical chassis, shared sensor input>
  segregation_evidence:
    - <e.g., separate PCB, separate enclosure, separate cooling path>
voter_strategy: <if the pattern needs a voter, document how the voter itself is protected>
expected_metric_improvement:
  single_point_fault_metric_pct: <projected value after redundancy>
  probabilistic_metric_hardware_failures_per_hour: <projected value>
  top_event_probability_per_hour: <projected value>
residual_risks:
  - <List of failure modes the redundancy does NOT cover, with cited rationale>
cost_estimate:
  bill_of_materials_delta_pct: <number>
  development_schedule_delta_weeks: <number>
  operating_expense_delta_pct: <number>
alternatives_considered:
  - pattern: <each alternative>
    why_rejected: <one-sentence rationale>
review_status: draft | reviewed | approved
reviewer: <name and date; required for ASIL C/D and SIL 2/3>
```

## Pattern catalogue

The catalogue below summarises the canonical patterns. The recommendation MUST pick from this set or justify a deviation in the `rationale` block.

### 1. Dual-core lockstep

Two processor cores execute the same instruction stream from the same memory in tight synchronisation; a hardware comparator flags any mismatch. Used by Infineon AURIX, NXP S32K3, STMicroelectronics SPC58, Texas Instruments Hercules. Strong against transient hardware faults; weak against systematic faults (compiler bugs, specification bugs, common-mode software defects) because both cores execute identical code.

| Property | Value |
|---|---|
| Diversity dimension | Hardware only (transient-fault tolerance) |
| Coverage class | Very high for transient faults; zero for systematic faults |
| Hardware cost | Roughly two times a single-core equivalent |
| Software cost | Low — same firmware runs in both cores |
| Best for | ASIL D microcontrollers, IEC 61508 SIL 3 logic solvers |
| Common-cause factor | Low for hardware faults; high for software faults — always pair with a software diagnostic layer |

### 2. Triple Modular Redundancy with majority voting

Three identical channels feed a two-out-of-three voter. Used in aerospace flight-control computers and in nuclear safety logic. The voter is a hidden single point of failure unless the voter is itself implemented in a separate technology.

| Property | Value |
|---|---|
| Diversity dimension | Channel multiplicity only by default; add diversity for systematic faults |
| Coverage class | Very high for single-channel failures; depends on voter integrity |
| Hardware cost | Roughly three times the single-channel equivalent plus a voter |
| Software cost | Low — same firmware unless the channels are also diverse |
| Best for | Aerospace control, nuclear safety logic, high-availability process control |
| Common-cause factor | Beta factor depends on segregation; the voter MUST be in a separate technology |

### 3. Dual-channel diverse

Two channels of different design feed a comparator. The diversity dimension is named (different supplier, different toolchain, different algorithm). The 2024 Analog Devices guidance recommends naming and defending the diversity dimension explicitly.

| Property | Value |
|---|---|
| Diversity dimension | Named (hardware supplier, toolchain, algorithm) |
| Coverage class | High for both transient and systematic faults |
| Hardware cost | Roughly two times the single-channel equivalent |
| Software cost | High — two independent implementations to maintain |
| Best for | ASIL D systems where systematic faults must be addressed |
| Common-cause factor | Lower than identical-redundancy designs; bounded by the shared specification |

### 4. N-version programming

N independent teams implement the same specification in different languages or toolchains. The runtime votes the outputs. Knight and Leveson 1986 found that independent implementations correlated significantly more than zero; Analog Devices 2024 confirms the finding in modern practice. Treat as a partial mitigation, not a guarantee.

| Property | Value |
|---|---|
| Diversity dimension | Independent implementation teams, independent toolchains |
| Coverage class | Partial — correlated faults remain when the specification is the source |
| Hardware cost | One times the single-channel equivalent |
| Software cost | N times the single-implementation equivalent |
| Best for | Specific algorithm-level diversity where the specification itself has been hardened |
| Common-cause factor | Higher than the literature claimed in the 1990s; expect five to fifteen percent residual correlation |
| Warning | Not a universal answer; the 2024 Analog Devices note is explicit about this |

### 5. Hot standby

Primary and secondary both run with synchronised state; on primary failure the secondary takes over within milliseconds. Used where the Fault Tolerant Time Interval is shorter than a cold-standby boot.

| Property | Value |
|---|---|
| Diversity dimension | Optional; commonly identical-and-segregated |
| Coverage class | High for hardware failures; depends on state-sync integrity |
| Hardware cost | Roughly two times the single-channel equivalent |
| Software cost | Medium — state synchronisation logic must be safety-qualified |
| Best for | Continuous-operation safety supervisors, financial trading kill-switches with low takeover latency |
| Common-cause factor | Beta varies; state-sync channel itself can introduce common-cause |

### 6. Cold standby

Secondary is powered off, takes over after detection plus boot. Takeover latency in the order of seconds to minutes.

| Property | Value |
|---|---|
| Diversity dimension | Optional |
| Coverage class | High for hardware failures when the Fault Tolerant Time Interval permits |
| Hardware cost | Roughly two times the single-channel equivalent in capital, lower in operating expense |
| Software cost | Low |
| Best for | Long-Fault Tolerant Time-Interval systems where boot latency is acceptable |
| Common-cause factor | Beta depends on segregation; consider shared boot media |

### 7. None (single-channel acceptable)

The single-channel design already meets the Single-Point Fault Metric, the Probabilistic Metric for Hardware Failures, and the Tolerable Hazard Rate thresholds with diagnostics alone. The recommendation `none` is the correct answer when the safety case is met. It MUST cite the metric values that justify the recommendation.

## Decision flow

```
1. Read the FMEDA. Does any component have a dangerous-undetected
   failure mode contributing to the Single-Point Fault Metric below
   threshold?
   - No → consider `none` and document the safety case.
   - Yes → continue.

2. Read the Fault Tree. Are there cut sets of size one?
   - No → improve diagnostic coverage on the existing channel first;
          redundancy is the second answer.
   - Yes → continue.

3. Is the failure mode transient (single-event upset, supply glitch)
   or systematic (specification bug, compiler bug)?
   - Transient only → dual-core lockstep is the cheapest answer.
   - Systematic → dual-channel diverse or N-version, with diversity
     dimensions named.
   - Both → triple modular redundancy with diverse channels.

4. Is the Fault Tolerant Time Interval shorter than the cold-standby
   boot time?
   - Yes → hot standby.
   - No → cold standby is acceptable.

5. Verify the common-cause factor against IEC 61508 Part 6 Annex D.
   - Beta above 20 percent → segregate further or the redundancy
     claim collapses to no redundancy.
   - Beta between 5 and 20 percent → document explicitly.
   - Beta below 5 percent → unusual; demand evidence.
```

## Examples (selected; not language-typed because the recommendation is architectural)

The output is YAML, not source code. The closest the implementation gets to language-specific is the inter-channel comparator, which the implementation step writes per the chosen pattern. Two short illustrative recommendations follow.

### Example 1 — embedded brake controller (ASIL D)

```yaml
plan_id: brake-controller-v2
asil_or_sil: ASIL-D
recommended_pattern: dual-core-lockstep
rationale: |
  The FMEDA reports a Single-Point Fault Metric of 96.4 percent against the
  ASIL D threshold of 99 percent, with the gap concentrated in the
  microcontroller's analog-to-digital-converter sampling path (FMEDA
  component MCU-BRAKE). The Fault Tree identifies a size-one cut set on
  this component (basic event B1: stuck-at fault on brake-control output).
  The fault is predominantly transient (single-event upsets dominate the
  failure-in-time per supplier datasheet section 11.4). Dual-core lockstep
  on an Infineon AURIX TC4 covers the transient fault path at very high
  coverage and requires no software diversity. A separate software-level
  diagnostic (control-flow monitor, watchdog window) covers the systematic
  residual.
diversity_dimensions:
  hardware_supplier: not applicable (lockstep on a single device)
  toolchain: single qualified toolchain
  algorithm: identical
  power: independent supply rails to the two cores
  clock: shared (lockstep requires it)
common_cause_assessment:
  beta_factor_pct: 8
  beta_factor_source: IEC 61508 Part 6 Annex D — "co-located, identical, independent supply" row
  shared_dependencies: [clock domain, package, silicon batch]
  segregation_evidence: [independent supply, hardware comparator in separate metal layer]
voter_strategy: hardware comparator in a separate metal layer of the same die;
  document the limit and pair with an external diagnostic for the die-level
  common cause.
```

### Example 2 — financial trading kill-switch (no integrity level, but criticality:high)

```yaml
plan_id: trading-kill-switch-v1
asil_or_sil: not applicable (financial; treat as IEC 61508 SIL 2 by analogy)
recommended_pattern: dual-channel-diverse
rationale: |
  The kill switch must trip within 50 milliseconds of a runaway-trading
  condition. The FMEDA shows the primary channel implemented in C++ on
  Linux with a worst-case-execution-time variance dominated by garbage
  collection in the broker SDK. The cut set "primary channel hangs while
  broker is in fast-market mode" is a size-one cut set. Dual-channel
  diverse: primary in C++ on Linux as today, secondary in Rust on a
  separate microcontroller reading the same market-data feed via a
  separate fiber. Different language toolchain (LLVM versus rustc),
  different operating-system stack (Linux versus bare-metal Rust),
  different supplier for the network interface card.
diversity_dimensions:
  hardware_supplier: Intel network interface for primary, Mellanox for secondary
  toolchain: LLVM C++ versus rustc
  algorithm: rate-based threshold (primary) versus volume-weighted threshold (secondary)
  power: independent rack, independent uninterruptible power supply
  clock: independent Precision Time Protocol grandmasters
  operator: two independent teams under separate engineering managers
common_cause_assessment:
  beta_factor_pct: 12
  beta_factor_source: IEC 61508 Part 6 Annex D — "segregated, diverse, distinct toolchains"
  shared_dependencies: [market-data exchange (single feed), regulatory clock]
  segregation_evidence: [different rack, different fiber path, different SDK]
voter_strategy: trigger if EITHER channel votes "halt"; OR-gate is intentional
  for safety (false positive trips the venue, which is acceptable; false
  negative is not).
```

## Categories (the findings this skill emits)

### 1. No pattern declared

A plan with `criticality: high` and an FMEDA gap has no `redundancy_pattern.yaml`. Emit `kind: missing_pattern_recommendation`.

### 2. Identical-redundancy without diversity dimension

The pattern is dual-channel or N-version but no `diversity_dimensions` block names the diversity. Emit `kind: undefended_diversity`.

### 3. Common-cause factor unsourced

The `beta_factor_pct` value has no `beta_factor_source` citation. Emit `kind: unsourced_beta_factor`.

### 4. Voter is a hidden single point of failure

The pattern requires a voter (triple modular, hot standby) and the voter is implemented in the same technology as the channels with no separate-technology fallback. Emit `kind: voter_single_point`.

### 5. Pattern does not address the surfaced cut set

The recommended pattern fails to mitigate the size-one cut sets surfaced by the Fault Tree. Emit `kind: pattern_does_not_cover_cut_set`.

### 6. N-version recommended without acknowledging the 2024 caveat

The pattern is N-version programming with no `residual_risks` entry that names the Analog Devices 2024 caution about correlated faults. Emit `kind: n_version_without_caveat`.

## Severity

Per the warnings-are-critical rule, every finding emits `severity: critical` on the wire.

| Triage tier | Examples | Internal action |
|---|---|---|
| BLOCK | Missing pattern when FMEDA gap is open; voter single point; pattern does not cover cut set | Halt release |
| HIGH | Undefended diversity; unsourced beta factor | Fix before review |
| MEDIUM | N-version without caveat | Annotate residual risks |

## Output letter schema

```yaml
finding_id: <sha256(critic+target+kind)[:12]>
severity: critical
confidence: high | medium | low
engine: redundancy-pattern-picker
kind: missing_pattern_recommendation | undefended_diversity | unsourced_beta_factor | voter_single_point | pattern_does_not_cover_cut_set | n_version_without_caveat
target_file: .ctoc/safety/redundancy/<plan-id>.yaml
asil_or_sil: <integrity level under analysis>
cut_set: <list of basic-event ids that the pattern fails to cover, if applicable>
message: <one-sentence summary>
suggested_fix: <concrete remediation>
references:
  - https://www.analog.com/en/resources/app-notes/mitigation-of-common-cause-failures-in-safety-critical-systems.html    # 2024 Analog Devices common-cause guidance
  - https://webstore.iec.ch/publication/22273                                                                              # IEC 61508 Part 2 (architectures and beta factor)
  - https://webstore.iec.ch/publication/22275                                                                              # IEC 61508 Part 6 Annex D (beta-factor table)
  - https://www.iso.org/standard/68389.html                                                                                # ISO 26262 Part 6 (Product development at the software level)
```

## Special Considerations

- **Redundancy without segregation is theatre.** Two channels in the same enclosure, on the same power rail, sharing the same clock and the same sensor input, share every common-cause failure of the underlying technology. The beta factor in this case is close to the identical-channels case, perhaps fifteen to twenty-five percent.
- **The diversity dimension must be defensible.** "Two channels, both in Rust" is not diversity. "Two channels, one in Rust with one compiler and operating system, the other in C with a separately qualified compiler and toolchain" is diversity.
- **Cost grows roughly linearly with redundancy multiplicity; coverage grows sub-linearly because of common-cause.** Doubling the channel count from two to four typically improves the metric by less than a factor of two because the common-cause floor remains.
- **Re-run after architecture change.** Any change to power topology, clock topology, supplier, toolchain, or algorithm invalidates the diversity argument and requires a delta-analysis.

---

## Refinement Loop — critic mode

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every missing recommendation, undefended diversity, unsourced beta factor, voter single point, uncovered cut set, and N-version-without-caveat emits as `severity: critical` in the letter to CTO Chief.
- Findings block phase advancement until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section, with the safety architect's signature attached.

The principle: a redundancy claim without a named diversity dimension is a paper claim. Systems that ship on a paper claim ship with a known functional-safety gap that field experience will eventually expose.
