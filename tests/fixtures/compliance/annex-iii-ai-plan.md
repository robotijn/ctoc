---
title: "Automated candidate ranking for recruiting"
type: functional
program: acme-hr
---

# Automated candidate ranking for recruiting

## Goal

Reduce time-to-hire by automatically screening résumés and ranking candidates
for a hiring decision, so recruiters review only the top of the pile.

## What the system does

- Ingests every inbound job application (PDF/DOCX résumé + structured profile).
- Runs an ML model that scores each applicant against the role.
- Produces an ordered shortlist that materially influences which candidates
  advance to interview — i.e. it is used to make, or to substantially inform, a
  hiring decision.

The phrase that anchors its classification: the system performs **screening
résumés and ranking candidates for a hiring decision**.

## Why this is in scope for the compliance reviewer

Under the EU AI Act, AI systems intended to be used for the recruitment or
selection of natural persons — in particular to screen applications and
evaluate candidates — fall under **Annex III, point 4 (employment, workers
management and access to self-employment)** and are therefore **high-risk**.

## Regulatory notes (for the compliance reviewer)

This plan is expected to classify as EU-AI-Act **high-risk**, Annex III
category **4-employment**, medium confidence. High-risk obligations that the
plan does not yet satisfy (tracked in `fixture-manifest.yaml` as agent-level
metadata): an AI-system inventory entry (Article 11 technical documentation),
the technical documentation package (Article 11 + Annex IV), and a human
oversight measure (Article 14).
