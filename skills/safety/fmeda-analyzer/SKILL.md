---
name: fmeda-analyzer
description: Failure Modes Effects and Diagnostic Analysis — bottom-up safety analysis that classifies each component failure mode, quantifies diagnostic coverage, and computes the Single-Point Fault Metric and Latent Fault Metric required by ISO 26262 Part 5 and IEC 61508.
type: skill
when_to_load:
  - "FMEDA"
  - "Failure Modes Effects and Diagnostic Analysis"
  - "Single-Point Fault Metric"
  - "Latent Fault Metric"
  - "diagnostic coverage"
  - "safe failure fraction"
  - "ISO 26262 Part 5"
  - "IEC 61508"
  - "ASIL D hardware"
  - "criticality high"
  - "functional safety analysis"
related_skills:
  - safety/fault-tree-builder
  - safety/redundancy-pattern-picker
  - security/threat-modeler
  - quality/architecture-checker
  - specialized/resilience-checker
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

# Failure Modes Effects and Diagnostic Analysis (skill)

> New in CTOC v6.9.27 — Cluster 3 (Risk Analysis Before Build). Activated when the `fmeda_design` control is enabled (ISO 26262, IEC 61508, IEC 62304 Class C, RTCA DO-178C) or when a plan declares `criticality: high`.
> The Failure Modes Effects and Diagnostic Analysis is the bottom-up companion to the top-down [[safety/fault-tree-builder]]. Both are required by ISO 26262 Part 5 for hardware safety analysis of automotive safety integrity level C and D items.

## Role

You are a functional-safety analyst who refuses to ship hardware or safety-related software without a quantified failure analysis. Your job is to enumerate every credible component failure mode, classify it as safe / detected dangerous / undetected dangerous / multi-point, attach a failure-rate estimate, and compute the resulting safety metrics. The output is a machine-readable failure-mode table that an Independent Verification and Validation team can audit.

You operate at design time — Step 6 (DESIGN) and Step 6.5 (THREAT MODEL) of the Iron Loop. By the time work reaches Step 10 (IMPLEMENT), the failure-mode table has frozen, the redundancy pattern has been picked, and the diagnostic mechanisms are part of the implementation specification, not afterthoughts.

## When to load

This skill is dispatched by CTO Chief (or by an in-loop agent on its behalf) when any of the following is true for the plan in flight:

- The active regulatory regime profile declares `fmeda_design` as a required control. As of CTOC v6.9.27 that includes `iso-26262-asil-d`, `do-178c-level-a`, `iec-62304-class-c`, and `iec-61508-sil-3`.
- The plan frontmatter declares `criticality: high` (life-safety, financial-loss above a documented threshold, or critical-infrastructure availability).
- The user explicitly requests an FMEDA via the trigger phrases listed in `when_to_load`.

If none of the above is true, this skill is inert — the lean default per the regulatory-regime opt-in policy.

## 2026 Best Practices (Safety category)

- **FMEDA quantifies, FMEA categorises, Fault Tree Analysis decomposes.** The 2022 IEEE paper "Application of System Theoretic Process Analysis, FMEA, FMEDA, and FTA to Cyber-Physical Systems" makes the distinction explicit: FMEA produces a qualitative ranking, FMEDA produces the numeric metrics that ISO 26262 and IEC 61508 require, and Fault Tree Analysis traces a single undesired top event back to its basic events (https://www.computer.org/csdl/proceedings-article/cyber-physical-systems/2022). All three are complementary; none of them substitutes for the others.
- **Diagnostic coverage matters more than reliability.** A component with a high failure rate but ninety-nine percent diagnostic coverage is safer than a component with a low failure rate and zero diagnostics. ISO 26262 Part 5 Annex D defines diagnostic coverage as the fraction of dangerous failure modes that are detected by an on-line safety mechanism within the Fault Tolerant Time Interval. The Single-Point Fault Metric is the proportion of single-point and residual faults to the total dangerous-failure rate, weighted by diagnostic coverage.
- **The Latent Fault Metric guards against the second failure.** Multi-point faults remain hidden until a second failure activates the dangerous condition. ISO 26262 requires the Latent Fault Metric — the proportion of latent multi-point faults that are detected by a proof test or by a periodic safety mechanism — to exceed ninety percent for ASIL D and eighty percent for ASIL C (per Part 5 Annex F).
- **Failure-rate sources must be cited.** Use IEC TR 62380 (FIDES), IEC 61709, MIL-HDBK-217F, or the device supplier's published failure-in-time number. Inventing a failure rate is grounds for IV and V rejection. When the device sheet does not publish a number, escalate to the supplier rather than guessing.
- **De-rating is mandatory.** A semiconductor's published failure-in-time number assumes a specific junction temperature, voltage, and operating profile. Real-world conditions degrade the number. Apply the supplier's de-rating curve or fall back to the conservative bound from IEC 61709.
- **Common-cause failures defeat redundancy.** When the FMEDA assumes redundancy, the common-cause failure fraction (the beta-factor in IEC 61508 Part 6) must be quantified separately. The 2024 Analog Devices application note "Mitigation of Common-Cause Failures in Safety-Critical Systems" warns that correlated faults (shared power, shared clock, shared package, shared algorithm, shared supplier lot) can collapse a redundancy claim to no redundancy at all.
- **Software FMEDA differs from hardware FMEDA.** ISO 26262 Part 6 calls for a software-level analysis that enumerates failure modes of each software unit (incorrect initialisation, stack overflow, deadlock, race, memory corruption, control-flow corruption), maps them to safety mechanisms (memory protection unit, dual-channel comparison, control-flow monitoring, watchdog), and quantifies the diagnostic coverage of each mechanism. Hardware metrics borrow the Single-Point Fault Metric vocabulary, but the failure-rate concept is qualitative for software — the discipline is the same.
- **FMEDA is a living document.** A frozen design produces a frozen FMEDA. Any architectural change (different microcontroller, different power topology, different safety mechanism) requires a delta-FMEDA that re-verifies the metrics. ISO 26262 Part 8 Clause 7 (Change Management) is the applicable clause.

## Inputs (what this skill reads)

- The plan's `## Architecture` section (block-level component list, interfaces, power and clock domains).
- The plan's bill of materials (`bom.yaml`, `parts-list.csv`, supplier datasheets referenced under `references:`).
- The system safety goals (`safety-goals.yaml` or the equivalent section of the safety plan), with their assigned automotive safety integrity level or safety integrity level.
- The diagnostic mechanisms catalogue if present (`diagnostics.yaml`).
- The Fault Tolerant Time Interval per safety goal (the latest time after a fault at which the system must reach the safe state).

If any input is missing, the skill emits `finding: missing_input` with a precise list of what is required and the rationale — it does NOT invent values.

## Outputs (what this skill writes)

A single machine-readable artifact at `.ctoc/safety/fmeda/<plan-id>.yaml`. Schema:

```yaml
plan_id: <plan filename without extension>
asil_or_sil: ASIL-D | ASIL-C | ASIL-B | ASIL-A | QM | SIL-3 | SIL-2 | SIL-1 | software-class-C | software-class-B | software-class-A
analysis_date: YYYY-MM-DD
analyst: <agent or human author>
reviewer: <Independent Verification and Validation reviewer, required for ASIL C/D and SIL 2/3>
fault_tolerant_time_interval_ms: <integer, from the safety goal>
components:
  - id: <stable identifier>
    name: <human-readable name>
    part_number: <supplier part number>
    failure_in_time: <failures per billion hours, with cited source>
    failure_rate_source: <FIDES | IEC 61709 | MIL-HDBK-217F | supplier datasheet section X.Y>
    derating_applied: true | false
    derating_rationale: <one-sentence explanation>
    failure_modes:
      - mode: <e.g., short-to-ground, open-circuit, stuck-at-one, transient-bit-flip>
        distribution_pct: <percentage of total failure-in-time attributable to this mode>
        effect: safe | dangerous-detected | dangerous-undetected | multi-point-latent | multi-point-detected
        diagnostic_mechanism: <reference to diagnostics.yaml entry, or none>
        diagnostic_coverage_pct: <number 0..100 with source>
        propagates_to: <list of higher-level effects this mode triggers>
metrics:
  single_point_fault_metric_pct: <computed, must exceed 99 for ASIL-D, 97 for ASIL-C>
  latent_fault_metric_pct: <computed, must exceed 90 for ASIL-D, 80 for ASIL-C>
  probabilistic_metric_hardware_failures_per_hour: <computed, must be below 1e-8 for ASIL-D, 1e-7 for ASIL-C>
  diagnostic_coverage_pct_overall: <computed>
verdict: pass | fail | conditional-pass
verdict_rationale: <one paragraph>
open_items:
  - <list of components missing failure-rate data, missing diagnostic coverage, awaiting supplier confirmation>
```

The computed metrics use the ISO 26262 Part 5 Annex C and Annex F formulae. The skill is allowed to leave a metric as `null` only if the underlying inputs are incomplete; it MUST emit `verdict: fail` in that case rather than guessing.

## Failure-mode catalogue (starting points)

The catalogue is intentionally non-exhaustive. The point is that every component must be enumerated; the modes below are the common ones.

### Digital integrated circuits

| Mode | Typical distribution (cite source per project) | Common diagnostic |
|---|---|---|
| Stuck-at fault (output stuck high or low) | Forty to sixty percent of total failure-in-time | Built-in self-test, periodic boundary scan |
| Transient bit flip (single-event upset) | Ten to twenty percent | Error-correcting code on memory, dual-modular redundancy |
| Address-decoding fault | Five to fifteen percent | Memory protection unit, address-range checker |
| Stuck-open or stuck-short on input | Five to fifteen percent | Plausibility check on input range |

### Analog and mixed-signal

| Mode | Typical distribution | Common diagnostic |
|---|---|---|
| Reference voltage drift outside tolerance | Twenty to forty percent | Periodic comparison against an independent reference |
| Operational-amplifier offset drift | Ten to thirty percent | Sensor plausibility check, two-channel comparison |
| Open or shorted passive component | Five to twenty percent | Test pattern injection during initialisation |

### Software units

ISO 26262 Part 6 Annex D enumerates the canonical failure modes:

| Mode | Common diagnostic |
|---|---|
| Incorrect initialisation | Initialisation barrier, post-condition check |
| Stack overflow | Stack-canary or memory-protection-unit guard |
| Deadlock or live-lock | Watchdog timer, periodic forward-progress check |
| Race condition | Lock-order verifier, single-writer protocol enforcement |
| Memory corruption | Memory protection unit, periodic memory scrub |
| Control-flow corruption | Control-flow integrity check, instruction-trace monitor |
| Incorrect data exchange between units | Cyclic-redundancy-check on inter-unit messages, schema verification |
| Failure to terminate within deadline | Worst-Case Execution Time budget enforcement |

## BAD versus SAFE examples by language

Failure Modes Effects and Diagnostic Analysis is primarily a discipline of embedded C and C++ engineering — that is where the load-bearing examples live. For the other languages on the CTOC coverage list, the technique is either non-applicable (managed runtimes hide the relevant failure modes behind the runtime) or relevant only in narrow circumstances (System.Threading watchdog patterns, server-side health checks). Honest examples follow.

### C (C17 / C23) — embedded controller (load-bearing)

BAD — no diagnostic on the safety-critical comparator output. A stuck-at-high on the comparator turns into an undetected dangerous failure:

```c
// File: brake_pressure_monitor.c
// BAD: reads the pressure sensor, compares against threshold, takes no
// action on a stuck reading. A failed comparator that returns the same
// value forever is invisible.

#include <stdint.h>
#include "adc.h"
#include "actuator.h"

void monitor_brake_pressure(void) {
    uint16_t adc_raw = adc_read(BRAKE_PRESSURE_CHANNEL);  /* No range check */
    if (adc_raw > UPPER_LIMIT) {
        actuator_release();                                /* Acts on unverified input */
    }
}
```

SAFE — dual-channel acquisition, plausibility window, watchdog, and an explicit diagnostic that runs each Fault Tolerant Time Interval:

```c
// File: brake_pressure_monitor.c
// SAFE: dual-channel acquisition with plausibility window; on diagnostic
// failure, the controller enters the safe state declared by the safety
// goal. Failure mode and diagnostic coverage are documented in
// .ctoc/safety/fmeda/<plan-id>.yaml under component id BR-PRESS-MON.

#include <stdint.h>
#include "adc.h"
#include "actuator.h"
#include "watchdog.h"
#include "safe_state.h"

/* Maximum permitted disagreement between the two channels, in raw
 * analog-to-digital-converter counts. Derived from the sensor datasheet
 * tolerance and the analog-to-digital-converter integral non-linearity. */
#define PLAUSIBILITY_WINDOW_COUNTS  ((uint16_t) 12)

/* Worst-Case Execution Time budget for this routine, in microseconds. */
#define WCET_BUDGET_US              ((uint32_t) 250)

static uint16_t last_known_good = 0;

void monitor_brake_pressure(void) {
    watchdog_pet();                                /* Forward-progress monitor */

    uint16_t channel_a = adc_read(BRAKE_PRESS_A);
    uint16_t channel_b = adc_read(BRAKE_PRESS_B);  /* Independent ADC, separate reference */

    /* Diagnostic 1: plausibility window between independent channels.
     * Coverage of this diagnostic for stuck-at and reference-drift faults
     * is documented at 95 percent in the FMEDA artifact. */
    uint16_t delta = (channel_a > channel_b) ? (channel_a - channel_b)
                                             : (channel_b - channel_a);
    if (delta > PLAUSIBILITY_WINDOW_COUNTS) {
        safe_state_enter(SAFE_STATE_PRESSURE_DISAGREE);
        return;
    }

    /* Diagnostic 2: rate-of-change check.
     * A physically implausible jump indicates a transient fault or a
     * decoding fault on the analog-to-digital converter. */
    uint16_t fused = (uint16_t) (((uint32_t) channel_a + channel_b) / 2u);
    if (last_known_good != 0u) {
        uint16_t step = (fused > last_known_good) ? (fused - last_known_good)
                                                  : (last_known_good - fused);
        if (step > MAX_PHYSICAL_RATE_COUNTS) {
            safe_state_enter(SAFE_STATE_PRESSURE_RATE);
            return;
        }
    }
    last_known_good = fused;

    if (fused > UPPER_LIMIT) {
        actuator_release();
    }
}
```

### C++ (C++ 20 / C++ 23) — same domain (load-bearing)

BAD — single-channel read, no Cyclic-Redundancy-Check on the inter-unit message, exception swallowed:

```cpp
// File: pressure_monitor.cpp
// BAD: trusts the wire, no integrity check, exception swallowed.

#include <cstdint>
#include "Network.hpp"
#include "Actuator.hpp"

void OnPressureMessage(std::span<const std::byte> payload) {
    try {
        const auto pressure = ::DecodePressure(payload);
        if (pressure > kUpperLimit) {
            Actuator::Release();
        }
    } catch (...) {
        // Eaten. The fault is now undetected. This is a textbook
        // dangerous-undetected failure mode.
    }
}
```

SAFE — Cyclic-Redundancy-Check verification, schema check, and explicit safe-state transition. The exception is logged with structured context so the diagnostic mechanism is auditable:

```cpp
// File: pressure_monitor.cpp
// SAFE: integrity-checked message, schema-verified, exception is treated
// as a diagnostic event with a documented coverage figure in the FMEDA.

#include <cstdint>
#include <expected>
#include <span>
#include <string_view>
#include "Network.hpp"
#include "Actuator.hpp"
#include "SafeState.hpp"
#include "Diagnostics.hpp"

namespace {
constexpr std::uint16_t kUpperLimit = 4096;

enum class DecodeError {
    CyclicRedundancyCheckMismatch,
    SchemaInvalid,
    OutOfRange,
};

std::expected<std::uint16_t, DecodeError>
DecodePressureChecked(std::span<const std::byte> payload) noexcept;
}  // namespace

void OnPressureMessage(std::span<const std::byte> payload) noexcept {
    Diagnostics::RecordEvent("brake.pressure.message_received");

    auto pressure = DecodePressureChecked(payload);
    if (!pressure.has_value()) {
        Diagnostics::RecordEvent("brake.pressure.decode_failed",
                                 static_cast<int>(pressure.error()));
        SafeState::Enter(SafeStateReason::PressureMessageInvalid);
        return;
    }
    if (*pressure > kUpperLimit) {
        Actuator::Release();
    }
}
```

### C# (.NET 9) — non-applicable in the embedded sense; load-bearing for server-side safety-relevant supervisors

C# typically runs on a hosted runtime where the relevant failure modes (memory corruption, control-flow corruption, stack overflow) are caught by the runtime itself; the runtime itself becomes the diagnostic. Where C# IS load-bearing for safety, it is in a server-side supervisor that watches an embedded subsystem. Pattern:

```csharp
// File: BrakeSupervisor.cs (.NET 9)
// Server-side supervisor that monitors heart-beats from the embedded
// brake controller. Failure mode: missed heart-beat. Diagnostic:
// time-out plus persisted incident. Coverage: 100 percent of missed
// heart-beats within the Fault Tolerant Time Interval.

using System.Diagnostics;

public sealed class BrakeSupervisor : BackgroundService
{
    private readonly TimeProvider _clock;
    private readonly TimeSpan _fttiMargin = TimeSpan.FromMilliseconds(50);
    private readonly TimeSpan _ftti = TimeSpan.FromMilliseconds(200);
    private readonly IDiagnosticsSink _diagnostics;

    public BrakeSupervisor(TimeProvider clock, IDiagnosticsSink diagnostics)
    {
        _clock = clock;
        _diagnostics = diagnostics;
    }

    protected override async Task ExecuteAsync(CancellationToken cancel)
    {
        DateTimeOffset lastBeat = _clock.GetUtcNow();
        await foreach (var beat in BrakeHeartbeatChannel.ReadAllAsync(cancel))
        {
            DateTimeOffset now = _clock.GetUtcNow();
            TimeSpan gap = now - lastBeat;
            if (gap > _ftti + _fttiMargin)
            {
                _diagnostics.Record("brake.heartbeat.missed", gap.TotalMilliseconds);
                await SafeState.EnterAsync(SafeStateReason.BrakeHeartbeatMissed, cancel);
            }
            lastBeat = beat.At;
        }
    }
}
```

### Java (21 and newer) — same supervisor pattern

Java is non-applicable for hardware-level FMEDA; it is load-bearing in the same supervisor role as C#. The discipline is identical and is omitted here to avoid duplicating the same shape.

### Python (3.12 and newer) — non-applicable for the safety-critical loop

Python is unsuitable for safety-critical control because of the garbage collector's worst-case-execution-time variance and the global interpreter lock. It IS appropriate for off-line FMEDA tooling: parsing the YAML artifact above, computing Single-Point Fault Metric and Latent Fault Metric, and emitting a report. Pattern:

```python
# File: fmeda_metrics.py (Python 3.12+)
# Off-line metric computation. Reads .ctoc/safety/fmeda/<plan-id>.yaml,
# computes Single-Point Fault Metric, Latent Fault Metric, and the
# overall hardware probability. Emits pass / fail per ISO 26262 Part 5
# Annex F thresholds.

from __future__ import annotations
from pathlib import Path
from dataclasses import dataclass
import sys
import yaml

THRESHOLDS = {
    "ASIL-D": {"spfm": 99.0, "lfm": 90.0, "pmhf_per_hour": 1e-8},
    "ASIL-C": {"spfm": 97.0, "lfm": 80.0, "pmhf_per_hour": 1e-7},
}

@dataclass(frozen=True)
class Verdict:
    pass_: bool
    rationale: str

def compute(artifact_path: Path) -> Verdict:
    data = yaml.safe_load(artifact_path.read_text(encoding="utf-8"))
    target = THRESHOLDS.get(data["asil_or_sil"])
    if target is None:
        return Verdict(False, f"unknown integrity level {data['asil_or_sil']}")
    spfm = data["metrics"]["single_point_fault_metric_pct"]
    lfm = data["metrics"]["latent_fault_metric_pct"]
    pmhf = data["metrics"]["probabilistic_metric_hardware_failures_per_hour"]
    if spfm is None or lfm is None or pmhf is None:
        return Verdict(False, "incomplete metrics, see open_items")
    if spfm < target["spfm"]:
        return Verdict(False, f"Single-Point Fault Metric {spfm} below threshold {target['spfm']}")
    if lfm < target["lfm"]:
        return Verdict(False, f"Latent Fault Metric {lfm} below threshold {target['lfm']}")
    if pmhf > target["pmhf_per_hour"]:
        return Verdict(False, f"Probabilistic Metric for Hardware Failures {pmhf} above threshold {target['pmhf_per_hour']}")
    return Verdict(True, "all metrics meet or exceed the integrity-level threshold")
```

### JavaScript / TypeScript — non-applicable

JavaScript and TypeScript run in environments (browser, server) where the relevant failure modes (memory corruption, stack overflow, race) are caught by the runtime. Web-tier code is in scope for the Threat Modeler skill, not for the Failure Modes Effects and Diagnostic Analysis skill. If a TypeScript front-end controls a safety function (a rare and ill-advised pattern), the analysis is at the embedded layer that the front-end commands, not in the front-end itself.

### Structured Query Language — non-applicable

The Failure Modes Effects and Diagnostic Analysis operates on the boundary between failure modes of physical or executable components and their on-line diagnostics. Structured Query Language does not host either side of that boundary. Storage of FMEDA artifacts in a relational database is fine; the discipline does not live there.

## Categories (the findings this skill emits)

### 1. Missing failure-mode coverage

A component in the bill of materials has no entry in the FMEDA artifact. Every component in scope must have an entry, even if the entry is `failure_modes: []` with a documented rationale (typically because the component is not in the safety-critical path, in which case it must be excluded from scope explicitly).

Emit `kind: missing_component_coverage` with the part number.

### 2. Invented failure rate

A `failure_in_time` value has no `failure_rate_source`, or the source is "estimate", "engineering judgement", or "based on similar parts". Functional-safety review will reject this. Emit `kind: unsourced_failure_rate`.

### 3. Missing diagnostic on a dangerous-undetected mode

A failure mode is marked `dangerous-undetected` with no `diagnostic_mechanism`. By definition the result is a Single-Point Fault Metric contribution that the design cannot account for. Emit `kind: undiagnosed_dangerous_mode`.

### 4. Common-cause failure unanalysed

The architecture declares redundancy (dual channel, dual modular redundancy, lockstep) but the FMEDA contains no `common_cause_factor` or `beta_factor` entry. Per the 2024 Analog Devices guidance, this is the single most common way that a paper claim of redundancy collapses to a single point of failure in practice. Emit `kind: common_cause_not_analysed`.

### 5. Diagnostic coverage out of range or unsourced

A `diagnostic_coverage_pct` value is reported without a citation to the diagnostic mechanism's coverage analysis. ISO 26262 Part 5 Annex D defines four coverage tiers (low approximately 60 percent, medium approximately 90 percent, high approximately 99 percent); coverage claims must map to a tier and to evidence. Emit `kind: unsourced_coverage`.

### 6. Metric threshold miss

The computed Single-Point Fault Metric, Latent Fault Metric, or Probabilistic Metric for Hardware Failures fails the threshold for the declared integrity level. Emit `kind: metric_threshold_miss` with the gap.

### 7. Stale FMEDA after architecture change

The bill of materials, schematic, or safety-mechanism catalogue has a modification time newer than the FMEDA artifact. The analysis is out of date relative to the design. Emit `kind: stale_fmeda` with the diff hint.

## Severity

Per the warnings-are-critical rule, every finding emits as `severity: critical` on the wire to CTO Chief. Internal triage tiers exist for human reviewers:

| Triage tier | Examples | Internal action |
|---|---|---|
| BLOCK | Metric threshold miss for the declared automotive safety integrity level; missing diagnostic on a dangerous-undetected mode in a Class C unit | Halt release |
| HIGH | Common-cause failure unanalysed; unsourced failure rate; stale FMEDA | Fix before review |
| MEDIUM | Missing coverage on a non-safety-critical component that is in the bill of materials but not in the safety chain | Add an `out_of_scope: true` marker with rationale |

## Output letter schema (refinement-loop contract)

```yaml
finding_id: <sha256(critic+target+kind)[:12]>
severity: critical
confidence: high | medium | low
engine: fmeda-analyzer
kind: missing_component_coverage | unsourced_failure_rate | undiagnosed_dangerous_mode | common_cause_not_analysed | unsourced_coverage | metric_threshold_miss | stale_fmeda
target_file: .ctoc/safety/fmeda/<plan-id>.yaml
component_id: <id from the artifact, if applicable>
asil_or_sil: <integrity level under analysis>
required_threshold: <e.g., Single-Point Fault Metric >= 99 for ASIL-D>
observed_value: <e.g., 96.4>
gap: <e.g., 2.6 percentage points>
message: <one-sentence summary>
suggested_fix: <concrete remediation>
references:
  - https://www.computer.org/csdl/proceedings-article/cyber-physical-systems/2022    # IEEE FMEA / FMEDA / FTA comparative paper
  - https://www.iso.org/standard/68383.html                                          # ISO 26262 Part 5 (Product development at the hardware level)
  - https://webstore.iec.ch/publication/22273                                        # IEC 61508 Part 2 (Requirements for electronic safety-related systems)
```

## Special Considerations

- **Independence is non-negotiable for ASIL D and SIL 3.** The FMEDA analyst MUST be different from the design engineer. CTOC enforces this by routing the FMEDA dispatch through the `independent_verification_validation` control when present, which requires a separate audit root.
- **Common-cause beta factors come from project-specific evidence.** IEC 61508 Part 6 Annex D provides a table for the beta-factor between zero point five and twenty-five percent depending on architecture, diversity, segregation, and operating environment. Take the conservative bound when the assessment is incomplete.
- **The "no stub" rule applies here too.** When the supplier datasheet does not publish a failure-in-time number, the skill MUST emit `kind: missing_input` with the citation gap and the conservative fall-back from IEC 61709 — it does NOT make a number up.
- **Software FMEDA is different from hardware FMEDA but uses the same vocabulary.** Resist the temptation to assign quantitative failure-in-time numbers to software units. Use the qualitative coverage tiers (low / medium / high) from ISO 26262 Part 6 Annex D and document the rationale for each diagnostic mechanism's tier.

---

## Refinement Loop — critic mode

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every missing component, unsourced failure rate, undiagnosed dangerous mode, unanalysed common-cause, unsourced coverage, metric miss, and stale FMEDA emits as `severity: critical` in the letter to CTO Chief.
- The letter schema rejects `warn` — there is no soft tier on the wire.
- Findings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section, with the IV and V signature attached.

The principle: a missing failure-mode analysis today is the field recall tomorrow. Hardware that ships without a current, sourced, threshold-meeting Failure Modes Effects and Diagnostic Analysis ships with a known functional-safety gap.
