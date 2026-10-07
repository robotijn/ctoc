The reverts are real, and the cause is in CTOC, not in the plans. Version 6.14.60 changed how the approval fingerprint is computed. It did not record which method made a fingerprint, and it did not migrate fingerprints already stored in other people's projects. Every pushed version from 6.14.60 to 6.14.92 does this. Of the 137 reverts, 131 come from that change. The other 6 have different causes: 5 plans were really edited after approval, and 1 is a duplicate plan.

## 1. Reproduction (ran it)

I made a copy-on-write clone of `a user project/plans` and `a user project/.ctoc`, 470 plans in all, under `scratchpad/revert-check/a user project`. I classified every plan with the hook's own `checkFolder` and `gate-migration.partitionViolations` from HEAD, moving nothing:
- 147 violations. 10 are held back as "no ledger entry", because the project was never migrated.
- 137 would revert: 136 in `done/` with "hash-mismatch", and 1 in `done/` with "wrong-edge".

I then ran the real hook once on a second clone (`a user project2`). It moved 136 plans: `done/` went from 309 to 173 and `review/` from 63 to 199.
- **One correction to the brief:** the wrong-edge plan did not move. The collision guard in `revertPlan` (`human-gate-check.js` around line 306) refused it, because a plan with the same name already sits in `review/`. The hook printed "Revert sweep INCOMPLETE".

## 2. Why the fingerprints no longer match

All 136 fingerprint entries are `hash_scope: "specification"`. Every one of those plans has a `## Deferred Questions` section.

For the 131, I computed each fingerprint three ways: with today's code, with 6.14.59, and with 6.13.19, using scratch checkouts of the old commits. Each matched 6.14.59 and 6.13.19 exactly, and never today's code. So the plan files did not change; the fingerprint method did. Three examples:

| Plan (`done/`) | Recorded | HEAD (6.14.92) | 6.14.59 |
|---|---|---|---|
| …-a-populated-company-for-every-walk-and-nothing-left-behind | `8fcf6599…` | `b7d3314a…` | `8fcf6599…` |
| …-every-page-in-four-languages-… | `eac56815…` | `5b2e1dfb…` | `eac56815…` |
| …-the-chat-page-every-button-and-field | `7bfec40a…` | `ed640379…` | `7bfec40a…` |

**The commit that changed it** is `df8ab9b4` (v6.14.60, 2026-09-03), "the exempt table gains its seventh row by the human's ruling". It added `deferred questions` to the list of excluded sections in `EXECUTION_SECTION_PRODUCERS` (`src/lib/approval-ledger.js:298`). Any plan with that section now gets a different fingerprint than it got before.

That commit's own comment says the change moved 35 fingerprints and re-recorded them, but only in the CTOC repository itself. Nothing ships that migration to user projects.

I compared the fingerprint method across 6.12.92, 6.13.19, 6.14.59, 6.14.60 and HEAD on all 470 a user project plans:
- 292 plans get the same fingerprint in every version.
- 178 plans get a different fingerprint from 6.14.60 on.
- So the method changed exactly once, at 6.14.60.

Line endings and headings are not involved; nothing else changed.

**The other 6 (checked against a user project's git history, read only):**
- **5 were really edited after approval.** a user project commit `1e6bd01c` (2026-09-24, "Ninety-four wrong paths corrected") changed their `files:` lists and added a `## Paths corrected` section. Each fingerprint matched the plan as it was before that edit. Reverting these is the check working as designed.
- **1 is a duplicate plan.** The "what-you-have-given … s4" plan exists in both `done/` and `review/`. The ledger keeps one entry per plan name. Re-approving the rewritten copy into `todo` on 2026-09-29 replaced its earlier `done` entry, so the copy in `done/` now points at the wrong step.

## 3. Which CTOC version wrote the entries

The entries carry no version field, only `hash_scope`. Matching each entry against the two fingerprint methods shows a user project switched between CTOC versions:
- **Entries dated 2026-09-24, 25 and 29:** written by a version older than 6.14.60, almost all 6.13.19. a user project's own override reasons and commit `24c2e88a` name "CTOC 6.13.19".
- **29 entries dated 2026-09-23:** match only the 6.14.60-and-later method.
- **The reverse problem also exists:** run under 6.14.59, the same copy reverts 43 plans, the ones whose entries came from the newer method.

Reverting starts with 6.14.60 and continues through HEAD. Running 6.14.60's own hook on the copy gives the same 137.

## 4. Has this hit real users?

- **Shipped, yes.** In 6.14.60, `human-gate-check.js` is registered as a hook that runs before every tool call (`.claude-plugin/hooks.json`). The local record of pushes shows 6.14.60 pushed to `origin/main` at 2026-09-03 11:57:04. It was then commit `cf2e1348`; the same change is `df8ab9b4` after a later history rewrite.
- **Who it hits:** any user whose fingerprints came from 6.12.92 through 6.14.59, for plans in `todo/` or `done/` that have a Deferred Questions section, on the first tool call after updating.
- **Not every plan has the section.** In a user project, 178 of 470 do.
- **A fingerprint mismatch is never held back**, even in an unmigrated project, so these always revert.
- **What I could not check:** whether any user other than the owner actually had such entries. I have no data on that.
- **a user project itself shows no sign of having been hit yet:** `a user project/.ctoc/logs/gate-violations.json` does not exist. The installed versions found are 6.14.65, 6.14.67 and 6.14.91, all affected.

## 5. Smallest correct fix (not applied)

The fix belongs in `contentMatches` in `src/lib/approval-ledger.js` (line 607), the single check that both `verify` and `classifyResidency` call:

1. **Make the excluded-section list a parameter of `computeSpecHashWith`** (line 427), which today only adds exclusions. Add one frozen older table, the first six rows, which was the method from 6.12.92 to 6.14.59.
2. **Try both methods for entries without a version.** For an entry with `hash_scope: 'specification'` and no version, try today's method first, then the older one. This adds no way to fake an approval: the older method excludes less, so the bytes it covers include everything today's method covers. A match under it binds at least as tightly.
3. **Stamp new entries with a method version.** In `resolveHash` (line 643), record a version alongside the fingerprint, for example `spec_version: 2`. `contentMatches` then accepts only that method for stamped entries. The next change to the excluded-section list then cannot repeat this.

What I checked of the fix: I imitated step 2 in a script using 6.14.59's function. The 131 plans then match, leaving 6 reverts: the 5 genuine edits and the 1 duplicate. That was an imitation; the patched code was never run. The fix also needs one test built from a real older entry for a plan with a Deferred Questions section.

## What I verified by running, and what I did not

**Ran:** the classification, the real hook on a throwaway clone, all fingerprint comparisons, the five-version comparison of the fingerprint method, and the 6.14.59 and 6.14.60 classifications.

**Only read:** the push time (from the local record of pushes), the hook registration, and a user project's git history.

**Not verified:** whether anyone outside the owner was affected, and the patched code itself.

**Cleanup:** I removed my four worktrees with `git worktree remove --force`. About 75 other worktrees from the earlier performance measurement are still registered under `scratchpad/perf-history/`; I did not touch them. No file in the CTOC repository or in a user project was changed.

Files:
- <home>/Code/ctoc/src/lib/approval-ledger.js
- <home>/Code/ctoc/src/lib/approval-residency.js
- <home>/Code/ctoc/src/hooks/human-gate-check.js
- <temporary folder> (the clones, the scripts, and `revert-head.json`, which lists all 137)
