const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionStore } = require('../dist/src/scripts/PermissionStore.js');
const { createPermissionPolicy } = require('../dist/src/scripts/permissionPolicy.js');
const { isSafeUrl } = require('../dist/src/scripts/safeUrl.js');

function memoryStorage() {
  const storage = { data: false, load: () => storage.data };
  storage.save = (data) => (storage.data = JSON.parse(JSON.stringify(data)));
  return storage;
}

/** Politique avec un `ask` scripté qui mémorise chaque question posée. */
function setup(answers = []) {
  const storage = memoryStorage();
  const store = new PermissionStore(storage);
  const asked = [];
  const ask = async (origin, permission) => {
    asked.push(`${origin}|${permission}`);
    const answer = answers.shift();
    if (answer instanceof Error) throw answer;
    return answer;
  };
  const policy = createPermissionPolicy({ store, ask, isSafeUrl });
  return { policy, store, storage, asked };
}

/** Appelle `request` et renvoie la valeur passée au callback. */
function requestPermission(policy, permission, url, { viaContents = false } = {}) {
  return new Promise((resolve) => {
    const contents = viaContents ? { getURL: () => url } : null;
    const details = viaContents ? undefined : { requestingUrl: url };
    policy.request(contents, permission, resolve, details);
  });
}

test('check : les permissions sûres sont accordées, les inconnues refusées', () => {
  const { policy } = setup();
  for (const permission of ['notifications', 'fullscreen', 'mediaKeySystem', 'clipboard-sanitized-write']) {
    assert.equal(policy.check(null, permission, 'https://example.com'), true, permission);
  }
  for (const permission of ['openExternal', 'clipboard-read', 'midiSysex', 'usb', 'unknown']) {
    assert.equal(policy.check(null, permission, 'https://example.com'), false, permission);
  }
});

test('check : caméra/micro et position suivent la décision mémorisée', () => {
  const { policy, store } = setup();
  assert.equal(policy.check(null, 'media', 'https://meet.example.com'), false);

  store.set('https://meet.example.com', 'media', true);
  store.set('https://maps.example.com', 'geolocation', false);
  assert.equal(policy.check(null, 'media', 'https://meet.example.com'), true);
  assert.equal(policy.check(null, 'geolocation', 'https://maps.example.com'), false);
  // Autre origine : toujours refusée
  assert.equal(policy.check(null, 'media', 'https://autre.example.com'), false);
});

test('check : après révocation, l\'accès est de nouveau refusé', () => {
  const { policy, store } = setup();
  store.set('https://meet.example.com', 'media', true);
  store.revoke('https://meet.example.com', 'media');
  assert.equal(policy.check(null, 'media', 'https://meet.example.com'), false);
});

test('request : accorde d\'office sans poser de question', async () => {
  const { policy, asked } = setup();
  assert.equal(await requestPermission(policy, 'notifications', 'https://example.com'), true);
  assert.deepEqual(asked, []);
});

test('request : refuse les permissions inconnues sans poser de question', async () => {
  const { policy, asked } = setup();
  assert.equal(await requestPermission(policy, 'usb', 'https://example.com'), false);
  assert.deepEqual(asked, []);
});

test('request : refuse une origine non http(s) ou absente, sans question', async () => {
  const { policy, asked, store } = setup();
  assert.equal(await requestPermission(policy, 'media', 'file:///C:/page.html'), false);
  assert.equal(await requestPermission(policy, 'media', 'about:blank'), false);
  assert.equal(await requestPermission(policy, 'media', 'pas une url'), false);
  assert.deepEqual(asked, []);
  assert.deepEqual(store.list(), []);
});

test('request : une réponse « oui » est mémorisée et ne repose plus la question', async () => {
  const { policy, asked, store, storage } = setup([true]);

  assert.equal(await requestPermission(policy, 'media', 'https://meet.example.com/room/1'), true);
  assert.equal(store.get('https://meet.example.com', 'media'), true);
  assert.equal(storage.data.decisions.length, 1, 'écrit sur le disque');

  assert.equal(await requestPermission(policy, 'media', 'https://meet.example.com/autre'), true);
  assert.deepEqual(asked, ['https://meet.example.com|media']);
});

test('request : une réponse « non » est aussi mémorisée', async () => {
  const { policy, asked, store } = setup([false]);

  assert.equal(await requestPermission(policy, 'geolocation', 'https://maps.example.com'), false);
  assert.equal(store.get('https://maps.example.com', 'geolocation'), false);

  assert.equal(await requestPermission(policy, 'geolocation', 'https://maps.example.com'), false);
  assert.equal(asked.length, 1);
});

test('request : après révocation, la question est reposée', async () => {
  const { policy, asked, store } = setup([true, false]);
  await requestPermission(policy, 'media', 'https://meet.example.com');
  store.revoke('https://meet.example.com', 'media');

  assert.equal(await requestPermission(policy, 'media', 'https://meet.example.com'), false);
  assert.equal(asked.length, 2);
});

test('request : l\'origine peut venir de la page quand `details` est absent', async () => {
  const { policy, asked } = setup([true]);
  assert.equal(
    await requestPermission(policy, 'media', 'https://meet.example.com/x', { viaContents: true }),
    true,
  );
  assert.deepEqual(asked, ['https://meet.example.com|media']);
});

test('request : des demandes simultanées ne posent qu\'une seule question', async () => {
  const { policy, asked } = setup([true]);
  const results = await Promise.all([
    requestPermission(policy, 'media', 'https://meet.example.com'),
    requestPermission(policy, 'media', 'https://meet.example.com'),
    requestPermission(policy, 'media', 'https://meet.example.com'),
  ]);
  assert.deepEqual(results, [true, true, true]);
  assert.equal(asked.length, 1);
});

test('request : la même origine pour deux permissions pose deux questions', async () => {
  const { policy, asked } = setup([true, false]);
  const [media, geo] = await Promise.all([
    requestPermission(policy, 'media', 'https://meet.example.com'),
    requestPermission(policy, 'geolocation', 'https://meet.example.com'),
  ]);
  assert.equal(media, true);
  assert.equal(geo, false);
  assert.equal(asked.length, 2);
});

test('request : seule une réponse strictement vraie autorise', async () => {
  for (const answer of [undefined, null, 'oui', 1, {}]) {
    const { policy } = setup([answer]);
    assert.equal(await requestPermission(policy, 'media', 'https://meet.example.com'), false, String(answer));
  }
});

test('request : une boîte de dialogue en erreur refuse sans rien mémoriser', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { policy, store } = setup([new Error('fenêtre détruite')]);

  assert.equal(await requestPermission(policy, 'media', 'https://meet.example.com'), false);
  assert.deepEqual(store.list(), []);
});

test('request : après une erreur, une nouvelle demande peut être posée', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { policy, asked } = setup([new Error('boum'), true]);

  assert.equal(await requestPermission(policy, 'media', 'https://meet.example.com'), false);
  assert.equal(await requestPermission(policy, 'media', 'https://meet.example.com'), true);
  assert.equal(asked.length, 2);
});
