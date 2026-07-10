# PHP CTO
> Claude Code correction guide. Updated January 2026.

## Critical Corrections
- Claude forgets `declare(strict_types=1)` — add to every file
- Claude uses `==` — always `===` for strict comparison
- Claude misses property hooks (PHP 8.4) — eliminates getter/setter boilerplate
- Claude concatenates SQL strings — use PDO prepared statements

## Current Tooling (2026)
| Tool | Use | NOT |
|------|-----|-----|
| `php 8.4+` | Property hooks, array_find | PHP 8.2 or older |
| `phpstan level max` | Static analysis | Lower levels |
| `php-cs-fixer` | PSR-12 formatting | Manual style |
| `pest` or `phpunit 11` | Testing | Older PHPUnit |
| `composer audit` | Security scanning | Manual checks |

## Patterns Claude Should Use
```php
<?php
declare(strict_types=1);

// PHP 8.4 property hooks
class User
{
    public string $name {
        set => trim($value);
    }

    public string $email {
        set {
            if (!filter_var($value, FILTER_VALIDATE_EMAIL)) {
                throw new InvalidArgumentException('Invalid email');
            }
            $this->email = $value;
        }
    }
}

// PHP 8.4 array functions
$user = array_find($users, fn($u) => $u->id === $id);

// No parentheses needed (PHP 8.4)
$name = new User('John')->getName();
```

## Anti-Patterns Claude Generates
- Missing `declare(strict_types=1)` — type coercion bugs
- `==` loose equality — use `===`
- `$_GET['key']` without validation — always validate input
- `eval()` or variable variables — security risk
- SQL string concatenation — SQL injection

## Version Gotchas
- **PHP 8.4**: Property hooks, `array_find()`, no-parens instantiation
- **PHP 8.4**: Session settings deprecations (affects PHP 9)
- **PHP 8.5**: Released Nov 2025
- **PHP 8.6**: Pipe operator coming (end of 2026)
- **With UTF-8**: Always specify encoding in `htmlentities()`

## Concurrency Footguns
- **PHP is shared-nothing per request** under FPM/Apache: each request gets a fresh process
  state, so there is no in-process shared mutable heap to race on — but also no long-lived
  in-memory cache without an external store (APCu/Redis).
- **Fibers (PHP 8.1+) are cooperative, not parallel.** A `Fiber` suspends and resumes on one
  thread; it does NOT run two PHP call stacks simultaneously. It is the building block for
  async runtimes (Amp, ReactPHP), not a way to use multiple cores.
- **No threads in mainstream FPM.** `pcntl_fork()` works only in CLI SAPI (not FPM/web) and
  copies the whole process — mind file descriptors and open DB handles across the fork.
- Treat "background work" as a queue (a separate worker process), not an in-request thread.

```php
<?php
declare(strict_types=1);

// Fiber: cooperative suspend/resume on ONE thread — not parallel.
$fiber = new Fiber(function (): void {
    $value = Fiber::suspend('paused');   // yields control back to caller
    echo "resumed with: {$value}\n";
});
$fiber->start();                          // prints nothing yet; suspended
$fiber->resume('go');                     // now prints "resumed with: go"
```

## Error Handling Idioms
- **`Throwable` is the root** of both `Error` (engine/type errors) and `Exception`
  (application errors). Catch `Throwable` only at a top-level boundary; catch specific
  types everywhere else.
- **`declare(strict_types=1)`** must be the first statement in every file — without it,
  `int` params silently coerce `"5"`, `5.9`, and `true`, hiding bugs.
- **Never use `@` error suppression** — it hides fatals and slows the engine. Handle the
  error or let it throw.
- `try`/`catch`/`finally`; `finally` runs even on `return`. A `return` inside `finally`
  overrides an exception being thrown — avoid it.

```php
<?php
declare(strict_types=1);   // MUST be first line — no silent coercion

try {
    $user = $repo->find($id);
} catch (NotFoundException $e) {      // specific type, not Throwable
    return new Response(404);
} catch (Throwable $e) {              // top-level boundary only
    $logger->error($e->getMessage(), ['exception' => $e]);
    throw $e;                         // don't swallow — rethrow
}
```

## Security and Dependency Gotchas
- **`unserialize()` on untrusted input is deserialization RCE — CWE-502.** PHP object
  injection lets an attacker craft input that instantiates objects and triggers "POP-chain"
  gadgets via magic methods (`__wakeup`, `__destruct`). Never `unserialize()` user data;
  use `json_decode()` for data interchange. If you must, pass
  `unserialize($data, ['allowed_classes' => false])`. — https://cwe.mitre.org/data/definitions/502.html (retrieved 2026-07-10)
- **SQL injection (CWE-89)**: never concatenate input into SQL. Use **PDO prepared
  statements** with bound parameters (`$pdo->prepare('... WHERE id = ?')->execute([$id])`).
  — https://cwe.mitre.org/data/definitions/89.html (retrieved 2026-07-10)
- **`eval()` and variable variables (`$$name`)** are code-injection footguns — CWE-94.
  — https://cwe.mitre.org/data/definitions/94.html (retrieved 2026-07-10)
- **Dependency auditing**: run `composer audit` in CI (it checks the packagist advisory DB)
  and commit `composer.lock` for reproducible, pinned installs.

```php
<?php
declare(strict_types=1);

// SAFE: PDO prepared statement (CWE-89), JSON not unserialize (CWE-502).
$stmt = $pdo->prepare('SELECT * FROM users WHERE email = ?');
$stmt->execute([$email]);                       // bound, not concatenated
$data = json_decode($payload, true);            // not unserialize($payload)
```

## Testing Conventions
- **PHPUnit** (`assertSame`, `assertEquals`, data providers via `#[DataProvider]`) or
  **Pest** (expressive, PHPUnit-backed). Prefer `assertSame` over `assertEquals` to catch
  type coercion (`"1"` vs `1`).
- **Data providers** parametrize a test across many input/expected pairs — keep them pure.
- **Coverage** requires **Xdebug** or **PCOV** (PCOV is much faster in CI). Gate the
  threshold; a covered-but-unasserted line is false green.

## Performance Traps
- **OPcache must be enabled in production** — without it every request recompiles every PHP
  file to bytecode. Also tune `opcache.validate_timestamps=0` in prod (invalidate on deploy)
  and consider preloading.
- **Copy-on-write arrays**: PHP arrays copy on write when passed by value and mutated — a
  large array mutated in a loop can silently duplicate. Pass by reference (`&$arr`) or
  restructure when it matters.
- **N+1 in ORMs** (Eloquent, Doctrine) is the dominant real-world slowdown — eager-load
  (`with()` in Eloquent, `fetch: EAGER`/`JOIN` in Doctrine).
- **Autoloader misconfiguration** (missing `composer dump-autoload -o` in prod) forces
  filesystem scans on every class load.

## Version-Specific Gotchas (PHP 8.4+)
- **PHP 8.4 (released 2024-11-21)** added **property hooks** (get/set logic without a full
  getter/setter), **asymmetric visibility** (`public private(set)`), **`new MyClass()->method()`**
  without wrapping parens, `array_find`/`array_any`/`array_all`, and the first-class
  **`#[\Deprecated]`** attribute. — https://www.php.net/releases/8.4/en.php (retrieved 2026-07-10)
- **PHP 8.5 (released 2025-11-20)** is the current line; PHP 8.4 receives active support
  through 2026 and security fixes through 2028. Verify your target against the supported-versions
  table. — https://www.php.net/supported-versions.php (retrieved 2026-07-10)
- **Deprecations compound**: 8.4 deprecated implicitly-nullable parameter types
  (`function f(int $x = null)` must become `?int $x = null`) — a warning today, a fatal in
  a future major.

## References
- PHP 8.4 release announcement — https://www.php.net/releases/8.4/en.php (retrieved 2026-07-10)
- PHP supported versions — https://www.php.net/supported-versions.php (retrieved 2026-07-10)
- CWE-502 Deserialization of Untrusted Data — https://cwe.mitre.org/data/definitions/502.html (retrieved 2026-07-10)
- CWE-89 SQL Injection — https://cwe.mitre.org/data/definitions/89.html (retrieved 2026-07-10)
- CWE-94 Code Injection — https://cwe.mitre.org/data/definitions/94.html (retrieved 2026-07-10)
