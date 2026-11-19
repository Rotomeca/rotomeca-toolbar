const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { UpdateManager } = require('../src/scripts/UpdateManager.js');
const { compareVersions } = require('../src/scripts/versions.js');

const REPO = 'Rotomeca/releases';

/** Faux Squirrel : enregistre les appels et émet les évènements à la demande. */
function fakeAutoUpdater() {
  const updater = new EventEmitter();
  updater.checks = 0;
  updater.installs = 0;
  updater.checkForUpdates = () => ++updater.checks;
  updater.quitAndInstall = () => ++updater.installs;
  return updater;
}

/** Fabrique un manager avec des dépendances espionnées. */
function setup(overrides = {}) {
  const calls = { changes: [], notified: [], opened: [], beforeInstall: 0 };
  const deps = {
    version: '3.2.0',
    autoUpdater: null,
    releasesRepo: REPO,
    manual: false,
    simulate: false,
    fetch: async () => {
      throw new Error('fetch inattendu');
    },
    openExternal: (url) => calls.opened.push(url),
    compareVersions,
    beforeInstall: () => ++calls.beforeInstall,
    onChange: (state) => calls.changes.push(state),
    notifyReady: (version) => calls.notified.push(version),
    ...overrides,
  };
  return { manager: new UpdateManager(deps), deps, calls };
}

/** Réponse GitHub factice. */
function githubRelease(tag, htmlUrl = `https://github.com/${REPO}/releases/tag/${tag}`) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ tag_name: tag, html_url: htmlUrl }),
  });
}

test('enabled : faux sans Squirrel ni dépôt, vrai sinon', () => {
  assert.equal(setup().manager.enabled, false);
  assert.equal(setup({ manual: true, releasesRepo: null }).manager.enabled, false);
  assert.equal(setup({ manual: true }).manager.enabled, true);
  assert.equal(setup({ autoUpdater: fakeAutoUpdater() }).manager.enabled, true);
  assert.equal(setup({ simulate: true }).manager.enabled, true);
});

test('état initial : à jour, rien en cours', () => {
  const { state } = setup().manager;
  assert.equal(state.etat, 'uptodate');
  assert.equal(state.verification, false);
  assert.equal(state.versionActuelle, '3.2.0');
  assert.equal(state.versionDisponible, null);
});

test('check : sans environnement compatible, ne fait rien', async () => {
  const { manager, calls } = setup();
  await manager.check();
  assert.equal(calls.changes.length, 0);
});

test('Squirrel : cycle complet disponible → téléchargé → installation', async () => {
  const autoUpdater = fakeAutoUpdater();
  const { manager, calls } = setup({ autoUpdater });

  manager.start();
  assert.equal(autoUpdater.checks, 1);
  assert.equal(manager.state.verification, true);

  autoUpdater.emit('update-available');
  assert.equal(manager.state.etat, 'downloading');
  assert.equal(manager.state.verification, false);

  autoUpdater.emit('update-downloaded', {}, '', 'v3.3.0');
  assert.equal(manager.state.etat, 'ready');
  assert.equal(manager.state.versionDisponible, '3.3.0');
  assert.deepEqual(calls.notified, ['3.3.0']);

  manager.install();
  assert.equal(calls.beforeInstall, 1);
  assert.equal(autoUpdater.installs, 1);
});

test('Squirrel : pas de nouvelle vérification pendant téléchargement ou état prêt', async () => {
  const autoUpdater = fakeAutoUpdater();
  const { manager } = setup({ autoUpdater });
  manager.start();
  autoUpdater.emit('update-available');
  await manager.check();
  assert.equal(autoUpdater.checks, 1);

  autoUpdater.emit('update-downloaded', {}, '', 'x');
  await manager.check();
  assert.equal(autoUpdater.checks, 1);
});

test('Squirrel : update-not-available remet à jour', () => {
  const autoUpdater = fakeAutoUpdater();
  const { manager } = setup({ autoUpdater });
  manager.start();
  autoUpdater.emit('update-not-available');
  assert.equal(manager.state.etat, 'uptodate');
  assert.equal(manager.state.verification, false);
  assert.notEqual(manager.state.derniereVerification, null);
});

test('install : la sauvegarde qui échoue n\'empêche pas la mise à jour', (t) => {
  t.mock.method(console, 'error', () => {});
  const autoUpdater = fakeAutoUpdater();
  const { manager } = setup({
    autoUpdater,
    beforeInstall: () => {
      throw new Error('disque plein');
    },
  });
  manager.start();
  autoUpdater.emit('update-available');
  autoUpdater.emit('update-downloaded', {}, '', 'v3.3.0');

  manager.install();
  assert.equal(autoUpdater.installs, 1);
});

test('install : sans mise à jour prête, ne redémarre pas', () => {
  const autoUpdater = fakeAutoUpdater();
  const { manager } = setup({ autoUpdater });
  manager.start();
  manager.install();
  assert.equal(autoUpdater.installs, 0);
});

test('Squirrel : une erreur pendant le téléchargement retombe sur « à jour »', (t) => {
  t.mock.method(console, 'error', () => {});
  const autoUpdater = fakeAutoUpdater();
  const { manager } = setup({ autoUpdater });
  manager.start();
  autoUpdater.emit('update-available');
  autoUpdater.emit('error', new Error('réseau'));
  assert.equal(manager.state.etat, 'uptodate');
  assert.equal(manager.state.erreur, 'update.card.errorDownload');
  assert.equal(manager.state.verification, false);
});

test('Linux : version plus récente → disponible, notifiée une seule fois', async () => {
  const { manager, calls } = setup({ manual: true, fetch: githubRelease('v3.3.0') });
  await manager.check();
  assert.equal(manager.state.etat, 'available');
  assert.equal(manager.state.versionDisponible, '3.3.0');
  assert.deepEqual(calls.notified, ['3.3.0']);

  await manager.check();
  assert.deepEqual(calls.notified, ['3.3.0']);
});

test('Linux : install ouvre la page de la release', async () => {
  const { manager, calls } = setup({ manual: true, fetch: githubRelease('3.3.0') });
  await manager.check();
  manager.install();
  assert.deepEqual(calls.opened, [`https://github.com/${REPO}/releases/tag/3.3.0`]);
});

test('Linux : même version ou plus ancienne → à jour', async () => {
  for (const tag of ['3.2.0', '3.1.9']) {
    const { manager, calls } = setup({ manual: true, fetch: githubRelease(tag) });
    await manager.check();
    assert.equal(manager.state.etat, 'uptodate', tag);
    assert.equal(calls.notified.length, 0, tag);
  }
});

test('Linux : refuse un tag ou une URL de release inattendus', async (t) => {
  t.mock.method(console, 'error', () => {});
  const cases = [
    ['tag non numérique', githubRelease('latest')],
    ['tag injecté', githubRelease('3.3.0; rm -rf')],
    ['URL hors du dépôt', githubRelease('3.3.0', 'https://evil.example/releases/3.3.0')],
    ['URL d\'un autre dépôt', githubRelease('3.3.0', 'https://github.com/Autre/depot/releases/3.3.0')],
  ];
  for (const [label, fetch] of cases) {
    const { manager, calls } = setup({ manual: true, fetch });
    await manager.check();
    assert.equal(manager.state.etat, 'uptodate', label);
    assert.equal(manager.state.erreur, 'update.card.errorCheck', label);
    manager.install();
    assert.deepEqual(calls.opened, [], label);
  }
});

test('Linux : une réponse GitHub en erreur est signalée sans planter', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { manager } = setup({
    manual: true,
    fetch: async () => ({ ok: false, status: 403 }),
  });
  await manager.check();
  assert.equal(manager.state.etat, 'uptodate');
  assert.equal(manager.state.erreur, 'update.card.errorCheck');
  assert.equal(manager.state.verification, false);
});

test('Linux : le réseau qui échoue est signalé sans planter', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { manager } = setup({
    manual: true,
    fetch: async () => {
      throw new Error('ECONNREFUSED');
    },
  });
  await manager.check();
  assert.equal(manager.state.erreur, 'update.card.errorCheck');
});

test('state : renvoie une copie, non modifiable de l\'extérieur', () => {
  const { manager } = setup();
  const state = manager.state;
  state.etat = 'ready';
  assert.equal(manager.state.etat, 'uptodate');
});
