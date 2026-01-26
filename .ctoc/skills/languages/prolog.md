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

## Version Gotchas
- **SWI-Prolog 9+**: Improved performance, better docs
- **ISO compliance**: Scryer for strict ISO
- **Tail recursion**: Critical for performance
- **Cut placement**: After deterministic guards only
- **With constraints**: Use CLP(FD) for constraint solving
