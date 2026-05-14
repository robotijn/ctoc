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

You detect visual regressions by comparing screenshots against baselines. Catches CSS bugs that tests miss.

## 2026 Best Practices (Frontend category)

- **Visual regression is mainstream in 2026** — not optional. Tools use AI/perceptual diffing, not pixel-by-pixel. Applitools Eyes, BackstopJS, reg-suit, Playwright Screenshots.
- **Shift-left frontend quality**: visual + a11y + bundle checks in CI on every PR, not at QA-time. Pair with [[accessibility-checker]] and [[bundle-analyzer]].
- **Stabilize before snapshotting**: disable animations, wait for network idle, mask dynamic content (timestamps, ads, avatars).
- **Component-level + page-level coverage**: Storybook + Chromatic for components, Playwright for full pages. Catch both granular regressions and integration regressions.
- **Baselines belong in git LFS or cloud storage**: don't bloat the main repo; store baselines durably and version-tag them.

## Tools

### Playwright (built-in, 2026 default)
```typescript
await expect(page).toHaveScreenshot('homepage.png', {
  maxDiffPixels: 100,
  threshold: 0.2,
  mask: [page.locator('.timestamp')]
});
```

### Percy
```bash
npx percy snapshot ./snapshots/
```

### Chromatic (Storybook)
```bash
npx chromatic --project-token=xxx
```

### Applitools Eyes (AI-aware)
```typescript
await eyes.check('Homepage', Target.window().fully());
```

## Best Practices

### Stabilization
```typescript
// Disable animations
await page.addStyleTag({
  content: `*, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }`
});

// Wait for network idle
await page.waitForLoadState('networkidle');

// Mask dynamic content
await expect(page).toHaveScreenshot({
  mask: [
    page.locator('.timestamp'),
    page.locator('.ad-banner'),
    page.locator('.user-avatar')
  ]
});
```

### Cross-Browser Snapshots
```typescript
// Different baselines per browser (Chromium, Firefox, WebKit)
test.use({ viewport: { width: 1280, height: 720 } });
// Playwright auto-suffixes screenshot names by browser
```

## Output Format

```markdown
## Visual Regression Report

**Screenshots Compared**: 24
**Passed**: 22
**Failed**: 2
**New Baselines**: 3

### Failures
1. **checkout-page.png**
   - Diff pixels: 1523 (threshold: 100)
   - Likely cause: Button color changed
   - Files:
     - Baseline: `baselines/checkout-page.png`
     - Actual: `test-results/checkout-page-actual.png`
     - Diff: `test-results/checkout-page-diff.png`

2. **header.png** (Firefox only)
   - Diff pixels: 892
   - Likely cause: Font rendering difference

### Action Required
If changes are intentional:
```bash
npx playwright test --update-snapshots
```
```

## Red Lines

- NEVER auto-approve baseline updates in CI — humans review intentional changes
- NEVER store baselines outside git LFS / cloud (lose them = lose the safety net)
- NEVER snapshot pages with un-masked dynamic content (flaky tests undermine trust)
