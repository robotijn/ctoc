# Real-time and Timing

> Cluster 6 of the CTOC cross-industry critique. Three load-bearing controls
> for any project that ships into a real-time, safety-relevant, or
> regulator-time-stamped role.

CTOC's lean default treats time as opaque: a wall clock that produces ISO 8601
strings, plus a monotonic counter for relative measurements. That is sufficient
for general developer tooling. It is **not** sufficient when the project
ships into:

- A hard-real-time safety-relevant role where deadlines are guaranteed, not
  hoped for. Examples: anti-lock braking on a passenger car, the flight-control
  loop of an autopilot, the safety-instrumented function of a chemical plant,
  a medical infusion-pump controller.
- A regulator-time-stamped role where transactions must be ordered against a
  reference clock with documented divergence. Example: every order, quote,
  modification, cancellation, and execution under the European Markets in
  Financial Instruments Directive II Regulatory Technical Standard 25.

For those projects the three Cluster 6 controls turn implicit assumptions into
explicit, auditable evidence:

| Control | What it documents | Activated by |
|---|---|---|
| `wcet_budget` | Worst-Case Execution Time bound per real-time task, with tool reference | `iso-26262-asil-d`, `do-178c-level-a`, `iec-61508-sil-3` |
| `hil_test_ladder` | Per-function verification evidence at Model / Software / Processor / Hardware-in-the-Loop rungs | `iso-26262-asil-d`, `do-178c-level-a`, `iec-61508-sil-3` |
| `precision_time_protocol` | Sub-100-microsecond clock provenance on every dispatch | `mifid-ii` |

Each control activates only when the corresponding regulatory regime profile is
active in `.ctoc/settings.yaml`. None of them are on by default; CTOC stays
lean for the projects that do not need them.

## Worst-Case Execution Time (`wcet_budget`)

The Worst-Case Execution Time is the tightest provable upper bound on the time
a task can take to complete on the target hardware under any legal input or
interrupt pattern. It is *not* a benchmark average and it is *not* a measured
maximum from a representative input set — it is a value that no execution path
can exceed.

The skill at [`skills/realtime/wcet-budget/SKILL.md`](../skills/realtime/wcet-budget/SKILL.md)
implements the analysis discipline. The skill is dispatched when the
`wcet_budget` control is active or when a plan declares `realtime: true`. It
expects per-task budgets and produces a per-plan artifact at
`.ctoc/realtime/wcet/<plan-id>.yaml`.

### The three analysis families

| Family | Soundness | Tightness | Tools |
|---|---|---|---|
| **Static analysis** (sound, abstract-interpretation) | High — never underestimates | Often pessimistic; the analyst feeds annotations to reduce pessimism | [AbsInt aiT](https://www.absint.com/ait/index.htm), LDRA TBwcet |
| **Measurement-based analysis** | Conditional — sound only if path coverage is complete | Tight against the observed inputs | [Rapita Systems RapiTime](https://www.rapitasystems.com/products/rapitime) |
| **Hybrid analysis** | High when the static net catches what measurement missed | Better than pure static | [AbsInt TimingExplorer / TimeWeaver](https://www.absint.com/timingexplorer/index.htm) (multicore), LDRA TBwcet hybrid mode |

Industrial practice in safety-critical programmes is hybrid: static for the
sound upper bound, measurement on the target for corroboration, an explicit
safety margin to absorb hardware revisions and compiler-version drift, and
finally Hardware-in-the-Loop verification against worst-case input vectors.

### Multicore changes the question

On a single core the Worst-Case Execution Time depends on the task's
instruction stream and the local microarchitectural state. On a multicore
platform it additionally depends on contention for the shared last-level
cache, the shared memory bus, the shared interconnect, and shared peripheral
channels. Without **Robust Time Partitioning** — CPU pinning, cache colouring
or partitioning, memory-bandwidth budgets, and per-core interrupt steering —
no per-task bound on a multicore platform is portable across run-time
conditions. The skill enforces this by emitting `kind:
multicore_contention_not_modelled` whenever a multicore plan claims a bound
without a documented contention model.

### Underestimation is the cardinal sin

A safe over-estimate causes schedulability rejection — fixable in the planning
phase. An underestimate causes a deadline miss in flight — not fixable after
the binary has landed in a deployed unit. The skill defaults `confidence:
medium` for measurement-only bounds on multicore and reads any contradiction
between the static bound and a Hardware-in-the-Loop measurement
(`kind: hil_measurement_exceeds_static_bound`) as a `severity: critical`
finding per the warnings-are-bugs rule.

### Sources

- AbsInt aiT — https://www.absint.com/ait/index.htm
- AbsInt TimingExplorer / TimeWeaver — https://www.absint.com/timingexplorer/index.htm
- LDRA TBwcet — https://ldra.com/products/tbwcet/
- Rapita Systems RapiTime — https://www.rapitasystems.com/products/rapitime
- Embedded.com WCET analysis: getting it right — https://www.embedded.com/wcet-analysis-getting-it-right/
- OTAWA (open-source Worst-Case Execution Time analyser) — https://www.otawa.fr/

## Hardware-in-the-Loop test ladder (`hil_test_ladder`)

Hardware-in-the-Loop is the top rung of a four-rung verification ladder that
mirrors the V-model. Each rung is named by what is "in the loop" — the
simulated quantity is everything else.

| Rung | What is real | What is simulated | Catches |
|---|---|---|---|
| Model-in-the-Loop | The algorithmic model (Simulink, Stateflow, SCADE) | Plant, sensors, actuators, model host | Requirement-versus-model defects |
| Software-in-the-Loop | The source code on the host PC | Plant, target processor | Model-versus-code defects |
| Processor-in-the-Loop | Cross-compiled object code on target processor | Plant, peripherals | Host-versus-target compiler defects |
| Hardware-in-the-Loop | Full electronic control unit + wiring loom + real input-output | Plant only (real-time simulator) | Integration, timing, fault-response, electrical defects |

The skill at [`skills/realtime/hil-harness/SKILL.md`](../skills/realtime/hil-harness/SKILL.md)
selects the appropriate rung for each safety-relevant function, records the
evidence in `.ctoc/realtime/hil-ladder/<plan-id>.yaml`, and treats any missing
rung as a documented assurance gap with a written rationale — never as
silence.

### Skipping a rung

Skipping a rung is permissible but never silent. A pilot project on a
non-safety prototype may legitimately go from Model-in-the-Loop straight to
a bench Hardware-in-the-Loop, skipping the middle two rungs. The discipline
is to record the skip and the reasoning:

> "Software-in-the-Loop skipped because the target compiler is generation-stable
> for this architecture and Processor-in-the-Loop will catch any deviation."

When the active regulatory regime declares `hil_test_ladder`, the absence of
Hardware-in-the-Loop evidence at Step 14 (VERIFY) is a `severity: critical`
finding. There is no "the unit tests are enough" override for safety-certifiable
functions; unit tests live at Software-in-the-Loop and below and cannot
exercise integration, timing under load, electrical effects, or fault-response.

### Fault injection lives at Hardware-in-the-Loop

Stuck-at, bit-flip, broken-wire, sensor-drift, brown-out, electromagnetic-
interference, and timing-jitter faults need a real input stage to inject.
ISO 26262 Part 4 requires fault-injection testing for Automotive Safety
Integrity Level C and D; RTCA DO-178C requires robustness testing at Level A
and B. The skill derives Hardware-in-the-Loop scenarios directly from the
companion Failure Modes Effects and Diagnostic Analysis at
`.ctoc/safety/fmeda/<plan-id>.yaml`: every dangerous-undetected and
dangerous-detected failure mode becomes at least one Hardware-in-the-Loop
scenario, or the skill emits `kind: fault_injection_gap`.

### Hardware-in-the-Loop rigs need their own qualification

A test bench that injects wrong values into the device under test produces
wrong evidence. The simulator's plant model, the input-output board
calibration, the wiring loom, and the fault-injection switches each need a
qualification record. ISO 26262 Part 8 Clause 11 (Tool Confidence Level for
the test environment) and RTCA DO-330 (Tool Qualification) apply to the test
bench as much as to the development tools. The skill emits
`kind: rig_not_qualified` when the qualification record is missing or
expired.

### Sources

- SRM Tech Hardware-in-the-Loop testing comprehensive guide — https://www.srmtech.com/knowledge-base/blog/hardware-in-the-loop-hil-testing-a-comprehensive-guide/
- dSPACE Hardware-in-the-Loop simulators — https://www.dspace.com/en/pub/home/products/hw/simulator_hardware.cfm
- NI VeriStand and PXI — https://www.ni.com/en/shop/electronic-test-instrumentation/hardware-in-the-loop-products.html
- Speedgoat real-time target machines — https://www.speedgoat.com/products/real-time-target-machines
- ETAS LABCAR — https://www.etas.com/en/products/labcar.php
- Opal-RT real-time simulators — https://www.opal-rt.com/
- MathWorks Simulink Test — https://www.mathworks.com/products/simulink-test.html

## Precision Time Protocol on the audit log (`precision_time_protocol`)

The Markets in Financial Instruments Directive II Regulatory Technical
Standard 25 requires that participants in markets where high-frequency
algorithmic trading occurs hold their business clocks within one hundred
microseconds of Coordinated Universal Time. Network Time Protocol over
ordinary Internet topology cannot reliably meet that bound; IEEE 1588
Precision Time Protocol, ideally with hardware timestamping on the network
interface card and a Grandmaster clock on the local segment, can.

CTOC does not itself trade or quote, but a CTOC-managed system might. When the
`mifid-ii` profile is active, the `precision_time_protocol` control activates
and every dispatch written to the audit chain carries clock provenance.

### Schema

`.ctoc/audit/clock-source.yaml` declares the project's posture:

```yaml
profile: best-effort | ntp | ptp
max_tolerated_drift_microseconds: <integer>
verification_command: <one-line shell command>
last_verified: <ISO 8601>
notes: |
  <free-form rationale>
```

Profiles:

| Profile | Meaning | Acceptable when |
|---|---|---|
| `best-effort` | No synchronisation requirement; dispatches carry the system clock value for forensic completeness | The project is not regulated and is not safety-relevant |
| `ntp` | Network Time Protocol must be active; drift below the declared tolerance | E-commerce, general operational logging, finance below Regulatory Technical Standard 25 scope |
| `ptp` | IEEE 1588 Precision Time Protocol is required; the local chrony / equivalent must show a Precision-Time-Protocol-backed reference identifier and drift below the tolerance | Any system within Markets in Financial Instruments Directive II Regulatory Technical Standard 25 scope |

### Runtime probe

[`src/lib/time-source.js`](../src/lib/time-source.js) exposes:

```javascript
const { currentTimeSource, recordIntoDispatch } = require('./src/lib/time-source');
const ts = currentTimeSource();
// ts === { wall_clock_iso, monotonic_ns, source, last_known_drift_ms, ... }
```

The library invokes `chronyc tracking` on Linux, `systemsetup` on macOS, and
`w32tm /query /status` on Windows, all behind try / catch with sensible
fallbacks. A failed probe produces `source: 'unknown'` and does not throw.

The audit-chain dispatch writer calls `recordIntoDispatch(dispatch)` before
appending, so every audit entry carries a `time_source` field of the same
shape. This satisfies the auditability half of Regulatory Technical Standard
25 — for any historical dispatch the regulator can establish which clock
produced the timestamp and what the operator knew about that clock's drift.

### Enforcement boundary

The library records the posture; it does not by itself enforce the bound.
A separate Iron Loop check (the integrator, or a Tier-2 skill dispatched at
Step 14) reads the latest probe alongside the declared posture and emits a
`severity: critical` finding when:

- `profile: ptp` but probe `source` is `ntp`, `system`, or `unknown`.
- `profile: ntp` but probe `source` is `system` or `unknown`.
- `last_known_drift_ms * 1000 > max_tolerated_drift_microseconds`.

The `evaluateComplianceAgainstPosture(projectRoot)` helper exported by the
library returns the verdict in a small structured object for the integrator
to consume.

### Why Network Time Protocol is insufficient at sub-100-microsecond bounds

Network Time Protocol's accuracy is dominated by asymmetric path delays:
the request leg and the reply leg between client and server can take
different routes and different times, and Network Time Protocol has no
mechanism to detect or correct the asymmetry. The Red Hat reference on
Markets in Financial Instruments Directive II Regulatory Technical Standard
25 notes that ordinary Network Time Protocol struggles to hold the
millisecond bound on cloud or hyperscaler topologies, let alone the
hundred-microsecond bound that Regulatory Technical Standard 25 demands.
Precision Time Protocol corrects the asymmetry by exchanging timestamped
follow-up messages and (with hardware timestamping) by stamping at the
network interface card rather than in user space.

### Sources

- Markets in Financial Instruments Directive II Regulatory Technical Standard
  25, Red Hat reference — https://www.redhat.com/en/blog/mifid-ii-rts-25-and-time-synchronisation-red-hat-enterprise-linux-and-red-hat-virtualization
- Pico / Corvil MiFID II clock synchronisation ebook — https://www.pico.net/assets/resources/documents/ebook-mifid-ii-clock-synchronization-rts-25.pdf
- Linux PTP project (ptp4l, the canonical user-space PTP daemon) — https://linuxptp.sourceforge.net/
- chrony (recommended Network Time Protocol daemon on Red Hat Enterprise Linux
  with hardware-timestamping support, the path most operators take to
  Precision Time Protocol on commodity servers) — https://chrony-project.org/

## Cross-references to the regulatory regime profiles

The three controls activate via the regulatory regime profiles in
[`.ctoc/regulatory-regimes/`](../.ctoc/regulatory-regimes/):

| Profile | `wcet_budget` | `hil_test_ladder` | `precision_time_protocol` |
|---|---|---|---|
| `iso-26262-asil-d` (Automotive Safety Integrity Level D) | required | required | not required |
| `do-178c-level-a` (Airborne software Design Assurance Level A) | required | required | not required |
| `iec-62304-class-c` (Medical device Class C) | not required by the profile itself | not required by the profile itself | not required |
| `iec-61508-sil-3` (Industrial Safety Integrity Level 3) | not in the current profile (consider adding for time-critical Safety Instrumented Functions) | required | not required |
| `mifid-ii` (Financial trading) | not required | not required | required |

Multiple profiles can be stacked; controls are union-merged. A project that
stacks `iso-26262-asil-d` and `mifid-ii` (uncommon but possible — a
connected-vehicle telematics platform that reports financial events) would
have all three Cluster 6 controls active simultaneously.

## When Cluster 6 does not apply

The lean default is no Cluster 6. A typical SaaS project — a web app, a
content site, an internal tool, a developer-experience product — does not need
any of these controls. The dispatch records still carry a `time_source` field
of the same shape (with `source: 'system'`) so the audit log schema is
uniform, but no compliance bound is enforced and no Worst-Case Execution Time
or Hardware-in-the-Loop artifact is required.

The decision to opt in is the human gate-zero decision. If a project's domain
review concludes that the failure mode is "a deadline miss kills a person"
or "a clock drift causes a regulator fine", the operator activates the
matching profile in `.ctoc/settings.yaml`, and Cluster 6 turns on with it.
