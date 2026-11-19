const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

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

module.exports = {
  packagerConfig: {
    asar: true,
    // Les tests n'ont rien à faire dans l'application livrée
    ignore: [/^\/tests($|\/)/],
    icon: './src/pictures/icon',
    // Signe l'exécutable, les DLL et les modules natifs de l'application
    ...(windowsSign && { windowsSign }),
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      // Signe Setup.exe et Update.exe
      config: { ...(windowsSign && { windowsSign }) },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          icon: './src/pictures/icon.png',
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
          icon: './src/pictures/icon.png',
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
