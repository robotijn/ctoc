# Hexo CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm install -g hexo-cli
hexo init myblog && cd myblog && npm install
hexo server
# Hexo 7.x - Node.js static site generator
```

## Claude's Common Mistakes
1. **Hardcoded paths** — Use helpers like `url_for()`, `asset_url()`
2. **Missing front matter** — All posts need YAML front matter
3. **No asset pipeline** — Use hexo-asset-image for images
4. **Ignoring draft workflow** — Use `hexo new draft` for unpublished
5. **Skipping theme helpers** — Use built-in helpers, not raw paths

## Correct Patterns (2026)
```yaml
# _config.yml
title: My Blog
url: https://example.com
root: /
permalink: :year/:month/:day/:title/
theme: my-theme

# Deployment
deploy:
  type: git
  repo: git@github.com:user/user.github.io
  branch: main

# Highlight
highlight:
  enable: true
  line_number: true
  auto_detect: true
```

```ejs
<!-- themes/my-theme/layout/post.ejs -->
<article class="post">
  <h1><%- page.title %></h1>
  <time><%- date(page.date, 'YYYY-MM-DD') %></time>

  <%- page.content %>

  <% if (page.tags && page.tags.length) { %>
    <div class="tags">
      <% page.tags.forEach(tag => { %>
        <!-- Use url_for helper (NOT hardcoded paths) -->
        <a href="<%- url_for(tag.path) %>"><%= tag.name %></a>
      <% }) %>
    </div>
  <% } %>
</article>
```

```markdown
---
title: My First Post
date: 2026-01-15 10:00:00
tags:
  - javascript
  - tutorial
categories:
  - Programming
---

Post content here with **proper front matter**.
```

## Version Gotchas
- **Hexo 7.x**: ESM support; Node.js 18+ required
- **Helpers**: `url_for()`, `asset_url()`, `date()` for templates
- **Front matter**: YAML between `---` markers required
- **Drafts**: `hexo new draft "title"` for unpublished posts

## What NOT to Do
- ❌ Hardcoded paths — Use `url_for()` helper
- ❌ Missing front matter — Posts won't render correctly
- ❌ Manual image paths — Use hexo-asset-image
- ❌ Direct publish — Use draft workflow
- ❌ Raw HTML for dates — Use `date()` helper

## Common Errors
| Error | Fix |
|-------|-----|
| `Cannot find module` | Run `npm install` |
| `Theme not found` | Check `theme:` in _config.yml |
| `Invalid front matter` | Check YAML syntax (colons, indentation) |
| `Deploy failed` | Configure deploy section properly |
