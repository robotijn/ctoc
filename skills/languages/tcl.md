# Tcl CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude forgets proper quoting — use braces and `list`
- Claude uses `eval` with user input — command injection
- Claude pollutes global namespace — use namespaces
- Claude forgets `expr` bracing — performance and security

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `tcl 8.6`/`9.0` | Latest versions | Old Tcl |
| `tk` | GUI toolkit | External GUIs |
| `nagelfar` | Static analysis | No linting |
| `tcltest` | Testing framework | Ad-hoc tests |
| `expect` | Process automation | Shell scripts |

## Patterns Claude Should Use
```tcl
# Proper namespace isolation
namespace eval myapp {
    variable config [dict create]

    proc initialize {args} {
        variable config
        # Proper quoting with braces
        dict set config options $args
    }

    # Always brace expr arguments
    proc calculate {a b} {
        return [expr {$a + $b}]  # Braces required!
    }
}

# Safe command building with list
proc run_command {cmd args} {
    # list prevents injection
    set full_cmd [list {*}$cmd {*}$args]
    exec {*}$full_cmd
}

# Error handling
try {
    risky_operation
} on error {msg opts} {
    puts stderr "Error: $msg"
} finally {
    cleanup
}
```

## Anti-Patterns Claude Generates
- Missing braces in `expr` — security and performance
- `eval $user_input` — command injection
- Global variables — use namespaces
- Unquoted substitutions — word splitting bugs
- `uplevel`/`upvar` abuse — hard to debug

## Version Gotchas
- **Tcl 9.0**: Modern features, improved performance
- **expr bracing**: `{$a + $b}` not `"$a + $b"` (10x faster)
- **list command**: Use for safe command building
- **Namespaces**: Use `namespace ensemble` for OO-like
- **With Tk**: Event-driven, use `after` for async
