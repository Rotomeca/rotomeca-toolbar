import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { interpolate } from '../shared/i18n/interpolate.js';
import type { Variables } from '../shared/i18n/interpolate.js';

export type Dictionary = Readonly<Record<string, string>>;

/** Langue utilisée quand celle du système n'est pas gérée */
const DEFAULT_LOCALE = 'en';
const SUPPORTED_LOCALES = ['fr', 'en'] as const;
const LOCALES_DIR = path.join(__dirname, '../locales');

let locale: string | null = null;
let dictionary: Dictionary | null = null;

/** @returns Les entrées texte d'une valeur JSON (le reste est ignoré) */
function toDictionary(value: unknown): Dictionary {
  if (typeof value !== 'object' || value === null) return {};

  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

/** Lit un fichier de traduction (vide si absent ou invalide). */
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
 * @param variables Valeurs de `{nom}` dans le texte
 * @returns Le texte traduit, ou la clé si elle est inconnue
 */
export function t(key: string, variables: Variables = {}): string {
  return interpolate(getDictionary()[key] ?? key, variables);
}
