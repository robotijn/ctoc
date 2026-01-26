# BeeWare CTO
> Native Python apps with native UI widgets

## Non-Negotiables
1. Use Toga for cross-platform native UI, not web-based widgets
2. Package with Briefcase for each target platform
3. Keep platform-specific code isolated in separate modules
4. Use asyncio for non-blocking operations
5. Test on actual devices; simulators miss platform quirks

## Red Lines
- Never assume widget availability across all platforms
- Don't use CPython-only libraries without checking mobile compatibility
- Avoid heavy computation in event handlers; use background tasks
- Never ship without testing the Briefcase-packaged binary
- Don't ignore Briefcase warnings about unsupported dependencies

## Pattern
```python
import toga
from toga.style import Pack

class MyApp(toga.App):
    def startup(self):
        self.main_window = toga.MainWindow(title=self.formal_name)
        self.main_window.content = toga.Box(
            children=[
                toga.Label("Hello, BeeWare!", style=Pack(padding=10))
            ]
        )
        self.main_window.show()
```
