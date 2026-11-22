/**
 * Indicateurs d'une application : nombre de non-lus du titre et état média validé.
 *
 * Utilisé par le processus principal pour afficher les pastilles de la barre et
 * le mini-lecteur. Les données viennent de sites tiers : tout est revalidé ici.
 */
// [dto.ts] Données échangées entre le processus principal et les pages (applications, médias, mises à jour, écrans)
import type { MediaAction, MediaState } from '../shared/dto.js';
// [mediaLimits.ts] Bornes de l'état média envoyé par un site (taille du message, débit)
import { MAX_MEDIA_STATE_LENGTH } from '../shared/mediaLimits.js';

export type { MediaAction, MediaState };

/** Commandes média qu'un site peut exposer et que la barre sait lui renvoyer. */
export const MEDIA_ACTIONS: readonly MediaAction[] = ['play', 'pause', 'previoustrack', 'nexttrack'];

/** Longueur maximale du titre et de l'artiste retenus (la page est non fiable). */
const MAX_TEXT_LENGTH = 200;
/** Taille maximale d'une pochette intégrée en `data:` (en caractères). */
const MAX_DATA_URL_LENGTH = 500000;

/** @returns true si la valeur est un objet non nul (donc lisible par clé) */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** @returns true si la valeur est l'une des commandes de {@link MEDIA_ACTIONS} */
function isMediaAction(value: unknown): value is MediaAction {
  return MEDIA_ACTIONS.some((action) => action === value);
}

/**
 * Extrait le nombre de notifications non lues d'un titre de page, selon la
 * convention utilisée par la plupart des webapps : `(3) Boîte de réception`,
 * `[3] Chat` ou `(99+) Messages`.
 * @param title Titre de la page
 * @returns Le nombre de non-lus (0 si aucun)
 */
export function parseUnreadCount(title: string | null | undefined): number {
  const match = /^\s*[([](\d{1,4})\+?[)\]]/.exec(title ?? '');

  return match?.[1] ? parseInt(match[1], 10) : 0;
}

/** @returns Le JSON décodé, ou `null` si la valeur n'est pas une chaîne JSON valide ou dépasse la taille permise (refusée avant tout décodage) */
function parseJson(raw: unknown): unknown {
  if (typeof raw !== 'string' || raw.length > MAX_MEDIA_STATE_LENGTH) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** @returns Le texte tronqué à {@link MAX_TEXT_LENGTH}, ou une chaîne vide si ce n'est pas du texte */
function limitedText(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, MAX_TEXT_LENGTH) : '';
}

/** @returns L'adresse de la pochette si elle est sûre (https, ou petite image intégrée), sinon null */
function safeArtwork(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const isHttps = /^https:\/\//.test(value);
  const isSmallDataImage = /^data:image\//.test(value) && value.length <= MAX_DATA_URL_LENGTH;
  return isHttps || isSmallDataImage ? value : null;
}

/** @returns Le nombre s'il est fini, sinon 0 (durée et position viennent de la page) */
function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Valide l'état média envoyé par une page (donnée non fiable).
 * @param raw JSON (chaîne) issu du script injecté dans le site
 * @returns L'état validé, ou `null` si la page n'expose aucun morceau
 */
export function sanitizeMediaState(raw: unknown): MediaState | null {
  const data = parseJson(raw);
  if (!isRecord(data) || typeof data['title'] !== 'string') return null;

  const duration = finiteNumber(data['duration']);
  const position = finiteNumber(data['position']);
  const actions: unknown[] = Array.isArray(data['actions']) ? data['actions'] : [];

  return {
    duration: duration > 0 ? duration : null,
    position: duration > 0 ? Math.min(Math.max(position, 0), duration) : null,
    title: limitedText(data['title']),
    artist: limitedText(data['artist']),
    artwork: safeArtwork(data['artwork']),
    playing: data['playing'] === true,
    actions: actions.filter(isMediaAction),
  };
}
