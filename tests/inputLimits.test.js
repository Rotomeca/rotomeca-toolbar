const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { AppListService } = require('../dist/src/main/apps/AppListService.js');
const { parseContextMenuEvent } = require('../dist/src/main/contextmenu/contextMenuModel.js');
const { parseTooltipRequest } = require('../dist/src/main/tooltip/TooltipPopup.js');
const { sanitizeMediaState } = require('../dist/src/scripts/AppIndicators.js');

// Les modules partagés sont des modules ES : chargés par import()
const load = (file) => import(pathToFileURL(path.join(__dirname, '..', 'dist', file)).href);

// #region createRequestThrottle

test('createRequestThrottle : une seule demande par intervalle, la suivante passe une fois le délai écoulé', async () => {
  const { createRequestThrottle } = await load('src/shared/requestThrottle.js');
  let now = 1000;
  const allow = createRequestThrottle(500, () => now);

  assert.equal(allow(), true);
  now += 499;
  assert.equal(allow(), false);
  now += 1;
  assert.equal(allow(), true);
});

test('createRequestThrottle : chaque clé a son propre délai', async () => {
  const { createRequestThrottle } = await load('src/shared/requestThrottle.js');
  const allow = createRequestThrottle(500, () => 1000);

  assert.equal(allow(1), true);
  assert.equal(allow(2), true);
  assert.equal(allow(1), false);
});

// #endregion

// #region parseContextMenuEvent

const goodEvent = { target: { nodeName: 'BUTTON', attribs: { href: 'https://a.test/' }, classes: ['edit'] }, button: 2, x: 10, y: 20 };

test('parseContextMenuEvent : un clic droit bien formé est conservé', () => {
  assert.deepEqual(parseContextMenuEvent(goodEvent), goodEvent);
});

test('parseContextMenuEvent : une forme ou des nombres invalides sont refusés', () => {
  for (const raw of [
    null,
    42,
    {},
    { ...goodEvent, target: null },
    { ...goodEvent, target: { ...goodEvent.target, nodeName: 3 } },
    { ...goodEvent, x: NaN },
    { ...goodEvent, y: Infinity },
    { ...goodEvent, button: '2' },
  ]) {
    assert.equal(parseContextMenuEvent(raw), null, JSON.stringify(raw));
  }
});

test('parseContextMenuEvent : les attributs et classes qui ne sont pas du texte sont écartés', () => {
  const parsed = parseContextMenuEvent({ ...goodEvent, target: { nodeName: 'A', attribs: { href: 'x', bad: 1 }, classes: ['a', 2] } });
  assert.deepEqual(parsed.target, { nodeName: 'A', attribs: { href: 'x' }, classes: ['a'] });
});

// #endregion

// #region nombres et tailles venus des pages

test('parseTooltipRequest : une position non finie est refusée', () => {
  assert.equal(parseTooltipRequest({ text: 'a', y: NaN }), null);
  assert.equal(parseTooltipRequest({ text: 'a', y: Infinity }), null);
  assert.equal(parseTooltipRequest({ text: 'a', y: 12 }).centerY, 12);
});

test('sanitizeMediaState : un message trop gros est refusé avant tout décodage', () => {
  const huge = JSON.stringify({ title: 'x'.repeat(700000) });
  assert.equal(sanitizeMediaState(huge), null);
  assert.equal(sanitizeMediaState(JSON.stringify({ title: 'ok' })).title, 'ok');
});

// #endregion

// #region plafond de la liste

test('AppListService : au-delà de 500 éléments, un ajout est refusé', async () => {
  const full = Array.from({ length: 500 }, (_, i) => ({ name: `a${i}`, url: `https://a${i}.test/`, picture: null }));
  const service = new AppListService({
    repository: { loadAsync: async () => full, save: () => {} },
    toolbar: { appAdded() {}, appInserted() {}, appUpdated() {}, appDeleted() {}, separatorDeleted() {}, appMoved() {} },
    onSaveError() {},
  });
  await service.load();

  assert.equal(service.add({ name: 'x', url: 'https://nouveau.test/' }), false);
  assert.equal(service.addForEdit({ name: 'x', url: 'https://nouveau.test/' }), null);
  assert.equal(service.add({ name: 'x', url: 'https://a0.test/' }), true, 'déjà présente : toujours acceptée');
});

// #endregion
