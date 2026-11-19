const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const specs = require('../dist/src/main/windows/windowSpecs.js');
const { buildWindowConfig } = require('../dist/src/main/windows/windowConfig.js');

const layout = {
  main: { x: 10, y: 900, width: 64, height: 32 },
  toolbar: { x: 0, y: 0, width: 72, height: 1040 },
  apps: { x: 82, y: 10, width: 480, height: 1020 },
  addDialog: { x: 82, y: 0, width: 640, height: 760 },
  edge: { x: 0, y: 0, width: 4, height: 1080 },
};
const context = {
  appRoot: path.join('/app', 'dist'), preload: '/app/dist/preload.js', appIcon: '/app/icon.png', layout,
  translate: (key) => `t:${key}`,
};
const all = {
  main: specs.mainWindowSpec(context),
  toolbar: specs.toolbarWindowSpec(context),
  media: specs.mediaWindowSpec(context),
  tooltip: specs.tooltipWindowSpec(context),
  addDialog: specs.addDialogWindowSpec(context),
  edge: specs.edgeWindowSpec(context),
  settings: specs.settingsWindowSpec(context),
};

test('toutes les fenêtres utilisent le preload de l\'application', () => {
  for (const [name, spec] of Object.entries(all)) assert.equal(spec.preload, context.preload, name);
});

test('les pages chargées sont des fichiers HTML locaux de l\'application', () => {
  for (const [name, spec] of Object.entries(all)) {
    if (name === 'addDialog') { assert.equal(spec.file, undefined); continue; }
    assert.ok(spec.file.startsWith(context.appRoot), name);
    assert.ok(spec.file.endsWith('.html'), name);
  }
});

test('chaque fenêtre garde des réglages de sécurité imposés une fois construite', () => {
  for (const [name, spec] of Object.entries(all)) {
    const { webPreferences } = buildWindowConfig(name, spec);
    assert.deepEqual(
      [webPreferences.nodeIntegration, webPreferences.contextIsolation, webPreferences.sandbox],
      [false, true, true], name,
    );
  }
});

test('le bouton, la barre et les popups sont des surfaces transparentes au-dessus des autres fenêtres', () => {
  for (const name of ['main', 'toolbar', 'media', 'tooltip', 'edge']) {
    const spec = all[name];
    assert.deepEqual([spec.alwaysOnTop, spec.frame, spec.transparent, spec.skipTaskbar, spec.resizable], [true, false, true, true, false], name);
  }
});

test('les popups et la zone de bord ne prennent jamais le focus et démarrent cachés', () => {
  for (const name of ['media', 'tooltip', 'edge']) {
    assert.equal(all[name].extra.focusable, false, name);
    assert.equal(all[name].show, false, name);
  }
  assert.equal(all.edge.extra.hasShadow, false);
});

test('le bouton principal est affiché dès sa création, la barre non', () => {
  assert.equal(all.main.show, undefined);
  assert.equal(all.toolbar.show, false);
});

test('la barre, le bouton et la zone de bord suivent la disposition', () => {
  assert.deepEqual([all.main.x, all.main.y, all.main.width, all.main.height], [10, 900, 64, 32]);
  assert.deepEqual([all.toolbar.x, all.toolbar.width, all.toolbar.height], [0, 72, 1040]);
  assert.deepEqual([all.edge.x, all.edge.width, all.edge.height], [0, 4, 1080]);
  assert.deepEqual([all.addDialog.x, all.addDialog.width, all.addDialog.height], [82, 640, 760]);
});

test('les popups ont la taille de leur contenu', () => {
  assert.deepEqual([all.media.width, all.media.height], [specs.MEDIA_POPUP_WIDTH, specs.MEDIA_POPUP_HEIGHT]);
  assert.deepEqual([all.tooltip.width, all.tooltip.height], [specs.TOOLTIP_WIDTH, specs.TOOLTIP_HEIGHT]);
});

test('les fenêtres à titre utilisent les textes traduits et l\'icône de l\'application', () => {
  assert.equal(all.addDialog.title, 't:window.add');
  assert.equal(all.settings.title, 't:window.settings');
  assert.equal(all.addDialog.icon, context.appIcon);
  assert.equal(all.settings.icon, context.appIcon);
});

test('la fenêtre d\'ajout est un cadre normal, pas transparent', () => {
  assert.deepEqual([all.addDialog.frame, all.addDialog.transparent, all.addDialog.skipTaskbar, all.addDialog.minimizable, all.addDialog.maximizable], [true, false, false, true, false]);
});

test('les réglages ne contiennent rien de propre à macOS', () => {
  for (const spec of Object.values(all)) assert.equal(spec.extra?.vibrancy, undefined);
});

test('appsChildBounds : l\'en-tête occupe le haut, les sites le reste', () => {
  const size = { width: 480, height: 600 };
  assert.deepEqual(specs.appsChildBounds(0, size), { x: 0, y: 0, width: 480, height: specs.APPS_HEADER_HEIGHT });
  assert.deepEqual(specs.appsChildBounds(1, size), { x: 0, y: specs.APPS_HEADER_HEIGHT, width: 480, height: 600 - specs.APPS_HEADER_HEIGHT });
  assert.deepEqual(specs.appsChildBounds(3, size), specs.appsChildBounds(1, size));
});

test('appsChildBounds : une fenêtre plus basse que l\'en-tête ne donne pas de hauteur négative', () => {
  assert.equal(specs.appsChildBounds(1, { width: 100, height: 5 }).height, 0);
});
