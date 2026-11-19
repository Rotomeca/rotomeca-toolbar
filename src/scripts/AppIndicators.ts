export const MEDIA_ACTIONS = ['play', 'pause', 'previoustrack', 'nexttrack'] as const;

export type MediaAction = (typeof MEDIA_ACTIONS)[number];

/** État média d'un site, après validation. */
export interface MediaState {
  /** Durée en secondes, `null` si inconnue. */
  readonly duration: number | null;
  /** Position en secondes, `null` si la durée est inconnue. */
  readonly position: number | null;
  readonly title: string;
  readonly artist: string;
  readonly artwork: string | null;
  readonly playing: boolean;
  readonly actions: readonly MediaAction[];
}

const MAX_TEXT_LENGTH = 200;
const MAX_DATA_URL_LENGTH = 500000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

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

function parseJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

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
