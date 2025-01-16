const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { appEventList } = require('./events/AppEventList');

const DEFAULT_MENU = Symbol();
const ALWAYS_SHOW = Symbol();
/**
 * @typedef ContexMenuTargetData
 * @property {string} content Représentation du contenu
 * @property {string} nodeName Nom de la node
 * @property {Object<string, string>} attribs Attributs de la cible
 * @property {string[]} classes Classes de la cible
 */

/**
 * @typedef ContextMenuEvent
 * @property {ContexMenuTargetData} target
 * @property {number} button
 * @property {number} x
 * @property {number} y
 */

/** */
class ElectronContextMenu {
  #_window;
  #_menu;
  #_showCondition;
  /**
   *
   * @param {BrowserWindow} window
   * @param {*} param1
   */
  constructor(
    window,
    { menu = DEFAULT_MENU, showCondition = () => false } = {},
  ) {
    this.#_menu = menu;
    this.#_showCondition = showCondition;
    this.#_window = window;

    window.rotomeca ??= {};
    window.rotomeca.contextMenu = this;
  }

  get id() {
    return this.#_window.id;
  }

  generate() {
    this.#_window.webContents.on('dom-ready', () => {
      this.#_window.webContents.executeJavaScript(
        fs
          .readFileSync(
            path.join(__dirname, './WebContentElecrtonContextMenu.js'),
          )
          ?.toString?.() ?? '',
      );
    });

    this.#_window.on(
      'close',
      function (id) {
        try {
          delete this.#_window.rotomeca.contextMenu;
        } catch (error) {}
        delete _listeners[id];
      }.bind(this, this.id),
    );

    this._p_addEvent((...args) => {
      if (this.#_window.isVisible()) {
        this.contextMenu(...args);
      }
    });

    return this;
  }

  _p_addEvent(callback) {
    _listeners[this.#_window.id] = callback;
  }

  /**
   *
   * @param {currentEvent} currentEvent
   * @param {ContextMenuEvent} event
   */
  contextMenu(currentEvent, event) {
    if (
      this.#_showCondition === ALWAYS_SHOW ||
      (typeof this.#_showCondition === 'function' &&
        this.#_showCondition(event, this))
    ) {
      const bounds = this.#_window.getBounds();
      const click = Object.freeze({
        x: bounds.x + event.x,
        y: bounds.y + event.y,
      });

      let menu = [];
      if (this.#_menu !== DEFAULT_MENU && typeof this.#_menu === 'function') {
        menu.push(...(this.#_menu(event, click, this, currentEvent) || []));
      }

      if (!menu.length) return;

      let length = 0;

      for (const element of menu.map((x) => x.text)) {
        if (element.length > length) length = element.length;
      }

      const win = new BrowserWindow({
        show: true,
        x: click.x,
        y: click.y,
        frame: false,
        alwaysOnTop: true,
        parent: this.#_window,
        transparent: true,
        useContentSize: true,
        skipTaskbar: false,
        width: 12 * length, //100,
        height: menu.length * 30 + 4,
        resizable: false,
        webPreferences: {
          nodeIntegration: false, // is default value after Electron v5
          contextIsolation: true, // protect against prototype pollution
          enableRemoteModule: false,
          preload: path.join(__dirname, '/../../preload.js'), // path to your preload.js file
        },
      });

      win.webContents.loadFile(
        path.join(__dirname, '/../page.contextmenu/context.html'),
      );

      win.webContents.executeJavaScript(`
        window.electron ??= {};
        window.electron.menu = ${JSON.stringify(menu)} 
        `);

      //win.webContents.openDevTools();
      win.on('blur', () => {
        win.destroy();
      });
    }
  }
}

let _listeners = {};
let _started = false;
const RotomecaElectronConextMenu = Object.freeze({
  Start({ menu = DEFAULT_MENU, showCondition = ALWAYS_SHOW } = {}) {
    if (!_started) {
      _started = true;
      for (const win of BrowserWindow.getAllWindows()) {
        new ElectronContextMenu(win, {
          menu,
          showCondition,
        }).generate();
      }

      const onWindowCreated = (event, win) => {
        if (win.getParentWindow()) return;

        new ElectronContextMenu(win, {
          menu,
          showCondition,
        }).generate();
      };

      app.on('browser-window-created', onWindowCreated);
      ipcMain.handle(appEventList.rotomecaContextMenu, (...args) => {
        for (const key in _listeners) {
          if (Object.prototype.hasOwnProperty.call(_listeners, key)) {
            const element = _listeners[key];
            element(...args);
          }
        }
      });
    }
  },
});

module.exports = {
  RotomecaElectronContextMenu: RotomecaElectronConextMenu,
  DEFAULT_MENU,
  ALWAYS_SHOW,
};
