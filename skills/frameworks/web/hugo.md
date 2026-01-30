# Hugo CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
hugo new site my-site
cd my-site && hugo server -D
# Hugo 0.140+ - fastest static site generator
```

## Claude's Common Mistakes
1. **Complex logic in templates** — Extract to partials
2. **Hardcoded URLs** — Use `relref` and `absURL`
3. **Images in `static/`** — Put in `assets/` for Hugo Pipes processing
4. **Missing `with` guards** — Nil pointer crashes on optional values
5. **No page bundles** — Use leaf/branch bundles for content organization

## Correct Patterns (2026)
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

  {{/* Guard optional values with `with` */}}
  {{ with .Params.cover }}
    {{ $img := resources.Get . }}
    {{ $img := $img.Resize "800x webp" }}
    <img src="{{ $img.RelPermalink }}" alt="{{ $.Title }}" />
  {{ end }}

  {{ .Content }}
</article>
{{ end }}
```

## Version Gotchas
- **Hugo 0.140+**: Current; sub-second builds
- **Hugo Pipes**: Image processing requires `assets/` not `static/`
- **Page bundles**: Leaf (content) vs branch (section) bundles
- **Go templates**: `with` creates new scope; use `$.` for parent

## What NOT to Do
- ❌ Complex logic in templates — Extract to partials
- ❌ `<a href="/posts/my-post">` — Use `{{ relref . "my-post" }}`
- ❌ Images in `static/` — No processing; use `assets/`
- ❌ `{{ .Params.image }}` without `with` — Nil pointer crash
- ❌ `{{ range }}` without empty check — Renders nothing silently

## Hugo Pipes (Image Processing)
```go-html-template
{{ $img := resources.Get "images/photo.jpg" }}
{{ $resized := $img.Resize "600x webp" }}
<img src="{{ $resized.RelPermalink }}" alt="..." />
```

## Common Errors
| Error | Fix |
|-------|-----|
| `Nil pointer` | Add `with` guard for optional values |
| `Template not found` | Check `layouts/` structure |
| `Page not appearing` | Set `draft: false` in front matter |
| `Image not processing` | Move to `assets/`, not `static/` |
