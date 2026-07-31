# PLAIN GATE WORDS — never emit a gate number to a human

This is a shared instruction fragment referenced by every dispatchable agent that
produces text a person reads — a completion report, an inbox notice, a decision
question, a status line. It exists because CTOC's own instruction surfaces told the
session model to report a gate by its NUMBER:

> STOP at any human gate reporting "Gate N ready".

The model did exactly as told and handed the owner "Gate 3". A gate number is an
internal code out of CTOC's own documentation; the reader would need a numbered map of
the pipeline in their head to decode it, and being handed one reads as evasive. The
owner has corrected this repeatedly and reacted with real anger each time a bare gate
number reached them. This fragment is the instruction that stops it at the source.

**The limit, stated first:** this fragment raises the floor on what an agent is TOLD
before it speaks. No hook sees a model's prose before the human does, so it cannot
reach into a generation and stop a number from being emitted. Carrying this reference
is necessary, not sufficient.

## 1. The rule

Never put a gate NUMBER in text a human reads — say what the MOMENT IS in plain words.
"Gate 0", "Gate 1", "Gate 2", "Gate 3", "Gate N", "Gate 1/2/3" — none of these appears
in a report, a question, an inbox item, or any status line the owner sees.

## 2. Where the number is still legal

The number is forbidden in exactly ONE place: text a human reads (or an instruction
telling the model to produce such text). It stays entirely legal, and must NOT be
changed, in code identifiers, comments, file formats, directory names, the `--gate N`
command-line flag, `menu task complete … --gate N`, and the `gate-order` /
`isHumanGate` machinery. Changing those would break working code to no benefit. The
distinction is audience: a number a MACHINE consumes stays; a number a PERSON reads goes.

## 3. The phrasing — `src/lib/gate-words.js` is the source of truth

Do not invent a second vocabulary. `src/lib/gate-words.js` is the ONE encoding of the
human-facing phrasing for every gate moment (`moment`, `question`, `chip`,
`approveLabel`). Use it where it fits. The plain-language moments are:

| the moment | say, in plain words |
|---|---|
| an explored idea is approved to become features | your OK to start turning this into features |
| a functional plan is approved for the technical plan | your OK to start the technical plan |
| a technical plan is approved to be built | your OK to start building |
| built work is approved as done | built and waiting for your OK to call it done |

## 4. The name of the work

The same discipline covers every internal code, not only the gate number: no stage
name, no plan slug, no plan number, no invented abbreviation reaches the human. Name
the work by its real subject — the plan's title via `humanPlanName(title, slug)`, never
its filename or number.

## 5. The worked example

The instruction leak and its plain-moment replacement:

| the leaking instruction | the plain-moment rewrite |
|---|---|
| report "Gate N ready" | report that the work is waiting for the human's OK |
| Gate 3 is ready for the human | the built work is waiting for the human's OK to call it done |
| User outcome: Gate 2 — user approves the technical approach | the user gives their OK to start building |
| the plans at Gate 1/2/3 ARE the questions | the plans awaiting your OK ARE the questions |

## 6. When you are unsure

If a line is a description a MACHINE reads (a data field, a CLI flag, a code citation),
leave the number. If it is text a PERSON reads, or an instruction to produce such text,
say the moment. When genuinely unsure whether a mention is human-facing, prefer the
plain-moment wording — a moment stated in words is never wrong for a human, and a
number is never right for one.
