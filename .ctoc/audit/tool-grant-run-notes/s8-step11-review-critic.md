**Verdict: kick back.** One short fix pass is needed: three added sentences are untrue against their own agent's files, and three smaller ones are in the same class. The grants, the Write-and-Edit pairing and the four limits are right.

I hold Read and Grep only, so I ran nothing; every "tests pass" below is the executor's record, not mine. I read the plan, the whole diff, slice 7's decisions, all 18 agent bodies and 14 of the 15 method files in full. The fifteenth (`input-validation-checker`) I searched for write, command and network words and read its scan section.

## Blocking: exact changes

**1. `dependency-auditor`: the "you do not run them" sentence contradicts the method's own Phase 6.**
`<home>/Code/ctoc/agents/security/dependency-auditor.md` line 23 says the `cosign` and `vexctl` lines "describe the release pipeline; you do not run them". The method file orders signing as a phase of the agent's own scan. Fix the method file; the pinned sentence then holds as written and no test changes.

`<home>/Code/ctoc/skills/security/dependency-auditor/SKILL.md` lines 472-473, old:
```
### Phase 6: SBOM + Sign + Attest
Generate CycloneDX (and SPDX where required), sign with cosign keyless, publish attestation.
```
new:
```
### Phase 6: SBOM + Sign + Attest
Generate CycloneDX (and SPDX where required). Signing and publishing the attestation are steps of the release pipeline (see "Placement in CI" above), which signs with its own identity: you never run them. Report the bill of materials as generated and not signed, and whether the pipeline's configuration signs and attests it.
```
Same file, line 44, old: `| SBOM | generates + signs | none |` — new: `| SBOM | generates; the release pipeline signs | none |`

**2. `threat-modeler`: "orders you to run no command" is untrue while the method orders a file the agent can only make through Bash.**
`<home>/Code/ctoc/agents/security/threat-modeler.md` line 26 holds the sentence. It holds Bash and no Write, and unlike the six scanners it got no "never through Bash" sentence. Its body is an observer, and it blocks on "no threat model exists", which makes no sense if it authors the model. `tests/watcher-shape.test.js` lines 94-98 already name its Bash as a hole.

`<home>/Code/ctoc/skills/security/threat-modeler/SKILL.md` line 41, old:
```
You produce a versioned, machine-readable threat model that lives in the repository, not a PDF that rots in a wiki.
```
new:
```
You judge whether a versioned, machine-readable threat model lives in the repository, not a PDF that rots in a wiki. You hold neither Write nor Edit: where the model is missing or stale, say in your report what it must hold, for the team or the executor to write, and never write it through Bash.
```
The other way out is to grant Write and Edit, which is a new grant and needs the owner. I recommend the rewording.

**3. `eu-solution-recommender`: "and from nothing else" forbids the fetches its job requires.**
The sentence makes the agent build every fetched address from the finding's own terms. The body orders it to fetch vendor and source pages found by search, and to give a `source_url` for every figure. `citation-validator`'s version named a legitimate source for addresses; this one does not.

`<home>/Code/ctoc/agents/compliance/eu-solution-recommender.md` line 104, and `RECOMMENDER_NOTHING_LEAVES` at `<home>/Code/ctoc/tests/agent-tool-grants.test.js` line 499, old:
```
build each one from the public terms of the finding you are handed — the regulation, the article, the kind of control, a vendor's or a tool's name — and from nothing else.
```
new:
```
build each query from the public terms of the finding you are handed — the regulation, the article, the kind of control — and from a vendor's or a tool's name, and from nothing else; fetch only the authoritative sources named above and an address that a search result or a fetched page gives for a vendor, a tool or a source.
```

## Findings on the slice's own goal (same pass, smaller)

**4. `dsar-handler`: the adjusted never-copy sentence names too few fields.** The canonical schema also requires the verifier's name, role and address, a verification log that names the address a code was sent to, and a transaction reference (`<home>/Code/ctoc/.ctoc/dsar/_README.md` lines 55-70).
`<home>/Code/ctoc/agents/legal/dsar-handler.md` line 32 and `DSAR_DATA_NEVER_COPIED` (test line 494), old: `beyond the request, subject and signer fields the evidence schema requires` — new: `beyond the request, subject, verification and signer fields the evidence schema requires`

**5. `secrets-detector`: "never copied into a report or a file" is contradicted by its own commands.** Four gitleaks lines write a report file into the working tree with no redaction switch, and the paragraph above exempts a scanner's report. Add `--redact` after the subcommand:
- `<home>/Code/ctoc/agents/security/secrets-detector.md` lines 139 and 142: `gitleaks dir --report-format …` → `gitleaks dir --redact --report-format …`; `gitleaks git --report-format …` → `gitleaks git --redact --report-format …`
- `<home>/Code/ctoc/skills/security/secrets-detector/SKILL.md` line 388: `gitleaks dir --report-format sarif …` → `gitleaks dir --redact --report-format sarif …`; line 391: `gitleaks git --config …` → `gitleaks git --redact --config …`

Two things here are from memory, not checked: that gitleaks writes the raw secret into its report by default, and that `--redact` covers the report file as well as the log. Lines 336 and 395 of the method file already pair the switch with a report. Confirm on a machine that has gitleaks.

**6. `sast-scanner`: the network paragraph forbids a lookup the method orders, with no fallback.** `<home>/Code/ctoc/skills/security/sast-scanner/SKILL.md` lines 47 and 423 order "verify package existence on the official registry". `sbom-cra-checker` got a sentence for this; `sast-scanner` did not. Add after "…no package downloaded to run." in `<home>/Code/ctoc/agents/security/sast-scanner.md` line 20 and in its pin (test line 583):
```
Where the method file has you verify that an imported package exists on its registry, take the answer from the lockfile, the resolver's own record or `dependency-auditor`'s findings, and where none of them settles it, say in your report that the package was not verified.
```

**7. `cra-incident-clocks` has no way to read the current time**, and its whole job is elapsed hours. The executor already carried this. One sentence would close it: take the current time from the brief, and where the brief gives none, report the clock state as not computed.

## The six checks

1. **Matches plan or decision:** yes, every changed passage. One thing for the owner's final OK: the plan he approved held ten tools on these agents and reworded two descriptions. Six of those tools are now kept outright and the descriptions are unchanged, by the CTO Chief brief.
2. **Added sentences true:** all except items 1-6. The network paragraphs of `dependency-checker`, `license-scanner`, `concurrency-checker`, `security-scanner`, `incident-responder`, `dsar-handler` and `sbom-cra-checker` hold; so do `secrets-detector`'s three network uses.
   - **Install rule:** sound; keep it. No body or method file orders an install, and the index's approved reading (line 60) already treats an install snippet as reference. A missing tool becomes "a scan that did not run", which is how `security-scanner` treats a missing analyzer.
   - **Signing rule:** the narrowing is right. Keyless signing needs the pipeline's sign-in and pushes to a registry and, as I recall, a public log. It only needs item 1 to be true.
3. **Write orders:** confirmed for all three.
   - `clm-obligations`: Workflow step 5, "write or update".
   - `dsar-handler`: line 42, "You write drafts and evidence files".
   - `cra-incident-clocks`: "Files written" plus "Populate every field"; this is the weakest wording of the three.
   - Among the agents without Write, the only ordered write no added sentence covers is `threat-modeler`'s (item 2).
4. **Two description fixes:** meaning and "Dispatch" wording kept in both.
5. **Limits:** identical in both files and all lowered.

   | Limit | Slice 7 end | Now | Main test line | Limits file line |
   |---|---|---|---|---|
   | Debt | 63 | 46 | 291 | 51 |
   | Write without Edit | 5 | 1 | 339 | 52 |
   | Safety-sentence debt | 5 | 1 | 360 | 55 |
   | Held removals | 48 | 42 | 328 | 54 |

   The held list sums to 42 on 24 agents (Bash 21, Write 10, Edit 10, Task 1). The diff's test hunks also carry slice 7's step, since it starts from 75.
6. **Personal information:** none in the changed lines.

## Final-review judgement

Not ready for the owner's final OK. After the fix pass, the full suite must be recorded on the final bytes. Two record defects to fix then: the green result after the recommender step is missing ("Green: see the next line" points at no result), and the last line still says the scope-growth request is open.

## Backlog

- Six bodies speak of "the method file" but never name its path or order it read (`dependency-auditor`, `dependency-checker`, `sast-scanner`, `secrets-detector`, `concurrency-checker`, `license-scanner`); `cto-chief` line 160 says a wrapper carries its own read order. Slice 6's testing agents have the same gap.
- The three kept writers are observer-shaped and write the very files their findings judge. `tests/watcher-shape.test.js` lines 87-91 call "a watcher never writes" its load-bearing rule. They sit in the legacy list, so nothing fails today; the owner should choose which rule governs.
- `dependency-auditor` method lines 66-67 and 586 still describe the auditor signing and attesting.
- `dependency-auditor` line 170 says "the executor writes" `security-results.json`; `security-scanner` names that file as its own output.
- `secrets-detector` method still lists `ggshield secret scan` and `trivy … misconfig`, both outside the three network uses.
- `secrets-detector`: `detect-secrets scan > .secrets.baseline` reads as both scanner output (allowed) and a baseline entry (named, not made).
- For the security scan, believed and not checked: TruffleHog updates itself at start, and its live check connects to hosts named inside a found connection string.
- `sbom-cra-checker`: the "signature does not verify" finding and the regenerate-and-diff drift check need commands it is now told never to run. Slice 11 should read this before removing its Bash.
- `threat-modeler`: the staleness check compares last-modified dates, which takes a command. Same note for slice 11.
- `incident-responder` method line 62, "you ship the template and validate it", can be read as a write order.
- `security-scanner` reads the SARIF "the analyzers wrote"; `input-validation-checker` holds no tool that can write one.
- Scan blocks that rewrite a project file: `vcpkg x-update-baseline --add-initial-baseline` (auditor method line 109), `conan lock create` (checker method line 327), `poetry export … --output requirements.txt` (licence method line 132).
- `dependency-checker`'s paragraph omits the Maven plugin download and the deps.dev lookup its method commands make.
- The auditor's letter fields `epss` and `kev` have no "unknown" value for when no scanner reports them.
- `cra-incident-clocks`: the agent's description says "structured YAML findings"; the method file's says "incident JSON".
