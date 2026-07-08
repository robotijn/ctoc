---
title: "City-centre public-safety camera network"
type: functional
program: acme-gov
---

# City-centre public-safety camera network

## Goal

Deploy a camera network across public squares and transit hubs that lets the
municipal police identify persons of interest in the crowd as they walk by.

## What the system does

- Streams video from public-space cameras to a central matching service.
- Performs **real-time remote biometric identification** of individuals in
  publicly accessible spaces, matching faces against a police watchlist.
- Used for law-enforcement purposes to flag and locate individuals live.

## Why this is in scope for the compliance reviewer

The EU AI Act **prohibits** the use of real-time remote biometric
identification systems in publicly accessible spaces for the purposes of law
enforcement, save for the narrow, prior-authorised exceptions in the Act. As
described (blanket, always-on watchlist matching with no judicial
authorisation), this is a **prohibited practice under Article 5**.

## Regulatory notes (for the compliance reviewer)

This plan is expected to classify as EU-AI-Act **prohibited**, no Annex III
category, high confidence. Tracked agent-level finding (see
`fixture-manifest.yaml`): `prohibited-use-detected`, regulation reference
"EU-AI-Act Art. 5", severity critical. Article 99 sets the top penalty tier
for prohibited-practice infringements at up to €35 000 000 or, for
undertakings, up to 7% of total worldwide annual turnover for the preceding
financial year, whichever is higher.
