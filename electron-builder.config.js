// Configuration d'electron-builder, utilisé uniquement pour produire l'AppImage Linux et son
// fichier de mise à jour (latest-linux.yml) à partir du paquet d'electron-forge (`pnpm package`).
// Voir scripts/make-appimage.js.
const { version } = require('./package.json');
// Lu depuis dist/ : `pnpm build` doit avoir été lancé (comme pour forge.config.js)
const { iconBaseName } = require('./dist/src/scripts/appIcon.js');

module.exports = {
  appId: 'com.rotomeca.toolbar',
  productName: 'Rotomeca Toolbar',
  // Une seule forme de nom pour l'AppImage de chaque version
  artifactName: 'RotomecaToolbar-${version}.${ext}',
  directories: { output: 'out/make/appimage' },
  linux: {
    target: [{ target: 'AppImage', arch: ['x64'] }],
    executableName: 'rotomecatoolbar',
    category: 'Utility',
    // Une pré-version (X.Y.Z-rcN) a sa propre icône, comme dans forge.config.js
    icon: `src/pictures/${iconBaseName(version)}.png`,
  },
  // Écrit app-update.yml dans le paquet (lu par electron-updater). Le canal reste « latest » même
  // pour une pré-version -rcN : sans cela le fichier s'appellerait rcN-linux.yml.
  publish: { provider: 'github', owner: 'Rotomeca', repo: 'rotomeca-toolbar', channel: 'latest' },
};
