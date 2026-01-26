# Jekyll CTO
> Ruby static site generator - GitHub Pages native, Liquid templates.

## Commands
```bash
# Setup | Dev | Test
gem install bundler jekyll && jekyll new mysite && cd mysite
bundle exec jekyll serve --livereload
bundle exec jekyll build
```

## Non-Negotiables
1. Liquid templating syntax
2. Front matter on all content
3. Collections for custom content types
4. Includes for reusable components
5. Plugin awareness (especially for GitHub Pages)

## Red Lines
- Complex Liquid logic - use includes
- Missing layouts for structure
- No collections for structured content
- Ignoring GitHub Pages plugin whitelist
- Hardcoded site URLs

## Pattern: Layout and Collection
```liquid
{{! _layouts/post.html }}
---
layout: default
---
<article class="post">
  <header>
    <h1>{{ page.title }}</h1>
    <time datetime="{{ page.date | date_to_xmlschema }}">
      {{ page.date | date: "%B %d, %Y" }}
    </time>
  </header>

  {{ content }}

  {% if page.tags.size > 0 %}
  <footer>
    {% for tag in page.tags %}
      <a href="{{ '/tags/' | append: tag | relative_url }}">{{ tag }}</a>
    {% endfor %}
  </footer>
  {% endif %}
</article>

{{! _includes/post-list.html }}
{% for post in site.posts limit: include.limit %}
<article>
  <h2><a href="{{ post.url | relative_url }}">{{ post.title }}</a></h2>
  <time>{{ post.date | date: "%B %d, %Y" }}</time>
  {{ post.excerpt }}
</article>
{% endfor %}

{{! index.html }}
---
layout: default
title: Home
---
<h1>Recent Posts</h1>
{% include post-list.html limit=5 %}

{{! _config.yml }}
title: My Site
url: "https://example.com"
collections:
  projects:
    output: true
    permalink: /projects/:name/
defaults:
  - scope:
      path: ""
      type: "posts"
    values:
      layout: "post"
```

## Integrates With
- **Hosting**: GitHub Pages, Netlify, Vercel
- **CMS**: Forestry, Prose.io, Netlify CMS
- **Search**: Lunr.js, Algolia
- **Comments**: Disqus, Staticman

## Common Errors
| Error | Fix |
|-------|-----|
| `Liquid syntax error` | Check bracket matching, filter syntax |
| `Page not found` | Check front matter and permalink |
| `Plugin not working` | Check Gemfile and `_config.yml` |
| `GitHub Pages build fail` | Use whitelisted plugins only |

## Prod Ready
- [ ] `JEKYLL_ENV=production` set
- [ ] Minification with `jekyll-minifier`
- [ ] Sitemap with `jekyll-sitemap`
- [ ] SEO with `jekyll-seo-tag`
- [ ] Feed with `jekyll-feed`
- [ ] Caching headers configured
