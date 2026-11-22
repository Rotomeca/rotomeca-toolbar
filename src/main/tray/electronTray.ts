/**
 * Branchement de l'icône de la zone de notification sur Electron (Tray, Menu, nativeImage).
 *
 * Utilisé par `App` : fournit à `TrayService` les icônes (avec pastille de mise à jour,
 * mises en cache par niveau) et la construction du menu natif.
 */
// [electron] API d'Electron (fenêtres, IPC, zone de notification, sessions...)
import { BrowserWindow, Menu, Tray, app, nativeImage } from 'electron';
import type { NativeImage } from 'electron';
// [versions.ts] Numéros de version : comparaison et détection des pré-versions (`X.Y.Z-rcN`)
import { isPrerelease } from '../../scripts/versions.js';
// [TrayService.ts] Service de l'icône de la zone de notification : menu, icône et infobulle qui suivent la mise à jour
import { TrayService } from './TrayService.js';
import type { TrayActions, TrayMenuItem } from './TrayService.js';
// [trayTooltip.ts] Texte de l'infobulle de la zone de notification : texte de base, pré-version et mise à jour
import type { TrayUpdateInfo } from './trayTooltip.js';
// [updateBadge.ts] Pastille de couleur dessinée sur l'icône de la zone de notification pour signaler une mise à jour
import { badgeCornerFor, paintUpdateBadge } from './updateBadge.js';
import type { UpdateLevel } from './updateBadge.js';

/** Côté (px) de l'icône redessinée avec une pastille. */
const BADGE_ICON_SIZE = 32;

/** Une icône : image native ou chemin de fichier. */
type Icon = NativeImage | string;

/** Réglages du service de la zone de notification. */
export interface ElectronTrayOptions {
  /** Chemin de l'icône normale de la zone de notification. */
  readonly trayIconPath: string;
  /** Chemin de l'icône de l'application, redessinée avec un point de couleur pour une mise à jour. */
  readonly appIconPath: string;
  /** L'état de la mise à jour, `null` si le gestionnaire n'est pas encore prêt. */
  readonly updateInfo: () => TrayUpdateInfo | null;
  /** Traduit une clé de `locales/*.json`. */
  readonly translate: (key: string, variables?: Readonly<Record<string, string | number>>) => string;
  /** Raccourci global affiché dans le menu. */
  readonly shortcut: string;
  /** Actions déclenchées par le menu et le clic sur l'icône. */
  readonly actions: TrayActions;
  /** Ajoute l'entrée de débogage (développement seulement). */
  readonly isDev: boolean;
}

/** Icône de l'application avec un point de couleur : orange (version disponible) ou vert (prête). */
function badgedIcon(appIconPath: string, level: UpdateLevel): NativeImage {
  const base = nativeImage.createFromPath(appIconPath).resize({ width: BADGE_ICON_SIZE, height: BADGE_ICON_SIZE });
  const bitmap = paintUpdateBadge(Buffer.from(base.toBitmap()), BADGE_ICON_SIZE, level, badgeCornerFor(isPrerelease(app.getVersion())));

  return nativeImage.createFromBitmap(bitmap, { width: BADGE_ICON_SIZE, height: BADGE_ICON_SIZE });
}

/** @returns Les fenêtres ouvertes, chacune avec l'action qui ouvre ses outils de développement */
function debugWindows(): TrayMenuItem[] {
  return BrowserWindow.getAllWindows().map((window) => ({
    label: window.title,
    click: () => window.webContents.openDevTools(),
  }));
}

/** @returns Le service de la zone de notification branché sur Electron (icônes mises en cache par niveau) */
export function createElectronTray(options: ElectronTrayOptions): TrayService<Icon> {
  const cache = new Map<UpdateLevel, NativeImage>();

  const iconFor = (level: UpdateLevel | null): Icon => {
    if (!level) return options.trayIconPath;

    let icon = cache.get(level);
    if (!icon) {
      icon = badgedIcon(options.appIconPath, level);
      cache.set(level, icon);
    }

    return icon;
  };

  return new TrayService<Icon>({
    createTray: (icon) => new Tray(icon),
    iconFor,
    buildMenu: (template) => Menu.buildFromTemplate([...template]),
    updateInfo: options.updateInfo,
    translate: options.translate,
    shortcut: options.shortcut,
    actions: options.actions,
    ...(options.isDev ? { debugWindows } : {}),
  });
}
