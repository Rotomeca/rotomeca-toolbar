/**
 * Mode « fumée » (`--smoke`) : vérifie que l'application est saine sans la lancer.
 *
 * Contrôle les pages locales (chemins, design system, `window.api`), le preload des
 * sites (sandboxé), le chargement des modules du processus principal, les traductions et koffi. N'utilise ni le dossier de données de
 * l'utilisateur, ni le verrou d'instance, ni la barre ancrée, ni le raccourci global.
 *
 * Écrit un rapport JSON dans le fichier donné par `--smoke-out=<fichier>` puis quitte
 * avec le code 0 (tout va bien) ou 1. Le dossier de données temporaire (`--smoke-user-data=`)
 * est supprimé par le lanceur (scripts/smoke.js) : Chromium le garde ouvert jusqu'à la fin.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { getLocale, getDictionary } = require('./i18n.js');
const { internalChannels } = require('../shared/ipc/events.js');

const ROOT = path.join(__dirname, '..', '..');
const PRELOAD = path.join(ROOT, 'preload.js');
const MEDIA_PRELOAD = path.join(ROOT, 'src', 'scripts', 'media', 'media-preload.js');

const PAGE_TIMEOUT_MS = 15000;
const MEDIA_TIMEOUT_MS = 8000;
const TOTAL_TIMEOUT_MS = 90000;
const SETTLE_DELAY_MS = 300;
const ERR_ABORTED = -3;

/**
 * Fichiers de src/scripts qui ne sont pas des modules CommonJS du processus principal :
 * modules ES des pages, et ce fichier lui-même.
 */
const NOT_MAIN_MODULES = new Set([
  // Modules ES des pages
  'seasonFx.js',
  'ds.js',
  'dom.js',
  'appForm.js',
  'mediaView.js',
  'ToolbarAppData.js',
  // Lu comme du texte puis injecté dans la page du menu contextuel : du code de page
  'WebContentElecrtonContextMenu.js',
  'smokeRun.js',
  // Démarre l'application complète : appelé à part par le mode « fumée »
  'smokeApp.js',
]);
const MAIN_MODULES_OUTSIDE_SCRIPTS = [
  ['configs', 'appConfig.js'],
  // Module ES partagé, chargé par `require` depuis le processus principal
  ['src', 'shared', 'ipc', 'events.js'],
];

/** Pages qui dépendent du réseau (recherche Google) : hors du périmètre. */
const SKIPPED_PAGES = new Set(['search.html']);
const RESOURCE_ERROR = /ERR_FILE_NOT_FOUND|Failed to load (module script|resource)|Refused to (load|execute|apply)|Uncaught/i;
const MEDIA_TITLE = 'smoke-title';
const MEDIA_PAGE = `data:text/html,${encodeURIComponent(
  `<script>navigator.mediaSession.metadata = new MediaMetadata({ title: '${MEDIA_TITLE}' });</script>`,
)}`;

/**
 * @typedef {Object} CheckResult
 * @property {string} name
 * @property {boolean} ok
 * @property {string} detail
 */

const { checkApplication } = require('./smokeApp.js');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} label
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`délai dépassé : ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * @param {string} name Nom de l'option (`--smoke-out`)
 * @returns {?string} Sa valeur, ou null si elle n'est pas fournie
 */
function optionValue(name) {
  const prefix = `${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

/** @returns {string[]} Chemins des pages HTML locales à contrôler */
function listPages() {
  const srcDir = path.join(ROOT, 'src');
  const pages = fs
    .readdirSync(srcDir)
    .filter((entry) => entry.startsWith('page.'))
    .flatMap((dir) =>
      fs
        .readdirSync(path.join(srcDir, dir))
        .filter((file) => file.endsWith('.html') && !SKIPPED_PAGES.has(file))
        .map((file) => path.join(srcDir, dir, file)),
    );

  return [path.join(ROOT, 'index.html'), ...pages];
}

/**
 * @param {string} preload
 * @returns {Electron.BrowserWindow} Fenêtre cachée, configurée comme celles de l'application
 */
function createHiddenWindow(preload) {
  return new BrowserWindow({
    show: false,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
}

/**
 * @param {Electron.WebContents} webContents
 * @returns {string[]} Liste (alimentée au fil de l'eau) des problèmes de chargement
 */
function watchProblems(webContents) {
  const problems = [];

  webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame && code !== ERR_ABORTED)
      problems.push(`chargement impossible : ${description} (${url})`);
  });
  // Signature variable selon la version d'Electron : (details) ou (event, level, message)
  webContents.on('console-message', (...args) => {
    const message = args[0]?.message ?? args[2] ?? '';
    if (RESOURCE_ERROR.test(message)) problems.push(message);
  });
  webContents.on('render-process-gone', (_event, details) => {
    problems.push(`processus de rendu arrêté : ${details.reason}`);
  });

  return problems;
}

/**
 * @param {string} htmlPath
 * @returns {Promise<CheckResult>}
 */
async function checkPage(htmlPath) {
  const name = path.relative(ROOT, htmlPath).replaceAll('\\', '/');
  const usesDesignSystem = fs.readFileSync(htmlPath, 'utf8').includes('ds.js');
  const win = createHiddenWindow(PRELOAD);
  const problems = watchProblems(win.webContents);

  try {
    await withTimeout(win.loadFile(htmlPath), PAGE_TIMEOUT_MS, name);
    await sleep(SETTLE_DELAY_MS);

    const probe = await win.webContents.executeJavaScript(`({
      api: typeof window.api?.invoke === 'function'
        && typeof window.api?.on === 'function'
        && typeof window.api?.t === 'function',
      designSystem: customElements.get('rds-button') !== undefined,
    })`);

    if (!probe.api) problems.push('window.api absent (preload non chargé ?)');
    if (usesDesignSystem && !probe.designSystem)
      problems.push('composants du design system non enregistrés');
  } catch (error) {
    problems.push(error.message);
  } finally {
    win.destroy();
  }

  return { name, ok: problems.length === 0, detail: problems.join(' ; ') || 'ok' };
}

/** @returns {Promise<CheckResult>} */
async function checkMediaPreload() {
  const name = 'preload des sites (media-preload.js)';
  const win = createHiddenWindow(MEDIA_PRELOAD);
  const problems = watchProblems(win.webContents);
  const published = new Promise((resolve) => ipcMain.once(internalChannels.mediaState, (_event, raw) => resolve(raw)));

  try {
    await win.loadURL(MEDIA_PAGE);
    const raw = await withTimeout(published, MEDIA_TIMEOUT_MS, 'état média publié');
    if (JSON.parse(raw)?.title !== MEDIA_TITLE) problems.push('titre du média inattendu');
  } catch (error) {
    problems.push(error.message);
  } finally {
    win.destroy();
  }

  return { name, ok: problems.length === 0, detail: problems.join(' ; ') || 'ok' };
}

/**
 * @param {string} dir
 * @returns {string[]} Les fichiers .js de ce dossier et de ses sous-dossiers
 */
function listJsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

/** @returns {string[]} Chemins absolus des modules CommonJS du processus principal */
function listMainModules() {
  const scriptsDir = path.join(ROOT, 'src', 'scripts');
  const scripts = fs
    .readdirSync(scriptsDir)
    .filter((file) => file.endsWith('.js') && !NOT_MAIN_MODULES.has(file))
    .map((file) => path.join(scriptsDir, file));

  return [
    ...scripts,
    // Les domaines du processus principal, par dossier (src/main/<domaine>/...)
    ...listJsFiles(path.join(ROOT, 'src', 'main')),
    ...MAIN_MODULES_OUTSIDE_SCRIPTS.map((segments) => path.join(ROOT, ...segments)),
  ];
}

/**
 * Charge chaque module du processus principal : détecte un module qui ne se charge plus
 * (mauvais format, import cassé) avant même de lancer l'application.
 * @returns {CheckResult}
 */
function checkMainModules() {
  const name = 'modules du processus principal';
  const modules = listMainModules();
  const failures = [];

  for (const file of modules) {
    try {
      require(file);
    } catch (error) {
      failures.push(`${path.relative(ROOT, file)} : ${error.message}`);
    }
  }

  return {
    name,
    ok: failures.length === 0,
    detail: failures.join(' ; ') || `${modules.length} modules chargés`,
  };
}

/** @returns {CheckResult} */
function checkTranslations() {
  const count = Object.keys(getDictionary()).length;
  return {
    name: 'traductions',
    ok: count > 0,
    detail: count > 0 ? `${count} clés (${getLocale()})` : 'dictionnaire vide',
  };
}

/** @returns {CheckResult} */
function checkKoffi() {
  const name = 'koffi (barre ancrée)';
  const libraries = { win32: 'shell32.dll', linux: 'libX11.so.6' };
  const library = libraries[process.platform];
  if (!library) return { name, ok: true, detail: 'ignoré hors Windows et Linux' };

  try {
    require('koffi').load(library);
    return { name, ok: true, detail: 'ok' };
  } catch (error) {
    return { name, ok: false, detail: error.message };
  }
}

/** @returns {Promise<CheckResult[]>} */
async function runChecks() {
  const results = [checkMainModules(), checkTranslations(), checkKoffi()];
  for (const page of listPages()) results.push(await checkPage(page));
  results.push(await checkMediaPreload());
  results.push(await checkApplication({ withTimeout }));
  return results;
}

let finished = false;

/**
 * Écrit le rapport et quitte. Sans effet si l'application est déjà en train de quitter.
 * @param {CheckResult[]} results
 */
function finish(results) {
  if (finished) return;
  finished = true;

  const failed = results.some((result) => !result.ok);

  for (const { name, ok, detail } of results) console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} : ${detail}`);
  const file = optionValue('--smoke-out');
  if (file) fs.writeFileSync(file, JSON.stringify(results, null, 2));

  app.exit(failed ? 1 : 0);
}

/** Lance les contrôles puis quitte l'application. */
async function run() {
  app.setPath('userData', optionValue('--smoke-user-data') ?? fs.mkdtempSync(path.join(os.tmpdir(), 'rtb-smoke-')));
  // Le preload demande les traductions de façon synchrone : sans réponse, il resterait bloqué
  ipcMain.on(internalChannels.i18n, (event) => {
    event.returnValue = { locale: getLocale(), dict: getDictionary() };
  });

  // Sans ce gestionnaire, Electron quitterait dès que la première fenêtre cachée est fermée
  app.on('window-all-closed', () => {});

  // Une erreur non gérée afficherait une boîte de dialogue bloquante : on quitte en échec
  const fail = (error) =>
    finish([{ name: 'erreur non gérée', ok: false, detail: error?.message ?? String(error) }], );
  process.on('uncaughtException', fail);
  process.on('unhandledRejection', fail);

  const watchdog = setTimeout(
    () => finish([{ name: 'délai global', ok: false, detail: `plus de ${TOTAL_TIMEOUT_MS / 1000} s` }]),
    TOTAL_TIMEOUT_MS,
  );

  try {
    await app.whenReady();
    finish(await runChecks(), );
  } catch (error) {
    finish([{ name: 'démarrage', ok: false, detail: error.message }], );
  } finally {
    clearTimeout(watchdog);
  }
}

module.exports = { run };
