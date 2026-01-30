# Pelican CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
pip install pelican markdown
pelican-quickstart
pelican --autoreload --listen
# Pelican 4.x - Python static site generator
```

## Claude's Common Mistakes
1. **Hardcoded URLs** — Use `SITEURL` variable in templates
2. **Wrong config for production** — Use `publishconf.py` for deployment
3. **Missing content metadata** — All articles need title, date
4. **Complex logic in templates** — Use plugins for processing
5. **No theme customization** — Default theme not production-ready

## Correct Patterns (2026)
```python
# pelicanconf.py
AUTHOR = 'Your Name'
SITENAME = 'My Site'
SITEURL = ''  # Empty for dev
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

# Feed (disable in dev)
FEED_ALL_ATOM = None
```

```python
# publishconf.py (for production)
import os
import sys
sys.path.append(os.curdir)
from pelicanconf import *

SITEURL = 'https://example.com'  # REQUIRED for production
FEED_ALL_ATOM = 'feeds/all.atom.xml'
DELETE_OUTPUT_DIRECTORY = True
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
      <!-- Use SITEURL (NOT hardcoded paths) -->
      <a href="{{ SITEURL }}/{{ tag.url }}">{{ tag.name }}</a>
    {% endfor %}
  </div>
  {% endif %}
</article>
{% endblock %}
```

## Version Gotchas
- **Pelican 4.x**: Python 3.8+ required; Jinja2 templates
- **SITEURL**: Empty in dev, full URL in `publishconf.py`
- **Metadata**: Title and date required in all content
- **Plugins**: Install from pelican-plugins repository

## What NOT to Do
- ❌ Hardcoded URLs — Use `{{ SITEURL }}` in templates
- ❌ `pelicanconf.py` for production — Use `publishconf.py`
- ❌ Missing metadata — Articles fail to render
- ❌ Default theme in production — Customize or use community theme
- ❌ Logic in templates — Write plugins instead

## Common Errors
| Error | Fix |
|-------|-----|
| `No valid files found` | Check ARTICLE_PATHS setting |
| `Template not found` | Check THEME path |
| `Metadata error` | Add title/date to content front matter |
| `SITEURL empty` | Use publishconf.py for production |
