# Turbo CTO
> HTML-over-the-wire framework.

## Non-Negotiables
1. Turbo Drive for navigation
2. Turbo Frames for partials
3. Turbo Streams for updates
4. Proper morphing
5. Cache-Control headers

## Red Lines
- Full page reloads
- Missing frame targets
- No stream actions
- JavaScript for simple updates

## Pattern
```html
<turbo-frame id="user_1">
  <form action="/users/1" method="post" data-turbo-frame="_top">
    <input name="name" value="John">
    <button type="submit">Save</button>
  </form>
</turbo-frame>
```
