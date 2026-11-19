/**
 * Calculs purs autour de l'état média des applications : avancée, contenu du popup, lecteurs ignorés.
 *
 * Utilisé par `App`, `MediaPopup` et la zone de notification pour décider ce qui s'affiche.
 */
// [dto.ts] Données échangées entre le processus principal et les pages (applications, médias, mises à jour, écrans)
import type { MediaPayload, MediaState } from '../../shared/dto.js';

export type { MediaPayload };

/** @returns L'avancée du morceau entre 0 et 1, `null` si elle est inconnue */
export function mediaProgress(media: Pick<MediaState, 'duration' | 'position'> | null | undefined): number | null {
  return media?.duration ? (media.position ?? 0) / media.duration : null;
}

/**
 * Compose ce que montre le popup de contrôle.
 * @param url Adresse de l'application
 * @param media Le morceau en cours de l'application, s'il y en a un
 * @param muted L'application est coupée
 * @returns Ce que montre la fenêtre de contrôle, ou null s'il n'y a pas de morceau
 */
export function mediaPayload(url: string, media: MediaState | null | undefined, muted: boolean): MediaPayload | null {
  return media ? { url, ...media, muted } : null;
}

/** Les lecteurs qui jouent un morceau : le premier est affiché, les autres sont ignorés. */
export interface TaskbarPlayers {
  /** Adresse du lecteur affiché, `undefined` si aucun ne joue. */
  readonly first: string | undefined;
  /** Adresses des autres lecteurs, ignorés. */
  readonly others: readonly string[];
}

/**
 * Sépare le lecteur affiché des autres.
 * @param urls Adresses des applications ayant un morceau, dans l'ordre d'ouverture
 */
export function splitTaskbarPlayers(urls: readonly string[]): TaskbarPlayers {
  const [first, ...others] = urls;
  return { first, others };
}

/** @returns Les adresses dont l'état « ignoré » diffère entre deux ensembles */
export function changedIgnored(previous: ReadonlySet<string>, current: ReadonlySet<string>): string[] {
  return [...new Set([...previous, ...current])].filter((url) => previous.has(url) !== current.has(url));
}

/**
 * Compose l'infobulle de la zone de notification pour le morceau affiché.
 * @param media Le morceau affiché
 * @param ignoredCount Nombre d'autres lecteurs ignorés
 * @param translate Traduit une clé de `locales/*.json`
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
