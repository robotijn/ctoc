---
title: "CTOC's new releases are under a commercial licence agreement"
created: "2026-10-23"
type: feature
parent_vision: "none (the owner's order of 2026-10-23, quoted below)"
priority: HIGH
status: refined
depends_on: "none"
acceptance_criteria_count: 15
risk_level: HIGH
---

# CTOC's new releases are under a commercial licence agreement

## Problem Statement

Every CTOC release up to and including 6.14.135 is under the PolyForm Shield License 1.0.0, which lets anyone, a business included, use, change and redistribute CTOC free of charge for any purpose that does not compete with it. The owner, Tijn van der Zant, ordered on 2026-10-23 that new releases carry a commercial end-user licence agreement instead: personal use, evaluation and non-commercial use stay free, and any business use needs a paid commercial licence from him. The old licence is pinned in nine tracked files: the LICENSE text; the README badge and licence section, which today say "Use CTO Chief freely for any project"; the licence value in package.json, in the package-lock.json root package and in the marketplace plugin entry; and four test files that pin or compare those values. Until they change together in one release, a person reading the repository, the README or the plugin listing of a new release is told that business use is free, and the release checks hold the old licence in place.

### What was read for this refinement

Read on main on 2026-10-23 by the product owner, who holds no shell and ran nothing: the npm and Claude Code observations under "Facts verified on main" are the coordinator's, carried as recorded and not re-run.

- Files read: LICENSE (all 151 lines), README.md lines 1 to 20 and 1160 to 1175, package.json, the first 25 lines of package-lock.json, .claude-plugin/marketplace.json, .claude-plugin/plugin.json, VERSION (6.14.135), tests/version-license-invariant.test.js, tests/helpers/metadata-invariant.js, tests/helpers/source-of-truth.js, tests/release.test.js lines 690 to 794, tests/release-metadata-sync.test.js lines 90 to 134 and 235 to 358, and the deepthink research in full.
- `PolyForm|Shield License|PolyForm-Shield` over the repository outside plans/done: 12 files. Nine are the tracked files the stub lists (LICENSE, README.md, package.json, package-lock.json, .claude-plugin/marketplace.json, tests/version-license-invariant.test.js, tests/release.test.js, tests/release-metadata-sync.test.js, tests/helpers/source-of-truth.js); the other three are this plan, its research and plans/functional/every-agent-compiles-into-a-checked-structured-form.md. No file under docs/, src/ or agents/ names PolyForm.
- `licen[cs]e`, case-insensitive, over the JavaScript files in tests/ and src/: 26 files, every match read. Apart from the files above and tests/helpers/metadata-invariant.js, none reads CTOC's own licence value: src/scripts/release.js line 10 says the licence is not synced; the rest are the dependency licence scanner, the hotfix check's list of sensitive words, quoted text about other products' licences, or the verb "license".
- Two facts the change must meet, read in the code. `normalizeLicense` (tests/helpers/source-of-truth.js lines 89 to 95) reduces "SEE LICENSE IN LICENSE" to "seein", which no title line reduces to, so the check at tests/release.test.js lines 712 to 722, which compares the reduced package.json value with the reduced first line of LICENSE, cannot pass on the new pair (Decision 8). `readMetadata` (tests/helpers/metadata-invariant.js lines 51 to 76) reads the licence of package.json and of the marketplace entry only, not of the lockfile, and that helper is not in this plan's files (Decision 9).

## The owner's order (2026-10-23, given in the main session and relayed by the coordinator)

Replace PolyForm Shield with a commercial end-user licence agreement for new CTOC releases, before the build queue.

Decided by the owner; not to be re-asked:

- Terms: free for personal use, evaluation and non-commercial use. Any business use needs a paid commercial licence from the licensor, contact tijn@theaiguys.com. No redistribution, no sublicensing, no distributing modified copies, no competing product, no removing notices. Private changes for your own permitted use are allowed.
- Licensor: Tijn van der Zant, under Dutch law, with the competent Dutch court.

## Facts verified on main (2026-10-23)

- LICENSE is the PolyForm Shield License 1.0.0, first line "PolyForm Shield License 1.0.0", with "Copyright (c) 2025 Tijn van der Zant"; adopted in 6.1.26 (commit 757f5f99). VERSION is 6.14.135, so the first release under the new agreement is the next patch release.
- The tracked files that name the licence: LICENSE; README.md (line 8, the badge "License: PolyForm Shield"; lines 1168 to 1170, the "License" section linking the PolyForm text); package.json line 5, "license": "PolyForm-Shield-1.0.0"; package-lock.json, the root package's "license"; .claude-plugin/marketplace.json line 21, the ctoc plugin entry's "license"; tests/version-license-invariant.test.js (EXPECTED_LICENSE, the check that package.json and the marketplace entry agree, the LICENSE first-line pattern, and the revert-to-Apache drift case); tests/release-metadata-sync.test.js (line 260, the lockfile fixture's licence; lines 107 to 124, the check that release.js never syncs the licence); tests/release.test.js (lines 712 to 790, readLicenseSources: the normalised package.json licence must equal the normalised first line of LICENSE); tests/helpers/source-of-truth.js (line 89, normalizeLicense, which lower-cases, drops the word "license" and strips every non-alphanumeric character, so "SEE LICENSE IN LICENSE" would reduce to "seein"). .claude-plugin/plugin.json carries no licence field.
- The PolyForm Shield License ends a grant only for an uncured violation or a patent claim, so every copy up to and including 6.14.135 stays under it for whoever holds it, and README must say so.
- Claude Code 2.1.309, "claude plugin validate --strict --json", run by the coordinator on scratch copies of both manifests: the licence field accepts any string ("SEE LICENSE IN LICENSE", "LicenseRef-CTOC-Commercial", "UNLICENSED", "Proprietary" and the current value all pass with no error and no warning) and refuses a number ("expected string"). The current marketplace manifest passes with one strict warning that is not about the licence: the plugin entry's author has no details.
- npm 11.11.0, run by the coordinator on scratch copies of package.json and package-lock.json: "npm install --package-lock-only" copies the package.json licence value, whatever it is, into the lockfile's root package entry, with no warning, for "SEE LICENSE IN LICENSE", "LicenseRef-CTOC-Commercial" and "UNLICENSED". package.json has "private": true; the package is not published to the npm registry.
- Old plans in plans/done stay untouched. plans/functional/every-agent-compiles-into-a-checked-structured-form.md line 114 also says the project is under PolyForm Shield; it is outside this plan's files and is reported to the owner, not edited here.

## Scope: the files this work touches

Exactly these: LICENSE, README.md, package.json, package-lock.json, .claude-plugin/marketplace.json, tests/version-license-invariant.test.js, tests/release-metadata-sync.test.js, tests/release.test.js, tests/helpers/source-of-truth.js; plus the files a patch release writes: VERSION, .claude-plugin/plugin.json, and CLAUDE.md only when node src/scripts/release.js changes a count in it.

Out of scope: plans in plans/done, any other file naming PolyForm, source code, hooks and gates.

### In Scope

- The agreement's text in LICENSE: its title line, copyright line, licensor and contact address, every term of the owner's order, the four recorded decisions and Decision 5, the GitHub viewing-and-forking sentence and the computer-program savings sentence (scenarios 1 to 6).
- README.md: the licence badge and the "License" section, with the sentence that every copy up to and including 6.14.135 stays under the PolyForm Shield License 1.0.0 (scenarios 7 and 10).
- The licence value "SEE LICENSE IN LICENSE" in package.json, in the package-lock.json root package and in the marketplace plugin entry, and no licence field in plugin.json (scenario 8).
- The strict plugin validator, run on the repository before and after the change (scenario 9).
- tests/version-license-invariant.test.js, tests/release.test.js and tests/helpers/source-of-truth.js, changed first and seen failing, with a failing case for each value put back to PolyForm Shield (scenarios 11 to 13); and the lockfile fixture in tests/release-metadata-sync.test.js, which cannot fail first because the release script leaves the licence alone whatever its value (scenario 14).
- The patch release, the full gated `npm test` on the tree that lands, and the privacy scan of the commit (scenarios 10 and 15).

### Out of Scope

- Every file outside the list above stays unchanged, in particular tests/helpers/metadata-invariant.js (Decision 9) and plans/functional/every-agent-compiles-into-a-checked-structured-form.md line 114, which is listed for the owner under "What the research changes for the agreement's text".
- Releases up to and including 6.14.135 and their tags: they keep the PolyForm Shield License 1.0.0 and are not touched.
- The push and the CTOC update in the four profiles (step 5 of "How the work runs"): the coordinator's steps after the commit, under the owner's order; no scenario here.
- The findings the research lists for the owner to schedule: a contributor licence agreement before outside contributions are accepted, a notice at installation or first run, whether CTOC sends personal data anywhere, the other plan's line 114, and the marketplace entry's missing author details. They stay listed under "What the research changes for the agreement's text".
- The paid commercial licence's own terms, including any liability cap amount: a separate contract between the licensor and the business (Decision 4).
- A lawyer's review of the agreement's text: not part of this plan; whether to have one is the owner's decision (Business Risks).

## How the work runs (the owner's order)

1. Tests first, run and seen failing: the licence invariants expect the new licence value in package.json, the lockfile root and the marketplace entry, and the agreement's title as the first line of LICENSE; the release consistency check reads the new package.json value against LICENSE.
2. Then the change: the agreement text in LICENSE; README's badge and licence section, which says that copies up to and including 6.14.135 stay under the PolyForm Shield License 1.0.0 and that later releases are under the agreement; the manifests and the lockfile.
3. Release as a patch: edit VERSION, run node src/scripts/release.js; the full gated npm test on the exact tree that lands.
4. A privacy scan before the commit: only the name Tijn van der Zant and the address tijn@theaiguys.com may appear. The commit author is Tijn van der Zant, tijn@theaiguys.com.
5. Push fast-forward only, then update CTOC in the four profiles through the marketplace.

## Research

The deepthink research "commercial licence for ctoc" (plans/vision/deepthink/commercial-licence-for-ctoc.md) covers npm's documented licence forms, Claude Code's manifest field, GitHub's Terms of Service section D.5, the PolyForm Shield termination text, the mandatory Dutch and European Union limits on warranty and liability terms, the computer-program exceptions a contract cannot exclude, and how comparable licences define business use and evaluation. The refinement checks every decision below against it.

## What the research changes for the agreement's text

From the deepthink research (plans/vision/deepthink/commercial-licence-for-ctoc.md, read on 2026-10-23; the quotations there came mostly through the fetch tool's answer, and the official text of Dutch Civil Code articles 6:231 to 6:248 was not reached):

- GitHub's Terms of Service section D.5 already gives every GitHub user the right to view and fork a public repository within GitHub; a licence file cannot narrow that. The agreement says that viewing and forking within GitHub under GitHub's terms is not a breach, and that it gives no right outside GitHub beyond what the agreement grants.
- The European Union directive on computer programs (2009/24/EC, articles 5, 6 and 8) and the Dutch Copyright Act (articles 45j to 45m) let a lawful user load, run and correct errors, keep a back-up copy, observe, study and test, and decompile for interoperability, and void any contract term to the contrary. The agreement states that it limits none of these. PolyForm's "Fair Use" sentence is the published model.
- The new Product Liability Directive (European Union) 2024/2853 counts software as a product, applies to supply in a commercial activity even free of charge, does not exempt a product under a commercial licence, and forbids excluding that liability by contract (article 15). Dutch Civil Code article 6:237 item f presumes an exclusion of statutory damages unreasonably onerous against a consumer, and Dutch case law (secondary sources) bars invoking an exclusion for intent or deliberate recklessness.
- Rome I article 6 and the Brussels I recast articles 17 to 19 keep a consumer's mandatory home-country protection and home courts whatever the agreement says; article 25 lets businesses agree on the Dutch court in writing or by electronic means with a durable record.
- Dutch Civil Code article 6:234: general terms must be made available, before or when the contract is formed, in a form the other party can store. The top-level LICENSE file and the README notice do that for this plan.
- PolyForm Shield has no revocation clause: every copy up to and including 6.14.135 keeps its grant, business use for any purpose that does not compete with CTOC included. README says so plainly.

Findings outside this plan's files, listed for the owner to schedule, not built here:
- GitHub's Terms of Service section D.6 licenses an outside contribution under the repository's licence, which gives the licensor no right to sell it; accepting outside contributions under the new agreement needs a contributor licence agreement first.
- A notice of the agreement at installation or first run (source code, out of scope here).
- Whether CTOC ever sends a user's personal data anywhere: if it does, free consumer use falls under the digital content directive (European Union) 2019/770 and its conformity remedies. Today CTOC makes no online calls; the planned "requests on GitHub" work would need this check.
- plans/functional/every-agent-compiles-into-a-checked-structured-form.md line 114 still says the project is under PolyForm Shield.
- The marketplace manifest's plugin entry has no author details, which "claude plugin validate --strict" reports as a warning (not about the licence).

## Business Alignment

**Job to Be Done:** When a business starts using a CTOC release published after 6.14.135, I want it to need a paid commercial licence from me while personal use, evaluation and non-commercial use stay free, so I can be paid for business use of CTOC without closing it to individuals, evaluators and non-commercial users.

**Impact Map:**
- **Goal:** the owner's order of 2026-10-23, quoted above (this plan has no parent vision): business use of new CTOC releases is paid; personal, evaluation and non-commercial use stays free.
- **Actor:** the owner, Tijn van der Zant, as licensor; and every person or organisation that reads the terms of a new release before using it: individuals, evaluators, non-commercial organisations and businesses.
- **Impact:** a reader of LICENSE, README or the plugin listing of a release after 6.14.135 finds the same terms in each, can tell whether their use is free or needs a paid licence, and finds tijn@theaiguys.com as where to ask for one; the release checks fail when any of those places drifts back to the old licence.
- **Deliverable:** the agreement in LICENSE, README's licence badge and licence section, the licence value in package.json, the lockfile root and the marketplace entry, and the changed tests, landed as one patch release.

**Alignment checks:**
1. Does the Goal trace to the problem? YES: to the owner's order quoted in this plan; there is no parent vision.
2. Is the Actor named in it? YES: the order names the licensor and the uses it sorts into free and paid.
3. Is the Impact observable? YES: the text of LICENSE, README and the plugin listing, and the results of the release checks.
4. Is the Deliverable one functional area? YES: the licence of new releases and the checks that keep its declarations in agreement.

**Overlap with other plans:** parent_vision is "none", so there are no sibling stubs by vision name. `LICENSE|licen[cs]e agreement|commercial licen`, case-insensitive, over plans/ outside plans/done: 13 files, every matching line read. Apart from this plan and its research, the matches concern the dependency licence-scanner agent and its improvement rounds, the hotfix check's sensitive words, agent tool grants, and the verb "license"; none changes a file of this plan. plans/functional/every-agent-compiles-into-a-checked-structured-form.md line 114 states the project is under PolyForm Shield; it is outside this plan's files and listed for the owner.

## User Stories

**As the** owner and licensor, Tijn van der Zant, **I want** every CTOC release after 6.14.135 to carry an agreement that keeps personal use, evaluation and non-commercial use free and makes any business use need a paid commercial licence from me, under Dutch law and within the limits mandatory law sets, **so that** a business using a new release must take a licence from me, and the text claims nothing a court would set aside. (Scenarios 1 to 5.)

**As a** person or organisation deciding whether I may use the copy of CTOC I hold, **I want** LICENSE, README and the plugin listing to state the same terms, where to ask for a commercial licence, and which versions stay under PolyForm Shield, **so that** I can tell before I install whether my use is free or needs a paid licence. (Scenarios 6 to 10.)

**As the** owner releasing CTOC, **I want** the release checks to fail whenever a licence value or the LICENSE title line drifts from the agreement, and the change to land only after the full gated suite and the privacy scan pass, **so that** no release ships declaring a licence its LICENSE file does not hold. (Scenarios 11 to 15.)

## Acceptance Criteria

### The agreement in LICENSE

- [ ] **Scenario 1: The agreement's title, licensor and contact are in LICENSE**
  Given LICENSE on the tree that lands
  When it is read
  Then its first non-empty line is the agreement's title, which names CTOC and contains neither "PolyForm" nor "Shield", and tests/version-license-invariant.test.js pins that line word for word in a named constant in place of the PolyForm pattern at line 77 (Decision 6)
  And a line beginning "Copyright (c)" names Tijn van der Zant, the agreement names Tijn van der Zant as the licensor, and it gives tijn@theaiguys.com as the address to ask for a commercial licence
  And the PolyForm Shield License text is gone from LICENSE: neither "PolyForm Shield License 1.0.0" as a line of its own nor a line beginning "Licensor Line of Business:" is in it

- [ ] **Scenario 2: Every term the owner decided is in the agreement**
  Given LICENSE and the owner's order quoted in this plan
  When the review checks the agreement term by term and records in the implementation plan the LICENSE section that carries each term
  Then each of these fourteen terms is stated: (1) personal use is free; (2) evaluation is free; (3) non-commercial use is free; (4) any business use needs a paid commercial licence from the licensor; (5) that licence is asked for at tijn@theaiguys.com; (6) no redistribution; (7) no sublicensing; (8) no distributing modified copies; (9) no providing a competing product; (10) no removing notices; (11) private changes for your own permitted use are allowed; (12) the licensor is Tijn van der Zant; (13) Dutch law governs; (14) the competent Dutch court has jurisdiction
  And no clause grants a right the order withholds: redistribution, sublicensing, distributing modified copies, a competing product, or business use without a paid licence after the evaluation period

- [ ] **Scenario 3: Business use and non-commercial use are defined as Decision 1 records**
  Given LICENSE
  When its definitions are read
  Then use by or on behalf of a company, partnership or other legal entity, and an individual's use in the course of paid work, a trade, a business or a profession, is business use
  And use by a charitable organisation, an educational institution, a public research organisation, a public safety or health organisation, an environmental protection organisation or a government institution for its non-commercial purposes, regardless of its source of funding, and an individual's work on that organisation's behalf, is non-commercial use, as is an individual's study, hobby or unpaid project of their own
  And use for a commercial product or a paid service is business use, also when one of the listed organisations makes it

- [ ] **Scenario 4: Free evaluation ends before day 32 and does not start again**
  Given LICENSE
  When its evaluation clause is read
  Then it lets a person or company evaluate whether CTOC suits a particular use for less than 32 consecutive calendar days, and says continued business use after that needs a commercial licence (Decision 2)
  And it says the period runs once per company together with its affiliates, or once per individual who acts for no company, and does not start again for another person or another use (Decision 5)

- [ ] **Scenario 5: Warranty, liability, law and court follow Decision 4**
  Given LICENSE
  When its warranty, liability, governing-law and court clauses are read
  Then CTOC is provided as is, without warranty, as far as the law allows, and toward business licensees the licensor's liability is excluded as far as the law allows
  And the text names what the agreement neither excludes nor limits: liability for intent or deliberate recklessness; product liability toward natural persons for death, personal injury, or damage to property or data not used for professional purposes; a consumer's statutory rights
  And Dutch law governs without depriving a consumer of the mandatory protection of the law of their habitual residence, and the competent court in the Netherlands has jurisdiction without prejudice to the courts a consumer may use or must be sued in under European Union law
  And no liability cap amount appears in LICENSE

### Where a reader finds the terms

- [ ] **Scenario 6: The agreement keeps GitHub's viewing and forking and the computer-program rights**
  Given LICENSE
  When it is read
  Then it says that viewing and forking the repository within GitHub under GitHub's terms of service is not a breach of the agreement, and that this gives no right outside GitHub beyond what the agreement grants
  And it says the agreement limits none of the rights a lawful user has under European Union and Dutch law on computer programs, naming loading, running and correcting errors, making a back-up copy, observing, studying and testing, and decompiling for interoperability (Directive 2009/24/EC articles 5 and 6; Dutch Copyright Act articles 45j to 45m)

- [ ] **Scenario 7: README states the terms and which copies stay under PolyForm Shield**
  Given README.md on the tree that lands
  When its licence badge and its "License" section are read
  Then the badge no longer says "PolyForm Shield", names the agreement and links to LICENSE
  And the section names the agreement, links to LICENSE, and says that personal use, evaluation and non-commercial use are free and that business use needs a paid commercial licence from Tijn van der Zant at tijn@theaiguys.com
  And it says, in a sentence of its own, that every copy up to and including 6.14.135 stays under the PolyForm Shield License 1.0.0, linking that licence's text, and that releases after 6.14.135 are under the agreement (Decision 7)
  And the sentence "Use CTO Chief freely for any project." is gone, and no other line of README.md names PolyForm

- [ ] **Scenario 8: The manifests and the lockfile point to LICENSE**
  Given package.json, package-lock.json, .claude-plugin/marketplace.json and .claude-plugin/plugin.json on the tree that lands
  When their licence fields are read
  Then package.json "license", the "license" of the package-lock.json root package (the "packages" entry keyed "") and the "license" of the ctoc entry in the marketplace manifest each read exactly "SEE LICENSE IN LICENSE" (Decision 3)
  And plugin.json has no "license" field, and package.json still has "private": true
  And the package-lock.json diff against main changes only the root package's licence and the two version values a release writes

- [ ] **Scenario 9: Claude Code's strict validator reports nothing new**
  Given the messages the builder records from "claude plugin validate --strict --json" run on the repository on main before the change (the coordinator's run on scratch copies on 2026-10-23 found one warning, that the plugin entry's author has no details, and nothing about the licence)
  When the builder runs the same command on the repository after the change, with the same installed Claude Code
  Then it reports no error and no warning that the run on main did not report, and no message about the licence field
  And the implementation plan records the Claude Code version and both outputs in full

- [ ] **Scenario 10: The first release under the agreement is the next patch release**
  Given VERSION on main, read just before the bump (6.14.135 on 2026-10-23)
  When the patch release is made: VERSION set to the next patch number and `node src/scripts/release.js` run
  Then VERSION, the version in package.json, both version values in package-lock.json, plugin.json and both version fields of the marketplace manifest read that number, and the version invariant passes
  And the version README names as the last under PolyForm Shield equals the VERSION read before the bump; if that is not 6.14.135, README names the number read and the builder reports the change to the owner (Decision 7)

### The tests that hold the values in place

- [ ] **Scenario 11: The licence tests fail before the change and pass after it**
  Given tests/version-license-invariant.test.js, tests/release.test.js and tests/helpers/source-of-truth.js changed to expect the agreement, while LICENSE, README.md, package.json, package-lock.json and the marketplace manifest are still unchanged
  When `node --test tests/version-license-invariant.test.js tests/release.test.js` runs
  Then each of the two test files reports at least one failure, the failures between them name package.json, the package-lock.json root package, the marketplace entry and the LICENSE title line, and the builder records that output in the implementation plan
  And after the change the same command reports 0 failed

- [ ] **Scenario 12: Putting any one value back to PolyForm Shield fails a test**
  Given four fixture copies of the landed tree, each with exactly one value put back: package.json "license" to "PolyForm-Shield-1.0.0"; the package-lock.json root "license" to "PolyForm-Shield-1.0.0"; the marketplace entry's "license" to "PolyForm-Shield-1.0.0"; LICENSE's first line to "PolyForm Shield License 1.0.0"
  When the licence invariant and the release consistency check run against each fixture
  Then every fixture fails at least one of them with a message that names the file put back, and the package.json and LICENSE fixtures fail both
  And the existing cases that put "Apache-2.0" in package.json still fail

- [ ] **Scenario 13: The release consistency check follows the file the licence names**
  Given a tree whose package.json "license" and LICENSE are read by the release consistency check in tests/release.test.js
  When the check runs
  Then it passes only when the value is exactly "SEE LICENSE IN LICENSE", a file named LICENSE exists at the top level of the repository, and its first non-empty line is the agreement's title as pinned in the test (Decision 8)
  And fixtures whose package.json reads "SEE LICENSE IN LICENSE.txt", "PolyForm-Shield-1.0.0" or "Apache-2.0", and a fixture with no LICENSE file, each fail with a message that names package.json or LICENSE

- [ ] **Scenario 14: The release script never writes the licence**
  Given a release fixture whose package.json and package-lock.json root package both read "SEE LICENSE IN LICENSE", with the lockfile fixture at tests/release-metadata-sync.test.js line 260 changed to that value
  When `node src/scripts/release.js` runs on it
  Then both licence values are byte-identical afterwards, the lockfile changes only in its two version values, and the release script's package.json target still holds no licence path (the check at lines 107 to 111 keeps passing)

- [ ] **Scenario 15: The tree that lands passes the gated suite and the privacy scan**
  Given the exact tree that is committed
  When `npm test` runs on it and the privacy scan reads every added line of the commit
  Then `npm test` reports 0 failed and 0 skipped with coverage at or above `minPct` in .ctoc/coverage-baseline.json, and every changed assertion is listed in the implementation plan with its old text, its new text and the reason, none of them loosened
  And no added line holds an e-mail address other than tijn@theaiguys.com, a home-folder path, or a person's name other than Tijn van der Zant; no added line holds an account name except inside the repository's GitHub address as README.md already shows it; and the commit author is Tijn van der Zant, tijn@theaiguys.com

## Risks

### Technical Risks
- The release consistency check compares reduced tokens: `normalizeLicense` turns "SEE LICENSE IN LICENSE" into "seein", which no title line reduces to. Changing only the expected value gives a test that never passes, and the tempting repair, accepting any "SEE LICENSE IN" value, lets the check pass for any file.
  - Likelihood: HIGH
  - Impact: MEDIUM
  - Mitigation: Replace the comparison with the exact-value and named-file check of Decision 8, and keep the PolyForm and Apache cases failing (scenarios 12 and 13).
- No test reads the lockfile root's licence today, and the helper that reads the other two values is outside this plan's files.
  - Likelihood: HIGH
  - Impact: LOW
  - Mitigation: Read the lockfile root in a file in scope (Decision 9) and prove that putting it back fails (scenario 12).
- Rewriting package-lock.json with npm changes more than the licence, for example resolved dependency entries.
  - Likelihood: MEDIUM
  - Impact: MEDIUM
  - Mitigation: Limit the lockfile diff to the root licence and the two version values a release writes, and reject any other changed line before the commit (scenario 8).
- The strict validator of the Claude Code installed at the build behaves differently from the 2.1.309 the coordinator ran.
  - Likelihood: LOW
  - Impact: LOW
  - Mitigation: Run it on main before the change and on the change with the same installed Claude Code, and record the version and both outputs (scenario 9).

### Business Risks
- The agreement is drafted by the build chain, not by a lawyer, and the research left primary sources unread: the official text of Dutch Civil Code articles 6:231 to 6:248, the Supreme Court of the Netherlands' own statement of the rule on intent and deliberate recklessness, and the Product Liability Directive's application date (8 or 9 December 2026). A clause a Dutch court finds unreasonably onerous is void against that party, and a gap in the definition of business use lets business use go unpaid.
  - Likelihood: MEDIUM
  - Impact: HIGH
  - Mitigation: Write the mandatory-law limits in the named form of Decision 4, so that no clause rests on the exact wording of the unread articles; have the review check the text term by term against scenarios 2 to 6; and list in the implementation plan, for the owner, every unverified point the text relies on and the fact that no lawyer has reviewed it.
- Version 6.14.135 stays usable for business, free of charge, for any purpose that does not compete with CTOC, for whoever holds it: PolyForm Shield has no clause that lets the licensor withdraw the grant (research section 4).
  - Likelihood: HIGH
  - Impact: MEDIUM
  - Mitigation: State it in README as the owner ordered (scenario 7); no change in this plan can narrow it.
- Once the Product Liability Directive applies, the free tier still carries product liability toward natural persons, because the research reads free supply alongside a paid licence as supply in a commercial activity; no contract term can exclude it.
  - Likelihood: MEDIUM
  - Impact: MEDIUM
  - Mitigation: Name that liability as unaffected (scenario 5) instead of claiming an exclusion a court would set aside.
- The plugin listing shows "SEE LICENSE IN LICENSE" rather than a licence name, and GitHub's licence detection compares LICENSE against known licences, so it will not name the agreement (how GitHub labels it was not checked); a reader may not see the terms at a glance.
  - Likelihood: HIGH
  - Impact: LOW
  - Mitigation: Name the agreement in README's badge and licence section, both linking to LICENSE (scenario 7).

### Dependency Risks
- Another release lands on main before this one. The last version under PolyForm Shield is then no longer 6.14.135, and because every release writes VERSION, package.json, package-lock.json, plugin.json, the marketplace manifest and README's version badge, a build in a parallel worktree conflicts with this one on those files.
  - Likelihood: LOW
  - Impact: MEDIUM
  - Mitigation: Read VERSION on main when the build starts and again just before the bump, name in README the version read (Decision 7), and declare every release file in this plan's implementation so that no build on the same files runs beside it.

## Priority

**Priority: HIGH** (Score: 7/9)
- Dependency: 2 — no plan depends on it technically; the owner ordered it before the build queue, which is his schedule, not a dependency.
- Business Impact: 3 — it is the owner's direct order and decides who pays for new releases.
- Technical Risk: 2 — one test comparison is redesigned and a lockfile check added, within known files; the agreement's legal risk is counted under Business Risks.

## Decisions Taken Under Ambiguity

The owner assigned these four choices to the build chain, each recorded with its reason after the research.

1. The definition of business use. Choice: business use is any use by or on behalf of a company, partnership or other legal entity, and any use by an individual in the course of paid work, a trade, a business or a profession; except that use by a charitable organisation, an educational institution, a public research organisation, a public safety or health organisation, an environmental protection organisation or a government institution, for its non-commercial purposes and regardless of its source of funding, is non-commercial use, and so is an individual's work on that organisation's behalf. Non-commercial use also covers an individual's use outside paid work, such as study, a hobby or an unpaid project of their own. Use for a commercial product or a paid service, including by one of the listed organisations, is business use. Reason: the coordinator's suggested test ("use by or for a legal entity, or by an individual in paid work") makes a charity's, school's or university's non-commercial use count as business use, which collides with the owner's settled term "free for non-commercial use"; the organisation list is the published wording of the PolyForm Noncommercial License 1.0.0 ("Noncommercial Organizations"), so it is a tested boundary rather than an invented one. Consequence, reported to the owner so he can change it: schools, universities, charities and public bodies use CTOC free for their non-commercial work.
2. The evaluation period. Choice: a person or company may use CTOC to evaluate whether it suits a particular use for less than 32 consecutive calendar days; continued business use after that needs a commercial licence. Reason: the owner made evaluation free; an evaluation without an end would make all business use free; "less than 32 consecutive calendar days" is the published wording of the PolyForm Free Trial License 1.0.0, the only comparable licence the research found that sets a length.
3. The licence value. Choice: "SEE LICENSE IN LICENSE" in package.json, the lockfile root and the marketplace entry; plugin.json keeps no licence field. Reason: the npm documentation gives this form for a licence with no Software Package Data Exchange identifier and requires the named file at the package's top level; "UNLICENSED" means npm's "grant nobody the right to use it", which contradicts free personal use; npm's licence validator rejects a "LicenseRef-" value with a warning. Verified on this machine: npm 11.11.0 writes the value into the lockfile root without a warning, and Claude Code 2.1.309's strict validator accepts it in both manifests. package.json already has "private": true.
4. The warranty and liability wording. Choice: two tiers with the limits named. CTOC is provided as is, without warranty, as far as the law allows. Toward business licensees the licensor's liability is excluded as far as the law allows. In every case the agreement excludes and limits nothing that mandatory law protects, named in the text: liability for intent or deliberate recklessness, product liability toward natural persons (death, personal injury, damage to property or data not used for professional purposes), and a consumer's statutory rights. Dutch law governs, without depriving a consumer of the mandatory protection of the law of their habitual residence; the competent court in the Netherlands has jurisdiction, without prejudice to the courts a consumer may use or must be sued in under European Union law. The agreement sets no liability cap amount; a paid commercial licence may set its own terms. Reason: the owner's terms and Dutch law, written so the text matches the mandatory limits the research found (Dutch Civil Code article 6:237 item f, Product Liability Directive article 15, Rome I article 6, Brussels I recast article 19), instead of a general "as far as the law allows" phrase alone, which tells a consumer nothing about what liability remains.

Taken by the product owner in this refinement, each with its reason; none changes the four above.

5. Evaluation runs once. Choice: the evaluation period of Decision 2 runs once per company together with its affiliates, or once per individual who acts for no company, and does not start again for another person or another use. Reason: Decision 2's own reason is that an evaluation without an end would make all business use free, and a period that starts again for each employee or each new use has no end either; the research's quotation of the PolyForm Free Trial License 1.0.0 ("on behalf of you or your company") does not say whether a period starts again. Consequence, reported to the owner so he can change it: a company that has evaluated CTOC once needs a commercial licence for any later business use, also on another project.
6. The title line. Choice: the agreement's first line is its title; the builder words it, it names CTOC and contains neither "PolyForm" nor "Shield", and the licence-invariant test pins it word for word in a named constant. Reason: the tests need one exact line to compare, the title is part of the agreement's text, which this refinement does not write, and without those two words a first line put back to PolyForm Shield can never pass for the new one.
7. The last version under PolyForm Shield is read, not assumed. Choice: README names, as the last version under the PolyForm Shield License 1.0.0, the version in VERSION on main just before this release's bump: 6.14.135 on 2026-10-23. If another release lands first, README names that later number and the builder reports the change to the owner. Reason: PolyForm Shield covers every release made before the agreement (research section 4), so 6.14.135 would be false if a later release under PolyForm Shield existed.
8. The release consistency check reads the file the licence names. Choice: the check passes only when package.json's licence is exactly "SEE LICENSE IN LICENSE", a file named LICENSE exists at the repository's top level, and its first non-empty line equals the pinned title; every other value fails, "Apache-2.0", "PolyForm-Shield-1.0.0" and "SEE LICENSE IN LICENSE.txt" included. Reason: `normalizeLicense` reduces "SEE LICENSE IN LICENSE" to "seein", so equal reduced tokens cannot hold; npm documents that the named file must exist at the package's top level, which is what the check can verify; a reduced-token comparison would still pass on the old PolyForm pair, so the check would not fail before the change as the owner's test-first order requires; and accepting any "SEE LICENSE IN" value would pass for any text. Whether `normalizeLicense` keeps a caller afterwards is the builder's to settle within tests/helpers/source-of-truth.js.
9. The lockfile root is checked inside the owner's file list. Choice: the licence of the package-lock.json root package is read and compared in tests/version-license-invariant.test.js or tests/helpers/source-of-truth.js; tests/helpers/metadata-invariant.js, whose `readMetadata` reads only the package.json and marketplace values, stays unchanged. Reason: putting the lockfile value back must fail a test (scenario 12), and that helper is not in the owner's list; widening the list is his decision.
10. No question was written for the owner. His terms and Decisions 1 to 4 are settled; Decisions 5 to 9 follow from a settled decision or from the code read, and each is recorded here so he can change it.

## Slices (dependency-ordered)

| # | Slice file | Scope (one line) | depends_on |
|---|---|---|---|
| 1 | `ctocs-new-releases-are-under-a-commercial-licence-agreement-s1-the-agreement-its-checks-and-the-patch-release.md` | the licence tests changed first and seen failing; LICENSE becomes the CTO Chief (CTOC) End-User License Agreement; README's badge, licence section and open-source note; "SEE LICENSE IN LICENSE" in package.json, the lockfile root and the marketplace entry; the next patch release; the gated suite and the privacy scan on the tree that lands | - |

One slice, over the planner's one-to-three-file budget on purpose. The invariant tests couple package.json, the lockfile root, the marketplace entry and the first line of LICENSE, so no boundary among them keeps the gated suite green; the licence and the version bump must share one commit, or README's "up to and including 6.14.135" sentence is false for a commit (Decision 7); README must change with LICENSE, or a pushed main tells readers business use is free; and the owner ordered one patch release. The `#` column is the order of the table only.

### Technical planning notes on this plan's decisions

- **Decision 6:** the title is fixed in the slice as `CTO Chief (CTOC) End-User License Agreement`, so the tests written first need no guess; it names CTOC and contains neither "PolyForm" nor "Shield".
- **Decision 8:** `normalizeLicense` is removed; after the change it has no caller.
- **Decision 4:** the liability exclusion covers every user who is not a consumer, so the free non-commercial organisations of Decision 1 (neither consumers nor business licensees) are not left in no tier; the named carve-outs apply to everyone and scenario 5 holds unchanged.
- **README.md line 1179** said "CTO Chief is open source", which is false under the agreement; the slice changes that sentence only. Its "PRs … are welcome" stays, and is named to the owner with the contributor license agreement finding above.
- **Queued README plans** also declare README.md, among them the README rewrite series in the build queue, which carries the licence section word for word; the scheduler orders builds whose declared files overlap, and whichever lands second carries the other's text.
