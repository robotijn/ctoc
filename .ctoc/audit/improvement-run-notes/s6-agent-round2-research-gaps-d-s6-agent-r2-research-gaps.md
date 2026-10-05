# s6 agent round 2 — research gaps pass — citation-validator report (verbatim)

Dispatch d-s6-agent-r2-research-gaps, received 2026-10-01 16:13 CEST; 13 fetches (5 failed). Saved by the session without edits.

---

# Dependency-analyzer agent, round 2 gaps pass (dispatch d-s6-agent-r2-research-gaps)

I edited nothing. I used 13 of 14 fetches; 5 of them failed. I also ran 5 web searches. Three of the fetches saved PDFs, and I read their pages directly at no extra fetch cost. I could not recompute the fingerprint because I have no shell.

None of these sources is cited in `agents/architecture/dependency-analyzer.md` today. An exact search for Melton, Al-Mutawa, Falleri, Oyetoyan, CWE, 5055, ArchUnit and dependency-cruiser found nothing. So these verdicts decide what the round-2 additions may say. The agent's own lines are affected only where noted. Everything was read on 2026-10-01.

**Bottom line**
- **Kept:** the agent's "no published source defines" the severities and penalties (lines 41 and 672), and "Use no threshold on I" (line 181). Both are now backed by sources I read in full.
- **Round 2 corrected:** its gap 6, which said the agent's default layer rules break ISO/IEC 5055's layer-skipping rule, is overstated. The standard's detection pattern defers to each application's own layer design.
- **Do not add without a human who has access:**
  - Melton and Tempero's 45% and 10% figures.
  - Al-Mutawa's "package local" sentence.
  - SonarQube's default severities and its "more significant" sentence.
  - The 2023 renaming in ISO/IEC 25010.

| # | Claim checked (whose) | Verdict | Address | Sentence read |
|---|---|---|---|---|
| 1 | Melton and Tempero 2007: "about 45% have a cycle of at least 100 classes, about 10% at least 1,000" (round 2) | **UNVERIFIABLE.** Recommended action if it is ever added: strip the figures. The metadata is **VERIFIED**: "An empirical study of cycles among classes in Java", 2007, Empirical Software Engineering 12(4):389–415. | Springer link page: 303 redirect to a login page (idp.springer.com). Semantic Scholar programming interface: HTTP 404. [OpenAlex](https://api.openalex.org/works/doi:10.1007/s10664-006-9033-1): metadata only, "abstract_inverted_index field is null". | None. The figures exist only as a search snippet again, which is not a source I read. |
| 2a | Al-Mutawa and others, Australian Software Engineering Conference 2014, digital object identifier 10.1109/ASWEC.2014.15 (round 2, "believed") | **VERIFIED** | [Crossref](https://api.crossref.org/works/10.1109/ASWEC.2014.15) | Title "On the Shape of Circular Dependencies in Java Programs"; authors Hussain A. Al-Mutawa, Jens Dietrich, Stephen Marsland, Catherine McCartin; "2014 23rd Australian Software Engineering Conference"; pages 48-57; April 2014. |
| 2b | Most package-level cycles are "package local" and "may not be critical" (round 2) | **UNVERIFIABLE.** Recommended action: strip it. | Crossref: "No abstract field is present". [Semantic Scholar programming interface](https://api.semanticscholar.org/graph/v1/paper/DOI:10.1109/ASWEC.2014.15?fields=title,abstract,year,venue,authors): abstract null; the summarizer said the publisher withheld it. | None. |
| 3a | "No published source defines" the severities, penalties and bands (agent lines 41 and 672). Also round 2's reading that ISO/IEC 5055 gives "no per-weakness penalty". | **VERIFIED.** The standard's measure is an unweighted count. It names weighting by severity only as an informative idea and expressly calls it non-normative, with no values. | [Object Management Group, Automated Source Code Quality Measures 1.0, formal/20-01-02, January 2020](https://www.omg.org/spec/ASCQM/1.0/PDF). This is the document ISO/IEC 5055 was prepared from. That the two texts are identical is believed, not checked. | Clause 9.1 (Normative), page 229: "Detection pattern score is the count of occurrences, / Weakness score is its detection pattern score, / Quality characteristic score is the sum of its weakness scores." Clause 10.1 (Informative), page 231, Table 6 row: "Weight each quality measure element by its severity", followed by "However, these weighting schemes are not derived from any existing standards and are therefore not normative." |
| 3b | A cycle is a weakness with no length condition (supports agent line 194) | **VERIFIED** | Same document: clause 7.1.25 on pages 39–40; detection pattern 8.2.113 on page 210 | 7.1.25 "CWE-1047 Modules with Circular Dependencies", detection pattern "ASCQM Ban Circular Dependencies between Modules". Pattern 8.2.113: "Identify occurrences in application model where: - the <Module> module cycles back to itself - via the <ModuleDependencyCycle> module dependency cycle". No length, size or grading appears. |
| 3c | Round 2 gap 6: the defaults' controllers→domain and controllers→models imports (and the similar service and repository imports) "are skips under that definition unless domain and models are declared vertical" | **QUALIFIED; overstated.** The standard's detection pattern for a layer-skipping call compares calls against the application's own intended layer design. The agent's default rules (line 169) are such a design, so they are not misaligned with the standard. The agent may name CWE-1054 for its controller-to-repository finding if it says the layer design is its own default. | Same document: clause 7.1.11 on page 34; detection pattern 8.2.44 on page 144 | 7.1.11: usage name "Layer-skipping calls", detection pattern "ASCQM Ban Unintended Paths". Pattern 8.2.44: "where relations from the <OriginModule> layer, component, or subsystem to the <TargetModule> layer, component, or subsystem are not intended" and "The architectural blueprint defining layers, components, or subsystems is application dependent." |
| 3d | Round 2 numbers the detection patterns "8.114" and "8.128" | **UNVERIFIABLE for the ISO text.** The Object Management Group text numbers them 8.2.113 and 8.2.127. Recommended action: cite clauses 7.1.11 and 7.1.25, which match in both documents, and not the pattern numbers. | Same document, contents pages ix–x | "8.2.113 ASCQM Ban Circular Dependencies between Modules ... 210"; "8.2.127 ASCQM Limit Number of Outward Calls ... 221" |
| 4a | SonarQube rules S7027 and S7091 are deprecated (round 2, search snippet) | **VERIFIED**, read through the fetch tool's summarizer. Today is 2026-10-01, past the stated removal date, so do not suggest these rules. Whether they were actually removed was not checked. | [SonarQube Server 2026.1 long-term-support release notes](https://docs.sonarsource.com/sonarqube-server/2026.1/server-update-and-maintenance/lta-to-lta-release-notes) | Under "Removals and deprecations": "The cycle detection and architecture as code for Java and JS/TS are deprecated (S7027, S7091, S7134, S7197), pending removal in January 2026." The version, 2025.6, comes from a heading the summarizer gave. |
| 4b | Default severity of the two rules, and whether cross-package cycles are rated "more significant" (round 2, search snippet) | **UNVERIFIABLE** | rules.sonarsource.com: DNS failure (`getaddrinfo ENOTFOUND`). The rule-specification repository on GitHub, at a path I guessed: HTTP 404. | None |
| 5 | Third-party package risk belongs to `security/dependency-checker` (agent lines 24 and 781) | **Supported as a separate concern.** The framework treats third-party components as a vetting task about vulnerabilities and maintenance. Nothing I read covers a codebase's internal import graph. Which agent owns the task is the agent's own design choice; the framework does not say. | [NIST SP 800-218, Secure Software Development Framework Version 1.1, PDF](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf). I fetched the PDF rather than the CSRC page. | PW.4.4, page 13: "Verify that acquired commercial, open-source, and all other third-party software components comply with the requirements, as defined by the organization, throughout their life cycles." Example 1: "Regularly check whether there are publicly known vulnerabilities in the software modules and services that vendors have not yet fixed." PS.3.2, page 10: "Collect, safeguard, maintain, and share provenance data for all components of each software release (e.g., in a software bill of materials [SBOM])." |
| 6 | ISO/IEC 25010:2023 renamed "usability" to "interaction capability" (round 2, "believed") | **UNVERIFIABLE.** It stays believed. The agent does not cite ISO/IEC 25010. If round 2's optional one-line anchor is added, give no edition-specific names of quality characteristics. | iso.org/standard/78176.html: HTTP 403 | None |
| 7a | Agent line 181, "Use no threshold on I", tested against the "Zones of Pain" study | **VERIFIED: the study gives no threshold on instability.** Its only cut points (0.2, 0.4 and 0.6) are on distance from the main sequence, are used for its own analysis, and are not recommended. It finds the effect inconsistent, which supports not thresholding. | [Petrić, Hall, Bowes, Lancaster University, QUATIC 2020 (a software-quality conference)](https://eprints.lancs.ac.uk/id/eprint/148032/1/QUATIC_2020_Relationship_Between_Faults_and_Design_Metrics.pdf), pages 1, 5 and 7 | Abstract: "Our results show that architecture has an inconsistent impact on defect–proneness." Page 5: "We used three thresholds, 0.2, 0.4 and 0.6 to calculate the ratios defined in Equation 2." Page 7: "the effect is not consistent across all the systems." If anyone cites this paper, use its Equation 1, I = Fan_out/(Fan_out+Fan_in): its prose definition of instability, on page 2, disagrees with that equation. |
| 7b | Elish and others 2011 abstract | **UNVERIFIABLE** (the abstract). The venue is **VERIFIED**: Advances in Engineering Software 42(10):852–859, digital object identifier 10.1016/j.advengsoft.2011.06.001. One source is OpenAlex metadata; the other, independent one is the Zones paper's reference 8. | [OpenAlex search](https://api.openalex.org/works?filter=title.search:three%20metrics%20suites%20fault%20prediction%20packages%20eclipse&select=title,doi,publication_year,abstract_inverted_index&per-page=3): "abstract_inverted_index is null" | Second-hand, from the Zones paper, page 1: "Elish et al. demonstrated that Martin's suite of metrics [14] significantly outperformed the other two metric suites analysed." I did not read Elish's own words. |

**Attack I ran on item 3:** the clause 9 and clause 10 text comes from the Object Management Group's 2020 document, not from the ISO/IEC 5055:2021 text. If ISO had changed clause 9 to weight weaknesses, verdict 3a would fail. That attack only partly fails:
- Clauses 7.1.11 and 7.1.25 have the same numbers and titles in both documents, which suggests the text carried over.
- But the title of clause 9 differs slightly. The Object Management Group calls it "Calculation of Quality and Functional Density Measures"; round 2 reported ISO's as "Calculation of the Quality Measures".
- So for the ISO citation, the verdict rests on believed carry-over, not on an ISO page I read.

## Not reached (13 of 14 fetches used; stopped at 13 as briefed)

- **Item 7, second part:** Elish 2010, "Exploring the relationships between design metrics and package understandability". Not attempted.
- **Item 8:** dependency-cruiser issue #1082, on whether the swc parser loses the type-only flag. Not fetched. It is still a search-result title only, so round 2's sentence about it must not be carried into any recipe.
- **Item 9:** whether ArchUnit's `beFreeOfCycles` reports single cycles or whole tangles of mutually dependent files. Not fetched.

**Failed fetches (5):**
- the Springer page (login redirect);
- the Semantic Scholar programming interface for Melton (HTTP 404);
- rules.sonarsource.com (DNS failure);
- the SonarSource rule-specification repository on GitHub, at a guessed path (HTTP 404);
- iso.org (HTTP 403).

**Searches (5):** used only to find addresses. None of them was used as a verdict source.

Files read:
- `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s6-agent-round2-research-d-s6-agent-r2-research.md`
- `<home>/Code/ctoc/.ctoc/audit/improvement-run-notes/s6-agent-round2-session-runs.md`
- `<home>/Code/ctoc/agents/architecture/dependency-analyzer.md` (lines 160–204, plus exact-string checks)

Sources:
- [Crossref: Al-Mutawa and others 2014](https://api.crossref.org/works/10.1109/ASWEC.2014.15)
- [Semantic Scholar programming interface: Al-Mutawa and others 2014](https://api.semanticscholar.org/graph/v1/paper/DOI:10.1109/ASWEC.2014.15?fields=title,abstract,year,venue,authors)
- [OpenAlex: Melton and Tempero 2007](https://api.openalex.org/works/doi:10.1007/s10664-006-9033-1)
- [Object Management Group, Automated Source Code Quality Measures 1.0](https://www.omg.org/spec/ASCQM/1.0/PDF)
- [SonarQube Server 2026.1 release notes](https://docs.sonarsource.com/sonarqube-server/2026.1/server-update-and-maintenance/lta-to-lta-release-notes)
- [NIST SP 800-218, Secure Software Development Framework 1.1](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf)
- [Zones of Pain, QUATIC 2020, Lancaster repository](https://eprints.lancs.ac.uk/id/eprint/148032/1/QUATIC_2020_Relationship_Between_Faults_and_Design_Metrics.pdf)
- [OpenAlex: Elish and others 2011](https://api.openalex.org/works?filter=title.search:three%20metrics%20suites%20fault%20prediction%20packages%20eclipse&select=title,doi,publication_year,abstract_inverted_index&per-page=3)
- Search results only, not verdict sources: [ResearchGate listing for Melton and Tempero](https://www.researchgate.net/publication/220277742_An_empirical_study_of_cycles_among_classes_in_Java), [Sonar announcement](https://community.sonarsource.com/t/advanced-class-cycle-detection-for-java/127500), [Springer chapter for Zones of Pain](https://link.springer.com/chapter/10.1007/978-3-030-58793-2_11)

<!-- redaction marker: personal information replaced with placeholders on 2026-10-05 (<home> for the home folder, <scratchpad> for the session scratch folder). -->
