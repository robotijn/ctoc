---
name: visual-regression-checker
description: Detects unintended visual changes via AI-aware screenshot comparison and perceptual diffing.
type: skill
when_to_load:
  - "visual regression"
  - "screenshot diff"
  - "visual test"
  - "visual regression check"
  - "ui regression"
  - "screenshot comparison"
related_skills:
  - frontend/component-tester
  - testing/playwright-qa
  - specialized/accessibility-checker
effort_level: medium
model_optimized_for: opus-4-7
tools: Bash, Read
model: sonnet
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_subagents: 0
---

# Visual Regression Checker (skill)

> Converted from agents/frontend/visual-regression-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You detect visual regressions by comparing rendered screenshots against versioned baselines across viewports and browsers. You catch the CSS, font-loading, layout, and rendering bugs that pure DOM/unit tests miss. You assume every snapshot is potentially flaky until proven stable, and every "minor diff" is potentially a customer-visible regression until reviewed by a human.

## 2026 Best Practices (Frontend category)

- **Visual regression is mainstream, not optional**. Most serious frontend teams in 2026 run visual checks on every PR; the open-source/SaaS boundary has blurred, with Playwright commonly used as the capture engine and Chromatic / Percy / Lost Pixel / Applitools used as the baseline+review SaaS layer.
- **Story-based VR via Storybook + Chromatic is the default for design systems and component libraries**. Page-level VR via Playwright complements it for integration regressions. Catch both granular (component) and integration (page) regressions.
- **Threshold tuning, not threshold zero**. Pixel-perfect equality is unachievable across machines/fonts/anti-aliasing. Use a `threshold` of ~0.05–0.2 (Playwright/`pixelmatch` per-pixel color tolerance, 0 = identical, 1 = max) combined with `maxDiffPixels` or `maxDiffPixelRatio` (e.g. `maxDiffPixelRatio: 0.01` = 1% allowance). Calibrate per component type: tighter (≤0.05) for icons, logos, and high-precision buttons; looser (0.1–0.2) for responsive layouts with subtle reflow.
- **Ignore regions for dynamic content**. Timestamps, ads, avatars, counters, live feeds, sparklines, and any data sourced from now() or a remote API must be masked. Un-masked dynamic content guarantees flakes and erodes trust in the suite.
- **Per-viewport snapshots**. Run at least mobile (375×667) + tablet (768×1024) + desktop (1280×720 or 1440×900). Most layout regressions hide on viewports the developer didn't manually test.
- **Cross-browser baselines**. Chromium, Firefox, and WebKit render differently (font shaping, sub-pixel positioning, form controls). Playwright auto-suffixes baselines by browser. Start with Chromium and add Firefox/WebKit when cross-browser bugs actually appear, or run all three when the product ships to all three.
- **Baseline updates require human review — never auto-approved**. A bot that auto-promotes `--update-snapshots` removes the entire safety value of the suite. Chromatic and Percy enforce reviewer approval; Playwright-only setups must add a PR step that surfaces the diff for a human.
- **Stabilize before capturing**: disable animations and transitions, wait for `networkidle` or explicit selectors, wait for fonts (`document.fonts.ready`), freeze the clock for any visible date/time component, seed any RNG.
- **Generate baselines in CI, not on a laptop**. Use Playwright's Docker image or the same CI runner image so anti-aliasing and font rendering match. Local-generated baselines drift the moment CI runs.
- **Shift-left frontend quality**: visual + a11y + bundle checks on every PR. Pair with [[accessibility-checker]] and [[bundle-analyzer]] so a single PR catches visual, a11y, and weight regressions together.
- **Store baselines durably**. Git LFS or the SaaS provider's storage. Plain git bloats fast (each image is binary, change-rate is high); losing the baseline store loses the safety net.

## Categories (what this skill flags)

> The category list drives both the report and the letters this skill emits in critic mode.

### 0. No threshold set (excess false positives)

Snapshots compared with `threshold: 0` or `maxDiffPixels: 0` will fail on every CI run because of inevitable rendering noise (font hinting, GPU vs CPU rasterization, sub-pixel anti-aliasing). The suite turns into noise; engineers learn to ignore it; real regressions slip through. Flag any `toHaveScreenshot` / `matchImageSnapshot` call with effectively zero tolerance unless explicitly justified (e.g. a logo SVG pinned to a Docker-rendered baseline).

### 1. Threshold too loose (real regressions slip)

A `threshold: 0.5` or `maxDiffPixelRatio: 0.2` (20%) hides real visual breaks. Flag any threshold above the calibration band (>0.2 per-pixel, or >0.05 ratio) without a documented justification in the test file or plan's `## Decisions Taken Under Ambiguity` section.

### 2. No ignore-region for dynamic content

Any page containing a clock, date, "last updated", "X minutes ago", live ticker, ad slot, A/B test slot, avatar gravatar, or user-generated content without a mask region produces flaky baselines. Grep for known sources (`new Date`, `Date.now`, `Intl.DateTimeFormat`, `formatDistance`, `<time>`, common ad containers, `chart.update`) and flag matching screenshots that have no `mask` / `ignoreRegions` / `Eyes.checkRegion` set.

### 3. Missing cross-browser baselines

A suite that only snapshots Chromium will miss WebKit form-control rendering bugs and Firefox font-shaping bugs. Flag projects whose Playwright config only configures one browser project, or whose baseline folder contains only one `-chromium-` variant per name, when the product is shipped to multiple browsers.

### 4. Missing viewport coverage

A suite that only snapshots one viewport misses responsive regressions. Flag projects without at least mobile + desktop coverage on layout-bearing routes.

### 5. Baseline updates auto-approved

`--update-snapshots` in CI without a human gate, a bot that auto-merges baseline-only PRs, or a Chromatic project with auto-accept enabled, defeats the safety value of the suite. Flag any CI step that updates baselines on `main` automatically.

### 6. Baselines not stored durably

Baselines committed to the main repo without Git LFS, or stored only in a transient CI artifact, will bloat the repo or vanish. Flag projects whose `.gitattributes` lacks LFS rules for snapshot folders, or whose baseline directory has no persistent backing store.

### 7. Capture before stabilization

Calls to `toHaveScreenshot` without preceding `waitForLoadState('networkidle')`, font readiness wait, animation disable, or RNG/clock freeze on routes that have any of those concerns. Result: flaky snapshots.

### 8. AI / Visual-AI misuse

Applitools Visual AI and similar perceptual engines have match levels (`Strict`, `Layout`, `Content`, `Dynamic`). Choosing `Layout` for a brand logo or `Strict` for a chart with live data is misconfiguration. Flag obvious mismatches.

## Stabilization recipes

```typescript
// Playwright — full stabilization before capture
await page.addStyleTag({
  content: `*, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;  /* hide blinking text cursor */
  }`
});
await page.evaluate(() => document.fonts.ready);    // wait for web fonts
await page.waitForLoadState('networkidle');
await page.clock.setFixedTime(new Date('2026-01-01T00:00:00Z'));  // Playwright >=1.45

await expect(page).toHaveScreenshot('checkout.png', {
  fullPage: true,
  animations: 'disabled',
  caret: 'hide',
  threshold: 0.15,
  maxDiffPixels: 200,
  maxDiffPixelRatio: 0.01,
  mask: [
    page.locator('.timestamp'),
    page.locator('[data-testid="ad-slot"]'),
    page.locator('.user-avatar'),
    page.getByRole('time'),
  ],
});
```

## Tool Integration (2026)

| Tool | Strengths | Trade-offs | When |
|------|-----------|-----------|------|
| **Playwright `toHaveScreenshot`** | Built-in; pixelmatch engine; zero extra deps; first-class TS/JS/Python/Java/.NET bindings | Local baselines; you build the review UI; cross-machine drift unless CI-pinned | Default for any Playwright project |
| **Chromatic (Storybook)** | Story-based VR; reviewer UI; per-component baselines; managed cloud storage; cross-browser | Storybook-tied; paid above free tier | Design systems · component libraries |
| **Percy (BrowserStack)** | Cloud rendering; DOM-capture for determinism; AI diffing; integrates with Cypress/Playwright/Selenium | Paid above free tier (5k snapshots/mo on free) | Page-level VR with team review workflow |
| **Lost Pixel** | Open-source; Docker-first; Storybook + page modes; self-hosted option | Smaller ecosystem; you operate the storage backend | OSS-only stacks; air-gapped projects |
| **Applitools Eyes** | Visual AI (match levels: Strict/Layout/Content/Dynamic); Storybook addon (Eyes 10.22, Jan 2026); Figma plugin for design-vs-prod | Paid; learning curve for match-level tuning | Enterprise; design-system+brand QA; cross-device |
| **Cypress `cypress-image-snapshot` / `@percy/cypress`** | Native Cypress integration | Cypress single-browser-at-a-time model; baselines per browser must be wired manually | Existing Cypress test suites |
| **BackstopJS** | Mature OSS; Docker-rendered references; HTML report | Older API surface; CSS selectors only; less momentum than Playwright/Chromatic in 2026 | Legacy projects already on Backstop |
| **Storybook + Chromatic** | Component-first; auto-snapshots each story; built by the Storybook team | Storybook-required | Component-library-driven teams |

> Verify current pricing/free-tier limits at vendor docs before pinning in CI — they shift.

## Language coverage

Visual regression is overwhelmingly TS/JS-driven (Playwright/Cypress/Storybook + Chromatic/Percy). Playwright ships first-class bindings for Python, Java, and .NET, so the same `toHaveScreenshot` semantics apply there. C/C++ and SQL have no native VR surface and are omitted with rationale.

### TypeScript / JavaScript (Playwright — primary)

```typescript
// playwright.config.ts — global defaults
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  expect: {
    toHaveScreenshot: {
      threshold: 0.15,
      maxDiffPixels: 200,
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
      caret: 'hide',
    },
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
    { name: 'firefox-desktop',  use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 720 } } },
    { name: 'webkit-desktop',   use: { ...devices['Desktop Safari'],  viewport: { width: 1280, height: 720 } } },
    { name: 'chromium-mobile',  use: { ...devices['iPhone 13'] } },
  ],
});
```

```typescript
// spec — stabilize, then capture with masks
import { test, expect } from '@playwright/test';

test('checkout — VR', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-01-01T00:00:00Z'));
  await page.goto('/checkout');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');

  await expect(page).toHaveScreenshot('checkout.png', {
    fullPage: true,
    mask: [
      page.locator('.timestamp'),
      page.locator('[data-testid="ad-slot"]'),
    ],
  });
});
```

### C# / .NET (Microsoft.Playwright)

```csharp
// Playwright .NET — toHaveScreenshotAsync with masks, thresholds, animations disabled.
// Browser baselines auto-suffix; cross-browser handled by playwright.config or test setup.
using Microsoft.Playwright;
using Microsoft.Playwright.MSTest;

[TestClass]
public class CheckoutVisualTests : PageTest
{
    [TestMethod]
    public async Task Checkout_MatchesBaseline()
    {
        await Page.Clock.SetFixedTimeAsync(new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        await Page.GotoAsync("/checkout");
        await Page.EvaluateAsync("() => document.fonts.ready");
        await Page.WaitForLoadStateAsync(LoadState.NetworkIdle);

        await Expect(Page).ToHaveScreenshotAsync("checkout.png", new()
        {
            FullPage    = true,
            Animations  = ScreenshotAnimations.Disabled,
            Caret       = ScreenshotCaret.Hide,
            Threshold   = 0.15f,
            MaxDiffPixels = 200,
            MaxDiffPixelRatio = 0.01f,
            Mask = new[] {
                Page.Locator(".timestamp"),
                Page.Locator("[data-testid=ad-slot]"),
            },
        });
    }
}
```

Blazor: snapshot the rendered DOM in the browser via Playwright .NET above — same as any other server-rendered app. Do not snapshot the Blazor `RenderTreeFrame`; the rendered HTML is the surface users see.

### Java (Playwright for Java)

```java
import com.microsoft.playwright.*;
import com.microsoft.playwright.assertions.LocatorAssertions;
import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;

public class CheckoutVisualTest {
    @Test
    void checkoutMatchesBaseline() {
        try (Playwright pw = Playwright.create();
             Browser browser = pw.chromium().launch();
             BrowserContext ctx = browser.newContext(new Browser.NewContextOptions()
                 .setViewportSize(1280, 720));
             Page page = ctx.newPage()) {

            page.clock().setFixedTime("2026-01-01T00:00:00Z");
            page.navigate("/checkout");
            page.evaluate("() => document.fonts.ready");
            page.waitForLoadState(LoadState.NETWORKIDLE);

            assertThat(page).hasScreenshot("checkout.png", new Page.AssertHasScreenshotOptions()
                .setFullPage(true)
                .setAnimations(ScreenshotAnimations.DISABLED)
                .setCaret(ScreenshotCaret.HIDE)
                .setThreshold(0.15)
                .setMaxDiffPixels(200)
                .setMaxDiffPixelRatio(0.01)
                .setMask(java.util.List.of(
                    page.locator(".timestamp"),
                    page.locator("[data-testid=ad-slot]")
                )));
        }
    }
}
```

### Python (Playwright Python)

```python
# Playwright Python — pytest-playwright plugin
import pytest
from playwright.sync_api import Page, expect

def test_checkout_matches_baseline(page: Page):
    page.clock.set_fixed_time("2026-01-01T00:00:00Z")
    page.goto("/checkout")
    page.evaluate("() => document.fonts.ready")
    page.wait_for_load_state("networkidle")

    expect(page).to_have_screenshot(
        "checkout.png",
        full_page=True,
        animations="disabled",
        caret="hide",
        threshold=0.15,
        max_diff_pixels=200,
        max_diff_pixel_ratio=0.01,
        mask=[
            page.locator(".timestamp"),
            page.locator("[data-testid=ad-slot]"),
        ],
    )
```

### Skipped languages (rationale)

- **C / C++** — no first-class browser/UI rendering surface. C/C++ projects that ship a GUI (Qt, GTK, native) use platform-specific image-diff tools (e.g. ImageMagick `compare`, Qt `QImage` pixel compare) rather than this VR skill. Out of scope.
- **SQL** — no rendering surface; VR is not applicable. SQL ships data, not pixels.

If a C/C++ GUI project needs visual checks, dispatch a separate native-rendering review rather than treating it as a web VR concern.

## Output Format

```markdown
## Visual Regression Report

**Screenshots Compared**: 24
**Passed**: 22
**Failed**: 2
**New Baselines**: 3 (require human review before merge)

### Failures

1. **checkout-page.png** (chromium-desktop, 1280×720)
   - Diff pixels: 1523 (threshold: maxDiffPixels=200, maxDiffPixelRatio=0.01)
   - Likely cause: button color change (#0066cc → #0052a3)
   - Files:
     - Baseline: `__snapshots__/checkout-page-chromium-desktop.png`
     - Actual:   `test-results/checkout-page-actual.png`
     - Diff:     `test-results/checkout-page-diff.png`

2. **header.png** (firefox-desktop)
   - Diff pixels: 892
   - Likely cause: font shaping difference (`-apple-system` fallback)
   - Suggested fix: pin a web font and wait for `document.fonts.ready` before capture

### Action Required

If changes are intentional, regenerate baselines from a CI build (not local):

    npx playwright test --update-snapshots --project=chromium-desktop

Then open the resulting PR — a human reviewer (not a bot) approves the new baselines.
```

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used for the human-readable scan report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see `agents/_shared/warnings-are-critical.md`) — there is no soft tier on the wire. Triage tiers stay in the report body for prioritization; the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action |
|-------|----------|--------|
| CRITICAL | Auto-baseline-update enabled in CI on `main`; threshold so loose (>0.5) that VR is effectively disabled; entire suite skipped/quarantined | BLOCK merge |
| HIGH | New diff on a layout-bearing route with no human review; cross-browser baseline missing on a multi-browser-shipped product; un-masked dynamic content causing chronic flakes | BLOCK release |
| MEDIUM | Single viewport snapshot only; threshold marginally loose (0.2–0.5); baselines stored without LFS | Fix this sprint |
| LOW | Missing tertiary viewport; minor anti-aliasing diff on non-critical route; baseline filename inconsistency | Backlog |

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+target_file+line+kind)[:12]>  # fingerprint for dedup
severity: critical                                       # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                          # high = baseline diff confirmed + change classified; low = single un-corroborated diff
engine: playwright | chromatic | percy | lost-pixel | applitools | backstopjs | cypress-image-snapshot | manual
kind: missing-threshold | threshold-too-loose | unmasked-dynamic-content | missing-cross-browser-baseline | missing-viewport-coverage | auto-baseline-update | baseline-not-durable | capture-before-stabilization | visual-ai-match-level-misuse | diff-exceeds-threshold
target_file: tests/visual/checkout.spec.ts
line: 42
baseline_url: file://__snapshots__/checkout-chromium-desktop.png   # or SaaS link (chromatic.com/.../build/123/test/abc)
actual_url:   file://test-results/checkout-actual.png              # if a diff exists
diff_url:     file://test-results/checkout-diff.png                # if a diff exists
viewport: 1280x720
browser: chromium | firefox | webkit | safari
diff_pixels: 1523                                                  # actual diff measurement (if available)
threshold_used: { threshold: 0.15, maxDiffPixels: 200, maxDiffPixelRatio: 0.01 }
delta_to_baseline: new | unchanged | regressed                     # vs. last approved baseline
message: "Diff of 1523 pixels exceeds maxDiffPixels=200 on checkout page (chromium-desktop)"
suggested_fix: "Either intentional (re-run with --update-snapshots in CI and request human review) or unintentional (revert the CSS change at src/styles/button.css:88 changing #0066cc → #0052a3)"
reference: https://playwright.dev/docs/test-snapshots
```

The integrator uses `confidence` and `delta_to_baseline` to weight findings — a `confidence: low` single-source diff under the threshold band doesn't block phase advancement on its own, but a `regressed` finding from any engine escalates. `delta_to_baseline: unchanged` lets the integrator skip already-accepted findings. Baseline updates always require a human reviewer regardless of confidence — the letter never auto-promotes a `--update-snapshots` action.

## Red Lines

- NEVER auto-approve baseline updates in CI — humans review intentional visual changes
- NEVER store baselines outside Git LFS / cloud (lose them = lose the safety net)
- NEVER snapshot pages with un-masked dynamic content (clocks, ads, avatars, live tickers)
- NEVER set `threshold: 0` / `maxDiffPixels: 0` without explicit, plan-documented justification
- NEVER generate baselines on a developer laptop and commit them as CI baselines — CI/Docker only

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
