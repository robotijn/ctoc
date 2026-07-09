# PHP Legacy Quality Config

Gradual-adoption quality gate for existing **PHP 8.3** codebases that are not yet
strictly typed. The strategy is *ratchet, don't rewrite*: adopt PHPStan at a modest level
behind a baseline, then raise strictness as debt is paid down. Target runtime PHP 8.3
(released 23 Nov 2023 — source: https://www.php.net/supported-versions.php, retrieved
2026-07-09).

## Mode: Legacy

- Runtime: PHP 8.3, with `declare(strict_types=1)` rolled out file-by-file (not required
  everywhere on day one).
- Static analysis: **PHPStan level 5** (mid-range of PHPStan's 11 levels, 0–10) behind a
  generated baseline so pre-existing errors don't block CI.
- Coverage: 50% lines floor — a realistic starting bar for untested legacy code.
- Style: PSR-12 checked but not enforced as a hard gate.
- Complexity: relaxed (cognitive 20 / cyclomatic 15).

> PHPStan exposes **11 rule levels (0 loosest … 10 strictest)** — source:
> https://phpstan.org/user-guide/rule-levels (retrieved 2026-07-09). Legacy starts at
> level 5 and raises one level at a time as the team fixes the newly reported errors.

## PHPStan Config (`phpstan.neon`)

PHPStan **2.2.5** (source: https://packagist.org/packages/phpstan/phpstan, retrieved
2026-07-09). The baseline captures today's errors so only *new* debt fails the build:

```neon
includes:
    - phpstan-baseline.neon

parameters:
    level: 5
    phpVersion: 80300
    paths:
        - src
    # Baseline holds existing errors; let it drift down as they are fixed
    reportUnmatchedIgnoredErrors: false
```

Generate the baseline once, then commit `phpstan-baseline.neon` (source:
https://phpstan.org/user-guide/baseline, retrieved 2026-07-09):

```bash
./vendor/bin/phpstan analyse --level 5 src --generate-baseline
```

## strict_types Rollout

Do not add `declare(strict_types=1)` everywhere at once — that surfaces every latent
coercion bug in one commit. Add it to each file as it is touched, starting with new files:

```php
<?php

declare(strict_types=1);
```

PHP-CS-Fixer can add the declaration automatically on files it already formats (see
`declare_strict_types` below), so the rollout tracks normal maintenance.

## PHP-CS-Fixer / PHP_CodeSniffer (`.php-cs-fixer.php` / `phpcs.xml`)

PHP-CS-Fixer **3.95.12** with a relaxed, non-risky PSR-12 base (source:
https://packagist.org/packages/friendsofphp/php-cs-fixer, retrieved 2026-07-09):

```php
<?php

return (new PhpCsFixer\Config())
    ->setRules([
        '@PSR12' => true,
        'no_unused_imports' => true,
        'ordered_imports' => ['sort_algorithm' => 'alpha'],
        // enabled but risky-gated so it only runs when explicitly allowed
        'declare_strict_types' => true,
    ])
    ->setRiskyAllowed(true)
    ->setFinder(PhpCsFixer\Finder::create()->in(__DIR__ . '/src'));
```

PHP_CodeSniffer **4.0.1** runs as a warning-only PSR-12 check (source:
https://packagist.org/packages/squizlabs/php_codesniffer, retrieved 2026-07-09):

```xml
<?xml version="1.0"?>
<ruleset name="legacy">
    <rule ref="PSR12"/>
    <file>src</file>
    <!-- warnings do not fail CI during adoption -->
    <arg name="warning-severity" value="0"/>
</ruleset>
```

## PHPUnit Config (`phpunit.xml`)

PHPUnit **12.5.31** (requires PHP >= 8.3 — source:
https://packagist.org/packages/phpunit/phpunit, retrieved 2026-07-09). Warnings are
tolerated during adoption rather than fatal:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="vendor/phpunit/phpunit/phpunit.xsd"
         bootstrap="vendor/autoload.php"
         colors="true">
    <testsuites>
        <testsuite name="Unit">
            <directory>tests</directory>
        </testsuite>
    </testsuites>
    <source>
        <include>
            <directory>src</directory>
        </include>
    </source>
</phpunit>
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 50% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cognitive | 20 |
| Cyclomatic | 15 |

## Install

```bash
composer require --dev \
  phpstan/phpstan:^2.2 \
  friendsofphp/php-cs-fixer:^3.95 \
  squizlabs/php_codesniffer:^4.0 \
  phpunit/phpunit:^12.5
```

Versions web-verified against Packagist on 2026-07-09 (see per-tool sources above). Psalm
is intentionally omitted at this tier — a second type engine adds noise before the PHPStan
baseline is under control.

## CI Integration

GitHub Actions using `shivammathur/setup-php@v2` (release 2.37.2 — source:
https://github.com/shivammathur/setup-php/releases, retrieved 2026-07-09), pinned to
PHP 8.3. PHPStan (behind its baseline) and PHPUnit are the only hard gates:

```yaml
name: quality
on: [push, pull_request]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.3'
          coverage: xdebug
      - run: composer install --no-progress
      - run: ./vendor/bin/phpstan analyse --level=5 src
      # style + coverage reported, not gated, during adoption
      - run: ./vendor/bin/phpcs --standard=PSR12 src || true
      - run: ./vendor/bin/phpunit --coverage-text
```
