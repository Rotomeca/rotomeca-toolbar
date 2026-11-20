const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PermissionStore,
  normalizeOrigin,
} = require('../dist/src/scripts/PermissionStore.js');

/** Stockage en mémoire qui compte les écritures. */
function memoryStorage(initial = false) {
  const storage = {
    data: initial,
    saves: 0,
    load: () => storage.data,
    save: (data) => {
      storage.data = JSON.parse(JSON.stringify(data));
      ++storage.saves;
    },
  };
  return storage;
}

test('normalizeOrigin : ne garde que l\'origine http(s)', () => {
  assert.equal(normalizeOrigin('https://example.com/a/b?q=1#x'), 'https://example.com');
  assert.equal(normalizeOrigin('http://localhost:3000/x'), 'http://localhost:3000');
  for (const bad of ['file:///C:/x', 'javascript:alert(1)', 'example.com', '', null, 12]) {
    assert.equal(normalizeOrigin(bad), null, String(bad));
  }
});

test('get : undefined tant qu\'aucune décision n\'est enregistrée', () => {
  const store = new PermissionStore(memoryStorage());
  assert.equal(store.get('https://example.com', 'media'), undefined);
});

test('set puis get : autorisé et refusé sont mémorisés', () => {
  const store = new PermissionStore(memoryStorage());
  assert.equal(store.set('https://meet.example.com', 'media', true), true);
  assert.equal(store.set('https://maps.example.com', 'geolocation', false), true);

  assert.equal(store.get('https://meet.example.com', 'media'), true);
  assert.equal(store.get('https://maps.example.com', 'geolocation'), false);
  // Une autre permission ou une autre origine n'est pas concernée
  assert.equal(store.get('https://meet.example.com', 'geolocation'), undefined);
  assert.equal(store.get('https://autre.example.com', 'media'), undefined);
});

test('une URL complète désigne la même origine', () => {
  const store = new PermissionStore(memoryStorage());
  store.set('https://example.com/page?a=1', 'media', true);
  assert.equal(store.get('https://example.com', 'media'), true);
  assert.equal(store.get('https://example.com/autre', 'media'), true);
  assert.equal(store.list()[0].origin, 'https://example.com');
});

test('set : refuse origine, permission ou valeur invalides sans rien écrire', () => {
  const storage = memoryStorage();
  const store = new PermissionStore(storage);

  assert.equal(store.set('file:///C:/x', 'media', true), false);
  assert.equal(store.set('https://example.com', 'notifications', true), false);
  assert.equal(store.set('https://example.com', 'media', 'oui'), false);
  assert.equal(store.set('https://example.com', 'media', 1), false);

  assert.deepEqual(store.list(), []);
  assert.equal(storage.saves, 0);
});

test('les décisions survivent à un redémarrage', () => {
  const storage = memoryStorage();
  const first = new PermissionStore(storage);
  first.set('https://meet.example.com', 'media', true);
  first.set('https://maps.example.com', 'geolocation', false);

  const second = new PermissionStore(storage);
  assert.equal(second.get('https://meet.example.com', 'media'), true);
  assert.equal(second.get('https://maps.example.com', 'geolocation'), false);
});

test('revoke : oublie la décision et la persiste', () => {
  const storage = memoryStorage();
  const store = new PermissionStore(storage);
  store.set('https://example.com', 'media', true);

  assert.equal(store.revoke('https://example.com', 'media'), true);
  assert.equal(store.get('https://example.com', 'media'), undefined);
  assert.equal(new PermissionStore(storage).get('https://example.com', 'media'), undefined);
});

test('revoke : une décision inconnue ou invalide ne change rien', () => {
  const storage = memoryStorage();
  const store = new PermissionStore(storage);
  store.set('https://example.com', 'media', true);
  const saves = storage.saves;

  assert.equal(store.revoke('https://autre.example.com', 'media'), false);
  assert.equal(store.revoke('pas une url', 'media'), false);
  assert.equal(store.revoke('https://example.com', 'geolocation'), false);
  assert.equal(storage.saves, saves);
  assert.equal(store.get('https://example.com', 'media'), true);
});

test('clear : supprime tout, sans écriture inutile quand c\'est déjà vide', () => {
  const storage = memoryStorage();
  const store = new PermissionStore(storage);

  store.clear();
  assert.equal(storage.saves, 0);

  store.set('https://a.example.com', 'media', true);
  store.set('https://b.example.com', 'geolocation', false);
  store.clear();
  assert.deepEqual(store.list(), []);
  assert.deepEqual(new PermissionStore(storage).list(), []);
});

test('list : triée, et sans lien avec l\'état interne', () => {
  const store = new PermissionStore(memoryStorage());
  store.set('https://b.example.com', 'media', true);
  store.set('https://a.example.com', 'media', false);
  store.set('https://a.example.com', 'geolocation', true);

  assert.deepEqual(
    store.list().map((d) => `${d.origin} ${d.permission}`),
    [
      'https://a.example.com geolocation',
      'https://a.example.com media',
      'https://b.example.com media',
    ],
  );

  store.list()[0].allowed = !store.list()[0].allowed;
  assert.equal(store.get('https://a.example.com', 'geolocation'), true);
});

test('chargement : un fichier modifié à la main ne peut rien accorder d\'invalide', () => {
  const storage = memoryStorage({
    version: 1,
    decisions: [
      { origin: 'https://ok.example.com', permission: 'media', allowed: true },
      { origin: 'file:///C:/', permission: 'media', allowed: true },
      { origin: 'https://example.com', permission: 'notifications', allowed: true },
      { origin: 'https://example.com', permission: 'media', allowed: 'true' },
      { origin: 'https://example.com', permission: 'media' },
      null,
      'texte',
      42,
    ],
  });
  const store = new PermissionStore(storage);

  assert.deepEqual(
    store.list().map((d) => d.origin),
    ['https://ok.example.com'],
  );
  assert.equal(store.get('https://example.com', 'media'), undefined);
});

test('chargement : données absentes, corrompues ou de mauvais type', () => {
  for (const data of [false, null, undefined, 'x', 12, [], {}, { decisions: 'non' }]) {
    const store = new PermissionStore(memoryStorage(data));
    assert.deepEqual(store.list(), [], String(JSON.stringify(data)));
  }
});

test('chargement : un stockage qui lève ne fait pas planter', (t) => {
  t.mock.method(console, 'error', () => {});
  const store = new PermissionStore({
    load: () => {
      throw new Error('disque illisible');
    },
    save: () => {},
  });
  assert.deepEqual(store.list(), []);
});

test('set : un disque en échec garde la décision pour la session', (t) => {
  t.mock.method(console, 'error', () => {});
  const store = new PermissionStore({
    load: () => false,
    save: () => {
      throw new Error('disque plein');
    },
  });
  assert.equal(store.set('https://example.com', 'media', true), true);
  assert.equal(store.get('https://example.com', 'media'), true);
});
