# Perl CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude forgets `use strict; use warnings;` — mandatory in every file
- Claude uses two-arg `open` — use three-arg form with lexical handles
- Claude uses bareword filehandles — use lexical handles
- Claude shell-interpolates user input — use list form for system calls

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `perl 5.38+` | Modern features | Perl 5.20 or older |
| `Perl::Critic` | Static analysis | No linting |
| `Perl::Tidy` | Formatting | Manual style |
| `Test2::V0` | Modern testing | Test::Simple |
| `cpanfile` | Dependency management | Manual installs |

## Patterns Claude Should Use
```perl
use strict;
use warnings;
use feature qw(signatures say);

# Three-arg open with lexical handle
sub read_file($filename) {
    open my $fh, '<', $filename
        or die "Cannot open $filename: $!";
    local $/;  # slurp mode
    my $content = <$fh>;
    close $fh;
    return $content;
}

# List form for system commands (no shell)
system('ls', '-la', $directory);

# Proper Unicode handling
use utf8;
use open qw(:std :utf8);

# Modern OO with signatures
sub new($class, %args) {
    return bless \%args, $class;
}
```

## Anti-Patterns Claude Generates
- Missing `use strict; use warnings;` — always include
- Two-arg `open FILE, $path` — use three-arg lexical form
- Shell interpolation `system("cmd $var")` — use list form
- Bareword filehandles — use `my $fh`
- Missing UTF-8 handling — use `use utf8;` and `:encoding`

## Version Gotchas
- **5.38+**: Stable signatures (no experimental pragma needed)
- **Unicode**: Declare encoding explicitly everywhere
- **Regex**: Avoid catastrophic backtracking with atomic groups
- **Taint mode**: Use `-T` for web/CGI code
- **With Plack**: Modern web, not CGI.pm

## Concurrency Footguns
Perl has no shared-memory threads by default — parallelism is `fork` (copy-on-write
processes) or `ithreads` (which copy the ENTIRE interpreter per thread).

```perl
# FOOTGUN: forked children become zombies until reaped. Reap them or they leak PIDs:
use POSIX ':sys_wait_h';
$SIG{CHLD} = sub { while ((my $pid = waitpid(-1, WNOHANG)) > 0) {} };
my $pid = fork // die "fork failed: $!";
if ($pid == 0) { do_work(); exit 0; }   # child MUST exit, or it falls through

# ithreads copy every variable at spawn (expensive); nothing is shared unless you
# explicitly use threads::shared — reach for fork()/a job queue for most work.
```
- Name: `fork`, `$SIG{CHLD}`. `fork` returns `undef` on failure (check it), `0` in
  the child, the child PID in the parent — a missing `exit` in the child branch is a
  classic "the child ran the parent's code too" bug.

## Error Handling Idioms
`use strict; use warnings;` are mandatory (they turn silent typos and undef-use into
errors). `eval { }` is Perl's try, but it has traps.

```perl
# FOOTGUN: $@ can be clobbered by object destructors running during unwind.
# Capture it immediately, and localize it:
my $result = eval { risky() };          # returns undef on die
if (my $err = $@) { handle($err) }       # check a COPY, not $@ later

# Prefer Try::Tiny — it localizes $@ and gives real try/catch/finally semantics:
use Try::Tiny;
try   { risky() }
catch { warn "failed: $_" }              # $_ holds the error here
finally { cleanup() };

# ALWAYS check the return of open/system and read $! (errno) / $? (child status):
open my $fh, '<', $file or die "open $file: $!";
```
- Name: `Try::Tiny`, `$@`. `die` with an object (not a string) lets callers match on
  a class; `Carp`'s `croak`/`confess` report the CALLER's line, not yours.

## Security and Dependency Gotchas
**Taint mode `-T`** makes Perl refuse to use externally-derived data in dangerous
sinks (shell, file ops) until you launder it through a regex capture.

```perl
#!/usr/bin/perl -T
use strict; use warnings;

# CWE-78 (OS Command Injection): two-arg open and string system() invoke a SHELL.
open my $fh, "cat $userfile |";          # UNSAFE: $userfile="x; rm -rf ~" runs rm
system("gzip $userfile");                # UNSAFE: same shell metacharacter problem

# SAFE: three-arg open (no shell) and LIST-form system (no shell):
open my $fh2, '<', $userfile or die $!;  # three-arg lexical handle
system('gzip', '--', $userfile) == 0     # argv list => execve, no shell parsing
    or die "gzip failed: $?";
```
- Name: **CWE-78**, `-T`, three-arg open. `system(LIST)` / `exec(LIST)` bypass the
  shell entirely; `system(STRING)` and backticks (`` `$cmd` ``) go through `/bin/sh`.
- Dependency pinning: declare deps in a `cpanfile`, freeze exact versions with
  **Carton** (`carton install` writes `cpanfile.snapshot`); audit with `cpan-audit`
  against the CPAN Security Advisory DB.
- Source: cwe.mitre.org/data/definitions/78.html (CWE-78), retrieved 2026-07-10;
  perldoc.perl.org perlsec (taint mode). See References.

## Testing Conventions
```perl
use Test2::V0;                           # modern successor to Test::More
is greet("a b"), "hello, a b", 'quotes preserved';
like dies { parse("") }, qr/empty/, 'error path tested, not just happy path';
done_testing;
```
- Name: `Test2`. Run with **prove** (`prove -lr t/`); measure coverage with
  **Devel::Cover** (`cover -test`). Test error paths with `dies`/`lives` (Test2) or
  `Test::Exception`.

## Performance Traps
- **Regex recompilation**: interpolating a variable into `m/$pat/` recompiles the
  pattern each call — precompile once with `my $re = qr/.../;` and reuse `$re`.
- **String concat in loops**: `$s .= $_ for @big` reallocates repeatedly; `push` to
  an array and `join '', @parts` once.
- **Slurping huge files**: `local $/; my $all = <$fh>;` loads the whole file into
  memory — stream line-by-line for large inputs.
- **Autovivification**: `$h{a}{b}` in rvalue context silently CREATES `$h{a}` as a
  hash ref — guard with `exists` when probing nested structures.

## Version-Specific Gotchas (dated, sourced)
- **Perl 5.42** released **2025-07-03** (latest 5.42.2, 2026-03-29) — current stable
  major. [endoflife.date/perl, retrieved 2026-07-10]
- **Perl 5.40** (released 2024-06-09, latest 5.40.4) is the prior stable line.
  [endoflife.date/perl; www.cpan.org/src, retrieved 2026-07-10]
- **`use v5.40;`** (or `use v5.42;`) enables that release's feature bundle
  (`strict`, `signatures`, `say`, class syntax progress) in one line — prefer it
  over hand-listing `use feature`. [perldoc.perl.org/feature, retrieved 2026-07-10]

## References (retrieved 2026-07-10)
- Perl release status / dates: https://endoflife.date/perl
- Perl source distribution: https://www.cpan.org/src/
- perlsec (security / taint mode): https://perldoc.perl.org/perlsec
- CWE-78 (OS Command Injection): https://cwe.mitre.org/data/definitions/78.html
- Try::Tiny: https://metacpan.org/pod/Try::Tiny
- Test2::V0: https://metacpan.org/pod/Test2::V0
