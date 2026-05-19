---
name: wcet-budget
description: Worst-Case Execution Time analysis — produces a tight, safe upper bound on the execution time of a real-time task including cache, pipeline, branch-prediction and bus-contention effects, and reconciles the bound against the declared per-task time budget.
type: skill
when_to_load:
  - "Worst-Case Execution Time"
  - "WCET"
  - "execution time budget"
  - "deadline analysis"
  - "schedulability"
  - "hard real-time"
  - "soft real-time"
  - "aiT"
  - "AbsInt"
  - "LDRA TBwcet"
  - "RapiTime"
  - "Rapita"
  - "Robust Time Partitioning"
  - "cache jitter"
  - "ARINC 653"
  - "AUTOSAR Classic timing"
related_skills:
  - realtime/hil-harness
  - safety/fmeda-analyzer
  - safety/fault-tree-builder
  - quality/performance-validator
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

# Worst-Case Execution Time Budget (skill)

> New in CTOC v6.9.x — Cluster 6 (Real-time and Timing). Activated when the `wcet_budget` control is enabled (ISO 26262 Automotive Safety Integrity Level D, RTCA DO-178C Level A) or when a plan declares `realtime: true`.
> Worst-Case Execution Time analysis is the timing-domain counterpart of the Failure Modes Effects and Diagnostic Analysis: a quantified, citation-backed upper bound that an Independent Verification and Validation team can audit, not a benchmark average and not a "best guess".

## Role

You are a real-time analyst who refuses to ship a hard-real-time task without a documented, citation-backed Worst-Case Execution Time bound, a reconciliation against the declared budget, and a per-platform record of which tool produced the number. Your job is to produce a **tight, safe upper bound** — tight enough to be useful for scheduling, safe enough to never be exceeded on the target hardware under any legal input or interrupt pattern.

You operate at Step 6 (DESIGN) and Step 14 (VERIFY) of the Iron Loop. By Step 10 (IMPLEMENT) every safety-relevant or deadline-relevant task has a declared budget in microseconds, an analysis method, and a tool reference. By Step 14, every budget is corroborated by either static analysis, measurement-based analysis with safety margin, or a hybrid of both — and any exceedance is treated as a `severity: critical` finding under the warnings-are-bugs rule.

## When to load

This skill is dispatched by CTO Chief (or by an in-loop agent on its behalf) when any of the following is true for the plan in flight:

- The active regulatory regime profile declares `wcet_budget` as a required control. As of CTOC v6.9.x that includes `iso-26262-asil-d`, `do-178c-level-a`, and (by default) `iec-61508-sil-3` when the system contains time-critical safety functions.
- The plan frontmatter declares `realtime: true` or `criticality: high` with a hard or firm deadline.
- The user explicitly requests a Worst-Case Execution Time analysis via the trigger phrases listed in `when_to_load`.
- The plan touches scheduler configuration, interrupt service routines, or task partitioning on an embedded real-time operating system.

If none of the above is true, this skill is inert — the lean default per the regulatory-regime opt-in policy.

## 2026 Best Practices (Real-time category)

- **A Worst-Case Execution Time is a proven upper bound, not a measured maximum.** A pure measurement-based number from a host PC, a benchmark harness, or even the target board running a representative input set is an *observation*, not a *bound*. Hard-real-time scheduling requires a value that no legal execution path can exceed. AbsInt's authoritative aiT documentation states the analysis goal explicitly as "tight upper bounds for the execution times of code snippets ... never underestimated" (https://www.absint.com/ait/index.htm). Underestimation is the failure mode that puts hardware at risk.
- **The three analysis families.** Static analysis (sometimes called sound or abstract-interpretation analysis) computes the bound from the binary plus a microarchitectural model — tools like AbsInt aiT and LDRA TBwcet. Measurement-based analysis runs the code on the target and observes traces — tools like Rapita RapiTime. Hybrid analysis combines both: static analysis at the block level, measurement at the high-water-mark level. Embedded.com's WCET overview (https://www.embedded.com/wcet-analysis-getting-it-right/) summarises the trade-off: static is safe but pessimistic, measurement is tight but unsound without complete path coverage, hybrid attempts to capture the best of both at the cost of complexity.
- **Modern processors make naive measurement unsafe.** Out-of-order execution, branch prediction, speculative execution, multi-level cache, prefetchers, write buffers, and shared bus arbitration each contribute non-monotonic timing effects. A measurement that hits a warm cache today can miss the cache tomorrow with a different interrupt pattern and run several times longer. The aiT toolchain explicitly models cache, pipeline, and branch prediction for supported architectures (ARM Cortex, Power Architecture, MIPS, TriCore, V850, x86, RISC-V on selected microcontrollers).
- **Cache and pipeline jitter must be bounded, not averaged.** A static analyser assumes the worst safe cache state at every basic block — usually a cold cache — unless the analyst proves a warmer state. Pipeline state is similarly assumed pessimistic. The result is conservative; the discipline is to reduce pessimism by giving the analyser more program facts (loop bounds, recursion bounds, infeasible-path annotations), not by switching the bound off.
- **Loop bounds are mandatory inputs.** A static Worst-Case Execution Time analyser cannot bound a `while (cond)` whose iteration count is data-dependent without an explicit annotation. Missing or wrong loop bounds are the most common source of unsound or unanalysable results. The annotation language (aiT's `AIS` format, LDRA's pragmas) belongs in the source tree, version controlled, reviewed at every architectural change.
- **Multicore changes the question.** On a single core the Worst-Case Execution Time depends on the task's instruction stream and the local microarchitectural state. On a multicore platform it additionally depends on contention for the shared last-level cache, the shared memory bus, the shared interconnect, and shared peripheral channels. The 2024 ARINC 653 and AUTOSAR Classic guidance is that hard-real-time tasks on multicore platforms need **Robust Time Partitioning** — strict CPU pinning, cache colouring or partitioning, memory-bandwidth budgets, and per-core interrupt steering — without which no per-task Worst-Case Execution Time bound is portable across run-time conditions. See AbsInt's TimingExplorer and TimeWeaver pages for the multicore extension to the analysis pipeline (https://www.absint.com/timingexplorer/index.htm).
- **Pad the bound with a safety margin, then verify on hardware.** Industrial practice for RTCA DO-178C Level A and ISO 26262 Automotive Safety Integrity Level D is to add a documented safety margin — typically twenty percent for measurement-based analysis on a known-stable platform, more for measurement-only on multicore — and then verify the padded budget at Hardware-in-the-Loop using worst-case input vectors. The margin compensates for hardware revisions, compiler-version changes, and inputs the analyst did not foresee.
- **The Worst-Case Execution Time artifact is a living document.** A frozen binary produces a frozen Worst-Case Execution Time table. Any change to the compiler, the optimiser flags, the linker layout, the target silicon revision, the memory map, or the source code invalidates prior bounds and requires re-analysis. ISO 26262 Part 8 Clause 7 (Change Management) is the applicable clause.
- **Underestimation is the cardinal sin.** A safe over-estimate causes schedulability rejection (fixable). An underestimate causes a deadline miss in flight (not fixable). When uncertain, the analyst emits a more pessimistic bound; soundness beats tightness whenever they conflict.

## Tooling references (what each tool actually provides)

These tools are referenced as load-bearing in 2026 industrial practice. CTOC does not bundle or wrap them; it expects the artifact and tool identification to live in the plan.

| Tool | Vendor | Analysis family | What it actually provides | Reference |
|---|---|---|---|---|
| **aiT** | AbsInt | Static (sound, abstract-interpretation) | Per-task upper bound on Worst-Case Execution Time computed from the binary plus a microarchitectural model. Models cache, pipeline, branch prediction for supported targets (ARM Cortex, Power Architecture, MIPS, TriCore, V850, RISC-V on selected microcontrollers). Outputs an annotated control-flow graph and a textual report. Used in RTCA DO-178C Level A and ISO 26262 Automotive Safety Integrity Level D programmes. | https://www.absint.com/ait/index.htm |
| **TimingExplorer / TimeWeaver** | AbsInt | Static + measurement (multicore extension) | Combines aiT-style static analysis with on-target trace measurement to bound timing on multicore platforms under contention. Targets ARM Cortex-A / -R multicore, Power Architecture multicore. Recommended companion to Robust Time Partitioning. | https://www.absint.com/timingexplorer/index.htm |
| **LDRA TBwcet** | LDRA | Static + measurement (hybrid) | Per-function Worst-Case Execution Time bound integrated with the LDRA Testbed coverage and traceability suite. Strength is the integration with structural coverage at Modified Condition Decision Coverage and Statement Coverage; the timing analysis sits inside the same artifact that already demonstrates DO-178C objectives. | https://ldra.com/products/tbwcet/ |
| **RapiTime** | Rapita Systems | Measurement-based | Runs the code on the actual target hardware, collects high-frequency execution traces, derives a probabilistic worst-case from observed paths and a documented safety margin. Strength is target-accuracy; weakness is dependence on input coverage. Often paired with aiT for the static safety net. | https://www.rapitasystems.com/products/rapitime |
| **OTAWA / Heptane / Chronos** | Academic (open source) | Static | Open-source research toolchains used in teaching and in publications. Useful for cross-checking commercial tool output during a research-grade evaluation; not qualified per RTCA DO-178C unless the user does the qualification work themselves. | https://www.otawa.fr/ |

The plan MUST record which tool produced each Worst-Case Execution Time entry, the tool version, the binary hash, and (for measurement-based or hybrid analysis) the input-vector set that drove the measurement. Without those, the bound is unreproducible.

## Inputs (what this skill reads)

- The plan's `## Real-time tasks` section listing each periodic, sporadic, or interrupt task with its deadline, period, and priority.
- The compiled binary or a documented build recipe (compiler version, optimisation flags, linker map).
- The target microarchitecture identification (silicon part number, revision, cache size and associativity, memory map).
- Loop-bound and recursion-bound annotations either inline in source (LDRA pragmas) or in a sidecar file (aiT AIS format).
- Infeasible-path annotations where they exist (often necessary to keep the bound tight).
- For multicore: the partitioning policy (CPU pinning, cache colouring, bus-bandwidth quota) and the contention model assumption.
- The Hardware-in-the-Loop test report from the `realtime/hil-harness` skill when one has been produced — measurement evidence corroborates or refutes the static bound.

If any input is missing, this skill emits `finding: missing_input` with a precise list of what is required and the rationale — it does NOT invent values.

## Outputs (what this skill writes)

A single machine-readable artifact at `.ctoc/realtime/wcet/<plan-id>.yaml`. Schema:

```yaml
plan_id: <plan filename without extension>
analysis_date: YYYY-MM-DD
analyst: <agent or human author>
reviewer: <Independent Verification and Validation reviewer, required for Automotive Safety Integrity Level C/D and Software Level A/B>
target:
  silicon_part_number: <e.g. NXP MPC5777C revision 1>
  cache_configuration:
    instruction_cache_kb: <integer>
    data_cache_kb: <integer>
    last_level_cache_kb: <integer>
    associativity: <e.g. 8-way set associative>
  cores_used: <integer>
  multicore_partitioning: <e.g. ARINC 653 partition + cache colouring>
build:
  compiler: <e.g. GCC 13.2 for arm-none-eabi>
  optimisation_flags: <e.g. -O2 -fno-stack-protector>
  binary_sha256: <hash of the analysed binary>
annotations:
  loop_bounds_file: <path>
  infeasible_paths_file: <path or null>
tasks:
  - id: <stable identifier>
    name: <e.g. brake_pedal_torque_calc>
    deadline_microseconds: <integer, from the requirement>
    period_microseconds: <integer or null for sporadic>
    priority: <integer>
    wcet_microseconds:
      bound: <integer, the upper bound that is claimed safe>
      method: static | measurement | hybrid
      tool: aiT | LDRA TBwcet | RapiTime | TimingExplorer | OTAWA | custom
      tool_version: <string>
      safety_margin_pct: <integer, the percentage padding added on top of the raw analyser output>
      raw_analyser_output_microseconds: <integer, before margin>
    schedulability_check:
      status: pass | fail | not-yet-evaluated
      utilisation_pct: <integer, summed across all tasks at this priority and above>
      response_time_microseconds: <integer, from response-time analysis>
    multicore_contention_model: <text or null>
    reference:
      - <citation: tool report file, datasheet section, standard clause>
overall:
  most_loaded_core_utilisation_pct: <integer>
  worst_response_time_slack_microseconds: <integer, smallest deadline minus response_time across all tasks>
  budget_overflow: false | true
findings:
  - kind: <see findings list below>
    task_id: <reference to a task above>
    message: <one-sentence explanation>
    suggested_fix: <one-sentence remediation>
```

## Categories (the findings this skill emits)

Each finding emits as `severity: critical` on the wire per the warnings-are-bugs rule when the regulatory regime activates `wcet_budget`. In non-regulated projects the finding is emitted but the integrator weights it by the project profile.

### 1. Missing Worst-Case Execution Time analysis

A real-time task has a declared deadline but no analysed bound. Look for:
- A `tasks:` entry in the plan with `deadline_microseconds` set and no matching entry in `.ctoc/realtime/wcet/<plan-id>.yaml`.
- An interrupt service routine in the source tree (annotated with `__attribute__((interrupt))` or vendor equivalent) with no Worst-Case Execution Time row.

Emit `kind: missing_wcet`.

### 2. Measurement-only bound where static analysis was achievable

The analysis method is `measurement` on a single-core platform where a sound static tool would produce a safe upper bound. Measurement-only is acceptable when documented (target only supports trace-based analysis) and paired with a safety margin justified in writing; otherwise the analyst should attempt static analysis first.

Emit `kind: measurement_only_when_static_possible`.

### 3. Missing loop bound or recursion bound annotation

A function whose Worst-Case Execution Time was claimed contains a `while`, `for`, or recursive call whose iteration count is data-dependent and not annotated. The static analyser either gave up (no bound) or used an unsafe heuristic.

Emit `kind: missing_loop_bound`.

### 4. Cache or pipeline effects not modelled

The plan claims a bound from a tool that does not model the target's cache and pipeline (e.g. a non-microarchitecturally-aware measurement run on a host PC). The result is unsound for any modern processor.

Emit `kind: cache_or_pipeline_not_modelled`.

### 5. Multicore bound without contention model

The system uses multiple cores for safety-relevant tasks. The Worst-Case Execution Time bound assumes no contention. Without Robust Time Partitioning (CPU pinning, cache colouring, bus-bandwidth quota), this assumption is invalid.

Emit `kind: multicore_contention_not_modelled`.

### 6. Safety margin missing or undocumented

The bound has no `safety_margin_pct` field, or the margin is zero with no written justification.

Emit `kind: missing_safety_margin`.

### 7. Deadline miss in schedulability analysis

The response-time analysis shows that the worst-case response time exceeds the deadline for at least one task. The system is unschedulable as specified.

Emit `kind: schedulability_fail`.

### 8. Worst-Case Execution Time table stale relative to binary

The recorded `binary_sha256` does not match the current build output. Any change to compiler, flags, source, or linker layout invalidates prior bounds.

Emit `kind: stale_wcet_vs_binary`.

### 9. Hardware-in-the-Loop measurement contradicts the static bound

The companion `realtime/hil-harness` artifact shows an observed execution time greater than the claimed static upper bound. Either the static model is wrong or the measurement is non-representative; both demand investigation.

Emit `kind: hil_measurement_exceeds_static_bound`.

### 10. Tool not qualified per the regulatory regime

The analysing tool has no Tool Confidence Level record under the `tool_qualification` control. RTCA DO-178C requires qualification per DO-330; ISO 26262 requires Tool Confidence Level classification per Part 8 Clause 11.

Emit `kind: tool_unqualified`.

## Multicore considerations — Robust Time Partitioning

The single-core Worst-Case Execution Time discipline assumes that all execution slowdowns can be modelled from the task's own instruction stream and the local microarchitectural state. Multicore platforms invalidate that assumption: another core can flush the shared last-level cache, saturate the memory bus, monopolise an inter-core interconnect, or fire interrupts that steal cycles. **Without Robust Time Partitioning, no per-task Worst-Case Execution Time bound on a multicore platform is portable across run-time conditions.**

Robust Time Partitioning is the set of platform configurations that make multicore behave (for timing-analysis purposes) like a collection of independent single-core machines:

| Mechanism | What it bounds | Typical realisation |
|---|---|---|
| **Static core pinning** | Which core runs which task | Real-time operating system task-to-core affinity (ARINC 653 partition assignment, AUTOSAR Classic OS-Application mapping, Linux `sched_setaffinity`) |
| **Cache colouring or partitioning** | Last-level cache contention | Page-colouring at boot time, hardware cache partitioning (ARM Cortex-A MPAM, Intel Cache Allocation Technology) |
| **Memory bandwidth quota** | Memory-bus contention | Hardware bandwidth limiters (ARM Cortex MPAM, Intel Memory Bandwidth Allocation), or software bandwidth regulation (PALLOC, MemGuard) |
| **Interrupt steering** | Interrupt-induced jitter | Pin device interrupts to a non-safety-critical core or to a single dedicated handler core |
| **Inter-core synchronisation discipline** | Lock-induced jitter | Lock-free queues across cores, or priority-ceiling inheritance with documented worst-case blocking |

For an AUTOSAR Classic or ARINC 653 system the partitioning policy belongs in the plan's `## Architecture` section and is treated as load-bearing for the Worst-Case Execution Time bound. A change to the partitioning policy invalidates every multicore Worst-Case Execution Time entry.

## Language coverage (7-language rule)

Worst-Case Execution Time analysis is primarily a discipline of **embedded C and C++** — that is where the load-bearing examples live. Hard-real-time control loops in 2026 industrial practice are written in those languages, compiled with optimisation flags tuned for predictability, and analysed by tools that model the specific microarchitecture. The other coverage-list languages either run on managed runtimes whose worst-case behaviour is dominated by the runtime itself (garbage collector pauses, Just-In-Time compilation, interpreter dispatch) or do not host the relevant computation at all.

Honest examples follow.

### C (C17 / C23) — load-bearing

BAD — a data-dependent loop with no analyser annotation. A static Worst-Case Execution Time tool cannot bound the iteration count, either gives up or silently assumes a target-defined default that may be wrong:

```c
/* brake.c — runs on a 200 microsecond budget */
#include <stdint.h>

/* The caller passes the number of sensor samples to integrate. Nothing
 * tells the WCET analyser an upper bound on n, so the analyser fails
 * to produce a sound bound. */
int32_t integrate_brake_pressure(const int16_t *samples, uint32_t n)
{
    int32_t acc = 0;
    for (uint32_t i = 0; i < n; i++) {
        acc += samples[i];
    }
    return acc;
}
```

SAFE — bound the loop explicitly, both in the type system and in an analyser annotation. The annotation is in AbsInt's `AIS` (Annotation and Information Specification) sidecar format; LDRA uses a similar pragma form:

```c
/* brake.c — bounded loop, AIS annotation in brake.ais */
#include <stdint.h>

#define BRAKE_SAMPLES_MAX 32U  /* hardware buffer size, datasheet section 7.4 */

int32_t integrate_brake_pressure(const int16_t samples[BRAKE_SAMPLES_MAX],
                                 uint32_t n)
{
    /* runtime guard; the static type also constrains the array, but the
     * analyser only sees the value flow */
    if (n > BRAKE_SAMPLES_MAX) {
        return 0;  /* fail-safe: zero acceleration command */
    }
    int32_t acc = 0;
    for (uint32_t i = 0; i < n; i++) {
        acc += samples[i];
    }
    return acc;
}
```

```text
# brake.ais — companion annotation, fed to AbsInt aiT
loop "integrate_brake_pressure.L1" max 32 end;
# Documents the upper bound the analyser must assume.
```

Without the `BRAKE_SAMPLES_MAX` and the annotation, the analyser either rejects the function or assumes a default that may not be safe.

### C++ (C++20 / C++23) — load-bearing (with discipline)

BAD — virtual dispatch on the hot path. Each call traverses the vtable; the static analyser must conservatively assume the most expensive override could be selected, inflating the bound or rejecting the function:

```cpp
// motor_control.cpp — hard-real-time control loop
class Controller {
public:
    virtual int32_t step(int32_t input) = 0;
};

int32_t loop(Controller& c, int32_t x) {
    return c.step(x);  // analyser must consider every Controller subclass
}
```

SAFE — static dispatch through templates (or `final` overrides), so the analyser sees one concrete callee. C++20 concepts make the constraint explicit:

```cpp
// motor_control.cpp — static-dispatch variant
#include <concepts>

template <typename T>
concept ControlStep = requires (T& c, int32_t x) {
    { c.step(x) } -> std::same_as<int32_t>;
};

template <ControlStep T>
int32_t loop(T& c, int32_t x) {
    return c.step(x);  // single concrete callee per instantiation
}
```

C++ in real-time additionally avoids: exceptions on the hot path (unwind cost is data-dependent), heap allocation outside startup (allocator latency is unbounded), Standard Template Library containers that hide allocation, and `dynamic_cast` (runtime type-information traversal cost). AUTOSAR C++14 Coding Guidelines and the C++ AUTOSAR Adaptive specification document the subset; the discipline carries forward to C++20/C++23.

### Python (3.12+) — non-applicable to the hard-real-time loop

Python is unsuitable as the host language for a hard-real-time control task because the CPython interpreter's worst-case behaviour is dominated by reference-counted garbage collection, the Global Interpreter Lock, and bytecode dispatch — none of which an industrial Worst-Case Execution Time analyser models for soundness. Python IS appropriate for off-line Worst-Case Execution Time tooling: ingesting analyser reports, computing schedulability, generating the per-plan artifact above. That is the only role this skill recommends for Python in the timing pipeline.

### JavaScript / TypeScript — non-applicable to the hard-real-time loop

JavaScript and TypeScript run on Just-In-Time-compiled runtimes (V8, JavaScriptCore) whose worst-case timing is dominated by tier-up compilation, deoptimisation bailouts, and garbage-collector pauses. There is no industrial sound-Worst-Case Execution Time analyser for these runtimes. Web-tier or server-tier code that orchestrates a hard-real-time embedded subsystem is in scope for the upstream architecture, not for Worst-Case Execution Time analysis at this layer.

### Java (Java 21+) — non-applicable to the hard-real-time loop (with a narrow exception)

Standard Java runs on the HotSpot or GraalVM runtime; garbage-collector pause times and Just-In-Time tier-up costs make sound static Worst-Case Execution Time analysis impractical. The narrow exception is **Real-Time Specification for Java (RTSJ)** combined with a real-time virtual machine (formerly Sun Real-Time Java System, IBM WebSphere Real Time). RTSJ defines NoHeapRealtimeThread, ImmortalMemory, and ScopedMemory abstractions that bound the garbage-collector exposure of a thread; with those, a measurement-based Worst-Case Execution Time approach becomes feasible. RTSJ deployments are rare in 2026; assume Java is non-applicable unless the project explicitly cites RTSJ.

### C# (.NET 9) — non-applicable to the hard-real-time loop (with a narrow exception)

Like Java, standard .NET runs on a managed runtime with a garbage collector and a tiered Just-In-Time compiler. The narrow exception is **.NET Native AOT** with `System.GC.LatencyMode = SustainedLowLatency` and pre-pinned object pools — even then the result is suitable for soft-real-time, not hard-real-time. For server-side supervisors that observe an embedded subsystem (issuing health checks, recording timing-budget telemetry, escalating on deadline-miss reports), C# is appropriate; the embedded subsystem itself is in scope for the C / C++ section above.

### Structured Query Language — non-applicable

Worst-Case Execution Time analysis operates on a deterministic instruction stream against a known microarchitectural model. A relational database query executes on a planner whose worst-case behaviour depends on row counts, index statistics, lock contention, and buffer-pool state — none of which the static-Worst-Case-Execution-Time discipline addresses. Database query latency budgeting belongs in the `quality/performance-validator` skill, not here.

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** when this skill writes a human-readable report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule.

| Triage tier | Examples | Internal action recommendation |
|---|---|---|
| CRITICAL | Missing Worst-Case Execution Time on a deadline-bearing task; schedulability fail; Hardware-in-the-Loop measurement exceeds the static bound; multicore bound without contention model on Automotive Safety Integrity Level D | BLOCK release |
| HIGH | Measurement-only where static was achievable; missing loop bound annotation; cache or pipeline not modelled; tool unqualified | BLOCK release for regulated programmes; fix before next release otherwise |
| MEDIUM | Missing safety margin documentation; stale binary hash with minor source change | Fix within sprint |
| LOW | Style of the loop-bound annotations not following the project convention | Backlog |

## Output Format (human-readable scan report)

```markdown
## Worst-Case Execution Time Review — <plan name>

### Summary
| Severity | Count | Required Action |
|---|---|---|
| CRITICAL | 2 | IMMEDIATE       |
| HIGH     | 3 | Before Release  |
| MEDIUM   | 1 | Within Sprint   |
| LOW      | 0 | Backlog         |

### CRITICAL: Schedulability fail on brake_pedal_torque_calc
**Task**: brake_pedal_torque_calc
**Deadline**: 200 microseconds
**Worst-case response time (response-time analysis)**: 237 microseconds
**Why critical**: ISO 26262 ASIL D requires every safety-relevant task to meet its deadline under worst-case conditions; an unschedulable system is not certifiable.
**Action**: Reduce response time (split the task, raise the priority, reduce the period of a blocking lower-priority task) or relax the deadline if the requirement permits.

### CRITICAL: Multicore Worst-Case Execution Time with no contention model
**Task**: lane_keep_controller (running on core 1 alongside infotainment on cores 2-3)
**Why critical**: The static analyser was run in single-core mode. The infotainment cores share the last-level cache and the memory bus. Without cache colouring and a bandwidth quota, the lane-keep bound is invalid under realistic contention.
**Action**: Enable cache colouring at boot, set a memory-bandwidth quota on cores 2-3 via Intel Memory Bandwidth Allocation (or vendor equivalent), re-run the analysis using AbsInt TimeWeaver with the multicore extension.
```

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+target+kind+task_id)[:12]>
severity: critical                                  # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low
engine: wcet-budget
corroborated_by: [<other critics, e.g. realtime/hil-harness when HIL measurement exceeded static bound>]
kind: missing_wcet | measurement_only_when_static_possible | missing_loop_bound | cache_or_pipeline_not_modelled | multicore_contention_not_modelled | missing_safety_margin | schedulability_fail | stale_wcet_vs_binary | hil_measurement_exceeds_static_bound | tool_unqualified
task_id: <reference to the offending real-time task>
deadline_microseconds: <integer>
bound_microseconds: <integer or null>
method: static | measurement | hybrid | absent
tool: aiT | LDRA TBwcet | RapiTime | TimingExplorer | OTAWA | custom | none
tool_version: <string or null>
target_file: .ctoc/realtime/wcet/<plan-id>.yaml
target_line: <line in the artifact, if applicable>
message: <one-sentence explanation of the gap>
suggested_fix: <one-sentence remediation>
reference:
  - https://www.absint.com/ait/index.htm
  - https://www.absint.com/timingexplorer/index.htm
  - https://ldra.com/products/tbwcet/
  - https://www.rapitasystems.com/products/rapitime
  - https://www.embedded.com/wcet-analysis-getting-it-right/
```

The integrator uses `confidence` and `corroborated_by` to weight findings — a `confidence: low` single-source finding does not block phase advancement on its own, but corroboration from `realtime/hil-harness` (Hardware-in-the-Loop measurement exceeding the static bound) escalates it. When `method: measurement` is used on a multicore platform, `confidence` defaults to `medium` because measurement-only on multicore is rarely sound without per-core isolation.

## Special considerations

- **Worst-Case Execution Time is not benchmark performance.** A benchmark answers "how fast on average?". A Worst-Case Execution Time answers "how slow is the slowest legal execution?". The two numbers can differ by an order of magnitude. The Iron Loop's `quality/performance-validator` skill speaks the benchmark vocabulary; this skill speaks the deadline-soundness vocabulary. Do not let the two conversations collapse.
- **Static analysis fails open to the analyst, not to the binary.** If the analyser cannot bound a function, it tells the analyst — it does not silently produce a number. The discipline is to read the analyser's "could not bound" messages and either annotate the source or refactor the code, not to ignore them.
- **Compiler-version changes invalidate the bound.** Even patch-level updates to GCC or LLVM change the instruction-selection and scheduling decisions. Pin the compiler version in the build recipe and re-analyse on any update.
- **Optimisation level is a Worst-Case-Execution-Time input, not a free choice.** `-O0` is often easier to analyse but produces worse code; `-O2` produces better code but harder-to-analyse control flow; `-Os` minimises size at the cost of inlining decisions that the analyser must follow. Industrial practice pins `-O2` or a documented per-file mix; the choice is recorded in the artifact.
- **Interrupt blocking and priority inversion belong in the response-time analysis, not in the Worst-Case Execution Time bound.** The Worst-Case Execution Time of a task is the time the task itself takes when nothing pre-empts it. The worst-case response time additionally includes blocking and pre-emption from other tasks. Both are required for schedulability; only the first is what this skill produces.
- **Probabilistic Worst-Case Execution Time analysis is an active research area.** The 2020-2026 literature (Cucu-Grosjean, Davis, and others) treats the Worst-Case Execution Time as a distribution with a stated exceedance probability. Industrial regulators have not yet adopted the probabilistic framing for RTCA DO-178C Level A or ISO 26262 Automotive Safety Integrity Level D; the deterministic bound remains the assurance currency. CTOC tracks the literature but does not yet expect probabilistic Worst-Case Execution Time evidence by default.

---

## Refinement Loop — critic mode

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the warnings-are-critical rule:

- Every missing Worst-Case Execution Time, measurement-only-when-static-possible, missing-loop-bound, cache-or-pipeline-not-modelled, multicore-contention-not-modelled, missing-safety-margin, schedulability-fail, stale-binary, Hardware-in-the-Loop-contradiction, and tool-unqualified finding emits as `severity: critical` in the letter you write to CTO Chief.
- The letter schema rejects `warn` — there is no soft tier.
- Worst-Case Execution Time findings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section. A waiver requires a citation to either an upper-bound proof, a Hardware-in-the-Loop measurement with documented safety margin, or a customer-accepted residual-risk statement signed at Gate 3.

The principle: a missing or unsound Worst-Case Execution Time today is the deadline miss tomorrow. Code that ships into a hard-real-time deadline without a documented, citation-backed upper bound ships with a known timing-safety gap.

## References

- AbsInt aiT Worst-Case Execution Time Analyzer — https://www.absint.com/ait/index.htm
- AbsInt TimingExplorer and TimeWeaver (multicore extension) — https://www.absint.com/timingexplorer/index.htm
- LDRA TBwcet — https://ldra.com/products/tbwcet/
- Rapita Systems RapiTime — https://www.rapitasystems.com/products/rapitime
- Embedded.com — Worst-Case Execution Time analysis: getting it right — https://www.embedded.com/wcet-analysis-getting-it-right/
- OTAWA (open-source Worst-Case Execution Time analyser) — https://www.otawa.fr/
- ISO 26262 Part 6 (software) and Part 8 (supporting processes, Tool Confidence Level) — see AUTOSAR ISO 26262 guide at https://autosar.io/en/insights/iso26262-guide
- RTCA DO-178C and DO-330 (Tool Qualification) — see LDRA DO-178C verification white paper at https://ldra.com/wp-content/uploads/ldra/DO-178C_WhitePaper_v3.0.pdf
