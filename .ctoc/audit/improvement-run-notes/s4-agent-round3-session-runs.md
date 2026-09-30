# Round 3, agent file: the research note's requested probes RUN by the session with curl (raw bytes), 2026-09-30, 20:05 CEST

(a) https://registry.npmjs.org/fs/latest — status 200. `description` contains "we'll probably give it to you if you wan…"; the apostrophe is U+0027 (code points 77 65 27 6c 6c 20 = "we'll "). STRAIGHT apostrophe.
(b) https://api.npmjs.org/downloads/point/last-week/@isaacs/cliui — status 200, body {"downloads":116807845,"start":"2026-09-22","end":"2026-09-28","package":"@isaacs/cliui"}; the %2f form (@isaacs%2fcliui) answers identically, status 200. So the downloads endpoint DOES answer for a scoped name, in both address forms.
(c) https://pypi.org/pypi/sklearn/json — status 200; every file in `releases` carries `upload_time_iso_8601`; earliest 2015-07-15T14:17:46.609926Z, latest 2023-12-01T14:30:39.945835Z, 10 files; top-level keys info,last_serial,ownership,releases,urls,vulnerabilities; info.downloads = {"last_day":-1,"last_month":-1,"last_week":-1}.
(d) https://pypi.org/integrity/sigstore/4.5.0/sigstore-4.5.0-py3-none-any.whl/provenance — status 200 both WITHOUT and WITH the header `Accept: application/vnd.pypi.integrity.v1+json`; keys attestation_bundles,version; 1 bundle; publisher.kind "GitHub".
(e) https://www.enisa.europa.eu/sites/default/files/2026-03/ENISA%20Technical%20Advisory%20-%20Package_Managers_Final.pdf — exists (HTTP/2 200, 1,492,177 bytes). Text extracted with pdftotext: "Version: 1.1"; table of contents: 3.2 Supply chain attacks (p.12); 3.2.1 Insertion of malicious packages/dependencies (p.12); 3.2.2 Compromised legitimate packages (p.13); 3.2.3 Typosquatting (p.13); 3.2.4 Namespace/Dependency Confusion (p.14). The section numbers and titles the file cites from the draft SURVIVE in the final.
(f) https://registry.npmjs.org/sigstore/latest — status 200; dist keys: shasum,tarball,fileCount,integrity,signatures,attestations,unpackedSize; dist.attestations = {"url":"https://registry.npmjs.org/-/npm/v1/attestations/sigstore@5.0.0","provenance":{"predicateType":"https://slsa.dev/provenance/v1"}}; _npmUser = {"name":"GitHub Actions","email":"npm-oidc-no-reply@github.com","trustedPublisher":{"id":"github","oidcConfigId":"oidc:a123e7c7-…"}}; maintainers = [{"name":"bdehamer","email":"[redacted by the session; a public registry field, not needed here]"}]; repository = {"url":"git+https://github.com/sigstore/sigstore-js.git","type":"git"}.
Not run: the regular-expression evasions of Part C item 8; whether time.created survives an npm name transfer.
(e, continued) The final advisory's cover says "MARCH 2026" and "Version: 1.1"; its section 1.1 says: "The current version (v1.1) of the document has been released after the ENISA call for feedback (8) that ran between 17 December 2025 and 20 January 2026." So the file's citation of the draft (v0.8, 15 December 2025) should move to: ENISA Technical Advisory for Secure Use of Package Managers, version 1.1, March 2026, same section numbers 3.2.1 and 3.2.2.

# Round 3: the critic's proposed changes RUN before applying (session, 2026-09-30, 20:15 CEST)
Recipe changes 6a, 6b, 6c, 7a and 8a applied to a scratch copy of the file; recipes extracted and run.
npm recipe (identical output in bash and zsh):
  email-validator-pro  REGISTERED latest=1.0.1 created=2017-05-18… provenance=absent trusted_publisher=no maintainers="grafluxe" repository="git+https://github.com/grafluxe/email-validator-pro.git" | DOWNLOADS LAST WEEK 5
  sigstore             REGISTERED latest=5.0.0 created=2022-08-08… provenance=present trusted_publisher=yes maintainers="bdehamer" repository="git+https://github.com/sigstore/sigstore-js.git" | DOWNLOADS LAST WEEK 12683762   <- the provenance read from versions[latest] WORKS; keep the two provenance fields
  @isaacs/cliui        REGISTERED latest=9.0.0 created=2023-05-02… provenance=absent trusted_publisher=no maintainers="isaacs" repository="git+ssh://git@github.com/isaacs/cliui.git" | DOWNLOADS LAST WEEK 116807845   <- scoped downloads now read
  fs                   HELD BY NPM latest=0.0.1-security … maintainers="npm" repository="git+https://github.com/npm/security-holder.git" | DOWNLOADS LAST WEEK 1745704
  @qzvxkj-no-such-scope-20260930/qzvxkj-no-such-pkg-20260930  NOT ON THE REGISTRY (HTTP 404)  (no downloads line)
  qwzxkvjmplnbrtdhgfcysqwzxkvjmplnbrtdhgfc  NOT ON THE REGISTRY (HTTP 404)
  no network: COULD NOT LOOK (answer: none (curl exit 7))
PyPI recipe (bash):
  sklearn   HELD BY PYPI name=sklearn version=0.0.post12 first_upload=2015-07-15T14:17:46.609926Z summary="deprecated sklearn package, use scikit-learn instead"
  requests  REGISTERED name=requests version=2.34.2 first_upload=2011-02-14T08:49:42.641660Z summary="Python HTTP for Humans."
  missing name  NOT ON THE REGISTRY (HTTP 404); no network: COULD NOT LOOK (answer: none (curl exit 7))
Pattern evasions (change 13) against the file's five current patterns, in Node: "const m = moment; m().formatISO(", "require('react' + '-query')", "import(`react-query`)", "axios.get(f(), { body })" → all false (no pattern matches), as the change says.
Look-alike character (change 4a): the name "reаct" (Cyrillic а) through the npm recipe → NOT CHECKED: refused by the character check; grep for [^\x00-\x7F] on a line holding it → 1 hit (also 1 hit with the POSIX-class form [^ -~]).

# After applying round 3: the recipes exactly as they stand in the edited file (fingerprint f8f1b124…), run live (session, 2026-09-30, 20:22 CEST)
npm (bash): sigstore REGISTERED … provenance=present trusted_publisher=yes maintainers="bdehamer" repository="git+https://github.com/sigstore/sigstore-js.git" | DOWNLOADS LAST WEEK …; @isaacs/cliui REGISTERED … DOWNLOADS LAST WEEK 116807…; fs HELD BY NPM …; "x;echo INJECTED" NOT CHECKED: refused by the character check. npm (zsh): sigstore identical.
PyPI (bash): sklearn HELD BY PYPI first_upload=2015-07-15T14:17:46.609926Z; "requests-" NOT CHECKED: not a valid distribution name under the packaging specification.
crates.io (bash): tokio_advanced NOT ON THE REGISTRY (HTTP 404).

## Tool versions used for every run in this note (recorded 2026-09-30 21:06 CEST)
node v24.14.1; Python 3.9.6; GNU bash, version 3.2.57(1)-release (arm64-apple-darwin25); zsh 5.9 (arm64-apple-darwin25.0); curl 8.7.1; macOS 26.6.1; locale LANG=C.UTF-8

## Step 13 follow-up probe (session, 2026-09-30, 22:58 CEST): who publishes npm's held names? (raw registry answers)
fs                  latest 0.0.1-security | _npmUser.name "ehsalazar" | maintainers ["npm"]
crossenv            latest 0.0.2-security | _npmUser.name "npm"       | maintainers ["npm"]
email-validator-pro latest 1.0.1          | _npmUser.name "grafluxe"  | maintainers ["grafluxe"]
react-codeshift     latest 1.0.0          | _npmUser.name "debugducky"| maintainers ["debugducky"]
sigstore            latest 5.0.0          | _npmUser.name "GitHub Actions" | maintainers ["bdehamer"]
So `_npmUser.name === "npm"` is NOT a reliable marker of a held name (fs is held and its publisher field is a person); `maintainers` equal to exactly [{"name":"npm"}] holds for both held names observed and for none of the ordinary ones. Whether an ordinary publisher can add the user "npm" as a maintainer was not checked, so the label must never bypass the look-alike check.

## Step 11 follow-up probes (session, 2026-09-30, as relayed by the dispatcher)
- Item 3 (renamed predecessor versus look-alike): `react-query` last-week downloads 2,001,331, `@tanstack/react-query` 78,603,401; created 2014-08-24 versus 2022-07-19; maintainers `tannerlinsley,tkdodo` versus `tannerlinsley,alemtuzlak,kevinvandy`. So the download comparison fires on the file's own renamed example, and the maintainer sets overlap without being identical: the renamed rule must say "shares at least one maintainer with", not "the same maintainers".
- Item 19 (time zones), Node v24.14.1: `new Date(2026,8,30,12).toISOString()` gave `2026-09-30T10:00:00.000Z` at an offset of −120 minutes.

## Step 11 follow-up reads by the executor (curl 8.7.1 with -q --proto '=https', node v24.14.1), 2026-09-30
- https://unpkg.com/date-fns/formatISO.js redirected to https://unpkg.com/date-fns@4.4.0/formatISO.js, status 200. Its JSDoc: "@returns The formatted date string (in local time zone)"; example "(local time zone is UTC): … //=> '2019-09-18T19:00:52Z'".
- https://raw.githubusercontent.com/moment/moment/develop/src/lib/moment/format.js, status 200. `export function toISOString(keepOffset) {` … `var utc = keepOffset !== true, m = utc ? this.clone().utc() : this;`: moment's `toISOString` converts to Coordinated Universal Time unless called with `keepOffset` true.
- Repeated the Node run under TZ=Europe/Amsterdam: `2026-09-30T10:00:00.000Z -120`, the same as the session's.

## Session runs after the Step 10 return (2026-09-30, 23:10–23:15 CEST): the three recipes as they stand at agent fingerprint sha256:beb08c7faf2802ab43f7fa1b95421389b1c6f9367e6ef4aee2105554b96b5895
Recipes extracted byte-for-byte from the three ```bash blocks; only the name line(s) substituted. Tools: GNU bash 3.2.57, zsh 5.9, curl 8.7.1, node v24.14.1.

### npm recipe, live (bash and zsh gave identical lines)
bash | email-validator-pro | REGISTERED latest="1.0.1" created="2017-05-18T04:34:21.018Z" provenance=absent trusted_publisher=no maintainers="grafluxe" repository="git+https://github.com/grafluxe/email-validator-pro.git" DOWNLOADS LAST WEEK 5 
bash | fs | HELD BY NPM latest="0.0.1-security" created="2014-06-02T02:18:51.732Z" provenance=absent trusted_publisher=no maintainers="npm" repository="git+https://github.com/npm/security-holder.git" DOWNLOADS LAST WEEK 1745704 
bash | crossenv | HELD BY NPM latest="0.0.2-security" created="2017-07-19T04:21:00.066Z" provenance=absent trusted_publisher=no maintainers="npm" repository="git+https://github.com/npm/security-holder.git" DOWNLOADS LAST WEEK 1818 
bash | react-query | REGISTERED latest="3.39.3" created="2014-08-24T19:07:48.154Z" provenance=absent trusted_publisher=no maintainers="tannerlinsley,tkdodo" repository="git+https://github.com/tannerlinsley/react-query.git" DOWNLOADS LAST WEEK 2001331 
bash | @tanstack/react-query | REGISTERED latest="5.104.0" created="2022-07-19T13:33:05.988Z" provenance=present trusted_publisher=yes maintainers="tannerlinsley,alemtuzlak,kevinvandy" repository="git+https://github.com/TanStack/query.git" DOWNLOADS LAST WEEK 78603401 
bash | definitely-not-a-package-zq9x | NOT ON THE REGISTRY (HTTP 404) 
bash | x'; echo INJECTED; '$(echo INJECTED2) | NOT CHECKED: refused by the character check 
bash | ../../etc | NOT CHECKED: refused by the character check 
bash | @bad | NOT CHECKED: refused by the character check 
bash | a/b/c | NOT CHECKED: refused by the character check 
bash | @tanstack/react-query/extra | NOT CHECKED: refused by the character check 
bash | react codeshift | NOT CHECKED: refused by the character check 
(zsh: same twelve lines, byte-identical apart from the shell label)

### PyPI recipe, live (bash; zsh identical)
bash | requests | REGISTERED name="requests" version="2.34.2" first_upload="2011-02-14T08:49:42.641660Z" publisher_summary="Python HTTP for Humans." 
bash | reqeusts-pro | NOT ON THE REGISTRY (HTTP 404) 
bash | Requests | REGISTERED name="requests" version="2.34.2" first_upload="2011-02-14T08:49:42.641660Z" publisher_summary="Python HTTP for Humans." 
bash | definitely-not-a-package-zq9x | NOT ON THE REGISTRY (HTTP 404) 
bash | x'; echo INJECTED; ' | NOT CHECKED: refused by the character check 
bash | a b | NOT CHECKED: refused by the character check 
bash | ../x | NOT CHECKED: refused by the character check 

### crates.io / Maven Central recipe, live (bash; zsh identical)
bash | crate=tokio_advanced group= artifact=| | NOT ON THE REGISTRY (HTTP 404) 
bash | crate=tokio group= artifact=| | REGISTERED 
bash | crate=x'; echo INJ group= artifact=| | NOT CHECKED: refused by the character check 
bash | crate= group=com.google.guava artifact=guava | REGISTERED 
bash | crate= group=com.google.guava artifact=guava-nonexistent-zq9x | NOT ON THE REGISTRY (HTTP 404) 
bash | crate= group=com..google artifact=guava | NOT CHECKED: refused by the character check 
bash | crate= group=../etc artifact=guava | NOT CHECKED: refused by the character check 
bash | crate= group= artifact= | NOT CHECKED: refused by the character check 

### No network (HTTPS_PROXY=http://127.0.0.1:9), all three recipes
recipe-1: curl: (7) Failed to connect to 127.0.0.1 port 9 after 0 ms: Couldn't connect to server COULD NOT LOOK (answer: none (curl exit 7)) 
recipe-2: curl: (7) Failed to connect to 127.0.0.1 port 9 after 0 ms: Couldn't connect to server COULD NOT LOOK (answer: none (curl exit 7)) 
recipe-3: curl: (7) Failed to connect to 127.0.0.1 port 9 after 0 ms: Couldn't connect to server COULD NOT LOOK (answer: none (curl exit 7)) 
No temporary file left behind in the temp directory after the runs (checked).

### The stated heredoc limit, tested
Name written as three lines — `fs`, then `CTOC_NAME_END`, then `echo INJECTED-BY-NEWLINE` — DID run the third line as shell code (output began `INJECTED-BY-NEWLINE`, then `CTOC_NAME_END: command not found`, then the HELD BY NPM line for fs). This is exactly the limit item 6 of the character-check step states; the guard is the agent's own check refusing any line break before the name is written into the recipe. Every single-line hostile name above was refused.

## Session re-read with curl, 2026-09-30, 23:20 CEST: `fs` timestamps (as relayed by the dispatcher)
https://registry.npmjs.org/fs, raw: `time.created` "2014-06-02T02:18:51.732Z"; `time["0.0.1-security"]` "2016-08-23T17:56:58.976Z"; `time.modified` "2023-07-10T04:51:05.229Z". So the name's `created` date predates npm's placeholder version by about two years: a `created` date can be older than the package now behind the name.

## Session runs after the third return to Step 10 (2026-09-30, 23:26 CEST), agent fingerprint sha256:542d05fe8a342ae74dbe1c3727e82687aa5d36d6d58b097ca708f0e599253c39
Same harness as above (recipes extracted byte-for-byte; bash 3.2.57 and zsh 5.9 gave identical lines).
- npm: fs → HELD BY NPM latest="0.0.1-security" … maintainers="npm" … DOWNLOADS LAST WEEK 1745704; crossenv → HELD BY NPM latest="0.0.2-security"; react-query → REGISTERED latest="3.39.3" maintainers="tannerlinsley,tkdodo"; @tanstack/react-query → REGISTERED latest="5.104.0" provenance=present trusted_publisher=yes maintainers="tannerlinsley,alemtuzlak,kevinvandy"; definitely-not-a-package-zq9x → NOT ON THE REGISTRY (HTTP 404); the quote-and-substitution name → NOT CHECKED: refused by the character check.
- PyPI: requests → REGISTERED name="requests" version="2.34.2" first_upload="2011-02-14T08:49:42.641660Z" publisher_summary="Python HTTP for Humans."; reqeusts-pro → NOT ON THE REGISTRY (HTTP 404); the quoted name → refused.
- crates.io tokio → REGISTERED; Maven Central com.google.guava:guava → REGISTERED; the quoted crate → refused.
- Offline (HTTPS_PROXY to a closed port): all three → COULD NOT LOOK (answer: none (curl exit 7)).
- Termination signal (SIGTERM sent while curl was waiting), once under bash and once under zsh: the count of `tmp.*` files in the real temporary directory (`/var/folders/…/T`, where macOS mktemp writes) was 30 before and 30 after — the new `trap 'exit 1' HUP INT TERM` line removes the file in both shells, as the second security scan reported.

## Executor run after the trap change (2026-09-30, second return to Step 10), agent fingerprint sha256:542d05fe8a342ae74dbe1c3727e82687aa5d36d6d58b097ca708f0e599253c39
The npm and PyPI recipes, extracted byte for byte, pass `bash -n` and `zsh -n`. Run in bash 3.2.57 and zsh 5.9 with HTTPS_PROXY and https_proxy pointed at the closed port 127.0.0.1:9 and TMPDIR set to an empty directory per shell: each printed "COULD NOT LOOK (answer: none (curl exit 7))", and 0 files were left in the temporary directory in either shell. No signal was sent in this run; the termination-signal case rests on the session's 23:26 run above and on the second security review.
