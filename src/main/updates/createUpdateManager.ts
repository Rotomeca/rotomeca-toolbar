/**
 * Construit le gestionnaire de mises à jour en le reliant à Electron (Squirrel, réseau, notifications).
 *
 * Appelé par `bootstrap.ts`. La logique de mise à jour est dans `scripts/UpdateManager.ts` (pure et testée) ;
 * ce fichier choisit le mode selon la plateforme et lui fournit ses dépendances concrètes.
 */
// [node:path] manipulation de chemins de fichiers (Node.js)
import path from 'node:path';
// [electron] API d'Electron (fenêtres, IPC, zone de notification, sessions...)
import { Notification, app, autoUpdater, net, session, shell } from 'electron';
// [electron-updater] Mise à jour automatique des AppImage (Linux) depuis les releases GitHub
import { autoUpdater as electronUpdater } from 'electron-updater';
// [appConfig.ts] Adresses des serveurs de mises à jour et dépôt des versions
import { feedUrl, releasesRepo, testFeedUrl } from '../../../configs/appConfig.js';
// [appIcon.ts] Choisit l'icône de l'application selon que la version est une pré-version ou non
import { iconBaseName } from '../../scripts/appIcon.js';
// [i18n.ts] Traductions du processus principal : langue du système, dictionnaire et fonction `t`
import { t } from '../../scripts/i18n.js';
// [Persistence.ts] Données de l'utilisateur : dossier userData figé, migration, sauvegardes et cookies de session
import { backupUserData, flushSession } from '../../scripts/Persistence.js';
// [safeUrl.ts] Contrôle qu'une adresse est une URL http(s) avant de l'ouvrir ou de la charger
import { isSafeUrl } from '../../scripts/safeUrl.js';
// [appImageUpdater.ts] Adaptateur d'electron-updater (AppImage, Linux) vers l'interface de Squirrel
import { createAppImageUpdater } from './appImageUpdater.js';
// [UpdateManager.ts] Gestionnaire de mises à jour : Squirrel, AppImage, GitHub (Linux) et canal de pré-versions
import { UpdateManager } from '../../scripts/UpdateManager.js';
import type { UpdateState } from '../../scripts/UpdateManager.js';
// [versions.ts] Numéros de version : comparaison et détection des pré-versions (`X.Y.Z-rcN`)
import { compareVersions } from '../../scripts/versions.js';
// [JsonFileStore.ts] Fichier JSON sûr : écriture atomique, sauvegarde `.bak`, mise en quarantaine d'un fichier corrompu
import { dataDirectory } from '../persistence/JsonFileStore.js';
// [updateMode.ts] Choix du mode de mise à jour (simulé, Squirrel, AppImage, manuel) et de l'adresse du serveur interrogé
import { createFeedSwitcher, resolveUpdateMode } from './updateMode.js';
// [updateNotification.ts] Notification système qui prévient qu'une mise à jour est prête ; un clic ouvre les Paramètres
import { showUpdateNotification } from './updateNotification.js';

/** Paramètres de câblage du gestionnaire de mises à jour. */
export interface UpdateWiring {
  /** Application lancée en mode développement (`--dev`). */
  readonly isDev: boolean;
  /** L'état de la mise à jour a changé. */
  readonly onChange: (state: UpdateState) => void;
  /** Une mise à jour est prête : l'utilisateur est prévenu, un clic ouvre les Paramètres. */
  readonly openSettings: () => void;
}

/**
 * @returns Le gestionnaire de mises à jour : Squirrel sous Windows, electron-updater pour une AppImage,
 * vérification GitHub pour les autres installations Linux (deb, rpm).
 * La vérification démarre avec `start()`.
 *
 * @param wiring Mode de lancement et rappels vers l'application.
 */
export function createUpdateManager({ isDev, onChange, openSettings }: UpdateWiring): UpdateManager {
  const mode = resolveUpdateMode({
    isDev,
    isPackaged: app.isPackaged,
    platform: process.platform,
    appImage: Boolean(process.env.APPIMAGE),
    simulateRequested: process.env.RTB_UPDATE_SIMULATE === '1',
  });

  // Serveur Hazel normal (versions publiées) ou serveur de test (pré-versions seulement)
  const setFeed = createFeedSwitcher({
    stableUrl: feedUrl,
    testUrl: testFeedUrl,
    platform: process.platform,
    version: app.getVersion(),
    apply: (url) => autoUpdater.setFeedURL({ url }),
  });

  if (mode.squirrel && feedUrl) setFeed('stable');

  // Sous Linux (AppImage), electron-updater lit les releases GitHub : pas de second serveur,
  // le canal « test » vise le dossier de la pré-version trouvée
  const appImage = mode.appImage && releasesRepo ? createAppImageUpdater(electronUpdater, releasesRepo) : null;

  return new UpdateManager({
    version: app.getVersion(),
    autoUpdater: appImage?.updater ?? (mode.squirrel && feedUrl ? autoUpdater : null),
    setFeed: appImage ? appImage.setChannel : setFeed,
    testFeed: Boolean(appImage) || !!testFeedUrl,
    releasesRepo,
    manual: mode.manual,
    simulate: mode.simulate,
    fetch: (url, init) => net.fetch(url, init),
    openExternal: (url) => {
      if (isSafeUrl(url)) void shell.openExternal(url);
    },
    compareVersions,
    beforeInstall: () => {
      // Copie de sécurité des données avant l'installation
      backupUserData(app, dataDirectory());
      // Sauvegarde des sessions (logins) avant que l'app soit tuée
      flushSession(session.defaultSession);
    },
    onChange,
    notifyReady: () =>
      showUpdateNotification({
        Notification,
        translate: t,
        iconPath: path.join(__dirname, '..', '..', 'pictures', `${iconBaseName(app.getVersion())}.png`),
        onClick: openSettings,
      }),
  });
}
