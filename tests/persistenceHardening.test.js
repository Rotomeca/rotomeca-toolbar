const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JsonFileStore } = require('../dist/src/main/persistence/JsonFileStore.js');
const { readStoredApps } = require('../dist/src/main/apps/storedApps.js');
const { AppListService } = require('../dist/src/main/apps/AppListService.js');
const { migrateLegacyData } = require('../dist/src/scripts/Persistence.js');

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'persist-'));
const app = (url, extra = {}) => ({ name: url, url, picture: null, ...extra });

// #region readStoredApps : une liste saine est conservée à l'identique

test('readStoredApps : une liste saine est conservée telle quelle, sans réparation signalée', () => {
  const saved = [
    app('https://a.test/'),
    'separator',
    { name: 'B', url: 'https://b.test/', picture: 'font:home' },
    { name: 'C', url: 'http://c.test/', picture: 'data:image/png;base64,AAAA', futurChamp: { x: 1 } },
    { name: 'D', url: 'https://d.test/' },
  ];
  const { list, repaired } = readStoredApps(JSON.parse(JSON.stringify(saved)));

  assert.deepEqual(list, saved);
  assert.equal(repaired, false);
});

test('readStoredApps : une adresse déjà enregistrée avec un espace reste utilisable (aucune perte)', () => {
  const { list, repaired } = readStoredApps([app(' https://ancienne.test/ ')]);
  assert.equal(list.length, 1);
  assert.equal(repaired, false);
});

test('readStoredApps : une icône http(s) enregistrée par une ancienne version est conservée', () => {
  const entry = { name: 'X', url: 'https://x.test/', picture: 'https://x.test/favicon.png' };
  assert.deepEqual(readStoredApps([entry]).list, [entry]);
});

// #endregion

// #region readStoredApps : réparation tolérante

test('readStoredApps : une entrée inutilisable est écartée, les autres restent', () => {
  const { list, repaired } = readStoredApps([
    app('https://a.test/'),
    null,
    42,
    { name: 'sans url' },
    app('javascript:alert(1)'),
    app('file:///C:/x'),
    'separator',
    app('https://b.test/'),
  ]);

  assert.deepEqual(
    list.map((entry) => (entry === 'separator' ? '-' : entry.url)),
    ['https://a.test/', '-', 'https://b.test/'],
  );
  assert.equal(repaired, true);
});

test('readStoredApps : une icône invalide devient null, un nom absent devient l\'adresse', () => {
  const { list, repaired } = readStoredApps([
    { name: 'A', url: 'https://a.test/', picture: 'font:a b' },
    { name: 'B', url: 'https://b.test/', picture: 'C:\\icone.png' },
    { name: 'C', url: 'https://c.test/', picture: 42 },
    { name: '  ', url: 'https://d.test/', picture: null },
    { url: 'https://e.test/' },
  ]);

  assert.deepEqual(
    list.map((entry) => entry.picture ?? null),
    [null, null, null, null, null],
  );
  assert.equal(list[3].name, 'https://d.test/');
  assert.equal(list[4].name, 'https://e.test/');
  assert.equal(repaired, true);
});

test('readStoredApps : ce qui n\'est pas une liste donne une liste vide, signalée comme réparée', () => {
  for (const data of [{}, 42, 'texte', null]) {
    assert.deepEqual(readStoredApps(data), { list: [], repaired: true }, JSON.stringify(data));
  }
});

test('readStoredApps : un champ __proto__ du fichier ne pollue rien', () => {
  const data = JSON.parse('[{"name":"A","url":"https://a.test/","picture":null,"__proto__":{"polluted":true}}]');
  const { list } = readStoredApps(data);

  assert.equal(list.length, 1);
  assert.equal({}.polluted, undefined);
  assert.equal(list[0].polluted, undefined);
});

// #endregion

// #region AppListService : copie de sécurité avant réparation

const noToolbar = { appAdded() {}, appInserted() {}, appUpdated() {}, appDeleted() {}, separatorDeleted() {}, appMoved() {} };

function serviceWith(stored) {
  const copies = [];
  const service = new AppListService({
    repository: { loadAsync: async () => stored, save: () => {}, keepCopy: () => copies.push('copie') },
    toolbar: noToolbar,
    onSaveError() {},
  });
  return { service, copies };
}

test('AppListService.load : un fichier réparé est d\'abord copié à part', async () => {
  const { service, copies } = serviceWith([app('https://a.test/'), { name: 'cassée' }]);
  await service.load();

  assert.deepEqual(copies, ['copie']);
  assert.equal(service.entries.length, 1);
});

test('AppListService.load : un fichier sain n\'est pas copié', async () => {
  const { service, copies } = serviceWith([app('https://a.test/'), 'separator']);
  await service.load();

  assert.deepEqual(copies, []);
});

test('AppListService.load : une copie impossible n\'empêche pas le chargement', async () => {
  const service = new AppListService({
    repository: {
      loadAsync: async () => [{ name: 'cassée' }],
      save: () => {},
      keepCopy: () => {
        throw new Error('disque plein');
      },
    },
    toolbar: noToolbar,
    onSaveError() {},
  });

  assert.equal(await service.load(), true);
});

// #endregion

// #region JsonFileStore

test('keepCopy : copie le fichier tel quel dans <fichier>.<label>, sans le toucher', () => {
  const store = new JsonFileStore(tempDir(), 'a.json');
  store.save([1, 2, 3]);
  store.keepCopy('invalid');

  assert.equal(fs.readFileSync(`${store.path}.invalid`, 'utf8'), '[1,2,3]');
  assert.deepEqual(store.load(), [1, 2, 3]);
});

test('keepCopy : sans fichier, ne fait rien', () => {
  const dir = tempDir();
  new JsonFileStore(dir, 'a.json').keepCopy('invalid');
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('load : un fichier corrompu est mis de côté et la sauvegarde .bak est relue', () => {
  const store = new JsonFileStore(tempDir(), 'a.json', undefined, () => 9);
  store.save({ v: 1 });
  store.save({ v: 2 });
  fs.writeFileSync(store.path, '{coupé net');

  assert.deepEqual(store.load(), { v: 1 });
  assert.equal(fs.readFileSync(`${store.path}.corrupt-9`, 'utf8'), '{coupé net');
});

test('loadAsync : même repli sur la sauvegarde .bak', async () => {
  const store = new JsonFileStore(tempDir(), 'a.json', undefined, () => 9);
  store.save([1]);
  store.save([2]);
  fs.writeFileSync(store.path, '');

  assert.deepEqual(await store.loadAsync(), [1]);
});

test('load : un fichier absent n\'est jamais remplacé par la sauvegarde', () => {
  const store = new JsonFileStore(tempDir(), 'a.json');
  store.save({ v: 1 });
  store.save({ v: 2 });
  fs.rmSync(store.path);

  assert.equal(store.load(), false);
});

test('save : le fichier écrit est complet et relisible (écriture forcée sur disque)', () => {
  const store = new JsonFileStore(path.join(tempDir(), 'neuf'), 'a.json');
  const data = { liste: Array.from({ length: 1000 }, (_, i) => ({ i })) };
  store.save(data);

  assert.deepEqual(JSON.parse(fs.readFileSync(store.path, 'utf8')), data);
});

// #endregion

// #region migrateLegacyData

/** Dossiers d'une installation fictive : exécutable, dossier de lancement et dossier de données. */
function legacySetup(isPackaged) {
  const root = tempDir();
  const exeDir = path.join(root, 'install', 'app-1.0.0');
  const cwdDir = path.join(root, 'telechargements');
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(exeDir, { recursive: true });
  fs.mkdirSync(cwdDir, { recursive: true });

  const fakeApp = {
    isPackaged,
    getAppPath: () => path.join(exeDir, 'resources', 'app.asar'),
    getPath: () => path.join(exeDir, 'rotomeca.exe'),
  };
  return { exeDir, cwdDir, dataDir, fakeApp };
}

function runMigrationFrom(cwdDir, dataDir, fakeApp) {
  const before = process.cwd();
  process.chdir(cwdDir);
  try {
    migrateLegacyData(fakeApp, dataDir);
  } finally {
    process.chdir(before);
  }
}

test('migrateLegacyData : un fichier du dossier de lancement n\'est pas copié par l\'application installée', () => {
  const { cwdDir, dataDir, fakeApp } = legacySetup(true);
  const hostile = { version: 1, decisions: [{ origin: 'https://evil.test', permission: 'media', allowed: true }] };
  fs.writeFileSync(path.join(cwdDir, 'permissions.rcft'), JSON.stringify(hostile));
  fs.writeFileSync(path.join(cwdDir, 'data.rsft'), '[]');

  runMigrationFrom(cwdDir, dataDir, fakeApp);

  assert.equal(fs.existsSync(path.join(dataDir, 'permissions.rcft')), false);
  assert.equal(fs.existsSync(path.join(dataDir, 'data.rsft')), false);
});

test('migrateLegacyData : les données de l\'ancienne installation (dossier de l\'exécutable) sont toujours reprises', () => {
  const { exeDir, cwdDir, dataDir, fakeApp } = legacySetup(true);
  fs.writeFileSync(path.join(exeDir, 'data.rsft'), JSON.stringify([app('https://a.test/')]));
  fs.writeFileSync(path.join(exeDir, 'settings.rcft'), JSON.stringify({ theme: 'system' }));

  runMigrationFrom(cwdDir, dataDir, fakeApp);

  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'data.rsft'), 'utf8')), [app('https://a.test/')]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.rcft'), 'utf8')), { theme: 'system' });
});

test('migrateLegacyData : un fichier de mauvaise forme ou illisible n\'est pas copié', () => {
  const { exeDir, cwdDir, dataDir, fakeApp } = legacySetup(true);
  fs.writeFileSync(path.join(exeDir, 'data.rsft'), '{"pas":"une liste"}');
  fs.writeFileSync(path.join(exeDir, 'settings.rcft'), '[1,2]');
  fs.writeFileSync(path.join(exeDir, 'permissions.rcft'), '{coupé');

  runMigrationFrom(cwdDir, dataDir, fakeApp);

  for (const file of ['data.rsft', 'settings.rcft', 'permissions.rcft']) {
    assert.equal(fs.existsSync(path.join(dataDir, file)), false, file);
  }
});

test('migrateLegacyData : en développement, le dossier de lancement reste une source', () => {
  const { cwdDir, dataDir, fakeApp } = legacySetup(false);
  fs.writeFileSync(path.join(cwdDir, 'data.rsft'), '[]');

  runMigrationFrom(cwdDir, dataDir, fakeApp);

  assert.equal(fs.existsSync(path.join(dataDir, 'data.rsft')), true);
});

test('migrateLegacyData : un fichier de données existant n\'est jamais remplacé', () => {
  const { exeDir, cwdDir, dataDir, fakeApp } = legacySetup(true);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'data.rsft'), '["actuel"]');
  fs.writeFileSync(path.join(exeDir, 'data.rsft'), '["ancien"]');

  runMigrationFrom(cwdDir, dataDir, fakeApp);

  assert.equal(fs.readFileSync(path.join(dataDir, 'data.rsft'), 'utf8'), '["actuel"]');
});

// #endregion
