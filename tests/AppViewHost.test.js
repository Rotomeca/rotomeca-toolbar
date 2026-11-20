const test = require('node:test');
const assert = require('node:assert/strict');
const { AppViewHost } = require('../dist/src/main/apps/AppViewHost.js');
const { isSafeUrl } = require('../dist/src/scripts/safeUrl.js');

let nextId = 1;
function fakeView() {
  const listeners = {};
  const view = {
    visible: null, bounds: null, calls: [],
    setVisible: (v) => { view.visible = v; },
    setBounds: (b) => { view.bounds = b; },
    webContents: {
      id: nextId++, destroyed: false, muted: null, loaded: null, sent: [],
      isDestroyed: () => view.webContents.destroyed,
      stop: () => view.calls.push('stop'),
      close: () => view.calls.push('close'),
      destroy: () => view.calls.push('destroy'),
      reload: () => view.calls.push('reload'),
      setAudioMuted: (m) => { view.webContents.muted = m; },
      send: (...args) => view.webContents.sent.push(args),
      loadURL: (url) => { view.webContents.loaded = url; return Promise.resolve(); },
      on: (event, listener) => { listeners[event] = listener; },
    },
    listeners,
  };
  return view;
}

function setup() {
  const surface = {
    bounds: { x: 0, y: 0, width: 600, height: 800 }, shown: 0, hidden: 0, children: [], opened: [],
    getBounds: () => surface.bounds,
    show: () => { surface.shown++; },
    hide: () => { surface.hidden++; },
    addChildView: (v) => surface.children.push(v),
    removeChildView: (v) => { surface.children = surface.children.filter((c) => c !== v); },
    announceOpened: (url) => surface.opened.push(url),
  };
  const created = [];
  const changes = [];
  const host = new AppViewHost({
    surface, isSafeUrl, headerHeight: 32, mediaActionChannel: 'media-action',
    createView: () => { const v = fakeView(); created.push(v); return v; },
    onChange: (url) => changes.push(url),
  });
  return { host, surface, created, changes };
}

const A = 'https://a.test/';
const B = 'https://b.test/';
const song = { duration: 100, position: 10, title: 'T', artist: 'A', artwork: null, playing: false, actions: ['play'] };

test('open : crée la vue sous l\'en-tête, charge le site, l\'affiche et l\'annonce', () => {
  const { host, surface, created } = setup();
  host.open(A);
  assert.equal(created.length, 1);
  assert.deepEqual(created[0].bounds, { x: 0, y: 32, width: 600, height: 768 });
  assert.equal(created[0].webContents.loaded, A);
  assert.equal(created[0].visible, true);
  assert.deepEqual(surface.children, created);
  assert.equal(surface.shown, 1);
  assert.deepEqual(surface.opened, [A]);
  assert.equal(host.lastOpened, A);
  assert.equal(host.entry(A).visible, true);
});

test('open : une application déjà ouverte est réaffichée, sans nouvelle vue', () => {
  const { host, created } = setup();
  host.open(A);
  host.hide(A);
  host.open(A);
  assert.equal(created.length, 1);
  assert.equal(created[0].visible, true);
});

test('open : une adresse dangereuse ou invalide est refusée', () => {
  const { host, created } = setup();
  for (const bad of ['javascript:alert(1)', 'file:///c', '', 42, null, undefined]) host.open(bad);
  assert.equal(created.length, 0);
  assert.equal(host.lastOpened, null);
});

test('open : la hauteur de la vue ne devient jamais négative', () => {
  const { host, surface, created } = setup();
  surface.bounds = { x: 0, y: 0, width: 600, height: 10 };
  host.open(A);
  assert.equal(created[0].bounds.height, 0);
});

test('open : un site dont le son était coupé démarre muet', () => {
  const { host, created } = setup();
  host.toggleMute(A);
  host.open(A);
  assert.equal(created[0].webContents.muted, true);
});

test('hide : la fenêtre ne se ferme que quand plus aucune application n\'est visible', () => {
  const { host, surface } = setup();
  host.open(A);
  host.open(B);
  host.hide(A);
  assert.equal(surface.hidden, 0);
  host.hide(B);
  assert.equal(surface.hidden, 1);
});

test('discard : détruit la vue, la retire de la fenêtre et le signale', () => {
  const { host, surface, created, changes } = setup();
  host.open(A);
  host.discard(A);
  assert.deepEqual(created[0].calls, ['stop', 'close', 'destroy']);
  assert.equal(surface.children.length, 0);
  assert.equal(host.entry(A), undefined);
  assert.deepEqual(changes, [A]);
});

test('discard : une application inconnue ne fait rien', () => {
  const { host, changes } = setup();
  host.discard(A);
  assert.deepEqual(changes, []);
});

test('reload : recharge la page de l\'application', () => {
  const { host, created } = setup();
  host.open(A);
  host.reload(A);
  host.reload(B);
  assert.deepEqual(created[0].calls, ['reload']);
});

test('toggleMute : bascule, applique à la vue ouverte et le signale', () => {
  const { host, created, changes } = setup();
  host.open(A);
  host.toggleMute(A);
  assert.equal(host.isMuted(A), true);
  assert.equal(created[0].webContents.muted, true);
  host.toggleMute(A);
  assert.equal(host.isMuted(A), false);
  assert.equal(created[0].webContents.muted, false);
  assert.deepEqual(changes, [A, A]);
});

test('toggleMute : le réglage survit à la fermeture de la vue', () => {
  const { host } = setup();
  host.open(A);
  host.toggleMute(A);
  host.discard(A);
  assert.equal(host.isMuted(A), true);
  assert.deepEqual(host.knownUrls(), [A]);
});

test('toggleMute : une adresse invalide est ignorée', () => {
  const { host, changes } = setup();
  host.toggleMute('nimporte quoi');
  host.toggleMute(undefined);
  assert.deepEqual(changes, []);
});

test('update : enregistre les non-lus et le son, et le signale', () => {
  const { host, changes } = setup();
  host.open(A);
  host.update(A, { badge: 3 });
  host.update(A, { audible: true });
  assert.equal(host.entry(A).badge, 3);
  assert.equal(host.entry(A).audible, true);
  assert.deepEqual(changes, [A, A]);
});

test('update : un morceau est enregistré puis effacé par null', () => {
  const { host } = setup();
  host.open(A);
  host.update(A, { media: song });
  assert.deepEqual(host.playingUrls(), [A]);
  host.update(A, { media: null });
  assert.deepEqual(host.playingUrls(), []);
});

test('update : une application inconnue ne fait rien', () => {
  const { host, changes } = setup();
  host.update(A, { badge: 1 });
  assert.deepEqual(changes, []);
});

test('le titre de la page donne les non-lus, l\'état audio donne le son', () => {
  const { host, created } = setup();
  host.open(A);
  created[0].listeners['page-title-updated']({}, '(5) Boîte de réception');
  assert.equal(host.entry(A).badge, 5);
  created[0].listeners['audio-state-changed']({ audible: true });
  assert.equal(host.entry(A).audible, true);
});

test('playingUrls : dans l\'ordre d\'ouverture', () => {
  const { host } = setup();
  host.open(A);
  host.open(B);
  host.update(B, { media: song });
  host.update(A, { media: song });
  assert.deepEqual(host.playingUrls(), [A, B]);
});

test('urlOfWebContents : retrouve l\'application, ignore les pages détruites', () => {
  const { host, created } = setup();
  host.open(A);
  assert.equal(host.urlOfWebContents(created[0].webContents.id), A);
  assert.equal(host.urlOfWebContents(99999), undefined);
  created[0].webContents.destroyed = true;
  assert.equal(host.urlOfWebContents(created[0].webContents.id), undefined);
});

test('controlMedia : envoie la commande au site', () => {
  const { host, created } = setup();
  host.open(A);
  host.update(A, { media: song });
  assert.equal(host.controlMedia(A, 'nexttrack'), true);
  assert.deepEqual(created[0].webContents.sent, [['media-action', 'nexttrack']]);
});

test('controlMedia : lecture et pause sont reflétées tout de suite', () => {
  const { host, changes } = setup();
  host.open(A);
  host.update(A, { media: song });
  changes.length = 0;
  host.controlMedia(A, 'play');
  assert.equal(host.entry(A).media.playing, true);
  assert.deepEqual(changes, [A]);
  host.controlMedia(A, 'pause');
  assert.equal(host.entry(A).media.playing, false);
  assert.equal(song.playing, false, 'le morceau d\'origine n\'est pas modifié');
});

test('controlMedia : refuse sans morceau, action inconnue ou application inconnue', () => {
  const { host, created } = setup();
  host.open(A);
  assert.equal(host.controlMedia(A, 'play'), false);
  host.update(A, { media: song });
  assert.equal(host.controlMedia(A, 'format-disk'), false);
  assert.equal(host.controlMedia(B, 'play'), false);
  assert.equal(host.controlMedia(undefined, 'play'), false);
  assert.deepEqual(created[0].webContents.sent, []);
});
