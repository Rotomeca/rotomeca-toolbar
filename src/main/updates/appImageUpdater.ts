/**
 * Adaptateur qui présente electron-updater (AppImage, Linux) comme le `SquirrelUpdater` attendu par le gestionnaire.
 *
 * Utilisé par `createUpdateManager.ts`. Pur, sans `electron` ni `electron-updater` : l'updater est injecté (testable).
 */
// [UpdateManager.ts] Gestionnaire de mises à jour : Squirrel, AppImage, GitHub (Linux) et canal de pré-versions
import type { SquirrelUpdater } from '../../scripts/UpdateManager.js';
// [dto.ts] Données échangées entre le processus principal et les pages (applications, médias, mises à jour, écrans)
import type { UpdateChannel } from '../../shared/dto.js';

/** Ce que l'adaptateur utilise d'electron-updater (`AppImageUpdater` / `autoUpdater` conviennent). */
export interface ElectronUpdaterLike {
  /** Télécharge la mise à jour dès qu'elle est trouvée. */
  autoDownload: boolean;
  /** Installe la mise à jour à la fermeture : désactivé, l'installation est demandée par l'utilisateur. */
  autoInstallOnAppQuit: boolean;
  /** Propose aussi les pré-versions GitHub. */
  allowPrerelease: boolean;
  /** Nom du canal (fichier `<canal>-linux.yml` de la release). */
  channel: string | null;
  /** Écoute un évènement ; seule la version est lue dans l'information transmise. */
  on(event: 'update-available' | 'update-not-available', listener: () => void): unknown;
  on(event: 'update-downloaded', listener: (info: { readonly version: string }) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'download-progress', listener: (progress: { readonly percent: number }) => void): unknown;
  /** Interroge GitHub ; le résultat passe par les évènements. */
  checkForUpdates(): Promise<unknown>;
  /** Quitte l'application et lance la version téléchargée (`isSilent`, `isForceRunAfter`). */
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

/** Adaptateur et réglage du canal. */
export interface AppImageUpdater {
  /** Interface commune avec Squirrel, utilisée par le gestionnaire. */
  readonly updater: SquirrelUpdater;
  /** Oriente les vérifications vers les versions publiées (`stable`) ou les pré-versions (`test`). */
  readonly setChannel: (channel: UpdateChannel) => void;
}

/**
 * @param source electron-updater (injecté)
 * @returns L'adaptateur et la fonction qui change de canal
 */
export function createAppImageUpdater(source: ElectronUpdaterLike): AppImageUpdater {
  source.autoDownload = true;
  source.autoInstallOnAppQuit = false;
  // Les pré-versions (X.Y.Z-rcN) ont aussi un `latest-linux.yml` : un seul nom de canal
  source.channel = 'latest';
  source.allowPrerelease = false;

  const updater: SquirrelUpdater = {
    on(event: string, listener: (...args: never[]) => void): unknown {
      switch (event) {
        case 'update-downloaded':
          // Le gestionnaire lit le nom de version en 3e argument (comme Squirrel sur macOS)
          return source.on('update-downloaded', (info) =>
            (listener as (event: unknown, notes: string, releaseName: string) => void)(null, '', info.version),
          );
        case 'error':
          return source.on('error', listener as (error: Error) => void);
        default:
          return source.on(event as 'update-available' | 'update-not-available', listener as () => void);
      }
    },
    onProgress(listener): void {
      source.on('download-progress', (progress) => listener(progress.percent));
    },
    checkForUpdates(): void {
      source.checkForUpdates().catch((error: unknown) => {
        console.error('AppImage update check failed', error);
      });
    },
    quitAndInstall(): void {
      source.quitAndInstall(false, true);
    },
  };

  return {
    updater,
    setChannel: (channel) => {
      source.allowPrerelease = channel === 'test';
    },
  };
}
