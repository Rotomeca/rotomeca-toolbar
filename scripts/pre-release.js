// Crée une pré-version : branche `pre-release/X.Y.Z-rcN`, version `X.Y.Z-rcN` dans
// package.json, commit et tag `X.Y.Z-rcN`. Le push du tag déclenche le workflow
// `Release`, qui construit les installeurs et publie une pré-version GitHub.
//
// Usage : pnpm pre-release X.Y.Z [--rc N] [--push] [--dry-run]
//
// - Part de `develop` (propre), sans jamais fusionner dans `main` : seules les
//   vraies releases (git flow, branche `release/`) y vont.
// - `N` est le numéro suivant parmi les tags `X.Y.Z-rc*` existants (locaux et distants).
// - Sans `--push`, tout reste local : la commande à lancer est affichée.
// - `--dry-run` n'écrit rien : il affiche seulement ce qui serait fait.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const BASE_VERSION = /^\d+\.\d+\.\d+$/;
const SOURCE_BRANCH = 'develop';

/**
 * @param {string[]} tags Tags existants
 * @param {string} base Version de base (`3.4.0`)
 * @returns {number} Le numéro de `-rcN` suivant (1 s'il n'y en a pas encore)
 */
function nextRc(tags, base) {
  const pattern = new RegExp(`^${base.replace(/\./g, '\\.')}-rc(\\d+)$`);
  let highest = 0;

  for (const tag of tags) {
    const match = pattern.exec(tag.trim());
    if (match) highest = Math.max(highest, parseInt(match[1], 10));
  }

  return highest + 1;
}

/**
 * @param {string[]} argv Arguments après le nom du script
 * @returns {{base: string, rc: ?number, push: boolean, dryRun: boolean}}
 * @throws {Error} Si les arguments sont invalides
 */
function parseArgs(argv) {
  let base = null;
  let rc = null;
  let push = false;
  let dryRun = false;

  for (let i = 0; i < argv.length; ++i) {
    const arg = argv[i];

    if (arg === '--push') push = true;
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--rc') {
      const value = argv[++i];
      if (!/^[1-9]\d*$/.test(value ?? ''))
        throw new Error('--rc attend un entier positif (ex: --rc 2)');
      rc = parseInt(value, 10);
    } else if (BASE_VERSION.test(arg) && base === null) base = arg;
    else throw new Error(`Argument inattendu : ${arg}`);
  }

  if (!base) throw new Error('Version de base attendue au format X.Y.Z (ex: 3.4.0)');

  return { base, rc, push, dryRun };
}

/**
 * Remplace le numéro de version de package.json sans toucher au reste du fichier
 * (indentation, fins de ligne).
 * @param {string} text Contenu de package.json
 * @param {string} version
 * @returns {string}
 * @throws {Error} Si le champ `version` est introuvable
 */
function setVersion(text, version) {
  const pattern = /("version"\s*:\s*")[^"]*(")/;
  if (!pattern.test(text)) throw new Error('Champ "version" introuvable dans package.json');
  return text.replace(pattern, `$1${version}$2`);
}

/**
 * @param {string[]} args
 * @param {{allowFailure?: boolean}} [options]
 * @returns {string} Sortie standard
 */
function git(args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    if (allowFailure) return '';
    throw new Error(`git ${args.join(' ')} : ${error.stderr?.trim() || error.message}`);
  }
}

/** @returns {string[]} Tags locaux et distants */
function existingTags() {
  const local = git(['tag', '--list']).split('\n');
  const remote = git(['ls-remote', '--tags', 'origin'], { allowFailure: true })
    .split('\n')
    .map((line) => /refs\/tags\/(.+?)(\^\{\})?$/.exec(line)?.[1])
    .filter(Boolean);

  return [...new Set([...local, ...remote])].filter(Boolean);
}

function main() {
  const { base, rc, push, dryRun } = parseArgs(process.argv.slice(2));

  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== SOURCE_BRANCH)
    throw new Error(`À lancer depuis ${SOURCE_BRANCH} (branche actuelle : ${branch})`);
  if (git(['status', '--porcelain']) !== '')
    throw new Error('Des modifications ne sont pas commitées : commitez ou mettez-les de côté');

  const tags = existingTags();
  const number = rc ?? nextRc(tags, base);
  const version = `${base}-rc${number}`;
  const preBranch = `pre-release/${version}`;

  if (tags.includes(version)) throw new Error(`Le tag ${version} existe déjà`);
  if (git(['branch', '--list', preBranch]) !== '')
    throw new Error(`La branche ${preBranch} existe déjà`);

  console.log(`Pré-version : ${version}`);
  console.log(`  branche   : ${preBranch} (depuis ${SOURCE_BRANCH})`);
  console.log(`  tag       : ${version}`);

  if (dryRun) {
    console.log('\n--dry-run : rien n\'a été modifié.');
    return;
  }

  git(['checkout', '-b', preBranch, SOURCE_BRANCH]);
  try {
    const file = path.join(process.cwd(), 'package.json');
    fs.writeFileSync(file, setVersion(fs.readFileSync(file, 'utf8'), version));
    git(['add', 'package.json']);
    git(['commit', '-m', `build: :bookmark: ${version}`]);
    git(['tag', '-a', version, '-m', version]);
  } finally {
    git(['checkout', SOURCE_BRANCH]);
  }

  if (push) {
    git(['push', 'origin', preBranch, version]);
    console.log(`\nPoussé : ${preBranch} et ${version}. Le CI construit la pré-version.`);
  } else {
    console.log(`\nPrêt en local. Pour lancer le CI :\n  git push origin ${preBranch} ${version}`);
  }
}

module.exports = { nextRc, parseArgs, setVersion };

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Erreur : ${error.message}`);
    process.exitCode = 1;
  }
}
