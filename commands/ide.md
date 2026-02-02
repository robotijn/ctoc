# IDE Configuration Command

Generate comprehensive IDE configuration files for your project.

## Usage

```bash
ctoc ide init [ide]     # Generate IDE configuration
ctoc ide detect         # Detect current IDE environment
ctoc ide list           # List available configurations
```

## IDE Options

| Option | Description |
|--------|-------------|
| `vscode` | Visual Studio Code |
| `jetbrains` | JetBrains IDEs (IntelliJ, PyCharm, WebStorm, GoLand, etc.) |
| `vim` | Vim/Neovim (coc.nvim or native LSP) |
| `cursor` | Cursor IDE |
| `all` | Generate for all supported IDEs |

## Examples

### Initialize VS Code Configuration
```bash
ctoc ide init vscode
```

Generates:
- `.vscode/settings.json` - Editor settings, formatters, linters
- `.vscode/extensions.json` - Recommended extensions
- `.vscode/launch.json` - Debug configurations
- `.vscode/tasks.json` - Build and test tasks

### Initialize JetBrains Configuration
```bash
ctoc ide init jetbrains
```

Generates:
- `.idea/codeStyles/Project.xml` - Code style settings
- `.idea/inspectionProfiles/Project_Default.xml` - Inspection settings
- `.idea/runConfigurations/` - Run configurations

### Initialize Vim/Neovim Configuration
```bash
ctoc ide init vim
```

Generates:
- `coc-settings.json` - CoC configuration
- Reference `init.lua` template location

### Initialize All IDEs
```bash
ctoc ide init all
```

Generates configurations for all supported IDEs.

### Auto-detect IDE
```bash
ctoc ide init
```

Automatically detects your IDE from environment variables and generates appropriate configuration.

## Options

| Flag | Description |
|------|-------------|
| `--dry-run` | Show what would be generated without writing files |
| `--force` | Overwrite existing files without merging |
| `--merge` | Merge with existing configurations (default) |

## How It Works

1. **Detection**: Analyzes your project to detect languages and frameworks
2. **Template Selection**: Chooses appropriate templates based on your stack
3. **Customization**: Applies project-specific settings
4. **Merge**: Intelligently merges with existing configurations

## Configuration Files Generated

### VS Code

```
.vscode/
  settings.json       # Editor settings, formatters, language-specific config
  extensions.json     # Recommended extensions per language
  launch.json         # Debug configurations (Node, Python, Go, Rust, etc.)
  tasks.json          # Build, test, lint tasks
```

### JetBrains

```
.idea/
  codeStyles/
    Project.xml       # Code formatting per language
  inspectionProfiles/
    Project_Default.xml  # Inspection severity levels
  runConfigurations/
    *.xml             # Run/debug configurations
```

### Vim/Neovim

```
coc-settings.json     # CoC extension settings
~/.config/nvim/
  init.lua            # Neovim native LSP (reference)
```

### Cursor

```
.cursor/
  settings.json       # Cursor AI settings + VS Code base
```

## Features

### Smart Detection

The command automatically detects:
- **Languages**: TypeScript, Python, Go, Rust, Java, etc.
- **Frameworks**: React, Next.js, FastAPI, Django, etc.
- **Tools**: ESLint, Prettier, Ruff, etc.

### Conflict-Free Configuration

Settings are designed to be conflict-free:
- Formatters don't conflict with linters
- Language-specific settings don't override each other
- Safe defaults with room for customization

### Best Practices

All configurations follow 2024 best practices:
- Modern tooling (Ruff for Python, Biome for JS, etc.)
- Security-conscious defaults
- Performance-optimized settings

## Customization

After generation, customize for your project:

1. Review generated files
2. Adjust settings for your team's preferences
3. Add project-specific paths and configurations
4. Commit shared settings (extensions.json, code styles)

## Git Recommendations

### Commit (shared with team)
```
.vscode/extensions.json
.vscode/launch.json
.vscode/tasks.json
.idea/codeStyles/
.idea/inspectionProfiles/
```

### Gitignore (user-specific)
```
.vscode/settings.json  # May contain local paths
.idea/workspace.xml
.idea/*.iml
```

## Troubleshooting

### "Cannot detect IDE"
The command uses environment variables to detect IDEs. If detection fails:
```bash
ctoc ide init vscode  # Specify IDE explicitly
```

### "Merge failed"
If configuration merge fails:
```bash
ctoc ide init vscode --force  # Overwrite existing
```

### "Extension not found"
Some extensions may need manual installation:
```bash
code --install-extension <extension-id>
```
