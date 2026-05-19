# Tool Qualification Records

International Organization for Standardization 26262 section 8 clause 11 (and the parallel requirement in RTCA DO-178C / DO-330) requires that every software tool used in the development of safety-related systems be classified by its **Tool Confidence Level**. The classification depends on whether the tool can:

- **Inject** a defect into the safety-related artifact (Tool Impact 2), or
- **Fail to detect** a defect (Tool Impact 1)

…and on the level of confidence in the tool's correctness based on prior use, qualification status, or restriction to a specific use case (Tool error Detection 1, 2, or 3).

| Tool Impact | Tool error Detection | Tool Confidence Level |
|---|---|---|
| TI1 (no injection) | any | TCL 1 |
| TI2 (can inject) | TD1 (high confidence detection) | TCL 1 |
| TI2 | TD2 (medium confidence) | TCL 2 |
| TI2 | TD3 (low confidence) | TCL 3 |

TCL 2 and TCL 3 tools require formal qualification evidence before being used on Automotive Safety Integrity Level B and above (or DO-178C Level B and above).

This directory holds one YAML per tool the project depends on. Activated when the `tool_qualification` control is enabled by the active regulatory regime.

## Required files

When `tool_qualification` is on, the following tools must have qualification records:

- The Claude model used for code generation (`claude-opus-4-7.yaml`, etc.)
- The static-application-security-testing scanner
- Each linter
- Each type-checker
- Each test runner
- The continuous-integration runner
- The deployment tooling

A new tool added to the pipeline triggers a Step 9 PREPARE block until its qualification record exists.

## Schema

See `_template.yaml`.

## References

- [Parasoft — Achieving Functional Safety Automotive ISO 26262 ASIL](https://alm.parasoft.com/hubfs/whitepaper-Achieving-Functional-Safety-Automotive-ISO-26262-ASIL.pdf)
- [QA Systems — ISO 26262 testing best practices](https://www.qa-systems.com/blog/iso-26262-testing-best-practices/)
- [Parasoft — Requirements Traceability Matrix for DO-178C](https://www.parasoft.com/learning-center/do-178c/requirements-traceability/)
