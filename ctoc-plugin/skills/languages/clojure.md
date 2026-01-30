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
