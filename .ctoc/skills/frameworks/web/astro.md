# Astro CTO
> Content-focused framework - zero JS by default, island architecture for interactivity.

## Commands
```bash
# Setup | Dev | Test
npm create astro@latest -- --template basics
npm run dev
npm run build && npm run preview
```

## Non-Negotiables
1. Islands architecture - hydrate only interactive components
2. Content collections for structured markdown/MDX
3. Zero client JS by default - add `client:*` directives intentionally
4. Framework agnostic - use React/Vue/Svelte where each excels
5. Static-first, SSR only when needed

## Red Lines
- Unnecessary `client:load` - use `client:visible` or `client:idle`
- Missing content collections for structured data
- JavaScript where HTML/CSS suffices
- Ignoring image optimization with `@astrojs/image`
- Over-engineering static content sites

## Pattern: Content Collection with Component Island
```typescript
// src/content/config.ts
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    author: z.string(),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { blog };

// src/pages/blog/[slug].astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import Comments from '../../components/Comments.tsx';

export async function getStaticPaths() {
  const posts = await getCollection('blog');
  return posts.map(post => ({
    params: { slug: post.slug },
    props: { post },
  }));
}

const { post } = Astro.props;
const { Content } = await post.render();
---

<BaseLayout title={post.data.title}>
  <article>
    <h1>{post.data.title}</h1>
    <time>{post.data.pubDate.toLocaleDateString()}</time>
    <Content />
  </article>
  <Comments client:visible postId={post.slug} />
</BaseLayout>
```

## Client Directives Decision Tree
- `client:load` - Critical interactive (nav menus, forms)
- `client:idle` - Lower priority (analytics, chat widgets)
- `client:visible` - Below fold (comments, carousels)
- `client:media` - Conditional (mobile-only components)
- `client:only` - Never SSR (browser-only APIs)

## Integrates With
- **CMS**: Astro DB, Contentful, Sanity, or Markdown
- **UI**: React, Vue, Svelte, or Solid components
- **Styling**: Tailwind CSS with `@astrojs/tailwind`
- **Deploy**: Vercel, Netlify, Cloudflare Pages

## Common Errors
| Error | Fix |
|-------|-----|
| `Cannot use useState in Astro component` | Move to framework component with `client:*` |
| `getCollection is not defined` | Import from `astro:content` |
| `Hydration mismatch` | Ensure component renders same on server/client |
| `Image not found` | Use `import` for local images, check path |

## Prod Ready
- [ ] Image optimization enabled
- [ ] Sitemap generated with `@astrojs/sitemap`
- [ ] RSS feed for blog content
- [ ] View Transitions API for navigation
- [ ] Prefetch enabled for faster navigation
- [ ] Core Web Vitals verified (should be excellent)
