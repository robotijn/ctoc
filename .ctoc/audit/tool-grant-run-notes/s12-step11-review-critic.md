**Verdict: pass.** I found nothing wrong, unsafe or untrue in the changed lines. Three findings follow. None blocks, but the first two are cheap and the third is a decision for the owner. I did not run the tests: my tools are Read and Grep, so the green run is the executor's record (12,100 passed, 0 skipped), not mine.

## Blockers

None. What I checked to say that:

**The nine review-not-build sentences** (the plan's Text R: "the agent reads this file to review, not to build… the executor makes the change at the build step"). In `clerk-auth`, `inngest-jobs`, `posthog-analytics`, `rate-limiting`, `resend-email`, `sentry-errors`, `stripe-subscriptions`, `supabase-data` and `vercel-deploy`:
- Each agent body calls the agent "the standing observer", says "Judge these", and gives no order to build.
- The test file profiles all nine as readers only (`tests/agent-tool-grants.test.js` lines 157–174).
- Write appears in the bodies only conditionally ("any file you write"), so "not to build" forbids nothing a body orders.

**Every added "only" or "never":**
- `product-reviewer` line 349, "reviews only the exports handed to it, and never calls the PostHog or Stripe API itself": matches the agent body, line 62, almost word for word.
- `vercel-deploy` line 41, "Bash is never a way to the web": matches the body, line 30.
- "never writes a 'passes' it did not see" and "never as an instruction": match the shared honest-status rule and the existing web-fact wording.

**Tool claims:**
- "holds no web tool" is true for `posthog-analytics`, `rate-limiting`, `sentry-errors` and `stripe-subscriptions`.
- "holds no command tool" is true for `experiment-designer` and `posthog-analytics`.
- `deepthink-researcher` holds only WebSearch and WebFetch, so "touches no file" is true.

**`product-reviewer`'s method** (your second check) is clean:
- Line 3 now reads "exported from".
- Line 28 has no WebFetch.
- Line 80 says "exported by the team; never call the PostHog API".
- Line 349 says the snippets belong to the team's pipeline.
- Line 354 labels the script "The team's export job, never the reviewer's".
- Nothing left in the file tells the agent to call PostHog or Stripe.

**Tools lines:** all twelve method files now equal their agents' lines, string for string.

**`npx`:** all eight commands read `npx --no -- <package>`. No `@latest` and no bare `npx` remain in `skills/saas` or `skills/product`.

**The new check** (your third check):
- **Pairing is correct.** It reads `target_skill` and `extends_skill` from a frontmatter whose layout the test has already confirmed, adds the agent's own path, and adds the one body-only entry for `gdpr-agent`. I searched every agent body for "read that file in full". Only `gdpr-agent` and `eu-ai-act-agent` name a method file other than their own, and `eu-ai-act-agent`'s is also declared by `extends_skill`. The map is complete today.
- **It fails closed on:**
  - a declared file that does not exist;
  - any read error other than "file not found", with the error code named;
  - a missing frontmatter;
  - zero, two, or a misspelled tools key;
  - an agent whose own grant cannot be read;
  - a value outside letters, digits, hyphens and slashes (so `..` and absolute paths are refused);
  - fewer than 90 pairs. An agent census that fails to load leaves the list empty, so it falls to 0 pairs and fails.
- **The debt ceiling is 2 in both files.** In the main test, lines 319–320, and check 13 asserts the list's size equals its maximum. In the limits file, line 57, the pairing list at line 68, and the first-recorded value of 2 at line 131.
- **No other limit moved.**

**Personal information** (your fifth check): none in the diff.

## Findings about this slice's goal

**1. The two debt entries excuse any mismatch, including a wider one.**

Today `eu-ai-act-agent`'s method file grants `Bash, Read, Grep, Glob` and `gdpr-agent`'s grants `Read, Grep`. If a later edit adds WebFetch to either line, check 13 stays green. The improvement run's slices that hold those two files are already scheduled.

The fix is to pin the excused line. In `tests/agent-tool-grants.test.js`:
- Line 319, old: `const METHOD_TOOLS_DEBT = new Set(['compliance/eu-ai-act-agent', 'compliance/gdpr-agent']);`
  New: `const METHOD_TOOLS_DEBT = new Map([['compliance/eu-ai-act-agent', 'Bash, Read, Grep, Glob'], ['compliance/gdpr-agent', 'Read, Grep']]);`
- Line 1291, old: `if (!debt.has(a.key)) failures.push(`
  New: `if (debt.get(a.key) !== m.line) failures.push(`
- Line 1295, old: `for (const k of debt) {`
  New: `for (const k of debt.keys()) {`
- In check 13.1, the three `new Set([...])` debt fixtures become maps of the form `new Map([['f/x', 'Read']])`.

The limits file reads `.size`, which a Map also has, so it needs no change.

**2. The network paragraph in `vercel-deploy` leaves out the build.**

`skills/saas/vercel-deploy/SKILL.md` line 41 lists "the Vercel command-line tool, package installs, requests to the deployed product or to a deploy hook". The file also runs `ANALYZE=true pnpm build` at lines 284 and 549. A Next.js build sends usage data to Vercel and downloads Google fonts by default (I believe this from memory; I did not check it this session). The sentence "The agent runs none of them" covers the build only on a strict reading.
- Old: `— the Vercel command-line tool, package installs, requests to the deployed product or to a deploy hook —`
- New: `— the Vercel command-line tool, package installs, the build, requests to the deployed product or to a deploy hook —`

**3. Not pinning the added sentences is a real gap. This is the owner's call, because the approved plan chose not to pin them (decision 8).**

The improvement run declares these same method files, so a rewrite of them is already planned. If that rewrite drops these sentences, nothing fails, and the method file again contradicts its agent. Which sentences matter:
- **Pin:**
  - `product-reviewer` line 349, the sentence "The `product-reviewer` agent runs none of them: it reviews only the exports handed to it, and never calls the PostHog or Stripe API itself."
  - `product-reviewer` line 80, the comment "exported by the team; never call the PostHog API".
  - `vercel-deploy` line 41, the whole network paragraph.
  - The web-fact paragraph in `sentry-errors` (line 57) and in `stripe-subscriptions` (line 43). Both agents hold Bash and their bodies carry no web ban, so this method sentence is the only thing steering a documentation check away from `curl`.
- **No pin needed for safety:**
  - The web-fact paragraphs in `posthog-analytics` and `rate-limiting`, and the command paragraphs in `experiment-designer` and `posthog-analytics`. Claude Code (the program that runs the agents) withholds those tools from these agents, so a rewritten order fails visibly rather than doing harm.
  - The nine review-not-build sentences. They affect what slice 11 measures, not safety.

## Backlog

- In the nine method files, the review-not-build sentence follows an opening still written for a builder ("You implement Clerk auth correctly", "Your job is to put the right limit…"). Each paragraph now holds two contradicting sentences.
- `npx --no -- @sentry/wizard` (`sentry-errors` line 89), `inngest-cli` (`inngest-jobs` line 428) and `trigger.dev` (line 445) now refuse to run unless the package is installed first, and no install line comes before them.
- `experiment-designer` line 158 names the command "for the executor". In the Product Loop the reader is the product manager; the vercel paragraph's "for the executor or the team" fits better.
- `experiment-designer`'s Python block from line 433 (scipy, statsmodels) is not labelled as the team's, unlike line 158.
- `product-reviewer`'s Tool Integration table (lines 339 and 344) gives how-to steps for vendor screens and is not labelled as the team's, unlike the snippets below it.
- `clerk-auth` line 583, "check current plan tiers", is a web lookup in a comparison table that is not routed through the `needs-input` reply.
- The 90-pair minimum is stated only once; a later edit can lower it in one file without anything failing.
- The body-only method-file map is kept by hand; a new agent that names its method file only in its body would go unpaired, silently.
- Check 13.1 has no case for an agent's own key outside the allowed path pattern, and the limits file has no "debt list grew" assertion for the new list (the shared loop does cover it).
- The limits file's test title ends "on 2026-10-05", but the method-file ceiling was set on 2026-10-06.
- An `allowed-tools:` line in a method file is not matched by the tools-key pattern. None exists today.
- The `posthog-analytics` agent body (line 28, "before pinning a major version") and the `vercel-deploy` body ("never pin … from memory") read as if the agent pins versions. Agent files are outside this slice.

Files: `<home>/Code/ctoc/plans/in-progress/agent-tool-grants-s12-method-files-of-slices-2-to-4.md`, `<home>/Code/ctoc/tests/agent-tool-grants.test.js`, `<home>/Code/ctoc/tests/agent-tool-grants-maxima.test.js`, `<home>/Code/ctoc/skills/saas/vercel-deploy/SKILL.md`, `<home>/Code/ctoc/skills/product/product-reviewer/SKILL.md`
