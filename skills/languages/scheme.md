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
