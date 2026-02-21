# /ctoc init

Initialize a project with CTOC methodology.

## Usage

```
ctoc init              # Initialize current project
ctoc init --force      # Overwrite existing files
ctoc init --dry-run    # Preview what would be created
```

## What It Does

1. **Detects** your project's languages, frameworks, and tools
2. **Generates** a tailored `CLAUDE.md` with Iron Loop methodology
3. **Creates** the `plans/` directory structure for plan management
4. **Configures** `.ctoc/settings.yaml` with quality gates
5. **Initializes** Iron Loop state for session tracking

## Behavior

When the user runs `ctoc init`:

1. Run `lib/init-project.js` with the current working directory
2. Display the detection results (languages, frameworks)
3. Show what files were created and what was skipped
4. If `--dry-run`, show what WOULD be created without creating anything
5. If `--force`, overwrite existing CLAUDE.md and settings

## Output Format

```
CTOC Project Initialized
========================

Project: my-app
Languages: typescript, javascript
Frameworks: nextjs, react

Created:
  + CLAUDE.md
  + IRON_LOOP.md
  + plans/functional/draft/
  + plans/functional/approved/
  + plans/implementation/draft/
  + plans/implementation/approved/
  + plans/execution/
  + plans/todo/
  + plans/in_progress/
  + plans/review/
  + plans/done/
  + .ctoc/settings.yaml
  + .ctoc/state/iron-loop.yaml

Skipped:
  - .gitignore (no changes needed)

Next steps:
  1. Review the generated CLAUDE.md
  2. Run: ctoc plan new "your first feature"
  3. Follow the Iron Loop!
```

## After Initialization

Show the menu:

```
[1] Review CLAUDE.md
[2] Create first plan
[3] Run doctor (health check)
[0] Done
```
