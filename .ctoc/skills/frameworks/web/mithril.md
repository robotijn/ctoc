# Mithril.js CTO
> Hyperscript UI framework.

## Non-Negotiables
1. Component closures
2. m.request for data
3. Route-based architecture
4. Proper redraw control
5. Minimal vnode allocation

## Red Lines
- Unnecessary redraws
- Missing keys in lists
- Sync XHR calls
- Over-componentization

## Pattern
```javascript
const Counter = () => {
  let count = 0;
  return {
    view: () => m('button', {
      onclick: () => count++
    }, count)
  };
};

m.mount(root, Counter);
```
