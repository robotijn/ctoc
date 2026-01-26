# Electron CTO
> Cross-platform desktop apps - web tech in a native shell, with security in mind.

## Commands
```bash
# Setup | Dev | Test
npm init electron-app@latest myapp && cd myapp
npm start
npm test
```

## Non-Negotiables
1. Main/renderer process separation - understand the architecture
2. Context isolation enabled (`contextIsolation: true`)
3. Preload scripts for secure IPC
4. IPC channels for process communication
5. Auto-updates for distribution

## Red Lines
- `nodeIntegration: true` - massive security risk
- Remote module usage - deprecated and dangerous
- Blocking main process - keeps app responsive
- Missing security headers (CSP)
- Loading remote content without validation

## Pattern: Secure IPC Bridge
```javascript
// main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile('index.html');
}

// IPC handlers in main process
ipcMain.handle('db:getUsers', async () => {
  return await database.getAllUsers();
});

ipcMain.handle('db:createUser', async (event, userData) => {
  return await database.createUser(userData);
});

app.whenReady().then(createWindow);

// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getUsers: () => ipcRenderer.invoke('db:getUsers'),
  createUser: (data) => ipcRenderer.invoke('db:createUser', data),
  // Only expose what renderer needs
});

// renderer.js (runs in browser context)
async function loadUsers() {
  const users = await window.api.getUsers();
  renderUserList(users);
}

async function createUser(formData) {
  const user = await window.api.createUser(formData);
  return user;
}
```

## Integrates With
- **State**: Redux, MobX, or Zustand in renderer
- **DB**: SQLite via better-sqlite3 (main process)
- **Updates**: `electron-updater` for auto-updates
- **Build**: `electron-builder` for distribution

## Common Errors
| Error | Fix |
|-------|-----|
| `Cannot find module` in renderer | Use preload bridge, not require |
| `IPC channel not found` | Register handler in main before invoke |
| `App hangs` | Move blocking work off main process |
| `White screen on load` | Check devtools for renderer errors |

## Prod Ready
- [ ] Code signing configured
- [ ] Auto-updates working
- [ ] CSP headers set
- [ ] Sandbox enabled
- [ ] Crash reporting integrated
- [ ] Native modules rebuilt for Electron
