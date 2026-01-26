# Pelican CTO
> Python static site generator - Jinja2 templates, powerful plugin system.

## Commands
```bash
# Setup | Dev | Test
pip install pelican markdown
pelican-quickstart
pelican --autoreload --listen
pelican content -o output -s publishconf.py
```

## Non-Negotiables
1. Jinja2 templating with proper inheritance
2. Settings organization (dev vs publish)
3. Plugin system for extensions
4. Content metadata (title, date, category, tags)
5. Proper output structure with SITEURL

## Red Lines
- Business logic in templates - use plugins
- Missing pelicanconf.py settings
- No theme customization for production
- Ignoring cache for build speed
- Hardcoded URLs instead of SITEURL

## Pattern: Config and Template
```python
# pelicanconf.py
AUTHOR = 'Your Name'
SITENAME = 'My Site'
SITEURL = ''
PATH = 'content'

ARTICLE_PATHS = ['blog']
PAGE_PATHS = ['pages']
STATIC_PATHS = ['images', 'extra']

TIMEZONE = 'America/New_York'
DEFAULT_LANG = 'en'

# Theme
THEME = 'themes/mytheme'

# Plugins
PLUGIN_PATHS = ['plugins']
PLUGINS = ['sitemap', 'related_posts']

# Feed
FEED_ALL_ATOM = 'feeds/all.atom.xml'
```

```html
{# themes/mytheme/templates/article.html #}
{% extends "base.html" %}

{% block content %}
<article class="post">
  <h1>{{ article.title }}</h1>
  <time datetime="{{ article.date.isoformat() }}">
    {{ article.locale_date }}
  </time>

  {{ article.content }}

  {% if article.tags %}
  <div class="tags">
    {% for tag in article.tags %}
      <a href="{{ SITEURL }}/{{ tag.url }}">{{ tag.name }}</a>
    {% endfor %}
  </div>
  {% endif %}
</article>
{% endblock %}
```

## Integrates With
- **Markdown**: markdown, pelican-render-math
- **Plugins**: sitemap, related_posts, neighbors
- **Themes**: pelican-themes repository
- **Hosting**: GitHub Pages, Netlify, S3

## Common Errors
| Error | Fix |
|-------|-----|
| `No valid files found` | Check ARTICLE_PATHS setting |
| `Template not found` | Check THEME path |
| `Metadata error` | Add required front matter to content |
| `SITEURL empty` | Use publishconf.py for production |

## Prod Ready
- [ ] publishconf.py with correct SITEURL
- [ ] Sitemap plugin enabled
- [ ] RSS/Atom feed configured
- [ ] Custom theme developed
- [ ] Cache enabled (LOAD_CONTENT_CACHE)
- [ ] Build automated in CI
