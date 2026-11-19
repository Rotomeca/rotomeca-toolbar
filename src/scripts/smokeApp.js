const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { appEventList } = require('../shared/ipc/events.js');

/**
 * Contrôle de l'application complète pour le mode « fumée » : elle démarre avec ses vrais services
 * (fenêtres, routage des appels des pages, liste des applications, tooltip, sites) sur des données
 * temporaires, puis on l'interroge comme le fait la page de la barre.
 *
 * Windows seulement : l'icône de la zone de notification et les fenêtres flottantes dépendent du
 * système, et la vérification sous Linux n'est pas faite ici.
 */

const PAGE_SETTLE_MS = 800;
const LOAD_TIMEOUT_MS = 20000;
const APP_URL = 'https://example.com/';
// Une adresse qui refuse la connexion : la vue est créée sans dépendre du réseau
const SITE_URL = 'http://127.0.0.1:9/';
// Liste enregistrée telle que l'écrivait la version 3.4.1 : l'application doit la relire et la conserver
const SEEDED_LIST = [
  { name: 'Courrier', url: 'https://mail.example.test/', picture: null },
  { name: 'Discussion', url: 'https://chat.example.test/', picture: 'font:chat' },
  'separator',
  { name: 'Wiki', url: 'https://wiki.example.test/', picture: null },
];
const SEEDED_URLS = SEEDED_LIST.filter((entry) => entry !== 'separator').map((entry) => entry.url);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Faux gestionnaire de mises à jour : rien à vérifier ici. */
function fakeUpdater() {
  return {
    state: { etat: 'uptodate', prerelease: false, versionActuelle: app.getVersion(), versionDisponible: null },
    start() {},
    check: async () => {},
    checkTest: async () => {},
    install() {},
    installTest() {},
  };
}

/** Faux magasin de permissions. */
function fakePermissions() {
  return { list: () => [], revoke: () => false, clear() {} };
}

/**
 * @param {{withTimeout: Function}} helpers
 * @returns {Promise<{name: string, ok: boolean, detail: string}>}
 */
async function checkApplication({ withTimeout }) {
  const name = 'application complète (fenêtres et appels des pages)';
  if (process.platform !== 'win32') return { name, ok: true, detail: 'ignoré hors Windows' };

  const problems = [];
  const home = path.join(app.getPath('userData'), 'home');
  fs.mkdirSync(home, { recursive: true });
  // Les données (réglages, liste des applications) vont dans un dossier temporaire, jamais chez l'utilisateur
  process.env.HOME = home;
  process.env.USERPROFILE = home;

  const dataDir = path.join(home, '.rotomeca-toolbar-data');
  const dataFile = path.join(dataDir, 'data.rsft');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(SEEDED_LIST));

  // Le chargement d'une adresse qui refuse la connexion est attendu : on n'en fait pas un bruit de fond
  const logError = console.error;
  console.error = (...args) => {
    if (!String(args[0]).startsWith('Chargement de')) logError(...args);
  };

  const { App } = require('../main/App.js');
  const instance = new App({ updater: fakeUpdater(), permissions: fakePermissions(), isDev: false });

  try {
    instance.start();
    instance.windows.main.hide();

    const toolbar = instance.windows.toolbar;
    if (toolbar.webContents.isLoading())
      await withTimeout(new Promise((resolve) => toolbar.webContents.once('did-finish-load', resolve)), LOAD_TIMEOUT_MS, 'page de la barre');
    await sleep(PAGE_SETTLE_MS);
    // Chemin réel du démarrage : la barre reçoit la liste enregistrée
    await instance.sendInitialState();
    await sleep(PAGE_SETTLE_MS);

    const invoke = (channel, ...args) =>
      toolbar.webContents.executeJavaScript(
        `window.api.invoke(${JSON.stringify(channel)}, ...${JSON.stringify(args)})`,
      );
    // Nombre d'éléments de la page de la barre qui correspondent au sélecteur
    const count = (selector) =>
      toolbar.webContents.executeJavaScript(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
    const expect = (label, actual, expected) => {
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        problems.push(`${label} : ${JSON.stringify(actual)} au lieu de ${JSON.stringify(expected)}`);
    };

    expect('getVersion', await invoke(appEventList.getVersion), app.getVersion());
    expect('getSavedUrls (liste de la 3.4.1)', await invoke(appEventList.getSavedUrls), SEEDED_URLS);
    expect('boutons affichés depuis la liste de la 3.4.1', await count('rotomeca-toolbar-button'), 3);
    expect('séparateurs affichés depuis la liste de la 3.4.1', await count('#apps .separator'), 2);
    expect('requestAddData', await invoke(appEventList.requestAddData, { name: 'Exemple', url: APP_URL }), true);
    expect('requestAddData (adresse dangereuse)', await invoke(appEventList.requestAddData, { url: 'javascript:alert(1)' }), false);
    expect('getSavedUrls', await invoke(appEventList.getSavedUrls), [...SEEDED_URLS, APP_URL]);
    await sleep(PAGE_SETTLE_MS / 2);
    expect('boutons de la barre après ajout', await count('rotomeca-toolbar-button'), 4);
    await invoke(appEventList.requestAddSeparator, APP_URL);
    expect('getSavedUrls (séparateur)', await invoke(appEventList.getSavedUrls), [...SEEDED_URLS, APP_URL]);
    await sleep(PAGE_SETTLE_MS / 2);
    expect('séparateurs de la barre', await count('#apps .separator'), 3);
    expect('isAppBarSupported', typeof (await invoke(appEventList.isAppBarSupported)), 'boolean');

    const displays = await invoke(appEventList.getDisplays);
    if (!Array.isArray(displays) || displays.length === 0) problems.push('getDisplays : aucun écran');

    await invoke(appEventList.tooltipShow, { text: 'Exemple', y: 100 });
    await invoke(appEventList.tooltipHide);

    await invoke(appEventList.openFrame, SITE_URL);
    if (!instance.viewHost.entry(SITE_URL)) problems.push('openFrame : la vue du site n\'a pas été créée');
    await invoke(appEventList.closeFrame, SITE_URL);
    await invoke(appEventList.killApp, SITE_URL);
    if (instance.viewHost.entry(SITE_URL)) problems.push('killApp : la vue du site existe encore');

    // Mêmes réglages que ceux enregistrés : rien ne doit changer
    await invoke(appEventList.settingsUpdated, {
      theme: 'system', themeAuto: false, effetsSaison: true, densiteEffets: 'normale',
      isButtonModeEnabled: true, appBarEnabled: false, appBarAutoHide: false, displayId: null,
    });

    await invoke(appEventList.appDelete, APP_URL);
    expect('getSavedUrls (après suppression)', await invoke(appEventList.getSavedUrls), SEEDED_URLS);
    await sleep(PAGE_SETTLE_MS / 2);
    expect('boutons de la barre après suppression', await count('rotomeca-toolbar-button'), 3);

    // Laisse finir le chargement des fenêtres créées en route avant de quitter
    await sleep(PAGE_SETTLE_MS);

    // Les entrées d'origine (séparateur et icône de police compris) doivent être réécrites sans altération
    const saved = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const preserved = Array.isArray(saved)
      ? SEEDED_LIST.filter((seed) => saved.some((entry) => JSON.stringify(entry) === JSON.stringify(seed))).length
      : 0;
    expect('liste réécrite : entrées de la 3.4.1 conservées', preserved, SEEDED_LIST.length);
  } catch (error) {
    problems.push(error.message);
  } finally {
    console.error = logError;
    instance.releaseDock();
  }

  return { name, ok: problems.length === 0, detail: problems.join(' ; ') || 'ok' };
}

module.exports = { checkApplication };
