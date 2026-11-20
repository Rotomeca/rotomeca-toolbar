/**
 * Assemble la barre ancrée : AppBar Windows ou struts X11 selon le système, et conversions d'écran d'Electron.
 *
 * Utilisé par `App` dans le processus principal. C'est ici que `AppBar` rencontre Electron
 * (`screen`), pour que la classe elle-même reste pure.
 */
// [electron] API d'Electron (fenêtres, IPC, zone de notification, sessions...)
import { screen } from 'electron';
import type { BrowserWindow } from 'electron';
// [AppBar.ts] Barre ancrée au bord gauche de l'écran (AppBar Windows) : enregistrement et réservation d'espace
import { AppBar } from './AppBar.js';
import type { AppBarCallbacks, DockBar } from './AppBar.js';
// [appBarApi.ts] Appels natifs Windows de la barre ancrée (SHAppBarMessage) chargés via koffi
import { loadAppBarApi } from './appBarApi.js';
// [dockGeometry.ts] Géométrie de la barre : disposition des fenêtres, bande réservée et masquage automatique
import type { Rect } from './dockGeometry.js';
import type { AppBarApi } from './appBarApi.js';
// [X11StrutBar.ts] Barre ancrée au bord gauche de l'écran sous Linux X11 : réservation d'espace par les struts EWMH
import { X11StrutBar } from './X11StrutBar.js';
// [x11Api.ts] Appels natifs X11 de la barre ancrée Linux (propriétés EWMH `_NET_WM_STRUT*`) chargés via koffi
import { loadX11Api } from './x11Api.js';
import type { X11Api } from './x11Api.js';

/** Appels natifs Windows mis en cache : `undefined` tant qu'ils ne sont pas chargés, `null` s'ils sont indisponibles. */
let api: AppBarApi | null | undefined;
/** Appels natifs X11 mis en cache, mêmes états que `api`. */
let x11Api: X11Api | null | undefined;

/** Les fonctions natives Windows sont chargées à la première demande, une seule fois. */
function nativeApi(): AppBarApi | null {
  if (api === undefined) api = loadAppBarApi();
  return api;
}

/** Les fonctions natives X11 sont chargées à la première demande, une seule fois. */
function nativeX11Api(): X11Api | null {
  if (x11Api === undefined) x11Api = loadX11Api();
  return x11Api;
}

/**
 * Conversion pour X11 : `screen.dipToScreenRect` n'existe que sous Windows, et X11 travaille en
 * pixels physiques, soit les pixels indépendants de la densité multipliés par le facteur d'échelle.
 * @param factor Donne le facteur d'échelle de l'écran qui porte le rectangle
 */
function scaledConverter(factor: (rect: Rect) => number) {
  const scale = (rect: Rect, by: number): Rect => ({
    x: Math.round(rect.x * by),
    y: Math.round(rect.y * by),
    width: Math.round(rect.width * by),
    height: Math.round(rect.height * by),
  });

  return {
    dipToScreenRect: (_window: BrowserWindow, rect: Rect) => scale(rect, factor(rect)),
    screenToDipRect: (_window: BrowserWindow, rect: Rect) => scale(rect, 1 / factor(rect)),
  };
}

/** @returns `true` si la barre ancrée est utilisable (Windows avec koffi, ou Linux sous X11) */
export function isAppBarSupported(): boolean {
  return nativeApi() !== null || nativeX11Api() !== null;
}

/** @returns Une barre ancrée branchée sur le système (Windows ou X11) et sur les conversions d'écran d'Electron */
export function createAppBar(callbacks: AppBarCallbacks): DockBar<BrowserWindow> {
  const converter = {
    dipToScreenRect: (window: BrowserWindow, rect: Rect) => screen.dipToScreenRect(window, rect),
    screenToDipRect: (window: BrowserWindow, rect: Rect) => screen.screenToDipRect(window, rect),
  };

  const x11 = nativeX11Api();
  return x11
    ? new X11StrutBar<BrowserWindow>(
        x11,
        scaledConverter((rect) => screen.getDisplayMatching(rect).scaleFactor),
        (window) => screen.getDisplayMatching(window.getBounds()).workArea,
      )
    : new AppBar<BrowserWindow>(nativeApi(), converter, callbacks);
}
