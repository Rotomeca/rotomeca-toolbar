import path from 'node:path';
import { Notification, app, autoUpdater, net, session, shell } from 'electron';
import { feedUrl, releasesRepo, testFeedUrl } from '../../../configs/appConfig.js';
import { iconBaseName } from '../../scripts/appIcon.js';
import { t } from '../../scripts/i18n.js';
import { backupUserData, flushSession } from '../../scripts/Persistence.js';
import { isSafeUrl } from '../../scripts/safeUrl.js';
import { UpdateManager } from '../../scripts/UpdateManager.js';
import type { UpdateState } from '../../scripts/UpdateManager.js';
import { compareVersions } from '../../scripts/versions.js';
import { dataDirectory } from '../persistence/JsonFileStore.js';
import { createFeedSwitcher, resolveUpdateMode } from './updateMode.js';
import { showUpdateNotification } from './updateNotification.js';

export interface UpdateWiring {
  readonly isDev: boolean;
  /** L'état de la mise à jour a changé. */
  readonly onChange: (state: UpdateState) => void;
  /** Une mise à jour est prête : l'utilisateur est prévenu, un clic ouvre les Paramètres. */
  readonly openSettings: () => void;
}

/**
 * @returns Le gestionnaire de mises à jour : Squirrel sous Windows, vérification GitHub sous Linux.
 * La vérification démarre avec `start()`.
 */
export function createUpdateManager({ isDev, onChange, openSettings }: UpdateWiring): UpdateManager {
  const mode = resolveUpdateMode({
    isDev,
    isPackaged: app.isPackaged,
    platform: process.platform,
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

  return new UpdateManager({
    version: app.getVersion(),
    autoUpdater: mode.squirrel && feedUrl ? autoUpdater : null,
    setFeed,
    testFeed: !!testFeedUrl,
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
