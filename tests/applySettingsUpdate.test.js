const test = require('node:test');
const assert = require('node:assert/strict');
const { Settings } = require('../dist/src/main/settings/Settings.js');
const { applySettingsUpdate } = require('../dist/src/main/settings/applySettingsUpdate.js');

function setup(initial = {}) {
  const store = { path: 'p', saved: [], load: () => initial, save: (data) => store.saved.push(data) };
  return { settings: new Settings(store, () => 'hiver'), store };
}

const form = (overrides) => ({
  theme: 'clair', themeAuto: false, effetsSaison: true, densiteEffets: 'normale',
  isButtonModeEnabled: true, appBarEnabled: false, appBarAutoHide: false, displayId: null, ...overrides,
});

test('applySettingsUpdate : enregistre les réglages reçus', () => {
  const { settings, store } = setup();
  applySettingsUpdate(settings, form({ theme: 'rouge', themeAuto: true, densiteEffets: 'abondante', displayId: 4 }));
  assert.equal(settings.theme, 'rouge');
  assert.equal(settings.themeAuto, true);
  assert.equal(settings.densiteEffets, 'abondante');
  assert.equal(settings.displayId, 4);
  assert.equal(store.saved.length, 1);
  assert.equal(store.saved[0].theme, 'rouge');
});

test('applySettingsUpdate : rien ne change, rien à signaler', () => {
  const { settings } = setup();
  assert.deepEqual({ ...applySettingsUpdate(settings, form({})) }, { displayModeChanged: false, screenChanged: false });
});

test('applySettingsUpdate : un changement de thème ne touche pas au mode d\'affichage', () => {
  const { settings } = setup();
  assert.equal(applySettingsUpdate(settings, form({ theme: 'noir' })).displayModeChanged, false);
});

test('applySettingsUpdate : mode bouton, barre ancrée ou masquage automatique changent le mode d\'affichage', () => {
  for (const change of [{ isButtonModeEnabled: false }, { appBarEnabled: true }, { appBarAutoHide: true }]) {
    const { settings } = setup();
    assert.equal(applySettingsUpdate(settings, form(change)).displayModeChanged, true, JSON.stringify(change));
  }
});

test('applySettingsUpdate : un autre écran est signalé', () => {
  const { settings } = setup({ displayId: 1 });
  assert.equal(applySettingsUpdate(settings, form({ displayId: 2 })).screenChanged, true);
  assert.equal(applySettingsUpdate(settings, form({ displayId: 2 })).screenChanged, false);
});

test('applySettingsUpdate : seul `true` active un mode (pas de conversion des chaînes)', () => {
  const { settings } = setup();
  applySettingsUpdate(settings, form({ appBarEnabled: 'true', appBarAutoHide: 1, themeAuto: 'oui' }));
  assert.equal(settings.appBarEnabled, false);
  assert.equal(settings.appBarAutoHide, false);
  assert.equal(settings.themeAuto, false);
});

test('applySettingsUpdate : valeurs invalides corrigées par les réglages', () => {
  const { settings } = setup();
  applySettingsUpdate(settings, form({ theme: '<script>', densiteEffets: 'énorme', displayId: '3' }));
  assert.equal(settings.theme, 'system');
  assert.equal(settings.densiteEffets, 'normale');
  assert.equal(settings.displayId, null);
});

test('applySettingsUpdate : une donnée qui n\'est pas un objet est refusée sans rien enregistrer', () => {
  for (const bad of [undefined, null, 'x', 12, true]) {
    const { settings, store } = setup();
    assert.equal(applySettingsUpdate(settings, bad), null);
    assert.equal(store.saved.length, 0);
  }
});
