**Verdict:** I checked 24 claims. 19 are validated, 3 are wrong as written and 2 cannot be sourced. The three to fix:

- **Line 141, `{ throwOnError: true }` "Usually not a real option":** this is a real TanStack Query v5 option, renamed from `useErrorBoundary`. As written, the row would flag correct TanStack code.
- **Lines 27–28, bcrypt "needs a compiler":** the bcrypt README says pre-built binaries ship "on a best-effort basis", so a compiler is only needed when no pre-built binary fits.
- **Lines 92–93, dynamic `import()` "in every case":** the Node.js documentation lists exceptions.

I used all 30 of the 30 allowed fetches and searches. No file was changed, and no fetched page contained text aimed at a reviewer or agent.

## Fetches and searches, in order

| # | Address | Result |
|---|---|---|
| 1 | raw.githubusercontent.com/kelektiv/node.bcrypt.js/master/README.md | read |
| 2 | raw.githubusercontent.com/dcodeIO/bcrypt.js/main/README.md | read |
| 3 | axios-http.com/docs/req_config | 301 redirect to axios.rest/pages/advanced/request-config |
| 4 | axios.rest/pages/advanced/request-config | read |
| 5 | raw.githubusercontent.com/axios/axios/v1.x/README.md | read |
| 6 | date-fns.org/docs/formatISO | only the page title came back (the page is built by JavaScript) |
| 7 | momentjs.com/docs/ | cut off before the `toISOString` entry |
| 8 | raw.githubusercontent.com/date-fns/date-fns/main/src/formatISO/index.ts | 404 |
| 9 | raw.githubusercontent.com/moment/moment/develop/src/lib/moment/prototype.js | read |
| 10 | nodejs.org/api/fs.html (documents v26.10.0) | cut off before `readFileSync` |
| 11 | tanstack.com/query/latest/docs/framework/react/reference/useQuery | no option list on the page |
| 12 | raw.githubusercontent.com/TanStack/query/main/docs/framework/react/reference/useQuery.md | 404 |
| 13 | unpkg.com/date-fns/formatISO.js (published package, version not shown) | read |
| 14 | fastapi.tiangolo.com/reference/fastapi/ | read |
| 15 | react.dev/reference/react/hooks | read |
| 16 | nodejs.org/api/errors.html (v26.10.0) | cut off; only the table of contents was read |
| 17 | nodejs.org/api/esm.html | read |
| 18 | nodejs.org/api/globals.html | read |
| 19 | lodash.com/docs/4.17.15 | read |
| 20 | developer.mozilla.org/.../Array/flatMap | read |
| 21 | registry.npmjs.org/qwzxkvjmplnbrtdhgfcysqwzxkvjmplnbrtdhgfc | HTTP 404; the fetch tool does not return the body of a 404 |
| 22 | raw.githubusercontent.com/npm/registry/main/docs/REGISTRY-API.md | says nothing about scoped-name encoding or not-found responses |
| 23 | raw.githubusercontent.com/tc39/proposals/main/finished-proposals.md | read |
| 24 | raw.githubusercontent.com/nodejs/node/main/lib/fs.js | read; the whole `readFileSync` function was visible |
| 25 | tanstack.com/query/v5/docs/framework/react/reference/useQuery | call signatures only, no option list |
| 26 | nodejs.org/api/modules.html | read |
| 27 | Search: "TanStack Query v5 useQuery throwOnError option" (tanstack.com, github.com) | results |
| 28 | Search: npm registry scoped package URL encoding (docs.npmjs.com, github.com, npmjs.com) | only third-party bug reports and the npm scope pages (titles only) |
| 29 | tanstack.com/query/v5/docs/react/guides/migrating-to-v5 | read |
| 30 | registry.npmjs.org/@isaacs%2fcliui | HTTP 200 |

The quotes below were pulled out by the fetch tool's own model, not copied byte for byte by me. That model's page said nothing about which edition introduced `flatMap`, but it added "(when flatMap() was actually introduced)" on its own. The search engine's summary for fetch 27 was not used as evidence. I relied only on the page titles and fetch 29.

## Verdicts

| # | Claim (line) | Verdict | Source | Quote | Recommended wording or action |
|---|---|---|---|---|---|
| 1a | bcrypt exposes `hashSync` (27) | VALIDATED | fetch 1 | "`const hash = bcrypt.hashSync(myPlaintextPassword, saltRounds);`" | keep |
| 1b | bcrypt "needs a compiler" (27–28) | **REFUTED** (overstated) | fetch 1 | "Pre-built binaries for various NodeJS versions are made available on a best-effort basis." | "bcrypt is a native addon; its README ships pre-built binaries only on a best-effort basis, so where none matches the platform and Node version the install needs a native build toolchain. Use bcryptjs where that build is not available." |
| 2 | bcryptjs is the alternative (28, 126) | VALIDATED | fetch 2 | "Optimized bcrypt in JavaScript with zero dependencies"; "Compatible to the C++ bcrypt binding on Node.js"; lists `bcrypt.hashSync(password, salt?)` | keep. The README also says it is about 30% slower. |
| 3a | axios GET has no `body`; use `params` (43, 111) | VALIDATED | fetches 4 and 5 agree | `data`: "Only applicable for request methods `PUT`, `POST`, `DELETE`, and `PATCH`"; `params`: "the URL parameters to be sent with the request"; no `body` key | keep |
| 3b | `AxiosRequestConfig` has no `body` field; the payload goes in `data` (102) | VALIDATED against the documented config | fetches 4 and 5 | "The `data` is the data to be sent as the request body" | keep. The type file itself (`index.d.ts`) was not fetched. |
| 3c | `axios.post`: use `data`, not `body` (128) | VALIDATED | fetch 5 | "`axios.post(url[, data[, config]])`" | keep |
| 4a | `formatISO` is a date-fns function (46, 110, 133, 168) | VALIDATED | fetch 13 | "@name formatISO"; "export function formatISO(date, options)" | keep |
| 4b | moment has no `formatISO` (same lines) | VALIDATED for moment instances only | fetch 9 | no `formatISO` is assigned on the prototype | keep. The static `moment.formatISO(...)` on line 46 was not checked. |
| 4c | `moment().toISOString()` exists (133, 169) | VALIDATED from source | fetch 9 | "`proto.toISOString = toISOString;`" | keep. The docs page was cut off, so this rests on the source code. |
| 5a | `fs.readFileSync` has no `throwOnError` option (49) | VALIDATED from source | fetch 24 | the function's own comment lists `encoding?: string \| null; flag?: string;` and "throwOnError" appears nowhere in `lib/fs.js` | keep. The main-branch code also reads `options.buffer`; the rendered docs page was never reached. |
| 5b | `{ throwOnError: true }` "Usually not a real option" (141) | **REFUTED** as written (it has no scope) | fetch 29, plus the search 27 title "Typings of `useQuery({ throwOnError:true }).data`…" | "The `useErrorBoundary` option has been renamed to `throwOnError`" | "`{ throwOnError: true }` on a Node `fs` call: not an `fs` option. It *is* a real TanStack Query v5 option (renamed from `useErrorBoundary`), so check the library it is passed to before flagging." |
| 6 | FastAPI has no `auto_validate` (58) | VALIDATED | fetch 14 | neither the `FastAPI(...)` constructor nor `get(...)` lists it, and "auto_validate" appears nowhere on the page | keep. Line 58 is `@app.get`, not the constructor; I checked both. |
| 7a | `useAutoFetch` is not a standard hook (61, 112) | VALIDATED | fetch 15 | not in the built-in hooks list | keep. A project can still define its own hook with that name, so the line-112 pattern should prompt a check of the import, not an automatic flag. |
| 7b | `React.useAutoEffect()` does not exist (136) | VALIDATED | fetch 15 | not on the page | keep |
| 8a | the error code `ERR_REQUIRE_ESM` exists (89) | VALIDATED (name only) | fetch 16 | table of contents: "[ERR_REQUIRE_ESM](errors.html#err_require_esm)" | keep. The condition "for any ESM-only package" was not read. |
| 8b | `require()` of ECMAScript modules unflagged at 20.19 / 22.12; `ERR_REQUIRE_ASYNC_MODULE` on top-level `await` (89–91) | VALIDATED | fetch 26 | "v23.0.0, v22.12.0, v20.19.0: This feature is no longer behind the `--experimental-require-module` CLI flag"; "If the module being `require()`'d contains top-level `await`… `ERR_REQUIRE_ASYNC_MODULE` will be thrown." | keep |
| 8c | dynamic `import()` loads both CommonJS and ECMAScript modules (92) | VALIDATED | fetch 17 | "It is supported in both CommonJS and ES modules, and can be used to load both CommonJS and ES modules." | keep |
| 8d | "in every case" (92–93) | **REFUTED** | fetch 17 | "The `with { type: 'json' }` syntax is mandatory"; "Addons are not currently supported with ES module imports." | "Dynamic `import()` can load both CommonJS and ECMAScript modules (Node.js documentation), or read the package's own `exports`/`types` entry instead of executing it." Drop "in every case". |
| 9 | global `fetch` in modern Node (127) | VALIDATED | fetch 18 | "Added in: v17.5.0, v16.15.0"; "v18.0.0: No longer behind `--experimental-fetch` CLI flag"; "v21.0.0: No longer experimental." | Optional added precision: "`node-fetch` (Node 18+, where global `fetch` is unflagged; not experimental since 21)". |
| 10 | lodash has `cloneDeep`, not `deepClone` (134) | VALIDATED | fetch 19 | "`_.cloneDeep(value)` Recursively clone `value`."; no `deepClone` on the page | keep |
| 11 | `flatMap` built in since ECMAScript 2019 (135) | VALIDATED (two sources agree) | fetches 20 and 23 | MDN: "The `flatMap()` method of `Array` instances returns…"; TC39: "`Array.prototype.{flat,flatMap}` … 2019" | Optional: write `Array.prototype.flatMap`. The 2019 specification text itself was not fetched. |
| 12 | `{ autoValidate: true }` "Made up" (142) | **UNSOURCEABLE** | none: the line names no library, and "not a real option anywhere" cannot be sourced | — | strip the specificity: "`{ autoValidate: true }` — check the receiving library's option list", or delete the row. |
| 13a | registry response for a name never registered | VALIDATED (observed) | fetch 21 | HTTP 404 Not Found | The body was not retrieved, and the registry API document (fetch 22) describes no not-found response. |
| 13b | how a scoped name is encoded in the registry address | **UNSOURCEABLE** in npm documentation | fetches 22, 28, 30 | no npm document gives the rule; observed: `/@isaacs%2fcliui` returned 200 with `"name": "@isaacs/cliui"` | The file makes no such claim today. If one is added, cite it as observed on 2026-09-30, not as documented. |

## Counts

- Validated: 19
- Refuted: 3 (1b, 5b, 8d)
- Unsourceable: 2 (12, 13b)
- Stale: 0. Item 5b may count as stale rather than simply wrong, because the rename landed in TanStack Query v5; I did not check that release's date.

## Not checked

- **Node.js documentation pages:**
  - the rendered `fs.readFileSync` options list: the page was cut off, so 5a rests on the source code;
  - the description and conditions of `ERR_REQUIRE_ESM`, including whether older Node throws it "for any ESM-only package": that page was cut off too.
- **The npm registry:**
  - the body of the 404 response;
  - whether the unencoded `@scope/name` address works;
  - whether `npm view` exits non-zero on a 404, which line 69 depends on.
- **moment, date-fns and axios sources:**
  - moment's static namespace (line 46's `moment.formatISO`);
  - whether `toISOString()` and date-fns `formatISO` produce the same string (their time-zone offset handling);
  - axios `index.d.ts`, the type behind 3b.
- **TanStack Query:** the `throwOnError` entry on the `useQuery` reference page itself. Both fetches of that page returned signatures only, so 5b rests on the migration guide.
- **Anything outside the 13 items**, including line 25 (react-query renamed at v4) and lines 71–74 (PyPI 200/404).

Outside my remit, but seen while reading: line 42 labels the axios `body` misuse "Wrong method signature", when it is a wrong configuration key. Line 61 is JavaScript with a `#` comment inside a Python code block.

**Risk:** 5b is the finding that matters. As written, line 141 tells the detector to flag correct TanStack Query code. My sources for it are TanStack's migration guide plus a discussion title, not the option's own reference entry.

Sources:
- [bcrypt README](https://raw.githubusercontent.com/kelektiv/node.bcrypt.js/master/README.md)
- [bcryptjs README](https://raw.githubusercontent.com/dcodeIO/bcrypt.js/main/README.md)
- [axios request config](https://axios.rest/pages/advanced/request-config)
- [axios README](https://raw.githubusercontent.com/axios/axios/v1.x/README.md)
- [date-fns formatISO.js](https://unpkg.com/date-fns/formatISO.js)
- [moment prototype.js](https://raw.githubusercontent.com/moment/moment/develop/src/lib/moment/prototype.js)
- [Node lib/fs.js](https://raw.githubusercontent.com/nodejs/node/main/lib/fs.js)
- [TanStack Query migrating to v5](https://tanstack.com/query/v5/docs/react/guides/migrating-to-v5)
- [TanStack Query discussion #6805](https://github.com/TanStack/query/discussions/6805)
- [FastAPI class reference](https://fastapi.tiangolo.com/reference/fastapi/)
- [React built-in hooks](https://react.dev/reference/react/hooks)
- [Node errors](https://nodejs.org/api/errors.html)
- [Node modules](https://nodejs.org/api/modules.html)
- [Node ECMAScript modules](https://nodejs.org/api/esm.html)
- [Node globals](https://nodejs.org/api/globals.html)
- [lodash 4.17.15 docs](https://lodash.com/docs/4.17.15)
- [MDN flatMap](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/flatMap)
- [TC39 finished proposals](https://raw.githubusercontent.com/tc39/proposals/main/finished-proposals.md)
- [npm registry API document](https://raw.githubusercontent.com/npm/registry/main/docs/REGISTRY-API.md)
- [npm scope docs (title only)](https://docs.npmjs.com/cli/v11/using-npm/scope/)
- [registry probe, random name](https://registry.npmjs.org/qwzxkvjmplnbrtdhgfcysqwzxkvjmplnbrtdhgfc)
- [registry probe, scoped name](https://registry.npmjs.org/@isaacs%2fcliui)

File validated: `/Users/account/Code/ctoc/agents/ai-quality/hallucination-detector.md`