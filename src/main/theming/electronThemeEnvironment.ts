import { app, nativeTheme, powerMonitor, webContents } from 'electron';
import type { ThemeEnvironment } from './ThemeService.js';

/** @returns L'environnement du thème branché sur Electron */
export function createElectronThemeEnvironment(): ThemeEnvironment {
  return {
    systemIsDark: () => nativeTheme.shouldUseDarkColors,
    allContents: () => webContents.getAllWebContents(),
    onContentsCreated: (listener) => {
      app.on('web-contents-created', (_, contents) => listener(contents));
    },
    onSystemThemeChanged: (listener) => {
      nativeTheme.on('updated', listener);
    },
    onResume: (listener) => {
      powerMonitor.on('resume', listener);
    },
    every: (intervalMs, callback) => {
      setInterval(callback, intervalMs).unref();
    },
  };
}
