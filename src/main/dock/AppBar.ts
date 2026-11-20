/**
 * Barre ancrée au bord gauche de l'écran (AppBar Windows) : enregistrement et réservation d'espace.
 *
 * Créée par `createAppBar` et pilotée par `App`. Les appels natifs et les conversions d'écran
 * sont injectés : la classe ne dépend ni d'Electron ni de koffi, ce qui la rend testable.
 */
// [appBarApi.ts] Appels natifs Windows de la barre ancrée (SHAppBarMessage) chargés via koffi
import type { AppBarApi, AppBarData, NativeRect } from './appBarApi.js';
// [dockGeometry.ts] Géométrie de la barre : disposition des fenêtres, bande réservée et masquage automatique
import type { Rect } from './dockGeometry.js';

/** Message `SHAppBarMessage` : enregistrer la barre. */
const ABM_NEW = 0x0;
/** Message `SHAppBarMessage` : retirer la barre. */
const ABM_REMOVE = 0x1;
/** Message `SHAppBarMessage` : demander la zone disponible. */
const ABM_QUERYPOS = 0x2;
/** Message `SHAppBarMessage` : valider la zone réservée. */
const ABM_SETPOS = 0x3;

/** Notification système : la position de la barre doit être revue. */
const ABN_POSCHANGED = 0x1;
/** Notification système : une application plein écran apparaît ou disparaît. */
const ABN_FULLSCREENAPP = 0x2;

/** Bord de l'écran où la barre est ancrée : toujours la gauche. */
const ABE_LEFT = 0;

/** Rectangle vide, pour les messages qui n'ont pas de zone à fournir. */
const EMPTY_RECT: NativeRect = { left: 0, top: 0, right: 0, bottom: 0 };

/** Ce que la barre ancrée demande à la fenêtre (un sous-ensemble de `BrowserWindow`). */
export interface AppBarWindow {
  isDestroyed(): boolean;
  getNativeWindowHandle(): Buffer;
  hookWindowMessage(message: number, callback: (wParam: Buffer, lParam: Buffer) => void): void;
  unhookWindowMessage(message: number): void;
}

/** Conversions entre pixels indépendants de la densité et pixels physiques (`Electron.screen`). */
export interface DipConverter<W> {
  dipToScreenRect(window: W, rect: Rect): Rect;
  screenToDipRect(window: W, rect: Rect): Rect;
}

/** Réactions de l'application aux notifications du système, toutes facultatives. */
export interface AppBarCallbacks {
  /** Une application plein écran apparaît ou disparaît. */
  onFullscreen?: (isFullscreen: boolean) => void;
  /** Le système demande de replacer la barre. */
  onPosChanged?: () => void;
}

/** Ce que `ToolbarController` attend d'une barre ancrée, quel que soit le système (AppBar Windows, struts X11). */
export interface DockBar<W> {
  /** `true` si la barre est actuellement enregistrée auprès du système. */
  readonly registered: boolean;
  /** Enregistre la fenêtre comme barre ancrée. @returns `true` si elle l'est (ou l'était déjà) */
  register(window: W): boolean;
  /** Réserve une bande sur le bord gauche. @returns La zone accordée, ou `null` si non enregistrée */
  setPos(dipBounds: Rect): Rect | null;
  /** Libère l'espace réservé. */
  unregister(): void;
}

/** Lit le handle natif de la fenêtre (64 bits ou 32 bits selon la plateforme). */
const readHandle = (handle: Buffer): bigint | number =>
  handle.length >= 8 ? handle.readBigUInt64LE(0) : handle.readUInt32LE(0);

/**
 * Ancre une fenêtre au bord gauche de l'écran à la manière d'une barre d'outils Windows
 * (AppBar) : le système réserve l'espace et les autres fenêtres maximisées ne passent plus dessous.
 * Les appels natifs sont fournis par `api` (`null` : non pris en charge).
 */
export class AppBar<W extends AppBarWindow = AppBarWindow> implements DockBar<W> {
  /** Fenêtre ancrée, `null` tant que la barre n'est pas enregistrée. */
  private window: W | null = null;
  /** Identifiant du message que le système enverra à la fenêtre. */
  private callbackMessage = 0;
  /** `true` entre `register` et `unregister`. */
  private isRegistered = false;

  /**
   * @param api Appels natifs, `null` si non pris en charge (hors Windows)
   * @param converter Conversions entre pixels indépendants de la densité et pixels physiques
   * @param callbacks Réactions aux notifications du système
   */
  constructor(
    private readonly api: AppBarApi | null,
    private readonly converter: DipConverter<W>,
    private readonly callbacks: AppBarCallbacks = {},
  ) {}

  /** @returns `true` si la barre est actuellement enregistrée auprès du système */
  get registered(): boolean {
    return this.isRegistered;
  }

  /**
   * Enregistre la fenêtre comme AppBar et écoute les notifications du système.
   * @returns `true` si la fenêtre est enregistrée comme AppBar (ou l'était déjà)
   */
  register(window: W): boolean {
    if (!this.api || window.isDestroyed()) return false;
    if (this.isRegistered) return true;

    this.window = window;
    this.callbackMessage = this.api.registerMessage('RotomecaToolbarAppBar');

    if (!this.api.shAppBarMessage(ABM_NEW, this.data(window, EMPTY_RECT))) return false;

    window.hookWindowMessage(this.callbackMessage, (wParam, lParam) => {
      const code = wParam.readUInt32LE(0);
      if (code === ABN_FULLSCREENAPP) this.callbacks.onFullscreen?.(lParam.readUInt32LE(0) !== 0);
      else if (code === ABN_POSCHANGED) this.callbacks.onPosChanged?.();
    });

    this.isRegistered = true;
    return true;
  }

  /**
   * Réserve une bande sur le bord gauche de l'écran.
   * @param dipBounds Zone souhaitée
   * @returns La zone accordée, ou `null` si la barre n'est pas enregistrée
   */
  setPos(dipBounds: Rect): Rect | null {
    const { api, window } = this;
    if (!api || !window || !this.isRegistered || window.isDestroyed()) return null;

    const px = this.converter.dipToScreenRect(window, dipBounds);
    const data = this.data(window, { left: px.x, top: px.y, right: px.x + px.width, bottom: px.y + px.height });

    // Le système retire de la zone ce qu'occupent déjà les autres barres (barre des tâches) ;
    // on garde la largeur demandée collée au bord.
    api.shAppBarMessage(ABM_QUERYPOS, data);
    data.rc.right = data.rc.left + px.width;
    api.shAppBarMessage(ABM_SETPOS, data);

    return this.converter.screenToDipRect(window, {
      x: data.rc.left,
      y: data.rc.top,
      width: data.rc.right - data.rc.left,
      height: data.rc.bottom - data.rc.top,
    });
  }

  /** Libère l'espace réservé. À appeler avant de fermer la fenêtre ou de quitter. */
  unregister(): void {
    if (!this.isRegistered) return;
    this.isRegistered = false;

    const { api, window } = this;
    this.window = null;
    if (!api || !window || window.isDestroyed()) return;

    try {
      window.unhookWindowMessage(this.callbackMessage);
    } catch {
      // Déjà décroché
    }

    api.shAppBarMessage(ABM_REMOVE, this.data(window, EMPTY_RECT));
  }

  /** Construit la structure `APPBARDATA` envoyée au système pour la fenêtre et la zone données. */
  private data(window: AppBarWindow, rc: NativeRect): AppBarData {
    return {
      cbSize: this.api?.size ?? 0,
      hWnd: readHandle(window.getNativeWindowHandle()),
      uCallbackMessage: this.callbackMessage,
      uEdge: ABE_LEFT,
      rc: { ...rc },
      lParam: 0,
    };
  }
}
