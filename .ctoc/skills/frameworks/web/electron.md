# Electron CTO
> Cross-platform desktop apps with web tech.

## Non-Negotiables
1. Main/renderer process separation
2. Context isolation
3. Preload scripts
4. IPC for communication
5. Auto-updates

## Red Lines
- nodeIntegration: true
- Remote module usage
- Blocking main process
- Missing security headers

## Pattern
```javascript
// preload.js
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  send: (channel, data) => ipcRenderer.invoke(channel, data),
  on: (channel, callback) => ipcRenderer.on(channel, callback)
})
```
