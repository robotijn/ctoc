---
iron_loop: true
approved_by: human
approved_at: 2026-07-09T21:40:58.310Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-08T20:52:40.442Z
gate_crossed: functional → implementation
---

---
iron_loop: true
title: "CU4b s2 — php quality-configs (legacy · strictest) → PHP 8.3 strict-toolchain depth"
type: implementation
parent_plan: CU4b-quality-configs
depends_on: none
priority: MEDIUM
risk_level: MEDIUM
files:
  - skills/quality-configs/php/legacy.md
  - skills/quality-configs/php/strictest.md
  - tests/cu4b-php-configs.test.js
---

# CU4b s2 — php quality-configs → PHP 8.3 strict-toolchain depth

> Slice 2 of the CU4b decomposition (SIP1). Upgrade the two thin php quality-config
> guides using the SAME-FAMILY template `php/strict.md` (7 sections — already SOLID and
> READ-ONLY). Inherits the parent's Gate-1 `approved_by: human` marker; Gate 2 & 3 batch
> via `approveSubplans('CU4b-quality-configs', …)`. **HARD RULES:** **(1) NO STUBS** —
> real PHP 8.3 rules/rationale/versions, each file `> 5` `##` sections. **(2) NO
> FABRICATED versions/rules** — every PHPStan/psalm/PHPCS/PHPUnit version and level
> WEB-VERIFIED against official docs at edit time, inline dated http source ≥ 2025-01-01;
> unverifiable → omit. **(3) ZERO TEST DOUBLES** — the content-contract test reads the
> REAL php config files off disk. **(4) STRUCTURAL TEMPLATING** — copy php/strict's
> STRUCTURE, author PHP-correct values; NO Ruby/RuboCop value may appear.

Satisfies CU4b acceptance criteria: **"php configs address PHP-specific strict-mode
toolchain"**, **"all 9 thin configs reach sibling-family depth"** (the 2 php files),
**"config values are language-correct"**, **"every section names a technology-specific
identifier"**, **"all version claims carry dated sources"**.

## Implementation Details

### Architecture Decision

Both php variants are thin (read-fresh 2026-07-09): legacy = 4 `##`/32 lines, strictest =
4 `##`/36 lines. A rich SAME-family sibling exists — **`skills/quality-configs/php/strict.md`**
(7 `##`: Mode / PHPStan(`phpstan.neon`) / PHP-CS-Fixer(`.php-cs-fixer.php`) /
PHPUnit(`phpunit.xml`) / Coverage / Complexity / Install / Commands). That is the STRUCTURE
template (SOLID, READ-ONLY). The parent text suggested "php mirror ruby/strictest"; the
same-family php/strict is the faithful template (identical toolchain, only the strictness
gradient differs) and is used — ruby/strictest is a depth reference only, and NO Ruby
value is copied.

**Strictness gradient (real correctness axis):**
- **strictest**: `declare(strict_types=1)` enforcement pattern; PHPStan **level 9** (max)
  with `treatPhpDocTypesAsCertain: false`, `checkMissingIterableValueType`,
  `checkGenericClassInNonGenericObjectType` (already present in the thin file — keep +
  wrap in structure); **psalm** at its strictest error level for additional type
  coverage; **PHP_CodeSniffer (PHPCS)** enforcing PSR-12; PHPUnit coverage 90%;
  complexity limits (cognitive 10 / cyclomatic 7, already present — keep); CI;
  PHP 8.3+ specific checks.
- **legacy**: PHPStan **level 5** with `baseline` generation (`phpstan.neon` +
  `phpstan-baseline.neon`) for gradual adoption; gradual `declare(strict_types=1)`
  rollout strategy; coverage floor 50%; PHPCS relaxed; CI for incremental adoption.

### Dependency Graph

```
skills/quality-configs/php/legacy.md     (MODIFY) ─┐
skills/quality-configs/php/strictest.md  (MODIFY) ─┴─ structure from ─▶ php/strict.md (READ-ONLY, same-family)
                                                     depth ref ───────▶ ruby/strictest.md (READ-ONLY, values NOT copied)
tests/cu4b-php-configs.test.js  (CREATE, reads the 2 real files — zero doubles)
```

Disjoint from every other slice. No cycle. `depends_on: none`.

### File Specifications

#### Files: `php/legacy.md`, `php/strictest.md`
**Action:** MODIFY (add sections to reach `> 5` `##`; keep every existing section).
**Purpose:** each becomes a substantive PHP correction surface at `phpstan.neon` /
`.php-cs-fixer.php` edit time.
**Change Type:** structural depth expansion (php/strict structure, PHP values).

Each file, after upgrade, must carry at minimum (structure mirrors php/strict):
1. **Mode** (keep).
2. **PHPStan Config (`phpstan.neon`)** — level (9 strictest / 5 legacy), paths, and
   strictest flags (keep the existing `treatPhpDocTypesAsCertain` etc.); legacy adds
   `baseline` generation (`phpstan-baseline.neon`).
3. **strict_types / Type-safety** — `declare(strict_types=1)` enforcement (strictest) or
   gradual rollout (legacy); **psalm** config note (strictest) with its error level.
4. **PHP-CS-Fixer / PHP_CodeSniffer (`.php-cs-fixer.php` / `phpcs.xml`)** — PSR-12 ruleset.
5. **PHPUnit Config (`phpunit.xml`)** — coverage inclusion + threshold.
6. **Coverage Requirements** (keep/extend) — 90% strictest / 50% legacy.
7. **Complexity Limits** (keep) — cognitive/cyclomatic table.
8. **Install** — `composer require --dev phpstan/phpstan vimeo/psalm friendsofphp/php-cs-fixer
   squizlabs/php_codesniffer phpunit/phpunit` (WEB-VERIFIED current package names/versions).
9. **CI Integration** — GitHub Actions (`shivammathur/setup-php@v2` with PHP 8.3),
   `phpstan analyse`, `psalm`, `phpcs`, `phpunit --coverage-text`.

Every added section names ≥ 1 identifier ("PHP 8.3", "PHPStan level 9",
`declare(strict_types=1)`, "psalm", "PHPUnit", "PSR-12"). Every version/level claim
carries an inline dated http source ≥ 2025-01-01 (phpstan.org / psalm.dev / getcomposer
package pages / php.net).

#### File: `tests/cu4b-php-configs.test.js`
**Action:** CREATE. **Framework:** `node:test`. **Zero doubles** — reads the 2 real files
via `fs.readFileSync`.

**Test cases (per php file):**
1. `> 5` `##` sections (both start at 4 — asserting `> 5` proves real additions).
2. `> 90` lines (well past the ~34-line stub floor).
3. required sections: PHPStan, PHP-CS-Fixer OR PHP_CodeSniffer, PHPUnit, Coverage,
   Complexity, Install, CI (case-insensitive regex).
4. names PHP identifiers: `PHP 8\.3` (or a `php8.3`/`8\.3` version token),
   `declare\(strict_types=1\)`, `PHPStan`, a `level \d`, `psalm` (strictest), `PSR-12`.
5. ≥ 4 code fences (`phpstan.neon` + phpcs/cs-fixer + phpunit/CI blocks).
6. ≥ 1 dated source: `20(2[5-9]|[3-9]\d)` token AND `https?://`.
7. **cross-language guard:** must NOT contain Ruby/RuboCop signature tokens (`RuboCop`,
   `frozen_string_literal`, `\.rubocop`, `Gemfile`, `SimpleCov`).
8. gradient guard: strictest contains `level: 9` and `90%`; legacy contains `level: 5`
   and `baseline` and `50%`.

### Test Plan

Step 8 RED: both php files fail `> 5` sections + required-section + identifier assertions
before upgrade. After upgrade all pass; `node --test tests/*.test.js` → `# fail 0`.

### Security Review

- Content-only edits to 2 markdown files + one test file; no runtime path handling.
- Source URLs are official public domains (phpstan.org, psalm.dev, php.net,
  getcomposer.org, github.com) — no secrets.
- Only the 3 enumerated files touched.

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write `tests/cu4b-php-configs.test.js` — reads the 2 REAL files, zero doubles;
      asserts `>5` sections, required sections, PHP identifiers, `>=4` fences, dated http
      source, NO Ruby tokens, gradient tokens.
- [ ] Run — expect RED (both php files fail before upgrade).

### Step 9: PREPARE
- [ ] READ `php/strict.md` (structure template) fresh; skim ruby/strictest for depth only.
- [ ] **WEB-VERIFY at edit time** (no invented versions): current PHPStan version + level
      semantics, psalm current version + error levels, PHP-CS-Fixer + PHP_CodeSniffer PSR-12
      ruleset, PHPUnit current version, PHP 8.3 release facts, `declare(strict_types=1)`
      semantics. Capture each source URL + retrieval date ≥ 2025-01-01.

### Step 10: IMPLEMENT
- [ ] Expand BOTH php configs to `> 5` `##` sections using php/strict STRUCTURE with
      PHP-correct values; keep the level-9-strictest / level-5+baseline-legacy gradient.
      ONE step. No Ruby value copied. Each section names an identifier; each version claim
      inline-dated-sourced.

### Step 11: REVIEW
- [ ] Self-review: gradient correct; no Ruby token; each section identifier-bearing; each
      version sourced; existing PHPStan/coverage/complexity blocks retained.

### Step 12: OPTIMIZE
- [ ] Density at php/strict level; tables where php/strict uses tables; no filler.

### Step 13: SECURE
- [ ] All source URLs official; only the 3 files edited.

### Step 14: VERIFY
- [ ] `node --test tests/cu4b-php-configs.test.js` → GREEN.
- [ ] `node --test tests/*.test.js` → `# fail 0`, 0 skipped.

### Step 15: DOCUMENT
- [ ] Append to `## Decisions Taken Under Ambiguity`: UPGRADED verdict for php/legacy,
      php/strictest; template = php/strict (same-family, structure); each PHPStan/psalm/
      PHPCS/PHPUnit/PHP version with its dated source URL.

### Step 16: FINAL-REVIEW
- [ ] Only the 3 enumerated files changed; nothing fabricated; php/strict + ruby/strictest
      read but NOT edited (no-churn).

## Risk Mitigations

| Risk | Mitigation | Where |
|------|-----------|-------|
| Ruby value leaks into a PHP guide (HIGH) | Test asserts NO `RuboCop`/`frozen_string_literal`/`Gemfile`/`SimpleCov` tokens; extend from php/strict values | Step 10, 11, test |
| Invented PHPStan level / package version | Web-verify at edit time; inline dated official URL | Step 9, 15 |
| Section inflation without depth | Test asserts identifier + `>=4` fences + dated source per file | Step 14 |

## Decisions Taken Under Ambiguity

(To be completed by the executor at Step 15 — must record: the UPGRADED verdict for
php/legacy.md and php/strictest.md; template used = php/strict.md (same-family, STRUCTURE
only; ruby/strictest depth-reference only, no value copied); and each web-verified
PHPStan / psalm / PHP-CS-Fixer / PHP_CodeSniffer / PHPUnit / PHP 8.3 version with its
dated http source URL and retrieval date ≥ 2025-01-01. Never invent a version or level.)
