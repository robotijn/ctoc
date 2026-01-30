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
- **Security**: Update to 19.0.3+ (CVE-2025-55184, CVE-2025-55183 patches)

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
