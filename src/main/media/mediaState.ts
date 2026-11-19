import type { MediaState } from '../../scripts/AppIndicators.js';

/** État affiché par la fenêtre de contrôle du morceau d'une application. */
export interface MediaPayload extends MediaState {
  readonly url: string;
  readonly muted: boolean;
}

/** @returns L'avancée du morceau entre 0 et 1, `null` si elle est inconnue */
export function mediaProgress(media: Pick<MediaState, 'duration' | 'position'> | null | undefined): number | null {
  return media?.duration ? (media.position ?? 0) / media.duration : null;
}

/**
 * @param media Le morceau en cours de l'application, s'il y en a un
 * @returns Ce que montre la fenêtre de contrôle, ou null s'il n'y a pas de morceau
 */
export function mediaPayload(url: string, media: MediaState | null | undefined, muted: boolean): MediaPayload | null {
  return media ? { url, ...media, muted } : null;
}
