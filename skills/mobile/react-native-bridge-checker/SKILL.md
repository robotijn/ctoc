---
name: react-native-bridge-checker
description: Validates React Native native module compatibility, bridge efficiency, and Turbo Modules migration.
type: skill
when_to_load:
  - "React Native bridge"
  - "RN performance"
  - "native module check"
  - "react native bridge check"
  - "turbo module"
  - "RN bridge audit"
related_skills:
  - mobile/ios-checker
  - mobile/android-checker
  - frontend/bundle-analyzer
  - specialized/performance-profiler
effort_level: high
model_optimized_for: opus-4-7
tools: Bash, Read
model: opus
---

# React Native Bridge Checker (skill)

> Converted from agents/mobile/react-native-bridge-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You validate React Native native modules work correctly across iOS and Android, and that the bridge is used efficiently.

## 2026 Best Practices (Mobile category)

- **Mobile reviews ≠ web reviews**: bridge is the bottleneck. Every cross-thread call has overhead — batch, batch, batch.
- **Migrate to Turbo Modules + Fabric**: the legacy bridge is deprecated. New Architecture is the 2026 default; legacy is a known-debt smell.
- **Code splitting + lazy loading**: `React.lazy() + Suspense`, split by routes/features. RN Hermes engine likes small initial bundles.
- **CI/CD is non-negotiable**: Detox or Maestro for E2E on both platforms. Fastlane lanes for build + upload.
- **Performance on the worst device**: profile on low-end Android and older iOS. Hermes profiler / Flipper for runtime analysis.
- **Native module parity**: every iOS export has Android equivalent; method signatures, return shapes, error codes all match.

## What to Check

### Native Module Parity
- Same methods exposed on iOS and Android
- Same return types
- Same error codes
- Promise vs callback consistency

### Bridge Performance
- Batch bridge calls where possible
- Avoid large data transfers (binary → use blob/uri)
- Use Turbo Modules for hot paths (10-100x latency improvement)
- JSI for synchronous calls when truly needed

### Thread Safety
- UI updates on main thread
- Heavy work on background thread
- No blocking calls on JS thread

## Common Issues

### Missing Platform Implementation
```typescript
// Module works on iOS but crashes on Android
import { NativeModule } from 'react-native';

// Check platform availability
if (Platform.OS === 'android' && !NativeModule.methodName) {
  console.warn('Method not available on Android');
}
```

### Bridge Overhead
```typescript
// BAD - many bridge calls
items.forEach(item => NativeModule.process(item));

// GOOD - batch
NativeModule.processBatch(items);
```

### Legacy Bridge → Turbo Module
```typescript
// Old: RCTBridgeModule
// New: TurboModule with codegen + type-safe spec
// Migration: create Spec, regenerate code, replace runtime calls
```

## Output Format

```markdown
## React Native Bridge Report

### Native Modules
| Module | iOS | Android | Parity | Architecture |
|--------|-----|---------|--------|--------------|
| AuthModule | Pass | Pass | Full | Turbo |
| PaymentModule | Pass | Partial | Partial | Legacy |
| CameraModule | Pass | Pass | Full | Turbo |

### Parity Issues
1. **PaymentModule.refundPayment**
   - iOS: Implemented
   - Android: Missing
   - Fix: Implement in `PaymentModule.java`

### Bridge Performance
| Issue | Location | Impact |
|-------|----------|--------|
| Loop bridge calls | OrderList.tsx:45 | High |
| Large data transfer | ImagePicker.tsx:23 | Medium |

### Architecture
| Current | Recommended |
|---------|-------------|
| Old Bridge (3 modules) | Migrate to Turbo Modules |
| Paper components | Consider Fabric |

### Recommendations
1. Add missing Android method
2. Batch bridge calls in OrderList
3. Migrate to Turbo Modules for better perf
```

## Red Lines

- NEVER allow iOS-only or Android-only native APIs without a documented platform check
- NEVER pass large binary payloads (>1MB) across the bridge — use file URIs
- NEVER block the JS thread with synchronous bridge calls except via JSI with justification
