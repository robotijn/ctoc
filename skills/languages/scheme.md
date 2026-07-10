# Scheme CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude uses non-tail recursion — causes stack overflow
- Claude overuses `set!` — prefer functional style
- Claude uses unhygienic macros — use `syntax-rules`
- Claude uses `eval` for metaprogramming — use macros

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `racket` | Full-featured ecosystem | Basic Schemes |
| `chez scheme` | High performance | Slow interpreters |
| `guile` | GNU extension language | Non-standard |
| `chicken` | Compiles to C | Interpreted only |
| `rackunit` | Testing (Racket) | Ad-hoc tests |

## Patterns Claude Should Use
```scheme
#lang racket

;; Tail-recursive with accumulator
(define (sum lst)
  (let loop ([lst lst] [acc 0])
    (cond
      [(null? lst) acc]
      [else (loop (cdr lst) (+ acc (car lst)))])))

;; Hygienic macro with syntax-rules
(define-syntax when
  (syntax-rules ()
    [(when test body ...)
     (if test (begin body ...) (void))]))

;; Proper error handling
(define (safe-divide a b)
  (if (zero? b)
      (error 'safe-divide "division by zero")
      (/ a b)))

;; Use higher-order functions, not set!
(define (process-list lst)
  (map (lambda (x) (* x 2))
       (filter positive? lst)))
```

## Anti-Patterns Claude Generates
- Non-tail recursion — use named `let` with accumulator
- Overusing `set!` — prefer immutable bindings
- Unhygienic macros — use `syntax-rules` or `syntax-parse`
- `eval` for metaprogramming — use proper macros
- Global mutable state — use parameters or pass state

## Version Gotchas
- **R7RS**: Use for portability across implementations
- **Racket**: Full language with contracts, types
- **Tail calls**: Guaranteed by standard, use them
- **Continuations**: Powerful but confusing, document well
- **With macros**: Use `syntax-parse` in Racket for errors

## Concurrency / Continuations Footguns
Scheme's `call/cc` captures the **entire** rest of the computation as a
first-class value that can be invoked more than once — the sharpest footgun in
the language.

```scheme
;; FOOTGUN 1: a captured continuation can RE-ENTER code you thought ran once.
;; Stored and later invoked, it resumes from the capture point again — loops,
;; duplicated effects, "impossible" states.
(define k #f)
(+ 1 (call/cc (lambda (c) (set! k c) 1)))   ; => 2, and k now re-runs the (+ 1 _)
;; (k 10)  ; re-enters → evaluates (+ 1 10) => 11, escaping wherever you were

;; FOOTGUN 2: dynamic-wind before/after thunks fire on EVERY continuation
;; crossing, not just normal entry/exit. Escaping via a stored continuation, or
;; re-entering one, re-runs after/before — so resource setup/teardown coded with
;; dynamic-wind can run multiple times or in surprising order.
(dynamic-wind
  (lambda () (open!))     ; runs again if control re-enters
  (lambda () (work))
  (lambda () (close!)))   ; runs on escape too — may close twice
```
- Prefer `call-with-current-continuation` for **escape only** (early return /
  error unwind); reach for full re-entrant continuations rarely and document
  them. Proper tail calls are **mandated by the standard** (R7RS §3.5) — an
  accumulator-`let` loop runs in constant space; a non-tail recursion does not.
- Source: R7RS-small §3.5 / §6.10 (small.r7rs.org). See References.

## Error Handling Idioms
```scheme
;; R7RS guard: handle a raised condition, choosing which clause continues.
(guard (e ((symbol? e) (list 'caught e))
          (else (list 'other e)))
  (raise 'boom))                       ; => (caught boom)

;; error creates+raises an error object; error-object-message / -irritants read it.
(guard (e (#t (error-object-message e)))
  (error "bad input" 'x 42))           ; => "bad input"
```
- Use `guard` + `raise`/`error` (R7RS). `raise` is **non-continuable** — control
  will not return to the `raise` site even if a handler "returns"; use
  `raise-continuable` with `with-exception-handler` when the handler is meant to
  resume. Do not swallow a condition by returning a bogus value in `else`.
- Source: R7RS-small §6.11 (small.r7rs.org). See References.

## Security and Dependency Gotchas
- **`eval` on untrusted forms = arbitrary code execution** — this is **CWE-95
  "Improper Neutralization of Directives in Dynamically Evaluated Code (Eval
  Injection)"** (cwe.mitre.org/data/definitions/95.html). Never `eval` data that
  crossed a trust boundary; use `syntax-rules` macros for metaprogramming instead.
```scheme
;; DANGER: eval of parsed user input runs whatever they send.
;; (eval (read (open-input-string user-string)) (interaction-environment))
;; SAFE: parse to a restricted data AST yourself and interpret it explicitly.
```
- **`read` from an untrusted port** can construct large/adversarial datums
  (deeply nested lists, huge literals) → resource exhaustion; validate size/shape
  before processing, and never feed `read` output to `eval`.
- **Portability / packages diverge by implementation.** Racket uses `raco pkg`
  and the package catalog; Guile uses Guix / its module path; Chez uses its own
  library path. There is no single Scheme package manager — pin per
  implementation and name the impl for any non-R7RS API.
- Source: cwe.mitre.org (CWE-95); racket-lang.org (raco pkg). See References.

## Testing Conventions
```scheme
;; SRFI-64 — the portable Scheme test API.
(import (srfi 64))
(test-begin "arith")
(test-equal 4 (+ 2 2))
(test-error (error "boom"))            ; assert the error path, not just happy
(test-end "arith")
```
- **SRFI-64** (`(srfi 64)`) is the portable test framework across conformant
  implementations. Implementation runners: Racket `raco test`, Chez via its
  test scripts, Guile with SRFI-64 loaded. Assert error paths with `test-error`.
- Source: srfi.schemers.org/srfi-64, racket-lang.org (raco test). See References.

## Performance Traps
- **Non-tail recursion grows the stack** — a recursion whose call is *not* in
  tail position keeps a frame per element; on a long list it overflows. Rewrite
  with a named-`let` accumulator (tail position) for constant space.
- **List vs vector access**: `list-ref` / traversal is O(n); use a `vector`
  (`vector-ref` O(1)) for random access or hot indexing.
- **Interpreted vs compiled**: Chez / compiled Racket (`raco make`) are orders
  faster than a bare interpreter loop — benchmark on your target impl, and don't
  assume portable timing.

## Version-Specific Gotchas (dated, sourced)
- **R7RS-small is the portability anchor**; write to it and name the
  implementation for any impl-specific API. The small-language report and
  archive live at small.r7rs.org. [small.r7rs.org, retrieved 2026-07-10]
- **Racket 9.2** is the current release (the CS runtime is the default);
  R6RS/R7RS libraries load via `#lang r7rs` / the `r6rs` collection.
  [github.com/racket/racket releases, retrieved 2026-07-10]
- **R6RS vs R7RS differ** (library syntax, exceptions, Unicode); code targeting
  one is not automatically portable to the other — pick one and state it.
  [small.r7rs.org, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- R7RS-small report & archive: https://small.r7rs.org/
- Racket releases (current 9.2): https://github.com/racket/racket/releases
- Racket packages (raco pkg): https://racket-lang.org/
- SRFI-64 (test framework): https://srfi.schemers.org/srfi-64/
- CWE-95 (Eval Injection): https://cwe.mitre.org/data/definitions/95.html
