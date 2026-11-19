// Construit dist/ : l'application telle qu'elle est embarquée dans le paquet.
//
// dist/ reproduit l'arborescence du dépôt : les chemins relatifs du code (`__dirname`,
// imports relatifs des pages) restent valides. Le code est copié tel quel, sauf les deux
// preloads (TypeScript), bundlés en un seul fichier chacun : un preload sandboxé ne peut charger aucun
// autre fichier (seul `electron` est requirable). Les fichiers TypeScript sont compilés par
// tsc (processus principal en CommonJS, pages en modules ES) ; leurs sources ne sont pas copiées.
//
// Usage : pnpm build

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const TSC = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');

/** Une configuration par cible : processus principal (CommonJS) et pages (modules ES). */
const TS_CONFIGS = ['tsconfig.json', 'tsconfig.renderer.json'];

const ROOT_FILES = ['main.js', 'settings.js', 'index.html'];
const ROOT_DIRS = ['src', 'lib', 'configs'];
// Les pages importent le design system par un chemin relatif vers node_modules (voir
// src/scripts/ds.js) : il doit donc exister aussi dans dist/ à la même profondeur.
const DESIGN_SYSTEM = path.join('node_modules', '@rotomeca', 'design-system', 'out');

/** Preloads sandboxés : chaque source TypeScript devient un seul fichier JavaScript (esbuild). */
const PRELOADS = [
  { source: 'preload.ts', output: 'preload.js' },
  {
    source: path.join('src', 'scripts', 'media', 'media-preload.ts'),
    output: path.join('src', 'scripts', 'media', 'media-preload.js'),
  },
];

/** Sources de styles et fichiers de génération, inutiles à l'exécution. */
const EXCLUDED_DIRECTORIES = new Set(['less']);
// `.ts` couvre aussi les `.d.ts` : les sources TypeScript sont compilées, jamais copiées
const EXCLUDED_EXTENSIONS = new Set(['.less', '.ts']);
const EXCLUDED_NAMES = new Set(['folder.buildable']);

/**
 * @param {string} relativePath Chemin relatif à la racine du dépôt
 * @returns {boolean} true si le fichier ou le dossier est embarqué
 */
function shouldCopy(relativePath) {
  const segments = relativePath.split(/[\\/]/).filter(Boolean);
  const name = segments.at(-1) ?? '';

  return (
    !segments.some((segment) => EXCLUDED_DIRECTORIES.has(segment)) &&
    !EXCLUDED_NAMES.has(name) &&
    !EXCLUDED_EXTENSIONS.has(path.extname(name))
  );
}

/**
 * @param {string} root
 * @param {string} dist
 * @param {string} relativePath Fichier ou dossier à copier, relatif à `root`
 * @throws {Error} Si la source n'existe pas
 */
function copyEntry(root, dist, relativePath) {
  const source = path.join(root, relativePath);
  if (!fs.existsSync(source)) throw new Error(`Introuvable : ${relativePath} (pnpm install a-t-il été lancé ?)`);

  fs.cpSync(source, path.join(dist, relativePath), {
    recursive: true,
    filter: (entry) => shouldCopy(path.relative(root, entry)),
  });
}

/**
 * Bundle un preload en un seul fichier CommonJS (seul `electron` reste externe).
 * esbuild retire les types sans les vérifier : `pnpm typecheck` s'en charge.
 * @param {string} root
 * @param {string} dist
 * @param {{source: string, output: string}} preload Chemins relatifs à `root` et à `dist`
 */
function bundlePreload(root, dist, { source, output }) {
  esbuild.buildSync({
    entryPoints: [path.join(root, source)],
    outfile: path.join(dist, output),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
    target: 'es2022',
    logLevel: 'warning',
  });
}

/**
 * Compile les fichiers TypeScript vers dist/. Une cible sans configuration est ignorée.
 * @param {string} root
 * @param {string} dist
 * @throws {Error} Si la compilation échoue (erreurs de type comprises)
 */
function compileTypeScript(root, dist) {
  for (const config of TS_CONFIGS) {
    if (!fs.existsSync(path.join(root, config))) continue;

    const result = spawnSync(process.execPath, [TSC, '-p', config, '--outDir', dist], { cwd: root, stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`La compilation TypeScript a échoué (${config})`);
  }
}

/**
 * Reconstruit dist/ depuis zéro.
 * @param {{root?: string, dist?: string}} [options]
 * @returns {string} Le dossier produit
 */
function build({ root = ROOT, dist = DIST } = {}) {
  fs.rmSync(dist, { recursive: true, force: true });

  for (const file of ROOT_FILES) copyEntry(root, dist, file);
  for (const dir of ROOT_DIRS) copyEntry(root, dist, dir);
  copyEntry(root, dist, DESIGN_SYSTEM);
  for (const preload of PRELOADS) bundlePreload(root, dist, preload);
  compileTypeScript(root, dist);

  return dist;
}

module.exports = { build, shouldCopy };

if (require.main === module) {
  try {
    console.log(`dist/ construit : ${path.relative(ROOT, build())}`);
  } catch (error) {
    console.error(`Erreur : ${error.message}`);
    process.exitCode = 1;
  }
}
