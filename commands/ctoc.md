---
description: CTOC Dashboard - Your Virtual CTO command center
---

Show the CTOC dashboard and menu. This is the main entry point for CTOC.

```bash
node "${CLAUDE_PLUGIN_ROOT}/commands/menu.js"
```

---

## Instructions

When this command is invoked, execute the menu.js script above to display the CTOC dashboard, then follow ALL rules from the menu.md file in this directory.

**Key behaviors:**
1. Show the dashboard table with plan counts
2. Show the numbered menu options
3. Wait for user selection
4. Always show a menu after every response

For complete menu rules and behaviors, see: `commands/menu.md`
