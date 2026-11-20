const test = require('node:test');
const assert = require('node:assert/strict');
const { AppListService } = require('../dist/src/main/apps/AppListService.js');

function setup({ stored = false, failSave = false } = {}) {
  const log = [];
  const saved = [];
  const errors = [];
  const service = new AppListService({
    repository: {
      loadAsync: async () => stored,
      save: (data) => { if (failSave) throw new Error('disque plein'); saved.push(JSON.parse(JSON.stringify(data))); },
    },
    toolbar: {
      appAdded: (entry) => log.push(['added', entry]),
      appInserted: (args) => log.push(['inserted', args]),
      appUpdated: (args) => log.push(['updated', args]),
      appDeleted: (url) => log.push(['deleted', url]),
      separatorDeleted: (ref) => log.push(['separatorDeleted', ref]),
      appMoved: (args) => log.push(['moved', args]),
    },
    onSaveError: (error) => errors.push(error.message),
  });
  return { service, log, saved, errors };
}

const app = (url) => ({ name: url, url, picture: null });
const A = 'https://a.test/';
const B = 'https://b.test/';
const C = 'https://c.test/';
const urls = (service) => service.entries.map((e) => (e === 'separator' ? '-' : e.url));

// #region load / urls

test('load : reprend la liste enregistrée', async () => {
  const { service } = setup({ stored: [app(A), 'separator', app(B)] });
  assert.equal(await service.load(), true);
  assert.deepEqual(urls(service), [A, '-', B]);
  assert.deepEqual(service.urls(), [A, B]);
});

test('load : rien d\'enregistré, la liste reste vide', async () => {
  const { service } = setup({ stored: false });
  assert.equal(await service.load(), false);
  assert.deepEqual(urls(service), []);
});

test('load : des données qui ne sont pas une liste donnent une liste vide', async () => {
  const { service } = setup({ stored: { a: 1 } });
  assert.equal(await service.load(), true);
  assert.deepEqual(urls(service), []);
});

// #endregion

// #region add

test('add : ajoute une application, prévient la barre et enregistre', () => {
  const { service, log, saved } = setup();
  assert.equal(service.add({ name: 'A', url: A, picture: null }), true);
  assert.deepEqual(urls(service), [A]);
  assert.deepEqual(log, [['added', { name: 'A', url: A, picture: null }]]);
  assert.equal(saved.length, 1);
});

test('add : une application déjà présente n\'est pas dupliquée', () => {
  const { service, log, saved } = setup();
  service.add({ url: A });
  const count = saved.length;
  assert.equal(service.add({ url: A }), true);
  assert.deepEqual(urls(service), [A]);
  assert.equal(log.length, 1);
  assert.equal(saved.length, count);
});

test('add : une adresse dangereuse ou une donnée invalide est refusée', () => {
  const { service, log, saved } = setup();
  for (const bad of [{ url: 'javascript:alert(1)' }, { url: 'file:///c' }, null, 'x', undefined, {}]) {
    assert.equal(service.add(bad), false);
  }
  assert.deepEqual([log.length, saved.length], [0, 0]);
});

test('add : le nom est repris de l\'adresse s\'il manque', () => {
  const { service } = setup();
  service.add({ url: A });
  assert.equal(service.entries[0].name, A);
});

// #endregion

// #region addForEdit

test('addForEdit : ajoute et donne la position', () => {
  const { service, log } = setup({ stored: [app(A)] });
  return service.load().then(() => {
    const added = service.addForEdit({ url: B, name: 'B' });
    assert.equal(added.index, 1);
    assert.equal(added.url, B);
    assert.equal(log[0][0], 'added');
  });
});

test('addForEdit : donnée invalide, rien n\'est ajouté', () => {
  const { service, saved } = setup();
  assert.equal(service.addForEdit({ url: 'ftp://x' }), null);
  assert.equal(saved.length, 0);
});

// #endregion

// #region addSeparatorAfter

test('addSeparatorAfter : en fin de liste, ajoute', async () => {
  const { service, log } = setup({ stored: [app(A)] });
  await service.load();
  service.addSeparatorAfter(A);
  assert.deepEqual(urls(service), [A, '-']);
  assert.deepEqual(log, [['added', 'separator']]);
});

test('addSeparatorAfter : au milieu, insère à la bonne position', async () => {
  const { service, log } = setup({ stored: [app(A), app(B)] });
  await service.load();
  service.addSeparatorAfter(A);
  assert.deepEqual(urls(service), [A, '-', B]);
  assert.deepEqual(log, [['inserted', { url: A, index: 0, data: 'separator' }]]);
});

test('addSeparatorAfter : application inconnue ou adresse invalide, rien ne change', async () => {
  const { service, log, saved } = setup({ stored: [app(A)] });
  await service.load();
  service.addSeparatorAfter('https://inconnu.test/');
  service.addSeparatorAfter(undefined);
  assert.deepEqual([log.length, saved.length], [0, 0]);
});

// #endregion

// #region update

test('update : modifie l\'application désignée par sa position', async () => {
  const { service, log } = setup({ stored: [app(A), app(B)] });
  await service.load();
  assert.equal(service.update({ id: 1, name: 'Nouveau', url: C, picture: 'font:x' }), true);
  assert.deepEqual(service.entries[1], { name: 'Nouveau', url: C, picture: 'font:x' });
  assert.deepEqual(log[0], ['updated', { name: 'Nouveau', url: C, picture: 'font:x', id: 1, oldLink: B }]);
});

test('update : refuse un séparateur, une position hors liste ou une adresse dangereuse', async () => {
  const { service, saved } = setup({ stored: [app(A), 'separator'] });
  await service.load();
  assert.equal(service.update({ id: 1, url: C }), false);
  assert.equal(service.update({ id: 9, url: C }), false);
  assert.equal(service.update({ id: 0, url: 'javascript:1' }), false);
  assert.equal(service.update({ url: C }), false);
  assert.equal(service.update(null), false);
  assert.equal(saved.length, 0);
});

// #endregion

// #region remove

test('remove : retire l\'application et fusionne les séparateurs voisins', async () => {
  const { service, log, saved } = setup({ stored: [app(A), 'separator', app(B), 'separator', app(C)] });
  await service.load();
  service.remove(B);
  assert.deepEqual(urls(service), [A, '-', C]);
  assert.deepEqual(log, [['deleted', B], ['separatorDeleted', A]]);
  assert.equal(saved.length, 1);
});

test('remove : une application inconnue prévient quand même la barre sans rien changer', async () => {
  const { service, log } = setup({ stored: [app(A)] });
  await service.load();
  service.remove(B);
  assert.deepEqual(urls(service), [A]);
  assert.deepEqual(log, [['deleted', B]]);
});

// #endregion

// #region move

test('move : déplace d\'un cran et prévient la barre', async () => {
  const { service, log } = setup({ stored: [app(A), app(B), app(C)] });
  await service.load();
  assert.equal(service.move({ url: A, type: 'down' }), true);
  assert.deepEqual(urls(service), [B, A, C]);
  assert.deepEqual(log, [['moved', { url: A, type: 'down', modifier: 0 }]]);
});

test('move : enjambe un séparateur', async () => {
  const { service, log } = setup({ stored: [app(A), 'separator', app(B)] });
  await service.load();
  service.move({ url: A, type: 'down' });
  assert.equal(log[0][1].modifier, 1);
});

test('move : une demande invalide ou une application inconnue est refusée', async () => {
  const { service, saved } = setup({ stored: [app(A), app(B)] });
  await service.load();
  for (const bad of [null, undefined, {}, { url: A }, { url: A, type: 'left' }, { url: 3, type: 'up' }, { url: 'https://z.test/', type: 'up' }]) {
    assert.equal(service.move(bad), false, JSON.stringify(bad));
  }
  assert.equal(saved.length, 0);
});

// #endregion

// #region erreurs d'enregistrement

test('un échec d\'enregistrement prévient l\'utilisateur et garde la liste en mémoire', (t) => {
  t.mock.method(console, 'error', () => {});
  const { service, errors } = setup({ failSave: true });
  assert.equal(service.add({ url: A }), true);
  assert.deepEqual(errors, ['disque plein']);
  assert.deepEqual(urls(service), [A]);
});

// #endregion
