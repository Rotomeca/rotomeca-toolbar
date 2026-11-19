// Vérifie le contenu du paquet construit par `pnpm package` (dossier out/) :
// les fichiers indispensables sont dans l'archive asar et koffi est bien décompressé
// à côté (un module natif ne peut pas se charger depuis l'asar).
//
// Usage : pnpm verify:package
// Code de sortie : 0 si le paquet est conforme, 1 sinon.

const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'out');
const APP_NAME = 'rotomecatoolbar';
const KOFFI_BINARY = 'koffi.node';

/**
 * Fichiers qui doivent figurer dans l'archive, relativement au dossier du `main`.
 * `dist/` n'existe pas encore : `base` vaut alors '' (le dossier de `package.json`).
 */
const REQUIRED_FROM_BASE = [
  'preload.js',
  'src/scripts/media/media-preload.js',
  'index.html',
  'src/page.taskbar/taskbar.html',
  'src/page.settings/settings.html',
  'src/locales/fr.json',
  'src/locales/en.json',
  'src/pictures/icon.png',
  'node_modules/@rotomeca/design-system/out/rotomeca-design-system.js',
];

/**
 * @param {string} mainFile Champ `main` de package.json (`main.js` ou `dist/main.js`)
 * @returns {string[]} Chemins attendus dans l'archive, en notation `/dossier/fichier`
 */
function requiredEntries(mainFile) {
  const mainPath = mainFile.replaceAll('\\', '/');
  const base = path.posix.dirname(mainPath) === '.' ? '' : path.posix.dirname(mainPath);
  const entries = REQUIRED_FROM_BASE.map((file) => `/${[base, file].filter(Boolean).join('/')}`);

  return [`/${mainPath}`, '/package.json', ...entries];
}

/** Ce que l'archive ne doit pas contenir : sources, tests et outils de développement. */
const FORBIDDEN_FROM_ROOT = ['main.js', 'preload.js', 'settings.js', 'src', 'lib', 'tests', 'scripts', 'plan-refonte', 'build.py'];

/**
 * @param {string} mainFile Champ `main` de package.json
 * @returns {string[]} Chemins interdits à la racine de l'archive (vide tant que le code n'est pas dans `dist/`)
 */
function forbiddenEntries(mainFile) {
  const inDist = mainFile.replaceAll('\\', '/').startsWith('dist/');
  return inDist ? FORBIDDEN_FROM_ROOT.map((entry) => `/${entry}`) : [];
}

/**
 * @param {string[]} paths Chemins renvoyés par asar (séparateur selon la plateforme)
 * @returns {Set<string>}
 */
function normalizeAsarPaths(paths) {
  return new Set(paths.map((entry) => `/${entry.replaceAll('\\', '/').replace(/^\/+/, '')}`));
}

/**
 * @param {Set<string>} present
 * @param {string[]} required
 * @returns {string[]} Les chemins requis qui manquent
 */
function missingEntries(present, required) {
  return required.filter((entry) => !present.has(entry));
}

/**
 * @param {Set<string>} present
 * @param {string[]} forbidden
 * @returns {string[]} Les chemins interdits présents (le chemin lui-même ou un de ses enfants)
 */
function unexpectedEntries(present, forbidden) {
  return forbidden.filter((entry) => [...present].some((file) => file === entry || file.startsWith(`${entry}/`)));
}

/**
 * @param {string} dir
 * @param {(file: string) => boolean} predicate
 * @returns {string[]} Fichiers (récursivement) qui vérifient le prédicat
 */
function findFiles(dir, predicate) {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findFiles(full, predicate);
    return predicate(full) ? [full] : [];
  });
}

/**
 * @param {string[]} entries Contenu de out/
 * @returns {?string} Le dossier `resources` du paquet de la plateforme courante
 */
function findResourcesDir(entries) {
  const dir = entries.find((entry) => entry.startsWith(`${APP_NAME}-${process.platform}-`));
  return dir ? path.join(OUT_DIR, dir, 'resources') : null;
}

function main() {
  const { main: appMain } = require(path.join(ROOT, 'package.json'));
  const resources = fs.existsSync(OUT_DIR) ? findResourcesDir(fs.readdirSync(OUT_DIR)) : null;
  if (!resources) throw new Error('Paquet introuvable dans out/ : lancez d\'abord `pnpm package`');

  const asarFile = path.join(resources, 'app.asar');
  if (!fs.existsSync(asarFile)) throw new Error(`Archive absente : ${asarFile}`);

  const present = normalizeAsarPaths(asar.listPackage(asarFile));
  const missing = missingEntries(present, requiredEntries(appMain));
  const unexpected = unexpectedEntries(present, forbiddenEntries(appMain));
  // koffi 3 livre son binaire dans un paquet séparé (@koromix/koffi-<plateforme>)
  const koffiBinaries = findFiles(
    path.join(resources, 'app.asar.unpacked', 'node_modules'),
    (file) => path.basename(file) === KOFFI_BINARY,
  );

  for (const entry of missing) console.error(`FAIL absent de l'archive : ${entry}`);
  for (const entry of unexpected) console.error(`FAIL ne devrait pas être embarqué : ${entry}`);
  if (koffiBinaries.length === 0) console.error(`FAIL ${KOFFI_BINARY} absent de app.asar.unpacked`);

  if (missing.length > 0 || unexpected.length > 0 || koffiBinaries.length === 0) {
    process.exitCode = 1;
    return;
  }
  console.log(`OK  paquet conforme (${koffiBinaries.length} binaire(s) koffi décompressé(s))`);
}

module.exports = { requiredEntries, forbiddenEntries, normalizeAsarPaths, missingEntries, unexpectedEntries };

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Erreur : ${error.message}`);
    process.exitCode = 1;
  }
}
