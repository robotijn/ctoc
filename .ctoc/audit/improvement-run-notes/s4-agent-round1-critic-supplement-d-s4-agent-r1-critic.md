# Supplement to the round 1 critique of `agents/ai-quality/hallucination-detector.md`

Dispatch `d-s4-agent-r1-critic`, supplement. It is based on `d-s4-agent-r1-research-gaps`, read 2026-09-30.

**What this supplement does**
- **Four new changes** fix the rows the second research pass refuted or found wrongly worded: the `throwOnError` row (together with the `autoValidate` and `cacheTimeout` rows), the `flatMap` row, the `node-fetch` row and the axios label.
- **Three first-report changes are amended**, and each amendment replaces that change's `new` text in full:
  - Changes 4 and 13 now quote the bcrypt README.
  - Change 2 now checks scoped npm names with the same `curl` recipe as other names, using an address form the second pass observed working. It no longer uses `npm view`, whose exit status on a missing name is still not checked.
- **Nothing else from the first report changes.** Every `old` below is a verbatim, unique substring of the current file and does not overlap any `old` in the first report.

**Caution for the validation dispatch.** The second research note says its quotes "were pulled out by the fetch tool's own model, not copied byte for byte". So the validator must confirm, word for word, every quotation this supplement writes into the file before it is applied (see section 3).

## 1. The carried claims the second research pass settled

### Checked and correct, keep as they are

**bcrypt and bcryptjs**
- **Line 27** (bcrypt has `hashSync`): correct (bcrypt README).
- **Lines 28 and 126** (bcryptjs is the alternative): correct (bcryptjs README).

**axios**
- **Lines 43 and 111** (a GET request has no `body`; use `params`): correct (axios request configuration page and README).
- **Line 128** (`axios.post`: use `data`, not `body`): correct (axios README).
- **Line 102** (the request configuration has no `body` field): correct against the documented configuration. The type file itself was not fetched.

**Dates**
- **Lines 46, 110, 133 and 168** (`formatISO` is a date-fns function; a moment instance has no `formatISO`; `moment().toISOString()` exists): correct from source. The static form `moment.formatISO(...)` stays carried (section 4).

**Node.js `fs`, FastAPI, React and lodash**
- **Line 49** (`fs.readFileSync` has no `throwOnError`): correct from Node.js's `lib/fs.js` on its main branch.
- **Line 58** (FastAPI has no `auto_validate`): correct.
- **Lines 61 and 112** (`useAutoFetch` is not a standard hook): correct. The research note warns that a project may define its own hook with that name, and change 11a (first report) already says a pattern hit is a lead, never a finding on its own.
- **Line 136** (`React.useAutoEffect()` does not exist): correct.
- **Line 134** (lodash has `cloneDeep`, not `deepClone`): correct.

**Text that change 1a already removes (no amendment)**
- **Lines 88–91** (the name `ERR_REQUIRE_ESM`, the 20.19 and 22.12 version boundary, and `ERR_REQUIRE_ASYNC_MODULE`): correct. Change 1a removes this text on safety grounds, and nothing re-adds it.
- **Line 92** (dynamic `import()` loads both kinds of module): correct. The same change removes it.
- **Lines 92–93**, "in every case": refuted, because the ECMAScript modules page lists exceptions. Change 1a already removes this text, and the refutation is a second reason to remove it.

### Finding S1 — the axios example is labelled "Wrong method signature" when it is a wrong configuration key

**What is wrong.** Line 42 labels `axios.get(url, { body: data })` as a wrong method signature. The call's signature is fine; the fault is a configuration key axios does not have.

**Evidence.** Second research note, item 3a (read 2026-09-30): axios's request configuration has no `body` key, and `data` is "Only applicable for request methods `PUT`, `POST`, `DELETE`, and `PATCH`" (https://axios.rest/pages/advanced/request-config). The note's own remark on line 42 says the same.

**Decision:** `change`

**Proposed change S1**

old:
~~~text
// HALLUCINATION - Wrong method signature
~~~

new:
~~~text
// HALLUCINATION - Wrong configuration key (axios's request configuration has no `body` key: https://axios.rest/pages/advanced/request-config, read 2026-09-30)
~~~

### Finding S2 — the `throwOnError` row would flag correct code; the `autoValidate` row cannot be sourced; the `cacheTimeout` row says nothing

**What is wrong**
- **`throwOnError` (line 141).** The row names no library. `throwOnError` is a real option in TanStack Query version 5, a library this file itself recommends at lines 25 and 125. So the row tells the agent to flag correct TanStack Query code. The option is absent only from Node.js `fs` (line 49).
- **`autoValidate` (line 142).** "Made up" is a negative across every library, so it cannot be sourced.
- **`cacheTimeout` (line 143).** Its "Actual" column says only "Check actual API". It names no library, so it carries the same unsourceable negative under a "Hallucinated" heading, and gives no action.

**How the three rows are replaced**
- **One row scoped to `fs`.** It carries both sources.
- **One rule row.** It names the other two keys only as examples of plausible keys, and states what to check. It asserts nothing about either key.

**Evidence** (second research note, read 2026-09-30)
- **Item 5b.** TanStack's migration guide says: "The `useErrorBoundary` option has been renamed to `throwOnError`" (https://tanstack.com/query/v5/docs/react/guides/migrating-to-v5).
- **Item 5a.** `throwOnError` appears nowhere in https://raw.githubusercontent.com/nodejs/node/main/lib/fs.js.
- **Item 12.** The `autoValidate` row is unsourceable because "the line names no library".
- **`cacheTimeout`.** Its removal rests on the same reasoning as item 12, not on a fetched source about `cacheTimeout`. If the validator will not accept that, drop the `cacheTimeout` example from the new rule row and keep the old line 143 row, carried.

**Decision:** `change`

**Proposed change S2**

old:
~~~text
| `{ throwOnError: true }` | Usually not a real option |
| `{ autoValidate: true }` | Made up |
| `{ cacheTimeout: 5000 }` | Check actual API |
~~~

new:
~~~text
| `{ throwOnError: true }` passed to a Node.js `fs` call such as `fs.readFileSync` | Not an `fs` option: `throwOnError` appears nowhere in the main branch of Node.js's `lib/fs.js` (https://raw.githubusercontent.com/nodejs/node/main/lib/fs.js, read 2026-09-30). The same key is real in TanStack Query version 5: "The `useErrorBoundary` option has been renamed to `throwOnError`" (https://tanstack.com/query/v5/docs/react/guides/migrating-to-v5, read 2026-09-30). Name the library that receives an option before flagging it. |
| Any other option key that sounds plausible, such as `{ autoValidate: true }` or `{ cacheTimeout: 5000 }` | An option name proves nothing on its own. Name the library that receives it, read that library's option list in its installed declaration files (Detection Methods, section 2), and report the key only when that list lacks it. |
~~~

### Finding S3 — `Array.flatMap()` is written as if it were static; it is a method on array instances

**What is wrong.** The row names a static `Array.flatMap()`. The method is on the array prototype. "ES2019" is also an unexpanded abbreviation.

**Evidence** (second research note, item 11, read 2026-09-30)
- The Mozilla Developer Network reference: "The `flatMap()` method of `Array` instances returns…".
- The ECMAScript standards committee's list of finished proposals: "`Array.prototype.{flat,flatMap}` … 2019" (https://raw.githubusercontent.com/tc39/proposals/main/finished-proposals.md).

The fetch tool added an unrequested remark about when the method was introduced. The note excluded it, and it is not used here.

**Decision:** `change`

**Proposed change S3**

old:
~~~text
| `Array.flatMap()` polyfill | Built-in since ES2019 |
~~~

new:
~~~text
| `Array.prototype.flatMap()` polyfill | Built in since ECMAScript 2019: the ECMAScript standards committee's list of finished proposals gives "`Array.prototype.{flat,flatMap}` … 2019" (https://raw.githubusercontent.com/tc39/proposals/main/finished-proposals.md, read 2026-09-30) |
~~~

### Finding S4 — "`node-fetch` (modern Node)" gives no version

**What is wrong.** "Modern" is a word with no threshold. The research note gives two version boundaries (item 9, read 2026-09-30, https://nodejs.org/api/globals.html):
- "v18.0.0: No longer behind `--experimental-fetch` CLI flag"
- "v21.0.0: No longer experimental."

**Decision:** `change`. I chose to scope the row to Node.js 21 or later. On versions 18 to 20 the global `fetch` is still marked experimental. Recommending an experimental interface over a working dependency would conflict with this project's rule that deprecations and warnings are defects. The row states both version boundaries, so the reader sees why.

**Proposed change S4**

old:
~~~text
| `node-fetch` (modern Node) | global `fetch` |
~~~

new:
~~~text
| `node-fetch` on Node.js 21 or later | global `fetch`: "v18.0.0: No longer behind `--experimental-fetch` CLI flag" and "v21.0.0: No longer experimental." (https://nodejs.org/api/globals.html, read 2026-09-30) |
~~~

### Amendment to change 4 (first report): the bcrypt comment, made exact from the README

**What changes.**
- **Added.** The bcrypt README says pre-built binaries ship "on a best-effort basis" (second research note, item 1b, https://raw.githubusercontent.com/kelektiv/node.bcrypt.js/master/README.md, read 2026-09-30).
- **Kept.** The install-script fact from the first note, and the checked sentence about bcryptjs.
- **Not added.** No statement about when a build toolchain is needed; that would be my inference, not the source's.

The `old` is unchanged from the first report. This `new` replaces change 4's `new` in full.

new:
~~~text
// WRONG PACKAGE FOR THE ENVIRONMENT - hashSync exists, but bcrypt is a native add-on
// (install script "node-gyp-build", https://registry.npmjs.org/bcrypt/latest, read 2026-09-30).
// Its README: "Pre-built binaries for various NodeJS versions are made available on a best-effort basis."
// (https://raw.githubusercontent.com/kelektiv/node.bcrypt.js/master/README.md, read 2026-09-30)
// Use bcryptjs where native builds aren't available.
import { hashSync } from 'bcrypt';

// LOOKS INVENTED, IS REGISTERED - never judge a name by how it sounds; ask its registry
import { validateEmail } from 'email-validator-pro';
```

```rust
// NOT ON ITS REGISTRY WHEN CHECKED - crates.io answered HTTP 404 for this name at
// https://crates.io/api/v1/crates/tokio_advanced and at
// https://index.crates.io/to/ki/tokio_advanced (both read 2026-09-30)
use tokio_advanced::runtime::SmartRuntime;
```

`email-validator-pro` sounds like a model's invention. It is a registered npm package: the registry answers with the name "email-validator-pro", latest version "1.0.1", created "2017-05-18T04:34:21.018Z" (https://registry.npmjs.org/email-validator-pro, read 2026-09-30), while PyPI answered HTTP 404 for the same name that day (https://pypi.org/pypi/email-validator-pro/json, read 2026-09-30). Whether it exports `validateEmail` was not checked. A name is invented only when the registry of the code's own ecosystem has no such name.

Four failure classes hide under "bad import": a *renamed* package (real, but superseded), a package that is *wrong for the target environment* (real exports, wrong runtime), a name the registry *holds as a placeholder* (it answers, but no usable package is behind it), and a *fabricated* package (the registry of its ecosystem has no such name when you check). Report the last two as findings of their own types (see "Output Format"); never report the first two as non-existent.
~~~

### Amendment to change 13 (first report): the bcrypt table row

The same README quote now lets the row's condition be stated exactly. The `old` is unchanged; this replaces change 13's `new`.

new:
~~~text
| `bcrypt` where no pre-built binary fits and native builds aren't available (see the bcrypt example above) | `bcryptjs` |
~~~

### Amendment to change 2 (first report): scoped npm names go through the same recipe

**What changes**
- **The scoped-name address is now observed.** In the second research note (item 13b, read 2026-09-30), https://registry.npmjs.org/@isaacs%2fcliui answered HTTP 200 with the name "@isaacs/cliui". The address form is not documented, so the file cites it as observed, not as documented, as the note requires.
- **A missing name's answer is now observed.** A name never registered answered HTTP 404 (item 13a).
- **`npm view` is dropped.** Its exit status on a missing name is still not checked, so the first report's scoped-name branch leaned on an unchecked behaviour.

**What the recipe now does**
- It takes both kinds of name, using three guard statements.
- For a scoped name it writes the `/` as `%2f`, using only standard shell parameter expansion.
- It avoids the variable name `path`, because zsh ties that name to the search path.
- Everything after the npm recipe is unchanged from the first report.

The `old` is unchanged; this `new` replaces change 2's `new` in full.

new:
~~~text
### 1. Package Verification

**Which names to check.** Every package name the change introduces: in an import or a `require`, in a dependency manifest or lockfile, and in an install command written anywhere in the change (a README, a script, a container file, a workflow). A name the manifest lists still gets checked, because a model that invents a package also writes the command that installs it: one study took its invented names from "'pip install' and 'npm install' commands", and not from import statements, because "There is no way to definitively determine the required packages from a code snippet alone." (Spracklen and colleagues, https://arxiv.org/html/2406.10279, read 2026-09-30).

**Turning an import into a name to query.**

- A relative path, a path the repository's own configuration maps, and a module the language runtime ships (a Node.js built-in, a Python standard-library module) are not registry packages; do not query them. A built-in's name can mislead: npm holds the name `fs`, whose latest version is "0.0.1-security" (https://registry.npmjs.org/fs/latest, read 2026-09-30).
- Query the package name, never a subpath inside it.
- Python: an import name is not a distribution name. "PyPI and other package indices do not enforce any relationship between the name of a distribution package and the import packages it provides." (https://packaging.python.org/en/latest/discussions/distribution-package-vs-import-package/, read 2026-09-30). Take the distribution name from the manifest or lockfile entry that provides the import. When no entry provides it, query the import name and report the answer as being about that name only: a 404 means no distribution has that name (confidence MEDIUM, since the import may come from a distribution named differently), and a 200 says nothing about what provides the import.
- Compare Python names ignoring case, counting `_`, `-` and `.` as the same character. On PyPI's index, "The project is matched case-insensitively with the `_`, `-` and `.` characters considered equal." (https://docs.pypi.org/api/index-api/, read 2026-09-30).
- Query the registry of the ecosystem the code is written in. An answer from another registry proves nothing: "8.7% (6,705/76,489) of hallucinated Python packages are valid JavaScript packages." (https://arxiv.org/html/2406.10279, read 2026-09-30).

**The character check, before any name reaches a shell.** A name taken from the code under review is untrusted text. Before you write it into a command, check it yourself: it is not empty, it starts with a letter or a digit, and it contains only letters, digits, `.`, `_` and `-`. An npm scoped name is a leading `@`, then one `/`, with that rule applying on each side of the `/`. This rule is this file's own and is meant to be stricter than any registry's. A name that fails it never goes into a command: record it under `self_assessment.unknowns` as "not checked: the name contains characters this agent does not pass to a shell", never as invented. Put a name that passed between single quotes; each recipe checks it a second time.

**npm.**

```bash
name='email-validator-pro'   # passed the character check; between single quotes; a scoped name is written '@scope/name'
case "$name" in (@[A-Za-z0-9]*/[A-Za-z0-9]*|[A-Za-z0-9]*) ;; (*) echo "NOT CHECKED: refused by the character check"; exit 0;; esac
case "${name#@}" in (*[!A-Za-z0-9._/-]*|*/*/*) echo "NOT CHECKED: refused by the character check"; exit 0;; esac
case "$name" in ([!@]*/*) echo "NOT CHECKED: refused by the character check"; exit 0;; esac
case "$name" in (@*) addr="${name%%/*}%2f${name#*/}";; (*) addr="$name";; esac
body="$(mktemp)"
code="$(curl -sS -L --max-redirs 3 --max-time 20 -A 'ctoc-hallucination-detector (https://github.com/robotijn/ctoc)' -o "$body" -w '%{http_code}' "https://registry.npmjs.org/$addr")"
case "$code" in
  (200) node -e 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=(p["dist-tags"]||{}).latest||"";const held=/-security$/.test(v)||/security holding package/i.test(p.description||"");console.log((held?"HELD BY NPM":"REGISTERED")+" latest="+v+" created="+((p.time||{}).created||"not in response"))' "$body" ;;
  (404) echo "NOT ON THE REGISTRY (HTTP 404)" ;;
  (*) echo "COULD NOT LOOK (HTTP ${code:-none})" ;;
esac
rm -f "$body"
```

For a scoped name the recipe writes the `/` as `%2f`. npm's documentation gives no rule for this; the form was observed to work: https://registry.npmjs.org/@isaacs%2fcliui answered HTTP 200 with the name "@isaacs/cliui" on 2026-09-30. A name never registered answered HTTP 404 (https://registry.npmjs.org/qwzxkvjmplnbrtdhgfcysqwzxkvjmplnbrtdhgfc, read 2026-09-30); npm's registry document describes no not-found response (https://raw.githubusercontent.com/npm/registry/main/docs/REGISTRY-API.md, read 2026-09-30).

**PyPI.**

```bash
name='email-validator-pro'   # a distribution name that passed the character check; between single quotes
case "$name" in (''|[!A-Za-z0-9]*|*[!A-Za-z0-9._-]*) echo "NOT CHECKED: refused by the character check"; exit 0;; esac
body="$(mktemp)"
code="$(curl -sS -L --max-redirs 3 --max-time 20 -A 'ctoc-hallucination-detector (https://github.com/robotijn/ctoc)' -o "$body" -w '%{http_code}' "https://pypi.org/pypi/$name/json")"
case "$code" in
  (200) node -e 'const i=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).info||{};console.log("REGISTERED name="+i.name+" version="+i.version+" summary="+JSON.stringify(i.summary||""))' "$body" ;;
  (404) echo "NOT ON THE REGISTRY (HTTP 404)" ;;
  (*) echo "COULD NOT LOOK (HTTP ${code:-none})" ;;
esac
rm -f "$body"
```

This queries PyPI's documented JSON API (https://docs.pypi.org/api/json/, read 2026-09-30). That documentation lists only "200 OK - no error"; the 404 for a missing name is observed behaviour, seen for `email-validator-pro` at https://pypi.org/pypi/email-validator-pro/json on 2026-09-30. Do not use `pip index versions` in its place, because it needs a local pip. It is no longer experimental: pip 25.1 lists "Remove `experimental` warning from `pip index versions` command." and "Add a structured `--json` output to `pip index versions`" (https://pip.pypa.io/en/stable/news/, read 2026-09-30).

**crates.io and Maven Central** (only the status is read):

| Registry | Address, built only from names that passed the character check | Source, read 2026-09-30 |
|---|---|---|
| crates.io | `https://crates.io/api/v1/crates/<name>`, at most one request per second, with the user-agent header the recipe sends | The crates.io policy requires "a maximum of 1 request per second" and "a user-agent header that allows us to uniquely identify your application" (https://rust-lang.github.io/rfcs/3463-crates-io-policy-update.html); `tokio_advanced` answered 404 at https://crates.io/api/v1/crates/tokio_advanced |
| Maven Central | `https://repo1.maven.org/maven2/<groupId, each . replaced by />/<artifactId>/maven-metadata.xml` | `org.apache.commons:commons-security` answered 404 at https://repo1.maven.org/maven2/org/apache/commons/commons-security/maven-metadata.xml |

```bash
url='https://crates.io/api/v1/crates/tokio_advanced'   # built as the table says; between single quotes
case "$url" in (*[!A-Za-z0-9:/._-]*) echo "NOT CHECKED: refused by the character check"; exit 0;; esac
code="$(curl -sS -L --max-redirs 3 --max-time 20 -A 'ctoc-hallucination-detector (https://github.com/robotijn/ctoc)' -o /dev/null -w '%{http_code}' "$url")"
case "$code" in (200) echo "REGISTERED";; (404) echo "NOT ON THE REGISTRY (HTTP 404)";; (*) echo "COULD NOT LOOK (HTTP ${code:-none})";; esac
sleep 1   # crates.io: at most one request per second
```

**No recipe here.** NuGet, the Go module proxy and every other registry: record each name under `self_assessment.unknowns` as not checked. The skill's check for a Postgres extension queries a database, not a registry: do not run it; record the extension the same way.

**What a registry answer proves.**

- **200, with a placeholder behind it.** An npm latest version ending in `-security`, or an npm description reading "security holding package" (as for `crossenv`, latest "0.0.2-security", https://registry.npmjs.org/crossenv, read 2026-09-30); a PyPI summary saying the name is deprecated or points to another project, as for `sklearn`, "deprecated sklearn package, use scikit-learn instead" (https://pypi.org/pypi/sklearn/json, read 2026-09-30). Report it as `registry_placeholder`: the dependency the code needs does not exist under that name. A held name can change hands; npm's placeholder text says "we'll probably give it to you if you want it" (https://registry.npmjs.org/fs/latest, read 2026-09-30).
- **200, otherwise.** The name is registered. That is necessary, not sufficient; go on to the look-alike check below.
- **404.** Unless the next rule applies, report it as `hallucinated_import`: no package has that name on that registry now. Never write that the name never existed or cannot be registered: npm bars new versions of a fully unpublished package only "until 24 hours have passed" (https://docs.npmjs.com/policies/unpublish, read 2026-09-30); on PyPI "removals are pretty much coupled with prohibiting the Project name from being reused" (https://blog.pypi.org/posts/2024-12-30-quarantine/, read 2026-09-30); and PyPI states that "All API requests are cached" (https://docs.pypi.org/api/, read 2026-09-30), so a name registered minutes ago can still answer 404.
- **404, for a name that may be private.** When the repository configures a registry other than the public one for that ecosystem, or the name carries the organisation's own scope or prefix, it may be an internal package. npm names the attack that follows: "A variant of this attack is when a public package is registered with the same name of a private package that an organization is using." (https://docs.npmjs.com/threats-and-mitigations, read 2026-09-30). Record it under `self_assessment.unknowns` as a possible private package, never as invented, and never suggest publishing the name.
- **Anything else** — no answer, a 401, 403 or 429, a server error, or a recipe that fails to read the answer: could not look. Never report it as not found. Record the name under `self_assessment.unknowns`.
~~~

**Corrections to the first report's section 3**
- **Scoped-name address:** now observed. The file says observed, not documented.
- **"`npm view` installs nothing":** no longer needed. Change 2 no longer runs `npm view`, and change 5 mentions it only as the skill's replaced test.

## 2. Observations, no change this round

- **Line 128 is in the wrong table.** "`axios.post` `body` param" sits in the "Package Names" table although it is not a package name. The claim is correct.
- **Line 135 is arguably not a hallucination.** A `flatMap` polyfill is unnecessary code rather than an invented method; the sibling agent's over-engineering class may own it. Its placement is a structure question for round 2.

## 3. Details the validation dispatch must confirm before changes are applied

1. **The npm `time.created` field path** used in change 2's recipe. Neither research note names the field path, only a "created" timestamp.
2. **Where "we'll probably give it to you if you want it" appears.** Change 2 cites https://registry.npmjs.org/fs/latest; the first note does not say whether it came from `fs` or from `crossenv`.
3. **A missing scoped name answers 404 at the `%2f` address.** Not observed; only a present scoped name (200) and a missing name without a scope (404) were. If it answers otherwise, the recipe reports "could not look", which is safe.
4. **Word-for-word confirmation** of every quotation this supplement writes into the file, because the second note's quotes were extracted by the fetch tool's model:
   - the bcrypt README sentence;
   - the TanStack Query rename sentence;
   - the two Node.js `globals` version lines;
   - the finished-proposals line for `Array.prototype.{flat,flatMap}`;
   - the name "@isaacs/cliui" in the observed response.
5. **Two observations stated in the file without quotation marks:** that `throwOnError` is absent from `lib/fs.js`, and that axios's configuration has no `body` key.

## 4. Claims still carried to round 2, by line in the current file

- **Lines 46 and 133:** the static form `moment.formatISO(...)`. Moment's static namespace was not checked; only instances were.
- **Line 133:** whether `moment().toISOString()` produces the same string as date-fns `formatISO`. Their handling of time-zone offsets was not checked.
- **Line 110:** the pattern comment "moment doesn't have this". It is correct for instances; the static form is carried with line 46. Change 11c's new pattern matches both forms.

Nothing else from the first report's carried list remains open. The claims at lines 88–93 go with the recipe change 1a removes.

## 5. The `{ cacheTimeout: 5000 }` "Check actual API" row (line 143)

Proposed for removal in change S2.

**Ground.** The row sits under the "Hallucinated" heading, names no library, and asserts a negative across all libraries. That is the defect for which the second note rules the `autoValidate` row unsourceable: "the line names no library". Its replacement, a rule row, keeps `cacheTimeout` only as an example of a plausible key and says what to check.

**No fetched source.** No source about `cacheTimeout` itself was fetched.

**If the validator does not accept that ground:** drop `or { cacheTimeout: 5000 }` from the new rule row and keep the old line 143 row, carried to round 2.