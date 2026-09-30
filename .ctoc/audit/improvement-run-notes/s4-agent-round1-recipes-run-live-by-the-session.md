# Round 1, agent file: the three new registry recipes RUN live by the session (2026-09-30, 19:14–19:20 CEST)

Dispatch: none (the session ran these itself with Bash, after the executor applied the final change list; fingerprint of the edited file `sha256:c399cc8762a83fa1f9abd40364f0abc6252b11d5ace8b2cc91ddbc1b53a8a6b0`).
Method: the three ```bash blocks were extracted byte-for-byte from `agents/ai-quality/hallucination-detector.md` into scratch files; each was run with `bash` (and the npm one also with `zsh`) after replacing only the example name assignment on its first line. Outputs below are verbatim, one line per run, newlines joined with ` | `.

## npm recipe (bash)
email-validator-pro                           REGISTERED latest=1.0.1 created=2017-05-18T04:34:21.018Z | DOWNLOADS LAST WEEK 5
@isaacs/cliui                                 REGISTERED latest=9.0.0 created=2023-05-02T03:24:28.629Z | DOWNLOADS NOT READ (the downloads address for a scoped name was not checked)
fs                                            HELD BY NPM latest=0.0.1-security created=2014-06-02T02:18:51.732Z | DOWNLOADS LAST WEEK 1745704
@zzqqxx-nobody/zzqqxx-nothing-here-42         NOT ON THE REGISTRY (HTTP 404)      <- settles the open item: a missing SCOPED name answers 404 at the %2f address form
qwzxkvjmplnbrtdhgfcysqwzxkvjmplnbrtdhgfc      NOT ON THE REGISTRY (HTTP 404)
a/b                                           NOT CHECKED: refused by the character check
@a/b/c                                        NOT CHECKED: refused by the character check
..                                            NOT CHECKED: refused by the character check
x;echo INJECTED                               NOT CHECKED: refused by the character check
x$(echo INJECTED)                             NOT CHECKED: refused by the character check

## npm recipe (zsh)
email-validator-pro      REGISTERED latest=1.0.1 created=2017-05-18T04:34:21.018Z | DOWNLOADS LAST WEEK 5
@isaacs/cliui            REGISTERED latest=9.0.0 created=2023-05-02T03:24:28.629Z | DOWNLOADS NOT READ (the downloads address for a scoped name was not checked)
x;echo INJECTED          NOT CHECKED: refused by the character check

## PyPI recipe (bash)
email-validator-pro                      NOT ON THE REGISTRY (HTTP 404)
sklearn                                  HELD BY PYPI name=sklearn version=0.0.post12 summary="deprecated sklearn package, use scikit-learn instead"
requests                                 REGISTERED name=requests version=2.34.2 summary="Python HTTP for Humans."
Email_Validator.Pro                      NOT ON THE REGISTRY (HTTP 404)
qwzxkvjmplnbrtdhgfcysqwzxkvjmplnbrtdhgfc NOT ON THE REGISTRY (HTTP 404)
x;echo INJECTED                          NOT CHECKED: refused by the character check
-flag                                    NOT CHECKED: refused by the character check

## crates.io / Maven Central recipe (bash)
crate tokio_advanced           NOT ON THE REGISTRY (HTTP 404)
crate serde                    REGISTERED
crate tokio                    REGISTERED
crate a/b                      NOT CHECKED: refused by the character check
crate ..                       NOT CHECKED: refused by the character check
crate x;echo INJECTED          NOT CHECKED: refused by the character check
maven org.apache.commons:commons-security      NOT ON THE REGISTRY (HTTP 404)
maven org.apache.commons:commons-lang3         REGISTERED
maven org.apache..commons:commons-lang3        NOT CHECKED: refused by the character check
maven org/apache/commons:commons-lang3         NOT CHECKED: refused by the character check
maven org.apache.commons;echo INJECTED:x       NOT CHECKED: refused by the character check
maven org.apache.commons:(empty artifact)      NOT CHECKED: refused by the character check

## No network (HTTPS_PROXY pointed at a closed local port), bash
npm recipe:  curl: (7) Failed to connect to 127.0.0.1 port 9 after 0 ms: Couldn't connect to server | COULD NOT LOOK (answer: none (curl exit 7))
PyPI recipe: curl: (7) Failed to connect to 127.0.0.1 port 9 after 0 ms: Couldn't connect to server | COULD NOT LOOK (answer: none (curl exit 7))

## Not exercised
A single quote inside the name (the documented limit: it ends the quoting before any check runs — not tested, by design); a 200 answer with no latest version; an answer body cut short; rate limiting (429); the `date -u` command; Windows shells.
A first Maven run in this session showed "refused" for valid names — that was the session's own test harness (zsh does not word-split an unquoted variable), not the recipe; the rerun above used explicit values.

## Tool versions used for every run in this note (recorded 2026-09-30 21:06 CEST)
node v24.14.1; Python 3.9.6; GNU bash, version 3.2.57(1)-release (arm64-apple-darwin25); zsh 5.9 (arm64-apple-darwin25.0); curl 8.7.1; macOS 26.6.1; locale LANG=C.UTF-8
