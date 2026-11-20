const test = require('node:test');
const assert = require('node:assert/strict');
const { TrayService } = require('../dist/src/main/tray/TrayService.js');

const translate = (key, vars = {}) => (vars.version !== undefined ? `${key}(${vars.version})` : key);

function setup({ info = null, debug = false } = {}) {
  const log = { created: [], tooltips: [], images: [], menus: [], popups: [], clicks: [], actions: [] };
  const state = { info, destroyed: false };
  const tray = {
    setImage: (i) => log.images.push(i),
    setToolTip: (t) => log.tooltips.push(t),
    setContextMenu: (m) => log.menus.push(m),
    popUpContextMenu: (m) => log.popups.push(m),
    isDestroyed: () => state.destroyed,
    on: (event, listener) => log.clicks.push([event, listener]),
  };
  const service = new TrayService({
    createTray: (icon) => { log.created.push(icon); return tray; },
    iconFor: (level) => `icon:${level}`,
    buildMenu: (template) => ({ template }),
    updateInfo: () => state.info,
    translate,
    shortcut: 'Ctrl+Alt+B',
    actions: {
      toggleToolbar: () => log.actions.push('toggle'),
      openSettings: () => log.actions.push('settings'),
      quit: () => log.actions.push('quit'),
    },
    debugWindows: debug ? () => [{ label: 'Fenêtre', click: () => {} }] : undefined,
  });
  return { service, log, state };
}

const info = (overrides) => ({ prerelease: false, versionActuelle: '3.4.1', versionDisponible: null, level: null, ...overrides });

test('start : crée l\'icône normale avec l\'infobulle de base', () => {
  const { service, log } = setup();
  service.start();
  assert.deepEqual(log.created, ['icon:null']);
  assert.deepEqual(log.tooltips, ['tray.tooltip']);
});

test('start : une mise à jour prête change l\'icône et l\'infobulle', () => {
  const { service, log } = setup({ info: info({ level: 'ready', versionDisponible: '3.5.0' }) });
  service.start();
  assert.deepEqual(log.created, ['icon:ready']);
  assert.equal(log.tooltips[0], 'tray.tooltip\ntray.updateReady(3.5.0)');
});

test('start : le menu propose afficher, paramètres et quitter, dans cet ordre', () => {
  const { service, log } = setup();
  service.start();
  const { template } = log.menus[0];
  assert.deepEqual(template.map((item) => item.label), ['tray.toggle', 'tray.settings', 'tray.quit']);
  assert.equal(template[0].accelerator, 'Ctrl+Alt+B');
  assert.equal(template[0].registerAccelerator, false);
  template.forEach((item) => item.click());
  assert.deepEqual(log.actions, ['toggle', 'settings', 'quit']);
});

test('start : le clic sur l\'icône affiche ou cache la barre', () => {
  const { service, log } = setup();
  service.start();
  const [event, listener] = log.clicks[0];
  assert.equal(event, 'click');
  listener();
  assert.deepEqual(log.actions, ['toggle']);
});

test('start : en développement, une entrée de débogage ouvre le menu des fenêtres', () => {
  const { service, log } = setup({ debug: true });
  service.start();
  const { template } = log.menus[0];
  assert.equal(template[0].label, 'tray.debugConsole');
  template[0].click();
  assert.equal(log.popups.length, 1);
  assert.equal(log.popups[0].template[0].label, 'Fenêtre');
});

test('start : sans débogage, pas d\'entrée de débogage', () => {
  const { service, log } = setup();
  service.start();
  assert.equal(log.menus[0].template.length, 3);
});

test('refresh : l\'icône et l\'infobulle suivent la mise à jour', () => {
  const { service, log, state } = setup();
  service.start();
  state.info = info({ level: 'pending', versionDisponible: '3.5.0' });
  service.refresh();
  assert.equal(log.images.at(-1), 'icon:pending');
  assert.equal(log.tooltips.at(-1), 'tray.tooltip\ntray.updateAvailable(3.5.0)');
});

test('showTooltip : remplace le texte de base en gardant l\'état de la mise à jour', () => {
  const { service, log } = setup({ info: info({ prerelease: true, versionActuelle: '3.5.0-rc1' }) });
  service.start();
  service.showTooltip('▶ Morceau');
  assert.equal(log.tooltips.at(-1), '▶ Morceau\ntray.prerelease(3.5.0-rc1)');
});

test('refresh et showTooltip avant start ou après destruction ne font rien', () => {
  const { service, log, state } = setup();
  service.refresh();
  service.showTooltip('x');
  assert.deepEqual(log.tooltips, []);
  service.start();
  const count = log.tooltips.length;
  state.destroyed = true;
  service.refresh();
  service.showTooltip('y');
  assert.equal(log.tooltips.length, count);
  assert.deepEqual(log.images, []);
});
