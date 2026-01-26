# Contributing to CTOC

Thank you for your interest in contributing to CTOC! This document provides guidelines for contributing.

## Ways to Contribute

### Report Bugs

Found a bug? Please open an issue with:
- A clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Your environment (OS, Claude Code version, languages/frameworks)

### Suggest Features

Have an idea? Open an issue with:
- A clear description of the feature
- Why it would be useful
- How it might work

### Add Language/Framework Support

CTOC supports 100+ languages and 200+ frameworks. To add a new one:

1. Create a profile in `profiles/languages/` or `profiles/frameworks/`
2. Include:
   - Detection patterns
   - Quality gate commands (lint, format, test, etc.)
   - Best practices
3. Test with a sample project
4. Submit a pull request

### Improve Documentation

Documentation improvements are always welcome:
- Fix typos
- Add examples
- Clarify confusing sections
- Translate to other languages

### Share Your Experience

Tell us how CTOC works for you:
- What AI tools have you used?
- What went well?
- What was confusing?
- Share in [Discussions](https://github.com/robotijn/ctoc/discussions)

## Development Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/ctoc.git
   cd ctoc
   ```
3. Create a branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
4. Make your changes
5. Test your changes
6. Commit with a clear message:
   ```bash
   git commit -m "feat: Add support for Elixir"
   ```
7. Push and open a pull request

## Commit Message Format

We use conventional commits:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation only
- `style:` Formatting, no code change
- `refactor:` Code change that neither fixes a bug nor adds a feature
- `test:` Adding tests
- `chore:` Maintenance tasks

Examples:
- `feat: Add support for Rust`
- `fix: Correct Python lint command`
- `docs: Add example for planning multiple features`

## Pull Request Process

1. Ensure your code follows existing patterns
2. Update documentation if needed
3. Add tests if applicable
4. Fill out the pull request template
5. Wait for review

## Code of Conduct

Be kind and respectful. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Questions?

- Open an issue
- Start a discussion
- Check existing issues and discussions first

Thank you for contributing!
