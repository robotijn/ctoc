# Turbo CTO
> HTML-over-the-wire framework - Drive, Frames, Streams for SPA-like speed.

## Commands
```bash
# Setup | Dev | Test
npm install @hotwired/turbo
# Or Rails: rails turbo:install
# Backend serves HTML responses
```

## Non-Negotiables
1. Turbo Drive for automatic navigation
2. Turbo Frames for partial page updates
3. Turbo Streams for real-time mutations
4. Proper morphing strategy
5. Cache-Control headers for performance

## Red Lines
- Full page reloads when frames work
- Missing frame IDs for targeting
- No stream actions for live updates
- JavaScript for simple HTML updates
- Ignoring Turbo's loading states

## Pattern: Frames and Streams
```html
<!-- List page with lazy-loaded frame -->
<turbo-frame id="users_list" src="/users" loading="lazy">
  <p>Loading users...</p>
</turbo-frame>

<!-- User row with frame for edit -->
<turbo-frame id="user_1">
  <tr>
    <td>john@example.com</td>
    <td>
      <a href="/users/1/edit" data-turbo-frame="user_1">Edit</a>
    </td>
  </tr>
</turbo-frame>

<!-- Edit form replaces frame content -->
<turbo-frame id="user_1">
  <form action="/users/1" method="post">
    <input name="email" value="john@example.com" />
    <button type="submit">Save</button>
    <a href="/users/1" data-turbo-frame="user_1">Cancel</a>
  </form>
</turbo-frame>

<!-- Server response with Turbo Stream -->
<turbo-stream action="replace" target="user_1">
  <template>
    <tr id="user_1">
      <td>updated@example.com</td>
      <td><a href="/users/1/edit">Edit</a></td>
    </tr>
  </template>
</turbo-stream>

<!-- Append new item -->
<turbo-stream action="append" target="users_list">
  <template>
    <tr id="user_2">...</tr>
  </template>
</turbo-stream>
```

## Stream Actions
| Action | Description |
|--------|-------------|
| `append` | Add to end of target |
| `prepend` | Add to start of target |
| `replace` | Replace target element |
| `update` | Replace target's content |
| `remove` | Remove target element |
| `before` | Insert before target |
| `after` | Insert after target |

## Integrates With
- **Backend**: Rails, Laravel, Django (server renders HTML)
- **Stimulus**: For JavaScript sprinkles
- **WebSocket**: Action Cable, Mercure for live streams
- **Morphing**: `data-turbo-method` for animations

## Common Errors
| Error | Fix |
|-------|-----|
| `Frame not found` | Check ID matches, frame exists |
| `No Turbo Stream` | Set `Accept: text/vnd.turbo-stream.html` |
| `Form not submitting` | Check `data-turbo="true"` |
| `Scroll jumping` | Use `data-turbo-action="advance"` |

## Prod Ready
- [ ] Cache-Control headers configured
- [ ] Progress bar styled
- [ ] Frame loading states handled
- [ ] Stream actions for real-time
- [ ] Fallback for non-JS browsers
- [ ] WebSocket for live updates
