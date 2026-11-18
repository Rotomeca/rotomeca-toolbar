const fs = require('fs');
const path = require('path');

/** Langue utilisée quand celle du système n'est pas gérée */
const DEFAULT_LOCALE = 'en';
const SUPPORTED_LOCALES = ['fr', 'en'];
const LOCALES_DIR = path.join(__dirname, '../locales');

/** @type {?string} */
let _locale = null;
/** @type {?Object<string, string>} */
let _dictionary = null;

/**
 * Lit un fichier de traduction (vide si absent ou invalide).
 * @param {string} locale
 * @returns {Object<string, string>}
 */
function readLocale(locale) {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(LOCALES_DIR, `${locale}.json`), 'utf8'),
    );
  } catch (error) {
    console.error(`Traductions '${locale}' illisibles`, error);
    return {};
  }
}

/**
 * Langue de l'interface : celle du système si elle est gérée.
 * @returns {string}
 */
function getLocale() {
  if (!_locale) {
    let system = '';
    try {
      system = require('electron').app.getLocale() ?? '';
    } catch (error) {
      // Hors Electron (tests) : langue par défaut
    }

    const short = system.toLowerCase().split(/[-_]/)[0];
    _locale = SUPPORTED_LOCALES.includes(short) ? short : DEFAULT_LOCALE;
  }

  return _locale;
}

/**
 * Dictionnaire de la langue courante, complété par la langue par défaut.
 * @returns {Object<string, string>}
 */
function getDictionary() {
  if (!_dictionary) {
    _dictionary = {
      ...readLocale(DEFAULT_LOCALE),
      ...readLocale(getLocale()),
    };
  }

  return _dictionary;
}

/**
 * Traduit une clé.
 * @param {string} key
 * @param {Object<string, string|number>} [vars] Valeurs de `{nom}` dans le texte
 * @returns {string} Le texte traduit, ou la clé si elle est inconnue
 */
function t(key, vars = {}) {
  const text = getDictionary()[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    name in vars ? String(vars[name]) : match,
  );
}

module.exports = { t, getLocale, getDictionary };
