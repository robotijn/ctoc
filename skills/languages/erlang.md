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

## Concurrency / OTP Footguns
```erlang
%% FOOTGUN 1: unbounded mailbox growth. A process that receives slower than it
%% is sent grows its mailbox without limit → memory blowup, and every SELECTIVE
%% receive rescans the whole queue (O(n) per message) making it worse.
loop(State) ->
    receive
        {specific, Msg} -> loop(handle(Msg, State))   %% ignores everything else,
    end.                                               %% which piles up unmatched
%% SAFE: match a catch-all to drain, add backpressure, and prefer gen_server.

%% FOOTGUN 2: a blocking handle_call. gen_server processes ONE message at a time;
%% slow work in handle_call blocks every caller and can hit the 5s call timeout.
handle_call(load, _From, S) -> {reply, expensive_io(), S};   %% WRONG: blocks
%% SAFE: reply fast and offload, or use handle_continue for post-init work.
```
- **Linking vs monitoring:** `link/1` is bidirectional — a linked crash
  propagates an exit signal and can take you down (unless `trap_exit`); `monitor/2`
  is one-directional and just delivers a `{'DOWN', ...}` message. Use monitors to
  observe without coupling lifetimes.
- **Atom table exhaustion:** atoms are **never garbage-collected** and the table
  is capped (default ~1,048,576). `list_to_atom/1` / `binary_to_atom/2` on
  attacker-controlled strings will eventually crash the VM — use
  `list_to_existing_atom/1` / `binary_to_existing_atom/2`.
- Source: erlang.org gen_server, erlang.org System Limits (atoms). See References.

## Error Handling Idioms
```erlang
%% "Let it crash": don't defensively catch; let the process die and let the
%% SUPERVISOR restart it to a known-good state.
init([]) ->
    {ok, {#{strategy => one_for_one, intensity => 3, period => 10},
          [#{id => w, start => {my_worker, start_link, []}, restart => permanent}]}}.

%% Tagged tuples are the idiom for expected outcomes:
case fetch(Id) of
    {ok, V}       -> use(V);
    {error, Reason} -> recover(Reason)
end.

%% try/catch discriminates the three exception CLASSES: throw | error | exit.
try risky() of
    Result -> Result
catch
    throw:T -> {thrown, T};
    error:E -> {crashed, E};
    exit:X  -> {exited, X}
end.
```
- Reserve `try`/`catch` for genuinely recoverable cases; supervisors handle the
  rest. Choose a restart strategy deliberately: `one_for_one`, `one_for_all`,
  `rest_for_one`, `simple_one_for_one`/dynamic children.
- Source: erlang.org supervisor, erlang.org errors. See References.

## Security and Dependency Gotchas
- **`binary_to_term/1` on untrusted data is a deserialization footgun (CWE-502
  class).** It can materialize atoms (feeding atom-table exhaustion) and complex
  terms from attacker bytes. Always pass the `[safe]` option, which refuses to
  create new atoms and unsafe terms:
```erlang
%% DANGER: forges atoms/terms from untrusted bytes.
%% Term = binary_to_term(Untrusted).
%% SAFE: [safe] refuses new atoms and unknown external funs.
Term = binary_to_term(Untrusted, [safe]).
```
  (**CWE-502 "Deserialization of Untrusted Data"** —
  cwe.mitre.org/data/definitions/502.html.)
- **The distributed-Erlang cookie is a shared secret = full trust.** Any node
  presenting the right `~/.erlang.cookie` gets a remote shell equivalent (can run
  arbitrary code across the cluster). Never ship the default/auto-generated
  cookie, never expose the distribution port (epmd/4369) to untrusted networks,
  and enable TLS distribution for inter-node traffic.
- **Dependencies:** `rebar3` (or `mix`) with a committed lockfile; audit with
  `rebar3_hex` / the OSV/GitHub advisory feeds for Hex packages.
- Source: cwe.mitre.org (CWE-502), erlang.org binary_to_term, erlang.org
  distribution security. See References.

## Testing Conventions
```erlang
%% EUnit — inline unit tests.
-include_lib("eunit/include/eunit.hrl").
add_test() -> ?assertEqual(4, 2 + 2).
raises_test() -> ?assertError(badarith, 1/0).   %% assert the error path

%% PropEr — property-based testing.
prop_reverse_twice() ->
    ?FORALL(L, list(int()), L =:= lists:reverse(lists:reverse(L))).
```
- **EUnit** for fast unit tests, **Common Test** (`ct`) for integration/system
  tests (test suites, fixtures, distributed scenarios), **PropEr** for
  property-based generative testing. Assert error paths (`?assertError`,
  `?assertExit`), not only happy paths.
- Source: erlang.org eunit / common_test, github.com/proper-testing/proper. See References.

## Performance Traps
- **Large messages are COPIED** between processes (share-nothing) — passing a big
  binary/term to another process copies it; keep messages small or use large
  binaries (>64 bytes are refc-shared) / ETS for shared read data.
- **Build with iolists, not `++`.** `List1 ++ List2` is O(length(List1)) and
  right-appending in a loop is O(n²); accumulate an `iolist` (nested lists of
  binaries) and let the driver flatten it once.
- **ETS contention:** a single hot public ETS table serializes writers; shard, or
  use `write_concurrency`/`read_concurrency` and `decentralized_counters`.

## Version-Specific Gotchas (dated, sourced)
- **Erlang/OTP 29.0.3** is the current release line (published 2026-07-02); it
  ships the BEAM **JIT**, a built-in `json` module (since OTP 27), and process
  labels. [github.com/erlang/otp releases, retrieved 2026-07-10]
- Pin the OTP major in CI (`rebar3` + `.tool-versions`); the JIT and `json`
  module mean older-OTP fallbacks (external JSON libs) are usually unnecessary on
  27+. [erlang.org/downloads, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Erlang/OTP releases (current 29.0.3): https://github.com/erlang/otp/releases
- Erlang downloads: https://www.erlang.org/downloads
- gen_server behaviour: https://www.erlang.org/doc/man/gen_server.html
- supervisor behaviour: https://www.erlang.org/doc/man/supervisor.html
- binary_to_term/2 ([safe]): https://www.erlang.org/doc/man/erlang.html#binary_to_term-2
- PropEr: https://github.com/proper-testing/proper
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
