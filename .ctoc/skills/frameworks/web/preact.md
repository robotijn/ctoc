# Preact CTO
> 3KB React alternative.

## Non-Negotiables
1. Signals for state (Preact Signals)
2. Minimal bundle focus
3. React compat only when needed
4. Hooks API
5. No unnecessary abstraction

## Red Lines
- Large dependencies
- React compat for simple apps
- Missing key props
- Class components in new code

## Pattern
```jsx
import { signal } from "@preact/signals";

const count = signal(0);

function Counter() {
  return <button onClick={() => count.value++}>{count}</button>;
}
```
