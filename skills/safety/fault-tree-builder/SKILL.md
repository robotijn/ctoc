---
name: fault-tree-builder
description: Top-down deductive safety analysis — builds a Fault Tree from an undesired top event to its basic events using AND, OR, and voting gates, with cut-set extraction and probability roll-up per IEC 61025.
type: skill
when_to_load:
  - "fault tree"
  - "Fault Tree Analysis"
  - "FTA"
  - "minimal cut set"
  - "top event"
  - "deductive safety analysis"
  - "criticality high"
  - "ISO 26262 Part 9"
  - "IEC 61025"
  - "ASIL D"
  - "SIL 3"
  - "Class C"
related_skills:
  - safety/fmeda-analyzer
  - safety/redundancy-pattern-picker
  - security/threat-modeler
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

# Fault Tree Builder (skill)

> New in CTOC v6.9.27 — Cluster 3 (Risk Analysis Before Build). Activated when the `fault_tree_analysis` control is enabled (ISO 26262 ASIL D, RTCA DO-178C Level A, IEC 62304 Class C, IEC 61508 SIL 3) or when a plan declares `criticality: high`.
> Fault Tree Analysis is the **top-down deductive** companion to the **bottom-up inductive** [[safety/fmeda-analyzer]]. The Creately reference at https://creately.com/guides/fmea-vs-fault-tree-analysis/ frames the distinction: Failure Modes Effects Analysis enumerates outward from each component, Fault Tree Analysis traces inward from a single undesired event.

## Role

You are a system safety engineer. Your output is a single Fault Tree per undesired event — a logical decomposition that starts at the top event ("uncontrolled brake release", "loss of cabin pressure", "patient receives wrong dose", "trading-engine sends unauthorised order"), descends through intermediate events linked by AND, OR, and voting gates, and terminates at basic events whose probabilities can be measured or estimated from independent sources.

You operate at design time — Step 6 (DESIGN) of the Iron Loop, immediately before Step 6.5 (THREAT MODEL). The Fault Tree informs the threat model (high-probability cut sets identify the trust boundaries that matter most), the test plan (each cut set is a test scenario), and the redundancy pattern (cut sets of size one demand redundancy).

## When to load

This skill is dispatched by CTO Chief (or by an in-loop agent) when:

- The active regulatory regime declares `fault_tree_analysis` as a required control. As of CTOC v6.9.27 that includes `iso-26262-asil-d`, `do-178c-level-a`, `iec-62304-class-c`, and `iec-61508-sil-3`.
- The plan declares `criticality: high`.
- The user explicitly requests an FTA via the trigger phrases in `when_to_load`.

If none of those is true the skill is inert.

## 2026 Best Practices (Safety category)

- **Fault Tree Analysis is deductive.** Start at the undesired top event and ask "what events, in combination, could cause this?" Each layer answers that question for the layer above. Stop when the events are independent and quantifiable — those are the basic events. Compare to Failure Modes Effects Analysis (inductive: start at the component, ask "what failures of this part could cause harm?") and STRIDE / threat-modeling (also inductive: start at the data flow, ask "what threat applies here?"). The three views are complementary; the FTA view is what reveals minimal cut sets.
- **The minimal cut set is the load-bearing artifact.** A minimal cut set is the smallest combination of basic events whose joint occurrence produces the top event. Cut sets of size one are single points of failure and demand redundancy. Cut sets of size two with high-probability or correlated basic events are the next priority. Cut sets of size three or larger with independent low-probability events are typically acceptable.
- **Quantitative versus qualitative is a choice, not a default.** ISO 26262 Part 9 and IEC 61025 both permit qualitative Fault Tree Analysis when failure-rate data are unavailable or when the goal is structural rather than probabilistic. Quantitative analysis multiplies basic-event probabilities through the AND and OR gates and produces a top-event probability that can be compared against the safety goal's Tolerable Hazard Rate (per IEC 61508) or the Probabilistic Metric for Hardware Failures (per ISO 26262 Part 5).
- **Common-cause basic events break independence.** The same warning that applies to Failure Modes Effects and Diagnostic Analysis applies here: two basic events that share a power rail, a clock, a temperature, an operating-system kernel, a third-party library, or a supplier lot are NOT independent. The cut-set probability for correlated basic events is dominated by the common-cause factor (the beta-factor in IEC 61508 Part 6), not by the product of independent rates. The 2024 Analog Devices application note "Mitigation of Common-Cause Failures in Safety-Critical Systems" is the authoritative reminder.
- **Gates are documented, not assumed.** Every AND gate makes an independence assumption that must be defended in the tree. Every OR gate is generous to the attacker / failure (any single branch suffices); generosity is fine, but the analyst documents which independence assumption justifies the gate type.
- **Tree must be re-run on architecture change.** ISO 26262 Part 8 Clause 7 (Change Management). A new component, a new safety mechanism, a removed redundancy, or a changed Fault Tolerant Time Interval all invalidate the tree. The artifact carries an `architecture_hash` so drift is detectable.

## Inputs (what this skill reads)

- The plan's `## Architecture` section.
- The safety-goals list (`safety-goals.yaml` or equivalent) — each safety goal nominates one or more undesired top events.
- The Failure Modes Effects and Diagnostic Analysis artifact at `.ctoc/safety/fmeda/<plan-id>.yaml` if it exists. Basic-event probabilities in the FTA SHOULD reuse failure-in-time values from the FMEDA so the two analyses stay numerically consistent.
- The threat-model artifact under `threats/` if it exists — threat trees (Schneier 1999) and fault trees often share basic events; reuse promotes consistency.
- The diagnostics catalogue (`diagnostics.yaml`).

If the FMEDA does not exist and the plan declares hardware components, the skill emits `kind: missing_fmeda_dependency` rather than guessing failure rates.

## Outputs (what this skill writes)

A single artifact per top event at `.ctoc/safety/fault-trees/<plan-id>__<top-event-slug>.yaml`. Schema:

```yaml
plan_id: <plan filename without extension>
top_event:
  id: <slug>
  description: <one-sentence description of the undesired event>
  safety_goal_ref: <id from safety-goals.yaml>
  tolerable_hazard_rate_per_hour: <number, from the safety goal>
analysis_date: YYYY-MM-DD
analyst: <agent or human author>
reviewer: <Independent Verification and Validation reviewer, required for ASIL C/D and SIL 2/3>
architecture_hash: <sha256 of the bill of materials, schematic, and safety-mechanism catalogue at analysis time>
gates:
  - id: G1
    kind: top                                     # top | and | or | voting | inhibit
    children: [G2, G3]
    description: "Brake fails to release within Fault Tolerant Time Interval"
  - id: G2
    kind: or
    children: [B1, B2, G4]
    description: "Pressure command not delivered"
  - id: G4
    kind: and
    children: [B3, B4]
    description: "Both communication channels fail"
    independence_argument: |
      Channels are powered by independent rails, clocked by independent
      oscillators, and routed through physically segregated harnesses.
      Common-cause factor estimated at 5 percent per IEC 61508 Part 6
      Annex D for "segregated, diverse, independent supply" architecture.
basic_events:
  - id: B1
    description: "Microcontroller stuck-at fault on brake-control output"
    failure_in_time: 120                          # per billion hours, cite source
    failure_rate_source: "supplier datasheet section 11.4"
    references_fmeda_component: MCU-BRAKE          # link to .ctoc/safety/fmeda/<plan-id>.yaml component id
  - id: B2
    description: "Common-mode latch-up on supply rail"
    failure_in_time: 45
    failure_rate_source: "IEC TR 62380 Table A.7"
    references_fmeda_component: PSU-MAIN
minimal_cut_sets:
  - id: MCS-1
    size: 1
    members: [B1]
    probability_per_hour: <computed>
    classification: single-point-failure
    mitigation_required: redundancy or diagnostic with coverage >= 99 percent
  - id: MCS-2
    size: 2
    members: [B3, B4]
    probability_per_hour: <computed, with common-cause factor applied>
    classification: dual-failure
    mitigation_required: review independence argument; sustain segregation in implementation
verdict:
  top_event_probability_per_hour: <computed>
  tolerable_hazard_rate_threshold: <copied from top_event>
  pass: true | false
  rationale: <one-paragraph explanation>
open_items:
  - <basic events missing source, intermediate events missing independence argument>
```

The skill is allowed to emit qualitative trees (no `failure_in_time` values, no `probability_per_hour`) when the regulatory profile permits it — IEC 62304 Class B accepts qualitative analysis for low-rate paths. Quantitative trees are required for ASIL C / D, SIL 2 / 3, DO-178C Level A / B, and IEC 62304 Class C.

## Gate vocabulary

| Gate | Symbol | Semantics | When to use |
|---|---|---|---|
| AND | flat-bottomed shield | All input events must occur for the output to occur | Redundancy is in place; both channels must fail |
| OR | curved-bottomed shield | Any single input event suffices | The output has multiple independent failure paths |
| VOTING (k-out-of-n) | diamond with k/n label | At least k of n inputs must occur | Two-out-of-three voting redundancy; majority-vote safety systems |
| INHIBIT | hexagon | Output occurs when input occurs AND the inhibit condition is true | Demand-based events: hazard occurs only when a triggering condition is present |
| PRIORITY-AND | flat-bottomed shield with arrow | All inputs must occur in a specified order | Sequence-dependent failures (event A must precede event B) |
| EXCLUSIVE-OR | curved-bottomed shield with circle | Exactly one input occurs | Mutually-exclusive failure modes |

The first three are sufficient for the great majority of analyses. INHIBIT and PRIORITY-AND are reserved for cases where the analyst can defend the dependency in writing. EXCLUSIVE-OR is rarely useful and is included for completeness.

## Cut-set extraction

The minimal cut-set computation follows the standard recursive algorithm (Vesely et al., 1981, *Fault Tree Handbook*, NUREG-0492):

1. Replace the top-level OR with a flat union of its children.
2. Replace each AND with a Cartesian product of its children's cut sets.
3. Eliminate non-minimal cut sets (any cut set that strictly contains another).

The result is the set of minimal cut sets. For trees with more than approximately twenty basic events, the analyst SHOULD use a verified tool (Open-FTA, SAPHIRE, RiskSpectrum, Isograph FaultTree+) rather than computing by hand; the skill flags this as `open_items: tool_qualification_required` when the tree exceeds the manual-analysis threshold.

## BAD versus SAFE examples by language

Fault Tree Analysis is a paper-and-tool discipline — the load-bearing artifact is the YAML tree above, not source code. The example pairs below show how source code RELATES to a basic event in the tree, and how a code-level mitigation reduces the basic-event probability.

### C (C17 / C23) — load-bearing, embedded

BAD — the watchdog is not re-armed inside the safety loop, so a hang manifests as the basic event "controller hangs without watchdog reset":

```c
// File: control_loop.c
// BAD: no watchdog pet inside the loop. Basic event "controller hangs"
// gets the full microprocessor stuck-rate failure-in-time, with no
// diagnostic credit.

#include "sensors.h"
#include "actuators.h"

void control_loop(void) {
    for (;;) {
        sensors_t s = sensors_read();
        actuators_t a = compute_outputs(s);
        actuators_apply(a);
    }
}
```

SAFE — watchdog re-arms with explicit forward-progress check; basic event B-WD-HANG in the Fault Tree drops to the residual failure-in-time after applying the documented coverage of the windowed watchdog:

```c
// File: control_loop.c
// SAFE: windowed watchdog + forward-progress counter.
// Basic event B-WD-HANG: failure-in-time post-diagnostic = raw FIT * (1 - coverage).
// Coverage of windowed watchdog for control-flow hangs is documented at
// 99 percent in .ctoc/safety/fmeda/<plan-id>.yaml.

#include <stdint.h>
#include "sensors.h"
#include "actuators.h"
#include "watchdog.h"
#include "safe_state.h"

void control_loop(void) {
    uint32_t progress = 0u;
    uint32_t last_progress = 0u;

    for (;;) {
        watchdog_pet_window();      /* Window means "too early" also faults */

        sensors_t s = sensors_read();
        actuators_t a = compute_outputs(s);
        actuators_apply(a);

        progress++;

        if (progress == last_progress) {
            /* Forward-progress monitor: independent of watchdog. */
            safe_state_enter(SAFE_STATE_NO_FORWARD_PROGRESS);
        }
        last_progress = progress;
    }
}
```

### C++ (C++ 20 / C++ 23) — load-bearing, embedded

BAD — std::optional unchecked, basic event "null deref in actuator path" is undiagnosed:

```cpp
// File: actuator_dispatcher.cpp
// BAD: dereference an optional without checking. Basic event
// B-ACT-NULL: undetected dangerous failure mode of the actuator path.

#include <optional>
#include "Actuator.hpp"

void Dispatch(std::optional<ActuatorCommand> cmd) {
    Actuator::Apply(*cmd);          /* Undefined behaviour on empty optional */
}
```

SAFE — checked, structured logging, safe-state transition on the failure path:

```cpp
// File: actuator_dispatcher.cpp
// SAFE: defensive check, structured diagnostic, safe-state transition.
// Basic event B-ACT-NULL now has 100 percent diagnostic coverage and
// is reclassified from "dangerous-undetected" to "dangerous-detected"
// in the FMEDA.

#include <optional>
#include "Actuator.hpp"
#include "SafeState.hpp"
#include "Diagnostics.hpp"

void Dispatch(std::optional<ActuatorCommand> cmd) noexcept {
    if (!cmd.has_value()) {
        Diagnostics::RecordEvent("actuator.dispatch.empty_command");
        SafeState::Enter(SafeStateReason::ActuatorCommandMissing);
        return;
    }
    Actuator::Apply(*cmd);
}
```

### Java (21 and newer) — load-bearing in safety-supervisor servers

Java is unsuitable inside a hard-real-time safety loop because of the garbage collector's worst-case-execution-time variance. It IS appropriate for the supervisor pattern: a server that consumes heart-beats from the embedded layer and enters the safe state on missing beats.

BAD — supervisor accepts any payload, basic event "supervisor accepts forged beat" is plausible:

```java
// File: BrakeSupervisor.java
// BAD: trusts the payload. Basic event B-SUP-FORGED: spoofed heart-beat
// keeps the supervisor in the operational branch indefinitely.

public final class BrakeSupervisor {
    public void onHeartbeat(byte[] payload) {
        long ts = ByteBuffer.wrap(payload).getLong();
        this.lastBeatNanos = ts;
    }
}
```

SAFE — Hashed Message Authentication Code validation, monotonic-timestamp check, audited transitions:

```java
// File: BrakeSupervisor.java (Java 21+)
// SAFE: signed payload, monotonic timestamp, audit trail. Basic event
// B-SUP-FORGED is mitigated by the Hashed Message Authentication Code.

public final class BrakeSupervisor {

    private final Mac mac;
    private final Auditor auditor;
    private long lastBeatNanos = 0L;

    public void onHeartbeat(byte[] payload, byte[] tag) {
        byte[] expected = mac.doFinal(payload);
        if (!MessageDigest.isEqual(expected, tag)) {
            auditor.record("brake.supervisor.heartbeat.tag_invalid");
            SafeState.enter(SafeStateReason.BrakeHeartbeatTagInvalid);
            return;
        }
        long ts = ByteBuffer.wrap(payload).getLong();
        if (ts <= lastBeatNanos) {
            auditor.record("brake.supervisor.heartbeat.replay");
            SafeState.enter(SafeStateReason.BrakeHeartbeatReplay);
            return;
        }
        lastBeatNanos = ts;
    }
}
```

### C# (.NET 9) — load-bearing in safety-supervisor servers, same shape

Identical discipline to the Java example; omitted to avoid duplication.

### Python (3.12 and newer) — non-applicable in the safety loop, load-bearing for off-line tooling

Python's place in this pipeline is the off-line cut-set computation tool that consumes the YAML artifact above and produces the minimal cut sets plus the top-event probability. A minimal worked example:

```python
# File: cutsets.py (Python 3.12+)
# Reads .ctoc/safety/fault-trees/<plan-id>__<top-event-slug>.yaml,
# extracts minimal cut sets via the standard recursive algorithm
# (Vesely et al., NUREG-0492). For trees larger than ~20 basic events
# this naive implementation is replaced by a verified tool.

from __future__ import annotations
from typing import Dict, FrozenSet, List, Set
import yaml
from pathlib import Path

def cut_sets(tree: Dict, node_id: str) -> Set[FrozenSet[str]]:
    """Return the set of cut sets that imply node_id."""
    node = tree["gates"].get(node_id) or tree["basic_events"].get(node_id)
    if node is None:
        raise KeyError(node_id)
    if node_id in tree["basic_events"]:
        return {frozenset({node_id})}
    kind = node["kind"]
    children = node["children"]
    if kind == "or" or kind == "top":
        result: Set[FrozenSet[str]] = set()
        for c in children:
            result |= cut_sets(tree, c)
        return _minimal(result)
    if kind == "and":
        product: Set[FrozenSet[str]] = {frozenset()}
        for c in children:
            child = cut_sets(tree, c)
            product = {a | b for a in product for b in child}
        return _minimal(product)
    raise NotImplementedError(f"gate kind {kind} not yet supported")

def _minimal(cs: Set[FrozenSet[str]]) -> Set[FrozenSet[str]]:
    """Eliminate non-minimal cut sets (those that strictly contain another)."""
    sorted_cs = sorted(cs, key=len)
    out: List[FrozenSet[str]] = []
    for c in sorted_cs:
        if not any(other < c for other in out):
            out.append(c)
    return set(out)
```

### JavaScript / TypeScript — non-applicable

JavaScript and TypeScript run in environments where the safety-relevant failure modes are not the ones the FTA studies. The artifact format above is portable; visualisation in a browser via D3.js or similar is perfectly fine for review, but the analytical work happens upstream.

### Structured Query Language — non-applicable

Persistence of the YAML artifact in a relational database is fine; the analysis itself does not live there.

## Categories (the findings this skill emits)

### 1. Missing fault tree for a declared top event

A safety goal nominates a top event for which no FTA artifact exists. Emit `kind: missing_tree` with the safety-goal reference.

### 2. Single-point cut set without redundancy

A minimal cut set of size one whose basic event has no diagnostic mechanism and no redundancy. Emit `kind: undefended_single_point` with the basic-event identifier.

### 3. Independence assumption undefended

An AND gate has no `independence_argument`. The cut-set probability defaults to the conservative bound (the maximum-probability child), which usually fails the threshold. Emit `kind: missing_independence_argument`.

### 4. Common-cause factor unanalysed

The tree contains AND gates whose children share a power, clock, supplier, or library boundary, and no common-cause factor is documented. Emit `kind: common_cause_not_analysed`.

### 5. Quantitative metrics inconsistent with the linked FMEDA

A basic event's `failure_in_time` differs from the value declared in the FMEDA component table without a documented reason. Emit `kind: fta_fmeda_inconsistency`.

### 6. Top-event probability fails the Tolerable Hazard Rate

The computed `top_event_probability_per_hour` exceeds the safety goal's `tolerable_hazard_rate_per_hour`. Emit `kind: tolerable_hazard_rate_miss` with the gap.

### 7. Stale tree after architecture change

The `architecture_hash` recorded in the tree differs from the hash of the current architecture artifacts. The tree no longer represents the design. Emit `kind: stale_tree`.

## Severity

Per the warnings-are-critical rule, every finding emits `severity: critical` on the wire.

| Triage tier | Examples | Internal action |
|---|---|---|
| BLOCK | Tolerable Hazard Rate miss; undefended single-point cut set; missing tree on an ASIL D top event | Halt release |
| HIGH | Missing independence argument; common-cause not analysed; FTA / FMEDA inconsistency | Fix before review |
| MEDIUM | Stale tree where architecture change is cosmetic; missing tree on a qualitative-only path | Re-run analysis with rationale |

## Output letter schema

```yaml
finding_id: <sha256(critic+target+kind)[:12]>
severity: critical
confidence: high | medium | low
engine: fault-tree-builder
kind: missing_tree | undefended_single_point | missing_independence_argument | common_cause_not_analysed | fta_fmeda_inconsistency | tolerable_hazard_rate_miss | stale_tree
target_file: .ctoc/safety/fault-trees/<plan-id>__<top-event-slug>.yaml
top_event: <slug>
cut_set: <list of basic-event ids, if applicable>
threshold: <e.g., Tolerable Hazard Rate 1e-8 per hour>
observed: <e.g., 4.2e-8 per hour>
message: <one-sentence summary>
suggested_fix: <concrete remediation>
references:
  - https://creately.com/guides/fmea-vs-fault-tree-analysis/                           # methodology comparison
  - https://www.nrc.gov/docs/ML1007/ML100780465.pdf                                    # NUREG-0492 Fault Tree Handbook
  - https://webstore.iec.ch/publication/4311                                           # IEC 61025 Fault tree analysis
  - https://www.iso.org/standard/68391.html                                            # ISO 26262 Part 9 (Automotive Safety Integrity Level oriented and safety oriented analyses)
```

## Special Considerations

- **Fault trees do not enumerate every conceivable failure.** They enumerate the failures that, by the design's own logic, reach the chosen top event. Failures that are out of scope of the safety goal are out of scope of the tree. Document the scope boundary explicitly so reviewers understand what the tree is silent about.
- **The 2024 Analog Devices common-cause guidance is canon.** Two basic events that share a power rail, a clock, a supplier batch, a third-party library version, an algorithm, or an operator are NOT independent. The AND gate above them is misleading. The mitigation is either to break the shared boundary (segregation) or to apply a common-cause factor (beta-factor in IEC 61508 Part 6 Annex D, typically five to twenty-five percent).
- **Tool qualification matters at scale.** Trees with more than approximately twenty basic events SHOULD use a tool-qualified Fault Tree Analysis package. Open-FTA, SAPHIRE, RiskSpectrum, and Isograph FaultTree+ are the common ones; the project's Tool Confidence Level record (controlled by `tool_qualification`) MUST list whichever is used.
- **Reuse basic events across trees.** The same component-level basic event appears in multiple trees (one per top event). Keep the basic-event identifier stable and the failure-in-time values consistent with the FMEDA so that the two views never disagree about the same component.
- **Quantitative is not always better.** A qualitative tree that exposes the structural single-point failure is more valuable than a quantitative tree that buries the same single-point in an averaged probability. Both views exist for a reason.

---

## Refinement Loop — critic mode

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every missing tree, undefended single-point, missing independence argument, unanalysed common-cause, FTA / FMEDA inconsistency, Tolerable Hazard Rate miss, and stale tree emits as `severity: critical` in the letter to CTO Chief.
- Findings block phase advancement until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section, with the IV and V signature attached.

The principle: a hidden single-point cut set today is the field incident tomorrow. Hardware or safety-critical software that ships without a current, sourced, threshold-meeting Fault Tree Analysis ships with a known functional-safety gap.
