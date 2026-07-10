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

## Concurrency / Effects Footguns
OCaml 5 introduced **parallelism via domains** and **effect handlers** — Claude
routinely conflates domains (true parallelism) with the old cooperative
threading, and forgets that shared mutable state across domains is a data race.

```ocaml
(* Parallel work: each Domain runs on its own core. *)
let d1 = Domain.spawn (fun () -> heavy_compute a) in
let d2 = Domain.spawn (fun () -> heavy_compute b) in
let r1 = Domain.join d1 and r2 = Domain.join d2 in

(* FOOTGUN: sharing a plain ref across domains is a DATA RACE. *)
let counter = ref 0 in
let _ = Domain.spawn (fun () -> incr counter) in  (* unsynchronized -> UB *)

(* SAFE: guard shared state with a Mutex (or use per-domain state + join). *)
let m = Mutex.create () in
Mutex.protect m (fun () -> incr counter)
```
- **Domains are OS threads / cores**, not lightweight fibers — spawning one per
  small task is wrong; size a pool to core count. The old `Thread` module is
  cooperative (a single runtime lock) and does NOT give parallelism.
- **Effect handlers** (`effect E : ty` / `perform` / `match_with` in `Effect`)
  are the OCaml 5 mechanism behind concurrency libraries (Eio, Domainslib). A
  performed effect that reaches no matching handler raises `Effect.Unhandled`.
- Source: OCaml Manual, "Parallel programming" / "Effect handlers". See References.

## Error Handling Idioms
Use `result`/`Result.t` for **expected** failures; reserve exceptions for truly
exceptional/programmer errors. Turn on exhaustive-match warnings.

```ocaml
(* Expected failure -> result, not an exception: *)
let find_user id : (User.t, string) result =
  match Hashtbl.find_opt users id with
  | Some u -> Ok u
  | None   -> Error (Printf.sprintf "no user %d" id)

(* Compose with the Result module, don't pattern-match by hand every time: *)
let load id = Result.bind (find_user id) validate

(* Cleanup that runs even on exception: *)
let with_file path f =
  let ic = open_in path in
  Fun.protect ~finally:(fun () -> close_in ic) (fun () -> f ic)
```
- Prefer `..._opt` variants (`List.find_opt`, `Hashtbl.find_opt`) over the
  exception-raising ones; avoid `Stdlib.failwith`/`assert false` in library code.
- Compile with **`-w +a`** (or at least keep the default partial-match warning
  `8` on and treat it as an error, `-warn-error +8`) so a non-exhaustive `match`
  fails the build instead of throwing `Match_failure` at runtime.
- Source: OCaml Manual, "Error handling" / `Fun.protect` stdlib doc. See References.

## Security and Dependency Gotchas
- **`Marshal` is unsafe on untrusted input.** `Marshal.from_string`/`from_channel`
  reconstructs arbitrary OCaml values with NO type check — a crafted payload can
  forge values that violate type invariants (mis-tagged blocks, out-of-bounds
  data) leading to memory unsafety / crashes. This is a **deserialization trust
  boundary** (the OCaml analog of CWE-502). Never `Marshal` data that crossed a
  network or user boundary; use a validated format (`yojson`/`ppx_deriving_yojson`)
  instead. The manual explicitly warns unmarshalling untrusted data is unsafe.
- **opam pinning**: commit an `opam.locked` file (`opam lock`) so a rebuild
  resolves to the exact same package set; `opam pin` fixes a dependency to a
  known revision. Audit with the opam security advisories feed.
- Source: OCaml Manual, `Marshal` module (safety note); cwe.mitre.org CWE-502.
  See References.

## Testing Conventions
```ocaml
(* alcotest: structured, colored, CI-friendly. *)
let test_reverse () =
  Alcotest.(check (list int)) "reverse twice" [1;2;3]
    (List.rev (List.rev [1;2;3]))

let () =
  Alcotest.run "lists"
    [ "rev", [ Alcotest.test_case "involutive" `Quick test_reverse ] ]
```
- Run via **`dune test`** (`dune runtest`). Use **`alcotest`** for unit tests or
  **`ppx_expect`** for expectation/snapshot tests; **`qcheck`** for property tests.
- Coverage with **`bisect_ppx`**: instrument (`--instrument-with bisect_ppx`),
  run, then `bisect-ppx-report html`.

## Performance Traps
- **Boxing of `float` in polymorphic containers**: a `float array` is unboxed and
  fast, but `float` inside a polymorphic `'a list`/`'a array` or a tuple is boxed
  (heap-allocated). Keep numeric arrays monomorphic; use `Float.Array` /
  `Bigarray` for large numeric data.
- **`List` vs `Array`**: `List.nth` is O(n) and lists are cache-unfriendly; use
  `Array` (or `Bytes`) for random access and tight loops.
- **Flambda** (`-O3`, the optimizing middle-end; opt into the flambda switch)
  does aggressive inlining/specialization — a numeric kernel can be several times
  faster than the default compiler.
- Avoid allocation in hot loops (each `Some x`, tuple, or closure allocates);
  prefer accumulator-passing tail recursion.

## Version-Specific Gotchas (dated, sourced)
- **OCaml 5.5.0** released **2026-06-19** is the current release.
  [github.com/ocaml/ocaml releases, retrieved 2026-07-10]
- **OCaml 5.4.0** (2025-10-09) and **5.3.0** (2025-01-08) are the prior 5.x
  releases; **4.14.4** (2026-06-15) is the maintained 4.x line for code not yet
  ported to multicore. [github.com/ocaml/ocaml releases, retrieved 2026-07-10]
- The **domains + effect-handlers** parallel runtime has shipped since OCaml
  **5.0.0**; pre-5.0 (4.x) has no shared-memory parallelism.
  [OCaml Manual, "Parallel programming", retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- OCaml releases: https://github.com/ocaml/ocaml/releases
- OCaml Manual (parallelism / effects / error handling): https://ocaml.org/manual/
- `Marshal` module (untrusted-input safety note): https://ocaml.org/manual/api/Marshal.html
- `Fun.protect`: https://ocaml.org/manual/api/Fun.html
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
- alcotest: https://github.com/mirage/alcotest
