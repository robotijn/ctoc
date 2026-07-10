# Prolog CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude uses red cuts — only green cuts that don't change semantics
- Claude uses assert/retract for control — use proper data passing
- Claude forgets base cases — infinite recursion
- Claude creates non-terminating predicates — ensure termination

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `swi-prolog 9+` | Most widely used | Ancient Prologs |
| `scryer prolog` | Modern ISO-compliant | Non-standard |
| `sicstus` | High performance (commercial) | Slow interpreters |
| `plunit` | Testing (SWI) | Ad-hoc tests |
| `pldoc` | Documentation | No docs |

## Patterns Claude Should Use
```prolog
:- module(user_service, [find_user/2, valid_user/1]).

%% find_user(+Id, -User) is semidet.
%  Find user by ID. Fails if not found.
find_user(Id, User) :-
    ground(Id),  % Ensure Id is bound
    user_db(Id, Name, Email),
    User = user(Id, Name, Email).

%% valid_user(+User) is semidet.
%  Validates user structure.
valid_user(user(Id, Name, Email)) :-
    integer(Id),
    Id > 0,
    atom(Name),
    atom(Email).

%% sum_list(+List, -Sum) is det.
%  Tail-recursive sum with accumulator.
sum_list(List, Sum) :-
    sum_list(List, 0, Sum).

sum_list([], Acc, Acc).  % Base case
sum_list([H|T], Acc, Sum) :-
    Acc1 is Acc + H,
    sum_list(T, Acc1, Sum).  % Tail recursive
```

## Anti-Patterns Claude Generates
- Red cuts changing semantics — only green cuts
- `assert`/`retract` for control flow — pass data
- Missing base cases — infinite recursion
- Non-determinism when determinism needed — use `!` or `once/1`
- `read`/`call` with untrusted terms — security risk

## Control-Flow Footguns
Prolog's execution is SLD-resolution with backtracking; the "concurrency-equivalent"
hazard is control flow — the cut, negation, and recursion order silently change meaning.

- **The cut (`!`) prunes choice points.** A **green cut** removes redundant solutions
  without changing the logical meaning; a **red cut** changes which answers a predicate
  produces, so the clause is no longer a pure logical statement. Reorder a red-cut clause
  and you get different answers. Place cuts only *after* the deterministic guards that
  commit you to a clause.
- **Negation-as-failure `\+ Goal` is NOT logical negation.** It succeeds when `Goal` fails
  under the **closed-world assumption** — "not provable", not "false". `\+` on a goal with
  unbound variables is almost always a bug: `\+ member(X, L)` with `X` unbound asks "is
  there no `X` in `L`", not "find an `X` not in `L`".
- **Left recursion loops forever.** `path(A,C) :- path(A,B), edge(B,C).` recurses before
  consuming input. Put the base/consuming goal first.

```prolog
% RED cut — changes meaning: max/3 gives wrong answer if reordered or backtracked into
max(X, Y, X) :- X >= Y, !.
max(_, Y, Y).           % relies on the cut above to be correct — fragile

% GREEN cut / explicit conditions — logically complete, order-independent
max_safe(X, Y, X) :- X >= Y.
max_safe(X, Y, Y) :- X <  Y.

% \+ with an unbound var is a trap
% ?- \+ member(X, [a,b]).   % FALSE (an X exists), not "bind X to a non-member"
```

## Error Handling Idioms
Distinguish **failure** (no solution — normal, backtrackable) from an **error** (an
exception thrown via ISO `throw/1`, caught by `catch/3`).

- **`catch(Goal, Catcher, Recovery)`** runs `Recovery` if `Goal` throws a term unifying with
  `Catcher`. Standard error terms are `error(Formal, Context)` — e.g.
  `error(type_error(integer, foo), _)`.
- **Raise domain errors with `throw/1`**: `throw(error(domain_error(positive, N), _))`.
- **`setup_call_cleanup/3`** guarantees cleanup (close a stream, release a lock) whether the
  goal succeeds, fails, or throws — Prolog's `finally`.

```prolog
safe_divide(_, 0, _) :- throw(error(evaluation_error(zero_divisor), safe_divide/3)).
safe_divide(X, Y, Z) :- Z is X / Y.

run :- catch(safe_divide(10, 0, _R),
             error(evaluation_error(zero_divisor), _),
             format("division by zero~n")).
```

## Security and Dependency Gotchas
- **Constructing a goal from untrusted input and running it with `call/1` (or `read_term/2`
  + `call`, `term_to_atom/2` + `call`) is code injection — CWE-94 (Improper Control of
  Generation of Code).** A user-supplied term becomes an executable goal: `call(User)` can
  run `shell/1`, `halt/0`, or read files. Never `call` a term parsed from input.
- **Sandbox untrusted goals.** SWI-Prolog's `library(sandbox)` provides **`safe_goal/1`**,
  which raises an error if a goal calls a non-whitelisted (potentially dangerous) predicate;
  gate any user goal through it before `call`.
- **Pin packs** (`pack_install/1`) to a known version; audit their source — a pack can run
  arbitrary directives on load.

```prolog
:- use_module(library(sandbox)).

run_user_query(Atom) :-
    term_to_atom(Goal, Atom),      % parse input into a goal term
    ( catch(safe_goal(Goal), _, fail)   % CWE-94 guard: reject unsafe goals
    -> call(Goal)
    ;  throw(error(permission_error(execute, unsafe_goal, Goal), _))
    ).
```

## Testing Conventions
- **PlUnit** is SWI-Prolog's test framework. Tests live between `:- begin_tests(name).` and
  `:- end_tests(name).`; run with `?- run_tests.`.
- Each `test(Name) :- Goal.` passes iff `Goal` succeeds; use `test(Name, [throws(Err)])`,
  `test(Name, [fail])`, and `test(Name, [all(X == [..])])` for non-happy paths.

```prolog
:- begin_tests(math).
test(max_left)  :- max_safe(5, 3, 5).
test(max_right) :- max_safe(3, 5, 5).
test(div_zero, [throws(error(evaluation_error(zero_divisor), _))]) :-
    safe_divide(1, 0, _).
:- end_tests(math).
```

## Performance Traps
- **First-argument indexing** — the engine indexes clauses on the first argument. Predicates
  whose first argument is unbound at call time, or is always the same functor, defeat
  indexing and scan every clause. Order arguments so the discriminating one is first.
- **Non-tail recursion defeats last-call optimization (LCO).** Work done *after* the
  recursive call (`sum(T, S1), S is S1 + H`) keeps the whole stack; use an accumulator so
  the recursive call is the final goal.
- **`findall/3` materializes the entire solution list in memory** — on a large or infinite
  generator it blows up. Prefer `aggregate_all/3`, `forall/2`, or a lazy approach.
- **Unbounded `assert`/`retract` churn** thrashes the clause database and blocks indexing
  optimizations; pass data through arguments instead of using the DB as mutable state.

## Version-Specific Gotchas
- **Anchor portable code to ISO Prolog** (ISO/IEC 13211-1) — `catch/3`, `throw/1`, `\+`,
  standard error terms — so it runs across SWI, Scryer, GNU, SICStus.
- **SWI-Prolog** ships a **9.2.x stable** series and a newer **10.x** line; the `sandbox`,
  `apply`, and `pcre` libraries used above are SWI-specific extensions (source:
  https://github.com/SWI-Prolog/swipl-devel/releases and https://www.swi-prolog.org/,
  retrieved 2026-07-10). Name your target implementation for any non-ISO predicate.
- **Tail recursion + accumulators** are mandatory for large inputs.
- **Constraints**: use `library(clpfd)` (CLP(FD)) instead of `is/2` generate-and-test.

## References
- SWI-Prolog releases — https://github.com/SWI-Prolog/swipl-devel/releases (retrieved 2026-07-10)
- SWI-Prolog site — https://www.swi-prolog.org/ (retrieved 2026-07-10)
- CWE-94 Code Injection — https://cwe.mitre.org/data/definitions/94.html (CWE 4.20, retrieved 2026-07-10)
