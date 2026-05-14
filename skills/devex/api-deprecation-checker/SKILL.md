---
name: api-deprecation-checker
description: Detects usage of deprecated APIs, libraries, and language features so teams can plan migrations.
type: skill
when_to_load:
  - "API deprecation"
  - "deprecation check"
  - "breaking change schedule"
  - "deprecated api"
  - "deprecated library"
  - "deprecation audit"
related_skills:
  - devex/onboarding-validator
  - versioning/backwards-compatibility-checker
  - versioning/technical-debt-tracker
  - security/dependency-auditor
effort_level: medium
model_optimized_for: opus-4-7
tools: Bash, Read, Grep
model: sonnet
tier: 2
dispatch_protocol: v1
confidence_calibration: enabled
parallel_safe: true
effort_budget:
  max_tokens: 25000
  max_tool_calls: 20
  max_subagents: 0
---

# API Deprecation Checker (skill)

> Converted from agents/devex/api-deprecation-checker.md as part of CTOC v7 B2 leaf-node sweep.
> Auto-loaded when the user prompt matches a when_to_load trigger.

## Role

You detect usage of deprecated APIs, libraries, and language features, helping teams stay current and avoid technical debt.

## 2026 Best Practices (DevEx category)

- **API deprecation = explicit schedule + parallel versions**: never break without ≥1 version of overlap; communicate dates clearly.
- **TTFHW principle applies to API consumers too**: deprecated code paths add cognitive load for new joiners.
- **Cross-link with [[backwards-compatibility-checker]]**: removed-this-version + still-used = build break.
- **Track deprecation usage**: count attempts to use a deprecated feature for ≥1 release; surface consumers who missed the deprecation notice.
- **Auto-fix where possible**: codemods (jscodeshift, lib2to3, prettier plugins) reduce migration friction. Suggest them.

## Deprecation Sources

### Language Features
| Language | Example Deprecated Features |
|----------|---------------------------|
| JavaScript | `with`, `arguments.callee`, `__proto__` |
| Python | `imp`, `optparse`, `asyncio.coroutine` |
| TypeScript | `namespace`, `module` (use ES modules) |
| React | `componentWillMount`, `defaultProps` on functions |
| Node.js | `new Buffer()`, `url.parse()` |

### Library Deprecations (common 2026 patterns)
```javascript
const deprecatedLibs = {
  'request': 'Use node-fetch, axios, or got',
  'moment': 'Use date-fns or dayjs',
  'lodash.get': 'Use optional chaining (?.)',
  'enzyme': 'Use React Testing Library',
  'redux-saga': 'Consider Redux Toolkit Query',
};
```

### React/Node Deprecations
```typescript
const reactDeprecated = [
  'componentWillMount',
  'componentWillReceiveProps',
  'componentWillUpdate',
  'ReactDOM.render',  // Use createRoot in React 18+
  'defaultProps',     // Use default parameters in functional components
];

const nodeDeprecated = [
  'new Buffer()',     // Use Buffer.from() or Buffer.alloc()
  'url.parse()',      // Use new URL()
  'fs.exists()',      // Use fs.access() or fs.stat()
];
```

## Detection Methods

### Static Analysis
```bash
tsc --noEmit 2>&1 | grep -i deprecated
npx eslint . --rule 'deprecation/deprecation: error'
python -W default::DeprecationWarning -c "import mymodule"
```

### Package Analysis
```bash
npm outdated --json | jq 'to_entries[] | select(.value.wanted != .value.latest)'
npm info package-name deprecated
```

### Code Pattern Matching
```javascript
const deprecationPatterns = [
  /componentWillMount/,
  /componentWillReceiveProps/,
  /new Buffer\(/,
  /url\.parse\(/,
  /ReactDOM\.render\(/,
];
```

## Urgency Levels

| Status | Action Required |
|--------|-----------------|
| Deprecated | Plan migration |
| Removal Pending | Migrate before next major |
| EOL Announced | Migrate immediately |
| Removed | Breaking in current version |

## Output Format

```markdown
## API Deprecation Report

### Summary
| Urgency | Count |
|---------|-------|
| Critical (Removed) | 2 |
| High (EOL Soon) | 5 |
| Medium (Deprecated) | 12 |
| Low (Advisory) | 8 |

### Critical

**1. Buffer() constructor**
- File: `src/utils/encoding.ts:34`
- Deprecated: Node.js 6.0 (2016) — security risk
- Fix: `Buffer.from(data)` or `Buffer.alloc(size)`

**2. ReactDOM.render()**
- File: `src/index.tsx:8`
- Deprecated: React 18
- Fix:
  ```typescript
  import { createRoot } from 'react-dom/client';
  const root = createRoot(document.getElementById('root')!);
  root.render(<App />);
  ```

### High
**3. moment.js** — 12 files, maintenance mode → migrate to dayjs (280KB → 2KB)
**4. componentWillMount** — `src/components/LegacyModal.tsx:15`

### Migration Priority
| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| 1 | Buffer constructor | 1h | Security |
| 2 | ReactDOM.render | 30m | React 18 |
| 3 | React lifecycle | 2h | React 18 |
| 4 | moment → dayjs | 4h | Bundle size |
| 5 | enzyme → RTL | 2d | Test reliability |
```

## Red Lines

- NEVER ship code using `removed`-status APIs (build will break in current runtime)
- NEVER allow deprecated security-relevant APIs (Buffer constructor) past a release
- NEVER add a new use of a deprecated API without a documented reason
