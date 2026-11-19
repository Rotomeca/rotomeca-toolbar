import { screen } from 'electron';
import type { BrowserWindow } from 'electron';
import { AppBar } from './AppBar.js';
import type { AppBarCallbacks } from './AppBar.js';
import { loadAppBarApi } from './appBarApi.js';
import type { AppBarApi } from './appBarApi.js';

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
