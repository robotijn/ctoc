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

## Concurrency Footguns
Tcl concurrency is the **event loop** (single-threaded, cooperative) plus optional
threads that are FULLY SEPARATE interpreters (nothing shared by default).

```tcl
# The event loop: `after` schedules, `vwait` pumps until a variable is written.
after 1000 [list set ::done 1]   ;# schedule a callback
vwait ::done                     ;# block, running the event loop, until ::done set

# FOOTGUN: `update` re-enters the event loop and can run ANY pending handler
# (including the one you're inside) => re-entrancy bugs and stack surprises.
# Prefer `update idletasks` (only redraw work) or restructure around vwait/after.
```
- Name: `vwait`, `after`. Threads (the `Thread` package) are independent interpreters
  with no shared variables — pass data with `thread::send` or `tsv::` shared vars;
  you cannot just read another thread's globals.

## Error Handling Idioms
```tcl
# `catch` is the low-level form; return code 0 = ok, non-zero = error:
if {[catch {risky_op} msg opts]} {
    puts stderr "failed: $msg"
    # rethrow preserving the original error dictionary:
    return -options $opts $msg
}

# try/on/trap/finally (Tcl 8.6+) is the structured form:
try {
    risky_op
} trap {POSIX ENOENT} {msg} {
    puts "missing file: $msg"
} on error {msg opts} {
    puts stderr $msg
} finally {
    cleanup
}
```
- Name: `try`, `catch`. `$errorInfo` holds the stack trace, `$errorCode` the machine
  -readable code list; `error msg info code` and `return -code error` raise errors.

## Security and Dependency Gotchas
Tcl re-parses strings as code in `eval`/`subst`/`uplevel`, and shells out via `exec`
— two distinct injection classes.

```tcl
# CWE-94 (Code Injection): eval/subst on untrusted input runs it AS TCL CODE.
eval "puts $userinput"        ;# userinput={[exec rm -rf ~]} executes rm

# CWE-78 (OS Command Injection): exec with an unquoted/substituted string.
exec sh -c "gzip $userfile"   ;# shell metacharacters in $userfile inject commands

# SAFE: build argv with `list` (no re-parse) and expand with {*}; never eval data:
set cmd [list gzip -- $userfile]
exec {*}$cmd                  ;# each element is one argument, no shell

# SAFE: run untrusted scripts in a SAFE INTERPRETER (no exec/open/file access):
set safe [interp create -safe]
$safe eval $untrusted_script  ;# dangerous commands are hidden in a safe interp
```
- Name: **CWE-94**, `interp -safe`. Always `{*}` a `list`-built command; a bare
  unquoted `$var` in command position is substituted then word-split (injection).
- Dependency pinning: Tcl modules (`.tm`) are versioned by filename; pin exact
  versions in `package require pkg 1.2.3` and vendor them.
- Source: cwe.mitre.org/data/definitions/94.html (CWE-94, Code Injection) and
  /78.html (CWE-78), retrieved 2026-07-10. See References.

## Testing Conventions
```tcl
package require tcltest
namespace import ::tcltest::*
test greet-1.1 {quotes preserved} -body {
    greet "a b"
} -result "hello, a b"
test greet-1.2 {error path} -body {
    greet ""
} -returnCodes error -match glob -result "*empty*"
cleanupTests
```
- Name: `tcltest`. The `test` command asserts `-result` and `-returnCodes`
  (test the error path, not just the happy path). Lint with **nagelfar**.

## Performance Traps
- **Shimmering** (dual-Obj type thrashing): a value used alternately as a string and
  a list/number is repeatedly re-converted internally — keep a value in ONE
  representation in hot loops.
- **Unbraced `expr`**: `expr "$a + $b"` substitutes then RE-PARSES the string as an
  expression each call (slow AND an injection vector) — always brace: `expr {$a+$b}`.
- **`lappend` vs `concat`**: `lappend` mutates in place (amortized O(1)); building a
  list with repeated `concat`/`set l "$l $x"` copies each time (O(n²)).

## Version-Specific Gotchas (dated, sourced)
- **Tcl/Tk 9.0** is the current major line; **9.0.4** is the latest stable source
  release, with **9.1b0** available as a beta (not for production).
  [tcl-lang.org/software/tcltk/download.html, retrieved 2026-07-10]
- **Tcl 9.0** brings 64-bit-aware sizes (strings/lists > 2 GB), full Unicode
  (beyond the BMP), and a changed C API / `TCL_UTF_MAX` — extensions built for 8.6
  must be recompiled. [tcl-lang.org, retrieved 2026-07-10]
- **Tcl 8.6.18** is the latest 8.6.x maintenance release for the legacy line; 8.6
  introduced `try`/`throw`, `oo::class`, and coroutines (`coroutine`/`yield`).
  [tcl-lang.org/software/tcltk/8.6.html, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Tcl/Tk downloads + version list: https://www.tcl-lang.org/software/tcltk/download.html
- Tcl developer site: https://www.tcl-lang.org/
- CWE-94 (Code Injection): https://cwe.mitre.org/data/definitions/94.html
- CWE-78 (OS Command Injection): https://cwe.mitre.org/data/definitions/78.html
- tcltest manual: https://www.tcl-lang.org/man/tcl8.6/TclCmd/tcltest.htm
