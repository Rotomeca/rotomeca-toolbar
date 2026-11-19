// Construit dist/ : l'application telle qu'elle est embarquée dans le paquet.
//
// dist/ reproduit l'arborescence du dépôt : les chemins relatifs du code (`__dirname`,
// imports relatifs des pages) restent valides. Aujourd'hui le code est copié tel quel ;
// la compilation TypeScript s'ajoutera ici.
//
// Usage : pnpm build

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const ROOT_FILES = ['main.js', 'preload.js', 'settings.js', 'index.html'];
const ROOT_DIRS = ['src', 'lib', 'configs'];
// Les pages importent le design system par un chemin relatif vers node_modules (voir
// src/scripts/ds.js) : il doit donc exister aussi dans dist/ à la même profondeur.
const DESIGN_SYSTEM = path.join('node_modules', '@rotomeca', 'design-system', 'out');

/** Sources de styles et fichiers de génération, inutiles à l'exécution. */
const EXCLUDED_DIRECTORIES = new Set(['less']);
const EXCLUDED_EXTENSIONS = new Set(['.less']);
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
 * Reconstruit dist/ depuis zéro.
 * @param {{root?: string, dist?: string}} [options]
 * @returns {string} Le dossier produit
 */
function build({ root = ROOT, dist = DIST } = {}) {
  fs.rmSync(dist, { recursive: true, force: true });

  for (const file of ROOT_FILES) copyEntry(root, dist, file);
  for (const dir of ROOT_DIRS) copyEntry(root, dist, dir);
  copyEntry(root, dist, DESIGN_SYSTEM);

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
