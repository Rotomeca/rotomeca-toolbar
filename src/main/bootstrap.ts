/**
 * Démarrage du processus principal : instance unique, données protégées, raccourci global, sortie propre.
 *
 * Appelé par `main.ts`. Il crée les services qui doivent exister avant l'application (permissions,
 * mises à jour), puis instancie `App` et gère le cycle de vie Electron (prêt, avant de quitter, fenêtres fermées).
 */
// [electron] API d'Electron (fenêtres, IPC, zone de notification, sessions...)
import { Menu, app, dialog, globalShortcut, session } from 'electron';
// [Persistence.ts] Données de l'utilisateur : dossier userData figé, migration, sauvegardes et cookies de session
import {
  flushSession,
  keepLoginsAlive,
  logCookieState,
  migrateLegacyData,
  pinUserData,
  restoreFromBackup,
} from '../scripts/Persistence.js';
// [permissionDialog.ts] Boîte de dialogue qui demande à l'utilisateur d'autoriser une permission sensible d'un site
import { createPermissionDialog } from './permissions/permissionDialog.js';
// [installPermissionHandlers.ts] Branche la politique de permissions des sites tiers sur une session Electron
import { installPermissionHandlers } from './permissions/installPermissionHandlers.js';
// [PermissionStore.ts] Mémoire durable des décisions de permissions (caméra/micro, localisation) des sites tiers
import { PermissionStore } from '../scripts/PermissionStore.js';
// [safeUrl.ts] Contrôle qu'une adresse est une URL http(s) avant de l'ouvrir ou de la charger
import { isSafeUrl } from '../scripts/safeUrl.js';
// [launchArguments.ts] Arguments de lancement refusés dans l'application empaquetée : ceux qui ouvrent un accès de débogage
import { hasDebuggingSwitch } from './security/launchArguments.js';
// [i18n.ts] Traductions du processus principal : langue du système, dictionnaire et fonction `t`
import { t } from '../scripts/i18n.js';
// [App.ts] Assemblage du processus principal : crée les services de la barre et route les appels des pages
import { App, TOGGLE_SHORTCUT } from './App.js';
// [JsonFileStore.ts] Fichier JSON sûr : écriture atomique, sauvegarde `.bak`, mise en quarantaine d'un fichier corrompu
import { JsonFileStore, dataDirectory } from './persistence/JsonFileStore.js';
// [createUpdateManager.ts] Construit le gestionnaire de mises à jour en le reliant à Electron (Squirrel, réseau, notifications)
import { createUpdateManager } from './updates/createUpdateManager.js';

/** Lancé par `npm run debug` : `electron . --dev`. Jamais dans l'application empaquetée (mises à jour simulées, outils de débogage). */
const isDev = !app.isPackaged && process.argv[2] === '--dev';

/**
 * Restaure les données, installe les permissions, puis crée et démarre l'application.
 *
 * @param onInstance Rappel appelé dès que l'instance existe, avant son démarrage, pour que la sortie propre puisse la libérer même si `start()` échoue.
 * @returns L'application démarrée
 */
function createApp(onInstance: (instance: App) => void): App {
  // Déclarée d'abord : la question de permission se rattache à une fenêtre de l'application, qui n'existe qu'après
  let instance: App | null = null;

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
    ask: createPermissionDialog({ dialog, translate: t, parent: () => instance?.permissionDialogParent() }),
  });

  // Le gestionnaire de mises à jour est créé avant l'application, qui l'utilise ; ses rappels
  // n'ont d'effet qu'une fois l'application créée
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
  // Un accès de débogage distant donnerait le contrôle de toutes les pages : refusé en production
  if (app.isPackaged && hasDebuggingSwitch(process.argv)) {
    console.error('Option de débogage refusée : application empaquetée');
    app.exit(1);
    return;
  }

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

    // Le menu par défaut d'Electron donne rechargement et outils de développement sur chaque fenêtre
    if (app.isPackaged) Menu.setApplicationMenu(null);

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
