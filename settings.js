/**
 * Thèmes autorisés (liste blanche) et attributs `data-theme` / `data-palette`
 * correspondants. « system » est résolu en clair ou sombre par resolveTheme().
 */
const THEME_ATTRS = Object.freeze({
  system: null,
  clair: { theme: 'light', palette: '' },
  sombre: { theme: 'dark', palette: '' },
  marron: { theme: 'dark', palette: 'marron' },
  rouge: { theme: 'dark', palette: 'rouge' },
  bleu: { theme: 'dark', palette: 'bleu' },
  vert: { theme: 'dark', palette: 'vert' },
  sapin: { theme: 'dark', palette: 'sapin' },
  blanc: { theme: 'light', palette: 'blanc' },
  noir: { theme: 'dark', palette: 'noir' },
  hiver: { theme: 'dark', palette: 'hiver' },
  automne: { theme: 'dark', palette: 'automne' },
  printemps: { theme: 'dark', palette: 'printemps' },
  cerisier: { theme: 'dark', palette: 'cerisier' },
  ete: { theme: 'light', palette: 'ete' },
  noel: { theme: 'dark', palette: 'noel' },
});
const THEMES = Object.freeze(Object.keys(THEME_ATTRS));
const DEFAULT_THEME = 'system';

/** Thèmes de saison : les seuls à porter des effets animés. */
const SEASON_THEMES = Object.freeze(['hiver', 'automne', 'printemps', 'cerisier', 'ete', 'noel']);

/** Densités des effets de saison. */
const EFFECT_DENSITIES = Object.freeze(['discrete', 'normale', 'abondante']);
const DEFAULT_DENSITY = 'normale';

/**
 * @param {unknown} value
 * @returns {string} Une densité valide, ou la densité par défaut
 */
function sanitizeDensity(value) {
  return EFFECT_DENSITIES.includes(value) ? value : DEFAULT_DENSITY;
}

/** Anciennes valeurs enregistrées (avant 3.x) → thème équivalent. */
const LEGACY_THEMES = Object.freeze({
  dark: 'sombre',
  red: 'rouge',
  blue: 'bleu',
  green: 'vert',
  white: 'blanc',
  black: 'noir',
});

/**
 * @param {unknown} value
 * @returns {string} Un thème valide, ou le thème par défaut
 */
function sanitizeTheme(value) {
  if (typeof value !== 'string') return DEFAULT_THEME;
  if (Object.hasOwn(LEGACY_THEMES, value)) return LEGACY_THEMES[value];
  return THEMES.includes(value) ? value : DEFAULT_THEME;
}

/**
 * @param {string} theme Réglage de thème (déjà validé)
 * @param {boolean} systemIsDark Mode sombre de Windows
 * @returns {{theme: 'light'|'dark', palette: string}}
 */
function resolveTheme(theme, systemIsDark) {
  return (
    THEME_ATTRS[sanitizeTheme(theme)] ?? {
      theme: systemIsDark ? 'dark' : 'light',
      palette: '',
    }
  );
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

  /**
   * Barre ancrée qui se replie quand la souris la quitte.
   * @type {boolean}
   */
  get appBarAutoHide() {
    return this.#_config.appBarAutoHide === true;
  }

  set appBarAutoHide(value) {
    this.#_settings ??= this.#_config;
    this.#_settings.appBarAutoHide = value === true;
  }

  get theme() {
    return sanitizeTheme(this.#_config.theme);
  }

  set theme(value) {
    this.#_settings ??= this.#_config;
    this.#_settings.theme = sanitizeTheme(value);
  }

  /**
   * Effets de saison activés (par défaut oui).
   * @type {boolean}
   */
  get effetsSaison() {
    return this.#_config.effetsSaison !== false;
  }

  set effetsSaison(value) {
    this.#_settings ??= this.#_config;
    this.#_settings.effetsSaison = value !== false;
  }

  /**
   * Densité des effets de saison.
   * @type {'discrete'|'normale'|'abondante'}
   */
  get densiteEffets() {
    return sanitizeDensity(this.#_config.densiteEffets);
  }

  set densiteEffets(value) {
    this.#_settings ??= this.#_config;
    this.#_settings.densiteEffets = sanitizeDensity(value);
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
      appBarAutoHide: this.appBarAutoHide,
      theme: this.theme,
      effetsSaison: this.effetsSaison,
      densiteEffets: this.densiteEffets,
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

module.exports = {
  Params,
  THEMES,
  sanitizeTheme,
  sanitizeDensity,
  resolveTheme,
  SEASON_THEMES,
  sanitizeDisplayId,
};
