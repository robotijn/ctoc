# Tauri CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm create tauri-app@latest my-app
cd my-app && npm install
npm run tauri dev
# Tauri 2.x - requires Rust 1.70+
```

## Claude's Common Mistakes
1. **`shell: { all: true }`** — Major security hole; whitelist specific commands
2. **Blocking main thread** — Use async commands; sync blocks entire app
3. **Missing allowlist permissions** — Capabilities denied by default
4. **No error handling in commands** — Rust panics crash the app
5. **Exposing `invoke` without validation** — Validate all inputs

## Correct Patterns (2026)
```rust
// src-tauri/src/main.rs
use tauri::Manager;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct User { id: i32, email: String }

#[derive(Deserialize)]
struct CreateUserRequest { email: String, password: String }

// Async command with error handling (not unwrap!)
#[tauri::command]
async fn create_user(
    request: CreateUserRequest,
    state: tauri::State<'_, AppState>,
) -> Result<User, String> {
    // Validate input
    if request.email.is_empty() {
        return Err("Email required".into());
    }

    state.db
        .create_user(&request.email, &request.password)
        .await
        .map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![create_user])
        .run(tauri::generate_context!())
        .expect("error running tauri");
}

// Frontend (React/Vue/Svelte)
import { invoke } from '@tauri-apps/api/core';

async function createUser(email: string, password: string) {
  try {
    return await invoke('create_user', {
      request: { email, password }
    });
  } catch (error) {
    console.error('Command failed:', error);
  }
}
```

## Version Gotchas
- **Tauri 2.x**: New permissions system, mobile support
- **Capabilities**: Define in `src-tauri/capabilities/`
- **Plugins**: Use official `tauri-plugin-*` crates
- **Bundle size**: Should be < 10MB (much smaller than Electron)

## What NOT to Do
- ❌ `shell: { all: true }` — Security vulnerability
- ❌ `unwrap()` in commands — App crashes on error
- ❌ Sync blocking operations — Use async commands
- ❌ Missing error handling — Always return `Result`
- ❌ Broad permissions — Minimal allowlist only

## Tauri vs Electron
| Feature | Tauri | Electron |
|---------|-------|----------|
| Bundle size | ~10MB | ~150MB+ |
| Memory | Lower | Higher |
| Backend | Rust | Node.js |
| Security | Stronger | Weaker |

## Security Checklist
```json
// src-tauri/capabilities/default.json
{
  "permissions": [
    "core:default",
    "shell:allow-open"  // Whitelist, not allow-all
  ]
}
```
