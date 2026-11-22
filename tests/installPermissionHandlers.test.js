const test = require('node:test');
const assert = require('node:assert/strict');
const { installPermissionHandlers } = require('../dist/src/main/permissions/installPermissionHandlers.js');
const { PermissionStore } = require('../dist/src/scripts/PermissionStore.js');
const { isSafeUrl } = require('../dist/src/scripts/safeUrl.js');

function fakeSession() {
  const session = {
    check: null,
    request: null,
    setPermissionCheckHandler: (handler) => (session.check = handler),
    setPermissionRequestHandler: (handler) => (session.request = handler),
  };
  return session;
}

const memoryStore = () => new PermissionStore({ load: () => false, save: () => {} });

function setup(answer = true) {
  const session = fakeSession();
  const asked = [];
  installPermissionHandlers(session, {
    store: memoryStore(),
    isSafeUrl,
    ask: async (origin, permission) => {
      asked.push(`${origin}|${permission}`);
      return answer;
    },
  });
  return { session, asked };
}

const request = (session, permission, url) =>
  new Promise((resolve) => session.request(null, permission, resolve, { requestingUrl: url }));

test('installPermissionHandlers : installe les deux gestionnaires sur la session', () => {
  const { session } = setup();
  assert.equal(typeof session.check, 'function');
  assert.equal(typeof session.request, 'function');
});

test('installPermissionHandlers : les permissions sûres sont accordées sans question', async () => {
  const { session, asked } = setup();

  assert.equal(session.check(null, 'notifications', 'https://x.test'), true);
  assert.equal(await request(session, 'mediaKeySystem', 'https://x.test'), true);
  assert.deepEqual(asked, []);
});

test('installPermissionHandlers : les permissions inconnues sont refusées', async () => {
  const { session, asked } = setup();

  assert.equal(session.check(null, 'usb', 'https://x.test'), false);
  assert.equal(await request(session, 'usb', 'https://x.test'), false);
  assert.deepEqual(asked, []);
});

test('installPermissionHandlers : caméra/micro demandent confirmation, puis la réponse est mémorisée', async () => {
  const { session, asked } = setup(true);

  assert.equal(session.check(null, 'media', 'https://meet.example.com'), false, 'refusé avant la première demande');
  assert.equal(await request(session, 'media', 'https://meet.example.com'), true);
  assert.equal(session.check(null, 'media', 'https://meet.example.com'), true, 'accordé ensuite');
  assert.equal(await request(session, 'media', 'https://meet.example.com'), true);
  assert.deepEqual(asked, ['https://meet.example.com|media'], 'une seule question');
});

test('installPermissionHandlers : un refus est mémorisé aussi', async () => {
  const { session, asked } = setup(false);

  assert.equal(await request(session, 'geolocation', 'https://maps.example.com'), false);
  assert.equal(await request(session, 'geolocation', 'https://maps.example.com'), false);
  assert.deepEqual(asked, ['https://maps.example.com|geolocation']);
});

test('installPermissionHandlers : une origine qui n\'est pas http(s) est refusée sans question', async () => {
  const { session, asked } = setup(true);

  assert.equal(await request(session, 'media', 'file:///C:/page.html'), false);
  assert.deepEqual(asked, []);
});
