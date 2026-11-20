/**
 * Liste des applications de la barre : ajout, déplacement, suppression, séparateurs.
 *
 * Fonctions pures, sans état ni Electron : `AppListService` s'en sert pour modifier la liste
 * et renvoyer à la page de la barre de quoi rester à jour (séparateurs retirés, décalages).
 */
// [sanitizeAppData.ts] Validation et nettoyage des données d'une application reçues d'une page (nom, adresse, icône)
import type { AppData } from '../security/sanitizeAppData.js';

/** Un élément de la barre : une application ou un séparateur. */
export type AppEntry = AppData | 'separator';

/** Sens d'un déplacement dans la barre : vers le haut ou vers le bas. */
export type MoveDirection = 'up' | 'down';

/** Référence donnée à la page pour retrouver un séparateur à supprimer (adresse, position 0 ou inconnue). */
export type SeparatorRef = string | number | undefined;

/** Résultat d'un nettoyage de la liste : la liste corrigée et les séparateurs retirés. */
export interface CollapsedList {
  readonly list: readonly AppEntry[];
  /** Séparateurs retirés, dans l'ordre : la page les supprime de son côté avec ces références. */
  readonly removedSeparators: readonly SeparatorRef[];
}

/** Résultat d'un déplacement : comme un nettoyage, avec le nombre de séparateurs enjambés. */
export interface MovedList extends CollapsedList {
  /** Nombre de séparateurs enjambés par le déplacement. */
  readonly modifier: number;
}

/** Résultat de l'ajout d'un séparateur : en fin de liste, ou inséré à une position (avec son indice). */
export type SeparatorInsertion =
  | { readonly kind: 'appended'; readonly list: readonly AppEntry[] }
  | { readonly kind: 'inserted'; readonly list: readonly AppEntry[]; readonly index: number };

/** Valeur qui représente un séparateur dans la liste enregistrée. */
const SEPARATOR = 'separator';

/** Indique si l'élément est une application (et non un séparateur ou une valeur absente). */
const isApp = (entry: AppEntry | undefined): entry is AppData => typeof entry === 'object' && entry !== null;

/** @returns L'adresse de l'application à cet indice, `undefined` pour un séparateur ou un indice hors liste */
const urlAt = (list: readonly AppEntry[], index: number): string | undefined => {
  const entry = list[index];
  return isApp(entry) ? entry.url : undefined;
};

/**
 * Cherche une application par son adresse.
 * @returns L'indice de l'application ayant cette adresse, -1 si absente
 */
export function indexOfApp(list: readonly AppEntry[], url: string): number {
  return list.findIndex((entry) => isApp(entry) && entry.url === url);
}

/**
 * Extrait les adresses des applications d'une liste lue sur le disque.
 * @param list Liste non fiable : les séparateurs et les entrées invalides sont ignorés
 * @returns Les adresses des applications
 */
export function savedUrls(list: readonly unknown[]): string[] {
  return list.filter((entry): entry is AppData => typeof entry === 'object' && entry !== null).map((entry) => entry.url);
}

/**
 * Retire les séparateurs consécutifs, et le séparateur de tête si demandé.
 * @param list Liste à nettoyer (non modifiée)
 * @param options.dropLeading Retire aussi un séparateur placé en première position
 */
export function collapseSeparators(list: readonly AppEntry[], options: { dropLeading: boolean }): CollapsedList {
  const kept: AppEntry[] = [];
  const removedSeparators: SeparatorRef[] = [];
  let consecutive = 0;

  list.forEach((entry, index) => {
    if (options.dropLeading && index === 0 && entry === SEPARATOR) {
      removedSeparators.push(0);
      return;
    }

    if (index + 1 < list.length && entry === SEPARATOR && list[index + 1] === SEPARATOR) {
      removedSeparators.push(urlAt(list, index - (1 + consecutive)));
      ++consecutive;
      return;
    }

    consecutive = 0;
    kept.push(entry);
  });

  return { list: kept, removedSeparators };
}

/**
 * Retire une application de la liste.
 * @returns La liste sans l'application, les séparateurs devenus consécutifs étant fusionnés
 */
export function removeApp(list: readonly AppEntry[], url: string): CollapsedList {
  const remaining = list.filter((entry) => !(isApp(entry) && entry.url === url));
  return collapseSeparators(remaining, { dropLeading: false });
}

/**
 * Déplace une application d'un cran, en enjambant les séparateurs voisins.
 * @returns `null` si l'application n'est pas dans la liste
 */
export function moveApp(list: readonly AppEntry[], url: string, direction: MoveDirection): MovedList | null {
  const index = indexOfApp(list, url);
  if (index < 0) return null;

  const rest = [...list];
  const [moved] = rest.splice(index, 1);
  if (moved === undefined) return null;

  const step = direction === 'up' ? -1 : 1;
  let modifier = 0;
  while (rest[index + step * modifier] === SEPARATOR) ++modifier;

  rest.splice(index + step * (1 + modifier), 0, moved);

  return { ...collapseSeparators(rest, { dropLeading: true }), modifier };
}

/**
 * Place un séparateur juste après une application.
 * @returns La liste avec un séparateur après l'application, `null` si elle est absente
 */
export function insertSeparatorAfter(list: readonly AppEntry[], url: string): SeparatorInsertion | null {
  const index = indexOfApp(list, url);
  if (index < 0) return null;

  if (index + 1 >= list.length) return { kind: 'appended', list: [...list, SEPARATOR] };

  const next = [...list];
  next.splice(index + 1, 0, SEPARATOR);
  return { kind: 'inserted', list: next, index };
}

/**
 * Remplace les informations d'une application.
 * @returns `null` si la position ne désigne pas une application (un séparateur ne se modifie pas)
 */
export function replaceApp(
  list: readonly AppEntry[],
  id: unknown,
  data: AppData,
): { list: readonly AppEntry[]; oldLink: string } | null {
  if (typeof id !== 'number' || !Number.isInteger(id)) return null;

  const target = list[id];
  if (!isApp(target)) return null;

  const next = [...list];
  next[id] = { name: data.name, url: data.url, picture: data.picture };
  return { list: next, oldLink: target.url };
}
