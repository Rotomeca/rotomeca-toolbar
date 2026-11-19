// Lance l'application en mode « fumée » (voir src/scripts/smokeRun.js) et affiche son rapport.
//
// Usage : pnpm smoke                (électron en développement)
//         pnpm smoke:packaged       (le paquet construit par `pnpm package`, dans out/)
//
// Code de sortie : 0 si tous les contrôles passent, 1 sinon.

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'out');
const APP_NAME = 'rotomecatoolbar';
const RUN_TIMEOUT_MS = 120000;

/**
 * @param {string[]} argv Arguments après le nom du script
 * @returns {{packaged: boolean}}
 * @throws {Error} Si un argument est inconnu
 */
function parseArgs(argv) {
  let packaged = false;

  for (const arg of argv) {
    if (arg === '--packaged') packaged = true;
    else throw new Error(`Argument inattendu : ${arg}`);
  }

  return { packaged };
}

/**
 * @param {string} platform `process.platform`
 * @returns {string} Nom du fichier exécutable du paquet
 */
function executableName(platform) {
  return platform === 'win32' ? `${APP_NAME}.exe` : APP_NAME;
}

/**
 * @param {string[]} entries Noms des dossiers de `out/`
 * @param {string} platform
 * @returns {?string} Le dossier du paquet de cette plateforme (`rotomecatoolbar-win32-x64`)
 */
function findPackageDir(entries, platform) {
  return entries.find((entry) => entry.startsWith(`${APP_NAME}-${platform}-`)) ?? null;
}

/**
 * @param {{reportFile: string, userDataDir: string, platform: string, ci: boolean}} options
 * @returns {string[]} Arguments passés à l'application
 */
function smokeArgs({ reportFile, userDataDir, platform, ci }) {
  const args = ['--smoke', `--smoke-out=${reportFile}`, `--smoke-user-data=${userDataDir}`];
  // Sur les machines d'intégration Linux, le bac à sable de Chromium n'est pas utilisable
  if (platform === 'linux' && ci) args.unshift('--no-sandbox');
  return args;
}

/**
 * @param {boolean} packaged
 * @returns {{command: string, prefixArgs: string[]}}
 * @throws {Error} Si le paquet est introuvable
 */
function resolveCommand(packaged) {
  if (!packaged) return { command: require('electron'), prefixArgs: ['.'] };

  const dir = fs.existsSync(OUT_DIR) ? findPackageDir(fs.readdirSync(OUT_DIR), process.platform) : null;
  if (!dir) throw new Error('Paquet introuvable dans out/ : lancez d\'abord `pnpm package`');

  return { command: path.join(OUT_DIR, dir, executableName(process.platform)), prefixArgs: [] };
}

/**
 * @param {string} reportFile
 * @returns {{name: string, ok: boolean, detail: string}[]}
 * @throws {Error} Si le rapport est absent (l'application n'a pas terminé les contrôles)
 */
function readReport(reportFile) {
  if (!fs.existsSync(reportFile))
    throw new Error('Aucun rapport produit : l\'application s\'est arrêtée avant la fin des contrôles');
  return JSON.parse(fs.readFileSync(reportFile, 'utf8'));
}

function main() {
  const { packaged } = parseArgs(process.argv.slice(2));
  const { command, prefixArgs } = resolveCommand(packaged);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtb-smoke-'));
  const reportFile = path.join(workDir, 'report.json');
  const userDataDir = path.join(workDir, 'user-data');

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  const args = [
    ...prefixArgs,
    ...smokeArgs({ reportFile, userDataDir, platform: process.platform, ci: Boolean(process.env.CI) }),
  ];
  const result = spawnSync(command, args, { cwd: ROOT, env, stdio: 'inherit', timeout: RUN_TIMEOUT_MS });
  if (result.error) throw result.error;

  const report = readReport(reportFile);
  fs.rmSync(workDir, { recursive: true, force: true });
  const failures = report.filter((check) => !check.ok);

  console.log(`\n${report.length - failures.length}/${report.length} contrôles réussis`);
  if (failures.length > 0 || result.status !== 0) process.exitCode = 1;
}

module.exports = { parseArgs, executableName, findPackageDir, smokeArgs };

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Erreur : ${error.message}`);
    process.exitCode = 1;
  }
}
