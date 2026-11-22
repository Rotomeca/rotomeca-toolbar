const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { IpcRouter } = require('../dist/src/main/ipc/IpcRouter.js');
const { ThemeService } = require('../dist/src/main/theming/ThemeService.js');
const { Settings } = require('../dist/src/main/settings/Settings.js');

// #region IpcRouter

function fakeIpc() {
  const handlers = new Map();
  return { handlers, handle: (channel, listener) => handlers.set(channel, listener) };
}

const APP_ROOT = path.resolve('app-root');
const pageUrl = (file) => pathToFileURL(path.join(APP_ROOT, file)).href;

const origin = (url, same = true) => {
  const mainFrame = { url };
  return { senderFrame: same ? mainFrame : { url }, sender: { mainFrame, id: 1 } };
};

/** Toutes les fenêtres sont reconnues comme la barre : ces tests portent sur l'origine, pas sur les pages. */
const asToolbar = () => 'toolbar';

test('IpcRouter : un appel de la page principale locale est traité avec ses arguments', () => {
  const ipc = fakeIpc();
  new IpcRouter(ipc, APP_ROOT, asToolbar).handle('requestToggle', (_, a, b) => `${a}+${b}`);
  assert.equal(ipc.handlers.get('requestToggle')(origin(pageUrl('index.html')), 1, 2), '1+2');
});

test('IpcRouter : un site distant est refusé, signalé, et le traitement n\'est pas appelé', () => {
  const ipc = fakeIpc();
  const warnings = [];
  let called = false;
  new IpcRouter(ipc, APP_ROOT, asToolbar, (message, url) => warnings.push([message, url])).handle('requestToggle', () => { called = true; });
  assert.equal(ipc.handlers.get('requestToggle')(origin('https://exemple.fr')), undefined);
  assert.equal(called, false);
  assert.deepEqual(warnings, [['IPC \'requestToggle\' refusé depuis', 'https://exemple.fr']]);
});

test('IpcRouter : un sous-cadre local est refusé', () => {
  const ipc = fakeIpc();
  let called = false;
  new IpcRouter(ipc, APP_ROOT, asToolbar, () => {}).handle('requestToggle', () => { called = true; });
  ipc.handlers.get('requestToggle')(origin(pageUrl('index.html'), false));
  assert.equal(called, false);
});

test('IpcRouter : handle se chaîne', () => {
  const ipc = fakeIpc();
  new IpcRouter(ipc, APP_ROOT, asToolbar).handle('requestToggle', () => 1).handle('openSettings', () => 2);
  assert.deepEqual([...ipc.handlers.keys()], ['requestToggle', 'openSettings']);
});

test('IpcRouter : une erreur du traitement remonte à l\'appelant', () => {
  const ipc = fakeIpc();
  new IpcRouter(ipc, APP_ROOT, asToolbar).handle('requestToggle', () => { throw new Error('échec'); });
  assert.throws(() => ipc.handlers.get('requestToggle')(origin(pageUrl('x.html'))), /échec/);
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
    date: new Date(2026, 5, 15, 12),
    now: () => env.date,
    timers: [],
    after: (ms, cb) => {
      const timer = { ms, cb, cancelled: false };
      env.timers.push(timer);
      return () => { timer.cancelled = true; };
    },
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

test('ThemeService : pas de moment hors thème automatique, ni si « Moments et météo » est coupé', () => {
  const manual = themeSetup({ theme: 'sombre' });
  assert.match(manual.service.script, /delete h\.dataset\.moment/);

  const off = themeSetup({ themeAuto: true, momentsMeteo: false });
  assert.match(off.service.script, /delete h\.dataset\.moment/);

  const auto = themeSetup({ themeAuto: true });
  assert.match(auto.service.script, /h\.dataset\.moment = "jour"/);
});

test('ThemeService : le minuteur vise la prochaine frontière et rediffuse quand le moment change', () => {
  const { service, env } = themeSetup({ themeAuto: true });
  const local = page('file:///a.html');
  env.contents = [local];
  service.start();

  const [first] = env.timers;
  assert.equal(first.ms, 5 * 3600 * 1000, '12 h → 17 h');

  env.date = new Date(2026, 5, 15, 17);
  first.cb();
  assert.equal(local.scripts.length, 1);
  assert.match(local.scripts[0], /h\.dataset\.moment = "crepuscule"/);
  assert.equal(env.timers.length, 2, 'minuteur réarmé');
  assert.equal(env.timers[1].ms, 2 * 3600 * 1000, '17 h → 19 h');
});

test('ThemeService : au réveil, le moment est réévalué et le minuteur remplacé', () => {
  const { service, env } = themeSetup({ themeAuto: true });
  const local = page('file:///a.html');
  env.contents = [local];
  service.start();

  env.date = new Date(2026, 5, 15, 20);
  env.resumeListener();
  assert.match(local.scripts[0], /h\.dataset\.moment = "nuit"/);
  assert.equal(env.timers[0].cancelled, true);
  assert.equal(env.timers[1].ms, 10 * 3600 * 1000, '20 h → 6 h');
});

/** Cherche un jour de pluie et un jour sec en mai, d'après le tirage lui-même. */
function findMayDays() {
  const { isRainyDay } = require('../dist/src/shared/rainDay.js');
  const days = Array.from({ length: 28 }, (_, n) => new Date(2026, 4, n + 1, 12));
  return { rainy: days.find((d) => isRainyDay(d)), dry: days.find((d) => !isRainyDay(d)) };
}

test('ThemeService : data-weather suit le tirage de la saison pluvieuse', () => {
  const { service, env, setSeason } = themeSetup({ themeAuto: true });
  const { rainy, dry } = findMayDays();
  setSeason('printemps');

  env.date = rainy;
  assert.match(service.script, /h\.dataset\.weather = "pluie"/);
  env.date = dry;
  assert.match(service.script, /delete h\.dataset\.weather/);
});

test('ThemeService : jamais de pluie en hiver, à Noël ou en cerisier, ni si « Moments et météo » est coupé', () => {
  const { rainy } = findMayDays();

  for (const season of ['hiver', 'noel', 'cerisier']) {
    const { service, env, setSeason } = themeSetup({ themeAuto: true });
    setSeason(season);
    env.date = rainy;
    assert.match(service.script, /delete h\.dataset\.weather/, season);
  }

  const off = themeSetup({ themeAuto: true, momentsMeteo: false });
  off.setSeason('ete');
  off.env.date = rainy;
  assert.match(off.service.script, /delete h\.dataset\.weather/);
});

test('ThemeService : le ciel forcé impose saison, moment et pluie, même hors thème automatique', () => {
  const { service, env } = themeSetup({ theme: 'sombre' });
  env.contents = [page('file:///a.html')];

  service.setSkyOverride({ season: 'automne', moment: 'crepuscule', weather: 'pluie' });
  assert.match(service.script, /h\.dataset\.palette = "automne"/);
  assert.match(service.script, /h\.dataset\.moment = "crepuscule"/);
  assert.match(service.script, /h\.dataset\.weather = "pluie"/);
  assert.equal(env.contents[0].scripts.length, 1, 'diffusé aussitôt');
});

test('ThemeService : le ciel forcé garde le réel pour ce qui n\'est pas forcé, et annule avec null', () => {
  const { service, env } = themeSetup({ theme: 'sombre' });
  env.date = new Date(2026, 5, 15, 20);

  service.setSkyOverride({ season: 'ete', moment: null, weather: 'sec' });
  assert.match(service.script, /h\.dataset\.moment = "nuit"/, 'moment réel');
  assert.match(service.script, /h\.dataset\.palette = "ete-nuit"/);
  assert.match(service.script, /delete h\.dataset\.weather/);

  assert.equal(service.setSkyOverride(null), null);
  assert.match(service.script, /h\.dataset\.palette = ""/);
  assert.match(service.script, /delete h\.dataset\.moment/);
});

test('ThemeService : la pluie forcée est ignorée sur une saison sans pluie, et une valeur invalide n\'efface pas le thème', () => {
  const { service } = themeSetup({ theme: 'sombre' });
  service.setSkyOverride({ season: 'hiver', moment: 'jour', weather: 'pluie' });
  assert.match(service.script, /delete h\.dataset\.weather/);

  service.setSkyOverride({ season: 'pirate', moment: 'jour' });
  assert.match(service.script, /h\.dataset\.palette = ""/);
});

test('ThemeService : l\'été la nuit passe en palette sombre « ete-nuit »', () => {
  const { service, env, setSeason } = themeSetup({ themeAuto: true });
  setSeason('ete');
  env.date = new Date(2026, 6, 15, 22);
  assert.match(service.script, /h\.dataset\.theme = "dark"/);
  assert.match(service.script, /h\.dataset\.palette = "ete-nuit"/);
  assert.match(service.script, /h\.dataset\.fx = "on"/);

  env.date = new Date(2026, 6, 15, 12);
  assert.match(service.script, /h\.dataset\.palette = "ete"/);
});

// #endregion
