# Hexo CTO
> Node.js blog framework - fast static generation, powerful plugin ecosystem.

## Commands
```bash
# Setup | Dev | Test
npm install -g hexo-cli && hexo init myblog && cd myblog
hexo server
hexo generate && hexo deploy
```

## Non-Negotiables
1. EJS/Pug/Nunjucks templating consistency
2. Proper tag and filter plugins
3. Asset pipeline with hexo-asset-image
4. Theme development with partials
5. Generator plugins for custom content

## Red Lines
- Hard-coded paths in templates - use helpers
- Missing hexo helpers (url_for, asset_url)
- No asset pipeline for images
- Ignoring draft/publish workflow
- Skipping front matter validation

## Pattern: Theme and Config
```yaml
# _config.yml
title: My Blog
url: https://example.com
theme: my-theme
permalink: :year/:month/:day/:title/
new_post_name: :year-:month-:day-:title.md

# Deployment
deploy:
  type: git
  repo: git@github.com:user/user.github.io
  branch: main

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
        <a href="<%- url_for(tag.path) %>"><%= tag.name %></a>
      <% }) %>
    </div>
  <% } %>
</article>
```

## Integrates With
- **Hosting**: GitHub Pages, Netlify, Vercel
- **Search**: hexo-generator-search
- **SEO**: hexo-generator-sitemap, hexo-generator-feed
- **Images**: hexo-asset-image for relative paths

## Common Errors
| Error | Fix |
|-------|-----|
| `Cannot find module` | Run `npm install` in blog root |
| `Theme not found` | Check `theme:` in _config.yml |
| `Invalid front matter` | Check YAML syntax in post header |
| `Deploy failed` | Configure deploy section properly |

## Prod Ready
- [ ] Custom theme developed
- [ ] Asset pipeline configured
- [ ] Sitemap and RSS feed enabled
- [ ] Search enabled with hexo-generator-search
- [ ] Deployment automated
- [ ] Draft workflow in use
