# Zola CTO
> Fast Rust static site generator - single binary, Tera templates, instant builds.

## Commands
```bash
# Setup | Dev | Test
zola init mysite && cd mysite
zola serve
zola build
```

## Non-Negotiables
1. Tera templating for layouts
2. Section organization with `_index.md`
3. Taxonomies for categorization
4. Shortcodes for reusable components
5. Sass compilation built-in

## Red Lines
- Complex logic in templates - use shortcodes
- Missing `_index.md` for sections
- No front matter metadata
- Ignoring syntax highlighting config
- Hardcoded URLs instead of macros

## Pattern: Section and Template
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
# content/blog/_index.md
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
  {% if paginator.previous %}
    <a href="{{ paginator.previous }}">Previous</a>
  {% endif %}
  {% if paginator.next %}
    <a href="{{ paginator.next }}">Next</a>
  {% endif %}
</nav>
{% endif %}
{% endblock %}
```

```html
{# templates/shortcodes/youtube.html #}
<div class="video">
  <iframe src="https://www.youtube.com/embed/{{ id }}"
          allowfullscreen></iframe>
</div>

{# Usage in content: {{ youtube(id="dQw4w9WgXcQ") }} #}
```

## Integrates With
- **Hosting**: Netlify, Vercel, GitHub Pages
- **Styling**: Sass built-in, Tailwind via CLI
- **Search**: Built-in search index
- **Themes**: zola-themes community

## Common Errors
| Error | Fix |
|-------|-----|
| `Section not found` | Add `_index.md` to directory |
| `Template not found` | Check `templates/` structure |
| `Taxonomy not defined` | Add to `[taxonomies]` in config |
| `Syntax highlight broken` | Check theme name in config |

## Prod Ready
- [ ] `zola build` for production
- [ ] Sitemap generated automatically
- [ ] RSS/Atom feed enabled
- [ ] Syntax highlighting configured
- [ ] Search index generated
- [ ] Build time < 100ms
