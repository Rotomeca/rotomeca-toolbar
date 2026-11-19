import { BrowserWindow, Menu, Tray, app, nativeImage } from 'electron';
import type { NativeImage } from 'electron';
import { isPrerelease } from '../../scripts/versions.js';
import { TrayService } from './TrayService.js';
import type { TrayActions, TrayMenuItem } from './TrayService.js';
import type { TrayUpdateInfo } from './trayTooltip.js';
import { badgeCornerFor, paintUpdateBadge } from './updateBadge.js';
import type { UpdateLevel } from './updateBadge.js';

const BADGE_ICON_SIZE = 32;

type Icon = NativeImage | string;

export interface ElectronTrayOptions {
  /** Chemin de l'icône normale de la zone de notification. */
  readonly trayIconPath: string;
  /** Chemin de l'icône de l'application, redessinée avec un point de couleur pour une mise à jour. */
  readonly appIconPath: string;
  readonly updateInfo: () => TrayUpdateInfo | null;
  readonly translate: (key: string, variables?: Readonly<Record<string, string | number>>) => string;
  readonly shortcut: string;
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
