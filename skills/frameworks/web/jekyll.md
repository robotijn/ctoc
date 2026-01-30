# Jekyll CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
gem install bundler jekyll
jekyll new mysite && cd mysite
bundle exec jekyll serve --livereload
# Jekyll 4.x - Ruby static site generator
```

## Claude's Common Mistakes
1. **Hardcoded URLs** — Use `relative_url` and `absolute_url` filters
2. **Complex Liquid logic** — Extract to includes
3. **Ignoring GitHub Pages whitelist** — Some plugins don't work
4. **Missing front matter** — Required for Liquid processing
5. **No collections for structured content** — Better than posts for custom types

## Correct Patterns (2026)
```liquid
<!-- _layouts/post.html -->
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
      <!-- Use relative_url filter (NOT hardcoded paths) -->
      <a href="{{ '/tags/' | append: tag | relative_url }}">{{ tag }}</a>
    {% endfor %}
  </footer>
  {% endif %}
</article>

<!-- _includes/post-list.html -->
{% for post in site.posts limit: include.limit %}
<article>
  <h2><a href="{{ post.url | relative_url }}">{{ post.title }}</a></h2>
  <time>{{ post.date | date: "%B %d, %Y" }}</time>
  {{ post.excerpt }}
</article>
{% endfor %}
```

```yaml
# _config.yml
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

## Version Gotchas
- **Jekyll 4.x**: Ruby 2.5+ required; faster builds
- **GitHub Pages**: Limited plugin whitelist; use Actions for full Jekyll
- **Liquid**: Use `| relative_url` for all internal links
- **Collections**: Define in `_config.yml` with `output: true`

## What NOT to Do
- ❌ Hardcoded paths — Use `| relative_url` filter
- ❌ Complex Liquid in layouts — Extract to `_includes/`
- ❌ Missing front matter — Content won't process
- ❌ Unsupported plugins on GH Pages — Check whitelist
- ❌ Posts for all content — Use collections for custom types

## Common Errors
| Error | Fix |
|-------|-----|
| `Liquid syntax error` | Check bracket matching, filter syntax |
| `Page not found` | Check front matter and permalink |
| `Plugin not working` | Check Gemfile and `_config.yml` |
| `GitHub Pages build fail` | Use whitelisted plugins only |
