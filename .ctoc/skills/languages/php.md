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
