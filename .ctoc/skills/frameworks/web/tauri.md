# Tauri CTO
> Lightweight Rust desktop apps - tiny bundles, native performance, secure by default.

## Commands
```bash
# Setup | Dev | Test
npm create tauri-app@latest && cd myapp
npm run tauri dev
cargo test
```

## Non-Negotiables
1. Rust backend commands for native operations
2. Allowlist permissions - minimal by default
3. Event system for async communication
4. Window management via Rust
5. Proper CSP configuration

## Red Lines
- `shell: { all: true }` - open security hole
- Missing allowlist - deny by default
- Blocking main thread - use async commands
- No error handling in commands
- Exposing filesystem without validation

## Pattern: Commands and Events
```rust
// src-tauri/src/main.rs
use tauri::Manager;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct User {
    id: i32,
    email: String,
}

#[derive(Deserialize)]
struct CreateUserRequest {
    email: String,
    password: String,
}

#[tauri::command]
async fn create_user(
    request: CreateUserRequest,
    state: tauri::State<'_, AppState>,
) -> Result<User, String> {
    let user = state.db
        .create_user(&request.email, &request.password)
        .await
        .map_err(|e| e.to_string())?;

    Ok(user)
}

#[tauri::command]
async fn get_users(state: tauri::State<'_, AppState>) -> Result<Vec<User>, String> {
    state.db.get_all_users().await.map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![create_user, get_users])
        .setup(|app| {
            // Emit events to frontend
            let handle = app.handle();
            std::thread::spawn(move || {
                loop {
                    handle.emit_all("heartbeat", "alive").unwrap();
                    std::thread::sleep(std::time::Duration::from_secs(30));
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running tauri application");
}

// Frontend (React/Vue/Svelte)
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';

async function createUser(email, password) {
  return await invoke('create_user', { request: { email, password } });
}

// Listen to events
await listen('heartbeat', (event) => {
  console.log('Server alive:', event.payload);
});
```

## Integrates With
- **Frontend**: React, Vue, Svelte, or any web framework
- **DB**: SQLite via `rusqlite`, or any Rust crate
- **System**: Native dialogs, notifications, clipboard
- **Updates**: Built-in updater with signing

## Common Errors
| Error | Fix |
|-------|-----|
| `Command not found` | Add to `invoke_handler` in main.rs |
| `Permission denied` | Add capability to allowlist |
| `Serialization failed` | Check Serde derives on types |
| `Window not found` | Check window label matches |

## Prod Ready
- [ ] Allowlist is minimal
- [ ] Code signing configured
- [ ] Auto-updater with signing
- [ ] CSP configured in `tauri.conf.json`
- [ ] Error handling in all commands
- [ ] Bundle size optimized (should be < 10MB)
