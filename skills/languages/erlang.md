# Erlang CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude spawns processes without supervision — always use supervisors
- Claude catches all exceptions — use specific patterns
- Claude blocks gen_server callbacks — use handle_continue
- Claude forgets timeouts on calls — always specify timeouts

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `erlang/otp 27+` | Latest with JIT | Older OTP |
| `rebar3` | Build and deps | Manual make |
| `dialyzer` | Type checking | No types |
| `elvis` | Code style linting | No linting |
| `common test` | Integration testing | Ad-hoc tests |

## Patterns Claude Should Use
```erlang
%% Always supervise processes
-module(my_sup).
-behaviour(supervisor).

init([]) ->
    ChildSpecs = [
        #{id => worker,
          start => {my_worker, start_link, []},
          restart => permanent}
    ],
    {ok, {#{strategy => one_for_one}, ChildSpecs}}.

%% Use handle_continue for async init
handle_call(init_request, _From, State) ->
    {reply, ok, State, {continue, do_init}}.

handle_continue(do_init, State) ->
    NewState = expensive_init(),
    {noreply, NewState}.

%% Always specify timeouts
gen_server:call(Pid, Request, 5000).
```

## Anti-Patterns Claude Generates
- Spawning without supervision — use `supervisor`
- `catch _:_ ->` everywhere — be specific about errors
- Blocking in callbacks — use `handle_continue`
- Missing call timeouts — always pass timeout arg
- Unbounded mailboxes — add backpressure

## Version Gotchas
- **OTP 27+**: Built-in `json` module, process labels
- **JIT compiler**: Significant performance boost
- **Let it crash**: Design for supervisor recovery
- **ETS ownership**: Use `heir` option for table survival
- **With Elixir**: Can interop, Elixir runs on BEAM
