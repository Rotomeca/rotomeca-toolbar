const test = require('node:test');
const assert = require('node:assert/strict');
const { buildContextMenu } = require('../dist/src/main/contextmenu/contextMenuModel.js');
const { ContextMenuController } = require('../dist/src/main/contextmenu/ContextMenuController.js');

const translate = (key, vars = {}) => (vars.name ? `${key}(${vars.name})` : key);
const app = (url, picture = null) => ({ name: url, url, picture });
const S = 'separator';
const click = (href, classes = [], nodeName = 'ROTOMECA-TOOLBAR-BUTTON') => ({
  target: { nodeName, attribs: { href, title: `T-${href}` }, classes },
  button: 2, x: 5, y: 6,
});
const build = (event, saves, muted = () => false) => buildContextMenu(event, { saves, isMuted: muted, translate });
const actions = (items) => items.map((item) => item.action);

// #region menu normal

test('menu normal : supprimer, couper le son, modifier', () => {
  const items = build(click('a'), [app('a', 'font:x')]);
  assert.deepEqual(actions(items), ['delete', 'toggleMute', 'edit']);
  assert.equal(items[0].title, 'contextMenu.deleteTitle(T-a)');
  assert.deepEqual({ ...items[2].data }, { url: 'a', title: 'T-a', picture: 'font:x' });
});

test('menu normal : le bouton de son suit l\'état muet', () => {
  assert.equal(build(click('a'), [app('a')])[1].text, 'contextMenu.mute');
  assert.equal(build(click('a'), [app('a')], (url) => url === 'a')[1].text, 'contextMenu.unmute');
});

test('menu normal : l\'image d\'une application inconnue est absente', () => {
  assert.equal(build(click('z'), [app('a')])[2].data.picture, undefined);
});

// #endregion

// #region menu d'édition

const edit = (href, saves) => build(click(href, ['edit']), saves);
const disabled = (items) => Object.fromEntries(items.map((i) => [i.action, !!i.disabled]));

test('menu d\'édition : supprimer, séparateur, monter, descendre', () => {
  assert.deepEqual(actions(edit('b', [app('a'), app('b'), app('c')])), ['delete', 'addseparator', 'goUp', 'goDown']);
});

test('menu d\'édition : première application, on ne peut pas monter', () => {
  const state = disabled(edit('a', [app('a'), app('b')]));
  assert.equal(state.goUp, true);
  assert.equal(state.goDown, false);
});

test('menu d\'édition : dernière application, on ne peut pas descendre', () => {
  const state = disabled(edit('b', [app('a'), app('b')]));
  assert.equal(state.goDown, true);
  assert.equal(state.goUp, false);
});

test('menu d\'édition : un séparateur suit déjà, pas un deuxième', () => {
  assert.equal(disabled(edit('a', [app('a'), S, app('b')])).addseparator, true);
  assert.equal(disabled(edit('a', [app('a'), app('b')])).addseparator, false);
});

test('menu d\'édition : seul sur la barre, on ne peut pas monter', () => {
  assert.equal(disabled(edit('a', [S, app('a'), S])).goUp, true);
});

test('menu d\'édition : avant un séparateur final, on ne peut pas descendre', () => {
  assert.equal(disabled(edit('b', [app('a'), app('b'), S])).goDown, true);
});

test('menu d\'édition : application inconnue, aucun bouton', () => {
  assert.deepEqual(edit('z', [app('a')]), []);
});

// #endregion

// #region ContextMenuController

const controller = (overrides = {}) => new ContextMenuController({ isToolbarWindow: (id) => id === 7, isMuted: () => false, translate, ...overrides });

test('ContextMenuController : ne s\'affiche que sur un bouton de la barre', () => {
  const c = controller();
  assert.equal(c.shouldShow(click('a'), 7), true);
  assert.equal(c.shouldShow(click('a', [], 'DIV'), 7), false);
  assert.equal(c.shouldShow(click('a'), 8), false);
});

test('ContextMenuController : le menu suit les boutons enregistrés', () => {
  const c = controller();
  assert.deepEqual(actions(c.menu(click('a', ['edit']))), [], 'rien de connu au départ');
  c.updateSaves([app('a'), app('b')]);
  assert.deepEqual(actions(c.menu(click('a', ['edit']))), ['delete', 'addseparator', 'goUp', 'goDown']);
});

test('ContextMenuController : une valeur qui n\'est pas une liste vide les boutons', () => {
  const c = controller();
  c.updateSaves([app('a')]);
  for (const bad of [{}, null, 'x', undefined]) {
    c.updateSaves(bad);
    assert.deepEqual(c.menu(click('a', ['edit'])), []);
  }
});

test('ContextMenuController : l\'état muet est lu à chaque ouverture', () => {
  let muted = false;
  const c = controller({ isMuted: () => muted });
  c.updateSaves([app('a')]);
  assert.equal(c.menu(click('a'))[1].text, 'contextMenu.mute');
  muted = true;
  assert.equal(c.menu(click('a'))[1].text, 'contextMenu.unmute');
});

// #endregion

test('buildAppsWindowMenu : une entrée « réinitialiser la taille » qui lance l\'action', () => {
  const { buildAppsWindowMenu } = require('../dist/src/main/contextmenu/contextMenuModel.js');
  let resets = 0;

  const entries = buildAppsWindowMenu((key) => `t:${key}`, { resetSize: () => ++resets });

  assert.deepEqual(entries.map((entry) => entry.label), ['t:apps.resetSize']);
  entries[0].click();
  assert.equal(resets, 1);
});
