const test = require('node:test');
const assert = require('node:assert/strict');
const { IpcRouter } = require('../dist/src/main/ipc/IpcRouter.js');
const { ThemeService } = require('../dist/src/main/theming/ThemeService.js');
const { Settings } = require('../dist/src/main/settings/Settings.js');

// #region IpcRouter

function fakeIpc() {
  const handlers = new Map();
  return { handlers, handle: (channel, listener) => handlers.set(channel, listener) };
}

const origin = (url, same = true) => {
  const mainFrame = { url };
  return { senderFrame: same ? mainFrame : { url }, sender: { mainFrame } };
};

test('IpcRouter : un appel de la page principale locale est traité avec ses arguments', () => {
  const ipc = fakeIpc();
  new IpcRouter(ipc).handle('canal', (_, a, b) => `${a}+${b}`);
  assert.equal(ipc.handlers.get('canal')(origin('file:///app/index.html'), 1, 2), '1+2');
});

test('IpcRouter : un site distant est refusé, signalé, et le traitement n\'est pas appelé', () => {
  const ipc = fakeIpc();
  const warnings = [];
  let called = false;
  new IpcRouter(ipc, (message, url) => warnings.push([message, url])).handle('canal', () => { called = true; });
  assert.equal(ipc.handlers.get('canal')(origin('https://exemple.fr')), undefined);
  assert.equal(called, false);
  assert.deepEqual(warnings, [["IPC 'canal' refusé depuis", 'https://exemple.fr']]);
});

test('IpcRouter : un sous-cadre local est refusé', () => {
  const ipc = fakeIpc();
  let called = false;
  new IpcRouter(ipc, () => {}).handle('canal', () => { called = true; });
  ipc.handlers.get('canal')(origin('file:///app/index.html', false));
  assert.equal(called, false);
});

test('IpcRouter : handle se chaîne', () => {
  const ipc = fakeIpc();
  new IpcRouter(ipc).handle('a', () => 1).handle('b', () => 2);
  assert.deepEqual([...ipc.handlers.keys()], ['a', 'b']);
});

test('IpcRouter : une erreur du traitement remonte à l\'appelant', () => {
  const ipc = fakeIpc();
  new IpcRouter(ipc).handle('canal', () => { throw new Error('échec'); });
  assert.throws(() => ipc.handlers.get('canal')(origin('file:///x.html')), /échec/);
});

// #endregion

// #region ThemeService

function themeSetup(stored = {}) {
  const store = { path: 'p', load: () => stored, save() {} };
  let season = 'hiver';
  const settings = new Settings(store, () => season);
  const env = {
    dark: false, contents: [], createdListener: null, systemListener: null, resumeListener: null, tick: null,
    systemIsDark: () => env.dark,
    allContents: () => env.contents,
    onContentsCreated: (l) => { env.createdListener = l; },
    onSystemThemeChanged: (l) => { env.systemListener = l; },
    onResume: (l) => { env.resumeListener = l; },
    every: (ms, cb) => { env.tick = { ms, cb }; },
  };
  const service = new ThemeService(settings, env);
  return { service, settings, env, setSeason: (s) => { season = s; } };
}

const page = (url, { destroyed = false } = {}) => {
  const p = { url, scripts: [], listeners: {}, destroyed };
  p.isDestroyed = () => p.destroyed;
  p.getURL = () => p.url;
  p.executeJavaScript = (script) => { p.scripts.push(script); return Promise.resolve(); };
  p.on = (event, listener) => { p.listeners[event] = listener; };
  return p;
};

test('ThemeService : le script suit les réglages et le mode du système', () => {
  const { service, env } = themeSetup({ theme: 'system' });
  assert.match(service.script, /dataset\.theme = "light"/);
  env.dark = true;
  assert.match(service.script, /dataset\.theme = "dark"/);
});

test('ThemeService : broadcast applique le thème aux pages locales vivantes seulement', () => {
  const { service, env } = themeSetup({ theme: 'sombre' });
  const local = page('file:///a.html');
  const remote = page('https://site.test/');
  const dead = page('file:///b.html', { destroyed: true });
  env.contents = [local, remote, dead];
  service.broadcast();
  assert.equal(local.scripts.length, 1);
  assert.equal(remote.scripts.length, 0);
  assert.equal(dead.scripts.length, 0);
});

test('ThemeService : start applique le thème à chaque nouvelle page locale, une fois chargée', () => {
  const { service, env } = themeSetup({ theme: 'sombre' });
  service.start();
  const local = page('file:///a.html');
  const remote = page('https://site.test/');
  env.createdListener(local);
  env.createdListener(remote);
  local.listeners['dom-ready']();
  remote.listeners['dom-ready']();
  assert.equal(local.scripts.length, 1);
  assert.equal(remote.scripts.length, 0);
});

test('ThemeService : un changement du mode du système rediffuse', () => {
  const { service, env } = themeSetup({ theme: 'system' });
  const local = page('file:///a.html');
  env.contents = [local];
  service.start();
  env.systemListener();
  assert.equal(local.scripts.length, 1);
});

test('ThemeService : la saison n\'est réévaluée que chaque minute et au réveil, et ne rediffuse que si elle change', () => {
  const { service, settings, env, setSeason } = themeSetup({ themeAuto: true });
  const local = page('file:///a.html');
  env.contents = [local];
  service.start();
  assert.equal(env.tick.ms, 60000);
  assert.equal(settings.effectiveTheme, 'hiver');

  env.tick.cb();
  env.resumeListener();
  assert.equal(local.scripts.length, 0, 'saison inchangée');

  setSeason('printemps');
  env.tick.cb();
  assert.equal(local.scripts.length, 1);
  assert.match(local.scripts[0], /palette = "printemps"/);

  env.resumeListener();
  assert.equal(local.scripts.length, 1, 'déjà diffusé');
});

// #endregion
