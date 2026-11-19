/**
 * Texte de l'infobulle de la zone de notification : texte de base, pré-version et mise à jour.
 *
 * Fonction pure, utilisée par `TrayService`.
 */
// [updateBadge.ts] Pastille de couleur dessinée sur l'icône de la zone de notification pour signaler une mise à jour
import type { UpdateLevel } from './updateBadge.js';

/** Ce que l'infobulle dit de la version et des mises à jour. */
export interface TrayUpdateInfo {
  /** La version installée est une pré-version. */
  readonly prerelease: boolean;
  /** Version installée. */
  readonly versionActuelle: string;
  /** Version proposée ou prête à installer, `null` s'il n'y en a pas. */
  readonly versionDisponible: string | null;
  /** Niveau d'alerte de mise à jour, `null` s'il n'y a rien à signaler. */
  readonly level: UpdateLevel | null;
}

/** Données nécessaires pour composer l'infobulle. */
export interface TrayTooltipOptions {
  /** Texte de base de l'infobulle. */
  readonly text: string;
  /** `null` : le gestionnaire de mises à jour n'est pas encore disponible. */
  readonly update: TrayUpdateInfo | null;
  /** Traduit une clé de `locales/*.json`. */
  readonly translate: (key: string, variables?: Readonly<Record<string, string | number>>) => string;
}

/** @returns L'infobulle de la zone de notification, complétée de la pré-version et de la mise à jour */
export function buildTrayTooltip({ text, update, translate }: TrayTooltipOptions): string {
  if (!update) return text;

  const lines = [text];
  if (update.prerelease) lines.push(translate('tray.prerelease', { version: update.versionActuelle }));

  if (update.level) {
    const key = update.level === 'ready' ? 'tray.updateReady' : 'tray.updateAvailable';
    lines.push(translate(key, { version: update.versionDisponible ?? '' }));
  }

  return lines.join('\n');
}
