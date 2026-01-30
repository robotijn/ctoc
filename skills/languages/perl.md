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
