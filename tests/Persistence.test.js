const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  pinUserData,
  backupUserData,
  restoreFromBackup,
  keepLoginsAlive,
} = require('../src/scripts/Persistence.js');

const YEAR_SECONDS = 60 * 60 * 24 * 365;

function tmpDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rotomeca-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const fakeApp = (version = '3.2.0') => ({ getVersion: () => version });

test('pinUserData : dossier fixe en production, isolé en développement', () => {
  const paths = {};
  const app = (isPackaged) => ({
    isPackaged,
    getPath: () => path.join('C:', 'AppData'),
    setPath: (name, value) => (paths[name] = value),
  });

  pinUserData(app(true));
  assert.equal(paths.userData, path.join('C:', 'AppData', 'rotomecatoolbar'));

  pinUserData(app(false));
  assert.equal(paths.userData, path.join('C:', 'AppData', 'rotomecatoolbar-dev'));
});

test('backupUserData : copie les fichiers de données dans backups/', (t) => {
  const dir = tmpDir(t);
  fs.writeFileSync(path.join(dir, 'data.rsft'), 'apps');
  fs.writeFileSync(path.join(dir, 'settings.rcft'), 'reglages');

  backupUserData(fakeApp('3.2.0'), dir);

  const backups = fs.readdirSync(path.join(dir, 'backups'));
  assert.equal(backups.length, 1);
  assert.match(backups[0], /^3\.2\.0-\d+$/);
  const copy = path.join(dir, 'backups', backups[0]);
  assert.equal(fs.readFileSync(path.join(copy, 'data.rsft'), 'utf8'), 'apps');
  assert.equal(fs.readFileSync(path.join(copy, 'settings.rcft'), 'utf8'), 'reglages');
  // Les données actives ne sont jamais touchées
  assert.equal(fs.readFileSync(path.join(dir, 'data.rsft'), 'utf8'), 'apps');
});

test('backupUserData : rien à sauvegarder → aucun dossier créé', (t) => {
  const dir = tmpDir(t);
  backupUserData(fakeApp(), dir);
  assert.equal(fs.existsSync(path.join(dir, 'backups')), false);
});

test('backupUserData : ne garde que les 5 sauvegardes les plus récentes', (t) => {
  const dir = tmpDir(t);
  fs.writeFileSync(path.join(dir, 'data.rsft'), 'apps');

  const root = path.join(dir, 'backups');
  const now = Date.now() / 1000;
  for (let i = 0; i < 7; ++i) {
    const old = path.join(root, `old-${i}`);
    fs.mkdirSync(old, { recursive: true });
    // old-0 est le plus ancien, old-6 le plus récent
    const when = now - (7 - i) * 3600;
    fs.utimesSync(old, when, when);
  }

  backupUserData(fakeApp('3.2.0'), dir);

  const remaining = fs.readdirSync(root);
  assert.equal(remaining.length, 5);
  assert.ok(remaining.some((name) => name.startsWith('3.2.0-')), 'la nouvelle est gardée');
  assert.ok(!remaining.includes('old-0'));
  assert.ok(!remaining.includes('old-1'));
  assert.ok(!remaining.includes('old-2'));
});

test('restoreFromBackup : restaure un fichier absent depuis la sauvegarde la plus récente', (t) => {
  const dir = tmpDir(t);
  const root = path.join(dir, 'backups');
  const now = Date.now() / 1000;
  for (const [name, content, age] of [
    ['ancienne', 'v-ancienne', 7200],
    ['recente', 'v-recente', 60],
  ]) {
    fs.mkdirSync(path.join(root, name), { recursive: true });
    fs.writeFileSync(path.join(root, name, 'data.rsft'), content);
    fs.utimesSync(path.join(root, name), now - age, now - age);
  }

  restoreFromBackup(dir);
  assert.equal(fs.readFileSync(path.join(dir, 'data.rsft'), 'utf8'), 'v-recente');
});

test('restoreFromBackup : n\'écrase jamais un fichier existant', (t) => {
  const dir = tmpDir(t);
  fs.writeFileSync(path.join(dir, 'data.rsft'), 'actuel');
  fs.mkdirSync(path.join(dir, 'backups', 'b'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'backups', 'b', 'data.rsft'), 'sauvegarde');

  restoreFromBackup(dir);
  assert.equal(fs.readFileSync(path.join(dir, 'data.rsft'), 'utf8'), 'actuel');
});

test('restoreFromBackup : sans dossier de sauvegarde, ne lève pas', (t) => {
  const dir = tmpDir(t);
  assert.doesNotThrow(() => restoreFromBackup(dir));
});

/** Fausse session : mémorise les cookies posés et permet d'émettre « changed ». */
function fakeSession(initialCookies = []) {
  const listeners = [];
  const set = [];
  return {
    set,
    emitChanged: (cookie, removed = false) =>
      listeners.forEach((fn) => fn({}, cookie, 'explicit', removed)),
    cookies: {
      on: (event, fn) => event === 'changed' && listeners.push(fn),
      get: async () => initialCookies,
      set: async (details) => set.push(details),
      flushStore: () => {},
    },
    flushStorageData: () => {},
  };
}

const sessionCookie = (overrides = {}) => ({
  name: 'SID',
  value: 'secret',
  domain: '.example.com',
  path: '/',
  secure: true,
  httpOnly: true,
  sameSite: 'lax',
  session: true,
  ...overrides,
});

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

test('keepLoginsAlive : rend persistants les cookies de session existants (1 an)', async () => {
  const before = Math.floor(Date.now() / 1000);
  const session = fakeSession([
    sessionCookie(),
    sessionCookie({ name: 'PERSISTANT', session: false, expirationDate: before + 10 }),
  ]);

  keepLoginsAlive(session);
  await flushPromises();

  assert.equal(session.set.length, 1);
  const [cookie] = session.set;
  assert.equal(cookie.name, 'SID');
  assert.equal(cookie.url, 'https://example.com/');
  assert.ok(cookie.expirationDate >= before + YEAR_SECONDS);
  assert.ok(cookie.expirationDate <= before + YEAR_SECONDS + 5);
  assert.equal(cookie.secure, true);
  assert.equal(cookie.httpOnly, true);
});

test('keepLoginsAlive : un cookie non sécurisé utilise http', async () => {
  const session = fakeSession([sessionCookie({ secure: false, path: '/app' })]);
  keepLoginsAlive(session);
  await flushPromises();
  assert.equal(session.set[0].url, 'http://example.com/app');
});

test('keepLoginsAlive : les nouveaux cookies de session sont persistés, pas les suppressions', async () => {
  const session = fakeSession();
  keepLoginsAlive(session);
  await flushPromises();

  session.emitChanged(sessionCookie({ name: 'NOUVEAU' }));
  session.emitChanged(sessionCookie({ name: 'SUPPRIME' }), true);
  session.emitChanged(sessionCookie({ name: 'DEJA_PERSISTANT', session: false }));
  await flushPromises();

  assert.deepEqual(session.set.map((c) => c.name), ['NOUVEAU']);
});
