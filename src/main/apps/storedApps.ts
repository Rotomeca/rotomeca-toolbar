/**
 * Relecture tolérante de la liste des applications enregistrée (`data.rsft`).
 *
 * Utilisé par `AppListService` au chargement. Le fichier n'est pas fiable (copie abîmée, édité à la main,
 * très ancienne version) : une entrée inutilisable est écartée, un champ invalide est corrigé, mais une entrée
 * valide est conservée telle quelle (champs inconnus compris) pour que le format ne change jamais.
 */
// [safeUrl.ts] Contrôle qu'une adresse est une URL http(s) avant de l'ouvrir ou de la charger
import { isSafeUrl } from '../../scripts/safeUrl.js';
// [appList.ts] Liste des applications de la barre : ajout, déplacement, suppression, séparateurs
import type { AppEntry } from './appList.js';

/** Icône de police du projet, sous la forme `font:nom`. */
const FONT_ICON = /^font:[\w-]{1,64}$/;

/** Résultat de la relecture. */
export interface StoredApps {
  /** Les éléments utilisables, dans l'ordre du fichier. */
  readonly list: readonly AppEntry[];
  /** `true` si le fichier contenait autre chose que ces éléments tels quels (entrée écartée, champ corrigé, pas une liste). */
  readonly repaired: boolean;
}

/** @returns true si la valeur est un objet non nul (donc lisible par clé) */
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Une icône enregistrée est utilisable si le bouton sait l'afficher sans erreur : icône de police, image
 * intégrée ou adresse http(s). Le reste (nom de classe avec espaces, chemin local…) est remplacé par « aucune icône ».
 *
 * @param picture Icône enregistrée
 * @returns true si l'icône est utilisable
 */
function isUsablePicture(picture: unknown): picture is string {
  return typeof picture === 'string' && (FONT_ICON.test(picture) || picture.startsWith('data:image/') || isSafeUrl(picture));
}

/**
 * @param entry Élément enregistré
 * @returns L'application corrigée si besoin, ou `null` si elle n'a pas d'adresse http(s) utilisable
 */
function repairApp(entry: Record<string, unknown>): AppEntry | null {
  const { url, name } = entry;
  if (typeof url !== 'string' || !isSafeUrl(url)) return null;

  const repaired: Record<string, unknown> = { ...entry };
  if (typeof name !== 'string' || name.trim() === '') repaired['name'] = url;
  if ('picture' in entry && entry['picture'] !== null && !isUsablePicture(entry['picture'])) repaired['picture'] = null;

  return repaired as unknown as AppEntry;
}

/**
 * Relit la liste enregistrée sans jamais rejeter le fichier en bloc.
 *
 * @param data Contenu du fichier
 * @returns Les éléments utilisables et l'indication qu'une réparation a eu lieu
 */
export function readStoredApps(data: unknown): StoredApps {
  if (!Array.isArray(data)) return { list: [], repaired: true };

  const list: AppEntry[] = [];
  let repaired = false;

  for (const entry of data as unknown[]) {
    if (entry === 'separator') {
      list.push('separator');
      continue;
    }

    const app = isRecord(entry) ? repairApp(entry) : null;
    if (!app) {
      repaired = true;
      continue;
    }

    if (JSON.stringify(app) !== JSON.stringify(entry)) repaired = true;
    list.push(app);
  }

  return { list, repaired };
}
