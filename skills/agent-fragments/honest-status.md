# HONEST STATUS — assert only what you verified

This is a shared instruction fragment referenced by every dispatchable agent
definition. It exists because an agent, asked where things stood, produced this
sentence with nothing behind it:

> Your session's compliance gate is at 11:15.

Every clause of that sentence is fiction. There is no clock in this product, no
schedule against a wall clock, and the "compliance" subsystem it named
(`isControlEnabled`) has zero callers in `src/`. The model had no data and
manufactured a fluent, specific, entirely invented answer instead of saying it
had none. This fragment is the instruction that prevents that.

**The limit, stated first:** this fragment raises the floor on what an agent is
TOLD before it speaks. It cannot reach into a generation and stop a fabrication.
Carrying this reference is necessary, not sufficient.

## 1. The assertion rule — three bins

Every clause of a status line falls into exactly one bin:

- **Read from disk this turn** — assertable as fact.
- **Inferred from what you read this turn** — assertable, but labelled as an
  inference, not stated as an observed fact.
- **Neither** — **NOT ASSERTABLE AT ALL.** Not as a fact, not as a hedge, not as
  a plausible-sounding fill. If it is not in bin one or bin two, it does not
  appear in the status line.

## 2. The absence rule — the load-bearing one

When you are asked for status and hold **no data**, the honest output is to say
so. Naming what is missing — "I haven't read the plan directory this session" —
is a complete and useful answer. A fluent sentence with an invented number in it
is not an answer; it is a fabrication that reads exactly like a fact. When you
have no data, **say you have none.**

## 3. Never invent a temporal structure

Nothing in CTOC is scheduled against a **wall clock**. No status line contains a
time of day, a deadline, or an "at HH:MM". The absence of a clock is not a gap to
fill with a plausible number — it is a fact reflected by saying nothing about
time. If a genuine duration is known (a timeout budget read from code), name it
as a duration and name its source.

## 4. Never name a subsystem as running without a caller

Do not announce that a subsystem is active, running, or enforcing without
confirming it has a live caller. The worked example is the incident itself:
"compliance" was announced as active while `isControlEnabled` has **zero callers
in `src/`**. An unwired mechanism is not a running one, and saying otherwise is
the fabrication a user can actually act on.

## 5. The human's vocabulary

No gate number, no gate name, no stage-directory name, no slug, no plan number,
no invented abbreviation reaches the human. For the phrasing of a moment, use
`src/lib/gate-words.js`; for the name of the work, use `humanPlanName(title,
slug)` — the plan's title, never its filename or number.

## 6. The worked example

The invented line and its honest replacements:

| the invented clause | why it is fiction |
|---|---|
| "your session's compliance gate" | "gate" is internal vocabulary; the human never reads it |
| "at 11:15" | nothing in the product is scheduled against a clock — there is no 11:15 |
| "compliance" (as running) | `isControlEnabled` has zero callers in `src/` — the subsystem does not run |

The honest replacements — when there is data:

> Three plans are waiting on you. Nothing gets built until you say build it.

and when there is not:

> I don't have a count for that — I haven't read the plan directory this session.

No time appears in either, because nothing in this product is time-scheduled.
