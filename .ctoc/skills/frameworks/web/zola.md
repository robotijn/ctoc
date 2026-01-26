# Zola CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Install: brew install zola / cargo install zola
zola init mysite && cd mysite
zola serve
# Zola 0.19.x - fast Rust static site generator
```

## Claude's Common Mistakes
1. **Missing `_index.md`** — Required for every section directory
2. **Hardcoded URLs** — Use `{{ config.base_url }}` or permalinks
3. **Complex logic in templates** — Use shortcodes instead
4. **Wrong front matter format** — Zola uses TOML (`+++`), not YAML
5. **Ignoring taxonomies** — Define in config before using

## Correct Patterns (2026)
```toml
# config.toml
base_url = "https://example.com"
title = "My Site"
generate_feed = true
compile_sass = true

[markdown]
highlight_code = true
highlight_theme = "base16-ocean-dark"

[extra]
author = "Your Name"

[taxonomies]
categories = [{ name = "categories", feed = true }]
tags = [{ name = "tags" }]
```

```markdown
<!-- content/blog/_index.md -->
+++
title = "Blog"
sort_by = "date"
paginate_by = 10
+++

Welcome to my blog!
```

```html
{# templates/blog/list.html #}
{% extends "base.html" %}

{% block content %}
<h1>{{ section.title }}</h1>
{{ section.content | safe }}

{% for page in paginator.pages %}
<article>
  <h2><a href="{{ page.permalink }}">{{ page.title }}</a></h2>
  <time datetime="{{ page.date }}">
    {{ page.date | date(format="%B %d, %Y") }}
  </time>
  {{ page.summary | safe }}
</article>
{% endfor %}

{% if paginator.previous or paginator.next %}
<nav>
  {% if paginator.previous %}<a href="{{ paginator.previous }}">Previous</a>{% endif %}
  {% if paginator.next %}<a href="{{ paginator.next }}">Next</a>{% endif %}
</nav>
{% endif %}
{% endblock %}
```

```html
{# templates/shortcodes/youtube.html #}
<div class="video">
  <iframe src="https://www.youtube.com/embed/{{ id }}" allowfullscreen></iframe>
</div>
{# Usage: {{ youtube(id="dQw4w9WgXcQ") }} #}
```

## Version Gotchas
- **Zola 0.19.x**: Single binary; instant builds
- **Front matter**: TOML format with `+++` delimiters
- **Sections**: Every directory needs `_index.md`
- **Tera**: Template engine with Jinja2-like syntax

## What NOT to Do
- ❌ Missing `_index.md` in sections — Content not rendered
- ❌ YAML front matter (`---`) — Use TOML (`+++`)
- ❌ Hardcoded URLs — Use `{{ page.permalink }}`
- ❌ Complex template logic — Use shortcodes
- ❌ Undefined taxonomies — Add to `[taxonomies]` first

## Common Errors
| Error | Fix |
|-------|-----|
| `Section not found` | Add `_index.md` to directory |
| `Template not found` | Check `templates/` structure |
| `Taxonomy not defined` | Add to `[taxonomies]` in config |
| `TOML parse error` | Check front matter syntax |
