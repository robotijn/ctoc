# Hugo CTO
> Fastest static site generator - Go templates, instant builds, zero dependencies.

## Commands
```bash
# Setup | Dev | Test
hugo new site mysite && cd mysite
hugo server -D
hugo --minify
```

## Non-Negotiables
1. Content organization with page bundles
2. Proper Go templating (logic in partials)
3. Taxonomies for categorization
4. Shortcodes for reusable components
5. Asset pipeline with Hugo Pipes

## Red Lines
- Complex logic in templates - use partials
- Missing archetypes for content types
- No partials for reusable elements
- Ignoring page bundles for organization
- Hardcoded URLs instead of `relref`

## Pattern: List and Single Templates
```go-html-template
{{/* layouts/_default/list.html */}}
{{ define "main" }}
<section>
  <h1>{{ .Title }}</h1>
  {{ .Content }}

  {{ range .Pages }}
  <article>
    <h2><a href="{{ .Permalink }}">{{ .Title }}</a></h2>
    <time datetime="{{ .Date.Format "2006-01-02" }}">
      {{ .Date.Format "January 2, 2006" }}
    </time>
    {{ .Summary }}
  </article>
  {{ end }}

  {{ template "_internal/pagination.html" . }}
</section>
{{ end }}

{{/* layouts/_default/single.html */}}
{{ define "main" }}
<article>
  <h1>{{ .Title }}</h1>
  <time>{{ .Date.Format "January 2, 2006" }}</time>

  {{ with .Params.cover }}
    {{ $img := resources.Get . }}
    {{ $img := $img.Resize "800x webp" }}
    <img src="{{ $img.RelPermalink }}" alt="{{ $.Title }}" />
  {{ end }}

  {{ .Content }}

  {{ with .GetTerms "tags" }}
  <div class="tags">
    {{ range . }}
      <a href="{{ .Permalink }}">{{ .Title }}</a>
    {{ end }}
  </div>
  {{ end }}
</article>
{{ end }}
```

## Integrates With
- **CMS**: Forestry, Netlify CMS, Decap CMS
- **Hosting**: Netlify, Vercel, GitHub Pages
- **Search**: Pagefind, Lunr.js
- **Comments**: Disqus, Utterances

## Common Errors
| Error | Fix |
|-------|-----|
| `Template not found` | Check `layouts/` structure matches content |
| `Nil pointer` | Use `with` to guard optional values |
| `Page not appearing` | Check front matter `draft: false` |
| `Image not processing` | Place in `assets/` not `static/` |

## Prod Ready
- [ ] `hugo --minify` for production
- [ ] Image processing with Hugo Pipes
- [ ] Sitemap generated automatically
- [ ] RSS feed configured
- [ ] robots.txt in place
- [ ] Build time < 1 second
