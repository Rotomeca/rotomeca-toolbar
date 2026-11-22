// Construit l'AppImage Linux (et latest-linux.yml, lu par electron-updater) à partir du paquet
// d'electron-forge : `pnpm package` doit avoir été lancé.
//
// Usage : pnpm make:appimage
// Sortie : out/make/appimage/RotomecaToolbar-<version>.AppImage et latest-linux.yml

const fs = require('node:fs');
const path = require('node:path');
const builder = require('electron-builder');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'out');
const PACKAGE_DIR = 'rotomecatoolbar-linux-x64';

/** Construit l'AppImage depuis le paquet de `out/`, sans rien publier. */
async function main() {
  if (process.platform !== 'linux') throw new Error('L\'AppImage se construit sous Linux');

  const prepackaged = path.join(OUT_DIR, PACKAGE_DIR);
  if (!fs.existsSync(prepackaged)) throw new Error(`Paquet introuvable : ${prepackaged} (lancez d'abord \`pnpm package\`)`);

  await builder.build({
    projectDir: ROOT,
    prepackaged,
    publish: 'never',
    config: require('../electron-builder.config.js'),
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
