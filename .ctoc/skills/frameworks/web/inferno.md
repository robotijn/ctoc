# Inferno CTO
> Fastest React-like library.

## Non-Negotiables
1. Functional components
2. Hooks API
3. Linked state for forms
4. Proper key usage
5. No unnecessary re-renders

## Red Lines
- Class components (prefer functional)
- Missing keys
- Large component trees
- React compat overhead

## Pattern
```jsx
import { useState } from 'inferno-hooks';

function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount(count + 1)}>
      {count}
    </button>
  );
}
```
