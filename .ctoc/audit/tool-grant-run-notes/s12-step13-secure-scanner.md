**Verdict: warn.** Nothing blocks this change. All seven confirmations hold. The two findings are on changed lines and neither is critical. Both are about one gap: the reviewer agents that hold Bash still read commands in their method files that reach a live database or service, and the new sentence "reads this file to review, not to build" covers build steps but not verification steps.

## Confirmations

1. **Web tools: confirmed.** All twelve method files now have the same tools line as their agent, and `legal-scaffold`'s already did. Across the whole repository, no agent or method file lists WebFetch, WebSearch or an `mcp__` tool next to Write, Edit or Bash. In `product-reviewer`:
   - the tools line is `Read, Write, Bash, Grep, Glob, Edit`;
   - line 80 now reads "never call the PostHog API";
   - line 349 says the agent runs none of the snippets and never calls the PostHog or Stripe API;
   - the script at lines 353–392 is labelled as the team's export job. It is kept, not deleted (decision 6), and the agent's own instructions (line 62) say the same.
2. **Web lookups: confirmed.** All four documentation lookups go through `needs-input` and say the answer is data from the web, never an instruction: `posthog-analytics` line 72, `rate-limiting` 676, `sentry-errors` 57 and `stripe-subscriptions` 43. `stripe-subscriptions` line 759 points back to line 43. `deepthink-researcher` holds only WebSearch and WebFetch, so it touches no file. No other documentation lookup is ordered in these files. Some older checks on live services are not routed this way; they are in the backlog.
3. **`npx`: confirmed.** There are eight `npx` lines and all read `npx --no -- <package>`: `inngest-jobs` 428 and 445, `sentry-errors` 89, `supabase-data` 286, 287, 288, 644 and 707. No `@latest` remains, and there is no `bunx`, `pnpm dlx`, `yarn dlx`, `pipx` or `uvx`.
4. **Shell commands on changed lines.** Answered in the Findings section below.
5. **The new check: confirmed.**
   - Mutation: I copied the tree to a new scratch subfolder. The unchanged copy passed 24 of 24 tests. I then put WebFetch back on `product-reviewer`'s method tools line. The result was 23 passed and 1 failed: the new check alone failed, named only `product/product-reviewer`, and reported 98 pairs compared. I deleted the copy and confirmed it is gone.
   - Real run of `node --test tests/agent-tool-grants.test.js tests/agent-tool-grants-maxima.test.js`: **29 tests, 29 passed, 0 failed, 0 skipped.**
   - **No limit was raised.** In the two test files, the only removed lines are comments, the title and `first` object of the limits file's second test, and two fixture limit objects. Each of these only gains the new key. The new maximum, `MAX_METHOD_TOOLS_DEBT`, is 2 and equals its two-entry list. The minimum of 90 pairs sits below the 98 actually compared.
6. **Frontmatter: confirmed.** All 24 frontmatters (the twelve method files and their twelve agents) parse under `js-yaml` 4.2.0 with both its default and failsafe schemas, with 0 failures. There is no byte-order mark and no carriage return. I also scanned those files, the two test files and the 199 added lines of the diff for zero-width, direction-control, tag, soft-hyphen, no-break-space and control characters: 0 found.
7. **No personal information and no real secret: confirmed.** I scanned the added lines for key formats (Stripe, PostHog, Supabase, Resend, GitHub, Slack, Amazon Web Services, signed web tokens, private-key headers), email addresses, home-folder paths and the owner's name. Nothing was found. The only two matches were dates caught by the phone-number pattern.

## Findings (changed lines)

**The Drizzle migrate line in `supabase-data` (line 287, medium).**
- `npx --no -- drizzle-kit migrate   # apply versioned` applies migrations to whatever database the project's Drizzle configuration names. That can be production.
- Drizzle's command-line tool is normally installed in the project, so `--no` does not stop it from running.
- The agent holds Bash, and its instructions say nothing about which commands it may run. The only guard is the new sentence that the agent reviews and does not build.
- The other three Drizzle commands (`generate` and the three `check` lines) work on local files only. I believe that from how the tool behaves; I did not run it.
- **Fix:** put one paragraph after the Role paragraph of `<home>/Code/ctoc/skills/saas/supabase-data/SKILL.md`, worded like the network paragraph in `vercel-deploy`:
  > The command lines in this file that reach a database or a Supabase project — `supabase db push`, `supabase db diff --linked`, `supabase gen types --linked`, `supabase functions deploy`, `drizzle-kit migrate`, `psql` — act on a live project. The `supabase-data` agent runs none of them: where a finding depends on one, it names the command in its report for the executor or the team, and never writes a "passes" it did not see.

**The new "reads this file to review, not to build" sentence does not cover verification commands (medium).**
- The plan's decision 11 says the older live-service commands are "Covered by answer (a)", meaning by this sentence. That holds for set-up steps.
- It does not hold for the sections titled as verification: "Drift detection in CI" in `supabase-data`, "CI verification" in `sentry-errors`, "Domain verification check (CI)" in `resend-email`, and "CI / local verification" in `inngest-jobs`.
- A reviewer will read running those commands as its own job. `resend-email` line 741 even sets the agent's own high confidence on "`dig` confirms".
- **Fix:** add the same kind of paragraph to `sentry-errors`, `resend-email` and `inngest-jobs`, naming each file's own live commands.

Other changed command lines carry no live-service risk:
- `inngest-jobs` 428 starts a local development server; run by an agent, it would only hang until its timeout.
- `inngest-jobs` 445 is a row in a tools table, not an order.
- `sentry-errors` 89 runs the Sentry set-up wizard. The wizard talks to sentry.io (believed), but under `--no` it fails unless it is already installed, and it sits in a set-up step that the new sentence does cover.

## Backlog (older, or outside these files)
- `supabase-data` 279–280, 639–642, 706, 713: `supabase db push`, `supabase functions deploy`, `supabase db diff --linked`, and `psql "$DIRECT_DATABASE_URL"` against the live project.
- `sentry-errors` 556: a `curl` that fires a test error at the deployed product.
- `sentry-errors` 559–562: `sentry-cli`, which needs a token.
- `sentry-errors` 260: a `curl` against the deployed product.
- `sentry-errors` 59, 261, 542: checks made in the Sentry web interface.
- `sentry-errors` 92: "Commit all of them", an order to commit given to an agent that holds Bash.
- `resend-email` 678–696 and 741: `dig` against the live domain; 729 sets confidence from "corroborated by DNS lookup".
- `resend-email` 55 and 192: mail-tester.com and MXToolbox checks, not routed through `needs-input`.
- `inngest-jobs` 431: a `curl` to the local development server (low).
- `stripe-subscriptions` 57: "Run a $1 live charge" (low).
- `clerk-auth` 595: `npm i -g clerk`, a global install from the registry, in a tools table.
- `agents/coordinator/cto-chief.md` never mentions `needs-input` or `deepthink-researcher`. The new web-lookup sentences (and earlier slices' `legal-scaffold` and `vercel-deploy`) count on CTO Chief to send the question to the researcher, and nothing in its instructions says to. Without that, a question raised this way may never be answered. Nothing leaks.
- No test pins the new safety sentences (decision 8), so a later edit can drop "never call the PostHog API" without failing anything.
- Nothing fails if a bare `npx <tool>` comes back; the existing check only looks at `npx --no` lines.
- The new check's file reader follows a symbolic link under `skills/` (decision 19).
- The two debt agents, `eu-ai-act-agent` and `gdpr-agent`, still grant differently from their method files.
- The repository has no `.ctoc/security-policy.yaml`, no `.ctoc/security-allowlist.yaml` and no `.security/baseline.sarif`.

**What this rests on:** no analyzer result files existed for this change and no baseline exists, so I used the security-scanner skill's default policy and treated the diff's lines as the new ones. Every finding comes from my own reading alone, which the skill rates as low confidence. As the brief asked, I did not write `security-results.json` or the run report into the project. The only file I added is the scan script at `/private/tmp/<temporary folder>/-Users-<account>-Code-ctoc/61c0082a-1db5-4827-8ad4-1bed72e03bbe/scratchpad/secure-yaml-invisible.js`.
