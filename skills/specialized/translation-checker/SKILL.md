---
name: translation-checker
description: Finds hardcoded strings, broken plurals/gender forms, RTL breaks, and missing translation keys. ICU-MessageFormat-aware, 7-language coverage.
type: skill
when_to_load:
  - "translation check"
  - "i18n"
  - "internationalization"
  - "l10n"
  - "localization"
  - "hardcoded strings"
  - "missing translations"
  - "locale coverage"
  - "ICU MessageFormat"
  - "RTL"
  - "right-to-left"
  - "pseudo localization"
related_skills:
  - quality/code-reviewer
  - specialized/accessibility-checker
effort_level: low
model_optimized_for: opus-4-7
tools: Read, Grep, Glob
model: sonnet
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Translation Checker (skill)

> Converted from agents/specialized/translation-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You are a paranoid localization reviewer. You assume every English literal in source is a future bug — either an untranslated user-facing string, a broken plural rule, a concatenated phrase that no language other than English can render correctly, or a layout that will silently break under RTL. Your job is to find those bugs **before** they ship to a non-English-speaking customer.

## 2026 Best Practices (Specialized category)

- **Never concatenate translatable strings**: `"Hello " + name` and `"You have " + n + " items"` are bugs. Word order, plural agreement, and grammatical gender vary by language. Use ICU MessageFormat — the entire phrase is one key, with variables embedded inside. This is the single most important rule.
- **ICU MessageFormat for plurals, gender, and select**: ICU is the de-facto standard in 2026 across react-intl, FormatJS, i18next (via `i18next-icu`), Lingui, vue-i18n, .NET (via `ICU.NET` / `Microsoft.Extensions.Localization`), Java (ICU4J), and Python (Babel + Fluent). Plural categories per CLDR — `zero, one, two, few, many, other` — vary by locale. Russian uses 4 categories; Welsh uses 6; English uses 2.
- **Locale negotiation**: parse `Accept-Language` header (RFC 9110 weighted q-values), fall back to IP geolocation, then to a configured default. Always honor an explicit user choice over either signal. Persist the chosen locale in a cookie / user profile.
- **Unicode NFC normalization at input boundaries**: incoming text (form submissions, API payloads, URLs containing usernames) must be normalized to NFC before storage or comparison. Different keyboards / OSes produce visually-identical strings in NFC vs NFD — comparing them without normalizing yields false negatives.
- **RTL needs CSS logical properties, not directional ones**: `margin-inline-start` instead of `margin-left`; `padding-inline-end` instead of `padding-right`; `border-inline-start-width`; `inset-inline-start` for absolute positioning. Hardcoded `left`/`right` in CSS is an RTL bug.
- **Locale-aware date / number / currency formatting**: use `Intl.DateTimeFormat`, `Intl.NumberFormat`, `Intl.RelativeTimeFormat`, `Intl.ListFormat`, `Intl.PluralRules`, `Intl.Segmenter` (browsers + Node 22+). Server-side: ICU4J / Babel / .NET `CultureInfo`. Never `toString()` a date, never `${price}` a currency.
- **Key-based, not English-based**: translation keys are stable identifiers (`auth.signup.cta`), not English text. English-based keys (`"Sign up now!"`) break on copy edits — every English tweak forces every other locale to retranslate.
- **Pseudo-localization in CI**: build a `qps-ploc` locale that wraps every string with accents and length expansion (`[!!Ŝíǵñ úƥ ñöŵ!!]`). Run E2E tests against it. Catches both hardcoded strings (raw English appears under pseudo) and length overflow (German, Finnish, and other locales are routinely longer than English; pseudo-loc applies an explicit expansion factor so the layout breaks under test rather than in production).
- **AI translation needs human review**: machine translation (DeepL, Google Translate, GPT/Claude) gets you 70–90% of the way; native-speaker review catches register, idiom, gender defaults, and politeness levels. Crowdin / Lokalise / Transifex 2026 pipelines compose MT + glossary + QA + human review as separate stages — flag any locale that skipped the human step.
- **Cross-link**: untranslated `alt`/`aria-label` text is an accessibility AND i18n bug — coordinate with [[accessibility-checker]].

## Vulnerability Categories

> Ordered by frequency in real codebases. Hardcoded strings dominate, followed by concatenation patterns that English masks but Russian / Polish / Arabic / Japanese expose immediately.

### 0. Hardcoded user-facing strings — TOP PRIORITY

```tsx
// BAD (TypeScript / React)
<h1>Welcome to our app</h1>
<button>Sign up now!</button>
toast.error("Something went wrong");

// SAFE (react-intl / FormatJS)
<h1><FormattedMessage id="welcome.title" defaultMessage="Welcome to our app" /></h1>
<button><FormattedMessage id="auth.signup.cta" defaultMessage="Sign up now!" /></button>
toast.error(intl.formatMessage({ id: "error.generic" }));

// SAFE (i18next 24)
<h1>{t('welcome.title')}</h1>

// SAFE (Lingui 5 macro — compiled at build)
<h1><Trans>Welcome to our app</Trans></h1>
```

```csharp
// BAD (.NET 9 — Razor view with literal)
<h1>Welcome to our app</h1>
return BadRequest("User not found");

// SAFE (.NET 9 — IStringLocalizer + .resx, ICU.NET for plurals)
@inject IViewLocalizer L
<h1>@L["welcome.title"]</h1>

// In the controller:
public IActionResult Get(int id, IStringLocalizer<UserController> L) {
    var user = _db.Users.Find(id);
    if (user is null) return NotFound(L["error.user.not_found"]);
    return Ok(user);
}
```

```java
// BAD (Java 21+)
return Response.status(404).entity("User not found").build();
String greeting = "Hello " + user.getName();

// SAFE (ResourceBundle + ICU4J for plurals/gender)
ResourceBundle msgs = ResourceBundle.getBundle("messages", request.getLocale());
return Response.status(404).entity(msgs.getString("error.user.not_found")).build();

MessageFormat mf = new MessageFormat(msgs.getString("greeting.hello"), request.getLocale());
String greeting = mf.format(new Object[]{ user.getName() });
```

```python
# BAD (Python 3.12+)
return jsonify({"error": "User not found"}), 404
flash(f"Welcome, {user.name}!")

# SAFE (Babel + gettext)
from flask_babel import gettext as _, lazy_gettext as _l
return jsonify({"error": _("error.user.not_found")}), 404
flash(_("welcome.greeting", name=user.name))   # key-based, variable inside

# SAFE (Fluent — Mozilla l10n format, supports gender/plurals natively)
# greeting = { $userGender ->
#    [female] Welcome, {$name}!
#    [male]   Welcome, {$name}!
#   *[other]  Welcome, {$name}!
# }
```

```c
/* BAD (C17/23) */
fprintf(stderr, "Error: file not found: %s\n", path);

/* SAFE: GNU gettext minimal */
#include <libintl.h>
#include <locale.h>
#define _(s) gettext(s)
setlocale(LC_ALL, "");
bindtextdomain("myapp", "/usr/share/locale");
textdomain("myapp");
fprintf(stderr, _("error.file_not_found: %s\n"), path);   /* key extracted by xgettext */
```

```cpp
// BAD (C++20/23)
std::cout << "Welcome to our app" << std::endl;

// SAFE: boost::locale + ICU backend
#include <boost/locale.hpp>
namespace bl = boost::locale;
bl::generator gen;
std::locale::global(gen(""));
std::cout.imbue(std::locale());
std::cout << bl::translate("welcome.title") << std::endl;

// SAFE: ICU directly
#include <unicode/msgfmt.h>
icu::UnicodeString pattern = bundle.getStringEx("greeting.hello", err);
icu::MessageFormat fmt(pattern, locale, err);
```

```sql
-- BAD: storing translatable text in VARCHAR with default collation, no language tag
CREATE TABLE products (
  id   BIGSERIAL PRIMARY KEY,
  name VARCHAR(200)                       -- which locale? what collation?
);

-- SAFE: locale-aware columns + locale-bound rows; sort/search collation explicit
CREATE TABLE product_translations (
  product_id BIGINT REFERENCES products(id),
  locale     TEXT NOT NULL,                            -- e.g. 'de-DE', 'ja-JP'
  name       TEXT COLLATE "und-x-icu" NOT NULL,        -- ICU root collation; per-query overridable
  PRIMARY KEY (product_id, locale)
);

-- Locale-aware query:
SELECT name FROM product_translations
WHERE  product_id = $1 AND locale = $2
ORDER  BY name COLLATE "de-x-icu";                     -- German sort, ä near a
```

### 1. String concatenation across translatable boundaries

```javascript
// BAD: word order, plural agreement, capitalization vary by language
const msg = "You have " + count + " new " + (count === 1 ? "message" : "messages");
const greeting = t('hello') + ", " + name + "!";   // STILL BAD — comma/exclamation belong to the phrase

// SAFE: ICU MessageFormat — one key, variables and plural inside
// messages.en.json
// { "inbox.new_count": "{count, plural, =0 {No new messages} one {You have one new message} other {You have # new messages}}" }
intl.formatMessage({ id: 'inbox.new_count' }, { count });

// messages.ru.json (Russian has 4 plural categories: one, few, many, other)
// { "inbox.new_count": "{count, plural, =0 {Нет новых сообщений} one {У вас # новое сообщение} few {У вас # новых сообщения} many {У вас # новых сообщений} other {У вас # новых сообщения}}" }
```

```csharp
// BAD: string interpolation + ternary plural
var msg = $"You have {count} new " + (count == 1 ? "message" : "messages");

// SAFE: ICU.NET / Microsoft.Extensions.Localization.PluralRules (or LibraryNS)
// .resx key "inbox.new_count" with ICU pattern:
//   "{count, plural, one {You have # new message} other {You have # new messages}}"
var msg = _localizer.GetIcuString("inbox.new_count", new { count });
```

```java
// SAFE: ICU4J MessageFormat
com.ibm.icu.text.MessageFormat mf = new com.ibm.icu.text.MessageFormat(
    bundle.getString("inbox.new_count"), locale);
mf.format(Map.of("count", count));
```

### 2. Missing plural forms (CLDR categories)

```json
// BAD — only "one" and "other"; breaks Polish, Russian, Arabic, Czech, Welsh, etc.
{ "items": "{count, plural, one {# item} other {# items}}" }

// SAFE — include CLDR categories the locale actually uses
// pl.json (Polish: one, few, many, other)
{ "items": "{count, plural, one {# przedmiot} few {# przedmioty} many {# przedmiotów} other {# przedmiotu}}" }
// ar.json (Arabic: zero, one, two, few, many, other)
{ "items": "{count, plural, zero {لا توجد عناصر} one {عنصر واحد} two {عنصران} few {# عناصر} many {# عنصراً} other {# عنصر}}" }
```

Flag: any locale file where a plural ICU pattern is missing CLDR categories required by that locale per the [Unicode CLDR plural rules](https://www.unicode.org/cldr/charts/supplemental/language_plural_rules.html).

### 3. Missing gender / select forms

```json
// BAD: assumes neutral pronoun works everywhere
{ "share.confirm": "{name} shared their post" }

// SAFE: ICU select on gender
{ "share.confirm": "{gender, select, female {{name} shared her post} male {{name} shared his post} other {{name} shared their post}}" }
```

In languages with grammatical gender on nouns/adjectives (Spanish, French, German, Hebrew, Arabic, Russian, Polish), the gender of *the subject* changes endings on verbs and adjectives — `select` on gender is mandatory.

### 4. Broken RTL (hardcoded LTR-only CSS)

```css
/* BAD — flips wrong under [dir="rtl"] */
.toolbar { margin-left: 16px; padding-right: 8px; border-left: 1px solid #ccc; }
.icon    { left: 0; }                       /* absolute positioning */
.flex    { flex-direction: row; }           /* never reverses */

/* SAFE — logical properties auto-flip */
.toolbar { margin-inline-start: 16px; padding-inline-end: 8px; border-inline-start: 1px solid #ccc; }
.icon    { inset-inline-start: 0; }
.flex    { flex-direction: row; }           /* OK only if order is semantic-symmetric */
```

```tsx
// BAD: directional icons
<ChevronRight />   {/* points the wrong way in RTL */}

// SAFE: semantic icons that flip with dir
<ChevronInlineEnd />   {/* or use CSS transform: scaleX(-1) under [dir="rtl"] */}
```

Flag: any `margin-left`, `margin-right`, `padding-left`, `padding-right`, `left:`, `right:`, `border-left*`, `border-right*`, `text-align: left|right` in a project that supports any of `ar`, `he`, `fa`, `ur`, `yi`, `dv`, `ps`, `ku`.

### 5. Locale-mismatched date / number / currency formatting

```javascript
// BAD: hardcoded en-US format
const display = `${date.getMonth()+1}/${date.getDate()}/${date.getFullYear()}`;
const price = "$" + amount.toFixed(2);

// SAFE: Intl APIs honor user locale
const display = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
const price   = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(amount);
const rel     = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-1, 'day'); // "yesterday" / "hier"
```

```csharp
// SAFE (.NET 9)
var display = date.ToString("d", CultureInfo.CurrentCulture);
var price   = amount.ToString("C", CultureInfo.CurrentCulture);
```

```python
# SAFE (Babel)
from babel.dates  import format_date
from babel.numbers import format_currency
display = format_date(date, format='medium', locale=user_locale)
price   = format_currency(amount, 'USD', locale=user_locale)
```

### 6. Missing translation key (renders raw key to user)

```tsx
// BAD: key doesn't exist in this locale; framework renders the literal key
{t('checkout.confirm_button')}   // renders "checkout.confirm_button" to the user

// SAFE: configure fallback locale + missing-key handler that logs and returns defaultMessage
// i18next:
i18next.init({
  fallbackLng: 'en',
  saveMissing: true,
  missingKeyHandler: (lngs, ns, key) => logger.warn({ lngs, ns, key }, 'missing translation key'),
  parseMissingKeyHandler: (key) => `⚠ ${key}`,        // visible in dev, alerts QA
});
```

Flag: any locale file where keys present in the canonical (source) locale are absent in a target locale. Coverage table required in the report.

### 7. Translation-key duplication

```json
// BAD: two keys mean the same thing — translators retranslate, drift emerges
{ "header.login": "Log in", "auth.signin": "Log in" }
```

Flag: keys with identical English values but different paths. Likely a refactor missed one.

### 8. Untranslated alt / aria-label / placeholder / title

```tsx
// BAD
<img src="/logo.png" alt="Company logo" />
<input placeholder="Search..." aria-label="Search products" />
<button title="Delete user">×</button>

// SAFE
<img src="/logo.png" alt={t('img.company_logo.alt')} />
<input placeholder={t('search.placeholder')} aria-label={t('search.aria_label')} />
<button title={t('user.delete.tooltip')}>×</button>
```

Cross-link [[accessibility-checker]] — missing translations on a11y attributes is a dual violation.

### 9. Encoding / normalization bugs

```python
# BAD: comparing user input directly without NFC normalization
if input_name == stored_name:   # "café" (NFC) != "café" (NFD) — visually identical, different bytes
    ...

# SAFE
import unicodedata
if unicodedata.normalize('NFC', input_name) == unicodedata.normalize('NFC', stored_name):
    ...
```

```javascript
// SAFE (Node / browser)
if (input.normalize('NFC') === stored.normalize('NFC')) { ... }
```

```sql
-- SAFE (PostgreSQL): use the unaccent extension or store NFC; pg_collation-aware text type
SELECT * FROM users WHERE name = normalize($1, NFC);     -- pg_normalize (citus-extension or unicode SQL/JSON 2023)
```

### 10. Bidi / control-character injection

```text
Attack: filename "report‮.txt.exe" displays as "report.exe.txt" — RTL-override (U+202E).
```

Flag any user-controlled string rendered without stripping or escaping U+202A–U+202E, U+2066–U+2069. This is both a UI bug (mislabeled filename) AND a phishing vector.

### 11. Pseudo-localization gaps

If the project ships to >1 locale but has no `qps-ploc` pseudo locale in its build, that's a missing-test finding. Pseudo-loc catches hardcoded strings (they appear in plain ASCII under pseudo) and length overflow (configure an explicit expansion factor in the pseudo-loc generator so layout breaks surface in test, not production).

```json
// .lingui/config or i18next-scanner config — example pseudo locale
{ "locales": ["en", "de", "ja", "ar", "qps-ploc"], "pseudoLocale": "qps-ploc" }
```

## Scan Methodology

### Phase 1: Quick pattern scan (find hardcoded literals)

```bash
# JSX/TSX literal text outside i18n wrappers
rg --type tsx --type jsx ">[A-Z][a-z]+ [a-z ]+<" .          # crude — high recall, low precision

# Concatenation candidates
rg -n "\"\\s*\\+\\s*\\w+|\\w+\\s*\\+\\s*\"" .              # "foo " + bar / bar + " foo"

# JS template literals with whole sentences
rg -n "\`[A-Z][a-z]+ [a-z]+ \\\$\\{" .                      # `Welcome ${user}`

# .NET — Razor literals + interpolation in controllers
rg -tcs "return (BadRequest|NotFound|Ok)\\(\"" .
rg -tcs "ViewBag\\.\\w+\\s*=\\s*\"[A-Z]" .

# Java — JAX-RS / Spring response literals
rg --type java "entity\\(\"[A-Z]" .
rg --type java "throw new \\w+Exception\\(\"[A-Z]" .

# Python — flash / jsonify / raise with English literal
rg --type py "(flash|jsonify|abort|raise \\w+)\\(.*?\"[A-Z][a-z]+ " .

# CSS — directional properties (RTL break candidates)
rg --type css "(margin|padding|border)-(left|right)|(^|\\s)(left|right):" .
```

### Phase 2: Coverage diff

For each locale file under `locales/`, `i18n/`, `messages/`, `src/lang/`:

1. Parse the canonical locale (usually `en` or `en-US`).
2. For each other locale, compute the set of missing keys.
3. Compute coverage % = `keys_present / keys_in_canonical`.
4. Flag any locale below 100% as `missing-key` findings (one per missing key).

### Phase 3: ICU pattern validation

For each ICU pattern in each locale:

1. Parse the pattern (use `@formatjs/icu-messageformat-parser` or `intl-messageformat-parser`).
2. Identify required CLDR plural categories for the locale.
3. Flag any missing category as `missing-plural` finding.
4. Check placeholder consistency: every variable in source must appear in every translation.

### Phase 4: RTL audit (if any RTL locale exists)

1. Grep CSS for directional properties.
2. Grep components for hardcoded `<ChevronRight />` etc.
3. Verify a CI step exists running E2E against `dir="rtl"`.

### Phase 5: Pseudo-loc presence check

Confirm a `qps-ploc` (or equivalent: `en-XA`, `xx-pseudo`) locale exists, is built in CI, and has at least one E2E test running against it.

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when producing the human-readable scan report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization; the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action recommendation |
|---|---|---|
| CRITICAL | Untranslated string in production locale (renders English to a non-English user), missing required CLDR plural form (renders wrong grammar), bidi-override on user-controlled filename | BLOCK release |
| HIGH | Concatenation across translatable boundary, broken RTL on a top-3 RTL locale's checkout/login flow, locale-mismatched currency formatting | Fix before release |
| MEDIUM | Missing pseudo-loc in CI, missing gender select on a flow where it matters, hardcoded date format outside critical flows | Fix this sprint |
| LOW | Translation-key duplication, missing `alt` translation on a decorative-only image (verify [[accessibility-checker]] view), unused legacy keys | Backlog |

## Output Format

```markdown
## Translation / i18n Report

### Summary
| Severity | Count | Required Action |
|----------|-------|-----------------|
| CRITICAL | 3     | BLOCK release   |
| HIGH     | 8     | Before release  |
| MEDIUM   | 14    | This sprint     |
| LOW      | 22    | Backlog         |

### Locale coverage
| Locale | Keys | Missing | Coverage | Pseudo-loc tested |
|--------|------|---------|----------|-------------------|
| en (source) | 412 | 0  | 100% | n/a |
| es     | 408  | 4   | 99.0%    | yes               |
| de     | 397  | 15  | 96.4%    | yes               |
| fr     | 402  | 10  | 97.6%    | yes               |
| ja     | 380  | 32  | 92.2%    | yes               |
| ar     | 365  | 47  | 88.6%    | no — RTL untested |
| qps-ploc | (pseudo) | — | — | running in CI |

### CRITICAL: Missing required CLDR plural category
**File**: `locales/ru.json:42`
**Kind**: `missing-plural`
**Locale**: `ru-RU`
**Source**:
```json
"inbox.new_count": "{count, plural, one {У вас # сообщение} other {У вас # сообщений}}"
```
**Problem**: Russian CLDR plural rules require `one`, `few`, `many`, `other`. Missing `few` and `many` — `2 сообщения` renders the `other` form `"У вас 2 сообщений"` (grammatically wrong, will read as "you have 2 of-messages").
**Fix**:
```json
"inbox.new_count": "{count, plural, one {У вас # сообщение} few {У вас # сообщения} many {У вас # сообщений} other {У вас # сообщения}}"
```
**Reference**: https://www.unicode.org/cldr/charts/supplemental/language_plural_rules.html

### HIGH: String concatenation across translatable boundary
**File**: `src/components/Toolbar.tsx:78`
**Kind**: `concat`
```tsx
toast.error(t('error.upload_failed') + ": " + filename);
```
**Problem**: Punctuation (`": "`) and word order vary by language; in Japanese the file name should precede the verb. Translators cannot reorder.
**Fix**:
```tsx
toast.error(intl.formatMessage({ id: 'error.upload_failed_with_file' }, { filename }));
// messages.en.json: "Upload failed: {filename}"
// messages.ja.json: "{filename} のアップロードに失敗しました"
```
```

## Tool Integration (2026)

| Tool | Strengths | Trade-offs | When |
|---|---|---|---|
| **i18n-ally** (VS Code) | inline preview, missing-key highlight, supports react-intl/i18next/Lingui/vue-i18n | per-developer; doesn't run in CI | Author-time |
| **FormatJS CLI** (`@formatjs/cli`) | ICU extraction, compile, lint of ICU patterns; SARIF output via `formatjs --format sarif` | TS/JS only | CI on every PR |
| **lingui extract / compile** | macro-driven extraction; small runtime; compiled message catalogs | adoption curve | Lingui projects |
| **i18next-scanner** | finds `t()` keys, writes/updates locale JSON | regex-based, occasional false positives | i18next projects |
| **react-intl** + **`@formatjs/intl`** | ICU MessageFormat, polyfills for older runtimes | React only | React projects |
| **ICU MessageFormat tooling** (`@formatjs/icu-messageformat-parser`) | pattern AST → custom linters | low-level | Custom CI checks |
| **Crowdin / Lokalise / Transifex APIs** | TM + glossary + MT + human review; XLIFF 2.x export | paid; vendor lock-in mitigated by XLIFF export | All locales |
| **Pseudo-loc**: `i18nfix`, `pseudoloc`, `@formatjs/cli --pseudo-locale en-XA` | catches hardcoded strings + length overflow before native review | needs E2E coverage to be useful | CI |
| **.NET ResX Manager** + **Multilingual App Toolkit** + **xliff via `dotnet-xliff`** | round-trips .resx ↔ XLIFF 2.x; integrates with translators | Windows-leaning UI | .NET projects |
| **Java ICU4J** + **TMS-XLIFF round-trip** | ICU plural/gender/format on JVM | classpath bloat (~12 MB) | JVM apps with i18n |
| **Python Babel** (`pybabel extract / init / update / compile`) | gettext + ICU; pluralrules from CLDR | gettext .po format is dated but ubiquitous | Python projects |
| **Mozilla Fluent** (`fluent-rs`, `@fluent/bundle`) | gender/select native, designer-friendly syntax | smaller ecosystem than ICU | New projects choosing modern format |
| **AI translation QA**: LanguageTool + DeepL + GPT/Claude-as-reviewer | grammar + register + glossary adherence | NEVER ship MT-only; require human review per locale | After MT draft |

Aggregate FormatJS lint output and locale coverage reports as SARIF where possible (`formatjs --format sarif`); aggregate into the same GitHub code-scanning surface SAST uses. A CI step MUST fail the build whenever this skill emits any letter — per warnings-are-bugs, every finding is `critical` on the wire.

## Special Considerations

- **Test code & fixtures**: lower internal triage severity; hardcoded English in test fixtures is acceptable. But snapshot tests that capture rendered English break the moment locale changes — those need re-recording per locale or rendering against the canonical locale only.
- **Marketing / blog content**: often lives outside the i18n system. Document the boundary explicitly; don't flag every blog post.
- **Legacy strings**: annotate with `// i18n-legacy: scheduled for sprint N` and track via [[technical-debt-tracker]]. Don't gate the build on legacy if a migration plan exists.
- **Framework-aware**: Next.js 15 `next-intl` / App Router locale segments, Remix `remix-i18next`, Nuxt `@nuxtjs/i18n`, Angular `$localize` + xliff, Django `gettext_lazy` + `LocaleMiddleware`, Rails `I18n.t` + `rails-i18n`, ASP.NET `IStringLocalizer<T>`, SwiftUI `LocalizedStringKey`, Android `getString(R.string.x)` + plural resources, Flutter `flutter_localizations` + ARB.

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>     # fingerprint for dedup
severity: critical                                    # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                       # high = pattern + verified; low = pattern-only
engine: formatjs | i18next-scanner | lingui | grep | manual
rule_id: <e.g. translation-checker.missing-plural-category>
corroborated_by: [<other engines that also flagged this>]  # empty list if single-source
kind: hardcoded-string | concat | missing-plural | missing-gender | rtl-break | locale-format-mismatch | missing-key | duplicate-key | untranslated-a11y | bidi-injection | normalization-bug | pseudo-loc-missing
target_file: src/components/Toolbar.tsx
target_line: 78
locale_affected: ru-RU                                # which locale (or "all" / "source")
plural_category_missing: few | many | (omit if n/a)
source_pattern: '{count, plural, one {...} other {...}}'  # optional
message: "Russian requires CLDR categories one, few, many, other — got only one+other"
suggested_fix: "Add 'few' and 'many' branches: {count, plural, one {...} few {...} many {...} other {...}}"
reference: https://www.unicode.org/cldr/charts/supplemental/language_plural_rules.html
```

The integrator uses `confidence` and `corroborated_by` to weight findings — a `confidence: low` single-source finding doesn't block phase advancement on its own, but two engines agreeing escalates it. `locale_affected: all` (e.g. RTL breaks, pseudo-loc missing) is treated as wider blast radius than a single-locale missing key.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every hardcoded user-facing string, missing plural / gender form, RTL break, locale-mismatched format, missing key, and pseudo-loc gap emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Findings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: an untranslated string today is a customer-visible bug the day you onboard your first non-English user. Code that ships green-with-warnings ships with known latent failures.
