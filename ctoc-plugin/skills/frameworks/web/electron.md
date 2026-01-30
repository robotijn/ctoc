# Electron CTO
> Claude Code correction guide. Updated January 2026.

## Installation (CURRENT - January 2026)
```bash
npm init electron-app@latest my-app
cd my-app && npm start
# Electron 33+ - requires Node.js 20+
```

## Claude's Common Mistakes
1. **`nodeIntegration: true`** — Massive security vulnerability; never enable
2. **Using remote module** — Deprecated; use IPC instead
3. **Blocking main process** — Keeps entire app unresponsive
4. **Missing context isolation** — Required for security; always enable
5. **No preload script** — Only way to safely expose APIs to renderer

## Correct Patterns (2026)
```javascript
// main.js - Main process
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,    // Required for security
      nodeIntegration: false,    // NEVER enable
      sandbox: true,             // Additional protection
    },
  });

  mainWindow.loadFile('index.html');
}

// IPC handlers (main process only)
ipcMain.handle('db:getUsers', async () => {
  return await database.getAllUsers();
});

ipcMain.handle('db:createUser', async (event, userData) => {
  // Validate userData before processing
  return await database.createUser(userData);
});

app.whenReady().then(createWindow);

// preload.js - Bridge between main and renderer
const { contextBridge, ipcRenderer } = require('electron');

// Only expose what renderer needs (whitelist approach)
contextBridge.exposeInMainWorld('api', {
  getUsers: () => ipcRenderer.invoke('db:getUsers'),
  createUser: (data) => ipcRenderer.invoke('db:createUser', data),
  // Never expose ipcRenderer directly!
});

// renderer.js - Runs in browser context (no Node.js)
async function loadUsers() {
  const users = await window.api.getUsers();  // Uses preload bridge
  renderUserList(users);
}
```

## Version Gotchas
- **Electron 33+**: Enhanced security defaults
- **Context Isolation**: Required; breaks old tutorials
- **Sandbox**: Enable for additional security layer
- **Native modules**: Must be rebuilt for Electron version

## What NOT to Do
- ❌ `nodeIntegration: true` — Critical security vulnerability
- ❌ `require('electron').remote` — Deprecated and dangerous
- ❌ `contextBridge.exposeInMainWorld('ipcRenderer', ipcRenderer)` — Too broad
- ❌ Blocking main process with sync code — App freezes
- ❌ Loading untrusted remote content — XSS risk

## Process Architecture
| Process | Access | Purpose |
|---------|--------|---------|
| Main | Node.js, OS | Window management, native APIs |
| Renderer | Browser only | UI rendering (via preload bridge) |
| Preload | Limited Node | Secure IPC bridge |

## Security Checklist
```javascript
// webPreferences (always set these)
webPreferences: {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
}
```
