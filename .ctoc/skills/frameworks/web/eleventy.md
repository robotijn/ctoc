# Eleventy CTO
> Flexible static site generator.

## Non-Negotiables
1. Data cascade understanding
2. Template language choice
3. Collections for content
4. Filters and shortcodes
5. Incremental builds

## Red Lines
- JavaScript in templates
- Missing pagination
- No data files for config
- Ignoring permalink structure

## Pattern
```javascript
// .eleventy.js
module.exports = function(eleventyConfig) {
  eleventyConfig.addCollection("posts", collection =>
    collection.getFilteredByGlob("src/posts/*.md")
  );
  return { dir: { input: "src", output: "_site" } };
};
```
