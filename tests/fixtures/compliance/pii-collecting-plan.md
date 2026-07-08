---
title: "Growth analytics onboarding funnel"
type: functional
program: acme-web
---

# Growth analytics onboarding funnel

## Goal

Instrument the new-user onboarding funnel so the growth team can see where
prospects drop off, and attribute conversions to acquisition channels.

## What we collect

During signup and first-session we persist the following personal data to our
analytics store:

- `email` — captured on the signup form, used as the primary contact and join key.
- `ipAddress` — captured server-side on every request for geolocation and fraud
  scoring. (An online identifier: personal data per GDPR Recital 30.)

Both fields are written directly into the `events` table alongside a raw
`user_agent` string.

## How it flows

1. The signup form posts `email` to `/api/signup`.
2. A US-hosted analytics SDK (Segment) is initialised at page load and begins
   sending pageview + identify events — including `ipAddress` and `email` — to
   `https://api.segment.io`, a **non-EU (United States) endpoint**, before the
   user has taken any action.
3. There is **no consent banner** gating the analytics SDK — it fires on load.
4. There is **no notice at the point of collection** describing the purposes or
   the recipients of the data (no privacy notice surfaced at signup).
5. There is **no documented Standard Contractual Clauses / Data Privacy
   Framework basis** for the transfer of `email` / `ipAddress` to the US
   processor.

## Out of scope

Deletion / erasure workflow is handled elsewhere and not part of this plan.

## Regulatory notes (for the compliance reviewer)

This plan is expected to trigger GDPR findings: lawful basis and information
duties for the collection of `email` and `ipAddress` (Articles 6, 13, 17), a
missing consent gate for the analytics cookies/SDK (Article 7 conditions for
consent), a missing information-at-collection notice (Article 13), and a
non-EU transfer without an appropriate safeguard (Chapter V — international
transfers). See `fixture-manifest.yaml` for the tracked finding kinds.
