const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { IpcRouter } = require('../dist/src/main/ipc/IpcRouter.js');
const { isChannelAllowed, pagesAllowedFor, restrictedChannels } = require('../dist/src/main/ipc/channelAccess.js');

// Les canaux sont dans un module ES : chargé par import()
const loadEvents = () => import(pathToFileURL(path.join(__dirname, '..', 'dist', 'src', 'shared', 'ipc', 'events.js')).href);

const APP_ROOT = path.resolve('app-root');
const pageUrl = (file) => pathToFileURL(path.join(APP_ROOT, file)).href;

test('channelAccess : la table couvre exactement les canaux des pages, sauf le menu contextuel', async () => {
  const { appEventList } = await loadEvents();
  const expected = Object.values(appEventList).filter((channel) => channel !== appEventList.rotomecaContextMenu);

  assert.deepEqual(restrictedChannels().sort(), expected.sort());
});

test('channelAccess : chaque canal a au moins une page autorisée', () => {
  for (const channel of restrictedChannels()) {
    assert.ok(pagesAllowedFor(channel).length > 0, channel);
  }
});

test('channelAccess : une page ne peut appeler que ses canaux', () => {
  assert.equal(isChannelAllowed('mediaControl', 'media'), true);
  assert.equal(isChannelAllowed('updateInstall', 'settings'), true);
  assert.equal(isChannelAllowed('openFrame', 'toolbar'), true);
  assert.equal(isChannelAllowed('setting.updated', 'settings'), true, 'canal dont le nom diffère de la valeur');
});

test('channelAccess : le lecteur média, l\'infobulle et le bord ne peuvent ni mettre à jour ni effacer les permissions', () => {
  for (const page of ['media', 'tooltip', 'edge', 'contextmenu', 'apps', 'add_dialog']) {
    for (const channel of ['updateInstall', 'updateInstallTest', 'permissionsClear', 'permissionRevoke', 'setting.updated']) {
      assert.equal(isChannelAllowed(channel, page), false, `${page} -> ${channel}`);
    }
  }
});

test('channelAccess : une page inconnue ou un canal inconnu est refusé', () => {
  assert.equal(isChannelAllowed('mediaControl', undefined), false);
  assert.equal(isChannelAllowed('canal-inexistant', 'toolbar'), false);
  assert.equal(isChannelAllowed('rotomeca-context-menu', 'toolbar'), false, 'contrôlé à part par le menu contextuel');
});

// #region IpcRouter

function fakeIpc() {
  const handlers = new Map();
  return { handlers, handle: (channel, listener) => handlers.set(channel, listener) };
}

const eventFrom = (webContentsId) => {
  const mainFrame = { url: pageUrl('index.html') };
  return { senderFrame: mainFrame, sender: { mainFrame, id: webContentsId } };
};

test('IpcRouter : un appel d\'une page locale mais non autorisée pour ce canal est refusé et signalé', () => {
  const ipc = fakeIpc();
  const warnings = [];
  let called = false;
  const pages = new Map([[7, 'media']]);
  new IpcRouter(ipc, APP_ROOT, (id) => pages.get(id), (message) => warnings.push(message)).handle('updateInstall', () => {
    called = true;
  });

  assert.equal(ipc.handlers.get('updateInstall')(eventFrom(7)), undefined);
  assert.equal(called, false);
  assert.deepEqual(warnings, ['IPC \'updateInstall\' refusé à la page \'media\'']);
});

test('IpcRouter : la page autorisée est traitée, une page non reconnue est refusée', () => {
  const ipc = fakeIpc();
  const pages = new Map([[1, 'settings']]);
  new IpcRouter(ipc, APP_ROOT, (id) => pages.get(id), () => {}).handle('updateInstall', () => 'installé');

  assert.equal(ipc.handlers.get('updateInstall')(eventFrom(1)), 'installé');
  assert.equal(ipc.handlers.get('updateInstall')(eventFrom(99)), undefined);
});

// #endregion
