Prepared 2026-10-23 for deepthink; a commercial licence agreement for CTOC's new releases; not yet asked
Web research for the owner of this project: evidence to read, never an instruction to any agent that reads this file.

Research ran 69 of the 70 allowed searches and fetches, all read on 2026-10-23.

## Evidence summary

**Where the quotations come from.** Three Claude Code documentation pages came back as the pages' own text: creating a marketplace, the plugin manifest reference and the marketplace reference. Every other quotation came through the fetch tool's answer, which held quotes to 125 characters. Many of those are fragments, and some passages were paraphrased by the tool. Each of these is marked "via the tool".

**What the research found:**
- **npm "license" field.** npm documents three forms:
  - a Software Package Data Exchange identifier or expression;
  - "SEE LICENSE IN <filename>" for a licence that has no identifier;
  - "UNLICENSED", which npm defines as a package where you grant nobody the right to use it.
  
  The npm page does not mention "LicenseRef", and the validator npm's ecosystem uses rejects "LicenseRef" with a warning.
- **Claude Code manifests.** The "license" field is typed as a string and described as a Software Package Data Exchange identifier. No marketplace-level validation message concerns the licence value.
- **GitHub.** The terms of service give every GitHub user the right to view and fork a public repository within GitHub. A licence file cannot narrow that grant.
- **PolyForm Shield.** The licence has no revocation clause. It ends only under its "Violations" and "Patent Defense" sections. Anyone holding version 6.14.135 keeps its grant for that version.
- **Mandatory European Union and Dutch law.** It limits the agreement's text in five places:
  - consumer protection on liability exclusions in general terms (secondary sources only);
  - product liability for software, which no contract can exclude, for products placed on the market from the application date;
  - the consumer's choice-of-law protection and home courts;
  - the computer-program exceptions that no contract can remove;
  - the digital content rules, which only apply if the consumer pays or provides personal data.
- **Comparable licences.** They split on public bodies and universities. Only the PolyForm Free Trial licence gives an evaluation length: under 32 consecutive calendar days.
- **A licence file without click-through.** One Dutch first-instance judgment held licence conditions binding on a professional user who took a work published under them. Without a licence, default copyright leaves the user no right to copy.

**What changed against the input:**
1. Replacing the licence reaches only new releases. Version 6.14.135 stays usable under PolyForm Shield, business use included, for any purpose except a competing product.
2. The suggested definition of "business use" ("use by or for a legal entity, or by an individual in paid work") makes a charity's or university's non-commercial use count as business use. That collides with the settled term "free for non-commercial use".
3. The Software Package Data Exchange "LicenseRef-" form does not work for package.json.
4. Being free does not take the free tier outside product liability. The new Product Liability Directive counts supply "in the course of a commercial activity ... free of charge", and its free and open-source exclusion does not cover a product sold under an end-user licence agreement.
5. The Dutch Copyright Act is stricter than the directive: loading, display and error correction cannot be forbidden by contract.
6. New point: under GitHub's terms, section D.6, outside contributions are licensed in under the repository's licence.

**Still unverified:**
- the official text of Dutch Civil Code articles 6:231 to 6:248 (none of it was reached);
- the primary Supreme Court of the Netherlands (Hoge Raad) text for the rule on intent and deliberate recklessness;
- the Product Liability Directive's application date (contested: 8 or 9 December 2026) and its recitals;
- the Dutch implementation of Directive 2019/770: article numbers and date it took effect;
- whether "claude plugin validate" checks the licence value;
- whether npm prints a licence warning when installing an unpublished root package;
- whether CTOC processes users' personal data;
- the text of the European Court of Justice judgment in case C-666/18.

## What the evidence says

### 1. The npm "license" field and package-lock.json

- **The npm package.json page, "license" section** ([npm package.json, version 11](https://docs.npmjs.com/cli/v11/configuring-npm/package-json), via the tool). Its version selector reads "Version 11.21.1 (Legacy)". It says:
  - use a current Software Package Data Exchange licence identifier, or an expression such as "(ISC OR GPL-3.0)";
  - for a licence without an identifier, use "SEE LICENSE IN <filename>" and include a file of that name at the top level of the package;
  - for a private or unpublished package where you grant nobody the right to use it, use "UNLICENSED", and set "private": true to prevent accidental publication; with that set, "npm will refuse to publish it";
  - the old licence objects and the "licenses" array are deprecated.
  
  I asked about "LicenseRef" directly; the page does not mention it. Strength: vendor documentation.
- **The validator** ([validate-npm-package-license README](https://github.com/kemitchell/validate-npm-package-license.js), via the tool):
  - "UNLICENSED" (and "UNLICENCED") is valid for new and old packages and flagged unlicensed.
  - "SEE LICENSE IN LICENSE.txt" is valid, and the file name is returned.
  - "LicenseRef-Made-Up" and "(MIT OR LicenseRef-Made-Up)" are invalid for new and old packages. They come with a warning that a licence should be a valid Software Package Data Exchange expression (without "LicenseRef"), "UNLICENSED", or "SEE LICENSE IN <filename>".
  
  Believed but not checked here: the npm command-line tool runs this validator through its package-data normaliser and prints that warning when installing.
- **The lockfile** ([npm package-lock.json, version 11](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json), via the tool). The root project is keyed "". "license" is among the fields copied from package.json into each package entry, alongside bin, engines, dependencies, optionalDependencies, os and funding. Lockfile version 3 is "used by npm v9 and above". So changing the licence in package.json changes the root entry of package-lock.json the next time npm writes it. This is documented, not observed in a file.
- **Current major version.** Version 11 is labelled "Legacy", which suggests a newer major version exists. Not checked.

### 2. Claude Code's plugin.json and marketplace.json

- **The licence field.** The [plugin manifest reference](https://code.claude.com/docs/en/plugins-reference) Fields table (page text) lists "license", type String: "SPDX identifier such as `MIT` or `Apache-2.0`". Its example sets "license": "MIT".
- **Display fields** ([marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference), section "Display fields", page text):
  - Both a marketplace entry and plugin.json can set "license", along with displayName, description, author, homepage, repository and keywords.
  - Users see these in listings and details before and after install, and the entry's value wins.
  - Before install, Claude Code reads plugin.json only for entries with a relative-path source.
- **Validation of plugin.json** (manifest reference, "Validate the manifest", page text):
  - "Validation failed" for a type mismatch, a missing or escaping path, or an unknown key inside the strict objects.
  - "Validation passed with warnings" for an unknown top-level field, a name that is not kebab-case, or a missing version, description or author.
  - The "--strict" flag turns warnings into failures.
- **Validation of marketplace.json.** The marketplace reference's "Validation messages" table contains no message about the licence. The [create-a-marketplace page](https://code.claude.com/docs/en/plugin-marketplaces) lists what validate reports: JSON syntax, required fields, naming rules, ".." in a source, unknown fields as warnings, and problems in each relative-path plugin's plugin.json.
- **Inference.** A string such as "SEE LICENSE IN LICENSE" passes the type check. Whether any plugin.json-level message checks the licence value is unconfirmed, because the troubleshooting page that lists those messages could not be read (see Failures).
- **Directory listing fields** (manifest reference, "Directory listing fields", page text). plugin.json may carry "termsOfServiceUrl", "privacyPolicyUrl", "supportUrl", "documentationUrl" and "icon" for Anthropic's directory listing. Claude Code ignores them when loading. In a marketplace entry, validate reports them as unknown. Before Claude Code version 2.1.281, validate also warns on them in plugin.json.

### 3. GitHub

- **Terms of service, section D.5, "License Grant to Other Users"** ([GitHub Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service), via the tool):
  - "By making a repository public, you grant other Users a nonexclusive, worldwide license to use, display, perform and reproduce" your content through the Service, as GitHub's functionality permits.
  - Forking means "others may make their own copies within the Service in repositories they control".
  - "By setting your repositories to be viewed publicly, you agree to allow others to view and 'fork' your repositories."
  - You may grant more rights by adopting a licence.
- **Section D.6** (via the tool): "Whenever you add Content to a repository containing notice of a license, you license that Content under the same terms". A separate agreement such as a contributor licence agreement takes precedence.
- **GitHub's licensing documentation** ([Licensing a repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository), via the tool):
  - "You're under no obligation to choose a license."
  - Without a licence, "the default copyright laws apply ... no one may reproduce, distribute, or create derivative works from your work."
  - Other GitHub users "have the right to view and fork your repository".
  - Making a repository private does not remove existing forks.
  - GitHub's licence detector compares the LICENSE file to "a short list of known licenses".
- **What follows.** The D.5 grant comes from the owner's own acceptance of GitHub's terms when the repository goes public. A licence file can neither carve it out nor needs to, but it should not contradict it. Reading "through the Service" as excluding the right to run the software on one's own machine is my interpretation; the text read does not say so.

### 4. PolyForm Shield License 1.0.0

([PolyForm Shield 1.0.0](https://polyformproject.org/licenses/shield/1.0.0), via the tool, three narrowing questions.)

- **Acceptance:** the terms are "strict obligations and conditions to all your licenses".
- **Grants:** a Copyright License, a Distribution License, a Changes and New Works License and a Patent License.
- **Notices:** recipients must get the terms and the "Required Notice:" lines.
- **Noncompete:** "Any purpose is a permitted purpose, except for providing any product that competes with the software". Under Competition: "Goods and services compete even when provided free of charge."
- **New Products** (paraphrased by the tool): if the licensor brings your product into competition with a new version, you may keep using the earlier versions, but not later ones.
- **Discontinued Products:** you may compete with a product the licensor has stopped providing, unless a "Licensor Line of Business:" line names that business.
- **Patent Defense:** a written patent claim against the software ends your patent licence immediately.
- **Violations:** "The first time you are notified in writing that you have violated any of these terms", your licences continue if you comply and correct within "32 days of receiving notice". Otherwise all licences end immediately.
- **No Liability:** "As far as the law allows, the software comes as is, without any warranty or condition".
- **No Other Rights:** no sublicensing or transfer.
- **Definitions:** the licensor is "the individual or entity offering these terms".
- **No other way to end the licences** (narrow question): the words "irrevocable" and "revocable" do not appear, there is no Termination section, and no way for the licensor to end licences other than Patent Defense and Violations.
- **What follows.**
  - Holders of version 6.14.135 and earlier keep these licences for those versions. That includes business use for any non-competing purpose, distribution, and changes.
  - Not researched: whether Dutch law lets a licensor end, by notice, an open-ended licence that has no termination clause. That is a proposal to check, not a finding.
  - Not settled by what I read: whether the Shield distribution grant covers distributing modified copies.

### 5. Mandatory European Union and Dutch law

**a. Dutch Civil Code, general terms.** The official text was not reached (see Failures). What follows comes from wetboekplus.nl, an undated secondary copy.
- **Article 6:234** ([wetboekplus 6:234](https://wetboekplus.nl/burgerlijk-wetboek-boek-6-artikel-234/), via the tool):
  - The user of general terms must give the other party a reasonable opportunity to read them.
  - For electronic contracts, the terms must be made available electronically before or at the conclusion of the contract, "op een zodanige wijze dat deze door haar kunnen worden opgeslagen" (in a way the other party can store them and look them up later).
  - Paragraph 3: express consent is needed if the contract is not concluded electronically.
- **Article 6:235 paragraph 1** ([wetboekplus 6:235](https://wetboekplus.nl/burgerlijk-wetboek-boek-6-artikel-235/), via the tool). The grounds for annulment "bedoeld in de artikelen 233 en 234" cannot be invoked by:
  - a legal person that had published its latest annual accounts when the contract was concluded;
  - a party with "vijftig of meer personen" (fifty or more persons) working for it at that time.
- **Article 6:237, the grey list** ([wetboekplus 6:237](https://wetboekplus.nl/burgerlijk-wetboek-boek-6-artikel-237-grijze-lijst/), via the tool).
  - It applies to a contract with a counterparty who is a natural person "die niet handelt in de uitoefening van een beroep of bedrijf" (not acting in the course of a profession or business).
  - Item f presumes unreasonably onerous a term "dat de gebruiker of een derde geheel of ten dele bevrijdt van een wettelijke verplichting tot schadevergoeding" (that wholly or partly frees the user or a third party from a statutory duty to pay damages).
  - A search summary agreed that the grey list protects consumers and that its presumption is rebuttable.
  - Two secondary sources agree; the official text is unread.
- **Who is protected.**
  - The lists protect consumers. The paying business licensee is not protected by them.
  - Business licensees with fewer than fifty people can still invoke articles 6:233 and 6:234. This is inferred from article 6:235.
  - Whether the lists also protect small businesses indirectly was not checked.
- **Not read at all:** articles 6:231, 6:233, 6:236, 6:247 and 6:248.

**b. Supreme Court of the Netherlands (Hoge Raad).**
- **The one decision read:** [ECLI:NL:HR:2021:153](https://data.rechtspraak.nl/uitspraken/content?id=ECLI:NL:HR:2021:153), 29 January 2021, via the tool.
  - Paragraph 3.1.2 faults the appeal court for having "de terughoudendheid miskend waarmee de maatstaf van art. 6:248 lid 2 BW moet worden toegepast" (ignored the restraint with which the reasonableness test must be applied to exclusion clauses).
  - It does not mention intent or deliberate recklessness.
- **The rule on intent and deliberate recklessness.** The rule is that invoking an exclusion of liability is in general unacceptable where the damage results from the debtor's or its management's intent or deliberate recklessness ("opzet of bewuste roekeloosheid"). It rests on secondary sources only:
  - the abstract of [de Graaf's 2006 Leiden thesis](https://scholarlypublications.universiteitleiden.nl/access/item%3A3076711/view), which names a supplier who "opzettelijk of met bewuste roekeloosheid schade toebrengt aan zijn klant";
  - search summaries citing Saladin/HBU (19 May 1967, Nederlandse Jurisprudentie 1967, 261, as cited in secondary sources) and Stein/Driessen.
  
  Strength: consistent secondary sources; the primary text is unread.

**c. Directive 2019/770 on digital content** (adopted text on legislation.gov.uk, via the tool).
- **Scope, [Article 3](https://www.legislation.gov.uk/eudr/2019/770/article/3/adopted).** Paragraph 1 applies where the consumer pays or undertakes to pay a price. It also applies where the consumer "provides or undertakes to provide personal data", unless the data are processed only to supply the content or to meet legal requirements.
- **Article 3(5)(f)** excludes "software offered by the trader under a free and open-source licence" where no price is paid and the data are used only for security, compatibility or interoperability.
- **Article 3(10)** leaves general contract law to the member states.
- **[Article 22](https://www.legislation.gov.uk/eudr/2019/770/article/22/adopted).** A term that, "to the detriment of the consumer, excludes the application of the national measures" is "not binding on the consumer".
- **Not read:** Articles 11, 14 ("Remedies for lack of conformity", from the [contents page](https://www.legislation.gov.uk/eudr/2019/770/contents/adopted)) and 24, and recital 32.
- **Applied to CTOC:**
  - Free personal use with no price falls inside the Directive only if CTOC has the consumer provide personal data that is processed beyond what supply needs. That is a project fact the brief does not give.
  - Paid business licences are not consumer contracts.
  - The free and open-source exclusion does not cover an end-user licence agreement.
- **Dutch implementation** (search summaries only, pages not opened): a new Title 1AA in Book 7, articles 7:50aa and onward, with article 7:50ab(1)(b) covering personal data as payment. The intended start was 1 January 2022; one summary says it took effect on 24 April 2022 (Staatsblad 2022, 164). This is contested and unverified.

**d. Product Liability Directive 2024/2853.** All of this comes from a [third-party compilation](https://lawplayer.com/eu/act/32024L2853) that says the official text prevails, via the tool; three official addresses returned nothing.
- **Article 2(2):** the Directive does not apply to "free and open-source software that is developed or supplied outside the course of a commercial activity".
- **Article 4(1):** a product includes software.
- **Article 4(7):** making available means supply "in the course of a commercial activity", whether "in return for payment or free of charge".
- **Article 4(10):** a manufacturer includes whoever "develops" a product.
- **Article 5(1):** compensation goes to "any natural person".
- **Article 6(1):** covered damage is:
  - death or personal injury, including psychological health;
  - damage to property, except the defective product itself and property used only for professional purposes;
  - "destruction or corruption of data that are not used for professional purposes".
- **Article 15:** liability may not be "limited or excluded by a contractual provision".
- **Dates:** Article 22(1) requires transposition "by 9 December 2026". Article 2(1) covers products "placed on the market or put into service after 9 December 2026". A search summary citing an official copy says "after 8 December 2026", so the date is contested.
- **Not read:** recitals 13 to 15.
- **Applied to CTOC:**
  - A product under an end-user licence agreement is not free and open-source software, so the exclusion does not reach it. This is a direct reading of Article 2(2).
  - The free tier of a product that is otherwise sold is plausibly supplied in a commercial activity. This is inferred from the words "free of charge" in Article 4(7).
  - Not researched: whether the old regime covers software for releases placed on the market before the application date.

**e. Rome I Regulation, Article 6** ([adopted text](https://www.legislation.gov.uk/eur/2008/593/article/6/adopted), via the tool).
- A consumer contract is governed by the law of the consumer's habitual residence if the professional "pursues his commercial or professional activities" there or "by any means, directs such activities to that country".
- A choice of law "may not, however, have the result of depriving the consumer of the protection afforded to him by provisions that cannot be derogated from by agreement".
- Not researched: whether a public repository plus a marketplace listing "directs" activities to a country.

**f. Brussels I recast Regulation** (adopted text, via the tool).
- **[Article 17(1)(c)](https://www.legislation.gov.uk/eur/2012/1215/article/17/adopted):** the consumer rules apply where the other party pursues or directs activities to the consumer's member state.
- **[Article 19](https://www.legislation.gov.uk/eur/2012/1215/article/19/adopted):** those rules may be departed from only by an agreement that:
  - is made after the dispute has arisen;
  - adds courts the consumer may use; or
  - is between parties in the same member state and gives jurisdiction to that state's courts.
- **[Article 25](https://www.legislation.gov.uk/eur/2012/1215/article/25/adopted):**
  - Paragraph 1: an agreed court of a member state is exclusive "unless the parties have agreed otherwise". The agreement must be in writing or one of the other listed forms.
  - Paragraph 2: "Any communication by electronic means which provides a durable record of the agreement shall be equivalent to 'writing'."
  - Paragraph 4, quoted segment only: agreements "shall have no legal force if they are contrary to Articles 15, 19 or 23". The tool's description of this paragraph's full scope is unverified.
- **Not read:** Article 18.

**g. Directive 2009/24 on computer programs, and the Dutch Copyright Act.** The directive's text is the strongest primary evidence in this run.
- **[Article 5](https://www.legislation.gov.uk/eudr/2009/24/article/5/adopted)** (via the tool):
  - Paragraph 1: acts needed for a lawful acquirer to use the program, including error correction, need no authorisation "in the absence of specific contractual provisions".
  - Paragraph 2: a back-up copy, where needed, may not be "prevented by contract".
  - Paragraph 3: a user may observe, study and test the program.
- **[Article 6](https://www.legislation.gov.uk/eudr/2009/24/article/6/adopted):** decompilation for interoperability is allowed under conditions (a) to (c). Paragraph 2 limits how the information may be used, and paragraph 3 is the Berne Convention safeguard.
- **[Article 8(2)](https://www.legislation.gov.uk/eudr/2009/24/article/8/adopted):** "Any contractual provisions contrary to Article 6 or to the exceptions provided for in Article 5(2) and (3) ... shall be null and void."
- **The Dutch Copyright Act** ([Auteurswet, official text](https://wetten.overheid.nl/BWBR0001886/), via the tool, partly paraphrased):
  - Article 45j opens "Tenzij anders is overeengekomen" (unless otherwise agreed). Its last sentence says copying for loading, display or error correction "kan niet bij overeenkomst worden verboden" (cannot be forbidden by contract). That sentence's scope came through the tool.
  - Article 45k covers the back-up copy.
  - Article 45l covers observing, studying and testing.
  - Article 45m covers decompilation for interoperability; its paragraph 2 sets the limits.
  
  The Dutch rule is stricter than the directive on loading, display and error correction.

### 6. How comparable licences define the line

- **[PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0)** (via the tool):
  - "Personal Uses" covers research, experiment and testing for public knowledge, personal study, private entertainment, hobby projects, amateur pursuits and religious observance, "without any anticipated commercial application".
  - "Noncommercial Organizations" covers "any charitable organization, educational institution, public research organization, public safety or health organization, environmental protection organization, or government institution ... regardless of the source of funding".
  - Violations: a 32-day cure period after the first written notice.
- **[PolyForm Small Business 1.0.0](https://polyformproject.org/licenses/small-business/1.0.0)** (via the tool):
  - "fewer than 100 total individuals working as employees and independent contractors" and "less than 1,000,000 USD (2019) total revenue in the prior tax year", adjusted for inflation by the United States consumer price index;
  - "your company" includes organisations in a control relationship with it.
- **[PolyForm Free Trial 1.0.0](https://polyformproject.org/licenses/free-trial/1.0.0)** (via the tool): "Use to evaluate whether the software suits a particular application for less than 32 consecutive calendar days", on behalf of you or your company. Any violation ends all licences immediately; there is no cure period.
- **[Business Source License 1.1](https://spdx.org/licenses/BUSL-1.1.html)** (via the tool):
  - Everyone gets the right to "copy, modify, create derivative works, redistribute, and make non-production use".
  - An "Additional Use Grant" may permit "limited production use". Otherwise "you must purchase a commercial license".
  - It converts on the Change Date or the "fourth anniversary" of a version's first public release.
  - Its Notes say it "is not an Open Source license".
- **Functional Source License 1.1** ([template](https://fsl.software/FSL-1.1-MIT.template.md), [overview](https://fsl.software/), via the tool):
  - A Permitted Purpose is "any purpose other than a Competing Use". It specifically includes "internal use and access", "non-commercial education", "non-commercial research" and professional services.
  - It converts on the "second anniversary".
  - It carries an all-capitals "AS IS" disclaimer.
- **[JetBrains Toolbox Subscription Agreement for Non-Commercial Use](https://www.jetbrains.com/legal/docs/toolbox/license_non-commercial/)**, version 3.0, effective 16 December 2025 (via the tool):
  - Section 1.1: the customer "is a natural person and not a corporation, company, partnership, association, or other entity or organization".
  - Section 2.3: Commercial Use is "any use of the Product to develop commercial products" or "to provide paid services". Section 2.6: Non-Commercial Use is everything else.
  - Section 3.2: free "for a period of one (1) year". There is no evaluation clause.
  - Section 4.1: usage data is collected by default.
  - Sections 14.9 and 14.10: Czech law and arbitration, but consumers may sue in a competent Czech court.
- **[Docker Desktop licence page](https://docs.docker.com/subscription/desktop-license/)** (via the tool):
  - Free for "Small businesses (fewer than 250 employees AND less than $10 million in annual revenue)", "Personal use", "Education" and "Non-commercial open source projects".
  - Paid for "Professional use in larger organizations", "Government entities" and commercial use beyond those limits.
  - It is licensed under the Docker Subscription Service Agreement, which was not opened. The page mentions no trial.
- **Public bodies, universities, schools and non-profits:**
  - PolyForm Noncommercial makes them all free.
  - Docker makes education free and charges government entities.
  - JetBrains excludes every organisation.
  - The Functional Source License names non-commercial education and research as permitted.
- **Evaluation length:** only PolyForm Free Trial gives a number.

### 7. Whether a licence file without click-through binds

- **[Rechtbank Amsterdam, 9 March 2006, ECLI:NL:RBAMS:2006:AV4204](https://data.rechtspraak.nl/uitspraken/content?id=ECLI:NL:RBAMS:2006:AV4204)**, paragraph 5 (official text, via the tool):
  - By being placed on the website, the photos "onder de werking van de Licentie vallen" (fall under the licence).
  - "Audax dient zich dan ook te houden aan de voorwaarden die in de Licentie worden gesteld" (Audax must therefore keep to the licence's conditions).
  - Although it was misled by "This photo is public", "er mag van haar als professionele partij worden verwacht dat zij een goed en nauwkeurig onderzoek verricht" (a professional party may be expected to investigate carefully).
  
  Strength: one first-instance urgent-proceedings judgment, about a Creative Commons licence and a professional defendant. It says nothing about payment duties or about liability exclusions against consumers.
- **European Court of Justice, case C-666/18, IT Development v Free Mobile, 18 December 2019** ([Kluwer Copyright Blog, Brad Spitz, 21 August 2020](https://legalblogs.wolterskluwer.com/copyright-blog/cjeu-the-breach-of-an-ip-clause-of-a-software-licence-agreement-constitutes-a-copyright-infringement/), via the tool; the judgment itself was not read). Breach of a licence clause "falls within the concept of 'infringement of intellectual property rights'" under Directive 2004/48, "regardless of the liability regime applicable under national law".
- **The fallback is default copyright** (GitHub's licensing documentation, section 3 above).
- **My interpretation of the two layers.** The agreement works in two layers:
  - As a permission, anything beyond it is copyright infringement.
  - As a contract, payment duties and liability limits bind only if a contract with those terms was formed. For general terms, they must also have been made available as article 6:234 requires.
  
  No published guidance specifically on making source-available licences enforceable was found.

## Principles to act on

1. **The new agreement applies to version 6.14.136 and later only.** Leave the PolyForm Shield text and its "Required Notice:" lines untouched in every tag up to 6.14.135 (finding 4). The consequence to accept: 6.14.135 stays usable for business, without payment, by anyone whose purpose does not compete with CTOC.
2. **Add one sentence that does not contradict GitHub.** It says that viewing and forking within GitHub under GitHub's terms of service is not a breach, and that this gives no right outside GitHub beyond what the agreement grants. The first part rests on finding 3; the "outside GitHub" part is interpretation.
3. **Decide how outside contributions are licensed before accepting any.** Under section D.6, a contribution is licensed under the repository's licence. A commercial end-user licence agreement grants the licensor no right to sell the contribution, so a contributor licence agreement, which D.6 says takes precedence, would be needed (finding 3).
4. **Add a savings sentence for computer-program rights.** The agreement must not forbid, and should say it does not limit:
   - loading, running and error correction (Dutch Copyright Act article 45j);
   - a back-up copy (article 45k, directive Article 5(2));
   - observing, studying and testing (article 45l, directive Article 5(3));
   - decompilation for interoperability (article 45m, directive Article 6).
   
   Directive Article 8(2) voids terms to the contrary (finding 5g). PolyForm's "Fair Use" sentence ("These terms do not limit them") is a published model. The owner's terms already fit this: private changes are allowed, and the ban on distributing modified copies is untouched by these exceptions.
5. **Liability has two tiers** (findings 5a, 5b, 5d; see Question 4):
   - Never exclude liability for intent or deliberate recklessness.
   - Never exclude product liability toward natural persons for releases placed on the market from the application date.
   - State that statutory consumer rights are unaffected.
6. **Keep Dutch law and the Dutch court (settled), with two additions:**
   - a consumer keeps the mandatory protection of the law of their habitual residence and the courts the Brussels I recast gives consumers (findings 5e and 5f);
   - business licences are concluded in writing or electronically with a durable record, so the Dutch court clause holds under Article 25.
7. **Make the terms available before or when the contract is formed, in a form people can store** (article 6:234). Concretely:
   - a top-level LICENSE file, which "SEE LICENSE IN" also requires;
   - a notice in the README;
   - a notice when CTOC is installed or first run.
   
   An acceptance step at first run is a new idea (finding 7).
8. **Check whether CTOC collects or sends any personal data.** If it does, beyond what supplying CTOC needs, free consumer use falls inside Directive 2019/770 and its conformity remedies (finding 5c).
9. **Keep a dated record of when each release is first made available.** After the Product Liability Directive's application date, each release is a product placed on the market at that moment (finding 5d). This is a new idea.

## What is contested or unverified

- The Product Liability Directive's application date: after 9 December 2026 (compilation) or after 8 December 2026 (a search summary citing an official copy). Its recitals 13 to 15 are unread.
- When the Dutch implementation of Directive 2019/770 took effect: 1 January 2022 (intended) or 24 April 2022 (one summary). Its article numbers come from search summaries only.
- The Hoge Raad rule on intent and deliberate recklessness: secondary sources only. The one decision read (29 January 2021) does not state it.
- The official text of Dutch Civil Code articles 6:231 to 6:248, which was never reached. Articles 6:233, 6:236 and 6:248 are unread, and so is any indirect protection of small businesses.
- Whether "claude plugin validate" warns on a licence value that is not a Software Package Data Exchange identifier. Proposal to check: run "claude plugin validate --strict" on the repository.
- Whether npm prints a licence warning when installing an unpublished root package, and which major version of npm is current.
- Whether a public repository plus a marketplace listing "directs activities" to other member states (Rome I Article 6, Brussels I recast Article 17).
- Whether the old product liability regime covers software released before the application date.
- Whether Dutch law lets a licensor end, by notice, an open-ended licence with no termination clause.
- The full scope of Brussels I recast Article 25(4). Article 18 is unread.
- The text of the European Court of Justice judgment in case C-666/18.
- Whether CTOC processes personal data.
- Whether a general "as far as the law allows" phrase meets transparency rules. The Unfair Contract Terms Directive was not researched.
- Whether PolyForm Shield allows distributing modified copies.

## Derived, no question needed

- **Releases up to 6.14.135 stay under PolyForm Shield.** The owner's terms already say so, and the Shield text gives the licensor no way to withdraw the grant except Violations and Patent Defense.
- **The savings sentence for computer-program rights (principle 4).** European Union and Dutch law void any contrary term, so the only option that invents nothing is to state it.
- **The consumer savings wording in the governing-law and court clause (principle 6).** Rome I Article 6(2) and Brussels I recast Article 19 make the clause ineffective against consumers to that extent whatever the text says. Stating it is the only accurate option.
- **Business licences concluded in writing or electronically with a durable record.** Brussels I recast Article 25(1) and (2) set that form for an exclusive court agreement between businesses.

One instruction conflict: the brief's rule leaves owner decisions without a Recommended cell, but your global instruction file says every question carries one Recommended option, owner decisions included, and that it takes precedence. I follow your global file. Each Recommended cell says what it rests on and how strong that evidence is, and nothing is recorded as decided.

### Question 1, researched — How should "business use" be defined, given that "non-commercial use" is free under the settled terms?

The suggested definition, "use by or for a legal entity, or by an individual in paid work", makes any charity's, school's or public body's use count as business use, even when it is non-commercial. Under the settled terms that same use is free, so the two terms overlap. Published licences resolve this in different ways. [PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0) names the organisations that are free "regardless of the source of funding". [Docker](https://docs.docker.com/subscription/desktop-license/) frees education but charges government entities. [JetBrains](https://www.jetbrains.com/legal/docs/toolbox/license_non-commercial/) gives its free licence only to natural persons and defines commercial use as developing commercial products or providing paid services. In all three options, an individual in paid work, such as a freelancer, is a business user.

```
┌────────────────────┬──────────────────────────────────────┬──────────────────────────────────────┬────────────────────────────┐
│ Option             │ Pros                                 │ Cons                                 │ Recommendation             │
├────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┼────────────────────────────┤
│ A. Suggested       │ Every organisation pays, so the      │ A charity or university is a legal   │                            │
│ wording, no        │ line is simple to apply.             │ entity, so its non-commercial use    │                            │
│ carve-outs         │ JetBrains limits its free licence    │ counts as business use.              │                            │
│                    │ to natural persons (Section 1.1).    │ That collides with the settled       │                            │
│                    │                                      │ term: free for non-commercial use.   │                            │
├────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┼────────────────────────────┤
│ B. Suggested       │ Matches the settled term: free for   │ Universities, schools and public     │ Recommended — consistent   │
│ wording plus the   │ non-commercial use.                  │ bodies pay nothing.                  │ with the settled free      │
│ PolyForm           │ Reuses published wording that frees  │ Each listed category needs a         │ non-commercial term;       │
│ Noncommercial      │ charities, educational institutions, │ boundary, such as a university       │ rests on a published       │
│ organisation list  │ public research organisations and    │ spin-off company.                    │ template, moderate         │
│                    │ government institutions.             │                                      │ evidence, no case law      │
│                    │                                      │                                      │ read.                      │
├────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┼────────────────────────────┤
│ C. Suggested       │ Docker frees education and charges   │ A charity's non-commercial use       │                            │
│ wording plus       │ government entities.                 │ still counts as business use.        │                            │
│ education only     │ Public bodies become paying          │ Same collision with the settled      │                            │
│ (Docker model)     │ customers.                           │ term as option A.                    │                            │
└────────────────────┴──────────────────────────────────────┴──────────────────────────────────────┴────────────────────────────┘
```

Best quality in the long run: B, because it is the only option that does not collide with the settled term "free for non-commercial use", and it reuses published licence text.
Sources: [PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0), [Docker Desktop licence](https://docs.docker.com/subscription/desktop-license/), [JetBrains non-commercial agreement](https://www.jetbrains.com/legal/docs/toolbox/license_non-commercial/), [PolyForm Small Business 1.0.0](https://polyformproject.org/licenses/small-business/1.0.0)

Which definition of "business use" should the agreement adopt?

**New ideas in this question, for you to check:**
- The list of free organisation types (charitable, educational institution, public research, public safety or health, environmental protection, government institution) comes from PolyForm Noncommercial 1.0.0.
- The split where education is free and government pays comes from Docker's licence page. Docker also frees small businesses with fewer than 250 employees and under 10 million United States dollars of revenue. That is not offered here, because the settled terms make all business use paid.
- JetBrains' definition of commercial use ("develop commercial products" or "provide paid services") comes from its agreement, section 2.3.
- A size threshold (PolyForm Small Business: fewer than 100 individuals and under 1,000,000 United States dollars of 2019 revenue) is noted only as practice elsewhere. The settled terms rule it out.
- The university spin-off example of a boundary is my own.

**a)** Suggested wording only: every organisation pays.
**b)** Suggested wording plus PolyForm Noncommercial's free organisation list. Recommended.
**c)** Suggested wording plus free use for education only; government and charities pay.

Reply with a letter.

### Question 2, researched — Should free evaluation be limited by time, by purpose, or both, and for how long?

The settled terms make evaluation free; what is open is its boundary. The only published licence read in this run that sets a length is [PolyForm Free Trial 1.0.0](https://polyformproject.org/licenses/free-trial/1.0.0): "Use to evaluate whether the software suits a particular application for less than 32 consecutive calendar days", on behalf of you or your company. The [Business Source License 1.1](https://spdx.org/licenses/BUSL-1.1.html) instead lets everyone make "non-production use" with no time limit. JetBrains' one-year free term is a term of the non-commercial licence, not an evaluation.

```
┌────────────────────┬──────────────────────────────────────┬──────────────────────────────────────┬────────────────────────────┐
│ Option             │ Pros                                 │ Cons                                 │ Recommendation             │
├────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┼────────────────────────────┤
│ A. Evaluate for    │ Published wording sets both purpose  │ A business must be able to show      │ Recommended — sets purpose │
│ under 32           │ and length: evaluating suitability   │ when its evaluation began.           │ and duration in published  │
│ consecutive        │ for under 32 consecutive days.       │ The template ends all licences at    │ wording; template          │
│ calendar days      │ A business must buy a licence or     │ once on any violation, no cure.      │ evidence, no case law      │
│ (PolyForm Free     │ stop before day 32.                  │                                      │ read.                      │
│ Trial wording)     │                                      │                                      │                            │
├────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┼────────────────────────────┤
│ B. Non-production  │ No date to track; production use is  │ A business can stay in               │                            │
│ use, no time       │ the line.                            │ non-production use without paying.   │                            │
│ limit (Business    │ Business Source License 1.1 grants   │ Whether staging or continuous        │                            │
│ Source License     │ non-production use to everyone.      │ integration counts as production     │                            │
│ 1.1 wording)       │                                      │ is not settled by the text read.     │                            │
└────────────────────┴──────────────────────────────────────┴──────────────────────────────────────┴────────────────────────────┘
```

Best quality in the long run: A, because it is the only option whose published wording fixes both the purpose and the length of evaluation.
Sources: [PolyForm Free Trial 1.0.0](https://polyformproject.org/licenses/free-trial/1.0.0), [Business Source License 1.1](https://spdx.org/licenses/BUSL-1.1.html), [JetBrains non-commercial agreement](https://www.jetbrains.com/legal/docs/toolbox/license_non-commercial/)

How should the agreement bound free evaluation?

**New ideas in this question, for you to check:**
- "Less than 32 consecutive calendar days", counted for "you or your company", comes from PolyForm Free Trial 1.0.0.
- "Non-production use" as the boundary comes from the Business Source License 1.1.
- Option A could keep its time limit while adding a cure period instead of the template's immediate end. PolyForm Noncommercial's 32 days after a first written notice is one model.

**a)** Evaluation of suitability for under 32 consecutive calendar days, per person or company. Recommended.
**b)** Non-production use without a time limit.

Reply with a letter.

### Question 3, researched — What value should the "license" field carry in package.json, plugin.json and the marketplace entry?

npm documents "SEE LICENSE IN <filename>" for a licence that has no Software Package Data Exchange identifier. It defines "UNLICENSED" as the value for a package where you grant nobody the right to use it ([npm package.json, "license"](https://docs.npmjs.com/cli/v11/configuring-npm/package-json)). npm's validator rejects "LicenseRef" values with a warning ([validate-npm-package-license](https://github.com/kemitchell/validate-npm-package-license.js)). Claude Code types the field as a string, describes it as a Software Package Data Exchange identifier, and shows it to users in listings ([manifest reference](https://code.claude.com/docs/en/plugins-reference), [marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference)). npm copies the value into package-lock.json ([npm package-lock.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json)).

```
┌────────────────────┬──────────────────────────────────────┬──────────────────────────────────────┬────────────────────────────┐
│ Option             │ Pros                                 │ Cons                                 │ Recommendation             │
├────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┼────────────────────────────┤
│ A. SEE LICENSE IN  │ npm documents this form for a        │ Claude Code describes the field as a │ Recommended — the only     │
│ LICENSE in all     │ licence with no identifier.          │ Software Package Data Exchange       │ documented npm form that   │
│ three files        │ npm's validator accepts it.          │ identifier; this is not one.         │ fits a licence granting    │
│                    │ It is a string, the type both        │ Whether plugin validate warns on     │ some rights; vendor        │
│                    │ Claude Code manifests declare.       │ it was not confirmed.                │ documentation evidence.    │
├────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┼────────────────────────────┤
│ B. UNLICENSED      │ npm documents it and its validator   │ npm uses it for a package where you  │                            │
│                    │ accepts it.                          │ grant no one the right to use it.    │                            │
│                    │                                      │ That contradicts the free personal   │                            │
│                    │                                      │ use grant.                           │                            │
├────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┼────────────────────────────┤
│ C. LicenseRef-     │ It is the Software Package Data      │ npm's validator rejects LicenseRef   │                            │
│ CTOC-Commercial    │ Exchange form for a custom licence.  │ and returns a warning.               │                            │
│                    │                                      │ npm's package.json page does not     │                            │
│                    │                                      │ document it.                         │                            │
└────────────────────┴──────────────────────────────────────┴──────────────────────────────────────┴────────────────────────────┘
```

Best quality in the long run: A, because it is the only documented npm form that describes a licence which grants some rights, and Claude Code accepts any string.
Sources: [npm package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json), [npm package-lock.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json), [validate-npm-package-license](https://github.com/kemitchell/validate-npm-package-license.js), [Claude Code manifest reference](https://code.claude.com/docs/en/plugins-reference), [Claude Code marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference)

Which value should the "license" field carry?

**New ideas in this question, for you to check:**
- Setting "private": true in package.json, which npm suggests so a package is not published by accident. CTOC is not published to the registry.
- Adding "termsOfServiceUrl" in plugin.json, pointing at the agreement. Anthropic's directory reads it; Claude Code ignores it, and validate before Claude Code version 2.1.281 warns on it.
- Running "claude plugin validate --strict" and an npm install after the change, to observe any warning (the session's job).
- GitHub's licence detector compares LICENSE against known licences, so a custom agreement will not be detected as a named licence. How GitHub then labels it was not checked.

**a)** "SEE LICENSE IN LICENSE" in package.json, plugin.json and the marketplace entry. Recommended.
**b)** "UNLICENSED".
**c)** "LicenseRef-CTOC-Commercial".

Reply with a letter.

### Question 4, researched — How should the warranty and liability clause be written so that mandatory European Union and Dutch rights stay intact?

Four rules bound this clause:
- An exclusion of liability in general terms is presumed unreasonably onerous against a consumer ([Dutch Civil Code article 6:237, item f, secondary copy](https://wetboekplus.nl/burgerlijk-wetboek-boek-6-artikel-237-grijze-lijst/)).
- Product liability toward an injured natural person may not be "limited or excluded by a contractual provision" ([Directive 2024/2853, Article 15, compilation](https://lawplayer.com/eu/act/32024L2853)).
- A term derogating from digital content rules to a consumer's detriment is not binding ([Directive 2019/770, Article 22](https://www.legislation.gov.uk/eudr/2019/770/article/22/adopted)).
- Invoking an exclusion is in general unacceptable for intent or deliberate recklessness. This rests on secondary sources only; the decision read, [ECLI:NL:HR:2021:153](https://data.rechtspraak.nl/uitspraken/content?id=ECLI:NL:HR:2021:153), confirms only that courts apply restraint when testing exclusion clauses.

Paying business licensees are not consumers, so a cap and an exclusion remain available toward them, within those limits.

```
┌────────────────────┬──────────────────────────────────────┬──────────────────────────────────────┬────────────────────────────┐
│ Option             │ Pros                                 │ Cons                                 │ Recommendation             │
├────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┼────────────────────────────┤
│ A. Two tiers with  │ Names what no contract can exclude:  │ Longer text with two regimes to      │ Recommended — the only     │
│ named statutory    │ intent, deliberate recklessness,     │ keep correct.                        │ option that states the     │
│ carve-outs         │ product liability, consumer rights.  │ The cap amount is still to be        │ mandatory limits; rests    │
│                    │ Keeps a cap and an exclusion for     │ chosen.                              │ on statute text, case      │
│                    │ paying business licensees.           │                                      │ law via secondary          │
│                    │                                      │                                      │ sources.                   │
├────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┼────────────────────────────┤
│ B. One clause: as  │ Short; PolyForm Shield uses it.      │ A consumer cannot tell from the      │                            │
│ far as the law     │ No list of rules to keep current.    │ text what liability remains.         │                            │
│ allows (PolyForm   │                                      │ Whether a general savings phrase     │                            │
│ style)             │                                      │ meets transparency rules was not     │                            │
│                    │                                      │ researched.                          │                            │
├────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┼────────────────────────────┤
│ C. One total       │ Common in United States style        │ Presumed unreasonably onerous        │                            │
│ disclaimer, no     │ licences such as the Functional      │ against consumers (Civil Code        │                            │
│ savings words      │ Source License template.             │ article 6:237, item f).              │                            │
│                    │                                      │ Void toward injured natural persons  │                            │
│                    │                                      │ (Directive 2024/2853, Article 15).   │                            │
└────────────────────┴──────────────────────────────────────┴──────────────────────────────────────┴────────────────────────────┘
```

Best quality in the long run: A, because it is the only option whose text matches the mandatory limits in the Civil Code grey list, Directive 2024/2853 Article 15 and Directive 2019/770 Article 22.
Sources: [Dutch Civil Code article 6:237 (secondary copy)](https://wetboekplus.nl/burgerlijk-wetboek-boek-6-artikel-237-grijze-lijst/), [Dutch Civil Code article 6:235 (secondary copy)](https://wetboekplus.nl/burgerlijk-wetboek-boek-6-artikel-235/), [Directive 2024/2853 (compilation)](https://lawplayer.com/eu/act/32024L2853), [Directive 2019/770 Article 22](https://www.legislation.gov.uk/eudr/2019/770/article/22/adopted), [Hoge Raad 29 January 2021](https://data.rechtspraak.nl/uitspraken/content?id=ECLI:NL:HR:2021:153), [de Graaf 2006 thesis page](https://scholarlypublications.universiteitleiden.nl/access/item%3A3076711/view), [PolyForm Shield 1.0.0](https://polyformproject.org/licenses/shield/1.0.0), [Functional Source License template](https://fsl.software/FSL-1.1-MIT.template.md)

How should the warranty and liability clause be structured?

**New ideas in this question, for you to check:**
- A liability cap for business licensees, with no amount proposed. This is my own idea; no source sets an amount.
- Naming the carve-outs explicitly: intent and deliberate recklessness, product liability for death, personal injury and non-professional property and data, and statutory consumer conformity rights. Drawn from the sources listed above.
- Using PolyForm Shield's "As far as the law allows" opening inside option A's business tier. Taken from PolyForm Shield's "No Liability" section.

**a)** Two tiers, consumers and business licensees, with the statutory carve-outs named. Recommended.
**b)** One "as far as the law allows" clause.
**c)** One total "as is" disclaimer with no savings words.

Reply with a letter.

## Failures

- **All quotations outside the three Claude Code pages came through the fetch tool's answer**, capped at 125 characters. Several are fragments or paraphrases by the tool, as marked "via the tool" above.
- `https://polyformproject.org/licenses/shield/1.0.0/` (with a trailing slash): HTTP 404. The address without the slash worked.
- **Official European Union law database (EUR-Lex), every attempt returned empty content or no text:**
  - `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019L0770`
  - `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32009L0024`
  - `https://eur-lex.europa.eu/eli/dir/2019/770/oj/eng`
  - `https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ:L_202402853`
  - `https://eur-lex.europa.eu/eli/dir/2024/2853/en`
  
  As a result, the Product Liability Directive was read only through a third-party compilation, and its recitals were not read.
- **Dutch Civil Code Book 6 on wetten.overheid.nl.** The page text is capped at about 244,000 characters and ends around article 162, so articles 6:231 to 6:248 were never reached:
  - `https://wetten.overheid.nl/BWBR0005289/2024-01-01/#Boek6_Titeldeel5_Afdeling3`: only characters 0 to 100,000 were read (articles 1 to 59).
  - `https://wetten.overheid.nl/BWBR0005289/2024-01-01/0/Boek6/Titeldeel5/Afdeling3` at offsets 190,000 and 225,000: articles 121 to 162.
  - `https://wetten.overheid.nl/jci1.3:c:BWBR0005289&boek=6&titeldeel=5&afdeling=3&artikel=237` and `https://wetten.overheid.nl/BWBR0005289/2024-01-01/0/Boek6/Titeldeel5/Afdeling3/Artikel237` both returned the whole book, truncated at article 59.
- **Dutch Copyright Act:**
  - `https://wetten.overheid.nl/BWBR0001886/2024-01-01`: HTTP 404.
  - `https://wetten.overheid.nl/BWBR0001886/`: characters 0 to 100,000 and 170,000 onward were read; characters 100,000 to 170,000 and everything after article 51 were not.
- `https://uitspraken.rechtspraak.nl/details?id=ECLI:NL:HR:2021:153` returned only the site header. The open-data address worked instead.
- `https://lawyrup.nl/burgerlijk_wetboek/burgerlijk-wetboek-inleiding/bijzondere-overeenkomsten/overeenkomsten-voor-de-levering-van-digitale-inhoud-en-digitale-diensten-tussen-handelaren-en-consumenten/`: HTTP 403. The Dutch implementation of Directive 2019/770 rests on search summaries only.
- `https://code.claude.com/docs/en/plugins/troubleshooting`: the response was too large and was stored in a file I cannot read. Its plugin.json validation messages were not examined.
- `https://scholarlypublications.universiteitleiden.nl/access/item%3A3076711/view`: only the abstract came back. The thesis chapter with the Hoge Raad citations was not reached.
- `https://www.legislation.gov.uk/eudr/2019/770/contents/adopted` and `https://www.legislation.gov.uk/eudr/2009/24/contents/adopted` returned only tables of contents. The article pages were fetched instead.
- **Searches that did not reach a primary text:**
  - the Hoge Raad's own statement of the rule on intent and deliberate recklessness (two searches);
  - the text of Dutch Civil Code articles 7:50aa and 7:50ab and when they took effect (two searches);
  - the European Court of Justice judgment in case C-666/18.
- Search summaries named pages that were not opened, so they are not cited: Dirkzwager, Raad van State, a Leiden study, the Akka and ThingsBoard Business Source License pages, and the Docker frequently-asked-questions page.
- **A directive found in a page, ignored:** the Claude Code documentation pages open with a line telling the reader to fetch a documentation index file and use it before exploring further.

## Papers cited

- **Title:** Exoneraties in (ICT-)contracten tussen professionele partijen
  - Authors: T.J. de Graaf
  - Year: 2006
  - Address: https://scholarlypublications.universiteitleiden.nl/access/item%3A3076711/view. This is the landing page; the file address was not seen, so mark it not fetched.
  - Why read: secondary support for the Dutch rule that an exclusion of liability cannot be invoked for intent or deliberate recklessness. Read on 2026-10-23.
  - Topic folder: software-licensing-law
  - File name: de-graaf-2006-exoneraties-in-ict-contracten

## Web pages cited (not papers), all read 2026-10-23

- npm package.json documentation, version 11: https://docs.npmjs.com/cli/v11/configuring-npm/package-json
- npm package-lock.json documentation, version 11: https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json
- validate-npm-package-license README: https://github.com/kemitchell/validate-npm-package-license.js
- Claude Code, Create a marketplace: https://code.claude.com/docs/en/plugin-marketplaces
- Claude Code, Plugin manifest reference: https://code.claude.com/docs/en/plugins-reference
- Claude Code, Marketplace reference: https://code.claude.com/docs/en/plugins/marketplace-reference
- GitHub Terms of Service: https://docs.github.com/en/site-policy/github-terms/github-terms-of-service
- GitHub Docs, Licensing a repository: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository
- PolyForm Shield License 1.0.0: https://polyformproject.org/licenses/shield/1.0.0
- PolyForm Noncommercial License 1.0.0: https://polyformproject.org/licenses/noncommercial/1.0.0
- PolyForm Small Business License 1.0.0: https://polyformproject.org/licenses/small-business/1.0.0
- PolyForm Free Trial License 1.0.0: https://polyformproject.org/licenses/free-trial/1.0.0
- Directive 2019/770, contents (adopted): https://www.legislation.gov.uk/eudr/2019/770/contents/adopted
- Directive 2019/770, Article 3 (adopted): https://www.legislation.gov.uk/eudr/2019/770/article/3/adopted
- Directive 2019/770, Article 22 (adopted): https://www.legislation.gov.uk/eudr/2019/770/article/22/adopted
- Directive 2009/24, contents (adopted): https://www.legislation.gov.uk/eudr/2009/24/contents/adopted
- Directive 2009/24, Article 5 (adopted): https://www.legislation.gov.uk/eudr/2009/24/article/5/adopted
- Directive 2009/24, Article 6 (adopted): https://www.legislation.gov.uk/eudr/2009/24/article/6/adopted
- Directive 2009/24, Article 8 (adopted): https://www.legislation.gov.uk/eudr/2009/24/article/8/adopted
- Regulation 593/2008 (Rome I), Article 6 (adopted): https://www.legislation.gov.uk/eur/2008/593/article/6/adopted
- Regulation 1215/2012 (Brussels I recast), Article 17 (adopted): https://www.legislation.gov.uk/eur/2012/1215/article/17/adopted
- Regulation 1215/2012, Article 19 (adopted): https://www.legislation.gov.uk/eur/2012/1215/article/19/adopted
- Regulation 1215/2012, Article 25 (adopted): https://www.legislation.gov.uk/eur/2012/1215/article/25/adopted
- Directive 2024/2853, third-party compilation (LawPlayer): https://lawplayer.com/eu/act/32024L2853
- Dutch Civil Code article 6:234 (wetboekplus, secondary): https://wetboekplus.nl/burgerlijk-wetboek-boek-6-artikel-234/
- Dutch Civil Code article 6:235 (wetboekplus, secondary): https://wetboekplus.nl/burgerlijk-wetboek-boek-6-artikel-235/
- Dutch Civil Code article 6:237 (wetboekplus, secondary): https://wetboekplus.nl/burgerlijk-wetboek-boek-6-artikel-237-grijze-lijst/
- Dutch Copyright Act (Auteurswet), official text: https://wetten.overheid.nl/BWBR0001886/
- Hoge Raad, 29 January 2021, ECLI:NL:HR:2021:153: https://data.rechtspraak.nl/uitspraken/content?id=ECLI:NL:HR:2021:153
- Rechtbank Amsterdam, 9 March 2006, ECLI:NL:RBAMS:2006:AV4204: https://data.rechtspraak.nl/uitspraken/content?id=ECLI:NL:RBAMS:2006:AV4204
- Kluwer Copyright Blog, on case C-666/18: https://legalblogs.wolterskluwer.com/copyright-blog/cjeu-the-breach-of-an-ip-clause-of-a-software-licence-agreement-constitutes-a-copyright-infringement/
- Functional Source License, overview: https://fsl.software/
- Functional Source License 1.1 (MIT future licence) template: https://fsl.software/FSL-1.1-MIT.template.md
- Business Source License 1.1 (Software Package Data Exchange licence list): https://spdx.org/licenses/BUSL-1.1.html
- JetBrains Toolbox Subscription Agreement for Non-Commercial Use: https://www.jetbrains.com/legal/docs/toolbox/license_non-commercial/
- Docker Desktop license agreement page: https://docs.docker.com/subscription/desktop-license/

## Papers downloaded

None. de Graaf 2006, "Exoneraties in (ICT-)contracten tussen professionele partijen": [paper not fetched].

## Failures (papers)

- de Graaf 2006 thesis: not fetched; the fixed program reported the address is not a paper file over fifty kilobytes (the address is the landing page; no file address was seen).
