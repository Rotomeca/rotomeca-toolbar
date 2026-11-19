/**
 * Preload des pages locales : expose `window.api` (appels IPC filtrés, évènements, traductions).
 *
 * Chargé dans chaque fenêtre de l'application ; c'est la seule porte entre une page et le processus
 * principal (liste blanche dérivée de `shared/ipc/events.ts`, types dans `src/types/window-api.d.ts`).
 * Un preload sandboxé ne peut charger aucun autre fichier : esbuild le bundle avec ses imports
 * en un seul (voir `scripts/build.js`).
 */

// [electron] API d'Electron (fenêtres, IPC, zone de notification, sessions...)
import { contextBridge, ipcRenderer } from 'electron';
// [interpolate.ts] Insertion de valeurs dans un texte traduit (`{nom}`), commune aux pages et au processus principal
import { interpolate } from './src/shared/i18n/interpolate.js';
import type { Variables } from './src/shared/i18n/interpolate.js';
// [events.ts] Noms de tous les canaux IPC : appels des pages, envois vers les pages, canaux internes
import { appEventList, internalChannels, pageEventList } from './src/shared/ipc/events.js';
// [window-api.d.ts] Type de `window.api`, l'API exposée aux pages par le preload
import type { RotomecaApi } from './src/types/window-api.js';

/** Canaux que les pages peuvent appeler, dérivés de la source unique des canaux. */
const INVOKE_CHANNELS: ReadonlySet<string> = new Set(Object.values(appEventList));

/** Canaux que les pages peuvent écouter, dérivés de la source unique des canaux. */
const ON_CHANNELS: ReadonlySet<string> = new Set(Object.values(pageEventList));

// #region Traductions
// Le dictionnaire est demandé de façon synchrone : il doit être disponible
// avant que les composants de la page ne lisent leurs attributs.
const I18N_ATTRIBUTE_PREFIX = 'data-i18n-';

/** Réponse du processus principal à la demande de traductions ; vide si la page n'est pas autorisée. */
interface Translations {
  /** Code de langue (`fr`, `en`). */
  readonly locale?: string;
  /** Textes de la langue courante, indexés par clé. */
  readonly dict?: Readonly<Record<string, string>>;
}

/**
 * Demande de façon synchrone la langue et le dictionnaire au processus principal.
 *
 * @returns Les traductions, ou un objet vide si le processus principal ne répond pas
 */
function loadTranslations(): Translations {
  try {
    return (ipcRenderer.sendSync(internalChannels.i18n) as Translations | undefined) ?? {};
  } catch {
    // Pas de traductions (processus principal indisponible) : les clés s'affichent telles quelles
    return {};
  }
}

/** Langue et dictionnaire de la page, avec l'anglais et un dictionnaire vide par défaut. */
const { locale = 'en', dict = {} } = loadTranslations();

/**
 * Traduit une clé et remplace ses variables.
 *
 * @param key Clé du dictionnaire.
 * @param variables Valeurs à insérer dans le texte.
 * @returns Le texte traduit, ou la clé elle-même si elle est inconnue
 */
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

/**
 * Traduit un nœud et tous ses descendants ; les nœuds qui ne sont pas des éléments sont ignorés.
 *
 * @param node Nœud ajouté à la page.
 */
function translateTree(node: Node): void {
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const element = node as Element;
  translateElement(element);
  element.querySelectorAll('*').forEach(translateElement);
}

/** Renseigne l'attribut `lang` de la page. `document.documentElement` peut ne pas exister encore au chargement du preload. */
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

/** API exposée aux pages sous `window.api` : seuls les canaux de la liste blanche sont accessibles. */
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
