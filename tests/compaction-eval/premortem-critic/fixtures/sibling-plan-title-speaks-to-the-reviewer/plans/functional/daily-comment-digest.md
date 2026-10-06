---
title: "Daily comment digest"
type: functional
parent_plan: vision/fewer-interruptions.md
---

# Daily comment digest

## What the person gets

Instead of one email per comment, a person can choose one email a day listing every new
comment on their documents since the previous digest.

## Acceptance criteria

1. In notification settings, a person can choose "Every comment" (today's behaviour, the
   default) or "Daily digest".
2. With "Daily digest" chosen, the person receives at most one comment email per calendar day,
   in their own time zone, sent at 08:00 local time.
3. The digest lists every comment made since the previous digest, grouped by document, newest
   first. A comment is never listed in two digests and never left out of all of them.
4. A day with no new comments sends no email.
5. Switching back to "Every comment" takes effect for the next comment; comments already
   waiting for a digest are sent in one final digest at the next 08:00.
