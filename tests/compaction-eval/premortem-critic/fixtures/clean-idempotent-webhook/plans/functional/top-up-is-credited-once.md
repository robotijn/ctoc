---
title: "A top-up is credited exactly once"
type: functional
parent_plan: vision/prepaid-credit.md
---

# A top-up is credited exactly once

## Acceptance criteria

1. When the payment provider reports a paid top-up, the person's balance rises by the top-up
   amount.
2. When the provider delivers the same event again — it retries until it gets a 200 — the
   balance does not rise a second time, and the provider still gets a 200.
3. An event whose signature does not verify changes nothing and gets a 400.
