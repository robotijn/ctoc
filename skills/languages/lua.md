# Lua CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude uses global variables — always use `local`
- Claude concatenates strings in loops — use `table.concat`
- Claude uses `load`/`loadstring` with user input — code injection
- Claude forgets `nil` can break table iteration — handle explicitly

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `lua 5.4` / `luajit` | Runtime choice | Lua 5.1 |
| `luacheck` | Static analysis | No linting |
| `lua-format` | Formatting | Manual style |
| `busted` | BDD testing | Ad-hoc tests |
| `luarocks` | Package management | Manual deps |

## Patterns Claude Should Use
```lua
-- Always use local
local function process(data)
    local result = {}
    for i, v in ipairs(data) do
        result[i] = transform(v)
    end
    return result
end

-- String building with table.concat (not ..)
local function build_message(items)
    local parts = {}
    for i, item in ipairs(items) do
        parts[i] = tostring(item)
    end
    return table.concat(parts, ", ")
end

-- Proper error handling
local ok, result = pcall(risky_function, arg)
if not ok then
    log_error(result)
    return nil, result
end

-- Module pattern
local M = {}
function M.public_function() end
return M
```

## Anti-Patterns Claude Generates
- Global variables — use `local` always
- String concat `..` in loops — use `table.concat`
- `load(user_input)` — code injection vulnerability
- `nil` in arrays — breaks iteration with `#`
- Metatable abuse — keep inheritance shallow

## Version Gotchas
- **Lua 5.4**: `<const>` and `<close>` attributes
- **LuaJIT**: Faster but stuck at 5.1 compatibility
- **nil in tables**: Use sentinel values or explicit checks
- **Metatables**: Document behavior, limit nesting
- **With C**: Use registry for references, not globals

## Concurrency / Coroutines Footguns
Lua coroutines are **cooperative** (they yield explicitly — never preempted) and give
no true parallelism without host OS threads.

```lua
-- FOOTGUN: coroutine.resume SWALLOWS errors — it returns (false, err), it does NOT
-- raise. An unchecked resume hides the failure:
local ok, err = coroutine.resume(co)     -- ALWAYS capture both values
if not ok then error(err) end            -- re-raise, or the error vanishes silently

-- Compare to coroutine.wrap, which DOES propagate errors (but you lose the ok flag):
local gen = coroutine.wrap(function() coroutine.yield(1); coroutine.yield(2) end)
print(gen(), gen())                      -- 1  2
```
- Name: `coroutine.resume`. Coroutines share the single Lua state — for real
  parallelism you need one Lua state per OS thread (e.g. host-side `lua_newstate`),
  not coroutines.

## Error Handling Idioms
Lua errors propagate via `error()` and are caught in a PROTECTED call — the boolean
first return is the success flag you must check.

```lua
-- pcall returns (true, results...) or (false, error). Check the boolean FIRST:
local ok, result = pcall(risky, arg)
if not ok then
    log(result)                          -- result is the error here, NOT a value
    return nil, result
end

-- xpcall adds a message handler that runs while the stack is still intact —
-- capture a traceback before it unwinds:
local ok, err = xpcall(risky, debug.traceback)

-- error(obj, level): level 2 blames the CALLER's line, not error()'s own:
local function assert_positive(n)
    if n <= 0 then error("must be > 0", 2) end
end
```
- Name: `pcall`, `xpcall`. `assert(v, msg)` raises `msg` when `v` is falsy — but
  remember `false`/`nil` are the only falsy values (0 and "" are TRUE in Lua).

## Security and Dependency Gotchas
`load`/`loadstring` compile a STRING into a callable chunk; running attacker data is
arbitrary code execution.

```lua
-- CWE-94 (Code Injection): load/loadstring on untrusted input runs it as Lua:
local f = load(userinput)                -- userinput="os.execute('rm -rf ~')" => RCE
f()

-- CWE-78 (OS Command Injection): os.execute / io.popen pass a string to the SHELL:
os.execute("gzip " .. userfile)          -- shell metacharacters inject commands

-- SAFE: sandbox untrusted chunks with a restricted _ENV (5.2+): the chunk sees only
-- the whitelist you hand it — no os, no io, no load:
local env = { print = print, pairs = pairs }   -- no os/io/load exposed
local chunk = load(userinput, "sandbox", "t", env)   -- "t" = text only, no bytecode
if chunk then pcall(chunk) end
```
- Name: **CWE-94**, `_ENV` sandbox. Load with mode `"t"` (text) to reject crafted
  BYTECODE (loading malicious bytecode can crash/escape the VM). Pin dependencies
  with **LuaRocks** (`luarocks install pkg 1.2.3-1`; commit the rockspec).
- Source: cwe.mitre.org/data/definitions/94.html (CWE-94, Code Injection) and
  /78.html (CWE-78), retrieved 2026-07-10. See References.

## Testing Conventions
```lua
-- busted: BDD-style describe/it with luassert matchers
describe("greet", function()
  it("quotes preserved", function()
    assert.are.equal("hello, a b", greet("a b"))
  end)
  it("errors on empty", function()
    assert.has_error(function() greet("") end)   -- test the error path
  end)
end)
```
- Name: `busted`. Assertions via **luassert** (bundled); measure coverage with
  **luacov** (`busted --coverage` then `luacov`).

## Performance Traps
- **Table rehash on growth**: appending one element at a time forces periodic rehashes
  — pre-size by constructing the table with its elements (`{a, b, c}`) or reuse a
  buffer table when the shape is known.
- **String concat in loops**: `s = s .. x` in a loop is O(n²) (strings are immutable,
  each `..` allocates a new string) — collect into a table and `table.concat(t)` once.
- Name: `table.concat`. **Global access** is a hash lookup in `_ENV` every time —
  hoist hot globals to locals (`local sin = math.sin`) inside tight loops.
- **1-based indexing**: Lua arrays start at 1, and `#t` is only defined for a
  gap-free sequence — a `nil` hole makes `#t` return any boundary (off-by-one bugs).

## Version-Specific Gotchas (dated, sourced)
- **Lua 5.4.8** released **2025-06-04** is the current 5.4 maintenance release; 5.4
  added integer/float subtypes (`//` floor-div, `math.type`) and `<close>`
  to-be-closed variables (deterministic cleanup on scope exit).
  [lua.org/versions.html, retrieved 2026-07-10]
- **Lua 5.5.0** released **2025-12-22** is the newest major line.
  [lua.org/versions.html, retrieved 2026-07-10]
- **LuaJIT** remains **5.1-compatible** (with select 5.2/5.3 extensions) — code using
  5.4 integer division, `<close>`, or `goto`-free integer semantics will NOT run
  unchanged on LuaJIT. Target the runtime you deploy on.
  [lua.org/versions.html; luajit.org, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Lua versions + release dates: https://www.lua.org/versions.html
- Lua reference manual (5.4): https://www.lua.org/manual/5.4/
- CWE-94 (Code Injection): https://cwe.mitre.org/data/definitions/94.html
- CWE-78 (OS Command Injection): https://cwe.mitre.org/data/definitions/78.html
- busted: https://lunarmodules.github.io/busted/
- LuaRocks: https://luarocks.org/
