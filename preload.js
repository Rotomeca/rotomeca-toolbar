const { contextBridge, ipcRenderer } = require('electron');

// Un preload sandboxé ne peut pas `require` de fichier local : les listes
// ci-dessous doivent rester synchronisées avec
// `src/scripts/events/AppEventList.js` et `PageEventList.js`.

/** Canaux `ipcMain.handle` autorisés pour le renderer */
const INVOKE_CHANNELS = new Set([
  'toggleToolbar',
  'requestAdd',
  'requestAddData',
  'requestAddSeparator',
  'requestAddDataEdit',
  'requestUpdatedData',
  'closeFrame',
  'openFrame',
  'closeApps',
  'appDelete',
  'appEdit',
  'timeoutStopTop',
  'toggleStopTop',
  'requestMovement',
  'killApp',
  'refreshApp',
  'minimiseWindow',
  'setting.updated',
  'getVersion',
  'isAppBarSupported',
  'getDisplays',
  'toggleMute',
  'mediaControl',
  'mediaHover',
  'rotomeca-context-menu',
  'edgeEnter',
  'requestToggle',
]);

/** Canaux envoyés par le process principal vers le renderer */
const ON_CHANNELS = new Set([
  'toolbarClosed',
  'mode_edit',
  'frameOpen',
  'toolbarAppSeparatorDelete',
  'toolbarAppDeleted',
  'windowAppMovement',
  'appEdited',
  'appAdded',
  'appUpdated',
  'init',
  'appInserted',
  'windowAppsClosed',
  'settingsStart',
  'appIndicators',
  'mediaState',
]);

// #region Traductions
// Le dictionnaire est demandé de façon synchrone : il doit être disponible
// avant que les composants de la page ne lisent leurs attributs.
const I18N_ATTRIBUTE_PREFIX = 'data-i18n-';

const { locale = 'en', dict = {} } = (() => {
  try {
    return ipcRenderer.sendSync('rtb-i18n') ?? {};
  } catch (error) {
    return {};
  }
})();

/**
 * @param {string} key
 * @param {Object<string, string|number>} [vars]
 * @returns {string}
 */
function translate(key, vars = {}) {
  return (dict[key] ?? key).replace(/\{(\w+)\}/g, (match, name) =>
    name in vars ? String(vars[name]) : match,
  );
}

/**
 * Applique les traductions d'un élément : `data-i18n="clé"` pour le texte,
 * `data-i18n-<attribut>="clé"` pour un attribut.
 * @param {Element} element
 */
function translateElement(element) {
  for (const name of element.getAttributeNames()) {
    if (name === 'data-i18n') {
      element.textContent = translate(element.getAttribute(name));
    } else if (name.startsWith(I18N_ATTRIBUTE_PREFIX)) {
      element.setAttribute(
        name.slice(I18N_ATTRIBUTE_PREFIX.length),
        translate(element.getAttribute(name)),
      );
    }
  }
}

/**
 * @param {Node} node
 */
function translateTree(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  translateElement(node);
  node.querySelectorAll('*').forEach(translateElement);
}

// `document.documentElement` peut ne pas exister encore au chargement du preload
const applyLanguage = () => {
  if (document.documentElement) document.documentElement.lang = locale;
};

// Traduit les éléments dès qu'ils sont analysés, donc avant l'enregistrement
// des composants (scripts de type module, exécutés après l'analyse de la page)
new MutationObserver((records) => {
  applyLanguage();
  for (const record of records) record.addedNodes.forEach(translateTree);
}).observe(document, { childList: true, subtree: true });

window.addEventListener('DOMContentLoaded', () => {
  applyLanguage();
  translateTree(document.documentElement);
});
// #endregion

contextBridge.exposeInMainWorld('api', {
  /** Langue de l'interface (`fr`, `en`) */
  locale,
  /**
   * Traduit une clé pour les textes générés par les scripts de la page.
   * @param {string} key
   * @param {Object<string, string|number>} [vars]
   */
  t: (key, vars) => translate(String(key), vars ?? {}),
  invoke: (channel, ...data) => {
    if (INVOKE_CHANNELS.has(channel)) {
      return ipcRenderer.invoke(channel, ...data);
    }
  },
  /**
   * Écoute un canal autorisé. Le premier argument du callback (l'évènement IPC)
   * n'est jamais transmis à la page.
   * @returns {() => void} Fonction de désabonnement
   */
  on: (channel, callback) => {
    if (!ON_CHANNELS.has(channel) || typeof callback !== 'function')
      return () => {};

    const listener = (_event, ...args) => callback(null, ...args);
    ipcRenderer.on(channel, listener);

    return () => ipcRenderer.removeListener(channel, listener);
  },
});
