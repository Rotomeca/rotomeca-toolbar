const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('node:path');
const { version } = require('./package.json');
// Lus depuis dist/ : `pnpm build` doit avoir été lancé (les scripts start, package et make s'en chargent)
const { iconBaseName } = require('./dist/src/scripts/appIcon.js');
const { isPrerelease } = require('./dist/src/scripts/versions.js');

// Une pré-version (X.Y.Z-rcN) a sa propre icône (badge « RC ») : exécutable,
// installeur et paquets Linux compris.
const icon = iconBaseName(version);
const prerelease = isPrerelease(version);

// Signature de code Windows (Authenticode) : active uniquement si un certificat
// .pfx est fourni par l'environnement (WINDOWS_CERTIFICATE_FILE et
// WINDOWS_CERTIFICATE_PASSWORD, lus par @electron/windows-sign). Sans
// certificat, la compilation reste possible mais l'installeur n'est pas signé.
const windowsSign = process.env.WINDOWS_CERTIFICATE_FILE
  ? {
      certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
      certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
      timestampServer:
        process.env.WINDOWS_TIMESTAMP_SERVER ||
        'http://timestamp.digicert.com',
      description: 'Rotomeca Toolbar',
    }
  : undefined;

// Liste blanche : seuls dist/ (le code), package.json et les dépendances sont embarqués.
// Les sources, tests, scripts et archives de conception restent hors du paquet.
const EMBEDDED = ['/dist', '/package.json', '/node_modules'];
const isEmbedded = (file) => EMBEDDED.some((entry) => file === entry || file.startsWith(`${entry}/`));

module.exports = {
  packagerConfig: {
    asar: true,
    ignore: (file) => file !== '' && !isEmbedded(file),
    icon: `./src/pictures/${icon}`,
    // Signe l'exécutable, les DLL et les modules natifs de l'application
    ...(windowsSign && { windowsSign }),
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      // Signe Setup.exe et Update.exe
      config: {
        ...(windowsSign && { windowsSign }),
        // Icône de Setup.exe et d'Update.exe (le raccourci prend celle de l'exécutable)
        ...(prerelease && {
          setupIcon: path.resolve(__dirname, 'src/pictures/icon-rc.ico'),
        }),
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          icon: `./src/pictures/${icon}.png`,
          maintainer: 'Rotomeca',
          homepage: 'https://github.com/Rotomeca/rotomeca-toolbar',
          categories: ['Utility'],
        },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          icon: `./src/pictures/${icon}.png`,
          homepage: 'https://github.com/Rotomeca/rotomeca-toolbar',
          categories: ['Utility'],
        },
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
