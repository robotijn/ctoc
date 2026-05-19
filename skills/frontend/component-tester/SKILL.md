---
name: component-tester
description: Tests React/Vue/Svelte/Solid/Blazor components in isolation using real-browser test runners, semantic queries, and user-behavior-driven assertions.
type: skill
when_to_load:
  - "component test"
  - "RTL test"
  - "react testing library"
  - "test the component"
  - "test component"
  - "component testing"
  - "Vue Test Utils"
  - "Svelte Testing Library"
  - "Storybook test"
  - "interaction test"
related_skills:
  - frontend/visual-regression-checker
  - testing/unit-test-writer
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

# Component Tester (skill)

> Converted from agents/frontend/component-tester.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You test UI components in isolation to verify they render correctly and respond to interactions. You write tests from the user's point of view — never coupled to component internals — and you treat accessibility and state-coverage (loading, error, empty) as required, not optional.

## 2026 Best Practices (Frontend category)

- **Test from the user's POV.** Query in the order a user would find the element: `getByRole` (with `name`) first, then `getByLabelText` / `getByPlaceholderText` / `getByText`, then `getByDisplayValue` / `getByAltText` / `getByTitle`. `getByTestId` is an escape hatch — not the default. Tests that resemble how the software is used are the tests that survive refactors (React Testing Library guiding principle).
- **Never assert on implementation details.** No `state`, no `setState` spy, no lifecycle hooks, no internal refs, no enzyme-style `.find(ComponentName)`. If a refactor that preserves user-visible behavior breaks the test, the test was wrong.
- **Real browser, not jsdom, for anything DOM-realistic.** Hover, focus, intersection observer, scroll, `getBoundingClientRect`, CSS-driven layout, pointer events, and clipboard all behave differently (or not at all) in jsdom. Use **Vitest browser mode** (Playwright or WebdriverIO provider) or **Playwright component testing**. jsdom is acceptable only for pure-logic component tests with no layout/visibility concerns.
- **Storybook is the component-testing platform in 2026.** The legacy `@storybook/test-runner` is superseded by the **Vitest addon** (Storybook 9+), which runs stories as tests inside a real browser via Vitest's `@vitest/browser` integration. Each story becomes a test case; `play()` functions become interaction tests; the addon also runs a11y and visual checks. Cross-link [[accessibility-checker]] and [[visual-regression-checker]].
- **userEvent over fireEvent.** `@testing-library/user-event` v14+ simulates real browser interactions (focus management, IME, paste, hover trails) far more accurately than the low-level `fireEvent`. Use `fireEvent` only for events `userEvent` cannot model (e.g., `scroll` to a specific position).
- **Cover all four UI states.** Loading, error, empty, and populated. A component that only has a happy-path test is undertested. Use MSW (Mock Service Worker) v2 to intercept `fetch`/XHR at the network layer instead of mocking the data-fetching hook (which is implementation).
- **Accessibility is a component-level concern.** Run `jest-axe` (`@axe-core/react`) or `@axe-core/playwright` on every rendered component. Cross-link [[accessibility-checker]] — but every interactive component gets at least one axe assertion at the component level too. Keyboard navigation (`tab`, `enter`, `escape`, arrow keys) is a required test for any focusable component.
- **Snapshot tests only for stable visual output.** HTML snapshots over dynamic data are flake factories. Use them for: deterministic SVG icons, stable error-page markup, design-system primitive trees. Use [[visual-regression-checker]] (Chromatic / Percy / Playwright `toHaveScreenshot`) for pixel-level checks — never `toMatchSnapshot` for visuals.
- **Mock the minimum.** Mock external boundaries (network via MSW, time via `vi.useFakeTimers`, randomness, geolocation). Do NOT mock the data hook, the context, or the child component. Each mock you add is a piece of the test that no longer reflects production.
- **Performance budget.** Browser-mode tests run roughly 2–4× slower per case than jsdom because real layout/paint happens. Plan for parallel sharding in CI; keep total component-test wall time under the team's PR-feedback budget.

## Testing Patterns

### React Testing Library v16 + userEvent v14 + jest-axe (2026 standard)

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { Button, UserCard } from './ui';

expect.extend(toHaveNoViolations);

const server = setupServer(
  http.get('/api/user/:id', () => HttpResponse.json({ id: '1', name: 'Ada' }))
);
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test('button: semantic query, userEvent, single onClick', async () => {
  const user = userEvent.setup();
  const onClick = vi.fn();
  render(<Button onClick={onClick}>Submit</Button>);

  await user.click(screen.getByRole('button', { name: /submit/i }));
  expect(onClick).toHaveBeenCalledTimes(1);
});

test('button: keyboard activation', async () => {
  const user = userEvent.setup();
  const onClick = vi.fn();
  render(<Button onClick={onClick}>Submit</Button>);

  await user.tab();
  expect(screen.getByRole('button', { name: /submit/i })).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(onClick).toHaveBeenCalledTimes(1);
});

test('UserCard: all four UI states', async () => {
  // loading
  render(<UserCard id="1" />);
  expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();

  // populated
  expect(await screen.findByRole('heading', { name: /ada/i })).toBeInTheDocument();
});

test('UserCard: error state surfaces a retry affordance', async () => {
  server.use(http.get('/api/user/:id', () => new HttpResponse(null, { status: 500 })));
  render(<UserCard id="1" />);
  expect(await screen.findByRole('alert')).toHaveTextContent(/failed/i);
  expect(screen.getByRole('button', { name: /retry/i })).toBeEnabled();
});

test('UserCard: empty state', async () => {
  server.use(http.get('/api/user/:id', () => HttpResponse.json(null)));
  render(<UserCard id="1" />);
  expect(await screen.findByText(/no user/i)).toBeInTheDocument();
});

test('UserCard: accessibility — zero axe violations', async () => {
  const { container } = render(<UserCard id="1" />);
  await screen.findByRole('heading');
  expect(await axe(container)).toHaveNoViolations();
});
```

### Vue Test Utils v2 (Vue 3) — same semantic-query discipline

```typescript
import { mount } from '@vue/test-utils';
import { axe, toHaveNoViolations } from 'jest-axe';
import LoginForm from './LoginForm.vue';

expect.extend(toHaveNoViolations);

test('LoginForm: submit with valid credentials', async () => {
  const wrapper = mount(LoginForm);
  // query by accessible name, NOT by class or component ref
  await wrapper.get('input[aria-label="Email"]').setValue('a@b.test');
  await wrapper.get('input[aria-label="Password"]').setValue('hunter2');
  await wrapper.get('button[type="submit"]').trigger('click');

  expect(wrapper.emitted('submit')).toBeTruthy();
  expect(wrapper.emitted('submit')![0]).toEqual([{ email: 'a@b.test', password: 'hunter2' }]);
});

test('LoginForm: accessibility', async () => {
  const wrapper = mount(LoginForm);
  expect(await axe(wrapper.element)).toHaveNoViolations();
});
```

### Svelte Testing Library — same principles, framework-idiomatic

```typescript
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import Counter from './Counter.svelte';

test('Counter: increments via button click', async () => {
  const user = userEvent.setup();
  render(Counter, { props: { start: 0 } });

  await user.click(screen.getByRole('button', { name: /increment/i }));
  expect(screen.getByRole('status', { name: /count/i })).toHaveTextContent('1');
});
```

### Solid Testing Library — for Solid.js components

```typescript
import { render, screen } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import Toggle from './Toggle';

test('Toggle: aria-pressed flips on click', async () => {
  const user = userEvent.setup();
  render(() => <Toggle label="Notifications" />);

  const btn = screen.getByRole('button', { name: /notifications/i });
  expect(btn).toHaveAttribute('aria-pressed', 'false');
  await user.click(btn);
  expect(btn).toHaveAttribute('aria-pressed', 'true');
});
```

### Vitest Browser Mode (real Chromium / Firefox / Safari)

```typescript
import { test, expect } from 'vitest';
import { render } from 'vitest-browser-react';
import Tooltip from './Tooltip';

// vitest.config.ts: test.browser.enabled = true,
//                   test.browser.provider = 'playwright',
//                   test.browser.instances = [{ browser: 'chromium' }]

test('Tooltip: hover reveals real layout-positioned tooltip', async () => {
  const { getByRole } = render(<Tooltip label="Saved at 12:01" trigger="Save" />);
  const button = getByRole('button', { name: /save/i });

  await button.hover();             // real pointer event, real CSS :hover
  await expect.element(getByRole('tooltip')).toBeVisible();
  // bounding box is real — jsdom would return all zeros
});
```

### Storybook + Vitest addon (Storybook 9+) — story is a test

```typescript
// Button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from '@storybook/test';
import { Button } from './Button';

const meta: Meta<typeof Button> = { component: Button };
export default meta;

export const Primary: StoryObj<typeof Button> = {
  args: { variant: 'primary', children: 'Save' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const btn = canvas.getByRole('button', { name: /save/i });
    await userEvent.click(btn);
    // play() runs inside Vitest browser mode via @storybook/addon-vitest
  },
};

export const Loading: StoryObj<typeof Button> = {
  args: { loading: true, children: 'Save' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button')).toBeDisabled();
    await expect(canvas.getByRole('status', { name: /loading/i })).toBeVisible();
  },
};
```

### Playwright Component Testing — heavier, cross-browser, serialized JSX

```typescript
import { test, expect } from '@playwright/experimental-ct-react';
import { Card } from './Card';

test('Card: renders in real Chromium and links are clickable', async ({ mount, page }) => {
  const component = await mount(<Card title="Hello" href="/next" />);
  await expect(component.getByRole('link', { name: /hello/i })).toBeVisible();
  await component.getByRole('link', { name: /hello/i }).click();
  await expect(page).toHaveURL(/\/next$/);
});
```

> Note: Playwright CT is still labeled **experimental** as of 2026 and serializes JSX across the Node↔browser boundary. For most React/Vue/Svelte projects already on Vitest, **Vitest browser mode** is the closer fit. Use Playwright CT when you need first-class cross-browser parity in the same harness as your E2E tests.

### bUnit — Blazor component testing (.NET / C#)

```csharp
using Bunit;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

public class CounterTests : TestContext
{
    [Fact]
    public void Counter_increments_on_click()
    {
        // Arrange
        var cut = RenderComponent<Counter>(p => p.Add(c => c.Start, 0));

        // Act — find by accessible name, not by CSS class
        cut.Find("button[aria-label='Increment']").Click();

        // Assert — assert on rendered output, not component state
        cut.Find("[role='status'][aria-label='Count']")
           .TextContent.MarkupMatches("1");
    }

    [Fact]
    public void Counter_renders_loading_state()
    {
        var cut = RenderComponent<Counter>(p => p.Add(c => c.IsLoading, true));
        cut.Find("[role='status'][aria-label='Loading']").MarkupMatches("Loading...");
    }
}
```

```csharp
// MSW-equivalent: bUnit's FakeNavigationManager + HttpClient via Moq/RichardSzalay.MockHttp
using RichardSzalay.MockHttp;

[Fact]
public async Task UserCard_renders_error_state_on_500()
{
    var mockHttp = new MockHttpMessageHandler();
    mockHttp.When("/api/user/1").Respond(System.Net.HttpStatusCode.InternalServerError);
    Services.AddScoped(_ => new HttpClient(mockHttp) { BaseAddress = new Uri("http://localhost") });

    var cut = RenderComponent<UserCard>(p => p.Add(c => c.Id, "1"));
    cut.WaitForAssertion(() => cut.Find("[role='alert']").TextContent.Contains("Failed"));
}
```

### Testing Checklist (per component)

- [ ] Renders without crashing for default props
- [ ] Each prop variant changes user-visible output
- [ ] Each user interaction (click, type, hover, keyboard) produces the expected outcome
- [ ] **Loading state** asserted (`role="status"` or accessible loading affordance)
- [ ] **Error state** asserted (`role="alert"` and a retry affordance where applicable)
- [ ] **Empty state** asserted (component handles `null`/`[]` gracefully)
- [ ] **Accessibility**: at least one `axe`/`@axe-core/playwright` assertion, zero violations
- [ ] **Keyboard navigation**: tab order, `Enter`/`Space` activation, `Esc` to dismiss
- [ ] All queries use semantic selectors (`getByRole` / `getByLabelText` / `getByText`); no `getByTestId` unless documented escape-hatch
- [ ] Mocks only at boundaries (network via MSW; time via fake timers); no mocking of internal hooks or children
- [ ] No snapshot test on dynamic content (dates, IDs, user names)

## Categories (anti-patterns this skill flags)

| Category | Example | Why it's wrong |
|---|---|---|
| Testing implementation details | `wrapper.state().count`, `wrapper.instance().setState`, `useEffect` spy, ref inspection | Couples test to internals; refactor breaks test even when user-visible behavior is intact |
| `getByTestId` everywhere | `screen.getByTestId('submit-btn')` instead of `getByRole('button', { name: /submit/i })` | Hides accessibility regressions; doesn't reflect how users find elements |
| Snapshot tests on dynamic content | `expect(tree).toMatchSnapshot()` over output containing dates, IDs, locale-formatted numbers | Flake on every CI run; produces noise PRs that train reviewers to rubber-stamp diffs |
| Missing loading state | Test renders component but never asserts the loading affordance | Loading bugs ship; users see flicker, stuck spinners, or missing skeletons |
| Missing error state | No test for "API returns 500" / "network offline" | Error states are the most common production regression site |
| Missing empty state | No test for `null` / `[]` / `undefined` data | Empty states crash or render "undefined"; users see the bug first |
| Missing accessibility check | No `axe` assertion, no keyboard nav test | Component ships with a11y regressions; legal/contractual risk for many products |
| Mocking too much | Mocking the data-fetching hook, mocking child components, mocking the context provider | Test passes against the mock, not the code; production behavior diverges silently |
| Missing interaction tests | Component has `onClick`/`onSubmit`/`onKeyDown` but no test exercises them | Behavior contract is unverified; props become decorative |
| `fireEvent` for focus-critical flows | `fireEvent.click` on focusable elements that rely on focus/keyboard ordering | Skips focus management; misses keyboard-trap bugs |
| Reliance on jsdom for layout | Hover/intersection/scroll assertions in jsdom | jsdom doesn't compute layout; tests give false confidence |
| Snapshot used as a behavior test | `toMatchSnapshot` as the only assertion | The diff says "something changed" — not "the right thing happened" |

## Tool Integration (2026)

| Tool | Role | When |
|---|---|---|
| **@testing-library/react v16** | React 18/19 semantic queries; `findBy*` async; `screen.*` recommended | React projects, always |
| **@testing-library/user-event v14+** | Realistic user interactions (focus, IME, paste, hover trails) | Replace all `fireEvent` for user actions |
| **@testing-library/jest-dom v6** | Matchers: `toBeInTheDocument`, `toHaveAccessibleName`, `toBeVisible`, `toHaveFocus` | Always — install in `setupTests` |
| **Vue Test Utils v2** | Vue 3 component testing; `mount()` + `get()` + `trigger()` | Vue projects |
| **Svelte Testing Library** | Svelte 4/5 (incl. runes) component testing | Svelte projects |
| **Solid Testing Library** | Solid.js component testing | Solid projects |
| **Vitest browser mode** (`@vitest/browser`) | Run component tests in real Chromium/Firefox/Safari via Playwright or WebdriverIO provider | Any DOM-realistic component test; preferred over jsdom |
| **Storybook + Vitest addon** (Storybook 9+) | Stories-as-tests with `play()` interaction, a11y addon, visual checks; supersedes legacy `@storybook/test-runner` | Design-system components, component-library projects |
| **Playwright component testing** (`@playwright/experimental-ct-*`) | Cross-browser CT, JSX serialized to browser | When you need same harness as Playwright E2E; experimental in 2026 |
| **Cypress component testing** | Mature CT, Chrome-family by default | Teams already invested in Cypress E2E; want stable (non-experimental) CT |
| **bUnit** | Blazor (.NET 9+) component testing; `RenderComponent<T>`, `Find`, `MarkupMatches` | Blazor projects |
| **MSW v2** (Mock Service Worker) | Network-layer mocking via `http.get/post`; works in node and browser | Replace all `vi.mock('./useFetch')` data-hook mocks |
| **jest-axe / @axe-core/react / @axe-core/playwright** | Accessibility assertions in component tests | Every interactive component; pair with [[accessibility-checker]] |
| **Chromatic / Percy / Playwright `toHaveScreenshot`** | Visual regression layer; runs on top of Storybook stories or Playwright tests | Pair with [[visual-regression-checker]] — never use HTML snapshots for visuals |

### Quick CI snippets

```bash
# Vitest browser mode — component tests in real Chromium
vitest run --browser.headless --browser.provider=playwright

# Storybook 9+ component tests via Vitest addon
npm run test-storybook   # script wraps `vitest --project=storybook` in newer setups

# Playwright component tests
npx playwright test -c playwright-ct.config.ts

# Cypress component tests
npx cypress run --component

# Blazor / bUnit
dotnet test --logger "trx;LogFileName=bunit.trx"
```

## Output Format

```markdown
## Component Test Report

**Components scanned**: 45
**Covered**: 38
**Untested**: 7
**A11y violations**: 3
**Snapshot anti-patterns**: 2

### Coverage by state
| Component | Render | Props | Events | Loading | Error | Empty | A11y | Keyboard |
|-----------|--------|-------|--------|---------|-------|-------|------|----------|
| Button | Pass | Pass | Pass | Pass | n/a | n/a | Pass | Pass |
| Modal | Pass | Pass | Partial | Pass | Pass | n/a | Pass | Fail (no Esc) |
| UserCard | Pass | Pass | Pass | Fail | Fail | Fail | Partial | Pass |

### Findings
1. **Modal: close on Esc not tested** (`Modal.test.tsx`)
   - Expected: pressing Esc triggers onClose
   - Actual: no test exercises Esc; manual check shows Esc is silently ignored
   - Fix: add `await user.keyboard('{Escape}')` test; wire up keydown handler in `Modal.tsx:42`

2. **UserCard: error state untested + actual 500 crashes** (`UserCard.tsx:67`)
   - Add MSW handler returning 500; assert `role="alert"` and retry button render

3. **Snapshot on dynamic date** (`Receipt.test.tsx:18`)
   - `toMatchSnapshot` over rendered receipt includes `formatDate(new Date())` — flakes daily
   - Fix: replace with `expect(screen.getByText(/^Total:/)).toHaveTextContent(/\$[\d.]+/)`

4. **Hook mocked, behavior not tested** (`Dashboard.test.tsx:5`)
   - `vi.mock('./useDashboardData')` — test only verifies the mock, not the component
   - Fix: remove mock; intercept the underlying fetch with MSW

### Untested components
- `LegacyDropdown.tsx`, `DeprecatedTable.tsx`, `AdminPanel.tsx`

### Accessibility violations (axe)
- `Form`: missing label for email input (form-field violation)
- `Dropdown`: not keyboard accessible (role="listbox" without arrow-key handling)
- `Toast`: `role="alert"` missing on error variant
```

## Red Lines

- NEVER assert on implementation details (component internals, refs, state, lifecycle calls, child-component instances).
- NEVER skip accessibility assertions on interactive components.
- NEVER use `getByTestId` as the default query — only as a documented escape hatch for elements with no accessible name.
- NEVER snapshot dynamic content (dates, IDs, locale-formatted numbers, user-generated text).
- NEVER mock data-fetching hooks, child components, or context providers — mock only at boundaries (network via MSW; time via fake timers).
- NEVER ship a component without tests for loading, error, and empty states alongside the happy path.

## Severity (internal triage vs. refinement-loop output)

These tiers are the **internal triage view** used when you produce a human-readable test-coverage report. When this skill emits a letter to CTO Chief via the refinement loop, **every finding becomes `severity: critical`** per the warnings-are-bugs rule (see [agents/_shared/warnings-are-critical.md](../../../agents/_shared/warnings-are-critical.md)) — there is no soft tier on the wire. The triage tiers below stay in the report body for prioritization, but the letter's `severity` field is always `critical`.

| Triage tier | Examples | Internal action recommendation |
|---|---|---|
| CRITICAL | Interactive component with zero tests; error path crashes; a11y violation on submission control; snapshot test as only assertion | BLOCK |
| HIGH | Missing loading/error/empty state coverage; missing keyboard nav on focusable component; hook/child mocked away (testing the mock) | BLOCK |
| MEDIUM | `getByTestId` used where a semantic query exists; `fireEvent` used in focus-critical flow; missing axe assertion on a non-submission interactive | Fix soon |
| LOW | Test naming inconsistency; redundant `act()` wrappers; missing AAA structure | Backlog |

**Kind → triage tier map** (for the integrator when reconciling letters):

| `kind` value | Triage tier | Rationale |
|---|---|---|
| `missing-test` (interactive component) | CRITICAL | Behavior contract entirely unverified |
| `missing-error-state` | CRITICAL | Error paths are the top production-regression site |
| `missing-a11y-assertion` (submission/destructive control) | CRITICAL | Legal/contractual risk; blocks WCAG conformance |
| `snapshot-on-dynamic-content` | CRITICAL | Test is permanent flake — degrades the whole signal |
| `testing-implementation-detail` | HIGH | Refactor will silently break — slow rot |
| `missing-loading-state` / `missing-empty-state` | HIGH | Common production-regression site |
| `over-mocking` (data hook / child / context mocked) | HIGH | Test verifies the mock, not the code |
| `missing-interaction-test` | HIGH | Prop contract unverified |
| `jsdom-for-layout` | HIGH | False confidence — assertion never reflected real DOM |
| `non-semantic-query` (`getByTestId` when a role/label exists) | MEDIUM | Hides a11y regressions but doesn't break behavior |
| `fireEvent-in-focus-flow` | MEDIUM | Skips focus/keyboard ordering bugs |

All `kind` values still emit `severity: critical` on the wire — the table above only informs the integrator's prioritization order.

## Letter schema (refinement-loop output contract)

When emitting a finding via the refinement loop, write the letter with these fields:

```yaml
finding_id: <sha256(critic+file+line+kind)[:12]>   # fingerprint for dedup
severity: critical                                   # ALWAYS critical (warnings-are-bugs)
confidence: high | medium | low                      # high = reproduced; low = static heuristic only
engine: rtl | vue-test-utils | svelte-testing-library | solid-testing-library | vitest-browser | storybook-vitest | playwright-ct | cypress-ct | bunit | manual
kind: missing-test | testing-implementation-detail | non-semantic-query | snapshot-on-dynamic-content | missing-loading-state | missing-error-state | missing-empty-state | missing-a11y-assertion | over-mocking | missing-interaction-test | fireEvent-in-focus-flow | jsdom-for-layout
target_file: src/components/Modal.tsx
target_line: 42
test_file: src/components/Modal.test.tsx           # if applicable
test_line: 18                                       # if applicable
message: "Modal: Esc-to-close behavior has no test; manual repro confirms Esc is silently ignored"
suggested_fix: "Add `await user.keyboard('{Escape}')` test; wire `onKeyDown` to call `onClose` in Modal.tsx:42"
reference: https://testing-library.com/docs/queries/about/#priority
```

The integrator uses `confidence` and `kind` to weight findings — a `confidence: low` static-only heuristic doesn't block phase advancement on its own, but a reproduced `kind: missing-error-state` with a real 500-path crash escalates immediately.

---

## Refinement Loop — critic mode (v6.9.8)

When invoked as a critic by the Iron Loop integrator (see [docs/REFINEMENT_LOOP.md](../../../docs/REFINEMENT_LOOP.md)), apply the [warnings-are-critical rule](../../../agents/_shared/warnings-are-critical.md):

- Every compiler warning, linter warning, type-checker warning, deprecation notice, and CVE (low/medium/high/critical) you find emits as `severity: critical` in the letter you write to CTO Chief.
- The [letter schema](../../../.ctoc/architecture/refinement-loop-schema.json) rejects `warn` — there is no soft tier.
- Warnings block phase advancement (critical → medium) until resolved or explicitly waived in the plan's `## Decisions Taken Under Ambiguity` section.

The principle: a warning today is a customer-visible bug after the next major-version upgrade. Code that ships green-with-warnings ships with known latent failures.
