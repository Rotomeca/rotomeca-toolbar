const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWindowConfig } = require('../dist/src/main/windows/windowConfig.js');
const { WindowRegistry } = require('../dist/src/main/windows/WindowRegistry.js');
const { pickDisplay, describeDisplays } = require('../dist/src/main/windows/displays.js');
const { isTrustedSender } = require('../dist/src/main/ipc/trustedSender.js');

// #region buildWindowConfig

test('buildWindowConfig : valeurs par défaut, titre = nom', () => {
  const config = buildWindowConfig('settings');
  assert.equal(config.title, 'settings');
  assert.equal(config.width, 800);
  assert.equal(config.height, 600);
  assert.equal(config.show, true);
  assert.equal(config.frame, true);
  assert.equal(config.alwaysOnTop, false);
});

test('buildWindowConfig : les options données sont reprises', () => {
  const config = buildWindowConfig('tip', { title: 'T', width: 10, height: 20, x: 1, y: 2, show: false, frame: false, preload: '/p.js' });
  assert.deepEqual([config.title, config.width, config.height, config.x, config.y, config.show, config.frame], ['T', 10, 20, 1, 2, false, false]);
  assert.equal(config.webPreferences.preload, '/p.js');
});

test('buildWindowConfig : réglages de sécurité toujours imposés', () => {
  const config = buildWindowConfig('w', { preload: '/p.js' });
  assert.equal(config.webPreferences.nodeIntegration, false);
  assert.equal(config.webPreferences.contextIsolation, true);
  assert.equal(config.webPreferences.sandbox, true);
});

test('buildWindowConfig : `extra` ne peut pas affaiblir la sécurité', () => {
  const hostile = { webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false }, focusable: false };
  const config = buildWindowConfig('w', { extra: hostile });
  assert.equal(config.focusable, false);
  assert.equal(config.webPreferences.nodeIntegration, false);
  assert.equal(config.webPreferences.contextIsolation, true);
  assert.equal(config.webPreferences.sandbox, true);
});

test('buildWindowConfig : `extra` peut remplacer une option de fenêtre', () => {
  assert.equal(buildWindowConfig('w', { alwaysOnTop: false, extra: { alwaysOnTop: true } }).alwaysOnTop, true);
});

// #endregion

// #region WindowRegistry

const fakeWindow = () => {
  const win = { destroyed: false, closed: 0, isDestroyed: () => win.destroyed, close: () => { win.closed++; } };
  return win;
};

test('WindowRegistry : retrouve une fenêtre ajoutée', () => {
  const registry = new WindowRegistry();
  const win = fakeWindow();
  registry.add('a', win);
  assert.equal(registry.get('a'), win);
  assert.equal(registry.get('b'), undefined);
});

test('WindowRegistry : refuse un nom déjà pris', () => {
  const registry = new WindowRegistry();
  registry.add('a', fakeWindow());
  assert.throws(() => registry.add('a', fakeWindow()), /a/);
});

test('WindowRegistry : une fenêtre détruite est oubliée et son nom redevient libre', () => {
  const registry = new WindowRegistry();
  const old = fakeWindow();
  registry.add('a', old);
  old.destroyed = true;
  assert.equal(registry.get('a'), undefined);
  const fresh = fakeWindow();
  registry.add('a', fresh);
  assert.equal(registry.get('a'), fresh);
});

test('WindowRegistry : remove ferme la fenêtre puis l\'oublie', () => {
  const registry = new WindowRegistry();
  const win = fakeWindow();
  registry.add('a', win);
  registry.remove('a');
  assert.equal(win.closed, 1);
  assert.equal(registry.get('a'), undefined);
  registry.add('a', fakeWindow());
});

test('WindowRegistry : remove ne ferme pas une fenêtre déjà détruite ni un nom inconnu', () => {
  const registry = new WindowRegistry();
  const win = fakeWindow();
  win.destroyed = true;
  registry.add('a', fakeWindow());
  registry.remove('inconnu');
  registry.remove('a');
  assert.equal(win.closed, 0);
});

// #endregion

// #region displays

const display = (id, x, extra = {}) => ({ id, label: `Écran ${id}`, bounds: { x, y: 0 }, size: { width: 1920, height: 1080 }, scaleFactor: 1, ...extra });
const tr = (key, vars = {}) => `${key}${vars.n !== undefined ? `#${vars.n}` : ''}`;

test('pickDisplay : l\'écran choisi s\'il est branché, sinon le principal', () => {
  const [a, b] = [display(1, 0), display(2, 1920)];
  assert.equal(pickDisplay([a, b], 2, a), b);
  assert.equal(pickDisplay([a, b], 9, a), a);
  assert.equal(pickDisplay([a, b], null, a), a);
});

test('pickDisplay : un identifiant 0 est un identifiant valide', () => {
  const [a, b] = [display(5, 0), display(0, 1920)];
  assert.equal(pickDisplay([a, b], 0, a), b);
});

test('describeDisplays : numérotés de gauche à droite, le principal est signalé', () => {
  const infos = describeDisplays([display(2, 1920), display(1, 0)], 1, tr);
  assert.deepEqual(infos.map((i) => i.id), [1, 2]);
  assert.equal(infos[0].label, '1. Écran 1 - display.primary');
  assert.equal(infos[0].isPrimary, true);
  assert.equal(infos[1].label, '2. Écran 2');
});

test('describeDisplays : un nom manquant est remplacé par un nom par défaut numéroté', () => {
  const infos = describeDisplays([display(1, 0, { label: '  ' })], 9, tr);
  assert.equal(infos[0].label, '1. display.fallbackName#1');
});

test('describeDisplays : des écrans de même nom sont distingués par résolution et échelle', () => {
  const infos = describeDisplays([display(1, 0, { label: 'X' }), display(2, 1920, { label: 'X', scaleFactor: 1.5 })], 1, tr);
  assert.equal(infos[0].label, '1. X (1920x1080) - display.primary');
  assert.equal(infos[1].label, '2. X (1920x1080 @150%)');
});

// #endregion

// #region isTrustedSender

const origin = (url, same = true) => {
  const mainFrame = { url };
  return { senderFrame: same ? mainFrame : { url }, sender: { mainFrame } };
};

test('isTrustedSender : page principale locale acceptée', () => {
  assert.equal(isTrustedSender(origin('file:///app/index.html')), true);
});

test('isTrustedSender : sous-cadre refusé', () => {
  assert.equal(isTrustedSender(origin('file:///app/index.html', false)), false);
});

test('isTrustedSender : site distant refusé', () => {
  for (const url of ['https://exemple.fr', 'http://localhost', 'data:text/html,x', 'about:blank']) {
    assert.equal(isTrustedSender(origin(url)), false, url);
  }
});

test('isTrustedSender : sans cadre émetteur refusé', () => {
  assert.equal(isTrustedSender({ senderFrame: null, sender: { mainFrame: {} } }), false);
});

// #endregion
