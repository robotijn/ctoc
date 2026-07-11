---
title: "CTOC Self-Audit Remediation: Make the Gates Real"
created: "2026-07-11T00:00:00Z"
priority: HIGH
type: feature
program: ctoc-hardening
---

# Vision: CTOC Self-Audit Remediation — Make the Gates Real

## Problem Statement

A seven-agent adversarial audit of the CTOC plugin (2026-07-11), run through CTOC's
own quality/security fleet with every finding re-verified against the code, found
that **the enforcement-and-gate layer — CTOC's entire reason to exist — is
substantially non-functional, and the 5485-green test suite is a false green that
certifies the broken state.** ESLint is clean, `npm audit` is clean, the suite is
green; these are logic and wiring defects a green suite cannot see. The load-bearing
confirmed defects:

- **Enforcement never blocks.** The PreToolUse hooks signal "block" with
  `process.exit(1)`, but the Claude Code harness only blocks a tool call on
  `exit(2)` ("Exit code 2 — show stderr to model and block tool call", verified from
  the CLI binary). Every plan-coverage block, secret-file block, and
  irreversible-command block prints its message and then the edit proceeds.
- **The Bash gate reads a variable that does not exist** (`process.env.CLAUDE_TOOL_INPUT`;
  the payload is on stdin), so it always sees an empty command and allows everything —
  `rm -rf`, raw `mv` of a plan into `plans/done/`, a commit before Step 15.
- **`MultiEdit` and `NotebookEdit` enforce nothing** — they `require()` Edit.js, whose
  enforcement runs only under `require.main === module`, which is false when the sibling
  is the entry point.
- **`approved_by: human` is self-asserted text in an agent-writable file**, and the
  enforcement whitelist allows any write to `plans/**.md` including `plans/done/`. Nothing
  binds the marker to a human act.
- **One failing revert abandons every remaining revert**, including Gate 3, and exits 0 —
  an unlucky filesystem disables the human gates.
- **19 agent files place an `# H1` before their YAML frontmatter, so the runtime parses
  none of it** — `cto-chief` runs with all tools instead of its declared read-only set,
  and all 5 scouts run on the session model instead of `haiku`. The architecture-invariants
  test reads the ignored YAML with a match-anywhere parser and certifies this green.
- **10 of the 16 Iron Loop steps name an agent that exists nowhere** (`implementer`,
  `test-maker`, `verifier`, `functional-reviewer`, …), and 20 registry `path:` entries
  dangle. `CLAUDE.md`'s own step table points Step 10 IMPLEMENT at a non-existent agent.
- **Gate 3's validator can never return `valid:false`**, the VERIFY runner has zero
  callers, two of three in-progress→review paths skip validation, and the documented
  circuit breaker is implemented nowhere.
- **CRLF checkout locks Windows users out.** The frontmatter parsers require `\n` after
  `---`; on git's default `autocrlf=true` every plan parses as `{}`, so the enforcement
  hook covers nothing and blocks every plan-covered edit.
- **`package.json` self-reports the wrong version (6.9.49 vs 6.10.3) and the wrong
  license (Apache-2.0 vs the actual PolyForm Shield 1.0.0).**

The deeper problem is not any single bug: it is that **the tests assert structure, not
truth** — that a key is present, that a function returns without throwing — instead of
asserting that a pointer resolves, that two sources of truth agree, or that a tool was
actually stopped. So the defects accumulated behind a green suite. The remediation must
fix both the defects and the blind spot that hid them.

## Target Audience — For Whom

- **The CTOC maintainer (the human CTO)**, who relies on the four human gates to keep
  unreviewed work out of `done/` and trusts the green suite as evidence the gates hold.
- **Every CTOC user running with permission prompts disabled**
  (`--dangerously-skip-permissions`), for whom the PreToolUse hooks are the *only*
  guardrail — the exact population the enforcement layer exists to protect.
- **Cross-platform users on Windows**, currently locked out of editing any plan-covered
  file by the CRLF defect.
- **Contributors and license/compliance tooling**, which read `package.json` and are
  currently told the wrong license and version.

## Success Criteria — What Success Looks Like

1. **Enforcement actually blocks.** A PreToolUse deny stops the tool call (exit 2 or the
   JSON `permissionDecision: "deny"` protocol), proven by a test that asserts the tool was
   *prevented*, not that the hook returned a number. Every editing tool (Edit, Write,
   MultiEdit, NotebookEdit) and the Bash gate enforce identically, reading the stdin payload.
2. **Human gates cannot be forged or bypassed.** Approval provenance lives outside the
   agent-writable plan file (a signed/hashed ledger), multi-hop moves cannot skip a gate,
   and a single filesystem error cannot disable the revert of the others.
3. **Every agent contract loads at runtime**, and **every agent named by a step, the
   registry, or the coordinator resolves to a real dispatchable file.**
4. **Gate 3 can fail**, Step 14 VERIFY is actually enforced, every in-progress→review path
   is validated, and the circuit breaker is real.
5. **The test suite goes red on every defect class above** — registry-path resolution,
   step-agent resolution, version/license single-source-of-truth, documented-count
   self-verification, installer-path existence, anchored frontmatter parsing — and coverage
   is actually measured with `0 skipped` treated as failure.
6. **CTOC runs on Windows** — CRLF-safe frontmatter parsing and no POSIX-only shell-outs on
   hot paths.
7. **Enforcement stays on and honest** — it does not self-disable from a subdirectory, does
   not unlock on its own block message, does not edit the maintainer's own `CLAUDE.md`, and
   does not describe itself falsely to the session.
8. **Release metadata is consistent** — VERSION, `package.json`, `plugin.json`,
   `marketplace.json`, and the LICENSE all agree, enforced by an invariant test.
9. **Dead and misleading code is removed**, so the map matches the territory.

Every fix ships through CTOC's own Iron Loop with real tests that fail before the fix and
pass after — dogfooding the pipeline is itself the end-to-end test of whether CTOC works.

## Scope

### In scope — the workstreams (each becomes one functional plan)

1. **Enforcement actually blocks.** PreToolUse deny uses exit 2 / the `permissionDecision`
   protocol; the Bash gate reads stdin; MultiEdit/NotebookEdit delegate to the exported
   `enforce()`. (Findings C1, C2, C3.) *Technical prerequisite: until this lands, the
   other enforcement fixes are unobservable.*
2. **Human-gate integrity.** Approval-provenance ledger outside the plan file with content
   hashing; per-violation isolation in the gate-check revert loop; `move-plan.js` blocks any
   gate-crossing multi-hop move; SIP1 slice plans are exempt from the residency revert;
   atomic stamp-then-move; correct merged-frontmatter parsing after a marker prepend.
   (C4, C5, H2, H7, M18, M19.)
3. **Agent contracts load at runtime.** Move the YAML frontmatter to line 1 in the 19
   heading-first agent files; anchor the invariants-test frontmatter parser to `^---`;
   relocate the `agents/_shared/*` prose fragments out of the auto-discovered agent tree.
   (C6, C7, L5.)
4. **Every dispatched agent resolves.** Create the 10 missing Iron Loop step agents (or
   repoint the step table and registry to the real executors); regenerate
   `operations-registry.yaml` from disk; remove the Tier-1→Tier-1 peer-dispatch instruction.
   (C8, M24, L4.)
5. **Gate 3 verifies real work.** `validateReviewToDone` can return `valid:false`; wire the
   VERIFY runner; route the two validation-skipping in-progress→review paths through
   `validateForReview`; implement the circuit breaker (3/step, 5/plan). (C9.)
6. **The test suite tells the truth.** Kill the skip-guard false-greens; wire coverage
   instrumentation with `0 skipped` = failure; add the cross-file invariant tests (registry
   paths resolve, step agents resolve, version/license single-source, documented counts
   self-verify, installer-written paths exist). (C7, A2, A4, B1–B6.)
7. **Cross-platform correctness.** CRLF-safe frontmatter parsers (`/\r?\n/`); replace
   POSIX-only shell-outs (`2>/dev/null`, `df | tail`) with portable calls; `os.homedir()`
   over `process.env.HOME`. (H1, M13, M22.)
8. **Enforcement stays on and honest.** Escape-phrase matcher scans only recent user
   messages; the project detector walks up to find `.ctoc/`; the SessionStart self-repo
   guard uses `isCtocRepo`; the injected session text describes the real enforcement.
   (H4, H5, H6, L3.)
9. **Release and metadata truth.** `release.js` syncs `package.json`, exits non-zero on any
   sync failure, and writes atomically; fix the `package.json` license; never clobber
   `installed_plugins.json` on a parse error. (H9, M7, M9.)
10. **Menu and task-plane robustness.** A real entry point for `/ctoc:push`; plumb
    `liveAgentIds` so long-running background agents are not falsely orphaned; stop
    re-splitting multi-word task-summary args; guard the menu against an unknown-stage crash
    and path traversal; wire the Settings-screen keys; await the PostToolUse index sync
    before exit. (H3, H8, M6, M8, M11, M12.)
11. **State durability and dead-code removal.** Atomic append-only audit logs; `wx` agent
    lock; raw-settings round-trip that preserves non-schema config; a real queue ordering
    key; delete the 3 dead tab modules, the 7 dead agent-init exports, and the legacy
    one-keystroke gate crossings; fix or remove the broken hooks-installer path.
    (M1, M2, M14, M15, M16, H10, B1, B2, B3, L7, L8, L9.)

### Out of scope — what we are NOT building

- No new product features, agents, or skills beyond what a fix requires.
- No business, pricing, marketing, or product-KPI work (that is the Product Loop, external
  to this technical chain).
- No change that weakens a human gate — every fix strengthens or preserves the four gates.
- No re-architecture of the Iron Loop step model, the tier model, or the plan-stage set;
  we make the code match the documented model, not change the model.

## Dependencies (technical, not a schedule)

Workstream 1 (enforcement actually blocks) is a technical prerequisite for *observing*
workstreams 2 and 8 — until deny actually blocks, a gate-bypass fix cannot be seen to
fire. Workstream 6 (truthful tests) should land alongside each other workstream so each
fix ships with the test that catches its defect class. All other workstreams are
independent and may be sequenced in any order. The build schedule — which workstreams to
implement, and when — is the maintainer's decision, made from this dependency graph at the
gates.
