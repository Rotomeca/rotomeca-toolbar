const {
  ipcMain,
  BaseWindow,
  BrowserWindow,
  screen,
  systemPreferences,
  nativeTheme,
} = require('electron');
const path = require('path');

class BaseAppObject {
  /**
   * @type {Object<string, BaseWindow>}
   */
  #_windows = {};
  #_base_css = null;
  #_css_root = null;
  #_params = null;
  constructor() {
    this.init();
    this.main();
  }

  /**
   * @returns {Settings}
   */
  get settings() {
    if (!this.#_params) {
      const { Params } = require('../../settings.js');
      this.#_params = Params;
    }

    return this.#_params.Instance;
  }

  /**
   * Écran choisi dans les paramètres, ou l'écran principal s'il n'existe plus.
   * L'identifiant enregistré n'est jamais modifié : l'écran est repris dès son retour.
   * @type {Electron.Display}
   * @readonly
   */
  get primaryScreen() {
    const id = this.settings.displayId;
    return (
      (id !== null && screen.getAllDisplays().find((d) => d.id === id)) ||
      screen.getPrimaryDisplay()
    );
  }

  /**
   * Écrans disponibles, pour la page des paramètres.
   * @returns {{id:number, label:string, isPrimary:boolean}[]}
   */
  getDisplaysInfo() {
    const primaryId = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((d, i) => ({
      id: d.id,
      label:
        `${d.label || `Écran ${i + 1}`} (${d.bounds.width}x${d.bounds.height})` +
        (d.id === primaryId ? ' - principal' : ''),
      isPrimary: d.id === primaryId,
    }));
  }

  /**
   * Zone utilisable (hors barre des tâches) de l'écran principal, avec son origine.
   * @type {Electron.Rectangle}
   * @readonly
   */
  get workArea() {
    return this.primaryScreen.workArea;
  }

  get primaryScreenSize() {
    return this.primaryScreen.workAreaSize;
  }

  get baseCSS() {
    if (!this.#_base_css) {
      const fs = require('fs');
      this.#_base_css =
        fs
          .readFileSync(path.join(__dirname, '/../css/app.css'))
          ?.toString?.() ?? '';
    }

    return this.#_base_css;
  }

  /**
   * @type {string}
   * @readonly
   */
  get rootCSS() {
    if (!this.#_css_root) {
      const fs = require('fs');
      this.#_css_root =
        fs
          .readFileSync(
            path.join(__dirname, `../css/themes/${this.settings.theme}.css`),
          )
          ?.toString?.() ?? '';
    }

    return this.#_css_root;
  }

  get windows() {
    return this.#_windows;
  }

  init() {}

  main() {}

  /**
   *
   * @returns {string}
   */
  update_root_css() {
    this.#_css_root = null;
    return this.rootCSS;
  }

  /**
   * Créer une fenêtre navigateur
   * @param {string} index
   * @param {options} param1
   * @returns {BrowserWindow}
   */
  createBrowserWindow(
    index,
    {
      title = null,
      width = 800,
      height = 600,
      x = undefined,
      y = undefined,
      show = true,
      alwaysOnTop = false,
      frame = true,
      useContentSize = true,
      resizable = true,
      transparent = false,
      skipTaskbar = false,
      minimizable = true,
      maximizable = true,
      icon = undefined,
      nodeIntegration = false,
      contextIsolation = true,
      enableRemoteModule = false,
      preload = undefined,
      file = null,
      otherArgs = {},
    } = {},
  ) {
    title ??= index;
    let config = {
      title,
      width,
      height,
      x,
      y,
      show,
      alwaysOnTop,
      frame,
      useContentSize,
      transparent,
      skipTaskbar,
      minimizable,
      maximizable,
      icon,
      resizable,
      webPreferences: {
        nodeIntegration,
        contextIsolation,
        enableRemoteModule,
        preload,
      },
    };

    for (const key in otherArgs) {
      if (Object.prototype.hasOwnProperty.call(otherArgs, key)) {
        const element = otherArgs[key];

        if (key !== 'webPreferences') config[key] = element;
        else if (otherArgs[key]) {
          for (const wkey in otherArgs[key]) {
            if (Object.prototype.hasOwnProperty.call(otherArgs[key], wkey)) {
              const pref = otherArgs[key][wkey];

              config[key][wkey] = pref;
            }
          }
        }
      }
    }

    let win = new BrowserWindow(config);

    if (file) {
      win.loadFile(file);
    }

    // Injecté à chaque chargement de page : la fenêtre peut ne pas avoir de
    // page au moment de sa création (ex: chargée plus tard via loadFile).
    win.webContents.on('dom-ready', () => {
      win.webContents.insertCSS(this.rootCSS).catch(console.error);

      if (this.baseCSS !== '')
        win.webContents.insertCSS(this.baseCSS).catch(console.error);

      win.webContents
        .executeJavaScript(
          `document.querySelector('html').classList.add('dark-mode-${
            nativeTheme.shouldUseDarkColors ? 'enabled' : 'disabled'
          }'); document.documentElement.dataset.appTheme = ${JSON.stringify(
            this.settings.theme,
          )}`,
        )
        .catch(console.error);
    });

    this.addWindow(index, win);

    return win;
  }

  addWindow(index, window) {
    if (!this.#_windows[index]) this.#_windows[index] = window;
    else throw new Error(`###[addWindow]Already defined index: ${index}`);

    return this;
  }

  getWindow(index) {
    if (this.#_windows[index] && this.#_windows[index].isDestroyed())
      this.removeWindow(index);

    return this.#_windows[index];
  }

  removeWindow(index) {
    if (this.#_windows[index] && !this.#_windows[index].isDestroyed())
      this.#_windows[index].close();
    this.#_windows[index] = null;
    return this;
  }

  /**
   *
   * @param {appEventList} name
   * @param {*} callback
   * @returns
   */
  addEventListener(name, callback) {
    ipcMain.handle(name, (event, ...args) => {
      // Seule la page principale d'une de nos fenêtres locales peut appeler l'IPC :
      // ni un sous-cadre (iframe), ni un site distant.
      const frame = event.senderFrame;
      if (
        !frame ||
        frame !== event.sender.mainFrame ||
        !frame.url.startsWith('file://')
      ) {
        console.warn(`IPC '${name}' refusé depuis`, frame?.url);
        return;
      }

      return callback(event, ...args);
    });
    return this;
  }

  kGetColor(back, text = '#ffffff') {
    return this.kMel_LuminanceRatioAAA(
      this.kMel_extractRGB(back),
      this.kMel_extractRGB(text),
    )
      ? text
      : '#000000';
  }

  kMel_Luminance(rgb) {
    let R = rgb[0] / 255;
    let G = rgb[1] / 255;
    let B = rgb[2] / 255;

    if (R <= 0.04045) {
      R = R / 12.92;
    } else {
      R = ((R + 0.055) / 1.055) ** 2.4;
    }
    if (G <= 0.04045) {
      G = G / 12.92;
    } else {
      G = ((G + 0.055) / 1.055) ** 2.4;
    }
    if (B <= 0.04045) {
      B = B / 12.92;
    } else {
      B = ((B + 0.055) / 1.055) ** 2.4;
    }

    const L = 0.2126 * R + 0.7152 * G + 0.0722 * B;

    return L;
  }

  kMel_CompareLuminance(rgb1, rgb2) {
    const l1 = this.kMel_Luminance(rgb1);
    const l2 = this.kMel_Luminance(rgb2);

    let ratio;
    if (l1 > l2) {
      ratio = (l1 + 0.05) / (l2 + 0.05);
    } else {
      ratio = (l2 + 0.05) / (l1 + 0.05);
    }

    return ratio;
  }

  kMel_LuminanceRatioAAA(rgb1, rgb2) {
    const isAAA = this.kMel_CompareLuminance(rgb1, rgb2) > 4.5;
    return isAAA;
  }

  kMel_extractRGB(color) {
    let regexp = /#[a-fA-F\d]{6}/g;
    let rgbArray = color.match(regexp);

    if (rgbArray) {
      rgbArray[0] = parseInt(color.slice(1, 3), 16);
      rgbArray[1] = parseInt(color.slice(3, 5), 16);
      rgbArray[2] = parseInt(color.slice(5, 7), 16);

      return rgbArray;
    }

    regexp = /#[a-fA-F\d]{3}/g;
    rgbArray = color.match(regexp);

    if (rgbArray) {
      rgbArray[0] = parseInt(color.slice(1, 2), 16);
      rgbArray[1] = parseInt(color.slice(2, 3), 16);
      rgbArray[2] = parseInt(color.slice(3, 4), 16);

      return rgbArray;
    }

    regexp = /\d+/g;
    rgbArray = color.match(regexp);

    if (rgbArray.length === 3 || rgbArray.length === 4) {
      return rgbArray;
    }
  }

  static ColorLuminance(hex, lum, color = 0) {
    // validate hex string
    hex = String(hex).replace(/[^0-9a-f]/gi, '');
    if (hex.length < 6) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    lum = lum || 0;

    // convert to decimal and change luminosity
    var rgb = '#',
      c,
      i;
    for (i = 0; i < 3; i++) {
      c = parseInt(hex.substr(i * 2, 2), 16);
      c = Math.round(Math.min(Math.max(0, c + color + c * lum), 255)).toString(
        16,
      );
      rgb += ('00' + c).substr(c.length);
    }

    return rgb;
  }

  static Run() {
    return new this.prototype.constructor();
  }
}

module.exports = { BaseAppObject };
