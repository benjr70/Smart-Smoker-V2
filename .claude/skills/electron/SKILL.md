---
name: electron
description: Electron desktop app development patterns for Electron Forge with React, Webpack, and kiosk-mode displays. Use when working on the smoker app (apps/smoker/), Electron main/renderer processes, IPC, BrowserWindow, or Electron Forge configuration.
---

# Electron Development Skill

Guidance for building and maintaining Electron apps using Electron Forge with Webpack, React, and TypeScript.

## Architecture: Three-Process Model

Electron apps have three process types. Keep them separated:

### Main Process (`electron-app/index.ts`)
- Node.js runtime with full OS access
- Creates and manages `BrowserWindow` instances
- Handles app lifecycle (`ready`, `window-all-closed`, `activate`)
- Registers IPC handlers via `ipcMain.handle()` / `ipcMain.on()`
- Never import React or DOM APIs here

### Preload Script (`electron-app/preload.ts`)
- Runs in renderer context but with Node.js access
- Bridge between main and renderer via `contextBridge.exposeInMainWorld()`
- Expose only the minimum API surface needed
- Never expose `ipcRenderer` directly -- wrap each channel in a typed function

### Renderer Process (`src/`)
- Standard React app (webpack dev server on port 8080)
- Access main process only through the API exposed in preload
- Uses Socket.io for real-time communication (NOT Electron IPC for data streaming)

## Security Best Practices

1. **Context Isolation**: Always enabled (`contextIsolation: true` is default in Electron 12+)
2. **Sandbox**: Enable when possible (`sandbox: true`). This project disables it (`sandbox: false`) for preload access -- document why if changing
3. **No `nodeIntegration`**: Never enable `nodeIntegration: true` in renderer
4. **CSP Headers**: Set Content-Security-Policy in `index.html` or via `session.defaultSession.webRequest`
5. **No `remote` module**: Deprecated. Use IPC instead

## IPC Patterns

### Request/Response (Invoke/Handle)
```typescript
// Main process
ipcMain.handle('get-setting', async (event, key: string) => {
  return settings.get(key);
});

// Preload
contextBridge.exposeInMainWorld('api', {
  getSetting: (key: string) => ipcRenderer.invoke('get-setting', key),
});

// Renderer
const value = await window.api.getSetting('theme');
```

### One-Way (Send/On)
```typescript
// Main → Renderer
mainWindow.webContents.send('update-available', version);

// Preload
contextBridge.exposeInMainWorld('api', {
  onUpdateAvailable: (callback: (version: string) => void) => {
    ipcRenderer.on('update-available', (_event, version) => callback(version));
  },
});
```

### Type Safety
Define channel types in a shared file:
```typescript
interface ElectronAPI {
  getSetting: (key: string) => Promise<string>;
  onUpdateAvailable: (callback: (version: string) => void) => void;
}
declare global {
  interface Window { api: ElectronAPI; }
}
```

## Electron Forge + Webpack

This project uses `@electron-forge/plugin-webpack` for bundling.

### Key Config Files
- `forge.config.ts` -- Forge configuration (makers, plugins, packager config)
- `webpack.main.config.ts` -- Main process webpack config
- `webpack.renderer.config.ts` -- Renderer process webpack config
- `webpack.rules.ts` -- Shared webpack rules (TypeScript, CSS, assets)

### Magic Constants
Forge's Webpack plugin provides auto-generated constants:
```typescript
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;   // URL for renderer
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string; // Path to preload
```

## Kiosk Mode (Embedded Display)

This app runs on a Raspberry Pi in kiosk mode for a physical smoker display.

### Configuration
```typescript
const mainWindow = new BrowserWindow({
  frame: false,     // No window chrome
  fullscreen: true, // Full screen
  kiosk: true,      // Kiosk mode (no taskbar, no escape)
});
```

### Recovery
- Handle `did-fail-load` to auto-retry loading the page
- Consider adding a watchdog timer to restart the app if the renderer crashes
- The renderer loads from `http://localhost:8080` (the local webpack dev server)

## Testing

- Test files are co-located: `index.test.ts`, `preload.test.ts`, `renderer.test.ts`
- Coverage threshold: 80% lines/functions/statements, 75% branches
- Mock Electron APIs in tests:
```typescript
jest.mock('electron', () => ({
  app: { on: jest.fn(), quit: jest.fn() },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadURL: jest.fn(),
    setKiosk: jest.fn(),
    webContents: { on: jest.fn() },
  })),
}));
```

## Common Patterns

### Auto-Update (Watchtower)
This project uses Docker + Watchtower for auto-updates instead of Electron's built-in auto-updater. The Electron app runs inside a Docker container with X11 forwarding.

### Multi-Service Architecture
The Electron app communicates with:
- **Device Service** (localhost:3003) -- Serial/USB/WiFi bridge to hardware via Socket.io
- **Backend** (cloud URL) -- REST API + WebSocket for data persistence and sync

### Offline-First
The smoker app should handle network disconnection gracefully:
- Batch temperature data locally when backend is unreachable
- Sync when connection is restored
- Device service communication is always local (localhost)
