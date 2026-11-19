import type { UpdateLevel } from './updateBadge.js';

/** Ce que l'infobulle dit de la version et des mises à jour. */
export interface TrayUpdateInfo {
  /** La version installée est une pré-version. */
  readonly prerelease: boolean;
  readonly versionActuelle: string;
  readonly versionDisponible: string | null;
  readonly level: UpdateLevel | null;
}

export interface TrayTooltipOptions {
  /** Texte de base de l'infobulle. */
  readonly text: string;
  /** `null` : le gestionnaire de mises à jour n'est pas encore disponible. */
  readonly update: TrayUpdateInfo | null;
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
