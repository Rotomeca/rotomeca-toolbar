/**
 * Thèmes autorisés (liste blanche : la valeur sert à construire un chemin de fichier).
 */
const THEMES = Object.freeze([
  'system',
  'dark',
  'red',
  'blue',
  'green',
  'white',
  'black',
]);
const DEFAULT_THEME = 'system';

/**
 * @param {unknown} value
 * @returns {string} Un thème valide, ou le thème par défaut
 */
function sanitizeTheme(value) {
  return typeof value === 'string' && THEMES.includes(value)
    ? value
    : DEFAULT_THEME;
}

/**
 * @param {unknown} value
 * @returns {number|null} Un identifiant d'écran valide, ou null
 */
function sanitizeDisplayId(value) {
  return Number.isSafeInteger(value) ? value : null;
}

class Settings {
  #_settings;
  #_filedata;
  constructor() {}

  get #_config() {
    if (!this.#_settings) {
      try {
        this.#_settings = this.fileData.load() || {};
      } catch (error) {
        this.#_settings = {};
      }
    }

    return this.#_settings;
  }

  get isButtonModeEnabled() {
    return this.#_config.isButtonModeEnabled ?? true;
  }

  set isButtonModeEnabled(value) {
    this.#_settings ??= this.#_config;
    this.#_settings.isButtonModeEnabled = value;
  }

  /**
   * Barre ancrée au bord de l'écran (AppBar Windows). Prioritaire sur les modes
   * bouton et souris quand elle est disponible.
   * @type {boolean}
   */
  get appBarEnabled() {
    return this.#_config.appBarEnabled === true;
  }

  set appBarEnabled(value) {
    this.#_settings ??= this.#_config;
    this.#_settings.appBarEnabled = value === true;
  }

  get theme() {
    return sanitizeTheme(this.#_config.theme);
  }

  set theme(value) {
    this.#_settings ??= this.#_config;
    this.#_settings.theme = sanitizeTheme(value);
  }

  /**
   * Identifiant de l'écran choisi (`null` = écran principal).
   * @type {number|null}
   */
  get displayId() {
    return sanitizeDisplayId(this.#_config.displayId);
  }

  set displayId(value) {
    this.#_settings ??= this.#_config;
    this.#_settings.displayId = sanitizeDisplayId(value);
  }

  /**
   * @type {readonly}
   */
  get filePath() {
    return this.fileData.path;
  }

  save() {
    this.fileData.save({
      isButtonModeEnabled: this.isButtonModeEnabled,
      appBarEnabled: this.appBarEnabled,
      theme: this.theme,
      displayId: this.displayId,
    });
  }

  /**
   * @type {FileData}
   * @readonly
   */
  get fileData() {
    if (!this.#_filedata) {
      const { FileData } = require('./src/scripts/FileData');
      this.#_filedata = new FileData('settings.rcft');
    }

    return this.#_filedata;
  }
}

let _instance = null;
/**
 * @type {{Instance:Settings}}
 */
const Params = {};

Object.defineProperty(Params, 'Instance', {
  get: () => {
    if (!_instance) _instance = new Settings();

    return _instance;
  },
});

module.exports = { Params, THEMES, sanitizeTheme, sanitizeDisplayId };
