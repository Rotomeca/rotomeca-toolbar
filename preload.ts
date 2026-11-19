// Preload des pages de l'application : expose `window.api` (voir src/types/window-api.d.ts).
// Un preload sandboxé ne peut charger aucun autre fichier : esbuild bundle ce fichier et ses
// imports en un seul (voir scripts/build.js).

import { contextBridge, ipcRenderer } from 'electron';
import { interpolate } from './src/shared/i18n/interpolate.js';
import type { Variables } from './src/shared/i18n/interpolate.js';
import { appEventList, internalChannels, pageEventList } from './src/shared/ipc/events.js';
import type { RotomecaApi } from './src/types/window-api.js';

/** Canaux que les pages peuvent appeler, dérivés de la source unique des canaux. */
const INVOKE_CHANNELS: ReadonlySet<string> = new Set(Object.values(appEventList));

/** Canaux que les pages peuvent écouter, dérivés de la source unique des canaux. */
const ON_CHANNELS: ReadonlySet<string> = new Set(Object.values(pageEventList));

// #region Traductions
// Le dictionnaire est demandé de façon synchrone : il doit être disponible
// avant que les composants de la page ne lisent leurs attributs.
const I18N_ATTRIBUTE_PREFIX = 'data-i18n-';

interface Translations {
  readonly locale?: string;
  readonly dict?: Readonly<Record<string, string>>;
}

function loadTranslations(): Translations {
  try {
    return (ipcRenderer.sendSync(internalChannels.i18n) as Translations | undefined) ?? {};
  } catch {
    // Pas de traductions (processus principal indisponible) : les clés s'affichent telles quelles
    return {};
  }
}

const { locale = 'en', dict = {} } = loadTranslations();

function translate(key: string, variables: Variables = {}): string {
  return interpolate(dict[key] ?? key, variables);
}

/**
 * Applique les traductions d'un élément : `data-i18n="clé"` pour le texte,
 * `data-i18n-<attribut>="clé"` pour un attribut.
 */
function translateElement(element: Element): void {
  for (const name of element.getAttributeNames()) {
    const key = element.getAttribute(name) ?? '';

    if (name === 'data-i18n') {
      element.textContent = translate(key);
    } else if (name.startsWith(I18N_ATTRIBUTE_PREFIX)) {
      element.setAttribute(name.slice(I18N_ATTRIBUTE_PREFIX.length), translate(key));
    }
  }
}

function translateTree(node: Node): void {
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const element = node as Element;
  translateElement(element);
  element.querySelectorAll('*').forEach(translateElement);
}

// `document.documentElement` peut ne pas exister encore au chargement du preload
function applyLanguage(): void {
  if (document.documentElement) document.documentElement.lang = locale;
}

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

const api: RotomecaApi = {
  locale,

  t: (key, variables) => translate(String(key), variables ?? {}),

  invoke: (channel, ...data) => {
    if (!INVOKE_CHANNELS.has(channel)) return Promise.reject(new Error(`Canal IPC non autorisé : ${String(channel)}`));
    // La réponse est celle que le contrat du canal annonce (src/shared/ipc/contracts.ts)
    return ipcRenderer.invoke(channel, ...data);
  },

  on: (channel, callback) => {
    if (!ON_CHANNELS.has(channel) || typeof callback !== 'function') return () => undefined;

    // L'évènement IPC n'est jamais transmis à la page
    // Les arguments sont ceux que le contrat du canal annonce : le processus principal les construit
    const deliver = callback as (event: null, ...args: unknown[]) => void;
    const listener = (_event: unknown, ...args: unknown[]): void => deliver(null, ...args);
    ipcRenderer.on(channel, listener);

    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
};

contextBridge.exposeInMainWorld('api', api);
