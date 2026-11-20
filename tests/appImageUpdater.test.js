const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createAppImageUpdater } = require('../dist/src/main/updates/appImageUpdater.js');

/** Faux electron-updater : un émetteur d'évènements avec les réglages et les appels enregistrés. */
function fakeSource() {
  const source = new EventEmitter();
  Object.assign(source, {
    autoDownload: false,
    autoInstallOnAppQuit: true,
    allowPrerelease: true,
    feeds: [],
    checks: 0,
    installs: [],
    checkForUpdates() {
      source.checks += 1;
      return Promise.resolve(null);
    },
    setFeedURL(options) {
      source.feeds.push(options);
    },
    quitAndInstall(...args) {
      source.installs.push(args);
    },
  });
  return source;
}

test('createAppImageUpdater : télécharge seul, sans installer à la fermeture, sans pré-versions par défaut', () => {
  const source = fakeSource();
  createAppImageUpdater(source, 'Rotomeca/rotomeca-toolbar');

  assert.equal(source.autoDownload, true);
  assert.equal(source.autoInstallOnAppQuit, false);
  assert.equal(source.allowPrerelease, false);
});

test('createAppImageUpdater : « test » vise le dossier de la pré-version, « stable » les releases GitHub', () => {
  const source = fakeSource();
  const { setChannel } = createAppImageUpdater(source, 'Rotomeca/rotomeca-toolbar');

  setChannel('test', '4.1.0-rc1');
  setChannel('stable');

  assert.deepEqual(source.feeds, [
    { provider: 'generic', url: 'https://github.com/Rotomeca/rotomeca-toolbar/releases/download/4.1.0-rc1' },
    { provider: 'github', owner: 'Rotomeca', repo: 'rotomeca-toolbar' },
  ]);
  assert.equal(source.allowPrerelease, false);
});

test('createAppImageUpdater : « test » sans version retombe sur les releases GitHub', () => {
  const source = fakeSource();
  createAppImageUpdater(source, 'Rotomeca/rotomeca-toolbar').setChannel('test');

  assert.deepEqual(source.feeds, [{ provider: 'github', owner: 'Rotomeca', repo: 'rotomeca-toolbar' }]);
});

test('createAppImageUpdater : transmet les évènements, la version arrive en 3e argument', () => {
  const source = fakeSource();
  const { updater } = createAppImageUpdater(source, 'Rotomeca/rotomeca-toolbar');
  const seen = [];

  updater.on('update-available', () => seen.push('available'));
  updater.on('update-not-available', () => seen.push('none'));
  updater.on('update-downloaded', (event, notes, releaseName) => seen.push(['downloaded', event, notes, releaseName]));
  updater.on('error', (error) => seen.push(['error', error.message]));

  source.emit('update-available', {});
  source.emit('update-not-available', {});
  source.emit('update-downloaded', { version: '4.1.0' });
  source.emit('error', new Error('boom'));

  assert.deepEqual(seen, ['available', 'none', ['downloaded', null, '', '4.1.0'], ['error', 'boom']]);
});

test('createAppImageUpdater : onProgress transmet le pourcentage du téléchargement', () => {
  const source = fakeSource();
  const { updater } = createAppImageUpdater(source, 'Rotomeca/rotomeca-toolbar');
  const seen = [];

  updater.onProgress((percent) => seen.push(percent));
  source.emit('download-progress', { percent: 12.5, bytesPerSecond: 1, total: 10, transferred: 1 });
  source.emit('download-progress', { percent: 100 });

  assert.deepEqual(seen, [12.5, 100]);
});

test('createAppImageUpdater : checkForUpdates lance la vérification, une promesse rejetée ne plante pas', async () => {
  const source = fakeSource();
  const { updater } = createAppImageUpdater(source, 'Rotomeca/rotomeca-toolbar');

  updater.checkForUpdates();
  assert.equal(source.checks, 1);

  source.checkForUpdates = () => Promise.reject(new Error('réseau'));
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args);
  try {
    updater.checkForUpdates();
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    console.error = original;
  }
  assert.equal(logged.length, 1);
});

test('createAppImageUpdater : quitAndInstall relance l\'application après l\'installation', () => {
  const source = fakeSource();
  const { updater } = createAppImageUpdater(source, 'Rotomeca/rotomeca-toolbar');

  updater.quitAndInstall();
  assert.deepEqual(source.installs, [[false, true]]);
});
