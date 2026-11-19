/**
 * Traductions du processus principal : langue du système, dictionnaire et fonction `t`.
 *
 * Utilisé par le processus principal pour les menus, notifications et dialogues.
 * Lit `src/locales/{fr,en}.json` ; la langue par défaut complète les clés manquantes.
 */
// [node:fs] accès au système de fichiers (Node.js)
import fs from 'node:fs';
// [node:path] manipulation de chemins de fichiers (Node.js)
import path from 'node:path';
// [electron] API d'Electron (fenêtres, IPC, zone de notification, sessions...)
import { app } from 'electron';
// [interpolate.ts] Insertion de valeurs dans un texte traduit (`{nom}`), commune aux pages et au processus principal
import { interpolate } from '../shared/i18n/interpolate.js';
import type { Variables } from '../shared/i18n/interpolate.js';

/** Textes d'une langue, indexés par clé. */
export type Dictionary = Readonly<Record<string, string>>;

/** Langue utilisée quand celle du système n'est pas gérée */
const DEFAULT_LOCALE = 'en';
/** Langues pour lesquelles un fichier de traduction existe. */
const SUPPORTED_LOCALES = ['fr', 'en'] as const;
/** Dossier des fichiers de traduction (voisin de `scripts/`, aussi dans `dist/`). */
const LOCALES_DIR = path.join(__dirname, '../locales');

/** Langue retenue, calculée à la première demande puis mémorisée. */
let locale: string | null = null;
/** Dictionnaire de la langue retenue, chargé à la première demande. */
let dictionary: Dictionary | null = null;

/**
 * @param value Contenu JSON d'un fichier de traduction (non typé)
 * @returns Les entrées texte d'une valeur JSON (le reste est ignoré)
 */
function toDictionary(value: unknown): Dictionary {
  if (typeof value !== 'object' || value === null) return {};

  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

/**
 * Lit un fichier de traduction (vide si absent ou invalide).
 * @param name Code de langue (`fr`, `en`)
 * @returns Le dictionnaire de cette langue
 */
function readLocale(name: string): Dictionary {
  try {
    return toDictionary(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${name}.json`), 'utf8')));
  } catch (error) {
    console.error(`Traductions '${name}' illisibles`, error);
    return {};
  }
}

/** @returns La langue du système, ou '' si elle n'est pas disponible (hors Electron, avant `ready`) */
function systemLocale(): string {
  try {
    // Hors Electron (tests), `app` est undefined : on retombe sur la langue par défaut
    return app?.getLocale() ?? '';
  } catch {
    return '';
  }
}

/** @returns La langue de l'interface : celle du système si elle est gérée */
export function getLocale(): string {
  if (locale === null) {
    const short = systemLocale().toLowerCase().split(/[-_]/)[0];
    locale = SUPPORTED_LOCALES.find((supported) => supported === short) ?? DEFAULT_LOCALE;
  }

  return locale;
}

/** @returns Le dictionnaire de la langue courante, complété par la langue par défaut */
export function getDictionary(): Dictionary {
  dictionary ??= { ...readLocale(DEFAULT_LOCALE), ...readLocale(getLocale()) };
  return dictionary;
}

/**
 * Traduit une clé.
 * @param key Clé du texte dans `fr.json` / `en.json`
 * @param variables Valeurs de `{nom}` dans le texte
 * @returns Le texte traduit, ou la clé si elle est inconnue
 */
export function t(key: string, variables: Variables = {}): string {
  return interpolate(getDictionary()[key] ?? key, variables);
}
