/**
 * Branchement du thème sur Electron (nativeTheme, powerMonitor, webContents).
 *
 * Utilisé par `App` pour construire `ThemeService`, qui ne dépend que de `ThemeEnvironment`.
 */
// [electron] API d'Electron (fenêtres, IPC, zone de notification, sessions...)
import { app, nativeTheme, powerMonitor, webContents } from 'electron';
// [ThemeService.ts] Application du thème de l'utilisateur aux pages locales, et mise à jour quand il change
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
