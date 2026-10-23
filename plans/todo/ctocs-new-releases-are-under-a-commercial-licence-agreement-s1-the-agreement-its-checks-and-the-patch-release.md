---
title: "The end-user license agreement replaces PolyForm Shield in LICENSE, README and the three licence values, the checks follow it, and the next patch release carries it"
type: implementation
parent_plan: ctocs-new-releases-are-under-a-commercial-licence-agreement
depends_on: none
created: 2026-10-23
priority: HIGH
effort: high
files:
  # THE SLICE'S OWN FILES: the agreement, the README licence statements, the three
  # licence values, and the four test files that pin them. Over the ~1-3 budget on
  # purpose; the reason is the section "Why this is one slice" below.
  - LICENSE
  - README.md
  - package.json
  - package-lock.json
  - .claude-plugin/marketplace.json
  - tests/version-license-invariant.test.js
  - tests/release.test.js
  - tests/release-metadata-sync.test.js
  - tests/helpers/source-of-truth.js
  # THE PATCH RELEASE'S FILES, written by editing VERSION and running
  # node src/scripts/release.js (README.md and package.json above are also among them).
  - VERSION
  - .claude-plugin/plugin.json
  # RATCHET FILE, a conditional write permission, not planned work: this slice creates
  # no counted artifact, but release.js rewrites a CLAUDE.md count line that has drifted
  # on main; only count lines may change, and only when release.js changes them.
  - CLAUDE.md
---

# The end-user license agreement replaces PolyForm Shield in LICENSE, README and the three licence values, the checks follow it, and the next patch release carries it

**Scope (one line):** the licence tests are changed first and seen failing; then LICENSE becomes the CTO Chief (CTOC) End-User License Agreement, README's badge and licence section say who uses it free and that every copy up to and including the last PolyForm Shield version keeps PolyForm Shield, package.json, the lockfile root and the marketplace entry read "SEE LICENSE IN LICENSE", and the next patch release carries it all in one tree that passes the gated suite and the privacy scan.

Read first, in full: the parent plan (`plans/implementation/ctocs-new-releases-are-under-a-commercial-licence-agreement.md`), its fifteen scenarios and its Decisions 1 to 10, and the research it cites (`plans/vision/deepthink/commercial-licence-for-ctoc.md`, evidence only). The owner's terms, his answer on the lawyer's review (release as planned; a Dutch lawyer reviews the text for a later release) and Decisions 1 to 9 are settled and are not reopened here.

## Why this is one slice

The planner's rule is about one to three files per slice. This slice declares nine of its own plus the release files, and that is deliberate:

- **The invariant tests couple the four licence values.** `tests/version-license-invariant.test.js` and `tests/release.test.js` compare package.json, the marketplace entry and the first line of LICENSE (and, after this slice, the lockfile root); a slice that changes some of them and not the others leaves main red, and a slice that changes the tests alone leaves main red. No boundary inside that set keeps the full gated suite passing.
- **The licence and the version must land in one commit.** The README sentence "every copy up to and including version 6.14.135 stays under PolyForm Shield" is true only if no tree labelled 6.14.135 carries the agreement and no tree labelled later carries PolyForm Shield (parent Decision 7). A slice that changes the licence without the bump, or the bump without the licence, makes that sentence false for one commit; the owner ordered one patch release.
- **README must change with LICENSE.** A pushed main whose LICENSE is the agreement while README still says "Use CTO Chief freely for any project" tells GitHub readers the opposite of the terms, which is the harm the parent plan exists to remove.
- **The substantive work is small.** One legal text (written from the clause outline below), one test helper redesign, and one-value edits; the other files are one-line edits or outputs of `node src/scripts/release.js`.

So the slice count is one. A split would either break the suite between slices or publish contradictory terms.

## Implementation Details

### What is there today (read on 2026-10-23, VERSION 6.14.135)

- `LICENSE`: the PolyForm Shield License 1.0.0, 151 lines; line 1 `PolyForm Shield License 1.0.0`; line 5 `Copyright (c) 2025 Tijn van der Zant`; line 35 a `Required Notice:` line; lines 81-83 a `Licensor Line of Business:` paragraph.
- `README.md`: line 8, the badge `<a href="LICENSE"><img alt="License: PolyForm Shield" src="https://img.shields.io/badge/License-PolyForm%20Shield-brightgreen.svg"></a>`; lines 1168-1172, the section `## License` with the PolyForm link and "Use CTO Chief freely for any project. …"; line 1179, the note "> CTO Chief is open source and actively developed. [Issues](…), [PRs](…), and [skill improvement suggestions](…) are welcome."; four lines carry the version, and release.js rewrites all four: line 9, the badge (`version-6.14.135-blue`); line 140, the dashboard capture's first line (`CTOC v6.14.135`); line 1112 (`getVersion()       // → '6.14.135'`); line 1183, the footer (`**6.14.135** · Built by …`).
- `package.json` line 5 `"license": "PolyForm-Shield-1.0.0"`; line 6 `"private": true`.
- `package-lock.json` line 10, the root package's (`packages[""]`) `"license": "PolyForm-Shield-1.0.0"`; lines 3 and 9 the two version values release.js writes.
- `.claude-plugin/marketplace.json` line 21, the ctoc entry's `"license": "PolyForm-Shield-1.0.0"`. `.claude-plugin/plugin.json` has no `license` field.
- `tests/version-license-invariant.test.js`: line 19 `EXPECTED_LICENSE = 'PolyForm-Shield-1.0.0'`; lines 68-73 package.json equals the expected value and equals the marketplace value; line 77 the first line of LICENSE matches `/PolyForm Shield License 1\.0\.0/`; lines 99-116 an Apache-2.0 fixture fails naming package.json. `makeFixtureRoot` (lines 26-57) writes package.json, plugin.json, marketplace.json, VERSION and LICENSE, no lockfile.
- `tests/helpers/metadata-invariant.js` (not in scope, unchanged, parent Decision 9): `readMetadata(root)` reads the licence of package.json and of `marketplace.plugins[0]` and the first non-empty line of LICENSE; `collectLicenseMismatches(meta, { expected })` returns `{ file, value }` for `package.json` and `marketplace.plugin`.
- `tests/helpers/source-of-truth.js`: `normalizeLicense` (lines 89-95) and `readLicenseSources` (lines 145-156), which returns normalised tokens. Search: pattern `normalizeLicense|readLicenseSources` over the repository outside `plans/`, 2 files: the helper itself and `tests/release.test.js` (lines 17, 713, 786). No `.ctoc/*.json` baseline names either (pattern `normalizeLicense|source-of-truth|metadata-invariant` over `.ctoc/*.json`: 0 files).
- `tests/release.test.js` lines 712-722 compare the normalised package.json licence with the normalised first line of LICENSE; lines 784-792 an Apache-2.0 fixture must not match. `writeFixture` (lines 730-760) copies the real package.json, plugin.json, marketplace.json, VERSION and LICENSE.
- `tests/release-metadata-sync.test.js` line 260, the lockfile fixture's root licence `'PolyForm-Shield-1.0.0'`; test 8 (lines 274-290) proves the lockfile changes only in its two version values; lines 107-111 prove release.js never syncs a licence path.
- `src/scripts/release.js` (not changed): rewrites package.json, package-lock.json, plugin.json and the marketplace manifest with `JSON.stringify(json, null, 2) + '\n'`, and in README.md only these patterns: `^\*\*X.Y.Z\*\*` (first match), `version-X.Y.Z-blue`, `getVersion()  // → 'X.Y.Z'`, `^CTOC vX.Y.Z$`, plus the count lines of README.md and CLAUDE.md. `src/lib/version.js` `syncToReadme` uses the same three README version patterns.

### Dependency Graph

```
tests/version-license-invariant.test.js --calls--> tests/helpers/metadata-invariant.readMetadata, collectLicenseMismatches (unchanged)
                                        --reads--> package.json, package-lock.json, .claude-plugin/{plugin,marketplace}.json, LICENSE, README.md, VERSION
tests/release.test.js --calls--> tests/helpers/source-of-truth.readLicenseSources (changed), licenseDeclarationVerdict (new), readVersionSources, allVersionsAgree
tests/release-metadata-sync.test.js --runs--> src/scripts/release.js (unchanged)
npm test (src/scripts/test-gate.js) --runs--> tests/*.test.js
```

No new module, no new `require`, no cycle.

### File: `LICENSE` — the agreement, clause by clause

**Action:** REPLACE the whole text (Write). **Purpose:** the terms every copy of a release after the last PolyForm Shield version carries.

Form: plain English, short sentences, lines wrapped at about 72 characters like today's file, section headings `## N. Heading`. The word "license" is spelled the American way throughout, as in the file name, the npm value and README's heading. LICENSE names no other licence (it never says "PolyForm"), has no line `PolyForm Shield License 1.0.0` and no line starting `Licensor Line of Business:`, and names no person other than Tijn van der Zant and no e-mail address other than tijn@theaiguys.com.

How literal to be: the middle column gives what each clause must mean, and the builder words it in plain English. Only text in backticks or in quotation marks inside that column is fixed and goes into LICENSE word for word: the title, the copyright line, the repository address, the contact address, the organisation list of Decision 1, the evaluation length "less than 32 consecutive calendar days" (Decision 2) and the once-only phrase of Decision 5. A parenthesis that begins "Builder:" is an instruction, never text of the agreement; every other parenthesis (the legal citations of section 8, for example) is part of the meaning.

| Part | What the clause must state (the meaning; the wording is the builder's, except text in backticks or quotation marks, which is fixed) | Carries |
|---|---|---|
| Line 1 | `CTO Chief (CTOC) End-User License Agreement`, the first non-empty line. (Builder: the test constant `AGREEMENT_TITLE` pins it; any change lands in LICENSE and both test constants together.) | Scenario 1, Decision 6 |
| Lines 3-5 | `Copyright (c) 2025-2026 Tijn van der Zant`, then the repository address `https://github.com/robotijn/ctoc`. | Scenario 1 |
| `## 1. The parties and acceptance` | The agreement is between the licensor, Tijn van der Zant, and you. "You" is the individual or organisation that uses CTOC; whoever uses CTOC for or on behalf of a company or other organisation accepts this agreement for that organisation too. Using CTOC means accepting this agreement; whoever does not accept it may not use CTOC. You must agree to these terms as strict obligations and conditions of every license this agreement grants. Questions about this agreement go to `tijn@theaiguys.com`. | Terms 12 (licensor), 5; scenario 1 |
| `## 2. Definitions` | **CTOC**: the software CTO Chief (CTOC) the licensor makes available with this agreement, including its source code, documentation, agents and skills, every part of it, and every copy. **Use**: anything you do with CTOC, including installing, running, copying, studying and changing it. **Your company**: any company, partnership or other legal entity for or on behalf of which you use CTOC, together with its affiliates; **affiliates** are the organisations it controls, is controlled by, or is under common control with; **control** is ownership of substantially all the assets of an entity, or the power to direct its management and policies by vote, contract or otherwise, directly or indirectly. **Consumer**: a natural person acting for purposes outside their trade, business, craft or profession. **Business use**: (a) any use by or on behalf of a company, partnership or other legal entity, and (b) any use by an individual in the course of paid work, a trade, a business or a profession. **Non-commercial use**, which is not business use: (c) use by "a charitable organisation, an educational institution, a public research organisation, a public safety or health organisation, an environmental protection organisation or a government institution", for its non-commercial purposes, "regardless of its source of funding", and an individual's work on that organisation's behalf; (d) **personal use**: an individual's use outside paid work, a trade, a business or a profession, such as study, a hobby or an unpaid project of their own. Order of the rules: a use under (c) or (d) is not business use, even where (a) or (b) also describes it. (Builder: a charity is a legal entity and its staff may be paid; this order keeps them free.) (e) Use for a commercial product or a paid service, that is, a product or service that is sold, licensed or provided for payment, is business use, also when an organisation listed in (c), or an individual under (d), makes it; (e) overrides (c) and (d). **Evaluation**: use to evaluate whether CTOC suits a particular use. | Scenario 3, Decision 1 |
| `## 3. Free use` | The licensor grants you a non-exclusive, non-transferable, worldwide license, free of charge, to use CTOC for personal use and for non-commercial use: to install and run it, to make the copies that use needs, and to change CTOC and use the changed copy for that same use. Changed copies stay private (section 6). | Terms 1, 3, 11 |
| `## 4. Evaluation` | Any person or company may use CTOC for evaluation, business evaluation included, for "less than 32 consecutive calendar days", counted from the first day of that evaluation. The period runs "once per company together with its affiliates, or once per individual who acts for no company", and does not start again for another person or another use. Continued business use after that period needs a commercial license (section 5). | Term 2, scenario 4, Decisions 2 and 5 |
| `## 5. Business use needs a commercial license` | Any business use other than evaluation under section 4 needs a paid commercial license from the licensor; this agreement grants no right to business use beyond section 4. Ask for a commercial license at `tijn@theaiguys.com`. A commercial license is a separate agreement with the licensor, concluded in writing or by electronic means that provide a durable record of it, and it sets its own terms. | Terms 4, 5; scenario 2's last line |
| `## 6. What you may not do` | Unless a commercial license with the licensor expressly allows it, you may not: (a) distribute, publish, sell, rent, lend or otherwise make CTOC or any part of it available to anyone else, except as section 7 states; (b) sublicense, assign or transfer any right under this agreement; (c) distribute or make available a changed copy of CTOC or any work based on it; (d) provide any product or service that competes with CTOC, or use CTOC to provide one, followed by three clarifying sentences: a product competes even when it provides the functionality through a different kind of interface, for a different technical platform or in a different programming language; it competes even when provided free of charge; a product marketed as a practical substitute for CTOC competes; (e) remove, change or obscure the copyright notice, this agreement, or any copyright, license or attribution notice in CTOC. | Terms 6, 7, 8, 9, 10 |
| `## 7. Viewing and forking on GitHub` | Viewing and forking CTOC's repository within GitHub, under GitHub's terms of service, is not a breach of this agreement. This gives no right outside GitHub beyond what this agreement grants. | Scenario 6 |
| `## 8. Rights the law gives you` | This agreement limits none of the rights a lawful user of CTOC has under European Union and Dutch law on computer programs, including loading, running and correcting errors; making a back-up copy; observing, studying and testing how CTOC works; and decompiling for interoperability (Directive 2009/24/EC, articles 5 and 6; Dutch Copyright Act, articles 45j to 45m). Nor does it limit any other right the law gives you that a contract cannot take away. | Scenario 6 |
| `## 9. No warranty` | As far as the law allows, CTOC is provided as is, without any warranty or condition of any kind, express or implied. | Scenario 5 |
| `## 10. Liability` | Toward anyone who uses CTOC for business use, evaluation included, and toward every other user who is not a consumer, the licensor's liability for any damage arising out of this agreement or out of the use of CTOC is excluded as far as the law allows; a commercial license may set different terms. Nothing in this agreement excludes or limits: liability for intent or deliberate recklessness; product liability toward natural persons for death, personal injury, or damage to property or data not used for professional purposes; a consumer's statutory rights; or any other liability the law does not allow to be excluded or limited. | Scenario 5, Decision 4, technical-planning decision 8 |
| `## 11. Governing law and courts` | Dutch law governs this agreement. If you are a consumer, this choice does not deprive you of the protection of the mandatory provisions of the law of the country where you have your habitual residence. The competent court in the Netherlands has jurisdiction over any dispute arising out of this agreement, without prejudice to the courts a consumer may use, or must be sued in, under European Union law. | Terms 13, 14; scenario 5 |
| `## 12. No other rights` | The licensor keeps every right this agreement does not expressly grant. This agreement implies no other license and does not stop the licensor from granting licenses to anyone else. | Scenario 2's "no clause grants a right the order withholds" |

Nothing else goes into LICENSE: no liability cap amount anywhere in it (parent scenario 5; a paid commercial license sets its own), no termination clause, severability clause, patent clause or entire-agreement clause (technical-planning decision 9), no version number of the agreement, no statement about earlier releases (README carries it).

### File: `README.md`

**Action:** MODIFY three places; the release then rewrites its version lines and count lines.

- **Line 8, the badge**, replaced by exactly:
  `  <a href="LICENSE"><img alt="License: CTO Chief (CTOC) End-User License Agreement" src="https://img.shields.io/badge/License-End--User%20License%20Agreement-blue.svg"></a>`
- **The `## License` section** (today lines 1168-1172, from the heading to the line before the blank line that precedes `## Links`), replaced by exactly:

  ```
  ## License

  CTO Chief is licensed under the [CTO Chief (CTOC) End-User License Agreement](LICENSE).

  Personal use, non-commercial use and evaluation are free. Evaluation means trying CTO Chief to decide whether it suits a particular use, for less than 32 consecutive calendar days, once per company together with its affiliates, or once per individual who acts for no company. Any other business use needs a paid commercial license from Tijn van der Zant: ask at tijn@theaiguys.com. The [LICENSE](LICENSE) file holds the full terms, including what counts as business use and as non-commercial use.

  Every copy of CTO Chief up to and including version 6.14.135 stays under the [PolyForm Shield License 1.0.0](https://polyformproject.org/licenses/shield/1.0.0). Releases after version 6.14.135 are under the CTO Chief (CTOC) End-User License Agreement.
  ```

  `6.14.135` is the VERSION Step 9 reads on main (parent Decision 7); if Step 9 reads another number, both occurrences on that line and `LAST_POLYFORM_VERSION` in the test use the number read, and the change is reported to the owner. A move of main after Step 9 stops the build (Step 10). That line is the only line of README.md that contains "PolyForm". It must not start with `**`, contain `version-…-blue` or `getVersion()`, or be a line `CTOC v…`, so neither release.js nor `src/lib/version.js` ever rewrites its version.
- **Line 1179, the note**: only its first sentence changes, from "CTO Chief is open source and actively developed." to "The source code of CTO Chief is public, and CTO Chief is actively developed."; the rest of the line stays byte for byte (technical-planning decision 10).

### Files: `package.json`, `package-lock.json`, `.claude-plugin/marketplace.json`

**Action:** MODIFY one value each, by hand with Edit, never by `npm install` (it may rewrite resolved entries):
- `package.json` line 5: `"license": "SEE LICENSE IN LICENSE",`; `"private": true` stays.
- `package-lock.json` line 10 (inside `packages[""]`): `"license": "SEE LICENSE IN LICENSE",`. Nothing else in the lockfile is edited by hand.
- `.claude-plugin/marketplace.json` line 21 (the ctoc entry): `"license": "SEE LICENSE IN LICENSE",`.
- `.claude-plugin/plugin.json` gets no `license` field.

### File: `tests/helpers/source-of-truth.js`

**Action:** MODIFY. **Purpose:** the release consistency check reads the exact licence value and the file it names, not reduced tokens (parent Decision 8).

- **Remove** `normalizeLicense` and its JSDoc, and drop it from `module.exports`: after this change it has no caller (the search above).
- **Rewrite** `readLicenseSources(root = projectRoot) → { declaredRaw: string|null, licenseFile: 'file'|'missing'|'not-a-file', licenseFirstLine: string|null }`. `declaredRaw` as today. `licenseFile`: `fs.statSync(path.join(root, 'LICENSE'))`; `isFile()` gives `'file'`, any other kind (a folder, for example) gives `'not-a-file'`; an `ENOENT` error gives `'missing'`; any other error is re-thrown (a test then fails loudly with the real error; no catch block swallows it). `licenseFirstLine`: `firstNonEmptyLine(safeReadText(…))` when `licenseFile` is `'file'`, else `null`.
- **Add** `licenseDeclarationVerdict(sources, { expectedValue, expectedTitle }) → { ok: boolean, problems: Array<{ file: 'package.json'|'LICENSE', message: string }> }`, beside `allVersionsAgree` and in its style:
  - `sources.declaredRaw !== expectedValue` → `{ file: 'package.json', message: 'package.json "license" is <JSON of the value>; expected <JSON of expectedValue>' }`;
  - `sources.licenseFile === 'missing'` → `{ file: 'LICENSE', message: 'LICENSE is missing at the top level of the repository' }`;
  - `sources.licenseFile === 'not-a-file'` → `{ file: 'LICENSE', message: 'LICENSE at the top level of the repository is not a file' }`;
  - otherwise `sources.licenseFirstLine !== expectedTitle` → `{ file: 'LICENSE', message: 'LICENSE first line is <JSON>; expected <JSON of expectedTitle>' }`;
  - `ok` is `problems.length === 0`. Example: the landed tree with `{ expectedValue: 'SEE LICENSE IN LICENSE', expectedTitle: AGREEMENT_TITLE }` → `{ ok: true, problems: [] }`; a fixture whose package.json reads `Apache-2.0` → one problem naming `package.json`.
- **Update** the JSDoc of `readLicenseSources` and the module header's description of the licence check (the header's history sentence about the Apache-2.0 drift stays: it is history).

### File: `tests/version-license-invariant.test.js`

**Action:** MODIFY. Constants at the top, each a literal: `EXPECTED_LICENSE = 'SEE LICENSE IN LICENSE'` (line 19, value changed), `AGREEMENT_TITLE = 'CTO Chief (CTOC) End-User License Agreement'`, `LAST_POLYFORM_VERSION = '6.14.135'` (parent Decision 7), `REAL_ROOT = path.resolve(__dirname, '..')`.

- **Add** `readJson(root, ...parts)`: `JSON.parse(fs.readFileSync(path.join(root, ...parts), 'utf8'))`, no catch, so a missing or unparseable file throws and the test fails loudly, as `metadata-invariant.js` does (the file imports no `readJson` today, and that helper exports none).
- **Add** `lockRootLicense(root)`: `readJson(root, 'package-lock.json')`, returns `packages[""].license`, or `undefined` when `packages` or `packages[""]` is missing (parent Decision 9; `metadata-invariant.js` stays unchanged). A missing package-lock.json throws.
- **Add** `licenseMismatches(root = REAL_ROOT)`: `collectLicenseMismatches(readMetadata(root), { expected: EXPECTED_LICENSE })` (each manifest compared directly with the expected value, so the marketplace entry is named even when it agrees with package.json), then appends `{ file: 'package-lock.json', value }` when the lockfile root differs, `{ file: 'plugin.json', value }` when `.claude-plugin/plugin.json` has an own `license` key (`Object.hasOwn`), and `{ file: 'LICENSE', value }` when the first non-empty line of LICENSE is not `AGREEMENT_TITLE`. Order: package.json, marketplace.plugin, package-lock.json, plugin.json, LICENSE.
- **Extend** `makeFixtureRoot`: the bundle gains `lock`, a minimal lockfile built from the real one (`name`, `version`, `lockfileVersion`, and `packages: { '': copy of the real root entry }`), written as `package-lock.json`; `mutate` may change it like the others.
- **Tests** (new or changed; the rest unchanged):
  1. NEW `every licence declaration names the agreement`: `assert.deepStrictEqual(licenseMismatches(), [])` first, so a failure lists every file at once; then `assert.strictEqual(readJson(REAL_ROOT, 'package.json').private, true)`.
  2. CHANGED `license is the correct pinned identifier across manifests`: same three assertions, `EXPECTED_LICENSE` now `'SEE LICENSE IN LICENSE'`.
  3. CHANGED `license identifier traces to the actual LICENSE file text`: `assert.strictEqual(meta.license.licenseFileFirstLine, AGREEMENT_TITLE)` replaces the PolyForm pattern.
  4. NEW `LICENSE holds the agreement, not the PolyForm Shield text`: no line (trimmed) equals `PolyForm Shield License 1.0.0`; no line starts with `Licensor Line of Business:`; some line starts with `Copyright (c)` and contains `Tijn van der Zant`; the text contains `tijn@theaiguys.com`.
  5. NEW `README states the agreement and which copies stay under PolyForm Shield`: exactly one line of README.md contains `PolyForm`; that line contains `up to and including version ${LAST_POLYFORM_VERSION}`, `after version ${LAST_POLYFORM_VERSION}` and `https://polyformproject.org/licenses/shield/1.0.0`; README contains `AGREEMENT_TITLE`, `](LICENSE)`, `tijn@theaiguys.com` and `once per company together with its affiliates, or once per individual who acts for no company` (parent Decision 5), and does not contain `Use CTO Chief freely for any project.`
  6. NEW `the tree carrying the agreement is labelled after the last PolyForm Shield version`: VERSION, compared part by part as three integers, is greater than `LAST_POLYFORM_VERSION`.
  7. NEW, five fixture tests `putting one licence value back fails, naming its file`: each fixture changes exactly one thing and asserts `licenseMismatches(fixture).map((m) => m.file)` deep-equals exactly the one name: package.json `license` → `'PolyForm-Shield-1.0.0'` gives `['package.json']`; the lockfile root `license` → `'PolyForm-Shield-1.0.0'` gives `['package-lock.json']`; the marketplace entry's `license` → `'PolyForm-Shield-1.0.0'` gives `['marketplace.plugin']`; plugin.json gains `license: 'PolyForm-Shield-1.0.0'` gives `['plugin.json']`; LICENSE's first line replaced by `PolyForm Shield License 1.0.0` gives `['LICENSE']`. Each fixture is removed in `finally`.
  8. UNCHANGED `reverting the license fails the invariant` (Apache-2.0 in package.json), now against the new `EXPECTED_LICENSE`.
  9. NEW `a lockfile without a root package entry fails, naming package-lock.json`: the fixture's lockfile keeps `name`, `version` and `lockfileVersion` but its `packages` has no `""` entry; `licenseMismatches(fixture).map((m) => m.file)` deep-equals `['package-lock.json']` and that mismatch's `value` is `undefined`. Removed in `finally`. (A LICENSE that is a folder is tested in tests/release.test.js only: the unchanged `readMetadata` reads LICENSE with `fs.readFileSync` and throws on a folder.)

### File: `tests/release.test.js`

**Action:** MODIFY the describe block `release artifact is the single source of truth` (lines 699-794). Constants at the top of the file, each a literal: `LICENSE_VALUE = 'SEE LICENSE IN LICENSE'`, `AGREEMENT_TITLE = 'CTO Chief (CTOC) End-User License Agreement'`. Import `licenseDeclarationVerdict` beside `readLicenseSources`.

- CHANGED (lines 712-722) `package.json license points to LICENSE, and LICENSE opens with the agreement title`: `const verdict = licenseDeclarationVerdict(readLicenseSources(), { expectedValue: LICENSE_VALUE, expectedTitle: AGREEMENT_TITLE }); assert.deepStrictEqual(verdict.problems, []); assert.strictEqual(verdict.ok, true);`
- **Extend** `writeFixture({ pkgVersion, pkgLicense, licenseText, extraFiles = {} })`: `licenseText` undefined copies the real LICENSE, `null` writes no LICENSE, a string writes that text; `extraFiles` maps a top-level file name to its text.
- Non-vacuity tests (each asserts the exact list of named files, `verdict.problems.map((p) => p.file)`):
  - NEW `an unchanged copy of the tree passes` → `[]` (the check is not always red);
  - `SEE LICENSE IN LICENSE.txt` in package.json, with `LICENSE.txt` written holding the real LICENSE text → `['package.json']`;
  - `PolyForm-Shield-1.0.0` in package.json → `['package.json']`;
  - CHANGED (lines 784-792) `Apache-2.0` in package.json → `['package.json']`, replacing `assert.notStrictEqual(lic.declared, lic.actual, …)`;
  - no LICENSE file → `['LICENSE']`, and its message matches `/missing/`;
  - LICENSE is a folder (fixture written with `licenseText: null`, then `fs.mkdirSync(path.join(root, 'LICENSE'))`) → `['LICENSE']`, and its message matches `/not a file/` and does not match `/missing/`;
  - LICENSE's first line replaced by `PolyForm Shield License 1.0.0` → `['LICENSE']`.
- NEW `a stat error other than a missing file is re-thrown`: `assert.throws(() => readLicenseSources('bad\0root'), { code: 'ERR_INVALID_ARG_VALUE' })`. Node rejects a path holding a NUL character before it touches the disk; the package.json read goes through `safeReadJson`, which swallows that error and returns `null`, so the throw comes from the LICENSE stat and proves the re-throw (technical-planning decision 19). No folder is created.
- The two version tests and their two fixtures are unchanged.

### File: `tests/release-metadata-sync.test.js`

**Action:** MODIFY.
- Line 260: the fixture's root licence becomes `'SEE LICENSE IN LICENSE'`.
- Test 8 (lines 274-290): the fixture also gets `packageJson: { name: 'ctoc', version: '6.14.123', license: 'SEE LICENSE IN LICENSE', private: true }`; after the release run, add `assert.strictEqual(lock.packages[''].license, 'SEE LICENSE IN LICENSE')` and assert package.json's text equals its text before with only `"version": "6.14.123"` replaced by `"version": "6.14.125"`. Renamed `8. the lockfile follows VERSION; only its two version values change, and neither licence is written`. Every existing assertion stays. This test passes before and after the change: the release script leaves the licence alone whatever its value (parent scenario 14).

### Files the patch release writes: `VERSION`, `.claude-plugin/plugin.json`, `README.md`, `CLAUDE.md`

VERSION is set to the next patch number after the VERSION read on main just before the bump (6.14.136 when that read gives 6.14.135); then `node src/scripts/release.js` (exit 0) writes the version into package.json, both values of package-lock.json, plugin.json, both version fields of the marketplace manifest, README's four version lines (the badge on line 9, the `CTOC v…` line at 140, the `getVersion()` line at 1112, the footer at 1183), and the count lines of README.md and CLAUDE.md. CLAUDE.md changes only if a count has drifted on main, and then only on count lines.

### Wiring — the live call sites

No module is added. `licenseDeclarationVerdict` and the changed `readLicenseSources` are called by `tests/release.test.js`; the local readers of `tests/version-license-invariant.test.js` are called by its own tests; both files run under `npm test` (`src/scripts/test-gate.js`), the gated entry point that also runs before every push. The agreement is reached by every reader: LICENSE at the top level of the repository, which the value "SEE LICENSE IN LICENSE" names; the marketplace entry's licence, which Claude Code shows in plugin listings; README on GitHub. The release reaches the plugin through the marketplace's version fields, which release.js writes.

### Test Plan

Framework: `node:test` and `node:assert`, as the three files already use. Real files only: fixtures are fresh folders under `os.tmpdir()`, removed in `finally` or `afterEach`; no doubles.

| Test | Red at Step 8 (before LICENSE and the values change), because | Green after Step 10 |
|---|---|---|
| invariant 1, every licence declaration | lists package.json, marketplace.plugin, package-lock.json, LICENSE | yes |
| invariant 2, pinned identifier | package.json reads PolyForm-Shield-1.0.0 | yes |
| invariant 3, LICENSE first line | first line is the PolyForm title | yes |
| invariant 4, LICENSE holds the agreement | the PolyForm title line is present | yes |
| invariant 5, README | two lines name PolyForm; no "up to and including" | yes |
| invariant 6, VERSION after the last PolyForm version | VERSION is 6.14.135 | yes, after the bump |
| invariant 7, five put-back fixtures | each fixture also carries the old values, so more than one file is named | yes |
| invariant 8, Apache-2.0 | passes before (pre-existing assertions), a regression pin | yes |
| invariant 9, lockfile without a root entry | the fixture also carries the old package.json, marketplace and LICENSE values, so more than one file is named | yes |
| release, real tree | names package.json and LICENSE | yes |
| release, unchanged copy | the copy carries the old values | yes |
| release, the four put-back fixtures, the missing-file fixture and the LICENSE-folder fixture | each also names the old LICENSE or package.json | yes |
| release, stat error re-thrown (NUL path) | passes at Step 8: the helper is rewritten in Step 8; against today's helper it fails, because `safeReadText` swallows every error and nothing throws | yes |
| release-metadata-sync 8 | passes before: release.js never writes a licence | yes |

Scenario 2 (fourteen terms) is checked by the review against LICENSE, not by a test; Steps 11 and 16 fill this table in the Execution Record:

| Term | LICENSE section | The sentence that states it |
|---|---|---|
| 1 personal use free | | |
| 2 evaluation free | | |
| 3 non-commercial use free | | |
| 4 business use needs a paid commercial license | | |
| 5 asked at tijn@theaiguys.com | | |
| 6 no redistribution | | |
| 7 no sublicensing | | |
| 8 no distributing modified copies | | |
| 9 no competing product | | |
| 10 no removing notices | | |
| 11 private changes for own permitted use allowed | | |
| 12 licensor Tijn van der Zant | | |
| 13 Dutch law | | |
| 14 competent Dutch court | | |

### Changed assertions (parent scenario 15), each tightened, none loosened

| File and place | Old | New | Reason |
|---|---|---|---|
| version-license-invariant line 19 | `EXPECTED_LICENSE = 'PolyForm-Shield-1.0.0'` | `'SEE LICENSE IN LICENSE'` | the licence changes (parent Decision 3); the comparison stays exact |
| version-license-invariant line 77 | `assert.match(firstLine, /PolyForm Shield License 1\.0\.0/)` | `assert.strictEqual(firstLine, AGREEMENT_TITLE)` | a pattern becomes the exact line (parent Decision 6) |
| release.test.js lines 714-715 | `assert.ok(lic.declared !== null, 'package.json declares no license')` and `assert.ok(lic.actual !== null, 'LICENSE file has no readable first line')` | the verdict's problems deep-equal `[]` | a missing package.json value now fails as a named package.json problem (`null !== expectedValue`), a missing LICENSE as a named LICENSE problem and an empty LICENSE as a first-line problem (`null !== expectedTitle`); the "no LICENSE file" fixture proves the LICENSE case, so nothing is loosened |
| release.test.js lines 716-721 | `assert.strictEqual(lic.declared, lic.actual, …)` on reduced tokens | the verdict's problems deep-equal `[]` | the reduced comparison cannot hold for the new pair and passed any pair whose reduced tokens matched; the new check needs the exact value, the file and the exact title (parent Decision 8) |
| release.test.js lines 787-791 | `assert.notStrictEqual(lic.declared, lic.actual, …)` | problems name exactly `['package.json']` | the fixture must fail for the named file and only for it |
| release-metadata-sync line 260 | fixture value `'PolyForm-Shield-1.0.0'` | `'SEE LICENSE IN LICENSE'` | fixture data, not an assertion; test 8 gains two assertions |

The builder copies this table into the Execution Record and adds any further change it made, with its reason.

### Acceptance Criteria Mapping

| Parent scenario | Implemented in | Checked by |
|---|---|---|
| 1 title, licensor, contact; PolyForm text gone | LICENSE line 1, lines 3-5, sections 1 and 5 | invariant 3 and 4; review |
| 2 fourteen terms; no withheld right granted | LICENSE sections 1-12 | the fourteen-row table, Steps 11 and 16 |
| 3 business and non-commercial use defined | LICENSE section 2 (a)-(e) | review against Decision 1 |
| 4 evaluation under 32 days, once | LICENSE section 4 | review against Decisions 2 and 5 |
| 5 warranty, liability, law, court, no cap | LICENSE sections 9-11 | review against Decision 4 |
| 6 GitHub and computer-program rights | LICENSE sections 7 and 8 | review |
| 7 README badge, section, PolyForm sentence | README line 8 and `## License` | invariant 5; review |
| 8 three values; plugin.json none; private true; lockfile diff | package.json, package-lock.json, marketplace.json | invariant 1, 2, 7; Step 14 diff counts |
| 9 strict validator reports nothing new | no file; Steps 9 and 14 | both outputs recorded in full |
| 10 first release under the agreement is the next patch | VERSION, release.js | invariant 6; version invariants; Step 14 reads the five files |
| 11 licence tests red before, green after | the four test files | Step 8 and Step 10 records |
| 12 putting one value back fails | invariant 7 and 9; release fixtures | those tests |
| 13 the release check follows LICENSE | source-of-truth.js; release.test.js | the release fixtures, the LICENSE-folder fixture and the NUL-path re-throw test included |
| 14 release.js never writes the licence | release-metadata-sync line 260 and test 8; lines 107-111 | that test |
| 15 gated suite, assertion table, privacy scan, author | the whole tree; the commit | Step 14; the author by the CTO Chief's commit-and-push step (Step 16, decision 20) |

### Risk Mitigations

| Risk | Mitigation | Where |
|---|---|---|
| `normalizeLicense` reduces "SEE LICENSE IN LICENSE" to "seein", so changing only the expected value gives a test that never passes, and accepting any "SEE LICENSE IN" value passes for any file | exact value, named file, exact title; normalisation removed; a LICENSE.txt fixture fails | source-of-truth.js; release fixtures |
| No test reads the lockfile root's licence | `lockRootLicense` in the invariant test; a put-back fixture; a fixture with no root entry | invariant 1, 7 and 9 |
| An error branch of the new readers goes untested (test-gate measures coverage over `src/**` only, so nothing else would notice) | a LICENSE-folder fixture with its own "not a file" message; a lockfile without `packages[""]`; a root path holding a NUL character, whose LICENSE stat throws `ERR_INVALID_ARG_VALUE` and must be re-thrown (technical-planning decision 19) | release fixtures and the NUL-path test; invariant 9 |
| npm rewrites more than the licence | hand edit of one line; `git diff --numstat` of package-lock.json is exactly 3 added and 3 removed lines | Steps 10 and 14 |
| The installed validator behaves unlike the coordinator's run | run before and after with the same install; version and both outputs recorded | Steps 9 and 14 |
| Another release lands on main first | Step 9 requires `git merge-base HEAD main` to equal `git rev-parse main`, so the diff anchor is the tree's real base; VERSION read on main at Step 9 (a value other than 6.14.135 goes into README's PolyForm line and `LAST_POLYFORM_VERSION`, reported to the owner), again before the bump and again at Step 14; a move after Step 9 stops the build and is reported, the coordinator rebases, and Step 9 runs again | Steps 9, 10, 14 |
| A later widening of release.js's README patterns rewrites "6.14.135" and falsifies the sentence | invariant 5 pins the line and the number | invariant 5 |
| Queued README plans declare README.md (the README rewrite series in the build queue places the licence section in its reference slice, item 11, without quoting it; no queued plan outside plans/done quotes the PolyForm line or "Use CTO Chief freely") | the scheduler orders builds whose declared files overlap; invariant 5 fails any later README build that drops or rewrites the PolyForm line or the agreement's statements | scheduler; invariant 5; reported to the owner |
| A recorded tool output carries a home-folder path into a committed plan file | the repository's absolute path is written `<repo>` and temporary folders `<tmp>` in every recorded output | Steps 8, 9, 14 |
| The agreement's text rests on unread primary sources | listed for the owner below; a Dutch lawyer reviews it for a later release (the owner's answer) | below |

### Security Review

- [x] **Path traversal:** test helpers read fixed names under the repository root or a fresh `os.tmpdir()` folder; no path is built from file contents (the "SEE LICENSE IN" value is compared, never joined into a path).
- [x] **Input validation:** a missing or unparseable source yields `null` or a named problem; `readLicenseSources` re-throws any error other than a missing file.
- [x] **No secrets:** none handled or written.
- [x] **Safe file operations:** the tests write only inside their temporary folders; release.js is unchanged.
- [x] **Error messages:** name a file and a value, nothing else.
- [x] **Prototype pollution:** `Object.hasOwn` for the plugin.json check; no merging of untrusted objects.
- [x] **Command injection:** no shell in the tests; release.js is run by the builder as `node src/scripts/release.js`.
- [x] **Privacy:** only Tijn van der Zant and tijn@theaiguys.com in added lines; the account name only inside an address that starts with the repository's address `https://github.com/robotijn/ctoc`, or on README's footer line when release.js changed nothing on it but the version (technical-planning decision 18); scan at Step 14.

### What the agreement's text relies on that was not verified (for the owner)

No lawyer has reviewed the text; by the owner's answer it is released as planned and a Dutch lawyer reviews it for a later release. The text names the mandatory limits instead of resting on these unread or contested points:
- The official text of Dutch Civil Code articles 6:231 to 6:248 was not reached; the consumer grey list (6:237 item f) and the 6:234 duty to make terms available come from secondary copies.
- The rule that an exclusion cannot be invoked for intent or deliberate recklessness rests on secondary sources; the Supreme Court decision read does not state it.
- The Product Liability Directive's application date is contested (8 or 9 December 2026); the text names product liability toward natural persons as unaffected whatever the date.
- Whether a licence file and a README notice, without a click-through step, bind a business to pay: one first-instance judgment about a professional user, none on payment duties.
- Whether a public repository plus a plugin listing "directs activities" to other member states (which decides whether a foreign consumer's home law and courts apply); the text keeps those protections either way.
- Whether Dutch law lets a licensor end, by notice, a licence with no termination clause; this text has none (technical-planning decision 9).
- Whether the general phrase "as far as the law allows" meets transparency rules; the Unfair Contract Terms Directive was not researched.
- Whether the PolyForm Project's own terms set conditions (attribution, or keeping its text unchanged) on reusing wording from its licences. The organisation list and the 32-day phrase are settled by Decisions 1 and 2 and stay; for everything else drawn from PolyForm texts (the acceptance sentence, the affiliates and control definitions, the three competition sentences) the builder writes the clause in its own words, keeping the meaning the clause table states.

## Decisions Taken Under Ambiguity — technical planning

1. **One slice.** The reasons are under "Why this is one slice": the invariant tests couple the four values, the licence and the version must share one commit for Decision 7's sentence to be true, README must change with LICENSE, and the owner ordered one patch release.
2. **The title is fixed here: `CTO Chief (CTOC) End-User License Agreement`.** Parent Decision 6 leaves the wording to the build; fixing it in the plan means the tests written first need no guess. It names CTOC, contains neither "PolyForm" nor "Shield", and any later change lands in LICENSE and both test constants together.
3. **"Commercial" is not in the title.** The agreement grants free use too, and "commercial license" in its text names the separate paid licence; one word for both would blur them.
4. **American spelling "license" in LICENSE and README,** matching the file name, the npm value "SEE LICENSE IN LICENSE" and README's existing heading. Plans keep the British spelling in prose.
5. **Two literal pins of the title and the value,** one in `tests/version-license-invariant.test.js` (parent scenario 1 places it there) and one in `tests/release.test.js` (scenario 13: "as pinned in the test"). Both are compared with the same LICENSE line and the same package.json value, so a change to one without the other turns a test red; they cannot drift silently.
6. **`normalizeLicense` is removed.** Parent Decision 8 left it to the build; after the change it has no caller (search above: 2 files, the helper and its one caller's old lines).
7. **The lockfile root is read by a local reader in the invariant test, and its fixture writes a minimal lockfile** (root entry only, copied from the real one): parent Decision 9 keeps `metadata-invariant.js` unchanged, and copying the whole lockfile into each fixture would add nothing the root entry does not carry.
8. **The liability exclusion covers every user who is not a consumer, not only business licensees.** Decision 4 names two tiers, consumers and business licensees; Decision 1 makes charities, schools, universities and public bodies free users that are neither. The consumer protections the research found (Dutch Civil Code article 6:237, the consumer rules of Rome I and Brussels I recast) do not protect an organisation, and the old PolyForm Shield text excluded liability toward every user as far as the law allows. Leaving those organisations in no tier would make the licensor's liability toward a free organisation wider than toward a paying business. The named carve-outs of Decision 4 apply to everyone. Scenario 5 holds unchanged.
9. **No termination, severability, patent or entire-agreement clause.** The owner's terms do not order them; a use outside the grant is unlicensed under copyright, and the acceptance clause makes the terms conditions of every license, as the old text did. Each is a point for the lawyer's review of a later release, and is listed above.
10. **README line 1179's "CTO Chief is open source" becomes "The source code of CTO Chief is public".** README.md is in scope, and calling a commercial end-user license "open source" is false. "PRs … are welcome" stays: whether to accept outside contributions before a contributor license agreement exists is the owner's call (parent, findings for the owner), and is named to him.
11. **README's licence statements are pinned by a test** (invariant 5): release.js rewrites README on every release, and a widened version pattern would silently turn "6.14.135" into the current version, falsifying a legal statement.
12. **The tree carrying the agreement must be labelled after the last PolyForm Shield version** (invariant 6), so no tree labelled 6.14.135 can carry the agreement.
13. **The bump is the last act of Step 10,** so the reviews of Steps 11 to 13 and the gated suite of Step 14 see the exact tree that lands; after Step 14 only this plan file's Execution Record changes, and any other change runs Step 14 again.
14. **plugin.json's missing licence and package.json's `"private": true` are held by the invariant test** (scenario 8), in the same test that reads the three values.
15. **`claude plugin validate --strict --json` is run as parent scenario 9 requires.** Believed, from the coordinator's run on 2026-10-23: it checks the manifests locally and starts no session and calls no model. If it starts a session or asks for a model, the builder stops it and reports.
16. **Every recorded output writes the repository's absolute path as `<repo>` and temporary folders as `<tmp>`,** because this plan file is committed and the privacy scan covers it.
17. **No question for the owner.** His terms, the lawyer answer and Decisions 1 to 9 are settled; the choices above are wording, test layout, or follow from mandatory law and a settled decision. The questions file holds an empty list.
18. **The privacy scan accepts the account name on exactly one kind of line beyond the repository's addresses** (spec round 1, blocking finding). release.js rewrites README's footer line (`src/scripts/release.js` line 79, pattern `^\*\*X.Y.Z\*\*`), so that line is always an added line, and on main (README.md line 1183) it already carries the account's GitHub handle and profile address, which are public. The rule: an added line passes when, after every address starting with `https://github.com/robotijn/ctoc` is removed, it no longer contains the account name; otherwise it passes only if it is in README.md, starts with `**<new VERSION>**`, and becomes byte-identical to a line of `git show <the Step 9 commit>:README.md` when `**<new VERSION>**` is replaced by `**<the Step 9 VERSION>**`. Every other line is held to the full rule; nothing is loosened for it. The anchor is the Step 9 commit, the same anchor as the diff, not a moving `main`. The prefix form is needed because README line 1179, an added line once its first sentence changes, carries the account name only inside the repository's issue, pull-request and new-issue addresses.
19. **The re-throw of a non-missing stat error in `readLicenseSources` is tested with a root path holding a NUL character** (spec round 2, replacing round 1's "untested"). Verified by the CTO Chief on this machine (Node v24.14.1, macOS): `fs.statSync` on a path containing a NUL character throws with code `ERR_INVALID_ARG_VALUE`. Node checks for the NUL character in its own path validation before any system call, so the same error is believed on Windows and Linux (not run there). `readLicenseSources('bad\0root')` reads package.json through `safeReadJson`, which returns `null`, and then the LICENSE stat throws; the test asserts the throw and its code. The missing-file and not-a-file branches each have a fixture, so every branch of the new reader is now exercised.
20. **The commit author is checked by the CTO Chief's commit-and-push step, not by the completion route, and not recorded in this plan** (spec round 2). The completion route (`menu task complete`) validates the plan, moves it to review, runs Step 14, saves the check evidence and settles the task; it never commits or pushes (`agents/iron-loop/iron-loop-executor.md`, section "Completing a plan"). The commit and the push are the CTO Chief's, after that route. That step commits with `git -c user.name="Tijn van der Zant" -c user.email="tijn@theaiguys.com"` when the Step 9 config check did not match; after the commit and before the push, `git log -1 --format='%an <%ae>'` must print exactly `Tijn van der Zant <tijn@theaiguys.com>`, otherwise there is no push. The commit happens after Step 16, so recording the result in the Execution Record would need a second commit; it goes in the CTO Chief's report to the owner instead.
21. **The clause table gives meanings, and only the quoted or backticked text is fixed** (spec round 1): the builder words the agreement, so the table could not say "exactly" and also ask for the builder's own words for the clauses drawn from PolyForm texts. The no-cap rule is an instruction, so it moved out of the table to "Nothing else goes into LICENSE". The once-only phrase of parent Decision 5 is fixed in LICENSE and README alike, so Step 11 can check that README says nothing LICENSE does not.
22. **Section 2 states the order of the definitions.** Parent Decision 1 says "except that" for the listed organisations; without that order a charity (a legal entity) or its paid staff would be business use under (a) or (b). Rule (e) still overrides (c) and (d).

## Execution Plan

### Step 8: TEST
- [ ] Edit `tests/helpers/source-of-truth.js` (new `readLicenseSources`, new `licenseDeclarationVerdict`, `normalizeLicense` removed), `tests/version-license-invariant.test.js`, `tests/release.test.js` and `tests/release-metadata-sync.test.js` exactly as specified above. Do not touch LICENSE, README.md, package.json, package-lock.json or the manifests yet.
- [ ] Run `node --test tests/version-license-invariant.test.js tests/release.test.js`. Record in the Execution Record, as prose, every failing and every passing test by name: each of the two files reports at least one failure, and between them the failures name package.json, the package-lock.json root, the marketplace entry and the LICENSE title line (parent scenario 11). Any failure the Test Plan table does not predict is investigated before going on.
- [ ] Run `node --test tests/release-metadata-sync.test.js`: it passes (it cannot fail first; record that).
- [ ] Step 8 done

### Step 9: PREPARE
- [ ] Record the commit this build's tree is based on, `git merge-base HEAD main`, and require it to equal `git rev-parse main`; if they differ (main moved after this worktree was made), stop and report, as Step 10 does: the coordinator rebases onto the new main and Steps 8 and 9 run again. That commit is "the Step 9 commit" every later diff and the privacy scan use. Record `git show main:VERSION` (6.14.135 on 2026-10-23). If the value read is not 6.14.135, put it into `LAST_POLYFORM_VERSION` in `tests/version-license-invariant.test.js` and into both places on README's PolyForm line (Step 10 writes that line with this value), and report the number to the owner.
- [ ] Read `git config user.name` and `git config user.email`; record only whether they are exactly Tijn van der Zant and tijn@theaiguys.com, never another value. The result goes to the CTO Chief's commit-and-push step, which runs after the completion route (the completion route never commits or pushes): on a mismatch it commits as `git -c user.name="Tijn van der Zant" -c user.email="tijn@theaiguys.com" commit …` (technical-planning decision 20).
- [ ] Record `claude --version`; confirm the syntax with `claude plugin validate --help`; run `claude plugin validate --strict --json` on the repository root before any manifest changes; record the output in full, with the repository's path written `<repo>`.
- [ ] Re-read the files of this slice at the lines named above; record any line that moved.
- [ ] Step 9 done

### Step 10: IMPLEMENT
- [ ] `LICENSE`: write the agreement from the clause table, every row, nothing more.
- [ ] `README.md`: the badge on line 8, the `## License` section, and the first sentence of the note on line 1179, exactly as specified.
- [ ] `package.json` line 5, `package-lock.json` line 10 and `.claude-plugin/marketplace.json` line 21: `"license": "SEE LICENSE IN LICENSE",`, each by hand with Edit.
- [ ] The patch release: read `git show main:VERSION` again. If it differs from the Step 9 value, stop and report: the coordinator rebases onto the new main and Step 9 runs again, which sets README's PolyForm line and `LAST_POLYFORM_VERSION` to the value it reads. Otherwise set VERSION to the next patch number after the Step 9 value, run `node src/scripts/release.js`, and record its exit code (0) and the files it reports updated.
- [ ] Run `node --test tests/version-license-invariant.test.js tests/release.test.js tests/release-metadata-sync.test.js`: 0 failed (parent scenario 11, after). Record the counts as prose.
- [ ] Step 10 done

### Step 11: REVIEW
- [ ] Dispatch `iron-loop-critic` with the parent's scenarios 1 to 8 and 11 to 14 and this slice's decisions: fill the fourteen-term table from LICENSE; check scenarios 3 to 6 sentence by sentence against Decisions 1, 2, 4 and 5; attack the definitions for a use that is free under one reading and paid under another, and the clauses for any right the owner's terms withhold (redistribution, sublicensing, modified copies, a competing product, business use after the evaluation period); check that README says nothing LICENSE does not; check every changed assertion against the table above (none loosened).
- [ ] Step 11 done

### Step 12: OPTIMIZE
- [ ] Record the run time of the three test files before (Step 8) and after (Step 10); the minimal lockfile fixture keeps the added fixture tests from copying the full lockfile. A material rise is a finding for Step 13's report.
- [ ] Step 12 done

### Step 13: SECURE
- [ ] Dispatch `security-scanner` on the diff: the test helpers (no path from file contents, no swallowed error, temporary folders removed), LICENSE and README (no secret, no personal data, no e-mail address other than tijn@theaiguys.com, no home-folder path, the account name only inside the repository address), and this plan file's records.
- [ ] Step 13 done

### Step 14: VERIFY
- [ ] `git show main:VERSION` still equals the Step 9 value; if main moved, stop and report (the rebase is the coordinator's).
- [ ] `npm test`, the gated entry point, on this exact tree: fail 0, skipped 0, coverage at or above `.ctoc/coverage-baseline.json` `minPct`. It includes the type check (`tests/typecheck.test.js`, also `npm run typecheck`); record that test's result by name. Run it in the foreground with a timeout long enough, up to 10 minutes; if it needs longer, run it in the background and end the turn.
- [ ] `npm run lint`: no warning.
- [ ] `claude plugin validate --strict --json` on the repository root with the same installed Claude Code: no error and no warning the Step 9 run did not report, and no message about the licence field (parent scenario 9). Record the output in full, the path written `<repo>`.
- [ ] `git diff --numstat <the Step 9 commit>`: package-lock.json 3 and 3 (the licence and the two versions), package.json 2 and 2, `.claude-plugin/marketplace.json` 3 and 3, `.claude-plugin/plugin.json` 1 and 1, VERSION 1 and 1; CLAUDE.md unchanged, or changed only on count lines. Read the README diff: only line 8, the License section, the note's first sentence, the four version lines release.js writes (lines 9, 140, 1112 and 1183, each changed only in its version number) and any count lines.
- [ ] Read VERSION, package.json `version`, both version values of package-lock.json, plugin.json `version`, and both version fields of the marketplace manifest: all equal VERSION (parent scenario 10).
- [ ] The privacy scan over every added line of `git diff <the Step 9 commit>`, this plan file included: every match of `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}` is tijn@theaiguys.com; no match of the home-folder patterns `[/]Users[/]`, `[/]home[/]`, `C:[\\]Users` or `[~][/]`; and every added line read for a person's name other than Tijn van der Zant. The account name, pattern `robo[t]ijn` (the home-folder and account-name patterns are written so that they cannot match this line), is checked in two steps (technical-planning decision 18): (a) remove from the added line every address that starts with `https://github.com/` followed by the account name and `/ctoc`; if no match of `robo[t]ijn` remains, the line passes; (b) otherwise the line passes only if it is in README.md, starts with `**<new VERSION>**`, and, with that prefix replaced by `**<the Step 9 VERSION>**`, is byte-identical to a line of `git show <the Step 9 commit>:README.md`; on the landed tree that is only README's footer line. Any other line fails. Record the result; a finding is fixed and Step 14 runs again.
- [ ] Copy the changed-assertions table into the Execution Record, with any further change and its reason (parent scenario 15).
- [ ] From here only this plan file's Execution Record changes; any other change runs Step 14 again.
- [ ] Step 14 done

### Step 15: DOCUMENT
- [ ] The Execution Record holds: the Step 8 and Step 10 test results as prose, with the runner's own figures for tests, passed and failed, the Claude Code version and both validator outputs, the diff counts, the fourteen-term table, the changed-assertions table, the privacy scan result, the Step 9 git config identity check (match or not; the commit-author check itself is the CTO Chief's, decision 20), and the list "What the agreement's text relies on that was not verified" carried forward for the owner. No other document changes: nothing under `docs/` names the licence (pattern `PolyForm|Shield` over `docs/`: 0 files).
- [ ] Step 15 done

### Step 16: FINAL-REVIEW
- [ ] Dispatch `iron-loop-critic` against all fifteen parent scenarios, parent Decisions 1 to 9 and this slice's decisions, on the tree Step 14 verified; it re-checks the fourteen-term table against LICENSE itself, not against the record.
- [ ] Report to the CTO Chief the commit-author check of parent scenario 15, which its commit-and-push step runs after the completion route (technical-planning decision 20): commit with `git -c user.name="Tijn van der Zant" -c user.email="tijn@theaiguys.com"` when the Step 9 config check did not match; after the commit and before the push, `git log -1 --format='%an <%ae>'` must print exactly `Tijn van der Zant <tijn@theaiguys.com>`, otherwise there is no push and the mismatch is reported. The result goes in the CTO Chief's report to the owner, not into this plan.
- [ ] Step 16 done
