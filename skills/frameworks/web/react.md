# React CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm install react@^19.0.0 react-dom@^19.0.0
npm install -D @types/react@^19.0.0 @types/react-dom@^19.0.0
# Or with Vite (recommended for new projects):
npm create vite@latest my-app -- --template react-ts
```

## Claude's Common Mistakes
1. **Using manual memoization** — React 19's Compiler auto-memoizes; remove unnecessary `useMemo`/`useCallback`
2. **Still using `forwardRef`** — React 19 passes `ref` as a prop directly to function components
3. **Using `ReactDOM.render()`** — Must use `createRoot()` API for React 19 concurrent features
4. **Importing `act` from wrong location** — Import from `react`, not `react-dom/test-utils`
5. **Using `<Context.Provider>`** — React 19 renders `<Context>` directly as provider

## Correct Patterns (2026)
```typescript
// React 19: ref as prop, no forwardRef needed
function Input({ ref, ...props }: { ref?: React.Ref<HTMLInputElement> }) {
  return <input ref={ref} {...props} />;
}

// React 19: Context as provider directly
const ThemeContext = createContext('light');
<ThemeContext value="dark">{children}</ThemeContext>

// React 19: ref cleanup function
<div ref={(node) => {
  // setup
  return () => { /* cleanup */ };
}} />

// Async transitions with useTransition
const [isPending, startTransition] = useTransition();
startTransition(async () => {
  await updateData();
});
```

## Version Gotchas
- **v18→v19**: `forwardRef` deprecated, use ref as prop
- **v18→v19**: Context.Provider → Context directly
- **v18→v19**: Automatic memoization via React Compiler
- **Security (RSC)**: patch `react-server-dom-*` to 19.0.2 / 19.1.3 / 19.2.2 (fixes CVE-2025-55184, CVE-2025-55183 — verified below)

## What NOT to Do
- ❌ `useMemo(() => expensiveCalc, [deps])` everywhere — Compiler handles this
- ❌ `React.forwardRef((props, ref) => ...)` — Just accept `ref` in props
- ❌ `import { act } from 'react-dom/test-utils'` — Use `import { act } from 'react'`
- ❌ `useReducer<State, Action>` with type args — Let TypeScript infer
- ❌ Array index as `key` — Use stable unique IDs

## State Management (2026)
| Need | Solution |
|------|----------|
| Local UI state | `useState` |
| Complex local | `useReducer` |
| Server/async | TanStack Query |
| Global client | Zustand or Jotai |
| Forms | React Hook Form + Zod |

## Async / Concurrency Footguns (React 19)
React 19 concurrent rendering can call a component's render phase **multiple times,
pause it, and discard the result**. Reading external mutable state directly inside
render therefore *tears* — different parts of one paint see different values.

```typescript
// FOOTGUN: reading a live external store during render tears under concurrency.
// A concurrent render may be interrupted; the value read at the top of the tree
// can differ from the value read lower down in the SAME commit.
function BadPrice() {
  const price = window.__store.price;   // external mutable read — TEARS
  return <span>{price}</span>;
}

// RIGHT: useSyncExternalStore forces a consistent snapshot per commit and opts
// the read OUT of concurrent tearing. This is the ONLY safe way to read a
// non-React mutable source (a global, a browser API, a hand-rolled store).
function Price() {
  const price = React.useSyncExternalStore(
    window.__store.subscribe,       // (cb) => unsubscribe
    () => window.__store.price,     // client snapshot
    () => 0                          // server snapshot (SSR/RSC) — must be stable
  );
  return <span>{price}</span>;
}
```

`useEffect` dependency + cleanup are the most common Claude-generated bugs:

```typescript
// FOOTGUN 1 — stale closure: missing dep freezes `count` at its first value.
useEffect(() => {
  const id = setInterval(() => setCount(count + 1), 1000); // reads stale `count`
  return () => clearInterval(id);
}, []);                                                     // ← missing [count]
// FIX: use the updater form so you don't need `count` in deps:
useEffect(() => {
  const id = setInterval(() => setCount((c) => c + 1), 1000);
  return () => clearInterval(id);
}, []);

// FOOTGUN 2 — StrictMode runs every effect twice in dev (mount→cleanup→mount) on
// purpose, to surface missing cleanup. A subscribe/fetch with no cleanup leaks or
// double-fires. ALWAYS return the teardown:
useEffect(() => {
  const ctrl = new AbortController();
  fetch(url, { signal: ctrl.signal }).then(/* ... */);
  return () => ctrl.abort();          // cancels the duplicate dev invocation
}, [url]);
```

- **React 19 new hooks** — `useActionState(action, initial)` wires a form action to
  its returned state + pending flag (replaces the old `useFormState`); `useOptimistic`
  shows a provisional value while an async action is in flight and auto-reverts if it
  rejects. Both are only valid **inside** a component/hook, never at module scope.
- **`key` stability** — an array index as `key` re-associates state to the wrong row
  after insert/reorder/delete (a checkbox "moves" to a different item). Use a stable
  domain id. A changing `key` on the SAME element is the deliberate way to force a
  remount (reset internal state) — do it intentionally, not by accident.
- Source: react.dev useSyncExternalStore / useActionState / useOptimistic /
  Strict Mode docs. See References.

## Error Handling Idioms
```typescript
// Hooks can't catch render errors; use an Error Boundary (still class-only in
// React 19) or react-error-boundary. Effects/handlers are NOT covered by boundaries
// unless you rethrow into render.
import { ErrorBoundary } from 'react-error-boundary';
<ErrorBoundary fallback={<p>Something broke</p>}>
  <RiskyTree />
</ErrorBoundary>;

// FOOTGUN: an async handler rejection is swallowed — a boundary never sees it.
// Surface it into render so the boundary catches it:
const [err, setErr] = useState<Error | null>(null);
if (err) throw err;                       // rethrow in render → boundary catches
async function onSave() {
  try { await save(); } catch (e) { setErr(e as Error); }
}
```
React 19 also improves hydration-mismatch errors: it now logs a single diff of
server-vs-client markup instead of a generic warning — fix the nondeterministic
render (e.g. `Date.now()`/`Math.random()` in render, or reading `window` during SSR).

## Security and Dependency Gotchas
- **`dangerouslySetInnerHTML` → XSS (CWE-79)**: JSX auto-escapes `{value}`, but
  `dangerouslySetInnerHTML` injects **raw HTML** into the DOM. Any user-controlled
  string there is a stored/reflected Cross-Site Scripting hole — CWE-79 "Improper
  Neutralization of Input During Web Page Generation" (cwe.mitre.org/79). Never pass
  unsanitized input; sanitize with a maintained sanitizer (e.g. DOMPurify) first.

```typescript
// FOOTGUN: raw user HTML → script execution / cookie theft (CWE-79).
<div dangerouslySetInnerHTML={{ __html: userComment }} />        // XSS

// SAFE: escape by default — just render the string as text:
<div>{userComment}</div>                                          // auto-escaped
// SAFE (when you truly need HTML): sanitize first.
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userComment) }} />
```
- **`href={userUrl}`** with a `javascript:` URL also executes — validate the scheme
  (allow only `http`/`https`/`mailto`) before rendering a user-supplied link.
- **React Server Components / Server Functions (supply-chain + RSC advisories)**: a
  Server Function endpoint deserializes HTTP payloads. Two verified RSC advisories:
  **CVE-2025-55184** (GHSA-2m3v-v2m8-q956) — pre-auth DoS via unsafe deserialization
  of a Server Function payload (**CWE-502**, CVSS 7.5 HIGH); **CVE-2025-55183**
  (GHSA-925w-6v3x-g4j4) — a crafted request can leak a Server Function's source
  (CVSS 5.3). Both are fixed in the `react-server-dom-*` **19.0.2 / 19.1.3 / 19.2.2**
  patch releases — stay current on your 19.x patch line (later 19.x RSC DoS fixes
  have shipped since). Treat every Server Function argument as untrusted input.
- Source: cwe.mitre.org/79 + /502, github.com/advisories (GHSA-2m3v-v2m8-q956,
  GHSA-925w-6v3x-g4j4), react.dev security notes. See References.

## Testing Conventions
```typescript
// React Testing Library: assert on what the USER sees (roles/text), not internals.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';        // React 19: act ships from 'react' itself

test('increments', async () => {
  render(<Counter />);
  await userEvent.click(screen.getByRole('button', { name: /increment/i }));
  expect(screen.getByText('1')).toBeInTheDocument();
});
```
- **`act` import gotcha** — in React 19 import `act` from `react`, NOT the removed
  `react-dom/test-utils` (that path is gone). `userEvent` already wraps updates in
  `act`, so you rarely call it directly.
- Query by accessible role/label, never by test-id-only or DOM structure — a
  `<div>`-snapshot test false-greens on an unusable UI.

## Performance Traps
- **React 19 Compiler auto-memoizes** — remove blanket `useMemo`/`useCallback`; keep
  them only for a genuinely expensive computation or a referential-identity contract
  the Compiler can't infer. Over-memoizing costs comparison work for no benefit.
- **Context re-renders**: every consumer re-renders when ANY field of the context
  value changes. Split volatile and stable values into separate contexts, or pass a
  stable object — a fresh `{}` literal each render invalidates all consumers.
- **`startTransition`/`useTransition`** mark a state update as non-urgent so typing
  stays responsive while an expensive list re-renders in the background. Do NOT wrap
  controlled-input value updates in a transition — the input will lag.
- Lists: virtualize (`@tanstack/react-virtual`) beyond a few hundred rows rather than
  rendering thousands of nodes.

## Version-Specific Gotchas (dated, sourced)
- **React 19.2.7** is the current stable release on npm; the React 19.x line is
  current. [npmjs.com/package/react `dist-tags.latest`, retrieved 2026-07-09]
- **v18→v19**: `forwardRef` deprecated (ref-as-prop), `<Context>` renders as its own
  provider, automatic memoization via the React Compiler, `act` moves to `react`.
  [react.dev React 19 upgrade guide, retrieved 2026-07-09]
- **Security (RSC)**: CVE-2025-55184 (CWE-502, CVSS 7.5) + CVE-2025-55183 (CVSS 5.3),
  published 2025-12-11, fixed in `react-server-dom-*` 19.0.2 / 19.1.3 / 19.2.2.
  [nvd.nist.gov + github.com/advisories GHSA-2m3v-v2m8-q956 / GHSA-925w-6v3x-g4j4,
  retrieved 2026-07-09]

## References (retrieved 2026-07-09)
- React versions (npm): https://www.npmjs.com/package/react
- React 19 upgrade guide: https://react.dev/blog/2024/12/05/react-19-upgrade-guide
- useSyncExternalStore: https://react.dev/reference/react/useSyncExternalStore
- useActionState: https://react.dev/reference/react/useActionState
- useOptimistic: https://react.dev/reference/react/useOptimistic
- Strict Mode (double-invoke): https://react.dev/reference/react/StrictMode
- CWE-79 (Cross-Site Scripting): https://cwe.mitre.org/data/definitions/79.html
- CWE-502 (Deserialization of Untrusted Data): https://cwe.mitre.org/data/definitions/502.html
- CVE-2025-55184 (RSC DoS): https://github.com/advisories/GHSA-2m3v-v2m8-q956
- CVE-2025-55183 (RSC source leak): https://github.com/advisories/GHSA-925w-6v3x-g4j4
