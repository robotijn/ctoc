# Tauri CTO
> Lightweight Rust desktop apps.

## Non-Negotiables
1. Rust backend commands
2. Allowlist permissions
3. Event system
4. Window management
5. Proper CSP

## Red Lines
- Shell: all permissions
- Missing allowlist
- Blocking main thread
- No error handling in commands

## Pattern
```rust
#[tauri::command]
async fn greet(name: &str) -> Result<String, String> {
    Ok(format!("Hello, {}!", name))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error running app");
}
```
