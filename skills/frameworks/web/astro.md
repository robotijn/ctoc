# Astro CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm create astro@latest
# Astro 5.x - requires Node.js 18.17.1+ or 20.3.0+
# Upgrade existing:
npx @astrojs/upgrade
npm run dev
```

## Claude's Common Mistakes
1. **MDX version mismatch** — Astro 5 requires @astrojs/mdx v4.0.0+
2. **Skipping major versions** — Upgrade 3→4→5, not 3→5 directly
3. **Legacy Content Collections** — Use new Content Layer API for better performance
4. **Old script behavior** — Astro 5 changes script hoisting; check script tags
5. **Stale cache issues** — Delete node_modules, .astro, dist when upgrading

## Correct Patterns (2026)
```typescript
// Astro 5: Content Layer API (new)
// src/content.config.ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    pubDate: z.coerce.date(),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { blog };

// Client directives (use sparingly)
// client:load - Critical (nav, forms)
// client:idle - Low priority (analytics)
// client:visible - Below fold (comments)
// client:only="react" - Never SSR
```

## Version Gotchas
- **v4→v5**: Content Layer API replaces legacy collections
- **v4→v5**: Scripts no longer hoisted to `<head>` by default
- **v4→v5**: Conditional scripts not implicitly inlined
- **v5**: Requires @astrojs/mdx v4.0.0+ for MDX files
- **Starlight**: Ensure compatible version before Astro 5 upgrade

## What NOT to Do
- ❌ `client:load` everywhere — Use `client:visible` or `client:idle`
- ❌ Upgrading Astro 3→5 directly — Go through v4 first
- ❌ Keeping old @astrojs/* versions with Astro 5 — Update all integrations
- ❌ Using legacy content collections — Migrate to Content Layer API
- ❌ Heavy JS where HTML/CSS suffices — Zero JS is the goal

## Client Directive Decision
| Need | Directive |
|------|-----------|
| Critical interactive | `client:load` |
| Lower priority | `client:idle` |
| Below the fold | `client:visible` |
| Mobile only | `client:media` |
| Browser APIs only | `client:only` |

## Troubleshooting
```bash
# Clear cache when upgrading
rm -rf node_modules .astro dist
npm install
npm run build
```
