import type { AppBarApi, AppBarData, NativeRect } from './appBarApi.js';
import type { Rect } from './dockGeometry.js';

// Messages SHAppBarMessage
const ABM_NEW = 0x0;
const ABM_REMOVE = 0x1;
const ABM_QUERYPOS = 0x2;
const ABM_SETPOS = 0x3;

// Notifications envoyées par le système à la fenêtre
const ABN_POSCHANGED = 0x1;
const ABN_FULLSCREENAPP = 0x2;

const ABE_LEFT = 0;

const EMPTY_RECT: NativeRect = { left: 0, top: 0, right: 0, bottom: 0 };

/** Ce que la barre ancrée demande à la fenêtre (un sous-ensemble de `BrowserWindow`). */
export interface AppBarWindow {
  isDestroyed(): boolean;
  getNativeWindowHandle(): Buffer;
  hookWindowMessage(message: number, callback: (wParam: Buffer, lParam: Buffer) => void): void;
  unhookWindowMessage(message: number): void;
}

/** Conversions entre pixels indépendants de la densité et pixels physiques (`Electron.screen`). */
export interface DipConverter<W extends AppBarWindow> {
  dipToScreenRect(window: W, rect: Rect): Rect;
  screenToDipRect(window: W, rect: Rect): Rect;
}

export interface AppBarCallbacks {
  /** Une application plein écran apparaît ou disparaît. */
  onFullscreen?: (isFullscreen: boolean) => void;
  /** Le système demande de replacer la barre. */
  onPosChanged?: () => void;
}

const readHandle = (handle: Buffer): bigint | number =>
  handle.length >= 8 ? handle.readBigUInt64LE(0) : handle.readUInt32LE(0);

/**
 * Ancre une fenêtre au bord gauche de l'écran à la manière d'une barre d'outils Windows
 * (AppBar) : le système réserve l'espace et les autres fenêtres maximisées ne passent plus dessous.
 * Les appels natifs sont fournis par `api` (`null` : non pris en charge).
 */
export class AppBar<W extends AppBarWindow = AppBarWindow> {
  private window: W | null = null;
  private callbackMessage = 0;
  private isRegistered = false;

  constructor(
    private readonly api: AppBarApi | null,
    private readonly converter: DipConverter<W>,
    private readonly callbacks: AppBarCallbacks = {},
  ) {}

  get registered(): boolean {
    return this.isRegistered;
  }

  /** @returns `true` si la fenêtre est enregistrée comme AppBar (ou l'était déjà) */
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
