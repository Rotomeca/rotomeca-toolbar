/**
 * Assemble la barre ancrée : appels natifs Windows et conversions d'écran d'Electron.
 *
 * Utilisé par `App` dans le processus principal. C'est ici que `AppBar` rencontre Electron
 * (`screen`), pour que la classe elle-même reste pure.
 */
// [electron] API d'Electron (fenêtres, IPC, zone de notification, sessions...)
import { screen } from 'electron';
import type { BrowserWindow } from 'electron';
// [AppBar.ts] Barre ancrée au bord gauche de l'écran (AppBar Windows) : enregistrement et réservation d'espace
import { AppBar } from './AppBar.js';
import type { AppBarCallbacks } from './AppBar.js';
// [appBarApi.ts] Appels natifs Windows de la barre ancrée (SHAppBarMessage) chargés via koffi
import { loadAppBarApi } from './appBarApi.js';
import type { AppBarApi } from './appBarApi.js';

/** Appels natifs mis en cache : `undefined` tant qu'ils ne sont pas chargés, `null` s'ils sont indisponibles. */
let api: AppBarApi | null | undefined;

/** Les fonctions natives sont chargées à la première demande, une seule fois. */
function nativeApi(): AppBarApi | null {
  if (api === undefined) api = loadAppBarApi();
  return api;
}

/** @returns `true` si la barre ancrée est utilisable (Windows, koffi chargé) */
export function isAppBarSupported(): boolean {
  return nativeApi() !== null;
}

/** @returns Une barre ancrée branchée sur Windows et sur les conversions d'écran d'Electron */
export function createAppBar(callbacks: AppBarCallbacks): AppBar<BrowserWindow> {
  return new AppBar<BrowserWindow>(
    nativeApi(),
    {
      dipToScreenRect: (window, rect) => screen.dipToScreenRect(window, rect),
      screenToDipRect: (window, rect) => screen.screenToDipRect(window, rect),
    },
    callbacks,
  );
}
