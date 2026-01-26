# Jekyll CTO
> Ruby static site generator.

## Non-Negotiables
1. Liquid templating
2. Front matter usage
3. Collections for content types
4. Proper includes
5. Plugin awareness

## Red Lines
- Complex Liquid logic
- Missing layouts
- No collections for structured content
- Ignoring GitHub Pages limitations

## Pattern
```liquid
---
layout: default
title: My Post
---
{% for post in site.posts limit:5 %}
  <article>
    <h2><a href="{{ post.url }}">{{ post.title }}</a></h2>
    {{ post.excerpt }}
  </article>
{% endfor %}
```
