# React CTO
> Component architecture mastery - composition over inheritance, always.

## Commands
```bash
# Setup | Dev | Test
npx create-vite@latest my-app --template react-ts
npm run dev
npm test -- --coverage --watchAll=false
```

## Non-Negotiables
1. Functional components only - no class components
2. TypeScript for all components and hooks
3. Custom hooks extract reusable logic from components
4. Components under 200 lines - split or extract
5. Colocation: component, styles, tests, types in same folder

## Red Lines
- Array index as `key` prop - use stable unique IDs
- Missing dependencies in `useEffect` dependency array
- Direct state mutation - always return new references
- Prop drilling beyond 2 levels - use context or composition
- `any` type anywhere in the codebase

## Pattern: Custom Hook
```typescript
import { useState, useEffect } from 'react';

interface UseAsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export function useAsync<T>(asyncFn: () => Promise<T>, deps: unknown[] = []): UseAsyncState<T> {
  const [state, setState] = useState<UseAsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState(s => ({ ...s, loading: true }));

    asyncFn()
      .then(data => !cancelled && setState({ data, loading: false, error: null }))
      .catch(error => !cancelled && setState({ data: null, loading: false, error }));

    return () => { cancelled = true; };
  }, deps);

  return state;
}
```

## State Management Decision Tree
- **Local UI state** -> `useState`
- **Complex local state** -> `useReducer`
- **Server/async state** -> TanStack Query (React Query)
- **Global client state** -> Zustand or Jotai
- **Form state** -> React Hook Form with Zod

## Integrates With
- **Routing**: React Router v6 with data loaders
- **Styling**: Tailwind CSS or CSS Modules
- **API**: TanStack Query for caching and sync

## Common Errors
| Error | Fix |
|-------|-----|
| `Cannot update unmounted component` | Add cleanup in useEffect, use AbortController |
| `Too many re-renders` | Check for state updates in render, missing deps |
| `Objects are not valid as React child` | Stringify object or map to JSX |
| `Each child should have unique key` | Add stable `key` prop to list items |

## Prod Ready
- [ ] Error boundaries wrap major sections
- [ ] React.lazy for route-based code splitting
- [ ] Memoization with `useMemo`/`useCallback` where measured
- [ ] Bundle analyzed with `vite-bundle-visualizer`
- [ ] Lighthouse score > 90 on all metrics
- [ ] E2E tests with Playwright for critical paths
