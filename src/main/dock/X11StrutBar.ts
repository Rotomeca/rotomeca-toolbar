/**
 * Barre ancrée au bord gauche de l'écran sous Linux X11 : réservation d'espace par les struts EWMH.
 *
 * Créée par `createAppBar` et pilotée par `ToolbarController`. Les appels natifs et les conversions
 * d'écran sont injectés : la classe ne dépend ni d'Electron ni de koffi, ce qui la rend testable.
 */
// [AppBar.ts] Barre ancrée au bord gauche de l'écran (AppBar Windows) : enregistrement et réservation d'espace
import type { DipConverter, DockBar } from './AppBar.js';
// [dockGeometry.ts] Géométrie de la barre : disposition des fenêtres, bande réservée et masquage automatique
import type { Rect } from './dockGeometry.js';
// [x11Api.ts] Appels natifs X11 de la barre ancrée Linux (propriétés EWMH `_NET_WM_STRUT*`) chargés via koffi
import type { X11Api } from './x11Api.js';

/** Ce que la barre ancrée demande à la fenêtre (un sous-ensemble de `BrowserWindow`). */
export interface X11Window {
  isDestroyed(): boolean;
  getNativeWindowHandle(): Buffer;
}

/** Lit l'identifiant X11 de la fenêtre : un entier de 32 bits au début du handle natif. */
const readWindowId = (handle: Buffer): number => handle.readUInt32LE(0);

/**
 * Ancre une fenêtre au bord gauche de l'écran : le gestionnaire de fenêtres retire la bande
 * réservée de la zone de travail, donc les fenêtres maximisées ne passent plus dessous.
 * X11 n'a ni négociation de la zone ni notification : la zone accordée est celle demandée,
 * restreinte en hauteur à la zone de travail (pour ne pas passer sous la barre du haut ou le dock).
 */
export class X11StrutBar<W extends X11Window = X11Window> implements DockBar<W> {
  /** Fenêtre ancrée, `null` tant que la barre n'est pas enregistrée. */
  private window: W | null = null;

  /**
   * @param api Appels natifs X11
   * @param converter Conversions entre pixels indépendants de la densité et pixels physiques
   * @param workAreaOf Zone de travail (hors barres du système) de l'écran qui porte la fenêtre, en pixels indépendants de la densité
   */
  constructor(
    private readonly api: X11Api,
    private readonly converter: DipConverter<W>,
    private readonly workAreaOf: (window: W) => Rect,
  ) {}

  /** @returns `true` si une fenêtre est actuellement ancrée */
  get registered(): boolean {
    return this.window !== null;
  }

  /** @returns `true` si la fenêtre est enregistrée (ou l'était déjà), `false` si elle est détruite */
  register(window: W): boolean {
    if (this.window) return true;
    if (window.isDestroyed()) return false;

    this.window = window;
    return true;
  }

  /**
   * Réserve une bande sur le bord gauche de l'écran.
   * @param dipBounds Zone souhaitée
   * @returns La zone demandée, restreinte en hauteur à la zone de travail, ou `null` si la barre n'est pas enregistrée
   */
  setPos(dipBounds: Rect): Rect | null {
    const { window } = this;
    if (!window || window.isDestroyed()) return null;

    const px = this.converter.dipToScreenRect(window, dipBounds);
    this.api.setStrut(readWindowId(window.getNativeWindowHandle()), {
      width: px.x + px.width,
      startY: px.y,
      endY: px.y + px.height - 1,
    });

    const area = this.workAreaOf(window);
    const top = Math.max(dipBounds.y, area.y);
    const bottom = Math.min(dipBounds.y + dipBounds.height, area.y + area.height);
    return { ...dipBounds, y: top, height: Math.max(0, bottom - top) };
  }

  /** Libère l'espace réservé. À appeler avant de fermer la fenêtre ou de quitter. */
  unregister(): void {
    const { window } = this;
    this.window = null;
    if (!window || window.isDestroyed()) return;

    this.api.clearStrut(readWindowId(window.getNativeWindowHandle()));
  }
}
