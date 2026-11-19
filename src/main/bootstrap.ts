import { app, dialog, globalShortcut, session } from 'electron';
import {
  flushSession,
  keepLoginsAlive,
  logCookieState,
  migrateLegacyData,
  pinUserData,
  restoreFromBackup,
} from '../scripts/Persistence.js';
import { createPermissionDialog } from './permissions/permissionDialog.js';
import { installPermissionHandlers } from './permissions/installPermissionHandlers.js';
import { PermissionStore } from '../scripts/PermissionStore.js';
import { isSafeUrl } from '../scripts/safeUrl.js';
import { t } from '../scripts/i18n.js';
import { App, TOGGLE_SHORTCUT } from './App.js';
import { JsonFileStore, dataDirectory } from './persistence/JsonFileStore.js';
import { createUpdateManager } from './updates/createUpdateManager.js';

/** Lancé par `npm run debug` : `electron . --dev`. */
const isDev = process.argv[2] === '--dev';

/** Restaure les données, installe les permissions, puis crée l'application. */
function createApp(onInstance: (instance: App) => void): App {
  migrateLegacyData(app, dataDirectory());
  restoreFromBackup(dataDirectory());
  keepLoginsAlive(session.defaultSession, app);

  const permissionFile = new JsonFileStore(dataDirectory(), 'permissions.rcft');
  const permissions = new PermissionStore({
    load: () => permissionFile.load(),
    save: (data) => permissionFile.save(data),
  });
  installPermissionHandlers(session.defaultSession, {
    store: permissions,
    isSafeUrl,
    ask: createPermissionDialog({ dialog, translate: t }),
  });

  // Le gestionnaire de mises à jour est créé avant l'application, qui l'utilise ; ses rappels
  // n'ont d'effet qu'une fois l'application créée
  let instance: App | null = null;
  const updater = createUpdateManager({
    isDev,
    onChange: (state) => instance?.onUpdateChanged(state),
    openSettings: () => instance?.openSettings(),
  });

  instance = new App({ updater, permissions, isDev });
  onInstance(instance);
  instance.start();

  return instance;
}

/** Démarre l'application : un seul exemplaire, données protégées, raccourci global. */
export function bootstrap(): void {
  // Le dossier userData ne doit jamais changer (sessions, cookies, localStorage)
  pinUserData(app);

  const hasSingleInstanceLock = app.requestSingleInstanceLock();
  if (!hasSingleInstanceLock) app.quit();

  let running: App | null = null;

  // Sans cela, l'espace réservé par la barre ancrée resterait occupé
  app.on('before-quit', () => {
    running?.releaseDock();
    flushSession(session.defaultSession);
    logCookieState(app, session.defaultSession, 'sortie');
  });
  app.on('will-quit', () => {
    running?.releaseDock();
    globalShortcut.unregisterAll();
    flushSession(session.defaultSession);
  });

  app.on('ready', () => {
    if (!hasSingleInstanceLock) return;

    try {
      const instance = createApp((created) => {
        running = created;
      });

      // Raccourci clavier global : afficher ou cacher la barre
      if (!globalShortcut.register(TOGGLE_SHORTCUT, () => instance.toggleToolbar())) {
        console.warn(`Raccourci ${TOGGLE_SHORTCUT} indisponible (déjà utilisé ?)`);
      }
    } catch (error) {
      console.error(error);
      void dialog.showMessageBox({
        type: 'error',
        buttons: ['Ok'],
        title: 'App error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.on('window-all-closed', () => app.quit());
}
