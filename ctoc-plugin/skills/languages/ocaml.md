# OCaml CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude writes partial pattern matches — handle all cases
- Claude uses `ref` freely — prefer immutable values
- Claude uses exceptions for control flow — use `Result` type
- Claude forgets `.mli` interface files — always define public APIs

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `ocaml 5.x` | Multicore support | OCaml 4.x |
| `dune` | Build system | Manual ocamlfind |
| `ocamlformat` | Formatting | Manual style |
| `alcotest` / `ppx_expect` | Testing | Ad-hoc tests |
| `opam` | Package management | Manual deps |

## Patterns Claude Should Use
```ocaml
(* Use Result for error handling, not exceptions *)
let divide x y : (float, string) result =
  if y = 0.0 then Error "Division by zero"
  else Ok (x /. y)

(* Exhaustive pattern matching *)
let describe = function
  | [] -> "empty"
  | [x] -> Printf.sprintf "single: %d" x
  | x :: y :: _ -> Printf.sprintf "multiple starting with %d, %d" x y

(* Tail recursion for large lists *)
let sum lst =
  let rec aux acc = function
    | [] -> acc
    | x :: xs -> aux (acc + x) xs
  in
  aux 0 lst

(* Define .mli for public modules *)
(* In module.mli: *)
val find_user : int -> User.t option
```

## Anti-Patterns Claude Generates
- Partial pattern matches — always handle all cases
- `ref` everywhere — prefer immutable values
- Exceptions for expected errors — use `Result`
- Missing `.mli` files — define module interfaces
- `Obj.magic` — almost never justified

## Version Gotchas
- **OCaml 5.x**: Multicore with domains and effects
- **Result vs Option**: `Result` carries error info
- **String vs Bytes**: Use `Bytes` for mutable strings
- **Tail recursion**: Critical for large data
- **With dune**: Use `(libraries ...)` for deps
