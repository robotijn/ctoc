# PHP Strict Quality Config

Strict mode configuration for PHP projects.

## Mode: Strict

- Coverage: 80% minimum
- PHPStan level 8
- PHP-CS-Fixer strict rules

## PHPStan Config (`phpstan.neon`)

```neon
parameters:
    level: 8
    paths:
        - src
    excludePaths:
        - tests
        - vendor

    # Strict rules
    checkMissingIterableValueType: true
    checkGenericClassInNonGenericObjectType: true
    reportUnmatchedIgnoredErrors: true

    # Complexity
    cognitive_complexity:
        maxComplexity: 15

    # Type strictness
    treatPhpDocTypesAsCertain: false
```

## PHP-CS-Fixer Config (`.php-cs-fixer.php`)

```php
<?php

return (new PhpCsFixer\Config())
    ->setRules([
        '@PSR12' => true,
        '@PHP82Migration' => true,
        '@PhpCsFixer' => true,

        // Strict type declarations
        'declare_strict_types' => true,
        'strict_comparison' => true,
        'strict_param' => true,

        // Modern PHP
        'void_return' => true,
        'nullable_type_declaration_for_default_null_value' => true,
        'no_null_property_initialization' => true,

        // Clean code
        'no_unused_imports' => true,
        'ordered_imports' => ['sort_algorithm' => 'alpha'],
        'single_quote' => true,
        'trailing_comma_in_multiline' => ['elements' => ['arrays', 'arguments', 'parameters']],
    ])
    ->setFinder(
        PhpCsFixer\Finder::create()
            ->in(__DIR__ . '/src')
            ->in(__DIR__ . '/tests')
    )
    ->setRiskyAllowed(true);
```

## PHPUnit Config (`phpunit.xml`)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="vendor/phpunit/phpunit/phpunit.xsd"
         bootstrap="vendor/autoload.php"
         colors="true"
         failOnWarning="true"
         failOnRisky="true"
         failOnIncomplete="true"
         failOnSkipped="true">
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
    <coverage>
        <report>
            <html outputDirectory="coverage"/>
            <clover outputFile="coverage.xml"/>
        </report>
    </coverage>
</phpunit>
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 80% |
| Branches | 80% |

## Complexity Limits

| Metric | Limit |
|--------|-------|
| Cognitive | 15 |
| Cyclomatic | 10 |

## Install

```bash
composer require --dev phpstan/phpstan friendsofphp/php-cs-fixer phpunit/phpunit
```

## Commands

```bash
# PHPStan
./vendor/bin/phpstan analyse

# PHP-CS-Fixer
./vendor/bin/php-cs-fixer fix --dry-run --diff

# PHPUnit with coverage
./vendor/bin/phpunit --coverage-html coverage --coverage-clover coverage.xml

# All quality checks
./vendor/bin/phpstan analyse && ./vendor/bin/php-cs-fixer fix --dry-run && ./vendor/bin/phpunit
```
