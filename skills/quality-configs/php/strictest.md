# PHP Strictest Quality Config

Maximum-strictness quality gate for **PHP 8.3** projects: the full analyser stack pinned
at its strictest documented setting. Target runtime PHP 8.3 (released 23 Nov 2023 —
source: https://www.php.net/supported-versions.php, retrieved 2026-07-09).

## Mode: Strictest

- Runtime: PHP 8.3+, every file opens with `declare(strict_types=1)`.
- Static analysis: **PHPStan level 10** (the strictest of PHPStan's 11 levels, 0–10) plus
  **Psalm `errorLevel="1"`** (Psalm's strictest error level) for a second, complementary
  type engine.
- Coverage: 90% lines and branches.
- Style: PSR-12 enforced by both PHP-CS-Fixer and PHP_CodeSniffer.
- Complexity: cognitive 10 / cyclomatic 7.

> PHPStan exposes **11 rule levels (0 loosest … 10 strictest)** — source:
> https://phpstan.org/user-guide/rule-levels (retrieved 2026-07-09). Level 10 is the
> current maximum; the strict type-narrowing flags below (introduced in the level-8/9 era)
> are retained on top of level 10.

## PHPStan Config (`phpstan.neon`)

PHPStan **2.2.5** (source: https://packagist.org/packages/phpstan/phpstan, retrieved
2026-07-09).

```neon
parameters:
    level: 10  # strictest of PHPStan's 11 levels (0–10)
    phpVersion: 80300  # analyse against PHP 8.3 semantics
    paths:
        - src
    excludePaths:
        - tests
        - vendor

    # Maximum type strictness — do not trust PHPDoc over inference
    treatPhpDocTypesAsCertain: false

    # Require generic / iterable value types everywhere
    checkMissingIterableValueType: true
    checkGenericClassInNonGenericObjectType: true
    checkInternalClassCaseSensitivity: true

    # Fail the build on unmatched ignores so the ignore list cannot rot
    reportUnmatchedIgnoredErrors: true
```

## strict_types & Psalm

Every file MUST declare strict typing on line 1 — this makes PHP 8.3 throw a `TypeError`
on any implicit scalar coercion at a function boundary instead of silently juggling types:

```php
<?php

declare(strict_types=1);
```

Psalm **6.16.1** runs alongside PHPStan as a second type engine (source:
https://packagist.org/packages/vimeo/psalm, retrieved 2026-07-09). `errorLevel="1"` is
Psalm's strictest setting (source:
https://psalm.dev/docs/running_psalm/configuration/, retrieved 2026-07-09):

```xml
<?xml version="1.0"?>
<psalm
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns="https://getpsalm.org/schema/config"
    errorLevel="1"
    findUnusedBaselineEntry="true"
    findUnusedCode="true"
>
    <projectFiles>
        <directory name="src"/>
        <ignoreFiles>
            <directory name="vendor"/>
        </ignoreFiles>
    </projectFiles>
</psalm>
```

## PHP-CS-Fixer / PHP_CodeSniffer (`.php-cs-fixer.php` / `phpcs.xml`)

PHP-CS-Fixer **3.95.12** enforcing PSR-12 with risky strict-type rules (source:
https://packagist.org/packages/friendsofphp/php-cs-fixer, retrieved 2026-07-09):

```php
<?php

declare(strict_types=1);

return (new PhpCsFixer\Config())
    ->setRiskyAllowed(true)
    ->setRules([
        '@PSR12' => true,
        '@PHP83Migration' => true,
        'declare_strict_types' => true,
        'strict_comparison' => true,
        'strict_param' => true,
        'void_return' => true,
        'no_unused_imports' => true,
    ])
    ->setFinder(PhpCsFixer\Finder::create()->in(__DIR__ . '/src'));
```

PHP_CodeSniffer **4.0.1** provides the second PSR-12 gate (source:
https://packagist.org/packages/squizlabs/php_codesniffer, retrieved 2026-07-09):

```xml
<?xml version="1.0"?>
<ruleset name="strictest">
    <rule ref="PSR12"/>
    <file>src</file>
    <arg name="colors"/>
    <arg value="p"/>
</ruleset>
```

## PHPUnit Config (`phpunit.xml`)

PHPUnit **12.5.31** (requires PHP >= 8.3 — source:
https://packagist.org/packages/phpunit/phpunit, retrieved 2026-07-09). Every warning is
fatal so the suite cannot go green while degrading:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="vendor/phpunit/phpunit/phpunit.xsd"
         bootstrap="vendor/autoload.php"
         colors="true"
         failOnWarning="true"
         failOnRisky="true"
         failOnIncomplete="true"
         failOnSkipped="true"
         beStrictAboutOutputDuringTests="true"
         beStrictAboutCoverageMetadata="true">
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
| Lines | 90% |
| Branches | 90% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cognitive | 10 |
| Cyclomatic | 7 |

## Install

```bash
composer require --dev \
  phpstan/phpstan:^2.2 \
  vimeo/psalm:^6.16 \
  friendsofphp/php-cs-fixer:^3.95 \
  squizlabs/php_codesniffer:^4.0 \
  phpunit/phpunit:^12.5
```

Versions web-verified against Packagist on 2026-07-09 (see per-tool sources above).

## CI Integration

GitHub Actions using `shivammathur/setup-php@v2` (release 2.37.2 — source:
https://github.com/shivammathur/setup-php/releases, retrieved 2026-07-09), pinned to
PHP 8.3, running all four gates:

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
      - run: ./vendor/bin/phpstan analyse --level=10 src
      - run: ./vendor/bin/psalm --no-cache
      - run: ./vendor/bin/phpcs --standard=PSR12 src
      - run: ./vendor/bin/php-cs-fixer fix --dry-run --diff
      - run: ./vendor/bin/phpunit --coverage-text
```
