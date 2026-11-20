const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JsonFileStore, dataDirectory } = require('../dist/src/main/persistence/JsonFileStore.js');

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'store-'));

test('save puis load : relit ce qui a été écrit, dossier créé au besoin', () => {
  const dir = path.join(tempDir(), 'sous', 'dossier');
  const store = new JsonFileStore(dir, 'a.json');
  store.save({ x: 1 });
  assert.deepEqual(store.load(), { x: 1 });
  assert.equal(fs.existsSync(`${store.path}.tmp`), false);
});

test('save : conserve une copie .bak de la version précédente', () => {
  const store = new JsonFileStore(tempDir(), 'a.json');
  store.save({ v: 1 });
  store.save({ v: 2 });
  assert.deepEqual(JSON.parse(fs.readFileSync(`${store.path}.bak`, 'utf8')), { v: 1 });
  assert.deepEqual(store.load(), { v: 2 });
});

test('load : false si le fichier est absent, sans quarantaine', () => {
  const dir = tempDir();
  assert.equal(new JsonFileStore(dir, 'absent.json').load(), false);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('load : un JSON invalide est mis en quarantaine, jamais écrasé', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'a.json'), '{pas du json');
  const store = new JsonFileStore(dir, 'a.json', undefined, () => 42);
  assert.equal(store.load(), false);
  assert.equal(fs.existsSync(store.path), false);
  assert.equal(fs.readFileSync(`${store.path}.corrupt-42`, 'utf8'), '{pas du json');
});

test('loadAsync : mêmes règles que load', async () => {
  const dir = tempDir();
  const store = new JsonFileStore(dir, 'a.json', undefined, () => 7);
  assert.equal(await store.loadAsync(), false);
  store.save([1, 2]);
  assert.deepEqual(await store.loadAsync(), [1, 2]);
  fs.writeFileSync(store.path, 'oups');
  assert.equal(await store.loadAsync(), false);
  assert.ok(fs.existsSync(`${store.path}.corrupt-7`));
});

test('une erreur de lecture qui n\'est pas du JSON invalide ne met rien en quarantaine', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'a.json'), '{"ok":true}');
  const files = {
    existsSync: () => true,
    renameSync: () => { throw new Error('ne doit pas être appelé'); },
    readFileSync: () => { throw Object.assign(new Error('verrouillé'), { code: 'EBUSY' }); },
  };
  assert.equal(new JsonFileStore(dir, 'a.json', files).load(), false);
});

test('dataDirectory : AppData/Roaming sous Windows s\'il existe, sinon le dossier personnel', () => {
  const exists = (value) => ({ existsSync: () => value });
  assert.equal(dataDirectory('win32', '/h', exists(true)), path.join('/h', 'AppData', 'Roaming', '.rotomeca-toolbar-data'));
  assert.equal(dataDirectory('win32', '/h', exists(false)), path.join('/h', '.rotomeca-toolbar-data'));
  assert.equal(dataDirectory('linux', '/h', exists(true)), path.join('/h', '.rotomeca-toolbar-data'));
});
