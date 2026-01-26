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
