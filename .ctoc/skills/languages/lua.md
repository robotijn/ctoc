# Lua CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
luacheck .                             # Lint
lua-format -i **/*.lua                 # Format
busted --verbose                       # Test
luarocks make                          # Build/install
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **Lua 5.4 / LuaJIT** - Runtime options
- **luacheck** - Static analysis
- **lua-format** - Code formatting
- **busted** - BDD testing framework
- **luarocks** - Package management

## Project Structure
```
project/
├── src/               # Source files
├── spec/              # Busted test specs
├── rockspec           # Package definition
├── .luacheckrc        # Luacheck config
└── init.lua           # Module entry
```

## Non-Negotiables
1. Local variables by default - no globals
2. Proper error handling with pcall/xpcall
3. Metatables with documentation
4. Clean module pattern (return table)

## Red Lines (Reject PR)
- Global variables without justification
- Missing error handling on I/O
- Complex metatable inheritance chains
- loadstring/load with user input
- Secrets hardcoded in code
- require without pcall for optional deps

## Testing Strategy
- **Unit**: Busted specs, <100ms
- **Integration**: Real file/network tests
- **Mocking**: busted mock/stub features

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Global pollution | Use local, strict mode |
| Table reference sharing | Deep copy when needed |
| Nil in tables | Use sentinel or check explicitly |
| Metatable recursion | Document and limit depth |

## Performance Red Lines
- No O(n^2) in hot paths
- No table rehashing in loops (preallocate)
- No string concatenation in loops (use table.concat)

## Security Checklist
- [ ] Input validated and sanitized
- [ ] No load/loadstring with user input
- [ ] Secrets from environment (os.getenv)
- [ ] Sandbox for untrusted code
