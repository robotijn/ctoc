# Clojure CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude catches generic `Exception` — catch specific exceptions
- Claude shadows `clojure.core` functions — use different names
- Claude creates large anonymous functions — use `defn`
- Claude forgets lazy sequence realization — use `doall` when needed

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `clojure 1.12+` | Latest features | Older versions |
| `deps.edn` | Official dep management | Leiningen (legacy) |
| `clj-kondo` | Static analysis | No linting |
| `cljfmt` | Formatting | Manual style |
| `kaocha` | Test runner | Basic test runner |

## Patterns Claude Should Use
```clojure
;; Custom exceptions with context
(throw (ex-info "User not found" {:user-id id :type :not-found}))

;; Catch specific exceptions
(try
  (process-data data)
  (catch java.io.IOException e
    (log/error e "IO error"))
  (catch Exception e
    (throw (ex-info "Processing failed" {:data data} e))))

;; Don't shadow core functions
(let [user-name (:name user)]  ; NOT: (let [name (:name user)]
  (str "Hello, " user-name))

;; Force lazy seq when side effects needed
(doall (map process! items))

;; Type hints for reflection-free hot paths
(defn fast-add ^long [^long a ^long b]
  (+ a b))
```

## Anti-Patterns Claude Generates
- Shadowing `clojure.core` (`name`, `type`, `count`) — use prefixed names
- Generic `(catch Exception e ...)` — catch specific types
- Large anonymous `(fn [...] ...)` — use `defn` for clarity
- Missing `doall` on lazy seqs with side effects — force evaluation
- Reflection in hot paths — add type hints

## Version Gotchas
- **1.12+**: Improved Java interop, method values
- **Threading**: Use `->` and `->>` correctly (first vs last position)
- **Lazy seqs**: Can cause resource leaks if not realized
- **Pre/post conditions**: Use `:pre`/`:post` for function contracts
- **With async**: Use `core.async` channels, not callbacks

## Concurrency Footguns
Clojure gives four coordination primitives; Claude reaches for the wrong one and
puts side effects where they get replayed.

```clojure
;; FOOTGUN 1: side effects inside a dosync (STM) transaction.
;; A transaction body can RETRY any number of times on ref contention.
;; Anything non-idempotent inside it (I/O, logging, sending an email) runs
;; each retry — dupes and corruption.
(dosync
  (send-email! user)              ; WRONG: replayed on every retry
  (alter balance - amount))
;; SAFE: keep only ref mutation in dosync; defer effects to commit via agents.
(dosync (alter balance - amount))
(send-off notifier notify! user)  ; agent actions are held until commit

;; FOOTGUN 2: a BLOCKING call inside a core.async go block. go blocks share a
;; small fixed thread pool; a blocking IO call (or <!! / >!!) starves every
;; other go block on that pool → app-wide stall.
(go (let [row (jdbc/query db q)] ...))   ; WRONG: blocking JDBC inside go
;; SAFE: use thread (real thread) for blocking work, or an async client.
(thread (let [row (jdbc/query db q)] (>!! out row)))

;; FOOTGUN 3: holding the head of a lazy seq realizes the WHOLE sequence into
;; memory → OOM on an infinite/large source. Don't bind the head then walk it.
```
- Choose the primitive: `atom` (uncoordinated single value, `swap!`), `ref` +
  `dosync` (coordinated multi-value STM), `agent` (async, serialized, effect-safe),
  `volatile!` (fast, no atomicity). `swap!`'s function must be **pure** — it too
  retries on CAS failure.
- Source: clojure.org/reference/refs, clojure.org/reference/atoms,
  github.com/clojure/core.async. See References.

## Error Handling Idioms
```clojure
;; Carry structured context — ex-info/ex-data beats a bare throw of a string.
(throw (ex-info "User not found" {:type :not-found :user-id id}))
(try
  (fetch user)
  (catch clojure.lang.ExceptionInfo e
    (when (= :not-found (:type (ex-data e))) (default-user))))

;; FOOTGUN: an exception thrown inside a future is SWALLOWED until you deref it.
(let [f (future (risky))]      ; throws — but silently, right now
  ... )                        ; the throw only surfaces at @f / (deref f)
;; So always deref futures you care about, and wrap deref in try.
```
- Prefer specific catches over `(catch Exception e)`; use `try`/`finally` for
  cleanup; never leave an empty catch. `Throwable` catches JVM `Error`s (OOM,
  stack-overflow) too — almost never what you want.
- Source: clojuredocs.org/clojure.core/ex-info. See References.

## Security and Dependency Gotchas
- **`read-string` / `eval` on untrusted input = arbitrary code execution.**
  `clojure.core/read-string` honors reader macros and can be made to invoke
  code; `eval` on attacker data is direct code injection (**CWE-94 "Code
  Injection"** — cwe.mitre.org/data/definitions/94.html). Use
  `clojure.edn/read-string`, which reads **data only** (no code eval, no
  arbitrary tagged literals unless you opt in via `:readers`).
```clojure
(require '[clojure.edn :as edn])
(edn/read-string untrusted)                 ; SAFE: data only
;; (read-string untrusted)                  ; DANGER: reader can execute
;; (eval (read-string untrusted))           ; DANGER: direct code injection
```
- **JVM interop drags in deserialization (CWE-502).** Any Java
  `ObjectInputStream.readObject()` reached through interop on untrusted bytes is
  **CWE-502 "Deserialization of Untrusted Data"**
  (cwe.mitre.org/data/definitions/502.html) — a crafted gadget chain runs code on
  read. Do not deserialize untrusted Java objects; use EDN/JSON/Transit for data
  interchange.
- **Dependencies:** pin with `deps.edn` (git SHAs / exact `:mvn/version`),
  inspect the tree with `clj -Stree`, and audit with `clojure -M:nvd` (NVD
  dependency-check) or `clj-holmes`.
- Source: cwe.mitre.org (CWE-94, CWE-502),
  clojure.org/guides/deps_and_cli. See References.

## Testing Conventions
```clojure
(require '[clojure.test :refer [deftest is testing]])
(require '[clojure.test.check.clojure-test :refer [defspec]])
(require '[clojure.test.check.properties :as prop])
(require '[clojure.test.check.generators :as gen])

(deftest addition (is (= 4 (+ 2 2))))

;; Property test with test.check — assert an invariant over generated input.
(defspec reverse-twice-is-identity 100
  (prop/for-all [v (gen/vector gen/int)]
    (= v (reverse (reverse v)))))
```
- `clojure.test` is built in; `test.check` adds generative/property testing;
  `kaocha` is the current polyglot runner (watch, plugins, coverage via
  `cloverage`). Test error paths with `(is (thrown-with-msg? ...))`, not just
  happy paths.
- Source: github.com/clojure/test.check, github.com/lambdaisland/kaocha. See References.

## Performance Traps
- **Reflection**: set `(set! *warn-on-reflection* true)` at the top of hot
  namespaces; every reported reflective call is a runtime `Method.invoke` — add a
  `^type` hint to kill it.
- **Boxed math**: arithmetic on boxed `Long`/`Double` allocates; use primitive
  type hints / `unchecked-*` ops in tight numeric loops.
- **Transients** (`transient`/`conj!`/`persistent!`) for bulk building of a
  collection avoid intermediate persistent copies — big win, but never share a
  transient across threads.
- **Lazy realization cost**: `map`/`filter` are lazy; a `count`/`reduce` forces
  the whole chain. Use `into`/`reduce`/transducers to fuse passes.

## Version-Specific Gotchas (dated, sourced)
- **Clojure 1.12.5** is the current stable release; get coordinates and the CLI
  from clojure.org. Prefer **`deps.edn` + the official `clj`/`tools.deps`** CLI
  over Leiningen for new projects. [clojure.org/releases/downloads, retrieved
  2026-07-10]
- **1.13** is in **alpha** (e.g. `1.13.0-alpha3`) — not for production; track it
  on the release tags but pin 1.12.x. [github.com/clojure/clojure tags, retrieved
  2026-07-10]
- **1.12** added first-class Java method values and `add-libs` for REPL-time deps
  loading. [clojure.org/news, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Clojure downloads / current stable: https://clojure.org/releases/downloads
- deps.edn and CLI guide: https://clojure.org/guides/deps_and_cli
- Refs & STM (dosync): https://clojure.org/reference/refs
- core.async: https://github.com/clojure/core.async
- test.check: https://github.com/clojure/test.check
- kaocha runner: https://github.com/lambdaisland/kaocha
- CWE-94 (Code Injection): https://cwe.mitre.org/data/definitions/94.html
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
