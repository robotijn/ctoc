---
name: hil-harness
description: Hardware-in-the-Loop test ladder — selects and documents the right verification rung (Model-in-the-Loop, Software-in-the-Loop, Processor-in-the-Loop, Hardware-in-the-Loop) for each safety-relevant function and treats a missing rung as a documented assurance gap, not a silent one.
type: skill
when_to_load:
  - "Hardware-in-the-Loop"
  - "HIL"
  - "Software-in-the-Loop"
  - "SIL test"
  - "Processor-in-the-Loop"
  - "PIL"
  - "Model-in-the-Loop"
  - "MIL test"
  - "V-model verification"
  - "test ladder"
  - "test rig"
  - "real-time verification"
  - "embedded testing"
  - "dSPACE"
  - "NI VeriStand"
  - "Speedgoat"
related_skills:
  - realtime/wcet-budget
  - safety/fmeda-analyzer
  - safety/fault-tree-builder
  - testing/test-strategy
  - quality/performance-validator
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

# Hardware-in-the-Loop Test Ladder (skill)

> New in CTOC v6.9.x — Cluster 6 (Real-time and Timing). Activated when the `hil_test_ladder` control is enabled (ISO 26262 Automotive Safety Integrity Level D, RTCA DO-178C Level A, IEC 61508 Safety Integrity Level 3) or when a plan targets embedded hardware with safety-relevant functions.
> Hardware-in-the-Loop is the top rung of a four-rung verification ladder. Skipping rungs is permissible but never silent — every skip becomes a documented assurance gap.

## Role

You are a real-time verification engineer who refuses to call an embedded function "verified" until it has been exercised at the appropriate rung of the V-model verification ladder. Your job is to pick the right rung for each safety-relevant function, document why, run the verification at that rung (or arrange for it to be run), and treat any missing rung as a documented assurance gap with a written rationale — never as silence.

You operate at Step 7 (SPEC), Step 8 (TEST), and Step 14 (VERIFY) of the Iron Loop. At Step 7 the rung selection is recorded with each requirement. At Step 8 the rung's test infrastructure is part of the test plan. At Step 14 the evidence from the selected rungs is what the Independent Verification and Validation reviewer audits.

## When to load

This skill is dispatched by CTO Chief (or by an in-loop agent on its behalf) when any of the following is true for the plan in flight:

- The active regulatory regime profile declares `hil_test_ladder` as a required control. As of CTOC v6.9.x that includes `iso-26262-asil-d`, `do-178c-level-a`, and `iec-61508-sil-3`.
- The plan targets embedded hardware (an electronic control unit, a flight-control computer, a programmable logic controller, an industrial Safety Instrumented Function) with at least one safety-relevant function.
- The user explicitly requests a Hardware-in-the-Loop or other ladder-rung verification via the trigger phrases listed in `when_to_load`.

If none of the above is true, this skill is inert — the lean default per the regulatory-regime opt-in policy.

## 2026 Best Practices (Real-time category)

- **The V-model is the load-bearing framing.** Each ladder rung corresponds to a left-side step of the V-model (requirements, design, code) verified against the matching right-side rung. SRM Tech's Hardware-in-the-Loop testing reference (https://www.srmtech.com/knowledge-base/blog/hardware-in-the-loop-hil-testing-a-comprehensive-guide/) gives the canonical 2026 framing: Model-in-the-Loop verifies the model against requirements, Software-in-the-Loop verifies the generated or hand-written software against the model, Processor-in-the-Loop verifies the cross-compiled code on the target processor, and Hardware-in-the-Loop verifies the entire electronic control unit in a simulated physical environment. Each rung answers a different verification question; skipping a rung leaves the corresponding question unanswered.
- **Skipping a rung is permissible but never silent.** A pilot project on a non-safety prototype may legitimately go from Model-in-the-Loop straight to a bench Hardware-in-the-Loop, skipping Software-in-the-Loop and Processor-in-the-Loop. The discipline is to *record* the skip and the reasoning: "Software-in-the-Loop skipped because the target compiler is generation-stable for this architecture and Processor-in-the-Loop will catch any deviation." Silence is the failure mode.
- **The rungs catch different defect classes.** Model-in-the-Loop catches requirement-vs-model mismatches. Software-in-the-Loop catches model-vs-code mismatches. Processor-in-the-Loop catches host-vs-target compiler and runtime mismatches. Hardware-in-the-Loop catches integration faults: timing, electrical, sensor noise, actuator dynamics, fault-injection response. No single rung subsumes the others.
- **Fault injection lives at Hardware-in-the-Loop.** Stuck-at, bit-flip, broken-wire, sensor-drift, brown-out, electromagnetic-interference, and timing-jitter faults need a real input stage to inject. ISO 26262 Part 4 requires fault-injection testing for Automotive Safety Integrity Level C and D; RTCA DO-178C requires robustness testing at Level A and B. Hardware-in-the-Loop is the rung where these tests run.
- **Real-time fidelity is the entry ticket for Hardware-in-the-Loop.** A Hardware-in-the-Loop simulator must close the control loop fast enough that the device under test cannot tell the simulator from the physical plant. Typical real-time step sizes are tens to hundreds of microseconds for power-electronics and motor-control rigs and one to ten milliseconds for vehicle-dynamics rigs. The simulator's worst-case overrun rate belongs in the test report.
- **Coverage at the upper rungs costs more per test, so the lower rungs carry the test-count burden.** Industrial practice is to run thousands of Model-in-the-Loop and Software-in-the-Loop tests per regression cycle, hundreds of Processor-in-the-Loop tests, and tens to hundreds of Hardware-in-the-Loop tests targeted at integration scenarios that cannot be exercised lower. Designing a regression that inverts that pyramid is a documented test-strategy smell.
- **Hardware-in-the-Loop rigs need their own qualification.** A test bench that injects wrong values into the device under test produces wrong evidence. The simulator's plant model, the input-output board calibration, the wiring loom, and the fault-injection switches each need a qualification record. ISO 26262 Part 8 Clause 11 (Tool Confidence Level for the test environment) and RTCA DO-330 (Tool Qualification) apply to the test bench as much as to the development tools.
- **A passing rung is necessary but not sufficient.** A Hardware-in-the-Loop pass on the nominal scenario is not a release decision; it is one input to a release decision that also includes Worst-Case Execution Time analysis, Failure Modes Effects and Diagnostic Analysis, requirements traceability, and configuration baselines. CTOC's Iron Loop integrates the rungs with the other Gate 3 evidence; do not treat a Hardware-in-the-Loop green as a global green.

## The four rungs of the verification ladder

The ladder mirrors the V-model. Each rung is named by what is "in the loop" — the simulated quantity is everything else.

```
Requirements  ─────────────────────────────► Acceptance / system test
    │
    └── Model       (block-diagram or stateflow)
        │
        │   Rung 1: Model-in-the-Loop (MIL)
        │   Verifies model against requirements; everything else is simulated.
        │
        └── Software (hand-written or auto-generated source code)
            │
            │   Rung 2: Software-in-the-Loop (SIL)
            │   Verifies the source code on the host PC; the model and the
            │   plant are simulated. Catches model-vs-code mismatches.
            │
            └── Object code on target processor
                │
                │   Rung 3: Processor-in-the-Loop (PIL)
                │   Runs the cross-compiled object code on the target processor
                │   (or a cycle-accurate simulator) with the plant simulated.
                │   Catches host-vs-target compiler and runtime mismatches.
                │
                └── Electronic Control Unit hardware + actuators + sensors
                    │
                    │   Rung 4: Hardware-in-the-Loop (HIL)
                    │   The real electronic control unit with the real
                    │   wiring loom; the plant (vehicle, engine, motor, fluid
                    │   system) is simulated in real time. Catches timing,
                    │   electrical, integration, and fault-response defects.
                    │
                    └── Vehicle / aircraft / plant on bench or in field
                        │   (out of scope for HIL; this is acceptance / certification)
```

### Rung 1 — Model-in-the-Loop

**What is real**: the algorithmic model (Simulink, Stateflow, SCADE, or equivalent block diagram).
**What is simulated**: the plant, the sensors, the actuators, the host of the model (the model runs in the modelling tool itself, not as compiled code).
**Verifies**: model against requirements. Does the block diagram do what the requirement says?
**Typical tooling**: MathWorks Simulink Test, Ansys SCADE Test, dSPACE TargetLink simulation modes.
**Best for**: requirement-derived test vectors, coverage of model branches, early detection of logical errors before any code is generated.
**Limitations**: no real-time fidelity, no compiler effects, no integration effects.
**Skip implication if missing**: requirement-versus-model mismatches will not surface until later rungs and will be more expensive to fix.

### Rung 2 — Software-in-the-Loop

**What is real**: the source code (auto-generated from the model or hand-written), compiled for the host PC.
**What is simulated**: the plant, the sensors, the actuators, the target processor (the code runs on the host's x86 or ARM, not the embedded target).
**Verifies**: code against model. Did the code generator (or the hand-coder) produce something that matches the model?
**Typical tooling**: dSPACE VEOS, MathWorks Simulink Coder + S-Functions, Vector CANoe, open-source Functional Mock-up Interface containers.
**Best for**: high-volume regression where you need to exercise thousands of input vectors per minute against the actual source code, with full debugger access.
**Limitations**: host-versus-target differences (integer width, floating-point determinism, endianness, ABI calling convention, optimisation behaviour) are not exercised. Real-time timing is not exercised.
**Skip implication if missing**: model-versus-code mismatches will only surface at Processor-in-the-Loop or Hardware-in-the-Loop, where the diagnostic feedback loop is slower and the rig is more expensive.

### Rung 3 — Processor-in-the-Loop

**What is real**: the cross-compiled object code running on the target processor or a cycle-accurate simulator of the target.
**What is simulated**: the plant, the sensors, the actuators, the input-output peripherals.
**Verifies**: cross-compiled code against host-compiled code. Did the target compiler produce equivalent semantics? Did target arithmetic (fixed-point saturation, denormal handling, integer overflow) behave the same?
**Typical tooling**: dSPACE MicroAutoBox in PIL mode, NI VeriStand with target-board interface, Lauterbach TRACE32 PIL adapters, MathWorks PIL via On-Chip-Debugger.
**Best for**: catching compiler-generation differences, ABI bugs, fixed-point precision drift, target-specific peripheral handling.
**Limitations**: still does not exercise the wiring loom, the analog input stage, the sensor electrical interface, or the actuator dynamics. Real-time is sometimes simulated; the timing fidelity is "target processor, not target system".
**Skip implication if missing**: host-versus-target defects will only surface at Hardware-in-the-Loop, where they are entangled with integration defects and harder to isolate.

### Rung 4 — Hardware-in-the-Loop

**What is real**: the full electronic control unit (the device under test), the wiring loom, the real input-output interfaces, the real sensors and actuators or their high-fidelity hardware emulations.
**What is simulated**: the plant — the vehicle, the engine, the motor, the fluid system, the patient body, the trading-venue counterparty — running on a real-time computer that closes the control loop fast enough to be indistinguishable from physical hardware.
**Verifies**: the integrated electronic control unit's behaviour in real time, including timing, electrical, sensor noise, actuator dynamics, and fault-injection response. This is the rung that exercises ISO 26262 Part 4 fault-injection requirements and RTCA DO-178C robustness testing.
**Typical tooling**: dSPACE SCALEXIO, NI VeriStand + PXI chassis, Speedgoat Performance / Mobile real-time computers, ETAS LABCAR, Opal-RT OP4500/OP5700 for power systems.
**Best for**: integration testing, fault injection, performance-under-load, sensor-failure modes, electrical-fault response, real-time deadline verification on the actual target.
**Limitations**: rig setup cost is large; throughput is low (tens to hundreds of tests per regression cycle, not thousands); a poorly-qualified rig injects false confidence.
**Skip implication if missing**: integration, timing, and fault-injection defects ship to acceptance testing or, worse, to the field. For Automotive Safety Integrity Level C / D and RTCA DO-178C Level A / B this is non-negotiable.

## When to dispatch each rung

The rule is "lowest rung that can answer the question", run cumulatively up:

| Question / risk | First rung that can answer | Industrial practice |
|---|---|---|
| Does the algorithm satisfy the requirement? | Model-in-the-Loop | Every requirement gets at least one Model-in-the-Loop test |
| Did the code generator or hand-coder match the model? | Software-in-the-Loop | Auto-coded paths: every regression; hand-coded paths: per-pull-request |
| Did the cross compiler preserve semantics? | Processor-in-the-Loop | At every compiler-version change, at every optimisation-flag change |
| Does the integrated electronic control unit meet timing on the target? | Hardware-in-the-Loop | Per release candidate, per silicon-revision change |
| How does the system respond to a stuck sensor, a shorted wire, a brown-out? | Hardware-in-the-Loop with fault injection | Per release candidate, per fault-tolerance change |
| Does the system meet its Worst-Case Execution Time bound on real hardware? | Hardware-in-the-Loop (corroborates the static bound from `realtime/wcet-budget`) | Per release candidate, per Worst-Case Execution Time recomputation |

A rung is "current" when its evidence reflects the configuration baseline of the current release candidate. Stale evidence (rung passed against an older binary, older silicon revision, older sensor stub) is treated as missing evidence and emits `kind: stale_rung_evidence`.

## What a missing rung implies for assurance

A missing rung is not silently safe. For each plan and each safety-relevant function, the artifact records the per-rung status and (if the rung is skipped) the documented rationale. The integrator weights the residual risk on that basis.

| Missing rung | Defect class that ships unverified | Acceptable when |
|---|---|---|
| Model-in-the-Loop | Requirement-versus-model logical defects | The model is trivial (single-block pass-through) and reviewed by hand |
| Software-in-the-Loop | Model-versus-code generator defects | The code is hand-written (no generator gap to verify) and unit-tested independently |
| Processor-in-the-Loop | Host-versus-target compiler defects | The target compiler is qualified per RTCA DO-330 / ISO 26262 Tool Confidence Level and version-pinned |
| Hardware-in-the-Loop | Integration, timing, fault-response, electrical defects | Almost never acceptable for Automotive Safety Integrity Level C / D, RTCA DO-178C Level A / B, IEC 61508 Safety Integrity Level 2 / 3; sometimes acceptable for low-criticality prototypes with a documented residual-risk acceptance |

When the active regulatory regime declares `hil_test_ladder`, the absence of Hardware-in-the-Loop evidence at Step 14 is a `severity: critical` finding regardless of the project size. There is no "the unit tests are enough" override for safety-certifiable functions; the unit tests live at Software-in-the-Loop and below and cannot exercise integration.

## Inputs (what this skill reads)

- The plan's `## Requirements` and `## Architecture` sections.
- The list of safety-relevant functions and their criticality (Automotive Safety Integrity Level / Software Level / Safety Integrity Level).
- The model artifacts (Simulink, Stateflow, SCADE) if any.
- The build recipe and target identification (re-used from `realtime/wcet-budget`).
- The Failure Modes Effects and Diagnostic Analysis artifact at `.ctoc/safety/fmeda/<plan-id>.yaml`, when produced — fault-injection scenarios at Hardware-in-the-Loop derive from this.
- The Worst-Case Execution Time artifact at `.ctoc/realtime/wcet/<plan-id>.yaml`, when produced — Hardware-in-the-Loop measurement corroborates or refutes the static bound.
- The test environment qualification record (`.ctoc/tools/qualification/<rig-id>.yaml`) for the Hardware-in-the-Loop rig.

If any input is missing, this skill emits `finding: missing_input` with a precise list — it does NOT invent values.

## Outputs (what this skill writes)

A single machine-readable artifact at `.ctoc/realtime/hil-ladder/<plan-id>.yaml`. Schema:

```yaml
plan_id: <plan filename without extension>
analysis_date: YYYY-MM-DD
analyst: <agent or human author>
reviewer: <Independent Verification and Validation reviewer, required for Automotive Safety Integrity Level C/D and Software Level A/B>
target_identification:
  silicon_part_number: <as in the WCET artifact>
  electronic_control_unit_revision: <e.g. ECU-12.A revision 3>
  wiring_loom_revision: <e.g. loom-2026-05>
test_environment:
  rig_id: <stable identifier>
  rig_vendor_and_model: <e.g. dSPACE SCALEXIO LabBox, NI PXIe-1078, Speedgoat Performance>
  plant_model_version: <git hash or document id>
  qualification_record: <path to .ctoc/tools/qualification/<rig-id>.yaml>
  real_time_step_microseconds: <integer, typical 50 to 1000>
  worst_case_overrun_rate_pct: <floating-point, must be near zero>
functions:
  - id: <stable identifier>
    name: <e.g. emergency_brake_arbiter>
    criticality: ASIL-D | ASIL-C | ASIL-B | ASIL-A | QM | SIL-3 | SIL-2 | SIL-1 | DO-178C-A | DO-178C-B | DO-178C-C | DO-178C-D
    rung_evidence:
      model_in_the_loop:
        status: pass | fail | skipped | not-yet-run
        test_set: <path to test set or test plan>
        result_file: <path to the test report>
        skip_rationale: <required when status is skipped>
      software_in_the_loop:
        status: pass | fail | skipped | not-yet-run
        test_set: <path>
        result_file: <path>
        skip_rationale: <required when status is skipped>
      processor_in_the_loop:
        status: pass | fail | skipped | not-yet-run
        test_set: <path>
        result_file: <path>
        skip_rationale: <required when status is skipped>
      hardware_in_the_loop:
        status: pass | fail | skipped | not-yet-run
        test_set: <path>
        fault_injection_scenarios: <integer count>
        result_file: <path>
        skip_rationale: <required when status is skipped>
        observed_wcet_microseconds: <integer, the worst measurement; compared to the static bound>
        observed_wcet_vs_static_bound: within | exceeds | not-compared
overall:
  cumulative_status: pass | partial | fail
  outstanding_rungs:
    - <function id> <rung name>
findings:
  - kind: <see findings list below>
    function_id: <reference>
    message: <one-sentence explanation>
    suggested_fix: <one-sentence remediation>
```

## Categories (the findings this skill emits)

Each finding emits as `severity: critical` on the wire per the warnings-are-bugs rule when the regulatory regime activates `hil_test_ladder`.

### 1. Missing required rung evidence

A safety-relevant function whose criticality demands a rung (per the table above) has no evidence at that rung and no documented skip rationale.

Emit `kind: missing_rung_evidence`.

### 2. Skip rationale absent or insufficient

A rung is marked `skipped` but `skip_rationale` is empty or boilerplate ("not needed", "too expensive") without a citation to a specific risk-acceptance decision.

Emit `kind: skip_rationale_insufficient`.

### 3. Hardware-in-the-Loop rig not qualified

The `qualification_record` path is empty or the referenced record is missing or expired. An unqualified rig produces unverifiable evidence.

Emit `kind: rig_not_qualified`.

### 4. Real-time fidelity insufficient

The Hardware-in-the-Loop `real_time_step_microseconds` is larger than the device under test's fastest control loop, or `worst_case_overrun_rate_pct` is non-negligible. The simulator is not closing the loop fast enough.

Emit `kind: real_time_fidelity_insufficient`.

### 5. Stale rung evidence

A rung's `result_file` references a binary, silicon revision, or model version that no longer matches the current configuration baseline.

Emit `kind: stale_rung_evidence`.

### 6. Hardware-in-the-Loop measurement contradicts Worst-Case Execution Time bound

`observed_wcet_microseconds` is greater than the static bound recorded in `.ctoc/realtime/wcet/<plan-id>.yaml`. This is a corroboration failure between rungs that demands investigation.

Emit `kind: hil_contradicts_wcet`.

### 7. Fault-injection coverage gap

The plan's Failure Modes Effects and Diagnostic Analysis lists failure modes that are not exercised by any Hardware-in-the-Loop scenario. Each unaddressed failure mode is a fault-injection gap.

Emit `kind: fault_injection_gap`.

### 8. Inverted regression pyramid

The repository's test count at Hardware-in-the-Loop substantially exceeds Software-in-the-Loop count, suggesting either a missing or under-used lower rung. The pyramid should be wide at the bottom and narrow at the top.

Emit `kind: inverted_test_pyramid`.

### 9. Hand-written code skipped Software-in-the-Loop and went straight to Hardware-in-the-Loop

A safety-relevant hand-written function has no Software-in-the-Loop test and no documented rationale; Hardware-in-the-Loop alone gives slow feedback for debugging hand-coding errors.

Emit `kind: hand_code_skipped_sil`.

### 10. Model-in-the-Loop coverage incomplete

The Model-in-the-Loop test set does not cover every requirement traceable to the function. Without full requirement coverage at this rung, the cheapest defects survive to expensive rungs.

Emit `kind: mil_coverage_incomplete`.

## Language coverage (7-language rule)

Hardware-in-the-Loop verification is a discipline of **embedded systems engineering**. The device under test is overwhelmingly written in C or C++; the plant model is often in a modelling-tool language (Simulink, SCADE) or in C/C++ when hand-coded. The other coverage-list languages appear in supporting roles — test orchestration, log analysis, dashboard generation — but do not host the safety-relevant code that the ladder verifies.

Honest examples follow.

### C (C17 / C23) — load-bearing (the device-under-test code)

BAD — a control function that ships untested at any rung other than the developer's host machine. Host-versus-target compiler behaviour, peripheral-register access, and real-time deadline are all unverified:

```c
/* abs_arbiter.c — antilock braking arbiter, criticality ASIL-D */
#include "abs.h"
#include "peripheral.h"

void abs_arbiter_step(void)
{
    uint16_t wheel_speed = read_wheel_speed_register();
    uint16_t target      = compute_target(wheel_speed);
    write_brake_pressure_register(target);
}

/* Unit-tested on the developer's laptop with a mocked peripheral. No
 * Software-in-the-Loop, no Processor-in-the-Loop, no Hardware-in-the-Loop.
 * The mocked peripheral always returns the same wheel-speed value, so no
 * deadline-jitter, no register-side-effect, and no fault-injection have
 * been verified. */
```

SAFE — pair the source with a per-rung test record in the artifact above, including a Hardware-in-the-Loop fault-injection scenario for each Failure Modes Effects and Diagnostic Analysis row that targets this function:

```c
/* abs_arbiter.c — unchanged source; the change is in the test evidence */

/* The accompanying .ctoc/realtime/hil-ladder/<plan-id>.yaml records:
 *   - Model-in-the-Loop: 47 tests against Simulink reference model
 *   - Software-in-the-Loop: 1,420 regression vectors on host build
 *   - Processor-in-the-Loop: 124 regression vectors on target object code
 *   - Hardware-in-the-Loop: 38 scenarios on dSPACE SCALEXIO rig
 *     including fault-injection:
 *       - wheel-speed-sensor stuck-at-zero
 *       - wheel-speed-sensor stuck-at-max
 *       - brake-pressure-actuator open-circuit
 *       - 12-volt rail brown-out to 9 volts during step
 *       - electromagnetic-interference pulse on wheel-speed line
 *   - Observed Worst-Case Execution Time at HIL: 142 microseconds
 *     (static bound: 200 microseconds — within bound, evidence retained)
 */
```

### C++ (C++20 / C++23) — load-bearing (also the device-under-test code)

BAD — a controller class whose Hardware-in-the-Loop scenarios cover only the nominal path. No fault-injection means no robustness evidence:

```cpp
// motor_controller.cpp — criticality ASIL-C
class MotorController {
public:
    int32_t step(int32_t commanded_torque, int32_t measured_position);
};

// The HIL plan exercises 50 nominal-path scenarios. No sensor-stuck-at,
// no actuator-open-circuit, no electromagnetic-interference scenarios.
// Robustness is unverified.
```

SAFE — derive fault-injection scenarios at Hardware-in-the-Loop directly from the Failure Modes Effects and Diagnostic Analysis. Every dangerous-undetected and dangerous-detected failure mode becomes at least one scenario:

```cpp
// motor_controller.cpp — unchanged source; change is in scenario derivation

// FMEDA entry:
//   component:   torque_sensor
//   failure_mode: stuck-at-zero
//   effect:       dangerous-detected (diagnostic: range check)
//   diagnostic:   range_check_torque_sensor()
// HIL scenario derived:
//   inject:  torque_sensor reading frozen to 0
//   expect:  diagnostic raises FAULT_TORQUE_SENSOR within 10 ms
//            controller transitions to limp-home state
//            measured_position no longer commands torque
```

### Python (3.12+) — supporting role only

Python does not host the device-under-test code in a 2026 safety-relevant embedded system. It is appropriate for **test orchestration** at the Hardware-in-the-Loop layer: driving the rig, reading test results, computing aggregate pass/fail, generating per-scenario evidence files. The discipline lives entirely in the data, not in the Python.

```python
# hil_runner.py — invokes the dSPACE Python API to run a HIL scenario
import yaml
import pathlib

def record_hil_scenario(plan_id: str, scenario_name: str, result: dict) -> None:
    """Append a HIL scenario result to the per-plan artifact."""
    artifact_dir = pathlib.Path(".ctoc/realtime/hil-ladder")
    artifact_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = artifact_dir / f"{plan_id}.yaml"

    artifact = (
        yaml.safe_load(artifact_path.read_text()) if artifact_path.exists() else {}
    )
    artifact.setdefault("scenarios", []).append({"name": scenario_name, **result})
    artifact_path.write_text(yaml.safe_dump(artifact, sort_keys=False))
```

### JavaScript / TypeScript — non-applicable

JavaScript and TypeScript are not used for the device-under-test code in safety-relevant embedded systems. They appear in the operations dashboard that surfaces Hardware-in-the-Loop results (CTOC's dashboard tabs), not in the verification loop itself.

### Java (Java 21+) — non-applicable to the device under test

Java has the same managed-runtime constraints as listed in the `wcet-budget` skill. The rare exception — a Real-Time Specification for Java deployment — would itself need to be exercised at all four rungs; the discipline does not change with the language. For practical purposes, treat Java as non-applicable to the safety-relevant device-under-test code in 2026.

### C# (.NET 9) — non-applicable to the device under test

Same rationale as Java. C# can host **test-orchestration code** that talks to the Hardware-in-the-Loop rig (vendor SDKs exist for dSPACE and NI VeriStand) but does not host the safety-relevant code that the rig is verifying.

### Structured Query Language — non-applicable

Structured Query Language is appropriate for storing Hardware-in-the-Loop result histories and querying trends across releases; it does not host the test logic or the device-under-test code. The Hardware-in-the-Loop discipline does not live in the database schema.

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** when this skill writes a human-readable report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule.

| Triage tier | Examples | Internal action recommendation |
|---|---|---|
| CRITICAL | Missing Hardware-in-the-Loop on an Automotive Safety Integrity Level C / D function; rig not qualified; fault-injection gap on every FMEDA dangerous failure mode | BLOCK release |
| HIGH | Skipped Processor-in-the-Loop with insufficient rationale; stale rung evidence after compiler-version change; Hardware-in-the-Loop measurement above static Worst-Case Execution Time bound | BLOCK release for regulated programmes; fix before next release otherwise |
| MEDIUM | Inverted test pyramid; hand-written code that skipped Software-in-the-Loop and went straight to Hardware-in-the-Loop | Fix within sprint |
| LOW | Model-in-the-Loop coverage at ninety-five percent of requirements (gap is in a non-safety-relevant subset) | Backlog |

## Output Format (human-readable scan report)

```markdown
## Hardware-in-the-Loop Ladder Review — <plan name>

### Summary
| Severity | Count | Required Action |
|---|---|---|
| CRITICAL | 1 | IMMEDIATE       |
| HIGH     | 2 | Before Release  |
| MEDIUM   | 1 | Within Sprint   |
| LOW      | 0 | Backlog         |

### CRITICAL: Missing Hardware-in-the-Loop evidence on emergency_brake_arbiter (ASIL-D)
**Function**: emergency_brake_arbiter
**Criticality**: ASIL-D
**Rung status**:
- Model-in-the-Loop: pass
- Software-in-the-Loop: pass
- Processor-in-the-Loop: pass
- Hardware-in-the-Loop: not-yet-run
**Why critical**: ISO 26262 Part 4 requires Hardware-in-the-Loop verification including fault-injection for ASIL-D functions. The function may not enter release until Hardware-in-the-Loop scenarios derived from the Failure Modes Effects and Diagnostic Analysis are run on the qualified rig.
**Action**: Schedule dSPACE SCALEXIO test session for the 38 scenarios listed in .ctoc/safety/fmeda/<plan>.yaml. Record results in .ctoc/realtime/hil-ladder/<plan>.yaml.

### HIGH: Hardware-in-the-Loop observed Worst-Case Execution Time exceeds static bound
**Function**: lane_keep_controller
**Static bound (aiT)**: 180 microseconds (with 20% safety margin)
**Observed at Hardware-in-the-Loop**: 196 microseconds
**Why high**: The static analysis claimed an upper bound that the integrated system exceeded under realistic input. Either the static model is missing a contention effect, the multicore partitioning is not enforced, or the measurement is non-representative.
**Action**: Re-run aiT with TimeWeaver multicore extension and the current partition layout; re-run Hardware-in-the-Loop with the same input vector to confirm reproducibility; if the bound is genuinely exceeded, raise the safety margin or restructure the task.
```

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+target+kind+function_id)[:12]>
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low
engine: hil-harness
corroborated_by: [<other critics, e.g. realtime/wcet-budget when measurement exceeded the static bound; safety/fmeda-analyzer when fault-injection scenarios were missing>]
kind: missing_rung_evidence | skip_rationale_insufficient | rig_not_qualified | real_time_fidelity_insufficient | stale_rung_evidence | hil_contradicts_wcet | fault_injection_gap | inverted_test_pyramid | hand_code_skipped_sil | mil_coverage_incomplete
function_id: <reference to the function in the artifact>
rung: model_in_the_loop | software_in_the_loop | processor_in_the_loop | hardware_in_the_loop
criticality: ASIL-D | ASIL-C | ASIL-B | ASIL-A | QM | SIL-3 | SIL-2 | SIL-1 | DO-178C-A | DO-178C-B | DO-178C-C | DO-178C-D
target_file: .ctoc/realtime/hil-ladder/<plan-id>.yaml
target_line: <line in the artifact, if applicable>
message: <one-sentence explanation of the gap>
suggested_fix: <one-sentence remediation>
reference:
  - https://www.srmtech.com/knowledge-base/blog/hardware-in-the-loop-hil-testing-a-comprehensive-guide/
  - https://www.dspace.com/en/pub/home/products/hw/simulator_hardware.cfm
  - https://www.ni.com/en/shop/electronic-test-instrumentation/hardware-in-the-loop-products.html
  - https://www.speedgoat.com/products/real-time-target-machines
  - https://www.absint.com/timingexplorer/index.htm
```

The integrator uses `confidence` and `corroborated_by` to weight findings — a Hardware-in-the-Loop measurement exceedance corroborated by `realtime/wcet-budget` is unambiguous; a single-source `inverted_test_pyramid` finding is medium-confidence and may be waived per-project.

## Special considerations

- **Hardware-in-the-Loop is required at Step 14 (VERIFY) when targeting embedded hardware and `hil_test_ladder` is active.** Step 14 cannot pass without per-function rung evidence and without a documented rationale for any rung that was skipped. The integrator enforces this against the artifact schema above.
- **The plant model is itself a source of error.** A Hardware-in-the-Loop pass against a wrong plant model is worse than no Hardware-in-the-Loop because it injects false confidence. The plant model needs its own validation against either a high-fidelity offline model, physical measurement, or a reference vehicle / aircraft / system. Record the plant-model version in the artifact.
- **Fault-injection scenarios derive from the Failure Modes Effects and Diagnostic Analysis, not from the developer's intuition.** When this skill and `safety/fmeda-analyzer` both run, every Failure Modes Effects and Diagnostic Analysis row that targets a function in scope MUST have a Hardware-in-the-Loop scenario or a `kind: fault_injection_gap` finding.
- **Open-loop Hardware-in-the-Loop is a stepping stone, not a substitute.** Some rigs run a recorded input trace into the device under test without closing the loop. That tests the input handling but not the control feedback. Closed-loop Hardware-in-the-Loop is the discipline that the standards expect at Automotive Safety Integrity Level C / D and at RTCA DO-178C Level A / B.
- **Software-in-the-Loop with mocks is not Hardware-in-the-Loop.** A growing pattern in 2026 is to wrap an embedded codebase in mocks and call the result "Hardware-in-the-Loop" because it runs in a simulator. It is not — it is Software-in-the-Loop. The distinction matters because the rungs catch different defects; the schema enforces the naming.

---

## Refinement Loop — critic mode

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the warnings-are-critical rule:

- Every missing-rung, insufficient-skip-rationale, rig-not-qualified, real-time-fidelity, stale-evidence, Hardware-in-the-Loop-contradicts-Worst-Case-Execution-Time, fault-injection-gap, inverted-pyramid, hand-code-skipped-Software-in-the-Loop, and Model-in-the-Loop-coverage finding emits as `severity: critical` in the letter you write to CTO Chief.
- The letter schema rejects `warn` — there is no soft tier.
- Hardware-in-the-Loop-ladder findings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section. A waiver requires a citation to a customer-accepted residual-risk statement signed at Gate 3.

The principle: a missing rung today is the field failure tomorrow. Embedded code that ships into a safety-relevant role without evidence at every required rung ships with a known integration gap.

## References

- SRM Tech — Hardware-in-the-Loop testing comprehensive guide — https://www.srmtech.com/knowledge-base/blog/hardware-in-the-loop-hil-testing-a-comprehensive-guide/
- dSPACE Hardware-in-the-Loop simulators — https://www.dspace.com/en/pub/home/products/hw/simulator_hardware.cfm
- NI VeriStand and PXI Hardware-in-the-Loop — https://www.ni.com/en/shop/electronic-test-instrumentation/hardware-in-the-loop-products.html
- Speedgoat real-time target machines — https://www.speedgoat.com/products/real-time-target-machines
- ETAS LABCAR — https://www.etas.com/en/products/labcar.php
- Opal-RT real-time simulators for power systems — https://www.opal-rt.com/
- MathWorks Simulink Test and Coder — https://www.mathworks.com/products/simulink-test.html
- ISO 26262 Part 4 (system level) and Part 8 (supporting processes) — see AUTOSAR ISO 26262 guide at https://autosar.io/en/insights/iso26262-guide
- RTCA DO-178C and DO-330 (Tool Qualification, applies to the Hardware-in-the-Loop rig) — see LDRA DO-178C verification white paper at https://ldra.com/wp-content/uploads/ldra/DO-178C_WhitePaper_v3.0.pdf
