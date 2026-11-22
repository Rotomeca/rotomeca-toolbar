const test = require('node:test');
const assert = require('node:assert/strict');
const { ToolbarController } = require('../dist/src/main/toolbar/ToolbarController.js');

function fakeWindow(name, log) {
  const win = {
    name, visible: false, alwaysOnTop: true, bounds: { x: 0, y: 0, width: 10, height: 10 }, destroyed: false, scripts: [], messages: [], listeners: {},
    isDestroyed: () => win.destroyed,
    isVisible: () => win.visible,
    show: () => { win.visible = true; log.push(`${name}:show`); },
    showInactive: () => { win.visible = true; log.push(`${name}:showInactive`); },
    hide: () => { win.visible = false; log.push(`${name}:hide`); },
    focus: () => log.push(`${name}:focus`),
    blur: () => log.push(`${name}:blur`),
    setAlwaysOnTop: (v) => { win.alwaysOnTop = v; log.push(`${name}:onTop=${v}`); },
    isAlwaysOnTop: () => win.alwaysOnTop,
    getBounds: () => win.bounds,
    setBounds: (b) => { win.bounds = b; log.push(`${name}:setBounds`); },
    webContents: {
      executeJavaScript: (s) => { win.scripts.push(s); return Promise.resolve(); },
      addListener: (event, listener) => { win.listeners[event] = listener; },
    },
  };
  return win;
}

function setup({ button = true, appBar = false, autoHide = false, supported = true } = {}) {
  const log = [];
  const settings = { isButtonModeEnabled: button, appBarEnabled: appBar, appBarAutoHide: autoHide };
  const created = {};
  const make = (name) => (created[name] ??= fakeWindow(name, log));
  const removed = [];
  const windows = {
    get main() { return make('main'); },
    get toolbar() { return make('toolbar'); },
    get edge() { return make('edge'); },
    get apps() { return make('apps'); },
    getBrowser: (name) => created[name],
    get: (name) => created[name],
    remove: (name) => { removed.push(name); delete created[name]; },
    visibleBounds: (names) => names.map((n) => created[n]).filter((w) => w?.visible).map((w) => w.bounds),
  };
  const timers = {
    now: () => timers.time, time: 0, intervals: [], timeouts: [],
    setInterval: (cb, ms) => { const h = { cb, ms }; timers.intervals.push(h); return h; },
    clearInterval: (h) => { timers.intervals = timers.intervals.filter((i) => i !== h); },
    setTimeout: (cb, ms) => { const h = { cb, ms }; timers.timeouts.push(h); return h; },
    clearTimeout: (h) => { timers.timeouts = timers.timeouts.filter((t) => t !== h); },
  };
  const cursor = { x: 5, y: 5 };
  const appBarCalls = [];
  const fakeAppBar = {
    registered: false,
    register: () => { fakeAppBar.registered = true; appBarCalls.push('register'); return true; },
    unregister: () => { fakeAppBar.registered = false; appBarCalls.push('unregister'); },
    setPos: (r) => { appBarCalls.push(['setPos', r.width]); return { ...r }; },
  };
  const messages = { closed: 0, button: 0 };
  const controller = new ToolbarController({
    windows, settings, timers,
    displays: {
      bounds: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
      workArea: () => ({ x: 0, y: 0, width: 1920, height: 1040 }),
      scaleFactorAt: () => 1,
      cursor: () => cursor,
    },
    appBarSupported: () => supported,
    createAppBar: () => fakeAppBar,
    messages: { appsClosed: () => { messages.closed++; }, buttonClosed: () => { messages.button++; } },
    hidePopups: () => log.push('popups:hide'),
    onToolbarPageReady: async () => { log.push('pageReady'); },
  });
  return { controller, windows, created, timers, log, cursor, appBarCalls, messages, settings, removed, fakeAppBar };
}

// #region mode bouton

test('mode bouton : toggle déplie la barre et la montre au-dessus des autres fenêtres', async () => {
  const { controller, created } = setup();
  await controller.toggle();
  assert.equal(controller.isOpen, true);
  assert.equal(created.toolbar.visible, true);
  assert.equal(created.main.alwaysOnTop, true);
});

test('mode bouton : un second toggle replie la barre, ferme les fenêtres et prévient la page', async () => {
  const { controller, created, messages, log } = setup();
  await controller.toggle();
  await controller.toggle();
  assert.equal(controller.isOpen, false);
  assert.equal(created.toolbar.visible, false);
  assert.equal(created.apps.visible, false);
  assert.equal(messages.closed, 1);
  assert.ok(log.includes('popups:hide'));
});

test('mode bouton : la page de la barre charge les applications une seule fois', async () => {
  const { controller, created, log } = setup();
  await controller.toggle();
  created.toolbar.listeners['dom-ready']();
  created.toolbar.listeners['dom-ready']();
  await Promise.resolve();
  assert.equal(log.filter((l) => l === 'pageReady').length, 1);
});

test('mode bouton : toggleFromOutside passe par le bouton et donne le focus à la barre à l\'ouverture', () => {
  const { controller, messages, log } = setup();
  controller.toggleFromOutside();
  assert.equal(messages.button, 1);
  assert.ok(log.includes('toolbar:focus'));
});

// #endregion

// #region mode souris

test('mode souris : au démarrage, la zone de bord est affichée ; ouverte, elle est cachée', async () => {
  const { controller, created } = setup({ button: false });
  controller.start();
  assert.equal(created.edge.visible, true);
  await controller.toggle();
  assert.equal(created.edge.visible, false);
  await controller.toggle();
  assert.equal(created.edge.visible, true);
});

test('mode souris : l\'entrée dans la zone de bord ouvre la barre, une seule fois', async () => {
  const { controller } = setup({ button: false });
  controller.onEdgeEntered();
  assert.equal(controller.isOpen, true);
  controller.onEdgeEntered();
  assert.equal(controller.isOpen, true);
});

test('mode bouton : la zone de bord n\'ouvre pas la barre', () => {
  const { controller } = setup({ button: true });
  controller.onEdgeEntered();
  assert.equal(controller.isOpen, false);
});

test('toggleFromOutside en mode souris bascule directement la barre', () => {
  const { controller } = setup({ button: false });
  controller.toggleFromOutside();
  assert.equal(controller.isOpen, true);
});

// #endregion

// #region barre ancrée

test('barre ancrée : au démarrage, enregistrée auprès du système et dépliée', async () => {
  const { controller, appBarCalls, created } = setup({ appBar: true });
  controller.start();
  await Promise.resolve();
  assert.ok(appBarCalls.includes('register'));
  assert.equal(controller.isOpen, true);
  assert.equal(created.toolbar.visible, true);
});

test('barre ancrée : repliée, elle devient un rail de 24 px qui garde sa place', async () => {
  const { controller, appBarCalls, created } = setup({ appBar: true });
  controller.start();
  await Promise.resolve();
  await controller.toggle();
  assert.equal(controller.isOpen, false);
  assert.equal(controller.dockedWidth, 24);
  assert.deepEqual(appBarCalls.filter((c) => Array.isArray(c)).at(-1), ['setPos', 24]);
  assert.equal(created.toolbar.visible, true, 'le rail reste affiché');
});

test('barre ancrée : la largeur dépliée est celle de la barre', async () => {
  const { controller } = setup({ appBar: true });
  controller.start();
  await Promise.resolve();
  assert.equal(controller.dockedWidth, 72);
});

test('barre ancrée non prise en charge : retombe sur le mode bouton', () => {
  const { controller } = setup({ appBar: true, supported: false });
  assert.equal(controller.mode.appBar, false);
  assert.equal(controller.mode.button, true);
});

test('detachAppBar libère l\'espace réservé', async () => {
  const { controller, appBarCalls } = setup({ appBar: true });
  controller.start();
  await Promise.resolve();
  controller.detachAppBar();
  assert.ok(appBarCalls.includes('unregister'));
});

// #endregion

// #region masquage automatique

test('masquage automatique : la barre se replie après 700 ms hors de l\'interface', async () => {
  const { controller, timers, cursor } = setup({ appBar: true, autoHide: true });
  controller.start();
  await controller.toggle();
  assert.equal(controller.isOpen, true);
  const tick = timers.intervals[0];
  assert.equal(tick.ms, 150);

  cursor.x = 5000;
  timers.time = 1000;
  tick.cb();
  assert.equal(controller.isOpen, true);
  timers.time = 1699;
  tick.cb();
  assert.equal(controller.isOpen, true);
  timers.time = 1700;
  tick.cb();
  await Promise.resolve();
  assert.equal(controller.isOpen, false);
});

test('masquage automatique : la souris dans la barre empêche le repli', async () => {
  const { controller, timers, cursor, created } = setup({ appBar: true, autoHide: true });
  controller.start();
  await controller.toggle();
  created.toolbar.bounds = { x: 0, y: 0, width: 72, height: 1000 };
  created.toolbar.visible = true;
  cursor.x = 10;
  cursor.y = 10;
  for (const t of [0, 800, 1600, 2400]) { timers.time = t; timers.intervals[0].cb(); }
  assert.equal(controller.isOpen, true);
});

test('masquage automatique : replier arrête la surveillance', async () => {
  const { controller, timers } = setup({ appBar: true, autoHide: true });
  controller.start();
  await controller.toggle();
  await controller.toggle();
  assert.equal(timers.intervals.length, 0);
});

// #endregion

// #region changement de mode, « toujours au-dessus »

test('rebuildForModeChange : détruit la barre et le bouton, remet l\'état à zéro', async () => {
  const { controller, removed } = setup();
  await controller.toggle();
  controller.rebuildForModeChange();
  assert.deepEqual(removed.slice(0, 2), ['toolbar', 'main']);
  assert.equal(controller.isOpen, false);
});

test('rebuildForModeChange : en mode bouton, le bouton est réaffiché', () => {
  const { controller, created } = setup();
  controller.rebuildForModeChange();
  assert.equal(created.main.visible, true);
});

test('suspendAlwaysOnTop : le bouton passe sous les fenêtres 10 s puis revient', () => {
  const { controller, created, timers } = setup();
  controller.suspendAlwaysOnTop();
  assert.equal(created.main.alwaysOnTop, false);
  assert.equal(timers.timeouts[0].ms, 10000);
  timers.timeouts[0].cb();
  assert.equal(created.main.alwaysOnTop, true);
});

test('suspendAlwaysOnTop et toggleAlwaysOnTop sont sans effet barre ouverte', async () => {
  const { controller, created } = setup();
  await controller.toggle();
  controller.suspendAlwaysOnTop();
  controller.toggleAlwaysOnTop();
  assert.equal(created.main.alwaysOnTop, true);
});

test('toggleAlwaysOnTop : bascule et annule le retour automatique', () => {
  const { controller, created, timers } = setup();
  controller.suspendAlwaysOnTop();
  controller.toggleAlwaysOnTop();
  assert.equal(created.main.alwaysOnTop, true);
  assert.equal(timers.timeouts.length, 0);
});

// #endregion

// #region disposition

test('repositionWindows : replace les fenêtres existantes sur la disposition courante', async () => {
  const { controller, created } = setup();
  await controller.toggle();
  controller.repositionWindows();
  assert.deepEqual(created.toolbar.bounds, controller.layout.toolbar);
  assert.deepEqual(created.main.bounds, controller.layout.main);
});

test('syncToolbarClasses : la page sait si la barre est réduite au rail', async () => {
  const { controller, created } = setup({ appBar: true });
  controller.start();
  await Promise.resolve();
  controller.syncToolbarClasses();
  assert.match(created.toolbar.scripts.at(-1), /toggle\('rail', false\)/);
  await controller.toggle();
  assert.match(created.toolbar.scripts.at(-1), /toggle\('rail', true\)/);
});

// #endregion
