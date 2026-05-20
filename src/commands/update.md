---
description: Update CTOC to the latest version
disable-model-invocation: true
---

Update CTOC to the latest version from GitHub:

```bash
node "$(find ~/.claude/plugins/cache/robotijn/ctoc -path '*commands/update.js' 2>/dev/null | head -1 || echo NOTFOUND)" 2>&1 || echo "[CTOC] Update script not found in cache. Reinstall: /plugin marketplace add https://github.com/robotijn/ctoc && /plugin install ctoc"
```

This command works around the Claude Code plugin cache bug by:

1. Fetching the latest version from GitHub
2. Comparing with your current version
3. Clearing and repopulating the plugin cache
4. Updating the plugin registry

After updating, restart Claude Code to use the new version.

See: [Issue #21995](https://github.com/anthropics/claude-code/issues/21995)
