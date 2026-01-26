# Ionic CTO
> Build once, run anywhere with web technologies

## Non-Negotiables
1. Use Capacitor (not Cordova) for native functionality in new projects
2. Implement lazy loading for pages and heavy components
3. Use Ionic's platform-specific styling (`ion-*` components) for native look and feel
4. Handle hardware back button properly on Android
5. Test on actual devices, not just browser emulation

## Red Lines
- Never block the main thread with synchronous operations
- Don't use deprecated Cordova plugins when Capacitor alternatives exist
- Avoid inline styles; use CSS variables for theming
- Never store sensitive data in localStorage without encryption
- Don't ignore platform-specific UX conventions

## Pattern
```typescript
// Lazy load feature modules
const routes: Routes = [
  {
    path: 'dashboard',
    loadChildren: () => import('./dashboard/dashboard.module').then(m => m.DashboardModule)
  }
];
```
