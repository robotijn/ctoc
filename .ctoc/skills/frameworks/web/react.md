# React CTO
> Component model mastery.

## Non-Negotiables
1. Functional components only
2. Custom hooks for logic
3. TypeScript always
4. Small, focused components
5. Proper state management

## Red Lines
- Index as list key
- Missing useEffect deps
- Mutating state directly
- Prop drilling deeply

## State Decision
- Local → useState
- Complex local → useReducer
- Server state → TanStack Query
- Global → Zustand/Jotai
