# Tcl CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
nagelfar -H src/*.tcl                  # Lint
# (No standard formatter)
tclsh test/all.tcl                     # Test
# Package with teapot/fossil
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **Tcl 8.6/9.0** - Latest versions
- **Tk** - GUI toolkit
- **Expect** - Process automation
- **Nagelfar** - Static analysis
- **tcltest** - Testing framework

## Project Structure
```
project/
├── src/               # Tcl source
├── test/              # Test files
├── lib/               # Packages
├── pkgIndex.tcl       # Package index
└── README.md          # Documentation
```

## Non-Negotiables
1. Namespace isolation for packages
2. Proper quoting discipline
3. TclOO for object-oriented code
4. Error handling with try/catch

## Red Lines (Reject PR)
- uplevel/upvar abuse
- eval with user input
- Global variable pollution
- Missing error handling
- Unquoted substitutions
- Secrets hardcoded in scripts

## Testing Strategy
- **Unit**: tcltest framework
- **Integration**: Expect for automation
- **GUI**: Tk test utilities

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Quoting errors | Use list and braces |
| Namespace leaks | Use namespace ensemble |
| Trace overhead | Remove in production |
| Event loop blocking | Use after, fileevent |

## Performance Red Lines
- No O(n^2) in hot paths
- No expr without braces
- No string operations in tight loops

## Security Checklist
- [ ] Input validated and escaped
- [ ] No eval/exec with user input
- [ ] Secrets from environment (env array)
- [ ] Safe interp for untrusted code
