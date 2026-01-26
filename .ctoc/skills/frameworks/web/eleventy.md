# Eleventy CTO
> Flexible static site generator - zero config, any template language.

## Commands
```bash
# Setup | Dev | Test
npm init -y && npm install @11ty/eleventy
npx eleventy --serve
npm test
```

## Non-Negotiables
1. Data cascade understanding - global, directory, file
2. Template language choice - Nunjucks, Liquid, or Markdown
3. Collections for organizing content
4. Filters and shortcodes for reusable logic
5. Incremental builds for speed

## Red Lines
- Complex JavaScript in templates - use shortcodes
- Missing pagination for large collections
- No data files for site-wide configuration
- Ignoring permalink structure for SEO
- Hardcoded values instead of data files

## Pattern: Blog with Collections
```javascript
// .eleventy.js
module.exports = function(eleventyConfig) {
  // Collections
  eleventyConfig.addCollection("posts", collection =>
    collection.getFilteredByGlob("src/posts/*.md").sort((a, b) =>
      b.date - a.date
    )
  );

  // Filters
  eleventyConfig.addFilter("dateFormat", date =>
    new Date(date).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    })
  );

  // Shortcodes
  eleventyConfig.addShortcode("year", () => `${new Date().getFullYear()}`);

  // Passthrough copy
  eleventyConfig.addPassthroughCopy("src/assets");

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    }
  };
};

// src/_data/site.json
{
  "name": "My Blog",
  "url": "https://example.com",
  "author": "Jane Doe"
}

// src/posts/posts.json (directory data)
{
  "layout": "post.njk",
  "tags": "posts"
}

// src/posts/hello-world.md
---
title: Hello World
date: 2024-01-15
---
This is my first post!

// src/_includes/post.njk
<article>
  <h1>{{ title }}</h1>
  <time>{{ date | dateFormat }}</time>
  {{ content | safe }}
</article>
```

## Integrates With
- **CMS**: Netlify CMS, Forestry, or headless CMS
- **Styling**: PostCSS, Tailwind, or Sass
- **Images**: `@11ty/eleventy-img` for optimization
- **Deploy**: Netlify, Vercel, GitHub Pages

## Common Errors
| Error | Fix |
|-------|-----|
| `Template not found` | Check `_includes` path |
| `Collection empty` | Check glob pattern and front matter |
| `Date is undefined` | Add `date` to front matter |
| `Permalink collision` | Ensure unique permalinks |

## Prod Ready
- [ ] Image optimization configured
- [ ] Sitemap generated
- [ ] RSS feed for posts
- [ ] Minified HTML/CSS
- [ ] Cache busting for assets
- [ ] 404 page configured
