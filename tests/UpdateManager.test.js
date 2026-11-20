const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { UpdateManager } = require('../dist/src/scripts/UpdateManager.js');
const { compareVersions } = require('../dist/src/scripts/versions.js');

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

// #region Canal de test (pré-versions)

/** Réponse GitHub factice pour la liste des releases. */
function githubList(releases) {
  return async () => ({ ok: true, status: 200, json: async () => releases });
}

const release = (tag, extra = {}) => ({
  tag_name: tag,
  html_url: `https://github.com/${REPO}/releases/tag/${tag}`,
  prerelease: false,
  draft: false,
  ...extra,
});

test('checkTest : trouve la pré-version plus récente que la version actuelle', async () => {
  const { manager } = setup({
    fetch: githubList([release('3.3.0', { prerelease: true })]),
  });
  await manager.checkTest();
  assert.equal(manager.state.versionTest, '3.3.0');
  assert.equal(manager.state.verificationTest, false);
  assert.equal(manager.state.erreurTest, null);
  assert.notEqual(manager.state.derniereVerificationTest, null);
});

test('checkTest : retient la plus récente parmi plusieurs pré-versions', async () => {
  const { manager } = setup({
    fetch: githubList([
      release('3.3.0', { prerelease: true }),
      release('3.10.0', { prerelease: true }),
      release('3.4.0', { prerelease: true }),
    ]),
  });
  await manager.checkTest();
  assert.equal(manager.state.versionTest, '3.10.0');
});

test('checkTest : ignore les versions stables, les brouillons et les versions non récentes', async () => {
  const { manager } = setup({
    fetch: githubList([
      release('3.9.0'), // stable : jamais proposée comme version de test
      release('3.8.0', { prerelease: true, draft: true }),
      release('3.2.0', { prerelease: true }), // égale à l'actuelle
      release('3.1.0', { prerelease: true }), // plus ancienne
    ]),
  });
  await manager.checkTest();
  assert.equal(manager.state.versionTest, null);
  assert.notEqual(manager.state.derniereVerificationTest, null);
});

test('checkTest : une release au format inattendu ne bloque pas les autres', async () => {
  const { manager } = setup({
    fetch: githubList([
      release('latest', { prerelease: true }),
      release('3.3.0', { prerelease: true, html_url: 'https://evil.example/x' }),
      null,
      'texte',
      release('3.4.0', { prerelease: true }),
    ]),
  });
  await manager.checkTest();
  assert.equal(manager.state.versionTest, '3.4.0');
});

test('checkTest : une réponse qui n\'est pas une liste est une erreur', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { manager } = setup({
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ message: 'nope' }) }),
  });
  await manager.checkTest();
  assert.equal(manager.state.erreurTest, 'update.card.errorCheck');
  assert.equal(manager.state.versionTest, null);
  assert.equal(manager.state.verificationTest, false);
});

test('checkTest : réponse GitHub en erreur ou réseau coupé', async (t) => {
  t.mock.method(console, 'error', () => {});
  for (const fetch of [
    async () => ({ ok: false, status: 403 }),
    async () => {
      throw new Error('ECONNREFUSED');
    },
  ]) {
    const { manager } = setup({ fetch });
    await manager.checkTest();
    assert.equal(manager.state.erreurTest, 'update.card.errorCheck');
    assert.equal(manager.state.verificationTest, false);
  }
});

test('checkTest : sans dépôt de releases, ne fait rien', async () => {
  const { manager, calls } = setup({ releasesRepo: null });
  await manager.checkTest();
  assert.equal(calls.changes.length, 0);
});

test('checkTest : une recherche déjà en cours n\'en lance pas une seconde', async () => {
  let fetches = 0;
  const { manager } = setup({
    fetch: async () => {
      ++fetches;
      return { ok: true, status: 200, json: async () => [] };
    },
  });
  await Promise.all([manager.checkTest(), manager.checkTest(), manager.checkTest()]);
  assert.equal(fetches, 1);
});

test('checkTest : n\'affecte pas l\'état des mises à jour normales', async () => {
  const autoUpdater = fakeAutoUpdater();
  const { manager } = setup({
    autoUpdater,
    fetch: githubList([release('3.3.0', { prerelease: true })]),
  });
  manager.start();
  autoUpdater.emit('update-available');

  await manager.checkTest();
  assert.equal(manager.state.etat, 'downloading');
  assert.equal(manager.state.versionDisponible, null);
  assert.equal(manager.state.versionTest, '3.3.0');
});

test('checkTest : n\'est jamais notifiée', async () => {
  const { manager, calls } = setup({
    fetch: githubList([release('3.3.0', { prerelease: true })]),
  });
  await manager.checkTest();
  assert.deepEqual(calls.notified, []);
});

test('openTest : ouvre la page de la pré-version trouvée, et seulement elle', async () => {
  const { manager, calls } = setup({
    fetch: githubList([release('3.3.0', { prerelease: true })]),
  });
  manager.openTest(); // rien trouvé pour l'instant
  assert.deepEqual(calls.opened, []);

  await manager.checkTest();
  manager.openTest();
  assert.deepEqual(calls.opened, [`https://github.com/${REPO}/releases/tag/3.3.0`]);
});

test('openTest : après une recherche sans résultat, n\'ouvre plus rien', async () => {
  let list = [release('3.3.0', { prerelease: true })];
  const { manager, calls } = setup({ fetch: async () => ({ ok: true, status: 200, json: async () => list }) });
  await manager.checkTest();

  list = []; // la pré-version a été promue ou retirée
  await manager.checkTest();
  manager.openTest();
  assert.equal(manager.state.versionTest, null);
  assert.deepEqual(calls.opened, []);
});

// #endregion

// #region Installation automatique de la version de test

/** Manager Squirrel avec serveur de test, et une pré-version 3.3.0 sur GitHub. */
function setupAutoTest(overrides = {}) {
  const autoUpdater = fakeAutoUpdater();
  const feeds = [];
  const ctx = setup({
    autoUpdater,
    testFeed: true,
    setFeed: (channel) => feeds.push(channel),
    fetch: githubList([release('3.3.0', { prerelease: true })]),
    ...overrides,
  });
  ctx.manager.start();
  autoUpdater.emit('update-not-available'); // termine la vérification de démarrage
  return { ...ctx, autoUpdater, feeds };
}

test('testAuto : vrai seulement avec Squirrel, un serveur de test et setFeed', () => {
  const base = { autoUpdater: fakeAutoUpdater(), testFeed: true, setFeed: () => {} };
  assert.equal(setup(base).manager.state.testAuto, true);
  assert.equal(setup({ ...base, testFeed: false }).manager.state.testAuto, false);
  assert.equal(setup({ ...base, setFeed: null }).manager.state.testAuto, false);
  assert.equal(setup({ ...base, autoUpdater: null }).manager.state.testAuto, false);
  assert.equal(setup({ ...base, manual: true }).manager.state.testAuto, false, 'Linux');
  assert.equal(setup({ ...base, simulate: true }).manager.state.testAuto, false);
});

test('installTest : sans version de test trouvée, ne fait rien', () => {
  const { manager, autoUpdater, feeds } = setupAutoTest();
  const checks = autoUpdater.checks;
  manager.installTest();
  assert.equal(autoUpdater.checks, checks);
  assert.deepEqual(feeds, []);
});

test('installTest : télécharge et installe comme une mise à jour normale', async () => {
  const { manager, autoUpdater, feeds, calls } = setupAutoTest();
  await manager.checkTest();
  const checks = autoUpdater.checks;

  manager.installTest();
  assert.deepEqual(feeds, ['test'], 'Squirrel interroge le serveur de test');
  assert.equal(autoUpdater.checks, checks + 1);
  assert.equal(manager.state.verification, true);
  assert.equal(manager.state.versionDisponible, '3.3.0');

  autoUpdater.emit('update-available');
  assert.equal(manager.state.etat, 'downloading');
  assert.equal(manager.state.versionDisponible, '3.3.0');

  autoUpdater.emit('update-downloaded', {}, '', '');
  assert.equal(manager.state.etat, 'ready');
  assert.equal(manager.state.versionDisponible, '3.3.0');
  assert.deepEqual(calls.notified, ['3.3.0']);

  manager.install();
  assert.equal(calls.beforeInstall, 1);
  assert.equal(autoUpdater.installs, 1);
});

test('installTest : la vérification normale suivante revient au serveur normal', async () => {
  const { manager, autoUpdater, feeds } = setupAutoTest();
  await manager.checkTest();
  manager.installTest();
  autoUpdater.emit('update-not-available'); // le serveur de test n'a rien

  await manager.check();
  assert.deepEqual(feeds, ['test', 'stable']);
});

test('installTest : une vérification normale ne change pas de serveur inutilement', async () => {
  const { manager, feeds } = setupAutoTest();
  await manager.check();
  await manager.check();
  assert.deepEqual(feeds, []);
});

test('installTest : serveur de test pas encore à jour → message dédié, rien d\'installé', async () => {
  const { manager, autoUpdater } = setupAutoTest();
  await manager.checkTest();
  manager.installTest();
  autoUpdater.emit('update-not-available');

  assert.equal(manager.state.etat, 'uptodate');
  assert.equal(manager.state.verification, false);
  assert.equal(manager.state.versionDisponible, null);
  assert.equal(manager.state.erreurTest, 'update.test.errorUnavailable');
  assert.equal(manager.state.erreur, null, 'pas d\'erreur sur la carte normale');
});

test('installTest : un échec Squirrel s\'affiche dans le bloc de test', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { manager, autoUpdater } = setupAutoTest();
  await manager.checkTest();
  manager.installTest();
  autoUpdater.emit('error', new Error('réseau'));

  assert.equal(manager.state.erreurTest, 'update.card.errorCheck');
  assert.equal(manager.state.erreur, null);
  assert.equal(manager.state.etat, 'uptodate');
  assert.equal(manager.state.versionDisponible, null);
});

test('installTest : un échec pendant le téléchargement retombe sur « à jour »', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { manager, autoUpdater } = setupAutoTest();
  await manager.checkTest();
  manager.installTest();
  autoUpdater.emit('update-available');
  autoUpdater.emit('error', new Error('coupure'));

  assert.equal(manager.state.etat, 'uptodate');
  assert.equal(manager.state.erreurTest, 'update.card.errorDownload');
  assert.equal(manager.state.erreur, null);
});

test('installTest : checkForUpdates qui lève est traité comme un échec', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { manager, autoUpdater } = setupAutoTest();
  await manager.checkTest();
  autoUpdater.checkForUpdates = () => {
    throw new Error('Update.exe introuvable');
  };
  manager.installTest();
  assert.equal(manager.state.erreurTest, 'update.card.errorCheck');
  assert.equal(manager.state.verification, false);
});

test('installTest : ignoré pendant une vérification, un téléchargement ou une mise à jour prête', async () => {
  const { manager, autoUpdater, feeds } = setupAutoTest();
  await manager.checkTest();

  manager.installTest(); // lance l'installation de test
  const checks = autoUpdater.checks;
  manager.installTest(); // vérification en cours
  autoUpdater.emit('update-available');
  manager.installTest(); // téléchargement en cours
  autoUpdater.emit('update-downloaded', {}, '', '');
  manager.installTest(); // prête

  assert.equal(autoUpdater.checks, checks);
  assert.deepEqual(feeds, ['test']);
});

test('installTest : une vérification normale ne démarre pas pendant l\'installation de test', async () => {
  const { manager, autoUpdater, feeds } = setupAutoTest();
  await manager.checkTest();
  manager.installTest();
  const checks = autoUpdater.checks;

  await manager.check();
  assert.equal(autoUpdater.checks, checks);
  assert.deepEqual(feeds, ['test']);
});

test('installTest : sans installation automatique, ouvre la page de la release', async () => {
  const { manager, calls } = setup({
    manual: true,
    fetch: githubList([release('3.3.0', { prerelease: true })]),
  });
  await manager.checkTest();
  manager.installTest();
  assert.deepEqual(calls.opened, [`https://github.com/${REPO}/releases/tag/3.3.0`]);
});

// #endregion

// #region Pré-versions numérotées (X.Y.Z-rcN)

test('checkTest : accepte les pré-versions X.Y.Z-rcN', async () => {
  const { manager } = setup({
    fetch: githubList([release('3.4.0-rc1', { prerelease: true })]),
  });
  await manager.checkTest();
  assert.equal(manager.state.versionTest, '3.4.0-rc1');
});

test('checkTest : retient le rc le plus récent, par numéro', async () => {
  const { manager } = setup({
    fetch: githubList([
      release('3.4.0-rc2', { prerelease: true }),
      release('3.4.0-rc10', { prerelease: true }),
      release('3.4.0-rc9', { prerelease: true }),
    ]),
  });
  await manager.checkTest();
  assert.equal(manager.state.versionTest, '3.4.0-rc10');
});

test('checkTest : un rc de la version installée n\'est pas plus récent', async () => {
  const { manager } = setup({
    version: '3.4.0',
    fetch: githubList([release('3.4.0-rc2', { prerelease: true })]),
  });
  await manager.checkTest();
  assert.equal(manager.state.versionTest, null);
});

test('checkTest : depuis un rc installé, propose le rc suivant seulement', async () => {
  const { manager } = setup({
    version: '3.4.0-rc1',
    fetch: githubList([
      release('3.4.0-rc1', { prerelease: true }),
      release('3.4.0-rc2', { prerelease: true }),
    ]),
  });
  await manager.checkTest();
  assert.equal(manager.state.versionTest, '3.4.0-rc2');
});

test('checkTest : refuse les suffixes autres que -rcN', async () => {
  const { manager } = setup({
    fetch: githubList([
      release('3.4.0-beta1', { prerelease: true }),
      release('3.4.0-rc', { prerelease: true }),
      release('3.4.0-rc1-evil', { prerelease: true }),
      release('3.4.0-rc1', { prerelease: true }),
    ]),
  });
  await manager.checkTest();
  assert.equal(manager.state.versionTest, '3.4.0-rc1');
});

test('Linux : releases/latest ne doit jamais renvoyer une pré-version numérotée', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { manager, calls } = setup({ manual: true, fetch: githubRelease('3.4.0-rc1') });
  await manager.check();
  assert.equal(manager.state.etat, 'uptodate');
  assert.equal(manager.state.erreur, 'update.card.errorCheck');
  assert.deepEqual(calls.notified, []);
});

test('Linux : depuis un rc installé, la version finale est proposée', async () => {
  const { manager } = setup({
    manual: true,
    version: '3.4.0-rc2',
    fetch: githubRelease('3.4.0'),
  });
  await manager.check();
  assert.equal(manager.state.etat, 'available');
  assert.equal(manager.state.versionDisponible, '3.4.0');
});

// #endregion

test('state.prerelease : vrai pour une pré-version installée, faux pour une release', () => {
  assert.equal(setup({ version: '3.4.0-rc1' }).manager.state.prerelease, true);
  assert.equal(setup({ version: '3.4.0' }).manager.state.prerelease, false);
});

test('state.prerelease : ne change pas au fil des vérifications', async () => {
  const autoUpdater = fakeAutoUpdater();
  const { manager } = setup({ version: '3.4.0-rc1', autoUpdater });
  manager.start();
  autoUpdater.emit('update-not-available');
  assert.equal(manager.state.prerelease, true);
});
