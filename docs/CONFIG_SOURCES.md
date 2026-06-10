# Configuration Sources

CTOC deliberately uses **two** project-level config files. They are read by
different layers, so edit the right one.

| File | Read by | Owns | Format |
|------|---------|------|--------|
| `.ctoc/settings.json` | `src/lib/settings.js` (menu-driven store) and `src/lib/deployment.js` | `general.environment` (runtime env), `agents`, `workflow`, `learning`, `git`, `privacy`, and the nested `deployment` engine block | JSON (rich/nested) |
| `.ctoc/settings.yaml` | the safety-critical PreToolUse hooks and library code (`src/hooks/*`, `src/lib/budget.js`, `src/lib/regulatory-regime.js`, …) | `enforcement.mode`, `regulatory_regime`, `operations` | YAML (flat, dependency-free) |

## Why two files

The PreToolUse hooks run on **every** file edit and must parse their config
fast and **without a YAML library** (the repo ships no `js-yaml`; the hand-rolled
parser in `budget.js` only reads flat maps, scalars, and inline arrays — not
block sequences). Keeping enforcement and regime config in a flat `settings.yaml`
lets the hooks stay dependency-free and quick. Everything the menu manages —
including the nested `deployment` block, which needs lists of maps that the flat
YAML reader cannot represent — lives in `settings.json`.

## Where to change what

| You want to change… | Edit |
|---------------------|------|
| Enforcement strictness (`strict`/`soft`/`off`) | `.ctoc/settings.yaml` → `enforcement.mode` |
| Regulatory regime profiles | `.ctoc/settings.yaml` → `regulatory_regime` |
| CTOC runtime environment (dev/staging/prod) | `.ctoc/settings.json` → `general.environment` (or the menu's first-run prompt) |
| Deployment targets / strategies / `dry_run` | `.ctoc/settings.json` → `deployment` (or run the `deployment-setup` agent) |

> The runtime environment (`general.environment`) and the deploy targets
> (`staging`/`production`) are **independent axes** — how CTOC behaves while you
> work vs. where an approved commit is promoted. They compose; neither gates the
> other.

## Possible future unification

Collapsing onto a single source of truth is desirable in principle but touches
the safety-critical hook read path, so it is intentionally deferred to a
separately analyzed task rather than done opportunistically.
