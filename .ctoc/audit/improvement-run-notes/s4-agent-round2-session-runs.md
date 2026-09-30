# Round 2, agent file: two of the research note's claims tested by RUNNING (session, 2026-09-30, 19:35 CEST)

## Locale and the bracket ranges (research row A2)
Session locale: LANG=C.UTF-8, LC_ALL unset. Command: for each shell and locale, `case "$n" in (*[!A-Za-z0-9._-]*) refused | (*) ACCEPTED` over the names `abc`, `é`, `ab é`, `Ω`.
bash LC_ALL=(unset) abc=ACCEPTED é=refused "ab é"=refused Ω=refused
bash LC_ALL=C       abc=ACCEPTED é=refused "ab é"=refused Ω=refused
zsh  LC_ALL=(unset) abc=ACCEPTED é=refused "ab é"=refused Ω=refused
zsh  LC_ALL=C       abc=ACCEPTED é=refused "ab é"=refused Ω=refused
Observed: on this machine the ranges refuse non-ASCII letters in both locales. This does not contradict the specification's "unspecified" — it shows the behaviour on one platform. Other locales (for example a Latin-1 or Turkish collation) were not tested.

## The three regular-expression patterns (research rows A15–A17), run in Node
react-query (current pattern /(from|require\()\s*['"]react-query['"]/):
    "import x from 'react-query';" -> true
    "const q=require('react-query')" -> true
    "import('react-query')" -> false          <- missed, as the note says
    "import 'react-query'" -> false            <- missed, as the note says
    "from 'react-query/devtools'" -> false    <- missed, as the note says
formatISO (current pattern /\bmoment(\([^)]*\))?\.formatISO\(/):
    "moment(d).formatISO(" -> true
    "moment(new Date()).formatISO(" -> false   <- missed, as the note says
    "moment.utc(x).formatISO(" -> false        <- missed, as the note says
    "dateFns.formatISO(" -> false              (correctly not matched)
axios body (current pattern /axios\.get\(.*body:/):
    "axios.get(u,{body:d})" -> true
    "axios.get(u,{\n body: d\n})" -> false     <- missed, as the note says
    "axios.get(u,{somebody:1})" -> true        <- false match, as the note says
axios body (the note's proposed /axios\.get\([^)]*\bbody\s*:/):
    "axios.get(u,{body:d})" -> true
    "axios.get(u,{\n body: d\n})" -> true
    "axios.get(u,{somebody:1})" -> false
The note's proposed react-query and formatISO replacements were NOT run here; the critic should propose final patterns and the session will run them before they are applied.

# Round 2: the critic's proposed changes RUN before applying (session, 2026-09-30, 19:43 CEST)

## The three final patterns (changes 4a–4c), run in Node against the critic's must/must-not lists
react-query /(?:\bfrom|\brequire\s*\(|\bimport\s*\(?)\s*['"]react-query(?:\/[^'"]*)?['"]/ — all 6 must-match true, all 3 must-not-match false: ALL OK
formatISO   /\bmoment\b[^;\n]*\.formatISO\(/ — all 4 must-match true, all 4 must-not-match false: ALL OK
axios       /axios\.get\([^)]*\bbody['"]?\s*:/ — all 3 must-match true, all 3 must-not-match false: ALL OK

## The FastAPI example (change 14), parsed with python3 ast
before: SyntaxError: unexpected EOF while parsing
after:  parses

## The three recipes with changes 3a–3d applied to a scratch copy, run live (bash AND zsh for npm; bash for the others)
npm:   email-validator-pro REGISTERED latest=1.0.1 created=2017-05-18… | DOWNLOADS LAST WEEK 5
       @isaacs/cliui REGISTERED latest=9.0.0 created=2023-05-02… | DOWNLOADS NOT READ (scoped)
       fs HELD BY NPM latest=0.0.1-security … | DOWNLOADS LAST WEEK 1745704
       @zzqqxx-nobody/zzqqxx-nothing-here-42 NOT ON THE REGISTRY (HTTP 404)
       abc REGISTERED latest=0.6.1 created=2012-07-19… | DOWNLOADS LAST WEEK 10676   (exercises the `: ;;` item)
       é / "ab é" / "x;echo INJECTED" / @a/b/c / a/b → NOT CHECKED: refused by the character check
       (identical output under zsh)
PyPI:  requests REGISTERED 2.34.2; sklearn HELD BY PYPI; requests- and requests_ → NOT CHECKED: not a valid distribution name under the packaging specification; Friendly.Bard → NOT ON THE REGISTRY (HTTP 404); é and "x;echo INJECTED" → refused by the character check
crates/Maven: tokio_advanced 404; serde REGISTERED; é and "x;echo INJECTED" refused; org.apache.commons:commons-lang3 REGISTERED; org.apache.commons:commons-security 404; org.apache..commons refused
Not exercised: a single quote inside the name (documented limit); a locale other than C.UTF-8 and C.

## Tool versions used for every run in this note (recorded 2026-09-30 21:06 CEST)
node v24.14.1; Python 3.9.6; GNU bash, version 3.2.57(1)-release (arm64-apple-darwin25); zsh 5.9 (arm64-apple-darwin25.0); curl 8.7.1; macOS 26.6.1; locale LANG=C.UTF-8
