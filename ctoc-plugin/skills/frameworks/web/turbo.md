# Turbo CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm install @hotwired/turbo
# Or Rails: rails turbo:install
# Server returns HTML, not JSON
```

## Claude's Common Mistakes
1. **Building JSON APIs** — Turbo expects HTML responses
2. **Missing frame IDs** — Turbo can't target frames without matching IDs
3. **Full page reloads** — Use Turbo Frames for partial updates
4. **JavaScript for simple updates** — Use Turbo Streams instead
5. **No loading states** — Users need feedback during navigation

## Correct Patterns (2026)
```html
<!-- Turbo Frame for partial page updates -->
<turbo-frame id="users_list" src="/users" loading="lazy">
  <p>Loading users...</p>
</turbo-frame>

<!-- Row with in-place edit (frame targets itself) -->
<turbo-frame id="user_1">
  <tr>
    <td>john@example.com</td>
    <td>
      <a href="/users/1/edit" data-turbo-frame="user_1">Edit</a>
    </td>
  </tr>
</turbo-frame>

<!-- Server returns replacement frame -->
<turbo-frame id="user_1">
  <form action="/users/1" method="post">
    <input name="email" value="john@example.com" />
    <button type="submit">Save</button>
  </form>
</turbo-frame>

<!-- Turbo Stream for real-time updates -->
<!-- Server response (Content-Type: text/vnd.turbo-stream.html) -->
<turbo-stream action="replace" target="user_1">
  <template>
    <tr id="user_1">
      <td>updated@example.com</td>
    </tr>
  </template>
</turbo-stream>

<!-- Append new item to list -->
<turbo-stream action="append" target="users_list">
  <template>
    <tr id="user_2">...</tr>
  </template>
</turbo-stream>
```

## Version Gotchas
- **Turbo 8**: Latest with page refresh morphing
- **Content-Type**: Streams need `text/vnd.turbo-stream.html`
- **WebSocket**: Use Action Cable or Mercure for live streams
- **Rails 8**: Turbo built-in with new defaults

## What NOT to Do
- ❌ `fetch().then(r => r.json())` — Return HTML, not JSON
- ❌ `<turbo-frame>` without `id` — Can't be targeted
- ❌ JavaScript DOM manipulation — Use Turbo Streams
- ❌ Missing Accept header on forms — Streams won't work
- ❌ Full page refreshes for updates — Use frames

## Stream Actions
| Action | Effect |
|--------|--------|
| `append` | Add to end |
| `prepend` | Add to start |
| `replace` | Replace entire element |
| `update` | Replace content only |
| `remove` | Delete element |
| `before` | Insert before |
| `after` | Insert after |

## Pairs With
| Tool | Purpose |
|------|---------|
| Stimulus | JavaScript sprinkles |
| Rails | Server framework |
| Action Cable | WebSocket streams |
| HTMX | Alternative approach |
