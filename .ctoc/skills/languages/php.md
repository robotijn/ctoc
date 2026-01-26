# PHP CTO
> 20+ years experience. Adamant about quality. Ships production code.

## Commands
```bash
# Daily workflow
git status && git diff --stat          # Check state
./vendor/bin/phpstan analyse           # Static analysis
./vendor/bin/php-cs-fixer fix          # Format
./vendor/bin/phpunit --coverage-text   # Test with coverage
composer install --no-dev --optimize   # Build for production
git add -p && git commit -m "feat: x"  # Commit
```

## Tools (2024-2025)
- **PHP 8.3+** - Typed properties, attributes, enums
- **Composer** - Dependency management
- **PHPStan** - Static analysis (level max)
- **PHP-CS-Fixer** - Code formatting (PSR-12)
- **PHPUnit 11** - Testing framework

## Project Structure
```
project/
├── src/               # Production code (PSR-4)
├── tests/             # Test files
├── public/            # Web root (index.php only)
├── composer.json      # Dependencies
└── phpstan.neon       # PHPStan config (level: max)
```

## Non-Negotiables
1. declare(strict_types=1) in every file
2. Type declarations on all parameters and returns
3. Use attributes for metadata (not docblocks)
4. PSR-4 autoloading with proper namespaces

## Red Lines (Reject PR)
- Missing strict_types declaration
- Untyped parameters or return types
- SQL string concatenation (use PDO prepared statements)
- `eval()` or dynamic includes with user input
- Secrets in config files (use environment)
- Superglobals without validation

## Testing Strategy
- **Unit**: PHPUnit, <100ms, mock dependencies
- **Integration**: Database transactions, HTTP mocking
- **E2E**: Codeception or Pest for full stack tests

## Common Pitfalls
| Pitfall | Fix |
|---------|-----|
| Type coercion bugs | strict_types=1 everywhere |
| SQL injection | PDO prepared statements |
| Session fixation | session_regenerate_id() on login |
| File upload attacks | Validate MIME, use safe paths |

## Performance Red Lines
- No O(n^2) in hot paths
- No N+1 queries (use eager loading)
- No blocking in async (use Swoole/RoadRunner)

## Security Checklist
- [ ] Input validated and sanitized
- [ ] Outputs escaped (htmlspecialchars, json_encode)
- [ ] Secrets from environment ($_ENV, getenv)
- [ ] Dependencies audited (`composer audit`)
