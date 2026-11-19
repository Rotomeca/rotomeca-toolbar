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

/** Les lecteurs qui jouent un morceau : le premier est affiché, les autres sont ignorés. */
export interface TaskbarPlayers {
  readonly first: string | undefined;
  readonly others: readonly string[];
}

/** @param urls Adresses des applications ayant un morceau, dans l'ordre d'ouverture */
export function splitTaskbarPlayers(urls: readonly string[]): TaskbarPlayers {
  const [first, ...others] = urls;
  return { first, others };
}

/** @returns Les adresses dont l'état « ignoré » diffère entre deux ensembles */
export function changedIgnored(previous: ReadonlySet<string>, current: ReadonlySet<string>): string[] {
  return [...new Set([...previous, ...current])].filter((url) => previous.has(url) !== current.has(url));
}

/**
 * @param media Le morceau affiché
 * @param ignoredCount Nombre d'autres lecteurs ignorés
 * @returns Le texte de l'infobulle de la zone de notification pour ce morceau
 */
export function describeNowPlaying(
  media: Pick<MediaState, 'playing' | 'title' | 'artist' | 'duration' | 'position'>,
  ignoredCount: number,
  translate: (key: string, variables?: Readonly<Record<string, string | number>>) => string,
): string {
  const progress = mediaProgress(media);
  const lines = [`${media.playing ? '▶' : '⏸'} ${[media.title, media.artist].filter(Boolean).join(' – ')}`];

  if (progress !== null) lines.push(`${Math.round(progress * 100)} %`);
  if (ignoredCount > 0) lines.push(translate('tray.ignoredPlayers', { count: ignoredCount }));

  return lines.join('\n');
}
