# Eleventy CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm init -y
npm install @11ty/eleventy
npx eleventy --serve
# Eleventy 3.x - zero-config static site generator
```

## Claude's Common Mistakes
1. **Complex JavaScript in templates** — Use shortcodes and filters
2. **Missing data cascade understanding** — Global > directory > file data
3. **Hardcoded values** — Use `_data/` files for configuration
4. **No pagination for large collections** — Memory issues
5. **Missing directory data files** — Reduces front matter duplication

## Correct Patterns (2026)
```javascript
// .eleventy.js
module.exports = function(eleventyConfig) {
  // Collections
  eleventyConfig.addCollection("posts", collection =>
    collection.getFilteredByGlob("src/posts/*.md")
      .sort((a, b) => b.date - a.date)
  );

  // Filters (NOT complex logic in templates)
  eleventyConfig.addFilter("dateFormat", date =>
    new Date(date).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    })
  );

  // Shortcodes for reusable logic
  eleventyConfig.addShortcode("year", () => `${new Date().getFullYear()}`);

  // Image optimization
  eleventyConfig.addPlugin(require("@11ty/eleventy-img"));

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

// src/_data/site.json (global data)
{
  "name": "My Blog",
  "url": "https://example.com"
}

// src/posts/posts.json (directory data - applies to all posts)
{
  "layout": "post.njk",
  "tags": "posts"
}
```

## Version Gotchas
- **Eleventy 3.x**: Current; ESM support, improved performance
- **Data cascade**: Global (`_data/`) > directory (folder.json) > front matter
- **Collections**: Must return sorted arrays
- **Pagination**: Required for large collections

## What NOT to Do
- ❌ Complex logic in Nunjucks templates — Use filters/shortcodes
- ❌ Hardcoded site name everywhere — Use `_data/site.json`
- ❌ Front matter in every file — Use directory data files
- ❌ Missing image optimization — Use `@11ty/eleventy-img`
- ❌ Unsorted collections — Sort in collection definition

## Data Cascade Order
1. Global data (`_data/*.json`)
2. Directory data (`folder.json`)
3. Front matter (per file)

## Common Errors
| Error | Fix |
|-------|-----|
| `Template not found` | Check `_includes/` path |
| `Collection empty` | Check glob pattern |
| `Date undefined` | Add `date` to front matter |
| `Permalink collision` | Ensure unique permalinks |
