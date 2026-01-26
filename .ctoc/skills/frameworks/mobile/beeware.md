# BeeWare CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
# Create virtual environment
python -m venv venv && source venv/bin/activate
# Install Briefcase (packaging tool)
pip install briefcase
# Create new project
briefcase new
# Run in dev mode
briefcase dev
```

## Claude's Common Mistakes
1. **Assumes all widgets available on all platforms** - Toga widgets vary by platform
2. **Uses CPython-only libraries** - Must check mobile compatibility
3. **Blocks event loop** - Heavy computation blocks UI
4. **Ignores Briefcase packaging** - Testing without packaging misses issues
5. **Uses asyncio incorrectly** - Must use `add_background_task` pattern

## Correct Patterns (2026)
```python
import toga
from toga.style import Pack
from toga.style.pack import COLUMN
import asyncio

class DataApp(toga.App):
    def startup(self):
        self.main_window = toga.MainWindow(title=self.formal_name)
        self.label = toga.Label('Loading...', style=Pack(padding=10))
        self.main_window.content = toga.Box(
            children=[self.label],
            style=Pack(direction=COLUMN)
        )
        self.main_window.show()
        # Use add_background_task for async operations
        self.add_background_task(self.load_data)

    async def load_data(self, widget):
        # Yield to event loop first
        await asyncio.sleep(0)
        try:
            data = await self.fetch_from_api()
            # Safe to update UI - we're on main thread
            self.label.text = f'Loaded: {data}'
        except Exception as e:
            self.label.text = f'Error: {e}'

    async def fetch_from_api(self):
        # Use httpx for async HTTP
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get('https://api.example.com/data')
            return response.json()
```

## Version Gotchas
- **Toga 0.4+**: Widget API changes, check migration guide
- **Briefcase 0.3.18+**: pyproject.toml format changes
- **iOS**: Requires macOS with Xcode command line tools
- **Android**: Requires Java 17+ for Gradle builds

## What NOT to Do
- Do NOT assume widget availability - check Toga platform support
- Do NOT use requests library - use httpx for async HTTP
- Do NOT block main thread - use `add_background_task`
- Do NOT test only with `briefcase dev` - test packaged builds
- Do NOT use libraries with C extensions without checking mobile support
