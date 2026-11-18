const { screen } = require('electron');

// Messages SHAppBarMessage
const ABM_NEW = 0x0;
const ABM_REMOVE = 0x1;
const ABM_QUERYPOS = 0x2;
const ABM_SETPOS = 0x3;

// Notifications envoyées par le système à la fenêtre
const ABN_POSCHANGED = 0x1;
const ABN_FULLSCREENAPP = 0x2;

const ABE_LEFT = 0;

/**
 * Ancre une fenêtre Electron au bord gauche de l'écran à la manière d'une
 * barre d'outils Windows (AppBar) : le système réserve l'espace et les autres
 * fenêtres maximisées ne passent plus dessous.
 *
 * Windows uniquement. `AppBar.isSupported` indique si l'API native est
 * utilisable (koffi chargé), sinon l'appelant doit se rabattre sur un autre mode.
 */
class AppBar {
  static #api;

  /**
   * Charge paresseusement les fonctions natives.
   * @returns {?{shAppBarMessage: Function, registerMessage: Function, size: number}}
   */
  static #load() {
    if (AppBar.#api !== undefined) return AppBar.#api;

    AppBar.#api = null;
    if (process.platform !== 'win32') return null;

    try {
      const koffi = require('koffi');
      const RECT = koffi.struct('RECT', {
        left: 'int32',
        top: 'int32',
        right: 'int32',
        bottom: 'int32',
      });
      const APPBARDATA = koffi.struct('APPBARDATA', {
        cbSize: 'uint32',
        hWnd: 'uintptr_t',
        uCallbackMessage: 'uint32',
        uEdge: 'uint32',
        rc: RECT,
        lParam: 'intptr_t',
      });

      AppBar.#api = {
        size: koffi.sizeof(APPBARDATA),
        shAppBarMessage: koffi
          .load('shell32.dll')
          .func(
            'uintptr_t __stdcall SHAppBarMessage(uint32 dwMessage, _Inout_ APPBARDATA *pData)',
          ),
        registerMessage: koffi
          .load('user32.dll')
          .func('uint32 __stdcall RegisterWindowMessageW(str16 lpString)'),
      };
    } catch (error) {
      console.error('AppBar indisponible', error);
    }

    return AppBar.#api;
  }

  /**
   * @type {boolean}
   */
  static get isSupported() {
    return !!AppBar.#load();
  }

  #win = null;
  #callbackMessage = 0;
  #registered = false;
  #onFullscreen = null;
  #onPosChanged = null;

  /**
   * @param {Object} [callbacks]
   * @param {(isFullscreen: boolean) => void} [callbacks.onFullscreen] Une application plein écran apparaît ou disparaît
   * @param {() => void} [callbacks.onPosChanged] Le système demande de replacer la barre
   */
  constructor({ onFullscreen, onPosChanged } = {}) {
    this.#onFullscreen = onFullscreen ?? null;
    this.#onPosChanged = onPosChanged ?? null;
  }

  get registered() {
    return this.#registered;
  }

  #data(extra = {}) {
    const api = AppBar.#load();
    const handle = this.#win.getNativeWindowHandle();

    return {
      cbSize: api.size,
      hWnd:
        handle.length >= 8 ? handle.readBigUInt64LE(0) : handle.readUInt32LE(0),
      uCallbackMessage: this.#callbackMessage,
      uEdge: ABE_LEFT,
      rc: { left: 0, top: 0, right: 0, bottom: 0 },
      lParam: 0,
      ...extra,
    };
  }

  /**
   * Enregistre la fenêtre comme AppBar.
   * @param {Electron.BrowserWindow} win
   * @returns {boolean}
   */
  register(win) {
    const api = AppBar.#load();
    if (!api || !win || win.isDestroyed()) return false;
    if (this.#registered) return true;

    this.#win = win;
    this.#callbackMessage = api.registerMessage('RotomecaToolbarAppBar');

    if (!api.shAppBarMessage(ABM_NEW, this.#data())) return false;

    win.hookWindowMessage(this.#callbackMessage, (wParam, lParam) => {
      const code = wParam.readUInt32LE(0);
      if (code === ABN_FULLSCREENAPP)
        this.#onFullscreen?.(lParam.readUInt32LE(0) !== 0);
      else if (code === ABN_POSCHANGED) this.#onPosChanged?.();
    });

    this.#registered = true;
    return true;
  }

  /**
   * Réserve une bande sur le bord gauche de l'écran.
   * @param {Electron.Rectangle} dipBounds Zone souhaitée (pixels indépendants de la densité)
   * @returns {?Electron.Rectangle} Zone accordée (pixels indépendants de la densité)
   */
  setPos(dipBounds) {
    const api = AppBar.#load();
    if (!api || !this.#registered || this.#win.isDestroyed()) return null;

    const px = screen.dipToScreenRect(this.#win, dipBounds);
    const wanted = {
      left: px.x,
      top: px.y,
      right: px.x + px.width,
      bottom: px.y + px.height,
    };

    // Le système retire de la zone ce qu'occupent déjà les autres barres
    // (barre des tâches) ; on garde la largeur demandée collée au bord.
    const data = this.#data({ rc: wanted });
    api.shAppBarMessage(ABM_QUERYPOS, data);
    data.rc.right = data.rc.left + px.width;
    api.shAppBarMessage(ABM_SETPOS, data);

    return screen.screenToDipRect(this.#win, {
      x: data.rc.left,
      y: data.rc.top,
      width: data.rc.right - data.rc.left,
      height: data.rc.bottom - data.rc.top,
    });
  }

  /**
   * Libère l'espace réservé. À appeler avant de fermer la fenêtre ou de quitter.
   */
  unregister() {
    if (!this.#registered) return;
    this.#registered = false;

    const api = AppBar.#load();
    const win = this.#win;
    this.#win = null;

    if (!api || !win || win.isDestroyed()) return;

    try {
      win.unhookWindowMessage(this.#callbackMessage);
    } catch {
      // Déjà décroché
    }

    // Les données sont reconstruites à la main : la fenêtre n'est plus liée
    const handle = win.getNativeWindowHandle();
    api.shAppBarMessage(ABM_REMOVE, {
      cbSize: api.size,
      hWnd:
        handle.length >= 8 ? handle.readBigUInt64LE(0) : handle.readUInt32LE(0),
      uCallbackMessage: this.#callbackMessage,
      uEdge: ABE_LEFT,
      rc: { left: 0, top: 0, right: 0, bottom: 0 },
      lParam: 0,
    });
  }
}

module.exports = { AppBar };
